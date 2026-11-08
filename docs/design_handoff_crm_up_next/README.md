# Handoff: CRM › Insight › Up next (who gets the next ad lead)

## Overview
A new sub-tab **Up next** on the CRM's **Insight** page (beside Team performance · Ads performance), for the Principal, the Revenue Director and team leaders (scoped to their own line). It shows who THE DEALER will give the next ad lead to, the order after that, who is in today's turn and who is not (and why), upcoming leave, and lets the viewer **Skip**, **Pause / Resume**, **Give to…** (pin the next lead), and mark **leave** (date + time + reason).

Repo: `wenwei4046/Venture-Portal`. Desktop target: `src/components/member/crm/desk/` (Insight = `vm/insight.ts`, `insTabs`; frame `Desk4a.tsx`). Phone target: Control panel Overview (`panel/`). Rules: `.claude/rules/revenue/crm.md` › THE DEALER, Full time days, locked people.

## About the design files
`CRM Up Next v3.dc.html` is a **design reference built in HTML** (open it in a browser next to `support.js`). It shows the intended look and behaviour with sample data and a simulated dealer. Do **not** ship the HTML — rebuild it in the CRM's existing React code, tokens (`--crm-*` in `src/app/globals.css`) and generator patterns, and drive it from the real dealer, Assignment rules and `crm_events`.

## Fidelity
**High-fidelity.** Colours, type, spacing and copy are final; they reuse the CRM 4a palette. Match them, mapping hex values to the existing `--crm-*` tokens.

## Screens

### Desktop (1440 × 900 frame; content area = viewport − 305 px sidebars)
Header row: `Insight` (Inter Tight 500 30px, −0.025em). Tab bar (Inter 500 13px, padding 10px 0, active = 2px #BD4A19 underline, inactive #A8968B): Team performance · Ads performance · **Up next**. Right end of the tab bar: **Ad dropdown** (34px high, 1px #E2D8D0, radius 7px, "Ad" in #A8968B + ad name + chevron). Hovering it shows a dark tooltip (#422315, white 12.5px, radius 10px, 280px) with the split line, e.g. `Split for this ad: Team Stanley 50% · Team Alvin 50% · set in Assignment` / for All ads: `Each ad keeps its own split from Assignment. This view adds them together.` Menu: 280px white, radius 10px, shadow 0 14px 36px rgba(42,22,12,.18); rows 38px, name + channel (11.5px #A8968B), current row bold on #F7F3EF.

Body padding 24px 36px 32px, column gap 32px.

**1. Top card** — background #F5F0EA, radius 12px, padding 24px, 2 equal columns, column gap 48px, 1px #ECE3DA divider at the middle.
- Left: label `NEXT LEAD` (Inter 500 11px, 0.06em, uppercase, #A8968B). Avatar 48px circle #fff with initials (Inter Tight 500 16px) + name (Inter Tight 500 26px, −0.02em) + optional chip `Set by you` (20px, radius 10px, #FDE3D2 / #8A1F0A 11px 600). Under the name: team dot 7px + team name (13px #7A6255). **On hover of the name block the team line swaps to the short reason** (same style), e.g. `Team Alvin · 30% · last lead 6 h ago` / `Team Stanley · 40% · 2nd in team` / `Team Stanley · set by you`.
  Buttons (34px, radius 7px, Inter 500 13px): `Skip` and `Pause` (white, 1px #E2D8D0); when pinned only `Undo`; `Give to…` (#BD4A19 / #fff, hover #A33F14) opens the picker below it.
  Bottom of the column (top border #ECE3DA, padding-top 12px): `Last lead STANLEY · Team Stanley · 3 h ago · Raya Promo` (12.5px #A8968B, name 500 #7A6255; ad name only on All ads).
- Right: label `AFTER THAT`. Rows 44px, top border #ECE3DA, grid `44px 7px 150px 1fr auto`, gap 10px: `#2` (Inter Tight 600 12px #A8968B) · team dot · name (500) · team (12px #A8968B) · hover-only actions `Make next` (#BD4A19) `Skip` `Pause` (#7A6255, 500 12px). Shows #2–#4; then `6 more ⌄` (rust 12.5px) expands to #10, `Show less` collapses. Native title on each row = reason.
- Give to… picker: 260px menu, groups `IN TODAY'S TURN` then `OUTSIDE THIS AD` (10.5px uppercase #A8968B headers), rows 36px: dot · name · team (11px #A8968B). Locked, not-Full-time-today, paused and on-leave people are not listed.

**2. Lower grid** — same 2 columns / 48px gap as the card, inset 24px so edges line up with the card's content.
- Left `In today's turn` + count chip (20px, radius 10px, #F7F3EF/#7A6255 600 11px). Heading Inter Tight 500 17px. Rows 44px, top border #F0EAE4, grid `44px 7px 150px 1fr`: `#1` (or `10+`) · dot · name · `Team Stanley · 1 d ago` (12px #A8968B). On row hover the team text is **replaced** by `Skip · Pause · Leave` (not overlaid). Sorted by position in the queue.
- Right `Not in turn` + count. Same grid, colour #A8968B: `—` · hollow dot (1.5px border team colour) · name · short reason. Reasons: `paused` (+ `Resume` link, rust, always visible), `no CRM login`, `not Full time today`, `team not on this ad` (single ad only), `Sick leave · 5 Nov 09:00 – 8 Nov 18:00` (hover swaps to `Edit · End leave`). Paused and on-leave listed first.
- Below it `Upcoming leave` + count. Rows: start day (`9 Nov`) · team dot · name · `Annual leave · 9 Nov 09:00–13:00`; hover swaps to `Edit · Cancel leave`. Empty: `No leave coming up`.

**Leave modal** (desktop 400px, radius 12px, padding 22px, shadow 0 20px 50px rgba(42,22,12,.25), scrim rgba(42,22,12,.32)): title `{NAME} on leave` (Inter Tight 500 18px). Reason chips 34px radius 17px: Annual · Sick · Training · Other (selected #422315/#fff). Other shows a text input `Write the reason`; the typed text becomes the label. From / To stacked, each = date input + time select (00:00–23:30, 30 min steps), 40px, radius 8px. Cancel / Save (#BD4A19). To can't be before From (From change pushes To).

**Toast**: bottom centre, #422315/#fff 13px, radius 10px, 2.6 s. Copy: `{NAME} skipped · next lead goes to {NEXT}` · `{NAME} paused · resume from Not in turn` · `{NAME} is back in {TEAM}'s turn` · `Next ad lead goes to {NAME}` · `Back to the split as set in Assignment` · `{NAME} on leave {range}` · `{NAME}'s leave cancelled`.

Clicking any blank area closes open menus.

### Phone (390 × 844, bottom nav 62px as the existing Control panel)
Top to bottom, padding 18px 20px, gap 16px:
1. Segmented `Team · Ads · Up next` (bg #F7F3EF, radius 20px, active white pill + shadow 0 1px 2px rgba(42,22,12,.12)).
2. Ad dropdown full width: 44px, radius 12px, bg #F7F3EF, name + chevron; menu below, rows 44px.
3. **Next card** — bg #422315, radius 14px, padding 14px 16px, white text: `Last lead STANLEY · 3 h ago` (11.5px #CDB7A8, name #fff 600) · avatar 48px rgba(255,255,255,.18) + `Next`-less name Inter Tight 500 22px + `Team Stanley · next lead` (12px #E8D9CE) with the team dot in a 14px white circle · buttons row `Skip | Pause | Give to…` (44px, radius 12px; Skip/Pause rgba(255,255,255,.12) white text; Give to… #BD4A19). Pinned: `Set by you` chip rgba(255,191,150,.22)/#FFD9BF and a full-width `Undo`.
4. After the card (light, no box): #2–#4 rows 46px, bottom border #EEE8E3: `#2` · name · dot + short team (`Stanley`, 11.5px #8A7466); then `6 more ⌄` centred.
5. Segmented list tabs `In turn n · Not in turn n · Leave n` (bg #F7F3EF radius 12px, active white). One list at a time, rows 48px single line:
   - In turn: `#1` · dot · name · `1 d ago`; tap → person sheet.
   - Not in turn: blank · hollow dot · name · reason (`not Full time`, `no CRM login`, `Sick · to 8 Nov`) · `Resume` / `Edit`.
   - Leave: start day · dot · name · `Annual · to 10 Nov` (same-day: `Annual · 09:00–13:00`); tap → edit.
6. **Person sheet** (bottom sheet, radius 26px top): avatar, name, `Team · #k in line`, reason box (#F7F3EF), `Give them the next lead` (48px rust), `Skip this turn` / `Pause`, `Mark on leave`. Give-to sheet: list grouped like desktop. Leave sheet: same fields, From/To stacked, Cancel/Save full width.

## Behaviour / rules (must come from the real dealer)
- **Queue**: the dealer picks the team by the ad's split (Assignment › Ads to teams; All ads = each ad's own split combined), then the person inside the team by "longest without a lead". Only people ticked for Full time today, not locked, not paused, not on leave count. The design simulates this; replace with the dealer's real function so the screen and the dealing never disagree.
- **Skip** = this one lead goes to the next person; the skipped person keeps their place for later turns (not "move to end of team").
- **Pause** = no ad leads until Resume (sick, training…). Persist per person.
- **Give to…** = pin the next lead to one person for one lead; then the split carries on. `Undo` clears the pin. Changing the ad clears pins and skips.
- **Leave** = from/to with time + reason (+ note for Other). A person is out when NOW is inside the range; future leave is listed under Upcoming leave and they still get leads today. Leave and Full time are owned by Assignment › People (see `CRM Assignment People.dc.html` in the design project); Up next's Leave opens the same editor and writes the same records.
- **Scope**: Principal / Director see all teams; a TL / STL / TA sees only their own line; salespeople don't see this tab.
- Every action writes an audit event (`crm_events`, area Assignment) with who / when / before → after.

## State
`ad` (all | ad id) · `pinned` (person id | null) · `skipped` (ids, cleared when a lead is dealt or ad changes) · `paused` (ids) · `leave` ({who, from, to, reason, note}[]) · UI: `more` (expanded after-that), menu/picker/sheet/modal open flags, hover row, phone list tab (`in | off | up`). Real data: dealer queue, last dealt lead (who, when, ad), each person's last lead time, Full time days, locked flag.

## Design tokens used
Ink #422315 · ink-soft #5A4034 · muted #7A6255 · faint #A8968B / phone lists #8A7466 · rust #BD4A19 (hover #A33F14) · orange #EE5E08 · amber #FFA91F · oxblood #8A1F0A · card #F5F0EA · field #F7F3EF · rule #EEE8E3 / #F0EAE4 / #ECE3DA · line #E2D8D0 · tint-attention #FDE3D2 · espresso card text #CDB7A8 / #E8D9CE. Team colours: Revenue Director #422315, Team Stanley #EE5E08, Team Alvin #FFA91F, Team Anthony #8A1F0A (use the CRM's real team colours).
Type: Inter (UI), Inter Tight (titles, numbers). Radii 7 / 10 / 12 / 14 px, chips 9–11 px. Shadow menus 0 14px 36px rgba(42,22,12,.18).

## Files
- `CRM Up Next v3.dc.html` — the design (desktop left, phone right). Needs `support.js` beside it.
- Related, not part of this release: `CRM Assignment People.dc.html` (leave calendar), `CRM Navigation Audit.dc.html`, `CRM Lead Log & Person Report.dc.html`, `CRM fixes for code.md` (voice notes, custom dates).
