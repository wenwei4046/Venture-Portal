import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const db=new PGlite({extensions:{btree_gist}})
const principal='10000000-0000-4000-8000-000000000001',dept='10000000-0000-4000-8000-000000000002'
const first='10000000-0000-4000-8000-000000000011',second='10000000-0000-4000-8000-000000000012'
let checks=0
const q=async(sql,p=[]) => (await db.query(sql,p)).rows
const one=async(sql,p=[]) => Object.values((await q(sql,p))[0])[0]
const check=(value,expected=true)=>{assert.deepEqual(value,expected);checks++}
const reject=async(sql,p=[],pattern=/access|permission|not found|not enabled|not addressed/i)=>{await assert.rejects(()=>q(sql,p),pattern);checks++}
async function migrate(name){await db.exec(await readFile(new URL(`${name}.sql`, migrations),'utf8'));console.log('Applied',name)}
async function asUser(id,owner=false){await db.exec(owner?'RESET ROLE':'SET ROLE authenticated');await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await q("SELECT set_config('request.jwt.claim.role','authenticated',false)");}
async function legacyFunction(file,name){const sql=await readFile(new URL(`${file}.sql`, migrations),'utf8');const start=sql.indexOf(`create or replace function public.${name}(`);assert(start>=0);const end=sql.indexOf('$$;',sql.indexOf('as $$',start))+3;await db.exec(sql.slice(start,end));}
try{
 await db.exec(`CREATE EXTENSION btree_gist; CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')::text$$;
 CREATE TYPE user_role AS ENUM('principal','finance','hr','dept_manager');
 CREATE TABLE users(id uuid PRIMARY KEY,email text,name text,role user_role NOT NULL DEFAULT 'principal',is_active boolean NOT NULL DEFAULT true);
 INSERT INTO users VALUES('${principal}','principal@example.com','Principal','principal',true);
 CREATE FUNCTION current_user_role() RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT role FROM users WHERE id=auth.uid()$$;
 CREATE FUNCTION has_scope(text[]) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE TABLE departments(id uuid PRIMARY KEY,name text);INSERT INTO departments VALUES('${dept}','Revenue Department');
 CREATE TABLE titles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),department_id uuid,name text,is_active boolean DEFAULT true);
 INSERT INTO titles(department_id,name) SELECT '${dept}',n FROM unnest(ARRAY['Revenue Specialist','Senior Revenue Specialist','Team Assistant','Senior Team Assistant','Team Leader','Senior Team Leader']) n;
 CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_name text,employee_code text,user_id uuid UNIQUE REFERENCES users(id),department_id uuid,
 title_id uuid,designation text,reports_to uuid,status text DEFAULT 'active',hire_date date,resignation_date date,basic_salary numeric DEFAULT 0,
 allowances numeric DEFAULT 0,non_statutory_allowance numeric DEFAULT 0,employment_type text,tax_mode text,withholding_rate numeric,contact_number text,created_by uuid);
 CREATE TABLE commission_rules(id uuid);CREATE TABLE commission_inputs(id uuid);
 CREATE TYPE hr_monthly_payroll_source AS ENUM('imported','manual','carried_forward');
 CREATE TABLE payroll_runs(id uuid,period_month date,status text);
 CREATE TABLE hr_monthly_payroll(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid,period_month date,commission_amount numeric DEFAULT 0,source hr_monthly_payroll_source,status text DEFAULT 'draft',created_by uuid,updated_at timestamptz,UNIQUE(staff_id,period_month));
 CREATE TYPE claim_type AS ENUM('project','benefit');CREATE TYPE claim_status AS ENUM('pending','approved','rejected','paid');
 CREATE TABLE claims(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),claim_type claim_type,claimant_name text,department_id uuid,amount numeric NOT NULL CHECK(amount>0),description text,receipt_url text,status claim_status DEFAULT 'pending',source_pool text,created_by uuid);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;GRANT USAGE ON SCHEMA storage,auth TO authenticated;
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 `)
 await asUser(principal,true)
 for(const name of ['20260831010000_revenue_commission_foundation','20260831030000_commission_run_snapshot','20260831040000_commission_run_rpcs','20260903030000_rank_title_ratchet','20260903040000_personal_sales_streak_gate','20260905010000_rank_letters','20260905060000_rank_catalog','20260905010000_erp_live_sync'])await migrate(name)
 await db.exec(`ALTER TABLE comm_hierarchy ADD COLUMN title_id uuid REFERENCES titles(id);
 ALTER TABLE comm_hierarchy DROP CONSTRAINT one_position_at_a_time;ALTER TABLE comm_hierarchy ADD CONSTRAINT one_position_per_scheme EXCLUDE USING gist(scheme_id WITH =,staff_id WITH =,daterange(effective_from,effective_to,'[]') WITH &&);
 CREATE FUNCTION comm_period_start() RETURNS date LANGUAGE sql STABLE AS $$SELECT date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date$$;
 CREATE FUNCTION comm_scheme_for_department(uuid) RETURNS uuid LANGUAGE sql AS $$SELECT c.id FROM comm_schemes c JOIN comm_sub_departments d ON d.id=c.sub_department_id WHERE d.department_id=$1 ORDER BY d.created_at,d.id LIMIT 1$$;`)
 for(const name of ['20260911010000_commission_rank_packages','20260911020000_commission_order_sub_departments','20260911030000_ir_group_incentives','20260911040000_commission_direct_line_limits','20260911060000_progressive_ir_direct_lines','20260901040000_permission_catalog'])await migrate(name)

 await db.exec('ALTER TABLE hr_monthly_payroll ADD COLUMN basic_salary numeric NOT NULL DEFAULT 0; CREATE TABLE payroll_payment_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payroll_run_id uuid,status text); CREATE TABLE payment_vouchers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reference_type text,reference_id uuid,status text); CREATE TABLE payroll_voucher_lines(voucher_id uuid,period_month date,scope text); CREATE TABLE period_locks(period_month date,is_locked boolean);');
 // Exercise the actual money trigger together with the actual sync RPCs.
 // Only statutory schedules and unrelated accounting tables remain fixtures.
 await db.exec(`
 ALTER TABLE hr_staff_costs ADD COLUMN is_epf_exempt boolean DEFAULT false,
   ADD COLUMN epf_category text DEFAULT 'standard', ADD COLUMN socso_category text DEFAULT 'standard',
   ADD COLUMN pcb_category text DEFAULT 'standard', ADD COLUMN children_count integer DEFAULT 0;
 ALTER TABLE hr_staff_costs ALTER COLUMN tax_mode SET DEFAULT 'withholding';
 ALTER TABLE hr_staff_costs ALTER COLUMN withholding_rate SET DEFAULT 0.02;
 ALTER TABLE hr_monthly_payroll ADD COLUMN statutory_allowance numeric(15,2) DEFAULT 0,
   ADD COLUMN non_statutory_allowance numeric(15,2) DEFAULT 0, ADD COLUMN ot_hours numeric(15,2) DEFAULT 0,
   ADD COLUMN ot_amount numeric(15,2) DEFAULT 0, ADD COLUMN unpaid_leave_days numeric(15,2) DEFAULT 0,
   ADD COLUMN deduction_amount numeric(15,2) DEFAULT 0, ADD COLUMN skbbk_amount numeric(15,2) DEFAULT 0,
   ADD COLUMN prorata_days_worked integer DEFAULT 0, ADD COLUMN prorata_days_in_month integer DEFAULT 0,
   ADD COLUMN epf_er numeric(15,2) DEFAULT 0, ADD COLUMN epf_ee numeric(15,2) DEFAULT 0,
   ADD COLUMN socso_er numeric(15,2) DEFAULT 0, ADD COLUMN socso_ee numeric(15,2) DEFAULT 0,
   ADD COLUMN eis_er numeric(15,2) DEFAULT 0, ADD COLUMN eis_ee numeric(15,2) DEFAULT 0,
   ADD COLUMN pcb numeric(15,2) DEFAULT 0, ADD COLUMN withholding_tax numeric(15,2) DEFAULT 0,
   ADD COLUMN gross numeric(15,2) DEFAULT 0, ADD COLUMN net numeric(15,2) DEFAULT 0;
 ALTER TABLE payroll_runs ALTER COLUMN id SET DEFAULT gen_random_uuid();
 ALTER TABLE payroll_runs ADD COLUMN marketing_opex_total numeric DEFAULT 0,
   ADD COLUMN hr_opex_total numeric DEFAULT 0, ADD COLUMN finance_opex_total numeric DEFAULT 0,
   ADD COLUMN director_salary_total numeric DEFAULT 0, ADD COLUMN director_office_total numeric DEFAULT 0,
   ADD COLUMN it_opex_total numeric DEFAULT 0, ADD COLUMN submitted_by uuid,
   ADD COLUMN submitted_at timestamptz, ADD COLUMN approved_at timestamptz;
 ALTER TABLE payroll_runs ADD COLUMN total_amount numeric GENERATED ALWAYS AS (
   marketing_opex_total + hr_opex_total + finance_opex_total + director_salary_total + director_office_total + it_opex_total) STORED;
 ALTER TABLE payroll_payment_requests ADD COLUMN requested_by uuid, ADD COLUMN amount numeric, ADD COLUMN target_pool text;
 CREATE TABLE access_log(user_id uuid,resource_type text,resource_id text,action text,metadata jsonb);
 CREATE FUNCTION lookup_epf(numeric,text) RETURNS TABLE(employer numeric,employee numeric)
   LANGUAGE sql AS $$SELECT round($1 * 0.13,2),round($1 * 0.11,2)$$;
 CREATE FUNCTION lookup_socso(numeric,text) RETURNS TABLE(employer numeric,employee numeric)
   LANGUAGE sql AS $$SELECT 10::numeric,5::numeric$$;
 CREATE FUNCTION lookup_eis(numeric) RETURNS TABLE(employer numeric,employee numeric)
   LANGUAGE sql AS $$SELECT 3::numeric,1::numeric$$;
 CREATE FUNCTION lookup_pcb(numeric,text,integer) RETURNS numeric
   LANGUAGE sql AS $$SELECT 0::numeric$$;
 `);
 await migrate('20260913010000_revenue_payroll_split');
 await migrate('20260913020000_revenue_payroll_sync');
 const period='2026-09-01';
 const fair=await one("SELECT id FROM comm_sub_departments WHERE code='FAIR'");
 const scheme=await one('SELECT id FROM comm_schemes WHERE sub_department_id=$1',[fair]);
 const rankRows=await q('SELECT id,title_id,rank_key FROM comm_ranks WHERE scheme_id=$1 ORDER BY sort_order',[scheme]);
 const staff1=await one("INSERT INTO hr_staff_costs(employee_name,department_id,title_id,basic_salary) VALUES('With Basic',$1,$2,5000) RETURNING id",[dept,rankRows[0].title_id]);
 const staff2=await one("INSERT INTO hr_staff_costs(employee_name,department_id,title_id,basic_salary) VALUES('Full Commission',$1,$2,0) RETURNING id",[dept,rankRows[0].title_id]);
 for(const staff of [staff1,staff2]) await q('INSERT INTO comm_hierarchy(scheme_id,staff_id,rank_id,title_id,effective_from) VALUES($1,$2,$3,$4,$5)',[scheme,staff,rankRows[0].id,rankRows[0].title_id,period]);
 async function batch(sub=fair,month=period){return one("INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES($1,$2,'fixture','committed') RETURNING id",[sub,month]);}
 async function order(batchId,month=period,no='SYNC-ORDER',staff=staff1){const id=await one("INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance) VALUES($1,$2,$3,$2,$2,'Agent','AGENT',$4,100000,0) RETURNING id",[batchId,month,no,staff]);return {order_id:id,order_no:no,staff_id:staff,order_period_month:month,product_revenue:100000};}
 function statement(staff,amount,title=null){return {staff_id:staff,rank_title_id:title,base_rank_key:'rs_5',rank_key:'rs_5',rate_mode:'variable',product_rate:0.05,product_revenue:amount*20,product_commission:amount,total_commission:amount,lines:[{component:'product_revenue',basis_amount:amount*20,rate:0.05,amount}]};}
 async function save({month=period,sub=fair,rule=scheme,batchId,statements,warnings=[],released=[]}){return one('SELECT save_commission_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[month,sub,rule,batchId,statements.reduce((sum,s)=>sum+s.total_commission,0),JSON.stringify(warnings),JSON.stringify(statements),JSON.stringify(released),'[]','[]']);}
 const firstBatch=await batch();const firstOrder=await order(firstBatch);
 const initial={batchId:firstBatch,statements:[statement(staff1,10000,rankRows[1].title_id),statement(staff2,3000)],released:[firstOrder]};
 const firstRun=await save(initial);
 check(await one('SELECT status FROM comm_runs WHERE id=$1',[firstRun]),'applied');
 check(Number(await one('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),10000);
 check(Number(await one('SELECT basic_salary FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),5000);
 check(Number(await one('SELECT basic_salary FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff2,period])),0);
 check(await one(`SELECT jsonb_build_object('balance',commission_balance,'gross',gross,'net',net,
   'epfEr',epf_er,'epfEe',epf_ee) FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2`,[staff1,period]),
   {balance:3800,gross:9350,net:8607,epfEr:650,epfEe:550});
 check(await one(`SELECT jsonb_build_object('balance',commission_balance,'gross',gross,'net',net)
   FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2`,[staff2,period]),
   {balance:3000,gross:3000,net:2940});
 check(await one('SELECT source FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period]),'commission');
 check(Number(await one('SELECT count(*) FROM comm_order_releases WHERE run_id=$1',[firstRun])),1);
 check(await one('SELECT title_id FROM hr_staff_costs WHERE id=$1',[staff1]),rankRows[1].title_id);
 check(Number(await one('SELECT count(*) FROM comm_title_promotions WHERE run_id=$1',[firstRun])),1);
 await assert.rejects(()=>save(initial),/reopen.*before recomputing/i);checks++;
 await q('UPDATE hr_monthly_payroll SET basic_salary=4500 WHERE staff_id=$1 AND period_month=$2',[staff1,period]);
 await q('SELECT reopen_commission_run($1)',[firstRun]);
 check(Number(await one('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),0);
 check(Number(await one('SELECT basic_salary FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),4500);
 check(Number(await one('SELECT commission_balance FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),-5580);
 check(Number(await one('SELECT count(*) FROM comm_order_releases WHERE run_id=$1',[firstRun])),0);
 check(await one('SELECT title_id FROM hr_staff_costs WHERE id=$1',[staff1]),rankRows[1].title_id);
 const next={...initial,statements:[statement(staff1,6000),statement(staff2,3000)]};
 check(await save(next),firstRun);
 check(Number(await one('SELECT basic_salary FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),4500);
 const ir=await one("INSERT INTO comm_sub_departments(department_id,name,code) VALUES($1,'IR','IR') RETURNING id",[dept]);
 const irScheme=await one("INSERT INTO comm_schemes(sub_department_id,scheme_name,effective_from) VALUES($1,'IR fixture',$2) RETURNING id",[ir,period]);
 const irBatch=await batch(ir);const irOrder=await order(irBatch);
 const irRun=await save({sub:ir,rule:irScheme,batchId:irBatch,statements:[statement(staff1,1500)],released:[irOrder]});
 check(Number(await one('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),7500);
 check(Number(await one('SELECT count(*) FROM comm_order_releases WHERE order_no=$1',['SYNC-ORDER'])),2);
 await q("UPDATE comm_runs SET status='locked' WHERE id=$1",[irRun]);
 await q('SELECT reopen_commission_run($1)',[firstRun]);
 check(Number(await one('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),1500);
 await save({...next,statements:[statement(staff1,7000),statement(staff2,3000)]});
 check(Number(await one('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),8500);
 check(Number(await one('SELECT commission_balance FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),2920);
 check(Number(await one('SELECT basic_salary FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),4500);
 const october='2026-10-01',octBatch=await batch(fair,october),octOrder=await order(octBatch,october,'OCT-ORDER');
 const warningPayload={month:october,batchId:octBatch,statements:[statement(staff1,300)],released:[octOrder],warnings:['Unclassified item']};
 const warningRun=await save(warningPayload);
 check(await one('SELECT status FROM comm_runs WHERE id=$1',[warningRun]),'computed');
 check(Number(await one('SELECT count(*) FROM hr_monthly_payroll WHERE period_month=$1',[october])),0);
 check(Number(await one('SELECT count(*) FROM comm_order_releases WHERE run_id=$1',[warningRun])),0);
 await reject('SELECT apply_commission_run($1)',[warningRun],/unresolved warning/);
 check(await save({...warningPayload,warnings:[]}),warningRun);
 check(Number(await one('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,october])),300);
 const november='2026-11-01',novBatch=await batch(fair,november);
 await q("INSERT INTO hr_monthly_payroll(staff_id,period_month,commission_amount,basic_salary,source) VALUES($1,$2,1234,6789,'imported')",[staff1,november]);
 await assert.rejects(()=>save({month:november,batchId:novBatch,statements:[statement(staff1,9000)]}),/imported payroll row/);checks++;
 check(Number(await one('SELECT count(*) FROM comm_runs WHERE period_month=$1',[november])),0);
 check((await q('SELECT commission_amount,basic_salary,source FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,november]))[0],{commission_amount:'1234',basic_salary:'6789',source:'imported'});
 const runId='20000000-0000-4000-8000-000000000001';
 for(const state of ['submitted','approved','paid']){
   await q('INSERT INTO payroll_runs(id,period_month,status) VALUES($1,$2,$3)',[runId,period,state]);
   await reject('SELECT reopen_commission_run($1)',[firstRun],/already been submitted/);
   await q('DELETE FROM payroll_runs WHERE id=$1',[runId]);
 }
 await q("INSERT INTO payroll_runs(id,period_month,status) VALUES($1,$2,'rejected')",[runId,period]);
 const request=await one("INSERT INTO payroll_payment_requests(payroll_run_id,status) VALUES($1,'completed') RETURNING id",[runId]);
 await reject('SELECT reopen_commission_run($1)',[firstRun],/funding or a payment voucher/);
 await q("UPDATE payroll_payment_requests SET status='cancelled' WHERE id=$1",[request]);
 const fundingPV=await one("INSERT INTO payment_vouchers(reference_type,reference_id,status) VALUES('payroll_payment_request',$1,'paid') RETURNING id",[request]);
 await reject('SELECT reopen_commission_run($1)',[firstRun],/funding or a payment voucher/);
 await q("UPDATE payment_vouchers SET status='voided' WHERE id=$1",[fundingPV]);
 const payrollId=await one('SELECT id FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period]);
 const salaryPV=await one("INSERT INTO payment_vouchers(reference_type,reference_id,status) VALUES('payroll_disbursement',$1,'pending_approval') RETURNING id",[payrollId]);
 await reject('SELECT reopen_commission_run($1)',[firstRun],/salary payment vouchers/);
 await q('UPDATE payment_vouchers SET reference_id=$1 WHERE id=$2',[dept,salaryPV]);
 await q("INSERT INTO payroll_voucher_lines(voucher_id,period_month,scope) VALUES($1,$2,'staff')",[salaryPV,period]);
 await reject('SELECT reopen_commission_run($1)',[firstRun],/salary payment vouchers/);
 await q("UPDATE payment_vouchers SET status='voided' WHERE id=$1",[salaryPV]);
 await q('SELECT reopen_commission_run($1)',[firstRun]);
 check(Number(await one('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period])),1500);
 await q("UPDATE hr_monthly_payroll SET status='submitted' WHERE id=$1",[payrollId]);
 await assert.rejects(()=>save(next),/no longer draft/);checks++;
 check(await one('SELECT status FROM comm_runs WHERE id=$1',[firstRun]),'draft');
 check(Number(await one('SELECT total_commission FROM comm_statements WHERE run_id=$1 AND staff_id=$2',[firstRun,staff1])),7000);
 await q("UPDATE hr_monthly_payroll SET status='draft' WHERE id=$1",[payrollId]);
 const broken={...next,statements:[{...statement(staff1,999),lines:[{component:'product_revenue',amount:123}]}]};
 await assert.rejects(()=>save(broken),/does not tally/);checks++;
 check(Number(await one('SELECT total_commission FROM comm_statements WHERE run_id=$1 AND staff_id=$2',[firstRun,staff1])),7000);
 // Failed late apply must roll back statements, releases and payroll together.
 const badStaff=await one("INSERT INTO hr_staff_costs(employee_name,department_id,basic_salary) VALUES('Other Department',NULL,0) RETURNING id");
 await assert.rejects(()=>save({...next,statements:[statement(badStaff,777)]}),/another payroll department/);checks++;
 check(Number(await one('SELECT count(*) FROM comm_statements WHERE run_id=$1',[firstRun])),2);
 await q('INSERT INTO period_locks(period_month,is_locked) VALUES($1,true)',[period]);
 await assert.rejects(()=>save(next),/accounting period/);checks++;
 await q('DELETE FROM period_locks');
 await q("UPDATE users SET role='finance' WHERE id=$1",[principal]);
 await assert.rejects(()=>save(next),/Only Principal or HR/);checks++;
 await q("UPDATE users SET role='principal' WHERE id=$1",[principal]);

 // Simulate a skipped write, as happens when a conflict row no longer passes
 // the safe-write predicate. The row-count guard must roll back the full save.
 await db.exec(`CREATE FUNCTION test_skip_sync_write() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
   IF NEW.staff_id='${staff1}'::uuid AND NEW.period_month='${period}'::date THEN
     RETURN NULL;
   END IF;
   RETURN NEW;
 END $$;
 CREATE TRIGGER zz_test_skip_sync_write BEFORE INSERT ON hr_monthly_payroll
   FOR EACH ROW EXECUTE FUNCTION test_skip_sync_write();`);
 await assert.rejects(()=>save(next),/changed status or source during commission sync/);checks++;
 check(await one('SELECT source FROM hr_monthly_payroll WHERE id=$1',[payrollId]),'commission');
 check(await one('SELECT status FROM comm_runs WHERE id=$1',[firstRun]),'draft');
 await db.exec('DROP TRIGGER zz_test_skip_sync_write ON hr_monthly_payroll; DROP FUNCTION test_skip_sync_write();');

 // A zero statement is still a synced salary row; an unlinked reopened row
 // may be removed, but only while its payroll/accounting period stays open.
 const december='2026-12-01',decBatch=await batch(fair,december);
 const decRun=await save({month:december,batchId:decBatch,statements:[statement(staff1,0),statement(staff2,0)]});
 await reject('DELETE FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff2,december],/linked to synced Revenue commission/);
 await q('SELECT reopen_commission_run($1)',[decRun]);
 await q('DELETE FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff2,december]);
 check(Number(await one('SELECT count(*) FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff2,december])),0);
 await q('INSERT INTO period_locks VALUES($1,true)',[december]);
 await reject('DELETE FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,december],/accounting period/);
 await q('DELETE FROM period_locks WHERE period_month=$1',[december]);
 const decPayroll=await one("INSERT INTO payroll_runs(period_month,status) VALUES($1,'approved') RETURNING id",[december]);
 await reject('DELETE FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,december],/already been submitted/);
 await q('DELETE FROM payroll_runs WHERE id=$1',[decPayroll]);
 await q('DELETE FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,november]);
 check(Number(await one('SELECT count(*) FROM hr_monthly_payroll WHERE period_month=$1',[november])),0);

 // Full integration: a clean calculation funds Finance exactly once, using
 // the actual money trigger's self-funded basic and sibling-run commission.
 await save(next);
 const fundedRun=await one('SELECT submit_payroll_to_principal($1,$2)',[period,principal]);
 check(Number(await one('SELECT total_amount FROM payroll_runs WHERE id=$1',[fundedRun])),10513);
 check(Number(await one('SELECT amount FROM payroll_payment_requests WHERE payroll_run_id=$1',[fundedRun])),10513);
 await reject('SELECT reopen_commission_run($1)',[firstRun],/already been submitted/);
 console.log('PASS: '+checks+' Revenue payroll sync SQL checks. Disposable auth/statutory fixtures; actual money trigger, save/apply/reopen, submit and guards. No live database connection.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,detail:error.detail,query:error.query,stack:error.name==='AssertionError'?error.stack:undefined},null,2));process.exitCode=1}finally{await db.close()}
