-- ============================================================================
-- 20261107230000_old_bills_are_not_sales.sql
-- An old bill topped up is commission, never sales — and still seen (2026-11-07).
-- ============================================================================
--
-- 20261107200000 let a departed salesperson's bill from before the feed window come in when somebody tops it up past
-- its deposit: ZNT4813 (HC-SO-010734, Junie's of 10 Mar 2026, RM 6,000; Shawn collected RM 3,200 on 2 Nov) lands in
-- November on Shawn. Shown what that does — A: a bill like any other, Shawn's November sales RM 32,586 → RM 38,586, his
-- Revenue app's month and target +RM 6,000; B: the commission only (9% × RM 6,000 ≈ RM 540), none of it his sales —
-- the user, 2026-11-07: "is go with b, not a". And then: "i want can view, then mention no count in sales target
-- (arena)".
--
-- So the Revenue app's sales never count an old bill. member_order_facts — what its month, its target, Insight, KPI,
-- the scoreboards, the snapshots and the Arena's month read — leaves it out, and so do the Arena's fair boards
-- (member_arena_history_for_staff, member_arena_booth_history_for_staff), which read the bills themselves. Its
-- commission still shows: My income reads Comm Cal's engine, which pays it as commission only (lib/commission, the
-- same day). And it is still SEEN: the order books (member_order_book_for_staff — the person's, their team's, the
-- Principal's view of them — and member_principal_department_order_book) list it as the bill it is, every figure its
-- own, plus "commissionOnly": true and "soldBy" (the ERP's salesperson, trimmed, or null) — on an old bill only; the
-- app leaves those out of every sum it makes. The books' margins never include one.
--
-- One calculation, two readings: member_order_facts' body becomes member_order_facts_with_old_bills, which reads every
-- bill as it always has and flags old_bill; member_order_facts is that without the old bills. comm_kpi_hits works bill
-- by bill, so no bill's KPI depends on an old bill being read beside it.
--
-- An old bill is told by its date, as Comm Cal tells it (oldBillOf, lib/commission/row-origin.ts): an ERP document
-- (source 'erp_sync') dated before its sub-department's feed window (erp_feed_settings.min_order_date, Fair
-- 2026-08-01) in a month from it on — nothing else brings such a bill in. sales_order_old_bill() is that rule: plain
-- SQL, IMMUTABLE, no SET clause, so the planner inlines it — no call per row. Each body reads the floor once (a scheme
-- CTE's column; a DECLARE variable). A month's claim form (source 'import') is never an old bill; nor is any bill while
-- a sub-department has no window.
--
-- Made again from PRODUCTION's bodies (2026-11-07 KL, pg_get_functiondef, md5 of prosrc) — refused if production's
-- body has changed since; a second run changes nothing:
--
--   member_order_facts_with_old_bills       (new: member_order_facts' body)  → a44fa5e5eb5934a60a8927a886ab69cf
--   member_order_facts                      137eb24ba94e9c5bb49789225ff4c271 → 987d328c0ec4087e4ce6f3e58346a382
--   member_arena_history_for_staff          bdd7644f24c5dbaea38587eb461cf89c → 44f66cb5dc4526ae177534929043bc5c
--   member_arena_booth_history_for_staff    275bdf919dd38cb0930d923cbfe06516 → 877c601f547dd01fecec83a4799a93bd
--   member_order_book_for_staff             ece458d6f851856de44959f14fe88840 → dda01c1653e5bccfc6191905c5f4e5bf
--   member_principal_department_order_book  5d14f2b5eb1d10cc763429ab6431a44f → 06407bc90bc5e9ca1a888bd19a9fc730
--
-- Signatures and RETURNS are unchanged, so CREATE OR REPLACE keeps each one's grants (service_role; the department
-- book's authenticated too — it asks for the Principal itself, member_principal_department_scheme). The new one is
-- member_order_facts': service_role only, for the DEFINER bodies that read it.
--
-- PGlite: tests/member-sql/validate-old-bills-not-sales.mjs (production's five bodies, md5-checked; the migration
-- verbatim, twice).
--
-- Dry run on production, rolled back (2026-11-07 ~21:50 KL; Fair's scheme, Sep–Nov): member_order_facts' 783 rows, the
-- 26 staff books, the department's book and both Arena boards exactly as before (asOf aside) — no old bill there yet —
-- and no slower. HC-SO-2611-001 re-dated to 10 Mar 2026 inside it left the facts and both Arena totals (−RM 11,372)
-- and stayed in both books, every figure its own, plus the two keys; its holder's margins = with no such bill.

BEGIN;

-- Production's bodies, or this migration's own once it has run; the new one absent, or this migration's.
DO $$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.member_order_facts(uuid, date, date)', '137eb24ba94e9c5bb49789225ff4c271', '987d328c0ec4087e4ce6f3e58346a382'),
      ('public.member_arena_history_for_staff(uuid, uuid)', 'bdd7644f24c5dbaea38587eb461cf89c', '44f66cb5dc4526ae177534929043bc5c'),
      ('public.member_arena_booth_history_for_staff(uuid, uuid)', '275bdf919dd38cb0930d923cbfe06516', '877c601f547dd01fecec83a4799a93bd'),
      ('public.member_order_book_for_staff(uuid, uuid, date, date)', 'ece458d6f851856de44959f14fe88840', 'dda01c1653e5bccfc6191905c5f4e5bf'),
      ('public.member_principal_department_order_book(uuid, text, text)', '5d14f2b5eb1d10cc763429ab6431a44f', '06407bc90bc5e9ca1a888bd19a9fc730')
    ) AS t(sig, before_md5, after_md5)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION '% is not on this database', r.sig;
    END IF;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.before_md5 AND v_md5 IS DISTINCT FROM r.after_md5 THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', r.sig, v_md5;
    END IF;
  END LOOP;
  IF to_regprocedure('public.member_order_facts_with_old_bills(uuid, date, date)') IS NOT NULL THEN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc
     WHERE oid = to_regprocedure('public.member_order_facts_with_old_bills(uuid, date, date)');
    IF v_md5 IS DISTINCT FROM 'a44fa5e5eb5934a60a8927a886ab69cf' THEN
      RAISE EXCEPTION 'public.member_order_facts_with_old_bills(uuid, date, date) is already here as md5 %, not this migration''s', v_md5;
    END IF;
  END IF;
END $$;

-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused
-- (20261031210000's).
CREATE OR REPLACE FUNCTION pg_temp.swap_text(p_src text, p_old text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pat   text := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_n     integer;
  v_found text;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A statement this migration swaps is there % times, not once — production changed since it was written: %', v_n, left(p_old, 80);
  END IF;
  v_found := (regexp_match(p_src, '(' || v_pat || ')'))[1];
  RETURN replace(p_src, v_found, p_new);
END
$fn$;

-- A function made from its own body (or p_from's) with these statements swapped, unless it is this migration's already
-- (its md5). Each old text starts at its first character: a leading run of whitespace would take the line break before
-- it.
CREATE OR REPLACE FUNCTION pg_temp.made_with(p_sig text, p_after text, p_swaps text[], p_from text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def text;
  i     integer;
BEGIN
  IF to_regprocedure(p_sig) IS NOT NULL
     AND (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = to_regprocedure(p_sig)) = p_after THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(to_regprocedure(coalesce(p_from, p_sig)));
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- ── 1. The rule ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Plain SQL, IMMUTABLE, no SET clause: inlined where it is used, never a call per row. The floor is the caller's to
-- read once.
CREATE OR REPLACE FUNCTION public.sales_order_old_bill(p_source text, p_order_date date, p_period date, p_floor date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT COALESCE(p_source = 'erp_sync' AND p_order_date < p_floor AND p_period >= p_floor, false)
$fn$;

COMMENT ON FUNCTION public.sales_order_old_bill(text, date, date, date) IS
  'An old bill topped up (2026-11-07): an ERP document (source erp_sync) dated before its sub-department''s feed window (p_floor = erp_feed_settings.min_order_date) in a month from it on — nothing else brings one in. Commission only, never sales: member_order_facts and the Arena leave it out; the order books list it, flagged commissionOnly (20261107230000). TS twin: oldBillOf (lib/commission/row-origin.ts).';

REVOKE ALL ON FUNCTION public.sales_order_old_bill(text, date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_order_old_bill(text, date, date, date) TO authenticated, service_role;

-- ── 2. Every bill, flagged: member_order_facts' body, as member_order_facts_with_old_bills ───────────────────────────
SELECT pg_temp.made_with('public.member_order_facts_with_old_bills(uuid, date, date)', 'a44fa5e5eb5934a60a8927a886ab69cf', ARRAY[
    -- (a) Its own name, and one column more.
    $o$FUNCTION public.member_order_facts(p_scheme uuid$o$,
    $n$FUNCTION public.member_order_facts_with_old_bills(p_scheme uuid$n$,
    $o$no_sales_cost numeric)$o$,
    $n$no_sales_cost numeric, old_bill boolean)$n$,
    -- (b) The sub-department's feed window, read once.
    $o$AS current_month$o$,
    $n$AS current_month,
   -- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
   (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = c.sub_department_id) AS feed_floor$n$,
    -- (c) Each bill says whether it is one, and carries it to the end.
    $o$AS is_cleared$o$,
    $n$AS is_cleared,
   -- (20261107230000) An old bill topped up pays its collector commission, never sales (the user: "is go with b"):
   -- member_order_facts leaves it out; the order books list it, flagged.
   public.sales_order_old_bill(so.source, so.order_date, so.period_month, c.feed_floor) AS old_bill$n$,
    $o$o.brand_code,o.is_cleared,o.manual_margin_pct,l.line_amount$o$,
    $n$o.brand_code,o.is_cleared,o.old_bill,o.manual_margin_pct,l.line_amount$n$,
    $o$l.manual_margin_pct,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods$o$,
    $n$l.manual_margin_pct,l.old_bill,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods$n$,
    $o$l.is_cleared,l.manual_margin_pct
 ), split AS ($o$,
    $n$l.is_cleared,l.manual_margin_pct,l.old_bill
 ), split AS ($n$,
    $o$FROM split s JOIN parts x ON x.order_id=s.id$o$,
    $n$,s.old_bill  -- (20261107230000) an old bill topped up: commission, never sales
 FROM split s JOIN parts x ON x.order_id=s.id$n$
  ], 'public.member_order_facts(uuid, date, date)');

-- member_order_facts': for the DEFINER bodies that read it, never a session's.
REVOKE ALL ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.member_order_facts_with_old_bills(uuid, date, date) IS
  $c$One private document-facts calculation for Insight, Arena and recent Income orders. Margin is the REVENUE TEAM margin - cost divided by comm_schemes.revenue_cost_divisor, the same basis the engine pays on - because the company's own margin is not the salesperson's to see. A bill of a month before the portal pays (comm_cutovers) is recognised in its own month as settled. Authorization stays in the public/member entry points. no_sales_cost (2026-10-30): a bill with no sales of its own (margin base RM 0 or less) has no margin, but what its goods cost — the holder's part, once every goods line is costed — counts against the month's margin. old_bill (20261107230000): every bill, the old bills topped up too (sales_order_old_bill) — commission, never sales. The order books list them, flagged commissionOnly; everything else reads member_order_facts, which leaves them out.$c$;

-- ── 3. The Revenue app's sales: every bill but an old one ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean, no_sales_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 -- (20261107230000) The Revenue app's sales: every bill member_order_facts_with_old_bills reads but an old bill topped
 -- up, which is commission, never sales (the user: "is go with b, not a"). The calculation lives there.
 SELECT f.order_id,f.staff_id,f.order_no,f.order_date,f.source_period,f.recognition_month,f.brand,f.cleared,f.revenue,
  f.goods_revenue,f.margin_pct,f.kpi_qty,f.manual,f.no_sales_cost
 FROM public.member_order_facts_with_old_bills(p_scheme,p_from,p_until) f
 WHERE NOT f.old_bill;
$function$;

COMMENT ON FUNCTION public.member_order_facts(uuid, date, date) IS
  $c$The Revenue app's sales (20261107230000): member_order_facts_with_old_bills — the one document-facts calculation, described there — without the old bills topped up, which are commission, never sales. Its month, target, Insight, KPI, the scoreboards, the snapshots and the Arena's month read this; the order books read the old bills too, flagged.$c$;

-- ── 4. The Arena's fair boards, which read the bills themselves ─────────────────────────────────────────────────────
SELECT pg_temp.made_with('public.member_arena_history_for_staff(uuid, uuid)', '44f66cb5dc4526ae177534929043bc5c', ARRAY[
    $o$v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;$o$,
    $n$v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  -- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
  v_floor date := (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = p_sub_department);$n$,
    $o$WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)$o$,
    $n$WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
      -- (20261107230000) An old bill topped up is commission, never sales.
      AND NOT public.sales_order_old_bill(so.source, so.order_date, so.period_month, v_floor)$n$
  ]);

SELECT pg_temp.made_with('public.member_arena_booth_history_for_staff(uuid, uuid)', '877c601f547dd01fecec83a4799a93bd', ARRAY[
    $o$v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;$o$,
    $n$v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  -- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
  v_floor date := (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = p_sub_department);$n$,
    $o$WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)$o$,
    $n$WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
      -- (20261107230000) An old bill topped up is commission, never sales.
      AND NOT public.sales_order_old_bill(so.source, so.order_date, so.period_month, v_floor)$n$
  ]);

-- ── 5. The order books: an old bill is seen as the bill it is, flagged — never in the margins ───────────────────────
SELECT pg_temp.made_with('public.member_order_book_for_staff(uuid, uuid, date, date)', 'dda01c1653e5bccfc6191905c5f4e5bf', ARRAY[
    -- (a) The person's bills with their old bills topped up, flagged.
    $o$SELECT f.* FROM public.member_order_facts(p_scheme,p_from,p_until) f$o$,
    $n$-- (20261107230000) The old bills topped up too, flagged old_bill: listed, commission only — never in the margins
  -- (the user: "i want can view, then mention no count in sales target (arena)").
  SELECT f.* FROM public.member_order_facts_with_old_bills(p_scheme,p_from,p_until) f$n$,
    -- (b) The margins: sales only.
    $o$FROM facts f WHERE f.cleared AND$o$,
    $n$FROM facts f WHERE f.cleared AND NOT f.old_bill AND$n$,
    -- (c) An old bill says so, and whose sale it was.
    $o$ORDER BY f.order_date,f.order_no)$o$,
    $n$-- (20261107230000) An old bill topped up: commission only, and the ERP's salesperson on it.
   || CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END
   ORDER BY f.order_date,f.order_no)$n$
  ]);

SELECT pg_temp.made_with('public.member_principal_department_order_book(uuid, text, text)', '06407bc90bc5e9ca1a888bd19a9fc730', ARRAY[
    -- (a) The department's bills with its old bills topped up, flagged.
    $o$sum(f.no_sales_cost) AS no_sales_cost
  FROM public.member_order_facts(v_scheme,lower(v_range),upper(v_range)) f$o$,
    $n$sum(f.no_sales_cost) AS no_sales_cost,
   -- (20261107230000) The old bills topped up too, flagged old_bill: listed, commission only — never in the margins
   -- (the user: "i want can view, then mention no count in sales target (arena)").
   bool_or(f.old_bill) AS old_bill
  FROM public.member_order_facts_with_old_bills(v_scheme,lower(v_range),upper(v_range)) f$n$,
    -- (b) The margins: sales only.
    $o$FROM facts f WHERE f.cleared AND$o$,
    $n$FROM facts f WHERE f.cleared AND NOT f.old_bill AND$n$,
    -- (c) An old bill says so, and whose sale it was.
    $o$ORDER BY f.order_date,f.order_no)$o$,
    $n$-- (20261107230000) An old bill topped up: commission only, and the ERP's salesperson on it.
   || CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END
   ORDER BY f.order_date,f.order_no)$n$
  ]);

-- What this migration made is what it was written to make — every mismatch in one refusal.
DO $$
DECLARE
  r record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.member_order_facts_with_old_bills(uuid, date, date)', 'a44fa5e5eb5934a60a8927a886ab69cf'),
      ('public.member_order_facts(uuid, date, date)', '987d328c0ec4087e4ce6f3e58346a382'),
      ('public.member_arena_history_for_staff(uuid, uuid)', '44f66cb5dc4526ae177534929043bc5c'),
      ('public.member_arena_booth_history_for_staff(uuid, uuid)', '877c601f547dd01fecec83a4799a93bd'),
      ('public.member_order_book_for_staff(uuid, uuid, date, date)', 'dda01c1653e5bccfc6191905c5f4e5bf'),
      ('public.member_principal_department_order_book(uuid, text, text)', '06407bc90bc5e9ca1a888bd19a9fc730')
    ) AS t(sig, after_md5)
  LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.sig);
    IF v_md5 IS DISTINCT FROM r.after_md5 THEN
      v_bad := v_bad || format(' %s ended as md5 %s;', r.sig, v_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
  END IF;
END $$;

COMMIT;
