-- Many-to-many reconciliation groups (user 2026-08-08: "bank statement 可能是
-- 两笔加起来等于gl 的" — e.g. statement 31,000 + 10,333.33 ↔ GL 33,333.33 +
-- 8,000). A MATCH GROUP now ties N statement lines to M journal lines with
-- equal totals:
--   · every statement line in the group has ≥1 row (journal_line_id may be
--     NULL when the group has fewer JEs than statement lines)
--   · every claimed JE appears in exactly one row (UNIQUE stays, NULLs free)
-- Existing 1:N matches become groups keyed by their statement line.

ALTER TABLE bank_recon_matches ALTER COLUMN journal_line_id DROP NOT NULL;
ALTER TABLE bank_recon_matches ADD COLUMN IF NOT EXISTS match_group uuid;

UPDATE bank_recon_matches SET match_group = statement_line_id WHERE match_group IS NULL;

ALTER TABLE bank_recon_matches ALTER COLUMN match_group SET NOT NULL;

CREATE INDEX IF NOT EXISTS bank_recon_matches_group_idx ON bank_recon_matches(match_group);
