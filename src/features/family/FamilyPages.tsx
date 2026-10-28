"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, HeartHandshake, HeartPulse, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { formatDateTime, formatShortDate, formatTime } from "@/lib/clock";
import { motherAppt, motherBp } from "@/lib/selectors";
import { Button, GroupedList, ListRow, Sheet } from "@/components/system";
import { useIsDesktop } from "@/components/use-is-desktop";

export function FamilyPage() {
  const { t, locale } = useI18n();
  const viewing = useAppStore((s) => s.viewingPersonId);
  const setViewingPerson = useAppStore((s) => s.setViewingPerson);
  const prepareMotherBrief = useAppStore((s) => s.prepareMotherBrief);
  const motherBriefReady = useAppStore((s) => s.motherBriefReady);
  const addAccompany = useAppStore((s) => s.addAccompany);
  const accompanyAdded = useAppStore((s) => s.accompanyAdded);
  const sharingStopped = useAppStore((s) => s.sharingStopped);
  const consent = useAppStore((s) => s.consent);
  const stopSharing = useAppStore((s) => s.stopSharing);
  const showToast = useAppStore((s) => s.showToast);
  const [perm, setPerm] = useState(false);
  const desktop = useIsDesktop();
  const appt = motherAppt();
  const bp = motherBp()[0];

  if (viewing === "michelle") {
    return (
      <div className="mx-auto max-w-[720px]" data-testid="family-page">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft text-violet"><Users className="h-6 w-6" aria-hidden /></div>
        <h1 className="title-1">{t("family.title")}</h1>
        <p className="mt-2 text-[15px] text-ink-muted">{locale === "en" ? "A little support for the people you care about." : "關心家人，一起照顧生活中的大小事。"}</p>
        <button type="button" data-testid="family-lai-wah" onClick={() => setViewingPerson("lai-wah")} className="mt-6 flex w-full items-center gap-4 rounded-[24px] border border-violet/15 bg-violet-soft p-5 text-left transition-colors hover:border-violet/40 sm:p-6">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-white text-[23px] font-medium text-violet" aria-hidden>陳</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[19px] font-semibold">{t("family.role")} · 陳麗華</span>
            <span className="mt-1 block text-[14px] text-ink-muted">{t("family.age")}</span>
            <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-violet"><ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />{t(sharingStopped ? "family.stopped" : "family.sharedList")}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-violet" aria-hidden />
        </button>
        <div className="panel mt-5 flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <p className="text-[14px] leading-relaxed text-ink-muted">{t(sharingStopped ? "family.stopped" : "family.permBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]" data-testid="mother-profile">
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-[14px] font-medium text-brand" onClick={() => setViewingPerson("michelle")}>
        <ArrowLeft className="h-4 w-4" aria-hidden />{t("family.switch")}
      </button>

      <section className="mt-4 rounded-[24px] border border-violet/15 bg-violet-soft p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-white text-[23px] font-medium text-violet" aria-hidden>陳</span>
          <div><p className="text-[13px] font-medium text-violet">{t("family.role")} · {t("family.age")}</p><h1 className="mt-1 text-[28px] font-semibold">陳麗華</h1></div>
        </div>
        <h2 className="mt-7 text-[23px] font-semibold leading-snug">{t("family.hero")}</h2>
        <p className="mt-3 flex items-start gap-2 text-[14px] text-ink-muted">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden />
          <span>{t("family.appt")} · {formatDateTime(appt.at, locale)}</span>
        </p>
        <Button className="mt-6" data-testid="prep-mother" onClick={prepareMotherBrief}>
          <ClipboardList className="h-4 w-4" aria-hidden />{t("family.prep")}
        </Button>
      </section>

      {!sharingStopped && consent.canViewBp ? (
        <details open className="group mt-5 rounded-[24px] border border-sky/15 bg-sky-soft p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-sky"><HeartPulse className="h-5 w-5" aria-hidden /></span>
            <h2 className="flex-1 text-[18px] font-semibold">{t("family.shared")}</h2>
            <ChevronDown className="h-5 w-5 shrink-0 text-sky transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <GroupedList className="mt-4">
            <ListRow
              title={t("family.bp")}
              value={bp ? <span className="font-semibold text-sky">{bp.systolic} / {bp.diastolic} <span className="text-[12px] font-normal">mmHg</span></span> : ""}
              meta={bp ? `${formatShortDate(bp.occurredAt, locale)} ${formatTime(bp.occurredAt, locale)}` : ""}
            />
            <ListRow title={t("family.shared")} meta={t("family.sharedList")} />
            <ListRow title={t("family.meds")} value={<span className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-2.5 py-1 text-[12px]"><LockKeyhole className="h-3 w-3" aria-hidden />{t("family.medsHidden")}</span>} />
          </GroupedList>
        </details>
      ) : (
        <p className="panel mt-5 flex items-center gap-3 text-ink-muted"><ShieldCheck className="h-5 w-5 shrink-0 text-brand" aria-hidden />{t("family.stopped")}</p>
      )}

      {motherBriefReady ? (
        <div className="mt-5 rounded-[24px] border border-brand/15 bg-brand-soft p-5 sm:p-6" data-testid="mother-brief">
          <h3 className="flex items-center gap-2 text-[18px] font-semibold text-brand"><ClipboardList className="h-5 w-5" aria-hidden />{t("brief.title")}</h3>
          <p className="mt-4 text-[15px]">陳麗華 · {formatDateTime(appt.at, locale)}</p>
          {bp && consent.canViewBp ? (
            <p className="mt-2 text-[15px]">
              {t("family.bp")} · {bp.systolic}/{bp.diastolic} mmHg
            </p>
          ) : null}
          <p className="mt-2 text-[14px] text-ink-muted">{t("family.meds")} · {t("family.medsHidden")}</p>
          {!accompanyAdded ? (
            <Button className="mt-4" data-testid="accompany" onClick={addAccompany}>
              <HeartHandshake className="h-4 w-4" aria-hidden />{t("family.remind")}
            </Button>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-[14px] font-medium text-brand"><Check className="h-4 w-4" aria-hidden />{t("family.reminded")}</p>
          )}
        </div>
      ) : null}

      <section className="mt-5 rounded-[24px] border border-attention/20 bg-attention-soft p-5 sm:p-6">
        <p className="flex items-center gap-2 text-[14px] font-medium text-attention"><LockKeyhole className="h-4 w-4" aria-hidden />{t("family.noBook")}</p>
        <Link href="/book" data-testid="mother-book" className="mt-2 inline-flex min-h-11 items-center gap-2 text-[14px] font-medium text-ink-muted">
          {t("today.book")}<ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
      <button type="button" className="panel mt-5 flex w-full items-center gap-3 text-left text-brand" onClick={() => setPerm(true)}>
        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden /><span className="flex-1 text-[15px] font-medium">{t("family.perms")}</span><ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      <Sheet open={perm} onClose={() => setPerm(false)} side={desktop ? "right" : "bottom"} title={t("family.perms")}>
        <p>{t("family.permBody")}</p>
        <p className="mt-3 text-[14px] text-ink-muted">{t("family.noGrant")}</p>
        <Button className="mt-4" variant="secondary" onClick={stopSharing}>
          {t("family.stop")}
        </Button>
        <Button
          className="mt-2"
          variant="plain"
          onClick={() => {
            const text = locale === "en"
              ? "Mum, your appointment is soon. If you are willing, you could also share your medication list so I can help at the visit. This is only a draft for you to send."
              : "媽媽，覆診快到了。如果你願意，可以把用藥資料也分享給我，方便陪你覆診。這只是草稿，需要你自己傳送。";
            void navigator.clipboard?.writeText(text);
            showToast(t("brief.copied"));
          }}
        >
          {t("family.request")}
        </Button>
      </Sheet>
    </div>
  );
}

export function MotherProfilePage() {
  return <FamilyPage />;
}
