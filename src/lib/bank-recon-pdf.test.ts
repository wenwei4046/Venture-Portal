import { describe, it, expect } from 'vitest'
import { looksLikeHlb, parseHlbPdf, type PdfPageItems } from './bank-recon-pdf'

// Geometry mirrors the real "Venture - Apr'26.pdf": header x — Deposit 21.70,
// Withdrawal 26.20, Balance 31.57; dates x≈3.40, description x≈6.13,
// withdrawal numbers ≈28.7, deposit ≈23.6, balance ≈32.5.
function fixturePage(): PdfPageItems {
  const t = (x: number, y: number, text: string) => ({ x, y, text })
  return {
    items: [
      t(22.25, 4.9, 'HLB PRIMEBIZ CURRENT ACCOUNT'),
      t(3.93, 14.9, 'Date'),
      t(6.67, 14.9, 'Transaction Description'),
      t(21.7, 14.9, 'Deposit'),
      t(26.2, 14.9, 'Withdrawal'),
      t(31.57, 14.9, 'Balance'),
      t(6.13, 16.5, 'Balance from previous statement'),
      t(32.85, 16.5, '26,422.51'),
      // Withdrawal txn with continuation lines + noise ref.
      t(3.4, 17.2, '01-04-2026'),
      t(6.13, 17.2, 'CIB Instant Transfer at DIO'),
      t(28.68, 17.2, '38.25'),
      t(6.13, 17.7, 'GraB'),
      t(6.13, 18.2, 'PV-000017'),
      t(6.13, 18.69, 'IZZUL BIN ISMAIL'),
      t(6.13, 19.18, '20260401HLBBMYKL010OCB41066262'),
      // Deposit txn with balance on the same row (last of its date).
      t(3.4, 20.1, '02-04-2026'),
      t(6.13, 20.1, 'Fund Transfer at DIO'),
      t(23.6, 20.1, '32,340.87'),
      t(32.5, 20.1, '57,702.31'),
      t(6.13, 20.6, 'Carress'),
      t(6.13, 21.1, 'HPV-2604-004'),
      t(6.13, 21.6, 'CARRESS SDN. BHD.'),
      t(9.1, 23.0, '23600599248_6 1'), // page artifact — ignored
      // Final withdrawal with closing balance.
      t(3.4, 24.0, '30-04-2026'),
      t(6.13, 24.0, 'Fund Transfer at DIO'),
      t(28.0, 24.0, '12,834.24'),
      t(32.5, 24.0, '45,890.89'),
      t(6.13, 24.5, 'INVOICE APR26'),
    ],
  }
}

describe('parseHlbPdf', () => {
  it('classifies columns, joins continuation lines, ties to balances', () => {
    const r = parseHlbPdf([fixturePage()])
    if ('error' in r) throw new Error(r.error)
    expect(r.lines).toEqual([
      {
        date: '2026-04-01',
        description: 'CIB Instant Transfer at DIO · GraB · PV-000017 · IZZUL BIN ISMAIL',
        amount: -38.25,
      },
      {
        date: '2026-04-02',
        description: 'Fund Transfer at DIO · Carress · HPV-2604-004 · CARRESS SDN. BHD.',
        amount: 32340.87,
      },
      {
        date: '2026-04-30',
        description: 'Fund Transfer at DIO · INVOICE APR26',
        amount: -12834.24,
      },
    ])
    expect(r.opening).toBe(26422.51)
    expect(r.closing).toBe(45890.89)
    expect(r.skipped).toBe(0)
  })

  // Regression, "Venture - Aug'26.pdf" (2026-09-28): the money cells are
  // right-aligned, so RM 1.60 starts ~1 unit right of RM 100,000.00 in the same
  // column. Nearest-header-x put the rebate credits in Withdrawal and the
  // service charges in Balance (dropping them) — the statement then missed
  // 2 deposits and refused to load. Same geometry as the real file.
  it('files short right-aligned amounts by column band, not nearest header', () => {
    const t = (x: number, y: number, text: string) => ({ x, y, text })
    const page: PdfPageItems = {
      items: [
        t(22.25, 4.9, 'HLB PRIMEBIZ CURRENT ACCOUNT'),
        t(3.93, 14.9, 'Date'), t(6.67, 14.9, 'Transaction Description'),
        t(21.7, 14.9, 'Deposit'), t(26.2, 14.9, 'Withdrawal'), t(31.57, 14.9, 'Balance'),
        t(6.13, 16.5, 'Balance from previous statement'), t(32.63, 16.5, '1,000.00'),
        // Long numbers: deposit starts at 22.94, withdrawal at 27.89.
        t(3.4, 17.2, '01-08-2026'), t(6.13, 17.2, 'Fund Transfer at DIO'), t(22.94, 17.2, '10,929.08'),
        t(3.4, 18.2, '02-08-2026'), t(6.13, 18.2, 'Fund Transfer at DIO'), t(27.89, 18.2, '11,800.00'),
        // Short numbers sit ~1 unit further right in the SAME columns.
        t(3.4, 19.2, '03-08-2026'), t(6.13, 19.2, 'Service Charge - ePayment at KLM'), t(28.91, 19.2, '1.60'),
        t(3.4, 20.2, '04-08-2026'), t(6.13, 20.2, 'Rebates-Fees/Loan Interest/Token'), t(23.96, 20.2, '0.40'),
        t(32.63, 20.2, '127.88'),
      ],
    }
    const r = parseHlbPdf([page])
    if ('error' in r) throw new Error(r.error)
    expect(r.lines.map(l => l.amount)).toEqual([10929.08, -11800, -1.6, 0.4])
    expect(r.skipped).toBe(0)
    expect(r.closing).toBe(127.88)
  })

  it('refuses when movements do not tie to opening→closing', () => {
    const page = fixturePage()
    // Corrupt one amount so the sum check fails.
    const bad = page.items.find(i => i.text === '38.25')!
    bad.text = '999.99'
    const r = parseHlbPdf([page])
    expect('error' in r).toBe(true)
  })

  it('looksLikeHlb detects the letterhead', () => {
    expect(looksLikeHlb([fixturePage()])).toBe(true)
    expect(looksLikeHlb([{ items: [{ x: 1, y: 1, text: 'MAYBANK STATEMENT' }] }])).toBe(false)
  })
})
