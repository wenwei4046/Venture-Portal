# Module spec — Marketing's view (2026-10-23)

The Marketing Department's own desktop view, from the Claude Design handoff **HOUZS Marketing Module Setup** (`.design/marketing/design_handoff_houzs_marketing/`: README = the spec, `design/*.dc.html` = each screen with its logic, `hm-store.js` = the stage machine). The decisions and rules as built: `.claude/rules/marketing/marketing-view.md`. The look: `docs/DESIGN.md` › "Marketing's view".

## 1. What the user decided (2026-10-23)

| Question | Answer |
|---|---|
| What is it | Marketing's own department view — "这里其实就是他们的 desktop view". |
| Who has the manager tools | **MM + AMM** — MARKETING MANAGER and ASSISTANT MARKETING MANAGER (template *Marketing · Manager*); the rest *Marketing · Staff*. |
| Billing | Marketing lists each subsidiary's billable drafts for the month; Finance imports them in one click into the `marketing_project` invoice. |
| CRM | Not wired for now: an Ads report's figures are typed in. |
| "+ Add subsidiary" | Marketing's own client list (not Finance's `companies`). |
| Punching from a phone | Not from Marketing for now — "cause last once desktop view done, i will do marketing app mobile". |
| Scope | Everything as designed, in order ① → ⑦ below. |
| Big files | ≤ 50 MB uploaded; bigger as links. Storage is moving to Cloudflare R2 (another session) — Marketing's files wait for it. |

## 2. Build order

| PR | Contents | Status |
|---|---|---|
| ① | The permission and templates; the tables and readers; the shell (sidebar, top bar, search, bell, Appearance, account menu); My Space's task tiles; the Calendar; Projects (list + a project's stages); the Tracking Dashboard (read) | this PR |
| ② | New Project (product project → minutes → PIC tracking link → PIC response; Quick task; Recurring task and its repeat rule), the Assignment plan (SLA working days, approvers ≤ 3 levels, split), the task pages (accept → work → submit / complete; approve / request changes; subtasks and Review delivery; reassign; versions), notices (the bell, *Assignment plan* banners), Nudge, the billing drafts and Finance's import | next |
| ③ | The builders: Workflow Builder (stages, who, SLA, approvals, deliverables, form fields, versions, lock), the Canvas Template Editor, Product Builder (one-time / recurring, items × price, cost → margin, versions), Minutes Builder | |
| ④ | Tracking's actions, the Subsidiary page (stats, month / week / timeline, key dates, feed), the Audit trail (replay, formal log, CSV / PDF), the Task map, Replace Person, Marketing's clients (+ Add subsidiary) | |
| ⑤ | The PIC's public links — PIC Link, PIC Task Link, PIC Calendar (no login; approve = type your name; changes ≥ 5 characters; ads reports) | |
| ⑥ | The Library (per company: brand profile, folders, files, categories, upload ≤ 50 MB or a link, guest share link with expiry, attach to a task, dustbin 30 days) — on R2 | after R2 |
| ⑦ | My Space's personal side: cover and avatar uploads, status, Edit layout, the room, the pet (levels, XP, energy, states), the lobby, chat (DM + lobby), trophies, notes, photo; the 5-step first-login onboarding | last |

## 3. Data (mig `20261023214100`)

`mkt_subsidiaries` · `mkt_team` · `mkt_projects` · `mkt_stages` · `mkt_subtasks` · `mkt_events` — RLS on, no policy, no client grants; every read and write a SECURITY DEFINER function asking `has_any_action`. Readers: `mkt_board(from, to)`, `mkt_shell()`, `mkt_search(q)`, `mkt_notices(n)`. The stage machine is `hm-store.js`'s: `planned → todo` (opened for its owner) `→ accepted → review` (each approver in turn — a person, or the PIC through the link) `→ done`, or `→ changes` (back to the owner). A product project waits `minutes → waiting_pic → changes / approved` before its plan makes it `active`. A recurring task is a series row (its rule, the stages each run copies) and a project per run (`RCR-…-Rnn`).

## 4. Gaps against the live portal (found while building ①)

1. **Subsidiaries.** The handoff draws Carres, Houzs Century, 2990 Home, Hookka, **Colive**, Dreamcrafter, CMI, The Conts; the portal's `companies` are 2990, Carres, CMI, Dream Crafter, Hookka, HOUZS Century, **Ohana**, The Cont (codes 2990 CAR CMI DC HK HC OHN CONTS). Seeded from `companies` with the handoff's dots; Colive's place is Ohana's. Names show as the portal keeps them.
2. **People.** Marketing has 10 titles and 12 active people, all on *Staff · Basic*, and **no logins yet** — nobody can open the view until HR invites them. SHANEN has no title. Teams (Content, Social Media, Design, Ads, Brand) do not exist in People: Marketing keeps them (`mkt_team`), a title's default by `mkt_title_team()`.
3. **Me.** *Staff · Basic* had no Me (attendance.md 2026-10-20); Marketing's top bar carries Me for a personal login, so Marketing can punch from a computer.
4. **Billing.** The `marketing_project` service contract exists and Finance types its invoice lines by hand (39 invoices); the handoff's product prices are not wired to it. ② lists the drafts; Finance imports them.
5. **CRM.** The CRM has leads, appointments and wins per ad, but no Page → subsidiary map, and spend lives only in Meta. A production-only Leads module (`lead_*`) also exists. Not wired (the user's answer).
6. **Holidays.** The prototype hard-codes Deepavali and Christmas; the portal reads HR's `att_holidays` — empty on production today, so working days skip weekends only until HR fills them.
7. **Leave.** The Assignment plan and Tracking's load ignore approved leave (Attendance has it) — to wire in ②.
8. **Storage.** The handoff shows 84 MB–1.2 GB videos and data-URL uploads; the portal will keep ≤ 50 MB uploads on R2 and links beyond.
9. **Persistence.** My Space's layout, room and pet live in `localStorage` in the prototype → the database in ⑦.
10. **Chat.** No staff chat exists in the portal (DM + lobby) — tables and Realtime in ⑦.
11. **Public links.** The prototype's `houzs.link` domain does not exist; the PIC is not a portal user (approve = a typed name) — ⑤.
12. **Nudge on WhatsApp.** Staff phone numbers live in People; ② sends an in-app notice first.
13. **Working hours.** "Not accepted · 5 working hours" and the PIC's "6 working hours" need a definition of working hours (the attendance schedule?) — asked, not guessed.
14. **Projects list** — not designed; built in the Calendar's look.
15. **"New Page"** (the staff's top-bar button) — undesigned; the dustbin purge and a recurring run's opening need a scheduled sweep (②).

## 5. Open questions (for the user)

1. A title's default team: SENIOR MARKETING EXECUTIVE and TELEMARKETER → **Ads**; EVENT SPECIALIST CUM VISUAL MERCHANDISER → **Brand** — right? (The manager can change anyone's team.)
2. When is an unaccepted stage red — after how many working hours? What are the PIC's "working hours"?
3. Once R2 is in, should uploads go above 50 MB?
4. HR invites Marketing's 12 people (no logins yet) — when?
