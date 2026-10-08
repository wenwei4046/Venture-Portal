# Handoff: HOUZS Venture · Revenue app (mobile + desktop)

## Overview
A sales app for the HOUZS Venture **Revenue** department (sub-departments **Fair** and **IR**). Salespeople check income and targets (Today), see their sales, bills, KPI items and brand margin (Insight), build quotes with live margin-tier feedback (Quote), follow rankings (Arena), and handle income, honours, team, requests and memos (Profile). A **Principal** can "View as" any person, read-only. The same app runs on iOS, Android and desktop (1440).

## About the design files
The files in `prototype/` are **design references built in HTML**. They are not production code to copy. Recreate them in the Venture Portal codebase (Next.js / React, Supabase), using its existing patterns. Business rules (margin tiers, team cost ÷ 0.7, KPI items, memberships per sub-department, view-as mask) already exist in Venture Portal. Wire the UI to them rather than to the demo data.

**Source of truth = `prototype/RevenueApp.dc.html`.** Every colour, size, radius, shadow, spacing value and line of copy is written inline in that file. When this README and the file disagree, the file wins. Copy values literally, without rounding or substituting tokens.

How to read it:
- The markup between `<x-dc>` and `</x-dc>` is the template. `{{ name }}` holes are values from `renderVals()`. `<sc-if value>` is a conditional, `<sc-for list as>` is a loop, and `style-hover` etc. are pseudo-states.
- The `<script type="text/x-dc">` block holds the data constants (also exported to `prototype-data.js`) and `class Component`. That class is the state and behaviour, like a React class component.
- To open it: serve the `prototype/` folder (e.g. `npx serve prototype`) and open `Revenue Mobile.dc.html`, the canvas of every chosen screen. `RevenueApp.dc.html` can also be opened alone.
- Props on `<dc-import name="RevenueApp" …>` in the canvas show how each state is reached (e.g. `screen="quote" mattress-sheet="true"`).

## Fidelity
**High-fidelity.** Final colours, typography, spacing, copy and interactions. Recreate pixel-perfectly. See `TOKENS.md` for every value used, with counts, and `COPY.md` for every string.

## Platforms & frames
| Platform | Frame | Notes |
|---|---|---|
| iOS | 414×868 device, 12px bezel, radius 64 / screen 52 | Status bar 54px (9:41, Dynamic Island 124×36). |
| Android | 410×884, 10px bezel, radius 46 / screen 36 | Status bar 38px. |
| Desktop | 1440×900 window, radius 14 | Left sidebar 240px, top bar 60px, content column 760px, right panel 400px. |

Prop `platform`: `ios` · `android` · `desktop`.

## Global chrome
### Mobile header (`header-style="d"`, default)
- Left: wordmark `HOUZS VENTURE` (15px/700, letter-spacing .14em, #4E2F20) over `Revenue` (12px/600, #BD4A19). Tapping it goes to Today.
- Right: one capsule, 46px tall, radius 23, 1px #EBDDD2 border, white, shadow `0 2px 8px rgba(63,43,34,.06)`. It holds:
  - `Fair ▾` (14px/650): opens the sub-department sheet.
  - A 1×20 divider.
  - A bell with a count badge (16px orange #BD4A19 pill, 10px/700 white, 2px white ring). It opens Notifications.
  - A 36px avatar circle, #4E2F20, showing the initials.
- Shown on Today and Quote step 2. The border-bottom appears once scrolled.

### Mobile bottom nav
- Items: Today · Insight · **Quote** (raised 58px orange circle, 4px white border, `margin-top:-22px`, z-index 6) · Arena · Profile.
- Tapping Quote opens the brand picker ("Start a quote") instead of navigating.

### Desktop shell (`platform="desktop"`)
- **Sidebar 240px** (#FBF6F2, right border #EBDDD2), top to bottom:
  1. The wordmark.
  2. The nav (44px rows, radius 12; active row bg #FFF1E6, ink #BD4A19).
  3. A Notifications row with a count.
  4. A spacer.
  5. A signed-in person card.
- **Top bar 60px** (#FBF6F2):
  - Left: `Good morning, <first name>.` with the name in #BD4A19.
  - Right:
    - `● Fair view ▾` switch.
    - `Sun 4 Oct 2026 · Q4 2026` in monospace.
    - A bell.
    - `SIGN OUT`.
- **Content** is a 760px column, centred in the space right of the sidebar.
- **Right panel** (400px, full height under the top bar, border-left #EBDDD2). Every mobile bottom sheet renders here instead:
  - It slides in from the right (`translateX`) and the content column slides left (padding transition 320ms `cubic-bezier(.2,.8,.2,1)`).
  - **Only one right panel at a time.** Opening any panel closes Notifications, and opening Notifications closes any panel.
  - On Quote with nothing open, the right panel is the **Price & margin calculator** (the full step-2 content).
- `desk-style="a"`: the right side is empty until something opens. `desk-style="b"`: Notifications is the default right panel.

## Screens
Exact layout and copy for each screen are in the template, in source order. Summary:

### Today (`screen="today"`, `today-style="a"` = chosen command-centre layout)
1. **Greeting:** `Hello, <first>` (28px/700, -.03em). Under it: `Sat, 3 Oct · <title> · <rank>` (14px, #806B60).
2. **Income hero card (`hero-style="grad"`, chosen):**
   - Card: radius 24; background `linear-gradient(140deg,#F2995E 0%,#D9622A 55%,#B8461A 100%)`; text #FFFFFF, sub-text #FFE6D6; shadow `0 12px 26px rgba(189,74,25,.3)`.
   - Content: `September · Estimated income`, a hide/show eye button, the amount (36px/750), and the salary + commission split.
   - A 3-column metric row (Sales / Margin / KPI). Each metric links to Insight.
3. **Needs your action:** a to-do list.
4. **This week:** the brand week and fair venue.
5. **Arena boards:** a 2×2 grid.
6. **Income link row.**

### Quote
- **Step 1 · Products**
  - Header: `QUOTE` eyebrow. The title is the **brand name**; tapping it opens the brand picker. A pill shows `Mattress ▾` or `Sofa ▾`. Then a stepper: `1 Products ——— 2 Price & margin`.
  - **Last used sets:** up to 3 per brand, each row with `Use`. Use opens the product panel prefilled; the quantity is then set below.
  - **All `<Brand>` models:** a search field that opens a searchable A–Z sheet.
  - **Buy separately:** `Bed frame only`, `Accessories only`. Hidden for sofa brands.
  - **Bottom dock:**
    - A bag icon with a count badge, `<n> items · <Brand>`, and `View or change ▴`, which opens the cart sheet (`In this quote`). Each line has a tag (MATTRESS / FRAME / KPI / ACC / SOFA), − / +, a bin, and `Clear all`. The sheet's footer has `Keep adding` + `Set price`.
    - A `Set price →` button.
  - The dock has 30px bottom padding so the raised Quote button never overlaps it.
- **Brand picker** ("Start a quote"): Akemi, Ergotex, Dunlopillo (Mattress) and Zanotti (Sofa). Choosing another brand clears the cart, with a yellow warning when the cart has items.
- **Mattress panel**
  1. **Size:** Single / Super Single / Queen / King.
  2. **Bed frame:** `+ Add bed frame` opens the **same steps as Bed frame only**: Last used, Size, Model picker sheet, KPI items, and quantity. Each added frame becomes a card with Edit / ×. A small `+` adds another frame.
  3. **Accessories:** − / + per item.
  - Footer: a quantity stepper plus `Add to cart` / `Add 2 sets to cart`.
  - **Quantity = whole sets.** Example: 2 sets of a mattress with Linden ×2 and Haven ×1 gives 2 mattresses, 4 Linden and 2 Haven. A summary line above the footer spells it out.
- **Bed frame only**
  - **Last used:** up to 3, with `Use`.
  - **1 · Size**
  - **2 · Model:** a field that opens the second-layer picker sheet with `Back`.
  - **3 · KPI items:** checkboxes.
  - **Quantity:** stepper.
- **Sofa panel (Zanotti)**
  - **Module strip:** draws the modules left → right.
  - **1 · Last used layouts:** 3 layouts plus `Custom`, each with Use / Applied.
  - **2 · Modules:** module codes 1A-LHF, 2A-LHF, CHS-LHF, 1N, CNR, 1A-RHF, 2A-RHF, CHS-RHF, OTT, each with − / +.
  - **3 · KPI items**
  - Quantity is in whole sofas.
- **No retail prices anywhere in Quote.**
- **Step 2 · Price & margin**
  - **Price and margin:** selling price input (keypad), margin %, tier label, penalty text, and `Reach <tier> at <price>` with `Use price`.
  - **KPI line:** `<n> KPI items · fixed, not in margin`, followed by `Customer pays`.
  - **In this quote:** − / + per line.
  - **Additional fee:** one RM input, excluded from margin.

### Insight
Personal / My team. My sales vs target, KPI items, orders, margin by brand. Plus:
- My sales orders, grouped by week.
- My bills.
- KPI items.
- Brand margin with tier.

### Arena
A hub plus boards (Sales, Margin, KPI, Championship), a Fair results sheet, a championship points sheet, and a month/quarter/year picker.

### Profile
- A profile card on a peach header gradient (`#F6B48A → #FFD9BC → #FFFFFF`; the status bar is peach too).
- **Your workspace:**
  - My income (commission breakdown, order-by-order detail, KPI pay RM 25/item).
  - My honours.
  - Team & capacity (reporting tree and person sheet).
  - Requests (Submit claim / replacement / waiting list forms, My requests).
  - Memos & notifications.
- Privacy: Hide income amounts. Sign out.

### Notifications (bell)
- Filters: All / Requests / Memos / Results.
- Groups:
  - **Needs you:** memos to acknowledge, and requests returned by HR.
  - **September results:** final rankings and commission.
  - **Request updates:** status only.
  - **Earlier**
- **Memos cannot be acknowledged from the notification.** `Read memo to acknowledge` opens the memo itself, and only acknowledging inside the memo clears it. `Mark all read` never clears memos that still need acknowledgement.
- Every card deep-links to its page.

### Sub-department switch
A sheet titled `Switch sub-department`, listing only the sub-departments the person belongs to (Fair, IR). It drives `subName`.

### Principal · View as (`principal="true"`, `va-style="a"`)
- Profile shows a dark `View as a team member` card. It opens a full page with search only (54px field), and everyone grouped by sub-department, with View / Viewing on each.
- While viewing as someone, a dark bar sits at the top of every screen: `Viewing as <name>` / `<title> · read-only`, with `Switch` and `Exit`.
- The whole app shows that person's identity and numbers.
- **Read-only:** Set price and Add to cart do nothing (`Read-only while viewing as`).
- Exit returns to Profile and resets the sub-department to Fair.

## Interactions & motion
- **Sheets:** `translateY(105%)` → `0`, 320ms `cubic-bezier(.2,.8,.2,1)`. Backdrops fade 240ms; colours are `rgba(40,25,18,.45)` / `rgba(78,47,32,.42)`. On desktop, sheets use `translateX` and have no dim.
- **Notifications page (mobile):** slides from the right, 340ms.
- **Dropdown chevrons:** rotate 180°, 200ms.
- **Tab-bar status colour** transitions 220ms.
- Header rule appears after 4px of scroll. The Profile compact name bar appears after 110px of scroll (mobile only).
- **Hit targets** are at least 44px on mobile.

## State
See `class Component` → `state = {…}` for the full list. Key fields:
- **Navigation:** `screen`, `pfView`, `insightView`, `arenaView`, `board`.
- **Quote:**
  - `qBrand`, `cart[]` (each line: `{id, kind: mattress|frame|kpi|acc|sofa, key, name, size, qty, list, cost}`).
  - `sheet` (`{mode: model|frame|acc|sofa, size, frame, kpi[], acc{}, qty, bfs[], fx, mods{}, layout}`).
  - `qRecent`, `qRecentM`, `qRecentSofa`, `price`, `fee`.
- **Overlays:** `brandPick`, `cartOpen`, `nfOpen`, `sdOpen`, `subDept`.
- **Memos:** `memoRead[]`, `memoAcked[]`.
- **View as:** `viewAs`, `vaOpen`.

### Margin rules
- Team cost = supplier cost ÷ 0.7.
- Bed frames, accessories and sofa modules follow the brand's margin.
- KPI items carry cost 0 and are **excluded from margin**. They are added on top as a fixed price per item.
- Tiers (function `band()`):
  - ≥43 Incentive Tier 2
  - ≥36 Incentive Tier 1
  - ≥33 Standard
  - >27 Low margin
  - >25 Below Tier 1 (Commission × 0.5)
  - >24 Below Tier 2 (Commission × 0.25)
  - else Below Tier 3 (No commission)

## Demo data to replace
All names, models (16 Akemi / 12 Ergotex / 10 Dunlopillo / 10 Zanotti), 14 bed frames, KPI items, sofa modules/ratios, people (`PEOPLE`, `VA_PEOPLE`), ranks, sales and income figures are placeholders. They are in `prototype-data.js`.

## Files
- `prototype/RevenueApp.dc.html`: the whole app (template + logic). **Primary reference.**
- `prototype/Revenue Mobile.dc.html`: the canvas of all chosen screens and states, newest first (turns 14–25). Option ids (e.g. 25a) match the chat history.
- `prototype/support.js`: the runtime needed to open the prototypes locally. Not for production.
- `TOKENS.md`: every colour, font size/weight, letter-spacing, radius, shadow, gap, padding and transition used, with counts.
- `COPY.md`: every user-visible string, verbatim.
- `prototype-data.js`: seed data and constants, verbatim.

## Screenshots
Visual reference only; the HTML file remains the source of truth. Captured from the prototype (iOS frames at 48%, desktop at 56%).
- `screenshots/01-screen.png`: Today · Brand picker · Quote (Akemi) · Mattress panel
- `02`: Mattress → Add bed frame · Bed frame only · Bed frame model picker · Cart
- `03`: Zanotti · Sofa panel · Price & margin · Notifications
- `04`: Insight · My bills · KPI items · Arena
- `05`: Sales board · Profile · My income · My honours
- `06`: Team & capacity · Requests · Memos · Sub-department switch
- `07`: Principal profile · View as page · Viewing as Marcus Lim
- `08`–`14`: Desktop: Today · Quote + calculator · Quote + product panel · Notifications · Profile · Insight · Arena

## Assets
No images. Icons are inline 24×24 stroke SVG paths (the `ICON` map and inline `<path d>`s in the template); keep these exact paths or map them to an equivalent stroke icon set. Model photo slots were removed on purpose.
