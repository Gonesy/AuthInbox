-- Migration number: 0003
-- Persistent notification settings managed from the admin UI.

CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bark_enabled INTEGER NOT NULL DEFAULT 0,
    bark_url TEXT NOT NULL DEFAULT 'https://api.day.app',
    bark_tokens TEXT NOT NULL DEFAULT '',
    ntfy_enabled INTEGER NOT NULL DEFAULT 0,
    ntfy_url TEXT NOT NULL DEFAULT 'https://ntfy.sh',
    ntfy_topic TEXT NOT NULL DEFAULT '',
    ntfy_token TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO notification_settings (id) VALUES (1);
