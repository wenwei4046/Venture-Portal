-- Who bears the payroll a department did NOT bill to a subsidiary (2026-09-29).
--
-- HR fills the allocation (staff x company x pct) in HR Costing; whatever is
-- left over is the HV own share. Until now the answer to "does that leftover go
-- back to Venture Office, or stay in the department's own pool?" was a literal
-- in the code (OWN_SHARE_SEGMENTS = finance, director_office, director, it), so
-- changing it meant changing the program — and a department added later was
-- silently left out of it, which is exactly how IT and Revenue Department kept
-- slipping through other hardcoded lists.
--
-- It belongs on the department registry, beside segment_key / pool_gl_code /
-- billing_mode_key, where Finance can set it. The seed reproduces the literal
-- exactly, so nothing changes until someone flips a switch:
--   on  — Finance, Director Office, Director, IT
--   off — HR (pool-borne since 2026-09-03), Marketing (a direct cost centre),
--         Revenue Department (never in the list), Venture Office (it is the
--         one that bears them, so it cannot bill itself).
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS own_share_billback boolean NOT NULL DEFAULT false;

UPDATE departments
   SET own_share_billback = true
 WHERE segment_key IN ('finance', 'director_office', 'director', 'it');

COMMENT ON COLUMN departments.own_share_billback IS
  'Default for the own-share invoice: true = the payroll this department did not bill to a subsidiary is inter-billed to Venture Office (the department recovers it, Venture Office bears it); false = it stays in the department''s own pool. The generate dialog may override it for a single run.';
