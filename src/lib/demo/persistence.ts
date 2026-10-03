import type { ActionResult, CareTask, DemoPreferences, DemoState } from "./types";

export const DEMO_STORAGE_KEY = "caremate-v4";
export const PREFERENCES_STORAGE_KEY = "caremate-v4-preferences";
export const EMERGENCY_SESSION_KEY = "caremate-v4-emergency";

const success = <T>(value: T): ActionResult<T> => ({ ok: true, value });
function failure(error: unknown): ActionResult<never> {
  return { ok: false, code: error instanceof Error ? error.name : "StorageUnavailable" };
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const date = (value: unknown) => text(value) && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const localized = (value: unknown) => object(value) && text(value.zh) && text(value.en);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const revision = (value: unknown) => Number.isInteger(value) && (value as number) > 0;
const category = (v: unknown) => ["body", "mood", "measurements", "medication", "appointments"].includes(v as string);
const source = (v: unknown) => ["user", "home-measure", "imported", "organised"].includes(v as string);

/** Reject unsupported/corrupt snapshots before any view consumes nested data. No v3 migration. */
export function isDemoState(value: unknown): value is DemoState {
  if (!object(value) || value.schemaVersion !== 4 || !date(value.clock) || !object(value.context)) return false;
  const c = value.context;
  if (c.patientId !== "may" || !["may", "david"].includes(c.actorId as string) || c.perspective !== (c.actorId === "may" ? "patient" : "caregiver")) return false;
  if (!Array.isArray(value.profiles) || value.profiles.length !== 2) return false;
  const profileIds = new Set<string>();
  for (const p of value.profiles) {
    if (!object(p) || !["may", "david"].includes(p.id as string) || profileIds.has(p.id as string) || !localized(p.name) || !text(p.displayName) || typeof p.age !== "number" || !Array.isArray(p.knownConditions)) return false;
    profileIds.add(p.id as string);
    if (p.perspective !== (p.id === "may" ? "patient" : "caregiver") || p.relationship !== (p.id === "may" ? "self" : "son")) return false;
    if (p.id === "david" && p.knownConditions.length) return false;
    if (p.knownConditions.some(k => !object(k) || !["hypertension", "type2-diabetes"].includes(k.id as string) || !localized(k.name) || k.source !== "fictional-profile")) return false;
  }
  const names = ["healthRecords", "observations", "checkIns", "drafts", "episodes", "assistantSessions", "reports", "questions", "medicationDoses", "appointments", "tasks", "grants", "events", "briefs", "memories"] as const;
  for (const name of names) {
    const list = value[name];
    if (!Array.isArray(list)) return false;
    const ids = new Set<string>();
    for (const entity of list) {
      if (!object(entity) || !text(entity.id) || !entity.id || ids.has(entity.id) || entity.patientId !== "may") return false;
      ids.add(entity.id);
      if (name !== "questions" && name !== "assistantSessions" && !revision(entity.revision)) return false;
    }
  }
  // The outer structure is checked; entity-specific rules below cover every consumed field.
  const s = value as unknown as DemoState;
  if (s.healthRecords.some(r => !category(r.category) && r.category !== "private" || !source(r.source) || !date(r.occurredAt) || !date(r.enteredAt) || !localized(r.text) || !localized(r.title) || !["symptom", "note", "report", "measurement", "medication"].includes(r.kind))) return false;
  if (s.observations.some(r => !date(r.occurredAt) || !date(r.enteredAt) || !source(r.source) || !Number.isFinite(r.systolic) || !Number.isFinite(r.diastolic) || r.note !== undefined && !text(r.note))) return false;
  const mood = (v: unknown) => ["good", "okay", "low", "stressed", "skipped"].includes(v as string);
  const body = (v: unknown) => ["well", "tired", "dizzy", "other"].includes(v as string);
  if (s.checkIns.some(r => !text(r.draftId) || !date(r.occurredAt) || !date(r.enteredAt) || !mood(r.mood) || !body(r.body) || !text(r.note))) return false;
  if (s.drafts.some(r => !date(r.occurredAt) || r.mood !== null && !mood(r.mood) || r.body !== null && !body(r.body) || !text(r.note) || !["mood", "body", "note", "review"].includes(r.step) || r.taskId !== null && !s.tasks.some(t => t.id === r.taskId))) return false;
  if ([...s.drafts, ...s.checkIns].some(r => r.followupChange !== undefined && !["no-dizzy", "still", "worse"].includes(r.followupChange) || r.taskId !== undefined && r.taskId !== null && !s.tasks.some(t => t.id === r.taskId && t.patientId === r.patientId && t.kind === "check-in"))) return false;
  if (s.questions.some(q => !localized(q.text) || typeof q.selected !== "boolean")) return false;
  if (s.episodes.some(e => e.helpKind !== undefined && !["physical", "emotional"].includes(e.helpKind) || !object(e.answers) || ![null, "none", "chest-breath", "stroke", "collapse", "unsure"].includes(e.answers.urgent) || ![null, "after-waking", "just-now", "yesterday", "other"].includes(e.answers.onset) || ![null, "better", "same", "worse", "unclear"].includes(e.answers.change) || ![null, "taken-unlogged", "not-taken", "forgot"].includes(e.answers.medGap) || ![null, "no-dizzy", "still", "worse"].includes(e.answers.nextMorning) || !["open", "ordinary", "uncertain", "worsening", "urgent"].includes(e.disposition) || !["urgent", "uncertain", "onset", "change", "worsening", "med_gap", "summary", "saved", "next_morning", "urgent_help"].includes(e.step) || !["concern_open", "urgent_check", "uncertain", "onset", "change", "worsening", "med_gap", "summary_review", "summary_saved", "brief_ready", "followup_scheduled", "followup_declined", "next_session", "next_logged", "urgent_help"].includes(e.phase) || !["none", "scheduled", "declined", "cancelled"].includes(e.followup) || typeof e.saved !== "boolean")) return false;
  if (s.assistantSessions.some(a => !s.episodes.some(e => e.id === a.episodeId) || !["draft", "active", "completed"].includes(a.status) || !text(a.draft) || !Array.isArray(a.messages) || a.messages.some(m => !object(m) || !text(m.id) || !["user", "assistant"].includes(m.role) || !localized(m.text)))) return false;
  if (s.reports.some(r => !date(r.occurredAt) || !date(r.enteredAt) || !localized(r.title) || !localized(r.originalText) || r.source !== "imported" || r.category !== "measurements" || !Array.isArray(r.results) || r.results.some(l => !object(l) || !text(l.id) || !localized(l.name) || !text(l.value) || !text(l.unit) || !localized(l.explain)))) return false;
  if (s.medicationDoses.some(d => !text(d.medicationId) || !text(d.name) || !localized(d.dose) || !date(d.scheduledAt) || d.occurredAt !== null && !date(d.occurredAt) || d.enteredAt !== null && !date(d.enteredAt) || !source(d.source) || !["unknown", "user_confirmed_taken", "user_reported_not_taken", "recorded_taken"].includes(d.status))) return false;
  if (s.appointments.some(a => !localized(a.title) || !localized(a.location) || !date(a.scheduledAt) || !["scheduled", "cancelled", "completed"].includes(a.status) || !["none", "booked", "kept"].includes(a.bookingStatus))) return false;
  if (s.tasks.some(t => !["may", "david"].includes(t.ownerId) || t.proposedOwnerId !== null && !["may", "david"].includes(t.proposedOwnerId) || !["medication", "check-in", "contact", "appointment", "accompany", "after-visit"].includes(t.kind) || !["pending", "scheduled", "snoozed", "completed", "cancelled"].includes(t.status) || t.scheduledAt !== null && !date(t.scheduledAt) || !category(t.shareCategory) && t.shareCategory !== "private" || t.contactOutcome !== null && !["not_contacted", "left_message", "contacted"].includes(t.contactOutcome) || !text(t.contactNote) || !localized(t.title))) return false;
  if (s.grants.some(g => !["david", "caregiver-lee", "doctor-wong"].includes(g.recipientId) || !["alerts-only", "summary", "full"].includes(g.level) || !Array.isArray(g.categories) || !g.categories.every(category) || !["active", "revoked"].includes(g.status) || !date(g.updatedAt))) return false;
  if (s.events.some(e => !["david", "caregiver-lee", "doctor-wong"].includes(e.recipientId) || !text(e.triggerId) || !s.tasks.some(t => t.id === e.taskId) || !category(e.category) || !["pending", "acknowledged", "declined", "resolved", "revoked"].includes(e.status) || !date(e.occurredAt) || !text(e.response))) return false;
  if (s.memories.some(m => !localized(m.value) || !localized(m.detail) || !source(m.source) || !date(m.enteredAt) || typeof m.enabled !== "boolean" || typeof m.pendingConfirm !== "boolean")) return false;
  const sourceIds = [...s.healthRecords, ...s.observations, ...s.checkIns, ...s.medicationDoses, ...s.appointments, ...s.reports, ...s.memories].map(r => r.id);
  const sources = new Set(sourceIds);
  if (sources.size !== sourceIds.length) return false;
  const validSources = (ids: unknown) => strings(ids) && ids.every(id => sources.has(id));
  if ([...s.tasks, ...s.episodes, ...s.events, ...s.memories, ...s.briefs].some(e => !validSources(e.sourceRecordIds))) return false;
  if (s.healthRecords.some(r => r.derivedFromCheckIn !== undefined && (!object(r.derivedFromCheckIn) || !revision(r.derivedFromCheckIn.revision) || !s.checkIns.some(c => c.id === r.derivedFromCheckIn!.id && c.patientId === r.patientId && c.revision >= r.derivedFromCheckIn!.revision)) || r.supersededByRecordId !== undefined && !s.healthRecords.some(n => n.id === r.supersededByRecordId && n.id !== r.id && n.patientId === r.patientId))) return false;
  const validCompletion = (t: CareTask, evidence: unknown) => {
    if (!object(evidence) || t.kind !== "check-in" || !revision(evidence.checkInRevision)) return false;
    const sourceRevision = evidence.checkInRevision as number;
    return s.checkIns.some(c => c.id === evidence.checkInId && c.patientId === t.patientId && c.taskId === t.id && c.revision >= sourceRevision && t.sourceRecordIds.includes(c.id)) && s.observations.some(o => o.id === evidence.measurementId && o.patientId === t.patientId && t.sourceRecordIds.includes(o.id)) && (evidence.episodeId === null || s.episodes.some(e => e.id === evidence.episodeId && e.patientId === t.patientId)) && ["open", "ordinary", "uncertain", "worsening", "urgent"].includes(evidence.priorDisposition as string);
  };
  if (s.tasks.some(t => t.workflowRevision !== undefined && (t.kind !== "check-in" || !revision(t.workflowRevision) || t.workflowRevision > t.revision))) return false;
  if (s.tasks.some(t => t.completionEvidence !== undefined && !validCompletion(t, t.completionEvidence) || t.completionHistory !== undefined && (!Array.isArray(t.completionHistory) || t.completionHistory.some(e => !validCompletion(t, e)) || new Set(t.completionHistory.map(e => e.checkInId)).size !== t.completionHistory.length) || t.supersededByCheckInRevision !== undefined && (!revision(t.supersededByCheckInRevision) || !s.checkIns.some(c => c.patientId === t.patientId && t.sourceRecordIds.includes(c.id) && c.revision >= t.supersededByCheckInRevision!)))) return false;
  if (s.briefs.some(b => !s.appointments.some(a => a.id === b.appointmentId) || !revision(b.appointmentRevision) || !["may", "david", "caregiver-lee", "doctor-wong"].includes(b.recipientId) || b.grantRevision !== null && !revision(b.grantRevision) || !["draft", "confirmed"].includes(b.status) || !date(b.generatedAt) || b.confirmedAt !== null && !date(b.confirmedAt) || typeof b.includeMood !== "boolean" || !object(b.sourceRevisions) || Object.entries(b.sourceRevisions).some(([id, rev]) => !sources.has(id) || !revision(rev)) || !Array.isArray(b.questions) || b.questions.some(q => !object(q) || q.patientId !== "may" || !text(q.id) || !localized(q.text) || typeof q.selected !== "boolean") || !Array.isArray(b.sections) || b.sections.some(section => !object(section) || !text(section.id) || !localized(section.title) || !localized(section.text) || section.summary !== undefined && !localized(section.summary) || !validSources(section.sourceRecordIds) || !category(section.category) && section.category !== "private"))) return false;
  if (s.briefs.some(b => b.sectionEdits !== undefined && (!object(b.sectionEdits) || Object.values(b.sectionEdits).some(v => !localized(v))) || b.contentFingerprint !== undefined && !text(b.contentFingerprint) || b.sourceFingerprint !== undefined && !text(b.sourceFingerprint) || b.supplementsNeedReview !== undefined && typeof b.supplementsNeedReview !== "boolean")) return false;
  return true;
}

export function loadDemo(storage: Storage): ActionResult<DemoState | null> {
  try {
    const raw = storage.getItem(DEMO_STORAGE_KEY);
    if (raw === null) return success(null);
    const value: unknown = JSON.parse(raw);
    return isDemoState(value) ? success(value) : { ok: false, code: "UnsupportedSnapshot" };
  } catch (error) { return failure(error); }
}
export function saveDemo(storage: Storage, state: DemoState): ActionResult<void> {
  try {
    if (!isDemoState(state)) return { ok: false, code: "UnsupportedSnapshot" };
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    return success(undefined);
  } catch (error) { return failure(error); }
}
function isPreferences(value: unknown): value is DemoPreferences {
  return object(value) && ["en", "zh-HK"].includes(value.locale as string) && typeof value.liteMode === "boolean" && typeof value.introComplete === "boolean";
}
export function loadPreferences(storage: Storage): ActionResult<DemoPreferences | null> {
  try {
    const raw = storage.getItem(PREFERENCES_STORAGE_KEY);
    if (raw === null) return success(null);
    const value: unknown = JSON.parse(raw);
    return isPreferences(value) ? success(value) : { ok: false, code: "UnsupportedPreferences" };
  } catch (error) { return failure(error); }
}
export function savePreferences(storage: Storage, value: DemoPreferences): ActionResult<void> {
  try {
    if (!isPreferences(value)) return { ok: false, code: "UnsupportedPreferences" };
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(value));
    return success(undefined);
  } catch (error) { return failure(error); }
}
export function setEmergencySession(storage: Storage, episodeId: string | null): ActionResult<void> {
  try {
    if (episodeId === null) storage.removeItem(EMERGENCY_SESSION_KEY);
    else storage.setItem(EMERGENCY_SESSION_KEY, episodeId);
    return success(undefined);
  } catch (error) { return failure(error); }
}
export function getEmergencySession(storage: Storage): ActionResult<string | null> {
  try { return success(storage.getItem(EMERGENCY_SESSION_KEY)); }
  catch (error) { return failure(error); }
}
