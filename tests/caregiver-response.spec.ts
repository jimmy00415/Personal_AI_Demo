import { expect, test, type Page } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import type { DemoState } from "../src/lib/demo/types";
import { createAttentionEvent, respondToEvent, resolveEvent, selectSharingProjection, setConsent, sharedExportText } from "../src/lib/demo/sharing";
import { completePersonalTask, createAccompanyTask, createAfterVisitTask, rescheduleTask } from "../src/lib/demo/care";
import { useAppStore } from "../src/lib/store";
import { isDemoState } from "../src/lib/demo/persistence";

const snapshot = (page: Page): Promise<DemoState> => page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
async function start(page: Page, demo: DemoState, path: string) {
  await page.addInitScript(d => { if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(d)); }, demo);
  await page.goto(path);
}
async function actor(page: Page, id: "may" | "david", path: string) {
  await page.goto("/dev"); await page.getByTestId(`perspective-${id}`).click(); await page.goto(path);
}
function authorised() {
  const demo = createScenario("share-needed");
  demo.grants.push({ id: "grant-david", patientId: "may", recipientId: "david", level: "alerts-only", categories: ["body"], status: "active", updatedAt: demo.clock, revision: 1 });
  return demo;
}

test("authorise_record_event_response_patient_receipt_is_complete", async ({ page }) => {
  const external: string[] = [];
  page.on("request", r => { if (r.url().includes("/api/") || !r.url().startsWith("http://127.0.0.1:3000")) external.push(r.url()); });
  await start(page, createScenario("share-needed"), "/sharing");
  await page.getByTestId("level-alerts-only").check(); await page.getByTestId("category-body").check();
  await page.getByTestId("sharing-review").click(); await page.getByTestId("sharing-confirm").click();
  await page.goto("/care?task=task-fixture-attention");
  await page.getByTestId("event-request").click();
  const before = await snapshot(page);
  expect(before.events).toHaveLength(1);
  expect(before.events[0].sourceRecordIds).toEqual(["rec-dizzy"]);
  await actor(page, "david", "/notifications");
  await page.getByTestId(`event-open-${before.events[0].id}`).click();
  await expect(page.getByTestId("event-detail")).not.toContainText("151");
  await page.getByTestId("event-note").fill("I will help with this local request.");
  await page.getByTestId("event-accept").click();
  let data = await snapshot(page);
  expect(data.events[0]).toMatchObject({ status: "acknowledged", response: "I will help with this local request." });
  expect(data.tasks.find(t => t.id === "task-fixture-attention")).toMatchObject({ ownerId: "david", status: "pending", contactOutcome: "not_contacted" });
  await actor(page, "may", "/notifications");
  await page.getByTestId(`event-open-${data.events[0].id}`).click();
  await expect(page.getByTestId("event-detail")).toContainText("I will help with this local request.");
  await expect(page.getByTestId("event-owner")).toContainText("David");
  await actor(page, "david", "/notifications");
  await page.getByTestId(`event-open-${data.events[0].id}`).click();
  await page.getByTestId("event-resolve").click();
  data = await snapshot(page);
  expect(data.events[0].status).toBe("resolved");
  // Helping with the request does not certify a clinical contact happened.
  expect(data.tasks.find(t => t.id === "task-fixture-attention")).toMatchObject({ ownerId: "may", status: "pending", contactOutcome: "not_contacted" });
  await expect(page.getByTestId("event-detail")).toContainText("May仍負責");
  await actor(page, "may", "/notifications");
  await expect(page.getByTestId(`event-row-${data.events[0].id}`)).toContainText("已完成協助");
  expect(external).toEqual([]);
});

test("after_visit_task_owner_changes_only_after_authorised_acceptance", async ({ page }) => {
  const demo = authorised(); demo.grants[0].level = "full";
  await start(page, demo, "/care");
  await page.getByLabel("本人提供的虛構事項").fill("Bring my fictional question list.");
  await page.getByTestId("aftervisit-preview").click();
  await page.locator("#aftervisit-category").selectOption("body");
  await page.locator("#aftervisit-owner").selectOption("david");
  await page.getByTestId("aftervisit-save").click();
  const data = await snapshot(page); const task = data.tasks.at(-1)!;
  expect(task.ownerId).toBe("may");
  expect(data.events.find(e => e.taskId === task.id)?.sourceRecordIds).toEqual(task.sourceRecordIds);
  await actor(page, "david", "/");
  await page.getByTestId(`event-open-${data.events.find(e => e.taskId === task.id)!.id}`).click();
  await expect(page.getByTestId("event-detail")).toContainText("Bring my fictional question list.");
  await page.getByTestId("event-accept").click();
  expect((await snapshot(page)).tasks.find(t => t.id === task.id)).toMatchObject({ ownerId: "david", status: "scheduled" });
  await page.getByTestId("event-resolve").click();
  const final = await snapshot(page);
  expect(final.tasks.find(t => t.id === task.id)?.status).toBe("completed");
  expect(final.healthRecords.find(r => r.id === task.sourceRecordIds[0])).toEqual(data.healthRecords.find(r => r.id === task.sourceRecordIds[0]));
});

test("no_consent_duplicate_trigger_or_decline_creates_no_false_response", async ({ page }) => {
  await start(page, createScenario("share-needed"), "/care?task=task-fixture-attention");
  await page.getByTestId("event-request").click();
  await expect(page.getByTestId("task-detail").getByRole("alert")).toBeVisible();
  expect((await snapshot(page)).events).toEqual([]);
  await page.goto("/sharing"); await page.getByTestId("category-body").check();
  await page.getByTestId("sharing-review").click(); await page.getByTestId("sharing-confirm").click();
  await page.goto("/care?task=task-fixture-attention"); await page.getByTestId("event-request").click();
  await page.reload(); await page.getByTestId("event-request").click();
  let data = await snapshot(page); expect(data.events).toHaveLength(1);
  await actor(page, "david", "/notifications"); await page.getByTestId(`event-open-${data.events[0].id}`).click();
  await page.getByTestId("event-note").fill("Unable to help today"); await page.getByTestId("event-decline").click();
  await expect(page.getByTestId("event-resolve")).toHaveCount(0);
  data = await snapshot(page);
  expect(data.events[0].status).toBe("declined");
  expect(data.tasks.find(t => t.id === "task-fixture-attention")).toMatchObject({ ownerId: "may", proposedOwnerId: null, status: "pending" });
  await actor(page, "may", "/notifications");
  await expect(page.getByTestId(`event-row-${data.events[0].id}`)).toContainText("待分配");
});

function value<T>(result: { ok: true; value: T } | { ok: false; code: string }): T { expect(result.ok).toBe(true); if (!result.ok) throw Error(result.code); return result.value; }
function afterVisit(category: "body" | "mood" | "private" = "body") {
  return value(createAfterVisitTask(authorised(), { patientId: "may", text: "EXPLICIT_INSTRUCTION", scheduledAt: "2026-09-17T09:15:00+08:00", shareCategory: category, proposedOwnerId: "david" }));
}
test("finite_triggers_do_not_infer_thresholds_or_expose_unshared_tasks", () => {
  const demo = afterVisit(); const task = demo.tasks.at(-1)!;
  expect(createAttentionEvent(demo, { patientId: "may", sourceRecordId: task.sourceRecordIds[0], scenario: "after-visit-task" })).toMatchObject({ ok: false });
  expect(createAttentionEvent(demo, { patientId: "may", sourceRecordId: task.sourceRecordIds[0], taskId: task.id, scenario: "fixture-attention" })).toMatchObject({ ok: false });
  for (const category of ["mood", "private"] as const) {
    const hidden = afterVisit(category); const hiddenTask = hidden.tasks.at(-1)!;
    expect(createAttentionEvent(hidden, { patientId: "may", sourceRecordId: hiddenTask.sourceRecordIds[0], taskId: hiddenTask.id, scenario: "after-visit-task" })).toMatchObject({ ok: false, code: "sharing-unavailable" });
    expect(JSON.stringify(selectSharingProjection(hidden, "may", "david"))).not.toContain(hiddenTask.id);
    const summary = value(setConsent(hidden, { patientId: "may", recipientId: "david", level: "full", categories: ["body"] }));
    expect(value(sharedExportText(summary, "may", "david", "en"))).not.toContain("EXPLICIT_INSTRUCTION");
  }
  const nonDavid = { ...demo, grants: demo.grants.map(g => ({ ...g, id: "grant-doctor", recipientId: "doctor-wong" as const })) };
  expect(createAttentionEvent(nonDavid, { patientId: "may", sourceRecordId: task.sourceRecordIds[0], taskId: task.id, scenario: "after-visit-task" })).toMatchObject({ ok: false });
  expect(nonDavid.events).toHaveLength(0);
  const huge = { ...demo, observations: demo.observations.map(o => ({ ...o, systolic: 999 })) };
  expect(selectSharingProjection(huge, "may", "david").events).toEqual([]);
});

test("response_is_authorised_idempotent_and_does_not_mutate_source_or_clinical_history", () => {
  const demo = afterVisit(); const task = demo.tasks.at(-1)!;
  const input = { patientId: "may" as const, sourceRecordId: task.sourceRecordIds[0], taskId: task.id, scenario: "after-visit-task" as const };
  const created = value(createAttentionEvent(demo, input)); const event = created.events[0];
  expect(value(createAttentionEvent(created, input))).toBe(created);
  expect(respondToEvent(created, event.id, { actorId: "david", decision: "accept", note: "" })).toMatchObject({ ok: false, code: "caregiver-only" });
  const david = { ...created, context: { actorId: "david" as const, patientId: "may" as const, perspective: "caregiver" as const } };
  expect(resolveEvent(david, event.id, "david")).toMatchObject({ ok: false, code: "acceptance-required" });
  const declined = value(respondToEvent(david, event.id, { actorId: "david", decision: "decline", note: "Cannot help" }));
  expect(declined.tasks.at(-1)).toMatchObject({ ownerId: "may", proposedOwnerId: null, status: "pending" });
  expect(declined.healthRecords).toEqual(demo.healthRecords);
  expect(resolveEvent(declined, event.id, "david")).toMatchObject({ ok: false, code: "acceptance-required" });
  const accepted = value(respondToEvent(david, event.id, { actorId: "david", decision: "accept", note: "PRIVATE_RESPONSE_NOTE" }));
  expect(accepted.tasks.at(-1)).toMatchObject({ ownerId: "david", status: "scheduled" });
  expect(value(respondToEvent(accepted, event.id, { actorId: "david", decision: "accept", note: "PRIVATE_RESPONSE_NOTE" }))).toBe(accepted);
  for (const level of ["alerts-only", "summary", "full"] as const) {
    const view = { ...accepted, grants: accepted.grants.map(g => ({ ...g, level })) };
    const projected = JSON.stringify(selectSharingProjection(view, "may", "david"));
    expect(projected).not.toContain("PRIVATE_RESPONSE_NOTE");
    if (level !== "full") expect(projected).not.toContain("EXPLICIT_INSTRUCTION");
  }
  const resolved = value(resolveEvent(accepted, event.id, "david"));
  expect(resolved.tasks.at(-1)?.status).toBe("completed"); expect(resolved.events[0].status).toBe("resolved");
  expect(resolved.healthRecords).toEqual(created.healthRecords); expect(resolved.checkIns).toEqual(created.checkIns); expect(resolved.episodes).toEqual(created.episodes); expect(resolved.medicationDoses).toEqual(created.medicationDoses);
  expect(resolved.tasks.slice(0, -1)).toEqual(created.tasks.slice(0, -1));
  expect(value(resolveEvent(resolved, event.id, "david"))).toBe(resolved);
  expect(isDemoState(resolved)).toBe(true);
});

test("English_event_detail_at_320px_has_current_actions_and_no_external_recipient_response", async ({ page }) => {
  const demo = createScenario("caregiver-alert");
  await page.setViewportSize({ width: 320, height: 780 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "en", liteMode: true, introComplete: true })));
  await start(page, demo, "/notifications?event=event-fixture-attention");
  await expect(page.getByTestId("event-detail")).toContainText("Waiting for David's response");
  for (const id of ["event-accept", "event-decline"]) {
    const bounds = await page.getByTestId(id).boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("event-accept").focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("event-status")).toContainText("David accepted");
  await page.reload(); await expect(page.getByTestId("event-resolve")).toBeVisible();
  await actor(page, "may", "/sharing");
  await page.getByTestId("recipient-doctor-wong").click(); await page.getByTestId("category-body").check();
  await page.getByTestId("sharing-review").click();
  await expect(page.getByTestId("event-accept")).toHaveCount(0); await expect(page.getByTestId("event-resolve")).toHaveCount(0);
  expect((await snapshot(page)).events.map(e => e.recipientId)).toEqual(["david"]);
});

test("May_can_complete_or_withdraw_after_visit_and_David_can_complete_own_accompaniment", async ({ page }) => {
  let demo = afterVisit(); const first = demo.tasks.at(-1)!;
  demo = value(createAttentionEvent(demo, { patientId: "may", sourceRecordId: first.sourceRecordIds[0], taskId: first.id, scenario: "after-visit-task" }));
  await start(page, demo, `/care?task=${first.id}`);
  await page.getByTestId("aftervisit-complete").click();
  await expect(page.getByTestId("task-status")).toHaveText("已記錄此事項");
  expect((await snapshot(page)).tasks.find(t => t.id === first.id)?.status).toBe("completed");
  expect((await snapshot(page)).events[0]).toMatchObject({ status: "resolved", response: "" });
  await page.goto("/care"); await page.getByLabel("本人提供的虛構事項").fill("Second local task");
  await page.getByTestId("aftervisit-preview").click(); await page.getByTestId("aftervisit-save").click();
  const second = (await snapshot(page)).tasks.at(-1)!;
  await page.goto(`/care?task=${second.id}`); await page.getByTestId("task-cancel").click(); await page.getByTestId("task-cancel-confirm").click();
  expect((await snapshot(page)).tasks.at(-1)?.status).toBe("cancelled");
  await page.goto("/sharing"); await page.getByTestId("level-full").check(); await page.getByTestId("category-appointments").check();
  await page.getByTestId("sharing-review").click(); await page.getByTestId("sharing-confirm").click();
  const before = await snapshot(page);
  await actor(page, "david", "/care"); await page.getByTestId("shared-accompany").click();
  await page.getByTestId("accompany-complete-task-accompany-appt-gp").click();
  const completed = await snapshot(page);
  expect(completed.tasks.find(t => t.id === "task-accompany-appt-gp")).toMatchObject({ ownerId: "david", status: "completed" });
  expect(completed.appointments).toEqual(before.appointments);
  await page.getByTestId("shared-accompany").click();
  expect((await snapshot(page)).tasks.find(t => t.id === "task-accompany-appt-gp")?.status).toBe("completed");
});

test("factual_completion_cannot_bypass_clinical_workflows_or_current_accompaniment_rights", () => {
  const demo = authorised(); demo.grants[0].level = "full"; demo.grants[0].categories.push("appointments");
  for (const task of demo.tasks) expect(completePersonalTask(demo, task.id)).toMatchObject({ ok: false, code: "factual-task-required" });
  demo.context = { actorId: "david", patientId: "may", perspective: "caregiver" };
  const accompanied = value(createAccompanyTask(demo, "appt-gp")); const task = accompanied.tasks.at(-1)!;
  expect(completePersonalTask({ ...accompanied, grants: [] }, task.id)).toMatchObject({ ok: false, code: "task-unavailable" });
  const completed = value(completePersonalTask(accompanied, task.id));
  expect(completed.appointments).toEqual(demo.appointments); expect(completed.medicationDoses).toEqual(demo.medicationDoses);
});

class LocalStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, text: string) { if (this.failWrites) throw new DOMException("full", "QuotaExceededError"); this.values.set(key, text); }
  removeItem(key: string) { this.values.delete(key); }
}
for (const mutation of ["respond", "resolve"] as const) for (const restriction of ["revoke", "category", "event-only"] as const) for (const memoryOnly of [false, true]) test(`latest ${restriction} is rechecked before ${mutation}, memoryOnly=${memoryOnly}`, () => {
  const priorStore = useAppStore.getState(); const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new LocalStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, sessionStorage: new LocalStorage() } });
  try {
    let demo = createScenario("caregiver-alert"); demo.grants[0] = { ...demo.grants[0], level: "full", categories: ["body", "measurements"], revision: 2 };
    if (mutation === "resolve") demo = value(respondToEvent(demo, "event-fixture-attention", { actorId: "david", decision: "accept", note: "STORED_RESPONSE" }));
    const local = structuredClone(demo); local.observations[0].note = "UNSAVED_SOURCE";
    local.tasks[0].workflowRevision = 1;
    local.checkIns.push({ id: "check-history", draftId: "draft-history", patientId: "may", occurredAt: local.clock, enteredAt: local.clock, mood: "okay", body: "well", note: "history", taskId: "task-bp", revision: 1 });
    local.tasks[0].sourceRecordIds.push("check-history");
    local.tasks[0].completionHistory = [{ checkInId: "check-history", checkInRevision: 1, measurementId: "bp-16", episodeId: "episode-dizzy", priorDisposition: "ordinary" }];
    const remote = structuredClone(memoryOnly ? demo : local);
    if (restriction === "revoke") remote.grants[0].status = "revoked";
    if (restriction === "category") remote.grants[0].categories = ["measurements"];
    if (restriction !== "category") remote.events[0].status = "revoked"; // Independent equal-revision revocation, or category restriction alone.
    expect(isDemoState(local)).toBe(true); expect(isDemoState(remote)).toBe(true);
    storage.setItem("caremate-v4", JSON.stringify(remote));
    useAppStore.setState({ demo: local, persistenceError: memoryOnly ? "QuotaExceededError" : null, activeEmergencyEpisodeId: null });
    const result = mutation === "respond" ? useAppStore.getState().respondToEvent("event-fixture-attention", { actorId: "david", decision: "accept", note: "NEW_NOTE" }) : useAppStore.getState().resolveEvent("event-fixture-attention", "david");
    expect(result).toEqual({ ok: false, code: "event-unavailable" });
    const actual = useAppStore.getState().demo;
    expect(actual.tasks).toEqual(local.tasks); expect(actual.observations).toEqual(local.observations); expect(actual.checkIns).toEqual(local.checkIns); expect(actual.context).toEqual(local.context); expect(actual.events[0].response).toBe(local.events[0].response);
    if (restriction !== "category") expect(actual.events[0].status).toBe("revoked");
    expect(selectSharingProjection(actual, "may", "david").events).toEqual([]);
  } finally {
    useAppStore.setState(priorStore, true); if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("May_changing_accepted_task_time_invalidates_the_old_agreement", () => {
  const initial = afterVisit(); const task = initial.tasks.at(-1)!;
  let demo = value(createAttentionEvent(initial, { patientId: "may", sourceRecordId: task.sourceRecordIds[0], taskId: task.id, scenario: "after-visit-task" }));
  demo.context = { actorId: "david", patientId: "may", perspective: "caregiver" };
  demo = value(respondToEvent(demo, demo.events[0].id, { actorId: "david", decision: "accept", note: "Agreed to the original time" }));
  demo.context = { actorId: "may", patientId: "may", perspective: "patient" };
  const revised = value(rescheduleTask(demo, task.id, "2026-09-18T11:00:00+08:00"));
  expect(revised.tasks.at(-1)).toMatchObject({ ownerId: "may", proposedOwnerId: null, status: "scheduled" });
  expect(revised.events[0]).toMatchObject({ status: "revoked", response: "Agreed to the original time" });
  expect(revised.healthRecords).toEqual(demo.healthRecords);
  revised.context = { actorId: "david", patientId: "may", perspective: "caregiver" };
  expect(resolveEvent(revised, revised.events[0].id, "david")).toEqual({ ok: false, code: "event-unavailable" });
});

test("withdrawn_accepted_task_cannot_be_completed_from_an_open_caregiver_detail", async ({ page, context }) => {
  const initial = afterVisit(); const task = initial.tasks.at(-1)!;
  let demo = value(createAttentionEvent(initial, { patientId: "may", sourceRecordId: task.sourceRecordIds[0], taskId: task.id, scenario: "after-visit-task" }));
  demo.context = { actorId: "david", patientId: "may", perspective: "caregiver" };
  demo = value(respondToEvent(demo, demo.events[0].id, { actorId: "david", decision: "accept", note: "Local agreement" }));
  await start(page, demo, `/notifications?event=${demo.events[0].id}`);
  await expect(page.getByTestId("event-resolve")).toBeVisible();
  const may = await context.newPage(); await actor(may, "may", `/care?task=${task.id}`);
  await may.getByTestId("task-cancel").click(); await may.getByTestId("task-cancel-confirm").click();
  await expect(page.getByTestId("event-unavailable")).toBeVisible();
  expect((await snapshot(page)).tasks.at(-1)?.status).toBe("cancelled");
  expect((await snapshot(page)).healthRecords).toEqual(initial.healthRecords);
});

test("memory_only_response_and_resolution_keep_local_work_then_persist_recovery", () => {
  const priorStore = useAppStore.getState(); const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window"); const storage = new LocalStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, sessionStorage: new LocalStorage() } });
  try {
    const initial = afterVisit(); const task = initial.tasks.at(-1)!;
    const created = value(createAttentionEvent(initial, { patientId: "may", sourceRecordId: task.sourceRecordIds[0], taskId: task.id, scenario: "after-visit-task" }));
    storage.setItem("caremate-v4", JSON.stringify(created)); storage.failWrites = true;
    const local = structuredClone(created); local.observations[0].note = "UNSAVED_NOTE"; local.context = { actorId: "david", patientId: "may", perspective: "caregiver" };
    useAppStore.setState({ demo: local, persistenceError: "QuotaExceededError", activeEmergencyEpisodeId: null });
    expect(useAppStore.getState().respondToEvent(created.events[0].id, { actorId: "david", decision: "accept", note: "LOCAL_RESPONSE" }).ok).toBe(true);
    expect(useAppStore.getState().demo.tasks.at(-1)).toMatchObject({ ownerId: "david", status: "scheduled" });
    expect(useAppStore.getState().persistenceError).toBe("QuotaExceededError");
    expect(useAppStore.getState().resolveEvent(created.events[0].id, "david").ok).toBe(true);
    const completed = useAppStore.getState().demo;
    expect(completed.tasks.at(-1)?.status).toBe("completed"); expect(completed.events[0]).toMatchObject({ status: "resolved", response: "LOCAL_RESPONSE" });
    expect(completed.observations).toEqual(local.observations); expect(completed.healthRecords).toEqual(local.healthRecords); expect(completed.context).toEqual(local.context);
    storage.failWrites = false; useAppStore.getState().persistNow();
    expect(JSON.parse(storage.getItem("caremate-v4")!).tasks).toEqual(completed.tasks); expect(useAppStore.getState().persistenceError).toBeNull();
  } finally { useAppStore.setState(priorStore, true); if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow); else Reflect.deleteProperty(globalThis, "window"); }
});

test("revoked_or_downgraded_event_cannot_reveal_old_payload", async ({ page, context }) => {
  const demo = createScenario("caregiver-alert"); demo.grants[0].level = "full";
  demo.tasks[demo.tasks.length - 1].kind = "after-visit";
  demo.tasks[demo.tasks.length - 1].title = { zh: "PRIVATE_TASK_PAYLOAD", en: "PRIVATE_TASK_PAYLOAD" };
  await start(page, demo, "/notifications"); await page.getByTestId("event-open-event-fixture-attention").click();
  await expect(page.getByTestId("event-detail")).toContainText("PRIVATE_TASK_PAYLOAD");
  const may = await context.newPage(); await actor(may, "may", "/sharing");
  await may.getByTestId("level-alerts-only").check(); await may.getByTestId("sharing-review").click(); await may.getByTestId("sharing-confirm").click();
  await expect(page.getByTestId("event-detail")).not.toContainText("PRIVATE_TASK_PAYLOAD");
  await page.getByTestId("event-note").fill("UNSAVED_PRIVATE_NOTE");
  await may.getByTestId("sharing-revoke").click(); await may.getByTestId("revoke-confirm").click();
  await expect(page.getByTestId("event-unavailable")).toBeVisible();
  await expect(page.getByTestId("shared-view")).not.toContainText("UNSAVED_PRIVATE_NOTE");
  await expect(page.getByTestId("event-accept")).toHaveCount(0);
  expect((await snapshot(page)).tasks.find(t => t.id === "task-fixture-attention")?.ownerId).toBe("may");
});
