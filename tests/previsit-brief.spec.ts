import { expect, test, type Page } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import type { DemoState } from "../src/lib/demo/types";

const snapshot = (page: Page): Promise<DemoState> => page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
async function start(page: Page, demo = createScenario("day-before-visit"), path = "/brief") {
  demo.clock = "2026-09-21T09:00:00+08:00";
  await page.addInitScript(d => { if (!localStorage.getItem("caremate-v4-preferences")) localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "zh-HK", liteMode: false, introComplete: true }));
    if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(d)); }, demo);
  await page.goto(path);
}
async function replace(page: Page, demo: DemoState) {
  await page.evaluate(d => { localStorage.setItem("caremate-v4", JSON.stringify(d)); window.dispatchEvent(new StorageEvent("storage", { key: "caremate-v4" })); }, demo);
}

test("day_before_visit_creates_one_reviewable_body_mood_draft", async ({ page }) => {
  await start(page, createScenario("day-before-visit"), "/");
  await expect.poll(async () => (await snapshot(page)).briefs.length).toBe(1);
  await expect(page.getByTestId("daily-check-in")).toBeVisible();
  await page.goto("/brief");
  await expect(page.getByTestId("brief-status")).toHaveText("尚未確認");
  await expect(page.getByTestId("brief-packet")).toContainText("這段期間沒有心情紀錄");
  await expect(page.getByTestId("brief-packet")).not.toContainText("今朝有少少頭暈");
  await page.reload();
  const state = await snapshot(page);
  expect(state.briefs).toHaveLength(1);
  expect(state.briefs[0]).toMatchObject({ patientId: "may", appointmentId: "appt-gp", appointmentRevision: 1, status: "draft", confirmedAt: null });
});

test("editing_and_record_corrections_update_screen_copy_and_print", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("brief-confirm")).toBeVisible();
  const state = await snapshot(page);
  state.observations[0] = { ...state.observations[0], systolic: 120, diastolic: 80, revision: 2 };
  state.medicationDoses.find(d => d.id === "dose-ator-14")!.status = "unknown";
  state.questions.push({ id: "q-personal", patientId: "may", selected: true, text: { zh: "覆診時想討論睡眠", en: "Discuss sleep at the visit" } });
  await replace(page, state);
  await page.getByTestId("brief-supplement").fill("本人補充：想帶同血壓紀錄");
  await page.getByTestId("brief-save-edit").click();
  await expect(page.getByTestId("brief-status")).toHaveText("尚未確認");
  await expect(page.getByTestId("brief-packet")).toContainText("覆診時想討論睡眠");
  await page.getByTestId("brief-readings").click();
  await expect(page.getByTestId("brief-packet")).toContainText("120/80");
  await expect(page.getByTestId("brief-packet")).toContainText("未確定");
  await page.getByTestId("brief-confirm").click();
  await page.getByTestId("visit-print").click();
  await expect(page.getByTestId("print-view")).toContainText("120/80");
  await expect(page.getByTestId("print-view")).toContainText("本人補充：想帶同血壓紀錄");
  await expect(page.getByTestId("print-view")).toContainText("覆診時想討論睡眠");
  expect((await snapshot(page)).reports).toEqual(state.reports);
});

test("confirmed_brief_invalidates_on_every_content_revision", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("brief-confirm")).toBeVisible();
  await page.getByTestId("brief-supplement").fill("保留這份本人補充");
  await page.getByTestId("brief-save-edit").click();
  await page.getByTestId("brief-confirm").click();
  const initial = (await snapshot(page)).briefs[0];
  expect(initial.status).toBe("confirmed");
  const changed = await snapshot(page);
  changed.observations[0].revision++;
  changed.observations[0].systolic = 122;
  await replace(page, changed);
  await expect(page.getByTestId("brief-status")).toHaveText("尚未確認");
  await expect(page.getByTestId("brief-stale")).toBeVisible();
  await expect(page.getByTestId("brief-packet")).toContainText("保留這份本人補充");
  await page.reload();
  await expect(page.getByTestId("brief-status")).toHaveText("尚未確認");
  await page.getByTestId("brief-confirm").click();
  await page.getByTestId("brief-include-mood").uncheck();
  await expect(page.getByTestId("brief-status")).toHaveText("尚未確認");
  expect((await snapshot(page)).briefs[0].confirmedAt).toBeNull();
});

test("rescheduled_visit_invalidates_old_draft_and_shared_brief_obeys_current_consent", async ({ page }) => {
  const demo = createScenario("day-before-visit");
  demo.grants.push({ id: "grant-doctor-wong", patientId: "may", recipientId: "doctor-wong", level: "full", categories: ["body", "measurements"], status: "active", revision: 1, updatedAt: demo.clock });
  demo.questions.push({ id: "secret-question", patientId: "may", selected: true, text: { zh: "PRIVATE_QUESTION", en: "PRIVATE_QUESTION" } });
  await start(page, demo);
  await expect(page.getByTestId("brief-recipient")).toBeVisible();
  await page.getByTestId("brief-recipient").selectOption("doctor-wong");
  await expect(page.getByTestId("brief-packet")).not.toContainText("PRIVATE_QUESTION");
  await page.getByTestId("brief-confirm").click();
  const changed = await snapshot(page); changed.grants[0].status = "revoked"; changed.grants[0].revision++;
  await replace(page, changed);
  await expect(page.getByTestId("brief-unavailable")).toBeVisible();
  await expect(page.getByTestId("visit-copy")).toHaveCount(0);
  await page.getByTestId("brief-recipient").selectOption("may");
  await expect(page.getByTestId("brief-packet")).toContainText("PRIVATE_QUESTION");
  const rescheduled = await snapshot(page); rescheduled.appointments[0].scheduledAt = "2026-09-23T14:30:00+08:00"; rescheduled.appointments[0].revision++;
  await replace(page, rescheduled); await page.goto("/");
  await expect(page.getByTestId("daily-brief")).not.toContainText("為明天覆診整理資料");
});

test("clipboard_rejection_and_print_preview_are_truthful", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("brief-confirm")).toBeVisible();
  await page.getByTestId("brief-confirm").click();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByTestId("visit-copy").click();
  await expect(page.getByTestId("brief-copy-fallback")).toBeVisible();
  await expect(page.getByTestId("brief-copy-result")).toContainText("未能複製");
  await expect(page.getByTestId("brief-copy-result")).not.toContainText("已複製");
  await page.getByTestId("brief-copy-fallback").selectText();
  const text = await page.getByTestId("brief-copy-fallback").inputValue();
  await page.getByTestId("visit-print").click();
  await expect(page.getByTestId("print-packet")).toHaveText(text);
  await expect(page.getByTestId("print-view")).toContainText("打印預覽");
  await expect(page.getByTestId("print-view")).not.toContainText("已打印");
});


// These tests catch stale confirmations and privacy leaks at the same public export boundary used by the UI.
import { briefToText, buildBrief, confirmBrief, ensurePrevisitDraft, openBriefDraft, prepareBriefExport, reconcileBriefs, updateBriefDraft } from "../src/lib/demo/brief";
import { isDemoState } from "../src/lib/demo/persistence";
import { setConsent } from "../src/lib/demo/sharing";
import type { ActionResult } from "../src/lib/demo/types";
const value = <T>(result: ActionResult<T>): T => { expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.code); return result.value; };
function confirmed(state = createScenario("day-before-visit"), recipientId?: "david" | "doctor-wong") {
  state = value(openBriefDraft(state, "appt-gp", recipientId));
  const id = state.briefs.at(-1)!.id;
  return { state: value(confirmBrief(state, id)), id };
}
for (const edit of ["reading", "dose", "question-text", "question-selection", "appointment", "report", "checkin", "supplement", "mood"] as const) {
  test(`every content revision requires re-review: ${edit}`, () => {
    const original = createScenario("day-before-visit");
    original.checkIns.push({ id: "recent", draftId: "recent-draft", patientId: "may", occurredAt: original.clock, enteredAt: original.clock, mood: "low", body: "tired", note: "PRIVATE_NOTE", revision: 1 });
    original.questions[0].selected = true;
    const saved = confirmed(original);
    let state = saved.state;
    const id = saved.id;
    const prior = state.briefs[0];
    if (edit === "reading") { state.observations[0].systolic = 123; state.observations[0].revision++; }
    if (edit === "dose") { state.medicationDoses[0].status = "unknown"; state.medicationDoses[0].revision++; }
    if (edit === "question-text") state.questions[0].text = { zh: "更正問題", en: "Corrected question" };
    if (edit === "question-selection") state.questions[0].selected = false;
    if (edit === "appointment") { state.appointments[0].scheduledAt = "2026-09-23T14:30:00+08:00"; state.appointments[0].revision++; }
    if (edit === "report") { state.reports[0].results[0].value = "6.5"; state.reports[0].revision++; }
    if (edit === "checkin") { state.checkIns[0].body = "well"; state.checkIns[0].revision++; }
    if (edit === "supplement" || edit === "mood") state = value(updateBriefDraft(state, id, { sectionEdits: edit === "supplement" ? { review: { zh: "補充", en: "Supplement" } } : {}, questionIds: state.questions.filter(q => q.selected).map(q => q.id), includeMood: edit !== "mood" }));
    expect(prepareBriefExport(state, id)).toEqual({ ok: false, code: "review-required" });
    state = reconcileBriefs(state);
    expect(state.briefs[0]).toMatchObject({ status: "draft", confirmedAt: null, revision: prior.revision + 1, appointmentRevision: state.appointments[0].revision });
    expect(isDemoState(state)).toBe(true);
    state = value(confirmBrief(JSON.parse(JSON.stringify(state)), id));
    const packet = value(prepareBriefExport(state, id));
    expect(packet).toEqual(state.briefs[0]);
    expect(packet.sourceRevisions["appt-gp"]).toBe(state.appointments[0].revision);
    expect(packet.sourceRevisions[state.observations[0].id]).toBe(state.observations[0].revision);
  });
}
for (const locale of ["zh-HK", "en"] as const) test(`personal questions and private supplements never inherit a recipient category: ${locale}`, () => {
  let state = createScenario("dizziness");
  state.observations[0].note = "PRIVATE_OBSERVATION";
  state.questions.push({ id: "private-q", patientId: "may", selected: true, text: { zh: "PRIVATE_QUESTION", en: "PRIVATE_QUESTION" } });
  state = value(openBriefDraft(state, "appt-gp"));
  const id = state.briefs[0].id;
  state = value(updateBriefDraft(state, id, { sectionEdits: { body: { zh: "PRIVATE_SUPPLEMENT", en: "PRIVATE_SUPPLEMENT" } }, questionIds: ["private-q"], includeMood: true }));
  state = value(confirmBrief(state, id));
  const personal = briefToText(value(prepareBriefExport(state, id)), locale);
  expect(personal).toContain("PRIVATE_QUESTION"); expect(personal).toContain("PRIVATE_SUPPLEMENT"); expect(personal).toContain("PRIVATE_OBSERVATION");
  state = value(setConsent(state, { patientId: "may", recipientId: "doctor-wong", level: "full", categories: ["body", "measurements"] }));
  const shared = confirmed(state, "doctor-wong");
  const packet = value(prepareBriefExport(shared.state, shared.id));
  expect(briefToText(packet, locale)).toContain("151/94");
  expect(briefToText(packet, locale)).not.toContain("PRIVATE_");
  expect(packet.questions).toEqual([]);
  expect(packet.sections.flatMap(s => s.sourceRecordIds)).not.toContain("private-q");
  expect(shared.state.reports).toEqual(state.reports);
  const summary = value(setConsent(shared.state, { patientId: "may", recipientId: "doctor-wong", level: "summary", categories: ["measurements"] }));
  const brief = value(buildBrief(summary, "may", { appointmentId: "appt-gp", includeMood: true, recipientId: "doctor-wong" }));
  expect(briefToText(brief, locale)).toContain("144/90");
  expect(briefToText(brief, locale)).not.toContain("151/94");
  expect(briefToText(brief, locale)).not.toContain("6.4");
});

test("previsit creation uses Hong Kong date, active appointment and no phantom records", () => {
  let state = createScenario("routine-day");
  state.clock = "2026-09-20T16:01:00Z";
  state = ensurePrevisitDraft(state, "appt-gp");
  expect(state.briefs).toHaveLength(1);
  expect(ensurePrevisitDraft(state, "appt-gp")).toEqual(state);
  expect(state.briefs[0].id).toContain("2026-09-21");
  expect(state.briefs[0].sourceRecordIds).not.toContain("rec-dizzy");
  expect(state.briefs[0].questions.every(q => q.patientId === "may")).toBe(true);
  state.appointments[0].status = "cancelled";
  expect(prepareBriefExport(state, state.briefs[0].id).ok).toBe(false);
  expect(ensurePrevisitDraft(state, "appt-gp").briefs).toHaveLength(1);
});

test("superseded source prose cannot reappear in the recipient packet", () => {
  let state = createScenario("dizziness");
  const old = state.healthRecords.find(r => r.id === "rec-dizzy")!;
  old.text = { zh: "STALE_SYMPTOM", en: "STALE_SYMPTOM" };
  old.supersededByRecordId = "replacement-body";
  state.healthRecords.push({ ...old, id: "replacement-body", supersededByRecordId: undefined, text: { zh: "CURRENT_BODY", en: "CURRENT_BODY" } });
  state = value(setConsent(state, { patientId: "may", recipientId: "david", level: "full", categories: ["body"] }));
  const packet = value(buildBrief(state, "may", { appointmentId: "appt-gp", recipientId: "david", includeMood: true }));
  expect(briefToText(packet, "en")).toContain("CURRENT_BODY");
  expect(briefToText(packet, "en")).not.toContain("STALE_SYMPTOM");
});

test("summary confirmation depends on current source revisions even when the average is unchanged", () => {
  let state = value(setConsent(createScenario("dizziness"), { patientId: "may", recipientId: "david", level: "summary", categories: ["measurements"] }));
  const saved = confirmed(state, "david"); state = saved.state;
  state.observations[0].revision++;
  expect(prepareBriefExport(state, saved.id)).toEqual({ ok: false, code: "review-required" });
});

test("David reaches confirmed packet exports and an open fallback clears on same-revision restriction", async ({ page }) => {
  const demo = createScenario("caregiver-alert"); demo.grants[0].level = "full"; demo.grants[0].categories = ["measurements", "body"];
  await start(page, demo, "/family");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByTestId("shared-copy").click();
  await page.getByTestId("brief-confirm").click();
  await page.getByTestId("visit-copy").click();
  await expect(page.getByTestId("brief-copy-fallback")).toContainText("151/94");
  const changed = await snapshot(page); changed.grants[0].categories = ["body"];
  await replace(page, changed);
  await expect(page.getByTestId("brief-copy-fallback")).toHaveCount(0);
  await expect(page.getByTestId("shared-view")).not.toContainText("151/94");
  await expect(page.getByTestId("brief-status")).toHaveText("尚未確認");
  await page.getByTestId("brief-confirm").click(); await page.getByTestId("visit-print").click();
  await expect(page.getByTestId("print-view")).not.toContainText("151/94");
  await expect(page.getByTestId("print-view")).toContainText("May");
});

test("question text can be corrected without rewriting the imported report", async ({ page }) => {
  await start(page);
  const state = await snapshot(page); state.questions[0].selected = true;
  await replace(page, state);
  await page.getByTestId("brief-confirm").click();
  await expect(page.getByTestId(`question-edit-${state.questions[0].id}`)).toBeVisible();
  await page.getByTestId(`question-edit-${state.questions[0].id}`).click();
  await page.getByTestId("question-text").fill("更正後的私人問題");
  await page.getByTestId("question-save").click();
  await expect(page.getByTestId("brief-status")).toHaveText("尚未確認");
  await expect(page.getByTestId("brief-questions")).toContainText("更正後的私人問題");
  expect((await snapshot(page)).reports).toEqual(state.reports);
});

test("routine brief screen does not invent a dizziness contact script", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("visit-brief")).not.toContainText("我今早有頭暈");
});

test("personal packet preserves the recorded allergy and its source revision", () => {
  const state = createScenario("routine-day");
  const packet = value(buildBrief(state, "may", { appointmentId: "appt-gp", includeMood: true }));
  expect(briefToText(packet, "en")).toContain("Penicillin allergy");
  expect(packet.sourceRevisions["mem-pen"]).toBe(1);
});

import { useAppStore } from "../src/lib/store";
class BriefStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, data: string) { if (this.failWrites) throw new DOMException("quota", "QuotaExceededError"); this.values.set(key, data); }
  removeItem(key: string) { this.values.delete(key); }
}
for (const memoryOnly of [false, true]) for (const restriction of ["revoke", "category"] as const) test(`actual export action rechecks storage ${restriction} with memoryOnly=${memoryOnly}`, () => {
  const previous = useAppStore.getState();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new BriefStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, sessionStorage: new BriefStorage() } });
  try {
    const base = value(setConsent(createScenario("day-before-visit"), { patientId: "may", recipientId: "david", level: "full", categories: ["body", "measurements"] }));
    const saved = confirmed(base, "david");
    const state = { ...saved.state, context: { actorId: "david" as const, patientId: "may" as const, perspective: "caregiver" as const } };
    useAppStore.setState({ demo: state, persistenceError: memoryOnly ? "QuotaExceededError" : null, toast: null });
    const remote = structuredClone(state);
    if (restriction === "revoke") remote.grants[0].status = "revoked";
    else remote.grants[0].categories = ["body"];
    storage.setItem("caremate-v4", JSON.stringify(remote)); storage.failWrites = memoryOnly;
    expect(useAppStore.getState().prepareBriefExport(saved.id).ok).toBe(false);
    expect(useAppStore.getState().demo.context).toEqual(state.context);
    expect(useAppStore.getState().demo.observations).toEqual(state.observations);
    expect(useAppStore.getState().demo.reports).toEqual(state.reports);
  } finally {
    useAppStore.setState(previous);
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else Reflect.deleteProperty(globalThis, "window");
  }
});

test("reviewed English packet remains usable at 390px and captures real preview", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "en", liteMode: true, introComplete: true })));
  await start(page);
  await expect(page.getByTestId("brief-bp")).toContainText("144/90");
  await expect(page.getByTestId("brief-section-reports")).toContainText("6.4");
  await expect(page.getByTestId("brief-section-reports")).toContainText("2.7");
  await expect(page.getByTestId("brief-section-reports")).toContainText("71");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.getByTestId("brief-confirm").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: ".superpowers/sdd/2026-10-03-caremate-complete-demo/task-8-brief-390.png" });
  await page.getByTestId("brief-confirm").focus(); await page.keyboard.press("Enter");
  await page.getByTestId("visit-print").click();
  await expect(page.getByTestId("print-packet")).toContainText("Confirmed");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".superpowers/sdd/2026-10-03-caremate-complete-demo/task-8-print-1440.png" });
});

test("contact script copy uses the confirmed current packet gate", async ({ page }) => {
  await start(page, createScenario("next-morning"));
  await expect(page.getByRole("button", { name: "複製內容" })).toBeDisabled();
  await page.getByRole("button", { name: "記錄聯絡結果" }).click();
  await expect(page.getByTestId("contact-form")).toBeVisible();
  await page.getByTestId("brief-confirm").click();
  await expect(page.getByRole("button", { name: "複製內容" })).toBeEnabled();
  const changed = await snapshot(page); changed.observations[0].revision++; changed.observations[0].systolic = 125;
  await replace(page, changed);
  await expect(page.getByRole("button", { name: "複製內容" })).toBeDisabled();
});


test("day-before generation preserves earlier personal review supplements as a new draft", () => {
  let state = value(openBriefDraft(createScenario("routine-day"), "appt-gp"));
  const oldId = state.briefs[0].id;
  state = value(updateBriefDraft(state, oldId, { sectionEdits: { review: { zh: "保留早前補充", en: "Keep earlier supplement" } }, questionIds: [], includeMood: false }));
  state = value(confirmBrief(state, oldId));
  state.clock = "2026-09-21T09:00:00+08:00";
  const next = ensurePrevisitDraft(state, "appt-gp");
  expect(next.briefs).toHaveLength(2);
  expect(next.briefs[1].id).not.toBe(oldId);
  expect(next.briefs[1]).toMatchObject({ status: "draft", confirmedAt: null, includeMood: false });
  expect(briefToText(next.briefs[1], "en")).toContain("Keep earlier supplement");
  expect(ensurePrevisitDraft(next, "appt-gp").briefs).toHaveLength(2);
});

async function interceptPrint(page: Page) {
  await page.evaluate(() => {
    const captures: (string | null)[] = [];
    Object.assign(window, { printCaptures: captures });
    window.print = () => { captures.push(document.querySelector('[data-testid="print-packet"]')?.textContent ?? null); };
  });
}
const printCaptures = (page: Page): Promise<(string | null)[]> => page.evaluate(() => (window as unknown as { printCaptures: (string | null)[] }).printCaptures);
function printFixture(recipient: boolean) {
  let state = createScenario("day-before-visit");
  if (recipient) state = value(setConsent(state, { patientId: "may", recipientId: "david", level: "full", categories: ["body", "measurements"] }));
  const saved = confirmed(state, recipient ? "david" : undefined);
  if (recipient) saved.state.context = { actorId: "david", patientId: "may", perspective: "caregiver" };
  return saved;
}
for (const recipient of [false, true]) test(`system print waits for the refreshed confirmed preview: recipient=${recipient}`, async ({ page }) => {
  const locale = recipient ? "en" : "zh-HK";
  await page.addInitScript(locale => localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale, liteMode: false, introComplete: true })), locale);
  const saved = printFixture(recipient);
  await start(page, saved.state, `/print?brief=${saved.id}`);
  await expect(page.getByTestId("print-packet")).toContainText("151/94");
  await interceptPrint(page);
  let newer = await snapshot(page);
  newer.observations[0].systolic = 201;
  newer.observations[0].diastolic = 101;
  newer.observations[0].revision++;
  newer = value(confirmBrief(reconcileBriefs(newer), saved.id));
  expect(isDemoState(newer)).toBe(true);
  const expected = briefToText(value(prepareBriefExport(newer, saved.id)), locale);
  expect(expected).toContain("201/101");
  await page.evaluate(d => localStorage.setItem("caremate-v4", JSON.stringify(d)), newer);
  const print = page.getByRole("button", { name: recipient ? "Open system print dialog" : "打開系統打印畫面" });
  await print.click();
  expect(await printCaptures(page)).toEqual([]);
  await expect(page.getByTestId("print-packet")).toHaveText(expected);
  await expect(page.getByRole("status")).toContainText(recipient ? "Preview updated" : "預覽已更新");
  await print.click();
  expect(await printCaptures(page)).toEqual([expected]);
});
for (const change of ["personal-draft", "recipient-draft", "revoked", "category"] as const) test(`system print denies an unobserved current storage restriction: ${change}`, async ({ page }) => {
  const saved = printFixture(change !== "personal-draft");
  await start(page, saved.state, `/print?brief=${saved.id}`);
  await expect(page.getByTestId("print-packet")).toContainText("151/94");
  await interceptPrint(page);
  const newer = await snapshot(page);
  if (change === "revoked") newer.grants[0].status = "revoked";
  else if (change === "category") newer.grants[0].categories = ["body"];
  else { newer.observations[0].systolic = 201; newer.observations[0].revision++; }
  expect(isDemoState(newer)).toBe(true);
  await page.evaluate(d => localStorage.setItem("caremate-v4", JSON.stringify(d)), newer);
  await page.getByRole("button", { name: "打開系統打印畫面" }).click();
  expect(await printCaptures(page)).toEqual([]);
  await expect(page.getByTestId("print-packet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打開系統打印畫面" })).toHaveCount(0);
});
