"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { briefToText, buildBrief, prepareBriefExport } from "@/lib/demo/brief";
import { copyText } from "@/lib/demo/exports";
import { recipients } from "@/lib/demo/sharing";
import { formatDateTime } from "@/lib/clock";
import type { BriefPacket, RecipientId } from "@/lib/demo/types";

export function BriefReview({ recipientId }: { recipientId?: RecipientId }) {
  return <Suspense fallback={null}><CurrentBriefReview recipientId={recipientId} /></Suspense>;
}
function CurrentBriefReview({ recipientId }: { recipientId?: RecipientId }) {
  const { t } = useI18n();
  const router = useRouter();
  const query = useSearchParams().get("recipient");
  const recipient = recipientId ?? (recipients.includes(query as RecipientId) ? query as RecipientId : undefined);
  const demo = useAppStore(s => s.demo);
  const hydrated = useAppStore(s => s.hydrated);
  const appointment = demo.appointments.find(a => a.patientId === demo.context.patientId && a.status === "scheduled");
  const appointmentId = appointment?.id;
  useEffect(() => {
    if (hydrated && appointmentId) useAppStore.getState().openBriefDraft(appointmentId, recipient);
  }, [hydrated, appointmentId, recipient]);
  const prior = demo.briefs.filter(b => b.appointmentId === appointmentId && b.recipientId === (recipient ?? "may")).at(-1);
  const result = appointmentId ? buildBrief(demo, demo.context.patientId, { appointmentId, recipientId: recipient, includeMood: prior?.includeMood ?? true }) : null;
  return <section className="mt-6 space-y-5">
    {!recipientId ? <label className="block">{t("packet.recipient")}<select data-testid="brief-recipient" className="mt-2 block min-h-11 w-full rounded-xl border border-line bg-surface p-3" value={recipient ?? "may"} onChange={event => router.replace(event.target.value === "may" ? "/brief" : `/brief?recipient=${event.target.value}`)}><option value="may">{t("packet.personal")}</option>{recipients.map(id => <option key={id} value={id}>{t(`sharing.${id}`)}</option>)}</select></label> : null}
    {!appointment ? <p data-testid="brief-appointment-unavailable">{t("book.noScheduled")} <Link className="inline-flex min-h-11 items-center text-brand" href="/book">{t("book.title")}</Link></p> : result?.ok && prior ? <PacketReview key={`${result.value.id}`} packet={result.value} /> : <p data-testid="brief-unavailable">{t("packet.unavailable")}</p>}
  </section>;
}
function PacketReview({ packet }: { packet: BriefPacket }) {
  const { t, L, locale } = useI18n();
  const router = useRouter();
  const demo = useAppStore(s => s.demo);
  const [supplement, setSupplement] = useState(L(packet.sectionEdits?.review ?? { zh: "", en: "" }));
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [fallback, setFallback] = useState(false);
  const [receipt, setReceipt] = useState<{ fingerprint: string; kind: "copied" | "failed" | "review" } | null>(null);
  const manual = useRef<HTMLTextAreaElement>(null);
  const personal = packet.recipientId === "may";
  const dirty = supplement !== L(packet.sectionEdits?.review ?? { zh: "", en: "" });
  const currentExport = prepareBriefExport(demo, packet.id);
  const patch = (includeMood = packet.includeMood) => useAppStore.getState().updateBriefDraft(packet.id, { sectionEdits: { ...packet.sectionEdits, review: { zh: supplement, en: supplement } }, questionIds: demo.questions.filter(q => q.patientId === packet.patientId && q.selected).map(q => q.id), includeMood });
  async function copy() {
    const result = useAppStore.getState().prepareBriefExport(packet.id);
    if (!result.ok) { setReceipt({ fingerprint: packet.contentFingerprint!, kind: "review" }); return; }
    const copied = await copyText(briefToText(result.value, locale));
    // A permission change during the clipboard promise also invalidates the visible receipt/fallback.
    const latest = useAppStore.getState().prepareBriefExport(packet.id);
    if (!latest.ok || latest.value.contentFingerprint !== result.value.contentFingerprint) { setFallback(false); setReceipt(null); return; }
    setReceipt({ fingerprint: result.value.contentFingerprint!, kind: copied.ok ? "copied" : "failed" });
    setFallback(!copied.ok);
    if (copied.ok) useAppStore.getState().showToast(t("brief.copied"));
  }
  function print() {
    const result = useAppStore.getState().prepareBriefExport(packet.id);
    if (!result.ok) { setReceipt({ fingerprint: packet.contentFingerprint!, kind: "review" }); return; }
    router.push(`/print?brief=${encodeURIComponent(result.value.id)}`);
  }
  return <>
    <div className="rounded-xl border border-line bg-surface p-4">
      <p data-testid="brief-status" role="status">{t(packet.status === "confirmed" ? "packet.confirmed" : "packet.draft")}</p>
      <p>{t("packet.revision")} {packet.revision} · {t("packet.updated")} {formatDateTime(packet.generatedAt, locale)}</p>
      {packet.supplementsNeedReview ? <p data-testid="brief-stale">{t("packet.stale")}</p> : null}
      {packet.status === "draft" ? <p>{t("packet.reviewRequired")}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3"><Button data-testid="brief-confirm" disabled={dirty} onClick={() => { const result = useAppStore.getState().confirmBrief(packet.id, packet.contentFingerprint!); if (!result.ok) setReceipt({ fingerprint: packet.contentFingerprint!, kind: "review" }); }}>{t("packet.confirm")}</Button><Button data-testid="visit-copy" variant="secondary" disabled={packet.status !== "confirmed" || dirty} onClick={() => void copy()}>{t("brief.copy")}</Button><Button data-testid="visit-print" variant="secondary" disabled={packet.status !== "confirmed" || dirty} onClick={print}>{t("packet.preview")}</Button></div>
    </div>
    <article data-testid="brief-packet" className="space-y-6">
      <h2 className="text-2xl">{t("packet.title")}</h2>
      {packet.sections.map(section => section.id === "readings" ? <details key={section.id}><summary data-testid="brief-readings" className="min-h-11 cursor-pointer py-3">{L(section.title)}</summary><p className="whitespace-pre-wrap">{L(section.text)}</p></details> : <section key={section.id} data-testid={section.id === "average" ? "brief-bp" : section.id === "medication" ? "brief-med-correction" : `brief-section-${section.id}`}><h3 className="font-medium">{L(section.title)}</h3><p className="mt-2 whitespace-pre-wrap">{L(section.text)}</p></section>)}
      <section data-testid="brief-questions"><h3>{t("brief.s6")}</h3><ul>{packet.questions.map(q => <li className="flex items-center justify-between gap-3" key={q.id}><span>{L(q.text)}</span>{personal ? <span className="flex flex-wrap"><Button variant="plain" data-testid={`question-edit-${q.id}`} onClick={() => { setEditingQuestion(q.id); setQuestionText(L(q.text)); }}>{t("packet.editQuestion")}</Button><Button variant="plain" onClick={() => useAppStore.getState().toggleQuestion(q.id)}>{t("brief.removeQ")}</Button></span> : null}</li>)}</ul></section>
    </article>
    {personal ? <>
      <Link href="/check-in" className="inline-flex min-h-11 items-center text-brand">{t("checkin.title")}</Link>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" data-testid="brief-include-mood" checked={packet.includeMood} onChange={event => patch(event.target.checked)} />{t("packet.includeMood")}</label><p className="text-sm text-ink-muted">{t("packet.moodPolicy")}</p>
      <label className="block">{t("packet.supplement")}<textarea data-testid="brief-supplement" className="mt-2 min-h-24 w-full rounded-xl border border-line p-3" value={supplement} onChange={event => setSupplement(event.target.value)} /></label><Button data-testid="brief-save-edit" variant="secondary" onClick={() => patch()}>{t("packet.saveEdit")}</Button>
      {editingQuestion ? <div className="space-y-3"><label className="block">{t("packet.editQuestion")}<input data-testid="question-text" className="block min-h-11 w-full border border-line p-3" value={questionText} onChange={event => setQuestionText(event.target.value)} /></label><Button data-testid="question-save" onClick={() => { const result = useAppStore.getState().editConsultationQuestion(editingQuestion, questionText); if (result.ok) setEditingQuestion(null); }}>{t("common.save")}</Button><Button variant="plain" onClick={() => setEditingQuestion(null)}>{t("sharing.cancel")}</Button></div> : null}
      <QuestionInput /><Link href="/report" data-testid="open-report" className="inline-flex min-h-11 items-center text-brand">{t("brief.openReport")}</Link>
    </> : null}
    {receipt && receipt.fingerprint === packet.contentFingerprint ? <p role="status" data-testid="brief-copy-result">{t(receipt.kind === "copied" ? "brief.copied" : receipt.kind === "failed" ? "packet.copyFailed" : "packet.reviewRequired")}</p> : null}
    {fallback && currentExport.ok ? <div><textarea ref={manual} readOnly aria-label={t("brief.copy")} data-testid="brief-copy-fallback" value={briefToText(currentExport.value, locale)} className="min-h-64 w-full border border-line p-3" /><Button variant="secondary" onClick={() => { manual.current?.focus(); manual.current?.select(); }}>{t("packet.selectText")}</Button></div> : null}
    <p className="text-sm text-ink-muted">{t("packet.local")}</p>
  </>;
}
function QuestionInput() {
  const { t } = useI18n();
  const text = useAppStore(s => s.customQuestion);
  return <div className="flex flex-wrap gap-2"><input aria-label={t("brief.customPh")} placeholder={t("brief.customPh")} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line p-3" value={text} onChange={event => useAppStore.getState().setCustomQuestion(event.target.value)} /><Button onClick={() => useAppStore.getState().addCustomQuestion()}>{t("brief.addQ")}</Button></div>;
}
