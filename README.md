# Auth Inbox 📬

**Auth Inbox** is a self-hosted verification-code inbox built on Cloudflare Workers, Email Routing and D1. Incoming mail is stored first, promotional mail is filtered, then configurable context-aware Regex Rules try to extract a verification code. AI is optional: when configured it is used only as a fallback for mail that regex cannot confidently extract.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Gonesy/AuthInbox/tree/feature/ntfy-support)

## Features ✨

- **No-AI mode** — common OTP emails work using context-aware regex extraction alone.
- **Regex Rules admin UI** — add, edit, enable/disable, delete, test and reset rules without redeploying the Worker.
- **Context-aware extraction** — a code pattern is accepted only near configured phrases such as `verification code`, `OTP`, `验证码` or `动态码`; arbitrary order numbers and dates are not treated as codes merely because they contain digits.
- **Optional AI fallback** — configure `AI_BASE_URL`, `AI_API_KEY`, `AI_API_FORMAT` and `AI_MODEL` to let AI process regex misses and classify complex messages.
- **Unprocessed mail visibility** — admins can switch Mail List between **All / Extracted / Unprocessed** and inspect the raw/text/HTML body of received mail that produced no code. Unprocessed/raw mail is never exposed to regular users.
- **Promotional filter** — bulk/marketing mail is skipped before regex/AI processing.
- **Multi-user access control** — normal users see only extracted mail granted by address/category; raw content remains admin-only.
- **Notifications** — Bark and ntfy can be enabled independently or together. Only successfully extracted mail sends a notification.
- **Remote MCP server** and API keys for agent access.

## Processing flow

```text
Cloudflare Email Routing
        ↓
Save raw_mails
        ↓
Promotional? ── yes → promotional
        ↓ no
Context-aware Regex Rules
   ↓ match          ↓ miss
code_mails       AI configured?
   ↓              ↓ yes     ↓ no
Bark/ntfy       AI extract  Unprocessed
                  ↓
             success / Unprocessed
```

## Installation ⚙️

### Required

- A domain in Cloudflare with Email Routing available.
- A Cloudflare D1 database named `inbox-d1`.
- Cloudflare account/API credentials for deployment.
- `JWT_SECRET` configured as a long random Worker secret.

### Optional AI

AI is **not required**. Leave the following unset to operate in Regex-only mode:

```toml
AI_BASE_URL = "..."
AI_API_KEY = "..."
AI_API_FORMAT = "openai"
AI_MODEL = "..."
```

AI fallback is enabled only when all four primary values are present. Supported formats are `openai`, `responses`, and `anthropic`.

### Database migrations

Deployments must apply all D1 migrations before deploying the Worker:

```bash
pnpm run db:migrate:remote
```

Migration `0004_regex_rules_and_processing_state.sql` adds processing state and the editable Regex Rules table. Existing raw messages are marked `legacy`; they are not retroactively shown as Unprocessed.

### Email Routing

In Cloudflare Dashboard, route the desired recipient address (or catch-all) to the AuthInbox Email Worker. A specific address rule can coexist with a catch-all rule; the specific match is handled by its configured Worker and unmatched addresses fall through to catch-all.

## Regex Rules

Administrators can open **Regex Rules** in the dashboard. Each rule contains:

- Name and Enabled state
- Context keywords, one per line
- JavaScript regex pattern for the candidate code
- Description
- Priority (lower runs first)

Use **Test rule** with representative mail text before saving a new pattern. The test does not write mail or send notifications. **Reset defaults** replaces the current rule set with the shipped English/Chinese defaults.

A deliberately conservative rule is preferable: if regex cannot confidently identify a code, the mail can be handled by optional AI or retained as **Unprocessed** rather than sending a wrong OTP notification.

## Notifications

Open **Notifications** as an administrator. Bark and ntfy are independent and can both be enabled. ntfy supports `ntfy.sh` or a self-hosted server, a topic, and an optional access token. For public ntfy topics, use a long hard-to-guess topic name.

## Security notes

Raw and Unprocessed mail are admin-only. Normal users remain restricted to extracted `code_mails` through the existing SQL grant/category permission layer. Regex configuration is also admin-only. Do not commit real API keys, JWT secrets, notification tokens, or a production `wrangler.toml` to the repository.

## Development

```bash
pnpm install
pnpm run test
pnpm run test:mail
pnpm run build:web
```

The live/evaluation LLM test is intentionally separate because it may call a paid provider.

## License

MIT
