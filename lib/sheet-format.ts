/**
 * Cosmetic formatting for the Google Sheet, applied by `npm run seed`.
 *
 * The header row stays in English on purpose: the code finds columns by
 * these exact names. To help Farsi readers, every header cell gets a Farsi
 * note (hover over the cell to see it).
 *
 * Everything here is idempotent — running the seed again just re-applies it.
 */
import type { sheets_v4 } from "googleapis";
import { STATUSES } from "./status";
import { TAB_HEADERS, type Tab } from "./sheets";

/** Brand color #0f766e (same as --brand in globals.css), as 0–1 RGB. */
const BRAND = { red: 15 / 255, green: 118 / 255, blue: 110 / 255 };
const WHITE = { red: 1, green: 1, blue: 1 };

/** Farsi explanation of every column, shown as a note on the header cell. */
const HEADER_NOTES: Record<string, string> = {
  // candidates
  id: "شناسه یکتای متقاضی (همان نام فایل رزومه)",
  full_name: "نام و نام خانوادگی",
  email: "ایمیل متقاضی",
  phone: "شماره تلفن",
  job_id: "شناسه موقعیت شغلی (از برگه jobs)",
  resume_path: "مسیر فایل PDF روی سرور؛ برای داده‌های نمونه خالی است",
  original_filename: "نام اصلی فایل ارسالی (فقط برای نمایش)",
  resume_text: "متن استخراج‌شده از رزومه (حداکثر ۴۰٬۰۰۰ نویسه)",
  status: "وضعیت فعلی در فرایند — منبع اصلی حقیقت",
  score: "امتیاز غربالگری هوش مصنوعی (۰ تا ۱۰۰)",
  rationale_fa: "دلیل امتیاز به زبان فارسی",
  matched_skills: "مهارت‌های منطبق (جداشده با |)",
  missing_requirements: "الزامات برآورده‌نشده (جداشده با |)",
  manager_note: "یادداشت مدیر استخدام",
  interview_start: "شروع مصاحبه (ISO، UTC)",
  interview_end: "پایان مصاحبه (ISO، UTC)",
  calendar_event_id: "شناسه رویداد در Google Calendar",
  invite_email_status: "وضعیت ایمیل دعوت: sent / failed",
  rejection_email_status: "وضعیت ایمیل رد: sent / failed",
  receipt_email_status: "وضعیت ایمیل رسید: sent / failed",
  error: "آخرین پیام خطا",
  consent_at: "زمان رضایت متقاضی به پردازش داده‌ها",
  created_at: "زمان ثبت",
  updated_at: "زمان آخرین تغییر",
  // jobs
  title_fa: "عنوان فارسی موقعیت شغلی",
  description_fa: "شرح شغل و الزامات — ورودی عامل غربالگری",
  min_score: "حداقل امتیاز برای کاندید شدن",
  is_open: "TRUE = در فرم /apply نمایش داده شود",
  // log
  timestamp: "زمان رویداد",
  candidate_id: "شناسه متقاضی",
  from_status: "وضعیت قبلی",
  to_status: "وضعیت جدید",
  actor: "انجام‌دهنده: applicant / agent / manager / system",
  details: "توضیحات",
};

/** Column widths in pixels (default 140). */
const COLUMN_WIDTHS: Record<string, number> = {
  id: 120,
  full_name: 150,
  email: 220,
  resume_text: 320,
  rationale_fa: 320,
  matched_skills: 220,
  missing_requirements: 220,
  manager_note: 220,
  description_fa: 420,
  title_fa: 260,
  error: 240,
  details: 320,
  status: 120,
  score: 70,
  min_score: 90,
  is_open: 80,
};

/** Build the batchUpdate requests that style one tab. */
export function formatTabRequests(tab: Tab, sheetId: number): sheets_v4.Schema$Request[] {
  const headers = TAB_HEADERS[tab] as readonly string[];
  const requests: sheets_v4.Schema$Request[] = [];

  // 1) Freeze the header row so it stays visible while scrolling.
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // 2) Header look: brand background, white bold text, centered.
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
      cell: {
        userEnteredFormat: {
          backgroundColor: BRAND,
          textFormat: { bold: true, foregroundColor: WHITE, fontSize: 10 },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "CLIP",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
    },
  });

  // 3) Data rows: clip long text (resumes!) so rows stay one line high.
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
      cell: { userEnteredFormat: { wrapStrategy: "CLIP", verticalAlignment: "TOP" } },
      fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
    },
  });

  // 4) Taller header row and per-column widths.
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 34 },
      fields: "pixelSize",
    },
  });
  headers.forEach((header, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: COLUMN_WIDTHS[header] ?? 140 },
        fields: "pixelSize",
      },
    });
  });

  // 5) Farsi note on each header cell.
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
      rows: [{ values: headers.map((h) => ({ note: HEADER_NOTES[h] ?? "" })) }],
      fields: "note",
    },
  });

  // 6) Dropdowns that keep hand-edited values valid.
  const dropdown = (column: string, values: readonly string[]) => {
    const col = headers.indexOf(column);
    if (col === -1) return;
    requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 },
        rule: {
          condition: { type: "ONE_OF_LIST", values: values.map((v) => ({ userEnteredValue: v })) },
          showCustomUi: true,
          strict: false, // warn, don't block — the app is the real guard
        },
      },
    });
  };
  if (tab === "candidates") dropdown("status", STATUSES);
  if (tab === "jobs") dropdown("is_open", ["TRUE", "FALSE"]);
  if (tab === "log") dropdown("actor", ["applicant", "agent", "manager", "system"]);

  return requests;
}
