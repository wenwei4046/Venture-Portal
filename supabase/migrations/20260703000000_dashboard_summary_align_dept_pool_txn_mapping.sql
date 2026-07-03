-- dashboard_summary() aggregated dept_pools with a crude
--   SUM(CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END)
-- which counts EVERY non-np_in row (jv_in, void_in, …) as an OUTFLOW. That
-- diverges from the dept_pool_balances VIEW, whose mapping is:
--   np_in / void_in / jv_in            → + amount   (inflows)
--   expense_out / inter_billing_out /
--   void_out / jv_out                  → - amount   (outflows)
--   anything else                      → 0
-- Result: the /dashboard "Venture Pool" overview (fed by this RPC) disagreed
-- with the Dept Pool → Cash page (fed by the view) for any dept carrying a
-- non-np_in inflow — e.g. a jv_in dropped a department ~2x its amount.
--
-- Fix: align the RPC to the view by replacing all 4 occurrences of the crude
-- CASE with the view's full mapping. Applied as a meta-rewrite (pull the live
-- definition, swap the exact CASE text, re-create) so the rest of the ~11.5k
-- char function is byte-for-byte untouched. Idempotent: re-running finds no
-- buggy CASE left and simply re-creates the current (already-aligned) function.
DO $do$
DECLARE v_def text; v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dashboard_summary';

  v_def := pg_get_functiondef(v_oid);
  v_def := replace(
    v_def,
    $q$CASE WHEN transaction_type = 'np_in' THEN amount ELSE -amount END$q$,
    $q$CASE transaction_type WHEN 'np_in' THEN amount WHEN 'void_in' THEN amount WHEN 'jv_in' THEN amount WHEN 'expense_out' THEN -amount WHEN 'inter_billing_out' THEN -amount WHEN 'void_out' THEN -amount WHEN 'jv_out' THEN -amount ELSE 0 END$q$
  );
  EXECUTE v_def;
END
$do$;
