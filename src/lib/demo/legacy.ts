/** Temporary adapters for existing routes. Facts are read/written only through DemoState. */
import type { AppState } from "../store";
import type { DemoState, HealthEpisode } from "./types";
import { emptyAnswers } from "./fixtures";
import { clockParts } from "../clock";

export function currentEpisode(demo: DemoState) { return demo.episodes.at(-1); }

export function projectLegacy(demo: DemoState, activeEmergencyEpisodeId: string | null) {
  const mine = demo.context.actorId === "may";
  const episode = mine ? currentEpisode(demo) : undefined;
  const session = mine ? demo.assistantSessions.find(s => s.episodeId === episode?.id) : undefined;
  const grant = demo.grants.find(g => g.recipientId === "david" && g.status === "active");
  const contact = demo.tasks.find(t => t.id === "task-contact");
  const followup = demo.tasks.find(t => t.id === "task-morning");
  const emergency = mine && activeEmergencyEpisodeId !== null;
  return {
    clock: demo.clock,
    readingNotes: mine ? Object.fromEntries(demo.observations.filter(o => o.note !== undefined).map(o => [o.id, o.note!])) : {},
    step: emergency ? "urgent_help" as const : episode?.step ?? "urgent" as const,
    phase: emergency ? "urgent_help" as const : episode?.phase ?? "concern_open" as const,
    messages: session?.messages ?? [], answers: episode?.answers ?? { ...emptyAnswers }, episodeSaved: episode?.saved ?? false,
    doses: mine ? demo.medicationDoses.map(d => ({ id: d.id, personId: "michelle" as const, medicationId: d.medicationId, scheduledAt: d.scheduledAt, status: d.status, occurrenceAt: d.occurredAt, enteredAt: d.enteredAt })) : [],
    records: mine ? demo.healthRecords.map(r => ({ id: r.id, personId: "michelle" as const, kind: r.kind, occurredAt: r.occurredAt, enteredAt: r.enteredAt, title: r.title, summary: r.text, provenance: { source: r.source, occurredAt: r.occurredAt, enteredAt: r.enteredAt } })) : [],
    memories: mine ? demo.memories.map(m => ({ id: m.id, personId: "michelle" as const, value: m.value, detail: m.detail, source: m.source, enteredAt: m.enteredAt, excluded: !m.enabled, pendingConfirm: m.pendingConfirm })) : [],
    questions: mine ? demo.questions.map(q => ({ id: q.id, text: q.text, added: q.selected })) : [],
    tasks: mine ? demo.tasks.map(t => {
      const at = t.scheduledAt ? clockParts(t.scheduledAt) : clockParts(demo.clock);
      return { id: t.id, personId: "michelle" as const, date: at.dateKey, time: `${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`, title: t.title,
        kind: t.kind === "check-in" ? t.id === "task-bp" ? "bp" as const : "followup" as const : t.kind === "after-visit" ? "contact" as const : t.kind,
        state: t.status === "snoozed" ? "scheduled" as const : t.kind === "medication" && t.status === "scheduled" && t.scheduledAt && Date.parse(t.scheduledAt) > Date.parse(demo.clock) ? "not_due" as const : t.status };
    }) : [],
    appointments: mine ? demo.appointments.filter(a => a.status !== "cancelled").map(a => ({ id: a.id, personId: "michelle" as const, title: a.title, at: a.scheduledAt })) : [],
    contactStatus: contact?.contactOutcome ?? "not_contacted" as const, contactNote: contact?.contactNote ?? "",
    followup: episode?.followup ?? "none" as const,
    followupAt: followup && followup.status !== "cancelled" ? followup.scheduledAt : null,
    consent: { canViewAppointments: !!grant && grant.level !== "alerts-only" && grant.categories.includes("appointments"), canViewBp: !!grant && grant.level === "full" && grant.categories.includes("measurements"), canViewMedication: !!grant && grant.level === "full" && grant.categories.includes("medication") },
    sharingStopped: !grant,
    motherBriefReady: demo.briefs.some(b => b.recipientId === "david" && b.status === "confirmed"),
    accompanyAdded: demo.tasks.some(t => t.kind === "accompany" && t.status !== "cancelled"),
    bookingStatus: demo.appointments.find(a => a.id === "appt-gp")?.bookingStatus ?? "none" as const,
  };
}

export function applyLegacyPatch(demo: DemoState, patch: Partial<AppState>): DemoState {
  // Legacy routes cannot write May's clinical data under David's actor identity.
  if (demo.context.actorId !== "may") return demo;
  const next = { ...demo };
  if (patch.clock) next.clock = patch.clock;
  if (patch.readingNotes) next.observations = next.observations.map(o => o.id in patch.readingNotes! ? { ...o, note: patch.readingNotes![o.id], revision: o.revision + 1 } : o);
  const episodeKeys = ["answers", "step", "phase", "episodeSaved", "messages", "followup"] as const;
  if (episodeKeys.some(key => key in patch)) {
    const prior = currentEpisode(next);
    const e: HealthEpisode = prior ? { ...prior } : { id: `episode-${next.episodes.length + 1}`, patientId: "may", answers: { ...emptyAnswers }, step: "urgent", phase: "concern_open", disposition: "open", revision: 1, sourceRecordIds: [], saved: false, followup: "none" };
    if (patch.answers) e.answers = patch.answers;
    if (patch.step) e.step = patch.step;
    if (patch.phase) e.phase = patch.phase;
    if (patch.episodeSaved !== undefined) e.saved = patch.episodeSaved;
    if (patch.followup) e.followup = patch.followup;
    e.disposition = e.answers.urgent && !["none", "unsure"].includes(e.answers.urgent) ? "urgent" : e.answers.urgent === "unsure" ? "uncertain" : e.answers.change === "worse" ? "worsening" : e.saved ? "ordinary" : "open";
    e.revision += 1;
    next.episodes = prior ? next.episodes.map(old => old.id === e.id ? e : old) : [...next.episodes, e];
    if (patch.messages) {
      const session = next.assistantSessions.find(s => s.episodeId === e.id);
      const updated = { id: session?.id ?? `session-${e.id}`, patientId: "may" as const, episodeId: e.id, messages: patch.messages, status: e.saved ? "completed" as const : "active" as const, draft: session?.draft ?? "" };
      next.assistantSessions = [...next.assistantSessions.filter(s => s.episodeId !== e.id), updated];
    }
  }
  if (patch.records) {
    next.healthRecords = patch.records.filter(r => r.personId === "michelle").map(r => {
      const prior = demo.healthRecords.find(old => old.id === r.id);
      return { id: r.id, patientId: "may", category: prior?.category ?? (r.kind === "symptom" ? "body" : r.kind === "report" || r.kind === "measurement" ? "measurements" : r.kind === "medication" ? "medication" : "private"), source: r.provenance.source, occurredAt: r.occurredAt, enteredAt: r.enteredAt, title: r.title, text: r.summary, kind: r.kind, revision: (prior?.revision ?? 0) + 1 };
    });
    // A legacy summary replaced the original row. Retain the source as evidence.
    const referenced = new Set([...next.episodes, ...next.tasks, ...next.events, ...next.memories, ...next.briefs].flatMap(e => e.sourceRecordIds));
    next.healthRecords.push(...demo.healthRecords.filter(r => referenced.has(r.id) && !next.healthRecords.some(n => n.id === r.id)));
  }
  if (patch.doses) next.medicationDoses = next.medicationDoses.map(d => {
    const row = patch.doses!.find(r => r.id === d.id);
    return row ? { ...d, status: row.status, occurredAt: row.occurrenceAt, enteredAt: row.enteredAt, revision: d.revision + 1 } : d;
  });
  if (patch.memories) next.memories = next.memories.map(m => {
    const row = patch.memories!.find(r => r.id === m.id);
    return row ? { ...m, value: row.value, detail: row.detail, enabled: !row.excluded, pendingConfirm: !!row.pendingConfirm, revision: m.revision + 1 } : m;
  });
  if (patch.questions) next.questions = patch.questions.map(q => ({ id: q.id, patientId: "may", text: q.text, selected: q.added }));
  if (patch.tasks) next.tasks = patch.tasks.filter(t => t.personId === "michelle").map(t => {
    const prior = demo.tasks.find(old => old.id === t.id);
    return { id: t.id, patientId: "may", ownerId: prior?.ownerId ?? "may", proposedOwnerId: prior?.proposedOwnerId ?? null, kind: t.kind === "bp" || t.kind === "followup" ? "check-in" : t.kind, status: t.state === "not_due" ? "scheduled" : t.state, scheduledAt: `${t.date}T${t.time}:00+08:00`, sourceRecordIds: prior?.sourceRecordIds ?? [], shareCategory: prior?.shareCategory ?? (t.kind === "medication" ? "medication" : t.kind === "bp" ? "measurements" : t.kind === "appointment" || t.kind === "accompany" ? "appointments" : "body"), contactOutcome: t.kind === "contact" ? patch.contactStatus ?? prior?.contactOutcome ?? "not_contacted" : null, contactNote: t.kind === "contact" ? patch.contactNote ?? prior?.contactNote ?? "" : "", title: t.title, revision: (prior?.revision ?? 0) + 1 };
  });
  if (patch.appointments || patch.bookingStatus) next.appointments = next.appointments.map(a => {
    const row = patch.appointments?.find(r => r.id === a.id);
    return { ...a, scheduledAt: row?.at ?? a.scheduledAt, bookingStatus: patch.bookingStatus ?? a.bookingStatus, revision: a.revision + 1 };
  });
  if (patch.sharingStopped) next.grants = next.grants.map(g => g.recipientId === "david" ? { ...g, status: "revoked", revision: g.revision + 1, updatedAt: next.clock } : g);
  return next;
}
