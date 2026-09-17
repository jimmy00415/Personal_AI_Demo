import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale, Localized } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function tx(text: Localized, locale: Locale) {
  return locale === "en" ? text.en : text.zh;
}

export function formatDemoDate(iso: string, locale: Locale) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    const [datePart, timePart] = iso.split("T");
    if (!timePart) return iso;
    const time = timePart.slice(0, 5);
    return formatDemoDateTime(datePart, time, locale);
  }
  return new Intl.DateTimeFormat(locale === "en" ? "en-HK" : "zh-HK", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatDemoDateTime(date: string, time: string, locale: Locale) {
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return `${date} ${time}`;
  return new Intl.DateTimeFormat(locale === "en" ? "en-HK" : "zh-HK", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function averageBp(readings: { systolic: number; diastolic: number }[]) {
  if (readings.length === 0) return { systolic: 0, diastolic: 0 };
  const systolic = Math.round(
    readings.reduce((sum, r) => sum + r.systolic, 0) / readings.length,
  );
  const diastolic = Math.round(
    readings.reduce((sum, r) => sum + r.diastolic, 0) / readings.length,
  );
  return { systolic, diastolic };
}
