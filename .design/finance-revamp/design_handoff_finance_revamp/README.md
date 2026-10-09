# Handoff: Finance module revamp (Venture Portal)

## Overview
A redesign of every Finance-role page in `Venture/Venture-Portal/src/app/(portal)`. The pages use the same visual language as the HR view (sheet layout, StatCards, ledger tables). The data, columns, actions and copy match the existing pages. The layout, density, colour rules, mobile behaviour and interactions are new.

## About the design files
`Finance Revamp.dc.html` is a **design reference built in HTML**. It shows the intended look and behaviour. It is not production code. Rebuild it in the existing Next.js + Tailwind codebase, using its components (`StatCard`, `StatCards`, `LedgerRow`, `.ledger-table`, `.sect-head`, `.chip`, `useRowLinks`, etc.). All numbers in the prototype are sample data. Open the file in a browser. Use the `device` toggle at the top to switch between desktop and phone.

## Fidelity
**High fidelity.** Match the colours, type, spacing and interactions. Where the existing component already does the same thing, keep the component and restyle it.

## Global rules (apply on every page)

### Typography
- UI text: **Inter** (fallback: 'Noto Sans SC').
- Numbers, dates, voucher/invoice numbers inside amounts: **Chivo Mono**. Weights: 400 for normal, 500/600 only for totals.
- Page titles and print headers: **Georgia**.
- Voucher #, Invoice #, Receipt # columns use Inter 500. Do not use mono for these.
- Status chips use Inter. Do not use mono for chips.
- Uppercase micro-labels use letter-spacing 0.05em. Do not go higher.
- Body uses `font-variant-numeric: tabular-nums lining-nums`.
- Minimum font size is 10px.

### StatCard colour rule (by meaning)
| Meaning | Tone | Value colour |
|---|---|---|
| Money in (received, to collect, revenue) | ledger | #156E4E |
| Money out / to repay / overdue | danger | #B02822 |
| Waiting on someone (pending, awaiting Principal, maturing) | wait | #2E5C8A |
| The page's single most important card | primary | #5A3E2B, 1.5px #86664C border |
| Neutral count / info | default | rgb(84,90,102) |

The ledger, wait and danger tones also colour the card's top bar and icon tile. Net figures are green when positive and red when negative.

### Status chips
- draft: grey
- pending: **blue** (#E6EEF7 bg, #2E5C8A text)
- approved: orange accent
- paid: green
- overdue: red

### Tables
- Header row: #E2E7EF background, #1D2B4A text.
- All body rows are white. No zebra striping.
- Every sortable column has ▽ filtering:
  - Text columns: a checkbox list with search.
  - Amount and date columns: a **Pick values | Range** switch. Range shows Min/Max (or From/To) inputs, presets, and "N rows in range". Only one mode is active at a time.
- Columns can be resized. A drag only moves width between two neighbouring columns, so the table edge stays fixed.
- Column order can be changed by dragging. Column layout can be saved as default.
- Long lists sit in a box with max-height 620px and scroll inside it. The header is sticky.
- Double-click opens a row. Right-click opens a menu: Open, Open in new tab, plus page-specific actions (Payments/Receipts: Change date; Receipts: Change amount).
- Negative numbers are red, in brackets on reports.

### Navigation
- Opening a detail page remembers the list's scroll position. Back restores it, including "← Back to Calendar" and "← Back to Overview".
- Phone:
  - Top bar: cream (#FCFAF7), a brown "H" tile, and the page name.
  - Bottom tab bar: the active tab has a peach pill (#FFEAD2) behind the icon.
  - On detail pages, an edge swipe right (from within 28px of the left edge, more than 80px) goes back.

## Screens
These are listed by sidebar order. Each screen keeps every field of the original page. The prototype's page builders (`page*()` methods in the logic class) list the exact columns and copy.

- **Overview**
  - Cards: Venture Pool (primary), Pool, Lent out, Pending your hand.
  - Pool breakdown fold, with 3 tables.
  - Pending your hand (left 7 columns) next to Margin panel and Interest this month (right 5 columns).
  - Recent actions, Subsidiaries, Alerts, Bank accounts.
  - Billing & dept pool, and Director salary (KPI card rows).
  - Overdue instalments and Coming up (next 14 days). Both are new.
- **Payments**
  - Cards: Total paid, Pending approval, Approved · to pay, All vouchers.
  - Tabs: All, Draft, Pending, Approved, Paid, Voided, Payroll batches. Payroll batches are collapsible rows that list each voucher.
  - Detail page: dark side panel with an amount block, a "When & where" section and a "Booking" section.
- **Receipt**: same structure as Payments. Columns are Receipt #, Category, Pool, Payer, Description, Bank, Amount, Status, Date.
- **Invoice (Service Billing)**
  - Toolbar in one row: month picker next to "From payroll ▾", then "Export ▾", then "+ Create Invoice ▾".
  - Payroll basis fold contains Director Salary Submission and Staff Billing Allocation.
  - Below the invoice list: Credit notes, Marketing projects, Non-billable.
  - Invoice detail: Invoice items (Billable) and Contra items (Non-bill) are clearly separated.
- **Billing Allocator**: tabs Records, Calculate, Staff, Setup.
- **Daily Bank**: Bank × Department matrix and By bank view. Get image / PNG / PDF.
- **Fund IN / Fund OUT**
  - Lists with status tabs.
  - Detail page order: terms, Repayment settings ("minimum pay interest"), Notes, Terms over time, Repayment schedule, Actions. The repayment schedule replaces the repayment history, with Balance / Outstanding / Remark columns.
  - Right-click Amend terms and Print schedule.
- **Invoice Financing** (was "Bank BA"): Financing register first, then Limits. Record financing opens an inline form with live charge/HC/margin and a limit check.
- **Repayment Schedule**
  - Calendar of instalments per month. Hovering an item shows a detail card. Click goes to the record, and back returns to the calendar. "+N more" expands the day.
  - Separate We collect / We pay lists with a principal @ rate · term · left line.
- **Overdue**: Fund OUT (they owe us) and Fund IN (we owe) tabs, plus a netting log.
- **Statements**: monthly consolidated statement per company. Invoice items and contra items are separated, and the net shows the direction (to collect or to repay).
- **Dept Pool**: Cash and Accrual P&L are chosen from the sidebar only. Balance by bank comes above By department.
- **Venture Pool**: In vs Out pie and 12-month bars. In is #3F7A64, Out is #E99A53.
- **General Ledger**: one table per account, with Date, Acc. Desc., Journal Type, Ref. 1, Dept, Desc., Home DR, Home CR, Home Balance, and opening and closing rows.
- **Reports**
  - P&L defaults to Monthly P&L, with a From–To period (default Jan–Dec), Find account, a Segment dropdown and Detail level L1/L2/L3 on one row.
  - Each month gets an RM and a % column. An Accumulated column is shown. Month columns are visually separated.
  - Also: Cash Flow, Receipt & Payment, Balance Sheet, Trial Balance, Debtor/Loan Aging (navy "All" total row), Company Statement.
- **Reconciliation / Journal Entries**
  - Journal list → detail page.
  - New entry is a full-page voucher form. Ins adds a line. Dr and Cr are mutually exclusive. Post is enabled only when the entry is balanced.
- **Settings** (Finance only sees these): Chart of Account, Departments, Base Rate History. Principal-only tabs are out of scope.

## Design tokens
- Ink: #000, #2B1F17
- Muted: #5A4E44, #75645A, #8A7765
- Hairlines: #E5E4DF, #ECEAE5, #D8D2C8
- Page background: #F2EFEA. Sidebar / top bar on desktop: #DED7CA.
- Accent orange: #E99A53 (hover #C9741F). Peach wash: #FFF4E7.
- Navy: #1D2B4A. Blue: #2E5C8A.
- Green: #156E4E (wash #DEF0E8). Red: #B02822 (wash #FAE4E0).
- Radii: 6px for controls, 10px for tables, 12px for cards, 99px for chips.
- Card shadow: `0 3px 12px rgba(90,62,43,0.055)`.

## Files
- `Finance Revamp.dc.html`: the whole prototype. The template holds the markup. The logic class holds the sample data (`FUND_IN`, `FUND_OUT`, `PAYMENTS`, `RECEIPTS`, `INVOICES`, `BANKS` …) and one `page*()` builder per screen.
- `support.js`: the runtime needed to open the prototype locally.
- `screenshots/`: the first view of each page (desktop, narrow pane), for quick reference. The HTML file is the source of truth for full pages, detail views and phone layout.
