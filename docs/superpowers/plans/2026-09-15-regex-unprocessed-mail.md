# Regex Extraction and Unprocessed Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-configurable context-aware regex OTP extraction, optional AI fallback, and admin-visible Unprocessed mail to the existing AuthInbox Mail List.

**Architecture:** Preserve `raw_mails` as the mandatory first persistence step and `visibleMails()` as the sole permission layer. Add explicit raw-mail processing state plus D1-backed regex rules; the inbound handler evaluates regex first, invokes AI only when fully configured, and records terminal state. Admin list/detail queries union extracted and unprocessed rows without exposing raw/unclassified mail to normal users.

**Tech Stack:** Cloudflare Workers, Hono, D1, TypeScript, Vitest, React 18, Vite, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-09-15-regex-unprocessed-mail-design.md`

## Global Constraints

- Work only on `feature/ntfy-support`; do not merge to `main`.
- Every inbound email must be inserted into `raw_mails` before extraction.
- Promotional filtering must remain before regex and AI extraction.
- `visibleMails()` / `visibleMailById()` remain the single mail permission boundary.
- Unprocessed/raw content is admin-only.
- AI is optional and is called only when all four primary AI settings are configured.
- Regex requires configured context plus a candidate pattern; never accept an unrestricted bare number match.
- Schema changes use new numbered migrations; never edit an applied migration.
- Successfully extracted mail alone triggers Bark/ntfy.

---

### Task 1: Persist processing state and regex rules

**Files:**
- Create: `migrations/0004_regex_rules_and_processing_state.sql`
- Test: `test/regex-rules.test.ts`

**Interfaces:**
- Produces D1 table `regex_rules(id, name, enabled, context_keywords, pattern, description, priority, created_at, updated_at)`.
- Produces `raw_mails.processing_state` with safe default `legacy` for existing rows.

- [ ] Write a migration-focused test that asserts default rules exist, contain non-empty context keyword arrays, and processing state defaults safely.
- [ ] Run `pnpm run test -- regex-rules.test.ts` and verify failure before the migration/service exists.
- [ ] Add migration 0004. Add `processing_state TEXT NOT NULL DEFAULT 'legacy'` to `raw_mails`, create `regex_rules`, and seed conservative English/Chinese defaults such as `verification code`, `security code`, `OTP`, `one-time password`, `验证码`, `动态码`, `校验码`, `一次性密码` with a bounded 4-8 character alphanumeric candidate pattern.
- [ ] Run local migration and the focused test.
- [ ] Commit as `feat: add regex rule and mail state schema`.

### Task 2: Build context-aware regex extraction service

**Files:**
- Create: `src/services/regex.ts`
- Test: `test/regex.test.ts`

**Interfaces:**
- Produces `RegexRule` and `RegexMatch` types.
- Produces `listEnabledRegexRules(db)`, `extractWithRegex(text, rules)`, and rule validation helpers.
- `RegexMatch` contains `code`, `ruleId`, `ruleName`, and `contextExcerpt`.

- [ ] Write failing tests for English and Chinese context matches, alphanumeric OTP, context-before/context-after layouts, rule priority, and false positives (`Order #583921`, dates, phone numbers, amounts).
- [ ] Add failing tests for invalid regex syntax, empty keyword lists, oversized patterns, and malformed stored rules being skipped.
- [ ] Run focused tests and verify failure.
- [ ] Implement bounded context windows around case-insensitive keywords, compile validated JS regex sources, stop at first priority match, and cap input/window sizes.
- [ ] Run focused tests and verify pass.
- [ ] Commit as `feat: add context aware regex extraction`.

### Task 3: Make AI optional and integrate regex-first pipeline

**Files:**
- Modify: `src/email/handler.ts`
- Modify: `src/services/classify.ts`
- Test: `test/email-handler.test.ts` or the nearest existing handler/pipeline test file

**Interfaces:**
- Produces `isPrimaryAiConfigured(env): boolean` in the classification service.
- Consumes regex service from Task 2.
- Updates `raw_mails.processing_state` to `promotional`, `extracted_regex`, `extracted_ai`, or `unprocessed` after the mandatory initial insert.

- [ ] Write failing pipeline tests: regex success skips AI and sends notification; regex miss + complete AI config invokes AI; regex miss + incomplete AI config does not invoke AI and becomes `unprocessed`; promotional mail becomes `promotional` without regex/AI.
- [ ] Run focused tests and verify failure.
- [ ] Implement `isPrimaryAiConfigured()` requiring non-empty `AI_BASE_URL`, `AI_API_KEY`, `AI_API_FORMAT`, and `AI_MODEL`.
- [ ] Refactor handler downstream extraction into one storage/notification path: regex match creates a conservative `login_code` extraction; otherwise call existing AI only when configured; otherwise update state to `unprocessed`.
- [ ] Ensure AI exceptions/no-code responses update state to `unprocessed` rather than losing the received mail.
- [ ] Run focused tests and existing deterministic mail regression tests.
- [ ] Commit as `feat: add regex first optional ai pipeline`.

### Task 4: Extend the single permission layer for Unprocessed mail

**Files:**
- Modify: `src/services/mail.ts`
- Modify: `src/routes/mails.ts`
- Modify: `src/types.ts` if shared row/status types live there
- Test: `test/mail.test.ts` or nearest existing mail-service/API test

**Interfaces:**
- Extend `MailQueryOpts` with `status?: 'all' | 'extracted' | 'unprocessed'`.
- Extend returned mail rows with `status: 'extracted' | 'unprocessed'` and a stable detail identifier that cannot collide between raw/code rows (for example prefixed string IDs).

- [ ] Write failing tests proving admin `all` returns extracted + unprocessed, admin filters work, normal users only receive extracted rows, and normal users cannot fetch an unprocessed detail by ID.
- [ ] Add a test that promotional and legacy raw rows are excluded from Unprocessed.
- [ ] Run focused tests and verify failure.
- [ ] Extend `visibleMails()` rather than adding a second query path. Preserve SQL grant/category filtering for non-admins; for admin use a union/query shape that includes `raw_mails.processing_state='unprocessed'`.
- [ ] Extend `visibleMailById()` to resolve extracted/unprocessed IDs and return raw body only for admin as before.
- [ ] Add `status` query parsing in `/api/mails` and reject/normalize unsupported values conservatively.
- [ ] Run focused and full unit tests.
- [ ] Commit as `feat: show unprocessed mail to admins`.

### Task 5: Add admin Regex Rules API

**Files:**
- Modify: `src/routes/admin.ts`
- Test: `test/admin-regex-rules.test.ts`

**Interfaces:**
- `GET /api/admin/regex-rules`
- `POST /api/admin/regex-rules`
- `POST /api/admin/regex-rules/:id`
- `DELETE /api/admin/regex-rules/:id`
- `POST /api/admin/regex-rules/reorder`
- `POST /api/admin/regex-rules/reset`
- `POST /api/admin/regex-rules/test`

- [ ] Write failing API tests for list/create/update/delete, validation failures, enable/disable, reorder, reset, and test-without-persistence.
- [ ] Verify non-admin requests remain blocked by existing `/api/admin/*` middleware.
- [ ] Implement request validation: non-empty name, at least one trimmed context keyword, compilable regex, bounded pattern/keyword payloads, integer priority.
- [ ] Implement test endpoint using the exact production regex engine and returning `{ matched, code?, ruleName?, contextExcerpt? }` without DB mail writes or notifications.
- [ ] Implement reset transaction that replaces current rules with shipped defaults.
- [ ] Run focused/full unit tests.
- [ ] Commit as `feat: add regex rules admin api`.

### Task 6: Add Regex Rules admin UI

**Files:**
- Create: `web/src/pages/RegexRulesPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/api.ts`

**Interfaces:**
- Consumes Task 5 endpoints.
- Provides list/edit/create/delete/enable/reorder/reset/test interactions.

- [ ] Add frontend API types for regex rule and test result.
- [ ] Build the page following existing Notifications/Users admin page patterns: rule cards/table, enabled switch, name, newline-separated context keywords, pattern, description, priority/order controls.
- [ ] Add guarded destructive confirmations for delete and Reset to defaults.
- [ ] Add Test Rule area with subject/body sample input and rendered match/code/rule/context result.
- [ ] Add admin-only `Regex Rules` navigation entry in `App.tsx`.
- [ ] Run `pnpm run build:web` and resolve all TypeScript/Vite errors.
- [ ] Commit as `feat: add regex rules admin ui`.

### Task 7: Add Mail List status UI

**Files:**
- Modify: `web/src/pages/InboxPage.tsx`
- Modify: `web/src/api.ts`

**Interfaces:**
- Consumes `status=all|extracted|unprocessed` from Task 4.
- Renders unprocessed rows without assuming `category`/`code` exist.

- [ ] Extend frontend mail types with status and the stable ID representation chosen in Task 4.
- [ ] Add admin-only `All / Extracted / Unprocessed` controls near the existing search/refresh controls; changing status resets page to 1.
- [ ] Render an `Unprocessed` badge/category cell for raw rows and keep existing category badges for extracted rows.
- [ ] Update detail panel so unprocessed mail shows metadata and admin raw/text/html preview but no extracted-code panel.
- [ ] Update empty-state copy so admin no longer sees `No extracted mails yet` when viewing All/Unprocessed.
- [ ] Run `pnpm run build:web`.
- [ ] Commit as `feat: add unprocessed mail filters`.

### Task 8: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` where architecture/AI requirements are now stale

**Interfaces:**
- Documents no-AI mode, regex-first behavior, admin rule management, Unprocessed visibility, and AI fallback configuration.

- [ ] Update README setup so AI is explicitly optional and explain Regex Rules + AI fallback.
- [ ] Update architecture documentation to preserve the new processing-state and permission invariants.
- [ ] Run `pnpm run test`.
- [ ] Run `pnpm run test:mail` (deterministic suite; do not run paid/live `test:eval` unless explicitly requested/configured).
- [ ] Run `pnpm run build:web`.
- [ ] Inspect branch diff and confirm no real secrets/configuration files were committed and no applied migration was edited.
- [ ] Update Draft PR #1 description to include regex/no-AI/Unprocessed functionality and migration requirement.
- [ ] Commit docs as `docs: document regex and no ai mode` and leave PR in Draft until verification evidence is available.