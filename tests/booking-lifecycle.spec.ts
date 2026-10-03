import { expect, test, type Page } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import type { DemoState } from "../src/lib/demo/types";
import { cancelAppointment, createAccompanyTask, setAppointment } from "../src/lib/demo/care";
import { isDemoState } from "../src/lib/demo/persistence";

const snapshot = (page: Page): Promise<DemoState> => page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
async function start(page: Page, demo = createScenario("routine-day")) {
  await page.addInitScript(d => { if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(d)); }, demo);
  await page.goto("/book");
}
test("booking_review_can_change_cancel_and_resume", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("book-packet")).not.toContainText("頭暈");
  await expect(page.getByTestId("slot-slot-17-1100")).toBeVisible();
  await page.getByTestId("slot-slot-17-1100").click();
  await page.getByTestId("book-review-open").click();
  await expect(page.getByTestId("booking-review")).toContainText("May");
  await expect(page.getByTestId("booking-review").locator("time").first()).toHaveAttribute("datetime", "2026-09-22T14:30:00+08:00");
  await page.getByTestId("book-review-back").click();
  await page.getByTestId("slot-slot-18-1530").click();
  await page.getByTestId("book-review-open").click();
  await page.getByTestId("book-confirm").dblclick();
  expect((await snapshot(page)).appointments).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId("book-receipt").locator("time")).toHaveAttribute("datetime", "2026-09-18T15:30:00+08:00");
  await page.goto("/care");
  await page.getByTestId("follow-appt-row").click();
  await page.getByTestId("book-change").click();
  await page.getByTestId("slot-slot-17-1100").click();
  await page.getByTestId("book-review-open").click();
  await page.getByTestId("book-confirm").click();
  await expect(page.getByTestId("book-receipt").locator("time")).toHaveAttribute("datetime", "2026-09-17T11:00:00+08:00");
  const download = page.waitForEvent("download"); await page.getByTestId("book-ics").click();
  const fs = await import("node:fs/promises");
  expect(await fs.readFile((await (await download).path())!, "utf8")).toContain("DTSTART:20260917T030000Z");
  await page.getByTestId("book-cancel").click();
  await page.getByTestId("book-cancel-back").click();
  expect((await snapshot(page)).appointments[0].status).toBe("scheduled");
  await page.getByTestId("book-cancel").click(); await page.getByTestId("book-cancel-confirm").click();
  await page.reload(); await expect(page.getByTestId("book-cancelled")).toBeVisible();
  await page.goto("/care"); await expect(page.getByTestId("follow-appt-row")).toHaveCount(0);
  await page.goto("/book"); await page.getByTestId("slot-slot-22-1430").click();
  await page.getByTestId("book-review-open").click(); await page.getByTestId("book-confirm").click();
  expect((await snapshot(page)).appointments[0]).toMatchObject({ status: "scheduled", scheduledAt: "2026-09-22T14:30:00+08:00" });
});
test("booking_does_not_complete_contact_task_or_claim_clinic_confirmation", async ({ page }) => {
  const demo = createScenario("next-morning"); await start(page, demo);
  await expect(page.getByTestId("book-review-open")).toBeVisible();
  await page.getByTestId("slot-slot-17-1100").click(); await page.getByTestId("book-review-open").click(); await page.getByTestId("book-confirm").click();
  expect((await snapshot(page)).tasks.find(t => t.id === "task-contact")).toEqual(demo.tasks.find(t => t.id === "task-contact"));
  await expect(page.getByTestId("book-receipt")).toContainText("本地行程");
  await expect(page.getByTestId("book-receipt")).toContainText("未通知診所");
});
test("past_slots_are_filtered_after_clock_advance", async ({ page }) => {
  const demo = createScenario("next-morning"); demo.clock = "2026-09-21T08:45:00+08:00";
  await start(page, demo);
  await expect(page.getByTestId("slot-slot-17-1100")).toHaveCount(0);
  await expect(page.getByTestId("slot-slot-18-1530")).toHaveCount(0);
  await expect(page.getByTestId("slot-slot-22-1430")).toBeVisible();
});

test("no_slots_and_caregiver_context_have_clear_recovery", async ({ page }) => {
  const demo = createScenario("routine-day"); demo.clock = "2026-09-23T00:01:00+08:00";
  await start(page, demo);
  await expect(page.getByTestId("book-no-slots")).toContainText("原有安排保留");
  await expect(page.getByTestId("book-review-open")).toHaveCount(0);
  expect((await snapshot(page)).appointments).toEqual(demo.appointments);
});

test("appointment_guards_recheck_future_time_and_preserve_current_urgency", () => {
  const demo = createScenario("routine-day");
  expect(setAppointment(demo, "appt-gp", "invented-slot")).toEqual({ ok: false, code: "slot-missing" });
  demo.clock = "2026-09-17T11:00:00+08:00";
  expect(setAppointment(demo, "appt-gp", "slot-17-1100")).toEqual({ ok: false, code: "past-slot" });
  expect(setAppointment(createScenario("urgent-help"), "appt-gp", "slot-17-1100")).toEqual({ ok: false, code: "urgent-help-required" });
  const historical = createScenario("urgent-help");
  historical.episodes.push({ ...historical.episodes[0], id: "new-ordinary", disposition: "ordinary", answers: { ...historical.episodes[0].answers, urgent: "none" } });
  const next = setAppointment(historical, "appt-gp", "slot-17-1100");
  expect(next.ok).toBe(true); if (!next.ok) throw Error(next.code);
  expect(next.value.episodes[0]).toEqual(historical.episodes[0]);
  expect(setAppointment(next.value, "appt-gp", "slot-17-1100")).toEqual({ ok: true, value: next.value });
});

test("David_authors_only_own_accompany_task_when_appointment_authorised", () => {
  const demo = createScenario("caregiver-alert");
  expect(setAppointment(demo, "appt-gp", "slot-17-1100")).toEqual({ ok: false, code: "patient-only" });
  expect(cancelAppointment(demo, "appt-gp")).toEqual({ ok: false, code: "patient-only" });
  expect(createAccompanyTask(demo, "appt-gp")).toEqual({ ok: false, code: "appointment-unavailable" });
  demo.grants[0] = { ...demo.grants[0], level: "summary", categories: ["appointments"] };
  const result = createAccompanyTask(demo, "appt-gp"); if (!result.ok) throw Error(result.code);
  expect(result.value.tasks.at(-1)).toMatchObject({ ownerId: "david", patientId: "may", kind: "accompany", sourceRecordIds: ["appt-gp"] });
  expect(result.value.appointments).toEqual(demo.appointments);
  expect(result.value.healthRecords).toEqual(demo.healthRecords);
  expect(createAccompanyTask(result.value, "appt-gp")).toEqual({ ok: true, value: result.value });
  expect(isDemoState(result.value)).toBe(true);
  result.value.grants[0].status = "revoked";
  expect(createAccompanyTask(result.value, "appt-gp")).toEqual({ ok: false, code: "appointment-unavailable" });
});

test("appointment_change_invalidates_only_linked_preparation_and_brief_confirmation", () => {
  const demo = createScenario("next-morning");
  demo.tasks.push({ ...demo.tasks[0], id: "previsit", kind: "check-in", status: "scheduled", sourceRecordIds: ["appt-gp"], workflowRevision: 1 });
  demo.briefs.push({ id: "packet-gp", patientId: "may", appointmentId: "appt-gp", appointmentRevision: 1, recipientId: "may", grantRevision: null, status: "confirmed", revision: 1, generatedAt: demo.clock, confirmedAt: demo.clock, sections: [], questions: [], sourceRecordIds: ["appt-gp"], sourceRevisions: { "appt-gp": 1 }, includeMood: false });
  const result = setAppointment(demo, "appt-gp", "slot-17-1100"); if (!result.ok) throw Error(result.code);
  expect(result.value.tasks.find(t => t.id === "previsit")).toMatchObject({ status: "cancelled", revision: 2, workflowRevision: 2 });
  expect(result.value.tasks.find(t => t.id === "task-morning")).toEqual(demo.tasks.find(t => t.id === "task-morning"));
  expect(result.value.tasks.find(t => t.id === "task-contact")).toEqual(demo.tasks.find(t => t.id === "task-contact"));
  expect(result.value.briefs[0]).toMatchObject({ status: "draft", confirmedAt: null, appointmentRevision: 1 });
  const cancelled = cancelAppointment(result.value, "appt-gp"); if (!cancelled.ok) throw Error(cancelled.code);
  expect(cancelled.value.appointments[0]).toMatchObject({ status: "cancelled", revision: 3 });
  expect(isDemoState(cancelled.value)).toBe(true);
});

test("HK_midnight_itinerary_and_ICS_match_in_foreign_timezone", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "America/Los_Angeles" }); const page = await context.newPage();
  const demo = createScenario("routine-day"); demo.clock = "2026-09-17T00:01:00+08:00"; await start(page, demo);
  await page.getByTestId("slot-slot-17-1100").click(); await page.getByTestId("book-review-open").click(); await page.getByTestId("book-confirm").click();
  await expect(page.getByTestId("book-receipt").locator("time")).toContainText("9月17日");
  const download = page.waitForEvent("download"); await page.getByTestId("book-ics").click();
  const fs = await import("node:fs/promises"); expect(await fs.readFile((await (await download).path())!, "utf8")).toContain("DTSTART:20260917T030000Z");
  await context.close();
});

test("cancelled_appointment_has_safe_brief_print_and_today_recovery", async ({ page }) => {
  await start(page, createScenario("next-morning"));
  await page.getByTestId("book-cancel").click(); await page.getByTestId("book-cancel-confirm").click();
  await page.goto("/brief"); await expect(page.getByTestId("brief-appointment-unavailable")).toBeVisible();
  await page.getByTestId("visit-copy").click();
  await page.goto("/print"); await expect(page.getByTestId("print-view")).toContainText("沒有已安排的本地行程");
  await expect(page.getByTestId("print-view")).not.toContainText("9月22日");
  await page.goto("/"); await expect(page.getByTestId("today-page")).toBeVisible();
  await expect(page.getByTestId("today-page")).not.toContainText("9月22日");
});

test("caregiver_shell_recovery_returns_to_manageable_May_appointment", async ({ page }) => {
  const demo = createScenario("caregiver-alert"); await start(page, demo);
  await expect(page.getByTestId("shared-unavailable")).toBeVisible();
  await expect(page.getByTestId("book-confirm")).toHaveCount(0);
  expect((await snapshot(page)).appointments).toEqual(demo.appointments);
  await page.goto("/dev"); await page.getByTestId("perspective-may").click();
  await page.goto("/book"); await expect(page.getByTestId("book-review-open")).toBeVisible();
});

test("english_booking_review_is_usable_at_320px_with_reduced_motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "en", liteMode: true, introComplete: true })));
  await start(page); await page.getByTestId("book-review-open").click();
  await expect(page.getByTestId("booking-review")).toContainText("May Chan");
  await expect(page.getByTestId("book-confirm")).toHaveText("Confirm the new time");
  const box = await page.getByTestId("book-confirm").boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId("book-confirm").click(); await expect(page.getByTestId("book-receipt")).toContainText("Local itinerary updated");
});

test("keeping_same_slot_preserves_confirmed_packet_source_revision", () => {
  const demo = createScenario("routine-day");
  demo.briefs.push({ id: "confirmed-original", patientId: "may", appointmentId: "appt-gp", appointmentRevision: 1, recipientId: "may", grantRevision: null, status: "confirmed", revision: 1, generatedAt: demo.clock, confirmedAt: demo.clock, sections: [], questions: [], sourceRecordIds: ["appt-gp"], sourceRevisions: { "appt-gp": 1 }, includeMood: false });
  const result = setAppointment(demo, "appt-gp", "slot-22-1430"); if (!result.ok) throw Error(result.code);
  expect(result.value.appointments[0]).toMatchObject({ bookingStatus: "kept", revision: 1 });
  expect(result.value.briefs).toEqual(demo.briefs);
  expect(result.value.briefs[0].appointmentRevision).toBe(result.value.appointments[0].revision);
  expect(result.value.tasks).toEqual(demo.tasks);
  expect(setAppointment(result.value, "appt-gp", "slot-22-1430")).toEqual({ ok: true, value: result.value });
  expect(isDemoState(result.value)).toBe(true);
});

test("accompany_task_cannot_be_created_or_rescheduled_for_a_past_appointment", () => {
  const demo = createScenario("caregiver-alert");
  demo.grants[0] = { ...demo.grants[0], level: "summary", categories: ["appointments"] };
  const first = createAccompanyTask(demo, "appt-gp"); if (!first.ok) throw Error(first.code);
  const history = first.value.tasks.find(t => t.id === "task-accompany-appt-gp")!;
  demo.clock = "2026-09-23T00:01:00+08:00";
  expect(createAccompanyTask(demo, "appt-gp")).toEqual({ ok: false, code: "past-time" });
  const retained = { ...first.value, clock: demo.clock, tasks: first.value.tasks.map(t => t.id === history.id ? { ...t, status: "completed" as const, contactNote: "my earlier accompaniment" } : t) };
  const before = structuredClone(retained);
  expect(createAccompanyTask(retained, "appt-gp")).toEqual({ ok: false, code: "past-time" });
  expect(retained).toEqual(before);
  const invalid = { ...demo, appointments: demo.appointments.map(a => ({ ...a, scheduledAt: "2026-09-24T10:00:00" })) };
  expect(createAccompanyTask(invalid, "appt-gp")).toEqual({ ok: false, code: "invalid-time" });
});

test("selected_patient_questions_are_retained_in_actual_booking_flow", async ({ page }) => {
  await start(page, createScenario("next-morning"));
  await page.goto("/report");
  await page.getByTestId("add-q-q-hba1c-follow").click();
  const selected = (await snapshot(page)).questions.find(q => q.id === "q-hba1c-follow")!;
  expect(selected.selected).toBe(true);
  await page.goto("/brief");
  await page.getByTestId("open-booking").click();
  await expect(page.getByTestId("book-packet")).toContainText(selected.text.zh);
  const unselected = (await snapshot(page)).questions.find(q => !q.selected)!;
  await expect(page.getByTestId("book-packet")).not.toContainText(unselected.text.zh);
  await page.getByTestId("book-review-open").click(); await page.getByTestId("book-confirm").click();
  await page.reload(); await expect(page.getByTestId("book-packet")).toContainText(selected.text.zh);
});
