"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useDemoAccount } from "@/lib/demo-account";
import { APP_ROLES, isAppRole, roleLabel } from "@/lib/roles";
import { useI18n } from "@/lib/use-i18n";

export function RoleSwitcher({ testId = "role-switcher" }: { testId?: string }) {
  const role = useDemoAccount((state) => state.role);
  const setRole = useDemoAccount((state) => state.setRole);
  const { locale } = useI18n();
  const router = useRouter();
  return (
    <label className="role-switcher">
      <span className="text-xs text-ink-muted">{locale === "en" ? "View as" : "檢視角色"}</span>
      <select
        data-testid={testId}
        value={role}
        aria-label={locale === "en" ? "Choose your role" : "選擇你的角色"}
        onChange={(event) => {
          if (!isAppRole(event.target.value)) return;
          setRole(event.target.value);
          router.push("/");
        }}
      >
        {APP_ROLES.map((item) => <option key={item} value={item}>{roleLabel(item, locale)}</option>)}
      </select>
      <ChevronDown className="pointer-events-none h-4 w-4 shrink-0" aria-hidden />
    </label>
  );
}
