# Handoff: CRM release (Up next · Team activity · Calendar · Assignment › People · Sidebar · fixes)

One package for all CRM changes designed in this project. Build order suggestion: 1) sidebar + shared leave/pause/Full time data model, 2) Assignment › People, 3) Calendar, 4) Up next (needs the real dealer), 5) Team activity, 6) bug fixes (any time).

All `.dc.html` files are **design references in HTML** (open in a browser with `support.js` beside them). Rebuild them in the CRM's existing React code and `--crm-*` tokens; do not ship the HTML. **High-fidelity**: colours, type, spacing and copy are final.

## Contents
- Part A – Insight › Up next
- Part B – Team activity · Calendar · Assignment › People · Sidebar navigation (shared frame, rules, tokens, sample data to replace)
- Part C – Code fixes: voice playback, Custom dates (`fixes/voice-and-dates.md`)

## Files
- `designs/CRM Up Next v3.dc.html`
- `designs/CRM Team Activity.dc.html`
- `designs/CRM Calendar.dc.html`
- `designs/CRM Assignment People.dc.html`
- `designs/CRM Navigation Audit.dc.html`
- `designs/support.js` (needed to open the designs)
- `fixes/voice-and-dates.md`
- `screenshots/` – 01–02 Up next, 03–04 Team activity, 05–06 Calendar, 07–08 Assignment › People, 09 navigation (desktop + phone each)

---

# Part A – Insight › Up next

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


---

# Part B – Team activity · Calendar · Assignment › People · Sidebar

## Overview
Four related changes to the CRM, following the Up next handoff (`design_handoff_crm_up_next`):
1. **Team activity** – new sidebar page. Per person: leads, average first-reply time, customers waiting, appointments, show-ups. Waiting is flagged by the CRM's reply thresholds. Expand a person to see their leads, then open one lead's timeline. Replaces the person report pop-up.
2. **Calendar** – the existing Calendar now shows appointments and leave together; either layer can be switched off (at least one stays on). Month and Week views.
3. **Assignment › People** – one tab replacing Active members, Member work type and Full time lead allocation (person level). Full time days, Pause and leave per person on one calendar.
4. **Sidebar navigation** – 13 pages in 4 groups. Duplicate pages merged.

Repo: `wenwei4046/Venture-Portal`. Desktop: `src/components/member/crm/desk/` (frame `Desk4a.tsx`). Phone: Control panel (`panel/`). Rules: `.claude/rules/revenue/crm.md` (THE DEALER, Full time days, locked people, reply thresholds).

## About the design files
The `.dc.html` files are **design references built in HTML**. Open them in a browser with `support.js` in the same folder. They show the intended look and behaviour with sample data. Do **not** ship the HTML. Rebuild in the CRM's existing React code, `--crm-*` tokens (`src/app/globals.css`) and patterns, and drive everything from real data.

## Fidelity
**High-fidelity.** Colours, type, spacing and copy are final and reuse the CRM 4a palette. Map hex values to existing `--crm-*` tokens.

## Shared frame (all desktop screens)
1440 × 900. Rail 68px (#422315, active icon 44×38 radius 7 #BD4A19). CRM sidebar 237px (#FBF4EC, right border #F0E2D4, padding 24px 12px 18px; title `CRM` Inter Tight 500 22px; items 36px, radius 7, Inter 14px, icon 16px, gap 11px; active = bg #EFE6DD, weight 500, 2px #EE5E08 bar at left −12px; group heads Inter 500 10px, 0.14em, #A8968B, padding 20px 10px 6px). Header 56px, border-bottom #EEE8E3, padding 0 36px. Content starts at x = 305. Page title Inter Tight 500 30px, −0.025em, padding 26px 36px.

Phone: 390 × 844, status bar 46px, content padding 6px 20px 24px, bottom nav 64px (5 items, icon 20px, label 10.5px; active #BD4A19 600, others #A8968B 500). Page title Inter Tight 500 26px. Sheets: radius 26px top, handle 36×4 #E2D8D0, scrim rgba(42,22,12,.32).

---

## 1. Team activity (`CRM Team Activity.dc.html`)

### Desktop
**Title row**: `Team activity` + live dot (7px #2F8A57, ring 0 0 0 3px rgba(47,138,87,.18)) + current time `18:02` (12.5px #7A6255). Updates every minute.

Right side:
- **Who dropdown** (36px, min 200px, radius 7, 1px #E2D8D0): `Everyone` / a team (with team dot) / a person (name + role in 12px #A8968B). Menu 280px, max 520px, radius 10, shadow 0 14px 36px rgba(42,22,12,.18). Order: Everyone, then each team (600, 38px, top border #F0EAE4) followed by its members (indented 25px, role on the right).
- **Period segmented**: Today · Week · Month · Custom (bg #F7F3EF radius 9 padding 3; items 30px, 12.5px 500; active white + shadow 0 1px 2px rgba(42,22,12,.12)). Custom shows two date inputs below (36px). Changing From pushes To forward if To is earlier.

**Summary strip** (bg #F5F0EA, radius 12, padding 20px 0, 5 equal columns, divider #EBD6C3): Leads · Avg reply · Waiting · Appt · Show-up. Label 12px 500 #7A6255; value Inter Tight 500 32px −0.03em. `Waiting` turns #BD4A19 if anyone is past a threshold.

**Table** columns `240px repeat(5, minmax(0,1fr))`, gap 12px. Head 38px, sticky, Inter 500 11px uppercase 0.06em #A8968B, right-aligned except name. Click a head to sort: asc → desc → off (arrow ↑/↓, active head #422315).
Person row 48px, top border #F0EAE4, hover #FBF7F3, tabular numbers:
- chevron (rotates 90° open, .15s) · team dot 8px · NAME 500. People not in today's turn show the reason under the name (11.5px #A8968B: `Not Full time`, `Sick leave`, `No CRM login`) and the name in #A8968B; with 0 leads the row is at 55% opacity.
- Leads (600) · Avg reply (coloured by threshold) · Waiting = longest current wait, coloured, or `—` (#C4B5AB) · Appt · Show-up.
Expanded: one 34px line per lead, newest first, 12.5px #8A7466: time got (Inter Tight 600 12px) · customer (#422315) · status (Handed away / Appointment / Follow up / New, coloured) · first reply time · waiting time (if not yet replied, coloured). Empty: `No leads in this period`. Click a lead → drawer.

**Lead drawer** (right, 400px, shadow −16px 0 40px rgba(42,22,12,.16), scrim rgba(42,22,12,.12) over content only): customer name (Inter Tight 500 20px) + ad name; 3 facts Got · First reply · Now with; vertical timeline (time column 44px, dot 9px, line #EEE8E3): `Got by NAME` (ad · auto) → `First reply · 7m` (green) or `No reply · 3h 12m` (threshold colour) → `Moved to NAME` (by who) → `Appointment booked` (date/time) → `Showed up`. Footer button `Open chat` (42px #BD4A19).

### Phone
Title + live time. Row: Who pill (40px radius 20 bg #F7F3EF, opens bottom sheet with the same list, rows 44/48px) + Period native select pill. Custom → two date inputs (44px). 5 tiles in one row (value Inter Tight 22px, label 11px; `Show-up` shown as `Came`). Table columns `1fr 36px 44px 56px 36px 38px`, head 10.5px uppercase: Leads · Avg · Wait · Appt · Came. Rows ≥50px. Tap → expand leads (time · customer · `waiting 3h 12m` / `7m reply`). Tap a lead → bottom sheet with the same facts, timeline and `Open chat` (48px). Bottom nav: Insight · Inbox · **Activity** · Calendar · More.

### Rules
- Waiting thresholds from `crm_settings` (`reply_soon_h` 3 h → `Reply soon` #B26B00; `reply_urgent_h` 6 h → `Urgent` #BD4A19; `reply_overdue_h` 9 h → `Overdue` #8A1F0A). Under 3 h: normal ink (#7A4A00 in the expanded list).
- Avg reply = mean of first replies in the period. Waiting counts only leads with no first reply yet, measured to now.
- A handed-over lead counts for the person who got it (status `Handed away`) and appears for the receiver as `from NAME`.
- Scope: Principal / Director all teams; TL / STL / TA own line only; salespeople don't see the page.
- Clicking a salesperson's name in Inbox opens this page filtered to them (the old person report pop-up is removed).

---

## 2. Calendar (`CRM Calendar.dc.html`)

### Desktop
Title row right: two **layer toggles** (34px radius 17; on = white, 1px #E2D8D0, checkbox 16px #422315 with white tick; off = #F7F3EF, #7A6255, empty box border #C4B5AB): `Appointments n` · `Leave n` (n = count in the shown month). Turning off the last one switches to the other.
Toolbar: Month | Week segmented · ‹ › (34px, 1px #E2D8D0) · label (Inter Tight 500 18px: `November 2026` / `2–8 Nov 2026`) · `This month` / `This week` link (rust) when not current · legend (Appt green dot, Full time #F3ECE5, Annual / Sick / Training / Other swatches) · `+ Add leave` (34px #BD4A19). Leave legend and button hide when Leave is off.

**Month**: 7 columns Mon–Sun, head 36px 11px uppercase. Cells fill height, border #F0EAE4, outside-month bg #FBF8F5, today number in a #BD4A19 pill. Leave chips 20px (11px 600) stay in a fixed lane per leave and join across days (no radius / negative margins at the joins); label only on the first day: `CHEA · Annual`. Appointments below: green dot 6px · time (600) · first name. Max 3 lines per cell, then `+n more`. Click empty cell → Add leave on that day; click chip → Edit.

**Week**: rows per team (team heading 38px, dot + name), person rows 48px: name (500, hover rust) + status (`Active`, `Paused`, `Sick leave`, `No CRM login`). 7 day cells: Full time day = #F3ECE5 block, leave = coloured block joined across days (`Annual`, single day adds ` · 14:00`), appointment = green dot + `11:00 Nur Aisyah` or `2 appts`. Paused/locked on a Full time day show `—`. Today's column #FBF7F3. Click name → person panel; click cell → add/edit leave.

**Person panel** (right 380px): avatar initials + name + `Team · status`; Full time days (7 toggles 36px radius 8, on #422315/#fff); Leave list (52px rows: swatch · reason · `now / upcoming / past` · range; Edit / Remove; past rows 50% opacity, not editable); `+ Add`; Ad leads: `Gets ad leads on Full time days` + Pause / Resume.

**Leave modal** (420px, radius 12, padding 22): `Add leave` / `Edit leave`; Person picker (dropdown with dot + team); Reason chips Annual · Sick · Training · Other (Other shows `Write the reason`); From and To = date + time select (00:00–23:30, 30 min). Cancel / Save. To can't be before From. Toast: `CHEA HUAN · Annual · 9 Nov 09:00 – 10 Nov 13:00` (2.4 s).

### Phone
Title + round `+` (40px rust, only when Leave on). Layer toggles. Month label + `Today` + ‹ ›. Month grid: day 32px circle (selected #422315/#fff, today ring 1.5px #BD4A19), up to 2 leave-colour dots + green appointment dot. Below: selected day list (`Fri, 6 Nov`), rows 52px: time (or `All day` / `until`) · colour bar 4px · title (`JASON · Sick` or customer) · sub (range or `Appointment · NAME`). Tap leave → edit sheet. Empty: `Nothing this day`. Leave sheet: Person native select, reason chips 40px, From/To date + time (44px), Cancel / Save 48px.

---

## 3. Assignment › People (`CRM Assignment People.dc.html`)

### Desktop
Title `Assignment`, tabs: Ad split · Full time days · **People** (active 2px #BD4A19 underline). Same toolbar, Month/Week views, person panel and leave modal as Calendar, but **leave only** (no appointments, no layer toggles). Legend always shows Full time + 4 reasons.

### Phone
Title `People` + `+ Leave` pill (40px rust). Team groups; person rows 56px: name + one line — `Leads Mon–Fri`, `Leads Mon Tue Thu Fri Sat`, `No lead days`, `Paused` (rust), `No CRM login`, or `Sick · back 9 Nov` (reason colour) — + chevron. Tap → sheet: avatar/name/`Team · status`; **Every week** – `Days they get ad leads` (7 toggles 44px radius 10); Pause / Resume row; **Time off** – `No leads on these dates, even on their days` with leave rows (tap to edit) or `None`; `Add time off` (48px rust). Leave sheet title `Add leave · NAME`.

### Rules (Calendar + People + Up next share one data model)
- **One leave record** `{id, person_id, from (datetime), to (datetime), reason: annual|sick|training|other, note}`. Edited from Calendar, Assignment › People and Up next. All three write the same table.
- A person is out of the ad turn when now is inside a leave range, they are paused, locked (no CRM login), or today isn't one of their Full time days. The dealer must use the same check.
- Full time days = per person weekday set (Mon–Sun). Team-level rule stays in Full time lead allocation.
- Pause = no ad leads until Resume. Same flag as Up next's Pause.
- Who may edit: Principal / Director; TL / STL / TA with assign rights for their own line; otherwise read-only.
- Every change writes `crm_events` (area Assignment): who, when, before → after.

---

## 4. Sidebar navigation (`CRM Navigation Audit.dc.html`)
Final desktop sidebar, 13 pages in 4 groups:
- (no head) **Insight** (Team performance · Ads summary card → Ads Performance · Up next) · **Inbox** · **Contacts** · **Calendar** (appointments + leave) · **Team activity** (new)
- **MARKETING**: Ads Performance (the one full ad table) · Assignment (Ad split · Leads by ad · People)
- **REPORTS**: Reports (Ready-made · My reports – Workspace merged in)
- **MANAGEMENT**: Showrooms · Forms · Channels (Ads tab removed) · Settings (General · Replies & templates · Booking link · Notifications) · Audit log

Merges decided:
- Ad performance: Ads Performance is the only full table. Insight keeps a summary card; Assignment's pane shows only the picked ad with `Open in Ads Performance`; Reports keeps the export; Channels › Ads removed.
- Leads by ad: kept in Assignment (live) and Reports (period export), same columns and source.
- Audit log: sidebar is the only full log. In-page logs show the last 5 changes + `View all` (opens the sidebar log filtered to that area). The chat's own log stays.
- Workspace → Reports › My reports.
- Active members, Member work type, Full time lead allocation (person level) → Assignment › People.
- Quick replies, Cold lead templates, WhatsApp templates → Settings › Replies & templates (3 tabs). Channels › Templates links there; the WhatsApp template editor may need to stay under Channels for Meta approval.
- Person report pop-up removed → Team activity filtered to that person.

Phone Control panel (Principal / Director): **Insight (Overview) · Inbox · Activity · Calendar · More/Profile**. The Assignment tab is replaced by Activity; Assignment moves to Profile › Manage. Note: the People mock uses `Overview … Profile` labels and the others use `Insight … More` – use the app's existing labels.

Role summary: Director – same as Principal, scoped to their teams. TL / STL / TA – Insight gains Up next (own team); People read-only unless they can assign. Salesperson – no change.

---

## Design tokens
Ink #422315 · ink-soft #5A4034 · muted #7A6255 · faint #A8968B · list sub #8A7466 · disabled #C4B5AB · rust #BD4A19 (hover #A33F14) · orange #EE5E08 · amber #FFA91F · oxblood #8A1F0A · warn text #B26B00 · green #2F8A57 (dark #2F5A3C) · card #F5F0EA · field #F7F3EF · hover row #FBF7F3 · full-time block #F3ECE5 · sidebar #FBF4EC / active #EFE6DD · rules #EEE8E3 / #F0EAE4 / #EBD6C3 · line #E2D8D0.
Leave reasons (bg / text): Annual #FFE9C2 / #7A4A00 · Sick #FDE3D2 / #8A1F0A · Training #E6DDF3 / #4B2E7A · Other #E4ECE6 / #2F5A3C.
Teams (sample – use real team colours): Revenue Director #422315 · Team Stanley #EE5E08 · Team Alvin #FFA91F · Team Anthony #8A1F0A.
Type: Inter (UI), Inter Tight (titles, numbers). Radii 7 / 8 / 10 / 12 / 26 (sheets); pills 17–20. Shadows: menus 0 14px 36px rgba(42,22,12,.18); modals 0 20px 50px rgba(42,22,12,.25); drawers −16px 0 40px rgba(42,22,12,.14–.16).

## Sample data to replace
- Names, teams and roles (`Team Leader`, `Sales`, `Revenue Director`) – use real users and real job titles.
- Lead lists, reply times and statuses in Team activity.
- Timeline events: handover (`Moved to … by Principal`), appointment booked, showed up – currently invented times. Read from `crm_events` / appointment records.
- Appointments and leave records in Calendar / People.
- Fixed "now" (Fri 6 Nov 2026, 18:00) – use the real clock and timezone.


---

# Part C – Code fixes
Full text in `fixes/voice-and-dates.md`. Not yet confirmed live; verify after deploy.
