// Option 3 — "Night Desk"
// Dark mode · pushes aesthetic further.
// Warm charcoal paper, monumental single figure with a Chinese seal caption,
// horizontal subsidiary strip with position meters, stamped approval seals,
// hover/focus detail on one approval card.

function OptionNightDesk() {
  return (
    <div data-theme="dark" style={{
      display: 'flex', width: '100%', height: '100%',
      background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-sans)',
    }}>
      <Sidebar role="Principal" dark/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar
          greeting={<>Evening, <em style={{ color: 'var(--accent)' }}>Principal.</em> <span style={{ fontFamily: 'var(--font-cjk)', color: 'var(--graphite)', fontSize: 16, marginLeft: 8 }}>晚上好，董事长。</span></>}
          date="21 APR 2026 · 20:14 MYT" period="FY26 · M10 · W17"
        />
        <main style={{ flex: 1, overflow: 'auto', padding: '56px 64px 96px' }}>
          {/* Monumental number */}
          <section style={{ marginBottom: 80, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 60 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--accent)',
                  marginBottom: 8, letterSpacing: '0.01em',
                }}>
                  The free pool, <em>tonight</em>
                </div>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontSize: 128, lineHeight: 0.92,
                  color: 'var(--ink)', letterSpacing: '-0.035em',
                }}>
                  12,847,203<span style={{ fontSize: 52, color: 'var(--graphite)' }}>.55</span>
                </div>
                <div style={{
                  fontFamily: 'var(--font-cjk)', fontSize: 15, color: 'var(--graphite)', marginTop: 14,
                }}>
                  令吉 · <span style={{ fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>Malaysian Ringgit</span>
                  <span style={{ margin: '0 10px', color: 'var(--hairline)' }}>|</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--muted)' }}>LIVE LEDGER · SYNCED 12s AGO</span>
                </div>
              </div>
              {/* Seal */}
              <div style={{ flexShrink: 0, textAlign: 'center', paddingBottom: 14 }}>
                <div style={{
                  width: 104, height: 104, border: '2px solid var(--accent)',
                  borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-cjk)', color: 'var(--accent)', fontSize: 44, fontWeight: 700,
                  position: 'relative', lineHeight: 1,
                  transform: 'rotate(-4deg)',
                }}>
                  <div>准</div>
                  <div style={{
                    position: 'absolute', inset: 6, border: '1px solid var(--accent)', borderRadius: 4, opacity: 0.5,
                  }}/>
                </div>
                <div style={{ marginTop: 10, fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--graphite)', fontSize: 13 }}>
                  <em>house in order</em>
                </div>
              </div>
            </div>

            {/* Ledger line */}
            <div style={{
              marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
              borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)',
            }}>
              <LedgerBar label="Pool" value="18,400,000" caption="seven subsidiaries · saved"/>
              <LedgerBar label="Lent" value="5,552,796" caption="23 active loans · 3 maturing" border/>
              <LedgerBar label="Buffer" value="10,000,000" caption="floor · set in Settings" border/>
              <LedgerBar label="Net spread" value="+1.42%" caption="cost 3.85% · base 5.27%" border accent/>
            </div>
          </section>

          {/* Subsidiaries horizontal strip */}
          <section style={{ marginBottom: 80 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--ink)', margin: 0 }}>
                Seven houses
              </h2>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--graphite)' }}>
                <em style={{ color: 'var(--danger)' }}>one overdue</em>, <em style={{ color: 'var(--alert)' }}>one maturing</em>, five quiet
              </div>
            </div>
            <p style={{ fontFamily: 'var(--font-cjk)', color: 'var(--graphite)', fontSize: 14, marginTop: 4, marginBottom: 24 }}>
              子公司 · <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>relative to the house</span>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 14 }}>
              {MOCK.subs.map((s, i) => <SubTile key={i} s={s}/>)}
            </div>
          </section>

          {/* Pending + hover-focus + empty */}
          <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 48 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 26, color: 'var(--ink)', margin: 0, marginBottom: 4 }}>
                Pending your hand
              </h2>
              <div style={{ fontFamily: 'var(--font-cjk)', color: 'var(--graphite)', fontSize: 13, marginBottom: 22 }}>
                待签核 · three seals required tonight
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SealCard a={MOCK.approvals[0]} focus/>
                <SealCard a={MOCK.approvals[1]}/>
                <SealCard a={MOCK.approvals[2]}/>
              </div>
            </div>

            <div>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: 'var(--ink)', margin: 0, marginBottom: 22 }}>
                Overdue ledger
              </h3>
              {/* Single overdue entry */}
              <div style={{
                border: '1px solid var(--danger)', background: 'var(--danger-bg)', borderRadius: 6, padding: 20, marginBottom: 20,
              }}>
                <div style={{
                  fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
                  color: 'var(--danger)', textTransform: 'uppercase', marginBottom: 8,
                }}>late_1 · overdue 14 days</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink)', marginBottom: 4 }}>
                  Decoria Interiors <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--graphite)' }}>L-0338</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink)', marginBottom: 10, fontVariantNumeric: 'tabular-nums' }}>
                  RM 1,040,000.00 principal · RM 12,233.00 interest due
                </div>
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--graphite)', marginBottom: 12 }}>
                  Next stage <em>late_2 (escalation)</em> at 30d on 7 May.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{
                    background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6,
                    padding: '7px 16px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, cursor: 'pointer',
                  }}>Mark paid</button>
                  <button style={{
                    background: 'transparent', color: 'var(--graphite)', border: '1px solid var(--hairline)',
                    borderRadius: 6, padding: '7px 14px', fontFamily: 'var(--font-sans)', fontSize: 12,
                  }}>Escalate now</button>
                </div>
              </div>

              {/* Maturing — quieter */}
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16, marginBottom: 30 }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--alert)', marginBottom: 2 }}>
                  Maturing · 11 days
                </div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--ink)' }}>
                  Luminaire House · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--graphite)' }}>L-0325</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--graphite)', marginTop: 2 }}>
                  RM 92,796.45 · rolls 2 May 2026
                </div>
              </div>

              {/* Empty state — all caught up for subs reconciliation */}
              <h3 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--ink)', marginBottom: 14 }}>
                Recent repayments
              </h3>
              <div style={{
                border: '1px dashed var(--hairline)', borderRadius: 6, padding: '30px 20px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--ledger)', marginBottom: 4 }}>
                  All repayments settled this week.
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)' }}>
                  Next cycle opens Monday 28 Apr.
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function LedgerBar({ label, value, caption, border, accent }) {
  return (
    <div style={{ padding: '22px 24px', borderLeft: border ? '1px solid var(--hairline)' : 'none' }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--graphite)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 22, color: accent ? 'var(--accent)' : 'var(--ink)',
        fontVariantNumeric: 'tabular-nums', fontWeight: 500,
      }}>
        {value.startsWith('+') ? '' : 'RM '}{value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6, letterSpacing: '0.04em' }}>
        {caption.toUpperCase()}
      </div>
    </div>
  );
}

function SubTile({ s }) {
  const total = s.saving + s.loan || 1;
  const savPct = (s.saving / total) * 100;
  const color = s.state === 'overdue' ? 'var(--danger)' : s.state === 'maturing' ? 'var(--alert)' : 'var(--graphite)';
  const stateText = s.state === 'overdue' ? `overdue ${s.overdueDays}d` :
                    s.state === 'maturing' ? `mat ${s.maturesIn}d` : 'quiet';
  return (
    <div style={{
      border: '1px solid var(--hairline)', borderRadius: 6, background: 'var(--surface)',
      padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--ink)' }}>{s.code}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{s.tier}</div>
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--graphite)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.name}
      </div>
      <div style={{ height: 3, background: 'var(--surface-2)', borderRadius: 2, marginTop: 4, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${savPct}%`, background: 'var(--ledger)', opacity: 0.7, borderRadius: 2 }}/>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 13, color: s.net < 0 ? 'var(--danger)' : 'var(--ink)',
        fontVariantNumeric: 'tabular-nums', fontWeight: 500, marginTop: 4,
      }}>
        {s.net < 0 ? '−' : '+'}{(Math.abs(s.net)/1000).toFixed(0)}k
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11.5, color }}>
        {stateText}
      </div>
    </div>
  );
}

function SealCard({ a, focus }) {
  const { whole, cents } = money(a.amount);
  return (
    <div style={{
      border: focus ? '1px solid var(--accent)' : '1px solid var(--hairline)',
      background: focus ? 'var(--accent-bg)' : 'var(--surface)',
      borderRadius: 6, padding: '18px 22px',
      display: 'flex', alignItems: 'flex-start', gap: 18,
      outline: focus ? '3px solid var(--accent-bg)' : 'none',
      outlineOffset: focus ? 2 : 0,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--graphite)', marginBottom: 6,
        }}>
          {a.kind} · {a.entity}
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink)', marginBottom: 6 }}>
          {a.title}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
          RM {whole}.{cents} <span style={{ color: 'var(--graphite)' }}>· {a.meta}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Submitted by {a.submitted}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
        <button style={{
          background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6,
          padding: '9px 22px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14,
          cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: focus ? '0 0 0 3px rgba(204,90,46,0.22)' : 'none',
        }}>Approve</button>
        <button style={{
          background: 'transparent', color: 'var(--graphite)', border: '1px solid var(--hairline)',
          borderRadius: 6, padding: '7px 16px', fontFamily: 'var(--font-sans)', fontSize: 12,
        }}>Review</button>
      </div>
      {/* focus chip */}
      {focus && (
        <div style={{
          position: 'absolute', marginLeft: -8, marginTop: -30,
          fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11,
          color: 'var(--accent)', padding: '2px 8px', background: 'var(--paper)',
          border: '1px solid var(--accent)', borderRadius: 3,
        }}>focus</div>
      )}
    </div>
  );
}

window.OptionNightDesk = OptionNightDesk;
