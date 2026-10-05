import { messages } from "../i18n";
import type { ActionResult, ActorId, DemoState, PatientId, RecipientId, ShareCategory, SharingLevel, SharingProjection, HealthRecord, Localized } from "./types";

export const shareCategories: ShareCategory[] = ["body", "mood", "measurements", "medication", "appointments"];
export const recipients: RecipientId[] = ["david", "caregiver-lee", "doctor-wong"];
export const sharingLevels: SharingLevel[] = ["alerts-only", "summary", "full"];
export type ConsentInput = { patientId: PatientId; recipientId: RecipientId; level: SharingLevel; categories: ShareCategory[] };
const fail = (code: string): ActionResult<never> => ({ ok: false, code });

/** Consent ends unfinished agreements, while their response and clinical history remain evidence. */
export function invalidateUnavailableRequests(state: DemoState): DemoState {
  const revokedTasks = new Set<string>();
  const events = state.events.map(e => {
    const grant = state.grants.filter(g => g.patientId === e.patientId && g.recipientId === e.recipientId).sort((a, b) => b.revision - a.revision)[0];
    const task = state.tasks.find(t => t.id === e.taskId && t.patientId === e.patientId);
    const unavailable = !grant || grant.status !== "active" || !grant.categories.includes(e.category) || !task || task.shareCategory === "private" || !grant.categories.includes(task.shareCategory);
    const next = ["pending", "acknowledged"].includes(e.status) && unavailable ? { ...e, status: "revoked" as const, revision: e.revision + 1 } : e;
    if (next.status === "revoked") revokedTasks.add(e.taskId);
    return next;
  });
  const tasks = state.tasks.map(t => revokedTasks.has(t.id) && t.ownerId === "david" && !["completed", "cancelled"].includes(t.status) && !t.supersededByCheckInRevision ? { ...t, ownerId: "may" as const, proposedOwnerId: null, revision: t.revision + 1 } : t);
  return events.every((e, i) => e === state.events[i]) && tasks.every((t, i) => t === state.tasks[i]) ? state : { ...state, events, tasks };
}

/** A finite local request, never an interpretation of a measurement or symptom threshold. */
export function createAttentionEvent(state: DemoState, input: { patientId: PatientId; sourceRecordId: string; taskId?: string; scenario: "fixture-attention" | "after-visit-task" }): ActionResult<DemoState> {
  if (state.context.actorId !== "may" || state.context.patientId !== input.patientId) return fail("patient-only");
  if (!["fixture-attention", "after-visit-task"].includes(input.scenario)) return fail("invalid-trigger");
  const source = state.healthRecords.find(r => r.id === input.sourceRecordId && r.patientId === input.patientId && !r.supersededByRecordId);
  const taskId = input.scenario === "fixture-attention" ? input.taskId ?? "task-fixture-attention" : input.taskId;
  const task = state.tasks.find(t => t.id === taskId && t.patientId === input.patientId);
  if (!source || !task || !task.sourceRecordIds.includes(source.id) || task.supersededByCheckInRevision || ["completed", "cancelled"].includes(task.status)) return fail("request-inactive");
  if (input.scenario === "fixture-attention" ? source.id !== "rec-dizzy" || task.id !== "task-fixture-attention" : task.kind !== "after-visit" || source.source !== "user") return fail("invalid-trigger");
  if (source.category === "private" || task.shareCategory === "private" || source.category !== task.shareCategory) return fail("sharing-unavailable");
  const grant = state.grants.find(g => g.patientId === input.patientId && g.recipientId === "david");
  if (!grant || grant.status !== "active" || !grant.categories.includes(source.category)) return fail("sharing-unavailable");
  // The task + recipient identity survives repeated entry and later permission changes.
  const prior = state.events.find(e => e.taskId === task.id && e.recipientId === "david");
  if (prior) return prior.status === "revoked" ? fail("event-unavailable") : { ok: true, value: state };
  if (task.ownerId !== "may" || task.proposedOwnerId !== "david") return fail("proposal-required");
  const event = { id: input.scenario === "fixture-attention" ? "event-fixture-attention" : `event-${task.id}-david`, patientId: input.patientId, recipientId: "david" as const, triggerId: input.scenario, taskId: task.id, category: source.category, status: "pending" as const, occurredAt: state.clock, response: "", sourceRecordIds: [source.id], revision: 1 };
  return { ok: true, value: { ...state, events: [...state.events, event] } };
}

export function respondToEvent(state: DemoState, eventId: string, response: { actorId: ActorId; decision: "accept" | "decline"; note: string }): ActionResult<DemoState> {
  if (response.actorId !== "david" || state.context.actorId !== response.actorId) return fail("caregiver-only");
  const projected = selectSharingProjection(state, state.context.patientId, "david").events.find(e => e.id === eventId);
  if (!projected) return fail("event-unavailable");
  if (!["accept", "decline"].includes(response.decision) || typeof response.note !== "string" || response.note.trim().length > 500) return fail("invalid-response");
  const event = state.events.find(e => e.id === projected.id)!;
  const status = response.decision === "accept" ? "acknowledged" : "declined";
  const note = response.note.trim();
  if (event.status === status && event.response === note) return { ok: true, value: state };
  if (!projected.canRespond) return fail("event-inactive");
  return { ok: true, value: { ...state,
    events: state.events.map(e => e.id === event.id ? { ...e, status, response: note, revision: e.revision + 1 } : e),
    tasks: state.tasks.map(t => t.id === event.taskId ? { ...t, ownerId: response.decision === "accept" ? "david" : "may", proposedOwnerId: null, ...(response.decision === "decline" ? { status: "pending" as const } : {}), revision: t.revision + 1 } : t),
  } };
}

/** Completes local assistance. Clinical contact/check-in/medicine evidence has its own workflow. */
export function resolveEvent(state: DemoState, eventId: string, actorId: ActorId): ActionResult<DemoState> {
  if (actorId !== "david" || state.context.actorId !== actorId) return fail("caregiver-only");
  const projected = selectSharingProjection(state, state.context.patientId, "david").events.find(e => e.id === eventId);
  if (!projected) return fail("event-unavailable");
  if (projected.status === "resolved") return { ok: true, value: state };
  if (!projected.canResolve) return fail("acceptance-required");
  return { ok: true, value: { ...state,
    events: state.events.map(e => e.id === eventId ? { ...e, status: "resolved", revision: e.revision + 1 } : e),
    tasks: state.tasks.map(t => t.id !== projected.taskId ? t : t.kind === "after-visit" ? { ...t, status: "completed", revision: t.revision + 1 } : { ...t, ownerId: "may", proposedOwnerId: null, revision: t.revision + 1 }),
  } };
}

export function setConsent(state: DemoState, input: ConsentInput): ActionResult<DemoState> {
  if (state.context.actorId !== "may" || state.context.patientId !== input.patientId) return fail("patient-only");
  if (input.patientId !== "may" || !recipients.includes(input.recipientId) || !sharingLevels.includes(input.level) || !Array.isArray(input.categories) || !input.categories.length || input.categories.some(c => !shareCategories.includes(c))) return fail("invalid-consent");
  // Repair an already-unavailable acknowledgement before a regrant can mask its invalidity.
  if (state.events.some(e => e.status === "acknowledged")) state = invalidateUnavailableRequests(state);
  const prior = state.grants.find(g => g.patientId === input.patientId && g.recipientId === input.recipientId);
  const categories = shareCategories.filter(c => input.categories.includes(c));
  const grant = { ...input, categories, id: prior?.id ?? `grant-${input.recipientId}`, status: "active" as const, updatedAt: state.clock, revision: (prior?.revision ?? 0) + 1 };
  return { ok: true, value: invalidateUnavailableRequests({ ...state,
    grants: [...state.grants.filter(g => g.id !== grant.id), grant],
    briefs: state.briefs.map(b => b.patientId === input.patientId && b.recipientId === input.recipientId ? { ...b, status: "draft", confirmedAt: null, revision: b.revision + 1 } : b),
  }) };
}
export function revokeConsent(state: DemoState, grantId: string): ActionResult<DemoState> {
  if (state.context.actorId !== "may") return fail("patient-only");
  const grant = state.grants.find(g => g.id === grantId && g.patientId === state.context.patientId);
  if (!grant) return fail("grant-missing");
  if (grant.status === "revoked") return { ok: true, value: invalidateUnavailableRequests(state) };
  return { ok: true, value: invalidateUnavailableRequests({ ...state,
    grants: state.grants.map(g => g.id === grantId ? { ...g, status: "revoked", updatedAt: state.clock, revision: g.revision + 1 } : g),
    briefs: state.briefs.map(b => b.patientId === grant.patientId && b.recipientId === grant.recipientId ? { ...b, status: "draft", confirmedAt: null, revision: b.revision + 1 } : b),
  }) };
}
const line = (label: Localized, suffix: string): Localized => ({ zh: `${label.zh} · ${suffix}`, en: `${label.en} · ${suffix}` });

/** This is the only shared read boundary. Never rehydrate canonical entities from its IDs. */
export function selectSharingProjection(state: DemoState, patientId: PatientId, recipientId: RecipientId): SharingProjection {
  const grant = state.grants.filter(g => g.patientId === patientId && g.recipientId === recipientId).sort((a, b) => b.revision - a.revision)[0];
  const out: SharingProjection = { patientId, recipientId, level: null, grantRevision: grant?.revision ?? null, categories: [], status: grant?.status ?? "not-granted", summary: [], sourceRevisions: {}, records: [], healthRecords: [], observations: [], checkIns: [], medicationDoses: [], appointments: [], reports: [], tasks: [], events: [], briefs: [], sourceRecordIds: [] };
  if (!grant || grant.status !== "active") return out;
  out.level = grant.level; out.categories = [...grant.categories];
  const allowed = (c: ShareCategory | "private") => c !== "private" && grant.categories.includes(c);
  const mine = <T extends { patientId: PatientId }>(items: T[]) => items.filter(i => i.patientId === patientId);
  const full = grant.level === "full";
  const detail = grant.level !== "alerts-only";
  const tasks = mine(state.tasks).filter(t => allowed(t.shareCategory) && !t.supersededByCheckInRevision);
  // Alerts intentionally have no categories, source IDs, raw response or trigger text.
  out.events = mine(state.events).filter(e => e.recipientId === recipientId && e.status !== "revoked" && allowed(e.category) && tasks.some(t => t.id === e.taskId && t.status !== "cancelled")).map(e => {
    const task = tasks.find(t => t.id === e.taskId)!;
    const active = !["completed", "cancelled"].includes(task.status);
    return { id: e.id, patientId, recipientId, taskId: e.taskId, status: e.status, occurredAt: e.occurredAt, revision: e.revision, sourceRecordIds: [], text: messages["sharing.neutral"], ownerId: task.ownerId, taskStatus: task.status,
      canRespond: recipientId === "david" && e.status === "pending" && active && task.ownerId === "may" && task.proposedOwnerId === "david",
      canResolve: recipientId === "david" && e.status === "acknowledged" && active && task.ownerId === "david" };
  });
  if (!detail) return out;
  const checkIns = mine(state.checkIns);
  const bodyCheckIn = checkIns.filter(c => Date.parse(c.occurredAt) <= Date.parse(state.clock)).toSorted((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  const episode = mine(state.episodes).filter(e => e.saved && e.helpKind !== "emotional").at(-1);
  if (allowed("body")) out.summary.push(bodyCheckIn ? messages[`sharing.body.${bodyCheckIn.body}`] : episode?.answers.change ? messages[`sharing.bodyChange.${episode.answers.change}`] : messages[mine(state.healthRecords).some(r => r.category === "body") ? "sharing.bodyRecorded" : "sharing.bodyEmpty"]);
  if (allowed("mood")) out.summary.push(bodyCheckIn ? messages[`sharing.mood.${bodyCheckIn.mood}`] : messages["sharing.moodEmpty"]);
  const observations = allowed("measurements") ? mine(state.observations) : [];
  const reports = allowed("measurements") ? mine(state.reports) : [];
  if (allowed("measurements")) {
    if (observations.length) out.summary.push(line(messages["sharing.bpAverage"], `${Math.round(observations.reduce((s, o) => s + o.systolic, 0) / observations.length)}/${Math.round(observations.reduce((s, o) => s + o.diastolic, 0) / observations.length)} mmHg`));
    if (reports.length) out.summary.push(line(messages["sharing.reports"], `${reports.length}`));
    if (!observations.length && !reports.length) out.summary.push(messages["sharing.measurementsEmpty"]);
  }
  const doses = allowed("medication") ? mine(state.medicationDoses) : [];
  if (allowed("medication")) {
    out.summary.push(doses.length ? line(messages["sharing.recordedDoses"], `${doses.length}`) : messages["sharing.medicationEmpty"]);
    if (doses.some(d => d.status === "unknown")) out.summary.push(messages["sharing.unknown"]);
  }
  if (allowed("appointments")) {
    out.appointments = mine(state.appointments).filter(a => a.status !== "cancelled").map(a => ({ ...a }));
    if (!out.appointments.length) out.summary.push(messages["sharing.appointmentsEmpty"]);
  }
  if (full) {
    out.observations = observations.map(o => ({ id: o.id, patientId, occurredAt: o.occurredAt, enteredAt: o.enteredAt, systolic: o.systolic, diastolic: o.diastolic, source: o.source, revision: o.revision }));
    out.reports = reports.map(r => ({ ...r, results: r.results.map(({ id, name, value, unit }) => ({ id, name, value, unit })) }));
    out.medicationDoses = doses.map(d => ({ ...d }));
    out.checkIns = allowed("body") || allowed("mood") ? checkIns.map(c => ({ id: c.id, patientId, occurredAt: c.occurredAt, enteredAt: c.enteredAt, revision: c.revision, ...(allowed("body") ? { body: c.body } : {}), ...(allowed("mood") ? { mood: c.mood } : {}) })) : [];
    out.records = mine(state.healthRecords).filter(r => allowed(r.category) && !r.supersededByRecordId).map(r => {
      // Organised prose and check-in-derived records can mix categories. Recompose from typed fields.
      const checkIn = r.derivedFromCheckIn && checkIns.find(c => c.id === r.derivedFromCheckIn!.id && c.revision === r.derivedFromCheckIn!.revision);
      const text = checkIn && r.category === "body" ? messages[`sharing.body.${checkIn.body}`] : checkIn && r.category === "mood" ? messages[`sharing.mood.${checkIn.mood}`] : r.source === "organised" || r.derivedFromCheckIn ? messages[`sharing.${r.category as ShareCategory}`] : r.text;
      return { id: r.id, patientId, category: r.category, source: r.source, occurredAt: r.occurredAt, enteredAt: r.enteredAt, text, title: messages[`sharing.${r.category as ShareCategory}`], kind: r.kind, revision: r.revision } satisfies HealthRecord;
    });
    out.healthRecords = out.records;
  }
  const provenance = [...mine(state.healthRecords).filter(r => allowed(r.category) && !r.supersededByRecordId), ...observations, ...reports, ...doses, ...out.appointments, ...(allowed("body") || allowed("mood") ? checkIns : [])];
  out.sourceRevisions = Object.fromEntries(provenance.map(r => [r.id, r.revision]));
  out.sourceRecordIds = [...new Set([...out.records, ...out.observations, ...out.checkIns, ...out.medicationDoses, ...out.reports, ...out.appointments].map(r => r.id))];
  out.tasks = tasks.map(t => ({ id: t.id, patientId, ownerId: t.ownerId, proposedOwnerId: t.proposedOwnerId, kind: t.kind, status: t.status, scheduledAt: t.scheduledAt, shareCategory: t.shareCategory, revision: t.revision, sourceRecordIds: t.sourceRecordIds.filter(id => out.sourceRecordIds.includes(id)), title: full && t.kind === "after-visit" ? t.title : messages[`sharing.${t.shareCategory as ShareCategory}`] }));
  out.events = out.events.map(e => ({ ...e, sourceRecordIds: state.events.find(raw => raw.id === e.id)!.sourceRecordIds.filter(id => out.sourceRecordIds.includes(id)) }));
  // Legacy packets contain mixed text and arbitrary questions. Task 8 will construct shared packets.
  return out;
}

/** Shared display rows also feed exports; no canonical record lookup occurs here. */
export function sharingRows(p: SharingProjection, locale: "en" | "zh-HK") {
  const L = (s: Localized) => locale === "en" ? s.en : s.zh;
  const source = (value: "user" | "home-measure" | "imported" | "organised") => L(messages[({ user: "source.user", "home-measure": "source.home", imported: "source.imported", organised: "source.organised" } as const)[value]]);
  return [
    ...p.records.map(r => ({ id: r.id, title: L(r.title), text: L(r.text), occurredAt: r.occurredAt, enteredAt: r.enteredAt, source: source(r.source) })),
    ...p.observations.map(r => ({ id: r.id, title: L(messages["sharing.measurements"]), text: `${r.systolic}/${r.diastolic} mmHg`, occurredAt: r.occurredAt, enteredAt: r.enteredAt, source: source(r.source) })),
    ...p.checkIns.map(r => ({ id: r.id, title: L(messages["sharing.shared"]), text: [r.body ? L(messages[`sharing.body.${r.body}`]) : "", r.mood ? L(messages[`sharing.mood.${r.mood}`]) : ""].filter(Boolean).join(" · "), occurredAt: r.occurredAt, enteredAt: r.enteredAt, source: source("user") })),
    ...p.medicationDoses.map(r => ({ id: r.id, title: r.name, text: `${L(r.dose)} · ${L(messages[r.status === "unknown" ? "sharing.unknown" : r.status === "user_reported_not_taken" ? "care.notTaken" : "care.recordedTaken"])}`, occurredAt: r.occurredAt ?? r.scheduledAt, enteredAt: r.enteredAt ?? "", source: source(r.source) })),
    ...p.reports.map(r => ({ id: r.id, title: L(r.title), text: `${L(r.originalText)}\n${r.results.map(v => `${L(v.name)} ${v.value} ${v.unit}`).join("\n")}`, occurredAt: r.occurredAt, enteredAt: r.enteredAt, source: source(r.source) })),
  ];
}
export function sharedExportText(state: DemoState, patientId: PatientId, recipientId: RecipientId, locale: "en" | "zh-HK"): ActionResult<string> {
  if (state.context.patientId !== patientId || state.context.actorId === "david" && recipientId !== "david") return fail("recipient-unavailable");
  const p = selectSharingProjection(state, patientId, recipientId);
  if (p.status !== "active" || p.level === "alerts-only") return fail("sharing-unavailable");
  const L = (s: Localized) => locale === "en" ? s.en : s.zh;
  return { ok: true, value: [L(messages["sharing.exportTitle"]), L(messages["sharing.exportNote"]), L(messages[`sharing.${recipientId}`]), ...p.summary.map(L), ...sharingRows(p, locale).map(r => `${r.title}: ${r.text}\n${r.occurredAt} · ${r.enteredAt} · ${r.source}`), ...p.appointments.map(a => `${L(a.title)} · ${a.scheduledAt} · ${L(a.location)}`), ...p.tasks.map(t => `${L(t.title)} · ${t.scheduledAt ?? ""} · ${L(messages[`care.${t.status}`])}`), ...p.events.map(e => `${L(e.text)} · ${e.occurredAt}`)].join("\n") };
}
