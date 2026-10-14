// Why a voucher does not open, in words (2026-10-14, the hub's drawer; on its
// own since 2026-10-15 so a server page — the Finance phone app's — can say it
// too: a 'use client' module's values cannot be read on the server).

export const REFUSED: Record<'closed' | 'not_found' | 'payroll', string> = {
  closed: 'This voucher does not open for you here.',
  not_found: 'This voucher is not there any more.',
  payroll: 'A salary voucher opens only with Payroll payouts.',
}
