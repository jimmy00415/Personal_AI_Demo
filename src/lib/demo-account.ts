"use client";

import { create } from "zustand";

type DemoUser = { email: string; name: string };
const SESSION_KEY = "caremate-demo-account";

/** Presentation state only. No authentication token or password is accepted here. */
export const useDemoAccount = create<{
  user: DemoUser | null;
  loginOpen: boolean;
  hydrate: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  signIn: (email: string) => void;
  signOut: () => void;
}>((set) => ({
  user: null,
  loginOpen: false,
  hydrate: () => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
      if (saved && typeof saved === "object" && "email" in saved && typeof saved.email === "string") {
        const email = saved.email.trim().slice(0, 254);
        if (/^[^\s@]+@[^\s@]+$/.test(email)) {
          set({ user: { email, name: email.split("@")[0].slice(0, 24) } });
        }
      }
    } catch {
      // A blocked or unavailable browser store still allows an in-memory preview.
    }
  },
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
  signIn: (email) => {
    const normalized = email.trim().slice(0, 254);
    const user = { email: normalized, name: normalized.split("@")[0].slice(0, 24) };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {
      // The preview can still be used when session storage is unavailable.
    }
    set({ user, loginOpen: false });
  },
  signOut: () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Keep the visible account state usable without browser storage.
    }
    set({ user: null, loginOpen: false });
  },
}));
