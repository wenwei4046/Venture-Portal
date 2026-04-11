-- P-APPR-01 backfill: update existing 'advance' approval_request descriptions
-- that were generated before migration 44 fixed the ': RM ' spacing. Matches
-- only rows where ': RM' is immediately followed by a digit (the broken
-- pattern), so re-running is a no-op after the first apply.
--
-- RLS on approval_requests blocks UPDATE via the `hr_cost_sub_no_update`-style
-- policies; this migration runs as the postgres owner (no RLS) so the fix
-- goes through. The affected rows are typically already approved — we're
-- only updating the display string, no state transitions.

UPDATE approval_requests
SET description = REPLACE(description, ': RM', ': RM ')
WHERE request_type = 'advance'
  AND description ~ ': RM[0-9]';
