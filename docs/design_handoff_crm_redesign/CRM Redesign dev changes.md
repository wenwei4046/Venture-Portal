# CRM Redesign · dev changes

Each item states the screen, the change, the platform (**phone / desktop / both**), **NEW DATA** if it needs data the app does not have (none so far), **changes a decision in §6** where it does, and an **acceptance** line. Hex values refer to the tokens in `README.md`.

## Visual language

1. **All screens: new palette.** Replace cream `#FBF7F3` pages and ink `#3F2B22` with white pages and ink `#422315`. Use the status ramp, team colours and tints from the README. **both**.
   Acceptance: no screen uses `#FBF7F3`, `#3F2B22` or `#806B60`, and every colour comes from the README token table.

2. **Primary actions** stay rust `#BD4A19` with white text: main buttons, mic/send, unread badges, active tab underline, active chips and segments. **both**.
   Acceptance: each screen has one filled rust button at most. White text never sits on `#EE5E08` or `#FFA91F`.

3. **Urgent text** (Urgent, Overdue, Attention waiting time, "not set up", over the limit) uses oxblood `#8A1F0A`. **both**.
   Acceptance: no running text in `#EE5E08`. Orange appears only as dots, bars and small marks.

4. **Channel badges and icons** use WhatsApp `#25D366` and Messenger `#0A7CFF`. These colours appear nowhere else. **both**.
   Acceptance: in the Inbox, Ads Performance, Assignment and Channels, a WhatsApp chat or ad is green and a Messenger one is blue.

5. **Statuses** are drawn as a dot plus a tinted pill, using the ramp (New ink … Cold `#EEE2D8`). **both**.
   Acceptance: the Contacts pills, the Leads-by-status bars and the Inbox counts all use the same seven colours.

6. **Team colours** are fixed in this order: Director `#422315`, Priya `#EE5E08`, Hafiz `#FFA91F`, Grace `#8A1F0A`, Kavitha `#6F402C`. New teams continue with `#C29C88`, `#9A6B55`. **both**.
   Acceptance: a team has the same colour in Insight, Assignment, the split bars, the Calendar and the Inbox board.

7. **Initials avatars** take one of four tints by a stable hash of the customer's name. **both**.
   Acceptance: the same customer always gets the same tint on every screen.

8. **Elevation**: only floating elements cast shadows (composer, popovers, sheets, attach card). Cards are separated by 1px hairlines. **both**.
   Acceptance: list rows and table rows have no box-shadow.

## Desktop

9. **Frame.** The Revenue sidebar is ink, with the active CRM item filled rust. The CRM nav has a `#FBF4EC` background, its active item uses `#F3DFCC` and a 2px orange bar. **desktop**.
   Acceptance: matches frames 01–11 at 1440 × 900.

10. **Tables.** The header row is `#FBF4EC` with a 1px ink top rule. The selected row is cream with a 2px orange left bar. **desktop**.
    Acceptance: Contacts, Ads Performance, Assignment and Audit log share this header.

11. **Configurable columns.** Tables that already allow extra columns get a "+" button at the end of the header. It opens "Add columns", which lists every Customer-form field with a checkbox. **desktop**.
    Acceptance: the column set a manager has already chosen in production still shows, now in the new style.

12. **Insight hero** is a cream panel (r 12). The first metric (Appt rate) is rust with an orange mark. **desktop**.
    Acceptance: six metrics fit on one line at 1280 and 1440, and "11 min" does not wrap.

13. **Inbox right side.** Customer info (white) and the per-chat Audit log (`#F6E7D8`, timeline) are two panels. At ≥ 1680px both can be open. Below 1680px, opening one folds the other to a 44px strip that keeps its panel's colour. **desktop**.
    Acceptance: at 1440 the chat column is never narrower than 380px. At 1920 both panels are open and the chat is about 650px.

14. **Calendar visit blocks.** Came = ink fill. Booked = `#FFF0D1` with a `#FFC75A` border. No-show = dashed outline. Name, time and showroom sit on separate lines with ellipsis. **desktop**.
    Acceptance: the three states are distinguishable in greyscale.

15. **Channels is grouped by phone number.** Each number card lists the WhatsApp Business and Facebook Page (Messenger) linked to it, each with its own status: Connected, Expires in N days (Reconnect), or Not linked (Link). The primary button becomes **Add a number**. **desktop**.
    Acceptance: every linked Page appears under the number it routes through. A Page that is not linked shows a Link button.

## Phone

16. **Bottom bar.** The active tab is a rust pill with a white icon and a rust label. **phone**.
    Acceptance: Mine and Team bars match M01 and T01.

17. **Chips and segmented controls.** The active item is filled rust with white text. **phone**.
    Acceptance: status, who, period, Month/List and All/Unread/Read all follow this.

18. **Chat status strip.** A new 34px strip under the chat header shows status and wait time (oxblood on `#FDE3D2`) and the reply window left. It turns grey on a cold chat. The data comes from the existing status and last-customer-message time. **phone**, desktop shows the same line in the chat header.
    Acceptance: the window time counts down from 24 h after the customer's last message.

19. **Insight hero** (Mine and Team) is a rust card with white figures and an amber mark on the first metric. **phone**.
    Acceptance: deltas are readable (`#FBE6DC` good, `#FFD9A0` bad).

20. **Profile** uses a stronger orange radial glow and a rust avatar. It keeps the Revenue app Profile structure. **phone**. Restyles **decision §6.8**; the structure is unchanged.
    Acceptance: the layout still mirrors the Revenue app Profile.

## Decisions in §6

21. **Own bubble**: stays deep orange `#BD4A19` with white words, on phone and desktop. **both**. Keeps **§6.1**.
22. **Composer** floats over the chat with no background, and Attach and Camera stay while typing. Keeps **§6.2** and **§6.3**.
23. **Round buttons**: Mine Inbox has Team|Mine, house, bell. Team Inbox has Team|Mine → bell → Contacts. Team Insight has the house left of the avatar. **phone**. Keeps **§6.4**. The Team|Mine pill is restyled pale orange.
24. **Notifications**: All · Unread · Read, opening on All. A tap opens a summary card, then Open chat. **phone**. Keeps **§6.5**.
25. **Ads to teams**: the Revenue Director row comes first and ads are named in place. **both**. Keeps **§6.6**.
26. **Showrooms**: one at a time with ‹ › and a round +. **both**. Keeps **§6.7**.
27. **Type**: Inter + Inter Tight, phone sizes ×0.92. **both**. Keeps **§6.9**.
28. **Notifications scope**: only one's own customers notify. Settings shows "Team inbox alerts" locked Off. **both**. Keeps **§6.10**.

## Platform limits respected (§7)
- The message menu has **Delete for me** only; there is no unsend.
- Avatars use initials, because customer profile photos are not available.
- Ad names are typed by managers. Spend and Per lead show "—" until Meta grants `ads_read`.
- The phone has an emoji panel only; there are no GIF or sticker sends.
