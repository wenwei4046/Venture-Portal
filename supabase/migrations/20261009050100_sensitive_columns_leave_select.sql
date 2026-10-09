-- ============================================================================
-- 20261009050100_sensitive_columns_leave_select.sql
-- Salary amounts, NRIC / IC and bank account numbers show only where ticked
-- (PR4 of the People Management revamp, 2026-10-09) — step two of two.
-- ============================================================================
--
-- 20261009050000 put the readers in place (staff_private_fields,
-- director_private_fields, payroll_line_accounts) and PR4's code reads
-- through them. Applied once that code is LIVE, so no page asks for a column
-- it may no longer read: NRIC, the account numbers and a payroll submission's
-- per-person copies leave `authenticated`'s SELECT; every other column stays
-- granted, INSERT and UPDATE are untouched, and a select('*') on these tables
-- is refused from here on — read through lib/private-fields.ts, ask for
-- STAFF_ROW_COLUMNS / DIRECTOR_ROW_COLUMNS (lib/private-columns.ts). A column
-- ADDED to one of these tables later is granted to authenticated in the same
-- migration; src/lib/private-columns.test.ts refuses one that is not.

DO $$
BEGIN
  IF to_regprocedure('public.staff_private_fields(uuid[])') IS NULL
     OR to_regprocedure('public.director_private_fields(uuid[])') IS NULL
     OR to_regprocedure('public.payroll_line_accounts(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'The readers are not there — apply 20261009050000 (and deploy the code that uses them) first';
  END IF;
END
$$;

-- ── 1. The columns leave the session's SELECT ───────────────────────────────

DO $$
DECLARE
  t record;
  v_cols text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('hr_staff_costs', ARRAY['nric', 'bank_account_no', 'bank_account_no_2']),
      ('directors', ARRAY['nric']),
      ('payroll_voucher_lines', ARRAY['bank_account_no']),
      ('hr_cost_submissions', ARRAY['staff_snapshot', 'staff_allocation_snapshot'])
    ) AS x(tbl, private)
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.tbl AND column_name <> ALL (t.private);
    EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon, authenticated', t.tbl);
    EXECUTE format('REVOKE SELECT (%s) ON public.%I FROM PUBLIC, anon, authenticated',
                   (SELECT string_agg(quote_ident(c), ', ') FROM unnest(t.private) c), t.tbl);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', v_cols, t.tbl);
  END LOOP;
END
$$;

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t record;
  c record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('hr_staff_costs', ARRAY['nric', 'bank_account_no', 'bank_account_no_2']),
      ('directors', ARRAY['nric']),
      ('payroll_voucher_lines', ARRAY['bank_account_no']),
      ('hr_cost_submissions', ARRAY['staff_snapshot', 'staff_allocation_snapshot'])
    ) AS x(tbl, private)
  LOOP
    FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.tbl LOOP
      IF has_column_privilege('authenticated', format('public.%I', t.tbl), c.column_name, 'SELECT')
         IS DISTINCT FROM (NOT (c.column_name = ANY (t.private))) THEN
        RAISE EXCEPTION '%.%: authenticated SELECT is not as planned', t.tbl, c.column_name;
      END IF;
      IF has_column_privilege('anon', format('public.%I', t.tbl), c.column_name, 'SELECT') THEN
        RAISE EXCEPTION '%.%: anon may still read it', t.tbl, c.column_name;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
