# TODOS — HOUZS Venture Portal

Open items only. Trimmed 2026-10-14: the done items, the April phase-by-phase
history and the "Contingency plan (if Phase 1 hits a wall)" section are in git
history (`git log -p -- TODOS.md`).

---

## Owed — the React Compiler's lint rules (2026-10-21)

The move to Next 16 brought eslint-plugin-react-hooks 7, whose recommended set
adds the React Compiler's checks as errors: 1,157 on the day (`refs` 849,
`set-state-in-effect` 193, `preserve-manual-memoization` 46, `immutability` 26,
`static-components` 17, `purity` 11, `error-boundaries` 10, `globals` 5), and
not one from a rule Next 15's lint asked. They are off in `eslint.config.mjs`,
so lint asks what it asked before. Some may name real bugs (a setState in an
effect re-renders twice; a ref read during render shows a stale value). Take
them on rule by rule, smallest first, only if the React Compiler is wanted —
it is not on (`reactCompiler` unset).

## Owed — Dependabot alerts (2026-10-21)

GitHub's Dependabot alerts are off on the repo (`vulnerability-alerts`
answers 404), so nothing names a published hole in a dependency — `next`
included. The user, asked the same day: not now. Until then, `npm audit
--omit=dev` is the check (only what the site runs; 2026-10-21 after the
fixes: 0 critical — what is left is listed in the items below and mammoth's
CLI-only argparse / sprintf-js, never reached by the browser-side previews).
- **xlsx comes from SheetJS's CDN** (#604) and npm audit still checks it: it
  matches by name and version, wherever the tarball came from — checked the
  same day, a CDN-installed 0.20.1 is reported (GHSA-5pgg-2g8v-p4x9, high),
  0.20.3 is not. What npm cannot do is move it: `npm audit fix` and
  `npm update` never pick a newer CDN release. When an advisory names it, find
  the fixed release at cdn.sheetjs.com and change the URL in package.json
  (`src/lib/xlsx-version.test.ts` keeps it on the CDN). The same answer
  without npm: `gh api "/advisories?ecosystem=npm&affects=xlsx@0.20.3"`.

## Owed — pdf2json 3.2 (2026-10-21)

`pdf2json` is pinned at exactly 3.1.5 (`src/lib/pdf2json-version.test.ts`):
3.2 changed the coordinates it reports without a major version — on our own
PDFs the topmost line read y=874.89 where 3.1.5 reads 33.01, while the page
Height stayed in the old units. Until it moves, its bundled
`@xmldom/xmldom` 0.9.6 stays (npm audit: high), reachable only through a
bank statement PDF a signed-in Finance user uploads to Reconciliation.
- Moving it: re-derive `lib/bank-recon-pdf.ts` (rows grouped by y within a
  fixed tolerance, columns by x), the PDF layout tests (`lib/export/pdf.test.ts`,
  the invoice / voucher / credit note document tests) and the worker smoke
  (`tools/smoke-worker-pdf.mjs`) on 3.2's coordinates — and check real HLB
  statements, which the bank-recon tests (synthetic items) never parse.
- Or read statements with `pdfjs-dist`, already a dependency.

## Found — dates that follow the server's locale and time zone (2026-10-21)

Both seen while checking xlsx 0.20.3 (neither comes from it; production is
right today only because Vercel runs in UTC with a US locale):
- **Fund Summary's Excel prints a maturity date the US way**:
  `reports/fund-summary/export/_format/xlsx.ts:37` writes
  `new Date(…).toLocaleDateString()` with no locale, so production's file reads
  `6/15/2030` for 15 June (`15/06/2030` on a Malaysian PC). The portal's own
  format (DESIGN.md › Date format) would say `15 Jun 2030`.
- **Reconciliation reads an Excel statement's dates by the server's clock**:
  with `cellDates: true` xlsx builds each date at the server's local midnight
  and `lib/bank-recon.ts › parseDate` takes its UTC parts — right on a UTC
  server, a day early on a UTC+8 one (1 Oct read as 30 Sep, xlsx 0.18.5 and
  0.20.3 alike). Only a server run in Malaysian time is hit (local dev); reading
  the serials with `cellDates: false`, as the InfoTech and ERP imports do,
  would end it.

## Owed — sub-departments per person (2026-10-16)

The owner: permission ticked "按 sub-department" on the CRM and the Revenue
team's tabs; default = what a person handles. Shipped: the reach, the CRM (in
the database), the Revenue pages and sidebars (in the app), the person window's
pills (`.claude/rules/portal-wide/permissions.md` › SUB-DEPARTMENTS PER PERSON).
The owner, asked about the first two below: "4 先不做" (2026-10-16) — not now.
Build the data's before anybody is narrowed on a Revenue page.
- **The Revenue pages' data in the database.** `comm_*` / `sales_*` rows are
  still opened by the Revenue cells alone: somebody narrowed to Fair is kept
  off IR's pages but could read IR's rows through the API. Needs a RESTRICTIVE
  policy per table keyed by its sub-department (scheme → sub, batch → sub,
  order → batch, run → sub) asking the `comm_cal` / `sales_groups` / `rules`
  reach, without slowing the month's runs. Nobody is narrowed today.
- **The Revenue app's director scope** (`member_director_scheme` and the
  `member_*` readers that call it) follows `comm_sub_department_directors`, not
  the ticks: ticking IR for KRIS opens IR's CRM, not IR's team in his app.
- **Others' lists in the CRM** (`crm_role_of`) still read the structure: an IR
  salesperson held back from IR is out of the CRM but still assignable.

## Owed — Revenue Director (2026-09-11)

- **The CEO above the directors.** The user: "Revenue Director 上面就是
  CEO（CEO 部分后续再处理）". Today a director reports to nobody on the
  People chart (`company-chart-structure.ts` / `TeamOrgChart.tsx` draw real
  lines only, "without inventing a CEO"). When the CEO layer comes: a `titles`
  flag or a company-level row above `is_department_head`, drawn above every
  director on People, and nothing on Revenue (no override, no rank there
  either).
- **FAA.** The user named FAIR / FAA as the sub-departments reporting to Chris
  and Peter. Only Fair and IR exist; when FAA is created, add its directors on
  its Team tab (Reports to) — nothing else is needed.
- **The person card on People Management** (`card-actions.ts`) still shows
  only `reports_to` under *Reports to*; the derived director line is drawn on
  the two charts and the two tables, not there yet.

## Owed — IR commission data sources (2026-09-11)

- **Recurring subsidy Claims and the other later-batch data sources.** IR's
  progressive expansion shipped in PR #82 (migration
  `20260911060000_progressive_ir_direct_lines.sql`); the statement shows the
  car/property subsidy *cap* only. The recurring subsidy Claims and the other
  data sources the commission spec documents for later batches
  (`docs/module-spec-revenue-commission.md` §15) are still separate follow-up
  work.

---

## Low urgency

- [ ] **Multi-currency support.** The portal is MYR-only. HOUZS expansion to
  SG/TH needs this. _Effort: L. Source: CEO Exp 7 (2026-04-09 autoplan)._
- [ ] **Complex animations / page transitions.** Add sparingly later. _Effort:
  S. Source: Design Pass 4._

---

## Approvals and vouchers

- [ ] **One request-type label map.**
  - **What:** The queue and the dashboard name a request through
    `requestTypeLabel` (`src/lib/approval-queue.ts`), but
    `src/app/(portal)/approvals/[id]/page.tsx` keeps its own
    `formatRequestType` map for its eyebrow.
  - **Why:** Adding a new `request_type` means editing both; easy to miss one
    and render a raw `hr_opex` in one view but a label in the other.
  - **Depends on:** nothing.
- [ ] **Voucher PDF generation planning doc (Phase B).**
  - **What:** Design document for auto-generating canonical supporting PDFs
    per voucher_type — payroll summary, payslip, invoice copy, loan memo,
    claim form.
  - **Why:** The Principal's "every voucher must carry supporting docs" rule is
    enforced by Finance uploading manually (the approval page still says "Ask
    Finance to attach supporting docs before approving"). Auto-generation
    closes the gap and makes Phase C (a DB trigger enforcing ≥1 attachment)
    realistic.
  - **Context:** Memory `project_voucher_attachments_pending.md` has the
    voucher_type → PDF mapping table. This TODO is to expand it into a real
    design doc with lib choice + trigger semantics + template guidelines.
  - **Depends on:** real-world feedback from Finance/Principal on what's
    missing.

---

## Money paths not yet atomic or self-consistent

- [ ] **Align statutory-lookup B+K wage basis with engine `offsetBkRatio`.**
  - **What:** `src/app/(portal)/director-salary/actions.ts` (the
    `payrollBkWages` / `invoiceBkWages` lines) computes statutory lookup keys
    using `pool.basicRatio` on `payrollGross / invoiceBase`, but the engine
    (`src/lib/salary.ts`, `offsetBkRatio`) splits the actual `payrollBk/allow`
    using the post-offset `offsetBkRatio = bkShare/afterOffset`. When advance
    offset consumes part of allowance, `offsetBkRatio` > `pool.basicRatio`.
  - **Why:** Effect is small (WL example on 2026-05 test: statutory-lookup basis
    8,063.90 vs stored `payroll_bk=8,961.67`) and does NOT cause journal drift —
    component totals are self-consistent within the stored row. But the
    "lookup wage" and the "reported wage" are off by a slice when advance
    offset fires.
  - **Cons:** Requires restructuring `actions.ts` to compute statutory
    deductions from `offsetBkRatio` post-engine, not pre-engine from
    `pool.basicRatio`.
  - **Context:** vp-e2e-role-auditor 🟢 GREEN verdict on 2026-04-25, finding #3.
- [ ] **Inter-billing settlement is not transactionally atomic**
  (`src/app/(portal)/payments/actions.ts`, `createPaymentVoucher`).
  - **What:** An inter-billing settlement performs sequential non-transactional
    Supabase inserts: voucher → receiving `np_in` (adjustPool) → paying
    `inter_billing_out` dept_pool → `role='mirror'` payment_voucher_sources →
    invoice status. As of `9f2c1a6` the paying-side `inter_billing_out` insert
    (and its paying-dept resolution) FAIL LOUD (throw) instead of silently
    swallowing — so a failure is detectable, the invoice stays
    `issued`/retryable, and no mirror row is written. But the receiving-side
    `np_in` (committed earlier in the sequence) is left orphaned without its
    paired `inter_billing_out` until the settlement is retried/reconciled.
  - **Fix:** Wrap the whole inter-billing credit branch (np_in +
    inter_billing_out + mirror + invoice-status) in a single Postgres
    transaction — realistically a `SECURITY DEFINER` RPC, since the Supabase JS
    client has no client-side tx.
  - **Why deferred:** Fail-loud (9f2c1a6) already stops the silent-wrong-books
    failure mode (the production bug: HV-INV-202605-0004/0005 settled,
    receiving np_in + mirror committed, paying HR/Director Office never
    debited, zero error — backfilled manually 2026-05-18). Full atomicity
    touches the whole write path + RLS/trigger surface
    (`check_dept_pool_sufficient`, `pvs_enforce_sum_matches_voucher`).
  - **Context:** Found via systematic-debugging audit 2026-05-18.

---

## Compliance / Legal (NOT engineering tasks — route to Principal)

- [ ] **Malaysian tax agent + company secretary sign-off before go-live.** Check:
  - Companies Act 2016 s.224 — intercompany loans need formal director approval
  - ITA s.140 — thin capitalization / transfer pricing compliance
  - Bank Negara Malaysia Financial Services Act 2013 — is "savings + lending at spread" considered deposit-taking?
  - LHDN transfer pricing documentation — are the loan rates arm's length?
  - PDPA — employee PII handling, retention, subject-access-request process
  - Withholding tax treatment on interest payments to related parties
  - Overdue penalty enforceability between sister companies (risk of LHDN recharacterization as profit-shifting)
- [ ] **Add "legal sign-off required" gate to CLAUDE.md** so development cannot go live without compliance check.
