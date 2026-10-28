"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, CheckCheck, ChevronDown, ClipboardList, Phone } from "lucide-react";
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
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand"><CheckCheck className="h-6 w-6" aria-hidden /></div>
      <h1 className="title-1">{t("follow.title")}</h1>
      <p className="mt-2 text-[15px] text-ink-muted">{locale === "en" ? "Keep your next steps and appointments in view." : "清楚掌握下一步，照顧好每個安排。"}</p>

      <section className="mt-6 rounded-[24px] border border-attention/20 bg-attention-soft p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-attention"><Phone className="h-5 w-5" aria-hidden /></span>
          <h2 className="text-[18px] font-semibold">{locale === "en" ? "Stay in touch with your care team" : "與醫護保持聯絡"}</h2>
        </div>
        <GroupedList>
          <ListRow
            title={t("follow.contact")}
            value={<span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${contactStatus === "not_contacted" ? "bg-attention-soft text-attention" : "bg-brand-soft text-brand"}`}>{contactStatus === "not_contacted" ? t("follow.pending") : t("follow.done")}</span>}
            onClick={() => router.push("/brief")}
          />
        </GroupedList>
      </section>

      <details open className="group mt-5 rounded-[24px] border border-sky/15 bg-sky-soft p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-sky"><CalendarDays className="h-5 w-5" aria-hidden /></span>
          <h2 className="flex-1 text-[18px] font-semibold">{locale === "en" ? "Your care plan" : "你的照顧安排"}</h2>
          <ChevronDown className="h-5 w-5 shrink-0 text-sky transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <GroupedList className="mt-4">
          {followup === "scheduled" || morning ? (
            <ListRow
              testId="follow-morning-row"
              title={t("follow.morning")}
              meta={followupAt ? formatDateTime(followupAt, locale) : undefined}
              value={<span className="inline-flex rounded-full bg-sky-soft px-3 py-1 text-[12px] font-semibold text-sky">{stateLabel(morning?.state ?? "scheduled")}</span>}
            />
          ) : followup === "declined" ? (
            <ListRow title={t("follow.morning")} meta={t("follow.declined")} />
          ) : null}
          <ListRow
            testId="follow-appt-row"
            title={t("follow.appt")}
            meta={formatDateTime(appt.at, locale)}
            value={<span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand">{bookingStatus === "booked" ? t("today.heroBooked") : t("follow.scheduled")}</span>}
            onClick={() => router.push(episodeSaved ? "/book" : "/brief")}
          />
          {accompany ? <ListRow title={locale === "en" ? accompany.title.en : accompany.title.zh} value={stateLabel(accompany.state)} /> : null}
        </GroupedList>
      </details>

      <section className="panel mt-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><ClipboardList className="h-5 w-5" aria-hidden /></span>
          <h2 className="text-[18px] font-semibold">{t("brief.title")}</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/brief" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-brand-deep">
            {t("today.viewBrief")}<ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
          {episodeSaved ? (
            <Link href="/book" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-soft px-4 py-2 text-[14px] font-medium text-brand transition-colors hover:bg-brand/15">
              {bookingStatus === "booked" ? t("today.viewBook") : t("today.book")}<ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
