-- HR may pick the payroll month a member claim is paid in (2026-11-10).
--
-- The user, on RQ-2611-020 (ADRIAN's "Other claim · Transport claim", KL > Penang for the fair of
-- 30 Oct – 1 Nov), approved into the Nov 2026 payroll: "这个可以给HR decide calculate under which month
-- de吗？… 这个是oct的claim. HR 要算进oct payroll 的". An Other claim names no fair and no month, so
-- `member_claim_own_month` falls back to the month it was SENT.
--
-- *Approve · add to payroll* now takes an optional `month` ('YYYY-MM') in p_data:
--   absent / ''   the month worked out as before (member_claim_own_month → member_claim_payroll_month)
--   '2026-10'     exactly that month — refused unless it can take pay for this person, by the same rule
--                 member_claim_payroll_month moves on by: not before the cutover, not locked, not
--                 closed, and their Revenue payroll row there absent or a draft. Never moved on silently:
--                 HR picked it, so a month that cannot take it is said, not replaced.
--
-- One statement of PRODUCTION's `member_review_claim` swapped in place (md5 10c93a93… on 2026-11-10);
-- refused unless the old part is there exactly once; a second run is a no-op.

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
      public.member_claim_own_month(r.detail,
        (coalesce(r.submitted_at, r.created_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date));$q$,
  $q$IF nullif(btrim(coalesce(p_data->>'month', '')), '') IS NOT NULL THEN
      -- HR picked the month (2026-11-10): that month exactly, or said why not.
      IF btrim(p_data->>'month') !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Pick the payroll month the claim is paid in';
      END IF;
      v_month := (btrim(p_data->>'month') || '-01')::date;
      IF public.member_claim_payroll_month(r.staff_id, r.sub_department_id, v_month) IS DISTINCT FROM v_month THEN
        RAISE EXCEPTION '%''s % payroll can no longer take a claim. Pick another month',
          v_name, to_char(v_month, 'FMMonth YYYY');
      END IF;
    ELSE
      v_month := public.member_claim_payroll_month(
        r.staff_id, r.sub_department_id,
        public.member_claim_own_month(r.detail,
          (coalesce(r.submitted_at, r.created_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date));
    END IF;$q$);

DO $check$
BEGIN
  IF strpos((SELECT prosrc FROM pg_proc WHERE oid = 'public.member_review_claim(uuid, text, jsonb)'::regprocedure),
            'HR picked the month (2026-11-10)') = 0 THEN
    RAISE EXCEPTION 'member_review_claim was not changed';
  END IF;
END
$check$;
