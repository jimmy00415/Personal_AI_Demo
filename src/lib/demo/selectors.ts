import { clockParts } from "../clock";
import type { ActorId, DemoContext, DemoState, TodayView } from "./types";

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
