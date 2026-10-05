import { expect, test, type Page } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import { isDemoState } from "../src/lib/demo/persistence";
import { commitCheckIn, createCheckInDraft, updateCheckInDraft } from "../src/lib/demo/check-in";
import { setConsent, revokeConsent, selectSharingProjection, sharedExportText } from "../src/lib/demo/sharing";
import { scheduleFollowup, snoozeTask, cancelTask } from "../src/lib/demo/care";
import { currentOrganisedRecord, episodeBloodPressure, selectEpisodeObservation } from "../src/lib/demo/episode-facts";
import { buildBrief, openBriefDraft, confirmBrief, prepareBriefExport, reconcileBriefs } from "../src/lib/demo/brief";
import { saveObservation } from "../src/lib/demo/check-in";
import { hasSymptomContext } from "../src/lib/demo/local-assistant";
import type { ActionResult, DemoState, Locale } from "../src/lib/demo/types";

const value = (r: ActionResult<DemoState>) => { if (!r.ok) throw Error(r.code); return r.value; };
const read = (page: Page): Promise<DemoState> => page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
test.afterEach(async ({ page }, info) => {
  if (!/^http:\/\/127\.0\.0\.1:3100\//.test(page.url())) return;
  const state = await page.evaluate(() => ({ url: location.href, timeOrigin: performance.timeOrigin, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, state: JSON.parse(localStorage.getItem("caremate-v4")!), preferences: JSON.parse(localStorage.getItem("caremate-v4-preferences")!) }));
  await info.attach("actual-native-endpoint", { body: Buffer.from(JSON.stringify(state)), contentType: "application/json" });
  await info.attach("actual-native-viewport", { body: await page.screenshot(), contentType: "image/png" });
});
async function start(page: Page, demo: DemoState, locale: Locale, route: string) {
  expect(isDemoState(demo)).toBe(true);
  await page.addInitScript(({ demo, locale }) => {
    if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(demo));
    if (!localStorage.getItem("caremate-v4-preferences")) localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale, liteMode: false, introComplete: true }));
  }, { demo, locale });
  await page.goto(route);
}
function summary() {
  const d = createScenario("dizziness");
  d.episodes[0] = { ...d.episodes[0], step: "summary", phase: "summary_review", answers: { ...d.episodes[0].answers, urgent: "none", onset: "after-waking", change: "better", medGap: "forgot" } };
  return d;
}

for (const locale of ["zh-HK", "en"] as const) {
  test(`linked BP correction is the current Today and Ask fact: ${locale}`, async ({ page }) => {
    await start(page, createScenario("dizziness"), locale, "/health");
    await page.getByTestId("health-tab-measurements").click();
    await page.getByTestId("bp-row-bp-16").click();
    await page.getByLabel(locale === "en" ? "Systolic (mmHg)" : "收縮壓（mmHg）").fill("125");
    await page.getByLabel(locale === "en" ? "Diastolic (mmHg)" : "舒張壓（mmHg）").fill("85");
    await page.getByLabel(locale === "en" ? "Measurement time (Hong Kong time)" : "量度發生時間（香港時間）").fill("2026-09-15T07:45");
    await page.getByTestId("observation-save").click();
    await expect(page.getByTestId("observation-receipt")).toBeVisible();
    await expect(page.getByTestId("bp-detail")).toContainText("7:45");
    await page.goto("/");
    await expect(page.getByTestId("daily-brief")).toContainText("125/85");
    await expect(page.getByTestId("daily-brief")).toContainText("7:45");
    await expect(page.getByTestId("daily-brief")).not.toContainText("151/94");
    await page.goto("/ask");
    for (const answer of ["none", "after-waking", "better", "forgot"]) await page.getByTestId(`quick-reply-${answer}`).click();
    await expect(page.getByTestId("structured-summary")).toContainText("125/85");
    await expect(page.getByTestId("structured-summary")).toContainText("7:45");
    await page.reload();
    await expect(page.getByTestId("structured-summary")).toContainText("125/85");
  });
  test(`new organised source uses linked BP and retains historical dialogue: ${locale}`, async ({ page }) => {
    const d = summary();
    d.observations = d.observations.map(o => o.id === "bp-16" ? { ...o, systolic: 125, diastolic: 85, occurredAt: "2026-09-15T07:45:00+08:00", revision: o.revision + 1 } : o);
    const historical = structuredClone(d.assistantSessions);
    await start(page, d, locale, "/ask");
    await page.getByTestId("add-to-journey").click();
    const saved = await read(page);
    expect(saved.assistantSessions).toEqual(historical);
    const organised = saved.healthRecords.find(r => r.id === "ep-dizzy-16")!;
    expect(organised.text.en).toContain("125/85");
    expect(organised.text.zh).toContain("125/85");
    expect(organised.text.en).not.toContain("151/94");
    await page.goto("/brief");
    await page.getByTestId("brief-details-toggle").click();
    await expect(page.getByTestId("brief-packet")).toContainText("125/85");
  });
  test(`accepted empty report retains its source without inventing results: ${locale}`, async ({ page }) => {
    const d = createScenario("routine-day"); d.reports[0].results = [];
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await start(page, d, locale, "/report");
    await expect(page.getByTestId("lab-count")).toContainText("0");
    await page.getByText(locale === "en" ? "Original report" : "報告原文", { exact: true }).click();
    await expect(page.locator("pre")).toHaveText(locale === "en" ? d.reports[0].originalText.en : d.reports[0].originalText.zh);
    await page.reload(); await expect(page.getByTestId("lab-count")).toContainText("0"); expect(errors).toEqual([]);
  });
  test(`follow-up hero uses the committed date and 09:15 time: ${locale}`, async ({ page }) => {
    const d = summary(); d.episodes[0] = { ...d.episodes[0], saved: true, disposition: "ordinary", step: "saved", phase: "summary_saved" };
    const scheduled = value(scheduleFollowup(d, "may", "2026-09-18T09:15:00+08:00"));
    await start(page, scheduled, locale, "/");
    await expect(page.getByTestId("daily-brief")).toContainText("9:15");
    await expect(page.getByTestId("daily-brief")).not.toContainText(locale === "en" ? "Tomorrow at 8:30" : "明早8:30");
    await page.reload(); await expect(page.getByTestId("daily-brief")).toContainText("9:15");
  });
  test(`booking retains corrected clinical allergy with personalisation off: ${locale}`, async ({ page }) => {
    const d = createScenario("dizziness"); d.memories = d.memories.map(m => ({ ...m, enabled: false }));
    await start(page, d, locale, "/memory");
    await page.getByTestId("memory-mem-pen").click();
    await page.getByText(locale === "en" ? "Correct" : "更正", { exact: true }).click();
    await page.getByRole("textbox").fill("Clinical allergy corrected by May");
    await page.getByRole("button", { name: locale === "en" ? "Save" : "儲存", exact: true }).click();
    await page.goto("/book");
    await expect(page.getByTestId("book-packet")).toContainText("Clinical allergy corrected by May");
    await page.reload(); await expect(page.getByTestId("book-packet")).toContainText("Clinical allergy corrected by May");
    expect((await read(page)).memories.find(m => m.id === "mem-pen")?.enabled).toBe(false);
  });
  for (const mode of ["draft", "report", "mood"] as const) test(`neutral ${mode} session does not become a physical symptom: ${locale}`, async ({ page }) => {
    await start(page, createScenario("routine-day"), locale, mode === "mood" ? "/ask?topic=mood" : "/ask");
    const input = page.getByRole("textbox");
    await input.fill(mode === "report" ? "What does my report mean?" : mode === "mood" ? "I feel low" : "A neutral unfinished question");
    if (mode !== "draft") await input.press("Enter");
    await page.goto("/");
    await expect(page.getByTestId("daily-brief")).not.toContainText(locale === "en" ? "Dizziness" : "頭暈");
    await expect(page.getByTestId("daily-brief")).not.toContainText("151/94");
    await page.reload(); await expect(page.getByTestId("daily-brief")).not.toContainText("151/94");
  });
}

test("historical correction cannot replace chronological caregiver summary", () => {
  let d = createScenario("routine-day");
  const oldDraft = updateCheckInDraft(createCheckInDraft(d, "may"), { mood: "low", body: "dizzy" });
  d = value(commitCheckIn(d, oldDraft)); d = { ...d, clock: "2026-09-17T08:45:00+08:00" };
  d = value(commitCheckIn(d, updateCheckInDraft(createCheckInDraft(d, "may"), { mood: "good", body: "well" })));
  d = value(commitCheckIn(d, updateCheckInDraft(oldDraft, { mood: "stressed", body: "tired" })));
  d = value(setConsent(d, { patientId: "may", recipientId: "david", level: "summary", categories: ["body", "mood"] }));
  const projection = selectSharingProjection(d, "may", "david");
  expect(projection.summary.map(s => s.en).join("\n")).toContain("Feeling well");
  expect(projection.summary.map(s => s.en).join("\n")).not.toContain("Tired");
  const exported = sharedExportText(d, "may", "david", "en"); expect(exported.ok).toBe(true);
  if (exported.ok) expect(exported.value).toContain("Feeling well");
});

test("missing, unlinked and future readings stay unknown rather than borrowing a BP", () => {
  const d = createScenario("dizziness"), e = d.episodes[0];
  expect(episodeBloodPressure(d, { ...e, sourceRecordIds: [] }).en).toBe("No linked blood-pressure reading");
  expect(episodeBloodPressure({ ...d, observations: [] }, e).en).toBe("No linked blood-pressure reading");
  const future = { ...d, observations: d.observations.map(o => ({ ...o, occurredAt: "2026-09-30T08:30:00+08:00" })) };
  expect(selectEpisodeObservation(future, e)).toBeUndefined();
  expect(selectEpisodeObservation({ ...d, context: { ...d.context, actorId: "david", perspective: "caregiver" } }, e)).toBeUndefined();
  expect(selectEpisodeObservation(d, e)?.id).toBe("bp-16");
});

test("correction of a linked reading invalidates a confirmed organised packet without rewriting source", () => {
  let d = summary();
  const source = { ...d.healthRecords[0], id: "organised-regression", source: "organised" as const, category: "body" as const, kind: "symptom" as const, text: { zh: "本人描述的症狀\n151/94 mmHg", en: "Patient-described symptoms\n151/94 mmHg" } };
  d = { ...d, healthRecords: [...d.healthRecords, source], episodes: d.episodes.map(e => ({ ...e, sourceRecordIds: [...e.sourceRecordIds, source.id] })) };
  d = value(openBriefDraft(d, "appt-gp")); d = value(confirmBrief(d, d.briefs.at(-1)!.id));
  const prior = structuredClone(d.briefs.at(-1)!);
  expect(prior.sourceRecordIds).toContain("bp-16");
  d = value(saveObservation(d, { ...d.observations.find(o => o.id === "bp-16")!, systolic: 125, diastolic: 85, occurredAt: "2026-09-15T07:45:00+08:00" }));
  expect(d.briefs.at(-1)!.status).toBe("draft");
  expect(prepareBriefExport(d, prior.id).ok).toBe(false);
  d = reconcileBriefs(d);
  const current = d.briefs.at(-1)!;
  expect(current.sections.find(s => s.id === "body")!.text.en).toContain("125/85");
  expect(current.sections.find(s => s.id === "body")!.text.en).not.toContain("151/94");
  expect(current.sourceRevisions["bp-16"]).toBe(d.observations.find(o => o.id === "bp-16")!.revision);
  expect(current.contentFingerprint).not.toBe(prior.contentFingerprint);
  expect(d.healthRecords.find(r => r.id === source.id)).toEqual(source);
  expect(currentOrganisedRecord(d, { ...source, source: "imported" })).toEqual({ ...source, source: "imported" });
  expect(currentOrganisedRecord(d, { ...source, text: { zh: "原文沒有分段", en: "Authored single line" } }).text.en).toBe("Authored single line");
});

test("body-only recipient cannot acquire linked measurement prose from current composition", () => {
  let d = summary();
  const source = { ...d.healthRecords[0], id: "organised-privacy", source: "organised" as const, category: "body" as const, kind: "symptom" as const, text: { zh: "症狀\n125/85 mmHg", en: "Symptoms\n125/85 mmHg" } };
  d = { ...d, healthRecords: [...d.healthRecords, source], episodes: d.episodes.map(e => ({ ...e, sourceRecordIds: [...e.sourceRecordIds, source.id] })) };
  d = value(setConsent(d, { patientId: "may", recipientId: "doctor-wong", level: "full", categories: ["body", "appointments"] }));
  const shared = buildBrief(d, "may", { appointmentId: "appt-gp", includeMood: false, recipientId: "doctor-wong" });
  expect(shared.ok).toBe(true);
  if (shared.ok) { expect(shared.value.sections.map(s => s.text.en).join("\n")).not.toMatch(/125\/85|151\/94|mmHg/); expect(shared.value.sourceRecordIds).not.toContain("bp-16"); }
});

test("chronological tie is stable and revocation removes caregiver summary", () => {
  let d = createScenario("routine-day");
  d = value(commitCheckIn(d, updateCheckInDraft(createCheckInDraft(d, "may"), { mood: "good", body: "well" })));
  const original = d.checkIns[0];
  d = { ...d, checkIns: [{ ...original, id: "a-tie", draftId: "tie-a", body: "well", mood: "good" }, { ...original, id: "z-tie", draftId: "tie-z", body: "tired", mood: "stressed" }] };
  d = value(setConsent(d, { patientId: "may", recipientId: "david", level: "summary", categories: ["body", "mood"] }));
  const text = selectSharingProjection(d, "may", "david").summary;
  expect(text).toEqual(selectSharingProjection({ ...d, checkIns: [...d.checkIns].reverse() }, "may", "david").summary);
  expect(text.map(t => t.en).join("\n")).toContain("Feeling well");
  d = value(revokeConsent(d, d.grants.find(g => g.recipientId === "david")!.id));
  expect(selectSharingProjection(d, "may", "david").summary).toEqual([]);
});

test("unrelated or superseded symptom evidence does not qualify a neutral session", () => {
  const d = createScenario("dizziness"), e = d.episodes[0];
  expect(hasSymptomContext(d, e)).toBe(true);
  expect(hasSymptomContext(d, { ...e, sourceRecordIds: ["bp-16"] })).toBe(false);
  expect(hasSymptomContext({ ...d, healthRecords: d.healthRecords.map(r => ({ ...r, supersededByRecordId: "replacement" })) }, e)).toBe(false);
});

for (const locale of ["zh-HK", "en"] as const) {
  test(`snoozed and cancelled follow-up hero remains truthful: ${locale}`, async ({ page }) => {
    const d = summary(); d.episodes[0] = { ...d.episodes[0], saved: true, disposition: "ordinary", step: "saved", phase: "summary_saved" };
    let next = value(scheduleFollowup(d, "may", "2026-09-18T09:15:00+08:00"));
    next = value(snoozeTask(next, "task-morning", "2026-09-19T10:20:00+08:00"));
    await start(page, next, locale, "/");
    await expect(page.getByTestId("daily-brief")).toContainText("10:20");
    await page.reload(); await expect(page.getByTestId("daily-brief")).toContainText("10:20");
    const cancelled = value(cancelTask(next, "task-morning"));
    // A separate clean context is a setup fixture, not a callback or state mutation of the measured UI.
    const other = await page.context().browser()!.newContext(); const separate = await other.newPage();
    await start(separate, cancelled, locale, new URL("/", page.url()).href);
    await expect(separate.getByTestId("daily-brief")).not.toContainText("10:20");
    await other.close();
  });
  test(`missing clinical allergy stays unknown: ${locale}`, async ({ page }) => {
    const d = createScenario("dizziness"); d.memories = d.memories.filter(m => m.id !== "mem-pen");
    await start(page, d, locale, "/book");
    await expect(page.getByTestId("book-packet")).toContainText(locale === "en" ? "No retained allergy note" : "未有已保留的過敏資料");
    await expect(page.getByTestId("book-packet")).not.toContainText("Penicillin");
  });
}

for (const locale of ["zh-HK", "en"] as const) {
  test(`saved organised readers follow a later native BP correction: ${locale}`, async ({ page }, info) => {
    const d = summary();
    d.observations = d.observations.map(o => o.id === "bp-16" ? { ...o, systolic: 125, diastolic: 85, occurredAt: "2026-09-15T07:45:00+08:00", revision: o.revision + 1 } : o);
    await start(page, d, locale, "/ask");
    const authoredBefore = (await read(page)).assistantSessions;
    await page.getByTestId("add-to-journey").click();
    const saved = await read(page);
    const organised = saved.healthRecords.find(r => r.id === "ep-dizzy-16")!;
    expect(organised.text[locale === "en" ? "en" : "zh"]).toContain("125/85");
    await page.goto("/health");
    await page.getByTestId("health-tab-measurements").click();
    await page.getByTestId("bp-row-bp-16").click();
    await page.getByLabel(locale === "en" ? "Systolic (mmHg)" : "收縮壓（mmHg）").fill("114");
    await page.getByLabel(locale === "en" ? "Diastolic (mmHg)" : "舒張壓（mmHg）").fill("74");
    await page.getByLabel(locale === "en" ? "Measurement time (Hong Kong time)" : "量度發生時間（香港時間）").fill("2026-09-15T08:05");
    await page.getByTestId("observation-save").click();
    await expect(page.getByTestId("observation-receipt")).toBeVisible();
    await page.getByRole("button", { name: locale === "en" ? "Close" : "關閉", exact: true }).click();
    await page.getByTestId("health-tab-records").click();
    const list = page.getByTestId("journey-event-ep-dizzy-16");
    await expect(list).toBeVisible();
    const listText = await list.innerText();
    await info.attach("organised-health-list", { body: await page.screenshot(), contentType: "image/png" });
    await list.click();
    const detail = page.getByRole("dialog");
    await expect(detail).toBeVisible();
    const detailText = await detail.innerText();
    await info.attach("organised-health-detail", { body: await page.screenshot(), contentType: "image/png" });
    await page.getByRole("button", { name: locale === "en" ? "Close" : "關閉", exact: true }).click();
    await page.goto("/ask");
    await expect(page.getByTestId("chat-page")).toBeVisible();
    const contextText = await page.getByTestId("chat-page").locator("header").innerText();
    await info.attach("organised-current-ask-context", { body: await page.screenshot(), contentType: "image/png" });
    await page.goto("/brief");
    await page.getByTestId("brief-details-toggle").click();
    await expect(page.getByTestId("brief-packet")).toContainText("114/74");
    await page.goto("/book");
    await expect(page.getByTestId("book-packet")).toBeVisible();
    const bookText = await page.getByTestId("book-packet").innerText();
    const after = await read(page);
    expect(after.healthRecords).toEqual(saved.healthRecords);
    expect(after.assistantSessions).toEqual(authoredBefore);
    await info.attach("organised-reader-source-and-display", { body: Buffer.from(JSON.stringify({ storedBefore: saved.healthRecords, storedAfter: after.healthRecords, authoredBefore, authoredAfter: after.assistantSessions, currentObservation: after.observations.find(o => o.id === "bp-16"), listText, detailText, bookText, contextText })), contentType: "application/json" });
    expect.soft(contextText).not.toContain(locale === "en" ? "this morning’s" : "今早");
    for (const [reader, text] of [["Health list", listText], ["Health detail", detailText], ["Book packet", bookText]]) {
      expect.soft(text, reader).toContain("114/74");
      expect.soft(text, reader).toContain("8:05");
      expect.soft(text, reader).not.toContain("125/85");
    }
  });
}
