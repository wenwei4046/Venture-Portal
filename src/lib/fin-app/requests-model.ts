import { f2 } from './page-model'

// A bank as a request's voucher window offers it (2026-10-16, part E4 — the Finance phone app's request queues; since
// PR ⑥ of docs/module-spec-payment-requests.md, 2026-10-29, those queues are Payment request's and only this stays).
export const bankOption = (b: { bank_name: string; current_balance: number }) => `${b.bank_name} (RM ${f2(b.current_balance)})`
