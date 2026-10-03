"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDate, formatDateTime } from "@/lib/clock";
import { michelleAppt, todayHero } from "@/lib/selectors";
import { Button, GroupedList, ListRow } from "@/components/system";
import { isTaskOverdue, selectToday, selectTodayTasks } from "@/lib/demo/selectors";

export function TodayPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const clock = useAppStore((s) => s.clock);
  const followup = useAppStore((s) => s.followup);
  const episodeSaved = useAppStore((s) => s.episodeSaved);
  const setTodayScroll = useAppStore((s) => s.setTodayScroll);
  const answerNextMorning = useAppStore((s) => s.answerNextMorning);
  const answers = useAppStore((s) => s.answers);
  const bookingStatus = useAppStore((s) => s.bookingStatus);
  const phase = useAppStore((s) => s.phase);
  const appointments = useAppStore((s) => s.appointments);
  const setHealthTab = useAppStore((s) => s.setHealthTab);
  const demo = useAppStore((s) => s.demo);
  const todayView = selectToday(demo);
  const dailyEntry = todayView.dailyEntry;
  const [why, setWhy] = useState(false);
  const legacyHero = todayHero(clock, episodeSaved, answers.nextMorning, bookingStatus, phase);
  const emotionalHelp = demo.episodes.find(e => e.id === todayView.hero.sourceId)?.helpKind === "emotional";
  const hero = todayView.hero.kind === "urgent" ? { kind: "urgent", titleKey: emotionalHelp ? "local.emotionalTitle" : "today.heroUrgent", bodyKey: emotionalHelp ? "local.emotionalBody" : "today.heroUrgentBody" } as const
    : todayView.hero.kind === "needs-attention" ? { kind: "attention", titleKey: "today.attentionTitle", bodyKey: "today.attentionBody" } as const
      : todayView.hero.kind === "follow-up" ? { kind: "next", titleKey: "today.heroNext", bodyKey: "today.heroNextBody" } as const
        : todayView.hero.kind === "prepare-visit" ? { kind: "prepare", titleKey: "today.prepareTitle", bodyKey: "today.prepareBody" } as const
          : demo.episodes.length ? { ...legacyHero, kind: legacyHero.kind === "next" ? "saved" : legacyHero.kind }
            : { kind: "routine", titleKey: "today.routineTitle", bodyKey: "today.routineBody" } as const;
  const appt = michelleAppt(appointments);
  const todayTasks = selectTodayTasks(demo);

  return (
    <div data-testid="today-page" className="mx-auto max-w-[720px]">
      <p className="text-[15px] text-ink-muted">{formatDate(clock, locale)}</p>
      <h1 className="mt-1 text-[30px] leading-tight">{t("today.greeting")}</h1>
      <Link href="/notifications" data-testid="today-events" className="mt-4 inline-flex min-h-11 items-center text-brand">{t("events.title")}</Link>

      <section data-testid="daily-brief" className="mt-8">
        <h2 className="text-[24px] leading-snug">{t(hero.titleKey)}</h2>
        <p className="measure mt-3 text-[17px] leading-relaxed text-ink-muted">{t(hero.bodyKey)}</p>
        {hero.kind === "prepare" && bookingStatus === "booked" ? <p className="mt-3 text-ink-muted">{t("today.heroBooked")}</p> : null}

        {hero.kind === "urgent" ? (
          <div className="mt-6">
            <Link
              href="/help"
              data-testid="return-emergency"
              className="inline-flex min-h-12 items-center rounded-[10px] bg-critical px-4 text-[16px] text-white"
            >
              {t("today.urgentCta")}
            </Link>
          </div>
        ) : null}

        {hero.kind === "open" ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/ask"
              data-testid="talk-to-caremate"
              onClick={() => setTodayScroll(window.scrollY)}
              className="inline-flex min-h-12 items-center rounded-[10px] bg-brand px-4 text-[16px] text-white"
            >
              {t("today.understand")}
            </Link>
            <button
              type="button"
              className="min-h-12 text-[16px] text-ink-muted"
              onClick={() => {
                setHealthTab("measurements");
                router.push("/health");
              }}
            >
              {t("today.viewBp")}
            </button>
          </div>
        ) : null}

        {hero.kind === "saved" ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/book" data-testid="book-earlier" className="inline-flex min-h-12 items-center rounded-[10px] bg-brand px-4 text-[16px] text-white">
              {t("today.book")}
            </Link>
            <Link href="/brief" data-testid="view-brief" className="inline-flex min-h-12 items-center text-[16px] text-ink-muted">
              {t("today.viewBrief")}
            </Link>
          </div>
        ) : null}

        {hero.kind === "booked" ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/book" data-testid="view-booking" className="inline-flex min-h-12 items-center rounded-[10px] bg-brand px-4 text-[16px] text-white">
              {t("today.viewBook")}
            </Link>
            <Link href="/brief" data-testid="view-brief" className="inline-flex min-h-12 items-center text-[16px] text-ink-muted">
              {t("today.viewBrief")}
            </Link>
          </div>
        ) : null}

        {hero.kind === "next" ? (
          <div className="mt-6 grid gap-2" data-testid="next-morning-choices">
            <Button data-testid="next-no-dizzy" onClick={() => answerNextMorning("no-dizzy")}>
              {t("today.noDizzy")}
            </Button>
            <Button variant="secondary" onClick={() => answerNextMorning("still")}>
              {t("today.stillDizzy")}
            </Button>
            <Button variant="secondary" onClick={() => answerNextMorning("worse")}>
              {t("today.worseDizzy")}
            </Button>
          </div>
        ) : null}
        {hero.kind === "attention" ? <Link href="/care" className="mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-brand px-4 py-3 text-white">{t("care.viewTask")}</Link> : null}
        {hero.kind === "prepare" ? <Link href="/brief" className="mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-brand px-4 py-3 text-white">{t("today.viewBrief")}</Link> : null}

        {followup === "scheduled" && hero.kind === "saved" ? (
          <p className="mt-4 text-[15px] text-ink-muted">{t("today.heroFollow")}</p>
        ) : null}

        {hero.kind === "open" ? (
          <div className="mt-5">
            <button type="button" className="text-[14px] text-ink-soft underline-offset-4 hover:underline" onClick={() => setWhy((v) => !v)}>
              {t("today.why")}
            </button>
            {why ? (
              <ul className="mt-2 space-y-1 text-[14px] text-ink-muted">
                <li>{t("today.ref1")}</li>
                <li>{t("today.ref2")}</li>
                <li>{t("today.ref3")}</li>
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <Link href={dailyEntry.href} data-testid="daily-check-in" className="inline-flex min-h-11 items-center rounded-[10px] bg-surface-secondary px-4 py-3 text-[17px] text-brand">
          {t("checkin.title")}
        </Link>
      </section>

      <section className="mt-10">
        <div data-testid="today-task-count" className="mb-2 px-1 text-[13px] text-ink-soft">{t("today.items")} · {todayTasks.length}</div>
        <GroupedList>
          {todayTasks.map(task => <ListRow key={task.id} testId={`task-${task.id}`} title={locale === "en" ? task.title.en : task.title.zh} meta={task.scheduledAt ? <time dateTime={task.scheduledAt}>{formatDateTime(task.scheduledAt, locale)}</time> : undefined} value={task.status === "completed" ? t("today.done") : isTaskOverdue(demo, task) ? t("care.overdue") : task.kind === "medication" && task.scheduledAt && Date.parse(task.scheduledAt) > Date.parse(clock) ? t("today.notDue") : t(`care.${task.status}`)} onClick={() => router.push(`/care?task=${encodeURIComponent(task.id)}`)} />)}
        </GroupedList>
      </section>

      {appt ? (
        <section className="mt-8">
          <GroupedList>
            <ListRow
              title={t("today.nextAppt")}
              meta={formatDateTime(appt.at, locale)}
              onClick={() => router.push("/book")}
            />
          </GroupedList>
        </section>
      ) : null}
    </div>
  );
}
