# CRM Desktop v2 — build notes

What was built from this handoff, what was decided along the way, where the build differs from the prototype and why, and what is still open. The README and `prototypes/CrmFrame v2.dc.html` are the source; anything not listed here follows them exactly.

## How it is built

- `src/components/member/crm/desk/DeskApp.tsx` is **generated** from `prototypes/CrmFrame v2.dc.html` (`node tools/crm-design/gen-desk.cjs`). Live data goes in through patches (`tools/crm-design/desk-patches.cjs`, `desk-chat-v2.cjs`, `desk-channels.cjs`). Each patch matches once and says why. Never edit the `.tsx`.
- Behaviour lives in the view model `desk/vm/*.ts` (`app.ts` puts them together). New in v2: `assign-v2.ts`, `people.ts` (Contacts), `form.ts` + `formpage.ts` (Customer form), `audit.ts` (Audit log), `channels.ts` (Channels).
- **Check against the prototype:** `npm run dev`, then:
  - `ALSO1280=1 node tools/crm-design/compare-desk.mjs <dir>` draws every canvas frame at 1440 × 900 and again at 1280 × 800, and compares the prototype with the app pixel by pixel.
  - `SCENES=tools/crm-design/scenes/desk-v2.json` adds the interaction states. These are 39 scenes (menus, popovers, hover, the ⋮ menu, the message menu, attach, alerts, the date range, Contacts' filters / sort / + column, every Channels tab, Unlink, Add a number, By team, the ad's audit log, Full time, Member work type, Customer form, Audit log filters). Each is played with real mouse events on both.
- **Result on 2026-10-15, after merging main (#425–#429):**
  - 56 frames: 0 px apart, except 10 where 3 px differ — the antialiasing of a pill's corner on Insight.
  - 78 interaction shots: 0 px apart, except 12 with the same 3 px.

## Linked rules (the owner: "规则要连通")

| Rule | Where it holds |
|---|---|
| Customer form → Inbox Customer info, Edit customer, Contacts' filters and columns | `vm/form.ts` is the one model (`formV2`). Customer info (`app.ts` › ibInfo), Edit (`extras.ts`) and Contacts (`people.ts`) all read it. The phone reads the same `crm_forms` row. |
| Ads to teams and Ads Performance show the same numbers | Both come from `crmFigures` over the same leads and appointments. Meta's figures are "—" on both until Meta Ads is connected. |
| Every per-page audit log, Customer form, Channels and chat Move/Share/Assign → the sidebar Audit log | `vm/audit.ts` reads `crm_events` (assigned, moved, shared…) and `audit_changes()` for `crm_ad_assign`, `crm_staff`, `crm_fulltime_rules`, `crm_showrooms`, `crm_forms`, `crm_templates` and the new `crm_channels`. The per-page logs read the same rows. |
| Only Full time members appear in Full time allocation | `assign.ts` › `ftPeople` keeps `fullTime` only. Member work type writes it (`crm_set_full_time`). |
| Move only to the direct upline; Principal cannot Move; Share within the team chain | `inbox.ts` › `chatMenuVM`: the Principal sees "You're the top level" (no Move), and a Director's Move goes to the Principal. The database asks again (`crm_send_to`, `crm_invite`). |
| Channels link / unlink decides whether Inbox receives messages; only Principal / Director may change it | `crm_set_channel` asks `crm_manages()`. The ingest functions skip a message from an unlinked asset (migration below). |
| ⋮ Mark unread / Mute / Pin show in the Inbox list | Inbox rows: unread dot or count, mute icon, pinned first with a pin icon (`inbox.ts`, patches in `desk-patches.cjs`). |

## Database (migration `20261015100000_crm_desktop_v2.sql` — written, NOT applied)

- New table `crm_channels`: kind, external_id, name, linked, is_default, saved (jsonb), updated_at / updated_by. Read with `crm_sees_all()`; written only through the functions below. Audit-registered.
- `crm_set_channel(kind, external_id, name, linked, is_default)` and `crm_note_channel_save(kind, external_id, what)`. Both ask `crm_manages()`.
- `crm_ingest_whatsapp` / `crm_ingest_messenger`: one statement swapped into production's own body (md5 checked first). A message to a number or Page marked unlinked is counted as ignored, not stored.
- `crm_save_form` accepts the answer type `Range`.
- PGlite: `tests/member-sql/validate-crm-desktop-v2.mjs` (15 checks).
- Until it is applied, the app reads softly: Channels shows every asset as linked, and nothing is gated.

## What I filled in or decided

1. **Assignment menu:** Awaiting reply and Chat progress left the menu. Chat progress is the Inbox's 4th column. Settings' History became the sidebar Audit log.
2. **Ads to teams:**
   - The status filter opens on "All ads", because the CRM does not know Meta's Running / Paused yet; a card's status reads "—".
   - "Needs attention" = ads with held leads (a full By max team).
3. **Ad performance:** Spend, Reach, Clicks and the costs are "—" until the Meta Marketing API (ads_read) is connected. Leads and Appointments are real. The Custom range picks any month, not only October.
4. **Ad audit log:** from `crm_ad_assign`'s history and the ad's first lead.
5. **Full time:** opening a team with no rule ticks Mon–Fri, as the prototype's own code does. (Screenshot 07 shows none ticked, but the prototype draws Mon–Fri — we follow the prototype.)
6. **Member work type:** the launch default "everyone Part time" was **not** applied to production data. Today's choices stay until someone changes them.
7. **Chat:**
   - Text bubbles follow v2 (time under the words), not the phone's WhatsApp-style inline time.
   - The visit card is v2's reminder card.
   - The message menu has **Forward** and **Info** beside v2's Reply · Copy · Star · Pin · Delete for me, as the phone has since 2026-10-14.
   - A quote shows inside a bubble that answers one.
   - The + menu lists Quick replies and Auto replies inside the popover, with a Back row.
   - The mic sends text and does not record on a computer. The sticker icon does nothing yet. The phone's new Sticker panel with Recents (#425, merged the same day) is not on the desktop.
8. **Move / Share:** a Director's Move goes to the Principal (`crm_send_to`, 30 s Undo). Share for the Principal and Director lists everybody in the CRM — Edit · All in the permission matrix.
9. **Calendar:** for a Director, the extra "Revenue Director" chip pushes the view switch onto a second row.
10. **Customer form:**
    - The built-in questions (Property type, Unit size, Unit location, Requirement, Budget) keep their answer type, because the phone asks them in their own controls.
    - Status is not stored as a question.
    - A Range answer is a text box on the phone.
11. **Contacts:**
    - Status options add Won / Lost / Cold.
    - Last chat adds Earlier.
    - A row opens the chat in Inbox.
12. **Channels:**
    - WhatsApp insights combine every WhatsApp chat, because messages carry no per-number field.
    - "Blocked" and the call log are "View in Meta".
    - The business category list is a subset.
    - Linking a NEW Page / number / account happens in Meta (Embedded Signup needs App Review). Link / Unlink here only decides what the Inbox takes in.
    - The token is never shown, not even its last letters.
13. **States not drawn:** empty, loading, error and no-permission states use the page's own empty style:
    - Channels: "Loading from Meta…", Meta's error in words, and a read-only banner for anyone without Manage.
    - Contacts: "No contacts match these filters".
    - Audit log: the README's "Nothing recorded under this filter".
14. **Fixed from rev 1:**
    - The alerts badge was a fixed "7"; it now counts the alerts.
    - Desktop toasts from shared actions were never shown.
    - The photo viewer and the message menu were not mounted on the desktop.

## Differences from the prototype, and why

- **Sample data → live data:** names, counts and dates are the CRM's own. Where the CRM has no such data (Meta spend, Instagram), "—" or "View in Meta" stands in.
- **Browser Back** steps through every click, with no 50-step cap; the browser keeps its own history.
- **Message menu:** two more rows (Forward, Info), kept from the phone (2026-10-14).

## Open — decisions for the owner

1. **Apply migration `20261015100000`** to production. Asked first; not done.
2. **Meta App Review:**
   - `ads_read` / `ads_management` for spend, reach, clicks, budgets and Running / Paused.
   - Human Agent for Messenger after 24 h.
   - Embedded Signup to link new assets from the CRM.
3. Member work type's launch default ("everyone Part time") — apply it to production data or not?
4. The salesperson's (RS / TL) desktop is not built; it was not in this handoff's scope.
