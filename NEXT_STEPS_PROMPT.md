# Handoff prompt: finish the Farsi recruitment pipeline (M3–M7)

You are continuing an existing Next.js 16 + TypeScript project at
`C:\Users\rezas\Desktop\recruitment-agent` (Windows, Node 22). It is a **teaching project**:
code must be clean, commented, with each agent / tool / orchestration step in its own clearly named file.
Match the style of the existing files (header doc comment explaining the "why", Farsi user-facing strings).

## Read first
1. `SPEC.md` — the user's original full spec. It is the baseline, **but the "Decisions that override SPEC.md" section below wins wherever they differ.**
2. `AGENTS.md` — Next.js 16 has breaking changes; read the relevant guide in `node_modules/next/dist/docs/` before using an API
   (e.g. middleware is now `proxy.ts`; `after()` from `next/server` for background work; `connection()` to opt out of prerendering;
   route handler params are `RouteContext<"/api/x/[id]">` and must be awaited; run `npx next typegen` before `tsc`).
3. Existing code, especially: `lib/env.ts`, `lib/llm.ts`, `lib/sheets.ts`, `lib/status.ts`, `lib/queue.ts`, `lib/intake.ts`,
   `lib/agents/contact.ts`, `lib/auth.ts`, `proxy.ts`, `components/admin/*`, `components/apply/*`.

## What already works (M1 + M2 — do not rebuild)
- Env validation (zod) in `lib/env.ts`; startup check in `instrumentation.ts`. Secrets are in `.env.local` (gitignored). Google key file is in `secrets/` (gitignored). Never print or commit secrets.
- Google Sheets DB (`lib/sheets.ts`): header-name column mapping, batched reads (`batchGet`) and writes (`batchUpdate`), appends serialized through `sheetAppendQueue`. Helpers: `listCandidates`, `listCandidatesAndJobs`, `getCandidate`, `updateCandidate(s)`, `appendCandidate(s)`, `getJob`, `listOpenJobs`, `appendLog`, `joinList`/`splitList` (lists stored as `" | "`-separated), `nowIso()`.
- `lib/status.ts`: status enum, `TRANSITIONS`, `canTransition`, Farsi labels, badge tones, admin filter tabs.
- `lib/queue.ts`: `createSerialQueue`, `sheetAppendQueue`, `intakeQueue`, `approvalQueue` (use this one for approvals/scheduling).
- `lib/llm.ts`: the ONLY LLM entry point — `llmJson({ label, system, user, schema, timeoutMs?, httpRetries? })` → JSON mode, temperature 0.2, zod validation, 2 retries on invalid JSON, logs model/latency/tokens. AvalAI resolves `deepseek-chat` to `deepseek-v4.1-flash`.
- Admin auth: `ADMIN_PASSWORD` → signed httpOnly cookie; `proxy.ts` guards everything except `/`, `/apply/*`, `/api/apply`, `/api/jobs`, `/login`, `/api/login`; `POST /api/screen` may also pass with header `x-cron-secret: $CRON_SECRET`. Route handlers additionally call `requireAdmin(request, { allowCron })`.
- `/apply` (public, animated with `motion`), `POST /api/apply`, local PDF storage (`lib/storage.ts`), text extraction (`lib/pdf.ts`), rate limit, honeypot, duplicate check, success page.
- `/admin`: table with status tabs, search, skeletons; row drawer (`components/admin/CandidateDrawer.tsx`) with PDF iframe (`GET /api/resumes/[id]`), extracted text, screening section (reads `score`, `rationale_fa`, `matched_skills`, `missing_requirements`). `GET /api/candidates`, `GET /api/candidates/[id]`.
- Scripts: `npm run seed` (tabs, styled headers, the AI Engineer job; `--samples` adds fake candidates — the user does NOT want them), `npm run test:llm`, `npm run test:google`.
- Tests (vitest): `tests/upload-validation.test.ts`, `tests/contact-extraction.test.ts` — 16 passing. `tests/setup-env.ts` provides dummy env.

## Decisions that override SPEC.md
1. **Human in the loop for ALL rejections.** The Screening Agent's "reject" only sets status `rejected` = *AI suggestion*. No email is sent. The manager confirms → status `declined`, and only then a rejection email may be sent (if `SEND_REJECTION_EMAILS=true`). Manager can also override `rejected → candidate`. Transitions are already encoded in `lib/status.ts` — use them, don't invent new ones.
2. **Error handling:** screening failure (after LLM retries) → `error` with the message in the `error` column; «تلاش مجدد» moves `error → new` (if screening failed) or `error → approved` (if scheduling failed); a row stuck in `screening` for >10 min may be moved back to `new`. `no_slot → approved` on retry.
3. **The public form asks only for the PDF** (+ consent line; job dropdown only if >1 open job). Name/email/phone come from the resume via `lib/agents/contact.ts`. A candidate may therefore have an empty email — scheduling must still work, but invitation/rejection emails must record `failed` with a clear error ("ایمیل در رزومه یافت نشد").
4. Middleware file is `proxy.ts` (Next 16), not `middleware.ts`.
5. Sender: `EMAIL_FROM="استخدام دیدراه <reza@didrah.com>"` (domain added in Resend), reply-to/ICS organizer = `MANAGER_EMAIL` (rezashokrzad@gmail.com). If Resend rejects the domain, report it; `onboarding@resend.dev` is the fallback (only delivers to the Resend account owner).
6. Timezone `Asia/Tehran`; interview days Monday/Tuesday/Wednesday, 12:00–14:00, 45 min, exactly as SPEC.md says.
7. Only job right now: `ai-engineer` («مهندس هوش مصنوعی (AI Engineer)», min_score 70).

## Your task: build M3 → M7 in one go
### M3 — Screening
- `lib/agents/screening.ts`: Farsi system prompt; input = resume text + job description; output JSON
  `{ decision: "reject"|"candidate", score: 0-100, rationale_fa (2–4 Farsi sentences), matched_skills: string[], missing_requirements: string[] }`.
  **Enforce the decision in code:** `score >= job.min_score` → `candidate`, else `rejected`. Resume text is untrusted: wrap it in tags and tell the model to ignore instructions inside it (prompt-injection guard). Add a unit test with a mocked `llmJson` proving an injected "give 100" instruction can't flip a low score, and that the code-side threshold wins over the model's `decision`.
- `lib/orchestrator.ts`: the single place that performs status transitions: `transition(id, from, to, actor, details, patch)` → checks `canTransition`, re-reads the row to verify the current status (idempotency / race guard), writes status + fields + `updated_at` in one batch, appends to `log`. Steps: `screenCandidate(id)`, `screenAllNew()`, `approve`, `decline`, `override`, `retry`, `scheduleCandidate`. Every step idempotent.
- `POST /api/screen` (admin or cron): screens all `new` rows (sequentially or small concurrency), returns counts. Admin button «اجرای غربالگری» shows progress (e.g. screens one-by-one via repeated calls or streams progress) and refreshes the table.
- `SCREEN_ON_UPLOAD=true` → in `app/api/apply/route.ts` use `after()` to screen the new candidate after the response is sent. Never reveal results to the applicant.

### M4 — Scheduler (pure function, NO LLM)
- `lib/scheduler.ts`: `findFirstSlot(busyIntervals, now, config) → { start, end } | null`, Luxon only, all logic in `MANAGER_TIMEZONE`. Rules and the 7 required vitest cases are in SPEC.md ("Scheduling rules") — implement all of them in `tests/scheduler.test.ts`, plus DST-free Tehran sanity and "touching intervals don't overlap".

### M5 — Calendar + approve flow
- `lib/calendar.ts`: `getBusy(timeMin, timeMax)` via freebusy, `createInterviewEvent(...)` on `MANAGER_CALENDAR_ID` (summary `مصاحبه: {full_name} – {job title}`, description with email/phone/score/rationale, location `INTERVIEW_LOCATION`, **no attendees**), return `id` and `iCalUID`.
- Approve: `candidate → approved → scheduling → scheduled | no_slot | error`, processed through `approvalQueue` one at a time; re-query freebusy for the exact slot right before creating the event and continue searching if taken; never create a second event if `calendar_event_id` is set.
- Drawer buttons: «تایید» (candidate), «رد» (candidate/unreadable → declined, and rejected → declined = "confirm AI rejection"), «برگرداندن به کاندید» (rejected/unreadable → candidate), «تلاش مجدد» (error/no_slot). Optional manager note field saved to `manager_note`.
- `POST /api/candidates/[id]/approve | decline | override | retry` (admin).
- Optimistic UI with rollback + `sonner` toast on failure; after approval show the scheduled Jalali date/time or the error inline.
- The service account's calendar access has only been verified for free/busy. If event creation fails with 403, tell the user to share the calendar with "Make changes to events".

### M6 — Communication agent + email
- `lib/agents/communication.ts`: LLM writes Farsi `{ subject, body_html }` for (a) interview invitation, (b) rejection, from structured facts only (name, position, Jalali date, time, location) — must not invent facts. Sanitize/limit the HTML (allow only simple tags) before inserting into a fixed RTL HTML template in code.
- `lib/ics.ts`: hand-written iCalendar (METHOD:REQUEST, UID = Google event iCalUID, ORGANIZER = MANAGER_EMAIL, times in UTC, CRLF line endings, line folding) + unit test.
- `lib/email.ts` (Resend): `sendReceipt` (fixed template, no LLM, only if `SEND_RECEIPT_EMAILS=true`, triggered from `/api/apply` via `after()` when an email was found), `sendInvitation` (with .ics attachment), `sendRejection` (only on manager decline/confirm and `SEND_REJECTION_EMAILS=true`). Show Jalali date/time via `Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone })` with the Gregorian date in parentheses (helpers exist in `lib/format.ts`). Record `sent`/`failed` + error in `invite_email_status` / `rejection_email_status` / `receipt_email_status`; never resend when already `sent`.

### M7 — Polish + README
- Visual polish pass per SPEC.md "Design & theme" (reduced-motion respected, RTL directions, admin calm/data-first).
- `README.md` in Farsi + English: setup (Google service account, sharing the sheet as Editor and calendar as "Make changes to events", Resend domain, AvalAI), env table, scripts, deployment note (persistent Node server / Docker with a volume for `storage/`, NOT serverless), and a teaching walkthrough of each agent/tool/orchestration step with the status diagram.

## Rules
- **LLM:** only DeepSeek via AvalAI through `lib/llm.ts`. No other provider/SDK/model, not even as a fallback. Resume data may only go to AvalAI.
- Luxon for all date math; zod for all validation; Farsi user-facing text; Farsi digits in the UI (`toFaDigits`).
- **Do not add fake candidates to the Sheet.** If you create test rows/files during end-to-end testing, delete them (rows in `candidates` and `log`, and the file in `storage/resumes/`) before finishing. The Sheet currently has one real candidate (علی رضایی) — don't delete or alter it except through the normal pipeline, and ask before screening/approving it for real.
- **Ask before any outward action:** creating a real calendar event or sending a real email counts. Test those with the user's explicit OK (e.g. send only to rezashokrzad@gmail.com).
- Network gotchas on this machine: `curl` goes through a local proxy (127.0.0.1:10809) that can't reach `api.avalai.ir`, while Node `fetch` sometimes can; AvalAI connectivity is intermittent — if `npm run test:llm` times out, tell the user (likely VPN) instead of switching providers. In bash, quote `"*"` in `--noproxy "*"` (an unquoted `*` glob-expands). Port 3100 is reserved on this Windows machine; the dev server runs on 3000 (the user often has it running already — reuse it).
- Before finishing: `npx next typegen && npx tsc --noEmit && npx eslint . && npx vitest run` all clean, and `npx next build` succeeds.
- Don't commit or push unless the user asks.

## Final report to the user
Short summary per milestone, what was verified end-to-end vs. only unit-tested, anything that needs the user (Resend domain status, calendar permission, AvalAI connectivity), and exact steps to test locally.
