'use client'

import { useEffect, useRef } from 'react'
import { StatusChip } from '@/components/ds/Data'
import { footnote, LEDGER, panels, tabTypes, tabWord } from '@/lib/me/leave'
import { meStatus, requestWhen } from '@/lib/me/requests'
import type { AttRequest } from '@/lib/attendance/types'
import type { MeData } from '@/lib/me/types'
import { Label, ListCard, ListItem, NUM, Title } from './kit'

/**
 * Me › Leave (2026-10-17, the handoff's `isLeave`): a tab and a balance card per leave type — the cards swipe
 * (scroll-snap, one at a time), a tab tap scrolls to its card, a swipe moves the tab and keeps it in view — the
 * requests still waiting, and the footnote. The footer's Apply · History live in the frame (LeaveFooter).
 */

const EASE = 'cubic-bezier(.2,.8,.2,1)'

export function LeaveScreen({ data, tab, setTab, openRequest }: {
  data: MeData
  tab: number
  setTab: (i: number) => void
  openRequest: (r: AttRequest) => void
}) {
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const pagerRef = useRef<HTMLDivElement | null>(null)
  const types = tabTypes(data)
  const list = panels(data)
  const waiting = data.requests.filter(r => r.kind === 'leave' && r.status === 'pending')

  const reveal = (i: number) => {
    const strip = tabsRef.current
    const b = strip?.children[i] as HTMLElement | undefined
    if (!strip || !b) return
    const l = b.offsetLeft - 24
    const r = b.offsetLeft + b.offsetWidth + 24
    if (l < strip.scrollLeft) strip.scrollTo({ left: l, behavior: 'smooth' })
    else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: r - strip.clientWidth, behavior: 'smooth' })
  }
  const pick = (i: number) => {
    setTab(i)
    pagerRef.current?.scrollTo({ left: i * pagerRef.current.clientWidth, behavior: 'smooth' })
    reveal(i)
  }
  // Coming in: the pager stands on the tab, without a slide.
  useEffect(() => {
    const p = pagerRef.current
    if (p) p.scrollLeft = tab * p.clientWidth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Title title="Leave" sub={`Leave year ${data.ledger.year || data.workDay.slice(0, 4)} · swipe to see each balance`} />
      {types.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--ds-ink-2)', border: '1px solid var(--ds-border)', borderRadius: 12 }}>HR has not set up leave types yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: '0 -20px' }}>
          <div ref={tabsRef} className="me-scroll" style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--ds-border)', padding: '0 10px' }}>
            {types.map((t, i) => {
              const on = i === tab
              return (
                <button key={t.code} type="button" onClick={() => pick(i)} style={{
                  flex: 'none', height: 44, padding: '0 12px', border: 0, background: 'none', fontFamily: 'inherit', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: on ? 600 : 400, color: on ? 'var(--ds-ink)' : 'var(--ds-ink-3)',
                  boxShadow: on ? 'inset 0 -2px 0 var(--ds-accent)' : 'none', transition: `color .2s ${EASE}, box-shadow .2s ${EASE}`,
                }}>{tabWord(t)}</button>
              )
            })}
          </div>
          <div
            ref={pagerRef}
            className="me-scroll"
            onScroll={e => {
              const p = e.currentTarget
              const i = Math.round(p.scrollLeft / Math.max(1, p.clientWidth))
              if (i !== tab && i >= 0 && i < types.length) { setTab(i); reveal(i) }
            }}
            style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain' }}
          >
            {list.map((p, i) => {
              const { bg, light } = LEDGER[i % LEDGER.length]
              const fg = light ? 'var(--me-ledger-ink)' : 'rgb(255 255 255)'
              const sub = light ? 'rgb(63 43 34 / .68)' : 'rgb(255 255 255 / .74)'
              return (
                <div key={p.code} style={{ flex: '0 0 100%', scrollSnapAlign: 'start', scrollSnapStop: 'always', padding: '0 20px', boxSizing: 'border-box' }}>
                  <div style={{
                    position: 'relative', overflow: 'hidden', borderRadius: 20, background: bg, color: fg,
                    boxShadow: light ? '0 6px 18px rgb(63 43 34 / .10)' : '0 10px 24px rgb(46 31 23 / .22), 0 2px 6px rgb(46 31 23 / .10)',
                    padding: 18, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 212, boxSizing: 'border-box',
                  }}>
                    <span aria-hidden="true" style={{
                      position: 'absolute', inset: 0, borderRadius: 20, pointerEvents: 'none',
                      background: `radial-gradient(circle at 112% 18%, ${light ? 'rgb(63 43 34 / .05)' : 'rgb(255 255 255 / .08)'} 0 46%, transparent 46.4%)`,
                      boxShadow: `inset 0 0 0 1px ${light ? 'rgb(63 43 34 / .06)' : 'rgb(255 255 255 / .06)'}`,
                    }} />
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: sub }}>{p.name} · left</span>
                      <span style={{ ...NUM, fontSize: 11, color: sub }}>{p.pos}</span>
                    </div>
                    <div style={{ position: 'relative', ...NUM, fontWeight: 600, fontSize: 46, lineHeight: 1, letterSpacing: '-.03em' }}>
                      {p.left}<span style={{ fontSize: 16, fontWeight: 500, color: sub, letterSpacing: 0 }}> {p.unit}</span>
                    </div>
                    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: light ? 'rgb(63 43 34 / .12)' : 'rgb(255 255 255 / .18)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p.pct}%`, borderRadius: 3, background: light ? 'var(--me-ledger-fill)' : 'rgb(255 255 255)' }} />
                    </div>
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
                      {p.facts.map(x => (
                        <div key={x.label}>
                          <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: sub }}>{x.label}</div>
                          <div style={{ ...NUM, fontWeight: 600, fontSize: 16, marginTop: 4 }}>{x.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ position: 'relative', fontSize: 12, lineHeight: 1.45, color: sub }}>{p.note}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {waiting.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Waiting for a decision</Label>
          <ListCard>
            {waiting.map(r => {
              const [tone, word] = meStatus(r)
              return <ListItem key={r.id} title={requestWhen(r)} trailing={<StatusChip tone={tone}>{word}</StatusChip>} onClick={() => openRequest(r)} />
            })}
          </ListCard>
        </div>
      ) : null}
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ds-ink-2)' }}>{footnote(data)}</p>
    </div>
  )
}
