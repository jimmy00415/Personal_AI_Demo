"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDate, formatDateTime } from "@/lib/clock";
import { michelleAppt, todayHero } from "@/lib/selectors";
import { Button, GroupedList, ListRow } from "@/components/system";

export function TodayPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const clock = useAppStore((s) => s.clock);
  const tasks = useAppStore((s) => s.tasks);
  const followup = useAppStore((s) => s.followup);
  const episodeSaved = useAppStore((s) => s.episodeSaved);
  const setTodayScroll = useAppStore((s) => s.setTodayScroll);
  const answerNextMorning = useAppStore((s) => s.answerNextMorning);
  const answers = useAppStore((s) => s.answers);
  const bookingStatus = useAppStore((s) => s.bookingStatus);
  const phase = useAppStore((s) => s.phase);
  const appointments = useAppStore((s) => s.appointments);
  const setHealthTab = useAppStore((s) => s.setHealthTab);
  const [why, setWhy] = useState(false);
  const hero = todayHero(clock, episodeSaved, answers.nextMorning, bookingStatus, phase);
  const appt = michelleAppt(appointments);
  const todayTasks = tasks.filter((x) => x.personId === "michelle" && (x.date === clock.slice(0, 10) || x.kind === "contact"));

  return (
    <div data-testid="today-page" className="mx-auto max-w-[720px]">
      <p className="text-[15px] text-ink-muted">{formatDate(clock, locale)}</p>
      <h1 className="mt-1 text-[30px] leading-tight">{t("today.greeting")}</h1>

      <section data-testid="daily-brief" className="mt-8">
        <h2 className="text-[24px] leading-snug">{t(hero.titleKey)}</h2>
        <p className="measure mt-3 text-[17px] leading-relaxed text-ink-muted">{t(hero.bodyKey)}</p>

        {hero.kind === "urgent" ? (
          <div className="mt-6">
            <Link
              href="/ask"
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

      <section className="mt-10">
        <div className="mb-2 px-1 text-[13px] text-ink-soft">{t("today.items")}</div>
        <GroupedList>
          {todayTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 px-4 py-3.5" data-testid={`task-${task.id}`}>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                  task.state === "completed" ? "border-brand bg-brand text-white" : "border-line"
                }`}
              >
                {task.state === "completed" ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="w-12 text-[13px] text-ink-soft">{task.time}</span>
              <span className="flex-1 text-[16px]">{locale === "en" ? task.title.en : task.title.zh}</span>
              <span className="text-[13px] text-ink-soft">
                {task.state === "completed"
                  ? t("today.done")
                  : task.state === "not_due"
                    ? t("today.notDue")
                    : task.state === "scheduled"
                      ? t("today.scheduled")
                      : t("today.pending")}
              </span>
            </div>
          ))}
        </GroupedList>
      </section>

      {appt ? (
        <section className="mt-8">
          <GroupedList>
            <ListRow
              title={t("today.nextAppt")}
              meta={formatDateTime(appt.at, locale)}
              onClick={() => router.push(episodeSaved ? "/book" : "/health")}
            />
          </GroupedList>
        </section>
      ) : null}
    </div>
  );
}
