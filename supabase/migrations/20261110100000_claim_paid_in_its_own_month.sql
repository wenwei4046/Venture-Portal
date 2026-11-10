-- A member's claim is paid in the payroll of the month it is FOR, not the month it was sent (2026-11-10).
--
-- The user, on LOUIS's three October claims (Food Oct 2026, Air ticket and Outstation for October fairs)
-- approved into the Nov 2026 payroll: "这些都是10月的claim … 我要10月". `member_review_claim` handed
-- `member_claim_payroll_month` the day the claim was SENT, so a food claim — sendable only once its month
-- is over — could never reach its own month, and a fair's claim sent after the 1st went a month late.
--
-- The claim's own month (`member_claim_own_month(detail, sent)`):
--   food                      detail.month ('2026-10')                — the month claimed
--   outstation / airbnb / …   the month of detail.week (the brand week's Friday — a fair of 30 Oct–1 Nov
--                             is October's, as the food claim counts it)
--   anything else             the month it was sent, as before
-- `member_claim_payroll_month` still moves it on from there: never before the cutover, never a locked or
-- closed month, never a month this person's Revenue payroll has moved on from draft.
--
-- One statement of PRODUCTION's `member_review_claim` swapped in place (md5 62ab9cda… on 2026-11-10);
-- refused unless the old part is there exactly once; a second run is a no-op.

CREATE OR REPLACE FUNCTION public.member_claim_own_month(p_detail jsonb, p_sent date)
RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE
  v_month text := p_detail->>'month';
  v_week  text := p_detail->>'week';
BEGIN
  IF p_detail->>'claimType' = 'food' AND v_month ~ '^\d{4}-\d{2}$' THEN
    RETURN (v_month || '-01')::date;
  END IF;
  IF v_week ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN date_trunc('month', v_week::date)::date;
  END IF;
  RETURN date_trunc('month', p_sent)::date;
END
$fn$;

COMMENT ON FUNCTION public.member_claim_own_month(jsonb, date) IS
  'The month a member claim is FOR (2026-11-10): a food claim''s month, else its brand week''s month, else the month it was sent. member_review_claim pays it from there.';

REVOKE ALL ON FUNCTION public.member_claim_own_month(jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_claim_own_month(jsonb, date) TO service_role;

CREATE OR REPLACE FUNCTION pg_temp.swap_in(p_sig regprocedure, p_old text, p_new text)
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
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the part this migration changes is there % times, not once — production changed since it was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_in('public.member_review_claim(uuid, text, jsonb)',
  $q$v_month := public.member_claim_payroll_month(
      r.staff_id, r.sub_department_id,
      (coalesce(r.submitted_at, r.created_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date);$q$,
  $q$v_month := public.member_claim_payroll_month(
      r.staff_id, r.sub_department_id,
      public.member_claim_own_month(r.detail,
        (coalesce(r.submitted_at, r.created_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date));$q$);

DO $check$
BEGIN
  IF public.member_claim_own_month('{"claimType":"food","month":"2026-10"}', '2026-11-09') <> '2026-10-01'
     OR public.member_claim_own_month('{"claimType":"outstation","week":"2026-10-30"}', '2026-11-09') <> '2026-10-01'
     OR public.member_claim_own_month('{"claimType":"airbnb","week":"2026-11-06"}', '2026-11-09') <> '2026-11-01'
     OR public.member_claim_own_month('{}', '2026-11-09') <> '2026-11-01' THEN
    RAISE EXCEPTION 'member_claim_own_month answers the wrong month';
  END IF;
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.member_review_claim(uuid, text, jsonb)'::regprocedure),
            'member_claim_own_month(r.detail') = 0 THEN
    RAISE EXCEPTION 'member_review_claim was not changed';
  END IF;
END
$check$;
