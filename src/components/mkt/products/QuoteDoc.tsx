'use client'

import { useEffect, useState } from 'react'
import { addDays, dmy, includedOf, lineCalc, lineExtrasWords, quoteCsv, quoteTotals, rm, termOf, type QuoteCore } from '@/lib/marketing/quotes'
import qs from './quotes.module.css'

// The quotation as a document (`Product Builder.dc.html` › the client PDF and the internal pricing sheet): an A4-like
// sheet on the desk — HOUZS Marketing, Prepared for · Date · Valid until, its lines, its totals and notes. The client's
// carries no cost or margin anywhere; the internal sheet adds them and what "We make". A version from the history is
// read-only, under an amber banner. Download: the PDF (`/marketing/products/pdf`, a GET route) or the CSV.

export default function QuoteDoc({ kind, quote: q, quoteId, viewing, account, onClose, flash }: {
  kind: 'client' | 'internal'
  quote: QuoteCore & { no: string }
  quoteId: string
  viewing: { rev: number; at: string } | null
  account: string
  onClose: () => void
  flash: (words: string) => void
}) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const t = quoteTotals(q)
  const client = kind === 'client'
  const validUntil = q.date ? dmy(addDays(q.date, q.valid)) : '—'
  const profitTone = !t.hasCost ? qs.makeNone : t.profit < 0 || (t.margin != null && t.margin < 20) ? qs.makeBad : qs.makeGood
  const warn = !t.hasCost && q.lines.length ? 'A product has no internal cost — margin can’t be worked out' : t.margin != null && t.margin < 20 ? 'Below 20% margin' : ''

  const download = async () => {
    if (busy) return
    if (!client) {
      const text = quoteCsv(q, q.client, account)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }))
      a.download = `${q.no}-internal-pricing.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      onClose()
      flash(`Downloaded ${q.no}-internal-pricing.csv`)
      return
    }
    setBusy(true)
    try {
      const url = `/marketing/products/pdf?q=${encodeURIComponent(quoteId)}${viewing ? `&v=${viewing.rev}` : ''}`
      const res = await fetch(url)
      if (!res.ok) return flash((await res.text()) || 'The PDF could not be made. Please try again.')
      const name = `${q.no}${viewing ? `-v${viewing.rev}` : ''}.pdf`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(await res.blob())
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      onClose()
      flash(`Downloaded ${name}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={qs.scrim} onClick={onClose}>
      <div className={qs.dialog} role="dialog" aria-modal="true" aria-label={client ? 'Client quotation' : 'Internal pricing sheet'} onClick={e => e.stopPropagation()}>
        <div className={qs.dlgHead}>
          <span className={qs.dlgTitle}>{client ? (viewing ? `Client quotation · v${viewing.rev}` : 'Client quotation') : 'Internal pricing sheet'}</span>
          <span className={qs.dlgSub}>{client ? (viewing ? `Sent ${dmy(viewing.at)} · from history` : 'What the subsidiary receives — no costs or margins') : '🔒 Manager only'}</span>
          <span className={qs.grow} />
          <button type="button" className={qs.dark} disabled={busy} onClick={() => void download()}>{client ? 'Download PDF' : 'Download CSV'}</button>
          <button type="button" className={qs.close} aria-label="Close" onClick={onClose}>×</button>
        </div>
        {viewing ? (
          <div className={qs.viewBanner}>You are looking at v{viewing.rev}, sent {dmy(viewing.at)}. It is read-only — close it to go back to the current quotation.</div>
        ) : null}
        <div className={qs.desk}>
          <div className={qs.sheet}>
            <div className={qs.docHead}>
              <span className={qs.hTile}>H</span>
              <div className={qs.docBrand}><b>HOUZS Marketing</b><span className={qs.docKicker}>{client ? 'Marketing services' : 'Internal · not for the client'}</span></div>
              <span className={qs.grow} />
              <div className={qs.docTitleBox}><span className={qs.docTitle}>{client ? 'Quotation' : 'Pricing sheet'}</span><span className={qs.docNo}>{q.no}</span></div>
            </div>
            <div className={qs.band}>
              <div className={qs.bandCell}>
                <span className={qs.bandK}>Prepared for</span>
                <span className={qs.bandV}>{q.client || '—'}</span>
                {q.contact ? <span>Attn: {q.contact}</span> : null}
              </div>
              <div className={qs.bandCell}><span className={qs.bandK}>Date</span><span className={qs.bandV}>{dmy(q.date)}</span></div>
              <div className={qs.bandCell}><span className={qs.bandK}>Valid until</span><span className={qs.bandV}>{validUntil}</span></div>
            </div>
            {client ? (
              <div className={qs.dTable}>
                <div className={`${qs.dRow} ${qs.dRowHead}`}><span>Product</span><span>What&apos;s included</span><span>Term</span><span className={qs.dR}>Amount</span></div>
                {q.lines.map(l => (
                  <div key={l.key} className={qs.dRow}>
                    <span className={qs.dCol}><b style={{ fontWeight: 600 }}>{l.name}</b>{l.eta ? <span className={qs.dEta}>Est. delivery {dmy(l.eta)}</span> : null}</span>
                    <span className={`${qs.dCol} ${qs.dInc}`}><span>{includedOf(l)}</span>{lineExtrasWords(l, true) ? <span className={qs.dExtra}>{lineExtrasWords(l, true)}</span> : null}{l.remark ? <span className={qs.dRemark}>{l.remark}</span> : null}</span>
                    <span className={qs.dTerm}>{termOf(l)}</span>
                    <span className={qs.dAmt}>{rm(lineCalc(l).amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={qs.dTable}>
                <div className={`${qs.dRow} ${qs.dRowI} ${qs.dRowHead}`}>
                  <span>Product</span><span className={qs.dR}>List</span><span className={qs.dR}>Quoted</span><span className={qs.dR}>Cost</span><span className={qs.dR}>Profit</span><span className={qs.dR}>Margin</span>
                </div>
                {q.lines.map(l => {
                  const c = lineCalc(l)
                  const lm = c.cost != null && c.amount > 0 ? Math.round(((c.amount - c.cost) / c.amount) * 100) : null
                  return (
                    <div key={l.key} className={`${qs.dRow} ${qs.dRowI} ${qs.dRowIBody}`}>
                      <span className={qs.dIName}><b>{l.name}</b> <span style={{ color: 'rgb(var(--mk-muted))' }}>{termOf(l)}</span>{lineExtrasWords(l) ? <span className={qs.dExtraI}>{lineExtrasWords(l)}</span> : null}</span>
                      <span className={qs.dR}>{rm(c.listTotal)}</span>
                      <span className={qs.dR}>{rm(c.amount)}</span>
                      <span className={qs.dR}>{rm(c.cost)}</span>
                      <span className={qs.dR}>{c.cost == null ? '—' : rm(c.amount - c.cost)}</span>
                      <span className={`${qs.dR}${lm != null && lm < 20 ? ` ${qs.red}` : ''}`}>{lm == null ? '—' : `${lm}%`}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className={qs.totalsWrap}>
              <div className={qs.totals}>
                <div className={qs.tRow}><span className={qs.tK}>Subtotal</span><span className={qs.grow} /><span className={qs.tV}>{rm(t.sub)}</span></div>
                {t.disc ? <div className={qs.tRow}><span className={qs.tK}>Discount {t.disc}%</span><span className={qs.grow} /><span className={qs.tV}>−{rm(t.sub - t.total)}</span></div> : null}
                <div className={qs.tTotal}><span>Total</span><span className={qs.grow} /><span>{rm(t.total)}</span></div>
                {!client ? (
                  <>
                    <div className={qs.tRow} style={{ marginTop: 6 }}><span className={qs.tK}>Internal cost</span><span className={qs.grow} /><span className={qs.tV}>−{t.hasCost ? rm(t.cost) : '—'}</span></div>
                    <div className={`${qs.make} ${profitTone}`}>
                      <div className={qs.makeTop}><b>We make</b><span className={qs.grow} /><span className={qs.makeBig}>{t.hasCost ? rm(t.profit) : '—'}</span></div>
                      <div className={qs.makeM}><span>Margin</span><span className={qs.grow} /><span className={qs.mono} style={{ fontWeight: 600 }}>{t.margin == null ? '—' : `${t.margin}%`}</span></div>
                      {warn ? <div className={qs.warn} style={{ fontSize: '.86em' }}>{warn}</div> : null}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            {q.note.trim() ? (
              <div className={qs.docNote}><span className={qs.bandK}>Notes</span><span>{q.note}</span></div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
