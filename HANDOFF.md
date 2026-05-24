# HOUZS Venture Portal — Session Handoff (checkpoint 2026-05-25)

> Context-window handoff. Read this first to continue. User communicates in 华语 (Mandarin).

## Project
- HV internal banking portal. Next.js 15 (App Router) + Supabase + Vercel + TypeScript + Tailwind.
- Local: `C:\Users\User\OneDrive\Desktop\Claude\Venture\Venture-Portal`
- Supabase project ref: `gixpptmfuryskbwkmiwz` (use the `supabase` MCP tools)
- GitHub: `wenwei4046/Venture-Portal`
- Read `CLAUDE.md` + `docs/DESIGN.md` before touching code.

## ⚠️ Vercel deployment
- Live site: **venture-portal-chi.vercel.app** under `wenwei4046s-projects`. Auto-deploys on `git push origin main`. Do NOT use `vercel --prod` (chi rejects with permission denied).
- Last pushed commit: `56f0f6c` (ledger Excel/PDF Dept column).

## ⚠️ DB write methods (current)
- `supabase` MCP tools are connected; use `mcp__supabase__execute_sql` for DML and `apply_migration` for DDL/RPC changes.
- For DML where MCP isn't available, run a node script that loads `.env.local` → `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`. Pattern: `scripts/apply-corrections-2026-05-23.mjs`, `scripts/gl-import-apply.mjs`.
- Stale: `scripts/apply-mig-*.mjs` use the management API + a different `PROJECT_REF` (kylcwsxugfbwcofgzhfm) — that's an old test project, NOT the current `gixpptmfuryskbwkmiwz`.

## Current data state (key facts)

### Journals / opening
- **`reference_type='manual_jv'` now holds 334 entries** representing the full GL history (Jan 2025 → May 2026), grouped by Ref.1, multi-dept journals split per segment with 1900 clearing. Built by `scripts/gl-import-preview.mjs` (generator) and applied by `scripts/gl-import-apply.mjs` (insert via service-role key). Includes:
  - PV-000077 HOUZS Century interest **4,130 → 3,540** (rate 3.5%→3%), bank Cr matched (590 less).
  - Year-end closing 2025-12-31: `Dr 1510 RE 2,024 / Cr 9000 2,024` tagged **`corporate`** segment (so Office cumulative ties to TB).
  - Interest-in-suspense adjusting JE 2026-05-20: 3053→3063 38,333.33 (The Cont), 4052→4062 38,333.33 (HOUZS Century).
  - 305-D001 → 3030 (Dream Crafter Trade Debtors, 91.26); other 305-xxxx → 3071; 405-xxxx → 4050; 900-I001 → 9000.
- Reconciled: every TB account matches `HV - Trial Balance 22.05.pdf` (source TB total 1,676,933.38). Journal-lines sum-of-Dr = sum-of-Cr = **4,974,391.22** (the gross is much higher than source TB because each Ref's lines are posted intact rather than netted into one bulk opening; per-account NET is what reconciles).
- Per-segment cumulative P&L: **Marketing −8,238.07, Finance 0, HR 0, Director Office 0, Director +25,263.04, Corporate (Office) −8,922.07, Total +8,102.90.**

### Dept pools (cash)
- Set from **Bank Reconciliation 20/05/2026** (mig 262, then revised). Bank-recon total = 9,928.14.
- Director **18,673.62** (the "Director & Office" bank slice) + later corrected +590 (PV-000077 interest adj) = **19,263.62**.
- Director Office (2,255.49), Finance (361.80), HR 0, Marketing (6,718.19). Sum = 9,928.14 ✓.
- HR has no dept_pools row (balance 0).

### Venture pool ledger (`venture_pool` table)
- **EMPTY** (user explicitly wanted Venture Pool = 0 because all cash is in dept pools per bank recon; the prior 38,902.71 was a stale duplicate of the old "Director & Office" opening).
- Will accumulate automatically going forward:
  - **`new_fund_source` approval** → `fund_in` (approvals/actions.ts line 247-259).
  - **`new_loan` approval** → `fund_out` (approvals/actions.ts line 129-139).
  - **PV approval** (source_pool='venture_pool', via `apply_pool_adjustment`): direction out + loan_id → `fund_out`; out no loan → `expense_out`; in + loan_id → `loan_repayment_in`; in no loan → `profit_in`.
  - Statement contra-only items (no PV) do NOT touch venture_pool — they're paper net-off.

### Director Pool
- **Director is now its own `gl_segment = 'director'`** (mig 260). Director's income/expense sit in their own pool, like marketing/finance/hr. Drops the previous Director→4080 reclass model.
- `4080 Director Pool Payable` is **deactivated** (`is_active = false`) — kept for history.
- `dept_pools(Director)` reflects bank-recon cash (19,263.62), not the P&L net.
- /director-pool page hero (Total Pool = Saving + Invoice − Advance) is the salary-engine view; an opening np_in to dept_pools shows on the dashboard "Director Pool" card and the page reconciliation line but NOT in the Saving+Invoice hero.

### Banks (`bank_accounts` table)
- Hong Leong **9,005.67**, Alliance **922.47** (set by script). Dashboard "Bank Accounts" widget reads this table.

### `dashboard_summary` RPC (mig 264)
- Total pool ("Pool" subline) = ALL dept pools (incl Director, incl negatives, no clamp) + Venture pool. So Pool foots to dept-pool Cash page = 9,928.14.
- `pool_breakdown.dept_pool / venture_pool / total` mirror that.
- `dept_pool_breakdown` lists EVERY pool with non-zero balance (incl Director and negatives), not just positives.
- Subsidiaries / "lent" hero = LIVE outstanding (net of principal repayments, +netting for fund-in). Interest income/expense still on gross principal (Margin panel unchanged).

### `cfo-reports.ts` (Income Statement / Cash Flow)
- Treasury interest **EXPENSE** now bumps into Venture Pool's **`vp.cost`** (NOT `vp.expense`) — appears under Cost (above gross profit). Interest income stays in `vp.revenue`.
- Income Statement folds `manual_jv` P&L by segment per account (label = account name).
- Cash Flow page (`/reports/cash-flow`) injects all 6 standard pool tabs (Venture + 5 dept pools) even when a pool had no activity in the period.
- Ledger (`/reports/ledger`) shows a **Dept** short-form column per line (Mkt / Fin / HR / DO / Dir / Vent / Trs). Excel + PDF exports include the column too.

### dept-pool page (`/dept-pool`)
- Cash tab: total = sum of all dept balances = 9,928.14 = bank-recon. Venture (Office) row is shown but cash = 0 (Office's cash is folded into Director per "Director & Office → Director"). In/Out columns are accumulated to-date (not this-month), so In − Out foots to Balance.
- Accrual·P&L tab: Total net margin = sum of all dept segments INCL Venture row (= 8,102.90 total). Each dept + Venture (Office) shown.

## COA additions / mapping
- Receivable `3051-3059`; payable `4051-4058`; parents `4100` Company / `4200` Director. `4052`=HOUZS Century, `4058`=Tan Guan Yu.
- Interest in Suspense: `3060`/`3061-3065` (recv); `4060`/`4061-4064` (pay).
- Year-end RE: `1510`. Opening clearing: `1900`. `4080 Director Pool Payable` (mig 258, now deactivated).
- Source GL → system COA map (used by `gl-import-preview.mjs`):
  - BS: `100-0000→1500`, `150-0000→1510`, `200-3000→2000`, `300-0000→3030`, `305-D001→3030` (Dream Crafter trade), other `305-*→3071`, `310-0010→3000`, `310-0030→3010`, `350-0010→3051`, `350-0020→3053`, `350-0050→4052`, `350-0060→3055`, `350-0070→3058`, `350-0080→4051`, `350-0090→3052`, `350-0120→3059`, `360-0020→4058`, `370-0010..40→4057/4054/4056/4055`, `405-0000/H001/Y001→4050`, `410-0010..50→4070..4074`, `420-1000→7000`.
  - P&L: `500-0000→5010`, `700-0010→5020`, `700-0020→5000`, `700-0030→7000`, `900-E001→9081`, `900-E002→9083`, `900-I001→9000`, `900-M001→9020`, `900-S001→9082`, `900-S002→9084`, `900-S003→9085`, `900-U001→9086`, `900-W001→9087`, `901→9088`, `902→9089`, `904→9030`, `905→9090`, `907→9091`, `911→9010`, `912→9092`, `913→9093`, `914→9094`, `915→9000`.
  - The standalone `HV_期初TB映射.xlsx` codes are a stale draft — use the codes above.
- Dept (GL) → gl_segment: `MAR→marketing`, `FIN→finance`, `HR→hr`, `DO→director_office`, `DIRECTOR→director`, `OFFICE→corporate`. Empty dept → `corporate`.

## Key IDs
- Principal user: `cbc6a18a-3f38-4567-b8c3-385d00b9e6b3`; Finance: `6c0c28a2-c936-4c83-9bf8-b8c54bda51c5`
- Director dept: `bb927615-b3cd-466a-9e65-c9a35999cb82`
- Companies: 2990 `8a7c5a36`, CAR `daeeb093`, CMI `538a18d5`, CONTS `89c32d76`, HC `5eab1801`, HK `24204cca`, OHN `346274df`
- Directors: MK `18b3aa79`, WL `a5f55a13`, WS `5f9bec22`, WW `b5add299`

## Migrations added (cumulative across both sessions)
- `257_dashboard_net_of_repayments` — dashboard lent = net of repayments.
- `258_director_pnl_to_director_pool` — first Director→4080 reclass (superseded).
- `259_opening_v2_full_replace_tb2205` — bulk opening rebuild (superseded by the per-date GL re-import).
- `260_add_director_gl_segment` — adds `gl_segment='director'`.
- `261_opening_v3_director_own_segment` — opening v3 with Director as own segment (superseded).
- `262_dept_pool_cash_opening_bank_recon` — dept_pool cash from bank recon.
- `263_post_opening_data_corrections` — HOUZS interest +590 adj + venture_pool clear (file-archive of work also embedded in the GL re-import).
- `264_dashboard_pool_total_and_breakdown` — Pool = all dept pools incl Director, breakdown shows all non-zero pools.

NOTE: migrations 258, 259, 261 are HISTORICAL — the current state is from the GL re-import via `gl-import-apply.mjs`, NOT from the bulk openings in those migrations.

## Scripts (in `scripts/`)
- `gl-import-preview.mjs` — parses `HV - General Legder 22.05.xlsx`, applies all corrections, groups by Ref.1, splits multi-dept, emits `gl-import-entries.json` + verifies TB locally. **Read-only.**
- `gl-import-apply.mjs` — reads the JSON, wipes existing manual_jv via service-role, batch-inserts 334 entries + 1,568 lines, then verifies.
- `gl-import-entries.json` — the actual 334 entries that landed in production.
- `apply-corrections-2026-05-23.mjs` — earlier corrections script (banks + initial backdate). Backdate was later reverted by another node one-liner; do not re-run.
- `gen-opening-v2.mjs` + `opening-v2.sql` — bulk-opening generator (historical, superseded by GL re-import).

## Open / pending decisions
1. **Suspense split for other loans** — only LO#19/BI#19 split is applied. Other loans' interest-in-suspense NOT separated (pending user).
2. **5% saving** — does NOT auto-flow to Venture pool (stays in Director Pool's saving bucket via `director_payouts.saving_amount`). User said "再考虑" — open question whether they want to change this.
3. **/director-pool "Total Pool" hero** — Saving+Invoice−Advance basis (salary engine), so the opening np_in does NOT appear in that hero (only on the dashboard Director Pool card + page reconciliation line as "Pending payroll to PV"). User may want hero formula changed.
4. **Statement vs venture_pool** — confirmed with user: statements are paper net-off; only actual PVs touch venture_pool. No change needed.

## Source files on Desktop (current truth)
- `HV - Trial Balance 22.05.pdf` (final TB, 22 May 2026)
- `HV - General Legder 22.05.xlsx` (final GL Jan 2025 → 20 May 2026)
- `HV - Bank Reconciliation - Format 1.pdf` (bank recon 20.05.2026 18:00)
- `HV_期初TB映射.xlsx` — stale draft; ignore the codes column, use the map in this handoff.
- `venture - GL.xlsx` — original old GL (pre-correction); superseded by `HV - General Legder 22.05.xlsx`.

## Reports architecture
- Income Statement / Balance Sheet / Cash Flow built from OPERATIONAL subledgers (payment_vouchers, invoices, treasury) PLUS the `manual_jv` GL entries folded via `gatherManualJvPnl` in `cfo-reports.ts`. Trial Balance reads `journal_lines` directly.
- Treasury-managed account codes (interest income / penalty income / interest expense by NAME, type=revenue/other_income/expense respectively) are EXCLUDED from the manual_jv fold and instead summed by `gatherTreasury` → routed to Venture Pool. **Interest expense now lands in `vp.cost`** (not `vp.expense`).
- Per-pool layout (Income Statement, Cash Flow, dept-pool page) all share the same 6-pool view: Venture, Marketing, HR, Finance, Director Office, Director Pool. Empty pools are shown.
