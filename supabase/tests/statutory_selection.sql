-- Disposable PostgreSQL/PGlite regression. This file intentionally refuses
-- any database with existing payroll tables. A runner applies the migration
-- at the marker below, then executes the remaining assertions. Never live DB.
DO $$ BEGIN
  IF to_regclass('public.payment_vouchers') IS NOT NULL OR to_regclass('public.hr_monthly_payroll') IS NOT NULL THEN
    RAISE EXCEPTION 'Statutory regression requires an empty disposable database';
  END IF;
END $$;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE WHEN current_setting('test.null_caller',true) = 'true' THEN NULL ELSE '00000000-0000-0000-0000-000000000001'::uuid END
$$;
CREATE FUNCTION current_user_role() RETURNS text LANGUAGE sql AS $$
  SELECT nullif(coalesce(current_setting('test.role',true),'hr'),'null')
$$;
CREATE FUNCTION current_permissions() RETURNS text[] LANGUAGE sql AS $$
  SELECT CASE WHEN current_setting('test.permissions',true)='null' THEN NULL
    ELSE string_to_array(coalesce(nullif(current_setting('test.permissions',true),''),'hr_costing'),',') END
$$;
CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = ANY(current_permissions()) $$;
CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql AS $$
  SELECT ('hr'=ANY($1) AND current_permissions() && ARRAY['hr_costing','team','revenue','director_salary'])
    OR ('treasury'=ANY($1) AND current_permissions() && ARRAY['treasury','reports','billing'])
$$;
CREATE TABLE departments(id uuid PRIMARY KEY,name text);
CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY,employee_name text,employee_code text,department_id uuid);
CREATE TABLE hr_monthly_payroll(id uuid PRIMARY KEY,staff_id uuid,period_month date,net numeric,
  epf_er numeric,epf_ee numeric,socso_er numeric,socso_ee numeric,eis_er numeric,eis_ee numeric,pcb numeric,skbbk_amount numeric);
CREATE TABLE director_monthly_payroll(id uuid PRIMARY KEY,period_month date,employee_name text,employee_code text,net numeric,
  epf_er numeric,epf_ee numeric,socso_er numeric,socso_ee numeric,eis_er numeric,eis_ee numeric,pcb numeric,skbbk_amount numeric);
CREATE TABLE payroll_runs(id uuid PRIMARY KEY,period_month date,status text);
CREATE TABLE payroll_payment_requests(id uuid DEFAULT gen_random_uuid(),payroll_run_id uuid,period_month date,status text,created_at timestamptz DEFAULT now());
CREATE TABLE bank_accounts(id uuid PRIMARY KEY,status text,gl_account_code text,is_primary boolean);
CREATE TABLE payment_vouchers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),voucher_no text UNIQUE,voucher_type text,direction text,status text,
  amount numeric(15,2),currency text,payee_name text,description text,payment_method text,payment_date date,source_pool text,
  bank_account_id uuid,reference_type text,reference_id uuid,created_by uuid);
CREATE TABLE payment_voucher_sources(voucher_id uuid REFERENCES payment_vouchers(id),pool text,amount numeric(15,2),account_code text);
CREATE TABLE approval_requests(request_type text,reference_id uuid,reference_table text,submitted_by uuid,description text,amount numeric(15,2),status text,workflow_state text,group_id uuid);
CREATE FUNCTION payment_cycle(date) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('period',$1) $$;

-- APPLY MIGRATION HERE

BEGIN;
CREATE TEMP TABLE assertions(name text);
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  INSERT INTO assertions VALUES(label);
END $$;
CREATE FUNCTION pg_temp.expect_error(sql text,expected_message text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE message text; before_count integer;
BEGIN
  SELECT count(*) INTO before_count FROM payment_vouchers;
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message = MESSAGE_TEXT; END;
  PERFORM pg_temp.assert_true(message LIKE '%' || expected_message || '%',label || ': expected rejection (' || coalesce(message,'none') || ')');
  PERFORM pg_temp.assert_true((SELECT count(*) FROM payment_vouchers) = before_count,label || ': atomic, no vouchers created');
END $$;
INSERT INTO departments VALUES('10000000-0000-0000-0000-000000000001','Finance'),('10000000-0000-0000-0000-000000000002','Marketing');
INSERT INTO hr_staff_costs SELECT ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'Employee ' || n,'E' || n,
  CASE WHEN n=5 THEN '10000000-0000-0000-0000-000000000002'::uuid ELSE '10000000-0000-0000-0000-000000000001'::uuid END FROM generate_series(1,6)n;
INSERT INTO hr_monthly_payroll SELECT ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'2026-09-01',CASE WHEN n=6 THEN 0 ELSE 1000 END,
  100,90,10,3,1,1,20,5 FROM generate_series(1,6)n;
INSERT INTO hr_monthly_payroll VALUES('30000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001','2026-08-01',1000,100,90,10,3,1,1,20,5);
INSERT INTO director_monthly_payroll VALUES('40000000-0000-0000-0000-000000000001','2026-09-01','Director A','D1',0,200,180,20,6,2,2,40,10);
INSERT INTO payroll_runs VALUES('50000000-0000-0000-0000-000000000001','2026-09-01','approved');
INSERT INTO bank_accounts VALUES('60000000-0000-0000-0000-000000000001','active','3010',true);

SELECT pg_temp.assert_true(NOT has_function_privilege('public','create_payroll_statutory_selection(date,text[],text,text,uuid,uuid[],date,numeric,integer)','execute'),'PUBLIC cannot generate');
SELECT pg_temp.assert_true(has_function_privilege('authenticated','create_payroll_statutory_selection(date,text[],text,text,uuid,uuid[],date,numeric,integer)','execute'),'authenticated selection RPC available');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','create_payroll_statutory_batch(date,text[],text,text,uuid,uuid[],date,uuid,numeric,integer)','execute'),'private batch writer inaccessible');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','payroll_statutory_coverage(date)','execute'),'private coverage reader inaccessible');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','payroll_statutory_voucher_lines','INSERT'),'direct contribution writes prohibited');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','department')$q$,'funding','funding gate');
INSERT INTO payroll_payment_requests(payroll_run_id,period_month,status) VALUES('50000000-0000-0000-0000-000000000001','2026-09-01','completed');
SET test.permissions = 'null';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'staff','department')$q$,'not permitted','NULL permission rejected');
SET test.role = 'hr'; SET test.permissions = 'none';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'staff','department')$q$,'not permitted','revoked HR permission rejected regardless of role');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_vouchers('2026-09-01','SOCSO')$q$,'not permitted','legacy writer also enforces revoked permission');
SET test.permissions = 'team';
SELECT pg_temp.assert_true(has_scope(ARRAY['hr']),'team permission really shares broad HR scope');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'staff','department')$q$,'not permitted','team-only user cannot generate payroll');
SET test.permissions = 'revenue';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'staff','department')$q$,'not permitted','revenue-only user cannot generate payroll');
SET test.permissions = 'reports';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_vouchers('2026-09-01','SOCSO')$q$,'not permitted','reports-only user cannot use legacy Finance writer');
SET test.role = 'dept_manager'; SET test.permissions = 'hr_costing'; SET test.null_caller = 'true';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'staff','department')$q$,'not permitted','anonymous rejected');
SET test.null_caller = 'false';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-02',ARRAY['SOCSO'],'staff','department')$q$,'payroll month','invalid month rejected');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','SOCSO'],'staff','department')$q$,'valid contribution schemes','duplicate schemes rejected');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO',NULL],'staff','department')$q$,'valid contribution schemes','NULL scheme rejected');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['wrong'],'staff','department')$q$,'valid contribution schemes','unknown scheme rejected');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'all','scheme')$q$,'department or employees','compatibility modes inaccessible via public selection RPC');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'staff','employee')$q$,'Select at least one','manual requires explicit selection');
UPDATE hr_monthly_payroll SET pcb=-5 WHERE id='30000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['PCB'],'staff','department')$q$,'Negative statutory','negative adjustment cannot silently inflate generated totals');
UPDATE hr_monthly_payroll SET pcb=20 WHERE id='30000000-0000-0000-0000-000000000001';
DO $$ DECLARE ids uuid[]; label text;
BEGIN
  FOR ids,label IN SELECT * FROM (VALUES
    (ARRAY['30000000-0000-0000-0000-000000000005']::uuid[],'another department'),
    (ARRAY['30000000-0000-0000-0000-000000000007']::uuid[],'another month'),
    (ARRAY['40000000-0000-0000-0000-000000000001']::uuid[],'another scope'),
    (ARRAY['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[],'unknown person'),
    (ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005']::uuid[],'mixed valid and invalid')) x(ids,label)
  LOOP
    PERFORM pg_temp.expect_error(format('SELECT create_payroll_statutory_selection(%L,ARRAY[%L,%L],%L,%L,%L,%L::uuid[])','2026-09-01','SOCSO','EIS','staff','employee','10000000-0000-0000-0000-000000000001',ids),'selection has changed',label);
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.fail_second_scheme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scheme = current_setting('test.fail_scheme',true) THEN RAISE EXCEPTION 'fixture write failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fixture_fail BEFORE INSERT ON payroll_statutory_voucher_lines FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_second_scheme();
SET test.fail_scheme='SOCSO';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','employee',NULL,ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])$q$,'fixture write failure','second scheme failure rolls back first scheme');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM payroll_statutory_voucher_lines) AND (SELECT count(*)=0 FROM approval_requests) AND (SELECT count(*)=0 FROM payment_voucher_sources),'failed batch leaves no orphan lines, approvals, or sources');
SET test.fail_scheme='';

-- Three employees × SOCSO and EIS = six PVs, institutions remain payees.
-- Role remains dept_manager with an explicit HR grant, proving permission
-- membership, not the legacy role label, controls successful generation.
SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','employee','10000000-0000-0000-0000-000000000001',
  ARRAY['30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003']::uuid[],'2026-10-15',45,6);
SELECT pg_temp.assert_true((SELECT count(*)=6 AND sum(amount)=45 FROM payment_vouchers),'three-person manual produces six correctly summed PVs');
SELECT pg_temp.assert_true((SELECT count(*)=6 FROM payroll_statutory_voucher_lines),'exact six contribution lines');
SELECT pg_temp.assert_true((SELECT bool_and(payee_name IN ('PERKESO (SOCSO)','PERKESO (EIS)') AND status='pending_approval' AND reference_type='payroll_statutory' AND payment_date='2026-10-15') FROM payment_vouchers),'institution payee and normal pending workflow');
SELECT pg_temp.assert_true((SELECT bool_and(pool='dept_pool_hr' AND account_code IN ('4072','4073')) FROM payment_voucher_sources),'unchanged HR custody and statutory accrual codes');
SELECT pg_temp.assert_true((SELECT count(DISTINCT group_id)=1 AND bool_and(status='pending' AND workflow_state='submitted') FROM approval_requests),'one atomic approval group');
SELECT pg_temp.expect_error($q$UPDATE payment_vouchers SET amount=1 WHERE voucher_no LIKE '%-0001'$q$,'financial fields are fixed','generic voucher editor cannot change covered amount');
SELECT pg_temp.expect_error($q$UPDATE payment_vouchers SET payee_name='Employee 1' WHERE voucher_no LIKE '%-0001'$q$,'financial fields are fixed','generic voucher editor cannot change institution payee');
SELECT pg_temp.expect_error($q$UPDATE payment_vouchers SET reference_type='expense' WHERE voucher_no LIKE '%-0001'$q$,'financial fields are fixed','generic voucher editor cannot detach payroll reference');
SELECT pg_temp.expect_error($q$UPDATE payment_voucher_sources SET pool='dept_pool_director' WHERE voucher_id=(SELECT id FROM payment_vouchers WHERE voucher_no LIKE '%-0001')$q$,'sources are fixed','generic editor cannot redirect HR custody');
SELECT pg_temp.expect_error($q$DELETE FROM payment_voucher_sources WHERE voucher_id=(SELECT id FROM payment_vouchers WHERE voucher_no LIKE '%-0001')$q$,'sources are fixed','generic editor cannot clear compiled sources');
SELECT pg_temp.expect_error($q$INSERT INTO payment_voucher_sources SELECT id,'dept_pool_hr',1,'4073' FROM payment_vouchers WHERE voucher_no LIKE '%-0001'$q$,'sources are fixed','cannot attach extra compiled source');
SELECT pg_temp.expect_error($q$UPDATE payroll_statutory_voucher_lines SET amount=1 WHERE scheme='EIS'$q$,'immutable voucher snapshot','coverage line snapshot cannot be rewritten');
UPDATE payment_vouchers SET payment_date='2026-10-14',description='Updated payment notes' WHERE voucher_no LIKE '%-0001';
SELECT pg_temp.assert_true((SELECT payment_date='2026-10-14' AND description='Updated payment notes' FROM payment_vouchers WHERE voucher_no LIKE '%-0001'),'date and notes remain editable');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(payment_cycle('2026-09-01')->'statutory_coverage')=6),'payment cycle returns precise coverage');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','employee',NULL,ARRAY['30000000-0000-0000-0000-000000000001']::uuid[])$q$,'selection has changed','duplicate manual selection');

-- The remaining department includes its zero-net employee, two PVs total.
SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','department','10000000-0000-0000-0000-000000000001',NULL,NULL,30,2);
SELECT pg_temp.assert_true((SELECT count(*)=8 AND sum(amount)=75 FROM payment_vouchers),'remaining department produces two PVs');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM payroll_statutory_voucher_lines WHERE payroll_row_id='30000000-0000-0000-0000-000000000006'),'zero-net employee contributions remain payable');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','department','10000000-0000-0000-0000-000000000001')$q$,'No uncovered','duplicate department selection');

-- Old Finance call picks up only uncovered Marketing + director SOCSO.
SET test.role='finance'; SET test.permissions='treasury';
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO'],'staff','department')$q$,'not permitted','HR selection endpoint requires HR permission');
SELECT create_payroll_statutory_vouchers('2026-09-01','SOCSO','2026-10-15');
SET test.role='dept_manager'; SET test.permissions='hr_costing';
SELECT pg_temp.assert_true((SELECT count(*)=9 AND sum(amount)=114 FROM payment_vouchers),'legacy generator cannot duplicate manual or department coverage');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM payment_voucher_sources WHERE pool='dept_pool_director') AND (SELECT sum(amount)=114 FROM payment_voucher_sources WHERE pool='dept_pool_hr'),'staff and directors both retain post-August HR custody');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM payroll_statutory_voucher_lines WHERE scope='directors' AND scheme='SOCSO'),'zero-net director is included');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','employee',NULL,ARRAY['30000000-0000-0000-0000-000000000005']::uuid[],NULL,15,2)$q$,'coverage changed','stale preview detects partial scheme coverage');

-- Existing SOCSO doesn't stop generating the same employee's missing EIS.
SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','employee',NULL,ARRAY['30000000-0000-0000-0000-000000000005']::uuid[],NULL,2,1);
SELECT pg_temp.assert_true((SELECT count(*)=10 AND sum(amount)=116 FROM payment_vouchers),'partial-scheme selection only generates uncovered EIS');

-- Voided coverage is immediately eligible, paid coverage is not.
UPDATE payment_vouchers SET status='voided' WHERE id=(SELECT voucher_id FROM payroll_statutory_voucher_lines WHERE payroll_row_id='30000000-0000-0000-0000-000000000001' AND scheme='SOCSO');
SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','employee',NULL,ARRAY['30000000-0000-0000-0000-000000000001']::uuid[],NULL,13,1);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM payroll_statutory_coverage('2026-09-01') WHERE row_id='30000000-0000-0000-0000-000000000001' AND scheme='SOCSO'),'voided PV regenerated once');
SELECT pg_temp.expect_error($q$UPDATE payment_vouchers SET status='pending_approval' WHERE status='voided'$q$,'cannot be restored','unvoid cannot duplicate regenerated coverage');
UPDATE payment_vouchers SET status='paid' WHERE status <> 'voided';
SELECT pg_temp.assert_true(NOT ((payment_cycle('2026-09-01')->'statutory_completion'->0->>'complete')::boolean),'many paid manual PVs do not falsely close a month with missing schemes');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['SOCSO','EIS'],'staff','department','10000000-0000-0000-0000-000000000001')$q$,'No uncovered','paid coverage never regenerated');

-- Historical staff-only voucher and subsequent director-only top-up.
INSERT INTO payment_vouchers(id,voucher_no,status,amount,payee_name,description,reference_type,reference_id)
VALUES('70000000-0000-0000-0000-000000000001','LEGACY-KWSP','paid',1140,'KWSP','KWSP payroll (staff)','payroll_statutory','50000000-0000-0000-0000-000000000001');
INSERT INTO payment_voucher_sources VALUES('70000000-0000-0000-0000-000000000001','dept_pool_hr',1140,'4071');
SELECT pg_temp.assert_true((SELECT count(*)=6 AND bool_and(scope='staff') FROM payroll_statutory_coverage('2026-09-01') WHERE scheme='KWSP'),'historical staff-only coverage excludes directors');
SELECT create_payroll_statutory_director_topup('2026-09-01','KWSP');
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM payroll_statutory_coverage('2026-09-01') WHERE scheme='KWSP'),'director-only top-up closes remaining coverage');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_director_topup('2026-09-01','KWSP')$q$,'No uncovered','top-up deduplicates with new lines');

-- Both historical pool models: old director-only EIS drains Director, newer
-- director-only SKBBK and combined PCB drain HR. Labels separate the scopes.
INSERT INTO payment_vouchers(id,voucher_no,status,amount,payee_name,description,reference_type,reference_id) VALUES
 ('70000000-0000-0000-0000-000000000002','LEGACY-EIS-DIR','paid',4,'PERKESO (EIS)','EIS payroll (directors)','payroll_statutory','50000000-0000-0000-0000-000000000001'),
 ('70000000-0000-0000-0000-000000000003','LEGACY-SKBBK-DIR-HR','paid',10,'SKBBK','SKBBK payroll (directors)','payroll_statutory','50000000-0000-0000-0000-000000000001'),
 ('70000000-0000-0000-0000-000000000004','LEGACY-PCB-COMBINED-HR','paid',160,'LHDN','LHDN payroll (staff + directors)','payroll_statutory','50000000-0000-0000-0000-000000000001');
INSERT INTO payment_voucher_sources VALUES
 ('70000000-0000-0000-0000-000000000002','dept_pool_director',4,'4073'),
 ('70000000-0000-0000-0000-000000000003','dept_pool_hr',10,'4072'),
 ('70000000-0000-0000-0000-000000000004','dept_pool_hr',120,'4074'),
 ('70000000-0000-0000-0000-000000000004','dept_pool_hr',40,'4074');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(scope='directors') FROM payroll_statutory_coverage('2026-09-01') WHERE voucher_id='70000000-0000-0000-0000-000000000002'),'old Director-pool top-up coverage recognized');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(scope='directors') FROM payroll_statutory_coverage('2026-09-01') WHERE scheme='SKBBK'),'new HR-pool top-up covers directors only');
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM payroll_statutory_coverage('2026-09-01') WHERE scheme='PCB'),'new HR-pool combined legacy voucher covers staff and directors');
SELECT pg_temp.expect_error($q$SELECT create_payroll_statutory_selection('2026-09-01',ARRAY['PCB'],'directors','department')$q$,'No uncovered','cannot regenerate directors on existing HR-pool combined voucher');
SELECT create_payroll_statutory_vouchers('2026-09-01','SKBBK');
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM payroll_statutory_coverage('2026-09-01') WHERE scheme='SKBBK'),'legacy wrapper fills staff after an HR-pool director top-up without duplicates');
UPDATE payment_vouchers SET status='paid' WHERE status<>'voided';
SELECT pg_temp.assert_true((payment_cycle('2026-09-01')->'statutory_completion'->0->>'complete')::boolean,'month closes only after all positive contributions are covered by paid PVs');
SELECT pg_temp.assert_true((SELECT bool_and(v.amount=(SELECT sum(l.amount) FROM payroll_statutory_voucher_lines l WHERE l.voucher_id=v.id)) FROM payment_vouchers v WHERE EXISTS(SELECT 1 FROM payroll_statutory_voucher_lines l WHERE l.voucher_id=v.id)),'every generated PV matches its immutable contribution lines');
SELECT pg_temp.assert_true((SELECT bool_and(v.amount=(SELECT sum(s.amount) FROM payment_voucher_sources s WHERE s.voucher_id=v.id)) FROM payment_vouchers v),'every PV source total reconciles');

SELECT count(*) AS assertions_passed FROM assertions;
ROLLBACK;
