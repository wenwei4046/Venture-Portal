-- Book-only CONTRA groups (user 2026-08-08: "有一些我会做transaction，但是
-- 其实银行没过账，他会debit contra credit") — e.g. a fund-in +98k and the
-- matching loan-out −98k that never touched the bank, or per-bank cleanup
-- entries. A group of journal lines summing to ZERO can be marked contra:
-- statement_line_id becomes nullable and session_id ties the group to the
-- month it was marked in.

ALTER TABLE bank_recon_matches ALTER COLUMN statement_line_id DROP NOT NULL;
ALTER TABLE bank_recon_matches
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES bank_recon_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS bank_recon_matches_session_idx ON bank_recon_matches(session_id);
