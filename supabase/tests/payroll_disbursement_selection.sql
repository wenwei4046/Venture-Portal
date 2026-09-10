-- Local PostgreSQL/PGlite regression only. Apply the employee-selection
-- migration to an EMPTY disposable database (roles authenticated/anon) first,
-- then execute this file. It refuses databases with existing payroll tables.
-- These fixtures isolate generator behavior, not production RLS/accounting
-- triggers. All fixtures and test PVs are rolled back. No live DB is needed.
BEGIN;
DO $$ BEGIN
    IF to_regclass('public.hr_monthly_payroll') IS NOT NULL
       OR to_regclass('public.payment_vouchers') IS NOT NULL THEN
        RAISE EXCEPTION 'Regression fixtures require an empty disposable database.';
    END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
    SELECT CASE WHEN current_setting('test.null_caller', true) = 'true' THEN NULL
        ELSE '00000000-0000-0000-0000-000000000001'::uuid END
$$;
CREATE FUNCTION public.has_scope(text[]) RETURNS boolean LANGUAGE sql AS $$
    SELECT CASE WHEN current_setting('test.allow_hr', true) = 'null' THEN NULL
        ELSE coalesce(current_setting('test.allow_hr', true), 'true') <> 'false' END
$$;
CREATE TABLE departments (id uuid PRIMARY KEY, name text);
CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text, employee_code text, department_id uuid);
CREATE TABLE hr_monthly_payroll (id uuid PRIMARY KEY, staff_id uuid, period_month date, net numeric(15,2));
CREATE TABLE director_monthly_payroll (id uuid PRIMARY KEY, period_month date, employee_name text, employee_code text, net numeric(15,2));
CREATE TABLE payroll_runs (id uuid PRIMARY KEY, period_month date, status text);
CREATE TABLE payroll_payment_requests (id uuid DEFAULT gen_random_uuid(), payroll_run_id uuid, period_month date, status text, created_at timestamptz DEFAULT now());
CREATE TABLE bank_accounts (id uuid PRIMARY KEY, status text, gl_account_code text, is_primary boolean);
CREATE TABLE payment_vouchers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_no text UNIQUE,
    voucher_type text, direction text, status text, amount numeric(15,2), currency text,
    payee_name text, description text, payment_method text, payment_date date,
    source_pool text, bank_account_id uuid, reference_type text, reference_id uuid, created_by uuid
);
CREATE TABLE payment_voucher_sources (voucher_id uuid REFERENCES payment_vouchers(id), pool text, amount numeric(15,2), account_code text);
CREATE TABLE approval_requests (request_type text, reference_id uuid, reference_table text, submitted_by uuid, description text, amount numeric(15,2), status text, workflow_state text, group_id uuid);
CREATE TABLE payroll_voucher_lines (
    voucher_id uuid REFERENCES payment_vouchers(id), scope text, payroll_row_id uuid,
    period_month date, employee_name text, employee_code text, department_id uuid,
    department_name text, net numeric(15,2), UNIQUE(voucher_id, payroll_row_id)
);
CREATE TEMP TABLE assertions (name text);
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
    INSERT INTO assertions VALUES (label);
END $$;
CREATE FUNCTION pg_temp.expect_error(sql text, expected_message text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text; before_count integer;
BEGIN
    SELECT count(*) INTO before_count FROM payment_vouchers;
    BEGIN EXECUTE sql;
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
    END;
    PERFORM pg_temp.assert_true(message LIKE '%' || expected_message || '%', label || ': expected rejection');
    PERFORM pg_temp.assert_true((SELECT count(*) FROM payment_vouchers) = before_count, label || ': atomic, no vouchers created');
END $$;
-- UUID suffixes are employee numbers. Rows 1-5: Finance; 6: Marketing;
-- 7/8: zero/negative; 9: another month. Director rows use prefix 4.
INSERT INTO departments VALUES
    ('10000000-0000-0000-0000-000000000001', 'Finance'),
    ('10000000-0000-0000-0000-000000000002', 'Marketing');
INSERT INTO hr_staff_costs
SELECT ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'Employee ' || n, 'E' || n,
       CASE WHEN n = 6 THEN '10000000-0000-0000-0000-000000000002'::uuid
            ELSE '10000000-0000-0000-0000-000000000001'::uuid END
FROM generate_series(1,8) n;
INSERT INTO hr_monthly_payroll
SELECT ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, '2026-09-01',
       CASE WHEN n = 7 THEN 0 WHEN n = 8 THEN -5 ELSE n * 100 END
FROM generate_series(1,8) n;
INSERT INTO hr_monthly_payroll VALUES ('30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','2026-08-01',50);
INSERT INTO director_monthly_payroll VALUES
    ('40000000-0000-0000-0000-000000000001','2026-09-01','Director 1','D1',1000),
    ('40000000-0000-0000-0000-000000000002','2026-09-01','Director 2','D2',2000);
INSERT INTO payroll_runs VALUES ('50000000-0000-0000-0000-000000000001','2026-09-01','approved');
INSERT INTO bank_accounts VALUES ('60000000-0000-0000-0000-000000000001','active','3010',true);

SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(pronargs = 6 AND pronargdefaults = 3)
    FROM pg_proc WHERE proname = 'create_payroll_disbursement_vouchers'), 'one unambiguous signature with three defaults');
SELECT pg_temp.assert_true(NOT has_function_privilege('public',
    'public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[])','execute'), 'PUBLIC cannot execute');
SELECT pg_temp.assert_true(has_function_privilege('authenticated',
    'public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[])','execute'), 'authenticated execute permitted subject to HR scope');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30')$q$, 'funding for period', 'staff funding gate');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','directors','2026-09-30')$q$, 'Director salary funding', 'independent director funding gate');
INSERT INTO payroll_payment_requests (payroll_run_id, period_month, status)
VALUES ('50000000-0000-0000-0000-000000000001','2026-09-01','completed');
DO $$ DECLARE bad_ids uuid[]; label text;
BEGIN
    FOR bad_ids, label IN SELECT * FROM (VALUES
        (ARRAY['30000000-0000-0000-0000-000000000006']::uuid[], 'another department'),
        (ARRAY['30000000-0000-0000-0000-000000000009']::uuid[], 'another month'),
        (ARRAY['40000000-0000-0000-0000-000000000001']::uuid[], 'another scope'),
        (ARRAY['30000000-0000-0000-0000-000000000007']::uuid[], 'zero net'),
        (ARRAY['30000000-0000-0000-0000-000000000008']::uuid[], 'negative net'),
        (ARRAY['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[], 'missing row'),
        (ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006']::uuid[], 'mixed valid and invalid')
    ) AS cases(ids, name) LOOP
        PERFORM pg_temp.expect_error(format('SELECT create_payroll_disbursement_vouchers(''2026-09-01'',''staff'',''2026-09-30'',''department'',''10000000-0000-0000-0000-000000000001'',%L::uuid[])',bad_ids), 'Employee selection has changed', label);
    END LOOP;
END $$;
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','department',NULL,ARRAY[]::uuid[])$q$, 'Select at least one employee', 'empty selection');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','department',NULL,ARRAY[NULL]::uuid[])$q$, 'Invalid employee selection', 'null selection member');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','department',NULL,ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001']::uuid[])$q$, 'Invalid employee selection', 'duplicate selection');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01',NULL,'2026-09-30')$q$, 'scope must be', 'null scope');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30',NULL)$q$, 'granularity must be', 'null granularity');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-02','staff','2026-09-30')$q$, 'Choose a payroll month', 'invalid period day');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff',NULL)$q$, 'payment date is required', 'missing payment date');
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','directors','2026-09-30','department','10000000-0000-0000-0000-000000000001')$q$, 'no department filter', 'director department filter');
SELECT set_config('test.allow_hr','false',true);
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30')$q$, 'not permitted', 'HR scope gate');
SELECT set_config('test.allow_hr','true',true);
SELECT set_config('test.null_caller','true',true);
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30')$q$, 'not permitted', 'null auth UID fails closed');
SELECT set_config('test.null_caller','false',true);
SELECT set_config('test.allow_hr','null',true);
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30')$q$, 'not permitted', 'null permission fails closed');
SELECT set_config('test.allow_hr','true',true);

DO $$ DECLARE result json; first_group uuid;
BEGIN
    result := create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-20','department',
        '10000000-0000-0000-0000-000000000001', ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003']::uuid[]);
    first_group := (result->>'group_id')::uuid;
    PERFORM pg_temp.assert_true((result->>'count')::int = 1 AND (result->>'people')::int = 3 AND (result->>'total')::numeric = 600, 'three selected staff produce one department PV for RM600');
    PERFORM pg_temp.assert_true((SELECT count(*) = 3 AND sum(net) = 600 FROM payroll_voucher_lines), 'exactly three employee lines');
    PERFORM pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(payment_date = '2026-09-20' AND source_pool = 'dept_pool_hr' AND bank_account_id = '60000000-0000-0000-0000-000000000001' AND status = 'pending_approval') FROM payment_vouchers), 'date, Alliance bank, custody and status preserved');
    PERFORM pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(amount = 600 AND account_code = '4070') FROM payment_voucher_sources), 'Dr 4070 allocation uses selected amount');
    PERFORM pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','employee','10000000-0000-0000-0000-000000000001', ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004']::uuid[])$q$, 'Employee selection has changed', 'stale selection rejects whole batch');
    result := create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','employee','10000000-0000-0000-0000-000000000001');
    PERFORM pg_temp.assert_true((result->>'count')::int = 2 AND (result->>'people')::int = 2 AND (result->>'total')::numeric = 900, 'five-arg legacy call generates remaining two employees');
    PERFORM pg_temp.assert_true(first_group <> (result->>'group_id')::uuid, 'later batch has separate approval group');
    PERFORM pg_temp.assert_true((SELECT count(*) = 5 AND count(DISTINCT payroll_row_id) = 5 FROM payroll_voucher_lines), 'five staff covered without duplication');
    PERFORM pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','department','10000000-0000-0000-0000-000000000001')$q$, 'No employees without a PV', 'fully covered department');
    result := create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30');
    PERFORM pg_temp.assert_true((result->>'count')::int = 1 AND (result->>'total')::numeric = 600, 'three-arg legacy call picks remaining scope');
END $$;
UPDATE payment_vouchers SET status = 'voided' WHERE amount = 600 AND reference_id = '10000000-0000-0000-0000-000000000001';
DO $$ DECLARE result json;
BEGIN
    result := create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','employee',
        '10000000-0000-0000-0000-000000000001', ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003']::uuid[]);
    PERFORM pg_temp.assert_true((result->>'count')::int = 3 AND (result->>'total')::numeric = 600, 'voided batch regenerates as three individual PVs');
END $$;
DELETE FROM payroll_voucher_lines WHERE payroll_row_id = '30000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','employee',NULL, ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])$q$, 'Employee selection has changed', 'legacy PV without line still prevents duplicate');
INSERT INTO payroll_payment_requests (payroll_run_id, period_month, status) VALUES (NULL,'2026-09-01','completed');
DO $$ DECLARE result json;
BEGIN
    result := create_payroll_disbursement_vouchers('2026-09-01','directors','2026-09-20','department',NULL, ARRAY['40000000-0000-0000-0000-000000000001']::uuid[]);
    PERFORM pg_temp.assert_true((result->>'count')::int = 1 AND (result->>'people')::int = 1 AND (result->>'total')::numeric = 1000, 'director exact selection');
    result := create_payroll_disbursement_vouchers('2026-09-01','directors','2026-09-30','department');
    PERFORM pg_temp.assert_true((result->>'count')::int = 1 AND (result->>'people')::int = 1 AND (result->>'total')::numeric = 2000, 'director later batch covers remaining');
    PERFORM pg_temp.assert_true(NOT EXISTS (SELECT l.scope, l.payroll_row_id FROM payroll_voucher_lines l JOIN payment_vouchers pv ON pv.id = l.voucher_id WHERE pv.status <> 'voided' GROUP BY l.scope, l.payroll_row_id HAVING count(*) > 1), 'no live payroll row covered twice');
END $$;
SELECT count(*) AS passed_assertions FROM assertions;
ROLLBACK;
