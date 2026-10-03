"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useAppStore } from "@/lib/store";
import { selectActiveMemories } from "@/lib/demo/selectors";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime } from "@/lib/clock";
import { Button, GroupedList, ListRow, Sheet, SourceLabel } from "@/components/system";
import { useIsDesktop } from "@/components/use-is-desktop";
export function MemoryPage() {
  const { t, L, locale } = useI18n();
  const demo = useAppStore(s => s.demo);
  const persistenceError = useAppStore(s => s.persistenceError);
  const memories = demo.memories.filter(m => m.patientId === demo.context.patientId);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const desktop = useIsDesktop();
  const item = memories.find(m => m.id === selected);
  const close = useCallback(() => { setSelected(null); setEditing(false); setStopping(false); setError(false); }, []);
  const updated = () => { close(); setReceipt(true); };
  return <div className="mx-auto max-w-[720px]" data-testid="memory-page">
    <Link href="/settings" className="inline-flex min-h-11 items-center text-brand">← {t("memory.back")}</Link>
    <h1 className="title-1 mt-4">{t("memory.title")}</h1><p className="measure mt-3 text-ink-muted">{t("memory.sub")}</p>
    <p className="measure mt-3 text-ink-muted">{t("memory.stopBody")}</p>
    {receipt ? <p role="status" className="mt-4">{t(persistenceError ? "storage.memoryOnly" : "memory.updated")}</p> : null}
    {!selectActiveMemories(demo).length ? <p className="mt-4">{t("memory.empty")}</p> : null}
    <GroupedList className="mt-6">{memories.map(m => <ListRow key={m.id} testId={`memory-${m.id}`} title={L(m.value)} meta={<span><SourceLabel source={m.source} /> · {m.enabled ? m.pendingConfirm ? t("source.pending") : formatDateTime(m.enteredAt, locale) : t("memory.disabled")}</span>} onClick={() => { setSelected(m.id); setReceipt(false); }} />)}</GroupedList>
    <Sheet open={!!item} onClose={close} side={desktop ? "right" : "bottom"} title={item ? L(item.value) : ""} testId="memory-drawer">
      {item ? <div><SourceLabel source={item.source} /><p className="mt-3">{L(item.detail)}</p><p className="mt-3 text-ink-muted">{formatDateTime(item.enteredAt, locale)}</p>
        {editing ? <form className="mt-6 space-y-3" onSubmit={e => { e.preventDefault(); const result = useAppStore.getState().correctMemory(item.id, { zh: value, en: value }); if (result.ok) updated(); else setError(true); }}><p className="text-ink-muted">{t("memory.correctBody")}</p><label className="block">{t("memory.editLabel")}<textarea autoFocus className="mt-2 min-h-28 w-full rounded-xl border border-line bg-surface p-3" value={value} onChange={e => { setValue(e.target.value); setError(false); }} aria-invalid={error} aria-describedby={error ? "memory-error" : undefined} /></label>{error ? <p id="memory-error" role="alert">{t("memory.invalid")}</p> : null}<div className="flex flex-wrap gap-3"><Button type="submit">{t("common.save")}</Button><Button variant="secondary" onClick={() => { setEditing(false); setError(false); }}>{t("common.cancel")}</Button></div></form>
        : stopping ? <div className="mt-6 space-y-3"><p>{t("memory.stopAsk")}</p><p>{t("memory.stopBody")}</p><div className="flex flex-wrap gap-3"><Button variant="critical" onClick={() => { if (useAppStore.getState().setMemoryUse(item.id, false).ok) updated(); }}>{t("memory.stop")}</Button><Button variant="secondary" onClick={() => setStopping(false)}>{t("common.cancel")}</Button></div></div>
        : <div className="mt-6 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => { setValue(L(item.value)); setEditing(true); }}>{t("memory.correct")}</Button>{item.pendingConfirm ? <Button variant="secondary" onClick={() => { if (useAppStore.getState().correctMemory(item.id, item.value).ok) updated(); }}>{t("memory.ok")}</Button> : null}<Button variant="plain" onClick={() => { if (item.enabled) setStopping(true); else if (useAppStore.getState().setMemoryUse(item.id, true).ok) updated(); }}>{t(item.enabled ? "memory.stop" : "memory.enable")}</Button></div>}
      </div> : null}
    </Sheet>
  </div>;
}
