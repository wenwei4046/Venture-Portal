import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { principalViewChecks } from './principal-view-checks.mjs'
import { insightChecks } from './insight-checks.mjs'
import { arenaChecks } from './arena-checks.mjs'
import { kpiSummaryChecks } from './kpi-summary-checks.mjs'
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
 for(const name of ['20260912010000_revenue_member_role','20260912020000_member_self_service','20260912030000_member_read_models','20260912040000_member_request_workflows','20260912050000_member_hr_management','20260912060000_member_permission_boundary','20260912070000_member_queue_worker'])await migrate(name)
 // The baseline above intentionally mocks unrelated payroll/auth/Storage,
 // while every Revenue/member migration under test runs verbatim.
 const fair=await one("SELECT id FROM comm_sub_departments WHERE code='FAIR'"),scheme=await one('SELECT id FROM comm_schemes WHERE sub_department_id=$1',[fair]);
 const rank=await one('SELECT id FROM comm_ranks WHERE scheme_id=$1 AND can_recruit ORDER BY sort_order LIMIT 1',[scheme]),title=await one('SELECT title_id FROM comm_ranks WHERE id=$1',[rank]);
 await q("UPDATE departments SET payroll_source='commission' WHERE id=$1",[dept])
 await q("INSERT INTO users(id,email,name,role) VALUES($1,'one@example.com','One','revenue_member'),($2,'two@example.com','Two','revenue_member')",[first,second])
 const staff1=await one("INSERT INTO hr_staff_costs(employee_name,department_id,title_id,user_id,basic_salary) VALUES('One',$1,$2,$3,2500) RETURNING id",[dept,title,first]);
 const staff2=await one("INSERT INTO hr_staff_costs(employee_name,department_id,title_id,user_id,basic_salary) VALUES('Two',$1,$2,$3,77777) RETURNING id",[dept,title,second]);
 const child=await one("INSERT INTO hr_staff_costs(employee_name,department_id,title_id) VALUES('Child',$1,$2) RETURNING id",[dept,title]);
 const today=await one("SELECT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date::text"),period=today.slice(0,7)+'-01';
 for(const [s,parent]of[[staff1,null],[staff2,null],[child,staff1]])await q('INSERT INTO comm_hierarchy(scheme_id,staff_id,rank_id,title_id,upline_staff_id,effective_from) VALUES($1,$2,$3,$4,$5,$6)',[scheme,s,rank,title,parent,period]);
 const product=await one("INSERT INTO comm_products(item_code,product_name,brand_code,item_group,unit_cost) VALUES('AK-MOBILE','Real Mattress','AKEMI','MATTRESS',2000) RETURNING id");
 await q("SELECT member_configure_product($1,'床垫','Queen','',false,true)",[product]);
 const batch=await one("INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES($1,$2,'test','committed') RETURNING id",[fair,period]);
 const run=await one("INSERT INTO comm_runs(sub_department_id,period_month,scheme_id,batch_id,status) VALUES($1,$2,$3,$4,'computed') RETURNING id",[fair,period,scheme,batch]);
 for(const [s,pay]of[[staff1,100],[staff2,98765]])await q('INSERT INTO comm_statements(run_id,staff_id,product_commission,total_commission,product_revenue) VALUES($1,$2,$3,$3,5000)',[run,s,pay]);
 for(const[s,n]of[[staff1,'SELF-ORDER'],[staff2,'SECRET-ORDER']]){const id=await one("INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance,brand_code) VALUES($1,$2,$3,$2,$2,'Agent','AGENT',$4,4000,0,'AKEMI') RETURNING id",[batch,period,n,s]);await q("INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount) VALUES($1,1,'MATTRESS','AK-MOBILE',1,4000,2000)",[id]);}
 await asUser(first)
 const data=await one('SELECT member_data_snapshot()');check(data.profile.salary,2500);check(data.memberships.length,1);check(data.memberships[0].people.some(x=>x.id===staff2),false);check(data.memberships[0].people.some(x=>x.id===child));check(data.incomes[0].total,100);check(data.orders.length,1);check(data.orders[0].margin,50);check('cost' in data.products[0],false);check(JSON.stringify(data).includes('98765'),false)
 check(await one("SELECT has_scope(ARRAY['hr','admin','treasury'])"),false)
 await asUser(principal,true);const versionParts=await one('SELECT jsonb_build_object(\'a\',p.updated_at,\'b\',o.updated_at) FROM comm_products p JOIN member_product_options o ON o.product_id=p.id WHERE p.id=$1',[product]);check(data.products[0].version,`${versionParts.a}:${versionParts.b}`)
 await q("INSERT INTO title_permissions(title_id,permission_key) VALUES($1,'product_list'),($1,'revenue')",[title]);await q("INSERT INTO user_permissions(user_id,permission_key,granted) VALUES($1,'settings',true)",[first]);
 await asUser(first);check(await one("SELECT has_scope(ARRAY['hr','admin','treasury'])"),false);check((await one('SELECT member_data_snapshot()')).configured)
 await reject('SELECT member_admin_snapshot()');await reject('SELECT member_request_json(gen_random_uuid())')
 const quote=await one('SELECT member_quote_context($1)',[scheme]);check(quote.bands.length>0);check(JSON.stringify(quote).includes('unit_cost'),false)
 await reject('SELECT member_quote_context(gen_random_uuid())',[],/Fair membership/)
 const detail={location:'Johor',category:'Outstation',start:today,end:today,amount:380,invoiceName:'invoice.pdf',invoiceHash:'a'.repeat(64)}
 const key='10000000-0000-4000-8000-000000000099';const prepared=await one('SELECT member_prepare_request($1,$2,$3,$4)',['claim',fair,JSON.stringify(detail),key]);
 await reject('SELECT member_submit_request($1)',[prepared.id],/verified invoice/)
 await reject('SELECT member_prepare_request($1,$2,$3,$4)',['claim',fair,JSON.stringify({...detail,amount:381}),key],/different request/)
 const path=`${first}/${prepared.id}/invoice.pdf`;await q("INSERT INTO storage.objects(bucket_id,name) VALUES('member-invoices',$1)",[path]);
 await asUser(principal,true);await q("INSERT INTO member_request_attachments(request_id,uploaded_by,object_path,mime_type,size_bytes,content_sha256) VALUES($1,$2,$3,'application/pdf',20,$4)",[prepared.id,first,path,detail.invoiceHash]);
 await asUser(first);const claim=await one('SELECT member_submit_request($1)',[prepared.id]);check(claim.status,'submitted');check(!!claim.claimId);check((await one('SELECT member_submit_request($1)',[prepared.id])).claimId,claim.claimId);
 await asUser(second);await reject('SELECT member_submit_request($1)',[prepared.id]);check((await q('SELECT * FROM member_request_attachments WHERE request_id=$1',[prepared.id])).length,0);check((await q("SELECT * FROM storage.objects WHERE name=$1",[path])).length,0)
 await asUser(principal,true);check(Number(await one('SELECT count(*) FROM claims')),1)
 // Returned invoices update the same pending claim, bind to new verified
 // bytes, preserve the idempotency key, and tolerate retry without duplication.
 await q('SELECT member_admin_action($1,$2,$3)',['needs_info',prepared.id,JSON.stringify({note:'Please upload a clearer invoice'})]);
 await asUser(second);await reject('SELECT member_prepare_request($1,$2,$3,$4,$5)',['claim',fair,JSON.stringify(detail),key,prepared.id],/Only your returned/);
 await asUser(first);const revisedDetail={...detail,amount:390,invoiceHash:'b'.repeat(64)};
 const revised=await one('SELECT member_prepare_request($1,$2,$3,$4,$5)',['claim',fair,JSON.stringify(revisedDetail),key,prepared.id]);check(revised.id,prepared.id);
 await reject('SELECT member_submit_request($1)',[prepared.id],/verified invoice/);
 const newPath=`${first}/${prepared.id}/new.pdf`;await q("INSERT INTO storage.objects(bucket_id,name) VALUES('member-invoices',$1)",[newPath]);
 await asUser(principal,true);await q("INSERT INTO member_request_attachments(request_id,uploaded_by,object_path,mime_type,size_bytes,content_sha256) VALUES($1,$2,$3,'application/pdf',20,$4)",[prepared.id,first,newPath,revisedDetail.invoiceHash]);
 await asUser(first);check((await one('SELECT member_submit_request($1)',[prepared.id])).claimId,claim.claimId);
 check((await one('SELECT member_prepare_request($1,$2,$3,$4,$5)',['claim',fair,JSON.stringify(revisedDetail),key,prepared.id])).status,'submitted');
 await asUser(principal,true);check(Number(await one('SELECT count(*) FROM claims')),1);check(Number(await one('SELECT amount FROM claims WHERE id=$1',[claim.claimId])),390);
 const memo=await one('SELECT member_publish_memo($1,$2,$3,$4,true,$5,1)',['Test','Body','HR',today,[fair]])
 const admin=await one('SELECT member_admin_snapshot()');check(admin.products.length,1);check('cost'in admin.products[0],false);check(admin.requests.length,1)
 await asUser(first);const read=await one('SELECT member_acknowledge_memo($1,false)',[memo.id]);check(read.acknowledgedAt,null);const ack=await one('SELECT member_acknowledge_memo($1,true)',[memo.id]);check(!!ack.acknowledgedAt);check((await one('SELECT member_acknowledge_memo($1,true)',[memo.id])).acknowledgedAt,ack.acknowledgedAt)
 await reject('SELECT member_publish_memo($1,$2,$3,$4,true,$5,1)',['Bad','Body','Member',today,[fair]])
 const wd={newPerson:'New Person',contact:'0123456789',start:today,signature:'New Person',consent:true};
 await reject('SELECT member_prepare_request($1,$2,$3,gen_random_uuid())',['waiting',fair,JSON.stringify({...wd,consent:undefined})],/confirmation/)
 const waiting=await one('SELECT member_prepare_request($1,$2,$3,gen_random_uuid())',['waiting',fair,JSON.stringify(wd)]);await one('SELECT member_submit_request($1)',[waiting.id]);
 await asUser(principal,true);const ir=await one("INSERT INTO comm_sub_departments(department_id,name,code) VALUES($1,'IR','IR') RETURNING id",[dept]);
 await asUser(first);const directory=(await one('SELECT member_data_snapshot()')).departments;check(directory.some(d=>d.id===ir));check(Object.keys(directory[0]).sort(),['capacity','id','name','occupied']);
 const irWait=await one('SELECT member_prepare_request($1,$2,$3,gen_random_uuid())',['waiting',ir,JSON.stringify({...wd,contact:'0123999999',newPerson:'IR Candidate'})]);check(irWait.status,'draft');
 await asUser(principal,true);await q('SELECT member_admin_action($1,NULL,$2)',['set_capacity',JSON.stringify({subDepartmentId:fair,capacity:3})]);
 const qualified=await one('SELECT member_admin_action($1,$2,$3)',['qualify',waiting.id,JSON.stringify({note:'Applicant eligibility checked'})]);check(qualified.status,'waiting')
 await q('DELETE FROM comm_hierarchy WHERE staff_id=$1',[child]);check(await one('SELECT status FROM member_requests WHERE id=$1',[waiting.id]),'reserved')
 await q('SELECT member_admin_action($1,$2,$3)',['accept',waiting.id,JSON.stringify({note:'Applicant confirmed acceptance by signed form',applicantConfirmed:true})]);
 // Exercise the actual production home-roster function and trigger body
 // after fixture setup, rather than the synthetic baseline's manual rows.
 for(const fn of ['comm_floor_rank','hr_staff_one_line_sync'])await legacyFunction('20260910120000_one_line_commission_positions',fn);
 await legacyFunction('20260910160000_memberships_per_sub_department','comm_sync_position');
 await db.exec('CREATE TRIGGER hr_staff_costs_one_line_sync AFTER INSERT OR UPDATE OF reports_to,title_id,department_id,status ON hr_staff_costs FOR EACH ROW EXECUTE FUNCTION hr_staff_one_line_sync()');
 await q('SELECT member_admin_action($1,$2,$3)',['create_candidate',waiting.id,JSON.stringify({titleId:title,uplineStaffId:staff1})]);
 // The accepted, installed candidate must not consume two capacity slots.
 await q('SELECT member_admin_action($1,NULL,$2)',['set_capacity',JSON.stringify({subDepartmentId:fair,capacity:3})]);checks++;
 await reject('SELECT member_admin_action($1,$2,$3)',['needs_info',waiting.id,JSON.stringify({note:'Too late to return the installed applicant'})],/already in the roster/);
 const allocated=await one('SELECT member_admin_action($1,$2,$3)',['allocate',waiting.id,'{}']);check(allocated.status,'allocated');check(await one('SELECT member_occupied($1,$2)',[fair,today]),3)
 check(await one('SELECT count(*)::integer FROM comm_hierarchy WHERE staff_id=$1',[allocated.detail.allocatedStaffId]),1);
 check(await one('SELECT upline_staff_id FROM comm_hierarchy WHERE staff_id=$1',[allocated.detail.allocatedStaffId]),staff1);
 await asUser(first);check((await one('SELECT member_data_snapshot()')).requests.length,2)
 await asUser(principal,true);await q('UPDATE users SET is_active=false WHERE id=$1',[first]);await asUser(first);await reject('SELECT member_data_snapshot()')
 // Machine-only sweep: no unauthenticated or member execution, no exposed
 // run audit, and no dependence on roster changes to process date/expiry.
 await reject('SELECT member_process_all_queues()');
 await reject('SELECT * FROM member_queue_runs');
 await db.exec('SET ROLE anon');await reject('SELECT member_process_all_queues()');
 await db.exec('SET ROLE service_role');await reject('SELECT member_process_all_queues()',[],/Service-role queue access/);
 await asUser(principal,true);await q('UPDATE users SET is_active=true WHERE id=$1',[first]);
 await q("UPDATE member_requests SET detail=jsonb_set(detail,'{start}',to_jsonb(((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date+1)::text)) WHERE id=$1",[irWait.id]);
 await asUser(first);await q('SELECT member_submit_request($1)',[irWait.id]);
 await asUser(principal,true);await q('SELECT member_admin_action($1,$2,$3)',['qualify',irWait.id,JSON.stringify({note:'Future applicant verified'})]);
 await q('SELECT member_admin_action($1,NULL,$2)',['set_capacity',JSON.stringify({subDepartmentId:ir,capacity:1})]);
 async function sweep(){await db.exec('SET ROLE service_role');await q("SELECT set_config('request.jwt.claim.role','service_role',false)");return one('SELECT member_process_all_queues()');}
 const beforeDate=await sweep();check(beforeDate.status,'complete');check(beforeDate.newReservations,0);
 await asUser(principal,true);check(await one('SELECT status FROM member_requests WHERE id=$1',[irWait.id]),'waiting');
 await q("UPDATE member_requests SET detail=jsonb_set(detail,'{start}',to_jsonb($1::text)) WHERE id=$2",[today,irWait.id]);
 const due=await sweep();check(due.newReservations,1);
 await asUser(principal,true);check(await one('SELECT status FROM member_requests WHERE id=$1',[irWait.id]),'reserved');
 await asUser(first);const nextIr=await one('SELECT member_prepare_request($1,$2,$3,gen_random_uuid())',['waiting',ir,JSON.stringify({...wd,contact:'0123111000',newPerson:'Next IR'})]);await q('SELECT member_submit_request($1)',[nextIr.id]);
 await asUser(principal,true);await q('SELECT member_admin_action($1,$2,$3)',['qualify',nextIr.id,JSON.stringify({note:'Next applicant verified'})]);
 await q("UPDATE member_requests SET reservation_expires_at=now()-interval '1 second' WHERE id=$1",[irWait.id]);
 const expiry=await sweep();check(expiry.newReservations,1);
 await asUser(principal,true);check(await one('SELECT status FROM member_requests WHERE id=$1',[irWait.id]),'expired');check(await one('SELECT status FROM member_requests WHERE id=$1',[nextIr.id]),'reserved');
 const duplicate=await sweep();check(duplicate.newReservations,0);
 check(Number(await one('SELECT count(*) FROM member_queue_runs WHERE finished_at IS NOT NULL')),4);
 // Fault injection proves one bad department is isolated and audited.
 await asUser(principal,true);await q('UPDATE member_department_capacity SET headcount_limit=2 WHERE sub_department_id=$1',[ir]);
 await q("UPDATE member_requests SET status='waiting',detail=jsonb_set(detail,'{start}',to_jsonb('invalid-date'::text)) WHERE id=$1",[irWait.id]);
 const partial=await sweep();check(partial.status,'partial');check(partial.failures,1);check(partial.departmentsProcessed,1);check('message' in partial,false);
 const runAudit=await one('SELECT failures FROM member_queue_runs WHERE id=$1',[partial.runId]);check(runAudit[0].subDepartmentId,ir);
 // Replay the actual permissive legacy Storage/claims policies, then prove
 // the new account role cannot use them to bypass its member-only workflow.
 await asUser(principal,true);
 await migrate('20260101000058_payment_attachment_storage');
 const legacyRls=await readFile(new URL('20260101000011_rls.sql',migrations),'utf8');
 const legacyClaimPolicy=legacyRls.match(/CREATE POLICY claims_submit[\s\S]*?;/)?.[0];
 assert(legacyClaimPolicy,'Expected the real legacy claims_submit policy');
 await db.exec(`ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
 GRANT INSERT ON claims TO authenticated;
 GRANT USAGE ON SCHEMA storage TO service_role;
 GRANT SELECT,INSERT ON storage.objects TO service_role;`);
 await db.exec(legacyClaimPolicy);
 const paymentPath='ba/fixture/private-finance.pdf';
 await q("INSERT INTO storage.objects(bucket_id,name) VALUES('payment-attachments',$1)",[paymentPath]);
 const directClaim=(id)=>q("INSERT INTO claims(claim_type,claimant_name,amount,created_by) VALUES('benefit','Direct legacy claim',1,$1)",[id]);
 await asUser(first);
 check((await q("SELECT name FROM storage.objects WHERE bucket_id='payment-attachments' AND name=$1",[paymentPath])).length,1);
 await directClaim(first);checks++;
 await asUser(principal,true);
 await migrate('20260912080000_member_legacy_access_boundary');
 await asUser(first);
 check((await q("SELECT name FROM storage.objects WHERE bucket_id='payment-attachments'",[])).length,0);
 await reject("INSERT INTO storage.objects(bucket_id,name) VALUES('payment-attachments','member-forbidden.pdf')",[],/row-level security/);
 await reject("INSERT INTO claims(claim_type,claimant_name,amount,created_by) VALUES('benefit','Unverified member claim',1,$1)",[first],/row-level security/);
 await asUser(principal,true);await q('UPDATE users SET is_active=false WHERE id=$1',[first]);
 await asUser(first);
 check((await q("SELECT name FROM storage.objects WHERE bucket_id='payment-attachments'",[])).length,0);
 await reject("INSERT INTO storage.objects(bucket_id,name) VALUES('payment-attachments','inactive-member-forbidden.pdf')",[],/row-level security/);
 await reject("INSERT INTO claims(claim_type,claimant_name,amount,created_by) VALUES('benefit','Inactive member claim',1,$1)",[first],/row-level security/);
 await asUser(principal,true);await q('UPDATE users SET is_active=true WHERE id=$1',[first]);
 // Every prior role keeps the access granted by the existing policies.
 const priorRoles=[[principal,'principal'],['10000000-0000-4000-8000-000000000071','finance'],['10000000-0000-4000-8000-000000000072','hr'],['10000000-0000-4000-8000-000000000073','dept_manager']];
 for(const [id,role] of priorRoles){
   await asUser(principal,true);
   if(id!==principal)await q('INSERT INTO users(id,email,name,role) VALUES($1,$2,$3,$4)',[id,`${role}@example.com`,role,role]);
   await asUser(id);
   check((await q("SELECT name FROM storage.objects WHERE bucket_id='payment-attachments' AND name=$1",[paymentPath])).length,1);
   await q("INSERT INTO storage.objects(bucket_id,name) VALUES('payment-attachments',$1)",[`legacy-${role}.pdf`]);checks++;
   await directClaim(id);checks++;
 }
 // Service-role storage behavior remains unchanged, even if its subject
 // happens to be a member. RLS restrictions target authenticated sessions.
 await db.exec('SET ROLE service_role');await q("SELECT set_config('request.jwt.claim.role','service_role',false)");
 await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[first]);
 check((await q("SELECT name FROM storage.objects WHERE bucket_id='payment-attachments' AND name=$1",[paymentPath])).length,1);
 await q("INSERT INTO storage.objects(bucket_id,name) VALUES('payment-attachments','service-job.pdf')");checks++;
 // A verified member claim still uploads and submits through the definer RPC;
 // the restriction must not disable the feature it is protecting.
 await asUser(first);
 const guardedClaim=await one('SELECT member_prepare_request($1,$2,$3,gen_random_uuid())',['claim',fair,JSON.stringify({...detail,invoiceHash:'c'.repeat(64)})]);
 const guardedPath=`${first}/${guardedClaim.id}/verified.pdf`;
 await q("INSERT INTO storage.objects(bucket_id,name) VALUES('member-invoices',$1)",[guardedPath]);checks++;
 await asUser(principal,true);
 await q("INSERT INTO member_request_attachments(request_id,uploaded_by,object_path,mime_type,size_bytes,content_sha256) VALUES($1,$2,$3,'application/pdf',20,$4)",[guardedClaim.id,first,guardedPath,'c'.repeat(64)]);
 await asUser(first);
 const guardedResult=await one('SELECT member_submit_request($1)',[guardedClaim.id]);
 check(guardedResult.status,'submitted');check(!!guardedResult.claimId);
 check((await q('SELECT name FROM storage.objects WHERE name=$1',[guardedPath])).length,1);
 await asUser(second);check((await q('SELECT name FROM storage.objects WHERE name=$1',[guardedPath])).length,0);
 await principalViewChecks({db,q,one,check,reject,migrate,asUser,principal,first,second,dept,fair,ir,scheme,staff1,staff2,product,run,batch,period,today,memo,allocated});
 await insightChecks({db,q,one,check,reject,migrate,asUser,principal,first,second,dept,fair,ir,scheme,staff1,staff2,product,run,batch,period,today});
 await arenaChecks({db,q,one,check,reject,migrate,asUser,principal,first,second,dept,fair,ir,scheme,staff1,staff2,product,run,batch,period,today});
 await kpiSummaryChecks({db,q,one,check,reject,migrate,asUser,principal,first,second,dept,fair,ir,scheme,staff1,staff2,product,run,batch,period,today});
 console.log(`PASS: ${checks} member SQL checks. Disposable synthetic auth/payroll/Storage; real Revenue and member migrations. No live database connection.`)
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,detail:error.detail,query:error.query,stack:error.name==='AssertionError'?error.stack:undefined},null,2));process.exitCode=1}finally{await db.close()}
