import { expect, test } from "@playwright/test";
import { briefText, contactScript, symptomLine } from "../src/lib/selectors";
import { emptyAnswers } from "../src/lib/seed";
import { createScenario } from "../src/lib/demo/scenarios";
import { projectLegacy } from "../src/lib/demo/legacy";
import { useAppStore } from "../src/lib/store";

test.describe("symptom line follows the answers", () => {
  test("the recorded default reads as before", () => {
    const line = symptomLine({ onset: "after-waking", change: "better" }, "zh-HK");
    expect(line).toContain("今早起床後開始");
    expect(line).toContain("較剛才減輕");
  });

  test("a different branch never claims the dizziness eased", () => {
    const line = symptomLine({ onset: "just-now", change: "worse" }, "zh-HK");
    expect(line).toContain("剛剛開始");
    expect(line).toContain("比剛才嚴重");
    expect(line).not.toContain("減輕");
    expect(line).not.toContain("起床後");
  });

  test("unanswered onset or change is marked as unrecorded, not assumed", () => {
    const line = symptomLine({ onset: null, change: null }, "zh-HK");
    expect(line).toContain("未記錄");
    expect(line).not.toContain("減輕");
  });

  test("English keeps the same meaning", () => {
    expect(symptomLine({ onset: "just-now", change: "worse" }, "en")).toMatch(/just now; you say it is worse/i);
  });
});

test("the clinic script matches the onset the user chose", () => {
  const script = contactScript("zh-HK", { onset: "just-now" });
  expect(script).toContain("剛剛開始");
  expect(script).not.toContain("起床後");
  expect(contactScript("en", { onset: "yesterday" })).toContain("since yesterday");
});

test("the consultation brief repeats the answers the user actually gave", () => {
  const previous = useAppStore.getState();
  const demo = createScenario("dizziness");
  demo.episodes[0].step = "summary";
  demo.episodes[0].answers = { ...emptyAnswers, urgent: "none", onset: "just-now", change: "worse", medGap: "forgot" };
  useAppStore.setState({ demo, ...projectLegacy(demo, null), showToast: () => {} });
  useAppStore.getState().saveSummary();
  const brief = briefText(useAppStore.getState(), "zh-HK");
  useAppStore.setState(previous);
  expect(brief).toContain("比剛才嚴重");
  expect(brief).not.toContain("較剛才減輕");
  expect(brief).toContain("狀態未確定");
});
