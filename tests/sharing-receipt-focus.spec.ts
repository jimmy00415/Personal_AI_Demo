import { expect, test } from "@playwright/test";
import { createScenario } from "../src/lib/demo/scenarios";

for (const locale of ["zh-HK", "en"] as const) {
  test(`sharing receipt remains visible and focused for fresh outcomes (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const demo = createScenario("routine-day");
    await page.addInitScript(({ demo, locale }) => {
      localStorage.setItem("caremate-v4", JSON.stringify(demo));
      localStorage.setItem("caremate-v4-preferences", JSON.stringify({ locale, liteMode: false, introComplete: true }));
    }, { demo, locale });
    await page.goto("/sharing");
    const status = page.getByTestId("sharing-page").getByRole("status");
    const text = locale === "en" ? "Sharing settings updated" : "已更新分享設定";
    const back = locale === "en" ? "Back to edit" : "返回修改";
    const cancel = locale === "en" ? "Cancel" : "取消";

    async function state(revision: number, active: boolean) {
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("caremate-v4")!));
      expect(stored.context).toEqual(demo.context);
      expect(stored.clock).toBe(demo.clock);
      expect(stored.grants).toEqual([expect.objectContaining({ patientId: "may", recipientId: "david", level: "full", categories: ["body"], revision, status: active ? "active" : "revoked" })]);
    }
    async function acknowledgement(name: string) {
      await expect(status).toHaveText(text);
      const geometry = await status.evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
        return { focused: document.activeElement === el, rects: rects.map(r => r.toJSON()),
          fullyVisible: rects.length > 0 && rects.every(r => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth),
          unobscured: rects.every(r => [.2, .5, .8].every(f => el.contains(document.elementFromPoint(r.x + r.width * f, r.y + r.height / 2)))) };
      });
      await test.info().attach(`${name}-native-receipt-geometry`, { body: JSON.stringify(geometry), contentType: "application/json" });
      await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: false });
      expect(geometry.fullyVisible, "Receipt text must be wholly in the native viewport without test scrolling").toBe(true);
      expect(geometry.unobscured, "Receipt text must be unobscured by fixed navigation").toBe(true);
      await expect(status).toBeFocused();
    }

    await page.getByTestId("level-full").check();
    await page.getByTestId("category-body").check();
    await page.getByTestId("sharing-review").click();
    await page.getByTestId("sharing-confirm").click();
    await acknowledgement("confirm"); await state(1, true);

    await page.getByTestId("recipient-david").focus();
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("caremate-v4")!);
      stored.memories[0].enabled = !stored.memories[0].enabled;
      localStorage.setItem("caremate-v4", JSON.stringify(stored));
      window.dispatchEvent(new StorageEvent("storage", { key: "caremate-v4" }));
    });
    await expect(page.getByTestId("recipient-david")).toBeFocused();
    await expect(status).toHaveText(text); await state(1, true);

    await page.getByTestId("sharing-review").click();
    await expect(status).toHaveCount(0);
    await page.getByRole("button", { name: back, exact: true }).click();
    await expect(status).toHaveCount(0); await state(1, true);
    await page.getByTestId("sharing-review").click();
    await page.getByTestId("sharing-confirm").click();
    await acknowledgement("reconfirm"); await state(2, true);

    await page.getByTestId("sharing-revoke").click();
    await expect(status).toHaveCount(0);
    await page.getByRole("button", { name: cancel, exact: true }).click();
    await expect(status).toHaveCount(0); await state(2, true);
    await page.getByTestId("sharing-revoke").click();
    await page.getByTestId("revoke-confirm").click();
    await acknowledgement("revoke"); await state(3, false);
    await expect(page.getByTestId("shared-empty")).toHaveText(locale === "en" ? "No permission to view health information." : "尚未獲授權查看健康資料。");

    await page.getByTestId("sharing-review").click();
    await expect(status).toHaveCount(0);
    await page.getByTestId("sharing-confirm").click();
    await acknowledgement("regrant"); await state(4, true);
  });
}
