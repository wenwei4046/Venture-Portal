---
paths:
  - "src/app/*/admin/**"
  - "src/lib/rooms/**"
  - "tests/member-sql/validate-meeting-rooms.mjs"
---

# HR tab — Meeting Rooms

Admin › Meeting Rooms, `/admin/rooms` — `src/app/(portal)/admin/rooms/`, `src/lib/rooms/`. DESIGN.md › "Meeting Rooms" is the visual spec; how a page and its writes are gated is `../portal-wide/permissions.md`.

Read this before changing anything it covers, and again in every full scan of such a change (a review, QA, an E2E audit) — CLAUDE.md › Rules by tab. New decisions are added here, dated, never to CLAUDE.md.

**MEETING ROOMS (2026-10-11, the HR revamp's second package — README §14 of `.design/hr-r2/handoff`, plan `.design/hr-r2/PLAN.md`; mig `20261011090000`).** The user: Meeting Rooms in EVERY view (HR's sidebar Admin above Audit Log; the old shell's Reports & Admin above Audit Log; `PAGE_TABS` hr / fin / pri / dept `.meeting_rooms`); the rooms START EMPTY (HR adds them on the Rooms tab); **whoever booked a meeting is the one who changes or cancels it** — the shared accounts are going, everyone gets their own login. Tabs Schedule · Rooms, Rooms only for `rooms.edit` (key `meeting_rooms_manage`).

- **Tables** `meeting_rooms`, `meeting_room_bookings` (ref `BK-301`… from `meeting_room_booking_ref_seq`; minutes 480–1200 in half hours; `source` portal / app / hr_app / guest; an EXCLUSION constraint stops two live bookings of a room overlapping — the database's last word on a clash, worded *Someone just took that slot*) and `meeting_room_booking_events` (the drawer's audit trail, written by the functions; `audit_register` mode none). RLS on, NO policy, nothing granted — every read and write is one of the functions below.
- **Who may.** Read: `rooms.view`, or `revenue_app.view:own` (a member reading from the Revenue app). Book: `rooms.create`, or `revenue_app.view:own` with source `app` — a member books for themselves only. Rooms: `rooms.edit`. A booking is changed or cancelled only by whoever booked it (`booked_by_user = auth.uid()`), and a guest-link booking also by a holder of `rooms.edit` (Meeting rooms · Edit). A booking made in the portal or an app is never the guest link's to touch.
- **Functions** (DEFINER, `has_any_action`): readers `meeting_rooms_range(from, to)` (at most 62 days: the bookable rooms and their live bookings, each with `mine` / `canChange`), `meeting_rooms_booking(id)`, `meeting_rooms_rooms()` (with bookings ahead), `meeting_rooms_people()` (who is asking, who may be picked, departments with somebody working, sub-departments) — all four on `READS_WHILE_VIEWING_AS`; writers `meeting_rooms_book(…, p_source, p_sub_department)` (new or edit; checks the room, the half hours, the clash, the seats), `meeting_rooms_cancel(id)`, `meeting_rooms_save_room`, `meeting_rooms_delete_room` (soft, refused while the room has bookings ahead — turn Bookable off instead).
- **Other callers** (the Revenue app, the HR app) use `lib/rooms/read.ts` (server-only readers, a date RANGE) and `lib/rooms/actions.ts` (`bookRoom` with its `source`, `cancelBooking`); parsing and wording are `lib/rooms/model.ts`.
- **The day is the address's** (`?day=`), written with `history.replaceState(null, …)` — never `history.state`, which Next's router does not read: a Server Action posts to the address the router knows, so a booking's refresh rendered today and threw the booked day away (found in the E2E, 2026-10-11). A refreshed page is taken only when it is for the day the address asks for.
- **Tests:** `lib/rooms/model.test.ts`, `admin/rooms/_components/book-form.test.ts`, PGlite `tests/member-sql/validate-meeting-rooms.mjs`. An E2E on prod names its rows "E2E …" and deletes them after, with their `audit_events`.
