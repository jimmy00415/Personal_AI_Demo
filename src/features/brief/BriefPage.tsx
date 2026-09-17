"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime, formatShortDate, formatTime } from "@/lib/clock";
import { briefText, contactScript, michelleBp, bpAverage, michelleAppt, symptomLine } from "@/lib/selectors";
import { allergy, michelleMeds, report } from "@/lib/seed";
import { Button, SourceLabel } from "@/components/system";

export function BriefPage() {
  const { t, locale, L } = useI18n();
  const clock = useAppStore((s) => s.clock);
  const answers = useAppStore((s) => s.answers);
  const questions = useAppStore((s) => s.questions);
  const customQuestion = useAppStore((s) => s.customQuestion);
  const setCustomQuestion = useAppStore((s) => s.setCustomQuestion);
  const addCustomQuestion = useAppStore((s) => s.addCustomQuestion);
  const toggleQuestion = useAppStore((s) => s.toggleQuestion);
  const setContact = useAppStore((s) => s.setContact);
  const contactStatus = useAppStore((s) => s.contactStatus);
  const contactNote = useAppStore((s) => s.contactNote);
  const followup = useAppStore((s) => s.followup);
  const acceptFollowup = useAppStore((s) => s.acceptFollowup);
  const declineFollowup = useAppStore((s) => s.declineFollowup);
  const cancelFollowup = useAppStore((s) => s.cancelFollowup);
  const changeFollowup = useAppStore((s) => s.changeFollowup);
  const showToast = useAppStore((s) => s.showToast);
  const episodeSaved = useAppStore((s) => s.episodeSaved);
  const appointments = useAppStore((s) => s.appointments);
  const bookingStatus = useAppStore((s) => s.bookingStatus);
  const [logOpen, setLogOpen] = useState(false);
  const [note, setNote] = useState(contactNote);
  const [pick, setPick] = useState("08:30");
  const avg = bpAverage();
  const appt = michelleAppt(appointments);

  async function copy(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(t("brief.copied"));
        return;
      }
    } catch {
      /* fallback */
    }
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    if (ok) showToast(t("brief.copied"));
  }

  function downloadIcs() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "DTSTART:20260917T003000Z",
      "DTEND:20260917T010000Z",
      "SUMMARY:Record blood pressure and dizziness",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "caremate-followup.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[720px]" data-testid="visit-brief">
      <p className="text-[14px] text-ink-soft">
        {t("ask.person")} · {t("brief.title")} · {formatDateTime(clock, locale)}
      </p>
      <h1 className="mt-2 text-[30px] leading-tight">{t("brief.title")}</h1>

      <section className="mt-8">
        <h2 className="text-[15px] text-ink-soft">{t("brief.s1")}</h2>
        <p className="mt-2 text-[17px]">{t("brief.issue")}</p>
        <div className="mt-1">
          <SourceLabel source="organised" />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-[15px] text-ink-soft">{t("brief.s2")}</h2>
        <p className="mt-2">
          {episodeSaved ? symptomLine(answers, locale) : locale === "en" ? "Morning note: a bit dizzy." : "上午8:35：今朝有少少頭暈。"}
        </p>
        <div className="mt-1">
          <SourceLabel source="user" />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-[15px] text-ink-soft">{t("brief.s3")}</h2>
        <ul className="mt-2 space-y-1 text-[16px]" data-testid="brief-bp">
          {michelleBp().map((r) => (
            <li key={r.id}>
              {formatShortDate(r.occurredAt, locale)} {formatTime(r.occurredAt, locale)} · {r.systolic}/{r.diastolic} mmHg
            </li>
          ))}
          <li>
            {t("ask.f.avg")} · {avg.systolic}/{avg.diastolic} mmHg
          </li>
        </ul>
        <div className="mt-1">
          <SourceLabel source="home-measure" />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-[15px] text-ink-soft">{t("brief.s4")}</h2>
        <ul className="mt-2 space-y-1">
          {michelleMeds.map((m) => (
            <li key={m.id}>
              {m.name} · {L(m.dose)}
            </li>
          ))}
          <li>
            {allergy.name} · {t("source.user")}
          </li>
          {answers.medGap === "taken-unlogged" ? <li data-testid="brief-med-correction">{t("ask.f.medV")}</li> : null}
        </ul>
        <div className="mt-1">
          <SourceLabel source="user" />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-[15px] text-ink-soft">{t("brief.s5")}</h2>
        <ul className="mt-2 space-y-1">
          {report.results.map((r) => (
            <li key={r.id}>
              {L(r.name)} {r.value} {r.unit}
            </li>
          ))}
        </ul>
        <div className="mt-1">
          <SourceLabel source="imported" />
        </div>
        <Link href="/report" className="mt-3 inline-flex min-h-11 items-center text-brand" data-testid="open-report">
          {t("brief.openReport")}
        </Link>
      </section>
      <section className="mt-8">
        <h2 className="text-[15px] text-ink-soft">{t("brief.s6")}</h2>
        <ul className="mt-2 space-y-2" data-testid="brief-questions">
          {questions.filter((q) => q.added).map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-3">
              <span>{L(q.text)}</span>
              <button type="button" className="text-[14px] text-ink-soft" onClick={() => toggleQuestion(q.id)}>
                {t("brief.removeQ")}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1">
          <SourceLabel source="user" />
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder={t("brief.customPh")}
            className="min-h-12 flex-1 rounded-[12px] bg-surface-secondary px-3"
          />
          <Button onClick={addCustomQuestion}>{t("brief.addQ")}</Button>
        </div>
      </section>

      {episodeSaved ? (
        <div className="mt-8">
          <Link
            href="/book"
            data-testid="open-booking"
            className="inline-flex min-h-12 items-center rounded-[10px] bg-brand px-4 text-white"
          >
            {bookingStatus === "booked" ? t("today.viewBook") : t("today.book")}
          </Link>
        </div>
      ) : null}

      <section className="mt-10 rounded-[20px] bg-surface px-5 py-5">
        <h2 className="text-[18px]">{t("brief.script")}</h2>
        <p className="measure mt-3 leading-relaxed">{contactScript(locale, answers)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => copy(contactScript(locale, answers))}>
            {t("brief.copyScript")}
          </Button>
          <Button variant="plain" onClick={() => setLogOpen((v) => !v)}>
            {t("brief.logContact")}
          </Button>
        </div>
        {logOpen ? (
          <div className="mt-4 space-y-2" data-testid="contact-form">
            {(["not_contacted", "left_message", "contacted"] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`block min-h-11 w-full rounded-[12px] px-3 text-left ${contactStatus === st ? "bg-brand-soft" : "bg-surface-secondary"}`}
                onClick={() => setContact(st, note)}
              >
                {st === "not_contacted" ? t("brief.c0") : st === "left_message" ? t("brief.c1") : t("brief.c2")}
              </button>
            ))}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("brief.note")} className="min-h-24 w-full rounded-[12px] bg-surface-secondary p-3" />
            <Button onClick={() => setContact(contactStatus, note)}>{t("common.save")}</Button>
          </div>
        ) : null}
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button data-testid="visit-copy" variant="secondary" onClick={() => copy(briefText(useAppStore.getState(), locale))}>
          {t("brief.copy")}
        </Button>
        <Link href="/print" data-testid="visit-print" className="inline-flex min-h-11 items-center rounded-[10px] bg-surface-secondary px-4">
          {t("brief.print")}
        </Link>
      </div>
      <p className="mt-2 text-[13px] text-ink-soft">{t("brief.printNote")}</p>

      {episodeSaved && followup === "none" ? (
        <section className="mt-10" data-testid="followup-offer">
          <h2 className="text-[20px]">{t("follow.offer")}</h2>
          <p className="mt-2 text-ink-muted">{t("follow.offerBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button data-testid="follow-830" onClick={() => acceptFollowup("2026-09-17T08:30:00+08:00")}>
              {t("follow.830")}
            </Button>
            <div className="flex gap-2">
              <input type="time" value={pick} onChange={(e) => setPick(e.target.value)} className="min-h-11 rounded-[10px] bg-surface-secondary px-3" />
              <Button variant="secondary" data-testid="follow-pick" onClick={() => acceptFollowup(`2026-09-17T${pick}:00+08:00`)}>
                {t("follow.pick")}
              </Button>
            </div>
            <Button variant="plain" data-testid="follow-skip" onClick={declineFollowup}>
              {t("follow.skip")}
            </Button>
          </div>
        </section>
      ) : null}

      {followup === "scheduled" ? (
        <section className="mt-10" data-testid="followup-scheduled">
          <p>{t("follow.added")}</p>
          <p className="mt-1 text-ink-muted">{t("follow.addedDetail")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" data-testid="change-time-follow" onClick={() => changeFollowup("2026-09-17T09:00:00+08:00")}>
              {t("follow.change")}
            </Button>
            <Button variant="plain" onClick={cancelFollowup}>
              {t("follow.cancel")}
            </Button>
            <Button variant="ghost" onClick={downloadIcs}>
              {t("follow.ics")}
            </Button>
          </div>
          <p className="mt-2 text-[13px] text-ink-soft">{t("follow.icsNote")}</p>
        </section>
      ) : null}

      <p className="mt-8 text-[14px] text-ink-soft">
        {L(appt.title)} · {formatDateTime(appt.at, locale)}
      </p>
      <p className="mt-6 text-[13px] text-ink-soft">{t("ask.boundary")}</p>
    </div>
  );
}
