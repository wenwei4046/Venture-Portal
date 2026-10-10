# RS (Sales template) · rev 1010 · Developer change list

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
