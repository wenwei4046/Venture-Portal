# ERP → Venture Portal live sales-order feed — the contract

**For:** the Houzs ERP team (repo `Houzs-Century/Houzs-ERP`).
**Owner:** Principal. **Portal side:** built 2026-09-05, receiver live at
`POST /api/erp/v1/sales-orders`.
**Status labels** follow the ERP repo's working agreement: **PROVEN** = run and
observed here, **LIKELY** = consistent with what was read, **UNKNOWN** = not
established yet.

---

## 1. What this is

The Venture Portal pays Revenue Department commission from the ERP's sales
orders. Today that is a monthly xlsx export imported by hand. From now on the
**ERP pushes every changed sales order to the portal within seconds of it being
saved**, and the portal keeps the same tables the import fills — so compute →
apply → payroll are unchanged, just fed continuously.

The shape is the one the ERP already runs for the 2990 → Houzs mirror
(`docs/2990-live-sync/00_DESIGN.md` in the ERP repo): a same-transaction outbox
trigger, a pg_cron + pg_net drain every ~10 s, a receiver that answers 2xx for
every delivery it decides not to apply so the drainer never wedges, and an
hourly reconcile that re-queues anything never delivered. Zero loss
(一个不漏), idempotent, retry-to-ack — the portal side was built to exactly
those rules, and the ERP side is the same SQL pointed at a different receiver.

```
scm.mfg_sales_orders / _items / _payments
        │  AFTER trigger, same transaction, exception-safe
        ▼
scm.venture_portal_outbox            (01_scm_venture_portal_outbox.sql)
        │  pg_cron every 10 s → scm.drain_vp_outbox()
        │  builds the snapshot, net.http_post, marks 'sent'
        ▼
POST https://<portal>/api/erp/v1/sales-orders      x-sync-secret: <secret>
        │  200 {status: applied | duplicate | stale | held | skipped}
        ▼
scm.confirm_vp_outbox()  every 15 s: 2xx → done, else → pending (retry)
scm.reconcile_vp_outbox() hourly: anything never 'done' is re-queued
```

Latency budget: trigger (0 ms) + drain interval (≤ 10 s) + portal write
(**PROVEN** ~250 ms per order on the dev server, 17 requests in 4.2 s including
a cold compile). The Comm Cal page shows "LAST EVENT 12 S AGO" and ticks.

---

## 2. Endpoint

| | |
|---|---|
| Receiver | `POST https://<portal-host>/api/erp/v1/sales-orders` |
| Health | `GET https://<portal-host>/api/erp/v1/health` → `{ ok: true, service: "venture-portal", feed: "sales-orders", version: 1, time }` |
| Auth | `x-sync-secret: <shared secret>` — the same header the ERP's own mirror receivers use. `Authorization: Bearer <secret>` is accepted too. Compared in constant time. |
| Secret | ≥ 32 characters. **Generated on the ERP's Venture Portal Feed page and pasted on the portal** (Revenue › Fair › Commission Calculation › *Houzs ERP link*, 2026-09-13), where it is kept in Supabase Vault and read by the receiver through service-role-only functions (mig `20260916100000_erp_feed_key`). `ERP_SYNC_SECRET` on Vercel is accepted as well while it is set. Never in either repository. |
| Body | JSON, one delivery (§3), or `{ "orders": [ …up to 200… ] }` for a backfill tool. |
| Size | Vercel accepts up to 100 MB; a sales order is a few KB. |

`<portal-host>` is the production portal domain (the Vercel project pinned to
`sin1`, same region as the ERP's Supabase in `ap-southeast-1`).

### Responses — read this before writing the drain

The drainer keys on HTTP status exactly as the 2990 one does: **non-2xx keeps
the outbox row pending and retries it forever.** So:

| Status | Meaning | Outbox should |
|---|---|---|
| **200** | Delivered. The body says what the portal did (§4): `outcome` is the one word (`applied` / `duplicate` / `stale` / `held` / `skipped`; `mixed` for a backfill batch whose documents ended differently — 2026-09-13, so the ERP's `portal_outcome` column can carry it), `results[]` has it per document. A `duplicate`, `stale`, `held` or `skipped` outcome is **still a successful delivery** — the portal chose not to apply it and recorded why. | mark **done** |
| 401 | Wrong or missing secret. | stays pending; a human fixes the config |
| 422 | Unreadable delivery (`docNo` missing, `header.so_date` not a date, `items` not an array). Body names the document and the reason. Logged on the portal as `rejected`. | stays pending; a human fixes the payload — it will not fix itself |
| 503 | Portal has no `ERP_SYNC_SECRET` configured yet. | stays pending (retry) |
| 500 | Portal-side failure while writing. Logged as `error`. | stays pending (retry) — the RPC is atomic, nothing half-written |
| 400 | Not JSON. | stays pending; fix the sender |

**PROVEN** (2026-09-05, dev server): every row above except 500 and 503 was
exercised and answered as stated.

---

## 3. The delivery — the ERP's own rows, verbatim

One document per POST, exactly what `drain_so_outbox` already builds for 2990,
with three small additions marked **(add)**:

```jsonc
{
  "docNo": "HC-SO-013403",
  "snapshotAt": "2026-09-05T10:12:33.123456+00:00",   // (add) now() when the payload was built
  "deleted": false,                                    // true when the SO row no longer exists
  "header":   { /* one row of scm.mfg_sales_orders_with_payment_totals, minus PII (below) */ },
  "items":    [ /* scm.mfg_sales_order_items rows for the doc, verbatim */ ],
  "payments": [ /* scm.mfg_sales_order_payments rows for the doc, verbatim */ ],
  "salesperson": { "id": "<scm.staff.id>", "name": "Lucas Tan",     // (add) the person behind
                   "staff_code": "EMP-0012", "user_id": 12 }         //       header.salesperson_id
}
```

or, for a deleted document: `{ "docNo": "HC-SO-013403", "deleted": true, "snapshotAt": "…" }`.

**Header from the VIEW, not the base table (add).** `scm.mfg_sales_orders_with_payment_totals`
carries `paid_total_sen` and `balance_sen_live` (local_total − Σ payments) and
the hold marker columns; the portal's deposit gate reads `balance_sen_live`
first and falls back to `balance_sen`.

**Strip before sending (add):** `phone, email, address1..4, ship_to_address,
bill_to_address, install_to_address, emergency_contact_name,
emergency_contact_phone, emergency_contact_relationship,
customer_po_image_b64, signature_b64, note, remark2, remark3, remark4`. None
of it is a commission input; the two `_b64` columns are whole images. The
portal strips the same list again on arrival (`src/lib/erp-sync/contract.ts`)
so nothing depends on the ERP remembering — but the bytes should not travel.

Money stays in **sen**; the portal converts. Statuses stay in the ERP's
spelling (`IN_PRODUCTION`, `READY_TO_SHIP`, …); the portal normalises.

### What the portal reads from it (**PROVEN** against fixtures, `contract.test.ts`)

| Portal field | From | Note |
|---|---|---|
| order number | `docNo` | the identity; one live row per document |
| order date / period | `header.so_date` | month = `date_trunc('month', so_date)` |
| status | `header.status` | see §4 for which earn commission |
| hold | `header.on_hold` | the mig-0324 marker; a held order earns nothing while held |
| salesperson identity | `salesperson.id` ?? `header.salesperson_id` | matched to a portal staff row once, remembered (`comm_agent_aliases.erp_salesperson_id`) |
| salesperson name | `salesperson.name` ?? `header.agent` | display, and the fallback match on spelling |
| customer | `header.debtor_name`, `header.debtor_code` | |
| branch | `header.sales_location` | the WAREHOUSE the goods ship from (KL / PG / SRW). Stored as `location`; descriptive only |
| **venue** | `header.venue` | **the fair itself** — "SUNWAY PYRAMID CONVENTION CENTRE", "MIDVALLEY SOUTHKEY JB". Free text the ERP types (`venue_id` is present but never populated). Its own column since 2026-09-16, with sales grouped by it on the month page |
| brand | `header.branding` | matched to `comm_brands` by code or name, case-insensitive; else from the lines' `branding`; else Item Code prefixes; else none (warning) |
| sales value | `header.local_total_sen` / 100 | the list's "Amount" (`subtotal_sen` as fallback) |
| balance | `header.balance_sen_live` / 100 (else `balance_sen`) | what the deposit gate measures |
| created at | `header.created_at` | orders the 1st / 2nd / 3rd bill of the day |
| company | `header.company_id` | stored; Houzs = 1 |
| lines | `items[]` where `cancelled = false`, by `line_no` | `item_group`, `item_code`, `description`, `qty`, `unit_price_sen`, `total_sen`, `branding` |
| **line cost** | `items[].line_cost_sen` / 100 | **the cost source the margin layer was waiting for.** 0 on a priced line = unknown → Product List fallback → warning |


### What it does NOT send — the organiser

Nothing in the delivery says who ORGANISED an event. `venue` names the place;
`sales_location` names the warehouse; there is no promoter, host or organiser
field anywhere in the header, the items or the payments (checked against every
delivery the portal holds, 2026-09-16). The portal keeps that fact itself, in
`comm_venues` — one row per venue spelling the ERP sends, with an `organizer`
typed on Revenue → the month → *Sales by venue*. If the ERP ever gains the
column, the portal can read it instead; until then nobody should expect the
feed to carry it.

### The feed window — orders the portal will not keep

`erp_feed_settings.min_order_date` (Fair: **2026-08-01**) is the earliest order
date the portal stores. A delivery dated before it is answered **200
`skipped`** — "dated before the feed window" — and no month is created for it.
An order whose date is EDITED backwards out of the window is removed and
answered `applied` ("removed: re-dated before the feed window").

It exists because the ERP back-filled its whole history the first time the feed
was switched on (2,960 orders across 35 months, back to 2023-08) and kept
pushing edits to those documents afterwards. `vp.since` is meant to stop that on
the ERP's side; this is the portal's half, so a month deleted here stays
deleted whatever the ERP is configured to send. It is edited on the *Houzs ERP
link* card, beside the key.

---

## 4. What the portal does with a delivery

Every delivery becomes one row in the portal's `erp_sync_events` and one of:

| Outcome | When | Written? |
|---|---|---|
| `applied` | a new order, an update, or an order becoming excluded | yes — header upserted, lines replaced, day re-sequenced, Open Bill suggestions re-derived, batch counters refreshed |
| `duplicate` | same `snapshotAt` as the row already holds | no |
| `stale` | an older `snapshotAt` than the row already holds (out-of-order retry) | no |
| `held` | the month's commission run is **applied/locked**, or the month was **file-imported** | no — payload kept; HR replays after reopening the run |
| `skipped` | a brand-new `DRAFT`; a delete for a document the portal never saw; an order dated before the feed window | no |

**Commission rule, mirrored from the ERP** (`scm/shared/hr-commission.ts`,
`COMMISSION_EXCLUDED_STATUSES`): `CANCELLED`, `DRAFT`, the retired `ON_HOLD`
label and the `on_hold` marker earn nothing; **`CLOSED` still earns**; unknown
statuses earn. An excluded order stays in the portal with `cancelled = true` and
`erp_status` / `erp_on_hold` saying why, and comes back the moment the ERP
releases it. `deleted: true` excludes it as `DELETED`.

**Programme ownership (2026-09-11).** The endpoint resolves Fair on the portal and stamps its sub-department on every batch and delivery. One committed batch exists per sub-department and month. An IR import or applied run cannot replace, block or consume Fair sales. A Fair order released by a later month also protects its original month until that paying run is reopened.

**Ordering** is `snapshotAt`. The drain builds the payload at send time, so a
retry always carries the newest state; the guard exists for two in-flight
requests of one document crossing on the wire. Send it.

**PROVEN** on the live schema (rolled back) and again through the HTTP receiver
on 2026-09-05: new → duplicate → stale → update → match salesperson → second
order same day (sequence 2, brand from lines) → draft skipped → hold excluded
→ delete excluded → delete-unknown skipped; batch counters, aliases and the
event log all as stated.

---

## 5. The ERP side — three files, in the ERP's own conventions

`docs/erp-sync/houzs-erp-side/` in the portal repo holds the SQL, written for
`backend/src/db/migrations-pg/` (schema-qualified `scm.*`, no inner
`BEGIN/COMMIT`, `IF NOT EXISTS` throughout, and every internal `;` in a
PL/pgSQL body carrying the `-- $` line-comment the repo's splitter needs —
per migration 0066):

| File | What it adds | Depends on |
|---|---|---|
| `01_scm_venture_portal_outbox.sql` | `scm.venture_portal_outbox` + the three same-transaction triggers (header, items by `doc_no`, payments by `so_doc_no`). Additive; **enqueues only**, sends nothing. | — |
| `02_scm_venture_portal_drain.sql` | `scm.venture_portal_sync_config`, `scm.vp_build_payload(doc_no)`, `scm.drain_vp_outbox()`, `scm.confirm_vp_outbox()`, the two `cron.schedule` calls (10 s / 15 s). Sends nothing until the config rows exist. | **pg_net + pg_cron enabled** on the Houzs Supabase (`anogrigyjbduyzclzjgn`) — **UNKNOWN** whether they are today; the 2990 design says to check before committing (Dashboard → Database → Extensions) |
| `03_scm_venture_portal_reconcile.sql` | `scm.reconcile_vp_outbox()` hourly + a 30-day vacuum of delivered rows. | 02 |

Config rows (set once, out of band, never committed):

```sql
INSERT INTO scm.venture_portal_sync_config (k, v) VALUES
  ('vp.url',       'https://<portal-host>/api/erp/v1/sales-orders'),
  ('vp.secret',    '<the shared secret>'),
  ('vp.companies', '1'),            -- Houzs Century only; comma-separated ids
  ('vp.since',     '2026-08-01')    -- orders dated before this are never sent
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
```

`vp.companies` and `vp.since` bound the feed: 2990's orders (company 2) and
history older than the first commission month stay out unless widened.

### Rollout order

**As built (2026-09-13).** The ERP implemented this contract its own way — a
Worker cron drain rather than pg_cron + pg_net (its `docs/modules/venture-portal-feed.md`,
PR #3751) — and the three SQL files below are the original specification, kept
for the shape they describe. The steps that actually turn it on are now:

1. On the portal, nothing to deploy: the receiver is live.
2. ERP → Venture Portal Feed → Connection → **Generate API key** (the hand-off
   `docs/HANDOFF-2026-09-13-venture-portal-api-key-and-seconds.md` in the ERP
   repo); paste it on the portal's *Houzs ERP link* card. The receiver address
   the ERP needs is shown on that card.
3. ERP → **Test connection** → expect `200 {"ok":true,…}` → companies `1`,
   since `2026-08-01` → **Turn on** → **Queue anything not delivered** to
   backfill.
4. Portal → Comm Cal: match the salespeople the feed could not place.

The original plan, for the record:

1. **Portal:** set `ERP_SYNC_SECRET` on Vercel (Production) and redeploy. Until
   then the receiver answers 503 and nothing else changes.
2. **Prove the route from the ERP database**, before any trigger exists:
   ```sql
   SELECT net.http_get('https://<portal-host>/api/erp/v1/health',
                       headers := jsonb_build_object('x-sync-secret', '<secret>'));
   -- then a few seconds later:
   SELECT status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
   -- expect 200 {"ok":true,"service":"venture-portal",...}
   ```
3. Apply **01** (rows start accumulating, harmlessly). Apply **02** + the config
   rows. Watch `SELECT status, count(*) FROM scm.venture_portal_outbox GROUP BY 1`
   and the portal's Comm Cal page ("ERP live feed" → Recent deliveries).
4. **Backfill** the months the portal should hold (one row per document; the
   drain dedupes and the receiver upserts, so this is safe to re-run):
   ```sql
   INSERT INTO scm.venture_portal_outbox (doc_no, op)
   SELECT so.doc_no, 'BACKFILL' FROM scm.mfg_sales_orders so
    WHERE so.company_id = 1 AND so.so_date >= DATE '2026-08-01'
      AND NOT EXISTS (SELECT 1 FROM scm.venture_portal_outbox o
                       WHERE o.doc_no = so.doc_no AND o.status IN ('pending','sent'));
   ```
   At 50 documents per 10-second drain that is ~5 documents/s; a month of
   ~700 orders drains in under three minutes. **UNTESTED** at that scale —
   watch the first run.
5. Apply **03**. From here the feed is self-healing.
6. On the portal, HR opens Revenue → Fair → Comm Cal and matches the
   salespeople the feed could not place (once each; remembered).

### Rotating the secret

Set the new value on Vercel first (the old one keeps working until the deploy
finishes), then `UPDATE scm.venture_portal_sync_config SET v = '<new>' WHERE k = 'vp.secret'`.
A window of 401s between the two only delays deliveries — the outbox retries.

---

## 6. Operating it

- **Is it live?** Comm Cal → "ERP live feed" → LAST EVENT … S AGO. On the ERP:
  `SELECT status, count(*), max(enqueued_at) FROM scm.venture_portal_outbox GROUP BY 1`.
  Pending that keeps growing while the portal answers 200 means the confirm
  job is not running; pending with `last_error = 'http 401'` means the secret.
- **A month's run is applied and the ERP keeps changing orders in it.** They
  arrive as `held` (visible on Comm Cal with a count per month). Reopen the run,
  press **Replay**, recompute. Clawback across periods is still not a rule
  (spec §13).
- **A month was file-imported before the feed existed.** Its deliveries are
  `held` too. Retire that import (supersede it) and replay, or leave the month
  as imported — the feed never overwrites a file month.
- **Someone imports a file for a live month.** The importer refuses.
- **Portal down for an hour.** The outbox keeps every row pending, the drain
  retries every 10 s, the reconcile re-queues anything missed; nothing is lost.
- **The ERP renames a column.** The portal reads a fixed list (§3) and answers
  200 for anything it can still read. A rename of `so_date`, `doc_no` or
  `status` would 422 — loudly, in `last_error`.

---

## 7. Keeping up with the ERP's catalogue

Two things drift between the ERP and the portal, and they drift for different
reasons. Both were measured on 2026-09-16 over the 509 orders / 2,720 lines the
portal then held.

### 7.1 Item groups — a small closed set the portal should LEARN, not type

`comm_item_groups` is typed by hand in Rules. The ERP's spellings have moved on:

| The ERP sends | Lines | Value | In Rules? |
|---|---:|---:|---|
| `MATTRESS` / `SOFA` / `BEDFRAME` / `DINING` | 1,268 | RM 3.09M | yes |
| `SERVICE` | 140 | **RM 51,124** | no |
| `ACCESSORY` | 1,161 | RM 1,359 | no — Rules has `ACC` |
| `FABRIC_ACCESSORY` | 88 | RM 490 | no |
| `OTHERS` | 4 | RM 0 | no — Rules has `OTHER` |

Rules also carries `ACC`, `OTHER` and `TRANS`, which the feed has never sent.
An unclassified group is treated as **not commissionable** and warns, so the
month cannot sync — but it also means a new ERP product line silently earns
nothing until somebody notices.

**Proposed.** Register groups from the feed, the way venues are registered now:

1. `comm_item_groups.commissionable` becomes **nullable** — a third state,
   *not yet decided*, distinct from *decided: does not earn*. Today the two are
   the same value and that is what makes silence dangerous.
2. `ingest_erp_sales_order` inserts any unseen `item_group` for the scheme with
   `commissionable = NULL` (ON CONFLICT DO NOTHING), exactly as it now does for
   `comm_venues`.
3. Rules → Item groups lists **every group the feed has ever sent**, with this
   month's line count and value beside it, undecided ones pinned to the top.
   The run keeps refusing to sync while any of them is undecided — but now the
   page says which, and what it is worth.

Nobody types a group name again, and a new ERP product line appears on the page
the day its first bill lands.

### 7.2 Line cost — the ERP is the source, the Product List is the exception

`items[].line_cost_sen` is always present, and often zero:

| | Lines | Value |
|---|---:|---:|
| Real cost (`> 0`) | 481 | RM 543,383 |
| **Priced but costed 0** | **510** | **RM 2,659,212** |
| Null | 0 | — |

So the gap is on the ERP's side: its own costing is not filled for most
mattresses and sofas. Per group, distinct item codes against the portal's
Product List fallback:

| Group | Distinct codes | In Product List | With a unit cost |
|---|---:|---:|---:|
| MATTRESS | 62 | 8 | 4 |
| SOFA | 74 | 3 | **0** |
| BEDFRAME | 53 | 1 | 1 |
| ACCESSORY | 31 | 31 | 30 |

**Proposed.** Do not mirror the ERP's catalogue in `comm_products` — that was
tried (1,553 rows seeded) and the code systems do not line up. Instead:

- keep the existing precedence — **ERP line cost first, Product List second,
  nothing third** (already how `ingest_erp_sales_order` works);
- add a **Costing gaps** view: item codes the ERP priced but costed 0, grouped
  and sorted by value, with line counts. That turns "230 codes" into a work
  list of roughly 40 codes covering RM 2.66M, most of which belong back in the
  ERP;
- show the cost's PROVENANCE on the order-line drill-down (ERP / Product List /
  none), so a margin can be argued with;
- treat `comm_products` as an exception table: a row only for what the ERP
  genuinely cannot cost.

A bill with any uncosted commissionable line has **no** margin — the engine
refuses to judge it, and since 2026-09-16 so do the drill-downs. **MEASURED:**
only 21 of August's 319 bills (RM 100,382 of RM 2.0M) carry a complete cost.

---

## 8. Open points

| | Status |
|---|---|
| pg_net + pg_cron on the Houzs Supabase | **UNKNOWN** — check Extensions before applying 02 |
| Sub-minute pg_cron (`'10 seconds'`) | **LIKELY** — Supabase's pg_cron ≥ 1.5 supports it, and the 2990 design assumed it; fall back to `* * * * *` if refused |
| Which companies feed commission | **assumed** Houzs (1) only — `vp.companies` |
| Sub-department scoping | The existing endpoint always targets Fair. Batches, releases, held deliveries and run locks are scoped to Fair; IR uses a separate feed and may reuse document numbers. No ERP payload change is needed. |
| Salesperson self-service page in the portal | separate feature, not part of this contract |
