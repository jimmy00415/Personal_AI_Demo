import { expect, test } from "@playwright/test";
import { normalizePath, samePath, shellLayout } from "../src/lib/shell";

test.describe("paths on GitHub Pages carry a trailing slash", () => {
  test("normalizePath strips it but keeps the root", () => {
    expect(normalizePath("/ask/")).toBe("/ask");
    expect(normalizePath("/ask")).toBe("/ask");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });

  test("samePath treats a pending route and the current route as equal", () => {
    expect(samePath("/ask", "/ask/")).toBeTruthy();
    expect(samePath("/", "/")).toBeTruthy();
    expect(samePath(null, "/ask/")).toBeFalsy();
    expect(samePath("/book", "/brief/")).toBeFalsy();
  });
});

test.describe("shell layout", () => {
  test("the emergency page hides the navigation on Pages too", () => {
    const layout = shellLayout("/ask/", true);
    expect(layout.hideChrome).toBeTruthy();
    expect(layout.hideFab).toBeTruthy();
  });

  test("the ordinary check-in keeps navigation but not the floating Ask button or Ask link", () => {
    const layout = shellLayout("/ask/", false);
    expect(layout.hideChrome).toBeFalsy();
    expect(layout.hideFab).toBeTruthy();
    expect(layout.showAskLink).toBeFalsy();
  });

  test("print and the recording controller never show patient chrome", () => {
    expect(shellLayout("/print/", false).hideChrome).toBeTruthy();
    expect(shellLayout("/print/", false).bare).toBeTruthy();
    expect(shellLayout("/dev/", false).hideChrome).toBeTruthy();
    expect(shellLayout("/dev/", false).bare).toBeFalsy();
  });

  test("booking hides the floating Ask button but keeps navigation", () => {
    const layout = shellLayout("/book/", false);
    expect(layout.hideChrome).toBeFalsy();
    expect(layout.hideFab).toBeTruthy();
    expect(layout.showAskLink).toBeTruthy();
  });

  test("active navigation works with and without the slash", () => {
    expect(shellLayout("/health/", false).isActive("/health")).toBeTruthy();
    expect(shellLayout("/family/lai-wah/", false).isActive("/family")).toBeTruthy();
    expect(shellLayout("/", false).isActive("/")).toBeTruthy();
    expect(shellLayout("/health/", false).isActive("/")).toBeFalsy();
  });
});
