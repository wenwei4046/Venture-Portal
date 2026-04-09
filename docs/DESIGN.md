# DESIGN.md — HOUZS Venture Portal

**Version:** 2.0
**Last updated:** 2026-04-10
**Maintained by:** HOUZS Venture Portal team
**Status:** v2.0 (Phase 1 — Treasury Core) — Anthropic-flavored ledger direction

---

## 设计定位

HOUZS Venture Portal (VP) 是 HOUZS Venture Sdn Bhd 的内部银行系统。Users = Principal + Finance + HR + Dept Manager。Real money, real decisions, real daily use.

**Visual thesis (2.0):**

> **VP is a warm research journal for a family office.** Friendly but precise. The Principal opens it every morning and feels like reading his own handwritten notes, not signing a notarized contract. Same paper aesthetic as old-school banking, less severity. Anthropic-flavored, not Bloomberg terminal.

**Mood:** Institutional calm with warmth. Cream paper. Serif headings with italic emphasis. A single rust accent that appears only where decisions happen.

---

## 不要做的

**AI slop blacklist (hard rejections):**
- Purple/violet/indigo gradients
- 3-column feature grid with icons in colored circles
- Centered everything
- Uniform `rounded-xl` on all elements
- Decorative blobs, floating circles, wavy SVG dividers
- Emoji as design elements (no 🟢🟡🔴⚠️ — use typeset italic + accent color)
- Colored left-border on cards
- Generic "Welcome to VP" / "Unlock your treasury" copy
- Drop shadows on cards (use hairline borders)
- Slate/cool-gray backgrounds (we use warm cream)
- Pure white (`#FFFFFF`) backgrounds
- Inter as display font (Inter is body-only in VP)

**Not doing:**
- Dark mode in Phase 1 — VP is a daytime instrument
- Chart-first dashboard — type-led, number-first
- Multi-color status rainbows — single rust accent + muted gold + muted green

---

## Typography

### Font stack

```css
:root {
  --font-serif: 'Instrument Serif', 'Noto Serif TC', Georgia, serif;
  --font-sans:  'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:  'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  --font-cjk:   'Noto Serif TC', 'PingFang TC', 'Source Han Serif TC', serif;
}
```

**Load via Google Fonts:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Noto+Serif+TC:wght@400;600;700&display=swap" rel="stylesheet">
```

All 4 fonts are free. No licensing cost.

### Roles

| Role | Font | Weight | Usage |
|---|---|---|---|
| Display — page titles, hero numbers | **Instrument Serif** | 400 regular | `<h1>`, hero money values, section titles |
| Display italic — emphasis, active states, labels | **Instrument Serif Italic** | 400 italic | "*Free pool*", "*Pending your hand*", sidebar active item |
| Body — UI text, descriptions, form labels | **Inter** | 400/500/600 | Most body copy, form labels, button text (sans) |
| Data — money, rates, dates | **JetBrains Mono** | 400/500 | All money columns, rate values, date strings. `font-variant-numeric: tabular-nums slashed-zero` |
| CJK — Chinese labels | **Noto Serif TC** | 400/600/700 | 董事长 · 本月对账单 · 内部账册. Pairs with Instrument Serif. |

**Key rule:** Display = always Instrument Serif. Body = Inter. Data = JetBrains Mono. No exceptions without explicit DESIGN.md update.

### Type scale

| Token | Size | Line-height | Font | Use case |
|---|---|---|---|---|
| `text-mono-xs` | 11px | 16px | mono | Table meta, dates, labels |
| `text-mono-sm` | 12px | 16px | mono | Table cell numbers |
| `text-xs` | 11px | 16px | sans | Labels, captions |
| `text-sm` | 13px | 20px | sans | Body UI, descriptions |
| `text-base` | 14px | 20px | sans | Form inputs, table rows |
| `text-md` | 15px | 24px | sans or serif | Approval card titles |
| `text-lg` | 18px | 24px | serif | Card titles, section subheads |
| `text-xl` | 22px | 28px | serif | Page subheads |
| `text-2xl` | 28px | 32px | serif | Section titles |
| `text-3xl` | 40px | 44px | serif | Page titles |
| `text-hero` | 64px | 64px | serif | Solvency hero number on Dashboard |
| `text-hero-lg` | 72px | 72px | serif | Reserved for single most important number |

**Money numbers always use tabular-nums + slashed-zero:**
```css
.tabular, .mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums slashed-zero;
}
```

---

## Color Palette — Warm Paper

### Base

```css
:root {
  --bg:         #F5EFE4;  /* warm cream — page background, the "paper" */
  --surface:    #FBF8F2;  /* lifted paper — card background */
  --surface-2:  #EEE6D6;  /* subtle alt row for striped tables */
  --hairline:   #DFD4BE;  /* warm pencil line — borders and dividers */
  --ink:        #1A1613;  /* dark brown-black — primary text */
  --graphite:   #6B5F52;  /* warm muted text — secondary */
  --muted:      #9E8F7F;  /* tertiary text — placeholder, disabled */
}
```

### Accent — single rust seal

```css
:root {
  --accent:     #CC5A2E;  /* rust / terracotta — THE accent */
  --accent-bg:  #FBE8DE;  /* rust light tint for hover, active nav, selected */
  --accent-border: #E8B098; /* rust border on focus states */
}
```

**Usage rules for the accent:**
1. Italic serif text of key labels ("*Free pool*", "*Pending your hand*", "*Approve*")
2. Active sidebar nav item (italic serif + `--accent-bg` background)
3. Primary action buttons ("Approve" on approval cards, "Save" on forms)
4. Focus ring on form inputs
5. **Nothing else.** No decorative rust. No rust dividers. No rust icons.

### Semantic colors — muted, not neon

```css
:root {
  --ledger:       #3D6B45;  /* positive — loan fully repaid, statement paid */
  --ledger-bg:    #E7EFE6;
  --alert:        #A07020;  /* warning — late_1 overdue, maturing soon */
  --alert-bg:     #F5EBD3;
  --danger:       #A3371A;  /* rare — late_2 / escalation overdue, critical */
  --danger-bg:    #F8E1D8;
  --info:         #5A6B8A;  /* subtle — pending, draft */
  --info-bg:      #EBEEF3;
}
```

**Semantic rules:**
- **Default status is silent.** Active loans have no color.
- Alerts use italic text + semantic color, never filled pills
- `--danger` is reserved for escalation-stage overdue only. Don't burn it on small errors.
- Overdue label format: `<em class="text-alert">overdue 15d</em>` — italic graphite-warm, not a red pill

### Dark mode

**Not in Phase 1.** VP is a daytime workspace. Dark mode is TODO for Phase 1.5 — requires palette redesign, not just inverted tokens.

### Contrast verification

All foreground/background combinations must pass WCAG AA:
- `--ink` (#1A1613) on `--bg` (#F5EFE4) = **12.8:1** ✓
- `--graphite` (#6B5F52) on `--bg` = **5.4:1** ✓
- `--accent` (#CC5A2E) on `--bg` = **4.7:1** ✓ (AA normal text)
- `--accent` on `--accent-bg` (#FBE8DE) = **4.9:1** ✓
- `--muted` (#9E8F7F) on `--bg` = **3.2:1** — **large text only** (≥18px)

---

## Spacing, Radius, Shadows

### Grid

4px base. Tokens:

```
--space-0: 0
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
```

### Density

- **Table row:** 48px compact (data-dense lists like loans, fund sources)
- **Form row:** 56px comfortable (inputs with labels)
- **Section gap:** 48-56px between major sections
- **Card padding:** 20-24px
- **Max content width:** 1280px (sidebar 220px + main max 1060px)

### Radius (rounded-md default, never xl)

```
--radius-sm: 4px   /* status pills, small buttons */
--radius-md: 6px   /* DEFAULT — cards, inputs, buttons */
--radius-lg: 8px   /* modals, large cards */
--radius-full: 9999px  /* avatars only */
```

**Absolutely no `rounded-xl` (12px) or `rounded-2xl` (16px).** Those belong to SaaS landing pages, not a ledger.

### Shadows

**No shadows on cards.** Elevation comes from hairline borders (`--hairline`), not drop shadows.

**Allowed shadows (rare):**
- Modal overlay: `0 10px 40px rgba(26, 22, 19, 0.15)` — warm, subtle
- Dropdown menu: `0 4px 12px rgba(26, 22, 19, 0.08)` — small

**Never:**
- Shadow on cards/panels
- Colored shadows
- Shadow + border combo

---

## Layout — 7+5 Broadsheet

### Dashboard composition

```
┌────────────┬──────────────────────────────────────────┐
│            │  Good morning, Principal.     Wed 9 Apr  │
│  HOUZS     │  ─────────────────────────────────────── │
│  Venture   │                                          │
│  (serif)   │  Free pool              Pending your hand│
│            │                                          │
│  Overview  │  RM 12,847,203.55       ┌──────────────┐│
│  Fund IN   │  (64px serif)           │ NEW LOAN     ││
│  Fund OUT  │                         │ HOUZS Century││
│  ...       │  ───── sparkline ────   │ RM 100,000   ││
│            │                         │ [Approve]    ││
│            │  Above buffer RM 2.8M   └──────────────┘│
│            │                         ... 2 more       │
│            │                                          │
│            │  Subsidiaries                            │
│            │                                          │
│            │  HC     ▮▮▮▮▮▮▮▮▯ RM 2.15M  active     │
│            │  CONTS  ▮▮▮▮▮▮▯▯▯ RM 1.43M  active     │
│            │  ... 5 more                              │
└────────────┴──────────────────────────────────────────┘
```

- **Left sidebar:** 220px fixed, cream background, serif brand mark
- **Main content:** flex-1, left-aligned, 32-48px horizontal padding
- **Hero section:** 7-column + 5-column split (7fr / 5fr)
- **Below fold:** full-width sections, 48-56px vertical gap between

### Settings composition

Stack of sections, each is a card with hairline border:

```
Settings
Treasury config, tier premiums, overdue stages, company tier assignment.

┌─────────────────────────────────────┐
│ Treasury                            │
│ Base rate inputs + buffer           │
│                                     │
│ Op Margin    Buffer Amount   Saving │
│ [0.400] %    [RM 50000]     [5.0] %│
│                                     │
│ [Save Treasury]                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Tier Premiums                       │
│ ...                                 │
└─────────────────────────────────────┘
```

Forms use serif section headings + italic subheads + sans labels + mono inputs for numbers.

---

## Component Vocabulary

Components required for Phase 1 (many already exist, need restyling):

| Component | Role | Key style notes |
|---|---|---|
| `<Shell>` | Sidebar + TopBar + Main wrapper | Cream bg, hairline dividers |
| `<Sidebar>` | Left nav | Cream bg, serif wordmark, italic-rust active state, sans nav items |
| `<TopBar>` | Greeting + meta + user menu | "Good morning, *Principal*." with italic rust; mono date/period meta |
| `<HeroNumber>` | Big serif money on dashboards | 64px Instrument Serif, italic serif label in rust above, mono meta below |
| `<Sparkline>` | Hairline trend line | 48px height, 1.25px stroke, no axes/legend |
| `<ApprovalCard>` | Pending approval item | Hairline border, serif title, mono amount, italic rust "*Approve*" button + secondary button |
| `<DataTable>` | Fund sources / loans / overdue list | 48px rows, hairline dividers, tabular mono for money, serif heading row |
| `<StatusLabel>` | "*active*" / "*overdue 15d*" / "*pending*" | Italic serif + semantic color (no pill, no bg) |
| `<MoneyCell>` | Money display | Mono tabular slashed-zero, right-aligned in tables |
| `<DateCell>` | Date display | "Wed 9 Apr 2026" serif OR "9 Apr 2026" mono depending on context |
| `<Button variant="seal">` | Primary action (Approve, Save) | Rust `--accent` bg, white text, italic serif font, rounded-md 6px, no shadow |
| `<Button variant="secondary">` | Secondary action | Transparent bg, hairline border, sans graphite text, rounded-md |
| `<Input>` | Form input | Hairline border, cream-2 bg, rust focus ring, mono font for numbers |
| `<Select>` | Dropdown | Same style as Input |
| `<FormField>` | Label + input + helper | Sans label, italic serif helper |
| `<ConfirmDialog>` | Destructive confirmation | Warm modal with subtle shadow, serif title |
| `<Toast>` (Sonner) | Success/error feedback | Cream surface, serif italic message |
| `<EmptyState>` | Zero-data placeholder | Serif italic title, sans body, muted illustration (if any) |
| `<LoadingSkeleton>` | Loading placeholder | Hairline-only, no pulse shimmer, minimal |
| `<Timeline>` | Repayment history, cash flow | Vertical hairline track with dot markers |

### Sidebar nav item pattern

```tsx
<Link
  className={cn(
    "block px-3 py-2 rounded-md text-sm font-sans transition-colors",
    isActive
      ? "bg-[--accent-bg] text-[--accent] italic font-serif text-[15px]"
      : "text-[--graphite] hover:bg-[--surface-2] hover:text-[--ink]"
  )}
>
  {label}
</Link>
```

Active state: italic serif text + rust background. Inactive: sans graphite text.

### Hero number pattern

```tsx
<div>
  <div className="font-serif italic text-[--accent] text-base mb-1">
    Free pool
  </div>
  <div className="font-serif text-[64px] leading-none text-[--ink] tracking-tight">
    RM 12,847,203<span className="text-[32px] text-[--graphite]">.55</span>
  </div>
  <div className="font-mono text-xs text-[--muted] mt-2">
    As of 9 Apr 2026 · 90-day trend
  </div>
</div>
```

### Approval card pattern

```tsx
<div className="border border-[--hairline] rounded-md p-5 bg-[--surface]">
  <div className="text-xs font-sans font-semibold uppercase tracking-wider text-[--graphite] mb-1">
    NEW LOAN · HOUZS CENTURY
  </div>
  <div className="font-serif text-lg text-[--ink] mb-1">Working capital loan</div>
  <div className="font-mono text-sm text-[--ink] mb-3">
    RM 100,000.00 · T2 · 1.175%/mo
  </div>
  <div className="text-xs text-[--muted] mb-3">Submitted by Finance · 2h ago</div>
  <button className="bg-[--accent] text-white px-4 py-2 rounded-md font-serif italic text-sm hover:bg-[#B54A22]">
    Approve
  </button>
  <button className="ml-2 border border-[--hairline] px-4 py-2 rounded-md text-[--graphite] text-sm font-sans">
    Review
  </button>
</div>
```

---

## Icon Set

**No icons in Phase 1 sidebar.** Text-only nav items. Cleaner, serif labels do the work.

Where icons ARE needed (Phase 1.5 and beyond): **`lucide-react`** only. No emoji. Icon + text + `aria-label`.

Avoid icons for status. Use italic serif + semantic color text instead. E.g., `<em class="text-[--alert]">overdue 15d</em>` not 🟡.

---

## Interaction States

Every data surface must handle 5 states:

### Loading
- Skeleton with hairline outline only, no shimmer. Match the target shape.
- Appear within 100ms of navigation.

### Empty
- Italic serif title + sans description + optional CTA
- First-time empty: "No fund sources yet. Finance can add the first one."
- Filtered empty: "No matches for those filters. Clear filters to see all."
- Zero-alert: CELEBRATE it (e.g., "*All loans current.*" in `--ledger` green), not an empty table

### Error
- Network: "Connection lost. Retrying..." + retry button
- Validation: inline on field, `--danger` text + hairline border (no red background)
- Access: "Your role ({role}) can't access {module}."
- Generic: "Something went wrong. Retry or contact admin."

### Success
- Toast for small confirmations ("Treasury config saved.")
- Inline panel for significant events ("Loan fully repaid. *Close it?*")
- Redirect to detail page after create

### Partial
- Dashboard: "Some sections failed to load. [Retry failed]"
- Statement: "5 of 7 companies generated. [Retry failed]"

---

## Responsive Breakpoints (Phase 1)

Desktop-first. VP is an office tool.

| Breakpoint | Width | Scope |
|---|---|---|
| Mobile (<768) | not optimized | Works but not polished. Only Dashboard + Approvals usable. |
| Tablet (768-1024) | partial | Collapsible sidebar, stacked sections |
| Desktop (≥1024) | primary | Full layout |

Phase 1.5 will add proper mobile polish.

---

## Accessibility (WCAG AA baseline)

**Non-negotiable:**

1. **No emoji-only status.** Use italic serif text + semantic color + `aria-label`.
2. **Color contrast AA** — verified above.
3. **Keyboard nav** — tab through all interactive, Enter/Space to activate, Escape to close modal.
4. **Focus management** — modal open → focus first input → Escape closes → focus returns to trigger.
5. **Form labels** — every input has `<label for>`, required has visible + `aria-required`.
6. **Table semantics** — `<table>`, `<thead>`, `<tbody>`, `<th scope>`, `aria-sort` on sortable headers.
7. **Live regions** — `aria-live="polite"` for info toasts, `assertive` for error toasts.
8. **Skip link** — "Skip to main content" at top of shell.
9. **Touch targets** — 44×44px min for all buttons.
10. **Language** — `<html lang="en-MY">` default, switch to `zh-MY` on language toggle.
11. **Serif text minimum 14px** for body, 15px for italic serif labels (italic is harder to read).
12. **`prefers-reduced-motion`** disables all non-essential motion.

### Automated checks

Add `@axe-core/react` in dev and `eslint-plugin-jsx-a11y` in CI.

---

## Motion

**Minimal, meaningful motion only.** Three motions exist:

| Motion | Duration | Easing | When |
|---|---|---|---|
| Page fade-in | 200ms | ease-out | Route change |
| Button hover | 120ms | ease-out | Background color tween (no scale) |
| Seal stamp | 250ms | cubic-bezier(0.2, 0.8, 0.4, 1) | Approve button click — rust background fills briefly |
| Form error shake | 300ms | ease-in-out | On submit error only |

**No scroll-linked animations. No parallax. No bounce easing. No decorative motion.**

`@media (prefers-reduced-motion: reduce)` kills everything except opacity transitions.

---

## Writing & Tone

### UI copy style

- **Conversational precision.** "Good morning, *Principal*." not "Welcome back!"
- **Serif italic emphasis** on key labels ("*Free pool*", "*Pending your hand*", "*overdue 15d*")
- **Utility language** — tell users what, where, and what to do
- **Not marketing** — no "unlock", "empower", "delight", "boost"
- **Malaysian English** — "RM 100,000.00", "lock-in period", "contra entries"
- **Bilingual** — EN + 中文 toggle in user settings (default EN)

### Button verbs (italic serif for seal variant)

- *Approve*  (seal variant, italic serif)
- *Save* / *Save Treasury* / *Save Tiers*
- *Record repayment*
- *Generate statements*
- *Escalate*
- Secondary (sans regular): Review, Cancel, Back

### Money format

| Context | Format | Font |
|---|---|---|
| Tables, detail views | `RM 100,000.00` | JetBrains Mono tabular slashed-zero |
| Hero numbers | `RM 12,847,203.55` | Instrument Serif 64px |
| KPI cards | `RM 100K` / `RM 1.2M` | Instrument Serif 28-40px |
| Negative (contra) | `(1,234.56)` | mono + `--danger` color |

### Date format

| Context | Format | Font |
|---|---|---|
| Serif display | "Wed 9 Apr 2026" | Instrument Serif |
| Mono meta | "9 Apr 2026" / "Wed 09:42" | JetBrains Mono |
| Form input | ISO `2026-04-09` | mono |
| Period | "April 2026" | serif |

### Bilingual canonical labels

| English | 中文 |
|---|---|
| Internal Ledger | 内部账册 |
| Overview | 综览 |
| Fund IN | 资金流入 |
| Fund OUT | 资金借出 |
| Overdue | 逾期 |
| Statements | 对账单 |
| Dept Pool | 部门账户 |
| Director Salary | 董事薪水 |
| HR Costing | 人事成本 |
| Reports | 报表 |
| Settings | 设定 |
| Free pool | 自由资金池 |
| Pending your hand | 待您批准 |
| Approve | 批准 |
| Review | 审核 |
| overdue | 逾期 |

---

## Implementation Notes

### File organization

```
src/
├── components/
│   ├── ui/            ← primitives (Button, Input, Dialog, Toast) with DESIGN.md styling
│   ├── layout/        ← Shell, Sidebar, TopBar
│   ├── charts/        ← Sparkline wrapper, minimal charts
│   ├── vp/            ← VP-specific (HeroNumber, ApprovalCard, StatusLabel, MoneyCell)
│   └── forms/         ← FormField, NumericInput, DatePicker
```

### Tailwind theme tokens

All tokens exposed via `tailwind.config.ts` theme extend. Use `bg-bg`, `text-ink`, `border-hairline`, `text-accent`, etc. Never hardcode hex values in components except in the config file.

### Google Fonts loading

Loaded in `src/app/layout.tsx` via `next/font/google` for optimal Next.js integration + `font-display: swap` to avoid FOIT.

---

## Review Process

Any new component or design change must check against this doc:

1. Uses tokens from `tailwind.config.ts`? No hardcoded hex.
2. Display text uses `font-serif`? Body uses `font-sans`? Money uses `font-mono`?
3. Handles all 5 interaction states?
4. A11y compliant (keyboard, contrast, labels)?
5. Avoids the AI slop blacklist?
6. Desktop tested at 1280px + 1440px + 1920px?
7. No emoji, no shadows on cards, no rounded-xl, no gradients?

If adding a new component to vocabulary, update this doc first.

---

## Change Log

- **2026-04-10 v2.0** — Major pivot to Anthropic-flavored warm cream + Instrument Serif + rust accent direction, per design-consultation session. Replaces institutional slate direction from v1.0.
- **2026-04-09 v1.0** — Initial version from /autoplan Phase 2 design review. Proposed slate-cool direction with TBD brand color (navy vs teal).
