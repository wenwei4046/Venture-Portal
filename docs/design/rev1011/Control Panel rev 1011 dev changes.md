# Control panel (Principal) · rev 1011 · Developer change list

> **Must-do before release:** iPhone safe areas — see "MUST · iPhone safe areas" below. Applies to RS and the Control panel.

Code: `src/components/member/crm/panel/` (paths below relative to it).
Design reference: `rev 1011.dc.html` (one frame per screen; each runs the repo's own vm/*.ts on the demo team).

---

## 1 · Inbox (`vm/inbox.ts`)

**1.1 Opening a chat keeps the Principal's identity**
- Tapping a chat in Inbox opens it inside the Control panel as the Principal, whoever it is assigned to.
- In the row's `open`, replace `c.assignedTo ? ctx.openCrmOf(c.assignedTo, c.id) : ctx.patch({ lead: c.id, … })` with `ctx.patch({ lead: c.id, pick: "", toast: "" })`.
- Calendar visits and Insight › Awaiting reply already open this way; the three now match.
- Acting as a salesperson happens only from Profile › View as a team member (unchanged).

## 2 · Chat (`PanelLead.tsx`)

**2.1 Top spacing**
- Outer `<main>`: top padding `6px` → `padding-top: max(16px, env(safe-area-inset-top))`. Same change as RS (`SalesChat.tsx`, rev 1010 › 1.6).

**2.2 Chat look = RS (rev 1010 › 1.1–1.2)**
- Chat list (`data-chat-list`): `background-color: #EFE7DE`, the same 240×240 line-icon tile as RS, bleeding to the edges (`margin: 0 -20px; padding: 10px 20px`).
- Day pill: background `#FFFFFF` + `box-shadow: 0 1px 1px rgba(63,43,34,.10)`.
- Bubbles (`vm/lead.ts`): own `#FCD6B8` (was `#FFF0E4`), border same; customer `#FFFFFF`, border `#FFFFFF` (was `#EBDDD2`). All bubbles `box-shadow: 0 1px 1px rgba(63,43,34,.10)`.
- Time already sits right on both sides here; no change.
- Header and composer on white like RS: the chat's outer `<main>` gets `background: #FFFFFF` (the panel shell is `#FBF7F3`, which showed through above and below the chat).

**2.3 Header: no reply-window line**
- Under the customer name keep only "{owner}'s customer"; drop " · reply window open Xh Ym" (`vm/lead.ts › windowNote` → `""`). Same as RS rev 1010 › 1.4. The cold / closed-window banner stays.

## 3 · Inbox › Contacts sheet (`PanelOverlays.tsx`, `vm/inbox.ts › contactsVM`)

**3.1 Row layout: name / phone / salesperson**
- Each contact row stacks three lines under the avatar:
  1. customer name (15px / 650, unchanged)
  2. phone (12px, `#806B60`, tabular, ellipsis)
  3. salesperson: plain text, no pill. Coloured dot (7px, team colour) + name, 12px / 600, `#3F2B22`, ellipsis
- Fixed line heights so the lines never overlap: name 20px, phone 16px, salesperson 16px; gap 2px.
- Remove the status ("Appointment · ", "Follow up · ") from the row.
- The call button on the right stays.

## 4 · Inbox board cards (`PanelInbox.tsx`)

**4.1 Preview: 2 lines max**
- Keep the 2-line clamp (`WebkitLineClamp: 2`, `WebkitBoxOrient: "vertical"`) and add `lineHeight: "18px"`, `maxHeight: "36px"`, `overflowWrap: "anywhere"` so a long preview never reaches the footer.

**4.2 Card footer: one tidy line**
- Footer under the preview, separated by a hairline: `padding-top: 8px; border-top: 1px solid #F3E9E1`, 12px / 16px.
- Left: salesperson as plain text, no pill: 7px dot in the team colour + name, 600, `#3F2B22`, ellipsis.
- Right: reply state as text only, no pill: "Reply soon · 3 h" / "Overdue · 48 h", 700, in its urgency colour (`uc`).

## 5 · Calendar (`PanelCalendar.tsx`, `vm/calendar.ts`)

**5.1 A visit opens Customer info first, then the chat** (same as RS rev 1010 › 3)
- Today and Upcoming (and every other place the calendar lists a visit): tap → Customer info sheet, not the chat.
- In `vm/calendar.ts` the visit's `open` sets a new ui field `calInfo: customerId` (was `lead: customerId`). Add `calInfo: null` to `PanelUi` / `initialPanelUi`.
- The sheet is the RS Customer info sheet (avatar, name, Edit, rows, **Open chat**), rows = `infoRows(c)` with the rev 1010 changes: First contact and **Last chat** as `dd/mm/yyyy, h:mm am`.
- Open chat → `patch({ calInfo: null, lead: id })` (the Principal's own chat, as 1.1). Edit → the customer form. Backdrop → close.

## 6 · Assignment (`PanelAssign.tsx`, `vm/assign.ts`)

**6.1 Overview first, each setting on its own page**
- Assignment opens on an overview: title "Assignment" / "Who gets each new enquiry", then one card per function. Card: white, `border: 1px solid #EBDDD2`, radius 18, padding 16; left a 40px icon square (radius 12) in the section's colour; title 16 / 650; one summary line 13px `#806B60`; right a count pill in the section colour (only when > 0) and a chevron.
  - **Organic Leads** (rust `#BD4A19`): "N waiting to be sent to someone" / "Nothing waiting"; count = N.
  - **Ads to teams** (blue `#2F6FB5`; a TL sees "Ads to my team"): see 6.3 for the summary line; no count.
  - **Awaiting reply** (plum `#8E4B6E`): "N need a reply · M overdue" / "Everyone is answered"; count = N.
  - **Full time lead allocation** (green `#387557`): "N of T teams set" / "Not set for any team"; no count.
- Tap a card → that section alone, exactly as today (same editors, Send to, Save). The top back link reads "‹ Assignment" and returns to the overview (in place of "Back to Revenue app").
- New ui field `asSec: "org" | "ads" | "await" | "ft" | null` (null = overview). Leaving the tab resets it.
- Nav badge on Assignment unchanged.

**6.2 Full time lead allocation: pick days per person, ticked people only, turns** (behaviour change)
- Replaces Max / By % per day. Per team, each full-time RS gets a row of 7 day boxes (Mon–Sun, 30×30, radius 9). Tap to tick: ticked = `#387557` with a white check; unticked = white, border `#D9C7BA`.
- Rule (the database deals by it):
  - On a day where **one** person is ticked, every ad enquiry the team receives that day goes to that person only.
  - Where **two or more** are ticked, they take turns (round robin, in a stable order; the next enquiry goes to whoever got one least recently).
  - Where **nobody** is ticked, the day follows Ads to teams as today.
  - Only the team's share is affected; other teams are unchanged.
- Editor (full screen, as today): back "‹ Full time lead allocation", team name, the person × day grid (no explanation line), then **Who gets the enquiries**: one line per weekday, e.g. "Fri · Daniel Tan only", "Sat · Amir Hamzah, Daniel Tan take turns", "Mon · Follows Ads to teams" (muted). Footer: Clear all · Save.
- Section card per team: "Fri, Sat, Sun" (days with anyone ticked) or "Off · follows Ads to teams"; each person's 7 chips green on their ticked days.
- Storage: `crm_save_fulltime` gets a new mode `"turns"`: `days` = days with anyone ticked, `vals[staffId][day] = 1` when ticked, else 0. The dealer (`crm_assign_enquiry` or wherever full time is applied) must implement the rule above for `"turns"`; existing `cnt` / `pct` rows can be migrated (any value > 0 → ticked) or left until edited.
- Acceptance: tick Daniel Tan on Fri only → on a Friday every Team Kelvin ad enquiry goes to Daniel Tan. Tick Daniel Tan and Amir Hamzah on Sat → Saturday enquiries alternate between them. Untick all → the team follows Ads to teams.

**6.3 An ad with no setting is dealt evenly to every team** (behaviour change)
- Today (`20261003020000_crm_assign_on_arrival.sql`): an ad with no Ads-to-teams rule gives the customer **no team**, so it waits in Organic Leads for the Principal / HOD.
- New: an ad with no rule is dealt **evenly across all teams** (same balancing as Mode 1 "Evenly": whoever is furthest below their share over the last 30 days gets the next one). Inside the team the usual rules apply, including Full time (6.2).
- Organic Leads keeps only enquiries with **no ad** (no `ad_source_id`), and anything a rule can't place (e.g. no teams exist).
- Screens:
  - Ad row tag "Not set" (rust) → "Evenly · default" (`#F5EBE3` / `#806B60`). (No bar is drawn for a default row, as today.)
  - Assignment overview card: "N ads · M on the default (evenly)" / "N ads · all set", muted, no count pill.
- Implement in the dealer (SQL) and its TypeScript twin `crm-team.ts › assignEnquiry`; keep them in step.
- Acceptance: with no rule for Sofa Clearance, three new Sofa Clearance enquiries go one each to Team Kelvin, Team Priya, Team Ryan (then by each team's own rules). A no-ad WhatsApp enquiry still lands in Organic Leads.

**6.4 How an ad enquiry is dealt (summary, agreed 2026-10-11)**
1. Which team / person, by the ad's setting:
   - No setting → evenly across all teams (6.3).
   - Evenly → evenly across the teams chosen.
   - By team → by each team's %.
   - By team → team split, then inside each team per 6.6 (Full time days apply in every mode).
2. Inside the team (Evenly / By team / default only): on a day with someone ticked in Full time (6.2), only the ticked person gets it; two or more take turns. A day with nobody ticked follows the team's usual split.
3. No ad at all → Organic Leads, sent by hand (Principal / HOD).

**6.5 Ads to teams › By team: no Set / Auto tag**
- Remove the small "Set" / "Auto" tag under each team name in the Split across teams editor (`PanelAssign.tsx`, the span reading `r.lockTxt`). The auto-balance stays exactly as is (the teams you didn't touch absorb the change; the last two you touched keep their value).

**6.6 By team: two levels — teams by %, then each team Evenly / By % / By max** (behaviour change; **By people is merged into By team and removed**)
- Mode switch is now **Evenly · By team** only. Existing By people rules open as By team.
- **Who sets it**: Principal and Director now (CRM · Manage). Later STL / TL may get it for their own team (a permission, not a new screen).
- **Level 1 · Split across teams**: the existing By team card (sliders + number box, total 100%). The team's share is balanced over the ad's whole life.
- **Level 2 · Inside each team** (new section under the split; one card per team with a share above 0), a 3-way switch per team:
  - **Evenly**: in turn among the team, Full time days (6.2) apply. Line: "In turn among Daniel, Farah, Daniel, Amir · Full time days apply".
  - **By %** (**default** for every team): each member a %, total 100 (starts even). **Auto-balance**: typing one person's % spreads the rest evenly over the people not yet edited, so it always adds up to 100; people already edited keep their value. When everyone has been edited, the difference is taken from the other people in edit order (earliest first, none below 0); a shortfall goes to the earliest. Switching mode resets this. Example: Team A gets 50 of 100 → 50% / 30% / 20% = 25 / 15 / 10.
  - **By max**: each member a maximum, **starting at 0** when the mode is picked (Save stays off until at least one person has a maximum); leads go in turn to whoever has taken the fewest and is still below their max; 0 = gets none. Row note "2 of 2 taken · full" (`#A3371A`). Footer "Up to N leads in this team".
  - **Full time days override every inside mode** (Evenly, By % and By max): on a day where the team has people ticked in Full time lead allocation, that team's leads go only to the ticked people, in turn (% and max are **not** applied that day: a ticked person keeps getting leads even past their By max limit; nothing goes to Over the limit because of Full time). Leads count toward "taken". Days with nobody ticked follow the team's Evenly / By % / By max setting. The team split across teams is unchanged on every day. (`#387557`).
- Save is enabled when the team split is 100% and every By % team adds to 100 / every By max team has at least one maximum.
- **When a By max team is full**: new leads of that ad do **not** go to another team. They wait in **Over the limit**, grouped by ad, and keep the team they were dealt to.
- **Over the limit lives inside Ads to teams** (no separate Assignment card): when any lead waits, a banner at the top of Ads to teams — warning icon, "3 leads over the limit" in `#A3371A`, "A By max team is full. Open the ad and raise a limit; waiting leads are dealt first." on `#FFF6EE` / border `#F3D9C4`. The ad's card gets a pill "3 waiting" (`#A3371A`, white) next to its name; tapping the card opens the editor to raise limits. The banner opens an **Over the limit** page: header with ‹ back (to Ads to teams) and ✕ close, sub-line "3 leads · 1 ad". One card per ad: ad name, "Team Kelvin full · 3 waiting" (`#A3371A`), **Edit limits**. Each customer row: name, "WhatsApp · waiting 1 h", a chat button (opens the chat; Principal can answer, then send from there) and **Send to** (the same Send to sheet as Organic Leads; once sent the lead leaves the list and the hold is cleared). On the Assignment overview the Ads to teams row reads "3 ads · 3 leads over the limit" with the count badge (same as Organic Leads); unchanged when nothing waits.
- **Saving a raised limit**: rule continues; waiting leads of that ad are dealt first, oldest first, **only inside the team they wait for** (toast: "Bedframe Bundle · Reels saved · 2 waiting leads dealt").
- **Ad card (compact)**: whole card taps into the editor (chevron, no Edit assignment button). Line 1 name; line 2 "WhatsApp · 10 leads · By team" (an ad with no rule reads "WhatsApp · 4 leads · Not set · evenly"; one set to Evenly reads "· Evenly"). Thin 6px bar, then a 3-column legend per team: dot + team name without "Team", share in bold, "· max" / "· evenly" when not the By % default. Evenly / unassigned ads show no legend.
- **Storage**: `crm_save_ad_assign` with `mode = "split"`: `p_team_split` = team %, new per-team map `{ tlId: "even" | "pct" | "cnt" }` (saved for every team; absent = By % with an even split), `p_people` = per-person value for those teams. Held customers need a state (e.g. `held_reason = 'limit'` + held team, no person) so they are not Organic Leads. Dealer (SQL + `crm-team.ts` twin) implements both levels and the hold. Drop the By people mode.
- **Acceptance**: Team Kelvin By max with Daniel Tan 2, Amir 1, Daniel Ong 1, Farah 1; once all are full, the next Bedframe lead is in Over the limit (not with Priya or Ryan). Raise Amir to 3, save → two waiting leads go to Amir. Team Kelvin on By max with Daniel Tan ticked on Friday: on Friday every Team Kelvin lead goes to Daniel Tan only.

- Assignment overview · Organic Leads subtitle: "2 to send" (was "2 waiting to be sent to someone"), one line.

- Calendar hero: first figure **Leads** (was Visits) = leads created in the chosen range, filtered by the team / person chips. Tap Leads → list sheet like RS Insight: fixed height, ‹ back left of the title (→ Calendar), title "Leads · 1 Oct – 31 Oct" + count, rows = name / phone / salesperson (or "Not sent yet"), right = last chat date / time, newest first, "End of list" at the bottom. Row → Customer info (‹ back → the list; backdrop → close both; Open chat → chat). **Upcoming** and **Showed up** open the same sheet listing those visits (title "Upcoming · …" / "Showed up · …", count "3 visits"; right side = visit date / time; Upcoming soonest first, Showed up newest first). Show-up % is not tappable.
- Calendar › Customer info: ‹ back left of the avatar → closes the sheet and returns to where it was opened (Calendar list, or the day / range sheet if opened from one). Backdrop does the same.

- **Notifications · Unread | Read** (Profile › Notifications, the bell): segmented control under the title, default Unread; Unread carries the rust count badge. Tap a row → read (moves to Read). The kind chips (All · Move · Share · Won · Lost · Overdue 9 h+) filter inside the chosen tab and count only that tab. "Mark all read" shows on Unread only. Empty: "You're all caught up." / "Nothing read yet." Read state stays per person (`crm_read_notifs`, `notifsSeenAt`). Same as RS (RS list item 6).

- **Profile › Member work type** (new row above Showrooms, calendar-check icon on `#F3E8EF` / `#8E4B6E`, no sub-line): a page listing **every team member** (TL, TA, RS) by team (team header "1 of 3 full time"), each with a switch (on `#387557`). On = Full time, and that person appears in Assignment › Full time lead allocation (filter becomes `fullTime` for any role; was `role === "rs" && fullTime`). Off = Part time: they leave Full time lead allocation and their ticked days are cleared. Toast "Daniel Ong is now full time", gone after 3 s. **Only Principal and Director** see this row and can change it. Storage: the person's `full_time` flag (today set in People / HR) — needs a write for CRM · Manage (Principal, Director).

- **Profile › Cold lead templates** (new row below Showrooms, above Ads Performance, message icon on `#FFF0E4` / `#BD4A19`, no sub-line). Principal and Director only.
  - **No master switch.** Under the title: "Switch a template on and salespeople can send it from a cold lead's chat. Only approved templates can be switched on." Default: every template Off, so salespeople see no template option (today's RS behaviour) until one is switched on.
  - **Each template has its own switch** (on the card, right of the status pill). Only **Approved** templates can be switched on (others greyed, 45%). A salesperson sees a template when it is Approved and On. Toast "Follow up visit on for salespeople", 3 s.
  - **Templates list**: card per template — name, channel (WhatsApp `#1F7A4D` / Messenger `#2F6FB5`), status pill **Approved** / **In review** / **Rejected** / **Draft**, 3-line body preview. "+ New template".
  - **Editor sheet**: name, channel (WhatsApp | Messenger), message with "+ Customer name" inserting `{name}` (replaced with the customer's first name). Buttons **Save draft** and **Submit for review** (→ In review; status comes back from Meta's review: Approved / Rejected). Delete on an existing one.
  - Storage / backend: a templates table (name, channel, body, status, provider template id); submit uses the WhatsApp Business template API (and Messenger's equivalent); a webhook updates status. Each template stores its on/off flag. Sending from the chat uses `sendCrmTemplate` (already exists).

- **Top bar: back link and bell on one row** (Assignment, Calendar, Profile, Ads Performance; Insight / Inbox keep the bell alone on the right). Today `PanelBell` and `PanelHead` each take a row, so "‹ Back to Revenue app" sits a row below the bell. Merge into one row: back link left, bell right, centred vertically (min-height 44px, padding 4px 14px 0 20px). The page title moves up ~40px.

- **MUST · iPhone safe areas (camera / Dynamic Island and home bar)** — required, not optional. Nothing in the CRM may sit under the camera cut-out, the status bar or the home indicator, on any screen, sheet or overlay. Bug in the live code today. The CRM's root `.app` (`crm/crm.module.css`) is `position: fixed; inset: 0` and the member pages set `viewportFit: "cover"` (`member/(app)/layout.tsx`, `preview/page.tsx`). The Revenue app's own screen pads for this (`.screenLive { padding-top: env(safe-area-inset-top) }`), but the CRM is fixed on top of it and has no safe-area padding anywhere, so on an iPhone the top bar (back link, bell, Hello / titles) can sit under the camera cut-out and status bar, and the bottom bar / chat composer under the home indicator.
  - Fix: `.app { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); padding-left/right: env(safe-area-inset-left/right, 0px); }` and give bottom sheets / full-screen overlays inside it `padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px))`. Status-bar area background = the page's top colour (#FBF7F3 Control panel, #FFFFFF chat).
  - Acceptance: on an iPhone with Dynamic Island (Safari and Home-screen app), "‹ Back to Revenue app" and the bell sit fully below the status bar; the bottom bar and the chat send button sit above the home indicator; landscape keeps content clear of the notch side.
  - Also check every full-screen layer inside the CRM (chat, Over the limit, Member work type, Cold lead templates, Notifications, Showrooms, Ads Performance, View as) and every bottom sheet: each must start below the status bar and keep its bottom button above the home indicator.
  - Do not ship rev 1011 until this passes on a real iPhone.
  - Applies to the whole CRM, so RS too.

- **Director: Team | Mine** (behaviour as today, labels change). The Director has the same rights as the Principal (CRM · View at All) and also sells, so `CrmApp` gives them both: the Control panel and their own CRM (`sells = me.role !== "boss"`, `toMyCrm`). The Principal does not sell and never sees the switch.
  - Rename the switch **"Control panel | My CRM" → "Team | Mine"**, Team on the left (same order as RS Insight's Team | Me). Team = the Control panel (everything in this list); Mine = the Director's own CRM on the RS template (everything in the RS list, rev 1010).
  - Shown in the **top bar of every Control panel page** (Insight, Inbox, Assignment, Calendar, Profile, Ads Performance), between the back link and the bell; hidden inside a chat. Moved out of the Insight header. Also in the header of the Director's own CRM (`embedded`) on every RS page, so they can switch both ways from anywhere. Opens on **Team**.
  - In Mine, the RS Insight Team | Me switch does not appear for the Director (their team view is the Control panel). Chat ⋮ Move follows the RS rule (has an upline → shows; the Director's upline is the Principal).
  - Inbox in Team: no "Director" chip for the Director themself (as today).
  - Acceptance: log in as a Director → Control panel with "Team | Mine" in the Insight header; tap Mine → own CRM (Inbox · Contacts · Calendar · Insight · Profile) with the same switch; tap Team → back. As Principal the switch is absent.

- **Leaders (STL, TL, TA with downlines): Team | Mine** (new; same pattern as the Director).
  - Who: anyone with at least one downline (`hasDownlines` / People › Hierarchy `reports_to`). Appears or disappears on its own when the hierarchy changes. **RS with no downline: no switch at all** — they only have their own CRM.
  - **Team** = the Control panel scoped to the leader's **whole downline** (`allDownlines`, every level down; never upline or sideways). Every figure, list and filter counts only those people: Insight, Inbox (team chips = their own team(s) only, no Director chip), Calendar (their people's visits).
  - In a downline's chat the leader has **the full RS chat**: read, reply, book / change / cancel visits, Customer info, Share / Move.
  - Not in Team for leaders (CRM · Manage only, Principal and Director): **Assignment** tab (bottom bar hides it, as `navVM` already does without `can.manage`), and Profile's **Member work type, Showrooms, Cold lead templates, Ads Performance**. Profile keeps Notifications and **View as** (lists only their downline).
  - Insight header line reads "Team Leader · Team Kelvin" instead of "All access".
  - **Mine** = their own CRM (RS screens), with the same "Team | Mine" switch in the top bar of every page.
  - Acceptance: log in as TL Kelvin Lee → Team shows only Team Kelvin's customers, visits and people; no Assignment tab; Profile has Notifications + View as only; open Daniel Tan's chat and send a reply → it sends. Log in as Daniel Tan (RS, no downline) → no switch.

## 7 · Toasts (`PanelScreens.tsx`)

- Every confirmation toast in the Control panel (e.g. "Team Ryan: full time days saved", "Sent to …") disappears by itself **3 s** after it appears. A new toast restarts the 3 s. Implement once where `ui.toast` is rendered: an effect on `ui.toast` that clears it after 3000 ms (only if it is still the same text).

---

## Also for RS

Merged into `RS rev 1010 dev changes.md` › section 7 (slots left, chat top spacing, Team | Mine replacing Team | Me, safe areas). Build them from there.
