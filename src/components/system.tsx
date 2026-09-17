"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { SourceClass } from "@/lib/types";
import { useI18n } from "@/lib/use-i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

export function PageHeader({
  title,
  subtitle,
  kicker,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {kicker ? <div className="mb-3 text-[12px] text-ink-soft">{kicker}</div> : null}
      <h1 className="title-1">{title}</h1>
      {subtitle ? <p className="measure mt-2 text-[15px] text-ink-muted">{subtitle}</p> : null}
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-[13px] font-medium uppercase tracking-[0.06em] text-ink-soft">
      {children}
    </h2>
  );
}

export function GroupedList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grouped", className)}>{children}</div>;
}

export function ListRow({
  title,
  meta,
  value,
  onClick,
  trailing,
  faded,
  testId,
}: {
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  trailing?: ReactNode;
  faded?: boolean;
  testId?: string;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] text-ink">{title}</div>
        {meta ? <div className="mt-0.5 text-[13px] text-ink-muted">{meta}</div> : null}
      </div>
      {value ? <div className="shrink-0 text-right text-[15px] text-ink-muted">{value}</div> : null}
      {trailing}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
    faded && "opacity-50",
    onClick && "hover:bg-surface-secondary",
  );
  if (onClick) {
    return (
      <button type="button" data-testid={testId} onClick={onClick} className={cls}>
        {inner}
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
      </button>
    );
  }
  return (
    <div data-testid={testId} className={cls}>
      {inner}
    </div>
  );
}

export function SourceLabel({ source }: { source: SourceClass }) {
  const { t } = useI18n();
  const label =
    source === "home-measure"
      ? t("source.home")
      : source === "imported"
        ? t("source.imported")
        : source === "organised"
          ? t("source.organised")
          : t("source.user");
  return <span className="text-[12px] text-ink-soft">{label}</span>;
}

export function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "critical" | "plain";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[15px] transition-colors disabled:opacity-40",
        variant === "primary" && "bg-brand text-white hover:bg-brand-deep",
        variant === "secondary" && "bg-surface-secondary text-ink hover:bg-line",
        variant === "ghost" && "text-brand hover:bg-brand-soft",
        variant === "critical" && "bg-critical text-white hover:bg-[#931c12]",
        variant === "plain" && "text-ink-muted hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  side = "right",
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: "right" | "bottom";
  children: ReactNode;
  testId?: string;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" data-testid={testId}>
          <motion.button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={side === "right" ? { x: 24, opacity: 0 } : { y: 32, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={side === "right" ? { x: 16, opacity: 0 } : { y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className={cn(
              "absolute flex max-h-[92vh] flex-col bg-background",
              side === "right"
                ? "inset-y-0 right-0 w-full max-w-[400px] border-l border-line"
                : "inset-x-0 bottom-0 rounded-t-[24px] border-t border-line",
            )}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div id={titleId} className="headline">
                {title}
              </div>
              <button ref={closeRef} type="button" onClick={onClose} className="rounded-full p-2 text-ink-muted" aria-label={t("common.close")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8">{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function ToastHost() {
  const toast = useAppStore((s) => s.toast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-[70] flex justify-center px-4">
      <AnimatePresence>
        {toast ? (
          <motion.div
            data-testid="toast"
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            className="rounded-full bg-ink px-4 py-2 text-sm text-white"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DemoMark() {
  return null;
}
