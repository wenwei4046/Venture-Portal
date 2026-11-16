# Handoff: Workflow Builder refinements + Projects "Drive" view

## Overview
Two pieces of work for the HOUZS Marketing app (`wenwei4046/Venture-Portal`):

1. **Workflow Builder** (`/marketing/workflows`): refinements to the shipped 2a builder (`src/components/mkt/workflows/*`).
   - Readable layouts when a template has many stages.
   - Stage cards and the Stage Settings panel say what each stage fills in on the Canvas.
   - "Anyone can assign" replaces "MM assigns" and lists the whole team.
   - An "+ Add stage" button.
   - A simpler Canvas template tab.
2. **Projects** (`/marketing/projects`): a folder-style browser that replaces the flat table in `src/components/mkt/projects/ProjectsList.tsx`.
   - Subsidiaries are folders; inside a subsidiary, Projects are folders and Quick Tasks are files.
   - Grid and list views.
   - A details pane.
   - Delete with confirm, right-click menu and Undo.

## About the design files
The `.dc.html` files are **design references built in HTML**. They are prototypes of the intended look and behavior, not production code. Rebuild them in the existing Next.js / React codebase using its patterns:
- CSS modules with `rgb(var(--mk-*))` tokens from `src/app/globals.css`.
- `@/lib/marketing/*` data helpers.
- Existing components: `MktShell`, `page.module.css` (seg, chip, pill, table), `BuilderToast`, `CtxMenu`, `StageCard`, `CanvasEditor`.

To view a file, open it in a browser with `support.js` next to it. The data is fixtures hard-coded in each file's logic class.

## Fidelity
**High-fidelity.** Colours, type, spacing and copy are final and were taken from the repo's tokens and CSS modules. Where a matching component already exists, use it and match the design.

---

## 1. Workflow Builder

File: `Workflow Builder.dc.html`. It embeds `Stage Settings.dc.html`, `Canvas Template Editor.dc.html` and `Task Flow.dc.html` (the Preview tab). It opens on a sample 9-stage template, "Campaign launch / Full".

### 1.1 Many stages: two layouts
There is a switcher above the board: **3a Scroll row** and **3b Wrap in rows**. Pick one to ship; the switcher is only for comparison. The `layout` prop defaults to `scroll`.
- **3a Scroll row**
  - All cards sit in one grid: `repeat(n, minmax(150px,1fr)) 84px`, inside an `overflow-x:auto` row with padding `2px 2px 10px`.
  - 🏁 Done is `position:sticky; right:0`, with a white background, `padding-left:8px` and `box-shadow:-10px 0 12px -6px #fff`.
  - Above the row: "**{n} stages** · Scroll sideways, or click the time bar to jump to a stage. 🏁 Done stays pinned on the right." (0.84em, `rgb(117 100 86)`).
  - **Selecting a stage** (a card, a time-bar segment, or a warning's Fix) scrolls the row so the card is visible. Keep 96px clear on the right for the pinned Done card. The scroll jumps instantly, with no smooth scrolling.
- **3b Wrap in rows**
  - Up to 6 stages per row: `repeat(6, minmax(0,1fr))`.
  - Between rows, a dashed divider: `1.5px dashed rgb(214 206 196)` lines on both sides of "↪ continues with stage {n} · {name}" (0.8em, muted).
  - The connector after the 6th card of a row is hidden.
  - The last row ends with the 76px Done card.
  - With ≤6 stages: `repeat(n, minmax(0,1fr)) 76px`.

### 1.2 "Fills in" on cards
- **New block on each stage card**, between "APPROVED BY" and the footer.
  - Label "FILLS IN": 0.7em, 600, uppercase, letter-spacing 0.1em, `rgb(117 100 86)`.
  - Value "{n} field(s) · {r} required" (0.86em, 500, ink), or "Nothing to fill" in `rgb(160 150 140)`.
  - Clicking it selects the stage, opens the **PIC & form** section and flashes the panel below amber (`rgb(251 243 225)`) for 0.9s.
- **Fields for a stage** are every Canvas field, table column, or section (checklist/video) whose `stage` equals the stage name.

### 1.3 Right panel: "🎯 What {stage} fills in"
- **Position:** under Stage Settings, border-top `rgb(236 231 224)`, padding `14px 18px 22px`.
- **Header:** title (0.92em, 600) and an "Edit in Canvas →" link (underlined, `rgb(90 62 43)`) that switches to the Canvas tab.
- **List:** a white box (radius 10, 1px `rgb(236 231 224)` border) with one row per field.
  - Each row has: a type glyph, the name, its location ("Script table", "Section"…), ⭐ for required and 👁 for visible to PIC.
  - An icon that is off is drawn at opacity 0.15.
  - Legend below: "⭐ required before submit · 👁 visible to PIC".
- **Empty state:** "Nothing to fill in. The doer just submits. Add fields in Canvas and set 🎯 to this stage."

### 1.4 Who does it: "Anyone can assign"
All "MM assigns" wording changes:
- **Stage Settings radio card:** title "Anyone can assign"; text "Whoever plans the project picks the person. Anyone on the team can assign or reassign."
- **Section summary:** "👤 Anyone can assign".
- **"Picked at assignment" approver hint:** "Whoever assigns picks the approver per project".
- **Workflow-wide segment:** "🔒 Assign every stage". Its lock note reads "Every stage is assigned when planning · anyone can assign."
- **When "Anyone can assign" is selected**, a box appears under the cards (bg `rgb(250 248 244)`, radius 10, padding `10px 12px`):
  - Title "Can be assigned · everyone on the team · {n} people".
  - Chips for **every team member**: 30px pills with a 24px avatar, the name and "{n} active". The count turns red (`rgb(176 40 34)`) at 5 or more.
  - Note: "Whoever plans the project picks one of them. Busy people (5+ active) are shown in red."
  - The chips are display only; they cannot be clicked.
- **Card "DONE BY" box:**
  - Three 22px avatars side by side with a **3px gap**. They do **not overlap**.
  - Below them, a stacked line: "Anyone · {n}" and "picked per project".
  - The handoff state uses the same non-overlapping layout for its candidate avatars.

### 1.5 + Add stage
- **Placement:** at the right end of the summary row ("{n} working days · Promise · ⏰ … · warnings"), after the warning pills.
- **Style:** 28px tall, padding `0 12px`, radius 8, `1.5px dashed rgb(214 204 190)` border, text `rgb(74 64 58)` 0.9em/500.
- **Hover:** bg `rgb(250 248 244)`, border `rgb(150 136 120)`.
- **Action:** appends a 1-day stage in the same group as the last stage, selects it and opens Basics.

### 1.6 Canvas template tab (simplified)
- **"Who fills what" strip** under the builder header (bg `rgb(252 251 249)`, padding `10px 24px`).
  - One pill per stage: colour dot, "{n}. {name}" and a mono field count. A count of 0 shows in red `rgb(200 52 42)`.
  - Clicking a pill scrolls the editor to that stage's section and flashes it amber for 1.2s. It also sets the preview to that stage.
  - The editor listens for `cv-jump`; in React, replace this with a callback or ref.
- **Editor header:** title, version chip, and on the right one faint legend line: "⭐ required · 👁 PIC · 📅 calendar · 🔒 locked" (0.8em, `rgb(160 150 140)`). The old legend box and the "Click any section…" hint are removed.
- **Sections**
  - Gap 12px; padding `12px 14px`.
  - The owning stage is shown as a dark pill next to the title: "🎯 Stage 3", with " · {stage}" added only when the stage name differs from the section title. Style: 22px, bg ink `rgb(51 36 27)`, white text, 0.76em.
  - The other badges are icons only (🔒 ⭐ 👁), with a tooltip.
  - "⚙ Section settings" is now a 26×26 ⚙ button.
- **Field rows**
  - A flat list with `1px rgb(244 241 236)` separators instead of separate boxed rows. Padding `7px 6px`; hover bg `rgb(250 248 244)`.
  - A field's 🎯 chip shows **only** when its stage differs from the section's stage (amber chip).
  - ⭐ 👁 📅 sit in fixed 16px columns; an icon that is off is hidden (opacity 0).
- **Free space:** now a single dashed divider: "🔒 FREE SPACE FOR COLLEAGUES" (0.78em, 600, uppercase, letter-spacing 0.14em, `rgb(160 150 140)`).
- **Staff preview:** a "Doer at [select]" dropdown of all stages replaces the hard-coded "Ali at Edit". The sections and columns for that stage are highlighted; the rest are drawn at 0.55 opacity. Badges in the preview are removed.

---

## 2. Projects: Drive-style browser

File: `Projects v2.dc.html`. `Projects.dc.html` is the faithful recreation of the current page, kept for reference. The shell (sidebar and top bar) is unchanged: `MktShell` / `MktSidebar` / `MktTopBar`.

### Layout
- **Page card:** `<main>` is a white card, radius 16, `1px rgb(229 228 223)` border, `display:flex`.
  - Content column: flex 1, padding `28px 32px 48px`, scrolls on its own.
  - Optional details pane on the right: 300px, bg `rgb(250 249 247)`, border-left `1px rgb(236 231 224)`, padding `20px 18px`, `overflow-x:hidden`.
- **Head row** (flex, gap 12, wraps):
  - **Breadcrumb:** "Projects › Carres › {project}". Each crumb is 1.6em/600; earlier crumbs are muted `rgb(117 100 86)` and clickable (hover bg `rgb(241 236 228)`, radius 8); the "›" is `rgb(160 150 140)`.
  - Search, 240px. The placeholder is "Search in {subsidiary}" inside a subsidiary, otherwise "Track ID, title or person".
  - The Open / Done / All segment, counting the current level.
  - A grid/list toggle: two 32×28 buttons, ▦ and ☰.
- **Section label:** "SUBSIDIARIES", "PROJECTS", "QUICK TASKS" or "RESULTS · n". Style: 0.78em, 500, uppercase, letter-spacing 0.1em, muted.

### Levels
- **Root:** one folder tile per subsidiary.
  - Grid: `repeat(auto-fill,minmax(220px,1fr))`, gap 10.
  - Tile: 56px tall, radius 12, `1.5px rgb(236 231 224)` border, hover border `rgb(214 204 190)`.
  - Contents:
    - A 36px emoji tile (bg `rgb(239 228 217)`, radius 9) with the subsidiary's dot (10px, white 2px ring) at its bottom-right.
    - The name (500).
    - Meta "{n} items" or "Empty" (faint).
    - A red count pill when anything is late.
  - A single click opens the folder.
- **Subsidiary:** Projects (kind `Project`) show as folder tiles with meta "{status} · {n} tasks", and Quick Tasks show as files.
  - A single click selects a project folder; a double-click opens it.
  - Clicking a subsidiary in the sidebar also navigates here.
- **Project:** its tasks show as files. When it has none: an empty state with a 64px round emoji, "No tasks yet" and "Tasks appear here once the minutes are turned into a plan."
- **Search:** with a query, the matching files at the current level and below are shown flat under "RESULTS · n".

### File card (grid)
- **Card:** radius 12, `1.5px rgb(236 231 224)` border. Selected: border ink `rgb(51 36 27)` and shadow `0 8px 20px rgb(51 36 27/.12)`.
- **Preview area:** 112px, inset 6px, radius 8, a striped placeholder `repeating-linear-gradient(135deg, rgb(250 248 244) 0 10px, rgb(253 252 250) 10px 20px)`. It shows the kind emoji (🎞️ video, 🖼️ image, 📈 ads) and the kind in Chivo Mono 10.5px.
- **Body** (padding `10px 12px 12px`):
  - Title, 500, ellipsis.
  - Track ID in mono 10.5px, muted.
  - A row with the status pill (from `page.module.css` `.pill` + tone) and "{who} · {due}" on the right.

### List view
The same table as today, with columns `minmax(0,2.4fr) minmax(0,1.3fr) minmax(0,0.9fr) 70px minmax(0,1.2fr) 64px`:
- **Name:** a 28px icon tile, then the title and "{trackId} · {kind}".
- **Stage, Now with, Due, Status.**
- **Delete:** the ✕ button.

A selected row has bg `rgb(250 244 236)`.

### Details pane (when a file or project is selected)
- **Header:** a 32px icon tile, the title (600, wraps), the Track ID (mono), and a × button to close.
- **Status pill.**
- **Facts list:** Subsidiary, Kind, Stage, Now with, Due. 84px label column; rows separated by `1px rgb(244 241 236)`.
- **"Open task" / "Open project" button:** primary `#EC9B55`, hover `#E0893F`, text `rgb(43 31 23)`, 36px, radius 8.
- **Delete button:** 34px, white, `1px rgb(236 190 184)` border, red text `rgb(176 40 34)`. The first click arms it: "Click again to delete" on `rgb(190 50 40)` with white text. The second click deletes.
- **Note below the buttons:**
  - Project: "Deletes the project and every task inside it. You can undo for 6 seconds."
  - Task: "You can undo for 6 seconds."
- **Closing:** clicking empty space in the page clears the selection.

### Delete (every project and task)
- **Hover ✕**
  - Where: a 24px button in the card's top-right corner, at the end of a list row, and on project folder tiles. It shows on hover or when the item is selected.
  - First click: turns into a red "Delete?" pill (`rgb(190 50 40)`, white).
  - Second click: deletes.
  - Mouse leave: cancels the armed state.
- **Right-click menu** on any project folder, file card or list row:
  - **Menu box:** 210px, radius 10, `1px rgb(229 222 211)` border, shadow `0 14px 34px rgb(51 36 27/.18)`, padding 5. It opens at the cursor and is clamped inside the page card.
  - **Header line:** "{trackId} · {kind}" (0.76em, muted).
  - **Items:** 32px tall, radius 7, hover `rgb(246 244 240)`.
    - "↗ Open task" / "Open project". Open project navigates into the folder.
    - A separator, then "✕ Delete…" in red. Clicking it turns the item into "Click to confirm" on `rgb(190 50 40)` with white text. For a project the label is "Click to confirm · deletes its tasks". The next click deletes.
  - **Behavior:**
    - Right-click does **not** select the item, so the details pane doesn't open and shift the layout.
    - The browser's own context menu is suppressed inside the page card.
    - Clicking outside closes the menu.
- **After delete:**
  - Deleting a project also removes its tasks. If you were inside that project, you go back up to the subsidiary.
  - A toast appears at the bottom centre of the card: ink background, `rgb(246 238 230)` text, radius 8. It reads "Deleted “{title}”" with an orange (`#EC9B55`) underlined **Undo** that restores the previous rows for 6 seconds.
- **Subsidiary folders** cannot be deleted.
- **Backend (not in the prototype):** decide soft or hard delete, and check permission. Suggested: Marketing · Manage only, to match the Workflow Builder.

## State (suggested)
- **Projects:**
  - `path: [] | [subCode] | [subCode, projectId]`
  - `view: 'grid' | 'list'`
  - `scope: 'open' | 'done' | 'all'`
  - `q`
  - `sel: id | null`
  - `hover`
  - `arm` (the item whose delete is armed)
  - `ctx: { id, x, y, confirm }`
  - `toast`, `undoSnapshot`
  - The URL could keep `?sub=` and `?p=` so the path survives a reload.
- **Builder:**
  - `variant: 'scroll' | 'wrap'` (ship one)
  - `flashFills`
- **Fills per stage:** derive them from the canvas model (sections, fields and cols, each with `{ stage, required, pic }`).

## Design tokens used (from `src/app/globals.css`)
- **Ink and neutrals:**
  - ink `51 36 27`, ink-2 `43 31 23`
  - text-2 `74 64 58`, muted `117 100 86`, faint `160 150 140`
  - lines: `229 222 211`, `236 231 224`, `244 241 236`; card-line `229 228 223`; field-line `232 225 216`
- **Surfaces:** app `243 243 241`, side `248 245 240`, surface `250 248 244`, surface-3 `246 246 244`, hover `241 236 228`, active `236 229 219`
- **Brand:** primary `#EC9B55` / hover `#E0893F`; brown `90 62 43`
- **Status colours:**
  - wait: bg `251 243 225`, line `236 214 164`, text `138 92 10`, dot `214 152 30`
  - red: bg `252 236 233`, line `236 190 184`, text `176 40 34`, dot `200 52 42`
  - done: bg `232 244 235`, line `190 222 199`, text `40 110 64`, dot `60 150 90`
  - draft: bg `243 242 239`, line `226 223 217`, text `98 92 86`, dot `160 154 146`
- **Tile tones:** sand `239 228 217`, mist `230 237 241`, peach `249 231 216`, cream `246 238 222`
- **Type:** Inter 400/500/600, base 13px; Chivo Mono for IDs and numbers.
- **Radii:** 6–8 (buttons, chips), 9–12 (cards, tiles), 16 (page card), 999 (pills).
- **Shadows:**
  - selected `0 8px 20px rgb(51 36 27/.12)`
  - popover `0 14px 34px rgb(51 36 27/.18)`
  - segment `0 1px 2px rgb(51 36 27/.14)`

## Assets
There are no image assets. Icons are emoji, as in the existing marketing UI. The few inline SVGs (search, bell, chevron) are copied from `ProjectsList.tsx`, `MemoBell.tsx` and `MktSidebar.tsx`.

## Files
- `Workflow Builder.dc.html`: the builder (2a with these refinements).
- `Stage Settings.dc.html`: the stage panel (Anyone can assign and the team list).
- `Canvas Template Editor.dc.html`: the simplified Canvas tab.
- `Task Flow.dc.html`: the Preview tab (unchanged from the repo's handoff).
- `Projects v2.dc.html`: the **new** Projects browser. Build this one.
- `Projects.dc.html`: today's Projects page, for comparison.
- `support.js`, `hm-store.js`: runtime needed to open the prototypes. Do not port them.

## Screenshots (`screenshots/`, scaled down)
- `01-builder-scroll-row.png`: 3a, with Done pinned.
- `02-builder-wrap-rows.png`: 3b, with the "continues with" divider.
- `03-canvas-template.png`: the simplified Canvas tab with the Who fills what strip.
- `04-projects-root.png`: subsidiary folders.
- `05-projects-subsidiary.png`: Carres, with its project folder and Quick Task files.
- `06-projects-details.png`: a task selected, with the details pane.
- `07-projects-list.png`: list view.
