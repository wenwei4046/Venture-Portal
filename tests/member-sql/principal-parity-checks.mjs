// The production migration is applied verbatim to disposable fixtures. Compare
// employee results across the refactor, then exercise actual Principal context
// and deliberately hostile caller/context combinations.
export async function principalParityChecks({ db, q, one, check, reject, migrate, asUser,
  principal, first, second, fair, ir, scheme, staff1, staff2, period }) {
  const month = period.slice(0, 7)
  const clean = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'asOf' ? undefined : item))
  const readEmployee = async () => ({
    insight: await one('SELECT member_insight_snapshot($1)', [month]),
    historic: await one("SELECT member_insight_snapshot(to_char($1::date-interval '1 month','YYYY-MM'))", [period]),
    kpi: await one('SELECT member_kpi_summary($1)', [scheme]),
    arena: await one('SELECT member_arena_snapshot($1,$2)', [fair, month]),
    quarterly: await one("SELECT member_arena_snapshot($1,$2,'quarterly')", [fair, month]),
    annual: await one("SELECT member_arena_snapshot($1,$2,'annual')", [fair, month]),
    map: await one('SELECT member_org_map()'),
    identity: await one("SELECT member_data_snapshot()->'profile'->>'id'"),
  })
  await asUser(first)
  const before = await readEmployee()
  await asUser(principal, true)
  const identityAndWrites = async () => q(`SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p WHERE p.oid IN ('member_staff_id()'::regprocedure,
      'member_arena_save_brand_weeks(uuid,text,integer,jsonb)'::regprocedure,
      'member_prepare_request(text,uuid,jsonb,uuid,uuid)'::regprocedure)
    ORDER BY 1`)
  const unchangedBoundaries = await identityAndWrites()
  await migrate('20260917040000_member_principal_function_parity')
  check(await identityAndWrites(), unchangedBoundaries)
  await asUser(first)
  check(clean(await readEmployee()), clean(before))

  const selectedCalls = [
    ['SELECT member_principal_insight_snapshot($1,$2,$3)', [staff1, fair, month]],
    ['SELECT member_principal_kpi_summary($1,$2)', [staff1, scheme]],
    ['SELECT member_principal_arena_snapshot($1,$2,$3)', [staff1, fair, month]],
  ]
  const allCalls = [...selectedCalls, ['SELECT member_principal_org_map($1)', [fair]]]
  await asUser(principal)
  const insight = await one(...selectedCalls[0])
  const kpi = await one(...selectedCalls[1])
  const arena = await one(...selectedCalls[2])
  const map = await one(...allCalls[3])
  for (const response of [insight, kpi, arena]) {
    check(response.principalView)
    check(response.viewedStaffId, staff1)
    check(/"(?:salary|rate|commission|unit_cost|product_commission)":/.test(JSON.stringify(response)), false)
    check(JSON.stringify(response).includes('77777'), false)
  }
  check(insight.blocks.length, 1)
  check(insight.blocks[0].membershipId, fair)
  check(insight.blocks[0].me, before.insight.blocks[0].me)
  check(insight.blocks[0].downline, before.insight.blocks[0].downline)
  check(insight.blocks[0].orders, before.insight.blocks[0].orders)
  check(insight.blocks[0].boards.flatMap(board => board.rows).every(person => person.self === false))
  check(clean(kpi), { ...clean(before.kpi), principalView: true, viewedStaffId: staff1 })
  check(clean(arena), { ...clean(before.arena), selfId: '',
    people: before.arena.people.map(person => ({ ...person, self: false })), principalView: true, viewedStaffId: staff1 })
  for (const window of ['quarterly', 'annual']) {
    const actual = await one('SELECT member_principal_arena_snapshot($1,$2,$3,$4)', [staff1, fair, month, window])
    check(clean(actual), { ...clean(before[window]), selfId: '',
      people: before[window].people.map(person => ({ ...person, self: false })), principalView: true, viewedStaffId: staff1 })
  }
  check(map.principalView)
  check(map.departments.map(department => department.id).sort(), [fair, ir].sort())
  check(map.people.map(person => person.id), before.map.people.map(person => person.id))
  check(map.people.every(person => person.self === false && person.mine === false))
  check(map.departments.every(department => department.mine === false))
  check(/"(?:salary|rate|commission|rank)":/.test(JSON.stringify(map)), false)
  check(await one('SELECT auth.uid()'), principal)
  const profile = (await one('SELECT member_principal_snapshot()')).profile
  check(profile.id, principal)
  check(profile.salary, null)
  check((await one('SELECT member_principal_snapshot()')).memberships.flatMap(m => m.people).every(p => p.self === false))

  // The same real person has exactly the same measures under both read paths.
  await asUser(second)
  const other = await readEmployee()
  await asUser(principal)
  const otherInsight = await one('SELECT member_principal_insight_snapshot($1,$2)', [staff2, fair])
  check(otherInsight.blocks[0].me, other.insight.blocks[0].me)
  check(otherInsight.blocks[0].downline, [])
  const otherArena = await one('SELECT member_principal_arena_snapshot($1,$2)', [staff2, fair])
  check(otherArena.brandWeeks, null)
  check(otherArena.people.every(p => p.self === false))
  check((await one('SELECT member_principal_kpi_summary($1,$2)', [staff2, scheme])).total, other.kpi.total)

  // No role claim or ordinary privileged/member permission substitutes for the
  // stored active Principal role. These all execute as authenticated sessions.
  for (const user of [first, second, '', '10000000-0000-4000-8000-000000000071',
    '10000000-0000-4000-8000-000000000072', '10000000-0000-4000-8000-000000000073']) {
    await asUser(user)
    await q("SELECT set_config('request.jwt.claim.role','principal',false)")
    for (const call of allCalls) await reject(...call, /active Principal/)
  }
  await asUser(principal)
  await q("SELECT set_config('request.jwt.claim.role','revenue_member',false)")
  check((await one(...selectedCalls[0])).viewedStaffId, staff1)
  check(await one('SELECT auth.uid()'), principal)
  check(await one("SELECT current_setting('request.jwt.claim.role')"), 'revenue_member')

  await asUser(principal, true)
  const irScheme = await one('SELECT id FROM comm_schemes WHERE sub_department_id=$1 LIMIT 1', [ir])
  const privateSignatures = [
    'member_principal_department(uuid)', 'member_principal_context(uuid,uuid,uuid)',
    'member_insight_for_staff(uuid,text,uuid,boolean)', 'member_org_map_for_department(uuid,uuid)',
    'member_kpi_for_staff(uuid,uuid)', 'member_arena_for_staff(uuid,uuid,uuid,text,text,boolean)',
  ]
  const publicSignatures = [
    'member_principal_insight_snapshot(uuid,uuid,text)', 'member_principal_kpi_summary(uuid,uuid)',
    'member_principal_arena_snapshot(uuid,uuid,text,text)', 'member_principal_org_map(uuid)',
  ]
  for (const signature of [...privateSignatures, ...publicSignatures]) {
    check(await one("SELECT has_function_privilege('anon',$1,'EXECUTE')", [signature]), false)
    check(await one("SELECT has_function_privilege('authenticated',$1,'EXECUTE')", [signature]), publicSignatures.includes(signature))
    check(await one("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')", [signature]))
  }
  await asUser(principal)
  await reject('SELECT member_principal_context($1,$2)', [staff1, fair], /permission denied/)
  await reject('SELECT member_insight_for_staff($1,NULL,NULL,true)', [staff2], /permission denied/)
  await reject('SELECT member_kpi_for_staff($1,$2)', [staff2, scheme], /permission denied/)
  await reject('SELECT member_arena_for_staff($1,$2,$3,NULL,\'monthly\',true)', [staff2, fair, scheme], /permission denied/)
  await reject('SELECT member_org_map_for_department(NULL,NULL)', [], /permission denied/)
  await reject('SELECT member_principal_insight_snapshot($1,$2)', [staff1, ir], /active membership/)
  await reject('SELECT member_principal_kpi_summary($1,$2)', [staff1, irScheme], /active membership/)
  await reject('SELECT member_principal_arena_snapshot($1,$2)', [staff1, ir], /active membership/)
  await reject('SELECT member_principal_insight_snapshot(gen_random_uuid(),$1)', [fair], /active membership/)
  await reject('SELECT member_principal_insight_snapshot(NULL,$1)', [fair], /active membership/)
  await reject('SELECT member_principal_kpi_summary($1,gen_random_uuid())', [staff1], /active Revenue department/)
  await reject('SELECT member_principal_org_map(gen_random_uuid())', [], /active Revenue department/)
  await reject("SELECT member_principal_arena_snapshot($1,$2,'2026-13')", [staff1, fair], /valid month/)
  await reject("SELECT member_principal_arena_snapshot($1,$2,NULL,'weekly')", [staff1, fair], /valid ranking period/)

  // All mutations below are rollback-only fixture probes. Each failed RPC is
  // isolated in a savepoint so an expected authorization error does not hide
  // a later assertion behind an aborted transaction.
  const denied = async (...args) => {
    await q('SAVEPOINT expected_denial')
    try { await reject(...args) }
    finally { await q('ROLLBACK TO SAVEPOINT expected_denial'); await q('RELEASE SAVEPOINT expected_denial') }
  }
  const scenario = async (mutation, params, calls = selectedCalls, pattern = /active membership|active Revenue department|active Principal/) => {
    await asUser(principal, true)
    await q('BEGIN')
    try {
      await q(mutation, params)
      await asUser(principal)
      for (const call of calls) await denied(...call, pattern)
    } finally { await q('ROLLBACK'); await asUser(principal, true) }
  }
  await scenario('UPDATE users SET is_active=false WHERE id=$1', [principal], allCalls)
  await scenario("UPDATE users SET role='hr' WHERE id=$1", [principal], allCalls)
  for (const update of ["status='inactive'", "hire_date=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date+1",
    "resignation_date=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date-1", 'department_id=gen_random_uuid()']) {
    await scenario(`UPDATE hr_staff_costs SET ${update} WHERE id=$1`, [staff1])
  }
  await scenario('UPDATE comm_sub_departments SET is_active=false WHERE id=$1', [fair], allCalls)
  await scenario("UPDATE departments SET payroll_source='imported' WHERE id=(SELECT department_id FROM comm_sub_departments WHERE id=$1)", [fair], allCalls)
  // Ended yesterday: from no later than yesterday, so the window stays valid on the 1st of a month too — the scheme and
  // the seats start on the month's 1st, and on that day "to = yesterday" alone fell before "from" (effective_window;
  // CI failed every run on 2026-11-01, KL).
  const endedYesterday = "effective_from=least(effective_from,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date-1),effective_to=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date-1"
  for (const update of ['is_active=false', "effective_from=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date+1", endedYesterday]) {
    await scenario(`UPDATE comm_schemes SET ${update} WHERE id=$1`, [scheme], allCalls)
  }
  for (const update of ["effective_from=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date+1", endedYesterday]) {
    await scenario(`UPDATE comm_hierarchy SET ${update} WHERE scheme_id=$1 AND staff_id=$2`, [scheme, staff1])
  }
  await scenario('UPDATE titles SET is_department_head=true WHERE id=(SELECT title_id FROM hr_staff_costs WHERE id=$1)', [staff1])
  await scenario('UPDATE titles SET is_department_head=true WHERE id=(SELECT title_id FROM comm_hierarchy WHERE scheme_id=$1 AND staff_id=$2)', [scheme, staff1])
  for (const permission of ['member_portal', 'member_insight']) {
    await q('BEGIN')
    try {
      await q('INSERT INTO user_permissions(user_id,permission_key,granted) VALUES($1,$2,false) ON CONFLICT(user_id,permission_key) DO UPDATE SET granted=false', [first, permission])
      await asUser(first)
      await denied('SELECT member_insight_snapshot()', [], /not enabled/)
      await denied('SELECT member_arena_snapshot($1)', [fair], /not enabled/)
      if (permission === 'member_portal') await denied('SELECT member_kpi_summary($1)', [scheme], /portal access/)
      else check((await one('SELECT member_kpi_summary($1)', [scheme])).schemeId, scheme)
    } finally { await q('ROLLBACK'); await asUser(principal, true) }
  }
  // Account provisioning is not a precondition for Principal reads.
  await q('BEGIN')
  try {
    await q('UPDATE hr_staff_costs SET user_id=NULL WHERE id=$1', [staff1])
    await asUser(principal)
    for (const call of selectedCalls) check((await one(...call)).viewedStaffId, staff1)
    await asUser(first)
    await denied('SELECT member_data_snapshot()', [], /active Revenue staff record/)
  } finally { await q('ROLLBACK'); await asUser(principal, true) }

  // Principal reads do not make the selected staff the caller of any write.
  await asUser(principal)
  await reject('SELECT member_data_snapshot()', [], /active Revenue staff record|not enabled/)
  await reject('SELECT member_arena_save_brand_weeks($1,$2,4,$3)', [fair, month,
    JSON.stringify({ AKEMI: 4, ERGOTEX: 0, ZANOTTI: 0, DUNLOP: 0 })])
  await reject('SELECT member_prepare_request(\'claim\',$1,\'{}\'::jsonb,gen_random_uuid())', [fair])
  await asUser(first)
  check(await one("SELECT member_data_snapshot()->'profile'->>'id'"), staff1)
  check((await one('SELECT member_arena_snapshot($1)', [fair])).brandWeeks, before.arena.brandWeeks)
  await reject('SELECT * FROM member_arena_brand_weeks', [], /permission denied/)
  await asUser(principal, true)
  check(await one("SELECT pronargs FROM pg_proc WHERE oid='member_arena_save_brand_weeks(uuid,text,integer,jsonb)'::regprocedure"), 4)
  await db.exec('SET ROLE anon')
  for (const call of allCalls) await reject(...call, /permission denied/)
  await asUser(principal, true)
}
