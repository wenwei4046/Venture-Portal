import { describe, expect, it } from 'vitest'
import {
  approveCards,
  approveHero,
  approveLede,
  orWords,
  parseApproval,
  routeWords,
  rowsOfApproveCard,
  waitsForMe,
  whereItIsNote,
  billBackAnswers,
  billBackWords,
  canCancel,
  canEdit,
  draftOf,
  draftPayload,
  emptyDraft,
  openSplits,
  parseContext,
  parseRequest,
  parseRequests,
  payToWords,
  prContentType,
  prFileRefusal,
  prObjectPath,
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
  departments: [{ id: 'hr', name: 'HR' }], companies: [{ id: 'dc', name: 'Dream Crafter' }], reviewers: null,
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

  it('starts the voucher from them: a line per item on the department’s pool, the account under Pay to, the notes, the files, every split to answer', () => {
    const a = req({ shares: [{ id: 's1', party: 'company', companyId: 'dc', companyName: 'Dream Crafter', amount: 100, billBack: null }, { id: 's2', party: 'department', departmentId: 'hr', departmentName: 'HR', amount: 20, billBack: null }] })
    const b = req({ id: 'r2', requestNo: 'PRQ-2610-0002', submittedAt: '2026-10-29T03:00:00Z', items: [{ id: 'i3', description: 'Canva', amount: 50 }], files: [] })
    const start = voucherStart([b, a])
    expect(start.requestIds).toEqual(['r1', 'r2'])
    expect([start.payee, start.payInto, start.description, start.notes, start.department]).toEqual([
      'KHO WEI JIE', 'Pay into Hong Leong Bank •••• 4821 · salary account', '2 requests · KHO WEI JIE', 'From Payment request · PRQ-2610-0001, PRQ-2610-0002', 'Marketing',
    ])
    expect(start.lines.map((l) => [l.requestId, l.description, l.pool, l.amount])).toEqual([
      ['r1', 'Claude · Oct', 'dept_pool_marketing', 453.79], ['r1', 'Jian Ying', 'dept_pool_marketing', 325.79], ['r2', 'Canva', 'dept_pool_marketing', 50],
    ])
    expect(start.splits.map((s) => [s.shareId, s.requestNo, s.who, s.amount, s.invoiceNo])).toEqual([
      ['s1', 'PRQ-2610-0001', 'Dream Crafter', 100, null], ['s2', 'PRQ-2610-0001', 'HR', 20, null],
    ])
    expect(start.files.map((f) => f.name)).toEqual(['Receipt-2932.pdf'])
  })

  // 2026-10-29 — the user: "我开pv 时就要确定是不是要开单了" — each split's Bill back? is answered in the Create PV window.
  it('sends each split’s answer with the voucher; a Yes carries the category of its request’s first line', () => {
    const start = voucherStart([req({ shares: [
      { id: 's1', party: 'company', companyId: 'dc', companyName: 'Dream Crafter', amount: 100, billBack: null },
      { id: 's2', party: 'department', departmentId: 'hr', departmentName: 'HR', amount: 20, billBack: null },
    ] })])
    const lines = [{ requestId: 'r1', account: '' }, { requestId: 'r1', account: '9087' }]
    expect(billBackAnswers(start.splits, { s1: true, s2: false }, lines)).toEqual([{ share: 's1', billBack: true, category: '9087' }, { share: 's2', billBack: false }])
    // Not answered yet: nothing sent for it (the window asks first).
    expect(billBackAnswers(start.splits, { s2: false }, lines)).toEqual([{ share: 's2', billBack: false }])
    // A Yes whose request has no line left has no category (the window says so first).
    expect(billBackAnswers(start.splits, { s1: true }, [])).toEqual([{ share: 's1', billBack: true, category: '' }])
  })

  it('a split whose invoice is drafted already is not asked again — unless that invoice was voided', () => {
    const drafted = voucherStart([req({ shares: [{ id: 's1', party: 'company', companyId: 'dc', amount: 100, billBack: true, invoiceNo: 'HV-INV-202610-0091', invoiceStatus: 'draft' }] })])
    expect([drafted.splits[0].invoiceNo, openSplits(drafted.splits)]).toEqual(['HV-INV-202610-0091', []])
    const voided = voucherStart([req({ shares: [{ id: 's1', party: 'company', companyId: 'dc', amount: 100, billBack: true, invoiceNo: 'HV-INV-202610-0091', invoiceStatus: 'voided' }] })])
    expect(openSplits(voided.splits).map((s) => s.shareId)).toEqual(['s1'])
  })

  it('says each split’s Bill back as Finance reads it', () => {
    const share = { id: 's', party: 'company' as const, departmentId: null, departmentName: null, companyId: 'dc', companyName: 'Dream Crafter', amount: 10, invoiceId: null }
    expect(billBackWords({ ...share, billBack: null, invoiceNo: null, invoiceStatus: null })).toBe('Decided when the PV is made')
    expect(billBackWords({ ...share, billBack: false, invoiceNo: null, invoiceStatus: null })).toBe('No — the department pays it')
    expect(billBackWords({ ...share, billBack: true, invoiceNo: 'HV-INV-202610-0091', invoiceStatus: 'draft' })).toBe('Yes · HV-INV-202610-0091 (draft)')
  })
})

// PR ③ (2026-10-29): a department's approval before Finance — who approves, who approved, who sent it back, the New
// request window's last line, and Claim & approve's cards.
describe('a department’s approval first', () => {
  it('reads who approves it, who approved it, and whether it was sent for approval', () => {
    const waiting = req({ status: 'pending_approval', needsApproval: true, reviewers: ['SIA JOSIAH', 'KHO WEI JIE'] })
    expect([waiting.needsApproval, waiting.reviewers, waiting.approvedByName]).toEqual([true, ['SIA JOSIAH', 'KHO WEI JIE'], null])
    const approved = req({ needsApproval: true, approvedByName: 'SIA JOSIAH', approvedAt: '2026-10-29T03:00:00Z', reviewers: null })
    expect([approved.approvedByName, approved.approvedAt, approved.reviewers]).toEqual(['SIA JOSIAH', '2026-10-29T03:00:00Z', null])
    expect(req().needsApproval).toBe(false)
  })

  it('says by whom, under the chip', () => {
    expect(orWords(['A'])).toBe('A')
    expect(orWords(['A', 'B', 'C'])).toBe('A, B or C')
    expect(whereItIsNote(req({ status: 'pending_approval', reviewers: ['SIA JOSIAH'] }))).toBe('SIA JOSIAH approves it')
    expect(whereItIsNote(req({ status: 'pending_approval', reviewers: [] }))).toBe('Waiting for its approver')
    expect(whereItIsNote(req({ approvedByName: 'SIA JOSIAH' }))).toBe('Approved by SIA JOSIAH')
    expect(whereItIsNote(req({ status: 'rejected', rejectedStage: 'approval', rejectedByName: 'SIA JOSIAH' }))).toBe('Sent back by SIA JOSIAH')
    expect(whereItIsNote(req({ status: 'rejected', rejectedStage: 'finance', rejectedByName: 'Finance Manager' }))).toBe('Rejected by Finance')
    expect(whereItIsNote(req())).toBeNull()
  })

  it('the New request window says who approves it first, or that it goes straight to Finance', () => {
    expect(parseContext({ ...CTX, reviewers: ['SIA JOSIAH'] })?.reviewers).toEqual(['SIA JOSIAH'])
    expect(parseContext({ ...CTX, reviewers: [] })?.reviewers).toBeNull()
    expect(routeWords(CTX)).toBe('After you submit: it goes straight to Finance.')
    expect(routeWords({ reviewers: ['SIA JOSIAH'] })).toBe('After you submit: SIA JOSIAH approves it first, then it goes to Finance.')
    expect(routeWords({ reviewers: ['KHO WEI JIE', 'SIA JOSIAH'] })).toBe(
      'After you submit: KHO WEI JIE or SIA JOSIAH approves it first — one approval is enough — then it goes to Finance.',
    )
  })

  it('Claim & approve: To approve (the team’s, never one’s own) · All {department} · Mine', () => {
    const read = parseApproval({
      departmentName: 'Marketing', canApprove: true,
      approvers: [{ id: 'u1', name: 'SIA JOSIAH' }, { id: 'u2', name: 'KHO WEI JIE' }],
      requests: [
        raw({ id: 'a', status: 'pending_approval', mine: false, requesterName: 'CHIN YEE RU', total: 24.4 }),
        raw({ id: 'b', status: 'pending_approval', mine: true, total: 80 }),
        raw({ id: 'c', status: 'with_finance', mine: false, requesterName: 'WONG JOEY', total: 50 }),
      ],
    })!
    expect(parseApproval({ requests: [] })).toBeNull()
    expect(waitsForMe(read.requests[0])).toBe(true)
    expect(waitsForMe(read.requests[1])).toBe(false)
    const mine = [req({ id: 'd', status: 'draft' })]
    expect(approveCards(read, mine).map((c) => [c.label, c.sub])).toEqual([
      ['To approve', '1 request'], ['All Marketing', '3 requests'], ['Mine', '1 request'],
    ])
    expect(rowsOfApproveCard(read, mine, 'to_approve').map((r) => r.id)).toEqual(['a'])
    expect(rowsOfApproveCard(read, mine, 'mine').map((r) => r.id)).toEqual(['d'])
    expect(approveHero(read)).toEqual({ label: 'Waiting for you · 1 request', value: 'RM 24.40' })
    expect(approveLede(read, 'SIA JOSIAH')).toBe(
      'Marketing’s requests. Your team’s wait here for you or KHO WEI JIE — one approval is enough. Yours go straight to Finance.',
    )
    expect(approveLede({ ...read, approvers: [{ id: 'u1', name: 'SIA JOSIAH' }] }, 'SIA JOSIAH')).toBe(
      'Marketing’s requests. Your team’s wait here for you. Yours go straight to Finance.',
    )
  })
})
