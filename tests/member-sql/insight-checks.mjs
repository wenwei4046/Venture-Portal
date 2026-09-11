// Insight: live sales, the department ranking and downline status.
//
// Runs after the existing member and Principal fixtures. SQL is loaded
// verbatim; every mutation below affects only the disposable in-memory
// database. The checks concentrate on the two things that would be worst to
// get wrong: a number that disagrees with what the run will pay, and a board
// that leaks somebody's pay.
export async function insightChecks({q,one,check,reject,migrate,asUser,
 principal,first,second,dept,fair,ir,scheme,staff1,staff2,period,today}) {
 await asUser(principal,true)
 await migrate('20260915020000_revenue_directors')
 await migrate('20260916010000_member_insight')

 const child=await one('SELECT staff_id FROM comm_hierarchy WHERE scheme_id=$1 AND upline_staff_id=$2',[scheme,staff1])
 const previous=await one("SELECT (($1::date)-interval '1 month')::date::text",[period])

 // Half the order total must be in before anything pays, so the gate is
 // visible rather than a no-op, and one KPI product so units can be counted.
 await q('UPDATE comm_schemes SET deposit_threshold_pct=0.5 WHERE id=$1',[scheme])
 await q("INSERT INTO comm_kpi_items(scheme_id,product_code,product_name,kpi_amount,effective_from) VALUES($1,'AK-MOBILE','Real Mattress',50,$2)",[scheme,previous])

 // An applied run locks its months against order changes — a real rule, and
 // not one under test here. The scenario is loaded with the scope guards off,
 // exactly as a fixture loader would, and they go straight back on.
 const guards=['sales_import_batches_scope','sales_orders_commission_scope',
  'sales_order_lines_commission_scope','comm_order_releases_scope']
 const setGuards=async(state)=>{for(const g of guards){
  const table=g.startsWith('sales_import')?'sales_import_batches'
   :g.startsWith('sales_order_lines')?'sales_order_lines'
   :g.startsWith('sales_orders')?'sales_orders':'comm_order_releases'
  await q(`ALTER TABLE ${table} ${state} TRIGGER ${g}`)}}
 await setGuards('DISABLE')

 // An order's month must match its batch's, so last month gets its own.
 const batches={[period]:await one("SELECT id FROM sales_import_batches WHERE sub_department_id=$1 AND status='committed' LIMIT 1",[fair]),
  [previous]:await one("INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES($1,$2,'last-month','committed') RETURNING id",[fair,previous])}
 const order=async(no,staff,month,total,balance,group='MATTRESS',amount=null,cost=null,code='AK-MOBILE')=>{
  const id=await one("INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance,brand_code) VALUES($1,$2,$3,$2,$2,'Agent','AGENT',$4,$5,$6,'AKEMI') RETURNING id",
   [batches[month],month,no,staff,total,balance])
  await q('INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount) VALUES($1,1,$2,$3,1,$4,$5)',
   [id,group,code,amount??total,cost])
  return id
 }
 // Under the deposit gate: real revenue, but nothing it can pay yet.
 await order('HELD-ORDER',staff1,period,6000,6000,'MATTRESS',6000,3000)
 // Last month, cleared, and no run has released it: it pays in THIS month.
 await order('CARRIED-ORDER',staff1,previous,2500,0,'MATTRESS',2500,1500)
 // Last month and already released: paid once, never counted again.
 const released=await order('PAID-ORDER',staff1,previous,9000,0,'MATTRESS',9000,4000)
 await q("INSERT INTO comm_order_releases(order_no,run_id,staff_id,sub_department_id,period_month,order_period_month,product_revenue) SELECT 'PAID-ORDER',(SELECT id FROM comm_runs LIMIT 1),$1,$2,$3,$3,9000",[staff1,fair,previous])
 check(!!released)
 // A non-commissionable item group is not sales at all. Its product must not
 // be a KPI item either: a KPI product pays wherever it is sold, so one here
 // would be counted — correctly — and prove nothing about the group filter.
 await order('TRANSPORT-ORDER',staff1,period,700,0,'TRANS',700,0,'DELIVERY-FEE')
 // An order with no cost on its line and no keyed-in margin: in sales, out of margin.
 await order('BLIND-ORDER',staff1,period,1000,0,'MATTRESS',1000,null)
 await setGuards('ENABLE')

 await asUser(first)
 const insight=await one('SELECT member_insight_snapshot()')
 check(insight.period,period.slice(0,7))
 check(insight.live)
 check(insight.blocks.length,1)
 const block=insight.blocks[0]
 check(block.department,'Fair')

 // 4,000 from this month's cleared order + 2,500 carried in + 1,000 with no
 // cost. The 6,000 held by the deposit gate, the 9,000 already released and
 // the 700 of transport are all correctly absent.
 check(Number(block.me.sales),7500)
 check(Number(block.me.held),6000)
 check(block.me.orders,3)
 check(Number(block.me.marginRevenue),6500)
 check(block.me.blindOrders,1)

 // Every order the member may see, with the facts a margin band reads.
 const numbers=block.orders.map(o=>o.number).sort()
 check(numbers,['BLIND-ORDER','CARRIED-ORDER','HELD-ORDER','SELF-ORDER'])
 check(block.orders.find(o=>o.number==='HELD-ORDER').cleared,false)
 check(block.orders.find(o=>o.number==='CARRIED-ORDER').carried,true)
 // 2,500 at a 1,500 cost: a margin derived from line costs, not keyed in.
 check(block.orders.find(o=>o.number==='CARRIED-ORDER').margin,40)
 check(block.orders.find(o=>o.number==='CARRIED-ORDER').manual,false)
 check(block.orders.find(o=>o.number==='BLIND-ORDER').margin,null)
 check(block.orders.some(o=>o.number==='PAID-ORDER'),false)
 check(block.orders.some(o=>o.number==='TRANSPORT-ORDER'),false)

 // The totals must be exactly what the orders beside them add up to. Asserted
 // against the list rather than a constant because the earlier fixtures own
 // SELF-ORDER and may add a line to it; the invariant is what matters.
 const cleared=block.orders.filter(o=>o.cleared)
 const sum=(rows,f)=>rows.reduce((total,row)=>total+f(row),0)
 const costed=cleared.filter(o=>o.margin!==null)
 check(Number(block.me.sales),sum(cleared,o=>Number(o.revenue)))
 check(Number(block.me.held),sum(block.orders.filter(o=>!o.cleared),o=>Number(o.revenue)))
 check(Number(block.me.marginRevenue),sum(costed,o=>Number(o.revenue)))
 check(Math.round(Number(block.me.marginCost)),
  Math.round(sum(costed,o=>Number(o.revenue)*(1-Number(o.margin)/100))))
 check(Number(block.me.kpiQty),sum(cleared,o=>Number(o.kpiQty)))
 check(block.me.blindOrders,cleared.length-costed.length)

 // The board ranks everybody placed in the scheme, including the member with
 // no user account and no orders at all.
 const own=block.boards.find(b=>b.own)
 check(own.department,'Fair')
 check(own.rows.length,3)
 check(own.rows.find(r=>r.staffId===staff1).self,true)
 check(own.rows.find(r=>r.staffId===staff2).self,false)
 check(Number(own.rows.find(r=>r.staffId===staff2).sales)>0,true)
 check(Number(own.rows.find(r=>r.staffId===child).sales),0)
 check(own.rows.find(r=>r.staffId===child).orders,0)
 check(own.rows.every(r=>r.name&&r.title))

 // Nothing on a board is pay. Two's commission (98,765) and salary (77,777)
 // are in this database and must not be anywhere in this response.
 const asText=JSON.stringify(insight)
 check(asText.includes('98765'),false)
 check(asText.includes('77777'),false)
 check(own.rows.every(r=>!('commission' in r)&&!('salary' in r)&&!('rate' in r)),true)

 // The downline is the caller's subtree, and never the caller.
 check(block.downline.length,1)
 check(block.downline[0].staffId,child)
 check(block.downline[0].depth,1)
 check(block.downline[0].uplineId,staff1)
 check(block.downline.some(d=>d.staffId===staff1),false)

 // Two, who has no downline, sees a board of the same three and an empty leg.
 await asUser(second)
 const theirs=(await one('SELECT member_insight_snapshot()')).blocks[0]
 check(theirs.downline,[])
 check(theirs.boards.find(b=>b.own).rows.length,3)
 // The board and the person's own page must agree about that person.
 check(Number(theirs.me.sales),Number(own.rows.find(r=>r.staffId===staff2).sales))
 check(Number(theirs.boards.find(b=>b.own).rows.find(r=>r.staffId===staff1).sales),Number(block.me.sales))
 check(JSON.stringify(theirs).includes('98765'),false)

 // A month that has not arrived is clamped to the current one rather than
 // reporting an empty future.
 check((await one("SELECT member_insight_snapshot('2999-01')")).period,period.slice(0,7))
 check((await one("SELECT member_insight_snapshot('nonsense')")).period,period.slice(0,7))
 check((await one("SELECT member_insight_snapshot($1)",[previous.slice(0,7)])).period,previous.slice(0,7))
 check((await one("SELECT member_insight_snapshot($1)",[previous.slice(0,7)])).live,false)

 // The map: every sub-department of the caller's department, everybody in
 // one, names and reporting lines only.
 await asUser(first)
 const map=await one('SELECT member_org_map()')
 check(map.departments.map(d=>d.name).sort(),['Fair','IR'])
 check(map.departments.find(d=>d.name==='Fair').mine,true)
 check(map.people.length,3)
 check(map.people.every(p=>p.name&&p.title&&p.departmentId&&p.schemeId))
 check(map.people.find(p=>p.staffId===staff1).self,true)
 check(map.people.find(p=>p.staffId===child).parentId,`${scheme}:${staff1}`)
 check(map.people.find(p=>p.staffId===staff1).parentId,null)
 check(map.people.find(p=>p.staffId===staff2).self,false)
 check(JSON.stringify(map).includes('77777'),false)
 check(JSON.stringify(map).includes('rank'),false)
 check(!!ir)

 // The permission is real: a member who loses it loses Insight, and keeps
 // everything else.
 check((await one('SELECT member_insight_snapshot()')).blocks.length,1)
 await asUser(principal,true)
 await q("INSERT INTO user_permissions(user_id,permission_key,granted) VALUES($1,'member_insight',false)",[first])
 await asUser(first)
 check(await one("SELECT has_perm('member_insight')"),false)
 await reject('SELECT member_insight_snapshot()',[],/not enabled/)
 check((await one('SELECT member_data_snapshot()')).configured,true)
 check(!!(await one('SELECT member_org_map()')).people.length)
 await asUser(principal,true)
 await q("DELETE FROM user_permissions WHERE user_id=$1 AND permission_key='member_insight'",[first])

 // The neutral member boundary still caps what a member may hold, and now
 // admits exactly one more key.
 await asUser(first)
 const keys=await one('SELECT current_permissions()')
 check([...keys].sort(),['member_insight','member_memos','member_portal','member_quote','member_requests'])

 // Nobody without a linked Revenue staff record reaches any of it.
 await asUser(principal)
 await reject('SELECT member_insight_snapshot()')
 await reject('SELECT member_org_map()')
 check(!!dept&&!!today)
}
