"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDate, formatTime } from "@/lib/clock";
import { addMinutes } from "@/lib/clock";
import { bpAverage } from "@/lib/selectors";
import { Button } from "@/components/system";

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
  const episodeSaved = useAppStore((s) => s.episodeSaved);
  const [draft, setDraft] = useState("");
  const [why, setWhy] = useState(false);
  const [how, setHow] = useState(false);
  const avg = bpAverage();

  if (step === "urgent_help") {
    return (
      <div className="mx-auto max-w-xl py-6" data-testid="chat-page">
        <section data-testid="emergency-state" className="min-h-[70vh]">
          <h1 className="text-[32px] leading-tight text-critical">{t("em.title")}</h1>
          <p className="measure mt-6 text-[20px] leading-relaxed">{t("em.body")}</p>
          <p className="mt-8 text-[48px] font-medium tracking-tight text-critical" data-testid="call-999">
            {t("em.call")}
          </p>
          <p className="mt-2 text-[15px] text-ink-muted">{t("em.noCall")}</p>
          <button type="button" className="mt-8 text-[15px] text-brand" onClick={() => setHow((v) => !v)}>
            {t("em.how")}
          </button>
          {how ? <p className="measure mt-3 text-ink-muted">{t("em.howBody")}</p> : null}
        </section>
      </div>
    );
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
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : ""}>
            <p className={msg.role === "user" ? "max-w-[84%] rounded-[18px] bg-brand px-4 py-3 text-white" : "measure leading-relaxed"}>
              {locale === "en" ? msg.text.en : msg.text.zh}
            </p>
          </div>
        ))}

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
            <p className="measure">{t("ask.worseLead")}</p>
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
              <Row k={t("ask.f.dizzy")} v={t("ask.f.dizzyV")} />
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
                <Button variant="secondary" onClick={editSummary}>
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
          sendFreeText(draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("ask.placeholder")}
          className="min-h-12 flex-1 rounded-[12px] bg-surface-secondary px-3 outline-none"
        />
        <Button type="submit">{t("ask.send")}</Button>
      </form>
      <p className="mt-3 text-[13px] text-ink-soft">{t("ask.boundary")}</p>
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
