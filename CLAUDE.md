CLAUDE.md — HOUZS Venture Portal
Project Overview
Internal banking portal for HOUZS Venture Sdn Bhd (HV), a holding company managing 7 subsidiaries in Malaysia's home furnishing industry. HV acts as an internal bank (borrow from subsidiaries, lend to others), shared services hub (Marketing/Finance/HR), and director salary distribution center.
Tech Stack
Framework: Next.js 15 (App Router)
Database: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
Hosting: Vercel
Language: TypeScript
Styling: Tailwind CSS
Charts: Recharts
State: React hooks (no Redux)
Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://gixpptmfuryskbwkmiwz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key. Safe to ship to browsers — RLS is what protects the data, not this key. Real value in .env.local and Vercel>
SUPABASE_SERVICE_ROLE_KEY=<secret key, sb_secret_… . BYPASSES RLS. Never commit it and never paste it into a script — read it from env. Real value in .env.local, in Vercel, and as a Cloudflare Worker secret of the same name>
ERP_SYNC_SECRET=<≥32 chars; shared with the Houzs ERP database (scm.venture_portal_sync_config vp.secret). Set on Vercel Production — until it is, /api/erp/* answers 503>
```
Repository
```
GitHub: wenwei4046/Venture-Portal (Private)
```
Architecture
```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (portal)/
│   │   ├── layout.tsx              ← Sidebar + TopBar
│   │   ├── dashboard/page.tsx      ← wired to dashboard_summary() RPC
│   │   ├── fund-in/                ← list + new + detail + actions.ts
│   │   ├── fund-out/                ← list + new + detail + actions.ts
│   │   ├── overdue/                 ← list + actions.ts (detect/escalate/markPaid)
│   │   ├── statements/              ← list + detail + actions.ts (generate/issue/markPaid)
│   │   ├── approvals/               ← Principal queue + detail + approve/reject
│   │   ├── dept-pool/               (Phase 2)
│   │   ├── billing/                 (Phase 2)
│   │   ├── team/                    ← the sidebar's **People** section (its own
│   │   │                              category since 2026-09-01, below
│   │   │                              Departments): People Management /
│   │   │                              Hierarchy / Roles / Permissions, four flat
│   │   │                              entries. No tab rail BETWEEN them — the
│   │   │                              sidebar is the only way from page to
│   │   │                              page. Routes stay under /team/*. Roles =
│   │   │                              titles. Hierarchy = the GRAPH, with a
│   │   │                              panel beside it (2026-09-07): three views
│   │   │                              on the header's rule (`?tab=`) — **Org
│   │   │                              chart** (default), **Table** (the same two
│   │   │                              facts as editable rows, in ladder order),
│   │   │                              **Levels** = the **ladder** (`title_levels`,
│   │   │                              one shared scale, 2026-09-03; on Roles
│   │   │                              until 2026-09-05) that the chart obeys,
│   │   │                              promotion climbs and the roster sorts by
│   │   │                              — `lib/ladder.ts`. A SECOND GRAPH rides
│   │   │                              the chart view: the commission tree
│   │   │                              (`comm_hierarchy`), READ beside the staff
│   │   │                              one and still EDITED on Revenue. Clicking
│   │   │                              a card in either centres the other.
│   │   │                              Permissions = the matrix, split off
│   │   │                              2026-09-03. **Employee codes
│   │   │                              (2026-09-12):** `employee_code` = HV001,
│   │   │                              HV002 … numbered from the top of the
│   │   │                              ladder (CEO = HV001) and, from then on,
│   │   │                              handed out by trigger
│   │   │                              `hr_staff_costs_assign_code` = the
│   │   │                              largest HV number on the table + 1
│   │   │                              (inactive rows count; a code is never
│   │   │                              cleared). Add Staff has no code field —
│   │   │                              it shows `next_staff_code()`; it DOES
│   │   │                              ask for a **Sub-department** and a
│   │   │                              **Reporting upline** (2026-09-20) —
│   │   │                              blank for a department with none, and
│   │   │                              a base whose ladder has no rung for the
│   │   │                              chosen title is offered greyed out.
│   │   │                              Inside one
│   │   │                              title the roster sorts by code
│   │   │                              (`compareByLadder`). Mig
│   │   │                              `20260915040000`. InfoTech's own number
│   │   │                              is `infotech_code` (mig `20260915050000`):
│   │   │                              both imports match on it first, name
│   │   │                              second, never on the HV code
│   │   │                              (`lib/import/staff-match.ts`).
│   │   ├── director-salary/         (Phase 3)
│   │   ├── hr-costing/              (Phase 3 — staff directory moved to team/)
│   │   │                              payment/ = monthly Payment statement
│   │   │                              (2026-09-11): shared reporting above
│   │   │                              Salary / Statutory tabs. Salary alone
│   │   │                              contains prior-month pay changes.
│   │   │                              Both use Generate by Department or
│   │   │                              Manual generate (select employees),
│   │   │                              with a reviewed snapshot before write.
│   │   │                              Salary coverage: payroll_voucher_lines;
│   │   │                              statutory: payroll_statutory_voucher_lines.
│   │   │                              SOCSO/EIS are separate schemes under
│   │   │                              PERKESO and generated atomically.
│   │   │                              Staff/director statutory sources stay
│   │   │                              in HR custody. Compiled statutory PVs
│   │   │                              allow date/notes edits only. payment_cycle
│   │   │                              includes exact coverage and completion;
│   │   │                              lib/payment-cycle.ts drives reporting.
│   │   │                              DESIGN.md: Payment statement (v3.7).
│   │   ├── revenue/                 ← Revenue Department: [sub]/ = one sub-department
│   │   │                              (Fair, …) with 3 views, reached from the
│   │   │                              SIDEBAR not a tab rail — page.tsx (Commission
│   │   │                              Calculation) / hierarchy / rules — plus
│   │   │                              [sub]/[period]/ runs and products/ (Principal).
│   │   │                              **THE ERP NAMES THE FAIR (2026-09-27):** the
│   │   │                              venues/ register (organiser per venue×month,
│   │   │                              fair calendar, *same place as…*) is GONE. The
│   │   │                              ERP makes the salesperson pick the event to
│   │   │                              open an order, and the delivery carries it as
│   │   │                              `fair` (the brand booth's project: venue,
│   │   │                              organiser, days, status — contract §3.4).
│   │   │                              `erp_sync_fair` keeps it as the portal's fair
│   │   │                              (one per EVENT: booths of one event, same
│   │   │                              place + overlapping days, fold into one row
│   │   │                              via `comm_venue_events.erp_project_ids`; the
│   │   │                              ERP's organiser and days win; a cancelled
│   │   │                              booth is no fair; unknown organisers are
│   │   │                              added) and the ingest pins it
│   │   │                              (`fair_source = 'erp'`, as confirmed as a
│   │   │                              'manual' pin: never re-guessed). The month
│   │   │                              still moves only by a click — *Bills of
│   │   │                              another month's fair* on the month page
│   │   │                              (`FairMovesPanel`, `moveConfirmedFairBills`).
│   │   │                              The calendar's restamp skips a paid month's
│   │   │                              bills. A wrong fair is fixed IN THE ERP. ERP
│   │   │                              side: Houzs-ERP #4309 (`vp_build_payloads`
│   │   │                              `fair`, `trg_vp_outbox_so` + project_id…,
│   │   │                              `trg_vp_outbox_project`). Mig
│   │   │                              `20260927010000`.
│   │   │                              **THE FAIR SETS THE MONTH (2026-09-20):**
│   │   │                              `period_month` followed `header.so_date` —
│   │   │                              the day the ERP document was OPENED IN THE
│   │   │                              BACK OFFICE, not the day the customer signed
│   │   │                              at the fair. Of August's 280 matchable bills
│   │   │                              only FIVE carried the right date; median lag
│   │   │                              +4 days, worst +42. Mid-month that is
│   │   │                              harmless; at month end it moves a whole
│   │   │                              weekend into the next payroll — Kuching
│   │   │                              (8/28-31), MITC and IOI GECC, **RM 674,744
│   │   │                              of August landing in September**, while
│   │   │                              July's month-end fairs sat in August. The two
│   │   │                              cancel to a 10% difference in the total, which
│   │   │                              is why nobody saw that half the month's bills
│   │   │                              had been swapped.
│   │   │                              THE ERP CANNOT HELP: every `header` key of all
│   │   │                              552 deliveries was enumerated 2026-09-20 — no
│   │   │                              fair / event / campaign field exists and
│   │   │                              `venue_id` is NULL on every order including
│   │   │                              the ones that arrived that morning. So the
│   │   │                              calendar is the portal's own fact.
│   │   │                              `comm_venue_events` BECOMES THE FAIR:
│   │   │                              `start_date` / `end_date`, and the old
│   │   │                              `UNIQUE(venue, month)` drops — one hall holds
│   │   │                              two or three fairs a month with a DIFFERENT
│   │   │                              organiser each (REX at MVEC SOUTHKEY
│   │   │                              mid-August, BIGHOME at the same hall month
│   │   │                              end), which is the ALTER 20260918040000 said
│   │   │                              it was leaving room for. An EXCLUDE forbids
│   │   │                              two fairs at one place overlapping; a partial
│   │   │                              UNIQUE keeps one undated row per (place,
│   │   │                              month). `venue_event_for_order()` is the ONE
│   │   │                              rule — the fair open on the order date, else
│   │   │                              the most recent one there that closed within
│   │   │                              45 days (worst observed lag 42) — and it
│   │   │                              stamps `sales_orders.fair_event_id` /
│   │   │                              `fair_source` by TRIGGER, the way
│   │   │                              `sales_orders_ignored_agent` does and for the
│   │   │                              same reason. Editing a fair re-stamps that
│   │   │                              place's bills.
│   │   │                              TWO STEPS, ALWAYS: saving a fair MOVES
│   │   │                              NOTHING. `revenue_fair_calendar_moves` shows
│   │   │                              every bill that would move;
│   │   │                              `revenue_apply_fair_calendar` moves
│   │   │                              `period_month` AND `batch_id` together (the
│   │   │                              run reads orders by BATCH) and REFUSES a month
│   │   │                              whose run has paid (23RUN), like
│   │   │                              `recost_sales_order_lines`. Every run over a
│   │   │                              touched month must be computed again.
│   │   │                              `event_date` is NOT touched: spec 4.4 reads
│   │   │                              Open Bill as "1st/2nd/3rd bill of the EVENT
│   │   │                              DAY", and collapsing a four-day fair onto one
│   │   │                              date would turn three bonuses into one — a
│   │   │                              separate decision with its own money attached.
│   │   │                              UI was *Fair calendar* + *Still to place* on
│   │   │                              Revenue > Venues until 2026-09-27 (the ERP
│   │   │                              names the fair now — see above).
│   │   │                              `lib/fair-calendar.ts`, `fair-actions.ts`,
│   │   │                              mig `20260920050000`.
│   │   │                              **CONFIRMED MOVES (2026-09-23):** while next
│   │   │                              month's fairs are untyped the 45-day grace
│   │   │                              reaches BACK across the month end — of 174
│   │   │                              bills waiting to leave September, August's
│   │   │                              claim form named 96; the other 78 were
│   │   │                              September's own fairs at the same halls, and
│   │   │                              no grace width splits them (lags overlap).
│   │   │                              A bill a HUMAN placed (`fair_source =
│   │   │                              'manual'`, e.g. pinned from the month's
│   │   │                              claim form) is `confirmed`, and
│   │   │                              `revenue_apply_fair_calendar(sub,
│   │   │                              p_confirmed_only)` — *Move the N confirmed*
│   │   │                              — moves only those. Never pin a guess to
│   │   │                              "no fair": a pin is forever and would stop
│   │   │                              it finding its fair once that is typed.
│   │   │                              Mig `20260923010000`.
│   │   │                              **A RE-SEND KEEPS THE MONTH (2026-09-24):**
│   │   │                              the ERP re-sends a document on every save
│   │   │                              and `ingest_erp_sales_order` re-derived the
│   │   │                              month from `so_date` each time, so every
│   │   │                              calendar move lasted until the bill's next
│   │   │                              save (4 went back overnight; 221, RM 1.36M,
│   │   │                              were queued behind them). Now a re-sent bill
│   │   │                              that HAS A FAIR — the human's pin, else
│   │   │                              `venue_event_for_order` on its venue and
│   │   │                              date, exactly what `sales_orders_resolve_
│   │   │                              fair` stamps — keeps its month; only the
│   │   │                              calendar moves it. No fair → `so_date`, as
│   │   │                              before. New documents still land in their
│   │   │                              `so_date` month. Mig `20260924050000`.
│   │   │                              **A MONTH CLOSED TO THE FEED (2026-09-26):**
│   │   │                              the month page's *Live from ERP* chip (click
│   │   │                              or right-click) closes a month to the ERP
│   │   │                              (`erp_feed_closed_months`): every delivery
│   │   │                              that would write INTO or OUT OF it is held —
│   │   │                              200, payload kept, logged under that month —
│   │   │                              and every other month keeps syncing. Reopen
│   │   │                              replays the latest held delivery per document
│   │   │                              (`reopenErpMonth` → `replayHeldErpEvents`).
│   │   │                              The fair calendar skips a closed month on
│   │   │                              both sides and reads committed batches only;
│   │   │                              `commit_sales_import_batch` may replace a
│   │   │                              CLOSED month's live batch (the way a month
│   │   │                              worked out by hand gets in), an open one
│   │   │                              still refuses. **POSSIBLE DOUBLE CLAIMS:**
│   │   │                              `revenue_possible_double_claims` = a paper
│   │   │                              number (`sales_order_bill_ref`: first number
│   │   │                              in `customer_so_no`, else the order's own —
│   │   │                              STORED on the row as the generated column
│   │   │                              `sales_orders.bill_ref` since mig
│   │   │                              `20260926110000`, so the check never opens
│   │   │                              the raw document) on
│   │   │                              more than one payable or paid bill; a
│   │   │                              "checked — separate sales" answer
│   │   │                              (`comm_double_claim_dismissals`) covers
│   │   │                              exactly those bills. The month page also
│   │   │                              names bills carried in from months no run
│   │   │                              paid (`lib/commission/double-claims.ts`).
│   │   │                              **SALES VALUE vs COMMISSIONABLE VALUE:**
│   │   │                              the ledger shows both — the whole bill
│   │   │                              (transport included) and the lines that earn
│   │   │                              (`orderCommissionableValue`). Mig
│   │   │                              `20260926010000`.
│   │   │                              **THE PORTAL PAYS FROM A MONTH (2026-09-26):**
│   │   │                              June–August were paid from the claim forms
│   │   │                              and no run released any of it, so a run
│   │   │                              would have carried all of it into September
│   │   │                              (user: VP 从九月开始付). `comm_cutovers` =
│   │   │                              the first month a sub-department's runs pay
│   │   │                              (Comm Cal › *The portal pays from*). A month
│   │   │                              before it is SETTLED BY HAND: never carried
│   │   │                              (`loadCommissionInput`), closed to the feed
│   │   │                              for good (`erp_feed_month_closed`), counted
│   │   │                              in its own month by the member app. A re-send
│   │   │                              never carries a bill of a paying month back
│   │   │                              into one — an under-deposit August bill moved
│   │   │                              to September keeps hearing of its payments.
│   │   │                              **DROPS AND UPSELLS THE ERP FINDS:** the ERP
│   │   │                              re-sends whole documents, so when a delivery
│   │   │                              is held for a settled bill (closed, before
│   │   │                              the cutover, or paid by a run)
│   │   │                              `erp_sync_note_adjustment` takes new
│   │   │                              commissionable − settled (the run's release,
│   │   │                              else the hand-worked row under the same
│   │   │                              paper, else the frozen bill; answered rows
│   │   │                              count as settled) = ONE pending
│   │   │                              `comm_upsales` row per document. The month
│   │   │                              page's *Drops and upsells the ERP found*
│   │   │                              pays it into that month or lets the ERP's
│   │   │                              figure stand; Undo takes back only the
│   │   │                              latest answer. Runs read CONFIRMED rows
│   │   │                              only. A drop is negative: it takes back the
│   │   │                              seller's commission AND the upline's
│   │   │                              override, and a month whose drops outweigh
│   │   │                              someone's pay is a run warning (payroll
│   │   │                              cannot pay a negative commission). The
│   │   │                              ledger shows *Upsell* / *Drop sales* beside
│   │   │                              the bills. Mig `20260926020000`.
│   │   │                              **OPEN BILL PER MONTH (2026-09-26):** the
│   │   │                              claim form paid August's Open Bill (80
│   │   │                              bills, RM 12,969.78 — the portal's own
│   │   │                              50/40/30 % rule) while September keeps
│   │   │                              Rules' switch off (user: "open for august,
│   │   │                              not september"). `comm_open_bill_months`
│   │   │                              sets ONE month over Rules;
│   │   │                              `comm_open_bill_on(sub, month)` is the rule
│   │   │                              the engine input, the pick guard, the
│   │   │                              feed's suggestions and a file commit all
│   │   │                              ask. The month page's *This month pays* Open
│   │   │                              Bill switch sets the month (Follow Rules
│   │   │                              hands it back); margin and KPI there are
│   │   │                              still Rules. A month before the cutover
│   │   │                              takes NO run (`comm_runs_before_cutover`,
│   │   │                              23CUT): a clean compute syncs to payroll,
│   │   │                              and it was paid by hand — its page shows
│   │   │                              the rules applied to its bills, nothing
│   │   │                              more. Mig `20260926030000`.
│   │   │                              **NO HAND-TYPED UPSALES (2026-09-27):** the
│   │   │                              form below went (user: 所有的 order 都只会从 ERP
│   │   │                              那边抽过来，这边不需要自己调动 — the one thing adjusted in
│   │   │                              the portal is whether a bill counts,
│   │   │                              right-click *Don't count this bill*). Every
│   │   │                              drop and upsell comes from the ERP feed
│   │   │                              (above); the rows typed in, August's claim
│   │   │                              form among them, stay and still count.
│   │   │                              `recordUpsale` / `updateUpsale` /
│   │   │                              `deleteUpsale` / `parseUpsaleInput` are
│   │   │                              gone; confirmed ERP finds are listed under
│   │   │                              *Paid in {month}* on the ERP panel, with
│   │   │                              Undo.
│   │   │                              **UPSALES (2026-09-24):** a customer adds to
│   │   │                              an earlier order and ONLY THE ADDED AMOUNT
│   │   │                              earns. The ERP has no upsale concept (a new
│   │   │                              line, a folded-in price or nothing at all),
│   │   │                              so HR records it on the month page's
│   │   │                              **Upsales & drops** tab (`comm_upsales`;
│   │   │                              a drop is the same, negative). Own rate,
│   │   │                              counts toward the upline's override (the
│   │   │                              claim form's override bases include them),
│   │   │                              paid in the month recorded, no deposit gate,
│   │   │                              no Open Bill / KPI / margin, never released.
│   │   │                              The run hands each to the engine as a
│   │   │                              one-line order flagged `upsale`
│   │   │                              (`lib/commission/upsales.ts`); its statement
│   │   │                              line has no `source_order_id` (FK to
│   │   │                              sales_orders). Paid month refused (23RUN).
│   │   │                              Spec §4.8, mig `20260924060000`.
│   │   │                              **SHARED BILLS (2026-09-24):** a bill can be
│   │   │                              shared with other team members
│   │   │                              (`sales_order_shares`, default 50/50; the
│   │   │                              owner keeps 1 − Σ, never stored). Each PART
│   │   │                              is paid at its holder's own rate and climbs
│   │   │                              its holder's own upline line. Split BEFORE
│   │   │                              the engine (`lib/commission/shares.ts`):
│   │   │                              every money figure scaled, so deposit ratio
│   │   │                              and margin are unchanged per part; releases
│   │   │                              stay one per bill. Trigger refuses the
│   │   │                              owner, Σ ≥ 100% (23SHR) and a paid month
│   │   │                              (23RUN). UI: *Share…* (click or right-click)
│   │   │                              under the salesperson on `[period]/orders`;
│   │   │                              a person's page lists bills shared TO them;
│   │   │                              Sales by person credits the parts. The
│   │   │                              month page's *This month pays* switches (Open
│   │   │                              Bill / Margin incentive & penalty / KPI) are
│   │   │                              the SAME scheme columns as Rules. Member
│   │   │                              Insight/Arena do not read shares yet. Mig
│   │   │                              `20260924010000`.
│   │   │                              **THE CATALOGUE, MIRRORED — ITEMS ONLY
│   │   │                              (2026-09-24):** `products/` (Product List)
│   │   │                              is the Houzs ERP's Products page mirrored
│   │   │                              item by item — SKU Master, Modular (models
│   │   │                              + their allowed options), Maintenance
│   │   │                              (Bedframe + Sofa pools and specials, the
│   │   │                              fabrics and their PRICE_1/2/3 tier — NOT
│   │   │                              "Products Maintenance"), Combo Pricing —
│   │   │                              with a fifth tab, Costing gaps. Not
│   │   │                              mirrored: Variants, Fabric Converter,
│   │   │                              Categories. **User rule: the mirror syncs
│   │   │                              ITEMS, never a price or a cost; every price
│   │   │                              is typed HERE and every margin in the
│   │   │                              portal — the member calculator, the run,
│   │   │                              the drill-downs — is measured against it.**
│   │   │                              Two halves, and the split is the rule:
│   │   │                              `erp_*` (`erp_products`,
│   │   │                              `erp_product_models`,
│   │   │                              `erp_maintenance_options`, `erp_fabrics`,
│   │   │                              `erp_sofa_combos`) is what the ERP says
│   │   │                              EXISTS, written only by
│   │   │                              `ingest_erp_catalogue` (service role, money
│   │   │                              stripped again on the way in AT ANY DEPTH
│   │   │                              — a price tier is a label, not money —
│   │   │                              `full: true`
│   │   │                              retires what a carried section omits as
│   │   │                              `removed_at` — never deletes; an empty
│   │   │                              section retires nothing); `catalogue_*`
│   │   │                              (`catalogue_skus` price / sofa
│   │   │                              `price_grid` / `offered`,
│   │   │                              `catalogue_models` offered + `enabled`
│   │   │                              option ticks + gift / section / brand
│   │   │                              overrides, `catalogue_option_prices`,
│   │   │                              `catalogue_combo_prices` keyed on (base
│   │   │                              model, slots, tier)) is what the PORTAL
│   │   │                              decides and no delivery touches. A SKU the
│   │   │                              ERP adds arrives UNticked. First sight
│   │   │                              inherits the old hand-keyed list's price
│   │   │                              (`catalogue_adopt_legacy`: ERP bridge code,
│   │   │                              own code, then for a mattress brand +
│   │   │                              model + size when unique both ways — mig
│   │   │                              `20260924025000`; bed frames were keyed by
│   │   │                              SUPPLIER codes the ERP does not have, so
│   │   │                              they wait for a person).
│   │   │                              **ONE COST RULE (mig `20260924030000`):**
│   │   │                              `catalogue_line_cost()` = the SKU's portal
│   │   │                              price (a sofa module's grid cell at the
│   │   │                              line's seat height × fabric tier, else its
│   │   │                              one figure) + each Maintenance option's
│   │   │                              portal surcharge (none priced = adds
│   │   │                              nothing), × qty; the options read from the
│   │   │                              line's `raw.variants` when the feed carries
│   │   │                              them, else parsed from the ERP's own
│   │   │                              `description2` grammar
│   │   │                              (`catalogue_line_facts`). Then, at COMMIT
│   │   │                              (deferred trigger), a sofa build covering a
│   │   │                              priced combo is costed at the combo, spread
│   │   │                              over its modules by their own costs — the
│   │   │                              ERP's `recomputeTotals`, rule for rule (the
│   │   │                              combo always wins; one tier + one height;
│   │   │                              uniform qty or no combo). The ERP's own
│   │   │                              line cost is NOT a fallback: nothing
│   │   │                              priced = no cost = no margin, and *Costing
│   │   │                              gaps* says why (`not_in_sku_master` /
│   │   │                              `unpriced` / `no_height`).
│   │   │                              `recost_sales_order_lines` RE-PRICES a
│   │   │                              month from the Product List (23RUN kept);
│   │   │                              a month already landed changes only when
│   │   │                              somebody presses Recost, and the run must
│   │   │                              be computed again. The TypeScript twins
│   │   │                              are `lib/catalogue/*` — the calculator and
│   │   │                              the run cannot disagree about a sofa.
│   │   │                              The ERP pushes the catalogue to
│   │   │                              `POST /api/erp/v1/products` (contract §9,
│   │   │                              v2) on the sales-order feed's key, whole,
│   │   │                              only when its digest changed.
│   │   │                              `lib/erp-sync/catalogue.ts`,
│   │   │                              `revenue/catalogue-actions.ts`, migs
│   │   │                              `20260924020000` / `025000` / `030000`.
│   │   │                              **COSTING SETTING + ADD-ON / KPI ITEMS
│   │   │                              (2026-09-27):** two more Product List tabs,
│   │   │                              per sub-department (`?sub=`). Costing
│   │   │                              Setting = the ratio a cost is divided by
│   │   │                              for the Revenue Team (`comm_schemes.
│   │   │                              revenue_cost_divisor`, Fair 0.7) and SKUs
│   │   │                              with a ratio of their OWN
│   │   │                              (`comm_cost_ratios`, e.g. ÷ 0.6), applied
│   │   │                              per line in the engine (`lib/commission/
│   │   │                              cost-basis.ts`), the month page, the member
│   │   │                              facts and the calculator. Add-on / KPI
│   │   │                              Items = a SKU or a bed frame / sofa SPECIAL
│   │   │                              (`comm_kpi_items.source` 'sku' | 'option',
│   │   │                              `option_pool` / `option_value`) with one
│   │   │                              amount. A bill that carries one (found by
│   │   │                              `orderKpiHits` and its SQL twin
│   │   │                              `comm_kpi_hits`: a SKU per unit, a bed
│   │   │                              frame special per frame, a sofa special
│   │   │                              ONCE per bill) has the amount taken OFF its
│   │   │                              commissionable sales — the margin is judged
│   │   │                              on the rest — and paid flat as KPI (user
│   │   │                              chose "Flat KPI allowance"). A bill whose
│   │   │                              sales do not cover its items (a RM 0
│   │   │                              exchange) pays none: never a run warning,
│   │   │                              because every warning blocks Apply. Items
│   │   │                              are effective-dated — a change closes the
│   │   │                              old row yesterday and opens today's
│   │   │                              (`catalogue_save_kpi_items`), so a month
│   │   │                              already run keeps its amount. Rules › KPI
│   │   │                              items is read-only now; the switch and the
│   │   │                              threshold ladder stay on Rules.
│   │   │                              `lib/commission/kpi.ts`,
│   │   │                              `lib/catalogue/rule-edits.ts`, mig
│   │   │                              `20260927050000`.
│   │   │                              Inside a view, sections get their own nav
│   │   │                              (2026-09-05): rules = 9 sections (`?tab=`)
│   │   │                              in a VERTICAL sidebar since 2026-09-07 —
│   │   │                              nine labels never fitted one rail, so the
│   │   │                              cure for the page's scroll had become a
│   │   │                              scroll over the nav itself. Since
│   │   │                              2026-09-11 a section is in the nav only
│   │   │                              while the Scheme-rules switch that reads
│   │   │                              it is on (`lib/commission/rules-tabs.ts`):
│   │   │                              IR shows Scheme rules / Title ladder /
│   │   │                              Ranks, Fair all nine. The
│   │   │                              ninth, **Ranks**, is the rate catalogue
│   │   │                              `comm_rank_defs` — a rank is percentage
│   │   │                              pay OR a fixed group-incentive package,
│   │   │                              lettered SS, A, B … from the top (packages
│   │   │                              above percentages); the
│   │   │                              Title ladder picks a rank per title and
│   │   │                              never types a rate — `lib/commission/
│   │   │                              ranks.ts`), hierarchy = chart / **Team**
│   │   │                              table (`?tab=team`, the old Rules IX — the
│   │   │                              table sets only the rank, the chart moves
│   │   │                              people).
│   │   │                              **ONE LINE (2026-09-10):** inside a
│   │   │                              commission department who somebody
│   │   │                              REPORTS TO is who earns the override on
│   │   │                              their sales — there is no second line.
│   │   │                              `hr_staff_costs.reports_to` is the fact;
│   │   │                              the position the engine reads
│   │   │                              (`comm_hierarchy`) is DERIVED from it by
│   │   │                              trigger (`hr_staff_costs_one_line_sync`,
│   │   │                              mig 20260910120000): upline = reports_to,
│   │   │                              rank = the title's floor rung when first
│   │   │                              opened, ratcheted up (never down) when
│   │   │                              the title's floor climbs; the only
│   │   │                              hierarchy fact a human sets by hand is
│   │   │                              the rank (Team tab). Both charts move the
│   │   │                              same column through ONE function,
│   │   │                              `moveReportingLine` in
│   │   │                              `lib/hierarchy-writes.ts` ('server-only').
│   │   │                              Two rules of that line, refused before
│   │   │                              the write (`lib/hierarchy-boundary.ts`)
│   │   │                              and again by trigger
│   │   │                              `hr_staff_costs_commission_line` (23BND /
│   │   │                              23REC): it may not cross the department's
│   │   │                              edge, and inside it you may only report
│   │   │                              to a title that may hold downlines (SRS
│   │   │                              and above).
│   │   │                              **REVENUE DIRECTOR (2026-09-11):** a title
│   │   │                              may HEAD its department
│   │   │                              (`titles.is_department_head`, the Head
│   │   │                              tick on People › Roles). It is above the
│   │   │                              ladder — no rung, no membership, no rank,
│   │   │                              no override; the DB refuses all three
│   │   │                              (23DIR) — and everybody may report to it.
│   │   │                              Which director(s) a sub-department
│   │   │                              reports to is a row of
│   │   │                              `comm_sub_department_directors` (Team tab
│   │   │                              › Reports to; seeded Fair ← PETER + KRIS,
│   │   │                              IR ← PETER); the line from the top of every
│   │   │                              tree up to them is DERIVED on both charts
│   │   │                              (`lib/department-heads.ts`), never written
│   │   │                              per person — two directors do not fit one
│   │   │                              `reports_to`. On the REVENUE chart the
│   │   │                              directors are a RAIL above every
│   │   │                              sub-department frame (design A,
│   │   │                              2026-09-12): each director once, A→Z,
│   │   │                              one dashed line per frame they direct
│   │   │                              landing on its TOP EDGE (two directors of
│   │   │                              one frame join on a bus bar; PETER's line
│   │   │                              to IR on a bus of its own), `Reports to
│   │   │                              KRIS · PETER` on the frame's header,
│   │   │                              nothing drawn inside the frame —
│   │   │                              `directorRail` in
│   │   │                              `lib/hierarchy-space-layout.ts`. The
│   │   │                              commission line stops
│   │   │                              below a head: `comm_sync_position` writes
│   │   │                              a null upline for anybody whose
│   │   │                              `reports_to` heads the department, and
│   │   │                              `moveReportingLine` writes null when a
│   │   │                              Revenue person is dropped on one
│   │   │                              (`LineResult.reportsTo` = what landed).
│   │   │                              Mig `20260915020000`. CEO layer: later.
│   │   │                              **MEMBERSHIPS (2026-09-10, later):** a
│   │   │                              sub-department is a world of its own —
│   │   │                              one `comm_hierarchy` row per (person,
│   │   │                              scheme) (`one_position_per_scheme`),
│   │   │                              each with its OWN `title_id`, upline and
│   │   │                              rank (mig 20260910160000). ONE LINE
│   │   │                              applies to the sub-department somebody
│   │   │                              is BASED in, and that is THEIR OWN FACT
│   │   │                              since 2026-09-20:
│   │   │                              `hr_staff_costs.home_sub_department_id`,
│   │   │                              null meaning the department's oldest
│   │   │                              (`comm_home_scheme_for_staff` in SQL,
│   │   │                              `homeSubDepartmentOf` in
│   │   │                              `lib/revenue.ts`; mig `20260920040000`).
│   │   │                              So ONE chart holds both kinds of row —
│   │   │                              `based_here` / `basedHere` is asked per
│   │   │                              NAME, never per sub-department — and
│   │   │                              **Remove from this department** works on
│   │   │                              a base while they still work elsewhere
│   │   │                              in the department: the base moves to the
│   │   │                              oldest of those and `reports_to` takes
│   │   │                              the upline they already have THERE,
│   │   │                              rather than the roster flattening that
│   │   │                              tree. Their only one is refused —
│   │   │                              that is Terminate employee. Who may hold
│   │   │                              downlines follows the manager's own base
│   │   │                              ladder (`comm_staff_can_recruit`), which
│   │   │                              is why an RS may lead in IR and may not
│   │   │                              in Fair. Every other sub-department
│   │   │                              (IR) edits its memberships directly:
│   │   │                              `moveMembership` / `openMembership` /
│   │   │                              `closeMembership` / `setMembershipTitle`
│   │   │                              in `lib/hierarchy-writes.ts`, the Team
│   │   │                              tab adds/removes members and sets the
│   │   │                              title held there. The apply-run ratchet
│   │   │                              raises the MEMBERSHIP title, and the
│   │   │                              company title only for the home one;
│   │   │                              `hr_monthly_payroll.commission_amount`
│   │   │                              is the SUM of every applied run for the
│   │   │                              month. Orders are scoped by the batch's
│   │   │                              sub_department_id, including committed
│   │   │                              batch uniqueness and carry-forward.
│   │   │                              The Houzs ERP feed belongs to Fair.
│   │   │                              **THE ERP'S KEY (2026-09-13):** the ERP
│   │   │                              built the push side (its PR #3751, a
│   │   │                              Worker cron drain, *Venture Portal Feed*
│   │   │                              page); its page GENERATES the secret and
│   │   │                              somebody pastes it once on Fair's Comm
│   │   │                              Cal — the **Houzs ERP link** card above
│   │   │                              the live-feed panel — where it lives in
│   │   │                              Vault (mig `20260916100000`) and the
│   │   │                              receiver accepts it (or `ERP_SYNC_SECRET`,
│   │   │                              optional now). The card shows the
│   │   │                              receiver address and the last delivery;
│   │   │                              everything else (on/off, companies,
│   │   │                              queue) is on the ERP's page.
│   │   │                              `lib/erp-sync/feed-key.ts`,
│   │   │                              `revenue/link-actions.ts`,
│   │   │                              `_components/ErpLinkPanel.tsx`.
│   │   │                              **NOT OURS (2026-09-19):** the feed names
│   │   │                              whoever the ERP put on the document and
│   │   │                              the portal can only place a name a human
│   │   │                              MATCHED once (`comm_agent_aliases`) —
│   │   │                              there is no auto-match by name. Some of
│   │   │                              those names are nobody: AutoCount import
│   │   │                              stubs (ERP staff code `ACIMP-<name>`,
│   │   │                              opened by the cutover from the agent
│   │   │                              string on an old document), ex-colleagues
│   │   │                              who still hold an `EMP-` number, a
│   │   │                              director selling outside the scheme. They
│   │   │                              can never be answered, so a red list full
│   │   │                              of them makes the real work unfindable.
│   │   │                              `comm_ignored_agents` is the other answer
│   │   │                              — *Not ours* on the Match panel — and it
│   │   │                              takes their bills OUT: `cancelled` with
│   │   │                              `sales_orders.excluded_reason =
│   │   │                              'ignored_agent'`, so they leave the
│   │   │                              month's sales, the venue and person
│   │   │                              breakdowns and the engine exactly as an
│   │   │                              ERP-cancelled bill does (user 2026-09-19).
│   │   │                              Applied by TRIGGER
│   │   │                              (`sales_orders_ignored_agent`), not inside
│   │   │                              the ingest, because the ERP re-pushes a
│   │   │                              document on every save and a file import
│   │   │                              writes the same table. Refuses a name that
│   │   │                              is MATCHED (23IGN) — that is somebody's
│   │   │                              pay — and leaves a month whose run has
│   │   │                              paid alone. `erp_sync_ignore_agent` /
│   │   │                              `_unignore_agent` / `_ignored_agents`,
│   │   │                              mig `20260919030000`. Brand does NOT gate
│   │   │                              commission — `classifyLine` reads
│   │   │                              `item_group` and the KPI list, nothing
│   │   │                              else — so a brand we no longer carry
│   │   │                              (MYLATEX) is only out while its
│   │   │                              salesperson is.
│   │   │                              **NOT COUNTED (2026-09-27):** one BILL,
│   │   │                              not a person: right-click a row on
│   │   │                              `[period]/orders` (or its ⋯) → *Don't
│   │   │                              count this bill*. A
│   │   │                              `sales_order_exclusions` row makes it
│   │   │                              `cancelled` + `excluded_reason =
│   │   │                              'manual'` — out of everything a cancelled
│   │   │                              bill is out of — kept through every ERP
│   │   │                              re-send by trigger
│   │   │                              (`sales_orders_manual_exclusion`);
│   │   │                              ignored_agent > manual > ERP status. In a
│   │   │                              month that pays Open Bill its pick is
│   │   │                              remembered, the day renumbered, and
│   │   │                              *Count this bill again* restores both.
│   │   │                              23RUN / 23EXC. `revenue_exclude_order` /
│   │   │                              `revenue_include_order`,
│   │   │                              `lib/commission/bill-exclusion.ts`,
│   │   │                              `BillContextMenu`, mig `20260927020000`.
│   │   │                              The same menu (`useBillMenu`,
│   │   │                              `BillCountNotice`) is on a salesperson's
│   │   │                              ledger on the month — Personal /
│   │   │                              Overriding / Below deposit — and the
│   │   │                              month's Below deposit tab (user
│   │   │                              2026-09-27); a carried-in bill answers
│   │   │                              to ITS month's lock
│   │   │                              (`lockedPeriods`).
│   │   │                              **THE WORKBENCH IS A URL (2026-09-27):**
│   │   │                              `?view=` (the cut) / `?person=` /
│   │   │                              `?orders=` (their table), pushed with
│   │   │                              `history.pushState`; `q` / `brand` /
│   │   │                              `sort` replaced as typed
│   │   │                              (`lib/commission/workbench-nav.ts`).
│   │   │                              It was React state, so Back from a bill
│   │   │                              opened on ANTHONY's ledger landed on the
│   │   │                              list of people. NOT `?tab=` — that is
│   │   │                              MonthBreakdownTabs' (gone 2026-09-27). Bill links carry
│   │   │                              `?from=`; the bill page leads with
│   │   │                              "← ANTHONY" (`ReturnLink`: steps Back
│   │   │                              when the previous entry IS that page —
│   │   │                              Navigation API — else a plain link).
│   │   │                              **ONE RAIL AT THE TOP (2026-09-26):** the
│   │   │                              workbench's tabs (`CommissionWorkbench`)
│   │   │                              are Total Sales Orders / KPI Items / Open
│   │   │                              Bill / **Below deposit** / **Sales by
│   │   │                              venue**, one table design. Below deposit =
│   │   │                              every bill the gate holds (live engine
│   │   │                              verdict, `status = 'deposit_pending'`) with
│   │   │                              Paid, Deposit needed and **Still to
│   │   │                              collect**; a salesperson's page has the
│   │   │                              same tab beside Personal / Overriding.
│   │   │                              Sales by venue is one row per FAIR (venue ·
│   │   │                              days · organiser, `salesByFair` in
│   │   │                              `lib/venues.ts`, from each bill's
│   │   │                              `fair_event_id`), READ-ONLY — the fair and
│   │   │                              its organiser come from the ERP (2026-09-27,
│   │   │                              above). The Total Sales Orders table
│   │   │                              gained **Group sales**; the saved run's
│   │   │                              per-person table, the old *Waiting on a
│   │   │                              deposit* section and *Sales by person* are
│   │   │                              gone (user 2026-09-26). The bottom rail
│   │   │                              went with *Payroll & source tools*
│   │   │                              (2026-09-27, below).
│   │   │                              **SEND TO PAYROLL (2026-09-27):** the month
│   │   │                              is worked out LIVE every time the page
│   │   │                              opens; payroll holds only what was SENT, and
│   │   │                              the page never said so — the button was
│   │   │                              *Recompute & sync payroll* at the foot of a
│   │   │                              folded *Payroll & source tools* section, so
│   │   │                              the user read the live figure as synced
│   │   │                              (本来它就一直都在 sync 的，不是吗？). September, the first
│   │   │                              paying month, had never gone: six warnings,
│   │   │                              all rules not gaps. Now a **payroll bar**
│   │   │                              under the cards (`PayrollBar`,
│   │   │                              `lib/commission/payroll-send.ts`) says not
│   │   │                              sent / in payroll (matching or moved since)
│   │   │                              / closed / settled by hand, lists what stops
│   │   │                              a send BY NAME (engine warnings + unmatched
│   │   │                              agents — what the send checks), and sends
│   │   │                              with one click: `send_commission_to_payroll`
│   │   │                              refuses a warning before anything moves and
│   │   │                              replaces a run already in payroll (reopen +
│   │   │                              save + apply) in ONE transaction; *Take
│   │   │                              back* = `reopen_commission_run`;
│   │   │                              `commission_payroll_closed(period)` asks the
│   │   │                              writes' guard (HR cannot read payroll_runs /
│   │   │                              period_locks). The bar sends the month AS
│   │   │                              SAVED, never the screen's draft. The month's
│   │   │                              switches (*This month pays*) sit in its
│   │   │                              foot. The whole foot section is gone —
│   │   │                              saved-run hero, warnings list, Open Bill
│   │   │                              cost, payroll-adjustment table (still on a
│   │   │                              person's statement), below-margin list,
│   │   │                              hand-typed upsales. Engine: a department
│   │   │                              head's own bills (KRIS / PETER, 23DIR) earn
│   │   │                              NOTHING and raise no warning
│   │   │                              (`EngineInput.departmentHeadIds`, read by
│   │   │                              `loadCommissionInput`). **THE LADDER IS THE
│   │   │                              BILL'S BRAND** (user: 主体是 Akemi 就跟 Akemi 的
│   │   │                              margin ladder): `SalesOrder.brandCode` =
│   │   │                              `sales_orders.brand_code` (the ERP's
│   │   │                              Branding) is what `marginBase` answers to —
│   │   │                              accessories and bed frames are RIDERS, their
│   │   │                              cost in the bill's margin on the bill's
│   │   │                              ladder, whatever brand they carry; only a
│   │   │                              bill with no brand (a bed frame or accessory
│   │   │                              sold alone) reads its lines, and only a
│   │   │                              month that pays margin asks about two priced
│   │   │                              brands. The member app already grouped by
│   │   │                              the bill's brand. The ledger's per-bill
│   │   │                              button is now the REAL *Don't count this
│   │   │                              bill* (`excludeOrder`, Undo on the notice;
│   │   │                              *Show not counted* lists that person's bills
│   │   │                              with *Count again*) — the session-only
│   │   │                              *Exclude* draft is gone. Mig
│   │   │                              `20260927030000`.
│   │   │                              **THE MONTH ENDS IN A RAIL (2026-09-17, GONE 2026-09-27,
│   │   │                              trimmed 2026-09-26):** `[period]` closed on
│   │   │                              three cuts of the same bills, one
│   │   │                              `SlidingTabs` rail (`?tab=`,
│   │   │                              `MonthBreakdownTabs`): Sales by venue /
│   │   │                              Sales by person / **Open Bill**.
│   │   │                              Only one is ever being read, and stacked
│   │   │                              they meant scrolling past every venue to
│   │   │                              reach a person. THE RAIL IS THE HEADING —
│   │   │                              its labels are those sections' old
│   │   │                              `.sect-head` titles — and every panel is
│   │   │                              server-rendered and handed over as a node,
│   │   │                              so switching is a `pushState` and a
│   │   │                              re-render, never a round trip.
│   │   │                              **Open Bill** is what the picks COST: by
│   │   │                              rank, by salesperson, and every picked bill
│   │   │                              (`lib/commission/open-bill-summary.ts`).
│   │   │                              The money is read from the RUN's own lines
│   │   │                              (`comm_statement_lines`, component
│   │   │                              `open_bill`, `_lib/open-bill.ts`), never
│   │   │                              recomputed, so a month nobody has computed
│   │   │                              shows its picks and says plainly that
│   │   │                              nothing has been paid. A run ALSO pays Open
│   │   │                              Bill on bills carried in from earlier
│   │   │                              months — the deposit gate releases a bill
│   │   │                              with its pick — so that money is reported
│   │   │                              on its own line rather than credited to
│   │   │                              this month's picks. A bill the run paid
│   │   │                              nothing on says WHY: Held / Nobody to pay /
│   │   │                              No base / **Not in this run**, the last
│   │   │                              being a bill that arrived after the run was
│   │   │                              computed.
│   │   │                              **THE MONTH, UNDERNEATH (2026-09-16):**
│   │   │                              `[period]/orders` is every bill of the
│   │   │                              month, filterable by person or venue
│   │   │                              through the URL — and since 2026-09-18
│   │   │                              it is ALSO where the Open Bill pick is
│   │   │                              made (`OpenBillPicker`): which of a day's
│   │   │                              bills came first is argued from the
│   │   │                              margin, the venue and the customer, and
│   │   │                              those were a page away on the old board.
│   │   │                              THREE CLICKS: an unheld rank claims it, a
│   │   │                              rank held only as the importer's
│   │   │                              SUGGESTION (dashed) confirms on the same
│   │   │                              click, a rank a human already confirmed
│   │   │                              (solid) clears. Without the middle one,
│   │   │                              agreeing is harder than disagreeing.
│   │   │                              `open-bill/` stays as the narrow queue.
│   │   │                              `orders/[orderId]`
│   │   │                              is one bill line by line — what each
│   │   │                              line COUNTS AS (commissionable / KPI /
│   │   │                              not / group-not-classified) and what it
│   │   │                              cost. `revenue_month_orders` feeds both
│   │   │                              and reads a bill the way the ENGINE
│   │   │                              does: margin over the commissionable
│   │   │                              base, NULL the moment one of its lines
│   │   │                              has no cost. An RPC because a month's
│   │   │                              ~1,700 lines run past PostgREST's
│   │   │                              1,000-row page.
│   │   │                              **VENUE + ORGANISER:** `header.venue`
│   │   │                              (the fair) was always arriving and
│   │   │                              always dropped — now a column on
│   │   │                              `sales_orders`, grouped as *Sales by
│   │   │                              venue*. `comm_venues` is the register of
│   │   │                              PLACES; `canonical_key` folds two
│   │   │                              spellings into one (`venue-actions.ts`,
│   │   │                              `lib/venues.ts`). The ERP sends NOTHING
│   │   │                              about who ran the event, and
│   │   │                              **the same venue has a different
│   │   │                              organiser month to month** (user
│   │   │                              2026-09-17), so the organiser is a
│   │   │                              (venue × month) row —
│   │   │                              `comm_venue_events` — naming an
│   │   │                              organiser from the register
│   │   │                              `comm_organisers`. One lookup,
│   │   │                              `venue_event_organiser()`, is what
│   │   │                              `revenue_month_orders` and the order page
│   │   │                              both read. `comm_venues.organizer` is
│   │   │                              SUPERSEDED (migrated, unread, not dropped).
│   │   │                              Mig `20260918040000`.
│   │   │                              `location` is NOT the fair — it is the
│   │   │                              ERP's sales_location, the warehouse
│   │   │                              (KL / PG / SRW).
│   │   │                              **ONE PLACE, ONE ROW (2026-09-18):** the
│   │   │                              venue is free text typed at the fair, so
│   │   │                              thirty-odd places arrive under sixty
│   │   │                              spellings (`PISA SPICE ARENA` /
│   │   │                              `PISA SPICE ARENA CONVENTION CENTRE`).
│   │   │                              No rule can tell which are one place —
│   │   │                              `SPICE ARENA` and `SETIA SPICE
│   │   │                              CONVENTION CENTRE` are two halls of one
│   │   │                              complex — so a human says so once:
│   │   │                              `comm_venues.canonical_key` (mig
│   │   │                              `20260918020000`, *same place as…* on
│   │   │                              Sales by venue). ONE LEVEL, by trigger
│   │   │                              (23VEN): no alias of an alias.
│   │   │                              `venue_group_key()` resolves it and
│   │   │                              `revenue_month_orders` returns
│   │   │                              `venue_group_key` / `venue_group_name`
│   │   │                              beside the order's own spelling — the
│   │   │                              spelling stays on the row (it is what
│   │   │                              the document says), the PLACE is what
│   │   │                              groups, filters and carries the
│   │   │                              organiser. Nothing is merged
│   │   │                              automatically, ever.
│   │   │                              **THE COST THE ERP DOES NOT SEND
│   │   │                              (2026-09-18):** a bill has a margin only
│   │   │                              when EVERY commissionable line has a
│   │   │                              cost, and the Product List fallback
│   │   │                              matched `item_code` alone — so the ERP's
│   │   │                              `AKEMI ULTIMATE MATT (K)` never found
│   │   │                              the list's `AK-ULTIMATE MATT (K)` and
│   │   │                              268 mattress lines (RM 1.87M) blinded
│   │   │                              their bills. `comm_products.erp_item_code`
│   │   │                              is the bridge (ERP code column on the
│   │   │                              Product List; 37 seeded by the
│   │   │                              `AKEMI `→`AK-` rule, nothing ambiguous).
│   │   │                              `comm_product_unit_cost()` is the ONE
│   │   │                              lookup; trigger
│   │   │                              `sales_order_lines_fill_cost` costs every
│   │   │                              line that arrives without one, whichever
│   │   │                              path wrote it; `recost_sales_order_lines`
│   │   │                              does the months already landed and
│   │   │                              REFUSES a paid run (23RUN) — a cost moves
│   │   │                              the margin, the margin moves the band,
│   │   │                              the band moves the commission, so the run
│   │   │                              must be computed again.
│   │   │                              `revenue_uncosted_products()` is what is
│   │   │                              left, on *Why those bills have no
│   │   │                              margin*. Mig `20260918010000`.
│   │   │                              **THE FEED WINDOW:**
│   │   │                              `erp_feed_settings.min_order_date`
│   │   │                              (Fair 2026-08-01, edited on the ERP link
│   │   │                              card) — an order dated before it is
│   │   │                              answered 200 `skipped` and never becomes
│   │   │                              a month. The ERP back-filled to 2023 and
│   │   │                              kept editing those documents; `vp.since`
│   │   │                              is its half, this is the portal's.
│   │   │                              **WHAT THE MONTH PAYS:** `[period]/pay`
│   │   │                              is the salary board — commission by
│   │   │                              component, employer and employee
│   │   │                              statutory, tax, net — and
│   │   │                              `pay/[staffId]` the payslip behind it,
│   │   │                              Open Bill bill by bill with the rule
│   │   │                              that paid it. `revenue_pay_preview`
│   │   │                              returns the INPUTS (pro-rata window,
│   │   │                              schedule lookups, the payroll row if
│   │   │                              there is one); the arithmetic is
│   │   │                              `lib/revenue-pay.ts`, the twin of
│   │   │                              `compute_hr_monthly_payroll` for
│   │   │                              `source='commission'` — employer EPF /
│   │   │                              SOCSO / EIS come OUT of the commission,
│   │   │                              PCB is read on the basic alone. It is a
│   │   │                              PREVIEW until the run is synced, and
│   │   │                              says so when payroll disagrees.
│   │   │                              Migs `20260917020000` / `030000`.
│   │   │                              IR rules: commission spec §15; two layers,
│   │   │                              repeated own sales per group, monthly
│   │   │                              packages and a 4% fallback. SDL retains
│   │   │                              already opened capacity, separate from
│   │   │                              company title/permission grants. Initial
│   │   │                              Full Spec 3×3 enables the fourth line;
│   │   │                              each further opening requires all
│   │   │                              existing lines to qualify in its actual
│   │   │                              opening month (4→5, 5→6, onward). Unused
│   │   │                              qualification cannot be banked for a weak
│   │   │                              later month. Later groups use the same
│   │   │                              repeated-own target and fixed package.
│   │   ├── reports/                 (Phase 3)
│   │   └── settings/                ← 8 tabs: treasury / overdue / splits / directors / companies / banks / periods / simulator
│   ├── (member)/member/            ← the Revenue member app: one phone-shaped
│   │                                  workspace for a salesperson, NOT the portal.
│   │                                  Its own design language (warm editorial,
│   │                                  `components/member/member.module.css`), its
│   │                                  own nav: Today / Income / Quote / Team /
│   │                                  **Profile** (was Account until 2026-09-13;
│   │                                  Insight lives INSIDE it, first card, and
│   │                                  `page=insight` keeps Profile lit). `preview/` renders
│   │                                  it in a phone frame on demo data
│   │                                  (`lib/member/demo*.ts`); dev-only, and
│   │                                  Principal/HR in production.
│   │                                  **INSIGHT (2026-09-16)** answers "how am I
│   │                                  doing" from COMMITTED ORDERS, not from the
│   │                                  month's statement — a run happens once a
│   │                                  month, so the statement is last month's
│   │                                  answer for most of it. Three views:
│   │                                  My sales (own revenue, KPI units, the gap
│   │                                  to the next rung's gate, blended margin,
│   │                                  every order in its margin band), Ranking
│   │                                  (everybody, split by sub-department) and
│   │                                  Downline (each leg of the caller's team).
│   │                                  It counts the way `engine.ts` counts:
│   │                                  commissionable lines only, the DEPOSIT GATE
│   │                                  applied (held revenue reported separately,
│   │                                  never inside sales), carry-forward honoured
│   │                                  via `comm_order_releases`, and an order with
│   │                                  no usable margin counted in sales but left
│   │                                  out of the blended margin. SALES AND MARGIN
│   │                                  ONLY — no commission, rate or salary of
│   │                                  anybody, including the caller's own on a
│   │                                  board. Gated by the `member_insight`
│   │                                  permission, which the neutral member
│   │                                  allowlist in `current_permissions()` had to
│   │                                  learn (mig 20260916010000). Arithmetic in
│   │                                  `lib/member/insight.ts`, data in
│   │                                  `member_insight_snapshot()`.
│   │                                  **TWO MARGINS, AND THEY ONLY SEE THE
│   │                                  SECOND (2026-09-19):** layer 1 is price
│   │                                  vs the ERP's cost — what the COMPANY
│   │                                  makes; layer 2 is price vs
│   │                                  `cost ÷ comm_schemes.revenue_cost_divisor`
│   │                                  (Fair 0.7) — what the SALESPERSON is
│   │                                  measured and paid on. Layer 2 is the only
│   │                                  one the member app may show (user
│   │                                  2026-09-19). `member_order_facts` is the
│   │                                  ONLY member-side function that touches
│   │                                  `cost_amount`, and RLS keeps
│   │                                  `sales_orders`/`_lines` to hr+admin, so
│   │                                  that one division is the whole boundary —
│   │                                  it had been missing since PR #114 and the
│   │                                  app read 12–22 points high (mig
│   │                                  `20260919050000`).
│   │                                  **MARGIN INCENTIVE (2026-09-19):** the
│   │                                  Arena's fourth board, and NOT a ranking —
│   │                                  the tier is money and everyone on a tier
│   │                                  gets the same money, so a board of tiers
│   │                                  would be a board of pay. It is the viewed
│   │                                  person's own: tier, RM, each brand's
│   │                                  margin, and how many points short the
│   │                                  BINDING brand is. `arenaIncentive()` in
│   │                                  `lib/member/arena.ts` mirrors
│   │                                  `marginIncentiveAcrossBrands` — thresholds
│   │                                  follow the BRAND and differ (AKEMI/ERGOTEX
│   │                                  36+43, DUNLOP/ZANOTTI 33+36, mig
│   │                                  `20260919040000`), EVERY brand sold must
│   │                                  clear a tier, earned tiers are the
│   │                                  INTERSECTION and the money stacks; a brand
│   │                                  with an uncosted bill, or a bill with no
│   │                                  brand, HOLDS the lot and the board names
│   │                                  it. The ladder rides in the snapshot
│   │                                  (`tiers`, mig `20260919060000`).
│   │                                  **FAIR RESULTS (2026-09-21):** the Arena's
│   │                                  *Championship & Fair results* page said
│   │                                  "not connected yet" because a finish needs
│   │                                  a fair's venue and DATES, and an order date
│   │                                  beside a branch label cannot identify one.
│   │                                  `20260920050000` gave `comm_venue_events`
│   │                                  start/end and stamps every bill with
│   │                                  `sales_orders.fair_event_id`, so the board
│   │                                  is now real: each completed fair ranked on
│   │                                  its own, medal counts per person, and the
│   │                                  **Highest Fair Record** (largest single
│   │                                  fair, all-time, outside any window).
│   │                                  PROVISIONAL AND IT SAYS SO — a recorded
│   │                                  sale is not attendance, so somebody who
│   │                                  worked a fair and sold nothing cannot be
│   │                                  told from somebody who was never there;
│   │                                  and a bill no fair could claim is COUNTED
│   │                                  OUT LOUD (`unassignedOrders`/`Sales`, 196
│   │                                  bills / RM 1.12M on 2026-09-21) rather
│   │                                  than spread over the fairs that did
│   │                                  happen. Nothing is awarded: every
│   │                                  `points` field is 0 and the championship
│   │                                  stays `pending`. Same roster, committed
│   │                                  sources, deposit gate and commissionable
│   │                                  lines as `member_arena_for_staff` — a
│   │                                  fair's sales must agree with the month's.
│   │                                  `lib/member/arena-history.ts`, mig
│   │                                  `20260921010000`, and the design-preview
│   │                                  `ArenaFairResults`/`RankingList` are the
│   │                                  live board (parameterized `selfId`, so
│   │                                  one component serves both).
│   │                                  **TEAM** is a mapping map, not an indented
│   │                                  list: every sub-department as a frame, its
│   │                                  directors above it, one card per MEMBERSHIP,
│   │                                  drag to pan. Placed by the same `layoutTree`
│   │                                  the portal's charts use, via
│   │                                  `lib/member/org-map-layout.ts`, on
│   │                                  `member_org_map()`. Names, titles and
│   │                                  reporting lines only.
│   │                                  **INSTALLABLE (2026-09-23):** the whole
│   │                                  portal is a PWA — ONE app, `start_url`
│   │                                  `/` (which already routes member →
│   │                                  /member, everybody else → /dashboard).
│   │                                  `public/manifest.webmanifest` is linked BY
│   │                                  HAND in the root layout's <head>: an
│   │                                  `app/manifest.ts` gets streamed into
│   │                                  <body> and Chrome then refuses to install.
│   │                                  `public/sw.js` caches NOTHING but
│   │                                  `offline.html` — every page is somebody's
│   │                                  money, and a cached copy would outlive the
│   │                                  session on a shared phone. Install entry
│   │                                  points: login card, member Profile row,
│   │                                  Principal Profile card (`components/pwa/`,
│   │                                  `lib/pwa/install.ts`). Icons from
│   │                                  `tools/generate-pwa-icons.mjs`.
│   └── api/erp/v1/                 ← the ONLY machine endpoints: the Houzs ERP's two
│                                      receivers — `sales-orders` (POST, live per-save)
│                                      and `products` (POST, the catalogue mirror —
│                                      SKU master, Modular, Maintenance, fabrics,
│                                      combos; ITEMS ONLY, 2026-09-24), plus `health`
│                                      (GET). The only POST route handlers in the app —
│                                      see the machine-ingest exception under Coding
│                                      Conventions. Everything else stays Server Actions.
├── components/
│   └── layout/                     ← Sidebar, TopBar
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← Browser client (anon key + RLS)
│   │   ├── server.ts               ← Server client (anon key + RLS via SSR cookies)
│   │   ├── admin.ts                ← Service role client. BYPASSES RLS. 'server-only',
│   │   │                              built on FIRST USE not at import time. Six callers,
│   │   │                              listed under Coding Conventions › Supabase client.
│   │   │                              Another is a decision, not a detail.
│   │   └── database.types.ts       ← Generated from Supabase
│   ├── auth.ts                     ← requireAuth / requireRole helpers
│   ├── roles.ts                    ← canAccess* helpers for sidebar visibility
│   └── utils.ts                    ← formatMoney / formatDate / cn / dayjs helpers
├── test/
│   └── setup.ts                    ← Vitest + jest-dom matcher setup
├── types/
│   └── index.ts                    ← All TypeScript interfaces
├── (no middleware.ts)              ← it sits at the REPO ROOT, which Next never
│                                     loads while the app is in src/ (the build's
│                                     middleware manifest is empty; a signed-in
│                                     GET /login answers 200 — found 2026-09-27).
│                                     Gating is the layouts' requireAuth. Moving
│                                     it would switch on session refresh +
│                                     redirects everywhere: its own decision.
supabase/
├── migrations/                     ← 16 SQL migration files (core → Step 9 dashboard RPC)
├── seed/                           ← (empty — seed scripts in /scripts)
└── config.toml                     ← Supabase project link
scripts/
├── seed-users.mjs                  ← 4 test users (principal/finance/hr/marketing)
├── seed-principal.mjs              ← Initial principal account
├── seed-test-data.mjs              ← Step 8 QA test data (backdated loans + savings)
├── check-loans.mjs                 ← DB inspection helper
├── check-dashboard.mjs             ← dashboard_summary() RPC smoke test
└── migrate-emails.mjs              ← @houzs.my → @venture.my domain migration
tools/
├── patch-yoga-wasm.mjs          ← postinstall. Replaces yoga-layout's runtime
│                                  WebAssembly.instantiate() with a statically
│                                  imported .wasm module, which is the only form
│                                  workerd accepts. CI must run plain `npm ci`.
├── assert-open-next-wasm.mjs    ← reads the built worker bundle, proves the fix
│                                  is present and in the right shape
├── smoke-worker-pdf.mjs         ← starts the built worker in workerd, asks for a
│                                  real PDF, checks where the text landed
└── yoga-setter-sweep.mjs        ← measures what src/lib/export/pdf.test.ts
                                   actually catches (see TESTING.md)
docs/
├── DESIGN.md                       ← Design system v3.0 (Ledger-Dense / single source of truth for ALL UI)
├── db-schema.md                    ← Database schema reference (32 tables)
├── access-matrix.md                ← Role permissions reference
├── module-spec-phase1.md           ← ✅ Shipped: Dashboard, Fund IN/OUT, Overdue, Statements
├── module-spec-phase2.md           ← Phase 2: Dept Pool, Service Billing
└── module-spec-phase3.md           ← Phase 3: Director Salary Engine, HR Costing, Reports
.gstack/
└── qa-reports/                     ← Phase audit reports (gitignored screenshots/)
```
Spec Documents (MUST READ BEFORE CODING)
All specifications are in `/docs/`. These are the source of truth:
db-schema.md — 32 tables, all fields, relationships, constraints
access-matrix.md — 4 roles × 9 modules, RLS patterns, data visibility
module-spec-phase1.md — Dashboard, Fund IN, Fund OUT, Overdue & Netting
module-spec-phase2.md — Dept Pool, Service Billing (5 modes)
module-spec-phase3.md — Director Salary Engine, HR Costing, Reports
module-spec-payroll-cycles.md — THE THREE PAYROLLS (design, 2026-09-16, nothing
  built). Imported (Marketing/HR/Finance/IT/Director Office, 7th), Director
  (board, 7th) and Revenue (commission, 15th) close on different days, but
  `submit_payroll_to_principal` closes the whole MONTH at once — which is why
  August 2026's Revenue commission can never be computed. Proposes cycle =
  (month × track), the CEO's 1%-of-committed-sales share, the statutory-filing
  timing risk and the six reports. Read it before touching payroll closing.
module-spec-revenue-commission.md — Revenue Department commission payroll: the
  second payroll TYPE (ERP sales orders → commission engine → the one
  `hr_monthly_payroll.commission_amount` field). Sub-departments, the tier
  ladder, deposit gate, brand margin bands, Withholding Tax. Read this before
  touching anything under `comm_*` / `sales_*` or `/revenue`. §3.0 explains the
  routing: every page is scoped to a sub-department (`/revenue/fair/rules`) and
  the sidebar's Revenue children are database rows, not constants.
erp-sync/contract.md — the Houzs ERP → portal LIVE sales-order feed (2026-09-05):
  the receiver at `/api/erp/v1/sales-orders`, the delivery shape (the ERP's own
  rows, verbatim), what each outcome means, and the three SQL files the ERP
  team applies on their side (`docs/erp-sync/houzs-erp-side/`). Read this before
  touching `src/lib/erp-sync/`, `src/app/api/erp/` or `ingest_erp_sales_order`.
DESIGN.md — v3.0 Ledger-Dense design system. **Single source of truth for all UI.** Colors, typography, components, page anatomy, the v3.0 utility classes (`.num`, `.ledger-table`, `.page-head`, etc), and canonical reference pages.
ALWAYS reference these docs before implementing any feature.

Other project docs (at repo root):
TODOS.md — Phase 1.5 tech debt, Phase 2/3 prerequisites, compliance gates
.gstack/qa-reports/qa-report-phase1-2026-04-10.md — Phase 1 acceptance audit (6 findings, 2 fixed, 3 deferred to 1.5)
Permissions (2026-09-01 — replaced the four hard-coded roles)
Every gate in the portal reads a PERMISSION, not a role. A permission is granted
by a TITLE (Team → Role & Permission), with a per-person exception available on
somebody's page. `permission_defs` is the catalog; `has_scope()` derives the
table-level scopes RLS asks about, so a title cannot be granted a page whose
queries then come back empty.
  App:  `requirePermission('treasury')`, `can(user, 'reports')`, `canAccessX(user)`
  DB:   `(SELECT has_scope(ARRAY['treasury']))`
        The same wrapping is mandatory for `current_user_role()`,
        `current_user_segment()` and `current_user_department_id()` inside a
        policy: `(select current_user_role())`. Bare, Postgres re-runs the
        `users` lookup for EVERY ROW the policy checks (mig 20260909150000
        fixed 18 such policies; the `users` table had been scanned 32.6M
        times). The migration ends with a guard that fails if one comes back.
A title with NO permissions of its own falls back to the role its holder's
account was created with — which is why the cutover changed nobody's access.
`users.role` survives ONLY for that fallback and for the 16 dept_manager
row-scoped policies no scope can express. Do not add new gates that read it.

View as (2026-09-27): the Principal's `vp-view-as` cookie is shared by every
tab. *Revenue View* (`revenue_member`) is honoured by the member app ONLY
(`getMemberUser`); the portal's `getUser` ignores it. Before, switching one tab
to Revenue View sent every other tab's portal page to /dashboard — a Product
List tab "jumping to Overview". `vp-view` is a readable mirror of the choice,
so a tab left open re-renders its shell when another tab switches
(`useViewAsSync`, `lib/view-as.ts`).

4 Roles (now: the fallback each account is created with)
Role	DB Value	Access
Principal	`principal`	Everything + Approve + Settings
Finance	`finance`	Treasury + Billing + Reports — no individual salary, no Director Salary module, no Director Pool (v2 2026-07-21: calculator is Principal + HR only)
HR	`hr`	Staff costs + Director Salary + Claims + Director Pool (v2 calculator, granted 2026-07-21) + Revenue Department (commission rules, hierarchy, runs — but NOT the Product List, which is Principal-only)
Dept Manager	`dept_manager`	Own department only
Key Business Rules
Treasury
Subsidiaries deposit savings in HV at negotiated rates (per-deal, not fixed)
HV lends to subsidiaries at Base Rate + per-loan custom premium (set at creation, locked for the loan's life). Tier system was removed mig 63 — no T1/T2/T3 labels anywhere.
Base Rate = Weighted Avg Cost of Paid Capital + Op Margin (quarterly, Principal approves)
Loan rate locked at creation, never changes
Free pool priority when lending (tracked via Dashboard, not separate allocation)
Director Salary (Most Complex Module)
7 subs pay CTC (basic + KPI with statutory, allowance without) → total = HV revenue
Pool ÷ 4 × weightage → per director gross
5% saving deducted on non-statutory portion
75/25 split: payroll vs invoice to outsource
75% payroll: min RM14,400 gross → deduct EPF ER + EE, SOCSO ER + EE, EIS ER + EE, PCB → net to director
25% invoice: base + employer statutory → accumulate in isolated pool
PCB: lookup Jadual PCB table (not calculated)
All statutory: table lookup, NOT flat percentages
Monthly Consolidated Statement
Invoice items (billable) + Contra items (loan repayment, savings interest)
Loan repayment is NOT invoiced, only listed as contra
Net amount = Invoice total - Contra total
One statement per subsidiary per month
Data Visibility
Finance CANNOT see individual employee salaries — only department lump sum
Finance CANNOT access the Director Salary module or Director Pool at all. (Director Pool v2 2026-07-21: the old aggregate-bucket view Finance used was replaced by the standalone calculator — Principal + HR only.)
HR CAN access Director Pool v2 (standalone calculator — full per-director detail; granted by user 2026-07-21)
Only HR and Principal can see individual salary details
Member catalogue & margin cost basis (2026-09-12, catalogue 2026-09-24)
The member Quote page sells from the Product List, not a list of its own: `member_catalogue()` (mig `20260924040000`) answers every SKU ticked on **Product List › Modular** (`catalogue_skus.offered`, and its model's `catalogue_models.offered`), still ACTIVE in the ERP, under a brand the member's calculator scheme sells — "10 SKUs, 7 ticked → the calculator offers 7" (user 2026-09-24). Both snapshots read it UNPRICED (names, sizes, the sofa grid's height × tier choices, each sofa / bed frame model's dropdowns = the portal's ticks ∩ what the ERP still allows ∩ the live Maintenance pool) and return `catalogueModels`; the quote reads it PRICED through the service role only (`lib/member/server.ts`, after `member_quote_context` authorised the session) — no price ever reaches a browser. The cart carries ONE sofa build (seat height, tier, leg, specials) and ONE bed frame build (divan, leg, total, gap, specials); a dropdown offers only what every model of that kind in the cart was ticked for (`lib/member/build.ts`), and the server refuses anything else. The calculator costs the way the run does (`lib/member/calculator.ts` `costLines` over `lib/catalogue/*`): SKU price at the build + option surcharges, a matched priced combo costed as the combo. People › Member Services › Product options is now a pointer to Modular (`comm_products` / `member_product_options` are no longer read by the member app). **Riders**: bed frames and accessories carry NO brand — they join any cart, their cost counts in the one margin, and the mattress or sofa's brand decides the ladder (in the run: the bill's own brand, the ERP's Branding — `SalesOrder.brandCode` into `marginBase`, 2026-09-27) — and so does anything marked *Rider* on Modular (`catalogue_models.brand_code = 'RIDER'`, read as no brand, never as one). A mattress or sofa is never a rider by default: one whose ERP branding matches no brand (MYLATEX, or none — 170 SKUs on 2026-09-24) is not offered until a Margin ladder is chosen for it, and Modular says so (`isRiderModel`, `lib/catalogue/options.ts`). A model's dropdown with an EMPTY ERP list is the whole Maintenance pool — the ERP's own "no restriction" (`erpAllows`). **Cost basis**: Revenue Team cost = cost ÷ `comm_schemes.revenue_cost_divisor` (Fair 0.7; Rules › Scheme rules) in the calculator, the snapshot order margins and the run alike. Margin = (price − cost) ÷ price; the price for threshold t is cost ÷ (1 − t), never cost × (1 + t). Mig `20260915060000`.
Development Phases
Phase 1 (✅ Shipped 2026-04-10): Treasury Core
Dashboard (dashboard_summary RPC), Fund IN, Fund OUT, Overdue & Netting,
Monthly Statements, Approvals (Finance→Principal workflow), Settings, Auth
9-step Forge pipeline (see Phase 1 commits a04a7bf..9a5e663)
Phase 2 (✅ Shipped 2026-04-10): Department + Billing
HR Cost Submission, Dept Pool (Marketing P&L), Service Billing (5 modes),
Invoice Generation RPC, Invoice→Statement wiring, Rent/Utility templates,
Unified config audit log (L2 fix), Dashboard KPI extensions (billing float,
dept pool total, Marketing NP). M2 cancelLoan fix bundled in Step 2.
9-step Forge pipeline (commits e58a8bb..Step 9). See
`.gstack/qa-reports/qa-report-phase2-2026-04-10.md`.
Phase 3: Salary + HR + Reports
Director Salary Engine, HR Costing, Claims, Reports, Statutory Tables
GStack Workflow
For each phase:
```
1. /plan-eng-review    → Review spec, find edge cases, output diagrams
2. /design-consultation → Design system, component patterns
3. Parallel development → Backend API + Frontend UI (git worktree)
4. /ship               → Test, coverage, PR
5. /qa                 → Edge cases, security, RLS audit
6. /land-and-deploy    → Deploy to Vercel
7. /document-release   → Update docs
8. /retro              → Phase review
```
Coding Conventions
TypeScript strict mode — no `any`
Server Components by default — Client Components only when needed (forms, interactive widgets)
Writes — use Server Actions (`'use server'`), NOT API Route Handlers. Every action calls `requireRole(...)` at entry.
Read-only file downloads (PDF, CSV, ZIP binary streams) — GET Route Handlers (`app/**/route.ts`) are OK because Server Actions can't stream binary responses cleanly. Still call `requireRole(...)` at entry. Never accept write-side params — POST/PUT/DELETE route handlers remain forbidden. Locked by user 2026-04-17 (Spec 5 blocker Q5).
Machine ingest — the ONE exception to the rule above (2026-09-05, ERP live sync): another SYSTEM pushing data in (the Houzs ERP's database via pg_net) cannot call a Server Action and has no session, so it gets a POST Route Handler under `app/api/<system>/v<n>/`. TWO of them exist, both the Houzs ERP's: `sales-orders` and, since 2026-09-17, `products` (the catalogue mirror; items only since 2026-09-24). A second endpoint of an existing feed is not a second exception — a second SYSTEM would be. The exception is narrow and every part of it is required: a static shared secret from env compared in constant time and failing closed when unset (never a session, never a query param); the service-role client used for ONE thing — calling a single ingest RPC that owns every write; the path excluded from `middleware.ts`; every delivery logged (`erp_sync_events`); 2xx for every delivery the portal chose not to apply, because the sender's outbox retries non-2xx forever. Nothing a browser calls may ever be a POST handler.
Supabase client — server-side (`lib/supabase/server.ts`) uses the anon key with RLS via SSR cookies. `admin.ts` is the service-role client and BYPASSES RLS entirely. It is `'server-only'` guarded and has exactly SIX callers: `app/api/erp/v1/sales-orders/route.ts` and `app/api/erp/v1/products/route.ts` (each uses it for one thing — calling its ingest RPC; the second, since 2026-09-24 the items-only catalogue mirror, is the SAME machine path as the first, a second endpoint of one feed rather than a new kind of caller), `app/api/member-queue/route.ts` (the cron-secret queue sweep, `member_process_all_queues`), `lib/member/server.ts` (a member quote's PRICES — `member_catalogue(…, p_priced)`, service-role-only, read only after `member_quote_context` authorised the session — and the invoice attestation insert), `team/people/invite-actions.ts`, and `lib/erp-sync/feed-key.ts` (2026-09-13: the key the ERP generated and somebody pasted on Comm Cal lives in Supabase Vault behind `erp_link_put/get/drop_secret` + `erp_feed_secret`, executable by the service role ONLY — because whatever an HR user's server action can read with their session, their browser can read too, and that key opens the receiver). Reach for it only when a machine path has no session to act under or a secret must stay out of every session's reach, never to dodge an RLS policy that is merely inconvenient.
Navigation speed (2026-09-26) — a click must answer at once. Every route folder with child routes has a `loading.tsx` rendering `RouteSkeleton` (`src/app/route-boundaries.test.ts` fails otherwise): without it Next keeps the page being left frozen until the server answers. The client router keeps pages 30 s (`experimental.staleTimes`), so a write must `revalidatePath` (or set a cookie) before it redirects — that is what empties that memory. Warm a page only through `lib/nav-warm.ts` (`warmOnIntent` / `warmRoute`): one link at a time, never an `AUDITED_ROUTES` page — a full prefetch reaches the server as a render, so a page that writes access_log while rendering would log a view for a mouse-over. Nothing may fire a Server Action on its own after a navigation (page views go through `lib/page-view.ts` from the browser): Next refreshes the whole page after any navigation that interrupts a pending action. Progress: `NavProgress` in the root layout, started by `src/instrumentation-client.ts`; DESIGN.md › Navigation feedback (v3.8). A page's independent reads start together and only real dependencies wait (the month page `revenue/[sub]/[period]/page.tsx` is the pattern; wrap a PostgREST builder you await twice in `Promise.resolve` — awaiting a builder again sends it again). `fetchByKeys` runs 4 chunks at a time. Two database traps behind the 3–10 s month page (mig `20260926100000`): a SQL function that calls another SQL function PER ROW re-checks the caller's permissions on every call (`has_scope`, ~1.7 ms each — 317 bills = 1.5 s), so join the answer once instead; and under RLS only LEAKPROOF comparisons reach an index (int, date and text equality do; numeric and enum comparisons do not), so a big lookup table searched by an amount needs a SECURITY DEFINER function (`lookup_pcb`).
Aggregate queries — prefer RPC functions (`dashboard_summary`, `get_hr_cost_summary`) over scattered per-field selects. Single round-trip, clearer intent, easier to unit test at SQL level.
Error handling — Server Actions throw, pages use error boundaries, never return `{ data, error }` to the client
Date handling — store as `date` or `timestamptz` in DB, use `dayjs` for formatting. Compare by day (`dayjs().isAfter(x, 'day')`) to avoid timezone edge cases.
Money — `decimal(15,2)` in DB. Display with `formatMoney()` from `lib/utils.ts`. Negative amounts render as red parenthesis notation `(1,000.00)`.
Naming — DB: snake_case, TypeScript: camelCase, Components: PascalCase
Files — one component per file, co-locate related files (`_components/` subfolders per route)
Testing
Framework: Vitest + happy-dom + @testing-library/react (bootstrapped Phase 1.5 Step 1). Run `npm test` (watch) or `npm run test:ci` (single run). CI runs two jobs on every push (`.github/workflows/test.yml`): `test` (tests + `next build`) and `worker` (`npm run verify:worker` — builds the Cloudflare worker and renders a real PDF inside workerd). See `TESTING.md`.
Layers: unit (pure helpers in `src/lib/*.test.ts`), integration (Supabase RPC — deferred until billing math in Phase 2 Step 5 needs it), RLS audit (manual via `/qa`), E2E (Playwright MCP during per-step verification, not in CI).
Convention: every bug fix ships with a regression test. Extract pure logic from Server Actions into `src/lib/*.ts` helpers and test the helper (Server Actions themselves pull in next/cache + next/navigation + Supabase SSR cookies, mocking is more trouble than it's worth).
Placeholder pattern: when a fix is planned but not yet implemented, drop a `describe.todo('...')` stub at the expected test file location so it stays indexed without breaking CI.
API routes: test with sample data matching real scenarios
Statutory lookups: test with known values from PDF tables
Director salary: test with the two datasets provided in specs (verify against calculated results)
RLS: test each role can only access what Access Matrix allows — see `docs/access-matrix.md`
See `TESTING.md` at repo root for full layer descriptions + how to add new tests.
Do NOT
Do not hardcode any rates (interest, custom premium, penalty, saving %) — all from Settings/DB
Do not skip RLS — every table must have policies matching Access Matrix
Do not let Finance access hr_staff_costs or director_payouts detail — use aggregate views
Do not use localStorage for auth — use Supabase Auth sessions
Do not create separate apps — single Next.js app, role-based routing
Do not invent parallel design docs (no `DESIGN-v2.md`, `STYLE.md`, `UI-NOTES.md`, etc) — DESIGN.md is the single source of truth, extend it in place
Do not hardcode hex colors in components — use Tailwind tokens (`text-ink`, `bg-paper`, `text-num-ink`, `border-hairline`, `text-accent`, `text-danger`) backed by CSS vars in `globals.css`
Do not use the superpowers plugin (brainstorming/TDD/writing-plans skills, `docs/superpowers/` plan+spec files) unless really needed — default to working directly; reserve it for genuinely complex multi-step features where the planning overhead pays off

UI Conventions (v3.0 — enforced)
**Read `docs/DESIGN.md` first before adding or amending any UI.** It contains the v3.0 implementation rules + utility class catalog + canonical reference pages.

Six non-negotiable rules every new/amended page must follow:
1. **Page header** — wrap top of page in `<div className="page-head">` containing `<div className="page-eyebrow"><em>I.</em> SECTION · NAME</div>` + `<h1 className="page-title">…</h1>`. Right side may hold an action button.
2. **Money cells use `.num`** — `<td className="num">{formatMoney(x)}</td>`. Negatives get `<span className="neg">`. Hero figures use `text-num-ink` + `tabular` + `tracking-[-0.01em]`.
3. **Data tables use `.ledger-table`** — `<table className="ledger-table">` with bare `<th>` / `<td>`. Class wires up surface bg, zebra rows, hover, hairline borders, padding, and right-aligned `.num`. Stop hand-rolling `<table className="w-full text-sm">…border-b…hover:bg-…`.
4. **Section headings use `.sect-head`** — medium-weight upright sans title + hairline rule extending right + uppercase mono counter. See `src/app/(portal)/statements/page.tsx` for the canonical pattern.
5. **Colors via CSS variables only** — no hex outside `globals.css`. Use `text-ink` / `text-num-ink` / `text-graphite` / `bg-paper` / `bg-surface` / `border-hairline` / `text-accent` / `text-danger` / `text-ledger` / `text-alert` / `text-info`.
6. **A new route folder with child routes gets a `loading.tsx`** that renders `RouteSkeleton` — see Navigation speed under Coding Conventions.
7. **HR's view sits on the white sheet (2026-09-27, DESIGN.md › "Sheet theme").** Every route under `/dashboard` (all four roles' Overview), `/hr-costing`, `/director-salary`, `/director-pool`, `/revenue` (not `/revenue/products`), `/claims`, `/team` (People) and `/member-admin` — `lib/sheet-routes.ts` — is drawn by PortalFrame on one white sheet in Comm Cal's month's tone: black lettering, orange `#E99A53` only as a surface (buttons, active tab, markers — never text), walnut for the one primary figure. Open such a page with `StatCards`/`StatCard` (`components/sheet/StatCard.tsx`), not a hero or a figure strip; statuses are `.chip`s; a closing total goes in `<tfoot>`. Extending the tone to another section = add its prefix there and convert the page the same way. Reference: `src/app/(portal)/hr-costing/page.tsx`.

Canonical reference pages (copy these patterns when in doubt):
- Page header + hero number + ledger table → `src/app/(portal)/fund-out/page.tsx`
- Multi-column hero summary → `src/app/(portal)/payments/page.tsx`
- Section-grouped tables → `src/app/(portal)/statements/page.tsx`, `src/app/(portal)/overdue/page.tsx`
- Sidebar (roman numerals + dot/bar markers) → `src/components/layout/Sidebar.tsx`
