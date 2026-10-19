-- ════════════════════════════════════════════════════════════════════════════
-- A sofa's name reads in capitals (2026-10-19)
--
-- The user, on Modular's board after naming 5071 "aaaa": the name should read
-- "AAAA", in capitals as the ERP writes every name (NOVA, SOFFIO), and lead the
-- card with the code under it. From today the window keeps a name in capitals
-- (`tidyModelName`, lib/catalogue/edits.ts); this brings a name saved before it
-- into line — on production one, 5071's.
-- Run twice it changes nothing.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.catalogue_models
   SET model_name = upper(model_name)
 WHERE model_name IS NOT NULL
   AND model_name IS DISTINCT FROM upper(model_name);
