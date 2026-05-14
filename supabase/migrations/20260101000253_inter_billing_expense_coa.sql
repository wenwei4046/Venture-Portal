-- 20260101000253_inter_billing_expense_coa.sql
--
-- Inter-billing expense accounts. When one internal department (e.g.
-- Marketing) bills another (e.g. HR), Marketing recognises revenue at
-- invoice issue time. The settlement JE used to debit the paying dept's
-- pool equity (1010-1080) directly — which kept the Balance Sheet
-- mechanically balanced but bypassed the P&L entirely. HR's P&L showed
-- nothing; the group net profit was over-stated by the invoiced amount.
--
-- Fix: introduce a proper P&L expense account per dept. Settlement JE
-- now posts `Dr <dept inter-billing expense> / Cr 3030 AR`. The expense
-- closes to equity at period close, so the BS end-state is identical,
-- but each dept's P&L correctly shows its side of the transaction and
-- group net profit nets to zero.
--
-- Layout:
--   9050 Inter-billing Expense        — header (parent, never posted to)
--     9051 Inter-billing — Marketing  — leaf
--     9052 Inter-billing — Finance    — leaf
--     9053 Inter-billing — HR         — leaf
--     9054 Inter-billing — Director Office — leaf
--     9055 Inter-billing — Director   — leaf
--
-- Naming convention "Inter-billing — <dept name>" mirrors the existing
-- "Dept Pool — <dept name>" convention from mig 238, so the code that
-- resolves dept-name → expense leaf in createPaymentVoucher is a direct
-- analogue of the existing equity-leaf resolver.

BEGIN;

INSERT INTO chart_of_accounts (code, name, type, cash_flow_category, is_active, sort_order, parent_code) VALUES
  ('9050', 'Inter-billing Expense',           'expense', 'operating', true, 60, NULL),
  ('9051', 'Inter-billing — Marketing',        'expense', 'operating', true, 61, '9050'),
  ('9052', 'Inter-billing — Finance',          'expense', 'operating', true, 62, '9050'),
  ('9053', 'Inter-billing — HR',               'expense', 'operating', true, 63, '9050'),
  ('9054', 'Inter-billing — Director Office',  'expense', 'operating', true, 64, '9050'),
  ('9055', 'Inter-billing — Director',         'expense', 'operating', true, 65, '9050');

COMMIT;
