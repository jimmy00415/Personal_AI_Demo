"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HeartPulse, Home, Settings, Users, ListTodo, LogIn, UserRound, Sparkles, Share2, Bell, LayoutDashboard, ClipboardCheck, ShieldCheck, ArrowUpRight } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { samePath, shellLayout } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { ToastHost } from "./system";
import { LoginDialog } from "./LoginDialog";
import { useDemoAccount } from "@/lib/demo-account";
import { ROLE_META } from "@/lib/roles";
import { useCareWorkspace } from "@/lib/care-workspace";
import { RoleSwitcher } from "./RoleSwitcher";

const patientRoutes = ["/ask", "/health", "/care", "/family", "/brief", "/book", "/report", "/print", "/memory", "/visit", "/journey", "/plan", "/medications", "/records", "/care-team", "/sharing"];

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
  const user = useDemoAccount((s) => s.user);
  const loginOpen = useDemoAccount((s) => s.loginOpen);
  const openLogin = useDemoAccount((s) => s.openLogin);
  const hydrateAccount = useDemoAccount((s) => s.hydrate);
  const role = useDemoAccount((s) => s.role);
  const hydrateWorkspace = useCareWorkspace((s) => s.hydrate);
  const lang = locale === "en" ? "en" : "zh";
  const primary = role === "patient" ? [
    { href: "/", label: t("nav.today"), icon: Home, testId: "nav-today" },
    { href: "/health", label: t("nav.health"), icon: HeartPulse, testId: "nav-health" },
    { href: "/care", label: t("nav.follow"), icon: ListTodo, testId: "nav-care" },
    { href: "/sharing", label: locale === "en" ? "Health sharing" : "健康共享", icon: Share2, testId: "nav-sharing" },
  ] : [
    { href: "/", label: locale === "en" ? "Overview" : "照護總覽", icon: LayoutDashboard, testId: "nav-today" },
    { href: "/shared", label: locale === "en" ? "Shared health" : "共享健康", icon: Users, testId: "nav-shared" },
    { href: "/alerts", label: locale === "en" ? "Attention alerts" : "異常提醒", icon: Bell, testId: "nav-alerts" },
    role === "caregiver"
      ? { href: "/checklist", label: locale === "en" ? "Care checklist" : "照護清單", icon: ClipboardCheck, testId: "nav-checklist" }
      : { href: "/settings", label: t("nav.settings"), icon: Settings, testId: "nav-settings" },
  ];

  useEffect(() => {
    hydrate();
    hydrateAccount();
    hydrateWorkspace();
  }, [hydrate, hydrateAccount, hydrateWorkspace]);

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
    ...(role === "patient" ? [
      { href: "/memory", label: t("nav.memory"), testId: "link-memory" },
      { href: "/brief", label: t("nav.brief"), testId: "link-visit" },
      { href: "/book", label: t("today.book"), testId: "link-book" },
      { href: "/family", label: locale === "en" ? "Shared with me" : "家人分享給我的資料", testId: "nav-family" },
    ] : []),
    { href: "/about", label: t("nav.about"), testId: "link-privacy" },
    { href: "/settings", label: t("nav.settings"), testId: "link-settings" },
  ];

  const blocked = role !== "patient" && patientRoutes.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const { isActive, hideChrome, hideFab, showAskLink, bare } = shellLayout(pathname, role === "patient" && emergency);

  if (!hydrated) {
    return <div className="min-h-dvh bg-background" />;
  }

  if (hideChrome && !blocked) {
    return (
      <div className="min-h-dvh bg-background">
        <ToastHost />
        <div className={bare ? "" : "mx-auto max-w-2xl px-6 py-10"}>{children}</div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-dvh bg-background" data-role={role}>
      <ToastHost />
      {loginOpen ? <LoginDialog /> : null}
      <aside className="sidebar fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col px-2 py-7 md:flex lg:w-[232px] lg:px-4">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-brand text-white"><HeartPulse className="h-6 w-6" /></span>
          <span className="hidden lg:block"><span className="block text-xl font-medium text-ink">{t("product.name")}</span><span className="block text-[0.625rem] tracking-[0.16em] text-ink-muted">CAREMATE HK</span></span>
        </Link>
        <p className="eyebrow mb-4 hidden px-3 text-ink-muted lg:block">{ROLE_META[role].short[lang]}</p>
        <nav className="flex flex-1 flex-col gap-1">
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testId}
                aria-label={item.label}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn("shell-nav nav-item flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-[0.9375rem]", isActive(item.href) ? "is-active" : "text-ink-muted hover:bg-surface-secondary")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
          {role !== "patient" || !showAskLink ? null : (
            <>
              <div className="my-4 mx-2 h-px bg-line" />
              <Link
                href="/ask"
                data-testid="nav-ask"
                className="nav-item flex min-h-12 items-center gap-3 rounded-[12px] px-3 text-[0.9375rem] text-brand hover:bg-brand-soft"
              >
                <span className="flex h-4 w-4 items-center justify-center text-[0.8125rem]">✦</span>
                <span className="hidden lg:inline">{t("nav.ask")}</span>
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-support mb-5 hidden rounded-2xl p-4 lg:block">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          <p className="mt-3 text-sm font-medium">{locale === "en" ? "Care, with permission" : "安心照護，由你掌握"}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">{locale === "en" ? "Shared records are controlled by the person receiving care." : "健康資料由患者決定分享範圍，隨時可以調整。"}</p>
        </div>
        <div className="relative px-1">
          <button type="button" data-testid="profile-menu-btn" aria-expanded={menuOpen} aria-label={locale === "en" ? "Account and settings menu" : "帳戶與設定選單"} onClick={() => setMenuOpen((v) => !v)} className="flex min-h-12 w-full items-center gap-2 rounded-[14px] border border-line px-2 text-left hover:bg-surface-secondary">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><UserRound className="h-4 w-4" /></span>
            <span className="hidden min-w-0 lg:block"><span className="block truncate text-[0.8125rem]">{user?.name ?? t("account.guest")}</span><span className="block text-[0.625rem] text-ink-muted">{t("nav.settings")}</span></span>
          </button>
          {menuOpen ? (
            <div className="absolute bottom-14 left-0 z-40 w-56 rounded-[16px] border border-line bg-surface p-2 text-ink shadow-[0_8px_28px_rgba(23,26,24,0.12)]" data-testid="profile-menu">
              {secondary.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={item.testId}
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(item.href);
                  }}
                  className="block rounded-[10px] px-3 py-2 text-[0.8125rem] hover:bg-surface-secondary"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 flex gap-1">
                <button type="button" className={cn("flex-1 rounded-[8px] px-2 py-1.5 text-[0.75rem]", locale === "zh-HK" ? "bg-brand text-white" : "bg-surface-secondary")} onClick={() => setLocale("zh-HK")}>
                  {t("lang.zh")}
                </button>
                <button type="button" data-testid="lang-en" className={cn("flex-1 rounded-[8px] px-2 py-1.5 text-[0.75rem]", locale === "en" ? "bg-brand text-white" : "bg-surface-secondary")} onClick={() => setLocale("en")}>
                  {t("lang.en")}
                </button>
              </div>
              <button type="button" data-testid="lite-toggle" className="mt-1 w-full rounded-[10px] px-3 py-2 text-left text-[0.8125rem]" onClick={() => setLiteMode(!liteMode)}>
                {liteMode ? t("lite.on") : t("lite.off")}
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <header className="shell-header sticky top-0 z-20 flex min-h-[88px] flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/95 px-5 py-3 backdrop-blur-md md:ml-[72px] md:px-8 lg:ml-[232px]">
        <Link href="/" className="flex items-center gap-2 text-[1rem] font-medium text-brand-deep md:hidden"><HeartPulse className="h-5 w-5" />{t("product.name")}</Link>
        <div className="hidden items-center gap-2 text-sm text-ink-muted md:flex"><Sparkles className="h-4 w-4 text-brand" />{ROLE_META[role].short[lang]}</div>
        <div className="role-switcher-wrap order-3 w-full md:order-none md:ml-auto md:w-auto"><RoleSwitcher /></div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <button type="button" data-testid="account-button" onClick={() => user ? router.push("/settings") : openLogin()} className="inline-flex min-h-11 min-w-0 max-w-[200px] items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-4 text-[0.875rem] font-medium text-brand-deep hover:bg-brand hover:text-white">
            {user ? <UserRound className="h-4 w-4 shrink-0" /> : <LogIn className="h-4 w-4 shrink-0" />}<span className="truncate">{user?.name ?? t("account.login")}</span>
          </button>
          <Link href="/settings" aria-label={t("nav.settings")} className="shrink-0 rounded-full p-3 text-ink-muted hover:bg-surface-secondary"><Settings className="h-5 w-5" /></Link>
        </div>
      </header>

      <main className="pb-28 md:ml-[72px] md:pb-10 lg:ml-[232px]">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-6 md:px-8 md:py-8">
          <div data-testid="demo-data-notice" className="mb-7 flex gap-3 rounded-2xl border border-sky/15 bg-sky-soft px-4 py-3 text-sky">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky" />
            <div><p className="text-[0.75rem] font-medium">{t("account.dataNotice")}</p><p className="mt-0.5 text-[0.75rem] leading-relaxed">{t("account.dataBody")}</p></div>
          </div>
          {blocked ? (
            <section className="panel mx-auto max-w-2xl" data-testid="role-route-notice">
              <ShieldCheck className="h-8 w-8 text-violet" aria-hidden />
              <h1 className="title-1 mt-5">{locale === "en" ? "Your care workspace" : "這是患者的個人照護頁面"}</h1>
              <p className="mt-4 text-ink-muted">{locale === "en" ? "Use Shared health to view the records this person has chosen to share with your role." : "家人與照護者請到共享健康，查看患者已授權的資料。選擇角色是介面示範，不會授予真實資料權限。"}</p>
              <Link href="/shared" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-5 text-white">{locale === "en" ? "Open shared health" : "查看共享健康"}<ArrowUpRight className="h-4 w-4" /></Link>
            </section>
          ) : children}
        </div>
      </main>

      {role === "patient" && !hideFab ? (
        <Link href="/ask" data-testid="fab-ask" className="fixed bottom-24 right-4 z-40 flex h-12 items-center rounded-full bg-brand px-4 text-white md:hidden">
          {t("nav.ask")}
        </Link>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-background px-2 py-2 md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="grid grid-cols-4 gap-1">
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} data-testid={`${item.testId}-mobile`} aria-current={isActive(item.href) ? "page" : undefined} className={cn("mobile-nav-item nav-item flex min-h-11 flex-col items-center gap-1 rounded-[12px] px-1 py-2 text-center text-[0.6875rem]", isActive(item.href) ? "is-active" : "text-ink-soft")}>
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
