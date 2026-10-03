"use client";

import { formatDateTime } from "@/lib/clock";
import { useI18n } from "@/lib/use-i18n";
import type { CheckInDraft, DailyCheckIn } from "@/lib/demo/types";

export function CheckInReview({ record }: { record: CheckInDraft | DailyCheckIn }) {
  const { t, locale } = useI18n();
  return <div className="space-y-4 break-words" data-testid="checkin-review">
    <dl className="space-y-4">
      <div><dt className="text-ink-muted">{t("checkin.dateLabel")}</dt><dd>{formatDateTime(record.occurredAt, locale)}</dd></div>
      <div><dt className="text-ink-muted">{t("checkin.moodLabel")}</dt><dd>{record.mood === "skipped" || !record.mood ? t("checkin.noMood") : t(`checkin.mood.${record.mood}`)}</dd></div>
      <div><dt className="text-ink-muted">{t("checkin.bodyLabel")}</dt><dd>{record.body ? t(`checkin.body.${record.body}`) : "—"}</dd></div>
      <div><dt className="text-ink-muted">{t("checkin.noteTitle")}</dt><dd className="whitespace-pre-wrap">{record.note || t("checkin.emptyNote")}</dd></div>
      {"enteredAt" in record ? <div><dt className="text-ink-muted">{t("checkin.enteredLabel")}</dt><dd>{formatDateTime(record.enteredAt, locale)}</dd></div> : null}
    </dl>
    <p className="text-[15px] text-ink-muted">{t("checkin.source")}</p>
  </div>;
}
