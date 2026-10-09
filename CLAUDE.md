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
│   │   │                              Departments): People Management / Member
│   │   │                              Services / Hierarchy. **Since 2026-10-08
│   │   │                              (Claude Design handoff, the People
│   │   │                              Management revamp)** Permissions is People
│   │   │                              Management's 2nd tab (`?tab=permissions`:
│   │   │                              permission TEMPLATES — see Permissions
│   │   │                              below) and Roles is Hierarchy's 4th
│   │   │                              (`?tab=roles`: titles + Level + their
│   │   │                              template); /team/roles and
│   │   │                              /team/permissions redirect there. Invite
│   │   │                              user is a DRAWER on People Management (pick
│   │   │                              an active person with no login, email +
│   │   │                              password, no role); /team/people/invite?
│   │   │                              staff= deep-links into it. Routes stay
│   │   │                              under /team/*. Roles = titles. Hierarchy =
│   │   │                              the GRAPH, with a
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
│   │   │                              payroll/ grid (2026-09-30): EVERY statutory
│   │   │                              figure is a field — EPF/SOCSO/EIS EE + PCB
│   │   │                              under Deductions, ER under Employer. A typed
│   │   │                              one lives in `*_override_amount` (the value
│   │   │                              column is never written by hand) and the
│   │   │                              compute trigger applies it over JADUAL on
│   │   │                              every recompute until Reset to JADUAL; the
│   │   │                              InfoTech import still writes its file's
│   │   │                              figures verbatim. The row's ▾ is gone (the
│   │   │                              name / ⋯ open the paycheck). `lib/payroll-
│   │   │                              grid.ts` payrollRowWrite, mig `20260930010000`.
│   │   │                              **THE UNIFIED PAYROLL (2026-09-27):** payroll/
│   │   │                              [period] is everybody's pay on one grid —
│   │   │                              staff keyed here, the Revenue team closed on
│   │   │                              Comm Cal, Directors Completed on Director
│   │   │                              Salary — and a person moves draft → completed
│   │   │                              → submitted → paid (enum value `completed`,
│   │   │                              mig 20260927060500). Tick → *Complete* (staff
│   │   │                              only; a salesperson completes when their
│   │   │                              `comm_salesperson_closes` row stands — trigger
│   │   │                              `comm_close_sync_payroll` sets the row's
│   │   │                              commission to Σ standing closes and records the
│   │   │                              close's bills in `comm_order_releases` under
│   │   │                              the month's run; a Director on
│   │   │                              `director_payroll_complete`, which still writes
│   │   │                              the billing snapshot). *Submit to Finance* =
│   │   │                              `payroll_submit_batch`: everybody Completed, as
│   │   │                              one BATCH (`payroll_batches` + a line per
│   │   │                              person in `payroll_batch_lines`), its own
│   │   │                              funding request and accrual JVs (reference =
│   │   │                              the batch) — pressable again for the next group
│   │   │                              (user: Finance 3 today, HR 5 next week); what
│   │   │                              each batch waits on is shown in *Submitted to
│   │   │                              Finance*, never on the button. The month keeps
│   │   │                              ONE payroll_run = Σ standing batches, so
│   │   │                              billing and dashboards read it as before.
│   │   │                              Right-click → *Resubmit* or *Second payroll*
│   │   │                              (`payroll_open_topup(scope, row, kind)`) unlocks
│   │   │                              somebody already sent — the same move, recorded
│   │   │                              apart (a correction vs a planned second payment,
│   │   │                              e.g. a sub-department paying on the 15th:
│   │   │                              `topup_kind` on the row and the batch line,
│   │   │                              `payroll_batches.second_payrolls`; mig
│   │   │                              `20260927070000`); amounts may only
│   │   │                              go UP and the next batch carries the
│   │   │                              difference — Finance funds the CTC delta,
│   │   │                              HR › Payment pays the net delta
│   │   │                              (`payroll_salary_entitlements`: submitted,
│   │   │                              FUNDED, covered, paid per component; statutory
│   │   │                              the same). *Total Close* (`payroll_close_month`)
│   │   │                              locks the month; only the Principal reopens
│   │   │                              (`payroll_reopen_month`). Finance sends back
│   │   │                              ONE batch (`payroll_send_back_batch`: request
│   │   │                              cancelled, JVs reversed, its people Completed
│   │   │                              again). Every status move goes through those
│   │   │                              functions (guard `guard_payroll_row_lifecycle`,
│   │   │                              `app.payroll_lifecycle`). Retired: the
│   │   │                              whole-month `submit_payroll_to_principal`,
│   │   │                              Director Salary's own Submit to Finance and
│   │   │                              Comm Cal's whole-month Send (they raise
│   │   │                              23PAY). June–August are batch #1 (legacy) of
│   │   │                              their month. `lib/payroll-lifecycle.ts`, mig
│   │   │                              `20260927061000`, DESIGN.md › Payroll batches.
│   │   │                              **BILLING ALLOCATION FOLLOWS THE PAYROLL
│   │   │                              (2026-09-30):** allocation/[period] is one card
│   │   │                              per payroll row of the month in a COST-CENTER
│   │   │                              department, in the grid's order
│   │   │                              (`comparePayrollOrder`); centralized
│   │   │                              departments are named in the header, not
│   │   │                              listed (`allocationRoster` — anybody who still
│   │   │                              HAS a split stays listed, so nothing billed is
│   │   │                              hidden). A person's split LOCKS with their row:
│   │   │                              Completed, with Finance, paid, or the month
│   │   │                              Closed for good. The way back is the payroll's
│   │   │                              own — Unlock, reopen on Comm Cal, or Resubmit /
│   │   │                              Second payroll (a draft again while open).
│   │   │                              Every split row belongs to its payroll row (FK
│   │   │                              `hr_staff_allocation_payroll_row_fkey`, ON
│   │   │                              DELETE CASCADE — removed with it) and trigger
│   │   │                              `trg_hr_staff_allocation_follows_payroll`
│   │   │                              refuses the rest (23PAY, same words as the
│   │   │                              page). Copy from last month fills only people
│   │   │                              on this month's payroll and still a draft.
│   │   │                              `splitLock` in lib/staff-allocation.ts, mig
│   │   │                              `20260930040000`.
│   │   │                              **DEPARTMENT MODE (2026-09-30):**
│   │   │                              `departments.cost_model` = `cost_center` (only
│   │   │                              passes its cost through: split on Billing
│   │   │                              Allocation, pool should net to zero — HR,
│   │   │                              Finance, IT, Director Office) or `centralized`
│   │   │                              (bills the subsidiaries by INVOICE, runs its
│   │   │                              own pool, not on Billing Allocation — Director,
│   │   │                              Marketing, Revenue). An on/off switch
│   │   │                              (`components/department/DepartmentModeSwitch`,
│   │   │                              on = centralized) in Settings › Departments'
│   │   │                              Mode column and on each department's own page
│   │   │                              (HR Costing, Service Billing, Director Pool,
│   │   │                              Revenue › Department; Marketing once it has a
│   │   │                              view). Only permission `department_mode`
│   │   │                              (Principal by default) switches it, and it
│   │   │                              asks about the person SIGNED IN — the Principal
│   │   │                              flips it from HR's or Finance's view too — so
│   │   │                              the gate is `department_set_cost_model`'s
│   │   │                              `has_perm`, not `requirePermission`. Going
│   │   │                              centralized clears that department's splits on
│   │   │                              DRAFT payroll; the guard refuses a new split on
│   │   │                              a centralized department's person. NOT tied to
│   │   │                              `own_share_billback`: a cost center that did
│   │   │                              not net to zero must stay VISIBLE, never be
│   │   │                              absorbed by Venture automatically (user
│   │   │                              2026-09-30). `lib/department-mode.ts`, mig
│   │   │                              `20260930050000`.
│   │   ├── revenue/                 ← Revenue Department: [sub]/ = one sub-department
│   │   │                              (Fair, …) with 3 views, reached from the
│   │   │                              SIDEBAR not a tab rail — page.tsx (Commission
│   │   │                              Calculation) / hierarchy / rules — plus
│   │   │                              [sub]/[period]/ runs. The Product List left for
│   │   │                              the Revenue app on 2026-10-08 (/member/products,
│   │   │                              below); /revenue/products redirects there.
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
│   │   │                              **THE SALE DAY SETS THE MONTH (2026-10-06,
│   │   │                              user: by record a sale follows its date; a
│   │   │                              fair 30 Aug–1 Sep is August on the 30th and
│   │   │                              31st, September on the 1st):** the ERP says
│   │   │                              which day of its fair a bill was sold on
│   │   │                              (`fair.fairDate`, since 2026-09-24). A NEW
│   │   │                              document lands in that day's month when it
│   │   │                              is one of the fair's days, else its
│   │   │                              `so_date`'s (keyed up to 3 days late). The
│   │   │                              calendar moves a bill to
│   │   │                              `sales_order_sale_month()` — its sale
│   │   │                              day's month, else its fair's — so a fair
│   │   │                              across two months splits by day. A re-send
│   │   │                              still keeps its month; a move is still a
│   │   │                              click. Weekly boards are unchanged (a
│   │   │                              fair's week is the week it opens in). Mig
│   │   │                              `20261006140000`.
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
│   │   │                              in the ERP's Ref No., else the order's own —
│   │   │                              the Ref No. is `sales_order_ref_no()` =
│   │   │                              `customer_so_no`, else `ref` (2026-10-03:
│   │   │                              the ERP's forms write the first, AutoCount
│   │   │                              left the second, and a check reading one
│   │   │                              field would go silent if the ERP moved) —
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
│   │   │                              **TWO TABS, AND THE REASONS (2026-09-30):**
│   │   │                              *Drops and upsells the ERP found* and
│   │   │                              *Possible double claims* left the top of
│   │   │                              the month for the END of the workbench rail
│   │   │                              (`?view=changes` / `?view=claims`; handed
│   │   │                              over as `reviews`, counts = what waits),
│   │   │                              and every group now says WHY it is there
│   │   │                              (user: 我要你全部都写原因 … 把过去的
│   │   │                              history 拿出来): which bill is already
│   │   │                              claimed (claim form / month before the
│   │   │                              cutover / a run / a close) and which a run
│   │   │                              would still pay; what they share and where
│   │   │                              they part (salesperson, customer, fair,
│   │   │                              venue, items, value, what earns, deposit,
│   │   │                              when the ERP opened each); the verdict
│   │   │                              (paid_again · copy · split · second_sale ·
│   │   │                              settled · number_only); what to do; the
│   │   │                              bills side by side; each bill's history
│   │   │                              (ERP saves, drafts, moves, adjustments).
│   │   │                              Pure: `lib/commission/double-claim-reasons.ts`;
│   │   │                              evidence: `loadDoubleClaimEvidence` in
│   │   │                              `revenue/_lib/double-claims.ts` — existing
│   │   │                              tables under the viewer's session, no mig.
│   │   │                              **THE PAPER BESIDE THE DOCUMENT
│   │   │                              (2026-10-03):** a fair sale is a
│   │   │                              handwritten bill (HC13369) keyed into the
│   │   │                              ERP later as its own document
│   │   │                              (HC-SO-2609-400) with the paper's number in
│   │   │                              the Ref No. The bill stays the ERP's
│   │   │                              document; every list of bills on Comm Cal
│   │   │                              carries a **Ref No.** column beside it
│   │   │                              (`PaperRefCell`, `lib/commission/
│   │   │                              paper-ref.ts`) from the computed fields
│   │   │                              `ref_no(sales_orders)` /
│   │   │                              `paper_no(sales_orders)` — `paper_no` NULL
│   │   │                              = the check cannot match the bill (no Ref
│   │   │                              No., or one naming no paper), said on the
│   │   │                              row and listed on the Double claims tab.
│   │   │                              Spec §4.15, mig `20261003170000`.
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
│   │   │                              page's *Drops & upsells* tab (a panel above
│   │   │                              the cards until 2026-09-30)
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
│   │   │                              **CLOSING A SALESPERSON (2026-09-27):** the
│   │   │                              month's list has a tick per name and a close
│   │   │                              bar (*Close N ticked* / *Close the N still
│   │   │                              open* / *Reopen N*, inline confirm); a
│   │   │                              ledger's walnut header has *Close NAME* and
│   │   │                              *Close & next*. A close LOCKS that person's
│   │   │                              figure (`comm_salesperson_closes`, one
│   │   │                              standing row per person-month, reopen keeps
│   │   │                              history, no DELETE, locked columns refused
│   │   │                              23CLS). The figure is computed on the SERVER
│   │   │                              from the month as saved and must equal what
│   │   │                              the page showed, or nobody closes. It keeps
│   │   │                              `save_commission_run`'s statement shape and
│   │   │                              the bills released / held / cut. Since the
│   │   │                              unified Payroll (same day) the close IS the
│   │   │                              salesperson's Complete: trigger
│   │   │                              `comm_close_sync_payroll` puts the standing
│   │   │                              closes' commission on their HR › Payroll row
│   │   │                              as Completed and releases the close's bills
│   │   │                              (THE UNIFIED PAYROLL, above).
│   │   │                              While closed: a confirmed upsale/drop into
│   │   │                              that month is refused by TRIGGER (pending
│   │   │                              ERP rows never are); a pick / share /
│   │   │                              exclusion / keyed margin on their bills is
│   │   │                              refused by the ACTIONS
│   │   │                              (`_lib/salesperson-closes.ts`) — the ERP
│   │   │                              receiver writes those tables and must never
│   │   │                              be refused. Live ≠ closed shows as *moved
│   │   │                              since*. `lib/commission/closes.ts`, spec
│   │   │                              §4.11, mig `20260927040000`. A bill PAID
│   │   │                              but priced RM 0 in the ERP earns nothing:
│   │   │                              the month names it above the list, tags the
│   │   │                              row, and Close asks first — a reminder, not
│   │   │                              an ERP block (user). `lib/commission/
│   │   │                              unpriced.ts`.
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
│   │   │                              **SHARE FROM THE RIGHT-CLICK (2026-09-30):**
│   │   │                              a bill's menu — a salesperson's ledger on
│   │   │                              Comm Cal, and Sales orders — has *Share this
│   │   │                              bill…*: who with (the sub-department's team,
│   │   │                              never the owner) + their % (50 to start),
│   │   │                              Save; *Stop sharing with …* gives a part
│   │   │                              back. Every PART carries `SalesOrder.share`
│   │   │                              (owner + every holder's %, stamped by
│   │   │                              `splitOrdersByShares`, display only — the
│   │   │                              engine never reads it), so the other
│   │   │                              holder's ledger says *From ADRIAN's bill*,
│   │   │                              the owner's *Shared with ANTHONY*, and the
│   │   │                              ledger's **Sales person** column names both
│   │   │                              (`RowShare`). `shareOrder` also refuses a
│   │   │                              new holder whose own month is closed
│   │   │                              (`assertStaffNotClosed`) or who is off the
│   │   │                              team, and answers with the holders
│   │   │                              (`lib/commission/bill-share.ts`). No mig.
│   │   │                              **THE PRODUCT LIST IS A PAGE OF THE REVENUE
│   │   │                              APP (2026-10-08, user: 把 product list 直接搬过去
│   │   │                              revenue view … 只有拥有权限进去的时候，才会看到这个 tab):**
│   │   │                              `/member/products`, under the route group
│   │   │                              `(member)/member/(app)` — its layout renders
│   │   │                              `RevenueApp` around the page (`(app)/page.tsx`
│   │   │                              is null, `(app)/loading.tsx` keeps the shell
│   │   │                              up between the two). The app's sidebar shows
│   │   │                              it under PRINCIPAL only to whoever holds
│   │   │                              `product_list`
│   │   │                              (`lib/member/product-access.ts`; a Principal
│   │   │                              in ANY view — Revenue View, or an HR / Finance
│   │   │                              view left on in the portal — is asked about
│   │   │                              the account itself, `getAccountUser()`, and
│   │   │                              the Save stands behind the same answer,
│   │   │                              `requireProductList`: an HR view used to hide
│   │   │                              the row with nothing saying why),
│   │   │                              the Module switcher beside it (Principal only,
│   │   │                              `setViewAs`). The portal's `/revenue/products`
│   │   │                              redirects there and the portal nav lost its
│   │   │                              row. Drawn to the design handoff
│   │   │                              (`.design/revenue-app/design_handoff_product_list`,
│   │   │                              `_components/products.module.css`;
│   │   │                              `tools/measure-pl.mjs` diffs every element
│   │   │                              against the prototype — box-sizing and the
│   │   │                              browser's own input padding are restored where
│   │   │                              Tailwind's reset changed them). Its code never
│   │   │                              reaches a member's bundle:
│   │   │                              `components/member/cost-basis-wording.test.ts`
│   │   │                              exempts the folder and refuses an import of
│   │   │                              it. A save `router.refresh()`es the layout, so
│   │   │                              the Quote's catalogue follows at once. Code
│   │   │                              moved from `revenue/products` +
│   │   │                              `revenue/catalogue-actions.ts` to
│   │   │                              `(app)/products/` (`actions.ts`).
│   │   │                              **COMBOS ARE OURS (2026-10-08, user: need
│   │   │                              delete button, then that side no need sync
│   │   │                              with houzs erp anymore):** `catalogue_combos`
│   │   │                              holds every combo — the ERP's 76 live rows
│   │   │                              adopted once (`erp_id`, same model,
│   │   │                              compartments, tier, name, heights and
│   │   │                              effective date, so no bill changed), + Add
│   │   │                              combo makes more (`catalogue_add_combo`), Edit
│   │   │                              prices › Remove takes a set away
│   │   │                              (`catalogue_remove_combos`: every tier, and
│   │   │                              its prices deleted; the row kept with
│   │   │                              `removed_at` / `removed_by`; 42501 without
│   │   │                              admin scope, 22023 a set already gone).
│   │   │                              `catalogue_live_combos` — read by
│   │   │                              `catalogue_apply_combos` (the run) and
│   │   │                              `member_catalogue` (the Quote) — is
│   │   │                              `catalogue_combos` alone; `erp_sofa_combos` is
│   │   │                              still written by the ingest and read by
│   │   │                              nothing, so the ERP needs no change. A bill
│   │   │                              costed at a removed combo keeps that cost
│   │   │                              until its month is Recosted.
│   │   │                              A PIECE MAY BE EITHER SIDE (same day, user:
│   │   │                              我需要左右都算的 function): after a module whose other
│   │   │                              side the model also has (`1A(R)(LHF)` /
│   │   │                              `(RHF)`, `2A-LHF` / `-RHF`), Add combo offers
│   │   │                              the pair as one more card — `1A(R)` · *LHF or
│   │   │                              RHF* — and each piece of it is ONE slot of
│   │   │                              both sides, the ERP's own shape, so a set
│   │   │                              adopted from the ERP can be made again after a
│   │   │                              Remove (`moduleSide` / `comboPieces` in
│   │   │                              `_components/add-combo.ts`; a pair adds up at
│   │   │                              the dearer side). `catalogue_add_combo` takes
│   │   │                              1–4 modules per slot, none twice; the costing
│   │   │                              already matched a slot by any of them.
│   │   │                              ONE BILL, ONE COMBO (same day, user chose
│   │   │                              完全一样才算): a combo costs a bill only when the
│   │   │                              sofa IS its set — a 3+2+1 bill takes 3+2+1,
│   │   │                              never 3+2, and with 3+2 alone takes none
│   │   │                              (`catalogue_apply_combos`, twin `pickCombo`;
│   │   │                              14 of the 67 bills since August that the ERP's
│   │   │                              rule would have matched were sets with a piece
│   │   │                              more). Add combo refuses a set one bill could
│   │   │                              match as well as an existing one — `1A(R) (LHF
│   │   │                              or RHF) + 1NA` beside `1A(R)(LHF) + 1NA`
│   │   │                              (`catalogue_combos_collide`, twin
│   │   │                              `combosCollide`); none of the 62 adopted sets
│   │   │                              collide. Migs `20261008010000` – `040000`.
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
│   │   │                              `erp_sofa_combos` — unread since 2026-10-08,
│   │   │                              combos are ours) is what the ERP says
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
│   │   │                              option ticks + gift override + section /
│   │   │                              brand picks (read ONLY for a mattress or
│   │   │                              sofa the ERP gives no brand, 2026-10-06 —
│   │   │                              see Member catalogue below),
│   │   │                              `catalogue_option_prices`,
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
│   │   │                              one figure) × qty — no option adds to it
│   │   │                              since 2026-10-06 (every option priced on
│   │   │                              Maintenance is a CHARGE, below); the options read from the
│   │   │                              line's `raw.variants` when the feed carries
│   │   │                              them, else parsed from the ERP's own
│   │   │                              `description2` grammar
│   │   │                              (`catalogue_line_facts`). Then, at COMMIT
│   │   │                              (deferred trigger), a sofa build that IS a
│   │   │                              priced combo's set (exactly, since 2026-10-08
│   │   │                              — the ERP took one it merely covered) is
│   │   │                              costed at the combo, spread over its modules
│   │   │                              by their own costs (the combo always wins;
│   │   │                              one tier + one height; uniform qty or no
│   │   │                              combo). The ERP's own
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
│   │   │                              **A BED FRAME'S OPTIONS ARE CHARGED, NOT
│   │   │                              COSTED (2026-10-05):** a bed frame's divan,
│   │   │                              leg, GAP and total height priced on
│   │   │                              Maintenance above 0 is what the CUSTOMER
│   │   │                              pays on top (user: 16
│   │   │                              寸需要 100 块 … 不会算进 margin … 只会给普通
│   │   │                              commission): `sales_order_lines.
│   │   │                              option_charge_amount` = qty × charges,
│   │   │                              filled with the cost (fill-cost trigger,
│   │   │                              Recost). OUT of the margin on both sides —
│   │   │                              `marginBase` / `revenue_month_orders.
│   │   │                              margin_revenue` / `member_order_facts.
│   │   │                              goods_revenue` take it off the revenue,
│   │   │                              the cost never had it — IN the sales the
│   │   │                              rate is paid on (`commissionable`, and the
│   │   │                              director threshold reads `commissionable`,
│   │   │                              not margin revenue), never KPI. Not set
│   │   │                              = FOC (total height too, user 2026-10-05);
│   │   │                              specials stay a cost. Maintenance says *Charge (RM)*
│   │   │                              for those pools. The Quote offers one ONLY
│   │   │                              while it is turned ON for that model on
│   │   │                              Modular (user 2026-10-05: 选择 Turn ON 的他才会
│   │   │                              出现) — ON + charged = "+ RM x", ON without
│   │   │                              a charge = FOC, not ON = never offered, as
│   │   │                              a SKU or model not ON is never offered.
│   │   │                              `lineCharge` (`lib/catalogue/pricing.ts`),
│   │   │                              migs `20261005010000` / `020000`.
│   │   │                              **EVERY OPTION PRICE IS A CHARGE
│   │   │                              (2026-10-06):** "我要那些价钱是不会算进 margin
│   │   │                              的，加 100 就一定 default calculator 100" — a
│   │   │                              bed frame's SPECIALS and a sofa's LEG HEIGHT
│   │   │                              and SPECIALS priced on Maintenance are the
│   │   │                              customer's too, out of the margin, in the
│   │   │                              commission, never KPI; nothing is a cost
│   │   │                              surcharge any more (`catalogue_line_surcharge`
│   │   │                              answers 0; a price is never negative). A bed
│   │   │                              frame per frame, on its line. A SOFA ONCE PER
│   │   │                              SOFA ("整组 sofa 只加一次"): at commit, beside
│   │   │                              the combos, `catalogue_apply_sofa_charges`
│   │   │                              groups an order's sofa lines by base model,
│   │   │                              charges each distinct leg / special any piece
│   │   │                              names once × sets (the smallest line qty: ×2
│   │   │                              everywhere = two sofas) and spreads it over
│   │   │                              the pieces by their sales (`cost_detail.
│   │   │                              charge_set`); Recost does the same. The Quote:
│   │   │                              a sofa's leg = FOC + the charged legs, as a
│   │   │                              bed frame's; a SPECIAL is offered only when
│   │   │                              charged, "+ RM x" (user, same day: "if there
│   │   │                              is no price … just don't show it") — ON on
│   │   │                              Modular with no price = not shown, and the
│   │   │                              server refuses it on a bed frame; step 2
│   │   │                              and the customer quote say *Option charges*.
│   │   │                              `sofaSetCharges` is the twin. Mig
│   │   │                              `20261006050000`. `catalogueModelsOf`
│   │   │                              (`lib/member/priced-catalogue.ts`, the ONE
│   │   │                              reader of the models for the snapshot AND
│   │   │                              the quote) keeps each kind's charges — a bed
│   │   │                              frame's heights + specials, a sofa's leg +
│   │   │                              specials; until 2026-10-06 it kept a bed
│   │   │                              frame's heights only, so the sofa's Leg
│   │   │                              height row never showed.
│   │   │                              The ERP pushes the catalogue to
│   │   │                              `POST /api/erp/v1/products` (contract §9,
│   │   │                              v2) on the sales-order feed's key, whole,
│   │   │                              only when its digest changed.
│   │   │                              `lib/erp-sync/catalogue.ts`,
│   │   │                              `(member)/member/(app)/products/actions.ts`, migs
│   │   │                              `20260924020000` / `025000` / `030000`.
│   │   │                              **COSTING SETTING + KPI ITEMS (2026-09-27;
│   │   │                              KPI items on RULES since 2026-10-08):**
│   │   │                              Costing Setting is a Product List tab, per
│   │   │                              sub-department (`?sub=`) = the ratio a cost
│   │   │                              is divided by for the Revenue Team
│   │   │                              (`comm_schemes.revenue_cost_divisor`, Fair
│   │   │                              0.7) and SKUs with a ratio of their OWN
│   │   │                              (`comm_cost_ratios`, e.g. ÷ 0.6), applied
│   │   │                              per line in the engine (`lib/commission/
│   │   │                              cost-basis.ts`), the month page, the member
│   │   │                              facts and the calculator. KPI items = a SKU
│   │   │                              or a bed frame / sofa SPECIAL
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
│   │   │                              already run keeps its amount.
│   │   │                              **WHERE THEY ARE SET (2026-10-08, user:
│   │   │                              rules 这里是用来算薪水的 … product list 是拿来
│   │   │                              set costing 的):** Rules › **KPI items**, the
│   │   │                              LAST tab of the rail (section XI) — the
│   │   │                              items AND the threshold ladder on one tab
│   │   │                              (the ladder was its own tab V; asked with
│   │   │                              an RM example, the user KEPT it as it is:
│   │   │                              every KPI unit of the month together →
│   │   │                              a % on the whole KPI amount — no threshold
│   │   │                              per item). Principal + HR
│   │   │                              (`requirePermission('revenue')`,
│   │   │                              `revenue/kpi-actions.ts`; the table's RLS
│   │   │                              was always both): a SKU is searched on the
│   │   │                              server (`searchKpiSkus` — never a price),
│   │   │                              the 39 specials are listed; one draft, one
│   │   │                              Save (the writer is unchanged), the draft
│   │   │                              kept while another tab is read. Shown while
│   │   │                              the switch is on OR an item / rung is
│   │   │                              recorded (`rules-tabs.ts`), with an Off
│   │   │                              note. The Product List's Add-on / KPI Items
│   │   │                              tab is GONE (`?tab=kpi` redirects to Rules).
│   │   │                              `lib/commission/kpi.ts`, `lib/commission/
│   │   │                              kpi-items-edit.ts`, `lib/catalogue/rule-
│   │   │                              edits.ts`, mig `20260927050000`.
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
│   │   │                              **REVENUE DIRECTOR PAY (2026-09-27):** the
│   │   │                              head is still no member and earns no
│   │   │                              override, but is now PAID: their title may
│   │   │                              hold a gate-less rung on a ladder (Title
│   │   │                              ladder picks *Revenue Director · heads the
│   │   │                              department*; `comm_ranks_director_rung`,
│   │   │                              23DIR: no gate, no package, always
│   │   │                              recruits; no member may sit on it) whose
│   │   │                              rank is the rate of their OWN bills — that
│   │   │                              rate and nothing else, no KPI / Open Bill /
│   │   │                              margin. Rules › **Directors** (10th tab,
│   │   │                              shown while the sub-department has a
│   │   │                              director; `comm_director_pay`, per scheme ×
│   │   │                              director) adds a FIXED amount — their base
│   │   │                              commission, the basic carved out of it as
│   │   │                              anybody's — and an INCENTIVE once the
│   │   │                              month's Commissionable value (Comm Cal's
│   │   │                              card, `monthCommissionableValue` in
│   │   │                              `lib/commission/director-pay.ts`, the ONE
│   │   │                              reading the page, the engine and a close
│   │   │                              share) reaches the threshold. Engine input
│   │   │                              `directors` + `monthCommissionableValue`
│   │   │                              (loaded in `commission-input.ts`); lines
│   │   │                              `director_fixed` / `director_incentive`;
│   │   │                              `WorkbenchPerson.monthlyDirectorPay`;
│   │   │                              closed on Comm Cal like anybody → payroll.
│   │   │                              Mig `20260927075000`.
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
│   │   │                              Bill / **Below deposit** / **Sales
│   │   │                              exhibition**, one table design. Below deposit =
│   │   │                              every bill the gate holds (live engine
│   │   │                              verdict, `status = 'deposit_pending'`) with
│   │   │                              Paid, Deposit needed and **Still to
│   │   │                              collect**; a salesperson's page has the
│   │   │                              same tab beside Personal / Overriding.
│   │   │                              **SALES EXHIBITION (2026-10-03, was Sales by
│   │   │                              venue)** is one row per BRAND AT A FAIR
│   │   │                              (brand · venue · days · organiser,
│   │   │                              `salesByExhibition` in `lib/exhibitions.ts`):
│   │   │                              the same venue, organiser and days with
│   │   │                              another brand is ANOTHER exhibition (user:
│   │   │                              我是看 brand 来区分那一场 exhibition 的
│   │   │                              result — the ERP's one project per booth,
│   │   │                              the Arena's by-brand). Fair = each bill's
│   │   │                              `fair_event_id`; brand = the BOOTH the
│   │   │                              salesperson picked in the ERP
│   │   │                              (`raw.fair.brand` while `fair_source =
│   │   │                              'erp'`) — a Dunlopillo pillow sold at the
│   │   │                              Akemi booth is Akemi's (user) — else the
│   │   │                              bill's own `brand_code`, else No brand
│   │   │                              (`exhibitionBrandOf`; the booth is read by
│   │   │                              `_lib/order-fairs.ts`). The margin ladder
│   │   │                              still reads `brand_code`. READ-ONLY — the fair and its
│   │   │                              organiser come from the ERP (2026-09-27,
│   │   │                              above). A row's venue opens exactly its
│   │   │                              bills on All bills (`?fair=&brand=`, a
│   │   │                              place no fair claims `?venue=&fair=none`);
│   │   │                              `?view=venue` still opens the tab. Spec
│   │   │                              §4.16. The Arena's Fair results rank booth
│   │   │                              by booth too (member app, below). The Total Sales Orders table
│   │   │                              gained **Group sales**; the saved run's
│   │   │                              per-person table, the old *Waiting on a
│   │   │                              deposit* section and *Sales by person* are
│   │   │                              gone (user 2026-09-26). The bottom rail
│   │   │                              went with *Payroll & source tools*
│   │   │                              (2026-09-27, below).
│   │   │                              (Unified Payroll, the same day: a salesperson
│   │   │                              goes to payroll when CLOSED here — their row
│   │   │                              on HR › Payroll turns Completed; the bar
│   │   │                              links HR › Payroll and names a Total Closed
│   │   │                              month; `send_commission_to_payroll` now
│   │   │                              raises 23PAY.)
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
│   │   │                              / closed / settled by hand, lists what has
│   │   │                              to be settled first BY NAME (engine warnings
│   │   │                              + unmatched agents), and SENDS NOTHING: its
│   │   │                              whole-month *Send to payroll* / *Take back*
│   │   │                              lived a few hours on 2026-09-27 and went —
│   │   │                              the user's Send is per SALESPERSON (Send =
│   │   │                              Complete: tick five and send them, or send
│   │   │                              everybody not yet sent), the per-person
│   │   │                              close's job. `send_commission_to_payroll`
│   │   │                              is still in the DB, unused.
│   │   │                              `commission_payroll_closed(period)` asks the
│   │   │                              writes' guard (HR cannot read payroll_runs /
│   │   │                              period_locks). The bar reads the month AS
│   │   │                              SAVED, never the screen's draft, and FOLDS
│   │   │                              to one line (2026-09-28, user 太显眼了): the
│   │   │                              state and a tag (*N to settle* / *Moved
│   │   │                              since* / *Payroll closed*); the why opens
│   │   │                              on a click, and the RM 0 box folds the same
│   │   │                              way. The month's switches (*This month
│   │   │                              pays*) are in **Review settings** — the ONE
│   │   │                              set (user: 保留一个就好): its KPI / Open
│   │   │                              Bill / Margin preview checkboxes saved
│   │   │                              nothing, repeated the bar's foot, and a
│   │   │                              draft of them left in the tab's session
│   │   │                              quietly disabled Close. The whole foot
│   │   │                              section is gone —
│   │   │                              saved-run hero, warnings list, Open Bill
│   │   │                              cost, payroll-adjustment table (still on a
│   │   │                              person's statement), below-margin list,
│   │   │                              hand-typed upsales. Engine: a department
│   │   │                              head's own bills (KRIS / PETER, 23DIR) earn
│   │   │                              NOTHING and raise no warning — a rung on the
│   │   │                              ladder pays them since 2026-09-27 (above) —
│   │   │                              (`EngineInput.departmentHeadIds`, read by
│   │   │                              `loadCommissionInput`). **THE LADDER IS THE
│   │   │                              BILL'S BRAND** (user: 主体是 Akemi 就跟 Akemi 的
│   │   │                              margin ladder): `SalesOrder.brandCode` =
│   │   │                              `sales_orders.brand_code` (the ERP's
│   │   │                              Branding) is what `marginBase` answers to —
│   │   │                              accessories and bed frames are RIDERS, their
│   │   │                              cost in the bill's margin on the bill's
│   │   │                              ladder, whatever brand they carry; only a
│   │   │                              bill with no brand reads its lines, and only
│   │   │                              a month that pays margin asks about two
│   │   │                              priced brands. **A BILL OF RIDERS ALONE IS
│   │   │                              STILL A BRAND'S (2026-09-27):** nothing is
│   │   │                              sold on its own — a bed frame or a pillow is
│   │   │                              a second bill at a brand's fair (user: 在
│   │   │                              Akemi 的 fair 那个星期卖床架) — so the ERP asks
│   │   │                              which brand when NOTHING on the bill names
│   │   │                              one, not a line either (`vpBrand`,
│   │   │                              skippable, the ERP's Branding untouched;
│   │   │                              choices = our 4 ladders, ERP sync_config
│   │   │                              `vp.brands`), and a bill that still has none
│   │   │                              gets it here: right-click › *Brand for the
│   │   │                              margin* (`sales_order_brand_picks`,
│   │   │                              `revenue_set_order_brand`, 23BRD/23RUN).
│   │   │                              The bill's brand is `erp_sync_order_brand`:
│   │   │                              Branding when it names a brand → the ERP
│   │   │                              pick → the pick made here → the fair
│   │   │                              booth's brand → the lines. Contract §3.5,
│   │   │                              mig `20260927080000`. The member app already grouped by
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
│   │   │                              **PAY LINES (2026-09-27):** the pencil on a
│   │   │                              salesperson's *Salary calculation* (under
│   │   │                              their ledger on Comm Cal) adds lines to the
│   │   │                              month — Special claim / Allowance /
│   │   │                              Incentive (EARNINGS: into gross in full,
│   │   │                              never pro-rated, outside the statutory wage
│   │   │                              — no EPF / SOCSO / EIS) or Deduction (off
│   │   │                              take-home only, like SKBBK). The lines
│   │   │                              (`revenue_pay_lines`) are the fact;
│   │   │                              `hr_monthly_payroll.pay_line_earnings` /
│   │   │                              `pay_line_deductions` are DERIVED by both
│   │   │                              payroll triggers (re-read on every compute,
│   │   │                              held at 0 on non-Revenue rows by CHECK), so
│   │   │                              a row made later picks up lines typed
│   │   │                              before it. One writer,
│   │   │                              `revenue_save_pay_lines`: Principal / HR,
│   │   │                              `assert_commission_payroll_open`, a stale
│   │   │                              editor refused on id:version, before and
│   │   │                              after in `access_log`. `lib/revenue-pay.ts`
│   │   │                              adds them exactly as the triggers do; the
│   │   │                              rules are `lib/revenue-pay-lines.ts`. HR's
│   │   │                              paycheck window and payslip show them
│   │   │                              read-only. The payslip (`pay/[staffId]`)
│   │   │                              lost *Their bills*: the ledger it is opened
│   │   │                              from already lists every bill. Mig
│   │   │                              `20260927060000`.
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
│   │                                  **THE REVENUE APP (2026-10-05):** /member
│   │                                  is `components/member/app/RevenueApp.tsx`,
│   │                                  built to the Claude Design prototype
│   │                                  (Revenue Mobile, kept outside the repo):
│   │                                  Today / Insight / Quote / Arena / Profile,
│   │                                  one URL state (`app/route.ts`), its own
│   │                                  palette (`[data-revenue-app]` in
│   │                                  globals.css), desktop by container query.
│   │                                  Every rule number is VP's (bands, cost
│   │                                  divisor, KPI), never the prototype's. The
│   │                                  old `MemberWorkspace` survives only in
│   │                                  `preview/`; `?app=proto` renders the new
│   │                                  app on the prototype's own data, which is
│   │                                  what it is pixel-compared against.
│   │                                  On a phone the type is ONE STEP SMALLER
│   │                                  than the prototype's (user 2026-10-06):
│   │                                  every font-size is `calc(Npx *
│   │                                  var(--rv-type))`, .92 on the phone's
│   │                                  `.screen`, 1 on a desktop;
│   │                                  `app/type-scale.test.ts` refuses a plain px.
│   │                                  **PULL TO REFRESH (2026-10-06):** nothing
│   │                                  on screen changes on its own (user: 除非我
│   │                                  拉下来 refresh，它才会直接变) — the minute's
│   │                                  background refresh is GONE. A pull from the
│   │                                  page's top (`shell/PullRefresh.tsx`), or a
│   │                                  return after 10 min away, bumps `gen`:
│   │                                  every read runs again and KEEPS what is on
│   │                                  screen until its answer lands (clears only
│   │                                  when the person/month changes); keyed page
│   │                                  reads go through `useKeyedRead`. The dot
│   │                                  spins until all `track`ed reads land, the
│   │                                  snapshot (`refreshMemberData`) last.
│   │                                  Every build renames the actions, and the
│   │                                  browser's own pull-reload is off on the
│   │                                  app: a pull refused as
│   │                                  `UnrecognizedActionError`
│   │                                  (`isStaleAppError`) RELOADS the page —
│   │                                  never over a sheet or unsaved brand weeks.
│   │                                  While /member loads or cannot load,
│   │                                  `loading.tsx` / `error.tsx` are the app's
│   │                                  own frame (`app/shell/AppFrame.tsx`) + a
│   │                                  spinner / *Try again* (2026-10-06).
│   │                                  **ONE REQUEST FOR A MOMENT'S READS
│   │                                  (2026-10-06):** the client runs Server
│   │                                  Actions ONE AT A TIME, so a pull's eight
│   │                                  reads cost the SUM of their times (dev
│   │                                  11.7 s). `liveSource` now hands every
│   │                                  read to `createReadBatcher`
│   │                                  (`app/read-batch.ts`): reads asked in the
│   │                                  same task leave as ONE action,
│   │                                  `readMemberBatch` (`batch-actions.ts`,
│   │                                  ≤16), which calls the very same read
│   │                                  actions side by side — same checks, same
│   │                                  session — so a pull costs its slowest
│   │                                  read (dev 1.7 s) and a page opens in two
│   │                                  requests, not 6–14. Writes and the
│   │                                  quote's price still go straight.
│   │                                  **THE APP OPENS ON WHAT THE PHONE KEPT
│   │                                  (2026-10-08, user: 每次进来好像都在 loading
│   │                                  … 进去的时候先看旧的数据，等它 refresh 之后才是
│   │                                  新的数据):** every read's last answer is
│   │                                  kept per ACCOUNT in IndexedDB
│   │                                  (`app/read-memory.ts`, `createLiveSource(
│   │                                  account)`); the next open shows those at
│   │                                  once — `peek` in `useKeyedRead`,
│   │                                  `useInsightData`, `useArenaData`,
│   │                                  `useMonthArena` and the two-month book —
│   │                                  and reads everything again behind them,
│   │                                  the pull's dot spinning until the open's
│   │                                  reads land. Nothing is asked before the
│   │                                  phone's answers load (≤300 ms). /login
│   │                                  forgets it all (every sign-out ends
│   │                                  there), a week-old answer is dropped, the
│   │                                  account is in every key; only what the
│   │                                  reads already hand the browser — no page
│   │                                  (sw.js still caches none), no cost.
│   │                                  The snapshot every open waited for no
│   │                                  longer carries the Quote's catalogue:
│   │                                  `loadMemberData({ lite: true })` =
│   │                                  `member_*_snapshot(p_full => false)` (mig
│   │                                  `20261008160000`, overloads WITHOUT a
│   │                                  default; the zero-arg calls are `(true)`):
│   │                                  Principal 610 ms / 480 KB → 4 ms / 13 KB.
│   │                                  The catalogue is its own read
│   │                                  (`catalogue`, `loadMemberCatalogue`) when
│   │                                  the Quote or its brand list opens, or once
│   │                                  in the background when the phone kept
│   │                                  none. Today's reads leave as ONE request:
│   │                                  this month's block, KPI and Arena no
│   │                                  longer wait for the two-month book to name
│   │                                  the month being worked; last month's
│   │                                  Arena is read only by brand weeks,
│   │                                  requests and the team map. Loading is
│   │                                  never a zero: Today's hero, Sales / Margin
│   │                                  / KPI and the boards show a placeholder,
│   │                                  and no place says "Not ranked yet" (Arena
│   │                                  hero and hub too) — "RM 0k · No sales yet"
│   │                                  while loading read exactly like a month
│   │                                  with no sales (prod: income 2.6–8 s, Arena
│   │                                  3.3–8 s on every View-as open before).
│   │                                  **My income** is Comm Cal's own engine
│   │                                  run for the member's month
│   │                                  (`loadMemberIncome`: the service role,
│   │                                  only AFTER `member_income_context`
│   │                                  authorised the session — the engine reads
│   │                                  costs no member may; only their own money
│   │                                  and bills leave the server): LIVE until HR
│   │                                  closes them, then the close's own figures
│   │                                  (user: 跟着 up to date … close 的时候就是
│   │                                  fix). A month before the cutover was paid
│   │                                  from the claim form, outside the portal:
│   │                                  it shows the portal's OWN working of it,
│   │                                  as Comm Cal's month page does, headed
│   │                                  "Claim form month · portal's working",
│   │                                  salary "—" unless payroll kept one (user
│   │                                  2026-10-05: 显示 VP 自己算的;
│   │                                  `lib/member/income.ts`). In View as,
│   │                                  Today's income is the viewed person's own
│   │                                  (`snapshotIncome`); a Principal viewing
│   │                                  nobody sees "{Fair} commission" — the
│   │                                  department's total, named as such
│   │                                  (`loadDepartmentIncome`, the Principal's
│   │                                  own session).
│   │                                  **THE APP IS THE LIVE MONTH (2026-10-06,
│   │                                  user: "on live date, not showing last
│   │                                  month" / "也开在当月"):** Today (hero,
│   │                                  Sales / Margin / KPI, Your Arena),
│   │                                  Insight, the Arena and My income open on
│   │                                  the CURRENT month even while last month
│   │                                  is still being closed — that one is in
│   │                                  the date sheet, marked Live. The bell's
│   │                                  news of a settled month opens that
│   │                                  month. Honours, Team, brand weeks and
│   │                                  the claim form still read the month
│   │                                  being closed (`working`).
│   │                                  **A SALE'S MONTH IS ITS OWN (same day,
│   │                                  user: by record it follows the date,
│   │                                  never a close):** `member_order_facts`
│   │                                  counts every bill in its `period_month`
│   │                                  for good (mig `20261006130000`; it used
│   │                                  to move a bill a close had not paid into
│   │                                  the next open month). A close decides
│   │                                  only when a bill is PAID: Comm Cal's
│   │                                  carry (`lib/commission/carry.ts`, read
│   │                                  inside `loadCommissionInput`) takes an
│   │                                  earlier month's unpaid bill only once
│   │                                  that month is closed for its
│   │                                  salesperson. It used to take every bill
│   │                                  no run released, so October's page
│   │                                  counted all 357 September bills again
│   │                                  (Fair RM 185,329 for RM 24,835; KAR JUN
│   │                                  RM 17,568 for RM 5,674). A replayed run
│   │                                  still shows the earlier bills it paid.
│   │                                  **My honours** = every finish of a FINAL
│   │                                  month — Sales / Margin / KPI total and by
│   │                                  brand, Championship, and the weekly booth
│   │                                  of the member's brand week; ties shared —
│   │                                  from the Arena's own rankings
│   │                                  (`lib/member/honours.ts`). A month the
│   │                                  portal CLOSED is kept once
│   │                                  (`member_honours`, service role, so no
│   │                                  browser can put a place there) and
│   │                                  forgotten — taken afresh on the next
│   │                                  open — when a close or run of it reopens,
│   │                                  a brand week of it changes, one of its
│   │                                  bills or lines changes (a Recost too:
│   │                                  Fair's pay ignores margin, so a Recost
│   │                                  reopens nobody) or the cutover moves past
│   │                                  it; a change of RULES (divisor, bands)
│   │                                  keeps the closing ranks. A month BEFORE
│   │                                  the cutover is NEVER kept (23HON): it is
│   │                                  worked out afresh on every open, so HR's
│   │                                  brand-week fixes and a Recost reach it as
│   │                                  they reach the Arena (side review
│   │                                  2026-10-05 — a test had frozen Jun–Aug).
│   │                                  **Requests** are numbered RQ-YYMM-NNN by
│   │                                  trigger, with a history the member reads
│   │                                  (`member_request_history`) and Cancel
│   │                                  while pending with HR (23REQ). A claim is
│   │                                  Outstation (spots per region × RM per
│   │                                  spot, no invoice) or Airbnb (RM per
│   │                                  person per NIGHT, invoice); the amount is
│   │                                  worked out in the DB (`member_claim_
│   │                                  detail`) from HR's rates
│   │                                  (`member_claim_rates` / `_regions`), never
│   │                                  taken from the phone; HR sets them on
│   │                                  People › Member services › **Claim rates**
│   │                                  (`MemberClaimRatesAdmin`,
│   │                                  `member-admin/claim-rates-actions.ts`,
│   │                                  rules in `lib/member/claim-rates-admin.ts`
│   │                                  = the RPC's; gate as Brand weeks).
│   │                                  The form reads them through
│   │                                  `member_claim_settings()` — it called
│   │                                  `member_claim_rates`, the TABLE, so until
│   │                                  2026-10-06 no claim could be sent;
│   │                                  `lib/member/rpc-names.test.ts` now finds
│   │                                  every RPC the member app calls among the
│   │                                  migrations' functions. In View as the three
│   │                                  forms open on the viewed person's choices
│   │                                  and send nothing — *Read-only while
│   │                                  viewing as* (user 2026-10-06: 只能看，不能
│   │                                  送出); only the member's own login sends.
│   │                                  **A CLAIM IS DECIDED ONCE (2026-10-08,
│   │                                  user: 一个一个就好了):** HR approves or
│   │                                  rejects a member's claim in People ›
│   │                                  Member services — never again on the
│   │                                  portal's Claims page, which is POOL claims
│   │                                  only now — and picks where the money comes
│   │                                  from (`member_review_claim`, reached
│   │                                  through `member_admin_action`):
│   │                                  *Approve · add to payroll* = a
│   │                                  `special_claim` pay line in the month the
│   │                                  claim was SENT, or the next month still
│   │                                  open for them, never before the
│   │                                  sub-department's cutover
│   │                                  (`member_claim_payroll_month`); the line
│   │                                  is the claim's (`revenue_pay_lines.
│   │                                  claim_id`) — Comm Cal's pencil shows it
│   │                                  read-only and `revenue_save_pay_lines`
│   │                                  neither edits nor deletes it.
│   │                                  *Approve · request payment* = it waits on
│   │                                  Finance's **Payments › Claim requests**
│   │                                  (`claim_payment_queue`, which reads the RQ
│   │                                  number Finance cannot), who raise the
│   │                                  voucher (`claim_create_payment_voucher`:
│   │                                  claim_payout, its pool, G&A 9000) for the
│   │                                  Principal. A claim turns paid with its
│   │                                  voucher or its payroll row
│   │                                  (`claims_follow_their_voucher` /
│   │                                  `_payroll`); a voided voucher sends it
│   │                                  back to Finance's queue. The request says
│   │                                  where (`payout` on `member_request_json`,
│   │                                  `lib/member/claim-payout.ts`). Mig
│   │                                  `20261008100000`.
│   │                                  **A CLAIM IS FOR YOUR BRAND WEEK
│   │                                  (2026-10-06, user):** the phone sends only
│   │                                  the weekend; the fair is the booth the
│   │                                  Arena scores the member at (their pick,
│   │                                  else auto-located by most bills —
│   │                                  `member_claim_brand_week`, the same boards
│   │                                  `claimWeeks` reads), its region the one HR
│   │                                  set for the VENUE
│   │                                  (`member_claim_venue_regions`; Claim rates
│   │                                  lists only venues an ERP fair names —
│   │                                  `source = 'erp'` — not the hand-typed
│   │                                  June–August calendar's other spellings;
│   │                                  unmapped = cannot be claimed), the amount
│   │                                  `member_claim_detail_for`'s. A region
│   │                                  ticked *Plane ticket* (Sabah, Sarawak) is
│   │                                  the ticket's typed price + its invoice, no
│   │                                  cap. **Airbnb is by head count:** up to
│   │                                  `airbnb_group_max_pax` (HR, 3 to start)
│   │                                  the member keys the INVOICE TOTAL and is
│   │                                  paid it up to `airbnb_group_cap_per_night`
│   │                                  × nights (user: 3 / RM 220 / 2 nights /
│   │                                  invoice RM 500 → RM 440, for 1, 2 or 3
│   │                                  people alike); more people = RM 65 × pax ×
│   │                                  nights, nothing typed; no cap = everybody
│   │                                  per person (`airbnbGroup` in
│   │                                  `lib/member/claim-rules.ts`). Airbnb is for
│   │                                  an OUTSTATION fair only — the venue's region
│   │                                  has spots or is flown to (`isOutstation`);
│   │                                  a local one (KL, 0 spots) has none — and a
│   │                                  stay is at most 7 nights that covers the
│   │                                  fair's days: in on or before its last day,
│   │                                  out after its first (`stayProblem`; user
│   │                                  2026-10-06). The form opens
│   │                                  on the newest brand week, months on the
│   │                                  badges. Migs `20261006050000` /
│   │                                  `20261006150000` / `20261006160000`.
│   │                                  **My brand weeks** (Profile chip / Today's
│   │                                  reminder; no prototype page) = this
│   │                                  month's weekends then the month still
│   │                                  worked, one brand per week, closed weeks
│   │                                  locked for the member; a Principal viewing
│   │                                  is the back office (any week). The
│   │                                  **Commission scheme** chip opens the
│   │                                  member's title, rank, rate and each
│   │                                  brand's ladder — which parts a month PAYS
│   │                                  is My income's to say. Memos, Team &
│   │                                  capacity and View as (the Principal reads
│   │                                  any member, read-only) read real data.
│   │                                  Migs `20261005030000` / `040000` /
│   │                                  `050000` / `060000` / `070000`.
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
│   │                                  **AND NEVER HOW (2026-10-05):** no screen
│   │                                  says what that cost is made of — no
│   │                                  "team cost", no "cost ÷ 0.7", no ratio
│   │                                  (user: wording like that leaks our info;
│   │                                  `components/member/cost-basis-wording.
│   │                                  test.ts` fails on such a line) — and the
│   │                                  ratio never reaches a browser, not even
│   │                                  through DevTools: `member_quote_context`
│   │                                  (a member's own login can call it) has
│   │                                  bands + KPI items only, the cost rules
│   │                                  come from `member_quote_cost_rules`
│   │                                  (service role only, after the context
│   │                                  authorised the session), `QuoteResult` /
│   │                                  `MemberOrderBook` / `member_order_book`
│   │                                  carry no `costDivisor`. Migs
│   │                                  `20261005110000` / `120000`.
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
│   │                                  **BOOTH BY BOOTH (2026-10-03):** a result
│   │                                  is a brand's BOOTH at a fair, not the fair
│   │                                  (the month page's Sales exhibition), so
│   │                                  every booth is ranked on its own (small
│   │                                  ones too — 人少也算) and holds EVERY bill
│   │                                  written there (no-pick bills at the
│   │                                  seller's booth, ten brandless old ones on
│   │                                  the fair's no-brand board): the boards add
│   │                                  up to the old whole-fair totals. A seller
│   │                                  is RANKED on every board they sold at (a
│   │                                  30k that is third there shows third —
│   │                                  依然会显示属于那个名次); ONE A WEEK EARNS
│   │                                  POINTS (`scoring`, user: 你照样上榜，只是你
│   │                                  上榜了没有拿到积分 … 能算积分的只有一个):
│   │                                  the booth of the brand they pick for that
│   │                                  week in *My brand weeks* — one dropdown
│   │                                  per fair weekend (the week a fair opens in,
│   │                                  named by its Friday: Sep 2026 = 4/11/18/25),
│   │                                  stored as `member_arena_brand_weeks.picks`
│   │                                  — at the fair with the most bills for it.
│   │                                  On the others the place stands — sellers
│   │                                  behind it move down — and reads *No
│   │                                  points* (`offWeekOrders`/`Sales`); the
│   │                                  medal counts and Highest Fair Record read
│   │                                  scoring boards only. A WEEK CLOSES seven days after its
│   │                                  fair's last day (`member_arena_week_
│   │                                  closes_on`; 5–7 → open to the 14th; user:
│   │                                  结束之后的一个星期 … 没有填就 closing 了):
│   │                                  until then a week nobody picked shows
│   │                                  *Unconfirmed*, after it *Auto-located* —
│   │                                  the brand they opened the MOST BILLS for
│   │                                  that week (开最多单), then sales — and the
│   │                                  member's save refuses to change it. After
│   │                                  that only the ERP (the bills' booth picks)
│   │                                  or the BACK OFFICE changes it: the
│   │                                  Principal's view of a member makes *Member
│   │                                  brand weeks* an editor for every week
│   │                                  (`member_principal_save_brand_week_picks`),
│   │                                  and HR has **People › Member services ›
│   │                                  Brand weeks** — a department's month on
│   │                                  one grid, member × week, what is stored
│   │                                  and the booths written at under each, one
│   │                                  Save (`member_admin_brand_weeks` /
│   │                                  `member_admin_save_brand_weeks`, gate
│   │                                  `member_is_manager('member_requests_
│   │                                  manage')`, mig `20261003210000`; every
│   │                                  save records `updated_by`).
│   │                                  On 2026-10-03 no Revenue seller has a
│   │                                  member login, so every finish starts
│   │                                  guessed. A bill with no ERP booth pick
│   │                                  counts at its seller's booth. Highest Fair
│   │                                  Record = the best single booth.
│   │                                  `member_arena_booth_history` (+ principal
│   │                                  twin), migs `20261003180000` (additive —
│   │                                  the old `member_arena_history*` stay
│   │                                  unread), `20261003190000` (the lock) and
│   │                                  `20261003200000` (every booth shows,
│   │                                  one scores), all LIVE before the code
│   │                                  merged.
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
│   └── api/erp/v1/                 ← the Houzs ERP's machine endpoints (and api/whatsapp/v1/, Meta's — see Machine ingest): the ERP's two
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
│   │   │                              built on FIRST USE not at import time. Seven callers,
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
by a TITLE, with a per-person exception available on somebody's page. `permission_defs` is the catalog; `has_scope()` derives the
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
`users.role` survives ONLY for that fallback (the dept_manager row-scoped
policies it also served ask the cell's reach since PR3c, below). Do not add new
gates that read it.

**PERMISSION TEMPLATES (2026-10-08, the People Management revamp — PR1 of 4;
user: 不要 role，到最后是跟着 title 的 permission 走).** A title points at a
TEMPLATE (`titles.template_id`): cells = function × action (view create edit
approve void export manage) × scope (own / dept / all) in
`permission_template_grants`, plus sensitive fields (salary / nric / bank) in
`permission_template_sensitive`. Rows = `permission_functions` (the design's
22 + Member Services, Revenue app, Switch views). One person is raised or
lowered on a cell in `user_permission_cells` (scope NULL = ✕). Ten templates
seeded, 29 titles mapped; ACCOUNTS EXECUTIVE waits for the user; the four
shared accounts (no staff row) keep their role defaults. **Ultimate full
access** = everything + `view_switch` (the View-as switcher reads that key on
the REAL account — `User.canSwitchView` — not the Principal role); **Full
access** = the same without it. THE GATES STILL READ MODULE KEYS:
`current_permissions()` opens each cell's key via `permission_cell_keys`
FAIL CLOSED — hr/treasury/admin-domain keys need the cell at All, hr keys need
Salary amounts ticked, treasury keys need Treasury · View, admin keys (the
Principal's own powers) need a Principal template — and the UI lists what is
"held for now" with the reason (`heldCells`, `lib/permission-matrix.ts`,
the TS twin of the SQL). The account's hidden role = the template's
`base_role` (`sync_user_role` triggers; new role `staff` = no defaults).
Retitling somebody WITH a login onto another template, or linking a login,
needs `permissions_manage` (trigger `hr_staff_costs_permission_guard`) —
HR cannot promote anybody, themselves included, by retitling. Writers are RPCs
(`permission_template_save` w/ version + per-person reset list,
`permission_template_create`, `permission_title_set_template`,
`permission_user_cells_set`, `permission_user_clear_legacy`); a save that
changes a cell somebody has their own value on asks keep-or-reset per person.
Every change is in `audit_events` (one txid per save; History on the
Permissions tab, `permission_history()`, `lib/permission-history.ts`). Old
per-key `user_permissions` still apply on top (carrie's 3 denies) until cleared
on her card. PR2 (actions enforced) below; NEXT: approvals by domain, PR3
own/dept into RLS, PR4 masking — then `permission_cell_keys` goes. Migs `20261008110000`–`130000`,
`tests/member-sql/validate-permission-templates.mjs`.

**THE APP-WIDE HISTORY (2026-10-08; user: 在 portal 里人手改的资料全部要有 audit
history（谁、什么时候、改前/改后）… ERP 自动送进来的大量资料不用逐行记，但人手在上面做
的改动要记; and 这个 audit log 基本上就是跟着自己的权限 … Finance 没有 HR 那边的
permission，同样他就不会看到 HR 的 audit log).** Every table of the app has ONE
line in `audit_tables` (187): `mode` all (every insert / update / delete) ·
people (only a signed-in person's change — the ERP-fed `sales_orders`,
`sales_order_lines`, `sales_import_batches`, Open Bill suggestions,
`comm_upsales`, the ERP's fairs / venues / organisers; trigger `WHEN
(auth.uid() IS NOT NULL)`, so the feed costs nothing) · none (with a `reason`:
logs that are a record already, the ERP catalogue mirror, statutory
schedules, run statements, screen layouts, the unmerged CRM's tables). The
trigger `audit_row_change()` (no arguments — it reads the line) keeps who
(`actor_id` = auth.uid(); `actor_source` portal / server / database; a server
write names its person via `actor_column`, the member's invoice upload), the
row's key, before / after (`omit_columns` never copied — the ERP's `raw`, run
and close snapshots; `diff_only` UPDATEs keep only changed + key + label
columns on the wide tables), `changed` (updated_at / updated_by / version
never count) and `needs` (a payroll voucher, its sources / attachments /
approval and the pool rows its payment wrote need Payroll payouts or HR
Costing — the line `lib/payroll-vouchers.ts` draws). **A NEW TABLE = one
`SELECT audit_register('t', 'Label', 'Area', '{read_keys}' …)` in its own
migration** — `src/lib/audit/registry.test.ts` fails otherwise, and so does
the next audit migration's coverage check. **Reading follows the reader's own
permissions:** nobody selects `audit_events` (grant revoked, PR1's policy
closed); `audit_changes()` returns only tables whose `read_keys` the caller
holds (`audit_log` = all), drops what `needs` a key they lack, and blanks
`salary_columns` / `nric_columns` / `bank_columns` their title may not see
(`current_sensitive_fields()`: template's sensitive fields, else Principal / HR
bank+NRIC, Finance bank; salary = `salary_individual`) — the column names come
back in `masked`. A department head reads none yet (own / dept = PR3).
`config_audit_log`'s 44 rows were copied in (one negative txid per old save),
its 8 triggers DISABLED, `log_config_change()` left unused — nothing is
dropped (the MCP refuses any `DROP` text; use CREATE OR REPLACE TRIGGER /
DISABLE TRIGGER / ALTER POLICY). UI: Audit Log is a sidebar group — **Changes**
(`/audit-log`, `canSeeAuditChanges` = any key in `lib/audit/read-keys.ts`) and
**Access** (`/audit-log/access`, `audit_log`; old `?resource=` links
redirect). `lib/audit/changes.ts` (saves, fields, values), `lib/audit/refs.ts`
(ids → names under the reader's session), mig `20261008190000`,
`tests/member-sql/validate-app-audit.mjs`.

**EACH ACTION TAKES EFFECT (2026-10-08, PR2; user: 每个 action 各自生效).** A
write asks for the ACTION it is, not the module key: `requireAction('treasury',
'create')` / `requireAnyAction([…], […])` / `requirePayrollPayoutsAction` (lib/auth.ts)
at every Server Action and form page, `canDo(user, fn, action, scope?)` for the
button (lib/permission-actions.ts), `has_action()` in SQL. The answer is
`current_actions()` (jsonb `fn.action` → own / dept / all; `User.actions`): a
titled person's template cells with their own cells over them, else what the
account's KEYS allowed — `permission_key_actions` (80 rows, TS twin
`KEY_ACTIONS`, a department manager's department functions at Dept) — so the four
shared accounts can do exactly what they could (verified on prod: every one of
the 5 logins' actions = its keys'). A cell counts only while one of the keys that
open its function's pages is held (`viewKeysOf` = the keys that allowed its View;
`has_action` asks the same) — PR1's fail-closed key rules still decide pages.
What each cell opens is in docs/access-matrix.md (amendment 2026-10-08 PR2):
Approve is somebody else's submission (the queue, a claim, a reconciliation
marked done, amending a BOOKED loan — the Treasury description), a module's own
steps are Create / Edit (HR's Complete, Submit, Total Close; Revenue's closes;
Director Salary's Complete), Void reverses, Export is a file. A key's actions
must cover every gate it passed (`permission-actions.test.ts`), which is why a
sign-off Finance always made is Edit OR Approve (send a payroll batch back =
Void | Approve) and `team` gives `team.manage` (titles + ladder, as HR had).
`GATED_ACTIONS` lists every action a gate asks and the least reach (Claims ·
Create Own, My Billing · Create and Dept reports · Export Dept, the rest All);
the test scans `src/` and fails when a gate is added without it, and the
matrix's *held for now* reads it (`heldCells`). Unconverted on purpose: page
reads (key), Reports' layout (key), the member app (its own keys), Department
mode (`has_perm` in the DB), member back office (DB `member_is_manager`), and
approvals (below). Test mocks of a user carry `actions` (`src/test/with-actions.ts`);
a user without them may do nothing. Mig `20261008200000`,
`tests/member-sql/validate-permission-actions.mjs`.

**APPROVALS GO BY DOMAIN (2026-10-09, PR2b).** A request is decided by whoever
holds its DOMAIN's Approve — Treasury: vouchers, loans, fund sources and their
cancellations (`tier_change` on a fund source), department expenses / payment
requests, advances, withdrawals, escalations, base rate; HR Costing: payroll
runs, HR cost submissions; Director Salary: Invoice Pool releases; contracts
only the queue's — or the queue's own Approvals · Approve (everything), and
NEVER by whoever raised it unless their account is the Principal kind (user
2026-08-06 kept the Principal's self-approval; a checker approving their own is
no check). SQL `approval_domain()` / `approvable_types()` / `approver_may(user,
types, submitters)` (+ `_request(id)` / `_group(id)`; no sign-in = the old rule:
the account handed in must be a Principal); TS twin `lib/approval-domains.ts`
(`approvableTypes`, `decision` → why not, `canSeeApprovals`), gates
`requireApprover` / `requireApprovalQueue` (lib/auth.ts). The ten approval
functions (approve_single_voucher, the two batches, payroll run approve /
reject, execute_loan_cancel / _fund_source_cancel — now also only behind an
APPROVED cancellation — dept expense approve / reject, dept_request_pv_rejected)
keep production's bodies: one statement swapped in place by
`pg_temp.swap_check` (pg_get_functiondef + replace, refused unless the old check
is there exactly once). New key `approvals_queue` (no table scope) is opened by
Approvals · View, so the Director and Executive office reach `/approvals`
without the admin-scope `approvals` key. Policies: approval_requests read /
flip for deciders (`IN (SELECT unnest(approvable_types()))` — `= ANY ((SELECT
arr))` parses as a SUBQUERY and fails `text = text[]`), loans / bank_accounts
update for Treasury approvers. The queue draws a non-decidable row with "—" and
why (`undecidable` on PendingApprovals). hr_costing / director_salary / revenue
keys' Approve rows moved to the `approvals` key (UPDATE, not DELETE — the MCP
refuses DELETE): hr@ approves no payroll run, as before. Mig `20261009010000`.

**THE DATABASE ASKS FOR THE ACTION TOO (2026-10-09, PR3a).** A table's row
policies opened it to whoever held ANY key of its domain (`has_scope(ARRAY
['treasury'])`), and a View cell opens a key — so through the API a template
that only reads Treasury raised payment vouchers and a Director who sees the
roster wrote payroll. Every table a domain policy lets somebody write now also
has a RESTRICTIVE policy per command, `needs_action_insert / _update / _delete`
→ `may_write(table, command)` → `has_any_action(actions)` over the row of
`permission_table_writes` (TS twin `TABLE_WRITES`, lib/permission-table-writes.ts;
`fn.action` or `fn.action:dept` / `:own`). Restrictive = only takes away. Each
list is every way the APP writes that table under the caller's own session: the
gate of each server action writing it straight, of each SECURITY INVOKER function
it calls (the Revenue / catalogue / ladder RPCs — `INVOKER_WRITES` in the test),
and of each INVOKER trigger writing on its behalf (a voucher marks its invoice
paid, so every voucher writer is on invoices UPDATE). DEFINER functions meet no
row policy (postgres owns tables and functions, BYPASSRLS) — they ask for their
own action (PR3b, below). `permission-table-writes.test.ts` holds the twin, scans
every `.from('t').insert/update/upsert/delete` and `.rpc(invoker)` in src/ with
its gates (own function, else its callers across imports) and fails when a gate
lets in an action the table does not ask for, or a new domain table is written
unregistered; the migration's guard refuses a domain write policy left without
its restrictive one. A NEW table a domain policy opens: rows in
`permission_table_writes` + `SELECT permission_writes_guard('t')` in its
migration. `WRITES_WITHOUT_ACTION`: table_layout_defaults only. Residual, said
out loud: a table's UPDATE cannot tell edit from void from approve (an approver
may update a voucher), and an action that writes a table as a side effect may
write it straight (Claims · Approve raises the claim's voucher). Mig
`20261009020000`, `tests/member-sql/validate-table-writes.mjs`.

**THE FUNCTIONS ASK FOR THE ACTION TOO (2026-10-09, PR3b).** 70 write functions
(DEFINER, plus `commit_sales_import_batch` and the commission trigger
`guard_revenue_commission_adjustment`) asked who the caller WAS — `IF v_role NOT
IN ('finance','principal')`, `EXISTS … role IN ('principal','hr')`,
`has_perm('hr_costing')`, `has_scope(ARRAY['hr'])` — so a template's hidden kind
decided (a Finance · Checker could book a loan through the API; a Director whose
template HAS Treasury · Create was refused it) and a View cell, which opens the
key, could submit payroll. Each now asks `has_any_action(…)` for the action its
app gate asks, its one check statement swapped in place in PRODUCTION's body
(`pg_temp.swap_check`: whitespace-blind, exactly once, nothing else moves); no
sign-in answers as before. A function that also runs INSIDE another one — as
the same signed-in person — asks for the outer path's actions too:
`mark_journal_entry_reversed` (the loan / fund-source cancel executors run as the
cancellation's approver: + Treasury · Approve, Approvals · Approve),
`assert_commission_payroll_open` (Revenue · Edit or HR Costing · Edit — closes,
pay lines, HR's adjustments, the payroll triggers), `payroll_send_back_batch`
(Finance's send-back of a whole run). On production only four things moved, none
a page of theirs did: carrie's manual JVs (her Reconciliation is held back by
hand; the table refused them since PR3a) and hr@ closing a voided voucher's
approvals (Treasury · Void's). `permission-table-writes.test.ts` › *the DEFINER
functions that ask for an action* reads every swap out of the migration and fails
when a caller's gate lets in somebody the function refuses (All covers Dept
covers Own; a `requireApprover()` path names its domain in
`DECIDED_IN_ONE_DOMAIN`). A NEW write function asks `has_any_action` for its app
gate's action — never `current_user_role()`, never a key. Left on purpose: the
approvals (PR2b, by domain), `permissions_manage`, `department_mode`, reopening a
closed payroll month (the Principal's), the member app's own keys, the
service-role-only `reopen_director_salary` / `reverse_staff_payroll_accruals`,
the commission-run functions no page calls (`apply / save / reopen_commission_run`,
INVOKER), and every READ function (reach = PR3c). Mig `20261009030000`,
`tests/member-sql/validate-function-actions.mjs`.

**OWN AND DEPT REACH THE ROWS (2026-10-09, PR3c).** A cell's reach (Own / Dept /
All) was the app's alone: 18 row policies asked `current_user_role() =
'dept_manager'` (or a list of kinds), so a template's Dept cells reached its
department only on a dept_manager-kind template, and Own reached nobody (Staff ·
Basic raised a claim it could not read). Each now asks
`has_action(fn, action, 'own'|'dept'|'all')` — with the department / segment read
off the person (`current_user_department_id()`, `current_user_segment()`) — and
is `TO authenticated` (has_action is not the publishable key's to call): Claims
own / dept / all, raised only as yourself with Claims · Create; Dept Pool its
department's pool, expense and payment requests; My Billing its department's
invoices, contracts, requests and its own draft invoices in its segment; Dept
reports its segment's invoices and journals; an approval request raised as
yourself by `may_write` (PR3a's list); a Revenue commission adjustment read by HR
Costing / Revenue · View. 17 READ functions behind those pages swap the kind for
the same cells (`calculate_dept_np`, `get_dept_opex_rows`,
`dept_invoice_settlements`, `rnp_invoice_events`, `bridge_mirror_slices`: All =
any department / segment, Dept = theirs; the HR-cost lump sums, billing
allocations, payroll accrual / funding reads: Billing, HR Costing or Treasury ·
View; `revenue_pay_preview` / `comm_effective_direct_line_limits`: Revenue ·
View). Production, every active login: the same rows in all ten tables; moved only
reads no page of theirs makes — hr@ a department's NP / OPEX, carrie report-only
mirror slices, Finance the per-director payout summary (Director Salary is not
Finance's). `permission-table-writes.test.ts` refuses a later row policy that asks
`current_user_role()`. Still by kind, on purpose: `approvals_decider_update`
(owner kind may decide their own request), `table_layout_defaults`,
`dashboard_summary` (which dashboard to draw). Domain READS (`has_scope`) are still
by key: a View cell of one Treasury function reads its domain's tables through
the API. Mig `20261009040000`, `tests/member-sql/validate-reach.mjs`.

View as (2026-09-27): the Principal's `vp-view-as` cookie is shared by every
tab. *Revenue View* (`revenue_member`) is honoured by the member app ONLY
(`getMemberUser`); the portal's `getUser` ignores it. Before, switching one tab
to Revenue View sent every other tab's portal page to /dashboard — a Product
List tab "jumping to Overview". `vp-view` is a readable mirror of the choice,
so a tab left open re-renders its shell when another tab switches
(`useViewAsSync`, `lib/view-as.ts`). `getAccountUser` (2026-10-08) reads the
account with no mask at all; only the Product List asks it.

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
The member Quote page sells from the Product List, not a list of its own: `member_catalogue()` (mig `20260924040000`) answers every SKU ticked on **Product List › Modular** (`catalogue_skus.offered`, and its model's `catalogue_models.offered`), still ACTIVE in the ERP, under a brand the member's calculator scheme sells — "10 SKUs, 7 ticked → the calculator offers 7" (user 2026-09-24). Both snapshots read it UNPRICED (names, sizes, the sofa grid's height × tier choices, each sofa / bed frame model's dropdowns = the portal's ticks ∩ what the ERP still allows ∩ the live Maintenance pool) and return `catalogueModels`; the quote reads it PRICED through the service role only (`lib/member/server.ts`, after `member_quote_context` authorised the session) — no price ever reaches a browser. The cart carries ONE sofa build (seat height, tier, leg, specials — the Revenue app's sofa sheet offers the leg and specials again since 2026-10-06, only what Modular turned ON for EVERY sofa model in the cart AND Maintenance charges; the revamp had left them out: `sofaPick` / `sofaBuildToSend` in `components/member/app/quote/quote-model.ts`); since 2026-10-05 EACH bed frame line carries its own build (`QuoteLine.bedframe`): its divan, leg, gap and total height are FOC or one of the options turned ON for the model on Modular that Maintenance CHARGES and the ERP still allows (`MemberCatalogueModel.charges` — a customer's price, so the unpriced snapshot carries it), its specials the same minus the FOC — a special with no price is not offered at all (user 2026-10-06); one frame built two ways is two lines (`frameBuildError`, `lib/member/build.ts`), and the server refuses anything else. The keypad is the SELLING price: bought KPI items and the option charges ride on top, out of the margin (a FREE KPI item comes off the price), and `QuoteResult.customerPays` says the total. The calculator costs the way the run does (`lib/member/calculator.ts` `costLines` over `lib/catalogue/*`): SKU price at the build, a matched priced combo costed as the combo; every option priced on Maintenance is CHARGED on top instead (a bed frame's per frame, a sofa's once per sofa — `sofaSetCharges`, 2026-10-06). People › Member Services › Product options is now a pointer to Modular (`comm_products` / `member_product_options` are no longer read by the member app). **Riders**: bed frames and accessories carry NO brand — they join any cart, their cost counts in the one margin, and the mattress or sofa's brand decides the ladder (in the run: the bill's own brand, the ERP's Branding — `SalesOrder.brandCode` into `marginBase`, 2026-09-27) — and so does a brandless mattress or sofa marked *Rider* on Modular (`catalogue_models.brand_code = 'RIDER'`, read as no brand, never as one). A mattress or sofa is never a rider by default: one whose ERP branding matches no brand (MYLATEX, or none — 36 mattresses + 6 sofas on 2026-10-06) is not offered until a Margin ladder is chosen for it, and Modular says so (`isRiderModel`, `lib/catalogue/options.ts`). **Modular asks ONLY there (2026-10-06, user: 它是跟着 brand，而不是跟着我这里去选 … for those system can't detect the brand):** a model's window shows *Margin ladder* and *Calculator section* only for such a mattress or sofa (`needsBrandPick`); a branded one follows its brand and its ERP section, and a bed frame / accessory / every other category is always a rider in its ERP section (user: its margin follows the calculator's or the sales order's brand). `member_catalogue` and the Product List loader ignore a ladder or section stored for either; mig `20261006170000` cleared the 357 sections the September carry-over had stored (22 accessories' Pillow / Protector from the old list now read the ERP's Accessory / Protector — all gift-eligible, one accessory list in the Revenue app). A model's dropdown with an EMPTY ERP list is the whole Maintenance pool — the ERP's own "no restriction" (`erpAllows`). **Cost basis**: Revenue Team cost = cost ÷ `comm_schemes.revenue_cost_divisor` (Fair 0.7; Rules › Scheme rules) in the calculator, the snapshot order margins and the run alike. Margin = (price − cost) ÷ price; the price for threshold t is cost ÷ (1 − t), never cost × (1 + t). Mig `20260915060000`.
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
Machine ingest — the ONE exception to the rule above (2026-09-05, ERP live sync): another SYSTEM pushing data in (the Houzs ERP's database via pg_net) cannot call a Server Action and has no session, so it gets a POST Route Handler under `app/api/<system>/v<n>/`. TWO of them exist, both the Houzs ERP's: `sales-orders` and, since 2026-09-17, `products` (the catalogue mirror; items only since 2026-09-24). A second endpoint of an existing feed is not a second exception — a second SYSTEM would be. The exception is narrow and every part of it is required: a static shared secret from env compared in constant time and failing closed when unset (never a session, never a query param); the service-role client used for ONE thing — calling a single ingest RPC that owns every write; the path excluded from `middleware.ts`; every delivery logged (`erp_sync_events`); 2xx for every delivery the portal chose not to apply, because the sender's outbox retries non-2xx forever. Nothing a browser calls may ever be a POST handler. **THE SECOND SYSTEM: META (user-approved 2026-10-01 for Messenger, 2026-10-02 for WhatsApp under the same approval).** `app/api/whatsapp/v1/webhook` (GET = Meta's one-time handshake, answered only when `hub.verify_token` equals `WHATSAPP_VERIFY_TOKEN`; POST = deliveries signed `X-Hub-Signature-256`, HMAC of the RAW body with `META_APP_SECRET`, both compared in constant time and failing closed when unset) → the one ingest RPC `crm_ingest_whatsapp` (service role only; writes `crm_contacts` / `crm_messages`, logs every delivery in `crm_channel_events`); excluded from `middleware.ts`; `GET /api/whatsapp/v1/health` reports which settings are set, yes/no only. The crm_* tables have RLS on (mig `20261002010000`, PGlite check `tests/member-sql/validate-crm-whatsapp.mjs`). **The CRM's read path (2026-10-02, migs `20261002070000` / `080000` / `090000`, PGlite check `validate-crm-team.mjs`):** SELECT only, writes stay closed. A person's CRM role comes from their TITLE through `crm_role_map` (empty until the owner maps titles — until then nobody but the service role reads a customer); who is below whom is `hr_staff_costs.reports_to`. Everyone reads themselves and their whole downline, never a peer; Boss and HOD read everything, including customers no team took; a TL also reads their team's not-yet-assigned enquiries (`crm_contacts.team_id`). **The Principal is the Boss (2026-10-03, mig `20261003070000`):** an account with no staff record of its own that IS the Principal (`users.role = 'principal'`, as `member_principal_snapshot`) is, to `crm_me()`, the active staff member whose title maps to Boss (the CEO) — so the Boss reviews the CRM from the Principal login; the portal's view-as `staff=` does not change who the CRM thinks you are. A linked record always wins. **Principal vs HOD (user 2026-10-03, mig `20261003080000`, PGlite `validate-crm-assign.mjs` / `validate-crm-writes.mjs`):** the Principal (Boss) takes and answers no enquiries — CRM tabs Overview (leads, appt rate, show-up rate, each team; `MemberCrmOverview`) · Assignment · Calendar, no Inbox/Contacts; picking a member in the Revenue app's Today opens the CRM on that member (`viewingStaffId`). The HOD sells too: Inbox/Contacts/Calendar with All · Mine · Teams, replies only to customers given to them (`crm_can_reply`; `crm_give_to_hod`, from a chat's With… control). Both set full time and decide ads ad by ad on Assignment (`MemberCrmAssignment`, explicit Save → `crm_save_ad_rule(ad, label, tls, shares)`): hand to teams (evenly) or split by % (`crm_assign_rules.shares`, adding to 100). An ad nobody set, and an enquiry from no ad, goes EVENLY across every team (`crm_pick_team`; `crm_team_settings.team_share` and Mode 2 are no longer read; the next-10 preview is gone). The signed-in side may only ask about ITSELF (`crm_my_role()`, `crm_my_downline()`; the any-person `crm_role_of` / `crm_downline` are service-role only), and every policy wraps them as `(select …)` so they run once per query. `src/lib/member/crm-team.ts` is the TypeScript twin — keep them in step. New: `crm_role_map`, `crm_staff` (full_time, the HOD's call), `crm_assign_rules` (ad → TLs), `crm_team_settings` (team %; which Mon–Thu days go by the member %s — an unticked day waits in the TL's To assign list; a Fri–Sun switch: on = full-time RS only in turn, off = the same %s — mig `20261003010000`, user 2026-10-03; the old `weekday` column is unread), `crm_appointments`. `crm_people()` (mig `20261002100000`) = who you are + the names/roles/upline/full-time of the people you may see (a salesperson cannot read hr_staff_costs; never a salary). The member app's CRM reads all of it LIVE under the member's own session (`app/(member)/member/crm-actions.ts` → `lib/member/crm-live.ts`, rows → the demo's shapes); `/member/preview` keeps the demo. **Live writes (2026-10-03, mig `20261003030000`, PGlite `validate-crm-writes.mjs`):** every change is a database function under the member's own session that asks who may first — mark read, status/Lost reason, book/move/came/cancel, a TL assigning in their team, the Boss/HOD sending to a team, team days/switch/%s, the split between teams, ad → TLs, full time (HOD). `crmWrite` (crm-actions.ts) passes calls through from a fixed list; `MemberCrm.tsx` `persist` saves FIRST and changes the screen only on yes (settings save 0.6 s after the last change). Live sends the customer nothing about appointments yet and says so. **Showrooms (2026-10-03, mig `20261003050000`):** `crm_showrooms` is the booking list (Kuala Lumpur today, id `kl`); the Boss / HOD add, rename, close or reopen one in the CRM's Settings (`crm_save_showroom`), and `crm_book` / `crm_move_appointment` take only an open one. The screen names showrooms through `components/member/crm-format.ts` (`setShowroomList`), never the demo's list on live. **New enquiries are dealt on arrival** inside `crm_ingest_whatsapp` (mig `20261003020000`, PGlite `validate-crm-assign.mjs`; twin `pickInTeam`), balanced on the last 30 days. Not yet live: photos/voice, templates, auto-replies. **Built: replying on WhatsApp (mig `20261002110000`).** `sendCrmReply` (crm-actions.ts), under the member's OWN session — no service role: `crm_can_reply(contact)` first (the customer's own person or an upline who takes enquiries / a Senior TL; never Boss or HOD; a waiting enquiry is its TL's), Meta's 24-hour window (`lib/whatsapp/send.ts` `windowOpen`, from `crm_contacts.last_customer_at`), then the Cloud API with `META_SYSTEM_USER_TOKEN` (server env, never the browser), then `crm_record_reply` (asks again; keeps Meta's wamid so the webhook's sent/delivered/read/failed find it; New → Follow up). Text only; photos, voice and templates come later. The message shows only after it went AND was kept; a failed send keeps the draft. **Messenger (2026-10-03)** is the second endpoint of this same system: `app/api/messenger/v1/webhook` (same handshake — `MESSENGER_VERIFY_TOKEN`, else `WHATSAPP_VERIFY_TOKEN` — and the same signature), our Pages only (`META_PAGE_IDS`), the customer's name asked of Meta with the Page's token before the one ingest RPC `crm_ingest_messenger` (mig `20261003040000`, PGlite `validate-crm-messenger.mjs`): one customer per (Page, PSID), dealt on arrival, deliveries by mid and reads by watermark. Replies (`sendCrmReply`) use the Page's token from the System User token: inside 24 h a normal response, 24 h–7 days with the HUMAN_AGENT tag (Meta must have approved Human Agent), after that none. Customer media: `GET /member/crm-media/<message id>` (read-only download; the message read under the member's session, the file fetched from Meta's own hosts with the token — `lib/whatsapp/media.ts`).

**THE CRM REDESIGN (2026-10-09, Claude Design handoff `docs/design_handoff_crm_roles`; overrides the CRM rules above where they differ):** salespeople get the salesperson CRM (`components/member/crm/sales/`, design 3b), the Principal and the Revenue Director the Control panel (`crm/panel/`, design 1a; the Director toggles Control panel | My CRM). Screens are GENERATED from the prototype (`node tools/crm-design/gen-sales.cjs` / `gen-panel.cjs`; patches in `tools/crm-design/panel-patches.cjs`) — behaviour lives in `vm/*.ts`, never in the generated `Sales*.tsx` / `Panel*.tsx`; `crm.module.css` undoes the portal / member-workspace styling inside the CRM (line height, box sizing, heading styles, borders) so it measures as the prototype does. Rules (migs `20261009060000`–`090000`): reply urgency 3 h · 6 h · 9 h on real elapsed time; an ad with NO rule, and an enquiry from no ad, waits in **Organic Leads** for the Principal / Director to send by hand (no longer evenly across teams); ads to teams per ad = Evenly · By team % · By people (max or %), counted over the campaign (`crm_ad_assign`); Full time per team on chosen weekdays (`crm_fulltime_rules`); the Principal and the Director may reply in anyone's chat (`crm_can_reply` → `crm_sees_all()`), send / move anyone (`crm_send_to`, 30 s Undo on screen); Book visit and Change keep to the showroom's slots, closures and per-slot limit (`crm_slot_check`); Share = invitation within one's team, Move = to one's direct superior, both accepted by the receiver (`crm_invite` / `crm_answer_invite`); Won / Lost / moved / shared are `crm_events` (notifications). Auto-replies are SAVED but NOT SENT (user 2026-10-09: 先不發送).
Supabase client — server-side (`lib/supabase/server.ts`) uses the anon key with RLS via SSR cookies. `admin.ts` is the service-role client and BYPASSES RLS entirely. It is `'server-only'` guarded and has exactly EIGHT callers: `app/api/whatsapp/v1/webhook/route.ts` (Meta, 2026-10-02 — calling `crm_ingest_whatsapp`, and logging a refused delivery to `crm_channel_events`), `app/api/messenger/v1/webhook/route.ts` (Meta again, 2026-10-03 — the same, with `crm_ingest_messenger`), `app/api/erp/v1/sales-orders/route.ts` and `app/api/erp/v1/products/route.ts` (each uses it for one thing — calling its ingest RPC; the second, since 2026-09-24 the items-only catalogue mirror, is the SAME machine path as the first, a second endpoint of one feed rather than a new kind of caller), `app/api/member-queue/route.ts` (the cron-secret queue sweep, `member_process_all_queues`), `lib/member/server.ts` (a member quote's PRICES — `member_catalogue(…, p_priced)`, service-role-only, read only after `member_quote_context` authorised the session — and, the same way, its cost ratios (`member_quote_cost_rules`, 2026-10-05: the context a member's own login can call no longer carries them), and the invoice attestation insert; since 2026-10-05 also the member's month through Comm Cal's engine, `loadMemberIncome`, read only after `member_income_context` authorised the session because the engine reads costs no member session may, and My honours' kept finishes, `member_honours`, written there so no browser can put a place in them), `team/people/invite-actions.ts`, and `lib/erp-sync/feed-key.ts` (2026-09-13: the key the ERP generated and somebody pasted on Comm Cal lives in Supabase Vault behind `erp_link_put/get/drop_secret` + `erp_feed_secret`, executable by the service role ONLY — because whatever an HR user's server action can read with their session, their browser can read too, and that key opens the receiver). Reach for it only when a machine path has no session to act under or a secret must stay out of every session's reach, never to dodge an RLS policy that is merely inconvenient.
Sign out (2026-10-08) — ends THIS device's session only: `auth.signOut({ scope: 'local' })`. Given no options supabase-js signs out `'global'`, and the auth server deletes every session of the account — the phone, the other PC, every tab. The shared accounts (principal@ / finance@ / hr@) are switched on the office PC by Sign out → sign in several times a day, so the Principal's phone and desktop kept landing on /login (auth log: ten global sign-outs of principal@ on Oct 5–7, each followed by "Refresh Token Not Found" elsewhere). `src/lib/sign-out-scope.test.ts` refuses any `auth.signOut(` without it.
Navigation speed (2026-09-26) — a click must answer at once. Every route folder with child routes has a `loading.tsx` rendering `RouteSkeleton` (`src/app/route-boundaries.test.ts` fails otherwise): without it Next keeps the page being left frozen until the server answers. The client router keeps pages FIVE MINUTES (`experimental.staleTimes`, 30 s until 2026-10-08), so a write must `revalidatePath` (or set a cookie) before it redirects — that is what empties that memory — and a page shown from memory refreshes itself behind the click (`components/layout/RouteFreshener.tsx`, `lib/route-freshen.ts`: no skeleton and no `?_rsc=` fetch of that path since the click = from memory → `router.refresh()`; never an `AUDITED_ROUTES` page). A component holding unsaved edits must survive a refresh — keep a field's typed value over new props the way `PayrollRow` / `AmountInput` / `DirectorPoolClient` do (user 2026-10-08: 切换到另外一个 tab 都非常的慢 … 我要它做到真正的快). Warm a page only through `lib/nav-warm.ts` (`warmOnIntent` / `warmRoute` / `warmWhenIdle`): one link at a time, never an `AUDITED_ROUTES` page — a full prefetch reaches the server as a render, so a page that writes access_log while rendering would log a view for a mouse-over. The Sidebar also warms the person's usual pages (`recordVisit` / `usualPages`, opened ≥2 times, three at most, 2 s after the last navigation, 700 ms apart, desktop only). Nothing may fire a Server Action on its own after a navigation (page views go through `lib/page-view.ts` from the browser): Next refreshes the whole page after any navigation that interrupts a pending action. Progress: `NavProgress` in the root layout, started by `src/instrumentation-client.ts`; DESIGN.md › Navigation feedback (v3.8). A page's independent reads start together and only real dependencies wait (the month page `revenue/[sub]/[period]/page.tsx` is the pattern; wrap a PostgREST builder you await twice in `Promise.resolve` — awaiting a builder again sends it again). `fetchByKeys` runs 4 chunks at a time. A read started ahead of its `await` goes through `startRead` (`lib/start-read.ts`: one request, marked handled — a page that returns or throws first leaves no unhandled rejection), and answers are awaited in the old order so the same failure surfaces first. A whole table goes through `fetchAllRowsParallel` (the first page asks the count, the rest go 4 at a time; every GL report 2026-10-08: 5–12 round trips in a row → 2–3), an id list of unknown length through `fetchByKeys`, never one `.in()` (418 voucher ids = a 16 KB URL). A read — or an rpc returning rows — that can pass 1,000 rows is PAGED: PostgREST stops at 1,000 without a word (2026-10-08: Journal Entries showed "0 lines" on vouchers past the 1,000th journal line; the sales file import lost the brand of 553 of 1,553 products). Where the page leans on the read's tie order (labels joined as they arrive, a stable sort's ties), `fetchAllRowsAsWritten`: sent as written while under the cap, paged with an `id` tiebreaker only when full. The department registry (`lib/dept-registry.ts`) is module state `createClient()` refreshes every 30 s, beside the request (only an instance's first read waits), from a SIGNED-IN request only, and an empty read never replaces it: RLS shows departments to a session alone, and a sign-in landing on a due refresh used to empty it for every request on the instance (2026-10-08: Dept Pool's bank balance RM 254k for 507k). Two database traps behind the 3–10 s month page (mig `20260926100000`): a SQL function that calls another SQL function PER ROW re-checks the caller's permissions on every call (`has_scope`, ~1.7 ms each — 317 bills = 1.5 s), so join the answer once instead; and under RLS only LEAKPROOF comparisons reach an index (int, date and text equality do; numeric and enum comparisons do not), so a big lookup table searched by an amount needs a SECURITY DEFINER function (`lookup_pcb`).
A release reaches open apps (2026-10-06) — an installed app is resumed from memory, not reloaded, and the member app changes screens with `history.pushState` and reads through Server Actions, so it never makes the navigation that would meet a new build; and Next recalculates every Server Action's id per build, so a copy left open across a release starts failing its reads. The service worker is NOT the cause (it caches no page). The build names itself: `next.config.ts` bakes `VERCEL_DEPLOYMENT_ID || VERCEL_GIT_COMMIT_SHA` into the bundle as `NEXT_PUBLIC_APP_VERSION` and answers it on `/sw.js` as `X-App-Version` (empty off Vercel = never prompts). `components/pwa/UpdatePrompt` (root layout) asks with a plain HEAD — no deployment pin, so Skew Protection cannot keep it on the old build — on load, on every return to the screen (`visibilitychange`, `pageshow`), on `online` and every 5 min in view; a newer build is OFFERED (*A new version is ready* · Update · ×), and IN THE REVENUE APP ONLY (`/member`, `mayReloadOn`) after 30+ min away it reloads on return unless a field still had the focus or something was typed in the 10 min before leaving (`lib/app-update.ts`, user chose A 2026-10-06). The portal is only ever offered it: HR › Payroll holds edits until *Save all* without a `beforeunload` guard, and edits made long before a tab switch are invisible to any typing check — a reload there could cost unsaved pay. The member app's quote survives a reload (tab `sessionStorage`). Nothing reloads by itself while on screen. DESIGN.md › Update prompt.
Aggregate queries — prefer RPC functions (`dashboard_summary`, `get_hr_cost_summary`) over scattered per-field selects. Single round-trip, clearer intent, easier to unit test at SQL level. A balance is SUMMED by the database, never downloaded line by line to be added up: `gl_net_by_account(p_before, p_codes)` (mig `20261008180000`, SECURITY INVOKER so RLS still answers per user) is the Ledger's BALANCE B/F and the Trial Balance — ~3,860 / ~4,230 lines in four / five pages became one row per account (2026-10-08).
Error handling — Server Actions throw, pages use error boundaries, never return `{ data, error }` to the client
Date handling — store as `date` or `timestamptz` in DB, use `dayjs` for formatting. Compare by day (`dayjs().isAfter(x, 'day')`) to avoid timezone edge cases. A month is three letters (DESIGN.md › Date format): an `Intl` format goes through `formatIntlDate()` (`lib/utils.ts`), because en-GB and en-MY write September "Sept" (2026-10-03). TODAY AND THIS MONTH ARE THE OFFICE'S (UTC+8), on both floors (2026-10-09): Vercel and the database both keep UTC, so from 00:00 to 08:00 the machine's today is yesterday and on the 1st its month is last month. In the app: `officeToday()` / `officeMonth()` / `officeTime()` / `officeDay()` / `officeDayStart()` (`lib/office-time.ts`, #237), never a bare `dayjs()` / `new Date()` for a day. In SQL: `(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date`, never `CURRENT_DATE`, `to_char(now(), …)` or `date_trunc('month', now())` (mig `20261009000000` moved all 36 functions; `src/lib/office-clock-sql.test.ts` fails a later migration that brings one back). `now()` as an INSTANT (expiries, "last 30 days", `updated_at`) stays as it is.
Money — `decimal(15,2)` in DB. Display with `formatMoney()` from `lib/utils.ts`. Negative amounts render as red parenthesis notation `(1,000.00)`.
Naming — DB: snake_case, TypeScript: camelCase, Components: PascalCase
Files — one component per file, co-locate related files (`_components/` subfolders per route)
Testing
Framework: Vitest + happy-dom + @testing-library/react (bootstrapped Phase 1.5 Step 1). Run `npm test` (watch) or `npm run test:ci` (single run). CI runs four jobs side by side on every push (`.github/workflows/test.yml`, 2026-10-06 — ~5 min instead of ~10.5 one after another): `unit` (the Vitest suite in two halves, `--shard=N/2`), `sql` (the PGlite checks in `tests/*-sql`), `build` (`next build`, 4 GB heap, `.next/cache` reused) and `worker` (`npm run verify:worker` — builds the Cloudflare worker and renders a real PDF inside workerd). A docs-only change (`**/*.md`, `docs/`, `.design/`) runs none of them. See `TESTING.md`.
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
Do not leave a SECURITY DEFINER function open to PUBLIC / anon unless it checks the caller itself (`auth.uid()`, `has_perm`, `has_scope` …) — it runs as its owner, so RLS never asks, and Postgres grants EXECUTE to PUBLIC by default: the publishable key every browser holds can call it. A helper only other DEFINER functions call: `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` — and "no app code calls it" means its BARE name appears nowhere in `src/`, `scripts/`, `tools/`: a call may put the name on its own line under `.rpc(` (that is how `approve_voucher_batch` was locked by mistake and handed back, mig `20261006050000`). 21 were open, writers and approvals included, until mig `20261006010000` (2026-10-06). And a function handed a user id (`p_user_id` / `p_approver` / `p_created_by`) refuses a JWT caller whose `auth.uid()` is not that id — the approvals do since mig `20261006020000`; the app always hands in `user.id`, which View-as never changes. Journals: the app posts through `post_journal_entry_as_caller` (own name + treasury / admin / hr scope); `post_journal_entry` is the owner's and the service role's (mig `20261006030000`). **A role check must hold for somebody who has NO role (2026-10-09):** `IF v_role NOT IN ('finance', 'principal')` is NULL — not true — when the role is NULL, so it never fires for the publishable key, a self-made sign-up with no portal account, or a switched-off account whose session lives on; ~60 DEFINER functions were guarded only that way, and the publishable key read director payouts and staff allocations through them (checked on prod, rolled back). Since mig `20261009000100`: `current_user_role()` REFUSES (42501) a sign-in with no active portal account (still NULL with no sign-in: anon / service role / the database); EXECUTE on every non-trigger DEFINER function is revoked from PUBLIC + anon except the five row-policy helpers (`current_user_role`, `current_user_department_id`, `current_user_segment`, `has_perm`, `has_scope`); and the schema's default no longer grants anon or PUBLIC EXECUTE on new functions — a function the browser's anon key must call (none today) needs an explicit GRANT. Write a new guard as `IS DISTINCT FROM` / `has_action()` anyway. `tests/member-sql/validate-definer-login.mjs`.
Do not `CREATE OR REPLACE` a function from its last copy in `supabase/migrations` without first comparing that copy's body with production's `md5(prosrc)` — functions changed straight on the database drift, and an old copy re-applied silently undoes production's fixes and guards. Nine (the approvals, `post_journal_entry`, `apply_pool_adjustment`, `reopen_director_salary`, `get_payroll_breakdown_by_pool`) were brought back in line by mig `20261006040000` (2026-10-06), which holds them exactly as production runs them. A change made straight on production goes into a migration file the same day.
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
7. **HR's view sits on the white sheet (2026-09-27, DESIGN.md › "Sheet theme").** Every route under `/dashboard` (all four roles' Overview), `/hr-costing`, `/director-salary`, `/director-pool`, `/revenue`, `/claims`, `/team` (People) and `/member-admin` — `lib/sheet-routes.ts` — is drawn by PortalFrame on one white sheet in Comm Cal's month's tone: black lettering, orange `#E99A53` only as a surface (buttons, active tab, markers — never text), walnut for the one primary figure. Open such a page with `StatCards`/`StatCard` (`components/sheet/StatCard.tsx`), not a hero or a figure strip; statuses are `.chip`s; a closing total goes in `<tfoot>`. Extending the tone to another section = add its prefix there and convert the page the same way. Reference: `src/app/(portal)/hr-costing/page.tsx`.

Canonical reference pages (copy these patterns when in doubt):
- Page header + hero number + ledger table → `src/app/(portal)/fund-out/page.tsx`
- Multi-column hero summary → `src/app/(portal)/payments/page.tsx`
- Section-grouped tables → `src/app/(portal)/statements/page.tsx`, `src/app/(portal)/overdue/page.tsx`
- Sidebar (roman numerals + dot/bar markers) → `src/components/layout/Sidebar.tsx`
