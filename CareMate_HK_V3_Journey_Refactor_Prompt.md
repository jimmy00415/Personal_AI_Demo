# CareMate HK V3 — Complete Journey & Recording-Ready Web Experience

## Mission

You are the principal product designer, Hong Kong Chinese UX writer, and staff frontend engineer responsible for upgrading the existing CareMate / 康伴 web application.

Refactor the CURRENT repository. Do not scaffold a replacement app. Preserve working routes and useful components, but replace disconnected page content, awkward copy, contradictory state, placeholder interactions, and incomplete journeys.

The target is an uninterrupted, recording-ready product experience, not a collection of attractive screens.

This remains a frontend-only, locally scripted experience: no native iOS development, LLM API, hospital connection, clinician messaging service, prescription service, or backend. Fixtures are fictional. Record these boundaries clearly in development documentation and the product-information page, without scattering “Demo / 示範 / 示例 / 模擬” labels across patient-facing screens.

The design reference is Baichuan's publicly described service continuity: understand the concern, ask relevant questions, use previous records, explain information, prepare the next step, and follow up over time. This is a reference for product behavior, not proof of clinical validation or permission to copy its brand.

The Apple reference is clarity of purpose, natural writing, progressive disclosure, user agency, accessible interaction, and carefully explained state transitions. Do not copy Apple screens or introduce SwiftUI, HealthKit, system-permission imitations, or native UI dependencies.

---

## 1. What the screenshots establish—and what must be inspected

Observed problems to fix:

1. Today simultaneously says it needs to understand dizziness and says no further action is needed. These messages must come from one state model, not independent copy blocks.
2. Product strings leak implementation language: “Demo evidence”, “從 AI 情境移除”, “用人話講”, “3 active”.
3. The report ends in an explanation and generic source categories rather than an action that helps prepare the user for a consultation.
4. The family screen repeats the same person identifier, then presents a long permissions essay without a clear care task.
5. A medication-record gap is treated as evidence that medication was not taken. These are different facts.
6. Long report reading is forced into a bottom sheet; short record details and long reading tasks need different containers.
7. Charts resemble decorative lines and need actual dates, values, units, and a useful detailed view.
8. The development indicator overlaps navigation. Recording must use a verified production build.
9. English, Chinese, date formats, and terminology are inconsistent.
10. Any visible count such as “12 results” must match accessible records. No phantom counts.

Do not infer CSS sizes from a scaled screenshot alone. Inspect viewport dimensions, browser zoom, root font-size, computed styles, active accessibility settings, container widths, and actual component behavior before changing layout.

Inventory every route, overlay, link, button, and state transition. Classify each as working, incomplete, or unnecessary. Complete the important actions and remove unnecessary affordances instead of leaving dead buttons.

---

## 2. The story this version must tell

Core story:

> Michelle feels dizzy this morning. CareMate connects that concern to her recent records, asks targeted questions, corrects an inaccurate interpretation of a medication-record gap, prepares information for professional review, connects a recent lab report to her consultation questions, and remembers the agreed follow-up in the next session.

The successful ending is NOT “the AI cured her” or “the AI ruled out danger”. It is:

> The user knows the next step, has a reliable consultation summary, controls the information being retained, and does not need to repeat the story tomorrow.

Primary journey, approximately 4–5 minutes:

Today → symptom check-in → clarify record gap → confirm summary → review report → add consultation question → prepare consultation brief → choose follow-up → return to an updated Today → next-session continuation.

Family caregiving is a coherent 30–45-second extension. Emergency handling is a separate short branch. Do not force every feature into the main story.

---

## 3. Presentation copy and truthfulness contract

### Remove from the normal patient-facing surface

Demo, demo data, 示例, 示範資料, 模擬連接, Demo evidence, prototype badges, development watermarks, scenario selectors, placeholder source categories, engineering terminology, raw confidence values, agent modes, and internal state names.

This restriction applies to headings, badges, dialogs, toasts, screen-reader announcements, exported patient summaries, and seeded filenames shown to the user.

It does NOT mean inventing external activity.

Never render these unless a real operation actually exists:

- 已連接醫健通 / 已同步 HA Go / 已連接 Apple Health
- 已發送給醫生 / 醫生已讀 / 醫生已確認
- 救護車已安排 / 已致電 999
- 診所已確認預約 / 已更改診所預約
- 醫護正在監察你
- 臨床驗證 / 醫生認證

Use actions that this application can genuinely perform locally:

- 已儲存
- 已加入健康紀錄
- 已加入就診問題
- 摘要已準備好
- 已複製
- 已加入康伴的待辦事項
- 已更新你的行程

Do not place real institutional branding on fictional records. No invented clinical authors, approvals, or citations. Imported-record labels identify the local record, not a nonexistent connection to a hospital.

Keep one quiet, accessible product-information page explaining the version's actual scope, for example:

「此版本用於展示產品設計，未連接醫療機構，也不提供真人醫護支援。資料儲存在此裝置。」

Keep useful health boundaries where they affect a decision, for example:

「康伴協助你整理健康資料，不能代替醫護評估。」

Do not repeat a legal disclaimer after every message.

---

## 4. One coherent fictional data source

Clock at opening: 2026-09-16 08:45, Asia/Hong_Kong.

All relative dates, greetings, appointment countdowns, overdue states, and reminders derive from a single scenario clock. No wall-clock-dependent randomness.

Michelle Chan / 陳美玲, age 56.

Existing records:

- Blood-pressure and lipid-management history.
- Amlodipine 5 mg, once daily, recorded schedule 19:00.
- Atorvastatin 20 mg, once daily, recorded schedule 21:00.
- Penicillin allergy: previously entered by the user; do not upgrade this to clinician verification.
- GP follow-up: Tuesday 22 September 2026, 14:30, displayed as 家庭醫生覆診. No invented clinic affiliation is required.
- Previous consultation note: 22 August 2026, stored by the user. Show the original note and its source; do not claim professional review of AI output.
- Blood report dated 13 September 2026 with exactly THREE seeded results: HbA1c 6.4%; LDL cholesterol 2.7 mmol/L; creatinine 71 μmol/L.
- Symptom note at 08:35 on 16 September: 「今朝有少少頭暈。」 Initially this is a report awaiting detail, not a diagnosis.
- Atorvastatin on 14 September evening has no recorded confirmation. Its status is UNKNOWN, not “missed”.

Blood-pressure history, each at 08:30:

| Date | Systolic | Diastolic |
|---|---:|---:|
| 10 Sep | 139 | 87 |
| 11 Sep | 140 | 88 |
| 12 Sep | 138 | 86 |
| 13 Sep | 143 | 89 |
| 14 Sep | 146 | 92 |
| 15 Sep | 151 | 94 |
| 16 Sep | 151 | 94 |

The seven-day arithmetic average is 144/90. Calculate it from the readings; do not hardcode a separate summary.

Opening tasks:

- 08:30 血壓紀錄 — recorded.
- 19:00 Amlodipine — scheduled, not due.
- 21:00 Atorvastatin — scheduled, not due.

Do not mark evening tasks complete at the morning starting point. Past-dose counts exclude future doses. Do not infer adherence from notification acknowledgements.

Family extension:

- 陳麗華, Michelle's mother, age 78.
- Appointment: Wednesday 23 September 2026, 10:00.
- Latest blood pressure: 138/82, timestamp 15 September 08:20.
- Michelle has permission to view appointments and blood-pressure records.
- Medication details are not shared in this fixture. Show 尚未分享 rather than invented drug counts or private information.
- Existing permission comes from the mother. Michelle cannot grant herself additional access.

---

## 5. Language system: mature Hong Kong Chinese

Primary navigation:

今日 / 健康 / 跟進 / 家人

AI entry:

問康伴

Keep a global AI entry, but give contextual buttons explicit purposes. Do not label every task “同康伴傾下”.

Use clear Hong Kong written Traditional Chinese for navigation, records, and summaries. Assistant dialogue can be conversational but should not become exaggerated Cantonese. Avoid unexplained English except standard medicine names and abbreviations.

Mandatory replacements:

| Current/undesired | Replacement |
|---|---|
| 用人話講 | 這份報告說明甚麼 |
| Demo evidence / 臨床指引（示範） | Remove; use only specific, real, relevant references |
| 從 AI 情境移除 | 不再用作個人化建議 |
| 康伴觀察 | 待你確認, when a derived interpretation needs confirmation |
| 醫療紀錄確認 | 已匯入的紀錄, unless verification really exists |
| 3 active | 正在使用的藥物, with a real derived count only when available |
| Care / 照護 | 跟進 |
| Journey / 旅程 | 健康紀錄 |
| Measurements / 量度 | 血壓與量度 |
| information completeness | Omit from consumer UI |
| open questions | Only show the actual question when needed |
| family permissions lecture | 已分享的資料 + meaningful permission controls |
| Memory saved | 已更新你的紀錄 |
| 今日暫時不需要做其他事情 | Replace with state-specific next step, never a universal footer |

In the Chinese locale, use dates consistently:

「9月16日 · 星期三」
「上午8:30」
「9月22日（星期二）下午2:30」

The English locale must also be complete in dialogs, forms, toasts, status text, accessibility labels, and exported summaries. Do not mix English interface fragments into Chinese screens.

---

## 6. Scene 1 — Today makes the next action obvious

Keep the app bar compact: 康伴 and settings. No development badge.

Greeting:

「早晨，Michelle」
「9月16日 · 星期三」

Primary concern:

「今早頭暈，先了解清楚」

Supporting copy:

「你上午8:30記錄的血壓是151/94 mmHg。先確認你現在的情況，再一起整理需要告訴醫生的資料。」

Primary action:

「了解頭暈情況」

Secondary link:

「查看血壓紀錄」

Expandable provenance:

「康伴參考了哪些紀錄？」

Expanded content:

- 今早的血壓讀數
- 你上午8:35記錄的頭暈
- 已儲存的用藥資料

Show a concise grouped 今日事項 list and next appointment below. Remove the generic “nothing else needed” footer.

Do not dominate the page with greeting typography while the important clinical task is visually secondary.

Opening the assistant carries current person, concern, source event IDs, and destination context. Closing it restores the original scroll position.

---

## 7. Scene 2 — Targeted conversation, not a questionnaire dump

Assistant header:

「了解頭暈情況」
Subheading: 「陳美玲」

Context disclosure:

「已參考今早血壓及用藥紀錄」

Use one question per turn. Quick replies are real inputs. Previously chosen answers remain editable until final confirmation.

Opening message:

「我看到你今早記錄了頭暈，血壓是151/94。先確認幾項可能需要即時處理的情況。」

### First: urgent symptoms

「你現在有沒有以下情況？」

Options:

- 胸口痛或呼吸困難
- 突然一邊手腳無力、嘴歪或說話不清
- 昏倒、明顯站不穩，或症狀突然嚴重加劇
- 以上都沒有
- 我不太確定

Urgent selections interrupt the ordinary flow immediately. “以上都沒有” is exclusive. These prompts are not an exhaustive or clinically validated triage system.

The uncertain branch does not silently become the ordinary branch. It offers help contacting a healthcare professional and preserves uncertainty. It must not label the user safe.

### Golden-path answer: 以上都沒有

Next question:

「頭暈大約甚麼時候開始？」

Options: 今早起床後 / 剛剛開始 / 昨天已經有 / 其他時間.

Select 今早起床後.

Next question:

「現在的感覺有沒有改變？」

Options: 比剛才減輕 / 差不多 / 比剛才嚴重 / 說不清楚.

Select 比剛才減輕.

Severe/worsening answers receive a distinct professional-review branch, not a generic reassuring response.

Do not invent cause, diagnosis, risk percentages, treatment targets, or medication changes.

---

## 8. Scene 3 — Correct the medication-record gap

Use this moment to demonstrate useful, controllable memory.

Assistant:

「另外，9月14日晚上沒有服藥紀錄。這不代表你沒有服藥，我想確認一下當晚的情況。」

Options:

- 有服藥，只是沒有記錄
- 當晚沒有服藥
- 我不記得了

Golden path selects 有服藥，只是沒有記錄.

Assistant:

「明白，已補記為『你表示當晚已服藥』。康伴不會再把這次紀錄空缺當作未服藥。」

Show an inline receipt:

「9月14日晚上 · 已補記服藥」
「由你確認 · 9月16日上午8:48」

Use the scenario clock's actual time rather than an unrelated fixed receipt time. Preserve an unknown exact dose time if it was not provided. Store occurrence time separately from entry time.

Update the medication history, derived summaries, memory interpretation, and future consultation brief together. Do not overwrite a source document.

Other branches:

- “沒有服藥”: record the user's report; do not suggest doubling or compensating a dose.
- “不記得”: retain UNKNOWN. Do not convert it into missed or taken.

Do not infer that this record gap caused the dizziness.

---

## 9. Scene 4 — Confirm a useful summary and the next step

Assistant copy for the golden path:

「你表示頭暈由今早起床後開始，目前較剛才減輕，也沒有報告剛才列出的情況。不過，單靠對話不能確定原因。」

「今天出現頭暈，建議聯絡醫護人員，了解是否需要提早評估。若頭暈持續、加劇或出現其他不適，不要只等候原定覆診；如出現剛才列出的緊急情況，請立即求助。」

Keep this concise and calm. No “未見危險”, “已排除中風”, “暫時安全”, “血壓不算高，所以不用擔心”.

Summary title:

「給醫生看的重點」

Fields:

- 頭暈：今早起床後開始；你表示目前較剛才減輕
- 今早血壓：151/94 mmHg，上午8:30
- 近7日平均：144/90 mmHg
- 相關回答：未報告胸口痛、呼吸困難或突然單側無力／言語不清
- 用藥補充：9月14日晚上已服藥，由你補記
- 下一步：聯絡醫護，了解是否需要提早評估

Labels such as “未報告” are descriptive and timestamped; never convert them into a medical clearance.

Controls:

「確認並儲存」
「更正內容」

Saving creates or updates the existing symptom episode exactly once. Repeated taps, route reopening, or page reload must not duplicate it.

Receipt:

「已加入健康紀錄」

Next action:

「準備就診摘要」

The Today hero immediately becomes:

「就診資料已整理」
「今天的頭暈、血壓及用藥補充已儲存。你可以帶同摘要聯絡醫護。」

Primary action: 查看就診摘要.

The professional-contact task remains pending unless the user explicitly records completion. Saved notes do not imply that a healthcare professional has been contacted.

---

## 10. Scene 5 — A report helps the consultation instead of ending the flow

Open the recent report from the consultation-preparation flow, not through an unrelated navigation detour.

Use a full-height mobile reading page or large desktop detail view for the report. Do not force long clinical reading into a cramped, scrolling bottom sheet.

Header:

「血液化驗」
「9月13日 · 已儲存的報告」

Show EXACTLY the available three entries:

- 糖化血紅蛋白 HbA1c: 6.4%
- 低密度脂蛋白膽固醇 LDL: 2.7 mmol/L
- 肌酐 Creatinine: 71 μmol/L

Do not display “全部12項” or an invented reference range.

Each row expands to a concise plain-language description. Do not apply normal/abnormal colours without an actual reference and appropriate clinical context.

Section title:

「這份報告說明甚麼」

HbA1c explanation:

「HbA1c反映過去約3個月的平均血糖水平。這次結果可與過往紀錄一起交給醫生評估；單看這項數字，不能判斷今早頭暈的原因。」

Separate the record from educational information:

- 「報告原文」 opens an immutable local source-document view.
- 「參考資料」 opens the actual, specific reference, not a generic “clinical guideline” placeholder.

For HbA1c use the verified NIDDK reference in the references section below. Do not use an authority name as endorsement of this application.

Consultation question suggestions:

- 「這次HbA1c結果需要怎樣跟進？」
- 「是否需要覆驗？應在甚麼時候安排？」

Each has an actionable add control. After adding:

「已加入就診問題」

It must actually appear in the consultation brief. Removing it there must update this selection too.

The explanation page ends with a clear continuation:

「返回就診摘要」

No invented OCR. If attachments are offered, provide a working “從健康紀錄選取” picker using bundled records. Remove microphone and camera affordances unless implemented honestly.

---

## 11. Scene 6 — Consultation preparation produces a usable artifact

Title:

「就診摘要」

Subtitle:

「陳美玲 · 更新於9月16日上午…」

The document is organized for a human reader:

1. 今天希望處理的問題
2. 症狀及時間
3. 最近血壓紀錄
4. 已儲存的用藥及過敏資料
5. 新近化驗結果
6. 希望向醫生確認的問題

Distinguish source types in quiet detail, not large warning badges:

- 本人補充
- 家居量度
- 已匯入報告
- 康伴整理

No “醫生已確認” badge. No diagnosis produced by the assistant. No medication changes.

Actions must work:

- 「複製摘要」 — real clipboard write with a fallback; show 已複製 only after success.
- 「列印或儲存PDF」 — a real print-optimized local document and browser print action. Do not claim a PDF was downloaded when only the print dialog opened.
- 「加入就診問題」 — editable question list.

Do NOT show “發送給醫生” without a real messaging capability. Prefer an artifact the user can choose to share.

Print view must include patient identity, creation timestamp, record sources, readable line breaks, and no navigation/FAB/developer controls. It must contain only that person's data.

Add a contact-preparation card:

「聯絡診所時可以這樣說」

「我今早起床後有頭暈，最近幾次血壓讀數較之前高，今早是151/94。想請醫護評估是否需要提早求診。我已整理最近的讀數、用藥和化驗資料。」

Actions:

「複製內容」
「記錄聯絡結果」

The second opens a local form: 尚未聯絡 / 已留言，等候回覆 / 已聯絡, with an optional user-entered note. Never invent a clinic reply, callback, or booking.

---

## 12. Scene 7 — Follow-up is proposed, chosen, and visible

After the summary is saved:

「想在明早記錄一下情況嗎？」

「康伴可以把血壓紀錄和頭暈情況加入明早的待辦事項。」

Choices:

- 「明早8:30」
- 「選擇時間」
- 「暫時不用」

Before confirmation, no reminder exists.

Golden-path confirmation:

「已加入明早的待辦事項」
「9月17日上午8:30 · 記錄血壓和頭暈情況」

Controls:

「更改時間」 / 「取消跟進」 / 「加入日曆」

“加入日曆” may generate a local ICS file. It does not directly modify an external calendar. Do not promise push, SMS, phone calls, or background monitoring. Reminders exist within this app.

In 跟進 show:

- 聯絡醫護 — pending unless explicitly recorded otherwise.
- 明早記錄身體情況 — scheduled.
- 9月22日家庭醫生覆診 — existing personal appointment record.

Use 待處理 / 已安排 / 已完成 / 已取消, rather than an arbitrary percentage of illness recovery.

The closing Today state must mention the real next step. Saving a plan does not mean “no further care needed”.

---

## 13. Scene 8 — The next session proves continuity

A non-patient-facing recording control advances the scenario clock to 17 September 08:30 while retaining the user's previous actions. It must not silently auto-complete tasks or fabricate intervening outcomes.

On reopening Today:

「早晨，Michelle」
「9月17日 · 星期四」

Main card:

「昨天記錄了頭暈，今早感覺怎樣？」

Subtext:

「你昨天已整理就診摘要。今天可以接着記錄，不用重新說一次。」

Choices:

「暫時沒有再頭暈」
「仍然有頭暈」
「比昨天嚴重」

Golden path selects 暫時沒有再頭暈.

Reply:

「已記錄你今早暫時沒有再頭暈。昨天的紀錄會保留在就診摘要內。」

Do not call this recovery, a safe discharge, or evidence that the AI's intervention improved health. Keep an uncompleted professional-contact task visible.

If the user did not accept follow-up yesterday, do not show it as an agreed scheduled reminder today.

If the user selected worsening or ongoing symptoms, preserve professional-review guidance and urgent escalation where appropriate. Do not reuse the comfortable closing state.

---

## 14. Family extension — accomplish a care task, not a permission lecture

At the top, show ONE person context:

「媽媽 · 陳麗華」
「78歲」

Do not repeat “正在查看” as a pill, full-width banner, and heading.

Primary story:

「下星期三覆診，先幫媽媽整理資料」

Appointment:

「9月23日（星期三）上午10:00」

Primary action:

「準備媽媽的覆診資料」

Supporting records:

- 最近血壓：138/82 mmHg · 9月15日上午8:20
- 已分享：覆診、血壓紀錄
- 用藥資料：尚未分享

Opening the family brief includes ONLY authorized data. Do not expose medication content through chat, search, tooltips, counts, hidden DOM, or an export.

After brief creation, offer:

「提醒我陪媽媽覆診」

Confirmation adds a task to Michelle's schedule, associated with her mother's appointment. It does not send anything to the mother or clinic.

Permissions control:

「查看分享設定」

Inside:

「媽媽已與你分享覆診及血壓紀錄。」
「其他健康資料仍由媽媽管理。」

Michelle may stop receiving the shared information, but cannot grant herself additional access. A request for additional sharing may be prepared as copyable text; never report it sent or approved.

Switching people changes records, conversation state, and exports together. Unsaved edits require save/discard handling. No cross-person memory reuse.

---

## 15. Emergency branch — do not treat it as the successful journey

When an urgent option is selected:

- Stop normal questions and nonessential animation.
- Present a calm, high-contrast full-page urgent-help state.
- Do not wait for a summary, registration, permission, model response, or reminder confirmation.

Heading:

「請立即尋求醫療協助」

Body:

「你描述的情況可能需要緊急處理。請立即使用電話撥打999，不要等候康伴回覆。」

Display 999 prominently. In this recording-only version, do not invoke real calls or render a fake call-success screen. A help control may explain how to use the user's phone; clearly state locally:

「康伴不會代你致電。」

No claims that medical staff have been notified, an ambulance dispatched, or danger ruled out. An emergency state never transitions into routine follow-up merely because the modal was closed.

The urgent branch is a separate recording/test segment, not a required stage in the main ordinary journey.

---

## 16. Visual and interaction redesign

Preserve the restrained jade/white identity. Do not add an unrelated new visual system.

### Typography and hierarchy

Inspect actual CSS first. Suggested CSS-size starting points, not mandates to reproduce screenshot pixels:

- Main page title: 28–32px.
- Concern/action title: 22–26px.
- Body: 16–18px with approximately 1.5–1.65 line height for Chinese.
- Supporting information: 14–15px.
- Small metadata: at least approximately 13px, with tested contrast.
- Interactive targets: aim for 44–48px practical touch areas.

Use Noto Sans TC or an appropriate system Chinese sans-serif stack. Do not rely on English font settings to produce polished Chinese text.

### Layout

- Mobile page padding: approximately 20px.
- Between meaningful sections: approximately 24–32px.
- Grouped rows: generous touch targets without excessive blank vertical regions.
- A short page should look intentionally short; do not use spacers to fill the viewport.
- Main AI entry cannot cover a row action or bottom navigation.
- On an active assistant screen, hide redundant global assistant entry.
- The medical task should be visually more prominent than branding.

### Overlays

- Short record details: content-sized bottom sheet on mobile; drawer/dialog on desktop.
- Long report and consultation summary: dedicated reading page or nearly full-height workspace.
- Sticky overlay header/close control; footer actions visible; only the content region scrolls.
- Avoid nested sheets for this journey.
- Background is inert while a modal is open.
- Keyboard focus enters the dialog, stays inside, and returns to the trigger when closed.
- Preserve page scroll position and selected health tab on return.
- Respect safe-area insets and dynamic viewport height.

### Charts

- Draw from the actual timestamped measurements.
- If a mini-chart shows only systolic pressure, label it 收縮壓走勢.
- Detail view has dates, values, units, a systolic/diastolic distinction, and a readable table alternative.
- No fabricated reference band or single unexplained diagonal line.
- Clicking a measurement opens its source, timestamp, and correction action.

### Motion

Use short transitions to explain saved state, selection, and navigation. Do not depend on long fake loading, theatrical agent steps, glowing orbs, or simulated reasoning traces.

For reduced motion, use minimal fades or immediate state changes.

### Accessible mode

Keep the existing larger-text mode if implemented, but make it a coherent typography/layout change rather than a scale transform. Test 200% browser zoom, Chinese wrapping, keyboard access, and touch targets.

---

## 17. State and data requirements

Use the existing stack and package manager. No major framework upgrades just for visual work.

Implement a shared store and explicit transitions. Suggested conceptual entities:

Person
Observation
HealthEpisode
MedicationRecord
ImportedReport
Appointment
ConsultationBrief
ConsultationQuestion
CareTask
PersonalizationPreference
ConsentGrant
ConversationSession
ScenarioClock

Each fact needs personId, source, occurrence time, entry time, and state where relevant. “User reported”, “imported document”, and “assistant interpretation” are different source classes.

User-facing copy is in centralized zh-HK/en dictionaries. State-specific text comes from selectors/templates, not independently hardcoded pages.

Suggested flow:

concern_open
→ urgent_symptom_check
→ timing_and_change
→ record_reconciliation
→ summary_review
→ summary_saved
→ report_review
→ brief_ready
→ followup_choice
→ followup_scheduled OR followup_declined
→ next_session

Urgent and uncertainty transitions are separate branches. Do not name the ordinary branch “safe”.

Important invariants:

- UNKNOWN medication status is not MISSED.
- An AI inference cannot become a confirmed medical fact without appropriate evidence.
- An entered observation is not a diagnosis.
- A saved brief is not a sent message.
- A local appointment edit is not a clinic booking change.
- A proposed reminder is not an accepted reminder.
- A saved action is not a completed clinical task.
- Switching people never carries over private context.
- Excluding information from personalization does not delete its original record.
- Deleted or corrected derived memories must not remain in stale cached summaries.
- Exactly one active top-priority Today message is selected from current state.

Use versioned, namespaced local persistence for fictional fixtures. Reset must clear all related local state and pending timers. Do not collect real patient information or transmit input to an external service.

For unsupported free-text inputs, do not fabricate unrestricted medical answers. Use a clear, scoped continuation such as:

「我未能根據目前資料回答這個問題。你可以先整理症狀、查看已有報告，或把問題加入就診摘要。」

All preset quick-reply flows must work. Remove any camera, voice, share, or integration button that cannot have a truthful implemented outcome.

---

## 18. Recording controls and production run

Provide a developer-only recording controller outside the patient navigation. It may initialize, reset, jump to a named scene, or advance the clock.

Examples of internal scene names:

morning-start
symptom-summary
report-review
brief-ready
next-morning
family-preparation
urgent-help

A scene jump loads a complete internally consistent snapshot. It does not patch isolated UI booleans.

The main video must also work without jumping: every action is performed through the patient-facing interface.

Use production build/start commands appropriate to the repository. If it is Next.js with standard scripts:

npm run build
npm run start

Do not record from the development server. Verify there are no framework badges, error overlays, hydration warnings, or layout shifts in the capture build. Do not hide real runtime errors with CSS.

Do not promise capabilities that are not wired. README and recording notes state the offline/frontend-only nature. The application must not be deployed or described as a clinically validated service.

---

## 19. Automated acceptance tests

Run the real build and tests; retain results. Use Playwright or the existing browser test framework.

The main journey test must perform, not merely inspect:

1. Reset to 16 September 08:45.
2. Verify evening tasks are not complete and the hero is the dizziness concern.
3. Open the assistant with Michelle's context.
4. Answer the urgent-symptom question, onset, and change.
5. Correct the 14 September medication-record gap.
6. Verify it is user-confirmed, not a fabricated clinician confirmation or missed dose.
7. Edit then save the symptom summary.
8. Verify no duplicated episode appears after repeated save/reload.
9. Open the report and verify exactly three results.
10. Add an HbA1c question to the consultation brief.
11. Verify the brief includes that question, the correction, correct BP average, and only Michelle's records.
12. Exercise clipboard and print-view preparation with appropriate test stubs; do not claim an OS print actually succeeded.
13. Accept a follow-up and verify it appears in 跟進 and Today.
14. Change the time and verify all displays update.
15. Advance the scenario clock; verify continuation uses yesterday's confirmed information.
16. Repeat from reset with follow-up declined; verify no accepted reminder appears.
17. Switch to mother; verify restricted data is not exposed anywhere, including the export.
18. Prepare mother's appointment brief and add Michelle's accompaniment task.
19. Trigger the urgent branch; verify routine completion and normal reassurance are blocked.
20. Verify browser refresh and back navigation preserve valid state.

Additional checks:

- No forbidden preview words in visible patient-facing strings.
- No phantom sources, counts, integrations, or send confirmations.
- All primary buttons have tested outcomes.
- No “no action needed” while concern, urgent status, or professional-contact task is active.
- Keyboard dialog behavior; focus return; background inertness.
- No horizontal overflow at 390px and 430px.
- Responsive views at 390×844, 430×932, 768×1024, and 1440×900.
- Complete Chinese and English in the main journey.
- Larger text and reduced motion work.
- No cross-person content leakage.
- No real calls, notifications, medical messages, or network-backed health actions.

---

## 20. Deliverables

Deliver an updated runnable repository, not only screenshots or an architecture plan.

Include:

- Revised reusable components and design tokens.
- Centralized Hong Kong Chinese and English copy.
- One shared fictional data model and deterministic scenario clock.
- Main journey, family extension, and urgent branch.
- A real local consultation-summary print view.
- Browser tests and actual build/test results.
- RECORDING_SCRIPT.md with exact clicks, expected visible results, and estimated scene durations.
- INTERACTION_INVENTORY.md listing every primary action and its outcome.
- A short limitations section covering unavailable clinical and external-service capabilities.

Finish by reviewing the main journey from a user's perspective. At every point the user should know:

Where am I?
What has CareMate understood?
What is uncertain?
What can I do next?
What actually changed after I tapped?

Do not call the work finished merely because every route renders.

---

## Reference material for implementation—not decorative UI citations

Baichuan public product/service references:
- https://care.baichuan-ai.com/
- https://www.baichuan-ai.com/

Apple guidance:
- https://developer.apple.com/videos/play/wwdc2022/10037/
- https://developer.apple.com/videos/play/wwdc2025/359/
- https://developer.apple.com/design/human-interface-guidelines/writing
- https://developer.apple.com/design/human-interface-guidelines/sheets
- https://developer.apple.com/design/human-interface-guidelines/accessibility

Web interaction reference:
- https://www.w3.org/WAI/WCAG21/Techniques/html/H102

Actual health education references:
- HbA1c: https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test
- Stroke symptoms: https://www.chp.gov.hk/tc/static/80060.html
- Urgent stroke response: https://www.stroke.org.hk/home/mcdull-treatment/

The fictional data and scripted patient journey are not clinical validation. Health-related copy requires appropriate professional review before any use outside product-design evaluation.
