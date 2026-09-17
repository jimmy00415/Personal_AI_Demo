import type {
  Allergy,
  Answers,
  Appointment,
  BpReading,
  CareTask,
  ConsultationQuestion,
  FamilyConsent,
  HealthRecord,
  ImportedReport,
  Medication,
  MedicationDose,
  MemoryItem,
  Person,
  ClinicSlot,
} from "./types";
import { OPENING_CLOCK } from "./types";

export const persons: Person[] = [
  { id: "michelle", name: { zh: "陳美玲", en: "Michelle Chan" }, displayName: "Michelle Chan", age: 56, role: "self" },
  { id: "lai-wah", name: { zh: "陳麗華", en: "Chan Lai-wah" }, displayName: "陳麗華", age: 78, role: "mother" },
];

export const michelleMeds: Medication[] = [
  { id: "med-amlo", personId: "michelle", name: "Amlodipine", dose: { zh: "5 mg，每日一次", en: "5 mg once daily" }, scheduleHour: 19, scheduleMinute: 0 },
  { id: "med-ator", personId: "michelle", name: "Atorvastatin", dose: { zh: "20 mg，每日一次", en: "20 mg once daily" }, scheduleHour: 21, scheduleMinute: 0 },
];

export const allergy: Allergy = {
  id: "all-pen",
  personId: "michelle",
  name: "Penicillin",
  source: "user",
  enteredAt: "2025-03-12T10:00:00+08:00",
};

export const bpReadings: BpReading[] = [
  { id: "bp-10", personId: "michelle", occurredAt: "2026-09-10T08:30:00+08:00", systolic: 139, diastolic: 87 },
  { id: "bp-11", personId: "michelle", occurredAt: "2026-09-11T08:30:00+08:00", systolic: 140, diastolic: 88 },
  { id: "bp-12", personId: "michelle", occurredAt: "2026-09-12T08:30:00+08:00", systolic: 138, diastolic: 86 },
  { id: "bp-13", personId: "michelle", occurredAt: "2026-09-13T08:30:00+08:00", systolic: 143, diastolic: 89 },
  { id: "bp-14", personId: "michelle", occurredAt: "2026-09-14T08:30:00+08:00", systolic: 146, diastolic: 92 },
  { id: "bp-15", personId: "michelle", occurredAt: "2026-09-15T08:30:00+08:00", systolic: 151, diastolic: 94 },
  { id: "bp-16", personId: "michelle", occurredAt: "2026-09-16T08:30:00+08:00", systolic: 151, diastolic: 94 },
  { id: "bp-m-15", personId: "lai-wah", occurredAt: "2026-09-15T08:20:00+08:00", systolic: 138, diastolic: 82 },
];

export function averageBp(list: BpReading[]) {
  if (list.length === 0) return { systolic: 0, diastolic: 0 };
  return {
    systolic: Math.round(list.reduce((s, r) => s + r.systolic, 0) / list.length),
    diastolic: Math.round(list.reduce((s, r) => s + r.diastolic, 0) / list.length),
  };
}

export function createAppointments(): Appointment[] {
  return [
    { id: "appt-gp", personId: "michelle", title: { zh: "家庭醫生覆診", en: "Family doctor follow-up" }, at: "2026-09-22T14:30:00+08:00" },
    { id: "appt-mum", personId: "lai-wah", title: { zh: "覆診", en: "Follow-up appointment" }, at: "2026-09-23T10:00:00+08:00" },
  ];
}

export const appointments = createAppointments();

export const clinicSlots: ClinicSlot[] = [
  {
    id: "slot-17-1100",
    personId: "michelle",
    at: "2026-09-17T11:00:00+08:00",
    clinic: { zh: "家庭醫生診所", en: "Family doctor clinic" },
    reason: { zh: "較早處理今早頭暈及近期血壓", en: "Earlier review of this morning’s dizziness and recent blood pressure" },
    recommended: true,
  },
  {
    id: "slot-18-1530",
    personId: "michelle",
    at: "2026-09-18T15:30:00+08:00",
    clinic: { zh: "家庭醫生診所", en: "Family doctor clinic" },
    reason: { zh: "本週稍後覆診", en: "Later this week" },
  },
  {
    id: "slot-22-1430",
    personId: "michelle",
    at: "2026-09-22T14:30:00+08:00",
    clinic: { zh: "家庭醫生診所", en: "Family doctor clinic" },
    reason: { zh: "保持原定覆診", en: "Keep the booked follow-up" },
    current: true,
  },
];

export function createDoses(): MedicationDose[] {
  return [
    { id: "dose-amlo-15", personId: "michelle", medicationId: "med-amlo", scheduledAt: "2026-09-15T19:00:00+08:00", status: "recorded_taken", occurrenceAt: "2026-09-15T19:04:00+08:00", enteredAt: "2026-09-15T19:04:00+08:00" },
    { id: "dose-ator-14", personId: "michelle", medicationId: "med-ator", scheduledAt: "2026-09-14T21:00:00+08:00", status: "unknown", occurrenceAt: null, enteredAt: null },
    { id: "dose-amlo-14", personId: "michelle", medicationId: "med-amlo", scheduledAt: "2026-09-14T19:00:00+08:00", status: "recorded_taken", occurrenceAt: "2026-09-14T19:10:00+08:00", enteredAt: "2026-09-14T19:10:00+08:00" },
  ];
}

export function createTasks(): CareTask[] {
  return [
    { id: "task-bp", personId: "michelle", date: "2026-09-16", time: "08:30", title: { zh: "血壓紀錄", en: "Blood-pressure record" }, kind: "bp", state: "completed" },
    { id: "task-amlo", personId: "michelle", date: "2026-09-16", time: "19:00", title: { zh: "Amlodipine", en: "Amlodipine" }, kind: "medication", state: "not_due" },
    { id: "task-ator", personId: "michelle", date: "2026-09-16", time: "21:00", title: { zh: "Atorvastatin", en: "Atorvastatin" }, kind: "medication", state: "not_due" },
  ];
}

export const report: ImportedReport = {
  id: "rpt-13",
  personId: "michelle",
  title: { zh: "血液化驗", en: "Blood test" },
  occurredAt: "2026-09-13T10:20:00+08:00",
  enteredAt: "2026-09-13T10:20:00+08:00",
  results: [
    {
      id: "lab-hba1c",
      name: { zh: "糖化血紅蛋白 HbA1c", en: "HbA1c" },
      value: "6.4",
      unit: "%",
      explain: {
        zh: "HbA1c反映過去約3個月的平均血糖水平。這次結果可與過往紀錄一起交給醫生評估；單看這項數字，不能判斷今早頭暈的原因。",
        en: "HbA1c reflects average blood glucose over about three months. Take this result to your clinician with your other records. This number alone cannot explain this morning’s dizziness.",
      },
    },
    {
      id: "lab-ldl",
      name: { zh: "低密度脂蛋白膽固醇 LDL", en: "LDL cholesterol" },
      value: "2.7",
      unit: "mmol/L",
      explain: {
        zh: "LDL是血液中的一種膽固醇。這次結果應連同整體心血管風險，交由醫生解讀。",
        en: "LDL is a type of blood cholesterol. A clinician should interpret this together with overall cardiovascular risk.",
      },
    },
    {
      id: "lab-cr",
      name: { zh: "肌酐 Creatinine", en: "Creatinine" },
      value: "71",
      unit: "μmol/L",
      explain: {
        zh: "肌酐常用作了解腎功能的參考。這次數字應由醫生結合其他檢查一併評估。",
        en: "Creatinine is often used when reviewing kidney function. A clinician should interpret this with your other tests.",
      },
    },
  ],
};

export function createRecords(): HealthRecord[] {
  return [
    {
      id: "rec-dizzy",
      personId: "michelle",
      kind: "symptom",
      occurredAt: "2026-09-16T08:35:00+08:00",
      enteredAt: "2026-09-16T08:35:00+08:00",
      title: { zh: "頭暈紀錄", en: "Dizziness note" },
      summary: { zh: "今朝有少少頭暈。", en: "A bit dizzy this morning." },
      provenance: { source: "user", occurredAt: "2026-09-16T08:35:00+08:00", enteredAt: "2026-09-16T08:35:00+08:00" },
    },
    {
      id: "rec-note-aug",
      personId: "michelle",
      kind: "note",
      occurredAt: "2026-08-22T14:30:00+08:00",
      enteredAt: "2026-08-22T16:00:00+08:00",
      title: { zh: "覆診筆記", en: "Consultation note" },
      summary: { zh: "維持現有藥物，四星期後覆診。", en: "Continue current medicines. Follow-up in four weeks." },
      provenance: { source: "user", occurredAt: "2026-08-22T14:30:00+08:00", enteredAt: "2026-08-22T16:00:00+08:00" },
    },
    {
      id: "rec-report",
      personId: "michelle",
      kind: "report",
      occurredAt: "2026-09-13T10:20:00+08:00",
      enteredAt: "2026-09-13T10:20:00+08:00",
      title: { zh: "血液化驗", en: "Blood test" },
      summary: { zh: "HbA1c 6.4%；LDL 2.7 mmol/L；肌酐 71 μmol/L", en: "HbA1c 6.4%; LDL 2.7 mmol/L; creatinine 71 μmol/L" },
      provenance: { source: "imported", occurredAt: "2026-09-13T10:20:00+08:00", enteredAt: "2026-09-13T10:20:00+08:00" },
    },
  ];
}

export function createMemories(): MemoryItem[] {
  return [
    {
      id: "mem-pen",
      personId: "michelle",
      value: { zh: "對 Penicillin 過敏", en: "Penicillin allergy" },
      detail: { zh: "由你先前輸入。未經驗證為醫護確認。", en: "Entered by you earlier. Not marked as clinician-verified." },
      source: "user",
      enteredAt: "2025-03-12T10:00:00+08:00",
      excluded: false,
    },
    {
      id: "mem-meds",
      personId: "michelle",
      value: { zh: "Amlodipine 5 mg、Atorvastatin 20 mg，每日一次", en: "Amlodipine 5 mg and Atorvastatin 20 mg once daily" },
      detail: { zh: "已儲存的用藥資料，晚上分別於19:00及21:00。", en: "Saved medication list, evenings at 19:00 and 21:00." },
      source: "user",
      enteredAt: "2026-08-22T16:00:00+08:00",
      excluded: false,
    },
    {
      id: "mem-gap",
      personId: "michelle",
      value: { zh: "9月14日晚上的Atorvastatin尚未有服藥紀錄", en: "No recorded confirmation for Atorvastatin on the evening of 14 September" },
      detail: { zh: "紀錄空缺，不代表未服藥。待你確認。", en: "A missing record is not the same as a missed dose. Waiting for your confirmation." },
      source: "organised",
      enteredAt: "2026-09-16T08:45:00+08:00",
      excluded: false,
      pendingConfirm: true,
    },
  ];
}

export const familyConsent: FamilyConsent = {
  canViewAppointments: true,
  canViewBp: true,
  canViewMedication: false,
};

export const defaultQuestions: ConsultationQuestion[] = [
  { id: "q-hba1c-follow", text: { zh: "這次HbA1c結果需要怎樣跟進？", en: "How should this HbA1c result be followed up?" }, added: false },
  { id: "q-hba1c-repeat", text: { zh: "是否需要覆驗？應在甚麼時候安排？", en: "Is a repeat test needed, and when?" }, added: false },
];

export const emptyAnswers: Answers = {
  urgent: null,
  onset: null,
  change: null,
  medGap: null,
  nextMorning: null,
};

export const NIDDK_A1C = "https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test";
export const CHP_STROKE = "https://www.chp.gov.hk/tc/static/80060.html";

export function openingClock() {
  return OPENING_CLOCK;
}
