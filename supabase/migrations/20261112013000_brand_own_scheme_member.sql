-- ============================================================================
-- 20261112013000_brand_own_scheme_member.sql
-- 2990s in the Revenue app: in the sales, in no margin (2026-11-12).
-- ============================================================================
--
-- The user, 2026-11-11, of a Revenue team member's 2990s sales order: "这笔 sales order 就要出现在他们自己的记录里 …
-- 依然算作 Fair 的 revenue … 唯一不同的是看不到 margin，因为 2990s 本身没有 calculate 进 margin"; and 2026-11-12: "他的
-- sales 还是会出现在 arena 那边 … 他唯一不会出现的，只是所谓的 margin arena，但他会出现到 sales arena、brand arena，
-- 同时还有 KPI item 的 arena".
--
-- What stood before (after 20261112003700). A bill of a brand on its own commission scheme (comm_brands.own_scheme —
-- 2990S) is costed by nobody, so the Revenue app's facts read it as every uncosted bill: no margin, *Cost pending* —
-- counted among the bills a month's margin still waits for (blindOrders), holding the margin incentive board, and
-- ranked on a Margin board of its own that nobody could ever be placed on.
--
-- Now such a bill is JUDGED, never waited for, and adds nothing to any margin:
--   1. member_order_facts_with_old_bills answers it no margin and a no-sales cost of 0 — what a gift that cost nothing
--      answers — so every reader of the facts leaves it out of the margins and out of the bills still waiting for a
--      cost with no change of its own: member_scoreboard, member_scoreboard_range, member_downline_board,
--      member_arena_for_staff's people, both order books' margins. Its sales, its part of a shared bill, its deposit
--      and its KPI count are as any bill's: the Sales, Brand and KPI boards rank it.
--   2. Both order books say which bill it is (`ownScheme: true`) and never call it *No sales*.
--   3. member_arena_for_staff says which brand it is (`brands[].ownScheme`), so the Margin board lists no such brand.
--
-- Four functions are made again from PRODUCTION's bodies (2026-11-12, md5 of prosrc), each statement swapped found
-- exactly once, each refused if production's body has changed since. No signature changes, so every grant stays.
--
-- Rollback, in words: re-apply the bodies 20261108010000 (the facts), 20261107235500 (the books) and 20261030083500
-- (the Arena) left — or switch the brand off (comm_brands.is_active false): no bill is its own scheme's then.
--
-- PGlite: tests/member-sql/validate-brand-own-scheme-member.mjs (production's bodies, md5-checked; the migration
-- verbatim, twice).

BEGIN;

CREATE TEMP TABLE brand_own_member_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_own_member_fns VALUES
  ('public.member_order_facts_with_old_bills(uuid, date, date)',            '6904a0dd72dcc3abe5b4463071bbe077', 'c839f5c6887b77dda97f86898e6f1da3'),
  ('public.member_order_book_for_staff(uuid, uuid, date, date)',            'fd6297bdaa9b3ab0839613fc1e2ec221', '3a4b29f5ca1f1b674536cc4d606e9993'),
  ('public.member_principal_department_order_book(uuid, text, text)',       'c56232677b0541b8aec7a564d4a33cc1', '59e5b8cc4abd4586fc02387ccf1d4d9c'),
  ('public.member_arena_for_staff(uuid, uuid, uuid, text, text, boolean)',  '051de9ea5b73791a8ee5b0edd556fe94', 'aef21839c78b84ccb9e1c6ed9dea53ba');

-- The brand's own scheme is 20261112003700's.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'comm_brands' AND column_name = 'own_scheme') THEN
    RAISE EXCEPTION 'comm_brands.own_scheme is not here: apply 20261112003700_brand_own_scheme first';
  END IF;
END $$;

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_own_member_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
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

-- A function made again from the body the database holds, its statements swapped in pairs (old, new) — unless it is
-- this migration's own body already.
CREATE OR REPLACE FUNCTION pg_temp.remake(p_proc text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_oid   regprocedure := to_regprocedure(p_proc);
  v_makes text;
  v_def   text;
  i       integer;
BEGIN
  SELECT makes INTO STRICT v_makes FROM brand_own_member_fns WHERE proc = p_proc;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = v_oid) = v_makes THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- ── 1. The facts: no margin is read, none is waited for ──────────────────────────────────────────────────────────────
-- Each old text starts at its first character: a leading run of whitespace would take the line break before it.
SELECT pg_temp.remake('public.member_order_facts_with_old_bills(uuid, date, date)', ARRAY[
    -- (a) The scheme's brands that follow their own commission scheme.
    $o$), sources AS ($o$,
    $n$), own AS (
  -- (20261112013000) The brands that follow their own commission scheme (comm_brands.own_scheme — 2990s): a bill of
  -- one is the sub-department's sale like any other, and stands in no margin.
  SELECT DISTINCT upper(btrim(ob.code)) AS code FROM public.comm_brands ob
  WHERE ob.scheme_id=p_scheme AND ob.own_scheme AND ob.is_active
 ), sources AS ($n$,

    -- (b) Such a bill is judged, never waited for: a no-sales cost of 0, as a gift that cost nothing — every reader
    --     then leaves it out of the margins and out of the bills still waiting for a cost.
    $o$CASE WHEN b.goods-coalesce(k.amount,0)-b.charges<=0 AND coalesce(b.costed,true) THEN coalesce(b.team_cost,0) END AS no_sales_cost
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id  WHERE b.has_goods OR k.order_id IS NOT NULL$o$,
    $n$-- (20261112013000) A bill of a brand on its own scheme stands in no margin: judged, never waited for, it adds
   -- nothing to any margin — a no-sales cost of 0, what a gift that cost nothing answers.
   CASE WHEN ob.code IS NOT NULL THEN 0
        WHEN b.goods-coalesce(k.amount,0)-b.charges<=0 AND coalesce(b.costed,true) THEN coalesce(b.team_cost,0) END AS no_sales_cost,
   ob.code IS NOT NULL AS own_scheme
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
  LEFT JOIN own ob ON ob.code=upper(btrim(b.brand_code))
  WHERE b.has_goods OR k.order_id IS NOT NULL$n$,

    -- (c) And no margin is read on it — whatever its lines cost, or a margin keyed on the bill.
    $o$CASE WHEN s.margin_base<=0 THEN NULL$o$,
    $n$CASE WHEN s.own_scheme THEN NULL  -- (20261112013000) a brand's own scheme: no margin
   WHEN s.margin_base<=0 THEN NULL$n$
]);

-- ── 2. The order books say which bill it is ──────────────────────────────────────────────────────────────────────────
-- The member's own book, and the whole sub-department's for the Principal: the same three statements in each.
DO $books$
DECLARE
  v_proc text;
BEGIN
  FOREACH v_proc IN ARRAY ARRAY['public.member_order_book_for_staff(uuid, uuid, date, date)',
                                'public.member_principal_department_order_book(uuid, text, text)'] LOOP
    PERFORM pg_temp.remake(v_proc, ARRAY[
      -- (a) Never *No sales*: it sold, it is only in no margin.
      $o$'noSales',f.margin_pct IS NULL AND f.no_sales_cost IS NOT NULL,$o$,
      $n$'noSales',f.margin_pct IS NULL AND f.no_sales_cost IS NOT NULL AND NOT own.yes,$n$,

      -- (b) The bill says so.
      $o$|| jsonb_build_object('fullRevenue',f.full_revenue)$o$,
      $n$|| jsonb_build_object('fullRevenue',f.full_revenue)
   -- (20261112013000) A bill of a brand on its own commission scheme (2990s): in the sales, in no margin.
   || CASE WHEN own.yes THEN jsonb_build_object('ownScheme',true) ELSE '{}'::jsonb END$n$,

      -- (c) Whether its brand is one.
      $o$LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb)$o$,
      $n$LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id
  CROSS JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM public.comm_brands ob WHERE ob.scheme_id=c.id AND ob.own_scheme AND ob.is_active
    AND upper(btrim(ob.code))=upper(btrim(f.brand))) AS yes) own),'[]'::jsonb)$n$
    ]);
  END LOOP;
END $books$;

-- ── 3. The Arena says which brand it is ──────────────────────────────────────────────────────────────────────────────
SELECT pg_temp.remake('public.member_arena_for_staff(uuid, uuid, uuid, text, text, boolean)', ARRAY[
    $o$jsonb_build_object('code',b.code,'name',b.name) ORDER BY b.name$o$,
    -- (20261112013000) ownScheme: a brand ranked on the Sales, Brand and KPI boards, never on a Margin board.
    $n$jsonb_build_object('code',b.code,'name',b.name,'ownScheme',b.own_scheme) ORDER BY b.name$n$
]);

-- What this migration made is what it was written to make.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_own_member_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% ended as md5 %, not the body this migration makes', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

COMMIT;
