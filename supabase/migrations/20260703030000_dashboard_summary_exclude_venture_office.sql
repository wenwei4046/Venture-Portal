-- dashboard_summary(): exclude the hidden 'Venture Office' pseudo-department
-- (departments.is_internal = true) from every dept-pool aggregation, and fold
-- its dept_pools ledger balance into the venture / hv_fund_balance bucket so
-- total_pool stays flat.
--
-- WHY
-- The Settle flow now writes np_in dept_pools rows against the Venture Office
-- pseudo-dept as the cash-page offset for dept→Venture inter-billing (see
-- src/app/(portal)/payments/actions.ts + supabase migration
-- 20260703020000). On the Dept Pool → Cash page that pseudo-dept balance is
-- folded into the "Venture (Office)" figure (GL corporate/treasury slice +
-- pseudo-dept overlay). The dashboard must mirror that:
--   * v_all_dept_pool, v_dept_pool_total, and dept_pool_breakdown must EXCLUDE
--     the pseudo-dept (same shape as the existing Director exclusion), so it
--     never shows up as a 6th dept-pool line, and
--   * its balance must be ADDED into v_hv_fund_balance (the venture_pool
--     bucket), because v_total_pool := v_all_dept_pool + v_hv_fund_balance.
--     Moving the amount from the dept-pool bucket to the venture bucket keeps
--     total_pool byte-identical while matching the cash page's attribution.
--
-- For a dept→Venture netting inter-billing the paying dept is −X
-- (inter_billing_out) and Venture Office is +X (np_in), so the group total is
-- unaffected either way; this migration is about WHICH bucket the pseudo-dept's
-- standing balance is reported in, mirroring the cash page.
--
-- HOW
-- Meta-rewrite in the idempotent style of
-- 20260703000000_dashboard_summary_align_dept_pool_txn_mapping.sql: pull the
-- live definition, apply targeted string replacements against unique anchors,
-- re-create. Re-running is a no-op once the anchors are already rewritten
-- (the guard raises if an expected anchor is missing so a definition drift is
-- caught loudly rather than silently skipped).
DO $do$
DECLARE
  v_def text;
  v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dashboard_summary';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'dashboard_summary() not found — cannot patch';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- Idempotency short-circuit: if the pseudo-dept variable already exists the
  -- function is already patched; re-creating the current definition is a no-op.
  IF position('v_venture_office_dept_id' IN v_def) > 0 THEN
    RAISE NOTICE 'dashboard_summary() already excludes Venture Office — no change';
    RETURN;
  END IF;

  -- 1) Declare the pseudo-dept id + its standing balance alongside the existing
  --    Director dept id declaration.
  IF position('    v_director_dept_id UUID;' IN v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing: v_director_dept_id declaration';
  END IF;
  v_def := replace(
    v_def,
    '    v_director_dept_id UUID;',
    '    v_director_dept_id UUID;'                || E'\n'
    || '    v_venture_office_dept_id UUID;'       || E'\n'
    || '    v_venture_office_balance DECIMAL;'
  );

  -- 2) Resolve the pseudo-dept id right after the Director dept lookup.
  IF position(E'SELECT id INTO v_director_dept_id FROM departments WHERE name = ''Director'' LIMIT 1;' IN v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing: v_director_dept_id lookup';
  END IF;
  v_def := replace(
    v_def,
    'SELECT id INTO v_director_dept_id FROM departments WHERE name = ''Director'' LIMIT 1;',
    'SELECT id INTO v_director_dept_id FROM departments WHERE name = ''Director'' LIMIT 1;' || E'\n'
    || '    SELECT id INTO v_venture_office_dept_id FROM departments WHERE is_internal = TRUE AND name = ''Venture Office'' LIMIT 1;'
  );

  -- 3) v_all_dept_pool: was "... FROM dept_pools;" (no filter). Exclude the
  --    pseudo-dept, and capture its standing balance separately so we can fold
  --    it into the venture bucket below.
  IF position('    INTO v_all_dept_pool FROM dept_pools;' IN v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing: v_all_dept_pool FROM dept_pools;';
  END IF;
  v_def := replace(
    v_def,
    '    INTO v_all_dept_pool FROM dept_pools;',
    '    INTO v_all_dept_pool FROM dept_pools'                                             || E'\n'
    || '    WHERE department_id IS DISTINCT FROM v_venture_office_dept_id;'                || E'\n'
    || E'\n'
    || '    SELECT COALESCE(SUM(CASE transaction_type WHEN ''np_in'' THEN amount WHEN ''void_in'' THEN amount WHEN ''jv_in'' THEN amount WHEN ''expense_out'' THEN -amount WHEN ''inter_billing_out'' THEN -amount WHEN ''void_out'' THEN -amount WHEN ''jv_out'' THEN -amount ELSE 0 END), 0)' || E'\n'
    || '    INTO v_venture_office_balance FROM dept_pools'                                 || E'\n'
    || '    WHERE department_id IS NOT DISTINCT FROM v_venture_office_dept_id;'
  );

  -- 4) v_dept_pool_total: already excludes Director. Also exclude the pseudo-dept.
  IF position('    INTO v_dept_pool_total FROM dept_pools' || E'\n' || '    WHERE department_id IS DISTINCT FROM v_director_dept_id;' IN v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing: v_dept_pool_total director exclusion';
  END IF;
  v_def := replace(
    v_def,
    '    INTO v_dept_pool_total FROM dept_pools' || E'\n' || '    WHERE department_id IS DISTINCT FROM v_director_dept_id;',
    '    INTO v_dept_pool_total FROM dept_pools' || E'\n'
    || '    WHERE department_id IS DISTINCT FROM v_director_dept_id' || E'\n'
    || '      AND department_id IS DISTINCT FROM v_venture_office_dept_id;'
  );

  -- 5) dept_pool_breakdown inner query: exclude the pseudo-dept.
  IF position('                FROM dept_pools GROUP BY department_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing: dept_pool_breakdown GROUP BY department_id';
  END IF;
  v_def := replace(
    v_def,
    '                FROM dept_pools GROUP BY department_id',
    '                FROM dept_pools' || E'\n'
    || '                WHERE department_id IS DISTINCT FROM v_venture_office_dept_id' || E'\n'
    || '                GROUP BY department_id'
  );

  -- 6) Fold the pseudo-dept balance into the venture bucket so total_pool stays
  --    flat: v_total_pool := v_all_dept_pool + v_hv_fund_balance. We moved the
  --    balance OUT of v_all_dept_pool (step 3), so add it back INTO
  --    v_hv_fund_balance here. This also makes pool_breakdown.venture_pool and
  --    hv_fund_balance include the overlay — matching the cash page.
  IF position('    v_total_pool := v_all_dept_pool + v_hv_fund_balance;' IN v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing: v_total_pool assignment';
  END IF;
  v_def := replace(
    v_def,
    '    v_total_pool := v_all_dept_pool + v_hv_fund_balance;',
    '    -- Fold the Venture Office pseudo-dept overlay into the venture bucket'  || E'\n'
    || '    -- (moved out of v_all_dept_pool above) so total_pool stays flat and'  || E'\n'
    || '    -- the venture_pool / hv_fund_balance figures match the cash page.'    || E'\n'
    || '    v_hv_fund_balance := v_hv_fund_balance + COALESCE(v_venture_office_balance, 0);' || E'\n'
    || '    v_total_pool := v_all_dept_pool + v_hv_fund_balance;'
  );

  EXECUTE v_def;
END
$do$;
