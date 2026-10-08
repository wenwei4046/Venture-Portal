# Handoff: HOUZS Venture CRM (Revenue Specialist CRM + role-based Control panel)

## Overview
This is a mobile CRM for the Revenue team inside Venture-Portal (Member app › Profile › **My leads & appointments**). It covers two kinds of screens:

1. **The salesperson CRM** (`CRM Revenue View.dc.html`, option **3b**). Every non-management role uses it: Senior Team Leader, Team Leader, Team Assistant, Senior Revenue Specialist and Revenue Specialist. It has five tabs: Inbox, Contacts, Calendar, Insight and Profile.
2. **The Control panel** (`CRM Principal View.dc.html`, option **1a**). Principal and Revenue Director use it. It has five tabs: Insight, Inbox (status board), Assignment, Calendar and Profile. The Revenue Director also has a **My CRM** toggle that switches to their own salesperson CRM.

Target code: `Venture-Portal`, mainly `src/components/member/MemberCrm.tsx`, `src/lib/member/crm.ts` and `src/lib/member/crm-actions.ts` (plus the Supabase tables `crm_*`).

## About the design files
The `.dc.html` files are **HTML design references**. They are prototypes that show the intended look and behaviour; they are not production code to copy. Rebuild them in Venture-Portal's existing stack (Next.js + React + its member CSS) following its patterns. All data in the files is **demo data**.

To view a file, open it in a browser with `support.js` next to it. In `CRM Principal View`, use the **Role** chips above the phone to switch roles.

## Fidelity
**High-fidelity.** Reproduce the colours, type, spacing, radii and copy as shown, while using the codebase's components and tokens wherever they already exist.

## Roles & permissions (source of truth)
CRM labels map to these Venture-Portal titles: **Principal** = Chief Executive Officer, and **Revenue Director** = HOD (`Revenue Director`). Superiors and subordinates come from the **IR hierarchy** in Venture-Portal (`/team/hierarchy`).

| Area | Principal | Revenue Director | STL / TL / TA / SRS / RS |
|---|---|---|---|
| Screen | Control panel | Control panel + **My CRM** toggle | Salesperson CRM |
| Inbox | Everyone | Everyone | Own chats only |
| See subordinates | Anyone (View as a team member) | Anyone | Profile › **View my team** (people below them in their own team) |
| Assignment, Insight, Ads Performance, Showrooms, Full time lead allocation | ✓ | ✓ | ✗ |
| Assign to (in chat) | ✓ any member | ✓ any member | ✗ |
| Move | n/a | Shown but no one to pick (top level) | Only to the **direct superior** (STL → Revenue Director; TL → STL, or Revenue Director if the team has no STL; others → the next title up in their team). The receiver must Accept. |
| Share | n/a | Any team | Own team only (peers, above, below). The invitee must Accept. Their messages are labelled "Sent by". |
| Notifications | Moves, shares, Won, Lost, Overdue 9 h+ | Same | Own invites/moves + updates about **their own subordinates only** |

- **STL** can only see their own team.
- Superiors can **act** inside a subordinate's CRM (reply, book); it is not read-only.
- **Principal does not sell** and receives no ad leads. The **Revenue Director sells**: their own customers live in **My CRM**, and the Control panel shows no "Mine" chip.

## Screens — Salesperson CRM (`CRM Revenue View.dc.html` › 3b)
- **Top bar:** "‹ Back to Revenue App" with a small green dot, and a 🔔 with an unread badge that opens Profile › Notifications.
- **Inbox**
  - Search box.
  - A chip row you can scroll sideways: All · Attention (Reply soon / Urgent / Overdue) · Follow up · Appointment · Won · Lost · Cold leads, plus any user labels (only shown once used).
  - Ad filter: a sheet with a multi-select list of ads, then Save.
  - Period filter.
  - Rows show the channel badge on the avatar (WhatsApp / Messenger), the name, last-chat time (today = time, within 7 days = weekday, older = DD/MM/YYYY), ad name in green, preview, status, and an urgency label with a dot.
  - Unread count is centred on the right. Rows are sorted newest first, with pinned rows on top.
  - Swipe left for More (Pin, Label, Edit, Delete).
- **Chat**
  - Day separators, and ✓✓ ticks (blue when read).
  - Long-press menu: Reply (quoted), Copy, React, Forward, Pin, Delete.
  - "+" opens Photos, Document, Quick replies. Typing "/" opens quick-reply shortcuts.
  - Blank lines are kept when sending.
  - ⋮ menu: Share, Move, Customer info, Appointment.
  - **Book visit**:
    1. A Customer details form, pre-filled wherever possible (name, phone, property type Condo/Landed, unit size, unit location, requirement, Budget RM with an empty field, first contact).
    2. Then a bottom sheet with showroom, a sideways-scrolling date strip with month/year picker, and slots. Full or blocked slots are greyed out.
    3. Confirming sends an invitation card ("CONFIRMED · Showroom visit"). Tapping the card opens that date in Calendar.
    4. Change and Cancel (Cancel asks for confirmation). Booking sets the status to Appointment.
- **Contacts:** A–Z with rust letter headers, peach avatar, "Status · phone" line and a green call button. Swipe for Edit/Delete. Search uses a 14px-radius box on #F5EEE9.
- **Calendar**
  - Views: Month (default), Week, Day, swipeable. "Today" jumps back to today.
  - The Today section only shows when the period includes today. Its cards have **Change**, **No show** and **Show up**.
  - **Show up** opens a popup to pick Follow up / Won / Lost:
    - Won asks for the amount, then shows "Congratulations on your sale!" with fireworks.
    - Lost asks for a reason: Price, Bought elsewhere, Not ready, Other (with a text box).
  - **No show** keeps the visit in a different colour. Lost reasons for a no-show also include Unreachable.
  - Upcoming cards have **Send reminder**, which posts a reminder card.
- **Insight:** Month · Week · Day · Range (drag-select dates), plus Comparison (hide/show, compare period). Shows Leads, Appt rate, Show-up rate (= showed ÷ visits already due), Won, Cold-lead rate, and a status breakdown.
- **Profile**
  - **View my team** card (dark, only if the person has subordinates).
  - Notifications.
  - Auto-reply: Welcome reply, Outside opening hours (with open and close times), Keyword replies, images allowed, and a test panel.
  - Quick replies (shared with chat "+").
  - **View my team** opens a picker. Choosing someone shows *their* full CRM, with a banner "Viewing Farah's CRM · Switch · Exit". Switch is shown when there are 2+ subordinates.

## Screens — Control panel (`CRM Principal View.dc.html` › 1a)
- **Top bar:** 🔔 with an unread badge, which opens the full-page **Notifications** (filters: All · Move · Share · Won · Lost · Overdue 9 h+; Mark all read).
- **Insight:** "Hello, {name}" greeting. For the Revenue Director, a **Control panel | My CRM** toggle sits to its right.
  - Period picker: Today, This week, This month, Last 7 / 30 days, Last month, or custom.
  - Comparison card (Clear and Hide, compare period).
  - Teams table (Director first, then each team ordered by title).
  - Tapping a member opens their full CRM.
- **Inbox** is a **status board**:
  - Columns you swipe through: Needs a reply · Follow up · Appointment · Won · Lost. Each column fills the full height and scrolls on its own.
  - Team chips with a colour dot. Picking a team shows a member sub-row.
  - Cards show an owner pill in the team colour, and a status pill in Needs a reply.
  - Tapping a card opens that chat **inside the owner's CRM** (same chat UI as the salesperson).
  - **Contacts** button (dark) at the top right: everyone's customers A–Z with an owner pill; tapping a customer opens their chat.
- **Assignment**
  - **Organic Leads** and **Awaiting reply** (Overdue / Urgent / Reply soon lists with Move to member).
  - **Ads to teams**: each ad shows a summary card with a proportional bar. **Edit assignment** opens a full page:
    - **Evenly**: everyone shares equally.
    - **By team**: % per team. Typing or sliding auto-balances the rest; values you have set stay locked.
    - **By people**: Max per person (default, a preset maximum) or By % (manual, must total 100%).
  - Leads arrive over time:
    - Evenly works round-robin.
    - % gives each new lead to whoever is furthest below their %.
    - Max per person stops at the maximum; once everyone is full, the rest go to Organic Leads until changed.
    - Counts run over the whole campaign.
  - **Full time lead allocation** (per team page):
    - Optional weekdays, multi-select (default Fri–Sun). Days that aren't chosen follow Ads to teams.
    - On a chosen day, set each full-time RS by Max per person (default) or By %.
    - Less than 100% means the rest follows Ads to teams. With 2+ full-time RS, a total over 100% is taken from the others, untouched ones first.
    - "Give all leads to X" sets that person to 100% for the day.
- **Calendar:**
  - Views: List or calendar, Month by default.
  - Filters for team and person, and a date range.
  - Stats.
  - Statuses: Booked, To mark, Showed up, Follow up, Won, Lost, No show.
- **Profile**
  - "View as a team member" (dark card), which opens the full CRM.
  - Your workspace: **Notifications → Showrooms → Ads Performance**.
  - **Showrooms**: name and address (Waze / Google Maps); **Available time slots** shown as a weekday × time matrix (✓ open); Booking limit per slot (+/−); Blocked dates and weekly closures (Principal / Director only).
  - **These settings drive Book visit in every CRM.**
  - **Ads Performance**: per-ad metrics, plus a Comparison card whose totals add up from the ad cards.

## Key rules
- **Reply urgency** (see `CRM urgency rule – dev note.md`): **Reply soon ≥ 3 h, Urgent ≥ 6 h, Overdue ≥ 9 h**, on real elapsed time (not opening hours). The label shows the actual hours. It clears once you reply.
- **Cold lead:** the WhatsApp 24 h window has closed and *we* sent the last message. It moves out of All into Cold leads, and returns to All when the customer replies.
- **Messenger:** person replies are allowed for up to 7 days.
- **Show-up rate** = showed ÷ (visits whose time has passed).

## Data / backend needs (beyond what exists today)
- `crm_showrooms`: add `address`, time slots with weekdays, booking limit per slot, blocked date ranges (with reason) and weekly closures.
- Customer details on the lead: phone, property type, unit size, unit location, requirement, budget, first contact.
- Lead status: add Appointment, Won (with amount), Lost (with reason), No show, Cold.
- Share / Move invitations with accept and decline, plus a notifications feed.
- Assignment rules per ad (mode, team %, per-person max or %, campaign counters) and full-time weekday rules per team.
- Labels (name + colour), quick replies, and auto-reply settings (welcome, out-of-hours, keywords, images).

## Design tokens
- **Ink** #3F2B22; **sub** #806B60; **muted** #A8968B / #B5A398; **border** #EBDDD2; **soft bg** #FBF7F3 / #F5EEE9; **card** #FFFFFF.
- **Accent rust** #BD4A19; **peach tint** #FFF0E4 / #FCE6D6; **dark brown** #4E2F20.
- **Green** #387557 (ad names, Won, success); **red** #A3371A (Overdue, delete); **amber** #A46312 (Urgent); **blue** #2F6FB5 (Messenger, Team Kelvin, Move); **plum** #8E4B6E (Share); read ticks #2F8FD8.
- **Team colours:** Team Aina #BD4A19, Team Kelvin #2F6FB5, Director #387557.
- **Radii:** chips 17–20px; cards 16–22px; sheets 24–26px (top); inputs 12–14px.
- **Type:** the Inter stack. Titles 28/700 −.03em; section 17–20/700; body 14–15; meta 11–13.
- **Motion:** bottom sheets slide up over 320ms cubic-bezier(.2,.8,.2,1); full pages slide in from the right over 280ms; the backdrop fades in over 200ms.

## Files
- `CRM Revenue View.dc.html`: the salesperson CRM. **3b** is the reference. **2a** shows the same CRM opened from Revenue app › Profile › My leads & appointments. **2b** is desktop.
- `CRM Principal View.dc.html`: the Control panel and role switcher. Other roles mount `CRM Revenue View` with these props: `embed`, `role`, `team`, `asWho`, `roster`, `superior`, `showrooms`, `meName`, `meTitle`, `rdMode`.
- `CRM urgency rule – dev note.md`: exact code changes for the 9 h Overdue rule in `src/lib/member/crm.ts`.
- `support.js`: the runtime that lets the `.dc.html` files open in a browser. It is not part of the implementation.
