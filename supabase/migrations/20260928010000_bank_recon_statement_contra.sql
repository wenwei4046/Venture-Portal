-- Statement-side CONTRA groups (user 2026-09-28: "还是不能像 book GL 这样让他
-- contra 吗？"). The bank's own charge-and-waiver pairs — Aug'26 has
-- "Service Charge - ePayment 1.60" then "Rebates-Fees 1.60" the next day, and
-- the same for 0.40 — move on the statement and net to zero, with nothing to
-- book. Until now the only handling was to ignore each line one at a time,
-- which loses the fact that they cancel each other.
--
-- Mirror of 20260808030000 (book-only contra): there statement_line_id became
-- nullable so a set of journal lines summing to zero could stand alone; here
-- journal_line_id becomes nullable so a set of STATEMENT lines summing to zero
-- can. The UNIQUE (journal_line_id) index is unaffected — Postgres allows any
-- number of NULLs in a unique index. A row must still carry at least one side.
ALTER TABLE bank_recon_matches ALTER COLUMN journal_line_id DROP NOT NULL;

ALTER TABLE bank_recon_matches DROP CONSTRAINT IF EXISTS bank_recon_matches_one_side;
ALTER TABLE bank_recon_matches
  ADD CONSTRAINT bank_recon_matches_one_side
  CHECK (statement_line_id IS NOT NULL OR journal_line_id IS NOT NULL);

COMMENT ON COLUMN bank_recon_matches.journal_line_id IS
  'Book line in the group. NULL on a statement-side contra row (bank charge waived by the bank — the statement lines cancel each other and never reach the GL).';

-- 'contra' joins the match_kind vocabulary: a statement line that cancels
-- against other statement lines in its group. Distinct from 'ignored' (set
-- aside on its own) and from 'auto'/'manual' (matched to the books).
ALTER TABLE bank_recon_lines DROP CONSTRAINT IF EXISTS bank_recon_lines_match_kind_check;
ALTER TABLE bank_recon_lines
  ADD CONSTRAINT bank_recon_lines_match_kind_check
  CHECK (match_kind = ANY (ARRAY['auto'::text, 'manual'::text, 'ignored'::text, 'contra'::text]));
