// Disposable PostgreSQL regression harness; never connects to Supabase.
// Install @electric-sql/pglite outside the repository, then pass its module path:
// node scripts/test-commission-order-isolation.mjs <.../pglite/dist/index.js>
// The unrelated HR/auth baseline below is synthetic; revenue migrations run verbatim.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const modulePath = process.argv[2] || process.env.PGLITE_MODULE
let PGlite, btree_gist
try {
  ;({ PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite'))
  ;({ btree_gist } = await import(modulePath
    ? new URL('contrib/btree_gist.js', pathToFileURL(modulePath)).href
    : '@electric-sql/pglite/contrib/btree_gist'))
} catch {
  console.error('PGlite is required. Install @electric-sql/pglite in a temporary directory and pass its dist/index.js path as the first argument or PGLITE_MODULE.')
  process.exit(1)
}
const db = new PGlite({ extensions: { btree_gist } })
const user = '10000000-0000-0000-0000-000000000001'
const department = '10000000-0000-0000-0000-000000000002'
const staff = '10000000-0000-0000-0000-000000000003'
let checks = 0
async function query(sql, params = []) { return (await db.query(sql, params)).rows }
async function scalar(sql, params = []) { return Object.values((await query(sql, params))[0])[0] }
async function reject(sql, params, pattern) {
  await assert.rejects(() => query(sql, params), pattern)
  checks++
}
async function migration(name) {
  const sql = await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
  try { await db.exec(sql) } catch (error) {
    console.error(`Migration failed: ${name}`)
    throw error
  }
  console.log(`Applied ${name}`)
}

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS $$ SELECT '${user}'::UUID $$;
    CREATE FUNCTION current_user_role() RETURNS TEXT LANGUAGE sql AS $$ SELECT 'principal'::TEXT $$;
    CREATE FUNCTION has_scope(TEXT[]) RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT TRUE $$;
    CREATE TABLE users(id UUID PRIMARY KEY);
    INSERT INTO users VALUES ('${user}');
    CREATE TABLE departments(id UUID PRIMARY KEY, name TEXT);
    INSERT INTO departments VALUES ('${department}', 'Revenue Department');
    CREATE TABLE titles(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), department_id UUID, name TEXT, is_active BOOLEAN DEFAULT TRUE);
    INSERT INTO titles(department_id, name) SELECT '${department}', name FROM unnest(ARRAY[
      'Revenue Specialist', 'Senior Revenue Specialist', 'Team Assistant', 'Senior Team Assistant',
      'Team Leader', 'Senior Team Leader']) name;
    CREATE TABLE hr_staff_costs(id UUID PRIMARY KEY, employee_name TEXT, department_id UUID,
      title_id UUID, designation TEXT, reports_to UUID, status TEXT DEFAULT 'active');
    INSERT INTO hr_staff_costs(id, employee_name, department_id) VALUES ('${staff}', 'Test Seller', '${department}');
    CREATE TABLE commission_rules(id UUID); CREATE TABLE commission_inputs(id UUID);
    CREATE TYPE hr_monthly_payroll_source AS ENUM ('imported', 'manual', 'carried_forward');
    CREATE TABLE payroll_runs(id UUID, period_month DATE, status TEXT);
    CREATE TABLE hr_monthly_payroll(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), staff_id UUID,
      period_month DATE, commission_amount NUMERIC DEFAULT 0, source hr_monthly_payroll_source,
      status TEXT DEFAULT 'draft', created_by UUID, updated_at TIMESTAMPTZ, UNIQUE(staff_id,period_month));
  `)
  for (const name of [
    '20260831010000_revenue_commission_foundation',
    '20260831030000_commission_run_snapshot',
    '20260831040000_commission_run_rpcs',
    '20260903030000_rank_title_ratchet',
    '20260903040000_personal_sales_streak_gate',
    '20260905010000_rank_letters',
    '20260905060000_rank_catalog',
    '20260905010000_erp_live_sync',
  ]) await migration(name)

  // These are the membership migration's schema dependencies for the new Apply
  // function. The unrelated company reporting-line triggers are outside this test.
  await db.exec(`
    ALTER TABLE comm_hierarchy ADD COLUMN title_id UUID REFERENCES titles(id);
    ALTER TABLE comm_hierarchy DROP CONSTRAINT one_position_at_a_time;
    ALTER TABLE comm_hierarchy ADD CONSTRAINT one_position_per_scheme EXCLUDE USING gist (
      scheme_id WITH =, staff_id WITH =, daterange(effective_from,effective_to,'[]') WITH &&
    );
    CREATE FUNCTION comm_period_start() RETURNS DATE LANGUAGE sql STABLE AS $$
      SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE
    $$;
    CREATE FUNCTION comm_scheme_for_department(UUID) RETURNS UUID LANGUAGE sql AS $$
      SELECT c.id FROM comm_schemes c JOIN comm_sub_departments s ON s.id=c.sub_department_id
      WHERE s.department_id=$1 ORDER BY s.created_at, s.id LIMIT 1
    $$;
  `)
  const fair = await scalar("SELECT id FROM comm_sub_departments WHERE code='FAIR'")
  const fairScheme = await scalar('SELECT id FROM comm_schemes WHERE sub_department_id=$1', [fair])
  const historic = await scalar("INSERT INTO sales_import_batches(period_month,file_name,status) VALUES ('2026-07-01','Historic Fair','committed') RETURNING id")
  await migration('20260911010000_commission_rank_packages')
  await migration('20260911020000_commission_order_sub_departments')
  await migration('20260911030000_ir_group_incentives')
  await migration('20260911040000_commission_direct_line_limits')
  assert.equal(await scalar('SELECT sub_department_id FROM sales_import_batches WHERE id=$1', [historic]), fair)
  checks++

  const ir = await scalar("INSERT INTO comm_sub_departments(department_id,name,code,created_at) VALUES ($1,'Investment Renovation','IR',now()+interval '1 minute') RETURNING id", [department])
  const irScheme = await scalar("INSERT INTO comm_schemes(sub_department_id,scheme_name,effective_from,enable_open_bill) VALUES ($1,'IR test','2026-01-01',false) RETURNING id", [ir])
  async function batch(sub, period, status = 'committed') {
    return scalar('INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES ($1,$2,$3,$4) RETURNING id', [sub, period, 'Synthetic import', status])
  }
  async function order(batchId, period, orderNo) {
    return scalar(`INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance)
      VALUES ($1,$2,$3,$2,$2,'Test Seller','TEST SELLER',$4,10000,0) RETURNING id`, [batchId,period,orderNo,staff])
  }
  const fairBatch = await batch(fair, '2026-09-01')
  const irBatch = await batch(ir, '2026-09-01')
  const fairOrder = await order(fairBatch, '2026-09-01', 'SHARED-001')
  const irOrder = await order(irBatch, '2026-09-01', 'SHARED-001')
  checks++ // Same month and document number can exist in two programmes.
  await reject('INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES ($1,$2,$3,$4)', [fair,'2026-09-01','Duplicate','committed'], /unique|duplicate/i)
  await reject('UPDATE sales_import_batches SET sub_department_id=$1 WHERE id=$2', [ir,fairBatch], /cannot change sub-department/)
  await reject('UPDATE sales_orders SET batch_id=$1 WHERE id=$2', [irBatch,fairOrder], /cannot change sub-department/)

  async function save(sub, scheme, batchId, id, orderNo, amount, period = '2026-09-01', sourcePeriod = period) {
    const releases = [{order_id:id,order_no:orderNo,staff_id:staff,order_period_month:sourcePeriod,product_revenue:10000}]
    const statements = [{staff_id:staff,product_commission:amount,total_commission:amount,
      lines:[{component:'product_revenue',source_order_id:id,amount}],brand_margins:[]}]
    return scalar('SELECT save_commission_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [period,sub,scheme,batchId,amount,JSON.stringify([]),JSON.stringify(statements),JSON.stringify(releases),'[]','[]'])
  }
  await assert.rejects(() => save(ir, irScheme, fairBatch, fairOrder, 'SHARED-001', 330), /batch belongs to another/)
  checks++
  await assert.rejects(() => save(ir, irScheme, irBatch, fairOrder, 'SHARED-001', 330), /foreign, changed or retired order/)
  checks++
  const fairRun = await save(fair,fairScheme,fairBatch,fairOrder,'SHARED-001',500)
  const irRun = await save(ir,irScheme,irBatch,irOrder,'SHARED-001',330)
  await query('SELECT apply_commission_run($1)', [fairRun])
  await query('SELECT apply_commission_run($1)', [irRun])
  assert.equal(Number(await scalar('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2', [staff,'2026-09-01'])),830)
  assert.equal(Number(await scalar("SELECT count(*) FROM comm_order_releases WHERE order_no='SHARED-001'")),2)
  checks += 2
  await reject('UPDATE sales_orders SET order_total=20000 WHERE id=$1', [fairOrder], /applied commission run/)
  await query('SELECT reopen_commission_run($1)', [irRun])
  assert.equal(Number(await scalar('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2', [staff,'2026-09-01'])),500)
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_order_releases WHERE sub_department_id=$1', [fair])),1)
  await query('UPDATE sales_orders SET order_total=12000 WHERE id=$1', [irOrder])
  checks += 3

  // File commit retires only its own programme and only after staging succeeds.
  const irReplacement = await batch(ir, '2026-09-01', 'draft')
  await order(irReplacement, '2026-09-01', 'IR-NEW')
  assert.equal(await scalar('SELECT status FROM sales_import_batches WHERE id=$1', [irBatch]),'committed')
  await query('SELECT commit_sales_import_batch($1)', [irReplacement])
  assert.equal(await scalar('SELECT status FROM sales_import_batches WHERE id=$1', [irBatch]),'superseded')
  assert.equal(await scalar('SELECT status FROM sales_import_batches WHERE id=$1', [fairBatch]),'committed')
  checks += 3

  // An applied IR month neither holds nor captures the Fair endpoint's data.
  const irOctober = await batch(ir,'2026-10-01')
  const irOctoberOrder = await order(irOctober,'2026-10-01','ERP-COLLISION')
  const irOctoberRun = await save(ir,irScheme,irOctober,irOctoberOrder,'ERP-COLLISION',330,'2026-10-01')
  await query('SELECT apply_commission_run($1)',[irOctoberRun])
  const payload={docNo:'ERP-COLLISION',snapshotAt:'2026-10-02T01:00:00Z',orderDate:'2026-10-01',status:'CONFIRMED',total:10000,balance:0,salespersonName:'Test Seller',lines:[]}
  const outcome=await scalar('SELECT ingest_erp_sales_order($1)',[JSON.stringify(payload)])
  assert.equal(outcome.status,'applied')
  assert.equal(await scalar("SELECT b.sub_department_id FROM sales_orders o JOIN sales_import_batches b ON b.id=o.batch_id WHERE o.source='erp_sync' AND o.order_no='ERP-COLLISION'"),fair)
  assert.equal(await scalar('SELECT sub_department_id FROM erp_sync_events ORDER BY received_at DESC LIMIT 1'),fair)
  checks += 3
  const fileOverLive=await batch(fair,'2026-10-01','draft')
  await reject('SELECT commit_sales_import_batch($1)',[fileOverLive],/fed live from the ERP/)

  // Release from an earlier source month must protect its inputs, too.
  const earlierOrder = await order(historic,'2026-07-01','CARRY-001')
  const november = await batch(fair,'2026-11-01')
  const laterRun = await save(fair,fairScheme,november,earlierOrder,'CARRY-001',500,'2026-11-01','2026-07-01')
  await query('SELECT apply_commission_run($1)',[laterRun])
  assert.equal(await scalar('SELECT commission_order_period_locked($1,$2)',[fair,'2026-07-01']),true)
  await reject('UPDATE sales_orders SET balance=1 WHERE id=$1',[earlierOrder],/applied commission run/)
  checks++
  await query('SELECT reopen_commission_run($1)',[laterRun])
  await query('UPDATE sales_orders SET balance=1 WHERE id=$1',[earlierOrder])
  checks++

  // Fixed group pay replaces percentage commission. Claims subsidy is retained
  // in the statement but cannot enter cash/payroll or make a trace sum pass.
  const irDecember = await batch(ir,'2026-12-01')
  const packageStatement = {
    staff_id:staff,product_rate:0,product_commission:0,override_commission:0,
    group_incentive:6000,group_subsidy_cap:2000,group_breakdown:[{directStaffId:'A',qualifies:true}],
    total_commission:6000,lines:[{component:'group_incentive',amount:6000}],brand_margins:[],
  }
  const savePackage = (statement, amount=6000) => scalar('SELECT save_commission_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    ['2026-12-01',ir,irScheme,irDecember,amount,'[]',JSON.stringify([statement]),'[]','[]','[]'])
  await assert.rejects(() => savePackage({...packageStatement,total_commission:8000},8000),/components_tally|does not tally/)
  await assert.rejects(() => savePackage({...packageStatement,product_rate:0.04}),/comm_group_replaces_percentage/)
  await assert.rejects(() => savePackage({...packageStatement,lines:[{component:'group_incentive',amount:5999}]}),/does not tally/)
  checks+=3
  const packageRun=await savePackage(packageStatement)
  assert.equal(Number(await scalar('SELECT group_subsidy_cap FROM comm_statements WHERE run_id=$1',[packageRun])),2000)
  await query('SELECT apply_commission_run($1)',[packageRun])
  assert.equal(Number(await scalar('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff,'2026-12-01'])),6000)
  checks+=2
  // Direct capacity is enforced by the actual .400 trigger. Only the older
  // membership constraint and period helper above are baseline shims; these
  // tests do not exercise the unrelated company reports_to sync triggers.
  await query('UPDATE comm_schemes SET direct_line_limit=3 WHERE id=$1',[irScheme])
  const title = await scalar("SELECT id FROM titles WHERE name='Team Leader'")
  const irRank = await scalar("INSERT INTO comm_ranks(scheme_id,title_id,rank_key,label,product_rate,can_recruit,sort_order) VALUES ($1,$2,'test_tl','Rank ?',0.04,true,10) RETURNING id",[irScheme,title])
  const fairRank = await scalar('SELECT id FROM comm_ranks WHERE scheme_id=$1 ORDER BY sort_order LIMIT 1',[fairScheme])
  async function person(name) {
    return scalar('INSERT INTO hr_staff_costs(id,employee_name,department_id) VALUES (gen_random_uuid(),$1,$2) RETURNING id',[name,department])
  }
  async function place(id,parent=null,from='2026-01-01',to=null,scheme=irScheme,rank=irRank) {
    return scalar('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,title_id,effective_from,effective_to,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [id,scheme,parent,rank,title,from,to,user])
  }
  await place(staff)
  const directs = [], secondLayer = []
  for (let line=0;line<3;line++) {
    const direct = await person(`Direct ${line+1}`)
    directs.push(direct)
    await place(direct,staff)
    const children = []
    for (let child=0;child<3;child++) {
      const id=await person(`Direct ${line+1} Child ${child+1}`)
      children.push(id)
      await place(id,direct)
    }
    secondLayer.push(children)
  }
  const fourth=await person('Fourth direct')
  const fourthPosition=await place(fourth)
  await reject('UPDATE comm_hierarchy SET upline_staff_id=$1 WHERE id=$2',[staff,fourthPosition],/limit of 3 direct lines/)
  await query("UPDATE comm_hierarchy SET rate_mode='fixed' WHERE staff_id=$1 AND scheme_id=$2",[directs[0],irScheme])
  checks++ // Same-parent rank/mode updates do not consume a fourth slot.
  await reject('SELECT comm_replace_membership_position($1,$2,$3,$4,$5,$6)',[fourthPosition,staff,irRank,title,null,user],/limit of 3 direct lines/)
  assert.equal(await scalar('SELECT effective_to FROM comm_hierarchy WHERE id=$1',[fourthPosition]),null)
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_hierarchy WHERE staff_id=$1 AND scheme_id=$2',[fourth,irScheme])),1)
  checks+=2 // A failed dated replacement rolled back its preceding close.

  const peakLeader=await person('Historical slots')
  await place(peakLeader)
  await place(await person('Permanent historical slot'),peakLeader)
  await place(await person('First occupant'),peakLeader,'2026-01-01','2026-06-30')
  await place(await person('Next occupant'),peakLeader,'2026-07-01')
  await place(await person('Third slot across both periods'),peakLeader)
  checks++ // 3 simultaneous occupants; 4 distinct historical child rows.
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from,effective_to) VALUES ($1,$2,$3,$4,$5,$6)',
    [await person('Overlap at inclusive endpoint'),irScheme,peakLeader,irRank,'2026-06-30','2026-06-30'],/limit of 3 direct lines/)

  // Fair has no cap; the same people can independently belong to each scheme.
  await place(staff,null,'2026-01-01',null,fairScheme,fairRank)
  for (const id of [...directs,fourth]) await place(id,staff,'2026-01-01',null,fairScheme,fairRank)
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_hierarchy WHERE scheme_id=$1 AND upline_staff_id=$2',[fairScheme,staff])),4)
  checks++

  // Only complete, paid, applied evidence grants the permanent fourth slot.
  await query('SELECT reopen_commission_run($1)',[packageRun])
  await savePackage({...packageStatement,full_spec:true}) // malformed one-group snapshot
  await query('SELECT apply_commission_run($1)',[packageRun])
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_direct_line_entitlements')),0)
  checks++
  await query('SELECT reopen_commission_run($1)',[packageRun])
  const groupEvidence=directs.map((id,line)=>({directStaffId:id,qualifies:true,valid:true,eligible:true,
    secondLayer:secondLayer[line].map(id=>({staffId:id,personalRevenue:200000})),incentive:6000,subsidyCap:2000,totalRevenue:1000000}))
  const fullSpecStatement={...packageStatement,full_spec:true,group_incentive:18000,group_subsidy_cap:6000,
    group_breakdown:groupEvidence,total_commission:18000,lines:[{component:'group_incentive',amount:18000}]}
  await savePackage(fullSpecStatement,18000)
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_direct_line_entitlements')),0)
  checks++ // A computed Full Spec preview has no entitlement.
  await query('SELECT apply_commission_run($1)',[packageRun])
  const entitlement=await scalar('SELECT to_jsonb(e) FROM comm_direct_line_entitlements e WHERE scheme_id=$1 AND staff_id=$2',[irScheme,staff])
  assert.equal(entitlement.source_run_id,packageRun)
  assert.deepEqual(entitlement.group_breakdown,groupEvidence)
  assert.equal(await scalar('SELECT title_id FROM hr_staff_costs WHERE id=$1',[staff]),null)
  checks+=3 // Retains audit evidence without changing the company title.
  await query('SELECT comm_replace_membership_position($1,$2,$3,$4,$5,$6)',[fourthPosition,staff,irRank,title,null,user])
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_hierarchy WHERE scheme_id=$1 AND upline_staff_id=$2 AND effective_to IS NULL',[irScheme,staff])),4)
  checks++
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5)',
    [await person('Fifth direct'),irScheme,staff,irRank,'2026-09-01'],/limit of 4 direct lines/)
  await query('SELECT reopen_commission_run($1)',[packageRun])
  await savePackage({...packageStatement,full_spec:false})
  await query('SELECT apply_commission_run($1)',[packageRun])
  const retained=await scalar('SELECT to_jsonb(e) FROM comm_direct_line_entitlements e WHERE scheme_id=$1 AND staff_id=$2',[irScheme,staff])
  assert.deepEqual(retained,entitlement)
  checks++ // Reopen/recompute/below-target pay cannot erase or re-award SDL.

  // The entitlement table has read permission only for authenticated accounts.
  await db.exec('SET ROLE authenticated')
  await reject('DELETE FROM comm_direct_line_entitlements WHERE scheme_id=$1',[irScheme],/permission denied/)
  await db.exec('RESET ROLE')

  // Open Bill identity follows the programme, and re-imports keep human picks.
  const fairTags = await batch(fair,'2027-01-01')
  const irTags = await batch(ir,'2027-01-01')
  const humanBill = await order(fairTags,'2027-01-01','TAG-HUMAN')
  const irBill = await order(irTags,'2027-01-01','TAG-IR')
  const tagSql='INSERT INTO sales_order_open_bill_tags(order_id,staff_id,event_date,bill_rank,auto_suggested) VALUES ($1,$2,$3,1,false)'
  await query(tagSql,[humanBill,staff,'2027-01-01'])
  await reject(tagSql,[irBill,staff,'2027-01-01'],/Open Bill is disabled/)
  await query('UPDATE comm_schemes SET enable_open_bill=true WHERE id=$1',[irScheme])
  await query(tagSql,[irBill,staff,'2027-01-01'])
  assert.equal(Number(await scalar('SELECT count(*) FROM sales_order_open_bill_tags WHERE staff_id=$1 AND event_date=$2 AND bill_rank=1',[staff,'2027-01-01'])),2)
  checks++
  const newFairTags = await batch(fair,'2027-01-01','draft')
  const transferredBill = await order(newFairTags,'2027-01-01','TAG-HUMAN')
  const newSuggestedBill = await order(newFairTags,'2027-01-01','TAG-NEW')
  await query('UPDATE sales_orders SET sequence_in_day=2 WHERE id=ANY($1::UUID[])',[[transferredBill,newSuggestedBill]])
  assert.equal(Number(await scalar('SELECT commit_sales_import_batch($1)',[newFairTags])),1)
  const humanTag=(await query('SELECT bill_rank,auto_suggested FROM sales_order_open_bill_tags WHERE order_id=$1',[transferredBill]))[0]
  assert.deepEqual(humanTag,{bill_rank:1,auto_suggested:false})
  assert.equal(Number(await scalar('SELECT count(*) FROM sales_order_open_bill_tags WHERE order_id=$1',[humanBill])),0)
  assert.equal(Number(await scalar('SELECT count(*) FROM sales_order_open_bill_tags WHERE order_id=$1',[irBill])),1)
  checks+=4

  // The installation-specific seed runs against a fresh checkpoint-shaped IR
  // catalogue (three percentage defs and no title rungs), while Fair is frozen.
  const seededScheme='caeaf2eb-3931-40be-b3bd-b033814f8046'
  const beforeFair=await scalar('SELECT to_jsonb(s) FROM comm_schemes s WHERE id=$1',[fairScheme])
  const beforeFairRanks=await scalar('SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order) FROM comm_ranks r WHERE scheme_id=$1',[fairScheme])
  const seedSub=await scalar("INSERT INTO comm_sub_departments(department_id,name,code,created_at) VALUES ($1,'IR seed fixture','IR-SEED',now()+interval '2 minutes') RETURNING id",[department])
  await query("INSERT INTO comm_schemes(id,sub_department_id,scheme_name,effective_from) VALUES ($1,$2,'IR seed fixture','2026-01-01')",[seededScheme,seedSub])
  await query("INSERT INTO comm_rank_defs(scheme_id,product_rate,label,sort_order) VALUES ($1,0.03,'Old C',10),($1,0.035,'Old B',20),($1,0.04,'Old A',30)",[seededScheme])
  await migration('20260911050000_configure_ir_rules')
  const seeded=await query('SELECT rank_key,product_rate,can_recruit,personal_sales_threshold,consecutive_months,group_sales_threshold,group_incentive_amount,group_subsidy_cap FROM comm_ranks WHERE scheme_id=$1 ORDER BY sort_order',[seededScheme])
  assert.equal(seeded.length,4)
  assert.deepEqual(seeded.map(r=>Number(r.product_rate)),[0.03,0.035,0.04,0])
  assert.equal(seeded[0].can_recruit,false)
  assert.equal(Number(seeded[1].personal_sales_threshold),200000)
  assert.equal(seeded[1].consecutive_months,2)
  assert.equal(Number(seeded[2].group_sales_threshold),800000)
  assert.equal(Number(seeded[3].group_sales_threshold),1000000)
  assert.equal(Number(seeded[3].group_incentive_amount),6000)
  assert.equal(Number(seeded[3].group_subsidy_cap),2000)
  const seededControls=(await query('SELECT enable_group_incentive,group_sales_depth,override_depth,direct_line_limit,enable_kpi,enable_open_bill,enable_margin_penalty,enable_margin_incentive FROM comm_schemes WHERE id=$1',[seededScheme]))[0]
  assert.deepEqual(seededControls,{enable_group_incentive:true,group_sales_depth:2,override_depth:2,direct_line_limit:3,enable_kpi:false,enable_open_bill:false,enable_margin_penalty:false,enable_margin_incentive:false})
  assert.deepEqual(await scalar('SELECT to_jsonb(s) FROM comm_schemes s WHERE id=$1',[fairScheme]),beforeFair)
  assert.deepEqual(await scalar('SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_order) FROM comm_ranks r WHERE scheme_id=$1',[fairScheme]),beforeFairRanks)
  const seedSql=await readFile(new URL('../supabase/migrations/20260911050000_configure_ir_rules.sql',import.meta.url),'utf8')
  await assert.rejects(()=>db.exec(seedSql),/IR title ladder has changed since this checkpoint/)
  checks+=13

  await migration('20260911060000_progressive_ir_direct_lines')
  const capacity=()=>scalar('SELECT direct_line_limit FROM comm_direct_line_entitlements WHERE scheme_id=$1 AND staff_id=$2',[irScheme,staff])
  const effectiveCapacity=(period,leader=staff)=>scalar('SELECT comm_effective_direct_line_limit($1,$2,$3)',[irScheme,leader,period])
  const openedCapacity=()=>scalar('SELECT opened_direct_line_limit FROM comm_direct_line_entitlements WHERE scheme_id=$1 AND staff_id=$2',[irScheme,staff])
  const awards=()=>query('SELECT direct_line_limit,source_run_id,source_period_month,group_breakdown FROM comm_direct_line_expansion_awards WHERE scheme_id=$1 AND staff_id=$2 ORDER BY direct_line_limit',[irScheme,staff])
  assert.equal(await capacity(),4)
  assert.equal((await awards()).length,1)
  assert.deepEqual((await awards())[0].group_breakdown,groupEvidence)
  assert.equal(await openedCapacity(),4)
  checks+=4 // Migration retains initial evidence and already-opened fourth line.

  const expandedDirects=[...directs,fourth]
  const groupFor=(id,qualifies=true)=>({directStaffId:id,qualifies,valid:true,eligible:true,
    leaderPersonalRevenue:200000,directPersonalRevenue:qualifies?800000:700000,
    secondLayer:[],secondLayerRevenue:0,totalRevenue:qualifies?1000000:900000,
    targetRevenue:1000000,incentive:qualifies?6000:0,subsidyCap:qualifies?2000:0})
  const growthBatches=new Map()
  const growthRuns=new Map()
  async function saveGrowth(period,groups,{apply=true,fullSpec=false,leader=staff}={}) {
    let batchId=growthBatches.get(period)
    if (!batchId) { batchId=await batch(ir,period); growthBatches.set(period,batchId) }
    const existing=growthRuns.get(period)
    if (existing) await query('SELECT reopen_commission_run($1)',[existing])
    const cash=groups.reduce((sum,g)=>sum+g.incentive,0)
    const statement={...packageStatement,staff_id:leader,group_incentive:cash,
      group_subsidy_cap:groups.reduce((sum,g)=>sum+g.subsidyCap,0),group_breakdown:groups,
      full_spec:fullSpec,total_commission:cash,lines:cash?[{component:'group_incentive',amount:cash}]:[]}
    const run=await scalar('SELECT save_commission_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [period,ir,irScheme,batchId,cash,'[]',JSON.stringify([statement]),'[]','[]','[]'])
    growthRuns.set(period,run)
    if (apply) await query('SELECT apply_commission_run($1)',[run])
    return run
  }
  await saveGrowth('2027-02-01',expandedDirects.map(id=>groupFor(id,id===fourth)))
  assert.equal(await capacity(),4)
  checks++ // Only the new fourth group qualifies: pays it but does not open fifth.
  await saveGrowth('2027-03-01',expandedDirects.map(id=>groupFor(id,id!==fourth)))
  assert.equal(await capacity(),4)
  checks++ // Different successful months cannot be accumulated for expansion.
  const fourGroups=expandedDirects.map(id=>groupFor(id))
  await saveGrowth('2027-04-01',fourGroups,{apply:false})
  assert.equal(await capacity(),4)
  assert.equal(await effectiveCapacity('2027-04-01'),4)
  checks+=2 // Preview has no capacity effect.
  await saveGrowth('2027-04-01',fourGroups.map((g,i)=>i===3?{...g,directStaffId:directs[0]}:g))
  assert.equal(await capacity(),4)
  checks++ // Repeated identities cannot stand in for all four distinct lines.
  await saveGrowth('2027-04-01',fourGroups.map((g,i)=>i===3?{...g,totalRevenue:999999}:g))
  assert.equal(await capacity(),4)
  checks++ // A qualification flag cannot override the snapshot target.
  const outsider=await person('Outside this leader snapshot')
  await saveGrowth('2027-04-01',fourGroups.map((g,i)=>i===3?{...g,directStaffId:outsider}:g))
  assert.equal(await effectiveCapacity('2027-04-01'),4)
  assert.equal(await capacity(),4)
  checks+=2 // All existing lines must match the month's actual membership.
  const fourthRun=await saveGrowth('2027-04-01',fourGroups)
  assert.equal(await capacity(),5)
  assert.equal(await effectiveCapacity('2027-04-01'),5)
  assert.equal(await openedCapacity(),4)
  assert.deepEqual((await awards()).map(a=>a.direct_line_limit),[4,5])
  assert.equal((await awards())[1].source_run_id,fourthRun)
  assert.deepEqual((await awards())[1].group_breakdown,fourGroups)
  assert.equal(Number(await scalar('SELECT commission_amount FROM hr_monthly_payroll WHERE staff_id=$1 AND period_month=$2',[staff,'2027-04-01'])),24000)
  checks+=7 // All four same-month groups offer exactly one new slot; cash excludes subsidy.
  await query('SELECT reopen_commission_run($1)',[fourthRun])
  assert.equal(await effectiveCapacity('2027-04-01'),4)
  assert.equal(await capacity(),5)
  growthRuns.delete('2027-04-01')
  checks+=2 // Reopening withdraws the unused offer but retains the audit evidence.
  await saveGrowth('2027-04-01',fourGroups)
  assert.equal(await capacity(),5)
  assert.equal((await awards()).length,2)
  checks+=2 // Reopen/reapply cannot recycle four groups into a sixth slot.
  const fifth=await person('Qualified fifth direct')
  assert.equal(await effectiveCapacity('2027-05-01'),4)
  checks++
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5)',
    [fifth,irScheme,staff,irRank,'2027-05-01'],/limit of 4 direct lines/)
  // April's unused opening permission cannot be banked into May. The four
  // existing lines must all qualify again in the month fifth actually opens.
  await saveGrowth('2027-05-01',fourGroups)
  await place(fifth,staff,'2027-05-01')
  assert.equal(await openedCapacity(),5)
  checks++
  expandedDirects.push(fifth)
  const sixth=await person('Qualified sixth direct')
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5)',
    [sixth,irScheme,staff,irRank,'2027-05-01'],/limit of 5 direct lines/)
  await saveGrowth('2027-05-01',expandedDirects.map(id=>groupFor(id,id!==fifth)))
  assert.equal(await capacity(),5)
  checks++
  await saveGrowth('2027-06-01',expandedDirects.map(id=>groupFor(id,id===fifth)))
  assert.equal(await capacity(),5)
  checks++ // New fifth alone never unlocks sixth when previous groups miss.
  await saveGrowth('2027-07-01',expandedDirects.map(id=>groupFor(id)))
  assert.equal(await capacity(),6)
  assert.deepEqual((await awards()).map(a=>a.direct_line_limit),[4,5,6])
  checks+=2
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5)',
    [directs[0],irScheme,staff,irRank,'2027-07-01'],/one_position_per_scheme|conflicting key|exclusion/i)
  assert.equal(await openedCapacity(),5)
  checks++ // A later insert constraint failure rolls back the apparent opening.
  await query('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [directs[0],irScheme,staff,irRank,'2027-07-01'])
  assert.equal(await openedCapacity(),5)
  checks++ // An ignored conflicting insert never consumes an unopened slot.
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5)',
    [sixth,irScheme,staff,irRank,'2027-08-01'],/limit of 5 direct lines/)
  await place(sixth,staff,'2027-07-01')
  expandedDirects.push(sixth)
  // Exercise ongoing growth, including the user's eight-groups-to-nine example.
  for (let count=6;count<=8;count++) {
    const period=`2027-${String(count+2).padStart(2,'0')}-01`
    await saveGrowth(period,expandedDirects.map(id=>groupFor(id)))
    assert.equal(await capacity(),count+1)
    const next=await person(`Expanded direct ${count+1}`)
    await place(next,staff,period)
    expandedDirects.push(next)
    checks++
  }
  const beforeWeakMonth=await awards()
  await saveGrowth('2027-11-01',expandedDirects.map(id=>groupFor(id,false)))
  assert.equal(await capacity(),9)
  assert.equal(await effectiveCapacity('2027-11-01'),9)
  assert.equal(await openedCapacity(),9)
  assert.deepEqual(await awards(),beforeWeakMonth)
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_hierarchy WHERE scheme_id=$1 AND upline_staff_id=$2 AND effective_to IS NULL',[irScheme,staff])),9)
  checks+=5 // Weak months retain all previously opened slots and existing lines.
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5)',
    [await person('Tenth before nine qualify'),irScheme,staff,irRank,'2027-11-01'],/limit of 9 direct lines/)

  // New initial SDL awards after migration receive the same retained audit row.
  const newLeader=await person('New SDL after migration')
  await place(newLeader,null,'2027-01-01')
  const freshGroups=[]
  for (let i=0;i<3;i++) {
    const direct=await person(`New SDL direct ${i}`)
    await place(direct,newLeader,'2027-01-01')
    const children=[]
    for (let j=0;j<3;j++) {
      const child=await person(`New SDL child ${i}-${j}`)
      await place(child,direct,'2027-01-01')
      children.push({staffId:child,personalRevenue:200000})
    }
    freshGroups.push({...groupFor(direct),directPersonalRevenue:200000,secondLayer:children,secondLayerRevenue:600000})
  }
  await saveGrowth('2027-12-01',freshGroups,{fullSpec:true,leader:newLeader})
  assert.equal(Number(await scalar('SELECT direct_line_limit FROM comm_direct_line_entitlements WHERE scheme_id=$1 AND staff_id=$2',[irScheme,newLeader])),4)
  assert.equal(Number(await scalar('SELECT count(*) FROM comm_direct_line_expansion_awards WHERE scheme_id=$1 AND staff_id=$2',[irScheme,newLeader])),1)
  assert.equal(await effectiveCapacity('2027-12-01',newLeader),4)
  assert.equal(await effectiveCapacity('2028-01-01',newLeader),3)
  checks+=4
  const newFourth=await person('Fourth must open in a qualified month')
  await reject('INSERT INTO comm_hierarchy(staff_id,scheme_id,upline_staff_id,rank_id,effective_from) VALUES ($1,$2,$3,$4,$5)',
    [newFourth,irScheme,newLeader,irRank,'2028-01-01'],/limit of 3 direct lines/)
  await saveGrowth('2028-01-01',freshGroups,{fullSpec:true,leader:newLeader})
  await place(newFourth,newLeader,'2028-01-01')
  assert.equal(await effectiveCapacity('2028-02-01',newLeader),4)
  checks++ // Opened fourth survives the next month even without any qualifying run.
  await db.exec('SET ROLE authenticated')
  assert.equal(Number(await scalar('SELECT direct_line_limit FROM comm_effective_direct_line_limits($1) WHERE staff_id=$2',[irScheme,staff])),9)
  assert.equal(await scalar('SELECT direct_line_limit FROM comm_effective_direct_line_limits($1) WHERE staff_id=$2',[fairScheme,staff]),null)
  checks+=2 // Scoped UI RPC uses opened capacity; Fair stays unlimited.
  await reject('SELECT comm_effective_direct_line_limit($1,$2,$3)',[irScheme,staff,'2027-04-01'],/permission denied/)
  await reject('UPDATE comm_direct_line_entitlements SET direct_line_limit=99 WHERE scheme_id=$1',[irScheme],/permission denied/)
  await reject('DELETE FROM comm_direct_line_expansion_awards WHERE scheme_id=$1',[irScheme],/permission denied/)
  await reject('INSERT INTO comm_direct_line_expansion_awards SELECT * FROM comm_direct_line_expansion_awards',[],/permission denied/)
  await db.exec('RESET ROLE')
  console.log(`PASS: ${checks} order ownership, source locks, feed, payroll, direct-capacity and SDL evidence checks in disposable PostgreSQL.`)
} catch (error) {
  console.error(error.message)
  if (error.where) console.error(error.where)
  if (error.detail) console.error(error.detail)
  process.exitCode = 1
} finally {
  await db.close()
}
