"use client";

import Link from "next/link";
import { useState } from "react";
import { Languages, Monitor, Database, UserRound, LogIn, LogOut } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import type { SceneId } from "@/lib/types";
import { Button } from "@/components/system";
import { useDemoAccount } from "@/lib/demo-account";
import { ROLE_META, roleLabel } from "@/lib/roles";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useCareWorkspace } from "@/lib/care-workspace";

export function SettingsPage() {
  const { t, locale, liteMode } = useI18n();
  const setLocale = useAppStore((s) => s.setLocale);
  const setLiteMode = useAppStore((s) => s.setLiteMode);
  const clearDeviceData = useAppStore((s) => s.clearDeviceData);
  const [confirmClear, setConfirmClear] = useState(false);
  const user = useDemoAccount((s) => s.user);
  const openLogin = useDemoAccount((s) => s.openLogin);
  const signOut = useDemoAccount((s) => s.signOut);
  const role = useDemoAccount((s) => s.role);
  const resetWorkspace = useCareWorkspace((s) => s.reset);
  return (
    <div className="mx-auto max-w-[640px]" data-testid="settings-page">
      <h1 className="title-1">{t("settings.title")}</h1>
      <section className="panel mt-7 border-brand/20 bg-brand-soft/40">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand"><UserRound className="h-5 w-5" /></span><h2 className="text-[1.125rem] font-medium">{t("account.title")}</h2></div>
        <p className="mt-4 break-all text-[1.25rem] font-medium">{user?.name ?? t("account.guest")}</p>
        {user ? <p className="mt-1 break-all text-[0.875rem] text-ink-muted">{user.email}</p> : null}
        <p className="mt-2 text-[0.875rem] text-ink-muted">{t(user ? "account.signedIn" : "account.guestBody")}</p>
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium">{locale === "en" ? "Your role" : "目前角色"} · {roleLabel(role, locale)}</p>
          <p className="mb-3 text-sm text-ink-muted">{ROLE_META[role].description[locale === "en" ? "en" : "zh"]}</p>
          <RoleSwitcher testId="settings-role-switcher" />
        </div>
        {user ? <Button data-testid="account-logout" variant="secondary" className="mt-4" onClick={signOut}><LogOut className="h-4 w-4" />{t("account.logout")}</Button> : <Button data-testid="settings-login" className="mt-4" onClick={openLogin}><LogIn className="h-4 w-4" />{t("account.login")}</Button>}
      </section>
      <section className="panel mt-4">
      <h2 className="flex items-center gap-2 text-[1rem] font-medium"><Languages className="h-5 w-5 text-sky" />{t("nav.language")}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={locale === "zh-HK" ? "primary" : "secondary"} onClick={() => setLocale("zh-HK")}>
          {t("lang.zh")}
        </Button>
        <Button data-testid="lang-en-settings" variant={locale === "en" ? "primary" : "secondary"} onClick={() => setLocale("en")}>
          {t("lang.en")}
        </Button>
      </div>
      </section>
      <section className="panel mt-4">
      <h2 className="flex items-center gap-2 text-[1rem] font-medium"><Monitor className="h-5 w-5 text-violet" />{t("nav.display")}</h2>
      <Button data-testid="lite-toggle-settings" aria-pressed={liteMode} className="mt-4" variant={liteMode ? "primary" : "secondary"} onClick={() => setLiteMode(!liteMode)}>
        {liteMode ? t("lite.on") : t("lite.off")}
      </Button>
      </section>
      <section className="panel mt-4">
      <h2 className="flex items-center gap-2 text-[1rem] font-medium"><Database className="h-5 w-5 text-attention" />{t("settings.data")}</h2>
      <p className="measure mt-2 text-[0.9375rem] text-ink-muted">{t("settings.dataBody")}</p>
      {confirmClear ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="critical"
            data-testid="clear-device-confirm"
            onClick={() => {
              setConfirmClear(false);
              signOut();
              resetWorkspace();
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
      </section>
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
      <h1 className="text-[1.875rem]">{t("about.title")}</h1>
      <p className="measure mt-4 text-[1.0625rem] leading-relaxed">{t("about.body")}</p>
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
      <h1 className="text-[1.875rem]">{t("dev.title")}</h1>
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
