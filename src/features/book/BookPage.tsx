"use client";

import { useState } from "react";
import Link from "next/link";
import { clinicSlots, michelleMeds } from "@/lib/seed";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime, formatIcsUtc } from "@/lib/clock";
import { selectBpAverage } from "@/lib/demo/selectors";
import { Button } from "@/components/system";
import { BookingReview } from "./BookingReview";

export function BookPage() {
  const { t, locale, L } = useI18n();
  const state = useAppStore(s => s);
  const demo = state.demo;
  const appointment = demo.appointments.find(a => a.patientId === demo.context.patientId && a.id === "appt-gp");
  const slots = clinicSlots.filter(s => Date.parse(s.at) > Date.parse(demo.clock));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<"choose" | "review" | "cancel">("choose");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState(false);
  const selected = stage === "review" ? clinicSlots.find(s => s.id === selectedId) : slots.find(s => s.id === selectedId) ?? slots[0];
  const receipt = appointment?.status === "scheduled" && appointment.bookingStatus !== "none" && !changing;
  const average = selectBpAverage(demo);

  function confirm() {
    if (!appointment || !selected) return;
    const result = state.setAppointment(appointment.id, selected.id);
    setError(!result.ok);
    if (result.ok) { setChanging(false); setStage("choose"); state.showToast(t(useAppStore.getState().persistenceError ? "storage.memoryOnly" : "book.receipt")); }
  }
  function downloadIcs() {
    // Read the committed itinerary at the event boundary, never the selection draft.
    const current = useAppStore.getState().demo.appointments.find(a => a.id === appointment?.id && a.status === "scheduled");
    if (!current || useAppStore.getState().demo.context.actorId !== "may") return;
    const end = new Date(Date.parse(current.scheduledAt) + 30 * 60_000).toISOString();
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CareMate//Local fictional itinerary//EN", "BEGIN:VEVENT", `UID:${current.patientId}-${current.id}@caremate.local`, `DTSTART:${formatIcsUtc(current.scheduledAt)}`, `DTEND:${formatIcsUtc(end)}`, "SUMMARY:Family doctor follow-up", "DESCRIPTION:Fictional local itinerary for May. No clinic notification or clinical confirmation.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "caremate-appointment.ics"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (demo.context.actorId !== "may") return <div className="mx-auto max-w-[720px]" data-testid="book-page"><h1 className="text-[30px]">{t("book.title")}</h1><p className="mt-4">{t("book.caregiverRecovery")}</p><Link href="/family" className="mt-6 inline-flex min-h-11 items-center text-brand">{t("nav.family")}</Link></div>;
  if (demo.episodes.filter(e => e.patientId === demo.context.patientId).at(-1)?.disposition === "urgent") return <div className="mx-auto max-w-[720px]" data-testid="book-page"><h1 className="text-[30px]">{t("book.title")}</h1><Link href="/help" className="mt-6 inline-flex min-h-11 items-center text-brand">{t("book.urgentRecovery")}</Link></div>;
  if (!appointment) return <div className="mx-auto max-w-[720px]" data-testid="book-page"><h1 className="text-[30px]">{t("book.title")}</h1><p className="mt-4">{t("book.missing")}</p><Link href="/care" className="mt-6 inline-flex min-h-11 items-center text-brand">{t("nav.follow")}</Link></div>;
  return <div className="mx-auto max-w-[720px]" data-testid="book-page">
    <p className="text-[14px] text-ink-soft">{t("book.sub")}</p><h1 className="mt-2 text-[30px]">{t("book.title")}</h1><p className="mt-3 text-ink-muted">{t("book.lead")}</p>
    <section className="mt-6" data-testid="book-packet"><h2 className="text-[20px]">{t("book.packet")}</h2><p className="mt-2">{t("book.identity")}</p>
      <p className="mt-2">{t("book.original")}: <time dateTime={appointment.scheduledAt}>{formatDateTime(appointment.scheduledAt, locale)}</time></p>
      {demo.healthRecords.filter(r => r.patientId === "may" && r.category === "body" && !r.supersededByRecordId).map(r => <p className="mt-2" key={r.id}>{L(r.text)}</p>)}
      {average ? <p className="mt-2">{t("ask.f.avg")}: {average.systolic}/{average.diastolic} mmHg</p> : null}
      <p className="mt-2">{michelleMeds.map(m => `${m.name} ${L(m.dose)}`).join(" · ")} · Penicillin · {t("source.user")}</p>
      {demo.reports.filter(r => r.patientId === "may").map(r => <p className="mt-2" key={r.id}>{r.results.map(x => `${L(x.name)} ${x.value} ${x.unit}`).join(" · ")}</p>)}
    </section>
    {error ? <p role="alert" className="mt-6">{t("book.error")}</p> : null}
    {stage === "cancel" ? <section className="mt-6" data-testid="book-cancel-review"><h2 className="text-[24px]">{t("book.cancelReview")}</h2><p className="mt-3">{t("book.receiptBody")}</p><div className="mt-5 flex flex-wrap gap-3"><Button variant="secondary" data-testid="book-cancel-back" onClick={() => setStage("choose")}>{t("book.return")}</Button><Button data-testid="book-cancel-confirm" onClick={() => { const r = state.cancelAppointment(appointment.id); setError(!r.ok); if (r.ok) { setStage("choose"); setChanging(false); } }}>{t("book.cancel")}</Button></div></section>
      : stage === "review" && selected ? <BookingReview appointment={appointment} slot={selected} onBack={() => setStage("choose")} onConfirm={confirm} />
      : <>
        {receipt ? <section className="mt-8" data-testid="book-receipt"><h2 className="text-[24px]">{t(state.persistenceError ? "storage.memoryOnly" : "book.receipt")}</h2><time className="mt-3 block" dateTime={appointment.scheduledAt}>{formatDateTime(appointment.scheduledAt, locale)}</time><p className="mt-3">{t("book.receiptBody")}</p><div className="mt-5 flex flex-wrap gap-3"><Button variant="secondary" data-testid="book-ics" onClick={downloadIcs}>{t("book.ics")}</Button><Button data-testid="book-change" onClick={() => { setChanging(true); setSelectedId(null); }}>{t("book.change")}</Button></div></section> : <section className="mt-8">
          {appointment.status === "cancelled" ? <p data-testid="book-cancelled">{t("book.cancelled")}</p> : null}
          <h2 className="mt-3 text-[20px]">{t("book.slots")}</h2><p className="mt-2 text-ink-muted">{t("book.clinicCal")}</p>
          <div className="mt-3 grid gap-3" data-testid="book-slots">{slots.map(item => <button type="button" key={item.id} data-testid={`slot-${item.id}`} aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)} className={`min-h-11 rounded-[16px] px-4 py-4 text-left ${selected?.id === item.id ? "bg-brand-soft" : "bg-surface-secondary"}`}><span>{formatDateTime(item.at, locale)}</span><span className="mt-1 block text-ink-muted">{L(item.clinic)}</span></button>)}</div>
          {selected ? <Button className="mt-5" data-testid="book-review-open" onClick={() => { setSelectedId(selected.id); setError(false); setStage("review"); }}>{t("book.review")}</Button> : <p className="mt-4" data-testid="book-no-slots">{t("book.noSlots")}</p>}
          {changing ? <Button className="mt-3" variant="secondary" data-testid="book-keep-existing" onClick={() => { setChanging(false); setError(false); }}>{t("book.keep")}</Button> : null}
        </section>}
        {appointment.status === "scheduled" ? <Button className="mt-5" variant="secondary" data-testid="book-cancel" onClick={() => setStage("cancel")}>{t("book.cancel")}</Button> : null}
        <Link href="/care" className="mt-5 flex min-h-11 items-center text-brand">{t("nav.follow")}</Link>
      </>}
    <p className="mt-8 text-[14px] text-ink-soft">{t("book.note")}</p>
  </div>;
}
