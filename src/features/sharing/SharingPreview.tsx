"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime } from "@/lib/clock";
import { selectSharingProjection, sharedExportText, sharingRows } from "@/lib/demo/sharing";
import type { RecipientId, SharingProjection } from "@/lib/demo/types";
import { EventDetail } from "@/features/notifications/EventDetail";

export function SharingPreview({ projection, interactive = false, eventId }: { projection: SharingProjection; interactive?: boolean; eventId?: string | null }) {
  const { t, L, locale } = useI18n();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [receiptRevision, setReceiptRevision] = useState(projection.grantRevision);
  const rows = sharingRows(projection, locale);
  const selected = rows.find(r => r.id === selectedId);
  const currentExport = sharedExportText(useAppStore.getState().demo, projection.patientId, projection.recipientId, locale);
  const mayAccompany = useAppStore(s => s.demo.context.actorId === "david") && projection.recipientId === "david";
  const active = projection.status === "active";
  const detail = active && projection.level !== "alerts-only";
  const copy = async () => {
    useAppStore.getState().syncFromStorage();
    const state = useAppStore.getState().demo;
    const latest = sharedExportText(state, projection.patientId, projection.recipientId, locale);
    if (!latest.ok) { setExportOpen(false); setReceipt(t("sharing.unavailable")); return; }
    const revision = selectSharingProjection(state, projection.patientId, projection.recipientId).grantRevision;
    setReceiptRevision(revision);
    try { await navigator.clipboard.writeText(latest.value); setReceipt(t("sharing.copied")); }
    catch { setReceipt(t("sharing.exportFailed")); setExportOpen(true); }
  };
  if (interactive && mayAccompany && eventId) return <EventDetail key={`${eventId}-${projection.grantRevision}`} eventId={eventId} onBack={() => router.push("/notifications")} />;
  return <section data-testid="sharing-preview" className="space-y-6">
    <p>{t("sharing.identity")}</p>
    {!active ? <p data-testid="shared-empty">{t("sharing.empty")}</p> : <>
      <p>{t(`sharing.${projection.level!}`)}</p>
      {projection.summary.map((s, i) => <p key={i}>{L(s)}</p>)}
      {projection.level === "alerts-only" && !projection.events.length ? <p>{interactive ? t("sharing.noAlerts") : `${t("sharing.alertExample")}: ${t("sharing.neutral")}`}</p> : null}
      {projection.events.map(e => <article key={e.id} data-testid={`shared-event-${e.id}`} className="space-y-3 rounded-xl border border-line p-4"><p>{L(e.text)}</p><time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt, locale)}</time><p>{t(`events.${e.status}`)}</p>{interactive && mayAccompany ? <Button data-testid={`event-open-${e.id}`} onClick={() => { useAppStore.getState().syncFromStorage(); router.push(`/notifications?event=${encodeURIComponent(e.id)}`); }}>{t("events.open")}</Button> : null}</article>)}
      {detail ? <>
        <p>{t("sharing.tasks")}: <span data-testid="shared-task-count">{projection.tasks.length}</span></p>
        {projection.tasks.map(task => <article key={task.id} data-testid={`shared-task-${task.id}`} className="space-y-3 rounded-xl border border-line p-4"><p>{L(task.title)}</p><p>{t(`care.${task.status}`)}</p><p>{t(task.ownerId === "david" ? "events.ownerDavid" : "events.ownerMay")}</p><p>{task.scheduledAt ? formatDateTime(task.scheduledAt, locale) : ""}</p>{interactive && mayAccompany && task.kind === "accompany" && task.ownerId === "david" && !["completed", "cancelled"].includes(task.status) ? <Button data-testid={`accompany-complete-${task.id}`} onClick={() => { const result = useAppStore.getState().completePersonalTask(task.id); setReceiptRevision(projection.grantRevision); setReceipt(t(result.ok ? "events.saved" : "events.unavailable")); }}>{t("events.completeTask")}</Button> : null}</article>)}
        {projection.appointments.map(a => <article key={a.id} data-testid={`shared-appointment-${a.id}`} className="space-y-2 rounded-xl border border-line p-4"><h2>{L(a.title)}</h2><time dateTime={a.scheduledAt}>{formatDateTime(a.scheduledAt, locale)}</time><p>{L(a.location)}</p>{interactive && mayAccompany && a.status === "scheduled" ? <Button data-testid="shared-accompany" onClick={() => { const result = useAppStore.getState().createAccompanyTask(a.id); setReceiptRevision(projection.grantRevision); setReceipt(t(result.ok ? "sharing.accompanySaved" : "sharing.unavailable")); }}>{t("sharing.accompany")}</Button> : null}</article>)}
        {rows.map(r => <article key={r.id} className="space-y-2 rounded-xl border border-line p-4"><h2>{r.title}</h2><p className="whitespace-pre-wrap">{r.text}</p><p className="text-sm">{t("sharing.recordTime")} · {formatDateTime(r.occurredAt, locale)} / {r.enteredAt ? formatDateTime(r.enteredAt, locale) : "—"} / {r.source}</p>{interactive ? <Button variant="secondary" data-testid={`shared-record-${r.id}`} onClick={() => setSelectedId(r.id)}>{t("sharing.detail")}</Button> : null}</article>)}
      </> : null}
    </>}
    {interactive && selected && detail ? <section aria-label={t("sharing.detail")} data-testid="shared-detail" className="border border-brand p-4"><h2>{selected.title}</h2><p>{selected.text}</p><Button variant="secondary" onClick={() => setSelectedId(null)}>{t("sharing.cancel")}</Button></section> : null}
    {interactive && detail ? <div className="flex flex-wrap gap-3"><Button data-testid="shared-copy" onClick={() => void copy()}>{t("sharing.export")}</Button><Button variant="secondary" data-testid="shared-export-open" onClick={() => { useAppStore.getState().syncFromStorage(); setExportOpen(true); }}>{t("sharing.exportOpen")}</Button></div> : null}
    {interactive && exportOpen && detail && currentExport.ok ? <div data-testid="shared-export"><p>{t("sharing.exportNote")}</p><textarea className="min-h-64 w-full border p-3" aria-label={t("sharing.exportTitle")} readOnly value={currentExport.value} /><Button variant="secondary" onClick={() => setExportOpen(false)}>{t("sharing.cancel")}</Button></div> : null}
    {receipt && active && receiptRevision === projection.grantRevision ? <p role="status">{receipt}</p> : null}
  </section>;
}

/** Every caregiver clinical URL renders this boundary instead of patient-only legacy pages. */
export function SharedView({ recipientId = "david" }: { recipientId?: RecipientId }) {
  return <Suspense fallback={null}><CurrentSharedView recipientId={recipientId} /></Suspense>;
}
function CurrentSharedView({ recipientId }: { recipientId: RecipientId }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const eventId = useSearchParams().get("event");
  const demo = useAppStore(s => s.demo);
  const projection = selectSharingProjection(demo, demo.context.patientId, recipientId);
  return <div data-testid="shared-view" className="mx-auto max-w-3xl space-y-6"><h1 className="text-3xl">{t("sharing.shared")}</h1><p>{t("sharing.readonly")}</p><SharingPreview key={`${pathname}-${recipientId}`} projection={projection} eventId={eventId} interactive /><p className="text-sm">{t("sharing.local")}</p></div>;
}
