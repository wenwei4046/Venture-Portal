import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ReassignInvoiceGlButton from './ReassignInvoiceGlButton'

const reassign = vi.fn(async () => ({ changed: 5 }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../actions', () => ({ reassignInvoiceGlAccount: (fd: FormData) => reassign(fd) }))

const categories = [
  { code: '3051', label: 'Amount due from - Carres' },
  { code: '3053', label: 'Amount due from - The Cont' },
  { code: '3056', label: 'Amount due from - Houzs Century' },
  { code: '5011', label: 'Service Revenue - Subs' },
]

function open(posted: Array<{ code: string; amount: number }>) {
  render(
    <ReassignInvoiceGlButton
      invoiceId="inv-1"
      invoiceNo="HV-INV-202609-0040"
      currentCategory="3051"
      categories={categories}
      postedAccounts={posted}
    />,
  )
  fireEvent.click(screen.getByText('改 account'))
}

describe('ReassignInvoiceGlButton', () => {
  beforeEach(() => reassign.mockClear())

  // 2026-09-28: one invoice split its 1,500 across five subsidiaries' accounts.
  it('ticks every posted account by default and sends them in one submit', async () => {
    open([
      { code: '3051', amount: 300 },
      { code: '3053', amount: 300 },
      { code: '3056', amount: 300 },
    ])
    expect(screen.getByText(/这张发票分了 3 个科目/)).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.every((b) => b.checked)).toBe(true)

    // Untick one, pick the destination, give a reason, submit.
    fireEvent.click(boxes[1])
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5011' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 开单时选错科目'), { target: { value: '开单时选错科目' } })
    fireEvent.click(screen.getByText('确认改'))

    expect(reassign).toHaveBeenCalledTimes(1)
    const fd = reassign.mock.calls[0][0] as unknown as FormData
    expect(fd.get('old_account')).toBe('3051,3056')
    expect(fd.get('new_account')).toBe('5011')
  })

  it('a single-account invoice keeps the old dropdown', () => {
    open([{ code: '3051', amount: 300 }])
    expect(screen.queryByText(/这张发票分了/)).toBeNull()
    expect(screen.getByText(/现在的 account/)).toBeInTheDocument()
  })
})
