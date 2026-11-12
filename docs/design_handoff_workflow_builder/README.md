# Handoff: Marketing Workflow Builder, Task Page and My turn

## Overview
This redesigns the Marketing Workflow Builder (`/marketing/workflows`, Manager tools) and connects it to the places where staff meet the workflow:

1. **Workflow stages**: the manager builds the stage chain for one template (who does each stage, who approves it, how long it takes, what happens when a stage is late, what happens when the task is done).
2. **Canvas template**: what the task page shows, and which stage fills in which section or field. This is the existing Canvas Template Editor, now the only place where fields are defined.
3. **My Space · My turn / Waiting**: where each person finds the task.
4. **Task page**: one running task, seen by whoever opens it (doer, approver, manager, or the PIC through the tracking link).

`Marketing Prototype.dc.html` puts all four together so you can click through them in order. Whatever you change in steps 1 and 2 flows through to steps 3 and 4.

Repo: `wenwei4046/Venture-Portal`. Current code: `src/components/mkt/workflows/WorkflowBuilder.tsx`, `TemplateSettings.tsx`, `src/components/mkt/builder/StageList.tsx`, `src/components/mkt/myspace/TaskTile.tsx`. The current design reference is `.design/marketing/design_handoff_houzs_marketing/`.

## About the design files
The files in `design/` are **design references built in HTML**. They are prototypes that show the intended look and behavior. They are not production code to copy. Rebuild them in the existing Next.js / React codebase with its established patterns: CSS modules, `rgb(var(--mk-*))` tokens, `@/lib/marketing/*` data helpers, and the existing tests.

Open any `.dc.html` file directly in a browser (it needs `support.js` next to it). Sample data is hard-coded in each file's logic class. People, dates and tasks are fixtures.

## Fidelity
**High-fidelity** for layout, copy, colors, states and behavior. It follows the existing Houzs marketing palette and type (Inter, plus Chivo Mono for numbers and IDs). Where the codebase already has a component (status pill, avatar, segmented control, toast, modal), use that component and match these designs.

---

## Screens / Views

### 1. Workflow Builder: Workflow stages (option 2a "Flow row")
File: `Workflow Builder v2.dc.html`, section `#2a`. Open it with the `only="2a"` prop to hide older options. Options 1a and 1b and the current builder are kept lower on the same page for comparison only. **Build 2a.**

**Header row** (padding 16px 24px, bottom border `rgb(236 231 224)`):
- 🧩 and "Workflow Builder" (1.3em / 600).
- **Template picker**: a button "{emoji} {Category} / {Template} ▼". It opens a 300px dropdown (radius 12, shadow `0 14px 34px rgb(51 36 27/.16)`) with:
  - Categories (actions) and their templates.
  - On hover over a template row: ⧉ Clone and ✕ Delete. Delete asks once ("Delete?" in a red pill), and mouse-leave cancels.
  - Double-click a name to rename it inline (Enter saves, Esc cancels).
  - Right-click a template for: Open, Rename, Clone, Delete… (asks to confirm).
  - Right-click a category for: Rename, Change icon, Add template, Delete… (asks to confirm and deletes all its templates).
  - "+ New category": an inline input. Enter creates it with a "Standard" template and opens it. A duplicate name is rejected with a toast.
  - "+ Template" next to each category.
  - Hint at the bottom: "Double-click a name to rename · right-click for more".
- "Draft v{n}" chip (Chivo Mono 11px, 1px border) and "Saved HH:MM" or "Unsaved changes" (amber `rgb(138 92 10)`).
- **Tabs** (segmented, track `rgb(246 246 244)`, active white with shadow `0 1px 2px rgb(51 36 27/.14)`): Workflow stages · Canvas template · ▶ Preview.
- On the right, "Assignment" with a segmented control: "Handoffs allowed" or "🔒 MM assigns every stage". Locked mode turns off handoffs and subtasks on every stage and shows a grey note listing the affected stages; their settings come back when you unlock.

**Summary row**:
- "{total} working days" (total = sum of stage SLAs).
- "Promise [− n +] days": a stepper, saved per template. It turns red when the total is over the promise.
- ⏰ Overdue chip "Late {d}d → doer + MM": click it to open the overdue settings in the right panel.
- Warning pills (amber `rgb(251 243 225)`, border `rgb(236 214 164)`, text `rgb(110 74 8)`), each with a "Fix" link where possible. The warnings are:
  - A handoff has no shortlist.
  - Longer than the product promise.
  - PIC approves 3 or more times.
  - No approval anywhere.
- Below: a 10px proportional time bar, one segment per stage with width = sla / max(total, promise) and the selected segment `rgb(90 62 43)`. A dashed promise line sits on top of it.

**Flow row**: one horizontal row of stage cards (flex 1 1 0, min-width 118px). They wrap to a second row when there are more than 6 stages (max-width 1/6). Cards are joined by a 12px line `rgb(214 206 196)`. Each card (radius 12, border 1.5px `rgb(229 222 211)`, selected `rgb(51 36 27)` plus shadow `0 8px 20px rgb(51 36 27/.12)`) contains:
- A number circle and the stage name.
- A **"DONE BY"** box (radius 9, padding 8). The box colour shows the assignment type:
  - Grey `rgb(246 244 240)`: "MM assigns · per project".
  - Amber `rgb(251 243 225)`: candidate avatars (overlapping 26px), their names, and "🔓 picked by {previous stage}".
  - Red `rgb(252 236 233)`: "No shortlist · Add people →".
  - Clicking the box jumps straight to the Who section.
- **"APPROVED BY"**: the levels joined with "→". Each level is shown as "Rachel" or "Rachel & Daniel" (everyone must approve) or "Rachel or Daniel" (any one). Clicking it jumps to the Approval section.
- Footer: a group colour dot, the group name, and "{sla}d" (Chivo Mono).
- **Right-click a card** for: Add stage before, Add stage after, Duplicate, Delete (Delete is disabled when only one stage is left). The menu is 210px, positioned at the cursor and kept inside the board. A new stage is selected and opens in Basics.
- After the last card there is a 76px green **🏁 Done** card that opens the End settings.

**Right panel (360px)**: Stage Settings (`Stage Settings.dc.html`, with `layout="accordion"` in 2a), the End settings, or the Overdue settings.

**Footer**:
- Warning pills.
- "{n} active tasks stay on v{n-1}".
- Buttons: "▶ Preview task page", "Save draft" (disabled-looking at 50% opacity when nothing changed), and "Publish v{n}" (`#EC9B55`, hover `#E0893F`, text `rgb(43 31 23)`).
- The footer wraps; it never overlaps.

#### Stage Settings panel (`Stage Settings.dc.html`)
The header has a number circle, the name, ◀ ▶ to move the stage, and "Remove". The body has four sections, collapsible with one-line summaries:
- **Basics**:
  - Stage name.
  - Group: chips with a colour dot, plus **"+ New group"** (an inline input; a new group gets the next oklch hue).
  - How long: a − n + stepper for working days, shown as "day a–b".
  - "Can be split into subtasks" toggle. It is off and disabled when locked.
- **Who does it**: two radio cards:
  - 👤 "MM assigns".
  - 🔓 "Handoff from the previous stage". This is disabled on stage 1 and when locked. It opens a **Shortlist** of people chips showing their active load.
- **Approval**: a vertical chain. "Doer submits" leads into L1, L2 and L3 (at most 3 levels), then "✓ Approved → Stage n+1" or "→ task done".
  - Each level is a **multi-select dropdown**: Rachel (MM), Daniel (AMM), Mei (Director), 🔗 PIC via link, 👤 Picked at assignment. People already used on another level are greyed out.
  - Selected people show as removable chips.
  - With 2 or more people, a "Needs: Any one of them | Everyone" segmented control appears.
  - "↩ If changes are requested, go back to": Stay on this stage, or any earlier stage.
- **PIC & form**:
  - "What does PIC see on the link?": department words only, no names or prices.
  - "🎯 What this stage fills in" is a link card, "Open Canvas →". **Fields are no longer edited here.**

#### End settings (🏁 Task done)
- "Done when": read-only, derived from the last stage, e.g. "Stage 6 · Final is approved by Rachel → PIC".
- Notify: chips for Everyone on the task, Rachel · MM, PIC via link, Who requested it.
- **Celebration**: a 2×2 grid of 🎆 Fireworks, 🍻 Cheers, 🎬 Movie night, 🎉 Confetti, plus **"Upload your own GIF"** (GIF, WebP or APNG, under 4 MB; a thumbnail shows once uploaded). There is also a "▶ Preview run" link.
- "PIC sees on the link": text.
- "After it's done": radio for Close the task, or Keep open 3 days for PIC feedback.

#### Overdue settings (⏰ When a stage is late, workflow-wide)
- "Late by" stepper: 1–10 working days.
- Notify: The person on it, Rachel · MM, Mei · Director, Next person.
- Then: radio for Just remind, or Ask MM to reassign (Rachel sees "reassign it?" at the top of the task).
- "Repeat daily" toggle.

#### Publish review (modal, 540px)
- Title "Publish v{n} · {Category} / {Template}" and "Compared with v{n-1}, the version running now".
- **What changed**: a list diffed against the last published stages. It covers:
  - Added, removed and renamed stages.
  - SLA, who, approval, group and PIC text changes.
  - Order changed.
  - Promise changed.
- **Who is affected**: "{n} active tasks stay on v{n-1} and finish as they are. Every task started after you publish uses v{n}."
- Current warnings.
- Cancel and Publish buttons.

#### Undo
Deleting a stage, template or category shows a toast with **Undo** for 6 seconds. It restores the previous snapshot.

### 2. Canvas template
File: `Canvas Template Editor.dc.html`. This is the existing editor with two changes:
- It receives `initial` (the saved canvas) and `stageNames`, and emits `onChange({sections, cols, tableName})`.
- "🎯 Which stage fills this in?" lists the template's **real stage names**.

This is now the single place where fields and table columns are defined:
- Each field or column has a stage.
- Each has ⭐ Required before submit.
- Each has 👁 Visible to PIC.

### 3. My Space · My turn / Waiting
In `Marketing Prototype.dc.html`, step 3. It uses the card style from the existing `TaskTile.tsx` / `My Space Bento.dc.html`.
- **👉 My turn**: tasks where the viewer is the current doer or a pending approver.
  - Card status "Your turn"; "Needs your approval" with a **Review** button (orange); or "{n}d overdue", where the card and the tile go red.
  - The count badge is red when anything is late.
- **⏳ Waiting on others**: tasks the viewer is on but where it is not their turn. Status "{stage} · with {person}" and an **Open** button.
- Card meta line: "{project} · Stage n/N {stage} · due {date}".
- Clicking the card or its button opens the Task page as that viewer.
- When the task moves on, the card leaves this person's My turn and appears in the next person's.

### 4. Task page
File: `Task Flow.dc.html`. Props: `workflow` (the payload emitted by the Builder), `viewer`, and `onStatus` (it emits {stage, actors, due, late, done, team} for My Space). `Task Flow v1.dc.html` is the superseded first version; it is not part of the handoff scope.

**Header**:
- Breadcrumb and a template chip.
- Task ID and a status pill: On track, Waiting for approval, {n} days overdue, or Done.
- Title.
- A 4-up row: Now with, In this stage (live, Chivo Mono), Stage due, Deadline (start + promise; red "· at risk" when the projection is past it).

**Banner** (one per viewer, radius 12):
- **Your turn** (amber, ⏰ red when late): "Fill {n} required fields below, then submit" and a **Submit {stage}** button.
- **Your approval** (amber): explains any/all, with **Request changes** and **Approve**.
- **MM** (calm, red when late): "now with X for {time}", with **⇄ Reassign current** and **🔔 Nudge**. When the overdue rule is "Ask MM to reassign", this becomes "{stage} is {n}d overdue · reassign it?".
- **Up next**: "You're up next / in n stages · expected around {date}. You'll get a notification when it's your turn."
- **Finished / not on it**: "You finished X. It's now at Y with Z."
- **Done** (green): finish date, before or after the deadline, and **Replay celebration**.

**Workflow strip** (compact):
- One card per stage (min 118px, a 3px top bar): green when done, `#EC9B55` when current, red when late.
- Each card shows ✓ or the number, the name, YOU, the who avatar, and a mini value: "✓" or "1d late" for done stages, live time for the current stage, "{sla}d" for later stages.
- **Click a stage to focus it.** The focused card has an ink border and a soft shadow.
- The focus defaults to the **viewer's own stage**:
  - The current stage if it is their turn or their approval.
  - Otherwise their next stage.
  - Otherwise the last stage they finished.
  - Otherwise the current stage.
- The focus resets when the viewer changes or the task moves on.

**Focused stage panel**:
- "Stage n of N" and the name.
- Who (avatar and role).
- Time: Took, In stage, or Planned.
- Due: On time, {n}d late, or Expected by.
- Approval levels: "L1 · all Rachel ✓ Daniel …", where ✓ is green and "…" is amber for the current level.
- ⇄ Reassign (MM only).

Below the panel:
- **📋 Requirements**: one collapsed line that expands on click.
- **Only the sections and fields that the focused stage fills in.** If there are none: "Nothing to fill in at {stage}."
- Fields are editable only by the current doer, and only before submit.
- When a required field is missing at submit, the toast lists the missing fields and they get red borders.

**Tables**:
- Each column header shows the column name, a * when required, and "🎯 {stage}".
- The cells of the doer's own columns are tinted `rgb(255 251 244)` and editable.
- **+ Add row** and **+ Add column** (name and type) are available to the current doer.
- Rows and columns the doer added get a × to delete them. Columns added here exist on this task only.
- Required columns must be filled on every row.

**Right column (260–320px)**:
- **Next up**: who is next, when they are notified, and the message preview.
- **Activity**: the latest 3 entries, with "Show all {n}" to see the rest.

**Reassign / handoff modal** (420px): a list of people with role and "{n} active" (red at 5 or more), and a ✓ on the current person.
- The handoff version only shows the shortlist.
- After a reassign, the new person is notified and the old person is told it moved.

**Celebration**: a full-card overlay that plays when the last approval passes. The four presets are CSS keyframe animations: `fwUp` / `fwBurst`, `clinkL` / `clinkR` / `bubble`, `clap` / `beam` / `cfFall` (popcorn), and `cfFall` (confetti). An uploaded GIF is shown as an image (max 420px, radius 14). The overlay shows the title and "{team} each get +60 XP". Click anywhere to close it.

**PIC link view** (viewer = Carmen): a separate, simpler page, max 720px, on `rgb(250 248 244)`.
- The status card uses the stage's PIC text and has Approve and Request changes when the PIC is a pending approver.
- A step progress bar and "Expected by".
- Only the sections, fields and table columns marked 👁 PIC, with "Coming soon" where empty.
- No staff names, and no prices.

---

## Interactions & behavior (rules)
- **Stage order = flow.** The last stage is the end. "Done" means the last stage was submitted (with no approval) or approved by its final level.
- **Approval level**: rule `any` passes on the first approval; `all` waits for everyone on the level. Levels run in order, and each one notifies the next.
- **Request changes**: goes back to the stage's `back` target (or stays on the same stage). It clears approvals from that stage to the current one, restarts the stage clock, and notifies the doer.
- **Handoff**: on submit, if the next stage is a 🔓 handoff, the submitter picks from the shortlist (modal). The picked person is notified.
- **Notifications** (logged in Activity):
  - Your turn: "{stage}, due {date}".
  - Please approve.
  - Changes requested.
  - Reassigned.
  - Nudged.
  - Overdue per the rule (once, or daily when repeat is on).
  - Done, sent to the End-settings recipients.
- **Due dates** use working days (Mon–Fri) and end at 18:00. "Late" is the number of whole days past due, rounded up.
- **Versions**: publishing never changes running tasks; they finish on their own version.
- **Preview**: the ▶ Preview tab shows the Task page built from the current draft, without publishing.
- **Context menus** are right-click only for now. **TODO:** add long-press for touch.
- **Transitions**: card border, shadow and background 0.15s; banner colours 0.2s. The task page content area keeps a minimum height (about 540px), so switching stages doesn't jump. No entry animations on re-rendered lists.

## State / data model (suggested)
```ts
Template { id, categoryId, name, version, promiseDays, stages: Stage[], canvas: Canvas,
  end: { notify: ('all'|'mm'|'pic'|'req')[], after: 'close'|'feedback', picText, celebration: 'fireworks'|'cheers'|'movie'|'confetti'|'custom', customGifUrl? },
  overdue: { days: number, notify: ('doer'|'mm'|'director'|'next')[], action: 'remind'|'reassign', repeat: boolean } }
Stage { id, name, groupId, slaDays, who: { mode:'assign'|'prev', shortlist?: PersonId[] },
  approval: { ids: (PersonId|'pic'|'assign')[], rule:'any'|'all' }[] /* ≤3 */, backTo: 'self'|stageIndex, picText, split: boolean }
Category { id, name, emoji }   Group { id, name, hue }
Canvas = existing canvas model; each field/column has { stageName, required, picVisible }
Task { templateId, version, stageIndex, approvalLevel (-1 = doing), approvals: {[level]:{[person]:true}},
  stageStart, stageDue, values, tableRows, extraColumns, log[] }
```
- The Builder state is per template: draft stages, the published baseline (used for the diff), saved and dirty flags, promise, overdue, end and canvas.
- The custom GIF must be **uploaded to storage**. The prototype only keeps it in localStorage.

## Design tokens (as used)
- Ink `rgb(51 36 27)`; secondary text `rgb(74 64 58)`; muted `rgb(117 100 86)`; faint `rgb(160 150 140)`.
- Lines `rgb(229 222 211)`, `rgb(236 231 224)`, `rgb(244 241 236)`; app background `rgb(243 243 241)`; soft fill `rgb(246 244 240)`, `rgb(250 248 244)`.
- Brand / primary `#EC9B55` (hover `#E0893F`, text on it `rgb(43 31 23)`); brown accent `rgb(90 62 43)`.
- Amber: bg `rgb(251 243 225)`, line `rgb(236 214 164)`, text `rgb(138 92 10)`. Red: bg `rgb(252 236 233)`, line `rgb(236 190 184)`, text `rgb(176 40 34)`, strong `rgb(200 52 42)`. Green: bg `rgb(232 244 235)`, line `rgb(190 222 199)`, text `rgb(40 110 64)`, strong `rgb(60 150 90)`.
- Group colours are oklch: bg `oklch(0.94 0.04 H)`, text `oklch(0.40 0.10–0.12 H)`, dot `oklch(0.62 0.10–0.12 H)`. H values: Content 295, Social 235, Design 350, Ads 270, Brand 195.
- Type: Inter 400/500/600, base 13px. Section labels are 0.7–0.74em, 600, uppercase, letter-spacing 0.1em. Numbers and IDs use Chivo Mono 10–12.5px.
- Radii: 5–7 (chips, inputs), 8 (buttons), 10–12 (cards), 14–16 (tiles and boards), 999 (pills).
- Shadows: selected card `0 6–8px 16–20px rgb(51 36 27/.08–.12)`; popover `0 12–14px 28–34px rgb(51 36 27/.16–.18)`; modal `0 24px 64px rgb(51 36 27/.3)`.

## Assets
There are no image assets. Icons are emoji, as in the existing marketing UI. The celebrations are CSS keyframes and emoji. Replace them with real Lottie or GIF files if design provides any.

## Files (in `design/`)
- `Marketing Prototype.dc.html`: start here. It is the click-through of steps 1 to 4.
- `Workflow Builder v2.dc.html`: the Builder. Build option **2a**; 1a and 1b are explorations.
- `Stage Settings.dc.html`: the stage settings panel, used by the Builder.
- `Canvas Template Editor.dc.html`: the canvas editor with the stage and onChange wiring.
- `Task Flow.dc.html`: the Task page and the PIC link view.
- `Workflow Builder (current).dc.html`: today's builder, for comparison.
- `support.js`, `hm-store.js`: runtime needed to open the prototypes. Do not port them.

## Screenshots (`screenshots/`)
These were captured from the prototype. The Builder shots are scaled down to fit.
- `01-builder-stages.png`: 2a flow row with Stage Settings open.
- `02-builder-overdue.png`: ⏰ When a stage is late.
- `03-builder-end-settings.png`: 🏁 Task done (notify, celebration, custom GIF, after it's done).
- `04-builder-publish-review.png`: the Publish review modal.
- `05-canvas-template.png`: the Canvas template with staff preview.
- `06-my-space-my-turn.png`: the My turn / Waiting tiles (Ali, overdue).
- `07-task-page-doer.png`: the Task page as the doer (Ali, 1 day overdue, focused on Edit).
- `08-task-page-doer-fields.png`: the doer's fields and the table (add row / column).
- `09-task-page-manager.png`: the Task page as MM (Nudge / Reassign).
- `10-pic-link.png`: the PIC tracking link view.

## Open questions
- Notification channels: in-app, WhatsApp or email, for each event type.
- Touch support for the context menus (long-press).
- Where the Task page lives in the codebase. The recommendation is the top of the existing Task Page, replacing the Map tab.
