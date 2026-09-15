import type { Env } from "../types";
import { extractMailInfo, isPrimaryAiConfigured } from "../services/classify";
import { decodeMimeHeader, extractMailBodies, isPromotionalEmail, stripHtmlTags } from "../services/mime";
import { sendNotifications } from "../services/notifications";
import { extractMailWithRegex } from "../services/regex";
import { RPCEmailMessage } from "./rpcEmail";

async function setState(env: Env, messageId: string | null, state: string): Promise<void> {
  if (messageId) await env.DB.prepare("UPDATE raw_mails SET processing_state = ?, processed = 1 WHERE message_id = ?").bind(state, messageId).run();
}

export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const rawEmail = message instanceof RPCEmailMessage ? String((message as RPCEmailMessage).rawEmail) : await new Response(message.raw).text();
  const messageId = message.headers.get("Message-ID");
  const rawSubject = decodeMimeHeader(message.headers.get("Subject")) ?? "";
  const { success } = await env.DB.prepare("INSERT INTO raw_mails (from_addr, to_addr, subject, raw, message_id, processing_state) VALUES (?, ?, ?, ?, ?, 'pending')")
    .bind(message.from, message.to, rawSubject, rawEmail, messageId).run();
  if (!success) { message.setReject(`Failed to save message from ${message.from} to ${message.to}`); return; }

  if (isPromotionalEmail(message.headers, rawEmail)) { await setState(env, messageId, "promotional"); return; }

  try {
    const { textBody, htmlBody } = extractMailBodies(rawEmail);
    const searchable = textBody ?? (htmlBody ? stripHtmlTags(htmlBody) : rawEmail);
    const regexMatch = await extractMailWithRegex(env.DB, rawSubject, searchable);
    let extracted: { codeExist: 0 | 1; title?: string; code?: string; topic?: string; category?: any } | null = null;
    let state = "unprocessed";

    if (regexMatch) {
      extracted = { codeExist: 1, title: message.from.split("@")[1]?.split(".")[0] || message.from, code: regexMatch.code, topic: `Matched by ${regexMatch.ruleName}`, category: "login_code" };
      state = "extracted_regex";
    } else if (isPrimaryAiConfigured(env)) {
      extracted = await extractMailInfo(env, rawEmail);
      if (extracted?.codeExist === 1) state = "extracted_ai";
    }

    if (!extracted || extracted.codeExist !== 1) { await setState(env, messageId, "unprocessed"); return; }
    const { title, code, topic, category } = extracted;
    const { success: codeMailSuccess } = await env.DB.prepare(`INSERT INTO code_mails (from_addr, from_org, to_addr, code, topic, category, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(message.from, title, message.to, code, topic, category ?? "login_code", messageId).run();
    if (!codeMailSuccess) { await setState(env, messageId, "unprocessed"); message.setReject(`Failed to save extracted code for message from ${message.from} to ${message.to}`); return; }
    await setState(env, messageId, state);
    await sendNotifications(env, title || "Auth Inbox", code || topic || "New message");
  } catch (e) {
    console.error("Mail extraction failed; preserving as unprocessed:", e);
    await setState(env, messageId, "unprocessed");
  }
}
