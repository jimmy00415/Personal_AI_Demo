import { clockParts } from "../clock";
import type { ActorId, DemoContext, DemoState, PatientId, TodayView } from "./types";

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

/** Conservative transitional view: caregiver gets no clinical text until the shared projector is installed. */
export function selectToday(state: DemoState): TodayView {
  const patientId = state.context.patientId;
  const tasks = state.context.actorId === "may"
    ? state.tasks.filter(t => t.patientId === patientId && t.status !== "cancelled" && t.status !== "completed")
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
  return { patientId, hero, tasks, dailyEntry: { patientId, href: "/check-in", draftId: state.drafts.find(d => d.patientId === patientId)?.id ?? null } };
}
