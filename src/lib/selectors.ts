import { averageBp, appointments, bpReadings, michelleMeds, allergy, report } from "./seed";
import { formatDateTime, formatShortDate, formatTime } from "./clock";
import type { Answers, Appointment, BookingStatus } from "./types";
import type { Locale, Localized } from "./types";

export function michelleBp() {
  return bpReadings.filter((r) => r.personId === "michelle");
}

export function motherBp() {
  return bpReadings.filter((r) => r.personId === "lai-wah");
}

export function bpAverage() {
  return averageBp(michelleBp());
}

export function latestMichelleBp() {
  return michelleBp()[michelleBp().length - 1];
}

export function michelleAppt(list: Appointment[] = appointments) {
  return list.find((a) => a.personId === "michelle")!;
}

export function motherAppt() {
  return appointments.find((a) => a.personId === "lai-wah")!;
}

export function todayHero(
  clock: string,
  episodeSaved: boolean,
  nextMorning: Answers["nextMorning"],
  bookingStatus: BookingStatus = "none",
) {
  const next = clock.startsWith("2026-09-17");
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

export function briefText(
  state: {
    clock: string;
    episodeSaved: boolean;
    answers: Answers;
    questions: { added: boolean; text: Localized }[];
    appointments?: Appointment[];
  },
  locale: Locale,
) {
  const L = (x: Localized) => (locale === "en" ? x.en : x.zh);
  const avg = bpAverage();
  const lines = [
    locale === "en" ? "Consultation brief — Michelle Chan" : "就診摘要 — 陳美玲",
    formatDateTime(state.clock, locale),
    "",
    locale === "en" ? "1. What to discuss" : "1. 今天希望處理的問題",
    L({
      zh: "今早頭暈，最近血壓較之前高，想了解是否需要提早評估。",
      en: "Dizziness this morning and recent blood pressure higher than before — ask whether an earlier review is needed.",
    }),
    locale === "en" ? "Source: organised by CareMate" : "來源：康伴整理",
    "",
    locale === "en" ? "2. Symptoms and timing" : "2. 症狀及時間",
    state.episodeSaved
      ? L({
          zh: "頭暈：今早起床後開始；你表示目前較剛才減輕。上午8:35記錄「今朝有少少頭暈。」",
          en: "Dizziness: started after getting up this morning; you say it is easier than earlier. Note at 8:35 am: “A bit dizzy this morning.”",
        })
      : L({ zh: "上午8:35記錄「今朝有少少頭暈。」尚未完成整理。", en: "Note at 8:35 am: “A bit dizzy this morning.” Not yet organised." }),
    locale === "en" ? "Source: added by you" : "來源：本人補充",
    "",
    locale === "en" ? "3. Recent blood pressure" : "3. 最近血壓紀錄",
    ...michelleBp().map((r) => `${formatShortDate(r.occurredAt, locale)} ${formatTime(r.occurredAt, locale)} · ${r.systolic}/${r.diastolic} mmHg`),
    `${locale === "en" ? "7-day average" : "近7日平均"} · ${avg.systolic}/${avg.diastolic} mmHg`,
    locale === "en" ? "Source: home measurement" : "來源：家居量度",
    "",
    locale === "en" ? "4. Medicines and allergy" : "4. 已儲存的用藥及過敏資料",
    ...michelleMeds.map((m) => `${m.name} ${L(m.dose)}`),
    `Penicillin · ${locale === "en" ? "entered by you" : "由你先前輸入"}`,
    state.answers.medGap === "taken-unlogged"
      ? L({ zh: "9月14日晚上Atorvastatin：你表示已服藥（補記）。", en: "Atorvastatin, 14 September evening: you say it was taken (noted by you)." })
      : state.answers.medGap === "not-taken"
        ? L({ zh: "9月14日晚上Atorvastatin：你表示沒有服藥。", en: "Atorvastatin, 14 September evening: you say it was not taken." })
        : L({ zh: "9月14日晚上Atorvastatin：紀錄空缺，狀態未確定。", en: "Atorvastatin, 14 September evening: no confirmation; status unknown." }),
    locale === "en" ? "Source: added by you" : "來源：本人補充",
    "",
    locale === "en" ? "5. Recent lab results" : "5. 新近化驗結果",
    ...report.results.map((r) => `${L(r.name)} ${r.value} ${r.unit}`),
    locale === "en" ? "Source: imported report" : "來源：已匯入報告",
    "",
    locale === "en" ? "6. Questions" : "6. 希望向醫生確認的問題",
    ...state.questions.filter((q) => q.added).map((q) => `• ${L(q.text)}`),
    "",
    locale === "en" ? "Appointment" : "覆診時間",
    formatDateTime(michelleAppt(state.appointments).at, locale),
  ];
  return lines.join("\n");
}

export function contactScript(locale: Locale) {
  return locale === "en"
    ? "I have felt dizzy since getting up this morning. Recent blood-pressure readings are higher than before; this morning was 151/94. I would like a clinician to advise whether I need an earlier visit. I have organised recent readings, medicines, and lab results."
    : "我今早起床後有頭暈，最近幾次血壓讀數較之前高，今早是151/94。想請醫護評估是否需要提早求診。我已整理最近的讀數、用藥和化驗資料。";
}
