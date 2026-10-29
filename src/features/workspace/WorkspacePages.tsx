"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, CheckCheck,
  CheckSquare, ClipboardList, HeartHandshake, HeartPulse, LockKeyhole,
  MessageCircle, Pill, RotateCcw, ShieldCheck, Users, type LucideIcon,
} from "lucide-react";
import { SourceLabel } from "@/components/system";
import {
  selectCareChecklist, selectSharedHealth, selectWorkspaceAlerts, useCareWorkspace,
  type WorkspaceAlert, type WorkspaceScope,
} from "@/lib/care-workspace";
import { formatDate, formatDateTime, formatShortDate } from "@/lib/clock";
import { useDemoAccount } from "@/lib/demo-account";
import { roleLabel, type SupporterRole } from "@/lib/roles";
import { useAppStore } from "@/lib/store";
import type { BpReading } from "@/lib/types";
import { useI18n } from "@/lib/use-i18n";

const roleLink = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--role-accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90";
const quietLink = "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[color:var(--role-accent)] transition-colors hover:bg-[var(--role-soft)]";

function IconBadge({ icon: Icon, className = "" }: { icon: LucideIcon; className?: string }) {
  return <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--role-soft)] text-[color:var(--role-accent)] ${className}`}><Icon className="h-5 w-5" aria-hidden /></span>;
}

function WorkspaceHeader({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: LucideIcon; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <div className="mb-4 flex items-center gap-3"><IconBadge icon={Icon} /><p className="eyebrow text-[color:var(--role-accent)]">CareMate · {title}</p></div>
        <h1 className="title-1">{title}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-muted">{subtitle}</p>
      </div>
      {children}
    </header>
  );
}

function LocalPreviewNote() {
  const { locale } = useI18n();
  return <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-ink-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{locale === "en" ? "Sample information on this device. Viewing an alert or checking a care task does not contact anyone or confirm that a health concern is resolved." : "此裝置上的示範資料。查看提醒或勾選照護事項，不會聯絡任何人，也不代表健康問題已解決。"}</span></p>;
}

function RoleBoundary({ checklist = false, sharing = false }: { checklist?: boolean; sharing?: boolean }) {
  const { locale } = useI18n();
  return (
    <section data-testid="role-boundary" className="panel mx-auto max-w-2xl">
      <IconBadge icon={ShieldCheck} />
      <h1 className="mt-5 text-2xl font-semibold">{locale === "en" ? (checklist ? "A workspace for caregivers" : sharing ? "Sharing stays in the patient’s hands" : "A workspace for your care supporters") : (checklist ? "照護者的專屬清單" : sharing ? "共享權限由本人管理" : "家人與照護者的共享工作台")}</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">{locale === "en" ? (checklist ? "The care checklist belongs to the caregiver preview. Your current role has its own overview and permitted shared information." : sharing ? "Michelle decides which health information to share. You can view the information already shared with your current role." : "Your own health records and sharing controls are in the patient workspace. Choose a family or caregiver preview to explore information shared with them.") : (checklist ? "照護清單只在照護者模式提供。你可以返回目前角色的總覽，查看已獲分享的資料。" : sharing ? "Michelle 決定分享哪些健康資料。你可以查看已與目前角色共享的內容。" : "你自己的健康紀錄和共享設定在個人照護工作台。選擇家人或照護者模式，即可查看與他們共享的資料。")}</p>
      <Link href="/" className={`${roleLink} mt-5`}>{locale === "en" ? "Back to my overview" : "返回我的總覽"}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </section>
  );
}

function SharingUnavailable({ alerts = false }: { alerts?: boolean }) {
  const { locale } = useI18n();
  return (
    <div className="panel flex items-start gap-4" data-testid="sharing-unavailable">
      <IconBadge icon={LockKeyhole} />
      <div>
        <h2 className="text-lg font-semibold">{locale === "en" ? (alerts ? "No shared alerts to display" : "No shared health information to display") : (alerts ? "目前沒有可顯示的共享提醒" : "目前沒有可顯示的共享健康資料")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{locale === "en" ? "Michelle controls what is shared. When sharing is paused or a category is turned off, its information stays out of this workspace." : "共享內容由 Michelle 管理。暫停共享或關閉某個類別後，相關資料就不會顯示在這個工作台。"}</p>
      </div>
    </div>
  );
}

function PatientIdentity({ hasAccess }: { hasAccess: boolean }) {
  const { locale } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--role-soft)] text-lg font-semibold text-[color:var(--role-accent)]" aria-hidden>MC</span><div><p className="text-lg font-semibold">{locale === "en" ? "Michelle Chan" : "陳美玲 Michelle"}</p><p className="mt-1 text-sm text-ink-muted">{locale === "en" ? "Shared-care sample profile" : "共享照護示範檔案"}</p></div></div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${hasAccess ? "bg-brand-soft text-brand" : "bg-surface-secondary text-ink-muted"}`}><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{locale === "en" ? (hasAccess ? "Shared by Michelle" : "Sharing paused") : (hasAccess ? "由 Michelle 共享" : "共享已暫停")}</span>
    </div>
  );
}

function SharedTrend({ readings }: { readings: BpReading[] }) {
  const { locale } = useI18n();
  if (readings.length < 2) return null;
  const values = readings.map((reading) => reading.systolic);
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const points = values.map((value, index) => ({ x: 10 + index / (values.length - 1) * 480, y: 100 - (value - min) / (max - min) * 84 }));
  const line = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const first = readings[0];
  const last = readings[readings.length - 1];
  return (
    <figure className="mt-5 rounded-2xl bg-[var(--role-soft)] p-4">
      <figcaption className="text-xs font-medium text-[color:var(--role-accent)]">{locale === "en" ? "Systolic trend · home measurements" : "收縮壓走勢 · 家居量度"}</figcaption>
      <svg viewBox="0 0 500 120" role="img" aria-label={locale === "en" ? `Systolic readings from ${first.systolic} to ${last.systolic} mmHg` : `收縮壓由 ${first.systolic} 至 ${last.systolic} mmHg`} className="mt-3 h-28 w-full overflow-visible text-[color:var(--role-accent)]">
        {[28, 65, 102].map((y) => <line key={y} x1="10" y1={y} x2="490" y2={y} stroke="currentColor" opacity="0.15" strokeDasharray="4 5" />)}
        <polygon points={`10,116 ${line} 490,116`} fill="currentColor" opacity="0.07" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(({ x, y }, index) => <circle key={readings[index].id} cx={x} cy={y} r="3.5" fill="currentColor" stroke="white" strokeWidth="2" />)}
      </svg>
      <div className="mt-1 flex justify-between gap-3 text-xs text-ink-muted"><span>{formatShortDate(first.occurredAt, locale)}</span><span>{formatShortDate(last.occurredAt, locale)}</span></div>
    </figure>
  );
}

function SharedHealthCards({ role, compact = false }: { role: SupporterRole; compact?: boolean }) {
  const { locale, L } = useI18n();
  const workspace = useCareWorkspace();
  const app = useAppStore();
  const shared = selectSharedHealth(workspace, app, role);
  const latest = shared.bp[shared.bp.length - 1];
  const caregiverPreview = compact && role === "caregiver";
  if (!shared.hasAccess || (!latest && !shared.symptom && !shared.appointment && shared.medications.length === 0)) return <SharingUnavailable />;
  if (caregiverPreview && !latest && !shared.symptom) return <section className="panel"><IconBadge icon={ShieldCheck} /><h2 className="mt-4 text-lg font-semibold">{locale === "en" ? "View the information shared with you" : "查看已與你共享的資料"}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{locale === "en" ? "The full shared-health page shows the categories Michelle has made available." : "完整共享健康頁面會顯示 Michelle 已向你開放的資料類別。"}</p><Link href="/shared" className={`${quietLink} mt-4 -ml-3`}>{locale === "en" ? "All shared information" : "查看全部共享資料"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link></section>;
  return (
    <div className={`grid min-w-0 gap-4 ${caregiverPreview ? "grid-cols-1" : "md:grid-cols-2"}`}>
      {latest ? (
        <section id="shared-bp" data-testid="shared-bp" className="panel min-w-0 scroll-mt-24">
          <div className="flex items-center gap-3"><IconBadge icon={HeartPulse} /><h2 className="text-base font-semibold">{locale === "en" ? "Latest blood pressure" : "最近血壓"}</h2></div>
          <p className="mt-5 text-4xl font-semibold tracking-tight text-[color:var(--role-accent)]">{latest.systolic}<span className="mx-1 text-2xl font-normal opacity-50">/</span>{latest.diastolic}<span className="ml-2 text-sm font-normal tracking-normal text-ink-muted">mmHg</span></p>
          <p className="mt-2 text-xs text-ink-muted">{formatDateTime(latest.occurredAt, locale)} · <SourceLabel source="home-measure" /></p>
          {!compact ? <SharedTrend readings={shared.bp} /> : null}
          {compact ? <Link href="/shared/#shared-bp" className={`${quietLink} mt-4 -ml-3`}>{locale === "en" ? "View shared readings" : "查看共享讀數"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link> : <p className="mt-4 text-xs leading-relaxed text-ink-muted">{locale === "en" ? "Saved measurements are shown as recorded. A trend is not a diagnosis." : "依照原本紀錄顯示量度數字。走勢不代表診斷。"}</p>}
        </section>
      ) : null}
      {shared.symptom ? (
        <section id="shared-symptom" data-testid="shared-symptom" className="panel min-w-0 scroll-mt-24">
          <div className="flex items-center gap-3"><IconBadge icon={MessageCircle} /><h2 className="text-base font-semibold">{locale === "en" ? "Shared check-in" : "共享身體情況"}</h2></div>
          <h3 className="mt-5 text-lg font-medium">{L(shared.symptom.title)}</h3>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">{L(shared.symptom.summary)}</p>
          <p className="mt-4 text-xs text-ink-muted">{formatDateTime(shared.symptom.occurredAt, locale)} · <SourceLabel source={shared.symptom.provenance.source} /></p>
          <p className="mt-4 rounded-xl bg-[var(--role-soft)] p-3 text-sm leading-relaxed text-[color:var(--role-accent)]">{locale === "en" ? "You can check in with Michelle about how she feels. This workspace does not send a message." : "你可以向 Michelle 關心一下目前的情況。這個工作台不會代你傳送訊息。"}</p>
        </section>
      ) : null}
      {shared.appointment && !caregiverPreview ? (
        <section id="shared-appointment" data-testid="shared-appointment" className="panel min-w-0 scroll-mt-24">
          <div className="flex items-center gap-3"><IconBadge icon={CalendarDays} /><h2 className="text-base font-semibold">{locale === "en" ? "Next appointment" : "下次覆診"}</h2></div>
          <p className="mt-5 text-lg font-medium">{L(shared.appointment.title)}</p>
          <p className="mt-2 text-base leading-relaxed text-ink-muted">{formatDateTime(shared.appointment.at, locale)}</p>
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">{locale === "en" ? "Shared for planning support. Appointment management stays with Michelle." : "共享時間方便一起安排。覆診管理權限仍由 Michelle 保管。"}</p>
        </section>
      ) : null}
      {!caregiverPreview && (!compact || shared.medications.length > 0) ? <section id="shared-medication" data-testid="shared-medication" className="panel min-w-0 scroll-mt-24">
        <div className="flex items-center gap-3"><IconBadge icon={Pill} /><h2 className="text-base font-semibold">{locale === "en" ? "Medication information" : "用藥資料"}</h2></div>
        {shared.medications.length ? <ul className="mt-4 space-y-4">{shared.medications.map((medicine) => <li key={medicine.id}><p className="text-base font-medium">{medicine.name}</p><p className="mt-1 text-sm text-ink-muted">{L(medicine.dose)}</p></li>)}</ul> : <div className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-ink-muted"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><p>{locale === "en" ? "Not shared. Michelle decides whether to include medication information." : "尚未分享。是否共享用藥資料，由 Michelle 決定。"}</p></div>}
      </section> : null}
    </div>
  );
}

function AlertCard({ alert, role }: { alert: WorkspaceAlert; role: SupporterRole }) {
  const { locale, L } = useI18n();
  const reviewed = useCareWorkspace((state) => state.reviewedAlerts[role][alert.id] === true);
  const setReviewed = useCareWorkspace((state) => state.setAlertReviewed);
  const Icon = alert.kind === "bp" ? Activity : alert.kind === "symptoms" ? MessageCircle : CalendarDays;
  return (
    <article data-testid={`alert-${alert.id}`} className={`rounded-3xl border p-5 sm:p-6 ${reviewed ? "border-line bg-surface" : "border-attention/20 bg-attention-soft/60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-56 items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${reviewed ? "bg-surface-secondary text-ink-muted" : "bg-surface text-attention"}`}><Icon className="h-5 w-5" aria-hidden /></span><div><h2 className="text-lg font-semibold">{L(alert.title)}</h2><p className="mt-1 text-xs text-ink-muted">{formatDateTime(alert.occurredAt, locale)}</p></div></div>
        <span data-testid={`alert-status-${alert.id}`} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${reviewed ? "bg-brand-soft text-brand" : "bg-surface text-attention"}`}>{reviewed ? <CheckCheck className="h-3.5 w-3.5" aria-hidden /> : <Bell className="h-3.5 w-3.5" aria-hidden />}{locale === "en" ? (reviewed ? "Reviewed" : "Awaiting review") : (reviewed ? "已查看" : "待查看")}</span>
      </div>
      <p className="mt-4 text-base leading-relaxed text-ink-muted">{L(alert.body)}</p>
      <div className="mt-4 rounded-2xl border border-line/60 bg-surface/80 p-4"><p className="text-sm leading-relaxed">{L(alert.evidence)}</p><p className="mt-2"><SourceLabel source={alert.source} /></p></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={alert.href} className={quietLink}>{locale === "en" ? "View shared details" : "查看共享資料"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
        <button type="button" data-testid={`review-alert-${alert.id}`} aria-pressed={reviewed} onClick={() => setReviewed(role, alert.id, !reviewed)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-secondary">{reviewed ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{locale === "en" ? (reviewed ? "Mark as awaiting review" : "Mark as reviewed") : (reviewed ? "設為待查看" : "標記已查看")}</button>
      </div>
    </article>
  );
}

function Checklist({ preview = false }: { preview?: boolean }) {
  const { locale, L } = useI18n();
  const workspace = useCareWorkspace();
  const items = selectCareChecklist(workspace);
  const completed = items.filter((item) => item.completed).length;
  const percent = items.length ? Math.round(completed / items.length * 100) : 0;
  return (
    <section className="panel min-w-0" data-testid="care-checklist">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><IconBadge icon={CheckSquare} /><h2 className="text-lg font-semibold">{locale === "en" ? "Care checklist" : "照護清單"}</h2></div>{preview ? <Link href="/checklist" className={quietLink}>{locale === "en" ? "View checklist" : "查看清單"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link> : null}</div>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">{locale === "en" ? "For Michelle · mark your own care steps, and undo a check whenever needed." : "照顧 Michelle · 記錄自己的照護安排，隨時可以取消勾選。"}</p>
      {items.length ? <>
        <div className="mt-5 flex items-center justify-between gap-3 text-sm" aria-live="polite"><p data-testid="checklist-progress" className="font-medium text-[color:var(--role-accent)]">{locale === "en" ? `${completed} of ${items.length} completed` : `已完成 ${completed} / ${items.length} 項`}</p><span className="text-ink-muted">{percent}%</span></div>
        <div role="progressbar" aria-label={locale === "en" ? "Care checklist progress" : "照護清單進度"} aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={completed} className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--role-soft)]"><div className="h-full rounded-full bg-[var(--role-accent)] transition-[width]" style={{ width: `${percent}%` }} /></div>
        <div className="mt-5 divide-y divide-line">{items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-3 py-4">
          <input type="checkbox" data-testid={`checklist-${item.id}`} checked={item.completed} onChange={(event) => workspace.setChecklistCompleted(item.id, event.target.checked)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--role-accent)]" />
          <span className="min-w-0 flex-1"><span className={`block text-base font-medium ${item.completed ? "text-ink-muted line-through" : "text-ink"}`}>{L(item.title)}</span><span className="mt-1 block text-sm leading-relaxed text-ink-muted">{L(item.description)}</span><span className="mt-2 inline-flex rounded-full bg-[var(--role-soft)] px-2.5 py-1 text-xs font-medium text-[color:var(--role-accent)]">{item.time}</span></span>
          <span className="sr-only">{item.completed ? (locale === "en" ? "Completed" : "已完成") : (locale === "en" ? "To do" : "待處理")}</span>
        </label>)}</div>
      </> : <p className="mt-5 rounded-2xl bg-[var(--role-soft)] p-4 text-sm leading-relaxed text-ink-muted" data-testid="checklist-empty">{locale === "en" ? "No care tasks are available with the current sharing permissions." : "目前的共享權限下，沒有可顯示的照護事項。"}</p>}
    </section>
  );
}

export function SupporterHome({ role }: { role: SupporterRole }) {
  const { locale } = useI18n();
  const workspace = useCareWorkspace();
  const app = useAppStore();
  const shared = selectSharedHealth(workspace, app, role);
  const alerts = selectWorkspaceAlerts(workspace, app, role);
  const awaiting = alerts.filter((alert) => !workspace.reviewedAlerts[role][alert.id]);
  const categories = Number(shared.bp.length > 0) + Number(!!shared.symptom) + Number(!!shared.appointment) + Number(shared.medications.length > 0);
  const checklist = role === "caregiver" ? selectCareChecklist(workspace) : [];
  const title = locale === "en" ? (role === "family" ? "A little care, closer together" : "Ready for today’s care") : (role === "family" ? "多一份關心，近一點安心" : "今天的照護，清楚安排");
  return (
    <div data-role={role} data-testid="supporter-home" className="mx-auto max-w-6xl">
      <WorkspaceHeader title={title} subtitle={locale === "en" ? (role === "family" ? "See what Michelle has shared, notice changes and plan your next check-in." : "Review Michelle’s shared information, follow up on alerts and keep your care steps together.") : (role === "family" ? "查看 Michelle 共享的近況，留意變化，關心她的每一天。" : "先看共享近況，再查看提醒，按照清單安排照護。 ")} icon={role === "family" ? Users : HeartHandshake}>
        <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs text-ink-muted"><CalendarDays className="h-4 w-4" aria-hidden />{formatDate(app.clock, locale)}</span>
      </WorkspaceHeader>
      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-attention/20 bg-attention-soft p-6 sm:p-7" data-testid="supporter-attention">
          <p className="eyebrow flex items-center gap-2 text-attention"><Bell className="h-4 w-4" aria-hidden />{locale === "en" ? "Worth a look" : "值得留意"}</p>
          <h2 className="mt-4 text-2xl font-semibold leading-snug">{locale === "en" ? (awaiting.length ? `${awaiting.length} shared updates to review` : alerts.length ? "You’ve viewed the shared updates" : "Start with the information shared with you") : (awaiting.length ? `有 ${awaiting.length} 項共享近況待查看` : alerts.length ? "你已查看目前的共享近況" : "從已獲分享的資料開始")}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">{awaiting[0] ? (locale === "en" ? awaiting[0].body.en : awaiting[0].body.zh) : (locale === "en" ? "Each reminder links to its source. Viewing a reminder does not mark a health concern as resolved." : "每項提醒都可查看資料來源。已查看，不代表健康問題已解決。")}</p>
          <Link href="/alerts" className={`${roleLink} mt-5`}>{locale === "en" ? "Review shared alerts" : "查看共享提醒"}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </section>
        <section className="panel flex flex-col justify-between gap-5">
          <PatientIdentity hasAccess={shared.hasAccess} />
          <div className="grid grid-cols-2 gap-4 border-t border-line pt-5"><div><p className="text-3xl font-semibold text-[color:var(--role-accent)]" data-testid="shared-category-count">{categories}</p><p className="mt-1 text-xs text-ink-muted">{locale === "en" ? "Shared categories" : "共享資料類別"}</p></div><div><p className="text-3xl font-semibold text-attention" data-testid="pending-alert-count">{awaiting.length}</p><p className="mt-1 text-xs text-ink-muted">{locale === "en" ? "Awaiting your review" : "提醒待查看"}</p></div></div>
        </section>
      </div>
      {role === "caregiver" ? (
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
          <div className="min-w-0 lg:col-start-2 lg:row-start-1"><Checklist preview /></div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{locale === "en" ? "Michelle’s shared health" : "Michelle 的共享健康近況"}</h2><Link href="/shared" className={quietLink}>{locale === "en" ? "All shared information" : "查看全部共享資料"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link></div>
            <SharedHealthCards role={role} compact />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">{locale === "en" ? "Michelle’s shared health" : "Michelle 的共享健康近況"}</h2><Link href="/shared" className={quietLink}>{locale === "en" ? "All shared information" : "查看全部共享資料"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link></div>
          <SharedHealthCards role={role} compact />
          <section className="panel mt-5 flex flex-wrap items-center gap-4"><IconBadge icon={HeartHandshake} /><div className="min-w-0 flex-1 basis-56"><h2 className="text-lg font-semibold">{locale === "en" ? "A check-in starts with listening" : "關心，從聆聽開始"}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{locale === "en" ? "Use the shared updates to plan a conversation with Michelle. Her health information stays under her control." : "先了解已共享的近況，再與 Michelle 聊聊。她的健康資料，仍由她自己決定如何分享。"}</p></div><Link href="/alerts" className={quietLink}>{locale === "en" ? "View reminders" : "查看提醒"}<ArrowRight className="h-4 w-4" aria-hidden /></Link></section>
        </>
      )}
      {role === "caregiver" && checklist.length ? <p className="mt-3 text-xs text-ink-muted">{locale === "en" ? "Checklist items follow the current sharing permissions." : "照護事項會依目前的共享權限顯示。"}</p> : null}
      <LocalPreviewNote />
    </div>
  );
}

export function SharedHealthPage() {
  const role = useDemoAccount((state) => state.role);
  if (role === "patient") return <RoleBoundary />;
  return <SharedHealthContent role={role} />;
}

function SharedHealthContent({ role }: { role: SupporterRole }) {
  const { locale } = useI18n();
  const workspace = useCareWorkspace();
  const app = useAppStore();
  const shared = selectSharedHealth(workspace, app, role);
  return <div data-role={role} data-testid="shared-health-page" className="mx-auto max-w-5xl">
    <WorkspaceHeader title={locale === "en" ? "Shared health" : "共享健康數據"} subtitle={locale === "en" ? "Only the categories Michelle has chosen to share appear here." : "只顯示 Michelle 已選擇與你共享的資料類別。"} icon={HeartPulse} />
    <section className="panel mb-5 mt-7"><PatientIdentity hasAccess={shared.hasAccess} /></section>
    <SharedHealthCards role={role} />
    <LocalPreviewNote />
  </div>;
}

export function AlertsPage() {
  const role = useDemoAccount((state) => state.role);
  if (role === "patient") return <RoleBoundary />;
  return <AlertsContent role={role} />;
}

function AlertsContent({ role }: { role: SupporterRole }) {
  const { locale } = useI18n();
  const workspace = useCareWorkspace();
  const app = useAppStore();
  const alerts = selectWorkspaceAlerts(workspace, app, role);
  const pending = alerts.filter((alert) => !workspace.reviewedAlerts[role][alert.id]).length;
  return <div data-role={role} data-testid="alerts-page" className="mx-auto max-w-4xl">
    <WorkspaceHeader title={locale === "en" ? "Attention alerts" : "異常與關懷提醒"} subtitle={locale === "en" ? "Shared changes to notice. Review the source and keep track of what you’ve viewed." : "留意已共享資料中的變化，查看來源，記下哪些提醒你已經看過。"} icon={Bell} />
    <div className="my-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4"><p className="text-sm font-medium" aria-live="polite" data-testid="alert-review-progress">{locale === "en" ? `${pending} awaiting review · ${alerts.length - pending} reviewed` : `${pending} 項待查看 · ${alerts.length - pending} 項已查看`}</p><span className="text-xs text-ink-muted">{roleLabel(role, locale)}</span></div>
    {alerts.length ? <div className="space-y-4">{alerts.map((alert) => <AlertCard key={alert.id} alert={alert} role={role} />)}</div> : <SharingUnavailable alerts />}
    <LocalPreviewNote />
  </div>;
}

export function ChecklistPage() {
  const role = useDemoAccount((state) => state.role);
  const { locale } = useI18n();
  if (role !== "caregiver") return <RoleBoundary checklist />;
  return <div data-role="caregiver" data-testid="checklist-page" className="mx-auto max-w-4xl">
    <WorkspaceHeader title={locale === "en" ? "Today’s care checklist" : "今天的照護清單"} subtitle={locale === "en" ? "Small, clear steps for supporting Michelle. Your checks are saved on this device." : "把照顧 Michelle 的安排分成清楚的小步驟。勾選結果會儲存在此裝置。"} icon={ClipboardList} />
    <div className="mt-7"><Checklist /></div><LocalPreviewNote />
  </div>;
}

const sharingScopes: { id: WorkspaceScope; icon: LucideIcon; zh: string; en: string; hintZh: string; hintEn: string }[] = [
  { id: "bp", icon: HeartPulse, zh: "血壓紀錄", en: "Blood-pressure records", hintZh: "最近讀數與量度走勢", hintEn: "Recent readings and measurement trends" },
  { id: "symptoms", icon: MessageCircle, zh: "身體情況", en: "Symptoms and check-ins", hintZh: "你已記錄的身體情況與補充", hintEn: "The symptoms and notes you’ve recorded" },
  { id: "appointments", icon: CalendarDays, zh: "覆診時間", en: "Appointments", hintZh: "查看時間，方便安排陪診", hintEn: "View appointment times to plan support" },
  { id: "medication", icon: Pill, zh: "用藥資料", en: "Medication information", hintZh: "已儲存的藥名與劑量資料", hintEn: "Saved medicine names and dose information" },
  { id: "alerts", icon: Bell, zh: "異常與關懷提醒", en: "Attention alerts", hintZh: "只根據你已共享的資料顯示提醒", hintEn: "Reminders based only on categories you share" },
];

export function SharingPage() {
  const role = useDemoAccount((state) => state.role);
  const { locale } = useI18n();
  const workspace = useCareWorkspace();
  if (role !== "patient") return <RoleBoundary sharing />;
  return <div data-role="patient" data-testid="sharing-page" className="mx-auto max-w-5xl">
    <WorkspaceHeader title={locale === "en" ? "Share care, keep control" : "一起照顧，由你決定共享"} subtitle={locale === "en" ? "Choose which sample information Michelle shares with family and caregivers. You can change or pause sharing at any time." : "選擇把 Michelle 的哪些示範資料分享給家人和照護者。你可以隨時更改或暫停。"} icon={ShieldCheck} />
    <div className="mt-7 grid items-start gap-5 lg:grid-cols-2">{(["family", "caregiver"] as const).map((recipient) => {
      const grant = workspace.grants[recipient];
      return <section key={recipient} data-role={recipient} className="panel min-w-0" data-testid={`sharing-card-${recipient}`}>
        <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><IconBadge icon={recipient === "family" ? Users : HeartHandshake} /><div><h2 className="text-xl font-semibold">{roleLabel(recipient, locale)}</h2><p className="mt-1 text-xs text-ink-muted">{locale === "en" ? "Sample recipient" : "示範共享對象"}</p></div></div><span className={`rounded-full px-3 py-1.5 text-xs font-medium ${grant.active ? "bg-brand-soft text-brand" : "bg-surface-secondary text-ink-muted"}`}>{locale === "en" ? (grant.active ? "Sharing on" : "Paused") : (grant.active ? "共享中" : "已暫停")}</span></div>
        <label className="mt-6 flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl bg-[var(--role-soft)] p-4"><span className="text-sm font-semibold text-[color:var(--role-accent)]">{locale === "en" ? "Allow sharing with this role" : "允許與此角色共享"}</span><input type="checkbox" role="switch" data-testid={`sharing-${recipient}-active`} checked={grant.active} onChange={(event) => workspace.setGrantActive(recipient, event.target.checked)} className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--role-accent)]" /></label>
        <fieldset disabled={!grant.active} className="mt-3 divide-y divide-line disabled:opacity-50"><legend className="sr-only">{locale === "en" ? `Information shared with ${roleLabel(recipient, locale)}` : `與${roleLabel(recipient, locale)}共享的資料`}</legend>{sharingScopes.map((scope) => <label key={scope.id} className="flex min-h-16 cursor-pointer items-start gap-3 py-4"><scope.icon className="mt-1 h-4 w-4 shrink-0 text-[color:var(--role-accent)]" aria-hidden /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{locale === "en" ? scope.en : scope.zh}</span><span className="mt-1 block text-xs leading-relaxed text-ink-muted">{locale === "en" ? scope.hintEn : scope.hintZh}</span></span><input type="checkbox" data-testid={`sharing-${recipient}-${scope.id}`} checked={grant[scope.id]} onChange={(event) => workspace.setScope(recipient, scope.id, event.target.checked)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--role-accent)]" /></label>)}</fieldset>
        <p className="mt-2 rounded-xl bg-surface-secondary p-3 text-xs leading-relaxed text-ink-muted">{locale === "en" ? "Pausing sharing hides the related readings, alerts and care tasks from this recipient’s workspace." : "暫停共享後，這個對象的工作台將不再顯示相關讀數、提醒與照護事項。"}</p>
      </section>;
    })}</div>
    <section className="panel mt-5 flex flex-wrap items-center gap-4"><IconBadge icon={HeartHandshake} /><div className="min-w-0 flex-1 basis-56"><h2 className="text-lg font-semibold">{locale === "en" ? "Information shared with you" : "家人與你共享的資料"}</h2><p className="mt-2 text-sm leading-relaxed text-ink-muted">{locale === "en" ? "Mum’s shared information has its own permissions and stays separate from what you share." : "媽媽與你共享的資料有獨立權限，與你向外共享的內容分開管理。"}</p></div><Link href="/family" data-testid="family-inbound-link" className={quietLink}>{locale === "en" ? "View Mum’s information" : "查看媽媽的資料"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link></section>
    <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-ink-muted" role="status"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden /><span>{locale === "en" ? "Changes save automatically on this device. Role previews demonstrate permissions; they do not connect real accounts or send notifications." : "更改會自動儲存在此裝置。角色預覽用於展示權限，不會連接真實帳戶或發送通知。"}</span></p>
  </div>;
}
