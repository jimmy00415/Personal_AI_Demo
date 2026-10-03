import { expect, test } from "@playwright/test";
import { getHelpDisposition, getLocalAssistantReply } from "../src/lib/demo/local-assistant";
import { createScenario } from "../src/lib/demo/scenarios";
import { useAppStore } from "../src/lib/store";
import { isDemoState } from "../src/lib/demo/persistence";
import { applyLegacyPatch } from "../src/lib/demo/legacy";
import type { LocalAssistantContext } from "../src/lib/demo/types";

export function context(): LocalAssistantContext {
  const d = createScenario("dizziness");
  return { context: d.context, clock: d.clock, locale: "zh-HK", episode: d.episodes[0], records: d.healthRecords, reports: d.reports, memories: d.memories, medicationDoses: d.medicationDoses };
}
test("unsupported_input_keeps_a_useful_next_action", () => {
  const reply = getLocalAssistantReply("weather on Mars", context());
  expect(reply.disposition).toBe("unsupported");
  expect(reply.nextAction).toBe("question");
  expect(reply.text.en).not.toMatch(/diagnos|you are safe/i);
  expect(getLocalAssistantReply("feeling low", context()).intent).toBe("mood");
  expect(getHelpDisposition("stressed")).toBeNull();
});
test("urgent_uncertain_and_worsening_are_separate", () => {
  for (const disposition of ["uncertain", "worsening", "urgent"] as const) {
    const c = context(); c.episode!.disposition = disposition;
    expect(getLocalAssistantReply("help", c).disposition).toBe(disposition);
  }
  useAppStore.getState().applyScenario("urgent-help");
  useAppStore.getState().saveSummary();
  expect(useAppStore.getState().demo.episodes[0].saved).toBe(false);
  expect(useAppStore.getState().scheduleFollowup("2026-09-17T09:00:00+08:00").ok).toBe(false);
});
test("later messages preserve next-morning worsening and task evidence", () => {
  const demo = createScenario("next-morning");
  demo.episodes[0].answers.nextMorning = "worse";
  demo.episodes[0].disposition = "worsening";
  const next = applyLegacyPatch(demo, { messages: [{ id: "note", role: "user", text: { zh: "hi", en: "hi" } }] });
  expect(next.episodes).toEqual(demo.episodes);
  expect(next.tasks).toEqual(demo.tasks);
  useAppStore.setState({ demo: next });
  useAppStore.getState().sendFreeText("report");
  expect(useAppStore.getState().demo.episodes).toEqual(demo.episodes);
});
test("no_api_or_external_requests_during_all_assistant_paths", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", req => requests.push(req.url()));
  await page.goto("/ask");
  await page.getByTestId("quick-reply-none").click();
  for (const input of ["nh", "weather on Mars", "feeling low", "stressed", "report", "medicine"]) {
    await page.getByTestId("ask-input").fill(input);
    await page.getByTestId("ask-send").click();
    if (input === "feeling low") await expect(page.getByTestId("assistant-record-only")).toBeVisible();
  }
  expect(requests.filter(url => new URL(url).origin !== "http://127.0.0.1:3000" || /\/api\//.test(url))).toEqual([]);
});
for (const locale of ["zh-HK", "en"] as const) for (const entry of ["ask", "check-in"] as const) {
  test(`fixed_emotional_help_inputs_interrupt_both_entry_points_in_both_languages ${locale} ${entry}`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", request => requests.push(request.url()));
    const input = locale === "en" ? "I want to hurt myself now" : "我現在想傷害自己";
    await page.addInitScript(({ locale }) => {
      if (!localStorage.getItem("caremate-v4-preferences")) localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale, liteMode: false, introComplete: true }));
    }, { locale });
    await page.goto(`/${entry}`);
    if (entry === "ask") {
      await page.getByTestId("ask-input").fill(input); await page.getByTestId("ask-send").click();
    } else {
      await page.getByTestId("mood-low").click(); await page.getByTestId("checkin-next").click();
      await page.getByTestId("body-well").click(); await page.getByTestId("checkin-next").click();
      await page.locator("#checkin-note").fill(input); await page.getByTestId("checkin-next").click();
    }
    await expect(page).toHaveURL(/\/help\/?$/);
    await expect(page.getByTestId("emotional-help")).toBeVisible();
    await expect(page.getByTestId("checkin-receipt")).toHaveCount(0);
    await page.reload(); await expect(page.getByTestId("emotional-help")).toBeVisible();
    await expect(page.locator("a[href^='tel:']")).toHaveCount(0);
    expect(requests.filter(url => new URL(url).origin !== "http://127.0.0.1:3000" || /\/api\//.test(url))).toEqual([]);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
    expect(entry === "ask" ? saved.assistantSessions.at(-1).draft : saved.drafts.at(-1).note).toBe(input);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByTestId("help-recheck")).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("caremate-v4-emergency"))).toBeNull();
  });
}

test("active help blocks an unrelated due task completion", () => {
  useAppStore.getState().applyScenario("next-morning");
  const draft = useAppStore.getState().beginTaskCheckIn("task-morning", "no-dizzy");
  if (!draft.ok) throw Error(draft.code);
  useAppStore.getState().patchCheckIn(draft.value, { mood: "okay", body: "well", step: "review" });
  expect(useAppStore.getState().saveCheckIn(draft.value).ok).toBe(true);
  let d = useAppStore.getState().demo;
  useAppStore.getState().saveObservation({ id: "urgent-test-bp", patientId: "may", systolic: 130, diastolic: 80, occurredAt: d.clock, enteredAt: d.clock, source: "home-measure", revision: 1 });
  useAppStore.setState(s => ({ demo: { ...s.demo, episodes: [], assistantSessions: [] } }));
  useAppStore.getState().requestHelp("emotional");
  d = useAppStore.getState().demo;
  expect(useAppStore.getState().completeCheckInTask("task-morning", d.checkIns[0].id)).toEqual({ ok: false, code: "urgent-help-required" });
  expect(useAppStore.getState().demo.tasks.find(t => t.id === "task-morning")?.status).toBe("scheduled");
});
test("unclear change remains uncertain and cannot become a routine summary", () => {
  useAppStore.getState().applyScenario("dizziness");
  for (const value of ["none", "just-now", "unclear", "forgot"]) useAppStore.getState().answer(value);
  expect(useAppStore.getState().demo.episodes[0].disposition).toBe("uncertain");
  useAppStore.getState().saveSummary();
  expect(useAppStore.getState().demo.episodes[0].saved).toBe(false);
});

test("emotional help remains patient-bound across role changes and validates its kind", () => {
  useAppStore.getState().applyScenario("routine-day");
  useAppStore.getState().setAssistantDraft("I want to hurt myself now");
  useAppStore.getState().sendFreeText("I want to hurt myself now");
  const before = useAppStore.getState().demo;
  const active = useAppStore.getState().activeEmergencyEpisodeId;
  expect(isDemoState(before)).toBe(true);
  expect(isDemoState({ ...before, episodes: [{ ...before.episodes[0], helpKind: "anything" }] })).toBe(false);
  useAppStore.getState().setPerspective("david");
  useAppStore.getState().sendFreeText("medicine");
  expect(useAppStore.getState().activeEmergencyEpisodeId).toBe(active);
  expect(useAppStore.getState().messages).toEqual([]);
  useAppStore.getState().setPerspective("may");
  expect(useAppStore.getState().demo.episodes).toEqual(before.episodes);
  expect(useAppStore.getState().demo.assistantSessions).toEqual(before.assistantSessions);
  expect(useAppStore.getState().step).toBe("urgent_help");
});
test("correcting old answers removes superseded summary text", async ({ page }) => {
  await page.goto("/ask");
  for (const value of ["none", "just-now", "worse", "forgot"]) await page.getByTestId(`quick-reply-${value}`).click();
  await page.getByTestId("edit-summary").click();
  for (const value of ["yesterday", "better", "taken-unlogged"]) await page.getByTestId(`quick-reply-${value}`).click();
  const summary = page.getByTestId("structured-summary");
  await expect(summary).toContainText("昨天已經開始");
  await expect(summary).not.toContainText("比剛才嚴重");
  await expect(summary).not.toContainText("剛剛開始");
  await page.getByTestId("ask-input").fill("medicine");
  await page.getByTestId("ask-send").click();
  await expect(page.getByTestId("chat-log")).toContainText("你已確認這次服藥");
});
