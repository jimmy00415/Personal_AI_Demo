"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HealthTab } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatShortDate, formatTime } from "@/lib/clock";
import { bpAverage, michelleBp } from "@/lib/selectors";
import { Button, GroupedList, ListRow, Sheet, SourceLabel } from "@/components/system";
import { Sparkline } from "@/components/Sparkline";
import { useIsDesktop } from "@/components/use-is-desktop";

export function HealthPage() {
  const router = useRouter();
  const { t, L, locale } = useI18n();
  const tab = useAppStore((s) => s.healthTab);
  const setHealthTab = useAppStore((s) => s.setHealthTab);
  const records = useAppStore((s) => s.records);
  const selected = useAppStore((s) => s.selectedRecordId);
  const setSelectedRecord = useAppStore((s) => s.setSelectedRecord);
  const readingNotes = useAppStore((s) => s.readingNotes);
  const setReadingNote = useAppStore((s) => s.setReadingNote);
  const showToast = useAppStore((s) => s.showToast);
  const desktop = useIsDesktop();
  const readings = michelleBp();
  const avg = bpAverage();
  const event = records.find((r) => r.id === selected);
  const reading = readings.find((r) => r.id === selected);
  const [noteDraft, setNoteDraft] = useState("");
  const mine = useMemo(() => records.filter((r) => r.personId === "michelle"), [records]);
  const tabs: { id: HealthTab; key: "health.overview" | "health.records" | "health.bp" | "health.reports" }[] = [
    { id: "overview", key: "health.overview" },
    { id: "records", key: "health.records" },
    { id: "measurements", key: "health.bp" },
    { id: "reports", key: "health.reports" },
  ];

  return (
    <div className="mx-auto max-w-[760px]" data-testid="health-page">
      <h1 className="text-[30px] leading-tight">{t("health.title")}</h1>
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-surface-secondary p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`health-tab-${item.id}`}
            onClick={() => setHealthTab(item.id)}
            className={`min-h-11 flex-1 rounded-full px-3 text-[13px] ${tab === item.id ? "bg-surface text-ink" : "text-ink-muted"}`}
          >
            {t(item.key)}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-8">
          <p className="text-[13px] text-ink-soft">{t("health.focus")}</p>
          <h2 className="mt-1 text-[24px]">{t("health.bpMgmt")}</h2>
          <p className="mt-2 text-ink-muted">
            {t("health.avg")} {avg.systolic} / {avg.diastolic} mmHg
          </p>
          <p className="mt-4 text-[13px] text-ink-soft">{t("health.sys")}</p>
          <Sparkline values={readings.map((r) => r.systolic)} />
          <GroupedList className="mt-8">
            <ListRow title={t("today.viewBp")} onClick={() => setHealthTab("measurements")} />
            <ListRow title={t("report.title")} meta={t("report.sub")} onClick={() => router.push("/report")} />
          </GroupedList>
        </div>
      ) : null}

      {tab === "records" ? (
        <div className="mt-8 space-y-5" data-testid="journey-page">
          {mine.map((r) => (
            <button
              key={r.id}
              type="button"
              data-testid={`journey-event-${r.id}`}
              className="block w-full text-left"
              onClick={() => {
                if (r.kind === "report") router.push("/report");
                else setSelectedRecord(r.id);
              }}
            >
              <div className="text-[12px] text-ink-soft">
                {formatShortDate(r.occurredAt, locale)} · <SourceLabel source={r.provenance.source} />
              </div>
              <div className="mt-1 text-[17px]">{L(r.title)}</div>
              <p className="mt-1 text-[14px] text-ink-muted">{L(r.summary)}</p>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "measurements" ? (
        <div className="mt-8">
          <p className="text-[13px] text-ink-soft">{t("health.sys")}</p>
          <Sparkline values={readings.map((r) => r.systolic)} />
          <h2 className="mt-6 text-[15px] text-ink-soft">{t("health.table")}</h2>
          <table className="mt-3 w-full text-left text-[15px]" data-testid="bp-table">
            <thead>
              <tr className="text-ink-soft">
                <th className="py-2 font-normal">{t("health.dateCol")}</th>
                <th className="py-2 font-normal">{t("health.sysCol")}</th>
                <th className="py-2 font-normal">{t("health.diaCol")}</th>
              </tr>
            </thead>
            <tbody>
              {readings
                .slice()
                .reverse()
                .map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-3">
                      <button
                        type="button"
                        data-testid={`bp-row-${r.id}`}
                        className="min-h-11 text-left text-brand"
                        onClick={() => {
                          setNoteDraft(readingNotes[r.id] ?? "");
                          setSelectedRecord(r.id);
                        }}
                      >
                        {formatShortDate(r.occurredAt, locale)} {formatTime(r.occurredAt, locale)}
                      </button>
                    </td>
                    <td>{r.systolic} mmHg</td>
                    <td>{r.diastolic} mmHg</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "reports" ? (
        <GroupedList className="mt-8">
          <ListRow title={t("report.title")} meta={t("report.sub")} onClick={() => router.push("/report")} />
        </GroupedList>
      ) : null}

      <Sheet
        open={!!event || !!reading}
        onClose={() => setSelectedRecord(null)}
        side={desktop ? "right" : "bottom"}
        title={event ? L(event.title) : reading ? t("health.reading") : ""}
      >
        {event ? (
          <div>
            <p className="text-[13px] text-ink-soft">
              {formatShortDate(event.occurredAt, locale)} {formatTime(event.occurredAt, locale)}
            </p>
            <p className="mt-3">{L(event.summary)}</p>
            <p className="mt-4 text-[13px] text-ink-soft">
              <SourceLabel source={event.provenance.source} />
            </p>
          </div>
        ) : null}
        {reading ? (
          <div data-testid="bp-detail">
            <p className="text-[22px]">
              {reading.systolic}/{reading.diastolic} <span className="text-[15px] text-ink-soft">mmHg</span>
            </p>
            <p className="mt-2 text-[13px] text-ink-soft">
              {formatShortDate(reading.occurredAt, locale)} {formatTime(reading.occurredAt, locale)}
            </p>
            <p className="mt-3">
              <SourceLabel source="home-measure" />
            </p>
            <p className="mt-6 text-[15px]">{t("health.correct")}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{t("health.correctHint")}</p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={t("health.correctPh")}
              className="mt-3 min-h-24 w-full rounded-[12px] bg-surface-secondary p-3"
            />
            <Button
              className="mt-3"
              onClick={() => {
                setReadingNote(reading.id, noteDraft);
                showToast(t("memory.updated"));
              }}
            >
              {t("common.save")}
            </Button>
            {readingNotes[reading.id] ? <p className="mt-3 text-[14px] text-ink-muted">{readingNotes[reading.id]}</p> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
