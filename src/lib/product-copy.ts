const previousProductCopy = new Map<string, string>([
  [
    "這是使用虛構資料的本地示範，不需要註冊。資料儲存在這個瀏覽器；請勿輸入真實個人健康資料。",
    "無需註冊，即可開始整理你的健康紀錄。"
  ],
  [
    "This local demo uses fictional information and needs no sign-up. Data stays in this browser; please do not enter real personal health information.",
    "Start organising your health records without signing up."
  ],
  [
    "正在開啟本地示範",
    "正在開啟康伴"
  ],
  [
    "Opening the local demo",
    "Opening CareMate"
  ],
  [
    "已知背景（虛構人物設定）",
    "已知背景"
  ],
  [
    "Known background (fictional profile)",
    "Known background"
  ],
  [
    "本地覆診安排",
    "覆診安排"
  ],
  [
    "Local visit arrangement",
    "Visit arrangement"
  ],
  [
    "虛構資料・只供本地交接，未發送給醫生或家人。已匯出的內容無法收回。",
    "分享前請核對內容。已匯出的內容無法收回。"
  ],
  [
    "Fictional data for local handoff only; nothing sent to a clinician or family. Exported copies cannot be recalled.",
    "Review the contents before sharing. Exported copies cannot be recalled."
  ],
  [
    "李照顧者 · 虛構聯絡人",
    "李照顧者"
  ],
  [
    "Caregiver Lee · Fictional contact",
    "Caregiver Lee"
  ],
  [
    "黃醫生 · 虛構聯絡人",
    "黃醫生"
  ],
  [
    "Dr Wong · Fictional contact",
    "Dr Wong"
  ],
  [
    "只在此裝置模擬分享；不會發送到家人、照顧者或醫生的裝置。請勿輸入真實健康資料。",
    "選擇分享對象、內容和範圍，你可以隨時調整或停止分享。"
  ],
  [
    "Sharing is simulated on this device. Nothing is sent to family, caregivers or doctors. Do not enter real health information.",
    "Choose who can see your information and how much to share. You can change or stop sharing at any time."
  ],
  [
    "May Chan · 本地共享內容",
    "May Chan · 共享內容"
  ],
  [
    "May Chan · Local shared information",
    "May Chan · Shared information"
  ],
  [
    "這是目前獲授權內容的本地副本，並非已確認的就診摘要。",
    "內容按目前的授權範圍整理。就診摘要需另行核對及確認。"
  ],
  [
    "This is a local copy of currently authorised information, not a confirmed consultation brief.",
    "Contents reflect the current sharing permissions. Review and confirm your consultation brief separately."
  ],
  [
    "已加入我的本地陪同事項",
    "已加入我的陪同事項"
  ],
  [
    "My local accompaniment reminder was added",
    "My accompaniment reminder was added"
  ],
  [
    "已更新本地事項",
    "已更新事項"
  ],
  [
    "Local task updated",
    "Task updated"
  ],
  [
    "來源：本人提供的虛構記錄",
    "來源：本人提供的記錄"
  ],
  [
    "Source: my fictional record",
    "Source: your record"
  ],
  [
    "本人提供的虛構事項",
    "覆診後事項"
  ],
  [
    "My fictional task instruction",
    "After-visit instruction"
  ],
  [
    "請只使用研究任務卡上的虛構事項。這是本人紀錄，不是處方或醫生確認。",
    "記錄覆診後需要跟進的事項、時間和負責人。用藥安排請依照醫護指示。"
  ],
  [
    "Use only the fictional instruction on the study task card. This is your record, not a prescription or doctor confirmation.",
    "Record what needs following up after your visit, when it is due and who will help. Follow your clinician’s instructions for medicines."
  ],
  [
    "已建立本人來源紀錄與本地事項。",
    "已建立來源紀錄與跟進事項。"
  ],
  [
    "Your source record and local task were created.",
    "Your source record and follow-up task were created."
  ],
  [
    "輸入格式：收縮壓40–300、舒張壓20–200 mmHg，收縮壓須大於舒張壓。這些是演示輸入邊界，不是臨床判斷或正常範圍。",
    "輸入格式：收縮壓40–300、舒張壓20–200 mmHg，收縮壓須大於舒張壓。輸入範圍不代表正常血壓範圍。"
  ],
  [
    "Input format: systolic 40–300, diastolic 20–200 mmHg, with systolic greater than diastolic. These demo input boundaries are not clinical judgments or normal ranges.",
    "Input format: systolic 40–300, diastolic 20–200 mmHg, with systolic greater than diastolic. These input limits do not indicate a normal blood-pressure range."
  ],
  [
    "測試視角",
    "使用者視角"
  ],
  [
    "Test perspective",
    "User perspective"
  ],
  [
    "完整測試情境",
    "生活情境"
  ],
  [
    "Complete test scenario",
    "Everyday situations"
  ],
  [
    "本地覆診行程已更新",
    "覆診行程已更新"
  ],
  [
    "Your local visit itinerary was updated",
    "Your visit itinerary was updated"
  ],
  [
    "你選擇的時間已儲存在這個示範裝置。請自行聯絡診所確認；你可以查看及確認就診摘要。",
    "你選擇的時間已儲存。請聯絡診所確認安排；你可以查看及確認就診摘要。"
  ],
  [
    "Your chosen time is saved on this demo device. Contact the clinic yourself to confirm it; you can review and confirm your consultation brief.",
    "Your chosen time is saved. Contact the clinic to confirm arrangements; you can review and confirm your consultation brief."
  ],
  [
    "本地記錄血壓和頭暈事項的時間已儲存。聯絡醫護仍然待處理：",
    "記錄血壓和頭暈事項的時間已儲存。聯絡醫護仍然待處理："
  ],
  [
    "Your local blood-pressure and dizziness recording time is saved. Contacting a clinician is still pending:",
    "Your blood-pressure and dizziness recording time is saved. Contacting a clinician is still pending:"
  ],
  [
    "本地示範：可整理症狀、心情、報告、服藥紀錄、覆診和問題；其他輸入會提供可用入口。",
    "康伴協助你整理症狀、心情、報告、服藥紀錄、覆診安排和想詢問醫護的問題。"
  ],
  [
    "Local demo: organise symptoms, mood, reports, medication records, visits and questions; other inputs offer useful next steps.",
    "CareMate helps organise symptoms, mood, reports, medication records, visits and questions for your clinician."
  ],
  [
    "求助分支只示範固定輸入，例如「我現在想傷害自己」或「我現在胸痛」，並不能識別所有危險表達。",
    "如有即時危險，請直接求助。文字回應未必能識別所有危險情況。"
  ],
  [
    "Help is demonstrated for fixed inputs such as “I want to hurt myself now” or “I have chest pain now”; it cannot recognise every expression of danger.",
    "If you are in immediate danger, seek help directly. Text responses may not recognise every dangerous situation."
  ],
  [
    "這個示範未能回答這項內容。你可以先記錄身心狀態、查看已有資料，或把問題加入就診摘要。",
    "暫時未能回答這項內容。你可以先記錄身心狀態、查看已有資料，或把問題加入就診摘要。"
  ],
  [
    "This demo cannot answer that request. You can record how you feel, review saved information, or add a question to your consultation brief.",
    "I cannot answer that request yet. You can record how you feel, review saved information, or add a question to your consultation brief."
  ],
  [
    "你可以查看示範覆診時段，並整理想詢問診所的問題。行程更新只儲存在此裝置，不代表診所確認。",
    "你可以查看覆診時間，並整理想詢問診所的問題。選好時間後，請聯絡診所確認安排。"
  ],
  [
    "You can review demo appointment slots and prepare questions for the clinic. Schedule updates stay on this device and are not clinic confirmation.",
    "You can review visit times and prepare questions for the clinic. Contact the clinic to confirm arrangements after choosing a time."
  ],
  [
    "會下載一個日曆檔，方便你自行匯入。康伴不會改動外部日曆，也不會推送通知。",
    "下載日曆檔後，可匯入你使用的日曆，並自行設定提醒。"
  ],
  [
    "This downloads a calendar file for you to import. CareMate does not change an external calendar or send notifications.",
    "Download the calendar file, import it into your calendar and choose your reminders."
  ],
  [
    "此版本用於展示產品設計，未連接醫療機構，也不提供真人醫護支援。資料儲存在此裝置。",
    "康伴陪你管理每天的健康紀錄、整理覆診資料，並與家人協調需要跟進的事項。"
  ],
  [
    "This version is for product-design presentation. It is not connected to a healthcare organisation and does not provide live clinical support. Information stays on this device.",
    "CareMate helps you manage daily health records, prepare for visits and coordinate follow-up tasks with family."
  ],
  [
    "康伴可以整理紀錄、準備就診摘要、在應用程式內改期，以及提醒你。它不能診斷、處方、致電，或代表醫護監察你。此版本的改期只寫入此裝置，診所不會收到通知。",
    "康伴協助整理資料，不提供診斷或處方。健康和用藥問題請向醫護人員查詢。"
  ],
  [
    "CareMate can organise records, prepare a consultation brief, reschedule inside this app, and remind you. It cannot diagnose, prescribe, place calls, or monitor you on behalf of clinicians. In this version a booking change stays on this device; the clinic is not notified.",
    "CareMate helps organise information and does not provide diagnoses or prescriptions. Ask a clinician about health and medication decisions."
  ],
  [
    "錄製控制",
    "情境設定"
  ],
  [
    "Recording controls",
    "Scenario settings"
  ],
  [
    "管理本地覆診行程",
    "管理覆診行程"
  ],
  [
    "Manage local appointment itinerary",
    "Manage your visit itinerary"
  ],
  [
    "選擇虛構時段，再核對本地行程。請自行聯絡診所核實安排。",
    "選擇時間，再核對行程。請聯絡診所確認安排。"
  ],
  [
    "Choose a fictional time and review your local itinerary. Contact the clinic yourself to verify arrangements.",
    "Choose a time and review your itinerary. Contact the clinic to confirm arrangements."
  ],
  [
    "虛構本地時段，並非診所即時空缺",
    "行程時間"
  ],
  [
    "Fictional local times, not live clinic availability",
    "Itinerary times"
  ],
  [
    "已更新康伴內的本地行程",
    "已更新康伴內的行程"
  ],
  [
    "Local itinerary updated in CareMate",
    "Itinerary updated in CareMate"
  ],
  [
    "只儲存此裝置的本地行程，未通知診所，亦不代表診所確認。聯絡醫護和個人提醒仍需各自處理。",
    "行程已儲存。請聯絡診所確認安排，並查看需要跟進的聯絡事項和個人提醒。"
  ],
  [
    "Only the local itinerary on this device is saved. The clinic has not been notified or confirmed. Contact and personal reminder tasks remain separate.",
    "Your itinerary is saved. Contact the clinic to confirm arrangements, and review your contact tasks and personal reminders."
  ],
  [
    "本地虛構示範；此操作不會聯絡診所。",
    "請聯絡診所確認安排。"
  ],
  [
    "Fictional local demo; this action does not contact the clinic.",
    "Contact the clinic to confirm arrangements."
  ],
  [
    "取消本地行程",
    "取消行程"
  ],
  [
    "Cancel local itinerary",
    "Cancel itinerary"
  ],
  [
    "核對取消本地行程",
    "核對取消行程"
  ],
  [
    "Review local cancellation",
    "Review cancellation"
  ],
  [
    "本地行程已取消；診所安排未有改動。",
    "行程已取消。診所安排如需更改，請另行聯絡診所。"
  ],
  [
    "Local itinerary cancelled; clinic arrangements have not changed.",
    "Itinerary cancelled. Contact the clinic separately if its arrangements need changing."
  ],
  [
    "沒有未來的虛構時段。原有安排保留；請自行聯絡診所查詢其他日期。",
    "沒有列出的未來時段。原有安排保留；請聯絡診所查詢其他日期。"
  ],
  [
    "No future fictional times. Your existing arrangement is retained; contact the clinic for another date.",
    "No upcoming times are listed. Your existing arrangement is retained; contact the clinic for another date."
  ],
  [
    "沒有已安排的本地行程。",
    "沒有已安排的行程。"
  ],
  [
    "No local itinerary is scheduled.",
    "No itinerary is scheduled."
  ],
  [
    "沒有可管理的本地行程。可返回跟進查看你的事項。",
    "沒有可管理的行程。可返回跟進查看你的事項。"
  ],
  [
    "No local itinerary is available. Return to your care tasks.",
    "No itinerary is available. Return to your care tasks."
  ],
  [
    "只記錄此裝置的虛構協助事項；不會發送訊息或通知。",
    "在這裡查看及回應需要家人協助的事項。"
  ],
  [
    "Fictional assistance on this device only; no messages or notifications are sent.",
    "Review and respond to tasks that need help from family."
  ],
  [
    "建立本地協助事項",
    "建立協助事項"
  ],
  [
    "Create local assistance request",
    "Create assistance request"
  ],
  [
    "本地回應（可不填，最多500字）",
    "回應（可不填，最多500字）"
  ],
  [
    "Local response (optional, up to 500 characters)",
    "Response (optional, up to 500 characters)"
  ],
  [
    "已記錄本地事項狀態",
    "已記錄事項狀態"
  ],
  [
    "Local request status recorded",
    "Request status recorded"
  ],
  [
    "本地協助已完成；May仍負責另行記錄原有健康事項。",
    "協助已完成；May仍負責另行記錄原有健康事項。"
  ],
  [
    "Local assistance is complete; May remains responsible for separately recording the underlying health task.",
    "Assistance is complete; May remains responsible for separately recording the underlying health task."
  ]
]);

export function productCopy(text: string): string {
  const current = previousProductCopy.get(text) ?? text;
  return current.replaceAll("虛構血液化驗報告：HbA1c 6.4%；LDL 2.7 mmol/L；肌酐 71 μmol/L。", "血液化驗報告：HbA1c 6.4%；LDL 2.7 mmol/L；肌酐 71 μmol/L。").replaceAll("Fictional blood test report: HbA1c 6.4%; LDL 2.7 mmol/L; creatinine 71 μmol/L.", "Blood test report: HbA1c 6.4%; LDL 2.7 mmol/L; creatinine 71 μmol/L.");
}
