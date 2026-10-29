import { expect, test } from "@playwright/test";

test("a visitor can preview the demo without assuming Michelle's identity", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("歡迎使用康伴");
  await expect(page.getByTestId("demo-data-notice")).toContainText("示範資料");
  await expect(page.getByTestId("account-button")).toHaveText("登入");
  await expect(page.getByTestId("profile-menu-btn")).toContainText("訪客");
});

test("login is a keyboard-accessible frontend demo and never stores or sends the password", async ({ page }) => {
  const password = "preview-only-password";
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.postData()?.includes(password) || request.url().includes(password)) requests.push(request.url());
  });
  await page.goto("/");
  await page.getByTestId("account-button").click();
  const dialog = page.getByRole("dialog", { name: "登入康伴" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("前端展示");
  await expect(dialog.getByRole("radio", { name: /長期病患者/ })).toBeFocused();
  await dialog.getByRole("button", { name: "關閉", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "以訪客繼續" })).toBeFocused();
  await dialog.getByLabel("電郵地址").fill("alex@example.com");
  await dialog.getByLabel("密碼", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "顯示密碼" }).click();
  await expect(dialog.getByLabel("密碼", { exact: true })).toHaveAttribute("type", "text");
  await dialog.getByTestId("login-submit").click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("你好，alex");
  await expect(page.getByTestId("demo-data-notice")).toContainText("示範資料");
  await page.reload();
  await expect(page.getByTestId("account-button")).toContainText("alex");
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain(password);
  expect(requests).toEqual([]);

  await page.getByTestId("account-button").click();
  await page.getByTestId("account-logout").click();
  await expect(page.getByTestId("account-button")).toHaveText("登入");
  await page.reload();
  await page.getByTestId("nav-today").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("歡迎使用康伴");
});

test("the login modal closes with Escape and returns focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId("account-button");
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("settings offers login and expandable sections work on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await page.getByTestId("settings-login").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "以訪客繼續" }).click();
  await page.getByTestId("nav-today-mobile").click();
  const toggle = page.getByTestId("today-tasks-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(page.getByTestId("task-task-amlo")).not.toBeVisible();
  await toggle.click();
  await expect(page.getByTestId("task-task-amlo")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("sample credentials, validation and English account controls work", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("lang-en-settings").click();
  await page.getByTestId("settings-login").click();
  const dialog = page.getByRole("dialog", { name: "Log in to CareMate" });
  await dialog.getByLabel("Email address").fill("invalid-address");
  await dialog.getByLabel("Password", { exact: true }).fill("short");
  await dialog.getByTestId("login-submit").click();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("account-button")).toHaveText("Log in");
  await dialog.getByRole("button", { name: "Fill sample credentials" }).click();
  await expect(dialog.getByLabel("Email address")).toHaveValue("demo@caremate.hk");
  await dialog.getByTestId("login-submit").click();
  await expect(page.getByTestId("account-button")).toHaveText("demo");
  await expect(page.getByTestId("settings-page")).toContainText("Preview session");
  await page.getByTestId("clear-device-data").click();
  await page.getByTestId("clear-device-confirm").click();
  await expect(page.getByTestId("account-button")).toHaveText("Log in");
});

test("a long valid account name fits a narrow phone and stays signed in on reload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByTestId("account-button").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("電郵地址").fill("WWWWWWWWWWWWWWWWWWWWWWWW@localhost");
  await dialog.getByLabel("密碼", { exact: true }).fill("demo1234");
  await dialog.getByTestId("login-submit").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId("account-button")).toContainText("WWWW");
});
