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

async function confirmFollowup(page: Page, change: "no-dizzy" | "still" | "worse", measure = true) {
  await page.getByTestId("mood-okay").click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("body-dizzy").click();
  await page.getByTestId(`followup-${change}`).click();
  await page.getByTestId("checkin-next").click();
  await page.getByTestId("checkin-next").click();
  if (measure) {
    await page.getByTestId("followup-measurement").click();
    await page.getByLabel("收縮壓（mmHg）").fill("145");
    await page.getByLabel("舒張壓（mmHg）").fill("89");
    await page.getByTestId("observation-save").click();
  }
  await page.getByTestId("checkin-save").click();
  await expect(page.getByTestId("followup-checkin-receipt")).toContainText("已完成記錄事項");
}
for (const initial of ["no-dizzy", "worse"] as const) test(`completed_followup_correction_reconciles_source_revision: ${initial}`, async ({ page }) => {
  await start(page, "next-morning", "/care?task=task-morning");
  await page.getByTestId("task-checkin").click();
  await confirmFollowup(page, initial);
  const original = await snapshot(page);
  await page.getByTestId("checkin-receipt").getByRole("button", { name: "更正這項紀錄", exact: true }).click();
  await confirmFollowup(page, initial === "worse" ? "no-dizzy" : "worse", false);
  const corrected = await snapshot(page);
  expect(corrected.checkIns).toHaveLength(1);
  expect(corrected.checkIns[0].revision).toBe(2);
  expect(corrected.checkIns[0].occurredAt).toBe(original.checkIns[0].occurredAt);
  expect(corrected.checkIns[0].enteredAt).toBe(original.checkIns[0].enteredAt);
  expect(corrected.episodes[0].answers.nextMorning).toBe(initial === "worse" ? "no-dizzy" : "worse");
  expect(corrected.episodes[0].disposition).toBe(initial === "worse" ? "ordinary" : "worsening");
  const activeNext = corrected.tasks.filter(t => t.id.startsWith("task-next-") && t.status !== "cancelled" && t.status !== "completed");
  expect(activeNext).toHaveLength(initial === "worse" ? 0 : 1);
  expect(corrected.tasks.find(t => t.id === "task-contact")).toEqual(original.tasks.find(t => t.id === "task-contact"));
  expect(isDemoState(corrected)).toBe(true);
  await page.reload();
  expect((await snapshot(page)).episodes[0].answers.nextMorning).toBe(initial === "worse" ? "no-dizzy" : "worse");
});

test("confirmed_corrections_preserve_responded_contact_history_and_create_current_next_step", () => {
  useAppStore.getState().applyScenario("next-morning");
  const draft = useAppStore.getState().beginTaskCheckIn("task-morning", "worse");
  if (!draft.ok) throw Error(draft.code);
  useAppStore.getState().patchCheckIn(draft.value, { mood: "okay", body: "dizzy", step: "review" });
  const at = useAppStore.getState().demo.clock;
  useAppStore.getState().saveObservation({ id: "current-bp-correction", patientId: "may", occurredAt: at, enteredAt: at, source: "home-measure", systolic: 145, diastolic: 89, revision: 1 });
  useAppStore.getState().saveCheckIn(draft.value);
  let state = useAppStore.getState().demo;
  const checkIn = state.checkIns[0];
  const next = state.tasks.find(t => t.id.startsWith("task-next-"))!;
  useAppStore.getState().recordContactOutcome(next.id, "left-message", "已留下聯絡電話");
  const history = useAppStore.getState().demo.tasks.find(t => t.id === next.id)!;
  useAppStore.getState().editCheckIn(checkIn.id);
  useAppStore.getState().patchCheckIn(checkIn.draftId, { followupChange: "no-dizzy", step: "review" });
  useAppStore.getState().saveCheckIn(checkIn.draftId);
  state = useAppStore.getState().demo;
  expect(state.tasks.find(t => t.id === next.id)).toMatchObject({ contactOutcome: history.contactOutcome, contactNote: history.contactNote, ownerId: history.ownerId, status: history.status });
  expect(state.tasks.find(t => t.id === next.id)).toHaveProperty("supersededByCheckInRevision", 2);
  expect(selectTodayTasks(state).some(t => t.id === next.id)).toBe(false);
  useAppStore.getState().editCheckIn(checkIn.id);
  useAppStore.getState().patchCheckIn(checkIn.draftId, { followupChange: "still", step: "review" });
  useAppStore.getState().saveCheckIn(checkIn.draftId);
  state = useAppStore.getState().demo;
  expect(state.tasks.filter(t => t.id.startsWith("task-next-") && !("supersededByCheckInRevision" in t) && t.status === "pending")).toHaveLength(1);
  expect(state.episodes[0].disposition).toBe("uncertain");
  const latest = state.tasks.find(t => t.id === "task-morning")!;
  expect(value(completeCheckInTask(state, latest.id, checkIn.id))).toEqual(state);
  expect(isDemoState(state)).toBe(true);
});

test("midnight_resumed_task_draft_preserves_history_and_offers_current_confirmed_path", async ({ page }) => {
  const state = createScenario("next-morning"); state.clock = "2026-09-17T23:59:00+08:00";
  state.drafts.push({ id: "draft-followup-task-morning-1", patientId: "may", occurredAt: state.clock, mood: "low", body: "dizzy", followupChange: "worse", note: "昨晚尚未確認的補充", taskId: "task-morning", step: "review", revision: 3 });
  state.clock = "2026-09-18T00:01:00+08:00";
  await page.addInitScript(d => { if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(d)); }, state);
  await page.goto("/check-in?draft=draft-followup-task-morning-1");
  await expect(page.getByTestId("checkin-review")).toContainText("昨晚尚未確認的補充");
  await page.getByTestId("task-current-checkin").click();
  await confirmFollowup(page, "still");
  const saved = await snapshot(page);
  expect(saved.drafts.find(d => d.id === state.drafts[0].id)).toEqual(state.drafts[0]);
  expect(saved.checkIns[0]).toMatchObject({ occurredAt: state.clock, enteredAt: state.clock, taskId: "task-morning", followupChange: "still" });
  expect(saved.tasks.find(t => t.id === "task-morning")?.status).toBe("completed");
  expect(isDemoState(saved)).toBe(true);
});

test("reopened_contact_detail_displays_saved_outcome_and_selection", async ({ page }) => {
  await start(page, "next-morning", "/care?task=task-contact");
  await page.getByLabel("聯絡情況補充").fill("研究任務：已留言");
  await page.getByTestId("contact-left-message").click();
  await page.reload();
  await expect(page.getByTestId("contact-outcome")).toContainText("已留言，仍需跟進");
  await expect(page.getByTestId("contact-left-message")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("聯絡情況補充")).toHaveValue("研究任務：已留言");
});

test("nonclinical_correction_keeps_current_contact_without_duplicate_action", () => {
  useAppStore.getState().applyScenario("next-morning");
  const draft = useAppStore.getState().beginTaskCheckIn("task-morning", "still"); if (!draft.ok) throw Error(draft.code);
  useAppStore.getState().patchCheckIn(draft.value, { mood: "okay", body: "dizzy", step: "review" });
  const at = useAppStore.getState().demo.clock;
  useAppStore.getState().saveObservation({ id: "current-bp-nonclinical", patientId: "may", occurredAt: at, enteredAt: at, source: "home-measure", systolic: 145, diastolic: 89, revision: 1 });
  useAppStore.getState().saveCheckIn(draft.value);
  const before = useAppStore.getState().demo;
  const checkIn = before.checkIns[0]; const contact = before.tasks.find(t => t.id.startsWith("task-next-"))!;
  useAppStore.getState().recordContactOutcome(contact.id, "left-message", "已留言");
  useAppStore.getState().editCheckIn(checkIn.id);
  useAppStore.getState().patchCheckIn(checkIn.draftId, { mood: "low", step: "review" });
  useAppStore.getState().saveCheckIn(checkIn.draftId);
  const after = useAppStore.getState().demo;
  expect(after.tasks.filter(t => t.id.startsWith("task-next-"))).toHaveLength(1);
  expect(after.tasks.find(t => t.id === contact.id)).toMatchObject({ contactOutcome: "left_message", contactNote: "已留言", status: "pending" });
  expect(after.tasks.find(t => t.id === contact.id)).not.toHaveProperty("supersededByCheckInRevision");
  expect(after.tasks.find(t => t.id === "task-morning")?.completionEvidence?.checkInRevision).toBe(2);
  expect(isDemoState(after)).toBe(true);
});

for (const [initial, correction] of [["worse", "still"], ["worse", "no-dizzy"], ["no-dizzy", "worse"]] as const) test(`historical_correction_after_stable_task_reuse_preserves_current_completion: ${initial} to ${correction}`, () => {
  useAppStore.getState().applyScenario("next-morning");
  const confirm = (change: "no-dizzy" | "still" | "worse", measurementId: string) => {
    const draft = useAppStore.getState().beginTaskCheckIn("task-morning", change); if (!draft.ok) throw Error(draft.code);
    useAppStore.getState().patchCheckIn(draft.value, { mood: "okay", body: "dizzy", step: "review" });
    const at = useAppStore.getState().demo.clock;
    expect(useAppStore.getState().saveObservation({ id: measurementId, patientId: "may", occurredAt: at, enteredAt: at, source: "home-measure", systolic: 145, diastolic: 89, revision: 1 }).ok).toBe(true);
    expect(useAppStore.getState().saveCheckIn(draft.value).ok).toBe(true);
    return useAppStore.getState().demo.checkIns.find(c => c.draftId === draft.value)!;
  };
  const old = confirm(initial, "bp-sept17");
  // A snapshot produced before completionHistory existed still retains its own evidence on reuse.
  const legacy = JSON.parse(JSON.stringify(useAppStore.getState().demo));
  delete legacy.tasks.find((t: { id: string }) => t.id === "task-morning").completionHistory;
  useAppStore.setState({ demo: legacy });
  const oldEvidence = useAppStore.getState().demo.tasks.find(t => t.id === "task-morning")!.completionEvidence!;
  expect(useAppStore.getState().scheduleFollowup("2026-09-18T09:15:00+08:00").ok).toBe(true);
  useAppStore.setState({ demo: { ...useAppStore.getState().demo, clock: "2026-09-18T09:15:00+08:00" } });
  const current = confirm("no-dizzy", "bp-sept18");
  const before = useAppStore.getState().demo;
  const currentEvidence = before.tasks.find(t => t.id === "task-morning")!.completionEvidence!;
  useAppStore.getState().editCheckIn(old.id);
  useAppStore.getState().patchCheckIn(old.draftId, { followupChange: correction, step: "review" });
  expect(useAppStore.getState().saveCheckIn(old.draftId).ok).toBe(true);
  const after = useAppStore.getState().demo;
  expect(after.tasks.find(t => t.id === "task-morning")!.completionEvidence).toEqual(currentEvidence);
  expect(after.episodes).toEqual(before.episodes);
  expect(after.observations).toEqual(before.observations);
  expect(after.checkIns.find(c => c.id === current.id)).toEqual(current);
  expect(after.tasks.filter(t => t.id.startsWith("task-next-") && !t.supersededByCheckInRevision && t.status === "pending")).toHaveLength(0);
  expect(after.tasks.find(t => t.id === "task-morning")!.completionHistory?.find(e => e.checkInId === old.id)).toEqual({ ...oldEvidence, checkInRevision: 2 });
  expect(after.healthRecords.find(r => r.derivedFromCheckIn?.id === old.id && !r.supersededByRecordId)).toMatchObject({ derivedFromCheckIn: { id: old.id, revision: 2 }, kind: correction === "no-dizzy" ? "note" : "symptom", occurredAt: old.occurredAt });
  expect(value(completeCheckInTask(after, "task-morning", old.id))).toEqual(after);
  expect(isDemoState(JSON.parse(JSON.stringify(after)))).toBe(true);
  for (const [field, invalid] of [["measurementId", "missing-bp"], ["measurementId", "dose-ator-14"], ["episodeId", "missing-episode"], ["checkInId", "bp-sept17"]]) {
    const corrupt = JSON.parse(JSON.stringify(after));
    corrupt.tasks.find((t: { id: string }) => t.id === "task-morning").completionHistory[0][field] = invalid;
    expect(isDemoState(corrupt)).toBe(false);
  }
  useAppStore.getState().editCheckIn(current.id);
  useAppStore.getState().patchCheckIn(current.draftId, { followupChange: "still", step: "review" });
  useAppStore.getState().saveCheckIn(current.draftId);
  const correctedCurrent = useAppStore.getState().demo;
  expect(correctedCurrent.tasks.find(t => t.id === "task-morning")!.completionEvidence).toMatchObject({ checkInId: current.id, checkInRevision: 2, measurementId: "bp-sept18" });
  expect(correctedCurrent.episodes[0].answers.nextMorning).toBe("still");
  const active = correctedCurrent.tasks.filter(t => t.id.startsWith("task-next-") && !t.supersededByCheckInRevision && t.status === "pending");
  expect(active).toHaveLength(1);
  expect(active[0].sourceRecordIds).toContain("bp-sept18");
  expect(active[0].sourceRecordIds).not.toContain("bp-sept17");
  expect(isDemoState(correctedCurrent)).toBe(true);
});

test("current_correction_without_completion_history_retains_legacy_evidence", () => {
  useAppStore.getState().applyScenario("next-morning");
  const draft = useAppStore.getState().beginTaskCheckIn("task-morning", "worse"); if (!draft.ok) throw Error(draft.code);
  useAppStore.getState().patchCheckIn(draft.value, { mood: "okay", body: "dizzy", step: "review" });
  const at = useAppStore.getState().demo.clock;
  useAppStore.getState().saveObservation({ id: "legacy-current-bp", patientId: "may", occurredAt: at, enteredAt: at, source: "home-measure", systolic: 145, diastolic: 89, revision: 1 });
  useAppStore.getState().saveCheckIn(draft.value);
  const legacy = JSON.parse(JSON.stringify(useAppStore.getState().demo));
  const task = legacy.tasks.find((t: { id: string }) => t.id === "task-morning");
  const evidence = task.completionEvidence;
  delete task.completionHistory;
  useAppStore.setState({ demo: legacy });
  const record = legacy.checkIns[0];
  useAppStore.getState().editCheckIn(record.id);
  useAppStore.getState().patchCheckIn(record.draftId, { followupChange: "no-dizzy", step: "review" });
  useAppStore.getState().saveCheckIn(record.draftId);
  const corrected = useAppStore.getState().demo;
  expect(corrected.tasks.find(t => t.id === "task-morning")!.completionEvidence).toEqual({ ...evidence, checkInRevision: 2 });
  expect(corrected.episodes[0]).toMatchObject({ answers: { nextMorning: "no-dizzy" }, disposition: evidence.priorDisposition });
  expect(isDemoState(corrected)).toBe(true);
});

for (const legacy of [false, true]) test(`paused_current_workflow_survives_unrelated_historical_correction: legacy=${legacy}`, () => {
  useAppStore.getState().applyScenario("next-morning");
  const oldDraft = useAppStore.getState().beginTaskCheckIn("task-morning", "worse"); if (!oldDraft.ok) throw Error(oldDraft.code);
  useAppStore.getState().patchCheckIn(oldDraft.value, { mood: "okay", body: "dizzy", step: "review" });
  let at = useAppStore.getState().demo.clock;
  useAppStore.getState().saveObservation({ id: "paused-old-bp", patientId: "may", occurredAt: at, enteredAt: at, source: "home-measure", systolic: 145, diastolic: 89, revision: 1 });
  useAppStore.getState().saveCheckIn(oldDraft.value);
  const old = useAppStore.getState().demo.checkIns[0];
  useAppStore.getState().scheduleFollowup("2026-09-18T09:15:00+08:00");
  const scheduled = JSON.parse(JSON.stringify(useAppStore.getState().demo));
  scheduled.clock = "2026-09-18T09:15:00+08:00";
  if (legacy) delete scheduled.tasks.find((t: { id: string }) => t.id === "task-morning").workflowRevision;
  useAppStore.setState({ demo: scheduled });
  const currentDraft = useAppStore.getState().beginTaskCheckIn("task-morning", "no-dizzy"); if (!currentDraft.ok) throw Error(currentDraft.code);
  useAppStore.getState().patchCheckIn(currentDraft.value, { mood: "low", body: "well", note: "今日本人已輸入的補充", step: "review" });
  at = useAppStore.getState().demo.clock;
  useAppStore.getState().saveObservation({ id: "paused-current-bp", patientId: "may", occurredAt: at, enteredAt: at, source: "home-measure", systolic: 140, diastolic: 85, revision: 1 });
  const before = useAppStore.getState().demo;
  const task = before.tasks.find(t => t.id === "task-morning")!;
  const savedDraft = before.drafts.find(d => d.id === currentDraft.value)!;
  useAppStore.getState().editCheckIn(old.id);
  useAppStore.getState().patchCheckIn(old.draftId, { followupChange: "still", step: "review" });
  useAppStore.getState().saveCheckIn(old.draftId);
  const corrected = useAppStore.getState().demo;
  expect(corrected.tasks.find(t => t.id === task.id)!.revision).toBe(task.revision + 1);
  expect(corrected.tasks.find(t => t.id === task.id)!.workflowRevision).toBe(task.workflowRevision ?? task.revision);
  expect(corrected.drafts.find(d => d.id === currentDraft.value)).toEqual(savedDraft);
  expect(corrected.episodes).toEqual(before.episodes);
  const resumed = useAppStore.getState().beginTaskCheckIn(task.id);
  expect(useAppStore.getState().saveCheckIn(currentDraft.value).ok).toBe(true);
  const completed = useAppStore.getState().demo;
  expect(completed.tasks.find(t => t.id === task.id)).toMatchObject({ status: "completed", completionEvidence: { checkInId: `checkin-${currentDraft.value}`, measurementId: "paused-current-bp" } });
  expect(resumed).toEqual(currentDraft);
  expect(completed.checkIns.find(c => c.draftId === currentDraft.value)).toMatchObject({ mood: savedDraft.mood, body: savedDraft.body, note: savedDraft.note, occurredAt: savedDraft.occurredAt });
  expect(completed.episodes[0].answers.nextMorning).toBe("no-dizzy");
  expect(isDemoState(JSON.parse(JSON.stringify(completed)))).toBe(true);
  for (const invalidRevision of ["not-a-revision", 0, completed.tasks.find(t => t.id === task.id)!.revision + 1]) {
    const invalid = JSON.parse(JSON.stringify(completed));
    invalid.tasks.find((t: { id: string }) => t.id === task.id).workflowRevision = invalidRevision;
    expect(isDemoState(invalid)).toBe(false);
  }
});

for (const transition of ["reschedule", "cancel-reopen"] as const) test(`real_workflow_change_invalidates_prior_draft: ${transition}`, () => {
  useAppStore.getState().applyScenario("next-morning");
  const draft = useAppStore.getState().beginTaskCheckIn("task-morning", "still"); if (!draft.ok) throw Error(draft.code);
  useAppStore.getState().patchCheckIn(draft.value, { mood: "okay", body: "dizzy", step: "review" });
  if (transition === "reschedule") useAppStore.getState().rescheduleTask("task-morning", "2026-09-17T10:00:00+08:00");
  else {
    useAppStore.getState().cancelCareTask("task-morning");
    useAppStore.getState().scheduleFollowup("2026-09-17T10:00:00+08:00");
  }
  useAppStore.setState({ demo: { ...useAppStore.getState().demo, clock: "2026-09-17T10:00:00+08:00" } });
  const at = useAppStore.getState().demo.clock;
  useAppStore.getState().saveObservation({ id: `changed-bp-${transition}`, patientId: "may", occurredAt: at, enteredAt: at, source: "home-measure", systolic: 145, diastolic: 89, revision: 1 });
  useAppStore.getState().saveCheckIn(draft.value);
  const state = useAppStore.getState().demo;
  expect(state.tasks.find(t => t.id === "task-morning")!.status).toBe("scheduled");
  expect(completeCheckInTask(state, "task-morning", `checkin-${draft.value}`)).toEqual({ ok: false, code: "confirmed-checkin-required" });
  const replacement = useAppStore.getState().beginTaskCheckIn("task-morning", "still"); if (!replacement.ok) throw Error(replacement.code);
  expect(replacement.value).not.toBe(draft.value);
  useAppStore.getState().patchCheckIn(replacement.value, { mood: "okay", body: "dizzy", step: "review" });
  useAppStore.getState().saveCheckIn(replacement.value);
  expect(useAppStore.getState().demo.tasks.find(t => t.id === "task-morning")!.status).toBe("completed");
  expect(isDemoState(useAppStore.getState().demo)).toBe(true);
});
