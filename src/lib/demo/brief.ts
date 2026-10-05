import { clockParts, formatDateTime } from "../clock";
import { messages } from "../i18n";
import { productCopy } from "../product-copy";
import { selectSharingProjection } from "./sharing";
import { currentOrganisedRecord, selectEpisodeObservation } from "./episode-facts";
import type { ActionResult, BriefPacket, DemoState, Locale, Localized, MedicationDose, PatientId, RecipientId, ShareCategory } from "./types";

const fail = (code: string): ActionResult<never> => ({ ok: false, code });
const join = (lines: Localized[]): Localized => ({ zh: lines.map(l => l.zh).join("\n"), en: lines.map(l => l.en).join("\n") });
const literal = (value: string): Localized => ({ zh: value, en: value });
const counted = (text: Localized, count: number): Localized => ({ zh: text.zh.replace("{count}", `${count}`), en: text.en.replace("{count}", `${count}`) });
const oneLine = (text: Localized): Localized => ({ zh: text.zh.replaceAll("\n", " · "), en: text.en.replaceAll("\n", " · ") });
const stamped = (text: Localized, occurredAt: string, source?: string, enteredAt?: string): Localized => ({
  zh: `${text.zh} · ${formatDateTime(occurredAt, "zh-HK")}${source ? ` · ${source}` : ""}${enteredAt && enteredAt !== occurredAt ? ` / ${formatDateTime(enteredAt, "zh-HK")}` : ""}`,
  en: `${text.en} · ${formatDateTime(occurredAt, "en")}${source ? ` · ${source}` : ""}${enteredAt && enteredAt !== occurredAt ? ` / ${formatDateTime(enteredAt, "en")}` : ""}`,
});
const provenance = (source: "user" | "home-measure" | "imported" | "organised") => source === "home-measure" ? messages["source.home"] : messages[`source.${source}`];
function sourced(text: Localized, occurredAt: string, source: Parameters<typeof provenance>[0], enteredAt?: string) {
  return join([stamped(text, occurredAt, undefined, enteredAt), provenance(source)]);
}
const doseStatus = (d: MedicationDose) => messages[d.status === "unknown" ? "packet.unknown" : d.status === "user_reported_not_taken" ? "care.notTaken" : "care.recordedTaken"];
const doseText = (d: MedicationDose) => sourced(join([literal(d.name), d.dose, doseStatus(d)]), d.occurredAt ?? d.scheduledAt, d.source, d.enteredAt ?? undefined);
function medicationSummary(doses: MedicationDose[]): Localized {
  const taken = doses.filter(d => d.status === "recorded_taken" || d.status === "user_confirmed_taken").length;
  const notTaken = doses.filter(d => d.status === "user_reported_not_taken").length;
  const unknown = doses.filter(d => d.status === "unknown").length;
  const recent = [...doses].sort((a, b) => Date.parse(b.occurredAt ?? b.scheduledAt) - Date.parse(a.occurredAt ?? a.scheduledAt)).slice(0, 4);
  return join([
    counted(messages["packet.doseHistory"], doses.length),
    { zh: `${messages["care.recordedTaken"].zh}：${taken} · ${messages["care.notTaken"].zh}：${notTaken} · ${messages["packet.unknown"].zh}：${unknown}`, en: `${messages["care.recordedTaken"].en}: ${taken} · ${messages["care.notTaken"].en}: ${notTaken} · ${messages["packet.unknown"].en}: ${unknown}` },
    messages["packet.doseRecent"],
    ...recent.map(d => oneLine(sourced(join([literal(d.name), d.dose, doseStatus(d), messages[d.occurredAt ? "packet.recordedAt" : "packet.scheduledFor"]]), d.occurredAt ?? d.scheduledAt, d.source, d.enteredAt ?? undefined))),
    ...(doses.length > recent.length ? [counted(messages["packet.doseRemainder"], doses.length - recent.length)] : []),
  ]);
}
const mine = <T extends { patientId: PatientId }>(items: T[], patientId: PatientId) => items.filter(r => r.patientId === patientId);
const idFor = (state: DemoState, appointmentId: string, recipientId: string) => `brief-${appointmentId}-${clockParts(state.clock).dateKey}-${recipientId}`;

/** Builds shared content solely from the safe DTO. IDs are provenance, never a lookup permission. */
function build(state: DemoState, patientId: PatientId, options: { appointmentId: string; includeMood: boolean; recipientId?: RecipientId }, prior?: BriefPacket): ActionResult<BriefPacket> {
  if (state.context.patientId !== patientId || state.context.actorId === "david" && options.recipientId !== "david") return fail("recipient-unavailable");
  const appointment = state.appointments.find(a => a.id === options.appointmentId && a.patientId === patientId);
  if (!appointment || appointment.status !== "scheduled") return fail("appointment-unavailable");
  const projection = options.recipientId ? selectSharingProjection(state, patientId, options.recipientId) : null;
  if (projection && (projection.status !== "active" || projection.level === "alerts-only")) return fail("sharing-unavailable");
  // Removing mood narrows the projection before composition, including summary prose.
  const p = projection && !options.includeMood ? selectSharingProjection({ ...state, grants: state.grants.map(g => g.patientId === patientId && g.recipientId === options.recipientId ? { ...g, categories: g.categories.filter(c => c !== "mood") } : g) }, patientId, options.recipientId!) : projection;
  const allowed = (category: ShareCategory) => !p || p.categories.includes(category);
  const observations = p ? p.observations : mine(state.observations, patientId).filter(o => Date.parse(o.occurredAt) <= Date.parse(state.clock));
  const records = (p ? p.healthRecords : mine(state.healthRecords, patientId).map(r => currentOrganisedRecord(state, r))).filter(r => !r.supersededByRecordId && r.kind !== "report" && (options.includeMood || !["mood", "private"].includes(r.category)));
  const organisedObservationIds = p ? [] : state.episodes.flatMap(e => records.some(r => r.source === "organised" && e.sourceRecordIds.includes(r.id)) ? [selectEpisodeObservation(state, e)?.id].filter((id): id is string => !!id) : []);
  const checkIns = p ? p.checkIns : mine(state.checkIns, patientId).filter(c => Date.parse(c.occurredAt) <= Date.parse(state.clock));
  const doses = p ? p.medicationDoses : mine(state.medicationDoses, patientId);
  const reports = p ? p.reports : mine(state.reports, patientId);
  const appointments = p ? p.appointments.filter(a => a.id === appointment.id) : [appointment];
  const sections: BriefPacket["sections"] = [];
  const add = (id: string, category: ShareCategory | "private", title: Localized, text: Localized, sourceRecordIds: string[] = [], summary?: Localized) => sections.push({ id, category, title, text, sourceRecordIds, ...(summary ? { summary } : {}) });
  if (p) add("sharing", "private", messages["packet.scope"], join([messages[`sharing.${p.level!}`], ...p.summary, messages["packet.privatePolicy"]]), [], p.level === "summary" ? join([messages[`sharing.${p.level}`], ...p.summary]) : undefined);
  if (!p) add("profile", "private", messages["packet.background"], join(state.profiles.filter(profile => profile.id === patientId).flatMap(profile => profile.knownConditions.map(c => c.name))));
  if (allowed("body") && p?.level !== "summary") {
    const entries = [
      ...records.filter(r => r.category === "body").map(r => ({ id: r.id, occurredAt: r.occurredAt, text: sourced(r.text, r.occurredAt, r.source, r.enteredAt) })),
      ...checkIns.flatMap(c => c.body ? [{ id: c.id, occurredAt: c.occurredAt, text: sourced(messages[`sharing.body.${c.body}`], c.occurredAt, "user", c.enteredAt) }] : []),
    ];
    const latest = [...entries].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).at(-1);
    const summary = latest ? join([messages["packet.latestBody"], latest.text, ...(entries.length > 1 ? [counted(messages["packet.bodyHistory"], entries.length - 1)] : [])]) : messages["sharing.bodyEmpty"];
    add("body", "body", messages["packet.body"], join(entries.length ? entries.map(e => e.text) : [messages["sharing.bodyEmpty"]]), [...new Set([...entries.map(e => e.id), ...organisedObservationIds])], summary);
  }
  if (options.includeMood && allowed("mood") && p?.level !== "summary") add("mood", "mood", messages["packet.mood"], join([
    ...checkIns.flatMap(c => c.mood && c.mood !== "skipped" ? [sourced(messages[`sharing.mood.${c.mood}`], c.occurredAt, "user", c.enteredAt)] : []),
    ...records.filter(r => r.category === "mood").map(r => sourced(r.text, r.occurredAt, r.source, r.enteredAt)),
    ...(!checkIns.some(c => c.mood && c.mood !== "skipped") && !records.some(r => r.category === "mood") ? [messages["packet.noMood"]] : []),
  ]), [...checkIns.filter(c => c.mood && c.mood !== "skipped").map(c => c.id), ...records.filter(r => r.category === "mood").map(r => r.id)]);
  if (observations.length) {
    const average = `${Math.round(observations.reduce((sum, o) => sum + o.systolic, 0) / observations.length)}/${Math.round(observations.reduce((sum, o) => sum + o.diastolic, 0) / observations.length)} mmHg`;
    add("average", "measurements", messages["packet.average"], literal(average), observations.map(o => o.id));
    add("readings", "measurements", messages["brief.s3"], join(observations.map(o => sourced(literal(`${o.systolic}/${o.diastolic} mmHg`), o.occurredAt, o.source, o.enteredAt))), observations.map(o => o.id));
  }
  if (doses.length) add("medication", "medication", messages["packet.medication"], join(doses.map(doseText)), doses.map(d => d.id), medicationSummary(doses));
  const allergies = p ? [] : mine(state.memories, patientId).filter(m => m.id === "mem-pen");
  if (allergies.length) add("allergy", "private", messages["packet.allergy"], join(allergies.map(m => sourced(join([m.value, m.detail]), m.enteredAt, m.source))), allergies.map(m => m.id));
  if (reports.length) add("reports", "measurements", messages["brief.s5"], join(reports.map(r => sourced(join([r.title, r.originalText, ...r.results.map(v => ({ zh: `${v.name.zh} ${v.value} ${v.unit}`, en: `${v.name.en} ${v.value} ${v.unit}` }))]), r.occurredAt, "imported", r.enteredAt))), reports.map(r => r.id));
  for (const a of appointments) add("appointment", "appointments", messages["packet.appointment"], stamped(join([a.title, a.location]), a.scheduledAt), [a.id]);
  if (!p && options.includeMood) {
    const notes = [...records.filter(r => r.category === "private").map(r => sourced(r.text, r.occurredAt, r.source, r.enteredAt)), ...mine(state.checkIns, patientId).filter(c => c.note).map(c => sourced(literal(c.note), c.occurredAt, "user", c.enteredAt)), ...observations.filter(o => o.note).map(o => sourced(literal(o.note!), o.occurredAt, o.source, o.enteredAt))];
    if (notes.length) add("notes", "private", messages["packet.notes"], join(notes), [...records.filter(r => r.category === "private").map(r => r.id), ...checkIns.map(c => c.id), ...observations.filter(o => o.note).map(o => o.id)]);
  }
  const sourceRecordIds = [...new Set(sections.flatMap(s => s.sourceRecordIds))];
  const sourceRevisions = p?.sourceRevisions ?? Object.fromEntries([...records, ...observations, ...checkIns, ...doses, ...reports, ...appointments, ...allergies].filter(r => sourceRecordIds.includes(r.id)).map(r => [r.id, r.revision]));
  const questions = p ? [] : mine(state.questions, patientId).filter(q => q.selected).map(q => ({ ...q }));
  const sourceFingerprint = JSON.stringify({ sections, questions, sourceRevisions, appointmentRevision: appointment.revision, authority: p ? { level: p.level, categories: p.categories, grantRevision: p.grantRevision } : null });
  const sectionEdits = prior?.sectionEdits ?? {};
  // Supplements never replace imported or authored source text and never inherit its category.
  if (!p) for (const [id, text] of Object.entries(sectionEdits)) if (text.zh.trim() || text.en.trim()) add(`supplement-${id}`, "private", messages["packet.supplement"], text);
  const contentFingerprint = JSON.stringify({ sourceFingerprint, sectionEdits: p ? {} : sectionEdits, includeMood: options.includeMood });
  const unchanged = prior?.contentFingerprint === contentFingerprint;
  return { ok: true, value: { id: prior?.id ?? idFor(state, appointment.id, options.recipientId ?? patientId), patientId, appointmentId: appointment.id, appointmentRevision: appointment.revision, recipientId: options.recipientId ?? patientId, grantRevision: p?.grantRevision ?? null, status: unchanged ? prior.status : "draft", revision: prior ? prior.revision + (unchanged ? 0 : 1) : 1, generatedAt: unchanged ? prior.generatedAt : state.clock, confirmedAt: unchanged ? prior.confirmedAt : null, sections, questions, sourceRecordIds, sourceRevisions, includeMood: options.includeMood, sectionEdits: p ? {} : sectionEdits, sourceFingerprint, contentFingerprint, supplementsNeedReview: !!prior && !!Object.keys(sectionEdits).length && (prior.supplementsNeedReview || prior.sourceFingerprint !== sourceFingerprint) } };
}
export function buildBrief(state: DemoState, patientId: PatientId, options: { appointmentId: string; includeMood: boolean; recipientId?: RecipientId }): ActionResult<BriefPacket> {
  const prior = state.briefs.filter(b => b.patientId === patientId && b.appointmentId === options.appointmentId && b.recipientId === (options.recipientId ?? patientId)).at(-1);
  return build(state, patientId, options, prior);
}
export function reconcileBriefs(state: DemoState): DemoState {
  const briefs = state.briefs.map(prior => {
    // Reconciliation is storage maintenance, independent of the current reader's role.
    const result = build({ ...state, context: { actorId: "may", patientId: prior.patientId, perspective: "patient" } }, prior.patientId, { appointmentId: prior.appointmentId, includeMood: prior.includeMood, ...(prior.recipientId !== "may" ? { recipientId: prior.recipientId } : {}) }, prior);
    if (!result.ok) return prior.status === "confirmed" ? { ...prior, status: "draft" as const, confirmedAt: null, revision: prior.revision + 1 } : prior;
    return JSON.stringify(prior) === JSON.stringify(result.value) ? prior : result.value;
  });
  return briefs.every((b, i) => b === state.briefs[i]) ? state : { ...state, briefs };
}
export function ensurePrevisitDraft(state: DemoState, appointmentId: string): DemoState {
  if (state.context.actorId !== "may") return state;
  const appointment = state.appointments.find(a => a.id === appointmentId && a.patientId === state.context.patientId && a.status === "scheduled");
  if (!appointment || clockParts(new Date(Date.parse(state.clock) + 86400000).toISOString()).dateKey !== clockParts(appointment.scheduledAt).dateKey) return state;
  const id = idFor(state, appointmentId, "may");
  if (state.briefs.some(b => b.id === id)) return reconcileBriefs(state);
  const previous = state.briefs.filter(b => b.appointmentId === appointmentId && b.patientId === state.context.patientId && b.recipientId === "may").at(-1);
  // A new preparation date preserves explicit personal choices, never the earlier confirmation.
  const inherited = previous ? { ...previous, id, revision: 0, contentFingerprint: undefined, status: "draft" as const, confirmedAt: null } : undefined;
  const result = build(state, state.context.patientId, { appointmentId, includeMood: previous?.includeMood ?? true }, inherited);
  return result.ok ? { ...state, briefs: [...state.briefs, result.value] } : state;
}
/** Route entry is an explicit request for a draft, also available before the day-before reminder. */
export function openBriefDraft(state: DemoState, appointmentId: string, recipientId?: RecipientId): ActionResult<DemoState> {
  const result = buildBrief(state, state.context.patientId, { appointmentId, includeMood: state.briefs.filter(b => b.appointmentId === appointmentId && b.recipientId === (recipientId ?? "may")).at(-1)?.includeMood ?? true, recipientId });
  return result.ok ? { ok: true, value: { ...state, briefs: [...state.briefs.filter(b => b.id !== result.value.id), result.value] } } : result;
}
export function updateBriefDraft(state: DemoState, briefId: string, patch: { sectionEdits: Record<string, Localized>; questionIds: string[]; includeMood: boolean }): ActionResult<DemoState> {
  const prior = state.briefs.find(b => b.id === briefId && b.patientId === state.context.patientId);
  if (!prior) return fail("brief-missing");
  if (state.context.actorId !== "may" || prior.recipientId !== "may") return fail("patient-only");
  if (patch.questionIds.some(id => !state.questions.some(q => q.id === id && q.patientId === prior.patientId))) return fail("question-missing");
  const next = { ...state, questions: state.questions.map(q => q.patientId === prior.patientId ? { ...q, selected: patch.questionIds.includes(q.id) } : q), briefs: state.briefs.map(b => b.id === briefId ? { ...b, sectionEdits: patch.sectionEdits, includeMood: patch.includeMood } : b) };
  return { ok: true, value: reconcileBriefs(next) };
}
export function confirmBrief(state: DemoState, briefId: string): ActionResult<DemoState> {
  const prior = state.briefs.find(b => b.id === briefId && b.patientId === state.context.patientId);
  if (!prior) return fail("brief-missing");
  const result = build(state, prior.patientId, { appointmentId: prior.appointmentId, includeMood: prior.includeMood, ...(prior.recipientId !== "may" ? { recipientId: prior.recipientId } : {}) }, prior);
  if (!result.ok) return result;
  // An action racing a source change must not confirm text the person did not review.
  if (prior.contentFingerprint !== result.value.contentFingerprint) return fail("review-required");
  const packet = { ...result.value, status: "confirmed" as const, confirmedAt: state.clock, supplementsNeedReview: false };
  return { ok: true, value: { ...state, briefs: state.briefs.map(b => b.id === briefId ? packet : b) } };
}
export function prepareBriefExport(state: DemoState, briefId: string, recipientId?: RecipientId): ActionResult<BriefPacket> {
  const prior = state.briefs.find(b => b.id === briefId && b.patientId === state.context.patientId);
  if (!prior || recipientId && prior.recipientId !== recipientId) return fail("brief-missing");
  const result = build(state, prior.patientId, { appointmentId: prior.appointmentId, includeMood: prior.includeMood, ...(prior.recipientId !== "may" ? { recipientId: prior.recipientId } : {}) }, prior);
  return result.ok && result.value.status !== "confirmed" ? fail("review-required") : result;
}
export function briefToText(packet: BriefPacket, locale: Locale): string {
  const L = (text: Localized) => productCopy(locale === "en" ? text.en : text.zh);
  return [L(messages["packet.title"]), `${L(messages["packet.patient"])} · ${L(messages["ask.person"])}`, `${L(messages[packet.status === "confirmed" ? "packet.confirmed" : "packet.draft"])} · ${L(messages["packet.revision"])} ${packet.revision}`, `${L(messages["packet.updated"])} · ${formatDateTime(packet.generatedAt, locale)}`, packet.recipientId === "may" ? L(messages["packet.personal"]) : L(messages[`sharing.${packet.recipientId}`]), ...packet.sections.flatMap(s => ["", L(s.title), L(s.text)]), "", L(messages["brief.s6"]), ...packet.questions.map(q => `• ${L(q.text)}`), "", L(messages["packet.local"])].join("\n");
}
