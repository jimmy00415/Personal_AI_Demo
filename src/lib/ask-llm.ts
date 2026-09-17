import { translate } from "./i18n";
import type { Answers, Locale } from "./types";

export type FreeTextKind = "empty" | "unclear" | "booking" | "question";

export type ReplyAdjustment = "none" | "record-dump" | "unsafe-claim" | "unknown-dose" | "trimmed" | "empty";

const BOOKING_PATTERN = /預約|改期|覆診|轉時間|appointment|book|reschedul/i;

/** Claims CareMate must never make: reassurance, exclusion, or acting on the user's behalf. */
const UNSAFE_PATTERNS = [
  /(你|妳|您|目前|現在|情況|一切)[^。，,\n]{0,6}安全/,
  /已(經)?排除/,
  /(不用|唔使|無需)擔心/,
  /沒有(危險|問題|大礙)/,
  /已(經)?通知(醫護|醫生|醫院|診所)/,
  /已(經)?安排(救護車|急救|入院)/,
  /you are (safe|fine|okay)/i,
  /(no|nothing) to worry about/i,
  /ruled out/i,
  /ambulance (has been|is being|was) (dispatched|sent|arranged)/i,
  /(have|has) notified (your )?(doctor|clinician|hospital)/i,
];

/** A record gap is not a missed dose; the model must never close that gap for the user. */
const MISSED_DOSE_PATTERNS = [
  /漏(咗|了)?(食|服)?藥/,
  /忘記(咗|了)?(食|服)藥/,
  /沒有(食|服)藥/,
  /未(食|服)藥/,
  /missed (the |a |your )?dose/i,
  /skipped (the |a |your )?dose/i,
  /forgot to take/i,
];

const MAX_SENTENCES = 3;
const MAX_REPLY_CHARS = 400;

const ONSET_FACT: Record<NonNullable<Answers["onset"]>, string> = {
  "after-waking": "started after getting up this morning",
  "just-now": "started just now",
  yesterday: "started yesterday",
  other: "started at another time the user did not pin down",
};

const CHANGE_FACT: Record<NonNullable<Answers["change"]>, string> = {
  better: "now easier than earlier",
  same: "about the same as earlier",
  worse: "worse than earlier",
  unclear: "the user cannot say whether it changed",
};

const MED_GAP_FACT: Record<NonNullable<Answers["medGap"]>, string> = {
  "taken-unlogged": "Atorvastatin on 14 Sep evening: the user says it was taken but not logged; treat it as taken",
  "not-taken": "Atorvastatin on 14 Sep evening: the user says it was not taken that evening",
  forgot:
    "Atorvastatin on 14 Sep evening: the user does not remember, so the status is UNKNOWN — never describe it as missed, skipped, or forgotten",
};

/** The only place the model is told what CareMate knows, in words rather than internal codes. */
export function buildRecordPacket(input: {
  clock: string;
  answers: Pick<Answers, "urgent" | "onset" | "change" | "medGap">;
  bpAverage: { systolic: number; diastolic: number };
  appointmentAt: string;
  questions: string[];
}): string {
  const { answers } = input;
  return [
    "Saved records for Michelle Chan / 陳美玲, 56. These are her own records only.",
    `Current time: ${input.clock}`,
    "Dizziness noted by her at 08:35 today.",
    answers.onset ? `Dizziness ${ONSET_FACT[answers.onset]}.` : "Dizziness start time not recorded.",
    answers.change ? `Dizziness is ${CHANGE_FACT[answers.change]}.` : "Change since earlier not recorded.",
    answers.urgent === "none"
      ? "She did not report chest pain, breathing difficulty, one-sided weakness, unclear speech, fainting, or sudden worsening. This is her answer, not a medical all-clear."
      : "Urgent signs were not answered with a clear no.",
    `Blood pressure 151/94 at 08:30 today; 7-day home average ${input.bpAverage.systolic}/${input.bpAverage.diastolic}.`,
    "Medicines: Amlodipine 5mg at 19:00, Atorvastatin 20mg at 21:00. Allergy: Penicillin (entered by her).",
    answers.medGap ? MED_GAP_FACT[answers.medGap] : "Atorvastatin on 14 Sep evening: no confirmation yet; status UNKNOWN.",
    "Labs imported 13 Sep: HbA1c 6.4%, LDL 2.7 mmol/L, creatinine 71 μmol/L.",
    `Booked family-doctor visit: ${input.appointmentAt}.`,
    input.questions.length ? `Questions she already added: ${input.questions.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function classifyFreeText(text: string, opts: { episodeSaved?: boolean } = {}): FreeTextKind {
  const trimmed = text.trim();
  if (!trimmed) return "empty";
  if (opts.episodeSaved && BOOKING_PATTERN.test(trimmed)) return "booking";

  const cjk = trimmed.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g)?.length ?? 0;
  const latin = trimmed.match(/[A-Za-z]/g)?.length ?? 0;
  if (cjk >= 2 || latin >= 4) return "question";
  return "unclear";
}

export function askSystemPrompt(locale: Locale): string {
  if (locale === "en") {
    return [
      "You are CareMate, a personal-health organiser used in Hong Kong. Reply in English.",
      "Rules:",
      "1. You can see the user's saved records. Quote at most one or two details that answer the question; do not repeat the record list back to them.",
      "2. Reply in at most three sentences, in a plain and calm tone.",
      "3. Do not diagnose, do not prescribe, and do not tell the user to start, stop, or change a medicine.",
      "4. Never say the user is safe, fine, or that anything has been ruled out, and never claim a clinician was notified or an ambulance arranged.",
      "5. If a dose is marked UNKNOWN, do not say it was missed, skipped, or forgotten, and do not suggest catching up on it.",
      "6. If the situation may be urgent, tell the user to use a phone and call 999 themselves.",
      "7. When you are unsure, suggest adding the question to the consultation brief for a clinician to answer.",
    ].join("\n");
  }
  return [
    "你是康伴，香港的個人健康整理助手，只用香港繁體中文回覆。",
    "規則：",
    "1. 你可以看到使用者已儲存的紀錄，可引用其中一兩項作答，但不要逐項複述整份紀錄。",
    "2. 每次回覆最多三句，語氣平實。",
    "3. 不要診斷、不要處方，也不要叫人開始、停止或更改藥物。",
    "4. 不要說對方安全、沒事或已排除任何疾病，也不要聲稱已通知醫護或已安排救護車。",
    "5. 如服藥紀錄標示為未確定（UNKNOWN），不要說對方漏藥、忘記服藥或沒有服藥，也不要叫對方補服。",
    "6. 如情況可能緊急，請對方自行用電話撥打999。",
    "7. 不確定時，建議把問題加入就診摘要，交給醫護判斷。",
  ].join("\n");
}

/** The campus endpoint rejects roughly one call in three, so absorb a single transient failure. */
export async function withRetry<T>(
  run: () => Promise<T>,
  { attempts = 2, delayMs = 400 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function packetFacts(packet: string): string[] {
  return packet
    .split(/[\n；;]/)
    .flatMap((line) => line.split(/[,，]/))
    .map((fact) => fact.trim())
    .filter((fact) => fact.length >= 8);
}

export function looksLikeRecordDump(reply: string, packet: string): boolean {
  const facts = packetFacts(packet);
  if (facts.length < 3) return false;
  const hits = facts.filter((fact) => reply.includes(fact)).length;
  return hits >= 3;
}

export function makesUnsafeClaim(reply: string): boolean {
  return UNSAFE_PATTERNS.some((pattern) => pattern.test(reply));
}

function splitSentences(text: string): string[] {
  return (text.match(/[^。！？.!?\n]+[。！？.!?]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

export function claimsMissedDose(reply: string): boolean {
  return MISSED_DOSE_PATTERNS.some((pattern) => pattern.test(reply));
}

export function sanitiseReply(
  reply: string,
  { packet = "", locale, unknownDose = false }: { packet?: string; locale: Locale; unknownDose?: boolean },
): { text: string; adjusted: ReplyAdjustment } {
  const trimmed = reply.trim();
  if (!trimmed) {
    return { text: translate("ask.llmFail", locale), adjusted: "empty" };
  }
  if (packet && looksLikeRecordDump(trimmed, packet)) {
    return { text: translate("ask.guardDump", locale), adjusted: "record-dump" };
  }
  if (makesUnsafeClaim(trimmed)) {
    return { text: translate("ask.guardUnsafe", locale), adjusted: "unsafe-claim" };
  }
  if (unknownDose && claimsMissedDose(trimmed)) {
    return { text: translate("ask.guardUnknownDose", locale), adjusted: "unknown-dose" };
  }
  const sentences = splitSentences(trimmed);
  if (sentences.length > MAX_SENTENCES || trimmed.length > MAX_REPLY_CHARS) {
    return { text: sentences.slice(0, MAX_SENTENCES).join(""), adjusted: "trimmed" };
  }
  return { text: trimmed, adjusted: "none" };
}
