import { Hono } from "hono";
import type { AppEnv } from "../types";
import { MAIL_CATEGORIES } from "../types";
import { hashPassword } from "../services/auth";
import { getNotificationSettings } from "../services/notifications";

const admin = new Hono<AppEnv>();

// ---------- 用户管理 ----------

admin.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, username, role, created_at AS createdAt FROM users ORDER BY id",
  ).all();
  return c.json({ users: results ?? [] });
});

admin.post("/users", async (c) => {
  const body = await c.req
    .json<{ username?: string; password?: string; role?: string }>()
    .catch(() => null);
  if (!body?.username || !body?.password || body.password.length < 8) {
    return c.json({ error: "username and password (min 8 chars) required" }, 400);
  }
  const role = body.role === "admin" ? "admin" : "user";

  const passwordHash = await hashPassword(body.password);
  try {
    const result = await c.env.DB.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
    )
      .bind(body.username, passwordHash, role)
      .run();
    return c.json({ id: result.meta.last_row_id, username: body.username, role }, 201);
  } catch {
    return c.json({ error: "Username already exists" }, 409);
  }
});

admin.delete("/users/:id{[0-9]+}", async (c) => {
  const targetId = Number.parseInt(c.req.param("id"), 10);
  if (targetId === c.get("user").id) {
    return c.json({ error: "Cannot delete yourself" }, 400);
  }
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
  return c.json({ ok: true });
});

// ---------- Notification settings ----------

admin.get("/notifications", async (c) => {
  const settings = await getNotificationSettings(c.env);
  return c.json({
    barkEnabled: settings.barkEnabled,
    barkUrl: settings.barkUrl,
    barkTokens: settings.barkTokens,
    ntfyEnabled: settings.ntfyEnabled,
    ntfyUrl: settings.ntfyUrl,
    ntfyTopic: settings.ntfyTopic,
    ntfyTokenConfigured: Boolean(settings.ntfyToken),
  });
});

admin.post("/notifications", async (c) => {
  const body = await c.req
    .json<{
      barkEnabled?: boolean;
      barkUrl?: string;
      barkTokens?: string;
      ntfyEnabled?: boolean;
      ntfyUrl?: string;
      ntfyTopic?: string;
      ntfyToken?: string;
      clearNtfyToken?: boolean;
    }>()
    .catch(() => null);

  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  if (body.barkEnabled && (!body.barkUrl?.trim() || !body.barkTokens?.trim())) {
    return c.json({ error: "Bark URL and at least one token are required when Bark is enabled" }, 400);
  }
  if (body.ntfyEnabled && (!body.ntfyUrl?.trim() || !body.ntfyTopic?.trim())) {
    return c.json({ error: "ntfy URL and topic are required when ntfy is enabled" }, 400);
  }

  const current = await getNotificationSettings(c.env);
  const ntfyToken = body.clearNtfyToken ? "" : body.ntfyToken?.trim() || current.ntfyToken;

  await c.env.DB.prepare(
    `INSERT INTO notification_settings
       (id, bark_enabled, bark_url, bark_tokens, ntfy_enabled, ntfy_url, ntfy_topic, ntfy_token, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       bark_enabled = excluded.bark_enabled,
       bark_url = excluded.bark_url,
       bark_tokens = excluded.bark_tokens,
       ntfy_enabled = excluded.ntfy_enabled,
       ntfy_url = excluded.ntfy_url,
       ntfy_topic = excluded.ntfy_topic,
       ntfy_token = excluded.ntfy_token,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      body.barkEnabled ? 1 : 0,
      (body.barkUrl || "https://api.day.app").trim().replace(/\/+$/, ""),
      body.barkTokens || "",
      body.ntfyEnabled ? 1 : 0,
      (body.ntfyUrl || "https://ntfy.sh").trim().replace(/\/+$/, ""),
      body.ntfyTopic || "",
      ntfyToken,
    )
    .run();

  return c.json({ ok: true });
});

// ---------- Grants 管理 ----------

admin.get("/grants", async (c) => {
  const userId = c.req.query("user_id");
  const stmt = userId
    ? c.env.DB.prepare(
        `SELECT g.id, g.user_id AS userId, u.username, g.address_pattern AS addressPattern,
                g.allowed_categories AS allowedCategories, g.allow_sensitive AS allowSensitive,
                g.created_at AS createdAt
         FROM grants g JOIN users u ON u.id = g.user_id
         WHERE g.user_id = ? ORDER BY g.id`,
      ).bind(Number.parseInt(userId, 10))
    : c.env.DB.prepare(
        `SELECT g.id, g.user_id AS userId, u.username, g.address_pattern AS addressPattern,
                g.allowed_categories AS allowedCategories, g.allow_sensitive AS allowSensitive,
                g.created_at AS createdAt
         FROM grants g JOIN users u ON u.id = g.user_id ORDER BY g.id`,
      );
  const { results } = await stmt.all();
  return c.json({ grants: results ?? [] });
});

admin.post("/grants", async (c) => {
  const body = await c.req
    .json<{
      userId?: number;
      addressPattern?: string;
      allowedCategories?: string[];
      allowSensitive?: boolean;
    }>()
    .catch(() => null);

  if (!body?.userId || !body?.addressPattern || !Array.isArray(body.allowedCategories)) {
    return c.json({ error: "userId, addressPattern, allowedCategories required" }, 400);
  }

  const invalid = body.allowedCategories.filter(
    (cat) => !(MAIL_CATEGORIES as readonly string[]).includes(cat),
  );
  if (invalid.length > 0) {
    return c.json({ error: `Unknown categories: ${invalid.join(", ")}` }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO grants (user_id, address_pattern, allowed_categories, allow_sensitive)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(
      body.userId,
      body.addressPattern,
      JSON.stringify(body.allowedCategories),
      body.allowSensitive ? 1 : 0,
    )
    .run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

admin.delete("/grants/:id{[0-9]+}", async (c) => {
  await c.env.DB.prepare("DELETE FROM grants WHERE id = ?")
    .bind(Number.parseInt(c.req.param("id"), 10))
    .run();
  return c.json({ ok: true });
});

export default admin;
