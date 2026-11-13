-- ============================================================================
-- 20261114030000_brand_kpi_named.sql
-- A brand's own KPI item counts where the bill NAMES it — charged or not (2026-11-13).
-- ============================================================================
--
-- 20261112200000 found a brand's own KPI item (2990s' Upgrade fabric, Upgrade latex seat) only where the bill names
-- the special AND its special order charges for it above RM 0 — so that an upgrade given away earned nothing. The
-- user, shown that rule on 2026-11-13: "主要 detect 到有这个 KPI item，就算他有卖到 KPI，不需要去 detect 他有没有收钱。
-- 因为有时候他们是直接把价钱写在 remark 栏上，导致他的那个 amount 并没有填写在 KPI item 里，这样会导致你 detect 错。"
--
-- Now: the item is found wherever a piece of the sofa names the special (catalogue_line_facts), once per sofa set as
-- before. What comes OFF the bill's commissionable sales is still what its special order charges for that special —
-- the dearest copy on the set — and NOTHING where it charges nothing: the portal cannot read a price written in a
-- remark, so such a bill keeps its whole sales and is paid the bonus beside them. On production that day every 2990s
-- bill naming one of the two specials also charged for it (seven findings, RM 250 / RM 500): no figure moves.
--
-- One function, comm_kpi_hits, made again from PRODUCTION's body (md5 of prosrc, as 20261112200000 left it) with one
-- statement and two comments swapped; refused if production's body has changed since. Its signature and grants stay.
-- Every reader follows by itself: revenue_month_orders, the member facts, both order books, member_kpi_for_staff.
--
-- Rollback, in words: swap the LEFT JOIN back to JOIN and MAX(mo.amount) back in — or re-apply the body
-- 20261112200000 made.
--
-- PGlite: tests/member-sql/validate-brand-kpi-items.mjs (after 20261112200000, this migration verbatim, twice).

BEGIN;

CREATE TEMP TABLE brand_kpi_named_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_kpi_named_fns VALUES
  ('public.comm_kpi_hits(uuid, uuid[], date)', '2f12a0cd2714f2bd831c71d310fcb66b', '786af079da486a58f7b28967cdf134d5');

-- Production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_named_fns ORDER BY proc LOOP
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

-- The function made again from the body the database holds, its statements swapped in pairs (old, new) — unless it
-- is this migration's own body already.
CREATE OR REPLACE FUNCTION pg_temp.remake(p_proc text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_oid   regprocedure := to_regprocedure(p_proc);
  v_makes text;
  v_def   text;
  i       integer;
BEGIN
  SELECT makes INTO STRICT v_makes FROM brand_kpi_named_fns WHERE proc = p_proc;
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

SELECT pg_temp.remake('public.comm_kpi_hits(uuid, uuid[], date)', ARRAY[
    -- The statement: every line that names the brand's special, with what its special order charges — or nothing.
    $o$SELECT m.order_id, m.line_id, m.item_id, m.code_key, m.qty, MAX(mo.amount) AS amount
          FROM matched m
          JOIN money mo$o$,
    $n$SELECT m.order_id, m.line_id, m.item_id, m.code_key, m.qty, COALESCE(MAX(mo.amount), 0) AS amount
          FROM matched m
          LEFT JOIN money mo$n$,
    -- Its comment.
    $o$-- A brand's own special on a line, at what that line's copy of the special order charges for it — only
        -- where it charges.$o$,
    $n$-- (20261114030000) A brand's own special on a line — found where the line NAMES it, charged or not (the
        -- user, 2026-11-13: the price is sometimes written in the remark, the special's amount left empty) — at
        -- what that line's copy of the special order charges for it: nothing where it charges nothing, and then
        -- nothing comes off the bill.$n$,
    -- The finding's comment.
    $o$model that carry it and are charged for it, as many sets as its fewest pieces, its sign the sofa's —$o$,
    $n$model that carry it (20261114030000: charged or not), as many sets as its fewest pieces, its sign the sofa's —$n$
]);

-- What stands is what this migration makes.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%s is md5 %s', f.proc, md5(replace(p.prosrc, E'\r', ''))), '; ' ORDER BY f.proc) INTO v_bad
    FROM brand_kpi_named_fns f
    JOIN pg_proc p ON p.oid = to_regprocedure(f.proc)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM f.makes;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies this migration makes: %', v_bad;
  END IF;
END $$;

COMMIT;
