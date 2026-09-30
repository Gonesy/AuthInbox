# Regex Extraction and Unprocessed Mail Design

## Goal

Make AuthInbox useful without an AI provider by adding configurable, context-aware regex extraction, while preserving AI as an optional fallback and making received-but-unextracted mail visible to administrators in the existing Mail List.

## Confirmed Product Behavior

1. Every inbound email is always persisted to `raw_mails` before extraction.
2. Promotional filtering remains before regex/AI extraction. Promotional mail is stored raw but is not treated as an unprocessed OTP candidate in the normal Mail List.
3. For non-promotional mail, enabled regex rules run first against decoded subject and message bodies.
4. A regex rule only extracts a code when both its context requirement and code pattern match. A bare 4-8 digit number is not sufficient.
5. If regex succeeds, AuthInbox writes the normal extracted-mail record and sends all enabled notification channels (Bark/ntfy).
6. If regex does not match and the primary AI configuration is complete, the existing AI extraction pipeline runs as fallback.
7. If AI is not configured, fails, or reports no code/link, the raw mail remains visible to administrators as `Unprocessed`.
8. Existing non-admin grant behavior remains unchanged. Unprocessed/raw mail is admin-only because it has not been categorized and may contain sensitive information.
9. The existing Mail List gains `All`, `Extracted`, and `Unprocessed` filters rather than adding a separate inbox page.

## Regex Rule Model

Regex rules are stored in D1 and managed from an admin-only `Regex Rules` page. Rules are evaluated in ascending priority/order and stop at the first high-confidence match.

Each rule contains:

- `name`: human-readable rule name.
- `enabled`: whether the rule participates in extraction.
- `context_keywords`: newline/JSON list of phrases such as `verification code`, `OTP`, `验证码`, `动态码`.
- `pattern`: JavaScript regular expression source for the candidate code, without delimiters.
- `description`: optional administrator notes.
- `priority`: stable evaluation order.
- timestamps.

Context and candidate patterns are deliberately separate. The engine first finds a configured context keyword, then searches only a bounded text window around that context for the configured pattern. This prevents unrelated order numbers, dates, phone numbers, and amounts elsewhere in the message from being treated as OTPs.

Default rules cover common English and Chinese verification wording and conservative 4-8 character numeric/alphanumeric codes. Default rules are editable. `Reset to defaults` replaces the rule set with the shipped defaults.

## Rule Testing

The Regex Rules admin UI provides a Test Rule action. The administrator supplies representative subject/body text and a selected/current rule. The API runs the same extraction engine used by inbound email and returns:

- matched yes/no;
- extracted code when matched;
- rule name;
- a short context excerpt.

Testing never writes `code_mails` and never sends notifications.

Invalid regex syntax is rejected on create/update/test. Empty context keyword sets are rejected so a rule cannot accidentally become an unrestricted number matcher. Pattern length and keyword counts are bounded to prevent pathological configuration payloads.

## Extraction Pipeline

The inbound pipeline becomes:

`raw_mails insert -> promotional filter -> regex extraction -> optional AI fallback -> code_mails insert -> notifications`

Regex extraction returns the same normalized shape needed by the downstream storage path (`codeExist`, `code`, `title/topic/category` as applicable) plus extraction metadata. Regex-extracted records use a conservative category (`login_code` by default) unless a later rule model explicitly supports category configuration. This design does not infer sensitive categories from regex alone.

AI configuration is considered available only when all required primary values are non-empty: `AI_BASE_URL`, `AI_API_KEY`, `AI_API_FORMAT`, and `AI_MODEL`. Missing AI configuration is a normal no-AI operating mode and must not produce noisy provider errors.

Notification behavior is unchanged downstream: only successfully extracted records trigger Bark/ntfy. Unprocessed mail never triggers a push.

## Mail List and Data Access

`visibleMails()` remains the single permission boundary. It will be extended rather than bypassed.

For administrators, the query can return two row kinds:

- `extracted`: backed by `code_mails`, with the existing fields and joined raw-mail subject.
- `unprocessed`: backed by `raw_mails` for non-promotional/non-extracted candidates, with no code/category extraction result and a visible `Unprocessed` status.

For non-admin users, only extracted `code_mails` rows continue to be returned through the existing grant/category SQL filter. Raw/unprocessed records are never exposed.

To distinguish intentionally skipped promotional mail from genuine unprocessed mail reliably, raw mail needs explicit processing state rather than inferring state solely from the absence of a `code_mails` row. A new migration will add processing metadata to `raw_mails`, with states such as `pending`, `promotional`, `extracted_regex`, `extracted_ai`, and `unprocessed`. Existing rows receive a safe legacy/default state and are not automatically exposed as new unprocessed mail.

Mail-detail lookup will support admin-only unprocessed rows while retaining the existing rule that raw/text/html bodies are only returned to admins.

## Admin APIs and UI

New admin endpoints under `/api/admin/regex-rules` provide list/create/update/delete/reorder/reset/test operations. They remain behind the existing `sessionAuth` + `requireAdmin` boundary.

The frontend adds an admin navigation item `Regex Rules`. The page supports:

- enable/disable;
- add/edit/delete;
- priority/order management;
- context keyword editing;
- regex pattern editing;
- description;
- test input and match result;
- reset to shipped defaults with confirmation.

The Inbox/Mail List adds an admin-only status filter for `All`, `Extracted`, and `Unprocessed`. Existing users should not see an Unprocessed option because those records are not available to them.

## Migration and Compatibility

All schema work is additive through new numbered migrations; previously applied migrations are never edited.

Existing AI-configured deployments keep working: regex simply gets first chance, then the current AI provider/fallback behavior remains available. Deployments without AI become valid configurations rather than erroring on every non-promotional email.

Existing `code_mails` and permission grants remain compatible. Existing raw rows are not retroactively treated as Unprocessed unless a future explicit reprocessing feature is designed.

This work does not alter the existing notification-settings migration behavior; that separate compatibility issue should be fixed independently so the scope of this feature remains reviewable.

## Security and Failure Handling

- Raw/unprocessed content remains admin-only.
- Regex patterns are administrator-controlled but validated before persistence.
- Regex execution uses bounded input/context windows and conservative limits.
- A malformed stored rule is skipped/logged rather than preventing receipt of the email.
- Database persistence of the raw email remains the first mandatory operation.
- Failure of regex extraction falls through to AI when configured; failure of AI leaves the mail Unprocessed.
- Notification failures do not change extraction state or remove stored mail.

## Testing

Add deterministic unit coverage for context-window matching, English/Chinese keywords, alphanumeric OTPs, false positives (orders/dates/phone numbers), invalid patterns, rule ordering, and no-AI fallback behavior.

Add mail-service/API coverage proving that admins can list/open Unprocessed mail while non-admin users cannot access it, and that status filtering does not bypass the existing grant/category permission layer.

Add pipeline regression cases proving regex success skips AI, regex miss invokes AI only when configured, and no-AI regex miss becomes Unprocessed without throwing.

Frontend build/type checks must cover the new Regex Rules page and Mail List filters.