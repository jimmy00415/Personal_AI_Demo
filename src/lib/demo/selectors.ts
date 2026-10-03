import { clockParts } from "../clock";
import type { ActionResult, ActorId, CareTask, DemoContext, DemoState, Localized, PatientId, TodayView } from "./types";

export function isTaskOverdue(state: DemoState, task: CareTask) {
  return task.status !== "completed" && task.status !== "cancelled" && task.scheduledAt !== null && Date.parse(task.scheduledAt) < Date.parse(state.clock);
}
export function selectTodayTasks(state: DemoState) {
  if (state.context.actorId !== "may") return [];
  const date = clockParts(state.clock).dateKey;
  return state.tasks.filter(t => t.patientId === state.context.patientId && !t.supersededByCheckInRevision && t.status !== "cancelled" && (!t.scheduledAt || clockParts(t.scheduledAt).dateKey === date || isTaskOverdue(state, t)));
}

export function selectObservations(state: DemoState, patientId: PatientId = state.context.patientId) {
  return state.observations.filter(r => r.patientId === patientId).toSorted((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}
export function selectBpAverage(state: DemoState, patientId: PatientId = state.context.patientId) {
  const start = Date.parse(`${clockParts(state.clock).dateKey}T00:00:00+08:00`) - 6 * 86400000;
  const readings = selectObservations(state, patientId).filter(r => Date.parse(r.occurredAt) >= start && Date.parse(r.occurredAt) <= Date.parse(state.clock));
  return readings.length ? { systolic: Math.round(readings.reduce((sum, r) => sum + r.systolic, 0) / readings.length), diastolic: Math.round(readings.reduce((sum, r) => sum + r.diastolic, 0) / readings.length) } : null;
}

export function selectContext(state: DemoState, actorId: ActorId): DemoContext {
  return { actorId, patientId: state.context.patientId, perspective: actorId === "may" ? "patient" : "caregiver" };
}

/** Patient receipts may contain response notes; caregiver consumers must use the projection. */
export function selectPatientEvents(state: DemoState) {
  return state.context.actorId === "may" ? state.events.filter(e => e.patientId === state.context.patientId) : [];
}

/** Conservative transitional view: caregiver gets no clinical text until the shared projector is installed. */
export function selectToday(state: DemoState): TodayView {
  const patientId = state.context.patientId;
  const tasks = state.context.actorId === "may"
    ? selectTodayTasks(state).filter(t => t.status !== "completed")
    : [];
  const episodes = state.context.actorId === "may" ? state.episodes.filter(e => e.patientId === patientId).slice(-1) : [];
  const urgent = episodes.find(e => e.disposition === "urgent");
  const attention = episodes.find(e => e.disposition === "worsening" || e.disposition === "uncertain");
  const due = tasks.find(t => t.kind === "check-in" && t.scheduledAt && Date.parse(t.scheduledAt) <= Date.parse(state.clock));
  const tomorrow = clockParts(new Date(Date.parse(state.clock) + 86400000).toISOString()).dateKey;
  const appointment = state.context.actorId === "may" ? state.appointments.find(a => a.status === "scheduled" && clockParts(a.scheduledAt).dateKey === tomorrow) : undefined;
  const hero: TodayView["hero"] = urgent ? { kind: "urgent", sourceId: urgent.id, href: "/help" }
    : attention ? { kind: "needs-attention", sourceId: attention.id, href: "/ask" }
      : due ? { kind: "follow-up", sourceId: due.id, href: "/check-in" }
        : appointment ? { kind: "prepare-visit", sourceId: appointment.id, href: "/brief" }
          : { kind: "routine", sourceId: null, href: "/check-in" };
  return { patientId, hero, tasks, dailyEntry: { patientId, href: "/check-in", draftId: state.drafts.find(d => d.patientId === patientId && d.taskId === null && clockParts(d.occurredAt).dateKey === clockParts(state.clock).dateKey)?.id ?? null } };
}

/** Personalisation is patient-only; disabling it never removes a clinical source. */
export function selectActiveMemories(state: DemoState) {
  return state.context.actorId === "may" ? state.memories.filter(m => m.patientId === state.context.patientId && m.enabled) : [];
}
export function setMemoryUse(state: DemoState, memoryId: string, enabled: boolean): ActionResult<DemoState> {
  if (state.context.actorId !== "may") return { ok: false, code: "patient-only" };
  const item = state.memories.find(m => m.id === memoryId && m.patientId === state.context.patientId);
  if (!item) return { ok: false, code: "memory-missing" };
  return { ok: true, value: item.enabled === enabled ? state : { ...state, memories: state.memories.map(m => m === item ? { ...m, enabled, revision: m.revision + 1 } : m) } };
}
export function correctMemory(state: DemoState, memoryId: string, value: Localized): ActionResult<DemoState> {
  if (state.context.actorId !== "may") return { ok: false, code: "patient-only" };
  const item = state.memories.find(m => m.id === memoryId && m.patientId === state.context.patientId);
  if (!item) return { ok: false, code: "memory-missing" };
  const trimmed = { zh: value.zh.trim(), en: value.en.trim() };
  if (!trimmed.zh || !trimmed.en || trimmed.zh.length > 500 || trimmed.en.length > 500) return { ok: false, code: "invalid-memory" };
  if (item.value.zh === trimmed.zh && item.value.en === trimmed.en && !item.pendingConfirm) return { ok: true, value: state };
  return { ok: true, value: { ...state, memories: state.memories.map(m => m === item ? { ...m, value: trimmed, pendingConfirm: false, revision: m.revision + 1 } : m) } };
}
