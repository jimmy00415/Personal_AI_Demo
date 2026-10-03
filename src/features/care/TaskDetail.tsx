"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, SourceLabel } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime } from "@/lib/clock";
import { isTaskOverdue } from "@/lib/demo/selectors";
import type { CareTask } from "@/lib/demo/types";
import { downloadTaskIcs } from "@/lib/demo/exports";
import { ReminderTimePicker } from "./ReminderTimePicker";

export function TaskDetail({ task, onBack }: { task: CareTask; onBack: () => void }) {
  const { t, L, locale } = useI18n();
  const router = useRouter();
  const state = useAppStore(s => s);
  const [mode, setMode] = useState<"change" | "snooze" | "cancel" | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [error, setError] = useState(false);
  const [eventError, setEventError] = useState(false);
  const [note, setNote] = useState(task.contactNote);
  const dose = state.demo.medicationDoses.find(d => task.sourceRecordIds.includes(d.id));
  const record = state.demo.healthRecords.find(r => task.sourceRecordIds.includes(r.id));
  const event = state.demo.context.actorId === "may" ? state.demo.events.find(e => e.taskId === task.id && e.recipientId === "david") : undefined;
  const active = task.status !== "completed" && task.status !== "cancelled" && !task.supersededByCheckInRevision;
  function feedback(ok: boolean, eventAction = false) { setError(!ok); setEventError(eventAction); setReceipt(ok); if (ok) setMode(null); }
  return <section className="space-y-6" data-testid="task-detail">
    <Button variant="plain" onClick={onBack}>{t("care.back")}</Button>
    <h1 className="break-words text-[30px] leading-tight">{L(task.title)}</h1>
    <p data-testid="task-status">{t(isTaskOverdue(state.demo, task) ? "care.overdue" : `care.${task.status}`)}</p>
    {task.scheduledAt ? <time dateTime={task.scheduledAt} data-testid="task-time">{formatDateTime(task.scheduledAt, locale)}</time> : null}
    <p data-testid="task-owner">{t(task.ownerId === "david" ? "events.ownerDavid" : "events.ownerMay")}</p>
    {task.supersededByCheckInRevision ? <p role="status" data-testid="task-superseded">{t("care.superseded")}</p> : null}
    {task.proposedOwnerId === "david" ? <p>{t("care.proposed")}</p> : null}
    {event ? <div className="space-y-3" data-testid="task-response"><p>{t(`events.${event.status}`)}</p>{event.status === "resolved" && task.status !== "completed" ? <p>{t("events.assistanceOnly")}</p> : null}{event.response ? <p className="break-words">{event.response}</p> : null}<Button variant="secondary" onClick={() => router.push(`/notifications?event=${encodeURIComponent(event.id)}`)}>{t("events.open")}</Button></div> : null}
    {active && record && (task.proposedOwnerId === "david" || event && event.status !== "revoked") && (task.kind === "after-visit" || task.id === "task-fixture-attention") ? <Button data-testid="event-request" onClick={() => feedback(state.createAttentionEvent({ patientId: task.patientId, sourceRecordId: record.id, taskId: task.id, scenario: task.kind === "after-visit" ? "after-visit-task" : "fixture-attention" }).ok, true)}>{t("events.request")}</Button> : null}
    {active && task.kind === "after-visit" ? <Button data-testid="aftervisit-complete" onClick={() => feedback(state.completePersonalTask(task.id).ok)}>{t("events.completeTask")}</Button> : null}
    {record ? <div className="rounded-[12px] bg-surface-secondary p-4" data-testid="task-source"><SourceLabel source={record.source} /><p className="mt-2 break-words">{L(record.text)}</p><p className="mt-2">{t(`care.${record.category}`)}</p></div> : null}
    {task.kind === "medication" && dose ? <section className="space-y-3" data-testid="dose-detail">
      <h2 className="text-[24px]">{dose.name} · {L(dose.dose)}</h2>
      <p data-testid="dose-status">{t(dose.status === "unknown" ? "care.unknown" : dose.status === "user_reported_not_taken" ? "care.notTaken" : dose.status === "recorded_taken" ? "care.recordedTaken" : "care.taken")}</p>
      <p className="text-ink-muted">{t("care.doseBoundary")}</p>
      <div className="grid gap-3">{(["user_confirmed_taken", "user_reported_not_taken", "unknown"] as const).map(status => <Button key={status} variant="secondary" data-testid={`dose-${status}`} onClick={() => feedback(state.setDoseStatus(dose.id, status).ok)}>{t(status === "unknown" ? "care.unknown" : status === "user_confirmed_taken" ? "care.taken" : "care.notTaken")}</Button>)}</div>
    </section> : null}
    {task.kind === "check-in" && active ? <div className="space-y-3"><p>{t("care.measurementRequired")}</p><Button data-testid="task-checkin" disabled={!!task.scheduledAt && Date.parse(task.scheduledAt) > Date.parse(state.demo.clock)} onClick={() => { const result = state.beginTaskCheckIn(task.id); if (result.ok) router.push(`/check-in?draft=${encodeURIComponent(result.value)}`); else feedback(false); }}>{t("care.startCheckIn")}</Button></div> : null}
    {task.kind === "contact" && task.status !== "cancelled" ? <section className="space-y-4"><p data-testid="contact-outcome">{t(task.contactOutcome === "left_message" ? "care.leftMessage" : task.contactOutcome === "contacted" ? "care.contacted" : "care.notContacted")}</p><p>{t("care.contactBoundary")}</p><label className="block" htmlFor="contact-task-note">{t("care.contactNote")}</label><textarea id="contact-task-note" className="min-h-24 w-full rounded-[10px] border border-line bg-surface-secondary p-3" value={note} readOnly={!!task.supersededByCheckInRevision} onChange={e => setNote(e.target.value)} /><div className="grid gap-3">{!task.supersededByCheckInRevision && (["not-contacted", "left-message", "contacted"] as const).map(outcome => <Button variant="secondary" key={outcome} data-testid={`contact-${outcome}`} aria-pressed={task.contactOutcome === outcome.replace("-", "_")} onClick={() => feedback(state.recordContactOutcome(task.id, outcome, note).ok)}>{t(outcome === "not-contacted" ? "care.notContacted" : outcome === "left-message" ? "care.leftMessage" : "care.contacted")}</Button>)}</div></section> : null}
    {active && !mode ? <div className="flex flex-wrap gap-3"><Button variant="secondary" data-testid="task-change" onClick={() => setMode("change")}>{t("care.change")}</Button><Button variant="secondary" data-testid="task-snooze" onClick={() => setMode("snooze")}>{t("care.snooze")}</Button><Button variant="plain" data-testid="task-cancel" onClick={() => setMode("cancel")}>{t("care.cancel")}</Button></div> : null}
    {mode === "change" || mode === "snooze" ? <ReminderTimePicker key={mode} at={task.scheduledAt ?? state.demo.clock} onCancel={() => setMode(null)} onSave={at => { const result = mode === "change" && task.id === "task-morning" ? state.scheduleFollowup(at) : mode === "change" ? state.rescheduleTask(task.id, at) : state.snoozeTask(task.id, at); feedback(result.ok); return result; }} /> : null}
    {mode === "cancel" ? <div className="space-y-3"><p>{t("care.cancelConfirm")}</p><Button data-testid="task-cancel-confirm" onClick={() => feedback(state.cancelCareTask(task.id).ok)}>{t("care.cancel")}</Button><Button variant="secondary" onClick={() => setMode(null)}>{t("common.cancel")}</Button></div> : null}
    {task.scheduledAt ? <Button variant="ghost" data-testid="task-ics" onClick={() => feedback(downloadTaskIcs(task))}>{t("follow.ics")}</Button> : null}
    {receipt ? <p role="status" data-testid="task-receipt">{t(state.persistenceError ? "storage.memoryOnly" : "care.saved")}{task.scheduledAt ? ` · ${formatDateTime(task.scheduledAt, locale)}` : ""}</p> : null}
    {error ? <p role="alert">{t(eventError ? "events.unavailable" : "care.error")}</p> : null}
  </section>;
}
