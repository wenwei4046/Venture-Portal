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
| **HR — the ledger** (the default) | Every portal page, whatever the department (HR, Finance, the Principal), plus the HR phone app | `:root`; the white sheet (`.sheet-theme`), HR's shell (`.hrv-shell`), `[data-hr-app]` | Formal. Black ink on white sheets, orange as a marker (never text), Newsreader page titles, mono figures, dense grid tables |
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
- **The app speaks to *you*** ("Your workspace", "Hello, Jia Hui"), and the greeting bar is formal ("Good afternoon, Principal."). The name in *Hello,* is the first name — the one People keeps, else the full name's split (v4.89: their own name, never the surname — "Hello, WEN WEI" for LOO WEN WEI, never "Hello, LOO WEN").
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

**The Finance view (2026-10-09)** applies to Finance's pages only — the routes in `lib/finance-view.ts`, as Finance or the Principal sees them. HR's pages keep the sheet as above.
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
- **On a phone `MoreSheet` ends with *Phone notifications*** (v4.73), above *Sign out*: a 28×16 switch, `bg-ds-accent` when on; a state the switch cannot answer for is its chip — *Add to Home Screen* (an iPhone outside the Home Screen app), *Blocked* — and *Make them pop up* follows on an Android phone once on. The first open asks *Turn on notifications?* in the apps' window (`PushAsk`). Never while viewing as a person, never on a computer (`components/pwa/PortalPushRow.tsx`, `PortalPushAsk.tsx`).
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
4. **`SheetReport`** (`.sheet-rpt`, the reports' sheet) — it pins the account column and scrolls inside its own frame.

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
- **How to use it:** `useStickySelection(scope, visibleIds)`; see Comm Cal's `useSalespersonCloses.ts`. A list whose detail is a modal or a drawer never unmounts and needs none of this (Approvals since v4.77).
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
4. Before committing: `npm run lint -- --quiet` (`next lint` is gone since Next 16), the tests (the design guards: `no-page-descriptions`, `soft-select-coverage`, `route-boundaries`, `safe-area`, `design-system-tokens`), and a look at the page at 1280 and 1440 wide and at a phone width.

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

Every page Finance reads (and OPEX) moved onto the sheet by route. A page's anatomy changes only when it is converted (Part II › **How a page is built on it**); the Finance view redraws these pages from `.design/finance-revamp`.

Converted so far:
- **Payments and Receipts** — their hubs since v4.8 / v4.13 (`VoucherHub`).
- **Approvals** — its hub since v4.77 (`approvals/_components/ApprovalsHub`), a request or a combined approval decided in its drawer.
- **Invoice** — its hub since v4.17 (`statements/_components/InvoicesHub`), its dialogs since v4.18.
- **Statements** — one month at a time (v3.84).
- **The Billing Allocator** — its hub since v4.23 (`billing-allocator/_components/AllocatorHub`), a record's full page in D06's hand (`/billing-allocator/[id]`).
- **A page's files** (*Excel*, *PDF*, *Export ▾*, the ticks that pick what to export) show only to whoever may take them out — the Export its route asks, on the desktop and in the phone app alike (v4.59). The Venture Pool's stays for every reader of the page (the user, 2026-10-12). Invoice Financing's *Record financing* shows only to whoever may record it.
- **One-way steps ask first on the computer too** (v4.60, the phone app's question since v4.53): a press nothing on the portal takes back opens the kit's question in the phone's words — a statement's *Issue to subsidiary* / *Mark as paid* (*Issue to <company>?* · *<month> · <net>*), Invoice Financing's *Bill interest* and the register's *Bill borrower* (*Bill <borrower>?* · *<BA no.> · <charge>*), *Mark executed* on Department Pools and its submissions and HR Costing's *Execute transfers* (*Mark <month> executed?* · *HR costing · <total>*), Dept Requests' *Cancel request* (red), Payroll Requests' *Send back to HR* (red — the inline *确定打回 …？* second click is gone). *This cannot be undone.*, *Cancel* · the step; a refusal stays in the question. A step with its own way back (Mark settled, Reopen) stays one press; the browser's own confirms (Delete, Provision) are unchanged.
- **On a phone**
  - The `.fin-queue` pages set an opened row's labels in the card-label face, and its one action (Settle) as an orange pill.
  - Finance's and the Principal's tab bar reads in English.

### Finance's view — its own shell (v4.3, 2026-10-14)

The source is the Claude Design handoff *Finance 侧栏分类整理* (`.design/fin-r2/handoff`, `prototype/Finance Desktop.dc.html` + README; screenshots D01–D13). Who wears it: the finance kind and the Principal's Finance lens, on a computer (`isFinanceShell`) — and since v4.76 the Principal's own view, its own few rows added (*The Principal's own view* below); a phone opens Finance's phone app.
- **The shell is HR's** (`.hrv-shell.fin-shell`): `FinSidebar` over `ViewSidebar` at 212px, `HrTopBar` reading *Finance view*, the sheet padded 24 / 28 / 48 (`.fin-sheet`) and scrolling on the browser's own scrollbar, not the portal's thin one. On a computer the sheet sits right under the 70px bar — the frame keeps its 10px on the other three sides only (both views; both prototypes draw it so). Finance's pages keep `.fin-view` — on the frame now — and their place on Back.
- **The sidebar's categories** (`components/layout/fin-nav.ts`): Overview · I. DAILY (clay) Payments, Receipt, Invoice, Billing Allocator, Daily Bank, Reconciliation, Journal Entries · II. FUND (olive) Fund IN, Fund OUT, Invoice Financing, Repayment, Statements · III. REPORT (slate) General Ledger, P&L, Cash Flow, Receipt & Payment, Balance Sheet, Trial Balance, Debtor Aging, Loan Aging, Company Statement, Chart of Account, Base Rate History · IV. DEPARTMENT (gold) Dept Pool, each department, Venture Pool. Approvals (first in Daily) shows only to its holders; Overdue is not drawn (its page is gone), and neither is Claims since v4.32 (the user took it out; its page stays).
- **The footer is a button** — *Finance · settings & admin* — that opens the account menu (D13): a white popover 10px in, 64px up, radius 12, the menu shadow; ACCOUNT (Change password — a login of one's own only; Edit profile went in v4.85: Me › Profile's is the one), ADMIN (Audit Log, Departments, Meeting Rooms), a rule, SIGN OUT in caps. A transparent scrim closes it.
- **The kit** (`components/finv/`): `FinDialog` — the prototype's desktop sheet, 520px content-box on `248 245 240`, radius 16, `0 30px 70px` shadow, fading in from .98 over .2s and out again before it unmounts (`usePresence`); `aside` (2026-10-24, IT support's file preview) a panel of the same look beside it — the two centred together, the window moving left, the panel up to 760px wide and 86vh tall, in from 12px left over .2s; under 960px it lies over the window, on a phone's sheet over the sheet; its bodies `DialogMenu`, `DialogConfirm` (red when it undoes), `DialogForm` with `Field` / `Input` (40px content-box, radius 10, the .18 ring) / `Hint` / `DialogButton` (38px). `FinToastHost` draws `flash()` as the walnut pill at the window's foot, 12px up and in over .28s, held 2.2s, played out too.
- **Change password** — the 2026-10-12 rules in the design's dialog, its sub *At least 6 characters* (the real rule, not the design's 8). **Sign out?** asks first.

### Finance's view — the Overview (v4.6, 2026-10-14)

D01 of the same handoff, and HR's Overview drawn on it (H01–H02, `HR Overview.dc.html`). `dashboard/_components/FinanceOverview.tsx` / `HrOverview.tsx` on `overview.module.css`; the page reads (`_lib/finance-overview.ts`, `_lib/hr-overview.ts`) and hands the figures in. The Principal's own view opens on it too since v4.76, with its figures and Approvals (below); the treasury dashboard is left to whoever reads the treasury off Finance's view.
- **The head:** the office's date and quarter in Chivo Mono caps (HR's adds *· HR view*), the greeting by the office clock and the first name in Newsreader, a short accent rule; on the right one primary and one quiet button — *Create payment* / *Create invoice* (Finance), *Import payroll* / *Calculate director salary* (HR) — each shown only to whoever may do it.
- **One line of what waits**, each part only for whoever opens its page: *N vouchers waiting for approval · N invoices outstanding · N allocations to bill.* / *October payroll is not imported yet · N hiring requests waiting · director salary not calculated.* HR's (2026-10-23) says *N probation(s) ending* after the requests waiting for HR, for whoever may acknowledge one, only while some wait — and *N contract(s) ending* after it (2026-10-24).
- **Quick actions:** a label with a rule, then eight tiles (icon in its tone, label under it, a walnut count badge where something waits) — Finance: Payment, Receive, Invoice, Billing, Daily Bank, Fund IN, Fund OUT, Ledger; HR: Hiring requests, Import payroll, Payment, Director salary, People, Member services, Book a room, Comm Cal. HR's **People** tile — and People's row in the People Management card — counts the probations waiting for Acknowledge (2026-10-23, as HR view's bell counts them), and the contracts (2026-10-24).
- **A card per category**, the sidebar's own sections in its order (Finance: Daily · Fund · Report · Department), its numeral, name and *N pages*, then its rows — icon tile, label, a short mono note where the row has news (HR's), a chevron.
- **The sheet** pads 24 / 28 / 48 on both and scrolls on the browser's own scrollbar (`.hrRoot` sets it for HR's).

### The Principal's own view — Finance's view (v4.76, 2026-10-17)

The user: "revamp the principle desktop view, take the same totally view with finance. no need show hr, cause can switch view to hr … the mobile use the same view with finance app … just add on then tab for approval tab". The Principal's own view — the Principal kind on an account that may switch views (`isPrincipalView`; one that may not keeps the portal's sidebar, which lists HR's pages) — wears Finance's view everywhere; what it may do is unchanged (it still reads payroll by person — that is the Finance lens's, `listsPayrollByPerson`).
- **On a computer** it is Finance's shell (`FinSidebar principal`): the same four categories and rows, *Principal* in the bar's view switch, *Principal · settings & admin* on the footer. HR's pages are not listed — HR's view is one switch away. Its own rows, where the user placed them: **OPEX** at IV. DEPARTMENT's foot; in the account menu's ADMIN, **Access log** after Audit Log and **Settings** last (*Audit Log · Access log · Departments · Meeting Rooms · Settings*) — Settings opens on Treasury, its strip reaching every tab. The old Claims is not drawn (Finance's isn't either; the user is building a new claims tab).
- **The Overview is Finance's** (D01) with three things of its own: the line leads with what waits for its decision — *7 requests waiting for your approval · …* (the queue's items it may decide, a combined approval one; `lib/approvals-waiting.ts`); a row of the treasury's figures under the line (the user kept them, "留一排金额卡") — **Venture Pool**, **Pool**, **Lent out**, **Interest · Oct** (net, *In … · Out …* under it), each a white 12px-radius card (caps label and its tone's icon chip, Chivo Mono 21, a 11.5 line; red when below zero), four across from an 880px page, else two by two, each opening its page; and **Approvals** first among the quick actions (nine: one row from a 1000px page, five and four under it), badged with that count. The figures are the treasury dashboard's own summary (`dashboard_summary`); its margin panel is not drawn.
- **On a phone** it opens Finance's phone app (`opensFinApp`) with a sixth tab — **Approvals**, after the Overview (*Overview · Approvals · Daily · Fund · Report · Profile*), its badge the same count (the accent dot over the icon, 18px, a 2px bar-coloured ring). The tab is Daily › Approvals' own screen as a tab root (`/fin-app/approvals`): the hub under the tab's head, its lists, combined requests and requests pushed over it with the bar away. The Overview's figures stand two by two under its line; Approvals takes no quick action there (it has its tab). A tab root's kicker reads *HOUZS Venture · Principal*; Profile names *Principal view* and its Switch view lists *Principal — This app, with Approvals*.

### Approvals — Finance's hub on the computer (v4.77, 2026-10-17)

The user, on the Principal's own view: "make sure the approve tab is fullfill as well, cause usually i use that". `/approvals` is drawn as Finance's hubs are (`approvals/_components/ApprovalsHub` on the kit; its figures the phone app's own model — `_lib/hub-model` over `lib/fin-app/approval-model` — so the computer and the phone count alike), for everybody who opens the queue. The sheet's four summary cards, its two tables and the batch window are gone.
- **The cards:** the walnut-framed total *Pending · to approve* with the oldest wait as its chip (*Oldest waiting · 15 days*, alert from three days), then *Pending* (black), *Submitted by the executive* (*2 of the 7*), *Decided · 30 days* (olive; *96 approved · 3 rejected*, the count). They keep the phone's words, so they are wider than the other hubs' where they wrap (`HubCards wide`, `minmax(220px, 1fr)`); on a desktop they sit in the row above the table, as every hub's cards do (v4.120). The card on show is the address's (`?card=exec`, `?card=decided`).
- **The table** (`FinTable`; `fin.approvals`, `fin.approvals.decided`): Name — who is paid (a combined approval *SIA JONAS + 11 more*) —, Request (its words; a combined one its kind, *Payment voucher × 12*, *New loan + PV*), Submitted / Decided, Amount; under Columns Ref #, Type, By, Pool, Category, Pay by, Files and Status (shown on Decided, the decision's chip; a rejected amount faint). The search finds the number, the payee, the request, its kind, who sent it, the pool and the category.
- **Select** ticks only what is the reader's to decide (a row that is not says why when pressed); the dark bar — *N selected · RM …*, *Approving pays each voucher at once* (or *N combined requests — decided whole*), *Clear*, *Reject…*, *Approve N →* — asks in the kit's dialog with the queue's words, its notes, the overdraw and the reason. What is decided leaves the list at once; the cards follow the server's next read.
- **A row opens the drawer.** A request as its page shows it (the phone's request screen, `RequestParts`): *View full page ↗* in the head, Approve · Reject at the foot (Approve pale when the bank is short), ⋯ for the voucher, the loan, the fund source or what raised it. A combined approval: its hero, then its vouchers — who each pays, the number, the description, the pools, the files, *Open ↗* — each with an *Approve* / *Reject* chip turned on its own when nothing else rides along (the bar *Approve all 12*, *Approve 11, reject 1*, *Tick all to reject*), else Approve · Reject whole; then *Approved together* and the request. `?group_id=` opens a combined approval's drawer (Payroll's *Open Approvals →*).
- **Right-click a row:** Open, Open full page in new tab, Open the voucher (the loan, the fund source), Tick to decide (only what is the reader's).
- The decisions are the phone's own (`_components/decisions.tsx` — one hook, the queue's Server Actions), and so are the pool names: a voucher drawing twice on one pool names it once (*Venture Pool*, not *Venture Pool + Venture Pool*).
- **A request's full page** (*View full page ↗*, `/approvals/[id]`, v4.78) is drawn as Finance's records are (D06, `[id]/_components/ApprovalFullPage` on `FullParts`): *← Approvals* and the crumb (*Daily · Approvals · HV-PV-…*); the kind over the number (a request with none, its kind — *New loan*), its status pill, four facts — Amount, To, Submitted, By; the numbered cards — a voucher's *Pay to* (payee, company, description, *Raised by* what raised it), *Deducted from* line by line, *Attachments* (the request page's own list, kept: each file with Download, a picture or a PDF shown in place — the bill read without leaving the page); a loan's terms; anything else its own words (*Request*); *Decision notes* once decided; the *Trail* (Submitted → Decision / Approved / Rejected) — beside the dark panel: the kind and status, the amount, *Pay to …*, When & where (the bank with its balance, the pool) or a loan's Terms, the bank's shortfall in red, then Approve · Reject (Approve shut while the bank is short), *Open the combined request* for a request decided with others, the reason it is another's to decide, ⋯ for the voucher, what raised it, the loan or the fund source. It reads the drawer's record (`approvalRecordModel`) and decides with the same hook, then goes back to Approvals.

### Finance's view — the hubs (v4.8, 2026-10-14)

D02–D05 of the same handoff, first on Payments (`payments/_components/PaymentsHub` → `PaymentsHubClient`; the kit `components/finv/Hub.tsx`, `FinTable.tsx`, `Drawer.tsx` on `hub.module.css` / `drawer.module.css`). Receipt, Invoice, the Billing Allocator and Fund OUT / IN follow on the same parts.
- **The head:** `I. DAILY · PAYMENTS`, the title, the 64px segment; on the right *Create payment* (the primary), *Dept · N*, *Payroll · N* and ours kept — *Claims · N*, *Export ▾* — each a white button opening a menu (the dialog's) of what waits. On a narrow sheet the five wrap under the title.
- **The cards** — on a desktop (768px and up, v4.120) one row above the table: the total first at 1.6 cards, then a column a card, 175px or more with its figure whole (`cardRowFit` widens the step for a long figure); short of room, two rows beside the total, then wrapped above the table; a card's name and line wrap rather than cut. The box is measured by `@container hub-cards` in steps of 280px + 185px. On a phone (`flex: 1 1 260px`, a grid of `minmax(168px, 1fr)`) as before: the walnut-framed total — *Total paid · {Month YYYY}*, Chivo 26 in walnut — then one card per list: All vouchers (walnut), Draft, Pending approval (black, never blue), Approved (clay), Paid (olive), Voided (the quiet light one, a hairline), Payroll batches; a round icon chip, the name 13.5/600, a mono count, the figure Chivo 15/600, a faint arc — the count and the figure are what the list's head shows for that card (a folded payroll batch counts its members; money moved outside the voucher flow is counted apart: *190 vouchers · 127 other*); the one on show ringed `0 0 0 2px #fff, 0 0 0 4px` accent.
- **The table panel** (the hub's whole width on a desktop; `flex: 2.6 1 440px` on a phone): the list's name and its mono count (*11 · RM 457,783.00*, or *4 of 11 · filtered*), the search (36px content-box, radius 10), *Columns*. The navy head band (40px, 10.5/600 caps): every heading sorts ↕ → ▲ → ▼ → off, filters by its values through the funnel (not Amount — a popover of 230px: the values with their counts, *Clear*), moves when dragged onto another (the target lit with a black edge) and widens from its right edge (never under 70px). Rows 46px, peach on hover and while open in the drawer, a quiet `›`. Name · Description · Amount always; Ref #, Date, Category, Pool, Status ticked on in the Columns panel (230px: *Drag a heading to move it · drag its edge to resize*, the fixed three greyed, *Reset*), each in its place before Amount; the table scrolls sideways only once it outgrows the panel.
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
- **The dialog** (the kit's FinDialog, `wide` — 680px since v4.122, 520px before): *Create payment* · *New payment voucher · HV-PV-{YYYYMM}*; Pay to (the 40px input, *Payee name*) beside Payment date, From bank (the soft select at radius 12, 32px tall) beside the method once *Method* is on, Description (*What is this for?* — the voucher's), then **Lines** (v4.122 — the user: "split pool 这个按钮我不想要，我想maintain之前的add description/line, attachment 就default 要有" → "每行一个，GL override 拿掉"): a card of lines, each its own words (*What this line is for* — the books' line when there are some), Pool, Category, Amount and ×; *+ Add line*; their total in the peach foot, the voucher's amount — then Attachments, always there; *Save draft* (white) and *Submit for approval* (orange), both at .45 until nothing is missing; the line under the fields says what is (*Pay to, an amount, a category and a description are needed before you can save.*, the list as long as what is missing). On a phone the pairs stack, and a line takes three rows — its words, Pool | Category, the amount and ×.
- **The date field** (D08): the day written out (*Wed, 14 Oct 2026*) beside the calendar glyph on a 40px button, ringed in the accent while open; under it (over it when the form's scroll has under 390px below and more above) the month on a 300px card (content-box, radius 14): ‹ › as 32px rounds, M–S in 10.5px, days as 32px circles 38px apart — the picked one orange with its glow, today ringed — and at its foot the date and *Today* in peach (28px, radius 6). In from 4px over .16s; it sits in the form's scroll, as the prototype's does.
- **What today's form also does** opens from a row of small buttons under the fields, in *Today*'s hand (28px, radius 6, 12/500, peach with an accent edge while on): *Loan repayment* (Repay — the deal; Principal / Interest / Penalty; Pay to and the amount follow; a line per part on its own account, its words kept through a change), *Internal transfer*, *Method*, *Notes*. *Split pools*, *Attachments* and *GL override* left the row in v4.122 — the lines are always there, the files always shown; GL override stays on a voucher's Edit (the desktop's form, the phone's sheet), which edits each line's words too. Pay to offers the companies it matches in the soft menu's look; Category groups the accounts by type and finds one by its code too.
- **A line's words** (v4.122, `payment_voucher_sources.description`, mig 20261022183000): the voucher's drawer says them before the account, its page beside the pool, the PDF under the pool, Approvals before the account; approving writes them on the line's journal debit line (a line without them keeps *expense - {payee} ({pool})*). Copy as draft copies them.
- **Receipt's dialogs** (D09, the prototype's `or-form`; `receipts/_components/CreateReceiptDialog.tsx`, `LoanRepaymentDialog.tsx`, on the same kit): *Create receipt* · *Official receipt · HV-OR-{YYYYMM}* — Received from (*Payer name*, the companies it matches), Description (*What was received?*), Into bank, Credited to pool, **Category** (the system books a receipt on an account; grouped asset → income first), Amount RM, Received date; *Method*, *Attachments*, *Notes* behind the small buttons; *Cancel* and *Save receipt* (orange), the hint the receipt's short sentence (*Received from and an amount are needed.*). *Loan repayment received* · *Recorded on the loan · Fund OUT* — Received from is the LOAN (borrower · principal · day · SC), with *Owed RM … · n of m left · r%/mo* under it; Description; Principal / Interest / Penalty side by side; *Interest credited to* where the borrower's interest sits in suspense; Into bank; Amount RM their sum, read only; Received date. The form's shared parts live in the kit: `PartyInput`, `FilesField`, `form-words.ts`, `form.module.css`.
- **Invoice's dialogs** (D10, the prototype's `inv-form`; `statements/_components/CreateInvoiceDialog.tsx`, `InvoiceLinesDialog.tsx`, their fields `InvoiceFormParts.tsx`, on the same kit): *Create invoice* · *Saved as draft · approve to issue* — Bill to (one select: the companies, the department pools, *A director…*, *Someone else…*; a name typed under it, and someone else's address — the portal's six parts, ① *State* → ② *City* → ③ *Postcode* picked (People's *An address is six parts*, v4.112; a half-picked one is refused in the hint, *Pick the city, postcode.*; an invoice billed before keeps its words *On file* above the empty fields; the document prints it a line each) — then Phone and Email), Description (*e.g. HR shared service — Oct*), Category (income first), Billing mode (the hub's words: HR attribution, Marketing project …), Amount RM, Invoice date (the month's last day until it is touched), Due date (thirty days on; it may be left out — *No due date*, the calendar's *Clear*); *Cancel* and *Save draft* (orange), the hint *Saved as a draft. Approving issues it and posts it to the GL.* — what is missing only once Save draft is pressed. Behind the small buttons: *Several companies* (Bill to becomes a card of companies and amounts, *+ Add company*, the sum in the peach foot), *Split billing modes* (Category and Billing mode become lines — Billing mode · Category · Amount; with several companies the amounts are proportions), *Period*, *Reference no*. A staff or director recharge on a company fills its amount (and the description) from HR, said under the field (*From the HR staff billing allocation, September 2026.*). *Multi-line invoice* — the same Bill to, Description, Category (every line's, or *Category per line*), Billing mode, then *Lines* (a description and an amount each, two to start, *+ Add line*, the total), the two dates; the hint *Total RM … · saved as a draft.* The same dialog is *Edit invoice* (*HV-INV-… · issued*, *Save changes*, a Reason for an issued one; once money came in its amounts, its party and its month are fixed). Kit: a form's select is the design's 32px with its words 12px in and its edge (the soft select drew none in a dialog portaled to <body> — Create payment and Create receipt too); a select in a line 32px, 8px in; the lines card (`.lines`, `.lineRow[data-shape]`, `.lineAmount`, `.lineText`, `.linesFoot`) moved into `form.module.css`; a line of four takes two rows on a phone.
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
- **A screen** (`AppScreen`): a tab's root heads with the 32px walnut H, *HOUZS Venture · Finance* (10px caps) and its name (15/500); a pushed screen with iOS's blue *‹ Payments* and a centred 16/600 title, or Android's ← and an 18/500 title; a hub draws no head — its top tabs (48px, 13px caps .06em, the current ink 600 over a 2.5px accent underline) stick at the top and fill to the status bar. The head takes a hairline after 4px of scroll. What moves is the page under the head: in from 28% on a push, from −18% on Back (where it was left), a fade between tabs — .32s / .22s on the one curve; a hub swipes to the next top tab past 60px. The action bar (48px buttons, the primary 1.5 wide, ⋯ 52px) stands over the tab bar, on the floor when there is none. Payment's primary is one word, *Payment* (v4.66): *Create payment* filled it edge to edge on a 384px phone; its sheet is still *Create payment*. Receive's bar follows (v4.72): *Receipt* · *Repayment*, their sheets still *Create receipt* and *Loan repayment received*.
- **A hub** (M02, M09): the month's total centred (Chivo 30/600) over its label, then a stacked card per list — min 124px, radius 14, padding 16/18/15, the name 16/600, the count mono 12, the figure mono 19/600 at its foot, a 240px arc and a 36px round icon chip — in README's fills (Pending approval black). The cards are the desktop hub's (`hub-cards.ts`).
- **A list** (M03): the eyebrow, the 28px Newsreader title and the 48px rule; the 44px search; the title and its count over the rounded card of rows — the name 15, a short description 12 muted, the amount mono 14.5 (a receipt's green, a voided one faint), the chevron — and the list's Create in the bar. Payroll batches fold their vouchers (or a department's, read by department) under each batch.
- **A record** (M04): the drawer's own parts (`VoucherDetailBody`) at the phone's sizes (`[data-fin-app]` in drawer.module.css) — and, since on a phone it is the voucher's page, the full page's too: whom it pays and into which account, the statutory lines, the audit log; the bar is the drawer's steps, the full page's Copy, Change date and Change GL account in its ⋯. *Print* opens the PDF.
- **The windows rise as sheets** (M05–M08, M18): every `FinDialog` drawn inside the app (`FinSurface`) is the design's bottom sheet — `translateY(105%) → 0` .32s on a .28 walnut scrim, radius 28 (Android) / 34 (iPhone), the 36×5 grab bar, a 20/600 title, iOS's round 32px ×, a form's sheet 92% tall (`tall`), 48px buttons across its foot (the primary 1.4 wide), 46px fields at radius 12, the calendar's 36px days in 42px rows across the sheet's width, a menu's 52px rows and iOS's Cancel under them, a confirm's Cancel and answer side by side (1 : 1.3). One window, every feature of it, on the computer and the phone.
- **The Overview** (M01): the office's date and quarter, the greeting (Newsreader 32), the line of what waits, eight quick actions (50px tiles, radius 15, the accent badge), a card per category (40px tiles) — the sidebar's rows (`finNavSections`). **Profile** (M17): who is signed in, Account (Change password, Request to change email — a personal login's; no Edit profile since v4.85 — Me › Profile's, which HR approves, is the one), Admin (Audit Log, Departments, Meeting Rooms with their real counts), Sign out (asked).
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

**The month** is ONE table design. `CommissionWorkbench` holds the rail: *Total Sales Orders · KPI Items · Open Bill · Below deposit · Sales exhibition · Drops & upsells · Double claims · Requests*.
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
- **Requests** (`?view=requests`, 2026-10-21 — the salespeople's share requests; `ShareRequestsPanel`, `share-requests.module.css`): *Share requests*, then the workbench's own framed table — *Bill* (mono, the customer under it) · *Salesperson* · *Shared with* (*ANTHONY 50%*) · *Bill total* · *Sent* (*21 Oct, 10:00*) · *Status* chip: alert *To approve*, info *Waiting for ANTHONY*, ledger *Approved*, danger *Rejected*, plain *Declined by ANTHONY* / *Withdrawn*. Empty: *No salesperson asked to share a bill of October 2026.* The badge counts *To approve*. A row opens the kit's 460px drawer — eyebrow *Share request*, the bill's number (a link to its page, back to this tab), *customer · venue · day*; the status chip; facts *Bill total · Salesperson · Split (LUCAS 50% · ANTHONY 50%) · Holders now · Note · Reason*; **COLLEAGUES** — each name, *50% · RM 2,150.00* and its answer chip; **AUDIT TRAIL** — `HistoryEvent`s (*Share request sent* · *Accepted* · *Approved by HR* …, who, when, note). Footer, while it is HR's: **Reject** (danger) · **Close** · **Approve** (primary); Reject turns the footer into **Back** · **Reject** (danger solid, disabled until *Why it is rejected* has words). Without Revenue · Edit, and before every colleague accepted, only **Close**.

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
  - ***Submitted by*** (v4.103) — in "+" and in the drawer's Edit — is everybody active in the department, whatever their title: the page's sub-department first, its other sub-departments, then the department's people placed in none under its name (*Revenue Department*: the Revenue Directors). A submitter no longer listed stays a choice, by name.
- **The applicant drawer** (400px) holds *Fail* (asks Keep · Fail), Close, and *Transfer*. Transfer is disabled while the place is full and links to Rules › Capacity.
  - ***Edit*** (v4.103) — an outline *Edit* with a pencil beside × in the head, for whoever may use "+". It turns the facts into "+"'s own fields where they stand: the name, *Mobile number*, *Joining date* (a day, or *Any time ready*), *Submitted by*; *Department* and *Added by* read as they are. A changed field is peach. The foot is *N changes* (*No changes yet*) · *Cancel* · **Save changes** (*Saving…* until the fresh rows are in); a refusal reads in words under the fields. Saved, the kit's toast *{name} — details saved*, and the history's own step *Details edited* · *Changed: name, phone number, …*.
  - **Its signed form** (v4.100, `SignedFormPanel`) — a *SIGNED FORM* section between the facts and the action history. On file: a framed row — the file's icon (as the uploaded form's: by the type the bucket kept, else its name), its name, *date · who uploaded it*, then *View* (`FormFileViewer`, kicker *{applicant} · Signed form*) and *Replace*. None: a dashed *Upload the signed form* over *PDF, Word, PNG or JPG · 3 MB or smaller*, which takes a dropped file too. Upload and Replace are Member services · Edit's, as "+"; anybody else has *View*, or *No signed form on file.* A refusal stays under it. The upload is a step of the history — *Signed form uploaded*, who, the file.
  - **A Word letter** (v4.101) — the drawer and "+" take a .docx or an old .doc beside a PDF, PNG or JPG. It wears Word's **W**; *View* reads a .docx in the sandboxed frame, as the uploaded form's; an old .doc reads *No preview for .doc files.* beside *Download*. A Word file holding macros is refused in words under the row.
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
- **The head:** *Invite user · Import InfoTech · + Add person*, compact tabs, five cards, then search, the *Department* filter and counted pills.
  - **The Department filter** (v4.103) — a soft dropdown between the search and the pills: *All departments*, then each department A→Z with how many it holds (*Finance · 6*), *— No department* last; peach once one is picked. It leaves that department's band; the pills count within it; the five cards stay the whole roster's.
- **The grid** — a band per department ("· N incomplete" in amber), then rows of: tile (an orange rim when they can sign in), name, title + L-level, rank chip, code, Employment, Last seen. Right-click opens the row menu.
  - **Employment is the status, then the hire date** (2026-10-23, the user: "permenant, part time and probation status follow by the hire date start"): the kit's soft chip — **Permanent** (ledger green), **Part time** (info blue), **Probation** (alert amber), **Contract** (2026-10-24 — run-on peach, its title *Contract ends 30 Sep 2027 · in 342 days*; ~~nobody is reminded of it~~ reminded as a probation is, the same day), **Not set** (plain; everybody filed before the status existed, until HR sets it) — then the hire date in Chivo Mono 10.5px, body-2 (*5 Oct 2026*, its title *Hire date*), then *N missing* as before. Inactive keeps its red *Resigned 30 Sep 2026* / *Inactive*. Once HR is being told (15 days before the end — 14 until 2026-10-24 — and past it while still on probation; **from 30 days before since 2026-10-24's second answer, a contract's too**) the chip says how near: *Probation · 9d left*, *Contract · 30d left*, *· ends today*, *· ended*; its title the end in words (*Probation ends 1 Nov 2026 · in 9 days — Acknowledged by LI SEAN*; *— 30-day reminder acknowledged by LI SEAN* while the second waits over the first's). A reader the directory serves (no status on its rows) reads *Active*.
  - **Every head sorts** (2026-10-22): a button in the head's own words with an arrow after it — ▲ / ▼ on the column that sorts, faint on hover over the others (the way a press would put it), `aria-sort` on its head. Pressed, it sorts each band (the bands stay) its first way — Name A→Z, Title and Rank the most senior first, Code from HV001, Employment probation first, then contract (2026-10-24), part time, permanent, not set, inactive, the latest hire first inside each (2026-10-23), Last seen the latest first; pressed again, the other way. Nothing pressed reads the ladder. A row with nothing to sort by stands last either way.
  - **The name is the full name** (v4.103): Last Name then First Name in capitals (TEOH CHEA HUAN), a father's name after the first as the IC writes it (SITI RAFIDAH BINTI FADLULLAH TEY); one alone is the name; neither, the IC's. The person window's title reads the same; their full page keeps *First Name* · *Last Name* apart. The search finds the IC's name too.
  - *Invite user* in it is faint — a click only toasts why — for somebody with a login, somebody inactive, a reader who may not invite, and (v4.104) a full-access title for a reader who does not manage permissions: *DIRECTOR is a full-access title (Ultimate full access): only whoever manages permissions gives it a login.* Such a person is not offered in the window's *Person* list either, and every other door (their window, their page, `?invite=`) toasts the same.
- **The person window** (760px; 900 on a login's Permissions) — Details and History tabs, "missing" in amber, then *Esc closes.* · Full page. Its first chip is the roster's status (2026-10-23) — a probation names its end: *Probation · ends 31 Dec 2026*; a contract too (2026-10-24): *Contract · ends 30 Sep 2027*.
- **Invite user** (466px; v4.62) — the kit's small tabs *Send invite link* | *Set password* (the link first), Email, and on *Set password* the password: dots until the eye inside its box is pressed, Regenerate beside it; then Role and *Send invite link* / *Create login*.
  - **When Supabase does not email the link** the window stays: why, in the amber note, then *Invite link · {email}* in a read-only box with *Copy link* (*Copied*), and *Done*.
  - **The notice after *Set password*** keeps the password as dots, with the eye and *Copy*.
  - **A link never used** reads *Invited* in Last seen (amber, the tile without its rim) and in the person window's login chip; *With a login* notes "N invited". Right-click *Invite again*, or the window's foot: the same window over the login's own email (fixed), a new link or a password now (*Set password*).
- **The full page is a 360** (v4.63, the user's option C; `PersonRecord`, `person-record.module.css`). Its head is a card, not a `.page-head`.
  - **The card** (left, 280–340px, white, framed, radius 12; sticky from 1200px while it reads): their tile (64px, an orange rim on peach while they can sign in), the eyebrow, the name (Newsreader 30), code · title, the window's chips (the status chip for the active — 2026-10-23 — Resigned / Inactive otherwise; Has login / Login disabled / No login), *Edit* and *Invite* full width, then Department · Reports to (a link to their page, their title under it) · Level · Employment Type · **Employment Status** (*Probation · 3 months · ends 31 Dec 2026*, *· in 9 days* while HR is being told; *Contract · 12 months · ends 30 Sep 2027*; *Permanent*; *Part time*; a dash while not set) · Hire Date (with how long, "9 months").
  - **The record** (right) in wells — panel grey, hairline, radius 12, two to a row where they fit, one to a row while editing: Identity · Contact · Emergency contact · Bank accounts · Salary · Statutory, each fact's label over its value, two to a row. Identity opens on **First Name · Last Name** (v4.87 — what the apps call them; the full name in the card stays the one on their IC; v4.89 — the first name their own, the last the surname: LOO WEN WEI → WEN WEI · LOO).
  - **The words** (the user's reference, 2026-10-16): a well's title 12px / 600 / .09em capitals beside its 15px icon (`idCard`, `phone`, `buoy`, `bank`, `payroll`, `shield` — kit icons); a label 11px / 500 / .08em capitals in brown over a 14.5px value in ink (13.5px mono for codes and numbers); an empty value a faint dash.
  - No Account and no Role (v4.63): the login's email is their Contact email and its role follows the title's template. **Reports to** is set here — a soft dropdown of "— None", then the uplines a department at a time, theirs first, and last a group *Can’t be their upline* greyed with why ("in their team", "lower level", "cannot lead").
  - The record keeps ONE element at the page's top level in both modes: the portal settles a newly inserted top-level block in from nothing (`route-fade`), so a form put there by *Edit* made the whole record blink.
  - **A login's email is their sign-in:** it reads with a *Login* chip and, edited (2026-10-22), is a field like the rest with the *Login* chip inside it at the right — HR changes it, and the login moves with it. A full-access title's stays a locked box with a padlock for whoever does not manage permissions, why on hover. Department and Level read as they are. An unticked NRIC or bank account is a quiet box with no field behind it (A hidden value).
  - **Below the card and the record** (v4.67) the page goes on in the same wells, full width (`team/_components/PersonWell`): *Promotion* (*Next up* over the title and its L → L, or where they stand on the ladder; *Promote*) beside *Employment* (*Status* over Active / Inactive; *Deactivate* asks first; *Reactivate*), then *Permissions* (the person's matrix, its table white in the well) and *Activity* (the access log, its count at the title's end).
  - **A probation in the Employment well** (2026-10-23): a second line under a hairline — *Probation* over *3 months · ends 31 Oct 2026 · in 8 days* (*· ended 3 days ago* past it), *Acknowledged by LI SEAN · 23 Oct 2026* under it once acknowledged — and its steps at the end: **Acknowledge** (primary, only while HR is being told and nobody has), *Confirm as permanent* and *Extend* (outline). Each asks in the line's own place before it goes: *Confirm TEST STAFF as permanent? Their probation ends here.* · Confirm · Cancel; *Extend it by 2 months — to end 1 Jan 2027?* with a soft dropdown *+ 1 month · + 2 months · + 3 months* · Extend · Cancel. A refusal reads in red under the line. Since 2026-10-24 **Acknowledge** shows from 30 days before the end and again from 15 though the first was acknowledged, *30-day reminder acknowledged by LI SEAN · 5 Oct 2026* under the line meanwhile.
  - **A contract in the Employment well** (2026-10-24): the same line — *Contract* over *12 months · ends 30 Sep 2027 · in 30 days*, its acknowledgement under it — with **Acknowledge** alone at the end while a reminder waits; renewing it or making them permanent is the card's *Employment Status*.
- **The full page edits where it stands** (v4.10). *Edit* opens no other page: each value becomes its field in the same place.
  - Title, Reports to, Employment Type and the statutory categories are soft dropdowns; the text fields match them (radius 10, white, hairline). The name is edited in the title's place and face, over a dashed line as long as the name, and keeps the title's size over the phone's 16px field rule.
  - Employment Type is one select of the department's choices: *Variable pay* / *Salaried* in the Director department, *Salaried* / *Commission-eligible* elsewhere. The salary and statutory rows follow it as they read.
  - **Employment Status** (2026-10-23) is a soft dropdown — *Probation · Contract · Permanent · Part time* (Contract 2026-10-24), with *— Not set* first only while it is — and on *Probation* a second one beside it, *Probation period* (*1 month* … *6 months*, and an extended period of theirs); on *Contract*, *Contract period* (*6 months* … *36 months*, every six, and a period of theirs off the list). Changed, the status and its period go together.
  - **Basic from commission** (v4.15): a commission department (Revenue) has no Employment Type select — the Salary section's *Pay basis* row is one tick instead. Off: *Fully commission based*, *None — 100% of pay is commission*. On: Basic (above 0), Statutory Allowance, Non-Statutory Allowance and the Statutory section; it reads *Basic from commission* on Employment Type, the pay basis and the person window. The payroll pays that basic out of the month's commission, and each new month's row starts from it.
  - A changed field turns peach. The kit's peach save bar sticks to the sheet's foot (above the phone's tab bar outside HR's frame): *Editing · N changes* · *Cancel* · *Save changes*, off until something changed. A refusal replaces the count in red until the next edit.
  - *Save changes* sends only the changed fields (a bank account whole), so it never puts back a value somebody changed after the page was opened. The bar reads *Saving…* until the fresh record is in, then the page reads it with the kit's toast — never the old values in between.
  - No example values in empty fields — on a record they read as data on file. The old `/team/people/[id]/edit` opens this page with its fields out (`?edit=1`).
- **An address is six parts** (v4.106, `components/address/AddressFields`): *Address line 1* and *Address line 2* typed, then ① *State* → ② *City* → ③ *Postcode*, soft dropdowns of the official list (v4.109: the government's — the place's own name, *11060 Paya Terubong*, *11500 Air Itam*, never the post office's), the step's figure on an orange disc beside its label, each waiting for the one before (*State first*, *City first*), then *Choose* (v4.112 — a third of Finance's invoice dialog has no room for *Choose the state*; the fields carry their own palette, so a dialog portaled to <body> keeps the steps' orange discs and the waiting fields' grey); a new state clears the city and the postcode; a city with one postcode picks it. *Country* last, Malaysia unless another — abroad the three are typed. A changed part is peach; the postcode reads in Chivo Mono once picked. Read, the address is its lines: *No 83, Jalan Jambu 3 / Machang Bubok / 14000 Bukit Mertajam / Pulau Pinang, Malaysia*.
  - On a person's page it is Contact's Address in the record's own fields, counted as one change and sent whole. A record never written in parts shows its old text above the fields in a dashed *On file* box (panel grey, 10.5px caps label).
  - *+ Add person* asks the same in its own form's labels, fields and 16px gaps. A refusal reads in words: *Pick the postcode.*, *11060 is not a postcode of Bukit Mertajam, Pulau Pinang — pick them from the list.*
- **+ Add person asks when they start and the status** (2026-10-23, the user: "will need to fill up one more, is status … then is select probation, needs to select with probation period"): after the code, *Hire date* (a date field) and *Employment status* (*Select...*, Probation, Contract, Permanent, Part time), both required; on *Probation* two more — *Probation period* (*1 month* … *6 months*, 3 to start) and *Probation ends*, the day worked out as the database keeps it (read-only, Chivo Mono; *Pick the hire date first* until there is one) over *HR is reminded 15 days before.* (14 until 2026-10-24; *HR is reminded 30 and 15 days before.* since the same day's second answer); on *Contract* (2026-10-24, the user: "need pick time period as well, 6 month, 12 month, 18, 24, until 36") *Contract period* (*6 months* … *36 months*, every six, 12 to start) and *Contract ends* the same way, ~~with no reminder under it~~ over the same reminder line. Sales Groups › Waiting list › Transfer asks the same in its Placement card, as choice pills (*Probation · Contract · Permanent · Part time*; then *1 month* … *6 months*, or *6 months* … *36 months*, with *ends 19 Apr 2027* after them).

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
  - **Sub-departments** (v4.69): under a Revenue tab whose View is ticked — Comm Cal, Sales Groups, Rules, *Profile · My leads & appointments*, *CRM · Team* (the CRM's two are one setting) — a pill per sub-department: 11px, a 12px tick square inside, fully rounded; peach inside the accent edge where they reach it, white where not; the red dot where it was changed for them alone. Saved with the boxes; *Reset to title* clears them. The template matrix draws none.
  - **Sensitive fields** (v4.71): above the matrix, *Sensitive fields* in 10.5px caps and three pills — Salary amounts, NRIC / IC, Bank accounts — drawn as the sub-department pills: ticked where they see it (the template's, their own over it), the red dot where it is theirs alone. The not-open notes read these fields, not the template's.

### Permission matrix (2026-10-08 — People Management › Permissions, the invite drawer, a person's card)

The matrix is **Permissions by view and tab** (Part III). Around it:
- **The tab:** `?tab=permissions` (`&template=<id>`).
- **The title tables** (`ledger-table tight`): Title · Department · People · Their own boxes · Template. The select moves the title at once.
- ***Show history*:** When · Who · What changed.
- **Invite user** (`InviteDialog`): email, an invite link or a password (v4.62), and the title's template as the role — nothing to choose. A per-person cell is set later, in their window.
  - **Who may invite** (v4.104): HR view › *Permissions* · **Create** — its box's tooltip says *Invite user* (Edit's, *Change what a title or a person may do*). A full-access title stays with Edit.
- **Hierarchy › Roles** (`PeopleRoles`): a band per title, with its template link, over the people holding it.
- **Masked fields** follow **A hidden value** (Part II).

### Member services (v3.23, 2026-10-10)

`member-admin/_components/`
- **Request reviews** — the list card beside the request card: facts, the step with its note and buttons, then AUDIT HISTORY.
  - *View ↗* on a signed form (v4.102) opens a PDF or a picture in a new tab. A Word form, which a browser saves rather than shows, downloads under the name it was sent with, and the page says *Downloads name*.
- **Brand weeks** — read only (v3.64). A column per Friday; each week is a chip in its brand's colours (solid for Sales Attending, dashed for auto-located, faint for "No fair"), with the venue under it. The foot says when the ERP last sent it.
- **Transport claim** (v4.105 — *Claim rates* until 2026-10-20) — Outstation / Airbnb, regions, venues. Save reads "Saved" until something differs.
  - **⋯** right of Save (34 × 32, hairline, white; its tooltip *Who can claim · 5 of 7 titles*) opens **Who can claim transport** (the kit `Window`, 620px): the count top right, then the Food claim's table — Title · Level · People (a seat on it today, any sub-department) · *Can claim* — and Cancel · Save in the foot (its own Save, the rates' untouched; a refusal in red beside them). Saved, the window closes and a toast says *Transport claim: N of M titles can claim*.
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
  - **Publish › Preview** — *As they see it* (the card, the signature pad and Acknowledge, all inert) and *Who has it (n)* (a chip a person, waiting ones first; a 96px thumbnail of the signature beside each *Acknowledged*).
  - **The portal's memo bell** — every view's top bar, a personal login only, never while viewing as; a 480px drawer of MEMO / LETTER rows; a memo opens in place with *Your signature* and **Acknowledge**, or *✓ You acknowledged this* and the signature given.
  - **In HR's view it is the Notifications bell** (2026-10-23 — the user, circling it: "at least show up in this notification side, in desktop view"): for whoever may edit people on a person's page — the shared hr@ too, which has no memos — the probations ending within 15 days (14 until 2026-10-24), or past and still open, above the memos. Its title *Notifications*, its line *1 probation to acknowledge · 1 memo waiting*; a group label in 10.5px spaced caps (*Probation ending*, then *Memos*); a row: an amber **PROB** tag, the name (bold while waiting) over *Ends 1 Nov 2026 · in 9 days · Revenue Department* — a link to their page — and at the end **Acknowledge** (the amber chip as a button) or the green *Acknowledged* chip with *Acknowledged by LI SEAN · 23 Oct* under the line. The count is the memos' plus the probations still waiting. Nothing ending and no memos: *No probation ends in the next 15 days.* **Since 2026-10-24** (the user: "need 30 days and 15 days before remind, 2 reminder, then for probation need same as well"): the contracts too, under *Contract ending* after the probations — a peach **CONT** tag (the design system's accent-soft pair) — each term from 30 days before its end and again from 15 though the first was acknowledged (*30-day reminder acknowledged by LI SEAN · 5 Oct* under the line meanwhile, the row back to **Acknowledge**); the line *1 probation to acknowledge · 1 contract to acknowledge · …*; empty, *No probation or contract ends in the next 30 days.*
  - The HR app lists it in *Waiting for you* and More › *Memos*; the Revenue app in the memo sheet.
  - **Signed (v4.111)** — a memo still waiting carries **the signature pad** (`components/memos/SignaturePad`) under its body, labelled *Your signature*: white paper with a 1.5px dashed edge in the face's hairline and a baseline a quarter up, *Sign here* on it until the first stroke, **Clear** (26px, top right) once inked; 3 : 1 at the column's width, the picture 600 × 200; dark ink on white in EVERY theme (`--signature-ink` / `--signature-paper`, globals.css) — the picture is kept as drawn and read by somebody else in their own theme. **Acknowledge** stays disabled until a stroke leaves enough ink (a tap is not a signature); the note under it reads *Sign above to acknowledge.*, then *Your signature, name and time are recorded for HR.* Each face sets the pad's edge, sub-text and size (`--sig-line` / `--sig-sub` / `--sig-font` / `--sig-radius`). Acknowledged, the signature is drawn under the acknowledged line on its paper (≤ 240px); HR reads it in *Who has it* and on a letter's Audit trail (*Signed when acknowledged*).

### Hiring › Requests (v3.32, 2026-10-11)

`/hiring/requests`, HR's sidebar **V. HIRING**. Measurements: `hiring/_components/hiring.module.css` (inputs content-box: a width is the text's). Tabs (`?tab=`) **Requests · Listing · Form settings** (the last for Hiring · Edit).

- **Requests** — an inbox, list | detail: filter pills Pending · Info requested · Declined; the request's tiles (Budget, Headcount, Expected start first), its answers and attachment; **Owner** · **Note to requester**; **Acknowledge** · **Request more info** · **Decline**; *History*.
- **Listing** — five stat cards that filter when pressed; the table (owner *Unassigned* in alert, candidates `N · N appt · N out`, cancelled rows dimmed). A press opens the request; a right-press offers **Acknowledge** · **Mark filled…** · **Cancel request** · **Reopen** · **Open details**. Also a row of its own in HR's sidebar, under Requests (v4.148): *Listing* opens `?tab=listing` and lights there and on a request's page, whose *‹ All requests* comes back to it; Requests lights on the inbox and Form settings. The old shell's Hiring section the same (*Hiring Listing*).
- **Form settings** — *What requesters fill in* (↑↓ · name · Short text / Number / Long text / Choice / Range · Required · ×; Position and Department are *Core*), **Hiring sources** (× only while unused), **File types** (Hiring files), **Talent Bank reasons** (v4.149: the File types card again — each reason with *N people* kept with it, ✎ rename, On / Off, *+ Add reason*; none built in, the five it began with renamed or turned off like any other; never the last one off — *Keep at least one reason on.*). Every change saves itself.
- **+ New request** — a 640px drawer of Form settings' fields; **Submit to HR**.
- **A request's page** (`/hiring/requests/<id>`) — main | a sticky 340px column.
  - Main: **Requirements**, the answers, **Candidates · N** with **+** (*New candidate*, *Pick from Talent Bank*) and **⋯** (Candidate fields). A candidate card wears its stage's colour; ⋯ Edit details · Change status ▸ · Download résumé · Move to Talent Bank… / **★ Open in Talent Bank**.
  - **Not selected goes to the Talent Bank** (v4.147, 2026-10-24, IT-0008) — *Candidates · N* counts and lists the ones still in the running. Change status ▸ **Not selected ▸** opens *Not selected · why?* in its place — HR's reasons that are on (Form settings › Talent Bank reasons, v4.149; `lib/hiring/reasons.ts`), the one their stage says first (Done appointment → *Failed interview*, Offered → *Declined offer*, else *Not shortlisted*); a pick toasts *X → Not selected · kept in Talent Bank*. The not selected fold under **▸ Not selected · N** at the card's foot (`.outFold`): quieter cards (`.cand[data-out]`, the panel wash, no pills or note) with why in danger red (`.candWhy`), their ⋯ as any card's — *Open in Talent Bank*, or Change status to bring them back.
  - **A menu must fit where it opens**: it hangs under its button, above it when the sheet has no room below, because an open menu's catcher stops the wheel (`menu-place.ts`).
  - The column: **Pipeline**; **Actions** by state (pending: Owner, Note, Acknowledge; acknowledged: helpers, one *Hired* pick per headcount, Hired through, Cost, **Mark filled**; closed: **Reopen**); **Cancel request** always; **Audit trail** (All · Status only).
- **Windows** — Add / Edit candidate (Status turned *Not selected* adds **Why not selected**, the stage's reason first), Candidate fields (saved on close), Pick from Talent Bank, Move to Talent Bank (**Reason *** — *Not right now* unless picked; Department * only on HOUZS Venture's requests). Each reason picker lists the reasons that are on, the first that is when its own default is off, then for Edit **+ Add a new reason…**, which brings **New reason *** beside it — named on Save (a name the list has on is that one; one turned off comes back on) (v4.149). The résumé / files drawer is 600px (Hiring files).
- **On a phone** — one column; the listing and Form settings scroll inside their cards.

### Hiring › Insights and the Talent Bank (v3.33, 2026-10-11)

The rest of **V. HIRING** (`hiring.module.css`).

- **Insights** (`/hiring/insights`) — submitted → acknowledged → filled; a request belongs to the period it was submitted or filled in. **This month** · **All time** · **Pick a month** (last 12). Six cards with the change on the month before; days to fill per request; **By source**; **By department**; **Every request** (scrolls sideways, **Company** before Department — v3.67: a guest's company, else HOUZS Venture), a row opening a 440px panel.
- **Talent Bank — a Drive (v3.74)** (`/hiring/talent`) — the Data center's own parts, imported (Documentation › **Data center as a Drive**); the place is the address (`?in=dept:hv:Revenue`).
  - The bank → **Companies** (HOUZS Venture and the guest link's subsidiaries; one taken off that list stays while it holds something, marked *· off the guest link*) and HR's **Folders**; a company → **Departments**; a department or folder → folders, **People**, **Files**.
  - **+ New**: *New folder*, *Add talent* (a 520px drawer that keeps them where it was opened), *Upload files*.
  - A person: ⋮ **Open** · **Move to…** · **Remove from Talent Bank** (armed); a 460px panel with **Kept in**. HR's folder: **Rename** · **Move to…** (with everything in it) · **Move to Bin**; a department holding people: **Move everyone to…**.
  - **Why they are kept** (v4.147, 2026-10-24) — a person's card reads *why · what they fit* (*Failed interview · Sales Executive* — the reason first, so a long position never runs it off the line), or *Interviewing · HR-… ·* while a request has them (one kept before the reason was asked: *Available ·*). The panel: **Reason** (strong, after *Good fit for*: a soft dropdown for Edit, saved as it changes — *Pick a reason…* while there is none; words without Edit) and **Came from** (*HR-198 · Senior Revenue Specialist*, or *Added in Talent Bank*). *Add talent* asks **Reason *** (*Not right now* unless picked; **+ Add a new reason…** for Edit). The search finds people by their reason too. The words are HR's list (v4.149): a reason renamed reads its new name everywhere; one turned off leaves the pickers, while the people kept with it keep it — their panel's dropdown still shows it — and the trails already written stay as written.
  - **Move to…** — one 440px window: where it is now, then every company, department and folder (a folder never into itself; the current place greyed *Here now*).
  - **The Bin (v3.77)** — deleted things wait **30 days** at `?in=bin`: **Restore** · **Delete forever** (armed), **Empty bin** (armed), each card with *N days left*; without Edit, read only. A binned card pressed toasts *… is in the Bin — restore it to open it.*
- **A talent's page** (`/hiring/talent/[id]`) — **Profile** (its first tile **Reason**, the panel's dropdown; *Came from* in place of *Saved from*), **HR notes** (saved as written), **Files**; **Invite to interview** (open requests, the fitting one first), **Remove from Talent Bank**, **History**.

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
- **HR app** — More › Change password, a sheet. **Revenue app** — Profile › Settings (Account until v4.74), a sheet; never on a member viewed, and the sheet forgets what was typed once it closes.
- **Words, everywhere** — *Password changed. You stay signed in here; your other devices are signed out within an hour and need the new password.* Refusals: `lib/account/password.ts`.
- **While sending** the button reads *Changing…* and the sheets wait for the answer. The portal's boxes carry **no `name`** — a submit before hydration would put the passwords in the address.

### Request to change email (v4.70, 2026-10-16 — the Revenue app's Profile, the HR app's More, the Finance app's Profile)

A login's email is the one they sign in with: it changes only by their own request, which HR approves on Attendance › Requests — approving it moves the sign-in too (the user 2026-10-16). On Change password's terms (a login a People record names, never while viewing as), right under it in each app. One set of actions (`lib/account/`) and one hook (`components/account/use-request-email`) under three surfaces.
- **Revenue app** — Profile › Settings (Account until v4.74), the button under *Change password*: **Request to change email** with the envelope (`ICON.mail`); a sheet on Change password's. **HR app** — More, a row under *Change password* (*HR approves the new one*); a sheet. **Finance app** — Profile › I. Account, a row under *Change password* (kit icon `mail`, the email as its second line); the desktop's dialog (`RequestEmailDialog`, *HR approves the new one*), its request as the chip, the email and the reference each on a line of its own, *Withdraw* beside *Done*.
- **The sheet** — **You sign in with** over their email; their latest request, if any, as a card: *Waiting for HR* (alert tone) with its reference, *New email · …* and **Withdraw**; *Declined* (danger) with HR's words in quotes; *Approved* (ledger) — *You sign in with … now.* (a decision shows for two weeks). Then, unless one waits, **New email** and **Send to HR** (*Sending…*); sent: *Sent to HR. Until they approve it, you sign in with ….*
- **Words** — *Enter the new email.* · *Enter an email address like name@houzs.my.* · *That is already the email you sign in with.* (before anything is sent) · *That email already belongs to another login.* · *You already asked to change your email — HR has not decided yet.* (the database's) — `lib/account/email-change.ts`.
- **HR's side** — the request is a profile change of one field (*Request to change email*, Email from → to) in Requests, as any other; Approve on HR's last step moves the login first, and refuses in words when it cannot (*That email already belongs to another login. Nothing was decided.*).

### Choosing a password from an invite link (v4.62, 2026-10-16 — `/welcome`)

The sign-in page's screen (`MemberLoginScreen`'s `panel`), its right column swapped: **Set your password.** · *Choose a password to activate your account.* · **New password** · **Confirm password** — each the sign-in's box with the lock and its own eye — and **Activate account** (*Activating…*). A link missing its token reads **This link is not complete.** · *Open the link from your invitation again, or ask HR to send you a new one.* with no form.
- **Words** — *Your password needs at least 6 characters.* · *The two passwords are not the same.* (both before anything is sent) · *This invite link has expired or was already used. Ask HR to send you a new one.* · *Your password was not saved. Try again.* · *Your account is not active. Please contact HR.*
- Activated, they land where a sign-in lands (`/`, which sends each to their app).

### The invite email (v4.75, 2026-10-16 — `supabase/templates/invite.html`)

What the link arrives in, from **HOUZS Venture <hello@houzsventure.com>** with the subject *Your HOUZS Venture account* (`scripts/push-auth-email.mjs` puts all three into Supabase). It wears the sign-in page's look, in inline styles and hex — a mail app reads no stylesheet and no `var()`, so the values are the tokens' own (paper `#F2EFEA`, surface `#FCFAF7`, hairline `#D3CBC0`, ink `#2B1F17`, graphite `#5A4E44`, the walnut button `#5A3E2B` under `#FCFAF7`).
- **Top to bottom** — on paper: the H icon (40px, `public/icons/icon-192.png`; a PNG, since mail apps show no SVG) beside **HOUZS VENTURE** (bold, spaced capitals). On a white card (radius 16, hairline): **Welcome to HOUZS Venture.** (Newsreader, falling back to Georgia as the sign-in's title does) · *Hi {name},* (*Hello,* without one) · *You have been invited to the HOUZS Venture portal. Choose your password to activate your account.* · **Set your password** (walnut, radius 12) · *The link works once and expires in 24 hours. If it has expired, ask HR to send you a new one.* · over a rule, *If the button does not open, copy this link into your browser:* and the link. Under the card: *HOUZS Venture Holding Sdn Bhd · hello@houzsventure.com*. The inbox's preview line: *Choose your password to activate your HOUZS Venture account.*
- **The round icon beside the sender in Gmail is not the email's** — it is hello@houzsventure.com's own Google profile photo (`public/icons/maskable-512.png`: full-bleed, so the circle keeps the H).

### My documents (v4.5, 2026-10-14 — Admin › My documents, the HR app's More, the Revenue app's Profile › Documentation)

One's own documents — **Company** (what HR shares with their department) and **Personal** (what HR shares with them of their own Data center folder, and their letters) — for a login of one's own only, never while viewing as (as Change password).

- **Portal** — `/admin/documents`, the kit: compact tabs *Company* · *Personal* (counts of new), then the Data center's own cards: files as file cards (*Added 14 Oct*, *New* in the alert tone; a letter *To acknowledge* once read), folders as folder cards (*2 files · 1 new*; a press goes in, the path back up). A press views (a link made at the press, a tab readied in the click); ⋮ View · Download. Beside Change password in Admin / Reports & Admin.
- **HR app** — More › *My documents* (above). **Revenue app** — Profile › Documentation's *Personal* (above).

### Me — one's own attendance, leave, payslips, record and line (v4.79, 2026-10-17 — the Finance app's Profile, the desktop's top bar; the HR app's avatar, v4.82)

The Claude Design handoff `design_handoff_staff_app` (*Staff App v2*, `.design/hr-mobile2/`), built word for word in the HR theme (`components/me`, `lib/me`; its own colours as `--me-*` on `[data-me]`). For a login of one's own, never while viewing as somebody. **The prototype is the truth for layout, wording, motion and buttons; every figure is the reader's own** (mig `20261017100000`; `.claude/rules/hr/attendance.md` › ME).

- **Where it opens.** *Finance app* — Profile opens on a slim Today bar (v4.86 — the user: "这个 bar 本身太大了，做小一点": one row inside the page's 16px margins, 12px under the profile card, a small *Clock in* / *Clock out* or ›, where the hub's card took 91px; v4.91 — at 42px "too narrow", "let the bar thicker a bit": 56px, radius 14, 12px above and below, the server's clock 21px mono, the day in 10px capitals over its 13px line); a tap elsewhere pushes Me in from the right (28px + fade, .26s — the HR app's sub screens), its back arrow saying *Profile*. *Computer* — the greeting bar's first button (a 24px avatar, an accent dot while a punch is due, *Not in yet · Clock in* / *Late · Clock in* / *IN 08:57 · Clock out*, both times once out, *Me* otherwise) opens a **430px panel from the right** (the drawer's motion: 40px + fade, 340ms, a scrim, Esc), *HOUZS · HR* / *FINANCE* / *PRINCIPAL* on its hub, × on every screen. A computer's punch is `web`: its camera adds *From a computer — HR sees a flag.*
- **The frame.** Top bar 44px (the back arrow, 20px at 1.9, + *Me* / *Leave* / the app's screen); the scroller `2px 20px 40px`, gap 22, no scrollbar; the footer white with a hairline on `--safe-bottom`, carrying Leave's *Apply · annual* (1.6fr) · *History · n* (1fr). The prototype's host tab bar is not drawn — Me opens from a button, not a tab.
- **Hub.** The 56px avatar (its camera badge picks a photo — *Profile photo updated*), the name in 28px display, *title · n reports · code*; the dark Today card (*TODAY · WORK DAY / LATE / CLOCKED IN / DONE*, the 26px clock ticking each second, the line, the primary button); seven Vivid tiles (Attendance, Leave, Payslip, Profile, Hierarchy, Submit request, Documents; *My team* for an upline); *Waiting for you · n*; *Request status* with *All ›*.
- **Attendance** — the month's four totals (Present · Punches · Late · OT paid — the hours payroll pays, v4.84 —, *n unclaimed* from 30 minutes past the end), the calendar washed whole-cell as Records is (present / late / incomplete / leave), today ringed 1.5px, the picked day 2px; the day card (IN · OUT — a Saturday's punches too — · Note, *OT 1.5 of 3 h paid* / *OT 2 h approved* until the day is over, *File a correction*); *Needs action* — a missing OUT or punch (*Fix*), time past the end (*Claim OT*), last month's too while it is open.
- **Leave** — a tab per type (an inset 2px accent underline), the Ledger cards swiped one at a time (scroll-snap; a tab scrolls to its card, a swipe brings its tab into view), *Waiting for a decision*, the footnote; **History** by the month sent. **Apply** — the range calendar (accent ends, the soft band, today ringed, days before the back-dating limit at 40%), half days on a single day, the working days against the balance, who decides, the certificate, the first thing in the way in red.
- **Payslip** — the open month, then each paid month (*Paid 30 Sep*, the net); the sheet's table (the Earnings band, the row's lines, **Gross**, Deductions, **Net pay** on accent-soft) and its note; *Download PDF* is the server's PDF (`/my-payslip/<month>`).
- **Profile** — the 72px avatar and the 44px pencil; Contact · Emergency contact · Salary account · Kept by HR (the NRIC and the account to their last four). **Edit profile** sends only what changed, as a profile request to HR (*Sent to HR · PF-… · your record changes once approved*); the account field starts empty with its last four as the hint; a waiting change is the warning banner and the pencil opens it. *Home address* (v4.106) is the portal's six parts in the app's own fields — two lines, then State, City and Postcode side by side from the list, then Country — and goes to HR whole; a record never written in parts shows its old text as *On file* above.
- **Hierarchy** — My line / Department as tiers on the grey band (connectors, 124px cards — you 150px on accent-soft — the level tones), a status dot, never a time; a person's sheet with *Call*.
- **Documents** — Personal (letters, one's own files) · Company; a row's sheet, **View** full screen (the real file, every page by pdf.js), **Download**.
- **Submit request** — Overtime (ask first, or claim from a day's punches; 30-minute steps — *After 18:00* on a work day, *Every hour counts* on any other; the day's rate — the day as the person's schedule has it, never the weekday, v4.90; how it is paid, word for word what payroll does, v4.84), Correct a punch (the month's quota card), Extra manpower (a fair, its days, the role, 1–6 a day); everything sent, filtered; a request's sheet with its audit trail and *Cancel request* while it waits. **My team** — the reports today, and the decision sheet (*Approve · send to HR*; a note to reject).
- **The punch.** *Before your first punch* (once; again from Edit profile); the full-screen camera — the front camera live and mirrored in the oval guide, *Server time* to the second, the fence line (inside · outside with a reason · refused), *Before 18:00 — this records an early out.*, the 76px shutter; *Stamping the time…* at least 900ms; the toast *IN 08:57 · HQ · on time*.
- **Motion** — sheets rise 105% → 0 over 320ms and fall the same way, scrims fade, the toast holds 2.4s, 100px up, tiles warm their border on hover; all of it off under `prefers-reduced-motion`.
- **Decided** (v4.83) — once one's own request is approved at its last step or rejected, the phone is told in Me's words (*Correction · IN approved* · *CR-2610-022 · Fri 16 Oct · 09:00 · by Li Sean*; a rejection ends with its note; a step approved on the way says nothing); a tap opens Me on that request's sheet in whichever face opens (`?open=me:<id>` — the HR app's avatar, the Finance app's Profile card, the desktop's panel). An approved correction is the day's punch: the day reads Present / Late, its note *IN corrected · CR-…*.
- **Sub lines.** Me keeps the handoff's sub lines (*Paid on the last working day*, *Overtime, punch corrections and extra manpower. Leave has its own page.*) — a phone module asked for word for word, as the phone apps (Part II › No descriptions on the page covers the portal's pages).

**The phone apps**

### The HR phone app (v3.38, 2026-10-11 — HR Mobile since v4.82, 2026-10-17)

`/hr-app` — HR's view of the one app on a phone (HR's portal pages are for the computer). Since v4.82 it is the Claude Design handoff `design_handoff_hr_mobile` (HR Mobile), value for value: `components/hr-app/` (`HrApp.tsx`, `screens.tsx`, `kit.tsx`; `hr-app.module.css` — content-box and line-height normal as the prototype runs, buttons and selects border-box as the browser's own sheet draws them), its view model `lib/hr-app/hr-view.ts` and `gen-pages.ts`, its colours on `[data-hr-app]` in `globals.css` (the section tones and `--hr2-*`) and the motions *hrFade* (a tab), *hrIn* (a sub screen), *hrUp* / *hrDim* (a sheet), *hrToast* (2.4s). A column at most 430px wide on a white page. The old five tabs (Home · Review · Hiring · Rooms · More) are gone; every function they had is kept in the new look.

- **Head** — Home: the walnut-deep *H* tile, *HOUZS HR*, who and their title, the date in mono; the other tabs their title (Newsreader 28). Not in the handoff (the user, 2026-10-17): the bell on Home's head, and on every tab the avatar that opens **Me** over the app (a personal login; a shared one gets an *Account* sheet — this phone's notifications, the view switch).
- **Home** — *Good morning, Grace.*, the accent rule, the live line (*4 requests waiting for HR · 2 not in yet · 3 late · October closes 3 Nov.*), Quick actions (badges: Approve, Leave at 2 days or less, Hiring's pending requests) and the six sections I.–VI.; a page their tabs close is not drawn. Memos still to acknowledge head it as *Waiting for you*, only while there are some. Under it, **Probation ending** (2026-10-23): the probations ending within 15 days (14 until 2026-10-24) or past that still wait for Acknowledge, soonest first — the name, *Ends 31 Oct 2026 · in 8 days · HR*, the PROB tile in the warning pair (`--ds-warning-bg` / `--ds-warning`), a chevron; a row opens the person. The live line counts them after the requests (*… waiting for HR · 1 probation ending · …*), only while some wait. Under it **Contract ending** (2026-10-24), the same rows on a peach **CONT** tile (`--ds-accent-soft` / `--ds-accent-soft-ink`); the line *· 2 contracts ending* after the probations; both lists from 30 days before an end, a row back at 15 days though its first reminder was acknowledged.
- **Today** — four count tiles (In · Late · Not in · Leave, their top 3px in the state's colour; a tap filters, again clears), the list Not in → Late → Leave → In; a row opens the person.
- **Approve** — pills Pending (HR's step) · At upline · Decided, and **Members** (Member services' requests). A request's page: the facts (a correction's *1 of 3*), a profile change's changes, the approval flow's nodes, the note, the decision bar (*Reject* — its words turn red once a note is typed, *Add a note to reject* without one — and *Approve*, or *Approve on behalf* while it waits at another's upline step — at the viewer's own it is *Approve*, v4.83); the toast *{who} · {kind} approved*. A claim's Approve asks *Request payment* or *Add to payroll* (v3.45).
- **People** — the search, people by department; a person: the chip *Today · In 08:44*, Call · Message · Records, Service · Upline · Today · OT, the AL / SL / HL / RL cards HR keeps. On probation (2026-10-23): *Probation* · *3 months · ends 31 Oct 2026 · in 8 days* among the facts, *Reminder* · *Acknowledged by HR Manager · 23 Oct 2026* once given for that end, and **Acknowledge** (accent) in the bar at the bottom while it waits — the toast *Acknowledged*. Confirm as permanent and Extend are the desktop's. On a contract (2026-10-24) the same: *Contract* · *12 months · ends 30 Sep 2027 · in 30 days*, *Reminder*, **Acknowledge**; *Reminder* · *30-day reminder acknowledged by …* while the second waits.
- **Sub screens** — Leave balances (All · 2 days or less), Month close (the four steps, the last *Register + payroll*; deciding and closing on the desktop), and the generic page — Hiring › Requests (+ New hiring request with Form settings' own fields; a request's page with Acknowledge / More info · Decline, then Cancel / Mark filled, candidates' stages — *Not selected* asks why on the next sheet and leaves the list for the Talent Bank, folded at the card's foot under **▸ Not selected · N · in Talent Bank** (v4.156: rows in the Not selected chip's colours, why in danger red in place of the note; a tap opens the status sheet, whose other stages bring them back) —, + Add a candidate), Insights, Talent Bank (why they are kept, notes, Remove), Records, Org chart, Levels, Documents (Company · Personal · Missing), Letters, Room schedule (the week as pills, Book a room, a meeting's sheet and Cancel meeting). HR Costing, Payroll, Payment and the Audit Log open the handoff's *This page works best on a bigger screen.*
- **Me › Profile** carries the old More's rows (v4.82): Memos, My documents, Phone notifications (+ *Make them pop up*), Change password, Request to change email, Switch view.
- **Notifications (v3.47, v3.52)** — the bell; its page lists what was new when it opened, then the rest; a notice opens its place. First open asks *Turn on notifications?* once (`components/pwa/PushAsk.tsx`). A probation ending (2026-10-23) is tagged **PROB** in the warning pair — *Probation ending · NAME* / *Ends 31 Oct 2026 · in 8 days · HR* — and opens the person, as its push does; a contract's (2026-10-24, *Contract ending · NAME*) **CONT** on peach.
- **Bottom bar** — Home · Today · Approve (its badge: what waits for HR) · People, on `--safe-bottom` (Part II › The phone's own navigation bar), tucking away while reading on (.32s); sheets rise over the scrim (radius 20, the grab handle, the round ×, the actions in equal columns).

### The Revenue app — built to the prototype (2026-10-05)

`/member` is `components/member/app/RevenueApp.tsx`, built to `.design/revenue-app/design_handoff_houzs_revenue_app/` (`prototype/RevenueApp.dc.html`). **The prototype is the truth for layout, colour, wording and measurements; the NUMBERS never come from it** (margin bands, the cost divisor, KPI, Championship points, claim rates are VP's). Palette and faces: Part I.

- **Its own floor.** Preflight is undone for the app (`app/base.module.css`); the portal's global `h1` / input rules stop at its edge.
- **Shell.** Five tabs on a phone; on a desktop (`@container rv`, 1024px+) a sidebar, the page column and a panel rail where sheets, View as and the quote calculator open.
- **Phone type one step smaller:** every size is `calc(Npx * var(--rv-type))` (.92 on a phone; inputs stay 16px), never under 10px because of it — a size .92 would take below is `max(10px, …)` — and a size drawn under 10px already (the food claim's *SEP*) is never scaled (v4.2). `app/type-scale.test.ts` fails on any other form.
- **Checked against the prototype** screen by screen (`/member/preview?app=proto`, `.design/revenue-app/tools/shoot-app.mjs`, done at ≤ 0.05%).
- **Never says how the cost is made up** (`components/member/cost-basis-wording.test.ts`).
- **Deliberate differences:** an unpaid figure says so (*KPI · Not counted*) instead of RM 0.00; a returned request has *Update and send again*; forms start empty.
- **The live month.** Today, Insight, the Arena and My income open on it; the closing month is one tap away (*Live*). While the engine works the hero reads *RM —* / *Working out October's commission…* — never the fixed salary alone.
- **Income is what payroll pays** (v4.99, a deliberate difference from the prototype's *Fixed salary + commission*). A Revenue fixed salary is paid OUT OF the commission. Today names the basic as it stands (v4.108): under the hero *Basic RM 7,000.00 + balance commission RM 1,789.95*, and the hero is their sum — the member's own EPF / SOCSO / EIS and PCB not yet off; *Commission only* with no fixed salary. My income lists the commission's parts — another sub-department's as *Fair commission · In the same payroll*, since the salary comes out of the whole month once — then each deduction payroll takes, red with a minus: *Employer EPF · SOCSO · EIS*, *Your EPF · SOCSO · EIS*, *PCB* (or *Withholding tax*), *SKBBK*. Its Total is what reaches the bank — Today's hero less the member's own EPF / SOCSO / EIS and PCB — and **Paid as** follows (the Breakdown's rows): *Net basic* · *Balance commission*. *Past months* show what reached the bank. A month whose commission does not yet cover the fixed salary reads *−RM …* (on Today, the balance commission), never a floored zero.
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
- **A transport claim** (v4.107, a deliberate difference from the prototype's wording): Requests' first row and the form it opens say *Submit transport claim* (*Submit claim* until 2026-10-20), offered to a title HR ticked (Member services › Transport claim's ⋯). *My requests*' *Claim* filter, a request's *Type* and *Review & submit claim* keep their words.
- **A food claim** (v3.81), for whom HR opened it: a month at a time — *Month* pills, the month's brand weeks as cards with their day count, the fair's days as tiles (*Claimed* / *Not yet* faded and untappable), then *Set by HR's rate a day. You can't edit the amount.*
- **Notifications** (v3.47, v3.52, v3.86): the bell and its page; the first open asks *Turn on notifications?*; a CRM notice is titled by the customer with their picture; *Make them pop up* with *Send a test*.
- **Profile's Settings** (v4.74, the user — Privacy, Account and Sign out circled: "combine to one, name (settings), then add on one function is notification on"): one section under *Settings* (the h2), 16px apart. **Notifications** first — the outline button's look (52px, radius 14), the bell 20 / 1.7, the words left and the 38×22 switch right; switching it on asks the phone inside the press; what the switch cannot answer is said under the words (*Add the app to your Home Screen first*, *Blocked in this phone’s settings*, a failure in `--rv-err`) — then *Make them pop up* on an Android phone once on, *Hide income amounts*, *Change password*, *Request to change email*, and *Sign out* last, 6px further. The Principal's own app has it too (Your workspace's *Phone notifications* row until v4.74); never while viewing a member, never on the demo.
- **Switch view** (v3.60): Profile on a phone lists Principal and Finance (*The portal*), HR (*The HR app*), Revenue team (*You are here*).
- **A Revenue Director** (v4.1): the switcher lists the sub-departments they direct (*Revenue Director · Rank SS*); Today's Sales / Margin / KPI are tagged *All of Fair*; a place on a board they are not on names who leads — *ANNA leads* on Today and the hub (head: *Who leads every board*), the leader's figure and *RM 300 ahead of ME* on a board's hero; no *This week*; the family chart has them at the top.
- **View as** (v4.123, the prototype's `va-style="a"`): a group per sub-department, *FAIR · 25*, by level — its Revenue Directors first (*Revenue Director · Leads Fair*, the dark avatar), then the top of each tree (the accent avatar), then everybody below (sand); the search reads name and title. Viewing a director reads exactly what their own app does (the line above).

### The Revenue app — the refresh (v4.2, 2026-10-14)

The Claude Design handoff *Revenue app refresh* (`CRM switch button proposals.zip` — `design_handoff_revenue_app_refresh/`, prototype `Revenue Today Phone.dc.html`), checked element by element against `/member/preview?app=proto`. Rules and history: `.claude/rules/revenue/revenue-app.md` › THE REFRESH.

- **Today's header: the CRM chat button** between the capsule's rule and the bell — `ICON.chat` 21px, stroke 1.8, rust, 40×44 (padding-left 8); Fair ▾ gives up 2px on its right, the bell 4px of its width. Its badge is the account's own chats' **unread messages** (the CRM Inbox's figure), `99+` above 99, none at 0, and it moves by itself the moment a customer writes (Realtime) — nothing else on the screen reads again. Only for CRM · View, only on Today (the user: the header stays Today's), not over Quote's step 2. It opens the CRM — on a phone the one way in since Profile's *My leads & appointments* went (v4.113; the desktop has the sidebar's CRM row) — and the CRM's way out leads back to Today, as it does when a tapped notice opened it. Every capsule button dims to .6 on a press (120ms) — but the chat button, whose press is the switch's (v4.80, *The switch to the CRM* below).
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
- **Both Profiles look like the Revenue app's Profile** (Mine's v4.64, the owner, with the two side by side: "我要mine profile 跟着 profile"; the Team side's — the Control panel's — v4.68, the owner: "can change"; `tools/crm-design/profile-like-app.cjs`, values read from `profile.module.css` by `crm/profile-like-app.test.ts`): the peach glow behind the card (`--rv-profile-glow`, 150px, edge to edge) and the card 56px down it — white, radius 22, the app's shadow, padded 18 18 14, its parts 14 apart (the prototypes drew the glow inside a bordered card); a 56px avatar (it was 64); the app's display face (Inter Tight) on the avatar, the name and *Your workspace*, which sits 24px under the card at 650; the facts' box radius 14, each fact padded 10 14, the values at 650; the dark banner (Mine's *View my team*, hidden today; the Team side's *View as a team member*) as the app's *View as* entry — padded 14, radius 18, the 40px icon tile, 650, the blush 16px chevron, no second line of words; the rows' icons 22 / 1.8, labels at 650, a `--rv-rule` line edge to edge between two rows and none under the last (Mine's were inset `#EBDDD2` lines, the Team side's a `#EBDDD2` line under every row), the app's 16px chevron and its count (10.9px on the accent, 1px 7px). The status-bar strip above it is the glow's top colour, as the app's Profile sets its own, and the page under it is white, as the app's — the Team side's included, whose other pages stay cream (`crm.module.css`, `data-prof-glow`). What each shows stays its own: Mine's three rows; the Team side's Title and Access, Notifications and, with CRM · Manage, Member work type, Showrooms, Cold lead templates and Ads Performance.
- **The desktop CRM's Move is the phone's** (v4.124, the owner: "桌面版的 move follow 和 手机版，本质上他们是同一套规则的"): the chat's ⋮ *Move* lists one person — the direct superior of whoever has the customer, under *YOUR DIRECT UPLINE* (or *ANTHONY'S DIRECT UPLINE*), their title under the name; the pane's head *Feng Binxia · a request to ANTHONY's direct upline* — and its pill reads *Request*, then *Requested*; the toast *Move request sent to LOO WEN WEI*; no Undo. No Move without a superior, but for the Principal's own customer, which keeps *You're the top level*. **CRM alerts open on INVITATIONS** — the requests waiting on oneself, the phone's words (*PETER wants to move a lead to you*, *ANNA invited you to a chat*), the customer and channel under, the kind's dot and time as an alert's, on the page tint, *Decline* (outline) and *Accept* (rust), 30px pills; counted in All, Unread and the badge, never under Read.
- **Assign hands a customer on at once; Move is only the request** (v4.125, the owner: "照「同一套规则」，跟 Mine 一样", "ta can assign as well"): the Team side's ⋮ *Assign to* shows only where it can work, as Mine's — CRM · Manage (anyone: *Principal*, *Revenue Director*, then the teams; the 30 s Undo bar) or a TL / STL / TA with people of the customer's team below them (one group under their team's name, their own people; the toast *X assigned to Y*, no Undo); a TA's Assign in Mine (the swipe and ⋮) the same. Every hand-on at once reads Assign — the round button *Assign to someone else*, its sheet *Assign X to*, *Confirm · assign to X*, then *Assigned to X*; the Undo bar *… assigned to …*; the chat's *… reassigned from … to … · by you*; the desktop's *Assigned*. Notifications: an **Assign** chip after *All* (muted dot; the person-plus icon on the cold tint) for a customer handed on, **Move** only for a request accepted or declined; CRM alerts' subtitle *Assign · Move · Share · Won · Lost · Overdue 9 h+*.
- **The food claim's summary:** *Month* and *Days* in their own figures, the day list wrapping right-aligned.
- **Deliberate differences from the refresh prototype:** the header is Today's alone (the prototype draws it over the Arena hub too); badges in Inter (the prototype's buttons fell back to Arial); Top 3's avatars keep their ring outside 46 / 54px as the first prototype drew them (the refresh one draws it inside, 2px shorter); inputs stay 16px.

### The Revenue app — the switch to the CRM (v4.80, 2026-10-17)

The user's Claude Design handoff *Revenue → CRM switch view motion*, design 2c *Peach · Context* (`.design/revenue-app/design_handoff_revenue_crm_switch/`, `motion-reference.html` the source of truth for timing), on a phone: from Today's chat button (and Profile's *My leads & appointments* until it went, v4.113) (`shell/ViewSwitchCurtain.tsx`, `shell/curtain.module.css`). Rules and history: `.claude/rules/revenue/revenue-app.md` › THE SWITCH TO THE CRM IS A CURTAIN, THE WAY BACK IS THE MIRROR CURTAIN; what the CRM must keep for it: `crm.md` › THE REVENUE APP'S CURTAIN NEEDS TWO THINGS FROM THE CRM.

- **The tap** (the chat button; the handoff's chip, its *Revenue ▾* chip not built — the header stays Today's): the button squeezes 1 → .96 → 1 in 250ms (linear) and a ripple — an 80px accent circle, .2 → 1.6 while it fades from .3, 450ms — spreads from the icon's middle, clipped to a 37px circle on it. No .6 dimming on this one button.
- **The curtain** (`--rv-peach-bg`, the inner edge `--rv-hero-edge`, over everything the app draws — z 90): it rises from below at 400–950ms, its top corners 40px → 0, while the screen under it steps back 1 → .96 from 50% 40%. *Now opening* (12px, uppercase, .12em, `--rv-sub`) and three 6px accent dots (6 apart, pulsing .3 ↔ 1 every 1005ms, 176ms after each other) fade in at 750–1000ms. The CRM goes in under it at 950ms, at full size. The word — 46/56, 800, −.04em, Inter Tight, accent, in a 260×56 box — rolls *Revenue* up and out and *CRM* up and in at 1150–1550ms. No foot line (the handoff's *24 open leads · 6 to follow up today* — the user: none).
- **The lift:** the words and dots fade out at 1700–1900ms (the word stays), the curtain lifts off the top at 1850–2350ms, its bottom corners 0 → 40px, and the CRM rises 36px → 0 at 1900–2450ms. It lifts only once the CRM has drawn (its kept copy, its first read or its reason it could not read — `CrmApp`'s `onReady`), holding covered with the dots pulsing until then — never onto an empty screen — and after 6s at the latest. A tap meanwhile changes nothing.
- **Every tween on the one curve** `cubic-bezier(.2,.8,.2,1)` but the press (linear) and the dots. Reduced motion, or a browser that cannot animate: the CRM at once, no curtain.
- **The way back is the mirror image** (v4.81, the user: "也做一个反方向的幕布"; the handoff draws only Revenue → CRM): every way out of the CRM on a phone — its house, a header's back — on the same timings, every direction turned over. The house squeezes and its ripple spreads inside it (the CRM draws the house, so the ripple is a circle laid over where it stands, `.press`, z 89, found by its *Back to Revenue app* label); the curtain comes down from the top, its bottom corners 40px → 0, while the CRM steps back from 50% 60%; *CRM* rolls down and out as *Revenue* comes down in; Today (or Profile, when its row opened the CRM) goes in under it at 950ms; the curtain leaves through the bottom at 1850–2350ms, its top corners 0 → 40px, as the app settles 36px down into place. No hold — the app is drawn already.
- **Not built:** on a computer the CRM opens and closes at once (no curtain).

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

### The Revenue app — IT support (v4.114, 2026-10-20)

Profile › Your workspace › **IT support**, right under *Memos & notifications* and above *Install the app* (v4.116, 2026-10-21 — the user: "move the it support to below memo & notifications"; first in the list in v4.115). The lifebuoy (`ICON.help`) and *Send a request and track its status*. In View as the row remains visible but disabled, saying *Exit View as to send your own request*; it opens no private requests and submits nothing. Never on the demo. `components/member/app/profile/ItPage.tsx`, `ItRequestForm.tsx`, `ItRequestSheet.tsx`, `ItUploads.tsx`, `it.module.css`; sizes are the phone's, against `--rv-type`.
- **The page** — *IT support*: **Send a request** (Requests' new-row card, the lifebuoy on its peach tile, *A bug, a new feature or a suggestion*), then *My requests* — the filters *All · New · In progress · Fixed · Closed* and a row a request: its title, *IT-0007 · Bug · 20 Oct*, the status chip in the app's tones (New pending, In progress warn, Fixed good, Closed none). *Nothing sent yet.*
- **Send to IT** (a 90% sheet): *What is it?* — **Fix a bug** · **New feature** · **Suggestion** (the pick's line under them); *Title* (120); *Details* (5,000); *Screenshots and files* — **Add screenshots or files** (the clip), or a screenshot pasted on a computer. Each goes up the moment it is added, a row a file: a 40px tile (the picture itself, else its type — PNG, PDF, ZIP), the name, its size or *Uploading…*, a refusal in red, × to take it off; ten at a time, 50 MB each (pictures, videos, PDF, Office, zip / rar / 7z, text). **Send to IT** waits for the last upload; sent: the tick, *Sent to IT*, *You will be told here when IT replies or its status changes.*, its number, *Done*. Closed unsent, what went up is taken out again. Viewing as: *Read-only while viewing as*.
- **A request** (an 88% sheet): its title, number and status; *Type · Sent · By · the status (who, when) · Device* (*iPhone · iOS 18.1 · Safari · app · 390×844*, read when it was sent); the details as written; *SCREENSHOTS AND FILES* — pictures three to a row as previews, other files as rows with *Open* (a short link made at the tap); *UPDATES* — IT's notes on cream (*IT · NAME*), the sender's on white, a status set as *Marked Fixed*. Under them the sender's **REPLY** (*IT is told.*), or IT requests · Edit's **WRITE ON IT** with the four status pills (*NAME is told.*) — words, files, **Send**; then **Done**. Closing an unsent reply removes its uploads; closed during a send, it waits for the answer and keeps the files that were saved.
- **IT requests** — IT requests · View, the Principal's and Ultimate full access's only (the user: "just principal or ulitmate full access" — a screenshot of Today or My income carries the sender's pay): *Mine | All · N new* on the page, *All* being *Everybody's requests*, each row naming who sent it; on a computer the sidebar's **IT requests** row under PRINCIPAL, its New ones counted.
- **Done** stays full width and 48px high in the request sheet, including long threads; it does not shrink into a thin strip when the sheet scrolls (2026-10-21, the user's screenshot).
- **The bell** (UPDATES, *Open IT support*): the sender's *IT-0007 · Fixed* (*In progress*, *Closed*, *Reopened*, *IT replied*) with *title — "note"*; the desk's *New IT request · Bug* and *IT-0007 · NAME replied*.

### IT support — every department and screenshot markup (v4.115, 2026-10-21)

- **HR and Finance submit in their own view.** Finance desktop: footer Account › IT support. Finance app: Profile › Account › IT support, including shared logins. HR desktop: Admin › IT support. HR app: Account, available from Me › Profile or the shared login's Account sheet. Each opens the same white-sheet support list, request form and thread, with that host's own heading and back navigation. No Revenue profile is required.
- **One Principal desk.** Principal desktop sidebar › IT support › **IT requests**, at `/it-requests`: all requests from Revenue, HR, Finance and the portal, with sender, source and status. The existing IT requests View/Edit permissions still decide who reads and handles them. Own support `/it-support` opens to any active account. View as opens neither private list nor a submission form.
- **The shared list** uses the ledger table, status chips and status filter; 20 rows per page. A request opens the kit's dialog on desktop and a bottom sheet on a phone. Route pages preload lists and the selected request's image links on the server; navigation never triggers an automatic Server Action. A tapped phone notice preserves the request in HR or Finance instead of opening Revenue.
- **Older notifications** open the exact request through `it_request_get` (migration `20261021030000`), even beyond the latest 100 own or 300 desk rows. The database checks an active account and either ownership or the existing IT requests View permission.
- **Annotate** beside a screenshot, including one just attached: a large image editor with **Circle · Arrow · Pen · Text**, a text box for Text, **Undo · Clear**, **Save marked copy** and **Cancel**. Mouse and touch use the same coordinates. Save creates a PNG attached to the current request/reply draft; the original stays. Nothing is sent until the form's Send, and cancelled draft copies are removed like other uploads. The editor uses the host's tokens; a read-only viewer cannot annotate.
- **Drop files on the note** (2026-10-24 — the user: "drag 那个 file 移过来，放空在这个 text blank space 的时候，它要能够直接 attach"): files dragged from the computer onto a request's composer (*Your note* / *Your reply*) or anywhere on *Send to IT* attach as *Add screenshots or files* does — the same limits, up at once. While they are over it the text box's border turns dashed accent under *Drop to attach* (12px, ink-2, on the accent's soft wash); a text drag is the browser's; sending, or with ten files, the pointer says no. A file dropped elsewhere in a request's window is not opened in place of the page.
- **Open beside the window** (2026-10-24 — the user: "我不要它跳到另外一个 screen … 直接在这个 floating window 的右边出现一个 preview"): a filed file's row opens the preview at the window's right (the kit's `aside`): the head — the name (15/600, one line), its tag · size, the 32px ×; the file on the soft field (surface-2, a hairline, radius 12) — a picture or video contained, a PDF or text file in a frame; anything else its 64px tag and *No preview for .xlsx files. Download it to open.*; the foot — **Open in new tab** · **Download**. The row shown wears the accent border on surface-2. Another row's Open replaces it; × or Esc closes it, Esc before the window. On a phone it covers the sheet, the buttons 44px across the foot.

### The Revenue app — Share order (v4.118, 2026-10-21)

A bill's sheet (Insight › bills) shares the member's own bill with colleagues (the user, circling its deposit chip: "加一个三点，可以 share order request"). `components/member/app/insight/share/` — `ShareOrderSheet`, `ShareRequestSheet`, `share.module.css`; Profile's sheet classes for facts, trail, buttons and fields; sizes against `--rv-type`.
- **The ⋯** — a 32px round button after the deposit chip, only on the member's OWN bill and only while their Requests · Create is open (View as: shown, its sheet sends nothing). Its menu (14px radius, white, one line an item): **Share order** — or, with a request open on the bill, **Share request**. That open request is also a row under the head: the share icon on its sand tile, *SHARE REQUEST*, its state in amber (*Waiting for ANTHONY*, *With HR*), a chevron.
- **A shared bill** shows *SHARED* · *LUCAS 50% · ANTHONY 50%* and, under it, *Your part 50% · RM 2,150 in your sales* — on a colleague's copy *LUCAS's bill · your part 50% · …*. No ⋯ there: it is not theirs to share.
- **Share order** (a 92% sheet): *Share order* (Inter Tight 20) and *HC-SO-2610-004 · RM 4,300.00*; then either the reason it cannot be shared now (an amber note: *Oct 2026 is in payroll…*, *HC-SO-… is shared already — HR changes who shares it on Comm Cal.*), the open request's row, or the form — **SPLIT · HALF EACH** (a framed list of two rows, both *50%* with their RM under the name: the owner *(you)*, then the colleague picked — *Your colleague* in the muted tone until one is), **WHO SOLD IT WITH YOU** (a search field above more than eight people; a radio row a person — a 22px round tick, the name, the title or why they cannot take a part; the one picked on the accent's 12% wash), *Note (optional)*, the primary **Send to ANTHONY** (*Pick who sold it with you*, disabled, while nobody is), **Cancel**. One colleague, half each (v4.119, the user: "only can share one pax, then percentage for them request is fix with 50% 50%") — no steppers.
- **A share request** (an 88% sheet): the bill number, *customer · venue · day*, the status tag (warn *Waiting for ANTHONY* / *With HR*, good *Shared*, bad *Rejected by HR* / *Declined by ANTHONY*, none *Withdrawn*); facts *Bill total · Salesperson · Split · Note · HR's reason*; **SHARED WITH** — each colleague, *50% · RM 2,150.00* and their answer; **AUDIT HISTORY** (*Share request sent · Accepted · Approved by HR …*). The colleague still to answer: *Note (optional)* and **Decline** · **Accept** side by side; the salesperson while it is open: **Withdraw request** (red outline; *Tap again to withdraw*); **Done**.
- **Where it waits** — Today's *Needs your action*: *Accept HC-SO-2610-004?* · *LUCAS shared it with you*. The bell: NEEDS YOU *LUCAS shared HC-SO-2610-004 with you* · *Your part 50% · MITEC* (*Accept or decline*, amber *Waiting for your answer*); every other step under UPDATES (*Open share request*), kind label *Share order*.

### Submit waiting list (v3.27, 2026-10-10)

The Revenue app's `profile/RequestForm`.
- The questions come in the form's order, with "(optional)" when not required; a refused send marks *Required* in red.
- **Application form:** Download and Upload. Upload turns green once a file is chosen and is red while it is required and missing. Then the signature pad with Clear.
- The done screen adds *Signed form attached · name*.
- **A Word letter** (v4.102) — *Upload signed form* takes the filled-in Word file (a .docx, or an old .doc) beside a photo, scan or PDF, 3 MB. Both notes end *… then upload a photo or scan — or the filled-in Word file.* A Word file holding macros is refused in words. A claim's invoice stays a JPG, PNG or PDF.
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

**A sofa's model name (2026-10-19):** a sofa's window ends its calculator panel with **MODEL NAME** — the panel's label over a 38px box (`.fieldInput`), the portal's own name in it and the ERP's as its placeholder (*Add a name* when the ERP has none). A sofa's panel lays its fields in a row that wraps rather than squeezes the switch (`.calc[data-named]`, flex): a branded sofa's three sit in one row, a brandless sofa's name takes a second line, and a phone gives each field its own. A name is kept in CAPITALS, as the ERP writes every name — the box shows capitals as it is typed (`.capsInput`; its placeholder as written), so *aaaa* is saved *AAAA*. **A named sofa leads with its name, its code under it** (the same day, the user: "以名字先，然后下面再 code … 只要你一下名字，就这样子倒反"): where a model's name and code stand one above the other — the card (the name in the code's bold place, the code on its second line), the window's title (`ROMA · 5066`, the code in the title's lighter weight) and SKU Master's MODEL cell (the name, the code under it in `.sub`) — a sofa with a name, its own or the ERP's (NOVA, ALTAY), puts the name first (`leadNameOf`); a sofa without one shows its code alone, as before. The lists keep the code first, as they are sorted by it — SKU Master's Model list `5066 · ROMA`, Combo Pricing, Add combo. **The Revenue app's Quote says the name alone** (2026-10-20, the user: "quote show aaaa enought, not need the code"): a named sofa is *AAAA* on its product list, in *All models* (A–Z by what it shows; a search for its code still finds it), the cart, the customer quote and its option charges; a sofa with no name still reads its code. A mattress, a bed frame or an accessory has no such box, and keeps its code first wherever its ERP name is drawn: its model is its name.

**Combo Pricing is the portal's own:** a row per set, a column band per fabric tier; *+ Add combo* builds a set and prices it per fabric × seat height, a two-sided module adding a card for the pair (`1A(R)`, *LHF / RHF*). *Edit prices* pins a **Remove** column right: Remove marks a set (faded, prices read-only), Keep unmarks, Save deletes the marked sets.

### Revenue member C release (2026-09-16)

Superseded by *The Revenue app — built to the prototype*. Its data rules hold: View as is read-only; Insight, the Arena and recent income share `member_order_facts`; KPI is `member_kpi_summary`'s combined quantity (`.claude/rules/revenue/revenue-app.md`). Its layout survives as `/member/preview?design=live`, behind `member_requests_manage`.

### Revenue Arena design comparison (2026-09-13, revised proposal)

On hold: proposals A (Espresso & Clay) and C (Orange & Brown) on fictional data at `/member/preview?design=compare`, behind `member_requests_manage`. The live Arena is the Revenue app's. One rule stands: Championship is an additive points total — never a percentage or weighted average — beside Sales, Margin and KPI. Full text: `git show d241acde:docs/DESIGN.md`.

### Marketing's view — its shell and first pages (2026-10-23)

Marketing's own desktop view: the Claude Design handoff **HOUZS Marketing Module Setup** (`.design/marketing/design_handoff_houzs_marketing/` — README = spec, `design/Marketing Shell.dc.html`, `My Space.dc.html` → `My Space Bento.dc.html`, `Calendar.dc.html`, `Tracking Dashboard.dc.html`, `New Project.dc.html`, `Workflow Builder.dc.html` (quick and not), `New Task Page.dc.html`, `Minutes Builder.dc.html`, `Product Builder.dc.html`, `Canvas Template Editor.dc.html`), value for value. Its rules and decisions: `.claude/rules/marketing/marketing-view.md`.

- **Theme.** Its own, light whatever the theme: `.mkt-shell` in `globals.css` — channels `--mk-*` (ink 51 36 27, app ground 243 243 241, sidebar 248 245 240, brown 90 62 43 for what is picked, the primary `#EC9B55` / `#E0893F` with ink lettering), the handoff's four statuses (Overdue · Waiting · Done · Draft, each a ground, an edge, words and a dot), the groups' tints (a group is a People title, its tone read from its words — content · social · design · ads · brand · the manager · none; `lib/marketing/groups.ts`) and a meeting's blue. Everything is sized in em from the base the Appearance panel picks. Chivo Mono for Track IDs and dates (`--mk-mono`).
- **The shell** (`components/mkt/shell`): the sidebar 248px (folds to 64; the H tile or « toggles it) — HOUZS Marketing and the number of subsidiaries, the avatar (the account menu: Change password, Change email, My documents, IT support, Sign out), rows on 28px emoji tiles in four tones (sand, mist, peach, cream), the picked row on `236 229 219` with a 3px brown mark, red count pills (a dot on the tile while folded), Subsidiaries opening its list (a 7px dot and the emoji, those with something for the viewer first), MANAGER TOOLS under a rule, at the foot My claims, Meeting Rooms and Settings. The top bar: 60px, white, radius 16, 10px in — the crumb, the search (440 × 36, ⌘K), then Me and the memo bell for a personal login, the Principal's view switch, the 🔔 with its red count. The page on a white card, radius 16, 10px in. Panels: Notifications 380px from the top right; Appearance 320px at the foot (S / M / L / XL, Inter / Nunito / IBM Plex, Compact / Comfortable, Reset).
- **My Space** (`/marketing`; its own side `My Space Bento.dc.html`, ⑦-1 to ⑦-5):
  - **The cover** is 190px: one of four gradients, or a picture. *🖼️ Change cover* (top right) opens the four, the one shown ringed in the accent, and *⬆ Upload a cover image*.
  - **The 96px avatar** sits on the cover: a picture, or the first letter on the team's colour. A click picks another. Its owner's pet (44px) stands beside it, on the cover's lower edge.
  - **Under the cover**: the name (1.6em/600) with the role, then the status — a box with a dashed underline, *Set a status*, 80 characters at most — and, muted, *· Mochi Lv 1 · 💻 Working*. **✥ Edit layout** is on the right, walnut while on.
  - **The greeting**: *Good morning, Mei ☀️ — you have 2 things on your plate*.
  - **The board** is as its owner laid it out. Each tile sits where it was put: across as a share of the width, down in px, 12px apart. The tiles:
    - 🏠 The room (2×2, top left on a first board)
    - 🐾 The pet (1×1, top right): the pet at 50px in a 52px column, its name (1.1em/600, cut short with …) and *Lv n* on an accent pill; two 6px bars on 236 231 224, radius 3 — XP in the accent (its tooltip *60/150 XP to Lv 3*, or *Max level*), energy green, amber under 50, red under 20 (`--mk-done-dot` / `--mk-wait-dot` / `--mk-red-dot`); its mood (*🍽️ Hungry*); *🍙 n* and *🏃* as two 28px white buttons, radius 7, a 229 222 211 edge that warms on hover. Off the roster: *🐾 No pet*, muted.
    - My turn (its cards two abreast when the tile is half the board or wider)
    - Waiting on others
    - Delegated by me
    - 💬 The chat (1×2; on a first board the prototype's right column, three rows high): two tabs in a grey pill — *💬 My chats* · *🏛️ Lobby*, the open one white with a shadow, a 7px red dot on the other when it has something unread. The chats: a 30px avatar (the uploaded one, or the initial on the team's colour) with a 9px red dot while unread, the name (.86em, 700 while unread), the time (.7em muted), the last line (.78em, muted — ink while unread). A chat open: ← (24px), a 22px avatar, the name (600) and title (muted); the lobby says *Everyone sees this* (.76em muted). Messages: *Mei · 09:12* (10px muted) over a bubble (.84em, radius 10, 92% at most) — others' on 246 244 240, one's own on the right in the accent; a task attached as a white card (📎 its Track ID in mono 9.5px, its title .84em/600). *Earlier messages* at the top when there are; *No messages yet* when none. The foot: a 30px *📎* (pressed: 236 229 219) and the box *Message Mei* / *Message the lobby*; the tasks to attach in a 140px list above it, the one picked as a chip with ✕. Off the roster: the lobby tab alone, no foot.
    - 🏛️ The lobby (2×1; across the foot of a first board, 4 wide): the wall 239 230 216, the lower 42% boards 40px wide (`--mk-lobby-*`); *🏛️ Lobby · n* as the room's label; the pets at 30px, spread over the floor, every other one a step back, wandering 2.6s from spot to spot, each over a 9.5px white name pill (*Mei (you)*), its tooltip *Kopi · Lv 3 · Working*; a teammate's opens their space. The lobby's last message floats over its sender's pet (a white bubble, 10.5px, 140px at most). None: *No pets yet*, muted, in the middle.
    - 🏆 Trophies (1×1, under the pet): *🏆 Trophies* (.96em/600), the trophies at 26px — one a project, its name on hover — and two to win at 25% in grey, then muted at the foot *n projects finished this quarter*
    - This week
    - 📝 Notes, on 255 249 222
    - 🖼️ Photo: the picture, or a dashed *🖼️ Add a photo* — a visitor sees it too (⑦-4)

    A card shows the title (which opens the task), a dot and *Carres · Stage 1/5 · Script · Due 21 Oct*, the status pill, and Accept / Open / Review. Accept accepts on the tile, then the task opens. Accept and Review are in the accent. Red cards come first.
  - **While laying out**, every tile is veiled white at 35% and dashed. Each shows ✥ (top left), ✕ — or 🔒 on My turn and Waiting — its name (bottom left) and eight handles in the accent. The tile moving is outlined in the accent and lifted, and the board grows 140px deeper to drag into.
  - **The drawer** (290px, sticky):
    - *Add a tile*, two columns
    - *Page background*: Linen, Mint, Lilac, Sand, White — 34px swatches, the chosen one ringed in the accent
    - *Accent*: orange, walnut, blue, green, pink — 26px circles; lettering on the accent is dark on orange and white on the rest
    - *Tile corners*: Square 6 · Soft 14 · Round 24
    - *Reset layout and theme*
    - **Done**, in the accent
  - **Under 520px wide** the tiles go one under another.
  - **A visit** (`/marketing?visit=<staff>`, ⑦-4): an ink band over the cover — *👀 You're visiting Mei's space* (246 238 230, .9em) and *← Back to mine* on a cream pill (radius 7). Then their cover, avatar and pet, their name and role, their status in quotes and the pet line, all in their own look; no greeting, no Edit layout, no Change cover. For somebody who chats, on the right: *💬 Message Mei* (34px, the accent) and *👋 Wave* (white, a line edge). The board is the visit's: their room (2×2, *🏠 Mei's room*), the pet (no Feed / Exercise), the trophies, the Notes (read only, *No notes yet*) and the Photo (1×1 each; the Notes 2 wide without one), the lobby (4 wide) under them.
  - **The room** fills its tile, edge to edge:
    - The wall in its colour (Peach, Sage, Sky, Blush, Cream, Night — `--mk-room-*`).
    - A window at 7% / 12%, 30% high and 20% wide (34% in a narrow tile), framed 6px white (Night: dusk violet). Its sky is day, the evening from 18:00, or night on the Night wall, with 🌤️ or 🌙.
    - The floor: the lower 30%, boards 56px wide (Oak, Walnut, Tile, Grass, Carpet — `--mk-floor-*`), under a 6px skirting.
    - The furniture: emoji with a 3px drop shadow, on the floor or hung at 56% up, smaller in a short (0.55) or narrow (0.75) tile. While decorating a piece takes a grab cursor, and the picked one a dashed ring in the accent.
    - The pet walks the floor, 2.6s from spot to spot — 30px at Lv 1 to 52px at Lv 6.
    - *🏠 My room* (top left) and *🎨 Decorate* (top right) are white pills at 90%.
  - **The pet** is an emoji of its kind and form (or one's own animal), its colour a filter, a soft shadow under it, a bubble over it for its mood (❗ 💻 💦 💤 ✨). Each mood has its motion: a slow 3px bob (*Chilling*), a hop (*New task!*), a rocking (*Working*), a shiver (*Overloaded*), slow breathing (*Sleeping*), a spin for *Level up!*.
  - **The drawer's tabs** — *Layout* · *🎨 Room & pet* — sit in a grey pill at its top, the open one white:
    - *Wall* and *Floor* as 34px swatches.
    - *Add furniture*: four columns of 20px emoji with a 10px name.
    - The picked piece in a bar, with *⇋ Flip* and *Remove* (red).
    - *Your pet*: the name box, the kinds as chips, a dashed *⬆ Upload your animal*, the three forms (the one now outlined in the accent, the later ones faded), the seven colours as 24px circles (the chosen one ringed in ink), *Redo pet setup*.
  - **The setup** opens over a blurred 45% ink scrim, on a white 620px panel (radius 20, 28 × 32 in):
    - The steps as 24px numbered circles joined by lines: the step now outlined in ink, those done filled in ink with ✓. Under 520px only the step now keeps its name.
    - The title, 1.5em/600, with no line under it.
    - Pet: the four kinds as cards (a 48px emoji, the name, its forms *🐱 → 🐈 → 🦁*) and a dashed *Upload a picture*.
    - Name: a box and six ideas as chips.
    - Colour: 48px swatches, *Pick a colour to continue.* in red when skipped.
    - Cover: a 110px preview and the four presets.
    - Photo: the avatar with *⬆ Upload a photo*.
    - The foot: *← Back*, *Skip*, and **Continue →** / **Finish →** in the primary.
  - **Uploading**: while one picture goes up, every button that picks one is disabled; the one going up says *Uploading…*.
  - The lobby, chat, the trophies and the pet's levels come with ⑦-3 onwards.
- **Calendar** (`/marketing/calendar`): the month's name 1.85em with ‹ › and Today, *Only mine*, ▦ Month · ▥ Week · ☰ List; the layers (📣 Posts · ⏱ Stage due dates · 🗓️ Shoots & meetings, with the month's counts), the subsidiary chips, the legend; the month grid (Monday first, cells 124px, today on a brown disc, three items then *+N more*), the week's seven columns, the list by day; a 320px panel for the item or the day picked, *Open task*. A stage's due date is a white card with a dashed edge in its status.
- **Projects** (`/marketing/projects`, not drawn by the handoff): the Calendar's head and chips, a search, Open · Done · All, and the List's table — Project (title, Track ID · kind), Subsidiary, Stage, Now with, Due, Status.
- **Tracking Dashboard** (`/marketing/tracking`, the manager's): 📊 and the title, 👥 By people · 🔀 By workflow; This week · This month · Custom, subsidiary, workflow and person; five cards — Ongoing, Needs you, Overdue, At risk, On track — that filter by state; a card per person (load against capacity in slots, *Now on* with its stage segments and days on the stage, *Also on*, on-time % and days per stage, *Only …*); by workflow, the people's load strip and a lane per workflow with a column per stage, the slowest flagged 🐢. *Nudge* on a person's card tells them about their task that waits on them most (once an hour).
- **+ New Project** (the top bar's primary, `#EC9B55`, ink lettering, for Marketing · Create) → **New Project** (`/marketing/new`, 1120px): *← Projects / New project*; the steps strip (white, radius 12 — *Subsidiary & task* · *Work on it*, the product's four for 📦); *Start a project* 1.5em/600; SUBSIDIARY — cards 200px+ (a 9px dot, the name, *PIC · …*, a radio ring that fills 5px ink); WHAT ARE YOU STARTING? — 📦 Product project (*Not built yet* until the builders), ⚡ Quick task, 🔁 Recurring task; the task box (white, radius 12: *Task title*, *Type* as 32px pills — ink when picked, *What needs to be done* with *Write it here* · *Use meeting minutes* (the latter until the Minutes Builder) and a 3-row field); for 🔁 the **Repeat** box (Every Day · Week · Month, Every week · 2 weeks · 4 weeks, the weekdays as 44 × 32 keys, the 1st · 15th · Last day, Starts, Ends On a date · After N runs · No end date, and a linen summary — the rule and period, the run count, the first six runs as mono chips, *+N more · last …*); the **Stages** builder; the hint (red while something is missing) and *Create task & open →* / *Create recurring task →*.
- **The quick Workflow Builder** (Stages; *Workflow stages* · *Canvas template*, the latter until the builders): the stages as cards (⋮⋮ to drag, the number disc, the name, the group's chip (its People title), *📝 n form fields*, then Who · SLA (mono) · Due · Approval — *⚠ Pick a person* red), joined by 14px lines, *+ Add stage* dashed; the picked one's settings in a 340px column — *What's this stage called?*, *Who does it?* (a roster picker: initial on its group's tint, *GRAPHIC DESIGNER · 2 active*), *Who approves it?* (levels, *🔒 always locked*, *+ Add another approval level*, up to three), *How long?* (− n + working days), *If changes are requested, go back to which stage?* (pills), *What does this stage fill in?* (fields with their glyph — Aa # ◉ ☰ ▦ ◎ ⎘ ☑ ▤ ✎ — a note in italic on cream, a table's columns in a line with *Edit table*, + a field by name and kind); a sticky foot — Total, PIC approves, Finishes, the ⚠️ warnings or *No warnings*.
- **The task page** (`/marketing/projects/<id or Track ID>`): the white head — crumbs and the version (mono, boxed), the Track ID and the status pill, the title 1.9em/600, the actions on the right (*Accept*, *Submit for approval* / *Complete stage* — faded until the fields are filled, then *Ready*; *Request changes* in red outline and *Approve*), five facts (Subsidiary, Owner, Now with, Type, Deadline) and the stage rail (32px discs — ✓ on green, the person's initial ringed brown for the stage now, dashed numbers ahead — the person, the approvals and the due day under each). A banner in the status's colours (*You're up: …*, *… submitted … v2 for your approval*, *Changes requested by …: "…"*, *All 3 stages done*). Below, 1040px with a 260px sticky **Audit trail** (mono times): 📋 Requirements (🔒 Locked, on `245 244 241`), 🔁 Repeat (a series' rule and its runs, Pause / Resume / End series), 🎯 a section per stage so far (latest first: the fields — inputs to 420px, a File as a link until uploads, ☑ boxes, ▤ a table's columns — or *What you did* and *Files* as links), the **Free space** (a rule with the words between, then text, headings, to-dos and dividers, each with its ✕, *+ Text · + Heading · + Checklist · + Divider*). *Request changes* opens a 440px dialog (*What should change? (required)*, *Send back*). Toasts in ink at the foot.
- **Edit table** (a table field's dialog, both builders): 880px, radius 14, on the scrim — ▤ and the table's name (an input that shows its edge on hover), *Table · 3 × 2 · <stage>* in the muted line, ×; the columns across, 160px each on linen (the name in 600, its kind under it — Text, Number, Checkbox, Date, Person; a name with *date*, *due* or *deadline* turns Text into Date; + for another, up to 8; × on each but the last); on a workflow template the **preset rows** down (inputs, placeholder *Blank — team fills in*, × each, *+ Add row* in brown, up to 50); *Done* in ink at the foot. A quick task's tables have no rows yet.
- **The Workflow Builder** (`/marketing/workflows`, MANAGER TOOLS › 🧩, the manager's): the head — 🧩 and *Workflow Builder* 1.3em/600, *Workflow stages* · *Canvas template* (the latter until its editor), and on the right **🔒 Lock whole workflow** (a 28×16 switch in a 34px box, ink when on). Three columns: **Actions** (230px on `252 251 249`; the label and + for a new action — an input *New action, e.g. Design photo* and *Add*; each action with its emoji, name and count, its templates indented — the name, *v2 · 5 stages* or *draft · 1 stage* mono, *Clone* — the one open on `236 229 219` in 600, *+ Add template*); the **template** (*Reels video / Full production* — the name an input — *Draft v3* boxed mono, *Saved* · *Saving…* small and muted, or *Not saved · …* in red with *Reload*; the lock's note on `246 244 240`; the stages as the quick builder's cards with Who (*Pick at assignment*, *🔓 Previous stage picks from Siti / Aina*) · SLA · Approval (*👤 Rachel → 🔗 PIC*) · Subtasks ✓ / ✗); the **stage's settings** (360px): its name, *Which team?* (chips), *Who does it?* (*Pick at assignment* · *🔓 Previous stage picks*, the latter faded on the first stage and when locked), *Who can they pick from?* with the count (*Pick at least one* in red) and a checklist of the team with their load, *Who approves it?* (levels: a manager, 🔗 *PIC via link*, 👤 *Pick at assignment*, *🔒 always locked*, up to three), *How long?*, *What does PIC see on the link?* (placeholder *Department words only — no names, no prices*), *Can this stage be split into subtasks?* (a 36×20 switch), *If changes are requested, go back to which stage?*, *What does this stage fill in?*. The sticky foot: Total, PIC approves, *Product promise [n] days* (a 52px mono input), the ⚠️ chips or *No warnings*, *n active tasks stay on vN*, **Publish v(n+1)** (the primary; faded with its reason in the tooltip when nothing changed or something would be refused). Toasts in ink: *Published … v3 · new tasks use v3, 12 active tasks stay on v2*, *Cloned “…” · rename it, then publish*.
- **The Minutes Builder** (`/marketing/minutes`, MANAGER TOOLS › 📝, the manager's): the head — 📝 and *Minutes Builder* 1.3em/600, **+ New minutes template** (the primary) on the right. Two columns: **Minutes templates** (220px on `252 251 249`; the name, *v2 · draft · 9 fields* mono; the one open on `241 236 228` in 600) and the template — its name (an input 1.3em/600 that shows its edge on hover), the version boxed mono (*Draft v3* / *v2 · live*), *Saved* · *Saving…* or *Not saved · …* with *Reload*, and **Edit · Preview** (a segmented pair). **Edit**: *Form fields* — a card with a table (FIELD · TYPE · REQUIRED · PIC SEES · ✕ on linen heads; ⋮⋮ to drag, the name an input, the kind as a chip, a 32×18 brown switch, *👁 Yes* / *— No*; the project and the attendees' switch and ✕ faded) — a table's columns under its row as 96px chips (glyph, name, kind; the open one on `250 246 240` with a brown underline), + for another, and **Column settings** below (*What's this column called?*, *What kind of answer?* — Aa Text · # Number · ▦ Date · ◎ Person, the picked one in ink — *Remove column* in red); at the card's foot, on linen, *New field name*, the kinds as pills (picked: `250 246 240`, the waiting edge) and *Add field* in ink. Beside it (300px) *Completion rules*: a switch and the rule's name per row, its meaning in the tooltip; *Both PICs sign off* sits beneath *PIC signs off* — 46px in, a dashed rule above — only while that is on. **Preview**: *Preview as* · *Staff filling in* · *PIC on the link* (pills) and what is visible, *Not saved* and *Reset*; the minutes as a card (820px max, radius 14: *Meeting minutes · …*, *Subsidiary · Project*, the Track ID and version mono, the status as a pill — *Draft · can't complete yet* on the waiting ground, *Ready to complete* / *Completed* / *Approved* on the done ground, *Needs your approval* / *Shared with you* on `250 246 240`), each field (its name 600, a red *, *· filled from project*, *👁 PIC sees*; inputs on white, read-only on linen; a table on a hairline grid with + Add row; the attendees as pills; signatures as 150px cards — the first name in the display face's italic, *Signed* in green, *Click to sign* in amber), the checks (✓ green / ○ amber) and the buttons (*Complete* the primary; *Request changes* · *Approve minutes*). The foot: *6 fields · 5 required · 6 visible to PIC*, the ⚠️ warnings, **Publish v(n+1)** or *Published ✓*.
- **The Product Builder** (`/marketing/products`, MANAGER TOOLS › 📦, the manager's): the head — 📦 and *Product Builder* 1.3em/600, the status tabs *All · Active · Draft · Retired* with their counts (a segmented strip on `--mk-surface-3`, the picked one white with its shadow), **+ New product** (the primary) on the right; the products as cards (300px+, radius 14 — the code mono, the status as a pill with its dot: Draft grey, Active green, Retired grey; the name 1.08em/600; what it includes, */ month* when recurring; the type as a chip, *v3* mono, 🔒 the price; a retired card on linen with *Retired … · n projects still running on vN*). **A product**: *← Products / name*; the name 1.6em/600, its status pill, *Live v3* / *Not published yet* boxed mono, *Saved* · *Saving…* or *Not saved · …* with *Reload*; a retired product's banner on linen (*Retired on …* — it can't be picked for new projects, n running keep vN — **Reactivate**) and the form faded. Two columns: the five sections (200px, sticky — a 22px disc with the number, filled ink with ✓ once the section is complete) and the sections as white cards (radius 14, the head 600 under a hairline): **1 · Basics** (Name; *Code · auto-generated* — the code mono in a linen box with 🔒; *Type* — *Recurring monthly* · *One-time project* as cards with a radio ring that fills 4.5px ink, their meaning in the tooltip; Description); **2 · What's included** (the summary on the right; each category a bordered box — its name an input on linen with its total mono and ×; a grid ACTION · QTY / MO · UNIT PRICE · TOTAL · WORKFLOW — the action an input, − n + in a 30px stepper, *RM* and the price mono, the total mono, the workflow a select red-edged on `--mk-miss-bg` until linked, ↗ to open it; *+ Add action* in brown; the grid scrolls sideways below 760px); *New action category …* and *+ Add category*; *Sum of all actions* on linen); **3 · Intake template** (a select of the minutes templates, *v2 · 9 fields*); **4 · Pricing** with *🔒 Manager only* (List price — *RM … / month*, *Use sum of actions (…)* underlined in brown; Internal cost · optional; Margin 1.5em mono, red below 20%, *RM … per month*); **5 · Publish** (Version *v4 replaces v3*, Effective from, *n active · stay on v3*; the Version history on linen — v mono, the day, what it included; the foot: *Retire product* red-edged, the note — *New projects from 01/11/2026 use v4. …* or the first thing publishing would refuse in red — *Save draft* and **Publish v(n+1)**). Toasts in ink: *Published … v1 · effective 01/11/2026*, *… retired · n running projects keep v2*, *“Reels · Standard” made — set it up and publish it in the Workflow Builder*.
- **The Canvas Template Editor** (the Workflow Builder's **Canvas template** tab, open once a template is; the manager's): two columns — the canvas (22px 28px padding) and the **Preview** (380px on linen, sticky, a hairline at its left). The head: *Reels video · Full production* 1.35em/600, *Canvas template · draft v3* boxed mono, *Saved* on the right. The sections as white cards (radius 12, a 1.5px hairline — brown while its panel is open, 18px apart): the icon in a 30px box (a 6 × 2 grid of the twelve icons to pick), the title 1.15em/600 (an input on the manager's own), the badges as small chips (🔒 Locked · ⭐ Required · 🎯 *stage* · 👁 PIC — their meaning in the tooltip), **⚙ Section settings** on the right. **📋 Requirements** first, *From the intake minutes* on linen; **a section per stage** — its fields as rows (the glyph mono, the name 500, the kind muted, on the right *🎯 stage ⭐ 👁 📅*; a note in italic brown on cream; a table's grid under its row — the columns on linen heads, a preset cell on linen with 🔒, a blank one a dashed input to try, *+ Add row* · *Clear test entries* · *🔒 Preset* · *▢ Blank*); *No fields* when it has none; **the manager's own sections** with *+ Add field* in brown; *+ Add section* dashed (42px); the 🔒 **Free space** — hatched, a rule each side of its label. The panels (330px, radius 12, the pop shadow, under the field's row or at the card's top right): *SECTION · …* / *FIELD SETTINGS* and ×; switches (30 × 18, ink when on) — 🔒 Locked, ⭐ Required before submit, 👁 Visible to PIC; *What's this field called?*; *What kind of answer?* — Aa Text · ◉ Select · ☰ Multi-select · ▦ Date · ◎ Person · ⎘ File · ☑ Checkbox as 26px chips (ink when picked); a choice's **Options** on linen (chips with ×, *New option* and *Add* in ink); *🎯 Which stage fills this in?* — the stages as chips (*Any stage* on a section of the manager's; a stage's own fixed); a date's **📅 Show on calendar** — *Name on the calendar*, *Colour* (the five teams' swatches, 22px, a ring on the one picked), *Preview* (the glyph and name on the team's tint), *Visible on PIC calendar*; *Edit in Workflow stages* in brown, *Remove section* / *Remove field* in red. **Preview**: *Staff view* · *PIC link view* (a segmented pair) — the staff view a white card (*As Joey sees it at the [stage] stage*, each section with its badges, a table's columns as chips, a placeholder bar, the sections not theirs at .55, *FREE SPACE* dashed); the PIC view the link's card (*Tracking link* mono head, the project and *Design team is working on it*, each 👁 section's caps title with its fields and bars, a table's head row, *ON YOUR CALENDAR* with each date's swatch, **Approve** in ink · *Request changes*), *Hidden: …* under it.
- **A product project** (`/marketing/projects/MKT-…`, the manager's to write; 1120px): *← Projects / <subsidiary> / <Track ID>*; the steps strip as New Project's — the steps done in ink with ✓, the current ringed in ink with its label 600 (three steps when the PIC does not sign off; below 900px only the current one's label); the Track ID (mono), the title 1.6em/600, the subsidiary's dot · the product and its version · the owner, *Saving… / Saved* (or *Not saved · … Reload*) on the right; the PIC's changes in a red banner (their words, *via link · <when>*), *Edited after approval — needs PIC re-approval.* in yellow. Two columns (the side 300px, sticky): **Meeting** (PIC name ⭐ 👁, PIC WhatsApp ⭐ 🔒 in mono; *+ Second PIC* — an underlined text button — adds *Second PIC* 👁 and *Second PIC WhatsApp* 🔒, ⭐ once named when the PIC signs off), **Intake · <product>** with the template's name and version boxed — each field as its kind asks (a date, people as ink chips with *+ Add…*, typed tables with their glyphs and *+ Add row*, the Free space's own columns, the project link fixed), ⭐ / 👁 / 🔒 beside each name, the signatures (*Signed* on green, *Sign* for the viewer, *Waiting*) — and **Meeting notes** 🔒 (borderless, 1.65 line height). The side card: the minutes' name and status pill, *Required n/m* over a 6px bar (brown, green when complete), **Generate tracking link** / **Complete minutes** (the primary; its hover lists what is still missing in an ink tip), *n left* in red; once sent the link (mono on linen), *Copy link* · *Share via WhatsApp*, *Sent <when>*, *Resend to <PIC>* — with two PICs a link box each, under its PIC's name (10.5px upper case, muted), a hairline between, *Resend to <PIC> and <PIC>*; when the minutes wait for both PICs, *<name> approved · waiting for <PIC>* under *Sent* once one's approval is in; **Plan assignments →** (the primary, the manager's — once the PIC approved, or once started before approval) makes the deliverables; *Start before approval…* under a hairline → the override box on linen; then the Audit trail. The override's dialog as the task page's (*Start before PIC approval*, Reason (required), Cancel · Start anyway). Once the work started: **Deliverables** — a card above Meeting, *n/m done* (mono) and *n to plan* (waiting's colour) in its head; by category (its name small, upper case, muted), a row each — its *Dnn* (mono, muted), its name 600, its workflow (muted), where it stands as a pill (*Not planned* · *Starts <day>* · *Stage n of m · <stage> · <who>*, red once its stage is overdue · *Done*), **Plan** / **Edit plan** (a ghost, the manager's); the side card's *Deliverables done n/m* over the same bar.
- **A deliverable's Assignment Plan** (`/marketing/projects/<Track ID>-Dnn?plan=1`, the manager's; `Assignment Plan.dc.html`, 1140px): *← Projects / <product project> / <deliverable> / Assignment plan*; the Track ID (mono), the name 1.6em/600, a pill (*Not planned* · *Planned · starts <day>* · *In progress · Stage n of m*) and *Workflow template · <workflow> (n stages)*; *🔒 Locked workflow* (an ink switch, read only) with its note on linen; mid-way, *Changing a plan mid-way: …* on linen. Two columns (the side 280px, sticky). Each stage a card beside its numbered rail (28px discs — ✓ green when done, red when unassigned, ink when it is the stage now; 1.5px rail lines): its name 600, its group's tag in its tone, a state pill, *Unassigned* in red; then ASSIGNEE (a 36px field — the person's initial on their group's tint, their name, the words beside them, 🔒; *🔓 Picked by previous stage · from …*; *Choose someone…* in red — its menu *Assign to · <group> first*, each person with *· n active* and their title, *🔓 Previous stage picks from …* when the template lets it, else why not), APPROVER (28px chips 👤/🔗 · name · 🔒 · ×, *→* between, *+ Level* dashed; *👤 Pick who approves* red until picked; its menu: the managers and *PIC (<name>) via link*, *Approvers are always 🔒 and can't be passed on.*; with two PICs the PIC chip reads *PIC · <name> and <name>* — *Both PICs · …* once both must approve — and an 18px pill beside it switches it, *Either* white / *Both* ink; a chip never leaves its column — a long name gives way with an ellipsis, whole on hover), SLA · est. dates (− nd + in mono, *working days*, the dates in mono), SUBTASKS (*✓ Yes* / *✗ No*). A change of hands once open asks first: *Reassign <stage>* (440px), *from → to · must Accept again*, Reason (required), Cancel · Reassign. The side: SUMMARY — working days and PIC approvals 1.7em/600; *Starts* (a date input until it opens), *Est. finish* (600), *Internal approvals* in mono; *Skips weekends and Selangor's public holidays: …*; ON THIS PLAN (26px chips); then **Save plan** / **Save changes** / *Plan saved ✓* (the primary) and what stops it in red, else *Notifies n people*.
- **The PIC's link** (`/t/<code>`, public — `app/(guest)/t`): the handoff's own cooler palette, `.mkt-pic` in `globals.css` (`--pk-*`: page 246 245 242, ink 38 33 29, muted 110 104 98, lines 230 227 222 / 240 238 234, the primary `#EC9B55`, the four statuses), light whatever the theme; 520px wide (16px sides) on a phone, 1040 in two columns (1.6 : 1) from 900px. The white top bar (the H tile, *HOUZS Marketing*, *Project tracking*); the subsidiary · product line, the title in Inter 600 at 22px (26 from 900px — never the portal's display serif), the Track ID and the status chip; the banner; **Needs your approval** (**Requirements** once answered) — *Meeting minutes · <template>* and the fields the PIC sees as label-over-value rows, tables boxed; **Approve** (the primary, 48px) · **Request changes** (white), stacked on a phone, side by side from 900px; the steps on linen — *You're approving the minutes* (Full name, Back · Confirm approval) or *What should change?* (the reason, *Required / Ready to send* and n/500, Back · *Send to the team* in ink); the answered card (✓ on green or ↺, the quote, the receipt in mono); **Progress** (✓ green, the current brown with its ring, the rest hollow — once the work is under way its last step *The work · n of m done · k waiting for you*; minutes that asked no sign-off never went to the PIC: *Kick-off meeting* · *Minutes completed by the team* · the work); the footer line. Any other code: *This link is closed*. Once the work is under way, **The work** heads the left column (*Needs your approval* while one waits; *n/m done* in mono): a deliverable a row — its name 600, its state as a chip (*Waiting for your approval* · *In progress · <stage>* · *Starts <day>* · *The team is making your changes* · *Done*), *n of m steps done*; the one waiting opened white — *<stage> · version n*, the team's words for them on linen, its fields as the minutes' rows (a web address as an underlined link, a date in words, *Yes* for a box ticked), its links, then **Approve** · **Request changes** as the minutes' (*You're approving <stage>* — *This confirms version n as it is*; the reason up to 1,000); after an answer its line — *You approved <stage> vN · signed by … · <when>* or *You asked for changes on <stage>: "…"*. An approval waiting for both PICs: the one whose approval is in reads *Waiting for <PIC>* (the chip, the banner, the Progress) and *You approved · waiting for <PIC>* where the buttons were (13px/500 on the done green, inside the card); the other *<name> approved the minutes. They go ahead once you approve too.* — on a stage *<name> approved this version — waiting for you*, 13px/500 on the done green above its fields. Both approved: *You and <name> approved the meeting minutes*, the receipt *Signed by <name> and <name>*. An edit that took back only the other PIC's approval: *Updated — please review* · *The team changed … after <name> approved.*
- **+ Add subsidiary** (Marketing's own clients, the manager's): on New Project a 22px **+** beside SUBSIDIARY (white, a 1px `--mk-dash` edge, radius 6; ink on hover) opens the inline form under the cards — on `--mk-surface`, radius 10: *Company or client name* (flex 2) and *PIC name (optional)* (flex 1) as 34px inputs, Cancel (muted) and **Add & select** (the primary, faded until a name); a refusal in red under them. In the sidebar, **+ Add subsidiary** (muted, the plus where a dot is) ends the open Subsidiaries list and opens New Project with the form. A client draws with the grey dot and 🏢.
- **A subsidiary's page** (`/marketing/subsidiaries/<code>`, 1180px on the card, 32/36px in): the head — a 52px tile (radius 14) in the dot's colour at 14% with its emoji, the name in Inter 600 at 1.9em (never the display serif), its dot, a grey *Client* chip for Marketing's own, the manager's **Edit** (a 26px ghost) — and *PIC* with the name on a 20px avatar · *approves via 🔗 link*; with a second PIC, *PICs*, both on their avatars · *either approves via 🔗 link*. **Edit** opens a 440px dialog (*Edit <name>*): *Name* (Marketing's own clients only), then *PIC* · *PIC WhatsApp* · *Second PIC* · *Second PIC WhatsApp* two by two (one column on a phone), the labels small upper case above, WhatsApp in mono; what it would refuse in red under them; *Cancel* · *Save* (only what changed is sent). Five white cards (radius 12, `--mk-line-2`; *Overdue* on red when any) — two a row on a phone. Then the dates (main) beside **⚡ Recent activity** (272px; one column under 900px): the toolbar — the month or week in 600, ‹ › (28px), the **⚑ Key dates** switch (a 28×16 track, ink when on), **Filter** (n on an ink pill; a 520px popover of Type · Department · Status chips, ink when picked) and the Month / Week / Timeline segment; the Month grid as the Calendar's (96px cells, today on a brown disc), items on their team's colour, red when late, done at 62%; a key date an ink flag in cream; the Week as seven 380px columns (one column on a phone); the Timeline — a 190px Project column, months and Monday days in mono, 24px bars (radius 6) with the span written on them and a brown Today line. A legend under them. **Projects** last: one table (radius 12) — the kind's emoji, title and team chip; the status pill; a 6px bar with n/m in mono; owner; due (red when late, the row on red) — on a phone the title above its status and due.
- **A project's formal log** (`Audit Trail.dc.html`): **Formal log** — a 22px white button (radius 6, 11px, normal case) at the end of the trail's AUDIT TRAIL head — opens the project's white sheet (1120px, radius 14, on the scrim; its title in 600 at 17px and the Track ID in mono, × at the right) on its *Audit trail* tab. The toolbar: **Filter** (32px, the lines icon, n on an ink pill; a 560px popover of three columns — *By person*, *By action*, *By stage* — 15px ticks, ink when on, each value's count in mono), the chips (*Person:* muted, the value 500, ×), *Clear all* underlined, *n of m records* in mono at the right. The table (radius 10): #, TIME, ACTOR, ACTION, FROM → TO, REASON, VERSION — a 10.5px uppercase head on `--mk-surface`, 12.5px rows; # and time and version in mono, the action 500 after a 6px dot (green approved, red sent back, amber handed on, grey the rest), an empty cell a faint —. 🔒 *Read-only* under it. On a phone each record folds: its number, then time, who, what and the rest down one column.
- **A task's map** (`Task Map.dc.html`): **Map** beside **Formal log** opens the project's sheet with underline tabs — *Map*, *Audit trail* (its ▶ Replay · Formal log segment). The map: 🗺️ *Task Map*, *Now at …* muted, the Map view · List view segment; a 480px ground (`--mk-surface` with 1px `--mk-line` dots every 20px, radius 14) dragged or scrolled sideways, ⌘/Ctrl + scroll to zoom. Lanes 150 high — 🛡️ Approvals on `--mk-surface-2`, each group — a People title — on its tone's `--mk-team-*-bg` at 40% — their tags pinned at the left (132px, emoji and 600 name). Stations every 200: a card 172×80 (radius 12: the avatar and person, the name in 600 at 14px, a status dot and the day in mono, a *returned ×n* tag in red), a gate 140×74 (the shield shape `14px 14px 50% 50% / 14px 14px 38% 38%`: 👤 or 🔗, the person, ✓; *approves …* under) — borders by status, planned dashed and faded; where the work stands pulses amber with *📍 Now here* in ink above; a picked station is ringed in brown. Lines 1.6px in `--mk-text-3` with arrowheads, dashed when picked, red when sent back (its round curve under the gate), faint and dashed while planned; their labels white pills. Hover a line: a 260px card (the time in mono, who → whom in 600, what, the reason on red). The legend bottom-left, − % + · Fit bottom-right. A station's panel slides in at 360px: its lane chip, name, status pill; facts on a 96px label column; ATTACHMENTS, VERSIONS (the version in a mono box), AUDIT · THIS STATION. The list: #, STATION, LANE, PERSON, HANDOFF, STATUS, DATE — where the work stands on amber. **Replay** under the map: ▶ Play / ❚❚ Pause / Replay (the primary, 38px, round), the caption on `--mk-surface` (time · the trail's words · n / m), the scrubber in brown with a dot per record.
- **The Library** (`/marketing/library`, `Library.dc.html`; the sidebar's 📚 under Projects): two columns on the card. The rail (220px, `--mk-line-2` on its right): SUBSIDIARIES — *All companies*, each subsidiary on a 22px tile (radius 6, its dot colour at 18%) with its emoji — CATEGORY (a 10px swatch per category on its `--mk-cat-*` token), a rule, 🗑️ *Dustbin*; each counted in mono at the right, the one lit on `--mk-wait-soft` in 600. The page (20/26px in): 📚 and *Library* in Inter 600 at 1.5em (never the display serif), the search (34px × 260, *Search every folder*), **+ New ▾** (the primary; a 210px menu — 📁 New folder, ⬆️ Upload file, 🔗 Add a link); the crumbs, the last in ink 600, the count in mono at the right. Everything: cards (min 230px, radius 12, lifting 2px on hover) — a 70px banner in the subsidiary's colour, its 44px tile (radius 11, a 3px white ring) over the edge, the name 18px/600, *n folders · m files* in mono — then RECENTLY ADDED · ALL COMPANIES. A subsidiary: its banner (radius 14, ≥110px) with a 72px white tile, the name 30px/600 and its code (*Client* for Marketing's own); FOLDERS · n with **+** (26px) opening a 300px popover — the types, those it has greyed *already here*, and for the manager *New folder type* (the name, six 20px swatches, the category, Create); folder tiles (min 200px, radius 10): a 28×24 folder drawn in its type's colour, or a 🔗 tile for a link folder, the name 13.5px/500, *n files · updated d Mmm* or *Google Drive · link*, ···. A folder: its head with ⬆ Upload (28px); the files (min 176px, radius 12): a 112px top — the picture itself, a video on ink with a white ▶ disc, else its extension boxed in mono — then the name 13px/500, *size · who · day*, the category chip with its swatch; ··· on the corner. Menus 210px (radius 10), *Move to Dustbin* in red under a rule. The Dustbin: one white list (radius 12) — the name (📁 for a folder), where from, *auto-deletes in n days* in mono (red at 7 or fewer), Restore and the manager's red *Delete now*. Two dialogs: *Move* (the places, those it can't go greyed) and *Add a link* (the link type, the https address). Under 900px the rail wraps into a row above the page.
- **A subsidiary's brand in the Library** (`Library.dc.html` › *Edit … profile*): its card's top and its banner wear its cover (cover-fitted), else its background colour, else its own tint; its picture is its logo, else its colour with the name's first letter in white 700, else its emoji. Its display name takes its brand font at weight 400 — 20px on the card, 36px on the banner — over the caption (12px muted on the card, 13px on the banner); on the dark background (`rgb(40 34 30)`) the name is white and the caption white at 80%. ✎ (30px, radius 8, white at 85%, top-right of the banner) is the manager's. Under the banner, SCHEDULE: its next three dates as white chips (radius 7, 12.5px), the day in mono 10.5px `--mk-rust`, each a link to its project. The dialog (600px): the preview (radius 12, a 52px picture, the name 26px), *Profile picture* and *Background picture* side by side (seven 24px swatches each, radius 7, ringed in brown when picked; a dashed 28px *⬆ Upload logo / cover*, *✓ name · remove* once sent), *Brand font* (three columns of tiles: the name in that face 20px over the face's name 10.5px, the picked one in brown on `--mk-surface`), *Display name* and *Caption* (32px fields), a rule, Cancel · **Save profile**. Under 520px the pairs stack.
- **A Library guest link** (`Library.dc.html` › *Share link*, hint *guest* — *live* once one is): the dialog (520px) *Share "name"*; once live, the address on `--mk-surface-2` (radius 8, mono 11.5px, ellipsed) with **Copy** (28px, radius 6, ink, white lettering → *Copied ✓*); *Link expires* — four 28px chips (radius 7; the picked one ink with white lettering), its end in mono under them; *Allow download* — a 30×18 switch (ink when on, a white 14px knob); a rule, then *Stop link* in red · **Done**, or Cancel · **Create link** before one exists. **The stranger's page** `/l/<code>` (the `.mkt-pic` tokens, 920px, on `--pk-page`): the brand's banner (radius 14, ≥110px — its cover, its colour, or soft; a 64px picture, the name in its font at 32px, else Inter 600 26px; light on the dark background), then 📁 / 📄 and the item's name (Inter 600 22px), *n files · Expires …* muted with a grey *View only* pill when download is off; a folder's files as tiles (min 200px, radius 12: a 140px top — the picture, a video player on ink, else its ending boxed in mono — the name, the size in mono, *Download* underlined in brown); one file shown large (≤ 560px high) with **Download** (the primary, 36px). *This link is closed* (🔒, centred) for anything else; *HOUZS Marketing* small at the foot. Under 520px two tiles a row.
- **A Library file on a task** (`Library.dc.html` › *Attach to task* · *Attach from Library*): in the Library, a file's ··· *Attach to task* (hint *send*) opens *Attach "name" to a task* — a row per open task of its subsidiary (the Track ID in mono 11px on a 130px column, the title 500, *Now at …* in mono). On the task page, under Requirements: 📚 *Library files* with its count tag and **+ Attach from Library** at the right (a white button); the files as the stage files' chips (32px, radius 7: 📚 the name, its folder and size muted, ×), *No files from the Library* when none. The picker (520px): *Attach from Library*, the subsidiary's file folders as small uppercase heads with their counts, a row per file (radius 8, a checkbox, the name ellipsed, the size — *on the task* for those attached already, on `--mk-surface-2`), Cancel · **Attach n files**.
- **Replace Person** (`/marketing/replace`, MANAGER TOOLS › 🔁 on the mist tile, the manager's; `Replace Person.dc.html`, 980px): 🔁 and *Replace Person* 1.5em/600 in the shell's own face (never the display serif) — no description under it. The steps strip (12px 16px on white, radius 10): *Choose person* · *Where they appear* · *Replace with* · *Done* on 22px discs — done ink with ✓, the current ringed in ink with its label 600, the rest faint; on step 2 the middle two are both current; below 900px only the current one's label. **Step 1**, *Who are you replacing?* 1.1em/600: a grid of people (210px+, radius 10, a 1.5px edge — ink and linen when picked): the initial on their group's tint (32px), the first name 600, *TITLE · in n places* small and muted, a 16px radio (5px ink when picked) — anybody on the roster, and anybody off it who still has places (*Not on the roster*); **Find <name> everywhere →** (the primary, right; *<name> stands nowhere* faded when they have none). **Steps 2–3**: two columns (the side 300px, sticky; one column below 900px) — *<name> appears in n places* with their avatar and *Tick all* / *Untick all* (underlined); a card a group (radius 10): its head on linen — a 16px box (✓ all, – some, empty none), the title small upper case, *n/m* mono, its hint on the right (*Future projects* · *Runs to come* · *Not started yet* · *Will need Accept again* · *Waiting now or to come* · *Owner*); a row a place — the box, its title 500, what it is in small muted words (*Stage 2 Design — a 🔓 candidate*, *Approval level 1 of 2*, *Doing it · accepted*), when in mono (red when late), and, unticked, the row on linen with *Stays with <name>*; under a ticked row what the swap does beyond itself (*Hafiz is already a candidate — Siti will just be removed*; in red, *Hafiz already approves this stage — untick it, or pick somebody else*). The side card: REPLACE WITH — the roster as radio rows (the picked one ink-edged on linen), their group first, *· n active* (their title on hover); REASON (REQUIRED) — *Resigned* · *Transferred* · *Workload* as 26px chips (ink when picked) and *Or type a reason*; the preview on linen (*Hafiz takes over 5 of 6: … 1 stays with Siti.*); **Replace selected (n)** (42px, the primary; faded until a place, a person and a reason) and what stops it in red; *← Choose a different person*. **Step 4**: a card (radius 12) — ✓ on the done green (40px), *n places updated* 1.25em/600, *Siti → Hafiz · Reason: … · 24 Oct 2026, 11:40 by …*, *Audit #R-0007* boxed mono; *Tasks in hand need Hafiz to Accept again.* on the waiting ground when some are; PLACE · CHANGE · STATUS (2 : 1.3 : 1; stacked below 900px) — the place 500 with its group beneath, *Siti → Hafiz* or *Siti removed (Hafiz already listed)*, the status as a pill (*Published v3*, *Waiting for Hafiz to Accept*, *Waiting for Hafiz’s approval* on the waiting ground; *Assigned · not started* and *Stays with Siti* grey; the rest green), a row kept muted; *Hafiz, Siti and each project’s owner were told.* and **Replace someone else**.

---

## Part IV — Version index

- **v4.157** · 2026-10-24 · **People: two reminders before a probation or a contract ends — 30 days, then 15** (asked whether a contract's end should remind HR too, the user: "need 30 days and 15 days before remind, 2 reminder, then for probation need same as well"): HR view's bell lists *Probation ending* and now *Contract ending* (a peach **CONT** tag), each from 30 days before the end and again from 15 though the first was acknowledged — *30-day reminder acknowledged by …* under the row meanwhile; *No probation or contract ends in the next 30 days.*; the roster's chip counts a contract's days too (*Contract · 9d left*); the Employment well's contract line offers **Acknowledge**; *HR is reminded 30 and 15 days before.* under both ends on **+ Add person**; the HR app's Home lists *Contract ending* (CONT tile) and its line *N contract(s) ending*, a person's page acknowledges either, a contract's notice is tagged **CONT**; HR's Overview counts both → People, the HR phone app, Finance's view — the Overview
- **v4.156** · 2026-10-24 · **The HR app brings a not-selected candidate back** (asked whether the phone should, as the request page's fold does, the user: "can"): a hire's Candidates card folds the not selected at its foot — **▸ Not selected · N · in Talent Bank** — each, opened, in the Not selected chip's colours with why in red (*Not right now · Applied · 012-…*); for Hiring · Edit a tap opens the status sheet, Not selected ticked, and any other stage puts them back on the list (they stay in the Talent Bank) → The HR phone app
- **v4.154** · 2026-10-24 · **My Space's chat** (the handoff's `My Space Bento.dc.html`, its chat tile; the user's answers 35, 36, 37 and 39): *💬 My chats* and *🏛️ Lobby* with their dots, a chat open with its messages and a task attached, *📎* and Enter; a visit's *💬 Message* and *👋 Wave*; the lobby's last message over its sender's pet; the first board is the prototype's own → Marketing's view — its shell and first pages
- **v4.153** · 2026-10-24 · **My Space's lobby and a visit** (the handoff's `My Space Bento.dc.html`, its lobby tile and visiting; the user's answers 37, 38 and 40): the 🏛️ lobby — the roster's pets wandering, a teammate's opening their space — and a visit: the ink band with ← Back to mine, their look, cover, name, status, room, pet, trophies, Notes and Photo; the Photo now seen by visitors → Marketing's view — its shell and first pages
- **v4.152** · 2026-10-24 · **My Space's pet levels and trophies** (the handoff's `My Space Bento.dc.html`, its pet tile and trophies tile; the user's answers 32–34): the pet's tile — its level, XP to the next, energy, mood, Feed and Exercise — and the trophies, one a project finished this quarter; the pet grows and evolves; the first board gains both on the right → Marketing's view — its shell and first pages
- **v4.151** · 2026-10-24 · **Marketing's Replace Person** (the handoff's `Replace Person.dc.html`; the user's answers 24–28): MANAGER TOOLS › 🔁 — whom to replace (with their places), where they appear by group (templates, a series' runs to come, stages not started, the work in their hands, approvals under way, the projects they own), all ticked — untick what stays; anybody on the roster takes over, a reason asked; the record with its number, the tasks to Accept again, a row a place → Marketing's view — its shell and first pages
- **v4.150** · 2026-10-24 · **People: Contract, with its period; the probation reminder 15 days before** (the user: "1, go with 15 days / 2, can add with one is Contract, then need pick time period as well, 6 month, 12 month, 18, 24, until 36"): a fourth employment status — **Contract**, its chip on run-on peach (its end in the title), sorted after the probations; **+ Add person**, the waiting list's Transfer and a person's card ask its **Contract period** (*6 months* … *36 months*, every six, 12 to start) and show the day it ends (*Contract · 12 months · ends 30 Sep 2027*; the window *Contract · ends 30 Sep 2027*) — nobody is reminded of it; HR is told of a probation 15 days before its end, not 14 (the bell, the HR app's Home, *HR is reminded 15 days before.*) → People, the HR phone app
- **v4.149** · 2026-10-24 · **Hiring: the Talent Bank's reasons are HR's list** (asked whether HR should add, rename and turn off the reasons like File types, the user: "1, yes do with same"): Form settings gains **Talent Bank reasons** — the File types card again: each reason with *N people*, ✎ rename, On / Off, *+ Add reason*, the five it began with no different; every reason picker (Not selected ▸ why?, Edit candidate's *Why not selected*, Move to Talent Bank, Add to Talent Bank) offers the ones that are on, and the forms **+ Add a new reason…** for Edit; a reason turned off leaves the pickers and stays on the people kept with it; the cards, panels, search and the HR app read HR's words (#698) → Hiring › Requests; Hiring › Insights and the Talent Bank
- **v4.148** · 2026-10-24 · **Hiring's Listing is a sidebar row** (the user: "帮我把 listing 的这个 tab，作为一个独立的 tab 在side bar"): HR's sidebar reads I. HIRING · Requests · **Listing** · Insights · Talent Bank — Listing opens the requests page on its Listing tab and stays lit on a request's page; Requests lights on the inbox and Form settings; the page keeps its three tabs; HR's Overview card for Hiring lists it with the rest (#693) → Hiring › Requests
- **v4.147** · 2026-10-24 · **Hiring: Not selected goes to the Talent Bank, and the bank says why** (IT-0008, from HR: "after the candidate is failed with interview or not shortlisted, the candidate will be dissapear within the table ish view … placed within the Talent Bank"; the user: "最好的是它可以显示 candidate 是从哪里来的 … 做成一个 dropdown，可以选 type 就好了"): a request's *Candidates · N* counts and lists the ones still in the running, the rest folded under **▸ Not selected · N** (quieter cards, why in red); Change status ▸ **Not selected ▸** opens *Not selected · why?* — *Not shortlisted · Failed interview · Not right now · Declined offer · Other*, the stage's reason first — and Edit candidate adds *Why not selected*; the Talent Bank's card reads *why · what they fit*, its panel and a talent's page **Reason** (a dropdown for Edit) and **Came from** (*HR-198 · Senior Revenue Specialist* / *Added in Talent Bank*); *Add talent* and *Move to Talent Bank* ask **Reason ***; the HR app's status sheet asks why too (#689) → Hiring › Requests; Hiring › Insights and the Talent Bank; The HR phone app
- **v4.146** · 2026-10-24 · **IT support: drop to attach, and a file opened beside the window** (the user: "drag 那个 file 移过来，放空在这个 text blank space 的时候，它要能够直接 attach"; "我不要它跳到另外一个 screen … 直接在这个 floating window 的右边出现一个 preview"): files dragged onto a request's note — or onto *Send to IT* — attach as the picker does, the text box dashed under *Drop to attach*; a filed file's *Open* shows it at the window's right (the kit's `FinDialog` › `aside`; under 960px over the window, on a phone over the sheet) — a picture, video, PDF or text file in place, anything else *No preview for .xlsx files*, with **Open in new tab** and **Download**; Esc closes the preview first (#688) → IT support — every department and screenshot markup, Finance's view — its own shell
- **v4.145** · 2026-10-24 · **A probation ending on HR's phone and Overview** (the user: "do this, HR 手机 app 里的提醒和推送，以及 HR Overview 首页上的数字"): the HR app's Home lists *Probation ending* under *Waiting for you* — the name, *Ends 31 Oct 2026 · in 8 days · HR*, the PROB tile in the warning pair, a row opening the person — and its live line counts them after the requests; a person's page shows *Probation* (*3 months · ends 31 Oct 2026 · in 8 days*) and, once given, *Reminder* (*Acknowledged by HR Manager · 23 Oct 2026*) among the facts, with **Acknowledge** (accent) in the bar — the toast *Acknowledged*; the bell's notice is tagged **PROB** and opens the person, as its push does; HR's Overview counts them on People's tile and its row in People Management and says *N probation(s) ending* in its line, only while some wait (#685) → The HR phone app, Finance's view — the Overview
- **v4.144** · 2026-10-23 · **People: employment status and the probation reminder** (the user: "permenant, part time and probation status follow by the hire date start … if the probation is almost end, then it will notification hr acknowledge for further action"; "at least show up in this notifaction side, in desktop view"): the roster's Employment column is the status chip then the hire date — *Permanent*, *Part time*, *Probation*, *Not set* — and *Probation · 9d left* / *· ends today* / *· ended* once HR is being told, its head sorting by it; **+ Add person** asks *Hire date* and *Employment status*, *Probation* bringing *Probation period* (1–6 months) and *Probation ends*; the waiting list's Transfer asks the same as pills; a person's card edits *Employment Status* in place and the Employment well's probation line offers **Acknowledge**, *Confirm as permanent*, *Extend* (1–3 months); HR view's bell is *Notifications* with a *Probation ending* section (the probations ending within 14 days or past, each with Acknowledge) — never in the Principal's or Finance's view (#681) → People
- **v4.143** · 2026-10-23 · **My Space's room and pet** (the handoff's `My Space Bento.dc.html`, its room and the first visit): the 🏠 room tile — wall, window and its sky, floor, furniture, the pet walking about, *🎨 Decorate*; the pet beside the avatar and on the status line, its bubble and motion for its mood; the drawer's *Layout* · *🎨 Room & pet* tabs (Wall, Floor, Add furniture, ⇋ Flip / Remove, Your pet); the five-step setup (Pet, Name, Colour, Cover, Photo) (#682) → Marketing's view — its shell and first pages
- **v4.142** · 2026-10-23 · **My Space laid out by its owner** (the handoff's `My Space Bento.dc.html`, its own side, first part): the cover (four gradients or a picture — *🖼️ Change cover*), the avatar (a picture), the status; **✥ Edit layout** — every tile dragged anywhere and resized from eight handles, ✕ / 🔒, the drawer's *Add a tile*, *Page background*, *Accent*, *Tile corners*, *Reset layout and theme*, **Done**; 📝 Notes and 🖼️ Photo; under 520px the tiles one under another (#673) → Marketing's view — its shell and first pages
- **v4.141** · 2026-10-23 · **A Library file on a task** (the handoff's *Attach to task* · *Attach from Library*): a file's ··· *Attach to task* — its subsidiary's open tasks with their Track IDs and *Now at …*; on the task page, 📚 *Library files* under Requirements — chips opening the Library's own file, ×, **+ Attach from Library** (the subsidiary's file folders, those on the task ticked already, *Attach n files*) (#665) → Marketing's view — its shell and first pages
- **v4.140** · 2026-10-23 · **A Library guest link** (the handoff's *Share link*): the dialog — *Create link*, then the address with **Copy**, *Link expires* 24 hours · 7 days · 30 days · Never, *Allow download*, *Stop link*; the stranger's page `/l/<code>` in the `.mkt-pic` palette — the brand's banner, the item, its files shown in place or saved when allowed, *View only*, *This link is closed* (#664) → Marketing's view — its shell and first pages
- **v4.139** · 2026-10-23 · **A subsidiary's brand in the Library** (the handoff's *Edit … profile*, the manager's ✎): its cover or colour, its logo or colour and letter, its name in one of six brand fonts with its caption — on its card and banner; the dialog's preview, seven swatches each, ⬆ Upload logo / cover, the font tiles, Display name, Caption; SCHEDULE — its next three dates as chips (#663) → Marketing's view — its shell and first pages
- **v4.138** · 2026-10-23 · **Marketing's Library** (the handoff's `Library.dc.html`): `/marketing/library` — the rail (subsidiaries, categories, Dustbin, each counted), the search, **+ New** (New folder · Upload file · Add a link), everything's cards, a subsidiary's banner and folders (Add folder, the manager's new type), a folder's files (thumbnails, ⬆ Upload, *Uploading…*), the ··· menus, the Dustbin (*auto-deletes in n days*, Restore, Delete now), Move and Add a link dialogs (#660) → Marketing's view — its shell and first pages
- **v4.137** · 2026-10-23 · **Marketing's task map and Replay** (the handoff's `Task Map.dc.html` and the Audit trail's ▶ Replay): **Map** beside **Formal log** on a task's trail head opens the project's sheet — tabs *Map* and *Audit trail* (▶ Replay · Formal log); swim lanes (🛡️ Approvals, then each team), stations (cards, approval gates 👤 / 🔗, *📍 Now here*), lines solid / picked dashed / sent back red / planned faint with their records on hover, a station's panel, Map view · List view, zoom and Fit; Replay — Play, the caption, the scrubber (#657) → Marketing's view — its shell and first pages
- **v4.136** · 2026-10-23 · **Marketing's formal log** (the handoff's `Audit Trail.dc.html`): **Formal log** on every project's trail head — every record numbered, oldest first, in its columns (#, Time, Actor, Action with its dot, From → To, Reason, Version); Filter by person, action, stage with counts, chips, *Clear all*, *n of m records*; *Read-only* under it; folding on a phone (#655) → Marketing's view — its shell and first pages
- **v4.135** · 2026-10-23 · **Marketing's subsidiary page** (the handoff's `Subsidiary Page.dc.html`): `/marketing/subsidiaries/<code>` from the sidebar's rows — the head (its tile, name, dot, *Client* for Marketing's own, its PIC), five cards (Projects running, Waiting for PIC, Due this week, Done this month, Overdue on red), its dates by Month, Week or Timeline (team colours, red when late, done faded; the Type · Department · Status filter; ⚑ Key dates), ⚡ Recent activity in the trail's words, and its projects with how far each has come (#654) → Marketing's view — its shell and first pages
- **v4.134** · 2026-10-23 · **Marketing's own clients** (the handoff's *+ Add subsidiary*, the manager's): New Project's **+** beside SUBSIDIARY opens the inline form (*Company or client name*, *PIC name (optional)*, Cancel · **Add & select**, a refusal in red under it); the sidebar's **+ Add subsidiary** ends the open Subsidiaries list; a client draws with the grey dot and 🏢 (#653) → Marketing's view — its shell and first pages
- **v4.133** · 2026-10-23 · **Marketing's PIC link** (the handoff's `PIC Link.dc.html`, public, no sign-in): `/t/<code>` in its own palette (`.mkt-pic`) — the minutes the PIC sees, Approve with a typed full name or Request changes in their words, the receipt, why it waits again, the progress; *This link is closed* for any other code (#651) → Marketing's view — its shell and first pages
- **v4.132** · 2026-10-23 · **Marketing's product projects** (the handoff's `New Project.dc.html`, steps 1–4, the manager's): New Project's 📦 — the products on sale today as cards (the type's chip, what each includes, *n intake fields · n actions*; *No products on sale* → the Product Builder), *Open meeting minutes →*; a product project's page — the stepper, the Meeting card, the intake minutes as the template asks them, signatures, notes, saved as typed; the side card (*Required n/m*, Generate tracking link with what is missing, the link with Copy · WhatsApp, Resend, Start before approval…, Plan assignments →) and the trail; the PIC's changes in red, edited after approval in yellow (#650) → Marketing's view — its shell and first pages
- **v4.131** · 2026-10-23 · **Marketing's Canvas Template Editor** (the handoff's `Canvas Template Editor.dc.html` — the Workflow Builder's *Canvas template* tab, the manager's): the task page of a project started from a template, laid out — 📋 Requirements, a section per stage with its fields, the manager's own sections (+ Add section, + Add field), the 🔒 Free space; each section's icon and badges (🔒 · ⭐ · 🎯 · 👁) and ⚙ Section settings; a field's panel (its name and kind, a choice's options, ⭐ / 👁, which stage fills it in, 📅 on the calendar with its name, a team's colour and the PIC's calendar); a table field's preset and blank cells to try; the Preview as the staff (at a stage, the rest faded) and as the PIC on the link (only 👁, *On your calendar*, Approve · Request changes, *Hidden: …*) (#648) → Marketing's view — its shell and first pages
- **v4.130** · 2026-10-23 · **Marketing's Product Builder** (the handoff's `Product Builder.dc.html`, the manager's): the products as cards by status (All · Active · Draft · Retired) — code, name, what it includes, type, version, 🔒 price; a product's editor with its five sections down the left, ticked as each is complete — *Basics* (the code the database makes, under a lock; name; Recurring monthly or One-time project; description), *What's included* (categories of actions: quantity, unit price, total, the workflow each runs on with ↗ and *+ New action workflow*; *Sum of all actions*), *Intake template*, *Pricing* (🔒 Manager only: list price with *Use sum of actions*, internal cost, the margin red below 20%), *Publish* (the next version, Effective from, the projects that stay on theirs, the history, Retire product · Save draft · Publish); a retired product read-only under its banner with Reactivate (#646) → Marketing's view — its shell and first pages
- **v4.129** · 2026-10-23 · **Marketing's Minutes Builder** (the handoff's `Minutes Builder.dc.html`, the manager's): the minutes templates down the left (+ New minutes template); the one open with its version and **Edit · Preview** — *Form fields* as a table (drag, kind, Required, PIC sees, ✕; the project and the attendees locked), a table field's typed columns and *Column settings*, a field added by name and kind; *Completion rules* beside it (five switches); **Preview** as the staff or the PIC (each field as it asks, signatures, the checks, Complete / Approve minutes; nothing kept); the foot's *n fields · n required · n visible to PIC*, warnings and Publish; both builders keep the open template in the URL (#644) → Marketing's view — its shell and first pages
- **v4.128** · 2026-10-23 · **Marketing's Workflow Builder** (the handoff's `Workflow Builder.dc.html`, the manager's): the actions down the left with their templates (+ New action, + Add template, Clone), the template's stages as cards (Who — *Pick at assignment* or *🔓 Previous stage picks from …*, SLA, Approval, Subtasks), the stage's settings (team, who and the 🔓 candidates, up to three approval levels — a manager, 🔗 PIC via link, 👤 picked at assignment — days, what the PIC sees, subtasks, back to, fields), **🔒 Lock whole workflow**, the foot (Total, PIC approves, Product promise, the warnings, *n active tasks stay on vN*, Publish v(n+1)); the **Edit table** dialog with preset rows, shared with New Project's quick builder; drafts saved as typed, *Not saved · … — Reload* when somebody saved since (#642) → Marketing's view — its shell and first pages
- **v4.127** · 2026-10-23 · **Marketing's quick and recurring tasks** (the user: "全部照设计做", in the handoff's order): **+ New Project** on the top bar → New Project (the subsidiary cards; ⚡ Quick task and 🔁 Recurring task with its Repeat box — Every Day · Week · Month, Starts, Ends, the next six runs; the quick Workflow Builder — each stage's person, approval levels, working days and due day, where changes go back to, the fields it fills in); **the task page** — the head with its actions and stage rail, the status banner, 📋 Requirements, 🔁 Repeat (Pause / Resume / End series), a section per stage, the Free space, the Audit trail, *Request changes* with its reason; *Accept* on My Space's tiles; *Nudge* on the Tracking Dashboard (#639) → Marketing's view — its shell and first pages
- **v4.126** · 2026-10-23 · **Marketing's own view** (the user, handing over the Claude Design handoff "HOUZS Marketing Module Setup": "当做 Marketing Department 的 marketing view（一个单独的 department view）"): its shell — the 248px sidebar of emoji tiles with counts, Subsidiaries opening its list, MANAGER TOOLS, Settings › Appearance (size, face, density), the white top bar with the search ⌘K and the bell — My Space's task tiles, the Calendar (Month / Week / List, layers, subsidiaries, Only mine), Projects and the manager's Tracking Dashboard → Marketing's view — its shell and first pages
- **v4.125** · 2026-10-23 · CRM **Assign** and **Move** (the owner: "照「同一套规则」，跟 Mine 一样。leader 按 Assign to 就是交给自己 team 的下属，Principal / Director 照旧可以给任何人", "ta can assign as well"): the Team side's ⋮ *Assign to* only for CRM · Manage (anyone, Undo) or a TL / STL / TA (their own people in the customer's team, no Undo) — it showed to every leader and the database refused them; a hand-on at once says Assign everywhere (the round button, its sheet, the Undo bar, the chat's line, the desktop's *Assigned*), the notifications' new **Assign** chip; Move is only the request to one's direct superior → The Revenue app — the refresh
- **v4.124** · 2026-10-23 · The desktop CRM's ⋮ **Move** is the phone's (the owner: "桌面版的 move follow 和 手机版，本质上他们是同一套规则的 by right 是要一样的"): a request to the direct superior of whoever has the customer — *Request* / *Requested*, *Move request sent to …*, no Undo — where it moved the customer at once to the Principal; **CRM alerts** open on *INVITATIONS* with *Decline* / *Accept*, so the one asked answers on the computer too → The Revenue app — the refresh
- **v4.123** · 2026-10-23 · Revenue app › Profile › **View as** lists each sub-department's Revenue Directors first (the user: "找不到我的 revenue director 了。By right 它应该是能够找得到的"): *Revenue Director · Leads Fair* on the dark avatar, the top of each tree on the accent one, everybody below on sand, as the prototype draws the levels (the top of a tree had been drawn dark); viewing a director reads what their own app does — *All of Fair*, *ANNA leads*, their rung's rate and no ladders on Commission scheme → The Revenue app — built to the prototype
- **v4.122** · 2026-10-22 · Create payment, wider: Pay to beside the date; the lines always there, each with its own words (the books' line), *+ Add line*, their total the amount; the attachments always shown; *Split pools*, *Attachments* and *GL override* gone from the small buttons (the user: "split pool 这个按钮我不想要，我想maintain之前的add description/line, attachment 就default 要有" → "每行一个，GL override 拿掉"); a line's words on the drawer, the page, the PDF, Approvals and the journal → Finance's view — Create payment
- **v4.121** · 2026-10-22 · People: a login's email is HR's to change on the person's page (the user: "i want the email can be editable, for hr") — *Edit* turns it into a field with the *Login* chip inside it at the right, and the login moves with it; a full-access title's stays the locked box with its padlock for whoever does not manage permissions, why on hover. People Management's heads sort (the user: "press name, will be follow by alpahabe 排法， title will be follow title 高到低 按多一次就低到高"): each head a button in its own words with ▲ / ▼ after it (faint on hover elsewhere), `aria-sort` on the head, its first way then the other, inside each department band (#619) → People
- **v4.120** · 2026-10-22 · Finance's hubs put their cards in **one row above the table** on a desktop, the table at the hub's whole width (the user: "可以帮我把finance 的这些card move 上去吗" → "可以，原本的底色不要变，电话版本的也不要变"): the total at 1.6 cards, a card 175px or more with its figure whole, two rows beside the total when short of room; the colours and the phone unchanged — Payments / Receipt, Invoice, Fund OUT / IN, the Billing Allocator, Approvals (#620) → Finance's view — the hubs
- **v4.119** · 2026-10-21 · Share order is **one colleague, half each** (the user: "only can share one pax, then percentage for them request is fix with 50% 50%"): *SPLIT · HALF EACH* — the owner and the colleague at 50%, no − / + steppers; *WHO SOLD IT WITH YOU* picks one (radio rows, a round tick); a bill HR shares already says *…is shared already — HR changes who shares it on Comm Cal.* (#599). The share sheets keep their buttons full height in a scrolling sheet, and the bill sheet's SHARED row stays inside its width — both seen on production with the first real share (#600) → The Revenue app — Share order
- **v4.118** · 2026-10-21 · **Share order** (the user, circling a bill's deposit chip and the space after *Double claims*: "加一个三点，可以 share order request … 先 notify 被 share 的那个人 … Accept 之后，才会去到 HR … HR 按 Approve 之后，那张单就会自动 share"): Revenue app — the bill sheet's **⋯** (own bill, Requests · Create open) → *Share order* (pick colleagues, − / + parts, note, *Send to ANTHONY*) or the open *Share request* (split, answers, audit trail; Accept / Decline; Withdraw); a shared bill says *Shared · LUCAS 50% · ANTHONY 50%*; Today's to-do and the bell's NEEDS YOU for a request to answer. Comm Cal's month — a **Requests** tab after Double claims: the month's requests, *To approve* on the badge, a drawer with the trail and **Approve** / **Reject** (a reason) → The Revenue app — Share order; Comm Cal's month — the workbench and its rail (#597)
- **v4.117** · 2026-10-21 · The portal moves to Next.js 16: the checklist's lint step is `npm run lint -- --quiet` (`next lint` is gone); no screen changes → What to do when you add a feature or amend a page
- **v4.116** · 2026-10-21 · Revenue app › Profile › Your workspace: **IT support** moves from the top to right under *Memos & notifications*, above *Install the app* (the user: "move the it support to below memo & notifications"); View as's disabled row moves with it → The Revenue app — IT support
- **v4.115** · 2026-10-21 · IT support in HR and Finance desktop/app; Principal desktop IT requests gathers every source; Revenue's entry moves first in Your workspace and is visible but disabled in View as; screenshots gain Circle, Arrow, Pen and Text annotations saved as a separate draft attachment → IT support — every department and screenshot markup
- **v4.114** · 2026-10-20 · Revenue app › Profile › Settings › **IT support** (the user: "i want add on a button to get submit for IT support or help" … "如果我们给它 fix 了，他那边就可以收到 fix 的通知"): *Send a request* — a bug, a new feature or a suggestion, a title, the details, screenshots and files (up the moment they are added; ten, 50 MB each) — and one's own requests with their status; a request's sheet holds its facts, files and thread — IT's notes, the status IT set, the sender's reply — and the bell tells the sender. Everybody's (*All*, and the computer's sidebar **IT requests**) is the Principal's and Ultimate full access's only ("just principal or ulitmate full access") → The Revenue app — IT support (#590)
- **v4.113** · 2026-10-20 · Revenue app › Profile › Your workspace loses *My leads & appointments* (the user: "这个我们不用留了，帮我 delete 掉，因为左边那个基本上已经有 CRM 了") — the CRM opens from Today's chat button and the desktop sidebar's CRM row, and a CRM a tapped notice opened leads home; a file opened in Documentation stays opened on the phone's kept list, so Profile's count does not come back for a moment on the next open → The Revenue app — the refresh
- **v4.112** · 2026-10-20 · Invoice's dialogs: a party billed by name (*Someone else…*) gives its address in the portal's six parts (the user: "所有关联到 address 的，都要跟着我刚才上面讲的 format 给他们去填") — *Address line 1*, *Address line 2*, ① State → ② City → ③ Postcode from the official list, *Country* — in Create invoice, Multi-line invoice and Edit, in the dialog's own labels and fields, one to a row on a phone; a half-picked address is refused in the hint with nothing sent; the invoice prints it a line each; one billed before keeps its words, *On file*. The address fields carry their own palette and an empty picker reads *Choose* → Invoice's dialogs, People (#587)
- **v4.111** · 2026-10-20 · A memo is acknowledged with the person's own signature (the user: "点进去的时候，应该要有一个 signature，也就是他自己手绘签名的那种，签完之后再来点那个 Acknowledge button"): **the signature pad** (`components/memos/SignaturePad`) under a memo still waiting — the Revenue app's memo sheet, the HR app's memo page, the portal's memo bell — white paper in every theme (`--signature-ink` / `--signature-paper`), *Sign here* on a baseline, **Clear**; Acknowledge waits for a stroke (*Sign above to acknowledge.*); acknowledged, the signature shows under the acknowledged line, and HR reads it in Publish › Preview's *Who has it* and on a letter's Audit trail → Documentation › A memo in every view › Signed (#588)
- **v4.110** · 2026-10-20 · Attendance › Settings › Locations: a work location's address is the portal's six parts (the user: "所有关联到 address 的，都要跟着我刚才上面讲的 format 给他们去填") — *Address line 1*, *Address line 2* (*Optional*), then State → City → Postcode from the official list, each waiting for the one before, and *Country* (Malaysia), in the window's own fields (Me's — `components/address/DsAddressFields`); the select that read *State* is **Public holidays** — the state whose holidays the location keeps — and follows the address as its state is picked (*Pulau Pinang* → *Penang*, a federal territory → *Federal Territory*), still HR's to change; *Add* refuses a half-picked address in words (*Pick the city, postcode.*); the card reads *Holidays · Penang* → HR's view — Attendance (#583)
- **v4.109** · 2026-10-20 · An address's City is the place's own name, not its post office's (the user: "我要的是 Standard 的地址，不是跟着 Post Malaysia 的邮政局命名" — then chose the government's list): State → City → Postcode now pick from data.gov.my's postcode list — *11060 Paya Terubong*, *11500 Air Itam* — with the postcodes only Pos Malaysia's list holds kept under its town; 16 states, 411 cities, 3,215 postcodes → People (#580)
- **v4.108** · 2026-10-20 · Revenue app › Today names the basic as it stands (the user: "i want his show gross basic, not net"): *Basic RM 7,000.00 + balance commission RM 2,208.99*, never *Net basic RM 5,854.50 + …*, and the hero is their sum — RM 9,208.99, the member's own EPF / SOCSO / EIS and PCB not yet off (asked, the user chose it over keeping what reaches the bank, RM 8,063.49, with *− deductions* written out); My income's Total stays what reaches the bank → The Revenue app — built to the prototype (#582)
- **v4.107** · 2026-10-20 · Revenue app › Requests: *Submit claim* is **Submit transport claim** — the row and the form it opens (asked whether to, the user: "do 2"); the *Claim* filter, a request's *Type* and *Review & submit claim* keep their words → The Revenue app — built to the prototype (#578)
- **v4.106** · 2026-10-20 · An address is six parts (the user: "填写的 format 要区分成 address 1、address 2、postcode、state、city，国家 default 是 Malaysia" … "不是填的，应该都是选的"; the order, from a canvas of three: "go with state, city, postcode") — two typed lines, then ① State → ② City → ③ Postcode picked from Pos Malaysia's list, each waiting for the one before, then Country (Malaysia; abroad typed); peach when changed; read as lines; an old one-box address *On file* until it is written in parts — a person's page, *+ Add person* and Me › Edit profile → People, Me (#577)
- **v4.105** · 2026-10-20 · Member services › *Claim rates* is **Transport claim** (the user: "这个 claim rate 我要换成 transport claim … save 的右边 … 三个点 … 选择什么 title 的人可以 claim 这个 transport"): the tab, its heading and HR's sidebar row; a **⋯** right of Save (*Who can claim · N of M titles*) opens *Who can claim transport* — the Food claim's table (Title · Level · People · *Can claim*) in a 620px Window with its own Save; the Revenue app's Requests offers *Submit claim* only to a ticked title → Member services (#574)
- **v4.104** · 2026-10-20 · People › Invite user is HR's too (the user: "HR … supposed to be 是要能够 invite user 的 … 确保在 permission 那边也可以做到这个 setting"): whoever holds HR view › *Permissions* · **Create** invites — its box's tooltip *Invite user — give somebody on the roster a login* (Edit's, *Change what a title or a person may do*); a full-access title stays with Edit — for anybody else it is faint in the row menu, left out of the window's *Person* list, and toasts *DIRECTOR is a full-access title (Ultimate full access): only whoever manages permissions gives it a login.* → People; Permission matrix (#572)
- **v4.103** · 2026-10-20 · Sales Groups › Waiting list: *Edit* beside the drawer's × (the user: "要能够按 Edit … 让 HR 可以去改资料") — the name, mobile, joining date and *Submitted by* become fields where they stand, peach when changed, *N changes* · *Cancel* · *Save changes*, a *Details edited* step in the history; *Submitted by* offers the whole department, whatever the title (the Revenue Directors under *Revenue Department*). People Management: the grid lists the full name, Last Name then First Name (the user: "直接看到全名比较简单"), and a *Department* filter sits between the search and the pills → Waiting list flow, People (#573)
- **v4.102** · 2026-10-20 · Revenue app › Submit waiting list / Submit replacement: the signed form may be the filled-in Word file (the user: "need as well") — a .docx or an old .doc beside a photo, scan or PDF; the notes end *… or the filled-in Word file.*; one holding macros is refused; a claim's invoice stays JPG, PNG or PDF. Member services' *View ↗* downloads a Word form under its own name (*Downloads name*) → Submit waiting list, Member services (#570)
- **v4.101** · 2026-10-20 · Sales Groups › Waiting list: an applicant's signed form may be a Word file (the user: "want word file as well") — the drawer and "+" take a .docx or an old .doc beside a PDF, PNG or JPG (*PDF, Word, PNG or JPG …*); Word's W; *View* reads a .docx, an old .doc is Download only; one holding macros is refused → Waiting list flow (#568)
- **v4.100** · 2026-10-20 · Sales Groups › Waiting list: an applicant's drawer holds their signed form (the user: "view for the letter they submit, then can be upload as well, the file") — a *SIGNED FORM* section between the facts and the history: the file's icon, its name, *date · who*, *View* (the uploaded form's 640px viewer) and *Replace*; with none, a dashed *Upload the signed form* (PDF, PNG or JPG · 3 MB; a file may be dropped on it); its upload is a step in the history → Waiting list flow (#566)
- **v4.99** · 2026-10-20 · The Revenue app's income is what payroll pays (the user: "the basic is deduct from the commission … you can get it from hr code base"): the fixed salary comes out of the commission with every EPF / SOCSO / EIS and the PCB — HR's figures, a typed one included — so Today's hero is *Net basic RM x + balance commission RM y*, never *Fixed salary + commission*; My income lists the deductions under the commission, adds *Paid as* (Net basic · Balance commission), and Past months show what reached the bank → The Revenue app — built to the prototype
- **v4.98** · 2026-10-20 · The Revenue app's Quote names a named sofa by its name alone — *AAAA*, *SOFFIO*, not `5071 AAAA` — on its product list, *All models* (A–Z by what it shows; a search for the code still finds it), the cart, the customer quote and its option charges; a sofa with no name still reads its code → Product List — the mirror beside the portal's decisions
- **v4.97** · 2026-10-19 · A sofa's name is kept in capitals (the box shows them as it is typed, `.capsInput`) and a named sofa leads with its name, the code under it — the Modular card, the window's title (`AAAA · 5071`) and SKU Master's MODEL cell; the lists stay code first (`5066 · ROMA`) → Product List — the mirror beside the portal's decisions
- **v4.96** · 2026-10-19 · A sofa takes a model name of the portal's own: *MODEL NAME* ends its Modular window's calculator panel (the ERP's name as its placeholder) and the panel wraps rather than squeezing the switch; the name reads after the code on SKU Master, Modular, Combo Pricing and the Quote (`5066 · ROMA`) → Product List — the mirror beside the portal's decisions
- **v4.95** · 2026-10-18 · A photo, a video or a document opened from a CRM chat, the camera and the editor turn the phone's status bar their own colour while they are on — black (a document's #201814) to the top of the screen, as WhatsApp's viewer; closed, the chat's colour comes back
- **v4.94** · 2026-10-18 · The phone's status bar takes the colour at the top of the screen on show — the Revenue app white or Profile's peach, the CRM white (Mine, a chat), cream (the Team side) or peach (either Profile) — written into the page's theme-color and background as the screen changes; a video in a CRM chat shows its first picture before it plays, one just sent too (an iPhone drew it black)
- **v4.93** · 2026-10-17 · The CRM chats: a message WhatsApp refused shows a "!" in a circle where the two ticks were, and *Not delivered · …* under its time in white — the Team chat too (it showed refused videos as sent); the camera's own zoom on an iPhone moves in hundredths, not tenths
- **v4.92** · 2026-10-17 · The CRM editor's video full screen, as WhatsApp's (the owner, WhatsApp's editor beside ours: "Why is not full screen? Like this"): a picked or filmed video fills the screen at its middle as a photo does, the trim bar and the caption strip floating over it; no browser controls — a tap plays or pauses, a 64px round Play in the middle while paused, the kept part loops; the trim bar is a film strip of ten frames, dimmed outside the kept part, a white line where the video is
- **v4.91** · 2026-10-17 · The Finance app's Me bar a step thicker (the user: "let the bar thicker as bit, too narrow"): 56px, not 42 — the clock 21px, the day 10px over its 13px line → Me
- **v4.90** · 2026-10-17 · The schedule says which day is off (the user: "系统不可以默认哪一天是休息日 … everythings go with this schedule"): an overtime is paid as its day is on the person's schedule — no schedule, no rest day; HR's *On someone's behalf* loses its *Day* select; a leave counts the days the schedule works (*Work days · days off and holidays skipped*, Me and HR alike); Records' `W` is *Day off* → Me; Attendance
- **v4.89** · 2026-10-17 · The first name is the person's own, the last the surname (the user: "full name = loo wen wei, wen wei ( first name ) , loo ( last name )"): the split reads the name — a Chinese surname in front, an English name, BIN / BINTI — and two words it cannot tell apart stay whole; the Revenue app greets *Hello, WEN WEI* → People › a person's page; Voice
- **v4.88** · 2026-10-17 · The Dept Manager is gone (the user: "全删：连程序一起拿掉" — each department gets a view of its own later): My Billing and its *New Contract*, the department Overview, Dept Pool's own-department page and its requests, the reports' own-segment mode (GlReportView's left rail, the month matrix and its controls), OPEX pinned to one department; Dept Pool's sidebar opens on its Overview for whoever reaches the pool, Cash Flow / Receipt & Payment / Debtor Aging list beside the company-wide reports → Part I › Themes; Finance view; Tables › `SheetReport`
- **v4.87** · 2026-10-17 · A person has a First Name and a Last Name (the user: "大家的名字需要拆分为 first name 和 last name … 只放 first name"): Identity opens on the two, filled from the full name's first word and the rest, HR's to change; the Revenue app's *Hello,* is the first name — one word → People › a person's page; Voice
- **v4.86** · 2026-10-17 · The Finance app's Me card is a slim bar (the user: "这个 bar 本身太大了，做小一点"): one row in the page's 16px margins — the clock, the day over its line, a small *Clock in* — 42px where it took 91 → Me
- **v4.85** · 2026-10-17 · One Edit profile (the user: "finance app 他原本的那个profile就不需要了，帮我删除掉，留new de 就好", on the computer too): Me › Profile's, which HR approves; the Finance app's Profile and the desktop's account menu lose theirs → Finance's view — its own shell
- **v4.84** · 2026-10-17 · OT is paid as Me's sheet says (the user: "q1 我要跟着表格的pay"): the smaller of approved and punched — past the schedule's end on a work day, IN to OUT on any other — rounded down to 30 minutes; a rest day half a day, a day, then 2 × beyond. The sheet's words follow the day (*Every hour counts*, *punched from IN to OUT*; *Paid = the hours approved.* on fixed hours); Me's OT paid, day card and payslip note say the hours paid → Me
- **v4.83** · 2026-10-17 · A decided request tells its person (the user: "需要通知本人") — a notice in Me's words that opens Me on that request; an approved correction is the day's punch ("补上自动"); *Approve*, never *on behalf*, at one's own upline step → Me — one's own attendance, leave, payslips, record and line
- **v4.82** · 2026-10-17 · The HR app is HR Mobile (the handoff, value for value): Home · Today · Approve · People, the sub screens and the generic pages, the bottom sheet and the toast; the avatar opens Me, whose Profile carries the old More's rows; Member services' requests on Approve's *Members*; HR Costing, Payroll, Payment and the Audit Log on the desktop → The HR phone app
- **v4.81** · 2026-10-17 · The way back from the CRM on a phone is the mirror curtain (the user: "也做一个反方向的幕布"): the house squeezes and ripples, the curtain comes down from the top, *CRM* rolls down into *Revenue*, and it leaves through the bottom onto the app settling into place → The Revenue app — the switch to the CRM
- **v4.80** · 2026-10-17 · The switch to the CRM on a phone is a curtain (the user's handoff *Revenue → CRM switch view motion*, 2c *Peach · Context*): the chat button squeezes and ripples, a peach curtain rises, *Revenue* rolls into *CRM* over three pulsing dots, the CRM goes in under it and the curtain lifts off the top once it has drawn → The Revenue app — the switch to the CRM
- **v4.79** · 2026-10-17 · Me — one's own attendance, leave, payslips, record and line (the Staff App handoff, word for word): the Finance app's Profile opens on its Today card, the desktop's greeting bar has its button and a 430px panel; the selfie punch with the server's time and the fence, leave and its balances, payslips with a PDF, Edit profile to HR, the hierarchy, documents, OT · punch corrections · extra manpower, an upline's team and decisions → Me — one's own attendance, leave, payslips, record and line
- **v4.78** · 2026-10-17 · A request's full page (`/approvals/[id]`) is drawn as Finance's records are (D06): the number, its status and four facts, the numbered cards (Pay to, Deducted from, Attachments, a loan's terms, Decision notes, the Trail) beside the dark panel with Approve · Reject and ⋯ → Approvals — Finance's hub on the computer › A request's full page
- **v4.77** · 2026-10-17 · Approvals is Finance's hub on the computer (the user: "make sure the approve tab is fullfill as well"): the total with the oldest wait, *Pending* / *Submitted by the executive* / *Decided · 30 days* as wide cards, the table with Select and the dark bar, a request or a combined approval decided in the drawer, a row's right-click menu; the sheet's queue tables and batch window gone → Approvals — Finance's hub on the computer
- **v4.76** · 2026-10-17 · The Principal's own view wears Finance's view (the user: "take the same totally view with finance"): Finance's sidebar with OPEX, Access log and Settings added and no HR page; Finance's Overview leading with *N requests waiting for your approval*, the treasury's four figures in a row and Approvals first among nine quick actions; on a phone the Finance app with an Approvals tab → The Principal's own view — Finance's view
- **v4.75** · 2026-10-16 · The invite email: from HOUZS Venture <hello@houzsventure.com>, the H icon and *HOUZS VENTURE* over a white card — *Welcome to HOUZS Venture.*, *Hi {name},*, the walnut *Set your password*, the link written out — the company at the foot → The invite email
- **v4.74** · 2026-10-16 · The Revenue app's Profile: Privacy, Account and Sign out are one section, *Settings* — *Notifications* first (a switch that asks the phone when turned on; the Principal's own app too), then *Hide income amounts*, *Change password*, *Request to change email*, *Sign out* → The Revenue app — built to the prototype › Profile's Settings
- **v4.73** · 2026-10-16 · The portal on a phone: *Phone notifications* above *Sign out* in More (a switch; *Add to Home Screen* / *Blocked* as chips; *Make them pop up* on Android) and the first open's *Turn on notifications?* — the Principal's own view had no way to turn them on, so an iPhone was never asked → Responsive › Navigation
- **v4.72** · 2026-10-16 · Finance's phone app: Receive's bar follows Payment's — *Receipt* · *Repayment*, not *Create receipt* · *Loan repayment* (two words left *Loan repayment* 6px each side on a 384px phone); the sheets they open and the desktop's buttons unchanged → Finance's view — the phone app
- **v4.71** · 2026-10-16 · A person's permission window: their own Salary amounts / NRIC / Bank accounts as three pills above the matrix, over the template's — the red dot where it is theirs alone → Permissions by view and tab
- **v4.70** · 2026-10-16 · Request to change email: a login's email changes only by their own request — the Revenue app's Profile, the HR app's More and the Finance app's Profile, under Change password; their sign-in email, the latest request (waiting with Withdraw, declined with HR's words, approved) and the new one; HR approves it on Attendance › Requests, which moves the sign-in → Request to change email
- **v4.69** · 2026-10-16 · A person's permission window: a pill per sub-department under the Revenue tabs (Comm Cal, Sales Groups, Rules, the CRM's two) — ticked where they reach it, the red dot where it is theirs alone → Permissions by view and tab
- **v4.68** · 2026-10-16 · The CRM's Team Profile (the Control panel's) looks like the Revenue app's Profile too, as Mine's since v4.64: the glow behind a white card on a white page, a 56px avatar, Inter Tight on the avatar, the name and *Your workspace*, facts and rows at 650, *View as a team member* as the app's View as entry, rows ruled between in `--rv-rule`, the app's chevron and count → The Revenue app — the refresh
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
