"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
export function WelcomePage() {
  const { t, locale, liteMode } = useI18n();
  const router = useRouter();
  const finish = () => { useAppStore.getState().completeIntro(); router.replace("/"); };
  return <main data-testid="welcome-page" className="mx-auto max-w-xl space-y-6 px-5 py-10">
    <p className="text-brand">{t("product.name")}</p>
    <h1 className="title-1">{t("welcome.title")}</h1>
    <p>{t("welcome.body")}</p><p className="rounded-xl bg-surface p-4 text-ink-muted">{t("welcome.local")}</p>
    <fieldset><legend className="mb-3">{t("nav.language")}</legend><div className="flex flex-wrap gap-3"><Button aria-pressed={locale === "zh-HK"} variant={locale === "zh-HK" ? "primary" : "secondary"} onClick={() => useAppStore.getState().setLocale("zh-HK")}>{t("lang.zh")}</Button><Button aria-pressed={locale === "en"} variant={locale === "en" ? "primary" : "secondary"} onClick={() => useAppStore.getState().setLocale("en")}>{t("lang.en")}</Button></div></fieldset>
    <Button aria-pressed={liteMode} variant="secondary" onClick={() => useAppStore.getState().setLiteMode(!liteMode)}>{t(liteMode ? "lite.on" : "lite.off")}</Button>
    <div className="grid gap-3"><Button onClick={finish}>{t("welcome.start")}</Button><Button variant="plain" onClick={finish}>{t("welcome.skip")}</Button></div>
  </main>;
}
