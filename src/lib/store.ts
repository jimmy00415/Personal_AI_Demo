"use client";

import { create } from "zustand";
import { ensurePrevisitDraft, openBriefDraft, reconcileBriefs, confirmBrief, updateBriefDraft, prepareBriefExport } from "./demo/brief";
import type { BriefPacket, RecipientId } from "./demo/types";
import { setConsent, revokeConsent, createAttentionEvent, respondToEvent, resolveEvent, invalidateUnavailableRequests, shareCategories, sharingLevels, type ConsentInput } from "./demo/sharing";
import type {
  Answers,
  Appointment,
  BookingStatus,
  CareTask,
  ChatMessage,
  ChatStep,
  ConsultationQuestion,
  ContactStatus,
  FamilyConsent,
  FollowupStatus,
  HealthRecord,
  HealthTab,
  JourneyPhase,
  Locale,
  MedicationDose,
  Localized,
  MemoryItem,
  PersonId,
  SceneId,
} from "./types";
import { messages, translate, type MessageKey } from "./i18n";
import { ensureAssistantSession, getHelpDisposition, getLocalAssistantReply, hasSymptomContext, interruptForHelp } from "./demo/local-assistant";
import { symptomLine } from "./selectors";
import { NEXT_CLOCK, OPENING_CLOCK } from "./types";
import type { ActionResult, ActorId, CheckInDraft, DemoState, Observation, ScenarioId } from "./demo/types";
import { setAppointment, cancelAppointment, createAccompanyTask, completePersonalTask, cancelTask, completeCheckInTask, createAfterVisitTask, followupDraftId, recordContactOutcome, rescheduleTask, scheduleFollowup, setDoseStatus, snoozeTask, type ContactOutcome, type DoseCorrection, type FollowupChange } from "./demo/care";
import { createCheckInDraft, updateCheckInDraft, commitCheckIn, saveObservation } from "./demo/check-in";
import { createScenario } from "./demo/scenarios";
import { loadDemo, saveDemo, loadPreferences, savePreferences, getEmergencySession, setEmergencySession } from "./demo/persistence";
import { selectContext, selectActiveMemories, setMemoryUse, correctMemory } from "./demo/selectors";
import { applyLegacyPatch, projectLegacy, currentEpisode } from "./demo/legacy";
import { bindDemoReader } from "./seed";
import { clinicSlots, emptyAnswers } from "./seed";
import { addMinutes, clockParts } from "./clock";

export interface AppState {
  demo: DemoState;
  introComplete: boolean;
  persistenceError: string | null;
  activeEmergencyEpisodeId: string | null;
  locale: Locale;
  liteMode: boolean;
  clock: string;
  viewingPersonId: PersonId;
  healthTab: HealthTab;
  step: ChatStep;
  phase: JourneyPhase;
  messages: ChatMessage[];
  answers: Answers;
  episodeSaved: boolean;
  doses: MedicationDose[];
  tasks: CareTask[];
  records: HealthRecord[];
  memories: MemoryItem[];
  questions: ConsultationQuestion[];
  customQuestion: string;
  contactStatus: ContactStatus;
  contactNote: string;
  followup: FollowupStatus;
  followupAt: string | null;
  consent: FamilyConsent;
  sharingStopped: boolean;
  motherBriefReady: boolean;
  accompanyAdded: boolean;
  pendingPath: string | null;
  toast: string | null;
  todayScroll: number;
  selectedRecordId: string | null;
  forgetId: string | null;
  sourceOpen: boolean;
  expandedLab: string | null;
  readingNotes: Record<string, string>;
  hydrated: boolean;
  appointments: Appointment[];
  bookingStatus: BookingStatus;
  selectedSlotId: string | null;
}

interface Actions {
  editConsultationQuestion: (id: string, text: string) => ActionResult<void>;
  openBriefDraft: (appointmentId: string, recipientId?: RecipientId) => ActionResult<void>;
  confirmBrief: (id: string, reviewedFingerprint: string) => ActionResult<void>;
  updateBriefDraft: (id: string, patch: Parameters<typeof updateBriefDraft>[2]) => ActionResult<void>;
  prepareBriefExport: (id: string, recipientId?: RecipientId) => ActionResult<BriefPacket>;
  createAttentionEvent: (input: Parameters<typeof createAttentionEvent>[1]) => ActionResult<void>;
  respondToEvent: (eventId: string, response: Parameters<typeof respondToEvent>[2]) => ActionResult<void>;
  resolveEvent: (eventId: string, actorId: ActorId) => ActionResult<void>;
  completePersonalTask: (id: string) => ActionResult<void>;
  setConsent: (input: ConsentInput) => ActionResult<void>;
  revokeConsent: (grantId: string) => ActionResult<void>;
  syncFromStorage: () => void;
  setDoseStatus: (id: string, status: DoseCorrection) => ActionResult<void>;
  scheduleFollowup: (at: string) => ActionResult<void>;
  cancelCareTask: (id: string) => ActionResult<void>;
  snoozeTask: (id: string, at: string) => ActionResult<void>;
  rescheduleTask: (id: string, at: string) => ActionResult<void>;
  recordContactOutcome: (id: string, outcome: ContactOutcome, note: string) => ActionResult<void>;
  createAfterVisitTask: (input: Parameters<typeof createAfterVisitTask>[1]) => ActionResult<void>;
  completeCheckInTask: (taskId: string, checkInId: string) => ActionResult<void>;
  beginTaskCheckIn: (taskId: string, change?: FollowupChange) => ActionResult<string>;
  beginCheckIn: () => void;
  editCheckIn: (id: string) => void;
  patchCheckIn: (id: string, patch: Partial<Pick<CheckInDraft, "mood" | "body" | "note" | "step" | "followupChange">>) => void;
  saveCheckIn: (id: string) => ActionResult<void>;
  saveObservation: (observation: Observation) => ActionResult<void>;
  setPerspective: (actorId: ActorId) => void;
  applyScenario: (id: ScenarioId) => void;
  setScenarioClock: (at: string) => void;
  resetDemo: () => void;
  hydrate: () => void;
  persistNow: () => void;
  completeIntro: () => void;
  setMemoryUse: (id: string, enabled: boolean) => ActionResult<void>;
  correctMemory: (id: string, value: Localized) => ActionResult<void>;
  setLocale: (locale: Locale) => void;
  setLiteMode: (on: boolean) => void;
  setViewingPerson: (id: PersonId) => void;
  setHealthTab: (tab: HealthTab) => void;
  setTodayScroll: (n: number) => void;
  setSelectedRecord: (id: string | null) => void;
  setForgetId: (id: string | null) => void;
  setSourceOpen: (on: boolean) => void;
  setExpandedLab: (id: string | null) => void;
  setReadingNote: (id: string, note: string) => void;
  setCustomQuestion: (v: string) => void;
  consumePendingPath: () => void;
  showToast: (message: string) => void;
  resetWorld: () => void;
  clearDeviceData: () => void;
  applyScene: (id: SceneId) => void;
  advanceClock: () => void;
  openAsk: () => void;
  answer: (id: string) => void;
  editSummary: () => void;
  saveSummary: () => void;
  sendFreeText: (text: string) => void;
  setAssistantDraft: (text: string) => void;
  requestHelp: (kind: "physical" | "emotional") => void;
  addChat: (role: ChatMessage["role"], text: ChatMessage["text"]) => string;
  removeMessage: (id: string) => void;
  toggleQuestion: (id: string) => void;
  addCustomQuestion: () => void;
  setContact: (status: ContactStatus, note: string) => void;
  acceptFollowup: (at: string) => ActionResult<void>;
  declineFollowup: () => void;
  cancelFollowup: () => void;
  changeFollowup: (at: string) => ActionResult<void>;
  answerNextMorning: (id: NextId) => void;
  completeTask: (id: string) => void;
  excludeMemory: (id: string) => void;
  confirmMemory: (id: string) => void;
  stopSharing: () => void;
  prepareMotherBrief: () => void;
  addAccompany: () => void;
  selectSlot: (id: string) => void;
  bookSlot: (id: string) => ActionResult<void>;
  setAppointment: (appointmentId: string, slotId: string) => ActionResult<void>;
  cancelAppointment: (appointmentId: string) => ActionResult<void>;
  createAccompanyTask: (appointmentId: string) => ActionResult<void>;
}

type NextId = "no-dizzy" | "still" | "worse";

const URGENT_IDS = ["chest-breath", "stroke", "collapse"];
const ONSET_IDS = ["after-waking", "just-now", "yesterday", "other"];
const CHANGE_IDS = ["better", "same", "worse", "unclear"];
const MED_IDS = ["taken-unlogged", "not-taken", "forgot"];

const ONSET_QUESTION_ID = "a-onset";

let messageSeq = 0;

/** Transcript ids must stay unique even when a question is asked again after a correction. */
function chatId(prefix: string) {
  messageSeq += 1;
  return `${prefix}-${messageSeq}-${Date.now().toString(36)}`;
}

function say(key: MessageKey): Localized {
  return messages[key];
}

function onsetQuestion(): ChatMessage {
  return { id: ONSET_QUESTION_ID, role: "assistant", text: say("ask.onsetQ") };
}

function world(clock = OPENING_CLOCK): AppState {
  const demo = { ...createScenario("dizziness"), clock };
  return {
    ...projectLegacy(demo, null), demo,
    locale: "zh-HK", liteMode: false, introComplete: false,
    persistenceError: null, activeEmergencyEpisodeId: null,
    viewingPersonId: "michelle", healthTab: "overview",
    customQuestion: "", pendingPath: null, toast: null, todayScroll: 0,
    selectedRecordId: null, forgetId: null, sourceOpen: false, expandedLab: null,
    hydrated: false, selectedSlotId: "slot-17-1100",
  };
}

function sceneWorld(id: SceneId): AppState {
  const base = world();
  if (id === "morning-start") return { ...base, pendingPath: "/" };
  if (id === "urgent-help") {
    return {
      ...base,
      step: "urgent_help",
      phase: "urgent_help",
      answers: { ...base.answers, urgent: "chest-breath" },
      pendingPath: "/ask",
    };
  }
  const saved = savedWorld(base);
  if (id === "symptom-summary") return { ...saved, pendingPath: "/ask" };
  if (id === "report-review") return { ...saved, pendingPath: "/report" };
  if (id === "brief-ready") {
    return {
      ...saved,
      questions: saved.questions.map((q) => (q.id === "q-hba1c-follow" ? { ...q, added: true } : q)),
      phase: "brief_ready",
      pendingPath: "/brief",
    };
  }
  if (id === "next-morning") {
    return {
      ...savedWorld(base),
      clock: NEXT_CLOCK,
      phase: "next_session",
      step: "next_morning",
      followup: "scheduled",
      followupAt: "2026-09-17T08:30:00+08:00",
      tasks: [
        ...savedWorld(base).tasks,
        { id: "task-contact", personId: "michelle", date: "2026-09-16", time: "09:00", title: { zh: "聯絡醫護", en: "Contact a clinician" }, kind: "contact", state: "pending" },
        { id: "task-morning", personId: "michelle", date: "2026-09-17", time: "08:30", title: { zh: "記錄血壓和頭暈情況", en: "Record blood pressure and dizziness" }, kind: "followup", state: "scheduled" },
      ],
      pendingPath: "/",
    };
  }
  if (id === "family-preparation") {
    return { ...base, viewingPersonId: "lai-wah", pendingPath: "/family" };
  }
  if (id === "booking-ready") return { ...savedWorld(base), pendingPath: "/book", selectedSlotId: "slot-17-1100" };
  if (id === "booking-done") return bookedWorld(savedWorld(base), "slot-17-1100");
  return { ...base, pendingPath: "/" };
}

function applySlot(appointments: Appointment[], tasks: CareTask[], slotId: string) {
  const slot = clinicSlots.find((s) => s.id === slotId);
  if (!slot) return { appointments, tasks, bookingStatus: "none" as BookingStatus, selectedSlotId: slotId };
  return {
    appointments: appointments.map((a) => (a.id === "appt-gp" ? { ...a, at: slot.at } : a)),
    tasks,
    bookingStatus: (slot.current ? "kept" : "booked") as BookingStatus,
    selectedSlotId: slotId,
  };
}

function bookedWorld(base: AppState, slotId: string): AppState {
  const next = applySlot(base.appointments, base.tasks, slotId);
  return { ...base, ...next, pendingPath: "/book" };
}

function savedWorld(base: AppState): AppState {
  const clock = base.clock;
  const answers: Answers = { urgent: "none", onset: "after-waking", change: "better", medGap: "taken-unlogged", nextMorning: null };
  return {
    ...base,
    episodeSaved: true,
    step: "saved",
    phase: "summary_saved",
    answers,
    doses: base.doses.map((d) =>
      d.id === "dose-ator-14"
        ? { ...d, status: "user_confirmed_taken", occurrenceAt: null, enteredAt: addMinutes(clock, 3) }
        : d,
    ),
    memories: base.memories.map((m) =>
      m.id === "mem-gap"
        ? {
            ...m,
            pendingConfirm: false,
            value: { zh: "9月14日晚上Atorvastatin：你表示已服藥", en: "Atorvastatin on 14 September evening: you say it was taken" },
            detail: { zh: "由你於當日補記。不會再把這次空缺當作未服藥。", en: "Noted by you. This missing record is not treated as a missed dose." },
          }
        : m,
    ),
    records: [
      {
        id: "ep-dizzy-16",
        personId: "michelle",
        kind: "symptom",
        occurredAt: "2026-09-16T08:35:00+08:00",
        enteredAt: clock,
        title: { zh: "頭暈整理", en: "Dizziness summary" },
        summary: {
          zh: `${symptomLine(answers, "zh-HK")}。今早血壓151/94。`,
          en: `${symptomLine(answers, "en")}. Morning BP 151/94.`,
        },
        provenance: { source: "organised", occurredAt: "2026-09-16T08:35:00+08:00", enteredAt: clock },
      },
      ...base.records.filter((r) => r.id !== "rec-dizzy"),
    ],
    tasks: [
      ...base.tasks,
      { id: "task-contact", personId: "michelle", date: clockParts(clock).dateKey, time: "09:00", title: { zh: "聯絡醫護", en: "Contact a clinician" }, kind: "contact", state: "pending" },
    ],
    messages: [
      ...base.messages,
      { id: "u-none", role: "user", text: { zh: "以上都沒有", en: "None of these" } },
      { id: "a-onset", role: "assistant", text: { zh: "頭暈大約甚麼時候開始？", en: "About when did the dizziness start?" } },
      { id: "u-wake", role: "user", text: { zh: "今早起床後", en: "After getting up this morning" } },
      { id: "a-chg", role: "assistant", text: { zh: "現在的感覺有沒有改變？", en: "Has it changed compared with earlier?" } },
      { id: "u-better", role: "user", text: { zh: "比剛才減輕", en: "Easier than earlier" } },
      { id: "a-med", role: "assistant", text: { zh: "另外，9月14日晚上沒有服藥紀錄。這不代表你沒有服藥，我想確認一下當晚的情況。", en: "There is no medication record for the evening of 14 September." } },
      { id: "u-taken", role: "user", text: { zh: "有服藥，只是沒有記錄", en: "I took it, but did not record it" } },
    ],
  };
}

/** Higher revisions win; equal revisions meet at the most restrictive shared permission.
 * Revoked beats active, categories intersect, and the lower content level wins. The
 * revision stays stable so a later explicit May edit can supersede the conflict.
 * Unfinished unavailable assignments return to May; sources and workflow history stay intact.
 */
function mergePermissions(base: DemoState, incoming: DemoState, equalOnly = false): DemoState {
  const changed = new Set<string>();
  const grants = [...base.grants];
  for (const candidate of incoming.grants) {
    const index = grants.findIndex(g => g.id === candidate.id);
    const current = grants[index];
    if (equalOnly && current?.revision !== candidate.revision || current && candidate.revision < current.revision) continue;
    let resolved = candidate;
    if (current?.revision === candidate.revision) {
      const categories = shareCategories.filter(c => current.categories.includes(c) && candidate.categories.includes(c));
      resolved = { ...current, categories,
        level: sharingLevels[Math.min(sharingLevels.indexOf(current.level), sharingLevels.indexOf(candidate.level))],
        status: current.status === "revoked" || candidate.status === "revoked" || !categories.length ? "revoked" : "active",
        updatedAt: [current.updatedAt, candidate.updatedAt].sort((a, b) => Date.parse(a) - Date.parse(b) || a.localeCompare(b)).at(-1)!,
      };
      if (current.status === resolved.status && current.level === resolved.level && current.updatedAt === resolved.updatedAt && current.categories.join() === resolved.categories.join()) continue;
    }
    changed.add(candidate.id);
    if (index < 0) grants.push(resolved); else grants[index] = resolved;
  }
  // An event revocation must merge even when the grant itself is identical.
  const events = base.events.map(e => {
    const candidate = incoming.events.find(n => n.id === e.id);
    if (candidate?.status === "revoked" && candidate.revision >= e.revision && (e.status !== "revoked" || candidate.revision > e.revision)) return { ...e, status: "revoked" as const, revision: candidate.revision };
    return e;
  });
  const briefs = base.briefs.map(b => {
    const grant = grants.find(g => g.patientId === b.patientId && g.recipientId === b.recipientId && changed.has(g.id));
    // A same-revision conflict changes the visible content too, invalidating confirmation.
    return grant && b.status === "confirmed" ? { ...b, status: "draft" as const, confirmedAt: null, revision: b.revision + 1 } : b;
  });
  const merged = !changed.size && events.every((e, i) => e === base.events[i]) ? base : { ...base, grants, events, briefs };
  return invalidateUnavailableRequests(merged);
}

let toastTimer: number | undefined;

export const useAppStore = create<AppState & Actions>((rawSet, get) => {
  // Existing routes submit legacy-shaped patches; translate first, publish one atomic snapshot.
  // Compatibility fields are recalculated, never persisted or independently authoritative.
  const set = (patch: Partial<AppState>) => {
    const current = get();
    let demo = reconcileBriefs(patch.demo ?? applyLegacyPatch(current.demo, patch));
    for (const appointment of demo.appointments) demo = ensurePrevisitDraft(demo, appointment.id);
    let activeEmergencyEpisodeId = patch.activeEmergencyEpisodeId === undefined ? current.activeEmergencyEpisodeId : patch.activeEmergencyEpisodeId;
    if (patch.phase === "urgent_help" && demo.context.actorId === "may") activeEmergencyEpisodeId = currentEpisode(demo)?.id ?? null;
    rawSet({ ...patch, demo, activeEmergencyEpisodeId, ...projectLegacy(demo, activeEmergencyEpisodeId) });
  };
  const savePersisted = (state: AppState, preserveNewerGrants = true) => {
    if (typeof window === "undefined") return;
    try {
      const stored = loadDemo(window.localStorage);
      // A delayed preference/task write must never resurrect an older permission snapshot.
      if (preserveNewerGrants && stored.ok && stored.value) {
        const demo = mergePermissions(state.demo, stored.value);
        if (demo !== state.demo) { set({ demo }); state = get(); }
      }
      const results = [saveDemo(window.localStorage, state.demo), savePreferences(window.localStorage, { locale: state.locale, liteMode: state.liteMode, introComplete: state.introComplete }), setEmergencySession(window.sessionStorage, state.activeEmergencyEpisodeId)];
      const failed = results.find(r => !r.ok);
      rawSet({ persistenceError: failed && !failed.ok ? failed.code : null, ...(failed && state.toast ? { toast: translate("storage.memoryOnly", state.locale) } : {}) });
    } catch (error) { rawSet({ persistenceError: error instanceof Error ? error.name : "StorageUnavailable" }); }
  };
  const setDocumentPreferences = () => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = get().locale;
    document.documentElement.classList.toggle("lite", get().liteMode);
  };
  const applyCare = (result: ActionResult<DemoState>): ActionResult<void> => {
    if (!result.ok) return result;
    set({ demo: result.value });
    savePersisted(get());
    return { ok: true, value: undefined };
  };
  return {
  ...world(),
  editConsultationQuestion: (id, text) => {
    get().syncFromStorage();
    const demo = get().demo;
    if (demo.context.actorId !== "may") return { ok: false, code: "patient-only" };
    if (!text.trim() || text.trim().length > 500 || !demo.questions.some(q => q.id === id && q.patientId === demo.context.patientId)) return { ok: false, code: "invalid-question" };
    return applyCare({ ok: true, value: { ...demo, questions: demo.questions.map(q => q.id === id ? { ...q, text: { zh: text.trim(), en: text.trim() } } : q) } });
  },
  openBriefDraft: (id, recipient) => { get().syncFromStorage(); return applyCare(openBriefDraft(get().demo, id, recipient)); },
  updateBriefDraft: (id, patch) => { get().syncFromStorage(); return applyCare(updateBriefDraft(get().demo, id, patch)); },
  confirmBrief: (id, reviewedFingerprint) => {
    get().syncFromStorage();
    if (get().demo.briefs.find(b => b.id === id)?.contentFingerprint !== reviewedFingerprint) return { ok: false, code: "review-required" };
    return applyCare(confirmBrief(get().demo, id));
  },
  prepareBriefExport: (id, recipient) => { get().syncFromStorage(); return prepareBriefExport(get().demo, id, recipient); },
  syncFromStorage: () => {
    if (typeof window === "undefined") return;
    const loaded = loadDemo(window.localStorage);
    if (loaded.ok && loaded.value) {
      const local = get().demo;
      // An unsuccessful save leaves valid local work in memory. Still accept newer revocations.
      const demo = get().persistenceError ? mergePermissions(local, loaded.value) : mergePermissions(loaded.value, local, true);
      set({ demo: { ...demo, context: local.context }, selectedRecordId: null });
    }
    else if (!loaded.ok) set({ persistenceError: loaded.code });
  },
  setConsent: input => { get().syncFromStorage(); return applyCare(setConsent(get().demo, input)); },
  revokeConsent: id => { get().syncFromStorage(); return applyCare(revokeConsent(get().demo, id)); },
  createAttentionEvent: input => { get().syncFromStorage(); return applyCare(createAttentionEvent(get().demo, input)); },
  respondToEvent: (id, response) => { get().syncFromStorage(); return applyCare(respondToEvent(get().demo, id, response)); },
  resolveEvent: (id, actorId) => { get().syncFromStorage(); return applyCare(resolveEvent(get().demo, id, actorId)); },
  completePersonalTask: id => { get().syncFromStorage(); return applyCare(completePersonalTask(get().demo, id)); },
  setAppointment: (id, slotId) => applyCare(setAppointment(get().demo, id, slotId)),
  cancelAppointment: id => applyCare(cancelAppointment(get().demo, id)),
  createAccompanyTask: id => { get().syncFromStorage(); return applyCare(createAccompanyTask(get().demo, id)); },
  setDoseStatus: (id, status) => applyCare(setDoseStatus(get().demo, id, status)),
  scheduleFollowup: at => applyCare(scheduleFollowup(get().demo, get().demo.context.patientId, at)),
  cancelCareTask: id => { get().syncFromStorage(); return applyCare(cancelTask(get().demo, id)); },
  snoozeTask: (id, at) => { get().syncFromStorage(); return applyCare(snoozeTask(get().demo, id, at)); },
  rescheduleTask: (id, at) => { get().syncFromStorage(); return applyCare(rescheduleTask(get().demo, id, at)); },
  recordContactOutcome: (id, outcome, note) => applyCare(recordContactOutcome(get().demo, id, outcome, note)),
  createAfterVisitTask: input => {
    get().syncFromStorage();
    const created = createAfterVisitTask(get().demo, input);
    if (!created.ok) return created;
    const task = created.value.tasks.at(-1)!;
    const request = input.proposedOwnerId === "david" ? createAttentionEvent(created.value, { patientId: input.patientId, sourceRecordId: task.sourceRecordIds[0], taskId: task.id, scenario: "after-visit-task" }) : null;
    // Saving the patient's source succeeds even when consent does not permit a request.
    return applyCare(request?.ok ? request : created);
  },
  completeCheckInTask: (taskId, checkInId) => applyCare(completeCheckInTask(get().demo, taskId, checkInId)),
  beginTaskCheckIn: (taskId, change) => {
    const demo = get().demo;
    const task = demo.tasks.find(t => t.id === taskId && t.patientId === demo.context.patientId && t.kind === "check-in");
    if (!task || demo.context.actorId !== "may") return { ok: false, code: "task-missing" };
    if (["completed", "cancelled"].includes(task.status)) return { ok: false, code: "task-inactive" };
    if (task.scheduledAt && Date.parse(task.scheduledAt) > Date.parse(demo.clock)) return { ok: false, code: "not-due" };
    const currentId = followupDraftId(task, demo.clock);
    const prior = demo.drafts.find(d => d.id === currentId) ?? demo.drafts.find(d => d.id === followupDraftId(task) && clockParts(d.occurredAt).dateKey === clockParts(demo.clock).dateKey);
    const id = prior?.id ?? currentId;
    const draft: CheckInDraft = { ...(prior ?? { id, patientId: task.patientId, occurredAt: demo.clock, mood: null, body: null, note: "", step: "mood", taskId, revision: 1 }), ...(change ? { followupChange: change } : {}) };
    set({ demo: { ...demo, drafts: prior ? demo.drafts.map(d => d.id === id ? draft : d) : [...demo.drafts, draft] } });
    savePersisted(get());
    return { ok: true, value: id };
  },
  beginCheckIn: () => {
    const demo = get().demo;
    if (demo.context.actorId !== "may") return;
    const draft = createCheckInDraft(demo, demo.context.patientId);
    if (demo.drafts.some(d => d.id === draft.id)) return;
    set({ demo: { ...demo, drafts: [...demo.drafts, draft] } });
    savePersisted(get());
  },
  editCheckIn: (id) => {
    const demo = get().demo;
    const record = demo.checkIns.find(r => r.id === id && r.patientId === demo.context.patientId);
    if (!record || demo.context.actorId !== "may") return;
    const draft: CheckInDraft = demo.drafts.find(d => d.id === record.draftId && d.patientId === record.patientId) ?? { id: record.draftId, patientId: record.patientId, occurredAt: record.occurredAt, mood: record.mood, body: record.body, note: record.note, step: "mood", taskId: record.taskId ?? null, ...(record.followupChange ? { followupChange: record.followupChange } : {}), revision: record.revision };
    set({ demo: { ...demo, drafts: [...demo.drafts.filter(d => d.id !== draft.id), draft] }, selectedRecordId: null });
    savePersisted(get());
  },
  patchCheckIn: (id, patch) => {
    const demo = get().demo;
    if (demo.context.actorId !== "may") return;
    const { step, followupChange, ...content } = patch;
    set({ demo: { ...demo, drafts: demo.drafts.map(d => d.id === id ? { ...updateCheckInDraft(d, content), ...(step ? { step } : {}), ...(followupChange ? { followupChange } : {}) } : d) } });
    savePersisted(get());
  },
  saveCheckIn: (id) => {
    const demo = get().demo;
    const draft = demo.drafts.find(d => d.id === id);
    if (!draft) return demo.checkIns.some(r => r.draftId === id) ? { ok: true, value: undefined } : { ok: false, code: "DraftMissing" };
    const helpKind = getHelpDisposition(draft.note);
    if (helpKind) { get().requestHelp(helpKind); return { ok: false, code: "help-required" }; }
    if (get().activeEmergencyEpisodeId) return { ok: false, code: "help-required" };
    if (draft.taskId && draft.step !== "review") return { ok: false, code: "review-required" };
    const result = commitCheckIn(demo, draft);
    if (!result.ok) return result;
    const completed = draft.taskId ? completeCheckInTask(result.value, draft.taskId, result.value.checkIns.find(c => c.draftId === id)!.id) : null;
    set({ demo: completed?.ok ? completed.value : result.value });
    savePersisted(get());
    return { ok: true, value: undefined };
  },
  saveObservation: (observation) => {
    const result = saveObservation(get().demo, observation);
    if (!result.ok) return result;
    set({ demo: result.value });
    savePersisted(get());
    return { ok: true, value: undefined };
  },
  setPerspective: (actorId) => {
    if (typeof window !== "undefined") { try { window.sessionStorage.setItem("caremate-v4-actor", actorId); } catch { /* memory state still works */ } }
    set({ demo: { ...get().demo, context: selectContext(get().demo, actorId) }, viewingPersonId: "michelle" });
    savePersisted(get());
  },
  applyScenario: (id) => {
    const demo = createScenario(id);
    const activeEmergencyEpisodeId = id === "urgent-help" ? demo.episodes.find(e => e.disposition === "urgent")?.id ?? null : null;
    set({ ...world(), demo, locale: get().locale, liteMode: get().liteMode, introComplete: get().introComplete, activeEmergencyEpisodeId, hydrated: true });
    if (typeof window !== "undefined") { try { window.sessionStorage.setItem("caremate-v4-actor", demo.context.actorId); } catch { /* in-memory context remains authoritative */ } }
    savePersisted(get(), false);
  },
  setScenarioClock: (at) => {
    if (!/(?:Z|[+-]\d\d:\d\d)$/.test(at) || !Number.isFinite(Date.parse(at))) return;
    set({ demo: { ...get().demo, clock: at } });
    savePersisted(get());
  },
  resetDemo: () => {
    get().applyScenario("dizziness");
    set({ pendingPath: "/" });
  },
  hydrate: () => {
    if (typeof window === "undefined" || get().hydrated) return;
    let demo = get().demo;
    let preferences = { locale: get().locale, liteMode: get().liteMode, introComplete: get().introComplete };
    let activeEmergencyEpisodeId: string | null = null;
    let persistenceError: string | null = null;
    try {
      const loaded = loadDemo(window.localStorage);
      if (loaded.ok) demo = loaded.value ?? demo;
      else persistenceError = loaded.code;
      const actor = window.sessionStorage.getItem("caremate-v4-actor");
      if (actor === "may" || actor === "david") demo = { ...demo, context: selectContext(demo, actor) };
      window.sessionStorage.setItem("caremate-v4-actor", demo.context.actorId);
      const prefs = loadPreferences(window.localStorage);
      if (prefs.ok) preferences = prefs.value ?? preferences;
      else persistenceError = prefs.code;
      const session = getEmergencySession(window.sessionStorage);
      if (session.ok) activeEmergencyEpisodeId = demo.episodes.some(e => e.id === session.value && e.disposition === "urgent") ? session.value : null;
      else persistenceError = session.code;
      const episode = currentEpisode(demo);
      if (!activeEmergencyEpisodeId && episode?.disposition === "urgent") {
        const id = `episode-recheck-${demo.episodes.length + 1}`;
        demo = { ...demo, episodes: [...demo.episodes, { ...episode, id, helpKind: undefined, answers: { ...emptyAnswers }, disposition: "open", step: "urgent", phase: "concern_open", saved: false, followup: "none", revision: 1 }], assistantSessions: [...demo.assistantSessions, { id: `session-${id}`, patientId: "may", episodeId: id, messages: [{ id: "recheck", role: "assistant", text: say("local.recheckBody") }], status: "active", draft: "" }] };
      }
    } catch (error) { persistenceError = error instanceof Error ? error.name : "StorageUnavailable"; }
    set({ demo, ...preferences, activeEmergencyEpisodeId, persistenceError, toast: null, pendingPath: null, hydrated: true });
    setDocumentPreferences();
    // Do not overwrite a corrupt or unreadable snapshot with a misleading successful save.
    if (!persistenceError) savePersisted(get());
  },
  persistNow: () => savePersisted(get()),
  completeIntro: () => { set({ introComplete: true }); savePersisted(get()); },
  setMemoryUse: (id, enabled) => { get().syncFromStorage(); return applyCare(setMemoryUse(get().demo, id, enabled)); },
  correctMemory: (id, value) => { get().syncFromStorage(); return applyCare(correctMemory(get().demo, id, value)); },
  setLocale: (locale) => {
    set({ locale });
    setDocumentPreferences();
    savePersisted(get());
  },
  setLiteMode: (liteMode) => {
    set({ liteMode });
    setDocumentPreferences();
    savePersisted(get());
  },
  setViewingPerson: (viewingPersonId) => set({ viewingPersonId }),
  setHealthTab: (healthTab) => set({ healthTab }),
  setTodayScroll: (todayScroll) => set({ todayScroll }),
  setSelectedRecord: (selectedRecordId) => set({ selectedRecordId }),
  setForgetId: (forgetId) => set({ forgetId }),
  setSourceOpen: (sourceOpen) => set({ sourceOpen }),
  setExpandedLab: (expandedLab) => set({ expandedLab }),
  setReadingNote: (id, note) => {
    set({ readingNotes: { ...get().readingNotes, [id]: note } });
    savePersisted(get());
  },
  setCustomQuestion: (customQuestion) => set({ customQuestion }),
  consumePendingPath: () => set({ pendingPath: null }),
  showToast: (toast) => {
    set({ toast });
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      if (get().toast === toast) set({ toast: null });
    }, 2200);
  },
  resetWorld: () => get().resetDemo(),
  clearDeviceData: () => {
    get().resetDemo();
    get().showToast(translate(get().persistenceError ? "storage.memoryOnly" : "settings.cleared", get().locale));
  },
  applyScene: (id) => {
    const legacy = sceneWorld(id);
    const demo = applyLegacyPatch(createScenario("dizziness"), legacy);
    set({ ...legacy, demo, locale: get().locale, liteMode: get().liteMode, introComplete: get().introComplete, activeEmergencyEpisodeId: id === "urgent-help" ? currentEpisode(demo)?.id ?? null : null, hydrated: true });
    if (typeof window !== "undefined") { try { window.sessionStorage.setItem("caremate-v4-actor", demo.context.actorId); } catch { /* in-memory context remains authoritative */ } }
    savePersisted(get(), false);
  },
  advanceClock: () => {
    const demo = get().demo;
    const followup = demo.tasks.find(t => t.id === "task-morning" && t.status !== "cancelled" && t.status !== "completed");
    const target = followup?.scheduledAt && clockParts(followup.scheduledAt).dateKey === clockParts(NEXT_CLOCK).dateKey && Date.parse(followup.scheduledAt) > Date.parse(NEXT_CLOCK) ? followup.scheduledAt : NEXT_CLOCK;
    const clock = Date.parse(demo.clock) < Date.parse(target) ? target : demo.clock;
    set({ demo: { ...demo, clock, episodes: demo.episodes.map(e => e.followup === "scheduled" ? { ...e, phase: "next_session", step: "next_morning", revision: e.revision + 1 } : e) }, pendingPath: "/" });
    savePersisted(get());
  },
  openAsk: () => set({ pendingPath: "/ask" }),
  answer: (id) => {
    const s = get();
    if (s.demo.context.actorId !== "may" || s.activeEmergencyEpisodeId || !hasSymptomContext(s.demo, currentEpisode(s.demo))) return;
    const said = (): ChatMessage[] => [...s.messages, { id: chatId(`u-${id}`), role: "user", text: labelOf(id) }];

    if (s.step === "urgent") {
      if (URGENT_IDS.includes(id)) {
        set({
          answers: { ...s.answers, urgent: id as Answers["urgent"] },
          step: "urgent_help",
          phase: "urgent_help",
          messages: said(),
          pendingPath: "/help",
        });
        savePersisted(get());
        return;
      }
      if (id === "unsure") {
        set({
          answers: { ...s.answers, urgent: "unsure" },
          step: "uncertain",
          phase: "uncertain",
          messages: [...said(), { id: chatId("a-unsure"), role: "assistant", text: say("ask.uncertain") }],
        });
        savePersisted(get());
        return;
      }
      if (id !== "none") return;
      set({
        answers: { ...s.answers, urgent: "none" },
        step: "onset",
        phase: "onset",
        messages: [...said(), onsetQuestion()],
      });
      savePersisted(get());
      return;
    }

    if (s.step === "onset") {
      if (!ONSET_IDS.includes(id)) return;
      set({
        answers: { ...s.answers, onset: id as Answers["onset"] },
        step: "change",
        phase: "change",
        messages: [...said(), { id: chatId("a-change"), role: "assistant", text: say("ask.changeQ") }],
      });
      savePersisted(get());
      return;
    }

    if (s.step === "change") {
      if (!CHANGE_IDS.includes(id)) return;
      if (id === "unclear") {
        set({ answers: { ...s.answers, change: "unclear" }, step: "uncertain", phase: "uncertain", messages: [...said(), { id: chatId("a-unclear"), role: "assistant", text: say("ask.uncertain") }] });
        savePersisted(get());
        return;
      }
      if (id === "worse") {
        set({
          answers: { ...s.answers, change: "worse" },
          step: "worsening",
          phase: "worsening",
          messages: [...said(), { id: chatId("a-worse"), role: "assistant", text: say("ask.worseAck") }],
        });
        savePersisted(get());
        return;
      }
      set({
        answers: { ...s.answers, change: id as Answers["change"] },
        step: "med_gap",
        phase: "med_gap",
        messages: [...said(), { id: chatId("a-med"), role: "assistant", text: say("ask.medQ") }],
      });
      savePersisted(get());
      return;
    }

    if ((s.step === "med_gap" || s.step === "worsening") && MED_IDS.includes(id)) {
      const med = id as NonNullable<Answers["medGap"]>;
      set({
        answers: { ...s.answers, medGap: med },
        step: "summary",
        phase: "summary_review",
        messages: said(),
        doses: s.doses.map((d) =>
          d.id === "dose-ator-14"
            ? {
                ...d,
                status: med === "taken-unlogged" ? "user_confirmed_taken" : med === "not-taken" ? "user_reported_not_taken" : "unknown",
                occurrenceAt: null,
                enteredAt: addMinutes(s.clock, 3),
              }
            : d,
        ),
      });
      savePersisted(get());
    }
  },
  editSummary: () => {
    const s = get();
    if (s.demo.context.actorId !== "may" || s.activeEmergencyEpisodeId) return;
    const asked = s.messages.findIndex((m) => m.id.startsWith(ONSET_QUESTION_ID));
    const kept = asked === -1 ? s.messages : s.messages.slice(0, asked);
    set({
      step: "onset",
      phase: "onset",
      answers: { ...s.answers, onset: null, change: null, medGap: null },
      messages: [...kept, { id: chatId("a-correct"), role: "assistant", text: say("ask.correction"), note: true }, onsetQuestion()],
    });
    savePersisted(get());
  },
  saveSummary: () => {
    if (get().demo.context.actorId !== "may" || get().activeEmergencyEpisodeId || ["urgent", "uncertain"].includes(currentEpisode(get().demo)?.disposition ?? "") || get().step !== "summary" && get().step !== "saved") return;
    if (get().episodeSaved) {
      get().showToast(get().locale === "en" ? "Already saved" : "已加入健康紀錄");
      return;
    }
    const clock = get().clock;
    const already = get().records.some((r) => r.id === "ep-dizzy-16");
    const episode = {
      id: "ep-dizzy-16",
      personId: "michelle" as const,
      kind: "symptom" as const,
      occurredAt: "2026-09-16T08:35:00+08:00",
      enteredAt: clock,
      title: { zh: "頭暈整理", en: "Dizziness summary" },
      summary: {
        zh: `${symptomLine(get().answers, "zh-HK")}。今早血壓151/94。`,
        en: `${symptomLine(get().answers, "en")}. Morning BP 151/94.`,
      },
      provenance: { source: "organised" as const, occurredAt: "2026-09-16T08:35:00+08:00", enteredAt: clock },
    };
    set({
      episodeSaved: true,
      step: "saved",
      phase: "summary_saved",
      doses: get().doses.map((d) =>
        d.id === "dose-ator-14" && get().answers.medGap === "taken-unlogged"
          ? { ...d, status: "user_confirmed_taken", occurrenceAt: null, enteredAt: addMinutes(clock, 3) }
          : d,
      ),
      memories: get().memories.map((m) =>
        m.id === "mem-gap" && get().answers.medGap === "taken-unlogged"
          ? {
              ...m,
              pendingConfirm: false,
              value: { zh: "9月14日晚上Atorvastatin：你表示已服藥", en: "Atorvastatin on 14 September evening: you say it was taken" },
              detail: { zh: "由你補記。不會再把這次空缺當作未服藥。", en: "Noted by you. This missing record is not treated as a missed dose." },
            }
          : m,
      ),
      records: already ? get().records : [episode, ...get().records.filter((r) => r.id !== "rec-dizzy")],
      tasks: get().tasks.some((t) => t.id === "task-contact")
        ? get().tasks
        : [
            ...get().tasks,
            { id: "task-contact", personId: "michelle", date: clockParts(clock).dateKey, time: "09:00", title: { zh: "聯絡醫護", en: "Contact a clinician" }, kind: "contact", state: "pending" },
          ],
    });
    get().showToast(get().locale === "en" ? "Saved to your health records" : "已加入健康紀錄");
    savePersisted(get());
  },
  addChat: (role, text) => {
    const id = chatId(role);
    set({ messages: [...get().messages, { id, role, text }] });
    savePersisted(get());
    return id;
  },
  removeMessage: (id) => {
    set({ messages: get().messages.filter((m) => m.id !== id) });
    savePersisted(get());
  },
  setAssistantDraft: text => {
    const demo = ensureAssistantSession(get().demo);
    if (demo.context.actorId !== "may") return;
    const id = currentEpisode(demo)!.id;
    set({ demo: { ...demo, assistantSessions: demo.assistantSessions.map(s => s.episodeId === id ? { ...s, draft: text } : s) } });
    savePersisted(get());
  },
  requestHelp: kind => {
    if (get().demo.context.actorId !== "may") return;
    const demo = interruptForHelp(get().demo, kind);
    set({ demo, activeEmergencyEpisodeId: currentEpisode(demo)!.id, pendingPath: "/help", toast: null });
    savePersisted(get());
  },
  sendFreeText: text => {
    const trimmed = text.trim();
    if (!trimmed || get().demo.context.actorId !== "may") return;
    const demo = ensureAssistantSession(get().demo);
    const episode = currentEpisode(demo)!;
    const reply = getLocalAssistantReply(trimmed, { context: demo.context, clock: demo.clock, locale: get().locale, episode, records: demo.healthRecords, memories: selectActiveMemories(demo), reports: demo.reports, medicationDoses: demo.medicationDoses });
    const withMessages: DemoState = { ...demo, assistantSessions: demo.assistantSessions.map(s => s.episodeId === episode.id ? { ...s, draft: reply.disposition === "urgent" ? trimmed : "", messages: [...s.messages, { id: chatId("u-free"), role: "user", text: { zh: trimmed, en: trimmed } }, { id: chatId("a-free"), role: "assistant", text: reply.text }] } : s) };
    if (reply.disposition === "urgent") {
      set({ demo: interruptForHelp(withMessages, getHelpDisposition(trimmed) ?? episode.helpKind ?? "physical"), activeEmergencyEpisodeId: episode.id, pendingPath: "/help", toast: null });
    } else set({ demo: withMessages, ...(reply.intent === "booking" && reply.nextPath === "/book" ? { pendingPath: reply.nextPath } : {}) });
    savePersisted(get());
  },
  toggleQuestion: (id) => {
    set({
      questions: get().questions.map((q) => (q.id === id ? { ...q, added: !q.added } : q)),
    });
    const added = get().questions.find((q) => q.id === id)?.added;
    if (added) get().showToast(get().locale === "en" ? "Added to consultation questions" : "已加入就診問題");
    savePersisted(get());
  },
  addCustomQuestion: () => {
    const text = get().customQuestion.trim();
    if (!text) return;
    const id = `q-custom-${Date.now()}`;
    set({
      questions: [...get().questions, { id, text: { zh: text, en: text }, added: true }],
      customQuestion: "",
    });
    get().showToast(get().locale === "en" ? "Added to consultation questions" : "已加入就診問題");
    savePersisted(get());
  },
  setContact: (status, note) => {
    get().recordContactOutcome("task-contact", status === "left_message" ? "left-message" : status === "not_contacted" ? "not-contacted" : "contacted", note);
  },
  acceptFollowup: at => get().scheduleFollowup(at),
  declineFollowup: () => {
    const demo = get().demo;
    const next = demo.tasks.some(t => t.id === "task-morning") ? cancelTask(demo, "task-morning") : { ok: true as const, value: demo };
    if (!next.ok) return;
    set({ demo: { ...next.value, episodes: next.value.episodes.map(e => e.id === currentEpisode(demo)?.id ? { ...e, followup: "declined", phase: "followup_declined", revision: e.revision + 1 } : e) } });
    savePersisted(get());
  },
  cancelFollowup: () => { get().cancelCareTask("task-morning"); },
  changeFollowup: at => get().scheduleFollowup(at),
  answerNextMorning: change => {
    const result = get().beginTaskCheckIn("task-morning", change);
    if (result.ok) set({ pendingPath: `/check-in?draft=${encodeURIComponent(result.value)}` });
  },
  // Recording tasks require their specific confirmation action; a generic click is not evidence.
  completeTask: () => {},
  excludeMemory: (id) => {
    const result = get().setMemoryUse(id, false);
    if (!result.ok) return;
    set({ forgetId: null });
    get().showToast(translate(get().persistenceError ? "storage.memoryOnly" : "memory.updated", get().locale));
  },
  confirmMemory: (id) => {
    const item = get().demo.memories.find(m => m.id === id);
    if (item) get().correctMemory(id, item.value);
  },
  stopSharing: () => {
    const grant = get().demo.grants.find(g => g.recipientId === "david");
    if (grant) get().revokeConsent(grant.id);
  },
  prepareMotherBrief: () => { set({ pendingPath: "/brief" }); },
  addAccompany: () => { get().createAccompanyTask("appt-gp"); },
  selectSlot: (selectedSlotId) => set({ selectedSlotId }),
  bookSlot: (id) => {
    return get().setAppointment("appt-gp", id);
  },
  };
});

bindDemoReader(() => useAppStore.getState().demo);

function labelOf(id: string): { zh: string; en: string } {
  const map: Record<string, { zh: string; en: string }> = {
    "chest-breath": { zh: "胸口痛或呼吸困難", en: "Chest pain or difficulty breathing" },
    stroke: { zh: "突然一邊手腳無力、嘴歪或說話不清", en: "Sudden weakness on one side, a drooping face, or unclear speech" },
    collapse: { zh: "昏倒、明顯站不穩，或症狀突然嚴重加劇", en: "Fainting, marked unsteadiness, or a sudden severe worsening" },
    none: { zh: "以上都沒有", en: "None of these" },
    unsure: { zh: "我不太確定", en: "I’m not sure" },
    "after-waking": { zh: "今早起床後", en: "After getting up this morning" },
    "just-now": { zh: "剛剛開始", en: "It just started" },
    yesterday: { zh: "昨天已經有", en: "It started yesterday" },
    other: { zh: "其他時間", en: "Another time" },
    better: { zh: "比剛才減輕", en: "Easier than earlier" },
    same: { zh: "差不多", en: "About the same" },
    worse: { zh: "比剛才嚴重", en: "Worse than earlier" },
    unclear: { zh: "說不清楚", en: "Hard to say" },
    "taken-unlogged": { zh: "有服藥，只是沒有記錄", en: "I took it, but did not record it" },
    "not-taken": { zh: "當晚沒有服藥", en: "I did not take it that evening" },
    forgot: { zh: "我不記得了", en: "I don’t remember" },
  };
  return map[id] ?? { zh: id, en: id };
}

export function visibleMemories(items: MemoryItem[]) {
  return items.filter((m) => !m.excluded);
}
