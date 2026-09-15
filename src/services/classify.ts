import type { Env, ProviderConfig, MailCategory } from "../types";
import { MAIL_CATEGORIES } from "../types";
import { extractMailBodies, stripHtmlTags } from "./mime";

export interface ExtractedMail { codeExist: 0 | 1; title?: string; code?: string; topic?: string; category?: MailCategory; }

export function isPrimaryAiConfigured(env: Env): boolean {
  return Boolean(env.AI_BASE_URL?.trim() && env.AI_API_KEY?.trim() && env.AI_API_FORMAT?.trim() && env.AI_MODEL?.trim());
}

export function extractJsonFromText(rawText: string): Record<string, unknown> | null {
  let candidate = rawText.trim();
  const jsonMatch = candidate.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) candidate = jsonMatch[1].trim();
  try { return JSON.parse(candidate); } catch (e) { console.error("JSON parsing error:", e); return null; }
}

function normaliseBaseUrl(baseUrl: string): string { return baseUrl.replace(/\/+$/, ""); }

export async function callProvider(config: ProviderConfig, prompt: string): Promise<string | null> {
  const base = normaliseBaseUrl(config.baseUrl);
  let endpoint: string; let body: unknown;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.format === "openai") {
    endpoint = `${base}/v1/chat/completions`; headers.Authorization = `Bearer ${config.apiKey}`;
    body = { model: config.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You return only valid JSON that matches the requested schema." }, { role: "user", content: prompt }] };
  } else if (config.format === "responses") {
    endpoint = `${base}/v1/responses`; headers.Authorization = `Bearer ${config.apiKey}`;
    body = { model: config.model, input: [{ role: "user", content: prompt }], text: { format: { type: "json_object" } } };
  } else {
    endpoint = `${base}/v1/messages`; headers["x-api-key"] = config.apiKey; headers["anthropic-version"] = "2023-06-01";
    body = { model: config.model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] };
  }
  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) { console.error(`[callProvider:${config.format}] HTTP ${response.status}`); return null; }
    const payload: any = await response.json();
    if (config.format === "openai") { const content = payload?.choices?.[0]?.message?.content; if (typeof content === "string") return content; return Array.isArray(content) ? content.find((p: any) => p?.type === "text")?.text ?? null : null; }
    if (config.format === "responses") { const text = payload?.output?.[0]?.content?.[0]?.text ?? payload?.output?.[0]?.text; return typeof text === "string" ? text : null; }
    return typeof payload?.content?.[0]?.text === "string" ? payload.content[0].text : null;
  } catch (e) { console.error(`[callProvider:${config.format}] error:`, e); return null; }
}

export function buildPrompt(rawEmail: string): string {
  const { textBody, htmlBody } = extractMailBodies(rawEmail);
  const emailContent = textBody ?? (htmlBody ? stripHtmlTags(htmlBody) : rawEmail);
  return `Email content: ${emailContent}\n\nExtract code/link/password, organization title, brief topic, and category. category must be one of login_code, registration, password_reset, account_security, payment, other. Return JSON {"title":"...","code":"...","topic":"...","category":"login_code","codeExist":1}. If no code/link return {"codeExist":0}.`;
}

export function coerceCategory(value: unknown): MailCategory {
  return typeof value === "string" && (MAIL_CATEGORIES as readonly string[]).includes(value) ? value as MailCategory : "other";
}

export async function extractMailInfo(env: Env, rawEmail: string): Promise<ExtractedMail | null> {
  if (!isPrimaryAiConfigured(env)) return null;
  const primary: ProviderConfig = { baseUrl: env.AI_BASE_URL!, apiKey: env.AI_API_KEY!, format: env.AI_API_FORMAT!, model: env.AI_MODEL! };
  const fallback: ProviderConfig | null = env.AI_FALLBACK_BASE_URL?.trim() && env.AI_FALLBACK_API_KEY?.trim() && env.AI_FALLBACK_MODEL?.trim()
    ? { baseUrl: env.AI_FALLBACK_BASE_URL, apiKey: env.AI_FALLBACK_API_KEY, format: env.AI_FALLBACK_API_FORMAT ?? "openai", model: env.AI_FALLBACK_MODEL } : null;
  const prompt = buildPrompt(rawEmail); let parsed: Record<string, unknown> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) { const text = await callProvider(primary, prompt); if (text && (parsed = extractJsonFromText(text))) break; }
  if (!parsed && fallback) { const text = await callProvider(fallback, prompt); if (text) parsed = extractJsonFromText(text); }
  if (!parsed) return null;
  if (parsed.codeExist !== 1) return { codeExist: 0 };
  return { codeExist: 1, title: typeof parsed.title === "string" ? parsed.title : "Unknown Organization", code: typeof parsed.code === "string" ? parsed.code : "No Code Found", topic: typeof parsed.topic === "string" ? parsed.topic : "No Topic Found", category: coerceCategory(parsed.category) };
}
