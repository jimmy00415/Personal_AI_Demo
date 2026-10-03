import { CheckInPage } from "@/features/check-in/CheckInPage";
import { Suspense } from "react";

export default function Page() { return <Suspense fallback={null}><CheckInPage /></Suspense>; }
