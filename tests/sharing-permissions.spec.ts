import { expect, test, type Page } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import { setConsent, revokeConsent, selectSharingProjection, sharedExportText, shareCategories, sharingLevels, recipients } from "../src/lib/demo/sharing";
import { useAppStore } from "../src/lib/store";
import { isDemoState } from "../src/lib/demo/persistence";
import { openBriefDraft, confirmBrief } from "../src/lib/demo/brief";
import { createAccompanyTask } from "../src/lib/demo/care";
import type { DemoState } from "../src/lib/demo/types";

async function start(page: Page, demo = createScenario("share-needed"), path = "/sharing") {
  await page.addInitScript(d => { if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(d)); }, demo);
  await page.goto(path);
}
test("permission_levels_have_exact_allowed_content", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("sharing-page")).toBeVisible();
  await expect(page.getByTestId("category-mood")).not.toBeChecked();
  await page.getByTestId("level-summary").check();
  await page.getByTestId("category-body").check();
  await page.getByTestId("sharing-review").click();
  await expect(page.getByTestId("sharing-preview")).not.toContainText("151");
  await page.getByTestId("sharing-confirm").click();
  await expect(page.getByRole("status").filter({ hasText: "已更新分享設定" })).toBeVisible();
});
test("may_alone_can_change_grants_for_each_recipient", async ({ page }) => {
  await start(page, createScenario("caregiver-alert"));
  await expect(page.getByTestId("sharing-readonly")).toBeVisible();
  await expect(page.getByTestId("sharing-confirm")).toHaveCount(0);
});
test("unshared_mood_and_private_tasks_are_absent_from_caregiver_projection", async ({ page }) => {
  const demo = createScenario("caregiver-alert");
  demo.grants[0].level = "full";
  const base = demo.tasks.find(t => t.id === "task-fixture-attention")!;
  demo.tasks.push({ ...base, id: "secret-mood", shareCategory: "mood", title: { zh: "SECRET_MOOD", en: "SECRET_MOOD" } }, { ...base, id: "secret-private", shareCategory: "private", title: { zh: "SECRET_PRIVATE", en: "SECRET_PRIVATE" } });
  await start(page, demo, "/family");
  await expect(page.getByTestId("shared-view")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("SECRET_");
  await expect(page.getByTestId("shared-task-count")).toHaveText("1");
});
test("revoke_removes_appointment_brief_event_and_open_detail", async ({ page, context }) => {
  const demo = createScenario("caregiver-alert");
  demo.grants[0].level = "full"; demo.grants[0].categories = ["body", "appointments", "measurements"];
  await start(page, demo, "/family");
  await page.getByTestId("shared-record-bp-16").click();
  await expect(page.getByTestId("shared-detail")).toContainText("151");
  const may = await context.newPage(); await may.goto("/dev");
  await may.getByTestId("perspective-may").click(); await may.goto("/sharing");
  await may.getByTestId("sharing-revoke").click(); await may.getByTestId("revoke-confirm").click();
  await expect(page.getByTestId("shared-detail")).toHaveCount(0);
  await expect(page.getByTestId("shared-empty")).toBeVisible();
  for (const path of ["/family", "/brief", "/book", "/health?record=bp-16", "/report", "/ask", "/memory", "/care", "/print"]) {
    await page.goto(path);
    await expect(page.getByTestId("shared-empty")).toBeVisible();
    await expect(page.getByTestId("shared-view")).not.toContainText("151");
  }
  const stored: DemoState = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
  expect(stored.observations.some(o => o.systolic === 151)).toBe(true);
});

function value<T>(result: { ok: true; value: T } | { ok: false; code: string }): T { expect(result.ok).toBe(true); if (!result.ok) throw Error(result.code); return result.value; }
function privacyFixture() {
  const state = createScenario("caregiver-alert"); state.context = { actorId: "may", patientId: "may", perspective: "patient" }; state.grants = [];
  state.checkIns.push({ id: "check-mixed", draftId: "draft-old", patientId: "may", occurredAt: state.clock, enteredAt: state.clock, mood: "low", body: "dizzy", note: "SECRET_CHECKIN_NOTE", revision: 1 });
  state.observations[0].note = "SECRET_MEASUREMENT_NOTE";
  const body = state.healthRecords.find(r => r.category === "body")!;
  state.healthRecords.push({ ...body, id: "mixed-organised", source: "organised", text: { zh: "SECRET_MIXED_BP_MOOD_MED", en: "SECRET_MIXED_BP_MOOD_MED" } }, { ...body, id: "private-record", category: "private", text: { zh: "SECRET_PRIVATE_RECORD", en: "SECRET_PRIVATE_RECORD" } });
  const task = state.tasks.at(-1)!;
  state.tasks = [...shareCategories, "private" as const].map(category => ({ ...task, id: `task-${category}`, shareCategory: category, title: { zh: `SECRET_RAW_${category}`, en: `SECRET_RAW_${category}` }, contactNote: "SECRET_CONTACT_NOTE", workflowRevision: 4, revision: 7, sourceRecordIds: ["private-record", "bp-16", "check-mixed"], completionHistory: [{ checkInId: "SECRET_HISTORY", checkInRevision: 1, measurementId: "bp-16", episodeId: null, priorDisposition: "open" as const }] }));
  state.events = shareCategories.map(category => ({ id: `event-${category}`, patientId: "may", recipientId: "david", triggerId: "SECRET_TRIGGER", taskId: `task-${category}`, category, status: "pending", occurredAt: state.clock, response: "SECRET_RESPONSE", sourceRecordIds: ["private-record", "bp-16"], revision: 1 }));
  return state;
}
for (const level of sharingLevels) for (const category of shareCategories) {
  test(`permission matrix ${level} / ${category} / revoke`, () => {
    const original = privacyFixture();
    const active = value(setConsent(original, { patientId: "may", recipientId: "david", level, categories: [category] }));
    expect(active.tasks).toEqual(original.tasks);
    const p = selectSharingProjection(active, "may", "david");
    const serial = JSON.stringify(p);
    expect(serial).not.toContain("SECRET_");
    expect(p.categories).toEqual([category]);
    expect(p.events.map(e => e.id)).toEqual([`event-${category}`]);
    expect(p.sourceRecordIds).not.toContain("private-record");
    if (level === "alerts-only") {
      expect(p.summary).toEqual([]); expect(p.records).toEqual([]); expect(p.tasks).toEqual([]); expect(p.appointments).toEqual([]); expect(p.sourceRecordIds).toEqual([]);
      expect(sharedExportText(active, "may", "david", "en").ok).toBe(false);
    } else {
      expect(p.tasks.map(t => t.id)).toEqual([`task-${category}`]);
      expect(p.appointments.length).toBe(category === "appointments" ? 1 : 0);
      if (level === "summary") { expect(p.records).toEqual([]); expect(p.checkIns).toEqual([]); expect(p.observations).toEqual([]); expect(p.reports).toEqual([]); expect(p.medicationDoses).toEqual([]); }
      else {
        expect(p.observations.length > 0).toBe(category === "measurements");
        expect(p.reports.length > 0).toBe(category === "measurements");
        expect(p.medicationDoses.length > 0).toBe(category === "medication");
        if (category === "body") { expect(p.checkIns[0].body).toBe("dizzy"); expect(p.checkIns[0]).not.toHaveProperty("mood"); }
        if (category === "mood") { expect(p.checkIns[0].mood).toBe("low"); expect(p.checkIns[0]).not.toHaveProperty("body"); }
      }
      expect(value(sharedExportText(active, "may", "david", "en"))).not.toContain("SECRET_");
    }
    const revoked = value(revokeConsent(active, "grant-david"));
    const denied = selectSharingProjection(revoked, "may", "david");
    for (const key of ["summary", "records", "observations", "reports", "checkIns", "medicationDoses", "tasks", "events", "appointments", "briefs", "sourceRecordIds"] as const) expect(denied[key]).toEqual([]);
    expect(sharedExportText(revoked, "may", "david", "en").ok).toBe(false);
    expect(revoked.tasks).toEqual(original.tasks);
    expect(revoked.healthRecords).toEqual(original.healthRecords);
    expect(revoked.checkIns).toEqual(original.checkIns);
    expect(revoked.events.find(e => e.category === category)?.status).toBe("revoked");
  });
}
test("grant authority, independent recipients, current export and accompaniment", () => {
  let s = privacyFixture();
  for (const [index, recipientId] of recipients.entries()) s = value(setConsent(s, { patientId: "may", recipientId, level: "full", categories: [shareCategories[index]] }));
  expect(recipients.map(id => selectSharingProjection(s, "may", id).categories)).toEqual([["body"], ["mood"], ["measurements"]]);
  const david: DemoState = { ...s, context: { actorId: "david", patientId: "may", perspective: "caregiver" } };
  expect(setConsent(david, { patientId: "may", recipientId: "david", level: "full", categories: shareCategories })).toEqual({ ok: false, code: "patient-only" });
  expect(revokeConsent(david, "grant-david")).toEqual({ ok: false, code: "patient-only" });
  expect(sharedExportText(david, "may", "doctor-wong", "en").ok).toBe(false);
  expect(createAccompanyTask(david, "appt-gp").ok).toBe(false);
  s = value(setConsent(s, { patientId: "may", recipientId: "david", level: "summary", categories: ["appointments"] }));
  const accompanied = value(createAccompanyTask({ ...s, context: david.context }, "appt-gp"));
  expect(accompanied.appointments).toEqual(s.appointments);
  expect(accompanied.tasks.at(-1)).toMatchObject({ patientId: "may", ownerId: "david", kind: "accompany" });
  s = value(revokeConsent({ ...accompanied, context: s.context }, "grant-david"));
  expect(createAccompanyTask({ ...s, context: david.context }, "appt-gp").ok).toBe(false);
  expect(selectSharingProjection(s, "may", "doctor-wong").observations).not.toEqual([]);
});
test("downgrade removes source records and invalidates recipient brief only", () => {
  let s = privacyFixture();
  s = value(setConsent(s, { patientId: "may", recipientId: "david", level: "full", categories: shareCategories }));
  s.briefs = ["may", "david"].map(recipientId => ({ id: `brief-${recipientId}`, patientId: "may", recipientId: recipientId as "may" | "david", appointmentId: "appt-gp", appointmentRevision: 1, grantRevision: 1, status: "confirmed", revision: 1, generatedAt: s.clock, confirmedAt: s.clock, sections: [{ id: "section-private", category: "private", title: { zh: "SECRET_BRIEF", en: "SECRET_BRIEF" }, text: { zh: "SECRET_BRIEF", en: "SECRET_BRIEF" }, sourceRecordIds: ["private-record"] }], questions: [], sourceRecordIds: ["private-record"], sourceRevisions: {}, includeMood: true }));
  expect(value(sharedExportText(s, "may", "david", "en"))).not.toContain("SECRET_BRIEF");
  const downgraded = value(setConsent(s, { patientId: "may", recipientId: "david", level: "summary", categories: ["body"] }));
  expect(downgraded.grants[0].revision).toBe(2);
  expect(downgraded.briefs[0]).toEqual(s.briefs[0]);
  expect(downgraded.briefs[1]).toMatchObject({ status: "draft", confirmedAt: null, revision: 2 });
  expect(value(sharedExportText(downgraded, "may", "david", "en"))).not.toContain("mmHg");
  expect(selectSharingProjection(downgraded, "may", "david").sourceRecordIds).toEqual([]);
});
test("open manual export and detail update on cross-tab downgrade, actor survives refresh", async ({ page, context }) => {
  const demo = createScenario("caregiver-alert"); demo.grants[0].level = "full"; demo.grants[0].categories = ["body", "measurements"];
  await start(page, demo, "/family");
  await page.getByTestId("shared-record-bp-16").click(); await page.getByTestId("shared-export-open").click();
  await page.getByTestId("brief-confirm").click();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByTestId("visit-copy").click();
  await expect(page.getByTestId("brief-copy-fallback")).toContainText("151/94");
  const may = await context.newPage(); await may.goto("/dev"); await may.getByTestId("perspective-may").click(); await may.goto("/sharing");
  await may.getByTestId("level-summary").check(); await may.getByTestId("category-measurements").uncheck(); await may.getByTestId("sharing-review").click(); await may.getByTestId("sharing-confirm").click();
  await expect(page.getByTestId("shared-detail")).toHaveCount(0);
  await expect(page.getByTestId("brief-copy-fallback")).toHaveCount(0);
  await expect(page.getByTestId("shared-export")).not.toContainText("151/94");
  await page.reload(); await expect(page.getByTestId("shared-view")).toBeVisible();
  await expect(page.getByTestId("shared-view")).not.toContainText("mmHg");
  await may.reload(); await expect(may.getByTestId("sharing-page")).toBeVisible();
});

test("320px English preview, cancellation, other-recipient export and clipboard failure", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "en", liteMode: true, introComplete: true }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
  });
  const requests: string[] = []; page.on("request", request => { if (request.url().includes("/api/")) requests.push(request.url()); });
  await start(page);
  await page.getByTestId("recipient-doctor-wong").click(); await page.getByTestId("level-full").check(); await page.getByTestId("category-measurements").check();
  await page.getByTestId("sharing-review").click(); await page.getByRole("button", { name: "Back to edit" }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!))).grants).toEqual([]);
  await page.getByTestId("sharing-review").click(); await page.getByTestId("sharing-confirm").click();
  await page.getByTestId("shared-copy").click(); await expect(page.getByTestId("shared-export")).toBeVisible();
  await page.getByTestId("brief-confirm").click();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByTestId("visit-copy").click();
  await expect(page.getByTestId("brief-copy-fallback")).toContainText("151/94");
  await expect(page.getByTestId("brief-copy-result")).toContainText("Could not copy");
  await expect(page.getByTestId("brief-copy-fallback")).not.toContainText("Atorvastatin");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.getByTestId("shared-copy").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(requests).toEqual([]);
});
test("caregiver can add only own accompaniment and scenario reset removes previous grant", async ({ page }) => {
  const demo = createScenario("caregiver-alert"); demo.grants[0].level = "summary"; demo.grants[0].categories = ["appointments"];
  await start(page, demo, "/book");
  await page.getByTestId("shared-accompany").click(); await expect(page.getByRole("status")).toContainText("已加入我的本地陪同事項");
  const saved: DemoState = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
  expect(saved.appointments).toEqual(demo.appointments); expect(saved.tasks.at(-1)).toMatchObject({ patientId: "may", ownerId: "david" });
  await page.goto("/dev"); await page.getByTestId("demo-reset").click(); await expect(page.getByTestId("today-page")).toBeVisible(); await page.reload();
  await expect(page.getByTestId("today-page")).toBeVisible();
  const reset: DemoState = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
  expect(reset.grants).toEqual([]); expect(reset.context.actorId).toBe("may");
});
test("explicitly categorised after-visit text is full-only; unclassified text stays private", () => {
  const original = privacyFixture(); const base = original.tasks[0];
  original.tasks.push({ ...base, id: "after-chosen", kind: "after-visit", title: { zh: "CHOSEN_BODY_INSTRUCTION", en: "CHOSEN_BODY_INSTRUCTION" } });
  const full = value(setConsent(original, { patientId: "may", recipientId: "david", level: "full", categories: ["body"] }));
  expect(value(sharedExportText(full, "may", "david", "en"))).toContain("CHOSEN_BODY_INSTRUCTION");
  const summary = value(setConsent(full, { patientId: "may", recipientId: "david", level: "summary", categories: ["body"] }));
  expect(value(sharedExportText(summary, "may", "david", "en"))).not.toContain("CHOSEN_BODY_INSTRUCTION");
});

test("storage failure keeps new consent and revocation usable in memory", async ({ page }) => {
  await start(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); }; });
  await page.getByTestId("level-full").check(); await page.getByTestId("category-measurements").check();
  await page.getByTestId("sharing-review").click(); await page.getByTestId("sharing-confirm").click();
  await expect(page.getByTestId("persistence-error")).toBeVisible();
  await page.getByTestId("shared-export-open").click();
  await page.getByTestId("brief-confirm").click();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByTestId("visit-copy").click();
  await expect(page.getByTestId("brief-copy-fallback")).toContainText("151/94");
  await page.getByTestId("sharing-revoke").click(); await page.getByTestId("revoke-confirm").click();
  await expect(page.getByTestId("shared-empty")).toBeVisible();
  await expect(page.getByTestId("shared-copy")).toHaveCount(0);
});

class ConflictStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new DOMException("full", "QuotaExceededError"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
for (const collision of ["revoke", "summary", "category", "disjoint", "event-only"] as const) for (const entry of ["refresh", "write"] as const) {
  test(`equal revision conflict ${collision} at ${entry} fails closed without losing unsaved work`, () => {
    const priorStore = useAppStore.getState();
    const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const localStorage = new ConflictStorage();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, sessionStorage: new ConflictStorage() } });
    try {
      const initial = createScenario("caregiver-alert"); initial.context = { actorId: "may", patientId: "may", perspective: "patient" };
      initial.grants[0] = { ...initial.grants[0], level: "full", categories: ["body", "measurements"] };
      initial.checkIns.push({ id: "history-check", draftId: "history-draft", patientId: "may", occurredAt: initial.clock, enteredAt: initial.clock, mood: "okay", body: "well", note: "historical", taskId: "task-bp", revision: 1 });
      initial.tasks[0].workflowRevision = 1;
      initial.tasks[0].sourceRecordIds.push("history-check");
      initial.tasks[0].completionHistory = [{ checkInId: "history-check", checkInRevision: 1, measurementId: "bp-16", episodeId: "episode-dizzy", priorDisposition: "ordinary" }];
      expect(isDemoState(initial)).toBe(true);
      localStorage.setItem("caremate-v4", JSON.stringify(initial));
      useAppStore.setState({ demo: initial, persistenceError: null, toast: null, activeEmergencyEpisodeId: null });
      localStorage.failWrites = true;
      expect(useAppStore.getState().setConsent({ patientId: "may", recipientId: "david", level: "full", categories: ["body", "measurements", "medication"] }).ok).toBe(true);
      expect(useAppStore.getState().persistenceError).toBe("QuotaExceededError");
      expect(useAppStore.getState().saveObservation({ ...initial.observations[0], systolic: 148, note: "UNSAVED_NOTE" }).ok).toBe(true);
      expect(useAppStore.getState().recordContactOutcome("task-fixture-attention", "left-message", "UNSAVED_CONTACT").ok).toBe(true);
      const local = useAppStore.getState().demo;
      // Another local change gave this event the same revision as the remote revocation.
      const unsaved = { ...local, context: { actorId: "david" as const, patientId: "may" as const, perspective: "caregiver" as const }, events: local.events.map(e => ({ ...e, status: "acknowledged" as const, revision: 2 })) };
      // Valid confirmations now carry packet/source fingerprints; legacy hand-written cached text is a draft.
      let reviewed: DemoState = { ...unsaved, context: { actorId: "may", patientId: "may", perspective: "patient" } };
      for (const recipientId of [undefined, "david"] as const) {
        reviewed = value(openBriefDraft(reviewed, "appt-gp", recipientId));
        reviewed = value(confirmBrief(reviewed, reviewed.briefs.at(-1)!.id));
      }
      unsaved.briefs = reviewed.briefs;
      useAppStore.setState({ demo: unsaved });
      const remote = collision === "revoke" ? value(revokeConsent(initial, "grant-david")) : value(setConsent(initial, { patientId: "may", recipientId: "david", level: collision === "summary" ? "summary" : "full", categories: collision === "disjoint" ? ["mood"] : collision === "event-only" ? ["body", "measurements", "medication"] : ["body"] }));
      remote.events = remote.events.map(e => ({ ...e, status: "revoked", revision: 2 }));
      expect(remote.grants[0].revision).toBe(unsaved.grants[0].revision);
      localStorage.values.set("caremate-v4", JSON.stringify(remote));
      if (entry === "refresh") useAppStore.getState().syncFromStorage();
      else { localStorage.failWrites = false; useAppStore.getState().persistNow(); }
      const merged = useAppStore.getState().demo;
      expect(merged.context).toEqual(unsaved.context);
      expect(merged.observations).toEqual(unsaved.observations);
      expect(merged.tasks).toEqual(unsaved.tasks);
      expect(merged.checkIns).toEqual(unsaved.checkIns);
      expect(merged.healthRecords).toEqual(unsaved.healthRecords);
      const projection = selectSharingProjection(merged, "may", "david");
      const exported = sharedExportText(merged, "may", "david", "en");
      if (collision === "revoke" || collision === "disjoint") {
        expect(projection.status).toBe("revoked"); expect(exported.ok).toBe(false); expect(projection.records).toEqual([]);
      } else if (collision !== "event-only") {
        expect(projection.categories).toEqual(["body"]); expect(projection.level).toBe(collision === "summary" ? "summary" : "full");
        expect(value(exported)).not.toContain("mmHg"); expect(value(exported)).not.toContain("Atorvastatin");
      }
      expect(merged.events[0].status).toBe("revoked");
      expect(projection.events).toEqual([]);
      expect(merged.briefs[0]).toEqual(unsaved.briefs[0]);
      expect(merged.briefs[1].status).toBe(collision === "event-only" ? "confirmed" : "draft");
      // Recovery must persist the restrictive result, never resurrect the unsaved active snapshot.
      localStorage.failWrites = false; useAppStore.getState().persistNow();
      const saved: DemoState = JSON.parse(localStorage.getItem("caremate-v4")!);
      expect(saved.grants).toEqual(merged.grants); expect(saved.events).toEqual(merged.events);
      expect(saved.tasks).toEqual(unsaved.tasks); expect(saved.observations).toEqual(unsaved.observations);
      expect(useAppStore.getState().persistenceError).toBeNull();
      expect(sharedExportText(saved, "may", "david", "en")).toEqual(exported);
      // A stale same-revision full snapshot cannot widen the already-resolved view,
      // even when the tab is healthy. Repeated refresh is idempotent.
      localStorage.values.set("caremate-v4", JSON.stringify(unsaved));
      useAppStore.getState().syncFromStorage();
      expect(selectSharingProjection(useAppStore.getState().demo, "may", "david")).toEqual(projection);
      useAppStore.getState().syncFromStorage();
      expect(selectSharingProjection(useAppStore.getState().demo, "may", "david")).toEqual(projection);
      // A subsequent explicit May decision receives a higher revision and can regrant.
      useAppStore.setState({ demo: { ...useAppStore.getState().demo, context: initial.context } });
      expect(useAppStore.getState().setConsent({ patientId: "may", recipientId: "david", level: "full", categories: ["measurements"] }).ok).toBe(true);
      expect(selectSharingProjection(useAppStore.getState().demo, "may", "david").observations.length).toBeGreaterThan(0);
      expect(useAppStore.getState().demo.grants[0].revision).toBe(3);
    } finally {
      useAppStore.setState(priorStore, true);
      if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow); else Reflect.deleteProperty(globalThis, "window");
    }
  });
}
