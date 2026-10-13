# CRM Desktop · design brief (rev 1, 2026-10-12)

For Claude Design. The screenshots in `desktop/` and the HTML snapshots in `html/` show what is built today. The phone
designs this grew from are `docs/design/rev1010` (salesperson, "RS") and `docs/design/rev1011` (Control panel).

## 1 · What this is

HOUZS's Revenue team sells furniture through Click-to-Messenger and WhatsApp ads. The **CRM** holds every customer
chat, who it is assigned to, and the showroom visits booked from it. It lives inside the **Revenue app**:
Profile › *My leads & appointments*.

- **On a phone** the CRM is the rev 1010 / 1011 phone design. That stays as it is.
- **On a computer** (the app ≥ 1024px wide) it opens as a **desktop version**. The Revenue app's own sidebar
  (240px: Today, Insight, Quote, Arena, Profile, Notifications) and its top bar (greeting, sub-department, date, bell,
  Sign out) stay around it. **The CRM area is the viewport minus 240px**: 1200 × 840 at 1440 × 900, 1040 × 740 at
  1280 × 800.

Who gets which:

| Who | On a computer today | Next |
|---|---|---|
| **Principal** (the Boss; sees everything, does not sell) | Desktop Control panel | — |
| **Revenue Director** (sees everything, also sells) | Desktop Control panel, with **Team \| Mine** (Mine = their own salesperson CRM) | Mine becomes the RS desktop |
| **Leaders** (STL / TL / TA with people below them) | Phone screens | Team = Control panel scoped to their line, Mine = RS desktop |
| **RS** (salespeople) | Phone screens | **RS desktop: please design it in this round** |

## 2 · The frame (shared by the Control panel and the RS desktop)

`crm/desk/DeskShell.tsx`. From top to bottom:

1. **Head** (white): eyebrow "REVENUE · CRM", the page title, the **page tabs** (each with a rust count badge when
   something waits), and on the right the period control (Insight only), **Team | Mine** (Director), and the **CRM
   bell** (CRM notifications, separate from the Revenue app's bell above it).
2. **Page** (cream `#FBF7F3`): the tab's own layout.
3. **Side pane** (right, 440px, or "wide" = everything right of a 380px list on Assignment and Settings): where
   anything the phone opens full screen opens on a computer. A chat, an Assignment section with its editors, Send to,
   Customer info, a list of leads or visits, Showrooms, templates, Notifications. **The pane's content is the phone's
   own screen** (generated from the rev 1011 prototype). It is shown without the phone's top and bottom bars.
   - Always there (with "Pick a chat / section / setting" when empty) on Inbox, Assignment and Settings.
   - Opens only for something on Insight and Calendar.
4. **Toast** (bottom centre, gone after 3 s).

## 3 · The Control panel's five pages, and the data each may use

Everything below is already computed by the app; a design may show any of it, in any arrangement. Anything else
is **NEW DATA** (see §4).

### Insight (`01`–`03`, `20`)
- **Period**: Today · This week · This month · Custom (two dates). **Compare with previous period** (a whole month →
  the month before; any other range → the same number of days just before).
- **Hero**: Appt rate (%, "N booked of M leads"), Leads, Show-up (%), Reply 24 h (%). The label names the period.
- **Team performance**: one row per team (team colour, name, "Senior TL / TL name") and a Director row (their own
  customers). Leads · Appt % · Show-up %. A team opens to its people: initials, name, tag ("RS · Full time",
  "TL"…), "· N waiting", Leads · Appt % · Show-up %. **A person opens Inbox filtered to them.**
- **Needs your action**: Organic Leads (N to send; Manage only), Awaiting reply (N need a reply, whose). Each opens its list.
- **Comparison**: for each of Leads / Appt rate / Show-up / Reply 24 h: this period, the other one, the change
  (+/−%, green / red / neutral).

### Inbox (`04`–`07`)
- **Filters**: Teams (All · Director · each team, with dot colour and count), then that team's Members (with counts).
- **Status**: All · Needs a reply · Follow up · Appointment · Won · Lost (counts). Search: name, message or salesperson.
- **A chat row**: initials, customer name, last-chat time ("9:24 am", "Sun"), the **ad** (green), last message
  ("You: …" when ours), salesperson (team dot + name, or "Team X · to assign"), state ("Overdue · 52 h",
  "Reply soon · 3 h", or the status). Not available on rows today: channel icon and unread count (the phone RS list
  has them; see §4).
- **Chats** view: list + the chat in the pane. **Board** view: the five status columns side by side (cards: name,
  time, 2-line preview, salesperson, reply state).
- **Contacts**: everyone A–Z (name, phone, salesperson, call). Today a sheet in the pane.
- **The chat** (pane, phone screen): header (back, customer, ad, ⋮ menu), "{owner}'s customer", bubbles, visit cards,
  Book visit, composer (+ files, quick replies, camera, voice). The Principal / Director can reply in any chat;
  ⋮ has Assign to · Share · Move · Customer info · Appointment.

### Assignment (`08`–`11`), CRM · Manage only
Left: the four sections as cards (icon, title, one-line summary, count). Right (wide pane): the chosen section, as on
the phone:
- **Organic Leads**: enquiries from no ad; each with Open chat and **Send to** (person picker, 30 s Undo).
- **Ads to teams**: one card per ad (name, channel, N leads, mode, a bar and legend per team), "N waiting" when a By
  max team is full; the editor: Evenly / By team → each team Evenly / By % / By max. **Over the limit** banner and page.
- **Awaiting reply**: who needs a reply, grouped Overdue / Urgent / Reply soon.
- **Full time lead allocation**: per team, each full-time person × Mon–Sun ticks; the editor says who gets each day.

### Calendar (`12`–`13`)
- Filters: All teams · Director · each team; a person; From / To (default this month).
- **Month grid** (Mon–Sun): each day with up to 4 team-coloured dots, today in rust; a day picks its visits.
- **Figures**: Leads · Upcoming · Showed up (each opens its list in the pane) · Show-up %.
- **By team**: visits per team (bar) and show-up %.
- **Visits** grouped by day: time, customer (team dot), salesperson · showroom, status (Booked / Showed up / No show /
  To mark / Won / Follow up / Lost, each with its colour). A visit opens **Customer info** (phone, first contact, last
  chat, platform, ad, status, property type, unit size, location, requirement, budget; Edit; **Open chat**).

### Settings (`14`–`19`)
Cards on the left, the page in the wide pane: **Member work type** (each team member full time / part time), **Showrooms**
(address, slots × weekdays, booking limit, closures, Waze / Google Maps), **Cold lead templates** (WhatsApp templates;
status Approved / In review / Rejected / Draft; on/off; editor), **Ads Performance** (per ad: channel, leads, share of
leads, appt rate, show-up, over a period, with a comparison against another period), **Notifications** (Unread | Read; Move · Share · Won · Lost · Overdue 9 h+). The first four
are CRM · Manage only.

## 4 · Rules for this round

**Change freely:** layout, sizes, spacing, type, the arrangement of each page, where the pane sits and how wide it is,
whether something opens in the pane, a dialog or inline, the empty states, icons, the order of things, the wording of
labels (English).

**Keep:**
- **The data** in §3 (and §5 for RS). A design that needs a figure, field or list not named there marks it
  **NEW DATA** in the change list. It may need a database change, which is proposed to the owner before anything is built.
- **Who sees what**: Assignment and the first four Settings pages are CRM · Manage only (Principal, Director). The
  Principal does not sell (no Mine). Leaders see only their own line.
- **What things do**: the dealing rules (Assignment), reply windows (24 h; 7 days with Human Agent on Messenger), Undo
  after Send to (30 s), toasts (3 s), urgency 3 h / 6 h / 9 h.
- **The colours** of the phone CRM: ink `#3F2B22`, muted `#806B60`, faint `#A8968B`, line `#EBDDD2`, cream
  `#FBF7F3`, rust `#BD4A19` (accent), rust tint `#FFF0E4`, red `#A3371A`, amber `#A46312`, green `#387557`,
  blue `#2F6FB5`, plum `#8E4B6E`, the team colours, the chat background `#EFE7DE` and our bubble `#FCD6B8`. Font Inter.
- **The pane's phone screens**: redesigning them for the desktop is fine, but say per item **"desktop only"**
  (the desktop gets its own version) or **"phone too"** (the phone design changes as well).

**Please cover these states:** empty (no chats, no visits, nothing waiting), loading, many rows (40+ chats, 9 teams),
long names and long ad names, the pane open and closed, 1280 × 800 as well as 1440 × 900, the Director's Team | Mine.

**Known issues today (please solve):**
1. Calendar with the pane open: the month grid gets narrow (`13`).
2. Inbox Board with a chat open: five columns plus the pane is cramped.
3. Pane pages carry the phone's back link (Showrooms shows "‹ Profile", `16`).
4. Inbox rows have no channel icon (WhatsApp / Messenger) or unread count (the phone RS list has both; NEW DATA not
   needed, it exists, but it is not wired into the desktop rows yet).
5. Two bells (the Revenue app's and the CRM's): make the difference clear, or propose one.

## 5 · The RS desktop (to design this round)

The salesperson's own CRM on a computer, in the same frame. Phone reference: `rs-phone/` (rev 1010). Tabs on the
phone: **Inbox · Contacts · Calendar · Insight · Profile**. Leaders and the Director also get **Team | Mine**.

Data and actions available (all on the phone today):
- **Inbox**: search; chips All · Attention · each status · Cold leads · labels in use; filter by ad. Row: channel
  (WhatsApp / Messenger), initials, name, last-chat time, ad (green), last message, urgency ("Overdue · 15 h"),
  unread count, labels, first-visit line ("1st visit Thu 24 Sep, 11:00 am"); pinned first. Row actions: Pin, Mute,
  Contact info, Label, Block.
- **Chat**: day pills, bubbles (ours peach, ✓✓ blue when read), quoted reply, reaction, visit cards; bubble tools Reply ·
  Copy · React · Pin · Delete for me; ⋮ Share (own team) · Move (to their superior) · Customer info · Appointment;
  **Book visit** (customer details, then showroom, day, the showroom's slots); composer: + (Photos · Document ·
  Quick replies), "/" for quick replies, camera, voice; cold chats (window closed): **Send template message**.
- **Contacts**: A–Z with letter headers, "Status · phone", call; Edit (name, phone) / Delete (off their list);
  → Customer info → Open chat.
- **Calendar**: Month · Week · Day; Today's visits with Change / No show / Show up; outcome: Follow up / Won (amount)
  / Lost (reason); No show → Rebook / Follow up / Lost; Upcoming with Send reminder.
- **Insight**: Month · Week · Day · Range; Appt rate, Show-up rate, Won rate, Leads, Appointments, Upcoming (each
  opens a list), Avg. reply time, Leads by status (New, Attention, Appointment, Cold leads).
- **Profile**: Notifications (invitations to Accept / Decline; for leaders Won, Lost, Overdue about their people),
  Auto-reply (welcome, outside hours with times, keyword replies, a picture each), Quick replies; View my team (leaders).

A natural desktop layout is three columns (list · chat · customer info with its visits and actions), but it is
your call.

## 6 · What to hand back

1. A prototype `.dc.html` with a frame per screen and state (1440 × 900; at least Insight, Inbox and the RS Inbox also at
   1280 × 800).
2. **`CRM Desktop rev 1 dev changes.md`**, in the rev 1010 / 1011 style: numbered items, each naming the **screen**,
   **what changes** (sizes, colours, order, behaviour), **desktop only / phone too**, **NEW DATA** if any, and an
   **acceptance** line. The change list wins where the prototype differs.
3. Any new icons or images as files.
