# Handoff: HOUZS CRM Desktop — v2 (Principal / Director)

## Overview
The CRM is a separate section of the Revenue app for desktop (1440 × 900 and 1280 × 800). Entering CRM shows only CRM pages; the user leaves through "Back to Revenue app" or the profile menu. This handoff covers everything changed in **v2** on top of rev 1: sidebar groups, Inbox chat updates (synced with the app's `SalesChat`), Contacts (new), Assignment (Ads to teams, Full time lead allocation, Member work type), Customer form (moved out of Settings, redesigned), Channels (new, Meta settings), Audit log (new), Calendar and Insight additions, resizable columns everywhere, refresh/back behaviour.

Repo: `wenwei4046/Venture-Portal` (see `github.md`). The phone app's chat lives in `src/components/member/crm/sales/` — the desktop chat copies its vocabulary (attach menu, message menu, system lines).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy. Recreate them in the Venture-Portal codebase (Next.js / React, existing CRM components under `src/components/member/crm/`) using its established patterns. All data in the prototype is sample data; live values come from the CRM database and Meta APIs (see "Data sources").

## Fidelity
**High-fidelity.** Final colours, typography, spacing and interactions. Recreate pixel-accurately with the codebase's existing components.

## How to read the prototype
- `CrmFrame v2.dc.html` — one component that renders the whole CRM screen. Props select the starting state: `w` (1440 | 1280), `variant="panel"`, `role` (principal | director | leader | rs), `tab`, `stage="op"`, `pick` (section index), `ad` (ad index), `adLog`, `chat`, `cpOpen`.
- `CRM Desktop rev 1.dc.html` — the review canvas. **Step 6 (frames 6a–6j)** shows the v2 screens; earlier steps are rev 1 (they import `CrmFrame.dc.html`).
- Open either file in a browser (needs `support.js` next to it).

---

## Shell

### Sidebar (240 px, bg #FBF6F2, right border #EBDDD2)
Groups, each with an 10.5 px / 700 / .1em caps label in #A08E82 followed by a 1 px #EBDDD2 rule; 14 px gap between groups:
1. (no label) Insight · Inbox · Contacts · Calendar
2. MARKETING — Ads Performance · Assignment
3. MANAGEMENT — Showrooms · Customer form · Channels · Settings · Audit log

Items 42 px tall, radius 10, 15 px Inter. Active: bg #FFF1E6, text #BD4A19, 650. Idle: #4E2F20. The Team | Mine toggle (Directors) stays on top. RS (Mine) sees one ungrouped list.

### Navigation persistence
- **Refresh** returns to the same place: tab, section, open chat / ad, sub-tab (store in URL or localStorage).
- **Browser Back** steps back through each click-navigation (tab, section, chat, ad, sub-tab), up to 50 steps. Not "last visited page" — the previous click.
- Entering **Inbox** always resets its columns to standard widths and closes Chat progress.

### Resizable columns (everywhere)
Every column edge / side panel / table header divider is draggable: 9 px hit area, hover shows a 3 px #E2B79C line, cursor col-resize; double-click resets to default. Columns shrink before overflowing (each has a min width) — the row never exceeds the frame.

Defaults:
- Inbox: list 320 (1440) / 300 (1280), chat flexible, Customer info 260, Chat progress 260 open / 44 closed.
- Assignment menu sheet 340 / 310 (min 280). Editor sheet (split / full time) 520 / 440, `flex: 0 1`, min 320.
- Ad performance column 260 (220–420). Audit log column 280 (220–420/440).
- Generic right panes (Settings, Showrooms, alerts) draggable 300 … (frame − 320).

### Popovers & menus (one style)
White, 1 px #EBDDD2 border, radius 12–16, padding 6, shadow `0 10px 28px rgba(40,25,18,.16)`. Rows 34–42 px, radius 8–10, hover bg #FFF5EC, selected row bg #FFF5EC + rust check. Click outside closes. Modals sit inside the CRM frame (absolute, not fixed), scrim rgba(40,25,18,.32).

---

## Screens

### 1. Insight — hero card
Orange gradient card (135°, #F08C52 → #DE6A30 → #BE4A1A, radius 26, shadow 0 18px 40px rgba(189,74,25,.22)). Big Appt rate 64 px / 700. Bottom row now **5 cells** (grid repeat(5, 1fr), divider rgba(255,255,255,.28)):
Leads · Show-up · Reply 24 h · **Avg. reply** (customer message → first reply, same rule as `vm/insight.ts`) · **Won** (count, sub = amount).
Value 26 px / 700, sub 12.5 px at 85 %. Each cell has a delta pill vs last month ("↑ 19% vs Sep"; bg rgba(255,255,255,.18), 11.5 px / 650). Each cell opens its customer list.

### 2. Inbox (four columns)
list › chat › Customer info › Chat progress (44 px rail, closed by default on entry at all widths).

**Customer info** groups: CONTACT (Phone, First contact, Last chat), LEAD (Platform, Ad, Status, Salesperson), VISIT (Visit, Showroom), PROPERTY (Property type, Unit size, Unit location, Requirement, Budget). Labels above values, dividers between groups. Fields follow Customer form (screen 6). No ad-performance or assignment data here.

**Chat column** (bg #EFE7DE + `assets/chat-pattern-clean.svg` 240 px tile):
- Bubbles: incoming #fff radius 16 16 16 4; outgoing #F9D5B8 radius 16 16 4 16; 14 px / 1.45; time 11 px #806B60; read ticks #3B8FD9.
- **Message menu** (hover a bubble → 28 px round chevron button beside it): reaction bar 👍 ❤️ 😂 😮 😢 🙏, then Reply · Copy · Star/Unstar · Pin/Unpin · Delete for me (#B3261E). Reply shows a quote bar above the composer (3 px rust left border). Star shows ★ #A46312 by the time. Pin shows a sticky bar at the top of the thread with "Unpin". Reaction chip hangs under the bubble.
- **Visit reminder card** (customer with a booking): outgoing-bubble wrapper, white card: date tile 52 px (#FFF0E4 / #BD4A19, DOW · day 22 px · MON), "REMINDER" tag, "Showroom visit", time 16 px / 650, then address row on #FDFAF7. Address source will change later.
- **System lines** (centred pill, rgba(107,100,90,.12), #6B645A, 12 px / 600): "{name} joined the chat" (Share), "{name} took over this chat" (Move), plus app's Showed up / No show / Won / Lost lines.
- **Composer**: 44 px round + · pill input "Reply to {first}…" with sticker icon · camera · 44 px rust mic.
- **+ Attach menu** (vertical list, 220 px, rows 42 px, 20 px coloured line icon + 14 px label): Camera #C8402A · Photos #2F8FD8 · Document #BD4A19 · divider · Quick replies #A46312 · Auto replies #387557 (icons from `vm/chat.ts`).
- **⋮ menu** (same style, 240 px), three groups split by dividers:
  1. Assign to #2F6FB5 (not for Mine) · Move #BD4A19 · Share #A46312
  2. Customer info #387557 · Appointment #8E4B6E · Starred messages #A46312 (sub "N in this chat")
  3. Mark as unread / read #2F6FB5 · Mute notifications / Unmute #6B645A (sub "Muted") · Pin chat / Unpin chat #806B60
  Each of group 3 shows a toast. **To build:** reflect unread dot, mute icon and pinned order in the Inbox list.

**Move / Share rules**
- Move: only to your **direct upline** (no skipping, no other team). RS → their Team leader; Team leader → Senior TL; Director → Principal. Principal sees "You're the top level" (no Move) with "Invite your team" → Share.
- Share (invite a teammate): anyone **in the same team chain** — above (full chain to Principal), same level, below. Never across teams. List grouped ABOVE YOU / SAME LEVEL / BELOW YOU; button Share → Shared (green #387557). Principal invites downline (Director, Senior TL, all teams).

### 3. Contacts (new; between Inbox and Assignment)
Analytics page fed by Customer info.
- **Filter box** "Filter by Customer info" (card, radius 14) with search (name, phone, requirement) top-right, then rows by group: PROPERTY (Property type, Unit size, Budget, Unit location) · LEAD (Platform, Ad, Status, Salesperson) · VISIT (Visit: Showed up / Booked / No visit; Showroom) · CONTACT (First contact: This week / Last 2 weeks / Earlier; Last chat: Today / This week). Each is a custom dropdown pill (32 px, "Label **Value** ⌄"), options show count; active pill = rust border + #FFF5EC. Name, phone, Requirement are search-only.
- **Active chips** (#FFF0E4 / #BD4A19, ×) + "Clear all".
- **Stats strip** (4 cells, bg #FBF6F2): Contacts · Condo · Landed (count + %) · Median budget · Property info filled %.
- **Chart card**: group-by segmented (Property type, Unit size, Budget, Unit location, Status, Platform, Visit, Showroom); stacked 10 px bar; one row per value: dot, label, 8 px bar, count, %. "Not filled yet" row for property keys. Clicking a row filters by it.
- **Table**: Contact (avatar, name, phone) always shown; other columns toggled from the **+** (dashed 26 px circle, right of header) menu "ADD FROM CUSTOMER INFO" listing all 13 fields with group tag (checkbox, check = show). Defaults: Property type (pill: Condo #E4EDF8/#2F6FB5, Landed #FFF0E4/#BD4A19), Unit size, Budget (RM n,nnn), Unit location, Requirement. Header: click to sort ↑ / ↓ / off (↕ idle); × hides; drag to resize. Property type / Unit size sort by form option order; blanks last. Row click → Inbox with that chat and Customer info open.
- Budget buckets for grouping: Under RM 5k · RM 5k–10k · RM 10k–20k · RM 20k +.

### 4. Calendar — top card
Dark card (135°, #5A3826 → #3A2218, radius 20). Six stats: Leads · Upcoming (#F6B48A) · Showed up · Show-up % · **No show** (#F2A08A, past visits not showed up) · **Not reminded** (#F6D58A, tomorrow's visits without a sent reminder — needs real reminder log). Right: bars with **By team / By showroom** toggle (22 px pills). Date range menu gains **Next month (1 – 30 Nov)**; custom range inputs accept November.

### 5. Assignment
Menu (right sheet, 340 / 310): Ads to teams · Full time lead allocation · Member work type. Sheet title 17 px, rows = 32 px tinted icon tile + 14 px title + 12.5 px sub, hairline separated (no big cards).

**5a. Ads to teams** — entering opens the first running ad. Columns: ad list › split editor › Ad performance › Audit log.
- Left (min 240): when no ad open — pending reminders (only ads with no split, only when the status filter includes Pending; rust-outlined "Set up"), "WHO GOT THE LEADS · THIS MONTH" card (stacked bar + per-team leads and share), "ADS · HOW EACH ONE IS SPLIT" list. With an ad open the list is compact: name, leads, channel · status, 4 px split bar. Status filter pill "Running · 3" shows only that status.
- Split editor: SPLIT METHOD segmented (Evenly | By team); By team: 100 % check, Reset, stacked bar, per-team slider + % input; per-team rule segmented (Evenly | By % | By max) with member list. **When a team is Evenly its member list collapses** to "N members · each gets an equal share · Show". Footer: checkbox "Also apply to all N running ads", Cancel, Save (rust).
- Ad performance (260): time pill (Today / This week / This month / **Custom** → inline October calendar: pick start then end, future days disabled, Apply), OVERALL 2×2 (Spend, Leads, Cost per lead, Appointments + % of leads), FUNNEL (Reach → Clicks → Leads → Appointments, sqrt-scaled bars, conversion % each step), COSTS (Cost per click, Cost per lead, Cost per appointment, CTR), footer "Full Ads Performance ↗". Numbers = Ads Performance data.
- Audit log: 44 px dot rail, **closed by default**, resets closed when switching ad or page. 1440: opens docked right of performance (split shrinks to min). 1280: overlays the split column, performance stays visible. Timeline: date / time, icon dot, text, who. Each Save adds an entry.

**5b. Full time lead allocation** — first team opens by default. Left: hairline list of teams (dot, name, On/Off dot status, members with 20 px day circles, mode, "Set up ›"). Right editor: FULL TIME ALLOCATION Off|On segmented (warm), WHO WORKS WHICH DAY (28 px day toggles, "Tick every day"), WHO GETS EACH DAY summary. Footer checkbox **"Also apply to all 3 teams" — enabled only when every member in this team has identical days**; otherwise disabled with hint "Only when everyone here works the same days". Closed state = "Pick a team" placeholder.

**5c. Member work type** — per-team cards, toggle Full time / Part time per member. **Launch default: everyone Part time (all off).** Save → audit entries "{name} set to Full time/Part time". Audit log column (closed by default, 44 px rail).

### 6. Customer form (moved from Settings; Settings now = Cold lead templates, Notifications)
Two columns: editor (flex) + sticky live preview (400 px).
- Header: description + "N fields · N required · N filled by the system", Discard (when dirty), "Save form".
- One card per section (Contact, Lead, Visit, Property) with title + one-line description, count. System fields shown as chips in a strip "🔒 Filled by the system" (First contact, Last chat, Platform, Ad, Salesperson, Visit, Showroom) — not editable/removable.
- Editable rows grid `48px | field 1fr | answer type 140 | choices 1.3fr | required 108 | 28`: ↑↓ reorder, name input, Answer type dropdown (Short text, Number, Long text, Choice, Range (from–to), Date), Choices input (comma-separated, Choice only), Required switch (38×22, rust on), × remove. Core fields (Name, Phone, Status) are required and not removable ("Core").
- Per section: dashed input "New field, e.g. Move-in date" + "+ Add field".
- Preview: Phone (default) | Desktop. Phone = device frame sized to fit without page scroll (≈270×560 at 1440, 222×460 at 1280), bottom sheet "Edit customer info", one column, Cancel / Save. Desktop = single column form. Required = red * (#B3261E); system fields show "Filled automatically".
- **To build:** new fields flow into Inbox Customer info and Contacts filters / columns.

### 7. Channels (new; Meta settings in the CRM)
Edit: Principal and Director. Others read-only with banner. Tabs: Connections · Facebook Page · Messenger · WhatsApp · Templates · Ads; "Open in Meta Business Suite ↗" top-right. Unsaved tab shows a 6 px amber dot. Forms save with "Save to Meta".
- **Connections**: one card per group (Facebook Pages, WhatsApp numbers, Instagram, Ads accounts): rows with name, sub, ID, Linked/Unlinked, Default tag, Set default, Unlink (confirm modal explaining effect; nothing is deleted on Meta), Link again; "+ Link a Page / Add a number / Link an account". Link = "Continue with Facebook" (Embedded Signup) → pick assets → Link. Add number = number + SMS|Voice → 6-digit code → Verify and add. Plus API access (token, renews in N days, Refresh) and Webhook (Receiving · last event, Send test) cards, and permission list (pages_manage_metadata, pages_messaging, whatsapp_business_management, ads_management).
- **Facebook Page**: About (255), Phone, Website, Email, picture / cover, opening hours (switch + times per day). Name change → link to Meta (review).
- **Messenger**: Greeting (160, `{{user_first_name}}`), Ice breakers (max 4), Persistent menu; live Messenger preview.
- **WhatsApp** (modelled on WhatsApp Manager): number list left (+ add) → header (MY number, display name, Phone number ID) → sub-tabs Insights · Profile · Automations · Message links · Call settings · Call log. Profile: picture, Display name with status (Approved / In review / Rejected) + Edit → Submit for review, Username (Create), Official business account (Submit request), Business info (Category, Description 512, Address 256, Email 128, 2 websites 256), Social accounts (Facebook linked, Link Instagram); sticky profile preview.
- **Templates**: list (name, category, language, status Approved/Pending/Rejected, updated) + New template (name snake_case, Marketing|Utility, English|Bahasa Melayu|Chinese, body with {{1}}…) → "Send for review".
- **Ads**: per ad: spend, leads, daily budget input (RM), Running/Paused switch.
- Note: literal `{{…}}` text must be rendered as text, not template holes.

### 8. Audit log (new)
Tabs with 7-day counts: Chat flow · Marketing · Management. Stats strip (Changes, People, Last change). Filters: Today | Last 7 days | This month, search, "Who" chips. Table TIME | WHO | WHAT | DETAIL grouped by day; TIME/WHO/WHAT columns resizable (defaults 76/220/320, DETAIL fills ≥160). Empty: "Nothing recorded under this filter" + Clear filters. **To build:** feed from the per-page audit logs (Ads to teams, Member work type, Full time, Customer form, Channels, chat Move/Share/assign).

---

## Data sources (live)
- CRM DB: customers + Customer info answers, visits, assignments/splits, work type, full-time days, audit events, chat flags (unread, mute, pin, stars, reactions).
- Meta: WhatsApp Cloud API (numbers, profile, templates, insights, registration), Graph API (Page fields, Messenger profile: greeting / ice breakers / persistent menu), Marketing API (ads status, budgets, spend). Requires Meta App Review for the permissions above. Where an API doesn't expose a value (e.g. blocked count, some call logs) show a "View in Meta" link instead.

## Design tokens
**Colour**
- Rust (primary) #BD4A19 · hover #A3371A · tints #FFF0E4 / #FFF1E6 / #FFF5EC / #FFF8F2
- Ink #3F2B22 · deep #4E2F20 · muted #806B60 · faint #A08E82 · disabled #D9C9BD / #E2CFC1
- Borders #EBDDD2 · inner dividers #F1E7DF · faint dividers #F5EEE8 · cream bg #FBF6F2 · segmented bg #F5EEE8
- Green #387557 / #E8F3ED · Amber #A46312 / #FFF0CC / #FBF1D9 · Red #A3371A / #F8E1D8 · Error #B3261E · Blue #2F6FB5 / #E4EDF8 · Plum #8E4B6E / #F3E8EF · Neutral #6B645A / #F2F0EB
- Teams: Kelvin #BD4A19 · Priya #2F6FB5 · Ryan #8E4B6E
- Chat: bg #EFE7DE · outgoing #F9D5B8 · read tick #3B8FD9
- Brands: WhatsApp #25D366 · Facebook #1877F2 · Instagram #C13584 · Messenger link #0866FF
**Type** Inter. Page title 22 / 700 (-.02em) · panel title 17 / 650 · section 15 / 650 · body 14 / 13.5 / 13 · meta 12.5 / 12 · caps label 11 / 700 / .08em. Numbers tabular.
**Radius** 6 (tags) · 8 · 10 (inputs, menu rows) · 12 · 14 (cards) · 16–18 (popovers, cards) · 20+ / pill (buttons). Switch 38×22.
**Spacing** 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20; page padding 20 when columns are open, 28 / 40 otherwise.
**Buttons** primary rust fill, white 650, height 36–40, pill. Secondary 1 px #E2CFC1 on white. Outline-rust for "Set up", "Link …".
**Shadow** popover 0 10px 28px rgba(40,25,18,.16) · modal 0 20px 50px rgba(40,25,18,.25) · segmented-on 0 1px 2px rgba(63,43,34,.12).

## Assets
- `assets/chat-pattern-clean.svg` — chat background tile (from the repo `docs/design/crm-desktop-rev1/prototypes/assets/`).
- Icons are inline Lucide-style SVG paths (stroke 1.8–2.4, round caps). Use the codebase's icon set.

## Screenshots
`screenshots/` — 1440 × 900, principal, default entry state of each page: 01 Insight · 02 Inbox chat · 03 Contacts · 04 Calendar · 05 Ads to teams · 06 Ads to teams with Audit log · 07 Full time lead allocation · 08 Member work type · 09 Customer form · 10 Channels · 11 Audit log. Menus, dialogs and other states are in the prototype.

## Files
- `prototypes/CrmFrame v2.dc.html` — **v2 source of truth** (all screens above).
- `prototypes/CRM Desktop rev 1.dc.html` — canvas; Step 6 frames 6a–6j are v2.
- `prototypes/CrmFrame.dc.html` — rev 1 component (earlier canvas steps).
- `prototypes/support.js` — runtime to open the prototypes locally.
- `github.md` — repo link and last sync.
