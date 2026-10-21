-- ============================================================================
-- 20261021230100_soffio_combos_from_october.sql
-- SOFFIO's four sets cost the whole of October (2026-10-21 — the user, on a side agent's note that a set made on Add
-- combo counts only from the day it was made: "i want start from october dy, help me recost together").
-- ============================================================================
--
-- Add combo writes effective_from = the day the set is made (catalogue_add_combo leaves the column's default), and
-- catalogue_apply_combos takes a set only for a bill dated on or after it — on a Recost too. The four SOFFIO (8030)
-- sets were made on 2026-10-21, so a bill sold from 1 to 20 October kept its modules' own costs. The user wants October
-- whole: each takes effect from 2026-10-01. Comm Cal › Fair › October › Orders › Recost then re-costs the month (and
-- the run is computed again afterwards).
--
-- Only those four rows, by id, while they still read 2026-10-21 and are live; a fresh database has none of them.

BEGIN;

UPDATE catalogue_combos
   SET effective_from = DATE '2026-10-01'
 WHERE id IN ('13d48e86-ba6e-46b9-b867-33231919bf2a',   -- 1A(LHF) + 1A(RHF) + CONSOLE
              'aad8c7ba-475d-480d-bf4d-10a4c9656eda',   -- 1A(LHF) + 1A(RHF)
              '21064da5-2423-41b1-ab26-571f58898fcc',   -- 1A(RHF) + 2A(LHF)
              'a8adebac-7d1c-4056-bcc9-f451e1b2539d')   -- 1S + 2S + 3S
   AND base_model = '8030'
   AND effective_from = DATE '2026-10-21'
   AND removed_at IS NULL;

COMMIT;
