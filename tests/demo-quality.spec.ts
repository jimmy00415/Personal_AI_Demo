import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

async function clearWorld(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("caremate-v4");
    localStorage.removeItem("caremate-v4-preferences");
    sessionStorage.removeItem("caremate-v4-emergency");
  });
}

async function reachChange(page: Page) {
  await page.goto("/ask");
  await page.getByTestId("quick-reply-none").click();
  await page.getByTestId("quick-reply-just-now").click();
}

async function reachSummary(page: Page) {
  await reachChange(page);
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();
  await expect(page.getByTestId("structured-summary")).toBeVisible();
}

test("correcting the summary restates the questions once, with a visible marker", async ({ page }) => {
  const keyWarnings: string[] = [];
  page.on("console", (msg) => {
    if (/same key|duplicate key/i.test(msg.text())) keyWarnings.push(msg.text());
  });
  await clearWorld(page);
  await reachSummary(page);

  await page.getByTestId("edit-summary").click();
  await expect(page.getByTestId("chat-correction")).toBeVisible();
  await expect(page.getByTestId("chat-log").getByText("頭暈大約甚麼時候開始？")).toHaveCount(1);
  await expect(page.getByTestId("chat-log").getByText("剛剛開始")).toHaveCount(0);

  await page.getByTestId("quick-reply-just-now").click();
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-taken-unlogged").click();
  await expect(page.getByTestId("chat-log").getByText("剛剛開始")).toHaveCount(1);
  await expect(page.getByTestId("chat-log").getByText("現在的感覺有沒有改變？")).toHaveCount(1);
  expect(keyWarnings, keyWarnings.join("\n")).toHaveLength(0);
});

test("saying the dizziness is worse gets a spoken reply before the medication question", async ({ page }) => {
  await clearWorld(page);
  await reachChange(page);
  await page.getByTestId("quick-reply-worse").click();

  const log = page.getByTestId("chat-log");
  await expect(log).toContainText("比剛才嚴重");
  await expect(log).toContainText("聯絡醫護");
  await expect(page.getByTestId("quick-reply-forgot")).toBeVisible();
  await expect(log).not.toContainText("安全");
});

test("stray keystrokes get a local clarifying question", async ({ page }) => {
  await clearWorld(page);
  await reachSummary(page);

  await page.getByTestId("ask-input").fill("nh");
  await page.getByTestId("ask-send").click();

  await expect(page.getByTestId("chat-log")).toContainText("我未看懂");
  await expect(page.getByTestId("chat-log")).not.toContainText("暫時未能連到");

});

test("a consultation question gets a short local answer without a record dump", async ({ page }) => {
  await clearWorld(page);
  await reachSummary(page);

  await page.getByTestId("ask-input").fill("我應該帶甚麼去見醫生？");
  await page.getByTestId("ask-send").click();

  const log = page.getByTestId("chat-log");
  await expect(log).toContainText("就診摘要");
  await expect(log).not.toContainText("Atorvastatin 20mg");
  await expect(log).not.toContainText("HbA1c 6.4%");
});

test("the local reply keeps the current dose unknown", async ({ page }) => {
  await clearWorld(page);
  await reachChange(page);
  await page.getByTestId("quick-reply-better").click();
  await page.getByTestId("quick-reply-forgot").click();

  await page.getByTestId("ask-input").fill("我9月14號晚係唔係無食藥？");
  await page.getByTestId("ask-send").click();

  const log = page.getByTestId("chat-log");
  await expect(log).toContainText("未確定");
  await expect(log).not.toContainText("漏咗食藥");
  await expect(log).not.toContainText("補食");
});

test("a reassurance request receives the local 999 boundary", async ({ page }) => {
  await clearWorld(page);
  await reachSummary(page);

  await page.getByTestId("ask-input").fill("我係唔係無事？");
  await page.getByTestId("ask-send").click();

  const log = page.getByTestId("chat-log");
  await expect(log).toContainText("999");
  await expect(log).not.toContainText("已排除");
  await expect(log).not.toContainText("不用擔心");
});

test("unsupported input can be corrected without repeating the old question", async ({ page }) => {
  await clearWorld(page);
  await reachSummary(page);
  await page.getByTestId("ask-input").fill("weather on Mars");
  await page.getByTestId("ask-send").click();
  await expect(page.getByTestId("chat-log")).toContainText("這個示範未能回答");
  await expect(page.getByTestId("assistant-next")).toBeVisible();
  await page.getByTestId("ask-input").fill("我應該幾時聯絡醫生？");
  await page.getByTestId("ask-send").click();
  const log = page.getByTestId("chat-log");
  await expect(log).toContainText("就診摘要");
  await expect(log.getByText("weather on Mars")).toHaveCount(1);
  await expect(log.getByText("我應該幾時聯絡醫生？")).toHaveCount(1);
  await expect(page.getByTestId("ask-retry")).toHaveCount(0);
});

test("the summary and brief never contradict the answers just given", async ({ page }) => {
  await clearWorld(page);
  await reachChange(page);
  await page.getByTestId("quick-reply-worse").click();
  await page.getByTestId("quick-reply-forgot").click();

  const summary = page.getByTestId("structured-summary");
  await expect(summary).toContainText("剛剛開始");
  await expect(summary).toContainText("比剛才嚴重");
  await expect(summary).not.toContainText("減輕");
  await expect(summary).not.toContainText("起床後");

  await page.getByTestId("add-to-journey").click();
  await page.getByTestId("prep-visit").click();
  const brief = page.getByTestId("visit-brief");
  await expect(brief).toContainText("比剛才嚴重");
  await expect(brief).not.toContainText("較剛才減輕");
});

test("the whole recording journey runs without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await clearWorld(page);
  await reachSummary(page);
  await page.getByTestId("add-to-journey").click();
  await page.getByTestId("prep-visit").click();
  await expect(page.getByTestId("visit-brief")).toBeVisible();
  await page.getByTestId("open-booking").click();
  await page.getByTestId("book-review-open").click();
  await page.getByTestId("book-confirm").click();
  await expect(page.getByTestId("book-receipt")).toBeVisible();
  await page.getByTestId("nav-today").click();
  await expect(page.getByTestId("daily-brief")).toContainText("覆診已改期");
  expect(errors.filter((e) => !/favicon|Next.js Dev Tools/i.test(e)), errors.join("\n")).toHaveLength(0);
});
