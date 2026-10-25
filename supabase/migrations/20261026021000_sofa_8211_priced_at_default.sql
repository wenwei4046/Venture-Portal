-- ============================================================================
-- 20261026021000_sofa_8211_priced_at_default.sql
-- 8211 MODENA's prices move to the one seat the ERP sells it at, DEFAULT (2026-10-25 — the user, told why no 8211
-- bill had a margin and offered a DEFAULT column on SKU Master with 8211's prices moved into it: "ok, can do 1 and 2").
-- ============================================================================
--
-- The ERP's Modular gives 8211 one seat size, DEFAULT ("Seat sizes (inches)"; its 4FT / 5FT / 6FT / 7FT are its
-- lengths, a SKU each), and its bills say `SEAT DEFAULT` or name no seat at all. SKU Master showed every sofa the
-- seats 24 – 35 and hid DEFAULT, so 8211's prices were typed under seats it is never sold at — 4FT 720, 6FT 1080,
-- 7FT 1260 at each of 24 / 26 / 28 / 30 / 32 / 35, 0 at 25" / 27" / 29" — and catalogue_unit_price, which matches a
-- seat exactly, costed none of its 25 lines since September (16 bills). The Quote, offering a seat only where it is
-- ticked (DEFAULT) and priced, could not sell MODENA either.
--
-- Each SKU's one price becomes its one cell, DEFAULT, at the tier it was typed at (PRICE_1 — a PRICE_2 bill falls back
-- to it, catalogue_grid_price): a bill at SEAT DEFAULT costs it exactly, and a bill naming no seat reads a grid of one
-- seat (catalogue_unit_price). Every other cell goes — a 0 is no price (20261021230200) — so 8211-5FT, priced at
-- none, keeps no grid at all. A landed month changes when it is Recosted, as after any price.
--
-- Only these four SKUs, by id, and only while each still reads as on 2026-10-25: every cell PRICE_1 and a figure, no
-- DEFAULT cell yet, at most one figure above 0. Anything else — a price typed since, a second tier — is left alone,
-- and a second run changes nothing. A fresh database has none of them.

BEGIN;

WITH sku AS (
    SELECT cs.erp_product_id,
           COUNT(*) FILTER (WHERE c->>'tier' IS DISTINCT FROM 'PRICE_1')                  AS other_tiers,
           COUNT(*) FILTER (WHERE catalogue_height_key(c->>'height') = 'default')         AS defaults,
           COUNT(*) FILTER (WHERE COALESCE(c->>'price', '') !~ '^\d+(\.\d+)?$')           AS not_figures,
           COUNT(DISTINCT CASE WHEN c->>'price' ~ '^\d+(\.\d+)?$'
                               THEN NULLIF((c->>'price')::NUMERIC, 0) END)                AS prices,
           MAX(CASE WHEN c->>'price' ~ '^\d+(\.\d+)?$' THEN (c->>'price')::NUMERIC END)  AS price
      FROM catalogue_skus cs
      CROSS JOIN LATERAL jsonb_array_elements(cs.price_grid) c
     WHERE cs.erp_product_id IN ('mfg-79cb847d88f9',   -- 8211-4FT
                                 'mfg-9cc48b8822c5',   -- 8211-5FT
                                 'mfg-ee9bb4027287',   -- 8211-6FT
                                 'mfg-11a4ab5b48b7')   -- 8211-7FT
       AND jsonb_typeof(cs.price_grid) = 'array'
     GROUP BY cs.erp_product_id
)
UPDATE catalogue_skus cs
   SET price_grid = CASE WHEN s.price > 0
                         THEN jsonb_build_array(jsonb_build_object('height', 'DEFAULT', 'tier', 'PRICE_1', 'price', s.price))
                    END
  FROM sku s
 WHERE cs.erp_product_id = s.erp_product_id
   AND s.other_tiers = 0
   AND s.defaults = 0
   AND s.not_figures = 0
   AND s.prices <= 1;

COMMIT;
