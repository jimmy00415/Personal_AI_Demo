import * as fixture from "./fixtures";
import { OPENING_CLOCK } from "../types";
import type { DemoState, Profile, ScenarioId } from "./types";

export const scenarioIds: ScenarioId[] = ["first-use", "routine-day", "dizziness", "low-mood", "share-needed", "caregiver-alert", "day-before-visit", "next-morning", "after-visit", "urgent-help"];

const profiles: Profile[] = [
  { id: "may", name: { zh: "May／陳女士", en: "May Chan" }, displayName: "May Chan", age: 68, perspective: "patient", relationship: "self", knownConditions: [
    { id: "hypertension", name: { zh: "高血壓", en: "Hypertension" }, source: "fictional-profile" },
    { id: "type2-diabetes", name: { zh: "二型糖尿病", en: "Type 2 diabetes" }, source: "fictional-profile" },
  ] },
  { id: "david", name: { zh: "David／兒子", en: "David Chan" }, displayName: "David Chan", age: 42, perspective: "caregiver", relationship: "son", knownConditions: [] },
];

/** New fictional May fixture. Never consumes or migrates caremate-v3. */
export function createScenario(id: ScenarioId): DemoState {
  const state: DemoState = {
    schemaVersion: 4, clock: OPENING_CLOCK,
    context: { actorId: "may", patientId: "may", perspective: "patient" },
    profiles: structuredClone(profiles),
    healthRecords: fixture.createRecords().map(r => ({ id: r.id, patientId: "may", category: r.kind === "report" ? "measurements" : r.kind === "symptom" ? "body" : "private", source: r.provenance.source, occurredAt: r.occurredAt, enteredAt: r.enteredAt, text: r.summary, title: r.title, kind: r.kind, revision: 1 })),
    observations: fixture.bpReadings.map(r => ({ id: r.id, patientId: "may", occurredAt: r.occurredAt, enteredAt: r.occurredAt, systolic: r.systolic, diastolic: r.diastolic, source: "home-measure", revision: 1 })),
    checkIns: [], drafts: [], episodes: [], assistantSessions: [],
    reports: [{ id: fixture.report.id, patientId: "may", title: fixture.report.title, originalText: { zh: "虛構血液化驗報告：HbA1c 6.4%；LDL 2.7 mmol/L；肌酐 71 μmol/L。", en: "Fictional blood test report: HbA1c 6.4%; LDL 2.7 mmol/L; creatinine 71 μmol/L." }, occurredAt: fixture.report.occurredAt, enteredAt: fixture.report.enteredAt, results: structuredClone(fixture.report.results), category: "measurements", source: "imported", revision: 1 }],
    questions: fixture.defaultQuestions.map(q => ({ id: q.id, patientId: "may", text: q.text, selected: q.added })),
    medicationDoses: fixture.createDoses().map(d => {
      const med = fixture.michelleMeds.find(m => m.id === d.medicationId)!;
      return { id: d.id, patientId: "may", medicationId: d.medicationId, name: med.name, dose: med.dose, scheduledAt: d.scheduledAt, status: d.status, occurredAt: d.occurrenceAt, enteredAt: d.enteredAt, source: "user", revision: 1 };
    }),
    appointments: fixture.createAppointments().map(a => ({ id: a.id, patientId: "may", title: a.title, scheduledAt: a.at, location: { zh: "家庭醫生診所", en: "Family doctor clinic" }, status: "scheduled", revision: 1, bookingStatus: "none" })),
    tasks: fixture.createTasks().map(t => ({ id: t.id, patientId: "may", ownerId: "may", proposedOwnerId: null, kind: t.kind === "bp" ? "check-in" : "medication", status: t.state === "completed" ? "completed" : "scheduled", scheduledAt: `${t.date}T${t.time}:00+08:00`, sourceRecordIds: t.kind === "bp" ? ["bp-16"] : [], shareCategory: t.kind === "bp" ? "measurements" : "medication", contactOutcome: null, contactNote: "", title: t.title, revision: 1 })),
    grants: [], events: [], briefs: [],
    memories: fixture.createMemories().map(m => ({ id: m.id, patientId: "may", value: m.value, detail: m.detail, source: m.source, enteredAt: m.enteredAt, enabled: !m.excluded, pendingConfirm: !!m.pendingConfirm, sourceRecordIds: m.id === "mem-gap" ? ["dose-ator-14"] : [], revision: 1 })),
  };
  if (["dizziness", "share-needed", "caregiver-alert", "next-morning", "urgent-help"].includes(id)) {
    state.episodes.push({ id: "episode-dizzy", patientId: "may", answers: { ...fixture.emptyAnswers }, step: "urgent", disposition: "open", sourceRecordIds: ["rec-dizzy", "bp-16"], revision: 1, saved: false, phase: "concern_open", followup: "none" });
    state.assistantSessions.push({ id: "session-dizzy", patientId: "may", episodeId: "episode-dizzy", status: "active", draft: "", messages: [{ id: "m-open", role: "assistant", text: { zh: "我看到你今早記錄了頭暈，血壓是151/94。先確認幾項可能需要即時處理的情況。", en: "I can see you recorded dizziness this morning, and your blood pressure is 151/94. First I need to check a few situations that may need urgent care." } }] });
  } else {
    state.healthRecords = state.healthRecords.filter(r => r.id !== "rec-dizzy");
  }
  if (id === "low-mood") state.drafts.push({ id: "draft-low-mood", patientId: "may", occurredAt: state.clock, mood: "low", body: null, note: "", step: "body", taskId: null, revision: 1 });
  if (id === "share-needed" || id === "caregiver-alert" || id === "after-visit") {
    state.tasks.push({ id: "task-fixture-attention", patientId: "may", ownerId: "may", proposedOwnerId: "david", kind: id === "after-visit" ? "after-visit" : "contact", status: "pending", scheduledAt: null, sourceRecordIds: [id === "after-visit" ? "record-after-visit" : "rec-dizzy"], shareCategory: "body", contactOutcome: "not_contacted", contactNote: "", title: { zh: "希望家人協助跟進", en: "Ask family for help following up" }, revision: 1 });
  }
  if (id === "caregiver-alert") {
    state.context = { actorId: "david", patientId: "may", perspective: "caregiver" };
    state.grants.push({ id: "grant-david", patientId: "may", recipientId: "david", level: "alerts-only", categories: ["body"], status: "active", updatedAt: state.clock, revision: 1 });
    state.events.push({ id: "event-fixture-attention", patientId: "may", recipientId: "david", triggerId: "fixture-attention", taskId: "task-fixture-attention", category: "body", status: "pending", occurredAt: state.clock, response: "", sourceRecordIds: ["rec-dizzy"], revision: 1 });
  }
  if (id === "day-before-visit") state.clock = "2026-09-21T08:45:00+08:00";
  if (id === "next-morning") {
    state.clock = "2026-09-17T09:15:00+08:00";
    state.episodes[0] = { ...state.episodes[0], disposition: "ordinary", step: "next_morning", saved: true, phase: "next_session", followup: "scheduled", answers: { urgent: "none", onset: "after-waking", change: "better", medGap: "forgot", nextMorning: null } };
    state.tasks.push({ id: "task-morning", patientId: "may", ownerId: "may", proposedOwnerId: null, kind: "check-in", status: "scheduled", scheduledAt: state.clock, sourceRecordIds: ["rec-dizzy"], shareCategory: "body", contactOutcome: null, contactNote: "", title: { zh: "記錄血壓和頭暈情況", en: "Record blood pressure and dizziness" }, revision: 1 });
  }
  if (id === "after-visit") {
    state.clock = "2026-09-22T16:00:00+08:00";
    state.appointments[0].status = "completed";
    state.healthRecords.push({ id: "record-after-visit", patientId: "may", category: "body", source: "user", occurredAt: state.clock, enteredAt: state.clock, title: { zh: "覆診後本人紀錄", en: "My note after the visit" }, text: { zh: "希望家人協助整理下次覆診問題。", en: "I would like help organising questions for my next visit." }, kind: "note", revision: 1 });
  }
  if (id === "urgent-help") state.episodes[0] = { ...state.episodes[0], answers: { ...state.episodes[0].answers, urgent: "chest-breath" }, step: "urgent_help", phase: "urgent_help", disposition: "urgent" };
  return structuredClone(state);
}
