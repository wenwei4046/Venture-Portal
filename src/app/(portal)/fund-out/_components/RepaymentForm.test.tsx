import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { inTimeZone } from '@/test/time-zone'

// 2026-10-08: the form's payment date starts on "today" and may not pass it.
// Drawn first on the server (UTC), that was yesterday until 08:00 in the
// office — the field opened on the wrong day, refused today, and disagreed
// with the browser that drew it again.

vi.mock('../actions', () => ({ recordRepayment: vi.fn() }))

import RepaymentForm from './RepaymentForm'

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

describe('the repayment form, after midnight', () => {
  it("opens on the office's today and allows it, drawn the same by the server and the browser", () => {
    const html = (zone: string) => inTimeZone(zone, () => renderToString(<RepaymentForm loanId="loan-1" outstanding={40000} />))
    const server = html('UTC')
    expect(html('Asia/Kuala_Lumpur')).toBe(server)
    const page = document.createElement('div')
    page.innerHTML = server
    const date = page.querySelector('input[name="payment_date"]') as HTMLInputElement
    expect(date.getAttribute('value')).toBe('2026-11-01')
    expect(date.getAttribute('max')).toBe('2026-11-01')
  })
})
