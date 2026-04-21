-- Mig 197: COA additions (3070 Director Office pool, 3080 Director pool)
--           + dept_pool_gl_code() helper
--           + post_journal_entry refreshed to use journal_entry_no_seq
--
-- Why
-- ---
-- (1) Chart of Accounts seed (mig 48) only has equity codes for HR/Finance/
--     Marketing dept pools (3030/3040/3050). The dept_pools table actually
--     carries 5 departments — Director Office and Director pool have no GL
--     equity code. Stage 2 fixes (P1-4, P1-5) need them.
--
-- (2) A single dept_pool_gl_code(dept_name) helper keeps every drift-fix
--     migration honest about which equity account a pool maps to — no more
--     inline CASE duplicated across 5 RPCs.
--
-- (3) post_journal_entry (mig 195) currently generates entry_no via advisory
--     lock + COUNT per period. The existing inline JE writers
--     (approve_single_voucher, approve_voucher_batch*, etc.) use
--     nextval('journal_entry_no_seq') — a shared global sequence created in
--     mig 48 line 115. Aligning post_journal_entry onto the same sequence
--     keeps numbering monotonic across BOTH paths so the ledger stays
--     coherent when some rows come from the helper and others from inline
--     writes. Per user Q3 = yes align.

BEGIN;

-- ── 1. COA additions ─────────────────────────────────────────────────────
INSERT INTO chart_of_accounts (code, name, type, parent_code, sort_order) VALUES
    ('3070', 'Dept Pool — Director Office', 'equity', '3000', 33),
    ('3080', 'Dept Pool — Director',        'equity', '3000', 34)
ON CONFLICT (code) DO NOTHING;

-- ── 2. dept_pool_gl_code helper ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION dept_pool_gl_code(p_dept_name TEXT)
RETURNS VARCHAR(20)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_dept_name
        WHEN 'Marketing'       THEN '3030'
        WHEN 'Finance'         THEN '3040'
        WHEN 'HR'              THEN '3050'
        WHEN 'Director Office' THEN '3070'
        WHEN 'Director'        THEN '3080'
        ELSE NULL
    END::VARCHAR(20);
$$;

COMMENT ON FUNCTION dept_pool_gl_code(TEXT) IS
    'Map department name to the corresponding dept-pool equity GL account code (3030-3080). Returns NULL for unknown names so callers can raise explicitly.';

-- ── 3. Refresh post_journal_entry onto journal_entry_no_seq ──────────────
CREATE OR REPLACE FUNCTION post_journal_entry(
    p_transaction_date DATE,
    p_description      TEXT,
    p_reference_type   TEXT,
    p_reference_id     UUID,
    p_created_by       UUID,
    p_lines            JSONB
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
    v_seq            BIGINT;
    v_entry_no       TEXT;
    v_entry_id       UUID;
BEGIN
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

    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION
            'post_journal_entry: unbalanced entry -- total debit % <> total credit %',
            v_total_debit, v_total_credit;
    END IF;

    -- Use the shared global sequence so our entry numbers interleave with
    -- inline writers (approve_single_voucher, approve_voucher_batch*, etc.)
    v_seq := nextval('journal_entry_no_seq');
    v_entry_no := format('JE-%s-%s', v_period_key, LPAD(v_seq::TEXT, 4, '0'));

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
    'Mig 197: aligned onto journal_entry_no_seq (mig 48) so entry_no numbering stays coherent with the existing inline writers in approve_single_voucher / approve_voucher_batch*. Advisory-lock approach from mig 195 removed.';

COMMIT;
