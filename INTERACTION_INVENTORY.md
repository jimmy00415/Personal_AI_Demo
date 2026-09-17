# Interaction inventory

Patient-facing actions and their real outcomes. Removed affordances are listed at the end.

| Surface | Action | Outcome |
| --- | --- | --- |
| Today | 了解頭暈情況 | Opens `/ask` with Michelle’s dizziness context |
| Today | 查看血壓紀錄 | Opens Health → 血壓與量度 |
| Today | 查看就診摘要 | Opens `/brief` after a saved episode |
| Today | 暫時沒有再頭暈 / 仍然有頭暈 / 比昨天嚴重 | Writes next-morning answer; does not mark clinical recovery |
| Ask | Urgent options | Exclusive none; chest/stroke/collapse → urgent page; 不確定 → uncertainty, not “safe” |
| Ask | Onset / change | Stored and editable until save |
| Ask | 14 Sep medication options | UNKNOWN stays unknown; taken-unlogged is user-confirmed; not-taken is user report. Never “missed” by inference |
| Ask | 確認並儲存 | Creates episode `ep-dizzy-16` once; toast 已加入健康紀錄 |
| Ask | 更正內容 | Drops the superseded answers, shows a correction note, and asks onset once |
| Ask | 準備就診摘要 | `/brief` |
| Ask | Free text | On localhost with `HKBU_GENAI_API_KEY`, `/api/ask` talks to HKBU gpt-4.1. On GitHub Pages, scoped refusal only |
| Ask | Stray keystrokes | Answered locally with a clarifying line; no model call |
| Ask | Model reply guards | A reply is replaced if it reads back the record packet, claims safety, or calls an UNKNOWN dose missed |
| Ask | 重試 | Appears only after a failed model call; resends the same question without repeating it |
| Ask / Brief / Book | Symptom wording | Always derived from the answers given, so no view claims the dizziness eased when it worsened |
| Ask | Emergency across sessions | Survives a reload in the same tab; a later visit re-asks the urgent question instead of re-showing the alarm |
| Settings | 清除此裝置上的資料 | Two-step; returns to the 16 Sep 8:45 start, keeps language and text size, toast 已清除此裝置上的資料 |
| Shell | GitHub Pages paths | Routes carry a trailing slash on Pages; chrome, FAB, and Ask-link rules use normalised paths |
| Ask | 999 / 如何使用電話 | Explains the user must dial; no call is placed |
| Brief | 查看血液化驗 | `/report` full page |
| Brief | 加入 / 移除就診問題 | Shared list with report page |
| Brief | 複製摘要 / 複製內容 | Clipboard write; 已複製 only after success |
| Brief | 列印或儲存PDF | `/print` + browser print dialog (not a fake download) |
| Brief | 記錄聯絡結果 | Local 尚未聯絡 / 已留言 / 已聯絡 + note |
| Brief | 預約較早覆診 | Opens `/book` with Michelle’s saved packet |
| Book | Confirm a clinic-calendar slot | Updates the in-app appointment and 跟進; toast 已更新你的行程. Does not notify a clinic |
| Book | 加入日曆 | Local ICS of the chosen slot |
| Brief | 加入日曆 | Downloads a local ICS file |
| Report | Expand a result | Plain-language note; no colour-coded “abnormal” |
| Report | 報告原文 | Immutable local text |
| Report | 參考資料 | NIDDK A1C page |
| Health | Open a blood-pressure row | Sheet with timestamp, 家居量度, and a local correction note |
| Family | Switch to 陳麗華 | Only appointments + BP; medicines = 尚未分享 |
| Family | 準備媽媽的覆診資料 | Local brief, no medicines |
| Family | 提醒我陪媽媽覆診 | Task on Michelle’s list only |
| Family | 停止接收 | Hides shared fields; cannot self-grant |
| Memory | 不再用作個人化建議 | Excludes from personalisation; original record remains |
| Settings | Language / larger text | Immediate, persisted |
| About | — | States: design presentation, local data, no live clinical support |
| `/dev` | Reset / clock / scenes | Recording only; patient chrome is hidden |

## Removed or not offered

- Demo / 示範 / 模擬 badges on patient screens
- 用人話講, 從 AI 情境移除, 3 active, 全部12項
- Fake 醫健通 / HA Go / Apple Health “connected” states
- 發送給醫生, 已致電, 診所已確認
- Camera, microphone, and unimplemented share
- Universal “今日暫時不需要做其他事情” footer
