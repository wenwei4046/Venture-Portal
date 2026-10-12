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
                   "staff_code": "EMP-0012", "user_id": 12 },        //       header.salesperson_id
  "fair": { "projectId": 2212, "venue": "PENANG WATERFRONT CONVENTION CENTRE",   // (add 2026-09-27)
            "organizer": "MLE", "startDate": "2026-09-25", "endDate": "2026-09-27", //  the event the
            "status": "confirmed", "brand": "ZANOTTI", "match": "PICKED",         //  salesperson picked;
            "fairDate": "2026-09-25", "code": "…", "name": "…", "eventType": "exhibition" }, // null when none
  "vpBrand": "AKEMI"   // (add 2026-09-27) the brand the salesperson picked when the products name none; null when not asked / skipped
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
| order date | `header.so_date` | the day the document was OPENED IN THE BACK OFFICE. **It is not the day of the sale and, since 2026-09-20, it no longer decides the month** — see §10 |
| status | `header.status` | see §4 for which earn commission |
| hold | `header.on_hold` | the mig-0324 marker; a held order earns nothing while held |
| salesperson identity | `salesperson.id` ?? `header.salesperson_id` | matched to a portal staff row once, remembered (`comm_agent_aliases.erp_salesperson_id`) |
| salesperson name | `salesperson.name` ?? `header.agent` | display, and the fallback match on spelling |
| customer | `header.debtor_name`, `header.debtor_code` | |
| branch | `header.sales_location` | the WAREHOUSE the goods ship from (KL / PG / SRW). Stored as `location`; descriptive only |
| **venue** | `header.venue` | **the fair itself** — "SUNWAY PYRAMID CONVENTION CENTRE", "MIDVALLEY SOUTHKEY JB". Free text the ERP types (`venue_id` is present but never populated). Its own column since 2026-09-16, with sales grouped by it on the month page |
| brand | `header.branding`, then `vpBrand`, then `fair.brand` | matched to `comm_brands` by code or name, case-insensitive: the ERP's Branding when it names a brand; else the brand the salesperson picked (§3.5); else the brand of the fair booth (not a cancelled one); else from the lines' `branding`; else Item Code prefixes; else none (warning). `erp_sync_order_brand`, mig `20260927080000` |
| sales value | `header.local_total_sen` / 100 | the list's "Amount" (`subtotal_sen` as fallback) |
| balance | `header.balance_sen_live` / 100 (else `balance_sen`) | what the deposit gate measures |
| created at | `header.created_at` | orders the 1st / 2nd / 3rd bill of the day |
| company | `header.company_id` | stored; Houzs = 1 |
| lines | `items[]` where `cancelled = false`, by `line_no` | `item_group`, `item_code`, `description`, `description2`, `qty`, `unit_price_sen`, `total_sen`, `branding` |
| **line build** | `items[].variants` (since 2026-09-24) | ALLOWLISTED to `fabricCode`, `seatHeight`, `legHeight`, `divanHeight`, `gap`, `totalHeight`, `size`, `specials` (strings) and stored on the line's `raw.variants` — what the cost rule reads a sofa's seat height and a bed frame's options from before it ever parses `description2` (§9.4). The ERP's `variants` also carries money (`extraAddonAmountRM`) and free text; neither is kept, and the ERP's own builder now sends only the allowlist |
| line cost | `items[].line_cost_sen` / 100 | stored on `raw.cost` only. **Since 2026-09-24 it decides no margin** — every line is priced from the Product List (§9) |
| **fair** | `fair` (since 2026-09-27) | the event the salesperson picked — see §3.4. Pinned to the bill; its venue, organiser and days are the fair's everywhere on the portal |
| **brand pick** | `vpBrand` (since 2026-09-27) | the brand the salesperson said the bill is for when its products name none — see §3.5. Stored on `raw.vpBrand` |

### 3.5 The brand — what the salesperson picked (2026-09-27)

A bill's margin ladder is its brand, and the ERP's `branding` is worked out from
the products — so a bill of bed frames or accessories alone arrives as
`BEDFRAME` / `SERVICE` / `NONE` / nothing. Those are never sold on their own
(user 2026-09-27): a bed frame or a pillow is a SECOND bill at a brand's fair,
and it follows that fair's brand. The fair picker (§3.4) names the brand when it
matched a booth; it does not when the bill is keyed after the fair closed
(`UNMATCHED`), at a hall with several booths (`AMBIGUOUS`), or before the picker
existed.

So when NOTHING on the bill names a brand — not its `branding`, not one of its
lines (user 2026-09-27) — the ERP's order form asks which brand the bill is for,
after the save that makes it a live order (a create, a draft confirmed), and the
salesperson may skip it. The choices are the brands this portal has a margin
ladder for — the ERP's `scm.sync_config` `vp.brands`, seeded
`AKEMI,DUNLOPILLO,ERGOTEX,ZANOTTI` (user: "just follow VP"; a new ladder here is
a one-row UPDATE there) — cut to the company's `project_brands`, the picked
booth's brand first. The answer lives in its own column
(`scm.mfg_sales_orders.vp_brand`) and travels as a top-level `vpBrand`; the
ERP's `branding` is never changed by it.

| Value | Means |
|---|---|
| a `project_brands` name (`AKEMI`, `DUNLOPILLO`, …) | the bill is that brand's — matched to `comm_brands` like Branding (`DUNLOPILLO` → `DUNLOP`) |
| `null` / absent | not asked (the products name a brand), or skipped |

Anything but a string is no pick — never a reason to refuse the sale. The
bill's brand, in order: Branding when it names a brand → `vpBrand` → a brand
picked on the portal (Sales orders › right-click › *Brand for the margin*, only
on a bill nothing else names a brand for; `sales_order_brand_picks`, kept
through every re-send) → the fair's brand → the lines (`erp_sync_order_brand`).
The picks and the fair come BEFORE the lines on purpose: a Dunlopillo pillow sold
at an Ergotex fair is an Ergotex bill.


### 3.4 The fair — what the salesperson picked (2026-09-27)

Since 2026-09-13 the ERP's sales-order form makes the salesperson PICK the event
a bill was written at — a place plus an organiser plus its days, offered from
the ERP's own project list (`backend/src/scm/lib/fair-options.ts` there) — and
stamps the order with the matching brand booth (`scm.mfg_sales_orders.project_id`
→ `public.projects`) and, from 2026-09-24, the day of the fair the sale was
(`fair_date`). From 2026-09-27 the pick is required to open an order.

`scm.vp_build_payloads` sends it as a top-level `fair` (ERP migration
`20260927T…_scm_vp_order_fair`), built from the project row, not the header —
the header comes from `mfg_sales_orders_with_payment_totals`, a view whose
column list was frozen before `project_id` existed:

| Key | From | Note |
|---|---|---|
| `projectId` | `projects.id` | one BRAND's booth. One event at one hall is several projects (MID VALLEY 11–13 Sep REX = 340, 341, 2250) |
| `venue` | `projects.venue` | a name from the ERP's venue master; the portal tidies spaces and folds it through `canonical_key` like any venue |
| `organizer` | `projects.organizer` | from the ERP's organiser register — a name the portal has not seen is ADDED to `comm_organisers` ("Named by the Houzs ERP"), never refused |
| `startDate`, `endDate` | `projects.start_date` / `end_date` | `YYYY-MM-DD`, inclusive; an open-ended project closes on its first day |
| `status` | `projects.status` | `cancelled` = the office withdrew from the booth: **no fair** |
| `match`, `fairDate` | `mfg_sales_orders.fair_match` / `fair_date` | stored on `raw.fair`; not yet read |
| `code`, `name`, `brand`, `eventType` | `projects` | descriptive; `name` becomes a new fair's note |

`fair` is `null` (or absent) when the order has no project. A `fair` the portal
cannot read — no project id, no venue, a date it cannot parse, an end before
its start — is treated as no pick: **never** a reason to refuse the order.

What the portal does with it (`erp_sync_fair`, mig `20260927010000`):

1. **Finds the fair**: the one already holding this project, else the event it is
   a booth of (same place, overlapping days — the exact window first), else a
   new `comm_venue_events` row (`source = 'erp'`, month = the start's month).
2. **The ERP wins**: an existing fair takes the ERP's organiser and days, and its
   `source` becomes `erp`. Nobody types a fair on the portal any more — Revenue ›
   Venues was removed the same day.
3. **Pins it** to the bill (`fair_source = 'erp'`). The calendar never re-guesses
   an ERP pin, and a move into its fair's month is a CONFIRMED move. A later
   delivery without a fair un-pins it (the bill falls back to
   `venue_event_for_order`).
4. **The month does not move by itself.** A new document still lands in its
   `so_date` month; a re-sent one with a fair keeps its month. A bill whose fair
   counts in another month shows on the month page (*Bills of another month's
   fair*), where one click moves every confirmed one (`revenue_apply_fair_calendar`,
   refused for a month whose run has paid).

A project edited in the ERP (its days, organiser or status) re-queues the orders
that point at it (the same ERP migration), so the portal hears of it without
waiting for somebody to save a bill.

The old header-organiser path (`sales_orders_register_organiser`, which read
`raw.header.organiser` and seven spellings of it) is gone: the ERP never sent
the field, and the trigger's `ON CONFLICT` target had been dropped on
2026-09-20, so the first header to carry one would have failed its delivery.

**A venue-only edit is never forwarded (2026-09-20).** `trg_vp_outbox_so`
fires on `status, on_hold, so_date, branding, salesperson_id, agent,
debtor_name, debtor_code, sales_location, company_id` and the money columns.
`venue` is not in that list, so correcting the venue on an existing document
queues nothing and the portal keeps the old spelling forever. The value does
ride along on any other re-push, which is why this looks like it works. Add
`venue` (and `venue_id`) to the trigger's `UPDATE OF` list.

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
| `held` | the month's commission run is **applied/locked**, the month is **closed to the feed** (`erp_feed_closed_months`, 2026-09-26 — a delivery that would write into OR out of it), or the month was **file-imported** | no — payload kept; HR replays after reopening the run or the month |
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
  press **Replay**, recompute — or, since 2026-09-26, leave the month paid:
  each held change to a paid or settled bill becomes a pending **drop** or
  **upsell** (`erp_sync_note_adjustment`, the commissionable difference from
  what was settled, one per document) that HR pays into the month they are
  working on from the month page's *Drops and upsells the ERP found*.
- **Months paid outside the portal.** `comm_cutovers` (Comm Cal › *The portal
  pays from*) makes every earlier month closed to the feed for good — its
  deliveries are `held` and its changes become drops/upsells as above. A re-send
  never moves a bill that lives in a paying month back into one of them.
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

> **SUPERSEDED — first by §9 v1 (2026-09-17), then by §9 v2 (2026-09-24).**
> The catalogue IS mirrored now (items only), and the precedence below — ERP
> line cost first — is gone: the user ruled that every margin is measured
> against the portal's own prices, keyed on the Product List, and that the
> ERP's costing decides none of them. Read §9 first; this section is kept for
> its measurements, which show why the ERP's own line cost could not be relied
> on in any case.

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


---

## 9. The catalogue feed — ITEMS ONLY (v2, 2026-09-24)

> **v2 replaces v1 (2026-09-17).** v1 mirrored the SKU master and the combos
> WITH the ERP's money (`cost_price_sen`, the seat-height cost grid, both combo
> grids) and put the ERP's line cost first in the cost chain. No v1 delivery was
> ever sent. On 2026-09-24 the user ruled the other way:
>
> > 所有镜像功能只同步 item，不同步价钱与 costing。价钱由我这边填，Venture
> > Portal 里的 margin 统一由产品这边的价格来计算 costing 和 margin。ERP 这边
> > 只要加了新 item，那边就会自动同步新增；但改价钱不会同步，所有价格都在
> > Venture Portal 这边调。
>
> So the feed carries what EXISTS, never a price, and every margin in the portal
> is measured against the price typed on Revenue › Product List.

### 9.1 What travels

The ERP's Products page, as the portal's Product List mirrors it:

| section | ERP source | portal table | notes |
|---|---|---|---|
| `products` | `scm.mfg_products` | `erp_products` | every SKU of the company, inactive too (`status` travels) |
| `models` | `scm.product_models` | `erp_product_models` | the **Modular** tab: each model with its `allowed_options`, verbatim |
| `maintenance.pools` | `scm.maintenance_config_history` (scope `master`, latest effective) | `erp_maintenance_options` | Bedframe `divanHeights` / `totalHeights` / `gaps` / `legHeights`, Sofa `sofaSizes` / `sofaLegHeights` — values only |
| `specials` | `scm.special_addons` | `erp_maintenance_options` (`bedframe_specials` / `sofa_specials`) | one row per category it applies to |
| `fabrics` | `scm.fabric_trackings` | `erp_fabrics` | code, series, and the PRICE_1/2/3 tier it costs a sofa / bed frame at |
| `combos` | `scm.sofa_combo_pricing`, master rows (no customer, no supplier) | `erp_sofa_combos` | slots, tier, label and the seat heights it is offered at — the KEYS of its price grid, never the values. **Recorded, no longer read (2026-10-08):** the portal keeps its own combos (`catalogue_combos`, which adopted the live rows once); nothing on the ERP side needs to change |

**Not sent:** Variants, Fabric Converter, Categories, the "Products
Maintenance" pools (bed frame and mattress sizes, compartments, brandings,
supplier categories), and **any money**: no `*_sen`, no price grid values, no
option `priceSen`, no special's option-group `extraSen`, no fabric price or
stock. The ERP strips money in its own SQL before anything leaves (minimum
privilege: an allowlist of columns, then `scm.vp_strip_money_keys` at any
depth); the receiver strips it again (`isMoneyKey` / `stripMoney`,
`lib/erp-sync/catalogue.ts`), and so does the ingest, over the whole delivery
before it reads a field (`catalogue_strip_money`, mig `20260924030000` §0b) —
each at ANY depth and each on its own, so a money field can survive none of
the three. A key is money by the ERP's own pattern: named like a price, cost,
amount, surcharge, discount or margin, or ending `_sen` / `Sen` / `RM` —
except a price TIER (`sofa_price_tier`, `price_tier`: PRICE_1/2/3), which is a
label the portal prices by. The two portal strips are pinned to each other by
test.

**An empty `allowed_options` list is "no restriction", the ERP's own rule**
(`hasRestriction`, `allowed-options-check.ts`: only a non-empty list
restricts). The portal reads it the same way: a model the ERP left
unrestricted may offer anything in the Maintenance pool that Modular ticks
(`catalogue_model_options`, `erpAllows`).

### 9.2 The endpoint

| | |
|---|---|
| Receiver | `POST https://<portal-host>/api/erp/v1/products` — the sibling of the order feed's `/sales-orders` |
| Auth | identical to the sales-order feed — `x-sync-secret`, the same key |
| Body | `{ companyId, full, snapshotAt, products?, models?, maintenance?, specials?, fabrics?, combos? }` |
| Cap | 20,000 rows per delivery (a whole catalogue is ~4,200) |
| Cadence | whenever the catalogue CHANGED — the ERP sends it whole only when its digest moved |

Every section is optional; one a delivery omits is not touched, so a sender
may split a large catalogue BY SECTION. **`full: true` retires, per carried
section, every row that section did not mention** (`removed_at`, never
deleted — a retired SKU is still what last month's bill sold, and its price
here is still what that bill's margin was measured against). So a section must
never be split across two `full` deliveries, and an EMPTY section retires
nothing (an empty array from a broken query must not take the catalogue down).

The rows are the ERP's own, verbatim — its snake_case column names — so the
sender is a plain SELECT and the mapping lives in one place, the ingest
(`ingest_erp_catalogue`, mig `20260924020000` / `030000`). Answers: 401 wrong
key, 422 a delivery the portal cannot read (with the reason — it will not
self-heal), 500 a database fault (retry), 503 no key configured; otherwise 200
`{ ok, outcome: "applied", products, productsNew, productsRemoved, models, …,
adopted: { skus, models } }`. Every delivery is logged in `erp_sync_events`
(`doc_no = 'catalogue'`).

### 9.3 What the portal decides on top — never touched by a delivery

| table | what |
|---|---|
| `catalogue_skus` | the SKU's price (one figure, or a sofa module's `[{height, tier, price}]` grid) and whether the Revenue calculator offers it (`offered`) |
| `catalogue_models` | the model's **Modular** tick (`offered`) and which option values its dropdowns may show (`enabled`, keyed as the ERP keys `allowed_options`); gift / calculator section / brand overrides |
| `catalogue_option_prices` | a Maintenance option's surcharge (may be negative — "No Side Panel") |
| `catalogue_combo_prices` | a combo's price per seat height, keyed on (base model, slot-set, tier) so an ERP re-dating cannot orphan it |

A SKU the ERP adds arrives **unticked**: "10 SKUs over there, 7 ticked here →
the calculator offers 7" (user). On first sight a SKU inherits the price the old
hand-keyed Product List had for it (`catalogue_adopt_legacy`), and never again.

### 9.4 How a sale is costed now

One rule, in SQL (`catalogue_line_cost`, mig `20260924030000`) and its
TypeScript twins (`lib/catalogue/*`, which the member calculator uses):

1. the SKU's portal price — a sofa module's grid cell at the line's seat
   height and fabric tier (the fabric's tier from `erp_fabrics`, PRICE_2 when
   unknown — the ERP's own default), else the SKU's one figure;
2. **+** the portal surcharge of every Maintenance option on the line — a bed
   frame's divan / leg / total height and specials, a sofa's leg height and
   specials (the ERP's `computeMfgLineCost` shape); an option with no portal
   price adds nothing;
3. **× qty**;
4. then, per order at commit, a sofa build that IS one of its model's priced
   combos (the portal's own since 2026-10-08, `catalogue_combos`) is costed at
   the combo instead, spread over its lines in proportion to their own costs
   (same base model, one tier and one seat height across the set, uniform
   quantity or no combo, the combo always wins). Exactly the set since
   2026-10-08: the ERP's `recomputeTotals` also took a combo a bigger build
   covered, its extras at their own price; the portal does not.

The line's options are read from `items[].variants` when the order feed carries
them (the ERP adds an allowlisted `variants` — fabricCode, seatHeight,
legHeight, divanHeight, gap, totalHeight, size, specials — to each item), else
parsed from `description2`, which for every line the ERP wrote itself is its own
`buildVariantSummary` (`BO315-01 / SEAT 30 / LEG DEFAULT / SPECIAL: Nylon
Fabric`, `NB-04 / DIVAN 8" + LEG 4" / GAP 12" / T.Heights 24"`).

**The ERP's own line cost (`line_cost_sen`) is no longer read for a margin.**
A line nothing here can price has no cost, its bill has no margin, and
Revenue › Product List › *Costing gaps* names it worth-first with the reason:
`not_in_sku_master` (the code is not in the ERP's SKU master — an ERP gap),
`unpriced` (in it, no portal price — key one), `no_height` (priced as a sofa
grid, but the line named no seat height the grid knows).

A month already landed changes only when somebody presses **Recost**
(`recost_sales_order_lines` re-prices every line and every sofa build from the
Product List, and still refuses a month whose run has paid — 23RUN); the run
must then be computed again.

### 9.5 What the ERP side does

Built in the ERP repo (its *Venture Portal Feed* module, beside the order
feed): one SQL function builds the whole catalogue of a company as one
delivery body, money stripped in SQL, rows in a stable order so its md5 is a
digest; a cron sender (after the order drain on the `*/5` run, isolated from it)
posts it to the order URL's `/products` sibling only when the digest changed
since the last delivery the portal accepted, splitting by section if the body
would pass ~3 MB (Vercel's request limit is 4.5 MB). Same gates as the order
feed (switch + company scope + `vp.url` + `vp.secret`); same response taxonomy.
See the ERP's `docs/modules/venture-portal-feed.md`.

## 10. The one date the feed does not carry (2026-09-20)

> **Answered 2026-09-27.** The ERP now makes the salesperson pick the event on
> every order, and the delivery carries it as `fair` (§3.4) — the fair's own
> venue, organiser and days, plus `fairDate`, the day of the sale. The fair
> calendar is the ERP's from then on; what follows is the history of why it
> was needed.

**Ask.** Put the day of the SALE on the delivery, or an id for the fair it was
written at. Anything stable would do: `header.event_date`, a `fair_id` with a
`fairs` table behind it, or simply populating `header.venue_id` so the venue's
own calendar can be joined on it.

**Why.** `header.so_date` is the day the document was opened in the back
office. Fairs run Friday to Sunday, the paperwork comes back afterwards, and an
out-station fair is keyed a week later. The portal pays commission by MONTH, so
a fair at month end lands its whole weekend in the next month's payroll.

Measured against a hand-computed August 2026 claim form, bill by bill:

| | bills | value |
|---|---:|---:|
| in the portal's August, where the claim form has them | 174 | RM 1,202,637 |
| **pushed into September by `so_date`** | **106** | **RM 674,744** |
| never delivered at all | 60 | RM 253,086 |

Of the 280 documents that matched, **five** carried the right date. Median lag
+4 days, worst +42. Whole fairs moved: Kuching 28-31 Aug, MITC 30-31 Aug,
IOI GECC 29-31 Aug.

**What the portal checked before asking.** Every `header` key of all 552
deliveries it holds was enumerated on 2026-09-20. There is no `fair`, `event`,
`roadshow`, `exhibition` or `campaign` field of any spelling. `venue_id` exists
and is NULL on every order, including those received that morning. The other
dates are not substitutes: `created_at` / `updated_at` are record timestamps,
`payment_date` copies `so_date` (and is NULL on new orders),
`processing_date` equals `so_date`, and `customer_delivery_date` is delivery.

**What the portal does meanwhile.** A human types the fair calendar into
`comm_venue_events` (venue + organiser + the days it was open) and
`venue_event_for_order()` reads each bill's month off it. That works, but it is
typed once per fair forever and cannot know about a fair nobody typed. If the
feed starts carrying an event date or a populated `venue_id`, say so: the
resolver gains one step ahead of the calendar and the typing stops.

**A re-sent document keeps its month (2026-09-24).** The ERP re-sends a whole
document on every save, and until mig `20260924050000` the receiver re-derived
the month from `so_date` on each one — so a bill the fair calendar had moved
went back at its next save (four did overnight; a no-change replay of all 584
Fair bills would have moved 221 of them, RM 1,360,482). Now a NEW document
still lands in its `so_date` month, but a re-sent one that has a fair (the
human's pin, else `venue_event_for_order` on the delivery's venue and date)
keeps the month it is in; if that fair is in another month, the calendar lists
the move and a human makes it. A document no fair claims follows `so_date` as
before. The month-lock check follows the month the bill lives in.

## 11. Sales Attending — who works each booth (2026-10-12)

> The user: "Houzs ERP side got add on the sales attending for every project
> fair, so our sales is no more needed to select brand week. They can auto
> locate where they work, with the correct data … arena only calculate the
> correct point for current work week by detecting brand week." And for the
> booths nobody is listed at: "we set 2 layer. 1 layer is use track by erp
> houzs, if fail, then go with auto detect, same engine with previous one."

The ERP's PMS lists, on every project — one brand's booth at a fair — the
salespeople attending it (`public.project_sales_attendees` → `sales_reps`).
That list IS a seller's brand week now: the one booth a weekend whose Fair
result earns them points, and the fair a claim is for. Nobody picks one in the
portal any more.

### 11.1 What travels

One delivery = the WHOLE of one company's projects whose `start_date` is on or
after `since`, with or without anybody listed, cancelled ones included:

```jsonc
{ "companyId": 1, "snapshotAt": "2026-10-12T07:46:03Z", "since": "2026-04-01",
  "booths": [
    { "projectId": 363, "code": "…", "name": "…", "brand": "AKEMI", "venue": "MID VALLEY",
      "organizer": "BIGHOME", "startDate": "2026-10-02", "endDate": "2026-10-04",
      "status": "confirmed", "eventType": "exhibition",            // project_event_types.slug
      "attendees": [
        { "salesRepId": 54, "code": "SR-015", "name": "Chea Huan",
          "salespersonId": "b7eabf08-…" }                          // scm.staff.id of the rep's login, or null
      ] } ] }
```

`salespersonId` is the id the order feed already sends as a bill's
salesperson, so the portal names the person by `comm_agent_aliases` — a rep
the portal has never seen a bill from is listed but not matched (logged as
`unmatched`). No price, no cost, no customer.

### 11.2 The endpoint

| | |
|---|---|
| Receiver | `POST https://<portal-host>/api/erp/v1/sales-attending` — the order feed's `/sales-orders` sibling |
| Auth | identical to the order feed — `x-sync-secret`, the same key |
| Cap | 5,000 booths a delivery (~32 a month today) |
| Cadence | whenever a project or its list changed — sent whole when the ERP's digest moved |

`ingest_erp_sales_attending` (mig `20261012140000`, service role only) owns
every write: each booth is upserted into `erp_booths`, its list replaced in
`erp_booth_staff`, and **every booth of the company from `since` on that the
delivery does not list is deleted** (gone over there). Booths before `since`
stay as last told. An older `snapshotAt` than the one held answers 200
`{ outcome: "stale" }` and changes nothing (two pushes can overlap). Answers
otherwise as the catalogue: 401 wrong key, 422 unreadable (with the reason),
500 a database fault, 503 no key; 200 `{ ok, outcome: "applied", booths,
attendees, retired, unreadable, monthsMoved, unmatched }`. Every delivery is
logged in `erp_sync_events` (`doc_no = 'sales-attending'`). A month whose
booths changed forgets its kept My honours (`member_honour_months`).

### 11.3 What the portal does with it

`member_erp_brand_weeks(sub, staff?)` is the first layer: for each portal
person, the booth the ERP lists them at for each fair weekend — the weekend
named by the Friday of the Monday–Sunday week the fair opens in, the Arena's
weeks. Listed at two booths that weekend → the one they wrote the most bills
at (the second layer's own measure), then the earlier, then the lower project
id. A booth is read at the portal's fair for it: the one the order feed pinned
the project to (`comm_venue_events.erp_project_ids`), else the same place on
overlapping days (`erp_sync_fair`'s rule); it writes no fair of its own.

Where the ERP lists somebody at no booth that weekend, the second layer is the
engine as it was: the brand they opened the most bills for that week, at the
fair with the most bills for it (`member_arena_booth_history_for_staff`, mig
`20261012150000`). Read by the Arena's booth boards (`scoring`, and each
person's `source`: `erp` | `auto`), the claim form (`member_claim_brand_week`
→ `member_claim_detail_for`), Insight's weeks (`member_order_book_for_staff`
`brandWeeks`), My brand weeks and Today (the history's `weeks`, cut to the
person read) and HR's People › Member services › Brand weeks
(`member_admin_brand_weeks` `erp`). The four ways a pick was saved are gone; a
wrong week is fixed in the ERP.

### 11.4 What the ERP side does

Built in the ERP repo beside the catalogue push: one SQL function builds a
company's delivery (`since` = the first of the month six months back, so it
moves once a month), its md5 is the digest, statement triggers on `projects`,
`project_sales_attendees` and `sales_reps` mark a change in the same
transaction, and the kick / `*/5` cron posts it to the `/sales-attending`
sibling when the digest moved. Same gates and response taxonomy as the
catalogue. See the ERP's `docs/modules/venture-portal-feed.md`.

### 11.5 What the ERP held on 2026-10-12 (relayed in once by hand that day)

318 booths from 2026-04-01, 268 listed. Lists start in earnest on the weekend
of 18 Sep 2026: the 4 and 11 Sep weekends list nobody but The Commune Kulai, so
they stay auto-located. Two of the portal's Fair sellers, JASON and LOUIS, have
an ERP login (`scm.staff`) but no `sales_reps` row, so the PMS cannot list them
at all — every weekend of theirs is auto-located until the ERP adds them.
Listed but no portal person: NG PENG CHUEN, Hwa Sheng, Junie, Kingsley, Shi
Ting. Against the old guess the scoring booth moved for three: LAWRENCE and PEI
FEN on 25 Sep (to the booth the ERP lists them at), and ETHAN on 2 Oct (listed
at Sabah; his one bill that weekend says Setia Spice, so that weekend scores
nothing until the list or the bill is corrected).
