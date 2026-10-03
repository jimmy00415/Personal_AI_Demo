import { expect, test } from "@playwright/test";
import { createScenario, scenarioIds } from "../src/lib/demo/scenarios";
import { selectContext, selectToday } from "../src/lib/demo/selectors";
import { loadDemo, saveDemo, loadPreferences, savePreferences, getEmergencySession, setEmergencySession } from "../src/lib/demo/persistence";
import { useAppStore } from "../src/lib/store";
import { applyLegacyPatch, projectLegacy } from "../src/lib/demo/legacy";

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("legacy_roundtrips_preserve_domain_only_task_facts_and_revisions", () => {
  for (const id of ["after-visit", "dizziness"] as const) {
    const demo = createScenario(id);
    demo.tasks.find(t => t.id === "task-amlo")!.status = "snoozed";
    expect(applyLegacyPatch(demo, structuredClone(projectLegacy(demo, null)))).toEqual(demo);
  }
});

test("medication_completion_requires_dose_confirmation_and_changes_only_selected_task", () => {
  const demo = createScenario("after-visit");
  demo.tasks.find(t => t.id === "task-amlo")!.status = "snoozed";
  useAppStore.setState({ demo, ...projectLegacy(demo, null) });
  useAppStore.getState().completeTask("task-ator");
  expect(useAppStore.getState().demo).toEqual(demo);
  useAppStore.getState().setDoseStatus("dose-task-ator", "user_confirmed_taken");
  const changed = useAppStore.getState().demo;
  expect(changed.tasks.find(t => t.id === "task-ator")).toEqual({ ...demo.tasks.find(t => t.id === "task-ator"), status: "completed", revision: 2 });
  expect(changed.tasks.filter(t => t.id !== "task-ator")).toEqual(demo.tasks.filter(t => t.id !== "task-ator"));
  useAppStore.getState().setDoseStatus("dose-task-ator", "user_confirmed_taken");
  expect(useAppStore.getState().demo).toEqual(changed);
  useAppStore.getState().completeTask("task-fixture-attention");
  expect(useAppStore.getState().demo.tasks.find(t => t.id === "task-fixture-attention")).toEqual(demo.tasks.find(t => t.id === "task-fixture-attention"));
  useAppStore.getState().resetDemo();
});

test("persistence_rejects_unknown_journey_phase", () => {
  const demo = createScenario("dizziness");
  const invalid = { ...demo, episodes: [{ ...demo.episodes[0], phase: "not-a-phase" }] };
  const storage = new MemoryStorage();
  storage.setItem("caremate-v4", JSON.stringify(invalid));
  expect(loadDemo(storage)).toEqual({ ok: false, code: "UnsupportedSnapshot" });
});

test("legacy_contact_edits_survive_when_the_task_status_is_already_completed", () => {
  const demo = createScenario("after-visit");
  demo.tasks.push({ ...demo.tasks[3], id: "task-contact", kind: "contact", status: "completed", contactOutcome: "left_message" });
  const next = applyLegacyPatch(demo, { tasks: projectLegacy(demo, null).tasks, contactStatus: "contacted", contactNote: "Reached clinic" });
  expect(next.tasks.find(t => t.id === "task-contact")).toEqual({ ...demo.tasks[4], contactOutcome: "contacted", contactNote: "Reached clinic", revision: 2 });
  expect(next.tasks.slice(0, 4)).toEqual(demo.tasks.slice(0, 4));
});

test("persistence_rejects_cross_collection_source_id_collisions", () => {
  for (const collection of ["observations", "medicationDoses", "appointments", "reports"] as const) {
    const demo = createScenario("dizziness");
    demo[collection].push({ ...demo[collection][0], id: "rec-dizzy" } as never);
    const storage = new MemoryStorage();
    storage.setItem("caremate-v4", JSON.stringify(demo));
    expect(loadDemo(storage), collection).toEqual({ ok: false, code: "UnsupportedSnapshot" });
  }
  const demo = createScenario("dizziness");
  demo.checkIns.push({ id: "rec-dizzy", patientId: "may", draftId: "draft-1", occurredAt: demo.clock, enteredAt: demo.clock, mood: "okay", body: "well", note: "", revision: 1 });
  expect(saveDemo(new MemoryStorage(), demo)).toEqual({ ok: false, code: "UnsupportedSnapshot" });
});

test("context_is_explicit_and_legacy_data_is_not_reassigned", () => {
  const storage = new MemoryStorage();
  storage.setItem("caremate-v3", '{"records":[{"personId":"lai-wah"}]}');
  expect(loadDemo(storage)).toEqual({ ok: true, value: null });
  useAppStore.getState().applyScenario("dizziness");
  useAppStore.getState().setPerspective("david");
  expect(useAppStore.getState().demo.context).toEqual({ actorId: "david", patientId: "may", perspective: "caregiver" });
  useAppStore.getState().setViewingPerson("lai-wah");
  expect(useAppStore.getState().demo.context.actorId).toBe("david");
  useAppStore.getState().setPerspective("may");
  const demo = useAppStore.getState().demo;
  expect(selectContext(demo, "may")).toEqual({ actorId: "may", patientId: "may", perspective: "patient" });
  expect(demo.healthRecords.every(r => r.patientId === "may")).toBe(true);
  expect(JSON.stringify(demo)).not.toContain("lai-wah");
  expect(saveDemo(storage, demo).ok).toBe(true);
  expect(storage.getItem("caremate-v3")).toBe('{"records":[{"personId":"lai-wah"}]}');
});

test("persona_conditions_are_seeded_without_inferred_diagnosis_or_new_prescription", () => {
  const demo = createScenario("dizziness");
  expect(demo.profiles.find(p => p.id === "may")?.knownConditions.map(c => c.id)).toEqual(["hypertension", "type2-diabetes"]);
  expect(demo.profiles.find(p => p.id === "may")?.knownConditions.every(c => c.source === "fictional-profile")).toBe(true);
  expect(demo.profiles.find(p => p.id === "david")?.knownConditions).toEqual([]);
  expect([...new Set(demo.medicationDoses.map(d => d.medicationId))].sort()).toEqual(["med-amlo", "med-ator"]);
  expect(demo.medicationDoses.find(d => d.id === "dose-ator-14")?.status).toBe("unknown");
  expect(demo.reports[0].results).toHaveLength(3);
  expect(demo.reports[0].originalText.en).toContain("6.4");
});

test("scenarios_are_complete_and_repeatable", () => {
  expect(scenarioIds).toHaveLength(10);
  for (const id of scenarioIds) {
    const state = createScenario(id);
    expect(state).toEqual(createScenario(id));
    expect(state.schemaVersion).toBe(4);
    const sources = new Set([...state.healthRecords, ...state.observations, ...state.checkIns, ...state.medicationDoses, ...state.appointments, ...state.reports].map(r => r.id));
    for (const item of [...state.tasks, ...state.episodes, ...state.briefs, ...state.events]) {
      expect(item.patientId).toBe("may");
      for (const source of item.sourceRecordIds) expect(sources.has(source), `${id}: ${source}`).toBe(true);
    }
    for (const task of state.tasks) expect(["may", "david"]).toContain(task.ownerId);
    const today = selectToday(state);
    expect(today.hero.kind).toBeTruthy();
    expect(Array.isArray(today.hero)).toBe(false);
    expect(today.dailyEntry.patientId).toBe("may");
    const storage = new MemoryStorage();
    expect(saveDemo(storage, state).ok).toBe(true);
    expect(loadDemo(storage)).toEqual({ ok: true, value: state });
  }
  expect(createScenario("routine-day").clock).toBe("2026-09-16T08:45:00+08:00");
  expect(selectToday(createScenario("urgent-help")).hero.kind).toBe("urgent");
  expect(selectToday(createScenario("day-before-visit")).hero.kind).toBe("prepare-visit");
  expect(selectToday(createScenario("next-morning")).hero.kind).toBe("follow-up");
  expect(createScenario("first-use").grants).toEqual([]);
});

test("storage_failure_is_reported_without_false_persistence", async ({ page }) => {
  const storage = new MemoryStorage();
  storage.setItem("caremate-v4", "broken JSON");
  expect(loadDemo(storage).ok).toBe(false);
  storage.setItem("caremate-v4", JSON.stringify({ schemaVersion: 4, clock: "invalid" }));
  expect(loadDemo(storage).ok).toBe(false);
  storage.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
  expect(saveDemo(storage, createScenario("routine-day"))).toEqual({ ok: false, code: "QuotaExceededError" });
  expect(savePreferences(storage, { locale: "en", liteMode: true, introComplete: true }).ok).toBe(false);
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("full", "QuotaExceededError"); }; });
  await page.goto("/settings");
  await page.getByTestId("lang-en-settings").click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByTestId("persistence-error")).toBeVisible();
  await page.goto("/ask");
  await page.getByTestId("quick-reply-none").click();
  await expect(page.getByTestId("quick-reply-after-waking")).toBeVisible();
  await expect(page.getByTestId("persistence-error")).toBeVisible();
  await page.getByTestId("quick-reply-after-waking").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-forgot").click();
  await page.getByTestId("add-to-journey").click();
  await expect(page.getByTestId("prep-visit")).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText(/記憶體|memory/);
});

test("a recheck does not promote the prior emergency into today's active hero", () => {
  const demo = createScenario("urgent-help");
  demo.episodes.push({ ...demo.episodes[0], id: "episode-recheck", disposition: "open", step: "urgent", phase: "concern_open", answers: { urgent: null, onset: null, change: null, medGap: null, nextMorning: null } });
  expect(selectToday(demo).hero.kind).toBe("routine");
  expect(demo.episodes[0].disposition).toBe("urgent");
});

test("preferences_are_independent_and_reset_preserves_them", () => {
  const storage = new MemoryStorage();
  const preferences = { locale: "en" as const, liteMode: true, introComplete: true };
  savePreferences(storage, preferences);
  saveDemo(storage, createScenario("low-mood"));
  saveDemo(storage, createScenario("routine-day"));
  expect(loadPreferences(storage)).toEqual({ ok: true, value: preferences });
  useAppStore.getState().setLocale("en");
  useAppStore.getState().setLiteMode(true);
  useAppStore.getState().resetDemo();
  expect(useAppStore.getState().locale).toBe("en");
  expect(useAppStore.getState().liteMode).toBe(true);
});

test("legacy_measurement_notes_round_trip_through_the_domain_snapshot", () => {
  useAppStore.getState().applyScenario("dizziness");
  useAppStore.getState().setReadingNote("bp-16", "Measured after breakfast");
  expect(useAppStore.getState().demo.observations.find(o => o.id === "bp-16")?.note).toBe("Measured after breakfast");
  expect(useAppStore.getState().readingNotes["bp-16"]).toBe("Measured after breakfast");
  const storage = new MemoryStorage();
  saveDemo(storage, useAppStore.getState().demo);
  const restored = loadDemo(storage);
  expect(restored.ok && restored.value?.observations.find(o => o.id === "bp-16")?.note).toBe("Measured after breakfast");
  useAppStore.getState().setPerspective("david");
  useAppStore.getState().setReadingNote("bp-16", "Must not be changed by David");
  expect(useAppStore.getState().readingNotes).toEqual({});
  expect(useAppStore.getState().demo.observations.find(o => o.id === "bp-16")?.note).toBe("Measured after breakfast");
  useAppStore.getState().resetDemo();
});

test("emergency_is_retained_in_tab_but_rechecked_in_fresh_session", async ({ page, browser }) => {
  const storage = new MemoryStorage();
  expect(setEmergencySession(storage, "episode-dizzy").ok).toBe(true);
  expect(getEmergencySession(storage)).toEqual({ ok: true, value: "episode-dizzy" });
  expect(setEmergencySession(storage, null).ok).toBe(true);
  expect(getEmergencySession(storage)).toEqual({ ok: true, value: null });
  await page.goto("/ask");
  await page.getByTestId("quick-reply-chest-breath").click();
  await expect(page.getByTestId("emergency-state")).toBeVisible();
  await page.goto("/dev");
  await page.getByTestId("perspective-david").click();
  await page.getByTestId("perspective-may").click();
  await page.goto("/ask");
  await page.reload();
  await expect(page.getByTestId("emergency-state")).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
  const context = await browser.newContext({ storageState: await page.context().storageState() });
  const fresh = await context.newPage();
  await fresh.goto("http://127.0.0.1:3000/ask");
  await expect(fresh.getByTestId("emergency-state")).toHaveCount(0);
  await expect(fresh.getByTestId("quick-reply-chest-breath")).toBeVisible();
  const after = await fresh.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
  expect(after.healthRecords).toEqual(before.healthRecords);
  expect(after.tasks).toEqual(before.tasks);
  expect(after.episodes.some((e: { disposition: string }) => e.disposition === "urgent")).toBe(true);
  await context.close();
});
