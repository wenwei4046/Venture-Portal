// ERP groups use lower case; configuration historically used upper case.
// Reproduce the empty Insight/Income reads before applying the exact migration.
export async function insightGroupChecks({ q, one, check, migrate, asUser,
  principal, first, fair, scheme, staff1, period }) {
  await asUser(principal, true)
  await q('BEGIN')
  try {
    await q('ALTER TABLE sales_orders DISABLE TRIGGER sales_orders_commission_scope')
    await q('ALTER TABLE sales_order_lines DISABLE TRIGGER sales_order_lines_commission_scope')
    const batch = await one("SELECT id FROM sales_import_batches WHERE sub_department_id=$1 AND period_month=$2 AND status='committed'", [fair, period])
    const ids = []
    for (const [suffix, amount, cost, manual] of [['COSTED', 1000, 400, null], ['BLIND', 300, null, null], ['MANUAL', 200, null, 0.7]]) {
      const id = await one(`INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance,brand_code,manual_margin_pct)
        VALUES($1,$2,$3,$2,$2,'Group test','GROUP',$4,$5,0,'AKEMI',$6) RETURNING id`, [batch, period, `GROUP-${suffix}`, staff1, amount + 50, manual])
      ids.push(id)
      await q(`INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount)
        VALUES($1,1,'MATTRESS','GROUP-GOODS',1,$2,$3),($1,2,' SeRvIcE ','GROUP-SERVICE',1,50,NULL)`, [id, amount, cost])
    }
    const read = async () => {
      await asUser(first)
      const employee = await one('SELECT member_insight_snapshot()')
      const income = (await one('SELECT member_data_snapshot()')).orders
      await asUser(principal)
      return { employee, income,
        principal: await one('SELECT member_principal_insight_snapshot($1,$2)', [staff1, fair]),
        principalIncome: (await one('SELECT member_principal_snapshot()')).orders }
    }
    const expected = await read()
    const expectedOrders = expected.employee.blocks[0].orders.filter(order => order.number.startsWith('GROUP-'))
    check(expectedOrders.find(order => order.number === 'GROUP-COSTED').revenue, 1000)
    check(expectedOrders.find(order => order.number === 'GROUP-COSTED').margin, 60)
    check(expectedOrders.find(order => order.number === 'GROUP-BLIND').margin, null)
    check(expectedOrders.find(order => order.number === 'GROUP-MANUAL').margin, 70)
    await asUser(principal, true)
    await q("UPDATE sales_order_lines SET item_group=CASE WHEN line_no=1 THEN ' mattress ' ELSE item_group END WHERE order_id=ANY($1::uuid[])", [ids])
    const broken = await read()
    check(Number(broken.employee.blocks[0].me.sales), Number(expected.employee.blocks[0].me.sales) - 1500)
    check(broken.employee.blocks[0].orders.some(order => order.number.startsWith('GROUP-')), false)
    check(broken.principalIncome.filter(order => order.number.startsWith('GROUP-')).every(order => Number(order.revenue) === 0))
    await asUser(principal, true)
    await migrate('20260917050000_member_insight_group_matching')
    check(await read(), expected)
    // Configuration itself can contain whitespace and mixed case too.
    await asUser(principal, true)
    await q("UPDATE comm_item_groups SET item_group=' MaTtReSs ' WHERE scheme_id=$1 AND item_group='MATTRESS'", [scheme])
    check(await read(), expected)
    await asUser(first)
    const insight = (await one('SELECT member_insight_snapshot()')).blocks[0].me
    const arena = (await one('SELECT member_arena_snapshot($1)', [fair])).people.find(person => person.id === staff1)
    // Historical margin semantics differ before the subsequent shared-facts
    // migration; the casing fix alone must restore the same current sales.
    for (const key of ['sales', 'held', 'orders', 'kpiQty']) check(Number(insight[key]), Number(arena[key]))
  } finally {
    await q('ROLLBACK')
    await asUser(principal, true)
  }
  // Keep the migration applied for the following alignment regressions.
  await migrate('20260917050000_member_insight_group_matching')
}
