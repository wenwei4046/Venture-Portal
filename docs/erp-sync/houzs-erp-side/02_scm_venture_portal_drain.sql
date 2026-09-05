-- ----------------------------------------------------------------------------
-- 0NNN_scm_venture_portal_drain.sql  (Postgres — RE-NUMBER AT MERGE)
--
-- ERP -> Venture Portal LIVE sales-order feed, part 2 of 3: the DRAIN.
-- pg_cron + pg_net inside the ERP database, exactly as
-- docs/2990-live-sync/02_worker_2990.sql: every 10 s build each pending
-- document's snapshot, fire one async POST, mark 'sent'; every 15 s read the
-- responses, 2xx -> done, anything else -> back to pending. Truly live
-- (seconds), DB-native, no Worker code.
--
-- REQUIRES the pg_net and pg_cron extensions (Supabase Dashboard -> Database ->
-- Extensions). Apply AFTER part 1.
--
-- SENDS NOTHING until scm.venture_portal_sync_config holds vp.url + vp.secret
-- (set out of band, never committed — contract.md §5).
--
-- REVERSAL: SELECT cron.unschedule('vp_outbox_drain'); SELECT
--   cron.unschedule('vp_outbox_confirm'); DROP FUNCTION scm.drain_vp_outbox,
--   scm.confirm_vp_outbox, scm.vp_build_payload; DROP TABLE
--   scm.venture_portal_sync_config. Part 1 keeps queuing harmlessly.
-- Verified against: the portal receiver's contract (docs/erp-sync/contract.md,
--   Venture Portal repo, 2026-09-05). The payload shape below is what the
--   portal's contract.test.ts fixtures use. UNTESTED against this database —
--   run the health probe in contract.md §5 step 2 first.
-- ----------------------------------------------------------------------------

SET search_path = scm, public;

ALTER TABLE scm.venture_portal_outbox ADD COLUMN IF NOT EXISTS http_request_id bigint;

-- Receiver URL, secret and scope. A table, not vars, so staging/prod differ by
-- data only. Keys: vp.url, vp.secret, vp.companies ('1'), vp.since ('2026-08-01').
CREATE TABLE IF NOT EXISTS scm.venture_portal_sync_config (
  k text PRIMARY KEY,
  v text NOT NULL
);
COMMENT ON TABLE scm.venture_portal_sync_config IS
  'ERP -> Venture Portal feed settings: vp.url, vp.secret, vp.companies (comma-separated company ids that feed commission; Houzs = 1), vp.since (orders dated before this are never sent). Set out of band.';

CREATE OR REPLACE FUNCTION scm.vp_config(p_key text) RETURNS text
LANGUAGE sql STABLE SET search_path = scm, public AS $$
  SELECT v FROM scm.venture_portal_sync_config WHERE k = p_key
$$;

-- ---- The snapshot: the portal's contract §3 ---------------------------------
-- Header from the payment-totals VIEW (paid_total_sen, balance_sen_live, the
-- hold marker), minus the customer's PII and the two base64 images; items and
-- payments verbatim; the salesperson behind salesperson_id; snapshotAt = now().
CREATE OR REPLACE FUNCTION scm.vp_build_payload(p_doc_no text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = scm, public AS $$
DECLARE
  hdr jsonb; -- $
  sp  jsonb; -- $
BEGIN
  SELECT to_jsonb(v) - ARRAY[
           'phone', 'email', 'address1', 'address2', 'address3', 'address4',
           'ship_to_address', 'bill_to_address', 'install_to_address',
           'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
           'customer_po_image_b64', 'signature_b64', 'note', 'remark2', 'remark3', 'remark4']
    INTO hdr
    FROM scm.mfg_sales_orders_with_payment_totals v
   WHERE v.doc_no = p_doc_no; -- $

  IF hdr IS NULL THEN
    RETURN jsonb_build_object('docNo', p_doc_no, 'deleted', true, 'snapshotAt', now()); -- $
  END IF; -- $

  SELECT jsonb_build_object('id', s.id, 'name', s.name, 'staff_code', s.staff_code, 'user_id', s.user_id)
    INTO sp
    FROM scm.staff s
   WHERE s.id = (hdr ->> 'salesperson_id')::uuid; -- $

  RETURN jsonb_build_object(
    'docNo',       p_doc_no,
    'snapshotAt',  now(),
    'deleted',     false,
    'header',      hdr,
    'items',       COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.line_no NULLS LAST, i.created_at)
                               FROM scm.mfg_sales_order_items i WHERE i.doc_no = p_doc_no), '[]'::jsonb),
    'payments',    COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.paid_at, p.created_at)
                               FROM scm.mfg_sales_order_payments p WHERE p.so_doc_no = p_doc_no), '[]'::jsonb),
    'salesperson', sp); -- $
END $$;

-- ---- DRAIN: one POST per pending document, oldest first ----------------------
-- A document outside vp.companies / before vp.since is marked 'skipped' without
-- a request, so the queue never fills with orders the portal does not want.
CREATE OR REPLACE FUNCTION scm.drain_vp_outbox(batch integer DEFAULT 50) RETURNS integer
LANGUAGE plpgsql SET search_path = scm, public AS $$
DECLARE
  v_url       text := scm.vp_config('vp.url'); -- $
  v_secret    text := scm.vp_config('vp.secret'); -- $
  v_companies bigint[] := COALESCE(string_to_array(scm.vp_config('vp.companies'), ',')::bigint[], ARRAY[1]::bigint[]); -- $
  v_since     date := COALESCE(scm.vp_config('vp.since')::date, DATE '2026-08-01'); -- $
  r           record; -- $
  so          record; -- $
  req         bigint; -- $
  n           integer := 0; -- $
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN 0; -- $   not configured: rows wait, nothing is sent
  END IF; -- $

  FOR r IN
    SELECT doc_no
      FROM scm.venture_portal_outbox
     WHERE status = 'pending'
     GROUP BY doc_no
     ORDER BY min(enqueued_at)
     LIMIT batch
  LOOP
    SELECT company_id, so_date INTO so FROM scm.mfg_sales_orders WHERE doc_no = r.doc_no; -- $

    -- Out of scope (and not a delete of something we sent before): skip, quietly.
    IF FOUND AND (NOT (so.company_id = ANY (v_companies)) OR so.so_date < v_since) THEN
      UPDATE scm.venture_portal_outbox
         SET status = 'skipped', last_error = 'out of scope (company/since)', delivered_at = now()
       WHERE doc_no = r.doc_no AND status = 'pending'; -- $
      CONTINUE; -- $
    END IF; -- $

    req := net.http_post(
      url                  := v_url,
      body                 := scm.vp_build_payload(r.doc_no),
      headers              := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
      timeout_milliseconds := 8000); -- $

    UPDATE scm.venture_portal_outbox
       SET status = 'sent', http_request_id = req, attempts = attempts + 1, sent_at = now()
     WHERE doc_no = r.doc_no AND status = 'pending'; -- $
    n := n + 1; -- $
  END LOOP; -- $
  RETURN n; -- $
END $$;

-- ---- CONFIRM: 2xx => done; anything else => pending again (retry) ------------
-- pg_net answers asynchronously into net._http_response; this joins the
-- in-flight rows to their answers. A row whose response has aged out of
-- net._http_response (pg_net keeps ~6 h) is treated as unanswered and retried.
CREATE OR REPLACE FUNCTION scm.confirm_vp_outbox() RETURNS integer
LANGUAGE plpgsql SET search_path = scm, public AS $$
DECLARE
  r record; -- $
  n integer := 0; -- $
BEGIN
  FOR r IN
    SELECT o.id, resp.status_code, resp.timed_out, resp.error_msg, left(resp.content, 300) AS body
      FROM scm.venture_portal_outbox o
      JOIN net._http_response resp ON resp.id = o.http_request_id
     WHERE o.status = 'sent'
  LOOP
    IF r.status_code BETWEEN 200 AND 299 THEN
      UPDATE scm.venture_portal_outbox
         SET status = 'done', delivered_at = now(), last_error = NULL
       WHERE id = r.id; -- $
    ELSE
      UPDATE scm.venture_portal_outbox
         SET status = 'pending',
             last_error = COALESCE('http ' || r.status_code::text || ' ' || r.body, r.error_msg,
                                   CASE WHEN r.timed_out THEN 'timeout' END, 'unknown')
       WHERE id = r.id; -- $
    END IF; -- $
    n := n + 1; -- $
  END LOOP; -- $

  -- Answered nowhere within 10 minutes (response pruned, or pg_net never ran
  -- it): send again. The portal's snapshot guard makes a double send harmless.
  UPDATE scm.venture_portal_outbox
     SET status = 'pending', last_error = 'no response within 10 min'
   WHERE status = 'sent' AND sent_at < now() - interval '10 minutes'; -- $

  RETURN n; -- $
END $$;

-- ---- schedule: tight loop (真 live) -----------------------------------------
-- Supabase pg_cron supports sub-minute intervals ('10 seconds'). If this
-- database's pg_cron is minute-only, use '* * * * *' (60 s) for both.
SELECT cron.schedule('vp_outbox_drain',   '10 seconds', 'SELECT scm.drain_vp_outbox();');
SELECT cron.schedule('vp_outbox_confirm', '15 seconds', 'SELECT scm.confirm_vp_outbox();');
