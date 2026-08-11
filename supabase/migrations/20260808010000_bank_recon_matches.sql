-- One-to-many reconciliation matches (user 2026-08-08: "银行是收一笔，但是
-- gl 记录是多笔"). A statement line can now claim SEVERAL journal lines whose
-- amounts sum to it — junction table replaces the single
-- matched_journal_line_id column (backfilled below, then nulled; the column
-- stays for schema compat but code reads bank_recon_matches only).

CREATE TABLE IF NOT EXISTS bank_recon_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_line_id uuid NOT NULL REFERENCES bank_recon_lines(id) ON DELETE CASCADE,
  journal_line_id uuid NOT NULL REFERENCES journal_lines(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_line_id)
);

CREATE INDEX IF NOT EXISTS bank_recon_matches_stmt_idx ON bank_recon_matches(statement_line_id);

ALTER TABLE bank_recon_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_recon_matches_finance ON bank_recon_matches;
CREATE POLICY bank_recon_matches_finance ON bank_recon_matches
  FOR ALL USING (current_user_role() IN ('finance','principal'))
  WITH CHECK (current_user_role() IN ('finance','principal'));

INSERT INTO bank_recon_matches (statement_line_id, journal_line_id)
SELECT id, matched_journal_line_id
FROM bank_recon_lines
WHERE matched_journal_line_id IS NOT NULL
ON CONFLICT (journal_line_id) DO NOTHING;

UPDATE bank_recon_lines SET matched_journal_line_id = NULL
WHERE matched_journal_line_id IS NOT NULL;
