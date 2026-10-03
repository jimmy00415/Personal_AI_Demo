import { Suspense } from "react";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";

export default function Page() { return <Suspense fallback={null}><NotificationsPage /></Suspense>; }
