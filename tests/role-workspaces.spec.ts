import { expect, test } from "@playwright/test";

function textContrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const values = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test("login offers three task-based roles and remembers family after refresh", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("account-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: /長期病患者/ })).toBeVisible();
  await dialog.getByRole("radio", { name: /家人/ }).check();
  await dialog.getByRole("button", { name: "填入示範帳密" }).click();
  await dialog.getByTestId("login-submit").click();
  await expect(page.getByTestId("supporter-home")).toBeVisible();
  await expect(page.getByTestId("role-switcher")).toHaveValue("family");
  await expect(page.getByTestId("nav-alerts")).toBeVisible();
  await expect(page.getByTestId("nav-ask")).toHaveCount(0);
  await expect(page.getByTestId("nav-checklist")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("role-switcher")).toHaveValue("family");
  await expect(page.getByTestId("supporter-home")).toBeVisible();
});

test("guest role preview changes primary tasks and guards patient-only routes", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("role-switcher").selectOption("caregiver");
  await expect(page.getByTestId("supporter-home")).toBeVisible();
  await expect(page.getByTestId("nav-checklist")).toBeVisible();
  await page.goto("/ask");
  await expect(page.getByTestId("role-route-notice")).toBeVisible();
  await expect(page.getByTestId("chat-page")).toHaveCount(0);
  await page.getByTestId("role-switcher").selectOption("patient");
  await expect(page.getByTestId("today-page")).toBeVisible();
  await expect(page.getByTestId("talk-to-caremate")).toBeVisible();
});

test("larger text increases cards, navigation and headings without mobile overflow", async ({ page }) => {
  await page.goto("/settings");
  const nav = page.getByTestId("nav-today");
  const heading = page.getByRole("heading", { level: 1 });
  const before = await nav.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  const headingBefore = await heading.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  await page.getByTestId("lite-toggle-settings").click();
  expect(await nav.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThan(before);
  expect(await heading.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThan(headingBefore);
  await page.getByTestId("lang-en-settings").click();
  await page.setViewportSize({ width: 320, height: 740 });
  for (const role of ["patient", "family", "caregiver"]) {
    await page.getByTestId("role-switcher").selectOption(role);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test("patient sharing controls remove related data and alert evidence from the family view", async ({ page }) => {
  await page.goto("/sharing");
  await page.getByTestId("sharing-family-bp").uncheck();
  await page.getByTestId("role-switcher").selectOption("family");
  await page.getByTestId("nav-shared").click();
  await expect(page.getByTestId("shared-bp")).toHaveCount(0);
  await expect(page.getByTestId("shared-health-page")).not.toContainText("151");
  await expect(page.getByTestId("shared-health-page")).not.toContainText("Amlodipine");
  await page.getByTestId("nav-alerts").click();
  await expect(page.getByTestId("alert-bp-trend")).toHaveCount(0);
  await page.getByTestId("role-switcher").selectOption("patient");
  await page.getByTestId("nav-sharing").click();
  await page.getByTestId("sharing-family-active").uncheck();
  await page.getByTestId("role-switcher").selectOption("family");
  await expect(page.getByTestId("pending-alert-count")).toHaveText("0");
  await expect(page.getByTestId("shared-category-count")).toHaveText("0");
  await page.reload();
  await expect(page.getByTestId("shared-category-count")).toHaveText("0");
});

test("alert review is reversible, persists and stays separate between family and caregiver", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("role-switcher").selectOption("family");
  await page.getByTestId("nav-alerts").click();
  await page.getByTestId("review-alert-bp-trend").click();
  await expect(page.getByTestId("alert-status-bp-trend")).toHaveText("已查看");
  await page.reload();
  await expect(page.getByTestId("alert-status-bp-trend")).toHaveText("已查看");
  await page.getByTestId("role-switcher").selectOption("caregiver");
  await page.getByTestId("nav-alerts").click();
  await expect(page.getByTestId("alert-status-bp-trend")).toHaveText("待查看");
  await page.getByTestId("role-switcher").selectOption("family");
  await page.getByTestId("nav-alerts").click();
  await page.getByTestId("review-alert-bp-trend").click();
  await expect(page.getByTestId("alert-status-bp-trend")).toHaveText("待查看");
});

test("caregiver checklist saves completion, supports undo and stays outside the family view", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("role-switcher").selectOption("caregiver");
  await page.getByTestId("nav-checklist").click();
  await page.getByTestId("checklist-check-reading").check();
  await expect(page.getByTestId("checklist-progress")).toContainText("1 / 3");
  await page.reload();
  await expect(page.getByTestId("checklist-check-reading")).toBeChecked();
  await page.getByTestId("checklist-check-reading").uncheck();
  await expect(page.getByTestId("checklist-progress")).toContainText("0 / 3");
  await page.getByTestId("role-switcher").selectOption("family");
  await page.goto("/checklist");
  await expect(page.getByTestId("role-boundary")).toBeVisible();
  await expect(page.getByTestId("care-checklist")).toHaveCount(0);
});

test("small role-colored text meets contrast on its tinted surface", async ({ page }) => {
  await page.goto("/");
  const patient = await page.getByTestId("nav-today").evaluate((node) => ({ foreground: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
  expect(textContrast(patient.foreground, patient.background)).toBeGreaterThanOrEqual(4.5);
  await page.getByTestId("role-switcher").selectOption("caregiver");
  await page.getByTestId("nav-shared").click();
  const caption = await page.locator("figcaption").evaluate((node) => ({ foreground: getComputedStyle(node).color, background: getComputedStyle(node.closest("figure")!).backgroundColor }));
  expect(textContrast(caption.foreground, caption.background)).toBeGreaterThanOrEqual(4.5);
});

test("caregiver sees the first checklist action in the initial desktop view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("role-switcher").selectOption("caregiver");
  const first = await page.getByTestId("checklist-check-reading").boundingBox();
  expect(first).not.toBeNull();
  expect(first!.y + first!.height).toBeLessThan(1000);
});

test("an old account migrates to patient and logout clears the selected role", async ({ page }) => {
  await page.goto("/about");
  await page.evaluate(() => sessionStorage.setItem("caremate-demo-account", JSON.stringify({ email: "old@example.com", name: "old" })));
  await page.reload();
  await expect(page.getByTestId("role-switcher")).toHaveValue("patient");
  await expect(page.getByTestId("account-button")).toHaveText("old");
  await page.getByTestId("role-switcher").selectOption("caregiver");
  await page.getByTestId("account-button").click();
  await page.getByTestId("account-logout").click();
  await expect(page.getByTestId("role-switcher")).toHaveValue("patient");
  await page.reload();
  await expect(page.getByTestId("role-switcher")).toHaveValue("patient");
  await expect(page.getByTestId("account-button")).toHaveText("登入");
});
