# DESIGN.md — HOUZS Venture Portal

**Version 4.34 · 2026-10-15** — the single design doc for every screen: the portal, the Revenue app and the HR phone app. Version history: Part IV.

**The design system.** The visual source is the Claude Design project **HOUZS Venture Design System** (https://claude.ai/design/p/1fecd655-db12-4974-abf4-3d7434e41386, synced from `main` on 2026-10-13). It holds the tokens, the foundation cards, the core and view components and four templates. This file says how the code does it — which token, class or component a page uses today — and holds the rules the code enforces. Where the project and this file disagree, this file is the code's truth. Change either one on purpose, never by drift.

**How to use it**
1. Before any UI work, read Part I (the system) and Part II (the portal's rules). Then find the page you are touching in Part III.
2. A page's dated decisions and their history live in its tab's rules file (`.claude/rules/<tab>/`). This file keeps the visual spec.
3. A new decision amends its section in place and adds one line to Part IV. Never start a parallel design doc (no `DESIGN-v2.md`, `STYLE.md`, `UI-NOTES.md`).
4. Older text cites sections by name ("DESIGN.md › Sheet theme") and by version ("DESIGN.md v3.53"). The `###` headings below keep their names, and Part IV resolves every version.
5. Dated history that this file used to carry is in git: `git log -p -- docs/DESIGN.md` (v3.84 is the last long form, commit `d241acde`).

**Contents** — Part I · The design system — Part II · Portal rules — Part III · Page specs — Part IV · Version index

---

## Part I — The design system

### Two views, one system

| Theme | Who and where | In code | Feel |
|---|---|---|---|
| **HR — the ledger** (the default) | Every portal page, whatever the department (HR, Finance, the Principal, a department manager), plus the HR phone app | `:root`; the white sheet (`.sheet-theme`), HR's shell (`.hrv-shell`), `[data-hr-app]` | Formal. Black ink on white sheets, orange as a marker (never text), Newsreader page titles, mono figures, dense grid tables |
| **Revenue — the sales app** | Salespeople (Fair, IR), Team Leaders, the Principal viewing as one: the Revenue app `/member` and the CRM | `[data-revenue-app]` | Warm. Brown ink, a rust accent that is also the link colour, the income as a statement, the Arena's boards as bank cards, big rounded cards, Inter Tight headlines and amounts. Mobile-first, desktop at 1440 |

**Pick the theme first.**

| If the screen is… | Theme |
|---|---|
| Admin, HR, payroll, finance, audit, settings — anything that records money or people | HR |
| Used by salespeople: today, quotes, rankings, income, CRM, customer-facing | Revenue |
| A Principal or Director view of Revenue data on the desktop | One theme per page. Revenue content inside the HR shell is not allowed: two accents look like two products. |

The two views share one craft standard:
- one easing curve, `cubic-bezier(.2,.8,.2,1)`;
- exact values, never rounded to a grid;
- the small details that make it feel native: the soft dropdown, the sliding nav pill, sheets that animate out as well as in.

### Tokens — palette → semantic → component

```
palette     HR: --hv-* (.sheet-theme) · --hvs-* / --tone-* (.hrv-shell)       raw values; not for new screens
            Revenue: --rv-* ([data-revenue-app])
            the shell's base: --paper --ink --accent … (Walnut / Harbour, dark mode)
   ↓
semantic    --ds-* × 2 themes — globals.css › "The design system's tokens"   ← new work reads these
   ↓
components  the HR kit (components/hrv) · the sheet kit (components/sheet) · the shared tables · the Revenue app's own
```

- **Where the `--ds-*` values come from.**
  - HR's sit on `:root`. They are the sheet's own values, restated as colours. `src/lib/design-system-tokens.test.ts` holds the two equal.
  - Revenue's sit on `[data-revenue-app]`. They point at the app's `--rv-*` palette.
  - Both are light only: the sheet and the Revenue app are light in either mode.
- **`data-theme` is light/dark mode in this codebase.** The design's `data-theme="revenue"` (or `<Theme name="revenue">`) is `[data-revenue-app]` here, and HR needs no attribute. Never write a rule for `[data-theme="hr|revenue"]`; the test refuses it.
- **The Tailwind classes, one per job.** Each draws HR's value by default and the Revenue app's inside it:
  - colours: `bg-ds-accent`, `text-ds-ink-2`, `border-ds-border` …;
  - radius: `rounded-ds-control | field | card | panel | chip | row | sheet | tile`;
  - shadow: `shadow-ds-card | menu | overlay | button`;
  - type: `font-ds-body | ds-display | ds-num` and `text-ds-title | h2 | body | small | label`;
  - size and spacing: `h-ds-control(-sm | -lg)`, `px-ds-control`, `p-ds-page`, `gap-ds(-lg | -section)`;
  - motion: `ease-ds` and `duration-press | menu | dialog | fade | slide | sheet | drawer`.
  - The colours are full colours, so `/opacity` modifiers do not work on them.
- **A new semantic token goes into both theme blocks.**
- **Existing pages keep their classes** (`.ledger-table`, `.chip`, the kit). `--ds-*` is for new work and for a page being rebuilt. The design's core components are not ported as React components — Components below maps each one to what the code uses today.

### Colour

**Meaning is fixed — never reuse a colour for another meaning.**

| Tone | Means | Examples | HR | Revenue |
|---|---|---|---|---|
| success | done, active, paid, won, on target | Active · Paid · Won | ledger `21 110 78` on `222 240 232` | `#387557` on `#E8F3ED` |
| warning | needs someone's action, pending, behind | Pending · Missing details · Urgent | alert `150 100 12` on `249 238 214` | `#A46312` on `#FFF0CC` |
| danger | overdue, lost, resigned, destructive | Overdue · Lost · Remove | `176 40 34` on `250 228 224` | `#A3371A` on `#F8E1D8` |
| info | a neutral system state | Draft · Computed | `108 104 98` on `238 235 231` | `#2F6FB5` on `#E6EFF8` |
| accent | the one primary action, a selection, focus | primary button, picked row, focus ring | orange `233 154 83` (`#E99A53`) | rust `#BD4A19` |

**Rules**
- **A status is a word on a wash with its border and dot** (`.chip ledger | alert | danger | info | accent`). Never coloured words alone, never an emoji.
- **HR's accent is never lettering** — it is 2.2:1 on white. It fills primary buttons, the active tab's underline, the page head's segment, bars, rings and ticks, and anything painted orange carries black lettering. In Revenue, rust is also the link and active-nav colour.
- **One primary action and one dark object per screen.** HR's dark object is walnut `90 62 43` (the primary summary card, a person header, a toast); Revenue's is `#4E2F20`.
- **Gradients only on the Arena** (v4.2): its four boards as bank cards — `--rv-board-sales` · `-margin` · `-kpi` · `-champ` (100°, palette stops, the light ends darkened so white text passes) under `--rv-board-wave`, on the hub's cards and a board's hero. Today's income is a statement now, no card. Nowhere else.
- **The brands recur in both views** (chips, Brand weeks):

  | Brand | Ink | Wash |
  |---|---|---|
  | Akemi | `189 74 25` | `255 240 228` |
  | Ergotex | `56 117 87` | `232 243 237` |
  | Dunlopillo | `78 101 116` | `230 237 241` |
  | Zanotti | `125 91 32` | `246 237 213` |

**HR — the sheet (`.sheet-theme`) and HR's shell (`.hrv-shell`)**
- **Surfaces:** ground `243 243 241` around a white sheet; panels and filters `246 246 244`; hover `247 247 245`.
- **Lines:** hairline `229 228 223`; table frame `216 210 200`; the table's head band `235 231 224` over a `207 197 183` rule.
- **States:** row hover `255 245 233`; peach `255 244 231` for a pick or an open tab.
- **Ink:** black, with text tiers `90 78 68` / `117 100 86` / `152 142 130`.
- **HR's sidebar:** `248 245 240` behind a `229 222 211` rule. Its section tones are walnut, clay, gold, slate and olive (`--tone-*`) — light at rest, deep for the open page.

**Revenue (`[data-revenue-app]`, `--rv-*`)**
- **Ink:** `#3F2B22`, sub `#806B60`, the dark `#4E2F20`, accent `#BD4A19`.
- **Lines:** `#EBDDD2` / `#F1E7DF`.
- **Panels:** `#FBF7F3` / `#F5EBE3` and peach `#FFF0E4`.
- **Scrim:** `rgba(40,25,18,.45)`.
- Every value is the prototype's own, copied literally. Components read `var(--rv-*)`, never a hex.

**The shell around the sheet** (sidebar rail, greeting bar, the plaster behind the sheet) keeps the Walnut palette and follows light/dark mode:
- the values: Plaster `242 239 234`, Walnut `90 62 43`, Harbour `46 92 138` (the signal), chrome `222 215 202`;
- dark mode is warm charcoal on `[data-theme="dark"]`, with a toggle in the top bar and the OS setting by default.

What still binds it:
- **A surface is free, a signal is not.** The signal colour keeps 40° clear of red, amber and green — Harbour blue, never a warm accent.
- **Dark is limited by area.** No coloured rails; the one dark object is card-sized.
- **Tune a chrome step by ΔL\*, not by eye.** About 6 is needed to read as a separate surface; `222 215 202` is 8.3 from the page.
- **A scrim is the palette's own dark** — walnut at .18–.28 in HR, `rgba(40,25,18,.45)` in Revenue. Never neutral black, never a backdrop blur.

### Type

| Face | Its job | Loaded by |
|---|---|---|
| **Newsreader** (variable, `opsz`) | HR page titles — the one serif on screen; its true italic only for the sign-in page's two lines | root layout — `--font-newsreader`, italic `--font-newsreader-italic` (never preloaded) |
| **Inter** 400–700 | body text everywhere; HR's figures in sans | root — `--font-sans` |
| **Inter Tight** (variable) | the Revenue app's titles, greetings, section and sheet titles and amounts — every rule at 18px+ and weight 650+ | the Revenue app's layout only — `--font-inter-tight`, used through `--font-display-rv` |
| **Chivo Mono** 400–600 | codes, dates, counts, chips, dense table figures (chosen for its plain zero) | root — `--font-mono` |
| **Noto Sans SC** | the CJK fallback in every chain | root — `--font-cjk`, not preloaded |
| Georgia | print documents only (letterheads, statements, prints) | system |

- **`--font-display`** is Newsreader, then Georgia, then CJK.
- **`--font-display-rv`** is Inter Tight inside the Revenue app and Inter anywhere else.
- **Tailwind's `font-serif` is an alias of Inter**, not the display face. It is kept so about 40 pages need no edits. For a title use `.page-title`, `h1`, `font-display` or `font-ds-display`.
- **No Georgia on screen.** The test fails on a new one.

**HR scale**

| Role | Spec | Where |
|---|---|---|
| Page title | Newsreader 36px / 400 / −.01em, line-height 1.1–1.18; 30px under 680px | `.page-title`, `h1`, the kit's `PageHead` |
| Drawer / window title | 19 / 500 | the kit |
| Section title | 17 / 500 (legacy `.sect-head h2` 18 / 500) | the kit's `SectHead`, `.sect-head` |
| Body | 13px | |
| Small / meta | 12–12.5 / 11px | |
| Label, table head | 10.5px / 600 / .08em caps (a head band .04em) | |
| Eyebrow | 10px / 600 / .18em caps (the kit); `.page-eyebrow` 11px mono on legacy heads | |
| Summary card figure | 26–28 / 600 / −.02em; 19px when it runs past four characters | `StatCard` |
| Headline amount | Inter 26 / 500 tabular → 23 under 1000px → 21 under 680px; 18 for `.compact` | `.statement-amount` |
| Ledger figure | Chivo Mono 13.5 / 500 tabular (12px on the sheet) | `.num` |

**Revenue scale** (each size × `--rv-type`, which is .92 on a phone)

| Role | Spec |
|---|---|
| Hero amount | Inter Tight 36 / 750 / −.03em, tabular |
| Page title, greeting | Inter Tight 28 / 700 / −.03em |
| Sheet title | Inter Tight 20 / 700 / −.02em |
| Section title | Inter Tight 18 / 650 / −.02em |
| Row title | Inter 14.5 / 650 (16 / 650 for a workspace row) |
| Body, meta, tab label | Inter 14 / 12.5 / 11 |

**Rules**
- **Sentence case everywhere.** Uppercase only for eyebrows, table heads and small labels.
- **Codes, NRIC and dates in a table are mono.** Money is tabular and right-aligned.
- **Nothing below 11px**, except mono chips (10.5) and the kit's eyebrow (10).
- **HR's weights stay low.** Tailwind `font-medium` and `font-semibold` are 500, `font-bold` is 600, and money is never 700.
- **Form inputs are 16px below 768px** (Part II › Responsive).

### Spacing, radius, shadows

**Spacing**
- The values are exact, not a 4/8 grid: what the prototypes draw (2 4 6 8 9 10 12 14 16 18 20 22 24).
- The gaps by token:
  - `gap-ds` 12;
  - `gap-ds-lg` — HR 20, Revenue 24;
  - `gap-ds-section` — HR 28, Revenue 24.
- **HR** — the sidebar is 248px (64 folded; 212 from v4.3 to v4.34, which Finance's view keeps) and the greeting bar 60px. The sheet sits 10px in from the frame, padded 24px — 20 under 1000px, 18 × 12 on a phone; Finance's view pads it 24 / 28 / 48 (v4.3). Summary cards stand 9px apart.
- **Revenue** — a 20px side gutter, 24px between sections, hit targets of 44px or more, and a 62px bottom nav with a raised 58px Quote button. The 1440 desktop is a 240 sidebar, a 760 column and a 400 panel.

**Radius — named, each with a job. Round the container, never the rows**: a table lives in a rounded well and every row inside stays square, because rounded rows break the column the eye scans.

| HR job | px | Tailwind | Revenue job | px |
|---|---|---|---|---|
| control (input, button) | 6 | `rounded-control`, `rounded-ds-control` | control, input | 14 |
| the default | 8 | `rounded-md` | row, tile | 12 (list rows 18) |
| field (the soft dropdown) | 10 | `rounded-lg`, `rounded-ds-field` | field | 14 |
| card, table well | 12 | `rounded-card` | card | 18 |
| panel, modal, the sheet | 16 | `rounded-panel` | hero, panel | 24 |
| chip, pill | 999 | `rounded-full` | chip / capsule | 17–20 / 23 |
| | | | a sheet's top | 22–26 |

**Shadows are warm and low; hairlines carry structure.**

| | HR | Revenue |
|---|---|---|
| Card | `0 3px 12px rgb(90 62 43 / 5.5%)` | `0 4px 14px rgba(63,43,34,.06)` |
| Menu | `0 8px 24px rgb(51 36 27 / .12)` | — |
| The soft dropdown | `0 14px 36px rgba(43,31,23,.18), 0 2px 6px rgba(43,31,23,.06)` | — |
| Window | `0 20px 60px rgb(43 31 23 / .25)` | — |
| Drawer | `-12px 0 32px rgb(43 31 23 / .12)` | — |
| Primary button | — | `0 3px 9px rgba(189,74,25,.18)` |
| Hero | — | `0 12px 26px rgba(189,74,25,.3)` |
| Sheet | — | `0 -10px 30px rgba(63,43,34,.16)` |

No coloured shadow other than the Revenue accent's.

### Motion

- **One curve:** `cubic-bezier(.2,.8,.2,1)` (`--ds-ease`, `ease-ds`).
- **Durations by job:** 120 press / hover · 150 toggle · 160 menu · 200 dialog · 240 backdrop · 280 segment / tab underline · 320 sheet · 340 drawer.
- **What enters also exits** — sheets, drawers, toasts.
- **A moving indicator slides, never jumps** — the sidebar pill, a segment's thumb, a tab's underline.
- **HR's hover is a colour step, never a lift.** Revenue is touch-first and has no hover.
- **Forbidden:** bounce, spring overshoot, parallax, scroll-linked or decorative motion.
- **`prefers-reduced-motion` switches it all off.**
- Navigation feedback keeps its own timings (Part II).

### Iconography

- **Inline SVG strokes** in `currentColor` with round caps. No icon font, no PNG icons, no emoji.
  - **HR's kit** — `components/hrv/icons.tsx`: `NavIcon` is 16px at stroke 1.5 inside a 28px tone tile; `CardIcon` is 15px at 1.6 inside a 27px tile.
  - **The sheet** — `SheetIcon`, the summary cards' line icons.
  - **The Revenue app** — its own set: 24px, stroke 1.65 inactive and 2 active.
  - **A new glyph** — Lucide at the matching stroke is the closest match (say so in the PR). `lucide-react` is not installed.
- **Unicode as glyphs:** `›` row chevrons, `▾` / `▼` folds, `✓` picked, `×` close, `●` the toast dot, `−` / `+` steppers.
- **The mark is the H tile** — the app icons in `public/` (a rust tile, a cream H) and the walnut H in HR's sidebar. Wordmarks are set in type: HOUZS VENTURE at 700 / .14em.

### Copy

- **Plain, factual English**, written like a careful office manager, in sentence case ("Invite user", "Save October brand weeks").
- **Uppercase only as a typographic device:** eyebrows (PEOPLE · MANAGEMENT), small section labels, wordmarks, table head bands.
- **The middle dot `·` joins facts:** "Sat, 3 Oct · Senior Executive · Rank B".
- **The app speaks to *you*** ("Your workspace", "Hello, Jia Hui"), and the greeting bar is formal ("Good afternoon, Principal.").
  - No "I".
  - No exclamation marks — the one exception is "Congratulations on your sale!".
- **A state says what to do:** "Replacement needs info — HR returned it", "Read-only while viewing as", "Nobody matches the current filter."
- **An error gives the fix:** "Enter an NRIC like 900101-14-5566".
- **No emoji, no marketing words** (unlock, empower, boost).
- **Portal pages carry no descriptions at all** — Part II › No descriptions on the page.

### Money format

| Context | Format | Face |
|---|---|---|
| Tables, detail views | `RM 100,000.00` | Chivo Mono tabular (`.num`) |
| Headline amount | `RM 12,847,203.55` | Inter tabular (`.statement-amount`); a summary card's figure in its own face |
| Revenue amounts | `RM 6,842.50` | Inter Tight tabular |
| Negative (contra) | `(1,234.56)` in red | `.num.neg` / `<span className="neg">` |

`formatMoney()` / `formatMoneyBare()` (`lib/utils.ts`) write every amount — never format one by hand.

### Date format

| Context | Format | Face |
|---|---|---|
| Display | `Wed 9 Apr 2026`, `2 Sep 2026` | the body face |
| Meta, tables | `9 Apr 2026`, `Wed 09:42` | Chivo Mono |
| Form input | ISO `2026-04-09` | mono |
| Period | `April 2026`; a quarter `Q4 2026` | the body face |

- **A month is always three letters** — *Sep*, never *Sept*.
  - `formatDate()` (dayjs) writes it so.
  - An `Intl` format goes through `formatIntlDate()` (`lib/utils.ts`), because en-GB and en-MY spell September *Sept*.
- **Today and this month are the office's (UTC+8):** `officeToday()` / `officeMonth()` (`lib/office-time.ts`).

### Bilingual canonical labels

| English | 中文 |
|---|---|
| Internal ledger | 内部账册 |
| Overview | 综览 |
| Fund IN | 资金流入 |
| Fund OUT | 资金借出 |
| Statements | 对账单 |
| Dept Pool | 部门账户 |
| Director Salary | 董事薪水 |
| HR Costing | 人事成本 |
| Reports | 报表 |
| Settings | 设定 |
| Approve / Review | 批准 / 审核 |
| overdue | 逾期 |

### Components — which for which job

| Need | Design system | In code today |
|---|---|---|
| Any action | `Button` | primary `.btn-pri-sheet` (orange, black lettering); quiet `.btn-quiet-sheet`; the kit's `btn` on HR's pages; the Revenue app's own buttons |
| An icon-only action | `IconButton` with a label | a `<button aria-label>` holding a kit icon |
| Pick 1 of 2–3 | `RadioGroup` (in a form) / `SegmentedControl` (a view switch) | `.choice` chips; the Revenue app's segmented control (Track) |
| Pick 1 of 4+ | `Select` — the soft dropdown | `components/hrv/select.tsx` `Select` (Part II › **The soft dropdown**). A bare `<select>` fails `soft-select-coverage.test.ts` on HR's pages |
| On/off, applies now | `Switch` | the kit's `Toggle` (28×16) |
| On/off, saved with a form | `Checkbox` | a native checkbox in the accent |
| Different sub-pages | `Tabs` — a rail on HR's desktop, an underline in Revenue and on a phone | the kit's `Tabs` (+ `useTabParam`); `SlidingTabs` (`components/motion`); `.sheet-tabs` |
| A desktop list of records | `DataTable` (+ `Pagination` past 20) | `.ledger-table`, `SortableTable`, the kit's `GridTable` / `GridHead` / `GridRow` |
| A list on a phone | `ListItem` | the fold (`LedgerRow`, `SortableTable`) in the portal; the app's own rows |
| A record's detail on the desktop | `Sheet placement="right"` | the kit's `Drawer` (400–600px) or `Window`; a page of its own when it needs more than a screen |
| A choice or short flow on a phone | `Sheet placement="bottom"` | the Revenue app's `Sheet` (`components/member/app/Sheet.tsx`) |
| Confirm a destructive step | `Dialog` with `danger-solid` | the kit's `Window` with a solid red confirm, or an inline Keep · Delete — never `confirm()` |
| "It worked" | `Toast`, 2.2s | the kit's `flash()` and `ToastHost` |
| A message that stays on the page | `Banner` | `.sheet-warning` / `.sheet-danger` / `.sheet-notice` — only an error or a warning with its fix (Part II) |
| Nothing to show | `EmptyState` | the table's own empty row (the kit's `GridEmpty`, a `.ledger-table` row) saying what to do |
| Loading | `Skeleton` matching the layout | `RouteSkeleton` on navigation; `.skeleton` bars inside a page |
| A record's state | `StatusChip` | `.chip`, the kit's `Chip` |
| A count | `Badge` | a boxed tab count, `.sheet-count` |
| Summary figures | a row of 3–5 `StatCard`s | `StatCards` / `StatCard` (`components/sheet/StatCard.tsx`); the kit's `Cards` / `Card` |
| A page's title | `PageHeader` | `.page-head`, or the kit's `PageHead` on HR's pages |
| A section | `Section` | `.sect-head`, the kit's `SectHead` |
| Label / value facts | `DescriptionList` | `DetailGroups` (Finance), the kit's `Facts` |
| A row's menu | — | `RowMenu`, `row-links` — one line a row; a reason in its `title=` |

**The shells stay view-specific**
- **HR:** `HrSidebar`, `HrTopBar` (`components/layout`).
- **Other portal views:** `Sidebar`, `TopBar`, `BottomTabBar`, `MoreSheet`; `PortalFrame` picks which.
- **The Revenue app:** the header capsule, the bottom nav with the raised Quote, the desktop aside, the View-as bar, the income hero, the board tiles.

**Not built yet.** The design system has these and the code does not; each one is its own decision.
- The core components as React components themed by `--ds-*`: `Button`, `Select`, `DataTable`, `Dialog`, `Sheet`, `Toast` …
- The Revenue hero's gloss and 1px inner edge, the Profile header's glow wash, and the Arena tiles' 12% watermark.
- The press scale (`.97` over 120ms) on Revenue buttons, tiles and sheet options, and the dimming on its list rows.
- The amounts' font features `"tnum","cv01","cv11"` (declared as `--ds-num-features`).
- The four templates as code. Their code twins are below.

### Templates

| The project's template | Start a new screen from |
|---|---|
| List page | `hr-costing/page.tsx` — summary cards, a ledger table with `tfoot`, status chips |
| Form page | `team/people/new` — the kit's head, cards of fields, the footer with the refusal and one primary |
| Dashboard (desktop) | `/dashboard` — the role's Overview |
| Mobile tab page (Revenue) | the Revenue app's Today (`components/member/app/today`) |

### Don't

- **No gradients** except the Arena's bank cards (v4.2). No purple, violet or indigo anywhere.
- **No decoration for its own sake:** no blobs, floating circles, wavy dividers or illustrations — the sign-in page's art is the one illustration.
- **No emoji as design elements.** No three-column feature grids of icons in coloured circles. Don't centre everything. Don't put the same `rounded-xl` on every element.
- **One of each:** no second primary button on a screen, no second dark object.
- **No hover lift, no shadow + border combo** on a data surface.
- **No coloured words standing in for a status**, and no description lines on a portal page.
- **No Georgia on screen, no hex outside `globals.css`** (the Revenue palette lives there too), and no generic marketing copy.

---

## Part II — Portal rules

### No descriptions on the page (v3.75, 2026-10-12) — overrides every subtitle, lede and hint described below

A page says what it is with its eyebrow and title, a section with its heading, a tab with its label and a menu row with its words. Never a sentence under them that explains what the page or section is, how a tab works, what a rule means, why the screen looks as it does, or where to click (user 2026-10-12: "this cause the view too messy"). This holds on every portal page and in every view. The phone apps were not part of it.

What goes:
- **Page subtitles** — `PageHead subtitle`, `.page-sub`, a sentence under `.page-title`. A subtitle stays only when it is live data (*Signed in as …*, a voucher's own description, *{borrower} · {bank}*).
- **Section, panel and tab ledes** — the line under a section heading or a tab rail (`.subtitle`, `.sheet-subtitle`, a report card's one-line description).
- **Explanatory notices** — a box or paragraph explaining a rule, a setting's effect or a method.
  - If the notice was the only place a CURRENT STATE showed, it becomes a 2–4 word chip beside what it concerns (*Payout off this month*, *Unpaid as of today*, *Segment only · won't balance*).
  - If the state shows elsewhere (a status bar, a chip, a disabled button), the sentence simply goes.
- **Usage hints** — *Right-click a row to remove it.*, *Double-click to open · right-click for more*. The behaviour stays; only the words go.
- **A menu row's second line** — one line a row in every menu (`RowMenu`, `row-links`, the payroll row menu).
  - What the second line said — why a row is shut, who holds a bill — becomes the row's `title=` tooltip.
  - A disabled row must still take the hover so that tooltip shows.

What stays:
- errors, and warnings that name a problem to fix (with its link or list);
- empty states;
- figures, dates, counts, chips, statuses and a stat card's short note;
- a row's own note on why it differs (*Moved from ADRIAN*);
- everything inside a window, drawer, panel or form a click opens — those sentences say what a write will do;
- PDFs, CSVs and print — they are documents, not the view.

A new page, or a prototype that brings a description, leaves it out. `src/lib/no-page-descriptions.test.ts` enforces this.

### Sheet theme — the portal's new tone, HR's view first (v3.9–v3.10, 2026-09-27)

**Every portal page sits on the sheet.** `lib/sheet-routes.ts` lists the prefixes. HR's pages moved first (v3.9–v3.10), then Finance's (v3.12). The Product List left the portal for the Revenue app on 2026-10-08.

**What it is**
- **The frame.** PortalFrame insets the content column 10px around ONE white sheet: `.sheet-frame` › `.sheet`, 16px radius, hairline border, 24px padding.
  - The sheet stays put while one of these pages replaces another, and the loading skeleton lands on it too.
  - The shell around it — sidebar rail, greeting bar, plaster — keeps the Walnut palette and follows light/dark mode.
- **Inside**, `.sheet-theme` declares the tokens of Comm Cal's month:
  - **Lettering is black.** `--ink`, `--num-ink`, `--graphite` and `--muted` are all `0 0 0`. Hierarchy comes from size, weight and surfaces. `em` and `.italic` stand upright.
  - **Orange `#E99A53` is a surface, never lettering.** It paints primary buttons, the active tab's 3px underline over a peach wash (`--accent-bg` `#FFF4E7`), the page head's rule, the eyebrow numeral and checkbox ticks.
    - `text-accent` renders black (links underline), and `hover:text-accent` underlines.
    - Anything painted orange carries black lettering, even where the markup says `text-white`.
  - **Walnut is the one dark object.** It is the page's primary summary card (`tone="primary"`), a salesperson's or statement's person header, and dark popovers (`bg-ink` renders walnut on the sheet).
  - **Semantics keep their meaning and their light values in both themes.** A status is a word on a wash (`.chip …` with its dot).
  - **The sheet is light in both themes.** Components with their own palettes — `.org-canvas`, `.pay-board`, `.hero-walnut` — stay at their light values on it.

**How a page is built on it** (references: `hr-costing/page.tsx`, `hr-costing/payroll/[period]/page.tsx`, Comm Cal's month)

1. **The head:** `.page-head` (eyebrow `<em>I.</em> SECTION · PAGE`, the Newsreader title), or the kit's `PageHead` on HR's pages. On the sheet the rule is orange and the eyebrow 10px.
2. **Summary cards** (`components/sheet/StatCard.tsx`) replace a hero, a figure strip or tiles.
   - The shape: `<StatCards label>` holding `<StatCard label value icon note tone href?>` — a short bar, the label in small caps, the figure, a note, and a `SheetIcon` at the foot.
   - Exactly one `primary` per row: the figure the page is opened for. `danger` / `alert` only while the problem holds.
   - A month that was shown as a hero moves into the eyebrow or title, and its status line becomes the primary card's note.
3. **Sections:** `.sect-head` (17px / 600 title over the rule and a mono count) or `.sheet-heading`. A `.sheet-subtitle` only for live status or data, never a description.
4. **Tables.** Every `.ledger-table` becomes the month's table automatically:
   - a framed well (`216 210 200`, 10px radius);
   - an uppercase 10px / 600 head band (`235 231 224` over `207 197 183`);
   - white / `#F7F7F5` zebra rows, a peach hover, 12px text with 12px `.num`;
   - a peach `<tfoot>` — put a closing total there.

   Around them:
   - `.table-frame` › `.table-frame-scroll` + `.table-frame-foot` when a table needs the footer strip.
   - Rows grouped under a label that does not fold sit under a band row: `<tr className="band-row"><td colSpan={n}>Finance <span className="count">4 titles</span></td></tr>`.
   - The payroll grid keeps its own geometry.
5. **Tabs:** `SlidingTabs` draws the month's tabs by itself (a tinted, underlined pick, with counts in boxed badges). A hand-built rail uses `.sheet-tabs` with `aria-selected` / `aria-current` and `.sheet-count`.
6. **Toolbars and callouts:** `.sheet-toolbar` for a search or filter panel. Callouts are `.sheet-warning` (amber) / `.sheet-danger` (red) / `.sheet-notice` (peach), within the no-descriptions rule. A salesperson's payslip or statement opens on the walnut person header (`.hero-walnut`, 12px radius on the sheet).
7. **Overlays portalled to `<body>`** (PaycheckWindow, the commission editor, the hierarchy's Move popover and context menu) carry `sheet-theme` on their portal root, because they render outside the sheet.

Every sheet override in `globals.css` is written `:where(.sheet-theme) <base selector>`, so it has exactly the specificity of the rule it replaces. Never add a sheet rule with more weight than its base.

**The Finance view (2026-10-09)** applies to Finance's pages only — the routes in `lib/finance-view.ts`, as Finance or the Principal sees them. HR's and a department manager's pages keep the sheet as above.
- **How it hangs.** PortalFrame puts `.fin-view` on the sheet frame and `FinViewProvider` around the shell. Everything the view changes hangs off those two (`globals.css` › "THE FINANCE VIEW").
- **Cards.** A card's figure is in the number face and coloured by meaning: ledger green for money in, danger red for money out, blue `wait` for anything waiting on someone, walnut for the page's one figure. Its label is in sentence case.
- **Chips** are in the body face; pending is blue.
- **Tables** wear a navy band (`#E2E7EF` / `#1D2B4A`) over white rows with no zebra. They offer a Range mode on amount and date columns (`range`), a 620px scroll box with a sticky header (`scrollBox`), and neighbour resizing (`resizeMode`).
- **Rows.** The row menu reads Open / Open in new tab, and a list keeps its scroll on Back.
- **On a phone** the top bar is cream with the H tile and the page's name, the lit tab sits on a peach pill, and a detail page goes back on an edge swipe.
- **The head's menus and the page's parts:**
  - the page head's menus are the kit's dialog menus (`FinDialog` + `DialogMenu`) — Invoice's *Create invoice ▾*, *Payroll ▾*, *Export ▾* since v4.17;
  - a page's facts sit in `DetailGroups` (banded group cards of label / value rows);
  - its actions sit in a `.fin-actions` panel.
- **The sheet keeps one accent for every department:** orange, chosen over Harbour blue for Finance (user 2026-10-07).

### The HR revamp — HR's view and its kit (v3.19, 2026-10-10)

The source is the Claude Design handoff *Sidebar design revamp from HR* (`.design/hr-revamp/handoff`; variant A). The `.dc.html` wins over its README, and every value is the prototype's. The `.design/hr-*` handoffs are kept on the office PC outside git (`.git/info/exclude`). Measurements: `HrSidebar.module.css`, `HrTopBar.module.css`, `hrv.module.css`.

**HR's shell** — `lib/hr-view.ts` decides who gets it: the hr role, and the Principal viewing as HR. Every other view keeps its own shell. `.hrv-shell`:
- **The sidebar** (`HrSidebar` over the shared `ViewSidebar`, 248 ↔ 64px since v4.34 — the Attendance handoff's; Finance's view keeps the 212 of v4.3) is square, full height and flush. Its brand is the walnut **H**, *HOUZS Venture* and *Internal ledger* — English only, in both views, as both prototypes draw it (v4.48). Its icon tiles sit in toned sections (`components/layout/hr-nav.ts`): Overview · I. HIRING (clay) · II. HR & PAYROLL (clay) · III. REVENUE (slate) · IV. PEOPLE (olive) · V. ADMIN (walnut) · VI. DIRECTORS (gold).
  - One peach pill with a 3px orange bar **slides** to the row clicked: `top .34s` on the curve, measured from the row's `offsetTop`.
  - The open row's tile swaps light / deep and grows to 1.06.
  - The walnut **H** folds the rail; the words fade where they stand. A cookie, `vp-hr-nav`, makes it draw folded.
- **The greeting bar** (`HrTopBar`, 60px) is white. For an account that may switch views, its "HR view" words ARE the switcher.
- **The sheet** is the `<main>` and scrolls inside a 10px frame (`.hrv-frame`, `data-hrv-overlay`). Its rounded foot is always in view, and drawers, windows and the toast cover the sheet only.
- **On a phone** the frame runs on under the 54px tab bar. Drawers, windows and the toast stay inside the room above it (plus `var(--safe-bottom)`).

**The kit** (`components/hrv/`; colours are the `--hv-*` tokens on `.sheet-theme`):

| Piece | What it is |
|---|---|
| `PageHead` | eyebrow behind a 2×10 orange bar (no roman numeral), the Newsreader title, the 64px orange segment; `bare` when tabs sit right under it |
| `Tabs` | open tab peach with an inset orange underline, so the label never moves; boxed counts; `useTabParam` |
| `Cards` / `Card` | summary cards |
| `Chip` | a mono word with its dot on a wash |
| `GridTable` / `GridHead` / `GridRow` | the prototype's tables are CSS grids: framed well, caps head band, square rows, zebra, peach pick |
| `Drawer` | right drawer, 400–600px |
| `Window` | centred window |
| `flash()` / `ToastHost` | one-line walnut toast with an orange ●, 2.2s; a new one replaces the old |
| `Toggle` | 28×16, applies at once |
| `Facts`, `HistoryEvent`, `SectHead`, `SecLabel`, `CloseButton` | label/value facts, history dots, section heads, the × |
| the peach save bar | sticks to the sheet's foot while there are edits |

- **Esc** closes the overlay on top.
- **Armed confirm** (throughout HR's pages). A destructive button sits as danger text on white. Its first press arms it — it reads *Confirm …* on `--hv-danger-bg` — and only the second press does it.

**Tailwind moves the prototype's boxes, so the kit puts them back.**
- A revamped page is `line-height: normal`; preflight's 1.5 makes every row taller.
- A box the prototype sizes with padding or a border is `box-sizing: content-box` (the sidebar, menus, drawers, small dialogs).

**Revenue's pages pick their sub-department on their own head** (`SubDeptSwitcher`, top right; v3.41). Fair | IR left every sidebar.
- One 36px line: "Sub-department" · the name · a chevron that turns over.
- Its menu is as wide as the button (≥ 220px). The open row is peach with a ✓, and "+ New sub-department" comes last, in clay.

**Measure, don't eyeball.** A measuring script finds each element by its text on both the prototype and the page and diffs computed font, colour, size, padding, border, radius and background. `.design/revenue-app/tools/measure-pl.mjs` is the pattern.

### The HR revamp, round 2 — the kit's additions (v3.30, 2026-10-11)

The second package (`.design/hr-r2/handoff`, README §10–18; the file wins) adds Documentation, Hiring, Meeting Rooms, the Guest link and the HR phone app (Part III). Every page of it shares two things.

**The soft dropdown** (`components/hrv/select.tsx` `Select` + `select.module.css`; the handoff's `dropdown.js`; measurements in the module). The real `<select>` stays — its value, `onChange` and keyboard — and is drawn over.
- **The field:** radius 10 (12 on the guest page), its own chevron, a hover border. Focus is the accent border with a `0 0 0 3px rgb(233 154 83 / .18)` ring, `!important` so the portal's .12 glow does not cover it.
- **The menu.** A pointer press opens it instead of the browser's.
  - It is fixed to the window: white, radius 14, the double soft-dropdown shadow (Part I), as wide as the field — wider only when an option would be cut.
  - The picked row is peach with clay type and a ✓, and the blank option is grey.
  - A search box appears over more than eight options.
  - An `<optgroup>`'s label heads its options in quiet caps.
- **Where it opens:** 6px below the field, or above it when the whole menu does not fit below and there is more room above; the list is sized to that side. It enters with `hvddIn .16s` (a fade and a 4px drop).
- **Leaving portal rules alone.** The menu carries `data-soft-menu`, so the portal's own field rules (the blue focus glow, the phone's 44px floor) leave it as drawn. They leave the Revenue app, the HR app and the guest page (`data-guest-page`) the same way.
- **Closing and keys.** It closes on a pick, a press outside, Esc (the menu only — a drawer under it stays), a resize or a scroll. Arrow keys and Enter work inside it.
- **On a touch screen** (`pointer: coarse`, v3.58):
  - the search box waits for a tap instead of taking focus on open, so the keyboard does not resize the menu shut;
  - a resize or a scroll moves the menu with its field, inside what the keyboard leaves showing (the visual viewport);
  - it closes only once the field has left the screen.
- **Every select on HR's pages is one** (v3.42). `soft-select-coverage.test.ts` fails on a bare `<select>`.
  - `bare` keeps the page's own field box, with the soft field's radius, chevron and ring over it.
  - `plain` keeps the field exactly as drawn and swaps only the menu — for selects the prototype draws as something else: the Members grid's 6px boxes with a ▾, Scheme rules' quiet values, Brand weeks' "Revenue · Fair" chip, the top bar's "HR view" words.
- **Popovers.** A popover that closes on a press or a scroll outside itself asks `inSoftMenu(target)` first, because the menu lives on `<body>`.

**Motion** (README 18.2):
- every right drawer slides in 40px and fades (`hvDrawerIn .34s cubic-bezier(.2,.8,.2,1)`), and its scrim fades in over `.25s`;
- a centred window fades in over `.2s`;
- the kit's `Drawer` and `Window` do both. Reduced motion turns them off.

### Tabbed pages — the rail on the header's rule

- **The kit's `Tabs`** is how HR's pages tab — about 50 files, plus `useTabParam`. `SlidingTabs` (`components/motion`) is the older rail: Settings (the Billing Allocator left it for its hub, v4.23). `.page-head.tabbed` (a rail standing on the head's rule) still has its CSS, but no page uses it today.
- **The open tab is `?tab=<key>`**, so a link can open a page on a section.
  - Push it with the browser's own history (`window.history.pushState(null, '', '?tab=…')`). Next syncs `useSearchParams` from that without a server round trip.
  - Read the key from `useSearchParams()` and render the one section.
  - A tab may carry a small mono count (`TabItem.count`).
- **A rail in the middle of a page is the section's heading.** Its labels are the titles those panels would have carried, so each panel drops its own heading — two titles for one thing is what to avoid.
- **Render every panel on the server** and hand them to the client rail as nodes (`openBill={<Panel … />}`) rather than making the rail fetch. Server-built children handed over as a list need their own `key`s.
- **Tabs are for the sections of one view.** Choosing between views of a thing (Comm Cal / Sales Groups / Rules of a sub-department, the People pages) is navigation, and it lives in the sidebar.

### Navigation feedback (v3.8, 2026-09-26 — every page)

A click is answered before the page it opens has arrived. The portal renders on the server, so it answers in four steps:

| # | What the reader sees | When | Where |
|---|---|---|---|
| 1 | **The row lights up** — the sidebar row (or phone tab) takes the accent, its marker grows out of the dot, and a light sweeps across it | the frame of the click, until the page commits | `NavRow` / `PendingSweep` (`Sidebar.tsx`), `TabFace` (`BottomTabBar.tsx`), `WarmLink` inside a page — all reading next/link's `useLinkStatus()`; `.nav-row-pending`, `.nav-marker-grow`, `.nav-tab-grow`, `.warm-link-pending` |
| 2 | **The skeleton of the page that is coming** — ledger, record, form or chart, picked from the path. Its header and section heads are the real `.page-head` / `.sect-head`; one shimmer pinned to the viewport sweeps every bar together | ~20 ms after the click, until the content streams in | `RouteSkeleton` (every `loading.tsx` renders it), `lib/route-skeleton.ts`; `.route-skeleton .skeleton` |
| 3 | **The progress line** — 2px of accent along the top edge with a glowing head. It leaps to ~20% in 200 ms, is past half by 0.7 s, crawls toward 92%, then runs out and fades when the page lands. Hidden for its first 120 ms | while a navigation has not committed, or a skeleton is on screen | `NavProgress` (root layout), `lib/nav-progress.ts`, started by `src/instrumentation-client.ts`; `.nav-progress` |
| 4 | **The page settles in** — it rises 6px in 220 ms and its first blocks fade in 45 ms apart, header first | whenever a page lands under `.route-surface` | `route-in` / `route-fade` |

A navigation that keeps its page on screen (a `?tab=` switch, a link nothing had prefetched) dims the page being left to 60% after 150 ms (`html[data-nav-pending] .route-surface`).

- **Every route folder with child routes has a `loading.tsx` that renders `RouteSkeleton`.** Next commits a navigation at once only when the changing part of the tree sits under a loading boundary of its own — the one in the deepest folder the two URLs share. `src/app/route-boundaries.test.ts` fails when a folder lacks one.
- **A page already in memory opens with no skeleton at all.** That means a page visited in the last five minutes (`staleTimes.dynamic`), one warmed because the pointer rested 120 ms on its link, or one of the person's usual pages warmed while the portal sat idle (`lib/nav-warm.ts` — one link at a time, three at most, never a page that writes the audit log as it renders).
  - A page shown from memory reads itself again the moment it lands (`RouteFreshener`, `lib/route-freshen.ts`): no skeleton, no dimming, no line. The figures that moved swap in where they stand.
  - Inside a page the same warm is `WarmLink`.
- **Motion here is feedback, never decoration.** Under reduced motion the line appears without travelling and everything else lands at its end state.

### Update prompt (2026-10-06 — every surface)

**The pill.** When a release lands while the portal or an app is open, an ink pill drops in at the top centre (`calc(safe-area-top + 10px)`, `z-index: 90`): **A new version is ready.** · **Update** · **×**.
- **Update** reloads. **×** hides the pill until the app next comes back to the screen.
- The pill is `--ink` with `--paper` text, and Update is the pill turned inside out, so dark mode inverts it for free.
- It drops 8px and fades in over 220 ms. It has `role="status"` and is never printed.

**When it shows** (`components/pwa/UpdatePrompt.tsx`, `lib/app-update.ts`). The app asks which build is live on load, on every return to the screen, when the network comes back, and every five minutes in view — a HEAD to `/sw.js`, whose `X-App-Version` is the build's name.
- **It never reloads by itself while somebody is looking.**
- **The Revenue app** reloads by itself only when it comes back after 30+ minutes away — and not if the focus was in a field or something was typed in the ten minutes before leaving. Then it only offers.
- **The portal is only ever offered the new build.** A page like HR › Payroll holds edits until *Save all*.
- **A page that guards unsaved changes** (`beforeunload`) still asks before any reload.

### The phone's own navigation bar (2026-10-10 — every bottom bar)

**Pad by `var(--safe-bottom)`, never the bare `env(safe-area-inset-bottom)`.** This applies to every bar at the bottom of the screen and to whatever pads itself clear of one: the Revenue app's nav, the portal's tab bar, the HR app's tabs, `PortalFrame`'s scroll area, `MoreSheet`, `.sheet-frame`, Finance's `.bulk-bar`, the sign-in footer.
- **Why:** after a reload, Chrome on a phone with three-button navigation can report an inset of 0 while still drawing the page under those buttons.
- **What `--safe-bottom` is:** the larger of the browser's inset and the one the tab remembers in the same window (`lib/safe-area.ts`, `components/pwa/SafeAreaMemory.tsx`, set before the first paint by the root layout's head script).
- A non-zero inset from the browser is believed again at once, a later 0 included — a keyboard is real.
- `src/lib/safe-area.test.ts` fails on a new bare inset.

**Sheets that reach the screen's bottom edge** carry a transparent bottom border of `--sheet-safe` (shell.module.css `.screen`). That covers every Revenue app sheet, *Add to quote* and its bed-frame picker, Notifications and View as.
- The sheet's white runs on under the phone's bar and its contents stay above it.
- It adds only what the sheet's own drawn bottom padding does not cover: `--safe-bottom − 30px` on an iPhone, `− 6px` on Android.
- The border comes out of the drawn height, so the sheet keeps its height.

**Tucked away while reading on** (v3.55; the bar shows on entering, v3.57). The three bottom bars slide away once a page is scrolled down by more than 24px. They come back on a 24px scroll up, near the top (under 48px), or on another page — 0.26s on the curve, nothing under reduced motion.
- **Entering a page or returning to the app shows the bar.** The HR app opens every page at its top, and Back returns to where it was left.
- **It never tucks** while the More sheet is open or for a scroll inside a sheet, drawer or sliding page. A tucked bar is `inert`.
- **What it gives back.** An in-flow bar gives back its height but for `--safe-bottom`.
  - What sat on it comes down onto that strip: the Quote and Set-price docks, the HR app's Acknowledge bar.
  - On the portal it comes down through `--tabbar-h` (54px; 0 under `html[data-tabbar-tucked]`).
- **A page too short to scroll back up never tucks the bar.**
- Code: `components/pwa/tuck.ts`, `tuck.module.css`.

**The frame is the screen, never `100dvh`** (v3.68). In the installed app, Chrome's bottom chin made 100dvh a whole bar taller than the visible screen. The phone apps' frames are therefore `position: fixed; inset: 0`: the HR app's `.app` and its ground, and the Revenue app's `.screenLive`. A fixed box ends where the screen does, and the document holds nothing that can scroll. The HR app's sheets take 86% of that box. Test: `src/lib/safe-area.test.ts` › *the phone apps fill the screen they are shown on*.

### Responsive (mobile shipped 2026-08-31)

Desktop is the primary target, but the whole portal works on a phone. `md` (768px) is the one line that matters: above it nothing changes from the desktop design, and below it the shell and the tables reshape. The tablet range (768–1024) keeps the desktop shell with every column.

#### Navigation

- **Below `md` the sidebar rail is not rendered.** Navigation is `BottomTabBar` — four destinations per role plus **更多**, which opens `MoreSheet` with the full nav grouped as the sidebar groups it.
- **`components/layout/nav-config.ts` holds the tabs** (`TABS_BY_ROLE`) and `navEntries`, so the sidebar, the tab bar and the sheet cannot drift. The Approvals tab carries a pending-count badge.
- **The bar is 54px plus `var(--safe-bottom)`.** The root layout sets `viewportFit: 'cover'`.

#### Tables — the fold

Below `md` a table keeps only the columns that identify a row and folds the rest into a per-row panel behind a chevron.

**`SortableTable`** derives the split from its column config:
- `mobile: 'keep'` pins a column;
- `mobile: 'drop'` removes it;
- with neither declared, it keeps the first column plus the first right-aligned (amount) column.

**Hand-rolled tables** use `<LedgerRow>` (`components/LedgerRow.tsx`) and two annotations, leaving the desktop markup untouched:

```tsx
<table className="ledger-table">
  <thead>
    <tr>
      <th>Voucher</th>
      <th className="m-hide">Date</th>
      <th className="num">Amount</th>
      <th className="lt-toggle" aria-hidden />   {/* required */}
    </tr>
  </thead>
  <tbody>
    <LedgerRow>
      <td>{v.voucher_no}</td>
      <td className="m-hide" data-label="Date">{date}</td>
      <td className="num">{formatMoney(v.amount)}</td>
    </LedgerRow>
  </tbody>
</table>
```

- **`.m-hide`** moves a column into the panel, titled by its `data-label`. It also works on a whole `<tr>`.
- **`<th className="lt-toggle" aria-hidden />` is not optional.** Without it the head band stops short of the chevron column and leaves a notch that CSS cannot close.
- **A plain total row** needs `<td className="lt-toggle" />` as its last cell.

Four kinds of table keep every column instead:
1. **A form spans the whole row.** Check this first: it is the one case that corrupts data.
   - The panel renders each folded cell a second time, so a cell holding a named input makes two fields with the same `name`. `FormData` then returns the hidden stale copy.
   - `RowForm` (`components/RowForm.tsx`, the `<form>` portalled to `<body>`, fields joined by the `form` attribute) keeps the `<form>` legal, but does NOT make such a row foldable.
   - A `<form>` inside a single cell is fine, and so is a controlled input read from React state.
2. **A table that already expands on tap:** the GL statements (`GlReportView`), the Chart-of-Accounts tree, the company statement.
3. **The reconciliation matching panes**, where a tap selects a row for pairing.
4. **`MonthlyMatrix`** — it pins the account column and scrolls inside `.table-scroll`.

`.table-scroll` is the escape hatch for any table that cannot fold.

#### Type and controls

- **The type scale is desktop-first and steps down under 768px:** the 40px hero step (`.text-3xl`) becomes 30px and `.num-hero` 36px, because a seven-figure sum at 40px wraps with "RM" stranded. The pattern is `text-[30px] sm:text-[44px] md:text-hero`.
- **Every form control is 16px below 768px**, with `!important`. iOS Safari zooms on focus for anything smaller and never zooms back.
- **Controls are at least 44px tall** there.

### Interaction states

Every data surface handles five states.

- **Loading**
  - On navigation: the route skeleton (Navigation feedback).
  - Inside a landed page: `.skeleton` bars in the target's shape.
  - Never a spinner in place of a page.
- **Empty**
  - The table's own empty row or box says what to do or who adds the first one ("No fund sources yet. Finance can add the first one."). A filtered empty offers to clear the filters.
  - Zero alerts is good news, so say it ("All loans current." in ledger green) rather than showing an empty table.
- **Error**
  - Validation errors sit inline on the field in danger red with a hairline — no red background.
  - Every error says what to do: "Connection lost. Retrying…", or the refusal above the footer in a form.
  - A Server Action's refusal is returned as `{ ok: false, reason }`, because production masks a thrown message.
- **Success**
  - The kit's toast for small confirmations, an inline panel for a significant event, and a redirect to the record after create.
- **Partial**
  - Name what failed and offer a retry ("5 of 7 companies generated. Retry failed").

### Multi-select — ticks outlive a drill-down

A list with checkboxes treats a row's detail page as part of the same job: tick five, open one, come back, carry on ticking.
- **Where the ticks live.** Not in local `useState`, but in `lib/selection-store.ts`, keyed by the list's path. The list restores them on remount.
- **When they expire.** When the reader lands on another nav destination, never on a drill-down — `PortalFrame` decides.
- **Pruning.** Ids that vanished while the reader was away are pruned.
- **How to use it:** `useStickySelection(scope, visibleIds)`; see `approvals/_components/PendingApprovals.tsx`. A list whose detail is a modal never unmounts and needs none of this.
- **A row the reader may see but not decide** (another domain's approval, their own request) has no tick. It shows a muted `—` whose title says why, and select-all skips it.

### A hidden value (v3.18, 2026-10-09)

A salary, NRIC or account number whose tick is not the viewer's reads `••••` in the field's own style. Never a lock icon, never a greyed row.
- A blank stays `—`: whether something is on file is no secret.
- In an edit form, an unticked field is a read-only box with no input behind it, so a save leaves it untouched.
- A file that needs the real numbers (the bank CSV, the statutory files) is not offered without the tick. A print shows `••••`.
- The database decides first: `lib/private-fields.ts`.

### Accessibility (WCAG AA)

1. **No emoji-only or colour-only status.** A word on a wash, plus `aria-label` where it is only an icon.
2. **Contrast AA.** Black on the sheet passes easily. HR's orange is never used for lettering — that is why.
3. **The keyboard works everywhere.** Tab reaches everything, Enter / Space activate, Esc closes the top overlay, and focus returns to the trigger.
4. **Form labels.** Every input has a `<label>`; a required one is visible and `aria-required`.
5. **Table semantics.** `<th scope>` and `aria-sort` on sortable heads.
6. **Live regions.** `role="status"` / `aria-live="polite"` for toasts and the update pill.
7. **Touch targets** of 44×44 or more on a phone. **`<html lang="en-MY">`.**
8. **`prefers-reduced-motion`** turns off every non-essential motion.
9. **Automated checks are still to add:** neither axe nor `eslint-plugin-jsx-a11y` is installed.

### Shared portal rules

1. **Page head.** Every top-level route opens with one — no exceptions, even small pages:
   ```tsx
   <div className="page-head">
     <div>
       <div className="page-eyebrow"><em>I.</em> SECTION · PAGE NAME</div>
       <h1 className="page-title">Page Title</h1>
     </div>
     {/* optional: the one primary action, right */}
   </div>
   ```
   - On HR's pages use the kit's `PageHead`.
   - No description under the title (Part II › No descriptions on the page).
2. **Money cells use `.num`:** `<td className="num">{formatMoney(x)}</td>`, negatives in `<span className="neg">`. A headline figure is `.statement-amount` (`.compact` for narrow summary columns).
3. **Data tables use `.ledger-table`** with bare `<th>` / `<td>` — the class wires up the band, zebra, hover, hairlines and right-aligned `.num`. A closing total goes in `<tfoot>`.
4. **Section headings use `.sect-head`:** `<div className="sect-head"><h2>Subsidiaries</h2><span className="rule" aria-hidden /><span className="count">7 ENTITIES</span></div>`.
5. **Colour only through tokens.**
   - Tailwind classes (`text-ink`, `bg-paper`, `border-hairline`, `text-danger`, the `ds-*` set), `var(--…)`, or `rgb(var(--xxx))` in SVG.
   - No hex outside `globals.css`.
6. **A table of five or more columns folds on a phone** (Responsive › Tables — the fold).
7. **One primary action per screen**, top right on the desktop and at the bottom on a phone.
8. **A route folder with child routes gets a `loading.tsx`** that renders `RouteSkeleton`.

### Utility classes (`globals.css`)

| Class | What it does |
|---|---|
| `.page-head`, `.page-eyebrow`, `.page-title` | The page head: a flex row over a hairline with a 64px accent segment; the mono eyebrow with its `<em>` numeral; the 36px Newsreader title |
| `.sect-head` | A section title, then a hairline rule running right, then an uppercase mono count |
| `.num`, `.num.neg`, `.neg` | Chivo Mono tabular figures, right-aligned in a table cell; negatives red |
| `.statement-amount` (`.compact`) | Inter tabular headline amounts, 26 → 23 → 21 (18) |
| `.num-hero` | A legacy 56px hero figure (cents and unit in graphite). Only in old pages; new pages use summary cards |
| `.ledger-table`, `.band-row`, `.table-frame` | The data table; a band row for a group that does not fold; the framed table with its footer strip |
| `.chip` (`ledger`, `alert`, `danger`, `info`, `accent`) | A status word on its wash with a dot. Inline only, never a button |
| `.btn-pri-sheet`, `.btn-quiet-sheet` | The sheet's primary (orange, black lettering) and quiet buttons |
| `.sheet-toolbar`, `.sheet-tabs`, `.sheet-count` | The filter panel above a table; a hand-built tab rail and its counts |
| `.sheet-warning`, `.sheet-danger`, `.sheet-notice` | Callouts — a problem with its fix (Part II › No descriptions) |
| `.m-hide`, `.lt-toggle`, `.table-scroll` | The fold |
| `.skeleton`, `.route-skeleton` | Loading bars; the navigation skeleton |
| `.hero-walnut` | The walnut person or figure header: Dept Pool, a salesperson's payslip and statement |

### Canonical reference pages

| Pattern | Copy from |
|---|---|
| A sheet page: summary cards, a ledger table with `tfoot`, status chips | `src/app/(portal)/hr-costing/page.tsx` |
| A sheet page with a working grid under its cards | `src/app/(portal)/hr-costing/payroll/[period]/page.tsx` |
| HR's kit end to end (head, tabs, cards, grid, drawer, window, toast) | `src/app/(portal)/team/people/_components/` |
| The sheet's design source (cards, rail, framed tables, person header) | `src/app/(portal)/revenue/[sub]/[period]/_components/CommissionWorkbench.tsx`, `CommissionMonthSummary.tsx` |
| A monthly statement with tabs and department tables | `src/app/(portal)/hr-costing/payment/page.tsx` |
| A Finance list (cards, counted tabs, toolbar, `SortableTable`) | `src/app/(portal)/payments/_components/VoucherLedger.tsx` |
| Section-grouped tables | `src/app/(portal)/statements/[id]/page.tsx`, `src/app/(portal)/reports/loan-aging/page.tsx` |
| A pure read-only ledger | `src/app/(portal)/audit-log/page.tsx` |
| Folding a hand-rolled table / a config-driven one | `src/app/(portal)/venture-pool/page.tsx` / `src/components/SortableTable.tsx` |
| The shells | `components/layout/HrSidebar.tsx`, `HrTopBar.tsx` (HR); `Sidebar.tsx`, `TopBar.tsx`, `BottomTabBar.tsx`, `MoreSheet.tsx` (other views); `PortalFrame.tsx` picks |
| The Revenue app | `components/member/app/` — `today/` for a tab page, `Sheet.tsx` for a sheet |

### What to do when you add a feature or amend a page

1. Find the page in Part III and the closest reference above. Copy the structure.
2. Use the Part I tokens and the kit; reach for `--ds-*` when you build something new.
3. A genuinely new component or pattern gets its spec here (Part I › Components or the page's Part III section) in the same PR, plus a line in Part IV.
4. Before committing: `npx next lint --quiet`, the tests (the design guards: `no-page-descriptions`, `soft-select-coverage`, `route-boundaries`, `safe-area`, `design-system-tokens`), and a look at the page at 1280 and 1440 wide and at a phone width.

**Review checklist**
- Tokens only, no hex.
- The right face for the job (Newsreader titles, Inter body, mono figures; Inter Tight in Revenue).
- All five states.
- Keyboard and labels.
- One primary action and one dark object.
- No descriptions.
- The don'ts in Part I.

---

## Part III — Page specs

A page spec is the page's anatomy and its rules: what it shows and in what order, which component draws each part, its states and behaviours, the words that are the spec, and what breaks if done otherwise. Exact paddings, sizes and colours live in the page's CSS module and its handoff prototype, named in each section. Pages run in sidebar order.

**Finance**

### Finance's pages on the sheet (v3.12, 2026-10-07)

Every page Finance reads (and a department manager's My Billing and OPEX) moved onto the sheet by route. A page's anatomy changes only when it is converted (Part II › **How a page is built on it**); the Finance view redraws these pages from `.design/finance-revamp`.

Converted so far:
- **Payments and Receipts** — their hubs since v4.8 / v4.13 (`VoucherHub`).
- **Approvals** — the queue and the recent decisions as `SortableTable`s, one decision bar.
- **Invoice** — its hub since v4.17 (`statements/_components/InvoicesHub`), its dialogs since v4.18.
- **Statements** — one month at a time (v3.84).
- **The Billing Allocator** — its hub since v4.23 (`billing-allocator/_components/AllocatorHub`), a record's full page in D06's hand (`/billing-allocator/[id]`).
- **A page's files** (*Excel*, *PDF*, *Export ▾*, the ticks that pick what to export) show only to whoever may take them out — the Export its route asks, on the desktop and in the phone app alike (v4.59). The Venture Pool's stays for every reader of the page (the user, 2026-10-12). Invoice Financing's *Record financing* shows only to whoever may record it.
- **One-way steps ask first on the computer too** (v4.60, the phone app's question since v4.53): a press nothing on the portal takes back opens the kit's question in the phone's words — a statement's *Issue to subsidiary* / *Mark as paid* (*Issue to <company>?* · *<month> · <net>*), Invoice Financing's *Bill interest* and the register's *Bill borrower* (*Bill <borrower>?* · *<BA no.> · <charge>*), *Mark executed* on Department Pools and its submissions and HR Costing's *Execute transfers* (*Mark <month> executed?* · *HR costing · <total>*), Dept Requests' *Cancel request* (red), Payroll Requests' *Send back to HR* (red — the inline *确定打回 …？* second click is gone). *This cannot be undone.*, *Cancel* · the step; a refusal stays in the question. A step with its own way back (Mark settled, Reopen) stays one press; the browser's own confirms (Delete, Provision) are unchanged.
- **On a phone**
  - An Approvals row is Description + Amount, with who / when as small print. Its arrow opens the rest of the row and the voucher.
  - The `.fin-queue` pages set an opened row's labels in the card-label face, and its one action (Settle) as an orange pill.
  - Finance's and the Principal's tab bar reads in English.

### Finance's view — its own shell (v4.3, 2026-10-14)

The source is the Claude Design handoff *Finance 侧栏分类整理* (`.design/fin-r2/handoff`, `prototype/Finance Desktop.dc.html` + README; screenshots D01–D13). Who wears it: the finance kind and the Principal's Finance lens, on a computer (`isFinanceShell`); the Principal's own view keeps its sidebar, and a phone keeps the portal's phone shell until Finance's phone app.
- **The shell is HR's** (`.hrv-shell.fin-shell`): `FinSidebar` over `ViewSidebar` at 212px, `HrTopBar` reading *Finance view*, the sheet padded 24 / 28 / 48 (`.fin-sheet`) and scrolling on the browser's own scrollbar, not the portal's thin one. On a computer the sheet sits right under the 70px bar — the frame keeps its 10px on the other three sides only (both views; both prototypes draw it so). Finance's pages keep `.fin-view` — on the frame now — and their place on Back.
- **The sidebar's categories** (`components/layout/fin-nav.ts`): Overview · I. DAILY (clay) Payments, Receipt, Invoice, Billing Allocator, Daily Bank, Reconciliation, Journal Entries · II. FUND (olive) Fund IN, Fund OUT, Invoice Financing, Repayment, Statements · III. REPORT (slate) General Ledger, P&L, Cash Flow, Receipt & Payment, Balance Sheet, Trial Balance, Debtor Aging, Loan Aging, Company Statement, Chart of Account, Base Rate History · IV. DEPARTMENT (gold) Dept Pool, each department, Venture Pool. Approvals (first in Daily) shows only to its holders; Overdue is not drawn (its page is gone), and neither is Claims since v4.32 (the user took it out; its page stays).
- **The footer is a button** — *Finance · settings & admin* — that opens the account menu (D13): a white popover 10px in, 64px up, radius 12, the menu shadow; ACCOUNT (Edit profile, Change password — a login of one's own only), ADMIN (Audit Log, Departments, Meeting Rooms), a rule, SIGN OUT in caps. A transparent scrim closes it.
- **The kit** (`components/finv/`): `FinDialog` — the prototype's desktop sheet, 520px content-box on `248 245 240`, radius 16, `0 30px 70px` shadow, fading in from .98 over .2s and out again before it unmounts (`usePresence`); its bodies `DialogMenu`, `DialogConfirm` (red when it undoes), `DialogForm` with `Field` / `Input` (40px content-box, radius 10, the .18 ring) / `Hint` / `DialogButton` (38px). `FinToastHost` draws `flash()` as the walnut pill at the window's foot, 12px up and in over .28s, held 2.2s, played out too.
- **Edit profile** — Full name, Email (shown, never edited: it is the sign-in), Phone; *Shown on vouchers you create*; Cancel · Save; *Profile saved*. **Change password** — the 2026-10-12 rules in the design's dialog, its sub *At least 6 characters* (the real rule, not the design's 8). **Sign out?** asks first.

### Finance's view — the Overview (v4.6, 2026-10-14)

D01 of the same handoff, and HR's Overview drawn on it (H01–H02, `HR Overview.dc.html`). `dashboard/_components/FinanceOverview.tsx` / `HrOverview.tsx` on `overview.module.css`; the page reads (`_lib/finance-overview.ts`, `_lib/hr-overview.ts`) and hands the figures in. The Principal's own view keeps the treasury dashboard.
- **The head:** the office's date and quarter in Chivo Mono caps (HR's adds *· HR view*), the greeting by the office clock and the first name in Newsreader, a short accent rule; on the right one primary and one quiet button — *Create payment* / *Create invoice* (Finance), *Import payroll* / *Calculate director salary* (HR) — each shown only to whoever may do it.
- **One line of what waits**, each part only for whoever opens its page: *N vouchers waiting for approval · N invoices outstanding · N allocations to bill.* / *October payroll is not imported yet · N hiring requests waiting · director salary not calculated.*
- **Quick actions:** a label with a rule, then eight tiles (icon in its tone, label under it, a walnut count badge where something waits) — Finance: Payment, Receive, Invoice, Billing, Daily Bank, Fund IN, Fund OUT, Ledger; HR: Hiring requests, Import payroll, Payment, Director salary, People, Member services, Book a room, Comm Cal.
- **A card per category**, the sidebar's own sections in its order (Finance: Daily · Fund · Report · Department), its numeral, name and *N pages*, then its rows — icon tile, label, a short mono note where the row has news (HR's), a chevron.
- **The sheet** pads 24 / 28 / 48 on both and scrolls on the browser's own scrollbar (`.hrRoot` sets it for HR's).

### Finance's view — the hubs (v4.8, 2026-10-14)

D02–D05 of the same handoff, first on Payments (`payments/_components/PaymentsHub` → `PaymentsHubClient`; the kit `components/finv/Hub.tsx`, `FinTable.tsx`, `Drawer.tsx` on `hub.module.css` / `drawer.module.css`). Receipt, Invoice, the Billing Allocator and Fund OUT / IN follow on the same parts.
- **The head:** `I. DAILY · PAYMENTS`, the title, the 64px segment; on the right *Create payment* (the primary), *Dept · N*, *Payroll · N* and ours kept — *Claims · N*, *Export ▾* — each a white button opening a menu (the dialog's) of what waits. On a narrow sheet the five wrap under the title.
- **The cards** (`flex: 1 1 260px`, a grid of `minmax(168px, 1fr)`): the walnut-framed total — *Total paid · {Month YYYY}*, Chivo 26 in walnut — then one card per list: All vouchers (walnut), Draft, Pending approval (black, never blue), Approved (clay), Paid (olive), Voided (the quiet light one, a hairline), Payroll batches; a round icon chip, the name 13.5/600, a mono count, the figure Chivo 15/600, a faint arc — the count and the figure are what the list's head shows for that card (a folded payroll batch counts its members; money moved outside the voucher flow is counted apart: *190 vouchers · 127 other*); the one on show ringed `0 0 0 2px #fff, 0 0 0 4px` accent.
- **The table panel** (`flex: 2.6 1 440px`): the list's name and its mono count (*11 · RM 457,783.00*, or *4 of 11 · filtered*), the search (36px content-box, radius 10), *Columns*. The navy head band (40px, 10.5/600 caps): every heading sorts ↕ → ▲ → ▼ → off, filters by its values through the funnel (not Amount — a popover of 230px: the values with their counts, *Clear*), moves when dragged onto another (the target lit with a black edge) and widens from its right edge (never under 70px). Rows 46px, peach on hover and while open in the drawer, a quiet `›`. Name · Description · Amount always; Ref #, Date, Category, Pool, Status ticked on in the Columns panel (230px: *Drag a heading to move it · drag its edge to resize*, the fixed three greyed, *Reset*), each in its place before Amount; the table scrolls sideways only once it outgrows the panel.
- **Receipt's hub** (D09, `/receipts`; `receipts/_components/ReceiptsHub` on the same `VoucherHub` Payments is drawn with): `I. DAILY · RECEIVE`, *Receive*; *Create receipt* (the primary) and *Loan repayment*, then *Export ▾*; the total *Total received · {Month YYYY}*; the cards All receipts, Draft, Pending approval, Approved, Received (olive), Voided — no payroll — each *N receipts* and its figure *+RM …*; the list's figures *+RM …* in green (`--fv-chip-ledger-ink`, grey once voided), its columns to tick Ref #, Date, Bank, Pool, Status (`fin.receipts`); the drawer is Payments', a receipt's — no *View full page*.
- **Invoice's hub** (D10, `/statements`; `statements/_components/InvoicesHub` → `InvoicesHubClient`, read by `_lib/invoice-hub.ts`): `I. DAILY · INVOICES`, *Invoices*; *Create invoice ▾* (the primary: Single invoice · Multi-line invoice · Generate Marketing invoices), *Payroll ▾* (Generate payroll invoices · Reconcile payroll · Own-share → Venture (Office) · ours, *Payroll basis*), *Export ▾* (Excel · PDF · list · PDF · per invoice) — each the kit's dialog menu, an item with its line under it. The total *Invoiced · N invoices* — issued and paid, never a draft or a voided one — with the month pill under it (‹ *October 2026* ›; ours, its label opens the year's months: a 300px card in the calendar's hand, the month on show in the accent, this month ringed, *This month*). The cards All invoices (walnut), Issued (gold), Paid (olive), Draft, Voided (quiet), then Credit notes (peach, *−RM …*), Marketing projects (peach, *N projects · N active*), Non-billable (quiet, what left the pool).
- **Its table:** Name (who it bills) · Description (its first line) · Amount; Invoice #, Date, Due, Billing mode, Category (ours), Status to tick (`fin.invoices`); the count *13 · Oct 2026*; *Search invoice # / company / mode…*. *Select* (All and Issued; *Done* while on): a 44px column of 20px boxes before the rows — the accent once ticked, faint where a row cannot be — a press on a row ticks it, the head's box (ours) ticks every row on show that can be; *Other months · N* (ours, while selecting) brings other months' unsettled invoices in for one receipt. Ticked, a dark bar at the sheet's bottom centre (radius 12, `--fv-dark`): *N selected · RM …* with the one payer under it (*Different companies can’t be combined* when not), *Clear*, ⋯ (ours: Print selected, Void selected), *Settle N →* in the accent (.45 when it cannot). A right-click on a row: Open, Open in new tab, PDF, then what the drawer offers.
- **The lists that are not the table's** (Credit notes, Marketing projects, Non-billable — the prototype's `itemGroups`): a 34px band naming the list and counting it, then a 48px row an item — its name 13.5, a line about it 13 in graphite, the figure in mono at the right (a credit note in red, money in green with +), and one 30px button (Approve · PDF, Invoice). A credit note's row opens what it can do; a project's opens its contract; the toolbar carries *+ New contract* / *+ Add non-billable expense*.
- **An invoice's drawer** (the same 460px drawer): its number, *View full page ↗*, *PDF*, ×; the dark hero — *Invoice · {billing mode}*, the status in the list's words and light (issued gold, paid green, voided red), the number, the amount, *{party} · {kind}*, the sentence of what comes next — then I Balance (Received in green, Remaining in the wait blue, Due and the days left), II Billing (Billed to, Billing mode, GL category with its code, Reference no, Invoice date), III Line items (a peach Total), IV Receipts, and its credit notes when it has any. At its foot: a draft *Approve & issue* · *Edit* · ⋯ (Copy, Delete draft); issued *Settle* · *Edit* · ⋯ (+ Credit note, Change account with its account under it, Copy, Void invoice); paid *Refund* · *+ Credit note* · ⋯ (Change account, Edit, Copy).
- **Settle** (the prototype's `settle` sheet, the kit's dialog): *Settle N invoices* · *{payer} · one receipt*; a white summary card — each invoice's number and what it still owes, the *Total* on peach (14/600) — then Into bank and Received date (the date field); one invoice adds *Amount received RM* (ours: less is a part payment, said under it); *Cancel* and *Settle & create receipt*. A confirm that needs more than yes (a void's reason) carries its field between the sentence and the buttons.
- **The Billing Allocator's hub** (D11, `/billing-allocator`; `billing-allocator/_components/AllocatorHub`): `I. DAILY · BILLING ALLOCATOR`, *Billing Allocator*; *Generate invoices* the primary while something is to bill (asked first: *Bills RM … across N companies as one draft invoice each. N allocations become billed.*), *+ New allocation* white beside it — the primary when nothing is. *Allocated · {Month YYYY}* with the month pill under it (ours: an allocator's records are a month's — the design's phone hub draws it; `?period=`), the neutral notice *To bill RM … across N companies — Generate invoices bills every company’s share in one go.* while something is, then four cards: Records (walnut — *N expenses · N to bill*, *RM … to bill*), By company (slate — *N companies · N with a balance*, *RM … billed*), Staff (olive — *N people*, *N active*), Setup (quiet — *N templates · N categories*, *x / y companies*); the open one in the address (`?card=`).
- **Its lists:** Records the table (`fin.allocations`) — Name the expense, Description *{Method} split · {batch}*, Amount; Txn, Date, Method, Batch, Category (ours), Split (ours, *2990 3.9% · CAR 19.4%*), Status (billed green / to bill gold) to tick; *N expenses · Oct 2026*; *Search txn / description…*; a right-click Open, Open in new tab, Correct, Delete allocation (shut on a billed record, saying why). By company, Staff and Setup the lists that are not the table's: *Share by company* (the company, *billed … · its invoices*, *to bill …* in the alert gold or its share in green — HV's own share lives in each record's split); *Staff* (*Name · Department*, *splits · added {date}*, active in green / inactive quiet in the figure's place — the desktop draws no chip — and *Edit*; the toolbar's *+ Add staff*, *Save {Mon} snapshot*, *Import from HR*, *Snapshots · N*, and the search, ours); *Companies* (*x / y enabled*, the code, enabled / off, *Turn off* / *Turn on*), *Categories* (the account under the name, *Edit*), *Templates* (method · category, the default amount, *Edit*); *+ Add category* / *+ Add template* on the toolbar.
- **An allocation's drawer** (the 460px drawer): its number, *View full page ↗*, ×; the dark hero — *Allocation · {batch}* (or *not billed*), billed (green light) / to bill (gold), the number, the amount, *{expense} · {date}*, what that means (*Billed — each company’s invoice carries its share. Delete or void those invoices on Invoice to undo.* / *Not billed yet. Correcting reloads it in Calculate; deleting removes it before any invoice is made.*) — then I Expense (Description, Category *7012 · Rental*, Date), II Split (Method, Headcount from, Companies, Invoice(s)), III Split by company (each share — *3.25 staff · 19.4% · billed · HV-INV-…*, HV's own quiet and *kept* — the *Billable total* on peach). At its foot: billed, *View invoice …* (or *View invoices · N*, a menu); not billed, *Generate invoices* · *Correct* · ⋯ (*Delete allocation*, asked first).
- **+ New allocation** (the prototype's `vCalc`, in the same drawer; `AllocationCalc`): *New allocation* (or *Correct ALC-…*); a white card of Template, Description, Amount RM, Method, Category — a Percentage or Custom expense adds each company's box (HV's own first, the sum on peach), the small *Headcount from · current list* opens another month's snapshot (*Using the August 2026 list for September 2026.* in the warning gold) — then *PREVIEW · HV OWN LEFT OUT*: a row a share (*5 staff · 19.4%*, HV's own quiet) at 0.00 until there is an amount, the *Billable total* on peach; at its foot *+ Add expense* (another card) and *Save allocation* (the accent paled, `--fv-accent-off`, while it cannot save).
- **Staff's and Setup's dialogs** (the kit's sheet): a person (Name, Department, Status, Splits — the lines card, the % total red over 100 — *Remove* quiet at the foot's left, asked first); a saved snapshot (By company — heads and share — then the list, inactive faint, searchable); *Import HR’s list?* (the month, *Import* in red); a category (Name, Account — none is the invoice's default); a template (Name, Default RM, Method, Category, a Percentage one's default % a company). An undoing button in a form is the quiet red one; its question is the red fill.
- **Fund OUT's and Fund IN's hub** (D12, `/fund-out` and `/fund-in`; one component, `components/treasury/FundHub`, read by `fund-out/_lib/loan-hub.ts` / `fund-in/_lib/source-hub.ts`, the figures `lib/fund-hub.ts`): `II. FUND · FUND OUT`, *Fund OUT*; *Create fund out* (the primary), *Loan aging* (whoever reads the report) and ours kept, *Export CSV*; Fund IN's head is *Record fund in* alone. The create buttons open the design's dialogs on the page (v4.26, Finance's view — Create payment). The total *Fund out · {Month YYYY}* / *Fund in · {Month YYYY}* — what went through this office month, by the day the money moved (never a pending or cancelled one).
- **Its cards** — the system's categories in the design's colours (the user, 2026-10-14; the design's sample types are not the system's): Fund OUT All fund out (walnut, *N transfers · N pending*), Active (clay), Overdue (gold — read live, an instalment past its day unpaid), Pending approval (black, the README's), Repaid (olive), Cancelled (quiet); Fund IN All fund in, Subsidiary (clay), Director saving (olive), Director loan (brown), Dept pool (gold), Outsource (slate), Pending approval (black). Each counts and sums what its list holds: All and a type what went through (a cancelled deal counted, summed at nothing — the design's `live`), Cancelled what was cancelled. The one on show in the address (`?status=`, the old tabs' — *fully_repaid* still lands on Repaid).
- **Its list** (`fin.fund-out` / `fin.fund-in`): Name the borrower or the source (*Carres (CAR)*; a company named by its code just *2990*), Description how it is lent or taken (*Subsidiary · 2.000% /mo · 12 months*, a loan's *· SC HC*), Amount *−RM …* in red out, *+RM …* in green in, grey once cancelled; Date, Type, Status (active green, overdue red, pending blue, matured gold, repaid and cancelled quiet; an active fund source *matures in 12d* / *past maturity*, as its list always said), Outstanding and Rate (ours) to tick — no Ref #: a loan and a fund source have no number. *Search company, description…* (the notes and the status too). A right-click: Open, Open in new tab, Print schedule, Amend terms.
- **A deal's drawer:** the party in the head, *View full page ↗* and *Print* (its schedule); the dark hero — *Fund out · Loan out* / *Fund in · Subsidiary*, the status in the list's words and light, *−RM …* / *+RM …*, *To …* / *From …*, where it stands (*Waiting for Principal approval before the money leaves.* — *before it is booked.* on Fund IN —, *Disbursed — bank and loan ledger are updated.* / *Received — bank and ledger are updated.*, *Overdue — RM … past its day since …*, *Cancellation requested — waiting for Principal approval.*, *Matured — still owed until it is repaid.*, *Repaid in full.*, *Cancelled.*) — then I Transfer to / Received from (Recipient or Payer, Type, Funding source, a loan's Terms or a source's Notes), II When & where (Date, Maturity or *No fixed term*, Into bank), III Booking (Account with its code, Amount, Rate with its term, Interest — compound, minimum pay — only when on, Outstanding with what is repaid, Overdue), the trail (Created → Disbursed / Received by its approver → Repaid or Cancelled). At its foot: pending, *Open in Approvals* (the primary, for whoever decides it — never its own raiser unless the Principal), a pending fund source's *Edit*, *Cancel loan* / *Withdraw* in red, asked first; active, *Amend terms*.
- **Payroll batches:** a band that counts them, each batch a 48px row (▸ turning 90°, its name, *N vouchers · all paid · 06 Oct 2026*, the total in red) opening to its members.
- **The drawer** (460px, max 92%, over the sheet only, inside its edge; in 40px and a fade over .34s, out the same way): the number in mono caps, *View full page ↗* (not on a receipt), *Print*, ×; the dark hero (kicker, status chip with its light, number, amount Chivo 28, *Pay to …*, the status sentence), groups I–IV in white cards (Pay to · When & where · Deducted from with a peach Total · Booking), the files and a dashed *+ Add attachments*, the trail (dots and lines in the accent), and at its foot the steps this reader may take now — the primary 1.5, the others 1, ⋯ 52px.

### Finance's view — a voucher's full page (v4.9, 2026-10-14)

D06 of the same handoff (`payments/[id]/_components/FinanceVoucherPage.tsx` on the kit's `components/finv/full.module.css`), for the treasury's readers of a payment voucher; a receipt keeps its page (the README: not redesigned) and HR keeps its own. **An allocation's** (`billing-allocator/[id]/_components/AllocationPage.tsx`, v4.23) is drawn the same way: *← Billing Allocator* and `DAILY · BILLING ALLOCATOR · ALC-…`, *Allocation · {batch}*, the number with billed / to bill, Amount · Expense · Date · Created by; 1 Expense (the expense 19/600, Category, Date, Batch), 2 Split by company (Company · Share · Amount, the *Billable total*), 3 Audit log (`audit_changes()` for the allocation — *Recorded …*, *Billed under ALC-…*, *Amount … → …*); the panel *Allocation*, the amount, SPLIT (Method, Headcount from, Companies, Invoice(s)) and the drawer's steps. No Trail (an allocation has no steps of its own), no Print or Copy (the system has neither for it).
- **A loan's and a fund source's** (`fund-out/[id]/page.tsx`, `fund-in/[id]/page.tsx`, v4.27 — the Fund drawer's *View full page ↗*): *← Fund OUT* / *← Fund IN* (or *← Overview* / *← Calendar*, where it was opened from) and `FUND · FUND OUT · {party}`; *Fund out · Loan out* / *Fund in · {type}*, the party in the number's place with its status (the list's words and tones — overdue red, *matures in 6d* blue, repaid quiet), Amount · To / From · Date · Created by; *Print* opens its repayment schedule. The cards: 1 Transfer to / Received from (the party 19/600, Type, Rate, Term with its maturity, a loan's Funding source and Terms), 2 Repayment schedule (the schedule's own table, its count in the strip; *Repayments recorded · N* folded under it, a loan's each reversible), Terms over time (when they changed), Repayment settings, a source's Notes, Record repayment, Trail (Created → Disbursed / Received by its approver → Repaid / Cancelled), Audit log (`audit_changes()` for the deal and its repayments, `lib/deal-audit.ts` — *Created · RM …*, *Approved — disbursed*, *Rate 4.000% → 3.500% /mo*, *Repayment recorded · Interest RM … · {day}*). The panel: *Fund out* / *Fund in*, its chip, *−RM …* / *+RM …*, *To …* / *From …*; WHEN & WHERE (Disbursed or Received, First instalment / repayment, Maturity, a source's Into bank), BOOKING (a source's Account, Rate with its base and premium or its month's interest, Monthly interest / payment, Outstanding with what is repaid, Overdue since); the steps (`DealPageSteps`): *Amend terms*, a pending source's *Edit*, *Cancel loan* / *Withdraw* and *Request cancellation* in the light red — asked first, a loan's with a reason; shut, its reason its title, while repayments stand — or *Cancellation · Requested* by whom and when. The full page's parts are the kit's (`components/finv/FullParts.tsx`: `FullFact`, `FullCard`, `FullRow`, `FullPanelRow`, `FullTrail`, `FullAudit`), a voucher's and an allocation's pages drawn with them too.
- **An invoice's** (`invoices/[id]/page.tsx`, v4.28 — the Invoice drawer's *View full page ↗*): *← Invoices* (Back when the hub is where it came from) and `DAILY · INVOICES · HV-INV-…`; *Invoice · {billing mode}*, the number with its status (the list's words and tones — issued gold, paid green, voided red, a draft quiet), Amount · To ({party} · {kind}) · Created by — the prototype's three, an invoice having no *When & where*; *PDF* and *Copy* (asked first; the copy, a draft in this month, opens on its own page). The cards: Line items (*Item · Account · Amount*, the account `5020 · Salary Income`, the total under a 2px rule; a simple invoice its one line), Receipts (*+RM …* in green, a consolidated receipt *one receipt for RM … in all* with this invoice's part; none, *No money received against this invoice yet.*), Credit notes (when it has any, *−RM …*, the approved under the rule), Description (only when it says more than its lines), Trail (Created → Issued → Paid / Voided, each by whoever moved it — read off its changes, `lib/invoice-audit.ts` `invoiceTrail`; older than the audit trail, its invoice date and its last receipt), Audit log (`audit_changes()` for the invoice and up to twelve of its credit notes — *Created HV-INV-… · RM …*, *Approved & issued — posted to the GL*, *Amount RM … → RM …*, *Credit note HV-CN-… approved — RM … off*). The panel: *Invoice*, its chip, the total, its party; BALANCE (Received, Remaining, Due with *28 days left* / *Paid*) and BILLING (Billed to, Billing mode, GL category with its code, Reference no, Invoice date; Period when the date is another month's; a free-text party's Address and Contact) — the design's two side groups; then the drawer's steps stacked (`InvoicePageSteps`, `invoiceSteps`): *Approve & issue* / *Settle* in the accent, *Edit*, *Refund*, *+ Credit note* (shut on a paid one, its reason its title), the ⋯ a menu of the rest (Delete draft, + Credit note, Change account, Void invoice — Copy is at the head). Each opens the hub's own dialog (Settle, Edit, Credit note, Change account, the void's reason); a department pool's settle and a refund go to the voucher page, which comes back with *Receipt … written* / *Refund voucher … written*.
- **The head:** *← Payments* (30px, radius 8) and the mono crumb `DAILY · PAYMENTS · HV-PV-…`; the kicker *Payment voucher · {account}*, the number in Chivo 28 with its status pill (the list's tones), four facts in 10px caps over their values — Amount and Payment date in mono, To, Created by on the office's clock; *Print* and *Copy* in Newsreader italic 14 (Copy asks first, in the dialog). A hairline closes it.
- **The cards** (`flex: 1 1 520px`): a 12px-radius white card each, its strip `--fv-strip` with a peach numbered dot, the title in Newsreader 16 and a mono aside — 1 Pay to (the payee 19/600, then Company · Description · Method · Notes), 2 Deducted from (Pool / Item · Account · Amount, a 2px rule over the Total; *Change GL account* beside the aside once decided), People on this voucher and Statutory contributions on a payroll voucher, Attachments (open, add — late once decided — and *Remove* while it is still being made), Trail (its steps across, a dot and a line each), Audit log (When · Who · What changed, newest first — `audit_changes()` for the voucher and its files).
- **The dark panel** (`flex: 1 1 280px`, 316 + 36 wide, sticky): *Payment voucher* and its chip, the amount 30/600, *Pay to …*; WHEN & WHERE (Payment date — *Change date* under it on a paid one — and From bank with its number), BOOKING (Account with its GL code, Pool, Settles invoice); then the steps stacked — the primary in the accent, the rest translucent, Reverse in the light red. Narrow, it comes first (the cards wrap under it); side by side it meets the cards at the top.

### Finance's view — Create payment (v4.11, 2026-10-14)

D07–D08 of the same handoff (`payments/_components/CreatePaymentDialog.tsx` on the kit's dialog and `create.module.css`; the date field `components/finv/DateField.tsx` on `date.module.css`). *Create payment* on Payments opens it on the page; the Overview's goes to `/payments?new=1`, which arrives with it open.
- **The dialog** (the kit's 520px FinDialog): *Create payment* · *New payment voucher · HV-PV-{YYYYMM}*; the seven fields in the prototype's order — Pay to (the 40px input, *Payee name*), Category, Pool, From bank (the soft select at radius 12, 32px tall), Amount RM (mono, right), Description (*What is this for?*), Payment date — then *Save draft* (white) and *Submit for approval* (orange), both at .45 until nothing is missing; the line under the fields says what is (*Pay to and an amount are needed before you can save.*, the list as long as what is missing).
- **The date field** (D08): the day written out (*Wed, 14 Oct 2026*) beside the calendar glyph on a 40px button, ringed in the accent while open; under it (over it when the form's scroll has under 390px below and more above) the month on a 300px card (content-box, radius 14): ‹ › as 32px rounds, M–S in 10.5px, days as 32px circles 38px apart — the picked one orange with its glow, today ringed — and at its foot the date and *Today* in peach (28px, radius 6). In from 4px over .16s; it sits in the form's scroll, as the prototype's does.
- **What today's form also does** opens from a row of small buttons under the fields, in *Today*'s hand (28px, radius 6, 12/500, peach with an accent edge while on): *Split pools* (the Category and Pool become lines — Pool · Category · Amount, *+ Add line*, the total in a peach foot, red while it is not the amount), *Loan repayment* (Repay — the deal; Principal / Interest / Penalty; Pay to and the amount follow; a line per part on its own account), *Internal transfer*, *Method*, *Attachments* (a white card of the files, a dashed *+ Add files*), *Notes*, *GL override* (under each line: type, GL account, reason). Pay to offers the companies it matches in the soft menu's look; Category groups the accounts by type and finds one by its code too.
- **Receipt's dialogs** (D09, the prototype's `or-form`; `receipts/_components/CreateReceiptDialog.tsx`, `LoanRepaymentDialog.tsx`, on the same kit): *Create receipt* · *Official receipt · HV-OR-{YYYYMM}* — Received from (*Payer name*, the companies it matches), Description (*What was received?*), Into bank, Credited to pool, **Category** (the system books a receipt on an account; grouped asset → income first), Amount RM, Received date; *Method*, *Attachments*, *Notes* behind the small buttons; *Cancel* and *Save receipt* (orange), the hint the receipt's short sentence (*Received from and an amount are needed.*). *Loan repayment received* · *Recorded on the loan · Fund OUT* — Received from is the LOAN (borrower · principal · day · SC), with *Owed RM … · n of m left · r%/mo* under it; Description; Principal / Interest / Penalty side by side; *Interest credited to* where the borrower's interest sits in suspense; Into bank; Amount RM their sum, read only; Received date. The form's shared parts live in the kit: `PartyInput`, `FilesField`, `form-words.ts`, `form.module.css`.
- **Invoice's dialogs** (D10, the prototype's `inv-form`; `statements/_components/CreateInvoiceDialog.tsx`, `InvoiceLinesDialog.tsx`, their fields `InvoiceFormParts.tsx`, on the same kit): *Create invoice* · *Saved as draft · approve to issue* — Bill to (one select: the companies, the department pools, *A director…*, *Someone else…*; a name typed under it, and someone else's Address, Phone and Email), Description (*e.g. HR shared service — Oct*), Category (income first), Billing mode (the hub's words: HR attribution, Marketing project …), Amount RM, Invoice date (the month's last day until it is touched), Due date (thirty days on; it may be left out — *No due date*, the calendar's *Clear*); *Cancel* and *Save draft* (orange), the hint *Saved as a draft. Approving issues it and posts it to the GL.* — what is missing only once Save draft is pressed. Behind the small buttons: *Several companies* (Bill to becomes a card of companies and amounts, *+ Add company*, the sum in the peach foot), *Split billing modes* (Category and Billing mode become lines — Billing mode · Category · Amount; with several companies the amounts are proportions), *Period*, *Reference no*. A staff or director recharge on a company fills its amount (and the description) from HR, said under the field (*From the HR staff billing allocation, September 2026.*). *Multi-line invoice* — the same Bill to, Description, Category (every line's, or *Category per line*), Billing mode, then *Lines* (a description and an amount each, two to start, *+ Add line*, the total), the two dates; the hint *Total RM … · saved as a draft.* The same dialog is *Edit invoice* (*HV-INV-… · issued*, *Save changes*, a Reason for an issued one; once money came in its amounts, its party and its month are fixed). Kit: a form's select is the design's 32px with its words 12px in and its edge (the soft select drew none in a dialog portaled to <body> — Create payment and Create receipt too); a select in a line 32px, 8px in; the lines card (`.lines`, `.lineRow[data-shape]`, `.lineAmount`, `.lineText`, `.linesFoot`) moved into `form.module.css`; a line of four takes two rows on a phone.
- **The invoice's other dialogs** (the design draws none of them — the system's, in the same sheet; `statements/_components/CreditNoteDialog.tsx`, `ChangeAccountDialog.tsx`, `GenerateDialogs.tsx`), on Invoice's hub and the invoice's own page: *Credit note* · *HV-INV-… · {party}* — the invoice on a card (Invoice total, Received −, Credit notes −, *Still owed* on peach), Reason, then lines (Billing mode · Category · Amount; the first on the invoice's own), *Each line is its own credit note — a draft until it is approved.*, *Save draft*. *Change account* · *HV-INV-… · its posted lines move* — the accounts it posted to as ticks on a white card (the ticked sum in the peach foot, *Tick all* / *Tick none*), or *Now* when it posted to one; *Move to*; Reason; *Change account*. *Generate Marketing invoices* — the kit's question (*Generate*). *Generate payroll invoices* (Period, Category, a card a company: its departments and their parts — *Salary … · EPF …* in mono under each), *Reconcile payroll* (a card a company, its tag — *matches ✓*, *under-billed …*, *not invoiced*, *over-billed* — billed → should, the departments that differ; *Top up · N drafts · RM …*), *Own-share → Venture (Office)* (every department with a share as ticks, the registry's ticked; the total in the field's label). Kit: `.summaryRow[data-head]`, `.summaryParts`, `.tag[data-tone]`, `.checks` / `.check`. A step the system refuses for an invoice — *+ Credit note* on a paid one or a consolidated payroll one — stays where the design puts it, shut, its reason its title.
- **Fund's dialogs** (D12, the prototype's `fund-form`; `fund-out/_components/CreateFundOutDialog.tsx`, `fund-in/_components/RecordFundInDialog.tsx`, on the same kit): *Create fund out* · *Needs Principal approval before it is disbursed* — To (the active companies; a loan goes to a company, so the design's Type is not asked), Amount RM, Description (*What is this for?* — the loan's terms text), From bank (the primary first), Date (interest runs from it), then the system's own: **Custom premium % /mo** with the line *Base 0.850% (2026-Q4) + 1.000% = 1.850% /mo, locked for the loan’s life.* under it, and **Account** (the balance-sheet account the disbursement is booked to, grouped by type, *code · name*). *Record fund in* · *Needs Principal approval before it is booked* — From (what its Type names: a company, a department, or a name typed — *The director’s name*, *Who lent it*), Type (Subsidiary · Director loan · Dept pool · Outsource), Amount RM, Description, Into bank, Date (never after today), **Rate % /mo**. Behind the small buttons: *Term* (months and the first repayment side by side — blank, no fixed term and *The month after*), *Funding source* (a loan's SC), *Account* (a source's; *Fund Sources Payable (the default)*), *Interest* (Compound interest, Minimum pay interest as ticks). *Cancel* and *Submit for approval* (orange, .45 until nothing is missing: *To, an amount and an account are needed.* / *From, an amount and a rate are needed.*); a refusal of the system's is said in red at the foot and the form stays.

### Finance's view — the documents (v4.31, 2026-10-15)

README §3 and `prototype/Finance Documents v2.dc.html` (P01–P04): every PDF the Finance pages print is one sheet — `src/lib/export/doc-sheet.tsx` (`DocPage`, `DocMeta`, `DocParties`, `DocHeadline`, `DocItems` / `DocItemsHead` / `DocItemRow`, `DocTotals`, `DocBlock`, `DocSignatures`) — drawn by `billing/_format/invoice-doc-pdf.tsx`, `credit-note-doc-pdf.tsx` and `payments/_format/voucher-doc-pdf.tsx` (a credit voucher is the receipt).
- **The sheet:** A4 portrait, padding 52 / 56 / 34px (× 0.75 → points), 9.5pt at 1.45; one sans face — Helvetica for the design's Inter (the README's mapping), 600 as Helvetica-Bold; no fills. *Invoice* / *Receipt* / *Payment voucher* / *Credit note* 22pt left, the walnut H (36px, radius 9, cream 16px) right; the meta list (a 110px label column in #6B6B6B, the values black, the number 600); the issuer — *HOUZS Venture Holding Sdn Bhd* (the company's name as every print writes it, `lib/company.ts`, v4.61), *Internal banking · Shared services* (the invoice also *Director salary distribution*), then *hello@houzsventure.com* (v4.60, the user's) — beside the counter-party (*Bill to* / *Received from* / *Pay to* / *Credit to*, its lines #4A4A4A); the headline 15pt/600 (*RM 63,440.00 due 15 October 2026*, *… paid on …*, *… to pay on …*, *… credited on …*) over its summary; the items — the head 8pt grey over a 1pt black rule, rows 10px apart with #E6E6E6 between, a second grey line under the first cell; the totals 280px on the right, the last line 600; the footer 7.5pt #8A8A8A over a hairline — the number and the headline, *Page N of M* counted per document.
- **Each document's own:** the invoice — Qty · Unit price (a line is one unit at its amount, the invoice's month under it), Subtotal · Total · (Credit notes · Paid) · Amount due, the payment details and *Kindly quote the invoice number…*; a consolidated payroll invoice its lines grouped by department, a subtotal each. The receipt — Payment method (*Bank transfer · Alliance Bank 1200-4410-0091*), Reference, Description · Credited to · Amount (the account `code · name` under it), Total · Amount paid, *Received by · {who made it}* and *Company stamp*. The payment voucher — Pay from, Status, Deducted from · Account · Amount, Total, the Approval list (Created · Submitted · Approved · Paid — who · when, *Not yet* in #8A8A8A), *Prepared by · Approved by · Received by*. The credit note — Original invoice, Period, the credit as one line (what the invoice is for, the category's name under it — no GL code on a customer's document), Original invoice · (Other credit notes) · This credit · Revised amount. A draft or a voided document says so in its meta list (*Status*). The salary and statutory detail pages keep their place after their voucher, on the same sheet, their title, meta and column heads repeated on every page.
- **What react-pdf needs (found 2026-10-15):** a text sized off the page's 9.5pt names its own line height (the page's 1.45 is inherited as points); the footer is placed from the page's top — a fixed text drawn per page (`render`) anchored by `bottom` lands far above the page; no word is hyphenated (`hyphenationCallback`); a negative amount takes an en dash (*–RM 220.40* — Helvetica has no minus sign); only width, margin, padding, border, flexGrow and `flex: 1` set the layout (`src/lib/export/pdf.test.ts`).

### Finance's view — the phone app (v4.33, 2026-10-15)

README §1 and `prototype/Finance Mobile App.dc.html` (M01–M18): Finance's view on a phone is an app of its own inside the ONE install — `/fin-app` (route group `(fin-app)`, `components/fin-app/`, `lib/fin-app/`), for whoever wears Finance's view (`opensFinApp`). Part 1 draws the frame, the Overview, Daily › Payment and Receive, and Profile; the other tabs' hubs and every other page stand in their places, drawn in the parts after.
- **The frame** (`FinAppFrame`): fixed to the screen (pwa.md), `--hvs-ground`, Inter / Chivo Mono / Newsreader, the tab bar Overview · Daily · Fund · Report · Profile — Android 68px + `--safe-bottom`, the active icon in a 56×30 `--hvs-nav-pill`; iPhone 56px + the inset, the active in `--tone-clay-deep`. It stands only on a tab's root, slides away (`translateY(105%)`, .32s) when a screen is pushed, steps away on the Overview while reading down (the phone bars' `useTuckOnScroll`), and each tab reopens on the top tab it was left on. The toast is the walnut pill over whatever bar there is.
- **A screen** (`AppScreen`): a tab's root heads with the 32px walnut H, *HOUZS Venture · Finance* (10px caps) and its name (15/500); a pushed screen with iOS's blue *‹ Payments* and a centred 16/600 title, or Android's ← and an 18/500 title; a hub draws no head — its top tabs (48px, 13px caps .06em, the current ink 600 over a 2.5px accent underline) stick at the top and fill to the status bar. The head takes a hairline after 4px of scroll. What moves is the page under the head: in from 28% on a push, from −18% on Back (where it was left), a fade between tabs — .32s / .22s on the one curve; a hub swipes to the next top tab past 60px. The action bar (48px buttons, the primary 1.5 wide, ⋯ 52px) stands over the tab bar, on the floor when there is none. Payment's primary is one word, *Payment* (v4.66): *Create payment* filled it edge to edge on a 384px phone; its sheet is still *Create payment*.
- **A hub** (M02, M09): the month's total centred (Chivo 30/600) over its label, then a stacked card per list — min 124px, radius 14, padding 16/18/15, the name 16/600, the count mono 12, the figure mono 19/600 at its foot, a 240px arc and a 36px round icon chip — in README's fills (Pending approval black). The cards are the desktop hub's (`hub-cards.ts`).
- **A list** (M03): the eyebrow, the 28px Newsreader title and the 48px rule; the 44px search; the title and its count over the rounded card of rows — the name 15, a short description 12 muted, the amount mono 14.5 (a receipt's green, a voided one faint), the chevron — and the list's Create in the bar. Payroll batches fold their vouchers (or a department's, read by department) under each batch.
- **A record** (M04): the drawer's own parts (`VoucherDetailBody`) at the phone's sizes (`[data-fin-app]` in drawer.module.css) — and, since on a phone it is the voucher's page, the full page's too: whom it pays and into which account, the statutory lines, the audit log; the bar is the drawer's steps, the full page's Copy, Change date and Change GL account in its ⋯. *Print* opens the PDF.
- **The windows rise as sheets** (M05–M08, M18): every `FinDialog` drawn inside the app (`FinSurface`) is the design's bottom sheet — `translateY(105%) → 0` .32s on a .28 walnut scrim, radius 28 (Android) / 34 (iPhone), the 36×5 grab bar, a 20/600 title, iOS's round 32px ×, a form's sheet 92% tall (`tall`), 48px buttons across its foot (the primary 1.4 wide), 46px fields at radius 12, the calendar's 36px days in 42px rows across the sheet's width, a menu's 52px rows and iOS's Cancel under them, a confirm's Cancel and answer side by side (1 : 1.3). One window, every feature of it, on the computer and the phone.
- **The Overview** (M01): the office's date and quarter, the greeting (Newsreader 32), the line of what waits, eight quick actions (50px tiles, radius 15, the accent badge), a card per category (40px tiles) — the sidebar's rows (`finNavSections`). **Profile** (M17): who is signed in, Account (Edit profile, Change password — a personal login's), Admin (Audit Log, Departments, Meeting Rooms with their real counts), Sign out (asked).
- **Fields are 16px on a phone:** the portal's floor against iOS's zoom on focus (globals.css) holds in the app too — the design's 15px would zoom the screen on every field. The app and its sheets keep the design's heights (`[data-fin-app]`, `[data-sheet]` beside the other phone surfaces). A 32px select's 16px line fills its box there (`form.module.css`: no vertical padding, a 30px line), or its words lose their tails.

**Part 2 (v4.35, 2026-10-15) — Daily › Invoice and Billing (M10–M12):**
- **A month's hub** (Invoice, Billing): the total's label names the month, the month pill under it (README §1: ‹ October 2026 ›, 3px in, 36 × 32 arrows, a 120px 13/500 label, on white with a hairline) — another month is the server's to read (`?m=YYYY-MM`), the cards stepping back (.55) until it lands; a list keeps its month in the three-box nav under its head (M11: ‹ · month · ›, 44px). Billing's notice is neutral — ink on `--fv-notice`'s warm grey, a hairline (README: "neutral, black text"), never the prototype's blue.
- **Select** (M11): beside the search on All and Issued; *Select to settle* in Issued's bar. A ticked row wears the accent box and peach; the dark bar holds the design's *N selected · RM …*, the payer under it, *Clear* and *Settle N →* (pale when two payers are ticked — it says why). What else the ticked can have done — Print, Void selected (ours) — is the head's ⋯, so the bar keeps the design's two buttons. *Other months · N* (ours) is a chip under the search while selecting.
- **Lists that are no records** (credit notes, projects, non-billable, by company, staff, setup): the design's item lines — the label (two lines at most), its sub on one, the figure mono 13.5, the state as a chip (README's tones), a 36px button for its step; a line that has a menu or a page opens on the line itself.
- **A record is its page** here too: an invoice's drawer parts with the full page's period, address, contact, who made it, its description, the Trail and the Audit log (`InvoiceDetailBody`); an allocation's with who made it and its Audit log (`AllocationDetailBody`). Their steps are the drawer's (`invoiceSteps`, `allocationSteps`), a step the system refuses drawn pale and saying why when pressed.
- **Calculate is a screen** (the prototype's `vCalc`): the white card of fields, the preview, *+ Add expense · Save allocation* in the bar — the desktop's drawer, the same body (`useAllocationCalc`). The payroll basis is a screen of its own (Payroll ▾ › Payroll basis).
- **Every window the desktop's**, as sheets — Create invoice and Multi-line at 92% (the design's `inv-form`), Settle, credit note, the generators, staff, snapshots, setup. The steps are the desktop hubs' own (`useInvoiceWork`, `useAllocatorWork`).

**Part 3 (v4.36, 2026-10-15) — Fund › Fund out and Fund in (M13–M14):**
- **The hubs** (`FundApp`): *Fund out · {Month YYYY}* / *Fund in · …* — what moved this office month (`movedInMonth`) — over the user's cards, the desktop hub's (`fundCards`: Fund OUT by the loans' status, Fund IN by the source's type, Pending approval black). The bar: *Create fund out · Loan aging* (to the Report tab's Loan aging) and our ⋯ (*Export CSV*); *Record fund in*. Their windows are the desktop's dialogs, as sheets.
- **A list**: *II. Fund · Fund OUT* and the card's name; the search (company, description); *Transfers out · N · RM …*; a row the party, how it is lent (`fundLine`) and the amount, red out / green in, a cancelled one faint.
- **A deal is its page**: the drawer's parts (`FundDetailBody`) and, numbered on from them, what the full page adds — IV the repayment schedule (a line an instalment: its number and day, the remark or its principal · interest, the instalment in the plan's tone), V the repayments recorded (a loan's each with *Void*, asked in the kit's window), VI the terms over time (each segment, the current one chipped; a change opens onto its months; the latest one *Revert*), VII the repayment settings (funding source and repayment start *Edit*, minimum pay *Turn on / off*), VIII a fund source's notes, a cancellation filed — then the trail and the audit log (`RecordItems`: the drawer's numeral over the app's item lines). *Print* opens the schedule's print.
- **Its steps**: waiting — *Open in Approvals* (whoever decides it), a fund source's *Edit*, *Cancel loan* / *Withdraw*, asked first; live — *Record repayment* (a loan's one type at a time, posted at once; a fund source's the draft voucher Create payment files, then opened in Payments to be sent), *Amend terms*, and in the ⋯ *Request cancellation* (a loan's asks why; shut, saying why, while its repayments stand). A date field's sheet is tall, so its calendar opens below it.

**Part 4 (v4.37, 2026-10-15) — Report › P&L, Cash flow, Debtor aging, Loan aging, Balance sheet (M15–M16):**
- **A report is a hub** (`ReportApp`, the figures `lib/fin-app/report-model.ts`): its headline centred — *Net profit · October 2026*, *Net cash flow · …*, *Owed to HV · as at 15 Oct 2026*, *Loans outstanding · as at …*, *Total assets · 31 Oct 2026* — the month pill under it (ours, as Invoice's: another month the server's to read, never past the office's), the page's state in a word as the desktop's chip (*Unpaid as of today*, *Segment only · won't balance*), then a stacked card a part. The parts are the system's statements' own, in the design's style: the P&L's Revenue · Cost of Goods Sold · Other Income · Expenses; the Cash Flow's Money in · Money out (the user's sections, Edit layout) · Bank balances; the Balance Sheet's (Fixed Assets ·) Current Assets · Liabilities · Equity (the cumulative P&L inside); Debtor aging by days since the invoice (0–30 · 31–60 · 61–90 · 90+); Loan aging by days late (Not due · 1–30 · 31–90 · 90+), then *To repay · Fund IN* and the open balances each side.
- **A card's list**: *III. {report} · {month}* and the part's name; its groups of lines — an account's name over its code, the figure (red when it went the other way), the part's total closing it; an invoice or a deal with *Open*, into its record in the app.
- **The bar is the design's** *Export PDF · Export Excel* — the desktop page's own files, for whoever may export them; the ⋯ holds the page's other files (*Summary …*, *Outstanding …*) and the *Segment* (a segment's figures say whose they are, under the headline and over a list). The current top tab scrolls into view (Report's fifth, Balance sheet, is past a phone's width).

**Part 5a (v4.49, 2026-10-15) — Daily › Approvals and Daily Bank (pages the design does not draw, in its style):** a sidebar row with no top tab is a screen pushed over the tab it was opened from (`/fin-app/page/<row>`, *‹ Overview*), drawn as a hub is — the figure centred, a stacked card per list — and its lists, lines and records as the parts above.
- **Approvals** (`ApprovalsApp`, the figures `lib/fin-app/approval-model.ts`): *Pending · to approve* centred, the oldest wait as a chip under it (*Oldest waiting · 13 days* — alert from three days, quiet before), then *Pending* (black, README's Pending approval fill), *Submitted by the executive*, *Decided · 30 days* (olive: the decisions the card counts, a combined one folded and its members counted). A list row is what it is and who sent it when — *Office Rental - E2803 · ONG MEI SHUANG · 12 Oct*; the kind only when it is not a payment voucher; a combined one *Combined · 12*, named by its shared head or *SIA JONAS + 11 more*. *Select to decide* (and *Select* by the search) ticks only what is the reader's to decide (a row that is not says why when pressed); the dark bar is *N selected · RM …*, *Clear* and *Approve N →*; *Reject N…* and *Select all* are the head's ⋯.
- **A request is its page**: the drawer's dark hero (its kind, the status chip — *Pending*, *Awaiting sign-off* for whoever may not decide it, *Approved*, *Rejected* — the number, the amount, *Pay to …*, the status sentence: *Waiting for your decision.* or why not), then the desktop request page's facts as numbered groups — Pay to, When & where (the bank's balance; *Insufficient bank balance* in red when short, and *Approve* pale saying why), Deducted from, the files (opened by a signed link), a loan's terms, the request (kind, who sent it, when decided, the decision notes). The bar: *Approve · Reject · ⋯* (the voucher, the loan or fund source in the app, a payroll run's page); decided, the record's own links.
- **A combined approval** is a screen of its own: its hero, *I. Vouchers* as item lines — each *Approve* (green) until pressed to *Reject* (red, its figure faint), *Open* into the voucher in Payments — *II. Approved together* (a loan riding along, which cannot be split: then the bar is *Approve · Reject* for the whole). The bar says what will happen — *Approve all 12*, *Approve 11, reject 1*, *Reject all 12* — and its ⋯ ticks all one way.
- **The sheets are the desktop's words**: the request kind's own sentence (*Approving authorises the payment for execution and records your decision in the audit trail. This cannot be undone.*), the notes, *允许部门池透支 · Allow dept-pool overdraw* as the kit's tick card, a rejection's reason before anything is sent; a refusal stays in the sheet in red. A confirm's sheet is as tall as its words.
- **Daily Bank** (`DailyBankApp`, `lib/fin-app/daily-bank-model.ts`): *Total available · Today · 15 Oct 2026* centred, the day between its arrows under it (the hub's pill, a day for a month: another day the server's to read, never past the office's today), a card per bank (the primary walnut, the others slate — *B/F … · +… · −…* and what it has free), *Received today* (olive), *Pending payment* (black), *Balance B/F* (the quiet fill). A bank's list: *The day* (B/F, Received, Paid out, Balance, Pending, Available), *Departments* (each one's walk and what it has free), *Pending · awaiting Principal*, *Received* (and *Other (JV / transfer)*, the desktop's line for money in without a receipt). The bar: *Export PDF* (for whoever may export) and *Today* on another day.

**Part 5b (v4.50, 2026-10-15) — Report › General Ledger, Receipt & Payment, Trial Balance, Company Statement, Base Rate History:** one frame for a page drawn as a hub (`PageApp`, the model `lib/fin-app/page-model.ts`; the figures `lib/fin-app/report-pages.ts`): the headline centred, the page's state as a chip, the period between its arrows (the server's to read, never past the office's month), a stacked card a part, a card's groups of item lines, and a line's own screen where it has one (`?d=`), a record opening in the app with *Open*; the desktop page's files in the bar (*Export PDF · Export Excel*, for whoever may export), the Segment in its ⋯.
- **Trial Balance**: *Total debit · as at 15 Oct 2026* (a past month as at its last day), *Debits = credits* or *Does not reconcile · RM …* in red; a card a type (Assets walnut, Fixed assets slate, Liabilities clay, Equity and Revenue olive, Cost gold, Expense clay) with its net on its own side and *Dr … · Cr …*; its accounts grouped under their top parents, each *Dr 1,500.00* / *Cr 800.00*.
- **General Ledger**: *Debits posted · October 2026*, *75 accounts · Dr = Cr*; a card a type, each account's closing balance as the desktop writes it (*1,300.00 Dr*), its period's Dr and Cr under its code; an account opens onto its entries — *Balance B/F*, each entry with its running balance first in the small print (*1 Oct · bal 1,500.00 Dr · JE-…*), *Balance C/F*.
- **Receipt & Payment**: *Net · October 2026* over *Receipts*, *Payments*, *Bank balances* — the Cash Flow's own figures — and, for one segment, *To collect* (gold: its issued invoices still owed, each opening in Invoice).
- **Company Statement**: *Collect RM …* / *Repay RM …* as the headline; *To collect* (olive), *To repay* (clay), *Counterparties* (walnut, the net each way); a counterparty opens onto its deals in the desktop statement's words (*4.000%/mo · 3mo · starts 2026-10*, *due … + … interest · 3 left · by 2026-12*), each opening its loan or fund source.
- **Base Rate History**: the current rate as the headline, its change as the chip; *History*, *Weighted cost*, *Op margin* — each the quarters by that measure.

**Part 5c (v4.52, 2026-10-15) — Journal Entries, Repayment Schedule, Invoice Financing, Reconciliation, Statements:** each a hub of the desktop page's own cards, its lists, a record as its page (the drawer's dark hero and numbered groups), the desktop page's steps in the bar — the first two, the rest in the ⋯ — and its forms as the kit's sheets; a step's refusal stays on the record as a Notice over the hero.
- **Journal Entries** (`JournalApp`, `JournalVoucherSheet`): *Posted · <month>* over *This month*, *Manual vouchers*, *Payroll accruals*; a voucher's page — its lines closing on their totals; *Edit · Copy · ⋯ Delete* (an accrual's *Fix mistakes*); *+ New entry* — a line is its account over its debit and credit, its note under them, *Balanced* / *Out of balance · 10.00* as it is typed.
- **Repayment Schedule** (`PageApp` + `lib/fin-app/repayment-model.ts`): *Net to collect · <month>* between the arrows; *To collect*, *To pay* (each the desktop's due table, then the Full plans), *Calendar* (days), *Done so far*, *Overdue / short* (gold while short, pale when not).
- **Invoice Financing** (`BaApp`, `BaSheets`): *Active face* over *To charge borrowers*, *To pay HC*, *HV margin*, *Financing register*, *Limits*; a financing's page with *Generate PV · Bill interest · ⋯*; *Record financing* (the bank's advice, *Auto-read →* where the reader is on, the borrower, the terms — each rate's figure under it, the day chips — what they come to on the summary card, HV margin on peach, the over-limit warning) and *Calculator* (the same, nothing saved).
- **Reconciliation** (`ReconApp`): a card a bank against its GL, *Monthly reconciliations*; a month's page; *Match lines* — two ticked lists (statement, then book), the sums as a notice, *Match N ↔ M* pale until they agree; *Report*.
- **Statements** (`StatementsApp`): *Net · <month>* between the arrows over *Statements · <Month>*, *Draft*, *All statements*; a statement's page with *Issue to subsidiary* / *Mark as paid* and *Print statement*; *Generate statements*.
- **One-way steps ask first** (v4.53): a press nothing in the app undoes — *Issue to subsidiary*, *Mark as paid*, *Bill interest*, *Mark executed* — opens the kit's question (*Issue to <company>?* · *<month> · <net>*, *This cannot be undone.*, *Cancel* · the step); a step with its own way back (Mark settled, Mark done, Submit for approval, a match) stays one press. The computer asks the same since v4.60 (Finance's pages on the sheet).
- **Part E3** (v4.54): *Dept Pool* (*Total balance* or *Net margin* over By department — a balance ••••• until *Show balances* — Balance by bank, HR costing), a department's page (`dp-<slug>`: its Cash Flow, the P&L a press away, a month between the arrows), *Venture Pool* (*Running balance · all-time*; This month, 12 months, Pool ledger), *Audit Log* (*Saves today*; Latest changes by day — a save's records and fields, a record's *History*; Areas you read; *Filter* · *Older* / *Newest*; ‹ Profile) and *Meeting Rooms* — the Revenue app's Book a room itself, in its own frame and theme (`data-revenue-app`, Inter Tight), ‹ Profile.
- **Part E3b** (v4.55): *Departments* (*N departments · N cost centers*; Departments, Bill back salary; a department's screen with *Bill back salary*, *Switch to …* and *Provision* — the last two asked first; *+ New department*; ‹ Profile) and *Chart of Account* (*N active accounts*; a card per type with its range; the type's tree with search and *Show inactive*; an account's screen; *+ New account*, *Edit* — a new type or code asked first).
- **Part E4a** (v4.57): the request queues — *Claim requests*, *Dept Payment Requests*, *Payroll Requests* (Payments' menus open them on the request pressed): what waits for a voucher, what is with the Principal, a request's screen; *Raise voucher* / *Generate PV* and Payroll's *Fund* (each department's share, the desktop's checks) in the kit's sheet; *Cancel request* and *Send back to HR* asked first; a raised voucher opens in the app.
- **Part E4b** (v4.58): nothing in the app opens the portal — Fund's *Amend terms* and a pending source's *Edit*, Invoice's settle on a receipt, *Refund* and *+ Add non-billable expense* (Create payment with a preset) and a contract's new / edit, a voucher's *Edit*, are sheets; *Print* draws the schedule over the app; a statement's print stands outside the portal frame. Finance's view on a phone opens the app from `/` and every portal page; the Profile switches views for an account that may.


**HR & Payroll**

### HR's view — Attendance (v4.34, 2026-10-15)

The Attendance handoff (`HR Portal Desktop (standalone).html`, `source/HR Attendance.dc.html`, measured at a 1600×1000 window — at 1440×900 its stage scales to 0.947): HR's sidebar is the handoff's eight sections at **248px** (Finance's stays 212), and Attendance is section II — Today · Records · Requests · Leave balances · Month close · Settings · Readiness (`/attendance/*`, `lib/hr-nav.ts`). The rules: `.claude/rules/hr/attendance.md`.
- **The kit** (`components/ds/`): the design system bundle's Button, Field / Select, SegmentedControl / Switch, StatusChip, DescriptionList, DataTable, the right-hand Sheet (10px inside the content frame, 40px + fade over 340ms), the prototype's fixed SidePanel (480 / 460px), Settings' CenterWindow (620px, radius 14) and the one-line Toast (2.2s). A panel portalled to `<body>` brings `.sheet-theme` and `[data-fin-kit]` with it.
- **The pages**: Today's lanes (Clocked in · Late · Not in yet · On leave) and the person calendar; Records' people × days matrix (drag to select, set / clear, a whole day for everyone); Requests' queue, record and route tab; Leave balances with the ledger; Month close (decide each day, the register, close / reopen, CSV); Settings' eight tabs; Readiness' checklist. HR's Overview opens on the handoff's tiles and the news.
- **No descriptions**: the prototype's page subtitles and drag hints are left out (No descriptions on the page). The punch itself is not on these pages — the apps carry it (`att_punch`).
- **Month close sends payroll** (v4.51): Close freezes the month and puts each HQ person's overtime and unpaid days on the month's payroll row. Its toast says both — *October 2026 closed · 12 people frozen · 10 sent to payroll · 2 not sent* (*payroll not updated* for a closer who may not edit payroll). Once closed, Outputs › Payroll reads *All 12 in payroll* / *10 in payroll · 2 not sent* for a payroll reader, each one not sent on its own line under it — 26px avatar, the name, a warning chip with the reason (*Completed — unlock it*, *With Finance — resubmit*, *Paid — resubmit*, *No payroll row*, *Not sent*) — and *Open payroll* opens that month's payroll. The register CSV adds *OT hours*, *Rest-day OT hours*, *Holiday OT hours*.
- **Leave balances by department** (v4.65): the People list's search is followed by Records' own *All departments* dropdown; the pills (*All* · *2 days or less* · *No opening*), the list and *Export* count inside the department picked.
- **The user's answers** (v4.56): Today's *Not in yet* lane ends in *Remind all* — the handoff's lane action, a small secondary button full width under a hairline, only while the lane has people — and its toast names who could not get one; a fixed-hours (No clock-in) person shows only on a day on leave, in *On leave*. The person calendar's picked day draws each punch's photo in its IN / OUT tile (cover, under the IN · 09:02 chip) with the device and the fence under it, and *Mark invalid* (clay, 11.5px) beside that — it opens the editor's frame (1.5px ink border) with *Reason* and *Mark punch invalid*; an invalid punch is listed struck through with its reason. Requests' *Download* / *View* open the file: a picture (contain) or a PDF fills the 3:4 sheet; anything else keeps *Preview not available*. Settings › Policy › Overtime adds *By wage: OT paid up to* (RM … a month); Who clocks' window opens on *by wage*; the leave type window ends in *Balance and pay* — a bordered card of rows (*Earned month by month*, *Unpaid*, *Counts calendar days* as Switches; *Comes out of* a 210px select). Readiness adds *N people who clock have no hire date*.
### Payroll grid (v3.3, 2026-09-05 — HR → Payroll)

Every row is a form, so the grid neither folds nor sheds columns. Values: `globals.css` › "Payroll grid".

**Frozen panes** (`.pg-well > .pg-scroll > table.ledger-table.payroll-grid`)
- **Frozen on the left:** ✓ · Name · Status · Gross · Net · ⋯. Their offsets come from the `--w-*` widths.
- **Scrolling beneath them,** each group opened by a `.g1` hairline:
  - Earnings (5);
  - Deductions — Unpaid · Deduct · SKBBK · EPF / SOCSO / EIS EE · PCB;
  - Employer — EPF · SOCSO · EIS ER.
- **Pinned:** both header rows and the `<tfoot>` totals.
- **Load-bearing — keep all three:**
  - the well scrolls itself both ways, because a sticky edge holds only inside the element that scrolls;
  - `border-collapse: separate`;
  - frozen cells paint an opaque `--row-bg` — a translucent tint shows the scrolled cells through.
- **Below `md`** only ✓ · Name freeze.

**Inputs and figures**
- **Typed figures** are `.pg-in` (`.dirty` until saved, `.zero` faded).
- **Computed figures** stay a bare `.num`: Gross, Net, pro-rata, cost to company. The contrast says what can change.
- **Every statutory figure is an input.** One typed over JADUAL (`.manual`) shows an accent dot and stays until *Reset statutory to JADUAL*. Declare it after `.dirty` / `:focus`, or their `background` shorthand wipes it.

**Status and band**
- **`td.pg-status`** holds one chip: `Draft` · `Open on Comm Cal` / `On Director Salary` · `Completed 27 Sep` · `Submitted #2` · `Paid` · `Resubmit · editing` / `ready` · `Second payroll · editing` / `ready`.
- **`.pg-band`** subtotals Gross / Net under the columns it sums, and counts the states.

**The row menu** — the ⋯ or a right-click opens `PayrollRowMenu` on `MenuPanel` (**Membership context menu**):
- *Open paycheck* / *Open on Comm Cal* / *Open on Director Salary*;
- *Complete*, *Unlock*;
- *Reset statutory to JADUAL*;
- *Resubmit…*, *Second payroll…*;
- *Put back as sent*.

Shift + right-click keeps the browser's own menu.

**The paycheck window** (`.pg-win`) is a second view of the row's own edits, never a copy.
- **It shows:**
  - n / N, ‹ ›, × / Esc;
  - Earnings;
  - Deductions (*Withholding tax* read-only where the People record says so);
  - Employer (*Reset to JADUAL* while typed);
  - Computed;
  - Payslip · Save.
- Closing returns the focus to the name.

### Payroll batches (2026-09-27 — HR › Payroll, the unified Payroll)

Everybody's pay on one grid:
- **Staff** keyed here;
- **the Revenue team** closed on Comm Cal;
- **Directors** Completed on Director Salary, as a read-only *Director* band.

**Header actions never turn into a state.**
- **`Submit to Finance · N`** sends whoever was Completed since the last press. With nobody Completed it is disabled (*Nobody completed and waiting*). It confirms inline — headcount, CTC, a department table, the top-ups — never in a modal.
- ***Total Close*** stays disabled while anyone is waiting; the names are in its tooltip.
- **A closed month** gives only the Principal *Reopen month*, which asks why.

**Submitted to Finance** — a `.sect-head`, then one row per batch:
- `#N` and its top-ups, when and by whom;
- headcounts by department — never a name or a person's pay;
- CTC;
- a funding chip: *Waiting for Finance* · *Funding PV with Principal* · *Funded* · *No funding request* (*File request again*) · *Sent back by Finance*.

The approval state lives here, per batch.

**Selection** — *Complete N* · *Unlock N* · *Delete N* · *Clear*. A row that can take none of them has a disabled tick, with the reason in its tooltip.

**Resubmit… / Second payroll…** — a correction, or a planned second payment, for somebody already sent. Both confirm inline and unlock the row; amounts only go up, and the next batch sends only the difference.

Finance reads the batches as `BATCH #2 · HR 5`. *打回 HR 重做* sends back that batch alone.

**Department mode** — *Cost center* / *Centralized*, via `DepartmentModeSwitch`.
- **Where:** under a department page's head, and in Settings › Departments.
- **Flipping never acts at once.** An inline `.dept-mode-ask` says what will happen.
- **Only the Principal** may flip it.

**Billing Allocation follows the grid** — a card per payroll row of a cost-center department.
- Past draft, a card freezes. Its foot names the way back: *Unlock them on HR › Payroll* / *Reopen them on Comm Cal* / *Resubmit them*.

### Payment statement (v3.7, 2026-09-11 — HR › Payment)

On the sheet (`payment-statement.css`, `payment-tables.css`).

**Layout**
- **The top:** three cards (Total payroll cost is the walnut one) and one framed panel for reconciliation, funding and dates, its next action in the footer.
- **The report** (an inline-size container) stacks at 680px or less.
- **Tabs:** Salary / Statutory (`.sheet-tabs`).

**Figures**
- Paid totals count paid vouchers only.
- One scheme's excess never offsets another's outstanding.
- *Changes from the previous month* belongs to Salary alone.

**Closing** — the month closes only when every positive statutory contribution is covered by a paid voucher. SOCSO and EIS stay separate under PERKESO.

**Generating — two ways, nothing else**
- **Generate by Department:** one PV per scheme.
- **Manual generate:** a quiet button for an exception — one PV per person per scheme, which names that person's pay.

**The `GenerationWindow`** (native `<dialog>`, `showModal()`)
- **Scroll and focus:** only the employee table scrolls; `main` locks; focus returns on close.
- **What only confirmation does:** it never closes mid-generation, and only an explicit confirmation creates PVs.
- **Review** freezes people, amount and date.
- **Statutory runs** are atomic. A voucher's contribution lines are a snapshot (date / notes edits only).

### HOUZS Venture's director share (v3.78 / v3.82, 2026-10-13 — Director Salary › Pool Breakdown)

HV pays a share of the directors' CTC out of the department pools HR picks. The directors' payroll pays it.

**The Pool Breakdown's first row is HOUZS Venture · HV**, counted in *Director Pool Total*.
- **Its chip:** `Waits for payroll` · `In payroll #7` · `Directors sent`.
- **Locked** once it is in payroll, until Finance sends that batch back.

**Save opens `HvSplitWindow` while HV pays anything.**
- **The head:** *Deduct RM x from*, then *By amount* · *By %*.
- **The lines:** one per department — the soft dropdown (a department picked elsewhere is greyed) and the figure.
- ***+ Add department*** adds a line holding what is left.
- **The foot** says what is left (*RM 1,500.00 left to place*, *80% placed — 20% left*, *Marketing is picked twice*).
- ***Confirm*** stays disabled until it adds up.
- **It opens on** the split last sent. At zero, Save goes straight through.

**The Submission tab** ends with *HOUZS Venture's Share*: Department · Share · Amount, the total in `<tfoot>`.

**Finance sees it only as payroll.** A pool is named by its department (*Revenue Department Pool*), never by its key.

**Revenue Department (the portal)**

### Comm Cal's month — the workbench and its rail (2026-09-26 → 10-03)

**The front page** (HR's view, v3.19)
- A status strip: ERP receiving · last delivery · Pays from … · Change · **Data source ›** — the 440px drawer (Part III › ERP link card).
- Five cards. The latest month's commission reads amber *Not computed*, never a walnut "—".
- The months as a grid, each source a chip with its file under it.

**The month** is ONE table design. `CommissionWorkbench` holds the rail: *Total Sales Orders · KPI Items · Open Bill · Below deposit · Sales exhibition · Drops & upsells · Double claims*.
- **Every panel** is a framed table with a sticky first column and a sticky answer column (Total commission, Allocated bonus, **Still to collect**, Sales value), plus a `tfoot` subtotal.
- **A panel that summarises** opens on four figures.
- **A salesperson's page** adds *Below deposit* beside Personal / Overriding.
- Measurements live in `commission-workbench.module.css`.

**The payroll bar** (`PayrollBar`) is one card under the cards, saying what payroll holds.
- It shows the month **as saved**: a draft on screen never moves it. It hides on a salesperson's page.
- A left rule and a dot in the state's tone:

  | Tone | State |
  |---|---|
  | accent | not sent yet |
  | `--ledger` | in payroll and matching |
  | `--alert` | in payroll; the live figure has moved |
  | `--danger` | something to settle first |
  | muted walnut-sand | settled by hand, or the payroll month is closed |

- It reads like *PAYROLL · SEPTEMBER 2026* / *In payroll · RM 91,971.90*.
- It has **no button**: sending is per salesperson, on the per-person close.

**Quiet until asked**
- **A fold is one line.** The payroll bar and *Bills priced RM 0* are each a `<details>` whose `<summary>` is the whole box: chevron · name · state · at most one tag (*N to settle*, *Moved since*, *Payroll closed*). They start closed on every visit.
- **One set of switches,** *This month pays*, lives in Review settings. While a draft is open its summary carries a **Draft** tag, because *Reset draft* lives inside.

**The review tabs** — **Drops & upsells** (`?view=changes`) and **Double claims** (`?view=claims`).
- Built on the server (`reviews={{ changes, claims }}`). A tab with no panel is not drawn.
- The badge counts what waits on a person and turns alert above zero.
- **A double claim card** (`double-claims.module.css`) answers why first:
  - a verdict chip — danger *Would pay twice* / *Same sale twice*, alert *Second bill on the paper* / *Same number only*, info *One sale, two documents*, ledger *Settled*;
  - **Why it is here**, **What to do**;
  - the bills side by side with *Match* ✓ / ≠ / ?;
  - **History**;
  - *Checked — separate sales*.

  A bill opened from it leads back with **← Double claims**. Bills with no readable paper are listed in an alert-tone `<details>` and not counted on the badge.

**Sales exhibition** (`?view=exhibition`; `?view=venue` still works) — one row per brand's booth at each fair, Brand sticky first, filtered by `?brand=`. A venue opens its bills on All bills (`?fair=…&brand=…`), which leads back with **← Sales exhibition**.

**The workbench stands in the URL** (`lib/commission/workbench-nav.ts`)
- History entries: `?view=` (`kpi`, `open`, `deposit`, `exhibition`), `?person=` and `?orders=` (`overriding`, `deposit`).
- Replaced in place (`replaceState`): `?q=`, `?brand=`, `?sort=`.
- A bill's link carries `?from=`, and the bill leads back first (**← ANTHONY**, then *All bills*) with a `ReturnLink`, which steps Back instead when the previous entry is that page.

### Closing — a lock you can see (2026-09-27 — Revenue › Comm Cal's month)

A salesperson's month is **closed** once checked: the commission is locked at that figure (`close-controls.module.css`).

- **The close bar** above Total Sales Orders: "N of M closed", "RM … locked", a meter; *Close N ticked*, *Reopen N*, *Clear ticks* (nothing ticked: *Close the N still open*). **Several never close on one click** — an inline strip confirms the people and the RM. Done, the bar turns green. A reason it cannot close disables the buttons; *moved since* names who.
- **The list.** The tick is in the sticky first cell (Part II › Multi-select); a closed row carries **CLOSED** and a faint wash; *moved since* adds `Live now RM …`.
- **The ledger's walnut header**: *Close NAME* / *Close & next →* — one person closes without a confirm; closed, a stamp (CLOSED · when · who) and *Reopen*; a moved close lists what moved.
- **Bills priced RM 0** (paid, priced RM 0 in the ERP, earning nothing): a folded alert box and a tag; closing then needs *Close anyway*.

### Rows from another month (2026-10-12 — Revenue › Comm Cal's ledgers and All bills)

- **Status** is the column after *Sales order*. A row from another month shows a `.chip` with where it came from under it: *Top up deposit* (`wait`) · *Aug 2026 bill*; *Late* / *Early key-in* (amber); *Upsell* (green) / *Drop sales* (red) · the bill's month; *Below deposit*, *After close* (`info`, still held). The month's own bill shows `—`.
- **The wash.** A row whose commission THIS month pays for another month's sale wears one cool wash (`--work-other-month`, `.otherMonth`, a Harbour rule on the first cell). **That colour means nothing else on the sheet.** Held rows are named, not washed. The foot counts washed rows.
- **Upsells and drops** link to the bill they changed; *Salary calculation · current preview* lists each under *Current commission* in the same wash.
- **A settled bill the ERP changed** opens on *Changed after it was settled* (*N CHANGES*): Found · Change · Salesperson · Settled · ERP now · Difference · Paid.

### The ERP audit trail (2026-10-13 — Revenue › Comm Cal's bills and Drops & upsells, v3.71)

The portal records every ERP save (`lib/commission/erp-changes.ts`).

- **One chip vocabulary:** *Upsell*, *Reinstated*, *Opened* (green); *Drop sales*, *Cancelled*, *Deleted in the ERP* (red); *On hold*, *Back to draft* (amber); *Changed* — moved nothing that earns (grey). A drop the ERP found is named *Cancelled* / *On hold* / *Reinstated* / *Not counted* wherever it appears.
- **The bill's page** adds *ERP audit trail* (*N SAVES*, one state line, newest first): Saved · Change · Earned before · Earns now · Difference · What changed · Commission (*Not given yet…* / *Given (Closed · Sep 2026) — …*).
- **Drops & upsells** gains *What the ERP changed* and *Commission given*; a question paid this month keeps *Pay in …* shut, its tooltip naming the first month it may be paid. `ErpChangesPanel` lists the month's saves.
- **A shared bill, and a cancellation taken back by itself** (v3.76): the split names everybody under the seller (*Split by share · MELVIN CHONG 50% · LUCAS 50%*, `holdersLine`), and a drop splits the same way. A cancellation the feed deducted itself shows *Deducted directly*, in the current month; Undo sends it back to be asked.

### ERP link card (2026-09-13 — Revenue › Comm Cal, Fair only)

Comm Cal's **Data source** drawer (`DataSourceDrawer`, `revenue/_components/commcal/CommCalBody.tsx`); the status strip reads *ERP receiving · last delivery …*, *ERP linked* or *ERP not linked*.

- **Houzs ERP** with *Receiving* / *Waiting for the ERP* / *Not linked*; linked, `key ····a1b2 · pasted by … on …`.
- **The key** — a password field, never echoed back (*Link*; *Save key* when replacing).
- **Ignore orders before** — the feed window (`erp_feed_settings.min_order_date`).
- **Replace key**, **Unlink** (deliveries refused from then on; received orders stay).
- **ERP live feed** — the last event; salespeople it could not place, each matched to a person or marked *Not ours* with a reason (*Put back* undoes).

No test button: the ERP's own page proves the key.

### Rules (v3.20, 2026-10-10)

`revenue/_components/rules/` — a side list grouped *Pay structure · Item rules · Headcount · Policy*; a section opens with its title alone.
- **Scheme rules** — the eight components as rows: toggle · label · description.
  - An orange dot marks a switch changed since the last save.
  - A component's settings open under its row.
  - *Defaults* has no cost-basis row; that is set only in Product List › Costing Setting.
  - Save reads "Saved" until something moves.
- **Ranks** — Rank · Product rate · Held by, edited in place.
- **Capacity** — figure cards, the *Headcount limit* box, and how many wait for a seat.

### Sales Groups (v3.21, 2026-10-10)

`revenue/[sub]/hierarchy/_components/` — tabs *Chart · Members N · Waiting list N · Replacement list N*.
- **Chart** — one toolbar row (figures, a *Show IR alongside* toggle, Find, Tidy, zoom) over the canvas.
- **Members**
  - Above the grid: REPORTS TO with director chips, *+ Add director*, *+ Add member*.
  - Rank / Rate mode / Withholding are `plain` soft dropdowns. A changed one turns peach, and a peach save bar sticks to the foot.
- **Waiting list, Replacement list** — position and status. A row opens a drawer of facts and history.

### Waiting list flow (v3.22, 2026-10-10)

`WaitingList`, `WaitingFormSettings`, `AddToWaitingList` (`hierarchy/_components`); `WaitingTransferForm` (`team/people/new/_components`).

**The tools above the list:** **"+"** (v3.54, Member services · Edit only), *Upload form* (once a form is uploaded, the file's own icon instead — never its name), *Form settings*.

- **The uploaded form** (v4.22) — a 31px square in the uploaded green holding its file's icon, as an app would show it: Word's **W** on blue (.doc, .docx), **PDF** on red, a picture on orange, **</>** on walnut (HTML) — the Data center's badge colours. Its name is the tooltip; nothing on the button reads it.
- **Its menu** (v4.20) — a click replaces the file; a right-click (Shift + F10 from the keys) opens its paper menu, `FormFileMenu` on `MenuPanel`: the file's name, *View*, *Remove…*. Shift + right-click keeps the browser's.
  - *View* opens a 640px drawer (`FormFileViewer`, Documentation's preview drawer): a PDF in the browser's viewer, a picture as it is, a Word .docx read in the browser, an HTML form as its page — those two in a sandboxed frame. An old .doc reads *No preview for .doc files.* beside *Download*.
  - *Remove…* asks beside it (Cancel · **Remove**, the danger one). The chip reads *Upload form* again; a refusal stays in the panel.

- **"+"** opens a 460px window: name, phone, joining date (a day, or the *Any time ready* tick under it — the day then empty and disabled; 2026-10-14), *Submitted by*, HR's questions, the signed form (optional or required), then *Add to the list*. The row then shows **Added by** — never *Signed by*.
- **The applicant drawer** (400px) holds *Fail* (asks Keep · Fail), Close, and *Transfer*. Transfer is disabled while the place is full and links to Rules › Capacity.
- **Form settings** (a 600px drawer) holds reorderable question cards and *Save as vN*.
- **The Replacement list** shares the tools (v3.43, `MemberFormTools`). Its five built-ins include Reason, which the database needs.
- **Transfer** opens the employee form: carried-over fields are marked, then *Add to company*.

### Org chart canvas (v3.4, 2026-09-09 — Revenue › Staff Hierarchy)

The one surface that is not paper — Revenue's spaces and People › Hierarchy's chart (`.org-canvas.space-canvas`). Everything around it keeps the portal's tokens. Values: `globals.css` › "Org chart canvas".

**`.org-canvas`** re-declares the palette as `--cv-*`: a slate ground whose dot grid says "this pans", and white cards ΔL* ≈ 10 above it. Never use it for a table.

**`.org-card`** (`HierarchyPersonCard`)
- **It shows:**
  - the name and a rank chip;
  - the title badge;
  - `n/N directs · SDL earned` where a limit applies;
  - a last row **`Upline · NAME ⌄`** — a button that opens the Move popover. At a tree's top it reads `Top of team` / `Reports to · KRIS · PETER`.
- **Its line is `reports_to`.**
- **A shadow only while dragged.**
- **States:** `.sel` · `.can` · `.forbid` · `.target` / `.bad` · `.fresh` · `.unplaced`.
- **Right-click or Shift+F10** opens the person menu.

**`.org-pop`** (`MovePopover`)
- **It shows:**
  - everyone, by tree;
  - the current upline marked;
  - who may not take the mover, greyed with why (`their downline` / `no downlines` / `lower title`);
  - a filter;
  - *Top of their own tree* last.
- **No rank is asked** — it follows the title.

**The `.space-director` row** — the Revenue Director layer as a **rail**: every director once, A→Z, above all the frames, under `REVENUE DIRECTORS · REPORTING ONLY` (`directorRail`, `lib/hierarchy-space-layout.ts`).
- **The card** reads **`Directs · Fair · IR`**. It is HTML in the viewport portal, not a node: nothing drops on it and it takes no upline.
- **The lines:** one dashed line per sub-department lands on the frame's top edge. Nothing is drawn inside a frame.
- **The frame's header** gains `Reports to KRIS · PETER`.
- **Never use it for anybody with a rank.**

A card dropped on empty ground stays there (`localStorage`) until Tidy or any move. Motion is off under reduced motion.

**Membership context menu.** `PersonContextMenu` — compact portalled paper menus. Never a scrim, a modal or a centred dialog.
- **`Add to department ›`** opens a destination's titles. Only clicking a title adds the membership; the server rechecks it.
- **`Change title ›`** keeps the upline and rate mode.
- **`Remove employee ›`:**
  - `Move to other department`;
  - `Remove from this department` — a home membership is never removed alone;
  - `Terminate employee` — keeps the history.

  Each ends in an adjacent confirmation; only its final control is danger.
- **A hover or a pick never saves.**
- **Panels flip and clamp.** With no room, the child replaces its parent with a Back row — only on a click or Right arrow, never on hover.
- **Keys:** arrows, Right, Left / Esc; an outside click closes the menu.

**Bill context menu.** Every bill has ONE paper menu: `BillContextMenu` on `MenuPanel` and `membership-controls.module.css`, via `useBillMenu`.
- **Where:** All bills, Comm Cal's ledgers, the ERP changes panel. An upsell or a drop has none.
- **Opening:**
  - a right-click, or the ⋯ by the order number (always shown on a coarse pointer);
  - the browser keeps Shift + right-click, selected text and form controls;
  - a double-click opens the bill (Ctrl / ⌘ in a new tab).
- **Rows, one line each, the detail in the tooltip:**
  - `ORDER · SALESPERSON`;
  - *Open bill* (+ in a new tab);
  - *Share this bill…* / *Cancel share with X*;
  - *Move to another salesperson…*;
  - *Don't count this bill…* / *Count this bill again*;
  - *Brand for the margin…*.
- **Disabled, with the reason, for:** a paid month, a closed salesperson, a bill the ERP keeps out.
- **Writes:**
  - *Don't count* confirms adjacently;
  - *Share* and *Move* open adjacent forms — never the owner, the closed greyed;
  - the owner keeps a part.
- **After a write** the table says what happened, with *Undo* and **Open X**.
  - A shared bill is one row per holder.
  - A moved bill carries `Moved from X`.

### Revenue hierarchy spaces (approved 2026-09-11)

The active sub-departments of one department share one pannable canvas (the look: Org chart canvas).
- **Frames:** a labelled frame per sub-department, and a quieter frame per reporting tree, both at free coordinates.

**Title badges** (`.oc-title-badge[data-title-tone]`, `--title-*`) follow the membership's title. Rank and pay chips stay neutral.

| Tone | Colour | Titles |
|---|---|---|
| `leader` | purple | (Senior) Team Leader |
| `assistant` | red | (Senior) Team Assistant |
| `senior-specialist` | orange | Senior Revenue Specialist |
| `specialist` | yellow | Revenue Specialist |
| `head` | — | a department head |

**Moving people**
- **Arm a change:** hold 450 ms over a person. The new upline shows before release.
- **A valid drop** moves the subtree. A cancelled or failed one returns to its start.
- **A blank-space drop detaches nobody** — *Top of team* does that.

**Moving groups**
- Drag a heading or border; arrow keys move a heading; Esc restores.
- *Tidy* aligns rows and separates overlaps.

**What the server checks.** Validated Server Actions check department, cycle, title, capacity and permission. The arrangement is only a browser preference.

**People**

### Roster density (v3.2, 2026-09-01 — People Management)

The dense kit for lists of short strings, never money. It now serves the payroll grid, Permissions' title tables and the Audit log's register.
- **`table.ledger-table.tight`** — fixed layout, one line a row, widths from `th.col-*` and never inline. Fixed layout is load-bearing: under auto layout the longest cell sets the column.
- **`.group-btn` in `td.group-cell`** — a folding band drawn in `--band` / `--band-ink`. They are separate tokens because `--walnut` inverts in dark mode.
- **`.icon-btn`** — a 28px control, full on row hover or focus.
- **Below 768px** `th.col-name` is `width: 100%`. A `calc()` width on a table cell counts as auto.

### People (v3.25, 2026-10-10)

`team/people/_components/` (measurements in `people.module.css`) — HR's kit end to end.
- **The head:** *Invite user · Import InfoTech · + Add person*, compact tabs, five cards, then search with counted pills.
- **The grid** — a band per department ("· N incomplete" in amber), then rows of: tile (an orange rim when they can sign in), name, title + L-level, rank chip, code, status, Last seen. Right-click opens the row menu.
- **The person window** (760px; 900 on a login's Permissions) — Details and History tabs, "missing" in amber, then *Esc closes.* · Full page.
- **Invite user** (466px; v4.62) — the kit's small tabs *Send invite link* | *Set password* (the link first), Email, and on *Set password* the password: dots until the eye inside its box is pressed, Regenerate beside it; then Role and *Send invite link* / *Create login*.
  - **When Supabase does not email the link** the window stays: why, in the amber note, then *Invite link · {email}* in a read-only box with *Copy link* (*Copied*), and *Done*.
  - **The notice after *Set password*** keeps the password as dots, with the eye and *Copy*.
  - **A link never used** reads *Invited* in Last seen (amber, the tile without its rim) and in the person window's login chip; *With a login* notes "N invited". Right-click *Invite again*, or the window's foot: the same window over the login's own email (fixed), a new link or a password now (*Set password*).
- **The full page is a 360** (v4.63, the user's option C; `PersonRecord`, `person-record.module.css`). Its head is a card, not a `.page-head`.
  - **The card** (left, 280–340px, white, framed, radius 12; sticky from 1200px while it reads): their tile (64px, an orange rim on peach while they can sign in), the eyebrow, the name (Newsreader 30), code · title, the window's chips (Active / Resigned / Inactive, Has login / Login disabled / No login), *Edit* and *Invite* full width, then Department · Reports to (a link to their page, their title under it) · Level · Employment Type · Hire Date (with how long, "9 months").
  - **The record** (right) in wells — panel grey, hairline, radius 12, two to a row where they fit, one to a row while editing: Identity · Contact · Emergency contact · Bank accounts · Salary · Statutory, each fact's label over its value, two to a row.
  - **The words** (the user's reference, 2026-10-16): a well's title 12px / 600 / .09em capitals beside its 15px icon (`idCard`, `phone`, `buoy`, `bank`, `payroll`, `shield` — kit icons); a label 11px / 500 / .08em capitals in brown over a 14.5px value in ink (13.5px mono for codes and numbers); an empty value a faint dash.
  - No Account and no Role (v4.63): the login's email is their Contact email and its role follows the title's template. **Reports to** is set here — a soft dropdown of "— None", then the uplines a department at a time, theirs first, and last a group *Can’t be their upline* greyed with why ("in their team", "lower level", "cannot lead").
  - The record keeps ONE element at the page's top level in both modes: the portal settles a newly inserted top-level block in from nothing (`route-fade`), so a form put there by *Edit* made the whole record blink.
  - **A login's email is theirs:** it reads with a *Login* chip and, edited, is a locked box with a padlock — changed only by their own request. Department and Level read as they are. An unticked NRIC or bank account is a quiet box with no field behind it (A hidden value).
  - **Below the card and the record** (v4.67) the page goes on in the same wells, full width (`team/_components/PersonWell`): *Promotion* (*Next up* over the title and its L → L, or where they stand on the ladder; *Promote*) beside *Employment* (*Status* over Active / Inactive; *Deactivate* asks first; *Reactivate*), then *Permissions* (the person's matrix, its table white in the well) and *Activity* (the access log, its count at the title's end).
- **The full page edits where it stands** (v4.10). *Edit* opens no other page: each value becomes its field in the same place.
  - Title, Reports to, Employment Type and the statutory categories are soft dropdowns; the text fields match them (radius 10, white, hairline). The name is edited in the title's place and face, over a dashed line as long as the name, and keeps the title's size over the phone's 16px field rule.
  - Employment Type is one select of the department's choices: *Variable pay* / *Salaried* in the Director department, *Salaried* / *Commission-eligible* elsewhere. The salary and statutory rows follow it as they read.
  - **Basic from commission** (v4.15): a commission department (Revenue) has no Employment Type select — the Salary section's *Pay basis* row is one tick instead. Off: *Fully commission based*, *None — 100% of pay is commission*. On: Basic (above 0), Statutory Allowance, Non-Statutory Allowance and the Statutory section; it reads *Basic from commission* on Employment Type, the pay basis and the person window. The payroll pays that basic out of the month's commission, and each new month's row starts from it.
  - A changed field turns peach. The kit's peach save bar sticks to the sheet's foot (above the phone's tab bar outside HR's frame): *Editing · N changes* · *Cancel* · *Save changes*, off until something changed. A refusal replaces the count in red until the next edit.
  - *Save changes* sends only the changed fields (a bank account whole), so it never puts back a value somebody changed after the page was opened. The bar reads *Saving…* until the fresh record is in, then the page reads it with the kit's toast — never the old values in between.
  - No example values in empty fields — on a record they read as data on file. The old `/team/people/[id]/edit` opens this page with its fields out (`?edit=1`).

### Hierarchy (v3.26, 2026-10-10)

`team/hierarchy/_components/` — Org chart · People & roles · Levels.
- **People & roles** — a band per title ("L7 · 5 people", Edit, Template: X).
- **Levels** — a row per level with its title chips. An empty level reads "No title on this level"; click the name to rename it; drag titles between levels; *+ Add level*.

### Permissions by view and tab (v3.29, 2026-10-11)

`team/_components/TabMatrix` + `tab-matrix.module.css`; `people/_components/PermissionTemplates`, `NewTemplateWindow` + `permissions.module.css`.
- **The top row:** the template select and its count, *Delete* (asks Keep · Delete), *+ New template*.
- **+ New template** (v3.53) opens a 466px window: *Template name*, *Views it can see*, *Sensitive fields*. Once a view is ticked, a note says where its holders sign in and which tabs would not open yet, and why.
- **The matrix:** a rail of views ("8/11") beside the tab × action table.
  - A box the tab lacks is dashed. Read-only boxes keep their colour.
  - **Select all** (v3.53) shows ✓ when every box is ticked and "–" when only some are.
  - **Not open yet** (v3.53) says, under a ticked tab, why its page still won't open.
- **The person window's matrix:** a red dot on a changed box. *Reset to title* and *Save* sit in the footer, and the foot reads *Unsaved changes to X* while there are edits. A reader gets no foot.

### Permission matrix (2026-10-08 — People Management › Permissions, the invite drawer, a person's card)

The matrix is **Permissions by view and tab** (Part III). Around it:
- **The tab:** `?tab=permissions` (`&template=<id>`).
- **The title tables** (`ledger-table tight`): Title · Department · People · Their own boxes · Template. The select moves the title at once.
- ***Show history*:** When · Who · What changed.
- **Invite user** (`InviteDialog`): email, an invite link or a password (v4.62), and the title's template as the role — nothing to choose. A per-person cell is set later, in their window.
- **Hierarchy › Roles** (`PeopleRoles`): a band per title, with its template link, over the people holding it.
- **Masked fields** follow **A hidden value** (Part II).

### Member services (v3.23, 2026-10-10)

`member-admin/_components/`
- **Request reviews** — the list card beside the request card: facts, the step with its note and buttons, then AUDIT HISTORY.
- **Brand weeks** — read only (v3.64). A column per Friday; each week is a chip in its brand's colours (solid for Sales Attending, dashed for auto-located, faint for "No fair"), with the venue under it. The foot says when the ERP last sent it.
- **Claim rates** — Outstation / Airbnb, regions, venues. Save reads "Saved" until something differs.
- **Food claim** (v3.81) — *Fair only*. *Rate a day*, then the titles (Title · Level · *In Fair* · *Can claim*).
- Publishing a memo moved to People › Documentation › Publish (v3.31).

### Replacement review (v3.24, 2026-10-10)

`RequestReviews`
- **The chips:** first *No replacement · release the seat*, then the sub-department's leaders, then everybody else.
- **Effective date**, then the primary button, which names the day: *Approve · replace on 31 Oct 2026*.
- **Scheduled:** what the system will do, then *Take off the schedule →*.
- **Completed:** *Replaced automatically.*, with a link to the record.

### Documentation (v3.31, 2026-10-11)

People › Documentation, `/team/documentation`: the kit's head and tabs **Documents · Data center · Letters · Publish**. Measurements: `team/documentation/_components/documentation.module.css`, `drive/drive.module.css`.

- **Documents** — an upload card (Name, file, department chips) beside the list: kind tile, name, `file · day · who`, department pills, **View** · **Download** · **Delete** (armed). *Show deleted (n)* brings deleted rows back greyed.
- **Data center as a Drive (v3.69)** — **+ New** (*New folder* · *Upload files*; *Upload a letter* in a person's folder), the path, a search. Sections *Companies* (HOUZS Venture first) · *Departments* / *People* · *Folders* (HR's) · *Files*, as cards.
  - A folder card shows what it holds and a red count of people missing a compulsory letter; HR's own folders have ⋮ **Rename** · **Move to…** · **Copy to…** · **Duplicate** · *<person> can view* · *View only me* · **Move to Bin** (v4.5; the two settings are ticks).
  - **A right-click (v4.5)** opens a card's own menu where the pointer is (fixed to the window, closed by a scroll); a card with no menu keeps the browser's.
  - **Badges (v4.5)** after a card's name: a lock on a walnut tile — *View only me · Only you and above* / *Only Alvin and above*; a person with a tick on the ledger tint — *PETER can view* (in a person's folder, while they see it).
  - A file card: a badge in its kind's colour, ⋮ (View · Download · Move to… · Copy to… · Duplicate · the two ticks · Move to Bin; a letter *<person> can view* · **Withdraw**), a drawn page — **never a thumbnail**: a file opens only on a press, which its trail records — and a foot (a letter: *Filed <day>* + Delivered / Opened / Acknowledged).
  - **A person's folder** is their record: their letters, a danger row with Upload per missing compulsory letter, **Withdraw** (armed); *Show withdrawn (n)*, View only. Since v4.5 HR's *Folders* and *Files* follow the record (+ New: *Upload a letter* · *New folder* · *Upload files*), and a letter kept from its person wears a muted *Hidden* chip before its status (Letters too). No description line under the name.
  - Files dropped on the page go into the open folder.
  - **The Bin and Move to… (v3.80)** — exactly the Talent Bank's (**The Bin** below), at `?tab=data-center&in=bin`, Folders and Files only. A binned file reaches *Show deleted* only when it leaves the Bin for good. **Move to…** is the 440px window both Drives share (`drive/MoveWindow.tsx`) — never into a person, never a folder into itself.
- **Letters** — a *Letter type* switcher (types with a count, a *Compulsory* switch, ×, *+ Add*), a red *Compulsory · N people missing* pill, the table: Person (→ their folder) · Letter · File · Filed · Status · View · Download. Upload a letter is the kit's 460px window.
- **Publish** — type (a Letter is also saved under its letter type), Title, Body, attachment, Audience by department (*N of M selected*, *Select all*), **Publish** (*Publish & save* with a file). Each memo still out shows *N of M acknowledged*, **Preview**, **Withdraw** (armed); withdrawn ones say who withdrew them, whom they had reached and that the attachment went.
- **Preview** — the kit's 640px drawer, tabs **Preview** · **Audit trail**. A PDF in an iframe, a picture as is, Excel / CSV read in the browser as a sheet (first sheet, ≤ 200 rows × 26 columns); anything else, Word too, *No preview for .<ext> files.* A deleted or withdrawn file opens on its Audit trail with no Download and is never fetched.
- **A memo in every view (v3.70)** — one card wherever a memo is read (`components/memos/MemoCard`); one acknowledgement counts in every view.
  - **Publish › Preview** — *As they see it* (the card, Acknowledge disabled) and *Who has it (n)* (a chip a person, waiting ones first).
  - **The portal's memo bell** — every view's top bar, a personal login only, never while viewing as; a 480px drawer of MEMO / LETTER rows; a memo opens in place with **Acknowledge**, or *✓ You acknowledged this*.
  - The HR app lists it in *Waiting for you* and More › *Memos*; the Revenue app in the memo sheet.

### Hiring › Requests (v3.32, 2026-10-11)

`/hiring/requests`, HR's sidebar **V. HIRING**. Measurements: `hiring/_components/hiring.module.css` (inputs content-box: a width is the text's). Tabs (`?tab=`) **Requests · Listing · Form settings** (the last for Hiring · Edit).

- **Requests** — an inbox, list | detail: filter pills Pending · Info requested · Declined; the request's tiles (Budget, Headcount, Expected start first), its answers and attachment; **Owner** · **Note to requester**; **Acknowledge** · **Request more info** · **Decline**; *History*.
- **Listing** — five stat cards that filter when pressed; the table (owner *Unassigned* in alert, candidates `N · N appt · N out`, cancelled rows dimmed). A press opens the request; a right-press offers **Acknowledge** · **Mark filled…** · **Cancel request** · **Reopen** · **Open details**.
- **Form settings** — *What requesters fill in* (↑↓ · name · Short text / Number / Long text / Choice / Range · Required · ×; Position and Department are *Core*), **Hiring sources** (× only while unused), **File types** (Hiring files). Every change saves itself.
- **+ New request** — a 640px drawer of Form settings' fields; **Submit to HR**.
- **A request's page** (`/hiring/requests/<id>`) — main | a sticky 340px column.
  - Main: **Requirements**, the answers, **Candidates · N** with **+** (*New candidate*, *Pick from Talent Bank*) and **⋯** (Candidate fields). A candidate card wears its stage's colour; ⋯ Edit details · Change status ▸ · Download résumé · Move to Talent Bank… / **★ Open in Talent Bank**.
  - **A menu must fit where it opens**: it hangs under its button, above it when the sheet has no room below, because an open menu's catcher stops the wheel (`menu-place.ts`).
  - The column: **Pipeline**; **Actions** by state (pending: Owner, Note, Acknowledge; acknowledged: helpers, one *Hired* pick per headcount, Hired through, Cost, **Mark filled**; closed: **Reopen**); **Cancel request** always; **Audit trail** (All · Status only).
- **Windows** — Add / Edit candidate, Candidate fields (saved on close), Pick from Talent Bank, Move to Talent Bank (Department * only on HOUZS Venture's requests). The résumé / files drawer is 600px (Hiring files).
- **On a phone** — one column; the listing and Form settings scroll inside their cards.

### Hiring › Insights and the Talent Bank (v3.33, 2026-10-11)

The rest of **V. HIRING** (`hiring.module.css`).

- **Insights** (`/hiring/insights`) — submitted → acknowledged → filled; a request belongs to the period it was submitted or filled in. **This month** · **All time** · **Pick a month** (last 12). Six cards with the change on the month before; days to fill per request; **By source**; **By department**; **Every request** (scrolls sideways, **Company** before Department — v3.67: a guest's company, else HOUZS Venture), a row opening a 440px panel.
- **Talent Bank — a Drive (v3.74)** (`/hiring/talent`) — the Data center's own parts, imported (Documentation › **Data center as a Drive**); the place is the address (`?in=dept:hv:Revenue`).
  - The bank → **Companies** (HOUZS Venture and the guest link's subsidiaries; one taken off that list stays while it holds something, marked *· off the guest link*) and HR's **Folders**; a company → **Departments**; a department or folder → folders, **People**, **Files**.
  - **+ New**: *New folder*, *Add talent* (a 520px drawer that keeps them where it was opened), *Upload files*.
  - A person: ⋮ **Open** · **Move to…** · **Remove from Talent Bank** (armed); a 460px panel with **Kept in**. HR's folder: **Rename** · **Move to…** (with everything in it) · **Move to Bin**; a department holding people: **Move everyone to…**.
  - **Move to…** — one 440px window: where it is now, then every company, department and folder (a folder never into itself; the current place greyed *Here now*).
  - **The Bin (v3.77)** — deleted things wait **30 days** at `?in=bin`: **Restore** · **Delete forever** (armed), **Empty bin** (armed), each card with *N days left*; without Edit, read only. A binned card pressed toasts *… is in the Bin — restore it to open it.*
- **A talent's page** (`/hiring/talent/[id]`) — **Profile**, **HR notes** (saved as written), **Files**; **Invite to interview** (open requests, the fitting one first), **Remove from Talent Bank**, **History**.

### Hiring files (v3.46, 2026-10-11)

A candidate and a Talent Bank person keep **several files, each with a file type** (mig `20261011160000`; `HiringFiles.tsx`, `.hf*` / `.cvPill`).

- **The type** — a soft dropdown: Résumé, IC, Certificate, HR's types, **+ Add a new file type…** (Hiring · Edit). A file chosen while there is no résumé starts as Résumé; any other must be picked (*Pick what kind of file it is.*).
- **In a window** — files on record (Remove / Undo, applied on Save), chosen files (*Uploads on Save*), then *Upload résumé* or *Add another file*. Save uploads from the browser, then files the form.
- **The files drawer** — names the file shown and downloads it; several files add a pill row, résumé first. The button reads *View résumé* or *View files*; *Download résumé* takes the newest.
- **Move to Talent Bank** takes them all. A talent's page: **+ Add file**, then **Open** · **Replace** · **Remove** (armed).
- **Form settings › File types (v3.48)** — rename in place (✎; Enter keeps, Esc reverts), On / Off; Résumé is *Built in*. A type turned off leaves the picker; its files keep it.

### Meeting Rooms (v3.34, 2026-10-11)

Admin › Meeting Rooms, `/admin/rooms`, in every view's sidebar. Measurements: `admin/rooms/_components/rooms.module.css`.

- **Schedule** — a date pager that names the asked day at once (nothing dims while the grid loads), **Today**, the legend, **+ Book a room**; the grid **08:00–20:00**, a column per room, each meeting in its department's tone (`lib/rooms/model.ts` `departmentBadge`; a guest-link booking olive under its subsidiary's code).
  - **The label opens a month (v3.51)** — a day pressed goes there; Esc or an outside press closes it; arrow keys move a day / a week.
  - **The free half hour under the pointer lights (v3.51)** — never under a meeting, only from today on, only for whoever may book; a press opens Book there for an hour, never past 20:00. A past day books nothing: the database refuses it.
- **Book a room** — a 520px drawer: title, Room, Date, From · To, Booked by, From department, internal attendees, external guests, **Total pax** (never under the named count; *· too many* past the seats). The red line names the first problem — a clash reads `<room> is taken <from>–<to> by “<title>”.`
- **A booking** — a 440px drawer with Reference `BK-n` and the audit trail; the booker gets **Cancel meeting** (armed) and **Edit**, anyone else *Only <booker> can cancel this meeting.*
- **Booked for somebody else (v3.45)** — **Grace Lim (for Chea Huan)** wherever a booker shows, and either may cancel (`bookerName` / `whoMayCancel`).
- **Rooms** — one card each: name, Seats, Location, Facilities (saved on blur), **Bookable** (off = out of the schedule), × refused while bookings lie ahead; rooms start empty.

### Guest link (v3.35, 2026-10-11)

Admin › Guest Link, `/admin/guest-link` (HR's view only), and the public `/g/<code>`. Measurements: `admin/guest-link/_components/guest-link.module.css`; the guest page keeps the handoff's own values (`(guest)/g/[code]/_components/guest.module.css`).

- **Admin › Guest Link** — **Link on / Link off**, the address with **Copy** and **New link**, a switch per part (*Book a meeting room*, *Request manpower*), *Guests can book up to [N] days ahead* (1–21), the rooms guests can book. *Subsidiaries & departments*: a code (≤ 3 letters) and name per company, department chips that rename in place (their Talent Bank people follow). *Booked through the link*, each with **Open**.
- **The guest page** — closed: *This link is closed*. Open: *What do you need?*, a card per part.
- **Book a meeting room** — *1 · Who is booking* · *2 · Pick a room and time* (free half hours as tiles) · *3 · Meeting*; missing fields in one red line; done: the reference, *Cancel booking* (armed), *Book another room*.
- **The schedule** — a column per room, HQ blue and subsidiaries orange; only a link booking can be changed or cancelled here, and that asks the guest's name.
- **Desktop (≥ 900px)** — a sticky **Preview** column while booking.

### Guest link — Request manpower (v3.37, 2026-10-11)

The guest page's third card. Its fields are Hiring › Form settings', except **Department, which lists the picked company's own departments** (v3.67; Admin › Guest Link › Subsidiaries & departments) — a soft dropdown, or a box to type one when the company lists none; changing company empties it.

- **Five steps** — *About you* → *The role* → *Candidate requirements* → *Job description* → *Check and send* (each step with its *Edit*), **Send to HR**; missing fields in one red line; done: the request's number.
- ≤ 5 choices are pills, more a soft dropdown; a file box; on a desktop the Preview column (*n of 15 filled*). Typed text keeps the phone's 16px floor.

**Admin**

### Audit log — Changes (2026-10-08 — Audit Log › Changes, the app-wide history)

Who changed what, when, before → after (`audit_tables`).
- **Changes** (`/audit-log`, anybody with an area) and **Access** (`/audit-log/access`, the Principal) are sidebar entries, never tabs.
- **A reader sees their own areas only.**

**The page**
- *ADMIN · AUDIT LOG · CHANGES*, then four cards: *Saves today* · *Changes · 7 days* · *People · 7 days* · *Areas you read*.
- **Filters:** `ChangesFilters`, a GET `.sheet-toolbar`. A record's history is `?table=&row=`.
- **The list** (`SavesTable`): one row per SAVE (a transaction) — When · Who (*via* the ERP / a migration / the server) · What changed.
  - **Each record** gets an *Added* / *Changed* / *Removed* chip, then *before → after*.
  - **Folding:** eight fields, six records, then *All N …*.
  - **A hidden value** reads *changed — hidden from your title*.
- **The foot:** `RecordedTables` — what is kept and why not.

### Change password (2026-10-12 — Admin › Change password, the HR app's More, the Revenue app's Profile)

Only for a login a People record names: the shared principal@, finance@, hr@ and marketing@ never see it, nor does anyone while viewing as (user 2026-10-12). One action (`lib/account/`) under three surfaces.

- **Portal** — `/admin/password`, the kit: *Signed in as {email}* (live data, so allowed), **Current password** · **New password** (*At least 6 characters, and not the current one.*) · **Confirm new password**, *Show passwords*, **Change password**. The last link of HR's Admin (`NavIcon` `lock`), and of Reports & Admin elsewhere.
- **HR app** — More › Change password, a sheet. **Revenue app** — Profile › Account, a sheet; never on a member viewed, and the sheet forgets what was typed once it closes.
- **Words, everywhere** — *Password changed. You stay signed in here; your other devices are signed out within an hour and need the new password.* Refusals: `lib/account/password.ts`.
- **While sending** the button reads *Changing…* and the sheets wait for the answer. The portal's boxes carry **no `name`** — a submit before hydration would put the passwords in the address.

### Choosing a password from an invite link (v4.62, 2026-10-16 — `/welcome`)

The sign-in page's screen (`MemberLoginScreen`'s `panel`), its right column swapped: **Set your password.** · *Choose a password to activate your account.* · **New password** · **Confirm password** — each the sign-in's box with the lock and its own eye — and **Activate account** (*Activating…*). A link missing its token reads **This link is not complete.** · *Open the link from your invitation again, or ask HR to send you a new one.* with no form.
- **Words** — *Your password needs at least 6 characters.* · *The two passwords are not the same.* (both before anything is sent) · *This invite link has expired or was already used. Ask HR to send you a new one.* · *Your password was not saved. Try again.* · *Your account is not active. Please contact HR.*
- Activated, they land where a sign-in lands (`/`, which sends each to their app).

### My documents (v4.5, 2026-10-14 — Admin › My documents, the HR app's More, the Revenue app's Profile › Documentation)

One's own documents — **Company** (what HR shares with their department) and **Personal** (what HR shares with them of their own Data center folder, and their letters) — for a login of one's own only, never while viewing as (as Change password).

- **Portal** — `/admin/documents`, the kit: compact tabs *Company* · *Personal* (counts of new), then the Data center's own cards: files as file cards (*Added 14 Oct*, *New* in the alert tone; a letter *To acknowledge* once read), folders as folder cards (*2 files · 1 new*; a press goes in, the path back up). A press views (a link made at the press, a tab readied in the click); ⋮ View · Download. Beside Change password in Admin / Reports & Admin.
- **HR app** — More › *My documents* (above). **Revenue app** — Profile › Documentation's *Personal* (above).

**The phone apps**

### The HR phone app (v3.38, 2026-10-11)

`/hr-app` — HR's view of the one app on a phone (HR's portal pages are for the computer). `components/hr-app/hr-app.module.css` keeps the handoff's values and the browser's defaults (line-height normal, content-box), at most 560px wide.

- **Home** — the walnut hero (*To review* · *Open roles* · *Letters missing*), *Waiting for you* (HIRE / WAIT / REPL / CLAIM / MEMO), *Today's meetings*.
- **Review** — All · Hiring · Member services; a claim's **Approve** asks *Request payment* or *Add to payroll* (v3.45).
- **Hiring** — requests by status; a request's page ends on a bar pinned above the tabs (Decline / Request more info / Acknowledge, then Cancel / Mark filled).
- **Rooms** — as the Revenue app's.
- **More** — Insights, Talent Bank, Data center (a red `!` while a compulsory letter is missing), *Memos*, *My documents* (v4.3 — Company · Personal chips, then rows: a letter row with **View**, a folder as a More row), *Change password*, *Phone notifications*, *Make them pop up* (v3.86, `components/pwa/PopUpGuide.tsx`); last, for an account that may switch views, the view switch (*You are here* on the current one).
- **Notifications (v3.47, v3.52)** — a bell; its page lists what was new when it opened, then the rest. First open asks *Turn on notifications?* once (`components/pwa/PushAsk.tsx`).
- **Tab bar** — Home · Review · Hiring · Rooms · More, on `--safe-bottom` (Part II › The phone's own navigation bar); sheets rise over a walnut scrim; every select is the soft dropdown.

### The Revenue app — built to the prototype (2026-10-05)

`/member` is `components/member/app/RevenueApp.tsx`, built to `.design/revenue-app/design_handoff_houzs_revenue_app/` (`prototype/RevenueApp.dc.html`). **The prototype is the truth for layout, colour, wording and measurements; the NUMBERS never come from it** (margin bands, the cost divisor, KPI, Championship points, claim rates are VP's). Palette and faces: Part I.

- **Its own floor.** Preflight is undone for the app (`app/base.module.css`); the portal's global `h1` / input rules stop at its edge.
- **Shell.** Five tabs on a phone; on a desktop (`@container rv`, 1024px+) a sidebar, the page column and a panel rail where sheets, View as and the quote calculator open.
- **Phone type one step smaller:** every size is `calc(Npx * var(--rv-type))` (.92 on a phone; inputs stay 16px), never under 10px because of it — a size .92 would take below is `max(10px, …)` — and a size drawn under 10px already (the food claim's *SEP*) is never scaled (v4.2). `app/type-scale.test.ts` fails on any other form.
- **Checked against the prototype** screen by screen (`/member/preview?app=proto`, `.design/revenue-app/tools/shoot-app.mjs`, done at ≤ 0.05%).
- **Never says how the cost is made up** (`components/member/cost-basis-wording.test.ts`).
- **Deliberate differences:** an unpaid figure says so (*KPI · Not counted*) instead of RM 0.00; a returned request has *Update and send again*; forms start empty.
- **The live month.** Today, Insight, the Arena and My income open on it; the closing month is one tap away (*Live*). While the engine works the hero reads *RM —* / *Working out October's commission…* — never the fixed salary alone.
- **Opens on what the phone kept** (per account) and reads everything again behind it. **Loading is never a zero:** a shimmering bar stands where a figure will; no place on a board reads **Not ranked yet**.
- **Pull to refresh.** Nothing changes on its own; a pull past the threshold reads everything again (an arc that turns accent once armed), the page unchanged until the new data swaps in; a failure says *Couldn't refresh. Pull down to try again.* Back after 10 minutes refreshes once. Never while a sheet is open or over something unsaved; stale actions after a release reload the page.
- **Loading and error frames** (`app/shell/AppFrame.tsx`, `inert`): the real header and bottom bar; `AppLoading` one spinner; `AppError` *Couldn't open the Revenue app*, *Try again* (a fresh load) and *Ref …* (the digest).
- **A row's sheet on a desktop is a peek** (`peek` on `Sheet`): the page stays live, another row swaps the panel. Pickers dim; a phone dims every sheet.
- **The family chart** fits real names (`max-content`, wrapping inside cards); **two directors stand side by side** as one `DIRECTORS` level.
- **Sofa Leg height and Specials:** every option Maintenance prices is charged to the customer, *not in margin*; only legs and specials turned ON on Modular, and common to every sofa in the cart, are offered. The quote's **Total** is *Customer pays*.
- **The margin answers as it is typed** (v4.21): step 2's margin, its tier chip and *Reach … at RM x* change with each digit, at once, like a calculator. Only a cart that has just changed reads **—** with a *Calculating* chip (the margin cell's grey) until the server has priced it — never the old cart's margin. *Preview customer quote* lights once the server has answered the price on screen.
- **The keypad never moves** (v4.24): step 2's card is drawn at its tallest from the start, so a price typed never drops the keys under the thumb. The margin cell keeps room for every tier name and penalty line it can show, whichever wraps on that width (*Below margin Tier 3* wraps at 360–384px where *Tier 1* may not). A tier's number stays with its word, so a wrapped chip reads *Below margin* / *Tier 3*. The next-tier line is always there:
  - before a price is typed: *Reach Incentive Tier 1 (36%) at RM x* with *Use price*;
  - while typing: the next tier;
  - past the top tier: **Incentive Tier 2 (43%)** reached;
  - while a changed cart is priced: empty, its place kept;
  - a cart that cannot be priced: why, at any price.

  A figure keeps to one line: 8+ characters are drawn at 22px, 10+ at 18px, on the same 33px line.
- **An Airbnb stay on one calendar** (v3.72, `profile/StayCalendar.tsx`): only the day before the fair to the day after can be tapped; fair days dotted in the brand's colour; check-in / check-out circles and a band between; the line under it turns red when the stay breaks a rule. Every stay keys its invoice total; the summary reads *Up to, per night* or *Up to, per pax per night*.
- **A food claim** (v3.81), for whom HR opened it: a month at a time — *Month* pills, the month's brand weeks as cards with their day count, the fair's days as tiles (*Claimed* / *Not yet* faded and untappable), then *Set by HR's rate a day. You can't edit the amount.*
- **Notifications** (v3.47, v3.52, v3.86): the bell and its page; the first open asks *Turn on notifications?*; a CRM notice is titled by the customer with their picture; *Make them pop up* with *Send a test*.
- **Switch view** (v3.60): Profile on a phone lists Principal and Finance (*The portal*), HR (*The HR app*), Revenue team (*You are here*).
- **A Revenue Director** (v4.1): the switcher lists the sub-departments they direct (*Revenue Director · Rank SS*); Today's Sales / Margin / KPI are tagged *All of Fair*; a place on a board they are not on names who leads — *ANNA leads* on Today and the hub (head: *Who leads every board*), the leader's figure and *RM 300 ahead of ME* on a board's hero; no *This week*; the family chart has them at the top.

### The Revenue app — the refresh (v4.2, 2026-10-14)

The Claude Design handoff *Revenue app refresh* (`CRM switch button proposals.zip` — `design_handoff_revenue_app_refresh/`, prototype `Revenue Today Phone.dc.html`), checked element by element against `/member/preview?app=proto`. Rules and history: `.claude/rules/revenue/revenue-app.md` › THE REFRESH.

- **Today's header: the CRM chat button** between the capsule's rule and the bell — `ICON.chat` 21px, stroke 1.8, rust, 40×44 (padding-left 8); Fair ▾ gives up 2px on its right, the bell 4px of its width. Its badge is the account's own chats' **unread messages** (the CRM Inbox's figure), `99+` above 99, none at 0, and it moves by itself the moment a customer writes (Realtime) — nothing else on the screen reads again. Only for CRM · View, only on Today (the user: the header stays Today's), not over Quote's step 2. It opens the CRM as Profile's *My leads & appointments* does (still there), and the CRM's way out leads back to Today. Every capsule button dims to .6 on a press (120ms).
- **Today's income is a statement:** no card — the label and the sand eye (36, radius 10), *RM* 20/650 grey beside the figure 40/750 (−.04em, Inter Tight, `tnum cv01 cv11`), the split 12.5 grey, then Sales · Margin · KPI between a 1.5px ink rule and a 1px line, a good tag green. Hidden: *RM ••••*, *Amounts hidden*. Loading: sand shimmer bars.
- **The Arena's boards are bank cards** (2×2, gap 10): 176 tall, radius 22, padding 16, white; the board 15/650 and your figure 12.5 white .88 on top beside a 34px circle (white .24, the icon 17); your place at the foot — 40/800 −.05em, its suffix 16/700, *of 9* 13 white .88. No chevron: the whole card is the button; a press sinks it to .97 (120ms). Shadow `0 6px 16px` the board's glow.
- **A board's hero is its bank card** (margin 6 12 0, radius 22, padding 10 18 16, gap 14, shadow `0 8px 20px` glow): *‹ Arena* and the date chip (white .2); the board 16/650 with your figure 20/700 under it, beside a 40px icon circle; your place 56/800 with its suffix 22/700 and *of 9* 14 (white .88); the chase on white .18; the period on white .18, the picked one white with ink. A board is its own page: no app header over it (there is none on the Arena).
- **Motion — the handoff's, on the one curve:** a board's hero rises 12px and fades in over 320ms, the page under it fades in 240ms after 60ms; *‹ Arena* fades the hero out over 200ms first. A period switch moves the pill 220ms and cross-fades the place and the figure 160ms (`arena/CrossFade.tsx`), never a count. Tabs and brand chips 160ms. A brand week's days open 200ms (height and opacity, `profile/Reveal.tsx`), its caret turns in 180ms, a day's tile 160ms. Reduced motion: nothing moves.
- **Every sheet of the app closes when pulled down** past 90px (`Sheet.tsx`), as the CRM's do; a field keeps its own touch.
- **The bell moves by itself too** (v4.4): a meeting booked for them, a memo for them, a request HR moved — its figure and its list follow the moment the database says so (Realtime, the member's own private channel), silently: no dot, nothing else on the screen read again. Opened, what it counted leaves the figure and stays marked new in the list until it opens again; one coming in after that counts again.
- **The CRM's way back** (v4.4): the Revenue app's home left of the CRM's bell, where Today has the CRM's chat button left of its own — the bell's round button (40, 1px `#EBDDD2`, white, the soft shadow), a rust house 20px, stroke 1.8; 8px apart, one group at the title row's right end (the Control panel's Overview: 10, its row's gap). Profile's *Back to Revenue app* card is gone (v4.7, the owner: no need anymore). On a narrow phone the Inbox's ad name gives way (…), never the title.
- **Team | Mine is one round button** (v4.12, the owner's design *Team · Mine toggle — 1a Single swap circle*): for whoever has both sides (the Principal, the Revenue Director, a leader with a downline), left of the house — the same 40px round button, 8px apart, the icon 20px stroke 1.8 in ink: **two people on Team, one on Mine** (the side you are on). The text segment and the top row it had are gone.
- **The three round buttons are the first page's alone** (v4.16, the owner: "这三个 icon 本身只需要出现在第一个界面"): Team | Mine, the house and the bell sit on the first page of the bottom bar only — Mine's **Inbox**, the Control panel's **Insight** — as the Revenue app keeps its header to Today. No other page has them: not Contacts, Calendar, Insight or Profile (its card's corner), not Inbox, Assignment, Calendar or Profile on the Team side, not a back link's top bar (Profile's sub-pages: *‹ Profile* alone). One tap on Team | Mine goes to the other side's first page: Mine's Inbox ⇄ Team's Insight. (v4.12 had them on every page, the switch keeping the page, and a fit rule for the crowded rows — gone with the crowding.)
- **No line under a Team page's title** (v4.16): Inbox (*5 chats · 1 need attention*), Assignment (*Who gets each new enquiry*) and Calendar (*1 Oct – 31 Oct · 10 visits · 2 upcoming*) show the title alone, level with the control beside it (*Contacts*, the dates).
- **The CRM's type is the Revenue app's** (v4.16, the owner: "把 CRM 里面的字体大小改得跟 Revenue Apps 一样"): every size is the prototype's px times `--rv-type` — .92 on a phone, 1 on a desktop, the app's one dial (`shared/type.ts` › `typePx`, `tools/crm-design/type-scale.cjs` for the generated screens), never under 10px because of it; and Profile — the Revenue app's Profile drawn a step bigger — takes the app Profile's sizes: avatar 18, name 20, the line under it 13, a fact 12 / 15, the banner and a row 16, *Your workspace* 18, a count 11 (`profile-type.cjs`). The desktop CRM keeps its prototype's.
- **Mine's Profile looks like the Revenue app's Profile** (v4.64, the owner, with the two side by side: "我要mine profile 跟着 profile"; `tools/crm-design/profile-like-app.cjs`, values read from `profile.module.css` by `crm/profile-like-app.test.ts`): the peach glow behind the card (`--rv-profile-glow`, 150px, edge to edge) and the card 56px down it — white, radius 22, the app's shadow, padded 18 18 14, its parts 14 apart (the prototype drew the glow inside a bordered card); a 56px avatar (it was 64); the app's display face (Inter Tight) on the avatar, the name and *Your workspace*, which sits 24px under the card at 650; the facts' box radius 14, each fact padded 10 14, the values at 650; the rows' icons 22 / 1.8, labels at 650, ruled edge to edge in `--rv-rule` (an inset `#EBDDD2` line), the app's 16px chevron and its count (10.9px on the accent, 1px 7px). The status-bar strip above it is the glow's top colour, as the app's Profile sets its own (`crm.module.css`, `data-prof-glow`). The CRM's three rows keep no line under them; the Control panel's Profile is unchanged.
- **The food claim's summary:** *Month* and *Days* in their own figures, the day list wrapping right-aligned.
- **Deliberate differences from the refresh prototype:** the header is Today's alone (the prototype draws it over the Arena hub too); badges in Inter (the prototype's buttons fell back to Arial); Top 3's avatars keep their ring outside 46 / 54px as the first prototype drew them (the refresh one draws it inside, 2px shorter); inputs stay 16px.

### The CRM chat — the composer (2026-10-14)

The owner's Claude Design handoff *Typing bar UI mobile chat design* (`docs/design/chat-composer`, prototype `Chat Composer.dc.html`) on both chats: Mine's and, since 2026-10-15 (the owner: "all need same"), the Team side's — the Control panel's, where the Principal and the Director answer someone's customer. The composer is generated from the prototype (`tools/crm-design/gen-composer.cjs` → `sales/SalesComposer.tsx`, its presses `composer-press.module.css`), the header and the list patched to it (`chat-composer-patches.cjs`); checked element by element against the prototype in every state. Rules and history: `.claude/rules/revenue/crm.md` › THE CHAT COMPOSER.

- **Layers, as the prototype's phone holds them:** the wallpaper full bleed under the message list; the header floating over it (white at 96%, the `rgb(235 221 210)` hairline); the composer at the bottom over the wallpaper. The list pads itself by both as they stand (header + 25, composer + 6) and sits at the bottom while short; a tap on it closes the keyboard and any panel.
- **Header:** back 40×40 (arrow 22, stroke 1.65), the avatar 40 (`#FFF0E4` / `#BD4A19` 13/650) with an 18px green dot (`#387557`, 2px white ring) at −3/−3, the name 16/600, the ad 12 in green, ⋮ 40×40 (dots 18) — no rings (the owner chose the design over the channel badge). ⋮ tints `#F5EBE3` while its menu is open; the pinned message and the cold-lead note ride in the header under its row. The header stands one step above the composer, so the ⋮ menu reaches over a panel on a short screen. The Team side's header adds, under its row, whose customer it is (12 `#806B60`) and a reassignment's line (`#E4F1E8` / `#2E6B4C`).
- **The typing bar (One pill):** row `8 12 10`, gap 6. The pill (min 46, radius 23, white, `0 1px 2px rgba(63,43,34,.14)`, padding 0 4) holds Sticker (38×46, 21px, stroke 1.65 — the keyboard icon while its panel is open), the reply box (16/22, padding 12 2, `#3F2B22`, hint `#A8968B` *Reply to {first name}…*, growing to 154px), Attach (40×46, the paperclip 22 turned −45°) and Camera (40×46, 23). Attach and Camera fold away while there are words; the 46px rust main button (`0 3px 9px rgba(189,74,25,.18)`, icon 20 stroke 1.75) is Send then, else the mic. A cold chat has its *Send template message* button in the bar's place; the reply and "/" quick-reply rows float above the bar.
- **The mic is held to record** (the owner: as WhatsApp): let go and the voice note goes; let go on the bin (or left of it) and it is thrown away; a tap shows *Hold to record a voice note*. While it records, the pill's place holds the bin (46, white, `#A3371A`) and the clock (*0:05* on `#FBF1EC`, the red dot pulsing, and at its right *‹ Slide to cancel*, 13/500 `#806B60`, which follows the finger and turns `#A3371A` near the line — since v4.39; slid 110px left, the recording is thrown away) and the main button under the finger is Send. The microphone starts at the press (since v4.39 — it waited 250ms); a press shorter than that is still a tap, its take dropped.
- **Sticker panel** (the keyboard's place, white, radius 22 22 0 0, `0 -6px 20px rgba(63,43,34,.08), 0 -1px 0 #EFE4DA`): the grabber 36×4; Search (36, `#F3EAE2` / `#FFE5CF` on), the tab track (`#F3EAE2`, radius 18, padding 3) or the search field (36, rust ring `0 0 0 3px rgba(189,74,25,.14)`), the Delete key (44×36, radius 12, presses `#FFF0E4` / rust at .94 — one emoji whole, a flag or a family too); the label (12/650 `#806B60`), eight columns of 40px emoji (27px, presses `#FFF0E4` at .9); the category bar (46, icons 21, the picked one rust stroke 2 over a 16×3 line). **Emoji is its only tab** — GIF and Sticker wait for real GIFs and real sticker artwork (the owner: "这2个分页就不用上线先"). Recents: one's own first (kept on the server), then the design's set, 24.
- **Attach panel** (since v4.38 a card floating over the chat 8px above the composer, 10px in from each side, only as tall as its tiles — `#FBF7F3`, radius 20, `0 10px 30px rgba(63,43,34,.18)` and a `#EBDDD2` ring, padding 18 12 14; the bar and the chat stay where they are; it was the keyboard's place): Photos `#2F8FD8`, Document `#BD4A19`, Quick replies `#A46312`, Auto replies `#387557` — 54px circles, white icons 24, labels 12/600, rows 18 apart. Camera is the bar's own button.
- **The keyboard is the phone's own:** the Sticker panel takes its last measured height (visualViewport; 280 until one is measured, kept for the next visit), so the bar never moves when they swap — a panel is drawn at once where the keyboard is and the keyboard slides away over it; the keyboard coming back takes the panel's place at once (since v4.38 — the panel kept under a rising keyboard could leave the bar behind it). While the reply box (or the emoji search) has the keyboard, the screen is fitted to what the keyboard leaves: the bar on the keyboard, the header still at the top. On a short screen (a phone on its side) a panel gives way, leaving 24px of the chat under the header. The strip under the composer is the phone's home-indicator inset, coloured as what is above it (white under Sticker, `#FBF7F3` under Attach, the wallpaper otherwise).
- **Motion — the handoff's:** the Sticker panel rises 16px as it fades in, 240ms on `cubic-bezier(.2,.8,.2,1)` (`cmpUp` — the design's `sheetUp`, under its own name since the CRM's `sheetUp` slides a whole sheet); Attach and the toast fade in 160ms; tabs, Search and the category colour 200ms on the curve; the Delete key's press 120ms. Reduced motion: nothing moves.
- **Toast:** `#3F2B22`, radius 14, 14/600 white, 16px in, just above the bar (the prototype's 100px less its drawn strip), 2.2s; the chat's other toasts stand in the same place.
- **Deliberate differences from the prototype:** every text size is the CRM's phone scale of the prototype's (×.92 — the CRM's type is the Revenue app's), so a few rows stand 1–2px shorter; the search field is 16px on a phone (iOS zooms into anything smaller); the tab track holds Emoji alone; the keyboard and the strip are the phone's own; the recording row is the CRM's own (the prototype draws none); the header is one layer higher (4, the prototype's 3) for its ⋮ menu.

### The Revenue app — Book a room and Documentation (v3.36, 2026-10-11)

Profile › Your workspace: **Book a room** and **Documentation** (a count of files not opened yet). Measurements: `components/member/app/profile/rooms.module.css`, `docs.module.css`; the workspace rows (v3.45) in `profile.module.css`. Sizes are the phone's, written against `--rv-type`.

- **Meeting rooms** — **+ Book**; *By room | Timeline*; seven day chips. Timeline is **64px an hour**; a press on empty space books that half hour (never later than 19:30). The member's own meetings are accent, the rest of HQ slate, the guest link's soft accent.
- **Book a room** sheet — soft dropdowns for Department (*Revenue · Fair*, *Revenue · IR*, then HQ's), Room, From / To; attendees, *Total pax*; **Cancel** · **Book**. An open meeting: the booker's **Cancel meeting** (*Tap again to cancel*); viewing as, *Read-only while viewing as*.
- **Documentation** — a row per file with *New* until opened; *Nothing shared with you yet.* Since v4.3 two tabs on the profile's segmented control — **Company · N** (that list) and **Personal · N**: *LETTERS* (a small caps group) then folder rows (a cream tile with the accent folder, *N files*, *N new*; a tap goes in: *‹ parent* in the accent, the folder's name in Inter Tight 19px) and file rows; *Nothing of yours is shared with you yet.* / *This folder is empty.*

### Submit waiting list (v3.27, 2026-10-10)

The Revenue app's `profile/RequestForm`.
- The questions come in the form's order, with "(optional)" when not required; a refused send marks *Required* in red.
- **Application form:** Download and Upload. Upload turns green once a file is chosen and is red while it is required and missing. Then the signature pad with Clear.
- The done screen adds *Signed form attached · name*.
- **Submit replacement** draws the same way (v3.43), under "Replacement form".

### Waiting list & replacements (v3.28, 2026-10-10)

The Revenue app's `profile/TrackPage` + `track.module.css`.
- A segmented control, then the queue card. The member's own row shows its "#2" and "Yours".
- **The request sheet:** facts, *Edit request* (a locked note when it can't be edited; Cancel · Update), AUDIT HISTORY, Done.
- **Chips:** Pending review / More info needed / Scheduled in gold + amber; Accepted in green.

### Product List — a page of the Revenue app (v3.13, 2026-10-08)

`/member/products` in the Revenue app's shell (`/revenue/products` redirects). Source of truth: `.design/revenue-app/design_handoff_product_list` (`prototype/ProductList.dc.html`); measurements in `_components/products.module.css` / `ui.tsx`, checked with `.design/revenue-app/tools/measure-pl.mjs`.

- **Who sees it.** The desktop sidebar's **Product List** row, under PRINCIPAL or MANAGEMENT, for holders of `product_list` only. The **Module** switcher above the profile card is the Principal's.
- **The page.** Eyebrow REVENUE / PRODUCTS, the display-serif title, `Principal only · Fair and IR`, six tabs on the head's rule: SKU Master · Modular · Maintenance · Combo Pricing · Costing gaps · Costing Setting. A tab with unsaved edits carries a dot; leaving it asks first.
- **Tables** scroll in their own window with a sticky head and a frozen first column; columns drag and resize (`ColumnTable`, kept in a cookie).
- **Modular's board — the one deliberate departure:** each category on a sand tray; an offered model a white card with a soft lift, a not-offered one an empty dashed slot.

### Product List — the mirror beside the portal's decisions (2026-09-24; in the Revenue app since 2026-10-08)

What the ERP says EXISTS is plain text; what the portal DECIDES is an input — a price (amber while edited), a tick, a toggle. A row's state is a chip in its first cell: NEW, Inactive, Removed. Modular opens a model in a window (option tick tiles, *Select all* / *Clear all*, Save, Save & next, an unsaved guard). **A price moves margins only from the moment it is saved; a landed month waits for Recost.**

**Combo Pricing is the portal's own:** a row per set, a column band per fabric tier; *+ Add combo* builds a set and prices it per fabric × seat height, a two-sided module adding a card for the pair (`1A(R)`, *LHF / RHF*). *Edit prices* pins a **Remove** column right: Remove marks a set (faded, prices read-only), Keep unmarks, Save deletes the marked sets.

### Revenue member C release (2026-09-16)

Superseded by *The Revenue app — built to the prototype*. Its data rules hold: View as is read-only; Insight, the Arena and recent income share `member_order_facts`; KPI is `member_kpi_summary`'s combined quantity (`.claude/rules/revenue/revenue-app.md`). Its layout survives as `/member/preview?design=live`, behind `member_requests_manage`.

### Revenue Arena design comparison (2026-09-13, revised proposal)

On hold: proposals A (Espresso & Clay) and C (Orange & Brown) on fictional data at `/member/preview?design=compare`, behind `member_requests_manage`. The live Arena is the Revenue app's. One rule stands: Championship is an additive points total — never a percentage or weighted average — beside Sales, Margin and KPI. Full text: `git show d241acde:docs/DESIGN.md`.

---

## Part IV — Version index

- **v4.67** · 2026-10-16 · A person's full page goes on in the 360's wells: Promotion beside Employment, Permissions, Activity — each its title in spaced capitals beside its icon → People
- **v4.66** · 2026-10-16 · Finance's phone app: the first button of Payment's bar says *Payment*, not *Create payment* — two words filled the 1.5-wide button edge to edge on the user's phone and did not sit centred; the sheet it opens is still *Create payment*, the desktop's buttons unchanged → Finance's view — the phone app
- **v4.65** · 2026-10-16 · Attendance › Leave balances: the People list picks a department (Records' own dropdown), the pills, list and Export counting inside it → HR's view — Attendance
- **v4.64** · 2026-10-16 · The CRM's Mine Profile looks like the Revenue app's Profile: the peach glow behind a white card, a 56px avatar, Inter Tight on the avatar, the name and *Your workspace*, facts and rows at 650, rows ruled edge to edge, the app's chevron and count, the status-bar strip peach above it → The Revenue app — the refresh
- **v4.63** · 2026-10-16 · A person's full page is a 360 (option C): the card on the left (tile, name, chips, Edit, Department · Reports to · Level · Employment Type · Hire Date), the record in wells on the right in the reference's words (spaced capitals over plain values, a well's icon); no Account or Role; Reports to set here; a login's email locked → People
- **v4.62** · 2026-10-16 · People › Invite user: *Send invite link* | *Set password* — the password hidden behind an eye, the link kept on screen to copy when Supabase does not email it, *Invited* and *Invite again* for a link never used; `/welcome`, where the link chooses the password → People; Choosing a password from an invite link
- **v4.61** · 2026-10-16 · The company's full name is *HOUZS Venture Holding Sdn Bhd* wherever it is printed (the user: "改成 这个houzs venture holding sdn bhd") — the documents' issuer (no longer *Sdn. Bhd.*), the statement's letterhead, a schedule's print, the reports' PDF header, the staff and director payslips, Director Salary's and Director Pool's prints (in capitals), the Revenue app's sign-in footer, the site's description; one constant, `lib/company.ts`. The brand's short name, *HOUZS Venture*, is unchanged → Finance's view — the documents
- **v4.60** · 2026-10-16 · The user's answers: the documents' issuer is *HOUZS Venture Holding Sdn. Bhd.* (no s) with *hello@houzsventure.com* under its lines; the desktop's one-way steps ask first, in the phone app's question — a statement's Issue / Mark as paid, Bill interest / Bill borrower, Mark executed (Department Pools, its submissions, HR Costing's Execute transfers), Dept Requests' Cancel request, Payroll Requests' Send back to HR → Finance's pages on the sheet · Finance's view — the documents
- **v4.59** · 2026-10-16 · Finance's pages: a page's files only for whoever may take them out — the reports, the Ledger, Daily Bank, Statements, Payments' and Receipt's *Export ▾*, Company Statement's ticks, a department's statement, and the phone app's Statements and Payment; Invoice Financing's *Record financing* only for whoever may record it; the printed statement titled *Statement — {code} — {Month YYYY}* (Save as PDF's file name), its *Print / Save PDF* over the letterhead on a phone; a schedule's print on a phone scrolls its table inside the sheet → Finance's pages on the sheet
- **v4.58** · 2026-10-16 · Finance's phone app, part E4b: the portal's last pages as the app's sheets (Amend terms, a pending source's Edit, settle on a receipt, Refund, non-billable, contracts, a voucher's Edit; Print over the app); Finance's view on a phone opens the app; an edit sends only what changed → Finance's view — the phone app
- **v4.57** · 2026-10-16 · Finance's phone app, part E4a: Payments' request queues — Claim, Dept and Payroll Requests (Raise voucher / Generate PV, Payroll's Fund round; Cancel request and Send back to HR asked first) → Finance's view — the phone app
- **v4.56** · 2026-10-16 · HR's view — Attendance, the user's answers: Today's Remind all and fixed-hours people on leave; the person calendar's punch photos and Mark invalid; Requests' attachments open; Policy's by-wage line and Who clocks opening on by wage; the leave type's Balance and pay switches; Readiness' hire dates → HR's view — Attendance
- **v4.55** · 2026-10-16 · Finance's phone app, part E3b: Profile › Admin › Departments and Report › Chart of Account; an account's edit sends only what changed (desktop too) → Finance's view — the phone app
- **v4.54** · 2026-10-15 · Finance's phone app, part E3: Department › Dept Pool, a department's own page, Venture Pool; Profile › Admin › Audit Log and Meeting Rooms (the Revenue app's Book a room, in its own frame and theme) → Finance's view — the phone app
- **v4.53** · 2026-10-15 · Finance's phone app: one-way steps ask first — Issue to subsidiary, Mark as paid, Bill interest, Mark executed open a question sheet before they act → Finance's view — the phone app
- **v4.52** · 2026-10-15 · Finance's phone app, part 5c: Daily › Journal Entries and Reconciliation, Fund › Invoice Financing, Repayment Schedule and Statements — each page's cards, lists and records with its steps and sheets (Match lines on its own screen, Record financing and the Calculator, Generate statements) → Finance's view — the phone app
- **v4.51** · 2026-10-15 · HR's view — Attendance › Month close sends HQ's overtime and unpaid days to payroll: the toast says what payroll took, Outputs › Payroll where each person's payroll stands; the register's OT columns → HR's view — Attendance
- **v4.50** · 2026-10-15 · Finance's phone app, part 5b: Report › General Ledger, Receipt & Payment, Trial Balance, Company Statement, Base Rate History — one page frame (`PageApp`: the headline, the period between its arrows, a card a part, its lines, a line's own screen) → Finance's view — the phone app
- **v4.49** · 2026-10-15 · Finance's phone app, part 5a: Daily › Approvals (the queue as a hub, lists with Select and the dark bar, a request as its page, a combined approval decided voucher by voucher, the desktop's sentences in the sheets) and Daily Bank (the day's total available between its arrows, a card per bank, received, pending, B/F) → Finance's view — the phone app
- **v4.51** · 2026-10-16 · The CRM: an ad shows its name (crm_ad_names) wherever it showed Meta's headline; the Ads to teams editor's title is typed in place to name it (phone and desktop, CRM · Manage).
- **v4.50** · 2026-10-16 · The CRM's phone Showrooms: one showroom at a time, ‹ n / N › and a round + in the title row; no Add showroom row under the list.
- **v4.49** · 2026-10-16 · The CRM: the Control panel's Team | Mine, house and bell move to its Inbox (Inbox ⇄ Inbox); the desktop chat's own bubble is the brand's orange with white words, as the phone's.
- **v4.48** · 2026-10-15 · HR's and Finance's sidebars: the brand's second line is *Internal ledger* alone — no 内部账册, as the prototypes draw it → The HR revamp — HR's view and its kit
- **v4.51** · 2026-10-16 · The CRM: an ad shows its name (crm_ad_names) wherever it showed Meta's headline; the Ads to teams editor's title is typed in place to name it (phone and desktop, CRM · Manage).
- **v4.50** · 2026-10-16 · The CRM's phone Showrooms: one showroom at a time, ‹ n / N › and a round + in the title row; no Add showroom row under the list.
- **v4.49** · 2026-10-16 · The CRM: the Control panel's Team | Mine, house and bell move to its Inbox (Inbox ⇄ Inbox); the desktop chat's own bubble is the brand's orange with white words, as the phone's.
- **v4.48** · 2026-10-15 · The CRM chat: your own bubble is the brand's orange #BD4A19 with white words, white time, white / light-blue ticks; voice controls white; document tiles opaque light; a quoted reply a white band.
- **v4.47** · 2026-10-15 · The CRM chat: Undo send removed (supersedes v4.41 / v4.43) — a message goes at once again, no Unsend in the long-press menu.
- **v4.46** · 2026-10-15 · The CRM chat: on an iPhone the screen fits the keyboard by its bottom alone (the page's height less visualViewport), never moved by the page's pan; the screen's height is the page's, so a chat drawn with the keyboard up still fits it.
- **v4.45** · 2026-10-15 · The CRM chat: the keyboard left to the phone when it reports none (no fitting, no assumed height); Attach and Camera stay in the pill while typing; the viewer draws photos from the phone's copy, the neighbours decoded ahead.
- **v4.44** · 2026-10-15 · The CRM chat: a voice note as WhatsApp's — play left, the waveform in the middle with its duration under it, the speaker's 52px picture on the right centred on the bubble (the speed pill in its place once played), the time on the duration's line left of the picture; the viewer's slide carries on at the finger's speed and eases out (160–340ms); Attach leaves the keyboard as it is.
- **v4.43** · 2026-10-15 · The CRM chat: Undo send has no bar (supersedes v4.41's) — a message still held shows its clock, and its long-press menu leads with **Unsend · Ns** (red, the undo arrow).
- **v4.42** · 2026-10-15 · The CRM chat: a portrait photo from the camera opens in the editor cropped to the middle 9:16 (filling the phone's screen); Crop › Reset gives the whole photo back; the photo library's photos and every video stay as they are.
- **v4.41** · 2026-10-15 · The CRM chat: Undo send — a sent message waits 10s with a dark bar above the composer (*"words…" · sending in 8s* · a white *Undo* pill, rust lettering; *N messages* when several wait), Undo taking the newest back into the box.
- **v4.40** · 2026-10-15 · The CRM chat: the bar's icons a step bigger (Sticker 25, Attach 25, Camera 26, the main button's 24); a voice note's play 30 in a 36 button, its waveform 28 tall; the viewer's photos centred by the strip's own edges, each slide drawn alike so a photo keeps its element moving into the middle; the screen fitted to the keyboard every frame for 1.2s after a focus change.
- **v4.39** · 2026-10-15 · The CRM chat: the mic starts at the press and a slide left cancels (*‹ Slide to cancel*); a voice note's duration sits at the end of its waveform's row, the time its one row under it; the photo editor's picture fills the screen with the strip floating over it; the phone's Back closes a chat.
- **v4.38** · 2026-10-15 · The CRM chat: Attach is a card floating above the bar, as tall as its tiles (no blank, the chat does not move); the reply box taking the keyboard fits the screen to it at once; the photo viewer slides as a strip of the previous, this and the next photo.
- **v4.37** · 2026-10-15 · Finance's phone app, part 4 (M15–M16): Report › P&L, Cash flow, Debtor aging, Loan aging, Balance sheet — the headline under the month, the statements' own parts as cards, a card's lines (an invoice or a deal opening in the app), *Export PDF · Export Excel* and the ⋯ (other files, Segment); the current top tab scrolls into view → Finance's view — the phone app
- **v4.36** · 2026-10-15 · Finance's phone app, part 3 (M13–M14): Fund › Fund out and Fund in — the month's figure over the user's cards, a card's list, a deal as its page (the drawer's parts, then the schedule, the repayments, the terms over time, the settings, the notes, the audit log as numbered item lines) with its steps and sheets; a loan's Void and a terms change's Revert in the kit's window on the computer too → Finance's view — the phone app
- **v4.35** · 2026-10-15 · Finance's phone app, part 2 (M10–M12): Daily › Invoice and Billing — a month's hub and its pill, a list's month, Select and the dark settle bar (Print / Void selected in the head's ⋯), the item lines' chips and steps, an invoice's and an allocation's record with the full page's trail and audit log, Calculate and the payroll basis as screens; a phone select's 16px line fills its 32px box → Finance's view — the phone app
- **v4.34** · 2026-10-15 · HR's view — Attendance: HR's sidebar the handoff's eight sections at 248px; Attendance's seven pages (Today, Records, Requests, Leave balances, Month close, Settings, Readiness) on the design system kit (`components/ds/`), and HR's new Overview → HR's view — Attendance
- **v4.33** · 2026-10-15 · Finance's phone app, part 1 (M01–M09, M17–M18): `/fin-app`'s frame and tab bar, the screen's heads and moves, the Overview, Daily › Payment and Receive (stacked cards, lists, the record with the full page's parts), Profile; every kit window rising as the design's bottom sheet inside the app → Finance's view — the phone app
- **v4.32** · 2026-10-15 · Finance's sidebar has no Claims any more (the user: "delete the claim tab") — Department ends at Venture Pool, on the Overview's Department card too; the page itself stays → Finance's view — its own shell
- **v4.31** · 2026-10-15 · The documents — invoice, receipt, payment voucher, credit note — on the design's one sheet (P01–P04): A4, one sans face, no fills; the title and the walnut H, the meta list, the issuer beside the counter-party, the headline, the items under a black rule, the totals block, payment details / the approval list / signature lines, the footer with *Page N of M*; the salary and statutory detail pages to the same rules → Finance's view — the documents
- **v4.30** · 2026-10-15 · The Team side's chat (the Control panel — the Principal and the Director) is Mine's chat: the same header, layers and composer; whose customer it is and a reassignment's line ride in the header under its row; a cold chat's note and template button, each template with the words it sends → The CRM chat — the composer (#431)
- **v4.29** · 2026-10-15 · The CRM chat's composer, the owner's Claude Design handoff: one pill (Sticker · the reply box · Attach · Camera), the mic held to record, the Sticker panel (Emoji alone — GIF and Sticker wait) and the Attach panel in the keyboard's place at its measured height, the header as the design's (40px buttons with no ring, a green dot) floating over the full-bleed wallpaper, Recents kept per person → The CRM chat — the composer (#425)
- **v4.28** · 2026-10-15 · An invoice's full page in D06's hand — *← Invoices* and the crumb, the number with its status, Amount · To · Created by, PDF and Copy; the cards (Line items, Receipts in green, Credit notes, the description when it says more, the trail, the audit log) beside the dark panel with Balance, Billing and the drawer's steps → Finance's view — a voucher's full page
- **v4.27** · 2026-10-15 · A loan's and a fund source's full page in D06's hand — the crumb, the party with its status, four facts, Print; the cards (the schedule, the terms over time, the settings, Record repayment, the trail, the audit log) beside the dark panel with the steps; the full page's parts in the kit (`FullParts`) → Finance's view — a voucher's full page
- **v4.26** · 2026-10-15 · Create fund out and Record fund in as the design's dialogs on their hubs — the design's fields, then the rate (and a loan's account) the system asks, the term, the funding source, the account and the interest switches behind the small buttons; *Submit for approval* → Finance's view — Create payment
- **v4.25** · 2026-10-15 · Fund OUT and Fund IN as the design's hub: *Create fund out* · *Loan aging* (and our *Export CSV*) / *Record fund in*, *Fund out · {Month YYYY}* — what moved this month — the user's cards (Fund OUT by the loans' status, Fund IN by the source's type, Pending approval black), the list, a deal's drawer with the system's steps → Finance's view — the hubs
- **v4.24** · 2026-10-15 · The Quote's keypad never moves: step 2's card at its tallest from the start, the next-tier line always there (the first incentive before a price is typed, *reached* past the top), long figures smaller on one line → The Revenue app — built to the prototype
- **v4.23** · 2026-10-15 · The Billing Allocator's hub: *Generate invoices* / *+ New allocation*, *Allocated · {Month YYYY}* with the month pill, the notice of what is to bill, the cards Records · By company · Staff · Setup and the list each opens; an allocation's drawer; + New allocation (and Correct) in the drawer; Staff's and Setup's dialogs; an allocation's full page in D06's hand (the full page's stylesheet now the kit's) → Finance's view — the hubs
- **v4.22** · 2026-10-15 · Sales Groups: an uploaded form shows as its file's icon — Word's W, PDF, a picture, </> in the Data center's colours — its name in the tooltip, never on the button → Waiting list flow (#422)
- **v4.21** · 2026-10-14 · The Quote's margin answers as it is typed; *Calculating* while a changed cart is priced → The Revenue app — built to the prototype
- **v4.20** · 2026-10-14 · Sales Groups: the uploaded form's chip has a right-click menu — *View* (a 640px drawer: a PDF, a picture, a Word .docx read in the browser, an HTML form) and *Remove…* (asked beside it; the file is deleted too) → Waiting list flow (#418)
- **v4.19** · 2026-10-14 · The invoice's other dialogs in the kit's sheet — + Credit note, Change account, Generate Marketing invoices, Generate payroll invoices, Reconcile payroll, Own-share → Venture (Office) — on the hub and the invoice's page; a credit note the system refuses drawn shut → Finance's view — Create payment
- **v4.18** · 2026-10-14 · Invoice's dialogs: Create invoice (the design's seven fields, Cancel / Save draft; several companies, a split across billing modes, the month, a reference behind the small buttons; HR's figures fill a recharge) and Multi-line invoice, which also edits an invoice; the form's selects 32px with their edge, the lines card in the kit → Finance's view — Create payment
- **v4.17** · 2026-10-14 · Invoice's hub: *Create invoice ▾* / *Payroll ▾* / *Export ▾*, *Invoiced · N invoices* with the month pill, the cards All invoices … Voided, Credit notes, Marketing projects, Non-billable, the table's *Select* and the dark bar that settles one payer's invoices, the invoice's drawer, the settle dialog → Finance's view — the hubs
- **v4.16** · 2026-10-14 · The CRM: its type on the Revenue app's phone scale (.92) and Profile in the app Profile's sizes; the three round buttons (Team | Mine, the house, the bell) on the first page alone — Mine's Inbox, Team's Insight — Team | Mine going first page ⇄ first page; no line under the Team Inbox / Assignment / Calendar titles → The Revenue app — the refresh
- **v4.15** · 2026-10-14 · A Revenue person's basic: *Basic from commission*, one tick on the Salary section in place of the Employment Type select → People (#412)
- **v4.14** · 2026-10-14 · Receipt's dialogs: Create receipt (the design's six fields and the Category the system books on, Cancel / Save receipt) and Loan repayment received (the loan, its parts, the bank); the form kit's shared parts → Finance's view — Create payment
- **v4.13** · 2026-10-14 · Receipt's hub: *Receive*, the cards All receipts … Received … Voided, the figures +RM in green, Bank among the columns, the same drawer (no full page) → Finance's view — the hubs
- **v4.12** · 2026-10-14 · The CRM's Team | Mine is one round button left of the house (two people on Team, one on Mine), its top row gone; a title row beside the three round buttons never cuts its title → The Revenue app — the refresh
- **v4.11** · 2026-10-14 · Create payment's dialog: the seven fields and two buttons of the design, the date field's calendar, the small buttons that open the rest of the form (split, loan repayment, internal transfer, method, files, notes, GL override) → Finance's view — Create payment
- **v4.10** · 2026-10-14 · A person's full page edits where it stands: *Edit* turns each value into its field, Employment Type one select, the peach save bar at the sheet's foot, a save sends only what changed; the Edit page sends here → People
- **v4.9** · 2026-10-14 · A payment voucher's full page: the crumb, the number with its status and four facts, the numbered cards (Pay to, Deducted from, the files, the trail across, the audit log) beside the sticky dark panel → Finance's view — a voucher's full page
- **v4.8** · 2026-10-14 · Payments' hub: the status cards beside the list, the table's column tools (sort, filter, move, widen, Columns), the payroll batches, the right drawer a row opens → Finance's view — the hubs
- **v4.7** · 2026-10-14 · The CRM Profile's *Back to Revenue app* card is gone: the house beside the bell is the way back → The Revenue app — the refresh
- **v4.6** · 2026-10-14 · Finance's Overview and HR's on its layout: the greeting, one line of what waits, eight quick actions with counts, a card per category; HR's three tables gone → Finance's view — the Overview
- **v4.5** · 2026-10-14 · A person's own documents: Company · Personal everywhere, the Data center's right-click, *<person> can view* and *View only me* ticks and badges, Copy to… / Duplicate, *Hidden* letters → Documentation; My documents; The HR phone app; The Revenue app
- **v4.4** · 2026-10-14 · The Revenue app's bell moves by itself (Realtime, silently); every CRM page has the Revenue app's home beside its bell → The Revenue app — the refresh
- **v4.3** · 2026-10-14 · Finance's view wears its own shell: the sidebar in Daily / Fund / Report / Department, the account menu, Edit profile; both views' sidebars 212px → Finance's view — its own shell
- **v4.2** · 2026-10-14 · The Revenue app's refresh: Today's CRM chat button (live unread), income as a statement, Arena bank cards and board heroes, the 10px type floor, sheets close when pulled down → The Revenue app — the refresh
- **v4.1** · 2026-10-14 · A Revenue Director in the Revenue app: the sub-departments they direct, *All of Fair*, *ANNA leads* → The Revenue app (#381)
- **v4.0** · 2026-10-14 · The HOUZS Venture Design System (Claude Design) adopted: two themes, `--ds-*`, Newsreader / Inter Tight; history trimmed to this index → Part I (#366)
- **v3.86** · 2026-10-14 · CRM phone notices titled by the customer, their picture as icon; *Make them pop up* → The HR phone app; The Revenue app (#363)
- **v3.85** · 2026-10-14 · Finance view: payroll only in Payments' *Payroll batches* tab, by department; All and status tabs count none → Sheet theme (#361)
- **v3.84** · 2026-10-14 · Statements one month at a time, picked at the head; Finance's Overdue page gone → Finance's pages on the sheet (#360)
- **v3.83** · 2026-10-13 · Payroll by department where one person's pay is hidden; *Generate by Department* first → Payment statement (#359)
- **v3.82** · 2026-10-13 · HV's director share is payroll: *Waits for payroll* / *In payroll #N* / *Directors sent* → HOUZS Venture's director share (#353)
- **v3.81** · 2026-10-13 · Food claim: Member services' *Food claim* tab; the app's *Submit food claim*, by month → Member services; The Revenue app (#343)
- **v3.80** · 2026-10-13 · Data center: the Bin (30 days, Restore · Delete forever, Empty bin) and *Move to…* → Documentation (#345)
- **v3.79** · 2026-10-13 · Number held by another branch; never landed in this file
- **v3.78** · 2026-10-13 · Pool Breakdown gains the HOUZS Venture row and the departments window on Save → HOUZS Venture's director share (#344)
- **v3.77** · 2026-10-13 · Talent Bank Bin: a deleted file, folder or person waits 30 days → Hiring › Insights and the Talent Bank (#342)
- **v3.76** · 2026-10-13 · Drops & upsells: a shared bill's change names its holders; *Deducted directly* → The ERP audit trail (#340)
- **v3.75** · 2026-10-12 · No subtitle, lede, hint or menu second line on any portal page; a lone state is a chip → No descriptions on the page (#339)
- **v3.74** · 2026-10-12 · Talent Bank is a Drive (company › department › people, *Move to…*) → Hiring › Insights and the Talent Bank; Guest link (#338)
- **v3.73** · 2026-10-12 · My brand weeks: month folds, *W1* badges in brand colours, Brand / Venue / Organizer, no future weekend → The Revenue app (#336)
- **v3.72** · 2026-10-12 · Airbnb claim: invoice up to a limit, the stay on one calendar; Hiring's foot-of-page menus open upward → The Revenue app (#337)
- **v3.71** · 2026-10-13 · Comm Cal's ERP audit trail on a bill's page and Drops & upsells; *Cancelled*, not *Drop sales* → The ERP audit trail (#334)
- **v3.70** · 2026-10-12 · A memo reaches its person in every view: the memo bell, one memo card, Publish › Preview → Documentation (#335)
- **v3.69** · 2026-10-12 · Data center is a Drive: + New, the path, a search, folder and file cards → Documentation (#333)
- **v3.68** · 2026-10-12 · The phone apps' frames are fixed to the screen, never `100dvh` → The phone's own navigation bar (#330)
- **v3.67** · 2026-10-12 · Guest manpower request lists the picked company's departments; Insights gains Company → Guest link — Request manpower (#331)
- **v3.65** · 2026-10-12 · Comm Cal: *Cancel share with NAME* per holder; a move gives a taken share back → Bill context menu (#328)
- **v3.64** · 2026-10-12 · Brand weeks come from the ERP's Sales Attending, read only: solid ERP, dashed auto-located → Member services; The Revenue app (#325)
- **v3.63** · 2026-10-12 · Comm Cal: *Move to another salesperson…*, *Open NAME* / *Undo*, *Moved from NAME* → Bill context menu (#324, #326)
- **v3.62** · 2026-10-12 · Comm Cal: rows from another month (Status column, cool wash); a one-line bill menu → Rows from another month (#323)
- **v3.61** · 2026-10-12 · Change password for a personal login: Admin › Change password, the HR app's More, the app's Profile → Change password (#319)
- **v3.60** · 2026-10-11 · The Revenue app's Profile on a phone: *Switch view* rows → The Revenue app — built to the prototype
- **v3.59** · 2026-10-11 · Notification status-bar icon: the H tile cut out in white (`public/icons/badge-tile-96.png`, replaces v3.56)
- **v3.58** · 2026-10-11 · Soft dropdown on touch: search waits for a tap; the menu follows its field past the keyboard → The HR revamp, round 2
- **v3.57** · 2026-10-11 · Pages and the app open with the bottom bar shown; HR app pages open at their top → The phone's own navigation bar
- **v3.56** · 2026-10-11 · Notification status-bar icon: the H alone, white on transparent (`badge-96.png`; replaced by v3.59)
- **v3.55** · 2026-10-11 · Bottom bars tuck away on a 24px scroll down, back on a scroll up → The phone's own navigation bar › Tucked away while reading on
- **v3.54** · 2026-10-11 · Waiting list's "+" first in its row and its window; *Added by*, never *Signed by* → Waiting list flow (#310)
- **v3.53** · 2026-10-11 · Permissions: *Select all*, amber not-open line, *+ New template* window → Permissions by view and tab (#309)
- **v3.52** · 2026-10-11 · First open's *Turn on notifications?* card in both phone apps → The HR phone app; The Revenue app
- **v3.51** · 2026-10-11 · Meeting Rooms: the day's label opens a month; the free half hour under the pointer lights → Meeting Rooms (#306)
- **v3.50** · 2026-10-11 · ONE app: the HR app is HR's view of the one install; More gains the view switch → The HR phone app (#305)
- **v3.49** · 2026-10-11 · Publish: *Withdraw* a memo, asked twice; *Show withdrawn (n)* greyed → Documentation
- **v3.48** · 2026-10-11 · Hiring › Form settings › File types: rename in place, On / Off, Résumé built in → Hiring files
- **v3.47** · 2026-10-11 · Notifications: the HR app's bell and page, the app's UPDATES, *Phone notifications* rows → The HR phone app; The Revenue app
- **v3.46** · 2026-10-11 · Several typed files per candidate and talent: type picker, files pills, the Files card → Hiring files
- **v3.45** · 2026-10-11 · *Grace (for NAME)* on every schedule; workspace rows; the HR app's claim Approve asks how to pay → Meeting Rooms; The HR phone app
- **v3.44** · 2026-10-11 · Documentation: withdraw a letter, *Show withdrawn*, a red *Withdrawn* chip, a deleted file's preview → Documentation
- **v3.43** · 2026-10-11 · Replacement list's own Upload form and Form settings; Submit replacement → Waiting list flow; Submit waiting list (#292)
- **v3.42** · 2026-10-11 · Every select on HR's pages is the soft dropdown (`bare` / `plain`, optgroups, .18 ring) → The HR revamp, round 2 (#291)
- **v3.41** · 2026-10-11 · HR sidebar brand block, one-line sub-department switcher, waiting drawer head → The HR revamp (#290)
- **v3.40** · 2026-10-11 · Phone parity: black field text, the menu above when below won't fit, the HR app's sheet at 86% → The HR revamp, round 2
- **v3.39** · 2026-10-11 · Documentation's preview draws an Excel or CSV file as a sheet → Documentation
- **v3.38** · 2026-10-11 · The HR phone app `/hr-app`: Home, Review, Hiring, Rooms, More and its sheets → The HR phone app
- **v3.37** · 2026-10-11 · Guest Request manpower: five steps, pills, the file, Check and send, its Preview → Guest link — Request manpower
- **v3.36** · 2026-10-11 · The app's Book a room (By room / Timeline, 64px an hour) and Documentation → The Revenue app — Book a room and Documentation
- **v3.35** · 2026-10-11 · Admin › Guest Link and the public `/g` page, phone first with a Preview column → Guest link
- **v3.34** · 2026-10-11 · Meeting Rooms: a day's rooms side by side, the Book and booking drawers, rooms as cards → Meeting Rooms
- **v3.33** · 2026-10-11 · Hiring › Insights (six cards, days to fill, source, department) and the Talent Bank → Hiring › Insights and the Talent Bank
- **v3.32** · 2026-10-11 · Hiring › Requests: review inbox, Listing, Form settings, a request's page, the résumé drawer → Hiring › Requests
- **v3.31** · 2026-10-11 · Documentation: Documents, Data center, Letters, Publish and the 640px preview → Documentation
- **v3.30** · 2026-10-11 · The HR revamp's round 2: the soft dropdown and the drawers' motion → The HR revamp, round 2
- **v3.29** · 2026-10-11 · Permissions ticked view by view and tab by tab; the person window's red dots → Permissions by view and tab
- **v3.28** · 2026-10-10 · The app's Waiting list & replacements: the queue, the request sheet, Edit request → Update → Waiting list & replacements
- **v3.27** · 2026-10-10 · Submit waiting list: HR's questions in order, the Application form box, the signature pad → Submit waiting list
- **v3.26** · 2026-10-10 · Hierarchy: People & roles in title bands, Levels as chip rows → Hierarchy
- **v3.25** · 2026-10-10 · People: one roster grid with department bands, the person window, Invite user as a window → People
- **v3.24** · 2026-10-10 · Replacement review: *Replaced by* chips, the effective date, Scheduled · Completed → Replacement review
- **v3.23** · 2026-10-10 · Member services: Request reviews, Brand weeks as chips, Claim rates, Publish memo → Member services
- **v3.22** · 2026-10-10 · Waiting list: Upload form, Form settings, Fail · Transfer and the employee form → Waiting list flow
- **v3.21** · 2026-10-10 · Sales Groups: one-row chart toolbar, Members grid edited in place, Waiting and Replacement lists → Sales Groups
- **v3.20** · 2026-10-10 · Rules: a grouped side list, Scheme rules as switches, Ranks, Capacity → Rules
- **v3.19** · 2026-10-10 · HR's own shell (icon-tile sidebar, white greeting bar, scrolling sheet) and the `components/hrv` kit → The HR revamp
- **v3.18** · 2026-10-09 · Salary, NRIC and bank accounts read `••••` without their tick → Part II › A hidden value
- **v3.17** · 2026-10-09 · Approvals by domain: a row you may not decide has no tick → Multi-select — ticks outlive a drill-down
- **v3.16** · 2026-10-08 · Every button follows its own cell of the permission matrix → Permission matrix
- **v3.15** · 2026-10-08 · Audit Log › Changes: the app-wide history, each reader's own areas → Audit log — Changes
- **v3.14** · 2026-10-08 · People Management: permission templates, the matrix, the Invite user drawer → Permission matrix
- **v3.13** · 2026-10-08 · The Product List moves into the Revenue app (`/member/products`), drawn to its handoff → Product List — a page of the Revenue app
- **v3.12** · 2026-10-07 · The sheet on Finance's view too — every portal route → Sheet theme; Finance's pages on the sheet
- **v3.11** · 2026-09-27 · Product List: Costing Setting and Add-on / KPI Items per sub-department → Product List — a page of the Revenue app
- **v3.10** · 2026-09-27 · The sheet reaches the Overview (all four dashboards) and People → Sheet theme
- **v3.9** · 2026-09-27 · Sheet theme, HR's view first: one white sheet, orange markers, StatCards, chips → Sheet theme
- **v3.8** · 2026-09-26 · Navigation feedback: `loading.tsx` everywhere, the row sweep, skeletons, the progress line → Navigation feedback
- **v3.7** · 2026-09-11 · HR › Payment's statement → Payment statement
- **v3.6** · 2026-09-11 · HR › Payment's board (`.pay-board`; cited by globals.css, never in this file's log) → Payment statement
- **v3.4** · 2026-09-09 · Org chart canvas (Revenue › Staff Hierarchy): `--cv-*` palette, the Move popover → Org chart canvas
- **v3.3** · 2026-09-05 · HR › Payroll's grid → Payroll grid
- **v3.2** · 2026-09-01 · People Management's roster density → Roster density
- **v3.1** · 2026-08-31 · Walnut palette (Plaster · Walnut · Harbour) and the named radius scale → Part I › Colour; Spacing, radius, shadows
- **v3.0** · 2026-04-25 · Ledger-Dense pass: `.num`, `.ledger-table`, `.page-head`, `.sect-head`, `.chip`; 17 pages migrated → Part II › Utility classes; Shared portal rules
- **v2.0** · 2026-04-10 · Warm cream, Instrument Serif and a rust accent (superseded by v3.1)
- **v1.0** · 2026-04-09 · First direction from /autoplan: slate (superseded by v2.0)
