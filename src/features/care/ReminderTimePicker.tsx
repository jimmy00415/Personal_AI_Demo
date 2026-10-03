"use client";
import { useId, useState } from "react";
import { Button } from "@/components/system";
import { clockParts } from "@/lib/clock";
import type { ActionResult } from "@/lib/demo/types";
import { useI18n } from "@/lib/use-i18n";

export function hongKongInput(at: string) {
  const p = clockParts(at);
  return `${p.dateKey}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
export function ReminderTimePicker({ at, onSave, onCancel }: { at: string; onSave: (at: string) => ActionResult<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [value, setValue] = useState(hongKongInput(at));
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <form noValidate className="space-y-4" data-testid="reminder-picker" onSubmit={e => {
    e.preventDefault();
    const result = onSave(edited ? `${value.length === 16 ? `${value}:00` : value}+08:00` : at);
    setError(result.ok ? null : result.code);
  }}>
    <label htmlFor={id} className="block">{t("care.time")}</label>
    <input id={id} type="datetime-local" className="min-h-11 w-full rounded-[10px] border border-line bg-surface-secondary px-3 py-2" value={value} onChange={e => { setValue(e.target.value); setEdited(true); }} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    {error ? <p id={`${id}-error`} role="alert" data-testid="reminder-error">{t(error === "invalid-time" || error === "past-time" ? `care.${error}` : "care.error")}</p> : null}
    <div className="flex flex-wrap gap-3"><Button type="submit" data-testid="reminder-save">{t("common.save")}</Button><Button variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button></div>
  </form>;
}
