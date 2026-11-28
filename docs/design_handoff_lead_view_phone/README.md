# Handoff: Lead View — phone version (iPhone + Android)

## Overview
Lead View (`/leads`, Customer Service's inbox for the brands) has no phone layout today: under 768px `LeadShell` only hides the rail, the search and *Test mode*, and the three-column Inbox does not fit. This design gives Lead View a phone app built on the **Revenue CRM phone framework** (`src/components/member/crm`, v4 handoff frames 10b / 11a) in **Lead View's own colour tone** (`--lv-*`), with the punch (Me) reachable from its Profile tab.

Repo: `wenwei4046/Venture-Portal`.

## About the design files
The files in this folder are **design references made in HTML** — a clickable prototype and a static canvas. They show the intended look and behaviour; they are **not production code to copy**. Recreate them in the existing Next.js / React / TypeScript codebase with its own patterns: inline styles and view models as the CRM phone does (`sales/vm/*.ts` decide, the screens draw), Lead View's `lead_*` DEFINER functions and server actions for data, `typePx` / `fs` for phone type, `var(--lv-*)` tokens for colour. All data in the files is mock data.

To view: open `Lead View Prototype.dc.html` in a browser with `LeadPhone.dc.html`, `icons.json`, `ios-frame.jsx`, `android-frame.jsx` and `support.js` beside it.

## Fidelity
**High-fidelity.** Colours, sizes, radii, spacing and copy are final unless listed under *Open decisions*. Lift exact values from the inline styles in `LeadPhone.dc.html`. Structure and measurements of the shared chrome come from the CRM phone source — where this README and that source disagree on a shared part, **the CRM source wins** (reuse the component rather than redraw it).

## What to reuse from the codebase
| Part | Source to reuse / follow |
|---|---|
| App shell, safe areas | `crm/crm.module.css` › `.app` (fixed, `--crm-top = inset-top + min(8px, inset-top)`, bottom `--safe-bottom`) |
| Bottom bar | `crm/shared/phone4a.tsx` › `Phone4aBar` (52×30 pill, 22px icon, 11px label, badge 18px) |
| Inbox header, chips, rows | `crm/shared/inbox-v4.tsx` (frame 10b: `Head`, `SearchField`, `Chip`, `Avatar`, `Tag`, `TimeOrWait`, `MessageLine`) |
| Chat head, strip, bubbles | `crm/sales/SalesChat.tsx`, `crm/shared/phone4a.tsx` › `Phone4aStrip`, `crm/sales/vm/chat.ts`, `crm/shared/chat-media.ts` (`INLINE_TIME`) |
| Composer | `crm/sales/SalesComposer.tsx` + `ChatComposer.tsx` (keyboard fitting, box height 52–154 from `scrollHeight`) |
| Customer info sheet | `SalesChat.tsx` › `hm.infoOpen` sheet |
| Leads list page | `crm/sales/SalesContacts.tsx` (title + count, 40px search, 42px avatar rows) |
| Profile | `crm/shared/phone4a.tsx` › `Phone4aProfile` |
| Me pages + punch | `src/components/me/*` (`MeApp`, `MeOverlay`, `MeCard`, `AttendanceScreen`, `LeaveScreen`, `PayslipScreen`, `RequestScreen`, `Camera`) |
| Lead View data / rules | `src/app/(portal)/leads/_components/*`, `src/lib/leads/*`, `.claude/rules/leads/lead-view.md` |

## Devices and safe areas
- **iPhone**: screen 402 × 874. Dynamic Island 126 × 37 at top 11, status bar 62 high, home indicator zone 34. The app is full-bleed under the status bar: top padding **70** (62 + 8), every bottom element adds **34**.
- **Android**: screen 412 wide; status bar 40 and gesture bar 24 sit **outside** the app area (app area 412 × 828 in the mock), so the app's own insets are 0. Status bar takes the screen's top colour, gesture bar the screen's bottom colour.
- In production use `env(safe-area-inset-*)` / `--safe-bottom` exactly as `.app` in `crm.module.css` does; do not hard-code the numbers above.

Bottom paddings (source padding + inset): tab bar `8 + inset`, composer `10 + inset`, sheets `24 + inset`, Leave footer `12 + inset`, camera shutter area `30 + inset`. Toast: `bottom: 96 + inset` on a tab, `74 + inset` in a chat.

## Screens

### 1. Inbox (tab root)
- Padding `10px 20px 0`, column gap 16.
- **Title row**: "Inbox" Inter Tight 500 30px, letter-spacing −.025em. Right: three 40px round buttons (1px `#E7E5D4`), gap 8: search · bell (8px rust dot, 2px white ring) · house (back to the portal home).
- **Chip row** (34px high, radius 17, 13px, gap 6, scrolls sideways, bleeds to the edges): `All brands ▾` outlined (opens the Brands sheet) · 1px divider · Waiting · Answered · Handed · All · then labels in use (Hot lead, VIP). Selected: bg `#E9E9C7`, border `#C9C79A`, weight 600. Unselected: `#F7F6EE`. Count 500 `#8A7E75`; Waiting's count rust `#A3401A` when not selected. Default = Waiting.
- **Search**: the search button swaps the chip row for a 34px field (`#F7F6EE`, radius 17, 16px input, placeholder "Search name, phone or message") + rust "Cancel"; while a query is typed the status filter is ignored.
- **Rows** (padding `14px 20px`, gap 14, 1px `#F3F1E7` top line, every row the same height ≈ 95px):
  - Avatar 50px `#EFEEDD` / initials `#30673A` Inter Tight 500 17px; channel badge 18px bottom-right (Messenger `#0A7CFF`, Instagram `#C13584`, 2px white ring, 9px white glyph).
  - Line 1 (20px): name 17px (600 unread, 500 read) + optional label tag (20px, radius 10, `#F7F6EE`, 6px dot, 11.5px 500 `#5E524A`) · right: **the wait** while the chat waits (clock, or triangle-alert from 1 h; 13px 600; `#8A5A12` under 1 h, `#A3401A` from 1 h; "17 m", "1 h 05 m", "1 d 3 h") — else the time (13px 500, rust when unread, else `#A3978D`).
  - Line 2 (16px): `Brand · ad name`, 13px `#A3978D`, ellipsis.
  - Line 3 (22px): when a phone is on file, phone icon 13px + number 14px 500 `#30673A` + "·" — then the last message 15px `#5E524A` (prefixed "You: " when ours), ellipsis · unread badge 22px rust.
  - Empty: "No chats here".
- **Brands sheet**: bottom sheet (radius 26 top, handle 40×5), title "Brands" Inter Tight 22px, pills 44px (All brands · 2990s · 2990s mini · Carress) with counts; the picked one `#E9E9C7` / `#C9C79A`.

### 2. Chat (pushed over the tab, no tab bar)
- **Head** (white, 1px `#E7E5D4` under): chevron-left 24px in a 40px target · avatar 40px · name 15px 600 + sub 11.2px `#8A7E75` "Brand · ad · Messenger|Instagram" (tap → Customer info) · ⋮ in a 40px `#F7F6EE` circle.
- **Phone strip** (min-height 44, 13px, 7px dot) — Lead View's use of `Phone4aStrip`:
  | State | Background / text | Words | Actions |
  |---|---|---|---|
  | phone found, not confirmed | `#FBEFE7` / `#A3401A` | "Phone found · 012-338 4721" | *Not a phone* (text) · **Confirm** (32px rust pill) |
  | confirmed, not handed | `#E9EEE7` / `#30673A` | "Phone confirmed · …" | **Hand over** (32px green pill) |
  | no phone | `#F7F6EE` / `#8A7E75` | "No phone yet · ask for the number" | — |
  | handed | `#F7F6EE` / `#8A7E75` | "Handed to 2990s sales · Handed" | — |
- **⋮ menu** (264px, radius 20, shadow `0 16px 36px rgba(43,33,28,.16)`): Customer info · Hand over · Mark unread — 36px tinted tile, label 13px 650, sub 10.5px.
- **Wall** `#FBFAF4`, padding `16px 16px 10px`, messages gap 10, bottom-anchored. Day pill: 11.2px uppercase, `rgba(255,255,255,.7)`, radius 12.
- **Bubbles**: max-width 80%, padding `6px 9px 7px 11px`, text 15px / 1.45, shadow `0 1px 1px rgba(43,33,28,.10)`. Customer: white, 1px `#E7E5D4`, radius `16 16 16 4`. Ours: `#E9E9C7`, 1px `#DCDCB4`, radius `16 16 4 16`. Time inline, floated right, 9.5px `#8A7E75`, margin `8px 0 -5px 12px`; "Sent by {template} ·" italic before the time for an automatic reply.
- **Composer** (on `#FBFAF4`): white pill min-height 52, radius 26, shadow `0 1px 2px rgba(43,33,28,.14)`: smiley 25px · textarea (16px / 22px, one to six lines, max 154px, placeholder "Reply to {first name}…") · attach · camera (all `#8A7E75`); 52px rust circle to the right — mic when empty, send when there are words. Enter sends, Shift+Enter breaks the line.
- Sending appends the bubble, clears the box, moves the chat to *Answered* (a handed chat stays *Handed*), scrolls to the newest.
- **No AI draft card** (removed at the owner's word).

### 3. Customer info (bottom sheet over the chat — the CRM's ⋮ › Customer info)
- Scrim `rgba(43,33,28,.32)`; sheet white, radius 24 top, padding `10px 20px (24 + inset)`, gap 14, handle 36×4 `#E7E5D4`, max-height 88%.
- Head: avatar 52px · name 16.3px 700 + "First contact today" 11.2px · **Edit** pill (34px, 1px line, rust 11.2px 650, pencil).
- Phone prompt (only while the phone is unconfirmed): `#FBEFE7`, radius 14, "012-338 4721 · theirs?" + *Not a phone* + **Confirm** (36px rust pill).
- Field card (radius 14, 1px line; rows `12px 14px`, 12px; key `#8A7E75`, value 600 right-aligned, empty "—" `#C4B9AE`, a 10.5px note under the value): Phone (found in the chat / confirmed) · Outlet (from the ad) · Interest · Showroom · Visit · Language · Note.
- Buttons (50px, radius 25): **Copy details** (outlined) · **Hand over to {brand} sales** (rust, flex 1.6; grey `#C4B9AE` "Handed over" once done).
- Hand-over rule (existing behaviour, `CustomerPanel.tsx` / `HandoffWindow.tsx`): needs a **confirmed** phone; otherwise the details are copied for the sales group. On success: state → handed, stage → Handed, toast "Handed to 2990s sales · WhatsApp opened".

### 4. Leads (tab root — on the CRM Contacts page)
- Padding `10px 28px 24px 20px`, gap 16. Title "Leads" Inter Tight 500 28px + the count 14px `#A3978D`.
- Search field 40px, radius 20, `#F7F6EE`, "Search name or phone".
- Stage chips (same chip as Inbox): All · No phone yet · Not handed yet · Handed · Appointment · Closed (production: the full pipeline from `lib/leads/stage.ts`).
- Rows (`10px 0`, 1px `#F3F1E7` under): avatar 42px · name 15px 500 · right: 7px square dot + stage 12px 500 · line 2 13px: phone (`#5E524A`, or "No phone yet" `#A3978D`) · "Brand · Outlet · ad" `#A3978D` ellipsis. Tap opens the chat.
- Stage dots: No phone yet `#C4B9AE` · Not handed yet `#A3401A` · Handed `#8A5A12` · Contacted `#4E6170` · Appointment `#7A4F6E` · Came `#30673A` · Closed `#2B211C` · Lost `#C4B9AE`.

### 5. Insight and Campaigns (tab roots — placeholders, see Open decisions)
- Insight: period segmented control (7 days · 30 days · This quarter; track `#F7F6EE` radius 10, option 30px radius 8, on = white + `0 1px 2px rgba(43,33,28,.12)`), a sand card "From message to sale" (Chats → Got phone → Handed to sales → Came to showroom → Closed, 6px bars), "Phone rate by brand".
- Campaigns: cards (radius 18, 1px line) with name, status tag (Sent / Scheduled / Draft), brand, one line; "Writing and scheduling a campaign opens on a computer."

### 6. Profile (tab root — `Phone4aProfile`)
- Background `linear-gradient(180deg, #EAE8DA 0%, #F4F2E8 18%, #fff 42%)`; padding `14px 20px 24px`, gap 16.
- House button 40px top-right; avatar 92px rust, 4px white ring; name Inter Tight 22px; "Customer Service · Lead View" 13px `#8A7E75`.
- **Punch card** (radius 16, `#2B211C`, padding `14px 16px`): clock Inter Tight 26px · title 15px 600 + sub 12px `#E9DCD0` · white 44px pill button, rust words.
  - Not in: "Not in yet" / "Work day · starts 09:00" / **Clock in**
  - In: "Clocked in" / "IN 14:32 · HQ" / **Clock out**
  - Out: "Done" / "IN 14:32 · OUT 18:03" / no button
  - Words and rules are `lib/me/today.ts` › `todayCard`; this is `MeCard` in Lead View's look.
- **Groups** (label 11px uppercase `#A3978D`; white card radius 16, shadow `0 1px 2px rgba(43,33,28,.04), 0 6px 18px rgba(43,33,28,.06)`; rows `12px 16px`, 34px rust tile radius 10, label 15px 500, a 12px `#8A7E75` note under it, right: rust 22px badge or a grey figure, chevron):
  - **Me**: Attendance (today's punch · "1 day to fix", badge) · Leave ("Annual 9.5 days left · next 3–4 Dec") · Payslip ("October 2026 is ready") · Submit request ("Overtime, correction, manpower", badge)
  - **Lead View**: Quick replies · General info · Working hours
  - **The portal**: Switch view · Sign out
- The notes under each row are live values in production (today's punch from `todayCard`, days to fix from `needsOf`, leave left from the ledger, the newest payslip month, requests waiting).

### 7. Clock in / Clock out camera (full-screen layer over Profile)
Behaviour is `src/components/me/Camera.tsx` unchanged (front camera, live only, server time, fences, a reason outside a fence, 900 ms "Stamping the time…"). New look:
- Background `#0E0C0B`, white text; status bar glyphs turn white.
- Top row: 40px round close (`rgba(255,255,255,.12)`) · title Inter Tight 18px ("Clock in" / "Clock out") with the date 12px 60% white under it.
- Feed: margin `12px 16px 0`, radius 28, fills the space. Oval guide 204 × 264, 2px `rgba(255,255,255,.9)`, everything outside darkened (`box-shadow: 0 0 0 999px rgba(14,12,11,.58)`). Hint pill top-centre "Face in the oval · hold still"; bottom-right pill "Live only · no gallery" with a lock.
- Info card: margin `12px 16px 0`, radius 22, `rgba(255,255,255,.07)`, 1px `rgba(255,255,255,.1)`.
  - Row 1: "SERVER TIME" 10.5px uppercase + the time Inter Tight 34px tabular · right: status pill (26px) + a 11.5px line.
  - Row 2 (1px divider): 36px green-tinted circle with map-pin · "HQ · Jalan Puchong" 14px 600 + "38 m away · inside the 150 m fence" 12px · right "✓ Inside" green. Outside a fence: use the source's flag / refuse words and the reason field.
- Shutter: 76px, 4px white ring, rust fill, 6px soft halo; under it "Take a selfie to clock in / out" 12.5px.
- Saving overlay: `rgba(14,12,11,.78)`, 56px green-tinted circle with a check, "Stamping the time…".
- Toast after a punch is `punchToast`'s: "IN 08:57 · HQ · on time", "IN 09:12 · HQ · late 12 min", "OUT 17:40 · HQ · early out".

### 8. Me pages (pushed over Profile; header "‹ Profile" rust 14px 600, 44px; body padding `2px 20px 32px`, gap 20)
Structure and words are the existing Me screens; colours are Lead View's.
- **Attendance** (`AttendanceScreen.tsx`): title + "Mon–Fri 09:00–18:00 · HR closes November on 3 Dec"; totals card (4 columns: Present · Late · Leave · OT); month grid Mon–Sun, 44px cells radius 10 — Present `#E9EEE7`/`#30673A`, Late `#F4F0E6`/`#8A5A12`, Incomplete `#FBEFE7`/`#A3401A`, Leave `#EEF0F4`/`#4E6170`, off day `#F7F6EE`; picked day 2px ink ring, today 1.5px rust ring; legend; the picked day's card (title, status chip, In / Out / Place, *File a correction* when incomplete); "Needs action" banner (`#FBEFE7`) with a rust **Fix** pill.
- **Leave** (`LeaveScreen.tsx`): title + sub; underlined tabs (12px uppercase, 2px rust underline) Annual · Medical · Emergency · Unpaid; balance card (radius 20, min-height 212, big figure Inter Tight 46px, 6px progress, three facts, a note) — card fills in order: rust `#A3401A`, ink `#2B211C`, green `#30673A`, khaki `#E9E9C7` (dark text); "Waiting for a decision" list; footnote; fixed footer: **Apply · annual** (rust, 50px, flex 1.6) · **History · 3** (outlined).
- **Payslip** (`PayslipScreen.tsx`): year header "2026 / NET PAY", 1px ink rule, the open month greyed with "—", then each paid month (15px 500 + "Paid 30 Oct" 12px, net pay right, chevron); footnote "Tap a month for the full payslip and PDF."
- **Submit request** (`RequestScreen.tsx`): three entries with 36px tinted glyph tiles (Overtime `#FBEFE7`/rust, Correct a punch `#EEF0F4`/`#4E6170`, Extra manpower `#E9EEE7`/green); "Status · everything you sent" + segmented All · Waiting · Decided; request rows with a status chip (Waiting `#F4F0E6`/`#8A5A12`, Approved `#E9EEE7`/`#30673A`, Rejected `#FBEFE7`/`#A3401A`).
- Forms behind Apply, History, the three request kinds, a payslip's detail and a request's sheet are the existing Me sheets (`LeaveSheet`, `OtSheet`, `CrSheet`, `MpSheet`, `PaySheet`, `RequestSheet`) — not redrawn here; restyle them with the same tokens.

## Interactions and motion
- Tab change: instant; the active pill's background fades .18s.
- Push (chat, Me pages): the layer slides in from the right, `transform .32s cubic-bezier(.2,.8,.2,1)`; back slides it out. Android Back should do the same (CRM note 10).
- Sheets: rise `translateY(105%) → 0` over .32s on the same curve; scrim fades .2s; tap the scrim to close.
- Toast: dark `#2B211C` pill-card (radius 14, 14px 600 white), 2.4 s.
- Opening a chat clears its unread (existing `lead_mark_seen`); *Mark unread* sets the caller's mark and closes the chat (`lead_mark_unread`).

## State (prototype → production)
| Prototype state | Production source |
|---|---|
| `tab`, `chat`, `filter`, `brand`, `q`, `searchOpen`, `menu`, `info`, `stage`, `period`, `me`, `lvTab`, `reqFilter` | screen state (one UI object + view models, as `crm/sales/ui.ts`) |
| contacts, messages, unread, waiting time | `lead_inbox`, `lead_contact_json`, Messenger unread (`withMetaUnread`), `inboxState` |
| phone found / confirmed / removed | `saveLeadCard` (`lead_save_card`), `phoneStage` |
| hand over | `lead_handoff` + WhatsApp, `handoffText` |
| send | `replyToLead` → `lead_reply` / `deliver` |
| leads + stages | `lead_leads`, `stageOf` |
| punch, Me data | `useMe`, `mePunch`, `todayCard`, `monthView`, `panels`, `slipYears` |

## Design tokens (Lead View — existing `--lv-*`)
- Ink `#2B211C` · body `#5E524A` · muted `#8A7E75` · faint `#A3978D` · disabled `#C4B9AE`
- Rust (primary / alert) `#A3401A` · rust tint `#FBEFE7`
- Green (phone / success) `#30673A` · green tint `#E9EEE7`
- Amber `#8A5A12` · amber tint `#F4F0E6` · slate `#4E6170` · slate tint `#EEF0F4` · plum `#7A4F6E`
- Khaki selected `#E9E9C7` · selected edge `#C9C79A` · own-bubble edge `#DCDCB4` · avatar `#EFEEDD`
- Surfaces `#FFFFFF`, `#FBFAF4` (chat wall), `#F7F6EE` (fields, chips), `#F4F2E8`, `#EAE8DA` (profile glow top)
- Lines `#E7E5D4`, `#F3F1E7`
- Camera `#0E0C0B`; on-dark sub `#E9DCD0`; camera green `rgb(150 215 170)` on `rgba(120,190,140,.16)`; camera amber `rgb(255 214 170)` on `rgba(255,214,170,.16)`
- Channel: Messenger `#0A7CFF`, Instagram `#C13584`
- Type: Inter (UI) and Inter Tight (titles, figures, initials) — the CRM phone's faces. Numbers `tabular-nums`.
- Radii: chips 17, round buttons 50%, cards 14–18, profile cards 16, sheets 24–26 top, bubbles 16/4, buttons 22–25 (pill), composer 26.
- Hit targets ≥ 40px (44 for text buttons).

## Assets
- Icons: Lucide 0.460 (Lead View's set, `src/components/layout/lead-lucide.ts`; the CRM's `icons4a.tsx`) and the HR set (`src/components/hrv/icons.tsx`) for Me. `icons.json` holds the paths the mock uses, flattened to one `d` each — for viewing only; use the codebase's icon components.
- Device frames (`ios-frame.jsx`, `android-frame.jsx`) are for the mock only.
- No images. The camera feed is a placeholder.

## Open decisions (confirm with the owner before building)
1. **Insight and Campaigns** tabs are light placeholders with invented figures — confirm their content, or drop them from the phone bar.
2. **Type**: the mock uses the CRM phone's Inter / Inter Tight; Lead View desktop uses Figtree + Georgia titles. Confirm which the phone uses.
3. **Camera**: the hint "Face in the oval · hold still" with a green dot/marker reads as face detection (the current camera does none), and the On time / Late / Early out pill is new (the current camera only warns on an early clock-out). Confirm both.
4. **Leave** balance cards are tap-to-switch here; the current app swipes (scroll-snap) — keep the swipe.
5. **Customer info** row type is 12px (the CRM phone's scale); enlarge if it reads small on Lead View.
6. Which Lead View pages open on a phone at all: here Inbox, Leads, Insight, Campaigns, Quick replies, General info, Working hours; Reply rules, Reply templates, Step library, AI Agent, Data Center, AI corrections, Audit log and Settings stay on a computer.
7. Permissions as today (`lead.inbox`, `lead.leads`, …; outlet staff scope; view-only composer) — not drawn; apply the desktop's rules.

## Files
- `Lead View Prototype.dc.html` — the clickable prototype: iPhone and Android side by side, each with its own state.
- `LeadPhone.dc.html` — the phone app itself (template + logic); the source of truth for values.
- `Lead View Phone.dc.html` — static canvas: the five Lead View screens side by side, plus the current Me hub / camera / Attendance for reference.
- `icons.json`, `ios-frame.jsx`, `android-frame.jsx`, `support.js` — needed only to open the HTML.
