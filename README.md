# سامانه استخدام دیدراه / Didrah recruitment pipeline

A teaching project: a stateful, human-in-the-loop hiring pipeline.

An applicant uploads a PDF. The file stays on this machine, a row is added to Google Sheets, and an AI screens the resume. A manager approves or declines in a Farsi admin UI. On approval the system books the first free slot in the manager's Google Calendar and emails the candidate a Farsi invitation with an `.ics` file.

The **status column in the sheet is the only source of truth.** The process can stop while it waits for the manager and resume later by reading that column.

```
new ──► screening ──► candidate ──► approved ──► scheduling ──► scheduled
                 │            │                             ├─► no_slot
                 │            └─► declined                  └─► error
                 └─► rejected (AI suggestion) ──► declined   (manager confirms)
                                             └──► candidate  (manager override)
unreadable ──► candidate | declined
```

`rejected` is only the model's suggestion. A rejection email is sent only after the manager moves the row to `declined`, and only when `SEND_REJECTION_EMAILS=true`.

---

## English

### Stack

Next.js (App Router) + TypeScript, Tailwind, Google Sheets and Calendar (service account), Resend, Luxon, zod, vitest, pdf-parse. The only model is DeepSeek through AvalAI, and every call goes through `lib/llm.ts`.

### Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in. Never commit `.env.local` or `secrets/`.
3. Google Cloud: create a service account, enable the **Google Sheets API** and **Google Calendar API**, and download a JSON key.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` is the service-account email.
   - `GOOGLE_PRIVATE_KEY` is the key's `private_key`, in double quotes, with literal `\n`.
4. Create a Google Sheet and share it with the service account as **Editor**. `SHEET_ID` is the id in the sheet URL.
5. In Google Calendar, share the manager's calendar with the service account as **Make changes to events**. Free/busy access is not enough to create the interview. `MANAGER_CALENDAR_ID` is that calendar's id (often the manager's email).
6. [AvalAI](https://avalai.ir): set `AVALAI_API_KEY`, `AVALAI_BASE_URL` (default `https://api.avalai.ir/v1`) and `LLM_MODEL` (default `deepseek-chat`).
7. [Resend](https://resend.com): verify the sending domain and set `RESEND_API_KEY` and `EMAIL_FROM` (for example `استخدام دیدراه <reza@didrah.com>`). `onboarding@resend.dev` only delivers to the address that owns the Resend account. Reply-To and the calendar organizer are `MANAGER_EMAIL`.
8. Choose `ADMIN_PASSWORD` (8+ characters) and `CRON_SECRET` (16+ characters).

Create the tabs and the open job:

```bash
npm run seed
```

Check the three outside services:

```bash
npm run test:llm      # AvalAI answers with the configured model
npm run test:google   # the sheet reads, and free/busy works
npm test              # unit tests, no network
npm run dev           # http://localhost:3000
```

`/apply` is public. Everything else asks for the admin password at `/login`.

### Environment

| Variable | Role |
| --- | --- |
| `AVALAI_API_KEY`, `AVALAI_BASE_URL`, `LLM_MODEL` | DeepSeek via AvalAI. No other model is used. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SHEET_ID` | Sheets database |
| `MANAGER_CALENDAR_ID`, `MANAGER_TIMEZONE`, `MANAGER_NAME`, `MANAGER_EMAIL`, `INTERVIEW_LOCATION` | Whose calendar, which timezone (`Asia/Tehran`), what the invitation says |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SEND_REJECTION_EMAILS`, `SEND_RECEIPT_EMAILS` | Mail. Both send flags default as in `.env.example`. |
| `RESUME_STORAGE_DIR`, `MAX_RESUME_MB`, `SCREEN_ON_UPLOAD` | Local PDFs. Screening can run right after upload. |
| `SLOT_STEP_MINUTES`, `MIN_LEAD_HOURS`, `SEARCH_WEEKS` | Scheduler. Mon–Wed 12:00–14:00, 45 minutes, last start 13:15. |
| `ADMIN_PASSWORD`, `CRON_SECRET` | Admin cookie, and the `x-cron-secret` header for `POST /api/screen`. |

`lib/env.ts` checks all of these at startup (`instrumentation.ts`) and turns `\n` in the private key back into newlines.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run seed` | Create the `candidates`, `jobs` and `log` tabs, style the headers, insert the open AI Engineer job |
| `npm run test:llm` | One JSON ping to AvalAI |
| `npm run test:google` | Read the sheet and query free/busy for the next 7 days |
| `npm test` | vitest: upload rules, scheduler, screening threshold, ICS, approve idempotency |
| `npm run build` && `npm start` | Production. Use this, not a serverless host. |

### Deployment

Resumes are files on disk (`storage/resumes/{id}.pdf`, gitignored, not under `public/`). The app must be a **long-running Node process**:

```bash
npm run build
npm start
```

On Docker, mount a volume at `storage/` (or whatever `RESUME_STORAGE_DIR` points to). Do not deploy to serverless hosting: the disk would be wiped, and the in-process queues that serialize sheet appends and calendar bookings only work inside one process.

`POST /api/screen` with header `x-cron-secret: $CRON_SECRET` screens every `new` row. Point a cron job at it if `SCREEN_ON_UPLOAD` is off.

### How the pieces fit (teaching walkthrough)

Each step lives in its own file. The orchestrator is the only code that changes `status`.

1. **`app/api/apply/route.ts` + `lib/intake.ts`** — Public upload. The form asks for the PDF (and the job, if more than one is open) plus consent. Name, email and phone are read from the resume. Rate limit, honeypot, `%PDF` magic bytes, duplicate email+job, then save `storage/resumes/{id}.pdf`. The applicant's filename is never used as a path.
2. **`lib/pdf.ts`** — Extract text, normalize Arabic ي/ك and digits, cut at 40,000 characters. Almost no text → status `unreadable` instead of `new`.
3. **`lib/agents/contact.ts`** — Contact Extraction Agent. The model proposes name, email and phone; the code keeps a value only when it actually appears in the resume. Regex is the fallback.
4. **`lib/sheets.ts`** — The database. Columns are found by header name. Reads are batched; appends go through `sheetAppendQueue` so two uploads cannot collide.
5. **`lib/agents/screening.ts`** — Screening Agent. Farsi prompt, resume wrapped in `<resume>` so instructions inside it are data. Output is `{ decision, score, rationale_fa, matched_skills, missing_requirements }`. **The code sets the decision:** `score >= job.min_score` → `candidate`, otherwise `rejected`. A human still confirms a rejection.
6. **`lib/orchestrator.ts`** — `transition()` checks the allowed edge, re-reads the row, writes status plus fields, and appends to `log`. `screenCandidate`, `approve`, `decline`, `override`, `retry`. A screening failure becomes `error` prefixed with `غربالگری ناموفق بود`. A row stuck in `screening` for over 10 minutes can return to `new`.
7. **`POST /api/screen`** — Admin button «اجرای غربالگری» screens one row per request and shows progress. Cron sends `mode: "all"`. If `SCREEN_ON_UPLOAD=true`, `after()` screens once the applicant already has the success page. The applicant never sees the score.
8. **`lib/scheduler.ts`** — Pure function `findFirstSlot(busy, now, config)`. No model. Luxon, timezone `Asia/Tehran`. Monday–Wednesday, 12:00–14:00, 45 minutes, step 15, at least `MIN_LEAD_HOURS` ahead, horizon `SEARCH_WEEKS`. An event that ends at 12:00 does not block 12:00.
9. **`lib/calendar.ts`** — `getBusy` (free/busy) and `createInterviewEvent`. Summary `مصاحبه: {name} – {job}`. No attendees. Approvals run one at a time on `approvalQueue`. Immediately before creating the event, free/busy is queried again for that slot; if it was taken, the search continues. If `calendar_event_id` is already set, no second event is created. A 403 means the calendar was not shared as **Make changes to events**.
10. **`lib/agents/communication.ts`** — Communication Agent. Writes Farsi `{ subject, body_html }` for the invitation and the rejection from structured facts only. HTML is reduced to `p`, `br`, `strong` and a few other tags. The date line is added by code, not invented by the model. If the model call fails, a fixed sentence built from the same facts is used.
11. **`lib/ics.ts` + `lib/email.ts`** — Resend. Receipt is a fixed template (no model) when `SEND_RECEIPT_EMAILS=true`. The invitation attaches an `.ics` (`METHOD:REQUEST`, UID = the Google event's iCalUID, organizer = `MANAGER_EMAIL`, times in UTC). The body shows the Jalali date and time, with the Gregorian date in parentheses. Rejection mail goes out only on manager decline. `sent` / `failed: …` is written back to the sheet. `sent` is never sent again. No email on the resume → `failed: ایمیل در رزومه یافت نشد`.
12. **`/admin`** — Farsi, RTL, light theme. Filter tabs, search, drawer with the PDF (`GET /api/resumes/[id]` looks the path up from the sheet; the client cannot pass a path). Buttons: تایید، رد، برگرداندن به کاندید، تلاش مجدد. The table updates optimistically and rolls back with a toast if the request fails.

`lib/llm.ts` is the only door to a model: JSON mode, temperature 0.2, zod, two retries on invalid JSON, and a log line with model, latency and tokens. Resume text is sent only to AvalAI.

### Try it locally

1. `npm run dev`, open `/apply`, upload a text-based PDF.
2. Log in at `/login`, open `/admin`. If `SCREEN_ON_UPLOAD` is on, the row leaves `جدید` on its own; otherwise press «اجرای غربالگری».
3. Open the row. تایید books a slot and shows the Jalali time, or «بدون زمان خالی», or the error (including a missing calendar permission).
4. رد on a `rejected` row confirms the AI suggestion. The rejection email follows only when the flag is on.

Do not point screening or approval at a real candidate unless you mean to. Creating a calendar event and sending mail are live calls.

---

## فارسی

### این پروژه چه می‌کند؟

متقاضی یک PDF در صفحهٔ `/apply` می‌فرستد. فایل روی همین رایانه ذخیره می‌شود، یک ردیف در Google Sheet ساخته می‌شود، و مدل رزومه را می‌سنجد. مدیر در پنل `/admin` تایید یا رد می‌کند. بعد از تایید، سامانه اولین وقت آزاد تقویم مدیر را پیدا می‌کند، رویداد را می‌سازد، و یک ایمیل فارسی با فایل تقویم (`.ics`) برای متقاضی می‌فرستد.

ستون `status` در شیت تنها منبع حقیقت است. کار می‌تواند منتظر مدیر بماند و بعداً از همان ستون ادامه پیدا کند.

`rejected` فقط پیشنهاد هوش مصنوعی است. ایمیل رد فقط وقتی فرستاده می‌شود که مدیر وضعیت را به `declined` ببرد و `SEND_REJECTION_EMAILS=true` باشد.

### راه‌اندازی

1. `npm install`
2. `.env.example` را به `.env.local` کپی کنید و پر کنید. `.env.local` و پوشهٔ `secrets/` را commit نکنید.
3. در Google Cloud یک service account بسازید، APIهای **Google Sheets** و **Google Calendar** را روشن کنید، و کلید JSON را بگیرید.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: ایمیل سرویس‌اکانت
   - `GOOGLE_PRIVATE_KEY`: مقدار `private_key` داخل گیومه، با `\n`
4. یک Google Sheet بسازید و آن را با ایمیل سرویس‌اکانت به صورت **Editor** به اشتراک بگذارید. `SHEET_ID` همان شناسهٔ داخل آدرس شیت است.
5. تقویم مدیر را با سرویس‌اکانت به صورت **Make changes to events** به اشتراک بگذارید. دسترسی free/busy برای ساختن رویداد کافی نیست. `MANAGER_CALENDAR_ID` شناسهٔ همان تقویم است.
6. در AvalAI کلید را در `AVALAI_API_KEY` بگذارید. آدرس پیش‌فرض `https://api.avalai.ir/v1` و مدل پیش‌فرض `deepseek-chat` است. مدل دیگری در این پروژه استفاده نمی‌شود.
7. در Resend دامنهٔ فرستنده را تأیید کنید. `EMAIL_FROM` مثلاً `استخدام دیدراه <reza@didrah.com>`. اگر دامنه رد شد، `onboarding@resend.dev` فقط به ایمیل صاحب حساب Resend می‌رسد. Reply-To و برگزارکنندهٔ تقویم `MANAGER_EMAIL` است.
8. `ADMIN_PASSWORD` (حداقل ۸ نویسه) و `CRON_SECRET` (حداقل ۱۶ نویسه) را انتخاب کنید.

سپس:

```bash
npm run seed          # تب‌ها، سرستون‌ها، و شغل باز «مهندس هوش مصنوعی»
npm run test:llm      # یک درخواست به AvalAI
npm run test:google   # خواندن شیت و free/busy هفت روز آینده
npm test
npm run dev           # http://localhost:3000
```

`/apply` عمومی است. بقیهٔ مسیرها در `/login` رمز مدیر می‌خواهند.

### متغیرهای محیط

جدول بخش English همان فهرست است. اعتبارسنجی در `lib/env.ts` هنگام بالا آمدن سرور انجام می‌شود و `\n` داخل کلید گوگل به خط جدید تبدیل می‌شود.

منطقهٔ زمانی مصاحبه `Asia/Tehran` است. روزها دوشنبه، سه‌شنبه و چهارشنبه، پنجرهٔ ۱۲ تا ۱۴، مدت ۴۵ دقیقه، و آخرین شروع ۱۳:۱۵ است. فاصلهٔ شروع‌ها `SLOT_STEP_MINUTES` (پیش‌فرض ۱۵ دقیقه) و حداقل فاصله از الان `MIN_LEAD_HOURS` (پیش‌فرض ۲۴ ساعت) است. اگر تا `SEARCH_WEEKS` هفته (پیش‌فرض ۶) وقتی پیدا نشود، وضعیت `no_slot` می‌شود.

### اجرا در سرور

فایل رزومه روی دیسک است (`storage/resumes/{id}.pdf`) و از پوشهٔ `public` سرو نمی‌شود. برنامه باید یک فرایند پایدار Node باشد:

```bash
npm run build
npm start
```

در Docker برای `storage/` یک volume بگذارید. میزبانی serverless مناسب نیست: دیسک پاک می‌شود و صف‌های داخل حافظه (برای جلوگیری از برخورد نوشتن شیت و رزرو هم‌زمان یک وقت مصاحبه) فقط در یک فرایند کار می‌کنند.

اگر `SCREEN_ON_UPLOAD` خاموش است، یک cron می‌تواند `POST /api/screen` را با هدر `x-cron-secret` بزند.

### اجزا، به ترتیب آموزش

1. **دریافت رزومه** (`lib/intake.ts`): فرم فقط PDF و رضایت می‌گیرد (و اگر بیش از یک شغل باز باشد، انتخاب شغل). نام و ایمیل و تلفن از خود رزومه خوانده می‌شود. محدودیت تعداد درخواست، فیلد مخفی ضد اسپم، بررسی بایت‌های `%PDF`، و رد کردن ایمیل تکراری برای همان شغل.
2. **استخراج متن** (`lib/pdf.ts`): یکسان‌سازی ی/ک و اعداد، حداکثر ۴۰هزار نویسه. اگر متن خیلی کوتاه باشد (PDF اسکن‌شده) وضعیت `unreadable` است.
3. **عامل استخراج تماس** (`lib/agents/contact.ts`): مدل نام و ایمیل و تلفن را پیشنهاد می‌کند؛ کد فقط مقداری را نگه می‌دارد که واقعاً در متن باشد.
4. **شیت** (`lib/sheets.ts`): تنها پایگاه داده. ستون‌ها با نام سرستون پیدا می‌شوند، نه با شماره. نوشتن ردیف جدید از یک صف سریال می‌گذرد.
5. **عامل غربالگری** (`lib/agents/screening.ts`): متن رزومه بین تگ `<resume>` می‌رود تا دستورهای داخل رزومه نادیده گرفته شوند. تصمیم نهایی را کد می‌گیرد: اگر امتیاز به `min_score` شغل برسد `candidate`، وگرنه `rejected`. ایمیل رد در این مرحله فرستاده نمی‌شود.
6. **ارکستر** (`lib/orchestrator.ts`): تنها جایی که وضعیت عوض می‌شود. هر گام مجاز بودن انتقال را چک می‌کند، ردیف را دوباره می‌خواند، می‌نویسد، و یک خط در تب `log` اضافه می‌کند. خطای غربالگری با پیشوند «غربالگری ناموفق بود» در ستون `error` می‌ماند. ردیفی که بیش از ۱۰ دقیقه در `screening` مانده باشد می‌تواند به `new` برگردد.
7. **دکمهٔ «اجرای غربالگری»**: هر بار یک ردیف `new` را می‌سنجد و پیشرفت را نشان می‌دهد. با `SCREEN_ON_UPLOAD=true` همین کار بعد از پاسخ به متقاضی، در پس‌زمینه، انجام می‌شود. متقاضی نتیجه را نمی‌بیند.
8. **زمان‌بندی** (`lib/scheduler.ts`): تابع خالص `findFirstSlot`، بدون مدل، با Luxon. اگر رویدادی دقیقاً ساعت ۱۲ تمام شود، شروع ۱۲ مجاز است.
9. **تقویم** (`lib/calendar.ts`): رویداد بدون مهمان ساخته می‌شود (سرویس‌اکانت نمی‌تواند مهمان دعوت کند). تاییدها یکی‌یکی از `approvalQueue` می‌گذرند و درست قبل از ساخت رویداد، همان وقت دوباره چک می‌شود. اگر `calendar_event_id` پر باشد رویداد دوم ساخته نمی‌شود. خطای ۴۰۳ یعنی تقویم با سطح «Make changes to events» به اشتراک گذاشته نشده است.
10. **عامل ارتباط** (`lib/agents/communication.ts`): موضوع و بدنهٔ فارسی دعوت یا رد را فقط از واقعیت‌های داده‌شده می‌نویسد. تاریخ شمسی و ساعت، با تاریخ میلادی داخل پرانتز، را خود کد به قالب RTL اضافه می‌کند.
11. **ایمیل** (`lib/email.ts`, `lib/ics.ts`): رسید دریافت قالب ثابت است و فقط با `SEND_RECEIPT_EMAILS`. دعوت‌نامه فایل `.ics` دارد. رد فقط بعد از تایید مدیر. وضعیت `sent` یا `failed` در شیت ذخیره می‌شود و `sent` دوباره فرستاده نمی‌شود. اگر ایمیل در رزومه نباشد: `failed: ایمیل در رزومه یافت نشد`.
12. **پنل مدیر**: تب وضعیت، جستجو، کشو با PDF، دکمه‌های تایید / رد / برگرداندن به کاندید / تلاش مجدد. اگر درخواست شکست بخورد، جدول به حالت قبل برمی‌گردد و یک اعلان نشان داده می‌شود.

همهٔ تماس‌ها با مدل از `lib/llm.ts` رد می‌شوند: خروجی JSON، دمای ۰٫۲، اعتبارسنجی zod، دو بار تلاش دوباره، و ثبت مدل و زمان و تعداد توکن. متن رزومه فقط به AvalAI فرستاده می‌شود.

### آزمون محلی

1. `npm run dev`، صفحهٔ `/apply`، یک PDF متنی.
2. ورود از `/login` و باز کردن `/admin`. اگر غربالگری خودکار روشن باشد ردیف از «جدید» خارج می‌شود؛ وگرنه «اجرای غربالگری» را بزنید.
3. تایید، وقت شمسی را نشان می‌دهد یا «بدون زمان خالی» یا متن خطا را.
4. رد کردن یک ردیف «رد پیشنهادی» یعنی تایید پیشنهاد مدل. ایمیل رد فقط وقتی فلگ روشن باشد می‌رود.

غربالگری یا تایید یک متقاضی واقعی، رویداد تقویم و ایمیل واقعی می‌سازد؛ فقط وقتی این را می‌خواهید انجامش دهید.
