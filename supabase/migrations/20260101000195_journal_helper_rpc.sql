-- Mig 195: Unified journal helper RPC with strict 0.00 balance tolerance
--
-- Why this exists
-- ---------------
-- Audit (2026-04-22) found 9 double-entry drift bugs where balance-bearing
-- tables (dept_pools, venture_pool, bank_accounts) mutate without a matching
-- journal_entries row. Root cause: SQL RPCs like approve_dept_payment_expense
-- and save_director_salary_results have no ergonomic way to post journals,
-- so they skip it. The TS helper postJournalEntry() in src/lib/journal.ts
-- can't be called from PL/pgSQL.
--
-- This migration adds post_journal_entry(...) as the single SQL entry point
-- for balanced double-entry journals. SECURITY DEFINER so HR / dept_manager
-- triggered actions can post through it despite je_insert RLS being
-- finance/principal only. Strict 0.00 tolerance per user spec (Q4: one cent
-- cannot drift).
--
-- Does NOT touch validate_journal_balance() stub trigger from mig 48 —
-- this RPC is the enforcement point; the stub stays as belt-and-braces.

CREATE OR REPLACE FUNCTION post_journal_entry(
    p_transaction_date DATE,
    p_description      TEXT,
    p_reference_type   TEXT,
    p_reference_id     UUID,
    p_created_by       UUID,
    p_lines            JSONB  -- [{account_code, debit, credit, description?}]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_month   DATE;
    v_period_key     TEXT;
    v_total_debit    DECIMAL(15, 2) := 0;
    v_total_credit   DECIMAL(15, 2) := 0;
    v_line           JSONB;
    v_line_debit     DECIMAL(15, 2);
    v_line_credit    DECIMAL(15, 2);
    v_line_count     INT;
    v_seq            INT;
    v_entry_no       TEXT;
    v_entry_id       UUID;
BEGIN
    -- ── Basic shape checks ──────────────────────────────────────────
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'post_journal_entry: p_lines must be a JSONB array';
    END IF;

    v_line_count := jsonb_array_length(p_lines);
    IF v_line_count < 2 THEN
        RAISE EXCEPTION
            'post_journal_entry: entry must have at least 2 lines (got %)',
            v_line_count;
    END IF;

    IF p_transaction_date IS NULL THEN
        RAISE EXCEPTION 'post_journal_entry: p_transaction_date is required';
    END IF;

    IF p_created_by IS NULL THEN
        RAISE EXCEPTION 'post_journal_entry: p_created_by is required';
    END IF;

    IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
        RAISE EXCEPTION 'post_journal_entry: p_description is required';
    END IF;

    v_period_month := date_trunc('month', p_transaction_date)::DATE;
    v_period_key   := to_char(v_period_month, 'YYYYMM');

    -- ── Per-line validation + tally ─────────────────────────────────
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF NOT (v_line ? 'account_code')
           OR length(trim(v_line->>'account_code')) = 0 THEN
            RAISE EXCEPTION
                'post_journal_entry: each line must have a non-empty account_code';
        END IF;

        v_line_debit  := COALESCE((v_line->>'debit')::DECIMAL(15,2),  0);
        v_line_credit := COALESCE((v_line->>'credit')::DECIMAL(15,2), 0);

        IF v_line_debit < 0 OR v_line_credit < 0 THEN
            RAISE EXCEPTION
                'post_journal_entry: negative amounts not allowed on line for % (debit=%, credit=%)',
                v_line->>'account_code', v_line_debit, v_line_credit;
        END IF;

        IF (v_line_debit > 0 AND v_line_credit > 0)
           OR (v_line_debit = 0 AND v_line_credit = 0) THEN
            RAISE EXCEPTION
                'post_journal_entry: line for % must have exactly one of debit or credit (got debit=%, credit=%)',
                v_line->>'account_code', v_line_debit, v_line_credit;
        END IF;

        v_total_debit  := v_total_debit  + v_line_debit;
        v_total_credit := v_total_credit + v_line_credit;
    END LOOP;

    -- ── Strict 0.00 balance check ───────────────────────────────────
    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION
            'post_journal_entry: unbalanced entry — total debit % <> total credit %',
            v_total_debit, v_total_credit;
    END IF;

    -- ── Serialise entry_no generation per period to avoid race ──────
    PERFORM pg_advisory_xact_lock(hashtext('je-' || v_period_key));

    SELECT COALESCE(
             MAX(NULLIF(substring(entry_no FROM 'JE-[0-9]{6}-([0-9]+)$'), '')::INT),
             0
           ) + 1
      INTO v_seq
      FROM journal_entries
     WHERE period_month = v_period_month;

    v_entry_no := 'JE-' || v_period_key || '-' || lpad(v_seq::TEXT, 4, '0');

    -- ── Insert header ───────────────────────────────────────────────
    INSERT INTO journal_entries (
        entry_no, transaction_date, period_month, description,
        reference_type, reference_id, total_amount, created_by
    ) VALUES (
        v_entry_no,
        p_transaction_date,
        v_period_month,
        p_description,
        NULLIF(p_reference_type, ''),
        p_reference_id,
        v_total_debit,
        p_created_by
    )
    RETURNING id INTO v_entry_id;

    -- ── Insert lines ────────────────────────────────────────────────
    INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
    SELECT
        v_entry_id,
        trim(ln->>'account_code'),
        NULLIF((ln->>'debit')::DECIMAL(15,2),  0),
        NULLIF((ln->>'credit')::DECIMAL(15,2), 0),
        NULLIF(ln->>'description', '')
    FROM jsonb_array_elements(p_lines) ln;

    RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION post_journal_entry IS
    'Unified entry point for balanced double-entry journals. SECURITY DEFINER so non-finance RPCs (dept expense approval, payroll fan-out, etc.) can post despite je_insert RLS. Strict 0.00 balance tolerance. Advisory lock per period serialises entry_no generation.';

GRANT EXECUTE ON FUNCTION post_journal_entry(DATE, TEXT, TEXT, UUID, UUID, JSONB)
    TO authenticated;
