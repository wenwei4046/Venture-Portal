# Motion Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 micro-interaction motions across the portal using pure CSS + 2 small client components, zero new dependencies.

**Architecture:** All keyframes and motion classes live in `globals.css`. Pages opt-in by adding CSS classes. Two leaf client components (`SlidingTabs`, `OverdueBadge`) handle the two cases that need JS. Existing `prefers-reduced-motion` rule is extended with graded functional fallbacks.

**Tech Stack:** CSS keyframes/transitions, React 19 (useLayoutEffect, useOptimistic), Next.js 15 App Router, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-12-motion-vocabulary-design.md`

**Spec corrections (discovered during plan research):**
- Billing page has stacked sections, NOT tabs — `<SlidingTabs>` only applies to settings
- Approvals list uses card layout, not table — stagger targets `<Link>`/`<div>` children
- Forms use `useTransition + useState`, not `useFormState` — shake triggers on `error` state
- No shared `<Modal>` component exists — "modal slide-in" applies to inline confirm panels
- SettingsTabs is currently server-rendered `<Link>` elements — needs client component conversion

---

## File Map

### New files
- `src/components/motion/SlidingTabs.tsx` — ~50 lines, client component
- `src/components/motion/SlidingTabs.test.tsx` — 3 unit tests
- `src/components/motion/OverdueBadge.tsx` — ~25 lines, client component
- `src/components/motion/OverdueBadge.test.tsx` — 2 unit tests

### Modified files
- `src/app/globals.css` — +~120 lines (motion keyframes, classes, reduced-motion overrides, focus glow)
- `src/app/(portal)/fund-in/page.tsx` — add row-stagger class + --i variable
- `src/app/(portal)/fund-out/page.tsx` — add row-stagger class + --i variable
- `src/app/(portal)/overdue/page.tsx` — add row-stagger + wrap badges with `<OverdueBadge>`
- `src/app/(portal)/statements/page.tsx` — add row-stagger class + --i variable
- `src/app/(portal)/approvals/page.tsx` — add row-stagger to card containers + --i variable
- `src/app/(portal)/approvals/[id]/page.tsx` — add status-morph class to status spans
- `src/app/(portal)/settings/_components/SettingsTabs.tsx` — replace with SlidingTabs
- `src/app/(portal)/fund-in/_components/NewFundSourceForm.tsx` — add shake-once trigger
- `src/app/(portal)/fund-out/_components/NewLoanForm.tsx` — add shake-once trigger
- Inline confirm panels (EscalateButton, GenerateStatementsButton, etc.) — add confirm-slide-in class

---

## Task 1: CSS Foundation — globals.css

All motion keyframes, classes, reduced-motion overrides, and input focus glow.

**Files:**
- Modify: `src/app/globals.css` (append after existing `.card-base` rule at ~line 230)

- [ ] **Step 1: Add motion keyframes and classes**

Append this block after line 230 (after `.card-base`) in `src/app/globals.css`:

```css
/* ───────── Motion: table row stagger ───────── */
@keyframes row-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.row-stagger > tr,
.row-stagger > div,
.row-stagger > a {
  animation: row-in 280ms ease-out both;
  animation-delay: calc(var(--i, 0) * 50ms);
}

/* Cap at 12 rows — rest appear instantly */
.row-stagger > tr:nth-child(n+13),
.row-stagger > div:nth-child(n+13),
.row-stagger > a:nth-child(n+13) {
  animation: none;
  opacity: 1;
}

/* ───────── Motion: form error shake ───────── */
@keyframes shake-once {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  50% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}

.shake-once {
  animation: shake-once 360ms ease-out;
  border-color: rgb(var(--danger)) !important;
}

/* ───────── Motion: inline confirm slide-in ───────── */
@keyframes confirm-slide-in {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.confirm-slide-in {
  animation: confirm-slide-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* ───────── Motion: tab indicator slide ───────── */
.tab-indicator {
  transition: left 280ms cubic-bezier(0.4, 0, 0.2, 1),
              width 280ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ───────── Motion: status pill morph ───────── */
.status-morph {
  transition: color 480ms cubic-bezier(0.4, 0, 0.2, 1),
              background-color 480ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ───────── Motion: overdue badge pulse ───────── */
@keyframes pulse-once {
  0%   { box-shadow: 0 0 0 0 rgb(var(--alert) / 0.45); }
  50%  { box-shadow: 0 0 0 8px rgb(var(--alert) / 0); }
  100% { box-shadow: 0 0 0 0 rgb(var(--alert) / 0); }
}

.pulse-once {
  animation: pulse-once 1600ms ease-out;
}

/* ───────── Motion: input focus glow ───────── */
input:not([type="checkbox"]):not([type="radio"]):focus,
textarea:focus,
select:focus {
  border-color: rgb(var(--accent));
  box-shadow: 0 0 0 3px rgb(var(--accent) / 0.12);
  outline: none;
  transition: border-color 200ms ease-out, box-shadow 200ms ease-out;
}
```

- [ ] **Step 2: Add reduced-motion overrides for functional motions**

Update the existing `@media (prefers-reduced-motion: reduce)` block in `globals.css` (around line 119-127). Replace the block with:

```css
/* Reduced motion — graded fallback */
@media (prefers-reduced-motion: reduce) {
  /* Global: disable all decorative animation/transition */
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Functional: form shake — instant danger border, no movement */
  .shake-once {
    animation: none !important;
    border-color: rgb(var(--danger)) !important;
  }

  /* Functional: status morph — keep color transition (not motion per WCAG) */
  .status-morph {
    transition-duration: 480ms !important;
    transition-property: color, background-color !important;
  }

  /* Functional: overdue pulse — static ring, no animated spread */
  .pulse-once {
    animation: none !important;
    box-shadow: 0 0 0 1px rgb(var(--alert) / 0.4) !important;
  }
}
```

- [ ] **Step 3: Run build to verify CSS is valid**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no CSS errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(motion): CSS foundation — 7 motion keyframes + reduced-motion fallbacks"
```

---

## Task 2: SlidingTabs Component (TDD)

**Files:**
- Create: `src/components/motion/SlidingTabs.test.tsx`
- Create: `src/components/motion/SlidingTabs.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/motion/SlidingTabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlidingTabs } from './SlidingTabs'

const tabs = [
  { key: 'treasury', label: 'Treasury' },
  { key: 'tiers', label: 'Tier' },
  { key: 'overdue', label: 'Overdue' },
]

describe('SlidingTabs', () => {
  it('renders all tab items', () => {
    render(<SlidingTabs items={tabs} active="treasury" onTabChange={() => {}} />)
    expect(screen.getByText('Treasury')).toBeDefined()
    expect(screen.getByText('Tier')).toBeDefined()
    expect(screen.getByText('Overdue')).toBeDefined()
  })

  it('calls onTabChange when a tab is clicked', () => {
    const onChange = vi.fn()
    render(<SlidingTabs items={tabs} active="treasury" onTabChange={onChange} />)
    fireEvent.click(screen.getByText('Tier'))
    expect(onChange).toHaveBeenCalledWith('tiers')
  })

  it('renders the indicator bar element', () => {
    const { container } = render(
      <SlidingTabs items={tabs} active="treasury" onTabChange={() => {}} />
    )
    const bar = container.querySelector('.tab-indicator')
    expect(bar).toBeDefined()
    expect(bar).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/motion/SlidingTabs.test.tsx 2>&1`
Expected: FAIL — module not found.

- [ ] **Step 3: Write SlidingTabs implementation**

Create `src/components/motion/SlidingTabs.tsx`:

```tsx
'use client'

import { useRef, useLayoutEffect, useState, useCallback } from 'react'

export interface TabItem {
  key: string
  label: string
}

interface SlidingTabsProps {
  items: TabItem[]
  active: string
  onTabChange: (key: string) => void
}

export function SlidingTabs({ items, active, onTabChange }: SlidingTabsProps) {
  const navRef = useRef<HTMLElement>(null)
  const [barStyle, setBarStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  const measureBar = useCallback(() => {
    if (!navRef.current) return
    const activeEl = navRef.current.querySelector<HTMLElement>(`[data-tab-key="${active}"]`)
    if (activeEl) {
      setBarStyle({ left: activeEl.offsetLeft, width: activeEl.offsetWidth })
    }
  }, [active])

  useLayoutEffect(() => {
    measureBar()
  }, [measureBar])

  return (
    <nav
      ref={navRef}
      className="border-b border-hairline mb-8 flex items-end gap-6 overflow-x-auto relative"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-tab-key={item.key}
          onClick={() => onTabChange(item.key)}
          className={
            item.key === active
              ? 'font-serif italic text-accent text-base pb-3 -mb-px'
              : 'font-serif text-graphite text-base pb-3 hover:text-ink transition-colors'
          }
        >
          {item.label}
        </button>
      ))}
      <div
        className="tab-indicator absolute bottom-0 h-0.5 bg-accent"
        style={{ left: barStyle.left, width: barStyle.width }}
      />
    </nav>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/motion/SlidingTabs.test.tsx 2>&1`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/motion/SlidingTabs.tsx src/components/motion/SlidingTabs.test.tsx
git commit -m "feat(motion): SlidingTabs client component with tests"
```

---

## Task 3: OverdueBadge Component (TDD)

**Files:**
- Create: `src/components/motion/OverdueBadge.test.tsx`
- Create: `src/components/motion/OverdueBadge.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/motion/OverdueBadge.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverdueBadge } from './OverdueBadge'

beforeEach(() => {
  // Clear sessionStorage mock between tests
  globalThis.sessionStorage?.clear?.()
})

describe('OverdueBadge', () => {
  it('renders the label text', () => {
    render(<OverdueBadge id="loan-1" label="overdue 15d" />)
    expect(screen.getByText('overdue 15d')).toBeDefined()
  })

  it('applies pulse-once class for unseen IDs', () => {
    const { container } = render(<OverdueBadge id="loan-1" label="overdue 15d" />)
    const badge = container.querySelector('[data-overdue-id]')
    expect(badge?.classList.contains('pulse-once')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/motion/OverdueBadge.test.tsx 2>&1`
Expected: FAIL — module not found.

- [ ] **Step 3: Write OverdueBadge implementation**

Create `src/components/motion/OverdueBadge.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'

const STORAGE_KEY = 'vp-overdue-seen'

function getSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function markSeen(id: string) {
  try {
    const seen = getSeenIds()
    seen.add(id)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // sessionStorage unavailable (SSR, incognito) — safe to ignore
  }
}

interface OverdueBadgeProps {
  id: string
  label: string
  className?: string
}

export function OverdueBadge({ id, label, className = '' }: OverdueBadgeProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const seen = getSeenIds()
    if (!seen.has(id) && ref.current) {
      ref.current.classList.add('pulse-once')
    }
    markSeen(id)
  }, [id])

  return (
    <span
      ref={ref}
      data-overdue-id={id}
      className={`font-serif italic ${className}`}
    >
      {label}
    </span>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/motion/OverdueBadge.test.tsx 2>&1`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/motion/OverdueBadge.tsx src/components/motion/OverdueBadge.test.tsx
git commit -m "feat(motion): OverdueBadge client component with pulse tracking"
```

---

## Task 4: Table Row Stagger — Wire Up List Pages

Add `.row-stagger` class to list containers and `style={{ '--i': index }}` to each child across 5 pages.

**Files:**
- Modify: `src/app/(portal)/fund-in/page.tsx`
- Modify: `src/app/(portal)/fund-out/page.tsx`
- Modify: `src/app/(portal)/overdue/page.tsx`
- Modify: `src/app/(portal)/statements/page.tsx`
- Modify: `src/app/(portal)/approvals/page.tsx`

- [ ] **Step 1: Fund-in — add stagger to tbody**

In `src/app/(portal)/fund-in/page.tsx`, find the `<tbody>` tag and add the class:

```
<tbody>
```
→
```
<tbody className="row-stagger">
```

Then on each `<tr>` inside the map, add the `--i` variable. Find:
```
<tr key={source.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
```
→
```
<tr key={source.id} style={{ '--i': i } as React.CSSProperties} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
```

The `.map((source)` also needs the index parameter. Find:
```
{sources.map((source) => (
```
→
```
{sources.map((source, i) => (
```

- [ ] **Step 2: Fund-out — add stagger to tbody**

Same pattern in `src/app/(portal)/fund-out/page.tsx`:

Find `<tbody>` → add `className="row-stagger"`.

Find `.map((loan)` → change to `.map((loan, i)`.

Find the `<tr key={loan.id}` inside the map → add `style={{ '--i': i } as React.CSSProperties}`.

- [ ] **Step 3: Overdue — add stagger to both tables**

In `src/app/(portal)/overdue/page.tsx`, there are TWO tables (active + history). Apply stagger to both `<tbody>` elements and add `--i` to both map patterns. Same edit pattern as Steps 1-2.

- [ ] **Step 4: Statements — add stagger to each period tbody**

In `src/app/(portal)/statements/page.tsx`, each period section has its own `<tbody>`. Add `className="row-stagger"` to each `<tbody>`, and `--i` + index param to the inner map.

- [ ] **Step 5: Approvals — add stagger to card containers**

Approvals uses card layout, not tables. In `src/app/(portal)/approvals/page.tsx`:

For the pending section, find the parent container of the `pending.map(...)` call. Add `className="row-stagger"` to it (likely a `<div>`). Add index param to the map and `style={{ '--i': i } as React.CSSProperties}` to each `<Link>` element.

For the recent section, same pattern on the `recent.map(...)` parent and each `<div>` child.

The CSS already handles `> div` and `> a` selectors in `.row-stagger`.

- [ ] **Step 6: Run build to verify no type errors**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds. The `React.CSSProperties` cast handles the CSS custom property.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(portal\)/fund-in/page.tsx src/app/\(portal\)/fund-out/page.tsx src/app/\(portal\)/overdue/page.tsx src/app/\(portal\)/statements/page.tsx src/app/\(portal\)/approvals/page.tsx
git commit -m "feat(motion): table row stagger on 5 list pages"
```

---

## Task 5: Settings Tab Slider

Replace the current SettingsTabs server component with `<SlidingTabs>`.

**Files:**
- Modify: `src/app/(portal)/settings/_components/SettingsTabs.tsx`
- Modify: `src/app/(portal)/settings/page.tsx` (if needed to pass onTabChange)

- [ ] **Step 1: Read current SettingsTabs implementation**

Read `src/app/(portal)/settings/_components/SettingsTabs.tsx` to understand the current tab keys and labels. Also read `src/app/(portal)/settings/page.tsx` to understand how activeTab is determined.

- [ ] **Step 2: Rewrite SettingsTabs to use SlidingTabs**

Replace the content of `src/app/(portal)/settings/_components/SettingsTabs.tsx` with:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

const TABS: TabItem[] = [
  { key: 'treasury', label: 'Treasury' },
  { key: 'tiers', label: 'Tier config' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'splits', label: 'Splits' },
  { key: 'directors', label: 'Directors' },
  { key: 'simulator', label: 'Simulator' },
]

export function SettingsTabs({ active }: { active: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleTabChange(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.push(`/settings?${params.toString()}`)
  }

  return <SlidingTabs items={TABS} active={active} onTabChange={handleTabChange} />
}
```

Note: The tab keys and labels must match what `settings/page.tsx` expects. Read the current file to verify the exact keys. The list above is based on the agent research — adjust if different.

- [ ] **Step 3: Verify settings page still renders**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds. The SettingsTabs component is now a client component that wraps SlidingTabs and handles URL navigation.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/settings/_components/SettingsTabs.tsx
git commit -m "feat(motion): settings tabs use SlidingTabs with sliding indicator"
```

---

## Task 6: Form Error Shake

Add shake-once trigger to form components on validation error.

**Files:**
- Modify: `src/app/(portal)/fund-in/_components/NewFundSourceForm.tsx`
- Modify: `src/app/(portal)/fund-out/_components/NewLoanForm.tsx`
- Check for other form components with similar error patterns

- [ ] **Step 1: Add shake trigger to NewFundSourceForm**

In `src/app/(portal)/fund-in/_components/NewFundSourceForm.tsx`, add a `useEffect` + `useRef` to trigger the shake class when error state changes.

After the existing `const [error, setError] = useState<string | null>(null)` line, add:

```tsx
const formRef = useRef<HTMLFormElement>(null)

useEffect(() => {
  if (error && formRef.current) {
    formRef.current.classList.remove('shake-once')
    // Force reflow for re-trigger
    void formRef.current.offsetWidth
    formRef.current.classList.add('shake-once')
    const el = formRef.current
    const handler = () => el.classList.remove('shake-once')
    el.addEventListener('animationend', handler, { once: true })
    return () => el.removeEventListener('animationend', handler)
  }
}, [error])
```

Also add `ref={formRef}` to the `<form>` element:

```
<form action={handleSubmit} className="bg-surface ..."
```
→
```
<form ref={formRef} action={handleSubmit} className="bg-surface ..."
```

Add `useRef` to the import line:

```
import { useState, useTransition } from 'react'
```
→
```
import { useState, useTransition, useRef, useEffect } from 'react'
```

- [ ] **Step 2: Add shake trigger to NewLoanForm**

Same pattern in `src/app/(portal)/fund-out/_components/NewLoanForm.tsx`. Identical code:
1. Add `useRef, useEffect` to imports
2. Add `formRef` ref
3. Add `useEffect` shake trigger
4. Add `ref={formRef}` to `<form>`

- [ ] **Step 3: Check for other form components**

Search for other form components that use the same `useState<string | null>(null)` error pattern:

```bash
grep -r "setError(" src/app/\(portal\)/ --include="*.tsx" -l
```

For each file found, apply the same shake pattern (formRef + useEffect). Common candidates:
- `billing/contracts/` forms
- `settings/` form sections
- `hr-costing/` forms
- `director-salary/` forms

- [ ] **Step 4: Run tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add -u src/app/\(portal\)/
git commit -m "feat(motion): form error shake on validation failure"
```

---

## Task 7: Inline Confirm Panel Slide-in

Add `.confirm-slide-in` class to the inline confirm panels that appear when users click destructive actions.

**Files:**
- Modify: `src/app/(portal)/overdue/_components/EscalateButton.tsx`
- Modify: `src/app/(portal)/statements/_components/GenerateStatementsButton.tsx`
- Check: `GenerateInvoicesButton.tsx`, `SubmitHRCostButton.tsx`, `ConfirmPayoutsButton.tsx`, `CalculateButton.tsx`
- Modify: `src/app/(portal)/fund-in/[id]/_components/ConfirmButton.tsx` (if applicable)

- [ ] **Step 1: Identify all inline confirm panels**

```bash
grep -r "confirming" src/app/\(portal\)/ --include="*.tsx" -l
```

This finds all components using the `useState(confirming)` pattern.

- [ ] **Step 2: Add confirm-slide-in to EscalateButton**

In `EscalateButton.tsx`, find the JSX that renders when `confirming` is true. The container div/element of the confirm UI gets the class:

Find the confirm-state container (something like `<div className="...">` rendered when confirming):
→ Add `confirm-slide-in` to its className.

Example: if the confirm state renders:
```
<div className="flex gap-2">
```
Change to:
```
<div className="confirm-slide-in flex gap-2">
```

- [ ] **Step 3: Add confirm-slide-in to remaining confirm panels**

Apply the same pattern to each file found in Step 1:
- `GenerateStatementsButton.tsx` — add `confirm-slide-in` to the confirming-state card container
- `GenerateInvoicesButton.tsx` — same
- `SubmitHRCostButton.tsx` — same
- `ConfirmPayoutsButton.tsx` — same
- `CalculateButton.tsx` — same

Each file: find the container rendered when `confirming === true`, add `confirm-slide-in` to its className. One-line change per file.

- [ ] **Step 4: Run build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -u src/app/\(portal\)/
git commit -m "feat(motion): inline confirm panels slide-in on reveal"
```

---

## Task 8: Status Pill Morph

Add `.status-morph` class to approval/loan/statement status indicators.

**Files:**
- Modify: `src/app/(portal)/approvals/[id]/page.tsx` — the `ApprovalStatus` function

- [ ] **Step 1: Add status-morph to ApprovalStatus component**

In `src/app/(portal)/approvals/[id]/page.tsx`, find the `ApprovalStatus` function:

```tsx
function ApprovalStatus({ status }: { status: string }) {
  if (status === 'pending') return <span className="font-serif italic text-alert text-md">pending</span>
  if (status === 'approved') return <span className="font-serif italic text-ledger text-md">approved</span>
  return <span className="font-serif italic text-danger text-md">rejected</span>
}
```

Change each `<span>` to include `status-morph`:

```tsx
function ApprovalStatus({ status }: { status: string }) {
  if (status === 'pending') return <span className="status-morph font-serif italic text-alert text-md">pending</span>
  if (status === 'approved') return <span className="status-morph font-serif italic text-ledger text-md">approved</span>
  return <span className="status-morph font-serif italic text-danger text-md">rejected</span>
}
```

Note: The color transition only plays when the same DOM element's class changes. Since this is server-rendered and each approval status is on a separate page, the morph won't animate during normal browsing — it'll show the correct color instantly. The transition becomes visible if `useOptimistic` is added to the approve/reject action (future enhancement). Adding the class now costs nothing and prepares for that.

- [ ] **Step 2: Check for status indicators on other pages**

```bash
grep -r "text-ledger\|text-alert\|text-danger" src/app/\(portal\)/ --include="*.tsx" -l
```

For any status pill/badge patterns found (loan status on fund-out detail, statement status), add `status-morph` to their className. Same one-line change per occurrence.

- [ ] **Step 3: Commit**

```bash
git add -u src/app/\(portal\)/
git commit -m "feat(motion): status pill morph transition on status indicators"
```

---

## Task 9: Overdue Badge Integration

Wire up `<OverdueBadge>` on the overdue page.

**Files:**
- Modify: `src/app/(portal)/overdue/page.tsx`

- [ ] **Step 1: Read overdue page to find badge locations**

Read `src/app/(portal)/overdue/page.tsx` and identify where overdue status/label text is rendered (e.g., "overdue 15d", "late_1", "late_2"). These are the spots to wrap with `<OverdueBadge>`.

- [ ] **Step 2: Import and wrap overdue badges**

At the top of `src/app/(portal)/overdue/page.tsx`, add:

```tsx
import { OverdueBadge } from '@/components/motion/OverdueBadge'
```

Find each overdue status label in the active overdue table. Replace the raw text/span with:

```tsx
<OverdueBadge
  id={loan.id}
  label={`overdue ${daysSinceOverdue}d`}
  className="text-alert"
/>
```

The exact prop values depend on the current rendering. Read the file first, identify the pattern, then wrap.

- [ ] **Step 3: Run build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds. OverdueBadge is a client component imported by a server component — this is fine in Next.js App Router.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/overdue/page.tsx
git commit -m "feat(motion): overdue badges pulse on first appearance"
```

---

## Task 10: Final Verification

**Files:** None modified — verification only.

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run 2>&1`
Expected: All tests pass including new SlidingTabs (3) + OverdueBadge (2) tests.

- [ ] **Step 2: Run build**

Run: `npx next build 2>&1 | tail -15`
Expected: Build succeeds with no errors or new warnings.

- [ ] **Step 3: Manual verification checklist**

Start dev server: `npm run dev`

Verify each motion in browser:
1. **Row stagger:** Navigate to `/fund-in` — rows should fade in with 50ms stagger
2. **Focus glow:** Click any input field — rust accent glow appears
3. **Tab slide:** Go to `/settings` — click between tabs, indicator bar slides
4. **Form shake:** Go to `/fund-out/new` — submit empty form, form should shake
5. **Confirm slide:** Go to `/overdue` — click Escalate, confirm panel slides in
6. **Status morph:** Go to `/approvals/[id]` — verify `status-morph` class is on status spans
7. **Overdue pulse:** Go to `/overdue` — badges should pulse once on first visit

- [ ] **Step 4: Verify reduced-motion**

In browser DevTools → Rendering → Emulate CSS media `prefers-reduced-motion: reduce`.
1. Row stagger: rows appear instantly (no animation)
2. Focus glow: glow appears instantly (no transition)
3. Form shake: form does NOT shake, border turns red instantly
4. Status morph: color still transitions (not disabled)
5. Overdue pulse: static ring, no animated spread

- [ ] **Step 5: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "fix(motion): adjustments from manual verification"
```

Only if Step 3/4 revealed issues. If everything passes, skip this step.
