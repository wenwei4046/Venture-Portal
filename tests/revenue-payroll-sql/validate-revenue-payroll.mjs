// Disposable local PGlite only: actual monetary/submission migration, mocked
// surrounding schema and statutory schedules. No Supabase credentials or I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
let checks = 0
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const check = (actual, expected = true) => { assert.deepEqual(actual, expected); checks++ }
const reject = async (sql, pattern) => { await assert.rejects(() => q(sql), pattern); checks++ }
const principal = '10000000-0000-0000-0000-000000000001'
const revenue = '20000000-0000-0000-0000-000000000001'
const hr = '20000000-0000-0000-0000-000000000002'
const staff = '30000000-0000-0000-0000-000000000001'
const subdept = '40000000-0000-0000-0000-000000000001'
const run = '50000000-0000-0000-0000-000000000001'

try {
  await db.exec(`
    CREATE TYPE user_role AS ENUM ('principal','hr','finance');
    CREATE TABLE users (id uuid PRIMARY KEY, role user_role, is_active boolean);
    INSERT INTO users VALUES ('${principal}', 'principal', true);
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('test.caller',true),'')::uuid$$;
    CREATE FUNCTION current_user_role() RETURNS user_role LANGUAGE sql AS $$
      SELECT role FROM users WHERE id=auth.uid()$$;
    SELECT set_config('test.caller','${principal}',false);
    CREATE TABLE period_locks (period_month date,is_locked boolean);
    CREATE TABLE departments (id uuid PRIMARY KEY, name text, payroll_source text DEFAULT 'imported');
    INSERT INTO departments VALUES ('${revenue}','Revenue Department','commission'),('${hr}','HR','imported');
    CREATE TABLE hr_staff_costs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text,
      department_id uuid, hire_date date, resignation_date date,
      is_epf_exempt boolean DEFAULT false, epf_category text DEFAULT 'standard',
      socso_category text DEFAULT 'standard', pcb_category text DEFAULT 'standard',
      children_count integer DEFAULT 0, tax_mode text DEFAULT 'withholding',
      withholding_rate numeric DEFAULT 0.02
    );
    INSERT INTO hr_staff_costs (id,employee_name,department_id) VALUES ('${staff}','Revenue One','${revenue}');
    CREATE TABLE hr_monthly_payroll (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid, period_month date,
      basic_salary numeric(15,2) DEFAULT 0, statutory_allowance numeric(15,2) DEFAULT 0,
      non_statutory_allowance numeric(15,2) DEFAULT 0, ot_hours numeric(15,2) DEFAULT 0,
      ot_amount numeric(15,2) DEFAULT 0, commission_amount numeric(15,2) DEFAULT 0,
      unpaid_leave_days numeric(15,2) DEFAULT 0, deduction_amount numeric(15,2) DEFAULT 0,
      skbbk_amount numeric(15,2) DEFAULT 0, prorata_days_worked integer DEFAULT 0,
      prorata_days_in_month integer DEFAULT 0, epf_er numeric(15,2) DEFAULT 0,
      epf_ee numeric(15,2) DEFAULT 0, socso_er numeric(15,2) DEFAULT 0,
      socso_ee numeric(15,2) DEFAULT 0, eis_er numeric(15,2) DEFAULT 0,
      eis_ee numeric(15,2) DEFAULT 0, pcb numeric(15,2) DEFAULT 0,
      withholding_tax numeric(15,2) DEFAULT 0, gross numeric(15,2) DEFAULT 0,
      net numeric(15,2) DEFAULT 0, source text DEFAULT 'manual', status text DEFAULT 'draft',
      updated_at timestamptz DEFAULT now(), UNIQUE(staff_id,period_month)
    );
    CREATE FUNCTION lookup_epf(numeric,text) RETURNS TABLE(employer numeric,employee numeric)
      LANGUAGE sql AS $$SELECT round($1 * 0.13,2),round($1 * 0.11,2)$$;
    CREATE FUNCTION lookup_socso(numeric,text) RETURNS TABLE(employer numeric,employee numeric)
      LANGUAGE sql AS $$SELECT 10::numeric,5::numeric$$;
    CREATE FUNCTION lookup_eis(numeric) RETURNS TABLE(employer numeric,employee numeric)
      LANGUAGE sql AS $$SELECT 3::numeric,1::numeric$$;
    CREATE FUNCTION lookup_pcb(numeric,text,integer) RETURNS numeric
      LANGUAGE sql AS $$SELECT round(greatest($1,0) * 0.1,2)$$;
    CREATE TABLE payroll_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_month date, status text,
      marketing_opex_total numeric DEFAULT 0, hr_opex_total numeric DEFAULT 0,
      finance_opex_total numeric DEFAULT 0, director_salary_total numeric DEFAULT 0,
      director_office_total numeric DEFAULT 0, it_opex_total numeric DEFAULT 0,
      total_amount numeric GENERATED ALWAYS AS (marketing_opex_total + hr_opex_total
        + finance_opex_total + director_salary_total + director_office_total + it_opex_total) STORED,
      submitted_by uuid, submitted_at timestamptz, approved_at timestamptz
    );
    CREATE TABLE payroll_payment_requests (id uuid DEFAULT gen_random_uuid(), payroll_run_id uuid,
      requested_by uuid, amount numeric, target_pool text, status text);
    CREATE TABLE access_log (user_id uuid, resource_type text,resource_id text,action text,metadata jsonb);
    CREATE TABLE comm_sub_departments (id uuid PRIMARY KEY,name text);
    CREATE TABLE comm_runs (id uuid PRIMARY KEY,sub_department_id uuid,period_month date,status text);
    CREATE TABLE comm_statements (run_id uuid,staff_id uuid,total_commission numeric);
    INSERT INTO comm_sub_departments VALUES ('${subdept}','Fair');
    INSERT INTO hr_monthly_payroll (staff_id,period_month,basic_salary,commission_amount,gross,net,source,status)
      VALUES ('${staff}','2026-08-01',5000,10000,15000,14000,'commission','paid');
  `)
  const historical = await one("SELECT to_jsonb(h) FROM hr_monthly_payroll h WHERE period_month='2026-08-01'")
  await db.exec(await readFile(new URL('../../supabase/migrations/20260913010000_revenue_payroll_split.sql', import.meta.url), 'utf8'))
  check(await one("SELECT to_jsonb(h)-'commission_balance' FROM hr_monthly_payroll h WHERE period_month='2026-08-01'"), historical)
  check(await one("SELECT commission_balance IS NULL FROM hr_monthly_payroll WHERE period_month='2026-08-01'"))
  await reject(`INSERT INTO hr_monthly_payroll(staff_id,period_month,source,status)
    VALUES ('${staff}','2026-10-01','commission','paid')`, /must start as a draft/)
  await q("INSERT INTO period_locks VALUES ('2026-10-01',true)")
  await reject(`INSERT INTO hr_monthly_payroll(staff_id,period_month,source)
    VALUES ('${staff}','2026-10-01','commission')`, /accounting period.*locked/)
  await q('DELETE FROM period_locks')

  await q(`INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,commission_amount,source)
    VALUES ($1,'2026-09-01',5000,10000,'commission')`, [staff])
  const money = async (period = '2026-09-01') => (await q(`SELECT commission_amount,basic_salary,
    commission_balance,gross,net,epf_er,epf_ee,withholding_tax
    FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2`, [staff, period]))[0]
  check(await money(), { commission_amount:'10000.00', basic_salary:'5000.00', commission_balance:'3800.00',
    gross:'9350.00', net:'8607.00', epf_er:'650.00', epf_ee:'550.00', withholding_tax:'187.00' })

  // A statutory-only edit preserves explicit rates and updates its gross/tax/net.
  await q("UPDATE hr_monthly_payroll SET epf_er=600,epf_ee=500 WHERE period_month='2026-09-01'")
  check(await money(), { commission_amount:'10000.00', basic_salary:'5000.00', commission_balance:'3900.00',
    gross:'9400.00', net:'8706.00', epf_er:'600.00', epf_ee:'500.00', withholding_tax:'188.00' })
  await q("UPDATE hr_monthly_payroll SET skbbk_amount=77 WHERE period_month='2026-09-01'")
  await q("UPDATE hr_monthly_payroll SET epf_ee=600,net=99999,commission_balance=99999 WHERE period_month='2026-09-01'")
  check((await money()).net, '8480.00')
  check((await money()).commission_balance, '3750.00')

  // Ordinary earnings and net deductions retain their existing treatment.
  await q(`UPDATE hr_monthly_payroll SET statutory_allowance=100,non_statutory_allowance=50,
    ot_amount=20,deduction_amount=10 WHERE period_month='2026-09-01'`)
  check((await money()).gross, '9498.30') // 10000 - EPF ER(661.70) + 100 + 50 + 20 - 10
  check((await money()).commission_balance, '3778.40')
  await q(`UPDATE hr_monthly_payroll SET statutory_allowance=0,non_statutory_allowance=0,
    ot_amount=0,deduction_amount=0,skbbk_amount=0 WHERE period_month='2026-09-01'`)

  // A partial-month basic is withheld once; upstream commission remains full.
  await q("UPDATE hr_staff_costs SET hire_date='2026-09-16' WHERE id=$1", [staff])
  await q("UPDATE hr_monthly_payroll SET basic_salary=basic_salary WHERE period_month='2026-09-01'")
  check((await money()).commission_balance, '6900.00')
  check((await money()).gross, '9675.00')
  await q("UPDATE hr_staff_costs SET hire_date=NULL WHERE id=$1", [staff])
  await q("UPDATE hr_monthly_payroll SET basic_salary=0 WHERE period_month='2026-09-01'")
  check(await money(), { commission_amount:'10000.00', basic_salary:'0.00', commission_balance:'10000.00',
    gross:'10000.00', net:'9800.00', epf_er:'0.00', epf_ee:'0.00', withholding_tax:'200.00' })

  // Imported rows keep the established gross computation + verbatim override.
  await q(`INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,commission_amount,source)
    VALUES ($1,'2026-07-01',5000,10000,'imported')`, [staff])
  check((await money('2026-07-01')).gross, '15000.00')
  await q(`UPDATE hr_monthly_payroll SET gross=14990,net=12345,epf_er=333,epf_ee=222,
    withholding_tax=123,pcb=77 WHERE period_month='2026-07-01'`)
  check(await money('2026-07-01'), { commission_amount:'10000.00', basic_salary:'5000.00', commission_balance:null,
    gross:'14990.00', net:'12345.00', epf_er:'333.00', epf_ee:'222.00', withholding_tax:'123.00' })

  const submit = `SELECT submit_payroll_to_principal('2026-09-01','${principal}')`
  await q("SELECT set_config('test.caller','',false)")
  await reject(submit, /authenticated HR or Principal/)
  await q("SELECT set_config('test.caller',$1,false)", [principal])
  await q("INSERT INTO period_locks VALUES ('2026-09-01',true)")
  await reject(submit, /accounting period.*locked/)
  await q('DELETE FROM period_locks')
  await reject(submit, /does not match the synced commission calculation/)
  await q(`INSERT INTO comm_runs VALUES ($1,$2,'2026-09-01','computed')`, [run, subdept])
  await reject(submit, /Fair.*not synced/)
  await q("UPDATE comm_runs SET status='applied'")
  await q('INSERT INTO comm_statements VALUES ($1,$2,9999)', [run, staff])
  await reject(submit, /does not match the synced commission calculation/)
  await q('UPDATE comm_statements SET total_commission=10000')
  await q("INSERT INTO comm_statements VALUES ($1,'30000000-0000-0000-0000-000000000099',1)", [run])
  await reject(submit, /does not match the synced commission calculation/)
  await q("DELETE FROM comm_statements WHERE staff_id='30000000-0000-0000-0000-000000000099'")
  await q("UPDATE hr_monthly_payroll SET basic_salary=10000 WHERE period_month='2026-09-01'")
  check((await money()).commission_balance, '-2400.00')
  await reject(submit, /cannot fund the selected basic and EPF/)
  check(await one('SELECT count(*)::integer FROM payroll_runs'), 0)
  check(await one('SELECT count(*)::integer FROM payroll_payment_requests'), 0)
  await q("UPDATE hr_monthly_payroll SET basic_salary=5000 WHERE period_month='2026-09-01'")
  await q("UPDATE departments SET name='Revenue Renamed' WHERE id=$1", [revenue])
  const payrollRun = await one(submit)
  check(await one('SELECT revenue_opex_total::text FROM payroll_runs WHERE id=$1', [payrollRun]), '10013.00')
  check(await one('SELECT total_amount::text FROM payroll_runs WHERE id=$1', [payrollRun]), '10013.00')
  check(await one('SELECT amount::text FROM payroll_payment_requests WHERE payroll_run_id=$1', [payrollRun]), '10013.00')
  check(await one("SELECT status FROM hr_monthly_payroll WHERE period_month='2026-09-01'"), 'submitted')
  await reject(submit, /already submitted/)
  await reject(`INSERT INTO hr_monthly_payroll(staff_id,period_month,source)
    VALUES ('30000000-0000-0000-0000-000000000099','2026-09-01','commission')`, /already been submitted/)

  // A department becoming commission-owned must not force an old imported
  // month through Revenue recalculation merely because its registry changed.
  const importedRun = await one(`SELECT submit_payroll_to_principal('2026-07-01','${principal}')`)
  check(await one('SELECT total_amount::text FROM payroll_runs WHERE id=$1', [importedRun]), '15336.00')
  check((await money('2026-07-01')).net, '12345.00')

  // Preserve every imported/finalized row and an existing draft v1 snapshot.
  await q(`INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,commission_amount,source)
    VALUES ($1,'2026-06-01',5000,10000,'commission')`, [staff])
  const beforeV2 = await one('SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM hr_monthly_payroll h')
  await db.exec(await readFile(new URL('../../supabase/migrations/20260914010000_revenue_payroll_all_statutory.sql', import.meta.url), 'utf8'))
  check(await one(`SELECT jsonb_agg(to_jsonb(h)-ARRAY['payout_split_version','basic_pay_net','pcb_override_amount'] ORDER BY id)
    FROM hr_monthly_payroll h`), beforeV2)
  check(await one('SELECT bool_and(payout_split_version IS NULL AND basic_pay_net IS NULL) FROM hr_monthly_payroll'))
  await reject("UPDATE hr_monthly_payroll SET epf_er=1 WHERE period_month='2026-09-01'", /Finalized Revenue payroll/)
  await reject("UPDATE hr_monthly_payroll SET basic_salary=1 WHERE period_month='2026-08-01'", /Finalized Revenue payroll/)
  await q("UPDATE hr_monthly_payroll SET status='paid' WHERE period_month='2026-08-01'")
  check(await one("SELECT payout_split_version IS NULL FROM hr_monthly_payroll WHERE period_month='2026-08-01'"))

  // Statutory fixture: the 5,000 / 4,450 PCB band uses the actual live example.
  // Other bands deliberately remain synthetic so this is not a rates catalogue.
  await db.exec(`CREATE OR REPLACE FUNCTION lookup_socso(numeric,text)
    RETURNS TABLE(employer numeric,employee numeric) LANGUAGE sql AS $$SELECT 86.65::numeric,24.75::numeric$$;
    CREATE OR REPLACE FUNCTION lookup_eis(numeric)
    RETURNS TABLE(employer numeric,employee numeric) LANGUAGE sql AS $$SELECT 9.90::numeric,9.90::numeric$$;
    CREATE OR REPLACE FUNCTION lookup_pcb(numeric,text,integer) RETURNS numeric LANGUAGE sql AS $$
      SELECT CASE WHEN $1=4450 THEN 112.65 ELSE round(greatest($1,0)*0.1,2) END$$;`)
  await q("UPDATE hr_staff_costs SET tax_mode='pcb' WHERE id=$1", [staff])
  await q(`INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,commission_amount,source)
    VALUES ($1,'2026-10-01',5000,10000,'commission')`, [staff])
  const v2Money = async () => one(`SELECT jsonb_build_object('basic',basic_pay_net,'commission',commission_balance,
    'gross',gross,'net',net,'pcb',pcb,'override',pcb_override_amount,'version',payout_split_version)
    FROM hr_monthly_payroll WHERE period_month='2026-10-01'`)
  check(await v2Money(), { basic:4302.70,commission:4253.45,gross:9253.45,net:8556.15,pcb:112.65,override:null,version:2 })
  check(await one(`SELECT net+epf_ee+socso_ee+eis_ee+pcb+epf_er+socso_er+eis_er=commission_amount
    FROM hr_monthly_payroll WHERE period_month='2026-10-01'`))

  // A larger commission does not change PCB, which is now basic-only.
  await q("UPDATE hr_monthly_payroll SET commission_amount=12000 WHERE period_month='2026-10-01'")
  check((await v2Money()).pcb,112.65)
  check((await v2Money()).basic,4302.70)
  check((await v2Money()).commission,6253.45)

  // PCB editing changes the basic payment, never the residual commission twice.
  await q("UPDATE hr_monthly_payroll SET pcb=200,pcb_override_amount=200 WHERE period_month='2026-10-01'")
  check((await v2Money()).basic,4215.35)
  check((await v2Money()).commission,6253.45)
  await q("UPDATE hr_monthly_payroll SET commission_amount=10000,basic_salary=4500 WHERE period_month='2026-10-01'")
  check((await v2Money()).pcb,200)
  check((await v2Money()).override,200)
  await q("UPDATE hr_monthly_payroll SET basic_salary=5000,pcb_override_amount=NULL WHERE period_month='2026-10-01'")
  check((await v2Money()).pcb,112.65)
  check((await v2Money()).override,null)
  await q("UPDATE hr_monthly_payroll SET pcb=150 WHERE period_month='2026-10-01'")
  check((await v2Money()).override,150)
  await q("UPDATE hr_monthly_payroll SET commission_amount=10001 WHERE period_month='2026-10-01'")
  check((await v2Money()).pcb,150)
  await q("UPDATE hr_monthly_payroll SET commission_amount=10000,pcb_override_amount=NULL WHERE period_month='2026-10-01'")
  check((await v2Money()).pcb,112.65)

  // Employer SOCSO/EIS overrides are borne by commission; EE stays in basic.
  await q("UPDATE hr_monthly_payroll SET socso_er=100,eis_er=20 WHERE period_month='2026-10-01'")
  check((await v2Money()).commission,4230)
  check((await v2Money()).basic,4302.70)
  await q("UPDATE hr_monthly_payroll SET basic_salary=basic_salary WHERE period_month='2026-10-01'")

  // Allowances/OT, no-pay RM, withholding and SKBBK reconcile in the residual.
  await q("UPDATE hr_staff_costs SET tax_mode='withholding' WHERE id=$1", [staff])
  await q(`UPDATE hr_monthly_payroll SET statutory_allowance=100,non_statutory_allowance=50,
    ot_amount=20,deduction_amount=10,skbbk_amount=30 WHERE period_month='2026-10-01'`)
  check(await one(`SELECT basic_pay_net+commission_balance=net AND pcb=0 AND withholding_tax>0
    AND commission_balance=round(commission_amount-basic_salary-epf_er-socso_er-eis_er
      +statutory_allowance+non_statutory_allowance+ot_amount-deduction_amount-withholding_tax-skbbk_amount,2)
    FROM hr_monthly_payroll WHERE period_month='2026-10-01'`))
  await q("UPDATE hr_staff_costs SET tax_mode='pcb' WHERE id=$1", [staff])
  await q(`UPDATE hr_monthly_payroll SET statutory_allowance=0,non_statutory_allowance=0,
    ot_amount=0,deduction_amount=0,skbbk_amount=0,basic_salary=0 WHERE period_month='2026-10-01'`)
  check(await v2Money(), { basic:0,commission:10000,gross:10000,net:10000,pcb:0,override:null,version:2 })

  const v2Run = '50000000-0000-0000-0000-000000000002'
  await q("INSERT INTO comm_runs VALUES($1,$2,'2026-10-01','applied')", [v2Run,subdept])
  await q('INSERT INTO comm_statements VALUES($1,$2,10000)', [v2Run,staff])
  const submitV2 = `SELECT submit_payroll_to_principal('2026-10-01','${principal}')`
  await q("UPDATE hr_monthly_payroll SET basic_salary=10000 WHERE period_month='2026-10-01'")
  check((await v2Money()).commission,-1396.55)
  await reject(submitV2,/cannot fund the selected gross basic/)
  await q("UPDATE hr_monthly_payroll SET basic_salary=5000,pcb_override_amount=6000 WHERE period_month='2026-10-01'")
  check((await v2Money()).basic,-1584.65)
  await reject(submitV2,/net basic.*negative/)
  await q("UPDATE hr_monthly_payroll SET pcb_override_amount=NULL WHERE period_month='2026-10-01'")
  const v2Funding = await one(submitV2)
  check(Number(await one('SELECT total_amount FROM payroll_runs WHERE id=$1',[v2Funding])),10000)
  check(Number(await one('SELECT amount FROM payroll_payment_requests WHERE payroll_run_id=$1',[v2Funding])),10000)

  // An old draft cannot be submitted using the former payout interpretation.
  const legacyRun = '50000000-0000-0000-0000-000000000003'
  await q("INSERT INTO comm_runs VALUES($1,$2,'2026-06-01','applied')", [legacyRun,subdept])
  await q('INSERT INTO comm_statements VALUES($1,$2,10000)', [legacyRun,staff])
  await reject(`SELECT submit_payroll_to_principal('2026-06-01','${principal}')`,/does not match the synced commission calculation/)

  console.log(`Revenue payroll SQL: ${checks} checks passed (legacy + v2, disposable local PGlite).`)
} finally {
  await db.close()
}
