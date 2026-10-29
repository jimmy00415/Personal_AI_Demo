# Three-role CareMate implementation plan

Goal: role choice changes the user's home, navigation and care actions, backed by a coordinated editable Figma design.

Spec: ../specs/2026-10-29-three-role-care-design.md

1. Design: create Figma login + patient/family/caregiver views using suitable library components and Noto Sans TC. Keep role distinctions in hierarchy and task emphasis, not color alone.
2. State: extend src/lib/demo-account.ts with AppRole, persisted session role, backward-compatible signIn(email,role), setRole. Add src/lib/care-workspace.ts and role content definitions. Keep sample grants, acknowledgements and completed checklist IDs distinct; validate persisted data.
3. UI: add src/features/workspace components/pages and four static route wrappers. Patient sharing controls use the same grants consumed by shared-health/alerts/checklist views. Keep all sample medical readings and timestamps labelled. Checkbox actions are reversible and scoped to care tasks.
4. Shell/account: update LoginDialog role radio cards, AppShell role-aware nav and header role control, Settings role section, role-aware home and patient-only route boundaries. Preserve guest flow and existing patient IDs/actions.
5. Styling: align the app with the Figma neutral/teal/indigo/blue visual system. Convert px typography to rem so larger-text mode scales consistently. Keep expanded layouts responsive.
6. Tests: write failing role-flow tests first, then verify role login/refresh/logout, distinct nav, shared-data revocation, alert acknowledgement+reopen, caregiver checkbox persistence+undo and role isolation. Add real computed typography and bilingual mobile overflow assertions.
7. Release: lint/type checks, complete Playwright suite, desktop/mobile screenshots and independent review. Build static Pages export; commit only this task's files and push after verifying. Confirm GitHub Pages Actions and live role flows; share live and Figma links.

Risk focus: old session objects without roles; unsupported direct patient URLs; large-text overflow in radio cards and mobile nav; alert state mistaken for resolved health concern; retained confidential data after sharing revocation; checklist actions leaking into patient reminders.

## Verification record

- 85 Playwright tests passed, including preserved patient journey/emergency scenarios, role radios/login/session migration/logout, consent revocation, role-separated alert review, reversible caregiver checklist and computed text-contrast checks.
- TypeScript passed. ESLint has no errors, with four pre-existing unused-variable warnings; unrelated untracked tmp/output artifacts were excluded.
- Both languages in larger-text mode were exercised across patient/supporter pages at 320, 390 and 768px with no horizontal overflow or page errors. Desktop/mobile role screenshots were visually inspected. Caregiver checklist is visible beside the shared snapshot in the first desktop view.
- Independent code review found small-text contrast below 4.5:1; patient/caregiver/tertiary text tokens were darkened and the regression check now passes. No remaining consent or route-boundary findings.
- Static Pages export built 28 pages in a disposable copy; all 66 non-API source hashes matched. Local production smoke passed all three role logins, persistence, alert review, checklist undo, permission revocation, direct-route boundaries and mobile layout without console errors. Windows-only segment filename aliases were confined to disposable output; the release uses the existing Linux Actions workflow.
- Editable Figma board: https://www.figma.com/design/BLVY5qMDJxEzar5xmZMzXo?node-id=3-75 . Four screens use product Noto Sans TC and semantic editable components.
