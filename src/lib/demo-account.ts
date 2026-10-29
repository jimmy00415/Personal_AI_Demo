"use client";

import { create } from "zustand";
import { isAppRole, type AppRole } from "./roles";

type DemoUser = { email: string; name: string; role: AppRole };
const SESSION_KEY = "caremate-demo-account";
const ROLE_KEY = "caremate-preview-role";

function saveRole(role: AppRole) {
  try { sessionStorage.setItem(ROLE_KEY, role); } catch { /* In-memory preview remains usable. */ }
}

/** Presentation state only. No authentication token or password is accepted here. */
export const useDemoAccount = create<{
  user: DemoUser | null;
  role: AppRole;
  loginOpen: boolean;
  hydrate: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  signIn: (email: string, role?: AppRole) => void;
  setRole: (role: AppRole) => void;
  signOut: () => void;
}>((set) => ({
  user: null,
  role: "patient",
  loginOpen: false,
  hydrate: () => {
    try {
      const preview = sessionStorage.getItem(ROLE_KEY);
      if (isAppRole(preview)) set({ role: preview });
      const saved: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
      if (saved && typeof saved === "object" && "email" in saved && typeof saved.email === "string") {
        const email = saved.email.trim().slice(0, 254);
        if (/^[^\s@]+@[^\s@]+$/.test(email)) {
          const role = "role" in saved && isAppRole(saved.role) ? saved.role : "patient";
          set({ user: { email, name: email.split("@")[0].slice(0, 24), role }, role });
        }
      }
    } catch {
      // A blocked or unavailable browser store still allows an in-memory preview.
    }
  },
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
  signIn: (email, role = "patient") => {
    const normalized = email.trim().slice(0, 254);
    const user = { email: normalized, name: normalized.split("@")[0].slice(0, 24), role };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {
      // The preview can still be used when session storage is unavailable.
    }
    saveRole(role);
    set({ user, role, loginOpen: false });
  },
  setRole: (role) => {
    if (!isAppRole(role)) return;
    set((state) => {
      const user = state.user ? { ...state.user, role } : null;
      try { if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch { /* Session-only UI. */ }
      return { role, user };
    });
    saveRole(role);
  },
  signOut: () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(ROLE_KEY);
    } catch {
      // Keep the visible account state usable without browser storage.
    }
    set({ user: null, role: "patient", loginOpen: false });
  },
}));
