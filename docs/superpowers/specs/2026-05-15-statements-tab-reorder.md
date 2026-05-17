# Statements page — tab reorder (Invoices first)

**Date**: 2026-05-15
**Branch**: feat/fund-flow-pnl-classification
**Status**: Approved (Approach C)

## Problem

Clicking "Statements" in the sidebar today lands on the Monthly Statements list, even though Finance interacts with the Invoices tab much more frequently in day-to-day operations. The user wants Invoices to be the default landing view; the Statements list moves to a secondary tab.

## Approach (C — route swap)

Swap what each route renders so the URL path matches the content. The Invoices view becomes the default at `/statements`; the existing Statements content moves to a new `/statements/monthly` route. The old `/statements/invoices` URL is removed entirely (Approach C, not the B alias) — the codebase has only 3 production references to it and we update them in this same change, so there is no migration concern.

## Routes — before / after

| Route | Before | After |
| --- | --- | --- |
| `/statements` | Statements list | **Invoices list** (default) |
| `/statements/invoices` | Invoices list | **removed** |
| `/statements/monthly` | (does not exist) | **Statements list** (new) |

Sidebar entry label stays "Statements" — that's the user's mental model. The tab labels inside the page still read "Invoices" / "Statements" so the content within each route is unambiguous.

## File changes

1. **`src/app/(portal)/statements/page.tsx`** — replace its current content (Statements list) with the body from `statements/invoices/page.tsx` (Invoices list).
2. **`src/app/(portal)/statements/monthly/page.tsx`** (new directory) — receive the old Statements-list body from the file in step 1.
3. **`src/app/(portal)/statements/invoices/`** — delete the directory.
4. **`src/app/(portal)/statements/_components/StatementsTabHeader.tsx`** — swap tab order so Invoices is first; update `href` values:
   - Tab "Invoices" → `/statements` (active when `active === 'invoices'`)
   - Tab "Statements" → `/statements/monthly` (active when `active === 'statements'`)
5. **`src/app/(portal)/billing/actions.ts:153`** — `revalidatePath('/statements/invoices')` → `revalidatePath('/statements')`.
6. **`src/app/(portal)/billing/page.tsx:12`** — `redirect('/statements/invoices${qs}')` → `redirect('/statements${qs}')`.
7. **`src/app/(portal)/hr-costing/actions.ts:92`** — `revalidatePath('/statements/invoices')` → `revalidatePath('/statements')`.
8. **`src/app/(portal)/billing/_components/BillingView.tsx:2`** — update the doc comment string reference.

The `active` prop value passed to `StatementsTabHeader` from each `page.tsx` is unchanged (the new `/statements` page still passes `active="invoices"`, the new `/statements/monthly` still passes `active="statements"`); only the link `href` values move.

## Testing

No new unit tests — this is a static route + UI nav change with no logic. The verification is in the browser:

1. Click "Statements" in sidebar → Invoices list renders first ✅
2. Click "Statements" tab → `/statements/monthly` renders the old Statements list ✅
3. Existing flows that hit the 3 `revalidatePath` call sites still revalidate the visible page after their mutations ✅

## Out of scope

- Renaming the sidebar entry from "Statements" to "Billing" or similar.
- Setting up a permanent `/statements/invoices` → `/statements` redirect (only relevant if external bookmarks exist; per branch state this is solo pre-release).
- Touching the Invoices or Statements page contents themselves — only the routes they live at change.
