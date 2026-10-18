# CRM redesign — instructions for Claude Code

You are implementing a visual redesign of the HOUZS CRM (desktop + phone) in this codebase. This file is your entry point. Follow it exactly.

## Older handoffs
Other `design_handoff_crm_*` folders next to this one (e.g. `design_handoff_crm_desktop_v2`, `design_handoff_crm_roles`) are earlier work. Where they conflict with this folder on colour, type or layout, **this folder wins**. For behaviour and data, keep what the codebase does today.

## Source of truth
1. `CRM Redesign dev changes.md` — the numbered list of changes. **This is the work.** Do nothing that is not on it.
2. `README.md` — the design tokens and the screen-by-screen spec, which say how each change should look.
3. `CRM Desktop.dc.html`, `CRM Phone.dc.html` — visual references. Open them in a browser to compare. They are prototypes, **not code to copy**: don't import them, don't port their inline styles, and don't add `support.js` to the app.

## Ground rules
- Rebuild with this codebase's existing components, styles, routing and data layer.
- **Keep every existing feature and behaviour.** These designs were made from a written brief, not from the production screens. If production has something the designs don't show (extra table columns, filters, menu items, settings), keep it and apply the new styling to it.
- **No new data, no new API calls, no new database fields.** If a change seems to need one, stop and ask.
- Put colours in one place: the codebase's theme or token file, if it has one. Otherwise create a single tokens file. Use the token names from the README table. No raw hex values in components.
- Don't change copy except where the change list says so.
- Phone sizes in the README are final on-screen px. If the app scales type with `--rv-type: 0.92`, divide by 0.92 to get the token value.

## Workflow
### Step 0 — Map (no edits)
Explore the codebase. Write `SCREEN_MAP.md` in this folder with a table: screen id (01–11, 02b, 02c, M01–M14, T01–T07) → route → main component file(s). Also record where the colours and fonts are defined today. Then stop and show the map to the user.

### Step 1 — Tokens (change-list items 1–8)
Add or replace the colour tokens, status ramp, team colours, avatar tints and type settings. Swap the old values (`#FBF7F3`, `#3F2B22`, `#806B60`) for the new tokens everywhere. Stop and report.

### Step 2 — Desktop (items 9–15)
Do one item at a time. After each item, list the files changed and how to check its acceptance line against the matching frame in `CRM Desktop.dc.html`.

### Step 3 — Phone (items 16–20)
Same as Step 2, checking against `CRM Phone.dc.html`.

### Step 4 — Confirm decisions (items 21–28)
These are decisions the owner already made. Check that each one still holds after your changes. Fix only what broke.

### Step 5 — Final check
Write `CHECKLIST.md` in this folder with every change-list item (1–28) and its acceptance line, marked ✅ done, ⚠️ partial (say why) or ❌ not done (say why).

## When unsure
Ask the user rather than guess. This applies especially to anything that would remove a feature, change data or change behaviour.
