"use client";

import { create } from "zustand";
import { bpReadings, michelleMeds } from "./seed";
import type { SupporterRole } from "./roles";
import type { AppState } from "./store";
import type { Appointment, BpReading, HealthRecord, Localized, Medication, SourceClass } from "./types";

export const WORKSPACE_STORAGE_KEY = "caremate-workspace-v1";
export type WorkspaceScope = "bp" | "symptoms" | "appointments" | "medication" | "alerts";
export type WorkspaceAlertId = "bp-trend" | "symptom-note" | "appointment-prep";
export type CareChecklistId = "check-reading" | "check-in" | "visit-papers";

export interface SharingGrant extends Record<WorkspaceScope, boolean> {
  active: boolean;
}

export interface CareWorkspaceState {
  grants: Record<SupporterRole, SharingGrant>;
  reviewedAlerts: Record<SupporterRole, Record<string, boolean>>;
  checklistCompleted: Record<string, boolean>;
  hydrated: boolean;
}

interface CareWorkspaceActions {
  hydrate: () => void;
  reset: () => void;
  setScope: (role: SupporterRole, scope: WorkspaceScope, enabled: boolean) => void;
  setGrantActive: (role: SupporterRole, active: boolean) => void;
  setAlertReviewed: (role: SupporterRole, id: string, reviewed: boolean) => void;
  setChecklistCompleted: (id: string, completed: boolean) => void;
}

export interface SharedHealth {
  grant: SharingGrant;
  hasAccess: boolean;
  bp: BpReading[];
  symptom: HealthRecord | null;
  appointment: Appointment | null;
  medications: Medication[];
}

export interface WorkspaceAlert {
  id: WorkspaceAlertId;
  kind: "bp" | "symptoms" | "appointments";
  title: Localized;
  body: Localized;
  evidence: Localized;
  occurredAt: string;
  source: SourceClass;
  href: string;
}

export interface CareChecklistItem {
  id: CareChecklistId;
  title: Localized;
  description: Localized;
  time: string;
  scope: WorkspaceScope;
  completed: boolean;
}

const SUPPORTER_ROLES: SupporterRole[] = ["family", "caregiver"];
const SCOPES: WorkspaceScope[] = ["bp", "symptoms", "appointments", "medication", "alerts"];
const GRANT_KEYS: (keyof SharingGrant)[] = ["active", ...SCOPES];
const ALERT_IDS: WorkspaceAlertId[] = ["bp-trend", "symptom-note", "appointment-prep"];
const CHECKLIST_IDS: CareChecklistId[] = ["check-reading", "check-in", "visit-papers"];

function defaultGrant(): SharingGrant {
  return { active: true, bp: true, symptoms: true, appointments: true, medication: false, alerts: true };
}

function defaultState(): CareWorkspaceState {
  return {
    grants: { family: defaultGrant(), caregiver: defaultGrant() },
    reviewedAlerts: { family: {}, caregiver: {} },
    checklistCompleted: {},
    hydrated: false,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSupporterRole(role: unknown): role is SupporterRole {
  return role === "family" || role === "caregiver";
}

function knownBooleans(value: unknown, keys: readonly string[]): Record<string, boolean> {
  const output: Record<string, boolean> = {};
  if (!isObject(value)) return output;
  for (const key of keys) {
    if (typeof value[key] === "boolean") output[key] = value[key];
  }
  return output;
}

/** Restore only explicitly supported fields; saved objects cannot add permissions or actions. */
export function parseWorkspaceState(value: unknown): CareWorkspaceState {
  const next = defaultState();
  if (!isObject(value)) return next;
  for (const role of SUPPORTER_ROLES) {
    const savedGrant = isObject(value.grants) ? value.grants[role] : null;
    if (isObject(savedGrant)) {
      for (const key of GRANT_KEYS) {
        if (typeof savedGrant[key] === "boolean") next.grants[role][key] = savedGrant[key];
      }
    }
    const savedReviewed = isObject(value.reviewedAlerts) ? value.reviewedAlerts[role] : null;
    next.reviewedAlerts[role] = knownBooleans(savedReviewed, ALERT_IDS);
  }
  next.checklistCompleted = knownBooleans(value.checklistCompleted, CHECKLIST_IDS);
  return next;
}

function persist(state: CareWorkspaceState) {
  if (typeof window === "undefined") return;
  try {
    const { grants, reviewedAlerts, checklistCompleted } = state;
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ grants, reviewedAlerts, checklistCompleted }));
  } catch {
    // Blocked or full storage must not prevent the current preview from working.
  }
}

export const useCareWorkspace = create<CareWorkspaceState & CareWorkspaceActions>((set, get) => ({
  ...defaultState(),
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (saved !== null) set(parseWorkspaceState(JSON.parse(saved)));
    } catch {
      // Keep any current in-memory changes when storage cannot be read or parsed.
    }
    set({ hydrated: true });
  },
  reset: () => {
    set({ ...defaultState(), hydrated: true });
    persist(get());
  },
  setScope: (role, scope, enabled) => {
    if (!isSupporterRole(role) || !SCOPES.includes(scope) || typeof enabled !== "boolean") return;
    set({ grants: { ...get().grants, [role]: { ...get().grants[role], [scope]: enabled } } });
    persist(get());
  },
  setGrantActive: (role, active) => {
    if (!isSupporterRole(role) || typeof active !== "boolean") return;
    set({ grants: { ...get().grants, [role]: { ...get().grants[role], active } } });
    persist(get());
  },
  setAlertReviewed: (role, id, reviewed) => {
    if (!isSupporterRole(role) || !ALERT_IDS.includes(id as WorkspaceAlertId) || typeof reviewed !== "boolean") return;
    set({ reviewedAlerts: { ...get().reviewedAlerts, [role]: { ...get().reviewedAlerts[role], [id]: reviewed } } });
    persist(get());
  },
  setChecklistCompleted: (id, completed) => {
    if (!CHECKLIST_IDS.includes(id as CareChecklistId) || typeof completed !== "boolean") return;
    set({ checklistCompleted: { ...get().checklistCompleted, [id]: completed } });
    persist(get());
  },
}));

type WorkspaceGrants = Pick<CareWorkspaceState, "grants">;
type SharedScenario = Pick<AppState, "records" | "appointments">;

/** The organised symptom summary also embeds a BP clause; it follows the BP grant. */
function permittedSymptom(record: HealthRecord, canViewBp: boolean): HealthRecord {
  if (canViewBp) return record;
  return {
    ...record,
    summary: {
      zh: record.summary.zh.replace(/今早血壓\s*\d{2,3}\s*\/\s*\d{2,3}(?:\s*mmHg)?[。.]?/g, "").trim(),
      en: record.summary.en.replace(/\s*Morning BP\s+\d{2,3}\s*\/\s*\d{2,3}(?:\s*mmHg)?\.?/gi, "").trim(),
    },
  };
}

/** Components receive a permission-filtered projection, never the complete patient packet. */
export function selectSharedHealth(workspace: WorkspaceGrants, app: SharedScenario, role: SupporterRole): SharedHealth {
  const grant = workspace.grants[role];
  const hasAccess = grant.active && (grant.bp || grant.symptoms || grant.appointments || grant.medication);
  const symptom = grant.active && grant.symptoms
    ? app.records.filter((record) => record.personId === "michelle" && record.kind === "symptom")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null
    : null;
  return {
    grant,
    hasAccess,
    bp: grant.active && grant.bp ? bpReadings.filter((reading) => reading.personId === "michelle") : [],
    symptom: symptom ? permittedSymptom(symptom, grant.bp) : null,
    appointment: grant.active && grant.appointments ? app.appointments.find((appointment) => appointment.personId === "michelle") ?? null : null,
    medications: grant.active && grant.medication ? michelleMeds.slice() : [],
  };
}

export function selectWorkspaceAlerts(workspace: WorkspaceGrants, app: SharedScenario, role: SupporterRole): WorkspaceAlert[] {
  const shared = selectSharedHealth(workspace, app, role);
  if (!shared.grant.active || !shared.grant.alerts) return [];
  const alerts: WorkspaceAlert[] = [];
  const first = shared.bp[0];
  const latest = shared.bp.at(-1);
  if (first && latest && first.id !== latest.id && (latest.systolic > first.systolic || latest.diastolic > first.diastolic)) {
    alerts.push({
      id: "bp-trend",
      kind: "bp",
      title: { zh: "血壓紀錄需要留意", en: "A blood-pressure record to review" },
      body: { zh: "最近讀數較這組紀錄的較早讀數高。查看已分享的量度，再與 Michelle 了解近況。", en: "The latest reading is higher than the first in this shared series. Review the measurements and check in with Michelle." },
      evidence: { zh: `最近 ${latest.systolic}/${latest.diastolic} mmHg · 較早 ${first.systolic}/${first.diastolic} mmHg`, en: `Latest ${latest.systolic}/${latest.diastolic} mmHg · earlier ${first.systolic}/${first.diastolic} mmHg` },
      occurredAt: latest.occurredAt,
      source: "home-measure",
      href: "/shared/#shared-bp",
    });
  }
  if (shared.symptom) {
    alerts.push({
      id: "symptom-note",
      kind: "symptoms",
      title: { zh: "Michelle 分享了頭暈紀錄", en: "Michelle shared a dizziness note" },
      body: { zh: "可以先了解她現在的感覺，並查看已分享的症狀紀錄。", en: "Check how she feels now and review the symptom note she shared." },
      evidence: shared.symptom.summary,
      occurredAt: shared.symptom.occurredAt,
      source: shared.symptom.provenance.source,
      href: "/shared/#shared-symptom",
    });
  }
  if (shared.appointment) {
    alerts.push({
      id: "appointment-prep",
      kind: "appointments",
      title: { zh: "覆診前，準備好所需資料", en: "Prepare the papers for the next visit" },
      body: { zh: "確認已分享的覆診時間，與 Michelle 商量需要帶備的資料。", en: "Review the shared appointment time and agree with Michelle what to bring." },
      evidence: shared.appointment.title,
      occurredAt: shared.appointment.at,
      source: "organised",
      href: "/shared/#shared-appointment",
    });
  }
  return alerts;
}

const CHECKLIST: Omit<CareChecklistItem, "completed">[] = [
  {
    id: "check-reading", time: "09:00", scope: "bp",
    title: { zh: "查看家居血壓紀錄", en: "Review the home blood-pressure record" },
    description: { zh: "核對已分享讀數的時間及來源，記下想向 Michelle 了解的事項。", en: "Check the shared reading’s time and source, and note what to ask Michelle." },
  },
  {
    id: "check-in", time: "10:00", scope: "symptoms",
    title: { zh: "與 Michelle 了解近況", en: "Check in with Michelle" },
    description: { zh: "參考已分享的頭暈紀錄，了解她現在的感覺。", en: "Use the shared dizziness note to ask how she feels now." },
  },
  {
    id: "visit-papers", time: "17:00", scope: "appointments",
    title: { zh: "準備覆診資料", en: "Prepare the visit papers" },
    description: { zh: "按已分享的覆診安排，與 Michelle 整理需要帶備的資料。", en: "Use the shared appointment details to organise with Michelle what to bring." },
  },
];

export function selectCareChecklist(workspace: Pick<CareWorkspaceState, "grants" | "checklistCompleted">): CareChecklistItem[] {
  const grant = workspace.grants.caregiver;
  if (!grant.active) return [];
  return CHECKLIST.filter((item) => grant[item.scope]).map((item) => ({
    ...item,
    completed: workspace.checklistCompleted[item.id] === true,
  }));
}
