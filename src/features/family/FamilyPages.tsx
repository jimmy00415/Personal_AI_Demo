"use client";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { recipients } from "@/lib/demo/sharing";
import { SharedView } from "@/features/sharing/SharingPreview";
export function FamilyPage() {
  const { t } = useI18n();
  const actorId = useAppStore(s => s.demo.context.actorId);
  if (actorId === "david") return <SharedView />;
  return <div className="mx-auto max-w-3xl space-y-6" data-testid="family-page"><h1 className="text-3xl">{t("sharing.family")}</h1><p>{t("sharing.identity")}</p><p>{t("sharing.local")}</p>{recipients.map(id => <p key={id}>{t(`sharing.${id}`)}</p>)}<Link href="/sharing" data-testid="sharing-manage" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-white">{t("sharing.title")}</Link><p><Link href="/notifications" className="inline-flex min-h-11 items-center text-brand">{t("events.title")}</Link></p></div>;
}
export function MotherProfilePage() { return <FamilyPage />; }
