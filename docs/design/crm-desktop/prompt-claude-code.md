# Prompt for Claude Code (when the design comes back)

First put Claude Design's export in `docs/design/crm-desktop-rev1/` (the `.dc.html` in `prototypes/`, the change list
beside it). Then paste everything below the line into Claude Code, opened in `Venture-Portal`.

---

Apply the CRM desktop design that came back from Claude Design: `docs/design/crm-desktop-rev1/CRM Desktop rev 1 dev
changes.md`, with the prototype in `docs/design/crm-desktop-rev1/prototypes/`. The change list wins where the
prototype differs.

Before you start:
- Read `CLAUDE.md`, `.claude/rules/revenue/crm.md` (especially **THE CRM ON A COMPUTER**, the permissions — CRM ·
  View / Edit / Manage — and "rewrite a CRM function from production's body"), and `docs/design/crm-desktop/design-brief.md`
  (what the design was told).
- Work on a new branch from the latest `main` (or on `crm-desktop` if it is not merged yet). Never on `main`.
- List every item marked **NEW DATA**, and every item that needs a database change, as a proposal, and **wait for my
  approval** before writing any migration.
- List every item marked **phone too** and tell me which phone screens change before you change them.

How to build it:
- The desktop shares the phone's data, writes and permissions — no second read or write path. Desktop pages read the
  phone's view models (`crm/panel/vm/*.ts`, `crm/sales/vm/*.ts`); desktop-only logic goes in `panel/desk/vm.ts`
  (and `sales/desk/vm.ts` for the salesperson), with tests.
- The frame is `crm/desk/DeskShell.tsx` + `desk.module.css`; the Control panel's pages are `crm/panel/desk/`; build
  the salesperson desktop in `crm/sales/desk/` on the same frame, switched on in `CrmApp` where the Control panel's is
  (`desk`), and keep the phone exactly as it is.
- Screens inside the side pane are the phone's generated screens: change them only through their generator's patches
  (`tools/crm-design/`), never by editing the generated `.tsx`.
- Check each screen at 1440 × 900 and 1280 × 800 with `node tools/crm-design/capture-desktop.mjs <outDir>` against
  the prototype's frames, and show me the screenshots. Run the CRM and Revenue app tests, type check and lint.
- Write the new decisions into `.claude/rules/revenue/crm.md` (dated), then open a PR.
