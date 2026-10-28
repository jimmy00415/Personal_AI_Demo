# Guest entry and visual refresh

Goal: add a frontend-only login preview, remove the assumed visitor identity, and improve section contrast before deploying to the existing GitHub Pages site.

Design: retain the current Next.js/React/Zustand implementation and sample care journey. Start as a guest. A centered login modal is available from the header and settings, with email/password, visibility toggle, sample credentials and guest dismissal. Store only the sample display name/email in sessionStorage; never store or send a password. Keep the sample-patient notice visible after login. Use teal, blue, amber and lavender cards, icon accents and accessible expandable sections. Preserve emergency UI and existing demo features.

Implementation:
1. Add behavior coverage for guest identity, modal controls, password handling, logout and mobile accordion.
2. Add isolated demo-account state and accessible login modal; wire header/settings and guest greeting.
3. Refresh shared styling and home, health, follow-up and family sections without changing medical data.
4. Run ESLint, TypeScript, full Playwright suite and GitHub Pages static build; inspect desktop/mobile screenshots and review the diff.
5. Commit only task files, push master as requested, wait for Pages deployment and verify the live result.

Constraints: no backend/dependencies, bilingual Traditional Chinese/English, preserve untracked files from prior work. Read bundled Next.js client-component and static-export docs before implementation. Existing project deploys master via GitHub Actions; user explicitly requested commit/push/redeploy.

Pre-release verification: 64 Playwright tests pass; TypeScript and ESLint have no errors (four existing source warnings; unrelated tmp/output artifacts excluded). GitHub Pages static export builds all 24 pages in a disposable copy. Independent review found long-name mobile overflow and non-dotted email reload inconsistencies; both are fixed and covered by a 320px regression test. Reviewer verified fixes at 320px, 390px and 768px.
