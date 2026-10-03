import { CarePage } from "@/features/care/CarePage";
import { Suspense } from "react";

export default function Page() {
  return <Suspense fallback={null}><CarePage /></Suspense>;
}
