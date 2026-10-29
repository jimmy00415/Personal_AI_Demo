import type { Locale, Localized } from "./types";

export type AppRole = "patient" | "family" | "caregiver";
export type SupporterRole = Exclude<AppRole, "patient">;

export const ROLE_META: Record<AppRole, { label: Localized; description: Localized; short: Localized }> = {
  patient: {
    label: { zh: "長期病患者", en: "Patient" },
    short: { zh: "個人照護", en: "My care" },
    description: { zh: "AI 助手、用藥提醒、健康共享", en: "AI assistant, medication reminders and sharing" },
  },
  family: {
    label: { zh: "家人", en: "Family" },
    short: { zh: "家人關懷", en: "Family care" },
    description: { zh: "共享健康數據、異常提醒", en: "Shared health data and attention alerts" },
  },
  caregiver: {
    label: { zh: "照護者", en: "Caregiver" },
    short: { zh: "照護工作台", en: "Care workspace" },
    description: { zh: "共享數據、異常提醒、照護清單", en: "Shared health, attention alerts and a care checklist" },
  },
};

export const APP_ROLES: AppRole[] = ["patient", "family", "caregiver"];
export function isAppRole(value: unknown): value is AppRole {
  return value === "patient" || value === "family" || value === "caregiver";
}
export function roleLabel(role: AppRole, locale: Locale) {
  return ROLE_META[role].label[locale === "en" ? "en" : "zh"];
}
