// Disposable PGlite: actual component migration, isolated existing salary-RPC
// schema. No network credentials, no production writes, no real vouchers.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
let checks = 0
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async sql => Object.values((await q(sql))[0])[0]
const check = (actual, expected = true) => { assert.deepEqual(actual, expected); checks++ }
const fail = async (sql, pattern) => {
  const before = await one('SELECT count(*) FROM payment_vouchers')
  await assert.rejects(() => q(sql), pattern)
  check(await one('SELECT count(*) FROM payment_vouchers'), before)
}
const staff = n => `20000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const row = n => `30000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const selections = (n, component, account = 'account_1', extra = {}) => JSON.stringify([{ payroll_row_id: row(n), component, account, ...extra }])
const rpc = (json, granularity = 'employee') => `SELECT create_payroll_disbursement_vouchers('2026-09-01','staff','2026-09-30','${granularity}',NULL,NULL,'${json}'::jsonb)`
try {
  await db.exec('CREATE ROLE authenticated; CREATE ROLE anon;')
  await db.exec(await readFile(new URL('../../supabase/migrations/20260911101500_payment_pv_employee_selection.sql', import.meta.url), 'utf8'))
  const fixture = await readFile(new URL('../../supabase/tests/payroll_disbursement_selection.sql', import.meta.url), 'utf8')
  await db.exec(fixture.slice(0, fixture.indexOf('SELECT pg_temp.assert_true((SELECT count(*) = 1')))
  await db.exec(`
    ALTER TABLE hr_monthly_payroll ADD COLUMN source text DEFAULT 'manual', ADD COLUMN status text DEFAULT 'submitted',
      ADD COLUMN payout_split_version smallint, ADD COLUMN basic_pay_net numeric, ADD COLUMN commission_balance numeric;
    ALTER TABLE hr_staff_costs ADD COLUMN bank_name text DEFAULT 'Maybank', ADD COLUMN bank_account_no text DEFAULT '1234567890',
      ADD COLUMN bank_name_2 text DEFAULT 'CIMB', ADD COLUMN bank_account_no_2 text DEFAULT '9876543210';
    ALTER TABLE payment_vouchers ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN approved_at timestamptz,
      ADD COLUMN payee_company_id uuid, ADD COLUMN target_pool text, ADD COLUMN notes text;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION payment_cycle(date) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('period',$1,'statutory_coverage','[]'::jsonb,'people',
      (SELECT jsonb_agg(jsonb_build_object('row_id',p.id,'scope','staff','name',s.employee_name,'dept_name','Finance','net',p.net))
      FROM hr_monthly_payroll p JOIN hr_staff_costs s ON s.id=p.staff_id WHERE p.period_month=$1)) $$;
    INSERT INTO payroll_payment_requests (payroll_run_id,period_month,status) VALUES ('50000000-0000-0000-0000-000000000001','2026-09-01','completed');
    UPDATE hr_monthly_payroll SET source='commission',payout_split_version=2,net=8556.15,basic_pay_net=4302.70,commission_balance=4253.45 WHERE id='${row(1)}';
    UPDATE hr_monthly_payroll SET source='commission',payout_split_version=2,net=10000,basic_pay_net=0,commission_balance=10000 WHERE id='${row(2)}';
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20260914030000_revenue_payment_components.sql', import.meta.url), 'utf8'))
  check(await one("SELECT count(*) FROM pg_proc WHERE proname='create_payroll_disbursement_vouchers'"), 1)
  await fail(rpc(selections(1,'basic','account_1',{expected_amount:5000})), /changed after preview/)
  await fail(rpc(selections(1,'basic','account_2',{expected_bank_account_no:'oldaccount'})), /changed after preview/)
  const first = await one(rpc(selections(1,'basic','account_2',{expected_amount:4302.7,expected_bank_name:'CIMB',expected_bank_account_no:'9876543210'})))
  check(first.count, 1); check(first.total,4302.7)
  const basic = await one(`SELECT voucher_id FROM payroll_voucher_lines WHERE payroll_row_id='${row(1)}'`)
  check(await one(`SELECT bank_account_no FROM payroll_voucher_lines WHERE voucher_id='${basic}'`),'9876543210')
  await q(`UPDATE hr_staff_costs SET bank_account_no_2='9999999999' WHERE id='${staff(1)}'`)
  check(await one(`SELECT bank_account_no FROM payroll_voucher_lines WHERE voucher_id='${basic}'`),'9876543210')
  await fail(rpc(selections(1,'basic')), /already has a PV/)
  await q(`UPDATE payment_vouchers SET status='paid' WHERE id='${basic}'`)
  check(await one(`SELECT status FROM hr_monthly_payroll WHERE id='${row(1)}'`),'submitted')
  const rest = await one(rpc(selections(1,'commission')))
  check(rest.total,4253.45)
  const commission = await one(`SELECT voucher_id FROM payroll_voucher_lines WHERE payroll_row_id='${row(1)}' AND salary_component='commission'`)
  await q(`UPDATE payment_vouchers SET status='paid' WHERE id='${commission}'`)
  check(await one(`SELECT status FROM hr_monthly_payroll WHERE id='${row(1)}'`),'paid')
  await q(`UPDATE payment_vouchers SET status='voided' WHERE id='${basic}'`)
  check(await one(`SELECT status FROM hr_monthly_payroll WHERE id='${row(1)}'`),'submitted')
  const regen = await one(rpc(selections(1,'basic')))
  check(regen.total,4302.7)
  await fail(`UPDATE payment_vouchers SET status='pending_approval' WHERE id='${basic}'`, /replacement PV/)
  await fail(`UPDATE payment_vouchers SET amount=1 WHERE id='${commission}'`, /amounts and employee coverage are fixed/)
  await fail(`UPDATE payment_vouchers SET payee_name='Other' WHERE id='${commission}'`, /amounts and employee coverage are fixed/)
  await fail(`UPDATE payment_voucher_sources SET amount=1 WHERE voucher_id='${commission}'`, /sources are fixed/)
  await fail(`DELETE FROM payroll_voucher_lines WHERE voucher_id='${commission}'`, /immutable/)
  await fail(`UPDATE payroll_voucher_lines SET bank_account_no='other' WHERE voucher_id='${commission}'`, /immutable/)
  await fail(`DELETE FROM payment_vouchers WHERE id='${basic}'`, /retain their employee payment audit/)
  await q(`UPDATE payment_vouchers SET notes='Reviewed' WHERE id='${commission}'`)
  check(await one(`SELECT notes FROM payment_vouchers WHERE id='${commission}'`),'Reviewed')
  await fail(rpc(selections(2,'basic')), /already has a PV/)
  check((await one(rpc(selections(2,'commission')))).total,10000)
  // Compiled vouchers are split by component, with the selected account per line.
  await q(`UPDATE hr_monthly_payroll SET source='commission',payout_split_version=2,net=1000,basic_pay_net=400,commission_balance=600 WHERE id IN ('${row(3)}','${row(4)}')`)
  const compiled = JSON.stringify([3,4].flatMap(n=>['basic','commission'].map(component=>({payroll_row_id:row(n),component,account:component==='basic'?'account_1':'account_2'}))))
  const dept = await one(rpc(compiled,'department'))
  check(dept.count,2); check(dept.people,2);check(dept.total,2000)
  check(await one(`SELECT count(*) FROM (SELECT voucher_id FROM payroll_voucher_lines WHERE payroll_row_id IN ('${row(3)}','${row(4)}') GROUP BY voucher_id HAVING count(DISTINCT salary_component)>1) x`),0)
  // A legacy whole-net voucher covers every component after an imported history refresh.
  await q(`UPDATE hr_monthly_payroll SET source='commission',payout_split_version=2,basic_pay_net=200,commission_balance=300 WHERE id='${row(5)}'`)
  await db.exec(`INSERT INTO payment_vouchers (id,reference_type,reference_id,status,amount) VALUES ('70000000-0000-0000-0000-000000000005','payroll_disbursement','${row(5)}','paid',500);
    INSERT INTO payroll_voucher_lines(voucher_id,payroll_row_id,scope,period_month,net) VALUES ('70000000-0000-0000-0000-000000000005','${row(5)}','staff','2026-09-01',500);`)
  await fail(rpc(selections(5,'basic')),/already has a PV/)
  await fail(rpc(selections(5,'commission')),/already has a PV/)
  check(await one(`SELECT count(*) FROM payroll_salary_coverage('2026-09-01') WHERE row_id='${row(5)}'`),2)
  // Missing explicit Account 2 never falls back, and invalid split never disappears.
  await q(`UPDATE hr_staff_costs SET bank_name_2=NULL,bank_account_no_2=NULL WHERE id='${staff(6)}'`)
  await fail(rpc(selections(6,'net','account_2')),/recipient account is missing/)
  await q(`UPDATE hr_monthly_payroll SET source='commission',payout_split_version=2,basic_pay_net=-10,commission_balance=610 WHERE id='${row(6)}'`)
  await fail(rpc(selections(6,'commission')),/Invalid Revenue payment split/)
  const cycle = await one("SELECT payment_cycle('2026-09-01')")
  const firstPerson = cycle.people.find(p=>p.row_id===row(1))
  check(firstPerson.components.length,2)
  check(firstPerson.voucher,null)
  check(firstPerson.components.find(c=>c.component==='commission').voucher.status,'paid')
  check(cycle.statutory_coverage,[])
  check(await one("SELECT has_function_privilege('authenticated','payroll_salary_coverage(date)','execute')"),false)
  console.log(`PASS ${checks} salary-component SQL checks`)
} finally { await db.close() }
