import { Suspense } from "react";
import { CarePage } from "@/features/care/CarePage";
export default function Page() { return <Suspense fallback={null}><CarePage /></Suspense>; }
