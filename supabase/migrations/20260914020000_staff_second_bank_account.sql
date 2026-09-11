-- Optional second receiving account. Existing payroll/import columns remain
-- Account 1, and no existing employee bank details are changed.
ALTER TABLE public.hr_staff_costs
  ADD COLUMN bank_name_2 text,
  ADD COLUMN bank_account_no_2 text,
  ADD CONSTRAINT hr_staff_second_bank_account_complete CHECK (
    (bank_name_2 IS NULL AND bank_account_no_2 IS NULL)
    OR (bank_name_2 IS NOT NULL AND btrim(regexp_replace(bank_name_2, '\s+', ' ', 'g')) <> ''
      AND bank_account_no_2 IS NOT NULL AND bank_account_no_2 ~ '^[0-9]+$')
  ),
  ADD CONSTRAINT hr_staff_second_bank_account_distinct CHECK (
    bank_name_2 IS NULL
    OR bank_name IS NULL OR bank_account_no IS NULL
    OR lower(btrim(regexp_replace(bank_name_2, '\s+', ' ', 'g')))
      <> lower(btrim(regexp_replace(bank_name, '\s+', ' ', 'g')))
    OR bank_account_no_2 <> regexp_replace(bank_account_no, '[\s-]', '', 'g')
  );

COMMENT ON COLUMN public.hr_staff_costs.bank_name_2 IS
  'Optional Account 2 receiving bank; must be provided with bank_account_no_2.';
COMMENT ON COLUMN public.hr_staff_costs.bank_account_no_2 IS
  'Optional Account 2 receiving account number, digits only; Account 1 remains bank_account_no.';
