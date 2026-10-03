"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { selectPatientEvents } from "@/lib/demo/selectors";
import { SharedView } from "@/features/sharing/SharingPreview";
import { EventDetail } from "./EventDetail";

export function NotificationsPage() {
  const demo = useAppStore(s => s.demo);
  const router = useRouter();
  const eventId = useSearchParams().get("event");
  const { t } = useI18n();
  if (demo.context.actorId === "david") return <SharedView />;
  const events = selectPatientEvents(demo);
  return <div className="mx-auto max-w-3xl space-y-6" data-testid="notifications-page"><h1 className="text-3xl">{t("events.title")}</h1><p>{t("events.local")}</p>
    {eventId ? <EventDetail key={eventId} eventId={eventId} onBack={() => router.push("/notifications")} /> : <>
      {!events.length ? <p>{t("events.empty")}</p> : null}
      {events.map(e => <article key={e.id} data-testid={`event-row-${e.id}`} className="space-y-3 rounded-xl border border-line p-4"><p>{t("sharing.neutral")}</p><p>{t(`events.${e.status}`)}</p><Button data-testid={`event-open-${e.id}`} onClick={() => router.push(`/notifications?event=${encodeURIComponent(e.id)}`)}>{t("events.open")}</Button></article>)}
    </>}
  </div>;
}
