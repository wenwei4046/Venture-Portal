# Handoff: HOUZS CRM redesign — desktop & phone (4a "Espresso & White")

## Overview
A visual redesign of the HOUZS Revenue team's CRM, the inbox and lead tool that lives inside the Revenue app. Customers arrive through Click-to-WhatsApp and Click-to-Messenger ads. The CRM holds every chat, who it is assigned to, its status, and the showroom visits booked from it. This handoff covers:

- **Desktop CRM** (Revenue app ≥ 1024 px): 11 pages plus 2 extra Inbox states.
- **Phone CRM**: **Mine** (salesperson, 14 screens) and **Team** (Principal / Revenue Director / leaders, 7 screens).

What each screen *does* is unchanged from production. The redesign changes the colour, type, hierarchy and density, plus the few behaviours listed in `CRM Redesign dev changes.md`.

## About the design files
The `.dc.html` files in this bundle are **design references built in HTML**: prototypes that show the intended look and behaviour. They are not production code to copy. Recreate them in the CRM's existing codebase (the Revenue app web app) using its components, routing and data layer. Each file opens directly in a browser; keep `support.js` and `icons/` next to it. Every screen is a fixed-size frame on a pan/zoom canvas.

**Important:** these designs were built from the written brief (`design-brief.md`), not from the production screenshots or HTML snapshots, which were never shared. Where production has controls the brief does not describe (e.g. extra table columns a manager has configured), **keep production's behaviour** and apply this visual language to it.

## Fidelity
**High-fidelity.** Final colours, type, spacing, radii and copy. Recreate the designs pixel-accurately with the codebase's own components. All sample data (names, ads, numbers) is demo data.

## Design tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| ink | `#422315` | All primary text, Revenue sidebar background, "came" visits, table header top rule |
| ink-soft | `#5A4034` | Secondary text, body copy in rows |
| muted | `#7A6255` | Labels, meta |
| faint | `#A8968B` | Placeholders, timestamps, column headers on white |
| faint-2 | `#CDBFB5` | Disabled, "—" cells, inactive chevrons |
| line | `#E2D8D0` | Control borders (inputs, outline buttons, round header buttons) |
| rule | `#EEE8E3` | Panel dividers |
| rule-soft | `#F4F0EC` | Row dividers |
| page | `#FFFFFF` | Page background |
| field | `#F7F3EF` | Search fields, inactive chips, segmented-control track |
| cream | `#FCEEE2` | Chat wall, selected row, default avatar, Insight hero (desktop) |
| cream-nav | `#FBF4EC` | Desktop CRM nav background, table header fill |
| cream-nav-active | `#F3DFCC` | Desktop CRM nav active item |
| rust (primary) | `#BD4A19` | Own chat bubble, primary buttons, mic/send, unread badges, active tab underline, active chips/segments (phone), bottom-bar active pill, Insight hero (phone), rate bars |
| orange (signal) | `#EE5E08` | Small marks: active-nav bar, selected-row left bar, unread dot, Attention status, "H" logo |
| amber | `#FFA91F` | Appointment status, "booked" visits, Team Hafiz, Assign swipe action |
| oxblood | `#8A1F0A` | Urgent/overdue **text**, "not set up", errors, Team Grace |
| brown | `#6F402C` | Follow up status, open showroom slots, Team Kavitha |
| WhatsApp | `#25D366` | WhatsApp channel icon/badge only |
| Messenger | `#0A7CFF` | Messenger channel icon/badge only |

Tints: Attention `#FDE3D2`, Appointment `#FFF0D1`, Follow up `#F1E3DA`, New `#EFE5DE`, Won `#F3EBE5`, Lost `#F2EEEB`, Cold `#F1EEEC`. Pale-orange buttons and strips use `#FDE3D2`. Audit-log panel `#F6E7D8` (border `#E3CDB8`).

**Contrast rule:** white text only on `#BD4A19` (about 4.9:1). Never put white text on `#EE5E08` or `#FFA91F`; use ink `#2A160C` on them. Urgent text uses oxblood, not orange.

**Status ramp** (dots and bars): New `#422315` · Attention `#EE5E08` · Follow up `#6F402C` · Appointment `#FFA91F` · Won `#C29C88` · Lost `#DCC6B8` · Cold leads `#EEE2D8`.
Status text colours on their tints: New ink, Attention `#8A1F0A`, Follow up `#6F402C`, Appointment `#7A4E00`, Won `#6F402C`, Lost/Cold `#7A6255`.

**Team colours** (fixed order, Director first): Revenue Director `#422315` · Team Priya `#EE5E08` · Team Hafiz `#FFA91F` · Team Grace `#8A1F0A` · Team Kavitha `#6F402C`. Teams added later continue with `#C29C88`, `#9A6B55`.

**Avatar tints** (initials avatars, chosen by a stable hash of the name): `#FCEEE2`/ink · `#FFF0D1`/`#7A4E00` · `#F1E3DA`/`#6F402C` · `#FDE3D2`/`#8A1F0A`.

### Type
- **Inter** for text (400 / 500 / 600). **Inter Tight** for titles, figures, initials and badges (300–600). No other faces.
- Figures use `font-variant-numeric: tabular-nums`.
- Phone sizes in the files are **final on-screen px**. Production applies `calc(Npx * var(--rv-type))` with `--rv-type: 0.92`, so divide by 0.92 for the token value if you keep that system.

| Role | Desktop | Phone |
|---|---|---|
| Page title | Inter Tight 500 30px, −0.025em | Inter Tight 500 30px, −0.025em |
| Hero figure | Inter Tight 500 42px, −0.035em, line-height 1 | Inter Tight 500 32–34px |
| Section title | Inter Tight 500 18px | Inter Tight 500 17px |
| Body / row | Inter 400 13–14px | Inter 400 14–15px |
| Row name | Inter 500–600 14px (600 when unread) | Inter 500–600 16px |
| Label / meta | Inter 400–500 11–12px | Inter 400–500 12px |
| Column header / kicker | Inter 500 10–11px, uppercase, 0.06–0.14em | same |
| Chat bubble | Inter 400 14px/1.45 | Inter 400 15px/1.42 |

### Radius, spacing, elevation
- Radii: controls 6–7px (desktop) · panels 10–12px · phone cards 14–20px · pills and round buttons fully round · bubbles `16 16 4 16` (own) / `16 16 16 4` (customer).
- Spacing: desktop page gutter 36px; phone gutter 20px (16px on lists of cards). Row heights: desktop table 46–54px, phone list ~74px. Round header buttons 40px. Bottom bar 86px.
- Shadows: frames only. Floating composer `0 4px 16px #2A160C1F` (phone) / `0 6px 20px #2A160C14` (desktop). Popovers and sheets `0 14px 36px #2A160C2E`. Nothing else casts a shadow; structure comes from hairlines.

## Desktop (`CRM Desktop.dc.html`, 1440 × 900)

### Frame, shared by every page
- **Revenue sidebar**, 216px, bg ink. "H" logo tile 30px orange with white "H" + "HOUZS" (Inter Tight 600 15px, 0.14em). Items 38px tall, 17px icon, Inter 500 14px `#CDB7A8`. Active item (CRM): bg rust, white text. Foot: module switch (outline `#FFFFFF1F`) + account (avatar 32px cream/ink, name, title).
- **CRM nav**, 212px, bg `#FBF4EC`, right border `#F0E2D4`. "CRM" Inter Tight 500 22px. Groups: Insight · Inbox · Contacts · Calendar / MARKETING Ads Performance · Assignment / MANAGEMENT Showrooms · Customer form · Channels · Settings · Audit log. Items 36px with a 16px icon. Active item: bg `#F3DFCC` plus a 2px orange bar at the nav's left edge. The Inbox unread count is a rust pill. Foot: "Back to Revenue app".
- **Top bar** 56px: "Good morning, Peter", then Fair view toggle, divider and date on the right. Bottom rule `#EEE8E3`.
- **Page head**: title, then optional underline tabs (13px; active = ink text + 2px rust underline) and a muted subtitle. On the right: **CRM alerts** (outline, orange dot + oxblood count) and the page's **primary button** (rust, white, 36px).
- **Tables**: header row bg `#FBF4EC`, 1px ink rule on top, column labels `#6F402C` uppercase 11px. The selected row is cream with a 2px orange left bar. Tables whose columns are configurable end with a **"+" column button** (24px, dashed rust border).

### Pages
1. **Insight** — Period tabs (Today · This week · This month · Custom) and "1–18 Oct vs 1–18 Sep". Hero: a cream panel (r 12) holding 6 metrics (Appt rate, Leads, Show-up, Reply 24 h, Avg. reply, Won). The first metric has an orange 20×2 mark and a rust value. Each delta reads "vs last"; bad deltas are oxblood. Below, in a 1.9fr / 1fr grid:
   - **Team performance** table: Director first, team dot, TL. An expanded team shows its people indented on `#FBF7F3`. The Appt rate column carries a 4px rust bar.
   - **Leads by status**: an 8px stacked bar plus a list.
2. **Inbox** — The rail shows one panel at a time (02 and 02b). Columns:
   - **List** (290px): Everyone ▾, search, status tabs with counts, rows.
   - **Chat** (flex): header with an Attention line in oxblood; cream wall; floating composer pill plus a 50px rust mic.
   - **Customer info** (260px): white, person icon.
   - **Audit-log strip** (44px, `#F6E7D8`) at the far right.
3. **Inbox · 02b** — Audit log open (290px, bg `#F6E7D8`, history icon): a timeline of this chat's events. Customer info folds to a 44px white strip. **02c (1920 × 1080)**: both panels open (see breakpoint rule below).
4. **Contacts** — Toolbar with search 210px and filters (Status, Ad, Team, Showroom). Table columns: Name+phone, Status pill, Ad, Assigned to, Visit, Added, "+". The "Add columns" popover lists every Customer-form field with a checkbox. Footer: "1–12 of 486 · Show 20 · 10 · 50" and pager. Right rail 264px: Breakdown donut (By status ▾) and the Selected customer card with Open chat / Customer info.
5. **Calendar** — Week view, 10 am – 8 pm rows at 59px. Today's date is a rust circle. Visit block styles: Came = ink fill; Booked = `#FFF0D1` + `#FFC75A` border; No-show = dashed `#A8968B`. Each block shows name / time / showroom on separate lines with ellipsis. Rail 248px: Visits, Came, No-show (oxblood), Still to come; By showroom bars; Upcoming today with **Send reminder** (rust) or **Reminder sent · Send again** (outline).
6. **Ads Performance** — An info line says cost waits for `ads_read`. Columns: Ad (channel icon + typed name + Meta headline), Leads ↓, Appts, Appt rate (bar), Show-up, Won, Won rate, Spend "—", Per lead "—", "+". A totals row sits under an ink rule. The primary button is Download PDF.
7. **Assignment** — Tabs: Ads to teams · Full time lead allocation · Member work type. The ad list shows a split bar in team colours; "Not named yet" ads are oxblood with a rust **Set up** button. The docked editor (460px) has tabs Split · Ad performance · Audit log:
   - Ad name typed in place (ink 1px border, pencil), with the Meta headline below.
   - Evenly | By team.
   - Team rows (Director first) with a % field. An expanded team shows Evenly / By % / By max and its members. Team Grace shows "Over the limit · holding 4 leads" in oxblood.
   - Total 100% ✓. Footer: **Save** + "Save and apply to all 14 ads".
8. **Showrooms** — Left column 400px: ‹ 1 / 2 › with a rust round +; name, address, Google Maps / Waze links; Visits per slot stepper; Closures (calendar-x icon in oxblood). Right: weekly slot grid, 24 rows × 7 days (open = brown, closed = `#F4F0EC`).
9. **Customer form** — Pages list (drag handles; active = cream), sections with field rows: drag handle, label + hint, type tag, Required toggle (rust when on). A phone live preview sits on the right (270 × 560, ink bezel).
10. **Channels** — **Grouped by phone number.** Each number is a card: a cream header with the number (Inter Tight 18px), its label and inbox route, and an Edit button. Under it sit one row per linked channel: WhatsApp Business (green icon) and Facebook Page / Messenger (blue icon).
    - States: Connected (brown dot, Manage); Expires in N days (orange dot, oxblood text, rust Reconnect); Not linked (grey, rust Link).
    - Right column: Message templates table (Approved / Pending / Rejected).
    - Primary button: **Add a number**.
11. **Settings** — Two-column groups: Reply targets (3 / 6 / 9 h+), Cold leads (24 h locked, move after 2 days, suggest template), Notifications ("Team inbox alerts" locked Off, per §6.10), New leads.
12. **Audit log** — Search + Everyone / All areas / Last 7 days. Columns: When, Who, Area, Change, Before → after (before struck through in faint, after in 500 weight), "+".

### Inbox breakpoint (new)
- **≥ 1680px wide**: Customer info and Audit log may both be open.
- **Below 1680px**: opening one folds the other to its 44px strip. A strip keeps its panel's background, so the two stay distinguishable when folded.

## Phone (`CRM Phone.dc.html`, 430 × 932)

### Shared
- Status bar 54px. **Bottom bar** 86px, white, top rule `#EEE8E3`. Each tab is a 22px icon in a 52×30 pill plus an 11px label. Active tab: rust pill, white icon, rust label 600. Badges: rust pill, 2px white ring.
  - Mine tabs: Inbox (unread) · Contacts · Calendar · Insight · Profile (notifications).
  - Team tabs: Insight · Inbox · Assignment · Calendar · Profile.
- Round header buttons are 40px (1px `#E2D8D0`). The Team | Mine pill has a `#FDE3D2` background and oxblood text.
- Chips are 32px pills. Active: rust background, white text, count `#F3CDBB`. Inactive: `#F7F3EF`. Segmented controls use the same treatment: active segment rust, white text.
- Channel badge on avatars: 18px circle, WhatsApp green / Messenger blue, white glyph, 2px white ring.

### Mine
- **M01 Inbox** — Title row: Inbox · Team|Mine (leaders only) · house · bell (orange dot). Then All ads ▾ + search, then status chips. Rows:
  - 48px avatar, name (600 when unread) and time (rust when unread), ad name, last message, rust unread pill.
  - Urgency line with an icon: Reply soon = ink · Urgent / Overdue = oxblood 600 · Visit = brown · Cold = faint.
- **M02** — Many rows, with one row swiped left: Assign (amber, ink text) and More (ink). **M03** — Empty Appointment filter: pale-orange icon circle, "No appointments yet", "See all chats".
- **M04 Chat** — Header (back, avatar, name, ad · channel, ⋮). A 34px strip below it in `#FDE3D2`: status + wait in oxblood, "Reply window · 18 h left" on the right.
  - Wall cream. Own bubbles rust with white text and `#F3CDBB` meta; customer bubbles white.
  - Album: 2×2 tiles, "+3". Voice note: ink play button, waveform, 0:24. Visit card: inside a rust bubble.
  - Composer floats with no background: a white pill (emoji, field, Attach, Camera) and a 52px rust mic.
- **M05** — Attach card (white, r 22) above the composer: Camera · Photos · Document · Quick replies · Auto replies, each on its own tint. **M06** — Typing: keyboard glyph, text, Send replaces mic; the emoji panel sits at keyboard height (316px).
- **M07** — Long-press menu: ink 45% scrim, reactions bar, lifted bubble, menu (Reply, Forward, Copy, Info, Star, Pin, **Delete for me** in oxblood; no unsend).
- **M08** — Cold chat: the strip turns grey, "Cold · no reply for 2 days / Window closed". The composer is replaced by a card (lock icon, explanation) with **Send template message** (rust, full width).
- **M09 Contacts** — Count, search, A–Z sections (letters in rust), status pills, index rail (letters present = rust).
- **M10 Calendar** — Month | List (active rust). Month grid: today is a rust circle; future visit dots orange, past dots sand. Below on `#FBF7F3`:
  - Today: Reminder sent · Send again.
  - Did they come?: **Came** (rust) / No-show.
  - Upcoming: **Send reminder**.
- **M11 Insight** — Month / Week / Day / Range. The hero is a **rust card**: 3 rates in white with an amber mark on the first. Counts row (Leads, Appointments, Upcoming), Avg. reply time, Leads by status.
- **M12 Profile** — Orange radial glow at the top, rust 88px avatar, cards: Notifications (badge) · Auto-reply · Quick replies / Back to Revenue app. Icon tiles `#FDE3D2` with rust glyphs.
- **M13 Notifications** — All · Unread · Read (opens on All). Today / Earlier. Unread rows are 600 weight with an orange dot.
- **M14** — Tapping a row opens a summary sheet: grabber, customer, last message quote, Status / Waiting / Visit, **Mark as read** + **Open chat**.

### Team
- **T01 Insight** — house, avatar, "Good morning, Peter". Period card: This month ▾ + "vs Sep". Rust hero, 2×2 metrics. Team performance: Director first, team dot, Leads · Appt · Show · W/L.
- **T02 Inbox board** — Team pill → bell → Contacts. Two chip rows: who (team dots) and status (underline tabs). Columns 300px, scrolling sideways. Each card shows: avatar, name, time, unread, last message, owner (oxblood when "to assign") and urgency.
- **T03 Assignment** — Tabs, team legend, ad cards with split bar and Edit split / **Set up**.
- **T04 Split leads** — Ad name typed in place, Evenly | By team, a preview bar, team rows with % fields (Director first), expanded team modes, over-limit note. Sticky footer: **Save** + "Save and apply to all 14 ads".
- **T05 Calendar** — List view grouped by day. Each row has a team colour bar, time, customer, person · showroom, and state (Came / Booked / No-show).
- **T06 Profile** — Same look as Mine, with management rows and "View as a team member".
- **T07 Showrooms** — ‹ 1 / 2 › and rust +, address, map chips, slot stepper, 24 × 7 grid, closures.

## Interactions & behaviour
Production behaviour stays as it is unless `CRM Redesign dev changes.md` says otherwise. The essentials:
- Rows swipe: left = Assign (leaders) · More; right = Read / Unread · Pin. Long press opens the message menu; swipe right on a bubble replies.
- Mic is hold-to-record (slide left to cancel); it becomes Send when the field has text. Attach and Camera stay visible while typing.
- A chat is cold after 24 h without a customer message: the composer is replaced by the template card.
- Sheets close when pulled down. Desktop rails fold to 44px strips (see the breakpoint rule).
- Hover: rows `#FBF7F3`. Outline buttons tint `#FBF4EC`. Primary buttons press to `#A33F14`. Focus: `outline: 2px solid #BD4A19; outline-offset: 2px`.

## State
No new state. The designs use existing data. Every exception is tagged **NEW DATA** in the change list, and there are none so far. The per-chat Audit log uses the existing audit records, filtered by chat.

## Assets
- `icons/`: Lucide v0.460 SVGs (MIT), drawn in the prototypes as CSS masks so they take `currentColor`. Use the codebase's Lucide package instead.
- Fonts: Inter and Inter Tight (Google Fonts).
- No images. The photo tiles in the chat album are placeholders.

## How to review
1. Open `CRM Desktop.dc.html` and `CRM Phone.dc.html` in Chrome or Safari, with `support.js` and `icons/` in the same folder. Pan and zoom the canvas. Each frame has a label: **01–11, 02b, 02c** on desktop and **M01–M14, T01–T07** on phone.
2. Read `CRM Redesign dev changes.md` and build one numbered item at a time. Every item has an acceptance line to check against the matching frame.
3. Use the token table above for every colour. If a value is not in the table, ask before adding it.

## Files
- `CRM Desktop.dc.html` — 13 desktop frames (01–11, plus 02b and 02c).
- `CRM Phone.dc.html` — 21 phone frames (M01–M14, T01–T07).
- `CRM Redesign dev changes.md` — numbered changes with platform, NEW DATA and §6 flags, plus acceptance lines.
- `support.js`, `icons/` — needed to open the prototypes locally.
