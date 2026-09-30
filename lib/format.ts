/**
 * Display helpers: Farsi digits and Jalali (Persian calendar) dates.
 * Safe to import from both server and client components.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** "12:30" → "۱۲:۳۰". Use for everything shown to people. */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** "۱۲:۳۰" or "١٢:٣٠" → "12:30". Use before processing or storing. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** ISO timestamp → "۸ مهر ۱۴۰۵، ۱۲:۳۰" in the given timezone. "" for empty input. */
export function formatJalaliDateTime(iso: string, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** ISO timestamp → "دوشنبه ۱۴ مهر ۱۴۰۵". */
export function formatJalaliDate(iso: string, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** ISO timestamp → "۱۲:۳۰". */
export function formatTime(iso: string, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fa-IR", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );
}

/** ISO timestamp → "5 October 2026" (Gregorian, shown in parentheses next to the Jalali date). */
export function formatGregorianDate(iso: string, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
