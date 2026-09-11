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
 await migrate('20260914010000_revenue_payroll_all_statutory');
 // Use the real original table constraint, including commission_amount >= 0.
 // Reopen transitions must not rely on the scaffold accepting negative gross.
 const payrollSchema=await readFile(new URL('20260101000122_hr_monthly_payroll.sql',migrations),'utf8');
 const originalNonnegative=payrollSchema.match(/CONSTRAINT amounts_non_negative CHECK \([\s\S]*?\n    \)/)?.[0];
 assert(originalNonnegative);
 await db.exec(`ALTER TABLE hr_monthly_payroll ADD ${originalNonnegative}; ALTER TABLE hr_monthly_payroll ALTER COLUMN commission_amount SET NOT NULL;`);
 await db.exec(`CREATE TABLE payroll_statutory_voucher_lines(voucher_id uuid,period_month date,scope text,payroll_row_id uuid);
 GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
 GRANT USAGE ON SCHEMA public,auth TO authenticated;
 CREATE OR REPLACE FUNCTION lookup_pcb(numeric,text,integer) RETURNS numeric LANGUAGE sql AS $$SELECT round($1*0.025,2)$$;`);
 const period='2026-09-01';
 const fair=await one("SELECT id FROM comm_sub_departments WHERE code='FAIR'");
 const scheme=await one('SELECT id FROM comm_schemes WHERE sub_department_id=$1',[fair]);
 const staff1=await one("INSERT INTO hr_staff_costs(employee_name,department_id,basic_salary,tax_mode) VALUES('With Basic',$1,5000,'pcb') RETURNING id",[dept]);
 const staff2=await one("INSERT INTO hr_staff_costs(employee_name,department_id,basic_salary,tax_mode) VALUES('Full Commission',$1,0,'none') RETURNING id",[dept]);
 const legacyStaff=await one("INSERT INTO hr_staff_costs(employee_name,department_id,basic_salary,tax_mode) VALUES('Legacy snapshot',$1,5000,'pcb') RETURNING id",[dept]);
 const legacyId=await one("INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,commission_amount,source) VALUES($1,$2,5000,9000,'commission') RETURNING id",[legacyStaff,period]);
 const paidId=await one("INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,commission_amount,source) VALUES($1,'2026-08-01',5000,9000,'commission') RETURNING id",[legacyStaff]);
 await q("UPDATE hr_monthly_payroll SET status='paid' WHERE id=$1",[paidId]);
 const importedId=await one("INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,commission_amount,source) VALUES($1,'2026-07-01',5000,9000,'imported') RETURNING id",[legacyStaff]);
 const placeholderId=await one("INSERT INTO hr_monthly_payroll(staff_id,period_month,basic_salary,source) VALUES($1,$2,0,'commission') RETURNING id",[staff2,period]);
 const beforeMigration=await q('SELECT id, to_jsonb(p) data FROM hr_monthly_payroll p ORDER BY id');
 await migrate('20260915010000_revenue_payroll_adjustments');
 await migrate('20260915020000_revenue_payroll_atomic_row');
 const newFields=['commission_synced_amount','commission_adjustment_amount','commission_adjustment_reason','commission_adjusted_at','commission_adjusted_by'];
 check(await q('SELECT id,to_jsonb(p)-$1::text[] data FROM hr_monthly_payroll p ORDER BY id',[newFields]),beforeMigration);
 check(Number(await one('SELECT commission_synced_amount FROM hr_monthly_payroll WHERE id=$1',[legacyId])),9000);
 for(const id of [paidId,importedId,placeholderId])check(await one('SELECT commission_synced_amount FROM hr_monthly_payroll WHERE id=$1',[id]),null);

 async function batch(sub=fair,month=period){return one("INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES($1,$2,'fixture','committed') RETURNING id",[sub,month]);}
 function statement(staff,amount){return {staff_id:staff,base_rank_key:'rs_5',rank_key:'rs_5',rate_mode:'variable',product_rate:0.05,product_revenue:amount*20,product_commission:amount,total_commission:amount,lines:[{component:'product_revenue',basis_amount:amount*20,rate:0.05,amount}]};}
 async function save({month=period,sub=fair,rule=scheme,batchId,statements,warnings=[]}){return one('SELECT save_commission_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[month,sub,rule,batchId,statements.reduce((sum,s)=>sum+s.total_commission,0),JSON.stringify(warnings),JSON.stringify(statements),'[]','[]','[]']);}
 const firstBatch=await batch();
 let data={batchId:firstBatch,statements:[statement(staff1,10000),statement(staff2,3000)]};
 const run=await save(data);
 const id=await one('SELECT id FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,period]);
 async function row(rowId=id){return (await q('SELECT * FROM hr_monthly_payroll WHERE id=$1',[rowId]))[0];}
 async function adjust(gross,base,delta,reason='Month-end correction',rowId=id){return one('SELECT adjust_revenue_payroll_commission($1,$2,$3,$4,$5)',[rowId,gross,base,delta,reason]);}
 async function denied(gross,base,delta,reason,pattern,rowId=id){await reject('SELECT adjust_revenue_payroll_commission($1,$2,$3,$4,$5)',[rowId,gross,base,delta,reason],pattern);}
 check(Number((await row()).commission_synced_amount),10000);
 check(Number((await row()).basic_salary),5000);
 // Saved statutory overrides (including persistent PCB) survive source edits.
 await q('UPDATE hr_monthly_payroll SET epf_er=700,epf_ee=600,socso_er=15,socso_ee=7,eis_er=4,eis_ee=2,pcb_override_amount=123.45 WHERE id=$1',[id]);
 const original=await row();
 const sourceBefore=await one('SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM comm_statements s');
 const runBefore=await one('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM comm_runs r');
 check((await adjust(11000,10000,0)).changed,true);
 let r=await row();
 for(const k of ['basic_salary','epf_er','epf_ee','socso_er','socso_ee','eis_er','eis_ee','pcb','pcb_override_amount','basic_pay_net'])check(r[k],original[k]);
 for(const k of ['gross','net','commission_balance'])check(Number(r[k])-Number(original[k]),1000);
 check(Number(r.commission_adjustment_amount),1000);
 check(await one('SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM comm_statements s'),sourceBefore);
 check(await one('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM comm_runs r'),runBefore);
 check((await adjust(11000,10000,1000)).changed,false);
 check(Number(await one('SELECT count(*) FROM revenue_payroll_commission_adjustments')),1);
 await denied(12000,10000,0,'stale',/adjustment changed/);
 await denied(12000,9999,1000,'stale',/source changed/);
 await adjust(9500,10000,1000,'Negative adjustment');
 check(Number((await row()).commission_adjustment_amount),-500);
 await adjust(10000,10000,-500,'Reset adjustment');
 check(Number((await row()).commission_adjustment_amount),0);
 check(Number((await row()).net),Number(original.net));
 for(const [gross,reason,pattern] of [[-1,'reason',/nonnegative/],['NaN','reason',/nonnegative/],['Infinity','reason',/nonnegative/],[10000.001,'reason',/decimal/],[10000,' ',/reason/],[10000,'x'.repeat(1001),/reason/]]) await denied(gross,10000,0,reason,pattern);
 await reject('UPDATE hr_monthly_payroll SET commission_amount=12000 WHERE id=$1',[id],/reviewed adjustment/);
 await reject('UPDATE hr_monthly_payroll SET commission_adjustment_amount=1 WHERE id=$1',[id],/reviewed adjustment/);
 await reject('UPDATE revenue_payroll_commission_adjustments SET reason=\'rewrite\'',[],/immutable/);
 await reject('DELETE FROM revenue_payroll_commission_adjustments',[],/immutable/);
 await denied(10000,9000,0,'cannot edit imported',/draft Revenue/,importedId);
 await denied(10000,9000,0,'cannot edit paid',/draft Revenue/,paidId);
 // Existing source-less saved snapshots can be adjusted; empty new rows cannot.
 await adjust(9500,9000,0,'Reviewed saved snapshot',legacyId);
 const emptyStaff=await one("INSERT INTO hr_staff_costs(employee_name,department_id) VALUES('Missing source',$1) RETURNING id",[dept]);
 const emptyId=await one("INSERT INTO hr_monthly_payroll(staff_id,period_month,source) VALUES($1,$2,'commission') RETURNING id",[emptyStaff,period]);
 await denied(14000,0,0,'Missing source',/No confirmed Revenue source/,emptyId);
 // An authoritative source can repair a stale/NULL stored baseline; the fresh
 // source, not a client-supplied zero or the stale saved number, is reviewed.
 await db.exec("SELECT set_config('app.revenue_commission_write','sync',false)");
 await q('UPDATE hr_monthly_payroll SET commission_synced_amount=9000 WHERE id=$1',[id]);
 await db.exec("SELECT set_config('app.revenue_commission_write','',false)");
 await denied(11000,9000,0,'stale source',/source changed/);
 await adjust(11000,10000,0,'Repair saved baseline from confirmed source');
 check(Number((await row()).commission_synced_amount),10000);
 check(Number((await row()).commission_adjustment_amount),1000);
 // Reopen retains a signed offset even while its removed source is zero.
 await q('SELECT reopen_commission_run($1)',[run]);
 check(Number((await row()).commission_synced_amount),0);
 check(Number((await row()).commission_amount),1000);
 await denied(2000,0,1000,'source pending',/not confirmed/);
 data={...data,statements:[statement(staff1,15000),statement(staff2,3000)]};
 check(await save(data),run);
 check(Number((await row()).commission_amount),16000);
 check(Number((await row()).commission_adjustment_amount),1000);
 for(const k of ['basic_salary','epf_er','epf_ee','socso_er','socso_ee','eis_er','eis_ee','pcb','pcb_override_amount','basic_pay_net'])check((await row())[k],original[k]);
 const ir=await one("INSERT INTO comm_sub_departments(department_id,name,code) VALUES($1,'IR','IR') RETURNING id",[dept]);
 const irScheme=await one("INSERT INTO comm_schemes(sub_department_id,scheme_name,effective_from) VALUES($1,'IR fixture',$2) RETURNING id",[ir,period]);
 const irBatch=await batch(ir);
 const irData={sub:ir,rule:irScheme,batchId:irBatch,statements:[statement(staff1,2000)]};
 const irRun=await save(irData);
 check(Number((await row()).commission_synced_amount),17000);
 check(Number((await row()).commission_amount),18000);
 let display=await q('SELECT * FROM revenue_payroll_adjustments($1,$2,$3)',[ir,period,staff1]);
 check(display.length,1);check(Number(display[0].source_run_count),2);check(Number(display[0].commission_amount),18000);
 check((await q('SELECT * FROM revenue_payroll_adjustments($1,$2,$3)',[ir,period,staff2])).length,0);
 await q('SELECT reopen_commission_run($1)',[irRun]);
 check(Number((await row()).commission_amount),16000);
 await save(irData);check(Number((await row()).commission_amount),18000);
 await q('SELECT reopen_commission_run($1)',[irRun]);await save(irData);
 check(Number((await row()).commission_amount),18000);
 // Negative offset is retained on reopen. Where removing a source would make
 // final gross negative, retain the last valid snapshot while the run is draft.
 await adjust(16000,17000,1000,'Decrease by 1000');
 await q('SELECT reopen_commission_run($1)',[run]);await q('SELECT reopen_commission_run($1)',[irRun]);
 check(Number((await row()).commission_amount),1000);
 check(Number((await row()).commission_synced_amount),2000);
 check(Number((await row()).commission_adjustment_amount),-1000);
 await denied(17000,2000,-1000,'Source reopened',/not confirmed/);
 await reject('SELECT submit_payroll_to_principal($1,$2)',[period,principal],/not synced|not.*applied|not.*confirmed|sync|recalculate/i);
 await save(data);await save(irData);check(Number((await row()).commission_amount),16000);
 // Exact reported single-programme boundary: 13k - 1k -> reopen -> 13.5k - 1k.
 const november='2026-11-01';const novemberBatch=await batch(fair,november);
 const novData={month:november,batchId:novemberBatch,statements:[statement(staff1,13000)]};
 const novRun=await save(novData);
 const novId=await one('SELECT id FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,november]);
 await adjust(12000,13000,0,'Downward month-end adjustment',novId);
 const beforeNovReopen=await row(novId);
 await q('SELECT reopen_commission_run($1)',[novRun]);
 check(Number((await row(novId)).commission_amount),12000);
 check(Number((await row(novId)).commission_synced_amount),13000);
 check(Number((await row(novId)).commission_adjustment_amount),-1000);
 check((await row(novId)).net,beforeNovReopen.net);
 await denied(12500,13000,-1000,'Source pending',/not confirmed/,novId);
 await reject('SELECT submit_payroll_to_principal($1,$2)',[november,principal],/sync|recalculate/i);
 await save({...novData,statements:[statement(staff1,13500)]});
 check(Number((await row(novId)).commission_synced_amount),13500);
 check(Number((await row(novId)).commission_adjustment_amount),-1000);
 check(Number((await row(novId)).commission_amount),12500);
 // Finance accepts source + legitimate delta, but still rejects missing sources.
 await reject('SELECT submit_payroll_to_principal($1,$2)',[period,principal],/does not match/);
 await q('DELETE FROM hr_monthly_payroll WHERE id=$1',[emptyId]);
 // Deleting an unlinked draft must retain its immutable original audit identity.
 const legacyAudit=await q('SELECT * FROM revenue_payroll_commission_adjustments WHERE payroll_row_id=$1',[legacyId]);
 await q('DELETE FROM hr_monthly_payroll WHERE id=$1',[legacyId]);
 check(await q('SELECT * FROM revenue_payroll_commission_adjustments WHERE payroll_row_id=$1',[legacyId]),legacyAudit);
 // Adjusted employee removed by recomputation: remove the now-unlinked draft,
 // retain history, then submit the remaining confirmed payroll normally.
 const december='2026-12-01';const decemberBatch=await batch(fair,december);
 const decData={month:december,batchId:decemberBatch,statements:[statement(staff1,10000),statement(staff2,3000)]};
 const decRun=await save(decData);
 const orphanId=await one('SELECT id FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff2,december]);
 await adjust(3500,3000,0,'Month-end adjustment before source correction',orphanId);
 const orphanAudit=await q('SELECT * FROM revenue_payroll_commission_adjustments WHERE payroll_row_id=$1',[orphanId]);
 await q('SELECT reopen_commission_run($1)',[decRun]);
 await save({...decData,statements:[statement(staff1,10000)]});
 await reject('SELECT submit_payroll_to_principal($1,$2)',[december,principal],/does not match/);
 await q('DELETE FROM hr_monthly_payroll WHERE id=$1',[orphanId]);
 check(await q('SELECT * FROM revenue_payroll_commission_adjustments WHERE payroll_row_id=$1',[orphanId]),orphanAudit);
 const decSubmitted=await one('SELECT submit_payroll_to_principal($1,$2)',[december,principal]);
 check(Number(await one('SELECT total_amount FROM payroll_runs WHERE id=$1',[decSubmitted])),10000);
 // Use a separate month for a complete, clean finance submission.
 const october='2026-10-01';const octoberBatch=await batch(fair,october);
 const octRun=await save({month:october,batchId:octoberBatch,statements:[statement(staff1,10000)]});
 const octId=await one('SELECT id FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,october]);
 await adjust(1,10000,0,'Review shortfall',octId);
 await reject('SELECT submit_payroll_to_principal($1,$2)',[october,principal],/negative|shortfall/i);
 await adjust(10000,10000,-9999,'Restore before submission',octId);
 await asUser(principal);
 await adjust(11000,10000,0,'Approved month-end amount',octId);
 await asUser(principal,true);
 const beforeFund=await row(octId);
 const submitted=await one('SELECT submit_payroll_to_principal($1,$2)',[october,principal]);
 check(Number(await one('SELECT total_amount FROM payroll_runs WHERE id=$1',[submitted])),11000);
 check((await row(octId)).status,'submitted');
 check((await row(octId)).commission_balance,beforeFund.commission_balance);
 await denied(12000,10000,1000,'submitted',/already been submitted/,octId);
 await reject('SELECT reopen_commission_run($1)',[octRun],/already been submitted/);
 // Closed periods, statutory PVs and salary PVs block before any money/audit write.
 await q('INSERT INTO period_locks VALUES($1,true)',[period]);
 await denied(18000,17000,-1000,'closed',/closed/);await q('DELETE FROM period_locks WHERE period_month=$1',[period]);
 const pv=await one("INSERT INTO payment_vouchers(reference_type,status) VALUES('statutory','pending') RETURNING id");
 await q("INSERT INTO payroll_statutory_voucher_lines VALUES($1,$2,'staff',$3)",[pv,period,id]);
 await denied(18000,17000,-1000,'PV exists',/statutory payment vouchers/);
 await q("UPDATE payment_vouchers SET status='voided' WHERE id=$1",[pv]);
 const salaryPv=await one("INSERT INTO payment_vouchers(reference_type,reference_id,status) VALUES('payroll_disbursement',$1,'pending') RETURNING id",[id]);
 await denied(18000,17000,-1000,'PV exists',/salary payment vouchers/);
 await q("UPDATE payment_vouchers SET status='voided' WHERE id=$1",[salaryPv]);
 // Withholding follows income; saved net basic and statutory figures do not.
 await q("UPDATE hr_staff_costs SET tax_mode='withholding',withholding_rate=0.02 WHERE id=$1",[staff2]);
 const fullBefore=await row(placeholderId);
 await adjust(4000,3000,0,'Full commission WHT',placeholderId);
 const fullAfter=await row(placeholderId);
 check(Number(fullAfter.withholding_tax),80);check(Number(fullAfter.basic_pay_net),0);
 check(Number(fullAfter.net),3920);check(Number(fullBefore.commission_amount),3000);
 // Reset JADUAL deliberately names an unchanged basic input. It must still run
 // statutory schedules outside the trusted source-only adjustment context.
 await q('UPDATE hr_monthly_payroll SET basic_salary=basic_salary,pcb_override_amount=NULL WHERE id=$1',[id]);
 r=await row();
 check(Number(r.epf_er),650);check(Number(r.epf_ee),550);
 check(Number(r.socso_er),10);check(Number(r.socso_ee),5);
 check(Number(r.eis_er),3);check(Number(r.eis_ee),1);
 check(Number(r.pcb),111.25);check(r.pcb_override_amount,null);
 check(Number(r.commission_amount),16000);check(Number(r.commission_adjustment_amount),-1000);
 // Reproduce a failed historic payroll sync: the confirmed statement exists
 // while its zero payroll placeholder has never acquired a baseline.
 const recoveredStaff=await one("INSERT INTO hr_staff_costs(employee_name,department_id,tax_mode) VALUES('Recover confirmed source',$1,'none') RETURNING id",[dept]);
 const recoveredId=await one("INSERT INTO hr_monthly_payroll(staff_id,period_month,source) VALUES($1,$2,'commission') RETURNING id",[recoveredStaff,period]);
 await q('INSERT INTO comm_statements(run_id,staff_id,product_commission,total_commission) VALUES($1,$2,13000,13000)',[run,recoveredStaff]);
 check((await row(recoveredId)).commission_synced_amount,null);
 await adjust(14000,13000,0,'Recover confirmed source with 1000 correction',recoveredId);
 check(Number((await row(recoveredId)).commission_synced_amount),13000);
 check(Number((await row(recoveredId)).commission_adjustment_amount),1000);
 check(Number((await row(recoveredId)).commission_amount),14000);
 // Inline Basic + Gross uses one authenticated transaction. The wrapper
 // delegates money/source/audit checks to the production adjustment routine.
 const january='2027-01-01';const januaryBatch=await batch(fair,january);
 await save({month:january,batchId:januaryBatch,statements:[statement(staff1,10000)]});
 const atomicId=await one('SELECT id FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff1,january]);
 const atomic=(gross,base,delta,fields,reason='Reviewed inline row')=>one(
   'SELECT save_revenue_payroll_row($1,$2,$3,$4,$5,$6)',[atomicId,gross,base,delta,reason,JSON.stringify(fields)]);
 await q('UPDATE hr_monthly_payroll SET pcb_override_amount=77.77 WHERE id=$1',[atomicId]);
 await asUser(principal);
 const mixed=await atomic(11000,10000,0,{basic_salary:6000});
 check(mixed.row_changed,true);check(mixed.changed,true);
 let atomicRow=await row(atomicId);
 check(Number(atomicRow.basic_salary),6000);check(Number(atomicRow.commission_amount),11000);
 check(Number(atomicRow.epf_er),780);check(Number(atomicRow.epf_ee),660);
 check(Number(atomicRow.pcb_override_amount),77.77);check(Number(atomicRow.pcb),77.77);
 check(Number(atomicRow.basic_pay_net),5256.23);check(Number(atomicRow.commission_balance),4207);
 check(Number(atomicRow.net),9463.23);
 // Same requested gross is not a no-op for ordinary inputs.
 const sameGross=await atomic(11000,10000,1000,{non_statutory_allowance:123.45});
 check(sameGross.changed,false);check(sameGross.row_changed,true);
 check(Number((await row(atomicId)).net),9586.68);
 await q('UPDATE hr_monthly_payroll SET epf_er=812,epf_ee=690,socso_er=22,socso_ee=8,eis_er=5,eis_ee=3 WHERE id=$1',[atomicId]);
 const customAtomic=await row(atomicId);
 // Empty and unchanged ordinary payloads must preserve manual EE/ER and PCB.
 check((await atomic(12000,10000,1000,{})).row_changed,false);
 check((await atomic(13000,10000,2000,{basic_salary:6000})).row_changed,false);
 for(const k of ['basic_salary','epf_er','epf_ee','socso_er','socso_ee','eis_er','eis_ee','pcb','pcb_override_amount','basic_pay_net'])check((await row(atomicId))[k],customAtomic[k]);
 const beforeAtomicFailure=await row(atomicId);
 const beforeAtomicAudit=await q('SELECT * FROM revenue_payroll_commission_adjustments WHERE payroll_row_id=$1 ORDER BY id',[atomicId]);
 // Stale adjustment/source validation cannot save Basic ahead of the review.
 await assert.rejects(()=>atomic(14000,9999,3000,{basic_salary:7000}),/source changed/);checks++;
 check(await row(atomicId),beforeAtomicFailure);
 await assert.rejects(()=>atomic(14000,10000,2000,{basic_salary:7000}),/adjustment changed/);checks++;
 check(await row(atomicId),beforeAtomicFailure);
 // Conversely, a late ordinary-input failure rolls back the already executed
 // valid adjustment AND its audit, proving both writes share one transaction.
 await assert.rejects(()=>atomic(14000,10000,3000,{basic_salary:100000000000000}),/numeric field overflow/);checks++;
 check(await row(atomicId),beforeAtomicFailure);
 check(await q('SELECT * FROM revenue_payroll_commission_adjustments WHERE payroll_row_id=$1 ORDER BY id',[atomicId]),beforeAtomicAudit);
 for(const fields of [{commission_amount:14000},{pcb:0},{status:'paid'},{basic_salary:'7000'},[],{basic_salary:-1},{basic_salary:1.001}]) {
   await assert.rejects(()=>atomic(14000,10000,3000,fields),/protected|number|object|negative|decimal/);checks++;
 }
 await asUser(principal,true);
 // Inactive, Finance, anonymous and Revenue-only accounts cannot adjust.
 const outsider='10000000-0000-4000-8000-000000000099';
 await q("INSERT INTO users(id,email,name,role) VALUES($1,'finance@example.com','Finance','finance')",[outsider]);
 const countBefore=Number(await one('SELECT count(*) FROM revenue_payroll_commission_adjustments'));
 await asUser(outsider);
 await denied(18000,17000,-1000,'unauthorized',/Only active Principal or HR/);
 await assert.rejects(()=>atomic(14000,10000,3000,{basic_salary:7000}),/Only active Principal or HR/);checks++;
 await reject('SELECT * FROM revenue_payroll_adjustments($1,$2)',[fair,period],/Revenue access/);
 check(Number(await one('SELECT count(*) FROM revenue_payroll_commission_adjustments')),0);
 await reject("INSERT INTO revenue_payroll_commission_adjustments(reason) VALUES('spoof')",[],/permission denied/);
 await asUser(principal,true);
 await q("INSERT INTO user_permissions VALUES($1,'revenue',true)",[outsider]);
 await asUser(outsider);
 check((await q('SELECT * FROM revenue_payroll_adjustments($1,$2,$3)',[fair,period,staff1])).length,1);
 await denied(18000,17000,-1000,'Revenue-only is read-only',/Only active Principal or HR/);
 await asUser(principal,true);await q('UPDATE users SET is_active=false WHERE id=$1',[principal]);
 await denied(18000,17000,-1000,'inactive',/Only active Principal or HR/);
 await q('UPDATE users SET is_active=true WHERE id=$1',[principal]);
 await asUser('');await db.exec('SET ROLE anon');
 await denied(18000,17000,-1000,'anonymous',/permission denied/);
 await asUser(principal,true);
 check(Number(await one('SELECT count(*) FROM revenue_payroll_commission_adjustments')),countBefore);
 console.log('PASS: '+checks+' Revenue commission adjustment SQL checks. Actual money, sync, submit and adjustment routines; no live database connection.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,detail:error.detail,query:error.query,stack:error.name==='AssertionError'?error.stack:undefined},null,2));process.exitCode=1}finally{await db.close()}
