# CRM handoff · rev 1010 (RS / Sales template) + rev 1011 (Control panel)

> **Must-do before release:** iPhone safe areas. Nothing in the CRM may sit under the camera / Dynamic Island, status bar or home indicator, on any screen, sheet or overlay. Spec: `rev1011/Control Panel rev 1011 dev changes.md` › "MUST · iPhone safe areas". Test on a real iPhone (Safari + Home-screen app, portrait + landscape).

Put this whole `handoff/` folder in the repo at `docs/design/`, so you get `docs/design/rev1010/` and `docs/design/rev1011/`. Then open Claude Code in Venture-Portal and paste the prompt below.

## Contents
- `rev1010/RS rev 1010 dev changes.md`: the Sales CRM (RS template) change list, sections 1–7. Section 7 holds what the Control panel round added for RS. **5.2 is replaced by 7.3.**
- `rev1010/prototypes/`: RS screens. Open `rev 1010.dc.html` to see them all.
- `rev1011/Control Panel rev 1011 dev changes.md`: the Control panel change list (Principal, Director, leaders).
- `rev1011/prototypes/`: open `rev 1011.dc.html`. Frames 1–5.5 are the Principal; D1–D3 the Director; L1–L4 a Team Leader (Team side).
- Prototypes run on demo data and don't navigate between files. **The change lists win** if a prototype differs.

## Prompt for Claude Code

```
Apply two design change lists to the CRM in Venture-Portal:
1. docs/design/rev1010/RS rev 1010 dev changes.md → src/components/member/crm/sales/ (and shared files it names)
2. docs/design/rev1011/Control Panel rev 1011 dev changes.md → src/components/member/crm/panel/ (and CrmApp.tsx, crm.module.css, shared files it names)

Rules:
- Do RS first (sections 1 → 7), then the Control panel, item by item in the order written. After each section run the tests and list the files you changed.
- The iPhone safe areas item is mandatory. Do it first, in crm/crm.module.css (.app and every bottom sheet / full-screen overlay), because every later screen depends on it.
- Use the values in the lists exactly (colours, sizes, copy). Do not restyle anything the lists don't mention.
- Prototypes in docs/design/*/prototypes/ are visual references only; the lists win when they differ.
- RS 5.2 (Team | Me) is replaced by RS 7.3 (Team | Mine). Do not build Team | Me.
- Move in the chat ⋮ menu: show only when the current role has an upline (vm/chat.ts `superior`). Do not hard-code Principal.
- Anything that needs storage or a database / RPC change (per-item notification read state, held leads "Over the limit", per-team inside modes for By team, Full time days overriding inside modes, Member work type write, cold lead templates table + Meta review, per-template on/off): propose the schema / SQL change first and wait for my OK before writing it.
- The lead dealer must stay in step in both places (SQL and crm-team.ts twin).
- Permissions: Assignment, Member work type, Showrooms, Cold lead templates and Ads Performance are CRM · Manage only (Principal, Director).
```

## Acceptance (quick pass on /member/preview)
**Everyone**
1. iPhone with Dynamic Island: back link, bell and titles fully below the status bar; bottom bar and send button above the home indicator.

**RS (rev 1010)**
2. Chat: WhatsApp-like background, own bubbles #FCD6B8, no "reply window" line, ⋮ closes on outside tap; Book visit slots show "N left / Full / Passed".
3. Calendar: any visit → Customer info → Open chat. Customer info: First contact and Last chat both `dd/mm/yyyy, h:mm am`.
4. Insight: Leads / Appointments / Upcoming lists (fixed height, End of list), back from info to list. **No Team | Me switch.**
5. Notifications: Unread | Read, Mark all as read, badges follow the unread count.
6. RS with no downline: no Team | Mine switch anywhere.

**Control panel (rev 1011)**
7. Principal: no Team | Mine switch. Back link and bell on one row.
8. Assignment: Ads to teams = Evenly · By team; inside each team Evenly / By % (default, auto-balances to 100) / By max (starts at 0); full By max team → Over the limit (inside Ads to teams, banner + list with Send to / chat); Full time days override every inside mode.
9. Calendar: Leads · Upcoming · Showed up open lists with back; Customer info has back.
10. Profile: Member work type (every team member, switch), Cold lead templates (per-template switch, only Approved can be on), Notifications Unread | Read.
11. Director: "Team | Mine" in the top bar of every page, both sides.
12. Team Leader (e.g. Kelvin Lee): Team shows only their downline; no Assignment tab; Profile has Notifications + View as only; can reply and book in a downline's chat.
