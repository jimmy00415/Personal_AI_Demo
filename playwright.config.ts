import { defineConfig, devices } from "@playwright/test";
import {readFileSync} from 'node:fs';

// Resolve custom official browser caches in the invoking process, before import.
const target = process.env.CAREMATE_TEST_TARGET || "dev";
const evidence = process.env.CAREMATE_TEST_EVIDENCE || "test-results";
const isStatic = target === "static";
const baseURL = isStatic ? "http://127.0.0.1:3101/Personal_AI_Demo/" : target === "dev" ? "http://127.0.0.1:3000" : "http://127.0.0.1:3100";
const focused = target === "a11y" ? /responsive-accessibility\.spec\.ts/ : isStatic ? /static-demo\.spec\.ts/ : undefined;
delete process.env.NO_COLOR;
// Only the explicitly recorded, still-running audit server may be shared.
const auditOwner=process.env.CAREMATE_OWNED_AUDIT_SERVER_PID;
if(auditOwner){
  if(!['a11y','prod'].includes(target)||!/^\d+$/.test(auditOwner)||process.env.CAREMATE_OWNED_AUDIT_BUILD_ID!==readFileSync('.next/BUILD_ID','utf8').trim())throw Error('Owned audit server identity/build mismatch');
  process.kill(Number(auditOwner),0);
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  testMatch: focused,
  testIgnore: focused ? undefined : [/responsive-accessibility\.spec\.ts/, /static-demo\.spec\.ts/],
  outputDir: `${evidence}/artifacts`,
  reporter: [["list"], ["html", { outputFolder: `${evidence}/html`, open: "never" }], ["json", { outputFile: `${evidence}/results.json` }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: auditOwner ? undefined : {
    command: isStatic ? "node scripts/verify-static-demo.mjs --serve" : target === "dev" ? "npm run dev -- --hostname 127.0.0.1 --port 3000" : "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: target === "prod" ? [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testMatch: /complete-journeys\.spec\.ts/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /complete-journeys\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
  ] : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
