// Runs after the existing member regression fixtures. SQL is loaded verbatim;
// all mutations below affect only the disposable in-memory test database.
export async function principalViewChecks({db,q,one,check,reject,migrate,asUser,
 principal,first,second,dept,fair,ir,scheme,staff1,staff2,product,run,batch,period,today,memo,allocated}) {
 await asUser(principal,true)
 await migrate('20260912090000_member_principal_view')
 check(await one('SELECT count(*)::integer FROM hr_staff_costs WHERE user_id=$1',[principal]),0)
 const irScheme=await one("INSERT INTO comm_schemes(sub_department_id,scheme_name,effective_from,enable_kpi) VALUES($1,'IR principal test',$2,false) RETURNING id",[ir,period])

 // An ordinary authenticated Principal can read this overview with no staff
 // link. Its own identity is retained, and the roster contains every active
 // position, including staff who have no user account.
 await asUser(principal)
 const snapshot=await one('SELECT member_principal_snapshot()')
 check(snapshot.principalView)
 check(snapshot.profile,{id:principal,userId:principal,name:'Principal',email:'principal@example.com',salary:null})
 check(snapshot.demo,false)
 check(snapshot.configured)
 check(snapshot.memberships.length,2)
 const fairView=snapshot.memberships.find(x=>x.schemeId===scheme)
 check({title:fairView.title,rank:fairView.rank,rate:fairView.rate,calculator:fairView.calculator},
  {title:'Principal',rank:'All members',rate:0,calculator:true})
 check(fairView.people.map(x=>x.id).sort(),[staff1,staff2,allocated.detail.allocatedStaffId].sort())
 check(fairView.people.every(x=>x.self===false))
 check(fairView.people.find(x=>x.id===allocated.detail.allocatedStaffId).parentId,staff1)
 check(fairView.people.every(x=>!('salary' in x)&&!('email' in x)))
 check(fairView.occupied,3)
 const emptyIr=snapshot.memberships.find(x=>x.schemeId===irScheme)
 check({id:emptyIr.id,people:emptyIr.people,occupied:emptyIr.occupied,calculator:emptyIr.calculator},
  {id:ir,people:[],occupied:0,calculator:false})
 check(snapshot.departments.map(x=>x.id).sort(),[fair,ir].sort())
 check(snapshot.incomes[0].total,98865)
 check(snapshot.orders.map(x=>x.number).sort(),['SECRET-ORDER','SELF-ORDER'])
 check(snapshot.orders.every(x=>x.schemeId===scheme))
 check(snapshot.memos.find(x=>x.id===memo.id).acknowledgedAt,null)
 check(snapshot.memos.find(x=>x.id===memo.id).readAt,null)
 const context=await one('SELECT member_principal_quote_context($1)',[scheme])
 check(context.schemeId,scheme)
 check(context.subDepartmentId,fair)
 check(context.bands.length>0)
 await reject('SELECT member_principal_quote_context($1)',[irScheme],/active Fair scheme/)
 await reject('SELECT member_principal_quote_context(gen_random_uuid())',[],/active Fair scheme/)
 await asUser(principal,true)
 await q('UPDATE comm_sub_departments SET code=NULL WHERE id=$1',[ir])
 await asUser(principal)
 check((await one('SELECT member_principal_snapshot()')).memberships.find(x=>x.schemeId===irScheme).calculator,false)
 await asUser(principal,true)
 await q("UPDATE comm_sub_departments SET code='IR' WHERE id=$1",[ir])
 await asUser(principal)
 // New Principal RPCs do not relax the ordinary member staff boundary.
 await reject('SELECT member_data_snapshot()',[],/active Revenue staff record|access is not enabled/)
 await reject('SELECT member_quote_context($1)',[scheme],/active Revenue staff record|access is not enabled/)
 await asUser(first)
 const member=await one('SELECT member_data_snapshot()')
 check(member.profile.id,staff1)
 check(member.profile.salary,2500)
 check(member.incomes[0].total,100)
 check(member.memberships[0].people.some(x=>x.id===staff2),false)
 check(member.orders.length,1)
 await reject('SELECT unit_cost FROM comm_products')

 // Authorization uses the stored, active Principal role. Neither another
 // privileged role, an absent subject, nor a claimed role can opt into it.
 for(const id of [first,second,'10000000-0000-4000-8000-000000000071',
  '10000000-0000-4000-8000-000000000072','10000000-0000-4000-8000-000000000073','']){
  await asUser(id)
  await q("SELECT set_config('request.jwt.claim.role','principal',false)")
  await reject('SELECT member_principal_snapshot()',[],/active Principal/)
  await reject('SELECT member_principal_quote_context($1)',[scheme],/active Principal/)
 }
 await asUser(principal,true)
 await q('UPDATE users SET is_active=false WHERE id=$1',[principal])
 await asUser(principal)
 await reject('SELECT member_principal_snapshot()',[],/active Principal/)
 await reject('SELECT member_principal_quote_context($1)',[scheme],/active Principal/)
 await asUser(principal,true)
 await q("UPDATE users SET is_active=true,role='hr' WHERE id=$1",[principal])
 await asUser(principal)
 await reject('SELECT member_principal_snapshot()',[],/active Principal/)
 await reject('SELECT member_principal_quote_context($1)',[scheme],/active Principal/)
 await asUser(principal,true)
 await q("UPDATE users SET role='principal' WHERE id=$1",[principal])
 await db.exec('SET ROLE anon')
 await reject('SELECT member_principal_snapshot()')
 await reject('SELECT member_principal_quote_context($1)',[scheme])
 await asUser(principal,true)
 for(const signature of ['member_principal_snapshot()','member_principal_quote_context(uuid)']){
  check(await one('SELECT has_function_privilege(\'anon\',$1,\'EXECUTE\')',[signature]),false)
  check(await one('SELECT has_function_privilege(\'authenticated\',$1,\'EXECUTE\')',[signature]))
  check(await one("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')",[signature]))
 }

 // Commission component totals come from unique staff statements, not the
 // denormalized run totals or overlapping group and brand rollups.
 await q('UPDATE comm_runs SET total_commission=999999 WHERE id=$1',[run])
 await q(`UPDATE comm_statements SET product_commission=100,override_commission=7,kpi_commission=3,
  open_bill_bonus=4,margin_incentive=5,total_commission=119,
  product_revenue=5000,group_revenue=12000,deferred_revenue=600,kpi_qty=2
  WHERE run_id=$1 AND staff_id=$2`,[run,staff1])
 await q(`UPDATE comm_statements SET product_commission=200,override_commission=11,kpi_commission=13,
  open_bill_bonus=17,margin_incentive=19,total_commission=260,
  product_revenue=7000,group_revenue=7000,deferred_revenue=400,kpi_qty=3
  WHERE run_id=$1 AND staff_id=$2`,[run,staff2])
 await q(`INSERT INTO comm_statement_brand_margins(statement_id,brand_code,revenue,cost,margin_pct)
  SELECT id,'AKEMI',group_revenue,group_revenue/2,0.5 FROM comm_statements WHERE run_id=$1`,[run])
 const lastMonth=await one("SELECT ($1::date-interval '1 month')::date::text",[period])
 const previousRun=await one("INSERT INTO comm_runs(sub_department_id,period_month,scheme_id,status) VALUES($1,$2,$3,'locked') RETURNING id",[fair,lastMonth,scheme])
 await q('INSERT INTO comm_statements(run_id,staff_id,product_commission,total_commission,product_revenue) VALUES($1,$2,10,10,300)',[previousRun,staff1])
 const irBatch=await one("INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES($1,$2,'ir-orders','committed') RETURNING id",[ir,period])
 await order('PR-IR-ORDER',{source:irBatch})
 const irRun=await one("INSERT INTO comm_runs(sub_department_id,period_month,scheme_id,batch_id,status) VALUES($1,$2,$3,$4,'applied') RETURNING id",[ir,period,irScheme,irBatch])
 await q('INSERT INTO comm_statements(run_id,staff_id,group_incentive,total_commission,product_revenue,group_revenue) VALUES($1,$2,600,600,1500,13000)',[irRun,staff1])
 await asUser(principal)
 const aggregate=await one('SELECT member_principal_snapshot()')
 check(aggregate.incomes.length,3)
 const income=aggregate.incomes.find(x=>x.schemeId===scheme&&x.period===period.slice(0,7))
 check(Object.fromEntries(['personal','override','kpi','openBill','incentive','group','total','sales','groupSales','deferred','status'].map(k=>[k,income[k]])),
  {personal:300,override:18,kpi:16,openBill:21,incentive:24,group:0,total:379,sales:12000,groupSales:12000,deferred:1000,status:'computed'})
 check(income.kpis,[{label:'Team sales',current:12000,target:null,unit:'RM'},{label:'KPI products',current:5,target:null,unit:'items'}])
 check(income.brands,[])
 check(income.rank,'All members')
 check(aggregate.incomes.find(x=>x.period===lastMonth.slice(0,7)).status,'locked')
 check(aggregate.incomes.find(x=>x.period===lastMonth.slice(0,7)).total,10)
 const irIncome=aggregate.incomes.find(x=>x.schemeId===irScheme)
 check({group:irIncome.group,total:irIncome.total,sales:irIncome.sales,status:irIncome.status},
  {group:600,total:600,sales:1500,status:'applied'})

 // Catalog needs explicit publication and an active, current Fair brand.
 await asUser(principal,true)
 const unpublished=await one("INSERT INTO comm_products(item_code,product_name,brand_code,unit_cost) VALUES('PR-UNPUBLISHED','Unpublished','AKEMI',8888) RETURNING id")
 const irProduct=await one("INSERT INTO comm_products(item_code,product_name,brand_code,unit_cost) VALUES('PR-IR','IR only','IR-ONLY',9876) RETURNING id")
 await q("INSERT INTO comm_brands(scheme_id,code,name) VALUES($1,'IR-ONLY','IR only')",[irScheme])
 await q("INSERT INTO member_product_options(product_id,category) VALUES($1,'Accessory')",[irProduct])
 await q("INSERT INTO comm_brands(scheme_id,code,name,is_active) VALUES($1,'PR-INACTIVE','Inactive',false)",[scheme])
 const inactiveProduct=await one("INSERT INTO comm_products(item_code,product_name,brand_code,unit_cost) VALUES('PR-INACTIVE','Inactive brand','PR-INACTIVE',4567) RETURNING id")
 await q("INSERT INTO member_product_options(product_id,category) VALUES($1,'Sofa')",[inactiveProduct])
 await asUser(principal)
 const catalogue=(await one('SELECT member_principal_snapshot()')).products
 check(catalogue.map(x=>x.id),[product])
 check(catalogue.some(x=>[unpublished,irProduct,inactiveProduct].includes(x.id)),false)
 await asUser(principal,true)
 await q('UPDATE member_product_options SET available=false WHERE product_id=$1',[product])
 await asUser(principal)
 check((await one('SELECT member_principal_snapshot()')).products[0].available,false)
 await asUser(principal,true)
 await q('UPDATE member_product_options SET available=true WHERE product_id=$1',[product])

 // Goods margin excludes fees, includes free KPI cost, respects a manual
 // override, and stays unknown when any included line cost is missing.
 const selfOrder=await one("SELECT id FROM sales_orders WHERE order_no='SELF-ORDER'")
 await q("INSERT INTO comm_kpi_items(scheme_id,product_code,kpi_amount,effective_from) VALUES($1,'PR-GIFT',0,$2)",[scheme,period])
 await q(`INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount)
  VALUES($1,2,'TRANS','DELIVERY',1,500,0),($1,3,'OTHER','DISPOSAL',1,125,0),($1,4,'OTHER',' pr-gift ',1,0,100)`,[selfOrder])
 await q("UPDATE sales_orders SET manual_margin_pct=0.32 WHERE order_no='SECRET-ORDER'")
 async function order(number,{owner=staff2,cancelled=false,source=batch,cost=2000}={}){
  const id=await one(`INSERT INTO sales_orders(batch_id,period_month,order_no,order_date,event_date,agent_name,agent_key,staff_id,order_total,balance,brand_code,cancelled)
   VALUES($1,$2,$3,$2,$2,'Principal test','PRTEST',$4,4000,0,'AKEMI',$5) RETURNING id`,[source,period,number,owner,cancelled])
  await q("INSERT INTO sales_order_lines(order_id,line_no,item_group,product_code,qty,line_amount,cost_amount) VALUES($1,1,'MATTRESS','AK-MOBILE',1,4000,$2)",[id,cost])
  return id
 }
 await order('PR-MISSING-COST',{cost:null})
 await order('PR-UNASSIGNED',{owner:null})
 await order('PR-CANCELLED',{cancelled:true})
 const draftBatch=await one("INSERT INTO sales_import_batches(sub_department_id,period_month,file_name,status) VALUES($1,$2,'uncommitted','draft') RETURNING id",[fair,period])
 await order('PR-UNCOMMITTED',{source:draftBatch})
 await asUser(principal)
 const orders=(await one('SELECT member_principal_snapshot()')).orders
 check(orders.map(x=>x.number).sort(),['PR-MISSING-COST','PR-UNASSIGNED','SECRET-ORDER','SELF-ORDER'])
 check(orders.find(x=>x.number==='SELF-ORDER').revenue,4000)
 check(orders.find(x=>x.number==='SELF-ORDER').margin,47.5)
 check(orders.find(x=>x.number==='SECRET-ORDER').margin,32)
 check(orders.find(x=>x.number==='SECRET-ORDER').manual)
 check(orders.find(x=>x.number==='PR-MISSING-COST').margin,null)
 check(orders.find(x=>x.number==='PR-UNASSIGNED').margin,50)
 check(orders.every(x=>x.schemeId===scheme))

 // All Revenue requests are visible, including another person's; drafts are
 // never included. The Principal does not borrow a member's memo receipt.
 await asUser(principal,true)
 const otherRequest=await one(`INSERT INTO member_requests(created_by,staff_id,sub_department_id,kind,status,title,idempotency_key)
  VALUES($1,$2,$3,'replacement','submitted','Other member request',gen_random_uuid()) RETURNING id`,[second,staff2,ir])
 const draftRequest=await one(`INSERT INTO member_requests(created_by,staff_id,sub_department_id,kind,title,idempotency_key)
  VALUES($1,$2,$3,'replacement','Hidden draft',gen_random_uuid()) RETURNING id`,[second,staff2,ir])
 const irMemo=await one("INSERT INTO member_memos(title,body,sender,version,effective_at,created_by) VALUES('IR announcement','IR memo body','HR',1,$1,$2) RETURNING id",[today,principal])
 await q('INSERT INTO member_memo_audiences(memo_id,sub_department_id) VALUES($1,$2)',[irMemo,ir])
 await q('INSERT INTO member_memo_receipts(memo_id,user_id,version,acknowledged_at) VALUES($1,$2,1,now())',[irMemo,principal])
 await asUser(principal)
 const all=await one('SELECT member_principal_snapshot()')
 check(all.requests.some(x=>x.id===otherRequest))
 check(all.requests.some(x=>x.id===draftRequest),false)
 check(all.memos.some(x=>x.id===irMemo))
 check(!!all.memos.find(x=>x.id===irMemo).acknowledgedAt)
 const keys=[]
 function walk(value){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')for(const[key,item]of Object.entries(value)){keys.push(key);walk(item)}}
 walk(all)
 check(keys.some(key=>['cost','unit_cost','unitCost','cost_amount','basic_salary'].includes(key)),false)
 check(JSON.stringify(all).includes('77777'),false)

 // Deactivated/out-of-window schemes and non-Revenue parents cannot be
 // authorized for quotes. Empty results are usable without seeded products.
 await asUser(principal,true)
 await q('UPDATE comm_schemes SET is_active=false WHERE id=$1',[scheme])
 await asUser(principal)
 await reject('SELECT member_principal_quote_context($1)',[scheme],/active Fair scheme/)
 check((await one('SELECT member_principal_snapshot()')).products,[])
 check((await one('SELECT member_principal_snapshot()')).memberships.map(x=>x.schemeId),[irScheme])
 await asUser(principal,true)
 await q('UPDATE comm_schemes SET is_active=true,effective_from=$2::date+1 WHERE id=$1',[scheme,today])
 await asUser(principal)
 await reject('SELECT member_principal_quote_context($1)',[scheme],/active Fair scheme/)
 await asUser(principal,true)
 await q('UPDATE comm_schemes SET effective_from=$2 WHERE id=$1',[scheme,period])
 await q('UPDATE comm_sub_departments SET is_active=false WHERE id=$1',[fair])
 await asUser(principal)
 await reject('SELECT member_principal_quote_context($1)',[scheme],/active Fair scheme/)
 await asUser(principal,true)
 await q('UPDATE comm_sub_departments SET is_active=true WHERE id=$1',[fair])
 await q("UPDATE departments SET payroll_source='imported' WHERE id=$1",[dept])
 await asUser(principal)
 await reject('SELECT member_principal_quote_context($1)',[scheme],/active Fair scheme/)
 const none=await one('SELECT member_principal_snapshot()')
 for(const key of ['memberships','departments','products','bands','incomes','orders','requests','memos'])check(none[key],[])
 check(none.configured)
 check(none.profile.id,principal)
 await asUser(principal,true)
 await q("UPDATE departments SET payroll_source='commission' WHERE id=$1",[dept])
}
