-- ════════════════════════════════════════════════════════════════════════════
-- 20261127140500 — Fair's margin ladder for Akemi and Ergotex, the month the penalty starts from, and a bill's
-- commission ratio set by a Revenue Director (2026-11-27)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. The user, with a hand-drawn ladder (33 ↕ 30 → 75 · 30 ↓ 27 → 50 · 27 ↓ 25 → 25 · 25 ↓ → 0): "sub department for
-- fair margin penalty and ladder for akemi and ergotex" — "33% 的 margin 在 calculator 那边属于 standard margin。大概 30% 到
-- 33%（即 32.99% 这个区间），只能拿 75% 的 commission：27% 到 29.99%：50%、25% 到 26.99%：25%、24.99% 以下：0%". Asked the
-- rest the same day: Dunlopillo and Zanotti KEEP their own ladder (≤ 27% × 0.5, ≤ 25% × 0.25, ≤ 24% × 0); the penalty
-- cuts DECEMBER's bills on, never November's ("从十二月开始"); and, on a bill's sheet in the Revenue app: "如果是 for revenue
-- director，他有一个权限就是点三个点后可以调动 commission：1. 他可以选 ratio 自己填（25%、50%、75% 都可以调）2. … below margin
-- 的，他觉得可以调的就改成 [standard] margin，不用扣 50% … 同理，如果觉得说这个不应该是属于 normal commission，他可以调成 50%"
-- — the salesperson is told ("要通知").
--
-- 1. comm_schemes.margin_penalty_from — the first month whose bills the penalty cuts (NULL: every month while it is on).
--    The switch itself is turned on for Fair by 20261127140600, once the app that reads this column is live.
-- 2. Fair's ladder for Akemi and Ergotex, read "at or below" as every penalty band is (engine.ts penaltyBandFor): the user's
--    own upper bounds — ≤ 32.99% × 0.75 (Tier 1), ≤ 29.99% × 0.5 (Tier 2), ≤ 26.99% × 0.25 (Tier 3), ≤ 24.99% × 0 (Tier 4,
--    new). Their "Low margin 30%" reference row goes — 30% is inside Tier 1 now. Standard (33%) and the incentives stay.
--    Dunlopillo's and Zanotti's rows are not touched.
-- 3. sales_order_comm_ratios — one row a bill: the ratio a Revenue Director set on it, who, when, why. The engine reads it
--    in its margin band's place (`SalesOrder.commRatio`): the bill's commission, its part of the override base and the sales
--    it counts — up or down, whatever the switch says, on a bill with no margin yet too. RLS on; read by whoever reads a
--    month's bills (Revenue · View …, as the half comm list); written ONLY by member_comm_ratio_set (SECURITY DEFINER).
-- 4. The permission function `comm_ratio` ("Commission ratio", People — beside Revenue app and CRM): View opens the key;
--    Edit sets and clears a bill's ratio. Every reach "all"; the bills a holder may touch are those of the sub-departments
--    they reach on Comm Cal (`my_sub_departments('comm_cal')` — a director's, what they direct; a company-level account's,
--    every one). Held by the Principal login (role default), the Revenue Director and Ultimate full access templates. Its
--    tab `rev.comm_ratio` (Insight · Commission ratio) goes into the registry by name.
-- 5. member_comm_ratio_context(order) — what the sheet draws; member_comm_ratio_set(order, ratio | NULL, note) — the write,
--    refused in words: not one's own bill, not a Revenue Director's own bill, not a bill that does not count, not a month
--    whose run has paid (23RUN), not a bill a standing close gave (`order_ids`), never out of reach. The salesperson (every
--    holder) is told: app_notifications ref_kind 'comm_ratio'.
-- 6. member_order_facts_with_old_bills (production's body b0840628…, two statements and two joins swapped): a part counts
--    at the director's ratio before its band; a band cuts only from margin_penalty_from on.
-- 7. member_order_book_for_staff (aecfce0e…) and member_principal_department_order_book (61a66ec7…): each bill names its
--    ratio — `ratio` {pct, by, at, note}.
--
-- Rollback (in words — the database tool refuses a migration that spells the statement): take the two functions and the
-- refusal helper away, take the four swaps back out of the three readers (their bodies above), remove the table (every
-- bill is paid on its margin again on its next computation) with its rows in permission_table_reads and audit_tables, the
-- function's rows in permission_functions / _defs / _cell_keys / _key_actions / role_default_permissions /
-- permission_template_grants / permission_template_tabs / permission_tab_cells, 'comm_ratio' from current_permissions()'s
-- member list, the column; put Akemi's and Ergotex's bands back as 20260831010000 left them.
--
-- PGlite: tests/member-sql/validate-comm-ratio.mjs (production's bodies, the migration verbatim, twice).
-- ════════════════════════════════════════════════════════════════════════════

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
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.widen_check(p_table regclass, p_name text, p_column text, p_add text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def  text;
  v_vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '% has no constraint %', p_table, p_name;
  END IF;
  v_vals := ARRAY(SELECT DISTINCT btrim(v, '"') FROM regexp_matches(v_def, '''([^'']+)''', 'g') m,
                         unnest(CASE WHEN m[1] LIKE '{%}' THEN string_to_array(btrim(m[1], '{}'), ',') ELSE ARRAY[m[1]] END) v);
  IF v_vals @> p_add THEN
    RETURN;
  END IF;
  v_vals := ARRAY(SELECT DISTINCT x FROM unnest(v_vals || p_add) x ORDER BY x);
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I = ANY (ARRAY[%s]))', p_table, p_name, p_column,
                 (SELECT string_agg(quote_literal(x), ', ' ORDER BY x) FROM unnest(v_vals) x));
END
$fn$;

-- The three readers are swapped from production's bodies: refused when one changed since (a re-run finds its own marker).
DO $$
DECLARE
  v_sig text;
  v_md5 text;
  v_src text;
BEGIN
  FOR v_sig, v_md5 IN VALUES
    ('public.member_order_facts_with_old_bills(uuid,date,date)', 'b0840628de75ec6383fcaf06911e2247'),
    ('public.member_order_book_for_staff(uuid,uuid,date,date)', 'aecfce0eb43330edbfe21719b67bf982'),
    ('public.member_principal_department_order_book(uuid,text,text)', '61a66ec7ccf065ace8e56aa84c309d35')
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_sig;
    END IF;
    SELECT replace(prosrc, E'\r', '') INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_sig);
    IF strpos(v_src, '(20261127140500)') = 0 AND md5(v_src) IS DISTINCT FROM v_md5 THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from (%)', v_sig, md5(v_src), v_md5;
    END IF;
  END LOOP;
END $$;

-- ─── 1. The month the penalty starts from ────────────────────────────────────

ALTER TABLE public.comm_schemes ADD COLUMN IF NOT EXISTS margin_penalty_from date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_schemes_margin_penalty_from_first'
                    AND conrelid = 'public.comm_schemes'::regclass) THEN
    ALTER TABLE public.comm_schemes ADD CONSTRAINT comm_schemes_margin_penalty_from_first
      CHECK (margin_penalty_from IS NULL OR margin_penalty_from = date_trunc('month', margin_penalty_from)::date);
  END IF;
END $$;

COMMENT ON COLUMN public.comm_schemes.margin_penalty_from IS
  'The first month (its 1st) whose bills the below-margin penalty cuts (2026-11-27 — Fair''s from December 2026: "从十二月开始"). A bill of an earlier month is cut by no band, whichever month pays it. NULL = every month while enable_margin_penalty is on.';

-- ─── 2. Fair's ladder for Akemi and Ergotex ──────────────────────────────────

DO $$
DECLARE
  v_scheme uuid;
  v_brand  uuid;
  v_code   text;
  v_got    text;
BEGIN
  SELECT s.id INTO v_scheme
    FROM public.comm_schemes s JOIN public.comm_sub_departments d ON d.id = s.sub_department_id
   WHERE (upper(btrim(coalesce(d.code, ''))) = 'FAIR' OR d.name = 'Fair') AND s.is_active AND s.effective_to IS NULL
   ORDER BY s.effective_from DESC LIMIT 1;
  IF v_scheme IS NULL THEN
    RAISE EXCEPTION 'Fair has no active commission scheme';
  END IF;

  FOREACH v_code IN ARRAY ARRAY['AKEMI', 'ERGOTEX'] LOOP
    SELECT b.id INTO v_brand FROM public.comm_brands b WHERE b.scheme_id = v_scheme AND upper(btrim(b.code)) = v_code;
    IF v_brand IS NULL THEN
      RAISE EXCEPTION 'Fair has no brand %', v_code;
    END IF;
    -- 30% sits inside Tier 1 now: the reference row that named it goes.
    DELETE FROM public.comm_margin_bands WHERE brand_id = v_brand AND band_key = 'low' AND kind = 'reference';
    INSERT INTO public.comm_margin_bands (scheme_id, brand_id, band_key, label, kind, margin_pct, commission_multiplier,
                                          monthly_incentive, sort_order)
    VALUES (v_scheme, v_brand, 'below_tier_1', 'Below margin Tier 1', 'penalty', 0.3299, 0.75, 0, 50),
           (v_scheme, v_brand, 'below_tier_2', 'Below margin Tier 2', 'penalty', 0.2999, 0.50, 0, 60),
           (v_scheme, v_brand, 'below_tier_3', 'Below margin Tier 3', 'penalty', 0.2699, 0.25, 0, 70),
           (v_scheme, v_brand, 'below_tier_4', 'Below margin Tier 4', 'penalty', 0.2499, 0, 0, 80)
    ON CONFLICT (brand_id, band_key) DO UPDATE
      SET label = EXCLUDED.label, kind = EXCLUDED.kind, margin_pct = EXCLUDED.margin_pct,
          commission_multiplier = EXCLUDED.commission_multiplier, monthly_incentive = 0, sort_order = EXCLUDED.sort_order;

    -- Exactly the user's ladder below Standard, nothing else cutting.
    SELECT string_agg(to_char(margin_pct * 100, 'FM990.00') || 'x' || to_char(commission_multiplier, 'FM0.00'), ' ' ORDER BY margin_pct DESC)
      INTO v_got FROM public.comm_margin_bands WHERE brand_id = v_brand AND kind = 'penalty';
    IF v_got IS DISTINCT FROM '32.99x0.75 29.99x0.50 26.99x0.25 24.99x0.00' THEN
      RAISE EXCEPTION '%''s penalty bands are %, not the ladder this migration sets', v_code, v_got;
    END IF;
  END LOOP;
END $$;

-- ─── 3. The ratio a Revenue Director set on a bill ───────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_order_comm_ratios (
    order_id    uuid          PRIMARY KEY REFERENCES public.sales_orders (id) ON DELETE CASCADE,
    ratio       numeric(5,4)  NOT NULL,
    note        text,
    set_by      uuid          REFERENCES public.users (id) ON DELETE SET NULL,
    set_by_name text,
    set_at      timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT sales_order_comm_ratios_ratio CHECK (ratio >= 0 AND ratio <= 1),
    CONSTRAINT sales_order_comm_ratios_note CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE public.sales_order_comm_ratios IS
    'A bill''s commission ratio, set by a Revenue Director in the Revenue app (a bill''s ⋯ › Adjust commission, 2026-11-27): the engine reads it in the bill''s margin band''s place — its commission, its part of the override base and the sales it counts. Written only by member_comm_ratio_set.';
COMMENT ON COLUMN public.sales_order_comm_ratios.ratio IS '0–1: 0.75 pays three quarters of the bill''s commission and counts three quarters of its sales.';
COMMENT ON COLUMN public.sales_order_comm_ratios.note IS 'Why, in the words of whoever set it — told to the salesperson, and Comm Cal''s Status chip''s tooltip.';

ALTER TABLE public.sales_order_comm_ratios ENABLE ROW LEVEL SECURITY;

-- Which rows: whoever reads a month's bills on Comm Cal reads which carry a ratio. Nobody writes through a policy.
DROP POLICY IF EXISTS sales_order_comm_ratios_read ON public.sales_order_comm_ratios;
CREATE POLICY sales_order_comm_ratios_read ON public.sales_order_comm_ratios
    FOR SELECT TO authenticated
    USING ((SELECT public.has_any_action(ARRAY['revenue.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage'])));

REVOKE ALL ON public.sales_order_comm_ratios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sales_order_comm_ratios TO authenticated;
GRANT ALL ON public.sales_order_comm_ratios TO service_role;

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('sales_order_comm_ratios', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('sales_order_comm_ratios');

SELECT public.audit_register('sales_order_comm_ratios', 'Bills'' commission ratios', 'Revenue', '{revenue}', 'all',
    p_keys => '{order_id}', p_labels => '{ratio,note}');

-- What a paid month paid, and what a close gave, stand — whoever writes, however.
CREATE OR REPLACE FUNCTION public.sales_order_comm_ratios_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_sub      uuid;
    v_month    date;
BEGIN
    v_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
    IF TG_OP = 'UPDATE' AND NEW.order_id <> OLD.order_id THEN
        RAISE EXCEPTION 'A ratio belongs to one bill; take it off and set a new one';
    END IF;

    SELECT b.sub_department_id, o.period_month INTO v_sub, v_month
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = v_order_id;

    IF FOUND AND commission_order_period_locked(v_sub, v_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing what its bills pay.',
            to_char(v_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;
    IF FOUND AND EXISTS (SELECT 1 FROM comm_salesperson_closes x WHERE x.reopened_at IS NULL AND v_order_id = ANY (x.order_ids)) THEN
        RAISE EXCEPTION 'A close on Comm Cal gave this bill''s commission. Reopen it before changing what the bill pays.'
            USING ERRCODE = '23CLS';
    END IF;

    -- NOT FOUND on a DELETE: the bill itself went first (ON DELETE CASCADE).
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_comm_ratios_guard ON public.sales_order_comm_ratios;
CREATE TRIGGER sales_order_comm_ratios_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_comm_ratios
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_comm_ratios_guard();

-- ─── 4. The permission function, its key, who holds it ───────────────────────

INSERT INTO public.permission_functions (key, label, section, actions, scopes, description, sort_order) VALUES
  ('comm_ratio', 'Commission ratio', 'People', ARRAY['view', 'edit'], ARRAY['all'],
   'A bill''s commission ratio in the Revenue app (a bill''s ⋯ › Adjust commission): Edit sets it — 100%, 75%, 50%, 25%, 0% or any other — in the place of what its margin would cut it to, and takes it off again, on the bills of the sub-departments one reaches on Comm Cal.',
   131)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order) VALUES
  ('comm_ratio', 'Commission ratio', 'People', 'none',
   'Setting a bill''s commission ratio in the Revenue app. Opened by Commission ratio · View.', 131)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate) VALUES
  ('comm_ratio', 'view', 'comm_ratio', 'all', NULL)
ON CONFLICT (function_key, action, legacy_key) DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action) VALUES
  ('comm_ratio', 'comm_ratio', 'view'), ('comm_ratio', 'comm_ratio', 'edit')
ON CONFLICT (legacy_key, function_key, action) DO NOTHING;

INSERT INTO public.role_default_permissions (role, permission_key) VALUES ('principal', 'comm_ratio')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.permission_template_grants (template_id, function_key, action, scope)
SELECT t.id, 'comm_ratio', a, 'all'
  FROM public.permission_templates t, unnest(ARRAY['view', 'edit']) a
 WHERE t.key IN ('revenue_director', 'ultimate')
ON CONFLICT (template_id, function_key, action) DO NOTHING;

-- A template whose ticks are stored keeps a new tab open only when it is ticked.
INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
SELECT t.id, 'rev.comm_ratio', a
  FROM public.permission_templates t, unnest(ARRAY['view', 'edit']) a
 WHERE t.key IN ('revenue_director', 'ultimate')
   AND EXISTS (SELECT 1 FROM public.permission_template_tabs x WHERE x.template_id = t.id)
ON CONFLICT (template_id, tab_id, action) DO NOTHING;

UPDATE public.permission_templates SET version = version + 1, updated_at = now()
 WHERE key IN ('revenue_director', 'ultimate');

SELECT pg_temp.swap_check('public.current_permissions()'::regprocedure,
  $old$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests','rev_training'])$old$,
  $new$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests','rev_training','comm_ratio'])$new$);

-- The app's pages are not portal pages (permission_page_tabs holds none of /member): only the box's cells go in.
INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('rev.comm_ratio', 'view', 'comm_ratio.view'),
  ('rev.comm_ratio', 'edit', 'comm_ratio.edit')
ON CONFLICT DO NOTHING;

-- ─── 5. The salesperson is told ──────────────────────────────────────────────

-- comm_ratio: a Revenue Director set, changed or took off a bill's ratio — to its holders, in the Revenue app's bell.
SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_ref_kind_check', 'ref_kind', ARRAY['comm_ratio']);

-- ─── 6. The sheet and the write ──────────────────────────────────────────────

-- Why the caller may not set a ratio on this bill now — NULL when they may. Asked by both functions below; nobody else.
CREATE OR REPLACE FUNCTION public.comm_ratio_refusal(p_order uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  record;
  v_me     uuid;
  v_names  text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['comm_ratio.edit']) THEN
    RETURN 'Adjusting a bill''s commission is not open to your account.';
  END IF;
  SELECT o.id, o.order_no, o.period_month, o.cancelled, b.sub_department_id AS sub, b.status
    INTO v_order
    FROM public.sales_orders o JOIN public.sales_import_batches b ON b.id = o.batch_id
   WHERE o.id = p_order;
  IF NOT FOUND OR v_order.status IS DISTINCT FROM 'committed' THEN
    RETURN 'That bill is not there any more.';
  END IF;
  IF NOT (v_order.sub = ANY (public.my_sub_departments('comm_cal'))) THEN
    RETURN format('%s is in a sub-department you do not look after.', v_order.order_no);
  END IF;
  IF v_order.cancelled THEN
    RETURN format('%s does not count — it has no commission to adjust.', v_order.order_no);
  END IF;
  -- Never one's own bill: the ratio is somebody else's word on it.
  SELECT s.id INTO v_me FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() ORDER BY (s.status = 'active') DESC LIMIT 1;
  IF v_me IS NOT NULL AND EXISTS (SELECT 1 FROM public.sales_order_parts(ARRAY[p_order]) p WHERE p.staff_id = v_me) THEN
    RETURN 'You cannot adjust the commission of your own bill.';
  END IF;
  -- A Revenue Director's own bills are paid their rung's rate and never cut (engine.ts).
  SELECT string_agg(DISTINCT s.employee_name, ' · ') INTO v_names
    FROM public.sales_order_parts(ARRAY[p_order]) p JOIN public.hr_staff_costs s ON s.id = p.staff_id
    JOIN public.titles t ON t.id = s.title_id
   WHERE t.is_department_head;
  IF v_names IS NOT NULL THEN
    RETURN format('%s is %s''s own bill — a Revenue Director''s own bills are never cut.', v_order.order_no, v_names);
  END IF;
  IF public.commission_order_period_locked(v_order.sub, v_order.period_month) THEN
    RETURN format('The run for %s has paid — what its bills pay cannot change.', to_char(v_order.period_month, 'FMMonth YYYY'));
  END IF;
  SELECT string_agg(DISTINCT s.employee_name || '''s ' || to_char(x.period_month, 'FMMonth YYYY'), ', ') INTO v_names
    FROM public.comm_salesperson_closes x JOIN public.hr_staff_costs s ON s.id = x.staff_id
   WHERE x.reopened_at IS NULL AND p_order = ANY (x.order_ids);
  IF v_names IS NOT NULL THEN
    RETURN format('%s is closed on Comm Cal and gave this bill''s commission — HR reopens it before the ratio can change.', v_names);
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.comm_ratio_refusal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comm_ratio_refusal(uuid) TO service_role;

-- What the sheet draws: the bill, its margin and what its ladder alone pays it, the ratio set on it, and why it cannot be
-- changed now (NULL when it can).
CREATE OR REPLACE FUNCTION public.member_comm_ratio_context(p_order uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   record;
  v_scheme  record;
  v_margin  numeric;
  v_brand   text;
  v_label   text;
  v_mult    numeric;
  v_ratio   record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['comm_ratio.view', 'comm_ratio.edit']) THEN
    RAISE EXCEPTION 'Adjusting a bill''s commission is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT o.id, o.order_no, o.period_month, o.staff_id, b.sub_department_id AS sub
    INTO v_order
    FROM public.sales_orders o JOIN public.sales_import_batches b ON b.id = o.batch_id
   WHERE o.id = p_order AND b.status = 'committed';
  IF NOT FOUND OR NOT (v_order.sub = ANY (public.my_sub_departments('comm_cal'))) THEN
    RAISE EXCEPTION 'That bill is not there.' USING ERRCODE = '22023';
  END IF;
  SELECT c.id, c.enable_margin_penalty, c.margin_penalty_from INTO v_scheme
    FROM public.comm_schemes c WHERE c.sub_department_id = v_order.sub AND c.is_active AND c.effective_to IS NULL
   ORDER BY c.effective_from DESC LIMIT 1;

  -- The bill's margin as the Revenue app reads it (the team's cost), and the band its ladder alone puts it in.
  IF v_scheme.id IS NOT NULL THEN
    SELECT min(f.margin_pct), min(f.brand) INTO v_margin, v_brand
      FROM public.member_order_facts_with_old_bills(v_scheme.id, v_order.period_month, (v_order.period_month + interval '1 month')::date) f
     WHERE f.order_id = p_order;
  END IF;
  IF v_margin IS NOT NULL AND v_scheme.enable_margin_penalty
     AND (v_scheme.margin_penalty_from IS NULL OR v_order.period_month >= v_scheme.margin_penalty_from) THEN
    SELECT b.label, b.commission_multiplier INTO v_label, v_mult
      FROM public.comm_margin_bands b JOIN public.comm_brands br ON br.id = b.brand_id
     WHERE b.scheme_id = v_scheme.id AND b.kind = 'penalty' AND upper(btrim(br.code)) = upper(btrim(v_brand))
       AND v_margin <= b.margin_pct + 1e-9
     ORDER BY b.margin_pct, b.sort_order, b.id LIMIT 1;
  END IF;
  SELECT r.ratio, r.set_by_name, r.set_at, r.note INTO v_ratio FROM public.sales_order_comm_ratios r WHERE r.order_id = p_order;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'orderNo', v_order.order_no,
    'month', to_char(v_order.period_month, 'YYYY-MM'),
    'margin', CASE WHEN v_margin IS NULL THEN NULL ELSE round(v_margin * 100, 2) END,
    'ladder', jsonb_build_object('label', v_label, 'multiplier', coalesce(v_mult, 1)),
    'ratio', CASE WHEN v_ratio.ratio IS NULL THEN NULL
      ELSE jsonb_build_object('pct', v_ratio.ratio, 'by', v_ratio.set_by_name, 'at', v_ratio.set_at, 'note', v_ratio.note) END,
    'refusal', public.comm_ratio_refusal(p_order));
END
$$;

-- Set a bill's ratio (0–1), or take it off (NULL): the margin decides again. Every holder of the bill is told.
CREATE OR REPLACE FUNCTION public.member_comm_ratio_set(p_order uuid, p_ratio numeric, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refusal text := public.comm_ratio_refusal(p_order);
  v_ratio   numeric := round(p_ratio, 4);
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_old     record;
  v_no      text;
  v_by      text;
  v_pct     text;
  v_users   uuid[];
  v_changed boolean := false;
BEGIN
  IF v_refusal IS NOT NULL THEN
    RAISE EXCEPTION '%', v_refusal USING ERRCODE = '42501';
  END IF;
  IF v_ratio IS NOT NULL AND (v_ratio < 0 OR v_ratio > 1) THEN
    RAISE EXCEPTION 'A ratio is 0%% to 100%% of the commission.' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Keep why to 500 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT o.order_no INTO v_no FROM public.sales_orders o WHERE o.id = p_order;
  SELECT r.ratio, r.note INTO v_old FROM public.sales_order_comm_ratios r WHERE r.order_id = p_order FOR UPDATE;
  v_by := coalesce(
    (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() ORDER BY (s.status = 'active') DESC LIMIT 1),
    (SELECT nullif(btrim(u.name), '') FROM public.users u WHERE u.id = auth.uid()),
    'A director');

  IF v_ratio IS NULL THEN
    IF v_old.ratio IS NOT NULL THEN
      DELETE FROM public.sales_order_comm_ratios WHERE order_id = p_order;
      v_changed := true;
    END IF;
  ELSIF v_old.ratio IS DISTINCT FROM v_ratio OR v_old.note IS DISTINCT FROM v_note THEN
    INSERT INTO public.sales_order_comm_ratios (order_id, ratio, note, set_by, set_by_name, set_at)
    VALUES (p_order, v_ratio, v_note, auth.uid(), v_by, now())
    ON CONFLICT (order_id) DO UPDATE
      SET ratio = EXCLUDED.ratio, note = EXCLUDED.note, set_by = EXCLUDED.set_by,
          set_by_name = EXCLUDED.set_by_name, set_at = EXCLUDED.set_at;
    v_changed := true;
  END IF;

  IF v_changed THEN
    SELECT array_agg(DISTINCT s.user_id) INTO v_users
      FROM public.sales_order_parts(ARRAY[p_order]) p JOIN public.hr_staff_costs s ON s.id = p.staff_id
     WHERE s.user_id IS NOT NULL;
    v_pct := CASE WHEN v_ratio IS NULL THEN NULL
      ELSE rtrim(rtrim(to_char(v_ratio * 100, 'FM990.00'), '0'), '.') || '%' END;
    IF v_users IS NOT NULL THEN
      PERFORM public.notify_people(v_users, 'share',
        CASE WHEN v_ratio IS NULL THEN format('%s took the commission ratio off %s', v_by, v_no)
             ELSE format('%s set %s''s commission to %s', v_by, v_no, v_pct) END,
        CASE WHEN v_ratio IS NULL THEN 'Its margin decides its commission again.'
             ELSE format('Its sales count %s too.', v_pct) END
          || CASE WHEN v_note IS NOT NULL AND v_ratio IS NOT NULL THEN ' Why: ' || v_note ELSE '' END,
        'comm_ratio', p_order::text);
    END IF;
  END IF;

  RETURN jsonb_build_object('orderId', p_order, 'orderNo', v_no, 'ratio', v_ratio, 'changed', v_changed);
END
$$;

REVOKE ALL ON FUNCTION public.member_comm_ratio_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_comm_ratio_set(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_comm_ratio_context(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_comm_ratio_set(uuid, numeric, text) TO authenticated, service_role;

-- ─── 7. The Revenue app's facts: the ratio first, the band from its month on ─

SELECT pg_temp.swap_check('public.member_order_facts_with_old_bills(uuid,date,date)'::regprocedure,
  $old$SELECT b.id,b.margin_pct,b.commission_multiplier,b.sort_order,upper(btrim(br.code)) AS code$old$,
  $new$SELECT b.id,b.margin_pct,b.commission_multiplier,b.sort_order,upper(btrim(br.code)) AS code,
   -- (20261127140500) The first month whose bills the penalty cuts (NULL: every month).
   c.margin_penalty_from AS from_month$new$);

SELECT pg_temp.swap_check('public.member_order_facts_with_old_bills(uuid,date,date)'::regprocedure,
  $old$LEFT JOIN released rl ON rl.order_no=h.order_no$old$,
  $new$LEFT JOIN released rl ON rl.order_no=h.order_no
  -- (20261127140500) A Revenue Director's ratio on the bill (sales_order_comm_ratios).
  LEFT JOIN public.sales_order_comm_ratios cr ON cr.order_id=h.id$new$);

SELECT pg_temp.swap_check('public.member_order_facts_with_old_bills(uuid,date,date)'::regprocedure,
  $old$WHEN h.margin_pct IS NOT NULL AND hd.id IS NULL THEN coalesce(pb.commission_multiplier,1)$old$,
  $new$WHEN cr.ratio IS NOT NULL AND hd.id IS NULL THEN cr.ratio  -- (20261127140500) in its band's place, whatever its margin
    WHEN h.margin_pct IS NOT NULL AND hd.id IS NULL THEN coalesce(pb.commission_multiplier,1)$new$);

SELECT pg_temp.swap_check('public.member_order_facts_with_old_bills(uuid,date,date)'::regprocedure,
  $old$WHERE (h.band_brand IS NULL OR bd.code=h.band_brand) AND h.margin_pct<=bd.margin_pct+1e-9$old$,
  $new$WHERE (h.band_brand IS NULL OR bd.code=h.band_brand) AND h.margin_pct<=bd.margin_pct+1e-9
     AND (bd.from_month IS NULL OR h.period_month>=bd.from_month)  -- (20261127140500)$new$);

-- ─── 8. The order books name a bill's ratio ──────────────────────────────────

SELECT pg_temp.swap_check('public.member_order_book_for_staff(uuid,uuid,date,date)'::regprocedure,
  $old$|| CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END$old$,
  $new$|| CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END
   -- (20261127140500) A Revenue Director's ratio on the bill, in its margin band's place: who set it, when, why.
   || coalesce((SELECT jsonb_build_object('ratio',jsonb_build_object('pct',cr.ratio,'by',cr.set_by_name,'at',cr.set_at,'note',cr.note))
       FROM public.sales_order_comm_ratios cr WHERE cr.order_id=f.order_id),'{}'::jsonb)$new$);

SELECT pg_temp.swap_check('public.member_principal_department_order_book(uuid,text,text)'::regprocedure,
  $old$|| CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END$old$,
  $new$|| CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END
   -- (20261127140500) A Revenue Director's ratio on the bill, in its margin band's place: who set it, when, why.
   || coalesce((SELECT jsonb_build_object('ratio',jsonb_build_object('pct',cr.ratio,'by',cr.set_by_name,'at',cr.set_at,'note',cr.note))
       FROM public.sales_order_comm_ratios cr WHERE cr.order_id=f.order_id),'{}'::jsonb)$new$);
