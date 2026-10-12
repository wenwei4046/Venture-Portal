# RS (Sales template) · rev 1010 · Developer change list

> **Must-do before release:** iPhone safe areas. The CRM root `.app` (`crm/crm.module.css`, `position: fixed; inset: 0`, page `viewportFit: "cover"`) has no safe-area padding, so content can sit under the camera / Dynamic Island, status bar and home indicator. Add `env(safe-area-inset-*)` padding to `.app` and to every bottom sheet / full-screen overlay. Full spec and acceptance in `Control Panel rev 1011 dev changes.md` › "MUST · iPhone safe areas". Test on a real iPhone (Safari + Home-screen app, portrait + landscape).

Applies to everyone who sells: RS, TA, TL, STL, HOD, Director, Principal.
Code: `src/components/member/crm/sales/` (paths below relative to it).
Design reference: `rev 1010.dc.html` (frames 1–6.3, plus 2.1 and 5.1).

---

## 1 · Chat (`SalesChat.tsx`, `vm/chat.ts`)

**1.1 Chat background (like WhatsApp)**
- Chat list area (`data-chat-list`): `background-color: #EFE7DE`, line-icon pattern tile 240×240 px (SVG data URI, icons stroke `#7A6457` at 13% opacity). Bleeds to the edges: `margin: 0 -20px; padding: 10px 20px`.
- Day pill (Today / Yesterday): background `#FFFFFF` + `box-shadow: 0 1px 1px rgba(63,43,34,.10)`.
- System rows (Showed up / No show): background `rgba(255,255,255,.8)`.

**1.2 Bubble colours**
- Own bubble: `#FCD6B8` (was `#FFF0E4`), border same colour.
- Customer bubble: `#FFFFFF`, border `#FFFFFF`.
- All bubbles: `box-shadow: 0 1px 1px rgba(63,43,34,.10)`.
- Long-press menu preview bubble uses the same own-bubble colour.

**1.3 Message time**
- Time under customer bubbles aligned right too: `timeJustify: "flex-end"` for both sides.

**1.4 Header**
- Remove the "· reply window open Xh Ym" line under the customer name (`cl.window`). The Cold-lead banner when the window has closed stays.

**1.5 ⋮ menu**
- Closes on a tap anywhere outside the menu. Replace the fixed transparent backdrop (it sits inside the header and is covered by the chat list) with a document-level `pointerdown` listener: close unless the target is inside the menu or the ⋮ button.
- Appointment item: remove the sub-label "View, change or cancel" (`sub: ""`).
- **Move: show only when there is an upline to hand over to.** Implement in `vm/chat.ts`:
  - `superior = personOf(owner.uplineId, data.people)` (line ~147) already holds the target.
  - When `!superior`, drop the Move item from the ⋮ menu (line ~170) instead of showing the fallback "Hand over to your Team Lead" with an empty person list.
  - Don't hard-code "Principal"; the rule is only `!!superior`.
- What this gives:
  - Principal in their **own** chat: no upline → **Move hidden**.
  - Principal after switching role (shell "Switch to"): the role's own upline applies → Move shown and works.
  - Principal / Director in a **downline's** chat: unchanged (2026-10-09 decision: Assign + Share + Move; Move goes to the owner's superior, which exists).
  - RS / TA / TL / STL / HOD with an upline: unchanged.
- Acceptance: open the ⋮ menu as Principal in an own chat → Share, Customer info, Appointment only. Switch role → Move is back and sends a move request to that role's upline.

---

## 2 · Contacts (`SalesContacts.tsx`, `vm/contacts.ts`)

- Call button: keep as is (`tel:+60…`, dials from the device's own SIM).
- Bug: `hasTel: !!c.phone.replace(/D/g, "")` should be `/\D/g`.

---

## 3 · Calendar (`SalesCalendar.tsx`, `vm/calendar.ts`)

**Tapping a visit opens Customer info first, then chat.**
- Applies everywhere a visit is shown: Today cards, Upcoming list, Day view, Month cells and Week columns.
- Opens the same Customer info sheet as Contacts (`ctOpen` / `ctRows`) with Edit and an **Open chat** button at the bottom. Open chat → the chat.
- Month / Week event chips: own `onClick` with `stopPropagation()` so the cell's select-day doesn't fire. The "+N" chip keeps select-day. Ignore taps right after a swipe.
- Calendar page needs the customer form (Edit).

---

## 4 · Customer info (shared · `vm/customer.ts › infoRows`)

- Add row **Last chat** after First contact = time of the last message in the conversation, from either side (same as Inbox, `lastReal(c)`).
- First contact and Last chat use one format: `dd/mm/yyyy, h:mm am` (e.g. `05/10/2026, 1:20 pm`).

---

## 5 · Insight (`SalesInsight.tsx`, `vm/insight.ts`)

**5.1 Leads / Appointments / Upcoming → list → Customer info → chat**
- Tap one of the three figures in the dark hero to open a list sheet (was `goInbox` / `goCal`).
  - Leads: leads created in the period, last chat newest first.
  - Appointments: visits in the period (not cancelled), newest first.
  - Upcoming: booked visits still to come, soonest first.
- Sheet: title "Leads · October" (Appointments / Upcoming; This week / Today / date range by period) + count on the right.
- Sheet height is fixed: top edge sits ~10 px below the Leads · Appointments · Upcoming row (measured on open; fallback `72%`). Same height for 1 or 50 rows. The list scrolls inside; at the end a divider "End of list".
- Row layout:
  - left, three lines: customer name (15px/650), phone (12px), salesperson name (11px, `#A8968B`, **Team view only**)
  - right, two lines aligned right, tabular: date `05/10/2026` / time `1:20 pm` (Leads = last chat, others = visit time)
  - every line truncates with an ellipsis, no wrapping
- Tap a row → Customer info sheet (auto height, max 92%) with a **‹ back** button left of the avatar → back to the list. Tap the backdrop → close both, back to Insight. Open chat at the bottom.

> **5.2 is replaced by 7.3 (rev 1011 round): do not build the Team | Me switch.** Kept below for history only.

**5.2 Team | Me switch**
- Segmented control under the title, above Month · Week · Day. Order: **Team** (left), **Me** (right). Default **Me** on every open.
- Shown only when the user has at least one direct downline (`hasDownlines`, same rule as Profile › View my team). No downline → the switch isn't rendered at all. It updates automatically from People › Hierarchy (`reports_to`).
- Team = the user + their **whole** downline (`allDownlines`, every level down; never upline or sideways). E.g. May → David → Ryan → June: May sees all four; David sees David, Ryan, June; June gets no switch.
- In Team every figure (rates, Leads, Appointments, Upcoming, reply time, status bars) and every list counts the whole team; list rows add the salesperson line ("You" for own).
- Switching closes any open list or info sheet.
- Boss / HOD: if Insight should follow the Team tab, use `leadsPeople` instead of `hasDownlines`.

---

## 6 · Profile › Notifications (`SalesProfile.tsx`, `vm/profile.ts`, `vm/notifs.ts`)

- **Unread | Read** segmented control under the title, default Unread; Unread carries a rust count badge.
- Unread update: bold, ink colour, rust dot on the right. Tap → read (moves to Read).
- **Mark all as read** at the right of the title (Unread tab only); marks all updates.
- Invitations stay unread until answered (Accept / Decline). Mark all doesn't touch them.
- Read items: weight 500, muted colour, no dot.
- Empty: "You're all caught up." (Unread) / "Nothing read yet." (Read).
- The Notifications badge on Profile and the Profile badge in the bottom bar = unread count.
- Storage: today's read state is "last opened" (`notifRead`). Per-item read needs a stored list of read ids per user.


---

## 7 · Added during the Control panel round (rev 1011) — RS needs these too

**7.1 Book visit: slots show how many are left** (`SalesChat.tsx`, `vm/chat.ts`; same as `PanelLead.tsx`)
- Each time slot becomes two lines, 46 px high: time (14px) and under it `N left` / `Full` / `Passed` (10px / 600, opacity .8). `N = room.cap − booked at that start` (not counting the visit being changed). Slots the showroom doesn't offer that day read `Closed`.

**7.2 Chat top spacing** (`SalesChat.tsx`)
- Outer `<main>` top padding `6px` → `padding-top: max(16px, env(safe-area-inset-top))`.

**7.3 Team | Mine replaces Insight's Team | Me** (replaces 5.2)
- **RS with no downline: no switch anywhere.** They only have their own CRM.
- **Director, and STL / TL / TA with at least one downline**: a "Team | Mine" segmented switch in the **top bar of every RS page** (Inbox, Contacts, Calendar, Insight, Profile), Team on the left. Mine = this CRM (selected). Team = the Control panel scoped to them (see `Control Panel rev 1011 dev changes.md` › Director and Leaders items). Hidden inside a chat.
- **Remove** RS Insight's Team | Me switch and RS Profile › View my team (team views now live on the Team side; View as there lists only their downline).
- Acceptance: as Daniel Tan (RS) → no switch; as Kelvin Lee (TL) → "Team | Mine" on every RS page, Insight has no Team | Me; tap Team → Control panel showing only Team Kelvin.

**7.4 iPhone safe areas** — see the Must-do at the top of this file. Applies to every RS screen, sheet and overlay.

---

## 8 · Round 2 (added after the first hand-off)

Build these on top of what is already live.

**8.1 Profile › Back to Revenue app card**
- Same card as the Control panel. `SalesProfile.tsx`, under "View my team" (or under the profile card when there's no team), above "Your workspace": 16px padding, radius 22px, background #F5EBE3, hover #EFE2D7, no border; 52×52 tile radius 14px #F6D9C4 with a rust #BD4A19 back arrow; title "Back to Revenue app" 17px/700, no sub-line; chevron #A8968B. Tap → back to the Revenue app (same as today's top-bar link).

**8.2 Top bar removed; pages move up**
- `SalesHeader.tsx` / `vm/header.ts`: no "Back to Revenue app" link, and the whole top bar row (48px) is not rendered on Inbox, Contacts, Calendar, Insight and Profile, so each page starts right under the safe area. The bell moves into each page's title row, at the right end: 40×40 circle, 1px #EBDDD2, white, shadow 0 2px 8px rgba(63,43,34,.06), bell 20px #3F2B22, rust badge top/right -4px. Inbox: after All ads (gap 8px). Contacts: right of "Contacts". Calendar: after Today (gap 8px). Insight: after the date chip (gap 8px). Profile: top-right corner of the profile card (14px in); the avatar + name row gets padding-right 48px so a long name wraps before the bell. Contacts' title row: margin-right -8px so its bell lines up with the other pages (main keeps 28px right padding for the A–Z index). Profile's sub-pages (Notifications, Auto-reply, Quick replies) keep the top bar with "‹ Profile". Chat unchanged.
  - **Must keep:** the CRM root's `padding-top: env(safe-area-inset-top)` (see the iPhone safe areas item). Removing the top bar must not remove that padding: on an iPhone with a Dynamic Island the title row sits below it, never under it. Check on a real iPhone 15/16 Pro: nothing in the title row is covered.


**8.3 Chat: remove the Book visit bar**
- . In `SalesChat.tsx`, delete the full-width rust "Book visit" button above the composer (`notBooked` block). Booking stays in ⋮ › Appointment (Book a visit when none). Same change as the Control panel chat.

**8.4 Team | Mine position** (Director and leaders on the RS side)
- "Team | Mine" always sits at the right end of its own top row, on every RS page, same as the Control panel. Inbox: not in the title row left of All ads (supersedes the placement in 7.3 / header.ts › teamMineVM). Same segmented look (#F0E6DE track, white active pill, 28px tall). The bell stays in the title row (8.2).
- If anything at the top is covered on an iPhone with a Dynamic Island, move it down: first row of every page and overlay starts at `calc(env(safe-area-inset-top, 0px) + 8px)` at the least. Fix in `crm.module.css`, not per page. Never shrink or hide to fit.
