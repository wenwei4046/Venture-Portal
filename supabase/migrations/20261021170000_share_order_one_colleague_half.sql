-- ============================================================================
-- 20261021170000_share_order_one_colleague_half.sql
-- A share request names ONE colleague, and the bill is half each (2026-10-21 — the user, answering the rules the first
-- version chose: "only can share one pax, then percentage for them request is fix with 50% 50%").
-- ============================================================================
--
-- The first version (mig 20261021150100) let a salesperson name up to five colleagues, each a part in whole percent. Now:
--
--   member_share_order_send   exactly one colleague, and their part is 0.5 — anything else is refused in words. The owner
--                             keeps the other half.
--   share_request_blocked     a bill somebody shares already (HR's *Share this bill* on Comm Cal) cannot be asked for: its
--                             split is not half and half, and changing it is HR's, on Comm Cal. The share sheet says so
--                             (`member_share_order_context` → blocked), the send refuses, and HR's Approve refuses a
--                             request whose bill HR shared meanwhile — reject it.
--
-- HR's Approve / Reject (`revenue_share_request_decide`) and everything else are unchanged. No request was ever sent before
-- this (production, 2026-10-21: 0 requests), so none has more than one colleague.
--
-- Both functions are changed from PRODUCTION's body (mig 20261021150100, applied the same day), one statement swapped at a
-- time (pg_temp.swap_check). PGlite: tests/member-sql/validate-share-requests.mjs.

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── One colleague ───────────────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_share_order_send(uuid, jsonb, text)'::regprocedure,
$old$  IF jsonb_array_length(p_parts) > 5 THEN
    RAISE EXCEPTION 'Share a bill with up to 5 people at a time.' USING ERRCODE = '22023';
  END IF;$old$,
$new$  IF jsonb_array_length(p_parts) > 1 THEN
    RAISE EXCEPTION 'Share a bill with one colleague — the two of you hold half each.' USING ERRCODE = '22023';
  END IF;$new$);

-- ── Half each ───────────────────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.member_share_order_send(uuid, jsonb, text)'::regprocedure,
$old$    IF NOT (v_pct > 0 AND v_pct < 1) THEN
      RAISE EXCEPTION 'A part is more than 0%% and less than 100%% of the bill.' USING ERRCODE = '22023';
    END IF;$old$,
$new$    IF v_pct <> 0.5 THEN
      RAISE EXCEPTION 'A shared bill is half each — 50%% for you, 50%% for your colleague.' USING ERRCODE = '22023';
    END IF;$new$);

-- ── A bill HR shares already is HR's to change ──────────────────────────────

SELECT pg_temp.swap_check('public.share_request_blocked(uuid)'::regprocedure,
$old$  RETURN NULL;$old$,
$new$  IF EXISTS (SELECT 1 FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
              WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM so.staff_id) THEN
    RETURN v_no || ' is shared already — HR changes who shares it on Comm Cal.';
  END IF;
  RETURN NULL;$new$);

NOTIFY pgrst, 'reload schema';
