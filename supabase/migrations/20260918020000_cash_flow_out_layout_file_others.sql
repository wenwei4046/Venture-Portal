-- Cash Flow money-out layout: file what was left in 其他 (user 2026-09-18:
-- "费用类没问题 / Computer-equipment 算 Capex / 其他的你跟着排").
--   General Expense  + 9088 Advertisement (group, incl. 9095 Hiring), 9089 Bank
--                      Charges, 9092 Postages, 9096 Penalty, 9097 Secretary &
--                      Filing, 9000 General & Admin, 4050 Accounts Payable -
--                      General (the imported supplier-bill payments)
--   Salary & Statutory + 4075 Accrual - Others (was the lone 4201 child left out)
--   Interest Expense   NEW: 6000 Interest Expense - Fund Sources + 4060 Interest
--                      in Suspense - Payable (group)
--   Capex              NEW: 2000 Equipment / Computer
--   1900 Opening Balance Clearing stays in 其他 (one-off).
-- Section ids of the existing categories are kept so nothing re-keys.

update report_layouts
set layout = jsonb_build_object('categories', jsonb_build_array(
      jsonb_build_object('id', 'grp-3020', 'name', 'Loans Receivable',       'accounts', jsonb_build_array('3020')),
      jsonb_build_object('id', 'grp-4000', 'name', 'Fund Sources Payable',   'accounts', jsonb_build_array('4000')),
      jsonb_build_object('id', 'grp-5027', 'name', 'Interest Income - Loans','accounts', jsonb_build_array('5027')),
      jsonb_build_object('id', 'grp-6000', 'name', 'Interest Expense',       'accounts', jsonb_build_array('6000', '4060')),
      jsonb_build_object('id', 'grp-4201', 'name', 'Salary & Statutory',     'accounts', jsonb_build_array('4070', '4074', '4072', '4071', '4073', '4075')),
      jsonb_build_object('id', 'a0711b0e-24a2-427d-ba54-3ecaf4a4d666', 'name', 'General Expense',
                         'accounts', jsonb_build_array('9094', '9091', '9090', '9087', '9086', '9085', '9020',
                                                       '9088', '9089', '9092', '9096', '9097', '9000', '4050')),
      jsonb_build_object('id', 'grp-2000', 'name', 'Capex',                  'accounts', jsonb_build_array('2000'))
    )),
    updated_at = now()
where report_key = 'cash_flow_out';
