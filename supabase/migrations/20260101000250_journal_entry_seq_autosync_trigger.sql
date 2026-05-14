-- 20260101000250_journal_entry_seq_autosync_trigger.sql
--
-- Permanent fix for the recurring "duplicate key value violates unique
-- constraint journal_entries_entry_no_key" approval error. Same root cause
-- as mig 240's one-off resync: two code paths generate entry_no using
-- different schemes:
--
--   post_journal_entry RPC (mig 195) — uses per-period MAX(entry_no) + 1,
--     does NOT touch journal_entry_no_seq.
--   approve_single_voucher / approve_voucher_batch /
--     approve_voucher_batch_partial RPCs (mig 241) — use
--     nextval('journal_entry_no_seq'), does NOT read existing data.
--
-- Whenever post_journal_entry inserts a row (e.g. fund-source approval),
-- the sequence falls behind. The next time an approve_*_voucher RPC fires,
-- nextval returns a value that's already taken. mig 240 resync'd once but
-- didn't address the divergence, so it recurred.
--
-- Fix: a BEFORE INSERT trigger that pushes the sequence to GREATEST of its
-- current last_value and the incoming row's NNNN suffix. After this, both
-- writers stay in lockstep:
--
--   post_journal_entry inserts JE-202605-0009 → trigger bumps seq to 9.
--   approve_*_voucher: nextval returns 10 (>= the data's max).
--   No more conflicts.
--
-- Note: the sequence is global (not per-period). entry_no within a period
-- (e.g. June 2026) may therefore have gaps if both writers contribute —
-- that's existing behaviour, not a new problem. If we ever need
-- per-period gapless numbering, switch all writers to a per-period MAX
-- + advisory lock pattern; that's a much bigger change.

BEGIN;

CREATE OR REPLACE FUNCTION journal_entries_sync_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nnnn INT;
  v_current BIGINT;
BEGIN
  -- entry_no format is JE-YYYYMM-NNNN. SUBSTRING(... FROM 11) grabs NNNN.
  -- Defensive: if the incoming entry_no doesn't match the pattern, skip the
  -- bump (the unique constraint would catch a malformed value separately).
  IF NEW.entry_no IS NULL OR NEW.entry_no !~ '^JE-[0-9]{6}-[0-9]+$' THEN
    RETURN NEW;
  END IF;
  v_nnnn := SUBSTRING(NEW.entry_no FROM 11)::INT;
  SELECT last_value INTO v_current FROM journal_entry_no_seq;
  IF v_nnnn > v_current THEN
    PERFORM setval('journal_entry_no_seq', v_nnnn, true);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS journal_entries_sync_seq_trigger ON journal_entries;
CREATE TRIGGER journal_entries_sync_seq_trigger
  BEFORE INSERT ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION journal_entries_sync_seq();

-- One-time resync so any drift already in the data is caught immediately
-- (the trigger only fires on future inserts).
SELECT setval(
  'journal_entry_no_seq',
  GREATEST(
    (SELECT last_value FROM journal_entry_no_seq),
    COALESCE(
      (SELECT MAX(SUBSTRING(entry_no FROM 11)::INT) FROM journal_entries
        WHERE entry_no ~ '^JE-[0-9]{6}-[0-9]+$'),
      0
    )
  ),
  true
);

COMMIT;
