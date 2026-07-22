// Shared building blocks for the three Dashboard options.
// Uses the CSS variables defined in index.html so light/dark shells swap correctly.

// ─────────── Sidebar ───────────
function Sidebar({ role = 'Principal', dark = false }) {
  const sections = [
    { label: null, items: [{ href: '/dashboard', label: 'Overview', active: true }] },
    { label: 'Daily Operations', items: [
      { href: '/approvals', label: 'Approvals', badge: 3 },
      { href: '/payments', label: 'Payments' },
      { label: 'Loan', group: true, open: true, children: [
        { label: 'Fund IN' }, { label: 'Fund OUT' }, { label: 'Overdue', meta: '2' },
      ]},
      { label: 'Statements' },
      { label: 'Reconciliation' },
    ]},
    { label: 'Departments', items: [
      { label: 'Dept Pool' }, { label: 'HR Costing' },
      { label: 'Director', group: true, children: [
        { label: 'Director Salary' }, { label: 'Director Pool' },
      ]},
      { label: 'Claims' },
    ]},
    { label: 'Reports & Admin', items: [
      { label: 'Reports' }, { label: 'Audit Log' }, { label: 'Settings' },
    ]},
  ];

  return (
    <aside style={{
      width: 220, flexShrink: 0, background: 'var(--paper)',
      borderRight: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, lineHeight: 1.1, color: 'var(--ink)' }}>
          HOUZS<br/>
          <span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>Venture</span>
        </div>
        <p style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6, letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>
          INTERNAL LEDGER · 内部账册
        </p>
      </div>
      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.label && (
              <div style={{
                padding: '18px 12px 6px', fontSize: 10, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: 'var(--graphite)', fontFamily: 'var(--font-sans)', fontWeight: 500,
              }}>{sec.label}</div>
            )}
            {sec.items.map((item, j) => item.group ? (
              <GroupItem key={j} item={item}/>
            ) : (
              <NavItem key={j} item={item}/>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--hairline)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
        HV Portal v0.3<br/>
        Phase 3 Shipped
      </div>
    </aside>
  );
}

function NavItem({ item }) {
  const active = item.active;
  return (
    <a style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', marginBottom: 2, borderRadius: 6,
      background: active ? 'var(--accent-bg)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--graphite)',
      fontFamily: active ? 'var(--font-serif)' : 'var(--font-sans)',
      fontStyle: active ? 'italic' : 'normal',
      fontSize: active ? 15 : 13,
      textDecoration: 'none',
    }}>
      <span>{item.label}</span>
      {item.badge != null && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)',
        }}>{item.badge}</span>
      )}
    </a>
  );
}

function GroupItem({ item }) {
  const [open, setOpen] = React.useState(item.open ?? false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', marginBottom: 2, borderRadius: 6, background: 'transparent',
        border: 'none', color: 'var(--graphite)', fontFamily: 'var(--font-sans)', fontSize: 13,
        cursor: 'pointer',
      }}>
        <span>{item.label}</span>
        <span style={{ fontSize: 9, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}>▼</span>
      </button>
      {open && (
        <div style={{ marginLeft: 12, borderLeft: '1px solid var(--hairline)', paddingLeft: 8 }}>
          {item.children.map((c, i) => (
            <a key={i} style={{
              display: 'flex', justifyContent: 'space-between', padding: '6px 12px', marginBottom: 2, borderRadius: 6,
              color: 'var(--graphite)', fontFamily: 'var(--font-sans)', fontSize: 12.5, textDecoration: 'none',
            }}>
              <span>{c.label}</span>
              {c.meta && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--alert)', fontSize: 11 }}>{c.meta}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────── TopBar ───────────
function TopBar({ greeting, date, period, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 40px', borderBottom: '1px solid var(--hairline)',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--ink)' }}>
          {greeting}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.05em' }}>
          {date} · {period}
        </div>
        {right}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--accent)', fontSize: 14,
          border: '1px solid var(--hairline)',
        }}>W</div>
      </div>
    </div>
  );
}

// ─────────── Money formatting ───────────
function money(n, { showSign = false } = {}) {
  const sign = n < 0 ? '−' : (showSign && n > 0 ? '+' : '');
  const abs = Math.abs(n);
  const parts = abs.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { sign, whole: parts[0], cents: parts[1] };
}

function MoneyCell({ value, size = 13, weight = 500, color = 'var(--ink)', tabular = true }) {
  const { sign, whole, cents } = money(value);
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: size, fontWeight: weight, color,
      fontVariantNumeric: tabular ? 'tabular-nums slashed-zero' : undefined,
    }}>
      {sign}RM {whole}.{cents}
    </span>
  );
}

// ─────────── Sparkline ───────────
function Sparkline({ points, height = 48, stroke = 'var(--ink)', fill = 'none' }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const pathD = points.map((v, i) => {
    const x = (i / (points.length - 1)) * 600;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width="100%" height={height} viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1="0" y1={height - 4} x2="600" y2={height - 4} stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3,3"/>
      {fill !== 'none' && (
        <path d={`${pathD} L 600 ${height} L 0 ${height} Z`} fill={fill} opacity="0.35"/>
      )}
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.25" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

// ─────────── Mock Data ───────────
const MOCK = {
  today: 'Tuesday, 21 April 2026',
  dateMono: '21 APR 2026',
  period: 'FY26 · M10',
  freePool: 12847203.55,
  totalPool: 18400000.00,
  loans: 5552796.45,
  buffer: 10000000,
  netSpread: 1.42,
  weightedCost: 3.85,
  baseRate: 5.27,
  nii: 184_320.18,
  poolTrend: [8.9, 9.2, 9.1, 9.6, 10.1, 10.4, 10.8, 11.1, 11.5, 11.9, 12.4, 12.8],
  bankTotal: 18_927_410.80,
  banks: [
    { name: 'Alliance Bank · Current', no: '1234-5678-9012', balance: 12_400_317.18, primary: true },
    { name: 'Maybank · Operating',      no: '5544-1100-7762', balance:  4_892_088.12 },
    { name: 'CIMB · Reserve',           no: '8899-2011-5530', balance:  1_635_005.50 },
  ],
  subs: [
    { code: 'HC',      name: 'HOUZS Century',       tier: 'T2', saving: 3_250_000, loan: 1_100_000, net:  2_150_000, state: 'active' },
    { code: 'CONTS',   name: 'Continental Home',    tier: 'T2', saving: 2_800_000, loan: 1_370_000, net:  1_430_000, state: 'active' },
    { code: 'HLIV',    name: 'HOUZS Living',        tier: 'T3', saving: 1_400_000, loan:   980_000, net:    420_000, state: 'active' },
    { code: 'FURN',    name: 'Furnique Sdn Bhd',    tier: 'T1', saving: 2_100_000, loan:   250_000, net:  1_850_000, state: 'active' },
    { code: 'DECO',    name: 'Decoria Interiors',   tier: 'T3', saving:   620_000, loan: 1_040_000, net:   -420_000, state: 'overdue', overdueDays: 14 },
    { code: 'SOFA',    name: 'SofaCraft Workshop',  tier: 'T2', saving:   910_000, loan:   720_000, net:    190_000, state: 'active' },
    { code: 'LIGHT',   name: 'Luminaire House',     tier: 'T4', saving:   340_000, loan:    92_796, net:    247_204, state: 'maturing', maturesIn: 11 },
  ],
  approvals: [
    { kind: 'NEW LOAN',     entity: 'Continental Home', title: 'Working capital loan',    amount: 100000,  meta: 'T2 · 1.175%/mo',      submitted: 'Finance · 2h ago' },
    { kind: 'REPAYMENT',    entity: 'HOUZS Living',     title: 'Partial principal repaid', amount: 180000,  meta: 'on L-0341 · RM 980k', submitted: 'Finance · 4h ago' },
    { kind: 'PAYROLL RUN',  entity: 'HR · April 2026',  title: 'Payroll run costing',     amount: 327450,  meta: '47 staff · 5 depts',  submitted: 'HR · yesterday' },
  ],
  alerts: [
    { sev: 'danger', kind: 'overdue',  text: 'Decoria Interiors overdue 14 days on L-0338' },
    { sev: 'alert',  kind: 'maturity', text: 'Luminaire House loan matures in 11 days' },
    { sev: 'info',   kind: 'buffer',   text: 'Free pool RM 2.8M above buffer' },
  ],
};

Object.assign(window, {
  Sidebar, TopBar, MoneyCell, Sparkline, money, MOCK,
});
