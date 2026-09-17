"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clinicSlots, michelleMeds, report } from "@/lib/seed";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime, formatIcsUtc, formatShortDate, formatTime } from "@/lib/clock";
import { bpAverage, contactScript, michelleAppt, michelleBp } from "@/lib/selectors";
import { Button, SourceLabel } from "@/components/system";

export function BookPage() {
  const { t, locale, L } = useI18n();
  const viewing = useAppStore((s) => s.viewingPersonId);
  const episodeSaved = useAppStore((s) => s.episodeSaved);
  const appointments = useAppStore((s) => s.appointments);
  const questions = useAppStore((s) => s.questions);
  const answers = useAppStore((s) => s.answers);
  const bookingStatus = useAppStore((s) => s.bookingStatus);
  const selectedSlotId = useAppStore((s) => s.selectedSlotId);
  const selectSlot = useAppStore((s) => s.selectSlot);
  const bookSlot = useAppStore((s) => s.bookSlot);
  const clock = useAppStore((s) => s.clock);
  const [phase, setPhase] = useState<"check" | "search" | "ready">(bookingStatus === "none" ? "check" : "ready");
  const avg = bpAverage();
  const appt = michelleAppt(appointments);
  const slot = clinicSlots.find((s) => s.id === selectedSlotId) ?? clinicSlots[0];
  const booked = bookingStatus === "booked" || bookingStatus === "kept";

  useEffect(() => {
    if (booked) {
      setPhase("ready");
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("ready");
      return;
    }
    const a = window.setTimeout(() => setPhase("search"), 280);
    const b = window.setTimeout(() => setPhase("ready"), 720);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [booked]);

  if (viewing === "lai-wah") {
    return (
      <div className="mx-auto max-w-[720px]" data-testid="book-page">
        <h1 className="text-[30px] leading-tight">{t("book.title")}</h1>
        <p className="measure mt-4 text-[17px]">{t("book.mother")}</p>
        <Link href="/family" className="mt-6 inline-flex min-h-12 items-center text-brand">
          {t("family.switch")}
        </Link>
      </div>
    );
  }

  if (!episodeSaved) {
    return (
      <div className="mx-auto max-w-[720px]" data-testid="book-page">
        <h1 className="text-[30px] leading-tight">{t("book.title")}</h1>
        <p className="measure mt-4 text-[17px]">{t("book.needSummary")}</p>
        <Link href="/ask" className="mt-6 inline-flex min-h-12 items-center text-brand">
          {t("today.understand")}
        </Link>
      </div>
    );
  }

  function downloadIcs() {
    const end = new Date(new Date(slot.at).getTime() + 30 * 60_000).toISOString();
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `DTSTART:${formatIcsUtc(slot.at)}`,
      `DTEND:${formatIcsUtc(end)}`,
      "SUMMARY:Family doctor follow-up",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "caremate-appointment.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[720px]" data-testid="book-page">
      <p className="text-[14px] text-ink-soft">{t("book.sub")}</p>
      <h1 className="mt-2 text-[30px] leading-tight">{t("book.title")}</h1>
      <p className="measure mt-3 text-[17px] leading-relaxed text-ink-muted">{t("book.lead")}</p>

      <ol className="mt-6 flex flex-wrap gap-2 text-[13px]">
        {[t("book.step1"), t("book.step2"), t("book.step3")].map((label, i) => {
          const active = phase === "check" ? i === 0 : phase === "search" ? i <= 1 : true;
          return (
            <li key={label} className={`rounded-full px-3 py-1.5 ${active ? "bg-brand-soft text-brand-deep" : "bg-surface-secondary text-ink-soft"}`}>
              {i + 1}. {label}
            </li>
          );
        })}
      </ol>

      <section className="mt-8" data-testid="book-packet">
        <h2 className="text-[15px] text-ink-soft">{t("book.packet")}</h2>
        <p className="mt-2 text-[18px]">{t("book.identity")}</p>
        <dl className="mt-4 space-y-3 text-[15px]">
          <Row k={t("ask.f.dizzy")} v={answers.onset ? t("ask.f.dizzyV") : locale === "en" ? "Morning note: a bit dizzy." : "今朝有少少頭暈。"} />
          <Row k={t("ask.f.bp")} v={`151/94 mmHg · ${formatTime(michelleBp().at(-1)!.occurredAt, locale)}`} />
          <Row k={t("ask.f.avg")} v={`${avg.systolic}/${avg.diastolic} mmHg`} />
          <Row
            k={t("brief.s4")}
            v={`${michelleMeds.map((m) => `${m.name} ${L(m.dose)}`).join(" · ")} · Penicillin · ${t("source.user")}`}
          />
          <Row k={t("brief.s5")} v={report.results.map((r) => `${L(r.name)} ${r.value} ${r.unit}`).join(" · ")} />
          <Row k={t("today.nextAppt")} v={formatDateTime(appt.at, locale)} />
          {questions.some((q) => q.added) ? (
            <Row k={t("brief.s6")} v={questions.filter((q) => q.added).map((q) => L(q.text)).join(" · ")} />
          ) : null}
        </dl>
        <div className="mt-2">
          <SourceLabel source="organised" />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[15px] text-ink-soft">{t("book.slots")}</h2>
        <p className="mt-1 text-[13px] text-ink-soft">
          {t("book.clinicCal")} · {formatShortDate(clock, locale)} {formatTime(clock, locale)}
        </p>
        <div className="mt-3 grid gap-2" data-testid="book-slots">
          {clinicSlots.map((item) => {
            const selected = item.id === selectedSlotId;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`slot-${item.id}`}
                disabled={booked}
                onClick={() => selectSlot(item.id)}
                className={`rounded-[16px] px-4 py-3.5 text-left ${selected ? "bg-brand-soft" : "bg-surface-secondary"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px]">{formatDateTime(item.at, locale)}</span>
                  {item.recommended ? <span className="text-[12px] text-brand">{t("book.recommended")}</span> : null}
                  {item.current ? <span className="text-[12px] text-ink-soft">{t("book.current")}</span> : null}
                </div>
                <p className="mt-1 text-[14px] text-ink-muted">{L(item.clinic)} · {L(item.reason)}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-[20px] bg-surface px-5 py-5">
        <h2 className="text-[18px]">{t("book.reason")}</h2>
        <p className="measure mt-3 leading-relaxed">{contactScript(locale)}</p>
      </section>

      {booked ? (
        <section className="mt-8" data-testid="book-receipt">
          <h2 className="text-[20px]">{t("book.receipt")}</h2>
          <p className="mt-2 text-[17px]">{formatDateTime(appt.at, locale)}</p>
          <p className="measure mt-2 text-ink-muted">{t("book.receiptBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadIcs}>
              {t("book.ics")}
            </Button>
            <Link href="/brief" className="inline-flex min-h-11 items-center text-brand">
              {t("book.back")}
            </Link>
          </div>
        </section>
      ) : phase === "ready" ? (
        <div className="mt-8 flex flex-wrap gap-2">
          <Button data-testid="book-confirm" onClick={() => bookSlot(slot.id)}>
            {slot.current ? t("book.keep") : t("book.confirm")}
          </Button>
        </div>
      ) : (
        <p className="mt-8 text-[15px] text-ink-muted">{phase === "search" ? t("book.step2") : t("book.step1")}</p>
      )}

      <p className="mt-8 text-[13px] text-ink-soft">{t("book.note")}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-ink-soft">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  );
}
