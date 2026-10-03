import { messages } from "../i18n";
import type { ActionResult, DemoState, PatientId, RecipientId, ShareCategory, SharingLevel, SharingProjection, HealthRecord, Localized } from "./types";

export const shareCategories: ShareCategory[] = ["body", "mood", "measurements", "medication", "appointments"];
export const recipients: RecipientId[] = ["david", "caregiver-lee", "doctor-wong"];
export const sharingLevels: SharingLevel[] = ["alerts-only", "summary", "full"];
export type ConsentInput = { patientId: PatientId; recipientId: RecipientId; level: SharingLevel; categories: ShareCategory[] };
const fail = (code: string): ActionResult<never> => ({ ok: false, code });

export function setConsent(state: DemoState, input: ConsentInput): ActionResult<DemoState> {
  if (state.context.actorId !== "may" || state.context.patientId !== input.patientId) return fail("patient-only");
  if (input.patientId !== "may" || !recipients.includes(input.recipientId) || !sharingLevels.includes(input.level) || !Array.isArray(input.categories) || !input.categories.length || input.categories.some(c => !shareCategories.includes(c))) return fail("invalid-consent");
  const prior = state.grants.find(g => g.patientId === input.patientId && g.recipientId === input.recipientId);
  const categories = shareCategories.filter(c => input.categories.includes(c));
  const grant = { ...input, categories, id: prior?.id ?? `grant-${input.recipientId}`, status: "active" as const, updatedAt: state.clock, revision: (prior?.revision ?? 0) + 1 };
  return { ok: true, value: { ...state,
    grants: [...state.grants.filter(g => g.id !== grant.id), grant],
    briefs: state.briefs.map(b => b.patientId === input.patientId && b.recipientId === input.recipientId ? { ...b, status: "draft", confirmedAt: null, revision: b.revision + 1 } : b),
    events: state.events.map(e => e.patientId === input.patientId && e.recipientId === input.recipientId && !categories.includes(e.category) && e.status === "pending" ? { ...e, status: "revoked", revision: e.revision + 1 } : e),
  } };
}
export function revokeConsent(state: DemoState, grantId: string): ActionResult<DemoState> {
  if (state.context.actorId !== "may") return fail("patient-only");
  const grant = state.grants.find(g => g.id === grantId && g.patientId === state.context.patientId);
  if (!grant) return fail("grant-missing");
  if (grant.status === "revoked") return { ok: true, value: state };
  return { ok: true, value: { ...state,
    grants: state.grants.map(g => g.id === grantId ? { ...g, status: "revoked", updatedAt: state.clock, revision: g.revision + 1 } : g),
    events: state.events.map(e => e.patientId === grant.patientId && e.recipientId === grant.recipientId && e.status === "pending" ? { ...e, status: "revoked", revision: e.revision + 1 } : e),
    briefs: state.briefs.map(b => b.patientId === grant.patientId && b.recipientId === grant.recipientId ? { ...b, status: "draft", confirmedAt: null, revision: b.revision + 1 } : b),
  } };
}
const line = (label: Localized, suffix: string): Localized => ({ zh: `${label.zh} · ${suffix}`, en: `${label.en} · ${suffix}` });

/** This is the only shared read boundary. Never rehydrate canonical entities from its IDs. */
export function selectSharingProjection(state: DemoState, patientId: PatientId, recipientId: RecipientId): SharingProjection {
  const grant = state.grants.filter(g => g.patientId === patientId && g.recipientId === recipientId).sort((a, b) => b.revision - a.revision)[0];
  const out: SharingProjection = { patientId, recipientId, level: null, grantRevision: grant?.revision ?? null, categories: [], status: grant?.status ?? "not-granted", summary: [], records: [], healthRecords: [], observations: [], checkIns: [], medicationDoses: [], appointments: [], reports: [], tasks: [], events: [], briefs: [], sourceRecordIds: [] };
  if (!grant || grant.status !== "active") return out;
  out.level = grant.level; out.categories = [...grant.categories];
  const allowed = (c: ShareCategory | "private") => c !== "private" && grant.categories.includes(c);
  const mine = <T extends { patientId: PatientId }>(items: T[]) => items.filter(i => i.patientId === patientId);
  const full = grant.level === "full";
  const detail = grant.level !== "alerts-only";
  const tasks = mine(state.tasks).filter(t => allowed(t.shareCategory));
  // Alerts intentionally have no categories, source IDs, raw response or trigger text.
  out.events = mine(state.events).filter(e => e.recipientId === recipientId && e.status !== "revoked" && allowed(e.category) && tasks.some(t => t.id === e.taskId)).map(e => ({ id: e.id, patientId, recipientId, taskId: e.taskId, status: e.status, occurredAt: e.occurredAt, revision: e.revision, sourceRecordIds: [], text: messages["sharing.neutral"] }));
  if (!detail) return out;
  const checkIns = mine(state.checkIns);
  const bodyCheckIn = checkIns.at(-1);
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
    out.records = mine(state.healthRecords).filter(r => allowed(r.category)).map(r => {
      // Organised prose and check-in-derived records can mix categories. Recompose from typed fields.
      const checkIn = r.derivedFromCheckIn && checkIns.find(c => c.id === r.derivedFromCheckIn!.id && c.revision === r.derivedFromCheckIn!.revision);
      const text = checkIn && r.category === "body" ? messages[`sharing.body.${checkIn.body}`] : checkIn && r.category === "mood" ? messages[`sharing.mood.${checkIn.mood}`] : r.source === "organised" || r.derivedFromCheckIn ? messages[`sharing.${r.category as ShareCategory}`] : r.text;
      return { id: r.id, patientId, category: r.category, source: r.source, occurredAt: r.occurredAt, enteredAt: r.enteredAt, text, title: messages[`sharing.${r.category as ShareCategory}`], kind: r.kind, revision: r.revision } satisfies HealthRecord;
    });
    out.healthRecords = out.records;
  }
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
