-- ----------------------------------------------------------------------------
-- 0NNN_scm_venture_portal_outbox.sql  (Postgres — RE-NUMBER AT MERGE)
--
-- ERP -> Venture Portal LIVE sales-order feed, part 1 of 3: the OUTBOX.
-- Same shape as the 2990 -> Houzs mirror (docs/2990-live-sync/01_outbox_2990.sql)
-- and scm.autocount_outbox (0277): a row per intent, captured by an AFTER
-- trigger IN THE SAME TRANSACTION as the sales-order write, so a committed
-- order cannot exist without a forward task. Exception-safe: an outbox failure
-- never rolls back a salesperson's Save.
--
-- THIS FILE SENDS NOTHING. It only records what changed. Part 2 drains it.
--
-- Additive + idempotent (IF NOT EXISTS / OR REPLACE / DROP TRIGGER IF EXISTS).
-- REVERSAL: DROP TRIGGER trg_vp_outbox_so / _items / _payments; DROP TABLE
--   scm.venture_portal_outbox. Nothing else references it.
-- Verified against: the portal's receiver contract, docs/erp-sync/contract.md
--   in the Venture Portal repo (2026-09-05).
-- ----------------------------------------------------------------------------

SET search_path = scm, public;

CREATE TABLE IF NOT EXISTS scm.venture_portal_outbox (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_no          text        NOT NULL,
  -- INSERT | UPDATE | DELETE, suffixed ':<table>' when a child row fired it,
  -- BACKFILL / RECONCILE when a sweep queued it. Diagnostic only.
  op              text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'done', 'skipped')),
  attempts        integer     NOT NULL DEFAULT 0,
  http_request_id bigint,
  last_error      text,
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  delivered_at    timestamptz
);

COMMENT ON TABLE scm.venture_portal_outbox IS
  'ERP -> Venture Portal live feed queue. One row per change to a sales order (header, item or payment). Drained by scm.drain_vp_outbox() (pg_cron, every 10 s) into POST /api/erp/v1/sales-orders on the portal; marked done only on a 2xx ack. Never block a sale on it.';

-- The drain's only lookup: undelivered rows, oldest first.
CREATE INDEX IF NOT EXISTS venture_portal_outbox_pending_idx
  ON scm.venture_portal_outbox (enqueued_at) WHERE status = 'pending';
-- The confirm's lookup: in-flight rows by their pg_net request.
CREATE INDEX IF NOT EXISTS venture_portal_outbox_sent_idx
  ON scm.venture_portal_outbox (http_request_id) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS venture_portal_outbox_doc_idx
  ON scm.venture_portal_outbox (doc_no);

-- ---- header trigger ---------------------------------------------------------
CREATE OR REPLACE FUNCTION scm.enqueue_vp_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = scm, public AS $$
BEGIN
  BEGIN
    INSERT INTO scm.venture_portal_outbox (doc_no, op)
    VALUES (COALESCE(NEW.doc_no, OLD.doc_no), TG_OP); -- $
  EXCEPTION WHEN OTHERS THEN
    NULL; -- $   never block the sale; the hourly reconcile backfills a missed row
  END; -- $
  RETURN NULL; -- $   AFTER trigger: return value ignored
END $$;

-- Only the columns the portal reads (contract.md §3). An UPDATE that touches
-- none of them (priority, allocation warehouse, MRP fields...) queues nothing.
DROP TRIGGER IF EXISTS trg_vp_outbox_so ON scm.mfg_sales_orders;
CREATE TRIGGER trg_vp_outbox_so
  AFTER INSERT OR DELETE OR UPDATE OF
    status, on_hold, so_date, branding, salesperson_id, agent,
    debtor_name, debtor_code, sales_location, company_id,
    local_total_sen, subtotal_sen, balance_sen, deposit_sen, paid_sen,
    delivery_fee_sen, total_cost_sen, total_margin_sen
  ON scm.mfg_sales_orders
  FOR EACH ROW EXECUTE FUNCTION scm.enqueue_vp_outbox();

-- ---- child triggers: an item or payment edit re-forwards the parent SO ------
-- (the header's updated_at is not always bumped when only a line or a payment
--  changes, so the parent doc_no is captured from the child row.)
CREATE OR REPLACE FUNCTION scm.enqueue_vp_outbox_child() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = scm, public AS $$
DECLARE
  keycol text := TG_ARGV[0]; -- $
  dn     text; -- $
BEGIN
  BEGIN
    dn := COALESCE(to_jsonb(NEW) ->> keycol, to_jsonb(OLD) ->> keycol); -- $
    IF dn IS NOT NULL THEN
      INSERT INTO scm.venture_portal_outbox (doc_no, op)
      VALUES (dn, TG_OP || ':' || TG_TABLE_NAME); -- $
    END IF; -- $
  EXCEPTION WHEN OTHERS THEN
    NULL; -- $
  END; -- $
  RETURN NULL; -- $
END $$;

DROP TRIGGER IF EXISTS trg_vp_outbox_items ON scm.mfg_sales_order_items;
CREATE TRIGGER trg_vp_outbox_items
  AFTER INSERT OR DELETE OR UPDATE OF
    item_group, item_code, description, description2, uom, location,
    qty, unit_price_sen, discount_sen, total_sen, branding, cancelled,
    unit_cost_sen, line_cost_sen, line_margin_sen, line_no
  ON scm.mfg_sales_order_items
  FOR EACH ROW EXECUTE FUNCTION scm.enqueue_vp_outbox_child('doc_no');

DROP TRIGGER IF EXISTS trg_vp_outbox_payments ON scm.mfg_sales_order_payments;
CREATE TRIGGER trg_vp_outbox_payments
  AFTER INSERT OR UPDATE OR DELETE ON scm.mfg_sales_order_payments
  FOR EACH ROW EXECUTE FUNCTION scm.enqueue_vp_outbox_child('so_doc_no');

-- NO backfill here, on purpose. The 2990 file backfilled every SO at apply
-- time; this feed is bounded by company + start date (contract.md §5 step 4),
-- so the backfill is a deliberate, separate statement run after part 2.
