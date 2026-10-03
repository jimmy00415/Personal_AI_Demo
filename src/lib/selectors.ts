import { buildBrief, briefToText } from "./demo/brief";
import type { DemoState } from "./demo/types";
import { selectSharingProjection } from "./demo/sharing";
import { appointments, bpReadings, currentDemo } from "./seed";
import { translate } from "./i18n";
import { selectBpAverage } from "./demo/selectors";
import { clockParts } from "./clock";
import type { Answers, Appointment, BookingStatus, JourneyPhase } from "./types";
import type { Locale, Localized } from "./types";

export function michelleBp() {
  return bpReadings.filter((r) => r.personId === "michelle");
}

export function motherBp() {
  const s = currentDemo();
  return selectSharingProjection(s, s.context.patientId, "david").observations.map(r => ({ ...r, personId: "lai-wah" as const }));
}

export function bpAverage() {
  const state = currentDemo();
  return state.context.actorId === "may" ? selectBpAverage(state) ?? { systolic: 0, diastolic: 0 } : { systolic: 0, diastolic: 0 };
}

export function latestMichelleBp() {
  return michelleBp()[michelleBp().length - 1];
}

export function michelleAppt(list: Appointment[] = appointments) {
  return list.find((a) => a.personId === "michelle");
}

export function motherAppt() {
  const s = currentDemo();
  const appointment = selectSharingProjection(s, s.context.patientId, "david").appointments.find(a => a.status === "scheduled");
  return { id: appointment?.id ?? "unshared", personId: "lai-wah" as const, title: appointment?.title ?? { zh: "", en: "" }, at: appointment?.scheduledAt ?? s.clock };
}

const ONSET_TEXT: Record<NonNullable<Answers["onset"]>, Localized> = {
  "after-waking": { zh: "今早起床後開始", en: "Started after getting up this morning" },
  "just-now": { zh: "剛剛開始", en: "Started just now" },
  yesterday: { zh: "昨天已經開始", en: "Started yesterday" },
  other: { zh: "開始時間為其他時間", en: "Started at another time" },
};

const CHANGE_TEXT: Record<NonNullable<Answers["change"]>, Localized> = {
  better: { zh: "你表示目前較剛才減輕", en: "you say it is easier than earlier" },
  same: { zh: "你表示與剛才差不多", en: "you say it is about the same as earlier" },
  worse: { zh: "你表示比剛才嚴重", en: "you say it is worse than earlier" },
  unclear: { zh: "你表示現在說不清楚", en: "you say it is hard to say" },
};

/** The one place the dizziness is described, so no view can contradict the user's answers. */
export function symptomLine(answers: Pick<Answers, "onset" | "change">, locale: Locale) {
  const pick = (text: Localized) => (locale === "en" ? text.en : text.zh);
  const onset = answers.onset ? ONSET_TEXT[answers.onset] : { zh: "開始時間未記錄", en: "Start time not recorded" };
  const change = answers.change ? CHANGE_TEXT[answers.change] : { zh: "變化未記錄", en: "change not recorded" };
  return locale === "en" ? `${pick(onset)}; ${pick(change)}` : `${pick(onset)}；${pick(change)}`;
}

export function todayHero(
  clock: string,
  episodeSaved: boolean,
  nextMorning: Answers["nextMorning"],
  bookingStatus: BookingStatus = "none",
  phase?: JourneyPhase,
) {
  if (phase === "urgent_help") {
    return { kind: "urgent" as const, titleKey: "today.heroUrgent" as const, bodyKey: "today.heroUrgentBody" as const };
  }
  const next = clockParts(clock).dateKey === "2026-09-17";
  if (next && nextMorning === "no-dizzy") {
    return { kind: "logged" as const, titleKey: "today.loggedNo" as const, bodyKey: "today.contactPending" as const };
  }
  if (next) {
    return { kind: "next" as const, titleKey: "today.heroNext" as const, bodyKey: "today.heroNextBody" as const };
  }
  if (episodeSaved && bookingStatus === "booked") {
    return { kind: "booked" as const, titleKey: "today.heroBooked" as const, bodyKey: "today.heroBookedBody" as const };
  }
  if (episodeSaved) {
    return { kind: "saved" as const, titleKey: "today.heroSaved" as const, bodyKey: "today.heroSavedBody" as const };
  }
  return { kind: "open" as const, titleKey: "today.heroOpen" as const, bodyKey: "today.heroOpenBody" as const };
}

/** Compatibility entry; canonical sources alone compose the preview packet. */
export function briefText(state: { demo?: DemoState; clock: string; episodeSaved: boolean; answers: Answers; questions: { added: boolean; text: Localized }[]; appointments?: Appointment[] }, locale: Locale) {
  const demo = state.demo ?? currentDemo();
  const appointment = demo.appointments.find(a => a.patientId === demo.context.patientId && a.status === "scheduled");
  if (!appointment) return translate("book.noScheduled", locale);
  const recipientId = demo.context.actorId === "david" ? "david" : undefined;
  const prior = demo.briefs.filter(b => b.appointmentId === appointment.id && b.recipientId === (recipientId ?? "may")).at(-1);
  const result = buildBrief(demo, demo.context.patientId, { appointmentId: appointment.id, includeMood: prior?.includeMood ?? true, recipientId });
  return result.ok ? briefToText(result.value, locale) : translate("packet.unavailable", locale);
}

const SCRIPT_ONSET: Record<NonNullable<Answers["onset"]>, Localized> = {
  "after-waking": { zh: "今早起床後", en: "since getting up this morning" },
  "just-now": { zh: "剛剛開始", en: "since a few minutes ago" },
  yesterday: { zh: "由昨天開始", en: "since yesterday" },
  other: { zh: "近日", en: "recently" },
};

export function contactScript(locale: Locale, answers: Pick<Answers, "onset">) {
  const onset = answers.onset ? SCRIPT_ONSET[answers.onset] : { zh: "今早", en: "this morning" };
  return locale === "en"
    ? `I have felt dizzy ${onset.en}. Recent blood-pressure readings are higher than before; this morning was 151/94. I would like a clinician to advise whether I need an earlier visit. I have organised recent readings, medicines, and lab results.`
    : `我${onset.zh}有頭暈，最近幾次血壓讀數較之前高，今早是151/94。想請醫護評估是否需要提早求診。我已整理最近的讀數、用藥和化驗資料。`;
}
