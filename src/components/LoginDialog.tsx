"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, HeartPulse, LockKeyhole, Mail, ShieldCheck, X } from "lucide-react";
import { useDemoAccount } from "@/lib/demo-account";
import { useI18n } from "@/lib/use-i18n";
import { Button } from "./system";

export function LoginDialog() {
  const { t } = useI18n();
  const close = useDemoAccount((s) => s.closeLogin);
  const signIn = useDemoAccount((s) => s.signIn);
  const ref = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    emailRef.current?.focus();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="login-title"
      aria-describedby="login-description"
      className="login-dialog"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
      }}
    >
      <div className="relative px-6 pb-7 pt-8 sm:px-9 sm:pt-9">
        <button type="button" aria-label={t("common.close")} onClick={close} className="absolute right-3 top-3 rounded-full p-2 text-ink-muted hover:bg-surface-secondary"><X className="h-5 w-5" /></button>
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand"><HeartPulse className="h-7 w-7" /></span>
        <p className="eyebrow text-brand">CAREMATE · {t("account.preview")}</p>
        <h2 id="login-title" className="mt-2 text-[28px] font-medium">{t("account.loginTitle")}</h2>
        <p id="login-description" className="mt-2 text-[14px] leading-relaxed text-ink-muted">{t("account.loginBody")}</p>

        <form className="mt-6 space-y-4" onSubmit={(event) => {
          event.preventDefault();
          setPassword("");
          signIn(email);
        }}>
          <div>
            <label htmlFor="login-email" className="mb-2 block text-[14px] font-medium">{t("account.email")}</label>
            <div className="relative">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-ink-soft" />
              <input ref={emailRef} id="login-email" type="email" required maxLength={254} autoComplete="off" placeholder="demo@caremate.hk" value={email} onChange={(event) => setEmail(event.target.value)} className="form-input pl-11" />
            </div>
          </div>
          <div>
            <label htmlFor="login-password" className="mb-2 block text-[14px] font-medium">{t("account.password")}</label>
            <div className="relative">
              <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-ink-soft" />
              <input id="login-password" type={visible ? "text" : "password"} required minLength={6} maxLength={128} autoComplete="off" aria-describedby="password-hint" placeholder={t("account.passwordHint")} value={password} onChange={(event) => setPassword(event.target.value)} className="form-input pl-11 pr-12" />
              <button type="button" aria-label={t(visible ? "account.hidePassword" : "account.showPassword")} aria-pressed={visible} onClick={() => setVisible((value) => !value)} className="absolute right-1 top-1 rounded-lg p-2.5 text-ink-muted">{visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
            </div>
            <p id="password-hint" className="mt-2 text-[12px] text-ink-muted">{t("account.passwordHint")}</p>
          </div>
          <Button type="submit" data-testid="login-submit" className="w-full">{t("account.submit")}</Button>
          <Button variant="secondary" className="w-full" onClick={() => { setEmail("demo@caremate.hk"); setPassword("demo1234"); }}>{t("account.fillDemo")}</Button>
        </form>

        <div className="mt-5 flex gap-2 rounded-xl bg-sky-soft p-3 text-[12px] leading-relaxed text-sky"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span>{t("account.demoNotice")}</span></div>
        <button type="button" onClick={close} className="mt-4 min-h-11 w-full text-[14px] text-ink-muted hover:text-brand">{t("account.guestContinue")}</button>
      </div>
    </dialog>
  );
}
