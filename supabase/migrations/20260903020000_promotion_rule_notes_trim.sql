-- ============================================================================
-- Promotion-rule notes, trimmed to what the table no longer says itself
-- (user 2026-09-03)
--
-- Section VIII of the Rules page now groups the rows by step and route, so a
-- note reading "Alternative A: 500k group sales AND 10 KPI items per head"
-- repeats the two lines it sits beside, and "All three are compulsory" is
-- now the step head. Each note keeps only what the structure cannot show:
-- the KPI arithmetic, that route C stands alone, and why the 300k line is the
-- one that is live. Everything else becomes NULL, and a step with no notes
-- drops the column.
--
-- Before, for the record:
--   rs_5→rs_6   personal_sales      Two consecutive months at 100k.
--   rs_6→ta_7   group_sales         Group sales 300k. Currently the only enforced gate.
--   ta_7→ta_8 1 group_sales         Alternative A: 500k group sales AND 10 KPI items per head.
--   ta_7→ta_8 1 kpi_items_per_pax   Alternative A: a team of 5 needs 50 KPI items in total.
--   ta_7→ta_8 2 group_sales         Alternative B: 500k group sales AND margin Tier 1.
--   ta_7→ta_8 2 margin_band         Alternative B: margin Tier 1.
--   ta_7→ta_8 3 group_sales         Alternative C: 700k group sales on its own, whatever the KPI and margin.
--   ta_8→tl_9 1 group_sales         All three are compulsory.
--   ta_8→tl_9 1 kpi_items_per_pax   All three are compulsory.
--   ta_8→tl_9 1 margin_band         All three are compulsory.
-- ============================================================================

UPDATE comm_promotion_rules
SET note = NULL
WHERE (from_rank_key, to_rank_key) IN (('rs_5', 'rs_6'), ('ta_8', 'tl_9'))
   OR (from_rank_key = 'ta_7' AND to_rank_key = 'ta_8'
       AND alternative_group IN (1, 2)
       AND criterion IN ('group_sales', 'margin_band'));

UPDATE comm_promotion_rules
SET note = 'Live: it is also the ladder''s group-sales target for Team Assistant 7%.'
WHERE from_rank_key = 'rs_6' AND to_rank_key = 'ta_7' AND criterion = 'group_sales';

UPDATE comm_promotion_rules
SET note = 'A team of 5 needs 50 KPI items in total.'
WHERE from_rank_key = 'ta_7' AND to_rank_key = 'ta_8'
  AND alternative_group = 1 AND criterion = 'kpi_items_per_pax';

UPDATE comm_promotion_rules
SET note = 'On its own — whatever the KPI count and margin.'
WHERE from_rank_key = 'ta_7' AND to_rank_key = 'ta_8'
  AND alternative_group = 3 AND criterion = 'group_sales';
