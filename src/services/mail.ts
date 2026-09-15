import type { AuthedUser } from "../types";
import { SENSITIVE_CATEGORIES } from "../types";

export type MailStatus = "all" | "extracted" | "unprocessed";
export interface MailQueryOpts { toAddr?: string; service?: string; sinceMs?: number; limit?: number; offset?: number; status?: MailStatus; }
export interface MailRow { id: string; messageId: string | null; fromOrg: string | null; fromAddr: string | null; toAddr: string | null; topic: string | null; code: string | null; category: string | null; createdAt: string | null; subject: string | null; status: "extracted" | "unprocessed"; }
interface GrantRow { address_pattern: string; allowed_categories: string; allow_sensitive: number; }
interface FilterResult { clause: string; binds: unknown[]; empty: boolean; }

async function buildPermissionFilter(db: D1Database, user: AuthedUser): Promise<FilterResult> {
  if (user.role === "admin") return { clause: "1 = 1", binds: [], empty: false };
  const { results } = await db.prepare("SELECT address_pattern, allowed_categories, allow_sensitive FROM grants WHERE user_id = ?").bind(user.id).all<GrantRow>();
  const clauses: string[] = []; const binds: unknown[] = [];
  for (const g of results ?? []) {
    let cats: string[]; try { cats = JSON.parse(g.allowed_categories); } catch { continue; }
    if (!g.allow_sensitive) cats = cats.filter(c => !SENSITIVE_CATEGORIES.includes(c));
    cats = cats.filter(c => c !== "legacy"); if (!cats.length) continue;
    clauses.push(`(c.to_addr GLOB ? AND c.category IN (${cats.map(() => "?").join(", ")}))`); binds.push(g.address_pattern, ...cats);
  }
  return clauses.length ? { clause: `(${clauses.join(" OR ")})`, binds, empty: false } : { clause: "0 = 1", binds: [], empty: true };
}

function extractedWhere(perm: FilterResult, opts: MailQueryOpts): { sql: string; binds: unknown[] } {
  const where = [perm.clause]; const binds = [...perm.binds];
  if (opts.toAddr) { where.push("c.to_addr = ?"); binds.push(opts.toAddr); }
  if (opts.service) { where.push("(c.from_org LIKE ? OR c.from_addr LIKE ? OR r.subject LIKE ?)"); const q=`%${opts.service}%`; binds.push(q,q,q); }
  if (opts.sinceMs) { where.push("c.created_at >= datetime(?, 'unixepoch')"); binds.push(Math.floor(opts.sinceMs/1000)); }
  return { sql: where.join(" AND "), binds };
}
function rawWhere(opts: MailQueryOpts): { sql: string; binds: unknown[] } {
  const where=["r.processing_state = 'unprocessed'"]; const binds: unknown[]=[];
  if (opts.toAddr) { where.push("r.to_addr = ?"); binds.push(opts.toAddr); }
  if (opts.service) { where.push("(r.from_addr LIKE ? OR r.subject LIKE ?)"); const q=`%${opts.service}%`; binds.push(q,q); }
  if (opts.sinceMs) { where.push("r.created_at >= datetime(?, 'unixepoch')"); binds.push(Math.floor(opts.sinceMs/1000)); }
  return { sql: where.join(" AND "), binds };
}

export async function visibleMails(db: D1Database, user: AuthedUser, opts: MailQueryOpts = {}): Promise<{total:number;items:MailRow[]}> {
  const status: MailStatus = user.role === "admin" ? (opts.status ?? "all") : "extracted";
  const perm=await buildPermissionFilter(db,user); if (user.role !== "admin" && perm.empty) return {total:0,items:[]};
  const ex=extractedWhere(perm,opts); const raw=rawWhere(opts); const parts:string[]=[]; const binds:unknown[]=[];
  if (status !== "unprocessed") { parts.push(`SELECT 'c:' || c.id AS id,c.message_id AS messageId,c.from_org AS fromOrg,c.from_addr AS fromAddr,c.to_addr AS toAddr,c.topic,c.code,c.category,c.created_at AS createdAt,r.subject,'extracted' AS status FROM code_mails c LEFT JOIN raw_mails r ON r.message_id=c.message_id WHERE ${ex.sql}`); binds.push(...ex.binds); }
  if (user.role === "admin" && status !== "extracted") { parts.push(`SELECT 'r:' || r.id AS id,r.message_id AS messageId,NULL AS fromOrg,r.from_addr AS fromAddr,r.to_addr AS toAddr,NULL AS topic,NULL AS code,NULL AS category,r.created_at AS createdAt,r.subject,'unprocessed' AS status FROM raw_mails r WHERE ${raw.sql}`); binds.push(...raw.binds); }
  if (!parts.length) return {total:0,items:[]};
  const union=parts.join(" UNION ALL "); const count=await db.prepare(`SELECT COUNT(*) AS total FROM (${union})`).bind(...binds).first<{total:number}>();
  const limit=Math.min(100,Math.max(1,opts.limit??20)); const offset=Math.max(0,opts.offset??0);
  const {results}=await db.prepare(`SELECT * FROM (${union}) ORDER BY createdAt DESC LIMIT ? OFFSET ?`).bind(...binds,limit,offset).all<MailRow>();
  return {total:Number(count?.total??0),items:results??[]};
}

export async function visibleMailById(db:D1Database,user:AuthedUser,id:string):Promise<(MailRow&{raw:string|null})|null>{
  if (id.startsWith("r:")) {
    if(user.role!=="admin") return null; const rawId=Number.parseInt(id.slice(2),10); if(!Number.isFinite(rawId)) return null;
    const row=await db.prepare(`SELECT 'r:' || r.id AS id,r.message_id AS messageId,NULL AS fromOrg,r.from_addr AS fromAddr,r.to_addr AS toAddr,NULL AS topic,NULL AS code,NULL AS category,r.created_at AS createdAt,r.subject,'unprocessed' AS status,r.raw FROM raw_mails r WHERE r.id=? AND r.processing_state='unprocessed' LIMIT 1`).bind(rawId).first<MailRow&{raw:string|null}>(); return row??null;
  }
  const numeric=id.startsWith("c:")?id.slice(2):id; const mailId=Number.parseInt(numeric,10); if(!Number.isFinite(mailId)) return null;
  const perm=await buildPermissionFilter(db,user); if(perm.empty)return null; const includeRaw=user.role==="admin";
  const row=await db.prepare(`SELECT 'c:' || c.id AS id,c.message_id AS messageId,c.from_org AS fromOrg,c.from_addr AS fromAddr,c.to_addr AS toAddr,c.topic,c.code,c.category,c.created_at AS createdAt,r.subject,'extracted' AS status${includeRaw?",r.raw":""} FROM code_mails c LEFT JOIN raw_mails r ON r.message_id=c.message_id WHERE c.id=? AND ${perm.clause} LIMIT 1`).bind(mailId,...perm.binds).first<MailRow&{raw?:string|null}>();
  return row?{...row,raw:row.raw??null}:null;
}

export async function visibleAddresses(db:D1Database,user:AuthedUser):Promise<string[]>{const perm=await buildPermissionFilter(db,user);if(perm.empty)return[];const{results}=await db.prepare(`SELECT DISTINCT c.to_addr FROM code_mails c WHERE ${perm.clause} ORDER BY c.to_addr`).bind(...perm.binds).all<{to_addr:string}>();return(results??[]).map(r=>r.to_addr).filter(Boolean);}
