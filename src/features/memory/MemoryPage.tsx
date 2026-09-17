"use client";

import { useAppStore, visibleMemories } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { Button, GroupedList, ListRow, Sheet, SourceLabel } from "@/components/system";
import { useIsDesktop } from "@/components/use-is-desktop";

export function MemoryPage() {
  const { t, L } = useI18n();
  const memories = visibleMemories(useAppStore((s) => s.memories));
  const selected = useAppStore((s) => s.selectedRecordId);
  const setSelected = useAppStore((s) => s.setSelectedRecord);
  const forgetId = useAppStore((s) => s.forgetId);
  const setForgetId = useAppStore((s) => s.setForgetId);
  const excludeMemory = useAppStore((s) => s.excludeMemory);
  const confirmMemory = useAppStore((s) => s.confirmMemory);
  const desktop = useIsDesktop();
  const item = memories.find((m) => m.id === selected);

  return (
    <div className="mx-auto max-w-[720px]" data-testid="memory-page">
      <h1 className="text-[30px] leading-tight">{t("memory.title")}</h1>
      <p className="measure mt-2 text-ink-muted">{t("memory.sub")}</p>
      <GroupedList className="mt-8">
        {memories.map((m) => (
          <ListRow
            key={m.id}
            testId={`memory-${m.id}`}
            title={L(m.value)}
            meta={
              <span>
                {m.pendingConfirm ? t("source.pending") : <SourceLabel source={m.source} />}
              </span>
            }
            onClick={() => setSelected(m.id)}
          />
        ))}
      </GroupedList>
      <Sheet open={!!item} onClose={() => setSelected(null)} side={desktop ? "right" : "bottom"} title={item ? L(item.value) : ""} testId="memory-drawer">
        {item ? (
          <div>
            {item.pendingConfirm ? <p className="text-[13px] text-ink-soft">{t("source.pending")}</p> : <SourceLabel source={item.source} />}
            <p className="mt-4">{L(item.detail)}</p>
            {forgetId === item.id ? (
              <div className="mt-6">
                <p>{t("memory.stopAsk")}</p>
                <p className="mt-2 text-[14px] text-ink-muted">{t("memory.stopBody")}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="critical" onClick={() => excludeMemory(item.id)}>
                    {t("memory.stop")}
                  </Button>
                  <Button variant="secondary" onClick={() => setForgetId(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => confirmMemory(item.id)}>
                  {t("memory.ok")}
                </Button>
                <Button variant="plain" onClick={() => setForgetId(item.id)}>
                  {t("memory.stop")}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
