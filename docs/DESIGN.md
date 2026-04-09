# DESIGN.md — HOUZS Venture Portal

**Last updated:** 2026-04-09
**Maintained by:** HOUZS Venture Portal team
**Status:** v1.0 (Phase 1 — Treasury Core)

---

## 设计定位

HOUZS Venture Portal (VP) 是 HOUZS Venture Sdn Bhd 的内部银行系统，不是 marketing site，不是 SaaS 产品。用户是 Principal、Finance、HR、Dept Manager —— 都是内部 staff，每天都要在里面处理真金白银。

**美学方向：institutional calm**（机构型冷静感）
- 马来西亚老牌银行 portal 的严肃感，不是 SaaS 的活泼感
- 密而不乱，数据优先，装饰最少
- 每个元素都要 earn its existence —— 没用的 card、icon、shadow 都 cut 掉
- Principal 扫一眼 10 秒要能看到"有没有问题"，不是看一堆 chart

**不要做的**（AI slop 黑名单）：
- Purple/violet gradient 背景、蓝紫渐变
- 3-column feature grid (icon circle + bold title + 2-line description × 3)
- Icons in colored circles as decoration
- Centered everything
- Uniform rounded-xl on everything
- Decorative blobs, floating circles, wavy SVG dividers
- Emoji as design elements (绝对禁止 🟢🟡🔴⚠️ 这类用法)
- Colored left-border on cards
- Generic hero copy ("Welcome to...", "Unlock the power of...")

---

## Typography

### Font stack

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace;
  --font-cn: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
```

**规则：**
- `Inter` for all UI text — 必须明确 declare，不要 fallback 到 system-ui default
- `IBM Plex Mono` for 所有 money values 和 table numeric columns — 用 tabular numerals，列对齐
- `Noto Sans SC` fallback for Chinese content (Phase 1 spec 用 bilingual labels)
- 绝对不用 Arial, Roboto, Helvetica, system default stack

### Type scale

| Token | Size | Line-height | Weight | Use case |
|---|---|---|---|---|
| `text-xs` | 11px | 16px | 500 | Chart axis labels, table meta |
| `text-sm` | 12px | 16px | 500 | Table cell numbers, helper text |
| `text-base` | 13px | 20px | 400 | Body UI text, table rows |
| `text-md` | 14px | 20px | 500 | Labels, form inputs |
| `text-lg` | 16px | 24px | 600 | Section headers |
| `text-xl` | 18px | 24px | 600 | Card titles |
| `text-2xl` | 22px | 28px | 600 | Page titles |
| `text-3xl` | 28px | 32px | 700 | Hero numbers (KPI cards) |
| `text-hero` | 48px | 52px | 700 | Solvency gauge number |

**Numbers always use tabular-nums:**
```css
.font-mono, .tabular {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

---

## Color palette

**Principle:** slate base + one brand accent + muted semantic colors. 禁止 rainbow tier colors, 禁止 neon, 禁止 gradient.

### Base (neutral)

```css
:root {
  --bg:          #FFFFFF;   /* page background */
  --surface:     #F8FAFC;   /* card background */
  --surface-2:   #F1F5F9;   /* elevated surface */
  --border:      #E2E8F0;   /* 1px dividers */
  --border-hover:#CBD5E1;   /* hover state */
  --text:        #0F172A;   /* primary text */
  --text-2:      #475569;   /* secondary text */
  --text-3:      #64748B;   /* muted text */
  --text-4:      #94A3B8;   /* disabled text, placeholder */
}
```

### Brand

**Primary (TBD — Principal's call, 两个选项 preview 后决定)：**

Option A — Deep Navy (推荐)：
```css
--brand:         #1E3A8A;   /* primary, CTAs */
--brand-hover:   #1E40AF;
--brand-bg:      #EFF6FF;   /* very light tint for selected state */
```

Option B — Deep Teal：
```css
--brand:         #0F766E;
--brand-hover:   #115E59;
--brand-bg:      #F0FDFA;
```

Pick one in Phase 1 launch. Don't use both.

### Semantic (muted, not neon)

```css
:root {
  /* Success — loan active, statement paid, all clear */
  --success:     #15803D;
  --success-bg:  #DCFCE7;
  --success-border: #86EFAC;

  /* Warning — overdue stage 1/2, close to buffer, maturity soon */
  --warning:     #B45309;
  --warning-bg:  #FEF3C7;
  --warning-border: #FCD34D;

  /* Danger — overdue escalation, buffer breach, critical alert */
  --danger:      #B91C1C;
  --danger-bg:   #FEE2E2;
  --danger-border: #FCA5A5;

  /* Info — pending approval, draft, neutral notices */
  --info:        #1D4ED8;
  --info-bg:     #DBEAFE;
  --info-border: #93C5FD;
}
```

**Contrast：** 所有组合必须 pass WCAG AA (4.5:1 for normal text, 3:1 for large text). CI 里用 `@axe-core/react` check.

### Money number colors

```css
/* Positive (income, paid) */
.money-positive { color: var(--text); }

/* Negative (expense, contra, overdue) */
.money-negative { color: var(--danger); }
/* With parentheses: (1,234.56) — Malaysian accounting convention */

/* Muted (zero, inactive) */
.money-muted { color: var(--text-3); }
```

---

## Spacing & density

### Grid base

```css
:root {
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### Density rules

- **Table row height:** 40px compact (data-dense)，56px comfortable (forms)
- **Card padding:** 20px
- **Section gap:** 24px
- **Max content width:** 1440px (sidebar + main = 1600px max)
- **Form field gap:** 16px
- **Button padding:** 8px 16px (sm), 10px 20px (md), 12px 24px (lg)

### Border-radius

```css
:root {
  --radius-sm: 4px;   /* badges, small buttons */
  --radius-md: 6px;   /* cards, inputs, buttons (default) */
  --radius-lg: 8px;   /* modals, large cards */
  --radius-full: 9999px; /* avatars only */
}
```

**绝对不用** `rounded-xl` (12px), `rounded-2xl` (16px) 之类 —— 太 SaaS-y。

### Shadows

```css
:root {
  --shadow-sm: 0 1px 2px 0 rgba(15, 23, 42, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.05);
}
```

**规则：**
- Cards: `shadow-sm` only (or nothing — border enough)
- Modals: `shadow-md` 配 overlay
- **Never** `shadow-lg`, `shadow-xl`, `shadow-2xl`
- **Never** colored shadows

---

## Icon set

**Library:** `lucide-react` ONLY. 没有 exception。

**规则：**
- No emoji in UI anywhere（除了 user-generated content 例如 notes 里用户自己打的）
- Status 用 `<StatusBadge icon label tone>` component, 不要直接用 icon
- Icon size default 16px，inline with text 用 14px，large display 20px
- Stroke width 2px (lucide default)

**Status icon mapping（替代 emoji）：**

| 旧（emoji） | 新（lucide） | Tone |
|---|---|---|
| 🟢 Active | `<CheckCircle2 />` | success |
| 🟡 Late 1 | `<AlertCircle />` | warning |
| 🟡 Warning | `<AlertTriangle />` | warning |
| 🔴 Late 2 | `<AlertOctagon />` | danger |
| 🔴 Escalation | `<OctagonAlert />` | danger |
| ⚠️ Alert | `<AlertTriangle />` | warning/danger |
| ⏳ Pending | `<Clock />` | info |
| ✅ Approved | `<CheckCircle2 />` | success |
| ❌ Rejected | `<XCircle />` | danger |
| ⓘ Info | `<Info />` | info |

---

## Component vocabulary (Phase 1 required)

下面这些 component 必须 build first，**在任何 module code 之前**。它们是整个 Phase 1 的 foundation。

### Primitives (shadcn/ui base)

- `<Button>` — primary / secondary / outline / ghost / danger variants
- `<Input>` — text, with optional prefix/suffix slot
- `<NumericInput>` — auto-thousands, RM/% prefix, decimal control
- `<Select>` — searchable dropdown
- `<DatePicker>` — single + range
- `<Checkbox>` / `<Radio>` / `<Switch>`
- `<Label>` — with required indicator
- `<FormField>` — label + input + error + helper text
- `<Dialog>` / `<Drawer>`
- `<Toast>` (via Sonner) — success / error / info / warning
- `<Tooltip>`
- `<Popover>`
- `<Tabs>`

### VP-specific components (build these first)

- **`<StatCard>`** — KPI number card (Total Pool, Free Cash, Net Spread)
  - Props: label, value, trend?, tone?, icon?
  - Uses IBM Plex Mono for value

- **`<SolvencyGauge>`** ← Dashboard hero
  - Free Cash vs Buffer as gauge + delta
  - 最大、最醒目的 component on dashboard
  - State: safe (green), warning (amber), breach (red)

- **`<DataTable>`**
  - Built on TanStack Table v8
  - Sortable columns, filtering, pagination (25/page default)
  - Row height 40px compact
  - First column usually status, right-aligned money columns

- **`<StatusBadge>`** ← replaces all emoji status indicators
  - Props: `tone`, `icon`, `label`
  - Tones: `success | warning | danger | info | neutral`
  - Format: small pill with icon + text, 12px font
  - Has `aria-label` for screen readers

- **`<MoneyCell>`**
  - Right-aligned, IBM Plex Mono, tabular-nums
  - Format: `RM 100,000.00` full, `RM 100K` abbreviated (KPI cards only)
  - Negative in parentheses: `(1,234.56)` in danger color
  - Props: `amount`, `abbreviate?`, `currency?` (default MYR)

- **`<PercentCell>`**
  - 3 decimal places: `1.175%`
  - Append `/mo` for monthly rates
  - Tabular-nums

- **`<DateCell>`**
  - Format: `15 Apr 2025` (DD MMM YYYY)
  - ISO for machine / forms

- **`<EmptyState>`**
  - Props: `icon`, `title`, `description`, `primaryAction?`, `secondaryAction?`
  - Used on every list, dashboard chart, approval queue
  - 文字必须友善：不是 "No data"，而是 "还没有 fund source —— Finance 可以新增一个开始"

- **`<LoadingSkeleton>`**
  - Variants: `card | table | chart | form`
  - 避免 spinner，用 skeleton shape

- **`<ErrorState>`**
  - Variants: `network | validation | access | generic`
  - Props: `onRetry`, `message`
  - 必须告诉用户：发生什么、为什么、下一步做什么

- **`<ConfirmDialog>`**
  - 用于所有 destructive action (approve loan, reject, escalate, mark paid, generate statements)
  - Props: `title`, `description`, `confirmText`, `cancelText`, `variant` (`danger | warning | default`)
  - 对于 high-risk action (e.g., escalate)：require type-to-confirm or dropdown reason

- **`<PageHeader>`**
  - Title + breadcrumb + primary action button
  - Consistent across all pages

- **`<Sidebar>`** — role-aware navigation
  - Items show/hide based on user role
  - Active state + hover state + collapsed state

- **`<TopBar>`**
  - Right: notification bell (Principal only for Phase 1), user menu, logout
  - Notification bell with badge count

- **`<NotificationBell>`**
  - For Principal: pending approvals count
  - Polls every 30s OR uses Supabase realtime subscription

- **`<Timeline>`**
  - For loan repayment history, cash flow timeline
  - Vertical, with date + event + amount

- **`<ChartCard>`**
  - Wraps Recharts with consistent header, loading state, empty state

---

## Chart theme (Recharts)

```typescript
export const chartTheme = {
  colors: {
    primary: 'var(--brand)',
    grid: 'var(--border)',
    axis: 'var(--text-3)',
    tooltip: {
      bg: 'var(--bg)',
      border: 'var(--border)',
      text: 'var(--text)',
    },
  },
  fontFamily: 'Inter, sans-serif',
  fontSize: 11,
  grid: { opacity: 0.5 },
  // NO gradients, NO 3D, NO drop-shadows on bars/lines
};
```

**规则：**
- Flat fills only
- Bars: brand color or semantic (success/warning/danger)
- Lines: 2px stroke, rounded caps, no gradient
- No animations beyond subtle entrance (300ms ease-out)
- Tooltips: white bg, shadow-sm, Inter 12px, tabular-nums for numbers
- Axis labels: Inter 11px, `text-3` color
- Grid lines: `border` color at 50% opacity

---

## Interaction states (loading / empty / error / success / partial)

**每个 data surface 都必须 handle 5 个 states。** 不允许"只有 happy path"。

### Loading
- Use `<LoadingSkeleton>` matching the target component's shape
- No spinners except for inline actions (button loading)
- Target: skeleton visible within 100ms of navigation

### Empty
- First-time empty: onboarding CTA ("还没有 loan —— Finance 可以 create 第一个")
- Filtered empty: clear filter CTA ("没找到 match —— 试试 clear filters")
- Zero-alert: celebrate it ("All loans current ✓" in success tone) — **不要** show an empty table

### Error
- **Network:** "Connection lost. Retrying..." + retry button
- **Validation:** inline on field, red text + border, `aria-invalid`
- **Access (403):** "Your role ({role}) can't access {module}. Contact Principal if this is wrong." + link to role-appropriate page
- **Generic (500):** "Something went wrong. The team has been notified." + retry + contact link

### Success
- Toast for quick confirmation ("Loan submitted for approval")
- Inline panel for significant events ("Loan fully repaid — close it?")
- Redirect to detail page after create

### Partial
- Dashboard: "Some widgets failed to load. [Retry failed widgets]"
- Statement: "5 of 7 companies generated. [Retry failed]"

---

## Responsive breakpoints

```css
/* Tailwind default breakpoints */
sm: 640px   /* phone landscape, small tablet */
md: 768px   /* tablet */
lg: 1024px  /* small laptop */
xl: 1280px  /* laptop */
2xl: 1536px /* desktop */
```

### Phase 1 responsive scope

| Module | Mobile (<768) | Tablet (768-1024) | Desktop (≥1024) |
|---|---|---|---|
| Login | ✅ centered card | ✅ | ✅ |
| Dashboard | ✅ stack priority: Solvency hero → Approval Queue → Alerts → KPI 2x2. Hide waterfall + trend charts | ✅ collapsible sidebar | ✅ full layout |
| Fund IN list | ⚠️ horizontal scroll | ✅ | ✅ |
| Fund IN create | ❌ desktop-only | ✅ | ✅ |
| Fund OUT list | ⚠️ horizontal scroll | ✅ | ✅ |
| Fund OUT create | ❌ desktop-only | ✅ | ✅ |
| Loan detail | ⚠️ stacked sections | ✅ | ✅ |
| Record repayment | ✅ simple form | ✅ | ✅ |
| Base Rate Calculator | ❌ | ❌ desktop-only | ✅ |
| Overdue | ⚠️ key numbers + list, hide chart | ✅ | ✅ |
| Statement list | ⚠️ scroll table | ✅ | ✅ |
| Statement detail | ⚠️ stacked | ✅ | ✅ |
| Settings | ❌ desktop-only | ❌ | ✅ |
| Approvals | ✅ critical for Principal on the go | ✅ | ✅ |

**Phase 1 priority：** Dashboard + Approvals mobile-optimized。其他 desktop-first，mobile 能看但不是 polished。Phase 1.5 再做 full mobile polish.

---

## Accessibility (WCAG AA baseline)

**非 negotiable：**

1. **No emoji-only status indicators** — 用 icon + text + color + `aria-label`
2. **Color contrast AA** — 4.5:1 normal text, 3:1 large text
3. **Keyboard nav** — tab through all interactive elements, Enter/Space to activate, Escape to close modal
4. **Focus management** — modal open → focus first input → Escape closes → focus returns to trigger
5. **Form labels** — every input has `<label for>`, required fields have visible indicator + `aria-required`
6. **Table semantics** — `<table>`, `<thead>`, `<tbody>`, `<th scope>`, `aria-sort` on sortable headers
7. **Live regions** — `aria-live="polite"` for info toasts, `assertive` for error toasts
8. **Skip link** — "Skip to main content" 给 keyboard users
9. **Touch targets** — min 44x44px for buttons
10. **Language attribute** — `<html lang="en-MY">` default, `zh-MY` 当 user switch 到中文

### Automated checks

```bash
# Add to devDependencies:
# @axe-core/react — runtime a11y check in dev
# eslint-plugin-jsx-a11y — compile-time checks
npm install -D @axe-core/react eslint-plugin-jsx-a11y
```

CI job 会 run `vitest` + `axe` — fail the build on a11y violations.

---

## Motion

**Principle：minimal motion, max purpose.** 不要装饰性动画，只用来 communicate state change。

### Allowed

- **Fade-in on mount** — 200ms ease-out，新出现的 toast, modal, page
- **Slide-in for drawers** — 250ms ease-out
- **Skeleton pulse** — loading state
- **Button press** — 100ms scale down to 0.98
- **Form error shake** — subtle, only on submit error

### Not allowed

- Decorative scroll-linked animations
- Parallax
- Auto-playing carousels
- Background particle effects, floating blobs
- Bounce / elastic easing
- Anything longer than 300ms

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    transition-duration: 0ms !important;
  }
}
```

---

## Writing & tone

### UI copy rules

- **Utility language** — 告诉 user 在哪、发生什么、可以做什么
- **Not mood/marketing** — 禁止 "Empower your workflow", "Unlock insights"
- **Malaysian English** — "RM 100,000.00"，"Lock-in period"，"Contra"
- **Bilingual OK** — 如果 user 偏好中文，toggle 整套 copy

### Common labels (canonical)

| English | 中文 |
|---|---|
| Dashboard | 仪表板 |
| Fund IN | 资金流入 |
| Fund OUT | 资金借出 |
| Loan | 贷款 |
| Repayment | 还款 |
| Overdue | 逾期 |
| Statement | 对账单 |
| Invoice | 账单 |
| Contra | 冲销 |
| Net Amount | 净额 |
| Outstanding | 未偿 |
| Principal | 本金 |
| Interest | 利息 |
| Penalty | 罚息 |
| Approve | 批准 |
| Reject | 拒绝 |
| Pending | 待批 |
| Active | 活跃 |
| Escalate | 升级处理 |

### Button labels

- Verbs always: "Submit", "Approve", "Generate", "Record repayment"
- Not nouns: ❌ "Submission", "Approval"
- Destructive: explicit — "Delete loan" not "Delete"
- Confirmation: echo the action — "Yes, approve this loan" not "OK"

### Money format

| Context | Format |
|---|---|
| Tables, details | `RM 100,000.00` |
| KPI cards | `RM 100K` / `RM 1.2M` |
| Negative (contra, overdue) | `(1,234.56)` in danger color |
| Percentages | `1.175%`, with `/mo` for monthly |

### Date format

| Context | Format |
|---|---|
| Display | `15 Apr 2025` |
| Form input | ISO `2025-04-15` |
| Period | `April 2025` in dropdowns |
| Timeline | `Apr 15` short |

---

## Directory / file organization

```
src/
├── components/
│   ├── ui/                    ← shadcn primitives (Button, Input, Dialog, etc.)
│   ├── vp/                    ← VP-specific (StatCard, SolvencyGauge, DataTable, etc.)
│   ├── charts/                ← Recharts wrappers (<ChartCard>, themed)
│   ├── layout/                ← Sidebar, TopBar, Shell
│   └── form/                  ← Form helpers (FormField, NumericInput, etc.)
```

Component conventions:
- One component per file
- Co-locate tests: `StatCard.tsx` + `StatCard.test.tsx`
- Co-locate stories (optional): `StatCard.stories.tsx`
- Export named (no default exports)

---

## Review process

Any new component or design change must check against this doc:
1. Does it use tokens (colors, spacing, typography) from this file? No hardcoded hex.
2. Does it handle all 5 interaction states?
3. Is it a11y compliant (keyboard, screen reader, contrast)?
4. Does it avoid the AI slop blacklist?
5. Mobile + tablet + desktop tested?

If you're adding something new to the component vocabulary, update this doc first.

---

## Change log

- **2026-04-09 v1.0** — Initial version based on /autoplan Phase 1 design review. Proposed by review, to be confirmed by Principal (brand color navy vs teal is open).
