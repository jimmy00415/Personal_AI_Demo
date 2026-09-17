"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDate, formatTime } from "@/lib/clock";
import { addMinutes } from "@/lib/clock";
import { bpAverage, michelleAppt, symptomLine } from "@/lib/selectors";
import { Button } from "@/components/system";
import { buildRecordPacket, classifyFreeText, sanitiseReply } from "@/lib/ask-llm";
import { EmergencyHelp } from "./EmergencyHelp";

function canUseLocalLlm() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

const urgentOpts = [
  { id: "chest-breath", key: "ask.u1" as const, urgent: true },
  { id: "stroke", key: "ask.u2" as const, urgent: true },
  { id: "collapse", key: "ask.u3" as const, urgent: true },
  { id: "none", key: "ask.u4" as const, exclusive: true },
  { id: "unsure", key: "ask.u5" as const },
];
const onsetOpts = [
  { id: "after-waking", key: "ask.o1" as const },
  { id: "just-now", key: "ask.o2" as const },
  { id: "yesterday", key: "ask.o3" as const },
  { id: "other", key: "ask.o4" as const },
];
const changeOpts = [
  { id: "better", key: "ask.c1" as const },
  { id: "same", key: "ask.c2" as const },
  { id: "worse", key: "ask.c3" as const },
  { id: "unclear", key: "ask.c4" as const },
];
const medOpts = [
  { id: "taken-unlogged", key: "ask.m1" as const },
  { id: "not-taken", key: "ask.m2" as const },
  { id: "forgot", key: "ask.m3" as const },
];

export function AskPage() {
  const { t, locale } = useI18n();
  const step = useAppStore((s) => s.step);
  const messages = useAppStore((s) => s.messages);
  const answers = useAppStore((s) => s.answers);
  const clock = useAppStore((s) => s.clock);
  const answer = useAppStore((s) => s.answer);
  const saveSummary = useAppStore((s) => s.saveSummary);
  const editSummary = useAppStore((s) => s.editSummary);
  const sendFreeText = useAppStore((s) => s.sendFreeText);
  const addChat = useAppStore((s) => s.addChat);
  const episodeSaved = useAppStore((s) => s.episodeSaved);
  const questions = useAppStore((s) => s.questions);
  const appointments = useAppStore((s) => s.appointments);
  const removeMessage = useAppStore((s) => s.removeMessage);
  const [draft, setDraft] = useState("");
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState<"unknown" | "on" | "off">(() => (canUseLocalLlm() ? "unknown" : "off"));
  const [failed, setFailed] = useState<{ text: string; messageId: string } | null>(null);
  const avg = bpAverage();

  useEffect(() => {
    if (!canUseLocalLlm()) return;
    let cancelled = false;
    fetch("/api/ask")
      .then((r) => r.json())
      .then((data: { ok?: boolean }) => {
        if (!cancelled) setLlm(data.ok ? "on" : "off");
      })
      .catch(() => {
        if (!cancelled) setLlm("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unknownDose = answers.medGap === "forgot" || answers.medGap === null;

  function recordPacket() {
    return buildRecordPacket({
      clock,
      answers,
      bpAverage: avg,
      appointmentAt: michelleAppt(appointments).at,
      questions: questions.filter((q) => q.added).map((q) => q.text.zh),
    });
  }

  /** Sends an already-visible question to the local model. Never adds the user's message itself. */
  async function askModel(text: string) {
    setBusy(true);
    const packet = recordPacket();
    try {
      const history = messages.slice(-8).map((m) => ({
        role: m.role,
        content: locale === "en" ? m.text.en : m.text.zh,
      }));
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, locale, history, packet, unknownDose }),
      });
      if (!res.ok) throw new Error("upstream");
      const data = (await res.json()) as { text?: string };
      const clean = sanitiseReply(data.text ?? "", { packet, locale, unknownDose });
      const messageId = addChat("assistant", { zh: clean.text, en: clean.text });
      setFailed(clean.adjusted === "empty" ? { text, messageId } : null);
    } catch {
      const messageId = addChat("assistant", { zh: t("ask.llmFail"), en: t("ask.llmFail") });
      setFailed({ text, messageId });
    } finally {
      setBusy(false);
    }
  }

  async function handleFreeText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const kind = classifyFreeText(trimmed, { episodeSaved });
    if (kind !== "question" || !canUseLocalLlm() || llm !== "on") {
      sendFreeText(trimmed);
      return;
    }
    setFailed(null);
    addChat("user", { zh: trimmed, en: trimmed });
    await askModel(trimmed);
  }

  async function retryFreeText() {
    if (!failed || busy) return;
    const { text, messageId } = failed;
    removeMessage(messageId);
    setFailed(null);
    await askModel(text);
  }

  if (step === "urgent_help") {
    return <EmergencyHelp />;
  }

  const options =
    step === "urgent" ? urgentOpts : step === "onset" ? onsetOpts : step === "change" ? changeOpts : step === "med_gap" ? medOpts : [];

  return (
    <div data-testid="chat-page" className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-[28px] leading-tight">{t("ask.title")}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{t("ask.person")}</p>
        <p className="mt-2 text-[14px] text-ink-soft">{t("ask.context")}</p>
      </header>

      <div className="space-y-5">
        <div className="space-y-5" data-testid="chat-log">
          {messages.map((msg) => (
            <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : ""}>
              <p
                data-testid={msg.note ? "chat-correction" : undefined}
                className={
                  msg.role === "user"
                    ? "max-w-[84%] rounded-[18px] bg-brand px-4 py-3 text-white"
                    : msg.note
                      ? "measure text-[14px] text-ink-soft"
                      : "measure leading-relaxed"
                }
              >
                {locale === "en" ? msg.text.en : msg.text.zh}
              </p>
            </div>
          ))}
        </div>

        {step === "urgent" ? (
          <div>
            <p className="text-[17px]">{t("ask.urgentQ")}</p>
            <button type="button" className="mt-2 text-[13px] text-ink-soft" onClick={() => setWhy((v) => !v)}>
              {t("ask.whyAsk")}
            </button>
            {why ? <p className="mt-1 text-[14px] text-ink-muted">{t("ask.whyUrgent")}</p> : null}
          </div>
        ) : null}

        {step === "uncertain" ? (
          <div className="space-y-3" data-testid="uncertain-branch">
            <p className="measure">{t("ask.uncertain")}</p>
            <p className="measure text-ink-muted">{t("ask.uncertainHelp")}</p>
            <Link href="/brief" className="inline-flex min-h-12 items-center text-brand">
              {t("ask.contactNow")}
            </Link>
          </div>
        ) : null}

        {step === "worsening" ? (
          <div className="space-y-3" data-testid="worsening-branch">
            <p className="measure">{t("ask.worseAdvice")}</p>
            <p className="text-[14px] text-ink-muted">{t("ask.medQ")}</p>
            <div className="grid gap-2">
              {medOpts.map((opt) => (
                <button key={opt.id} type="button" data-testid={`quick-reply-${opt.id}`} onClick={() => answer(opt.id)} className="min-h-12 rounded-[12px] bg-surface-secondary px-3 text-left">
                  {t(opt.key)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {options.length > 0 && step !== "worsening" ? (
          <div className="grid gap-2">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`quick-reply-${opt.id}`}
                onClick={() => answer(opt.id)}
                className="min-h-12 rounded-[12px] bg-surface-secondary px-3 text-left text-[16px] hover:bg-line"
              >
                {t(opt.key)}
              </button>
            ))}
          </div>
        ) : null}

        {step === "summary" || step === "saved" ? (
          <section data-testid="structured-summary" className="rounded-[20px] bg-surface px-5 py-5">
            {answers.medGap === "taken-unlogged" ? (
              <div className="mb-5 rounded-[14px] bg-surface-secondary px-4 py-3" data-testid="med-receipt">
                <div>{t("ask.receiptMed")}</div>
                <div className="mt-1 text-[13px] text-ink-soft">
                  {t("ask.receiptBy")} · {formatDate(addMinutes(clock, 3), locale)} {formatTime(addMinutes(clock, 3), locale)}
                </div>
              </div>
            ) : null}
            {answers.medGap === "taken-unlogged" ? <p className="mb-4">{t("ask.medAck")}</p> : null}
            {answers.medGap === "not-taken" ? <p className="mb-4">{t("ask.medNot")}</p> : null}
            {answers.medGap === "forgot" ? <p className="mb-4">{t("ask.medForgot")}</p> : null}
            <p>{answers.change === "worse" ? t("ask.worseLead") : t("ask.summaryLead")}</p>
            <p className="mt-3">{answers.change === "worse" ? t("ask.worseAdvice") : t("ask.summaryAdvice")}</p>
            <h2 className="mt-6 text-[18px]">{t("ask.summaryTitle")}</h2>
            <dl className="mt-3 space-y-3 text-[15px]">
              <Row k={t("ask.f.dizzy")} v={symptomLine(answers, locale)} />
              <Row k={t("ask.f.bp")} v="151/94 mmHg · 08:30" />
              <Row k={t("ask.f.avg")} v={`${avg.systolic}/${avg.diastolic} mmHg`} />
              <Row k={t("ask.f.urgent")} v={t("ask.f.urgentV")} />
              <Row k={t("ask.f.med")} v={answers.medGap === "taken-unlogged" ? t("ask.f.medV") : answers.medGap === "not-taken" ? t("ask.medNot") : t("ask.medForgot")} />
              <Row k={t("ask.f.next")} v={t("ask.f.nextV")} />
            </dl>
            <p className="mt-3 text-[13px] text-ink-soft">{t("ask.notClearance")}</p>
            {!episodeSaved ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button data-testid="add-to-journey" onClick={saveSummary}>
                  {t("ask.confirm")}
                </Button>
                <Button variant="secondary" data-testid="edit-summary" onClick={editSummary}>
                  {t("ask.edit")}
                </Button>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/brief" data-testid="prep-visit" className="inline-flex min-h-12 items-center rounded-[10px] bg-brand px-4 text-white">
                  {t("ask.prep")}
                </Link>
                <Link href="/book" data-testid="ask-book" className="inline-flex min-h-12 items-center text-brand">
                  {t("today.book")}
                </Link>
              </div>
            )}
          </section>
        ) : null}
      </div>

      <form
        className="mt-8 flex gap-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft;
          setDraft("");
          void handleFreeText(text);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={busy ? t("ask.thinking") : t("ask.placeholder")}
          disabled={busy}
          data-testid="ask-input"
          className="min-h-12 flex-1 rounded-[12px] bg-surface-secondary px-3 outline-none"
        />
        <Button type="submit" data-testid="ask-send" disabled={busy}>
          {t("ask.send")}
        </Button>
      </form>
      {failed ? (
        <Button variant="secondary" data-testid="ask-retry" className="mt-3" onClick={() => void retryFreeText()}>
          {t("ask.retry")}
        </Button>
      ) : null}
      <p className="mt-3 text-[13px] text-ink-soft" data-testid="ask-llm-status">
        {llm === "on" ? t("ask.llmOn") : canUseLocalLlm() && llm === "off" ? t("ask.llmOff") : t("ask.boundary")}
      </p>
      {llm === "on" ? <p className="mt-1 text-[13px] text-ink-soft">{t("ask.boundary")}</p> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-ink-soft">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
