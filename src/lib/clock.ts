import type { Locale } from "./types";

const TZ = "Asia/Hong_Kong";

export function clockDate(iso: string) {
  return new Date(iso);
}

export function clockParts(iso: string) {
  const d = clockDate(iso);
  const fmt = new Intl.DateTimeFormat("en-HK", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekdayEn = new Intl.DateTimeFormat("en-HK", { timeZone: TZ, weekday: "long" }).format(d);
  const weekdayZh = new Intl.DateTimeFormat("zh-HK", { timeZone: TZ, weekday: "long" }).format(d);
  return {
    year: map.year,
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekdayEn,
    weekdayZh,
    dateKey: `${map.year}-${String(map.month).padStart(2, "0")}-${String(map.day).padStart(2, "0")}`,
  };
}

export function formatDate(iso: string, locale: Locale) {
  const p = clockParts(iso);
  return locale === "en"
    ? `${p.day} ${monthEn(p.month)} · ${p.weekdayEn}`
    : `${p.month}月${p.day}日 · ${p.weekdayZh}`;
}

export function formatTime(iso: string, locale: Locale) {
  const p = clockParts(iso);
  const h = p.hour;
  const m = String(p.minute).padStart(2, "0");
  if (locale === "en") {
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${suffix}`;
  }
  const period = h < 12 ? "上午" : "下午";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period}${h12}:${m}`;
}

export function formatDateTime(iso: string, locale: Locale) {
  const p = clockParts(iso);
  if (locale === "en") {
    return `${p.weekdayEn} ${p.day} ${monthEn(p.month)}, ${formatTime(iso, "en")}`;
  }
  return `${p.month}月${p.day}日（${p.weekdayZh}）${formatTime(iso, "zh-HK")}`;
}

export function formatShortDate(iso: string, locale: Locale) {
  const p = clockParts(iso);
  return locale === "en" ? `${p.day} ${monthEn(p.month)}` : `${p.month}月${p.day}日`;
}

function monthEn(month: number) {
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1];
}

export function addMinutes(iso: string, minutes: number) {
  return new Date(clockDate(iso).getTime() + minutes * 60_000).toISOString().replace("Z", "+00:00");
}

export function isSameDay(a: string, b: string) {
  return clockParts(a).dateKey === clockParts(b).dateKey;
}

export function formatIcsUtc(iso: string) {
  const d = clockDate(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}
