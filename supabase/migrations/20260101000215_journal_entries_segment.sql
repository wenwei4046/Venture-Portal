-- ============================================================================
-- 20260101000215_journal_entries_segment.sql
-- Add `segment` to journal_entries so Segment P&L can pivot the same GL data
-- by business unit AND tally exactly to the Company Income Statement.
--
-- Why
-- ---
-- /reports/segment-pnl needs to slice journal_lines by department / business
-- line. Today journal_entries has no such dimension — segment can be inferred
-- from reference_type + reference_id (e.g. invoice.billing_mode → segment),
-- but doing that at query time is brittle and slow. Tagging at write time:
--   * Makes Segment P&L a simple GROUP BY on journal_entries.segment
--   * Guarantees Segment Sum ≡ Company P&L (the audit-friendly invariant)
--   * Lets us add new segments later without rewriting reports
--
-- Segment values
-- --------------
-- treasury        — interest income/expense, penalty, fund source flows
-- marketing       — Marketing dept revenue & expense (billing_mode='marketing_project')
-- hr              — HR dept (billing_mode='hr_attribution', staff cost 5020)
-- finance         — Finance dept (billing_mode='finance_attribution', staff cost 5030)
-- director_office — Director Office (billing_mode='director_office_attribution', salary fan-out)
-- corporate       — HV-level entries that don't belong to a single dept
-- unallocated     — fallback when source can't be derived (must trend toward 0)
--
-- post_journal_entry RPC
-- ----------------------
-- Adds an optional p_segment param (default 'unallocated') so existing
-- callers don't break. Mig 4 in this series updates every callsite to pass
-- the right value; this migration is non-breaking.
-- ============================================================================

BEGIN;

-- 1) Create the enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gl_segment') THEN
        CREATE TYPE gl_segment AS ENUM (
            'treasury',
            'marketing',
            'hr',
            'finance',
            'director_office',
            'corporate',
            'unallocated'
        );
    END IF;
END$$;

-- 2) Add column with safe default
ALTER TABLE journal_entries
    ADD COLUMN segment gl_segment NOT NULL DEFAULT 'unallocated';

COMMENT ON COLUMN journal_entries.segment IS
    'Business segment for Segment P&L pivot. Sum of segments ≡ Company Income Statement. Fallback "unallocated" should trend to zero — alert in /reports/segment-pnl reconciliation row when non-zero.';

-- 3) Index for Segment P&L queries (period_month + segment)
CREATE INDEX idx_journal_entries_period_segment
    ON journal_entries(period_month, segment)
    WHERE is_reversed = FALSE;

-- 4) Update post_journal_entry RPC to accept p_segment
DROP FUNCTION IF EXISTS post_journal_entry(DATE, TEXT, TEXT, UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION post_journal_entry(
    p_transaction_date DATE,
    p_description      TEXT,
    p_reference_type   TEXT,
    p_reference_id     UUID,
    p_created_by       UUID,
    p_lines            JSONB,  -- [{account_code, debit, credit, description?}]
    p_segment          gl_segment DEFAULT 'unallocated'
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

    -- ── Insert header (now with segment) ────────────────────────────
    INSERT INTO journal_entries (
        entry_no, transaction_date, period_month, description,
        reference_type, reference_id, total_amount, segment, created_by
    ) VALUES (
        v_entry_no,
        p_transaction_date,
        v_period_month,
        p_description,
        NULLIF(p_reference_type, ''),
        p_reference_id,
        v_total_debit,
        p_segment,
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
    'Mig 215: unified entry point for balanced double-entry journals with segment tagging. SECURITY DEFINER so non-finance RPCs (dept expense approval, payroll fan-out, etc.) can post despite je_insert RLS. Strict 0.00 balance tolerance. Advisory lock per period serialises entry_no generation. p_segment defaults to "unallocated" for backward compat — every callsite should pass the real segment so Segment P&L tallies to Company P&L.';

GRANT EXECUTE ON FUNCTION post_journal_entry(DATE, TEXT, TEXT, UUID, UUID, JSONB, gl_segment)
    TO authenticated;

COMMIT;
