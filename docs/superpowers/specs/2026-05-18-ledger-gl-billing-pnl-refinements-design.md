# Ledger GL Format, Billing Layout & P&L Revenue Grouping

**Date**: 2026-05-18
**Status**: Approved (design)
**Scope**: Three independent sub-projects, one spec / one plan, separable sections.

## Sub-project 1 — General Ledger → standard GL format (web + Excel + PDF)

### Goal
Re-present `/reports/ledger` (and its Excel/PDF exports) as a standard accounting general ledger: per-account grouping with an account header carrying period Dr/Cr/closing, a `BALANCE B/F` opening line inside the table, and per-line Journal Type + reference number columns.

### Decisions (locked with user)
- **8 columns, in order**: `Date`, `Acc. Desc.`, `Journal Type`, `Ref. 1`, `Desc.`, `Home DR`, `Home CR`, `Home Balance`.
- **Account header row** per account: label `Acc. No.: <code> · <accountName>`, with period Dr / period Cr / closing balance aligned in the right three numeric columns (NOT the parenthesised-text form from the user's source screenshot).
- **`BALANCE B/F`** is the first line of each account's lines: `Date` = `—` (an em dash, not the `1900/01/00` placeholder), `Acc. Desc.` = account name, `Journal Type` / `Ref. 1` blank, `Desc.` = `BALANCE B/F`, `Home Balance` = opening balance, Dr/Cr blank. Replaces the current separate "Opening balance (date)" line rendered above the table.
- **Account footer row** per account: `<code> <accountName> — total`, with period Dr / period Cr / closing balance in the numeric columns.
- **Negative balances**: keep the existing `.neg` red-parenthesis convention (e.g. `(137,737.58)`), not a leading minus.
- **Journal Type** derived from the entry's source:
  - `reference_type = 'invoice'` → `SALES`
  - `reference_type = 'payment_voucher'`, direction credit → `RECEIPT`; direction debit → `PAYMENT`
  - `reference_type = 'manual'` / none → `JOURNAL`
  - `BALANCE B/F` line → blank
- **Ref. 1** = the source document number (invoice no / voucher no). Rendered in a clear monospace at the body text size in an ink/graphite-readable colour — NOT the small muted style; this was the only mockup change the user requested.

### Data layer (`src/lib/cfo-reports.ts`)
- Extend `RawLedgerLine` and `LedgerLine` with: `accountDesc: string` (the account name, repeated per line), `journalType: string` (`''` for B/F), `ref: string` (`''` when none).
- `buildLedger`: pass the new fields through unchanged; the running-balance algorithm (`running += debit - credit`) is NOT modified. Inject the `BALANCE B/F` line as `lines[0]` with `debit:0, credit:0, runningBalance: openingBalance, journalType:'', ref:'', description:'BALANCE B/F', entryDate sentinel`. The page renders `entryDate` sentinel as `—`.
- `fetchLedgers`: the period-JE query already selects `reference_type` / `reference_id`; additionally resolve the source document number (invoice `invoice_no` / payment voucher voucher number) for `ref`, and compute `journalType` per the mapping above (payment-voucher direction is already known from the source-description override join — reuse it; if direction is not currently available there, add the minimal select needed). `accountDesc` = the account's name (already known per account in the per-account loop).
- `Ledger.openingBalance` / `closingBalance` / `periodTotals` are unchanged and feed the header/footer rows.

### Web (`src/app/(portal)/reports/ledger/page.tsx`)
- `LedgerSection` renders an 8-column `ledger-table`. Remove the standalone "Opening balance (…)" line (now the B/F row). Per account: an `acct` header row (spanning the 5 text columns, period Dr/Cr/closing in the 3 numeric columns), then `led.lines` (B/F first), then a footer total row. Negative numbers via existing `formatSignedBalance` + `.neg`. `Ref. 1` cell: monospace, body size, readable colour.
- Multi-account view stacks one such section per account (unchanged behaviour; only the inner table structure changes).

### Excel / PDF (`src/app/(portal)/reports/ledger/export/_format/{xlsx,pdf}.tsx`)
- `headerRow` / PDF `columns` become the 8 columns. For each account: emit the header row, B/F row, line rows, footer total row. Multi-account: separate accounts with `sectionBreaks` (xlsx) / `PdfSectionHead` (pdf). Number formatting and the existing `fmtBalance` helper are reused. No change to which accounts/period are exported.

## Sub-project 2 — Invoice billing "Pool split" roomy layout

### Goal
Fix the cramped, clipped category picker in the invoice creation form.

### Root cause
In `src/app/(portal)/billing/_components/CreateInvoiceButton.tsx`, `PoolTable` renders pool rows as a 3-column `<table>` inside a wrapper with `overflow-hidden`. The `AccountPicker` dropdown is `absolute w-full` → constrained to the narrow `<td>` width AND clipped by the wrapper's `overflow-hidden`, so other accounts are hard to see.

### Decision (locked with user)
Restructure each pool row from a cramped table row into a **stacked card layout**: each row is a bordered card with Pool select, Category (`AccountPicker`), and Amount each given comfortable width and vertical room, so the `AccountPicker` dropdown has space and is not clipped. `+ Add subsidiary` / `× Remove` behaviour and the underlying form state (`poolRows`, `updatePoolRow`, `addPoolRow`, `removePoolRow`) are unchanged. The `AccountPicker` component itself (`src/components/AccountPicker.tsx`) is NOT modified.

### Notes
- Keep the same fields, validation, `categoryOptions`, `typeFilter={['revenue','cost','other_income']}`, and submit payload — purely a layout change of the `PoolTable` render.
- Remove/avoid the `overflow-hidden` that clips the dropdown; ensure the card layout does not re-introduce clipping.

## Sub-project 3 — P&L revenue grouped by account (expand/collapse)

### Goal
Income Statement revenue lines should be grouped by revenue account name (like expenses are by account), instead of one line per invoice number.

### Decisions (locked with user)
- Revenue is a **two-level structure**: grouped by account, each group = `{ accountName, subtotal, items: { label, amount }[] }` where each item's `label` = `<companyShortCode> · <invoiceNo>`. Expenses are unchanged (flat account-name lines).
- **Web**: collapsed by default — one row per revenue account (name + subtotal); clicking a group expands/collapses its invoice detail rows. Other P&L blocks unchanged.
- **Excel / PDF**: revenue section is **always fully expanded** — account sub-heading + indented invoice detail rows + account subtotal.

### Data layer (`src/lib/cfo-reports.ts`)
- `RawInvoiceRow` gains `categoryCode: string` and `categoryName: string`. The invoice fetch already `select`s `category_code` (currently discarded); add a `chart_of_accounts` name lookup for the distinct category codes (one batched query, same pattern as the existing company short-code lookup) and populate `categoryName`.
- Add a pure helper `groupRevenueByAccount(items)` that takes the per-pool revenue invoice rows and returns `RevenueGroup[] = { accountCode, accountName, subtotal, items: Line[] }[]`, items being `{ label: '<short> · <invoiceNo>', amount }`, groups sorted by subtotal desc, items sorted by amount desc, zero amounts filtered (consistent with existing `linesFrom`).
- `PoolPnl.revenueLines` becomes `revenueGroups: RevenueGroup[]` (or an added parallel field — the plan picks the least-disruptive shape; this is an implementation detail, not a behavioural choice). `revenue` total and all other `PoolPnl` math are unchanged.
- **Non-invoice revenue** (e.g. the Venture Pool's treasury interest income, which is not sourced from `invoices`): each such existing flat revenue line becomes its own `RevenueGroup` where `accountName` = that line's existing label, `subtotal` = its amount, and `items` = a single item with the same label/amount. This keeps the total identical and gives every revenue line a uniform grouped shape (the web component simply shows a non-expandable single-item group, or expands to the one item — the plan picks one and is consistent).

### Web (`src/app/(portal)/reports/income-statement/page.tsx`)
- The Revenue `LineTable` for a pool becomes a small client component: renders one row per `RevenueGroup` (account name + subtotal); clicking toggles showing its `items`. Cost / Other Income / Expense / margins unchanged.

### Excel / PDF (`income-statement/export/_format/{xlsx,pdf}`)
- Revenue rows: for each group emit an account sub-heading row, each item as an indented detail row, then a subtotal row. Cost/other-income/expense/group-totals unchanged. The new `seg`-filtering from the prior feature still applies (a pool segment shows that pool's grouped revenue; summary unchanged).

## Testing
- `buildLedger` unit tests extended: assert `journalType` derivation per source type, B/F line injected as `lines[0]` with correct shape, `accountDesc`/`ref` passthrough.
- New pure `groupRevenueByAccount` + unit tests: same-account multi-invoice merge; subtotal = Σ items; group + item ordering; zero filtered.
- Existing `cfo-reports.test.ts` revenue assertions updated from flat lines → grouped structure.
- Interactive components (revenue expand/collapse; the GL has no interactivity) verified in-browser per project convention, not unit-tested.

## Out of scope
- No change to `fetchIncomeStatement` / `fetchCashflowStatement` signatures.
- Cash Flow and the other report sub-pages unchanged.
- `AccountPicker` component internals unchanged.
- No DB / migration changes.

## Independence
The three sub-projects touch overlapping files (`cfo-reports.ts` for 1 & 3) but are logically independent and can be implemented / reviewed / reverted separately. The implementation plan groups tasks per sub-project.
