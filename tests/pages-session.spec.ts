import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

/** Clears saved state once, so later reloads in the test observe real persistence. */
async function clearWorld(page: Page) {
  await page.goto("/about");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function newSession(page: Page) {
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
}

test("an emergency stays for the session it was raised in", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await page.getByTestId("quick-reply-chest-breath").click();
  await expect(page.getByTestId("emergency-state")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("emergency-state")).toBeVisible();

  await page.goto("/");
  await expect(page.getByTestId("daily-brief")).toContainText("請立即尋求醫療協助");
});

test("a later visit re-asks the urgent question instead of re-showing the alarm", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await page.getByTestId("quick-reply-chest-breath").click();
  await expect(page.getByTestId("emergency-state")).toBeVisible();

  await newSession(page);
  await expect(page.getByTestId("emergency-state")).toHaveCount(0);
  await expect(page.getByTestId("quick-reply-chest-breath")).toBeVisible();
  await expect(page.getByTestId("chat-log").getByText("胸口痛或呼吸困難")).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByTestId("daily-brief")).toContainText("今早頭暈");
  await expect(page.getByTestId("talk-to-caremate")).toBeVisible();
});

test("a saved journey still survives a new session", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await page.getByTestId("quick-reply-none").click();
  await page.getByTestId("quick-reply-after-waking").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();
  await page.getByTestId("add-to-journey").click();
  await expect(page.getByTestId("prep-visit")).toBeVisible();

  await newSession(page);
  await expect(page.getByTestId("prep-visit")).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("daily-brief")).toContainText("就診資料已整理");
});

test("settings can clear the data on this device and start over, keeping language", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await page.getByTestId("quick-reply-none").click();
  await page.getByTestId("quick-reply-after-waking").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();
  await page.getByTestId("add-to-journey").click();
  await expect(page.getByTestId("prep-visit")).toBeVisible();

  await page.goto("/settings");
  await page.getByTestId("lang-en-settings").click();
  await page.getByTestId("clear-device-data").click();
  await expect(page.getByTestId("clear-device-confirm")).toBeVisible();
  await page.getByTestId("clear-device-confirm").click();

  await expect(page.getByTestId("today-page")).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("cleared");
  await expect(page.getByTestId("daily-brief")).toContainText("Dizziness this morning");
  await expect(page.getByTestId("talk-to-caremate")).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v3") ?? "{}") as { episodeSaved?: boolean; locale?: string });
  expect(saved.episodeSaved).toBeFalsy();
  expect(saved.locale).toBe("en");
});

test("the emergency page never shows patient navigation", async ({ page }) => {
  await clearWorld(page);
  await page.goto("/ask");
  await page.getByTestId("quick-reply-chest-breath").click();
  await expect(page.getByTestId("emergency-state")).toBeVisible();
  await expect(page.getByTestId("nav-today")).toHaveCount(0);
  await expect(page.getByTestId("nav-ask")).toHaveCount(0);
  await expect(page.getByTestId("fab-ask")).toHaveCount(0);
});
