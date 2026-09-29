import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GenerateOwnShareInvoiceButton from './GenerateOwnShareInvoiceButton'

// Every department with a residual comes back; only the ones the registry bills
// back are ticked. HR is off (pool-borne since 2026-09-03), so it arrives
// unticked but visible — that is the point of the 2026-09-29 change.
const preview = {
  groups: [
    {
      deptLabel: 'HR',
      segment: 'hr',
      components: { salary: 11553.28, allowance: 2747.22, epf: 1637, socso: 203.85, eis: 23.3 },
    },
    {
      deptLabel: 'Director Office',
      segment: 'director_office',
      components: { salary: 699.05, allowance: 88.97, epf: 91.51, socso: 13.24, eis: 1.51 },
    },
    {
      deptLabel: 'Finance',
      segment: 'finance',
      components: { salary: 700, allowance: 40, epf: 84, socso: 10.41, eis: 1.19 },
    },
  ],
  total: 1729.88,
  billBack: ['director_office', 'finance'],
}

const generate = vi.fn(async (_period: string, _category: string | null, _segments?: string[] | null) => ({
  generated: 1,
  total: 0,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../actions', () => ({
  fetchOwnShareInvoicePreview: async () => preview,
  generateOwnShareInvoice: (p: string, c: string | null, s?: string[] | null) => generate(p, c, s),
}))

async function open() {
  render(<GenerateOwnShareInvoiceButton currentPeriod="2026-08-01" />)
  fireEvent.click(screen.getByText('Own-share → Venture (Office)'))
  await waitFor(() => expect(screen.getByText('HR')).toBeInTheDocument())
}

describe('own-share generate dialog', () => {
  beforeEach(() => generate.mockClear())

  it('lists every department but ticks only the ones the registry bills back', async () => {
    await open()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(3)
    // Order is biggest-first, so HR (16,164.65) leads and is unticked.
    expect(boxes.map((b) => b.checked)).toEqual([false, true, true])
    // The total is the ticked ones only: 894.28 + 835.60.
    expect(screen.getByText('RM 1,729.88')).toBeInTheDocument()
  })

  it('ticking HR for this run moves the total and sends its segment', async () => {
    await open()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    fireEvent.click(boxes[0])
    expect(screen.getByText('RM 17,894.53')).toBeInTheDocument() // + 16,164.65

    fireEvent.click(screen.getByText('Generate draft'))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    const segments = generate.mock.calls[0]![2] as unknown as string[]
    expect([...segments].sort()).toEqual(['director_office', 'finance', 'hr'])
  })

  it('cannot generate with nothing ticked', async () => {
    await open()
    for (const b of screen.getAllByRole('checkbox') as HTMLInputElement[]) {
      if (b.checked) fireEvent.click(b)
    }
    expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled()
    fireEvent.click(screen.getByText('Generate draft'))
    expect(generate).not.toHaveBeenCalled()
  })
})
