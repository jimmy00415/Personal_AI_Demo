"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime } from "@/lib/clock";
import { michelleAppt } from "@/lib/selectors";
import { GroupedList, ListRow } from "@/components/system";

export function CarePage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const tasks = useAppStore((s) => s.tasks);
  const followup = useAppStore((s) => s.followup);
  const followupAt = useAppStore((s) => s.followupAt);
  const contactStatus = useAppStore((s) => s.contactStatus);
  const appointments = useAppStore((s) => s.appointments);
  const bookingStatus = useAppStore((s) => s.bookingStatus);
  const episodeSaved = useAppStore((s) => s.episodeSaved);
  const appt = michelleAppt(appointments);
  const morning = tasks.find((x) => x.id === "task-morning");
  const accompany = tasks.find((x) => x.id === "task-accompany");

  function stateLabel(state: string) {
    if (state === "completed") return t("follow.done");
    if (state === "cancelled") return t("follow.cancelled");
    if (state === "scheduled") return t("follow.scheduled");
    return t("follow.pending");
  }

  return (
    <div className="mx-auto max-w-[720px]" data-testid="plan-page">
      <h1 className="text-[30px] leading-tight">{t("follow.title")}</h1>
      <GroupedList className="mt-8">
        <ListRow
          title={t("follow.contact")}
          value={contactStatus === "not_contacted" ? t("follow.pending") : t("follow.done")}
          onClick={() => router.push("/brief")}
        />
        {followup === "scheduled" || morning ? (
          <ListRow
            testId="follow-morning-row"
            title={t("follow.morning")}
            meta={followupAt ? formatDateTime(followupAt, locale) : undefined}
            value={stateLabel(morning?.state ?? "scheduled")}
          />
        ) : followup === "declined" ? (
          <ListRow title={t("follow.morning")} value={t("follow.declined")} />
        ) : null}
        <ListRow
          testId="follow-appt-row"
          title={t("follow.appt")}
          meta={formatDateTime(appt.at, locale)}
          value={bookingStatus === "booked" ? t("today.heroBooked") : t("follow.scheduled")}
          onClick={() => router.push(episodeSaved ? "/book" : "/brief")}
        />
        {accompany ? <ListRow title={locale === "en" ? accompany.title.en : accompany.title.zh} value={stateLabel(accompany.state)} /> : null}
      </GroupedList>
      {episodeSaved ? (
        <Link href="/book" className="mt-6 mr-4 inline-flex min-h-11 items-center text-brand">
          {bookingStatus === "booked" ? t("today.viewBook") : t("today.book")}
        </Link>
      ) : null}
      <Link href="/brief" className="mt-6 inline-flex min-h-11 items-center text-brand">
        {t("today.viewBrief")}
      </Link>
    </div>
  );
}
