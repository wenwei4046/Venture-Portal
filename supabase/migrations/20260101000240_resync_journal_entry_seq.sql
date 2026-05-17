-- 20260101000240_resync_journal_entry_seq.sql
--
-- Resync journal_entry_no_seq to max existing entry_no per period.
--
-- Symptom: post_journal_entry RPC errors "duplicate key value violates unique
-- constraint journal_entries_entry_no_key". The RPC uses nextval(seq) +
-- formats as JE-YYYYMM-NNNN, so if seq drifts below max(entry_no) we get
-- collisions. Drift can happen across project clones, partial wipe scripts,
-- or any path that INSERTs into journal_entries without calling nextval.
--
-- This migration is idempotent — safe to re-run any time. Sets the sequence
-- to the global max of NNNN across all entry_no (or 0 if empty).

BEGIN;

DO $$
DECLARE
  v_max INT;
BEGIN
  SELECT COALESCE(MAX(SPLIT_PART(entry_no, '-', 3)::INT), 0)
  INTO v_max
  FROM journal_entries
  WHERE entry_no ~ '^JE-[0-9]{6}-[0-9]+$';

  -- setval(<seq>, v_max, true) means "next nextval() returns v_max + 1"
  PERFORM setval('journal_entry_no_seq', GREATEST(v_max, 1), v_max > 0);
END $$;

COMMIT;
