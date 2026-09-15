import type { Env } from "../types";

export interface NotificationSettings {
  barkEnabled: boolean;
  barkUrl: string;
  barkTokens: string;
  ntfyEnabled: boolean;
  ntfyUrl: string;
  ntfyTopic: string;
  ntfyToken: string;
}

function enabled(value?: string): boolean {
  return value?.toLowerCase() === "true";
}

function normalizeBaseUrl(value: string, fallback: string): string {
  return (value || fallback).replace(/\/+$/, "");
}

function envFallback(env: Env): NotificationSettings {
  return {
    barkEnabled: enabled(env.UseBark),
    barkUrl: normalizeBaseUrl(env.barkUrl || "", "https://api.day.app"),
    barkTokens: env.barkTokens || "",
    ntfyEnabled: enabled(env.UseNtfy),
    ntfyUrl: normalizeBaseUrl(env.ntfyUrl || "", "https://ntfy.sh"),
    ntfyTopic: env.ntfyTopic || "",
    ntfyToken: env.ntfyToken || "",
  };
}

export async function getNotificationSettings(env: Env): Promise<NotificationSettings> {
  const fallback = envFallback(env);
  try {
    const row = await env.DB.prepare(
      `SELECT bark_enabled AS barkEnabled, bark_url AS barkUrl, bark_tokens AS barkTokens,
              ntfy_enabled AS ntfyEnabled, ntfy_url AS ntfyUrl, ntfy_topic AS ntfyTopic,
              ntfy_token AS ntfyToken
       FROM notification_settings WHERE id = 1`,
    ).first<Record<string, unknown>>();

    if (!row) return fallback;

    return {
      barkEnabled: Number(row.barkEnabled) === 1,
      barkUrl: normalizeBaseUrl(String(row.barkUrl || fallback.barkUrl), fallback.barkUrl),
      barkTokens: String(row.barkTokens || ""),
      ntfyEnabled: Number(row.ntfyEnabled) === 1,
      ntfyUrl: normalizeBaseUrl(String(row.ntfyUrl || fallback.ntfyUrl), fallback.ntfyUrl),
      ntfyTopic: String(row.ntfyTopic || ""),
      ntfyToken: String(row.ntfyToken || ""),
    };
  } catch (error) {
    // Keeps existing deployments working before migration 0003 is applied.
    console.warn("Notification settings table unavailable; using Worker variables", error);
    return fallback;
  }
}

function parseBarkTokens(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((token) => token.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean);
}

async function pushBark(settings: NotificationSettings, title: string, message: string): Promise<void> {
  const tokens = parseBarkTokens(settings.barkTokens);
  await Promise.allSettled(
    tokens.map(async (token) => {
      const url = `${settings.barkUrl}/${encodeURIComponent(token)}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`;
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) throw new Error(`Bark returned ${response.status} ${response.statusText}`);
    }),
  );
}

async function pushNtfy(settings: NotificationSettings, title: string, message: string): Promise<void> {
  if (!settings.ntfyTopic.trim()) {
    console.error("ntfy is enabled but no topic is configured");
    return;
  }

  const headers: Record<string, string> = {
    Title: title,
    Priority: "high",
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (settings.ntfyToken.trim()) headers.Authorization = `Bearer ${settings.ntfyToken.trim()}`;

  const response = await fetch(`${settings.ntfyUrl}/${encodeURIComponent(settings.ntfyTopic.trim())}`, {
    method: "POST",
    headers,
    body: message,
  });
  if (!response.ok) throw new Error(`ntfy returned ${response.status} ${response.statusText}`);
}

export async function sendNotifications(env: Env, title: string, message: string): Promise<void> {
  const settings = await getNotificationSettings(env);
  const jobs: Promise<void>[] = [];

  if (settings.barkEnabled && parseBarkTokens(settings.barkTokens).length > 0) {
    jobs.push(pushBark(settings, title, message));
  }
  if (settings.ntfyEnabled) jobs.push(pushNtfy(settings, title, message));

  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === "rejected") console.error("Notification delivery failed:", result.reason);
  }
}
