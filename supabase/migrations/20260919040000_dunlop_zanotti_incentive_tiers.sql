-- ============================================================================
-- DUNLOPILLO AND ZANOTTI HAVE TWO TIERS TOO (2026-09-19)
--
-- The Fair ladder is not one ladder. Akemi and Ergotex pay Tier 1 at 36% and
-- Tier 2 at 43%; Dunlopillo and Zanotti sit three points lower -- Tier 1 at
-- 33%, Tier 2 at 36% (user, 2026-09-19). The Rules page said exactly that in
-- its LABELS, and had said it since the ladder was entered. What was stored
-- underneath did not:
--
--   36%  label "Incentive Tier 2"   kind incentive   key incentive_tier_1
--   33%  label "Incentive Tier 1"   kind REFERENCE   key standard   RM 0
--
-- Whoever keyed it typed the right labels on the wrong rows. Two things
-- follow, and both COST the salesperson money:
--
--   * `marginIncentiveAcrossBrands` only reads kind = 'incentive'. Tier 1 was
--     a reference band, so a Dunlopillo or Zanotti month landing between 33%
--     and 36% earned nothing at all.
--   * "every brand must clear the tier" intersects on BAND KEY. With their
--     Tier 2 filed under incentive_tier_1, these brands had no second tier to
--     intersect with Akemi's, so a month that cleared 43% on Akemi and 36% on
--     Zanotti paid Tier 1 alone.
--
-- It moves no money in September, and it is worth being precise about why.
-- Recomputed against the corrected ladder, the month gives the incentive to
-- three people, all Akemi-only at Tier 2 -- and Akemi's rungs did not change.
-- Nobody reaches a Dunlopillo or Zanotti rung at all: of the fourteen people
-- who sold Zanotti, thirteen have a bill with no cost and the fourteenth
-- blends to 24.4%; all five Ergotex sellers and both Dunlopillo sellers are
-- missing cost too. Cost data, not the ladder, is what stands between this
-- team and the incentive. This is the rule written down correctly for the
-- months that follow, not a correction to September's pay.
--
-- The 30% reference row already reads "Standard Margin" and is left alone.
-- Order matters: the 36% row gives up incentive_tier_1 before the 33% row
-- claims it, or UNIQUE (brand_id, band_key) refuses the pair.
--
-- Any month already computed against the old ladder is now stale and must be
-- recomputed before it is applied.
-- ============================================================================

-- --- 1. The 36% row is their Tier 2 ----------------------------------------

UPDATE comm_margin_bands m
   SET band_key = 'incentive_tier_2',
       label = 'Incentive Tier 2',
       sort_order = 10
  FROM comm_brands b
  JOIN comm_schemes s ON s.id = b.scheme_id
  JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
 WHERE b.id = m.brand_id
   AND sd.name = 'Fair'
   AND b.code IN ('DUNLOP', 'ZANOTTI')
   AND m.band_key = 'incentive_tier_1'
   AND m.margin_pct = 0.36;

-- --- 2. The 33% row is their Tier 1, and it pays --------------------------

UPDATE comm_margin_bands m
   SET band_key = 'incentive_tier_1',
       label = 'Incentive Tier 1',
       kind = 'incentive',
       monthly_incentive = 1000,
       sort_order = 20
  FROM comm_brands b
  JOIN comm_schemes s ON s.id = b.scheme_id
  JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
 WHERE b.id = m.brand_id
   AND sd.name = 'Fair'
   AND b.code IN ('DUNLOP', 'ZANOTTI')
   AND m.band_key = 'standard'
   AND m.margin_pct = 0.33;

-- --- 3. Refuse to leave the ladder half-corrected ---------------------------
--
-- Every Fair brand must now carry both incentive tiers, at its own thresholds
-- and the same money. If this fails the whole migration rolls back rather than
-- leaving one brand paying on a rule nobody wrote down.

DO $$
DECLARE v_bad TEXT;
BEGIN
    SELECT string_agg(b.code || ' ' || COALESCE(t.tiers::TEXT, '0'), ', ')
      INTO v_bad
      FROM comm_brands b
      JOIN comm_schemes s ON s.id = b.scheme_id
      JOIN comm_sub_departments sd ON sd.id = s.sub_department_id
      LEFT JOIN LATERAL (
          SELECT COUNT(*) AS tiers
            FROM comm_margin_bands m
           WHERE m.brand_id = b.id AND m.kind = 'incentive'
             AND m.band_key IN ('incentive_tier_1', 'incentive_tier_2')
             AND m.monthly_incentive = CASE m.band_key
                 WHEN 'incentive_tier_1' THEN 1000 ELSE 1500 END
      ) t ON TRUE
     WHERE sd.name = 'Fair' AND b.is_active AND COALESCE(t.tiers, 0) <> 2;

    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'Fair brands without two paying incentive tiers: %', v_bad;
    END IF;
END $$;
