-- ============================================================================
-- 20261027230000_sofa_prices_typed_at_price_1_are_price_2.sql
-- Sofa prices typed under PRICE_1 move to PRICE_2, the tier they are (2026-10-27 — the user, told that the ERP bills
-- nearly every sofa at PRICE_2 while these grids were priced at PRICE_1 alone: "help move change the p1 to p2, in
-- venture, taht is actaully p2 price, fill wrong").
-- ============================================================================
--
-- The ERP's fabric list puts nearly every fabric at PRICE_2, and a line naming no fabric reads PRICE_2, so the ERP's
-- sofa bills are PRICE_2 — all 128 of October's sofa lines, 200 of September's 203. On SKU Master 148 sofa SKUs
-- carry prices at PRICE_1 alone: 141 keyed between 2026-10-17 and 10-26 (5531 5535 5543 5562 8030 8038 8050 8051
-- 8060 8069 8211 9028 9050 9058), with 5066 (3) and 9030 (4). Every PRICE_2 bill already fell back to them
-- (catalogue_grid_price: the bill's tier, else PRICE_2, else the lowest tier priced at that seat). Each cell of those
-- grids moves to PRICE_2 as it stands — seat, price and order kept, a 0 kept as the no-price it is (20261021230200) —
-- so no bill's cost moves and the Quote prices the same figure, now at the tier the ERP bills.
--
-- Left as they are: the 181 SKUs that carry another tier as well — the ladders P1 < P2 < P3 the old list brought on
-- 2026-09-24 (2379, 2391, 5133 …) and those keyed since (8039 at seat 28: 750 / 800 / 850; 9058-1B; 2376) — and the
-- three Consoles whose 700 at PRICE_1 stands beside a PRICE_2 of their own (8030-Console 360, 8038-Console and
-- 8060-Console at STD), which are the user's to settle. The four 8030 sets (catalogue_combos and
-- catalogue_combo_prices, at PRICE_1) are not touched: a bill takes a set of any tier (20261021230000).
--
-- Only these SKUs, by id, and only while every cell of the grid still reads PRICE_1: a grid that has gained another
-- tier since is left alone, and a second run changes nothing. A fresh database has none of them.

BEGIN;

UPDATE catalogue_skus cs
   SET price_grid = (SELECT jsonb_agg(CASE WHEN g.c->>'tier' = 'PRICE_1'
                                           THEN jsonb_set(g.c, '{tier}', '"PRICE_2"')
                                           ELSE g.c END
                                      ORDER BY g.n)
                       FROM jsonb_array_elements(cs.price_grid) WITH ORDINALITY AS g(c, n))
 WHERE cs.erp_product_id IN (
       'mfg-e62903923d89',   -- 5066-1S
       'mfg-6b54797a6d66',   -- 5066-2S
       'mfg-613b5dce5c44',   -- 5066-3S
       'mfg-63423da91de8',   -- 5531-1S
       'mfg-c5e20f1b7da6',   -- 5535-1A(LHF)
       'mfg-eecf53f23734',   -- 5535-1A(RHF)
       'mfg-938eb1855c5c',   -- 5535-1NA
       'mfg-ffe94e3697b0',   -- 5535-1S
       'mfg-3536ad7eeb35',   -- 5535-2A(LHF)
       'mfg-2210c8bcd904',   -- 5535-2A(RHF)
       'mfg-eb1552da8e77',   -- 5535-2NA
       'mfg-9720b40bd5d1',   -- 5535-2S
       'mfg-c5106886a226',   -- 5535-3S
       'mfg-977cb94126ff',   -- 5535-CNR
       'mfg-780185166bb6',   -- 5535-L(LHF)
       'mfg-8e88e1a5f4e5',   -- 5535-L(RHF)
       'mfg-0cfd603b3aa2',   -- 5535-STOOL
       'mfg-9b45f4b7a920',   -- 5543-1B(LHF)
       'mfg-e2c7f94ba8dc',   -- 5543-1B(RHF)
       'mfg-9b584092d692',   -- 5543-1NA
       'mfg-a983ff2fe0fb',   -- 5543-1S
       'mfg-ef5bd6450a0e',   -- 5543-2A(LHF)
       'mfg-0b2f5b0d41d6',   -- 5543-2A(RHF)
       'mfg-c575fe62164e',   -- 5543-CNR
       'mfg-9986f325dd09',   -- 5543-L(LHF)
       'mfg-dd4acd002f2b',   -- 5543-L(RHF)
       'mfg-dbb240d9db43',   -- 5562-1A(LHF)
       'mfg-972c622a07cf',   -- 5562-1A(RHF)
       'mfg-14fa4afeb938',   -- 5562-1NA
       'mfg-e3bb25eb963a',   -- 5562-1S
       'mfg-3b95f5058416',   -- 5562-2A(LHF)
       'mfg-92f7191eda7c',   -- 5562-2A(RHF)
       'mfg-aa98d2e6d5d6',   -- 5562-2NA
       'mfg-d26bbf152816',   -- 5562-2S
       'mfg-a4e492e9ca02',   -- 5562-3S
       'mfg-938675c41c27',   -- 5562-CNR
       'mfg-c8e291abc407',   -- 5562-L(LHF)
       'mfg-0c34984321a0',   -- 5562-L(RHF)
       'mfg-6db72dbffd48',   -- 5562-STOOL
       'mfg-23702a685c37',   -- 8030-1A(LHF)
       'mfg-ddfdffda031b',   -- 8030-1A(RHF)
       'mfg-1f005894b62a',   -- 8030-1B(LHF)
       'mfg-fc0c1370ee1f',   -- 8030-1B(RHF)
       'mfg-26f4fc3d8a15',   -- 8030-1NA
       'mfg-e7d0c3846762',   -- 8030-1S
       'mfg-4312d0202bd0',   -- 8030-2A(LHF)
       'mfg-7f3c42ac66d8',   -- 8030-2A(RHF)
       'mfg-3f3c2dc84f1d',   -- 8030-2NA
       'mfg-d15e6b8bf162',   -- 8030-2S
       'mfg-25a05999f0b8',   -- 8030-3S
       'mfg-a907de0a17b7',   -- 8030-CNR
       'mfg-34131254ab6c',   -- 8030-L(LHF)
       'mfg-3e584f8d374d',   -- 8030-L(RHF)
       'mfg-3490f794be4b',   -- 8030-STOOL
       'mfg-3c7154269b5a',   -- 8038-1NA
       'mfg-a18d7929d9c2',   -- 8038-1S
       'mfg-9134b15d5114',   -- 8038-2NA
       'mfg-34268bae1516',   -- 8038-2S
       'mfg-da9a792856b8',   -- 8038-3S
       'mfg-8c118a16f2c7',   -- 8050-1S
       'mfg-acc0883c06b4',   -- 8050-2S
       'mfg-dee4e3572c7c',   -- 8050-3S
       'mfg-d1121e3ba293',   -- 8050-CONSOLE
       'mfg-9856320cf8cb',   -- 8051-1NA
       'mfg-aa11640f4bff',   -- 8051-1S
       'mfg-44e12db4a825',   -- 8051-2S
       'mfg-2e178884c053',   -- 8051-3S
       'mfg-9570a9069370',   -- 8051-CONSOLE
       'mfg-3eee2dce9d8a',   -- 8051-STOOL
       'mfg-aef05db41c30',   -- 8060-1A(LHF)
       'mfg-a513d7246e4c',   -- 8060-1A(RHF)
       'mfg-d5391daa6099',   -- 8060-1B(LHF)
       'mfg-78e5361905f8',   -- 8060-1B(RHF)
       'mfg-00c9ceb15521',   -- 8060-1NA
       'mfg-0fda7ce3b354',   -- 8060-1S
       'mfg-641105b9230c',   -- 8060-2A(LHF)
       'mfg-cc7c819cae97',   -- 8060-2A(RHF)
       'mfg-8affe5ad069d',   -- 8060-2B(LHF)
       'mfg-268647fa1750',   -- 8060-2B(RHF)
       'mfg-758272955de8',   -- 8060-2NA
       'mfg-43aa48713fef',   -- 8060-2S
       'mfg-1072928d55ac',   -- 8060-3S
       'mfg-2086e4bf8c48',   -- 8060-CNR
       'mfg-13e8968d92bd',   -- 8060-L(LHF)
       'mfg-43a22ade0fcf',   -- 8060-L(RHF)
       'mfg-bd7524c91a53',   -- 8060-STOOL
       'mfg-37e378bffff8',   -- 8069-1A(LHF)
       'mfg-67744f2e6f30',   -- 8069-1A(RHF)
       'mfg-41b3e07596dc',   -- 8069-1B(LHF)
       'mfg-fe4e5be9339a',   -- 8069-1B(RHF)
       'mfg-526cef2d7f8e',   -- 8069-1NA
       'mfg-b27ac149b047',   -- 8069-2A(LHF)
       'mfg-360332da8a2e',   -- 8069-2A(RHF)
       'mfg-a4a78d0f0e27',   -- 8069-2B
       'mfg-0f8d7b68141c',   -- 8069-2B(LHF)
       'mfg-d02af480dae1',   -- 8069-2B(RHF)
       'mfg-e6c4e74f50e5',   -- 8069-2NA
       'mfg-990ad66fddec',   -- 8069-CNR
       'mfg-1145aefbf165',   -- 8069-L(LHF)
       'mfg-c237a6f968d8',   -- 8069-L(RHF)
       'mfg-79cb847d88f9',   -- 8211-4FT
       'mfg-9cc48b8822c5',   -- 8211-5FT
       'mfg-ee9bb4027287',   -- 8211-6FT
       'mfg-11a4ab5b48b7',   -- 8211-7FT
       'mfg-0d6c48b39f4d',   -- 9028-1A(LHF)
       'mfg-75b3ad1f4781',   -- 9028-1A(RHF)
       'mfg-22dc0842023d',   -- 9028-1NA
       'mfg-b9336046b06d',   -- 9028-1S
       'mfg-a6ade5bfd955',   -- 9028-2A(LHF)
       'mfg-32b90de5c05e',   -- 9028-2A(RHF)
       'mfg-f4887b2c95e5',   -- 9028-2NA
       'mfg-74306a4f6fb9',   -- 9028-2S
       'mfg-23265b23e9c2',   -- 9028-3S
       'mfg-aaaaf8b07a26',   -- 9028-CNR
       'mfg-351bad04bf0c',   -- 9028-CONSOLE
       'mfg-f980ba41b86f',   -- 9028-L(LHF)
       'mfg-21c5bae2a2d2',   -- 9028-L(RHF)
       'mfg-7e2cc3fedd4a',   -- 9028-STOOL
       'mfg-7b8863f4e1ea',   -- 9030-1NA
       'mfg-7b932b55234f',   -- 9030-1S
       'mfg-ef692947a59e',   -- 9030-2S
       'mfg-49dfda11e6ed',   -- 9030-3S
       'mfg-c79a2ae72399',   -- 9050-1A(LHF)
       'mfg-f0ce66f1fd73',   -- 9050-1A(RHF)
       'mfg-87325b0efcb9',   -- 9050-1B(LHF)
       'mfg-a46b5a5da983',   -- 9050-1B(RHF)
       'mfg-dacc7b0836b9',   -- 9050-1NA
       'mfg-958b9a5f5e73',   -- 9050-2A(LHF)
       'mfg-20a308524b2a',   -- 9050-2A(RHF)
       'mfg-2090adf541e5',   -- 9050-2NA
       'mfg-98db71ac5893',   -- 9050-CNR
       'mfg-4c25fd4ead80',   -- 9050-Console
       'mfg-95ff4b0abd84',   -- 9050-CONSOLE
       'mfg-3984c6f443b7',   -- 9050-CONSOLE WOODEN
       'mfg-ec74f79164ca',   -- 9058-1A(LHF)
       'mfg-35f40886ea88',   -- 9058-1A(RHF)
       'mfg-41a1f29d6b6e',   -- 9058-1NA
       'mfg-43a97b19f22c',   -- 9058-1S
       'mfg-f83ba0917ef7',   -- 9058-2A(LHF)
       'mfg-b59773db8c16',   -- 9058-2A(RHF)
       'mfg-a80a8f529f9d',   -- 9058-2NA
       'mfg-4540d68cf938',   -- 9058-2S
       'mfg-7e1109ba634b',   -- 9058-3S
       'mfg-5411685e9f6a',   -- 9058-CNR
       'mfg-d1b717f64e16',   -- 9058-Console
       'mfg-1ce1412b452c',   -- 9058-CONSOLE
       'mfg-e3ba60238d32',   -- 9058-L(LHF)
       'mfg-be30deab7a43'    -- 9058-L(RHF)
       )
   AND jsonb_typeof(cs.price_grid) = 'array'
   AND jsonb_array_length(cs.price_grid) > 0
   AND NOT EXISTS (SELECT 1
                     FROM jsonb_array_elements(cs.price_grid) c
                    WHERE c->>'tier' IS DISTINCT FROM 'PRICE_1');

COMMIT;
