import { describe, expect, it } from 'vitest'
import { lineWords, namesAmount, type LineSays } from './line-words'

// 2026-10-26 — what a line says in the drill-downs (the mockup's fifth round, on Marketing's real lines): its own words
// unless they are the system's, else its document's; who it was with apart, put first by the sheet.

const line = (says: Partial<LineSays>): LineSays => ({ description: null, entry_description: null, entry_no: 'JE-202610-0001', debit: 0, credit: 0, ...says })

describe('a line with words of its own', () => {
  it('keeps them, its first line only', () => {
    expect(lineWords(line({ description: 'Dunlopillo Media', doc_text: "Marketing Service - Sep'26", party: 'HC' }))).toEqual({
      text: 'Dunlopillo Media',
      party: 'HC',
      entryNo: 'JE-202610-0001',
    })
    expect(lineWords(line({ description: "Basic Salary - Jul'26\nbatch #1" })).text).toBe("Basic Salary - Jul'26")
  })

  it('keeps a reversal or a void as it says', () => {
    expect(lineWords(line({ description: 'Reversal — Payment received — The Cont', doc_text: 'Settle invoice HV-INV-202607-0028 — The Cont' })).text).toBe(
      'Reversal — Payment received — The Cont',
    )
  })
})

describe('a line in the system’s words', () => {
  it('says what its payment was for', () => {
    const pv = line({ description: 'expense - Multicode IT Connection Sdn Bhd (venture_pool)', doc_text: "Internet - Oct'26 [venture_pool]", ref_no: 'HV-PV-202610-0453', debit: 1110 })
    expect(lineWords(pv).text).toBe("Internet - Oct'26")
    expect(lineWords(line({ description: 'expense - KHO WEI JIE (9087)', doc_text: 'Outsource Design', ref_no: 'HV-PV-202610-0447' })).text).toBe('Outsource Design')
  })

  it('takes the item of a claim that carries its amount, else every item', () => {
    const claim = 'Marketing Claim\nLaser - RM 170\nClaude - RM 409.83\nChatGPT - RM99.90\nCanva - RM 250'
    const of = (debit: number) => lineWords(line({ description: 'expense - SIA JOSIAH (dept_pool_marketing)', doc_text: claim, ref_no: 'HV-PV-202606-0011', debit })).text
    expect(of(409.83)).toBe('Claude - RM 409.83')
    expect(of(99.9)).toBe('ChatGPT - RM99.90')
    expect(of(250)).toBe('Canva - RM 250')
    expect(lineWords(line({ description: 'expense - KHO WEI JIE (dept_pool_marketing)', doc_text: 'ChatGPT - Sep26 - RM99.9\nMarketing Team Refreshment -RM61\nMonitor RM 495.20', ref_no: 'HV-PV-202609-0433', debit: 656.1 })).text).toBe(
      'ChatGPT - Sep26 - RM99.9 · Marketing Team Refreshment -RM61 · Monitor RM 495.20',
    )
  })

  it('says what its invoice or its receipt was', () => {
    const reclass = 'Reclass 2026-07-24: revenue split per invoice line category (was lumped into 5000)'
    expect(lineWords(line({ description: reclass, doc_text: "Marketing Service - May'26\n- Market Research", ref_no: 'HV-INV-202605-0040', credit: 3000 })).text).toBe("Marketing Service - May'26")
    expect(lineWords(line({ description: 'Service billing revenue recognised', doc_text: "Marketing Service - Jun'26", ref_no: 'HV-INV-202606-0019' })).text).toBe("Marketing Service - Jun'26")
    expect(lineWords(line({ description: 'Inter-billing (Marketing) — by nature', doc_text: 'Office Rental — Sep 2026', ref_no: 'HV-INV-202609-0013' })).text).toBe('Office Rental — Sep 2026')
    expect(lineWords(line({ description: 'Payment received — Carres', doc_text: 'Settle invoice HV-INV-202606-0015 — Carres', ref_no: 'HV-OR-202608-0254', party: 'CAR' }))).toEqual({
      text: 'Settle invoice HV-INV-202606-0015 — Carres',
      party: 'CAR',
      entryNo: 'JE-202610-0001',
    })
  })

  it('falls back on its entry’s words', () => {
    expect(lineWords(line({ entry_description: "Markting Salary - May'26" })).text).toBe("Markting Salary - May'26")
    expect(lineWords(line({ description: 'Payment received — —', entry_description: 'PV HV-OR-202609-0321: Settle invoice HV-INV-202609-0001 — Carres [marketing]' })).text).toBe(
      'Settle invoice HV-INV-202609-0001 — Carres',
    )
  })
})

describe('a line from before the system', () => {
  it('gives its old number and, for a payment, who it went to', () => {
    expect(lineWords(line({ description: "OFFICE RENTAL (E2803A) - APRIL'26", entry_description: 'PV-000042 [marketing] — EHJ1 PROPERTY (MALAYSIA) SDN BHD', entry_no: null }))).toEqual({
      text: "OFFICE RENTAL (E2803A) - APRIL'26",
      party: 'EHJ1 PROPERTY (MALAYSIA) SDN BHD',
      entryNo: 'PV-000042',
    })
  })

  it('never names the bank as who', () => {
    expect(lineWords(line({ description: 'THE CONTS SDN BHD', entry_description: 'OR-000123 — BANK - HONG LEONG', entry_no: null }))).toEqual({
      text: 'THE CONTS SDN BHD',
      party: null,
      entryNo: 'OR-000123',
    })
  })
})

describe('who it was with', () => {
  it('is said once', () => {
    expect(lineWords(line({ entry_description: "Salary - Sep'26 · Marketing · 3 vouchers", entry_no: null, party: 'Marketing' }))).toEqual({
      text: "Salary - Sep'26 · 3 vouchers",
      party: 'Marketing',
      entryNo: null,
    })
  })
})

describe('namesAmount', () => {
  it('finds the amount however a claim writes it, and never part of another', () => {
    expect(namesAmount('ChatGPT - RM99.90', 99.9)).toBe(true)
    expect(namesAmount('Canva - RM 250', 250)).toBe(true)
    expect(namesAmount('Ads - RM 1,028.31', 1028.31)).toBe(true)
    expect(namesAmount('Ads - RM 1,028.31', 28.31)).toBe(false)
    expect(namesAmount("MR LOO - SOFTWARE CLAIM - SEP'26 — RM 2,899.75 × 40%", 1159.9)).toBe(false)
    expect(namesAmount('Anything', 0)).toBe(false)
  })
})
