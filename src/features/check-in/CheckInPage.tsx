"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Heart, Smile, Meh, Frown, CircleMinus } from "lucide-react";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { clockParts } from "@/lib/clock";
import type { BodyFeeling, Mood } from "@/lib/demo/types";
import { CheckInReview } from "./CheckInReview";
import { ObservationForm } from "./ObservationForm";

const moods: Mood[] = ["good", "okay", "low", "stressed", "skipped"];
const bodies: BodyFeeling[] = ["well", "tired", "dizzy", "other"];
const moodIcons = { good: Smile, okay: Meh, low: Frown, stressed: Heart, skipped: CircleMinus };
const steps = ["mood", "body", "note", "review"] as const;

export function CheckInPage() {
  const router = useRouter();
  const selectedDraftId = useSearchParams().get("draft");
  const { t } = useI18n();
  const demo = useAppStore(s => s.demo);
  const hydrated = useAppStore(s => s.hydrated);
  const persistenceError = useAppStore(s => s.persistenceError);
  const begin = useAppStore(s => s.beginCheckIn);
  const patch = useAppStore(s => s.patchCheckIn);
  const save = useAppStore(s => s.saveCheckIn);
  const edit = useAppStore(s => s.editCheckIn);
  const complete = useAppStore(s => s.completeCheckInTask);
  const setHealthTab = useAppStore(s => s.setHealthTab);
  const [error, setError] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const today = clockParts(demo.clock).dateKey;
  // The URL restores an explicit correction across reload/back; the ordinary entry resumes today's draft.
  const draft = demo.drafts.find(d => d.patientId === demo.context.patientId && (selectedDraftId !== null ? d.id === selectedDraftId : d.taskId === null && clockParts(d.occurredAt).dateKey === today));
  const saved = demo.checkIns.filter(r => r.patientId === demo.context.patientId && (selectedDraftId !== null ? r.draftId === selectedDraftId : !r.taskId && clockParts(r.occurredAt).dateKey === today)).at(-1);
  useEffect(() => { if (hydrated && selectedDraftId === null && !draft && !saved) begin(); }, [hydrated, selectedDraftId, draft, saved, begin]);
  if (!hydrated) return null;
  if (selectedDraftId !== null && !draft && !saved) return <div className="mx-auto max-w-[640px] space-y-6" data-testid="checkin-missing"><p role="status">{t("checkin.missing")}</p><Link className="inline-flex min-h-11 items-center text-brand" href="/">{t("nav.today")}</Link></div>;
  if (!draft && !saved) return null;
  if (!draft && saved) return <div className="mx-auto max-w-[640px] space-y-6" data-testid="checkin-receipt" aria-live="polite">
    <h1 className="text-[30px]">{t(persistenceError ? "storage.memoryOnly" : "checkin.receipt")}</h1>
    <CheckInReview record={saved} />
    {saved.taskId ? <section className="space-y-4" data-testid="followup-checkin-receipt">
      <p>{t("care.followupChange")} · {t(saved.followupChange === "worse" ? "today.worseDizzy" : saved.followupChange === "still" ? "today.stillDizzy" : "today.noDizzy")}</p>
      {demo.tasks.find(task => task.id === saved.taskId)?.status === "completed" ? <p role="status">{t("care.followupDone")}</p> : <><p>{t("care.measurementRequired")}</p><Button variant="secondary" data-testid="followup-measurement" onClick={() => setMeasurementOpen(v => !v)}>{t("observation.add")}</Button>{measurementOpen ? <ObservationForm onCancel={() => setMeasurementOpen(false)} /> : null}<Button data-testid="followup-complete" onClick={() => { const result = complete(saved.taskId!, saved.id); setCompletionError(result.ok ? null : result.code); }}>{t("care.completeCheckIn")}</Button>{completionError ? <p role="alert">{t(completionError === "measurement-required" ? "care.measurement-required" : "care.error")}</p> : null}</>}
    </section> : null}
    <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-[10px] bg-brand px-4 py-3 text-white" href="/health" onClick={() => setHealthTab("records")} data-testid="checkin-view-record">{t("checkin.view")}</Link><Button variant="secondary" onClick={() => { edit(saved.id); router.push(`/check-in?draft=${encodeURIComponent(saved.draftId)}`); }}>{t("checkin.correct")}</Button></div>
    <Link className="inline-flex min-h-11 items-center text-brand" href="/">{t("nav.today")}</Link>
  </div>;
  if (!draft) return null;
  const step = draft.step;
  const index = steps.indexOf(step);
  const next = () => patch(draft.id, { step: steps[Math.min(index + 1, 3)] });
  return <div className="mx-auto max-w-[640px] space-y-6" data-testid="checkin-page">
    <h1 className="text-[30px] leading-tight">{t("checkin.title")}</h1>
    <p role="status" className="text-[15px] text-ink-muted">{t(persistenceError ? "storage.memoryOnly" : "checkin.draft")}</p>
    <p className="text-ink-muted" aria-label={`${index + 1} / 4`}>{index + 1} / 4</p>
    {step === "mood" ? <fieldset><legend className="mb-4 text-[24px]">{t("checkin.moodTitle")}</legend><div className="grid gap-3">{moods.map(mood => { const Icon = moodIcons[mood]; return <Button key={mood} variant="secondary" className="justify-start text-[17px]" aria-pressed={draft.mood === mood} data-testid={`mood-${mood}`} onClick={() => patch(draft.id, { mood })}><Icon aria-hidden="true" className="h-5 w-5 shrink-0" /><span className="flex-1 text-left">{t(`checkin.mood.${mood}`)}</span>{draft.mood === mood ? <><Check className="h-5 w-5" aria-hidden="true" /><span className="sr-only">{t("checkin.selected")}</span></> : null}</Button>; })}</div></fieldset> : null}
    {step === "body" ? <fieldset><legend className="mb-4 text-[24px]">{t("checkin.bodyTitle")}</legend><div className="grid gap-3">{bodies.map(body => <Button key={body} variant="secondary" className="justify-start text-[17px]" aria-pressed={draft.body === body} data-testid={`body-${body}`} onClick={() => patch(draft.id, { body })}><span className="flex-1 text-left">{t(`checkin.body.${body}`)}</span>{draft.body === body ? <><Check className="h-5 w-5" aria-hidden="true" /><span className="sr-only">{t("checkin.selected")}</span></> : null}</Button>)}</div></fieldset> : null}
    {step === "note" ? <div><label htmlFor="checkin-note" className="text-[24px]">{t("checkin.noteTitle")}</label><textarea id="checkin-note" value={draft.note} onChange={e => patch(draft.id, { note: e.target.value })} className="mt-4 min-h-32 w-full rounded-[12px] border border-line bg-surface-secondary p-4" /></div> : null}
    {step === "review" ? <section><h2 className="mb-4 text-[24px]">{t("checkin.review")}</h2><CheckInReview record={draft} /></section> : null}
    {draft.taskId && (step === "body" || step === "review") ? <section className="space-y-4"><fieldset><legend className="mb-3 text-[20px]">{t("care.followupChange")}</legend><div className="grid gap-3">{(["no-dizzy", "still", "worse"] as const).map(change => <Button key={change} variant="secondary" aria-pressed={draft.followupChange === change} data-testid={`followup-${change}`} onClick={() => patch(draft.id, { followupChange: change })}>{t(change === "no-dizzy" ? "today.noDizzy" : change === "still" ? "today.stillDizzy" : "today.worseDizzy")}</Button>)}</div></fieldset>{step === "review" ? <><p>{t("care.measurementRequired")}</p><Button variant="secondary" data-testid="followup-measurement" onClick={() => setMeasurementOpen(v => !v)}>{t("observation.add")}</Button>{measurementOpen ? <ObservationForm onCancel={() => setMeasurementOpen(false)} /> : null}</> : null}</section> : null}
    {(draft.mood === "low" || draft.mood === "stressed") ? <aside className="rounded-[12px] bg-surface-secondary p-4"><p>{t("checkin.support")}</p><div className="mt-2 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center text-brand underline" href="/ask">{t("checkin.organise")}</Link><Link className="inline-flex min-h-11 items-center text-brand underline" href="/ask">{t("checkin.talk")}</Link></div></aside> : null}
    {error ? <p role="alert">{t("checkin.error")}</p> : null}
    <div className="flex flex-wrap gap-3">{step === "review" ? <><Button data-testid="checkin-save" onClick={() => { const result = save(draft.id); setError(!result.ok); }}>{t("checkin.save")}</Button><Button variant="secondary" data-testid="checkin-edit" onClick={() => patch(draft.id, { step: "mood" })}>{t("checkin.edit")}</Button></> : <><Button data-testid="checkin-next" disabled={step === "mood" && !draft.mood || step === "body" && !draft.body} onClick={next}>{t("checkin.next")}</Button>{index > 0 ? <Button variant="secondary" onClick={() => patch(draft.id, { step: steps[index - 1] })}>{t("checkin.back")}</Button> : null}</>}</div>
    <Link data-testid="checkin-leave" className="inline-flex min-h-11 items-center text-brand underline" href="/">{t("checkin.leave")}</Link>
  </div>;
}
