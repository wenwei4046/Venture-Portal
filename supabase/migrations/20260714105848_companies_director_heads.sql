-- ─────────────────────────────────────────────────────────────────────────────
-- Director heads as a COMPANY RULE, not manual grid input (user 2026-07-14).
--
-- The Heads column in the CTC grid was manual and kept getting re-saved as 1.
-- Move the rule into companies.director_heads: how many directors that
-- subsidiary's CTC covers. batchSaveCTC stamps it into director_ctc.heads on
-- every save, so the per-head SOCSO/EIS caps (migration 20260713085246)
-- apply automatically and the grid no longer shows the column.
--
-- Standing rule: HOUZS Century (HC) = 2 directors; everyone else 1.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE companies
    ADD COLUMN director_heads INTEGER NOT NULL DEFAULT 1 CHECK (director_heads >= 1);

COMMENT ON COLUMN companies.director_heads IS
    'How many directors this subsidiary''s CTC covers. Stamped into director_ctc.heads on save — employer SOCSO/EIS cap per person, so 2 heads = two caps (HC = 2, user rule 2026-07-14).';

UPDATE companies SET director_heads = 2 WHERE short_code = 'HC';
