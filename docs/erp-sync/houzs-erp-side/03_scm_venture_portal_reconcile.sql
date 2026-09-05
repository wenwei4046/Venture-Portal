-- ----------------------------------------------------------------------------
-- 0NNN_scm_venture_portal_reconcile.sql  (Postgres — RE-NUMBER AT MERGE)
--
-- ERP -> Venture Portal LIVE sales-order feed, part 3 of 3: RECONCILE.
-- The backstop that makes 一个不漏 provable and self-healing, as
-- docs/2990-live-sync/03_reconcile_2990.sql: any in-scope sales order with no
-- successfully delivered ('done') outbox row gets a fresh pending row, so the
-- next drain sends it. Covers a trigger-missed row (the trigger swallows its
-- own errors on purpose) and a permanently failed delivery.
--
-- Apply AFTER part 2.
-- REVERSAL: SELECT cron.unschedule('vp_outbox_reconcile');
--   SELECT cron.unschedule('vp_outbox_vacuum'); DROP FUNCTION scm.reconcile_vp_outbox.
-- ----------------------------------------------------------------------------

SET search_path = scm, public;

CREATE OR REPLACE FUNCTION scm.reconcile_vp_outbox() RETURNS integer
LANGUAGE plpgsql SET search_path = scm, public AS $$
DECLARE
  v_companies bigint[] := COALESCE(string_to_array(scm.vp_config('vp.companies'), ',')::bigint[], ARRAY[1]::bigint[]); -- $
  v_since     date := COALESCE(scm.vp_config('vp.since')::date, DATE '2026-08-01'); -- $
  n           integer; -- $
BEGIN
  INSERT INTO scm.venture_portal_outbox (doc_no, op)
  SELECT so.doc_no, 'RECONCILE'
    FROM scm.mfg_sales_orders so
   WHERE so.company_id = ANY (v_companies)
     AND so.so_date >= v_since
     AND NOT EXISTS (SELECT 1 FROM scm.venture_portal_outbox o
                      WHERE o.doc_no = so.doc_no AND o.status = 'done')
     AND NOT EXISTS (SELECT 1 FROM scm.venture_portal_outbox o   -- no duplicates in flight
                      WHERE o.doc_no = so.doc_no AND o.status IN ('pending', 'sent')); -- $
  GET DIAGNOSTICS n = ROW_COUNT; -- $
  RETURN n; -- $   rows re-queued; steady state is 0
END $$;

-- Hourly self-heal.
SELECT cron.schedule('vp_outbox_reconcile', '0 * * * *', 'SELECT scm.reconcile_vp_outbox();');

-- Housekeeping: delivered and skipped rows older than 30 days. The portal keeps
-- its own record of every delivery (erp_sync_events), so nothing is lost.
SELECT cron.schedule('vp_outbox_vacuum', '30 3 * * *',
  $$DELETE FROM scm.venture_portal_outbox WHERE status IN ('done', 'skipped') AND delivered_at < now() - interval '30 days'$$);
