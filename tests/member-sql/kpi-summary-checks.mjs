// Real migration against disposable PGlite fixtures. No hosted writes.
export async function kpiSummaryChecks({ q, one, check, reject, migrate, asUser,
  principal, first, second, fair, ir, scheme, staff1, staff2, period, today }) {
  await asUser(principal, true)
  await migrate('20260916030000_member_kpi_summary')
  await q('BEGIN')
  // Rejected SQL aborts a transaction; isolate every expected denial.
  const denied = async (sql, params = [], pattern = /access|permission|membership|not found|not linked|profile/i) => {
    await q('SAVEPOINT expected_denial')
    try { await reject(sql, params, pattern) }
    finally { await q('ROLLBACK TO SAVEPOINT expected_denial'); await q('RELEASE SAVEPOINT expected_denial') }
  }
  try {
    const previous = await one("SELECT ($1::date-interval '1 month')::date::text", [period])
    const previousEnd = await one("SELECT ($1::date-interval '1 day')::date::text", [period])
    const next = await one("SELECT ($1::date+interval '1 month')::date::text", [period])
    const tomorrow = await one("SELECT ($1::date+interval '1 day')::date::text", [today])
    const foreignScheme = await one('SELECT id FROM comm_schemes WHERE sub_department_id=$1 LIMIT 1', [ir])
    await q('DELETE FROM comm_kpi_items WHERE scheme_id=$1', [scheme])
    await q('DELETE FROM comm_kpi_thresholds WHERE scheme_id=$1', [scheme])
    await q('UPDATE comm_schemes SET enable_kpi=true,deposit_threshold_pct=.5 WHERE id=$1', [scheme])
    await q(`INSERT INTO comm_kpi_items(scheme_id,product_code,product_name,kpi_amount,effective_from) VALUES
      ($1,'PILLOW-SKU','Configured pillow',50,$2),($1,'PROTECTOR-SKU','Configured protector',60,$2),
      ($1,'UNSOLD-SKU','Configured unsold item',20,$2)`, [scheme, previous])
    await q(`INSERT INTO comm_kpi_thresholds(scheme_id,tier_label,min_qty,bonus_pct,effective_from,effective_to) VALUES
      ($1,'First',10,.2,$2,NULL),($1,'Next',25,.35,$2,NULL),
      ($1,'Expired',1,.1,$2,$3),($1,'Future',5,.15,$4,NULL)`, [scheme, previous, previousEnd, next])

    const guards = [['sales_import_batches','sales_import_batches_scope'],['sales_orders','sales_orders_commission_scope'],
      ['sales_order_lines','sales_order_lines_commission_scope'],['comm_order_releases','comm_order_releases_scope']]
    for (const [table, trigger] of guards) await q(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`)
    const batches = {}
    for (const month of [period, previous]) {
      batches[month] = await one("SELECT id FROM sales_import_batches WHERE sub_department_id=$1 AND period_month=$2 AND status='committed' LIMIT 1", [fair, month])
    }
    const draft = await one("INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES($1,$2,'kpi-draft','draft') RETURNING id", [fair, period])
    const order = async (number, { staff = staff1, month = period, code = 'PILLOW-SKU', qty = 1, balance = 0, cancelled = false, batch, date = today } = {}) => {
      const id = await one(`INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance,brand_code,cancelled)
        VALUES($1,$2,$3,$4,$4,'KPI fixture','KPI',$5,1000,$6,'AKEMI',$7) RETURNING id`, [batch ?? batches[month], month, number, date, staff, balance, cancelled])
      await q("INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount) VALUES($1,1,'ACC',$2,$3,0,10)", [id, code, qty])
      return id
    }
    await order('KPI-PILLOW-FIVE', { code: '  pillow-sku  ', qty: 5 })
    await order('KPI-PROTECTOR-FIVE', { code: 'PROTECTOR-SKU', qty: 5 })
    await order('KPI-HELD', { qty: 100, balance: 1000 })
    await order('KPI-CANCELLED', { qty: 100, cancelled: true })
    await order('KPI-OTHER-STAFF', { staff: staff2, qty: 987 })
    await order('KPI-UNCOMMITTED', { qty: 100, batch: draft })
    await order('KPI-NON-KPI', { code: 'ORDINARY-BEDFRAME', qty: 100 })
    await order('KPI-FUTURE-ORDER', { qty: 100, date: tomorrow })
    // Duplicate committed imports must not count twice or revive stale ownership/cancellation.
    const duplicate = await order('KPI-PILLOW-FIVE', { month: previous, date: previous, qty: 200 })
    const cancelledCopy = await order('KPI-LATEST-CANCELLED', { month: previous, date: previous, qty: 200 })
    await order('KPI-LATEST-CANCELLED', { cancelled: true, qty: 200 })
    const transferredCopy = await order('KPI-TRANSFERRED', { month: previous, date: previous, qty: 200 })
    await order('KPI-TRANSFERRED', { staff: staff2, qty: 200 })
    await q("UPDATE sales_orders SET created_at=now()-interval '1 day' WHERE id=ANY($1::uuid[])", [[duplicate,cancelledCopy,transferredCopy]])
    await asUser(first)
    const base = await one('SELECT member_kpi_summary($1)', [scheme])
    check(base.period, period.slice(0, 7)); check(base.schemeId, scheme); check(base.enabled)
    check(Number(base.total), 10); check(base.threshold, 10); check(base.hit, true)
    check(base.items.map(item => [item.productCode, Number(item.quantity)]), [['PILLOW-SKU',5],['PROTECTOR-SKU',5],['UNSOLD-SKU',0]])
    check(base.items[0].label, 'Configured pillow')
    check(Object.keys(base).sort(), ['asOf','enabled','hit','items','period','schemeId','threshold','total'])
    check(/"(?:commission|salary|cost|bonus)":/.test(JSON.stringify(base)), false)
    await denied('SELECT member_kpi_summary(gen_random_uuid())', [], /active membership/)
    await denied('SELECT member_kpi_summary($1)', [foreignScheme], /active membership/)

    await asUser(principal, true)
    await order('KPI-CARRY', { month: previous, date: previous, qty: 2 })
    await order('KPI-OLD-RELEASED', { month: previous, date: previous, qty: 50 })
    await order('KPI-CARRY-RELEASED-NOW', { month: previous, date: previous, code: 'PROTECTOR-SKU', qty: 3, balance: 1000 })
    await q(`INSERT INTO comm_order_releases(order_no,run_id,staff_id,sub_department_id,period_month,order_period_month,product_revenue)
      SELECT 'KPI-OLD-RELEASED',(SELECT id FROM comm_runs LIMIT 1),$1,$2,$3,$3,0`, [staff1, fair, previous])
    await q(`INSERT INTO comm_order_releases(order_no,run_id,staff_id,sub_department_id,period_month,order_period_month,product_revenue)
      SELECT 'KPI-CARRY-RELEASED-NOW',(SELECT id FROM comm_runs LIMIT 1),$1,$2,$3,$4,0`, [staff1, fair, period, previous])
    await asUser(first)
    const carried = await one('SELECT member_kpi_summary($1)', [scheme])
    check(Number(carried.total), 15); check(carried.threshold, 10); check(carried.hit, true)
    check(Number(carried.items[0].quantity), 7)
    check(Number(carried.items[1].quantity), 8)

    await asUser(principal, true)
    await q('UPDATE comm_kpi_thresholds SET min_qty=18 WHERE scheme_id=$1 AND min_qty=10', [scheme])
    await asUser(first)
    const higher = await one('SELECT member_kpi_summary($1)', [scheme])
    check(higher.threshold, 18); check(higher.hit, false)
    await asUser(principal, true)
    await q('DELETE FROM comm_kpi_thresholds WHERE scheme_id=$1', [scheme])
    await asUser(first)
    const unconfigured = await one('SELECT member_kpi_summary($1)', [scheme])
    check(unconfigured.threshold, null); check(unconfigured.hit, null); check(Number(unconfigured.total), 15)

    await asUser(principal, true)
    await q('UPDATE comm_schemes SET enable_kpi=false WHERE id=$1', [scheme])
    await asUser(first)
    const off = await one('SELECT member_kpi_summary($1)', [scheme])
    check(off.enabled, false); check(off.items, []); check(Number(off.total), 0); check(off.hit, null)

    await asUser(principal, true)
    await q("INSERT INTO user_permissions(user_id,permission_key,granted) VALUES($1,'member_portal',false) ON CONFLICT(user_id,permission_key) DO UPDATE SET granted=false", [first])
    await asUser(first)
    await denied('SELECT member_kpi_summary($1)', [scheme], /portal access/)
    await asUser(principal, true)
    await q("DELETE FROM user_permissions WHERE user_id=$1 AND permission_key='member_portal'", [first])
    await q('UPDATE users SET is_active=false WHERE id=$1', [first])
    await asUser(first)
    await denied('SELECT member_kpi_summary($1)', [scheme], /portal access/)
    await asUser(principal)
    await denied('SELECT member_kpi_summary($1)', [scheme])
    await asUser(principal, true)
    check(await one("SELECT has_function_privilege('anon','public.member_kpi_summary(uuid)','EXECUTE')"), false)
    check(await one("SELECT has_function_privilege('authenticated','public.member_kpi_summary(uuid)','EXECUTE')"), true)
    check(await one("SELECT pronargs FROM pg_proc WHERE oid='public.member_kpi_summary(uuid)'::regprocedure"), 1)
    check(!!second)
  } finally {
    await q('ROLLBACK')
    await asUser(principal, true)
  }
}
