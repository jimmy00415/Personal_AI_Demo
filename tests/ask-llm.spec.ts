import { expect, test } from "@playwright/test";
import { askSystemPrompt, buildRecordPacket, classifyFreeText, sanitiseReply, withRetry } from "../src/lib/ask-llm";
import { emptyAnswers } from "../src/lib/seed";
import { OPENING_CLOCK } from "../src/lib/types";

const packetInput = {
  clock: OPENING_CLOCK,
  answers: { ...emptyAnswers, urgent: "none" as const, onset: "just-now" as const, change: "worse" as const },
  bpAverage: { systolic: 144, diastolic: 90 },
  appointmentAt: "2026-09-22T14:30:00+08:00",
  questions: [],
};

const packet = [
  "Saved records for Michelle Chan / 陳美玲, 56:",
  "Clock: 2026-09-16T08:45:00+08:00",
  "BP this morning 151/94; 7-day average 144/90",
  "Medicines: Amlodipine 5mg 19:00, Atorvastatin 20mg 21:00; allergy Penicillin (user-entered)",
  "Labs 13 Sep: HbA1c 6.4%, LDL 2.7 mmol/L, creatinine 71 μmol/L",
  "Appointment: 2026-09-22T14:30:00+08:00",
].join("\n");

test.describe("free-text classification", () => {
  test("blank input is empty", () => {
    expect(classifyFreeText("")).toBe("empty");
    expect(classifyFreeText("   \n ")).toBe("empty");
  });

  test("stray keystrokes are unclear and never reach the model", () => {
    expect(classifyFreeText("nh")).toBe("unclear");
    expect(classifyFreeText("hi")).toBe("unclear");
    expect(classifyFreeText("...")).toBe("unclear");
  });

  test("short Chinese and real words are questions", () => {
    expect(classifyFreeText("大啊")).toBe("question");
    expect(classifyFreeText("help")).toBe("question");
    expect(classifyFreeText("今早頭暈同血壓高有無關係？")).toBe("question");
  });

  test("booking wording only routes to booking after the episode is saved", () => {
    expect(classifyFreeText("我想改期覆診", { episodeSaved: true })).toBe("booking");
    expect(classifyFreeText("book an earlier appointment", { episodeSaved: true })).toBe("booking");
    expect(classifyFreeText("我想改期覆診", { episodeSaved: false })).toBe("question");
  });
});

test.describe("system prompt", () => {
  test("Traditional Chinese prompt forbids dumping records and demands short replies", () => {
    const prompt = askSystemPrompt("zh-HK");
    expect(prompt).toContain("不要逐項複述");
    expect(prompt).toContain("最多三句");
    expect(prompt).toContain("999");
    expect(prompt).toContain("不要診斷");
    expect(prompt).toContain("漏藥");
    expect(prompt).not.toContain("简体");
  });

  test("English prompt carries the same limits", () => {
    const prompt = askSystemPrompt("en");
    expect(prompt).toMatch(/do not repeat/i);
    expect(prompt).toMatch(/three sentences/i);
    expect(prompt).toContain("999");
    expect(prompt).toMatch(/do not diagnose/i);
  });
});

test.describe("record packet", () => {
  test("an unremembered dose is sent as unknown, never as a missed dose", () => {
    const built = buildRecordPacket({ ...packetInput, answers: { ...packetInput.answers, medGap: "forgot" } });
    expect(built).toContain("UNKNOWN");
    expect(built).toMatch(/never describe it as missed/i);
    expect(built).not.toMatch(/she (missed|skipped|forgot)/i);
    expect(built).not.toMatch(/dose was (missed|skipped)|forgot to take/i);
  });

  test("a dose the user took but did not log is described that way", () => {
    const built = buildRecordPacket({ ...packetInput, answers: { ...packetInput.answers, medGap: "taken-unlogged" } });
    expect(built).toMatch(/taken/i);
    expect(built).toMatch(/not logged/i);
    expect(built).not.toMatch(/missed/i);
  });

  test("answers are spelled out instead of sent as raw codes", () => {
    const built = buildRecordPacket(packetInput);
    expect(built).not.toContain("just-now");
    expect(built).not.toContain("medGap=");
    expect(built).toMatch(/started just now/i);
    expect(built).toMatch(/worse than earlier/i);
  });

  test("the packet carries only Michelle's own records", () => {
    const built = buildRecordPacket(packetInput);
    expect(built).toContain("151/94");
    expect(built).toContain("144/90");
    expect(built).toContain("Penicillin");
    expect(built).not.toContain("陳麗華");
    expect(built).not.toMatch(/Losartan|mother/i);
  });
});

test.describe("retrying a flaky upstream", () => {
  test("a first-try success is not repeated", async () => {
    let calls = 0;
    const value = await withRetry(async () => {
      calls += 1;
      return "ok";
    });
    expect(value).toBe("ok");
    expect(calls).toBe(1);
  });

  test("one transient failure is absorbed", async () => {
    let calls = 0;
    const value = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("hkbu_502");
        return "second";
      },
      { attempts: 2, delayMs: 1 },
    );
    expect(value).toBe("second");
    expect(calls).toBe(2);
  });

  test("a persistent failure still surfaces, without extra attempts", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("hkbu_502");
        },
        { attempts: 3, delayMs: 1 },
      ),
    ).rejects.toThrow("hkbu_502");
    expect(calls).toBe(3);
  });
});

test.describe("reply sanitising", () => {
  test("a reply that reads back the record packet is replaced with a short answer", () => {
    const dump = `${packet}\n請將以上資料帶給醫護人員。`;
    const result = sanitiseReply(dump, { packet, locale: "zh-HK" });
    expect(result.adjusted).toBe("record-dump");
    expect(result.text).toContain("就診摘要");
    expect(result.text.length).toBeLessThan(120);
    expect(result.text).not.toContain("Atorvastatin");
  });

  test("a reply claiming the user is safe is replaced", () => {
    const result = sanitiseReply("你現在很安全，已排除中風的可能。", { packet, locale: "zh-HK" });
    expect(result.adjusted).toBe("unsafe-claim");
    expect(result.text).not.toContain("已排除");
    expect(result.text).toContain("999");
  });

  test("legitimate caution wording is left alone", () => {
    const reply = "為安全起見，請今日聯絡醫護，並繼續記錄血壓。";
    const result = sanitiseReply(reply, { packet, locale: "zh-HK" });
    expect(result.adjusted).toBe("none");
    expect(result.text).toBe(reply);
  });

  test("an over-long reply is trimmed to three sentences", () => {
    const long = Array.from({ length: 9 }, (_, i) => `這是第${i + 1}句說明內容。`).join("");
    const result = sanitiseReply(long, { packet, locale: "zh-HK" });
    expect(result.adjusted).toBe("trimmed");
    expect(result.text.split("。").filter(Boolean)).toHaveLength(3);
  });

  test("a reply calling an unknown dose a missed dose is replaced", () => {
    const result = sanitiseReply("你今朝漏咗食藥，記得補食。", { packet, locale: "zh-HK", unknownDose: true });
    expect(result.adjusted).toBe("unknown-dose");
    expect(result.text).toContain("未確定");
    expect(result.text).not.toContain("補食");
  });

  test("a reported non-dose is still allowed to be stated", () => {
    const reply = "你表示當晚沒有服藥，請把這件事交給醫生評估。";
    const result = sanitiseReply(reply, { packet, locale: "zh-HK", unknownDose: false });
    expect(result.adjusted).toBe("none");
    expect(result.text).toBe(reply);
  });

  test("an empty reply falls back to honest copy", () => {
    const result = sanitiseReply("   ", { packet, locale: "zh-HK" });
    expect(result.adjusted).toBe("empty");
    expect(result.text.length).toBeGreaterThan(0);
  });
});
