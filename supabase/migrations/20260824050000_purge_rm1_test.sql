-- Purge the RM 1.00 Revenue Department acceptance test (2026-08-24, user:
-- "把rm 1 测试数据清楚"). The walk-through validated the dynamic-department
-- chain end to end; nothing references these rows any more. Removes, in
-- dependency order: journal lines+entries (issue JE-202608-0537, settle
-- JE-202608-0538), the dept_pools np_in, the receipt's source row + the
-- receipt (HV-OR-202608-0301), the invoice (HV-INV-202608-0030), and backs
-- the RM 1.00 bank-cache bump out of Hong Leong. Leaves the Revenue
-- Department itself, its pool account 1090 and enum values in place — those
-- are permanent by design.

DO $$
DECLARE
    v_inv uuid;
    v_pv  uuid;
BEGIN
    SELECT id INTO v_inv FROM invoices WHERE invoice_no = 'HV-INV-202608-0030';
    SELECT id INTO v_pv  FROM payment_vouchers WHERE voucher_no = 'HV-OR-202608-0301';
    IF v_inv IS NULL AND v_pv IS NULL THEN
        RAISE NOTICE 'nothing to purge';
        RETURN;
    END IF;

    DELETE FROM journal_lines WHERE entry_id IN (
        SELECT id FROM journal_entries WHERE reference_id IN (v_inv, v_pv)
    );
    DELETE FROM journal_entries WHERE reference_id IN (v_inv, v_pv);

    DELETE FROM dept_pools WHERE department_id = (SELECT id FROM departments WHERE name = 'Revenue Department')
      AND description LIKE 'PV HV-OR-202608-0301%';

    -- Voucher FIRST: pvs_enforce_sum_matches_voucher blocks source deletes
    -- while the voucher still stands.
    DELETE FROM payment_vouchers WHERE id = v_pv;
    DELETE FROM payment_voucher_sources WHERE voucher_id = v_pv;
    DELETE FROM invoices WHERE id = v_inv;

    -- Back out the receipt's bank bump (the failed first run had bumped it).
    UPDATE bank_accounts SET current_balance = current_balance - 1.00, updated_at = now()
    WHERE bank_name = 'Hong Leong Bank';
END $$;
