# Commission workbench review

The month page at `/revenue/<sub>/<YYYY-MM-01>` now starts with sales metrics and three views: Total Sales Orders, KPI Items, and Open Bill. Selecting a salesperson opens Personal and Overriding ledgers. Both tables scroll horizontally and keep the order number and total commission visible.

The salesperson view is a separate visual level: the month heading, overall metrics, global tabs and source tools are removed until the user returns to the list. It starts with a dark walnut personal commission hero and uses the portal's Inter and Chivo Mono fonts. Targets, threshold lists and the claims placeholder do not appear beneath the ledger. On phones, the order column scrolls normally to leave room for the fixed total commission column.

## Calculation and data

- `revenue/_lib/commission-input.ts` loads the inputs shared by the saved payroll run and the interactive workbench. The workbench calls the existing commission engine.
- The initial calculation uses ranks and dated rules effective for the selected month. Current team/rule and incentive switches are explicitly labelled review drafts.
- Each order's components reconcile to its displayed total. Monthly margin incentives and downline overriding are allocated to orders for review; monthly group rewards remain separate and are included once in the salesperson total.
- Order exclusions recalculate the entire team, including affected uplines. Exclusions and preview switches are stored in the browser session and do not alter payroll or source orders.
- Open Bill picks use the existing source-order tagging workflow. Saving checks the source switch, affected period locks, stale selections, and occupied ranks before changing picks. A saved pick takes effect in payroll only after the run is recomputed and synced. Applied or locked periods cannot be edited. These existing REST writes are not a database transaction; unexpected write failures require refreshing and reviewing the explicitly reported partial result.
- Salary previews use the existing payroll arithmetic and statutory lookups. Individual salary inputs remain behind the existing HR/Principal permission gate. No claims or travel estimates are added.
- Event and organiser labels use the persisted fair assignment, including orders whose ERP document date falls after the fair.

## Current review data

The read-only August 2026 audit on 24 September found 303 active orders, RM 1,999,468 sales, no unmatched agents, and 141 lines without cost. August has no effective historical hierarchy, and no KPI item rates are configured. The workbench surfaces those gaps instead of inventing rank history or KPI rates. The optional current-team preview lets the new tables be reviewed while preserving the historical source settings.

## Verification boundary

The implementation has component interaction tests, shared-loader and salary-fallback tests, and engine reconciliation tests. A real-order snapshot was also reviewed in a local browser, including horizontal scrolling, exclusions/restoration, downline recalculation, and Open Bill allocation.

The signed-in local month route still needs a user login for runtime verification of private salary inputs and actual saving. No payroll, rule configuration, or production deployment was changed during the review.
