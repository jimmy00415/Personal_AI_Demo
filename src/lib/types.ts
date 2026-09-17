export type Locale = "zh-HK" | "en";

export type Localized = {
  zh: string;
  en: string;
};

export type PersonId = "michelle" | "lai-wah";

export type SourceClass = "user" | "home-measure" | "imported" | "organised";

export type JourneyPhase =
  | "concern_open"
  | "urgent_check"
  | "uncertain"
  | "onset"
  | "change"
  | "worsening"
  | "med_gap"
  | "summary_review"
  | "summary_saved"
  | "brief_ready"
  | "followup_scheduled"
  | "followup_declined"
  | "next_session"
  | "next_logged"
  | "urgent_help";

export type ChatStep =
  | "urgent"
  | "uncertain"
  | "onset"
  | "change"
  | "worsening"
  | "med_gap"
  | "summary"
  | "saved"
  | "next_morning"
  | "urgent_help";

export type UrgentAnswer = "none" | "chest-breath" | "stroke" | "collapse" | "unsure" | null;
export type OnsetAnswer = "after-waking" | "just-now" | "yesterday" | "other" | null;
export type ChangeAnswer = "better" | "same" | "worse" | "unclear" | null;
export type MedGapAnswer = "taken-unlogged" | "not-taken" | "forgot" | null;
export type NextMorningAnswer = "no-dizzy" | "still" | "worse" | null;

export type DoseStatus = "unknown" | "user_confirmed_taken" | "user_reported_not_taken" | "recorded_taken";
export type TaskKind = "bp" | "medication" | "followup" | "contact" | "accompany" | "appointment";
export type TaskState = "pending" | "scheduled" | "completed" | "cancelled" | "not_due";
export type ContactStatus = "not_contacted" | "left_message" | "contacted";
export type FollowupStatus = "none" | "scheduled" | "declined" | "cancelled";
export type BookingStatus = "none" | "booked" | "kept";
export type HealthTab = "overview" | "records" | "measurements" | "reports";
export type SceneId =
  | "morning-start"
  | "symptom-summary"
  | "report-review"
  | "brief-ready"
  | "next-morning"
  | "family-preparation"
  | "urgent-help"
  | "booking-ready"
  | "booking-done";

export interface Person {
  id: PersonId;
  name: Localized;
  displayName: string;
  age: number;
  role: "self" | "mother";
}

export interface Provenance {
  source: SourceClass;
  occurredAt: string;
  enteredAt: string;
}

export interface BpReading {
  id: string;
  personId: PersonId;
  occurredAt: string;
  systolic: number;
  diastolic: number;
}

export interface Medication {
  id: string;
  personId: PersonId;
  name: string;
  dose: Localized;
  scheduleHour: number;
  scheduleMinute: number;
}

export interface MedicationDose {
  id: string;
  personId: PersonId;
  medicationId: string;
  scheduledAt: string;
  status: DoseStatus;
  occurrenceAt: string | null;
  enteredAt: string | null;
}

export interface Allergy {
  id: string;
  personId: PersonId;
  name: string;
  source: SourceClass;
  enteredAt: string;
}

export interface Appointment {
  id: string;
  personId: PersonId;
  title: Localized;
  at: string;
}

export interface ClinicSlot {
  id: string;
  personId: PersonId;
  at: string;
  clinic: Localized;
  reason: Localized;
  recommended?: boolean;
  current?: boolean;
}

export interface CareTask {
  id: string;
  personId: PersonId;
  relatedPersonId?: PersonId;
  time: string;
  date: string;
  title: Localized;
  kind: TaskKind;
  state: TaskState;
}

export interface HealthRecord {
  id: string;
  personId: PersonId;
  kind: "symptom" | "note" | "report" | "measurement" | "medication";
  occurredAt: string;
  enteredAt: string;
  title: Localized;
  summary: Localized;
  provenance: Provenance;
}

export interface LabResult {
  id: string;
  name: Localized;
  value: string;
  unit: string;
  explain: Localized;
}

export interface ImportedReport {
  id: string;
  personId: PersonId;
  title: Localized;
  occurredAt: string;
  enteredAt: string;
  results: LabResult[];
}

export interface ConsultationQuestion {
  id: string;
  text: Localized;
  added: boolean;
}

export interface MemoryItem {
  id: string;
  personId: PersonId;
  value: Localized;
  detail: Localized;
  source: SourceClass;
  enteredAt: string;
  excluded: boolean;
  pendingConfirm?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: Localized;
  step?: ChatStep;
  /** Marks a system note such as a correction, rendered differently from a spoken reply. */
  note?: boolean;
}

export interface QuickReply {
  id: string;
  label: Localized;
  urgent?: boolean;
  exclusive?: boolean;
}

export interface FamilyConsent {
  canViewAppointments: boolean;
  canViewBp: boolean;
  canViewMedication: boolean;
}

export interface Answers {
  urgent: UrgentAnswer;
  onset: OnsetAnswer;
  change: ChangeAnswer;
  medGap: MedGapAnswer;
  nextMorning: NextMorningAnswer;
}

export const MICHELLE: PersonId = "michelle";
export const MOTHER: PersonId = "lai-wah";
export const OPENING_CLOCK = "2026-09-16T08:45:00+08:00";
export const NEXT_CLOCK = "2026-09-17T08:30:00+08:00";
export const STORAGE_KEY = "caremate-v3";
