import { expect, test } from "@playwright/test";
import {
  parseWorkspaceState,
  selectCareChecklist,
  selectSharedHealth,
  selectWorkspaceAlerts,
  useCareWorkspace,
  WORKSPACE_STORAGE_KEY,
} from "../src/lib/care-workspace";
import { createAppointments, createRecords } from "../src/lib/seed";
import { useAppStore } from "../src/lib/store";

const scenario = () => ({ records: createRecords(), appointments: createAppointments() });

test.beforeEach(() => useCareWorkspace.getState().reset());

test("revoked BP scope removes measurements, evidence and the related care task", () => {
  useCareWorkspace.getState().setScope("caregiver", "bp", false);
  const state = useCareWorkspace.getState();
  expect(selectSharedHealth(state, scenario(), "caregiver").bp).toEqual([]);
  expect(selectWorkspaceAlerts(state, scenario(), "caregiver").map((item) => item.id)).not.toContain("bp-trend");
  expect(selectCareChecklist(state).map((item) => item.id)).not.toContain("check-reading");
  expect(selectSharedHealth(state, scenario(), "family").bp).toHaveLength(7);
});

test("turning off a recipient grant removes all shared facts, alerts and checklist work", () => {
  useCareWorkspace.getState().setGrantActive("caregiver", false);
  const state = useCareWorkspace.getState();
  const shared = selectSharedHealth(state, scenario(), "caregiver");
  expect(shared.hasAccess).toBeFalsy();
  expect(shared.bp).toEqual([]);
  expect(shared.symptom).toBeNull();
  expect(shared.appointment).toBeNull();
  expect(shared.medications).toEqual([]);
  expect(selectWorkspaceAlerts(state, scenario(), "caregiver")).toEqual([]);
  expect(selectCareChecklist(state)).toEqual([]);
});

test("each data scope also controls its related alert and checklist evidence", () => {
  const app = scenario();
  useCareWorkspace.getState().setScope("caregiver", "symptoms", false);
  useCareWorkspace.getState().setScope("caregiver", "appointments", false);
  const state = useCareWorkspace.getState();
  expect(selectSharedHealth(state, app, "caregiver").symptom).toBeNull();
  expect(selectSharedHealth(state, app, "caregiver").appointment).toBeNull();
  expect(selectWorkspaceAlerts(state, app, "caregiver").map((item) => item.id)).toEqual(["bp-trend"]);
  expect(selectCareChecklist(state).map((item) => item.id)).toEqual(["check-reading"]);
});

test("alerts permission disables the inbox without withdrawing separately shared health data", () => {
  useCareWorkspace.getState().setScope("family", "alerts", false);
  const state = useCareWorkspace.getState();
  expect(selectWorkspaceAlerts(state, scenario(), "family")).toEqual([]);
  expect(selectSharedHealth(state, scenario(), "family").bp).toHaveLength(7);
});

test("reviewing and reopening a reminder is scoped to its recipient", () => {
  useCareWorkspace.getState().setAlertReviewed("family", "bp-trend", true);
  expect(useCareWorkspace.getState().reviewedAlerts.family["bp-trend"]).toBeTruthy();
  expect(useCareWorkspace.getState().reviewedAlerts.caregiver["bp-trend"]).not.toBeTruthy();
  useCareWorkspace.getState().setAlertReviewed("family", "bp-trend", false);
  expect(useCareWorkspace.getState().reviewedAlerts.family["bp-trend"]).toBeFalsy();
});

test("checklist completion is reversible and does not change medication facts", () => {
  const before = JSON.stringify(useAppStore.getState().doses);
  useCareWorkspace.getState().setChecklistCompleted("check-reading", true);
  expect(selectCareChecklist(useCareWorkspace.getState()).find((item) => item.id === "check-reading")?.completed).toBeTruthy();
  useCareWorkspace.getState().setChecklistCompleted("check-reading", false);
  expect(selectCareChecklist(useCareWorkspace.getState()).find((item) => item.id === "check-reading")?.completed).toBeFalsy();
  expect(JSON.stringify(useAppStore.getState().doses)).toBe(before);
  expect(useAppStore.getState().doses.find((dose) => dose.id === "dose-ator-14")?.status).toBe("unknown");
});

test("a shared organised symptom summary does not expose a revoked BP reading", () => {
  const app = scenario();
  app.records[0].summary = { zh: "今早起床後開始。今早血壓151/94。", en: "Started after getting up. Morning BP 151/94." };
  useCareWorkspace.getState().setScope("family", "bp", false);
  const state = useCareWorkspace.getState();
  const shared = selectSharedHealth(state, app, "family");
  expect(JSON.stringify(shared.symptom)).not.toContain("151/94");
  expect(JSON.stringify(selectWorkspaceAlerts(state, app, "family"))).not.toContain("151/94");
  expect(shared.symptom?.summary.en).toContain("Started after getting up");
});

test("saved state restores known booleans and ignores malformed or unknown nested fields", () => {
  const state = parseWorkspaceState({
    grants: {
      family: { active: false, bp: "yes", medication: true, extra: true },
      caregiver: { symptoms: false, appointments: null },
    },
    reviewedAlerts: { family: { "bp-trend": true, "symptom-note": "true", invented: true }, caregiver: [] },
    checklistCompleted: { "check-reading": true, "check-in": "yes", invented: true },
    hydrated: true,
  });
  expect(state.grants.family.active).toBeFalsy();
  expect(state.grants.family.bp).toBeTruthy();
  expect(state.grants.family.medication).toBeTruthy();
  expect(state.grants.family).not.toHaveProperty("extra");
  expect(state.grants.caregiver.symptoms).toBeFalsy();
  expect(state.grants.caregiver.appointments).toBeTruthy();
  expect(state.reviewedAlerts.family["bp-trend"]).toBeTruthy();
  expect(state.reviewedAlerts.family["symptom-note"]).not.toBeTruthy();
  expect(state.reviewedAlerts.family).not.toHaveProperty("invented");
  expect(state.checklistCompleted["check-reading"]).toBeTruthy();
  expect(state.checklistCompleted["check-in"]).not.toBeTruthy();
  expect(state.checklistCompleted).not.toHaveProperty("invented");
  expect(state.hydrated).toBeFalsy();
});

test("invalid persisted roots and role arrays restore independent safe defaults", () => {
  for (const value of [null, false, [], "bad", { grants: { family: [] } }]) {
    const state = parseWorkspaceState(value);
    expect(state.grants.family.active).toBeTruthy();
    expect(state.grants.family.medication).toBeFalsy();
    expect(state.grants.caregiver.active).toBeTruthy();
  }
  const first = parseWorkspaceState(null);
  const second = parseWorkspaceState(null);
  first.grants.family.active = false;
  expect(second.grants.family.active).toBeTruthy();
});

test("shared appointment projection uses updated scenario appointments", () => {
  const app = scenario();
  app.appointments[0].at = "2026-09-17T11:00:00+08:00";
  const state = useCareWorkspace.getState();
  expect(selectSharedHealth(state, app, "family").appointment?.at).toBe("2026-09-17T11:00:00+08:00");
  expect(selectWorkspaceAlerts(state, app, "family").find((item) => item.id === "appointment-prep")?.occurredAt).toBe("2026-09-17T11:00:00+08:00");
  expect(selectSharedHealth(state, app, "family").medications).toEqual([]);
});

test("grants, recipient review and checklist choices persist and restore together", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } },
  });
  try {
    useCareWorkspace.getState().setScope("family", "medication", true);
    useCareWorkspace.getState().setAlertReviewed("family", "symptom-note", true);
    useCareWorkspace.getState().setChecklistCompleted("check-in", true);
    expect(values.has(WORKSPACE_STORAGE_KEY)).toBeTruthy();
    useCareWorkspace.setState(parseWorkspaceState(null));
    useCareWorkspace.getState().hydrate();
    const restored = useCareWorkspace.getState();
    expect(restored.hydrated).toBeTruthy();
    expect(restored.grants.family.medication).toBeTruthy();
    expect(restored.reviewedAlerts.family["symptom-note"]).toBeTruthy();
    expect(restored.reviewedAlerts.caregiver["symptom-note"]).not.toBeTruthy();
    expect(restored.checklistCompleted["check-in"]).toBeTruthy();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("blocked and malformed browser storage preserve current in-memory choices", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: () => "{broken", setItem: () => { throw new Error("blocked"); } } },
  });
  try {
    useCareWorkspace.getState().setScope("caregiver", "bp", false);
    useCareWorkspace.getState().setChecklistCompleted("visit-papers", true);
    useCareWorkspace.getState().hydrate();
    expect(useCareWorkspace.getState().grants.caregiver.bp).toBeFalsy();
    expect(useCareWorkspace.getState().checklistCompleted["visit-papers"]).toBeTruthy();
    expect(useCareWorkspace.getState().hydrated).toBeTruthy();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
