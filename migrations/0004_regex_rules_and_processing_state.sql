ALTER TABLE raw_mails ADD COLUMN processing_state TEXT NOT NULL DEFAULT 'legacy';

CREATE TABLE IF NOT EXISTS regex_rules (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
	context_keywords TEXT NOT NULL,
	pattern TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	priority INTEGER NOT NULL DEFAULT 100,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_regex_rules_enabled_priority ON regex_rules(enabled, priority, id);

INSERT INTO regex_rules (name, enabled, context_keywords, pattern, description, priority) VALUES
('Generic verification code',1,'["verification code","security code","authentication code","verify code","one-time code","one time code","OTP","passcode"]','\\b(?=[A-Za-z0-9]{4,8}\\b)(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]+\\b','Common English verification and OTP wording. Requires at least one digit.',100),
('Chinese verification code',1,'["验证码","动态码","校验码","认证码","登录码","一次性密码","一次性验证码"]','(?<![A-Za-z0-9])(?=[A-Za-z0-9]{4,8}(?![A-Za-z0-9]))(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]+(?![A-Za-z0-9])','Common Chinese verification-code wording. Requires at least one digit.',200);