import type { Answers, ChatMessage, ChatStep, JourneyPhase, Locale, Localized, SourceClass, DoseStatus, ContactStatus, FollowupStatus, BookingStatus, LabResult } from "../types";
export type { Locale, Localized, SourceClass } from "../types";

export type PatientId = "may";
export type ActorId = "may" | "david";
export type RecipientId = "david" | "caregiver-lee" | "doctor-wong";
export type Perspective = "patient" | "caregiver";
export type SharingLevel = "alerts-only" | "summary" | "full";
export type ShareCategory = "body" | "mood" | "measurements" | "medication" | "appointments";
export type Mood = "good" | "okay" | "low" | "stressed" | "skipped";
export type BodyFeeling = "well" | "tired" | "dizzy" | "other";
export type EventStatus = "pending" | "acknowledged" | "declined" | "resolved" | "revoked";
export type TaskStatus = "pending" | "scheduled" | "snoozed" | "completed" | "cancelled";
export type BriefStatus = "draft" | "confirmed";
export type ScenarioId = "first-use" | "routine-day" | "dizziness" | "low-mood" | "share-needed" | "caregiver-alert" | "day-before-visit" | "next-morning" | "after-visit" | "urgent-help";
export type ActionResult<T> = { ok: true; value: T } | { ok: false; code: string };
export interface DemoContext { actorId: ActorId; patientId: PatientId; perspective: Perspective }
export interface DemoPreferences { locale: Locale; liteMode: boolean; introComplete: boolean }

export interface Profile {
  id: ActorId;
  name: Localized;
  displayName: string;
  age: number;
  perspective: Perspective;
  relationship: "self" | "son";
  knownConditions: { id: "hypertension" | "type2-diabetes"; name: Localized; source: "fictional-profile" }[];
}
interface PatientEntity { id: string; patientId: PatientId }
export interface HealthRecord extends PatientEntity {
  category: ShareCategory | "private";
  source: SourceClass;
  occurredAt: string;
  enteredAt: string;
  text: Localized;
  revision: number;
  title: Localized;
  kind: "symptom" | "note" | "report" | "measurement" | "medication";
  derivedFromCheckIn?: { id: string; revision: number };
  supersededByRecordId?: string;
}
export interface HealthEpisode extends PatientEntity {
  helpKind?: "physical" | "emotional";
  answers: Answers;
  step: ChatStep;
  disposition: "open" | "ordinary" | "uncertain" | "worsening" | "urgent";
  sourceRecordIds: string[];
  revision: number;
  saved: boolean;
  /** Transitional workflow markers for routes being migrated in Tasks 2–9. */
  phase: JourneyPhase;
  followup: FollowupStatus;
}
export interface ConversationSession extends PatientEntity {
  episodeId: string;
  messages: ChatMessage[];
  status: "draft" | "active" | "completed";
  draft: string;
}
export interface ImportedReport extends PatientEntity {
  title: Localized;
  originalText: Localized;
  occurredAt: string;
  enteredAt: string;
  source: "imported";
  category: "measurements";
  results: LabResult[];
  revision: number;
}
export interface ConsultationQuestion extends PatientEntity { text: Localized; selected: boolean }
export interface Observation extends PatientEntity {
  occurredAt: string; enteredAt: string; systolic: number; diastolic: number; source: SourceClass; revision: number;
  note?: string;
}
export interface CheckInDraft extends PatientEntity {
  occurredAt: string;
  mood: Mood | null;
  body: BodyFeeling | null;
  note: string;
  step: "mood" | "body" | "note" | "review";
  taskId: string | null;
  followupChange?: "no-dizzy" | "still" | "worse";
  revision: number;
}
export interface DailyCheckIn extends PatientEntity {
  draftId: string; occurredAt: string; enteredAt: string; mood: Mood; body: BodyFeeling; note: string; revision: number;
  taskId?: string | null;
  followupChange?: "no-dizzy" | "still" | "worse";
}
export interface MedicationDose extends PatientEntity {
  medicationId: string;
  name: string;
  dose: Localized;
  scheduledAt: string;
  status: DoseStatus;
  occurredAt: string | null;
  enteredAt: string | null;
  source: SourceClass;
  revision: number;
}
export interface Appointment extends PatientEntity {
  title: Localized;
  scheduledAt: string;
  location: Localized;
  status: "scheduled" | "cancelled" | "completed";
  revision: number;
  /** Temporary receipt state; scheduledAt is the appointment time authority. */
  bookingStatus: BookingStatus;
}
export interface CheckInCompletionEvidence {
  checkInId: string; checkInRevision: number; measurementId: string; episodeId: string | null; priorDisposition: HealthEpisode["disposition"];
}
export interface CareTask extends PatientEntity {
  ownerId: ActorId;
  proposedOwnerId: ActorId | null;
  kind: "medication" | "check-in" | "contact" | "appointment" | "accompany" | "after-visit";
  status: TaskStatus;
  scheduledAt: string | null;
  sourceRecordIds: string[];
  shareCategory: ShareCategory | "private";
  contactOutcome: ContactStatus | null;
  contactNote: string;
  title: Localized;
  revision: number;
  /** Entity revision at the latest scheduling transition; stable during source/history reconciliation. */
  workflowRevision?: number;
  completionEvidence?: CheckInCompletionEvidence;
  completionHistory?: CheckInCompletionEvidence[];
  supersededByCheckInRevision?: number;
}
export interface ConsentGrant extends PatientEntity {
  recipientId: RecipientId; level: SharingLevel; categories: ShareCategory[]; status: "active" | "revoked"; updatedAt: string; revision: number;
}
export interface AttentionEvent extends PatientEntity {
  recipientId: RecipientId;
  triggerId: string;
  taskId: string;
  category: ShareCategory;
  status: EventStatus;
  occurredAt: string;
  response: string;
  sourceRecordIds: string[];
  revision: number;
}
export interface BriefPacket extends PatientEntity {
  appointmentId: string;
  appointmentRevision: number;
  recipientId: RecipientId | PatientId;
  grantRevision: number | null;
  status: BriefStatus;
  revision: number;
  generatedAt: string;
  confirmedAt: string | null;
  sections: { id: string; category: ShareCategory | "private"; title: Localized; text: Localized; sourceRecordIds: string[] }[];
  questions: ConsultationQuestion[];
  sourceRecordIds: string[];
  sourceRevisions: Record<string, number>;
  includeMood: boolean;
  /** Persistent review provenance; old v4 packets are regenerated as drafts. */
  sectionEdits?: Record<string, Localized>;
  sourceFingerprint?: string;
  contentFingerprint?: string;
  supplementsNeedReview?: boolean;
}
export interface MemoryItem extends PatientEntity {
  value: Localized; detail: Localized; source: SourceClass; enteredAt: string; enabled: boolean; pendingConfirm: boolean; sourceRecordIds: string[]; revision: number;
}
/** Sharing DTOs deliberately cannot carry arbitrary notes, response payloads or completion history. */
export type SharedCheckIn = Pick<DailyCheckIn, "id" | "patientId" | "occurredAt" | "enteredAt" | "revision"> & { body?: BodyFeeling; mood?: Mood };
export type SharedTask = Pick<CareTask, "id" | "patientId" | "ownerId" | "proposedOwnerId" | "kind" | "status" | "scheduledAt" | "shareCategory" | "title" | "revision" | "sourceRecordIds">;
export type SharedEvent = Pick<AttentionEvent, "id" | "patientId" | "recipientId" | "taskId" | "status" | "occurredAt" | "revision" | "sourceRecordIds"> & { text: Localized; ownerId: ActorId; taskStatus: TaskStatus; canRespond: boolean; canResolve: boolean };
export type SharedReport = Pick<ImportedReport, "id" | "patientId" | "occurredAt" | "enteredAt" | "source" | "category" | "revision" | "title" | "originalText"> & { results: Pick<LabResult, "id" | "name" | "value" | "unit">[] };
export interface SharingProjection {
  patientId: PatientId;
  recipientId: RecipientId;
  level: SharingLevel | null;
  grantRevision: number | null;
  categories: ShareCategory[];
  status: "active" | "revoked" | "not-granted";
  summary: Localized[];
  /** Safe provenance metadata for the selected categories, including summary-only content. */
  sourceRevisions: Record<string, number>;
  records: HealthRecord[];
  sourceRecordIds: string[];
  healthRecords: HealthRecord[];
  observations: Observation[];
  checkIns: SharedCheckIn[];
  medicationDoses: MedicationDose[];
  appointments: Appointment[];
  reports: SharedReport[];
  tasks: SharedTask[];
  events: SharedEvent[];
  briefs: BriefPacket[];
}
export interface LocalAssistantContext {
  medicationDoses?: MedicationDose[];
  context: DemoContext; clock: string; locale: Locale; episode: HealthEpisode | null; records: HealthRecord[]; memories: MemoryItem[]; reports: ImportedReport[];
}
export interface LocalAssistantReply {
  intent: "symptom" | "report" | "mood" | "question" | "booking" | "urgent" | "unsupported";
  text: Localized;
  nextAction: "check-in" | "brief" | "question" | "help" | null;
  disposition: "continue" | "uncertain" | "worsening" | "urgent" | "unsupported";
  nextPath: string | null;
  question: ConsultationQuestion | null;
}
export interface DemoState {
  schemaVersion: 4;
  clock: string;
  context: DemoContext;
  profiles: Profile[];
  healthRecords: HealthRecord[];
  observations: Observation[];
  checkIns: DailyCheckIn[];
  drafts: CheckInDraft[];
  episodes: HealthEpisode[];
  assistantSessions: ConversationSession[];
  reports: ImportedReport[];
  questions: ConsultationQuestion[];
  medicationDoses: MedicationDose[];
  appointments: Appointment[];
  tasks: CareTask[];
  grants: ConsentGrant[];
  events: AttentionEvent[];
  briefs: BriefPacket[];
  memories: MemoryItem[];
}
export interface TodayView {
  patientId: PatientId;
  hero: { kind: "urgent" | "needs-attention" | "follow-up" | "prepare-visit" | "routine"; sourceId: string | null; href: string };
  tasks: CareTask[];
  dailyEntry: { patientId: PatientId; href: "/check-in"; draftId: string | null };
}
