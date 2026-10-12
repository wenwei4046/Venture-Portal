# CRM Desktop rev 1 · dev changes

Format: **No. · Screen · What changes · How to accept.** Tags: **NEW DATA** = needs data/DB not in `design-brief.md` → propose first, wait for approval. **phone too** = the phone screen changes as well. **live** = behaviour that must use real data/time at launch (prototype uses demo values).

Reference frames: **2a–2d** in `prototypes/CRM Desktop rev 1.dc.html` (right-menu flow) are authoritative for every item below. Frames 1a–1j only show pane modes / sizes; their Assignment, Settings and Showrooms pages are superseded.

**Desktop only — do not add to the phone CRM:** Forms (H3), Ads Performance (F1–F4), Chat progress (D6). The phone keeps its current screens. (Forms still changes the fields the sales app shows in Customer info — only the editor is desktop-only.)

Roles: Principal (all access), Revenue Director, Team leader, RS. Assignment / Settings / Showrooms / Ads Performance are CRM · Manage only (unchanged rule).

---

## A · Frame
| No. | Screen | What changes | Accept |
|---|---|---|---|
| A1 | Entry | Desktop CRM opens from Revenue app › sidebar › **Profile › MY LEADS & APPOINTMENTS**. CRM tabs live there: Insight, Inbox, Assignment, Calendar, Ads Performance, Showrooms, Settings. | Sidebar shows the group under Profile; Profile chevron folds it. |
| A2 | Sidebar | 240 px, collapsible to 72 px rail (icons only, tooltips). No count badges on Inbox / Assignment / Calendar. Revenue-app bell (top bar) and sidebar Notifications stay Revenue-app items — they do **not** open CRM notifications. | Toggle collapses/expands; CRM area width = W − 240 / W − 72. |
| A3 | Right menu | Assignment, Settings, Showrooms, RS Profile open a 520 px (440 at 1280) menu from the right. Row = coloured square icon + title (+ sub). Picking a row opens the page full width; rust chip next to the title reopens the menu. Esc / × / outside click closes. | Matches frames 2a–2d. |
| A4 | Side pane | Docked 440 / 400 px (page shrinks), overlay variant, wide variant. Close × top right. | Frames 1a, 1b, 1d, 1e, 1g. |
| A5 | Toast | Bottom centre, 3 s, optional Undo. Every save / apply / delete / reminder shows one. | — |
| A6 | Keyboard | Esc closes menus/pane; ↑/↓ in numeric inputs jumps to prev/next numeric input of the same panel and selects it. | Tab through By max inputs with arrows. |

## B · Insight
| No. | What changes | Accept |
|---|---|---|
| B1 | Orange hero card: Appt rate · October 40 % (10 booked of 25 leads), Leads 25, Show-up 50 %, Reply 24 h 38 %. **Every number is clickable** (› + underline) → customer list in the pane → Customer info → Open chat (same as RS). 40 % → booked customers, 25 → all leads, 50 % → visits due with showed-up state. | Click 25 → list → name → info → Open chat opens the chat. |
| B2 | Reply 24 h list should list only customers replied within 24 h. **NEW DATA / live** (prototype opens all leads). | — |
| B3 | Team performance table: Team, Leads, Appt, Show-up, **Won rate, Lost rate**. Rows: Revenue Director (Peter), Team Kelvin / Priya / Ryan. Clicking a team opens its people (name, “N leads”, Leads, Appt, Show-up); clicking a person lists their leads → chat. Person sub-label = “N leads” and must equal the Leads column. | Kelvin Lee shows 5 leads, Amir 4. |
| B4 | Leads by status: same table style as Team performance (status dot, bar, Leads, Share) with a **Total** row. Rows open the status list. | — |
| B5 | Ads table: RM moved into headers (“SPEND (RM)”, “COST / LEAD (RM)”), values without RM, all numeric columns centred. Header “Ads Performance” link opens the Ads Performance page. | — |
| B6 | Customer list (pane): count on the left, **Sort by** dropdown on the right: Last chat (default), Oldest chat, Status (Overdue → New → Follow up → Appointment → Showed up → No show yet → Cold), Salesperson, Name A–Z. Used everywhere the list opens. **live**: Last chat = last message time. | — |

## C · Inbox
| No. | What changes | Accept |
|---|---|---|
| C1 | Row 1: **Everyone** people picker (multi-select, grouped by team in team colours, avatars stacked on the button, “N chats” beside it) on the same row as All teams. Default = Everyone. Row 2: status chips. | Pick 2 people → button reads “Kelvin Lee +1”. |
| C2 | Chat pane: phone-like chat background (`chat-pattern-clean.svg`, `#EFE7DE`) and bubbles; **⋮ menu** = Assign to (Principal/Director) or Move (RS, same icon/colour as RS phone), Customer info, Appointment. Book visit button removed — appointments live in ⋮. Click outside closes ⋮. **phone too: no** (desktop only). | — |
| C3 | Assign to: people grouped by team (team colour header), shows name + team only (no “open chats”). Production order = by team. | — |
| C4 | Reminder log: after Send reminder, a grey centred system line with bell in the chat (“Principal sent Daniel Ong a reminder to reply · 9:41 am”). **live** time. **NEW DATA** (reminder events). | — |

## D · Assignment
| No. | Section | What changes | Accept |
|---|---|---|---|
| D1 | Organic Leads | Rows with **Send to** → pane with people by team. | — |
| D2 | Ads to teams | Status dropdown Running (green) / Paused (grey) / Pending (yellow) / All, with counts; default Running. Cards (3 per row) with channel tag, status tag, leads, colour split bar, per-team summary; all rows of cards align (empty tag row reserved, footer pinned to bottom). Selected card = rust border + `0 0 0 3px #FFF0E4` ring. | Running shows 3 ads. |
| D3 | Ads editor (pane) | Evenly / By team. Split across teams: sliders (5 % steps) + typed %; changing one rebalances others to 100 %; Reset = 50/30/20. Inside each team: Evenly / By % / By max per person (numeric inputs, totals line “Adds up to 100 %” / “Up to N leads”). Footer: **Save and apply to all N {status} ads** (top) · Cancel · Save this ad. Applying tags other cards “Same as template”; editing one later → “Adjusted for this ad”. **Reopening an ad loads its saved settings** (mode, split, per-team mode, per-person values). | Apply from ad 1, open ad 2 → same numbers. |
| D4 | Awaiting reply | Rows: Remind / Assign; row opens chat in pane (same chat UI as Inbox) with ⋮ Assign to / Customer info / Send reminder. | — |
| D5 | Full time lead allocation | Card per team (On/Off, tag row reserved, people with M–S day pills in team colour, footer “Edit days” aligned across cards). Editor: per-person day toggles; **Save and apply to all 3 teams** · Cancel · Save. **live**: all teams default Off. | — |
| D6 | Chat progress (new) | Page listing every chat's journey. Controls: row 1 Today / This week / This month / Custom (+ date inputs) + range text; **My actions** toggle (chats you assigned/moved/shared, with count), **Everyone** dropdown grouped by team colours (Everyone → team → members, counts), Sort by Latest update / Status; row 2 status chips All/New/Follow up/Appointment/Visit/Won/Lost with counts. Table: Customer (name, ad, owner avatar + team in team colour, “Shared with …”, “You moved to … · date” when My actions on) · Progress strip New → F/up → Appt → Visit → Won/Lost with first-reached dates · Status · Last update. Row → right pane timeline (strip + events newest first: date, time, icon, text, who, “→ status” chip, note box) + **Open chat** (opens chat in the same pane; closing returns to the timeline). With pane open the table shows only Customer + Progress (short labels). Visible to Principal + team leaders only. **Desktop only.** **NEW DATA**: event log (assign, move, share, first reply, appt booked/changed, visit check-in, note, lost reason, status changes). **live**: today = real date. | Nurul Aina shows assign → move → share → appt. |

## E · Calendar
| No. | What changes | Accept |
|---|---|---|
| E1 | Row 1 Everyone (people multi) + All teams; row 2 showroom / people. **Today appt** button shows today's visits. Period: Day / Week / Month / Custom; Month shows “1/10 – 31/10”, Week/Day likewise. | — |
| E2 | Dark summary card numbers clickable → customer list → Customer info → Open chat (like RS). | — |

## F · Ads Performance (new page, replaces Settings › Ads performance) · desktop only
| No. | What changes | Accept |
|---|---|---|
| F1 | Toolbar: status dropdown (All ads / Running / Paused / Pending with dots and counts) · date button · “Synced from Meta Ads · time” · **+ Metrics · N** · **Download report** (Excel / CSV / PDF). **live**: Meta Ads API sync; Download exports what is on screen. | — |
| F2 | Date picker: presets (Today, Yesterday, This week, Last 7/14/30 days, Last week, This month, Last month, All time, “N days up to today”), calendar, **typed dates DD/MM/YYYY** (also `-` `.`; invalid = red outline), Compare toggle with a second range in blue. Apply / Cancel. | Type 05/10/2026 → calendar jumps. |
| F3 | Table: ad name with status dot (green / yellow / grey) + channel · status; one column per selected metric; RM in header for money metrics; numbers centred; Total row (respects status filter). **Click a header to sort** ▼ high→low, ▲ low→high, third click resets; AD column sorts A–Z; Total stays last. Compare mode: second value in blue + ▲/▼ % chip (cost metrics: down = green). | — |
| F4 | Customise metrics (docked pane, page shrinks): search; **Column order** list (≡ drag handle, ⊗ remove, dragged row lifts); groups Popular, Delivery, Messaging, Clicks, Engagement, Video, From this CRM — collapsible with “N of M” and Collapse all / Expand all; ticking appends to the end. Changes apply only on **Save**; “Unsaved changes” hint; × / Esc discards. ~50 Meta metrics. **live**: all Meta metrics from the API. | — |

## G · Showrooms (own page, below Ads Performance)
| No. | What changes | Accept |
|---|---|---|
| G1 | Cards same size; rows aligned across cards (Address, Open days, Visit times, Booking limit, Blocked) + Waze / Google Maps buttons. + Add showroom. Opening a showroom defaults to Details. | — |
| G2 | Editor: name, address, photo upload, Google Maps / Waze links auto-generated from the address (manual override allowed); booking limit in Details; Open slots: add own times (time picker, cannot go outside opening hours) + choose weekdays — these are the times RS sees in phone **Book visit** (**phone too**); Blocked time: Every week (day pills) and Dates (From–To date, All day or Pick a time with multiple ranges, reason optional, + Add to blocked). Footer: **Save and apply to all N showrooms** (top) · Cancel · Save. Apply copies slots, limit, blocked; name/photo/address/links stay per showroom. **NEW DATA**: photo, map links, blocked dates/ranges. | — |

## H · Settings
| No. | Section | What changes | Accept |
|---|---|---|---|
| H1 | Member work type | Full / Part time toggles per person, back link, **Save** button. **live**: default all Off. | — |
| H2 | Cold lead templates | Status filter; cards (channel, status, On/Off toggle only for Approved, **trash → inline confirm → delete**, message preview with variable chips). Click card or Edit → right pane editor: name, channel (WhatsApp / Messenger), body with **Insert variable** (built-ins + custom variables you can add), Save draft / Submit for review / Delete. **NEW DATA**: custom variables. | — |
| H3 | Forms (new, under Cold lead templates) | List of forms + **+ New form**. Customer info form editor: sections (rename subtitle, add, delete, reorder), fields (add, rename, delete, type Text / Long text / Choice (+ options) / Number / Phone / Date, hint text, Required). Editor is **desktop only** (no Forms screen on the phone). After **Save**, the salesperson's **Customer info form** on the phone renders exactly these sections and fields (order, labels, type, options, hint, required) — the phone form reads the saved config instead of a hard-coded layout (**phone too**: Customer info form only). **NEW DATA** (form config). Type rules: Number = amounts (calculable); Phone = keeps leading 0/+, tap to call/WhatsApp, duplicate check; Date = calendar picker, sortable, reminders. | — |
| H4 | Notifications (page) | Header “N unread · M this week”. Category bar with counts (0 shown faint): All, **To assign**, Overdue, Move, **Assign**, Share, Appointments, Results (Won/Lost), General. Unread | Read, **Select** (multi-select → Select all / Mark read / Delete / ×), Mark all read. Rows: unread dot, icon, text, type label, time; white background (no pink). **Click a row → that customer's chat** (Inbox, docked). To assign rows have **Assign now** (→ Organic Leads, or Ads to teams with that ad's editor open); Move / Assign / Share have **View in Chat progress** (→ that customer's timeline). **NEW DATA**: To assign events (new organic lead, new ad without split), Assign events, deleted state. | — |

## I · Copy removed (do not reintroduce)
Showrooms sub “Where visits are booked…”, “Edit showroom”, “Visits allowed in one slot”, map-links hint, apply-all hint, “N of N open · tap to close”, “Open every day (at this time)”, blue RS tip box, “Tap a day to close it…”, “Close a date or a few hours…”, “Pick a From date to continue”, template “Goes to Meta…” and “Edit template”, Settings subs for Forms / Notifications, Forms page and panel descriptions, “Salespeople see the changes…”, Insight Organic leads & Awaiting reply tiles.

## J · Open questions for the owner
1. Reply 24 h list data (B2).
2. Delete notifications: add Undo?
3. Meta sync frequency + “Sync now” button?
4. Should Send reminder count as “My actions” in Chat progress?
