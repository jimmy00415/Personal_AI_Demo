import { expect, test, type Page } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import { cancelTask, completeCheckInTask, createAfterVisitTask, recordContactOutcome, scheduleFollowup, setDoseStatus, snoozeTask } from "../src/lib/demo/care";
import { isTaskOverdue, selectTodayTasks } from "../src/lib/demo/selectors";
import { taskToIcs } from "../src/lib/demo/exports";
import { useAppStore } from "../src/lib/store";
import { isDemoState } from "../src/lib/demo/persistence";
import type { ActionResult, DemoState } from "../src/lib/demo/types";

const value = (result: ActionResult<DemoState>) => { expect(result.ok).toBe(true); if (!result.ok) throw Error(result.code); return result.value; };
const snapshot = (page: Page): Promise<DemoState> => page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));

async function start(page: Page, scenario: Parameters<typeof createScenario>[0], path = "/care") {
  await page.addInitScript(demo => { if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(demo)); }, createScenario(scenario));
  await page.goto(path);
}
test("custom_0915_is_identical_in_receipt_task_today_and_ics", async ({ page }) => {
  const demo = createScenario("dizziness");
  demo.episodes[0] = { ...demo.episodes[0], saved: true, disposition: "ordinary", phase: "summary_saved", step: "saved" };
  await page.addInitScript(d => { if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(d)); }, demo);
  await page.goto("/brief");
  await page.getByLabel("提醒時間（香港時間）").fill("09:15");
  await page.getByTestId("follow-pick").click();
  await expect(page.getByTestId("followup-scheduled")).toContainText("9:15");
  await expect(page.getByTestId("followup-scheduled").locator("time")).toHaveAttribute("datetime", "2026-09-17T09:15:00+08:00");
  const download = page.waitForEvent("download");
  await page.getByText("加入日曆", { exact: true }).click();
  const file = await (await download).path();
  const fs = await import("node:fs/promises");
  expect(await fs.readFile(file!, "utf8")).toContain("DTSTART:20260917T011500Z");
  const task = (await snapshot(page)).tasks.find(t => t.id === "task-morning")!;
  expect(task.scheduledAt).toBe("2026-09-17T09:15:00+08:00");
  await page.getByTestId("change-time-follow").click();
  await expect(page.getByTestId("reminder-picker").locator("input")).toHaveValue("2026-09-17T09:15");
  await page.getByTestId("reminder-picker").getByText("取消", { exact: true }).click();
  expect((await snapshot(page)).tasks.find(t => t.id === task.id)?.scheduledAt).toBe(task.scheduledAt);
  await page.goto("/care?task=task-morning");
  await expect(page.getByTestId("task-time")).toHaveAttribute("datetime", task.scheduledAt!);
  await page.goto("/dev");
  await page.getByTestId("advance-clock").click();
  await expect(page.getByTestId("task-task-morning").locator("time")).toHaveAttribute("datetime", task.scheduledAt!);
});
test("answer_alone_does_not_complete_or_create_confirmed_record", async ({ page }) => {
  await start(page, "next-morning", "/");
  await page.getByTestId("next-no-dizzy").click();
  await expect(page.getByTestId("checkin-page")).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
  expect(state.tasks.find((t: { id: string }) => t.id === "task-morning").status).not.toBe("completed");
  expect(state.checkIns).toHaveLength(0);
});

test("unknown_medication_is_not_missed_and_can_be_corrected", async ({ page }) => {
  await start(page, "routine-day", "/care?task=task-amlo");
  await expect(page.getByTestId("dose-status")).toContainText("不代表未服藥");
  await page.getByTestId("task-snooze").click();
  await page.getByLabel("提醒時間（香港時間）").fill("2026-09-16T20:00");
  await page.getByTestId("reminder-save").click();
  expect((await snapshot(page)).medicationDoses.find(d => d.id === "dose-task-amlo")?.status).toBe("unknown");
  await page.getByTestId("dose-user_confirmed_taken").click();
  await expect(page.getByTestId("dose-status")).toContainText("本人確認已服藥");
  await page.getByTestId("dose-user_reported_not_taken").click();
  expect((await snapshot(page)).medicationDoses.find(d => d.id === "dose-task-amlo")?.status).toBe("user_reported_not_taken");
  await page.getByTestId("dose-unknown").click();
  await page.getByTestId("task-cancel").click();
  await page.getByTestId("task-cancel-confirm").click();
  await expect(page.getByTestId("task-status")).toHaveText("已取消");
  const data = await snapshot(page);
  expect(data.medicationDoses.find(d => d.id === "dose-task-amlo")).toMatchObject({ status: "unknown", occurredAt: null, source: "user" });
  expect(data.medicationDoses.find(d => d.id === "dose-ator-14")?.status).toBe("unknown");
  await page.goto("/");
  await expect(page.getByTestId("task-task-amlo")).toHaveCount(0);
});

for (const change of ["still", "worse"] as const) test(`next_day_still_or_worse_requires_new_confirmed_record: ${change}`, async ({ page }) => {
  await start(page, "next-morning", "/care?task=task-morning");
  await page.getByTestId("task-checkin").click();
  await page.getByTestId("mood-okay").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("body-dizzy").click();
  await page.getByTestId(`followup-${change}`).click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-save").click();
  await expect(page.getByTestId("checkin-receipt")).toBeVisible();
  let data = await snapshot(page);
  expect(data.tasks.find(t => t.id === "task-morning")?.status).not.toBe("completed");
  expect(data.checkIns).toHaveLength(1);
  await page.getByTestId("followup-complete").click();
  await expect(page.getByTestId("followup-checkin-receipt").getByRole("alert")).toContainText("實際血壓量度");
  await page.getByTestId("followup-measurement").click();
  await page.getByLabel("收縮壓（mmHg）").fill("148");
  await page.getByLabel("舒張壓（mmHg）").fill("90");
  await page.getByTestId("observation-save").click();
  await page.getByTestId("followup-complete").click();
  await expect(page.getByTestId("followup-checkin-receipt")).toContainText("已完成記錄事項");
  await page.reload();
  data = await snapshot(page);
  expect(data.tasks.find(t => t.id === "task-morning")?.status).toBe("completed");
  expect(data.tasks.find(t => t.id === "task-contact")?.status).toBe("pending");
  expect(data.tasks.find(t => t.id.startsWith("task-next-"))).toMatchObject({ kind: "contact", status: "pending", ownerId: "may" });
  expect(data.healthRecords.find(r => r.id.startsWith("record-followup-"))?.text.zh).toContain(change === "worse" ? "嚴重" : "仍然");
  expect(data.episodes[0].disposition).toBe(change === "worse" ? "worsening" : "uncertain");
  expect(isDemoState(data)).toBe(true);
  await page.goto("/");
  await expect(page.getByTestId("daily-brief")).toContainText("仍不適或加劇");
});

test("after_visit_task_starts_with_patient_owner_and_explicit_source_category", async ({ page }) => {
  await start(page, "after-visit");
  await page.getByLabel("本人提供的虛構事項").fill("研究任務卡：下星期整理覆診問題");
  await page.getByLabel("提醒時間（香港時間）").fill("2026-09-23T09:15");
  await page.getByTestId("aftervisit-preview").click();
  await expect(page.getByTestId("aftervisit-preview-content")).toContainText("本人提供");
  await expect(page.getByLabel("共享類別（預設私人）")).toHaveValue("private");
  await page.getByLabel("希望由誰跟進？").selectOption("david");
  await page.getByTestId("aftervisit-save").dblclick();
  await expect(page.getByTestId("aftervisit-receipt")).toContainText("負責人仍是 May");
  const data = await snapshot(page);
  const task = data.tasks.at(-1)!;
  expect(task).toMatchObject({ kind: "after-visit", ownerId: "may", proposedOwnerId: "david", shareCategory: "private", scheduledAt: "2026-09-23T09:15:00+08:00" });
  expect(data.healthRecords.find(r => task.sourceRecordIds.includes(r.id))).toMatchObject({ patientId: "may", source: "user", category: "private" });
  expect(data.healthRecords.filter(r => r.text.zh === "研究任務卡：下星期整理覆診問題")).toHaveLength(1);
  expect(data.events).toHaveLength(0);
  const mood = value(createAfterVisitTask(data, { patientId: "may", text: "研究情緒模板：和家人談談心情", scheduledAt: "2026-09-23T10:00:00+08:00", proposedOwnerId: "david", shareCategory: "mood" }));
  expect(mood.tasks.at(-1)?.shareCategory).toBe("mood");
  expect(mood.healthRecords.at(-1)?.category).toBe("mood");
  expect(isDemoState(mood)).toBe(true);
});

test("left_message_remains_pending_and_contacted_does_not_close_episode", () => {
  const original = createScenario("next-morning");
  const left = value(recordContactOutcome(original, "task-contact", "left-message", "研究留言"));
  expect(left.tasks.find(t => t.id === "task-contact")).toMatchObject({ status: "pending", contactOutcome: "left_message" });
  expect(left.episodes).toBe(original.episodes);
  const contacted = value(recordContactOutcome(left, "task-contact", "contacted", "已聯絡"));
  expect(contacted.tasks.find(t => t.id === "task-contact")?.status).toBe("completed");
  expect(contacted.episodes).toBe(original.episodes);
});

test("hk_midnight_and_past_snooze_are_consistent_in_foreign_browser_timezone", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "America/Los_Angeles" });
  const page = await context.newPage();
  try {
    const demo = createScenario("routine-day"); demo.clock = "2026-09-16T23:59:00+08:00";
    demo.tasks.find(t => t.id === "task-amlo")!.status = "pending";
    await page.addInitScript(d => { if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(d)); }, demo);
    await page.goto("/");
    await expect(page.getByTestId("today-page")).toContainText("9月16日");
    const at = "2026-09-17T09:15:00+08:00";
    await page.goto("/care?task=task-ator");
    await page.getByTestId("task-snooze").click();
    await page.getByLabel("提醒時間（香港時間）").fill("2026-09-16T20:00");
    await page.getByTestId("reminder-save").click();
    await expect(page.getByTestId("reminder-error")).toContainText("晚於情境時鐘");
    let data = await snapshot(page);
    expect(data.tasks.find(t => t.id === "task-ator")?.scheduledAt).toBe("2026-09-16T21:00:00+08:00");
    await page.getByLabel("提醒時間（香港時間）").fill("2026-09-17T09:15");
    await page.getByTestId("reminder-save").click();
    data = await snapshot(page);
    data.clock = "2026-09-17T00:01:00+08:00";
    await page.evaluate(d => localStorage.setItem("caremate-v4", JSON.stringify(d)), data);
    await page.reload();
    await page.goto("/");
    await expect(page.getByTestId("today-page")).toContainText("9月17日");
    await expect(page.getByTestId("task-task-amlo")).toContainText("已過時間");
    expect((await snapshot(page)).tasks.find(t => t.id === "task-amlo")?.status).toBe("pending");
    expect(taskToIcs(data.tasks.find(t => t.id === "task-ator")!)).toContain("DTSTART:20260917T011500Z");
    for (const bad of ["nonsense", "2026-02-30T09:15:00+08:00", "2026-09-17T09:15", "2026-09-17T25:15:00+08:00"]) {
      expect(scheduleFollowup(data, "may", bad)).toEqual({ ok: false, code: "invalid-time" });
      expect(snoozeTask(data, "task-amlo", bad)).toEqual({ ok: false, code: "invalid-time" });
    }
    for (const past of [data.clock, "2026-09-16T23:59:00+08:00"]) {
      expect(scheduleFollowup(data, "may", past)).toEqual({ ok: false, code: "past-time" });
      expect(snoozeTask(data, "task-amlo", past)).toEqual({ ok: false, code: "past-time" });
    }
    expect(value(scheduleFollowup(data, "may", at)).tasks.find(t => t.id === "task-morning")?.scheduledAt).toBe(at);
    expect(isTaskOverdue(data, data.tasks.find(t => t.id === "task-amlo")!)).toBe(true);
  } finally { await context.close(); }
});

test("task_draft_does_not_consume_daily_or_historical_drafts_and_only_current_confirmation_completes", () => {
  useAppStore.getState().applyScenario("next-morning");
  useAppStore.getState().beginCheckIn();
  const ordinary = useAppStore.getState().demo.drafts[0];
  useAppStore.setState(s => ({ demo: { ...s.demo, drafts: [...s.demo.drafts, { ...ordinary, id: "historical-draft", occurredAt: "2026-09-15T09:00:00+08:00", note: "歷史更正" }] } }));
  const result = useAppStore.getState().beginTaskCheckIn("task-morning", "worse"); expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.code);
  let data = useAppStore.getState().demo;
  expect(data.drafts).toHaveLength(3);
  expect(data.drafts.find(d => d.id === ordinary.id)).toEqual(ordinary);
  expect(completeCheckInTask(data, "task-morning", "missing")).toEqual({ ok: false, code: "confirmed-checkin-required" });
  useAppStore.getState().patchCheckIn(ordinary.id, { mood: "okay", body: "well", step: "review" });
  expect(useAppStore.getState().saveCheckIn(ordinary.id).ok).toBe(true);
  data = useAppStore.getState().demo;
  expect(completeCheckInTask(data, "task-morning", data.checkIns[0].id)).toEqual({ ok: false, code: "confirmed-checkin-required" });
  useAppStore.getState().patchCheckIn(result.value, { mood: "okay", body: "dizzy", step: "review" });
  useAppStore.getState().saveCheckIn(result.value);
  data = useAppStore.getState().demo;
  expect(data.drafts.find(d => d.id === "historical-draft")?.note).toBe("歷史更正");
  const record = data.checkIns.find(c => c.taskId === "task-morning")!;
  expect(completeCheckInTask(data, "task-morning", record.id)).toEqual({ ok: false, code: "measurement-required" });
  const changed = value(scheduleFollowup(data, "may", "2026-09-17T10:00:00+08:00"));
  expect(completeCheckInTask(changed, "task-morning", record.id)).toEqual({ ok: false, code: "confirmed-checkin-required" });
  expect(changed.reports).toBe(data.reports);
  expect(changed.observations).toBe(data.observations);
  expect(isDemoState(changed)).toBe(true);
});

test("all_care_writes_are_patient_only_and_time_changes_preserve_unrelated_domain_facts", () => {
  const state = createScenario("next-morning");
  const david = { ...state, context: { actorId: "david" as const, patientId: "may" as const, perspective: "caregiver" as const } };
  const at = "2026-09-18T09:15:00+08:00";
  for (const result of [scheduleFollowup(david, "may", at), snoozeTask(david, "task-morning", at), cancelTask(david, "task-morning"), setDoseStatus(david, "dose-ator-14", "user_confirmed_taken"), recordContactOutcome(david, "task-contact", "contacted", ""), createAfterVisitTask(david, { patientId: "may", text: "研究事項", scheduledAt: at, proposedOwnerId: "david", shareCategory: "private" })]) expect(result).toEqual({ ok: false, code: "patient-only" });
  const next = value(snoozeTask(state, "task-morning", at));
  expect(next.medicationDoses).toBe(state.medicationDoses);
  expect(next.healthRecords).toBe(state.healthRecords);
  expect(next.tasks.find(t => t.id === "task-amlo")).toBe(state.tasks.find(t => t.id === "task-amlo"));
  expect(next.episodes).toBe(state.episodes);
  expect(taskToIcs({ ...next.tasks.find(t => t.id === "task-morning")!, scheduledAt: "2026-09-18T09:15:37+08:00" })).toContain("DTSTART:20260918T011537Z");
});

test("visible_task_counts_and_touch_targets_match_in_english_at_320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "en", liteMode: false, introComplete: true })));
  await start(page, "routine-day", "/");
  const data = await snapshot(page);
  await expect(page.getByTestId("today-task-count")).toContainText(String(selectTodayTasks(data).length));
  expect(await page.getByTestId(/^task-task-/).count()).toBe(selectTodayTasks(data).length);
  await page.getByTestId("task-task-amlo").click();
  await expect(page.getByTestId("dose-status")).toContainText("not a missed dose");
  await page.getByTestId("task-change").click();
  await page.getByLabel("Reminder time (Hong Kong)").fill("2026-09-17T09:15");
  await page.getByTestId("reminder-save").click();
  await expect(page.getByTestId("task-receipt")).toContainText("9:15 am");
  await expect(page.getByTestId("task-status")).toHaveText("Scheduled");
  for (const id of ["dose-user_confirmed_taken", "dose-user_reported_not_taken", "dose-unknown", "task-snooze", "task-cancel", "task-ics"]) {
    const box = await page.getByTestId(id).boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
