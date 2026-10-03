import { expect, test, type Page } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import { commitCheckIn, createCheckInDraft, saveObservation, updateCheckInDraft } from "../src/lib/demo/check-in";
import { selectBpAverage } from "../src/lib/demo/selectors";
import { bpAverage } from "../src/lib/selectors";
import { useAppStore } from "../src/lib/store";

async function start(page: Page, path = "/check-in") {
  await page.addInitScript((demo) => {
    if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(demo));
  }, createScenario("routine-day"));
  await page.goto(path);
}
async function review(page: Page, mood = "low") {
  await page.getByTestId(`mood-${mood}`).click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("body-tired").click();
  await page.getByTestId("checkin-next").click();
  await page.getByLabel("本人補充（可留空）").fill("今天想休息");
  await page.getByTestId("checkin-next").click();
}
test("daily_body_and_mood_can_be_reviewed_and_edited", async ({ page }) => {
  await start(page);
  await review(page);
  await expect(page.getByTestId("checkin-review")).toContainText("心情低落");
  await page.getByTestId("checkin-edit").click();
  await page.getByTestId("mood-okay").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-save").click();
  await expect(page.getByTestId("checkin-receipt")).toContainText("已加入健康紀錄");
  await expect(page.getByTestId("checkin-receipt")).toContainText("不是醫生確認");
  await page.getByTestId("checkin-view-record").click();
  await page.getByTestId("health-tab-records").click();
  await page.getByTestId(/checkin-record-/).click();
  await expect(page.getByTestId("checkin-detail")).toContainText("心情一般");
  await expect(page.getByTestId("checkin-detail")).not.toContainText("心情低落");
  await page.getByTestId("checkin-correct").click();
  await page.getByTestId("mood-good").click();
  for (let i = 0; i < 3; i++) await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-save").click();
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).checkIns);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ mood: "good", body: "tired", revision: 2 });
});
test("skipped_mood_stays_unknown_and_double_save_is_idempotent", async ({ page }) => {
  await start(page);
  await review(page, "skipped");
  await expect(page.getByTestId("checkin-review")).toContainText("沒有心情紀錄");
  await page.getByTestId("checkin-save").dblclick();
  await page.reload();
  await expect(page.getByTestId("checkin-receipt")).toContainText("沒有心情紀錄");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).checkIns)).toHaveLength(1);
});
test("draft_restores_after_back_and_invalid_bp_has_field_error", async ({ page }) => {
  await start(page);
  await page.getByTestId("mood-low").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("body-tired").click();
  await page.getByTestId("checkin-leave").click();
  await page.getByTestId("daily-check-in").click();
  await expect(page.getByTestId("body-tired")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("body-tired")).toHaveAttribute("aria-pressed", "true");
  await page.goto("/health");
  await page.getByTestId("health-tab-measurements").click();
  await page.getByTestId("add-observation").click();
  for (const values of [["", ""], ["abc", "90"], ["80", "90"], ["301", "90"], ["120", "201"]]) {
    await page.getByLabel("收縮壓（mmHg）").fill(values[0]);
    await page.getByLabel("舒張壓（mmHg）").fill(values[1]);
    await page.getByTestId("observation-save").click();
    await expect(page.getByTestId("observation-error")).toBeVisible();
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).observations)).toHaveLength(7);
});
test("observation_future_time_cannot_be_saved", async ({ page }) => {
  await start(page, "/health");
  await page.getByTestId("health-tab-measurements").click();
  await page.getByTestId("add-observation").click();
  await page.getByLabel("收縮壓（mmHg）").fill("120");
  await page.getByLabel("舒張壓（mmHg）").fill("80");
  await page.getByLabel("量度發生時間（香港時間）").fill("2026-09-17T10:00");
  await page.getByTestId("observation-save").click();
  await expect(page.getByTestId("observation-error")).toContainText("不能晚於");
  await page.getByLabel("量度發生時間（香港時間）").fill("2026-09-15T10:00");
  await page.getByTestId("observation-save").click();
  await expect(page.getByTestId("observation-receipt")).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).observations);
  expect(data.at(-1)).toMatchObject({ systolic: 120, diastolic: 80, occurredAt: "2026-09-15T10:00:00+08:00", enteredAt: "2026-09-16T08:45:00+08:00" });
});
test("corrected_observation_updates_values_source_and_average", async ({ page }) => {
  const state = createScenario("routine-day");
  state.observations.find(r => r.id === "bp-16")!.occurredAt = "2026-09-16T08:30:45+08:00";
  await page.addInitScript(demo => localStorage.setItem("caremate-v4", JSON.stringify(demo)), state);
  await page.goto("/health");
  await page.getByTestId("health-tab-measurements").click();
  await page.getByTestId("bp-row-bp-16").click();
  await page.getByLabel("收縮壓（mmHg）").fill("125");
  await page.getByLabel("舒張壓（mmHg）").fill("85");
  await page.getByTestId("observation-save").click();
  await expect(page.getByTestId("bp-detail")).toContainText("125/85");
  // A saved value re-renders Health; that must not restart the Sheet's focus-entry effect.
  await expect(page.getByTestId("observation-save")).toBeFocused();
  const readings = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).observations);
  expect(readings.find((r: {id: string}) => r.id === "bp-16")).toMatchObject({ systolic: 125, diastolic: 85, source: "home-measure", revision: 2, occurredAt: "2026-09-16T08:30:45+08:00", enteredAt: "2026-09-16T08:30:00+08:00" });
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByTestId("bp-table")).toContainText("125 mmHg");
  await page.getByTestId("health-tab-overview").click();
  const average = Math.round(readings.reduce((sum: number, r: {systolic: number}) => sum + r.systolic, 0) / readings.length);
  await expect(page.getByTestId("bp-average")).toContainText(String(average));
});

test("domain_rejects_timezone_missing_checkin", () => {
  const state = createScenario("routine-day");
  const draft = updateCheckInDraft(createCheckInDraft(state, "may"), { mood: "skipped", body: "well" });
  expect(commitCheckIn(state, { ...draft, occurredAt: "2026-09-16T08:00:00" }).ok).toBe(false);
});
test("domain_rejects_observation_source_id_collision", () => {
  const state = createScenario("routine-day");
  expect(saveObservation(state, { ...state.observations[0], id: state.healthRecords[0].id }).ok).toBe(false);
});

test("recent_average_and_existing_summary_share_hong_kong_seven_day_window", () => {
  const state = createScenario("routine-day");
  state.observations.push({ ...state.observations[0], id: "bp-older", occurredAt: "2026-09-01T08:00:00+08:00", systolic: 40, diastolic: 20 });
  useAppStore.setState({ demo: state });
  try {
    expect(selectBpAverage(state)).toEqual({ systolic: 144, diastolic: 90 });
    expect(bpAverage()).toEqual({ systolic: 144, diastolic: 90 });
    state.observations.push({ ...state.observations[0], id: "bp-additional-today", occurredAt: "2026-09-16T08:40:00+08:00", systolic: 40, diastolic: 20 });
    useAppStore.setState({ demo: state });
    expect(selectBpAverage(state)).toEqual({ systolic: 131, diastolic: 81 });
    expect(bpAverage()).toEqual({ systolic: 131, diastolic: 81 });
  } finally { useAppStore.getState().resetDemo(); }
});

test("historical_checkin_correction_has_receipt_without_new_daily_draft", async ({ page }) => {
  const state = createScenario("routine-day");
  state.checkIns.push({ id: "checkin-yesterday", patientId: "may", draftId: "draft-yesterday", occurredAt: "2026-09-15T08:00:00+08:00", enteredAt: "2026-09-15T08:00:00+08:00", mood: "low", body: "tired", note: "", revision: 1 });
  await page.addInitScript(demo => localStorage.setItem("caremate-v4", JSON.stringify(demo)), state);
  await page.goto("/health");
  await page.getByTestId("health-tab-records").click();
  await page.getByTestId("checkin-record-checkin-yesterday").click();
  await page.getByTestId("checkin-correct").click();
  await page.getByTestId("mood-okay").click();
  for (let i = 0; i < 3; i++) await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-save").click();
  await expect(page.getByTestId("checkin-receipt")).toContainText("心情一般");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).drafts)).toEqual([]);
});

test("historical_correction_selects_requested_draft_and_restores_with_competing_daily_draft", async ({ page }) => {
  const state = createScenario("routine-day");
  state.checkIns.push({ id: "checkin-yesterday", patientId: "may", draftId: "draft-yesterday", occurredAt: "2026-09-15T08:00:00+08:00", enteredAt: "2026-09-15T08:00:00+08:00", mood: "low", body: "tired", note: "昨天的補充", revision: 1 });
  await page.addInitScript(demo => {
    if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(demo));
  }, state);
  await page.goto("/check-in");
  await page.getByTestId("mood-stressed").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("body-well").click();
  await page.getByTestId("checkin-next").click();
  await page.getByLabel("本人補充（可留空）").fill("今天尚未保存的補充");
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).drafts[0]);
  await page.getByTestId("checkin-leave").click();
  await page.getByTestId("nav-health").click();
  await page.getByTestId("health-tab-records").click();
  await page.getByTestId("checkin-record-checkin-yesterday").click();
  await page.getByTestId("checkin-correct").click();
  await expect(page.getByTestId("mood-low")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("mood-okay").click();
  await page.getByTestId("checkin-next").click();
  await expect(page.getByTestId("body-tired")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("body-tired")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("checkin-leave").click();
  await expect(page.getByTestId("today-page")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/check-in\?draft=draft-yesterday$/);
  await expect(page.getByTestId("body-tired")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("checkin-leave").click();
  await expect(page.getByTestId("today-page")).toBeVisible();
  await page.getByTestId("nav-health").click();
  await page.getByTestId("health-tab-records").click();
  await page.getByTestId("checkin-record-checkin-yesterday").click();
  await page.getByTestId("checkin-correct").click();
  await expect(page.getByTestId("body-tired")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("checkin-next").click();
  await expect(page.getByLabel("本人補充（可留空）")).toHaveValue("昨天的補充");
  await page.getByTestId("checkin-next").click();
  await expect(page.getByTestId("checkin-review")).toContainText("9月15日");
  await page.getByTestId("checkin-save").click();
  await expect(page.getByTestId("checkin-receipt")).toContainText("心情一般");
  await page.reload();
  await expect(page.getByTestId("checkin-receipt")).toContainText("9月15日");
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
  expect(persisted.checkIns).toEqual([{ ...state.checkIns[0], mood: "okay", revision: 2 }]);
  expect(persisted.drafts).toEqual([original]);
  await page.getByTestId("checkin-receipt").getByRole("link", { name: "今日", exact: true }).click();
  await page.getByTestId("daily-check-in").click();
  await expect(page.getByLabel("本人補充（可留空）")).toHaveValue("今天尚未保存的補充");
});

test("missing_explicit_draft_does_not_open_or_create_an_unrelated_daily_draft", async ({ page }) => {
  await start(page, "/check-in?draft=unknown");
  await expect(page.getByTestId("checkin-missing")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!).drafts)).toEqual([]);
});

test("keyboard_checkin_works_in_english_large_text_and_reduced_motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "en", liteMode: true, introComplete: true })));
  const healthRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/ask")) healthRequests.push(request.url()); });
  await start(page);
  async function keyboardSelect(id: string) {
    for (let count = 0; count < 60; count++) {
      const active = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.id);
      if (active === id) { await page.keyboard.press("Enter"); return; }
      await page.keyboard.press("Tab");
    }
    throw new Error(`Cannot reach ${id} by keyboard`);
  }
  await keyboardSelect("mood-okay");
  await expect(page.getByTestId("mood-okay")).toHaveAttribute("aria-pressed", "true");
  await keyboardSelect("checkin-next");
  await keyboardSelect("body-well");
  await keyboardSelect("checkin-next");
  await keyboardSelect("checkin-next");
  await expect(page.getByTestId("checkin-review")).toContainText("Feeling okay");
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await keyboardSelect("checkin-save");
  await expect(page.getByTestId("checkin-receipt")).toContainText("Added to health records");
  expect(healthRequests).toEqual([]);
  await page.screenshot({ path: ".superpowers/sdd/2026-10-03-caremate-complete-demo/task-2-keyboard-en.png", fullPage: true });
});
