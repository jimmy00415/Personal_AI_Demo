"use client";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { EmergencyHelp } from "./EmergencyHelp";
export function HelpPage() {
  const { t } = useI18n();
  const active = useAppStore(s => s.activeEmergencyEpisodeId);
  if (active) return <EmergencyHelp />;
  return <section data-testid="help-recheck" className="mx-auto max-w-xl space-y-6 py-6"><h1 className="text-[28px]">{t("local.recheck")}</h1><p>{t("local.recheckBody")}</p><Link className="inline-flex min-h-11 items-center text-brand underline" href="/ask">{t("nav.ask")}</Link></section>;
}
