# Handoff: HOUZS Marketing ERP (Marketing Module)

## Overview
Internal marketing ERP for HOUZS and its 8 subsidiaries (Carres, Houzs Century, 2990 Home, Hookka, Colive, Dreamcrafter, CMI, The Conts). It covers:
- product projects with stage-based workflows, meeting minutes and PIC (client) approval links
- Quick Tasks and Recurring Tasks (no product, payment or PIC)
- a team-wide Calendar
- a customisable, gamified **My Space** (bento board, room, pet, lobby, chat)
- a **Tracking Dashboard** to monitor progress by person and by workflow
- builders for workflows, canvas templates, products and minutes

## About the design files
Everything in `design/` is a **design reference built in HTML**. These are working prototypes that show the intended look and behaviour; they are not production code. Recreate them in the target codebase's stack (React/Next, Vue, etc.) using its own patterns and component library. If there is no codebase yet, React + TypeScript + a CSS-in-JS or Tailwind setup is a good fit.

Each `*.dc.html` file is a "Design Component":
- markup with `{{ holes }}`, `<sc-for>` loops and `<sc-if>` conditionals
- a `class Component extends DCLogic` logic block (React class-component semantics: `state`, `setState`, `renderVals()` returns the template values)
- `<dc-import name="X">` mounts the sibling file `X.dc.html` as a child component

Open any file in a browser to run it (`support.js` is the runtime). **The JS logic in each file is the functional spec.** Read `renderVals()` and the handlers to match behaviour exactly.

## Fidelity
**High-fidelity.** Match colours, type, spacing, radii, shadows, copy and motion exactly. All styles are inline in the files, so the exact values can be read from them.

## Entry point and navigation
`HOUZS Marketing Prototype.dc.html` hosts `Marketing Shell.dc.html`. It has a bottom "View as" persona switcher (Rachel·MM, Mei·Director, Jason·Staff, …) and an "Empty data" toggle.

`Marketing Shell` is the app frame:
- **Left sidebar** (248px, collapses to 64px):
  - My Space
  - Calendar
  - Subsidiaries (expandable list with coloured dots and count pills)
  - Projects
  - Library
  - Manager tools (MM role only): Tracking Dashboard, Workflow Builder, Product Builder, Minutes Builder, Replace Person
  - Settings, which opens an Appearance panel: font size S/M/L/XL = 12/13/14.5/16px base; font Inter, Nunito or IBM Plex Sans; density Compact or Comfortable
- **Top bar:** 60px tall, 16px radius white card. Contains the breadcrumb, a search field (440px, with a ⌘K badge), a primary "New Project" button and a 🔔 bell with a red count badge.
- **Content:** a white card with 16px radius and a 1px border (rgb(229 228 223)), 10px from the edges, scrolling inside.

## Screens
| Screen | File | Screenshot |
|---|---|---|
| App shell + first-login onboarding | Marketing Shell, My Space Bento | `screenshots/app.png` |
| My Space (bento + cover) | My Space.dc.html → My Space Bento.dc.html | `01-my-space.png` (normal), `03-my-space.png` (edit layout) |
| Calendar | Calendar.dc.html | `calendar.png` |
| New project / Quick / Recurring task | New Project.dc.html | `01/02-new-project.png` |
| Task page (product project) | Task Page.dc.html | `task-page.png` |
| Quick-task page | New Task Page.dc.html | `quick-task-page.png` |
| Task map (swim lanes) | Task Map.dc.html | `task-map.png` |
| Workflow Builder | Workflow Builder.dc.html | `workflow-builder.png` |
| Canvas Template Editor | Canvas Template Editor.dc.html | `canvas-template-editor.png` |
| Tracking Dashboard (by people / by workflow) | Tracking Dashboard.dc.html | `01/02-tracking-dashboard.png` |
| PIC approval link (client-facing, mobile + desktop) | PIC Link, PIC Task Link, PIC Calendar | `pic-link.png` |
| Others | Library, Minutes Builder, Product Builder, Replace Person, Assignment Plan, Audit Trail, Subsidiary Page | open the file |

### My Space (bento) — `My Space Bento.dc.html`
- **Cover:** 190px tall, a gradient preset or an uploaded image.
  - Avatar: 96px circle, 5px white border, overlapping the cover by 44px. Click to upload a photo.
  - The animated pet sits beside the avatar.
  - Name is 1.6em/600 with the role after it. The status line is an editable inline input.
  - "✥ Edit layout" button.
  - Greeting line: "Good morning, {name} ☀️ — you have N things on your plate".
- **Board:** a free-form canvas.
  - Tiles are absolutely positioned with `{x, w}` as fractions of board width and `{y, h}` in px.
  - Default grid unit: column = 25%, row = 182px, gap = 12px.
  - Tile radius comes from the Corners setting: Square 6 / Soft 14 / Round 24.
- **Tiles:**
  - Room: 2D side view. Wall colour, window (sky changes by time/theme), floor planks and furniture emoji. The pet walks left/right with a 2.6s ease-in-out transition on `left`.
  - Pet: level, XP bar, energy bar, state, Feed and Exercise.
  - My turn / Delegated / Waiting: task cards with Accept / Open / Review.
  - Chat: tabs "💬 My chats" (DM list → conversation with ←) and "🏛️ Lobby" (team channel). 📎 attaches a task; the task card opens it.
  - Lobby: all pets wander, with name tags. The newest lobby message shows as a speech bubble above the sender's pet. Clicking a pet visits that person's space.
  - Trophies, This week, Notes (textarea), Photo (upload).
- **Edit layout:**
  - Tiles get a translucent overlay and grab cursor. Drag anywhere to move.
  - 8 resize handles: 4 edges and 4 corners. Resizing is continuous, with no snapping. Min width 14%, min height 110px. Moves are throttled with requestAnimationFrame.
  - The active tile is brought to the front with `0 18px 40px rgb(51 36 27/.22)` and a 2px accent outline.
  - Right drawer (290px, sticky):
    - **Layout tab:** add tile, page background, accent colour, corner style, reset.
    - **Room & pet tab:** wall, floor, add furniture (drag left/right; wall items sit higher), flip/remove, pet name, species, upload animal, colour chips, "Redo pet setup".
  - My turn and Waiting are locked and cannot be removed.
- **Visit mode:** a dark bar "👀 You're visiting X's space · ← Back to mine". Shows a read-only cover, room, pet, trophies, notes and lobby. Task tiles are hidden. Buttons: "Message X" and "👋 Wave".
- **First-login onboarding:** a fixed modal, 620px, 20px radius, blurred backdrop. Five steps:
  1. Pet: 4 species or upload your own (required)
  2. Name: input plus suggestion chips (required)
  3. Colour: 7 swatches applied as a CSS filter on the pet (required; shows an error if you try to continue without one)
  4. Cover (Skip allowed)
  5. Photo (Skip allowed)
- **Pet system:**
  - Levels 1–6 at XP thresholds [0, 100, 250, 450, 700, 1000].
  - It evolves at Lv 3 and Lv 5 (e.g. 🐱 → 🐈 → 🦁), and its size grows each level: [30, 34, 38, 42, 46, 52]px.
  - XP = stages × difficulty (S 1, M 2, L 3) × 10 per finished task. Exercise gives +10 XP, max 3 per day, and costs 15 energy. Feed gives +20 energy and uses 1 snack; snacks are earned per finished stage.
  - State comes from workload: overload (4+ tasks or 2+ overdue), newTask, busy, sleeping (plate clear), hungry (energy < 20). Feeding, exercising and levelling up show temporary flash states.
  - **The 9 state animations are in the `<helmet><style>` keyframes:**

    | State | Keyframes | Timing |
    |---|---|---|
    | Idle | pIdle | 2.4s |
    | New task | pNew | .6s |
    | Busy | pBusy | .4s |
    | Overload | pOver | .16s |
    | Sleeping | pSleep | 3s |
    | Eating | pEat | .3s |
    | Exercising | pEx | .55s |
    | Level up | pLvl | 1s rotateY |
    | Hungry | pHungry | 2s |

    State bubbles float with pBub 1.6s. The design is meant to swap these for 9 custom animations later.
- **Persistence:** localStorage `hm-bento-v2:{user}`. Replace this with the user profile API.

### Tracking Dashboard — `Tracking Dashboard.dc.html`
- **Header:** layout toggle "👥 By people | 🔀 By workflow". Filters: This week / This month / Custom, subsidiary, workflow and person.
- **Five status cards:** Ongoing, Needs you, Overdue, At risk and On track. Clicking a card toggles a status filter.
- **By people:** a card grid with `auto-fill, minmax(330px, 1fr)`, sorted by overdue count.
  - Each card has the avatar, overdue/waiting pills, and a load bar with 5 slots coloured by task status.
  - "Now on" block: the most urgent task, with stage segments, "N days on this stage" and a reason in red.
  - "Also on" list.
  - Footer: on-time %, average days per stage, Nudge, and "Only {name}".
  - People with no tasks show "Free · can take new work".
- **By workflow:** a horizontal People load strip first. Then one lane per workflow with stage columns (`minmax(140px, 1fr)`, scrolling sideways when needed). Each task chip shows the owner and days on stage. The slowest stage gets a 🐢 badge.

### Calendar — `Calendar.dc.html`
- **Views:** Month / Week / List, with ‹ › and Today.
- **Layers** (toggle on/off): 📣 posts, ⏱ stage due dates (⚡ Quick Task, 🔁 recurring runs) and 🗓️ shoots/meetings.
- **Filters:** subsidiary multi-select chips and an "Only mine" switch.
- Clicking an item opens a 320px sticky detail panel with Open task. Clicking a day opens a day list.

### New Project — `New Project.dc.html`
Pick a subsidiary, then a mode:
- **📦 Product project:** meeting minutes, then PIC tracking link, then PIC response.
- **⚡ Quick task:** title, type, and requirements (free text or a minutes template). Embeds Workflow Builder in `quick` mode, so stages each have their own due date, with no PIC and no total due date.
- **🔁 Recurring task:** a quick task plus a Repeat block:
  - Every: Day / Week (pick weekdays; every 1, 2 or 4 weeks) / Month (1st, 15th or last day)
  - Starts: a date
  - Ends: on a date, after N runs, or no end date
  - Shows a preview of the next 6 runs and the run count
  - The series is Active within its period, can be paused, and ends after its last run

## Interactions and motion
- Hover on cards and buttons: background tint, e.g. `rgb(250 248 244)`. Primary button hover: `#E0893F`.
- Panels and drawers enter with `opacity 0 → 1` and `translateY(4px) → 0` (or `translateX(12px) → 0`) over .15–.25s ease-out.
- Toasts: a dark pill fixed near the bottom center, 2.2–2.8s.
- Progress and energy bars animate `width .4s`. Tile size and position animate .2s when not being dragged.

## Design tokens
**Primary action (buttons):**
- `#EC9B55` background
- `rgb(43 31 23)` text
- `#E0893F` hover
- radius 8–9px, height 34–40px, weight 600

**Ink and neutrals:**
- Ink `rgb(51 36 27)` / `rgb(43 31 23)`
- Secondary text `rgb(74 64 58)`, muted text `rgb(117 100 86)`
- Borders `rgb(229 222 211)`, `rgb(236 231 224)`, `rgb(240 236 230)`
- Surfaces `#fff`, `rgb(250 248 244)`, `rgb(246 244 240)`, app background `rgb(243 243 241)`, sidebar `rgb(248 245 240)`
- Brand brown, used for selected and active states, progress fills and the today marker: `rgb(90 62 43)`

**Status:**

| Status | Background | Border | Text | Dot |
|---|---|---|---|---|
| Overdue | rgb(252 236 233) | rgb(236 190 184) | rgb(176 40 34) | rgb(200 52 42) |
| Waiting | rgb(251 243 225) | rgb(236 214 164) | rgb(138 92 10) | rgb(214 152 30) |
| Done | rgb(232 244 235) | rgb(190 222 199) | rgb(40 110 64) | rgb(60 150 90) |
| Draft | rgb(243 242 239) | rgb(226 223 217) | rgb(98 92 86) | rgb(160 154 146) |

**Subsidiary dots:**
- Carres `oklch(0.70 0.12 235)`
- 2990 Home `oklch(0.64 0.15 295)`
- Houzs Century `oklch(0.52 0.06 55)`
- Hookka `oklch(0.70 0.13 345)`
- Colive `oklch(0.66 0.10 195)`
- Dreamcrafter `oklch(0.56 0.15 270)`
- CMI `oklch(0.60 0.03 250)`
- The Conts `oklch(0.62 0.12 320)`

**Typography:**
- Body: Inter (user can switch to Nunito or IBM Plex Sans), base 13px. Everything is sized in em relative to the base.
- Monospace: Chivo Mono for Track IDs, dates and badges (10.5–11px).
- Section labels: 0.74–0.81em, 600, uppercase, letter-spacing 0.1em.
- Page titles: 1.6–2.3em, 600, letter-spacing -0.01em.

**Radii:** 6 (chips) · 8 (buttons, inputs) · 10–12 (cards) · 14–16 (panels and tiles) · 20 (modals) · 999 (pills)

**Shadows:**
- Subtle: `0 1px 2px rgb(51 36 27/.04)`
- Hover: `0 6px 18px rgb(51 36 27/.08)`
- Drawer: `0 12px 32px rgb(51 36 27/.08)`
- Modal: `0 24px 64px rgb(51 36 27/.3)`

**Spacing:** 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 22 / 28 / 36px

## State and data
- `hm-store.js` is the shared in-memory store (`window.__hmStore`) for tasks created in the prototype. It includes stage ownership, submit, approve and reject, history, notices and `postStatus`. Port it to the real backend: tasks, stages, approvals, notifications and an audit trail.
- Task record: `topLeft` (Track ID), `title`, `sub`, `stages[{ name, who, due, apprRaw, dept, form }]`, `cur`, `phase` (todo/accepted/review/changes/done), `quick`, `recur{ rule, period, runs[], status }`, `history[]`.
- Track ID formats:
  - `MKT-{SUB}-{YYMM}-{NNN}`: product project
  - `TSK-…`: quick task
  - `RCR-…`: recurring task
- Seed and sample data (teammates, posts, chats) sits in constants at the top of each logic block. Replace it with API data.

## Assets
There are no image assets. Pets, furniture and icons are system emoji and can be swapped for real illustrations or Lottie files (the 9 pet states). User uploads (avatar, cover, pet, photo tile) are stored as data URLs in the prototype; move them to object storage.

## Files
`design/` holds every screen (`*.dc.html`), plus `support.js` (prototype runtime, not needed in production) and `hm-store.js` (store logic to port). `screenshots/` holds captured references. Screenshot text may show a fallback font; the intended font is Inter.
