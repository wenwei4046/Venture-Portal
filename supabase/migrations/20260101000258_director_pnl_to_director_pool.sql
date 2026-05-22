-- Split the opening DIRECTOR vs OFFICE P&L (both were merged into `corporate`).
--   * DIRECTOR net (+89,939.24) is reclassified OUT of the corporate/Venture-Pool
--     income statement into a new liability `4080 Director Pool Payable`, and
--     mirrored into the operational Director Pool ledger (dept_pools / Director).
--   * OFFICE stays in `corporate` (Venture Pool).
-- One self-balancing manual_jv reclass entry keeps the Trial Balance balanced
-- (it only nets director's own revenue/expense out, then parks the net as a
-- liability). 9010 Interest Expense is treasury-managed in cfo-reports, so the
-- income-statement net-profit drop nets to exactly 89,939.24, offsetting the
-- new liability → report Balance Sheet still ties.
-- Director raw P&L (from ledger `venture - GL.xlsx`, DIRECTOR dept):
--   Income 333,865.26 (5020) − Expense 243,926.02 = Net +89,939.24.

-- 1) New liability account for the Director Pool.
INSERT INTO chart_of_accounts(code, name, type, parent_code, is_active, sort_order, cash_flow_category, is_internal_fund)
VALUES ('4080', 'Director Pool Payable', 'liability', NULL, TRUE, 4080, 'operating', FALSE)
ON CONFLICT (code) DO NOTHING;

-- 2) Reclassification entry: reverse DIRECTOR's P&L from corporate, park net in 4080.
WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (
  INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, segment, total_amount, created_by)
  SELECT format('JE-%s-%s', to_char(DATE '2026-05-20', 'YYYYMM'), lpad(seq::text, 4, '0')),
         DATE '2026-05-20', DATE '2026-05-01',
         'Reclass: DIRECTOR opening P&L -> Director Pool Payable (split from Office/corporate)',
         'manual_jv', 'corporate'::gl_segment, 333865.26,
         'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
  RETURNING id
)
INSERT INTO journal_lines(entry_id, account_code, debit, credit, description)
SELECT e.id, x.code, x.dr, x.cr, x.memo FROM e, (VALUES
  ('5020', 333865.26::numeric, NULL::numeric, 'Reverse Director Salary Income'),
  ('9030', NULL::numeric, 198405.04::numeric, 'Reverse Director Salary Expense'),
  ('9081', NULL::numeric, 21168.00::numeric,  'Reverse Director EPF'),
  ('9082', NULL::numeric, 1249.80::numeric,   'Reverse Director SOCSO'),
  ('9083', NULL::numeric, 142.80::numeric,    'Reverse Director EIS'),
  ('9093', NULL::numeric, 22360.38::numeric,  'Reverse Director Commission'),
  ('9010', NULL::numeric, 600.00::numeric,    'Reverse Director Interest Expense'),
  ('4080', NULL::numeric, 89939.24::numeric,  'Director Pool Payable (net)')
) AS x(code, dr, cr, memo);

-- 3) Mirror the net into the operational Director Pool ledger.
INSERT INTO dept_pools(department_id, transaction_type, amount, period_month, description, created_by)
SELECT id, 'np_in'::dept_pool_txn_type, 89939.24, DATE '2026-05-01',
       'Opening Director Pool balance (ledger DIRECTOR dept net P&L)',
       'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name = 'Director';
