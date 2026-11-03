-- ============================================================================
-- 20261027231000_sofa_console_price_1_700_removed.sql
-- The Consoles' 700 at PRICE_1 goes (2026-10-27 — the user, shown 8030-Console at PRICE_1 700 beside its own PRICE_2
-- 360 / PRICE_3 380, and 8038 / 8060 Console at 700 on every seat beside a STD ladder of their own: "help me delete
-- the consolse price first").
-- ============================================================================
--
-- 8030-Console was keyed 700 at PRICE_1 on every seat (24 – 35) beside the 360 / 380 at PRICE_2 / PRICE_3 it is sold
-- at, so the Quote costed SOFFIO's console at 700 while its PRICE_2 bills took 360. 8038-Console (24 – 42) and
-- 8060-Console (24 – 35) carry the same 700 at PRICE_1 on every seat beside a ladder of their own at STD (8038 360 /
-- 380 / 400, 8060 450 / 470 / 490). Each of those 700s goes; every other cell stays — 8030's 360 / 380, the STD ladders
-- (their PRICE_1 included), and the inactive twins 8030-CONSOLE and 8038-CONSOLE lose the same cells.
--
-- What a bill costs from here (dry run on production, every August – October sofa line): one changes when its month
-- is Recosted — HC-SO-2609-254's 8038-Console at seat 32, 700 → no price — and ZNT6310's 8060-Console, which names no
-- seat, now reads the one seat its grid has (STD, PRICE_2 470). No October line changes. The same 700 at PRICE_2 on
-- the Consoles 20261027230000 moved (8050, 8051, 9028, 9050, 9058) is the user's to decide and is not touched here.
--
-- Only these five SKUs, by id, and only their PRICE_1 cells priced 700 at a seat other than STD: a second run changes
-- nothing. A fresh database has none of them.

BEGIN;

UPDATE catalogue_skus cs
   SET price_grid = (SELECT jsonb_agg(g.c ORDER BY g.n)
                       FROM jsonb_array_elements(cs.price_grid) WITH ORDINALITY AS g(c, n)
                      WHERE NOT (g.c->>'tier' = 'PRICE_1'
                                 AND g.c->>'price' ~ '^\d+(\.\d+)?$'
                                 AND (g.c->>'price')::NUMERIC = 700
                                 AND catalogue_height_key(g.c->>'height') IS DISTINCT FROM 'std'))
 WHERE cs.erp_product_id IN (
       'mfg-d6803a91b16e',   -- 8030-Console
       'mfg-f6cb1af0db77',   -- 8030-CONSOLE (inactive)
       'mfg-82d7682b99a8',   -- 8038-Console
       'mfg-4303222c64e9',   -- 8038-CONSOLE (inactive)
       'mfg-07dd695c8a33'    -- 8060-Console
       )
   AND jsonb_typeof(cs.price_grid) = 'array'
   AND EXISTS (SELECT 1
                 FROM jsonb_array_elements(cs.price_grid) c
                WHERE c->>'tier' = 'PRICE_1'
                  AND c->>'price' ~ '^\d+(\.\d+)?$'
                  AND (c->>'price')::NUMERIC = 700
                  AND catalogue_height_key(c->>'height') IS DISTINCT FROM 'std');

COMMIT;
