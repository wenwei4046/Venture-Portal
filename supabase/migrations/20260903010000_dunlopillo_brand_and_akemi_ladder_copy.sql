-- ============================================================================
-- Dunlopillo brand + Akemi's margin ladder on every other Fair brand
-- (user 2026-09-03)
--
-- Section VII of Fair's Rules page had three brands and one finished ladder:
-- Akemi's seven rungs, Zanotti's single 33% rung, nothing for Ergotex. A brand
-- with no incentive ladder blocks the monthly incentive for anyone who sold
-- it, so the user asked for Akemi's whole table on each of them, plus a fourth
-- brand, Dunlopillo (code DUNLOP), carrying the same ladder.
--
-- The copy OVERWRITES a rung the target already has under the same band_key:
-- Zanotti's Incentive Tier 1 moves from 33% to Akemi's 36%, which is what
-- "copy the whole table" asks for. A rung the target has and Akemi does not
-- is left alone (there are none today).
--
-- Scoped to whichever scheme owns an AKEMI brand — today only Fair 2026. A
-- sub-department cloned later starts from whatever its clone gave it.
-- ============================================================================

DO $$
DECLARE
    v_scheme UUID;
    v_akemi  UUID;
    v_rows   INTEGER;
    v_total  INTEGER := 0;
BEGIN
    FOR v_scheme, v_akemi IN
        SELECT scheme_id, id FROM comm_brands WHERE code = 'AKEMI'
    LOOP
        -- The new brand, unless the "+ Add brand" button got there first (it
        -- did, on Fair). Its Item Code prefixes are unknown until the ERP
        -- export shows them, the same position Ergotex and Zanotti are in.
        INSERT INTO comm_brands (scheme_id, code, name, item_code_prefixes)
        VALUES (v_scheme, 'DUNLOP', 'Dunlopillo', ARRAY[]::TEXT[])
        ON CONFLICT ON CONSTRAINT uq_comm_brand_code DO NOTHING;

        INSERT INTO comm_margin_bands
            (scheme_id, brand_id, band_key, label, kind, margin_pct,
             commission_multiplier, monthly_incentive, sort_order)
        SELECT v_scheme, t.id, a.band_key, a.label, a.kind, a.margin_pct,
               a.commission_multiplier, a.monthly_incentive, a.sort_order
        FROM comm_margin_bands a
        CROSS JOIN comm_brands t
        WHERE a.brand_id = v_akemi
          AND t.scheme_id = v_scheme
          AND t.code IN ('ERGOTEX', 'ZANOTTI', 'DUNLOP')
        ON CONFLICT ON CONSTRAINT uq_comm_margin_band DO UPDATE SET
            label                 = EXCLUDED.label,
            kind                  = EXCLUDED.kind,
            margin_pct            = EXCLUDED.margin_pct,
            commission_multiplier = EXCLUDED.commission_multiplier,
            monthly_incentive     = EXCLUDED.monthly_incentive,
            sort_order            = EXCLUDED.sort_order;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_total := v_total + v_rows;

        -- Ergotex's and Zanotti's notes said their ladders were pending. They
        -- no longer are, and the same note is true of Dunlopillo.
        UPDATE comm_brands
        SET note = 'Ladder copied from Akemi 2026-09-03; Item Code prefixes pending.'
        WHERE scheme_id = v_scheme AND code IN ('ERGOTEX', 'ZANOTTI', 'DUNLOP');
    END LOOP;

    RAISE NOTICE 'margin bands written: %', v_total;
END $$;
