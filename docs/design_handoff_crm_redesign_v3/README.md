# Handoff: HOUZS CRM redesign v3: desktop + phone (pixel-exact)

## Goal
Make the live Revenue app CRM look **exactly** like the two design files, with the same colours, spacing, type, radii, copy, column order and states:
- **Desktop (≥1024px):** `CRM Desktop.dc.html`
- **Phone:** `CRM Phone.dc.html` (frames M01–M14 = Mine, T01–T08 = Team, plus T04b)

v3 **replaces v2**: it contains v2's desktop frames unchanged, plus the phone changes below. It builds on v1 (`docs/design_handoff_crm_redesign/`, the "4a Espresso & White" design). Everything v3 doesn't mention stays as in v1 and production.

## How to read the design file
- Open either `.dc.html` file in a browser, with `support.js` and `icons/` next to it. It's a pan/zoom canvas, one fixed-size frame per page or state, each labelled with its number (e.g. "06b·2 Assignment").
- **Every style is inline.** To get an exact value, read the element's `style=""` in the file. **Copy the literal values** (px, hex, font shorthand, grid-template-columns). Don't approximate.
- Fonts: **Inter** (400/500/600) for text and **Inter Tight** (300–600) for titles, figures, initials and badges. Every number uses `font-variant-numeric: tabular-nums`.
- The data is demo data. Wire it to real queries.
- It's an HTML reference, not production code. Rebuild it with the app's own components, but the result must be visually identical.

## Acceptance (do this for every frame)
1. Render the production page at the frame's size (desktop 1440×900, or 1920×1080 for 02c; phone 430×932) with the same demo data.
2. Compare against the frame side by side, or as a screenshot overlay. Spacing, sizes, colours and text must match. Differences under 2px are acceptable only for font rendering.
3. **No overlap anywhere.** No text spills into the next cell or panel, and nothing is cut off by its container. At every column width (including while resizing) a cell's `scrollWidth ≤ clientWidth` or it ends with an ellipsis.
4. Check the states each frame shows: open, collapsed, selected, expanded, menu open.

## Desktop frames → what to build (CRM Desktop.dc.html)
| Frame | Page | What's new in v2 | Note |
|---|---|---|---|
| 01 | Insight · Team performance | Tabs **Team performance / Ads performance** below the title. The hero is sand `#F5F0EA` with a border instead of pink | 06 |
| 01b | Insight · Ads performance | Same body as 05 | 02 |
| 02 / 02b / 02c | Inbox | Selected row in sand with a rust bar; chat wall `#F7F3EF`; Audit log tinted `#FBF7F3` (header `#F5F0EA`); Audit log resizable 240–520; folded rails unified | 04, 06, 08 |
| 03 | Contacts | Breakdown donut removed; columns with minimum widths and no overlap; Selected rail with a collapse button | 01, 06, 08 |
| 03b | Contacts · Ad filter open | Filter menu: 2-line clamp, search, counts | 01 |
| 05 | Ads Performance | No period tabs, no info line, no footnote; palette metric cards; Appt rate shown as % only; 5 rows + pager (Show 5/10/20) | 02 |
| 06 | Assignment · Ads to teams | Split panel: decimal % inputs, sliders, aligned boxes, scrollable body, collapse button | 04 |
| 06b | Assignment · Leads by ad | One table card; Status filter; Team column; resizable columns; no panel by default | 04, 06 |
| 06b·2 | Leads by ad · member picked | Right panel with that member's leads; a customer row expands to show its details plus **Open chat** and **Customer info** | 04, 08 |
| 06b·3 | Leads by ad · panel collapsed | 44px rail | 08 |
| 06c | Assignment · Active members | Approvals-style table grouped by team; Title Case names; no Team column | 03 |
| 07 | Showrooms | Opening hours typed in, with **Apply to all** and per-day editing; Remarks (staff only); Delete showroom | 04 |
| 08 | Customer form | Form picker with Duplicate and Delete; one **Required** header; labels never crushed | 05 |
| 09b | Channels · Business profile | Drawer that writes the profile to WhatsApp and/or Facebook through the Meta APIs | 07 |
| 10 | Settings | Team inbox alerts and Send auto-reply unlocked. Reply window and Cold leads stay locked (set by Meta) | 05 |
| 12 | Reports · Ads performance | Same component as 05 | 02, 05 |
| 12b | Reports · Lead sources & status | KPI strip, full-width **By ad** table, 2×2 mini cards | 05 |
| 12c | Reports · Salespeople | Merged count·rate columns, team filter, First reply over 4 h in red, resize handles | 06 |
| 12c·2 | Salespeople · person picked | Right panel with their customers; Replied and First reply are hidden while the panel is open | 04, 08 |


## Phone frames → what to build (CRM Phone.dc.html)
The phone follows the same global rules as desktop (selected = sand, names in Title Case, team colour as a dot, no overlap, decimals).
| Frame | Page | What's new in v3 |
|---|---|---|
| all | Shared | Chat wall #F7F3EF; the Insight gradient is sand (no pink); selected chips and quotes #F5F0EA; the attach sheet uses one style (#F5F0EA circle, ink icon) |
| M Insight | Mine · Insight | Each Leads by status row has a chevron; tapping it opens Inbox filtered by that status |
| M10 | Mine · Calendar | Two-part cards: name/room on top, buttons below in equal widths. **Today** = green card (#EEF5F0, border #BFD9C8, 4px #387557 bar, TODAY tag, "in 2 h") with **Change · No show · Show up** (Show up green). Did they come = Change · No show · Show up. Upcoming = Change · Send reminder |
| M12 | Mine · Profile | "Back to Revenue app" row removed; profile icon tiles are solid rust #BD4A19 with a white icon |
| T01 | Team · Insight | Home icon top-right; **Team performance / Ads performance** switch; hero smaller (24px figures, 14px padding); rows read "Won 22%" (not W/L) and stay on one line |
| T03 | Team · Assignment | No "Edit split" buttons; the whole card is tappable (chevron). An unset ad shows a "Not set up" tag |
| T04 | Team · Split leads | Team rows: name ink + dot, ellipsis, 84px decimal box, slider under the row; the body scrolls. Member breakdown shows **results only** (name, bar, 40.5%) plus an **Adjust split** button |
| T04b | Adjust split sheet | Bottom sheet: Evenly / By % / By max; per person 88px decimal box + slider; fixed 14px lock slot; Total 100% ✓; Cancel / Apply. Keyboard-safe |
| T05 | Team · Calendar | Header like production: date-range button, team chips, Everyone dropdown + Month/List, dark summary card (Visits / Upcoming / Showed up / Show-up) with team bars. Team names Title Case, one line, 118px name column |
| T06/T08 | Team · Profile | Dark **View as a team member** card under the name (replaces the top pill); rust icon tiles |
| T07 | Showrooms | Delete is a trash icon in the header. Opening hours: All days + **Apply to all days**, then days grouped by the same hours (Mon – Thu 10:00 – 21:00 …), tap a group to edit single days. Weekly slots collapsed to one row (tap to open the grid). Remarks (staff only) |

Reports › Leads by ad uses the 06b table. Reports › Appointments & show-ups isn't redesigned yet, so apply the shared table and colour rules to it.

## Global rules (apply everywhere)
- **Selected / active:** on white use `#F5F0EA` plus a 2–3px rust `#BD4A19` left bar. The CRM nav active item is `#EFE6DD`. Expanded parent rows use `#FBF7F3`. Never use `#FCEEE2`, `#F3DFCC` or an orange bar to show selection.
- **Large summary blocks:** `#F5F0EA` with border `#ECE3DA` and dividers `#E6DCD2`.
- **Names:** Title Case for display ("Lim Yau Wei", "Team Stanley"). UI labels are sentence case. ALL CAPS only for 11px table headers.
- **Team colours:** shown as a dot only, never as text colour.
- **Tables:** header `#FBF4EC`, header text 11px/600 uppercase `#6F402C` with letter-spacing .06em, row dividers `#F4F0EC`, numbers right-aligned in Inter Tight.
- **Resizable columns and panels:** every one has minimum widths. When columns don't fit, scroll sideways with the first column sticky. Never overlap. Widths are saved per user. See note 06.
- **Collapsible panels:** every side panel has a › collapse button next to ✕ and folds to the shared 44px rail (`#FBF4EC`). See note 08.
- **Sliders and % inputs** stay in sync; decimals are allowed (0.1 when typing, 0.5 when dragging).

## Notes folder (read all of them, in order)
`notes/00` is the v1 README (tokens, base components). Notes `01`–`08` describe each v2 change with exact values, behaviour and backend needs. If a note and the HTML disagree, **the HTML wins for visuals** and **the note wins for behaviour**.

## Backend / data needed
- Showrooms: per-day hours, remarks, delete (blocked when visits are upcoming).
- Customer forms: several forms per org, one active; duplicate.
- Leads-by-ad per member per date range, shared by 06b, Insight and Reports.
- Meta profile write: `whatsapp_business_management` and `pages_manage_metadata`. Check whether writing the FB Page photo is supported.
- User preferences: column widths and panel collapsed state.
