import { expect, test } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";
import { messages } from "../src/lib/i18n";
import { isDemoState } from "../src/lib/demo/persistence";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

for (const locale of ["en", "zh-HK"] as const) test(`cached pre-fix dialogue labels its existing Help link truthfully ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  // Whole initial historical snapshot: before clause recognition this exact input
  // produced the ordinary mood response, without activating an urgent episode.
  const demo = createScenario("dizziness");
  const input = "I feel worried about my blood test and I want to hurt myself now";
  demo.assistantSessions[0].messages.push({ id: "u-free-cached-composed", role: "user", text: { zh: input, en: input } }, { id: "a-free-cached-mood", role: "assistant", text: messages["local.mood"] });
  expect(isDemoState(demo)).toBe(true);
  await page.addInitScript(({ demo, locale }) => {
    if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(demo));
    localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale, liteMode: false, introComplete: true }));
  }, { demo, locale });
  await page.goto("/ask");
  const next = page.getByTestId("assistant-next");
  await expect(next).toHaveAttribute("href", "/help");
  await expect(next).toHaveAccessibleName(locale === "en" ? "Urgent help" : "即時求助");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!))).toEqual(demo);
  await expect(page).toHaveURL(/\/ask\/?$/);
  const beforeBytes = await page.evaluate(() => localStorage.getItem("caremate-v4"));
  const beforeAx = await page.locator("body").ariaSnapshot();
  const beforeDom = await page.locator("body").innerHTML();
  await page.screenshot({ path: test.info().outputPath(`cached-help-${locale}-before.png`), fullPage: true });
  await next.click(); await expect(page).toHaveURL(/\/help\/?$/);
  const afterBytes = await page.evaluate(() => localStorage.getItem("caremate-v4"));
  expect(afterBytes).toBe(beforeBytes);
  await page.screenshot({ path: test.info().outputPath(`cached-help-${locale}-after.png`), fullPage: true });
  const source = await readFile("src/features/assistant/AskPage.tsx");
  await writeFile(test.info().outputPath(`cached-help-${locale}-provenance.json`), JSON.stringify({ scope: "Prepared coherent pre-fix dialogue in an actual Playwright browser; technical visual closure, not original root capture or participant evidence", buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(), sourceSha256: createHash("sha256").update(source).digest("hex"), locale, actor: demo.context, clock: demo.clock, beforeBytes, afterBytes, beforeAx, beforeDom, afterAx: await page.locator("body").ariaSnapshot(), afterDom: await page.locator("body").innerHTML(), activation: "Native browser click on the existing Link" }, null, 2));
});

for (const locale of ["zh-HK", "en"] as const) for (const destination of ["report", "brief"] as const) {
  test(`uncached Ask navigation gives truthful pending feedback ${locale} ${destination}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ demo, locale }) => {
      if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(demo));
      localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale, liteMode: false, introComplete: true }));
    }, { demo: createScenario("dizziness"), locale });
    await page.goto("/ask");
    await page.getByTestId("ask-input").fill(destination === "report" ? "report" : "feeling low");
    await page.getByTestId("ask-send").click();
    const link = page.getByTestId("assistant-next");
    await expect(link).toHaveAttribute("href", `/${destination}`);
    const stateBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
    const rectBefore = await link.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; });
    const pending = page.getByTestId("assistant-navigation-pending");
    await expect(pending).toBeHidden();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => url.pathname === `/${destination}` && url.searchParams.has("_rsc"), async route => { await held; await route.continue(); });
    const activation = destination === "report" ? link.click({ noWaitAfter: true }) : link.press("Enter");
    try {
      await expect(pending).toBeVisible();
      await expect(pending).toHaveText(locale === "en" ? destination === "report" ? "Opening blood test…" : "Opening consultation brief…" : destination === "report" ? "正在開啟血液化驗…" : "正在開啟就診摘要…");
      expect(await link.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })).toEqual(rectBefore);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!))).toEqual(stateBefore);
    } finally { release(); await activation; }
    await expect(page).toHaveURL(new RegExp(`/${destination}/?$`));
    if (destination === "brief") await page.getByTestId("brief-details-toggle").click();
    await expect(page.getByTestId(destination === "report" ? "lab-page" : "brief-packet")).toBeVisible();
    await expect(pending).toHaveCount(0);
    const stateAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
    for (const key of ["episodes", "healthRecords", "checkIns", "medicationDoses", "tasks", "grants", "events", "assistantSessions", "reports"]) expect(stateAfter[key]).toEqual(stateBefore[key]);
  });
}

test("modified Report activation keeps native new-tab behavior without false pending", async ({ page, context }) => {
  await page.goto("/ask");
  await page.getByTestId("ask-input").fill("report");
  await page.getByTestId("ask-send").click();
  const nextPage = context.waitForEvent("page");
  await page.getByTestId("assistant-next").click({ modifiers: ["ControlOrMeta"] });
  const opened = await nextPage;
  await expect(opened).toHaveURL(/\/report\/?$/);
  await expect(page).toHaveURL(/\/ask\/?$/);
  await expect(page.getByTestId("assistant-navigation-pending")).toBeHidden();
  await opened.close();
});

test("valid first Brief prepares a draft without a false permission denial", async ({ page }) => {
  await page.addInitScript(demo => {
    if (!localStorage.getItem("caremate-v4")) localStorage.setItem("caremate-v4", JSON.stringify(demo));
    localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "en", liteMode: false, introComplete: true }));
    const seen: string[] = [];
    Object.assign(window, { briefRenderStates: seen });
    const selector = '[data-testid="brief-unavailable"], [data-testid="brief-preparing"]';
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) {
        for (const el of [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]) seen.push(el.textContent || "");
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, createScenario("dizziness"));
  await page.goto("/ask");
  await page.getByTestId("ask-input").fill("feeling low");
  await page.getByTestId("ask-send").click();
  await page.getByTestId("assistant-next").click();
  await page.getByTestId("brief-details-toggle").click();
  await expect(page.getByTestId("brief-packet")).toBeVisible();
  const states = await page.evaluate(() => (window as Window & { briefRenderStates?: string[] }).briefRenderStates);
  expect(states).toContain("Preparing your consultation brief…");
  expect(states).not.toContain("Current permission does not allow this brief to be exported.");
  await expect(page.getByTestId("visit-copy")).toBeDisabled();
  await expect(page.getByTestId("visit-print")).toBeDisabled();
});
