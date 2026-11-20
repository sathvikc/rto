/** Display formatting. Pure functions, en-US. */
import { pad2, parseDateKey } from "../domain/dates.js";

const LOCALE = "en-US";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "16:05" -> "4:05 PM"; null -> "—".
 * @param {string | null | undefined} time
 */
export function formatTime(time) {
  if (!time) return "—";

  const [h, m] = time.split(":").map(Number);

  return `${h % 12 === 0 ? 12 : h % 12}:${pad2(m)} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * Hours with an "h" suffix. Quarter-hour values keep their precision
 * (7.75h); anything else gets one decimal unless `digits` is given.
 * @param {number | null | undefined} hours
 * @param {number} [digits]
 */
export function formatHours(hours, digits) {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return "—";
  if (digits !== undefined) return `${hours.toFixed(digits)}h`;

  const r = Math.round(hours * 100) / 100;

  return `${Number.isInteger(r * 4) ? String(r) : r.toFixed(1)}h`;
}

/** @param {number} monthIndex 0-11 */
export const monthShort = (monthIndex) => MONTHS[monthIndex];

/** "2026-11" -> "November" @param {string} key */
export const monthLong = (key) => parseDateKey(`${key}-01`).toLocaleDateString(LOCALE, { month: "long" });

/** "2026-11" -> "Nov 2026" @param {string} key */
export const monthName = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/**
 * "2026-11-19" -> "Thu, Nov 19, 2026" (or without the year).
 * @param {string} key
 * @param {{ year?: boolean }} [options]
 */
export function formatDay(key, { year = true } = {}) {
  return parseDateKey(key).toLocaleDateString(LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
  });
}

/** @param {Date} d  "Wednesday, Nov 25" */
export const formatLongDate = (d) => d.toLocaleDateString(LOCALE, { weekday: "long", month: "short", day: "numeric" });

/** @param {Date} d  "10:05 AM" */
export function formatClock(d) {
  const h = d.getHours();

  return `${h % 12 === 0 ? 12 : h % 12}:${pad2(d.getMinutes())} ${h >= 12 ? "PM" : "AM"}`;
}

/** @param {string} iso */
export const formatShortDate = (iso) => new Date(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });

/**
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 */
export const plural = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

/** @param {string} iso */
export const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/**
 * "Dec 1–4", or "Nov 30 – Dec 4" across months; a single date when equal.
 * @param {string} from "YYYY-MM-DD"
 * @param {string} to
 */
export function formatDateRange(from, to) {
  /** @param {string} key */
  const month = (key) => MONTHS[Number(key.slice(5, 7)) - 1];

  /** @param {string} key */
  const day = (key) => Number(key.slice(8, 10));

  if (from === to) return `${month(from)} ${day(from)}`;

  if (from.slice(0, 7) === to.slice(0, 7)) return `${month(from)} ${day(from)}–${day(to)}`;

  return `${month(from)} ${day(from)} – ${month(to)} ${day(to)}`;
}

/** "2026-11-26" -> "Nov 26" @param {string} key */
export const shortDate = (key) => parseDateKey(key).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });

/** "2026-11-26" -> "Thu" @param {string} key */
export const weekdayShort = (key) => parseDateKey(key).toLocaleDateString(LOCALE, { weekday: "short" });
