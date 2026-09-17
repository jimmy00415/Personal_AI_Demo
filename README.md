# CareMate HK · 康伴

Frontend-only product-design prototype. It is **not** connected to a healthcare organisation and does not provide live clinical support. Information stays on this device.

**Your health, understood over time. / 持續理解你的個人健康。**

## Start

```bash
npm install
npm run dev
```

http://localhost:3000

**Recording / acceptance (production):**

```bash
npm run build
npm start
npm run test
```

Do not record from the development server.

## Routes

| Route | Screen |
| --- | --- |
| `/` | Today — one next action from the scenario clock |
| `/ask` | Dizziness check-in (urgent → onset → change → medication gap → summary) |
| `/health` | Overview / 健康紀錄 / 血壓與量度 / 報告 |
| `/care` | 跟進 |
| `/brief` | Consultation brief, clipboard, print, follow-up |
| `/book` | Reschedule using saved records and an imported clinic calendar |
| `/report` | Blood test (exactly 3 results) |
| `/print` | Printable brief |
| `/family` | Mother’s shared appointment and BP only |
| `/memory` | What CareMate understands — can stop personalisation |
| `/about` | Product scope |
| `/settings` | Language, larger text |
| `/dev` | Recording controller (Ctrl+Shift+D) |

`/visit` → `/brief`. `/journey` → `/health`. `/plan` → `/care`.

## Model

- Clock: `2026-09-16T08:45+08:00` in `src/lib/types.ts` (`OPENING_CLOCK`)
- Fixtures: `src/lib/seed.ts`
- Transitions: `src/lib/store.ts` (namespaced `localStorage` key `caremate-v3`)
- Copy: `src/lib/i18n.ts`
- Tokens: `src/app/globals.css`

A missing medication **record** is UNKNOWN, not missed. A saved brief is not a sent message. An in-app booking is not a clinic confirmation. An emergency state does not become routine follow-up.

## Recording

See `RECORDING_SCRIPT.md` and `INTERACTION_INVENTORY.md`.

## Limitations

No diagnosis, prescribing, 999 call, live clinic booking, clinician messaging, 醫健通 / HA Go / Apple Health connection, push notifications, or background monitoring. Appointment changes and calendar export stay on this device. Health copy is for design evaluation and needs professional review before any other use.
