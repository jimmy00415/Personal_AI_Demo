import { clockParts } from "../clock";
import type { ActionResult, CheckInDraft, DemoState, Observation, PatientId } from "./types";

export function createCheckInDraft(state: DemoState, patientId: PatientId): CheckInDraft {
  const day = clockParts(state.clock).dateKey;
  const draft = state.drafts.find(d => d.patientId === patientId && clockParts(d.occurredAt).dateKey === day);
  if (draft) return draft;
  return { id: `draft-${patientId}-${day}`, patientId, occurredAt: state.clock, mood: null, body: null, note: "", step: "mood", taskId: null, revision: 1 };
}
export function updateCheckInDraft(draft: CheckInDraft, patch: Partial<Pick<CheckInDraft, "mood" | "body" | "note">>): CheckInDraft {
  const changed = Object.entries(patch).some(([key, value]) => draft[key as keyof typeof patch] !== value);
  return changed ? { ...draft, ...patch, revision: draft.revision + 1 } : draft;
}
function invalidateBriefs(state: DemoState, id: string) {
  return state.briefs.map(b => b.sourceRecordIds.includes(id) ? { ...b, status: "draft" as const, confirmedAt: null, revision: b.revision + 1 } : b);
}
export function commitCheckIn(state: DemoState, draft: CheckInDraft): ActionResult<DemoState> {
  if (state.context.actorId !== "may" || draft.patientId !== state.context.patientId) return { ok: false, code: "PatientOnly" };
  if (!draft.mood || !["good", "okay", "low", "stressed", "skipped"].includes(draft.mood)) return { ok: false, code: "MoodRequired" };
  if (!draft.body || !["well", "tired", "dizzy", "other"].includes(draft.body)) return { ok: false, code: "BodyRequired" };
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(draft.occurredAt) || !Number.isFinite(Date.parse(draft.occurredAt))) return { ok: false, code: "TimeRequired" };
  if (Date.parse(draft.occurredAt) > Date.parse(state.clock)) return { ok: false, code: "FutureTime" };
  const prior = state.checkIns.find(r => r.draftId === draft.id && r.patientId === draft.patientId);
  const unchanged = prior && prior.mood === draft.mood && prior.body === draft.body && prior.note === draft.note && prior.occurredAt === draft.occurredAt;
  const record = unchanged ? prior : { id: prior?.id ?? `checkin-${draft.id}`, draftId: draft.id, patientId: draft.patientId, occurredAt: draft.occurredAt, enteredAt: prior?.enteredAt ?? state.clock, mood: draft.mood, body: draft.body, note: draft.note, revision: (prior?.revision ?? 0) + 1 };
  return { ok: true, value: { ...state, checkIns: [...state.checkIns.filter(r => r.id !== record.id), record], drafts: state.drafts.filter(d => d.id !== draft.id), briefs: unchanged ? state.briefs : invalidateBriefs(state, record.id) } };
}
export function saveObservation(state: DemoState, observation: Observation): ActionResult<DemoState> {
  if (state.context.actorId !== "may" || observation.patientId !== state.context.patientId) return { ok: false, code: "PatientOnly" };
  if (!observation.id || [...state.healthRecords, ...state.checkIns, ...state.medicationDoses, ...state.appointments, ...state.reports].some(r => r.id === observation.id)) return { ok: false, code: "SourceCollision" };
  if (!Number.isFinite(observation.systolic) || observation.systolic < 40 || observation.systolic > 300) return { ok: false, code: "SystolicFormat" };
  if (!Number.isFinite(observation.diastolic) || observation.diastolic < 20 || observation.diastolic > 200) return { ok: false, code: "DiastolicFormat" };
  if (observation.systolic <= observation.diastolic) return { ok: false, code: "PressureOrder" };
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(observation.occurredAt) || !Number.isFinite(Date.parse(observation.occurredAt))) return { ok: false, code: "TimeRequired" };
  if (Date.parse(observation.occurredAt) > Date.parse(state.clock)) return { ok: false, code: "FutureTime" };
  const prior = state.observations.find(r => r.id === observation.id);
  // Corrections retain the original provenance and entry time; occurredAt is an editable fact.
  const candidate = { ...observation, source: prior?.source ?? "home-measure" as const, enteredAt: prior?.enteredAt ?? state.clock, revision: prior?.revision ?? 1 };
  const unchanged = prior && prior.systolic === candidate.systolic && prior.diastolic === candidate.diastolic && prior.occurredAt === candidate.occurredAt && (prior.note ?? "") === (candidate.note ?? "");
  if (unchanged) return { ok: true, value: state };
  const record = { ...candidate, revision: (prior?.revision ?? 0) + 1 };
  return { ok: true, value: { ...state, observations: prior ? state.observations.map(r => r.id === record.id ? record : r) : [...state.observations, record], briefs: invalidateBriefs(state, record.id) } };
}
