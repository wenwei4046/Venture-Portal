// Option 2 — "Ledger Dense"
// Information-dense broadsheet. Light mode.
// Three hero numbers (free pool / NII / net spread), tabbed subsidiaries,
// alerts rail, multiple states shown in-situ (loading skeleton bank strip, error banner, empty recents).

function OptionLedgerDense() {
  const [tab, setTab] = React.useState('positions');
  return (
    <div style={{
      display: 'flex', width: '100%', height: '100%',
      background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-sans)',
    }}>
      <Sidebar role="Principal"/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar
          greeting={<>Good morning, <em style={{ color: 'var(--accent)' }}>Principal.</em></>}
          date={MOCK.dateMono} period={MOCK.period}
          right={<div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--graphite)' }}>
            Week <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal' }}>17</span> · <em>Q2</em>
          </div>}
        />
        <main style={{ flex: 1, overflow: 'auto', padding: '32px 44px 80px' }}>
          {/* Header line */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--hairline)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ink)' }}>
                The house books, <em style={{ fontStyle: 'italic' }}>Tuesday morning</em>.
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.05em' }}>
                21 APR 2026 · 07:42 MYT · LIVE LEDGER · LAST SYNC 12s AGO
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--graphite)' }}>
              3 things <em style={{ color: 'var(--accent)' }}>pending your hand</em>
            </div>
          </div>

          {/* Three-hero strip */}
          <section style={{
            display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 0,
            borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', marginBottom: 36,
          }}>
            <HeroStat
              label="Free pool" big="RM 12,847,203"
              cents=".55" sub="ABOVE BUFFER RM 2.85M · 90-DAY +8.1%"
              trend={<Sparkline points={MOCK.poolTrend} height={40}/>}
            />
            <HeroStat
              label="Net interest income" big="RM 184,320"
              cents=".18" sub="MTD · BOOKED TO 20 APR"
              border
            />
            <HeroStat
              label="Net spread" big="+1.42"
              cents="%" sub="WEIGHTED COST 3.85% · BASE 5.27%"
              border accent
            />
          </section>

          {/* Two-column: main + rail */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 48 }}>
            {/* MAIN — tabbed subsidiaries + recent activity */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--ink)', margin: 0 }}>Subsidiaries</h2>
                <div style={{ display: 'flex', gap: 2, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--graphite)' }}>
                  {[['positions','Positions'],['maturities','Maturities'],['overdue','Overdue · 1'],['savings','Savings']].map(([k,l]) => (
                    <button key={k} onClick={() => setTab(k)} style={{
                      padding: '6px 12px', border: 'none',
                      background: tab === k ? 'var(--accent-bg)' : 'transparent',
                      color: tab === k ? 'var(--accent)' : 'var(--graphite)',
                      fontFamily: tab === k ? 'var(--font-serif)' : 'var(--font-sans)',
                      fontStyle: tab === k ? 'italic' : 'normal',
                      fontSize: tab === k ? 14 : 12, borderRadius: 4, cursor: 'pointer',
                    }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Dense meter table */}
              <div style={{ border: '1px solid var(--hairline)', borderRadius: 6, overflow: 'hidden', background: 'var(--surface)' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '120px 1fr 100px 130px 130px 90px',
                  padding: '10px 16px', borderBottom: '1px solid var(--hairline)',
                  fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12,
                  color: 'var(--graphite)', background: 'var(--surface-2)',
                }}>
                  <div>Code · Tier</div>
                  <div>Position meter</div>
                  <div style={{ textAlign: 'right' }}>Saved</div>
                  <div style={{ textAlign: 'right' }}>Lent</div>
                  <div style={{ textAlign: 'right' }}>Net</div>
                  <div style={{ textAlign: 'right' }}>State</div>
                </div>
                {MOCK.subs.map((s, i) => <MeterRow key={i} s={s}/>)}
              </div>

              {/* Recent activity — empty state demo */}
              <div style={{ marginTop: 36 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--ink)', margin: 0 }}>Recent activity</h2>
                  <a style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--accent)' }}>Full log →</a>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div style={{ border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--surface)', padding: 18 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--graphite)', marginBottom: 14 }}>Today · 21 Apr</div>
                    {[
                      ['07:12', 'Finance · HC', 'Repayment recorded on L-0312', '+RM 240,000.00'],
                      ['06:58', 'System',        'Base rate pulled OPR+0.27% = 5.27%', '—'],
                      ['04:00', 'System',        'Dashboard summary regenerated', '—'],
                    ].map(([t,w,what,amt], i) => (
                      <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 12,
                        padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                        fontSize: 13, color: 'var(--ink)',
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 11 }}>{t}</span>
                        <div>
                          <div style={{ fontFamily: 'var(--font-serif)' }}>{what}</div>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{w}</div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: amt.startsWith('+') ? 'var(--ledger)' : 'var(--muted)' }}>{amt}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--surface)', padding: 18 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--graphite)', marginBottom: 14 }}>Yesterday · 20 Apr</div>
                    <div style={{ padding: '28px 0 24px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--ledger)', marginBottom: 4 }}>
                        All quiet.
                      </div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)' }}>
                        No movements on Easter Monday.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RAIL */}
            <aside>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink)', marginTop: 0, marginBottom: 14 }}>
                Pending your hand
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
                {MOCK.approvals.map((a, i) => <MiniApproval key={i} a={a}/>)}
              </div>

              <h3 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink)', marginBottom: 10 }}>
                Watching
              </h3>
              <div style={{ borderTop: '1px solid var(--hairline)', marginBottom: 32 }}>
                {MOCK.alerts.map((al, i) => <AlertRow key={i} a={al}/>)}
              </div>

              <h3 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--ink)', marginBottom: 10 }}>
                Bank accounts
              </h3>
              {/* Loading skeleton state */}
              <div style={{ border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--surface)', padding: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 10 }}>
                  SYNCING · ALLIANCE BANK API
                </div>
                {[0,1,2].map(i => (
                  <div key={i} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}>
                    <div style={{ height: 10, width: `${[70,55,60][i]}%`, background: 'var(--hairline)', borderRadius: 2, marginBottom: 6 }}/>
                    <div style={{ height: 14, width: `${[45,38,50][i]}%`, background: 'var(--hairline)', borderRadius: 2, opacity: 0.6 }}/>
                  </div>
                ))}
              </div>

              {/* Error banner */}
              <div style={{
                marginTop: 18, border: '1px solid var(--danger)', borderRadius: 6,
                background: 'var(--danger-bg)', padding: '12px 14px',
              }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--danger)' }}>
                  P&amp;L chart failed to load.
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--graphite)', marginTop: 4 }}>
                  Connection to report service lost.&nbsp;
                  <a style={{ color: 'var(--danger)', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Retry</a>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function HeroStat({ label, big, cents, sub, trend, border, accent }) {
  return (
    <div style={{ padding: '22px 28px', borderLeft: border ? '1px solid var(--hairline)' : 'none' }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: accent ? 'var(--accent)' : 'var(--graphite)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-serif)', fontSize: 40, lineHeight: 1,
        color: accent ? 'var(--accent)' : 'var(--ink)', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums',
      }}>
        {big}<span style={{ fontSize: 22, color: 'var(--graphite)' }}>{cents}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em', marginTop: 8 }}>
        {sub}
      </div>
      {trend && <div style={{ marginTop: 10 }}>{trend}</div>}
    </div>
  );
}

function MeterRow({ s }) {
  const total = s.saving + s.loan;
  const savPct = (s.saving / total) * 100;
  const stateColor = s.state === 'overdue' ? 'var(--danger)' : s.state === 'maturing' ? 'var(--alert)' : 'var(--graphite)';
  const stateText = s.state === 'overdue' ? `overdue ${s.overdueDays}d` :
                    s.state === 'maturing' ? `mature ${s.maturesIn}d` : 'active';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr 100px 130px 130px 90px',
      padding: '14px 16px', borderBottom: '1px solid var(--hairline)', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--ink)' }}>{s.code}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{s.tier} · {s.name.split(' ')[0]}</div>
      </div>
      <div style={{ paddingRight: 20 }}>
        <div style={{ position: 'relative', height: 8, background: 'var(--surface-2)', borderRadius: 2 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${savPct}%`, background: 'var(--ledger)', opacity: 0.6, borderRadius: 2 }}/>
          <div style={{ position: 'absolute', left: `${savPct}%`, top: -2, bottom: -2, width: 1, background: 'var(--ink)' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
          <span>saved</span><span>lent</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--graphite)', fontVariantNumeric: 'tabular-nums' }}>
        {money(s.saving).whole}
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--graphite)', fontVariantNumeric: 'tabular-nums' }}>
        {money(s.loan).whole}
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: s.net < 0 ? 'var(--danger)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
        {s.net < 0 ? '−' : ''}{money(Math.abs(s.net)).whole}
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: stateColor }}>
        {stateText}
      </div>
    </div>
  );
}

function MiniApproval({ a }) {
  const { whole } = money(a.amount);
  return (
    <div style={{
      border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--surface)',
      padding: '12px 14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--graphite)', marginBottom: 2 }}>
          {a.kind}
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.entity}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', marginTop: 2 }}>
          RM {whole}
        </div>
      </div>
      <button style={{
        background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 4,
        padding: '6px 12px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12,
        cursor: 'pointer', flexShrink: 0,
      }}>Approve</button>
    </div>
  );
}

function AlertRow({ a }) {
  const color = a.sev === 'danger' ? 'var(--danger)' : a.sev === 'alert' ? 'var(--alert)' : 'var(--info)';
  const label = a.sev === 'danger' ? 'escalation' : a.sev === 'alert' ? 'watching' : 'note';
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--hairline)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
        · {label}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink)' }}>
        {a.text}
      </div>
    </div>
  );
}

window.OptionLedgerDense = OptionLedgerDense;
