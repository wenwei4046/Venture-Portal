// The shared facts preserve Arena and align every performance read. Fixture
// mutations remain inside this disposable database and are rolled back.
export async function performanceFactsChecks({ q, one, check, reject, migrate, asUser,
  principal, first, fair, ir, scheme, staff1, staff2, period }) {
  const month = period.slice(0, 7)
  const previous = await one("SELECT ($1::date-interval '1 month')::date::text", [period])
  const previousMonth = previous.slice(0, 7)
  const clean = value => JSON.parse(JSON.stringify(value, (key, item) => ['asOf', 'refreshedAt'].includes(key) ? undefined : item))
  const fields = ['sales', 'held', 'orders', 'kpiQty', 'marginRevenue', 'marginCost', 'blindOrders']
  const readArena = async () => {
    await asUser(first)
    const responses = []
    for (const [anchor, window] of [[month, 'monthly'], [previousMonth, 'monthly'], [month, 'quarterly'], [month, 'annual']]) {
      responses.push(await one('SELECT member_arena_snapshot($1,$2,$3)', [fair, anchor, window]))
    }
    return clean(responses)
  }
  const beforeArena = await readArena()
  const beforeMember = await one('SELECT member_data_snapshot()')
  await asUser(principal)
  const beforePrincipal = await one('SELECT member_principal_snapshot()')
  await asUser(principal, true)
  await migrate('20260917060000_member_performance_order_facts')
  check(await readArena(), beforeArena)
  const withoutOrders = ({ orders, ...snapshot }) => clean(snapshot)
  check(withoutOrders(await one('SELECT member_data_snapshot()')), withoutOrders(beforeMember))
  await asUser(principal)
  check(withoutOrders(await one('SELECT member_principal_snapshot()')), withoutOrders(beforePrincipal))

  const agree = async (anchor = month) => {
    await asUser(first)
    const insight = (await one('SELECT member_insight_snapshot($1)', [anchor])).blocks[0]
    const arena = (await one('SELECT member_arena_snapshot($1,$2)', [fair, anchor])).people.find(person => person.id === staff1)
    for (const field of fields) check(Number(insight.me[field]), Number(arena[field]))
    await asUser(principal)
    const selected = (await one('SELECT member_principal_insight_snapshot($1,$2,$3)', [staff1, fair, anchor])).blocks[0]
    check(selected.me, insight.me)
    check(selected.orders, insight.orders)
    check(selected.boards.flatMap(board => board.rows).every(person => !person.self))
    const selectedArena = await one('SELECT member_principal_arena_snapshot($1,$2,$3)', [staff1, fair, anchor])
    check(selectedArena.selfId, '')
    check(selectedArena.people.every(person => !person.self))
    return insight
  }
  const initial = await agree()
  const historical = await agree(previousMonth)
  check(historical.orders.some(order => order.number === 'CARRIED-ORDER'), false)
  check(historical.orders.some(order => order.number === 'PAID-ORDER'))
  check(initial.orders.some(order => order.number === 'CARRIED-ORDER'))
  check(initial.orders.some(order => order.number === 'PAID-ORDER'), false)

  await asUser(principal, true)
  await q('BEGIN')
  try {
    await q('ALTER TABLE sales_orders DISABLE TRIGGER sales_orders_commission_scope')
    await q('ALTER TABLE sales_order_lines DISABLE TRIGGER sales_order_lines_commission_scope')
    await q('ALTER TABLE comm_order_releases DISABLE TRIGGER comm_order_releases_scope')
    const currentBatch = await one("SELECT id FROM sales_import_batches WHERE sub_department_id=$1 AND period_month=$2 AND status='committed'", [fair, period])
    const previousBatch = await one("SELECT id FROM sales_import_batches WHERE sub_department_id=$1 AND period_month=$2 AND status='committed' LIMIT 1", [fair, previous])
    const add = async (number, amount, options = {}) => {
      await asUser(principal, true)
      const id = await one(`INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance,brand_code,manual_margin_pct,created_at)
        VALUES($1,$2,$3,$4,$4,'Facts test','FACTS',$5,$6,$7,'AKEMI',$8,now()+interval '1 minute') RETURNING id`,
      [options.previous ? previousBatch : currentBatch, options.previous ? previous : period, number,
        options.date ?? (options.previous ? previous : period), options.staff ?? staff1, options.total ?? amount, options.balance ?? 0, options.manual ?? null])
      await q(`INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount)
        VALUES($1,1,$2,$3,$4,$5,$6)`, [id, options.group ?? ' mattress ', options.code ?? 'FACT-GOODS', options.qty ?? 1, amount, options.cost === undefined ? amount / 2 : options.cost])
      return id
    }
    const release = async (number, department, recognized, source) => {
      await asUser(principal, true)
      await q(`INSERT INTO comm_order_releases(order_no,run_id,staff_id,sub_department_id,period_month,order_period_month,product_revenue)
        SELECT $1,(SELECT id FROM comm_runs LIMIT 1),$2,$3,$4,$5,0`, [number, staff1, department, recognized, source])
    }
    await add('FACT-CARRY', 1000, { previous: true })
    await add('FACT-RELEASED-NOW', 2000, { previous: true, balance: 2000 })
    await release('FACT-RELEASED-NOW', fair, period, previous)
    // Same document number in another department must not change recognition.
    await release('FACT-CARRY', ir, previous, previous)
    let current = await agree()
    check(Number(current.me.sales), Number(initial.me.sales) + 3000)
    check(current.orders.find(order => order.number === 'FACT-RELEASED-NOW').cleared)
    check((await agree(previousMonth)).orders.some(order => order.number.startsWith('FACT-')), false)

    // Latest cancellation, ownership and future date each suppress older copies.
    const duplicate = await add('CARRIED-ORDER', 2500)
    current = await agree()
    check(Number(current.me.sales), Number(initial.me.sales) + 3000)
    await asUser(principal, true)
    await q('UPDATE sales_orders SET cancelled=true WHERE id=$1', [duplicate])
    current = await agree()
    check(Number(current.me.sales), Number(initial.me.sales) + 500)
    check(current.orders.some(order => order.number === 'CARRIED-ORDER'), false)
    await asUser(principal, true)
    await q('UPDATE sales_orders SET cancelled=false,staff_id=$2 WHERE id=$1', [duplicate, staff2])
    check(Number((await agree()).me.sales), Number(initial.me.sales) + 500)
    await asUser(principal, true)
    await q("UPDATE sales_orders SET staff_id=$2,order_date=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date+1 WHERE id=$1", [duplicate, staff1])
    check(Number((await agree()).me.sales), Number(initial.me.sales) + 500)
    await asUser(principal, true)
    await q('UPDATE sales_orders SET order_date=$2 WHERE id=$1', [duplicate, period])

    const mixed = await add('FACT-MIXED', 100, { cost: 50, total: 1000 })
    await q("INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount) VALUES($1,2,' service ','AK-MOBILE',7,900,NULL)", [mixed])
    await add('FACT-ZERO-MARGIN', 100, { cost: 100 })
    await add('FACT-KPI-ONLY', 400, { group: ' service ', code: 'AK-MOBILE', qty: 3, cost: null })
    await add('FACT-BLIND', 300, { cost: null })
    await add('FACT-NEGATIVE', -50, { manual: 0.8, cost: null })
    await add('FACT-SERVICE', 999, { group: ' service ', cost: null })
    await add('FACT-ROUND-DEPOSIT', 1.01, { balance: 0.51 })
    const tomorrow = await one("SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date+1)::text")
    await add('FACT-FUTURE', 100000, { date: tomorrow })
    current = await agree()
    const order = number => current.orders.find(row => row.number === number)
    check([order('FACT-MIXED').revenue, order('FACT-MIXED').marginRevenue, order('FACT-MIXED').margin, order('FACT-MIXED').kpiQty], [1000, 100, 50, 7])
    check([order('FACT-KPI-ONLY').revenue, order('FACT-KPI-ONLY').marginRevenue, order('FACT-KPI-ONLY').margin, order('FACT-KPI-ONLY').kpiQty], [400, 0, null, 3])
    check([order('FACT-NEGATIVE').revenue, order('FACT-NEGATIVE').marginRevenue, order('FACT-NEGATIVE').margin], [-50, -50, null])
    check(order('FACT-BLIND').margin, null)
    check(order('FACT-SERVICE') === undefined)
    check(order('FACT-FUTURE') === undefined)
    check(order('FACT-ROUND-DEPOSIT').cleared, false)
    check(current.me.blindOrders, initial.me.blindOrders + 1)
    // Fee/KPI revenue must not distort goods-only margin in any Income list.
    await asUser(first)
    const ownIncome = (await one('SELECT member_data_snapshot()')).orders
    await asUser(principal)
    const principalIncome = (await one('SELECT member_principal_snapshot()')).orders
    for (const number of ['FACT-MIXED', 'FACT-KPI-ONLY', 'FACT-NEGATIVE', 'FACT-BLIND']) {
      for (const list of [ownIncome, principalIncome]) {
        const row = list.find(item => item.number === number)
        for (const field of ['revenue', 'marginRevenue', 'margin']) check(row[field], order(number)[field])
      }
    }
    check(ownIncome.some(row => row.number === 'FACT-SERVICE' || row.number === 'FACT-FUTURE'), false)
    check(principalIncome.some(row => row.number === 'FACT-SERVICE' || row.number === 'FACT-FUTURE'), false)
    // The item's configuration is chosen at recognition month end, not order date.
    await asUser(principal, true)
    await q("UPDATE comm_kpi_items SET effective_from=($1::date+interval '1 month - 1 day')::date WHERE scheme_id=$2 AND product_code='AK-MOBILE'", [period, scheme])
    check((await agree()).orders.find(row => row.number === 'FACT-MIXED').kpiQty, 7)
    await asUser(principal, true)
    await q('UPDATE comm_schemes SET enable_kpi=false WHERE id=$1', [scheme])
    const disabled = await agree()
    check(disabled.me.kpiQty, 0)
    check(disabled.orders.some(row => row.number === 'FACT-KPI-ONLY'), false)
    check(disabled.orders.find(row => row.number === 'FACT-MIXED').revenue, 100)
    await asUser(principal, true)
    await q('UPDATE comm_schemes SET enable_kpi=true WHERE id=$1', [scheme])

    // Lists intentionally stop at 200, while full totals keep every document.
    await q(`WITH added AS (
      INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance,brand_code)
      SELECT $1,$2,'ZZZ-FACT-'||n,$2,$2,'Cap test','CAP',$3,1,0,'AKEMI' FROM generate_series(1,205) n RETURNING id
    ) INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount)
      SELECT id,1,'mattress','FACT-GOODS',1,1,0 FROM added`, [currentBatch, period, staff1])
    const capped = await agree()
    check(capped.orders.length, 200)
    check(capped.me.orders > 200)
    check(capped.orders.reduce((sum, row) => sum + (row.cleared ? row.revenue : 0), 0) < capped.me.sales)
  } finally { await q('ROLLBACK'); await asUser(principal, true) }

  for (const role of ['anon', 'authenticated']) check(await one("SELECT has_function_privilege($1,'member_order_facts(uuid,date,date)','EXECUTE')", [role]), false)
  check(await one("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='member_order_facts(uuid,date,date)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')"))
  await asUser(first)
  await reject('SELECT * FROM member_order_facts($1,NULL,NULL)', [scheme], /permission denied/)
  await reject('SELECT member_principal_insight_snapshot($1,$2)', [staff2, fair], /active Principal/)
  await asUser(principal)
  await reject('SELECT member_data_snapshot()', [], /active Revenue staff record|not enabled/)
  await asUser(principal, true)
}
