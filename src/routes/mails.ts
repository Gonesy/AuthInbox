import { Hono } from "hono";
import type { AppEnv } from "../types";
import { visibleMailById, visibleMails, type MailStatus } from "../services/mail";
import { extractMailBodies } from "../services/mime";
const mails=new Hono<AppEnv>();
mails.get("/",async c=>{const user=c.get("user");const page=Math.max(1,Number.parseInt(c.req.query("page")??"1",10)||1);const pageSize=Math.min(100,Math.max(1,Number.parseInt(c.req.query("pageSize")??"20",10)||20));const requested=c.req.query("status")??"all";const status:MailStatus=requested==="extracted"||requested==="unprocessed"?requested:"all";const{total,items}=await visibleMails(c.env.DB,user,{toAddr:c.req.query("to_addr")||undefined,service:c.req.query("service")||undefined,status,limit:pageSize,offset:(page-1)*pageSize});return c.json({page,pageSize,total,items});});
mails.get("/:id",async c=>{const user=c.get("user");const id=c.req.param("id");if(!/^(?:[cr]:)?\d+$/.test(id))return c.json({error:"Mail not found"},404);const row=await visibleMailById(c.env.DB,user,id);if(!row)return c.json({error:"Mail not found"},404);const{textBody,htmlBody}=row.raw?extractMailBodies(row.raw):{textBody:null,htmlBody:null};return c.json({...row,textBody,htmlBody});});
export default mails;
