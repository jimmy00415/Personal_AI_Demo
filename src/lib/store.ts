"use client";

import { create } from "zustand";
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
import { classifyFreeText } from "./ask-llm";
import { symptomLine } from "./selectors";
import { NEXT_CLOCK, OPENING_CLOCK } from "./types";
import type { ActorId, DemoState, ScenarioId } from "./demo/types";
import { createScenario } from "./demo/scenarios";
import { loadDemo, saveDemo, loadPreferences, savePreferences, getEmergencySession, setEmergencySession } from "./demo/persistence";
import { selectContext } from "./demo/selectors";
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
  setPerspective: (actorId: ActorId) => void;
  applyScenario: (id: ScenarioId) => void;
  setScenarioClock: (at: string) => void;
  resetDemo: () => void;
  hydrate: () => void;
  persistNow: () => void;
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
  addChat: (role: ChatMessage["role"], text: ChatMessage["text"]) => string;
  removeMessage: (id: string) => void;
  toggleQuestion: (id: string) => void;
  addCustomQuestion: () => void;
  setContact: (status: ContactStatus, note: string) => void;
  acceptFollowup: (at: string) => void;
  declineFollowup: () => void;
  cancelFollowup: () => void;
  changeFollowup: (at: string) => void;
  answerNextMorning: (id: NextId) => void;
  completeTask: (id: string) => void;
  excludeMemory: (id: string) => void;
  confirmMemory: (id: string) => void;
  stopSharing: () => void;
  prepareMotherBrief: () => void;
  addAccompany: () => void;
  selectSlot: (id: string) => void;
  bookSlot: (id: string) => void;
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
  const time = clockParts(slot.at);
  const hhmm = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  return {
    appointments: appointments.map((a) => (a.id === "appt-gp" ? { ...a, at: slot.at } : a)),
    tasks: [
      ...tasks.filter((t) => t.id !== "task-contact"),
      {
        id: "task-contact",
        personId: "michelle" as const,
        date: time.dateKey,
        time: hhmm,
        title: slot.current
          ? { zh: "原定覆診", en: "Booked follow-up" }
          : { zh: "較早覆診", en: "Earlier follow-up" },
        kind: "contact" as const,
        state: "scheduled" as const,
      },
    ],
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

let toastTimer: number | undefined;

export const useAppStore = create<AppState & Actions>((rawSet, get) => {
  // Existing routes submit legacy-shaped patches; translate first, publish one atomic snapshot.
  // Compatibility fields are recalculated, never persisted or independently authoritative.
  const set = (patch: Partial<AppState>) => {
    const current = get();
    const demo = patch.demo ?? applyLegacyPatch(current.demo, patch);
    let activeEmergencyEpisodeId = patch.activeEmergencyEpisodeId === undefined ? current.activeEmergencyEpisodeId : patch.activeEmergencyEpisodeId;
    if (patch.phase === "urgent_help" && demo.context.actorId === "may") activeEmergencyEpisodeId = currentEpisode(demo)?.id ?? null;
    rawSet({ ...patch, demo, activeEmergencyEpisodeId, ...projectLegacy(demo, activeEmergencyEpisodeId) });
  };
  const savePersisted = (state: AppState) => {
    if (typeof window === "undefined") return;
    try {
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
  return {
  ...world(),
  setPerspective: (actorId) => {
    set({ demo: { ...get().demo, context: selectContext(get().demo, actorId) }, viewingPersonId: "michelle" });
    savePersisted(get());
  },
  applyScenario: (id) => {
    const demo = createScenario(id);
    const activeEmergencyEpisodeId = id === "urgent-help" ? demo.episodes.find(e => e.disposition === "urgent")?.id ?? null : null;
    set({ ...world(), demo, locale: get().locale, liteMode: get().liteMode, introComplete: get().introComplete, activeEmergencyEpisodeId, hydrated: true });
    savePersisted(get());
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
      const prefs = loadPreferences(window.localStorage);
      if (prefs.ok) preferences = prefs.value ?? preferences;
      else persistenceError = prefs.code;
      const session = getEmergencySession(window.sessionStorage);
      if (session.ok) activeEmergencyEpisodeId = demo.episodes.some(e => e.id === session.value && e.disposition === "urgent") ? session.value : null;
      else persistenceError = session.code;
      const episode = currentEpisode(demo);
      if (!activeEmergencyEpisodeId && episode?.disposition === "urgent") {
        const id = `episode-recheck-${demo.episodes.length + 1}`;
        demo = { ...demo, episodes: [...demo.episodes, { ...episode, id, answers: { ...emptyAnswers }, disposition: "open", step: "urgent", phase: "concern_open", saved: false, followup: "none", revision: 1 }], assistantSessions: [...demo.assistantSessions, { id: `session-${id}`, patientId: "may", episodeId: id, messages: world().messages, status: "active", draft: "" }] };
      }
    } catch (error) { persistenceError = error instanceof Error ? error.name : "StorageUnavailable"; }
    set({ demo, ...preferences, activeEmergencyEpisodeId, persistenceError, toast: null, pendingPath: null, hydrated: true });
    setDocumentPreferences();
    // Do not overwrite a corrupt or unreadable snapshot with a misleading successful save.
    if (!persistenceError) savePersisted(get());
  },
  persistNow: () => savePersisted(get()),
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
    savePersisted(get());
  },
  advanceClock: () => {
    const s = get();
    const tasks = [...s.tasks];
    if (s.followup === "scheduled" && !tasks.some((t) => t.id === "task-morning")) {
      tasks.push({
        id: "task-morning",
        personId: "michelle",
        date: "2026-09-17",
        time: clockParts(s.followupAt ?? NEXT_CLOCK).hour
          ? `${String(clockParts(s.followupAt ?? NEXT_CLOCK).hour).padStart(2, "0")}:${String(clockParts(s.followupAt ?? NEXT_CLOCK).minute).padStart(2, "0")}`
          : "08:30",
        title: { zh: "記錄血壓和頭暈情況", en: "Record blood pressure and dizziness" },
        kind: "followup",
        state: "scheduled",
      });
    }
    set({
      clock: NEXT_CLOCK,
      phase: "next_session",
      step: "next_morning",
      tasks,
      pendingPath: "/",
    });
    savePersisted(get());
  },
  openAsk: () => set({ pendingPath: "/ask" }),
  answer: (id) => {
    const s = get();
    const said = (): ChatMessage[] => [...s.messages, { id: chatId(`u-${id}`), role: "user", text: labelOf(id) }];

    if (s.step === "urgent") {
      if (URGENT_IDS.includes(id)) {
        set({
          answers: { ...s.answers, urgent: id as Answers["urgent"] },
          step: "urgent_help",
          phase: "urgent_help",
          messages: said(),
          pendingPath: "/ask",
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
  sendFreeText: (text) => {
    const trimmed = text.trim();
    const kind = classifyFreeText(trimmed, { episodeSaved: get().episodeSaved });
    if (kind === "empty") return;
    const reply: Localized =
      kind === "booking"
        ? say("ask.freeBooking")
        : kind === "unclear"
          ? say("ask.unclear")
          : say("ask.freeNoAnswer");
    set({
      messages: [
        ...get().messages,
        { id: chatId("u-free"), role: "user", text: { zh: trimmed, en: trimmed } },
        { id: chatId("a-free"), role: "assistant", text: reply },
      ],
    });
    if (kind === "booking") set({ pendingPath: "/book" });
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
  setContact: (contactStatus, contactNote) => {
    set({
      contactStatus,
      contactNote,
      tasks: get().tasks.map((t) =>
        t.id === "task-contact" ? { ...t, state: contactStatus === "not_contacted" ? "pending" : "completed" } : t,
      ),
    });
    get().showToast(get().locale === "en" ? "Saved" : "已儲存");
    savePersisted(get());
  },
  acceptFollowup: (at) => {
    const time = clockParts(at);
    const hhmm = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
    const tasks = get().tasks.filter((t) => t.id !== "task-morning");
    tasks.push({
      id: "task-morning",
      personId: "michelle",
      date: "2026-09-17",
      time: hhmm,
      title: { zh: "記錄血壓和頭暈情況", en: "Record blood pressure and dizziness" },
      kind: "followup",
      state: "scheduled",
    });
    set({ followup: "scheduled", followupAt: at, phase: "followup_scheduled", tasks });
    get().showToast(get().locale === "en" ? "Added to tomorrow morning" : "已加入明早的待辦事項");
    savePersisted(get());
  },
  declineFollowup: () => {
    set({
      followup: "declined",
      followupAt: null,
      phase: "followup_declined",
      tasks: get().tasks.filter((t) => t.id !== "task-morning"),
    });
    savePersisted(get());
  },
  cancelFollowup: () => {
    set({
      followup: "cancelled",
      followupAt: null,
      tasks: get().tasks.map((t) => (t.id === "task-morning" ? { ...t, state: "cancelled" } : t)),
    });
    get().showToast(get().locale === "en" ? "Your schedule was updated" : "已更新你的行程");
    savePersisted(get());
  },
  changeFollowup: (at) => get().acceptFollowup(at),
  answerNextMorning: (id) => {
    set({
      answers: { ...get().answers, nextMorning: id },
      phase: "next_logged",
      tasks: get().tasks.map((t) => (t.id === "task-morning" ? { ...t, state: "completed" } : t)),
    });
    savePersisted(get());
  },
  completeTask: (id) => {
    set({
      tasks: get().tasks.map((t) => (t.id === id && t.state !== "not_due" ? { ...t, state: "completed" } : t)),
    });
    savePersisted(get());
  },
  excludeMemory: (id) => {
    set({
      memories: get().memories.map((m) => (m.id === id ? { ...m, excluded: true } : m)),
      forgetId: null,
    });
    get().showToast(get().locale === "en" ? "Your records were updated" : "已更新你的紀錄");
    savePersisted(get());
  },
  confirmMemory: (id) => {
    set({
      memories: get().memories.map((m) => (m.id === id ? { ...m, pendingConfirm: false } : m)),
    });
    get().showToast(get().locale === "en" ? "Your records were updated" : "已更新你的紀錄");
    savePersisted(get());
  },
  stopSharing: () => {
    set({ sharingStopped: true, consent: { canViewAppointments: false, canViewBp: false, canViewMedication: false } });
    get().showToast(get().locale === "en" ? "Saved" : "已儲存");
    savePersisted(get());
  },
  prepareMotherBrief: () => {
    set({ motherBriefReady: true });
    get().showToast(get().locale === "en" ? "Brief is ready" : "摘要已準備好");
    savePersisted(get());
  },
  addAccompany: () => {
    if (get().accompanyAdded) return;
    set({
      accompanyAdded: true,
      tasks: [
        ...get().tasks,
        {
          id: "task-accompany",
          personId: "michelle",
          relatedPersonId: "lai-wah",
          date: "2026-09-23",
          time: "10:00",
          title: { zh: "陪媽媽覆診", en: "Accompany Mum to her appointment" },
          kind: "accompany",
          state: "scheduled",
        },
      ],
    });
    get().showToast(get().locale === "en" ? "Added to your list" : "已加入你的待辦事項");
    savePersisted(get());
  },
  selectSlot: (selectedSlotId) => set({ selectedSlotId }),
  bookSlot: (id) => {
    const s = get();
    const next = applySlot(s.appointments, s.tasks, id);
    set(next);
    get().showToast(get().locale === "en" ? "Your schedule was updated" : "已更新你的行程");
    savePersisted(get());
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
