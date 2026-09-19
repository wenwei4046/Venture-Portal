-- ============================================================================
-- THE GIVEAWAYS START COSTING SOMETHING (2026-09-19)
--
-- Fair's item groups were keyed as abbreviations -- ACC, TRANS, OTHER -- from
-- the file-import era. The ERP sends its own names, and `classifyLine` matches
-- on the name: three of them have never matched anything.
--
--   configured   what the ERP actually sends   matched?
--   MATTRESS     mattress                      yes
--   BEDFRAME     bedframe                      yes
--   SOFA         sofa                          yes
--   DINING       dining                        yes
--   ACC          accessory                     NO
--   TRANS        service                       NO
--   OTHER        others                        NO  (singular vs plural)
--   --           fabric_accessory              NO  (never configured)
--
-- An unclassified group is treated as NOT commissionable, so TRANS and OTHER
-- were harmless: the effect was already what was intended. ACC was not.
--
-- ACC was configured commissionable on purpose. Commissionable groups are the
-- MARGIN BASE, KPI giveaways included, "because a free pillow has real cost
-- and that is exactly how giving it away is meant to hurt the margin"
-- (marginBase). Because the name never matched, that has never once happened:
-- 1,208 accessory lines across the committed months carry RM 32,157 of cost
-- against RM 899 of revenue -- pillows, bolsters, mattress protectors, nearly
-- all of them given away at zero -- and none of it has touched anybody's
-- margin. `fabric_accessory` is the same thing on the sofa side: another
-- RM 1,334 of cost against RM 490.
--
-- The user's call, 2026-09-19: count them in. So the configured names are
-- corrected to the ones the ERP actually sends, and the sofa giveaways get a
-- row of their own.
--
-- WHAT IT COSTS THE TEAM. On September's bills alone the giveaway cost takes
-- between 1 and 9 points off a salesperson's margin, and the heavier the
-- giving the harder it bites -- LIM YAU WEI gave away RM 1,694 and drops 8.7
-- points, MEI TING gave nothing and does not move. That is the rule working,
-- not a side effect.
--
-- Any month already computed is now stale: the margin base has changed, and
-- with it the below-margin penalty and the monthly incentive. Recompute
-- before anything pays.
-- ============================================================================

UPDATE comm_item_groups g SET item_group = 'ACCESSORY'
  FROM comm_schemes s JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
 WHERE s.id = g.scheme_id AND sd.name = 'Fair' AND g.item_group = 'ACC';

UPDATE comm_item_groups g SET item_group = 'SERVICE'
  FROM comm_schemes s JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
 WHERE s.id = g.scheme_id AND sd.name = 'Fair' AND g.item_group = 'TRANS';

UPDATE comm_item_groups g SET item_group = 'OTHERS'
  FROM comm_schemes s JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
 WHERE s.id = g.scheme_id AND sd.name = 'Fair' AND g.item_group = 'OTHER';

-- The sofa side's giveaways: pillows, stools, arm covers. Same treatment as
-- the mattress side's, because they are the same kind of thing.
INSERT INTO comm_item_groups (scheme_id, item_group, commissionable)
SELECT s.id, 'FABRIC_ACCESSORY', TRUE
  FROM comm_schemes s JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
 WHERE sd.name = 'Fair' AND s.is_active
   AND NOT EXISTS (SELECT 1 FROM comm_item_groups g
                    WHERE g.scheme_id = s.id AND upper(btrim(g.item_group)) = 'FABRIC_ACCESSORY');

-- ─── Nothing the team has sold may be left unclassified ─────────────────────
--
-- The whole failure above was a name nobody noticed not matching. This refuses
-- to leave another one behind: every item group on a committed Fair bill must
-- now resolve to a configured row.

DO $$
DECLARE v_missing TEXT;
BEGIN
    SELECT string_agg(DISTINCT sl.item_group, ', ')
      INTO v_missing
      FROM sales_orders o
      JOIN sales_import_batches b ON b.id = o.batch_id AND b.status = 'committed'
      JOIN comm_schemes s ON s.sub_department_id = b.sub_department_id AND s.is_active
      JOIN comm_sub_departments sd ON sd.id = s.sub_department_id AND sd.name = 'Fair'
      JOIN sales_order_lines sl ON sl.order_id = o.id
     WHERE NOT o.cancelled
       AND NOT EXISTS (SELECT 1 FROM comm_item_groups g
                        WHERE g.scheme_id = s.id
                          AND upper(btrim(g.item_group)) = upper(btrim(sl.item_group)));

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Item groups still unclassified on committed Fair bills: %', v_missing;
    END IF;
END $$;
