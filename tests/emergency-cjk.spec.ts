import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

async function clearWorld(page: import("@playwright/test").Page) {
  await page.goto('/about');
  await page.evaluate(() => {
    localStorage.removeItem("caremate-v4");
    if (!localStorage.getItem("caremate-v4-preferences")) localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale: "zh-HK", liteMode: false, introComplete: true }));
    sessionStorage.removeItem("caremate-v4-emergency");
  });
}

async function fontFamilyOf(page: import("@playwright/test").Page, selector: string) {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).fontFamily);
}

async function notoFaceCount(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    let n = 0;
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue("font-family");
        if (family.includes("Noto Sans TC")) n += 1;
      }
    }
    return n;
  });
}

test("fresh /ask is the dizziness check-in, not the emergency page", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await expect(page.getByTestId("chat-page")).toBeVisible();
  await expect(page.getByTestId("emergency-state")).toHaveCount(0);
  await expect(page.getByTestId("quick-reply-none")).toBeVisible();
  await expect(page.getByRole("heading", { name: "了解頭暈情況" })).toBeVisible();
});

test("urgent branch renders exact Traditional Chinese and a CJK system font", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await page.getByTestId("quick-reply-chest-breath").click();

  const emergency = page.getByTestId("emergency-state");
  await expect(emergency).toBeVisible();
  await expect(emergency.getByRole("heading", { level: 1 })).toHaveText("請立即尋求醫療協助");
  await expect(emergency.getByText("你描述的情況可能需要緊急處理。請立即使用電話撥打999，不要等候康伴回覆。")).toBeVisible();
  await expect(page.getByTestId("call-999")).toHaveText("999");
  await expect(page.getByTestId("call-999")).not.toHaveText("9999");
  await expect(emergency.getByText("康伴不會代你致電。")).toBeVisible();

  await page.getByTestId("em-how").click();
  await expect(page.getByTestId("em-how-body")).toHaveText("請自行開啟電話應用程式，撥打999。康伴不會代你致電。");

  const headingFont = await fontFamilyOf(page, "[data-testid=emergency-state] h1");
  expect(headingFont, headingFont).not.toMatch(/Noto Sans TC Fallback/);
  expect(headingFont, headingFont).toMatch(/Noto Sans TC/);
  expect(await notoFaceCount(page)).toBeGreaterThan(0);
  const notoReady = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((face) => face.family.replace(/['"]/g, "") === "Noto Sans TC" && face.status === "loaded");
  });
  expect(notoReady).toBeTruthy();
});

test("assistant describes finite local scope without network readiness probing", async ({ page }) => {
  await clearWorld(page);
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  await page.goto("/ask");
  await expect(page.getByTestId("assistant-scope")).toContainText("本地示範");
  expect(requests.filter(url => /\/api\//.test(url) || new URL(url).origin !== new URL(test.info().project.use.baseURL!).origin)).toEqual([]);
  await expect(page.getByTestId("chat-page")).not.toContainText("HKBU");
});

test("leaving emergency returns to Today without opening a routine summary", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await page.getByTestId("quick-reply-chest-breath").click();
  await expect(page.getByTestId("emergency-state")).toBeVisible();
  await page.getByTestId("em-back").click();
  await expect(page.getByTestId("today-page")).toBeVisible();
  await expect(page.getByTestId("daily-brief")).toContainText("請立即尋求醫療協助");
  await expect(page.getByTestId("structured-summary")).toHaveCount(0);
  await expect(page.getByTestId("talk-to-caremate")).toHaveCount(0);
  await page.getByTestId("return-emergency").click();
  await expect(page.getByTestId("emergency-state")).toBeVisible();
  await expect(page.getByTestId("call-999")).toHaveText("999");
});
