import { messages } from "../i18n";
import { helpInputs, emptyAnswers } from "./fixtures";
import type { DemoState, HealthEpisode, LocalAssistantContext, LocalAssistantReply } from "./types";

const normalise = (text: string) => text.trim().toLowerCase().replace(/[。.!！?？]+$/, "").replace(/\s+/g, " ");
export function getHelpDisposition(input: string): "physical" | "emotional" | null {
  const text = normalise(input);
  for (const kind of ["emotional", "physical"] as const) if (helpInputs[kind].some(example => normalise(example) === text)) return kind;
  return null;
}
/** Rechecking help is not itself evidence of a physical symptom. Use retained patient sources. */
export function hasSymptomContext(state: DemoState, episode: HealthEpisode | null | undefined): boolean {
  return !!episode && episode.sourceRecordIds.some(id => state.healthRecords.some(record => record.id === id && record.patientId === episode.patientId && record.category === "body" && record.kind === "symptom" && !record.supersededByRecordId));
}
export function getLocalAssistantReply(input: string, context: LocalAssistantContext): LocalAssistantReply {
  const reply = (intent: LocalAssistantReply["intent"], text: LocalAssistantReply["text"], nextAction: LocalAssistantReply["nextAction"], disposition: LocalAssistantReply["disposition"] = "continue", nextPath: string | null = null): LocalAssistantReply => ({ intent, text, nextAction, disposition, nextPath, question: null });
  if (context.context.actorId !== "may" || context.context.perspective !== "patient") return reply("unsupported", messages["demo.sharedPending"], null, "unsupported");
  const help = getHelpDisposition(input);
  if (help || context.episode?.disposition === "urgent") return reply("urgent", messages[help === "emotional" || context.episode?.helpKind === "emotional" ? "local.emotionalBody" : "em.body"], "help", "urgent", "/help");
  const disposition = context.episode?.disposition;
  if (disposition === "uncertain" || disposition === "worsening") return reply("symptom", messages[disposition === "uncertain" ? "ask.uncertainHelp" : "ask.worseAdvice"], "brief", disposition, "/brief");
  const text = input.trim();
  if (/低落|壓力|難過|feeling low|stressed|sad/i.test(text)) return reply("mood", messages["local.mood"], "check-in", "continue", "/check-in");
  if (/服藥|食藥|medicine|medication|dose/i.test(text)) {
    const dose = (context.episode?.answers.medGap || /14/.test(text) ? context.medicationDoses?.find(d => d.patientId === context.context.patientId && d.id === "dose-ator-14") : undefined) ?? context.medicationDoses?.filter(d => d.patientId === context.context.patientId && Date.parse(d.scheduledAt) <= Date.parse(context.clock)).at(-1);
    return reply("question", messages[!dose ? "local.noRecord" : dose.status === "unknown" ? "local.medUnknown" : dose.status === "user_reported_not_taken" ? "local.medNotTaken" : "local.medTaken"], "question", "continue", "/care");
  }
  if (/報告|report|HbA1c|化驗/i.test(text)) {
    const report = context.reports.filter(r => r.patientId === context.context.patientId).at(-1);
    const result = report?.results[0];
    return reply("report", result ? { zh: `${result.name.zh}：${result.value} ${result.unit}。${messages["local.report"].zh}`, en: `${result.name.en}: ${result.value} ${result.unit}. ${messages["local.report"].en}` } : messages["local.noRecord"], "brief", "continue", report ? "/report" : "/brief");
  }
  if (/預約|改期|覆診|appointment|book|reschedul/i.test(text)) return reply("booking", messages["ask.freeBooking"], "brief", "continue", context.episode?.saved ? "/book" : "/brief");
  if (/無事|安全|safe|all.clear|fine\?/i.test(text)) return reply("question", messages["ask.guardUnsafe"], "question", "continue", "/brief");
  if (/頭暈|症狀|dizz|symptom/i.test(text)) return reply("symptom", messages["local.symptom"], "check-in", "continue", "/check-in");
  if (/醫生|醫護|摘要|問題|doctor|clinician|brief|question/i.test(text)) return reply("question", messages["ask.guardDump"], "question", "continue", "/brief");
  return reply("unsupported", text.length < 4 && !/[\u3400-\u9fff]{2}/.test(text) ? messages["ask.unclear"] : messages["local.unsupported"], "question", "unsupported", "/brief");
}

/** Create a patient-bound conversational container without inventing symptoms or measurements. */
export function ensureAssistantSession(state: DemoState): DemoState {
  if (state.context.actorId !== "may") return state;
  let episode = state.episodes.at(-1);
  if (episode && state.assistantSessions.some(s => s.episodeId === episode!.id)) return state;
  if (!episode) episode = { id: `episode-${state.episodes.length + 1}`, patientId: state.context.patientId, answers: { ...emptyAnswers }, step: "urgent", phase: "concern_open", disposition: "open", sourceRecordIds: [], revision: 1, saved: false, followup: "none" } satisfies HealthEpisode;
  return { ...state, episodes: state.episodes.some(e => e.id === episode!.id) ? state.episodes : [...state.episodes, episode], assistantSessions: [...state.assistantSessions, { id: `session-${episode.id}`, patientId: state.context.patientId, episodeId: episode.id, messages: [], status: "active", draft: "" }] };
}
export function interruptForHelp(state: DemoState, kind: "physical" | "emotional"): DemoState {
  const demo = ensureAssistantSession(state);
  if (demo.context.actorId !== "may") return demo;
  const id = demo.episodes.at(-1)!.id;
  return { ...demo, episodes: demo.episodes.map(e => e.id === id ? { ...e, helpKind: kind, disposition: "urgent", step: "urgent_help", phase: "urgent_help", revision: e.revision + 1 } : e) };
}
