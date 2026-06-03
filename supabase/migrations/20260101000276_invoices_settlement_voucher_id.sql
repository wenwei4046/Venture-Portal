-- Reverse pointer: which payment_voucher settled this invoice.
-- 1:N (one voucher settles many invoices) for consolidated Official Receipts.
-- Single-settle also sets it; legacy payment_vouchers.invoice_id stays for
-- back-compat and is left NULL on consolidated vouchers.
alter table invoices
  add column if not exists settlement_voucher_id uuid
  references payment_vouchers(id) on delete set null;

create index if not exists idx_invoices_settlement_voucher
  on invoices(settlement_voucher_id);
