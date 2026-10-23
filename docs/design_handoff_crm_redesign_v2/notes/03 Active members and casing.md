# Assignment: Active members + name casing (fix request)

Design reference: `CRM Desktop.dc.html` › 06c Assignment (Active members).

## Casing: one rule everywhere
- **Names of people and teams use Title Case:** "Anthony Lee", "Team Anthony", "Harm Hao Hong Hector". Data often comes in as ALL CAPS ("ANTHONY", "Team ANTHONY"), so format it for display: `name.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase())`. Leave Chinese text unchanged.
- **UI labels use sentence case:** "Active members", "Full time lead allocation", "Locked".
- **ALL CAPS is kept only for** table column headers and small section labels (11px, letter-spacing 0.06em). These already exist in the design.
- Apply this to every CRM page: Inbox, Contacts, Calendar, Assignment, Insight teams table.

## Team header
- **Text:** team name in ink `#422315`, `15px` Inter Tight 500. **Do not colour the text** with the team colour: orange and amber on white fail contrast.
- **Team colour:** shown only as a 10px dot before the name.
- **Right side:** a 56×4 progress bar (rust) plus "**3**/5 active".
- **Team naming:** a team is always "Team {leader first name}". The Revenue Director group is "Revenue Director".

## Layout
- **Summary strip at the top:** cream `#FCEEE2`, showing "**12** active · get new leads | **7** locked · no new leads for now".
- **Team cards:** in 2 columns (CSS columns, `break-inside: avoid`) to use the full width. The list scrolls inside the page.
- **Each row:** 32px initials avatar · name (14px 500) + title (12px muted) · a "Locked" pill with a lock icon (only when off) · toggle.
- **Toggle:** on = rust `#BD4A19`, off = `#E2D8D0`, 36×20.
- **Locked row:** the avatar goes grey `#F2EEEB` and the name becomes muted. Drop the red "Locked · no new leads" subtitle; the pill already says it.
