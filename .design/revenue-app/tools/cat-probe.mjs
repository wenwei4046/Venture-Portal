// Probe the live member catalogue (unpriced + option-price presence) for the Quote rebuild.
// Usage: node --env-file=.env.local .design/revenue-app/tools/cat-probe.mjs <outFile>
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: cat, error } = await db.rpc("member_catalogue", { p_brands: ["AKEMI", "DUNLOP", "ERGOTEX", "ZANOTTI"], p_ids: null, p_priced: false, p_suggest: 0 });
if (error) throw error;
const { data: priced, error: e2 } = await db.rpc("member_catalogue", { p_brands: ["AKEMI", "DUNLOP", "ERGOTEX", "ZANOTTI"], p_ids: cat.products.filter(p => (p.kind||"").toUpperCase()==="BEDFRAME").map(p=>p.id), p_priced: true, p_suggest: 0 });
if (e2) throw e2;
writeFileSync(process.argv[2], JSON.stringify({ cat, optionPrices: priced.optionPrices, comboCount: (priced.combos||[]).length }, null, 1));
const by = {};
for (const p of cat.products) { const k = `${p.brand ?? "RIDER"}|${p.kind}|${p.category}`; by[k] = (by[k] ?? 0) + 1; }
console.log(by);
console.log("models", cat.models.length, "optionPrices", priced.optionPrices.length);
