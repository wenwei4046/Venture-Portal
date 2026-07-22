// Option 1 — "Broadsheet"
// Faithful to DESIGN.md v2.0. Light mode.
// 7+5 hero, vertical approvals stack, hairline-only subsidiaries table.
// Restrained, newspaper-calm, single rust accent where decisions happen.

function OptionBroadsheet() {
  return (
    <div style={{
      display: 'flex', width: '100%', height: '100%',
      background: 'var(--paper)', color: 'var(--ink)',
      fontFamily: 'var(--font-sans)',
    }}>
      <Sidebar role="Principal"/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar
          greeting={<>Good morning, <em style={{ color: 'var(--accent)' }}>Principal.</em></>}
          date={MOCK.dateMono} period={MOCK.period}
        />
        <main style={{ flex: 1, overflow: 'auto', padding: '40px 56px 80px' }}>
          {/* Hero 7+5 */}
          <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 56, marginBottom: 72 }}>
            {/* LEFT — Free Pool hero */}
            <div>
              <div style={{
                fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                color: 'var(--accent)', fontSize: 16, marginBottom: 6,
              }}>Free pool</div>
              <div style={{
                fontFamily: 'var(--font-serif)', fontSize: 72, lineHeight: 1,
                color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 14,
              }}>
                RM 12,847,203<span style={{ fontSize: 36, color: 'var(--graphite)' }}>.55</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                AS OF 21 APR 2026 · LIVE LEDGER · 90-DAY TREND
              </div>
              <div style={{ margin: '28px 0 22px' }}>
                <Sparkline points={MOCK.poolTrend}/>
              </div>
              <div style={{ fontSize: 14, color: 'var(--graphite)', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                Pool <span style={{ fontStyle: 'normal', fontFamily: 'var(--font-mono)', color: 'var(--ink)', fontWeight: 500 }}>RM 18,400,000.00</span>
                {' · '}lent <span style={{ fontStyle: 'normal', fontFamily: 'var(--font-mono)' }}>RM 5,552,796.45</span>
                {' · '}free <span style={{ fontStyle: 'normal', fontFamily: 'var(--font-mono)', color: 'var(--ledger)', fontWeight: 500 }}>RM 12,847,203.55</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--graphite)', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                <em>Above buffer</em> <span style={{ fontStyle: 'normal', fontFamily: 'var(--font-mono)' }}>RM 2,847,203.55</span>
                {' · '}net spread <span style={{ fontStyle: 'normal', fontFamily: 'var(--font-mono)' }}>+1.42%</span>
              </div>
            </div>
            {/* RIGHT — Pending your hand */}
            <div>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18,
              }}>
                <h2 style={{
                  fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: 'var(--ink)',
                  margin: 0,
                }}>Pending your hand</h2>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>3 items</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MOCK.approvals.map((a, i) => (
                  <ApprovalCard key={i} a={a} primary={i === 0}/>
                ))}
              </div>
            </div>
          </div>

          {/* Subsidiaries */}
          <section style={{ marginBottom: 72 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--ink)', margin: 0 }}>Subsidiaries</h2>
              <a style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--accent)', fontSize: 13 }}>See full ledger →</a>
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--graphite)', fontSize: 14, marginTop: 0, marginBottom: 20 }}>
              Seven companies, <em>net position against the house</em>.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                  {['Company', 'Tier', 'Saved', 'Lent', 'Net', 'State'].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i < 2 ? 'left' : i === 5 ? 'left' : 'right',
                      fontFamily: 'var(--font-serif)', fontSize: 12,
                      color: 'var(--graphite)', fontWeight: 400, fontStyle: 'italic',
                      padding: '8px 14px 10px', letterSpacing: '0.04em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK.subs.map((s, i) => <SubRow key={i} s={s}/>)}
              </tbody>
            </table>
          </section>

          {/* Ledger strip: three small numbers */}
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)' }}>
            <LedgerStat label="Net interest income" value="RM 184,320.18" sub="This month · book-to-date"/>
            <LedgerStat label="Weighted cost of funds" value="3.85%" sub="vs. base rate 5.27%" border/>
            <LedgerStat label="Net spread" value="+1.42%" sub="30-day rolling" accent border/>
          </section>
        </main>
      </div>
    </div>
  );
}

function ApprovalCard({ a, primary }) {
  const { whole, cents } = money(a.amount);
  return (
    <div style={{
      border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--surface)',
      padding: '18px 20px',
    }}>
      <div style={{
        fontFamily: 'var(--font-sans)', fontSize: 10.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--graphite)', marginBottom: 4,
      }}>
        {a.kind} · {a.entity}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--ink)', marginBottom: 4 }}>
        {a.title}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>
        RM {whole}.{cents} · {a.meta}
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        Submitted by {a.submitted}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{
          background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6,
          padding: '8px 18px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14,
          cursor: 'pointer',
        }}>Approve</button>
        <button style={{
          background: 'transparent', color: 'var(--graphite)', border: '1px solid var(--hairline)', borderRadius: 6,
          padding: '8px 16px', fontFamily: 'var(--font-sans)', fontSize: 13,
        }}>Review</button>
      </div>
    </div>
  );
}

function SubRow({ s }) {
  const stateColor = s.state === 'overdue' ? 'var(--danger)' : s.state === 'maturing' ? 'var(--alert)' : 'var(--graphite)';
  const stateText = s.state === 'overdue' ? `overdue ${s.overdueDays}d` :
                    s.state === 'maturing' ? `matures ${s.maturesIn}d` : 'active';
  return (
    <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
      <td style={{ padding: '14px 14px', fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--ink)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginRight: 10 }}>{s.code}</span>
        {s.name}
      </td>
      <td style={{ padding: '14px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--graphite)' }}>{s.tier}</td>
      <td style={{ padding: '14px 14px', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', color: 'var(--graphite)', fontVariantNumeric: 'tabular-nums slashed-zero' }}>
        {money(s.saving).whole}
      </td>
      <td style={{ padding: '14px 14px', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', color: 'var(--graphite)', fontVariantNumeric: 'tabular-nums slashed-zero' }}>
        {money(s.loan).whole}
      </td>
      <td style={{ padding: '14px 14px', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right', color: s.net < 0 ? 'var(--danger)' : 'var(--ink)', fontWeight: 500, fontVariantNumeric: 'tabular-nums slashed-zero' }}>
        {s.net < 0 ? '−' : ''}{money(Math.abs(s.net)).whole}
      </td>
      <td style={{ padding: '14px 14px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: stateColor }}>
        {stateText}
      </td>
    </tr>
  );
}

function LedgerStat({ label, value, sub, accent, border }) {
  return (
    <div style={{
      padding: '20px 24px', borderLeft: border ? '1px solid var(--hairline)' : 'none',
    }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--graphite)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontFamily: accent ? 'var(--font-serif)' : 'var(--font-mono)',
        fontSize: accent ? 30 : 24, color: accent ? 'var(--accent)' : 'var(--ink)',
        fontWeight: 500, letterSpacing: accent ? '-0.01em' : 0, fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.05em' }}>
        {sub.toUpperCase()}
      </div>
    </div>
  );
}

window.OptionBroadsheet = OptionBroadsheet;
