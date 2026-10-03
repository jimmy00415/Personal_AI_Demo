"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime } from "@/lib/clock";
import { Button, GroupedList, ListRow } from "@/components/system";
import { isTaskOverdue } from "@/lib/demo/selectors";
import type { ActorId, ShareCategory } from "@/lib/demo/types";
import { TaskDetail } from "./TaskDetail";
import { hongKongInput } from "./ReminderTimePicker";

export function CarePage() {
  const router = useRouter();
  const selectedId = useSearchParams().get("task");
  const { t, locale, L } = useI18n();
  const state = useAppStore(s => s);
  const demo = state.demo;
  const [text, setText] = useState("");
  const [time, setTime] = useState(hongKongInput(new Date(Date.parse(demo.clock) + 86400000).toISOString()));
  const [preview, setPreview] = useState(false);
  const [category, setCategory] = useState<ShareCategory | "private">("private");
  const [owner, setOwner] = useState<ActorId>("may");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tasks = demo.context.actorId === "may" ? demo.tasks.filter(x => x.patientId === demo.context.patientId) : [];
  const activeTasks = tasks.filter(x => x.status !== "cancelled" && x.status !== "completed");
  const selected = tasks.find(x => x.id === selectedId);
  const afterTask = tasks.find(x => x.id === createdId);
  if (selected) return <div className="mx-auto max-w-[720px]" data-testid="plan-page"><TaskDetail key={selected.id} task={selected} onBack={() => router.push("/care")} /></div>;
  return <div className="mx-auto max-w-[720px] space-y-8" data-testid="plan-page">
    <h1 className="text-[30px] leading-tight">{t("follow.title")}</h1>
    <section><p data-testid="care-task-count" className="mb-3">{t("care.count")} · {activeTasks.length}</p><GroupedList>
      {activeTasks.map(task => <ListRow key={task.id} testId={task.id === "task-morning" ? "follow-morning-row" : `care-${task.id}`} title={L(task.title)} meta={task.scheduledAt ? formatDateTime(task.scheduledAt, locale) : undefined} value={t(isTaskOverdue(demo, task) ? "care.overdue" : `care.${task.status}`)} onClick={() => router.push(`/care?task=${encodeURIComponent(task.id)}`)} />)}
    </GroupedList>{!activeTasks.length ? <p>{t("care.empty")}</p> : null}{state.followup === "declined" ? <p className="mt-3">{t("follow.declined")}</p> : null}</section>
    {tasks.some(x => x.status === "completed" || x.status === "cancelled") ? <section><GroupedList>{tasks.filter(x => x.status === "completed" || x.status === "cancelled").map(task => <ListRow key={task.id} testId={`care-history-${task.id}`} title={L(task.title)} value={t(`care.${task.status}`)} onClick={() => router.push(`/care?task=${encodeURIComponent(task.id)}`)} />)}</GroupedList></section> : null}
    {demo.context.actorId === "may" ? <section><h2 className="mb-3 text-[24px]">{t("today.nextAppt")}</h2><GroupedList>{demo.appointments.filter(a => a.patientId === demo.context.patientId && a.status === "scheduled").map(appointment => <ListRow key={appointment.id} testId="follow-appt-row" title={L(appointment.title)} meta={formatDateTime(appointment.scheduledAt, locale)} value={t("follow.scheduled")} onClick={() => router.push(state.episodeSaved ? "/book" : "/brief")} />)}</GroupedList></section> : null}
    {demo.context.actorId === "may" ? <section className="space-y-4">
      <h2 className="text-[24px]">{t("care.afterTitle")}</h2><p className="text-ink-muted">{t("care.afterBoundary")}</p>
      {afterTask ? <div role="status" data-testid="aftervisit-receipt" className="space-y-3 rounded-[12px] bg-surface-secondary p-4"><p>{t(state.persistenceError ? "storage.memoryOnly" : "care.afterSaved")}</p><p>{L(afterTask.title)}</p><p>{formatDateTime(afterTask.scheduledAt!, locale)}</p><p>{t("care.source")} · {t(`care.${afterTask.shareCategory}`)}</p><p>{t("care.owner")}</p>{afterTask.proposedOwnerId === "david" ? <p>{t("care.proposed")}</p> : null}<Button onClick={() => router.push(`/care?task=${afterTask.id}`)}>{t("care.viewTask")}</Button><Button variant="secondary" onClick={() => { setCreatedId(null); setPreview(false); setText(""); setCategory("private"); setOwner("may"); }}>{t("care.afterTitle")}</Button></div> : <>
        {!preview ? <><label htmlFor="aftervisit-text" className="block">{t("care.afterText")}</label><textarea id="aftervisit-text" value={text} onChange={e => setText(e.target.value)} className="min-h-24 w-full rounded-[10px] border border-line bg-surface-secondary p-3" /><label htmlFor="aftervisit-time" className="block">{t("care.time")}</label><input id="aftervisit-time" type="datetime-local" className="min-h-11 w-full rounded-[10px] border border-line bg-surface-secondary p-3" value={time} onChange={e => setTime(e.target.value)} /><Button data-testid="aftervisit-preview" disabled={!text.trim()} onClick={() => { setPreview(true); setError(null); }}>{t("care.preview")}</Button></> : <div className="space-y-4" data-testid="aftervisit-preview-content">
          <h3 className="text-[20px]">{t("care.preview")}</h3><p className="break-words">{text}</p><p>{time.replace("T", " · ")} (Asia/Hong_Kong)</p><p>{t("care.source")}</p><p>{t("care.owner")}</p>
          <label className="block" htmlFor="aftervisit-category">{t("care.category")}</label><select id="aftervisit-category" value={category} onChange={e => setCategory(e.target.value as ShareCategory | "private")} className="min-h-11 w-full rounded-[10px] border border-line bg-surface-secondary p-3">{(["private", "body", "mood", "measurements", "medication", "appointments"] as const).map(value => <option key={value} value={value}>{t(`care.${value}`)}</option>)}</select>
          <label className="block" htmlFor="aftervisit-owner">{t("care.assign")}</label><select id="aftervisit-owner" value={owner} onChange={e => setOwner(e.target.value as ActorId)} className="min-h-11 w-full rounded-[10px] border border-line bg-surface-secondary p-3"><option value="may">{t("care.self")}</option><option value="david">{t("care.david")}</option></select><p className="text-ink-muted">{t("care.shareBoundary")}</p>
          <div className="flex flex-wrap gap-3"><Button data-testid="aftervisit-save" onClick={() => { const result = state.createAfterVisitTask({ patientId: demo.context.patientId, text, scheduledAt: `${time.length === 16 ? `${time}:00` : time}+08:00`, proposedOwnerId: owner, shareCategory: category }); setError(result.ok ? null : result.code); if (result.ok) setCreatedId(useAppStore.getState().demo.tasks.at(-1)!.id); }}>{t("common.save")}</Button><Button variant="secondary" onClick={() => setPreview(false)}>{t("checkin.edit")}</Button><Button variant="plain" onClick={() => { setPreview(false); setCategory("private"); setOwner("may"); setText(""); }}>{t("common.cancel")}</Button></div>
        </div>}
        {error ? <p role="alert">{t(error === "past-time" || error === "invalid-time" ? `care.${error}` : "care.error")}</p> : null}
      </>}
    </section> : null}
    <Link href="/brief" className="inline-flex min-h-11 items-center text-brand">{t("today.viewBrief")}</Link>
  </div>;
}
