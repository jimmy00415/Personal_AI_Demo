"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { briefText } from "@/lib/selectors";

export function PrintView() {
  const { locale } = useI18n();
  const text = briefText(useAppStore.getState(), locale);

  useEffect(() => {
    if (navigator.webdriver) return;
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <main className="mx-auto max-w-[720px] bg-white px-8 py-10 text-black" data-testid="print-view">
      <pre className="font-sans text-[15px] leading-relaxed whitespace-pre-wrap">{text}</pre>
    </main>
  );
}
