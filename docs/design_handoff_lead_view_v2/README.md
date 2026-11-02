# Handoff: Lead View v2 (full portal redesign)

> Target repo: `wenwei4046/Venture-Portal` (branch `main`). The previous handoff lives at `docs/design_handoff_lead_view_inbox/` in that repo. **This package supersedes it.** Where they disagree, this README and `Lead View App.dc.html` win.

---

## 1. Overview

Lead View is the customer-service console for a furniture group with several brands (**2990s**, **2990s mini**, **Carress**). Customers message the brands' Facebook Pages (Messenger) and Instagram accounts, often from Meta ads. CS staff reply in a shared Inbox, assisted by reply templates and an AI Agent. The goal of every chat is to **get the customer's mobile number and hand the lead to a salesperson on WhatsApp**. Leads are then tracked through to showroom visit and sale.

This package covers 14 screens in one app shell:

| Group | Screens |
|---|---|
| Main | Inbox, Leads, Insight, Campaigns |
| REPLIES | Reply rules, Reply templates, Step library, AI Agent |
| FILES | General info, Data Center, AI corrections |
| ADMIN | Working hours, Audit log, Settings |

## 2. About the design files

`Lead View App.dc.html` is a **design reference built in HTML**. It shows the intended look and behavior. It is **not production code to copy**. Everything is inline-styled, the data is hard-coded demo data, and there is no backend.

Your task is to **recreate these screens in the Venture-Portal codebase** (Next.js App Router + React/TSX, existing components such as `src/app/(portal)/leads/_components/InboxView.tsx` and `LeadsView.tsx`), using the repo's existing patterns, data layer and component library. Replace demo constants with real data from the backend / Meta Graph API.

How to read the reference file:
- Open `Lead View App.dc.html` in a browser (it needs `support.js` next to it). The canvas is fixed at **1440×900**.
- Click the left nav to switch screens.
- The markup between `<x-dc>` and `</x-dc>` is the template. `{{ name }}` holes are filled by `renderVals()` in the `class Component` script at the bottom of the file. Search the class for the hole name to find its logic.
- Each screen's markup starts with a comment banner such as `<!-- ================= DATA CENTER ================= -->`.
- Per-screen logic lives in these methods: `renderVals()` (Inbox, Leads, Insight, Campaigns, Reply rules, Templates, Library, Hours, Audit), `agVals()` + `agPost()` (AI Agent), `infoVals()` (General info), `dcModel()` + `dcVals()` (Data Center → Files), `lsVals()` (Data Center → Web links & Shortcuts), `crVals()` (AI corrections), `stPages()` + `allRoutes()` + `stVals()` (Settings).

## 3. Fidelity

**High fidelity.** Colors, type, spacing, radii, shadows, copy and interaction patterns are final and were reviewed screen by screen. Recreate them pixel-close. If the repo already has equivalent primitives (Button, Select, Popover, Dialog, Toast), reuse them but restyle them to these tokens.

Design rules the user enforced repeatedly. Do not regress them:
1. **Minimal.** No helper or description paragraphs under titles, no "this page lets you…" text, no decorative icons, no extra card borders. When in doubt, remove text.
2. **Consistent master/detail layout.** Most management screens use the same pattern: left category nav, middle list, right detail panel (see §6).
3. **Muted palette.** One accent (rust `#A3401A`), one positive (green `#30673A`), one warning (amber `#8A5A12`). No other saturated colors except the folder color swatches.
4. **Everything editable in place** where it makes sense (pencil → Save, or inputs directly in the detail panel).
5. **Right-click context menus** on list rows (Edit / Rename / Move / Duplicate / Delete…).
6. **Click outside closes** every popover, menu and dropdown. Modals close on backdrop click.
7. **Destructive actions confirm** inline (red tinted box with Cancel / Delete), never silently.
8. **All lists sortable or filterable**, with an "All" option **first**.
9. Statuses that depend on dates (**In use / Ending soon / Scheduled / Expired**) are **computed from dates**, not set by hand.

## 4. Design tokens

### 4.1 Colors

| Token | Hex | Use |
|---|---|---|
| `ink` | `#2B211C` | Primary text, dark buttons, phone frame |
| `ink-2` | `#5E524A` | Secondary text, icon buttons |
| `muted` | `#8A7E75` | Labels, meta text, inactive icons |
| `muted-2` | `#A3978D` | Section kickers, placeholders, counts |
| `disabled` | `#C4B9AE` | Disabled button bg, faint separators |
| `accent` | `#A3401A` | Brand rust: nav bg, primary buttons, active tab underline, links, "needs attention" |
| `accent-tint` | `#FBEFE7` | Rust tint bg: delete confirm, file badges (PDF), hover on rust ghost buttons |
| `accent-line` | `#D9B8A6` | Dashed border on "Hand over" placeholder |
| `nav-cream` | `#FFF4EB` | Logo tile on nav |
| `nav-dot` | `#FFD9BF` | Unread dot on nav icon |
| `positive` | `#30673A` | In use / Receiving / Saved / Apply buttons / toggles on |
| `positive-tint` | `#E9EEE7` | Green tint bg (XLS badges, "Saved" box) |
| `warn` | `#8A5A12` | Ending soon / To review |
| `warn-tint` | `#F4F0E6` | JPG badge bg |
| `slate` | `#4E6170` | DOC badge / Facebook tile fg |
| `slate-tint` | `#EEF0F4` | DOC badge / Facebook / web-link tile bg |
| `olive-sel` | `#E9E9C7` | **Selected** row in left nav lists, customer chat bubble, selected chip |
| `olive-sel-line` | `#C9C79A` | Border of selected chip |
| `page-bg` | `#F4F2E8` | App background, segmented-control track, kbd/shortcut chips, folder tiles |
| `body-bg` | `#E9E6DD` | `<body>` behind the 1440 canvas |
| `panel-bg` | `#EAE8DA` | Collapsible right rail (preview / audit) background |
| `panel-bg-2` | `#DFDCCB` | Segmented track inside the rail, rail hover |
| `surface` | `#FFFFFF` | Cards / sections |
| `surface-hover` | `#FBFAF4` | Row hover, chat background |
| `surface-sel` | `#F7F6EE` | Selected row in middle lists, search field bg, menu item hover |
| `line` | `#E7E5D4` | Card borders, input borders |
| `line-2` | `#F3F1E7` | Row dividers inside cards |
| `line-3` | `#ECEADB` | Status-pill borders, popover border variant |
| `line-4` | `#DEDCC8` | Composer border, off-toggle track |
| `input-focus-line` | `#CFC9B0` | Inline rename input border, unchecked checkbox border |
| `chart-chats` | `#E08A63` | Trend tooltip dot (chats) |
| `chart-phone` | `#7FA886` | Trend tooltip dot (got phone) |
| `amber-dot` | `#D69628` | Contacted / Appointment status dot |

Folder color swatches (Data Center): Default `#8A7E75` / `#F4F2E8`, Rust `#A3401A` / `#FBEFE7`, Green `#30673A` / `#E9EEE7`, Amber `#8A5A12` / `#F4F0E6`, Slate `#4E6170` / `#EEF0F4`, Plum `#7A4F6E` / `#F3ECF1` (fg / tile bg).

Status color map (use everywhere):
- In use / Receiving / Saved / Came / Closed → `#30673A`
- Ending soon / Ends in N days / To review / Appointment → `#8A5A12` (dot `#D69628` on Leads)
- Scheduled / Paused / Not used / Dismissed → `#A3978D` (or `#8A7E75`)
- Expired / Reconnect / Not handed yet / needs follow-up → `#A3401A`

Overlays: modal backdrop `rgba(43,33,28,.28)`. Nav hover `rgba(255,244,235,.14)`, nav active `rgba(255,244,235,.2)`, nav inactive icon `rgba(255,236,222,.72)`.

### 4.2 Typography

- **UI font:** `Figtree` (Google Fonts, weights 400/500/600), fallback `system-ui, sans-serif`. Base 14px, line-height 1.45, color `ink`.
- **Display font:** `Georgia, serif` for page titles, detail-panel titles, brand group names, logo "H", empty-modal titles. Never bold.
- **Mono:** `ui-monospace, Menlo, monospace`, only for shortcut keys (`/price`).

| Role | Size / weight | Notes |
|---|---|---|
| Page title (header) | Georgia 28px | Kicker above it: 11px, letter-spacing .1em, `muted-2`, uppercase (e.g. "REPLIES") |
| Detail panel title | Georgia 17–18px, line-height 1.35 | |
| Modal title | Georgia 19px | |
| Section title in cards | 15px / 600 | e.g. "By ad", "Pages", "Ads" |
| Body / list primary | 14px / 500 | |
| Secondary / meta | 13px / 400 | |
| Small meta | 12px | |
| Kicker label | 11px, letter-spacing .1em, uppercase, `muted-2` | e.g. `DETAILS`, `USED BY`, `VERSIONS`, `FOLDER`, `STATUS`, `TOPIC`, `BRAND`, `LINK FOR AI AGENT` |
| Big metric | 30px / 600, line-height 1, letter-spacing -.01em | Insight funnel |
| Card metric | Georgia 22px | AI Agent stat cells |
| File badge | 10px / 600 | PDF / XLS / DOC / JPG |

### 4.3 Spacing, radii, shadows

- Spacing is a 2/4/6/8/10/12/14/16/18/20/24 scale. App gutter: screens sit in `padding: 0 12px 12px`, and columns are separated by `gap: 12px` (separate cards) or by 1px `line-2` borders (columns inside one card).
- Radii: **14px** cards/sections · **12px** large tiles, preview boxes · **11px** popovers/menus · **10px** list rows, confirm boxes · **9px** buttons, inputs, search fields, 36px icon tiles · **8px** small buttons · **7px** menu items, segmented options · **999px** pills, chips, status pills · **50%** avatars, dots · **16px** modals. Chat bubbles `16px 16px 16px 4px` (incoming) / `16px 16px 4px 16px` (customer).
- Shadows:
  - Popover / dropdown / context menu: `0 10px 28px rgba(43,33,28,.14)` (.16 for context menus)
  - Modal: `0 20px 50px rgba(43,33,28,.2)`
  - Slide-over drawer: `0 18px 48px rgba(43,33,28,.2)`
  - Expanded nav: `8px 0 32px rgba(43,33,28,.22)`
  - Phone mockup: `0 12px 32px rgba(43,33,28,.22)`
  - Selected segmented option: `0 1px 2px rgba(43,33,28,.08)`
  - Composer: `0 2px 8px rgba(43,33,28,.05)`

### 4.4 Icons

[Lucide](https://lucide.dev) v0.460, stroke icons. Sizes: 18px nav, 15–16px toolbar buttons, 13–14px inline/meta, 28px empty/preview. Names used are in the reference file as `data-lucide="…"`. Key ones: inbox, users, chart-column, megaphone, split, workflow, blocks, sparkles, book-open, library, history, clock, scroll-text, settings, headset, store, folder, folder-plus, upload, link, trash-2, pencil, rotate-ccw, smartphone, monitor, sun, moon, facebook, instagram, globe, radio-tower, refresh-cw, chevron-right/down, panel-right-close.

> Implementation note: chevrons that open/close are **one `chevron-right` icon rotated 0° → 90°** (`transition: transform .15s`), not two swapped icons.

### 4.5 Motion

Keep motion subtle and short. Nothing bounces.

| Element | Motion |
|---|---|
| Left nav expand | width 64 → 232px, `transition: width .18s ease, box-shadow .18s ease`. Labels fade `opacity .15s`. Expand only after the pointer **rests 120ms** (debounce); collapse **immediately** on mouse leave. It overlays the page and does not push content. |
| Tree / group chevrons | `transform: rotate(90deg)`, `.15s` |
| Preview phone ↔ desktop toggle | Both mockups keep the **same height (560px)** and top position, so switching does not jump the layout. Cross-fade or instant swap. No resize animation. |
| Toasts | Appear bottom-center (`bottom: 28px`), dark `ink` bg, white 13px text, check icon in `olive-sel`. Auto-hide after 1.5–3s. |
| Copy buttons | Label changes "Copy" → "Copied" for 1.5s |
| Chat preview | Auto-scroll to the newest message whenever messages change |
| Trend chart tooltip | Follows the pointer horizontally, flips side near the edges |
| Hover | Background color change only (no lift/scale) |

## 5. App shell

- Canvas: full viewport in production (the reference is fixed 1440×900). `display:flex`, bg `page-bg`.
- **Left nav** (`aside`), 64px collapsed, rust `#A3401A`, `padding:16px 12px`, vertical flex, `gap:4px`:
  - Logo row: 36×36 tile `nav-cream`, radius 10, Georgia 20px "H" in rust; label "Lead View" Georgia 17px white (visible only when expanded). 20px margin below.
  - Items (40px tall, full width, radius 10, `padding:0 11px`, `gap:12px`, icon 18px + label 14px). In order: Inbox · Leads · Insight · Campaigns │ Reply rules · Reply templates · Step library · AI Agent │ General info · Data Center · AI corrections │ Working hours · Audit log · Settings. `│` = 1px divider `rgba(255,244,235,.18)`, `margin:6px 10px`.
  - Active item bg `rgba(255,244,235,.2)`, fg white. Inactive fg `rgba(255,236,222,.72)`. Hover bg `.14`.
  - Inbox shows a 6px `#FFD9BF` unread dot at the top-right of its icon.
  - Bottom: avatar 32px circle `olive-sel` with "ML" in green 12px/600. Name "Mei Ling" and role "Customer Service" appear when expanded.
  - Behavior: see Motion. The `title` attribute on each item stays as a native tooltip.
- **Header** (64px, `padding:0 20px 0 24px`): kicker plus Georgia page title on the left. Global search ("Search customers, phones or chats") shows **only on Inbox and Leads**. On the right: "Test mode" indicator (amber dot) and bell icon button.

## 6. Shared patterns (build these once as components)

1. **Master/detail card**: one white card (`border:1px solid line; radius 14; overflow hidden`) split into a grid of `[left nav 200–230px] [list minmax(0,1fr)] [detail 360–400px]`, columns separated by 1px `line-2` borders.
   - **Left nav**: optional kicker (`FOLDER`, `STATUS`, `BRAND`…). Items are 8px/10px padded buttons, radius 9, icon 16px `muted`, label 14px, count 12px right-aligned. Selected: bg `olive-sel` + 600 weight. Hover `surface-sel`. "All" is always the **first** item.
   - **List header**: search field (36px, radius 9, bg `surface-sel`, search icon 15px, no border) plus the primary action on the right (36px rust square icon button, or rust button with label).
   - **List row**: radius 10, `padding:9–11px 10px`, `gap:12px`. Left: 36×36 tile (radius 9) or badge. Middle: title 14px/500 (ellipsis) and meta line 12px `muted`. Right: status = 6px dot + 12px text in status color. Hover `surface-hover`. Selected `surface-sel`. **Right-click opens the context menu and selects the row.**
   - **Detail panel**: `padding:18px 20px`, vertical `gap:18px`. Header: Georgia title, then a status pill button (28px, border `line-3`, radius 999, dot + text; click toggles pause/resume), then a 28px trash icon button (hover rust tint). Below: sections, each with a kicker label. Detail rows are `display:flex; justify-content:space-between`, 13px, key in `muted` and value in `ink` right-aligned.
   - The first item is selected by default, so the panel is never empty when the list has items.
   - Empty list text: "Nothing here" / "No files" / "Empty folder", 13px `muted-2`, `padding:32px 10px`.
2. **Context menu**: fixed-position at the cursor (clamped to the viewport), min-width 180–210, `padding:5px`, radius 11, border `line`, popover shadow. Items are 32px, radius 7, 13px. Destructive items in rust. A transparent full-screen layer behind it closes it on click **and on right-click**. Sub-modes replace the menu content in place (e.g. "Move to ›" shows a folder list; "Delete" shows a confirm "Delete this file?" with Cancel / Delete).
3. **Dropdown / select popover**: the trigger is a ghost button (icon + label + chevron-down 13px `muted-2`). The popover sits 34–40px below, radius 11, with a full-screen click-catcher. Selected item has bg `page-bg`, weight 600, count on the right.
4. **Modal**: centered, width 440–520, radius 16, `padding:22px`, `gap:16px`, Georgia 19px title. Footer is right-aligned: ghost "Cancel" plus primary button. Primary is **disabled (`#C4B9AE`) until required fields are valid**. Required kickers end with ` *`. Closes on backdrop click.
5. **Chips (single-select)**: 30–32px pills, padding 0 12px, 13px. Off: white bg, border `line`. On: bg `olive-sel`, border `olive-sel-line`.
6. **Segmented control**: track `page-bg` (or `panel-bg-2` inside the rail), padding 3, radius 9. Options radius 7. Selected option white with the tiny shadow.
7. **Toggle switch**: 34×20 track (on `positive`, off `line-4`) with a 16px white knob.
8. **Inline confirm**: box with bg `accent-tint`, radius 10, text rust 13px, then ghost Cancel and solid rust Delete (28px).
9. **Collapsible right rail** (Reply rules, Templates, Inbox audit): bg `panel-bg`, radius 14. Collapsed it is a 44px strip of icon buttons. Expanded it has a header row with a segmented control (e.g. Preview | Audit log) and a `panel-right-close` button. **Collapsed by default.**
10. **Preview device**: phone 280×560 (Reply rules) or 300×650 (Campaigns), 9–10px `ink` border, radius 42–46, notch, status row "9:41". Chat header: back chevron, 28px rust avatar "H", brand name, platform name in 10px `muted`. Messages scroll on `surface-hover`. Composer row reads "Message…" with a send icon, plus a home indicator bar. Desktop variant: browser card max 560 wide, 560 tall, 3 grey dots and the channel name, "Typically replies within minutes", composer "Aa".
11. **Sortable table header**: 12px `muted`. Active column is `ink`/600 with arrow-up or arrow-down 12px. Inactive columns show arrow-up-down at 35% opacity. Clicking toggles direction.

## 7. Screens

### 7.1 Inbox
Grid `320px | minmax(0,1fr) | 340px | 44px`, gap 12.
- **Conversation list**: brand filter dropdown ("All brands") and a filter icon. Tabs All / Waiting / Answered / Handed with counts; Waiting count is rust. Rows show initials avatar, name, time, last message, unread badge, status line, and brand. Selected row bg `olive-sel`. Unread rows have time in rust/600.
- **Chat**: header with name, sub "brand · channel · source · since date", assignee dropdown ("Mei Ling"), and an ⋯ menu ("Mark as unread"). Day separators. Bubbles: customer `#fff`/`line`, outgoing `olive-sel` with a byline ("CS · Mei Ling", "Template · Sofa enquiry", "✦ AI Agent"). Template buttons render as "↳ label".
- **Composer** (52px pill, radius 999, border `line-4`). Left icons: **paperclip (file), image (photo/video), smile (emoji)**. Placeholder: "Type your reply to {first name}, or / for shortcuts". Typing `/` opens the **Shortcuts** picker from Data Center. Right side: General info book icon (inserts info), "AI draft" pill (green on `olive-sel`), and a 40px rust round send button.
- **Customer panel**: name with an open-lead link, "first contact" date. **Phone block**: label states "Phone · found in the chat / confirmed / added by you". A detected phone shows ✓ / ✗ to confirm or reject. Phone can be **typed manually, with no format validation** (customers may be foreign).
  - **One shared pencil** puts the whole panel into edit mode, with a single Cancel / Save at the bottom.
  - "For the salesperson" fields: Interest, Budget, Showroom, **Visit (date picker)**, **Language (select: Mandarin / English / Malay / Other)**, **Special request**.
  - Note ("only sales sees this").
  - Bottom: dashed rust "Hand over to {brand} sales".
- **Right rail 44px**: history icon toggles the audit-log slide-over (320px, timeline with green dots).

### 7.2 Leads
- Toolbar: search (Name, phone or interest), Brand / Source / Salesperson filters, "Needs follow-up {n}" toggle (rust dot), date range dropdown (**options: Today, 7 days, This month, Custom** — no "Last month" or "All time"), Export.
- Status tabs: All, No phone, Not handed, Handed, Contacted, Appointment, Came, Closed, Lost, with counts.
- Table columns: ☐ · Customer (avatar, name, phone) · **Source** (channel tag + ad name, brand below; Brand and Source are merged into one column) · Interest · Salesperson · Status (dot + label) · Last update (plus a rust stale note such as "Not contacted · 2 days"). All columns are sortable. Row height ≥ 62px.
- **Bulk selection**: the header checkbox supports a partial state. When rows are selected, a dark (`ink`) bar overlays the toolbar: "{n} selected" · Hand over to sales · Change status (opens a status picker popover) · Export selected · Clear. Salespeople never log into this view, so there is **no "assign"**.
- Footer: Per page segmented 20/50/100, page label, prev/next.
- **Lead drawer** (420px slide-over from the right, click outside closes): brand · channel · source line; Georgia 26px name; phone 18px; merge note; **Progress** vertical stepper (First message → Phone confirmed → Handed → Contacted → Appointment → Came → Closed, with timestamps); "For the salesperson" fields; footer with Open conversation (rust), Remind on WhatsApp, Mark as lost.
- No ad-spend or cost-per-phone columns.

### 7.3 Insight
- Top bar: brand tabs (underline). On the right, a segmented control **Today / 7 days / 30 days / Custom**. Custom opens a 300px popover with From/To date inputs (max = today), preset chips, and Cancel / Apply (green) on the right.
- Funnel: 5 equal tiles (bg `surface-sel`, radius 12): label, big number, 4px progress bar, rate text.
- **Trend line chart** (Chats rust vs Got phone green): **collapsed by default** behind a "trending-up" text button. When open it is 140px tall, and hovering shows a dark tooltip with date, chats and phones.
- "By ad" table (sortable): Ad (channel tag and name), Brand, Chats, Phones, Rate, Came, Closed. Clicking a row **filters the whole page to that ad** and shows a "Showing only {ad} ×" chip above the funnel. Clicking again clears it.
- Right column (380px): "Who replied first" (Person / Template / AI Agent bars) and "Where customers drop off" (template picker with search, then horizontal step bars with lost %).
- No card borders on these sections (white cards only).

### 7.4 Campaigns
Grid `300px | 1fr | 340px`.
- Left: Promotions consent tiles (Agreed in green tint, Not asked, Stopped), then a campaign list with status.
- Middle editor: Who gets it (locked Meta rule plus check filters, audience count), Message (approved template select and body), When, Send test, Schedule. Sent campaigns show 5 result tiles and "See the leads it brought".
- Right: phone preview (PREVIEW · MESSENGER).

### 7.5 Reply rules
Two cards on the left, plus a collapsible right rail (preview / audit log, **collapsed by default**). The right rail sits at the far right edge.
- **Pages** card (collapsible header with chevron): column headers are centered: ☀ Working hours, ☾ After hours (with an ⓘ tooltip "Includes public holidays and staff on leave. Set them in Working hours."). Rows are grouped by brand (Georgia 15px group name), one row per **brand + platform**, generated from **Settings → Pages** (§7.14). Each row shows the platform icon and channel name, plus two **dropdown chips** (not click-to-cycle): A person (headset), AI Agent (sparkles), or any template (workflow icon). The selected page row is tinted and drives the preview.
- **Ads** card: filter segmented control (**All / No rule** — "No rule" lists ads with no rule set), "+ Add rule". Lists **every ad from Ads Manager**. An ad without a rule shows "Follows page" (corner-down-right icon). An ad can have **different replies per time window** (e.g. Working hours → A person, After hours → Sofa enquiry). Trash removes the rule.
- **Add ad rule modal**: Ad select, Working-hours reply, After-hours reply. Ad rules override page rules.
- **Preview rail**:
  - Control block (bg `page-bg`, radius 12): title "{brand} · {channel}" and a restart button. Then a segmented control **☀ Working hours | ☾ After hours** (equal width) and a phone | desktop toggle.
  - The preview is **interactive**: it runs the chosen template step by step. Tapping a button sends it as the customer's reply. A phone step shows "Send my number". AI Agent shows demo buttons. "A person" shows the pill "Waiting for CS to reply".
  - Restart resets the run. Changing page, ad or time also resets it.
- Colors stay muted: chips use bg `surface-sel`/`page-bg` with icon color by type (person `ink-2`, AI green, template rust). No rainbow.

### 7.6 Reply templates
Grid: template list | editor | collapsible preview rail.
- Template list (Georgia names, "Used by …").
- Editor header: name, "Used by", **view switch List | Flow map**, Save.
- **List view**: vertical straight list of steps. Each step shows an icon by type, name, type label, message, attachment, buttons ("label → next step"), and "Then → next". Click a step to edit inline: name, message textarea, attachment (Attach / Replace / remove; accepts image, pdf, doc, xls, ppt), button rows (label + target select + ×, "+ Add button"), Done.
- **Flow map**: nodes laid out in **straight columns, no crossing lines** (column = depth, stacked vertically). Zoom −/+/Fit. Clicking a node's edit opens the **same editor panel as the list view**. Clicking empty canvas closes it.
- **"+ Add step"** is the same menu in both views: step types (Buttons, Send a file, Gives a phone, Hand to a person, AI Agent) and a "FROM LIBRARY" section. Clicking outside closes it.
- Numbers are **not** shown on steps (they implied order).
- Right-click a step → Edit, Save to library, Duplicate, Delete.
- Preview rail: interactive phone/desktop preview of the template (as in §7.5).

### 7.7 Step library
Single card table: Step (icon, name, type) · Message (1 line) · Used in · Ver. Sortable. Filter tabs by type: All, Buttons, Send a file, Hand to a person, AI Agent. Show "No {type} steps yet" when empty.
- Click a row to open the edit panel: TYPE, MESSAGE, BUTTONS (where relevant), ATTACHMENT, USED IN (links that jump to the template), a phone PREVIEW, and Cancel / Save. **Saving updates every template that uses the step.**
- "New step" opens the same panel with a TYPE picker.
- Right-click: Duplicate / Delete. Delete confirms with: "Delete “{name}”? Templates that already use it keep their copy. To remove it there, delete the step in each template." (Deleting from the library does not change existing templates.)

### 7.8 AI Agent
Brand dropdown at the top. Tabs: **How it replies · Knowledge · Fixed answers · Sales playbook · Memory** (counts on tabs; Memory shows "{n} new" in rust). Unsaved changes show a Discard / Save bar. A **Test** chat slides in from the right (collapsible: "Try asking" chips, typing indicator, input).

All five tabs share one layout: `170px category nav (sticky) | content`, where content is `list (max-width 560px) | 340px sticky detail panel`. Header row: 26px icon tile, Georgia 18px category title, and "+ Add …" aligned to the list's right edge.

- **How it replies**:
  - Groups "How it talks", "How it sells", "What it avoids", "When to hand over".
  - Each group has quick-pick rule chips, "+ Add in your own words", Tone (select with icons), Reply length (dropdown), and "Don't answer" topics (no free-text box).
  - Phone ask: after N replies (**typeable number**) and/or when the customer mentions trigger words (chips + "Other word…").
  - Hand to a person when unsure / upset / after N replies.
- **Knowledge**:
  - Categories: Files, Web links, History.
  - Files table: File · Folder · Ends · Status. The detail panel shows status, Open / Pause / Delete, "replies · 7 days" and "of AI replies", ASKED ABOUT chips, DETAILS, and ALSO USED IN.
  - **Add (modal)**: a **Data Center folder tree picker** (brand root and Shared). Rows are collapsible. A whole folder can be checked; its children then show as checked and locked. Already-added items show "Added". There is also a field "Paste a Data center link" (error: "Link not found in Data center").
  - Web links: paste a URL, or pick from Data Center links.
  - **Expired files move to History automatically.** History lists Expired (rust) / Added / Updated / Removed / Restored entries. Its detail panel shows the old file details. Expired files have **Restore until [date]**.
  - Also: General info items (linked, "Edit in General info ↗").
- **Fixed answers**:
  - Categories: Payment / Delivery / Product.
  - List rows show the question with an answer preview.
  - The detail panel edits CUSTOMER ASKS and EXACT REPLY, shows 2 stat cells (times used · 7 days; customer replied after), Source, and Delete.
- **Sales playbook**:
  - Categories: Price / Hesitating / Choosing.
  - Rows show the situation, trigger words and On/Off.
  - The detail panel has the name with a toggle, WHEN THE CUSTOMER SAYS, APPROACH chips (with a dropdown of preset approaches), EXAMPLE REPLY, stats (used, gave a phone after), "Try it", and delete.
- **Memory**:
  - Categories: To review (rust count) / In use / Settings.
  - To review items have Edit / Dismiss / Use it.
  - In use items have Turn off.
  - Settings has the toggles "Learn from its own chats" and "Learn from templates and CS".
  - The default category is To review when it has items, otherwise In use.

### 7.9 General info
Grid `220px | 340px | 1fr` (three separate white cards). Facts that the AI Agent and CS use (showrooms, promotions, payment, delivery).
- **Category nav**: "All info" first, then categories with icon and count. Supports **add / rename / delete category, each with a custom name and an icon** (6×N icon grid picker). Right-click → Rename / Delete. Click outside cancels.
- **List**: search, rust "+" button, then **Brand dropdown (multi-select)** and **Status dropdown** (All / In use / Ending soon / Scheduled / Expired / Not used, with colored dots and counts). Group headers (SHOWROOMS…) appear only under "All info". Rows show name, brand and status. Right-click → Edit / Duplicate / Delete.
- **Detail / editor**:
  - Header: Name * (required), Brand * (multi-select dropdown, required), status pill, delete icon, and **Save** (top right). Save is disabled until something changes and shows "Saved" otherwise. A tooltip says "Add a name and choose a brand" when those are missing.
  - DETAILS: rows of [Label input] [type select: Text / Number / Phone / Date / Link…] [value input] [×], plus "+ Add detail". The label name and the value type are both editable.
  - VALID: collapsed to "Add dates" until dates exist, then two date inputs ("to").
  - USED IN: link chips with ×, plus "+ Add" (picker).
- **Status is computed from dates** (today = reference date):
  - Before the start date → Scheduled ("Starts 1 Nov").
  - 14 days or less before the end → Ending soon ("Ends in N days").
  - Past the end → Expired.
  - Otherwise In use. No dates → In use (or manual Paused).

### 7.10 Data Center
One card. Top tabs (underline, rust): **Files · Web links · Shortcuts** with counts.

**Files: Google-Drive-style nested folders.** Grid `230px | 1fr | 360px`.
- **Folder tree** (left):
  - Root "Data center" (hard-drive icon). It is collapsible too.
  - Brand roots: **2990s, Carress, Shared**. Subfolders such as Catalogues, Products & prices, Promotions (with Raya 2026 inside), Photos & videos, Showrooms & hours, After-sales.
  - Indent 16px per level. Each row has a rotating chevron (only when it has subfolders), a folder icon tinted with the folder's color, the name (ellipsis), and a recursive file count.
  - The selected folder has bg `olive-sel`. Clicking a folder opens it and expands its ancestors.
- **Middle**:
  - Search ("Search in this folder"). It searches **recursively** under the current folder, and results show their path.
  - Buttons: New folder (outlined, folder-plus) creates "Untitled folder" in rename mode. Upload is the rust button.
  - **Breadcrumb**: Data center › 2990s › Promotions, with every part clickable.
  - Rows: subfolders first (colored folder tile, "N folders · M files", chevron), then files (ext badge, name, "Updated 18 Oct · v3", status).
  - Single click on a folder opens it. Single click on a file selects it. Rename happens inline (Enter saves, Esc cancels, blur saves).
- **Detail panel**:
  - Folder: Georgia title, delete icon, a 150px preview tile in the folder color showing "{n} FILES", LINK FOR AI AGENT (link, Copy → "Copied"), Location, Folders and Files counts.
  - File: title, status pill (click to pause/resume, disabled when Expired), delete icon, a 150px preview tile tinted by type, LINK FOR AI AGENT, Location, Valid ("Until 31 Oct" / "No end date"), Uploaded by, USED BY chips (or "Not used"), and VERSIONS (v3 Current · date · by, older versions below) with "↻ Replace file".
- **Links**: every folder and file has a stable link `https://leadview.my/dc/{brand}/{folder}/{subfolder}/{file-slug}`. These are what the AI Agent → Knowledge "Paste a Data center link" field accepts. The goal is to point the agent at **exactly** e.g. "2990s / Showrooms & hours".
- **Context menu**:
  - Folders: a row of 6 color swatches at the top, then Open, Rename, Move to ›, Copy link, Delete.
  - Files: Rename, Move to ›, Copy link, Replace file, Delete.
  - Move to lists every folder indented by depth with a ✓ on the current one. A folder cannot be moved into itself or its descendants.
  - Delete confirms in place. For folders it reads "Delete folder and N files?", which deletes the subtree.
- **Upload modal**: "TO FOLDER *" (scrollable indented folder tree, defaults to the current folder), a dashed file drop area ("Choose a file"), and Cancel / Upload (disabled until both are set). The new file lands in that folder, selected.
- **File status**: computed from the Valid date: Expired / Ends in N days (≤14) / In use, or Paused by hand.

**Web links** (grid `200 | 1fr | 360`):
- Left BRAND nav: All / 2990s / Carress / Shared.
- Rows: globe tile, host, "brand · every day", In use or Paused.
- Detail panel: status pill, delete, URL box with Copy, READ BY (brand chips), CHECK FOR CHANGES (Every hour / Every day / Every week chips), Last checked, Pages read, and "↻ Check now".
- Add link modal: URL (must start with http(s)://), READ BY * (brand), frequency.
- Right-click: Open, Copy link, Check now, Pause / Resume, Delete.

**Shortcuts** (same layout):
- Rows: mono rust key chip `/price`, the text (1 line), and "brand · used N times".
- Detail panel: key input with a fixed "/" prefix (lowercase, letters, digits, _ and - only), with a duplicate warning "Another shortcut already uses this". Then TEXT textarea, BRAND chips, and Used count.
- "+" creates an empty shortcut and selects it.
- Right-click: Duplicate, Delete.
- In the Inbox composer, typing `/` opens these shortcuts.

### 7.11 AI corrections
Corrections CS made to AI replies. Grid `200 | 1fr | 400`.
- Left: STATUS (**All**, To review [amber, count in rust], Saved [green], Dismissed [grey]) and TOPIC (All topics, Delivery, Product details, Payment, Promo and price). The default status is To review.
- Middle: search, then rows showing the customer question with "topic · CS name · date" and a status.
- Detail panel:
  - CUSTOMER ASKED (Georgia 18px).
  - AI SAID (grey box, struck-through).
  - CORRECT ANSWER (editable textarea).
  - Topic, Corrected by, Chat.
  - Actions:
    - **Save as fixed answer** (rust) / Dismiss.
    - Once saved: a green box "Saved as fixed answer" with View, which jumps to AI Agent → Fixed answers.
    - Once dismissed: a grey box with Undo.
- Right-click: Save as fixed answer / Dismiss / Move back to review.
- **Backend requirement:** saving must actually create the Fixed answer (with the edited text) for that brand.

### 7.12 Working hours
Two columns.
- **Weekly hours**: the sub-line reads "Outside these hours, each page uses its after-hours reply. Kuala Lumpur time (GMT+8)." Each row has a day toggle, From and To time selects, or "Closed". "Copy Monday's hours to all open days". "Save changes".
- **Public holidays** and **On Leave** are separate cards. Each has "+ Add", and rows with an icon, name, date range, mode, and trash.
  - Holidays replace the weekly hours for those days.
  - Leave sends that staff member's chats to the rest of the team.
- After-hours rules apply on holidays.

### 7.13 Audit log
Module filter chips (All, General info, Data Center, Reply template, AI Agent, Working hours, Campaigns) and Export CSV. Table columns: Time · User (avatar) · Module · Item · Action (colored: Added green, Edited grey, Deleted rust, Paused amber) · Change ("old → new").

### 7.14 Settings
This is how new Facebook Pages and Instagram accounts are added so their messages come into the Inbox. Grid `200 | 1fr | 380`.
- Left: **Pages** (count; when any page needs reconnecting the count turns rust, e.g. "1 !") and **Brands**.
- **Pages list**: grouped by brand (kicker). Rows have a platform tile (Facebook slate-tint / Instagram rust-tint), the page name, "Messenger" / "Instagram", and a status: **Receiving** (green), **Paused** (grey) or **Reconnect** (rust, access token expired).
- **Page detail**:
  - Platform tile, name, "Facebook Page · Messenger" / "Instagram", status pill (click pauses/resumes receiving).
  - If expired: a rust box "Access expired. New messages are not coming in." with a **Reconnect** button.
  - BRAND chips (move the page to another brand).
  - REPLIES: Working hours and After hours values read from Reply rules, plus a "Reply rules ↗" link.
  - DETAILS: Page ID, Connected by (name and date), Access ("Renews in N days" / "Expired").
  - "Disconnect page" opens an inline confirm: "Disconnect this page? New messages will stop coming in. Past chats stay in the Inbox."
- **Connect page modal**:
  1. PLATFORM chips: Facebook / Instagram.
  2. "Continue with Facebook" (real: Meta OAuth / Facebook Login for Business with `pages_messaging`, `instagram_manage_messages`, `pages_show_list` and related permissions; subscribe the page's webhooks).
  3. PAGE * single-select list of pages the user manages. Already-connected pages are greyed and marked "Connected".
  4. BRAND * chips for existing brands, plus "+ New brand" (shows a name input).
  5. FIRST REPLY chips: A person / AI Agent.
  6. Connect is disabled until all are set. On success: the page is added and selected, a toast reads "{page} connected. New messages will come into the Inbox.", and **Reply rules gains a row for that brand + platform** with the chosen first reply for both time windows.
- **Brands**: list with initial avatar, name and "N pages". The detail panel has an editable BRAND NAME (renaming updates all pages) and the pages list (click to jump to the page). "Add brand" creates "New brand".
- Reply rules rows are derived from Settings: only pages that are not paused and not expired produce rows.

## 8. Data model (suggested)

```ts
type Brand = { id; name };                                   // 2990s, 2990s mini, Carress
type Page  = { id; brandId; platform:'FB'|'IG'; name; metaPageId; connectedBy; connectedAt; tokenExpiresAt; paused:boolean };
type ReplyTarget = { kind:'person'|'ai'|'template'|'follow'; templateId? };
type PageRule = { brandId; platform; working:ReplyTarget; after:ReplyTarget };
type AdRule   = { adId; working:ReplyTarget; after:ReplyTarget };            // overrides PageRule
type Template = { id; name; steps: Step[] };
type Step = { id; name; type:'buttons'|'file'|'phone'|'human'|'ai'; text; file?; options?:{label;toStepId}[]; nextStepId?; libraryStepId?; libraryVersion? };
type LibraryStep = { id; name; type; text; file?; options?; version };       // saving bumps version and propagates
type Conversation = { id; customer; brandId; pageId; source; state:'waiting'|'answered'|'handed'; unread; messages: Message[]; timeline: Event[] };
type Lead = { id; name; phone?; phoneState:'none'|'detected'|'confirmed'|'manual'|'handed'; brandId; channel; source; interest; budget; showroom; visitDate?; language?:'Mandarin'|'English'|'Malay'|'Other'; specialRequest?; note; salesperson?; status:'nophone'|'new'|'handed'|'contacted'|'appt'|'came'|'closed'|'lost'; dates:Record<status,Date>; stale? };
type InfoCategory = { id; name; icon };
type InfoItem = { id; categoryId; name; brandIds:string[]; fields:{label;type;value}[]; from?:Date; to?:Date; usedIn:Ref[] };
type DcFolder = { id; name; parentId|null; color? };
type DcFile   = { id; folderId; name; ext; versions:{v;date;by;url}[]; validUntil?; paused; usedBy:Ref[] };
type WebLink  = { id; url; brandId|'shared'; frequency:'hour'|'day'|'week'; paused; lastCheckedAt; pagesRead };
type Shortcut = { id; key; text; brandId|'shared'; uses };
type Correction = { id; topic; question; aiSaid; correctAnswer; by; at; conversationId; state:'open'|'saved'|'dismissed' };
type AgentConfig = per brand: goal, tone, length, rules[], notes, blockedTopics[], phone{afterN, triggers[], askText}, handover{unsure, upset, afterN}, knowledge{files[], folders[], links[], infoItems[]}, faqs[], playbook[], memory[];
type AuditEntry = { at; user; module; item; action:'Added'|'Edited'|'Deleted'|'Paused'; change };
type WorkingHours = { week:{day;open;from;to}[]; holidays[]; leaves[] };     // timezone Asia/Kuala_Lumpur
```

Every create, edit or delete in Settings, Info, Data Center, Templates, Library, AI Agent, Hours and Campaigns must write an `AuditEntry`.

## 9. Interactions that are visual-only in the prototype (must be built for real)

- Inbox: sending messages; **file / photo / emoji pickers**; `/` shortcut picker; AI draft; General info insert; assignee change; hand over to sales (creates a WhatsApp handoff).
- Leads: Export / Export selected (CSV); Remind on WhatsApp; Mark as lost; Brand / Source / Salesperson filter dropdowns; pagination.
- Insight: all numbers are demo data; compute them from conversations and leads.
- Campaigns: template select, scheduling, send test; Meta template approval status.
- Data Center: real upload and storage, previews (render the PDF first page or the image thumbnail in the preview tile), version history, link resolution, web link crawling.
- AI Agent: real LLM calls for Test chat, Memory learning, Knowledge retrieval scoped to the selected folders, files and links, the usage stats, and the "Paste a Data center link" resolver.
- AI corrections: "Save as fixed answer" must create the FAQ entry.
- Settings: Meta OAuth, webhook subscription, token refresh / Reconnect, page list from Graph API.
- Working hours: enforcement of after-hours rules (including holidays and leave).
- Global search, notifications bell, Test mode.

## 10. Copy

- UI copy is **English**. Customer messages in demo data are mixed Chinese, English and Malay; keep multilingual support.
- Tone: short, plain, sentence case. No exclamation marks in UI chrome. Empty states are 2–3 words ("Nothing here", "No files", "Nothing to review").
- Exact strings are in the reference file. Reuse them verbatim.

## 11. Files in this package

- `Lead View App.dc.html` is the **single source of truth** for all 14 screens (template + logic + demo data).
- `support.js` is the runtime needed to open the reference file locally (design tool only, not for production).
- `README.md` is this document.
- `screenshots/01-inbox.png` … `14-settings.png`: one capture per screen in its default state, in nav order. Use them for visual comparison. Interactive states (menus, modals, expanded nav, edit modes) are only in the HTML file. The captures were rendered scaled down, so a few labels wrap that do not wrap in the browser (e.g. "How it talks" on AI Agent). The HTML is the source of truth.

Earlier per-screen references in the repo (`docs/design_handoff_lead_view_inbox/*.dc.html`) are **outdated**; use them only for history.
