import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial", timeout: 60_000 });

async function reset(page: import("@playwright/test").Page) {
  await page.goto("/dev");
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("today-page")).toBeVisible({ timeout: 5000 });
}

test("main journey: dizziness, med gap, brief, follow-up, next morning", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("caremate-v3");
      localStorage.removeItem("caremate-locale");
      localStorage.removeItem("caremate-lite");
    });
  await reset(page);
  await expect(page.getByTestId("daily-brief")).toContainText("今早頭暈");
  await expect(page.getByTestId("task-task-amlo")).toContainText("晚上才需要");
  await expect(page.getByTestId("task-task-ator")).toContainText("晚上才需要");

  await page.getByTestId("talk-to-caremate").click();
  await expect(page.getByTestId("chat-page")).toBeVisible();
  await page.getByTestId("quick-reply-none").click();
  await page.getByTestId("quick-reply-after-waking").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();
  await expect(page.getByTestId("med-receipt")).toBeVisible();
  await expect(page.getByTestId("structured-summary")).toContainText("144/90");
  await expect(page.getByTestId("structured-summary")).not.toContainText("錯過");
  await expect(page.getByTestId("structured-summary")).not.toContainText("missed");

  await page.getByText("更正內容").click();
  await page.getByTestId("quick-reply-after-waking").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();

  await page.getByTestId("add-to-journey").click();
  await expect(page.getByTestId("toast")).toContainText("已加入健康紀錄");
  await page.getByTestId("prep-visit").click();
  await expect(page.getByTestId("visit-brief")).toBeVisible();
  await expect(page.getByTestId("brief-med-correction")).toBeVisible();
  await expect(page.getByTestId("brief-bp")).toContainText("144/90");
  await expect(page.getByTestId("visit-brief")).toContainText("家居量度");
  await expect(page.getByTestId("visit-brief")).not.toContainText("陳麗華");

  await page.getByTestId("open-report").click();
  await expect(page.getByTestId("lab-page")).toBeVisible();
  await expect(page.getByTestId("lab-count")).toHaveText("3");
  await page.getByTestId("add-q-q-hba1c-follow").click();
  await expect(page.getByTestId("toast")).toContainText("已加入就診問題");
  await page.getByText("返回就診摘要").click();
  await expect(page.getByTestId("brief-questions")).toContainText("HbA1c");

  await page.getByTestId("visit-copy").click();
  await expect(page.getByTestId("toast")).toContainText("已複製");
  await page.getByTestId("visit-print").click();
  await expect(page.getByTestId("print-view")).toBeVisible();
  await expect(page.getByTestId("print-view")).toContainText("陳美玲");
  await expect(page.getByTestId("print-view")).not.toContainText("陳麗華");
  await page.goBack();

  await page.getByTestId("follow-830").click();
  await expect(page.getByTestId("followup-scheduled")).toBeVisible();
  await page.getByTestId("change-time-follow").click();
  await expect(page.getByTestId("toast")).toBeVisible();

  await page.getByTestId("nav-care").click();
  await expect(page.getByTestId("follow-morning-row")).toBeVisible();

  await page.goto("/dev");
  await page.getByTestId("advance-clock").click();
  await expect(page.getByTestId("today-page")).toBeVisible();
  await expect(page.getByTestId("daily-brief")).toContainText("昨天記錄了頭暈");
  await page.getByTestId("next-no-dizzy").click();
  await expect(page.getByTestId("daily-brief")).toContainText("暫時沒有再頭暈");
});

test("follow-up declined does not create reminder", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("caremate-v3");
      localStorage.removeItem("caremate-locale");
      localStorage.removeItem("caremate-lite");
    });
  await reset(page);
  await page.getByTestId("talk-to-caremate").click();
  await page.getByTestId("quick-reply-none").click();
  await page.getByTestId("quick-reply-after-waking").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();
  await page.getByTestId("add-to-journey").click();
  await page.getByTestId("prep-visit").click();
  await page.getByTestId("follow-skip").click();
  await page.getByTestId("nav-care").click();
  await expect(page.getByTestId("plan-page")).toContainText("沒有加入明早提醒");
});

test("family does not expose medication and can add accompany task", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("caremate-v3");
      localStorage.removeItem("caremate-locale");
      localStorage.removeItem("caremate-lite");
    });
  await page.goto("/family");
  await page.getByTestId("family-lai-wah").click();
  await expect(page.getByTestId("mother-profile")).toBeVisible();
  await expect(page.getByTestId("mother-profile")).toContainText("尚未分享");
  await expect(page.getByTestId("mother-profile")).not.toContainText("Amlodipine");
  await expect(page.getByTestId("mother-profile")).not.toContainText("Losartan");
  await page.getByTestId("mother-book").click();
  await expect(page.getByTestId("book-page")).toContainText("不能代媽媽");
  await page.getByTestId("nav-family").click();
  if (await page.getByTestId("family-lai-wah").isVisible()) {
    await page.getByTestId("family-lai-wah").click();
  }
  await page.getByTestId("prep-mother").click();
  await page.getByTestId("accompany").click();
  await page.getByTestId("nav-care").click();
  await expect(page.getByTestId("plan-page")).toContainText("陪媽媽覆診");
});

test("agent books earlier visit from known records", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("caremate-v3");
    localStorage.removeItem("caremate-locale");
    localStorage.removeItem("caremate-lite");
  });
  await reset(page);
  await page.getByTestId("talk-to-caremate").click();
  await page.getByTestId("quick-reply-none").click();
  await page.getByTestId("quick-reply-after-waking").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();
  await page.getByTestId("add-to-journey").click();
  await page.getByTestId("prep-visit").click();
  await page.getByTestId("open-booking").click();
  await expect(page.getByTestId("book-packet")).toContainText("陳美玲");
  await expect(page.getByTestId("book-packet")).toContainText("151/94");
  await expect(page.getByTestId("book-packet")).toContainText("144/90");
  await expect(page.getByTestId("book-packet")).toContainText("Penicillin");
  await expect(page.getByTestId("book-packet")).toContainText("6.4");
  await expect(page.getByTestId("book-page")).toContainText("9月22日");
  await expect(page.getByTestId("book-page")).not.toContainText("已連接醫健通");
  await expect(page.getByTestId("book-page")).not.toContainText("診所已確認");
  await expect(page.getByTestId("book-confirm")).toBeVisible({ timeout: 4000 });
  await page.getByTestId("book-confirm").click();
  await expect(page.getByTestId("book-receipt")).toContainText("9月17日");
  await expect(page.getByTestId("toast")).toContainText("已更新你的行程");
  await page.getByTestId("nav-care").click();
  await expect(page.getByTestId("follow-appt-row")).toContainText("9月17日");
  await page.getByTestId("nav-today").click();
  await expect(page.getByTestId("daily-brief")).toContainText("覆診已改期");
});

test("urgent branch blocks routine completion", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("caremate-v3");
      localStorage.removeItem("caremate-locale");
      localStorage.removeItem("caremate-lite");
    });
  await page.goto("/ask");
  await page.getByTestId("quick-reply-chest-breath").click();
  await expect(page.getByTestId("emergency-state")).toBeVisible();
  await expect(page.getByTestId("call-999")).toBeVisible();
  await expect(page.getByTestId("structured-summary")).toHaveCount(0);
  await expect(page.getByText("康伴不會代你致電")).toBeVisible();
});

test("no horizontal overflow on compact phones", async ({ page }) => {
  for (const width of [390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    await reset(page);
    const overflowed = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflowed, `${width}px Today`).toBeFalsy();
    await page.getByTestId("talk-to-caremate").click();
    const askOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(askOverflow, `${width}px Ask`).toBeFalsy();
  }
});

test("language, larger text, and refresh persist", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("lang-en-settings").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByTestId("lite-toggle-settings").click();
  await expect(page.locator("html")).toHaveClass(/lite/);
  await page.goto("/dev");
  await page.getByTestId("demo-reset").click();
  await page.getByTestId("talk-to-caremate").click();
  await page.getByTestId("quick-reply-none").click();
  await page.reload();
  await expect(page.getByTestId("chat-page")).toBeVisible();
  await expect(page.getByTestId("quick-reply-after-waking")).toBeVisible();
});
