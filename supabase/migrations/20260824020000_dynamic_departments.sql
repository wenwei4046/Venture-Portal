-- Dynamic full departments — Phase 1: DB foundation (2026-08-24, user: "我要
-- 做成有自己的p&L pool 等等 … 以后可以手动加，然后功能自动链接"; first new
-- department: Revenue Department).
--
-- Design: departments becomes the REGISTRY. Three new columns hold what used
-- to be hardcoded (segment key, pool GL account, billing mode). Every mapping
-- helper keeps its LEGACY CASE for the five core departments FIRST — their
-- behaviour cannot drift, including the historical quirk that the 'Director'
-- NAME maps to the director_office segment in dept_to_segment — and falls
-- back to the registry only for names/modes/pools the CASE doesn't know.
-- provision_full_department() is the one-shot "转正" used by the Settings
-- Departments tab: appends the gl_segment + billing_mode enum values, opens
-- the dept's pool equity account, and files the registry row.
--
-- Old deployed code is unaffected: helpers return identical values for
-- everything that exists today.

-- ── (1) Registry columns ─────────────────────────────────────────────────────
ALTER TABLE departments ADD COLUMN IF NOT EXISTS segment_key text UNIQUE;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS pool_gl_code varchar(20) REFERENCES chart_of_accounts(code);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS billing_mode_key text UNIQUE;

COMMENT ON COLUMN departments.segment_key IS
  'gl_segment value for FULL departments (own P&L/pool/reports). NULL = lightweight dept booking under Venture.';
COMMENT ON COLUMN departments.pool_gl_code IS 'Equity account of this dept''s pool (10xx).';
COMMENT ON COLUMN departments.billing_mode_key IS 'billing_mode enum value whose invoices belong to this dept.';

-- Backfill the five cores (registry mirrors today's hardcodes; the legacy
-- CASEs still win for them, this is documentation + provision-guard data).
UPDATE departments SET segment_key='marketing',       pool_gl_code='1030', billing_mode_key='marketing_project'           WHERE name='Marketing'       AND segment_key IS NULL;
UPDATE departments SET segment_key='hr',              pool_gl_code='1050', billing_mode_key='hr_attribution'              WHERE name='HR'              AND segment_key IS NULL;
UPDATE departments SET segment_key='finance',         pool_gl_code='1040', billing_mode_key='finance_attribution'         WHERE name='Finance'         AND segment_key IS NULL;
UPDATE departments SET segment_key='director_office', pool_gl_code='1060', billing_mode_key='director_office_attribution' WHERE name='Director Office' AND segment_key IS NULL;
UPDATE departments SET segment_key='director',        pool_gl_code='1070', billing_mode_key='director_attribution'        WHERE name='Director'        AND segment_key IS NULL;

-- ── (2) Mapping helpers: legacy CASE first, registry fallback ────────────────
CREATE OR REPLACE FUNCTION public.dept_to_segment(p_dept_name text)
RETURNS gl_segment
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE v_key text;
BEGIN
    CASE LOWER(COALESCE(p_dept_name, ''))
        WHEN 'marketing'       THEN RETURN 'marketing'::gl_segment;
        WHEN 'hr'              THEN RETURN 'hr'::gl_segment;
        WHEN 'finance'         THEN RETURN 'finance'::gl_segment;
        WHEN 'director office' THEN RETURN 'director_office'::gl_segment;
        WHEN 'director'        THEN RETURN 'director_office'::gl_segment;
        ELSE
            SELECT segment_key INTO v_key FROM departments
            WHERE LOWER(name) = LOWER(COALESCE(p_dept_name, '')) AND segment_key IS NOT NULL
            LIMIT 1;
            IF v_key IS NOT NULL THEN RETURN v_key::gl_segment; END IF;
            RETURN 'corporate'::gl_segment;
    END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.billing_mode_to_segment(p_mode text)
RETURNS gl_segment
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE v_key text;
BEGIN
    CASE p_mode
        WHEN 'marketing_project'           THEN RETURN 'marketing'::gl_segment;
        WHEN 'hr_attribution'              THEN RETURN 'hr'::gl_segment;
        WHEN 'finance_attribution'         THEN RETURN 'finance'::gl_segment;
        WHEN 'director_office_attribution' THEN RETURN 'director_office'::gl_segment;
        WHEN 'director_attribution'        THEN RETURN 'director'::gl_segment;
        ELSE
            SELECT segment_key INTO v_key FROM departments
            WHERE billing_mode_key = p_mode AND segment_key IS NOT NULL
            LIMIT 1;
            IF v_key IS NOT NULL THEN RETURN v_key::gl_segment; END IF;
            RETURN 'corporate'::gl_segment;
    END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pool_key_to_segment(p_pool text)
RETURNS gl_segment
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE v_key text;
BEGIN
    CASE p_pool
        WHEN 'dept_pool_marketing'       THEN RETURN 'marketing'::gl_segment;
        WHEN 'dept_pool_hr'              THEN RETURN 'hr'::gl_segment;
        WHEN 'dept_pool_finance'         THEN RETURN 'finance'::gl_segment;
        WHEN 'dept_pool_director_office' THEN RETURN 'director_office'::gl_segment;
        WHEN 'dept_pool_director'        THEN RETURN 'director'::gl_segment;
        ELSE
            IF p_pool LIKE 'dept\_pool\_%' ESCAPE '\' THEN
                SELECT segment_key INTO v_key FROM departments
                WHERE segment_key = substring(p_pool from 11) LIMIT 1;
                IF v_key IS NOT NULL THEN RETURN v_key::gl_segment; END IF;
            END IF;
            RETURN 'corporate'::gl_segment;
    END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dept_pool_gl_code(p_dept_name text)
RETURNS character varying
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE v_code varchar(20);
BEGIN
    CASE p_dept_name
        WHEN 'Marketing'       THEN RETURN '1030';
        WHEN 'Finance'         THEN RETURN '1040';
        WHEN 'HR'              THEN RETURN '1050';
        WHEN 'Director Office' THEN RETURN '1060';
        WHEN 'Director'        THEN RETURN '1070';
        ELSE
            SELECT pool_gl_code INTO v_code FROM departments
            WHERE name = p_dept_name AND pool_gl_code IS NOT NULL LIMIT 1;
            RETURN v_code; -- NULL when unknown, same as before
    END CASE;
END;
$function$;

-- ── (3) Money paths that mapped billing_mode → dept by hand ─────────────────
CREATE OR REPLACE FUNCTION public.credit_dept_pool_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_invoice      invoices%ROWTYPE;
    v_dept_name    TEXT;
    v_dept_id      UUID;
    v_actor        UUID;
    v_gl_code      VARCHAR(20);
    v_seg_key      TEXT;
BEGIN
    IF NEW.voucher_type <> 'billing_payment'
       OR NEW.reference_type <> 'invoice'
       OR NEW.reference_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status <> 'paid' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_invoice FROM invoices WHERE id = NEW.reference_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    v_dept_name := CASE v_invoice.billing_mode
        WHEN 'hr_attribution'              THEN 'HR'
        WHEN 'finance_attribution'         THEN 'Finance'
        WHEN 'director_office_attribution' THEN 'Director Office'
        WHEN 'director_attribution'        THEN 'Director'
        WHEN 'marketing_project'           THEN 'Marketing'
        ELSE NULL
    END;

    -- Registry fallback (dynamic departments, 2026-08-24): a full dept's own
    -- billing mode credits ITS pool the same way the cores do.
    IF v_dept_name IS NULL THEN
        SELECT name INTO v_dept_name FROM departments
        WHERE billing_mode_key = v_invoice.billing_mode::text AND segment_key IS NOT NULL
        LIMIT 1;
    END IF;

    IF v_dept_name IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id, segment_key INTO v_dept_id, v_seg_key FROM departments WHERE name = v_dept_name;
    IF v_dept_id IS NULL THEN
        RAISE NOTICE 'credit_dept_pool_on_invoice_paid: department % not found', v_dept_name;
        RETURN NEW;
    END IF;

    v_actor := COALESCE(NEW.approved_by, NEW.created_by);

    INSERT INTO dept_pools (
        department_id, transaction_type, amount,
        period_month, description, created_by
    ) VALUES (
        v_dept_id,
        'np_in',
        NEW.amount,
        COALESCE(v_invoice.period_month, DATE_TRUNC('month', CURRENT_DATE)::DATE),
        'Invoice ' || COALESCE(v_invoice.invoice_no, 'no #') || ' settled — ' || NEW.payee_name,
        v_actor
    );

    IF v_invoice.billing_mode = 'director_attribution' THEN
        RETURN NEW;
    END IF;

    v_gl_code := dept_pool_gl_code(v_dept_name);
    IF v_gl_code IS NULL THEN
        RAISE EXCEPTION
            'credit_dept_pool_on_invoice_paid: no GL code for dept "%"', v_dept_name;
    END IF;

    PERFORM post_journal_entry(
        COALESCE(NEW.payment_date, CURRENT_DATE),
        format('Dept Pool credited from invoice %s settlement',
               COALESCE(v_invoice.invoice_no, NEW.reference_id::TEXT)),
        'invoice_paid_credit',
        NEW.id,
        v_actor,
        jsonb_build_array(
            jsonb_build_object('account_code', '1010',
                               'debit',  NEW.amount,
                               'description', 'HV Operating Fund → ' || v_dept_name || ' Pool'),
            jsonb_build_object('account_code', v_gl_code,
                               'credit', NEW.amount,
                               'description', v_dept_name || ' Pool funded from invoice settlement')
        )
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_dept_np(p_dept_id uuid, p_period date)
RETURNS TABLE(out_department_id uuid, out_period_month date, out_revenue numeric, out_staff_cost numeric, out_expenses numeric, out_net_profit numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_period DATE;
    v_revenue DECIMAL(15, 2);
    v_extra_rev DECIMAL(15, 2);
    v_staff_cost DECIMAL(15, 2);
    v_expenses DECIMAL(15, 2);
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('principal', 'finance', 'dept_manager', 'hr') THEN
        RAISE EXCEPTION 'calculate_dept_np: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_role = 'dept_manager' AND p_dept_id <> current_user_department_id() THEN
        RAISE EXCEPTION 'calculate_dept_np: dept_manager can only query own department'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_period := date_trunc('month', p_period)::date;

    -- Revenue: marketing_project invoices linked to contracts for this dept
    SELECT COALESCE(SUM(inv.total_amount), 0) INTO v_revenue
    FROM invoices inv
    LEFT JOIN service_contracts sc ON sc.id = inv.contract_id
    WHERE inv.period_month = v_period
      AND inv.billing_mode = 'marketing_project'
      AND sc.department_id = p_dept_id;

    -- Dynamic departments (2026-08-24): a NEW full dept's revenue = invoices
    -- of its own billing mode. Guarded off the five cores so their NP maths
    -- is bit-for-bit unchanged.
    SELECT COALESCE(SUM(inv.total_amount), 0) INTO v_extra_rev
    FROM invoices inv
    JOIN departments d ON d.id = p_dept_id
    WHERE inv.period_month = v_period
      AND d.billing_mode_key IS NOT NULL
      AND d.segment_key IS NOT NULL
      AND d.segment_key NOT IN ('marketing','hr','finance','director_office','director')
      AND inv.billing_mode::text = d.billing_mode_key;
    v_revenue := v_revenue + COALESCE(v_extra_rev, 0);

    -- Staff cost: sum of basic_salary from the period's HR submission snapshot
    SELECT COALESCE(SUM((staff_elem->>'basic_salary')::decimal), 0) INTO v_staff_cost
    FROM hr_cost_submissions hcs,
         jsonb_array_elements(hcs.staff_snapshot) AS staff_elem
    WHERE hcs.period_month = v_period
      AND (staff_elem->>'department_id')::uuid = p_dept_id
      AND (staff_elem->>'status') = 'active';

    -- Dept expenses: approved expense_out rows for this period
    SELECT COALESCE(SUM(dp.amount), 0) INTO v_expenses
    FROM dept_pools dp
    WHERE dp.department_id = p_dept_id
      AND dp.period_month = v_period
      AND dp.transaction_type = 'expense_out';

    RETURN QUERY SELECT
        p_dept_id,
        v_period,
        v_revenue,
        v_staff_cost,
        v_expenses,
        v_revenue - v_staff_cost - v_expenses;
END;
$function$;

-- ── (4) The one-shot 转正 ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_full_department(p_department_id uuid, p_segment_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_dept departments%ROWTYPE;
    v_key  text;
    v_mode text;
    v_pool_code varchar(20);
    v_parent varchar(20);
BEGIN
    IF current_user_role() NOT IN ('principal', 'finance') THEN
        RAISE EXCEPTION 'provision_full_department: only Principal/Finance may provision'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_dept FROM departments WHERE id = p_department_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'provision_full_department: department not found'; END IF;
    IF v_dept.is_internal THEN RAISE EXCEPTION 'provision_full_department: internal departments cannot be provisioned'; END IF;
    IF v_dept.segment_key IS NOT NULL THEN
        RAISE EXCEPTION 'provision_full_department: % is already a full department (segment %)', v_dept.name, v_dept.segment_key;
    END IF;

    v_key := lower(btrim(p_segment_key));
    IF v_key !~ '^[a-z][a-z0-9_]{2,30}$' THEN
        RAISE EXCEPTION 'provision_full_department: segment key must be 3-31 chars of a-z, 0-9, _ (got "%")', p_segment_key;
    END IF;
    IF v_key = ANY (ARRAY['corporate','treasury','unallocated','venture']) THEN
        RAISE EXCEPTION 'provision_full_department: "%" is a reserved segment name', v_key;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = 'gl_segment' AND e.enumlabel = v_key) THEN
        RAISE EXCEPTION 'provision_full_department: segment "%" already exists', v_key;
    END IF;
    v_mode := v_key || '_attribution';
    IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
               WHERE t.typname = 'billing_mode' AND e.enumlabel = v_mode) THEN
        RAISE EXCEPTION 'provision_full_department: billing mode "%" already exists', v_mode;
    END IF;

    -- Append the enum values (PG15 allows this in-transaction as long as the
    -- new values are not USED in this same transaction — we only store TEXT).
    EXECUTE format('ALTER TYPE gl_segment ADD VALUE IF NOT EXISTS %L', v_key);
    EXECUTE format('ALTER TYPE billing_mode ADD VALUE IF NOT EXISTS %L', v_mode);

    -- Open the dept pool equity account at the next free multiple-of-10 in
    -- the pool block (1030…1490) — next_account_code('equity') would return
    -- MAX+1 across the whole range (1901 after Opening Balance Clearing 1900),
    -- which breaks the 1030/1040/… pool convention.
    SELECT (COALESCE(MAX(code::int), 1020) + 10)::text INTO v_pool_code
    FROM chart_of_accounts
    WHERE code ~ '^[0-9]+$' AND code::int BETWEEN 1030 AND 1490 AND code::int % 10 = 0;
    IF v_pool_code::int > 1490 THEN
        RAISE EXCEPTION 'provision_full_department: pool code block 1030-1490 exhausted';
    END IF;
    SELECT parent_code INTO v_parent FROM chart_of_accounts WHERE code = '1030';
    INSERT INTO chart_of_accounts (code, name, type, parent_code, is_active, sort_order, cash_flow_category)
    VALUES (v_pool_code, 'Dept Pool - ' || v_dept.name, 'equity', v_parent, true, 100, 'financing');

    UPDATE departments
    SET segment_key = v_key, pool_gl_code = v_pool_code, billing_mode_key = v_mode
    WHERE id = p_department_id;

    RETURN jsonb_build_object(
        'segment_key', v_key,
        'billing_mode', v_mode,
        'pool_gl_code', v_pool_code
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_full_department(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_full_department(uuid, text) TO authenticated;
