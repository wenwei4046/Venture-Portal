# CRM Redesign · design brief (2026-10-17)

For Claude Design. The PNGs in `phone-mine/`, `phone-team/` and `desktop/` and the HTML snapshots in `html/` show the
CRM exactly as it runs in production today (`main` after PR #540), on demo data. Redesign from them — keep what each
screen does, improve how it looks and reads.

## 1 · What the CRM is

HOUZS's Revenue team sells furniture (mattresses, sofas, bedframes) at fairs and in showrooms. Customers come in
through **Click-to-WhatsApp and Click-to-Messenger ads**. The CRM holds every customer chat, who it is given to, its
status, and the showroom visits booked from it. Salespeople reply to customers from it; managers watch the team,
decide who gets each ad's leads, and run the showrooms.

It lives **inside the Revenue app** (the salespeople's own phone app, an installed web app):
- **Phone**: Revenue app › Today's chat button, or Profile › *My leads & appointments*. The CRM covers the whole
  screen; a **house** button takes you back to the Revenue app.
- **Computer** (the app ≥ 1024 px wide): the CRM opens as the **desktop CRM** beside the Revenue app's frame.

Messages really go to customers' WhatsApp / Messenger. Meta's rules shape the screens: a chat can only be answered
freely within **24 hours** of the customer's last message ("cold" after that — only an approved **template** can open
it again); Messenger closes at 24 h.

## 2 · Who sees what

| Who | Phone | Computer |
|---|---|---|
| **Salesperson (RS)** | **Mine** — their own customers | the phone screens |
| **Leader** (Senior TL / TL / TA, people below them) | **Mine** + **Team** (their own line), one round button switches | the phone screens |
| **Revenue Director** (Peter) | **Team** (everybody) + **Mine** (their own customers) | desktop CRM |
| **Principal / CEO** | **Team** (everybody) + Mine | desktop CRM |

What each person may DO comes from the permission matrix's CRM row — View (own / all), Edit (own / all), Manage.
**Manage** opens Assignment (who gets each ad's leads), full-time allocation, Showrooms, Customer form, Channels and
templates. A redesign must not move a management screen where somebody without Manage would see it.

## 3 · The phone — Mine (`phone-mine/`)

Bottom bar: **Inbox · Contacts · Calendar · Insight · Profile** (Inbox shows the unread count, Profile the
notifications count).

- **Inbox (01)** — title row: *All ads* filter (pick ads), the round **house** (back to the Revenue app), the
  **bell** (notifications); a leader also has the round **Team | Mine** button. Search. Status chips with counts:
  **All · New · Attention · Follow up · Appointment · Won · Lost · Cold leads**. Each row: initials avatar with the
  WhatsApp / Messenger badge, name, the ad's name, last message, time, unread count, an urgency line (*Reply soon · 3 h*
  / *Urgent · 6 h* / *Overdue · 9 h+* — how long the customer has waited), the first visit when booked. Rows swipe:
  left = Assign (leaders) · More; right = Read / Unread · Pin.
- **Chat (02–04)** — header: back, avatar, name, the ad's name, ⋮ (Appointment, Customer info, Starred messages,
  Assign to / Share / Move, mute / pin…). WhatsApp-like bubbles: **your own deep orange `#BD4A19` with white words**,
  the customer's white; ticks (delivered / read / not delivered); photos, videos, albums (4+), voice notes, documents,
  visit cards (Showroom visit · Booked / Reminder / Cancelled). A long press opens the message menu (reactions, Reply,
  Forward, Copy, Info, Star, Pin, Delete for me); swipe right to reply. **Composer** (floats over the chat): Sticker
  (emoji panel at the keyboard's height, 04), the reply box, **Attach** (a floating card: Camera · Photos · Document ·
  Quick replies · Auto replies, 03), Camera (the app's own camera), and the round main button — **mic** (hold to
  record, slide left to cancel) or **Send** when there are words. A cold chat shows a note and *Send template message*
  instead.
- **Contacts (05)** — every customer A–Z, searchable; a row opens Customer info.
- **Calendar (06)** — month / list of showroom visits; Upcoming with *Send reminder* (again once sent); marking
  whether they came.
- **Insight (07)** — Month / Week / Day (+ Range): Appt rate, Show-up rate, Won rate; Leads, Appointments, Upcoming;
  Avg. reply time; Leads by status.
- **Profile (08)** — looks like the Revenue app's Profile (peach glow, white card): name, title, Notifications,
  Auto-reply, Quick replies. **Notifications (09)**: All · Unread · Read; a tap opens a summary card with *Open chat*.

## 4 · The phone — Team (`phone-team/`)

Bottom bar: **Insight · Inbox · Assignment · Calendar · Profile**.

- **Insight (01)** — the page Team opens on. Greeting, the **house** left of the avatar (the only way back from here).
  Period card (This month ▾, compare with another period). Hero: Appt rate, Leads, Show-up, Reply 24 h. **Team
  performance**: Revenue Director row, then each team (colour dot, name, its TL) — Leads · Appt · Show-up · Won /
  Lost rate; a team opens to its people.
- **Inbox (02)** — title row: **Team | Mine** (people icon) → **bell** → **Contacts**. Two chip rows: who (All ·
  Director · each team, counts) and status (New · Attention · Follow up · Appointment · Won · Lost · Cold leads). A
  **board**: one column per status, scrolling sideways; each card: avatar, name, time, unread, last message, who has
  it ("Team Priya · to assign", a person), urgency. Long press / swipe left = Send to (Manage).
- **Assignment (03)** — Ads to teams (every ad: its name, channel, leads, the split as a coloured bar, *Set up* /
  *Edit split*), Full time lead allocation, Member work type.
- **An ad's split (04–05)** — the ad's **name typed in place** (Meta never sends the ad's name, only its headline,
  so managers name ads). **Evenly** (everybody shares) or **By team**: a % per team — the **Revenue Director's row
  first**, then each team — and inside each team Evenly / By % / By max. *Save* · *Save and apply to all N ads*. A full
  By-max team holds its leads ("Over the limit").
- **Calendar (06)** — every team's visits.
- **Profile (07)** — the same look as Mine's; rows for management (Member work type, Showrooms, Cold lead templates,
  Ads Performance, Notifications), *View as a team member*. **Showrooms (08)**: one showroom at a time (‹ 1 / 2 ›, + to
  add): address, weekly slot grid (12 am – 11 pm), per-slot limit, closures (all day / set hours), map links.

## 5 · The desktop (`desktop/`)

Inside the Revenue app's frame: its own 240 px sidebar (Today, Insight, Quote, Arena, **CRM**, Profile,
Notifications, the module switch and the account) and its top bar (greeting, *Fair view*, date). The CRM has its own
sidebar in groups — **Insight · Inbox · Contacts · Calendar** / MARKETING **Ads Performance · Assignment** / MANAGEMENT
**Showrooms · Customer form · Channels · Settings · Audit log** — with *Back to Revenue app* and the person at the foot,
and a head per page (title, period, **CRM alerts**).

- **Insight (01)** — period (Today · This week · This month · Custom), the orange hero (Appt rate, Leads, Show-up,
  Reply 24 h, Avg. reply, Won — each with "vs last period"), Team performance table, Leads by status.
- **Inbox (02–03)** — three columns: the chat list (Everyone ▾, chips with counts, rows as the phone's), the chat (as
  the phone's, wider; composer at the foot), **Customer info** (folds to a 44 px strip; Contact, Lead, Visit,
  Property — the Customer form's fields) and a slim **chat progress rail**.
- **Contacts (04–05)** — a table (10 / 20 / 50 a page), filters, search; a right **rail** (folds) with the chart
  (groupings, pie) and the picked customer.
- **Calendar (06)** — month / week / day / upcoming, team / showroom / people filters; the rail with figures and a
  visits pie; a visit opens Customer info docked beside.
- **Ads Performance (07)** — every ad: leads, appointments, show-up, won, cost columns (Meta's cost waits for Meta's
  permission), sortable and resizable, a PDF.
- **Assignment (08)** — Ads to teams (list + the split editor + Ad performance + Audit log docked on the right),
  Full time lead allocation, Member work type.
- **Showrooms (09)**, **Customer form (10)** (pages and sections of fields, dragged; a live phone preview),
  **Channels (11)** (WhatsApp numbers / Facebook Pages linked to the inbox), **Settings (12)**, **Audit log (13)**
  (every change: who, when, before / after).

## 6 · The owner's recent decisions (keep, or say clearly you are changing them)

These were asked for one by one in the last week. A redesign may restyle them, but **list any change to them in the
change list** so they are confirmed before they are built:
1. Your own chat bubble is **deep orange `#BD4A19` with white words** (phone and desktop); the customer's white.
2. The composer **floats over the chat** with no background of its own; the chat scrolls fully above it.
3. **Attach and Camera stay** in the reply pill while typing; the mic becomes Send.
4. **Round buttons**: Mine's Inbox has Team|Mine (leaders), house, bell. Team's **Inbox**: Team|Mine → bell →
   Contacts (no house). Team's **Insight**: house left of the avatar.
5. Notifications lists: **All · Unread · Read**, opening on All; a tap opens a **summary card**, then *Open chat*.
6. The **Revenue Director row comes first** in Ads to teams; ads are named in place.
7. Showrooms one at a time with ‹ › and a round +.
8. Mine's and Team's **Profile look like the Revenue app's Profile**.
9. The CRM's type is the Revenue app's: on a phone every size is ×0.92 of the design (`calc(Npx * var(--rv-type))`);
   Inter for text, **Inter Tight** for titles and figures.
10. Only one's OWN customers ever notify (bell, alerts, phone pushes); the Team inbox shows everybody's but tells of
    nobody else's.

## 7 · Fixed by the platform (cannot change)

- No unsend after a message reached the customer (neither WhatsApp's nor Messenger's API allows it).
- A web app cannot remove the iPhone keyboard's ⌃ ⌄ ✓ bar, nor show the photo library inside itself.
- A customer's profile photo is not available (initials avatars), nor an ad's real name until Meta grants `ads_read`.
- GIFs / stickers cannot be sent as WhatsApp sends them (an emoji panel only).

## 8 · Look and feel today

Warm editorial: cream `#FBF7F3` pages, white cards (radius 18–22, soft shadow), ink `#3F2B22`, muted `#806B60`, rust
`#BD4A19` for the one primary action and the brand, status colours (New purple `#7A4FB0`, Attention rust, Follow up
amber, Appointment green, Won green, Lost grey, Cold blue-grey), team colours per team. The chat wall is a beige
pattern (`#EFE7DE`). Inter / Inter Tight. Round 40 px header buttons. Bottom sheets that close when pulled down.

## 9 · What to hand back

- One `.dc.html` prototype: a frame per screen and state — phone frames at 430 × 932 (Mine and Team), desktop at
  1440 × 900 and at least Insight, Inbox and Assignment at 1280 × 800. States: normal, empty, many rows, a cold chat,
  a sheet / editor open.
- **`CRM Redesign dev changes.md`**: numbered items, each naming the screen, what changes (sizes, colours, order,
  behaviour), **phone / desktop / both**, **NEW DATA** where it needs data the app does not have, **changes a decision
  in §6** where it does, and an **acceptance** line.
- New icons or images as files.
