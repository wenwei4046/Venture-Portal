// Disposable PGlite only. Real lifecycle migration and existing roster sync,
// rank/head/reporting triggers; no hosted database or credentials are used.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
async function reject(action, pattern) {
  await db.exec('SAVEPOINT refusal')
  await assert.rejects(action, pattern)
  await db.exec('ROLLBACK TO SAVEPOINT refusal')
  checks++
}
async function productionFunction(file, name) {
  const sql = await readFile(new URL(`${file}.sql`, migrations), 'utf8')
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}(`)
  assert(start >= 0, name)
  const end = sql.indexOf('$$;', sql.toLowerCase().indexOf('as $$', start)) + 3
  await db.exec(sql.slice(start, end))
}
const actor = id(1), revenue = id(10), hr = id(11), otherRevenue = id(12)
const memberTitle = id(20), hrTitle = id(21), otherTitle = id(22), headTitle = id(23), globalTitle = id(24)
const fair = id(100), ir = id(101), partner = id(102), targetHome = id(103)
const staff = id(200), child = id(201), manager = id(202)
const original = '20260910120000_one_line_commission_positions'
const directors = '20260915020000_revenue_directors'
const lifecycle = '20260920023000_employee_chart_lifecycle'
const call = (action, source = ir, kind = null, destination = null, title = null, date = null) => q(
  'SELECT employee_chart_lifecycle($1,$2,$3,$4,$5,$6,$7)', [action, staff, source, kind, destination, title, date])
const open = () => q('SELECT * FROM comm_hierarchy WHERE staff_id=$1 AND effective_to IS NULL ORDER BY scheme_id', [staff])
async function permissions(value = 'revenue,team') { await q("SELECT set_config('test.permissions',$1,true)", [value]) }
let period, today, previous

async function scenario(name, action) {
  await db.exec('BEGIN')
  try {
    await permissions()
    await q("INSERT INTO hr_staff_costs(id,employee_name,department_id,title_id,hire_date,basic_salary,bank_name) VALUES($1,'Person',$2,$3,'2020-01-01',3456,'Saved bank')", [staff, revenue, memberTitle])
    await q('UPDATE comm_hierarchy SET effective_from=$1 WHERE staff_id=$2', [previous, staff])
    await q('INSERT INTO comm_hierarchy(scheme_id,staff_id,title_id,rank_id,effective_from) VALUES($1,$2,$3,$4,$5)', [ir, staff, memberTitle, id(301), previous])
    await q("INSERT INTO comm_statements(staff_id,total_commission) VALUES($1,900)", [staff])
    await db.exec('SET LOCAL ROLE authenticated')
    await action()
    console.log('Passed', name)
  } finally { await db.exec('ROLLBACK') }
}

try {
  await db.exec(`
    CREATE EXTENSION btree_gist; CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${actor}'::uuid $$;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=ANY(string_to_array(current_setting('test.permissions',true),',')) $$;
    CREATE TABLE departments(id uuid PRIMARY KEY,name text,payroll_source text);
    CREATE TABLE title_levels(id uuid PRIMARY KEY,rank integer,name text);
    CREATE TABLE titles(id uuid PRIMARY KEY,department_id uuid,name text,is_active boolean DEFAULT true,
      is_department_head boolean DEFAULT false,level_id uuid REFERENCES title_levels(id));
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY,employee_name text,department_id uuid REFERENCES departments(id),
      title_id uuid REFERENCES titles(id),designation text,reports_to uuid REFERENCES hr_staff_costs(id),status text DEFAULT 'active',
      hire_date date,resignation_date date,basic_salary numeric,bank_name text,
      CHECK(resignation_date IS NULL OR resignation_date>=hire_date));
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY,department_id uuid REFERENCES departments(id),is_active boolean DEFAULT true,created_at timestamptz);
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY,sub_department_id uuid REFERENCES comm_sub_departments(id),is_active boolean DEFAULT true,
      effective_from date DEFAULT '2020-01-01',effective_to date);
    CREATE TABLE comm_ranks(id uuid PRIMARY KEY,scheme_id uuid REFERENCES comm_schemes(id),title_id uuid REFERENCES titles(id),sort_order integer,can_recruit boolean);
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scheme_id uuid REFERENCES comm_schemes(id),staff_id uuid REFERENCES hr_staff_costs(id),
      title_id uuid REFERENCES titles(id),rank_id uuid NOT NULL REFERENCES comm_ranks(id),upline_staff_id uuid REFERENCES hr_staff_costs(id),
      rate_mode text,effective_from date NOT NULL,effective_to date,created_by uuid,
      CHECK(effective_to IS NULL OR effective_to>=effective_from),
      EXCLUDE USING gist(scheme_id WITH =,staff_id WITH =,daterange(effective_from,effective_to,'[]') WITH &&));
    CREATE TABLE comm_sub_department_directors(sub_department_id uuid REFERENCES comm_sub_departments(id),staff_id uuid REFERENCES hr_staff_costs(id));
    CREATE TABLE comm_statements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid REFERENCES hr_staff_costs(id),total_commission numeric);
  `)
  for (const name of ['comm_period_start', 'comm_scheme_for_department', 'comm_floor_rank']) await productionFunction(original, name)
  for (const name of ['title_is_department_head', 'comm_title_can_recruit', 'comm_hierarchy_no_department_head', 'comm_sync_position', 'hr_staff_one_line_sync']) await productionFunction(directors, name)
  await productionFunction('20260920010000_revenue_director_company_reporting', 'hr_staff_commission_line')
  await productionFunction('20260901030000_team_reports_to', 'hr_staff_reports_to_no_cycle')
  await productionFunction('20260903010000_title_levels', 'hr_staff_respects_ladder')
  await db.exec(`
    CREATE TRIGGER one_line AFTER INSERT OR UPDATE OF reports_to,title_id,department_id,status ON hr_staff_costs FOR EACH ROW EXECUTE FUNCTION hr_staff_one_line_sync();
    CREATE TRIGGER company_boundary BEFORE INSERT OR UPDATE OF reports_to,title_id,department_id ON hr_staff_costs FOR EACH ROW EXECUTE FUNCTION hr_staff_commission_line();
    CREATE TRIGGER company_cycle BEFORE INSERT OR UPDATE OF reports_to ON hr_staff_costs FOR EACH ROW EXECUTE FUNCTION hr_staff_reports_to_no_cycle();
    CREATE TRIGGER company_ladder BEFORE INSERT OR UPDATE OF reports_to,title_id ON hr_staff_costs FOR EACH ROW EXECUTE FUNCTION hr_staff_respects_ladder();
    CREATE TRIGGER no_head BEFORE INSERT OR UPDATE OF staff_id,title_id ON comm_hierarchy FOR EACH ROW EXECUTE FUNCTION comm_hierarchy_no_department_head();
  `)
  await db.exec(await readFile(new URL(`${lifecycle}.sql`, migrations), 'utf8'))
  await q('INSERT INTO departments VALUES($1,\'Revenue\',\'commission\'),($2,\'HR\',\'imported\'),($3,\'Revenue Two\',\'commission\')', [revenue, hr, otherRevenue])
  for (const [title, department, name, head] of [[memberTitle,revenue,'Specialist',false],[hrTitle,hr,'HR Specialist',false],[otherTitle,otherRevenue,'Other Specialist',false],[headTitle,revenue,'Director',true],[globalTitle,null,'Global Specialist',false]]) {
    await q('INSERT INTO titles(id,department_id,name,is_department_head) VALUES($1,$2,$3,$4)', [title,department,name,head])
  }
  for (const [scheme,department,index] of [[fair,revenue,0],[ir,revenue,1],[partner,revenue,2],[targetHome,otherRevenue,0]]) {
    await q('INSERT INTO comm_sub_departments(id,department_id,created_at) VALUES($1,$2,$3)', [scheme,department,`2020-01-0${index+1}T00:00:00Z`])
    await q('INSERT INTO comm_schemes(id,sub_department_id) VALUES($1,$1)', [scheme])
    await q('INSERT INTO comm_ranks VALUES($1,$2,$3,1,true)', [id(300 + Number(scheme.slice(-3)) - 100),scheme,department===revenue?memberTitle:otherTitle])
  }
  await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    -- Production allows authenticated reads, while editing the department
    -- catalog requires the admin scope. People operators need neither that
    -- permission nor a row lock that would implicitly require its UPDATE RLS.
    ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY department_read ON departments FOR SELECT USING(auth.uid() IS NOT NULL);
    CREATE POLICY department_update ON departments FOR UPDATE USING(has_perm('admin'));
    ALTER TABLE hr_staff_costs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY staff_read ON hr_staff_costs FOR SELECT USING(has_perm('revenue'));
    CREATE POLICY staff_insert ON hr_staff_costs FOR INSERT WITH CHECK(has_perm('revenue'));
    CREATE POLICY staff_update ON hr_staff_costs FOR UPDATE USING(has_perm('revenue') AND coalesce(current_setting('test.deny_staff_update',true),'')<>'yes');
    ALTER TABLE comm_hierarchy ENABLE ROW LEVEL SECURITY;
    CREATE POLICY membership_read ON comm_hierarchy FOR SELECT USING(has_perm('revenue'));
    CREATE POLICY membership_insert ON comm_hierarchy FOR INSERT WITH CHECK(has_perm('revenue'));
    CREATE POLICY membership_update ON comm_hierarchy FOR UPDATE USING(has_perm('revenue') AND (coalesce(current_setting('test.deny_source_update',true),'')<>'yes' OR scheme_id<>'${ir}'));
    CREATE POLICY membership_delete ON comm_hierarchy FOR DELETE USING(has_perm('revenue'));
    CREATE FUNCTION test_late_membership_refusal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.scheme_id='${ir}' AND NEW.effective_to IS NOT NULL AND current_setting('test.fail_close',true)='yes' THEN
        RAISE EXCEPTION 'Synthetic source close failed' USING ERRCODE='42501';
      END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_late_membership_refusal BEFORE UPDATE ON comm_hierarchy FOR EACH ROW EXECUTE FUNCTION test_late_membership_refusal();
    CREATE FUNCTION test_late_roster_refusal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.department_id IS DISTINCT FROM OLD.department_id AND current_setting('test.fail_roster',true)='yes' THEN
        RAISE EXCEPTION 'Synthetic roster update failed' USING ERRCODE='42501';
      END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_late_roster_refusal BEFORE UPDATE ON hr_staff_costs FOR EACH ROW EXECUTE FUNCTION test_late_roster_refusal();
  `)
  period = await one('SELECT comm_period_start()::text')
  today = await one("SELECT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date::text")
  previous = await one("SELECT (comm_period_start()-interval '1 month')::date::text")

  await scenario('sibling move opens destination and preserves closed history', async () => {
    await call('move', ir, 'subdepartment', partner, memberTitle)
    check((await open()).map(row=>row.scheme_id), [fair,partner])
    check(await one('SELECT effective_to::text FROM comm_hierarchy WHERE staff_id=$1 AND scheme_id=$2',[staff,ir]), await one('SELECT (comm_period_start()-1)::text'))
    check(await one('SELECT total_commission FROM comm_statements WHERE staff_id=$1',[staff]), '900')
  })
  await scenario('existing home destination retains title, rank, upline and rate mode', async () => {
    await q("UPDATE comm_hierarchy SET rate_mode='fixed' WHERE staff_id=$1 AND scheme_id=$2",[staff,fair])
    const before = await q('SELECT * FROM comm_hierarchy WHERE staff_id=$1 AND scheme_id=$2',[staff,fair])
    await call('move',ir,'subdepartment',fair,hrTitle)
    check(await q('SELECT * FROM comm_hierarchy WHERE staff_id=$1 AND scheme_id=$2',[staff,fair]), before)
  })
  await scenario('new destination failure rolls back without removing source', async () => {
    const before = await open()
    await reject(()=>call('move',ir,'subdepartment',partner,hrTitle),/no rung/)
    check(await open(),before)
  })
  await scenario('destination period collision leaves original memberships unchanged', async () => {
    await q('INSERT INTO comm_hierarchy(scheme_id,staff_id,title_id,rank_id,effective_from,effective_to) VALUES($1,$2,$3,$4,$5,$6)', [partner,staff,memberTitle,id(302),period,today])
    const before=await open()
    await reject(()=>call('move',ir,'subdepartment',partner,memberTitle),/conflicting key|exclusion constraint/)
    check(await open(),before)
  })
  await scenario('source RLS refusal leaves every membership unchanged', async () => {
    await q("SELECT set_config('test.deny_source_update','yes',true)")
    await reject(()=>call('move',ir,'subdepartment',partner,memberTitle),/no longer a member/)
    check((await open()).map(row=>row.scheme_id),[fair,ir])
  })
  await scenario('unwritable sibling blocks a main transfer from the writable home membership', async () => {
    await q("SELECT set_config('test.deny_source_update','yes',true)")
    const before=await open()
    await reject(()=>call('move',fair,'department',otherRevenue,otherTitle),/old membership could not be closed/)
    check(await open(),before)
    check(await one('SELECT department_id FROM hr_staff_costs WHERE id=$1',[staff]),revenue)
  })
  await scenario('a source close refusal rolls back the newly inserted destination', async () => {
    await q("SELECT set_config('test.fail_close','yes',true)")
    const before=await open()
    await reject(()=>call('move',ir,'subdepartment',partner,memberTitle),/Synthetic source close failed/)
    check(await open(),before)
  })
  await scenario('removing one current-month membership retains employment and other memberships', async () => {
    await q('UPDATE comm_hierarchy SET effective_from=$1 WHERE staff_id=$2 AND scheme_id=$3',[period,staff,ir])
    await call('remove')
    check((await open()).map(row=>row.scheme_id),[fair])
    check(await one('SELECT count(*)::int FROM comm_hierarchy WHERE staff_id=$1 AND scheme_id=$2',[staff,ir]),0)
    check(await one('SELECT status FROM hr_staff_costs WHERE id=$1',[staff]),'active')
  })
  await scenario('home removal and sibling move are refused', async () => {
    await reject(()=>call('remove',fair),/Home membership/)
    await reject(()=>call('move',fair,'subdepartment',partner,memberTitle),/Home membership/)
    check((await open()).length,2)
  })
  await scenario('cross-parent commission transfer closes all old memberships and syncs new home', async () => {
    await call('move',fair,'department',otherRevenue,otherTitle)
    check((await open()).map(row=>row.scheme_id),[targetHome])
    check(await q('SELECT department_id,title_id,designation,reports_to,basic_salary,bank_name FROM hr_staff_costs WHERE id=$1',[staff]),[{department_id:otherRevenue,title_id:otherTitle,designation:'Other Specialist',reports_to:null,basic_salary:'3456',bank_name:'Saved bank'}])
    check(await one('SELECT count(*)::int FROM comm_hierarchy WHERE staff_id=$1 AND effective_to IS NOT NULL',[staff]),2)
  })
  await scenario('cross-parent salaried transfer removes all current memberships, keeping pay and history', async () => {
    check(await one("SELECT has_perm('admin')"),false)
    check(await q('UPDATE departments SET name=name WHERE id=$1 RETURNING id',[hr]),[])
    await call('move',ir,'department',hr,hrTitle)
    check((await open()).length,0)
    check(await one('SELECT department_id FROM hr_staff_costs WHERE id=$1',[staff]),hr)
    check(await one('SELECT total_commission FROM comm_statements WHERE staff_id=$1',[staff]),'900')
  })
  await scenario('roster RLS refusal leaves old memberships intact', async () => {
    await q("SELECT set_config('test.deny_staff_update','yes',true)")
    const before=await open()
    await reject(()=>call('move',ir,'department',hr,hrTitle),/no longer active or visible/)
    check(await open(),before)
    check(await one('SELECT department_id FROM hr_staff_costs WHERE id=$1',[staff]),revenue)
  })
  await scenario('late roster failure rolls back all old membership closes', async () => {
    await q("SELECT set_config('test.fail_roster','yes',true)")
    const before=await open()
    await reject(()=>call('move',ir,'department',hr,hrTitle),/Synthetic roster update failed/)
    check(await open(),before)
    check(await one('SELECT department_id FROM hr_staff_costs WHERE id=$1',[staff]),revenue)
  })
  await scenario('rejects invalid main title and missing receiving commission ladder', async () => {
    await reject(()=>call('move',ir,'department',hr,memberTitle),/active employee title/)
    await reject(()=>call('move',ir,'department',otherRevenue,globalTitle),/home scheme and a ladder/)
    check((await open()).length,2)
  })
  await scenario('source downlines block remove, transfer, and termination without moving children', async () => {
    await q("INSERT INTO hr_staff_costs(id,employee_name,department_id,title_id) VALUES($1,'Child',$2,$3)",[child,revenue,memberTitle])
    await q('INSERT INTO comm_hierarchy(scheme_id,staff_id,title_id,rank_id,upline_staff_id,effective_from) VALUES($1,$2,$3,$4,$5,$6)',[ir,child,memberTitle,id(301),staff,period])
    await reject(()=>call('remove'),/still report/)
    await reject(()=>call('move',ir,'subdepartment',partner,memberTitle),/still report/)
    await reject(()=>call('move',ir,'department',hr,hrTitle),/reports or commission downlines/)
    await reject(()=>call('terminate',ir,null,null,null,today),/reports or commission downlines/)
    check(await one('SELECT upline_staff_id FROM comm_hierarchy WHERE staff_id=$1 AND scheme_id=$2',[child,ir]),staff)
  })
  await scenario('active company reports block main transfer and termination', async () => {
    await q("INSERT INTO hr_staff_costs(id,employee_name,department_id,title_id,reports_to) VALUES($1,'Child',$2,$3,$4)",[child,revenue,memberTitle,staff])
    await reject(()=>call('move',ir,'department',hr,hrTitle),/reports or commission downlines/)
    await reject(()=>call('terminate',ir,null,null,null,today),/reports or commission downlines/)
  })
  await scenario('termination writes last day and preserves commission and payroll history', async () => {
    const before = await open()
    await call('terminate',ir,null,null,null,today)
    check(await q('SELECT status,resignation_date::text,department_id,basic_salary,bank_name FROM hr_staff_costs WHERE id=$1',[staff]),[{status:'inactive',resignation_date:today,department_id:revenue,basic_salary:'3456',bank_name:'Saved bank'}])
    check(await open(),before)
    check(await one('SELECT total_commission FROM comm_statements WHERE staff_id=$1',[staff]),'900')
    await reject(()=>call('remove'),/no longer active/)
  })
  await scenario('a manager can terminate after their last child leaves, retaining both commission histories', async () => {
    await q("INSERT INTO hr_staff_costs(id,employee_name,department_id,title_id,reports_to) VALUES($1,'Child',$2,$3,$4)",[child,revenue,memberTitle,staff])
    await q('INSERT INTO comm_statements(staff_id,total_commission) VALUES($1,300)',[child])
    const positions = await q('SELECT * FROM comm_hierarchy ORDER BY staff_id,scheme_id')
    const statements = await q('SELECT * FROM comm_statements ORDER BY staff_id')
    await q('SELECT employee_chart_lifecycle($1,$2,$3,$4,$5,$6,$7)', ['terminate',child,fair,null,null,null,today])
    await call('terminate',fair,null,null,null,today)
    check(await q('SELECT id,status,resignation_date::text FROM hr_staff_costs ORDER BY id'),[
      {id:staff,status:'inactive',resignation_date:today},
      {id:child,status:'inactive',resignation_date:today},
    ])
    check(await q('SELECT * FROM comm_hierarchy ORDER BY staff_id,scheme_id'),positions)
    check(await one('SELECT count(*)::int FROM comm_hierarchy'),3)
    check(await q('SELECT * FROM comm_statements ORDER BY staff_id'),statements)
    check(await one('SELECT count(*)::int FROM comm_statements'),2)
  })
  await scenario('date bounds, stale source and all permission gates are enforced in SQL', async () => {
    await reject(()=>call('terminate',ir,null,null,null,'2019-12-31'),/hire date and today/)
    await reject(()=>call('terminate',ir,null,null,null,'9999-12-31'),/hire date and today/)
    await reject(()=>call('remove',partner),/no longer a member/)
    await reject(()=>call('remove',targetHome),/department changed/)
    await permissions('revenue')
    await reject(()=>call('move',ir,'department',hr,hrTitle),/People Management access/)
    await reject(()=>call('terminate',ir,null,null,null,today),/People Management access/)
    await permissions('team')
    await reject(()=>call('remove'),/Revenue access/)
  })
  console.log(`Employee chart SQL: ${checks} checks passed.`)
} catch (error) {
  console.error(error.message, error.code ?? '', error.where ?? '')
  process.exitCode = 1
} finally { await db.close() }
