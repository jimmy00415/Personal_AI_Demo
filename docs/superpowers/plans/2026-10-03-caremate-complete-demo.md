# CareMate HK Complete Frontend Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有仓库完成覆盖项目全部关键旅程、可供参与者无引导完成任务的纯前端 CareMate HK demo。

**Architecture:** 一个 Zustand 使用入口协调按职责划分的本地域模块；所有记录、任务、授权、事件和导出来自同一可重现快照。固定资料与脚本助手在浏览器运行，不调用 API；患者与家属用显式上下文查询个人资料或受权限过滤的投影。

**Tech Stack:** Next 16.3.5 App Router、React 19.2.8、TypeScript、Tailwind 4、Zustand 5、现有 Framer Motion／Lucide／Recharts、Playwright 1.63。

**Spec:** [2026-10-03-caremate-complete-demo-design.md](../specs/2026-10-03-caremate-complete-demo-design.md)

## Global Constraints

- 只使用虚构资料、本地脚本响应和浏览器本地状态；健康交互不得请求 `/api/ask` 或任何外部数据、AI、诊所、消息、通知服务。
- 保留 Next 16.3.5、React 19.2.8、TypeScript、Tailwind 4、Zustand 和当前仓库；不另建替代 app，不为本任务升级主要框架。
- 默认产品语言为 `zh-HK`，同时完整支持 `en`；产品文案集中在 `src/lib/i18n.ts`，日期按 `Asia/Hong_Kong` 的情境时钟呈现。
- 情境日期固定从 `2026-09-16T08:45:00+08:00` 开始；它是虚构测试日期，不跟随电脑的真实“今天”。
- 患者为 `may`（May Chan，68岁），家属为 `david`（David Chan，42岁，儿子）；活动角色与正在查看的患者是两个独立字段。
- 每个记录、摘要、共享投影、任务和导出都必须绑定 `patientId`；未知服药情况不得写成未服药。
- 所有主要操作必须有本地可验证结果，并支持与任务相适应的更正、返回、取消或撤销；保存不等于发送，行程更新不等于诊所确认。
- 主操作触控区域至少 `44×44 CSS px`；在 `320/390/430/768/1024/1440 CSS px` 宽度、200% 缩放、较大文字和 reduced motion 下完成核心任务。
- 共享权限在前端仅模拟产品行为，不构成真实认证、隔离或安全保证；不得输入真实个人健康资料。
- 新版持久化使用 `caremate-v4`；保留旧 `caremate-v3` key，不把旧母亲健康资料映射成 David 的资料。

## Review Focus

1. 浏览家人后返回自己的健康任务：actor与patient不可混用；Task 1、7、8测试角色切换与深链接。
2. 重复点击、返回、刷新、重开：记录、预约、通知和任务不重复；Task 2、4、5、7测试稳定ID与重入。
3. 降级／撤销时已打开详情或准备导出：最新权限立即生效；Task 6、7、8测试旧URL和派生内容。
4. 用户改时间／改期跨日期：UI、ICS、下一天任务和覆诊前摘要一起更新；Task 3、5、8测试9:15与日期边界。
5. 自由输入超出脚本、资料为空、无法持久化或clipboard失败：明确说明、保留可恢复内容，不产生假保存／诊断；Task 1、2、4、8、9测试这些条件。

---

## 执行范围与顺序

这是已应用户请求写出的评审版计划，不是已批准的实现结果。本轮仅保存分析／计划／测试文档和审查截图。实施前一起阅读 spec 和验证文档，确认人物、权限含义和路由符合用户意图。

推荐 subagent-driven：每个任务有实现者和独立review。产品实现按Task 1→2→3→4→5→6→7→8→9串行，避免同时修改`store.ts`、`types.ts`、`i18n.ts`。各任务的只读review、资料核对和独立测试方案可并行；不并发修改共享文件。Task 10在9之后，Task 11在技术验收完成后开展。

每任务提交仅包含该任务文件；不要提交原有用户改动。不自动推送、发布或重新部署。

## 文件职责和共享接口

### 新模块与既有文件

| 文件 | 职责 |
| --- | --- |
| `src/lib/demo/types.ts` | 新实体、action输入与输出；类型唯一来源 |
| `src/lib/demo/fixtures.ts`、`scenarios.ts` | 虚构资料与研究员完整快照 |
| `src/lib/demo/persistence.ts` | 浏览器存储、schema检测和失败结果 |
| `src/lib/demo/check-in.ts` | check-in／量度草稿与确认；原子更正 |
| `src/lib/demo/care.ts` | 提醒、药物、预约与家庭任务状态 |
| `src/lib/demo/sharing.ts` | 共享投影、授权、事件可见性与回应 |
| `src/lib/demo/brief.ts`、`exports.ts` | 可审阅摘要packet；文字和ICS |
| `src/lib/demo/local-assistant.ts` | 有限intent和固定响应，不包含network代码 |
| `src/lib/demo/selectors.ts` | 角色适配、Today优先级、可见计数、趋势 |
| `src/lib/store.ts` | 既有Zustand hook；调用纯函数，保存和UI反馈 |
| `src/lib/types.ts`、`seed.ts`、`selectors.ts` | 迁移期间兼容入口；最终没有Michelle/Lai-wah行为分支 |
| `src/features/check-in/*`、`sharing/*`、`notifications/*` | 新核心旅程页面／控件 |
| 既有 `Today/Ask/Health/Care/Book/Brief/Family/Memory/Settings` | 改为消费相同domain snapshot和selectors |

### 类型契约

Task 1 创建以下契约；实现者填写字段的完整定义，不改变这里确定的含义。现有 `Locale/Localized/SourceClass` 保留兼容。

```ts
type PatientId = "may";
type ActorId = "may" | "david";
type RecipientId = "david" | "caregiver-lee" | "doctor-wong";
type Perspective = "patient" | "caregiver";
type SharingLevel = "alerts-only" | "summary" | "full";
type ShareCategory = "body" | "mood" | "measurements" | "medication" | "appointments";
type Mood = "good" | "okay" | "low" | "stressed" | "skipped";
type BodyFeeling = "well" | "tired" | "dizzy" | "other";
type EventStatus = "pending" | "acknowledged" | "declined" | "resolved" | "revoked";
type TaskStatus = "pending" | "scheduled" | "snoozed" | "completed" | "cancelled";
type BriefStatus = "draft" | "confirmed";
type ScenarioId = "first-use" | "routine-day" | "dizziness" | "low-mood"
  | "share-needed" | "caregiver-alert" | "day-before-visit"
  | "next-morning" | "after-visit" | "urgent-help";
type ActionResult<T> = { ok: true; value: T } | { ok: false; code: string };
interface DemoContext { actorId: ActorId; patientId: PatientId; perspective: Perspective }
```

Domain类型必须定义：`DemoState`（spec的snapshot字段，schemaVersion=4）、`Profile`、`HealthRecord`、`HealthEpisode`、`ConversationSession`、`ImportedReport`、`ConsultationQuestion`、`Observation`、`CheckInDraft`、`DailyCheckIn`、`MedicationDose`、`Appointment`、`CareTask`、`ConsentGrant`、`AttentionEvent`、`BriefPacket`、`MemoryItem`、`SharingProjection`、`LocalAssistantContext`、`LocalAssistantReply`。UI短暂状态在store独立字段，不装入`DemoState`；`DemoPreferences={locale: Locale; liteMode: boolean; introComplete: boolean}`独立持久化，reset保留。

`DailyCheckIn`含`id/draftId/patientId/occurredAt/enteredAt/mood/body/note/revision`；`Observation`含`id/patientId/occurredAt/enteredAt/systolic/diastolic/source/revision`。`ConsentGrant`含`id/patientId/recipientId/level/categories/status/updatedAt/revision`。`CareTask`含`id/patientId/ownerId/proposedOwnerId/kind/status/scheduledAt/sourceRecordIds/shareCategory/contactOutcome`；kind为`medication/check-in/contact/appointment/accompany/after-visit`；`ownerId`只在接受协助后改为David。`BriefPacket`含`id/patientId/appointmentId/appointmentRevision/recipientId/grantRevision/status/revision/generatedAt/confirmedAt/sections/questions/sourceRecordIds/sourceRevisions/includeMood`。问题每项含`id/patientId/text/selected`。

`HealthRecord`含`id/patientId/category/source/occurredAt/enteredAt/text/revision`，承载症状与覆诊后本人记录；`HealthEpisode`含`id/patientId/answers/step/disposition/sourceRecordIds/revision`，`answers`保留原urgent/onset/change/medGap语义，disposition为`open/ordinary/uncertain/worsening/urgent`，不叫safe；`ConversationSession`含`id/patientId/episodeId/messages/status`并保存可恢复草稿；`ImportedReport`保留虚构原文与三项结果。它们都进入snapshot，不是只存summary字符串。

`Profile.knownConditions`含高血压／二型糖尿病的Localized名称和`source="fictional-profile"`，仅May有这两项PDF已提供背景；David为空。`HealthRecord.category`与`CareTask.shareCategory`可为`ShareCategory | "private"`；无分类自由文字默认private；ImportedReport结果归measurements，其界面范围写清楚。

## Task 1：统一角色、情境与持久化

**Files:** Create `src/lib/demo/types.ts`, `fixtures.ts`, `scenarios.ts`, `persistence.ts`, `selectors.ts`; Modify `src/lib/store.ts`, `types.ts`, `seed.ts`, `selectors.ts`, `src/components/AppShell.tsx`, `src/features/settings/SettingsPages.tsx`, `src/lib/i18n.ts`; Test `tests/demo-state.spec.ts`。

**Interfaces:**
- Produces `createScenario(id: ScenarioId): DemoState`，完整快照且默认clock为spec值。
- Produces `loadDemo(storage: Storage): ActionResult<DemoState | null>`，`saveDemo(storage: Storage, state: DemoState): ActionResult<void>`。
- Produces `loadPreferences(storage: Storage): ActionResult<DemoPreferences | null>`、`savePreferences(storage: Storage, value: DemoPreferences): ActionResult<void>`，key为`caremate-v4-preferences`。
- Produces `selectContext(state: DemoState, actorId: ActorId): DemoContext`、`selectToday(state: DemoState): TodayView`；`TodayView`在types定义为单一hero＋可见tasks＋daily-entry。
- Store 暴露 `demo: DemoState`, `setPerspective(actorId: ActorId): void`, `applyScenario(id: ScenarioId): void`, `setScenarioClock(at: string): void`, `resetDemo(): void`；后续UI只从`demo`查询领域数据。
- Produces `setEmergencySession(storage: Storage, episodeId: string | null): ActionResult<void>`，`getEmergencySession(storage: Storage): ActionResult<string | null>`，storage为sessionStorage、key=`caremate-v4-emergency`。Store另持有`activeEmergencyEpisodeId: string | null`，这是session UI状态，不混入localStorage snapshot。

- [ ] 写`context_is_explicit_and_legacy_data_is_not_reassigned`：May=patient、David=caregiver；查看共享May后回May不带入David操作身份；旧母亲数据不属于David；旧key保留。
- [ ] 写`persona_conditions_are_seeded_without_inferred_diagnosis_or_new_prescription`：May的已提供背景恰为hypertension/type2-diabetes，David无疾病背景；不从报告数值生成新condition或药物。
- [ ] 写`scenarios_are_complete_and_repeatable`：10个ScenarioId都有有效人物／记录／任务引用；重复创建相同快照相等；Today恰好一个hero。
- [ ] 写`storage_failure_is_reported_without_false_persistence`：损坏JSON和抛QuotaExceededError返回失败；内存可继续，UI不宣称持久保存。
- [ ] 写`emergency_is_retained_in_tab_but_rechecked_in_fresh_session`：same-tab reload/back保留活动求助；切David再回May不清除；新context通过Playwright `storageState`复用已保存localStorage而不复制sessionStorage，重新询问当前症状、保留旧记录／待办；迁移`pages-session`现有回归语义。
- [ ] Run `npm run test -- tests/demo-state.spec.ts --project=chromium --workers=1`，新类型／函数尚未存在时应FAIL。
- [ ] 实现上述接口；用新key初始化，不删除旧key；原子更新与保存由store统一处理；研究员控制加载完整快照。
- [ ] 提供现有`lib/types/seed/selectors`的迁移兼容accessors，保证已有route可build；它们从demo派生，不复制第二份事实。Task2–9在其列出的页面完成新接口迁移，Task9移除兼容行为与硬编码Michelle/Lai-wah临床语义；David不拥有旧母亲健康记录。读取本地Next `layouts-and-pages.md`、`server-and-client-components.md`、`static-exports.md`。
- [ ] 同一命令PASS；Run `npm run build` 确认类型与路由集成通过；只暂时更新真正因角色改变的旧fixture断言，保留原语义覆盖。
- [ ] 提交该任务文件；review关注person/context、损坏存储、scenario全引用，不开始下一任务直到问题关闭。

## Task 2：可审阅、可更正的身心daily check-in

**Files:** Create `src/lib/demo/check-in.ts`, `src/features/check-in/CheckInPage.tsx`, `CheckInReview.tsx`, `src/app/check-in/page.tsx`; Modify `TodayPage.tsx`, `HealthPage.tsx`, `store.ts`, `demo/selectors.ts`, `i18n.ts`; Test `tests/check-in.spec.ts`。

**Interfaces:** Consumes Task 1 `DemoState/ActionResult`。
- Produces `createCheckInDraft(state: DemoState, patientId: PatientId): CheckInDraft`。
- Produces `updateCheckInDraft(draft: CheckInDraft, patch: Partial<Pick<CheckInDraft,"mood"|"body"|"note">>): CheckInDraft`。
- Produces `commitCheckIn(state: DemoState, draft: CheckInDraft): ActionResult<DemoState>`。
- Produces `saveObservation(state: DemoState, observation: Observation): ActionResult<DemoState>`；同ID更新并增加revision，来源和时间保留。

- [ ] 写`daily_body_and_mood_can_be_reviewed_and_edited`：记录low+tired，返回改okay，保存后的时间线／详情为okay；不是医生确认；可以再次找到记录。
- [ ] 写`skipped_mood_stays_unknown_and_double_save_is_idempotent`：skipped显示无心情记录；双击和refresh只有一个记录。
- [ ] 写`draft_restores_after_back_and_invalid_bp_has_field_error`：离开再进入有草稿；空白、非数值、收缩压小于舒张压不能保存；使用schema范围40–300与20–200 mmHg作为输入格式边界，不作为临床判断。
- [ ] 写`observation_future_time_cannot_be_saved`：occurredAt晚于情境clock时字段错误；输入时间与补录发生时间分开保留。
- [ ] Run `npm run test -- tests/check-in.spec.ts --project=chromium --workers=1` 应FAIL；实现心情文字控件、身体选择、审阅、草稿保存与inline receipt。
- [ ] 实现量度新增／更正；近期平均从实际store observations重算，不仅保存readingNotes；编辑结果在图表、表格和摘要来源中一致。
- [ ] 同一命令PASS；人工以键盘完成一次，无颜色也能分辨选择；Run `npm run lint`。
- [ ] 提交并review R1/J1：保存／草稿区分、可恢复、中文换行；不为纯间距调整增加镜像测试。

## Task 3：药物、提醒、翌日和家庭任务生命周期

**Files:** Create `src/lib/demo/care.ts`, `src/features/care/TaskDetail.tsx`, `ReminderTimePicker.tsx`; Modify `CarePage.tsx`, `TodayPage.tsx`, `store.ts`, `demo/selectors.ts`, `demo/exports.ts`, `i18n.ts`; Test `tests/care-lifecycle.spec.ts`。

**Interfaces:**
- Produces `setDoseStatus(state: DemoState, doseId: string, status: "unknown" | "user_confirmed_taken" | "user_reported_not_taken"): ActionResult<DemoState>`。
- Produces `scheduleFollowup(state: DemoState, patientId: PatientId, at: string): ActionResult<DemoState>`（同一患者的当前followup按稳定ID新增／更新）、`cancelTask(state: DemoState, taskId: string): ActionResult<DemoState>`。
- Produces `snoozeTask(state: DemoState, taskId: string, until: string): ActionResult<DemoState>`；schedule／snooze拒绝malformed和不晚于clock的时间，返回`invalid-time/past-time`；过期未完成任务保留pending并由selector标识overdue。
- Produces `completeCheckInTask(state: DemoState, taskId: string, checkInId: string): ActionResult<DemoState>`；没确认记录不得完成。
- Produces `recordContactOutcome(state: DemoState, taskId: string, outcome: "not-contacted" | "left-message" | "contacted", note: string): ActionResult<DemoState>`；left-message保留待处理，contacted只完成联系动作，不关闭健康episode。
- Produces `createAfterVisitTask(state: DemoState, input: {patientId: PatientId; text: string; scheduledAt: string; proposedOwnerId: ActorId; shareCategory: ShareCategory | "private"}): ActionResult<DemoState>`；先建本人来源的HealthRecord，再建引用它的task。自由文字初始private；只有患者预览后明确选择类别才可共享，不自动归body。
- Produces `taskToIcs(task: CareTask): string`（`exports.ts`），所有UI与ICS用`scheduledAt`。

- [ ] 写`custom_0915_is_identical_in_receipt_task_today_and_ics`，assert时间均为`2026-09-17T09:15:00+08:00`，ICS UTC为`DTSTART:20260917T011500Z`。
- [ ] 写`unknown_medication_is_not_missed_and_can_be_corrected`；拒绝、取消、稍后提醒不记作服药。
- [ ] 写`next_day_still_or_worse_requires_new_confirmed_record`；没有保存check-in就不complete；worse产生独立下一步，未完成联系任务仍存在。
- [ ] 写`after_visit_task_starts_with_patient_owner_and_explicit_source_category`：本人提供的虚构事项有来源；proposed David尚未接受时owner仍May；自由文字默认private，情绪模板沿用mood。接受／拒绝／完成行为留给Task7测试，不依赖未来接口。
- [ ] 写`hk_midnight_and_past_snooze_are_consistent_in_foreign_browser_timezone`：browser timezone=`America/Los_Angeles`，clock从`2026-09-16T23:59:00+08:00`推进至`2026-09-17T00:01:00+08:00`；Today日期正确，旧pending不完成；past/malformed schedule、snooze不能保存；未来09:15仍对应UTC01:15。
- [ ] Run `npm run test -- tests/care-lifecycle.spec.ts --project=chromium --workers=1` 应FAIL；实现TaskDetail和真正的选择／更改／取消／稍后；药物任务可操作。
- [ ] 对固定情境时钟推进重新选Today；只完成已确认任务，不把回答或left_message当已解决。
- [ ] 同一命令PASS；检查任务计数与可见items相等；提交并review时间和状态同源。

## Task 4：完全本地的有限助手和现有症状分支

**Files:** Create `src/lib/demo/local-assistant.ts`, `src/features/assistant/HelpPage.tsx`, `src/app/help/page.tsx`; Modify `AskPage.tsx`, `EmergencyHelp.tsx`, `CheckInPage.tsx`, `demo/fixtures.ts`, `src/lib/agent.ts`, `src/lib/ask-llm.ts`, `store.ts`, `i18n.ts`, `README.md`, `INTERACTION_INVENTORY.md`; Remove live path `src/app/api/ask/route.ts`, `src/lib/hkbu.ts` after confirming no remaining imports; Test `tests/local-assistant.spec.ts`; Update `ask-llm.spec.ts`, `demo-quality.spec.ts`, `emergency-cjk.spec.ts`。

**Interfaces:** Produces `getLocalAssistantReply(input: string, context: LocalAssistantContext): LocalAssistantReply`；reply有`intent`, `text: Localized`, `nextAction`, `disposition: "continue" | "uncertain" | "worsening" | "urgent" | "unsupported"`，固定词典无网络。`nextAction`在types定义为check-in/brief/question/help或null。

Produces `getHelpDisposition(input: string): "physical" | "emotional" | null`，check-in和assistant共用；fixtures明确支持“我現在想傷害自己”／“I want to hurt myself now”及列出的固定变体，未宣称全面识别。

- [ ] 写`no_api_or_external_requests_during_all_assistant_paths`：浏览器记录所有request；quick reply、任意文本、unsupported、低落／压力均无`/api/ask`和第三方请求。允许本地HTML／JS／CSS／字体等静态资源。
- [ ] 写`urgent_uncertain_and_worsening_are_separate`：urgent不能保存常规summary或接受普通followup；uncertain不显示安全；更正旧回答后摘要只含新状态。
- [ ] 写`unsupported_input_keeps_a_useful_next_action`：未知输入不能返回编造诊断；给记录／问题／已有资料入口。low-mood分支可选择只记录或整理下一步。
- [ ] 写`fixed_emotional_help_inputs_interrupt_both_entry_points_in_both_languages`：两语言×check-in note／assistant input进入`/help`，不显示普通完成、不发送外部联系；草稿保留；same-session求助维持／fresh-session重问按Task1。具体文字review只覆盖固定demo说明，不证明临床检测能力。
- [ ] Run `npm run test -- tests/local-assistant.spec.ts --project=chromium --workers=1` 应FAIL；实现固定intent与可见输入说明，把自由完成任务与无限AI聊天区分。
- [ ] 删除ready探测、POST、HKBU文本和env分支；保留已有unknown、来源、跨人隔离、紧急和reply长度测试的有效语义，改为对本地函数断言。旧网络retry测试替换为本地不支持／输入纠错，不用skip掩盖退化。
- [ ] 更新About/README说明front-end脚本范围；patient surface不出现API、模型名称或假推理步骤。
- [ ] 同一命令及上述更新spec PASS；`rg -n '/api/ask|askHkbu|HKBU' src` 不应保留运行调用；Run `npm run build`；提交并review。

## Task 5：本地预约、改期与取消

**Files:** Modify `demo/care.ts`, `BookPage.tsx`, `CarePage.tsx`, `TodayPage.tsx`, `store.ts`, `i18n.ts`; Create `src/features/book/BookingReview.tsx`; Test `tests/booking-lifecycle.spec.ts`。

**Interfaces:** Produces `setAppointment(state: DemoState, appointmentId: string, slotId: string): ActionResult<DemoState>`、`cancelAppointment(state: DemoState, appointmentId: string): ActionResult<DemoState>`；复用Task 3的care函数。slot为fixtures已知ID，不接受任意杜撰时段。

- [ ] 写`booking_review_can_change_cancel_and_resume`：选时段、返回换时段、确认只更新一条appointment；双击不重复；可从Care找到，再改期／取消。
- [ ] 写`booking_does_not_complete_contact_task_or_claim_clinic_confirmation`：保留未联系任务；只出现本地行程结果。
- [ ] 写`no_slots_and_caregiver_context_have_clear_recovery`：无时段能保留原安排；David只建自己陪同事项；回May后她的预约可操作。
- [ ] 写`past_slots_are_filtered_after_clock_advance`：clock=9月21日，9月17/18旧slots不可选；确认时再次检查未来时间，返回`past-slot`；跨HK午夜改期后行程／ICS一致。
- [ ] Run `npm run test -- tests/booking-lifecycle.spec.ts --project=chromium --workers=1` 应FAIL；实现以上接口与确认页，页面读取浏览器数据只在client effect／事件中。
- [ ] 改期／取消同时失效旧的预约准备任务；Task 8负责按新日期生成新草稿。不改写联系task。
- [ ] 同一命令PASS；用9月17日11:00与原9月22日14:30核对；提交并review R3/J4。

## Task 6：三级授权与统一共享过滤

**Files:** Create `src/lib/demo/sharing.ts`, `src/features/sharing/SharingPage.tsx`, `SharingPreview.tsx`, `src/app/sharing/page.tsx`; Modify `FamilyPages.tsx`, `store.ts`, `i18n.ts`; Test `tests/sharing-permissions.spec.ts`。

**Interfaces:**
- Produces `setConsent(state: DemoState, input: {patientId: PatientId; recipientId: RecipientId; level: SharingLevel; categories: ShareCategory[]}): ActionResult<DemoState>`。
- Produces `revokeConsent(state: DemoState, grantId: string): ActionResult<DemoState>`。
- Produces `selectSharingProjection(state: DemoState, patientId: PatientId, recipientId: RecipientId): SharingProjection`；projection字段为`level/status/summary/records/events/tasks/appointments/sourceRecordIds`，未经授权均为空；private任务永不投影，任务也检查其类别；仅显示不涉及健康的May身份卡。

- [ ] 写`permission_levels_have_exact_allowed_content`：alerts-only仅中性提醒；summary不含原始note；full只含所选类别；mood默认不分享。
- [ ] 写`may_alone_can_change_grants_for_each_recipient`：David无法扩大权限；三个联系人投影独立；只有May能修改或撤销。
- [ ] 写`unshared_mood_and_private_tasks_are_absent_from_caregiver_projection`：David仅body授权时，mood任务及private任意文字在列表、详情、事件正文、计数和导出均不可见。
- [ ] 写`revoke_removes_appointment_brief_event_and_open_detail`：预先打开David详情，May撤销后当前详情、刷新、直接URL与摘要导出没有原健康数据；May原记录不删除。
- [ ] Run `npm run test -- tests/sharing-permissions.spec.ts --project=chromium --workers=1` 应FAIL；实现等级、类别、内容预览、确认和降级／撤销。
- [ ] 所有Family读取、shared摘要、计数与detail经同一个projection；UI结果“已更新分享設定”，不宣称发到真实家人设备。撤销说明外部已保存副本无法收回。
- [ ] 同一命令PASS；三权限×五类别×撤销矩阵在纯函数测试参数化，避免做75份重复截图；提交并独立review权限路径。

## Task 7：应用内事件、家属回应和覆诊后分工

**Files:** Modify `demo/sharing.ts`, `demo/care.ts`, `demo/selectors.ts`, `FamilyPages.tsx`, `CarePage.tsx`, `TodayPage.tsx`, `store.ts`, `i18n.ts`; Create `src/features/notifications/NotificationsPage.tsx`, `EventDetail.tsx`, `src/app/notifications/page.tsx`; Test `tests/caregiver-response.spec.ts`。

**Interfaces:**
- Produces `createAttentionEvent(state: DemoState, input: {patientId: PatientId; sourceRecordId: string; taskId?: string; scenario: "fixture-attention" | "after-visit-task"}): ActionResult<DemoState>`；after-visit-task必须给taskId，sourceRecordId为Task3创建的本人记录；event以taskId+recipientId稳定关联委派，不推断临床危险阈值。
- Produces `respondToEvent(state: DemoState, eventId: string, response: {actorId: ActorId; decision: "accept" | "decline"; note: string}): ActionResult<DemoState>`。
- Produces `resolveEvent(state: DemoState, eventId: string, actorId: ActorId): ActionResult<DemoState>`；接受与完成分离。

- [ ] 写`authorise_record_event_response_patient_receipt_is_complete`：May授权后保存fixture record→David只见对应投影→接受→May看到回应和责任人→完成后状态更新。
- [ ] 写`after_visit_task_owner_changes_only_after_authorised_acceptance`：event关联同一task；David接受后owner才改变，拒绝则May待分配；完成不自动修改来源类别；没有mood授权时mood任务连中性事件也不暴露。
- [ ] 写`no_consent_duplicate_trigger_or_decline_creates_no_false_response`：无授权不见事件；重复进入不重复；拒绝保留待分配，不产生已完成。
- [ ] 写`revoked_or_downgraded_event_cannot_reveal_old_payload`：旧详情与操作重新检查权限，撤销后返回明确失效结果而非执行。
- [ ] Run `npm run test -- tests/caregiver-response.spec.ts --project=chromium --workers=1` 应FAIL；实现新页、角色today、任务接受／完成和本地receipt。
- [ ] 事件文字遵守当前级别；alerts-only不含数字或心情原文；类别不允许则不生成该接收者事件；非David联系人只预览，不显示假收到／回应。
- [ ] 同一命令PASS；确认无真实消息／push／联系动作；提交并review J5/J8完整闭环。

## Task 8：覆诊前自动草稿、同源摘要与导出

**Files:** Create `src/lib/demo/brief.ts`, `src/features/brief/BriefReview.tsx`; Modify `demo/exports.ts`, `BriefPage.tsx`, `ReportPage.tsx`, `PrintView.tsx`, `src/lib/visit-brief.ts`, `TodayPage.tsx`, `store.ts`, `i18n.ts`; Test `tests/previsit-brief.spec.ts`。

**Interfaces:**
- Produces `ensurePrevisitDraft(state: DemoState, appointmentId: string): DemoState`；情境日为预约前一天且app打开时生成唯一draft。
- Produces `buildBrief(state: DemoState, patientId: PatientId, options: {appointmentId: string; includeMood: boolean; recipientId?: RecipientId}): ActionResult<BriefPacket>`；有recipient时必须先应用Task 6投影；未授权／alerts-only返回不可导出，summary不含原始记录，full仅含已选类别。
- Produces `confirmBrief(state: DemoState, briefId: string): ActionResult<DemoState>`，`briefToText(packet: BriefPacket, locale: Locale): string`。
- Produces `updateBriefDraft(state: DemoState, briefId: string, patch: {sectionEdits: Record<string, Localized>; questionIds: string[]; includeMood: boolean}): ActionResult<DemoState>`，编辑返回draft并清空confirmedAt；本人编辑作为补充，不改写原始报告／记录。来源更新保留补充但标记需要重新核对，不静默覆盖它。
- Produces `copyText(text: string): Promise<ActionResult<void>>`；失败有手动选择／复制入口，不显示“已複製”。
- Produces `prepareBriefExport(state: DemoState, briefId: string, recipientId?: RecipientId): ActionResult<BriefPacket>`；复制和Print页每次先调用它，按当前授权revision重建，不能复用已经缓存的共享正文。

- [ ] 写`day_before_visit_creates_one_reviewable_body_mood_draft`：clock=9月21日09:00、预约9月22日14:30；打开与刷新只有一个draft；包含最近确认记录；没心情数据就显示无记录。
- [ ] 写`editing_and_record_corrections_update_screen_copy_and_print`：更正读数／unknown药物／问题后UI、文本、Print packet一致；draft不显示已确认。
- [ ] 写`confirmed_brief_invalidates_on_every_content_revision`：确认→更正源记录／手动section／问题集合／includeMood／appointment→status=draft且confirmedAt=null→重新审阅确认→screen/copy/print同一新revision。sourceRevisions和appointmentRevision明确记录确认所依赖版本。
- [ ] 写`rescheduled_visit_invalidates_old_draft_and_shared_brief_obeys_current_consent`：改期后旧日期草稿不成为今日任务；撤销后共享brief不可导出；本人brief仍可用。
- [ ] 写`clipboard_rejection_and_print_preview_are_truthful`：clipboard拒绝不toast成功；print路由只有打开预览结果，测试不声称OS打印完成。
- [ ] Run `npm run test -- tests/previsit-brief.spec.ts --project=chromium --workers=1` 应FAIL；实现packet及审阅／确认，报告问题含patientId，不复写已导入原文。
- [ ] Today保留每日入口；摘要关键项在顶部，详细读数可展开；心情可排除；文字导出和print复用packet。
- [ ] 同一命令PASS；人工核对144/90平均及3项报告，不添加phantom sources；提交并review J6和医生本地交接。

## Task 9：初次使用、控制权和发现性

**Files:** Create `src/features/welcome/WelcomePage.tsx`, `src/app/welcome/page.tsx`; Modify `AppShell.tsx`, `SettingsPages.tsx`, `MemoryPage.tsx`, `src/lib/demo/selectors.ts`, `store.ts`, `i18n.ts`, compatibility route files; Test `tests/control-and-discovery.spec.ts`。

**Interfaces:** Produces `setMemoryUse(state: DemoState, memoryId: string, enabled: boolean): ActionResult<DemoState>`、`correctMemory(state: DemoState, memoryId: string, value: Localized): ActionResult<DemoState>`；selectors与本地assistant读取有效个性化材料，健康原记录不删除。

- [ ] 写`first_use_has_no_signup_and_daily_entry_remains_findable`：选择语言／大字即可进入今日；不同hero状态都能进入daily check-in。
- [ ] 写`mobile_settings_exposes_memory_and_sharing`：390px时从设置能进入两个控制；入口语义可读，不依赖桌面菜单。
- [ ] 写`memory_exclusion_updates_personalisation_but_keeps_source_record`：exclude＋reload不再用它做个性化提示，原健康记录仍存在；更正后所有派生文案更新。
- [ ] 写`compatibility_routes_are_useful_and_reset_preserves_preferences`：records/medications/privacy有正确目的地；清除有确认并保留locale/lite；恢复后无陈旧事件或弹窗。
- [ ] Run `npm run test -- tests/control-and-discovery.spec.ts --project=chromium --workers=1` 应FAIL；实现首次说明和患者控制入口，去除没有结果的相机／语音／外部联系入口。
- [ ] 根据spec对齐文本层级、间距和主要动作位置；不增加与任务无关的主题、登录或机构整合。
- [ ] 同一命令PASS；从手机首页自由探索完成一项控制任务；提交并review J7和R9发现性。

## Task 10：全旅程技术验收与UI审查

**Files:** Modify `playwright.config.ts`, `package.json`, `package-lock.json`; Create `tests/complete-journeys.spec.ts`, `responsive-accessibility.spec.ts`, `static-demo.spec.ts`, `scripts/verify-static-demo.mjs`, `scripts/measure-demo-performance.mjs`; Update existing tests and `.github/workflows/github-pages.yml` checks only; Save reports under `docs/superpowers/evidence/<execution-date>/`。

**Interfaces:** Task 1–9业务接口冻结；本任务不引入新产品功能。
- Produces scripts `test:prod`, `test:static`, `test:a11y`, `test:perf`，执行后退出码0代表各自报告门槛通过。
- `test:prod`用独立production server端口；`test:static`build的`out/`本地挂载在`/Personal_AI_Demo/`，不是去访问已部署旧网站。

- [ ] 写端到端测试，完成R1–R9和J1–J8，不靠研究员scene jump绕过用户动作；独立分支用完整起始快照。
- [ ] 记录现有58项测试的语义迁移表；无意义live readiness断言移除，但其离线边界用更强的zero-network断言替代；不得把失败改成skip作为验收。
- [ ] 配置`trace: retain-on-failure`、失败截图、HTML报告；保留0 retries作为确定性回归默认。
- [ ] 必要时添加官方`@axe-core/playwright`和`lighthouse`作为开发依赖，用`npm install --save-dev --save-exact`并提交lockfile；不加生产遥测或新运行时依赖。
- [ ] `responsive-accessibility.spec.ts`参数化所有产品页面／重要overlay的六个宽度；覆盖两语言、大字、200%缩放、reduced motion、长备注。assert无横向overflow、主按钮可见可点、底部导航不遮挡。
- [ ] 实测键盘完整任务、dialog trap／Escape／focus return／背景inert、标签／状态宣布、图表表格替代；axe没有serious/critical；手动确认不能由axe覆盖的可读性和屏幕阅读顺序。
- [ ] 在Chromium、Firefox、WebKit跑关键旅程；浏览器不可用时先安装官方Playwright依赖，不能把未运行写为通过。
- [ ] Run `npm run lint`, `npm run build`, `npm run test:prod`, `npm run test:static`, `npm run test:a11y`；期望0 errors、0失败、核心场景0 skip、导出直开／刷新成功、0健康API／第三方调用。修复与任务有关的4条现有lint warning。
- [ ] Run `npm run test:perf`：390×844、1440×900、4×CPU与1.6Mbps down/750Kbps up/150ms latency，各主要路由5次冷／暖启动；报告每次结果与中位数，不用均值掩盖离群。每个route／设备／冷热组中位数须LCP≤2.5s、CLS≤0.1、Lighthouse mobile≥90；若任一次LCP>4s或CLS>0.25，复查并说明离群原因，不能隐藏。主要动作每项10次trace，p95可见反馈≤200ms；这是项目交互预算。INP另用Chrome performance交互记录，Lighthouse的TBT不能标成INP，也不把小样本p95称作现场p75 CWV通过。
- [ ] 保存同视口、同状态的UI截图；独立review阅读16个原问题与新功能，对照spec核对。问题按阻断／严重／可优化分级，P0/P1关闭后才技术验收。
- [ ] 更新CI先检查再build；本任务不发布或推送。提交与review全部证据。

## Task 11：无引导参与者测试与最终交付

**Files:** Use [validation.md](../reviews/2026-10-03-caremate-validation.md); Update `INTERACTION_INVENTORY.md`, `RECORDING_SCRIPT.md`, `README.md`; Create results files under `docs/usability/<round-date>/`。

**Interfaces:** 每次参与者测试使用Task 1的完整ScenarioId快照；研究员控制不作为用户任务的导航提示。真实招募／测试依赖参与者，不由自动化伪造。

- [ ] 先一名患者型与一名家属型试跑任务语言、数据与时间；试跑不混入正式结果。
- [ ] 用户安排首轮6名年长参与者＋4名家属；每人完成适合角色的5–6项任务。不得未经用户明确授权主动联系或发邀请。
- [ ] 主持人只读目标卡，不说菜单／按钮名；记录独立完成、首次发现、求助、放弃、更正、理解和SEQ，详情见验证文档。
- [ ] 以每项任务和两个角色分开报告人数与结果；修复阻断与严重误解，再用新参与者复测。目标≥90%独立完成、关键权限／假预约／紧急动作理解0严重误解、SEQ中位数≥6/7；小样本只作形成性判断。
- [ ] 每个测试情境可重置；更新interaction inventory的所有主动作与恢复分支。保留recording script作为回归辅助，不把它当用户证据。
- [ ] 最终交付运行方式、静态版本验证、实际测试报告、性能数据、可访问性审查、参与者结果／未完成依赖、已知限制。
- [ ] 最终whole-branch review核对R1–R9和J1–J8。若真人测试尚未发生，交付状态写“技术验收通过，待用户测试”，不能写“体验完美”。
- [ ] 提交文档。用户选择另行部署时再执行发布，当前计划不含上线动作。

## 需求覆盖与阶段出口

| 需求／旅程 | 任务 | 阶段出口 |
| --- | --- | --- |
| 本地边界、R9角色和快照 | 1、4 | 同一环境可重现、无外部AI请求 |
| R1／J1每日身心、情绪支持 | 2、4 | 可记录、跳过、更正、保存、查找 |
| R2／J2、J3药物／症状／翌日 | 3、4 | unknown、紧急、加剧和继续跟进不混用 |
| R3／J4预约 | 5 | 本地确认、改期、取消、时间同源 |
| R4、R8／J5、J7控制 | 6、9 | 三级授权／撤销／个性化控制可发现且有效 |
| R5／J5 David响应 | 7 | May→David→May的可见闭环 |
| R6、R7／J6摘要与医生交接 | 8 | 前一天触发、审阅确认、屏幕和导出一致 |
| R7／J8覆诊后分工 | 3、7 | 有来源的下一步、接受后分配、完成可见 |
| R9完整评审／性能／人类可用性 | 10、11 | 实际证据通过或清楚列出仍未测的部分 |

## 计划自审结果

已逐项检查spec覆盖、共享类型、时间来源、权限重验证、失败恢复和执行依赖。接口中没有引用未定义的跨任务函数；`selectSharingProjection`统一负责共享，`taskToIcs`统一负责提醒时间，`BriefPacket`统一负责摘要导出。

独立产品／技术审查已完成，实质意见已修订并经复核；三份文档的本地链接有效、全局约束一致、没有未填写占位。此结论针对计划完整性，不代表新功能已经实施。

主要实施风险是新模型迁移、已有测试迁移和权限对派生输出的覆盖。以任务级review和最终跨旅程review控制；不以文件数、页面渲染成功或总测试数作为完成依据。
