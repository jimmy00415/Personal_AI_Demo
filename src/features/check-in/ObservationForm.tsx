"use client";

import { useState } from "react";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { clockParts } from "@/lib/clock";
import type { Observation } from "@/lib/demo/types";

function localTime(iso: string) {
  const p = clockParts(iso);
  return `${p.dateKey}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
type FieldError = "SystolicFormat" | "DiastolicFormat" | "PressureOrder" | "FutureTime" | "TimeRequired";
export function ObservationForm({ observation, onCancel }: { observation?: Observation; onCancel: () => void }) {
  const { t } = useI18n();
  const demo = useAppStore(s => s.demo);
  const persistenceError = useAppStore(s => s.persistenceError);
  const save = useAppStore(s => s.saveObservation);
  const [id] = useState(() => observation?.id ?? `observation-${demo.context.patientId}-${Date.parse(demo.clock)}-${demo.observations.length + 1}`);
  const [sys, setSys] = useState(observation ? String(observation.systolic) : "");
  const [dia, setDia] = useState(observation ? String(observation.diastolic) : "");
  const [time, setTime] = useState(localTime(observation?.occurredAt ?? demo.clock));
  const [timeEdited, setTimeEdited] = useState(false);
  const [note, setNote] = useState(observation?.note ?? "");
  const [error, setError] = useState<FieldError | null>(null);
  const [saved, setSaved] = useState(false);
  const inputClass = "mt-2 min-h-11 w-full rounded-[10px] border border-line bg-surface-secondary px-3 py-2 text-[17px]";
  const sysError = error === "SystolicFormat" || error === "PressureOrder";
  const diaError = error === "DiastolicFormat" || error === "PressureOrder";
  const timeError = error === "FutureTime" || error === "TimeRequired";
  return <form className="mt-6 space-y-4" noValidate onSubmit={event => {
    event.preventDefault();
    const occurredAt = observation && !timeEdited ? observation.occurredAt : time ? `${time.length === 16 ? `${time}:00` : time}+08:00` : "";
    const result = save({ id, patientId: demo.context.patientId, systolic: sys.trim() ? Number(sys) : NaN, diastolic: dia.trim() ? Number(dia) : NaN, occurredAt, enteredAt: observation?.enteredAt ?? demo.clock, source: observation?.source ?? "home-measure", revision: observation?.revision ?? 1, note });
    setError(result.ok ? null : result.code as FieldError);
    setSaved(result.ok);
  }}>
    <p id="observation-format" className="text-[15px] text-ink-muted">{t("observation.boundary")}</p>
    <div><label htmlFor="observation-sys">{t("observation.systolic")}</label><input id="observation-sys" inputMode="decimal" value={sys} onChange={e => { setSys(e.target.value); setSaved(false); }} className={inputClass} aria-invalid={sysError} aria-describedby={sysError ? "observation-error" : "observation-format"} /></div>
    <div><label htmlFor="observation-dia">{t("observation.diastolic")}</label><input id="observation-dia" inputMode="decimal" value={dia} onChange={e => { setDia(e.target.value); setSaved(false); }} className={inputClass} aria-invalid={diaError} aria-describedby={diaError ? "observation-error" : "observation-format"} /></div>
    <div><label htmlFor="observation-time">{t("observation.time")}</label><input id="observation-time" type="datetime-local" value={time} onChange={e => { setTime(e.target.value); setTimeEdited(true); setSaved(false); }} className={inputClass} aria-invalid={timeError} aria-describedby={timeError ? "observation-error" : undefined} /></div>
    <div><label htmlFor="observation-note">{t("observation.note")}</label><textarea id="observation-note" value={note} onChange={e => { setNote(e.target.value); setSaved(false); }} className={inputClass} /></div>
    {error ? <p id="observation-error" data-testid="observation-error" role="alert">{t(`observation.${error}`)}</p> : null}
    {saved ? <p data-testid="observation-receipt" role="status">{t(persistenceError ? "storage.memoryOnly" : "observation.receipt")}</p> : null}
    <div className="flex flex-wrap gap-3"><Button type="submit" data-testid="observation-save">{t("common.save")}</Button><Button variant="secondary" onClick={onCancel}>{t("observation.cancel")}</Button></div>
  </form>;
}
