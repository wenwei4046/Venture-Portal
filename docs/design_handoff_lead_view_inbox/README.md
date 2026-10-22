# Handoff: Lead View — Inbox, Leads & Auto-reply admin (HOUZS Venture)

## Overview
Lead View is an internal tool for HOUZS Venture's customer-service (CS) team. It handles Facebook Messenger / Instagram chats for three furniture brands (**2990s**, **2990s mini**, **Carress**), auto-replies to customers (rule-based templates or an AI Agent), captures the customer's phone number, and hands the lead to a salesperson via WhatsApp. Managers track leads through to sale and review where the AI gets answers wrong.

Primary user: a CS agent ("Mei Ling") on a desktop browser.

## About the Design Files
The files in this bundle are **design references created in HTML** — working prototypes that show the intended look, copy and behaviour. They are **not production code**. Recreate them in the target codebase's environment (React, Vue, etc.) using its established patterns, component library and data layer. If no codebase exists yet, pick an appropriate stack (e.g. React + TypeScript + a headless UI kit) and implement there.

Each `*.dc.html` file opens directly in a browser (it loads `support.js`, a small runtime that renders the template and runs a class-based logic block, roughly like a React class component). Read the markup for layout/styles and the `class Component` at the bottom for state and behaviour. All data is seeded mock data inside each file; persistence is `localStorage` only.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy and interactions are final. Recreate pixel-faithfully, but map inline styles to your codebase's tokens/components. Artboard is **1440 × 900** (desktop only); columns that hold text must still not overlap when narrowed (see "Responsive").

---

## Global shell (all pages)

- **Sidebar** (left, 216px wide, collapsible to 62px icon rail; bg `#2B211C`, text `rgba(255,244,235,.72)`, active item bg `rgba(255,255,255,.08)` + inset 3px left bar `#C76F46`, active text white 600).
  - Brand block: "H" tile + "HOUZS Venture / Internal ledger".
  - Top items: Inbox, Leads, Insight, Campaigns.
  - Group **REPLIES**: Reply rules, Reply templates, Step library, AI Agent.
  - Group **FILES**: General info, Data Center, AI corrections.
  - Group **ADMIN**: Business hours, Audit log, Settings.
  - Footer: user avatar "ML" · Mei Ling · Customer Service · v0.3. A "Collapse" toggle sits above it (Inbox v2 implements collapse; persist in `localStorage`).
  - Group labels: 11px, letter-spacing .12em, `rgba(255,244,235,.45)`.
  - Icons: **Lucide** (v0.460).
- **Top bar**: search ("Search customers, phone numbers or chats"), "Test mode" pill, date "Mon 19 Oct 2026", bell, Sign out.
- **Page header**: small kicker (e.g. REPLIES / FILES / LEAD VIEW, 11px .14em) above a page title in Cormorant Garamond ~30px; right side shows status "Meta not connected · auto replies run in test conversations only" and a "Save changes" outlined button.

---

## Screens

### 1. Inbox — `Inbox v2.dc.html`
Three resizable columns inside a bordered card: **conversation list (default 304px, drag 230–460)** | **chat (flex)** | **customer panel (default 352px, drag 290–520)**. Widths persist to `localStorage` key `inboxv2-layout`.

- **List**: brand filter (All / 2990s / 2990s mini / Carress), search ("Name, phone, message or ad"), tabs Waiting / Answered / Handed / All with counts. Row: avatar initials + channel badge (FB/IG), name, last message, time, brand tag, "✦ AI" / template chip, TEST tag.
- **Chat header** (min-height 60px, wraps, never overlaps): name (ellipsis), brand tag (nowrap) · channel · source line (ellipsis). Right: **NOW** pill showing who is replying — `CS · Mei Ling` (headset icon) / `Template · <name>` (workflow icon) / `AI Agent` (sparkles icon). **Clicking it opens a dropdown "HAND THIS CHAT TO"** listing CS · Mei Ling, AI Agent and each template, current one ticked; picking one switches mode and appends a timeline entry. Status tag (Waiting/Answered/Handed) next to it.
- **Source bar** under header: "FROM THE AD · <ad name> · <path> · View the ad ↗ · Ads Manager ↗" or "SOURCE · Organic · messaged the Page directly".
- **Messages**: customer bubbles left (white), CS/bot bubbles right (peach `#FBEDE3`-ish), label "CS Mei Ling" / "AUTO Template · <name>" / "✦ AI Agent". Under AI messages: **"Correct"** link → inline editor (question, right answer, optional "also send to customer") → saves a fixed answer + writes a record to AI corrections (`localStorage` `houzs-ai-corrections`).
- **Composer**: when a bot is replying, placeholder "AI Agent is replying. Switch to CS from "Now" above to reply yourself." (or "A template is replying…") and input disabled. Toolbar: camera, attach, **General info** insert menu, **✦ AI draft** (AI writes a draft into the box; CS edits and sends — nothing is sent automatically). "Ctrl + Enter to send" hint only when sending is possible.
- **Customer panel**: name (26px), channel · first contact. **PHONE card** with status steps Found / Confirmed / Handed (wraps when narrow):
  - none: "No phone yet" + input "012-345 6789" + Add.
  - detected: big number (28px, wraps), "Found in the chat · <time>", buttons "Confirm number" (green outline) and "Not a phone" (wrap when narrow).
  - confirmed / handed: green number, "Handed to <sales> · <time> · by Mei Ling · via WhatsApp", "Hand again →".
  - Primary button "Hand over to <brand> sales" (accent fill, min-height 42px, text wraps).
  - **FOR THE SALESPERSON** form: Name, Interest, Budget, Showroom (select), Date, Note ("the customer never sees it"), Save. Then **TIMELINE**.

### 2. Leads — `Leads.dc.html`
- Filters: search, All brands, All salespeople, All sources, "● Needs follow-up · N" toggle, Export CSV.
- Subtitle: "Everyone who messaged, from every page and channel." — **includes customers without a phone**.
- Tabs with counts: All, **No phone**, Not handed, Handed, Contacted, Appointment, Came, Closed, Lost.
- Table (sortable, resizable columns): Customer (name + phone or "No phone yet"), Brand tag, Source (channel badge + ad/Organic), Interest, Salesperson, Status tag, Last update (+ red "Not contacted · 26 h" when stale).
- Status tags: No phone yet (`#F2EEE9`/`#685C54`), Not handed yet, Handed, Contacted, Appointment, Came (green tint), Closed (solid green `#4C6E50`, white text), Lost (`#FAE8E2`/`#C76F46`).
- **Footer bar** below the table: time range segmented **Today / Yesterday / This week / This month / Last month / All time / Custom** (default This month; week starts Monday; Custom shows two date inputs "from … to …", inclusive, max = today). **Per page 20 / 50 / 100** (default 20). Pager "1–20 of N" with ‹ ›. Changing any filter resets to page 1. Export CSV exports all filtered rows (not just the page).
- Row click → right drawer (420px): brand, name, phone (green; grey when "No phone yet"), progress steps (First message → Phone confirmed → Handed → Contacted → Appointment → Came → Closed), details, "Open conversation", "Remind salesperson on WhatsApp" (**hidden when no salesperson**), "Mark as lost" (hidden for No phone yet / Closed / Lost).

### 3. Insight — `Insight.dc.html`, Campaigns — `Campaigns.dc.html`
Reporting and campaign/ad views. Reproduce from the files; no recent behavioural changes except the removal of the "Sales recorded / ad spend / return" summary line on Insight.

### 4. Reply rules / Reply templates / Step library / AI Agent / AI corrections — `Auto Reply.dc.html`
One file, five views selected with `?view=routing | template | library | ai | corrections`.

#### 4a. Reply rules (`?view=routing`)
Which reply runs: **By ad** (each ad → a template or AI Agent) and **Organic and other ads**. Each row's "Edit →" opens that template in Reply templates.

#### 4b. Reply templates (`?view=template`)
Left: template list (name, description, usage; copy & delete icons on hover; "+ New template"). Right header: editable name (pencil), description, "Runs on …", **Closing message** input ("Sent when a chat reaches End, e.g. Thanks! We'll be in touch soon 😊"), unsaved-changes text, Discard, Save.

**Flow map (canvas)** — dotted background, pan/zoom (− 100% + · Fit · Tidy up).
- Top-left toolbar: **+ Step ▾** (Blank step, FROM LIBRARY quick list, Browse library…) and **Library** toggle (opens a 280px floating panel: search, All/Steps/Flows segment, draggable cards with Add; drop onto canvas places at cursor; clicking blank canvas closes it).
- **Step card** (230px): 3px top stripe in the step type colour, number badge (1 = Start), optional book icon if linked to library (amber dot when a newer library version exists), inline-editable name, pencil (open Edit step), trash. Body: inline-editable message, attachment row (PDF/JPG tag + filename). Rows: option pills (inline-editable, max 20 chars) or a summary row ("Types an answer…", "Gives a phone number", "Moves on, no reply"), each with target label ("→ 3" / "End") and a "+" when End.
- **"+" on an End row** creates a new step connected to it. **The new step is auto-named after the option label**, and stays synced when the option is renamed until the user renames the step.
- **Lines**: orthogonal with rounded corners; **coloured by the source card's type colour** (70% opacity, full + 2.25px when selected/hovered); arrowheads match. Drag a line end to another step to re-route; drag from a port; click a line for a small "go to" popover.
- **Right-click a card** → context menu: Save to library / Save with the steps after it (or, if linked: Save my changes to the library / Save as a new library item / Open in library / Unlink from library), divider, Edit step.
- Keyboard: ←/→ prev/next step, Ctrl/Cmd+Z / Shift+Z undo/redo, Delete removes selected step.

**Right panel** (collapsible "»" / "«"; tabs **Edit step** | **Test as customer**):
- Fixed header: number, name, ‹ n / N ›, **book button** (tooltip "Save to library" / "Save changes to library", one click, no menu), "+" insert after, trash.
- If linked: "From library · <name> · vN"; if outdated: amber box "The library has a newer version (vN). Update this step?" Update / Keep mine.
- **MESSAGE**: textarea, attachment chip (image uploads show a 44px thumbnail; images are downscaled to 640px JPEG data-URL), toolbar: **General info ▾** and **Attach** (accepts image/*, video/*, pdf, Office).
- **General info insert panel**: header "INSERT GENERAL INFO" ×; a full-width select of info cards ("KL showroom · 2990s"); rows of fields (small label over value, 2-line clamp) each with "+ Insert" pill; footer "Inserts a live field · updates when General info changes" + "Edit ↗". Inserts a token like `{kl.address}` that resolves at send time.
- **THEN** — step type dropdown (radio list):
  - **Taps an option** (Up to 13 choices): option cards — number, text, ×, "↳ Goes to" select; "Same for all"; "+ Add option".
  - **Types an answer** (Saved to the card): "Save answer to" field select, "Then go to".
  - **Gives a phone** (Fills the Phone card): "When they send a valid number, it's saved to the Phone card and the chat moves on." + "Next step". Section **IF IT'S NOT A PHONE**: retry message, "Ask again up to" (1–5 / no limit), "Still wrong" → Hand to a person / End / a step.
  - **Send a message** ("No reply needed · then ends here, or goes on to another step").
  - **Goes to a person** (moves to Waiting in Inbox; can still send a follow-up message; then go to).
  - **Goes to AI Agent** (choose brand agent; "Edit this AI Agent →").
- **Closing message** box appears under every "Goes to / Then go to / Next step" that is set to **End here** (not for person/AI). Empty = use the template's closing message (placeholder shows it).
- "Goes to" selects list "End here" + every step in this template as "N · Name".

**Test as customer** tab: simulated Messenger chat walking the flow; tap option chips, type answers, phone validation (accepts Chinese numerals and full-width digits; normalises), sends closing message at End ("End · closing message (template)"), Restart.

#### 4c. Step library (`?view=library`)
Left (300px): search, All/Steps/Flows, list rows (name, vN, "<Type> step · in N templates / not used yet"), "+ New step", "+ New flow". Right: editable name & "When to use it", kind · version, delete, Discard, **Save as vN+1**. STEPS: cards with number, name, type select, message, options pills (with "→ n"/"→ end"), "Then → step n / end", closing-message boxes for anything that ends, remove. "+ Add a step after". **USED IN** table: template, step names, "Up to date" / "N waiting to update" (click → opens template). Inserting from library creates **copies**; templates are asked before taking a new version. Library persists in `localStorage` `ar-library-v1`.

#### 4d. AI Agent (`?view=ai`)
Header "AI Agent · <brand>" with 2990s / Carress switch and "Copy settings from …". Tabs: **How it replies** (top summary "Reads N sources from the <brand> and Shared folders" + "N expired · N ending soon" in red + "Manage in Data Center ↗"; tone, length, phone asking, limits…), **Fixed answers** (two-column list CUSTOMER ASKS / AGENT REPLIES, borderless inputs that show a border on hover and accent on focus, auto-grow, trash icon, "+ Add fixed answer"), **Sales playbook**, **Memory**. Right: collapsible **TEST THE AGENT · <brand>** chat (» / « same as templates).

#### 4e. AI corrections (`?view=corrections`, under FILES)
Same brand switch; no test panel. "CORRECTIONS FROM THE INBOX · N in total", List / Summary, Download CSV ↓.
- Row: date + CS name (+ NEW), quoted customer question, **AI SAID** (struck-through grey), answer line:
  - Not edited since: **RIGHT** + editable text.
  - Edited: **IN USE** + current fixed answer (16px, 500) + "Edited <d Mon, HH:MM>", then a dashed divider and **EARLIER · CS FIX <date>** with the original fix in 12px grey.
  - Editing shows Save / Cancel; Save opens a centred modal over the whole app: "Save as a new fixed answer?" — explains the AI will use it and the original correction stays as history; shows the text; Keep editing / Save as new. Saving updates (or creates) the fixed answer for that question and stamps `editedAt`. The correction record itself never changes.
  - Right column: "Fixed answer →" (jumps to AI Agent › Fixed answers and highlights that row) and conversation link ↗.
- **Footer bar** (List view): Last 7 days / 30 days / 90 days / All (default 30), Per page 10 / 20 / 50, pager. Summary view: bar chart by topic + advice text.
- Corrections and fixed answers are matched by the customer-question text; edits in Fixed answers do **not** write back to corrections (corrections are history).

### 5. General info — `Basic Info.dc.html`
Info cards per showroom/topic (Showrooms, Payment methods, Delivery, Warranty and returns…), each with fields (Address, Opening hours, Phone, Google Maps, Waze…). These are the source for the "General info" insert menus. Shared helper `hz-basic.js` (storage key `houzs-basic-v1`) exposes `HZBasic.entries()` and `HZBasic.resolve(text)` for tokens.

### 6. Data Center — `Data Center.dc.html`
Files and web links the AI Agent reads, in folders per brand + Shared; status (reading, active, paused, expired, ending soon), validity dates, versions, "Used by". The agent for each brand reads everything in its folder and in Shared. This is the only place to pause/resume sources.

### 7. Business hours, Audit log — `Business Hours.dc.html`, `Audit Log.dc.html`
Admin pages; reproduce from files.

---

## Interactions & behaviour summary
- Persist to storage (replace with API): Inbox layout, sidebar collapse, Auto Reply test-panel open state (`ar-test-open`), step library, general info, AI corrections.
- Drag-to-resize handles: 9px invisible hit area, `col-resize` cursor, tint `rgba(176,92,54,.14)` on hover.
- Menus/popovers: white, 1px `#DAD2C8` border, radius 8px, shadow `0 10px 28px rgba(43,33,28,.16)`, items 8px 10px, hover `#F6F3EF`; a fixed transparent backdrop closes on outside click.
- Toasts: dark pill bottom-centre of canvas, 2.6s.
- Phone validation: Malaysian mobile/landline; accept full-width digits and Chinese numerals (零一二…); invalid → retry message, after N tries → hand to person / end / step.
- Timeline entries for hand-offs, mode switches, corrections.

## State (main entities)
- `Conversation { id, name, brand, channel, source, mode: 'person'|'ai'|templateId, state: waiting|answered|handed, messages[], phone, phoneStatus, timeline[] }`
- `Lead { id, name, phone|'' , brand, ch, source, interest, budget, showroom, sales, status: nophone|new|handed|contacted|appt|came|closed|lost, updated, dates{}, stale }`
- `Template { id, name, desc, endMsg, steps: Step[] }`
- `Step { id, name, autoName?, type: buttons|text|phone|file|human|ai, text, attach?{name,ext,img?}, options?[{label,next,endMsg?}], next?, endMsg?, saveTo?, retry?, retryMax?, failNext?, aiBrand?, pos?{x,y}, lib?{id,ver,i} }` — `next` = step id or `'end'`.
- `LibraryItem { id, kind: step|flow, name, desc, ver, steps: (Step without ids; next = index|'end') }`
- `AIAgent (per brand) { faqs[{q,a,fix?,editedAt?}], corrections[{date,by,q,wrong,right,conv,fresh}], playbook[], memory[], settings… }`

## Design tokens
Palette (warm, mono-accent; colour as stroke rather than fill):
- Ink / dark `#2B211C` (rgb 43,33,28) — text, dark buttons, sidebar
- Page bg `#F3F0EC` (243,240,236); surface white `#FFFFFF`; soft surface `#F8F6F3` / `#FAF8F5`
- Hairline `#EBE6E0` (235,230,224); frame/border `#DAD2C8` (218,210,200); muted fill `#F2EEE9` (242,238,233); hover `#F6F3EF`
- Text secondary `#584C44` (88,76,68); muted `#786C64` (120,108,100); faint `#968C82`
- Accent `#C76F46` (199,111,70); accent text `#B05C36` (176,92,54); accent tint `#FCF0E8` (252,240,232); cream `#F0E2CE`
- Green `#4C6E50` (76,110,80) / tint `#E6F0E7`; warning amber `#D69628` / box `#F9EED6` text `#6E4A0A`; red text `#A83C28`, red tint `#FAE8E2`
- Step type colours: options `#B05C36`, text `#4A688C`, phone `#4C6E50`, message `#80683E`, person `#2B211C`, AI `#965430`-ish (see `TC` in Auto Reply logic)

Typography: **Lora** (body/UI, 13–15px; weights 400/500/600) and **Cormorant Garamond** (page & dialog titles, 24–30px, 600). Section labels 11px uppercase, letter-spacing .08–.14em. Numbers tabular where they are figures.

Radii: 3–4px tags, 5–6px inputs/buttons, 8px cards/menus, 10px panels, 999px pills. Shadows: menus `0 10px 28px rgba(43,33,28,.16)`, modal `0 18px 48px rgba(43,33,28,.24)`, cards `0 1px 2px rgba(43,33,28,.05)`. Focus ring: `2px solid #C76F46`, offset 1–2px.

Buttons: primary actions are **outlined** (accent or dark 1px border, white bg); only the "Hand over to … sales" CTA and the dark "Save" in template header are filled.

## Responsive
Desktop only, but every column that holds text must reflow without overlap when resized: header rows wrap, tags `nowrap`, long values ellipsis or wrap.

## Assets
- Icons: Lucide (https://lucide.dev), loaded from unpkg in the prototypes.
- Fonts: Google Fonts Lora + Cormorant Garamond.
- No photography; attachments in seed data are placeholder filenames.

## Out of scope / future (see `Notes.md`)
WhatsApp Business API hand-over with delivery status and sales report-back; real Meta connection (prototype runs in "Test mode").

## Files
- `Inbox v2.dc.html` — Inbox
- `Leads.dc.html` — Leads
- `Insight.dc.html`, `Campaigns.dc.html`
- `Auto Reply.dc.html` — Reply rules, Reply templates, Step library, AI Agent, AI corrections (`?view=`)
- `Basic Info.dc.html` — General info
- `Data Center.dc.html`
- `Business Hours.dc.html`, `Audit Log.dc.html`
- `hz-basic.js` (general-info store + token resolver), `hz-select.js` (themed select popover), `hz-date.js` (themed date picker)
- `support.js` — prototype runtime only (do not port)
- `Notes.md` — product notes
- `screenshots/` — one capture per page at the 1440×900 artboard (01 Inbox … 13 Audit log; Auto Reply views 05–09). Reference only; the HTML files are the source of truth.
