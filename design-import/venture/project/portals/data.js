/* ============================================================
   HOUZS Venture — Shared "backend" data layer
   Consumed by: Principal Tabs, Finance Tabs, HR Tabs,
                Operations Tabs, Design Canvas

   When the real gov code is imported, replace each `window.*`
   block with an async fetch to the matching API endpoint.
   Shape is the contract — keep property names identical.
   ============================================================ */

/* ────────────── PERIOD ────────────── */
window.PERIOD = {
  current: '2026-04',
  label:   'Apr 2026',
  today:   '2026-04-22',
  todayLabel: 'Wed 22 Apr 2026',
  cutoff:  '2026-04-25',
};

/* ────────────── SUBSIDIARIES ────────────── */
window.SUBS = [
  {code:'HC',    name:'HOUZS Century',    outstanding:2151300, rate:0.01140, used:.78, status:'active'},
  {code:'CONTS', name:'HOUZS Contracts',  outstanding:1432700, rate:0.01140, used:.61, status:'active'},
  {code:'HLIV',  name:'HOUZS Living',     outstanding: 984200, rate:0.01140, used:.47, status:'active'},
  {code:'FURN',  name:'HOUZS Furniture',  outstanding: 712400, rate:0.01140, used:.38, status:'active'},
  {code:'DECO',  name:'HOUZS Decor',      outstanding: 380050, rate:0.01140, used:.22, status:'active'},
  {code:'SOFA',  name:'HOUZS Sofa Co.',   outstanding: 245800, rate:0.01140, used:.14, status:'active'},
  {code:'LIGHT', name:'HOUZS Lighting',   outstanding:  94500, rate:0.01140, used:.07, status:'active'},
];

/* ────────────── DIRECTORS ────────────── */
window.DIRECTORS = [
  {code:'D01', name:'Ng Boon Beng',   weight:.35, savingBalance: 98400},
  {code:'D02', name:'Tan Wei Ming',   weight:.25, savingBalance: 72200},
  {code:'D03', name:'Lim Chee Yong',  weight:.20, savingBalance: 58100},
  {code:'D04', name:'Ong Siew Hoon',  weight:.12, savingBalance: 42300},
  {code:'D05', name:'Chua Mei Ling',  weight:.08, savingBalance: 31900},
];

/* ────────────── DEPARTMENTS (pool balances) ────────────── */
window.DEPTS = [
  {code:'marketing', name:'Marketing',       balance:824300, netIn:165000, out:142000, staff:12},
  {code:'hr',        name:'HR',              balance:312500, netIn: 42000, out: 38500, staff: 4},
  {code:'finance',   name:'Finance',         balance:188200, netIn: 12000, out: 10400, staff: 6},
  {code:'director',  name:'Director Office', balance:945300, netIn:420000, out:380000, staff: 3},
  {code:'operations',name:'Operations',      balance:421000, netIn: 68000, out: 52800, staff: 9},
];

/* ────────────── DEPT COSTING (HR → Principal + Finance) ────────────── */
/* HR's Submit Snapshot writes here; Principal's HR Costing + Finance's Payroll read it. */
window.DEPT_COST = [
  {code:'marketing', name:'Marketing',       staff:12, basic:48000, stat:9200, allow:5400},
  {code:'hr',        name:'HR',              staff: 4, basic:18200, stat:3400, allow:1800},
  {code:'finance',   name:'Finance',         staff: 6, basic:29400, stat:5500, allow:2600},
  {code:'director',  name:'Director Office', staff: 3, basic:42000, stat:7900, allow:4200},
  {code:'operations',name:'Operations',      staff: 9, basic:36400, stat:6820, allow:3100},
].map(d=>({...d, ctc: d.basic+d.stat+d.allow}));

/* ────────────── STAFF MASTER ────────────── */
window.STAFF = [
  {id:'EMP-0012', name:'Tan Yee Ling',    dept:'finance',    role:'Finance Lead',       joined:'2023-02-01', state:'active',    basic:6200, stat:1240, allow:450},
  {id:'EMP-0018', name:'Lim Pei Ting',    dept:'hr',         role:'HR Lead',            joined:'2023-07-10', state:'active',    basic:5800, stat:1160, allow:400},
  {id:'EMP-0023', name:'Chew Siew Hoon',  dept:'marketing',  role:'Dept Lead',          joined:'2022-11-01', state:'active',    basic:7200, stat:1440, allow:650},
  {id:'EMP-0029', name:'Nurul Aisyah',    dept:'marketing',  role:'Senior Exec',        joined:'2024-01-15', state:'active',    basic:4800, stat: 960, allow:350},
  {id:'EMP-0031', name:'Muhamad Faizal',  dept:'operations', role:'Ops Lead',           joined:'2022-05-02', state:'active',    basic:6400, stat:1280, allow:450},
  {id:'EMP-0042', name:'Hafiz Rahman',    dept:'operations', role:'Warehouse',          joined:'2024-09-11', state:'active',    basic:3400, stat: 680, allow:240},
  {id:'EMP-0048', name:'Kong Li Wen',     dept:'finance',    role:'Senior Accountant',  joined:'2025-03-04', state:'active',    basic:5200, stat:1040, allow:380},
  {id:'EMP-0051', name:'Yap Jun Hao',     dept:'operations', role:'Driver',             joined:'2025-06-10', state:'probation', basic:2800, stat: 560, allow:200},
];

/* ────────────── DIRECTOR SALARY INPUTS ──────────────
   HR's Director Salary Input tab writes here each period.
   Finance's Director Salary Batch + Principal's Director Salary read it.
   CTC claim per subsidiary → 25% invoice accumulator + 75% payroll split.
*/
window.DIRECTOR_SALARY_INPUTS = {
  period: '2026-04',
  status: 'draft',            /* draft · submitted · confirmed · paid */
  submittedBy: null,
  submittedAt: null,
  ctcClaims: [
    {sub:'HC',    amount: 68000},
    {sub:'CONTS', amount: 46500},
    {sub:'HLIV',  amount: 32200},
    {sub:'FURN',  amount: 21720},
  ],
  /* per-director overrides for this period (weightage comes from DIRECTORS[] unless overridden) */
  rows: [
    {dir:'D01', weight:.35, advance:2410, savingPct:.05},
    {dir:'D02', weight:.25, advance:1720, savingPct:.05},
    {dir:'D03', weight:.20, advance:1380, savingPct:.05},
    {dir:'D04', weight:.12, advance: 826, savingPct:.00},
    {dir:'D05', weight:.08, advance: 551, savingPct:.00},
  ],
};

/* ────────────── POOL LEDGER ──────────────
   Shared ledger — both Director Pool and Dept Pools write here.
   Filter by `pool` to get a specific view.
*/
window.POOL_LEDGER = [
  /* Director pool */
  {date:'2026-04-22', pool:'director',  kind:'np_in',       note:'CTC Apr — HOUZS Century',    amount: 68000},
  {date:'2026-04-22', pool:'director',  kind:'np_in',       note:'CTC Apr — HOUZS Contracts',  amount: 46500},
  {date:'2026-04-21', pool:'director',  kind:'expense_out', note:'Payout Mar — D01 Ng B.B.',   amount:-58190},
  {date:'2026-04-21', pool:'director',  kind:'expense_out', note:'Payout Mar — D02 Tan W.M.',  amount:-40580},
  {date:'2026-04-15', pool:'director',  kind:'np_in',       note:'CTC Apr — HOUZS Living',     amount: 32200},
  {date:'2026-03-31', pool:'director',  kind:'np_in',       note:'Mar pooled — closing',       amount:152400},
  /* Marketing pool */
  {date:'2026-04-21', pool:'marketing', kind:'expense_out', note:'Lazada Brand Day',           amount:-12480},
  {date:'2026-04-15', pool:'marketing', kind:'np_in',       note:'Budget top-up Apr',          amount: 80000},
  /* HR pool */
  {date:'2026-04-18', pool:'hr',        kind:'expense_out', note:'Benefit claim · Tan Y.L.',   amount:   -340},
  /* Operations pool */
  {date:'2026-04-20', pool:'operations',kind:'expense_out', note:'Warehouse diesel Apr',       amount: -3800},
  {date:'2026-04-14', pool:'operations',kind:'np_in',       note:'Budget top-up Apr',          amount: 40000},
];

/* ────────────── CLAIMS ──────────────
   Staff benefit claims + director project claims.
   HR Benefit Claims + Finance Claims + Principal Claims all read this.
*/
window.CLAIMS = [
  {id:'CLM-0089', who:'Tan Y.L.',        dept:'finance',   kind:'staff',    type:'Optical · new frames',              amount: 420, status:'approved', date:'2026-04-19'},
  {id:'CLM-0088', who:'Ng Boon Beng',    dept:'director',  kind:'director', type:'Project travel · CONTS kickoff',    amount:3840, status:'pending',  date:'2026-04-20'},
  {id:'CLM-0087', who:'Chua Mei Ling',   dept:'director',  kind:'director', type:'Medical · dental',                  amount: 280, status:'paid',     date:'2026-04-15'},
  {id:'CLM-0086', who:'Nurul Aisyah',    dept:'marketing', kind:'staff',    type:'Medical · GP consultation',         amount:  85, status:'approved', date:'2026-04-16'},
  {id:'CLM-0085', who:'Hafiz Rahman',    dept:'operations',kind:'staff',    type:'Transport reimbursement',           amount: 140, status:'pending',  date:'2026-04-21'},
];

/* ────────────── PAYROLL RUNS ──────────────
   HR Submit Snapshot creates a run; Finance Payroll consumes it.
*/
window.PAYROLL_RUNS = [
  {period:'2026-04', status:'draft',     total:241420, staff:42, submittedAt:null,                submittedBy:null,    executedAt:null,                executedBy:null},
  {period:'2026-03', status:'executed',  total:239800, staff:42, submittedAt:'2026-03-24 17:14', submittedBy:'Lim P.T.', executedAt:'2026-03-26 10:02', executedBy:'Tan Y.L.'},
  {period:'2026-02', status:'executed',  total:236100, staff:41, submittedAt:'2026-02-23 16:40', submittedBy:'Lim P.T.', executedAt:'2026-02-25 09:48', executedBy:'Tan Y.L.'},
  {period:'2026-01', status:'executed',  total:232400, staff:41, submittedAt:'2026-01-24 15:22', submittedBy:'Lim P.T.', executedAt:'2026-01-26 11:20', executedBy:'Tan Y.L.'},
];

/* ────────────── VOUCHERS ────────────── */
window.VOUCHERS = [
  {id:'PV-0429', date:'2026-04-22', desc:'Office rent Apr 2026',               type:'debit',  pool:'venture_pool',        amount:18500, status:'pending_approval', by:'Chew S.H.'},
  {id:'PV-0428', date:'2026-04-21', desc:'Marketing — Lazada Brand Day',       type:'debit',  pool:'dept_pool_marketing', amount:12480, status:'approved',         by:'Chew S.H.'},
  {id:'PV-0427', date:'2026-04-21', desc:'HOUZS Century interest collection',  type:'credit', pool:'venture_pool',        amount:25275, status:'paid',             by:'Tan Y.L.'},
  {id:'PV-0426', date:'2026-04-20', desc:'Telco & internet Apr',               type:'debit',  pool:'venture_pool',        amount: 2840, status:'paid',             by:'Tan Y.L.'},
  {id:'PV-0425', date:'2026-04-19', desc:'Invoice payout — HOUZS Living Q1',   type:'credit', pool:'invoice_payout_pool', amount:32800, status:'paid',             by:'Tan Y.L.'},
  {id:'PV-0424', date:'2026-04-18', desc:'Staff claim · benefit · Tan Y.L.',   type:'debit',  pool:'dept_pool_hr',        amount:  340, status:'draft',            by:'Lim P.T.'},
  {id:'PV-0423', date:'2026-04-18', desc:'Utility bill Mar',                   type:'debit',  pool:'venture_pool',        amount: 6240, status:'voided',           by:'Tan Y.L.'},
];

/* ────────────── DERIVED (computed helpers) ────────────── */

/* Sum the current-period CTC claims. */
window.DSAL_POOL = DIRECTOR_SALARY_INPUTS.ctcClaims.reduce((s,c)=>s+c.amount, 0);

/* 25% invoice / 75% payroll split of the pool. */
window.DSAL_SPLIT = {
  invoice: DSAL_POOL * 0.25,
  payroll: DSAL_POOL * 0.75,
};

/* Per-director payout rows for the current period. */
window.DSAL_ROWS = DIRECTOR_SALARY_INPUTS.rows.map(r => {
  const dir = DIRECTORS.find(d=>d.code===r.dir) || {};
  const gross   = DSAL_POOL * r.weight;
  const payroll = gross * 0.75;
  const invoice = gross * 0.25;
  const saving  = gross * (r.savingPct || 0);
  const net     = payroll + invoice - saving - r.advance;
  return {
    dir: r.dir,
    name: dir.name || r.dir,
    weight: r.weight,
    gross, payroll, invoice, saving,
    advance: r.advance,
    net,
  };
});

/* ────────────── FORMATTERS ────────────── */
window.RM = function(n, opts={}){
  const neg = n<0; const v = Math.abs(n);
  const [a,b] = v.toFixed(2).split('.');
  const grouped = a.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const sign = neg?'−':'';
  if(opts.bare) return `${sign}${grouped}.${b}`;
  return `${sign}RM ${grouped}.${b}`;
};

window.bigRM = function(n){
  const [int,dec] = RM(n).replace('RM ','').split('.');
  return `<span class="serif">RM </span>${int}<span class="cents">.${dec}</span>`;
};

window.pct = function(n, digits=0){ return `${(n*100).toFixed(digits)}%`; };

/* ────────────── PORTAL METADATA ────────────── */
window.PORTALS = [
  {
    id:'principal',
    name:'Principal',
    tone:'The owner seat.',
    wordmark:'HOUZS',
    tag:'Venture <em>— Principal</em>',
    topbarGreet: 'Good morning, <em>Principal</em>.',
    topbarUser:  'LCY · Principal',
    sections: [
      {label:'I.',   title:'Treasury',    tabs:['overview','approvals','payments']},
      {label:'II.',  title:'Loans',       tabs:['fundin','fundout','overdue']},
      {label:'III.', title:'Settlements', tabs:['statements','recon']},
      {label:'IV.',  title:'Departments', tabs:['deptpool','hrcost']},
      {label:'V.',   title:'Directors',   tabs:['dsalary','dpool']},
      {label:'VI.',  title:'Governance',  tabs:['claims','reports','audit','settings']},
    ],
    tabMeta:{
      overview:{label:'Overview'},
      approvals:{label:'Approvals', count:3},
      payments:{label:'Payments'},
      fundin:{label:'Fund IN'},
      fundout:{label:'Fund OUT'},
      overdue:{label:'Overdue', count:2},
      statements:{label:'Statements'},
      recon:{label:'Reconciliation'},
      deptpool:{label:'Dept Pool'},
      hrcost:{label:'HR Costing'},
      dsalary:{label:'Director Salary'},
      dpool:{label:'Director Pool'},
      claims:{label:'Claims'},
      reports:{label:'Reports'},
      audit:{label:'Audit Log'},
      settings:{label:'Settings'},
    },
  },
  {
    id:'finance',
    name:'Finance',
    tone:'The bookkeeper.',
    wordmark:'HOUZS',
    tag:'Venture <em>— Finance</em>',
    topbarGreet: 'Good morning, <em>Finance</em>.',
    topbarUser:  'Tan Y.L. · Finance Lead',
    sections: [
      {label:'I.',   title:'Daily',        tabs:['dashboard','inbox','vouchers']},
      {label:'II.',  title:'Loans',        tabs:['fundin','fundout','overdue']},
      {label:'III.', title:'Billing',      tabs:['statements','invoices','payroll']},
      {label:'IV.',  title:'Directors',    tabs:['dsalaryBatch','dpool']},
      {label:'V.',   title:'Reconcile',    tabs:['recon','gl']},
      {label:'VI.',  title:'Admin',        tabs:['claims','reports']},
    ],
    tabMeta:{
      dashboard:{label:'Dashboard'},
      inbox:{label:'Inbox', count:4},
      vouchers:{label:'Vouchers'},
      fundin:{label:'Fund IN'},
      fundout:{label:'Fund OUT'},
      overdue:{label:'Overdue', count:2},
      statements:{label:'Statements'},
      invoices:{label:'Invoices'},
      payroll:{label:'Payroll'},
      dsalaryBatch:{label:'Director Salary'},
      dpool:{label:'Director Pool'},
      recon:{label:'Reconciliation'},
      gl:{label:'General Ledger'},
      claims:{label:'Claims'},
      reports:{label:'Reports'},
    },
  },
  {
    id:'hr',
    name:'HR',
    tone:'Staff & costing custodian.',
    wordmark:'HOUZS',
    tag:'Venture <em>— HR</em>',
    topbarGreet: 'Good morning, <em>HR</em>.',
    topbarUser:  'Lim P.T. · HR Lead',
    sections: [
      {label:'I.',   title:'Overview',      tabs:['dashboard','requests']},
      {label:'II.',  title:'Staff',         tabs:['staff','onboarding']},
      {label:'III.', title:'Costing',       tabs:['costLive','costSubmit','costHistory','payroll']},
      {label:'IV.',  title:'Directors',     tabs:['dsalaryInput','dsaving']},
      {label:'V.',   title:'Benefits',      tabs:['claims']},
      {label:'VI.',  title:'Admin',         tabs:['reports']},
    ],
    tabMeta:{
      dashboard:{label:'Dashboard'},
      requests:{label:'Requests', count:3},
      staff:{label:'Staff'},
      onboarding:{label:'Onboarding', count:1},
      costLive:{label:'Live Costing'},
      costSubmit:{label:'Submit Snapshot'},
      costHistory:{label:'Snapshot History'},
      payroll:{label:'Monthly Payroll'},
      dsalaryInput:{label:'Director Salary Input'},
      dsaving:{label:'Pool Savings'},
      claims:{label:'Benefit Claims'},
      reports:{label:'Reports'},
    },
  },
  {
    id:'dept',
    name:'Dept Manager',
    tone:'Marketing · single department view.',
    wordmark:'HOUZS',
    tag:'Venture <em>— Marketing</em>',
    topbarGreet: 'Good morning, <em>Marketing</em>.',
    topbarUser:  'Chew S.H. · Dept Lead',
    sections: [
      {label:'I.',   title:'Overview',    tabs:['overview','pool']},
      {label:'II.',  title:'Spend',       tabs:['opex','claims']},
      {label:'III.', title:'People',      tabs:['team']},
    ],
    tabMeta:{
      overview:{label:'Overview'},
      pool:{label:'Pool Ledger'},
      opex:{label:'OPEX Requests', count:2},
      claims:{label:'Claims'},
      team:{label:'Team'},
    },
  },
];
