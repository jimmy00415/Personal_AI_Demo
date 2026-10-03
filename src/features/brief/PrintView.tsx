"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { briefToText, prepareBriefExport } from "@/lib/demo/brief";
import { Button } from "@/components/system";

export function PrintView() { return <Suspense fallback={null}><CurrentPrintView /></Suspense>; }
function CurrentPrintView() {
  const { locale, t } = useI18n();
  const demo = useAppStore(s => s.demo);
  const id = useSearchParams().get("brief") ?? demo.briefs.filter(b => b.recipientId === demo.context.actorId).at(-1)?.id;
  const result = id ? prepareBriefExport(demo, id) : null;
  return <main className="mx-auto max-w-[720px] bg-white px-8 py-10 text-black" data-testid="print-view">
    <div className="no-print mb-6 space-y-3"><h1>{t("packet.preview")}</h1><p>{t("brief.printNote")}</p><Link className="inline-flex min-h-11 items-center text-brand" href="/brief">{t("report.back")}</Link>{result?.ok ? <Button onClick={() => { const latest = useAppStore.getState().prepareBriefExport(id!); if (latest.ok) window.print(); }}>{t("packet.openPrint")}</Button> : null}</div>
    {result?.ok ? <pre data-testid="print-packet" className="font-sans text-[15px] leading-relaxed whitespace-pre-wrap">{briefToText(result.value, locale)}</pre> : <p>{t(!demo.appointments.some(a => a.status === "scheduled") ? "book.noScheduled" : result && !result.ok && result.code === "sharing-unavailable" ? "packet.unavailable" : "packet.reviewRequired")}</p>}
  </main>;
}
