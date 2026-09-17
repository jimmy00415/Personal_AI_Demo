# CareMate HK V3 — Recording script

Record from a **production** build, not `next dev`.

```bash
npm run build
npm start
```

Open http://localhost:3000. Use a clean profile or `/dev` → **重設為9月16日上午8:45**.

Do not show `/dev` in the patient video except if you need a cut to 9月17日. The main story can be recorded without scene jumps.

Internal scenes (Ctrl+Shift+D or `/dev`): `morning-start`, `symptom-summary`, `report-review`, `brief-ready`, `booking-ready`, `booking-done`, `next-morning`, `family-preparation`, `urgent-help`. `/dev` hides patient navigation.

---

## Main story (about 4–5 minutes)

### 1. Today — 0:00–0:35

Expected: 「早晨，Michelle」「9月16日 · 星期三」. Hero: **今早頭暈，先了解清楚**. Evening medicines show **晚上才需要**, not completed.

Click **了解頭暈情況**.

### 2. Urgent check — 0:35–1:00

Header: 了解頭暈情況 / 陳美玲. Click **以上都沒有**.

### 3. Onset and change — 1:00–1:20

Click **今早起床後**, then **比剛才減輕**.

### 4. Medication-record gap — 1:20–1:50

Expected: missing 14 September evening record is **not** called a missed dose.

Click **有服藥，只是沒有記錄**. Receipt: 已補記服藥 · 由你確認.

### 5. Save summary — 1:50–2:20

Read 給醫生看的重點 (average 144/90). Click **確認並儲存**. Toast: 已加入健康紀錄. Click **準備就診摘要**.

### 6. Report — 2:20–3:00

Click **查看血液化驗**. Exactly three results. Expand HbA1c. Click **加入就診問題** on the first suggestion. **返回就診摘要**.

### 7. Brief and follow-up — 3:00–4:00

Confirm the HbA1c question and the 14 September note. Optionally **複製摘要**. Click **明早8:30**.

### 7b. Book earlier visit (optional 30–40 seconds)

From the brief, click **預約較早覆診**. Packet shows dizziness, 151/94, 144/90, medicines, allergy, labs, and 9月22日. Confirm **9月17日上午11:00**. Receipt: 已更新你的行程. Do not say the clinic was notified.

### 8. Follow-up tab — 4:00–4:20

Open **跟進**. Contact is pending. Tomorrow morning is scheduled. 9月22日覆診 remains.

### 9. Next morning (cut or `/dev` → 前往9月17日) — 4:20–4:50

Today: **昨天記錄了頭暈，今早感覺怎樣？** Click **暫時沒有再頭暈**. Contact task still pending. Do not call this recovery.

---

## Family extension (30–45 seconds)

`/dev` → `family-preparation` or **家人** → 陳麗華.

One identity: 媽媽 · 陳麗華 · 78歲. Hero: 下星期三覆診. **尚未分享** for medicines. **準備媽媽的覆診資料** → **提醒我陪媽媽覆診**.

## Urgent branch (separate take)

Reset. 了解頭暈情況 → **胸口痛或呼吸困難**.

Full page: **請立即尋求醫療協助**, **999**, **康伴不會代你致電.** No summary, no “safe”.
