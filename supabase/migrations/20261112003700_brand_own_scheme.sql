-- ============================================================================
-- 20261112003700_brand_own_scheme.sql
-- 2990s — a brand that follows its own commission scheme (2026-11-11).
-- ============================================================================
--
-- The user, 2026-11-11: "在 Fair 的 Revenue Department Salary Calculation 里 … 只要是 … 2990s 的 sales order，whereby
-- 他们是 under revenue team 的 member，这笔 sales order 就要出现在他们自己的记录里。如果不是 revenue team 的人，就不需要
-- export 过来" — "依然算作 Fair 的 revenue … 唯一不同的是看不到 margin，因为 2990s 本身没有 calculate 进 margin，它是跟着
-- 自己独立的一套 commission scheme。整个提成逻辑一样，只是它的 top rank 抽成是 8%（以此类推，每级往下调 1%）: Team Leader
-- 8%, Senior Team Assistant 7%, Team Assistant 6%, Revenue Specialist Senior 5%, Revenue Specialist 4%"; and of everybody
-- else on those orders: "做的是 2990s 自己公司的 sales team。他不是 Revenue Team 的人，所以不需要把 sales order export 过来
-- 这边算薪水".
--
-- What stood before. On 2026-11-10 the Houzs ERP's feed was widened to every company (its `scm.venture_portal_feed`
-- = all — Lead View's Team reads the ERP's staff of both), so 2990's Home's sales orders (ERP company 2, documents
-- 2990-SO-…) began to land in Fair's months: 244 of them from August on — 226 keyed by 2990s' own salespeople, a list
-- of unmatched agents nobody could ever match, and 18 by Fair's own team, paid at Fair's rates under no brand and read
-- as bills waiting for a cost.
--
-- Now:
--   1. A BRAND MAY FOLLOW ITS OWN SCHEME (comm_brands.own_scheme) and BE AN ERP COMPANY (comm_brands.erp_company_id):
--      2990S — "2990s", company 2 — for Fair. Every order of that company is that brand's, whatever its products say
--      (erp_sync_order_brand asks the company first; a Happi Sleep mattress on a 2990's Home document is a 2990s bill).
--   2. ITS OWN RATE PER RANK (comm_rank_defs.brand_rates, keyed by the brand's id): the user's list, seeded on Fair's
--      catalogue — Rank B (Team Leader) 8%, C 7%, D 6%, E 5%, F (Revenue Specialist) 4%. A rank with none pays the
--      nearest rank below that has one (lib/commission/brand-rates.ts › brandRateOf); Rules › Ranks edits them.
--   3. ONLY THE TEAM'S ARE KEPT. A NEW document of such a company whose salesperson is not on the sub-department's
--      team in the month of the sale (erp_sync_outside_team: matched in comm_agent_aliases as the receiver matches,
--      holding a place on the sub-department's scheme in that month or directing it, not resigned before the sale) is
--      answered 200 skipped — "2990s order — NG PENG CHUEN is not on the Fair team" — and nothing is written, as a
--      draft or a document from before the feed window is. A bill the portal already holds is updated as any bill is.
--   4. THE BILLS ALREADY HERE: those nobody on the team sold are removed, with their lines and their rows of the ERP
--      audit trail (they paid nobody; no release, share, exclusion or close names one); the team's own are stamped
--      2990S, bills and lines. A bill HR took out by hand stays out — *Count this bill again* is HR's.
--
--   5. NO COST IS WAITED FOR. Such a bill stands in no margin, so the two lists of products a month still has no
--      cost for leave its lines out: revenue_uncosted_products (Comm Cal › All bills) and revenue_costing_gaps
--      (Product List › Costing gaps).
--
-- The run reads all of it in TypeScript (EngineInput.ownSchemeBrands, Rank.brandRates): a bill of such a brand is
-- paid the rank's rate for the brand, the override up its line is read on those rates, it stands in no margin, and
-- the sub-department's KPI items are not found on it.
--
-- Four functions are made again from PRODUCTION's bodies (2026-11-11, md5 of prosrc), each refused if production's
-- body has changed since: ingest_erp_sales_order (d8395b13…, the body 20261107200000 left) with two statements
-- swapped; erp_sync_order_brand (d0cb3217…, 20260927080000's) with one answer put ahead of the rest;
-- revenue_uncosted_products (89e2715b…) and revenue_costing_gaps (1348d459…) with one condition added each.
--
-- Rollback, in words: take the two swapped statements out of ingest_erp_sales_order again (or re-apply
-- 20261107200000's body), give erp_sync_order_brand its four answers back, and switch the brand off
-- (comm_brands.is_active false for 2990S — the two lists then leave nothing out) — the removed bills come back
-- with the ERP's next save of each, or its back-fill.
--
-- PGlite: tests/member-sql/validate-brand-own-scheme.mjs (production's bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

-- The functions this migration makes again: production's body it was written from (2026-11-11, pg_get_functiondef,
-- md5 of prosrc), and the body it makes.
CREATE TEMP TABLE brand_own_scheme_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_own_scheme_fns VALUES
  ('public.ingest_erp_sales_order(jsonb, uuid)',   'd8395b13f77fd3f4b3380b8ec0be9954', 'f928dad80f27bc09b268e2e34c51a708'),
  ('public.erp_sync_order_brand(jsonb, uuid)',     'd0cb32176b535e5fa6927ac0e224ec5a', 'c1c371268abf92b9cbe27824bc080057'),
  ('public.revenue_uncosted_products(uuid, date)', '89e2715b6230847840d30b8770ded97d', '1816132d91314150de8a8e57dc853ac2'),
  ('public.revenue_costing_gaps(date, date)',      '1348d459ad65cd4efe6a4fdc5ff356ee', '4e7d29d4f2e109d1156d1c136f6afcdc');

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_own_scheme_fns ORDER BY proc LOOP
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
  SELECT makes INTO STRICT v_makes FROM brand_own_scheme_fns WHERE proc = p_proc;
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

-- ── 1. A brand that follows its own scheme, and the ERP company it is ───────────────────────────────────────────────
ALTER TABLE public.comm_brands
  ADD COLUMN IF NOT EXISTS own_scheme     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS erp_company_id BIGINT;

COMMENT ON COLUMN public.comm_brands.own_scheme IS
  'The brand follows its own commission scheme (2026-11-11 — 2990s): a bill written under it is the sub-department''s sale like any other, paid at the brand''s own rate per rank (comm_rank_defs.brand_rates), outside every margin, and found none of the sub-department''s KPI items.';
COMMENT ON COLUMN public.comm_brands.erp_company_id IS
  'The Houzs ERP company whose every sales order is this brand''s (2026-11-11 — 2990''s Home is 2), whatever its products are branded. A NEW order of that company is kept only when somebody on the sub-department''s team sold it (erp_sync_outside_team).';

-- One brand a company, in a scheme.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_brand_erp_company
  ON public.comm_brands (scheme_id, erp_company_id) WHERE erp_company_id IS NOT NULL;

-- ── 2. A rank's rate for such a brand ────────────────────────────────────────────────────────────────────────────────
-- { "<comm_brands.id>": 0.08 } — keyed by the brand's id, because a brand's code can be edited on Rules.
CREATE OR REPLACE FUNCTION public.comm_brand_rates_valid(p_rates jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(jsonb_typeof(p_rates) = 'object', FALSE)
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_each(CASE WHEN jsonb_typeof(p_rates) = 'object' THEN p_rates ELSE '{}'::jsonb END) AS e(brand, rate)
        WHERE e.brand !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR jsonb_typeof(e.rate) <> 'number'
           OR CASE WHEN jsonb_typeof(e.rate) = 'number' THEN (e.rate #>> '{}')::numeric NOT BETWEEN 0 AND 1 ELSE TRUE END);
$fn$;

COMMENT ON FUNCTION public.comm_brand_rates_valid(jsonb) IS
  'comm_rank_defs.brand_rates is an object of brand id (a lower-case uuid) → a rate between 0 and 1 (2026-11-11). The column''s CHECK.';

-- Whoever may write a rank writes it through its CHECK.
REVOKE ALL ON FUNCTION public.comm_brand_rates_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comm_brand_rates_valid(jsonb) TO authenticated, service_role;

ALTER TABLE public.comm_rank_defs
  ADD COLUMN IF NOT EXISTS brand_rates JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_rank_defs_brand_rates_valid'
                    AND conrelid = 'public.comm_rank_defs'::regclass) THEN
    ALTER TABLE public.comm_rank_defs
      ADD CONSTRAINT comm_rank_defs_brand_rates_valid CHECK (public.comm_brand_rates_valid(brand_rates));
  END IF;
END $$;

COMMENT ON COLUMN public.comm_rank_defs.brand_rates IS
  'What the rank pays on a bill of a brand that follows its own scheme (comm_brands.own_scheme), by the brand''s id: { "<brand id>": 0.08 } (2026-11-11 — 2990s: Team Leader 8%, each rank a point under Fair''s). A rank with none for a brand pays the nearest rank below that has one (brandRateOf, lib/commission/brand-rates.ts). Edited on Rules › Ranks.';

-- The run reads those rates with the ladder (comm_ranks → comm_rank_defs), behind every gate a month's commission is
-- worked out under: Revenue · Edit joins the rank catalogue's readers, as it already reads the ladder itself.
INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('comm_rank_defs', ARRAY['revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('comm_rank_defs');

-- ── 3. 2990s, for Fair ───────────────────────────────────────────────────────────────────────────────────────────────
-- The ERP names its booths and its products "2990s Sofa" / "2990s Mattress": the brand's sub-brands, so a booth and a
-- line read as the brand's (erp_sync_brand_code) as a bill does. Made once: a brand already there under that code or
-- that company is left as it is, and so are its ranks' rates.
DO $seed$
DECLARE
  v_scheme uuid;
  v_brand  uuid;
BEGIN
  SELECT s.id INTO v_scheme
    FROM public.comm_schemes s
   WHERE s.sub_department_id = public.erp_sync_sub_department() AND s.is_active AND s.effective_to IS NULL
   ORDER BY s.effective_from DESC, s.id
   LIMIT 1;
  IF v_scheme IS NULL THEN
    RAISE NOTICE 'brand_own_scheme: the feed''s sub-department has no scheme in force — no brand made';
    RETURN;
  END IF;

  INSERT INTO public.comm_brands (scheme_id, code, name, sub_brands, note, own_scheme, erp_company_id)
  SELECT v_scheme, '2990S', '2990s', ARRAY['2990S SOFA', '2990S MATTRESS'],
         'Its own commission scheme (2026-11-11): its own rate per rank, no margin, its own KPI items. Every sales order of the ERP''s 2990''s Home (company 2) that somebody on the team sold.',
         TRUE, 2
   WHERE NOT EXISTS (SELECT 1 FROM public.comm_brands b
                      WHERE b.scheme_id = v_scheme AND (UPPER(BTRIM(b.code)) = '2990S' OR b.erp_company_id = 2))
  RETURNING id INTO v_brand;
  IF v_brand IS NULL THEN
    RETURN;  -- there already
  END IF;

  -- The user's list, on the rank each of those titles holds on Fair's ladder — a point under the rank's own rate:
  -- Team Leader 9% → 8%, Senior Team Assistant 8% → 7%, Team Assistant 7% → 6%, Senior Revenue Specialist 6% → 5%,
  -- Revenue Specialist 5% → 4%. Senior Team Leader and the Revenue Director's rung name none (nobody said): they
  -- pay the nearest rank below that does — 8%.
  UPDATE public.comm_rank_defs d
     SET brand_rates = d.brand_rates || jsonb_build_object(v_brand::text, v.brand_rate)
    FROM (VALUES (0.09, 0.08), (0.08, 0.07), (0.07, 0.06), (0.06, 0.05), (0.05, 0.04)) AS v(own_rate, brand_rate)
   WHERE d.scheme_id = v_scheme AND d.product_rate = v.own_rate AND d.group_incentive_amount = 0;
END $seed$;

-- ── 4. A bill's brand: the ERP company's first ───────────────────────────────────────────────────────────────────────
-- Production's body with one more answer ahead of the rest: the brand the order's ERP company is. The company is the
-- delivery's (`companyId`), else the stored bill's — the restamp (sales_order_restamp_brand) hands in no company.
CREATE OR REPLACE FUNCTION public.erp_sync_order_brand(p_order jsonb, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        -- (20261112003700) Another ERP company's order is that company's brand (2990's Home → 2990S), whatever its
        -- products are branded and whatever was picked for it.
        (SELECT b.code
           FROM comm_brands b
          WHERE b.is_active AND b.erp_company_id IS NOT NULL
            AND b.erp_company_id = COALESCE(
                  CASE WHEN p_order->>'companyId' ~ '^[0-9]{1,15}$' THEN (p_order->>'companyId')::BIGINT END,
                  (SELECT o.erp_company_id FROM sales_orders o WHERE o.id = p_order_id))
          ORDER BY b.created_at, b.id
          LIMIT 1),
        erp_sync_brand_code(p_order->>'brand'),
        erp_sync_brand_code(p_order->>'brandPick'),
        (SELECT p.brand_code FROM sales_order_brand_picks p WHERE p.order_id = p_order_id),
        CASE WHEN LOWER(COALESCE(p_order->'fair'->>'status', '')) <> 'cancelled'
             THEN erp_sync_brand_code(p_order->'fair'->>'brand') END);
$function$;

COMMENT ON FUNCTION public.erp_sync_order_brand(jsonb, uuid) IS
  'A bill''s brand from everything but its lines: the brand its ERP company is (comm_brands.erp_company_id — 2990''s Home is 2990S, 2026-11-11), else the ERP''s Branding when it names a brand, else the brand the salesperson picked in the ERP (brandPick, asked when the products name none), else the brand picked on the portal for this bill (sales_order_brand_picks), else the brand of the fair booth it was written at (not a cancelled one). NULL when none of them names a brand the portal knows — then the lines decide.';

-- ── 5. Is this another company's order that nobody on the team sold ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_sync_outside_team(p_sub_department_id uuid, p_order jsonb, p_sale_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $fn$
DECLARE
    v_company  BIGINT := CASE WHEN p_order->>'companyId' ~ '^[0-9]{1,15}$' THEN (p_order->>'companyId')::BIGINT END;
    v_brand    TEXT;
    v_date     DATE := COALESCE(p_sale_date, (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE);
    v_month    DATE;
    v_sp_id    TEXT := NULLIF(BTRIM(p_order->>'salespersonId'), '');
    v_name     TEXT := NULLIF(BTRIM(p_order->>'salespersonName'), '');
    v_staff    UUID;
    v_on_team  BOOLEAN := FALSE;
    v_team     TEXT;
BEGIN
    IF v_company IS NULL THEN
        RETURN NULL;
    END IF;
    -- The brand of this sub-department that the company's orders are. None: the feed's own company, or one no brand
    -- stands for — kept, as every order always was.
    SELECT b.name INTO v_brand
      FROM comm_brands b
      JOIN comm_schemes s ON s.id = b.scheme_id
     WHERE b.is_active AND b.erp_company_id = v_company
       AND s.sub_department_id = p_sub_department_id AND s.is_active
     ORDER BY s.effective_from DESC, b.created_at, b.id
     LIMIT 1;
    IF v_brand IS NULL THEN
        RETURN NULL;
    END IF;

    -- Whose the receiver would make it: the ERP's salesperson id as HR matched it, else the name.
    IF v_sp_id IS NOT NULL THEN
        SELECT a.staff_id INTO v_staff FROM comm_agent_aliases a WHERE a.erp_salesperson_id = v_sp_id LIMIT 1;
    END IF;
    IF v_staff IS NULL AND v_name IS NOT NULL THEN
        SELECT a.staff_id INTO v_staff
          FROM comm_agent_aliases a
         WHERE a.agent_key = UPPER(REGEXP_REPLACE(v_name, '\s+', ' ', 'g'))
         LIMIT 1;
    END IF;

    IF v_staff IS NOT NULL THEN
        -- On the team in the month of the sale — the month a run reads the team for: a place on one of the
        -- sub-department's schemes in that month, or one of its directors — and not gone before the sale.
        v_month := DATE_TRUNC('month', v_date)::DATE;
        v_on_team := (EXISTS (SELECT 1
                                FROM comm_hierarchy h
                                JOIN comm_schemes s ON s.id = h.scheme_id
                               WHERE h.staff_id = v_staff AND s.sub_department_id = p_sub_department_id
                                 AND h.effective_from < (v_month + INTERVAL '1 month')::DATE
                                 AND (h.effective_to IS NULL OR h.effective_to >= v_month))
                      OR EXISTS (SELECT 1 FROM comm_sub_department_directors d
                                  WHERE d.sub_department_id = p_sub_department_id AND d.staff_id = v_staff))
                 AND NOT EXISTS (SELECT 1 FROM hr_staff_costs st
                                  WHERE st.id = v_staff AND st.resignation_date IS NOT NULL AND st.resignation_date < v_date);
    END IF;
    IF v_on_team THEN
        RETURN NULL;
    END IF;

    SELECT d.name INTO v_team FROM comm_sub_departments d WHERE d.id = p_sub_department_id;
    RETURN JSONB_BUILD_OBJECT(
        'brand', v_brand, 'companyId', v_company, 'salesperson', v_name, 'matched', v_staff IS NOT NULL,
        'message', v_brand || ' order — '
                   || CASE WHEN v_name IS NULL THEN 'it names no salesperson'
                           ELSE v_name || ' is not on the ' || COALESCE(v_team, 'sub-department''s') || ' team' END);
END
$fn$;

COMMENT ON FUNCTION public.erp_sync_outside_team(uuid, jsonb, date) IS
  'Another ERP company''s order (2026-11-11 — 2990''s Home): NULL when the delivery is the sub-department''s to keep — its company is no brand''s (comm_brands.erp_company_id), or its salesperson is on the team in the month of the sale (matched in comm_agent_aliases as the receiver matches; a place on one of the sub-department''s schemes in that month, or a director of it; not resigned before the sale). Else brand / salesperson / matched / message — the receiver answers skipped and writes nothing. Read by ingest_erp_sales_order, for a document it does not hold yet.';

-- The receiver runs as the service role, and as whoever replays a held delivery — as the receiver's other helpers.
REVOKE ALL ON FUNCTION public.erp_sync_outside_team(uuid, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_outside_team(uuid, jsonb, date) TO authenticated, service_role;

-- ── 6. The receiver keeps only the team's ────────────────────────────────────────────────────────────────────────────
-- Each old text starts at its first character: a leading run of whitespace would take the line break before it.
SELECT pg_temp.remake('public.ingest_erp_sales_order(jsonb, uuid)', ARRAY[
    -- (a) One more declaration.
    $o$v_old           JSONB;
    v_is_old        BOOLEAN := FALSE;
BEGIN$o$,
    $n$v_old           JSONB;
    v_is_old        BOOLEAN := FALSE;
    -- (20261112003700) Another ERP company's order nobody on the team sold (erp_sync_outside_team).
    v_outside       JSONB;
BEGIN$n$,

    -- (b) Asked of a document the portal does not hold yet, before its fair is kept, a month is made for it or
    --     anything else is written.
    $o$-- (20260927010000) The fair the ERP names. Since 2026-09-13 the ERP makes$o$,
    $n$-- ── Another ERP company's order (20261112003700) ───────────────────────
    -- The user, 2026-11-11, of 2990's Home (ERP company 2 — the brand 2990s): "只要是 … 2990s 的 sales order，whereby
    -- 他们是 under revenue team 的 member，这笔 sales order 就要出现在他们自己的记录里。如果不是 revenue team 的人，就不
    -- 需要 export 过来" — the rest "做的是 2990s 自己公司的 sales team". A NEW document of a company a brand stands for
    -- (comm_brands.erp_company_id) is kept only when its salesperson is on the team in the month of the sale; anybody
    -- else's is a successful delivery the portal declines to keep, as a draft is: 200 skipped, nothing written — no
    -- fair, no month, no bill. A bill already here is updated as any bill is.
    IF NOT v_found THEN
        v_outside := erp_sync_outside_team(v_sub_id, p_order, COALESCE(v_sale_day, v_order_date));
        IF v_outside IS NOT NULL THEN
            RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_period, 'skipped',
                                v_outside->>'message', '{}', v_snapshot, NULL, p_replay_of), v_before);
        END IF;
    END IF;

    -- (20260927010000) The fair the ERP names. Since 2026-09-13 the ERP makes$n$
]);

-- ── 6b. No cost is waited for ────────────────────────────────────────────────────────────────────────────────────────
-- A bill of a brand on its own scheme stands in no margin, so nobody has to cost its lines: they leave the two
-- lists of products a month still has no cost for. One condition added to each of production's bodies.
SELECT pg_temp.remake('public.revenue_uncosted_products(uuid, date)', ARRAY[
    $o$WHERE sl.cost_source IS NULL$o$,
    $n$WHERE sl.cost_source IS NULL
           -- (20261112003700) A bill of a brand on its own scheme (2990s) stands in no margin: it waits for no cost.
           AND NOT EXISTS (SELECT 1 FROM comm_brands ob
                            WHERE ob.scheme_id = sc.id AND ob.own_scheme AND ob.is_active
                              AND UPPER(BTRIM(ob.code)) = UPPER(BTRIM(o.brand_code)))$n$
]);

SELECT pg_temp.remake('public.revenue_costing_gaps(date, date)', ARRAY[
    $o$AND l.cost_source IS NULL$o$,
    $n$AND l.cost_source IS NULL
           -- (20261112003700) A bill of a brand on its own scheme (2990s) stands in no margin: it waits for no cost.
           AND NOT EXISTS (SELECT 1 FROM comm_brands ob
                            WHERE ob.own_scheme AND ob.is_active
                              AND UPPER(BTRIM(ob.code)) = UPPER(BTRIM(o.brand_code)))$n$
]);

-- What this migration made is what it was written to make.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_own_scheme_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% ended as md5 %, not the body this migration makes', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 7. The bills already here ────────────────────────────────────────────────────────────────────────────────────────
-- Since 2026-11-10 every order of such a company landed in the sub-department's months. Those nobody on the team
-- sold go — never one in a month a run has paid, nor one a close released — with their lines (the bill's own
-- cascade) and their rows of the ERP audit trail (erp_sync_known_state reads the trail by document number: left
-- behind, a bill that came in later for a team member would be compared with a bill the portal no longer holds);
-- the team's own take the brand.
DO $fix$
DECLARE
  v_gone    integer := 0;
  v_trail   integer := 0;
  v_stamped integer := 0;
  v_row     record;
BEGIN
  CREATE TEMP TABLE brand_own_scheme_outside ON COMMIT DROP AS
  SELECT o.id, o.batch_id, ib.sub_department_id, o.order_no, o.agent_key, o.event_date
    FROM public.sales_orders o
    JOIN public.sales_import_batches ib ON ib.id = o.batch_id
   WHERE o.source = 'erp_sync' AND o.erp_company_id IS NOT NULL AND o.staff_id IS NULL
     AND NOT public.commission_order_period_locked(ib.sub_department_id, o.period_month)
     AND NOT EXISTS (SELECT 1 FROM public.comm_order_releases r
                      WHERE r.order_no = o.order_no AND r.sub_department_id = ib.sub_department_id)
     AND public.erp_sync_outside_team(ib.sub_department_id, jsonb_build_object(
           'companyId', o.erp_company_id, 'salespersonId', o.erp_salesperson_id, 'salespersonName', o.agent_name),
           o.order_date) IS NOT NULL;

  DELETE FROM public.sales_order_erp_changes c
   USING brand_own_scheme_outside t
   WHERE c.sub_department_id = t.sub_department_id AND c.order_no = t.order_no;
  GET DIAGNOSTICS v_trail = ROW_COUNT;

  DELETE FROM public.sales_orders o USING brand_own_scheme_outside t WHERE o.id = t.id;
  GET DIAGNOSTICS v_gone = ROW_COUNT;

  -- The day's running order of whoever is left under each name, and each month's counters — as the receiver does
  -- when it removes a bill.
  FOR v_row IN SELECT DISTINCT t.agent_key, t.event_date FROM brand_own_scheme_outside t LOOP
    PERFORM public.erp_sync_resequence_day(v_row.agent_key, v_row.event_date);
  END LOOP;
  FOR v_row IN SELECT DISTINCT t.batch_id FROM brand_own_scheme_outside t LOOP
    PERFORM public.erp_sync_refresh_batch(v_row.batch_id);
  END LOOP;

  -- The team's own: the bill's brand is its company's; a line keeps the brand its own product names, else the bill's
  -- (the receiver's rule).
  CREATE TEMP TABLE brand_own_scheme_stamped ON COMMIT DROP AS
  SELECT o.id, b.code
    FROM public.sales_orders o
    JOIN public.sales_import_batches ib ON ib.id = o.batch_id
    JOIN public.comm_schemes s ON s.sub_department_id = ib.sub_department_id AND s.is_active
    JOIN public.comm_brands b ON b.scheme_id = s.id AND b.is_active AND b.erp_company_id = o.erp_company_id
   WHERE o.source = 'erp_sync'
     AND NOT public.commission_order_period_locked(ib.sub_department_id, o.period_month);

  UPDATE public.sales_orders o
     SET brand_code = t.code
    FROM brand_own_scheme_stamped t
   WHERE o.id = t.id AND o.brand_code IS DISTINCT FROM t.code;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;

  UPDATE public.sales_order_lines l
     SET brand_code = COALESCE(public.erp_sync_brand_code(l.raw->>'brand'), t.code)
    FROM brand_own_scheme_stamped t
   WHERE l.order_id = t.id
     AND l.brand_code IS DISTINCT FROM COALESCE(public.erp_sync_brand_code(l.raw->>'brand'), t.code);

  RAISE NOTICE 'brand_own_scheme: % bills nobody on the team sold removed (% rows of their ERP trail), % bills stamped with their brand',
    v_gone, v_trail, v_stamped;
END $fix$;

-- A booth of such a brand reads as the brand's (the ERP names it "2990s Sofa"): the next Sales Attending delivery
-- would say so; the booths already here say so now — a bill written at one names the same booth.
UPDATE public.erp_booths bo
   SET brand_code = public.erp_sync_brand_code(bo.brand)
 WHERE bo.brand IS NOT NULL
   AND bo.company_id IN (SELECT b.erp_company_id FROM public.comm_brands b WHERE b.erp_company_id IS NOT NULL AND b.is_active)
   AND public.erp_sync_brand_code(bo.brand) IS NOT NULL
   AND bo.brand_code IS DISTINCT FROM public.erp_sync_brand_code(bo.brand);

COMMIT;
