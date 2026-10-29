"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowUpRight, ChevronRight, ClipboardList, FileText, HeartPulse } from "lucide-react";
import type { HealthTab } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatShortDate, formatTime } from "@/lib/clock";
import { bpAverage, michelleBp } from "@/lib/selectors";
import { Button, GroupedList, ListRow, Sheet, SourceLabel } from "@/components/system";
import { useIsDesktop } from "@/components/use-is-desktop";

function BloodPressureChart({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values) - 6;
  const max = Math.max(...values) + 6;
  const points = values.map((value, index) => {
    const x = 10 + (index / (values.length - 1)) * 540;
    const y = 126 - ((value - min) / (max - min)) * 110;
    return { x, y };
  });
  const line = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox="0 0 560 144" role="img" aria-label={label} className="mt-4 h-32 w-full overflow-visible sm:h-40">
      {[30, 75, 120].map((y) => <line key={y} x1="10" y1={y} x2="550" y2={y} stroke="currentColor" strokeDasharray="4 5" className="text-sky/15" />)}
      <polygon points={`10,140 ${line} 550,140`} fill="currentColor" className="text-sky/10" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-sky" />
      {points.map(({ x, y }, index) => <circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 5 : 3} fill="currentColor" stroke="white" strokeWidth="2" className="text-sky" />)}
    </svg>
  );
}

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
  const tabs = [
    { id: "overview", key: "health.overview", icon: Activity },
    { id: "records", key: "health.records", icon: ClipboardList },
    { id: "measurements", key: "health.bp", icon: HeartPulse },
    { id: "reports", key: "health.reports", icon: FileText },
  ] as const satisfies readonly { id: HealthTab; key: "health.overview" | "health.records" | "health.bp" | "health.reports"; icon: typeof Activity }[];

  const lastReading = readings.at(-1);
  const trendDates = [
    readings[0] ? formatShortDate(readings[0].occurredAt, locale) : "",
    lastReading ? formatShortDate(lastReading.occurredAt, locale) : "",
  ];

  return (
    <div className="mx-auto max-w-[760px]" data-testid="health-page">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-soft text-sky"><HeartPulse className="h-6 w-6" aria-hidden /></div>
      <h1 className="title-1">{t("health.title")}</h1>
      <p className="mt-2 text-[0.9375rem] text-ink-muted">{locale === "en" ? "Your records, measurements and reports, together." : "健康紀錄、量度及報告，一目了然。"}</p>
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5" aria-label={t("health.title")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`health-tab-${item.id}`}
            aria-pressed={tab === item.id}
            onClick={() => setHealthTab(item.id)}
            className={`flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-[0.8125rem] font-medium transition-colors ${tab === item.id ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:bg-brand-soft hover:text-brand"}`}
          >
            <item.icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
            {t(item.key)}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-6 space-y-5">
          <section className="rounded-[24px] border border-sky/15 bg-sky-soft p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-sky">{t("health.focus")}</p>
                <h2 className="mt-2 text-[1.4375rem] font-semibold">{t("health.bpMgmt")}</h2>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-sky"><Activity className="h-5 w-5" aria-hidden /></span>
            </div>
            <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-1">
              <p className="text-[2.25rem] font-semibold leading-tight tracking-tight text-sky">{avg.systolic} <span className="text-sky/50">/</span> {avg.diastolic} <span className="text-[0.875rem] font-medium">mmHg</span></p>
              <p className="pb-1 text-[0.8125rem] text-ink-muted">{t("health.avg")}</p>
            </div>
            <p className="mt-6 text-[0.8125rem] font-medium text-ink-muted">{t("health.sys")}</p>
            <BloodPressureChart values={readings.map((r) => r.systolic)} label={t("health.sys")} />
            <div className="flex justify-between text-[0.75rem] text-ink-muted"><span>{trendDates[0]}</span><span>{trendDates[1]}</span></div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={() => setHealthTab("measurements")} className="panel group flex items-center gap-4 text-left transition-colors hover:border-sky/40">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-soft text-sky"><HeartPulse className="h-5 w-5" aria-hidden /></span>
              <span className="flex-1 text-[0.9375rem] font-medium">{t("today.viewBp")}</span>
              <ArrowUpRight className="h-4 w-4 text-sky" aria-hidden />
            </button>
            <button type="button" onClick={() => router.push("/report")} className="panel flex items-center gap-4 text-left transition-colors hover:border-violet/40">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-soft text-violet"><FileText className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0 flex-1"><span className="block text-[0.9375rem] font-medium">{t("report.title")}</span><span className="mt-1 block text-[0.75rem] text-ink-muted">{t("report.sub")}</span></span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-violet" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {tab === "records" ? (
        <div className="mt-6 space-y-3" data-testid="journey-page">
          {mine.map((r) => (
            <button
              key={r.id}
              type="button"
              data-testid={`journey-event-${r.id}`}
              className="panel flex w-full items-start gap-4 text-left transition-colors hover:border-brand/30"
              onClick={() => {
                if (r.kind === "report") router.push("/report");
                else setSelectedRecord(r.id);
              }}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${r.kind === "report" ? "bg-violet-soft text-violet" : "bg-brand-soft text-brand"}`}>{r.kind === "report" ? <FileText className="h-5 w-5" aria-hidden /> : <ClipboardList className="h-5 w-5" aria-hidden />}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[0.75rem] text-ink-muted">
                  {formatShortDate(r.occurredAt, locale)} · <SourceLabel source={r.provenance.source} />
                </div>
                <div className="mt-1.5 text-[1.0625rem] font-medium">{L(r.title)}</div>
                <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-muted">{L(r.summary)}</p>
              </div>
              <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      {tab === "measurements" ? (
        <div className="mt-6 space-y-5">
          <section className="rounded-[24px] border border-sky/15 bg-sky-soft p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-sky"><Activity className="h-5 w-5" aria-hidden />{t("health.sys")}</h2>
            <BloodPressureChart values={readings.map((r) => r.systolic)} label={t("health.sys")} />
            <div className="flex justify-between text-[0.75rem] text-ink-muted"><span>{trendDates[0]}</span><span>{trendDates[1]}</span></div>
          </section>
          <section className="panel overflow-x-auto">
          <h2 className="text-[1.0625rem] font-semibold">{t("health.table")}</h2>
          <table className="mt-4 w-full text-left text-[0.8125rem] sm:text-[0.9375rem]" data-testid="bp-table">
            <thead>
              <tr className="text-ink-muted">
                <th className="py-2 pr-3 font-medium">{t("health.dateCol")}</th>
                <th className="py-2 pr-3 font-medium">{t("health.sysCol")}</th>
                <th className="py-2 font-medium">{t("health.diaCol")}</th>
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
                        className="min-h-11 pr-3 text-left font-medium text-sky"
                        onClick={() => {
                          setNoteDraft(readingNotes[r.id] ?? "");
                          setSelectedRecord(r.id);
                        }}
                      >
                        {formatShortDate(r.occurredAt, locale)} {formatTime(r.occurredAt, locale)}
                      </button>
                    </td>
                    <td className="pr-3 tabular-nums">{r.systolic} mmHg</td>
                    <td className="tabular-nums">{r.diastolic} mmHg</td>
                  </tr>
                ))}
            </tbody>
          </table>
          </section>
        </div>
      ) : null}

      {tab === "reports" ? (
        <section className="mt-6 rounded-[24px] border border-violet/15 bg-violet-soft p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-[1.0625rem] font-semibold text-violet"><FileText className="h-5 w-5" aria-hidden />{t("health.reports")}</h2>
          <GroupedList><ListRow title={t("report.title")} meta={t("report.sub")} onClick={() => router.push("/report")} /></GroupedList>
        </section>
      ) : null}

      <Sheet
        open={!!event || !!reading}
        onClose={() => setSelectedRecord(null)}
        side={desktop ? "right" : "bottom"}
        title={event ? L(event.title) : reading ? t("health.reading") : ""}
      >
        {event ? (
          <div>
            <p className="text-[0.8125rem] text-ink-soft">
              {formatShortDate(event.occurredAt, locale)} {formatTime(event.occurredAt, locale)}
            </p>
            <p className="mt-3">{L(event.summary)}</p>
            <p className="mt-4 text-[0.8125rem] text-ink-soft">
              <SourceLabel source={event.provenance.source} />
            </p>
          </div>
        ) : null}
        {reading ? (
          <div data-testid="bp-detail">
            <p className="text-[1.375rem]">
              {reading.systolic}/{reading.diastolic} <span className="text-[0.9375rem] text-ink-soft">mmHg</span>
            </p>
            <p className="mt-2 text-[0.8125rem] text-ink-soft">
              {formatShortDate(reading.occurredAt, locale)} {formatTime(reading.occurredAt, locale)}
            </p>
            <p className="mt-3">
              <SourceLabel source="home-measure" />
            </p>
            <p className="mt-6 text-[0.9375rem]">{t("health.correct")}</p>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">{t("health.correctHint")}</p>
            <textarea
              aria-label={t("health.correct")}
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
            {readingNotes[reading.id] ? <p className="mt-3 text-[0.875rem] text-ink-muted">{readingNotes[reading.id]}</p> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
