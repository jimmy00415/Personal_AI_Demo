import { clockParts } from "../clock";
import type { ActionResult, ActorId, CareTask, DemoState, PatientId, ShareCategory } from "./types";

export type FollowupChange = "no-dizzy" | "still" | "worse";
export type ContactOutcome = "not-contacted" | "left-message" | "contacted";
export type DoseCorrection = "unknown" | "user_confirmed_taken" | "user_reported_not_taken";
const fail = (code: string): ActionResult<never> => ({ ok: false, code });
const success = (value: DemoState): ActionResult<DemoState> => ({ ok: true, value });
const mayEdit = (s: DemoState, patientId: PatientId) => s.context.actorId === "may" && s.context.patientId === patientId;

/** Parse only explicit ISO instants, including a real calendar date (Date.parse normalises Feb 30). */
export function validInstant(at: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(at);
  if (!m || !Number.isFinite(Date.parse(at))) return false;
  const [, y, month, day, h, minute, second] = m;
  const date = new Date(`${y}-${month}-${day}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === `${y}-${month}-${day}` && +h < 24 && +minute < 60 && +second < 60;
}
function future(s: DemoState, at: string): ActionResult<void> {
  if (!validInstant(at)) return fail("invalid-time");
  return Date.parse(at) > Date.parse(s.clock) ? { ok: true, value: undefined } : fail("past-time");
}
function replaceTask(s: DemoState, task: CareTask) { return { ...s, tasks: s.tasks.map(t => t.id === task.id ? task : t) }; }
export function followupDraftId(task: CareTask) { return `draft-followup-${task.id}-${task.revision}`; }

export function setDoseStatus(state: DemoState, doseId: string, status: DoseCorrection): ActionResult<DemoState> {
  const dose = state.medicationDoses.find(d => d.id === doseId);
  if (!dose) return fail("dose-missing");
  if (!mayEdit(state, dose.patientId)) return fail("patient-only");
  if (!["unknown", "user_confirmed_taken", "user_reported_not_taken"].includes(status)) return fail("invalid-status");
  if (dose.status === status && dose.enteredAt !== null) return success(state);
  return success({ ...state,
    medicationDoses: state.medicationDoses.map(d => d.id === doseId ? { ...d, status, source: "user", occurredAt: status === "user_confirmed_taken" ? state.clock : null, enteredAt: state.clock, revision: d.revision + 1 } : d),
    tasks: state.tasks.map(t => t.kind === "medication" && t.patientId === dose.patientId && t.sourceRecordIds.includes(doseId) && t.status !== "cancelled" ? { ...t, status: status === "unknown" ? "pending" : "completed", revision: t.revision + 1 } : t),
    briefs: state.briefs.map(b => b.sourceRecordIds.includes(doseId) ? { ...b, status: "draft", confirmedAt: null, revision: b.revision + 1 } : b),
  });
}
export function scheduleFollowup(state: DemoState, patientId: PatientId, at: string): ActionResult<DemoState> {
  if (!mayEdit(state, patientId)) return fail("patient-only");
  const time = future(state, at); if (!time.ok) return time;
  const prior = state.tasks.find(t => t.id === "task-morning" && t.patientId === patientId);
  if (prior?.scheduledAt === at && prior.status === "scheduled") return success(state);
  const episode = state.episodes.filter(e => e.patientId === patientId).at(-1);
  const task: CareTask = { id: "task-morning", patientId, ownerId: prior?.ownerId ?? patientId, proposedOwnerId: prior?.proposedOwnerId ?? null, kind: "check-in", status: "scheduled", scheduledAt: at, sourceRecordIds: prior?.sourceRecordIds ?? episode?.sourceRecordIds ?? [], shareCategory: "body", contactOutcome: null, contactNote: "", title: { zh: "記錄血壓和頭暈情況", en: "Record blood pressure and dizziness" }, revision: (prior?.revision ?? 0) + 1 };
  return success({ ...state, tasks: prior ? state.tasks.map(t => t.id === task.id ? task : t) : [...state.tasks, task], episodes: state.episodes.map(e => e.id === episode?.id ? { ...e, followup: "scheduled", phase: "followup_scheduled", revision: e.revision + 1 } : e) });
}
export function cancelTask(state: DemoState, taskId: string): ActionResult<DemoState> {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return fail("task-missing");
  if (!mayEdit(state, task.patientId)) return fail("patient-only");
  if (task.status === "completed") return fail("task-completed");
  if (task.status === "cancelled") return success(state);
  const next = replaceTask(state, { ...task, status: "cancelled", revision: task.revision + 1 });
  return success(taskId === "task-morning" ? { ...next, episodes: next.episodes.map(e => e.patientId === task.patientId && e.followup === "scheduled" ? { ...e, followup: "cancelled", revision: e.revision + 1 } : e) } : next);
}
function updateTaskTime(state: DemoState, taskId: string, until: string, status: "scheduled" | "snoozed"): ActionResult<DemoState> {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return fail("task-missing");
  if (!mayEdit(state, task.patientId)) return fail("patient-only");
  const time = future(state, until); if (!time.ok) return time;
  if (["completed", "cancelled"].includes(task.status)) return fail("task-inactive");
  if (task.status === status && task.scheduledAt === until) return success(state);
  return success(replaceTask(state, { ...task, status, scheduledAt: until, revision: task.revision + 1 }));
}
export function snoozeTask(state: DemoState, taskId: string, until: string): ActionResult<DemoState> { return updateTaskTime(state, taskId, until, "snoozed"); }
export function rescheduleTask(state: DemoState, taskId: string, at: string): ActionResult<DemoState> { return updateTaskTime(state, taskId, at, "scheduled"); }
export function recordContactOutcome(state: DemoState, taskId: string, outcome: ContactOutcome, note: string): ActionResult<DemoState> {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || task.kind !== "contact") return fail("contact-missing");
  if (!mayEdit(state, task.patientId)) return fail("patient-only");
  if (task.status === "cancelled") return fail("task-inactive");
  if (!["not-contacted", "left-message", "contacted"].includes(outcome)) return fail("invalid-outcome");
  const contactOutcome = outcome === "left-message" ? "left_message" : outcome === "not-contacted" ? "not_contacted" : "contacted";
  if (task.contactOutcome === contactOutcome && task.contactNote === note) return success(state);
  return success(replaceTask(state, { ...task, contactOutcome, contactNote: note, status: outcome === "contacted" ? "completed" : "pending", revision: task.revision + 1 }));
}
export function completeCheckInTask(state: DemoState, taskId: string, checkInId: string): ActionResult<DemoState> {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || task.kind !== "check-in") return fail("task-missing");
  if (!mayEdit(state, task.patientId)) return fail("patient-only");
  if (task.status === "completed" && task.sourceRecordIds.includes(checkInId)) return success(state);
  if (task.status === "cancelled") return fail("task-inactive");
  const checkIn = state.checkIns.find(c => c.id === checkInId && c.patientId === task.patientId);
  if (!checkIn || checkIn.taskId !== taskId || checkIn.draftId !== followupDraftId(task) || state.drafts.some(d => d.id === checkIn.draftId)) return fail("confirmed-checkin-required");
  const at = Date.parse(task.scheduledAt ?? state.clock);
  if (Date.parse(checkIn.occurredAt) < at || Date.parse(checkIn.occurredAt) > Date.parse(state.clock) || clockParts(checkIn.occurredAt).dateKey !== clockParts(state.clock).dateKey) return fail("current-checkin-required");
  if (!checkIn.followupChange) return fail("followup-change-required");
  if (state.episodes.some(e => e.patientId === task.patientId && e.disposition === "urgent" && e.sourceRecordIds.some(id => task.sourceRecordIds.includes(id)))) return fail("urgent-help-required");
  const measurement = state.observations.find(o => o.patientId === task.patientId && o.source === "home-measure" && Date.parse(o.occurredAt) >= at && Date.parse(o.occurredAt) <= Date.parse(state.clock) && Date.parse(o.enteredAt) >= Date.parse(checkIn.occurredAt));
  if (!measurement) return fail("measurement-required");
  let next = replaceTask(state, { ...task, status: "completed", sourceRecordIds: [...new Set([...task.sourceRecordIds, checkIn.id, measurement.id])], revision: task.revision + 1 });
  const episode = state.episodes.filter(e => e.patientId === task.patientId && e.sourceRecordIds.some(id => task.sourceRecordIds.includes(id))).at(-1);
  if (episode) next = { ...next, episodes: next.episodes.map(e => e.id === episode.id ? { ...e, answers: { ...e.answers, nextMorning: checkIn.followupChange! }, phase: "next_logged", disposition: checkIn.followupChange === "worse" ? "worsening" : checkIn.followupChange === "still" ? "uncertain" : e.disposition, sourceRecordIds: [...new Set([...e.sourceRecordIds, checkIn.id, measurement.id])], revision: e.revision + 1 } : e) };
  if (checkIn.followupChange !== "no-dizzy") {
    const id = `record-followup-${checkIn.id}`;
    const worse = checkIn.followupChange === "worse";
    const record = { id, patientId: task.patientId, category: "body" as const, source: "user" as const, occurredAt: checkIn.occurredAt, enteredAt: state.clock, text: { zh: worse ? "本人記錄：頭暈比之前嚴重。" : "本人記錄：仍然頭暈。", en: worse ? "My report: dizziness is worse than before." : "My report: still feeling dizzy." }, title: { zh: "跟進本人紀錄", en: "My follow-up record" }, kind: "symptom" as const, revision: 1 };
    const contact: CareTask = { id: `task-next-${checkIn.id}`, patientId: task.patientId, ownerId: "may", proposedOwnerId: null, kind: "contact", status: "pending", scheduledAt: state.clock, sourceRecordIds: [id, checkIn.id, measurement.id], shareCategory: "body", contactOutcome: "not_contacted", contactNote: "", title: { zh: worse ? "頭暈加劇：尋求醫護協助" : "仍然頭暈：聯絡醫護跟進", en: worse ? "Worse dizziness: seek clinical help" : "Still dizzy: contact a clinician" }, revision: 1 };
    next = { ...next, healthRecords: [...next.healthRecords, record], tasks: [...next.tasks, contact] };
  }
  return success(next);
}
export function createAfterVisitTask(state: DemoState, input: { patientId: PatientId; text: string; scheduledAt: string; proposedOwnerId: ActorId; shareCategory: ShareCategory | "private" }): ActionResult<DemoState> {
  if (!mayEdit(state, input.patientId)) return fail("patient-only");
  const time = future(state, input.scheduledAt); if (!time.ok) return time;
  const text = input.text.trim(); if (!text) return fail("text-required");
  if (!["may", "david"].includes(input.proposedOwnerId) || !["private", "body", "mood", "measurements", "medication", "appointments"].includes(input.shareCategory)) return fail("invalid-input");
  let sequence = state.healthRecords.length + 1;
  while (state.healthRecords.some(r => r.id === `record-after-visit-${sequence}`)) sequence++;
  const id = `record-after-visit-${sequence}`;
  const record = { id, patientId: input.patientId, category: input.shareCategory, source: "user" as const, occurredAt: state.clock, enteredAt: state.clock, text: { zh: text, en: text }, title: { zh: "覆診後本人紀錄", en: "My note after the visit" }, kind: "note" as const, revision: 1 };
  const task: CareTask = { id: `task-${id}`, patientId: input.patientId, ownerId: "may", proposedOwnerId: input.proposedOwnerId === "david" ? "david" : null, kind: "after-visit", status: "scheduled", scheduledAt: input.scheduledAt, sourceRecordIds: [id], shareCategory: input.shareCategory, contactOutcome: null, contactNote: "", title: record.text, revision: 1 };
  return success({ ...state, healthRecords: [...state.healthRecords, record], tasks: [...state.tasks, task] });
}
