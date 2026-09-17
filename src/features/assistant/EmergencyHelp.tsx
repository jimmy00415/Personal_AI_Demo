"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/use-i18n";

export function EmergencyHelp() {
  const { t } = useI18n();
  const [how, setHow] = useState(false);

  return (
    <div className="mx-auto max-w-xl py-6" data-testid="chat-page">
      <section data-testid="emergency-state" className="min-h-[70vh]">
        <h1 className="text-[32px] leading-tight text-critical">{t("em.title")}</h1>
        <p className="measure mt-6 text-[20px] leading-relaxed">{t("em.body")}</p>
        <p className="mt-8 text-[48px] font-medium text-critical" data-testid="call-999">
          {t("em.call")}
        </p>
        <p className="mt-2 text-[15px] text-ink-muted">{t("em.noCall")}</p>
        <button
          type="button"
          data-testid="em-how"
          className="mt-8 text-[15px] text-brand"
          onClick={() => setHow((open) => !open)}
        >
          {t("em.how")}
        </button>
        {how ? (
          <p className="measure mt-3 text-ink-muted" data-testid="em-how-body">
            {t("em.howBody")}
          </p>
        ) : null}
        <div className="mt-10">
          <Link href="/" data-testid="em-back" className="inline-flex min-h-12 items-center text-[15px] text-ink-muted">
            {t("em.back")}
          </Link>
        </div>
      </section>
    </div>
  );
}
