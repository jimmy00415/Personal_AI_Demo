"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { HealthTab } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatShortDate, formatTime } from "@/lib/clock";
import { selectBpAverage, selectObservations } from "@/lib/demo/selectors";
import { Button, GroupedList, ListRow, Sheet, SourceLabel } from "@/components/system";
import { Sparkline } from "@/components/Sparkline";
import { useIsDesktop } from "@/components/use-is-desktop";
import { ObservationForm } from "@/features/check-in/ObservationForm";
import { CheckInReview } from "@/features/check-in/CheckInReview";

export function HealthPage() {
  const router = useRouter();
  const { t, L, locale } = useI18n();
  const tab = useAppStore((s) => s.healthTab);
  const setHealthTab = useAppStore((s) => s.setHealthTab);
  const demo = useAppStore((s) => s.demo);
  const selected = useAppStore((s) => s.selectedRecordId);
  const setSelectedRecord = useAppStore((s) => s.setSelectedRecord);
  const editCheckIn = useAppStore((s) => s.editCheckIn);
  const desktop = useIsDesktop();
  const readings = selectObservations(demo);
  const avg = selectBpAverage(demo);
  const mine = demo.healthRecords.filter(r => r.patientId === demo.context.patientId);
  const checkIns = demo.checkIns.filter(r => r.patientId === demo.context.patientId).toSorted((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const event = mine.find((r) => r.id === selected);
  const checkIn = checkIns.find(r => r.id === selected);
  const reading = readings.find((r) => r.id === selected);
  const [adding, setAdding] = useState(false);
  const close = useCallback(() => { setSelectedRecord(null); setAdding(false); }, [setSelectedRecord]);
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
          <p className="mt-2 text-ink-muted" data-testid="bp-average">
            {avg ? <>{t("health.avg")} {avg.systolic} / {avg.diastolic} mmHg</> : t("observation.empty")}
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
          {checkIns.map(r => <button key={r.id} type="button" className="block min-h-11 w-full rounded-[12px] bg-surface-secondary p-4 text-left" data-testid={`checkin-record-${r.id}`} onClick={() => setSelectedRecord(r.id)}>
            <p>{formatShortDate(r.occurredAt, locale)} · {t("checkin.review")}</p>
            <p className="mt-2">{r.mood === "skipped" ? t("checkin.noMood") : t(`checkin.mood.${r.mood}`)} · {t(`checkin.body.${r.body}`)}</p>
            <SourceLabel source="user" />
          </button>)}
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
                {formatShortDate(r.occurredAt, locale)} · <SourceLabel source={r.source} />
              </div>
              <div className="mt-1 text-[17px]">{L(r.title)}</div>
              <p className="mt-1 text-[14px] text-ink-muted">{L(r.text)}</p>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "measurements" ? (
        <div className="mt-8">
          <Button data-testid="add-observation" onClick={() => { setSelectedRecord(null); setAdding(true); }}>{t("observation.add")}</Button>
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
        open={!!event || !!reading || !!checkIn || adding}
        onClose={close}
        side={desktop ? "right" : "bottom"}
        title={event ? L(event.title) : checkIn ? t("checkin.review") : adding ? t("observation.add") : reading ? t("health.reading") : ""}
      >
        {event ? (
          <div>
            <p className="text-[13px] text-ink-soft">
              {formatShortDate(event.occurredAt, locale)} {formatTime(event.occurredAt, locale)}
            </p>
            <p className="mt-3">{L(event.text)}</p>
            <p className="mt-4 text-[13px] text-ink-soft">
              <SourceLabel source={event.source} />
            </p>
          </div>
        ) : null}
        {checkIn ? <div data-testid="checkin-detail"><CheckInReview record={checkIn} /><Button className="mt-6" data-testid="checkin-correct" onClick={() => { editCheckIn(checkIn.id); router.push(`/check-in?draft=${encodeURIComponent(checkIn.draftId)}`); }}>{t("checkin.correct")}</Button></div> : null}
        {adding ? <ObservationForm key="new-observation" onCancel={close} /> : null}
        {reading ? (
          <div data-testid="bp-detail">
            <p className="text-[22px]">
              {reading.systolic}/{reading.diastolic} <span className="text-[15px] text-ink-soft">mmHg</span>
            </p>
            <p className="mt-2 text-[13px] text-ink-soft">
              {formatShortDate(reading.occurredAt, locale)} {formatTime(reading.occurredAt, locale)}
            </p>
            <p className="mt-3">
              <SourceLabel source={reading.source} />
            </p>
            <p className="mt-3 text-[15px] text-ink-muted">{t("checkin.enteredLabel")}: {formatShortDate(reading.enteredAt, locale)} {formatTime(reading.enteredAt, locale)}</p>
            <ObservationForm key={reading.id} observation={reading} onCancel={close} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
