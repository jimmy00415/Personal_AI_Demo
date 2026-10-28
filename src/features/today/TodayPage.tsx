"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, HeartPulse, ListTodo, Users, ArrowUpRight, CalendarDays, ChevronDown, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDate, formatDateTime } from "@/lib/clock";
import { latestMichelleBp, michelleBp, michelleAppt, todayHero } from "@/lib/selectors";
import { Button } from "@/components/system";
import { Sparkline } from "@/components/Sparkline";
import { useDemoAccount } from "@/lib/demo-account";

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
  const [tasksOpen, setTasksOpen] = useState(true);
  const user = useDemoAccount((s) => s.user);
  const hero = todayHero(clock, episodeSaved, answers.nextMorning, bookingStatus, phase);
  const appt = michelleAppt(appointments);
  const bp = latestMichelleBp();
  const quickLinks = [
    { href: "/health", title: t("nav.health"), hint: t("today.healthHint"), icon: HeartPulse, style: "bg-sky-soft text-sky" },
    { href: "/care", title: t("nav.follow"), hint: t("today.careHint"), icon: ListTodo, style: "bg-attention-soft text-attention" },
    { href: "/family", title: t("nav.family"), hint: t("today.familyHint"), icon: Users, style: "bg-violet-soft text-violet" },
  ];
  const todayTasks = tasks.filter((x) => x.personId === "michelle" && (x.date === clock.slice(0, 10) || x.kind === "contact"));

  return (
    <div data-testid="today-page" className="mx-auto max-w-[1000px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-full"><p className="eyebrow mb-2 text-brand">{t("product.name")} / {t("nav.today")}</p>
        <h1 className="title-1 [overflow-wrap:anywhere]">{user ? `${locale === "en" ? "Hello, " : "你好，"}${user.name}` : t("today.greeting")}</h1>
        <p className="mt-2 text-[15px] text-ink-muted">{t("today.welcomeBody")}</p></div>
        <p className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-[12px] text-ink-muted"><CalendarDays className="h-4 w-4 text-brand" />{formatDate(clock, locale)}</p>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section data-testid="daily-brief" className={`panel relative overflow-hidden ${hero.kind === "urgent" ? "border-critical/25 bg-critical-soft" : "border-brand/20 bg-brand-soft/60"}`}>
        <div className="mb-5 flex items-center gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${hero.kind === "urgent" ? "bg-critical text-white" : "bg-brand text-white"}`}><Sparkles className="h-4 w-4" /></span><p className="eyebrow text-brand-deep">{t("today.focusLabel")}</p></div>
        <h2 className="text-[23px] font-medium leading-snug">{t(hero.titleKey)}</h2>
        <p className="measure mt-3 text-[15px] leading-relaxed text-ink-muted">{t(hero.bodyKey)}</p>

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
              className="min-h-12 rounded-[10px] border border-brand/20 bg-surface/80 px-3 text-[14px] text-brand-deep"
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
            <button type="button" aria-expanded={why} aria-controls="today-record-sources" className="flex min-h-11 items-center gap-2 text-[13px] text-brand-deep underline-offset-4 hover:underline" onClick={() => setWhy((v) => !v)}>
              {t("today.why")}<ChevronDown className={`h-4 w-4 transition-transform ${why ? "rotate-180" : ""}`} />
            </button>
            {why ? (
              <ul id="today-record-sources" className="mt-2 space-y-2 rounded-xl bg-surface/80 p-4 text-[13px] text-ink-muted">
                <li>{t("today.ref1")}</li>
                <li>{t("today.ref2")}</li>
                <li>{t("today.ref3")}</li>
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
      <section className="panel flex flex-col border-sky/15 bg-surface">
        <div className="flex items-center justify-between"><p className="eyebrow text-sky">{t("today.snapshot")}</p><span className="rounded-xl bg-sky-soft p-2 text-sky"><HeartPulse className="h-5 w-5" /></span></div>
        <p className="mt-5 text-[36px] font-medium tracking-tight text-sky">{bp.systolic}<span className="mx-1 text-[24px] text-sky/50">/</span>{bp.diastolic}<span className="ml-2 text-[13px] font-normal tracking-normal text-ink-muted">mmHg</span></p>
        <p className="mt-1 text-[12px] text-ink-muted">{t("today.snapshotHint")}</p>
        <div className="mt-4 rounded-xl bg-sky-soft px-3 py-2 [&_svg]:h-16 [&_svg]:w-full"><Sparkline values={michelleBp().map((r) => r.systolic)} /></div>
        <button type="button" className="mt-3 flex min-h-11 items-center justify-between gap-2 text-left text-[13px] text-sky" onClick={() => { setHealthTab("measurements"); router.push("/health"); }}>{t("today.viewBp")}<ArrowUpRight className="h-4 w-4 shrink-0" /></button>
      </section>
      </div>

      <section className="mt-7">
        <h2 className="eyebrow mb-3 text-ink-muted">{t("today.explore")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">{quickLinks.map((item) => <Link key={item.href} href={item.href} className="group rounded-[20px] border border-line bg-surface p-4 transition-colors hover:border-brand/40"><div className="flex items-center justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-[13px] ${item.style}`}><item.icon className="h-5 w-5" /></span><ArrowUpRight className="h-4 w-4 text-ink-soft group-hover:text-brand" /></div><h3 className="mt-4 text-[16px] font-medium">{item.title}</h3><p className="mt-1 text-[12px] text-ink-muted">{item.hint}</p></Link>)}</div>
      </section>

      <section className="panel mt-5 !p-0">
        <button type="button" data-testid="today-tasks-toggle" aria-expanded={tasksOpen} aria-controls="today-tasks" onClick={() => setTasksOpen((value) => !value)} className="flex min-h-16 w-full items-center justify-between gap-3 rounded-t-[24px] bg-attention-soft/50 px-5 py-4 text-left"><span className="flex items-center gap-3"><ListTodo className="h-5 w-5 text-attention" /><span className="text-[16px] font-medium">{t("today.items")}</span><span className="rounded-full bg-surface px-2 py-0.5 text-[12px] text-attention">{todayTasks.length}</span></span><ChevronDown className={`h-5 w-5 text-attention transition-transform ${tasksOpen ? "rotate-180" : ""}`} /></button>
        <div id="today-tasks" hidden={!tasksOpen} className="divide-y divide-line">
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
        </div>
      </section>

      {appt ? (
        <section className="mt-4">
          <button type="button" onClick={() => router.push(episodeSaved ? "/book" : "/health")} className="flex w-full items-center gap-4 rounded-[22px] border border-violet/15 bg-violet-soft p-5 text-left"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface/80 text-violet"><CalendarDays className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-violet">{t("today.nextAppt")}</span><span className="mt-1 block text-[13px] text-ink-muted">{formatDateTime(appt.at, locale)}</span></span><ArrowUpRight className="h-5 w-5 shrink-0 text-violet" /></button>
        </section>
      ) : null}
    </div>
  );
}
