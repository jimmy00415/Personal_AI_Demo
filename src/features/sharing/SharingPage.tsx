"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/system";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/use-i18n";
import { recipients, shareCategories, sharingLevels, setConsent, selectSharingProjection } from "@/lib/demo/sharing";
import type { RecipientId, ShareCategory, SharingLevel } from "@/lib/demo/types";
import { SharingPreview } from "./SharingPreview";

export function SharingPage() {
  const { t } = useI18n();
  const [recipient, setRecipient] = useState<RecipientId>("david");
  const demo = useAppStore(s => s.demo);
  if (demo.context.actorId !== "may") return <div data-testid="sharing-readonly" className="space-y-6"><h1 className="text-3xl">{t("sharing.title")}</h1><p>{t("sharing.readonly")}</p><SharingPreview projection={selectSharingProjection(demo, demo.context.patientId, "david")} /></div>;
  return <div data-testid="sharing-page" className="mx-auto max-w-3xl space-y-6"><Link href="/family" className="inline-flex min-h-11 items-center">← {t("sharing.family")}</Link><h1 className="text-3xl">{t("sharing.title")}</h1><p>{t("sharing.local")}</p><fieldset><legend className="mb-3">{t("sharing.recipient")}</legend><div className="flex flex-wrap gap-3">{recipients.map(id => <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2"><input type="radio" name="recipient" data-testid={`recipient-${id}`} checked={recipient === id} onChange={() => setRecipient(id)} />{t(`sharing.${id}`)}</label>)}</div></fieldset><ConsentEditor key={recipient} recipientId={recipient} /></div>;
}
function ConsentEditor({ recipientId }: { recipientId: RecipientId }) {
  const { t } = useI18n();
  const demo = useAppStore(s => s.demo);
  const current = selectSharingProjection(demo, demo.context.patientId, recipientId);
  const [level, setLevel] = useState<SharingLevel>(current.level ?? "alerts-only");
  const [categories, setCategories] = useState<ShareCategory[]>(current.categories);
  const [review, setReview] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [receipt, setReceipt] = useState("");
  const input = { patientId: demo.context.patientId, recipientId, level, categories };
  const previewState = setConsent(demo, input);
  const grant = demo.grants.find(g => g.patientId === demo.context.patientId && g.recipientId === recipientId);
  return <div className="space-y-6">
    <h2 className="text-xl">{t(`sharing.${recipientId}`)}</h2>
    {review && previewState.ok ? <section className="space-y-4" data-testid="sharing-review-panel"><h2>{t("sharing.preview")}</h2><SharingPreview projection={selectSharingProjection(previewState.value, demo.context.patientId, recipientId)} /><Button data-testid="sharing-confirm" onClick={() => { const result = useAppStore.getState().setConsent(input); setReceipt(t(result.ok ? "sharing.updated" : "sharing.unavailable")); setReview(false); }}>{t("sharing.confirm")}</Button><Button variant="secondary" onClick={() => setReview(false)}>{t("sharing.back")}</Button></section> : <>
      <fieldset className="space-y-2"><legend>{t("sharing.title")}</legend>{sharingLevels.map(value => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3"><input type="radio" name="sharing-level" data-testid={`level-${value}`} checked={level === value} onChange={() => { setLevel(value); setReceipt(""); }} />{t(`sharing.${value}`)}</label>)}</fieldset>
      <fieldset className="space-y-2"><legend>{t("sharing.categories")}</legend>{shareCategories.map(category => <label key={category} className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" data-testid={`category-${category}`} checked={categories.includes(category)} onChange={e => { setCategories(e.target.checked ? [...categories, category] : categories.filter(c => c !== category)); setReceipt(""); }} />{t(`sharing.${category}`)}</label>)}</fieldset>
      <p>{t("sharing.notePolicy")}</p><Button data-testid="sharing-review" disabled={!categories.length} onClick={() => setReview(true)}>{t("sharing.review")}</Button>
      <SharingPreview projection={current} interactive />
    </>}
    {grant?.status === "active" && !revoking ? <Button variant="secondary" data-testid="sharing-revoke" onClick={() => { setRevoking(true); setReview(false); }}>{t("sharing.revoke")}</Button> : null}
    {revoking && grant ? <div className="space-y-3"><p>{t("sharing.revokeExplain")}</p><Button data-testid="revoke-confirm" onClick={() => { const result = useAppStore.getState().revokeConsent(grant.id); setReceipt(t(result.ok ? "sharing.updated" : "sharing.unavailable")); setRevoking(false); }}>{t("sharing.revokeConfirm")}</Button><Button variant="secondary" onClick={() => setRevoking(false)}>{t("sharing.cancel")}</Button></div> : null}
    {receipt ? <p role="status">{receipt}</p> : null}<p className="text-sm">{t("sharing.revokeExplain")}</p>
  </div>;
}
