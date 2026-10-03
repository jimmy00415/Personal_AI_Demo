"use client";

import { useState } from "react";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime } from "@/lib/clock";
import { selectSharingProjection } from "@/lib/demo/sharing";
import { selectPatientEvents } from "@/lib/demo/selectors";

/** Select again on every render. Never retrieve a raw source through a projected ID. */
export function EventDetail({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const state = useAppStore(s => s);
  const { t, L, locale } = useI18n();
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState(false);
  const [error, setError] = useState(false);
  const demo = state.demo;
  const patientEvent = selectPatientEvents(demo).find(e => e.id === eventId);
  const projection = selectSharingProjection(demo, demo.context.patientId, "david");
  const sharedEvent = demo.context.actorId === "david" ? projection.events.find(e => e.id === eventId) : undefined;
  const event = patientEvent ?? sharedEvent;
  const patientTask = patientEvent && demo.tasks.find(t => t.id === patientEvent.taskId);
  const sharedTask = sharedEvent && projection.tasks.find(t => t.id === sharedEvent.taskId);
  const task = patientTask || sharedTask;
  const feedback = (ok: boolean) => { setReceipt(ok); setError(!ok); if (ok) setNote(""); };
  if (!event) return <section className="space-y-4" data-testid="event-unavailable"><p role="alert">{t("events.unavailable")}</p><Button variant="secondary" onClick={onBack}>{t("care.back")}</Button></section>;
  return <section className="space-y-4 rounded-xl border border-line p-4" data-testid="event-detail">
    <Button variant="plain" onClick={onBack}>{t("care.back")}</Button>
    <h2 className="text-2xl">{t("events.title")}</h2>
    <p>{sharedEvent ? L(sharedEvent.text) : t("sharing.neutral")}</p>
    {task ? <p className="break-words">{L(task.title)}</p> : null}
    <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt, locale)}</time>
    <p data-testid="event-status">{t(`events.${event.status}`)}</p>
    <p data-testid="event-owner">{t((patientTask?.ownerId ?? sharedEvent?.ownerId) === "david" ? "events.ownerDavid" : "events.ownerMay")}</p>
    {event.status === "resolved" && (patientTask?.status ?? sharedEvent?.taskStatus) !== "completed" ? <p>{t("events.assistanceOnly")}</p> : null}
    {patientEvent?.response ? <p className="whitespace-pre-wrap break-words">{patientEvent.response}</p> : null}
    {task ? <p>{t(`care.${task.status}`)}{task.scheduledAt ? ` · ${formatDateTime(task.scheduledAt, locale)}` : ""}</p> : null}
    <p>{t("events.separate")}</p>
    {sharedEvent?.canRespond ? <><label htmlFor="event-note" className="block">{t("events.note")}</label><textarea id="event-note" data-testid="event-note" className="min-h-24 w-full rounded-xl border p-3" maxLength={500} value={note} onChange={e => setNote(e.target.value)} /><div className="flex flex-wrap gap-3">{(["accept", "decline"] as const).map(decision => <Button key={decision} variant={decision === "accept" ? "primary" : "secondary"} data-testid={`event-${decision}`} onClick={() => feedback(state.respondToEvent(eventId, { actorId: "david", decision, note }).ok)}>{t(`events.${decision}`)}</Button>)}</div></> : null}
    {sharedEvent?.canResolve ? <Button data-testid="event-resolve" onClick={() => feedback(state.resolveEvent(eventId, "david").ok)}>{t("events.resolve")}</Button> : null}
    {receipt ? <p role="status">{t(state.persistenceError ? "storage.memoryOnly" : "events.saved")}</p> : null}
    {error ? <p role="alert">{t("events.unavailable")}</p> : null}
    <p className="text-sm">{t("events.local")}</p>
  </section>;
}
