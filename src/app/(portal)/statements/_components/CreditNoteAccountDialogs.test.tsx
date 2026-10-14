import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// The invoice's credit note and Change account (2026-10-14, the Finance
// revamp v2 — D10's drawer): the system's own, in the kit's sheet. A credit
// note nets what an issued invoice still owes — a line a billing mode, a
// category and an amount, each its own draft. Change account moves the posted
// lines to another account; an invoice that posted to several moves the ones
// ticked in one go (2026-09-28: "我一次只能改一个?").

const mocks = vi.hoisted(() => ({ cn: vi.fn(), account: vi.fn() }))
vi.mock('../invoice-actions', () => ({ hubCreateCreditNote: mocks.cn, hubChangeAccount: mocks.account, hubHrFigures: vi.fn() }))

import CreditNoteDialog from './CreditNoteDialog'
import ChangeAccountDialog from './ChangeAccountDialog'

const categories = [
  { code: '3051', label: 'Amount due from - Carres', type: 'asset' as const, parent_code: null },
  { code: '3053', label: 'Amount due from - The Cont', type: 'asset' as const, parent_code: null },
  { code: '3056', label: 'Amount due from - Houzs Century', type: 'asset' as const, parent_code: null },
  { code: '5011', label: 'Service Revenue - Subs', type: 'revenue' as const, parent_code: null },
  { code: '5020', label: 'Salary Income', type: 'revenue' as const, parent_code: null },
]
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})
const dialog = () => screen.getByRole('dialog')
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const hint = () => within(dialog()).getAllByText((_, el) => el?.tagName === 'P').map((p) => p.textContent)
const press = (name: string) => fireEvent.click(within(dialog()).getByRole('button', { name }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cn.mockResolvedValue({ ok: true, value: 'HV-CN-202610-0003' })
  mocks.account.mockResolvedValue({ ok: true, value: { changed: 2, from: '3051, 3056' } })
})

describe('+ Credit note', () => {
  function draw() {
    const onDone = vi.fn()
    const onClose = vi.fn()
    render(
      <CreditNoteDialog
        open
        onClose={onClose}
        onDone={onDone}
        invoice={{ id: 'hc1', no: 'HV-INV-202610-0013', party: 'HOUZS Century (HC)', total: 2204, received: 500, credited: 100, mode: 'hr_attribution', category: '5020' }}
        categories={categories}
        extraModes={[]}
      />,
    )
    return { onDone, onClose }
  }

  it('the invoice’s figures and what it still owes; the first line on its billing mode and category', () => {
    draw()
    expect(dialog()).toHaveTextContent('Credit note')
    expect(dialog()).toHaveTextContent('HV-INV-202610-0013 · HOUZS Century (HC)')
    expect(within(dialog()).getByRole('group', { name: 'The invoice' })).toHaveTextContent('Invoice total2,204.00Received−500.00Credit notes−100.00Still owedRM 1,604.00')
    expect(screen.getByLabelText('Line 1 billing mode')).toHaveValue('hr_attribution')
    expect(screen.getByLabelText('Line 1 category')).toHaveValue('5020')
    expect(hint()).toContain('Each line is its own credit note — a draft until it is approved.')
  })

  it('needs a reason; may not come to more than is owed; two lines the same are one', () => {
    draw()
    set('Line 1 amount', '2000')
    press('Save draft')
    expect(hint()).toContain('A reason is needed before you can save.')
    set('Reason', 'Overbilled 1 staff')
    press('Save draft')
    expect(hint()).toContain('The lines come to RM 2,000.00 — the invoice still owes RM 1,604.00.')
    set('Line 1 amount', '200')
    press('+ Add line')
    set('Line 2 billing mode', 'hr_attribution')
    set('Line 2 category', '5020')
    set('Line 2 amount', '20')
    press('Save draft')
    expect(hint()).toContain('Two lines have the same billing mode and category — make them one.')
    expect(mocks.cn).not.toHaveBeenCalled()
  })

  it('each line its own credit note, the reason on each; their numbers said', async () => {
    mocks.cn.mockResolvedValueOnce({ ok: true, value: 'HV-CN-202610-0003' }).mockResolvedValueOnce({ ok: true, value: 'HV-CN-202610-0004' })
    const { onDone, onClose } = draw()
    set('Reason', 'Overbilled 1 staff')
    set('Line 1 amount', '200')
    press('+ Add line')
    set('Line 2 billing mode', 'finance_attribution')
    set('Line 2 category', '5020')
    set('Line 2 amount', '20.4')
    press('Save draft')
    await flush()
    expect(mocks.cn.mock.calls.map((c) => c[0])).toEqual([
      { invoiceId: 'hc1', mode: 'hr_attribution', category: '5020', amount: 200, reason: 'Overbilled 1 staff' },
      { invoiceId: 'hc1', mode: 'finance_attribution', category: '5020', amount: 20.4, reason: 'Overbilled 1 staff' },
    ])
    expect(onDone).toHaveBeenCalledWith('2 credit notes saved as drafts')
    expect(onClose).toHaveBeenCalled()
  })

  it('a refusal is said in words', async () => {
    mocks.cn.mockResolvedValue({ ok: false, reason: 'Credit notes only apply to issued invoices — this one is paid' })
    draw()
    set('Reason', 'x')
    set('Line 1 amount', '10')
    press('Save draft')
    await flush()
    expect(hint()).toContain('Credit notes only apply to issued invoices — this one is paid')
  })
})

describe('Change account', () => {
  function draw(posted: Array<{ code: string; amount: number }>) {
    const onDone = vi.fn()
    render(
      <ChangeAccountDialog
        open
        onClose={vi.fn()}
        onDone={onDone}
        invoice={{ id: 'inv-40', no: 'HV-INV-202609-0040', category: '3051', posted }}
        categories={categories}
      />,
    )
    return { onDone }
  }

  // 2026-09-28: one invoice split its 1,500 across five subsidiaries' accounts.
  it('an invoice on several accounts: every one ticked, the ones left ticked moved in one go', async () => {
    const { onDone } = draw([
      { code: '3051', amount: 300 },
      { code: '3053', amount: 300 },
      { code: '3056', amount: 300 },
    ])
    expect(dialog()).toHaveTextContent('Change account')
    const boxes = within(screen.getByRole('group', { name: 'Move from' })).getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.every((b) => b.checked)).toBe(true)
    expect(screen.getByRole('group', { name: 'Move from' })).toHaveTextContent('RM 900.00')
    fireEvent.click(boxes[1])
    expect(screen.getByRole('group', { name: 'Move from' })).toHaveTextContent('RM 600.00')
    set('Move to', '5011')
    set('Reason', 'the wrong account was picked')
    press('Change account')
    await flush()
    expect(mocks.account).toHaveBeenCalledWith({ invoiceId: 'inv-40', from: ['3051', '3056'], to: '5011', reason: 'the wrong account was picked' })
    expect(onDone).toHaveBeenCalledWith('2 GL lines moved from 3051, 3056 to 5011')
  })

  it('an invoice on one account names it — or leaves the entry to say which; not the same account again', () => {
    draw([{ code: '3051', amount: 300 }])
    expect(screen.queryByRole('group', { name: 'Move from' })).toBeNull()
    expect(screen.getByLabelText('Now')).toHaveValue('3051')
    set('Move to', '3051')
    set('Reason', 'x')
    press('Change account')
    expect(hint()).toContain('It already posts to that account.')
    set('Now', '')
    press('Change account')
    expect(mocks.account).toHaveBeenCalledWith({ invoiceId: 'inv-40', from: [], to: '3051', reason: 'x' })
  })

  it('needs where it goes and why', () => {
    draw([{ code: '3051', amount: 300 }])
    press('Change account')
    expect(hint()).toContain('The account it moves to and a reason are needed before you can save.')
  })
})
