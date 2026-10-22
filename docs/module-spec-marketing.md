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
| ① | The permission and templates; the tables and readers; the shell (sidebar, top bar, search, bell, Appearance, account menu); My Space's task tiles; the Calendar; Projects (list + a project's stages); the Tracking Dashboard (read) | #634, live 2026-10-23 |
| ②a | New Project's ⚡ Quick task and 🔁 Recurring task (the repeat rule, the runs) with the quick Workflow Builder; the task page (accept → work → submit / complete; approve / request changes, back to a named stage; versions; the Free space); notices; Nudge; a series paused, resumed, ended; My Space's Accept (mig `20261023234000`) | #639, live 2026-10-23 |
| ②b-1 | 📦 Product projects up to the PIC: New Project's 📦 (a product on sale today), the project's page — the stepper, the intake minutes written with the PIC and saved as typed, signatures, notes, Generate tracking link (`/t/<random>`), copy / WhatsApp, the PIC's changes and Resend, edited after approval → back to the PIC, start before approval (mig `20261024002000`) | #650, live 2026-10-23 |
| ⑤-1 | The PIC's minutes link `/t/<code>`: a stranger's page (the guest link's pattern) — the 👁 fields only, approve (a typed full name) or changes (5–500 characters), one answer per sending, why it waits again, the progress, the receipt; the owner (else the managers) told (mig `20261024003000`) | this PR |
| ②b-2 | The Assignment plan (SLA, approvers ≤ 3 levels, split, 🔓 picked by the stage before), subtasks and Review delivery, reassign, more minutes on a project, the billing drafts and Finance's import | after questions 10–12 |
| ③a | The Workflow Builder: actions and their templates, the stages (who — at assignment or 🔓 by the stage before, SLA, approval levels, PIC words, subtasks, back to, fields with a table's preset rows), the lock, drafts saved as typed on their count, versions published whole, Clone (mig `20261023235500`) | #642, live 2026-10-23 |
| ③b | The Minutes Builder: minutes templates — fields (required, PIC sees, a table's typed columns; the project and the attendees locked), completion rules, Preview as the staff and as the PIC, drafts and versions (mig `20261023235800`) | #644, live 2026-10-23 |
| ③c | The Product Builder: products one-time or recurring monthly, their code made by the database, categories of actions (quantity, unit price, each on a workflow — or a new one made there), the intake minutes template, list price, cost and margin (the manager's alone), versions taking effect on a day, retire / reactivate (mig `20261023235900`) | #646, live 2026-10-23 |
| ③d | The Canvas Template Editor (the Workflow Builder's Canvas template tab): the task page laid out — Requirements, a section per stage, the manager's own sections, the Free space; a section's 🔒 / ⭐ / 👁 and stage; a field's ⭐ / 👁, stage, a date on the calendar, a choice's options; the Preview as the staff and as the PIC; kept with the draft and published with the version (mig `20261024001000`) | #648, live 2026-10-23 |
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
15. **"New Page"** (the staff's top-bar button) — undesigned; the dustbin purge needs a scheduled sweep (⑥).
16. **No clock** (②a). Production has neither pg_cron nor pg_net, so a recurring run is made ahead (60 days) and opens on its day by itself (readers ask `starts_on ≤ today`); every Marketing write tops the series up. Nobody is told on the morning a run opens — it is on their plate.
17. **Approvers** (②a). The handoff offers MM, AMM and a content Director; the database answers permissions only for the caller, so the picker offers the roster's managers (team `manager`) and the decision asks Approve. Anybody else — a question.
18. **Files** (②a). A File field and a stage's files are links until Marketing's R2 bucket (R2 is live since 2026-10-23: `file_buckets` + `file_objects` policies in a migration of Marketing's own).
19. **A table field** keeps its columns; a workflow template's tables keep preset rows (③a); a quick task's tables get them, and the task page fills a table in, with ②b.
20. **Holidays by state.** HR's holidays carry their states; Marketing skips every one (a Sarawak-only day too) until the user says which state the office keeps.
21. **A template stage's team** (③a). The handoff's Workflow Builder has no way to set it (a quick stage takes it from its person; a new template stage the last one's). Added: *Which team?* chips in the stage's settings.
22. **The product's promise** (③a). The handoff shows *Product promise n days* in the Workflow Builder's foot and warns when the stages run longer, but no screen sets it. Added: typed in the foot (1–365 working days, empty = none). The Product Builder may own it later.
23. **Emoji, the template's note, deliverables** (③a). The handoff's samples carry an emoji, a note (*Used by Ads and Social Media*) and deliverables per stage, but its Workflow Builder edits none of them: a new action's templates are ✨, the note is set by whoever makes it (the Product Builder's *+ New action workflow* later), deliverables are not built.
24. **A template that is never used** (③a). The handoff cannot delete a template or an action; neither can the portal yet — a question.
25. **Minutes: when and shown** (③b). The handoff's Minutes Builder code keeps *when* minutes open (new project, monthly, a stage asks, done) and a *show* switch per field, but its screen draws neither — not built; when minutes open comes with product projects (②b). Its sample templates' *Choice*, *Checkbox*, *Date range* and *Task link* (action items that open tasks) cannot be added from its screen either.

26. **Product codes** (③c). The handoff's samples carry hand-made codes (PKG-SM-A, PRD-VID-REEL) under an *auto-generated* lock; the database makes them, `PRD-<YY><NNN>` (PRD-26001), and nobody types one.
27. **Which clients a product is for** (③c). The handoff's products keep a list of subsidiaries (all eight by default, Showroom VM Setup three) that its screen never shows or sets — not built: every product is offered to every client until asked.
28. **One workflow per product** (③c). The handoff's sample products also name a workflow of their own (*Social Media Monthly · v4*) besides each action's; its screen links each action only — built that way.
29. **The margin's red line** (③c). *Below 20%* is the handoff's, kept as it draws it — a warning beside the figure, never used in a price. A Settings value if the managers want their own.
30. **A product's promise** (③c). The Workflow Builder's *Product promise* (gap 22) stays on the workflow: the handoff's Product Builder has no promise either.
31. **Deleting** (③c). The handoff retires a product but never deletes one; neither does the portal (as templates, question 8).
32. **Shared option lists** (③d). The handoff offers a choice's options from a *shared list* (*Locations* — used across the group, edit once) or its own; no screen keeps the shared lists — only a choice's own options are built (up to 30, each once).
33. **The sample's special sections** (③d). The handoff's Reels sample draws a typed table section whose columns belong to different stages, an asset checklist and a video block; its editor cannot make any of them for a real template. A table is a stage's field (its columns are the stage's), a checklist a Checkbox field, the video a File field (uploads after R2).
34. **Naming a section, its icon** (③d). The handoff edits neither (only its sample table takes an icon): built — the manager's sections are named, every section takes one of the twelve icons; a stage's section is titled by the stage.
35. **+ Add field** (③d). The handoff's *+ Add section* makes a section with one Notes field and nothing adds another: built.
36. **"Any / read-only"** (③d). One chip in the handoff for two things: a section of the manager's belongs to any stage; read-only is 📋 Requirements alone.
37. **A stage's own field** (③d). The handoff copies a stage's fields into its section and lets the canvas rename, retype or move one to another stage — copies that drift. Here they are one field: named and typed on either tab, filled in at its own stage; the canvas sets how it behaves.
38. **Two ⭐, two 👁** (③d). The handoff keeps *required* and *visible to PIC* on both sections and fields without saying how they meet: a field is required when its section is too, and the PIC sees a field when he sees its section too.
39. **Dragging sections** (③d). The handoff draws ⋮⋮ on each section and moves none: a stage's section follows its stage; the manager's stay in the order added.
40. **The quick builder's canvas** (③d). New Project's quick builder has a *Canvas template* tab in the handoff (no PIC); a quick task's page draws a section per stage — the tab waits.
41. **Four demos, one flow** (②b-1). The handoff's product flow is four screens that never pass a project between them (New Project's minutes, the PIC Link, the Assignment Plan, the task pages) and never says how a product's actions × quantity become tasks (question 10) or when a project bills (question 11). Built up to the PIC's answer; the rest waits for the answers.
42. **The link's code** (②b-1). The handoff's `houzs.link/t/car-2610-014` is the Track ID — the next one guessable, on a domain that does not exist. Built: `/t/<32 random hex>` on the portal's own domain, made once and kept.
43. **The PIC's WhatsApp** (②b-1). ⭐ on the handoff's meeting card; required only when the link goes to the PIC (a template without PIC sign-off sends no link).
44. **"PIC signs off on the link"** (②b-1). The Minutes Builder's tooltip says the PIC approves *before the tracking link is created*; New Project makes the link first and the PIC approves on it — built as New Project.
45. **Locked vs edited after approval** (②b-1). New Project lets the manager edit after the PIC approved (back to the PIC); the Minutes Builder's *Lock after complete* says no edits once signed off. Both kept: minutes locked on completion take no edit; the rest go back to the PIC when something they see changes.
46. **"Turns red after 4 working hours without a reply"** (②b-1). Needs the PIC's working hours (question 2): the side card says when the link went.
47. **Meeting date and attendees** (②b-1). The handoff's meeting card holds the date and attendees; here they are the intake template's own fields (every template has the attendees, a new one the date), and the card keeps the PIC's name and WhatsApp.
48. **One link, many uses** (⑤-1). The handoff's PIC Link approves a deliverable (a video, "What changed since v1"), shows Ads reports and a project's whole progress; ⑤-1 is its first use — the intake minutes. The deliverables (PIC Task Link) come with the stages' work after the Assignment plan, the reports with Ads, the PIC Calendar with the dates.
49. **No hourly cap** (⑤-1). The guest link caps its writes per hour; the PIC's link takes one answer per sending (only a waiting project takes one), so a leaked code buys a single answer.
50. **Attach a screenshot** (⑤-1). On the handoff's changes step; files wait for Marketing's R2 bucket.
51. **"Overdue — please review"** (⑤-1). The handoff's red state after 6 working hours needs the PIC's working hours (question 2) — not drawn.
52. **Who is told** (⑤-1). The handoff does not say: the project's owner; with none (the Principal started it), Marketing's managers.
53. **Changes ask no name** (⑤-1). The handoff's changes step has no name field: the reply goes under the PIC's name on the project (Kelvin), approving asks the full name typed.

## 5. Open questions (for the user)

1. A title's default team: SENIOR MARKETING EXECUTIVE and TELEMARKETER → **Ads**; EVENT SPECIALIST CUM VISUAL MERCHANDISER → **Brand** — right? (The manager can change anyone's team.)
2. When is an unaccepted stage red — after how many working hours? What are the PIC's "working hours"?
3. Once R2 is in, should uploads go above 50 MB?
4. HR invites Marketing's 12 people (no logins yet) — when?
5. Does anybody besides MM / AMM approve stages (the handoff's content Director)?
6. Nudge on WhatsApp too (from People's phone numbers)?
7. Which state's holidays does Marketing keep?
8. May a manager delete a workflow template (or a whole action) never published or never used? The handoff has no delete.
9. Shared option lists (the handoff's *Locations*, kept once for the group) — wanted? Where are they managed?
10. A product has several actions, each on its own workflow, each with a quantity. Does a product project become (A) one task per action, the quantity its deliverables (recommended), (B) one task per unit, or (C) one task on one workflow (the handoff's demo)?
11. Billing: which amount (the product version's list price?) and when does a product project become a billing draft — a one-time project when approved, started or done; a recurring one each month?
12. A recurring product's runs: on the 15th (the handoff's words) or on the day it started?
