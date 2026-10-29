import { describe, expect, it } from 'vitest'
import {
  billBackAnswered,
  billBackCategories,
  canCancel,
  canEdit,
  draftOf,
  draftPayload,
  emptyDraft,
  parseContext,
  parseRequest,
  parseRequests,
  payToWords,
  prContentType,
  prFileRefusal,
  prObjectPath,
  pvTogether,
  samePayeeOpen,
  staffCards,
  staffHero,
  submitProblem,
  voucherStart,
  whereItIs,
  whoPaysWords,
  type PaymentRequest,
  type RequestContext,
  type RequestDraft,
} from './model'

// Staff payment requests (2026-10-29, PR ②): what the database hands, the Claim page's cards and words, the New
// request window's checks and what it sends, and what Finance's Create PV starts from.

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'r1', requestNo: 'PRQ-2610-0001', status: 'with_finance', kind: 'claim', mine: true, requesterName: 'KHO WEI JIE',
  departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing', billingMode: 'marketing_project',
  payToSalary: true, payeeName: 'KHO WEI JIE', payeeBank: 'Hong Leong Bank', payeeAccount: '•••• 4821',
  description: 'Claude · Oct · Jian Ying', total: '779.58', submittedAt: '2026-10-29T02:00:00Z', createdAt: '2026-10-29T01:00:00Z',
  updatedAt: '2026-10-29T02:00:00Z', rejectedStage: null, rejectedAt: null, rejectReason: null, rejectedByName: null,
  pvId: null, pvNo: null, pvStatus: null,
  items: [{ id: 'i1', description: 'Claude · Oct', amount: 453.79 }, { id: 'i2', description: 'Jian Ying', amount: 325.79 }],
  shares: [],
  files: [{ id: 'f1', kind: 'receipt', name: 'Receipt-2932.pdf', contentType: 'application/pdf', size: 1200 }],
  ...over,
})
const req = (over: Record<string, unknown> = {}) => parseRequest(raw(over)) as PaymentRequest
const CTX: RequestContext = {
  name: 'KHO WEI JIE', departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing',
  salaryAccount: { bank: 'Hong Leong Bank', last4: '4821' },
  departments: [{ id: 'hr', name: 'HR' }], companies: [{ id: 'dc', name: 'Dream Crafter' }],
}
const draft = (over: Partial<RequestDraft> = {}): RequestDraft => ({
  ...emptyDraft(), kind: 'claim', salary: true, items: [{ description: 'Claude · Oct', amount: '453.79' }], split: false, ...over,
})

describe('what the database hands', () => {
  it('reads a request whole — figures as numbers — and drops what is not one', () => {
    const r = req()
    expect([r.requestNo, r.total, r.items.map((i) => i.amount), r.files[0].name, r.payToSalary]).toEqual(['PRQ-2610-0001', 779.58, [453.79, 325.79], 'Receipt-2932.pdf', true])
    expect(parseRequests([raw(), { id: 'x', status: 'nonsense' }, null]).map((x) => x.id)).toEqual(['r1'])
  })

  it('reads the window’s lists, the salary account only when HR has one', () => {
    expect(parseContext({ ...CTX, salaryAccount: null })?.salaryAccount).toBeNull()
    expect(parseContext(CTX)?.salaryAccount).toEqual({ bank: 'Hong Leong Bank', last4: '4821' })
    expect(parseContext({})).toBeNull()
  })
})

describe('the Claim page', () => {
  it('cards: All · Draft · With Finance · Rejected · Paid — a request in its voucher is still with Finance, a cancelled one only under All', () => {
    const rows = [req(), req({ id: 'r2', status: 'draft', total: 10 }), req({ id: 'r3', status: 'in_pv', pvId: 'v', pvNo: 'HV-PV-202610-0700', total: 20 }), req({ id: 'r4', status: 'cancelled', total: 5 })]
    expect(staffCards(rows).map((c) => [c.label, c.sub, c.value])).toEqual([
      ['All requests', '4 requests', 'RM 814.58'],
      ['Draft', '1 request', 'RM 10.00'],
      ['With Finance', '2 requests', 'RM 799.58'],
      ['Rejected', '0 requests', 'RM 0.00'],
      ['Paid', '0 requests', 'RM 0.00'],
    ])
    expect(staffHero(rows)).toEqual({ label: 'Waiting to be paid · 2 requests', value: 'RM 799.58' })
  })

  it('says where it is, in the requester’s words', () => {
    expect(whereItIs(req()).text).toBe('With Finance')
    expect(whereItIs(req({ status: 'rejected' })).text).toBe('Rejected — fix and send again')
    expect(whereItIs(req({ status: 'in_pv', pvNo: 'HV-PV-202610-0700', pvStatus: 'pending_approval' })).text).toBe('HV-PV-202610-0700 · waiting for approval')
    expect(whereItIs(req({ status: 'paid' }))).toEqual({ text: 'Paid', tone: 'ledger' })
  })

  it('is the requester’s to change while a draft or sent back; to withdraw until Finance has a voucher', () => {
    expect([canEdit(req({ status: 'draft' })), canEdit(req({ status: 'rejected' })), canEdit(req())]).toEqual([true, true, false])
    expect([canCancel(req()), canCancel(req({ status: 'in_pv', pvId: 'v' })), canCancel(req({ mine: false }))]).toEqual([true, false, false])
  })

  it('names who is paid and who pays', () => {
    expect(payToWords(req())).toBe('Salary account · Hong Leong Bank •••• 4821')
    expect(payToWords(req({ kind: 'direct_pay', payToSalary: false, payeeName: 'Canva', payeeBank: 'CIMB', payeeAccount: '8001234' }))).toBe('Canva · CIMB 8001234')
    expect(whoPaysWords(req({ shares: [{ id: 's', party: 'company', companyName: 'Dream Crafter', amount: 100, billBack: null }] }))).toBe('Marketing · Dream Crafter RM 100.00')
  })
})

describe('the New request window', () => {
  it('asks for what is still missing, in one sentence', () => {
    expect(submitProblem(emptyDraft(), 0, CTX)).toBe('Pick what it is first.')
    expect(submitProblem(draft(), 0, CTX)).toBe('Add the receipts or invoices.')
    expect(submitProblem(draft({ salary: null, split: null, items: [{ description: '', amount: '5' }] }), 1, CTX)).toBe(
      'Add where to pay you, each item’s words and amount and which pool pays.',
    )
    expect(submitProblem(draft({ kind: 'direct_pay', salary: null }), 1, CTX)).toBe('Add the supplier’s name, the bank and the account number.')
    expect(submitProblem(draft(), 1, CTX)).toBeNull()
  })

  it('a claim into a salary account HR does not have is refused before it is sent', () => {
    expect(submitProblem(draft(), 1, { ...CTX, salaryAccount: null })).toMatch(/HR has no salary account for you/)
    expect(submitProblem(draft({ salary: false, bank: 'Public Bank', accountNo: '3-1874502-10' }), 1, { ...CTX, salaryAccount: null })).toBeNull()
  })

  it('a split leaves the department its part, and each share needs who and how much', () => {
    expect(submitProblem(draft({ split: true, shares: [{ party: 'company', partyId: '', amount: '10' }] }), 1, CTX)).toBe('Add each share’s who and amount.')
    expect(submitProblem(draft({ split: true, shares: [{ party: 'company', partyId: 'dc', amount: '453.79' }] }), 1, CTX)).toMatch(/must be less than the RM 453.79 total/)
    expect(submitProblem(draft({ items: [{ description: 'x', amount: 'RM12' }] }), 1, CTX)).toMatch(/is not an amount/)
  })

  it('sends what the database files — the account’s digits, no empty rows, the shares only when split', () => {
    const files = [{ path: 'u/k/a.pdf', name: 'a.pdf', contentType: 'application/pdf', size: 3 }]
    expect(draftPayload(draft({ salary: false, bank: ' Public Bank ', accountNo: '3-1874502 10', items: [{ description: ' Canva ', amount: '250' }, { description: '', amount: '' }], shares: [{ party: 'department', partyId: 'hr', amount: '80' }] }), files, ['f9'])).toEqual({
      kind: 'claim',
      payTo: { salary: false, bank: 'Public Bank', accountNo: '3187450210' },
      items: [{ description: 'Canva', amount: '250' }],
      shares: [],
      files,
      removeFiles: ['f9'],
    })
    expect(draftPayload(draft({ split: true, shares: [{ party: 'company', partyId: 'dc', amount: '1,000.50' }] }), [], [])?.shares).toEqual([{ party: 'company', companyId: 'dc', amount: '1000.50' }])
    expect(draftPayload(emptyDraft(), [], [])).toBeNull()
  })

  it('a saved request comes back into the window as it was sent', () => {
    const d = draftOf(req({ kind: 'direct_pay', payToSalary: false, payeeName: 'Canva', payeeBank: 'CIMB', payeeAccount: '8001234', shares: [{ id: 's', party: 'company', companyId: 'dc', amount: 100 }] }))
    expect([d.kind, d.supplier, d.bank, d.accountNo, d.items.length, d.split, d.shares]).toEqual(['direct_pay', 'Canva', 'CIMB', '8001234', 2, true, [{ party: 'company', partyId: 'dc', amount: '100.00' }]])
  })

  it('files: what a voucher takes, up to 25 MB, into the uploader’s own folder', () => {
    expect([prContentType('Receipt.JPG'), prContentType('scan.heic')]).toEqual(['image/jpeg', null])
    expect(prFileRefusal({ name: 'big.pdf', size: 26 * 1024 * 1024 })).toBe('big.pdf is over 25 MB.')
    expect(prFileRefusal({ name: 'clip.mov', size: 10 })).toMatch(/a PDF, a photo/)
    expect(prObjectPath('u1', 'Resit Grab (Oct).pdf', 'k')).toBe('u1/k/Resit_Grab_Oct_.pdf')
  })
})

describe('Create PV', () => {
  it('combines the same payee’s requests with no PV yet — one payee into one account', () => {
    const a = req()
    const b = req({ id: 'r2', submittedAt: '2026-10-29T03:00:00Z' })
    const other = req({ id: 'r3', payeeAccount: '•••• 0210' })
    const paid = req({ id: 'r4', status: 'in_pv', pvId: 'v' })
    expect(samePayeeOpen([a, b, other, paid], b).map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('takes the answered ones; one whose Bill back? is still to answer stays with Finance (2026-10-29, "可以")', () => {
    const picked = req()
    const answered = req({ id: 'r2', shares: [{ id: 's2', party: 'company', companyId: 'dc', amount: 10, billBack: false }] })
    const waiting = req({ id: 'r3', shares: [{ id: 's3', party: 'company', companyId: 'dc', amount: 10, billBack: null }] })
    const { together, left } = pvTogether([picked, answered, waiting], picked)
    expect([together.map((r) => r.id), left.map((r) => r.id)]).toEqual([['r1', 'r2'], ['r3']])
    expect([billBackAnswered(waiting), billBackAnswered(picked)]).toEqual([false, true])
  })

  it('starts the voucher from them: a line per item on the department’s pool, the account under Pay to, the notes, the files, the Yes shares', () => {
    const a = req({ shares: [{ id: 's1', party: 'company', companyId: 'dc', companyName: 'Dream Crafter', amount: 100, billBack: true }, { id: 's2', party: 'department', departmentId: 'hr', amount: 20, billBack: false }] })
    const b = req({ id: 'r2', requestNo: 'PRQ-2610-0002', submittedAt: '2026-10-29T03:00:00Z', items: [{ id: 'i3', description: 'Canva', amount: 50 }], files: [] })
    const start = voucherStart([b, a])
    expect(start.requestIds).toEqual(['r1', 'r2'])
    expect([start.payee, start.payInto, start.description, start.notes]).toEqual([
      'KHO WEI JIE', 'Pay into Hong Leong Bank •••• 4821 · salary account', '2 requests · KHO WEI JIE', 'From Payment request · PRQ-2610-0001, PRQ-2610-0002',
    ])
    expect(start.lines.map((l) => [l.requestId, l.description, l.pool, l.amount])).toEqual([
      ['r1', 'Claude · Oct', 'dept_pool_marketing', 453.79], ['r1', 'Jian Ying', 'dept_pool_marketing', 325.79], ['r2', 'Canva', 'dept_pool_marketing', 50],
    ])
    expect(start.billBack).toEqual([{ shareId: 's1', requestId: 'r1' }])
    expect(start.files.map((f) => f.name)).toEqual(['Receipt-2932.pdf'])
    // Each Yes share is invoiced at its request's first line's category on the voucher.
    expect(billBackCategories(start.billBack, [{ requestId: 'r1', account: '' }, { requestId: 'r1', account: '9087' }, { requestId: 'r2', account: '9031' }])).toEqual([{ share: 's1', category: '9087' }])
    expect(billBackCategories(start.billBack, [{ requestId: 'r2', account: '9031' }])).toEqual([{ share: 's1', category: '' }])
  })

  it('a share whose invoice is drafted already is not drafted again — unless it was voided', () => {
    const drafted = req({ shares: [{ id: 's1', party: 'company', companyId: 'dc', amount: 100, billBack: true, invoiceNo: 'HV-INV-202610-0091', invoiceStatus: 'draft' }] })
    expect(voucherStart([drafted]).billBack).toEqual([])
    const voided = req({ shares: [{ id: 's1', party: 'company', companyId: 'dc', amount: 100, billBack: true, invoiceNo: 'HV-INV-202610-0091', invoiceStatus: 'voided' }] })
    expect(voucherStart([voided]).billBack).toEqual([{ shareId: 's1', requestId: 'r1' }])
  })
})
