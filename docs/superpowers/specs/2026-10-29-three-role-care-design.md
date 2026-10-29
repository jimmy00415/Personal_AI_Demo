# Three roles, one coordinated care experience

User request: improve CareMate with Figma UI/UX, let people choose patient, family or caregiver at login, and make each role's primary functions obvious. User explicitly requests autonomous deep planning and execution.

## Experience

Use one accessible design system: Noto Sans TC, 8px spacing rhythm, soft neutral canvas, white bordered cards, teal patient accents, indigo family accents, blue caregiver accents and amber attention states. Role selection uses three descriptive radio cards in the login dialog. Keep frontend-only sample login and guest access. Allow a clearly labelled role preview/switch from the header and settings; never imply that choosing a role grants real access.

- Patient: AI check-in, actual seeded medication reminder times, own health records, explicit sharing controls. Preserve the existing dizziness/brief/booking flow and emergency UI.
- Family: a shared-care overview, consent-aware sample health data and a separate abnormal-reminder inbox with acknowledge/reopen actions. Do not show patient-only AI or own-medication actions as the primary navigation.
- Caregiver: shared-care overview and reminders plus a dedicated checklist with completion, undo, progress and recipient context. Do not equate checking an item with medication administration, a clinic response or successful contact.

Primary navigation: Patient = Today / Health / Follow-up / Sharing; Family = Overview / Shared health / Alerts / Settings; Caregiver = Overview / Shared health / Alerts / Care checklist. Existing patient routes remain available, but a nonpatient visiting a patient-only page receives a role-appropriate route notice rather than ambiguous patient controls. Shared records and alerts follow explicit demo grants; revoking sharing removes corresponding metrics, alerts and checklist items. Use browser-local state only; no real notifications, clinical diagnosis or contact sends.

## State and implementation boundaries

Add AppRole (`patient|family|caregiver`) separately from Person.role. Keep account/role state in the session account store and use a separate persisted care-workspace store for demo grants, alert acknowledgements and caregiver checklist completion. Retain the existing patient store as the source of the scenario clock and care records. A role-aware home dispatches to the existing patient Today page or the new supporter dashboard. New static routes: /shared, /alerts, /checklist, /sharing. Frontend role guards clarify unsupported direct routes. No backend or dependency additions.

Older saved demo accounts migrate to patient; guests retain patient preview until choosing a role. Explicit role radio labels show both role name and key tasks. Account logout resets role to patient preview. Session role survives refresh. No passwords in store or network.

## Accessibility and evidence

Native modal with focus management, labelled role radio group, keyboard navigation, descriptive chart labels, status text alongside colors, ample touch targets, live completion status. Larger text must increase headings, card/body labels, inputs and buttons, rather than only inherited body text. Convert typography to rem, use root 19px in large-text mode, validate at 320/390/768/1440 widths and both languages.

Create editable Figma screens in file BLVY5qMDJxEzar5xmZMzXo. Validate screenshots plus actual browser behavior, full existing regressions, lint/type checks and static export. Preserve old untracked docs/output/tmp. Continue the existing authorized commit/push/GitHub Pages release workflow after verification.
