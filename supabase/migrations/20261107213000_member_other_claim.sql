-- ============================================================================
-- 20261107213000_member_other_claim.sql
-- Other claim: a Revenue member's claim for anything else, with its invoice (2026-11-07 — the user: "Revenue App
-- 上边，他们的 Submit Claim 里面多一个东西叫 Other Claim … 写主题是什么、remarks 是什么，and then attach 它的 invoice，
-- 然后填它的 amount。提交过去 HR 那边之后，HR 同样可以按 accept。然后看他是 pay by 跟着 payroll，还是 submit 过去
-- finance … finance 就会在 request 那边看到那个 request，等他 approve 了才去做他的 PV").
-- ============================================================================
--
-- What the phone sends: { claimType 'other', subject, remarks, amount, invoiceName, invoiceHash }.
--
-- 1. member_claim_other_detail(detail, staff, sub) — the claim as the database keeps it: the subject (1–100
--    characters, one line), the remarks (1–500), the amount as typed (RM, to the sen, above 0 — the invoice's, which
--    HR checks it against) and the verified invoice; nothing else the phone sent is kept. Open to whoever may send a
--    claim — member_prepare_request asks it (Requests · Create, the claims permission, an active membership in the
--    sub-department); no title list, unlike the transport and food claims.
-- 2. member_other_claim_invoice_taken(staff, hash, except) — an invoice is claimed once: the same file (its sha256)
--    is refused while another live claim of the same person carries it (not a draft, cancelled or rejected), of
--    whatever kind — an Airbnb stay's or an air ticket's too. Under a lock per person; asked by
--    member_prepare_request before anything is written.
-- 3. member_claim_detail_for hands claimType 'other' to (1), as it hands 'food' to member_claim_food_detail.
-- 4. member_prepare_request: the invoice check (2), and the request is titled "Other claim · <subject>".
-- 5. member_submit_request: the claims row's line — what HR's payroll line and Finance's Payment request read —
--    "Other · <subject> · <remarks>" (the remarks on one line). The invoice is required, as for every claim but
--    Outstation by road and food (the statement that says so is unchanged).
--
-- Nothing else moves: HR decides it as any claim (member_review_claim — Approve · add to payroll: a special_claim
-- line in the payroll month; Approve · request payment: it waits on Finance's Payment request), Finance makes its
-- voucher from there (claim_payment_queue, claim_create_payment_voucher) or returns it to HR
-- (finance_return_member_claim), and the claim follows its voucher or its payroll row.
--
-- Production's bodies, statements swapped (pg_temp.swap_check: refuses when production changed since; a second run
-- changes nothing); the file ends by checking the five bodies' md5 against what was tested
-- (tests/member-sql/validate-other-claim.mjs). Comments stay outside the function bodies.

CREATE OR REPLACE FUNCTION public.member_claim_other_detail(p_detail jsonb, p_staff uuid, p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_subject text := btrim(regexp_replace(coalesce(p_detail->>'subject',''),'\s+',' ','g'));
 v_remarks text := regexp_replace(coalesce(p_detail->>'remarks',''),'^\s+|\s+$','','g');
 v_amount text := btrim(coalesce(p_detail->>'amount',''));
BEGIN
 IF v_subject='' THEN RAISE EXCEPTION 'Enter the claim''s subject'; END IF;
 IF length(v_subject)>100 THEN RAISE EXCEPTION 'Keep the subject to 100 characters'; END IF;
 IF v_remarks='' THEN RAISE EXCEPTION 'Add remarks: what it was for'; END IF;
 IF length(v_remarks)>500 THEN RAISE EXCEPTION 'Keep the remarks to 500 characters'; END IF;
 IF v_amount!~'^\d{1,9}(\.\d{1,2})?$' OR v_amount::numeric<=0 THEN RAISE EXCEPTION 'Enter the amount, as its invoice shows'; END IF;
 IF coalesce(p_detail->>'invoiceHash','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Add the invoice'; END IF;
 RETURN jsonb_build_object('claimType','other','category','Other claim','subject',v_subject,'remarks',v_remarks,
  'amount',round(v_amount::numeric,2),'invoiceName',left(btrim(coalesce(p_detail->>'invoiceName','')),200),
  'invoiceHash',p_detail->>'invoiceHash');
END
$function$;

REVOKE ALL ON FUNCTION public.member_claim_other_detail(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_claim_other_detail(jsonb, uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.member_claim_other_detail(jsonb, uuid, uuid) IS
  'An Other claim worked out (2026-11-07): its subject (1-100, one line), remarks (1-500), the amount as typed (RM, above 0) and the verified invoice, nothing else kept. Called by member_claim_detail_for only.';

CREATE OR REPLACE FUNCTION public.member_other_claim_invoice_taken(p_staff uuid, p_hash text, p_except uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_no text;
BEGIN
 IF p_staff IS NULL OR coalesce(p_hash,'')='' THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('member_claim_invoice:'||p_staff::text));
 SELECT coalesce(o.request_no,'another request') INTO v_no FROM public.member_requests o
  WHERE o.staff_id=p_staff AND o.id IS DISTINCT FROM p_except AND o.kind='claim'
    AND o.status NOT IN ('draft','withdrawn','rejected') AND o.detail->>'invoiceHash'=p_hash
  ORDER BY o.created_at LIMIT 1;
 IF v_no IS NOT NULL THEN
  RAISE EXCEPTION 'This invoice is already claimed in %: an invoice is claimed once', v_no;
 END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.member_other_claim_invoice_taken(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_other_claim_invoice_taken(uuid, text, uuid) TO service_role;
COMMENT ON FUNCTION public.member_other_claim_invoice_taken(uuid, text, uuid) IS
  'An invoice is claimed once (2026-11-07): refuses an Other claim whose invoice file (sha256) another live claim of the same person carries — not a draft, cancelled or rejected — under a lock per person. Asked by member_prepare_request.';

-- ── Production's bodies, statements swapped ──────────────────────────────────

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

-- 3. An Other claim is worked out by its own function, as a food claim is.
SELECT pg_temp.swap_check('public.member_claim_detail_for(jsonb, uuid, uuid)'::regprocedure,
  $old$IF v_type='food' THEN RETURN public.member_claim_food_detail(p_detail, p_staff, p_sub); END IF;$old$,
  $new$IF v_type='food' THEN RETURN public.member_claim_food_detail(p_detail, p_staff, p_sub); END IF;
 IF v_type='other' THEN RETURN public.member_claim_other_detail(p_detail, p_staff, p_sub); END IF;$new$);

-- 4. Its invoice claimed once — before anything is written…
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_taken(v_staff, p_detail, p_revision); END IF;$old$,
  $new$IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_taken(v_staff, p_detail, p_revision); END IF;
 IF p_detail->>'claimType'='other' THEN PERFORM public.member_other_claim_invoice_taken(v_staff, p_detail->>'invoiceHash', p_revision); END IF;$new$);

-- …and "Other claim · Parking at MITEC".
SELECT pg_temp.swap_check('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)'::regprocedure,
  $old$v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim · '||coalesce(p_detail->>'monthLabel','')$old$,
  $new$v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim · '||coalesce(p_detail->>'monthLabel','') WHEN p_detail->>'claimType'='other' THEN 'Other claim · '||coalesce(p_detail->>'subject','')$new$);

-- 5. The claims row's line: "Other · Parking at MITEC · Three days of the fair, the receipt attached".
SELECT pg_temp.swap_check('public.member_submit_request(uuid)'::regprocedure,
  $old$WHEN r.detail->>'claimType'='food' THEN public.member_food_claim_line(r.detail)$old$,
  $new$WHEN r.detail->>'claimType'='food' THEN public.member_food_claim_line(r.detail)
  WHEN r.detail->>'claimType'='other' THEN concat('Other · ',r.detail->>'subject',' · ',btrim(regexp_replace(r.detail->>'remarks','\s+',' ','g')))$new$);

-- ── What runs now is what was tested ────────────────────────────────────────
-- The PGlite check (tests/member-sql/validate-other-claim.mjs, over production's bodies) and a dry run on production
-- that rolled back gave these same five bodies; anything else refuses the whole migration.
DO $do$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(x.sig || ' ' || coalesce(md5(replace(p.prosrc, E'\r', '')), 'missing'), '; ') INTO v_bad
    FROM (VALUES
      ('public.member_claim_detail_for(jsonb, uuid, uuid)', 'c64a555a030f94d7345effe57f3b926b'),
      ('public.member_prepare_request(text, uuid, jsonb, uuid, uuid)', '3dd3094d3757531d1e29de340c26f1d0'),
      ('public.member_submit_request(uuid)', 'dbfb9ff902722698d5202de8fda33a53'),
      ('public.member_claim_other_detail(jsonb, uuid, uuid)', '22a23ecf8898d10e1260ed902821b451'),
      ('public.member_other_claim_invoice_taken(uuid, text, uuid)', '99300aece17469b9c4a7ddba04b859f4')
    ) AS x(sig, want)
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(x.sig)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM x.want;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies that were tested: %', v_bad;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
