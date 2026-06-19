-- JVs now move the dept pool too — when they should (user 2026-06-12: "jv不是
-- 开放可以选segment了吗？还无法影响吗？").
--
-- Rule: the dept pools reconcile as "pool balance == that segment's net bank
-- GL movement" (the 2026-06-11 audit method). So a manual JV that (a) carries
-- a DEPT segment and (b) moves a bank account must move that dept's pool by
-- the same bank delta — otherwise every such JV silently breaks the pool↔GL
-- tie. A dept-segment JV with NO bank lines (pure P&L/BS reclass) moves no
-- cash and therefore no pool. corporate/treasury/unallocated JVs touch no
-- dept pool (the Venture figure is GL-derived since migs 272/273).
--
-- Mechanics:
--   - new dept_pool_txn_type values 'jv_in' / 'jv_out' (balance view counts
--     them; the monthly In/Out cards keep their explicit whitelists, so JV
--     adjustments correct the BALANCE without distorting movement stats —
--     same design as void_in/void_out);
--   - jv_apply_bank_cache (called by create/update/delete JV RPCs with
--     sign +1/−1) grows a dept-pool leg: net bank delta × sign → one
--     dept_pools row (jv_in if positive, jv_out if negative), description
--     'JV <entry_no>: ...'. Update/delete reverse exactly like the cache.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

ALTER TYPE dept_pool_txn_type ADD VALUE IF NOT EXISTS 'jv_in';
ALTER TYPE dept_pool_txn_type ADD VALUE IF NOT EXISTS 'jv_out';

CREATE OR REPLACE VIEW dept_pool_balances AS
  SELECT department_id,
         COALESCE(SUM(
           CASE transaction_type::text
             WHEN 'np_in'             THEN amount
             WHEN 'expense_out'       THEN -amount
             WHEN 'inter_billing_out' THEN -amount
             WHEN 'void_in'           THEN amount
             WHEN 'void_out'          THEN -amount
             WHEN 'jv_in'             THEN amount
             WHEN 'jv_out'            THEN -amount
             ELSE 0::numeric
           END
         ), 0::numeric) AS balance
    FROM dept_pools
   GROUP BY department_id;

CREATE OR REPLACE FUNCTION public.jv_apply_bank_cache(p_entry_id uuid, p_sign integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_entry RECORD;
  v_dept_name TEXT;
  v_dept_id UUID;
  v_bank_delta NUMERIC := 0;
  v_pool_delta NUMERIC;
BEGIN
  -- Bank cache: per bank account, debit = +, credit = −, times sign.
  FOR r IN
    SELECT ba.id AS bank_id,
           SUM(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)) AS delta
      FROM journal_lines jl
      JOIN bank_accounts ba ON ba.gl_account_code = jl.account_code
     WHERE jl.entry_id = p_entry_id
     GROUP BY ba.id
    HAVING SUM(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0)) <> 0
  LOOP
    UPDATE bank_accounts
       SET current_balance = current_balance + (p_sign * r.delta)
     WHERE id = r.bank_id;
    v_bank_delta := v_bank_delta + r.delta;
  END LOOP;

  -- Dept pool: only when the JV carries a dept segment AND moved bank cash.
  -- Pool delta = the JV's net bank movement for that dept (keeps the
  -- pool == per-segment bank-GL reconciliation intact).
  IF v_bank_delta = 0 THEN RETURN; END IF;

  SELECT segment::text, entry_no INTO v_entry
    FROM journal_entries WHERE id = p_entry_id;
  v_dept_name := CASE v_entry.segment
      WHEN 'marketing'       THEN 'Marketing'
      WHEN 'hr'              THEN 'HR'
      WHEN 'finance'         THEN 'Finance'
      WHEN 'director_office' THEN 'Director Office'
      WHEN 'director'        THEN 'Director'
      ELSE NULL
  END;
  IF v_dept_name IS NULL THEN RETURN; END IF;

  SELECT id INTO v_dept_id FROM departments WHERE name = v_dept_name;
  IF v_dept_id IS NULL THEN
      RAISE EXCEPTION 'jv_apply_bank_cache: department "%" not found for segment %', v_dept_name, v_entry.segment;
  END IF;

  v_pool_delta := p_sign * v_bank_delta;
  INSERT INTO dept_pools (department_id, transaction_type, amount, period_month, description, created_by)
  VALUES (
      v_dept_id,
      CASE WHEN v_pool_delta > 0 THEN 'jv_in'::dept_pool_txn_type ELSE 'jv_out'::dept_pool_txn_type END,
      abs(v_pool_delta),
      date_trunc('month', NOW())::date,
      format('JV %s: bank movement (%s)%s', v_entry.entry_no, v_entry.segment,
             CASE WHEN p_sign < 0 THEN ' — reversal' ELSE '' END),
      auth.uid()
  );
END $function$;
