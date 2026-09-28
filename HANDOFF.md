# HOUZS Venture Portal — Session Handoff

## CHECKPOINT 2026-09-24 (SHIPPED) — ERP catalogue mirror, items only; every margin at the portal's own prices; the catalogue syncs live

**All merged and deployed.** VP **#147** (`f0f6463`, Vercel prod); ERP
**Houzs-Century/Houzs-ERP#4248** (`d781d11f`, the catalogue push) and **#4252**
(`aaaa7b4f`, the push made live). The four VP migrations and both ERP
migrations are LIVE. The worktrees (`.claude/worktrees/sku-master-mirror`,
`C:\Users\wenwe\houzs-erp-vp-catalogue`) and their branches were deleted at the
user's request.

The user's request (2026-09-24, verbatim):
> 我要你把 SKU Master 做一个镜像过来，通过 API 接过来做同步。
> 1. 价格与成本：所有镜像功能只同步 item，不同步价钱与 costing。价钱由我这边填，Venture Portal 里的 margin 统一由产品这边的价格来计算 costing 和 margin。ERP 这边只要加了新 item，那边就会自动同步新增；但改价钱不会同步，所有价格都在 Venture Portal 这边调。
> 2. SKU Master：完整同步 item 过来。
> 3. Modular tab：需要一模一样搬过来，并且保持同步（ERP 加了新 SKU，这边就同步新增）。最关键的是要有 allowed options 功能：Modular 是独立的，用来控制 Revenue team 的 calculator 上有哪些选项可以 drop down 下拉选择。比如 SKU Master 里有 10 个 SKU，我在 Modular 这边开启了 7 个，那 calculator 上就只能选到这 7 个，其他不能选。
> 4. Maintenance tab：Fabric、Bed Frame 和 Sofa 需要拉过来同步。下面的 Product Maintenance 不需要拉过来。
> 5. Sofa Combo：同样做同步（synchronize）。这边加了新的 Sofa Combo，Venture Portal 那边就会新增，但价格一样是由我们在 Venture Portal 这边自己调。
> 不需要拉过来（不需要搬）的内容：Variants、Fabric Converter、Category。

Later the same day: "i want it live, like current sales order sync, not 5 min" → ERP #4252.

### Migrations — all live
| mig | state | what |
|---|---|---|
| `20260924020000_erp_catalogue_mirror` | LIVE | `erp_*` mirror + `catalogue_*` decisions + `ingest_erp_catalogue` + adoption |
| `20260924025000_catalogue_adopt_mattress_rule` | LIVE | adoption rule 3: brand + model + size (mattresses, unique both ways) — 275 SKUs, 248 priced |
| `20260924030000_catalogue_costs_the_margin` | LIVE 2026-09-24 (recorded as `20260924015438`) | the cost rule (`catalogue_line_cost`, fill trigger, deferred combo trigger, recost re-prices, gaps RPCs), the deep money strip, drops the mirror's dead money columns |
| `20260924040000_member_catalogue` | LIVE 2026-09-24 (recorded as `20260924015703`) | `member_catalogue()` + both member snapshots read it |
| ERP `20260923T1843_scm_vp_catalogue_feed` | LIVE (ERP deploy, pg-migrate, 02:32 UTC) | catalogue builder / digest / snapshot / money guard / state table; allowlisted line `variants` on the order feed |
| ERP `20260924T1100_scm_vp_catalogue_live` | LIVE (ERP deploy, pg-migrate, 05:02 UTC) | statement triggers on the six source tables → `scm.venture_portal_catalogue_changes` |

The two VP migrations went in through MCP `apply_migration` with the files'
exact text; every function body (28) was then md5-checked against the files.

Mirror data on prod: products 2,350 · models 703 · options 104 · fabrics 950
· combos 97. Portal prices: 743 SKUs priced, 727 offered to the calculator,
248 models offered, **0 option surcharges, 0 combo prices**.

### How it went live (2026-09-24)
1. VP #147 squash-merged → Vercel prod → 030000 → 040000 applied minutes later (the new code briefly ran on the old schema; no member uses the quote yet).
2. ERP #4248: the first merge-queue run failed `audit:routes` — the route-capability matrix/summary went stale because #4250 merged first. Regenerated with `backend/scripts/generate-route-capability-matrix.mjs`, committed ONLY `route-capability-matrix.csv` + `route-capability-summary.md` (the ERP rule: `docs/generated/*` only when a check asks), requeued → merged → Deploy success → pg-migrate applied the ERP migration.
3. First catalogue push, 10:35 MYT: one POST, 1,162,791 bytes, applied — 2,350 products, 703 models, 950 fabrics, 97 combos, 35 specials, 69 maintenance entries; 0 new, 0 retired. The `*/5` cron then pushed real edits at 11:55 and 12:10 (HIPSTER (A) sizes edited 12:06).
4. Prod smoke as Principal: Costing gaps, Modular (AURORA "no brand"), a member quote (APEX (Q) at RM 5,000 → 69.14% = RM 1,080 ÷ 0.7), the bill drill-down. Live orders are costed from the Product List (the ERP's bed frames `unpriced`, read from `variants`).
5. ERP #4252 merged + deployed; its migration applied 13:02 MYT.

### The catalogue sync is live (ERP #4252)
- Statement triggers `vp_catalogue_changed` / `vp_catalogue_changed_upd` on `mfg_products`, `product_models`, `maintenance_config_history`, `special_addons`, `fabric_trackings`, `sofa_combo_pricing` append a row to `scm.venture_portal_catalogue_changes` in the same transaction as the write. An UPDATE counts only when a column the catalogue sends is in its SET list — cost, price, stock, photo and note updates mark nothing.
- The SCM write kick (`kickVenturePortalDrain(env, ctx, afterDrain)`) runs `pushVenturePortalCatalogueOnChange` after its order drain, in the same task: feed off → nothing; no mark → one read; a mark → the digest-gated push. Every push clears the marks it covers first. The `*/5` cron stays the safety net.
- **Not yet exercised by a real ERP edit at hand-off** (none since 13:02). The user does NOT want test SKUs in production — verify on the next real edit: the SKU's ERP `updated_at` vs VP `erp_sync_events` (`doc_no = 'catalogue'`) `received_at`. Seconds apart = live; a stamp ~15 s after a :x0 / :x5 minute = the cron.

### Still open
- **Do NOT Recost August/September until the Product List is priced.** Dry-run, engine rule (bills with a margin): Jun 3→0, Jul 92→18, **Aug 225→56, Sep 138→48**; re-measured as Fair September fully costed bills **95 → 36** (lines with a cost 630 → 498). Blind after: bed frames 487 lines (the ERP's bed frames are unpriced — the old list keyed supplier codes HOK-/NB-/NK-), sofas 311 (8030 SOFFIO RM 161K, 9028 VERANO …), fabric accessories 96, service 164 (not commissionable). 34 sofa builds would match a combo once combos are priced. Landed months move only on Recost; then recompute the runs.
- New and re-pushed lines are costed at the Product List's prices since 030000: a bill with an unpriced item (e.g. an ERP bed frame) has no margin until it is priced. Costing gaps lists what to price, worth-first.

### What shipped (VP)
- Product List = 5 tabs (SKU Master / Modular / Maintenance / Combo Pricing / Costing gaps). E2E: real SKU price save + clear, real Modular save — verified in DB, restored.
- Member calculator: `member_catalogue()` (unpriced for the snapshots, priced via service role for the quote); one sofa build (height, tier, leg, specials) + one bed frame build (divan, leg, total, gap, specials); dropdowns = model ticks ∩ ERP allowed ∩ live pool, intersected across the cart's models of that kind (`lib/member/build.ts`); server refuses anything else. `costLines` in `lib/member/calculator.ts` is the twin of the run. People › Member Services › Product options → pointer card to Modular.
- Order feed keeps allowlisted `variants` per line (`lib/erp-sync/contract.ts lineVariantsOf`) — the ERP WAS sending them all along; our parser dropped them.
- Bill drill-down + Open Bill queue fixed (PGRST201: `sales_order_shares` made `hr_staff_costs(…)` ambiguous — name `!sales_orders_staff_id_fkey`). Each line's cost now has a provenance caption (`lib/catalogue/provenance.ts`).
- Twin audit: TS vs SQL run side by side (PGlite); combo slot matching is now the ERP's Kuhn algorithm in BOTH twins; blank price string ≠ RM 0; see commit 9bcde03.
- PGlite regression `tests/member-sql/validate-catalogue.mjs` (164 checks; the four migrations verbatim; in `npm test --prefix tests/member-sql`). It found four real bugs, all fixed in the two migrations (unapplied at the time) + their TS twins:
  1. nested money survived both portal strips (a special's `option_groups[].choices[].extraSen`) → 030000 §0b: `catalogue_strip_money` goes deep by the ERP's own key pattern (a price TIER excepted), scrubs what 020000 stored, and the ingest strips the whole delivery first; TS `isMoneyKey`/`stripMoney` the same, pinned by test. Live data was already clean (the ERP export allowlists).
  2. recost counted every combo line as "re-priced" every time → counts lines whose final cost/source MOVED.
  3. an EMPTY ERP `allowed_options` list was read as "nothing allowed"; the ERP means "no restriction" (`hasRestriction`) → whole pool, in `catalogue_model_options` and on Modular (`erpAllows`). 1 bed frame model today.
  4. a mattress/sofa whose branding maps to no brand (MYLATEX + unbranded: 170 SKUs, none ticked yet) would have been a RIDER for every member → not offered until a Margin ladder is chosen; Modular shows "no brand" + a notice. And the Modular "Rider" choice (`brand_code = 'RIDER'`) had never been honoured by member_catalogue (it was read as a brand nobody sells) → now read as no brand.
- Member preview (`/member/preview?design=live`, dev / Principal+HR) now demos the builds: a modular sofa with a grid, bed frame models with ticks, fictional surcharges and an L-shape combo (`lib/member/demo.ts demoPricing`, pinned by `demo.test.ts`).
- CI (GitHub Actions) ran on #147 and passed both jobs, the Cloudflare worker + PDF smoke included.

### Known limits (tell the user, don't "fix" silently)
- `npm run verify:worker` fails its yoga-wasm assertion in a Windows worktree with a junctioned node_modules — identically on a clean origin/main (checked 2026-09-24), and CI's Linux run of it passes on #147, so it is the local environment only.
- Hand-typed AutoCount-era `description2` (most of August: `Col:PC151-15/Divan:8+2”leg/Gap:10”`) parses to nothing → such bed frames get their SKU price only, no option surcharge. ERP-written lines parse (150 bed frame + 95 sofa lines today) and new lines carry `variants`.
- No Fair staff has a login yet → the member snapshot can only be exercised as the Principal (Revenue View) on prod.
- Seat heights offered = the portal's grid heights ∩ the model's ticked `sizes`; the ERP's allowed sizes are NOT intersected for seat heights (the old lists priced 60cm/75cm on some models the ERP lists as 24–35).

### Traps this session hit
- `STABLE` functions cannot write temp tables — `member_catalogue` carries rows as one jsonb value.
- A page that selects a column a pending migration adds breaks before the migration: the bill page uses `select('*')` for lines.
- MCP `execute_sql` with `BEGIN; … SELECT …; ROLLBACK;` returns the last SELECT — the dry-run pattern; a failing statement aborts the whole batch (guard lookups that can be NULL).
- The ERP repo is `Houzs-Century/Houzs-ERP` now (hello-houzs redirects); its PR body check `scripts/check-completeness-claim.mjs --body-file` runs locally.
- The ERP merge queue re-runs the checks on main + the PR: a generated file (the route-capability matrix) can go stale when another PR merges first — regenerate, commit only what the failing check names, requeue. Never `--auto` there.
- A worktree NESTED in the main checkout cannot `next dev` (Next takes the parent as the workspace root → ENOENT `.next/required-server-files.json`); `next build` + `next start` works, sandbox off.
- JS `s.replace(a, b)` expands `$'` / `$&` inside `b` — SQL such as `'(Sen|RM)$'` duplicated the rest of a file in an edit script. Use `s.replace(a, () => b)`.
- Tearing down a worktree: delete the `node_modules` JUNCTION first (it points at the main checkout), then `git worktree remove --force`.

## ACTIVE CHECKPOINT 2026-09-17 — The venue register, and who ran each fair

Branch `feat/venue-organiser-register`, worktree
`.claude/worktrees/venue-organiser-register`, from `cda4f27`. Migration is
**APPLIED LIVE**; the code is a PR awaiting merge.

Closes open item 3 of the checkpoint below ("44 venues, 1 organiser named …
The user asked for a Venue register page; offered, not yet built").

### The decision that shaped it

The organiser was one free-text column on `comm_venues` — one answer per
place, for ever. Asked whether that was right, the user settled it in five
words: **"same venue will have different organiser"**. So the organiser is a
fact about the FAIR, not about the hall:

| | |
|---|---|
| `comm_organisers` | the register of names. Typed once, picked from a dropdown everywhere else, unique on `organiser_key(name)` so HOMEDEC / Homedec / Home Dec cannot become three organisers with a third of the sales each |
| `comm_venue_events` | **(canonical venue × month) → organiser.** Surrogate id + `UNIQUE (venue_key, period_month)`, so the day the ERP can identify a dated event this becomes a date range and the constraint is what drops |
| `comm_venues.organizer` | **SUPERSEDED.** Migrated (SPICE ARENA = HOMEDEC became both its months), commented, no longer read or written. Not dropped — dropping a column ahead of its readers has broken this database before |

Month, not a date range, because the ERP sends no event dates and `fair_events`
is a design the user has explicitly deferred. The one case it cannot express is
two organisers at one venue inside one month.

### Revenue › Venues (`/revenue/venues`)

Department-level, beside the Product List, because neither table carries a
scheme. Two tables, both narrowing together on `?month=` (pushState, no round
trip — every row is already on the client):

- **Organisers** — add / rename / retire, with each one's fairs, bills and
  sales value counted from the venue rows on screen so the two can never
  disagree. Remove is refused by the database once a fair is recorded against
  it, and says so ("untick Active instead").
- **Venues** — one row per FAIR, venue name printed once over its group with a
  `↳` on the continuations, an organiser dropdown that saves on pick, the
  month linked to its own bills, and *same place as…* which now offers every
  venue instead of one month's.

`FairOrganiserPicker` is shared with the month page's *Sales by venue*, whose
organiser cell is now the same dropdown for that month. No form, deliberately:
a bare `<select>` inside a `RowForm` is never submitted, so it calls the action
directly; `setFairOrganiser` still throws when the `organiser` field is absent
rather than blank, so a future caller that gets it wrong fails loudly instead
of silently unnaming a fair.

Clearing a fair DELETES its row rather than storing a null: no row means
nobody has said, which is the state the feed may fill in. A null with
`source = 'manual'` would mean "a human says nobody ran it" and would lock the
feed out for ever.

### The ERP's organiser — ready, dormant, and it needs nothing from us

The user's reason for the whole exercise: *"以后 ERP 那边 send 过来的时候，应该
就是 venue 跟着 organizer 一起带过来的… 现在只是作为预防措施；下次如果 detect
失败，at least 还可以 manually 去改"*.

`sales_orders_register_organiser` (trigger on `sales_orders`) reads the
organiser out of `sales_orders.raw -> header` under eight plausible names
(`organiser`, `organizer`, `event_organiser`, … ). It works because
`stripHeaderPii` is a BLOCKLIST, so a field the ERP adds survives into `raw`
untouched, and because it is a trigger: `ingest_erp_sales_order` is 318 lines
and was not touched at all.

- matches the register → the month is named, `source = 'erp'`
- matches nothing → kept verbatim in `erp_organiser_text`, shown as *ERP: … —
  not registered*, and the register page counts them. It never INVENTS an
  organiser: a typo would otherwise become a real organiser with real sales.
- a human's pick always wins, and the raw text still records the disagreement

Dormant today — no delivery carries the field, so the trigger costs one JSONB
probe per order. Proven live anyway, in rolled-back transactions through the
real `ingest_erp_sales_order`: a brand-new venue INSERTs fine (the trigger
registers the place itself, because the ingest registers venues AFTER writing
the order and the FK would otherwise fail the whole delivery), an unmatched
name is kept, a re-delivery matches it case-insensitively once registered, and
a human's pick survives re-delivery.

`docs/erp-sync/contract.md` now tells the ERP team the field names to use.

### The migration

`supabase/migrations/20260918040000_venue_organisers.sql`, **applied live** to
`gixpptmfuryskbwkmiwz` (recorded in `supabase_migrations` as version
`20260916182245`, name `venue_organisers` — the MCP stamps its own clock, same
as `month_orders_cost_divisor` = `20260916160038`). Additive; its header
carries the reversal.

It also re-creates `revenue_month_orders` to take the organiser from
`venue_event_organiser(o.venue, p_period)` instead of `comm_venues.organizer`.
**Proven behaviour-identical before applying**: the whole function's output
for Fair 2026-08 hashes to `d5644f694a33b7bd2b146aa124a59251` on both the old
and the new body (319 rows, 62 organiser-bearing), and September's named count
is 3 either way.

New in SQL: `organiser_key()`, `venue_event_organiser()` (the ONE resolution
rule — `revenue_month_orders` and the order page both read it, rather than
joining it two different ways), `erp_header_organiser()`,
`revenue_venue_register()`, `comm_venue_events_canonical` (an event always
belongs to the place, never to a spelling) and `comm_venues_merge_events`
(merging a spelling moves its named months onto the place, so an organiser
typed before the merge is not orphaned).

### Live database state, unchanged by the testing

1 organiser (HOMEDEC), 2 fairs named: SPICE ARENA 2026-08 and 2026-09. 44
venues, 60 fairs on record. Everything created during the E2E walk
(MLE Modern Home Living, two picks) was removed again through the UI.

### Verified

2,137 unit tests (185 files, 3 skipped; +24 for `lib/organisers.ts` and
`lib/venue-register.ts`), `tsc --noEmit` clean apart from the five
pre-existing `ByRoleOptions`/`exact` errors in the MemberWorkspace test files,
`next lint` with no new warnings, and a production build with
`/revenue/venues` in the route list.

Live Playwright walk as Principal at 1440px against the production database:
add an organiser, pick it on the register, pick a different one on the month
page, confirm the other month at the same venue stayed unnamed, clear a pick,
watch Remove refused for an organiser with fairs and accepted for one without,
see the duplicate-name refusal, and read the organiser on a bill's detail page.
390px has no horizontal page overflow (both tables scroll inside their own
wrappers).

### Still open — inherited, none of it touched by this branch

1. **September's run is doubly stale** (computed before the recost and before
   the cost divisor), and **August has never had a run at all**. The user has
   been shown this and has not said to recompute.
2. **`member_order_facts` is still on the RAW cost**, so member Insight, Arena
   and Income show a higher margin than the engine pays on. A decision for the
   user, not a follow-through.
3. **Which spellings are one place.** DECIDED: `SPICE ARENA` and `SETIA SPICE
   CONVENTION CENTRE` are two venues, do not combine. Still undecided, biggest
   first: PISA SPICE ARENA / … CONVENTION CENTRE · BUKIT JALIL STADIUM /
   STADIUM BUKIT JALIL · MIDVALLEY EXHIBITION CENTRE / MID VALLEY · MIDVALLEY
   SOUTHKEY JB / MVEC SOUTHKEY · PAVILLION / PAVILION BUKIT JALIL · IOI
   PUTRAJAYA / IOI MALL PUTRAJAYA / IOIGECC · SETIA CITY CONVENTION CENTRE /
   SCCC SHAH ALAM / SCCC · MITC MELAKA / MELAKA INTERNATIONAL TRADE CENTRE ·
   ZANOTTI LIVING(KELANA JAYA) with and without the space. Nothing was merged
   here — the eight `… SOLO` names are a single-brand roadshow marker, not
   aliases.
4. **RM 690k of sales still has no cost** (28 sofa codes, 3 DUNLOPILLO, 5
   AKEMI (SK)/(SP), 7 ERGOTEX). `revenue_uncosted_products()` names them.
5. `_recost_backup_20260916` is still a temp table in `public`. Drop it once
   the recost is settled.

### Traps this session hit

- **The venue note was write-only.** `comm_venues.notes` was typed beside the
  organiser on the month page and displayed nowhere — selected on the order
  page and never rendered. It went with the organiser rather than getting a
  column on the new page; nothing visible was lost.
- **A `<select>` needs `key={value}`.** React rewrites an input's
  `defaultValue` on re-render but never a select's selected option, so a saved
  pick would show the old organiser until a reload. `Choice` already carries
  one; the new picker does too.
- In a worktree-isolated session the Bash tool refuses a compound command whose
  text contains a `(portal)` path, and refuses some heredocs on sight. Write
  the edit script to the scratchpad and run `python <abs path>` as one plain
  command.


## ACTIVE CHECKPOINT 2026-09-17 — The margin story, end to end

Supersedes the checkpoint this session wrote earlier (it was dated 2026-09-18
after its migration numbers, and by the end of the session half of it was out
of date — the recost it said nobody had pressed has been pressed).

Everything below is **MERGED and LIVE on production**, verified as the
signed-in Principal at `venture-portal-chi.vercel.app`. `main` = `8e72297`.

### What shipped

| PR | | |
|----|---|---|
| **#123** `cd1223d` | Open Bill tick on the Sales orders page · venue merging · the Product List's ERP code · recost | mine |
| **#122** `ce5ef5b` | Three payrolls, three closing dates — design only, nothing built | rebased, docs |
| **#114** `8e72297` | Member catalogue: riders, sofa cost grids, **Revenue Team cost basis** | rebased from 5 days stale |

**The tick moved to the ledger.** Which of a day's bills came first is argued
from the margin, the venue and the customer, and those were a page away from
the Open Bill board. `OpenBillPicker` puts the pick in the row that carries
them. Three clicks, three meanings — claim / confirm-the-suggestion / clear —
because a plain toggle makes agreeing with the importer harder than
disagreeing, and 139 of September's 140 picks are still its guess.
`open-bill/` stays as the narrow unreviewed queue.

**One place, one row.** `comm_venues.canonical_key`, one level deep by trigger
(23VEN), *same place as…* on Sales by venue, ✕ to take it back. Nothing is
merged automatically and nothing is merged yet — see below.

**The cost the ERP does not send.** The margin blackout was one hyphen: the
ERP writes `AKEMI ULTIMATE MATT (K)`, the Product List writes `AK-ULTIMATE
MATT (K)`, and the ingest's fallback matched `item_code` only.
`comm_products.erp_item_code` bridges it (37 seeded by the `AKEMI `→`AK-`
rule), `comm_product_unit_cost()` is the one lookup, trigger
`sales_order_lines_fill_cost` costs every line that arrives without one
whichever path wrote it, and `recost_sales_order_lines()` did the months
already landed.

### THE COST BASIS MOVED — read this before touching any margin

`comm_schemes.revenue_cost_divisor` came in with #114: **Fair = 0.7**, IR =
1.0. The engine divides every line's cost by it, so every margin the engine
judges — the per-bill penalty, the monthly incentive, the statement's brand
margins — is on that basis, the same one the member calculator quotes on.

Fair's blended margin, after the recost and then after the divisor:

| | before recost | after recost | after ÷ 0.7 (now) |
|---|---|---|---|
| Aug 2026 | 21 of 319 bills had one | 214 · 77.40% | **67.71%** |
| Sep 2026 | 77 of 199 | 150 · 67.55% | **53.62%** |

`revenue_month_orders` and `orders/[orderId]` were taught to divide too
(migration `20260918030000`), because a drill-down that disagrees with the
engine it exists to explain is worse than none.

**STILL ON THE RAW COST, and therefore disagreeing with the engine:**
`member_order_facts`, and the member **Insight, Arena and Income** reads built
on it. Members see a higher margin than the engine pays on. It is a live
SECURITY DEFINER function from another branch with its source hash recorded
below; moving it changes every member's margin figure, so it is a decision for
the user, not a follow-through. **#114's own comment says the member
calculator already quotes on ÷0.7**, which argues they should be unified.

### Open, in the order they matter

1. **September's run is doubly stale.** `comm_runs` says RM 251,425.26,
   status `computed` (never paid, so nothing is locked). It was computed
   before the recost and before the divisor. Recomputing will move it — the
   margin band's penalty and incentive only bite now that margins exist.
   The user has been shown this and has not yet said to recompute.
   **August has never had a run at all.**
2. **Should the member side divide by 0.7 too?** See above.
3. **45 venues, 1 organiser named.** SPICE ARENA = HOMEDEC is the only one.
   The ERP sends no organiser; it is typed on the month page's *Sales by
   venue*, which only lists venues that month has bills at — 13 are August
   only, 15 September only, so it takes both pages. **The user asked for a
   Venue register page** (all venues on one screen, organiser + merge
   together); offered, not yet built.
4. **Which spellings are one place.** DECIDED: `SPICE ARENA` and `SETIA SPICE
   CONVENTION CENTRE` are **two venues, do not combine** (two halls of one
   Penang complex). Still undecided, listed biggest first: PISA SPICE ARENA /
   PISA SPICE ARENA CONVENTION CENTRE · BUKIT JALIL STADIUM / STADIUM BUKIT
   JALIL · MIDVALLEY EXHIBITION CENTRE / MID VALLEY · MIDVALLEY SOUTHKEY JB /
   MVEC SOUTHKEY · PAVILLION / PAVILION BUKIT JALIL · IOI PUTRAJAYA / IOI MALL
   PUTRAJAYA / IOIGECC · SETIA CITY CONVENTION CENTRE / SCCC SHAH ALAM / SCCC ·
   MITC MELAKA / MELAKA INTERNATIONAL TRADE CENTRE · ZANOTTI LIVING(KELANA
   JAYA) with and without the space. The eight `… SOLO` names are a
   single-brand roadshow marker, not aliases.
5. **RM 690k of sales still has no cost**, so 49 September and 105 August
   bills still have no margin: 28 sofa codes the Product List has never heard
   of (`8030-1A(LHF)` against its `SVI-00830 SOFA`, and those rows carry no
   unit cost either), 3 DUNLOPILLO listed with no cost keyed, 5 AKEMI (SK)/(SP)
   sizes and 7 ERGOTEX missing entirely. `revenue_uncosted_products()` names
   every one on *Why those bills have no margin*.

### Live database facts a new session should not have to rediscover

- Migrations applied live this session: `20260918010000` (ERP code, the cost
  trigger, recost, the gap report), `20260918020000` (venue aliases),
  `20260918030000` (the drill-down's cost basis). All additive, each carries
  its reversal in its header.
- `_recost_backup_20260916` is a **temporary table in `public`** holding the
  268 `sales_order_lines` ids the recost filled. RLS on, no policies, so only
  the service role can read it. Undo is
  `UPDATE sales_order_lines SET cost_amount = NULL WHERE id IN (SELECT id FROM
  _recost_backup_20260916)`. **Drop it once the recost is settled.**
- The ERP feed is live and the cost trigger works on it: September went 199 →
  203 bills during the session and every new bill arrived already costed.
- `sales_orders.location` is the ERP's `sales_location` — the **warehouse**
  (KL / PG / SRW), three values. The fair is `venue`. They are not the same
  fact and the user asked about this specifically.

### Traps this session actually hit

- **A raw `<select>` inside a `RowForm` is never submitted.** The form is
  portalled out of the table and only its own controls claim it by id. The
  venue merge looked like it saved and wrote nothing. Use `Choice`. The
  durable half of the fix is on the action side: `if (!fd.has('canonical'))
  throw` — when blank and absent mean different things, make absent loud.
- Five pre-existing TS errors in `MemberWorkspace.live-design.test.tsx` and
  `MemberWorkspace.principal.test.tsx` (`exact` is not a `ByRoleOptions` key).
  Test files, so neither `next build` nor vitest fails on them. Not from any
  branch merged today.

Verified before each merge: 2113 unit tests (183 files, 3 skipped), production
build, and both CI jobs green on every PR. Live Playwright walkthrough as
Principal at 1440px and 390px; no console errors, no horizontal overflow.

## ACTIVE CHECKPOINT 2026-09-16 — Principal C function parity release

This checkpoint supersedes the paused design-only checkpoint below. Work is in
`C:\Users\wenwe\venture-portal-c-parity`, branch `codex/principal-c-parity`, created
from `ac7a6bf` so the other session's Revenue/payroll release is preserved.

Implemented shared Today / Insight / Quote / Arena / Profile navigation for mobile
and PC. Principal explicitly selects a real department/member for performance
reads; the profile/auth identity remains Principal. Today separates department
commission from selected member goals, combined configured KPI and brand margins.
Insight includes Personal/Team, month and brand/order filters. Arena includes
Sales/Margin/KPI ranking, periods, brand filters, podium and selected member results.
Saved brand weeks are readable; employee self-service submissions, acknowledgements
and brand-week writes never use the Principal viewing context. Profile links reach
Team income, full authorized Map, selected reporting-branch List, Requests, Memos
and management tools on phones too. Empty rosters retain map/management access.
Late responses are discarded, and Today cannot display historical Insight as the
current month. No account linking, fabricated staff identity or production fixtures.

Migration `20260917040000_member_principal_function_parity.sql` is already applied
atomically to `gixpptmfuryskbwkmiwz`, with version absence guard, advisory lock,
exact-source history and schema reload. Source MD5:
`2f6a36192549c9a6383c2cc9ebb34e7e` (26,056 bytes). Do not replay it or broad db push.
Four authenticated Principal read RPCs independently check actual active Principal
and eligible membership. Shared calculation helpers deny direct authenticated/anon
execution; employee identity and write functions are unchanged. Hosted grants and
source hash verified. Unrelated `17020000`/`17030000` migrations were not applied.

The functional release `551f9636d3bbf2303c4d73737e78bd7b5bf82207` is deployed to
production, with Vercel success and GitHub CI run `35081388110` passing both jobs.
Actual logged-in Principal checks covered PC (1440px) and phone (390px): complete
navigation, real member switching, Personal/Team Insight, Arena ranking/brand/
quarterly filters, Profile management links, full Map and selected-branch List,
empty IR map access, Quote catalogue and read-only brand weeks. No console errors
or mobile horizontal overflow were observed. The signed-in identity stayed Principal.

Live verification revealed older performance reads matching uppercase configured
item groups against lowercase ERP groups, producing false zero Insight/Income
sales while Arena was correct. Follow-up migrations `20260917050000` and
`20260917060000` now use normalized matching and one private `member_order_facts`
calculation across Insight, Arena and recent Income orders. Latest committed
documents resolve before owner/cancel/date filters; recognition follows the
department's release month, otherwise the current open month. KPI uses its
enabled switch and recognition month-end, deposits round to cents, and only
positive goods revenue weights margin. KPI-only and nonpositive goods orders
are not missing-cost orders. Recent Income retains the source-month window;
the 200-order detail cap never truncates aggregate performance. No orders,
commission statements, payroll or payments were written by these corrections.

Both follow-up migrations were applied atomically with absence guards, an
advisory lock, exact-source history and schema reload; private helper grants
remain closed. Hosted source hashes were verified:
`17050000` = `abd3a3f63240a3da57aa58ec1ca66ce7` (26,052 bytes);
`17060000` = `d2ddf3a887a70fe7411c2d2ec38841d7` (28,707 bytes).
Do not replay any of these migrations. The original `17040000` is unchanged.

Post-correction live checks: ANTHONY September Insight and Arena both show
RM104,700 cleared sales (27 orders), with RM56,918 held; August has zero recognized
sales instead of repeating unreleased carry-over. Returning from August Insight
to Today restores September progress. Principal Income recent orders now show
actual sales/margins. Missing real costs remain pending. SQL regression coverage
is 801 passing checks, including unchanged Arena JSON over all windows, shared
performance totals, historical recognition, scope, duplicate documents, KPI,
margin, detail caps and denial of direct private-helper access.

Final follow-up validation: 2,087 unit/component tests pass (182 test files,
3 skipped), 801 disposable SQL checks pass, and the isolated production build
passes. Independent SQL authorization/calculation and UI margin reviews found no
release blockers. The Vercel production deployment is driven by this branch's
fast-forward push to `origin/main`; never publish a different worktree's changes.

Fair event identity/date integration, weekly finishes, historical Fair records and
dependent Championship scoring remain explicitly deferred by the user. All other
implemented functions use actual authorized data. Deployment remains Vercel via
`origin/main`, never the Cloudflare deploy command or `vercel --prod`.

## ACTIVE CHECKPOINT 2026-09-16 — Principal function parity; paused for session switch

**Read this checkpoint first. The user rejected the design-only Principal correction below. The requested function parity is NOT implemented yet.**

### Latest user request and pause

The user is signed in as Principal, using Revenue View at `https://venture-portal-chi.vercel.app/member?page=income`. They reported: **"but why the fucniton is not same, it just design, please make it all same, like insight, arena , all dont have"**. They want the approved C app's functions and navigation, including Insight and Arena, in this actual live view on mobile and PC. Merely restyling the old Principal Today / Income / Quote / Team / Profile panels does not satisfy the request.

The assistant acknowledged that the last release only changed Principal presentation and said it would connect the full functions with an appropriate way for Principal to view member data. Before implementation, the user instructed: **"wait , do it as a checkpoint, i want sitwch session , and continue the job"**. Work is paused at the user's request. Resume in the new session; no further implementation or deployment should occur in this session.

**Progress at pause:** only read-only initial code investigation for the latest function-parity request. No feature edits, new migrations, tests, builds, or deployment have been started for it. Subagents are idle/completed. This checkpoint is the only new tracked-file change. Existing `.next-member-preview/` is an untracked cache; do not stage or indiscriminately delete it.

### Authorization and scope

- The user already authorized **"整套 C 设计和功能，手机与 PC 一起上线"**. Implement, validate and deploy the full C functions; do not ask the same deployment/scope question again.
- User explicitly deferred missing Fair source integration: **"you can try check later , build other first"**. Weekly placement counts, accurate historical Fair records, and dependent Championship points remain pending until event IDs/start/end dates are available. Do not block other work on this or publish preview scores as live data.
- Preserve white/orange/brown/cocoa/amber C design (no blue), gold podium, large warm icons, responsive PC/mobile layout, motion and reduced-motion support, combined KPI threshold, brand-specific margins/orders, and own-team-only member list with the authorized department map.
- Principal must use authenticated, explicitly authorized real data access. Do not change auth identity, fabricate a self member, link staff accounts, use preview fixtures in production, or weaken ordinary employee scope to make the UI work.

### Confirmed deployed state

- Checkout: `C:\Users\wenwe\Venture Portal`, branch `main`, HEAD **`a5e56cc869eb64add8de9c58b0a65034b235aac1`**, "Apply C design to the Principal Revenue workspace".
- Earlier C member functionality release: `a2e8b30`; ERP timeout fix merged at `e8af665`.
- Remote: `https://github.com/wenwei4046/Venture-Portal.git`.
- Production: **https://venture-portal-chi.vercel.app**, Vercel auto-deploys from `origin/main`. Last deployment of a5e56cc was ready, CI run **35061200158** passed. Do not use Cloudflare deploy scripts or `vercel --prod` for this app.
- Last release validation: **2,027 tests**, source TypeScript, isolated production build, and actual logged-in Principal mobile/desktop visual checks passed. This confirms the previous visual release, not the outstanding parity feature.
- Actual Principal still has Today / Income / Quote / Team / Profile rather than Insight / Arena. This is the defect to correct.

### Code findings and likely implementation approach

The architecture needs a genuine Principal data context, not another CSS change. An explicit department/member selector with authorized read access is a likely approach, **not yet a finalized or user-approved detailed design**. Inspect the existing SQL and permission model before choosing. Retain the Principal workspace/department switchers and relevant management access. Do not silently omit entire features under the name of role-specific navigation again. Handle employee-specific writes explicitly rather than allowing Principal to acknowledge memos or submit staff requests as somebody else.

- `src/components/member/MemberWorkspace.tsx`: C presentation already applies to all live roles, but nearly all functional rendering is gated by `!principalView`. Principal renders `PrincipalRevenuePanels` for every page except Quote. Today Insight/KPI fetches and general Insight/OrgMap effects skip Principal. Principal `page=insight` / `page=arena` links normalize to Today. These gates are central to the missing functions.
- `src/components/member/MemberLiveChrome.tsx`: Principal navigation deliberately swaps Insight for Income and Arena for Team. Update navigation with functional routes, not dead entries.
- `src/components/member/PrincipalRevenuePanels.tsx` and its CSS: C-styled aggregate Principal Today/Income/Team/Requests/Memos/Account, with management links; no Insight or Arena. Keep useful management capability while integrating the full member functions.
- `src/lib/member/types.ts`: `MemberData.principalView` denotes actual Principal, never impersonated staff. `MemberPerson.self`, membership hierarchy and selected context require careful treatment. Existing Principal snapshot marks all people `self:false`.
- `src/lib/member/server.ts`: `loadMemberData()` chooses authenticated `member_principal_snapshot()` for actual Principal, otherwise `member_data_snapshot()`. `loadMemberInsight(period)` calls own-member `member_insight_snapshot(text)`; `loadMemberOrgMap()` calls `member_org_map()`. Inspect `session()` and actual role checks. Product projection strips private costs. Quote already supports authenticated `member_principal_quote_context(uuid)`; preserve this.
- `src/app/(member)/member/arena-actions.ts`: requires active user with `member_insight`; calls `member_arena_snapshot(uuid,text,text)` and self-only `member_arena_save_brand_weeks(uuid,text,integer,jsonb)`. Existing SQL resolves own staff and cannot serve unlinked Principal. Add properly authorized context rather than only removing UI guards.
- `src/lib/member/kpi-summary-server.ts`: active `member_portal` user, authenticated `member_kpi_summary(uuid)` RPC with own-scheme authorization.
- `src/components/member/MemberArena.tsx`: actual leaderboard data, periods, brands, approved podium, 4/5 brand-week save, truthful pending Championship/Fair features. Pass a safe Principal viewing context through data actions if reusing it.
- Shared Insight panel and `LiveBrandMarginList` already handle selected month/brand navigation and incomplete margin data. Preserve response-sequence protection against stale fetches and correct Today current-month handling.
- Member list uses `selectOwnTeam` in `src/lib/member/team-directory.ts`; employee own-tree restriction must remain intact.

Relevant SQL to inspect before implementation:

- `supabase/migrations/20260912020000_member_self_service.sql`: `member_staff_id()` resolves authenticated active, date-eligible linked staff with member permission; `member_has_membership`. Do not casually weaken the global self-identity helper.
- `supabase/migrations/20260912090000_member_principal_view.sql`: active actual `public.users.role='principal'` checks; Principal aggregate snapshot and quote context. Snapshot returns current Revenue departments/rosters, principal profile with salary null, published products and authorized bands, team statement totals and recent orders. It does not select a staff member.
- `supabase/migrations/20260916010000_member_insight.sql`: own-member Insight and OrgMap plus private helpers. Consider authorized shared private read helpers rather than duplicating formulas or changing auth identity.
- `supabase/migrations/20260916030000_member_kpi_summary.sql`: combined configured KPI quantities and first threshold, own-member scope, latest committed order resolution.
- `supabase/migrations/20260917010000_member_arena.sql`: own-member scope and private scheme helper, authenticated roster, latest committed duplicate-order resolution before filtering, release-month recognition, deposit handling, KPI switches and private brand-week table. Preserve these calculation/security semantics.

**Tests that currently encode the rejected behavior:** `MemberWorkspace.principal.test.tsx` has 11 tests asserting old Principal navigation, no Insight/Arena, deep-link normalization and no member fetches. Revise them for safe functional Principal access, while retaining no unauthorized self-service writes and employee scope coverage. `PrincipalRevenuePanels.test.tsx` tests the existing aggregate/management panels. Do not mistake passing the old role gates for completion.

### Database, tooling and validation notes

- Linked Supabase project: `gixpptmfuryskbwkmiwz` (Venture-Portal). CLI: `C:\Users\wenwe\.local\bin\supabase.exe`; GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`. Both authenticated.
- `.env.local` has sensitive credentials. Never print values or expose them in tool output.
- Prior hosted read-only check found **30 active eligible Revenue staff, all `user_id = NULL`**. This explains why Principal cannot use the employee self lookup. Do not create/link accounts as an unrequested workaround. Explicit Principal read authorization should not require impersonating a linked employee.
- KPI migration `20260916030000` and Arena migration `20260917010000` are already applied and recorded with exact source. **Do not replay `tmp/apply-member-live.sql`, these migrations, or run broad `supabase db push`**; older migration history has mismatches/duplicate prefixes.
- If new SQL is needed, review and test it, then apply only the new migration atomically using authenticated linked `db query -f`, version-absence guard, advisory lock, exact-source migration-history entry, schema reload notification, and transaction. Independently verify Principal authorization, normal employee cross-staff denial, membership validation and public/helper grants.
- SQL test harness: `npm test --prefix tests/member-sql` (last 399 checks). Unit/component suite: `npm run test:ci`. Source TypeScript: `npx tsc --noEmit --project tmp/arena-typecheck.json`; plain root tsc traverses nested tmp checkouts.
- Production builds belong in isolated checkout **`tmp/member-live-release`**, currently detached at `b349980` (same source as deployed a5e56cc except documentation), with a node_modules junction. After committing, checkout the new commit there. Copy `.env.local` quietly only for the build and remove it afterward. Do not clobber root `.next`, used by local dev.
- Local dev was started as a hidden Node/Next process on `127.0.0.1:3001` (PID 43148 then; recheck before reuse), logs in `tmp/principal-c-preview*.log`. `?design=live&role=principal&page=income` is a gated sample layout, not production proof.
- Browser: Codex in-app browser previously ID `1`, user production tab ID `1`, Principal signed in; re-discover IDs/state. After context compaction use `cua.rewriteDocumentation()` before continuing existing computer-use work. Actual live verification must open Insight/Arena and exercise real member/department/period/brand context on mobile and PC, not merely confirm colors or login.
- Existing agents `arena_native_frame`, `arena_open_canvas`, `arena_points_raise` have relevant context (Arena, Insight, SQL/security respectively). Trigger idle agents with `followup_task` and assign non-overlapping ownership. No agents are currently implementing parity.
- Refresh remote status before release to preserve other sessions' changes. Update this checkpoint and `docs/DESIGN.md` when parity is actually complete; older notes below describe historical releases, not the current requested outcome.

### Resume checklist

1. Read current code/auth/SQL and choose a safe Principal data-viewing context for the same app functions.
2. Implement actual Insight, Arena, and remaining C function parity with responsive navigation; keep employee access limits and honest unavailable data.
3. Validate authorization, calculations, interactions and desktop/mobile layout. Review any migration independently.
4. Apply only required new SQL, commit and push authorized release, confirm CI and Vercel ready.
5. Verify the actual signed-in production Principal can use the functions the user reported missing. Clearly report any previously agreed Fair-source deferral; do not claim complete parity from design-only checks.

## Checkpoint 2026-09-16 — Fair month drill-down, the feed window, and the payroll-cycle design

### Shipped (PR #121, MERGED `ac7a6bf`; both migrations APPLIED LIVE)

- **Venue is a column.** `header.venue` (the fair itself — not `sales_location`,
  which is the warehouse) was always arriving and always being dropped into
  `raw`. It is now `sales_orders.venue`, back-filled, and the month page has
  *Sales by venue*. **Organizer is not in the ERP payload at all** (header,
  items and payments all checked), so `comm_venues` keeps it on the portal,
  typed in place on that table. SPICE ARENA → HOMEDEC is already set as a live
  example.
- **The feed window.** `erp_feed_settings.min_order_date` = 2026-08-01 for Fair,
  edited on the *Houzs ERP link* card. Deliveries dated before it answer 200
  `skipped`; an order re-dated backwards out of the window is removed. Needed
  because the ERP was still pushing 2023–2026-07 edits at 11:00 on 16 Sep.
- **History deleted, as instructed.** 33 months: 2,451 orders, 12,964 lines,
  1,543 Open Bill tags, 3,652 delivery-log rows. Two periods remain —
  August (317 orders) and September (190).
- **The drill-down.** `/revenue/[sub]/[period]/orders` (every bill, filterable
  by `?staff=` / `?venue=` through the URL) and `orders/[orderId]` (one bill
  line by line, each line classed commissionable / KPI / not / *group not
  classified*). `revenue_month_orders` feeds both and reads margin the way the
  engine does — over the commissionable base, NULL the moment one of its lines
  has no cost.
- **What the month pays.** `/revenue/[sub]/[period]/pay` (salary board) and
  `pay/[staffId]` (payslip preview, Open Bill bill by bill beside the rule that
  paid it). `revenue_pay_preview` returns the inputs; `lib/revenue-pay.ts` is
  the twin of `compute_hr_monthly_payroll` for `source='commission'`.
- **A month-page bug fixed on the way past:** it read `sales_order_lines`
  through PostgREST and so saw the first 1,000 of ~1,700, under-reporting
  "lines without a cost" by a third.

### The bug this found — Open Bill was silently paying zero

`run-actions.ts` gathered Open Bill picks with one `.in('order_id', …)` over
every order in the run, carried-forward months included. At 507 ids the URL is
too long, the request fails outright (`TypeError: fetch failed`), and **the
error was never read** — so the run paid no Open Bill bonus to anybody and said
nothing about it. September 2026 recomputed **RM 202,581 → RM 251,425**: 275
lines, **RM 48,844** that would have gone missing from payroll. Fixed with
`fetchByKeys` in `lib/paginate.ts` (chunks the keys, throws on failure), beside
`fetchAllRows` — the same family of PostgREST trap.

**Worth a sweep in a later session:** other large `.in()` calls elsewhere in
the app have not been audited.

### Open, design only (PR #122, `docs/payroll-cycles`, no code)

`docs/module-spec-payroll-cycles.md` + `docs/erp-sync/contract.md` §7.
Plain-language version with diagrams: <https://claude.ai/artifact/4RSKj4aiFnyFsBWKZfu9Ux>

**The finding.** The portal closes a *month*, not a *payroll*.
`submit_payroll_to_principal(period)` refuses if any row of the month is
already submitted, requires every Revenue commission run to be applied, sets
**every** row of the month to `submitted`, and writes one run plus one funding
request for the whole company. August 2026 was submitted on **4 September**, so
August's Revenue commission has been uncomputable ever since, and
`payroll_runs.revenue_opex_total` is **0.00 in all five runs ever created**.

**The proposal.** A cycle is `(period_month × track)`, track ∈
`imported | director | revenue` as a property of the department. The `director`
track is already physically separate (`director_monthly_payroll`) and the
payment layer is already scoped (`create_payroll_disbursement_vouchers`,
`create_payroll_statutory_batch` both take a department, a row set and their own
payment date). **Only the close is month-wide.** Phase A is one migration and
one function.

Order set by the user on 16 Sep: A unblock the close → B make the cycle visible
→ C reports (variance first) → **D the CEO's 1% last** (basis settled: every
committed order of the month; August RM 1,995,705 → RM 19,957.05).

### What the next session is waiting on — the user's own words: "I continue with other session for these questions"

1. **Revenue's closing date** — keep the 15th (statutory filing is due the same
   day, zero buffer) or move to the 10th–12th. *This one shapes the calendar;
   everything else waits on nothing.*
2. **Does KWSP / PERKESO accept two submissions in one month?** — for the
   agent. If yes, filing each cycle separately becomes available.
3. **Is the CEO's 1% subject to EPF / SOCSO / EIS?** Today's model says no.
4. **Are the 29 full-commission salespeople employees or agents?** They are set
   to `tax_mode = 'pcb'` with zero statutory; the schema also carries the 2%
   withholding path.
5. **Which salespeople take a basic, and how much** — data entry, not a build.
6. **Delete the `testing` staff record** in Revenue (basic 5,000, no employee
   code) before the first Revenue payroll.

### Two things for the Revenue month itself, not for the code

- **Item groups do not match.** The ERP sends `SERVICE` (140 lines, RM 51,124),
  `ACCESSORY` (1,161 lines), `FABRIC_ACCESSORY` and `OTHERS`, none of which are
  classified in Rules — which carries `ACC`, `OTHER` and `TRANS`, none of which
  the feed has ever sent. Every run warns and refuses to sync until somebody
  says whether `SERVICE` earns. The proposed fix (learn groups from the feed,
  with a third *not yet decided* state) is contract.md §7.1.
- **August has never been run**, so all 317 of its orders sit inside
  September's run as carry-forward. To pay them to August, August must be run
  first — but August's payroll is already submitted, so that needs Phase A (or
  a payroll reopen, which was deliberately not done).

### State left behind

- `main` is at `ac7a6bf`. Branch `docs/payroll-cycles` is pushed (PR #122, two
  commits) and unmerged.
- A **computed** (not applied, not synced) commission run exists for
  **September 2026** — 23 statements, RM 251,425.26, 29 warnings. It was created
  to verify the new pages end to end and is safe to recompute or leave.
- Worktree `.claude/worktrees/erp-months-and-payslip` still exists; a dev server
  may still be running on port 3100.

## Checkpoint 2026-09-16 — Principal Revenue C correction

The first C release excluded `principalView`, leaving the signed-in Principal's Revenue View on the old design. The user reported this on `/member?page=income`. C presentation now applies to every authenticated Revenue workspace, including Principal, and `PrincipalRevenuePanels` composes the same C typography/open-section styles rather than raw legacy cards. Principal retains real team-level data and its valid Today / Income / Quote / Team / Profile navigation, department and workspace switchers, and management forms. Member-only Insight/KPI/Arena/OrgMap requests and self-service actions remain excluded from Principal; this changes presentation, not identity or permissions. The gated `design=live&role=principal` sample reproduces the Principal layout for mobile/desktop QA.

Validation: 2,027 tests passed, full source TypeScript and isolated production build passed, and Principal Income/Today were visually checked at desktop width and 390 × 844. Principal navigation and department-switch regressions explicitly assert that no employee-only RPCs or self-service writes occur. No database migration is required for this correction.

## Checkpoint 2026-09-16 — Revenue member C release

User authorised the entire approved C (Orange & Brown) design and functionality for live mobile and PC. `/member` now uses the responsive white/orange/brown layout, with a desktop sidebar and wider content columns, mobile bottom navigation, safe areas and reduced-motion-aware transitions. Principal's presentation is corrected by the checkpoint above. The latest other-session main changes through `dc619c5` were incorporated before release work.

- Today: orange income first, bell attention section, real combined KPI quantity and the first configured threshold, and brand-specific margin links into Insight orders. No individual Pillow/Protector targets or duplicate progress/quote promotion.
- Insight: real Personal/Team data, shared brand margin rows, brand/order filters and correct selected-month refresh. Missing cost or incomplete order coverage does not produce a false margin tier.
- Arena: authenticated Sales/Margin/KPI leaderboards, monthly/quarterly/annual periods, brand filtering, the approved medal podium, self rank, refresh time, and self-only persisted 4/5 brand weeks. No-activity people remain unranked.
- Member list: self and descendants only; Map retains all authorised department branches.
- A/C design comparison remains available. Admin/development `design=live` is explicitly sample data for responsive layout review; it is not the live data route.

**Explicitly deferred by the user:** Fair event identity/date integration, weekly finish counts, historical Fair record and the dependent Championship scoring ledger. The live UI says these are pending and does not publish preview points as real scores.

**Validation and database release:** 2,019 unit/component tests passed (3 files skipped), 399 disposable SQL checks passed, independent RPC security/calculation review complete, full source TypeScript and an isolated production Next.js build passed. Mobile 390 × 844, desktop layout, brand navigation and returning to Insight were checked. Migrations `20260916030000_member_kpi_summary.sql` and `20260917010000_member_arena.sql` were applied atomically to linked project `gixpptmfuryskbwkmiwz`, with their exact source recorded in migration history. Hosted read-only smoke verified anonymous RPC denial, internal-helper denial, direct brand-weeks table denial, and RLS. Do not replay these or unrelated legacy migrations. Production auto-deploys from `origin/main` to Vercel at `https://venture-portal-chi.vercel.app`; do not use the Cloudflare deploy script for this release.

**Hosted account readiness:** all 30 active, date-eligible Revenue staff currently have `user_id = NULL`. No eligible linked member exists for authenticated live RPC or logged-in member UI verification. This is an account-link gap, not a demonstrated permission failure. No accounts were provisioned or permissions changed during release. The read RPCs passed the disposable integration checks; successful hosted member reads still require an existing authorised user linked to their staff record. Follow up through the normal account onboarding workflow; never substitute a privileged session or preview data.

## ═══ CHECKPOINT 2026-09-12 (later) — design A is MERGED and LIVE; read this first ═══

**Where things stand.** Design A from the block below is **PR #112, MERGED
into main as `781ccf7` (the user said MERGE) and PROD LIVE** — Vercel production
deployment of that commit READY, verified read-only on prod as Principal: KRIS
and PETER once each on the rail, Fair's bus with one landing dot on its top
edge, PETER's second line to IR on a bus one level up, `Reports to KRIS ·
PETER` on Fair's header and `Reports to PETER` on IR's, 11 leader cards reading
`Reports to`, no page errors. Main's CI on the merge commit green. Branch
`feat/director-rail` deleted locally and on origin; worktree `director-rail`
removed. PRs #110 (Revenue header proportions) and #111 (employee codes HV001…,
`compareByLadder` by code) landed on main between the branch cut (`9dc751e`)
and the merge; #111 touches `lib/ladder.ts`, not `lib/department-heads.ts`, so
the rail's A→Z `sortHeads` is unaffected. Before the merge the same drawing was
verified on the worktree's dev server against the live data (drag re-centring,
dark mode) and the full Vitest suite was green (1783).

**What changed.**
- `src/lib/hierarchy-space-layout.ts`: the director ROW is gone
  (`directorRowHeight`, `SpaceDepartment.directors`,
  `SpaceDepartmentGeometry.directors`, `contentTop`, `SPACE_DIRECTOR_GAP`);
  frames are content-only again. New pure `directorRail(directors, frames)` →
  `{ cards, drops, buses, bounds }`: cards centred over the union of the
  frames, `SPACE_DIRECTOR_X_GAP` 24 apart; one drop per (director, frame) and
  one bus per frame (bar + trunk to the frame's top-centre). A director's lines
  leave the card `SPACE_RAIL_EXIT` 50 apart (leftmost landing → leftmost
  exit); a bar within `SPACE_RAIL_CLEARANCE` 64 of another takes the level
  above (`SPACE_RAIL_STEP` 18); the rail rises with the levels so the top bus
  is `SPACE_RAIL_GAP` 24 below the cards and the lowest 24 above the highest
  frame. `SPACE_RAIL_LABEL` 22 is the label's room above the cards.
- `HierarchySpaces.tsx`: `railDirectors` (deduped by staffId, A→Z, with
  `departmentIds`/`departmentNames`), `rail = directorRail(...)` recomputed from
  `geometry.departments` on every render (so it glides with the frames —
  `interpolateGeometry` lost its directors branch). DOM: drops
  `.space-director-line[data-director-line="<staffId>:<deptId>"]`, buses
  `g[data-director-bus="<deptId>"] > .space-director-bus + .space-director-dot`,
  the label `.space-rail-label` and the cards `.space-director[data-director]`
  as HTML in the ViewportPortal (not nodes), the frame header's third span
  `.space-heads` (`Reports to KRIS · PETER`). `focusDepartment` fits the rail
  too: every card for All departments, the department's own directors' cards
  for one. Overview counts distinct directors.
- **Pre-existing bug found by E2E, fixed:** `glide`'s `progress` was not
  clamped at 0. Chrome stamps the first rAF frame EARLIER than the
  `performance.now()` sampled when the glide was scheduled (a first load in a
  background tab), so the frames extrapolated backwards — Fair's frame got
  height −53 and `rectanglePoints` threw inside `directorRail` (the old
  drawing swallowed the same negative rect silently). Clamped; regression test
  "never runs a glide backwards…" in `HierarchySpaces.test.tsx`.
- CSS (`globals.css`): `.space-rail-label` (canvas mono caps, `--cv-shelf`),
  `.space-director-bus` + `.space-director-dot` (with `.space-director-line`,
  `--cv-line`), `.space-department-heading .space-heads` (+ `.k`); the director
  card's top border is `--title-head`.
- Docs: DESIGN.md `.space-director` row rewritten + change-log entry
  2026-09-12; commission spec §10 "Reports to" paragraph; CLAUDE.md tree
  paragraph; the hierarchy page intro (`HierarchyTabs.tsx`).
- Tests: `hierarchy-space-layout.test.ts` "the director rail (design A)" × 6;
  `HierarchySpaces.test.tsx` directors describe × 6 (2 cards deduped, 3 drops
  + 2 buses, header/card/popover wording, drag re-centres, glide clamp,
  detach note).

**To know.** The dev database had a THIRD sub-department "TEST SEP26 Payroll
Full Cycle" (empty, no directors) — it gets a frame and no line; prod showed
only Fair and IR. People › Hierarchy's own per-root dashed lines (a fan under
KRIS with lines to PETER) are untouched, as the plan said; the CEO layer, FAA
and the person card on People Management stay in TODOS. Run_code screenshots
land in the MAIN checkout root, the MCP screenshot tool's in the worktree root
— both cleaned up.

## ═══ CHECKPOINT 2026-09-12 — the plan this was built from ═══

**Where things stand.** PR #106 (Revenue Director layer, below) is MERGED and
LIVE (`620bfca`; main has since taken #107, #108, #109 and is `02b3cd7`). What
shipped draws each director INSIDE every sub-department frame they direct — a
reserved row under the frame header — with one dashed line per team leader.
The user rejected that drawing on 2026-09-12 (two screenshots): the lines fan
through the team frames (11 teams × 2 directors = 22 lines on Fair, and Tidy
cannot fix it because lines are not in its collision model — it packs frames
only), the director cards should be "out of the box", each drawn once, and
PETER's line should be pulled all the way to IR ("那个线应该是整个拉过去的").

**Decision: design A.** Five drawings were discussed on the artifact
https://claude.ai/code/artifact/30e9796b-8aa8-4b10-b39c-9e605723c28b — A rail
+ one line per frame; B rail + spine + a bus per row; C = A + B using the
frame's own header rule and left border as the wire; B in a single row; D a
radial hub with the directors inside. The user's last word: "算了吧，算了吧，
走回 A 吧". **Nothing of A is implemented yet** — that session's context was
full. Build it in a fresh worktree from `origin/main`.

**What A is — build exactly this:**

1. **A rail of director cards ABOVE all sub-department frames.** Every
   director once (deduped across departments by `staffId`, sorted A→Z), the
   same `.org-card.space-person.space-director` card as today, last row
   `Directs · Fair · IR` (every sub-department they direct). Rail label
   `REVENUE DIRECTORS · REPORTING ONLY` in the canvas's mono caps. One row,
   y = top of the highest frame − 48 − 92 (card height), cards 24 px apart,
   centred over the union of the frames (stable while frames are dragged).
   HTML in the `ViewportPortal` like the headings — not React Flow nodes.
2. **One dashed line per (director, directed sub-department), landing on the
   frame's TOP EDGE.** From the card's bottom-centre down to a bus y (rail
   bottom + 24), across to the frame's top-centre x, down to the frame's top;
   a dot (r 3.5, `--cv-line`) at the landing. A frame with two directors gets
   ONE bus bar joining both drops and ONE landing. PETER's second line runs to
   IR the same way (exit ~50 px to the right of his card centre so it clears
   Fair's bar). Reuse `.space-director-line`.
3. **Nothing is drawn inside the frame for the directors.** Delete the
   per-leader `.space-director-line` paths and the per-frame director cards in
   `HierarchySpaces.tsx`; delete `directorRowHeight`, `SpaceDepartment
   .directors`, `SpaceDepartmentGeometry.directors` and `contentTop` in
   `src/lib/hierarchy-space-layout.ts` (frames go back to content-only bounds;
   `interpolateGeometry` loses its directors branch). Keep the DATA
   (`OrgDepartment.directors`, `directorKey`, `loadTeam`'s `directors`, the
   Team tab's Reports-to section, `lib/department-heads.ts`).
4. **Frame header** gains `Reports to KRIS · PETER` (a third span on
   `.space-department-heading`, from `headsLabel`). Leader cards keep
   `Reports to · KRIS · PETER` (`HierarchyPersonCard`); the popover's detach
   row, the footer and the move note keep their "reports to …" wording.
5. **Tests.** Replace the "director row" describe in
   `src/lib/hierarchy-space-layout.test.ts` with tests for a pure rail helper
   (recommended: `directorRail(directors, departmentBounds)` → card positions
   + line routes, so the maths is testable). In `HierarchySpaces.test.tsx`
   the "directors" describe becomes: 2 director cards (KRIS, PETER — deduped),
   3 lines (KRIS→Fair and PETER→Fair joined on one bar, PETER→IR), leaders
   still read "Reports to", the popover row still says
   "reports to KRIS · PETER · no override".
6. **Docs.** DESIGN.md: rewrite the `.space-director` row (rail, not a row
   inside the frame) and add a change-log entry; commission spec §10
   "Reports to" paragraph's last sentence; CLAUDE.md tree paragraph ("drawn
   above every tree" → "a rail above the frames, one line per frame").
   `db-schema.md` unchanged — no schema change.
7. **Out of scope unless the user raises it:** People › Hierarchy still hangs
   every Revenue root under KRIS with a dashed line to PETER (its own fan); the
   CEO layer; FAA; the person card on People Management.

**Repo state to know.** Main checkout on `main` at `02b3cd7`, clean except
Codex's untracked `.next-member-preview/`. Codex's old uncommitted snapshot of
the main checkout is parked on local branch `wip/codex-main-checkout-2026-09-12`
(`2f23ede`): 18 of its 125 files never reached main (member preview page,
MemberLoginClub, `tools/*-member-share.mjs`, `tests/member-sql/validate-revenue-
payroll*.mjs`, `docs/member-phone-preview.md`, …) — the user has not said
whether to keep it. Other worktrees (`payment-pv-redesign`,
`loadphase-performance-b017be`, `payment-employee-selection`, `tmp/*`) belong to
other sessions. Migration `20260915020000_revenue_directors.sql` is applied
live under MCP's own version stamp; the file is idempotent. Live data: Fair ←
KRIS, PETER; IR ← PETER; `titles.is_department_head` is true only on Revenue
Director. Test login: `principal@venture.my` / `111111`.

## ═══ 2026-09-11 (evening) — Revenue Director layer ═══

The user's ruling, verbatim in `docs/module-spec-revenue-commission.md` §3 and
`supabase/migrations/20260915020000_revenue_directors.sql`: the Revenue
Director enters no rank and no ladder; appears on the hierarchy chart for
REPORTING only, never for the override; every team leader and standalone
member reports to them directly; each director has their own sub-departments
(Fair → Chris/KRIS + Peter, IR → Peter); the CEO above them is a later step.

Shipped on branch `feat/revenue-director` (worktree `revenue-director`):
`titles.is_department_head` + `comm_sub_department_directors` (migration
applied live), the commission line stopping below a head in
`comm_sync_position`, `comm_title_can_recruit` answering true for a head, the
Team tab's **Reports to** section, the director row on the Revenue chart, the
dashed director line on both charts, `lib/department-heads.ts`. CLAUDE.md's
tree paragraph carries the rule; `docs/db-schema.md` the schema; DESIGN.md the
`.space-director` vocabulary; TODOS the CEO layer, FAA and the person card.

## ═══ CHECKPOINT 2026-09-11 — read this first (handed to Codex) ═══

**Baseline before this continuation.** The IR branch starts at `0085c8b`
(the checkpoint commit after `9453824`). The implementation is committed on
`codex/ir-ruleset-checkpoint`, with `origin/main` at `177f0a0` merged without
conflicts. **Release tracking: [PR #82](https://github.com/wenwei4046/Venture-Portal/pull/82).**
Its checks and deployment links are the source for the running release;
the preflight evidence below does not itself establish deployment success.
The following earlier PRs were
merged on 2026-09-10/11 and were already LIVE on Vercel production
(`venture-portal-chi.vercel.app`), with their migrations applied:

- **PR #78 `05feb90`** — the fix this session shipped (see "What #78 fixed").
- **PR #77** ONE LINE (`20260910120000_one_line_commission_positions.sql`),
  **PR #80** memberships per sub-department
  (`20260910160000_memberships_per_sub_department.sql`) and **PR #79** HR
  Payment board (`20260910151626_payment_pv_by_department.sql`) — a PARALLEL
  session's work. Read CLAUDE.md's "ONE LINE" block and the memberships
  migration before touching hierarchy or ranks: who somebody REPORTS TO
  (`hr_staff_costs.reports_to`) now derives their `comm_hierarchy` position by
  trigger, and a person holds one position/title/rank PER sub-department.

**What #78 fixed (2026-09-10).** Two things the user hit on **IR**, the second
sub-department, in the HR view:

1. Every table built on `src/components/RowForm.tsx` had been a silent no-op
   since `46b6cf0` (2026-09-07): the submit handler read
   `onDone?.(await action(fd))`, no row passes `onDone`, so the optional call
   short-circuited and the action was never called — "Saving…" flickered, no
   POST, no error, nothing written. Ranks, Title ladder, item groups, KPI,
   thresholds, Open Bill, brands & bands, Team rank, Titles, product list: 20
   rows, none saved. Fix = two statements; `RowForm.test.tsx` pins it.
   **Rule: never put an awaited call inside an optional-chained call's
   arguments.**
2. "Start blank" for a new sub-department now writes every scheme switch OFF
   (`src/lib/commission/scheme-defaults.ts`); the `comm_schemes` column
   defaults are TRUE and made a blank IR look like a copy of Fair. IR's own
   scheme (`caeaf2eb-3931-40be-b3bd-b033814f8046`) was switched off by hand
   on the live DB. Fair's scheme is `ab55f0b5-084e-4e31-968f-311fb9e1558b`.

Rank names are NOT editable by design (user 2026-09-05): SS, A, B… count
from the top (`lib/commission/ranks.ts`). Fair orders by percentage rate;
IR's new package ranks must sit above percentage ranks even at zero percent.

**IR data as of 2026-09-11 00:00 MYT.** Sub-department `IR`, scheme "IR
scheme", switches all off, ranks B 3% / A 3.5% / SS 4% (the user keyed them in
after the fix), rungs / people: check before assuming.

### ACTIVE: IR (Investment Renovation) — progressive expansion, release PR #82

**Release preflight validation:** after integrating `origin/main` at `177f0a0`,
`npm run test:ci` passed **1,147 tests**. The earlier implementation build passed
with existing repository lint warnings; PR #82 checks track the release build.
`scripts/test-commission-order-isolation.mjs`
executed all six new migrations in disposable PostgreSQL/PGlite and passed
**120 checks**, covering programme ownership, atomic imports, Fair ERP routing,
cash/subsidy separation, shared payroll apply/reopen, direct limits, failed-move
rollback, retained SDL evidence and the initial IR rule seed. Expansion cases
include fourth/fifth payouts, all-current-groups qualification, eight groups
opening the ninth line, unused offers expiring across months, renewed offers,
opened lines surviving weak months, reopening withdrawing unused permission,
stale direct-ID rejection, and failed/ignored inserts not consuming a slot.
The scoped UI capacity RPC and mutation permissions are checked. The fixture uses
synthetic HR/auth tables; concurrent sessions and live browser E2E were not
part of these preflight checks. A rollback-only rehearsal on the production
database executed all six migrations successfully. The 60 payroll rows had
the same hash before and after rehearsal. That transaction was rolled back;
it is evidence of compatibility, not a completed production migration.
The release procedure applies and records the six migrations atomically,
then merges PR #82 for Vercel deployment. Verify the PR's deployment result
before reporting the running application version.

New migrations, in order:
`20260911010000_commission_rank_packages.sql`,
`20260911020000_commission_order_sub_departments.sql`,
`20260911030000_ir_group_incentives.sql`,
`20260911040000_commission_direct_line_limits.sql`,
`20260911050000_configure_ir_rules.sql`,
`20260911060000_progressive_ir_direct_lines.sql`.
The rule seed fills the verified empty IR ladder with RS 3%, TA 3.5% (200k × 2),
TL 4% (800k), and STL's 6k/group + 2k cap (1M/group); it refuses to overwrite
a ladder/catalogue changed since the checkpoint. It preserves the existing
deposit setting and does not invent IR item classifications or an API.

**Latest confirmed expansion rule — qualify in the actual opening month:** the fourth and every later direct group
reuse the leader's own sales and earn the same RM6,000 cash plus RM2,000
subsidy cap when independently reaching RM1M. After initial Full Spec earns
SDL eligibility, **all existing lines must reach RM1M in the calendar month
when the next line actually opens**: four of four to open five, five of five
to open six, and so on. A prior qualifying month cannot bank an unused place
for a later weak month. Additional expansion does not require each new line
to have three children. Already opened lines and slots remain available in
later weak months. Persist the highest already opened capacity separately
from current-month eligibility and keep immutable qualification evidence;
historical evidence is not an unused permanent right to expand. A weak line
blocks expansion for that month but does not cancel other qualifying packages.
The earlier fourth-line policy block is removed. The sixth migration and app
changes are included in PR #82 and covered by the release preflight above.
Recurring Claims subsidy payments themselves remain batch 2.

**Read `docs/module-spec-revenue-commission.md` §15 before continuing.** The
original annexure remains in `docs/revenue-ir-annexure.md` §§1–12; the appended
management clarifications supersede its conflicting wording. The user has
resolved the questions that blocked the first calculation batch. IR remains
a separate programme from Fair.

| Title | Monthly payout / qualification |
|---|---|
| Revenue Specialist | **3%**, reconfirmed (not 3.3%); personal KPI 100k; cannot recruit |
| Team Assistant | **3.5%**; personal 200k in each of two consecutive months |
| Team Leader | **4%**; monthly group target 800k |
| Senior Team Leader | **RM6,000 per qualifying RM1M direct group**, plus separate **RM2,000 subsidy cap/group**; replaces both personal percentage commission and percentage override in qualifying months |
| SDL | Higher level earned by **Full Spec**. Each additional line requires all existing lines to qualify in its actual opening month; already opened lines remain available in later weak months. |

**Sales depth and repeated own sales — explicitly confirmed.** Ordinary
targets include own + direct personal sales + those directs' immediate
children's personal sales, stopping after two generations. Each STL package
group is **leader own + that direct own + that direct's immediate children
own**. The leader's own amount intentionally repeats in EVERY group target.
Own 200k + A 800k and the same own 200k + B 800k produces two qualifying
groups: **RM12,000 incentive + RM4,000 separate subsidy cap**. Actual sales
are still RM1.8M; do not sum overlapping targets into actual or personal
revenue. No deeper generations contribute, and one group's surplus cannot
fill another group's shortfall.

**Monthly packages and fallback.** Judge TL's 800k and each group's 1M afresh
every calendar month. Pay one RM6,000 package and RM2,000 cap per qualifying
group every qualifying month, even at RM1.5M / RM2M or above. A group needs
no TL title or three-child structure to earn this first incentive; a TA with
one qualifying line can reach STL without first spending a month at TL.
If **zero groups qualify next month**, pay the **TL 4% percentage structure**
again, even with a retained STL title/rank. Percentage overrides return in
that fallback month; subsidy does not. This fallback was explicitly confirmed.

**Overrides are TWO layers, compressed differential.** TL 4% → TA 3.5% →
RS 3% on an RS sale pays RS 3%, TA 0.5%, TL 0.5%. Equal-rate layers pay zero
but still consume a layer. Stop after two reporting links. The earlier
one-level interpretation of annexure §7 is superseded; Fair keeps its
unlimited differential chain.

**Full Spec is separate from first package eligibility.** Before earning
SDL expansion, TA/TL/STL may hold at most three directs. Full Spec requires **three directs × three
immediate children each**, and all three groups independently reaching 1M.
It earns SDL eligibility for the fourth direct. The latest clarification
narrows the earlier permanent-entitlement wording: **already opened lines
are retained**, but an unused qualification cannot fund an opening in a
later weak month. With four existing lines, all four must qualify in the
actual month the fifth opens; repeat for five of five, six of six, and later
expansion. One qualifying new line alone is insufficient if any existing
line misses RM1M. Persist opened capacity (`opened_direct_line_limit`) and
current-month effective eligibility separately, with historical award
evidence retained. These later expansions do not repeat the initial
three-child requirement.
The fourth and later lines use the same monthly package and repeated-own
formula; qualification of individual packages remains independent of expansion.

**Implemented in PR #82:** package-aware rank catalogue/order,
Ranks tab fields, configurable two-layer target/override calculations,
group incentives and statement breakdowns, sub-department order isolation,
and direct-line-limit enforcement. `src/lib/commission/ir-groups.ts` supplies
the independently tested group calculations; `ir-engine.test.ts` exercises
their engine integration, package fallback and Fair compatibility. Migration
and app integration are covered by the checks above; the PR records deployment
status. Deployment does not compute or apply an IR payout. Payroll must still
sum every applied sub-department's commission;
subsidy caps never enter `total_commission`.

**Hierarchy reminder:** ONE LINE governs only the HOME sub-department (Fair).
IR writes its own membership title/upline/rank through `moveMembership` /
`openMembership`; enforce recruitment limits in that server and DB path too,
not just the chart or `hr_staff_costs.reports_to`.

**Later components:**

- **Car/property subsidy**: cap = RM2,000 × qualifying groups this month
  (2k / 4k / 6k / 8k and onward); non-cash; follows the hire-purchase instalment;
  **registered ONCE with the document, then paid every month without a fresh
  claim; NO statutory deductions** (user's answers). Belongs in Claims, not
  the engine: `claims` needs a `staff_id` (today only `claimant_name` text), a
  category, and the cap read from that month's engine result.
- §10 **Tier KPI**: Appointment % / Closing % / Revenue target — all three
  compulsory; pays Personal Owned Achievement RM800 / 2,000 / 4,500 to the
  person and Direct Line RM300 / 500 / 800 to the direct upline. Appointment
  and closing COUNTS do not exist anywhere in the portal (the ERP feed is
  sales orders only, `src/lib/erp-sync/`).
- §9 **Introduction & closing**: the introducer earns a "closing percentage";
  a sales order carries one salesperson today — needs an introducer field and
  the split.
- **House assignment**: RM10/month per house assigned to a Revenue Specialist,
  for the agreement's duration — needs an assignments list (person, house,
  from/to).
- §11 advertisement control is policy; nothing to compute.

**Fair-only components to keep OFF for IR:** KPI item allowance, Open Bill
bonus, margin penalty, margin incentive. Deposit gate: undecided.

**Remaining questions:**

1. Where do appointment / closing numbers come from, who keys them, and is a
   person's tier fixed or judged monthly?
2. The introducer's closing percentage and how it splits with the closer.
3. House assignment: really RM10 per month per house, and its data source?
4. IR's deposit gate remains undecided; do not copy Fair's 50% silently.

**Delivery batches:** (1) order isolation + rank packages + two-layer
target/override settings + direct-line cap + group incentive,
engine + statements + Ranks tab; (2) subsidy through Claims with the
cap; (3) tier KPI + introducer + house assignment, each needing a data source
first. Every batch: migration, pure helper + tests under `src/lib/commission/`,
E2E on localhost against the live DB, `npm run test:ci` (1,093 was the
pre-IR baseline; report the actual new result after validation).

**Conventions that bit this session:** in a worktree the Bash harness refuses
`git -C`, `$(...)`, runtime variables and `(portal)` paths inside compound
commands — one plain command per call, python heredocs for edits. Playwright:
log in, then open a NEW tab for the walk (the login tab goes input-dead).
Vercel runtime logs show nothing when the browser never sends the request.

## ═══ CHECKPOINT 2026-08-08 (older — the 2026-09-11 block above supersedes it) ═══

**Where things stand** (everything below is DEPLOYED, tests 520 passing, all
migrations applied live + archived; detailed sections follow this block):

1. **Bank Reconciliation is the active workstream.** (updated 2026-08-11)
   April + May = done (May ties: 81,019.05 − 1,910.90 outstanding = GL
   79,108.15). June = re-uploaded, 58/60 matched — the last 2 statement lines
   are the 20-May BIG MATRIX payments, matchable since the window fix (round
   5 below). Features all live: HLB PDF template (coordinate-based,
   fail-safe balance tie-out), Excel/CSV any bank, auto-match
   (amount→name→date), N↔M match groups, book-only CONTRA groups (Σ=0),
   ignore, earlier-items toggle, Bank-vs-GL month-end tile, no-forward
   window. **Alliance PDF template PENDING — waiting for the user to send a
   sample statement.** One-sided "per-bank cleanup" GL lines must NOT be
   contra'd (they explain Bank-vs-GL diff).
2. **Approvals pending in-app**: 90,000 loan to CONTS + 4 director-salary PVs
   (43,135.67) — all now payable from HL (165,214.03 after the same-bank
   cache-clobber fix, mig 20260807010000). Principal just needs to approve.
3. **Auto payroll accrual JVs live** (staff → at run approval; director → at
   HR submit; dated back to payroll month-end). July was backfilled
   (JE-202607-0386..0390). AUTO JVs are visible + editable on the Journal
   Entries page (AUTO badge).
4. **Bank BA registry + calculator live** (/ba): HC's facility, HV owes HC
   1.5%/mo × days/30, charges sub 2.5%/mo × days/30, bank interest reference
   only. **v2 (2026-08-11): principal never touches HV's bank, but the
   INTEREST is real** — Bill borrower → invoice (5028), Pay HC → PV (6001),
   per-company limits (warn-only), BA-document attachments + Claude auto-read
   (needs ANTHROPIC_API_KEY). See the BA v2 section below. User hasn't
   recorded a real BA yet.
5. **Company Statement**: scope is fund in/out ONLY (user's explicit choice —
   never propose adding invoices/GL receivables). English UI everywhere
   (Reports + Treasury). Exports English-only (react-pdf has no CJK).
6. **Open tails the user manages**: 欠2990 8,613.75 ↔ HC欠 8,613.75 mirror
   (53,613.75 triangle, contra'd 2026-08-07); HC 220k deposit → 80k lent +
   90k pending loan + 50k unallocated; GL4052-vs-module diff ~141.5k
   (user's legacy items, hands off); dormant HC/4052 + 4070 display items.
7. **Conventions to remember**: relative bank-cache writes only (never
   absolute-from-read); ledger-table th needs its own `right` class; PDF
   exports ASCII-only; alloc_/ba_/bank_recon_ tables = untyped-client casts;
   staff table is `hr_staff_costs` (no `staff` table); dept staff→segment map
   HR/Finance/Marketing/Director Office (+director from director_monthly_
   payroll); 还款 PVs are typed 'expense' with fund_source_id links.

## SESSION 2026-08-31 — Revenue Department commission payroll (NEW MODULE)

**MERGED TO MAIN 2026-08-31 — PR #24, merge commit `283dd3d`.** The four
migrations had already been applied to the live database during development, so
the merge applied nothing: the 22 tables, three RPCs and the fourth value on
`hr_monthly_payroll_source` were live before it landed. Built in worktree
`.claude/worktrees/revenue-commission-payroll` on branch
`worktree-revenue-commission-payroll`, with main merged in at `c4227dc`
(Walnut palette).
Suite 710 passing, `next build` clean, `tsc --noEmit` clean (installing
@xyflow/react also pulled in @anthropic-ai/sdk, html-to-image and pdf2json,
which package.json declared but nobody had installed).

**The module is now feature-complete except for the data it needs.** The run
itself — compute, review, apply, reopen — was built in the second sitting; see
"The run" below. What still blocks a real July is that 39 of the 40 ERP agents
do not exist as staff, and that nothing has a cost.

Full spec: `docs/module-spec-revenue-commission.md`. Read that before touching
any of this — everything below is a summary of it.

### What the module is

A SECOND payroll **type**. Every existing `hr_monthly_payroll` row arrives
already-computed from InfoTech; the Revenue Department's is *derived* from an
ERP sales-order export instead. Its staff have **no basic salary and no
statutory allowance** — 100% commission — and pay **Withholding Tax 2% instead
of PCB**.

**The architectural decision that matters: the commission engine is an upstream
FEEDER, not a parallel payroll.** It writes exactly ONE existing field,
`hr_monthly_payroll.commission_amount`. Statutory lookups, payroll runs,
funding, accrual JVs, PVs and GL are untouched. "Type" in the DB is
`departments.payroll_source ∈ (imported, commission)`.

### Org shape

`departments (Revenue Department) → comm_sub_departments (Fair) → comm_schemes
→ {ranks, item groups, KPI items, thresholds, open-bill rules, brands, margin
bands, promotion rules, hierarchy}`.

**"Fair" is a SUB-DEPARTMENT, not the whole department** — the roadshow/event
team, which is where the 3-day event and the Open Bill bonus come from. Each
sub-department calculates differently, so a new one either CLONES an existing
scheme or starts blank, and every component can be switched off at scheme level.

### The money rules (all in the engine, 91 tests)

Ladder, 6 rungs: Revenue Specialist 5% → 6% · Team Assistant 7% → 8% · Team
Leader 9% · Senior Team Leader 10%. **There is no 7% Revenue Specialist.**
`rs_5` cannot recruit; 6% unlocks it.

- **Rate mode, per person.** `variable` = "entitled to the scheme target"
  (recomputed monthly off group sales, drops back when missed). `fixed` =
  "flexible" (whatever title a human moved them to sticks). UI says
  Scheme / Manual.
- **Group sales** = own + the WHOLE downline subtree. 300k promotes 6% → 7%.
  It is a SALES figure, so the margin penalty does NOT reduce it.
- **Deposit gate.** No commission on an order until the customer has deposited
  ≥ 50% of the ORDER TOTAL (header total, transport included). Holds the whole
  order — product commission, KPI and Open Bill together. Nothing is lost: it
  pays in the month the deposit clears, and `comm_order_releases` (UNIQUE on
  order_no) makes double-paying impossible.
- **Open Bill** = the 1st/2nd/3rd bill of an event day earns +50/40/30% ON TOP
  of that bill's commission, at the person's CURRENT rate. Additive.
- **KPI items** pay a flat RM per unit and their revenue LEAVES the commission
  base. 10 units → +20% on the whole KPI amount. Most are bundled free in the
  ERP, which is the case it exists to reward.
- **Override** = differential roll-up, unlimited levels, equal rates compress
  to 0. **The below-margin penalty cuts the upline's override too**, via a
  penalty-weighted revenue base.
- **Margin bands follow the BRAND** (Akemi / Zanotti / Ergotex). Incentive
  rungs read "margin ≥ this" and STACK (36% → 1,000; 43% → +1,500 = 2,500);
  penalty rungs read "margin ≤ this" and the MOST SEVERE wins (27% → ×0.5,
  25% → ×0.25, 24% → ×0). **Penalty is PER BILL; incentive is MONTHLY and
  judged brand by brand — EVERY brand sold must clear the tier.** Three
  weekends of Akemi at Tier 2 plus one weekend of Zanotti below it is a Tier 1
  month. A brand with no cost, no ladder (Ergotex today) or no brand code
  BLOCKS the whole incentive loudly rather than paying on the judgeable ones.
- **Promotion criteria are RECORDED, NOT ENFORCED** (`comm_promotion_rules`,
  `is_enforced = FALSE` on all 10 rows) — the user asked for them written down
  while the rules settle. The only live gate is
  `comm_ranks.group_sales_threshold`.
- Margin = goods only (TRANS/OTHER excluded) but INCLUDING free KPI giveaways,
  because their cost is real and giving them away is meant to hurt.

### Where cost comes from (the ERP export has none)

1. **The Product list** (Principal only) — `comm_products`, item code →
   unit cost + brand, with a spreadsheet bulk paste. The importer stamps
   `qty × unit_cost` onto `sales_order_lines.cost_amount` ONCE, so changing a
   price later cannot rewrite a run already computed against the old one.
2. **`sales_orders.manual_margin_pct`** — margin typed per bill, which
   OVERRIDES anything derived from cost. The stop-gap while the list fills up.

No cost and no keyed margin → the penalty is skipped and the run says so.

### The ERP export — five traps, all handled

Confirmed against `July SO.xlsx`: 3,261 lines → 691 orders → 40 agents;
July 473 orders RM2,861,361.30, commissionable RM2,831,707.30 after dropping
RM29,654 of TRANS/OTHER. 324 paid / 360 part-paid / 6 unpaid.

1. **`Total` and `Tax` appear TWICE** (order-header block + line block).
   Resolve columns RELATIVE TO `Item Group` or every package order looks
   discounted. With that fixed all 691 orders tally exactly.
2. **Package pricing** — 607/691 orders put the whole value on ONE line and
   bundle the rest at qty > 0, amount 0. A per-line amount is NOT a per-product
   revenue split.
3. **Agent is free text, no code, and dirty** (trailing spaces, mixed case,
   plus `OTHERS` / `Test Sales Director` / `HOUZS CENTURY`). Hence
   `comm_agent_aliases`.
4. **No time of day** — intra-day order comes only from the running `Doc. No.`
5. **The export is a date RANGE, not a month** (a "July" file ran to 15 Aug).

### Live now (applied 2026-08-31, verified)

22 tables, 44 policies, Fair + 6 ranks + 3 brands + 8 margin bands + 10
promotion rules seeded, Revenue Department flipped to `commission`.

Applied with `apply_migration`, NOT `supabase db push` — the remote records 394
migrations against 391 local files, so db push cannot be trusted here.

Verified after applying: **no existing payroll row was touched** (newest
`updated_at` across all 38 rows is still 2026-08-03, total WHT 0, nobody off
PCB), and a rolled-back functional test proved the cycle trigger refuses a
manager-under-own-downline, the one-position exclusion refuses an overlap, and
a pure-commission salesperson on withholding gives gross 8,000 → statutory 0 →
PCB 0 → WHT 160 → net 7,840.

### UI built

> **Routes moved 2026-09-01.** The module left HR Costing for its own Revenue
> group under Departments, and every page is now addressed by sub-department
> (`/revenue/fair/...`). The old `/hr-costing/commission/*` paths redirect to
> `/revenue`, which forwards to the first sub-department. See
> `docs/module-spec-revenue-commission.md` §3.0.

- **`/revenue/<sub>/rules`** (Principal + HR) — the **Rules** tab: nine
  sections — sub-department + Generate New, scheme switches, tier ladder, item
  groups, KPI items, KPI thresholds, Open Bill rates, brands + margin bands,
  promotion criteria (read-only), salespeople table. Scoped by the route: it
  loads that sub-department's scheme and nothing else.
- **`/revenue/products`** (Principal), with a red "missing a cost" counter.
  Department-wide — `comm_products` has no `scheme_id` — so it sits beside the
  sub-departments rather than inside one. It and the rules were Settings tabs
  until 2026-08-31; Settings has no sidebar entry for HR, and the page
  configuring HR's own payroll was reachable by URL alone.
- **`/revenue/<sub>`** — the **Commission Calculation** tab (months with sales
  data) and `[period]` (surfaces unmatched agents, lines without cost/brand,
  orders under the deposit gate). Compute passes the sub-department, so a
  second one will not make `computeRun` ambiguous.
- **`/revenue/<sub>/hierarchy`** — the **Staff Hierarchy** tab, `@xyflow/react`.
  Drop a card onto a manager OR draw a line. Illegal drops grey out and are
  refused client-side; the DB trigger is the backstop. Layout is hand-rolled
  (`src/lib/commission/org-layout.ts`) so orphans and cycles are PLACED, not
  dropped. Shows this scheme's people plus anyone not yet placed anywhere.
- **`/revenue/<sub>/[period]/import`** — browser-parsed wizard that leads
  with what it will DROP, does agent matching, stamps cost + brand, and seeds
  the Open Bill picks from the document numbers as suggestions. The import
  itself is department-wide: one ERP export covers every sub-department.

`setPosition()` NEVER mutates a position a closed month has run against: it
closes the old `comm_hierarchy` row the day before the current period and
inserts a new one (edits in place only when the row started this month).

### The run (second sitting, 2026-08-31)

Compute → review → apply → reopen. The engine already existed and is unchanged;
what was missing was everything around it.

**Shape.** `run-actions.ts` loads the rows, `src/lib/commission/run-payload.ts`
maps them onto `EngineInput` and maps the result back onto an RPC payload, the
engine does the maths, and ONE SQL function writes. The seam is a pure module
with 16 tests of its own because a mapping slip there does not throw — it
quietly pays the wrong person the wrong amount.

**Three RPCs, all SECURITY INVOKER** (migration `20260831040000`). RLS is the
outer wall (principal + hr only; hr may only touch a *draft* payroll row) and
the guards inside are the inner one. A SECURITY DEFINER would have handed HR
the ability to rewrite a submitted month.

- `save_commission_run` — replaces the month's statements in one transaction.
  Refuses a payload whose lines do not sum to the statement total, or whose
  statements do not sum to the run total, or a run that is already applied.
- `apply_commission_run` — the ONLY place `hr_monthly_payroll.commission_amount`
  is written. Refuses while any warning stands, refuses a payroll month that has
  settled, refuses an order another run already paid.
- `reopen_commission_run` — undoes an apply exactly: commission back to 0, the
  releases deleted so the orders return to the pool.

**`comm_runs` now snapshots what the run saw** (migration `20260831030000`):
`released_orders`, `deferred_orders`, `penalised_orders` as JSONB, plus
`reopened_at` / `reopened_by`. These are NOT recomputed on the page. Re-importing
a month replaces every `sales_orders` row, so a page that re-derived its own
history would disagree with the money already in payroll.

**`hr_monthly_payroll_source` gained `commission`.** The other three values all
describe a human putting the number there; a Revenue row is derived and is
rewritten on every Apply, so a hand edit will not survive the next run. (Its own
migration, because `ALTER TYPE ... ADD VALUE` cannot be USED in the transaction
that adds it.)

**Carry-forward works.** A run's input is every committed order up to and
including its month that no applied run has paid for — so a June order the
deposit gate held pays in July, at its original `period_month`, labelled
"carried from 2026-06". Orders an earlier run already paid are still passed to
the engine, flagged, because dropping them at the query would erase their
revenue from GROUP sales, and group sales drive promotions.

**UI.** The run dashboard on `…/[period]` (hero total, warnings, per-person
table, penalised bills, orders waiting on a deposit, Compute / Apply / Reopen);
the statement drill-down at `…/[period]/statement/[staffId]` (figures, margin
brand by brand, a section per component down to the individual lines); and the
Open Bill board at `…/[period]/open-bill` — which defaults to hiding everything
already reviewed, because in a real month most days have one obvious answer and
what deserves a person's attention is the day where the suggestion might be
wrong. Both review-board edits (Open Bill rank, hand-keyed margin) refuse once
the run has paid.

**Proved on the live schema**, in a rolled-back transaction: both tally guards
refuse, warnings block the apply, an applied run refuses to be recomputed, a
*rejected* payroll run does not block while a *submitted* one does, and
apply → reopen leaves payroll exactly where it started. Full chain for a
commission-only salesperson on withholding: gross 10,000 → PCB 0 → WHT 200 →
net 9,800, then back to 0 on reopen. Nothing pre-existing moved (all 38 rows
still at `updated_at` 2026-08-03).

**Two things found while doing it, both real:**

1. **The July 2026 payroll run is `approved`.** The first attempt to prove the
   apply used July and was refused by the guard — correctly. A real July
   commission run cannot be applied until that payroll run is reopened.
2. **A period holds several `payroll_runs` rows** — 2026-06-01 has both a
   `rejected` and an `approved` one. The first cut of the guard asked "is there
   a row that is not draft?", which a dead rejected run answers yes to. It now
   asks whether any run has SETTLED (submitted / approved / paid). Corrected on
   the live database by migration `commission_run_payroll_guard_ignores_rejected`
   and folded back into `20260831040000` in the repo, so replaying the file
   gives the same end state — the remote therefore records one migration name
   that has no local file, on top of the pre-existing 394-vs-391 drift.

**The payroll side is closed too.** The grid's Commission cell is read-only for
anyone in a `payroll_source = 'commission'` department, with a `from commission
run` badge linking to that month's statement (or `awaiting the run` when none
has been computed). The Server Action enforces the same thing —
`resolveCommissionWrite` drops an unchanged value riding along with a
legitimate edit and refuses one that would move the number — so a crafted
request cannot get past it either.

Two Withholding Tax holes closed while there: PCB and WHT are mutually
exclusive and only PCB was ever displayed, so a Revenue payslip would have
shown a Net Pay that did not equal Gross minus Total Deductions; and
`updateStaffStatutory` recomputed net without subtracting WHT, so overriding
any statutory on a Revenue row would have quietly handed back their tax.

`src/lib/supabase/database.types.ts` was **regenerated** at this point — four
migrations of drift had accumulated and `withholding_tax` was not in it. All 22
comm_* / sales_* tables are now typed. The untyped-client casts across the
module still compile unchanged; `tsc --noEmit` is clean and the suite went
710 → 717.

### ⛔ Blocked / next

1. **39 of the 40 ERP agents do not exist in `hr_staff_costs`** (only
   `SIA JONAS`, and he is in Marketing). Nothing can run until they are created
   under HR → Staff in the Revenue Department with basic 0, then placed on the
   org chart. This is the practical first move.
2. ~~The commission run itself~~ — **done**, and so is the payroll-side
   lockdown (see "The run" above). What remains on that side is one operational
   step: reopening the approved July 2026 payroll run before a real July
   commission run can be applied.
3. **KPI product list unchosen.** Sizing: RM50 on the five commonest pillow
   codes would have paid ≈ RM63,000 of KPI in July against ≈ RM141,000 of
   product commission at a flat 5%.
4. **Zanotti / Ergotex ladders and Item Code prefixes** unknown. Selling a
   brand with no ladder blocks that person's incentive — by design, but fill
   them in.
5. **WHT remittance** — PCB files through the statutory export; WHT goes to
   LHDN on a different form and that section does not exist yet. Needed before
   the first Revenue payroll is actually paid out.
6. Open spec questions: group-sales targets above 300k, and confirming 5% → 6%
   is measured on PERSONAL sales.

### ⚠️ Landmine found while verifying (pre-existing, not introduced)

Re-firing `compute_hr_monthly_payroll` on InfoTech-imported rows replaces the
file's verbatim statutory with recomputed JADUAL values — **31 of the 38 live
rows move** if anyone runs a bulk `UPDATE hr_monthly_payroll SET x = x`. Do not
do that without accounting for it.

## SESSION 2026-09-28 — Wei Siang installment linked; director-interest legs reconciled to the lending book

**PV HV-PV-202608-0275** (1,950, 2026-08-10, 4054) was unlinked — the only gap in
[BI#5] Lim Wei Siang 90k (2025-05 → 2026-09 otherwise continuous). Linked to
BI#5 with rows principal 1,500 + interest 450, `repayment_breakdown` set. BI#5
now 17 installments, principal paid 25,500, outstanding 64,500.

**Then reconciled 4054 / 4055 against the lending book** (the user challenged my
first read — "6月的不是有吗？" — and was right):
- 2026-06-12 **JE-202606-0106** is a reclass JV (Dr 6000 750 / Cr 4054 450 /
  Cr 4055 300) that already pulled the June interest out for BOTH directors.
  June was therefore correct all along.
- **My 2026-09-21 error**: I also split Liang's June JE-202606-0059 in place, so
  that 300 was counted twice (4055 300 high, 6000 300 high). Undone 2026-09-28 —
  JE-202606-0059 is back to 4054-style single line 4055 Dr 1,300, the extra 6000
  line and its PV source row deleted, entry description notes why. Liang's July /
  August splits stay (no reclass covers those months).
- Split in place (4054 principal + 6000 interest), no reclass JV:
  PV 202607-0107 (Jul) 1,500 + 450 · PV 202608-0275 (Aug) 1,500 + 450 ·
  PV 202606-0067 (2026-06-25 BI#30 partial refund 10,150) 10,000 + 150.
- After: **4054 GL 102,000 = book 102,000**, **4055 GL 42,000 = book 42,000**,
  no unbalanced JEs, 6000 52,477.77 → 53,227.77 (+450 +450 +150 −300).

Lesson recorded in memory: before splitting a PV's 40xx leg in place, check
whether a reclass JV already moved that month's interest.

### 2026-09-28 (later) — Aug'26 statement, the recon page, report order, HC's two accounts

**PDF template fix (9b6d2e28)**: Aug'26 refused to load, parsed movements RM 2.00
more negative than the statement's own opening→closing. Money cells are RIGHT
aligned, so a short number starts ~1 unit right of a long one in the same
column ("1.60" x 23.96 vs "100,000.00" x 22.71). Nearest-header-x put the two
rebate CREDITS in Withdrawal (losing by 0.03) and the two service charges in
Balance, dropping those rows. Now every money cell on a dated row is clustered
document-wide into three bands tied to their headers. Real file: 26 deposits =
528,689.20, 35 withdrawals = 630,104.27 — the statement's own footer totals.
A refusal now also reports how many dated rows had no readable amount.

**Recon (06b284ed, 8a1e30a8, 4035b6f3)**: the Matched tile counts ignored and
contra lines as cleared (split printed underneath); statement-side CONTRA added
(mig 20260928010000 — journal_line_id nullable + CHECK one side present,
'contra' in match_kind), mirroring book-side contra: pick ≥2 statement lines
summing to 0.00, own section with Dissolve, left out of the report like book
contra; the month list counts any match_kind as cleared ("Cleared" column).
User contra'd Aug's 4 waived-charge lines → Aug is 61/61.

**Report layout order (72d77f3a)**: buildHierarchyRows re-sorted every level A→Z
by name, so Discount Allowed (5999) led Revenue and Edit layout's order was
discarded. Layout order now leads, unlisted follow A→Z, a parent takes the best
rank beneath it; editor chips got ▲▼ (drop still appends). Monthly P&L and
Monthly Cash Flow share the builder.

**DATA — HOUZS Century had both 3056 (due from) and 4052 (due to)**: 3056 held
only 4 rows and 185,156.32 of it was two fund-source repayments TO HC posted as
a receivable — PV 202607-0145 (140,000 FUND RETURN TO HOUZS) and PV 202607-0178
(45,156.32 Repayment - Conts). Same-day siblings PV 0149/0150 used 4052, and
0149 had already been reassigned 3056→4052 on 2026-08-29 as a wrong account.
Fixed via `reassign_voucher_gl_account` as Finance; the 2026-08-07 netting JE's
Cr leg (45,000) moved 3056→4052 in place too (HC now sits in one account, so
that entry nets within it). Result: **4052 = 595,313.38 Cr, 3056 = −300.00**,
no unbalanced JEs. The −300 is invoice HV-INV-202609-0040 (2026-09-23,
"Marketing Service - Sep'26"), whose five 300 lines use category_code 3059 /
3053 / 3056 / 3051 / 3054 — the subsidiaries' due-from accounts as income
categories. Left alone: that is Finance's own categorisation, not an obvious
error. **Still open**: the opening JV-000010 (2026-03-29) carries 4052 Dr
53,613.75 "FUND AT HOUZS CENTURY", and the 2026-08-07 netting says it cleared
"HC repaying its 53,613.75" — possible double count, user asked to look at it
after this.

## SESSION 2026-09-22 (later) — New loan / New fund source: one two-column deal form (c10a7fc5)

**Ask**: "就你看 new loan 我需要往下滑，旁边其实有位置 然后排法很混乱" →
mockup (scratch `form-mockup.html`, before/after, live numbers) → user picked
**预览栏深蓝、备注默认收起、手机版不用钉** → "直接 push".

**Built** (field `name`s unchanged; `createLoan` / `createFundSource` untouched):
- `src/components/treasury/DealFormShell.tsx` — `dealFormClass` (grid
  `lg:[minmax(0,1fr)_300px]`), `DealCards`, `DealCard` (numbered ①–④),
  `DealRow` (`1-1` / `2-1`), `DealLabel` (+ required/optional/hint),
  `DealHint` (ⓘ: hover or tap; the old under-field paragraphs live here),
  `DealToggle` (checkbox card, `has-[:checked]`), `DealMore` (`<details>`,
  collapsed), `DealPreview` (navy aside inside the `<form>`, Submit/Cancel/
  error there, `lg:sticky`; phones: bottom, not pinned).
- `src/lib/deal-preview.ts` (+test) — `dealPreviewFigures` (flat: rate ×
  original principal, principal ÷ months; open-ended → principal null; compound
  → totalInterest null), `numberOrNull`, `loanMaturity` (start + tenure, like
  the detail page), `bankShort`.
- globals.css `.deal-side*` after the cf-pill rules — uses `--cf-*` tokens, so
  the aside carries `cf-scope`.
- NewLoanForm: ① Borrower + Loan start date, 资金来源 · ② Principal + rate box
  (base + custom = locked effective, shown before a borrower is picked) ·
  Tenure + 利滚利/最低还息 toggles · ③ Disbursement account + Pay from bank ·
  ④ Repayment terms (folded). Preview: 本金/利率(sub base+x)/每月本金/每月利息
  (首月利息 when compound)/每月合计/到期 (D MMM YYYY · n 期 | 无固定期限)/全程
  利息/出账 bank + Dr account. Submit disabled until a borrower is picked (as before).
- NewFundSourceForm: ① Source type (hint = the type's blurb) + Effective date,
  From (select / free text / dept — `fromLabel` state feeds "借自 …") · ②
  Amount + Interest rate · Repayment period + Expected repayment date ·
  toggles · ③ Amount due to (BS account) + Receive into bank · ④ Notes
  (folded). Preview: 首期 / 还清约 (`expectedFullRepaymentDate` · n 期 | "n 期
  · 首期未定" | 无固定期限) / Cr account or "4000 Fund Sources Payable".
- Tests: `NewLoanForm.test.tsx` (5) and `NewFundSourceForm.test.tsx` (4) —
  every field name present, preview arithmetic (100k @ 1+0.5 × 12; Liang 60k
  @ 0.5 × 60 from 5 Oct 2026 → 5 Sep 2031), folded notes.

**Gates**: tsc clean (only the other session's MemberWorkspace*.test errors),
vitest 2577 green, next build green. NOT eyeballed in a browser (dev server
needs a login I cannot type) — user chose to check on the live site. If
something looks off, the likeliest spots: the rate box grid (`grid-cols-
[auto_auto_1fr]` + the `col-span-3` effective line) and ⓘ tooltips near the
right edge (they open to the left:0 of the icon, `max-w-[80vw]`).

**Follow-ups shipped (594ad430, deployed)**: both forms say **Repayment period**;
loan cap lifted to 120 (mig `20260922020000_loan_tenure_120.sql` re-creates
`create_loan_with_approval` with `> 120`; action + form follow). New loan has
**Expected repayment date** (`repayment_start_date` form field → month written to
`loans.repayment_start_month` in the post-RPC update); New fund source now also
writes `repayment_start_month` from its `repayment_date` (before, the schedule
ignored that date and started effective + 1). Preview shows 首期 / 还清约 on both.
A3 (Locked effective relabel) — user said 不用.

**DATA OPS 2026-09-22 — Chai Meng Keat → CMI 80k via HV (user-confirmed)**
Facts from the user: 80,000 · 6% p.a. = 0.5%/mo flat · 60 期 · loan 2025-05-31 ·
首期 2025-07-15 · CMI has never repaid HV; HV pays Chai; the 2025 six
installments (10,400) were paid by HC on HV's behalf → HV owes HC 10,400.
Split per installment = principal 1,333.33 + interest 400 (user's earlier
1,387.20/346.80 dropped — "1. 对"); actual 1,734 payments → 1,334 + 400.
- `[BI#35]` fund_sources 31357674-ec7b-44a5-af93-a9641f53a18d (director_loan
  Chai, 4056, start 2025-07-01, maturity 2030-06-15). 18 repayment rows:
  2025-07-15…12-15 × (1,333.33 [Dec 1,333.35] + 400) = 10,400; PV
  HV-PV-202606-0009 (6,936 = 4 installments Jan–Apr 26) 5,336 + 1,600;
  PV 202608-0314 (May) and 202609-0424 (Jun) 1,334 + 400 each. Outstanding
  principal 63,996, 48 installments left (Jul-26 → Jun-30).
- `[LO#35] · 资金来源: MK` loans 642e3772-fd7d-45f2-9b20-8d9de9ac7ab4 (CMI,
  base 0 + premium 0.005, tenure 60, start 2025-07-01, approved_by Principal,
  created_by Finance). No repayments — Loan Monitor will show CMI's dues from
  2025-07 unpaid; that is the record, not a flag (see dont-audit memory).
- `[BI#36]` fund_sources 76048840-eb31-4b87-9674-17ce1ee32e66 (subsidiary
  HOUZS Century, 10,400 @ 0%, no term, 2025-12-15, 4052).
- BI#13 (Chai 9k → Conts): its two rows (6,936 "对账修正 2026-06-12" and the
  auto-synced 1,734) were repointed to BI#35 — BI#13 is back to 9,000 unpaid
  (user: "5. 可以").
- PVs 0009/0314/0424: fund_source_id → BI#35, repayment_breakdown set,
  payment_voucher_sources split 4056 principal + 6000 interest
  (pvs_sum_matches_trigger disabled during the split), JE lines split in place
  (no reclass JV — user rule).
- JEs via `create_manual_journal_voucher` as Finance: JE-202505-0755
  (2025-05-31, director) Dr 3057 80,000 / Cr 4056 80,000; JE-202512-0756
  (2025-12-15, corporate) Dr 4056 8,000 + Dr 6000 2,400 / Cr 4052 10,400.
- Balances after: 4056 102,996 Cr (Conts 39,000 + CMI 63,996); 3057
  135,540.08 Dr (55,540.08 capital inject + 80,000); 6000 +4,800; 4052 +10,400.
- Convention reused from the May import: historical deals are inserted
  directly (status active, approved_by Principal), GL brought in by manual JV
  as pass-through Dr 30xx (due from sub) / Cr 40xx (due to lender); no bank
  lines because the cash never crossed HV's bank inside the books.

**Not done / ideas floated**: pre-fill a fund-out from its 资金来源 fund-in;
give the Amend-terms forms the same shell; regroup the detail pages'
settings (assessment given 2026-09-22, not built).

## SESSION 2026-09-21 — 「从某月起生效」 terms changes for loans / fund sources (mig 20260921010000)

**Ask**: user "如果已经确定了的 fund in / fund out percentage, repayment period
等等，我要如何更改？然后要重新算…" → the old Amend re-stated the whole deal
from day one. Approved design A (versioned terms, one record), with three
decisions: (1) months already paid: nothing recorded moves — PVs, repayment
rows, GL stay; only what each month is DUE is recomputed and compared with
what was paid; (2) interest from the effective month X = **principal still
owed at the start of X (actual repaid) × new rate**, flat for the segment;
principal/month = that base ÷ remaining months (blank = keep the old end
month); compound: balance keeps rolling, rate switches at X; (3) 差价 lives
mainly on the Company Statement.

**DB** (`supabase/migrations/20260921010000_terms_effective_from.sql`, applied
live in two steps): `treasury_terms_history` (record_kind/record_id,
valid_from/valid_to month-starts, rate, months, compound, was_effective_from,
was_maturity_date, reason, created_by; RLS select = treasury scope, writes
only via RPC); `loans.terms_effective_from` + `fund_sources.terms_effective_from`
(null = unchanged since day one). RPCs (Principal-only, SECURITY DEFINER):
`amend_loan_from(id, effective_from, rate, remaining_months, compound, reason)`,
`amend_fund_source_from(...)` — file the current segment into history up to
X−1, record columns become the new terms; a blank remaining_months is
computed to keep the old end month; X must be later than the current
segment's first installment month; fund-source maturity_date follows only if
it already had one. `revert_terms_change(kind, id)` pops the latest history
row back (exact restore incl. maturity). `terms_months_between(a,b)` helper.
Round-trip tested live on Lim Wei Liang's 60k (two changes → revert ×2 →
identical), `database.types.ts` hand-patched.

**Engine** `lib/treasury-terms.ts` (tests: 10): `buildTermsSegments(terms,
principalPaidByMonth)` → ordered `TermsSegment[]` {fromYM, toYM, rate,
compounding, months, base, principalPerMonth, interestPerMonth,
scheduledEndYM, changed, reason}; segment 0 = legacy reading (all existing
figures unchanged when nothing changed); `segmentAt / currentSegment /
rateAt / segmentRemainingPeriods / principalPaidSince`; `buildSegmentedAging`
(FIFO like loan-aging, per-month installment); `compareTermsChange /
allTermsChanges` → old plan carried on vs new, month rows with paid +
shortfall for months ≤ now, totals. `resolveFirstDueYM` moved here
(loan-monitor re-exports). `compoundInterestState.monthlyRate` may be a
per-month lookup. Loader side `lib/treasury-terms-data.ts`:
`fetchTermsHistory`, `principalPaidByMonth`, `paidByMonthByType`,
`termsForLoan / termsForFundSource` (principal types: loans 'principal';
fund sources 'principal' + 'netting').

**Wired in**: `counterparty-statement(-data)` (PositionInput.segments /
principalByMonth / paidByMonth → PositionRow.termsFrom / termsBase /
termsChanges; monthly figures, remaining, payoff from the current segment),
`loan-monitor` (aging + "terms from X" tag), `repayment-schedule/page`
(loans + fund sources incl. min-pay due and compounding rate lookups),
`listPayableFundSources` (monthly_principal/interest/remaining/total_periods
from the current segment + `terms_from` → the repayment PV form's defaults),
both detail pages' monthly-interest line.

**UI**: Amend forms (fund-in edit, fund-out edit) now have 生效方式 — 从某月起
生效 (default; 生效月 default next month, 剩余期数 blank = keep end month,
原因) vs 整条重算 (the old whole-life amend, now labelled 改错用) → actions
`amendFundSourceFrom` / `amendLoanFrom` / `revertTermsChange` (fund-in
actions.ts, fund-out actions.ts). `components/treasury/TermsTimeline` on both
detail pages (segments list, each change as <details> with
`TermsChangeSummary` + `TermsChangeTable`, Principal's 撤销最近一次变更 via
`RevertTermsButton`). Company Statement: "Terms from X" tag on the position
and a collapsible 差价 row per change (old/new principal + interest per month,
Δ, paid, shortfall, totals). Schedule / Loan Monitor rows carry "· terms
from X".

**Flat → compound (same day, user's live example)**: `compoundRoll(segments,
{principal, startYM, currentYM, paymentsByMonth})` — a deal that compounded
from day one rolls from the record month on the original principal (legacy);
a FLAT deal turned compounding at X rolls from X on the principal still owed
then (the flat months paid their interest, nothing to capitalise). Wired
into the statement and the schedule (loans + fund sources). Worked example
in `treasury-terms.test.ts`: Lim Wei Liang 60k, 4% compound from 2026-01 on
51,000 → 59,118.53 at the start of Sep-26, Sep interest 2,364.74.

**Liang 60k data fixes (same day, user: "要直接更改哦，不是开 JE 补")**: the
August PV HV-PV-202608-0276 (1,300, 10 Aug) had been keyed WITHOUT the
repayment link, so the fund source showed August unpaid (43,000) — linked
it (fund_source_id + breakdown 1,000/300), inserted the two
fund_source_repayments rows (payment_voucher_id set) → outstanding 42,000.
Its JE and the June (0019 / JE-202606-0059) + July (0108 / JE-202607-0253)
JEs had the whole 1,300 on 4055: split in place to 4055 1,000 + a new 6000
300 line each, payment_voucher_sources updated in step (pvs_sum_matches
trigger paused for the two statements), "[split 2026-09-21 …]" note on each
JE. No reclass JVs, per the user. The 4%-compound-from-January question was
answered on paper only (Jan-1 base 51,000 for both the Cont loan and the
Liang fund-in; user has not asked to apply it).

**PENDING — do NOT apply until the user says so (user 2026-09-21 "记起来先，
别做先")**: the Liang 60k mirror pair is to be changed from 2026-01, both
sides, different methods. Fund in [BI#7] 4cb7ee6d: 10% p.a. flat on the
51,000 owed at Jan-1 → 425/month, principal 1,000 × 51 remaining (ends
2030-03), Jan–Sep paid at 300 → 1,125 short, +6,375 interest over the life.
Fund out [LO#7] e6569127 (The Cont): 4%/month COMPOUND on 51,000 →
monthly-roll (method A) 57,818.53 at Sep-1; the user asked for "daily
calculation" — B (4%×12/365 daily, capitalised monthly, payments on their
dates) 57,395.18 or C (4%/30 daily) 57,663.47 — the engine only does A, so
B/C means a daily-rest engine first. Open: 51 months + exact-425 precision
(rate column is 6-dp monthly → 424.98), and A/B/C. Both tables were shown
to the user; also in memory `liang-cont-terms-change-pending`.

**2026-09-22 — 「从某月起改成无固定期限」 (boss-approved, mig
20260922010000)**: interest convention confirmed = A (flat interest stays
base × rate on the principal owed at X, however much principal is repaid
later — no "reducing balance" mode needed). RPCs gain `p_no_fixed_term`:
fund_sources → lock_in_months null + maturity null; loans keep tenure_months
(NOT NULL, 1–120) and get the ' · 未定还款(自 X 起)' marker appended to
repayment_terms (isLoanUnscheduled), previous text saved on the history row
(`was_repayment_terms`) and restored by revert. amend_loan_from now refuses a
rate below base_rate (loans CHECK risk_premium ≥ 0). Engine: the "months
null = inherit old end" rule is GONE (the RPC materialises the inherited
count) — months null is an open-ended segment: principalPerMonth 0,
interestPerMonth = base × rate, toYM null; `termsForLoan` reads
repayment_terms for 未定. Forms: 改成无固定期限 checkbox (disables 剩余期数);
actions pass the flag. Schedule's no-term loan rows use the segment's
interest. Round-trip tested live on Lim Wei Siang's 90k (no-term → revert).
The Liang 60k pair is STILL untouched — the user will confirm rate/period
before any 从一月起 change is applied.

**Gates**: vitest 2560 green, next build green. Not verified in the browser
(no login) — user to try one change and look at fund-in detail + statement.

## SESSION 2026-09-18 — Cash Flow report rework: parent-code layouts · category rows · navy/gold skin

**Why**: user "那个 cash flow report 我想要优化，我发现分到太散了。你看 fund sources
payable 分两边, loan receivable 也是, 然后这个 report 整体的颜色或 ui 我想优化".
Root cause: `report_layouts` cash_flow_in / cash_flow_out listed only the LEAVES
dragged on 2026-07-30 (3053/3054 · 4202/4051/4052 …); every other debtor / fund
source fell into 其他, so the same COA parent printed twice. Mock-up went four
rounds (Artifact https://claude.ai/artifact/67cus1g9tr1YoQ1vCq6sYb): v2 no
小计 rows ("L1 会看到两个 total 看了会很乱"), v3 gold/navy ("类似这个黄蓝…黄色为
主"), v3.1 no zebra ("一行一个 colour 看了会 misleading"), v3.2 pinned light
("整体太暗了") → user: "黄色的颜色不是很好看" then "以蓝色为主的不错" = **navy-led,
gold only as accent**; zero rows: "没有 amount 的就直接别显示" (no toggle).

**Engine**
- `lib/report-layouts.ts`: `placeLeavesInLayout(leafCodes, categories,
  ancestorsNearestFirst)` + `ancestorChain`. A category may list COA PARENT
  codes: explicit leaf wins → nearest listed ancestor → 其他; first category to
  list a code owns it. Tests `report-layouts.test.ts`.
- `lib/cash-flow-sections.ts` (statement): placement as above; leaves with no
  amount in current AND previous are dropped; every layout section is
  `headed` (new `ReportSection.headed`) — the section row carries the totals;
  a section that is exactly ONE COA root named like it (`sameName`) gets
  `root` = that node and `nodes` = root.children so the name isn't printed
  twice; a lone leaf merges the same way (its txns stay reachable). No-layout
  fallback unchanged (unheaded). `defaultSideLayout` now seeds the PARENT code
  per top-level root.
- `lib/cash-flow-custom.ts` (matrix): `buildSideMatrixRows` same rules; emits
  `kind: 'category'` rows (new `MatrixRow` kind: depth 0, `isParent`, totals,
  sits ABOVE its accounts) and no "— 小计" rows; merged root → the category row
  carries `code`; all-zero accounts dropped, categories left empty vanish;
  side-total row unchanged. `categoryRows()` helper.
- `lib/gl-report-blocks.ts`: `cashFlowBlocks` adds no 小计 summary for headed
  sections (legacy unheaded still get one); `flattenGlReport` (xlsx/pdf)
  prints a headed section as ONE totals row (`code label` when merged) with
  its accounts indented a step — screen and file keep the same shape.
- DB mig `20260918010000_cash_flow_layout_parent_codes`: cash_flow_in/out
  `grp-3020` → `["3020"]`, `grp-4000` → `["4000"]`; other categories untouched
  (Salary & Statutory keeps its explicit 4070–4074 — 4075 Accrual-Others was
  never in it, not my call to add). Applied live BEFORE the deploy, so for a
  few minutes the old code saw an unknown leaf code and showed those under
  其他 — resolved by the deploy.

**Views**
- `GlReportView` gains `skin?: 'cf'` (cash-flow/page passes it). Headed
  sections render as `row-cat` band rows: a merged root is the node row itself
  (its own group/txn toggles), a plain headed section is label + totals + a
  fold toggle keyed `sect:<section.key>`; accounts sit at depth 1. L1 folds
  sections too (`collectFoldKeys`), search force-opens through the `sect:`
  key, and the cf skin opens folded (L1) by default.
- `MonthlyMatrix` gains `variant?: 'cf'` + `nowKey` (monthly-cash-flow/page
  passes `period`): category rows always visible + collapsible, opens at L1,
  ONE navy header row (no RM sub-row — unit is in the page subtitle), zero →
  dash, "now" column wash, flat rows (no zebra). Search treats categories as
  ancestors only. Default variant (Monthly P&L / R&P) unchanged apart from the
  widened `kind` union.
- `globals.css`: `.cf-report` token set (light + dark): navy header and
  headline bands (流入/流出合计, net change, closing) with gold figures,
  pale-navy category rows with a gold inset rule (`row-cat` / `cf-cat`),
  pale-gold `cf-now` column, `.cf-pill-on`. Scoped — the rest of the portal
  keeps Walnut / Harbour (DESIGN.md's "one signal colour" rule is deliberately
  bent here, at the user's request, for this report only). A default
  `gl-report tr.row-cat` band exists so headed sections never render unstyled.
- Layout editor (`ReportLayoutEditor` + cash-flow/layout/page): **▣ 整组** group
  chips — every COA parent present on the side (with its leaf count) in its
  own palette; dropping one lists the PARENT code; leaves a category holds
  through a group show as dashed ghost chips (draggable → explicit override).
  Saved codes with no movement this month are now KEPT on save (they were
  silently dropped — the editor only lists this month's active accounts).
  monthly-pnl layout page passes no groups → behaves as before.

**Gates**: `report-layouts.test.ts` (6 new), cash-flow-sections (+5),
cash-flow-custom (+5, first tests for `buildSideMatrixRows`); full vitest
1908 green; `next build` green.

**Skin across all Reports (second commit, same day)**: user "report 那边的颜色
等等弄到和 cash flow 的一样". `reports/layout.tsx` wraps the section in
`.cf-scope` (tokens live on `.cf-report, .cf-scope`); globals.css restyles
every `ledger-table` under it (navy header + gold rule, flat white rows, no
zebra, navy ink) and the Company Statement's plain table opts in with
`cf-plain`. `GlReportView` `skin` now defaults to 'cf' ('ledger' = old look);
folds to L1 only when a headed (layout) section exists, so P&L / BS / R&P still
open fully; unheaded section eyebrows (`row-sect`) get the pale band + gold
rule. `MonthlyMatrix` `variant` defaults to 'cf' with `nowKey` from all three
monthly pages; opens at L1 only when category rows exist; the RM / % header
sub-row stays (navy) when a % column is shown (Monthly P&L), with the gold rule
under the last header row only.

**Kingsley 100,000 under Equity (data fix, same day)**: user asked what the
100,000 in "Equity & Internal Funds → HV Operating Fund" was. PV
HV-PV-202608-0309 (2026-08-07, HLB → Kingsley, "Return to Kingsley Through
Houzs") was a fund-source repayment (fund_source_id set, breakdown principal
100,000, fund_source_repayments row written, source marked repaid) but its
voucher_type was `expense` and the source row's account was 1010 HV Operating
Fund, so the debit leg hit equity instead of 4058. Per user ("直接改我做的 PV
挂 Kingsley 那边") ran `reassign_voucher_gl_account(pv, '1010', '4058', …)` as
the Finance user (set_config jwt claims) — JE-202608-0540 now Dr 4058 / Cr
3000, note appended, payment_voucher_sources synced; 4058 nets to 0. Note for
later: the `loan_repayment` voucher type forces the debit to '4000' (the
PARENT), not the fund source's own `account_code` — worth fixing if the user
asks; also offered to auto-fill the source row's account from the fund source
when the repay box is ticked.

**Money-out 其他 filed (mig 20260918020000)**: the 2026-07-30 layout only
listed seven expense leaves, so a dozen accounts sat in 其他. User: "费用类没
问题 / Computer-equipment 算 Capex / Account payable 是啥？/ 其他的你跟着排".
Now: General Expense + 9088 (group) 9089 9092 9096 9097 9000 4050 (4050 = the
imported supplier-bill payments YSL 2,250.60 + Feb electricity 828.40 via
HOUZS Century — told the user, filed under General Expense, easy to move);
Salary & Statutory + 4075; NEW Interest Expense = 6000 + 4060 (group); NEW
Capex = 2000; 1900 Opening Balance Clearing stays in 其他.

**4050 payments re-pointed (data fix, user: "ysl 的是 secretary fees, KL
gateway 的就是电费, 就挂去相对应的费用")**: manual_jv PV-000005 (3/6, YSL
2,250.60) Dr 4050 → 9097 — no PI ever booked it, so the expense was missing
from the P&L until now; PV-000038 (4/14, KL Gateway Feb electricity via
HOUZS Century, 828.40) Dr 4050 → 9091 and the Feb accrual PI-000004 (Dr 9091
/ Cr 4050) DELETED via delete_manual_journal_voucher, so the expense is booked
once, on payment (Feb → Apr). Both JEs carry a "[GL reassigned …]" note. 4050
now holds only PI-000001 (3/29 office rental Cr 3,000) with no payment against
it — told the user, not touched.

**Director-interest legs re-pointed (data fix, user: "改，两张都换去 6000")**:
HV-PV-202609-0339 (Lim Wei Siang, interest 450) and HV-PV-202609-0340 (Lim
Wei Liang, interest 300), both 2026-09-08, had their interest source row keyed
to 5027 Loan Interest (an INCOME account) — the Cash Flow showed 750 of money
out under "Interest Income - Loans". `reassign_voucher_gl_account(pv, '5027',
'6000', …)` on both (JE-202609-0642 / 0644 now Dr 6000, sources synced). Same
root cause as the Kingsley one: the repayment form's source-row account was
free-typed.

**Repayment PV source rows now follow the split (user: "做，自动带出账户")**:
`lib/repayment-source-rows.ts` `buildRepaymentSourceRows(prev, split,
fundSourceAccount, hasAccount)` — one row per non-zero component: principal →
the fund source's `account_code` (4054 / 4058 …), interest → 6000, penalty →
9096; pool defaults venture_pool; a row whose account Finance picked by hand
(`autoAccount: false`) keeps it through later split edits, auto ones follow
the source. `listPayableFundSources` now returns `account_code`;
`NewPaymentForm` rebuilds the rows on fund-source / split change, the account
picker marks a manual pick, rows show 本金 / 利息 / 罚金 + "账户自动带出".
The form always submits voucher_type `expense`, so the approval RPC honours
the row accounts (the `loan_repayment` type would force '4000' — unused).
Tests `repayment-source-rows.test.ts`.
Edit form too (user: "编辑草稿的表单也做一样的"): `seedRepaymentSourceRows`
gives a repayment draft's SAVED rows their roles by matching amounts to the
(locked) breakdown — a saved account is kept and flagged manual unless it
already equals the default; a lump / mismatched row set is rebuilt with the
defaults. `payments/[id]/edit/page.tsx` passes `fundSourceAccount`
(fund_sources.account_code); the form shows the role labels and a
**按拆分重带账户** button that forces every row back to its default.
Tests in `EditPaymentForm.test.tsx` (+2).

**Open / not done**: month columns stay Accumulated + latest-first (mock-up
drew them chronological; user never raised it).

## SESSION 2026-09-14/15 — cancel-loan overload fix · 作废已开发票 · water RM36→39 amend

**Cancel pending loan crashed (commit ca40c0bb, mig 20260914010000)**: TWO
overloads of `cancel_loan_and_approval` — mig 17 `(uuid, text DEFAULT NULL)`,
mig 107 `(uuid)` (meant to extend, declared a sibling). The app's one-arg call
was ambiguous (42725) → error boundary. Merged into ONE `(uuid, text DEFAULT
NULL)` with mig 107's paired-PV void + reason + fail-loud check + a guard
that raises if >1 overload ever exists. User had two duplicate Carres 30,000
pending loans from the failed attempt — left for them to cancel.

**作废已开发票 · void issued invoice (commit 2dd0b8cf, migs 20260915010000 +
020000)**: new `invoice_status` value `voided`; RPC `void_issued_invoice(id,
reason)` reverses the invoice's active JEs (mirror + is_reversed pairs — same
mechanism as void PV, so every report drops them), status → voided, NUMBER
KEPT (mint_invoice_no keeps counting it — no reuse). Refuses: non-issued, any
non-voided receipt, settlement_voucher_id set, any non-voided CN, locked
period. Writes access_log 'void'. UI in InvoicesList: per-row 作废 link +
bulk 作废所选 on the existing checkboxes (checkbox now also enables for
voidable dept_pool rows), reason modal, struck-through pill. Voided excluded
from: BillingView period total, statements export, MarketingPnlView sums,
allocator live-batch checks (assertTxnNotBilled + generate + page → the
allocation UNLOCKS). Types patched by hand (enum + RPC) — a full regen flips
nullable RPC args the other session's hr-costing/payment code passes as null.

**Data ops (user: water was keyed RM36, should be RM39)**:
- HV-INV-202609-0021..0027 (RM3 top-ups, ALC-202609-005) VOIDED via the RPC
  as finance; ALC-005 + details deleted.
- HV-INV-202609-0014..0020 AMENDED IN PLACE (user chose to keep numbers,
  PDFs not sent): water line recomputed on the allocator's own rule
  round2(39 × fte/48) — 2990 1.53 / CAR 7.56 / DC 6.11 / HK 0.24 / HC 6.13 /
  CONTS 6.92 / Marketing 9.75 (Σ38.24, own 0.76); line text RM 36.00→39.00;
  base/total bumped; ONE supplementary JE per invoice (Dr 3030 / Cr 9091
  delta, corporate; Marketing also gets the inter-billing mirror Dr 9091 /
  Cr 3030, marketing) — originals untouched. ALC-202609-003 header 36→39 and
  details recomputed. Verified: TB active net 0.00; each subsidiary invoice
  total = its active 3030 debits; totals = Σ lines.
- RowForm.test.tsx flaked once under parallel load (other session's
  component), 4/4 in isolation and 1892/1892 on rerun.

**Delete PV attachment (commit fcfbfedb, mig 20260915030000)**: user asked
whether attachment photos could be "withdraw 回下来" — download existed,
delete did not. Now Finance/Principal can delete while the voucher is
draft/pending_approval (same window as upload; approved/paid = evidence,
locked). `delete_voucher_attachment(id)` RPC (SECURITY DEFINER — table RLS is
pa_no_delete) deletes the row + access_log, returns storage_path; new
storage.objects DELETE policy "Finance can delete draft-voucher attachments"
(bucket payment-attachments, has_scope treasury, no row references the path,
folder[1] = a draft/pending voucher id) lets the client `.remove()` the object.
AttachmentList gets `canDelete` (two-click arm/confirm); only the PV detail
page passes it. Tested as finance in a rolled-back tx: paid-PV refused,
pending-PV deleted.

**Registry billing modes on edit (commit 72689e52)**: saving the edit modal on
HV-INV-202609-0028 (revenue_department_attribution, HC, 282,580.12, user's own
draft) hit the Server Components error page. `updateDraftInvoiceFull`,
`updateDraftInvoice`, `createMultiLineInvoice` validated billing_mode against
the hardcoded CREATE_INVOICE_MODES only; `createManualInvoice` had the
`primedModeToSegment()` fallback but that store is only primed by page
renders — a cold server action sees it empty. New
`assertBillingModeSupported(supabase, mode)`: built-ins → else
`primeDeptRegistryFromDb` → else reject. All four paths use it. THIRD instance
of the "hardcoded dept list misses a dynamic dept" disease (IT in submit RPC,
IT in daily-bank totals, now registry modes in invoice edit) — when touching
anything that enumerates departments/segments/modes, check the registry.

**Payroll PVs collapsed in /payments (commit 2dbdb916)**: user "hr 的 payroll
voucher 我不想要显示这么多" → option B (fold, not hide). VoucherLedger tags
reference_type='payroll_disbursement' rows with `batchKey` = description lead
phrase before " — " ("Payroll disbursement Aug 2026" / "Director salary Aug
2026"); VouchersTable groups them into one line per batch ABOVE the main
table (count · status breakdown · total · latest date, ▸/▾ expand → nested
VouchersTable of members). Filters still apply per voucher server-side;
`collapseBatches={!qFilter}` keeps rows flat during a text search. Export
route untouched (still one row per voucher). Forward-looking: HR Payment page
already offers "Generate by Department" (one PV per dept, other session) — the
user was told next month's volume drops there.

**防盗墙 DECIDED → Finance owns the send-back (commit c8a51253, mig
20260915040000)**: user "把权限放在 finance 这边". `reopen_payroll_run` role
gate hr → finance/principal (body unchanged: cancels submitted request,
reverses staff accruals via reverse_staff_payroll_accruals, blocks once a PV
exists). Finance UI: `SendBackButton` ("打回 HR 重做", two-click) on each
UNFUNDED staff request card in /payments/payroll-requests (director requests
are run-less → no button); action `sendBackPayrollRun(period)` in
payroll-requests/actions.ts. HR payroll page: Reopen button replaced by a
notice pointing to Finance. `ReopenPayrollButton.tsx` + hr-costing
`reopenPayroll` action left in place, unused (other session's files). Submit
itself still lands 'approved' with no Principal gate (方案乙 NOT chosen).

**Jul-2026 director round re-tagged (commit cb895a36, mig 20260915050000)**:
user "这个不是做了吗?" — Sept was, Aug wasn't; now both. JE-202608-0441
(same-bank staging) + 0464..0467 (payouts) director → hr, access_log
`mig_20260915050000`; `LEGACY_DIRECTOR_GL_ROUNDS` carve-out removed from the
Cash Flow bridge. August Director cash flow now −65,309.67 (bridged drain,
= pool) instead of −43,135.67 net pay. Director GL on bank accounts Aug/Sep
is receipts-only now. TB active net 0.00.

**Reports 单月｜逐月 toggle (commit 70835a6a)**: user "把一个月一个月的和
monthly 的放在一起". `reports/_components/ReportViewToggle.tsx` (server, Links)
mounted under the page-head of all six pages (income-statement ↔ monthly-pnl,
cash-flow ↔ monthly-cash-flow, receipt-payment ↔ monthly-receipt-payment),
carrying `period` + `segment`. Sidebar: the three Monthly * rows removed;
`NavItem.alsoPaths` added so the single entry lights up on the monthly route.
Routes, exports and `/layout` sub-routes untouched. Verified after the six
insertions: 0014–0020 amend etc. unaffected; tsc/1892 tests/build pass.

**Fund Summary + Claims Report removed from menu/index (commit 13039d1b)**: user
"都没有什么用". Sidebar rows + /reports cards gone; routes kept, nothing else
links them.

**Open (user-decided, not built)**: Finance cannot invite users — `team_invite`
is Principal-only by design (other session, "an account is access to the money
pages"). User said leave it (除了第二).

## SESSION 2026-09-10/11 — Venture Pool void filter · director payout segment → hr

**Void pairs in Venture Pool gross (commit 824597a)**: /venture-pool, /dept-pool
Venture row, fund-summary page+export read corporate/treasury bank lines with
NO is_reversed filter — balances fine (pairs net), but gross In/Out, the
12-month trend and the recent-lines list counted both legs (Jul ~136k, Aug
~87k inflated each side). All four now `.eq('journal_entries.is_reversed',
false)`.

**Director payout segment (commit 6f51519, mig 20260911010000)** — user's
Daily Bank question "director alliance 为什么 negative 那么多 / hr HLBB negative
/ alliance positive". Root cause: since 2026-08-07 director funding is full
custody on the POOL side (dept_pool_director expense_out → dept_pool_hr np_in,
payout PVs source_pool=dept_pool_hr) and the Sept staging JE is hr-tagged, but
`derive_journal_segment` still returned 'director' for director payouts (rule
from mig 20260720140000, premise "directors spend their own staged cash" — no
longer true). So Alliance: +64,976.20 in HR's column, −42,802.05 in Director's
→ Director (41,879.58); today-fold-in plugs the difference into HLB (Director
+111,431.26 / HR (46,887.83)). Totals were always right (= pool balances).
- Fix: both payout scopes → 'hr'. JE-202609-0636..0639 re-tagged in place
  (Dr 4070/Cr 3010, balance-sheet only) + access_log row `mig_20260911010000`.
  Alliance Director now 922.47 (old residue), HR 35,474.95.
- Cash Flow custody bridge (lib/inter-billing-cash-flow.ts) fundRows now ALSO
  matches 'PV HV-PV-%: Director salary bank transfer%' so Director's cash-out
  is its bridged drain (−64,976.20 Sept) like every staff dept; HR nets to the
  custody remainder (ties to dept_pool_hr 31,389.17).
- **Legacy carve-out**: Jul-2026 director round HV-PV-202608-0255 is custody on
  the pool side but its GL (JE-202608-0441 staging same-bank + 0464..0467
  payouts from HLB) is still director-tagged. Excluded from bridge pairing via
  `LEGACY_DIRECTOR_GL_ROUNDS`. Re-tagging it would move August Director cash
  flow from −43,135.67 (net pay) to −65,309.67 (full employer cost, = pool) —
  arguably more correct but changes a closed month → NOT done, user to decide.
  Jun-2026 rounds (PV 0184/0185) are pre-custody, no park, untouched.
- ⚠ **Cross-session**: mig 20260910151626 (other session, "payment PV by
  department") rewrote derive_journal_segment the same day keeping
  'directors → director'. My mig re-issues the whole function with hr. If that
  session regenerates it again, keep the hr branches. Only dept_manager live is
  Marketing — no Director manager loses JE visibility.
- Verified: tsc ✓, 1204 tests ✓, build ✓, deploy Ready.

## SESSION 2026-09-04 (night) — Daily Bank row-total bug (client-blind dynamic columns)

User screenshot: HLB Available row TOTAL footed 80,824.49 while the columns
summed 75,982.96 — IT's (4,841.53) rendered in its cell but was missing from
the row total. Cause: DailyBankView (client) called lib sumAmounts, whose
EXTRA_DB_COLUMNS registry is set server-side only (empty in the browser), so
row totals ignored every dynamic dept column. Fixed (commit cd152c3): view now
sums over the payload `columns` (same source the cells render from) via local
sumCols. PDF export route unaffected (server-side, registry set by
fetchDailyBank in-request). Bottom Total available row was always right
(server-computed). Same "IT missing from a hardcoded/stale list" disease as
the submit RPC — when touching daily-bank code, keep client math on the
payload columns. Also verified during diagnosis: user generated both payroll
PVs 10:36 today (HV-PV-202609-0332 staff 109,770.21 incl. IT / 0333 director
64,976.20, both pending Principal, from HLB); requests both pv_generated;
today's receipts 99,422.12 legit.

## SESSION 2026-09-04 (evening) — 对数补差 reconcile & top-up feature

User chose "make it a feature" over one-off SQL for the Aug under-billing
(497.39 from the DO correction). Commit 16cac7c. On /billing, new 对数补差
button → modal compares live get_staff_billing_allocation vs the period's
ISSUED/PAID payroll_consolidated subsidiary invoices, per company per segment:
- Under-billed (has issued invoice + positive delta) → one-click DRAFT
  adjustment invoice per company, SAME consolidated format (per-segment lines,
  category auto-reused from the originals — refuses if not exactly one distinct
  category), description marker '· adjustment', dated period-end. Review+issue
  via the normal flow. Idempotent (replaces unissued adjustment drafts).
- Over-billed segments → report-only (consolidated invoices take no CN).
- Company with NO issued invoice → flagged "整张未开", excluded (use the normal
  generator).
- lib/payroll-billing-delta.ts computeBillingDeltas + 6 vitest cases.
- Deliberately NOT touching the legacy OPEX DeptCostCards: they only count
  old per-dept billing modes, so they say "no invoice yet" even when
  consolidated invoices exist — pre-existing display quirk, user knows; offered
  a fix, not yet requested.
- Aug top-ups NOT yet created — the user will click the new button themselves
  (2990 +186.50 / CAR +186.50 / HC +124.39 expected; CONTS/HK 对上).
- Fund-request refresh question answered: reopen auto-cancels the submitted
  request, re-submit files a fresh one from live data (now IT-inclusive) —
  fully automatic.
- **Reopen auto-reverse SHIPPED** (user "要做", mig 20260904030000): new
  `reverse_staff_payroll_accruals(period, user)` (SECURITY DEFINER, hr/finance/
  principal) posts mirror JEs + flags is_reversed pairs for the period's active
  STAFF accruals (segment <> 'director' — director flow untouched);
  `reopen_payroll_run` calls it before flipping the run, so reopen → clean
  slate → re-submit posts fresh accruals. Whole reopen rolls back if the
  reversal fails (e.g. locked period). Zero TS changes (RPC signature
  unchanged). Tested against live Aug data in a rolled-back transaction:
  5 reversed / director untouched / pairs cross-linked, then live state
  verified intact (5 staff active Σ109,770.21 + director). Reports safe by
  construction: is_reversed pairs are the same mechanism voidRepayment and
  today's manual cleanup use — every GL report already drops them.
  防盗墙 remaining piece = ONLY the principal-only reopen gate (方案甲) or the
  full submit-approval gate (方案乙) — still pending the user's talk with
  Principal.

## SESSION 2026-09-04 (later) — double-accrual postmortem + IT in funding request

HR reopened + re-uploaded Aug payroll (08:13) and re-submitted (08:17): marketing
54,740.63→56,980.63 (+2,240), director_office 6,466.25→7,036.05 (+569.80),
finance/hr/it unchanged. The submit hook then DOUBLE-POSTED all five staff
accruals (JE-202608-0585..0589 on top of backfilled 0580..0584). Commit 1cf6b71,
mig 20260904020000, deployed. Root causes + fixes:

- **RLS-blind idempotency check (my bug)**: postPayrollAccrualJVs read
  journal_entries with the CALLER's client; je_select RLS wants treasury scope,
  so the submitting HR user saw ZERO existing JVs → posted everything again.
  Fixed: check now calls `get_payroll_accrual_totals(p_period)` (SECURITY
  DEFINER, roles hr/finance/principal, segment::text). Verified as HR via
  users-table JWT DO block: sees all 6 rows.
- **Cleanup**: 0580..0584 reversed via mirror JEs 0590..0594
  (post_journal_entry + mark_journal_entry_reversed pairs, dated 2026-08-31).
  Active Aug accruals now exactly: staff 0585..0589 Σ109,770.21 (matches live
  hr_monthly_payroll employer cost) + director 0564 64,976.20.
- **IT missing from funding request**: submit_payroll_to_principal hardcoded 4
  depts; payroll_runs.total_amount (GENERATED) excluded IT, so every staff
  request was short by IT (Aug: 104,928.68 vs true 109,770.21 — July's
  102,118.88 was equally short). Fixed: payroll_runs.it_opex_total column,
  total_amount regenerated to include it, RPC sums IT dept. Live Aug run +
  its submitted request patched to 109,770.21. BillingView hero pre-generation
  total now includes it_opex_total (NO IT DeptCostCard — it_attribution rides
  the registry path, deliberately left out of the legacy tile row).
- Requests self-manage on reopen/resubmit (old ones auto-cancelled) — only
  accruals lacked protection. reopen_payroll_run does NOT touch accrual JVs.
- **防盗墙 pending user decision**: reopen_payroll_run allows role hr OR
  principal — HR can reopen an APPROVED run alone (only a generated PV blocks
  it). Proposed 甲: reopen → principal-only + auto-reverse that period's
  accrual JVs on reopen; 乙: restore principal approval gate on submit (mig 278
  removed it deliberately). Recommended 甲. Invoice deltas from the Aug
  correction (DO +569.80 → 2990 +~188 / CAR +~188 / HC +~125, Σ~501) — user
  will decide separately whether to bill.

## SESSION 2026-09-04 — 最低还息单 (minimum-pay-interest) for fund in/out

User: "关于fund in 和 fund out 我想要set minimum pay interest" → clarified via
questions: meaning = **每月至少要还利息** (principal may wait, the month's
interest must be paid); per-record toggle; shown on repayment-schedule +
who-hasn't-paid-enough tracking + statement note; interest on the ORIGINAL
principal (跟现在 flat 一样), compound 单用余额算; NO recording-time warning.
Commit 232ba87, deployed. Display/tracking only — zero GL impact.

- **DB (mig 20260904010000)**: `loans.min_pay_interest` +
  `fund_sources.min_pay_interest` (boolean default false) + RPCs
  `set_loan_min_pay_interest` / `set_fund_source_min_pay_interest`
  (SECURITY DEFINER, finance/principal gate — mirrors set_*_repayment_start).
  Smoke-tested live as finance via users-table JWT DO block (NOT `profiles` —
  the table here is `users`).
- **lib/treasury-schedule.ts**: `minInterestStatus(due, paidInterest)` →
  {due, paid, shortfall, met} with half-sen tolerance; 6 new vitest cases.
- **/repayment-schedule**: new per-side "Minimum interest" tracking section on
  the scheduled tab (NOT added to hero cash totals). due = flat 原额×月息 /
  compound 余额×月息; paid = the month's interest-type repayments
  (含 penalty/netting, same口径 as 已收行); respects 还款起始月
  (resolveFirstDueYM) so first-month deals aren't chased; settled 单 skipped;
  month-aware (?month=YYYY-MM works). Unmet rows sort first by shortfall.
- **Set/unset**: checkbox on NewLoanForm + NewFundSourceForm (creation flags
  update piggybacks the compound_interest post-create update);
  MinPayInterestToggle on both [id] detail pages (saves on toggle, 旧单可补设).
- **Company statement** (/reports/company-statement + xlsx/pdf export): flagged
  positions carry "Min interest RM X/mo" chip / label bit
  (PositionInput.minPayInterest → PositionRow.minPayInterest).
- Gates: tsc ✓ · vitest 865 ✓ · next build ✓ · deploy Ready.
- NOTE: no 单 is flagged yet — user will tick the ones with this arrangement
  themselves. Don't chase shortfalls proactively (dont-audit-outstanding-debts
  still applies; the tracker exists BECAUSE the user asked for it).

## POLICY 2026-09-03 — HR payroll is POOL-BORNE (like Marketing)

User: "hr payroll 会用自己的pool,和marketing 一样,所以不用bill back,也不会
bill to venture". HR's Aug allocation being empty is DELIBERATE, not a miss.
- OWN_SHARE_SEGMENTS no longer contains 'hr' → the own-share → Venture Office
  invoice excludes HR entirely (Aug preview drops from 17,822.11 to 1,657.46:
  Finance 835.60 + Director Office 821.86; IT own-share 0 this month).
- HR STAYS in PAYROLL_DEPT_TO_SEGMENT so any future subsidiary allocation
  still bills out instead of being silently dropped.
- Funding unchanged: Stage-E already draws each dept's payroll from its own
  pool — HR's pool simply bears the cost with no recovery, like Marketing.
- Aug STAFF accruals: RESOLVED (user "要补记账"). Backfilled via
  post_journal_entry SQL exactly matching buildAccrualLines —
  JE-202608-0580..0584 (director_office 6,466.25 / finance 24,747.35 / hr
  16,164.65 / it 4,841.53 / marketing 54,740.63; Σ 106,960.41 = employer
  cost). And the CAUSE is fixed: submitToFinance (HR direct-submit,
  hr-costing/payroll/actions.ts) now calls postPayrollAccrualJVs itself —
  the Principal-approval hook never fires on that path since mig 278.
  Bonus decode: the RM64,976.20 funding request = DIRECTOR payroll (run_id
  NULL branch); RM102,118.88 = staff run. Both status 'submitted' = waiting
  for FINANCE to generate PVs at /payments/payroll-requests (Stage E), THEN
  Principal approves the PVs.

## SESSION 2026-09-03 (later) — IT segment RENAMED to 'it' + CONTS repayment fix

1. **Segment renamed infotech → it** (user: "segment 不是infotech,而是真的叫
   IT"; mig 20260903020000 APPLIED): ALTER TYPE gl_segment RENAME VALUE +
   billing_mode 'infotech_attribution'→'it_attribution' + departments row.
   RENAME VALUE rewrites stored rows in place, so the two issued Aug
   consolidated invoices' 'infotech' lines followed automatically. TS wiring
   files updated to 'it'; types regenerated. The provision RPC's 3-char slug
   guard was why 'infotech' existed — future 2-char segment names need this
   manual-rename route. NOTE: 'infotech' strings elsewhere in src are the HR
   InfoTech FILE-IMPORT parsers (other session's work) — unrelated, untouched.
2. **CONTS 1-Sep loan repayment corrected** (user keyed interest 4,360,
   actual 3,600): repayments row → 3,600, JE-202609-0004 both legs + total →
   3,600 with audit note, HL bank bumped −760. Principal 90,000 untouched;
   interest never hits venture_pool so nothing else moved. Loan already
   fully_repaid (status unchanged — total was over-recorded, not under).
3. **Re-discovered**: void for RECEIVED loan repayments ALREADY EXISTS
   (2026-08-20, void_loan_repayment RPC — mirror JE + is_reversed, bank
   bump-down, venture_pool VOID counter for principal, repayments row delete,
   fully_repaid un-flip). Button lives on the LOAN DETAIL page
   (/fund-out/[id] repayments list). Told user: 以后自己 void + 重录即可.

## SESSION 2026-09-03 — IT department wired in (user: "接上")

The deferred IT-payroll traps are CLOSED. IT had 1 staff on Aug'26 payroll
(4,841.53 employer cost, allocated 50/50 to 2990 + CAR) and was silently
dropped everywhere. Timing was perfect: Aug consolidated payroll invoices AND
Aug staff accrual JVs had not been generated yet, so NO backfill was needed —
the normal August cycle now includes IT. No earlier months had IT payroll.

1. **Provisioned IT** via provision_full_department('IT', 'infotech') —
   segment_key 'infotech' ('it' rejected, 3-char minimum), billing_mode
   'infotech_attribution', pool equity account **1100**. Registry consumers
   (invoice modes, settle pools, report rails, bridge, daily bank) pick it up
   automatically.
2. **TS hardcodes extended** (the payroll-specific maps registry can't reach):
   staff-allocation.ts PayrollSegment/'OWN_SHARE_SEGMENTS'/PAYROLL_SEGMENT_LABEL
   += infotech/'IT'; billing/actions.ts PAYROLL_DEPT_TO_SEGMENT (IT→infotech) +
   PAYROLL_DEPT_ORDER + OWN_SHARE_ORDER; payroll-accrual.ts SEGMENT_BY_DEPT +
   SEGMENT_LABEL (this was the worst trap — IT salary never even reached the
   GL accrual); approvals/actions.ts DEPT_POOL_GL IT→'1100'.
3. **get_payroll_breakdown_by_pool registry-driven** (mig 20260903010000,
   APPLIED): was WHERE name IN (HR/Finance/Director Office/Marketing); now every
   non-internal dept with segment_key (except director), pool_key =
   'dept_pool_'||segment_key; legacy four always listed, new depts appear when
   they have payroll. get_staff_own_share_allocation needed NO change (no dept
   filter — the TS OWN_SHARE_SEGMENTS gate is the filter).
4. database.types.ts regenerated (gl_segment now has 'infotech' + the other
   session's commission tables). Also: next_account_code gap-fill fix earlier
   today (mig 20260901010000) — 5999 at range top made revenue "exhausted";
   user's new account 5000 Design Income created under 5030.
5. Aug expectations when the user runs the cycle: staff accrual posts an
   'infotech' JV; consolidated invoices to 2990 (2,420.77) + CAR (2,420.77)
   carry IT lines; own-share = 0 for Aug (fully allocated); Stage-E funding
   lists dept_pool_infotech (pool starts 0 → 预支 negative allowed at approval).

## SESSION 2026-08-29 — reassign-GL day + report ghost fixes + sidebar

(Items 8–10 of the 2026-08-24 section below actually happened TODAY 08-29 —
the Rygis 9,500 investigation, invoice-based Monthly R&P, and both reassign
features. Additional 08-29 work:)

1. **Report ghost rows fixed, two layers** (user's July Cash Flow showed
   August loan repayments): GlReportView rows were keyed by bare account code
   while the cash-flow grammar renders the SAME account in both 实收 and 支出
   — duplicate React keys froze stale rows across period navigation and made
   the first copy un-expandable. Fix 1: rows keyed `${section.key}:${code}`.
   Fix 2: the section keys ALSO collided ('other'/'all'/layout ids exist on
   both sides) — buildCashFlowSideSections now takes sideKey ('in'/'out') and
   prefixes every section key. MonthlyMatrix/Monthly P&L already namespaced;
   P&L/BS single-section-per-account — audited clean.
2. **Invoice detail modal shows everything** ("点了单号显示的资料太少了"):
   line items w/ category labels, every receipt (direct + batch settlement
   voucher resolved via settlement_voucher_id, tagged 合并收据), CNs with
   status/reason, freetext contact, paid/outstanding summary. BillingView
   passes receiptsByInvoice/cnDetailByInvoice.
3. **HV-INV-202608-0007 GL corrected 5011→9095** via the new invoice
   reassign (audit note stamped). Cause: dept_pool bulk-issue before ~17 Aug
   ignored line categories and fell back to revenue — 0022/0029 (issued
   17 Aug) post per-line correctly. If more pre-fix dept_pool invoices
   surface on 5011, same one-click fix.
4. **0022/0029 SETTLED by user same day** (HV-OR-202608-0317/0318, netting):
   Marketing pool inter_billing_out −1,760.03, Venture Office np_in +,
   venture_pool pass-through, bank untouched, invoices paid. VERIFIED — and
   note the invariant confirmed twice (0007 too): dept_pool netting settles
   post NO JE (both GL sides were already posted at issue; settle = pools +
   status only), and status shows 'paid' not 'paid_via_netting' (the
   mark_invoice_paid trigger flips first — cosmetic). The 91.26 Notion 1/3
   still OPEN on 3059 Due-from-DC (reclassed there 06-12, never repaid).
5. **Sidebar redesign** (several rounds): desktop rests as a 16px rail,
   expands on hover; 📌 pin persists in localStorage (hv_sidebar_pinned).
   Final palette after espresso/slate/tan/green-dark/cream-dark experiments:
   LIGHT = banker deep green panel (.sidebar-contrast scoped tokens, cream
   text, orange accent); DARK = near-black warm panel as the bottom of a new
   3-level elevation ladder — the whole dark THEME was lifted (paper 33 29 24,
   surface 44 39 32, surface-2 57 51 42, hairline 80 71 57, text brighter)
   because everything previously melted near black. Thin themed scrollbar
   inside the panel. User: "就先这样吧,到时我再调看看" — expect tweaks.
6. Loan-repayment payee fallback (outsource lenders e.g. Kingsley have no
   company/director row; payee hidden in that mode → Create was un-passable);
   Kingsley 100k repayment voucher created OK after fix. Inter-billing
   drill-down rows now append the source dept_pools description;
   GlReportView txn descriptions wrap instead of clipping.

## SESSION 2026-08-24 (evening) — RM1 purge + five gap features + R&P paid-to removal

All local gates passed before push (tsc / vitest 555 / next build). Batch was the
user's "把rm 1, 测试数据清楚 然后这些功能补上":

1. **RM1 Revenue-Department test data purged** (mig 20260824050000, applied via
   execute_sql): the live acceptance-test invoice + its settle voucher, JE lines,
   dept_pools np_in rows, bank −1.00 Hong Leong. Order matters:
   voucher BEFORE its source rows (pvs_enforce_sum_matches_voucher blocks
   source-row deletes while the voucher exists). Registry/department itself KEPT —
   Revenue Department is now a real empty dept.
2. **CN void after approve** (billing/actions.ts `voidCreditNote` + Void button in
   CreditNotesList): claims the CN row → posts reversal JEs (swapped legs via
   postJournalEntry) → mark_journal_entry_reversed flags originals → un-flips
   invoice paid→issued IF settlement_voucher_id is null and receipts < total −
   remaining approved CNs. On JE failure the claim reverts.
3. **dept_manager edit/delete OWN DRAFT invoices** (mig 20260824060000 APPLIED:
   invoices_dept_manager_update/_delete policies = draft + created_by=auth.uid() +
   own segment; my-billing/actions.ts updateDeptInvoice/deleteDeptInvoice;
   DraftInvoiceActions.tsx edit modal on /my-billing, renders only when
   status=draft && created_by=self).
4. **CN lines on monthly statements** (statements/actions.ts): approved CNs
   against the period's invoices insert as line_type 'contra', direction
   'payable', category_code 'credit_note', reference_table 'credit_notes',
   accumulated into total_contra so net = invoice − contra still satisfies
   totals_match_net. No CHECK constraint on category_code — free-form is safe.
5. **Refund flow for PAID invoices**: /billing paid rows get "Refund →" →
   `/payments/new?mode=refund&invoice_id=` (payments/new/page.tsx builds
   refundPreset from non-voided credit PVs; NewPaymentForm prop prefills
   payee/amount/description + banner). Deliberately does NOT set invoice_id on
   the PV and does NOT touch invoice status — money-out only, Finance picks
   pool + GL account, normal PV approval. Column note: invoices freetext party
   is `billable_to_freetext_name` (NOT billable_to / billable_to_name).
6. **Monthly R&P bottom block trimmed THREE times** — final state per user
   ("我要的就是在月尾还没收到的钱在下面就好", confirmed via option pick):
   lib/monthly-rnp.ts returns ONLY 月末未收 AR_OUTSTANDING (running 3030
   balance at each month end) + one depth-1 row per debtor still owing
   (positive accumulated only). Removed across the rounds: 支出对象 paid-to,
   每月开单 AR_BILLED, 每月收回 AR_COLLECTED, 部门总资金 TOTAL_POSITION.
   Do NOT re-add any of these without being asked. Page + export share the lib.
7. **R&P + Monthly R&P Excel/PDF exports** (both new export/route.tsx mirror
   their cash-flow twins; dept_manager allowed — RLS/RPCs scope them; Monthly
   R&P export reuses lib/monthly-rnp so rows are identical to the page).

8. **FIXED: Monthly R&P per-debtor rows ignored collections** (user: "月尾
   rygis private 我记得都蛮准时给的" — Rygis showed 9,500 owing, truly owed 0:
   10,000 billed − 9,500 received − 500 CN). Root cause: settle receipts store
   payee_name '—', so fetchGlRefs.voucherPayees attributed the 3030 credits to
   a phantom party '—' (negative → hidden by the positive-only filter) while
   the debit side kept the debtor. Fix in BOTH paths: fetchGlRefs now resolves
   invoice-LINKED vouchers through the linked invoice's bill-to (short_code →
   dept → freetext) and drops '—' payees; voucher_party_refs RPC (dept_manager
   fallback) mirrored in mig 20260824070000 (APPLIED). Verified by SQL
   simulation: Rygis→0/0, CAR/DC/CONTS/HC unchanged (their receipts carried
   real payee names that shortByName already normalized), Σ parties = 3030
   balance 57,081.53. journal_lines FK is `entry_id`, date is
   `transaction_date` (not journal_entry_id/entry_date).

9. **Monthly R&P 未收 rewritten INVOICE-based** (mig 20260824080000
   rnp_invoice_events, APPLIED). Chain of discovery: user asked about Rygis
   9,500 → attribution fix (item 8) → user pressed "不是还了吗?想清楚" →
   found the REAL structural problem: early lump settle JEs post the whole
   3030 credit under ONE segment (JE-202605-0051: 7-invoice DC batch
   27,147.14 all under 'corporate') while invoice debits sit per-segment, so
   marketing GL-3030 carries ghosts forever (DC 26,589.15 showed outstanding
   though PAID 30 May). Newer settles slice per-segment; old ones don't.
   Also the 91.26 Notion 1/3: NOT repaid — moved 3030→3059 Due-from-DC on
   2026-06-12 (user ruling), 3059 still open; showed on marketing R&P only
   because that reclass JV was segmented treasury. Decision (user approved
   after impact check): report reads invoices, GL untouched. rnp_invoice_events
   RPC (role-scoped like dept_invoice_settlements; finance NULL = consolidated)
   returns dated events: billed +total @ invoice_date, collected −amount @
   receipt payment_date (+ batch-settle residual @ settlement voucher date —
   all 140 paid invoices verified to zero out, no double count), credited
   −amount @ CN approved_at. lib/monthly-rnp.ts consumes events only (no GL
   lines / glRefs / voucher_party_refs — that RPC is now unused by code but
   kept in DB). True marketing 未收 Aug = CAR 21,004.53 only (was showing
   57,081.53 of mostly ghosts). Old wrong-segment settle JEs left AS-IS in GL
   (segment cash slices still off there — separate decision if user ever
   wants GL repair). voucher_party_refs/gl-refs attribution fix (item 8)
   retained — it still improves drill-down party labels elsewhere.

10. **Reassign GL account on approved/paid vouchers** (mig 20260824090000
    reassign_voucher_gl_account, APPLIED; user: "gl account 放错,我希望
    approve 了我还能改"). "改 GL account" button in the voucher detail's
    sources section (finance/principal, status approved/paid): edits the
    posted journal_lines IN PLACE (same JE/amount/date, only non-bank leg's
    account) so P&L + cash-flow drill-downs + TB move together — no
    correcting-JV noise. RPC guards: bank legs + 3030 blocked (3030 = void
    the receipt instead), period-lock check, audit note appended to each JE
    description, payment_voucher_sources account_code/override synced (keeps
    bridge mirror natures right). From-side offered = the voucher's actual
    posted non-bank GL accounts. Also this evening: loan-repayment payee
    falls back to the fund-source label name (outsource lenders like
    Kingsley have no company/director row; payee field is hidden in that
    mode so Create was un-passable); inter-billing drill-down rows append
    the source dept_pools description; GlReportView txn descriptions wrap
    instead of clipping at 24rem. Note: paid DEBIT payments DO have full
    reversal — reversePaidPayment (I mis-said otherwise once).
    **Invoice twin** (mig 20260824100000 reassign_invoice_gl_account,
    APPLIED): "改 account" link on non-draft rows in /billing — edits the
    invoice JEs' income leg in place, old account auto-detects (errors with
    the candidate list on multi-account invoices; then pick in the modal),
    syncs invoices.category_code + invoice_lines (category_code IS a COA
    code), same guards (3030/bank blocked, period lock, audit note).

Still deferred (user said 不理他先 / needs go-ahead): IT-dept payroll 3 traps;
payroll allocation + statements participation for NEW registry depts; Principal
mobile push; Alliance recon PDF template (awaiting sample).

## Partial invoice settlement (2026-08-11, no migration)

User received a PART payment of an issued invoice and Settle refused ("我收到
的钱是invoice 的partial，这样我就按不到settle了"). Model: **an issued
invoice's balance = total_amount − Σ non-voided credit vouchers linked via
payment_vouchers.invoice_id**; it flips to paid only when receipts cover the
full total. Consolidated (multi-invoice) receipts still settle in full and
link via settlement_voucher_id — so 'paid' always means fully collected, and
partial receipts only ever hang off invoice_id.

 - lib/invoice-settlement.validateConsolidation now takes paid_to_date per
   invoice + optional { partialAmount } (single invoice only, ≤ balance;
   below balance → isPartial). Returns remainingById; rejects fully-collected
   invoices. 8 new tests (2 old assertions updated for the wider shape).
 - settleInvoicesConsolidated: fetches prior receipts, settles each invoice's
   REMAINING (not the printed total) — pool attributions + per-segment JEs +
   voucher amount all use it. Partial: voucher carries invoice_id, invoice
   stays issued, no settlement_voucher_id, description "Partial payment — X
   of Y balance". payroll_consolidated stays full-only.
 - Manual path (payments createPaymentVoucherInner billing_payment): the old
   one-voucher-per-invoice block became a cumulative balance check (prior +
   this ≤ total), and the end-of-flow status flip only fires when receipts
   cover the total (netting → paid_via_netting unchanged, full only).
 - Billing list: part-paid rows show "part-paid X · bal Y" under the amount;
   the settle modal shows Σ remaining, and with ONE invoice selected gains an
   实收金额 input (default = balance; less = partial, more = client+server
   reject). BillingView passes paidByInvoice.
 - Debtor Aging (page + export) now reports total − receipts via the shared
   lib/debtor-aging-data.fetchPaidByInvoice, tags rows "part-paid RM X",
   drops fully-covered rows.
 - **Trigger fix (same day, mig 20260811010000)**: the user's FIRST real
   partial (HV-OR-202608-0280, RM 6,503.38 of HV-INV-202607-0039's 27,359.20)
   was correct on money (JE/pool/bank all partial) but the invoice still went
   'paid' — the old mark_invoice_paid_on_voucher_insert/_paid triggers flip on
   ANY paid voucher carrying invoice_id, bypassing the app-level skip. Both
   functions now flip only when Σ non-voided credit receipts ≥ total − 0.005
   (the AFTER trigger sees its own row), and the data fix put 0039 back to
   issued (bal 20,855.82). credit_dept_pool_on_invoice_paid keys off
   reference_type='invoice' so it never double-fired.

## DYNAMIC FULL DEPARTMENTS (2026-08-24, mig 20260824020000) — 转正 self-service

User: "我要做成有自己的p&L pool 等等 … 以后可以手动加，然后功能自动链接";
first provisioned: **Revenue Department** (segment 'revenue_department', pool
GL 1090, mode 'revenue_department_attribution').

DB: departments = the REGISTRY (segment_key UNIQUE / pool_gl_code FK /
billing_mode_key UNIQUE; five cores backfilled 1030-1070). Every SQL mapping
helper (dept_to_segment, billing_mode_to_segment, pool_key_to_segment,
dept_pool_gl_code) keeps its LEGACY CASE FIRST — cores bit-identical incl.
the Director-name→director_office quirk — registry fallback only for new
names/modes/pools. credit_dept_pool_on_invoice_paid + calculate_dept_np
gained registry branches guarded OFF the cores. provision_full_department
(finance/principal): validates key, ALTER TYPE gl_segment + billing_mode ADD
VALUE (PG15 in-txn ok since values unused in-txn), opens pool account at the
next free multiple-of-10 in 1030-1490 (NOT next_account_code — that returns
1901 after 1900 Opening Balance Clearing), files the registry row.
IRREVERSIBLE: enum values can't be dropped.

TS: lib/dept-registry.ts — fetch/extras builders + a PRIMED module store.
Priming happens in lib/supabase/server createClient() (30s throttle,
best-effort) so EVERY server path is covered without threading params; the
provision action re-primes immediately. Deep pure helpers consult primed as
LAST fallback (cores hardcoded-first): segmentForBillingMode /
segmentToPoolKey / lineAttributions (invoice-settlement), deptNameToSegment
(billing), invoicePoolForBillingMode + manualJvPoolForSegment (cfo-reports;
MANUAL_JV_SEGMENT_TO_POOL loosened to Record<string,string> since gl_segment
grows at runtime), bridge DEPT_TO_SEGMENT. approvals DEPT_POOL_GL now reads
departments.pool_gl_code (registry-first). my-billing reads the dept row's
segment_key/billing_mode_key. Report rails (P&L/CF/BS/R&P + 3 monthly via
MonthlyReportControls extraSegments) append extraReportSegments(primed).
Invoice/CN/Edit modals take extraModes (BillingView → InvoicesList → CN;
EditInvoiceButton self-appends an unknown mode). createManualInvoice accepts
registry modes. database.types.ts REGENERATED (has the new enum values).
tsconfig now excludes '**/* - Copy*' so local `next build` matches Vercel
(.gitignore already blocks those files from shipping).

NOT yet dynamic (folds new depts into Venture where applicable): payroll
allocation participation, statements. Verification: tsc 0 / 555 tests / next
build 73 pages — all BEFORE push per user's "local test run 成了再 push".

Live-acceptance follow-ups (same day, each found by the user's RM1 Revenue
Department walk-through, each gated locally before push):
 - adjustPool (TS) + apply_pool_adjustment (SQL, mig 20260824030000): both
   pool adjusters had the hardcoded five-pool map → "unknown dept pool".
   The FIRST failed settle left HV-OR-202608-0301 half-done (voucher + bank
   bump + paid-flip, no JE/pool) — completed by mig 20260824040000.
 - deptNameToPoolKey (dept-pool overview) — seventh hardcoded map.
 - Daily Bank + dept-pool Per-bank breakdown now DYNAMIC: daily-bank.ts keeps
   the six core columns and grows via setExtraDbColumns (registry, set by
   fetchDailyBank); the column set travels in DailyBankData.columns because
   DailyBankView is a client component (module state doesn't cross); PDF
   export shares it; dept-pool per-bank segLabels append registry extras
   before the Venture combo row. SegAmounts loosened to Record<string,
   number>; user-tuned applyPoolAdjust logic untouched, targets now include
   dynamic dept names.

## Departments tab (2026-08-24, mig 20260824010000)

Settings → Departments: ADD-only management, Principal + Finance (RLS INSERT
policy departments_pf_insert). No rename, no delete, no is_active — the five
core department NAMES drive dept_to_segment() + a dozen TS maps, so renaming
would silently re-segment a book. New departments are LIGHTWEIGHT: usable for
staff/claims/inter-billing/dept_manager assignment, GL folds into Venture
(corporate). Making one a full segment (own P&L/pool/billing mode/reports)
stays a one-off engineering job — enum + mappings + pool GL account.

## FIXED 2026-08-20 — August payroll rounds vanished from every dept cash flow

User: "为什么7月没有salary" on Monthly R&P (marketing). Two truths:
 (1) NOT a bug for July: since the new payroll flow (2026-07), the per-dept
     salary payout in a dept's cash flow is the BRIDGED pool transfer shown
     on 9030 Salary Expense ("Transfer to HR payroll custody") — the old
     "Accrual - Salary" (4070) clearing rows moved to the HR segment (19
     per-employee JEs/month) and stay 0 for other depts forever. Side
     effect to know: per-segment 4070 balances are lopsided by design now
     (marketing +69,918.88 / hr −116,464.54 as at 2026-08-20; sums to 0
     company-wide).
 (2) REAL bug for August: the other session changed approve_single_voucher's
     custody marker from 'payroll fund → HR custody' to 'payroll fund →
     custody pool'; the inter-billing bridge's LIKE filter only knew the old
     wording, so the whole 2026-08-06 round (PV-202608-0228, all 4 depts)
     un-bridged. Fix in inter-billing-cash-flow.ts: match the stable prefix
     '%payroll fund → %' AND make pairing SYMMETRIC (custody receipts only
     bridge when a drain shares the ref) — director-salary custody parks
     (np_in only, GL pays under director segment) stay excluded, no double
     count. STANDING: if the payroll marker wording changes again, check
     this bridge.
 (3) Round 2, dept_manager view specifically ("还是没有薪水啊?" as Marketing
     Manager): the bridge pairs drains against HR-pool custody rows and a
     voided-voucher set, both RLS-invisible to dept managers — so THEIR
     payroll bridge was empty even after (2) (finance viewing the same
     segment was fine). Fix: bridge_ref_flags() SECURITY DEFINER RPC (mig
     20260820020000) returns ref STRINGS only (voided voucher_nos +
     custody-paired non-voided payroll refs); the bridge unions them with
     its direct reads.
 (4) Nature split for dept managers too ("inter-billing 那行也帮我拆开"):
     bridge_mirror_slices() RPC (mig 20260820030000) replaces the direct
     mirror-rows read — finance/principal get all slices, a dept_manager
     ONLY slices of vouchers their own dept paid (inter_billing_out row
     references the voucher_no). Their inter-billing line now splits by
     nature (rent/utilities/salary) same as finance's view.

## Marketing / dept-manager self-service (2026-08-20, mig 20260820010000)

User: "我现在要做marketing user 的功能" → picked 4: Receipt & Payment 报表
(实收+未收+支出), 开单/看回款, own Dashboard cards, 合同管理加强.
dept_manager could already SELECT own-segment invoices/journal/contracts/pool
(RLS). New pieces:
 - DB: mint_invoice_no now allows dept_manager (number only);
   invoices_dept_manager_insert policy (DRAFT + own segment via
   billing_mode_to_segment + created_by=self — issue stays finance/principal);
   dept_invoice_settlements(p_segment DEFAULT NULL) SECURITY DEFINER RPC →
   per-ISSUED-invoice receipts + approved-CN sums for the caller's segment
   (dept_manager forced to own; finance/principal may pass one). Exposes ONLY
   aggregates — payment_vouchers/credit_notes stay unreadable to managers.
 - lib/dept-receipt-payment.ts: fetchDeptCashLines (bank COA lines, name
   'Cash & Bank%', inside segment JEs — join-filtered + paginated),
   fetchDeptOutstanding (issued × RPC sums → outstanding), monthRange.
 - /my-billing (dept_manager only): KPI cards (本月开单/本月实收/未收/合同
   expiring ≤30d), 开单 modal (CreateDeptInvoiceButton → createDeptInvoice:
   draft, own segment's billing_mode via SEGMENT_TO_BILLING_MODE, invoice_date
   defaults period month-end), invoice list with 回款 bal (收/CN detail),
   contracts table with 到期 badge + per-contract 已开单/已收/未收
   (invoices.contract_id).
 - /reports/receipt-payment (canAccessDeptReports): month nav; dept_manager
   locked to own segment, finance/principal get segment chips (default
   marketing). Cards 实收/支出/净现金 (+YTD) + 未收 total; three tables:
   Received / Paid out (GL bank lines) / To collect (all months).
 - Sidebar: My Billing (dept_manager) + Reports → Receipt & Payment
   (canAccessDeptReports). Dashboard dept_manager branch: +本月开单 and
   +未收 cards (RPC + RLS invoices), links to /my-billing.
 - NOT done: dept_manager edit/delete own drafts (ask Finance); 开单 for
   non-marketing dept managers works via their segment's *_attribution mode
   but was built for Marketing; statements/PDF export on the new report.
 - Monthly R&P round 2 (user: 未收也是部门的钱): 月末未收 splits into one
   row per DEBTOR (depth 1, L2/L3 detail levels) — running per-party 3030
   balance, party via applyGlRefs; GlRefs gained optional creditNoteParties
   (CN JE → parent invoice bill-to) so CN movements attribute cleanly; final
   row 部门总资金 = closing cash + outstanding.
 - Round 3 (只看还没收回的 + attribution fixes): debtor rows show POSITIVE
   accumulated balances only; invoice legs carry company SHORT CODES while
   receipt legs carry payee FULL NAMES → normalised via companies map so
   collections net against their debtor row; payee names via
   voucher_party_refs() SECURITY DEFINER (mig 20260820050000, both
   directions, names only — superseded receipt_party_refs from mig ...040000)
   because dept_manager RLS blocks payment_vouchers (their view had dumped
   ALL collections into 未标示). Payroll salary bridge now lands on 4070
   Accrual - Salary (was 9030) so the salary series is ONE continuous row —
   from July that row carries the full CTC packet.
 - Round 4 (支出对象): Paid-to breakdown after Closing cash — money-out bank
   lines per payee per month (negative values), synthetic bridge legs
   labelled 'HR Payroll custody (internal)' / 'Inter-billing (internal)'.
 - Same day follow-ups: /reports/receipt-payment REBUILT in the Cash Flow
   statement format (buildCashFlow + cashFlowBlocks + GlReportView + shared
   layouts) with a 未收 section appended as ReportBlocks (consolidated view
   asks for a segment first). NEW /reports/monthly-receipt-payment ("Monthly
   R&P" in sidebar): Monthly Cash Flow matrix + three AR rows — billed/month
   (Dr 3030), collected+CN/month (Cr 3030), and 月末未收 = running
   segment-tagged 3030 balance at each month-end (all-time cumulative, ties
   to GL); Accumulated column = YTD for flows, point-in-time for balance.

## 跨月合并结算 toggle (2026-08-20, no migration)

User: "同个公司收多笔invoice时无法跨月tick" — the billing page is
period-scoped, so a payer's June + July invoices couldn't share one receipt.
settleInvoicesConsolidated never cared about periods (settles by id); only
the list was scoped. BillingView now also fetches OTHER periods'
still-issued invoices (otherOpenInvoices → extraOpenInvoices prop, included
in the paid/CN sum fetches); InvoicesList shows a 跨月 toggle button
("跨月：其他月份未结 +N" ↔ "只看本月") that merges them into the table for
ticking. Period totals/cards stay period-only; the CN section filters to the
period's invoices; same-payer guard unchanged.

## Void loan repayment (2026-08-20, mig 20260819050000)

A Hookka repayment got keyed against the wrong loan (fixed in place by mig
20260819040000 — same company so only linkage moved). For NEXT time there's
now a self-service **Void** button per row in the loan detail's Repayment
history (finance/principal). One atomic SECURITY DEFINER RPC
void_loan_repayment(p_repayment_id):
 - mirror JE (swapped lines, same segment) dated in the original month
   unless locked (then today); BOTH legs flagged is_reversed so reports
   drop the pair (mark_journal_entry_reversed convention)
 - bank cache bumped back down (bank derived from the original JE's Dr line)
 - venture_pool 'fund_out' VOID counter-row for principal (append-only, same
   pattern as reverse_voucher_pool_rows)
 - repayments row deleted (definer bypasses repayments_no_delete);
   fully_repaid un-flipped to active when no longer covered
Flow for a wrong-loan repayment: Void on the wrong loan → re-record on the
right one. Cross-company mistakes MUST use this (receivable leaves differ);
same-company can also just be re-pointed by hand.
Related data fixes same day: Hookka compound loans 2%→4% retroactive (mig
20260819030000, keying error); HC fund-return interest reclassed 5027→6000
(mig 20260819020000 — paying a funder interest belongs in 6000/6001, never
debit 5027).

## Credit notes v2 (2026-08-19, mig 20260819010000) — full lifecycle + PDF

User raised the system's FIRST CN (HV-CN-202608-0001, RM500 discount on
HV-INV-202608-0016) and found create-only half-feature: no list, no approval
UI, no GL, no balance effect. Now:
 - /billing shows a "Credit notes" section (CreditNotesList.tsx) under the
   invoice list — rows for CNs against the period's invoices, with
   Approve (principal) / Delete (draft only) / PDF actions.
 - createCreditNote guards: invoice must be ISSUED (paid needs a refund PV,
   not a CN), payroll_consolidated blocked (settles in full by design), and
   amount capped at outstanding = total − receipts − existing CNs (drafts
   reserve too).
 - approveCreditNote (principal): claims draft→approved, posts
   Dr cn.category_code (resolveRevenueGlCode fallback) / Cr 3030, segment
   from cn.billing_mode, referenceType 'credit_note'; JE failure reverts the
   claim. Then flips the invoice to paid if receipts ≥ total − approved CNs
   (the DB triggers only fire on voucher writes, so this covers CN-last).
 - deleteCreditNote: draft only; RLS cn_no_delete replaced by
   cn_delete_draft (finance/principal, status='draft').
 - Balance math: validateConsolidation gains credited_to_date (approved CNs)
   — settle collects total − receipts − CNs everywhere (billing list badge
   "CN −X · bal Y", batch modal, /payments/new preset now prefills the
   outstanding). mark_invoice_paid triggers are CN-aware (mig).
 - PDF: /billing/credit-note-doc?id= (or ?ids=) → CREDIT NOTE document
   (credit-note-doc-pdf.tsx, same letterhead as invoice-doc) with an
   "effect on invoice" balance box; draft prints with a DRAFT note.
 - NOT done (scope): CN lines on /statements monthly statements; voiding an
   APPROVED CN (needs reversal JE — do on request); refunds on paid invoices.

## FIXED 2026-08-19 — user renamed income codes in Settings; app hardcodes realigned

User renamed COA codes in Settings → Accounts (5020→5050 Salary Income,
5000→5011 Service Revenue - Subs; plus new 5030/5031 groupings, 5999 Discount
Allowed). rename_account_code re-pointed ALL history correctly (394 lines on
5050 back to Jan; zero dangling refs anywhere) — but string literals in code
don't follow renames. Realigned:
 - lib/billing.ts fallbackRevenueGlCode: '5020'→'5050', '5000'→'5011'
   (dead codes would have made consolidated-payroll/own-share invoice ISSUE
   fail on the journal_lines FK)
 - lib/inter-billing-nature.ts INCOME_TO_PAYER_EXPENSE: '5020'→'5050'
   (else salary recharges settle into the 905x lump, not 9030 Salary Expense)
 - GenerateConsolidatedInvoicesButton / GenerateOwnShareInvoiceButton default
   categoryCode '5020'→'5050'
 - approvals/actions.ts DEPT_POOL_GL: 3030/3040/3050/3070/3080 →
   1030/1040/1050/1060/1070 — PRE-EXISTING stale mirror from before the
   unified-COA bigbang (30xx are receivables now; 3070/3080 don't even
   exist). Never fired (no 'Dept Pool → Venture transfer' JE), no data fix
   needed.
STANDING RULE: COA codes are hardcoded in lib/billing.ts,
lib/inter-billing-nature.ts, lib/loans-coa.ts, lib/payroll-accrual.ts,
approvals/actions.ts (DEPT_POOL_GL + AR/bank codes), billing/actions.ts,
ba/actions.ts ('5028'/'6001'), claims/actions.ts ('9000'), fund-out,
payments. After ANY code rename in Settings, grep src for the old code
('XXXX' quoted) and realign. payment_categories table no longer exists;
7725-7844 in hr-costing staff import are BANK codes, not COA.

## FIXED 2026-08-13 — July CTC invoices' income landed in August

User: "我在july 的period, 我开的invoice 应该是31/07。他现在放到去8月".
HV-INV-202607-0038..0041 (director CTC, period 2026-07) were created 4 Aug in
the Create Invoice modal, whose invoice-date field DEFAULTED TO TODAY — so
invoice_date = 2026-08-04, and bulk issue (correctly, per the 2026-06-11 rule
"JE date = invoice date") posted their revenue JEs into August.
 - Data fix (mig 20260813010000, applied live): the 4 invoices → invoice_date
   2026-07-31; their issue JEs JE-202608-0378..0381 → transaction_date
   2026-07-31 + period_month 2026-07-01. Settlement receipts stay on real
   August dates. Entry numbers keep the JE-202608 prefix (cosmetic; all
   reports bucket by transaction_date). period_locks was empty — no lock
   bypassed.
 - Code fix: the modal's invoice date now DEFAULTS TO THE PERIOD'S MONTH-END
   and follows the period selector until the user touches the field
   (dateTouched); issue-side logic unchanged (it was already right).

## Allocator: cross-month snapshots (2026-08-13)

User: "为什么我快照明明有7月的了，但是选项没有" → the Calculate headcount
dropdown only offered THE PERIOD'S OWN snapshot (v1 safety pairing). They
want cross-month ("要") — e.g. bill August on July's list. Now:
 - Dropdown lists 现在的名单 + EVERY saved snapshot month; picking a month ≠
   billing period shows an amber "⚠ 用 X 的名单算 Y 的账" note (mistake still
   visible, no longer blocked).
 - Plumbing: hcSource ('current' | 'YYYY-MM') in CalculateTab; save/update
   send hcMode + optional hcPeriod; loadCalcContext(period, hcMode, hcPeriod?)
   loads that month's alloc_staff_history and stamps hc_period with it, so
   Records show which list was actually used and edit-mode restores it.
 - Page now fetches ALL snapshot rows once (snapshotSplitsByPeriod map keyed
   YYYY-MM, replacing single-period snapshotSplits) — preview for any month
   mirrors exactly what the server loads.

## FIXED 2026-08-13 — Ledger/BS/CFS 400s: JE-id lists outgrew the URL

User hit "fetchLedgers opening lines: Bad Request" on /reports/ledger. Root
cause: the two-step pattern `fetch all JE ids (< from / in range) → journal_
lines .in('entry_id', ids)` puts every uuid into the GET query string;
history passed a few thousand JEs and PostgREST now rejects the request
outright (bare 400) — the whole-history variants (Ledger opening, Balance
Sheet, Cash Flow opening/closing) died first; the in-range variants (P&L
treasury/manual-JV, Ledger period) were next as months accumulate.

Fix: every affected query now filters through the embedded join instead —
`journal_entries!inner(transaction_date, is_reversed[, segment])` with
gte/lte/lt + is_reversed on the joined columns, paginated via fetchAllRows
(URL is constant-size forever). Touched in lib/cfo-reports.ts:
gatherTreasury, gatherManualJvPnl (segment now rides the join),
sumGlNetAcrossCodes (signature: jeIds → asOf; all 10 call sites incl.
fetchBalanceSheet which dropped its id prefetch, and fetchCashflowStatement
opening/closing where fetchJeIdsBefore/-OnOrBefore were deleted), and
fetchLedgers opening + period lines. Also reconciliation/journal-entries
page's line-counts query (unbounded JV id list). reconciliation/journal
page keeps its .in — bounded by .limit(50). **Rule going forward: never
put an unbounded id list into .in(); filter through the join.**

## Daily Bank dashboard (2026-08-11, no migration)

User showed screenshots of their OTHER system's daily board and wants the same
here (scope pinned by AskUserQuestion: BOTH views · pending = pending_approval
only, NOT draft · any-date lookback · PNG + PDF export). New /daily-bank
(sidebar Fund In / Out, first item; finance+principal).

 - **Two views, one dark-banner capture area**: BANK × DEPARTMENT matrix
   (bank rows × Venture/Director/Director Office/Finance/HR/Marketing/
   Unassigned columns) and a simpler By-bank list (PAY TO | PV | DESC |
   RECEIVED | PENDING). Per bank: Balance B/F → Received today (green,
   itemised by OR vouchers + "Other (JV/transfer)" remainder) → Pending
   orange rows (payee + PV no + desc + badge) → Available (green tint) =
   current − pending; grand Total available row.
 - **Column mapping** (lib/daily-bank.ts, pure, 6 tests): JE segment
   corporate→Venture, treasury/unallocated/NULL→Unassigned, others→own
   column; PVS pool venture_pool + dept_pool_venture_office→Venture,
   dept_pool_*→own column; mirror rows excluded; PV with no PVS rows →
   Unassigned at full amount.
 - **Numbers are GL-true** (not the bank cache): B/F = Σ lines < D,
   in/out = D's debits/credits by segment, all through fetchAllRows.
   current = bf + in − out; available = current − pending.
 - **Any-date lookback**: ‹ date › + Today + date input (?date= param).
   Historical pending is rebuilt from approval_requests timestamps
   (created_at ≤ D end-of-day MYT +08:00, approved_at missing-or-later;
   rejected/voided disappearance ≈ updated_at) — legend states it's
   approximate; today's list is exact.
 - **Exports**: Get image (clipboard PNG via html-to-image, new dep — paste
   into WhatsApp), PNG download (pixelRatio 2), PDF (/daily-bank/export?date=,
   landscape, English). Legend footer mirrors the other system's wording.
 - **Dept-cash parity fix (same day)**: user reported 部门 cash 对不上 vs the
   dept-pool page. Unassigned column REMOVED — Venture absorbs corporate +
   treasury + unallocated/NULL (treasury was the big miss), and for TODAY the
   inter-billing pool-vs-GL gap is folded into the primary bank via
   applyPoolAdjust (dept_pool_balances + the 'Venture Office' pseudo-dept
   overlay — the dept-pool page's own algorithm), so each department column
   equals the "By department" cash. Past dates stay GL-only (legend says so).

## BA v2 — the interest is real (2026-08-11, mig 20260811000000_ba_v2)

User corrected the v1 model: "不会真实过银行，但是那些算的利息我是真的要去 bill
和真的要给回houzs的" — the BA PRINCIPAL never moves through HV's books/bank
(no Fund In/Out for it), but the interest legs are real money. Scope pinned by
AskUserQuestion: attachment-style upload + auto-read; one-click invoice with a
DEDICATED income account; PV at maturity for the HC side; per-company limits
that warn but never block.

 - **COA**: 5028 Interest Income - BA (user: "account我要分成ba interest
   income") + 6001 Interest Expense - BA (my symmetric addition, accepted) —
   BA margin reads straight off the P&L as 5028 − 6001.
 - **Bill borrower →** (per row): generateBaInvoice → the EXACT
   createMultiLineInvoice path (same as allocator/manual), billableType
   subsidiary (or freetext when only a name), billingMode venture_attribution,
   reference_no `BA-<id8>` (dedupe key — refuse while a non-voided invoice
   carries it), one line on 5028, amount = face × charge%/mo × days/30. Draft
   → normal /statements review → issue.
 - **Pay HC →** (per row): generateBaPv builds a FormData and calls the REAL
   createPaymentVoucher (numbering, PVS row, approval queue): expense/debit,
   payee = companies short_code 'HC', amount = face × hc%/mo × days/30, one
   venture_pool source row on 6001, reference_type='ba_interest' +
   reference_id=ba id (dedupe), payment_date defaults to maturity, bank picked
   in a small modal. Draft → submit → approve as usual. NEXT_REDIRECT from the
   voucher path is swallowed as success.
 - **Limits** (ba_limits, company_id UNIQUE): used = Σ active BA face,
   settled releases; over-limit shows a red warning on the Record form and a ⚠
   in the Limits table but SAVING IS NEVER BLOCKED (user's explicit choice).
   **Limit CARDS** (same day, user showed a bank-app screenshot): per-company
   glanceable card above the list — outstanding vs limit %-bar (green <70 /
   amber 70-99 / red ≥100), available, face-weighted avg bank rate p.a., two
   soonest maturities with ⏰ day countdowns. Cards = display; Limits table =
   where values are set. Freetext-borrower BAs count toward no card.
 - **Attachments** (ba_attachments): reuses the payment-attachments bucket
   under `ba/<ba_id>/` (no new storage policies); chips on the Ref column,
   signed-URL open, upload on save or later, delete with confirm.
 - **Auto-read**: extractBaFromDocument sends the PDF/photo to Claude
   (`claude-opus-5`, structured output json_schema, @anthropic-ai/sdk new dep)
   and PREFILLS the Record form — nothing saves until the user reviews (user:
   "我会检查对不对才储存开invoice"). Needs **ANTHROPIC_API_KEY**. **User
   declined the pay-per-use API (2026-08-11 "要收费我就不要了") — the button
   is HIDDEN unless the key is configured; do NOT re-pitch it.** The free path:
   user drops the BA document into the Claude chat, Claude reads it and fills
   /records for them. Refusal/parse failures degrade to manual entry.
 - Conventions: ba_* tables stay on the untyped-client cast; extraction
   validates dates/size/type server-side; BA ref for humans = ba_no, for
   machines = `BA-<id8>` (ba_no is optional and not unique).

## Bank recon round 5 — Reconciliation Report + cross-month carry-forward (2026-08-11)

User (May done): "我要对完了后我要reconciliation report… 我做6月时，我看没有5月
还没recon的transaction". Spec: docs/superpowers/specs/2026-08-11-recon-report-
carryforward-design.md. NO DB migration — display/report layer only.

 - **Carry-forward window fix**: session-page book window start is now
   `windowStart()` = min(month −10d, bank's FIRST recon-session month). June
   reaches back to Apr 1, so the 20-May BIG MATRIX lines (−430.43/−1,067.30/
   −413.17, cleared by bank 1 Jun as −843.60 + −1,067.30) finally appear.
   Pre-baseline (pre-Apr) legacy NEVER enters — user 2026-08-11: "四月之前的…
   旧系统已对完，不想再对了" (~35 unclaimed Feb/Mar lines stay out). First
   session of a bank keeps the −10d buffer. ReconReview `showPrior` now
   defaults TRUE (earlier items are only genuine in-transit candidates now).
 - **Reconciliation Report** per session: /reconciliation/[id]/report +
   Export Excel/PDF (?format=) via lib/export/*, links on the review page and
   the index rows. Classic statement: bank closing + outstanding book items −
   statement items not in books = GL at month-end, ✓/✗ tie badge, item lists
   (Date | Entry | Description | Amount). English-only incl. PDF. User chose:
   NO matched-pair detail anywhere ("都不要"); contra groups excluded (Σ=0
   can't move the maths). Works on OPEN sessions too.
 - **Maths (lib/recon-report.ts, pure, 12 tests)**: identity verified live to
   the sen for Apr (45,890.89 = GL, zero items), May and open June
   (16,933.98 − 7,198.37 + 1,910.90 = 11,646.51). Baseline absorbs pre-era
   history — proven: Apr statement opening 26,422.51 == Σ pre-Apr unclaimed
   exactly. **As-at rule**: a book line claimed by a session whose month > the
   report month stays on that report forever (after the user matches BIG
   MATRIX inside June, May's report still shows them outstanding — finished
   months never drift). Data layer lib/recon-report-data.ts is shared by the
   page and both exports.
 - **Pagination hardening**: the session page's three unranged reads (book
   window, claimed matches, GL-closing sum) + all report reads now go through
   fetchAllRows — same 1000-row-cap class as the 2026-06-16 Trial Balance bug.

## Billing Allocator (2026-08-01, port of the user's Apps Script — SHIPPED)

New /billing-allocator (Finance + Principal; sidebar under Daily Operations next
to Invoice). Scope fixed by the user's answers before building:
 - **Payer is ONLY HOUZS Venture** (no inter-subsidiary billing).
 - **Headcount uses the allocator's OWN staff list** — user explicitly chose a
   Finance-maintained list over reading hr_staff_allocation. Per-month
   snapshots (alloc_staff_history): every staff edit re-snapshots the current
   month (script parity); calc offers current-list vs the period's snapshot.
 - Methods: headcount / percentage / equal / custom — **no Area**.
 - Output: **draft invoices**, then the normal /statements review → issue →
   settle flow.

**The invoice handoff — the user's #1 correctness concern ("要确定他对接去
invoice 时是对的")**: generateAllocatorInvoices() does NOT write invoices
itself — it calls the exported `createMultiLineInvoice` from billing/actions,
i.e. the EXACT function behind the manual multi-line Create Invoice button.
Numbering (mint_invoice_no), draft status, period-open check (assertPeriodOpen),
line rollback on failure, revalidation — all identical to a hand-made invoice by
construction. Parameters: billableType subsidiary, billingMode
**venture_attribution** (→ settles into venture_pool, same as the utility-split
invoices), reference_no **ALC-YYYYMM** (the link AND the dedupe key), one line
per allocation detail ("desc — method_detail · ALC-no"), categoryCode from
alloc_categories.coa_code (blank → 5000 fallback at issue, same as manual).

Locking: a period with ANY ALC-ref invoice refuses txn save/delete AND skips
those companies on regenerate — delete the drafts in /statements first. Own
share (companyId NULL everywhere) is stored + shown but never billed.

Engine `src/lib/billing-allocator.ts` is a faithful port incl. rounding
quirks: percentage/equal penny-fix lands on the LAST row; headcount rows round
independently (NO fix — sheet parity); custom taken as typed (billed may ≠
header amount, deliberate). 10 unit tests in billing-allocator.test.ts.

DB: mig `20260801000000_billing_allocator` — 8 alloc_* tables, RLS
finance+principal only (verified live: 8 tables, 8 policies). NOTE:
database.types.ts was NOT regenerated — allocator files use the untyped
SupabaseClient cast (same convention as lib/cfo-reports.ts); regenerate types
whenever convenient and the casts can go.

Follow-up same day ("staff那边没有办法用我现有的去记录?"): **"从 HR 带入"
one-click import** on the Staff tab — `importAllocStaffFromHr(hrPeriod)` READS
hr_staff_allocation + hr_staff_costs (read-only, same precedent as the invoice
autofill) and REPLACES the allocator list with that month's staff×company×%.
HR stores FRACTIONS (0.30 = 30%) → ×100 on import; HR has no own-share concept,
so a staff totalling under 100% gets the remainder as "HV own" (e.g. CHOW WAI
MAN 87.29% → 12.71% own). Two-step confirm in the UI (replace-all is
destructive to hand edits). After import it is Finance's independent copy — HR
edits do NOT flow through; re-import to refresh.

Follow-up 2 (2026-08-01): **the user's actual Apps Script data is IN.** They
pasted HeadcountHistory + ExpenseTemplates + DefaultAllocation + Categories.
Rulings taken: ACTIVE rows only; history depth = 2026-07 only (older months
were already billed from the sheet); and **"marketing 算inter-billing。单还是要开"**
→ targets extended to DEPARTMENTS (mig `20260801010000_allocator_dept_targets`:
department_id on alloc_staff_splits / _history / _txn_details, CHECK one-target).
Target encoding everywhere: company uuid | `dept:<uuid>` | null = HV own — the
ENGINE is unchanged (keys are opaque to it); Equal/headcount include a dept
once staff reference it, matching the sheet where "Marketing Department" sat in
the Companies list. generateAllocatorInvoices branches billableType:
subsidiary vs **dept_pool + departmentId** — still the same
createMultiLineInvoice; dedupe key now company_id OR billable_to_department_id.
Imported (verified live): 37 active staff / 64 splits — FTE: CONTS 8.7667,
Marketing(dept) 8.0, DC 7.7667, CAR 6.5107, HC 5.0516, 2990 0.4773, HK 0.30,
HV own 0.1271 (Vivian Chow 12.71%), total exactly 37.0. 2026-07 snapshot saved.
Sheet company names→codes: Carress→CAR, Houzs Century→HC, The Conts→CONTS,
Dream Crafter→DC, 2990 Home→2990, Hookka Manufacturing→HK, Houzs Venture
Holding→own. Templates: Office Rental (headcount, 18,980, Rental), Showroom
Rental (percentage, 11,000, Rental, preset CAR 100%), Others (percentage, 0,
Others). Categories: Rental / Utilities / Upkeep of Office / Others (no COA
codes yet — lines fall back to 5000 at issue until the user maps them).

## Bank recon round 4 — contra + polish (2026-08-08, mig 20260808030000)

 - **Contra groups** (user: "我会做transaction，但是其实银行没过账，他会debit
   contra credit" — e.g. fund-in +98k & pass-through loan-out −98k, per-bank
   cleanup entries): select ≥2 book lines with NO statement selection, if they
   Σ to 0.00 → "Mark contra (Σ=0)". Rows get statement_line_id NULL +
   session_id (both columns via mig); shown in a Contra section, Dissolve
   undoes. contraBookLines/dissolveGroup actions.
 - Prior-month buffer rows hide behind "Show earlier items (n)" (user: "三月
   之前的就可以不用显示了吧") — settled months make them noise; toggle keeps
   cross-month matching possible.
 - Summary tile relabelled **Bank vs GL (month-end)**: Bank opening→closing
   vs GL balance at month-end with ✓ tie / diff readout (user asked which
   number is bank vs GL).
 - NOTE: one-sided "per-bank cleanup" lines that DON'T net to zero within a
   bank are real GL-vs-bank explanation items — leave visible, don't contra.

## Bank recon round 3 — N↔M groups (2026-08-08, mig 20260808020000)

User hit the reverse case ("bank statement 可能是两笔加起来等于gl 的", real
example: stmt 31,000+10,333.33 ↔ GL 33,333.33+8,000). Matching generalised to
MATCH GROUPS: bank_recon_matches gains match_group uuid, journal_line_id is
now nullable (a group with fewer JEs than statement lines pads rows with NULL
so every statement line keeps ≥1 row); existing 1:N matches were backfilled
as groups keyed by their statement line. manualMatch(statementLineIds[],
journalLineIds[]) validates Σ==Σ; unmatchLine dissolves the WHOLE group.
"Matched" now keys off match_kind everywhere (not junction presence). Review
page: BOTH tables multi-select, sticky bar shows Statement Σ vs Book Σ with
off-by readout, Matched section renders per GROUP (N↔M tag). Book table
sorts date→entry. Also this session: internal-flip exclusion + no-forward
window + full-width tables (round 2 entries below).

## Bank recon round 2 (2026-08-08, mig 20260808010000)

 - **One-to-many matching** (user: "银行是收一笔，但是gl 记录是多笔"):
   junction table bank_recon_matches (UNIQUE journal_line_id) replaces the
   single matched_journal_line_id column (backfilled, column nulled/dormant).
   manualMatch(lineId, journalLineIds[]) enforces Σ(selected book) == the
   statement line; the review page's book table is MULTI-select with a live
   Σ/off-by readout; auto-match stays conservative 1:1. Counts key off
   match_kind now.
 - **Internal flips excluded** (user: "interbilling 的别出现哦…银行不会有
   transaction"): any JE that both debits AND credits the same bank code
   (inter-billing dept transfers, same-bank payroll staging) is dropped from
   the book side — no real bank movement exists to match.
 - Review tables rebuilt full-width (Date | Entry | Description | In | Out,
   per-table filter, sticky match bar) after the cramped side-by-side lists;
   book window is month −10d..month-end (NO forward days — "upload 6 月就不
   应该出现7月的payment").

## Bank reconciliation rebuild (2026-08-08, mig 20260808000000)

User: "bank reconciliation 我希望我是upload pdf 或excel 后自动对账 · 存起来
每月一份 · 金额，名字等等，日期其次 · 对不上就问我".
 - Tables bank_recon_sessions (UNIQUE bank+month) + bank_recon_lines
   (signed amount, matched_journal_line_id → journal_lines, match_kind
   auto/manual/ignored). RLS finance+principal.
 - `lib/bank-recon.ts` (9 tests): header-detection parser for CSV/xlsx rows
   (MY formats: DD/MM/YYYY, (1,234.56), CR/DR suffixes, letterhead rows
   skipped), autoMatch = equal-amount buckets → greedy by name-token
   similarity, date proximity only tie-breaks, leftovers stay unmatched.
 - /reconciliation rebuilt: Bank vs GL table kept; upload form (bank+month+
   file) → session created → auto-matched → redirect to
   /reconciliation/[sessionId] review page: summary tiles, side-by-side
   unmatched statement vs unmatched book lines (click one each → Match,
   equal amounts enforced), ignore/restore, matched list with Unmatch,
   Mark done / Delete on the index. Legacy CSVUpload + old count-only
   action removed.
 - Book lines window = month ±10 days on the bank's GL code, excluding
   journal_lines already claimed by ANY session.
 - **PDF: HLB template LIVE** (user sent "Venture - Apr'26.pdf" same day).
   `lib/bank-recon-pdf.ts` (3 tests) parses via pdf2json COORDINATES — the
   flat text layer glues Deposit/Withdrawal/Balance together, so numbers are
   classified by nearest column-header x (calibrated per page). Continuation
   lines (remark · PV no · counterparty) join into the description = strong
   name-matching signal; bank refs (20260401HLBB…) and page artifacts
   filtered. FAIL-SAFE: opening + Σmovements must equal closing to the sen or
   the parse refuses. Real-file e2e: 47/47 lines, 0 skipped, tie-out exact.
   statement_opening/closing stored on the session and shown on the review
   tile. Non-HLB PDFs still return the ask-for-sample message (add the next
   bank's template beside parseHlbPdf). Dep added: pdf2json (dynamic import
   in the action).

## Auto payroll accrual JVs (2026-08-07)

User: "HR submit payroll fund request 给我, 我希望同时直接帮我开jv" → trigger
refined via AskUserQuestion: STAFF JVs post when the payroll RUN is approved
(approvePayrollRun), DIRECTOR JV posts when HR submits director salary to
Finance (submitDirectorSalaryToFinance) — both dated BACK to the payroll
month-end ("要放回去对的月份").
 - `lib/payroll-accrual.ts` (+3 tests): mapping REVERSE-ENGINEERED from
   Finance's manual May/June JVs and verified to the sen on both tables:
   Dr 9030 = gross − non_stat_allowance · Dr 9084 = non_stat · Dr 9081/82/83 =
   ER EPF/SOCSO/EIS · Cr 4070 net · 4071 EPF both · 4072 SOCSO both · 4072
   (2nd line) SKBBK · 4073 EIS both · 4074 PCB. Staff = hr_monthly_payroll
   grouped via hr_staff_costs→departments (NOT "staff" — that table doesn't
   exist); director = director_monthly_payroll, one 'director'-segment JV.
 - Idempotent per (period, segment) via reference_type='payroll_accrual';
   same total → skip, DIFFERENT total → throws "reverse the old JV first" —
   never silently double-books (covers HR reopen→resubmit).
 - Failures after the RPC surface as "approved ✓ but auto JV failed: …" —
   the approval/submission stands.
 - July 2026 BACKFILLED by hand (user asked): JE-202607-0386..0390, five
   segments, each ties EXACTLY to its funding-request total (HR 21,803.06 /
   Fin 24,355.35 / Mkt 47,030.69 / DO 6,566.25 / Director 65,309.67).

## Same-bank funding CLOBBERED the bank cache (2026-08-07, mig 20260807010000)

Principal "approve 不到" → HL cache said 149.01 while GL said 165,214.03
(user's own sum was right). Short by EXACTLY the two same-bank HL→HL funding
PVs (99,755.35 + 65,309.67). Root cause: approvers read current_balance
early, the paid-status flip fires credit_dest_bank_on_bank_transfer
(+amount), then the approver writes an ABSOLUTE balance from the stale read —
same-bank means same row, so the trigger's credit gets erased and the cache
drains by the full amount. **The 20260804010000 entry's claim that same-bank
"cache moves cancel" was WRONG** — they only cancel now that mig
`20260807010000_same_bank_cache_fix` made all three approvers
(single/batch/batch_partial) write RELATIVE (current_balance ± amount) and
re-synced every active bank's cache to GL. Lesson: any cache write in a
trigger-adjacent path must be relative, never absolute-from-a-read.

## 53,613.75 triangle contra (2026-08-07, DATA ops — no code)

User-confirmed story: the [BI#32] fund-in "2990 → HV 53,613.75" is really
HC's debt chain (HC owed HV 53,613.75, sitting inside GL 3056), and the HC
45,000 fund-in "Contra with 2990" was HC REPAYING that debt, mis-recorded as
a borrowing. Two non-cash nettings booked (both interest-waived per user):
 1. LO#29 (2990 owed HV 45,000, funded by that HC 45k) netted against
    [BI#32] → HV now owes 2990 **8,613.75**; LO#29 fully_repaid.
    Rows: repayments type='principal' (loan_outstanding only counts
    'principal'!) + fund_source_repayments type='netting' (fs view counts
    principal+netting) + JE-202608-0448 Dr 4051 / Cr 3054 45,000.
 2. HC 45k fund-in closed as HC's repayment → HC now owes HV **8,613.75**
    of this chain (inside 3056 = 150,156.32 total; the other ~141,542.57 is
    the user's own legacy items — untouched). fund_source_repayments
    type='netting' + JE Dr 4052 / Cr 3056 45,000; status flipped to repaid
    MANUALLY — trg check_fund_source_fully_repaid only fires on 'principal'.
End state (user: "那就对了"): 欠 2990 8,613.75 ↔ HC 欠 8,613.75 mirror
tails; banks untouched; TB 0.00. Netting conventions above are the precedent
for future contras.

## Bank BA registry + calculator (2026-08-07)

User: "calculate ba interest的function. 先别做，先确定流程" — flow pinned over
three AskUserQuestion rounds:
 - The BA is HOUZS CENTURY's facility with the bank — HV never owes the bank;
   bank interest (face × annual × days/365) is REFERENCE only (HC's cost).
 - HV owes HC face × 1.5%/mo × days/30; HV charges the borrowing sub
   face × 2.5%/mo × days/30 (both rates editable per BA, both prorate by
   days); HV margin = spread.
 - 入账 (my recommendation, user accepted "或你有好的意见告诉我"): REAL money
   keeps booking through Fund In (owe HC) + Fund Out (loan to sub) — the BA
   page is a registry/calculator layer with optional fund_source_id/loan_id
   link columns, NO JEs of its own, so nothing double-books.
Built: mig `20260807000000_ba_facilities` (RLS finance+principal; maturity
GENERATED from start+tenor); `lib/ba.ts` calcBa/daysBetween (5 tests);
`/ba` page (summary tiles, Record BA form with live calc, list with
charge/owe/margin + matures-in/overdue status + Mark settled/Reopen,
calculator modal — /ba?calc=1 opens it); BA Calculator buttons on Fund In +
Fund Out; sidebar "Bank BA". English UI. Untyped-client convention (table
absent from database.types.ts).

## Company Statement round 3 (2026-08-06)

 - **PDF exports must be ASCII/English-only** — react-pdf's base font has no
   CJK glyphs; Chinese labels rendered as mojibake (user: "导出的pdf 会乱").
   Export labels now English (Collect/Repay, compounding, no fixed term,
   N left · by YYYY-MM, TOTAL·TO COLLECT/REPAY, lent to X); xlsx shares the
   same rows. Remember for ANY future react-pdf export.
 - Every export row carries a From column (user: "这里没有显示from") and the
   PDF went landscape for the 7 columns.
 - ?cp=HC,2990 filters the export to chosen counterparties; totals re-sum the
   subset; single-cp filename gets the name. UI: checkbox per counterparty row
   → 「已选 n 家 · 导出: Excel / PDF」 bar (top buttons still export all).

## Company Statement round 2 (2026-08-06)

Polish batch 1: summary tiles (要收/要还/净额), counterparty search (footer
re-sums the filtered rows), expand/collapse-all, per-position View → links to
fund-in/fund-out detail. Batch 2 (user: "帮我对齐，然后要导出"):
 - Header alignment: table.ledger-table's `thead th` rule out-specifies
   Tailwind text-* utilities — number headers need ledger-table's own `right`
   class (group headers centered inline). Remember this for ANY ledger-table.
 - Export Excel / Export PDF buttons → /reports/company-statement/export
   (?format=xlsx|pdf), bank-statement layout: section per counterparty with
   net in the title, position rows, TOTAL section. Data extracted to
   `lib/counterparty-statement-data.fetchCounterpartyStatement` — page and
   export share ONE builder.
 - SC badge on positions = the loan's 资金来源 remark parsed from
   repayment_terms (fundingSourceFromTerms; display-only).
 - 借给 badge (repay side) — user picked the notes-remark mechanism ("这笔是
   借给谁我自己加"): they write 「借给: X」 (借去/转借给 accepted) in the fund
   source's NOTES; lentToFromNotes (lib/utils, display-only, unit-tested)
   parses it and the statement + export show it as the repay-side badge —
   mirror of SC. Never auto-match SC strings to data.

## Select-all covers combined cards (2026-08-06)

User: "明明有5张我要approve, 按select all只选三张" — the 5 pending ITEMS were
3 singles + 2 combined groups, and groups were one-card-one-action only.
Now combined cards carry a checkbox (g:<groupId> keys in the selection set):
select-all picks every card, the floating bar total adds each group's
voucher-only sum (same dedupe as the card's Total disbursement), and
approveRequestsBulk gained groupIds — the combined-group core was extracted
to performGroupApproval (returns requests approved; approveRequestGroup is
now parse → helper → redirect) so bulk approves groups all-or-nothing per
group and reports per-group failures without stopping the sweep.

## Principal can self-approve (2026-08-06)

User: "principal submit 要自己能approve". Approvers were already
principal-only (every approve action requireRole(['principal'])), so the rule
change = drop every "cannot approve your own submission" block:
 - approvals/actions.ts: single approve, bulk approve, combined-group approve.
 - payroll-run actions: approve + reject self-guards.
 - UI: PendingApprovals no longer disables own rows' checkboxes (select-all
   includes them); CombinedApprovalCard lost its isSelfSubmitted prop/banner
   and its BatchDetailsModal is always actionable; approvals/[id] page banner
   removed; payroll-run page canAct no longer excludes the submitter.
 - DB: NO change needed — approval_requests has no self-approval CHECK (the
   old code comment overstated), and approve_payroll_run's guard was already
   a no-op (IF ... THEN NULL).

## Payments page shows ALL money out (2026-08-06)

User couldn't find repayment PVs ("做repayment for loan in 无法找到那个payment
voucher") — two fixes:
 1. The Type=Loan repayment filter matched voucher_type, which NO voucher has
    (repayment PVs are typed 'expense'; the fund_source_id link is what makes
    them repayments). Filter now matches the link; Category cell prefixes
    还款 ·; text search hits "loan repayment / 还款".
 2. "不能像reciept 这样显示全部吗?" → new `lib/payment-extras.ts` mirroring
    receipt-extras: /payments (and its export) now interleaves synthetic rows
    for (a) direct fund-source repayments recorded WITHOUT a PV
    (payment_voucher_id IS NULL — 87 rows / RM 233k live; PV-driven rows are
    skipped, verified zero overlap) and (b) Loan OUT disbursements with no
    non-voided reference_type='loan' PV (26 of 34 loans). Rows link to their
    fund-in/fund-out detail pages; summary tile reads
    "N PVS · n 还款 · m LOAN OUT" and Total paid includes them.

## Company Statement report (2026-08-06)

User: "我要有一个新的report 或statement 关于这个公司我还要还多少和我还要收多少
… 类似银行会给的一个statement". New `/reports/company-statement`
(finance+principal), tile added on the Reports index.

 - One row per counterparty (companies by short_code both sides so directions
   merge; departments/directors/freetext by name): 我还要收 (active loans lent
   out) vs 我还要还 (active fund sources), principal and interest in SEPARATE
   columns (user's pick), net = collect − repay. Click a row → bank-statement
   detail per position: 原额@rate·期数, 已还本金, 未还本金, 利息, 几时还完.
 - Maths in `src/lib/counterparty-statement.ts` (pure, 8 unit tests) reusing
   treasury-schedule/loan-monitor conventions — figures TIE to Loan Monitor:
   principal outstanding from the loan_outstanding / fund_source_outstanding
   views (principal-type repayments only); flat interest = remaining periods ×
   原额×月息; 利滚利 accrued = compounded balance − outstanding (roll-forward
   with all-type paymentsByMonth); no-term rows carry 0 interest in totals and
   show ~RM x/月 as reference. 几时还完: on/ahead of agreed schedule →
   contractual finish (startYM + tenure − 1); behind → currentYM + remaining−1.
 - User scoping answers (AskUserQuestion 2026-08-06): 总表每家一行 expandable;
   本金+利息分开两栏; 要收只算 loans (NOT unpaid invoices — Debtor Aging covers
   those); detail like a bank statement (outstanding + payoff month), no aging
   buckets, no chasing features (standing 别理欠款 directive stays respected —
   display only).

## Payroll funding destination bank is selectable (2026-08-04)

User: "hr request fund 我没办法设定他是转去什么银行" — the funding PV's
destination was hardcoded Alliance (GL 3010). Now:
 - GeneratePvForm has a **to bank** select (default = the GL-3010 bank, so the
   old behaviour is the default); source==dest blocked in UI and action.
 - generatePvFromRequest takes destBankId; the PVS rows carry the CHOSEN
   bank's gl_account_code (was literal '3010'); payee_name names the dest.
 - Everything downstream already keys off the PVS rows (credit_dest_bank
   trigger, its void mirror, both batch approvers) EXCEPT approve_single_voucher,
   which resolved v_dest_bank by a hardcoded gl='3010' lookup — mig
   `20260804000000_payroll_funding_dest_bank` patches it to resolve the
   destination from the voucher's own PVS account_code (3010 fallback for
   legacy vouchers), so the staging JE debits the chosen bank.
 - The old "source is already Alliance" guard became "source ≠ destination",
   which also unlocks reverse transfers (Alliance → HL) when ever needed.
 - **Same-day follow-up: source = destination is now ALLOWED** (user: "为什么
   来源不能选同个银行? 因为这只是inter fund transfer"). When payroll pays out
   of the bank the cash already sits in, no real transfer happens — the funding
   PV still must run for the pool bookkeeping (drain dept pools → park in HR
   custody) and to flip the request to funded. Verified all bank-side effects
   self-net with source = dest: staging JE Dr/Cr the same GL, source cache −X
   cancels the credit_dest_bank trigger's +X, void mirror symmetric. Mig
   `20260804010000_payroll_funding_same_bank` drops the guard from
   approve_single_voucher (only place that had it); form shows an informational
   同一家银行 note instead of an error. The sufficient-balance check stays —
   salaries genuinely drain that bank.

Follow-up 8 (2026-08-01, bulk-issue COA bug): user bulk-issued both Aug
batches and caught that every JE credited **5000** while the invoice lines
said 9095/7012 — `approveInvoicesForPeriod`'s non-consolidated branch predated
mig 275 and never read invoice_lines. Code FIXED (bulk now fans out per line's
category_code, legacy single credit only when no lines). Data corrected in
place per the user's "A": the 13 credit lines moved 5000→9095 (6 lines,
4,523.99) and 5000→7012 (7 lines, 18,729.88); after: 0 lines left in 5000 for
ALC refs, TB 0.00, invoices themselves untouched (they were always right —
the user's manual 9095 picks and the Rental→7012 category both landed on the
lines correctly; only the bulk-issue translator ignored them).

Follow-up 7 (2026-08-01, post-issue round): **actions return errors instead of
throwing** — Next.js masks thrown server-action errors in prod (the
period-lock guard surfaced as the generic "Server Components render" digest);
all 14 actions now wrap through guard() → { error }, clients unwrap() locally
(new _components/unwrap.ts). Then the user ISSUED the Aug drafts and asked how
to bill NEW expenses → **multi-batch billing** (mig `20260801050000`
alloc_txns.billed_ref, backfilled ALC-202608 onto the 4 issued Job Street
rows): new expenses join a month anytime; Generate bills ONLY unbilled
allocations under a fresh ref (ALC-YYYYMM → -2 → -3…); locks are PER
ALLOCATION (billed_ref's batch still has live invoices → 改/× refuse; delete
that batch's drafts → auto-unlocks; issued = permanent). Generate CLAIMS
billed_ref before creating invoices — a first-create failure leaves the ref
invoice-less so the claim self-releases. Records rows badge 已开单·ref /
未开单; the Generate button counts unbilled only.

Follow-up 6 (2026-08-01, invoice round): Aug regenerated + verified — all 6
drafts tie to alloc records to the cent (incl. the 17.5%/17.5% penny landing
on the last row). Invoice line format: "desc — RM {base} × {share} · ALC-no";
summary = that invoice's own expense names joined. Records-tab chips open
/billing/invoice-doc?id= (the old /statements/[id] link 404'd — that route is
monthly statements). Category COA is now the shared AccountPicker; the user
mapped: Advertisement→9095, Upkeep→9086, Utilities→9091 (contra-expense
treatment) and **Rental→7012 Rental Income — DELIBERATE ("这个我故意弄成这样"):
rental recharges present as income while the other three net down the expense.
Do NOT flag this as inconsistent.** resolveRevenueGlCode accepts any active
postable code (bill-back by design), so issuing works for all four; NULL
category still falls back to 5000.

Follow-up 5 (2026-08-01, calc round): one bill mixing methods = enter it as
multiple expense rows (user confirmed "拆两行输入就够" — per-company invoices
already merge everything into ONE invoice per target). Percentage/Custom split
editors gained an **"HV 自己承担(不开单)"** first slot (engine: companyId null
→ own-share line, percentage still validates 100 incl own, penny fix
reconciles own+billed to the amount). **Participating companies are
Finance-maintained** (mig `20260801040000` alloc_company_settings; Setup tab
toggle chips): switched-off companies vanish from pickers/Equal/calc targets —
allocator-scoped ONLY (companies.is_active untouched), labels for old
records/snapshots still resolve via the full list, and a staff editor keeps a
"(停用)" option for splits that still reference one. Snapshot re-save REPLACES
that month (delete+rewrite); snapshot-mode preview now uses the period's
snapshot rows so preview == server calc (fixed same day).

Follow-up 4 (2026-08-01, staff-tab polish round): staff editor became a MODAL
(user: "pop out 出来…而不是跳上去") — BatchDetailsModal overlay pattern, Esc /
overlay-click cancels. Department label added to alloc_staff (mig
`20260801020000` — free text, Finance-maintained, datalist suggestions,
filterable column, "split 是 split, department 是 department", NO effect on the
math; Marketing seeded for the 100%-Marketing-split people; HR import carries
HR's department name). Active/inactive/total counts by the search box; list
defaults to ACTIVE with a 显示 Inactive toggle. Snapshot periods are clickable
→ review modal per period: per-company FTE totals (+%) computed from the
snapshot's ACTIVE rows + the full roster with each person's splits
(`getAllocSnapshot`), so a saved month is auditable afterwards.

Follow-up 3 (2026-08-01, UX round after first real use): staff editor moved
ABOVE the table + scrollIntoView + "正在编辑 — {name}" (37 rows pushed it below
the fold; Edit looked dead). Staff list rebuilt on the shared SortableTable —
newest-first by Added date (new column), click-sort headers, search over name +
split labels, Status facet filter. **Records became editable** ("我如果有错无法
更改"): 改 on a row loads it into Calculate (percentage splits reconstruct from
the stored "17.5%" detail strings, custom from stored amounts), the banner says
存档会覆盖原记录, and `updateAllocTxn` replaces details in place keeping the
same ALC number — same invoiced-period lock as delete.

NOT built (explicitly out of v1): dashboard/PDF statements (the invoice IS the
statement), inter-subsidiary payers, Area method, Feb-Jun history import
(user chose 2026-07 only; paste again anytime to add).

## Jun statutory PVs said "(staff + directors)" but carried STAFF ONLY (fixed 2026-07-31)

User asked whether HR's KWSP/SOCSO payments included the directors. They did NOT:
every one of the five paid PVs (0173-0177) ties to the cent to the four staff
departments' accruals — EPF 18,496.00 / SOCSO 1,596.60 + SKBBK 532.35 = 2,128.95 /
EIS 283.80 / PCB 2,097.55 — while the director shares (EPF 13,961.00, SOCSO 535.60,
EIS 95.20, PCB 8,691.35 = **23,283.15**) are still accrued in 4071-4074.

Why: create_payroll_statutory_vouchers sums staff + directors BY DESIGN, but the
five were generated 16 Jul, before director_monthly_payroll had any Jun rows
(InfoTech actuals arrived with mig 20260730100000 / the director-side session).
v_dir_amt = 0, yet the description string was hardcoded "(staff + directors)".

Mig `20260731040000_statutory_pv_label_matches_shares` (applied live + archived):
 - generator label now derives from the shares actually present
   (both / directors-only / staff-only);
 - data fix rewrote the five vouchers' text in payment_vouchers,
   journal_entries and dept_pools (15 rows, text only, no GL effect).

**User chose option B — BUILT (mig `20260731050000_director_statutory_topup`,
applied live + archived).** Their instruction pinned the amount source: "根据
request fund 那part来出" — the FUNDING-REQUEST algorithm, i.e.
director_monthly_payroll (InfoTech actuals), NOT the GL accrual figures. The
arithmetic confirms it: InfoTech director statutory sums to 22,174.00 (KWSP
13,248.00 + SOCSO 535.60 + EIS 95.20 + PCB 8,116.60 + SKBBK 178.60) = exactly
the second funding tranche parked in dept_pool_director, so paying the top-ups
drains the custody pool to zero against what was funded.
 - RPC `create_payroll_statutory_director_topup(period, scheme, date?, bank?)`:
   same guards as the main generator (roles, approved run, funding completed,
   Alliance-first bank), PLUS: a scheme voucher must already exist (else the
   normal Generate is correct — it includes both shares), and it REFUSES when
   any non-voided voucher for the scheme+run already carries a
   dept_pool_director source row (combined voucher or an earlier top-up).
   Voucher: expense/debit/pending_approval, source_pool 'dept_pool_director',
   one PVS row (dept_pool_director, 4071/4072/4073/4074/4072), description
   "… payroll (directors)", normal approval queue.
 - HR Payment page: statutory rows now split vouchers by source_pool (staff =
   dept_pool_hr, top-up = dept_pool_director) and fetch which vouchers already
   carry a director source row → "Generate directors PV" button appears only
   when the main PV exists, directors > 0, and the share is uncovered. Top-up
   gets its own date slot + "Save dir date" (setPayrollPvDate works on any
   pending payroll voucher).
 - HR triggers it: HR Costing → Payment → Statutory payments → per-scheme
   "Generate directors PV" → Principal approves as usual.
 - **"Generate all (N)"** button above the table (user follow-up: "多一个一键
   按钮生成完全部，原本的一个一个按保留"): runs each row's own pending action —
   normal Generate where no voucher exists, director top-up where uncovered —
   SEQUENTIALLY (voucher numbering is count-based; parallel calls could mint
   duplicate numbers). One failure doesn't stop the rest; failures are shown
   together. Button hides itself when nothing is generatable. Per-row buttons
   unchanged.
**CLOSED same day.** The five top-ups were generated (Generate all), approved
and PAID within the hour — 22,174.00 total, dept_pool_director left at 3,221.06
(= funded 68,197.26 − salaries 42,802.20 − statutory 22,174.00, exact), Alliance
cache == GL, TB 0.00. A dry-run re-generation was refused by the dedupe guard
(proven live). Then the USER closed the accrual-vs-InfoTech gap themselves by
rewriting JE-202606-0226 (Jun director accrual) to the InfoTech figures:
Dr 9030 57,600 / 9081 6,912 / 9082 416.60 / 9083 47.60,
Cr 4070 42,802.20 / 4071 13,248 / 4072 535.60 + 178.60 (SKBB) / 4073 95.20 /
4074 8,116.60 — internally exact (gross − ee deductions = net paid, to the
cent). **4070/4071/4074 are now 0.00 across every segment; Jun payroll (staff +
directors, salary + all five schemes) is fully settled.** The ONLY residual in
the accrual family is May PERKESO 2,474.10 (4072: 535.60 dir + 1,565.10 staff;
4073: 95.20 + 278.20) — genuinely unpaid by the user's explicit choice
("真的没付，不理他"). Do not flag it, do not "fix" it.
From Jul onward the order fixes itself: import director InfoTech actuals FIRST,
then generate statutory — each voucher then carries two PVS rows (staff drains
dept_pool_hr, directors drain dept_pool_director).

## Account search on the four statements (2026-07-31, user request)

"帮我在 P&L, Monthly P&L, cash flow 和 monthly cash flow 加搜索功能，就快速找account".
All four render through just two shared components, so the search lives there and
covers every page at once — no per-page changes.

**User picked HIGHLIGHT, not filter** (asked explicitly). Rationale worth keeping:
a filtered statement invites reading a subtotal as if it covered only the rows
still on screen. So a search never removes a row — it highlights the match, forces
its ancestors open, and offers ‹ › to jump. The L1/L2/L3 detail level is the
user's own separate choice and is still respected; search only ADDS the matched
rows (and the path to them) on top of it.

 - **new** `src/lib/report-search.ts` — pure helpers: `matchesAccount` (query is a
   substring of the account CODE or NAME, case-folded — covers "9030", "salary",
   "salary expense"), `highlight` (splits text into <mark>-able runs, preserving
   original casing and reconstructing the source exactly), `ancestorsOfMatches`
   (pre-order depth stack → the ancestor keys to force open).
 - **new** `_components/Highlight.tsx` — shared `<mark>` renderer so a hit looks
   identical on all four reports.
 - `GlReportView.tsx` (P&L + Cash Flow) — "Find account" box in the left rail with
   match counter + ‹ ›, Enter/Shift-Enter to step, Esc to clear. Matched ancestors
   override `collapsed`; active row scrolls to centre.
 - `MonthlyMatrix.tsx` (Monthly P&L + Monthly Cash Flow) — same behaviour.
   `isOpen` consults forceOpen first; the visibility pass gained an
   `onSearchPath` escape so a deep match surfaces even at L1.
 - **new** `_components/ReportSearchProvider.tsx` — the monthly reports' box was
   first put in the matrix toolbar; user asked for it in the LEFT RAIL instead,
   to match the GL statements. The rail (MonthlyReportControls) is a SIBLING of
   the matrix, so query + cursor now flow through this client context and the
   matrix publishes its match count back up. Deliberately not a `?q=` URL param —
   that would round-trip the server on every keystroke. GlReportView needs none
   of it: it owns its own rail, so its search stays local state.
   `useReportSearch()` returns null without a provider, and the rail then renders
   no search UI — so MonthlyReportControls stays usable anywhere else.
 - `MatrixRow` gained `code?` — its `key` is prefixed per section on some reports,
   so search needs the bare code. Set at all 3 construction sites (monthly-matrix
   buildHierarchyRows ×2, monthly-cash-flow, monthly-pnl); the subtotal rows in
   cash-flow-custom need no code.
 - `globals.css` — `.search-hit` (matched substring), `tr.search-row-hit`,
   `tr.search-row-active`; the matrix's sticky first column and gl-report's
   blanket hover wash both had to be overridden so the cue survives.

Gates: tsc clean for every tracked file; vitest **457 passed** (444 → +13 in
`src/__tests__/report-search.test.ts`). NOT visually verified in-app — the dev
server needs a login this session doesn't have; user checks on the deploy.

## FIXED (2026-07-31) — approvals LIST showed a stale amount vs the DETAIL page

User spotted it: /approvals lists HV-PV-202607-0179 at RM 100,000 but the detail
page shows RM 90,000.

**Root cause.** The two screens read different sources:
 - list  → `approval_requests.amount` — a SNAPSHOT written when the voucher was
   submitted (approvals/page.tsx:31/36)
 - detail → `payment_vouchers.amount` — live (approvals/[id]/page.tsx:46 then the
   voucher itself)
`updatePaymentVoucher()` (payments/actions.ts:994) updates payment_vouchers AND
replaces payment_voucher_sources, but never syncs the approval_requests row. Edit
a voucher after submitting it and the snapshot goes stale. `approval_requests_with_target`
does NOT help — it only joins user names, not the target amount.

**Not a posting bug.** approve_single_voucher reads payment_vouchers +
payment_voucher_sources, so the GL uses the DETAIL number. header amount == sum of
PVS rows for all 10 pending vouchers (verified). The list is display-only — but it
is what the approver reads at the moment of approving.

**Currently stale (2 of 10 pending):**
| PV | list | actual (will post) | list off by |
|---|---|---|---|
| 0179 | 100,000.00 | 90,000.00 | +10,000.00 |
| 0182 | 1,339.60 | 1,351.14 | −11.54 |

**User chose option A — read through to the target row.** (Option B, syncing the
snapshot on edit, was rejected: one forgotten edit path and the bug returns —
which is exactly how it got here.)

Shipped:
 - **new** `src/lib/approval-amounts.ts` — `resolveLiveApprovalAmounts(supabase,
   rows)` returns approval_requests.id → live amount. One query per distinct
   target table (not per row). Column map: payment_vouchers/fund_sources →
   `amount`, loans → `principal`; `dept_pools` requests carry no amount. Falls
   back to the snapshot when the target can't be read (deleted / RLS-hidden), so
   a row never silently blanks. Table+column come from that map only, never from
   user input — but they're dynamic, so the typed client can't parse the select
   list and the result is hand-typed.
 - `approvals/page.tsx` — pending queue AND recent-decisions list now go through
   `amountOf()`. Covers every request type in the queue at once (payment_voucher,
   new_fund_source, new_loan, loan_cancel, dept_expense…).
 - `dashboard/page.tsx` — same treatment in all four places that showed an
   approval amount: dept-manager pending submissions (incl. `pendingTotal`),
   Finance "Awaiting Principal sign-off", Finance "Recent actions", and the
   Principal Overview queue (its amount comes from the dashboard_summary RPC, so
   the existing supplementary reference_id query was widened to carry amount +
   reference_table and resolve alongside).
 - `src/__tests__/approval-amounts.test.ts` — 6 cases: live-over-snapshot,
   loans→principal, missing-target fallback, no-lookup-needed passthrough,
   one-query-per-table batching, numeric-string coercion.

No backfill needed: the snapshot is no longer read for display, so PV-0179 and
PV-0182 correct themselves. approval_requests.amount is left as the historical
submit-time record.

Gates: tsc clean for every tracked file (the only remaining errors are in
untracked `* - Copy.*` files, which are NOT in git and never reach Vercel);
vitest 444 passed / 43 files; production build verified by the Vercel deploy.

## CLOSED — fund-source repayments (swept 2026-07-31, then stood down)

**USER DIRECTIVE 2026-07-31: "这些欠款你别理，有还的我都更新了" — do NOT audit,
chase, or re-flag outstanding debts / repayment schedules (fund sources, loans,
debtor aging). The user maintains them and posts repayments as they happen, so a
zero `total_principal_paid` means "not yet repaid", NOT "missing record". Leave
the whole category alone unless they ask.** Sweep below kept for reference only.

Only two active fund sources carry an explicit `repayment_date`; the rest are
open-ended, so "overdue" cannot be judged from the system for them.
 - **HC 45,156.32 — due TODAY 2026-07-31**, 1%/mo. PV-0178 (pending_approval,
   45,607.88 = 45,156.32 + 451.56) IS this repayment. Approving it settles it.
 - **Kingsley 100,000 — 0%, "4/20起分12期只还本金 (每月 8,333.33)" per its notes
   [BI#2].** fund_source_outstanding shows outstanding 100,000.00 /
   total_principal_paid **0.00** — i.e. by 7/31 four instalments (4/20, 5/20,
   6/20, 7/20) totalling **33,333.32** should have been paid and the system has
   none. Either paid outside the system and never recorded, or genuinely unpaid.
   Raised with the user; no action taken.

## OPEN — 3 pending PVs debit 5027 Interest INCOME while paying money OUT (2026-07-31)

Found while listing Finance's outstanding work. NOT touched — they are still
pending_approval, so nothing has hit the GL yet.

| PV | amount | rows | issue |
|---|---|---|---|
| 0149 | 11,800.00 | Dr 3056 10,000 + Dr **5027** 1,800 | 3056 is due-FROM (asset) — paying out should reduce 4052, and 5027 is revenue |
| 0150 | 11,406.67 | Dr 4052 9,666.67 + Dr **5027** 1,740 | 4052 right; 5027 wrong |
| 0178 | 45,607.88 | Dr 3056 45,156.32 + Dr **5027** 451.56 | same as 0149 |

Debiting 5027 (revenue, currently −28,843.13) cuts July interest income by
**3,991.56**. Interest PAID to a fund source belongs in **6000 Interest Expense -
Fund Sources**, or should draw down **4062 Interest in Suspense - Pay - HOUZS
Century** — both accounts already exist. This is the exact mirror of the
receiving-side fix (interest received → 3060 suspense, not 5027 income).
Also: 0149 and 0150 are both "3rd Installment" yet use opposite accounts
(3056 asset vs 4052 liability) — one of them is wrong; and 0150/0178 say
"The Conts"/"Conts" in the description while posting to HOUZS Century.
0179 (Ohana 90,000 → Dr 3052) and 0181 (ESH 100,000 → Dr 3072) look structurally
fine — lending out raises the receivable. 0180 (85,250, "Fund Transfer -
Interest") debits 4052 principal, not an interest account — worth a look too.
**RESOLVED by the user 2026-07-31** — all three now post the interest to **6000
Interest Expense - Fund Sources** instead of 5027 (0149 1,800 / 0150 1,740 /
0178 451.56). July interest income is no longer cut by 3,991.56. Still
pending_approval, so nothing had reached the GL.
**The 3056-vs-4052 split is the user's deliberate call ("剩下的没什么了") — do NOT
re-raise it.** It is presentation only: Dr 3056 (asset up) and Dr 4052 (liability
down) move HC's NET position by the same amount; only the gross balance-sheet
line differs, and HC is netted anyway.

## OPEN — 4071-4074 statutory accruals swept too (2026-07-31, NOT fixed)

Same accrual-vs-clearing walk applied to EPF/SOCSO/EIS/PCB. Total across
4070-4074 = 66,224.25, which is 68,427.50 of unpaid Jun DIRECTOR payroll less
2,203.25 of genuine errors:

| acct | residual | Jun director unpaid | other |
|---|---|---|---|
| 4070 Salary | 41,371.80 | 45,144.35 | −3,772.55 Mktg May under-accrual |
| 4071 EPF | 13,145.00 | 13,961.00 | −816.00 Mktg May under-accrual |
| 4072 SOCSO | 2,560.90 | 535.60 | +2,025.30 May PERKESO never posted |
| 4073 EIS | 455.20 | 95.20 | +360.00 May PERKESO never posted |
| 4074 PCB | 8,691.35 | 8,691.35 | clean (Feb gap was Jan+Feb caught up in Mar) |

 **(A) The May Marketing under-accrual is now pinned to one employee.** EPF gap
 is 816.00 = EXACTLY 13% + 11% of a 3,400.00 gross. EDWIN LIEW GAO NAN
 (Marketing, basic 3,100, status inactive, resignation_date NULL, absent from
 Jun payroll) fits. His expected net ≈3,002 though, vs a 3,772.55 salary gap —
 the extra ≈770 is probably EPF-exempt final pay / leave encashment. Every other
 dept matched to the cent in BOTH accounts, so it is one person in one dept in
 one month. Confirm against HR's May payslip file before posting anything.

 **(B) May PERKESO (SOCSO 2,025.30 + EIS 360.00 = 2,385.30) has NO payment
 voucher anywhere in the system.** June recorded only PCB-MAY (PV-0060, 10,582.40)
 and KWSP-MAY (PV-0061, 31,831.00). Prior months always paid PERKESO together
 (e.g. PV-000081 on 5/14 for April). The next SOCSO/EIS PVs are the July ones for
 JUNE payroll. So either it was paid and never recorded, or it was never paid —
 the latter is a statutory late-payment exposure, NOT just a bookkeeping gap.
 **User confirmed 2026-07-31: it genuinely was never paid, and they are leaving
 it ("真的没付，不理他"). No adjustment is needed or wanted — the 2,385.30 sitting
 in 4072/4073 is a CORRECT unpaid liability, not an error. Do not "fix" it.**
 **User will edit the May accrual JE themselves for (A); they asked for a check
 only, not a fix. Do not post anything to 4070-4074.**

 **(A) DONE by the user 2026-07-31 — verified correct.** JE-202605-0113 edited in
 place (date/period/segment untouched): Dr 9030 +3,200.00, 9084 +970.00,
 9081 +442.00, 9082 +58.65, 9083 +6.70 / Cr 4070 +3,772.55, 4071 +816.00,
 4072 +75.40, 4073 +13.40. Both sides now 44,607.04, header total agrees,
 TB 0.00, zero unbalanced entries DB-wide.
 The added employee reconciles exactly: gross 4,170.00 − EPF ee 374.00 − SOCSO ee
 16.75 − EIS ee 6.70 = 3,772.55, i.e. the observed payment gap to the cent — which
 also PROVES PCB is genuinely 0 for them (had there been PCB, the paid net would
 have been lower). Statutory wage is 3,400 (EPF er 13%=442 / ee 11%=374; SOCSO
 58.65/16.75 and EIS 6.70/6.70 are the PERKESO 3,300.01–3,400 band), so 770 of the
 allowance is EPF-exempt — matches the earlier prediction.
 4070 residual is now a clean 45,144.35 and 4071 a clean 13,961.00 (pure Jun
 director). Per segment, every dept's 4070 now equals its own Jun accrual
 (Marketing 29,897.39 → 33,669.94).
 Reports need no action: no materialised/cached GL report exists (only
 report_layouts config), so P&L/BS/TB/Cash Flow/Dept Pool recompute live from
 journal_lines. May P&L Marketing cost +4,677.35; BS accruals +4,677.35 (still
 balances); Cash Flow and Dept Pool correctly UNCHANGED (accrual JE, no bank leg).
 No May invoice needs re-issuing — Marketing bills as marketing_project fixed
 fees, not staff-cost attribution.
 Side effect of (B) staying unpaid: the May PERKESO liability grew 2,385.30 →
 2,474.10 (+75.40 SOCSO +13.40 EIS for the same employee).

 Side note: Jun director funding moved to Alliance so far = 42,802.20 + 22,174.00
 = 64,976.20 vs a full Jun director package of 68,427.50 → short 3,451.30. Both
 PVs say "(partial)", so this may be intentional.
 Label typos (cosmetic, not touched): "Staff Payroll - May'2025",
 "PCB - MAY'25" — both are May'2026.

## OPEN — 4070 Accrual-Salary residual 41,371.80 (investigated 2026-07-31, NOT fixed)

4070 should carry exactly one month of unpaid salary and clear each cycle.
It carries 41,371.80, which decomposes cleanly into two unrelated things:

 **(a) +45,144.35 — Jun director salary, not an error.** Jun accrued 117,528.75
 in total; the 18 Jul staff disbursement PVs cleared 72,384.40; the rest is the
 directors, whose per-director disbursement vouchers have not been raised yet.
 Cash was already funded into Alliance (PV-0184 + PV-0185). Raising the
 disbursement PVs debits 4070 and clears it. Nothing to do.

 **(b) −3,772.55 — real error, May Marketing under-accrued.** Isolated to ONE
 line of ONE voucher:
   accrual JE-202605-0113 "Markting Salary - May'26"  Cr 4070 31,340.44
   payment JE-202606-0145 (PV HV-PV-202606-0056)      Dr 4070 35,112.99
 Every other dept in that SAME PV matches to the cent (Finance 17,948.60, HR
 16,026.30, Dir Office 4,358.00, Director 45,144.35 via PV-0057). The accrual JV
 is internally consistent (9030 29,666.11 + 9084 5,761.68 − ee deductions
 4,087.35 = 31,340.44), and the 35,112.99 is REAL cash out of Alliance — so the
 accrual is short, the payment is not over. Feb and Apr marketing accruals each
 had TWO 4070 lines (main + top-up); May has only one — the top-up looks never
 posted. Consequence: 3,772.55 of May marketing salary never reached the P&L.
 Cannot name the employee from system data: hr_monthly_payroll holds ONLY
 2026-06 (19 rows); May and earlier are legacy JV imports with no per-employee
 detail. Needs the HR colleague's May payslip file.
 Lead: Marketing has 10 rows in hr_staff_costs but 9 in Jun payroll — EDWIN LIEW
 GAO NAN (basic 3,100, status inactive, resignation_date NULL) is the only one
 missing. Basic alone ≠ 3,772.55, so check whether May was his final month.
 Proposed fix once confirmed (NOT APPLIED — touches expense, user rule
 "有碰到费用的就不要"): JV dated 2026-05-31, segment marketing,
 Dr 9030 3,772.55 / Cr 4070 3,772.55. Residual then becomes a clean 45,144.35.

 **Presentation caveat (user said don't touch it yet, 2026-07-31: "2 的别乱做
 东西。我到时理解清楚先")**: per-segment 4070 is unreliable because the Jul
 disbursement PVs all carry segment = hr (HR is the paying custodian) while the
 accrual JVs carry the employee's own department. GL total is right; the split
 is not. e.g. HR shows −56,725.20 vs a real Jun accrual of 15,659.20; CHOW WAI
 MAN is Director Office but his 4,893.25 clearing landed in HR. DO NOT re-segment
 without the user's go-ahead.

## Session 2026-07-30 — Cash Flow presentation revamp (user-driven, 3 asks)

**Ask 1 要明细 / Ask 2 收钱先出钱后 / Ask 3 void 不要算.**

1. **VOID/reversal pairs now excluded everywhere (DONE)**. Root cause: voiding a paid
   voucher posts a mirror-image reversing JE but NOTHING ever set
   `journal_entries.is_reversed` — so the ~8 report queries filtering
   `is_reversed = false` (ledger, TB, BS…) filtered nothing and both legs showed.
   Totals were never wrong (every pair nets to zero — verified per pair before
   touching anything). Fixes:
   - mig `20260730000000` `mark_journal_entry_reversed(orig, rev)` SECURITY DEFINER
     (je_no_update blocks direct UPDATE for every role). Flags BOTH legs + cross-links
     reversed_by_id; REFUSES to flag a pair that doesn't net to zero (guards the
     invariant that hiding them can't move the TB).
   - Backfilled the 5 existing pairs (4 vouchers + the cancelled dupe fund source =
     10 entries). Before/after snapshot identical: TB 0.00, HL 2,135.25, Alliance
     80,322.67, income 1,095,749.29, expense 1,025,676.62.
   - `voidPaidReceipt` + `reversePaidPayment` now call the RPC after posting the
     reversal (fail-loud).
   - `fetchAllJournalLines` skips `is_reversed` rows → P&L, Cash Flow, Monthly
     reports all clean. (Ledger/TB/BS already filtered; their filter now actually
     bites.)
2. **收/出 gross split (DONE)**: `buildCashFlow` gained `inflow`/`outflow` sections
   alongside the untouched operating/investing/financing (cash-flow-custom / the
   monthly matrix still consume those — do NOT remove them). Gross, not net: an
   account that both received and paid in the window appears on BOTH sides with its
   own figure AND its own drill-down txns (user chose bank-statement style over
   netting). inflow + outflow = netChange, so the statement still ties to the bank.
   `cashFlowBlocks` reordered to 流入 → 流入合计 → 流出 → 流出合计 → net/opening/
   closing; no O/I/F sub-grouping (user chose flat).
   Page and export share cashFlowBlocks, so both changed together.
   FOLLOW-UP same session ("这些自动分类一下父子account" + "fund out 同理"): both
   sides now run through the shared `buildTree`, so leaves nest under their COA
   parent and headers roll up (3053/3054 → 3020; 4051/4052/4202 → 4100). All
   ACCOUNT_TYPES are eligible because a cash counter account can be any type;
   synthetic IB-XFER/PY-XFER have no parent and stay top-level. +4 tests
   (suite 428).
   FOLLOW-UP 2 ("inter billing 在 all segment 不应该出现"): the gross split had
   EXPOSED the internal-transfer bridge — netting used to hide it. IB-XFER and
   PY-XFER lines are a pure internal reallocation (dept −X / dept +X, each side
   a self-balancing 2-leg synthetic entry) that exists only so a SINGLE
   segment's cash ties to its Dept Pool. All four cash-flow entry points
   (statement page+export, monthly page+export) now drop `ib.lines` when
   consolidated — rule `!isDeptMgr && !segment`, because a dept manager has no
   segment param but IS one segment via RLS. Totals unaffected (the pair nets
   to zero); per-segment views keep the bridge.
   FOLLOW-UP 3 ("money out 分多几层 section…借贷/repayment 一个,日常开销一个" +
   "顺序自己排"): the Cash Flow STATEMENT got its own layout editor, mirroring
   the monthly reports' pattern but with ONE ORDERED SECTION LIST PER SIDE —
   report_keys `cash_flow_in` / `cash_flow_out` (report_layouts has no key
   constraint; both added to layout-actions REVALIDATE). Two instances of the
   existing ReportLayoutEditor on /reports/cash-flow/layout, so no editor
   changes were needed. New lib/cash-flow-sections.ts:
   buildCashFlowSideSections groups a side's LEAVES by the layout and rebuilds
   the COA tree INSIDE each section (custom section → COA header → leaves);
   unassigned accounts sweep into a trailing 其他 section so a side total can
   never silently drop an account. defaultSideLayout seeds one section per
   top-level COA parent. buildCashFlow now also exposes inflowLeaves /
   outflowLeaves (pre-tree buckets) to feed this. cashFlowBlocks takes an
   optional {inflow,outflow} section array — omitted = previous behaviour, so
   nothing else that calls it changes. Page + export both read the layouts.
   +6 tests (suite 434).
   FOLLOW-UP 4 (same evening): (a) each custom section now emits its own 小计
   row — cashFlowBlocks.sideBlocks interleaves a summary after every section,
   skipped when a side has only one (the side total would repeat it).
   (b) Headline totals restyled to out-rank the section band: row-summary-strong
   = full accent wash + accent rules top/bottom + 17px + taller padding, and
   流入合计/流出合计 gained emphasis:'strong' (globals.css — affects P&L and BS
   headline rows too, deliberately). (c) "marketing 的 internal transfer 就是
   payroll 和 rental…能不能显示成相对应的 account": the bridge's PAYING side now
   books to the REAL nature account instead of IB-XFER/PY-XFER —
   TransferSide.natureCode, resolved from the settle voucher's role='mirror'
   PVS rows (which carry rent/utilities/salary since the 07-24 by-nature
   change) and split per nature; payroll drains use PAYROLL_EXPENSE_CODE 9030
   (cash out for payroll = salary in direct-method terms). Guard: the nature
   slices must sum EXACTLY to the pool row, else it falls back to one lumped
   pseudo-account line so a segment's cash can never drift. Receiving side
   keeps the pseudo account (a recharge received has no natural expense code).
   +4 tests (suite 438).
   FOLLOW-UP 5 ("monthly cash flow 和 cash flow 显示的是一样,以 cash flow 为准"):
   the MATRIX now mirrors the statement. New in cash-flow-custom.ts:
   `buildMonthlyCashFlowSides` (per-column values keyed by direction, taken from
   each column's inflowLeaves/outflowLeaves; rows anchored on the ACCUMULATED
   column's side, so an account that flips direction mid-year reads 0 in the
   columns where it sat on the other side) + `buildSideMatrixRows` (layout
   sections → COA hierarchy via buildHierarchyRows → per-section 小计 → side
   total). Page and export both switched; row order is now 流入 sections →
   流入合计 → 流出 sections → 流出合计 → net change → opening → closing.
   BOTH views read the SAME `cash_flow_in`/`cash_flow_out` layouts, and the old
   per-matrix editor (`/reports/monthly-cash-flow/layout`, report_key
   `cash_flow`) now REDIRECTS to /reports/cash-flow/layout so the two can't
   drift; the monthly page's Edit-layout button points there too. The stale
   `cash_flow` report_layouts row is left in place, unread. buildCashFlowAccounts
   / buildCustomCashFlowRows / defaultCashFlowLayout / ensureInterBillCategory
   are now unused by pages but kept (still exported + covered by tests).
   FOLLOW-UP 6 ("subtotal/total 的 background align with cash flow 的"):
   MatrixRow gained `emphasis?: 'strong'`; MonthlyMatrix now renders FOUR tiers
   (headline accent wash + accent rules + 15px/taller > section subtotal
   surface-2 > parent paper > leaf surface), matching GlReportView's
   row-summary-strong. Marked strong: monthly cash flow 流入合计/流出合计/
   Net change/Closing (Opening deliberately left plain, as in the statement)
   and monthly P&L Gross Profit + Net Income. Section 小计 rows stay on the
   quieter surface-2 band, so the hierarchy reads the same in both matrices and
   both statements.
   FOLLOW-UP 7 ("我在 L2 按了展开没有用"): MonthlyMatrix's L1/L2/L3 filter drops
   accounts by DEPTH (L2 = depth ≤ 1) and children sit at depth 2, so clicking ▶
   on a parent flipped the arrow but the level filter still hid the children —
   and the arrow itself was driven by `collapsed` alone, so it claimed "expanded"
   for rows the level was hiding. Reworked: a second `expanded` set records
   explicit opens, `isOpen()` = not-collapsed AND (level opens it OR explicitly
   expanded), and one pass computes visibility with a `bypassDepth` so an
   explicitly opened parent's subtree overrides the level filter. The arrow now
   renders from the same openKeys set the pass builds, so it can never disagree
   with what's on screen.
   FOLLOW-UP 8 ("cancelled 的就不应该进我的 ledger…cash flow 同理"): cancelling a
   LOAN / FUND SOURCE posts a reversing JE but never flagged the pair either.
   Worse than the voucher case: the Hookka 98,000 disbursement sits in MAY and
   its cancellation in JUNE, so the monthly cash flow showed a 98k outflow then
   a 98k inflow for money that never moved. Swept the whole ledger for unflagged
   reversal/VOID/cancellation JEs — exactly one pair left (that loan) — and
   flagged it. mig `20260730010000` patches BOTH `execute_loan_cancel` and
   `execute_fund_source_cancel` via anchored text replacement (assert anchor
   count == 1, skip if already patched): each now captures its original JE
   before reversing and calls mark_journal_entry_reversed, which still refuses
   any pair that doesn't net to zero. Verified after: 12 entries flagged,
   TB 0.00, both banks cache == GL.

**Cash-flow verification (asked for, done independently in SQL — not read off the
report)**: closing cash 82,457.92 == HL 2,135.25 + Alliance 80,322.67; ZERO orphan
bank entries (no JE with a bank leg but no counter leg, so the "uncategorised cash
movement" check row is 0); every month inflow+outflow == net change; running total
across all 7 months lands exactly on closing. Excluding the Hookka pair MATTERED:
May was showing −65,242.74 and June +33,012.46; the true figures are +32,757.26 and
−64,987.54 — the cancelled loan had flipped the sign of two months.

## Session 2026-07-31 — approval blocker, interest-in-suspense, bank cache drift

**Bank cache vs GL drift (found while the user asked "pool cash 显示是对的?")**
The Dept Pool per-bank page reads journal_lines and was internally consistent
(each column summed to its bank's GL balance), but `bank_accounts.current_balance`
had drifted: Alliance +42,802.20 too high, Hong Leong −22,174.00 too low. Two
independent bugs, both fixed in mig `20260731020000`:
 A) **Voiding a paid transfer never undid the destination credit.**
    credit_dest_bank_on_bank_transfer credits the dest bank on →paid, but
    reversePaidPayment (and every other void path) only restored the SOURCE via
    bump_bank_balance. Voiding HV-PV-202607-0109 (internal_transfer HL→Alliance
    42,802.20) therefore left Alliance overstated. Fixed with a MIRROR trigger
    `debit_dest_bank_on_transfer_void` on paid→voided — chosen over patching the
    TS action so every void path is covered.
 B) **Same-bank contra transfers lost the debit.** HV-PV-202607-0186 (source
    Hong Leong, source row account_code 3000 = Hong Leong) has a GL that nets to
    zero (Dr 3000 / Cr 3000), but the approval debited the cache while the credit
    trigger skipped it via `db.id <> new.bank_account_id`. That guard (mig
    20260606030000) was defensive, never fixed an observed bug, and only bites
    when a source row names the source bank — exactly when the credit SHOULD run.
    Removed.
 Caches then re-derived from the GL. After: Alliance 102,496.67 == GL,
 Hong Leong 199,961.25 == GL, TB 0.00.
 **RESOLVED same session.** User voided PV-0186 (HL→HL no-op) and PV-0187
 (right direction, wrong date 7/31), then re-issued **PV-0188** Alliance→Hong
 Leong 22,174.00 dated 2026-07-15 — same date as the PV-0185 funding leg, so the
 pair nets to zero inside July's cash flow. Both voids flagged is_reversed, so
 neither shows in the ledger.
 PV-0187 went approve→paid→void AFTER the migration, which proves the new mirror
 trigger on live data: without it Hong Leong would now be 22,174.00 overstated;
 it isn't.
 After: HL 222,135.25 == GL, Alliance 80,322.67 == GL, TB 0.00, per-bank columns
 foot to bank balances, rows foot to dept pool balances (inter-billing folds net
 to zero: −5,644.39 −23,882.01 +74,039.60 −48,775.20 +4,262.00 = 0), total cash
 302,457.92.
 **The 42,802.20 leg (PV-0184, 7/09, HL→Alliance) is NOT contra'd — confirmed by
 the user 2026-07-31 that one WAS a real bank transfer.** Only the 22,174.00 was
 direct-funded into Alliance by another company, hence only it needed the contra.
 Don't "fix" the asymmetry later.

0. **BLOCKER FIXED — every payroll_bank_transfer approval was dying** with
   `record "v_voucher" has no field "reference_id"` (user hit it on
   HV-PV-202607-0184, Director salary bank transfer Jun 2026, 42,802.20,
   request target_pool = dept_pool_director). Cause: mig 20260727100000 (the
   OTHER session's "custody follows the request's target_pool" change) reads
   `v_voucher.reference_id`, but the `SELECT … INTO v_voucher` list was never
   extended to fetch it. PL/pgSQL resolves record fields at execution time, so
   this shipped green and only broke when a payroll round was actually
   approved. Fixed by mig `20260731000000` (anchored patch, idempotent).
   **Related gap, FIXED (user chose "port it")**: both batch RPCs skipped
   payroll entirely — `voucher_type NOT IN (…, 'payroll_bank_transfer')` cut the
   drain loop and no custody block existed, so a payroll PV approved via BATCH
   moved bank cash while leaving every pool untouched (custody understated,
   paying depts overstated). mig `20260731010000` ports all three behaviours to
   `approve_voucher_batch` + `approve_voucher_batch_partial`: drain the source
   pools, allow 预支 while draining, credit the full round to the request's
   target_pool — plus reference_id added to both RETURNING lists (same trap as
   above). All three approval paths now behave identically; anchored + idempotent.
   NOTE: no payroll PV had actually been batch-approved, so there is no historical
   data to repair (checked: the only paid payroll transfers came through the
   single path).

User: "这笔无法记录 interest,我指的是打去 interest in suspense account."
Context found in the GL: a manual JV on 2026-05-20 carved the 300k back-to-back's
WHOLE-TERM interest out up front — Dr 3063 (Interest in Suspense - Recv - The Cont)
38,333.33 / Cr 3053, and Dr 4052 / Cr 4062 (Pay - HOUZS Century) on the funding
side. So 3053 now holds principal only, and collecting interest must DRAW DOWN
3063; crediting 5027 again would double-count income.
- lib/loans-coa.ts: `resolveInterestSuspenseLeaf` + INTEREST_INCOME_CODE /
  INTEREST_SUSPENSE_PARENT constants (matches a 3060 child by borrower name or
  short_code, same tolerance as the receivable resolver).
- recordRepayment accepts `interest_account_code`; applies ONLY to payment_type
  'interest', and validates it is 5027 or an ACTIVE child of 3060 — anything else
  throws rather than posting somewhere odd. recordLoanRepaymentReceived forwards
  it on the interest leg only.
- 收到 Loan 还款 form: an "利息入账科目" select appears only when interest > 0 AND
  that borrower's suspense leaf carries a balance; it DEFAULTS to the suspense
  account (the safe choice) with 5027 as the explicit alternative. /payments/new
  computes each loan's suspense leaf + live balance (is_reversed excluded).
- Only The Cont has a suspense balance today (3063 = 38,333.33); every other loan
  sees no select and behaves exactly as before.
3. **明细**: the single-month Cash Flow Statement ALREADY had drill-down
   (GlReportView ▸ + applyGlRefs) — user picked it, so the work was making the new
   gross rows carry per-side txns (done above). The Monthly Cash Flow MATRIX still
   has no drill-down (MonthlyMatrix has no txn expansion) — user did NOT ask for it
   this round; it is the obvious next request if they say 明细 again.

# (previous checkpoint) 2026-07-22 · project MOVED to local Desktop

> Context-window handoff. Read this first to continue. User communicates in 华语 (Mandarin).
> **PROJECT PATH since 2026-07-22: `C:\Users\User\Desktop\Claude\Venture\Venture-Portal`** —
> user un-synced OneDrive's Desktop backup; Windows relocated the real files to the local
> Desktop. The old `C:\Users\User\OneDrive\Desktop\Claude\...` tree is a DEAD dir skeleton
> (user may delete it). Payroll model: 2026-07-20C (FINAL custody model) SUPERSEDES the
> intermediate 2026-07-20B redesign below (kept for history).

## Session 2026-07-24B — fund-source-cancel enum bug + June funding deadlock found

1. **execute_fund_source_cancel enum typo (user hit live)**: Principal batch-approved;
   the HOUZS Century cancel card (RM 45,156.32, tier_change) died with `invalid input
   value for enum fund_source_type: "dept_pool"` — the dept-pool guard compared against
   'dept_pool' but the enum label is 'department_pool' (bug since mig 20260612050000;
   EVERY cancel approval would die there). Guard sits BEFORE any write → zero financial
   rows moved; only the card was consumed approved-without-effect (approvals action
   records approval BEFORE calling the RPC — known ordering weakness, not fixed today).
   Fixed by mig `20260724030000` (literal → 'department_pool', body otherwise identical);
   card 783ab989 flipped back to pending by support SQL → Principal just re-approves.
2. **June funding deadlock (diagnosed, awaiting user go-ahead)**: HR Payment page's
   PV-making sections (staff/director batches + statutory table) unlock ONLY at
   phase='funded' (request status 'completed' or run 'paid'); the create_* RPCs enforce
   the same. June request 37aa7f87 (95,390.70, owns PAID PV-0100 84,818.28 + voided 0115)
   was CANCELLED by mig 20260722100000's void-reset (other session). Committed is counted
   per-request (payment_vouchers.reference_id = request id), so a re-filed request starts
   at 0/95,390.70 and either double-transfers or never completes → sections never unlock.
   DONE (user said 复活, 2026-07-24): 37aa7f87 restored to 'pv_generated', cancel fields
   cleared, pv_id re-pointed at paid PV-0100, note appended; verified committed 84,818.28
   / remaining 10,572.42. USER'S PLAN (their own hands, we only verify after): Finance
   generates the 10,572.42 remainder PV (HL→Alliance) → Principal approves → request
   auto-completes → HR page unlocks; then an OFFSETTING internal transfer
   (Alliance→HL 10,572.42, 备注对冲) because HOUZS Century's deposit landed directly in
   Alliance so no real bank movement is wanted — the two documents cancel in-system, NO
   real bank transfers will be made (user decision; bank statement will have no matching
   flows — remember at reconciliation). Going-forward rule set by user: external money
   always lands in Hong Leong; Alliance receives payroll custody only. Also fixed today:
   fund-source cancel refunds from RECEIVING bank (mig 20260724040000) after user caught
   the HC 45,156.32 deposit was in Alliance while the executor hardcoded primary (HL);
   HC deposit had been DOUBLE-activated (dupe approved in the same batch as the enum
   crash) — the cancel card targeted the dupe (2f87e5ae), re-approved cleanly: banks
   cache==GL both, TB 0.00, vp net single-counted.

## Session 2026-07-24C — evening fixes
1. **createPaymentVoucher errors now readable in prod**: the action's throws were
   sanitized by Next in production ("An error occurred in the Server Components
   render…") — user stuck building the Alliance→HL offset with an empty required
   Description and no way to know. Wrapped: createPaymentVoucherInner + exported
   wrapper returns {error} (NEXT_REDIRECT rethrown via digest check); NewPaymentForm
   shows result.error. June funding VERIFIED COMPLETE: PV-0153 remainder paid (dept
   slices Mkt 5,145.95/Fin 2,937.45/HR 1,722.77/DO 766.25; custody np_in 10,572.42),
   PV-0154 offset paid (Dr3000/Cr3010, zero pool rows), request completed, HR page
   unlocked, banks cache==GL, TB 0.00. NOTE: HL down to ~2,135 (user approved 3 big
   pending PVs 158,780 total) — cash-thin, flagged to user.
2. **Repayment Schedule month-blind pending-PV fix**: sources carrying an in-flight
   repayment PV surfaced in EVERY viewed month (HC 45,156.32 pending
   HV-PV-202607-0178 polluted JUNE's to-repay). Both the skip-exception and the
   pending-row branch now require isCurrentMonth. Also flagged to user: 0178's
   interest 451.56 = a FULL month on a deposit held ~9 days — confirm before
   Principal approves.
3. User password changes: guided via Supabase dashboard SQL editor (their own hands,
   test password; SQL editor history cleanup advised).
4. **P&L layout drift fixed (user: why doesn't P&L mirror my COA Revenue tree)**:
   the saved pnl layout (06-29) listed only 4 revenue codes — 5001/5021-5025 and
   inter-billing 9052-9056 were never added, landing in Unassigned or invisible.
   (a) Layout patched by SQL: Revenue now lists all 10 codes, Expenses all 18 —
   hierarchy renders via ancestry so children nest under 5010/9050 headers.
   (b) buildCustomPnlRows now AUTO-FILES un-placed accounts into the category
   matching defaultCategory (same pattern buildCustomCashFlowRows already had;
   +4 tests, suite 404). Unassigned only remains when no matching category exists.
   NOTE: local tsc shows 5 errors in the user's untracked `* - Copy.tsx` snapshots
   (drifted vs the other session's RequestState/batchState changes) — NOISE, not in
   the repo, never touch those files; filter with grep -v ' - Copy'.
   PENDING from user: "marketing rental" report change (not yet described).
5. **Revenue reclass (user request, DATA surgery)**: invoice line categories were
   stored but the pre-Mig-275 issue JEs lumped every multi-line invoice's credit
   into 5000. Reclassed 38 issued/paid invoices (May-Jul) in one transaction:
   per-invoice, deleted the lumped 5000 credit line and inserted per-category
   credit lines from invoice_lines (grouped, description 'Reclass 2026-07-24: …');
   preflight required JE-credit == lines-sum on every invoice (all OK), post-check
   required every touched JE balanced (pass), TB 0.00. Result: May/Jun/Jul 5000 = 0,
   revenue sits in 5001/5021-5026 (+7012/9087/9091 recoveries); Feb-Apr stay in
   5000 (no line data existed). Mig 275 keeps new issues correct.
6. **Consolidation elimination (user request: "这样就出两次费用了")**: new
   lib/consolidation.ts — fetchInterBillingElimination (internal invoice ids =
   billable_to_type dept_pool|director; 9050-family codes) + eliminateInterBilling
   (drops lines whose ref_id is an internal invoice, plus any 905x line). Applied
   ONLY on the consolidated (no-segment, non-dept-manager) view of P&L Statement +
   Monthly P&L + both exports; per-segment views unchanged; BS/TB/CashFlow
   untouched; Net Income unchanged (pairs netted anyway). UI notes on both pages.
   +3 tests (suite 407).
7. **Inter-billing BY NATURE (user Q1-Q3)**: paying dept's expense now posts to what
   the charge actually WAS — lib/inter-billing-nature.ts payerExpenseSplits: income
   category → payer counterpart (7012→9094 Office Rental, 5020→9030 Salary Expense),
   expense-type category (recovery, e.g. 9091) → same account, unmapped → dept 905x
   FALLBACK (accounts kept, normally zero — user Q3 answered 保留). Wired: billing/
   actions approveInvoice + approveInvoicesForPeriod issue-JEs (per-nature debit lines,
   interBillingNatureSplits helper, fail-loud on sum mismatch) + payments/actions
   mirror rows (per-nature, falls back to lump on mismatch). HISTORY reclassed by SQL
   (user Q2 要): preflight proved 0 multi-nature internal invoices, 11 GL 905x lines +
   7 mirror rows all single-nature → in-place account swap (amount untouched, JEs stay
   balanced): Marketing 905x → 9094 7,510.45 + 9091 1,677.19; VO 821.86 → 9030.
   Post: 905x GL 0.00, PVS 905x 0, TB 0.00. Consolidation elimination still covers
   these lines via the invoice-ref rule (905x belt now vestigial but kept).
8. **Loan Aging report (user Q4-Q6)**: /reports/loan-aging + xlsx/pdf export + Reports
   index card. BOTH directions (Q4 要 fund in 也要): 应收 Fund OUT loans / 应付 Fund IN
   sources. lib/loan-aging.ts buildInstallmentAging — flat amortisation, first due =
   month after disbursement/effective, pooled payments FIFO oldest-first, buckets
   due-this-month / 1 / 2 / 3+ months late (Q5 ok); compounding & no-fixed-term in a
   separate NOT-AGED block below each table (Q6), outstanding shown in Total column.
   lib/loan-aging-data.ts fetch+matrix (reuses monthly-matrix kit; aging = exceptions
   report — fully-on-track loans are hidden). +12 tests (suite 419).
   **SUPERSEDED same day → Loan Monitor**: user saw the buckets and redefined ("我要的
   是根据定好还款日期的,当月没还的" + outstanding split 定好/没定好). Discovered via
   repayment notes ("本金 1/6 (本月起还)") that schedules get renegotiated starts the
   system never stored — months-late math was meaningless. Rebuilt:
   - mig `20260724050000`: loans.repayment_start_month + fund_sources.repayment_start_
     month (nullable; stored month IS installment #1; NULL = disb/effective +1) + two
     SECURITY DEFINER setters (finance/principal).
   - lib/loan-monitor.ts (fetchLoanMonitorData + resolveFirstDueYM/remainingPeriods;
     old loan-aging*.ts DELETED): 区1 本月应收/应付 (started plans with remaining
     periods; shortfall = this month's installment − paid this month; settled rows
     disappear); 区2 Outstanding split scheduled vs 未定, per side, with start labels.
   - /reports/loan-aging page rebuilt (Debtor-Aging-style ledger tables, SC badges,
     sidebar/card renamed "Loan Monitor", route unchanged); export = one matrix
     [Due/Paid/Shortfall/Outstanding].
   - RepaymentStartEditor on BOTH detail pages (fund-out + fund-in) via
     setLoanRepaymentStart / setFundSourceRepaymentStart.
   - Data: CONTS 58k & 60k @4% set to 2026-05 start per the notes evidence.
   Suite 417 (aging tests removed, monitor tests added).
   **Follow-ups the same evening (user walked every row)**: aging buckets RETURNED
   into 区1 (anchored on repayment_start_month; loan-aging.ts restored from git);
   exports split into ?view=aging|outstanding using the Debtor-Aging white PdfTable
   kit (PDF font has no CJK — export labels are compact ASCII; SC is its own
   column, page keeps the web chip); more agreed starts set by evidence/user:
   HC 60k & 58k @3% → 2026-05, BOTH 300k positions (CONTS loan + HC source) →
   2025-01 (user confirmed repayments ran since Jan-25). Directors RLS opened to
   finance for SELECT (mig 20260724060000) — names were '—' everywhere for
   finance. **L32 netting row DELETED** from fund_source_repayments: the
   53,613.75 '2990 knock-off HC outstanding' was wrongly mirrored onto the HC
   100k@2%/3mo deposit (user: that deposit was never repaid); the counterparty-
   level swap already lives in manual JV-000010 (Dr 4052 / Cr 4051, 2026-03-29).
   ⚠️ KNOWN RECONCILING ITEM: HC's per-deposit outstanding sum now exceeds GL
   4052 by 53,613.75 (the JV nets HC at account level only, attached to no
   deposit). If HC ever agrees which deposit it settles, record a netting
   repayment there and the gap closes. Confirmed real arrears (user): CAR 200k
   (owes May-Jul), 2990 100k (nothing paid), 2990 200k payable, Kingsley 100k
   payable. HC 100k@2%/3mo now shows all 3 installments overdue (~106k incl
   interest) — real per user.

## Session 2026-07-22 — OneDrive un-sync recovery + fund-out 资金来源 field

1. **Recovery**: full project found at the new Desktop path (Known Folder Move). git HEAD
   `5fc3d31` = last push, fsck clean, `.env.local` intact. The move had staged 276 tracked
   files as deleted → `git checkout -- .`; node_modules half-broken → `npm ci`. All gates
   green after reinstall (tsc clean · 380 tests · build OK). Silver lining: the OneDrive
   `.next`-lock quirk (EINVAL during build while dev server runs) is gone.
   NOTE: the bound `mcp__supabase__*` MCP server lost its config in the move — DB access is
   via the account-level Supabase MCP server (execute_sql/apply_migration with
   `project_id: "gixpptmfuryskbwkmiwz"`).
2. **fund-out 资金来源 (user request)**: New Loan form now has a dedicated "资金来源 ·
   Funding source" input (NewLoanForm). createLoan sanitises it (strips `·`, the parser's
   delimiter) and appends `· 资金来源: {x}` to repayment_terms AFTER the 未定还款 prefix
   logic; `fundingSourceFromTerms()` (lib/utils) parses it back for the SC badge on the
   loans list + repayment schedule. Amend form hint documents the same convention (its
   free-text terms box already lets Finance add/edit the suffix on existing loans).
   User then chose "办法3" (self-service): the Amend form turned out Principal-ONLY
   (amendLoan + /edit page both requireRole(['principal']), active loans only), so Finance
   couldn't edit old loans at all. Added mig `20260722000000_loan_funding_source_rpc`:
   `terms_with_funding_source(terms, source)` (IMMUTABLE segment rewrite — drops any
   existing 资金来源 segment incl full-width colon, preserves 未定还款/[LO#…] markers
   verbatim, appends canonical `· 资金来源: X`, NULL when empty; 7 edge cases verified by
   live SELECT) + `set_loan_funding_source(p_loan_id, p_source)` SECURITY DEFINER RPC
   (finance/principal via current_user_role(), strips `·`/newlines, max 60 chars, any loan
   status). UI: FundingSourceEditor on the loan detail page (inline input + 保存, empty =
   remove badge) via new setLoanFundingSource action. Rates/tenure/dates stay
   Principal-only. ~~STILL PENDING (user-side): fill sources for the July loans — Carres
   10k, The Cont 10k + 80k, 2990 60k, CMI 55,540.08, Hookka 98k~~ — **DONE by the user;
   re-swept 2026-07-31: every JULY loan now carries a badge** (Carres 10k / The Cont 10k
   = 2990s, The Cont 80k + 2990 60k on 7/07 = HC, 2990 60k on 7/24 = Conts; the active
   Hookka 98k = HC — only its CANCELLED twin has none, which is fine). Four OLDER loans
   still lack the badge:
   - 2990 10,000 (2026-04-30, active) — terms already say "资金从 Kingsley 借过来";
     format-only, just needs "Kingsley" through the field.
   - CMI 55,540.08 (2026-06-25, active) — terms say "Capital Inject - from Houzs";
     matches fund source **HC 55,540.08 eff 2026-06-27** to the cent. HC *is* Houzs
     Century, so format-only too.
   - CONTS 120,000 (2026-06-08, fully_repaid) — no source at all, but fund source
     **HC 120,000 eff 2026-06-08** is same-day same-amount. Near-certain HC; user to confirm.
   - CONTS 50,000 (2026-05-11, fully_repaid) — no source. **ANSWERED by the user
     2026-07-31: it is two sources — 2990's 45,000 fund IN PLUS 5,000 of Venture's OWN
     fund pool.** Not a missing record, a split funding. Don't re-raise it as a gap.
   Nothing written — user asked for a look only.
3. **List columns + search (user requests)**: Fund IN list rebuilt on SortableTable
   (new _components/FundSourcesTable.tsx — search box over From/Type, click-sort all
   columns, facet filters on Type/Status; StatusLabel moved in there; page.tsx now just
   maps rows). Confirmed for user: both lists default to the ACTIVE tab — settled items
   sit under Repaid/Fully-repaid/All, not gone. Fund IN table + Date (effective_date) + Outstanding
   (fund_source_outstanding view; shown for active/matured, — otherwise). Fund OUT table:
   "Created" column → "Disbursed" (disbursement_date; created_at stays in the small line
   under the company name; default sort now disbursedAt). LoanRow.disbursedAt is OPTIONAL
   on purpose — the stray `fund-out/page - Copy.tsx` (user's snapshot file, off-limits,
   see below) imports LoansTable and must keep type-checking. Both lists confirmed to
   default to the ACTIVE tab (settled items live under repaid/fully-repaid/All tabs).
   NOTE: user directive 2026-07-22 — repo contains `... - Copy` snapshot files
   (design-import/, src/app pages/actions) that are the user's own copies; NEVER delete/
   edit/clean them, and stage commits with explicit paths (no `git add -A`).
4. **Fund IN 撤回 (2026-07-24, user request)**: Finance had NO way to kill a wrongly
   submitted pending_approval fund source (detail page offered Edit only;
   cancelFundSource requires status='active'). New mig `20260724000000`:
   `withdraw_pending_fund_source(p_fund_source_id)` SECURITY DEFINER — asserts
   pending_approval, flips to cancelled, closes its pending approval_requests card with
   Principal-reject-identical fields (Finance RLS can't update approval_requests inline —
   the voided-PV silent-0-rows class). UI: 撤回 · Withdraw button next to Edit in the
   pending Actions section. Pending = no money moved, so nothing to reverse; mirrors Fund
   OUT's Finance-cancel-before-approve. User had 2 wrong pending entries to withdraw.
   **v1 BUG (user hit it, crash page)**: v1 set approved_by = auth.uid() on the card —
   but withdrawer IS the submitter, and CHECK no_self_approval forbids approved_by =
   submitted_by → RPC raised, action THREW → app-wide error page; RPC rollback left both
   sources safely pending. Fix mig `20260724010000`: approved_by stays NULL (constraint
   allows; approved_has_metadata only binds status='approved'), notes = 'Withdrawn by
   submitter before approval'. UX: action now RETURNS {error}; new WithdrawButton client
   component (replaces ConfirmButton usage) shows it inline. LESSON for this codebase:
   fund-in page-level actions that throw (cancelFundSource etc.) crash to the error page —
   prefer returned errors for user-triggered actions. SEPARATE pre-existing noise spotted
   in postgres logs: recurring `invalid input syntax for type uuid: "null"` (also fired
   2026-07-23, predates all of this) — some query passes literal 'null'; not yet traced.
5. **Receipts page shows ALL money in (user request)**: /receipts now merges two
   synthetic row kinds into the OR ledger (VoucherLedger isReceipts branch):
   direct loan repayments (`repayments` EXCLUDING rows whose notes start
   'Auto-synced from voucher' — those are OR-driven and already listed as their
   HV-OR; the approve RPCs stamp that prefix) and Fund IN capital
   (fund_sources status active/matured/repaid, dated effective_date). Rows are
   unnumbered, status 'received' (green), Category 'Loan repayment · type' /
   'Fund IN · type', View links to /fund-out/{loan} & /fund-in/{id}
   (VoucherRow gained optional href; VouchersTable defaultSort now Date desc so
   unnumbered rows interleave; STATUS_STYLES + 'received'). They obey q/date/
   min/max filters + All/Paid tabs; a voucher-type or pool filter hides them
   (no such fields) — Category funnel narrows per kind. Hero Total received
   now includes them with a breakdown line. Extras logic extracted to
   lib/receipt-extras.ts (fetchReceiptExtras + filterReceiptExtras) and the
   /payments/export route now appends them for direction=credit, date-sorted
   (type column 'loan repayment'/'fund in', status 'received') — page and
   export agree. ALSO: Principal accidentally submitted HV-PV-202607-0111
   (RM 320, W MEDIA PRODUCTION) — no_self_approval correctly blocks Principal
   approving own submission. REMEDY BUILT (user request): mig `20260724020000`
   `return_voucher_to_draft(p_voucher_id)` — pending_approval only, refuses
   grouped cards (batch approvals must not fracture), flips PV → draft and
   closes its pending card (rejected, approved_by NULL per no_self_approval,
   notes 'Returned to draft for resubmission'). Nothing financial posts at
   pending stage (verified 0 pool/JE rows for PV-0111). UI: 「退回 Draft」
   button on the voucher page for pending PVs (both roles; VoucherActions
   optional returnToDraft prop; action returnVoucherToDraft). Flow: Principal
   或 Finance 点退回 → Finance opens the draft PV → Submit for approval (new
   card stamped submitted_by=finance) → Principal approves. FOLLOW-UP the same
   day: user resubmitted from the PRINCIPAL session twice more (page's
   isFinance = finance OR principal, so Principal also saw the Submit button;
   DB showed 3 principal-submitted cards). Fixed: VoucherActions draft block
   hides Submit for isPrincipal + shows an alert box explaining; PV-0111
   returned to draft by support SQL (card closed, notes '(support: submitted
   from Principal account again)'). Voucher was CREATED by Finance — only the
   submits were from the Principal session (likely two logged-in windows).
   Director Pool v2 to main (4 commits, `7624312..3d5e10d`: standalone Salary Pool
   calculator port + Save/Clear + Flow view fixes; migrations `20260717130000_director_
   pool_calculator` + `20260721100000_dp_hr_access` — assume both applied to live DB;
   roles.ts + database.types.ts changed; +20 tests → suite now 400). This session's work
   was rebased on top; no file overlap.

## Session 2026-07-21B — self-audit findings + fixes (mig `20260721010000`)

User asked for a bug sweep over the day's overhaul. Invariants all green (TB 0.00, Σpools +
GL(corp/treasury) == banks == 138,287.61, zero unbalanced JEs). Two real defects found+fixed:
1. **Cash-flow bridge void contamination** — voiding a paid PV REVERSES its pool rows with
   void_in/void_out rows but keeps the ORIGINALS; both bridge matchers (inter-billing AND
   the new payroll custody) counted the originals while the void rows never match → voided
   HV-PV-202607-0115's round (and one historical voided receipt with inter_billing rows)
   leaked phantom transfers into per-segment Cash Flow. Fix: the bridge now loads voided
   voucher_nos and skips any pool row whose `PV <ref>:` belongs to one (both flavours).
2. **approve_voucher_batch had NO bank-balance guard** — it decremented the cache
   unconditionally; a grouped approval (exactly the June staff batch scenario) could drive
   Alliance silently negative. Guard added matching approve_single_voucher
   (mig `20260721010000`). Note: approve_voucher_batch_partial already had a BETTER guard
   (per-bank jsonb pre-aggregation) — only the full-batch RPC was exposed.
3. **Voided PVs left PENDING approvals in Principal's queue** (user-spotted) — voidVoucher's
   inline approval rejection ran under the caller's RLS; Finance can't update
   approval_requests, PostgREST returned success-with-0-rows unchecked → 17 live orphans
   (the 16 voided statutory PVs + one from 2026-07-15). Cleaned by direct SQL; NEW
   SECURITY DEFINER RPC `close_approvals_for_voided_voucher` (mig `20260721020000`)
   verifies the voucher is voided then rejects its pending approvals; voidVoucher now
   calls it and FAILS LOUD. (Approving an orphan was money-safe — approve RPC raises on
   non-pending vouchers — but the queue filled with dead cards.)
Pre-existing item REPORTED, not touched: **4070 Accrual-Salary carries a legacy residual** —
balance 113,756.20 vs June outstanding 117,528.75 (their month-end JVs); history (Jan-Mar
opening-era credits, Apr-Jun mixed) nets −3,772.55, so after June's full payout 4070 will
land at −3,772.55 instead of 0 → needs a Finance ruling/reclass someday. Same class of
history exists on 4071-4074 (balances 31,641.00 / 4,689.85 / 739.00 / 10,788.90 include
pre-June months).

## Session 2026-07-21 — HR is the payroll payments operator (mig `20260721000000`)

User clarified real practice: HR (not Finance) makes the salary/KWSP/PCB/SOCSO payments, staff
and directors may be paid on DIFFERENT days, and statutory bodies are paid ONE AT A TIME.
- `create_payroll_disbursement_vouchers(period, scope, payment_date)` — scope 'staff' |
  'directors'; each scope = its OWN batch/approval-group/date; per-scope dedupe (staff can
  run while directors wait, e.g. while director actuals are still being keyed).
- `create_payroll_statutory_vouchers(period, scheme, payment_date?, bank?)` — ONE scheme per
  call (KWSP/SOCSO/EIS/PCB/SKBBK), per-scheme dedupe (void one, regenerate just it).
- NEW `set_payroll_pv_payment_date(voucher, date)` — hr/finance/principal; pending
  payroll_disbursement/payroll_statutory only (dates are HR's knowledge; /payments editing
  stays Finance-gated).
- HR Payment page rebuilt: Staff batch card + Director batch card (own date pickers) +
  statutory 5-row table (staff/director split per scheme, generate + date + save-date per
  row, voucher links). Also gained a MONTH SELECTOR (?period= + arrows) — the page was
  pinned to the calendar month while cycles finish the following month.
- Finance's payroll-requests statutory section → READ-ONLY (links + dates); its generate
  action removed. Finance's payroll role = funding rounds + month-end JVs only.
- Live-safety during the signature swap: generators are gated on funding completed; June's
  request is NOT completed (round 2 voided), so nothing could call mid-deploy.
- **Payroll custody CASH-FLOW BRIDGE added** (closes the 20C known follow-up): the funding
  reallocation (dept expense_out → HR custody np_in, dept_pools-only) now feeds synthetic
  lines into all four Cash Flow surfaces via `inter-billing-cash-flow.ts` — new pseudo
  Financing account `PY-XFER` "Payroll custody (internal transfer)"; payers matched to
  custody receipts by the funding PV ref (custody marker "payroll fund → HR custody").
  Each dept's per-segment Cash Flow now shows "Transfer to HR payroll custody" out, HR
  shows the custody in; consolidated unchanged; monthly custom layout files PY-XFER under
  Financing via ensureInterBillCategory. 4 new tests (380 total).

## Session 2026-07-20D — accrual convention locked: pure-transfer funding + 4070-74 clearing (mig `20260720160000`)

Discovery: Finance ALREADY books the monthly payroll accrual manually — five per-segment JVs
on 2026-06-30 (`JE-202606-0226..0230`, incl. DIRECTOR), their convention:
**Dr 9030 basic + 9084 allowance + 9081/9082/9083 ER contributions / Cr 4070 net · 4071 EPF ·
4072 SOCSO(+SKBBK — user: SKBBK stays in 4072) · 4073 EIS · 4074 PCB.** Staff dept totals tie
the funding to the cent; the system's auto-accrual (Dr 9030/Cr 4020 at funding) was therefore
DOUBLE-COUNTING June P&L. User rulings: funding = "fund transfer purpose 罢了" (no expense);
SKBBK → 4072; director actuals 以用户手工 JV 为准 (JV: net 45,144.35 / EPF 13,961.00 /
PCB 8,691.35 — DIFFERS from the engine's director_payouts: 38,129.40 / 11,408.00 / 7,431.80).

- **approve_single_voucher**: payroll_bank_transfer posts ONLY the hr-segment staging JE
  (Dr 3010/Cr source). No accrual. Dest (Alliance) cache credit now via
  `credit_dest_bank_on_bank_transfer` — funding PVS rows carry account_code **3010**
  (generatePvFromRequest changed 9030→3010; PV detail shows bank staging, not Salary Expense).
  Pool drains + FULL-round HR custody credit + bank guard unchanged.
- **Disbursement PVs** (staff AND director): account **4070** (was 4020/9030).
- **Statutory PVs**: five schemes now cover STAFF + DIRECTORS in one payment each —
  KWSP→**4071** · SOCSO→**4072** · EIS→**4073** · LHDN→**4074** · SKBBK→**4072**; two PVS
  rows per PV (staff share dept_pool_hr, director share dept_pool_director).
- **June dedup (direct SQL, recorded)**: deleted the 8 auto-accrual JEs (July-dated,
  Dr 9030/Cr 4020) after re-pointing PV-0100's backlink to its staging JE (PV-0115 → NULL);
  funding PVS account_code → 3010. Verified: 4020 balance **0**, July payroll expense **0**,
  June salary expense (9030+9081-84) = **163,818.20** == the 5 manual JVs exactly
  (staff 95,390.70 + director 68,427.50), TB 0.00, Σpools+venture = banks = 138,287.61.
- ⚠️ BEFORE June payouts/statutory: **director_payouts must be updated to the user's JV
  numbers** (owner: HR/Principal via the Director Salary actual grid — Finance must not
  write it, dept-data boundary). Until then the PVs would generate from engine numbers and
  4070/4071/4074 would not clear to zero. Also investigate later WHY the engine differs
  (allowance 3,079.30 not modelled, EPF basis, PCB table?).
- Alliance cash for the full June cycle at the user's numbers = 163,818.20 total out;
  after PV-0115's pending 10,572.42 transfer Alliance ≈ 141,129.47 → still ~22,689 short
  (director side) — one more HL→Alliance top-up when director numbers are final.

## Session 2026-07-20C — payroll model: HR CUSTODY (mig `20260720140000`, deployed + applied)

After running both models the user ruled: **"payroll request 就是扣各个部门的 fund 去 HR 的
Alliance"** — the ORIGINAL custody flow was right all along; only its bug (HR's own share
leaking) needed fixing. This supersedes 20B's pools-drain-at-payout model. Gates green;
live DB migrated; June data re-aligned; invariant Σpools + GL(corp/treasury) == banks holds
(verified 144,141.94 − 5,854.33 = 138,287.61 == bank caches; TB 0.00).

### Final flow (as-built)
1. **Funding PV approval** (`payroll_bank_transfer`, partial rounds, amounts typed by
   Finance per dept — manual adjustment preserved):
   - Dr 9030 / Cr 4020 per dept segment (P&L per dept) — unchanged;
   - **drains each source dept pool by its typed share** (short pool → negative, 预支,
     GUC auto-set for payroll_bank_transfer);
   - **credits dept_pool_hr with the FULL round** (`PV %s: payroll fund → HR custody`)
     — includes HR's own share, THE bug-fix vs the old fan-out;
   - source bank guarded + debited, Alliance (GL 3010) credited;
   - ONE staging JE per round, **segment='hr'** (Dr 3010 / Cr 3000) — per-bank table
     shows HR's Alliance slice swelling and each dept's row shrinking via pool balance.
2. **Stage-G staff payouts** (one PV per employee, HR creates batch, Principal one-click):
   drain `dept_pool_hr` only; `derive_journal_segment` now maps payroll_disbursement →
   staff rows 'hr', director rows 'director' (was staff-dept / 'director_office').
3. **Statutory**: FIVE ungrouped PVs — KWSP / PERKESO (SOCSO) / PERKESO (EIS) / LHDN /
   SKBBK — each ONE payment to its scheme, single PVS row `dept_pool_hr` acct 4020,
   payment_date NULL for Finance (2-arg RPC again; the split-by-dept variant and its
   UI checkbox are GONE — user voided the 16-PV experiment). June amounts: KWSP 18,496.00 ·
   SOCSO 1,596.60 · EIS 283.80 · LHDN 2,097.55 · SKBBK 532.35.
4. Directors unchanged (dept_pool_director; 4 PVs June, 38,129.40; staged via PV-0109).
- HR pool balance = the payroll war chest; hr-costing/payment hero shows it again
  ("HR Pool · payroll custody"). It SWELLS between funding and payday BY DESIGN (user
  accepted after the 白话 explanation); after June's full payout it lands back at ~315.42.

### June data re-alignment (direct SQL, recorded for audit)
- Re-inserted the 8 funding `expense_out` drains (dept typed shares, with approval_ids —
  `expense_has_approval` CHECK requires them; overdraw GUC needed for Marketing) + 2
  custody `np_in` (84,818.28 / 10,572.42 FULL rounds → HR).
- PV-0100's four staging JEs re-tagged segment→'hr' (custody pot, not per-dept slices).
- Pools after: HR **95,706.12** (pot 95,390.70 + own 315.42) · Finance 510.21 ·
  Marketing **−24,659.54 (预支)** · DO 125.89 · Director 68,197.26 · VO 4,262.
- Banks during verify: 138,287.61 (a live Carres receipt OR-0125 +3,339.81 landed
  mid-check — user activity, correctly recorded).

### June remaining steps
1. HL→Alliance transfer for **PV-0115's 10,572.42 still physically pending** (HL holds
   ~7.7k; needs inflow). Retrofit its staging JE + caches when the user confirms, same as
   PV-0100's (whose 84,818.28 IS transferred + recorded).
2. HR creates disbursement batch (18 staff PVs, 72,384.40) → Principal approves batch.
3. Finance generates the 5 statutory PVs (bank picker defaults Alliance), sets dates →
   Principal approves. After everything: HR pool ≈ 315.42, 4020 → 0, Alliance drains by
   133,520.10 total (incl. directors); approve the last ~RM 3k of vouchers only after
   0115's transfer or Alliance cache blocks them.
- ⚠️ Known follow-up (queue if user cares): per-segment Cash Flow report doesn't bridge
  the custody pool rows (funding expense_out / custody np_in are dept_pools-only, like
  inter-billing before the 20A bridge) — dept per-segment CF vs pool will diverge by the
  payroll flows for July+ months until a bridge like `inter-billing-cash-flow.ts` covers
  `PV HV-PV-%` custody pairs. The dept-pool page itself stays tied (fold-into-HL logic).

## Session 2026-07-20B — payroll money-flow REDESIGN (mig `20260720100000`, deployed + applied)

User spotted HR pool at RM 74,355.02 ("HR 不可能那么多 fund") — correct instinct. Root cause +
redesign, all DEPLOYED and the live DB migrated + data-corrected. Gates green (tsc / 376 tests /
build). **RECONCILED at session end: Σ6 segments 134,947.80 == bank caches == GL; TB 0.00.**

### Root cause (June was the FIRST real run of the new payroll cycle)
- Stage-E funding approval drained ALL 4 dept pools (`expense_out`), then trigger
  `fan_out_payroll_bank_transfer` parked only the NON-HR sum (74,039.60) into HR's pool —
  **HR's own 21,351.10 vanished from the pool system** (live: pools+Venture 113,596.70 vs
  banks 134,947.80; the dept-pool page's footer "Bank balance" is a COLUMN SUM, so the leak
  was invisible on-page).
- Stage-G would then drain dept_pool_hr for EVERY employee (~94,858) against a 74k pot —
  HR would have landed ~−20.5k (double-drain of HR's own share).

### New model (user ruling: "凑钱只是换银行,各部门扣各部门")
- **Funding PV approval** = per-dept salary accrual (Dr 9030/Cr 4020, unchanged) **+ real
  HL→Alliance staging transfer**: source bank guarded+debited, Alliance (GL `3010`) credited,
  one transfer JE per pool slice (Dr 3010/Cr source, segment-tagged). **NO dept-pool writes.**
- **Stage-G disbursement**: each staff PV drains the **staff's own dept pool** (was
  dept_pool_hr for all); directors unchanged (dept_pool_director). GL side already resolved
  per staff dept via `derive_journal_segment` — pools now match it.
- **Statutory**: NEW RPC `create_payroll_statutory_vouchers(period, bank, split_by_dept)` —
  one-click KWSP / PERKESO(SOCSO+EIS) / LHDN(PCB) / SKBBK PVs (acct 4020),
  **payment_date NULL** (几时付款不确定 — Finance edits the pending PV, GL date follows).
  `split_by_dept=false` (default): one PV per body, PVS split per dept pool inside;
  `true` ("one PV per department" checkbox, mig `20260720120000`): one PV per
  body × department, each independently dated/approved (user: 缴款可能分不同 PV、
  不同日期、不同部门). Bank picker defaults to Alliance (GL 3010 first) — the funding
  staged the statutory share there. UI: "Statutory payments" section on
  /payments/payroll-requests (recent completed periods).
- **Overdraw**: auto-allowed (预支) for reference_type `payroll_disbursement` /
  `payroll_statutory` in ALL THREE approve RPCs — batch RPCs previously NEVER set the GUC,
  so June's Stage-G batch would have been blocked on the first short pool.
- Funding UI: Generate-PV form re-gained a **source-bank balance check** (client+server;
  approval re-checks with row lock); pool-overdraw warnings removed from funding (obsolete);
  hr-costing/payment hero now shows the **Alliance payroll bank** balance, not HR pool.
- `fan_out_payroll_bank_transfer` trigger + function DROPPED.

### Data corrections (direct SQL, recorded here for audit — NOT in migrations)
- Deleted the 2 `np_in` "Payroll consolidation" rows (74,039.60 → HR) + the 8 funding
  `expense_out` rows (95,390.70 across Mkt/Fin/DO/HR) for PV-0100/0115, and the 2
  `dept_transfer` JEs `JE-202607-0247`/`JE-202607-0263` (+8 lines, 1030-1060 accounts only).
  The 8 per-dept accrual JEs (Dr 9030/Cr 4020) REMAIN — correct under the new model.
- Post-cleanup pools: HR 21,666.52 · Finance 24,392.22 · Marketing 19,031.80 · DO 6,592.14 ·
  Director 68,197.26 (unchanged) · VO overlay 4,262. All == their GL expectations.
- ⚠️ MCP lesson RECONFIRMED: a `begin;`-only batch (no `commit;` in the SAME call) silently
  rolls back. First delete attempt no-oped; re-ran with inline commit and verified.

### June cycle — what still has to happen (in order)
1. ~~Physical HL→Alliance transfer~~ → **PARTIALLY DONE + RECORDED** (user confirmed
   2026-07-20: the RM 84,818.28 for PV-0100 WAS physically transferred at the bank; the
   10,572.42 for PV-0115 was NOT). Direct-SQL data correction (recorded here): PV-0100
   retrofitted with the new-rules staging legs — 4 per-dept JEs Dr 3010 / Cr 3000 dated its
   payment date 2026-07-07 (Mkt 38,545.39 / Fin 20,944.56 / HR 19,628.33 / DO 5,700.00) +
   caches HL −84,818.28 / Alliance +84,818.28. Verified: HL cache=GL=4,390.75, Alliance
   cache=GL=130,557.05 (== what net banking should show), TB 0.00; per-segment Alliance
   slices: Mkt 39,437.19 · Fin 21,454.76 · HR 19,943.73 · DO 5,825.90 · Director 44,355.47.
   **⚠️ PV-0115's 10,572.42 transfer still pending** — HL only holds 4,390.75, so it needs
   a cash inflow first; when the user transfers it, retrofit PV-0115 the same way.
   Note: PV-0109 (42,802.20, internal_transfer, 2026-07-09) was DIRECTOR money staged to
   Alliance — unrelated to staff payroll. Alliance PV-0109-era money belongs to Director;
   until 0115's transfer, June payouts borrow ~10,572.42 of it (预支, self-heals).
2. HR runs **Stage-G** (hr-costing/payment → create disbursement batch) → Principal approves
   batch → each dept pool drains its own staff nets; Alliance pays.
3. Finance generates **statutory PVs** (payroll-requests page), sets payment dates, Principal
   approves — drains dept pools per dept statutory (22,473.95 total for June).
4. ~~532.35 over-accrual flag~~ → **RESOLVED (user): it's SKBBK** — a net-only employee
   deduction InfoTech's June export introduced. The pre-2026-07-03 importer dropped the
   column, so June rows had `skbbk_amount=0` while net was already after-SKBBK. Backfilled by
   direct SQL (17 rows, 532.35), then **SKBBK added as a 4th one-click statutory voucher**
   (mig `20260720110000`, KWSP/PERKESO/LHDN/SKBBK, explicit CASE per body).
5. ⚠️⚠️ **INCIDENT (self-inflicted, restore IN PROGRESS)**: the skbbk_amount backfill UPDATE
   fired `trg_hr_monthly_payroll_compute` — its UPDATE-OF list INCLUDES `skbbk_amount` — and
   `compute_hr_monthly_payroll()` re-derived prorata gross + table-lookup EPF/SOCSO/EIS/PCB +
   net on the 17 touched rows, CLOBBERING the InfoTech-imported verbatim figures (e.g. NUR AIN
   gross 2,523.02→2,800.00; THIEN 1,516.67→657.22; CHEW PCB 276.35→361.85). The 2 untouched
   rows (RACHAEL, LING) still carry their 2026-07-02 import stamps — that's the proof it was
   the backfill, NOT a user re-import (an earlier note here claimed a "07:42 re-import" and a
   Finance/Marketing funding delta of 771.67 — both were artifacts of the recompute, RETRACTED).
   **✅ RESTORED (same day)** — user provided the original InfoTech file
   (`PayrollSummary_020726094208AM200.xlsx`, the 02-Jul export). Parsed with the SAME
   header-name logic as `lib/import/infotech-payroll.ts` (scratchpad script); the parse
   tied to every pre-incident aggregate captured in-session (all four dept er/ee sums to
   the cent), then all 17 rows were restored by direct SQL writing ONLY the trigger-safe
   verbatim columns (epf_*/socso_*/eis_*/pcb/gross/net — NOT in the compute trigger's
   UPDATE-OF list). Rows stayed `submitted`; LING/RACHAEL untouched throughout.
   Verified after: identity holds on all 19 rows; net 72,384.40 + statutory 22,473.95 +
   SKBBK 532.35 = **95,390.70 == funding**, and **每个部门 exactly = its funded share**
   (DO 6,466.25 · Fin 23,882.01 · HR 21,351.10 · Mkt 43,691.34 — all diff 0.00). No
   true-up JE needed, ever — the original request was exact.
   Notable: the recompute had ALSO silently shifted LOW / LIAN / JOSIAH / KHO's SOCSO/EIS/
   EPF (InfoTech's statutory base includes OT/commission; the portal trigger's
   `v_statutory_wages` = prorated basic + stat allowance only) — so imported files and the
   trigger genuinely disagree on more than proration; VERBATIM restore was the only
   correct option. Statutory PV dry-run at restored figures: KWSP 18,496.00 ·
   PERKESO 1,880.40 · LHDN 2,097.55 · SKBBK 532.35 (Σ 23,006.30; + nets 72,384.40 =
   95,390.70 ✓).
   **⚠️ LESSON for any future direct SQL on hr_monthly_payroll:** updating ANY of
   basic_salary / statutory_allowance / non_statutory_allowance / ot_hours / ot_amount /
   commission_amount / unpaid_leave_days / deduction_amount / skbbk_amount / period_month /
   staff_id re-fires the compute trigger and wipes imported figures. Write only the
   verbatim columns (epf_*/socso_*/eis_*/pcb/gross/net — NOT in the trigger list), or
   mirror the importer's two-phase pattern.
- NOTE: batch approve RPCs would decrement a bank for a grouped payroll_bank_transfer without
  crediting Alliance — impossible today (funding PVs are never grouped), noted only.
- `database.types.ts` NOT regenerated for the new RPC (same `as any` escape hatch as
  create_payroll_disbursement_vouchers).

### Also this session (2026-07-20B, before the payroll work)
- HOUZS Century RM 45,156.32 duplicate fund source cleaned (kept Alliance-routed `c7302f6b`,
  still pending Principal); `rejectRequest` gained the missing `new_fund_source` cancel
  branch (commit `6efb420`). Century deposit approval STILL PENDING user confirmation.

## Session 2026-07-20A — payroll partial funding · Cash Flow ↔ Dept Pool tie-out · Fund IN bank routing
> ⚠️ Superseded in part by 2026-07-20B above: Stage-E is no longer accrual-only (it now also
> moves cash HL→Alliance), funding no longer touches dept pools, and the funding-time
> overdraw exemption is moot. The Cash Flow bridge + Fund IN routing notes below still stand.

**Everything below is DEPLOYED to `main` (HEAD `64ec536`) and applied to the live DB via MCP.**
Gates green at HEAD: `npx tsc --noEmit` (filter `loan-disbursement.test`), `npm run test:ci`
(376 passing), `rm -rf .next && npx next build`.

### 1. Payroll funding — partial rounds + dept-pool overdraw + payment date (mig `20260708000000`)
Finance was dead-locked on Payroll Requests → Generate PV when a pool (or the bank) looked short.
- **Stage-E funding PV is an ACCRUAL, not cash** (`Dr 9030 / Cr 4020`, mig 20260619) — it never
  moves the source bank's cash, so the old bank-balance block was stale and is **removed**
  (server action + the Approve button's disable). Cash leaves at Stage-G disbursement (Alliance).
- **Overdraw = 预支**: a short dept pool just goes **negative** (plain negative cash, **NOT** a
  booked inter-co loan). `approve_single_voucher` now auto-allows overdraw for
  `payroll_bank_transfer` (applied by string-transforming the LIVE function so all other
  branches stayed byte-identical — see the migration's `DO $mig$` block).
- **Partial funding**: a request can be funded across several PVs; round sum ≤ outstanding
  remainder. Completion trigger re-keyed from the single `pv_id` to `reference_id` + **cumulative
  paid**. Disbursement still needs the request `completed` (fully funded).
- Payment-date picker (drives the GL date at approval, period-lock guarded).
- Files: `payments/payroll-requests/{actions.ts,page.tsx,_components/GeneratePvForm.tsx}`,
  `lib/payroll-funding.ts` (+test), `payments/[id]/_components/VoucherActions.tsx`.
- ⚠️ **Gotcha fixed**: a client `catch` around a redirecting Server Action must **re-throw**
  `NEXT_REDIRECT` (see `approvals/[id]/_components/ApprovalActions.tsx`). Returning instead
  swallows the redirect — the PV was created but the spinner hung forever.

### 2. Cash Flow ↔ Dept Pool tie-out (`lib/inter-billing-cash-flow.ts`)
Per-segment Cash Flow closing ≠ Dept Pool balance. Root cause: **inter-billing AND own-share
settle only in the `dept_pools` ledger, with NO GL journal entry** (conceptual transfer inside
Hong Leong; HV's cash is commingled), so the GL-driven report can't see them.
- Fix: feed **synthetic transfer lines** into `buildCashFlow` (bank leg + a Financing
  "Inter-billing" leg per side) on **all 4 surfaces** (cash-flow page/export, monthly page/export).
- **Payer = every `inter_billing_out`; receiver = the `np_in` sharing the same `HV-OR-…` PV ref.**
  Both directions occur — own-share runs **Venture Office → a dept**, so the receiver is NOT
  always Venture Office, and the payer may BE Venture Office. Don't hard-code either side.
- Sides net to zero ⇒ consolidated Cash Flow unchanged; **all 6 segments now tie** to Dept Pool.
- Monthly (saved-layout) report: `buildCustomCashFlowRows` now **auto-files un-placed accounts by
  their default category** (operating/investing/financing), so the red **"Unassigned"** bucket is
  effectively gone. Also a data fix: the missing inter-company "Amount due" accounts
  (`3052/3056/3057/3058/4053/4057/4100/4200`) were added to the saved Financing layout in
  `report_layouts`.

### 3. Journal Entries search
`/reconciliation/journal-entries` got an instant client-side filter (voucher / description /
segment / date / amount) — `_components/JvList.tsx`.

### 4. Fund IN bank routing (mig `20260708100000`)
Fund OUT (new loan) already had "Pay from bank"; **Fund IN had none** — approval always bumped
the `is_primary` bank and posted the GL debit to its code, so every deposit landed in Hong Leong.
- `fund_sources.bank_account_id` (nullable; **NULL = primary fallback**, so legacy rows are safe).
- "Receive into bank" picker on **both** the create and edit forms; captured in
  `createFundSource` / `updateFundSource`; approval credits the picked bank for **both** the
  balance bump and the GL debit leg (`approvals/actions.ts`, `targetBank`).
- Fund-source detail page gained a **Details** section (source type, from, receive-into bank,
  BS sub-account, rate + simple/compound, period, effective / expected-repayment / maturity).
- NOTE: `database.types.ts` was hand-patched for the new column (Row/Insert/Update) rather than
  fully regenerated.

### Open items / next
- ~~Pending fund source **HOUZS Century RM 45,156.32**~~ → RESOLVED (2026-07-20, later same day):
  user had RE-CREATED it with "Receive into bank = Alliance" (fs `c7302f6b`) instead of editing,
  leaving the original bank-less row (`2531a80b`) as a pending DUPLICATE — approving both would
  have double-counted the deposit. Old row cancelled + its approval rejected via direct SQL
  (notes on both rows record why). The Alliance-routed one remains `pending_approval` for
  Principal. **Bundled code fix:** `rejectRequest` had NO `new_fund_source` branch — rejecting a
  fund-source approval left the fund_sources row stuck `pending_approval` forever. Now cancels it
  (mirrors the `new_loan` branch) + reject revalidates `/fund-in` too (`approvals/actions.ts`).
- Other Debtor (3071) outstanding is **RM 378.73** after recording the RM 162.21 receipt for
  I-000058 (Office Rental May'26) into Hong Leong — `JE-202607-0224`, segment `corporate`.
- Banks: Hong Leong `3000` (primary), Alliance `3010`.

---

# (Previous checkpoint) HOUZS Venture Portal — Session Handoff (checkpoint 2026-06-19 · merge)

> 2026-06-19: branch `feat/hr-simplify-direct-submit` merged on top of the 2026-06-11 main state.
> The HR-simplification session log (2026-06-04) is preserved immediately below, followed by
> the full 2026-06-11 main handoff.

## Merged-in session (2026-06-04): HR simplification — no HR-side approval

Branch `feat/hr-simplify-direct-submit` (7 phases, migs 278-282 ALL APPLIED TO LIVE DB).
User decisions: director fully decoupled from staff payroll_run / billing OPEX cards are
the per-dept salary surface / GL split at payment time (cash basis).

1. **HR submit → straight to Finance (mig 278).** `submit_payroll_to_principal`
   (name kept) now lands the run in `status='approved'+approved_at` directly — NO
   approval_requests row, no director gate, `director_salary_total=0`. New
   `reopen_payroll_run` RPC + ReopenPayrollButton (run→'rejected' with marker reason
   `Reopened by HR for edits`, rows→draft; blocked once a payment request is in flight).
   All period-keyed payroll_runs reads now `.neq('status','rejected')` (fixes latent
   multi-row maybeSingle bug). Dashboard HR cycle 9→8 steps. BillingView
   `payrollApproved`→`payrollSubmitted`. Principal money-side PV approvals UNCHANGED.
2. **Director Payroll Submission (mig 279).** New aggregate-only table
   `director_salary_submissions` (totals + per-subsidiary `by_company` JSONB from
   director_ctc; Finance-safe, no per-director). RPCs `submit_director_salary_to_finance`
   (draft→confirmed + snapshot; absorbs old confirmPayouts) + `reopen_director_salary`.
   /director-salary now tabbed: Calculation | Director Payroll Submission. BillingView
   Director OPEX card reads the submission (legacy run fallback) + new per-subsidiary
   section for Finance.
3. **Designation (mig 280).** `hr_staff_costs.designation` — InfoTech Employee List
   import now stores it (parser always read col 4); staff forms/list/detail updated.
4. **Staff PCB editable** on payslip (added to `updateStaffStatutory` whitelist).
5. **Fully Paid mode (mig 281).** `director_payouts.payout_mode` ('split'|'fully_paid').
   fully_paid: only 5% saving deducted, 95% (post advance-offset) paid as ONE payroll,
   B+K with statutory / Allowance without, invoice side zeroed. Engine param in
   salary.ts + PayoutModeSwitch on Calculation tab + 5 regression tests.
   **BUG FIX bundled:** recalc used to duplicate invoice_payout_pool accumulate rows —
   rows now carry `period_month` + delete-before-reinsert (openings with NULL period safe).
6. **Per-dept salary GL (mig 282).** payroll_bank_transfer PV approval posts one JE per
   source dept pool (segment via new `pool_key_to_segment`); `derive_journal_segment`
   resolves Stage-G payout PVs to the staff's department segment.

⚠️ Flagged, NOT fixed (needs user decision):
- Stage-G disbursement PVs are voucher_type='other' → Dr 9000 G&A, while Stage-E already
  books Dr 9030 gross+ER — possible GL expense double-count when both stages run. Verify
  before the first full payment cycle under the new flow.
- mig 122 grants Finance own-dept INDIVIDUAL-row SELECT on hr_monthly_payroll +
  hr_staff_costs — conflicts with "Finance sees aggregates only" rule. Tighten when convenient.
- /approvals/payroll-run/[id] page + approve/reject actions kept as read-only legacy
  (no new 'submitted' runs can exist).
---

# Main handoff (checkpoint 2026-06-11)

> Supersedes the 2026-06-08 checkpoint (still valid below).

## Latest session (2026-06-10 → 11): GL reports rebuild, full document audit, fail-loud sweep

Highlights (each verified: tsc clean, 283 tests, next build, deployed via `git push origin main`):

### Fail-loud sweep + receive-form GL fix + netting void (the "开工" queue, all 4 items done)
1. **GL/pool/bank failures now throw** instead of console.error (silent drift was the
   root cause of every pool/cache reconciliation gap found in the audit):
   - `billing/actions.ts#settleInvoicesConsolidated` — bank bump + per-segment GL post.
   - `payments/actions.ts#createPaymentVoucher` credit path — `bump_bank_for_paid_credit` + GL post.
   - `payments/actions.ts#voidPaidReceipt` — GL reversal (now includes `entry_no` in msg).
   - `lib/voucher-paid-helpers.ts#adjustPool` — full rewrite: checks every insert's
     `error` (supabase-js doesn't throw!), unknown pool names throw too.
   - `payments/payroll-requests/actions.ts` — approval-queue insert now throws; moved
     AFTER the request→PV link so a failure can't be retried into a duplicate PV.
   - `hr-costing/actions.ts` — approval-queue insert throws (period-unique guards retry).
   - Deleted dead `applyVoucherPaidSideEffects` (zero callers, swallowed-error style).
2. **Receive form account picker now drives the GL credit** (user decision 2026-06-03):
   `createPaymentVoucher` credit JE credits `accountCode ?? '3030'` instead of hardcoded
   3030. Invoice settles unchanged (their picker defaults to 3030); non-AR receipts
   (e.g. 3071 Other Debtor) stop draining AR. Consolidated settle keeps literal 3030 —
   that path is genuinely AR. Relevant to the open AR 12,647.54 gap below.
3. **Netting void path** — `voidPaidReceipt` now: skips bank reversal when
   `payment_method='netting'`; reverses ALL pool rows via new SECURITY DEFINER RPC
   `reverse_voucher_pool_rows(p_voucher_no)` (mig `20260611010000`, also in
   supabase/migrations/): new `dept_pool_txn_type` values `void_in`/`void_out`
   (balance view updated; monthly In/Out cards unaffected by design), idempotency
   guard on `VOID <voucher_no>:%` descriptions, matches rows by the `PV <voucher_no>:`
   description prefix. **Discovery:** the old adjustPool-based void reversal NEVER
   worked for dept pools (expense_has_approval CHECK + RLS rejected it, error
   swallowed) — voided receipts silently left pools credited. RPC covers consolidated,
   single-settle, AND the paying-side `inter_billing_out` row from netting.
4. **docs/FLOWS.md** — condensed as-built flow map of all document lifecycles
   (invoices, PV/OR, loans/fund-sources, claims/payroll/dept-requests/statements),
   account codes verified against current code (agent reports had stale pre-238
   codes). Ends with the remaining red-flag list.
5. **PV GL date = Finance's payment date, not Principal's approval date** (user
   report: P&L expenses showed the approve day). Mig `20260611020000` patches
   approve_single_voucher / approve_voucher_batch / approve_voucher_batch_partial
   from their LIVE definitions (pg_get_functiondef + anchored replaces, mig-156
   style; every anchor verified or the migration fails loud): payment_date no
   longer overwritten (COALESCE keeps Finance's value), JE transaction_date /
   period_month / JE-YYYYMM entry_no use COALESCE(payment_date, today),
   repayment rows use LEAST(payment_date, today), period-lock checked against
   the JE date per voucher. App side: createPaymentVoucher stores payment_date
   for DEBIT drafts too (was credit-only), updatePaymentVoucher + EditPaymentForm
   can edit it while draft/pending. Smoke-tested in a rolled-back tx
   (JE landed on the backdated payment_date ✓). Historical audit: all existing
   create-day vs JE-day drifts are WITHIN June 2026 (no month crossings), so
   monthly P&L attribution was never wrong — day-level backfill offered to user,
   pending their decision. Pre-fix vouchers have payment_date == approval day
   (the original Finance date was overwritten and is unrecoverable).
   **Latent (noted, not fixed):** approve_voucher_batch[_partial] still insert
   repayments principal-FIRST (single was fixed in mig 20260606010000 to
   interest→penalty→principal) and post unsegmented single JEs (no per-segment
   branch like single's mig 20260606050000) — only matters for grouped voucher
   approvals (payroll groups today), queue if needed.

(Reports rebuild, font, sidebar, repayment-schedule, and all data corrections from
2026-06-10→11 are documented in the conversation log; data corrections were direct
SQL per the established convention. Key closures: TB Dr=Cr ties at 0.00; 2990
payable = 228,613.75 exact (155k netting reclassed via 4 dated JEs Dr 3054/Cr 4051);
LO#11/BI#11 reduced 25k→10k per user; CONTS receivable ties at 617,200.)

### Full finance-module verification (2026-06-11, four read-only agents + fixes)
All four domains verified against live data. Results:
- **Billing/invoices: 8/8 checks clean.** Every non-draft invoice has exactly one
  revenue JE (amounts tie); all 7 dept_pool invoices have the 9051-55 expense JE;
  all 46 paid invoices tie to settlement vouchers (bulk vouchers = exact sum of
  their invoices); JE months align with period_month; invoice_lines sums tie;
  no orphans. Informational: 36 May invoices credit 9091 (cost-recovery rebill
  by category_code — by design, reduces expense instead of grossing revenue).
- **Payments/vouchers: all clean** (JEs balanced, PVS sums tie, both bank caches
  = GL to the cent, the one voided receipt fully reversed, no orphans/dup nos).
  Agent flagged PV-0027 (120k) as "no postings" — FALSE ALARM: its JE is
  reference_type='loan' (combined-approval path) + venture_pool fund_out exists;
  bank cache ties. Real fix applied: pv.journal_entry_id backlink was NULL →
  set to JE-202606-0103 (direct SQL).
- **Treasury:** all 4xxx/305x leaves tie app↔GL except known counterparty items.
  **Fixed: fund_source_outstanding view excluded payment_type='netting'** → HC
  showed 53,613.75 too high in app (L32 knock-off is a non-cash principal
  reduction). Mig `20260611030000` counts netting as principal on the FS side
  (loans side unchanged BY DESIGN — loan netting posts 7000 interest-style);
  repayment-schedule page's this-month split aligned. HC now 593,163.78 = GL.
  New findings — user ruled on all three (2026-06-11):
  ① GL 7000 interest income short 28,816.71 vs app records (FY2025 backfilled
  interest LO#5/#7/#19 never posted to 7000, likely inside opening JVs) —
  **user: do NOT post a catch-up for now**; leave as documented note. The
  "orphan 1,400" was investigated and is NOT an orphan: OR-000027 manual JV
  2026-04-29 (THE CONTS, Dr 3000 5,000+1,400 / Cr 3053 5,000 "REFUND TO MR
  LIANG" / Cr 7000 1,400 "INTEREST INCOME OF FUND 2%") — real receipt, in GL
  and bank. **User confirmed (2026-06-11): the 1,400 is genuine interest
  income.** App-side repayments row added by direct SQL (interest, 2026-04-29,
  parked on LO#19 per the CONTS-APR28K reallocatable convention, notes
  reference OR-000027). The 5,000 principal leg was NOT added — April CONTS
  receipts were already bundled into the 28,000 CONTS-APR28K row; a separate
  row would double-count. CONTS outstanding unchanged at 617,200 ✓. Remaining
  app-vs-GL-7000 delta is now exactly the deferred FY2025 backfill 30,216.71.
  ② Hookka NOT split wrongly — user confirmed 3055 Hookka Manufacturing and
  3058 Hooka Industries are TWO different companies. Not an issue; leaves stay.
  ③ Backdated rows: fixed by direct SQL (user-approved) — instrument start
  dates aligned to first recorded movement (all non-compound, maturity NULL,
  nothing computes from these dates): LO#7 disbursement → 2025-04-05, LO#5 →
  2025-05-05, FS Liang-60k → 2025-04-05, FS WS-90k → 2025-05-05, FS HC-L32 →
  2026-03-26 (the knock-off JV date). 0 before-start rows remain on either side.
- **Pools/payroll/claims/statements:** dept_pool_balances view = manual recompute,
  all 5 pools still tie their GL segments to 0.00 post re-dating; venture_pool no
  legacy-type activity; invoice_payout_pool 37,218.37 all-accumulate; statements
  2026-05 all tie. Payroll runs / claims / dept_payment_requests tables are
  EMPTY — the known design gaps there (benefit-claim GL, dept-request rollback)
  currently have RM 0.00 exposure.

### Red-flag sweep CLOSED (2026-06-12, user 开工; migs 20260612010000–050000)
All six audit red flags fixed in one run (see docs/FLOWS.md "Known gaps" for the
condensed list and what remains):
1. **PV-path loan repayments → venture_pool** `loan_repayment_in` (principal
   portion), in all three approve RPCs.
2. **JV bank-cache auto-sync** (mig 20260612020000): `jv_apply_bank_cache`
   helper; create applies, update reverses-then-applies, delete reverses.
   Smoke-tested in a rolled-back tx (+100 → restore ✓). JVs also carry a
   segment since mig 20260612000000.
3. **Dept requests**: approve RPCs skip the pool debit for
   `reference_type='dept_payment_request'` (reserved at stage-1 — was a
   double debit); stage-3 was BROKEN end-to-end (generate RPC wrote no PVS
   row → approve always raised; PV was 'draft' while its approval was
   pending; voucher_type='expense' would have re-recognised the expense via
   the per-segment branch) — generate_pv_for_dept_request rewritten (PVS row
   acct 4050, status pending_approval, dept_pool key underscore fix), approve
   RPCs exclude dept_payment_request from the per-segment branch (falls to
   forced Dr 4050 AP-clearing); NEW cancel_dept_payment_request refunds the
   stage-1 reservation (dept_pools 'void_in' + reversing accrual JE, voids a
   pending PV) with a Cancel button on /payments/dept-requests; NEW
   dept_request_pv_rejected returns the request to pending_finance_pv on PV
   rejection (wired in rejectRequest).
4. **Loan disbursement bank**: new-loan form has a Pay-from-bank picker →
   create_loan_with_approval(p_bank_account_id) (old 10-arg dropped);
   approveRequestGroup checks/debits the PV's bank via bump_bank_balance and
   credits its GL code (was primary-only, read-modify-write).
5. **Benefit claims** now draft the same claim_payout PV as project claims
   (pool = claim.source_pool, acct 9000); claim PVs default bank to primary
   (a debit PV approved with NO bank posted GL Cr 3000 without a cache
   debit); claim-side inserts fail loud.
6. **Cancel executors** (mig 20260612050000): execute_loan_cancel re-pointed
   to current COA (Cr = 305x leaf resolved from the disbursement JE, fallback
   PVS account, else loud; refunds the DISBURSING bank, GL fallback 3000 —
   was '1010'/'1020'); NEW execute_fund_source_cancel (blocks on repayments,
   refuses dept_pool-type sources, venture_pool fund_out reversal, primary
   bank − with sufficiency check, JE Dr 4xxx leaf / Cr bank, status
   cancelled) wired into approveRequest's tier_change-on-fund_sources branch.
7. **Batch approve RPCs fully aligned with single** (mig 20260612010000 full
   rewrites): interest→penalty→principal order, per-segment GL branch,
   internal_transfer pool skip, payment-date GL dating, per-voucher period
   check, venture_pool repayment inflow, dept_payment_request skip.

### COA admin upgrades (2026-06-12)
Settings > Chart of Accounts: tree rows (name indented + own code column,
click parent row to expand/collapse), drag-and-drop reparenting (DB triggers
enforce type/cycle/posted-parent), and CODE RENAME with full history
migration via rename_account_code RPC (mig 20260612070000 — clones the COA
row, re-points journal_lines / PVS(+overrides) / bank gl links /
fund_sources / children / invoice+credit-note+dept-request+statement
category codes, deletes the old row; validates 4 digits + same type range).
updateAccount accepts new_code and surfaces per-table re-point counts.
Manual JVs also gained segment (mig ...000000), bank-cache sync (...020000)
and dept-pool sync for dept-segment JVs with bank movement (...060000,
jv_in/jv_out txn types; pool rule: pool == per-segment net bank movement).

### FY2025 interest 30,216.71 — CLOSED, no action ever needed (user 2026-06-12)
The 36 backfilled interest rows on LO#5/#7/#19 (The Cont, 2025-01 → 2026-03,
totalling 30,216.71) were collected by a DIFFERENT company — the debt was only
transferred to HV recently. So HV GL correctly has NO 7000 income for those
periods; the system-side repayment rows exist purely to track installment
progress (已还期数). Do NOT post a catch-up JV. The app-vs-GL-7000 "delta" of
30,216.71 is by design, permanently. (Supersedes the earlier "deferred" note.)

### AR 12,647.54 decomposed and resolved (2026-06-12, direct SQL)
Exact composition: +12,588.80 (HV-OR-202606-0005, HC "3D Design Fee Return"
hardcode-credited 3030; user: returns 2990 on-behalf money → reclass Dr 3030 /
Cr 3054 — 3054 now EXACTLY 155,000 = the loans) +150.00 (OR-202606-0032,
CONTS interest via HV to LWS, hardcode-credited 3030 → reclass Dr 3030 /
Cr 7000 + app interest row on LO#16) −91.26 (books invoice I-000078,
"MARKETING NOTION 1/3 of 273.78" 2026-05-15, Dr 3030 / Cr 9087 — MISSED by
the one-time opening import; verified absent from invoices and statement
lines). After reclasses: GL 3030 19,960.72 vs open non-dept invoices
19,869.46 — residual is exactly the 91.26. RESOLVED (user ruling, same
day): I-000078 is DREAM CRAFTER's debt and no invoice is to be created —
reclass JV Dr 3059 / Cr 3030 91.26 moved it onto DC's leaf, and the [LO-DC]
TB-backfill advance was bumped 2,904 → 2,995.26 so app=GL ties. Final state:
GL 3030 19,869.46 == open non-dept invoices 19,869.46 (gap ZERO); 3059
2,995.26 == DC app outstanding; TB 0.00. NO historical reconciliation items
remain open — every audit finding is now fixed or closed by user ruling.

### Interest income → Revenue (user 2026-06-15, direct SQL)
User wants interest income in Revenue and interest expense in Cost.
- Interest Expense - Fund Sources (6000) was ALREADY type=cost ✅ no change.
- Interest Income - Loans reclassed 7000 (other_income) → 5027 (revenue) via
  change_account_type RPC; 13 lines (RM 19,520) re-pointed, TB still 0.00.
  App ref updated: fund-out/actions.ts recordRepayment credits 5027 for
  interest/netting (was 7000). A DB trigger coa_enforce_code_range forces the
  code into the type range, so the code HAD to move to 5xxx (can't keep 7000).
- ⚠️ LESSON: RAISE-to-rollback smoke tests via Supabase MCP execute_sql do NOT
  reliably roll back — an earlier change_account_type(7000→revenue) "smoke"
  PERSISTED (found 7000 empty / 5027 holding the lines during the 2026-06-15
  accounting review). It was first restored to 7000/other_income, then
  intentionally moved to 5027/revenue per the user. Full-DB sweep confirmed no
  OTHER smoke artifacts leaked (no JE-SMOKE, no SMOKE vouchers, 9030 intact).
  Going forward: do NOT rely on in-block RAISE to undo test writes here.
- Penalty Income (7010) left in other_income — user only specified interest.
- Interest is recorded CASH-basis (income/expense only on receipt/payment); no
  monthly accrual JE for the 21 active loans / 15 deposits (3040 Interest
  Receivable = 0). Accrual feature discussed, pending user go-ahead +
  traceability design.

### Counterparty rulings applied (2026-06-12, direct SQL)
- LWS 450 + LWL 300: user ruled the opening books had knocked these off the
  PRINCIPAL payables but they were INTEREST. Reclass JE (manual_jv, treasury):
  Dr 9010 Interest Expense 750 / Cr 4054 450 / Cr 4055 300. App=GL=131,500 and
  57,200 now tie exactly.
- CMK 6,936: user ruled the repayment IS recorded on CMK side — system was
  missing it. fund_source_repayments principal row 6,936 added (notes flag the
  ruling); app=GL=42,064 ties. No GL/bank change (cash already in openings).
- Remaining counterparty item: AR 3030 (GL 7,221.92) vs open non-dept invoices
  19,869.46 — gap 12,647.54: receipts historically credited 3030 without being
  tied to specific invoices; needs per-invoice paid/unpaid confirmation.

### Still open (awaiting user verification with counterparties)
- 4054 LWS 450 · 4055 LWL 300 · 4056 CMK 6,936 · AR 3030 vs open invoices 12,647.54.
- Remaining code items: DEPT_POOL_GL map collides with post-238 codes (dept_pool
  fund-source JEs); count-based voucher numbering. See docs/FLOWS.md.

---

## Latest session (2026-06-08): Finance hardening, treasury fixes, billing/PV UX

Worked DIRECTLY (no superpowers flow — per CLAUDE.md). All DB changes applied via
Supabase MCP `apply_migration` AND saved to `supabase/migrations/` for parity
(Vercel builds the Next app only; migrations are not run by CI).

### Bug fixes (root-caused + deployed)
1. **Repayment ordering crash (two paths).** A principal repayment that clears the
   outstanding flips the loan/fund-source to fully_repaid/repaid mid-transaction
   (trigger), then the block-repayment trigger rejects the interest/penalty legs →
   whole tx aborts (surfaced as the redacted "Server Components render" error).
   Fixed by recording **interest+penalty BEFORE principal**:
   - `recordLoanRepaymentReceived` (fund-out/actions.ts) — commit `7f94b10`.
   - `approve_single_voucher` RPC (PV-approval path) — mig `20260606010000`.
2. **Dept-pool overdraw, opt-in.** `approve_single_voucher` gained
   `p_allow_overdraw` → sets txn-local GUC `app.allow_pool_overdraw`; trigger
   `check_dept_pool_sufficient` honors it. UI: "允许部门池透支" checkbox on the
   approval screen (`ApprovalActions`). Default still blocks. mig `20260606020000`.
3. **internal_transfer** voucher_type = pure bank→bank move: skips dept-pool
   deduction, posts per-segment GL, and credits the DEST bank cache (trigger).
   migs `…030000` (dest-cache trigger), `…035000` (RPC), `…040000` (trigger incl
   internal_transfer). UI: "这是内部转账" checkbox on `NewPaymentForm`.
4. **expense / claim_payout → per-segment GL** (root cause of dept_pool↔GL drift):
   was one corporate-segment JE; now one segment-tagged JE per source pool. mig
   `20260606050000`.
5. **pool_key_to_segment**: `dept_pool_director` → `'director'` (was wrongly
   `director_office`). mig `20260606060000`. Only `approve_single_voucher` uses it.

### Features (deployed)
- **Self-service edit (Principal)** of ACTIVE loans + fund sources: rate / terms /
  期数 / 起始日 / 利滚利 toggle. RPCs `amend_loan`, `amend_fund_source`
  (SECURITY DEFINER, principal-only) — mig `20260606000000`. UI: `LoanAmendForm`,
  `AmendFundSourceForm`, "修改条款" buttons on the loan + fund-source detail pages.
  **Pending phase 2**: Finance-initiated edits via the approval queue (not built).
- **Repayment schedule**: new **利滚利挂账** section (compound items show principal
  0, current balance, 累计已滚利息, 本月利息; works for any term) + settled-this-month
  items shown as 已收/已付 done rows (full-plan view). `listPayableFundSources`
  gained `opts.includeSettledInMonth`.
- **Fund Out list**: status tabs (Pending/Active/Repaid/Cancelled/All), like Fund In.
- **Billing**: Copy invoice (`copyInvoice` → new draft, current month) on each row;
  Description as its own column; batch-settle "全选可结算发票" moved into the search
  toolbar (`SortableTable` gained a `toolbarRight` slot); batch print uses the
  existing `/billing/invoice-doc?ids=`.
- **Payments (PV/OR)**: per-department source breakdown table on the VIEW + APPROVE
  pages; **Copy PV** (`copyPaymentVoucher` → new draft → edit); **Print PV/OR PDF**
  new route `/payments/voucher-doc` (?id=/?ids=) + format `_format/voucher-doc-pdf.tsx`
  (mirrors invoice-doc); Description column on the payments list.
- **Excel-style per-column value filter** built into `SortableTable` (funnel in
  header → checkbox facet of distinct values + search + (All)/(Blanks)/Clear,
  fixed-positioned). Enabled on PV/OR (Category/Pool/Payee/Description/Status) and
  invoice (Company/Mode/Description/Status) lists. Composes with search + sort.

### Data corrections (direct SQL, recorded for audit — NOT in migrations)
- **2026-06-11: 2990 grossed up in GL — 4 reclass JEs Dr 3054 / Cr 4051**
  (45,000 @04-07 LO#29 · 10,000 @04-30 LO-NEW-2990 · 55,000 @05-07 + 45,000
  @06-08 = LO#33's 100k), total 155,000. The accountant's workbook had NETTED
  HV's loans to 2990 against the deposit payable (4051 debits described as
  "rental pay on behalf" / "Carress→2990" / "fund transfer"); the app records
  gross. Verified after: 2990 payable app = GL = 228,613.75 exactly; GL 3054 =
  167,588.80 = 155,000 loans + 12,588.80 expense-paid-on-behalf (June expense
  PV split to 3054 — a real non-loan receivable, app loans module doesn't track
  it). TB 0.00, banks + dept pools all tie.
  **Remaining known small gaps** (legacy baseline noise, awaiting user
  verification with counterparties): 4054 LWS 450 · 4055 LWL 300 · 4056 CMK
  6,936 · AR 3030 vs open invoices 12,647.54 (receive form hardcodes Cr 3030 —
  process fix queued).
- **2026-06-11: LO#11 / BI#11 both reduced 25k → 10k** (user: the 15k was a
  recording correction — Liang's money via Kingsley was effectively 10k in /
  10k out, never through HV's bank). App: fund_sources BI#11 amount 25,000 →
  10,000 (it had NO repayment rows — the 15k "repaid" on Liang's account was
  BI#7's 15×1,000 installments, unrelated); loans LO#11 principal 25,000 →
  10,000 + deleted the phantom 15,000 principal repayment row (2026-04-15,
  "直接还源头公司"). GL: correction JE dated 2026-04-15 Dr 4055 / Cr 3053
  15,000 (id 103ed4cb). Verified: CONTS app = GL = 617,200.00 exactly; TB
  still 0.00; Liang residual app-vs-GL gap 300 (pre-existing legacy noise).
- **2026-06-11: PV-000059 advertisement claim 2,807.34 re-pointed 9088 → 9095.**
  TB stopped tallying by exactly 2,807.34: a child account (9095 Advertisment -
  Hiring) was created UNDER 9088 Advertisement, silently turning 9088 into a
  header — and the leaf-only Trial Balance dropped 9088's one existing line
  (the 2026-05-05 recruitment-ad claim from the GL import). Moved the line to
  9095 (it IS a hiring ad). Verified: 0 postings remain on any header account,
  leaf-only Dr−Cr = 0.00. ⚠ Trap to guard later: mig 256 blocks POSTING to
  headers, but nothing stops CREATING a child under an already-posted account.
- **2026-06-11: 7 inter-billing expense JEs re-tagged corporate → marketing**
  (JE-202605-0007/0014/0021/0028/0035/0042 + JE-202606-0038 — the Dr 9051 /
  Cr 3030 twins of Marketing's utilities rebills). Root cause: the inter-billing
  expense JE inherited the INVOICE's billing_mode segment (venture_attribution →
  corporate) instead of the PAYING dept's. Code fixed same commit:
  `deptNameToSegment` (lib/billing.ts, tested) passed as explicit `segment` at
  both inter-billing JE posting sites (single + bulk issue). No bank lines
  touched — all 5 dept pools still tie GL exactly (diff 0.00).
- **2026-06-11: 17 salary-invoice issue JEs re-pointed 5000 → 5020 Salary Income**
  (credit lines only; May revenue now splits 5000 Service Revenue 59,949.19 +
  5020 Salary Income 123,924.95 = 183,874.14 unchanged). Root cause: the salary
  attribution invoices (HV-INV-202605-0043..0059) were created with no
  category_code → `revenueGlCode` fallback credited everything to 5000. Code
  fixed same commit: `fallbackRevenueGlCode` (lib/billing.ts, tested) routes the
  four *_attribution modes to 5020 when no category is picked. The 17 invoices
  also got `category_code='5020'` backfilled. NOTE: marketing salary invoices
  use `marketing_project` mode — those still need Finance to pick category 5020
  manually at creation (can't infer salary-vs-service from the mode).
- **2026-06-11: 17 invoice-issue JEs re-dated June → 2026-05-31** (+ period_month
  → 2026-05-01). Root cause: all four invoice-issue JE posting sites in
  billing/actions.ts dated the revenue JE `dayjs()` (the day Finance clicked
  Issue) — May invoices bulk-issued 4/7 June showed in JUNE's P&L. Code fixed
  same commit: `invoiceJeDate()` (lib/billing.ts, tested) = invoice_date,
  falling back to period month-end then today; applied at single + bulk issue
  and both inter-billing twins. Also fixed `HV-INV-202605-0052.invoice_date`
  year typo 0005-05-31 → 2026-05-31. Verified: 0 remaining issue-JE month
  mismatches; May revenue 183,874.14, June 0.
- **2026-06-10: HC fund source 71,457.13 split into 3 compound tranches** mirroring
  the HK loan side (the money passed HC → HV → Hookka): original row `887388ff`
  shrunk to **BI#25A 42,881.63 自2025-09** + new rows **BI#25B 22,873.50 自2025-12**
  / **BI#25C 5,702.00 自2026-03**, all `compound_interest=true` @2%/mo — symmetric
  with loans LO#25A/B/C. Sum still 71,457.13. No PV/approval referenced the
  original row. Loans LO#25A/B/C got `· 资金来源: HC` appended to repayment_terms
  (drives the Fund OUT SC badge). Schedule impact: the HC payable moves from
  "no fixed term" to the compounding tab; To repay hero unchanged (compound is
  excluded from totals).
- **2026-06-10: 9 JEs re-tagged director_office → director** (segment only, no
  amounts moved). Root cause: BOTH segment mappers (SQL `billing_mode_to_segment`
  + TS `segmentForBillingMode`) mapped `director_attribution` → `director_office`
  while its POOL is dept_pool_director — settling Director salary-attribution
  invoices forked dept_pools vs GL by 65,931.62 (Director Office GL showed
  67,249.04 vs pool 1,317.42). Re-tagged: settlement JEs `JE-202606-0097/0100/
  0101/0102` (bank-in, 65,931.62) + issue JEs `JE-202606-0027..0031`
  (AR/revenue side, invoices HV-INV-202605-0055..0059). Mappers fixed: mig
  `20260610010000` (SQL) + invoice-settlement.ts (TS, + test). Verified: all 5
  dept pools tie GL exactly (diff 0.00), total bank 163,533.09 unchanged
  (HL 1,746.32 + Alliance 161,786.77).
- **2026-06-10: HL bank cache +3,250 → 121,746.32** (= GL 3000). Root cause: two
  loan repayments recorded by Finance on 2026-06-10 (loans `3641efec` 1,500+450,
  `e6569127` 1,000+300) posted GL Dr 3000 but the JS-side cache bump in
  `recordRepayment` (fund-out/actions.ts L255) was **silently blocked by RLS** —
  `bank_accounts` UPDATE policy is principal-only, the update isn't error-checked,
  PostgREST returns success with 0 rows. Alliance unaffected (settle path bumps via
  SECURITY DEFINER trigger).
  **FIXED same day** — mig `20260610000000` adds `bump_bank_balance(uuid, numeric)`
  SECURITY DEFINER RPC (finance+principal guard null-safe fail-closed, atomic
  `+delta` so no read-modify-write race, raises on unknown bank). Swapped in at the
  3 non-principal call sites, each now error-checked + fail-loud: `recordRepayment`
  (fund-out/actions.ts), `voidPaidReceipt` (payments/actions.ts),
  `applyVoucherPaidSideEffects` (voucher-paid-helpers.ts — currently caller-less).
  The 3 principal-only direct updates in approvals/actions.ts (L160/275/605) left
  as-is (RLS permits principal; candidates for later unification onto the RPC).
  RPC verified via rollback probes: finance ✓ / hr rejected ✓ / null-role rejected ✓
  / unknown bank raises ✓. types regenerated; tsc clean; 250 tests pass.
  The Cont loan (120k, HV-PV-202606-0027) was approved after the cache fix —
  HL now ~1,746.32 (thin!), Alliance 161,786.77.
- Loan d3921b67 (CONTS): backfilled the **interest 3,000** leg lost to the ordering
  bug (repayment row + JE Dr3000/Cr7000 + HL cache +3,000), 2026-06-05.
- **HV-PV-202606-0008** (HV repaying its 2990 borrowing 45,000+900): split the
  single 3054 source (wrong — that's a receivable) into **4051 Amount Due to 2990
  45,000 + 9010 Interest Expense 900**, so it posts Dr payable/interest / Cr bank.
- **HV-PV-202606-0007** ("Transfer to Alliance for Payroll"): re-classed to
  `internal_transfer`; reversed its 4 dept-pool expense_out rows (a transfer isn't a
  dept expense — cash still the depts', staged in Alliance); GL re-posted per dept
  segment; Alliance bank cache +95,050.24.
- **HL bank cache** corrected to **19,672.56** (= real Hong Leong balance the user
  confirmed; cache was +3,000 stale). **Alliance cache** = 95,972.71.
- **Marketing claims HV-PV-202606-0010 (400.85) + 0011 (934.73) = 1,335.58**: JE
  segment re-tagged corporate→marketing (they're Marketing's spend).
- **利滚利 flags**: loans LO#15/12/11/26/16/13/14 set `compound_interest=true`
  (LO#11 also got its 15k principal recorded as repaid 2026-04, direct-to-source);
  LO#29 (2990 45k) too. **LO#25 (HK 71,457.13) split into 3 loans** LO#25A/B/C
  (42,881.63 fr 2025-09 / 22,873.50 fr 2025-12 / 5,702 fr 2026-03), all compound.
  **LO#4 left as a normal scheduled loan** (user reverted). 15 loans got
  「资金来源」remarks; 2990 LO-NEW-2990 noted "资金从 Kingsley 借过来". Kingsley
  fund source (100k, 0%) set to 12期 / repayment_date 2026-04-20.

### Reconciliation — FULLY TIED at session end
All 5 dept pools: dept_pool_balances == GL bank-segment (diff 0.00 each).
Dept-pool "Total cash available" **115,645.27** == per-bank grand **115,645.27**.
Banks: HL cache=GL=19,672.56; Alliance cache=GL=95,972.71.

### Migrations added this session
`20260606000000` amend RPCs · `…010000` repayment-order · `…020000` overdraw ·
`…030000` dest-bank trigger · `…035000` internal_transfer RPC · `…040000` trigger
incl internal_transfer · `…050000` expense/claim per-segment · `…060000`
pool_key_to_segment director fix.

### 2026-06-11: GL-driven reports rebuild (commit `3cc0a37`)
P&L / Balance Sheet / Cash Flow pages REPLACED — now built straight from
journal_lines via `src/lib/gl-reports.ts` (pure, 11 tests) + shared
`GlReportView` renderer. Format per the-conts.pages.dev reference: current |
compare | Δ% | %Rev columns, collapsible COA groups (parent_code), inline txn
drill-down, month/compare pickers + segment dropdown. BS adds synthetic
"Retained & current earnings" so A=L+E ties; CF is direct-method via COA
cash_flow_category with opening/closing reconciliation (closing cash = bank GL
sum). Exports REBUILT same day (commit `3a5f48e`): block assembly lives in
`lib/gl-report-blocks.ts` (shared by pages + exports — one source of truth),
`lib/export/gl-statement.tsx` renders xlsx/pdf; Export buttons restored on all
3 pages forwarding period/compare/segment. Old cfo-reports export formats +
orphaned components (SegmentedReport/SegmentExportButtons/RevenueGroups/
PeriodMonthPicker) deleted. Old 6-pool P&L layout replaced by the segment
dropdown. cfo-reports.ts itself stays (fetchLedgers etc. still used).

### PENDING / pick up next
1. ~~**Ledger Excel filter**~~ ✅ DONE (2026-06-09, commit `7f6c2b0`). User picked
   "keep grouped, add filters" (not flatten). `LedgerSections` gained two funnel
   facet filters in the toolbar — **Dept (segment)** + **Journal Type** — mirroring
   the SortableTable facet popover. Compose with the existing search + date sort;
   zero-match accounts hide; B/F + running balance + per-account totals preserved.
   ⚠️ Interactive verification was BLOCKED locally: the OneDrive `.next` Fast-Refresh
   loop left the whole ledger route's client components unhydrated (pre-existing
   search/sort/Apply equally dead) — verify on live instead. tsc clean, route compiles
   clean, toolbar renders the two buttons.
2. **利滚利 → GL posting (Interest-in-Suspense)** still DEFERRED — 利滚利 is
   calc+display only; `loan_outstanding`/GL don't include capitalized interest.
   COA already has `3060-3065` (Interest in Suspense — Recv) + `4060-4064` (Pay).
3. **Finance-via-approval edit** (phase 2 of self-service amend): new approval types
   `loan_amend`/`fund_source_amend` + payload + approve dispatch. Not built.
4. **Finance process-review "first 4"** (from the audit this session): (a) GL-post
   failures must fail loud / flag, not silent console.error; (b) write-action audit
   log (approvals/JE/edits/period-close); (c) auto bank↔GL + dept-pool↔GL recon page
   + month-end checklist; (d) period-lock also on Finance data entry (currently only
   blocks Principal approval).
5. (Optional) Per-row Print/Copy on the payments LIST (currently on PV detail page).

## Latest session (2026-06-03): Consolidated invoice settlement

Followed the superpowers brainstorm → spec → plan → subagent-driven build flow.
- Spec: `docs/superpowers/specs/2026-06-03-consolidated-invoice-settlement-design.md`
- Plan: `docs/superpowers/plans/2026-06-03-consolidated-invoice-settlement.md`
- Deployed to main (commits `0301b3f`..`a6db977`); live + tests (234) + build green.

Three user-facing changes:
1. **Consolidated settle (true one-voucher).** Selecting issued invoices of the SAME
   company → ONE Official Receipt voucher (amount = sum), all invoices marked paid.
   New action `settleInvoicesConsolidated` in `billing/actions.ts` **replaced** the old
   `batchSettleInvoices` (which minted N vouchers). Cross-company selections are
   **blocked** (one receipt = one payer) at both client + server. dept_pool
   (inter-billing) invoices still excluded — settle individually.
2. **Single-settle payment date.** `NewPaymentForm` now has a `payment_date` field
   (default = browser-local today, backdate-able). `createPaymentVoucher` threads it
   into the voucher `payment_date` AND the settlement JE `transactionDate` (was
   hardcoded `todayStr`). Only persists on the credit/auto-complete (settle) path.
3. **Discoverable entry.** `/statements` Invoices tab (`InvoicesList`) now has a
   prominent 「全选可结算发票」button + floating 「合并结算 N 张 → 生成收据」 bar.

Data model: **mig 276** adds `invoices.settlement_voucher_id` (nullable FK →
payment_vouchers, ON DELETE SET NULL). Reverse pointer = the 1:N link (one voucher
settles many invoices). Consolidated voucher has `invoice_id = NULL`; invoices point
back via `settlement_voucher_id`. Legacy `payment_vouchers.invoice_id` (single) is
untouched — single-settle still writes it. `settlement_voucher_id` is currently
**write-only** (no reader yet — verified no read path breaks on invoice_id=NULL:
payments detail/list + cfo-reports all read via voucher_id / PVS / payee_name).

New pure helper `src/lib/invoice-settlement.ts` (`payeeKey`, `validateConsolidation`)
shared by client + server so the same-payer check can't drift. Tested (10 tests).

### Post-deploy fixes (2026-06-03, same session)
- **mig 277** — dropped obsolete `billing_payment_has_invoice` CHECK (it blocked consolidated OR vouchers whose invoice_id is NULL). Root-caused from the postgres ERROR log.
- **Consolidated dept-pool attribution fix** (commit `1f36f43`): `settleInvoicesConsolidated` was lumping the whole receipt into `venture_pool` ("Office") via one `adjustPool('venture_pool', total)`. A consolidated receipt can span departments (same company, marketing_project + venture_attribution invoices), so marketing cash wrongly showed in Office. Fixed: new pure helper `poolAttributions()` (in `invoice-settlement.ts`) splits per invoice via `INVOICE_BILLING_MODE_TO_POOL`; the action loops `adjustPool` per attribution. Regression tests added.
- **Manual data corrections applied directly via SQL (NOT in any migration — recorded here for audit):**
  1. **Receivable receipts** for two GL-only Other Debtor (3071) items with no invoice row: Hookka RM 361.80 (JE-202605-0053, 2026-05-22, finance segment) + Carress RM 1,060.96 (JE-202605-0054, 2026-05-26, corporate segment), both Dr 3000 Hong Leong / Cr 3071. Bank cache (`bank_accounts.current_balance` for HL) bumped +1,422.76 manually (manual JEs don't trigger `bump_bank_for_paid_credit`). 3071 14,996.64 → 13,573.88.
  2. **Dept-pool re-attribution** of the 4 consolidated OR vouchers (HV-OR-202605-0001..0004): the marketing portion (RM 53,949.19) was moved from `venture_pool` table rows (shrunk to the venture portion 2,141.73) to new `dept_pools` Marketing `np_in` rows. Marketing pool −16,107.10 → +37,842.09.
- ⚠️ Reminder: the app's "收款"/receive form GL-credits 3030 hardcoded, and manual JEs don't update the bank cache. A "collect against non-3030 receivable, self-service" feature was being brainstormed (user picked: enhance the receive form so the account picker drives the GL credit + bank cache) — spec NOT yet written, paused. **(Pre-req for this is settled now: settlement segment attribution, below.)**

### Settlement segment attribution + /dept-pool reconciliation (2026-06-03, later same session)
- **Root cause found**: `/dept-pool` "By department" computes dept rows from `dept_pool_balances` (= `dept_pools` table) but the **Venture (Office)** row from GL `journal_lines` (bank lines, `segment IN ('corporate','treasury')`). Settlement only updated one side → double-count. Settling marketing invoices put cash in BOTH Marketing (dept_pools) and Venture (GL corporate) — Total no longer tied to bank (off by 53,587.39).
- **Code fix** (spec/plan: `docs/superpowers/{specs,plans}/2026-06-03-settlement-segment-attribution*`; commits `f387a02`,`43913fb`,`5bb99d0`,`3461a13`):
  - `segmentForBillingMode()` in `src/lib/invoice-settlement.ts` mirrors SQL `billing_mode_to_segment`.
  - `postJournalEntry` (lib/journal.ts) gained optional `segment` → passes RPC `p_segment` only when set.
  - **Consolidated settle** (`settleInvoicesConsolidated`): settlement bank-in JE now SPLIT per dept segment (one JE per `segmentForBillingMode` group) — so Venture stops absorbing dept settlements. Per-invoice `adjustPool` (dept_pools) kept.
  - **Single settle** (`createPaymentVoucher`): invoice-settle bank-in JE now tagged with the invoice's dept segment (was corporate).
  - Model: settlements update BOTH dept_pools np_in AND the GL bank-line segment, matching how opening allocations were set up.
- **Data correction (direct SQL, recorded for audit):**
  1. Hookka 361.80 → added `dept_pools` Finance `np_in` (its bank-in JE-202605-0053 was already finance segment). Finance pool −361.80 → 0.
  2. 4 consolidated OR vouchers' **Marketing portion 53,949.19**: reclassified bank cash from corporate→marketing segment via two `1900` (Opening Balance Clearing) JEs (segment_reclass, 2026-05-31). Venture −53,949.19. (Marketing `dept_pools` np_in 53,949.19 kept from the earlier repair.)
  3. Carress 1,060.96 = corporate/Venture, left as-is (user confirmed).
- **Verified**: dept_sum 72,804.97 + venture_gl (−5,363.15) = **67,441.82 = bank**. Marketing GL-segment (37,842.09) == Marketing dept_pool (37,842.09). Fully reconciled.

⚠️ Known follow-up (spawned as a task, not yet done): `settleInvoicesConsolidated`
is non-transactional (Supabase JS limit). If the final invoice-status update fails
after the money-side writes, you get an orphaned voucher and a re-run mints a 2nd
voucher (invoices still 'issued'). Same convention as `createPaymentVoucher`. Add an
idempotency / orphan guard when convenient.

## Project
- HV internal banking portal. Next.js 15 (App Router) + Supabase + Vercel + TypeScript + Tailwind.
- Local: `C:\Users\User\OneDrive\Desktop\Claude\Venture\Venture-Portal`
- Supabase project ref: `gixpptmfuryskbwkmiwz` (use the `supabase` MCP tools)
- GitHub: `wenwei4046/Venture-Portal`
- Read `CLAUDE.md` + `docs/DESIGN.md` before touching code.

## ⚠️ Vercel deployment
- Live site: **venture-portal-chi.vercel.app** under `wenwei4046s-projects`. Auto-deploys on `git push origin main`. Do NOT use `vercel --prod` (chi rejects with permission denied).
- Last pushed commit at checkpoint: `7d28828` (batch settle invoices).
- ⚠️ OneDrive sync locks `.next/` on Windows occasionally — if dev server EBUSY-loops, stop + `rm -rf .next` + restart.

## ⚠️ DB write methods
- `supabase` MCP tools are connected; use `mcp__supabase__execute_sql` for DML and `apply_migration` for DDL/RPC changes.
- For DML where MCP isn't available, run a node script that loads `.env.local` → `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`. Pattern: `scripts/gl-import-apply-v2.mjs`.
- TypeScript types: regen via `mcp__supabase__generate_typescript_types`, unwrap JSON (`JSON.parse(text).types`), write to `src/lib/supabase/database.types.ts`.

## Major changes this session (2026-05-26 → 28)

### A. GL re-import (new source: 26-May-2026 XLSX)
- Source: `C:\Users\User\OneDrive\Desktop\Houzs Venture - General Ledger 26.05.2026.xlsx` (53 source accounts, 1,613 raw lines).
- TB: `C:\Users\User\OneDrive\Desktop\Trial Balance.pdf` (Dr=Cr=**1,676,933.38**).
- 334 manual_jv entries / 1,580 journal_lines now in DB (wipe + re-insert via `scripts/gl-import-apply-v2.mjs`).
- Adjusting JEs baked in by `scripts/gl-import-preview-v2.mjs`:
  1. **Year-end closing 2025-12-31**: Dr 1510 RE 2,024 / Cr 9000 GE 2,024 (segment='corporate')
  2. **Suspense-split 2026-05-20**: 3053 ↔ 3063 + 4052 ↔ 4062 each 38,333.33 (segment='unallocated')
  3. **Per-bank cleanup (2 JEs)**: Alliance reserved for Director-only convention. Cross-segment transfer 19,651.43 from corporate→director via 1900 clearing.
- PV-000077 correction (4,130→3,540) is **already baked into the new source** — preview script's old correction toggle was removed.
- TB reconciliation: every account matches (verified post-import).

### B. Dept Pool re-opening (mig 269 → 270 → 271)
- 5 dept_pool opening rows after 3 iterations (Director value flip-flopped during user clarification):
  - Director: **np_in 37,218.37** (final, mig 271) — includes 19,651.43 top-up from Venture Pool via the cross-segment GL transfer JEs
  - Director Office: expense_out 2,255.49
  - Finance: expense_out 361.80
  - Marketing: expense_out 16,107.10
  - HR: no row (balance 0)
- Per-bank × per-segment landed as intended: **Alliance = Director only (922.47)**, HL absorbs everyone else.
- `/dept-pool` Total cash = 9,928.14 = HL 9,005.67 + Alliance 922.47 ✓ (bank-recon).

### C. Director Pool reset
- `director_payouts` drafts **DELETED** (Saving 9,040.69 → 0).
- `invoice_payout_pool` **wiped + 4 new rows** per user-provided breakdown:
  - WL (`a5f55a13`): 7,910.04
  - MK (`18b3aa79`): 8,790.51
  - WS (`5f9bec22`): 9,770.81
  - WW (`b5add299`): 10,747.01
  - Total: **37,218.37**
- `/director-pool` Total Pool = 37,218.37 (saving 0 + invoice 37,218.37).

### D. Save & Calculate behaviour fix (mig 268)
- `save_director_salary_results` RPC no longer writes `dept_pools` rows. Director Pool cash now lives via the same `credit_dept_pool_on_invoice_paid` trigger (mig 202) as the other 4 depts → driven by billing_payment PV settlement.
- Previously the RPC's `DELETE FROM dept_pools WHERE period_month=... AND transaction_type='np_in'` collaterally wiped bank-recon opening rows.

### E. Venture Pool semantic (corporate + treasury)
- Single segment filter `journal_entries.segment IN ('corporate', 'treasury')` applied in 5 read paths:
  - `/venture-pool` (hero, this-month, 12-month, ledger)
  - `/dept-pool` Venture row + per-bank breakdown
  - `dashboard_summary` RPC (mig 273)
  - `/reports/fund-summary` + xlsx/pdf export
- `treasury` includes future fund_in / fund_out / loan_repayment via `derive_journal_segment` (mig 217). Currently 0 in historical GL but auto-flows future activity.
- The legacy `venture_pool` TABLE is **kept** with existing writers untouched (approval/fund-out/voucher-paid), but **no reads anymore**. User decision: leave alone.

### F. Per-bank × per-segment view
- `/dept-pool` Cash tab has a **"Per-bank breakdown"** section under the main table.
- Rows: 5 depts + Venture (corporate+treasury merged). Cols: HL · Alliance · Total + bottom "Bank balance" row.
- Driven by `journal_lines + journal_entries.segment + account_code ∈ bank_accounts.gl_account_code`.

### G. Per-director Billed / Used / Remaining on `/director-pool`
- New table below Director Invoice section (Principal only).
- "Used" = sum of negative balances on the other 4 dept pools + Office (corporate cash if negative) — pro-rated across directors by their share of total billed.
- Last row absorbs rounding so column sums foot exactly.
- Current: Used 27,290.23, Remaining 9,928.14 (= bank cash).

### H. Billing UX overhaul
- **Multi-line invoice** (new flow, mig 275 + `CreateMultiLineInvoiceButton`): one bill, one bill-to, N line items each with own description / amount / category. Approve & Issue fans out per-line Cr JE. Single-line "+ Create Invoice" path still exists alongside.
- **Edit / Delete draft invoices** (mig 274 — `invoices_finance_delete_draft` policy; soft-field editor modal): finance can fix typos or delete pre-approval. Issued/paid stay locked.
- **Per-invoice PDF + batch PDF** at `/billing/invoice-doc`:
  - `?id=<uuid>` single page
  - `?ids=a,b,c` multi-page
  - `?period=YYYY-MM` whole period
  - PDF template = HV letterhead + bill-to + line items table (or flat desc) + total + reference
  - Per-row PDF link + period-batch button in /statements
- **Batch settle (knock-off)**: checkbox column on InvoicesList. Select any subset of `issued` (non-dept_pool) invoices, floating bar → modal (bank + date) → server creates billing_payment PV per invoice, all auto-paid. `batchSettleInvoices` server action.
- **OPEX cards gating fix**: cards + hero only show payroll figures after `payroll_runs.approved_at IS NOT NULL` (was firing on row exists). Subtitle differentiates: HR not submitted / HR submitted — awaiting Principal approval / Principal approved.
- **Modal scroll fix**: Create Invoice / Multi-line / New account modals use `items-start + backdrop overflow-y-auto + my-4` so they open at top, page scrolls naturally.
- **Sticky headers**: `/statements?tab=invoices` BillingView page-head + `/settings` Chart of Accounts header are `sticky top-0` — Create buttons always reachable.
- **New account button**: was tiny text link, now accent button + modal popup.

### I. Dashboard / reports
- `dashboard_summary` RPC: mig 272 → 273 (Venture Pool from journal_lines, includes corporate + treasury). Pool breakdown shows Venture row alongside dept pools (frontend appends).
- `/reports/ledger` enhancements (2026-05-25 sub-session, already shipped): search, reverse-order toggle, global back-to-top button.

### J. Cleanup
- 17 stale one-off scripts deleted (apply-mig-*, verify-mig-*, diagnose-*, etc.).
- /operating-fund orphan route deleted (duplicate of /venture-pool).
- `.env.local.shared` kept untouched (per user, secrets visible in OneDrive but accepted).

## Current data state (post-session, key facts)

### `/dashboard`
- Pool = **9,928.14** (= 18,493.98 dept_pools + (-8,565.84) Venture)
- Pool breakdown shows 5 dept pool rows + Venture (Office)

### `/dept-pool` Cash tab
- Director **37,218.37** / Director Office **(2,255.49)** / Finance **(361.80)** / HR 0.00 / Marketing **(16,107.10)** / Venture (Office) **(8,565.84)** → Total **9,928.14**
- Per-bank breakdown: Alliance = Director 922.47 only; HL takes the rest.

### `/director-pool`
- Total Pool 37,218.37 (saving 0 + invoice 37,218.37)
- Director Pool balance 37,218.37 → reconciliation "Buckets balance ✓"
- Per-director usage table: Billed 37,218.37 / Used 27,290.23 / Remaining 9,928.14

### `/reports/trial-balance`
- Dr = Cr = **1,676,933.38** (ties TB PDF)

### Bank
- HL (3000): 9,005.67 · Alliance (3010): 922.47 · Total 9,928.14
- `bank_accounts.current_balance` ties GL.

### May 2026 payroll_run
- Exists with HR 18,877.26 / Finance 23,170.12 / Marketing 47,166.26 / etc.
- `approved_at = NULL` (Principal hasn't approved yet) → all OPEX cards and hero show RM 0.00 with "awaiting Principal approval" subtitle. Once Principal approves on `/approvals/payroll-run/<id>`, figures surface.

## Migrations added this session
- `267_add_venture_attribution_billing_mode` — Postgres ENUM gains 'venture_attribution' so the new pool option works.
- `268_save_director_salary_drop_dept_pool_np_in` — Save & Calculate no longer writes dept_pools.
- `269_dept_pools_opening_2026_05_26` — first opening write (Director 37,218.37 in the originally interpreted role).
- `270_dept_pools_director_opening_to_natural_gl` — interim revert (Director 17,566.94) — superseded.
- `271_dept_pools_director_opening_to_37218_37` — final Director 37,218.37 again (current).
- `272_dashboard_venture_pool_from_journal_lines` — RPC reads journal_lines for hv_fund_balance.
- `273_dashboard_venture_pool_include_treasury` — RPC also includes treasury segment.
- `274_invoices_allow_finance_delete_draft` — RLS policy unlocks finance DELETE on draft.
- `275_invoice_lines_table` — new table for multi-line invoices + RLS.
- `276_invoices_settlement_voucher_id` — (2026-06-03 session) nullable FK on invoices → payment_vouchers for consolidated-receipt linkage.
- `277_drop_billing_payment_has_invoice` — (2026-06-03 session) dropped the obsolete CHECK that forced every billing_payment voucher to have a non-null invoice_id. It rejected consolidated OR vouchers (invoice_id=NULL). Root-caused via postgres ERROR log. Single-settle still sets invoice_id at app layer.

> Note: mig 269 / 270 / 271 are sequential reverts during user clarification. Current state = mig 271. Don't try to "clean up" by removing the interim ones — each runs in order; later overrides earlier.

## Scripts (in `scripts/`)
- `gl-import-preview-v2.mjs` — parses 26-May-2026 XLSX, applies YE closing + suspense split + per-bank cleanup, emits `gl-import-entries-v2.json`. Read-only.
- `gl-import-apply-v2.mjs` — wipes manual_jv + bulk-inserts the 334 entries / 1,580 lines, verifies TB + per-bank × per-segment.
- `gl-import-entries-v2.json` — the actual entries that landed in production (committed for traceability).
- (v1 versions `gl-import-preview.mjs` / `gl-import-apply.mjs` / `gl-import-entries.json` are legacy, kept for history but not used.)

## Open / pending decisions

### 1. venture_pool TABLE retirement
- Currently: 4 codepaths still INSERT into venture_pool (approvals/actions.ts L129/249/614, fund-out/actions.ts L220, lib/voucher-paid-helpers.ts L32, billing/BillingView.tsx L65 read).
- All READS have been moved off the table; writes are harmless but pollute on each PV/loan approval.
- User said "leave alone" — revisit only if it causes drift or noise later.

### 2. Multi-line invoice — edit / inter-billing edge cases
- `updateDraftInvoice` only edits flat soft fields. Multi-line edit not yet supported (must delete + recreate).
- Inter-billing (dept_pool target) on multi-line invoices works in create flow but the approve/issue JE path treats it like single-line (per-line Cr to category, no per-line inter-billing mirror). Likely fine for the cases user has but verify before scaling.

### 3. Batch settle — inter-billing excluded
- Batch action rejects `billable_to_type='dept_pool'` invoices. User must settle those individually via `/payments/new?invoice_id=`.
- Could be expanded later by inlining the inter_billing_out + mirror logic; punted for now.

### 4. User mentioned "I have a little bit to change" on session end
- New session will likely bring small tweaks. Listen first, then act — don't pre-emptively start.

## COA additions / mapping
Same as previous handoff (the COA itself is unchanged this session). For new invoices using `billing_mode='venture_attribution'`:
- Falls back to `5000` Cr account if no category_code given; per-line categories now override correctly (mig 275 + `resolveRevenueGlCode` honors any active COA code).

## Key IDs
- Principal user: `cbc6a18a-3f38-4567-b8c3-385d00b9e6b3`; Finance: `6c0c28a2-c936-4c83-9bf8-b8c54bda51c5`
- Director dept: `bb927615-b3cd-466a-9e65-c9a35999cb82`
- Companies: 2990 `8a7c5a36`, CAR `daeeb093`, CMI `538a18d5`, CONTS `89c32d76`, HC `5eab1801`, HK `24204cca`, OHN `346274df`
- Directors: MK `18b3aa79`, WL `a5f55a13`, WS `5f9bec22`, WW `b5add299`

## Source files on Desktop (current truth)
- `Houzs Venture - General Ledger 26.05.2026.xlsx` — latest GL (now imported)
- `Trial Balance.pdf` — final TB at 26 May 2026 (Dr=Cr 1,676,933.38)
- `HV - General Legder 22.05.xlsx` / `HV - Trial Balance 22.05.pdf` — superseded
- `HV - Bank Reconciliation - Format 1.pdf` — informational; bank-recon decision already baked into mig 269/271 + cleanup JEs.

## Reports architecture (unchanged from prior handoff)
- Income Statement / Balance Sheet / Cash Flow built from OPERATIONAL subledgers (payment_vouchers, invoices, treasury) PLUS the `manual_jv` GL entries folded via `gatherManualJvPnl` in `cfo-reports.ts`.
- Trial Balance reads `journal_lines` directly.
- Treasury-managed account codes (interest income / penalty income / interest expense by NAME, type=revenue/other_income/expense respectively) are EXCLUDED from the manual_jv fold and instead summed by `gatherTreasury` → routed to Venture Pool. **Interest expense lands in `vp.cost`** (not `vp.expense`).
- Per-pool layout (Income Statement, Cash Flow, /dept-pool page) share 6-pool view: Venture · Marketing · HR · Finance · Director Office · Director Pool. Empty pools shown.

## Untracked files
- `.env.local.shared` — copy of .env.local with secrets exposed in plain text. User decided to leave it (option C). DO NOT commit.

## Quick gotchas / future-Claude reminders
- When the user gives flip-flopping clarifications about a number, write a layered plan + numbered options BEFORE touching DB — they appreciate "let me confirm interpretation". Three migrations 269→270→271 for Director opening = the cost of skipping that step.
- TS type generation via Supabase MCP returns JSON-wrapped — needs `JSON.parse(text).types` extraction before writing to `database.types.ts`.
- `redirect()` inside server actions breaks if called in loops — extract logic into helpers when batching (see `batchSettleInvoices`).
- Bash CWD resets between calls — `cd /c/Users/User/OneDrive/Desktop/Claude/Venture/Venture-Portal && <cmd>` for git, node, npx.
- If new helper scripts appear during work (apply-mig-* etc.), decide upfront whether they're disposable (delete on session end) or worth checking in. This session's policy: delete one-offs once the work has been applied.
- Modals: use `items-start` + backdrop `overflow-y-auto` + `my-4` so they open at top — `items-center` + inner `overflow-y-auto` can land mid-content.
- Sticky headers + paper backdrop work fine inside `<main className="overflow-y-auto">` (the PortalFrame scroll container). Use `sticky top-0 z-20 bg-paper`.
- Vercel build is faster than typecheck locally (~60s) — push and watch instead of waiting for local `next build`. Errors surface quickly in the build log.
