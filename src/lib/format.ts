/**
 * Locale utilities — Persian digits and Jalali dates.
 * All customer-facing numbers go through these helpers so the UI never shows
 * Latin digits.
 */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert every ASCII digit in a string (or number) to Persian digits. */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d);
}

/** Format a number as a Persian price: 1,250,000 → ۱٬۲۵۰٬۰۰۰. */
export function formatPrice(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

/**
 * Format a date in the Jalali (Persian) calendar, e.g. ۱۴۰۴/۰۶/۲۲.
 * Defaults to a full "year, month name, day" rendering; pass options to
 * customise (e.g. { year: "numeric", month: "2-digit", day: "2-digit" }).
 * Provided for later steps (orders, delivery dates) — not used by the UI yet.
 */
export function formatJalaliDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }
): string {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR", options).format(parsed);
}

/** Current Jalali year as Persian digits — for footers/copyright lines. */
export function getCurrentJalaliYear(): string {
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric" }).format(new Date());
}