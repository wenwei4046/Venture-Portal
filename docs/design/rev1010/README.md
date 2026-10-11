# rev 1010 · Sales CRM (RS template) handoff

> Sent together with rev 1011 — use the combined prompt in `../README.md`.

> **Must-do:** avoid the iPhone camera / Dynamic Island, status bar and home indicator on every CRM screen (safe areas). See the top of `RS rev 1010 dev changes.md`.

Put this folder in the repo at `docs/design/rev1010/`, then open Claude Code in Venture-Portal and paste the prompt below.

## Contents
- `RS rev 1010 dev changes.md`: the change list (spec). Source of truth.
- `prototypes/`: clickable references. Open `prototypes/rev 1010.dc.html` in a browser to see every screen; each `RS *.dc.html` also opens on its own. They run on demo data and do not navigate between pages.

## Prompt for Claude Code

```
Apply docs/design/rev1010/RS rev 1010 dev changes.md to the Sales CRM in src/components/member/crm/sales/.

- Work section by section in order (1 Chat → 6 Notifications). After each section run the tests and tell me which files changed.
- Use the values in the list exactly (colours, sizes, copy). Do not restyle anything else.
- Use docs/design/rev1010/prototypes/ only as a visual reference; the list wins if they differ.
- Section 6 (per-item read state) needs storage: propose the table/column change first and wait for my OK.
- Section 1.5 Move: hide Move when `superior` is empty (vm/chat.ts). Do not hard-code Principal.
- Do not touch src/components/member/crm/panel/; that is a later round.
```

## Acceptance (quick pass on /member/preview)
1. Chat: WhatsApp-like background, own bubbles #FCD6B8, no "reply window" line, ⋮ closes on outside tap.
2. Principal in own chat: ⋮ shows Share · Customer info · Appointment (no Move). After Switch to: Move is back.
3. Calendar: any visit → Customer info → Open chat.
4. Customer info: First contact and Last chat both `dd/mm/yyyy, h:mm am`.
5. Insight: Leads / Appointments / Upcoming lists (fixed height, End of list), back from info to list. No Team | Me (replaced by Team | Mine, section 7.3).
6. Notifications: Unread | Read, Mark all as read, badges follow the unread count.
