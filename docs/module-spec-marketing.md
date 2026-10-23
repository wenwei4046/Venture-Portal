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
| Big files | ≤ 50 MB uploaded; bigger as links. Then, once every bucket was in R2 (to the storage session): "make sure in future i can upload all big file, video and etc", "make the size more bigger for all" — the Library takes 2 GB a file (mig `20261024007100`), a folder kept elsewhere a link. |

## 2. Build order

| PR | Contents | Status |
|---|---|---|
| ① | The permission and templates; the tables and readers; the shell (sidebar, top bar, search, bell, Appearance, account menu); My Space's task tiles; the Calendar; Projects (list + a project's stages); the Tracking Dashboard (read) | #634, live 2026-10-23 |
| ②a | New Project's ⚡ Quick task and 🔁 Recurring task (the repeat rule, the runs) with the quick Workflow Builder; the task page (accept → work → submit / complete; approve / request changes, back to a named stage; versions; the Free space); notices; Nudge; a series paused, resumed, ended; My Space's Accept (mig `20261023234000`) | #639, live 2026-10-23 |
| ②b-1 | 📦 Product projects up to the PIC: New Project's 📦 (a product on sale today), the project's page — the stepper, the intake minutes written with the PIC and saved as typed, signatures, notes, Generate tracking link (`/t/<random>`), copy / WhatsApp, the PIC's changes and Resend, edited after approval → back to the PIC, start before approval (mig `20261024002000`) | #650, live 2026-10-23 |
| ⑤-1 | The PIC's minutes link `/t/<code>`: a stranger's page (the guest link's pattern) — the 👁 fields only, approve (a typed full name) or changes (5–500 characters), one answer per sending, why it waits again, the progress, the receipt; the owner (else the managers) told (mig `20261024003000`) | #651, live 2026-10-23 |
| ②b-2a | **Built 2026-10-24** (mig `20261025032000`): *Plan assignments →* makes the deliverables (each action × its quantity, a sub-task on its workflow, its own start day — answer 10); a deliverable's Assignment Plan; done ÷ all (answer 17); the product closes with its last deliverable | answered |
| ②b-2d-2a | **Built 2026-10-24** (mig `20261025034000`): a client's details edited by the manager (its name for Marketing's own clients), a second PIC on a company and a project, each PIC their own link, either one's answer counting | answered |
| ②b-2d-2b | **Built 2026-10-24** (mig `20261025035000`): *both PICs* on an approval — the minutes template's *Both PICs sign off*, a stage's PIC level *Either* / *Both* in the Assignment Plan; the first approval kept, the other's awaited; an edit the PICs see takes back the approvals in | answered |
| ②b-2d-1 | **Built 2026-10-24** (mig `20261025033000`): the PIC decides a deliverable's stage on the product project's own link — the work listed, what they may see of a stage, approve / changes on the version read | answered |
| ②b-2 | The Assignment plan (SLA, approvers ≤ 3 levels, split, 🔓 picked by the stage before) and the product task page (Canvas · Map · Audit trail · Versions); **subtasks** — ✂️ Split into subtasks by the stage's owner (the people the manager added to the stage, due by the stage's deadline, a deliverable), Review delivery (approve, or return with a reason; returned 3 times → red, the manager told), My Space's *Delegated by me* and the assignee's plate, the map's subtask station; the PIC deciding a stage on its link (`PIC Task Link.dc.html`); reassign, more minutes on a project, the billing drafts and Finance's import. The design splits only a template's stages (a quick task never: its builder has no split and no PIC approval) | after questions 10–12 |
| ③a | The Workflow Builder: actions and their templates, the stages (who — at assignment or 🔓 by the stage before, SLA, approval levels, PIC words, subtasks, back to, fields with a table's preset rows), the lock, drafts saved as typed on their count, versions published whole, Clone (mig `20261023235500`) | #642, live 2026-10-23 |
| ③b | The Minutes Builder: minutes templates — fields (required, PIC sees, a table's typed columns; the project and the attendees locked), completion rules, Preview as the staff and as the PIC, drafts and versions (mig `20261023235800`) | #644, live 2026-10-23 |
| ③c | The Product Builder: products one-time or recurring monthly, their code made by the database, categories of actions (quantity, unit price, each on a workflow — or a new one made there), the intake minutes template, list price, cost and margin (the manager's alone), versions taking effect on a day, retire / reactivate (mig `20261023235900`) | #646, live 2026-10-23 |
| ③d | The Canvas Template Editor (the Workflow Builder's Canvas template tab): the task page laid out — Requirements, a section per stage, the manager's own sections, the Free space; a section's 🔒 / ⭐ / 👁 and stage; a field's ⭐ / 👁, stage, a date on the calendar, a choice's options; the Preview as the staff and as the PIC; kept with the draft and published with the version (mig `20261024001000`) | #648, live 2026-10-23 |
| ④-1 | Marketing's own clients: + Add subsidiary (New Project's **+**, the sidebar's row), the code made by the database (mig `20261024004000`). Tracking's actions were built in ① / ②a (Nudge — on WhatsApp waits for question 6) | #653, live 2026-10-23 |
| ④-2 | The Subsidiary page (the cards, Month / Week / Timeline, key dates, the feed, the projects) — what exists (mig `20261024005000`, `mkt_sub_feed`); campaigns, posts, shoots and ads wait for questions 13–17 | #654, live 2026-10-23 |
| ④-3 | The Audit trail's formal log (mig `20261024006000`, `mkt_project_log`), its filters, from every project's trail; export waits for question 18 | #655, live 2026-10-23 |
| ④-4 | The Task map (map / list, a station's panel, the lines' records) and Replay, in the project's Map / Audit trail sheet — drawn from the task page | #657, live 2026-10-23 |
| ④-5 | **Built 2026-10-24** (mig `20261025036000`): Replace Person — one person for another everywhere (answer 26): the templates (a new version at once, answer 24), a series' plan, stages not started, the work in hand (Accept again), approvals under way, the projects owned; anybody on the roster takes over (25); the person, the one taking over and the owners told (27); for good (28); a numbered record | answered |
| ⑤ | The PIC's public links — PIC Link, PIC Task Link, PIC Calendar (no login; approve = type your name; changes ≥ 5 characters; ads reports) | |
| ⑥-1 | The Library on R2 (bucket `marketing`): the group's folder types (the manager's), each subsidiary's folders and link folders, files uploaded ≤ 2 GB, the categories, search, Move, the Dustbin (30 days; Restore; the manager's Delete now) (migs `20261024007000`, `007100`) | #660, live 2026-10-23 |
| ⑥-2 | A subsidiary's brand profile — its picture (a colour, or a logo), its background (a colour, or a cover), its font, display name and caption, the manager's ✎ — on its card and banner; its Schedule: the Calendar's next three dates (mig `20261024007200`) | #663, live 2026-10-23 |
| ⑥-3 | The guest share link — a file's or a folder's, made, changed (24 hours / 7 days / 30 days / Never, Allow download) and stopped by Edit; its page `/l/<code>` for a stranger (the brand, the files, previews, Download when allowed) (mig `20261024007300`) | #664, live 2026-10-23 |
| ⑥-4 | A Library file on a task: *Attach to task* (a file's menu — the file's subsidiary's open tasks), the task page's *Library files* with *+ Attach from Library*, taken off; each a line on the trail (mig `20261024007400`) | #665, live 2026-10-23 |
| ⑦-1 | My Space's own side, first part: the cover (four presets or a picture), the avatar, the status; *Edit layout* — tiles dragged anywhere and resized from eight handles, added and taken off, the page's background, the accent, the corners, Reset; the Notes and Photo tiles — kept as the login's own row (migs `20261024007500`, `20261024007600`) | #673, live 2026-10-23 |
| ⑦-2 | The room — its wall, floor and furniture (the sixteen, dragged left or right, flipped, taken out) — on the board from the start; the pet as it looks (four kinds or one's own animal, its name, its colour) in the room and beside the avatar, its mood its owner's plate; the drawer's 🎨 Room & pet; the 5-step setup on the first visit (mig `20261024007700`) | this PR |
| ⑦-3 | Chat — direct messages and the lobby's thread (questions 35, 36, 39) | |
| ⑦-4 | The lobby tile and visiting a teammate's space (questions 37, 38, 40) | |
| ⑦-5 | The pet's levels, XP, energy and states, and the trophies (questions 32–34) | |

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
8. **Storage.** The handoff shows 84 MB–1.2 GB videos and data-URL uploads; the portal keeps files on R2 — the Library's up to 2 GB each (⑥-1) — and links beyond.
9. **Persistence.** My Space's layout, room and pet live in `localStorage` in the prototype → the database in ⑦.
10. **Chat.** No staff chat exists in the portal (DM + lobby) — tables and Realtime in ⑦.
11. **Public links.** The prototype's `houzs.link` domain does not exist; the PIC is not a portal user (approve = a typed name) — ⑤.
12. **Nudge on WhatsApp.** Staff phone numbers live in People; ② sends an in-app notice first.
13. **Working hours.** "Not accepted · 5 working hours" and the PIC's "6 working hours" need a definition of working hours (the attendance schedule?) — asked, not guessed.
14. **Projects list** — not designed; built in the Calendar's look.
15. **"New Page"** (the staff's top-bar button) — undesigned; the Dustbin's 30 days are kept without a clock (gap 75).
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
54. **A client's code** (④-1). The handoff's (the name's first four letters and digits, else OTH) can collide or fall under two characters, and a Track ID keeps it for good: the database makes it, numbered when taken.
55. **A client's WhatsApp** (④-1). The handoff's form has the PIC's name, no WhatsApp; a product project's Meeting card takes it.
56. **Editing or hiding a client** (④-1). The handoff adds clients and never renames, edits or hides one — not built (question 29). Its sidebar row has no click: built as New Project with the form open.
57. **The cards** (④-2). The handoff's are *Campaigns running*, *Posts* (n posted), *Shoots*, *Ads live* and *Overdue*, from sample data with no source in the portal (questions 13, 15). Built from what exists: *Projects running*, *Waiting for PIC*, *Due this week*, *Done this month*, *Overdue*.
58. **What the dates are** (④-2). The handoff's items are posts (Reels, Post, Tip, Launch, Offer, Testimonial), shoot days, ads go-live and end, report days and PIC deadlines; the portal has stage due dates and a series' runs to come — its Type filter offers those two until questions 15–16 are answered.
59. **Key dates** (④-2). The handoff's are typed into its sample (Payday, 11.11, *Carres showroom opens*); built from HR's holidays (gap 6) until question 14.
60. **The timeline's bars** (④-2). The handoff's are campaigns; built as projects — from their start (else the day made) to their due day, ten weeks from the Monday two weeks back.
61. **Progress** (④-2). The handoff's n/m is never defined: built as stages done (or passed) ÷ stages (question 17).
62. **Where the log opens** (④-3). The handoff's is a tab of the product task page (Canvas · Map · Audit trail · Versions), which comes with the Assignment plan (②b-2). Until then **Formal log** on the trail's head of every project's page opens it over the page — quick and recurring tasks too (question 22).
63. **Export** (④-3). The handoff exports the filtered rows as PDF or CSV for anybody who sees the log; Marketing's permission row has no Export tick (View, Create, Edit, Approve, Manage) — whether to add one is question 18. Not built.
64. **Corrections** (④-3). The handoff's *correction of #n* and its footer (*mistakes are fixed by adding a correction entry*) have no screen that adds one (question 19): the log says *Read-only*.
65. **Attachment** (④-3). No record holds a file — a stage's files are links (gap 18): the column comes with Marketing's R2 bucket.
66. **The Free space** (④-3). Its writes are records too, but stay off the log as they stay off the trail (question 20).
67. **Where the map opens** (④-4). The handoff's Map is a tab of the product task page (②b-2); until then **Map** on a task's trail head opens the project's sheet (Map · Audit trail). A product project's intake has no stages: no map (question 22).
68. **Subtasks on the map** (④-4). The handoff's *Thumbnail* (picked by Ali) and its *Review delivery* gate: the portal keeps subtasks but no screen makes one yet — none is drawn. They come with ②b-2: the design splits only a template's stages, which the Assignment plan makes.
69. **"Opened by Jason from a Social Media project"** (④-4). A project opened from another, and the intake on the map, have no source (question 23): the map starts at *Created*.
70. **Ads and Brand lanes** (④-4). The handoff's lanes are Social Media 📣, Content 🎬 and Design 🎨: Ads takes 📈, Brand ✨.
71. **"📍 You are here"** (④-4). The handoff's words for where the work stands; the viewer is rarely there — *📍 Now here*. Its corner hint (*Drag or scroll … hover a line for details*) is an instruction: the page carries none.
72. **Replay's pace** (④-4). The handoff runs a dot along each line of a step, 0.8 s a line; built as a record every 1.1 s, a dot along each line it makes.
73. **A file's category** (⑥-1). The handoff gives each file its own (a JPG in Brandbook is *Photo*); built as its folder type's — a folder's files share one category, and the rail's categories count what their folders hold.
74. **Upload with only a subsidiary open** (⑥-1). The handoff drops the file into the subsidiary's first folder, whatever its type; built: *Open a folder to upload into it* — a file goes where somebody put it.
75. **The Dustbin's 30 days** (⑥-1). Production runs nothing on a clock: every Library write first deletes what was binned 30+ days ago (`mkt_lib_purge`), so a Library nobody touches keeps its Dustbin longer; R2's hourly sweep takes the bytes.
76. **Who may** (⑥-1). The handoff has no roles: View reads, Edit adds, uploads, moves, bins and restores, Manage makes folder types and deletes for good (the handoff's *Delete now* is anybody's).
77. **One folder per type** (⑥-1). The handoff greys the types a subsidiary has in *Add folder* — kept, in the database too: a folder moved to a subsidiary with one of its type is refused, so is a restore over a new one.
78. **Link folders** (⑥-1). The handoff's *Add a link* only says *Paste a Google Drive or Dropbox link…*; built as a dialog — a link type (*Raw footage*, seeded) and the https address. A manager's new type is never a link type (question 31).
79. **Download as ZIP, Rename** (⑥-1). A folder's *Download as ZIP*: not built — files download one at a time (a ZIP made by a function stops at 4.5 MB). Nobody renames a file or a folder in the handoff, nor in the portal.
80. **The toasts** (⑥-1). The handoff's words, but *Uploaded to …* names the folder the file was put in, never a guessed one.
81. **Who edits a brand profile** (⑥-2). The handoff's ✎ is anybody's; built as the manager's (Marketing · Manage) — a brand's look is the manager's call, as folder types are.
82. **The display name** (⑥-2). The handoff's renames the company everywhere in the Library (the rail, the crumbs); built as the brand's name on its card and banner only — the subsidiary's own name stays on the rail, in Track IDs and on projects (whether one may be renamed is question 29).
83. **Before a profile** (⑥-2). The handoff's companies start on a colour and an initial; the portal's keep their own emoji and tint until a colour or a logo is picked.
84. **Brand pictures** (⑥-2). The handoff's *Upload logo / cover* only toggles a pattern; built as real uploads to R2 under `brand/`, an image of 10 MB at most. One replaced or taken off is deleted (unless another profile shows it); one sent and not saved is taken back.
85. **The Schedule** (⑥-2). The handoff's are typed into its sample (*Year-End Video shoot*, *11.11 ads go live*, *Countdown reel approval*); built from the Calendar's dates — the subsidiary's stages due and runs to open, not done, from today, the first three — each a link to its project. Shoots and ads days wait for questions 15–16.
86. **Brand fonts** (⑥-2). Playfair Display, DM Serif Display and Space Grotesk are loaded for a brand's name alone (on Marketing's shell, downloaded only when a brand wears one); the portal's own faces stay as DESIGN.md sets them.
87. **Who may share** (⑥-3). The handoff's *Share link* is in everybody's menu; built as Marketing · Edit's (who adds files) — a link hands company files to people outside the portal. View sees each live link.
88. **Nothing shared on opening** (⑥-3). The handoff's dialog shows a link at once; built: *Create link* makes it, so opening the dialog shares nothing. Once live, a change is saved as it is made.
89. **Stop link** (⑥-3). The handoff has no way to take a link back — one that *Never* expires would live for good; built: *Stop link* closes it at once.
90. **The page** (⑥-3). The handoff's link points at `houzs.link/lib/…`, a page it never draws; built at the portal's own address, `/l/<code>`: the brand (its cover, logo and font), the item, its files shown in place where a browser can, *Download* when allowed, when the link ends; *This link is closed* for anything else.
91. **Allow download, off** (⑥-3). A browser can still keep what it shows (a picture, a video, a PDF); off means no *Download* and nothing sent that would save (a ZIP, a document) — *View only*.
92. **A file link lives an hour** (⑥-3). Stopped or expired, a link closes the page and every new click at once; a file already opened from it (a video playing) keeps its signed link for up to an hour.
93. **The wording** (⑥-3). The handoff's *Guest link · for people without an account* and *Anyone with the link can view and download — no account needed* explain; the dialog carries none — its state instead (*Expires Fri 30 Oct, 10:39*, *Never expires*).
94. **Where a file shows on a task** (⑥-4). The handoff: "It appears in the task Canvas as a linked file"; the Canvas belongs to the product task page (②b-2), so built as *Library files* on the task page under Requirements — each the Library's own file, opened from there (no copy).
95. **Which tasks** (⑥-4). The handoff lists every task; built as the file's own subsidiary's open tasks — quick tasks and recurring runs (a series is a pattern; a product project's task page comes with ②b-2). The database refuses another subsidiary's file.
96. **Taken off** (⑥-4). The handoff has no way to take a file off a task; built — × on its chip, the file staying in the Library. Binned in the Library, a file waits off its tasks until restored; deleted for good, it leaves them.
97. **The trail** (⑥-4). Attaching and taking off are lines on the task's trail and in its formal log (*Attached from the Library*, *Taken off the task*, the file's name).
98. **The picker** (⑥-4). The handoff's *Attach from Library* opens the whole Library as a picker; built as a dialog of the task's subsidiary's file folders and their files, those on the task ticked already — at most 50 files on a task.
99. **Whose space** (⑦-1). The prototype keeps a space per browser (`localStorage`); built per login (`auth.uid()`) — the Principal's shared login has one too, and nobody needs a roster record to keep theirs.
100. **The photo is its owner's** (⑦-1). The prototype's photo never leaves the browser, and a visit never draws the Photo tile; built under `mine/`, which only its owner reads — a manager neither sees nor deletes it (question 38). The cover and the avatar are Marketing's to see ("Teammates see this in chat and in the lobby").
101. **Before the room** (⑦-1). The handoff's first board (DEFAULT_POS) starts with the room and the pet, which come with ⑦-2; until then the page as it stood — My turn 2×2, Waiting, Delegated, This week 2×1. A kind shipped later joins a saved board once (`tilesKnown`), so the room and the pet will appear without anybody resetting theirs.
102. **Free resizing** (⑦-1). The prototype has two resizers — by whole cells (its *startResize*, which nothing calls) and free (*startXform*, what its handles call); built free, no smaller than 14% × 110 px.
103. **No picture taken off** (⑦-1). The handoff's avatar and cover are replaced, never removed; a preset cover replaces a cover picture. Built the same.
104. **The keyboard** (⑦-1). The handoff lays tiles out by pointer only; built also by the arrow keys on a tile's face (1% across or 12 px down; with Shift, its size).
105. **A narrow space** (⑦-1). The handoff draws a desktop board; built: under 520 px wide the tiles go one under another in reading order, and Edit layout is the desktop's.
106. **The drawer's words** (⑦-1). The handoff's Layout tab opens with *Drag a tile anywhere to move it. Drag any edge or corner to resize it freely…*; built without it (DESIGN.md › No descriptions on the page), and without the Layout / Room & pet tabs until the room exists.
107. **The first board** (⑦-2). The handoff's DEFAULT_POS — the room 2×2, My turn 1×2, the pet, chat, Waiting, Delegated, Trophies, the lobby, This week — as far as it is built: the room, My turn, Waiting and Delegated in the pet's and chat's column, This week 2×1 under the room. A board saved before gets the room once, under the rest (gap 101).
108. **Who has a pet** (⑦-2). The handoff gives everybody one; built for somebody on Marketing's roster. The Principal's shared login has a room, no pet, and is never asked the setup (question 37).
109. **The pet's level and mood** (⑦-2). Every pet is Lv 1 — its first form, the later two dimmed in the drawer — until XP comes with ⑦-5 (question 32). Its mood is the prototype's myState without energy: *Overloaded* (two late, or four on My turn), *New task!* (a stage just put on the plate), *Working*, *Sleeping*; *Level up!* for a moment when the setup finishes. *Eating*, *Working out* and *Hungry* wait for energy (question 33).
110. **The setup's words** (⑦-2). The handoff puts a line under each step's title (*It lives in your room and grows as you finish tasks.*, *You can change it later.* …); built without them (DESIGN.md › No descriptions on the page). The colour stays required, the cover and the photo may be skipped, as drawn.
111. **One's own animal** (⑦-2). The prototype keeps it in the browser; built under `space/` like the avatar, so teammates will see the pet in the lobby and on a visit (⑦-4) — an image, 10 MB at most.
112. **The window** (⑦-2). The handoff's window is always day (its hour is fixed at 10) unless the wall is Night; built on the office's clock (UTC+8) — the evening sky from 18:00, read once the page is drawn, so the server and the browser agree.
113. **The room's limits** (⑦-2). The handoff has none; the database keeps at most 30 pieces of the sixteen, each between 4% and 96% across.
114. **A deliverable is a project** (②b-2a). Each is an `mkt_projects` row under its product project (kind `deliverable`, `parent_id`), so My Space, the Calendar, Tracking, the map, the formal log and the task page work it as any task; its Track ID is the product's with -Dnn.
115. **The plan's start day** (②b-2a). The handoff's plan has no start-day field (its scenarios carry one); answer 10 gives each deliverable its own — a date in the Summary, today or later. Stage 1 opens on it; the board shows the deliverable from then (as a run before its day), so the Calendar shows no deliverable before its day.
116. **The template's Locked switch** (②b-2a). The handoff's plan toggles it; it is the Workflow Builder's setting ("Workflow setting from Workflow Builder"), so the plan shows it read only.
117. **The canvas's own fields** (②b-2a). A template's own sections' fields belong to a stage; a deliverable's stage carries them in its fields (with their section's title), so they are filled and checked with it. The task page draws them in its stage's list, not yet in the canvas's sections.
118. **A change of hands once open** (②b-2a). The handoff's mid-way plan asks a reason for every change; built: a reason for a stage that changes from one person to another (5–300 characters); approvals, days and subtasks of stages not begun change without one (logged *plan changed*).
119. **A deliverable's Requirements** (②b-2a, seen on the preview walk). The handoff's product task page opens on 📋 Requirements from the intake minutes; a deliverable's task page shows its own brief (none) until the product task page's canvas is built.
120. **The minutes once the work started** (②b-2a). An edit the PIC sees sends the minutes back to them only while the project is *approved*; once its work has started (*active*) it does not — whether the minutes lock then, or the work pauses for the PIC, is not decided.
124. **The project's PICs are its own** (②b-2d-2a). A project copies its company's PICs when it starts; from then on the minutes edit them. A change on the company reaches new projects only — the PIC a client met for this project stays theirs.
125. **A second PIC's link closes when they are taken off, not when renamed** (②b-2d-2a). A typo fixed keeps the link; taken off and named again, a new one. The first PIC's link is the project's tracking link and never changes.
126. **Either PIC's answer counts, and only the first PIC's change re-asks** (②b-2d-2a). The second PIC added or changed after approval sends nothing back — the first PIC's approval stands, either one's counting (answer 29). With *both PICs* on an approval (②b-2d-2b) that changes.
121. **One link for the minutes and the work** (②b-2d-1). The handoff's PIC Task Link shows one task; the PIC's link is the product project's, so the work is listed on the same page — every deliverable, the ones waiting for them first and opened. No second link to share.
122. **What the PIC sees of a stage** (②b-2d-1). The canvas's 👁 per field and its section's *shown to the PIC* decide; a *Note* is the team's guidance and never shown; the team's notes never; links always (the work they approve). Before the canvas, a quick task's fields carried no 👁 — every one shows.
123. **The version** (②b-2d-1). The PIC answers the version they read: a newer one sent meanwhile refuses the answer and asks them to reload — an answer never lands on work they did not see.
130. **Where a person stands, and which places** (④-5). The handoff lists templates, upcoming stages and tasks in hand; answer 26 (*everything*) adds a series' plan (its runs to come), approval levels on stages under way, the projects they own and a subtask. A template is one place (every stage that names them, its draft too); a stage one place a role (doing it, a 🔓 candidate before it starts, approving it); a 🔓 candidate on a stage under way is not a place (the person was picked already). Minutes' attendees and signatures are history, not places.
131. **The one taking over listed already** (④-5). The handoff only drops a 🔓 candidate; built: an approver too, while the stage has not started (the level is removed). On a stage under way it is refused — a level vanishing could leave its approvals done without anybody approving this version.
132. **Accept again** (④-5). A stage to do or accepted goes back to *to do* for the one taking over, its deadline unchanged (as the plan's change of hands); one with changes asked or in review keeps its state — theirs to finish.
133. **Who is told** (④-5). A notice belongs to a project, so each side hears once a project: the one taking over (*Your turn: …* when a stage of theirs is open, *… waits for your approval*, else *You took over from …*), the one replaced, the project's owner when somebody else. Templates tell nobody — the builder shows the new version.
134. **The record's number** (④-5). The handoff's *Audit #R-0142*: a replacement is numbered when it is made, the numbers without gaps (a refusal takes none).
127. **Where *both* is set** (②b-2d-2b). The minutes' on their template (every project made from it); a stage's in its deliverable's plan. The Workflow Builder's PIC level has no *both* — a template knows no PICs; the plan sets it once the project has two.
128. **An edit while the minutes wait for both** (②b-2d-2b). The approval already in no longer counts: what that PIC approved changed — as an edit after approval asks again. Each PIC's page says whether the approval taken back was theirs.
129. **A PIC taken off while it waits for both** (②b-2d-2b). It waits for the PIC left, who answers once more: the approval they gave was one of two, and is not carried over.

## 5. Open questions (for the user) — all answered 2026-10-24, §6

1. A title's default team: SENIOR MARKETING EXECUTIVE and TELEMARKETER → **Ads**; EVENT SPECIALIST CUM VISUAL MERCHANDISER → **Brand** — right? (The manager can change anyone's team.)
2. When is an unaccepted stage red — after how many working hours? What are the PIC's "working hours"?
3. *(Answered 2026-10-23 — your words to the storage session, "make sure in future i can upload all big file, video and etc" and "make the size more bigger for all": the Library takes 2 GB a file, as HR's documents.)*
4. HR invites Marketing's 12 people (no logins yet) — when?
5. Does anybody besides MM / AMM approve stages (the handoff's content Director)?
6. Nudge on WhatsApp too (from People's phone numbers)?
7. Which state's holidays does Marketing keep?
8. May a manager delete a workflow template (or a whole action) never published or never used? The handoff has no delete.
9. Shared option lists (the handoff's *Locations*, kept once for the group) — wanted? Where are they managed?
10. A product has several actions, each on its own workflow, each with a quantity. Does a product project become (A) one task per action, the quantity its deliverables (recommended), (B) one task per unit, or (C) one task on one workflow (the handoff's demo)?
11. Billing: which amount (the product version's list price?) and when does a product project become a billing draft — a one-time project when approved, started or done; a recurring one each month?
12. A recurring product's runs: on the 15th (the handoff's words) or on the day it started?
13. The Subsidiary page: what is a "campaign" — a product project with a campaign period, a kind of product, or a record of its own?
14. Key dates (Payday, 11.11, "Carres showroom opens"): who keeps them — for the group or per subsidiary — and which day is Payday?
15. What makes a "post", and who marks it Posted or Scheduled?
16. Should a canvas field's calendar date pick from fixed kinds (Shoot day, Ads go-live, Ads end, Report day) instead of a free name?
17. A project's Progress % — stages done ÷ stages? And what is "Live" against "In progress"?
18. Who may export a project's trail (CSV / PDF): all of Marketing, the managers, or a new Export tick?
19. Corrections on the trail: what may be corrected, by whom — and does a correction change the project or only note the record?
20. Should the formal log list the Free space's edits (the task page hides them)?
21. The trail's PDF: a formal document, or the table as on screen?
22. Map and Audit trail tabs on quick and recurring tasks too, or product projects only?
23. Can a project be opened from inside another (the handoff's "Opened from Social Media project")? Should the intake (minutes, PIC sign-off) be on the map?
24. Replace Person on a template: change its draft only, or publish a new version at once?
25. Must the replacement be on the same team, or anybody on the roster?
26. Do approvals waiting on the person, approval levels and projects they own count as places to replace?
27. Who is told — the person replaced, the projects' owners?
28. "Long leave": is the swap permanent, or do the places go back after the leave?
29. May a client be renamed, its PIC or WhatsApp changed, or hidden? And may the group companies carry a default PIC?
30. Are an outside client's projects billed, and how?
31. May a manager make a folder type that is a link (as *Raw footage*: a folder kept on Drive or Dropbox)? Built: only Raw footage.
32. The pet's XP: the handoff says "stages × difficulty (S 1, M 2, L 3) × 10 for each finished task", but neither the portal nor the handoff has a difficulty. Suggested: +10 for each stage you finish, +20 for a product project's stage; nothing taken back for changes asked; approvals and subtasks do not count — right?
33. Should the pet's energy fall over time? (The handoff's falls only with exercise.) Suggested: no.
34. Trophies: a project whose last stage was yours, finished this quarter (office time), at most 6 shown?
35. Direct messages: who may read them — the two people only (then a harassment complaint or a customer record pasted in one is beyond the company's reach), the two plus the Principal on a complaint (the opening logged), or the manager too? No suggestion: it decides the company's own oversight.
36. How long are messages kept, and who may edit or delete one — nobody (then customer data pasted by mistake cannot be removed), each their own, the Principal any, or all after some months? No suggestion: as 35.
37. The lobby: everyone with Marketing · View sees it; only the people on the roster write in it and have a pet (the Principal has none)?
38. Visiting a teammate: their Notes shown, their Photo private (as the handoff draws it)? Built private for now (gap 100).
39. A new direct message: a sound, or a push to the phone? Suggested: not yet — an unread dot until the phone app.
40. The avatar: the one uploaded in My Space, or HR's profile photo from Me (colleagues cannot read it today)? Built: My Space's own.

## 6. The user's answers (2026-10-24 — the questionnaire, artifact `M5qBkHQbztb9zhpgKVGLPv`, then four questions asked again)

Every question of §5 has its answer here; what is built from each says so in `.claude/rules/marketing/marketing-view.md`.

| # | Answer |
|---|---|
| 1 | **Each People title is a group** — no Content / Design / Ads layer of Marketing's own: a stage's group is a title of the Marketing department as People Management writes it, the map's lanes and the colours too (asked again: "每个 title 就是一组"; mig `20261025031000`). |
| 2 | A stage not accepted turns red after **4 working hours**; the PIC's wait the same (HR's schedule when set, else 09:00–18:00 Monday–Friday). Built (mig `20261025031000`): 09:00–13:00 and 14:00–18:00 Monday–Friday less Selangor's holidays — no HR schedule is set or read yet; the PIC's wait counts no holidays. |
| 4 | HR invites Marketing's people once Marketing's setup is done ("wait marketing set up done"). |
| 5 | Only MM / AMM approve — the builders offer only them; the database does not refuse another yet. |
| 6 | Nudge in the portal only — as built. |
| 7 | **Selangor**'s holidays (mig `20261025031000`). |
| 8 | A workflow template, a minutes template or a product **never published** may be deleted (mig `20261025004100`). |
| 9 | A shared option list (Locations) as a dropdown — **the person filling it in adds a missing option on the spot**. |
| 10 | **One product project, a sub-task per deliverable** (an action × its quantity: four posters are four sub-tasks), each on its action's workflow with its own day; the product shows deliverables done ÷ all. The day is the **start** day (stage 1's owner gets it then; the SLAs run forward). |
| 11 | A one-time product project bills (a draft) in the month it **starts**; a recurring one each month. |
| 12 | A recurring product picks its **run day** (opened on the 1st, it may run every 5th). |
| 13 | A **campaign is a product project with a run period**: its stages prepare it (a truck event's script, sourcing, approval, decoration …), then it runs a week or a month; the timeline shows which campaign runs when. |
| 14 | Key dates are **each company's own**. |
| 15 | A post is a deliverable with a **📣 Post day** date; done = Scheduled, its owner marks it Posted (with its link). |
| 16 | A canvas date picks **a fixed kind** (Post day, Shoot day, Meeting, Ads go-live, Ads end, Report day; mig `20261025031000`). |
| 17 | Progress = stages done ÷ stages (a product: deliverables done ÷ deliverables). |
| 18 | **All of Marketing** may export a trail. |
| 19 | Corrections **annotate** a record, never change the project; the manager's. |
| 20 | The formal log lists the Free space's edits. |
| 21 | **Both PDFs** — a formal document and the table as on screen. |
| 22 | Map and Audit trail on every project. |
| 23 | **Both**: a project may be opened from inside another (its source kept, a line on the map), and the intake is drawn on the map. |
| 24 | Replace Person **publishes a new version** of a template at once. |
| 25 | The replacement: **anybody on the roster**. |
| 26 | Everything is replaced — approvals waiting, approval levels, projects owned. |
| 27 | Told: the person replaced, the one taking over, the projects' owners. |
| 28 | **No swap for leave** ("cancel this"). |
| 29 | Clients may be renamed, their PIC changed; **a company may carry one or two PICs**; one PIC's approval is enough unless a step needs both — set per approval (any / all). |
| 30 | An outside client's projects are billed: "proceed invoice, then Finance receives". |
| 31 | A manager may make a **link** folder type (mig `20261025004000`). |
| L1 | Share links stay Marketing · Edit's. |
| L2 | A brand profile is **everybody's to change, with its history** — who, before, what (mig `20261025004000`). |
| L3 | The Dustbin keeps **60 days and empties itself** (mig `20261025004000`, the hourly cron). |
| 32 | XP: +10 a stage finished, +20 a product project's stage; nothing taken back; approvals and subtasks do not count. |
| 33 | Energy does not fall over time. |
| 34 | Trophies: projects finished this quarter **where you did any stage**, six at most. |
| 35 | Direct messages: the two people; on a complaint **a personal account holding the full-access (Ultimate / Full) template** may open one, a reason typed first, the opening logged under that person's name — never the shared Principal login (amended after a side agent's note: that login is several people). |
| 36 | Messages kept for good; nobody edits or deletes one. |
| 37 | The lobby: Marketing · View reads it; the roster writes in it and has pets. |
| 38 | A visitor sees **both** Notes and Photo. |
| 39 | No sound or push for a direct message yet — an unread dot. |
| 40 | The avatar is My Space's own. |
