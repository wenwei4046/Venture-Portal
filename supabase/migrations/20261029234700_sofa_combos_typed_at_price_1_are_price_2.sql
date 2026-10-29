-- ============================================================================
-- 20261029234700_sofa_combos_typed_at_price_1_are_price_2.sql
-- The four SOFFIO sets typed under PRICE_1 move to PRICE_2, as their modules did (2026-10-29 — the user: "help me move
-- all the p1 price sofa in combo to p2 as well, last time didnt move togeether").
-- ============================================================================
--
-- 20261027230000 moved every sofa grid priced at PRICE_1 alone to PRICE_2 — the tier the ERP bills — and left the four
-- 8030 SOFFIO sets at PRICE_1: the only combos with a price, made on Add combo on 2026-10-21 and priced at PRICE_1 as
-- their modules then were. So Combo Pricing still shows them alone under FABRIC P1, every other set at P2 / P3. Each set
-- moves to PRICE_2 as it stands — its row in catalogue_combos and its row in catalogue_combo_prices, which every reader
-- joins on the same tier (catalogue_apply_combos, member_catalogue), so the two move in one statement or not at all.
-- Compartments, label, seat heights, effective date and every price are kept (the 0 at 25" too, still no price), and so
-- is who keyed them and when.
--
-- No bill's cost moves, nor the Quote's: a bill takes a set of any tier — its own, else PRICE_2, else the lowest
-- (catalogue_apply_combos since 20261021230000; its twin pickCombo for the Quote) — and each of these compartments has
-- this one live set, so a bill that took it at PRICE_1 takes the same set at PRICE_2, at the same price.
--
-- Only these four sets, by id, and only while the set is live and still PRICE_1 and its compartments have nothing at
-- PRICE_2 — no live set, no price — to collide with: a second run changes nothing. A fresh database has none of them.

BEGIN;

WITH sets AS (
    SELECT c.id, c.erp_company_id, c.base_model, c.slots_key
      FROM catalogue_combos c
     WHERE c.id IN (
           'aad8c7ba-475d-480d-bf4d-10a4c9656eda',   -- 8030 · 1A(LHF) + 1A(RHF)
           '13d48e86-ba6e-46b9-b867-33231919bf2a',   -- 8030 · 1A(LHF) + 1A(RHF) + CONSOLE
           '21064da5-2423-41b1-ab26-571f58898fcc',   -- 8030 · 1A(RHF) + 2A(LHF)
           'a8adebac-7d1c-4056-bcc9-f451e1b2539d'    -- 8030 · 1S + 2S + 3S
           )
       AND c.removed_at IS NULL
       AND c.tier = 'PRICE_1'
       AND NOT EXISTS (SELECT 1
                         FROM catalogue_combos o
                        WHERE o.erp_company_id = c.erp_company_id
                          AND o.base_model     = c.base_model
                          AND o.slots_key      = c.slots_key
                          AND o.tier           = 'PRICE_2'
                          AND o.removed_at IS NULL)
       AND NOT EXISTS (SELECT 1
                         FROM catalogue_combo_prices o
                        WHERE o.erp_company_id = c.erp_company_id
                          AND o.base_model     = c.base_model
                          AND o.slots_key      = c.slots_key
                          AND o.tier           = 'PRICE_2')
), prices AS (
    UPDATE catalogue_combo_prices p
       SET tier = 'PRICE_2'
      FROM sets s
     WHERE p.erp_company_id = s.erp_company_id
       AND p.base_model     = s.base_model
       AND p.slots_key      = s.slots_key
       AND p.tier           = 'PRICE_1'
)
UPDATE catalogue_combos c
   SET tier = 'PRICE_2'
  FROM sets s
 WHERE c.id = s.id;

COMMIT;
