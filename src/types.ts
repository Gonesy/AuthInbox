export type ApiFormat = "openai" | "responses" | "anthropic";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  format: ApiFormat;
  model: string;
}

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;

  // Auth
  JWT_SECRET: string;
  OAUTH_KV?: KVNamespace;
  OAUTH_PROVIDER?: import("@cloudflare/workers-oauth-provider").OAuthHelpers;

  // Notification compatibility defaults. Saved admin settings in D1 take precedence.
  UseBark?: string;
  barkTokens?: string;
  barkUrl?: string;
  UseNtfy?: string;
  ntfyUrl?: string;
  ntfyTopic?: string;
  ntfyToken?: string;

  // AI is optional. Regex extraction works without these values.
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_API_FORMAT?: ApiFormat;
  AI_MODEL?: string;

  AI_FALLBACK_BASE_URL?: string;
  AI_FALLBACK_API_KEY?: string;
  AI_FALLBACK_API_FORMAT?: ApiFormat;
  AI_FALLBACK_MODEL?: string;
}

export type Role = "admin" | "user";
export interface AuthedUser { id: number; username: string; role: Role; }
export interface OAuthProps { userId: number; }
export type AppEnv = { Bindings: Env; Variables: { user: AuthedUser } };

export const MAIL_CATEGORIES = ["login_code", "registration", "password_reset", "account_security", "payment", "other"] as const;
export type MailCategory = (typeof MAIL_CATEGORIES)[number];
export const SENSITIVE_CATEGORIES = ["password_reset", "account_security", "legacy"];
