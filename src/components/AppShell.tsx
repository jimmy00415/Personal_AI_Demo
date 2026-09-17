"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HeartPulse, Home, Settings, Users, ListTodo } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { samePath, shellLayout } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { ToastHost } from "./system";

const primary = [
  { href: "/", key: "nav.today" as const, icon: Home, testId: "nav-today" },
  { href: "/health", key: "nav.health" as const, icon: HeartPulse, testId: "nav-health" },
  { href: "/care", key: "nav.follow" as const, icon: ListTodo, testId: "nav-care" },
  { href: "/family", key: "nav.family" as const, icon: Users, testId: "nav-family" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, liteMode } = useI18n();
  const hydrate = useAppStore((s) => s.hydrate);
  const pendingPath = useAppStore((s) => s.pendingPath);
  const consumePendingPath = useAppStore((s) => s.consumePendingPath);
  const setLocale = useAppStore((s) => s.setLocale);
  const setLiteMode = useAppStore((s) => s.setLiteMode);
  const emergency = useAppStore((s) => s.phase === "urgent_help");
  const hydrated = useAppStore((s) => s.hydrated);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") router.push("/dev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  useEffect(() => {
    if (!pendingPath) return;
    if (!samePath(pendingPath, pathname)) router.push(pendingPath);
    consumePendingPath();
  }, [pendingPath, pathname, router, consumePendingPath]);

  const secondary = [
    { href: "/memory", label: t("nav.memory"), testId: "link-memory" },
    { href: "/brief", label: t("nav.brief"), testId: "link-visit" },
    { href: "/book", label: t("today.book"), testId: "link-book" },
    { href: "/about", label: t("nav.about"), testId: "link-privacy" },
    { href: "/settings", label: t("nav.settings"), testId: "link-settings" },
  ];

  const { isActive, hideChrome, hideFab, showAskLink, bare } = shellLayout(pathname, emergency);

  if (!hydrated) {
    return <div className="min-h-dvh bg-background" />;
  }

  if (hideChrome) {
    return (
      <div className="min-h-dvh bg-background">
        <ToastHost />
        <div className={bare ? "" : "mx-auto max-w-2xl px-6 py-10"}>{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <ToastHost />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-line/80 bg-background px-2 py-5 md:flex lg:w-[220px] lg:px-3">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand text-[15px] text-white">康</span>
          <span className="hidden lg:block text-[15px]">{t("product.name")}</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testId}
                className={cn("nav-item flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-[15px]", isActive(item.href) ? "bg-brand-soft text-brand-deep" : "text-ink-muted hover:bg-surface")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{t(item.key)}</span>
              </Link>
            );
          })}
          {!showAskLink ? null : (
            <>
              <div className="my-3 mx-2 h-px bg-line" />
              <Link
                href="/ask"
                data-testid="nav-ask"
                className="nav-item flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-[15px] text-ink-muted hover:bg-surface"
              >
                <span className="flex h-4 w-4 items-center justify-center text-[13px]">✦</span>
                <span className="hidden lg:inline">{t("nav.ask")}</span>
              </Link>
            </>
          )}
        </nav>
        <div className="relative px-1">
          <button type="button" data-testid="profile-menu-btn" onClick={() => setMenuOpen((v) => !v)} className="flex min-h-11 w-full items-center gap-2 rounded-[12px] px-2 text-left hover:bg-surface">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[11px] text-white">MC</span>
            <span className="hidden lg:block text-[13px]">Michelle</span>
          </button>
          {menuOpen ? (
            <div className="absolute bottom-14 left-0 right-0 z-40 rounded-[14px] bg-surface p-2 shadow-[0_8px_28px_rgba(23,26,24,0.08)]" data-testid="profile-menu">
              {secondary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={item.testId}
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(item.href);
                  }}
                  className="block rounded-[10px] px-3 py-2 text-[13px] hover:bg-surface-secondary"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 flex gap-1">
                <button type="button" className={cn("flex-1 rounded-[8px] px-2 py-1.5 text-[12px]", locale === "zh-HK" ? "bg-brand text-white" : "bg-surface-secondary")} onClick={() => setLocale("zh-HK")}>
                  {t("lang.zh")}
                </button>
                <button type="button" data-testid="lang-en" className={cn("flex-1 rounded-[8px] px-2 py-1.5 text-[12px]", locale === "en" ? "bg-brand text-white" : "bg-surface-secondary")} onClick={() => setLocale("en")}>
                  {t("lang.en")}
                </button>
              </div>
              <button type="button" data-testid="lite-toggle" className="mt-1 w-full rounded-[10px] px-3 py-2 text-left text-[13px]" onClick={() => setLiteMode(!liteMode)}>
                {liteMode ? t("lite.on") : t("lite.off")}
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between bg-background px-5 py-3 md:hidden">
        <Link href="/" className="text-[16px]">{t("product.name")}</Link>
        <Link href="/settings" aria-label={t("nav.settings")} className="rounded-full p-2">
          <Settings className="h-5 w-5" />
        </Link>
      </header>

      <main className="pb-28 md:ml-[72px] md:pb-10 lg:ml-[220px]">
        <div className="mx-auto w-full max-w-[1080px] px-5 py-6 md:px-8 md:py-10">{children}</div>
      </main>

      {!hideFab ? (
        <Link href="/ask" data-testid="fab-ask" className="fixed bottom-24 right-4 z-40 flex h-12 items-center rounded-full bg-brand px-4 text-white md:hidden">
          {t("nav.ask")}
        </Link>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-background px-2 py-2 md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="grid grid-cols-4 gap-1">
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} data-testid={`${item.testId}-mobile`} className={cn("nav-item flex min-h-11 flex-col items-center gap-1 rounded-[12px] py-2 text-[11px]", isActive(item.href) ? "text-brand-deep" : "text-ink-soft")}>
                <Icon className="h-5 w-5" />
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
