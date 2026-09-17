"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import type { SceneId } from "@/lib/types";
import { Button } from "@/components/system";

export function SettingsPage() {
  const { t, locale, liteMode } = useI18n();
  const setLocale = useAppStore((s) => s.setLocale);
  const setLiteMode = useAppStore((s) => s.setLiteMode);
  const clearDeviceData = useAppStore((s) => s.clearDeviceData);
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="mx-auto max-w-[640px]" data-testid="settings-page">
      <h1 className="text-[30px]">{t("settings.title")}</h1>
      <h2 className="mt-8 text-[13px] text-ink-soft">{t("nav.language")}</h2>
      <div className="mt-2 flex gap-2">
        <Button variant={locale === "zh-HK" ? "primary" : "secondary"} onClick={() => setLocale("zh-HK")}>
          {t("lang.zh")}
        </Button>
        <Button data-testid="lang-en-settings" variant={locale === "en" ? "primary" : "secondary"} onClick={() => setLocale("en")}>
          {t("lang.en")}
        </Button>
      </div>
      <h2 className="mt-8 text-[13px] text-ink-soft">{t("nav.display")}</h2>
      <Button data-testid="lite-toggle-settings" className="mt-2" variant={liteMode ? "primary" : "secondary"} onClick={() => setLiteMode(!liteMode)}>
        {liteMode ? t("lite.on") : t("lite.off")}
      </Button>
      <h2 className="mt-8 text-[13px] text-ink-soft">{t("settings.data")}</h2>
      <p className="measure mt-2 text-[15px] text-ink-muted">{t("settings.dataBody")}</p>
      {confirmClear ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="critical"
            data-testid="clear-device-confirm"
            onClick={() => {
              setConfirmClear(false);
              clearDeviceData();
            }}
          >
            {t("settings.clearConfirm")}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmClear(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="mt-3" data-testid="clear-device-data" onClick={() => setConfirmClear(true)}>
          {t("settings.clearData")}
        </Button>
      )}
      <div className="mt-10">
        <Link href="/about" className="text-brand">
          {t("nav.about")}
        </Link>
      </div>
    </div>
  );
}

export function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-[680px]" data-testid="about-page">
      <h1 className="text-[30px]">{t("about.title")}</h1>
      <p className="measure mt-4 text-[17px] leading-relaxed">{t("about.body")}</p>
      <p className="measure mt-4 text-ink-muted">{t("about.limit")}</p>
    </div>
  );
}

export function PrivacyPage() {
  return <AboutPage />;
}

export function CareTeamPage() {
  return <AboutPage />;
}

export function RecordsPage() {
  return <AboutPage />;
}

export function MedicationsPage() {
  return <AboutPage />;
}

export function DevPage() {
  const { t } = useI18n();
  const applyScene = useAppStore((s) => s.applyScene);
  const resetWorld = useAppStore((s) => s.resetWorld);
  const advanceClock = useAppStore((s) => s.advanceClock);
  const scenes: SceneId[] = [
    "morning-start",
    "symptom-summary",
    "report-review",
    "brief-ready",
    "booking-ready",
    "booking-done",
    "next-morning",
    "family-preparation",
    "urgent-help",
  ];
  return (
    <div className="mx-auto max-w-[640px]" data-testid="dev-page">
      <h1 className="text-[30px]">{t("dev.title")}</h1>
      <div className="mt-6 grid gap-2">
        <Button data-testid="demo-reset" onClick={resetWorld}>
          {t("dev.reset")}
        </Button>
        <Button data-testid="advance-clock" variant="secondary" onClick={advanceClock}>
          {t("dev.next")}
        </Button>
        {scenes.map((id) => (
          <Button key={id} variant="secondary" data-testid={`scene-${id}`} onClick={() => applyScene(id)}>
            {id}
          </Button>
        ))}
      </div>
    </div>
  );
}
