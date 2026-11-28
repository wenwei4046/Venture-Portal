# Handoff: Marketing phone app (Marketing view on a phone)

## Overview
The phone version of Marketing's view (`/marketing/**`) in `wenwei4046/Venture-Portal`. Today a phone keeps the portal's phone shell on Marketing's pages; this is the app that replaces it, in the manner of the HR app (`src/components/hr-app`) and the Finance app (`src/components/fin-app`).

Chosen direction (the user picked it over a task-first home with the pet folded into a strip): **five bottom tabs with a raised + in the middle — Tasks · Projects · ＋ · Space · More.** The room, pet, lobby and chat live on their own Space tab; Tasks is work only.

## About the design files
The files here are **design references built in HTML** — working prototypes that show the intended look and behaviour. They are not production code. Recreate them in the repo's own stack (Next.js App Router, React 19, CSS modules, the `--mk-*` tokens under `.mkt-shell` in `src/app/globals.css`, Server Actions and the `mkt_*` DEFINER RPCs), following the patterns the HR and Finance apps already use for a phone app.

Each `*.dc.html` is a Design Component: markup with `{{ holes }}`, `<sc-for>` / `<sc-if>`, and a `class Component extends DCLogic` logic block with React class semantics (`state`, `setState`, `renderVals()`). `support.js` is the prototype runtime only. **The logic block is the functional spec** — read `renderVals()` and the handlers.

| File | What it is |
|---|---|
| `Marketing App.dc.html` | The prototype: one phone, every screen, all interactions. Props: `device` (ios / android), `role` (staff / manager), `petSpecies`, `petColor`, `petName`. |
| `Marketing App Devices.dc.html` | The same app twice, iPhone and Android side by side. |
| `Marketing Mobile.dc.html` | Static board: the 1b stills, the **pet lab** (the pet's rules, playable) and the desktop My Space recreated for reference. |

## Fidelity
**High-fidelity** for layout, colour, type, spacing, states and copy. All values are inline in the files and come from the repo's tokens. Sample data (people, tasks, claims, chat lines, profile details, request numbers) is invented and must come from the real readers.

## Device frame
- Screen 390 × 844 in both. Design content at 14px base; hit targets ≥ 44px.
- **iPhone:** status bar 54px (time left, signal / 5G / battery right), Dynamic Island 120 × 35 at top 11px, home indicator 136 × 5 at bottom 8px. Tab bar 88px tall with 26px bottom padding so labels clear the indicator.
- **Android:** status bar 38px, punch-hole camera 16px at top 11px, a 46px system navigation bar (◁ ○ □) under the app. ◁ closes a sheet, else steps back inside Claim, else pops the pushed screen, else leaves a visit, else returns to Tasks. ○ returns to Tasks. Tab bar 66px with 6px bottom padding.
- In production these are the OS's own; honour `env(safe-area-inset-*)`. The prototype draws them only to prove the layout clears them.
- The Space tab's cover runs under the status bar; every other screen starts below it.

## Navigation model
- **Tabs:** Tasks, Projects, ＋ (opens the New sheet), Space, More. Active tab: icon on a `rgb(236 229 219)` 30px rounded tile, label 600. Badges: Tasks = cards in My turn; Space = unread chats.
- **Pushed screens** slide in from the right over the tabs (`transform .26s cubic-bezier(0.2,0.8,0.2,1)`), with a 48px header: ‹ back, title, optional right-hand sub-line. Screens: Task, Calendar, Chat (list / lobby / thread), Notifications, My profile (view / edit), Claim (list / detail / form), and a placeholder for pages not drawn.
- **Bottom sheets** slide up over a `rgb(51 36 27 / .45)` scrim (`.28s`, radius 22px top): New, Quick / Recurring task, Punch, Request changes (also used for a claim's Reject).
- **Toast:** dark pill above the tab bar, 2.4s.

## Screens

### Tasks (tab)
- Header: "Tasks" 22/600; a Punch chip (`🕘 Punch in` → `🟢 In · 09:41` → `Out · 18:02`) opening the Punch sheet; a bell with the unread count opening Notifications.
- Segmented control: 👉 My turn · ⏳ Waiting · 📤 Delegated, each with its count (My turn's is red when non-zero).
- Cards (radius 12, 12px padding, white; red-soft ground and red edge when late or changes were asked): title 15/600, a meta line (subsidiary dot · Stage n/N · stage · Due), a status pill, and Open or an orange Review. The whole card opens the task. Order: red first.
- "🗓️ This week": the dates on the plate up to Sunday, red when late; "Calendar ›" opens Calendar.
- Rules are the repo's: `src/lib/marketing/my-space.ts` (`plateColumns`, `weekRows`, `plateOf`).

### Task page (pushed)
- Track ID (Chivo Mono 11) and status pill; title 22/600; a 2 × 2 facts block (Now with, Subsidiary, Stage due, Stage) on `rgb(250 248 244)`.
- One role banner, by who is looking: the doer ("It's your turn", n required fields left), the doer after a rejection (red-soft, the approver's words quoted), the approver ("Needs your approval"), the delegator ("{name} delivered"), a bystander ("With {name}"), done (green).
- Workflow strip: horizontally scrolling 118px cards, a 3px top bar (green done, orange now, red late), ✓ or the number, the stage's name, who.
- The stage's fields: editable only for the doer before submit; read-only text otherwise. A required field missing at submit gets a red border and the toast names it.
- Sticky action bar: **Submit for approval** (or **Complete stage** when the stage has no approver); **Request changes** + **Approve** for an approver or a delegator; **🔔 Nudge {name}** for a manager on a task that waits on somebody (once; the repo allows one an hour per person and task).
- Request changes opens a sheet: textarea, 5–500 characters, "Send back".
- Source: `src/components/mkt/task/TaskFlow*.tsx`. The desktop page's sections not drawn here: Requirements body, tables, file uploads, subtasks, the PIC link, posts, the Free space, the full Activity list, Reassign and the handoff picker for a 🔓 stage.

### ＋ New (sheet)
- Subsidiary chips (first five), then ⚡ Quick task, 🔁 Recurring task, 📦 Product project (greyed with "Manager only" for staff).
- Quick / Recurring: title (≥ 3 characters, else a red border and a line), type chips (Ads, Social Media, Content (Video), Brand, Other), a note of what will be made, Back / Create task. The new task lands first in My turn and the toast gives its Track ID.
- Not drawn: the stage builder, approvers, the Repeat block (every / starts / ends, next runs), requirements, the whole product-project flow.

### Projects (tab)
- Breadcrumb as the title (Projects › subsidiary › project), search, Open · Done · All with counts.
- Root: the subsidiaries as 60px rows (emoji tile with the dot, items, a red late count). A subsidiary: its product projects (folders) and Quick tasks; a project: its tasks. A task row: kind glyph, title, Track ID · stage · due, a status pill. Tap opens the task page.
- Source: `src/components/mkt/projects/ProjectsList.tsx`. Not drawn: grid view, the details pane, delete and undo.

### Space (tab)
- Cover 150px (one of the four presets), avatar 80px overlapping by 36px, the pet beside it; name 20/600 with the role; an inline status input (80 characters) and the pet line.
- Room tile 230px: wall, window, floor planks, furniture at 0.75 scale, the pet wandering (`left 2.6s ease-in-out`, every 2.8s). "🎨 Wall" cycles the wall colour (a stand-in for Decorate).
- Pet tile: name, level pill, XP and energy bars, **🍙 Feed · n** and **🏃 n/3 left**.
- Chat row: last unread line and the unread count; opens Chat.
- Lobby tile 170px: everyone's pets with name tags, the lobby's last message over its sender's pet. A teammate's pet opens a **visit**: a dark bar "👀 You're visiting X's space · ← Back to mine", their cover, room and pet read-only, **💬 Message X** and **👋 Wave**.
- Trophies tile.
- Source: `src/components/mkt/myspace/*`, `src/lib/marketing/space.ts`. Not drawn: Edit layout (the repo already hides it on a narrow screen), the Room & pet drawer, cover and avatar upload, first-visit pet setup, Notes and Photo tiles.

### Chat (pushed, from Space)
- Tabs 💬 My chats · 🏛️ Lobby with unread dots. Peer rows 60px: avatar on the title's tone, name (700 when unread), time, last line.
- Thread: bubbles (mine on `#EC9B55`, theirs on `rgb(246 244 240)`), a task card (📎 Track ID, title) that opens the task. Composer: 📎 opens a list of the viewer's tasks to attach, input (500), send. Enter sends.
- Source: `src/components/mkt/myspace/ChatTile.tsx`. Not drawn: "Earlier messages", 🔍 Review for a full-access login.

### More (tab)
A phone layout, not the sidebar:
1. Profile card — avatar, full name, role · HOUZS Marketing, › to My profile; under it today's punch line and a Punch in / Punch out button.
2. A 2 × 2 grid of large tiles — Calendar (n today), Claim (red count: staff = sent back, manager = to approve), Library, Meeting Rooms.
3. Subsidiaries — a horizontal row of 92px cards (emoji, dot, name, "n open", red late count); each opens Projects at that subsidiary. "All ›".
4. Manager tools (manager only) — one grouped card, 56px rows with a line of description: Tracking Dashboard, Workflow Builder, Product Builder, Minutes Builder, Replace Person, Billing, Pool.
5. A settings card — Appearance, Change view, Change password, Sign out (red).

The descriptions under each entry, the punch row and Change password / Sign out were added in design; they are not in `src/lib/marketing/nav.ts`.

### Calendar (pushed, from More or This week)
- A week strip (Mon–Sun) with up to three tone dots a day, today on brown; tapping a day filters the agenda to it.
- Layer chips with counts — 📣 Posts, ⏱ Due, 🗓️ Shoots — and a Mine switch.
- Agenda by day: 56px rows, tone ground and edge (a due date is white with a dashed edge), icon, title, subsidiary line, status. A row with a task opens it.
- Source: `src/components/mkt/calendar/MktCalendar.tsx`. Not drawn: Month and Week views, ‹ › and Today, the subsidiary filter, the day and detail panels.

### Notifications (pushed, from the bell)
Rows with an icon tile, the notice, its meta line and an unread dot; a tap marks it read and opens its task.

### My profile (pushed, from More)
Built from Me's hub and profile (`src/components/me/HubScreen.tsx`, `ProfileScreen.tsx`):
- Avatar 68px with a camera badge, name, role, ✎ Edit.
- Today card (dark): the clock, the punch line, Clock in / Clock out — the same state as More's punch row.
- Tiles, three across: Attendance, Leave, Payslip, Hierarchy, Submit request, Documents; My team for a manager.
- Request status: the latest requests with a status chip; "All ›".
- Four record cards: Contact, Emergency contact, Salary account, Kept by HR.
- **Edit profile:** Contact, Emergency contact, Salary account fields; a changed field gets an orange edge; "Send to HR for approval" is faded until something changed. After sending: a "Change waiting for HR" banner and a Pending "Profile change" request.
- The tiles use emoji here; Me uses its own line icons (`src/components/me/kit.tsx` › `Icon`) — use those.

### Claim / Claim and approve (pushed, from More)
Built from `src/app/(portal)/claims/_components/ClaimHub.tsx` and `ClaimDrawer.tsx`:
- **Staff — Claim.** Dark hero (total not paid yet); filter chips All · Draft · With Finance · Sent back · Paid with counts; search; rows with what, amount, date · kind · reference, a where-it-is chip and by whom. Sticky **+ New request**.
- **Detail.** Kicker (Claim / Direct payment), chip, amount, what, "Pay to …", the note of where it is; "Why it was sent back" when rejected; reference, date, from, pay; the receipt. Buttons by status: Cancel request, Edit / Fix and send again, Submit.
- **New request.** Two kind cards (Claim — I paid, pay me back; Direct payment — pay the supplier), what (≥ 3 characters), amount (> 0), Pay to (direct payment only), receipt, Save as draft / Submit. Staff's goes to their approver then Finance; a manager's own goes straight to Finance.
- **Manager — Claim and approve.** Chips To approve · All Marketing · Mine. A request waiting for the manager has a tick box; with any ticked the bar shows "n selected · RM x", Reject and Approve. Detail: Reject… (reason sheet, 5–500) and Approve — send to Finance.
- The chip words (Waiting for approval, Sent back, In payment voucher …) were written in design; take the real ones from `src/lib/payment-requests/model.ts` (`whereItIs`, `whereItIsNote`, `staffCards`, `approveCards`, `staffHero`, `approveHero`).

### Punch (sheet)
Heading Punch in / Punch out, the date, a large clock, a map placeholder (position and the office fence), an "Inside · HQ office · 12 m · ±8 m" line, the day's log, the button. Backend is ready in the repo: `att_punch(direction, lat, lng, accuracy, device, photo_path, reason, source)`. Not drawn: outside the fence (reason, or refused by policy), the photo, permission denied, no GPS.

## The pet
Rules as the repo has them (`src/lib/marketing/space.ts`, `my-space.ts`), reproduced in the pet lab:
1. energy < 20 → Hungry
2. late ≥ 2 or My turn ≥ 4 → Overloaded
3. a stage opened in the last 24h and not late → New task!
4. My turn ≥ 1 → Working
5. else Sleeping
- Feed: −1 snack, +20 energy (cap 100) → Eating 2.5s. Exercise: −15 energy, +10 XP for the first three a day → Working out 3s. A level reached → Level up! 3.5s.
- Levels at 0 / 100 / 250 / 450 / 700 / 1000 XP; the form changes at Lv 3 and Lv 5; sizes 30 / 34 / 38 / 42 / 46 / 52px.
- Art: system emoji with a CSS filter for colour and nine keyframe animations (`pIdle`, `pNew`, `pBusy`, `pOver`, `pSleep`, `pEat`, `pEx`, `pLvl`, `pHungry`, plus `pBub`) — the same as the desktop.

**Six points found in the code that the owner has not decided yet** (listed in the pet lab):
1. `idle` / Chilling is never returned by `petState()`.
2. A late card in Waiting (somebody else's) counts towards Overloaded.
3. A new stage that is already late shows no ❗.
4. A fourth workout still costs 15 energy and earns nothing.
5. Energy only falls through Exercise; it never decays.
6. XP per stage lives in the database. The prototype gives +20 XP and a snack only when a stage with no approver is completed — a stand-in.

## State (prototype → real)
The prototype keeps everything in one component's state; in the repo each maps to an existing reader or action:
- tasks, plate columns → `mkt_board`, `plateColumns`; stage writes → the task page's Server Actions
- chat → `readChatList`, `readChatThread`, `sendMktChat`, `readMktChat`
- pet → `mkt_pet()`, `careMktPet`; space → `mkt_space()`, `saveMktSpace`; lobby and a visit → `mkt_lobby()`, `mkt_space_of`
- calendar → `src/lib/marketing/calendar.ts`; projects → `src/lib/marketing/projects.ts`, `drive.ts`
- notices → `mkt_notices`, `readNotices`
- claims → `my_payment_requests`, `payment_requests_for_approval`, `saveRequest`, `cancelRequest`, `approveRequests`
- profile, punch, requests → Me (`src/components/me`, `src/lib/me`, `att_punch`)
- role → the viewer's permissions (Marketing · Manage for the manager tools; Claims · View at Dept for Claim and approve), never a prop

## Design tokens
All from `.mkt-shell` in `src/app/globals.css`:
- Primary `#EC9B55`, hover `#E0893F`, text on it `rgb(43 31 23)`
- Ink `rgb(51 36 27)`; text-2 `rgb(74 64 58)`; muted `rgb(117 100 86)`; faint `rgb(160 150 140)`; brown `rgb(90 62 43)`
- App ground `rgb(243 243 241)`; surfaces `#fff`, `rgb(250 248 244)`, `rgb(246 244 240)`; active `rgb(236 229 219)`; hover `rgb(241 236 228)`
- Lines `rgb(229 222 211)`, `rgb(236 231 224)`, `rgb(240 236 230)`; card line `rgb(229 228 223)`
- Status — red `252 236 233` / `236 190 184` / `176 40 34` / dot `200 52 42`, soft `255 247 245`; waiting `251 243 225` / `236 214 164` / `138 92 10` / `214 152 30`; done `232 244 235` / `190 222 199` / `40 110 64` / `60 150 90`; draft `243 242 239` / `226 223 217` / `98 92 86` / `160 154 146`; meet `oklch(0.96 0.025 235)` / `oklch(0.88 0.04 235)` / `oklch(0.42 0.10 235)`
- Tile tones — sand `239 228 217`, mist `230 237 241`, peach `249 231 216`, cream `246 238 222`
- Room — wall peach `#f3dcc8`, floor oak `#e9cfa8` / `#dcbd92`; lobby `#efe6d8`, `#e9dfcf` / `#e1d4c0`; cover 0 `linear-gradient(135deg, oklch(0.86 0.07 60), oklch(0.84 0.07 20) 50%, oklch(0.82 0.06 330))`
- Type — Inter (the user's Appearance choice applies), Chivo Mono for Track IDs, amounts, dates. Section labels 11px / 500 / uppercase / .12em.
- Radii — 8 (inputs), 10–12 (buttons, cards), 14–16 (tiles, grouped cards), 22 (sheet top), 999 (pills)
- Shadows — hover `0 6px 18px rgb(51 36 27 / .08)`; ＋ button `0 6px 14px rgb(51 36 27 / .22)`; toast `0 8px 24px rgb(51 36 27 / .25)`

## Not done yet
**Pages that open a placeholder:** Library, Meeting Rooms, all seven Manager tools, Appearance, Change view, Change password, Sign out, New product project (manager), My profile's seven tiles and "All ›" requests.

**Drawn only in part:** Task page (see its list above), New task (no stage builder or Repeat block), Calendar (no Month / Week), Projects (no grid, details pane or delete), Space (no Decorate drawer, uploads, pet setup, Notes, Photo), Punch (inside the fence only), Chat (no earlier messages or Review).

**Not designed at all:** loading, empty-account and error states; offline; push notifications; viewing as somebody; the Principal's shared login (no pet, reads the lobby only); landscape and tablets; widths other than 390.

**Known rough edges in the prototype:** Android's □ does nothing; the Dynamic Island and punch-hole sit over a pushed screen's header area only as chrome; the Android frame reuses the iPhone's 390 × 844 screen; changing the avatar only shows a toast; "Add a receipt" attaches a made-up file name.

## Assets
None. Pets, furniture and icons are system emoji, as on the desktop. No images were generated.
