# CRM redesign 4a — checklist

Branch `crm-redesign-4a` (worktree VP-crm-r2), 2026-10-18. Every item of `CRM Redesign dev changes.md`, its acceptance line,
and where it stands: ✅ done · ⚠️ partial (why) · ❌ not done (why). Checked by screenshots of the app beside the frames
(`tools/crm-design/capture-redesign.mjs` against `capture-4a.mjs`), desktop at 1440 × 900 (Insight and Inbox also at 1280),
phone at 430 × 932. CRM + Revenue app tests: 798 passed; type check clean.

## Visual language

| # | Item | Acceptance | |
|---|---|---|---|
| 1 | New palette | No screen uses `#FBF7F3`, `#3F2B22`, `#806B60`; every colour from the token table | ✅ `--crm-*` tokens in globals.css; generated screens mapped by `palette-4a.cjs` (fails on an unmapped hex); `palette.test.ts` fails on a raw hex in a CRM screen. Kept on purpose: the photo editor, camera, viewer and document previews (drawn on pictures), listed in the test. |
| 2 | Primary actions rust | One filled rust button per screen at most; no white on `#EE5E08` / `#FFA91F` | ✅ |
| 3 | Urgent text oxblood | No running text in `#EE5E08` | ✅ `urgencyOf` oxblood for Urgent / Overdue; orange only as dots, bars, the notification dot. |
| 4 | Channel colours | WhatsApp green, Messenger blue, nowhere else | ✅ Inbox, Ads Performance, Assignment, Channels. |
| 5 | Statuses: dot + tinted pill | Contacts pills, Leads-by-status bars and Inbox counts use the same seven colours | ✅ `shared/palette.ts › STATUS`. Phone Contacts now shows the status pill (M09). |
| 6 | Team colours in fixed order | Same colour in Insight, Assignment, split bars, Calendar, board | ✅ `teamColour(k)`. |
| 7 | Avatar tints by name hash | Same customer, same tint everywhere | ✅ `avatarTint(name)` on desktop and phone (Inbox, chat, Contacts, board, notifications). |
| 8 | Elevation | List and table rows have no shadow | ✅ |

## Desktop

| # | Item | Acceptance | |
|---|---|---|---|
| 9 | Frame | Matches frames 01–11 at 1440 × 900 | ✅ All eleven pages. The Revenue sidebar turns ink only while the CRM is open (owner). |
| 10 | Tables | Contacts, Ads Performance, Assignment, Audit log share the header | ✅ |
| 11 | Configurable columns "+" | The manager's chosen columns still show | ✅ Contacts' "+ Add columns" (production's column set kept). |
| 12 | Insight hero | Six metrics on one line at 1280 and 1440; "11 min" does not wrap | ✅ Checked at both widths. |
| 13 | Inbox right side | At 1440 the chat is never under 380 px; at 1920 both panels open, chat ≈ 650 | ⚠️ Built exactly as frames 02 / 02b / 02c (list 290, Customer info 260, strips 44, both open from 1680). At 1440 that leaves the chat **369 px** — the frame's own width, 11 px under the acceptance line. At 1280 Customer info now starts folded so the chat keeps ≈ 425 px. |
| 14 | Calendar visit blocks | Three states tell apart in greyscale | ✅ Came ink, Booked amber with border, No-show dashed. |
| 15 | Channels by phone number | Every linked Page under the number it routes through; an unlinked Page shows Link | ✅ Pages grouped by the phone listed on the Page; a "No number" card for the rest. No "Expires in N days" — Meta gives no expiry (owner). |

## Phone

| # | Item | Acceptance | |
|---|---|---|---|
| 16 | Bottom bar | Mine and Team bars match M01 and T01 | ✅ `shared/phone4a.tsx › Phone4aBar`. |
| 17 | Chips and segments | Status, who, period, Month/List and All/Unread/Read all follow it | ✅ Inbox chips, Team who chips, Insight period, Calendar views, Notifications tabs, Assignment / Split segments. Team Inbox status row is underline tabs (T02). |
| 18 | Chat status strip | The window counts down from 24 h after the customer's last message | ✅ `chatStripOf` (sales/vm/common.ts): status + wait in oxblood on pale orange, "Reply window · N h left", grey "Cold · no reply for N days / Window closed". Both phone chats; the desktop chat header carries the same line. |
| 19 | Insight hero rust | Deltas readable (`#FBE6DC` good, `#FFD9A0` bad) | ✅ Mine (M11): three rates with their change on the period before. Team (T01): 2 × 2 with the change on the comparison period (picked, else the period before) and "vs Sep" on the period card. |
| 20 | Profile | Still mirrors the Revenue app Profile | ✅ Stronger radial glow, rust avatar, rust icons on pale orange; the structure unchanged (§6.8). |

## Decisions in §6 (step 4: all still hold)

| # | Decision | |
|---|---|---|
| 21 | Own bubble deep orange, white words, phone and desktop | ✅ |
| 22 | Composer floats; Attach and Camera stay while typing | ✅ unchanged |
| 23 | Round buttons: Mine Inbox Team\|Mine · house · bell; Team Inbox Team\|Mine → bell → Contacts; Team Insight house left of the avatar | ✅ Team \| Mine is now the pale-orange pill naming the side you are on. |
| 24 | Notifications All · Unread · Read, opening on All; a tap opens the summary | ✅ |
| 25 | Ads to teams: Revenue Director first, ads named in place | ✅ |
| 26 | Showrooms one at a time with ‹ › and a round + | ✅ |
| 27 | Inter + Inter Tight, phone sizes × 0.92 | ✅ The 4a parts write the frame's px ÷ 0.92 (`fs()` / `F()`), so on a phone they land on the frame's size. |
| 28 | Only one's own customers notify; Settings shows "Team inbox alerts" locked Off | ✅ |

## Changes outside the 28 items (owner: list every one)

**Desktop**
- Settings (frame 10): the frame's settings are not stored anywhere. The page shows the CRM's real rules in the frame's two columns, each row locked, with no Save. Daily summary and Hold leads outside working hours are left out because they don't exist. Cold lead templates and Notifications stay as two more tabs. A proposal to make the rows editable is in `SETTINGS-PROPOSAL.md`; nothing has been migrated.
- Audit log (frame 11): production's three tabs (Chat flow · Marketing · Management) are now the Area menu, which opens on All areas. The stats band is gone; the count is in the head. Column resizing is gone. The "+" is not drawn, because there is no column picker.
- Customer form (frame 08): the frame's three columns. The page name, Add section, Delete page and Discard live under the page list. A field opens to its editor on its chevron. The preview keeps production's Phone | Desktop switch. The head line shows the field counts instead of "Published 12 Oct", which production doesn't store. **Appearance only.** The form model is unchanged and the other session's system-field work is not touched.
- New head buttons: Export PDF (the Ads Performance report format), Book a visit (customer picker), Add a number (Meta WhatsApp Manager) and Export CSV (the rows on screen). New chat and Add customer were left out (owner: "能做的做，不能的不放").
- Contacts and Ads Performance open on the frames' default columns. Contacts and Calendar rails open by default, where the owner had chosen folded. Production's stats bands moved into the rails.
- Desktop Add showroom now works; it was decorative before.
- Kept from the owner's earlier choices: Calendar opens on Month, Contacts' page-size dropdown, the bubbles' inline time, the chat header "WhatsApp · Video ad · headline", and Assignment's team sliders.

**Phone**
- The chat wall is plain cream; the line-icon wallpaper (rev 1010 §1.1) is off, kept in `sales/wall.ts`. The chat header loses the avatar's channel dot and reads "ad · channel".
- Inbox: All ads moved beside the search. The bell shows a dot instead of a count. Rows run edge to edge with the urgency icon.
- Insight (Mine): Range is the fourth segment, and its dates show under it. The "This month · October 2026" line is gone. Leads by status shows all seven statuses (it showed four).
- Calendar (Mine): "Calendar" with Month · Week · Day (production's three views). The month is shown as dots. Today, Did they come? and Upcoming are white cards on cream. The buttons keep production's words: Show up, No show, Change.
- Contacts: a status pill per row. The call button stays, quieter.
- Notifications: segments with a count on each. Updates run edge to edge, with unread rows on pale cream. Invitations, Mark all as read and each summary line stay.
- Team Insight: the greeting goes by the time of day ("Good morning, …"). The Comparison card shows only once a period is picked; the "vs Sep" chip picks it. Team performance is a list; production has no W/L per team, so that figure isn't shown.
- Team Inbox: Contacts is a round icon button. Columns are 300 px on pale cream, and the status row is underline tabs.
- Assignment: the sections are tabs under the title (Ads to teams · Full time · Work type, where Work type opens Profile's Member work type). There is no "‹ Assignment" bar. The legend is in team colours, and each ad is a card with Edit split / Set up.
- Showrooms (T07): one page you edit in place, as frame T07. The name is the title (a tap turns it into a field; phone fields are 16 px), the address is typed where it stands, then Google Maps / Waze, Visits per slot and the 24 × 7 weekly slots. A cell is that hour that weekday, and tapping it opens or closes a slot on the hour. A slot off the hour (e.g. 11:30) shows on its hour, with a line naming it. Closures are listed with × to remove; **Add** opens production's full editor (dates, set hours). Any change brings up Cancel / **Save changes** (crm_save_showroom, as before). Delete showroom stays at the foot. ‹ 1 / 2 › are round buttons and + is rust.
- Split leads: "‹ Split leads" title, the name in a boxed field, Meta's headline under it, Save above "Save and apply to all". The ‹ closes the editor, as Cancel did.

**Not matched (⚠️)**
- M02–M08 detail states (the swipe colours, empty Appointment, the long-press menu and the cold chat card) carry the 4a palette and the strip. They were not re-captured state by state.
