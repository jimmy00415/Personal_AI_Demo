"use client";

import { useState } from "react";
import Link from "next/link";
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
        <h1 className="text-[30px]">{t("family.title")}</h1>
        <GroupedList className="mt-8">
          <ListRow
            testId="family-lai-wah"
            title={`${t("family.role")} · 陳麗華`}
            meta={t("family.age")}
            onClick={() => setViewingPerson("lai-wah")}
          />
        </GroupedList>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]" data-testid="mother-profile">
      <button type="button" className="text-[14px] text-ink-muted" onClick={() => setViewingPerson("michelle")}>
        ← {t("family.switch")}
      </button>
      <p className="mt-6 text-[15px] text-ink-muted">
        {t("family.role")} · {t("family.age")}
      </p>
      <h1 className="mt-1 text-[30px]">陳麗華</h1>
      <h2 className="mt-8 text-[24px] leading-snug">{t("family.hero")}</h2>
      <p className="mt-3 text-ink-muted">
        {t("family.appt")} · {formatDateTime(appt.at, locale)}
      </p>
      <Button className="mt-6" data-testid="prep-mother" onClick={prepareMotherBrief}>
        {t("family.prep")}
      </Button>

      {!sharingStopped && consent.canViewBp ? (
        <GroupedList className="mt-8">
          <ListRow
            title={t("family.bp")}
            value={bp ? `${bp.systolic} / ${bp.diastolic} mmHg` : ""}
            meta={bp ? `${formatShortDate(bp.occurredAt, locale)} ${formatTime(bp.occurredAt, locale)}` : ""}
          />
          <ListRow title={t("family.shared")} meta={t("family.sharedList")} />
          <ListRow title={t("family.meds")} value={t("family.medsHidden")} />
        </GroupedList>
      ) : (
        <p className="mt-8 text-ink-muted">{t("family.stopped")}</p>
      )}

      {motherBriefReady ? (
        <div className="mt-8" data-testid="mother-brief">
          <h3 className="text-[18px]">{t("brief.title")}</h3>
          <p className="mt-2">陳麗華 · {formatDateTime(appt.at, locale)}</p>
          {bp && consent.canViewBp ? (
            <p className="mt-2">
              {t("family.bp")} · {bp.systolic}/{bp.diastolic} mmHg
            </p>
          ) : null}
          <p className="mt-2 text-ink-muted">{t("family.medsHidden")}</p>
          {!accompanyAdded ? (
            <Button className="mt-4" data-testid="accompany" onClick={addAccompany}>
              {t("family.remind")}
            </Button>
          ) : (
            <p className="mt-4">{t("family.reminded")}</p>
          )}
        </div>
      ) : null}

      <p className="mt-6 text-[14px] text-ink-muted">{t("family.noBook")}</p>
      <Link href="/book" data-testid="mother-book" className="mt-2 inline-flex min-h-11 items-center text-[14px] text-ink-soft">
        {t("today.book")}
      </Link>
      <button type="button" className="mt-8 text-[15px] text-brand" onClick={() => setPerm(true)}>
        {t("family.perms")}
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
