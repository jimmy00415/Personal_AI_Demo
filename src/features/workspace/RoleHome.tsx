"use client";

import { useDemoAccount } from "@/lib/demo-account";
import { TodayPage } from "@/features/today/TodayPage";
import { SupporterHome } from "./WorkspacePages";

export function RoleHome() {
  const role = useDemoAccount((s) => s.role);
  return role === "patient" ? <TodayPage /> : <SupporterHome role={role} />;
}
