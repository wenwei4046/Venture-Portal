# Prompt for Claude Code (when the design comes back)

First put Claude Design's export in `docs/design/crm-redesign-rev1/` (the `.dc.html` in `prototypes/`, the change
list beside it). Then paste everything below the line into Claude Code, opened in `Venture-Portal`.

---

Apply the CRM redesign that came back from Claude Design: `docs/design/crm-redesign-rev1/CRM Redesign dev changes.md`,
with the prototype in `docs/design/crm-redesign-rev1/prototypes/`. The change list wins where the prototype differs.

Before you start:
- Read `CLAUDE.md`, `.claude/rules/revenue/crm.md` (all of it — every dated decision is the owner's), the Revenue app's
  `revenue-app.md` where the CRM meets it (the curtain, `onReady`, the house's label), and
  `docs/design/crm-redesign/design-brief.md` (what the design was told).
- Work on a new branch from the latest `main`, in a worktree. Never on `main`.
- List as proposals, and **wait for my approval**, before building: every item marked **NEW DATA** or needing a database
  change; every item marked **changes a decision in §6**; anything that would show a management screen (Manage) to
  somebody without it.

How to build it (as the CRM is built today):
- The phone screens are GENERATED from prototypes — the salesperson's by `tools/crm-design/gen-sales.cjs`, the Control
  panel's by `gen-panel-1011.cjs`, the composer by `gen-composer.cjs`; the desktop by `gen-desk.cjs`. Behaviour lives in
  the view models (`crm/sales/vm`, `crm/panel/vm`, `crm/desk/vm`), never in the generated `.tsx`. Decide with me whether
  the new prototype replaces the old ones as the generators' source (one change at a time, screen by screen), keeping
  every live-data patch that still applies.
- No second read or write path: the same `fetchCrmData`, `crmWrite`, actions and permissions.
- Keep the platform workarounds that are not visual: the keyboard fit (`ChatComposer.tsx`), the chat's end spacer, per-axis
  overscroll, the camera, the viewer, `useReadWhenSeen`, `onReady`, the house's `aria-label`.
- Check each screen against the prototype's frames: `node tools/crm-design/capture-redesign.mjs <outDir>` (phone 430 ×
  932, desktop 1440 × 900) and show me the screenshots side by side. Run the CRM and Revenue app tests, type check and
  lint.
- Write the new decisions into `.claude/rules/revenue/crm.md` (dated) and DESIGN.md's version index, then open a PR per
  part.
