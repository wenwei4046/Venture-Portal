// Pulls the Arena's monthly snapshots and the booth history for the
// Championship simulation. Service role read from .env.local (never pasted).
// Usage: node --env-file=.env.local .design/revenue-app/tools/champ-fetch.mjs <outDir>
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const out = process.argv[2];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SUBS = [
  { key: "fair", sub: "71709f7e-9f7c-4e28-80cf-ce21be336995", scheme: "ab55f0b5-084e-4e31-968f-311fb9e1558b" },
  { key: "ir", sub: "ff85d03e-59f6-4738-a4f2-09643c54f622", scheme: "caeaf2eb-3931-40be-b3bd-b033814f8046" },
];
const MONTHS = (process.argv[3] ?? "2026-08,2026-09,2026-10").split(",");
for (const s of SUBS) {
  const data = { sub: s, months: {}, history: null };
  for (const m of MONTHS) {
    const { data: snap, error } = await db.rpc("member_arena_for_staff", { p_staff: randomUUID(), p_sub_department: s.sub, p_scheme: s.scheme, p_period: m, p_window: "monthly", p_is_self: false });
    if (error) throw new Error(`${s.key} ${m}: ${error.message}`);
    data.months[m] = snap;
  }
  const { data: hist, error } = await db.rpc("member_arena_booth_history_for_staff", { p_sub_department: s.sub, p_scheme: s.scheme });
  if (error) throw new Error(`${s.key} history: ${error.message}`);
  data.history = hist;
  // Who picked which brand week (for the simulation's notes only).
  const { data: weeks } = await db.from("member_arena_brand_weeks").select("staff_id,period_month,picks").eq("sub_department_id", s.sub);
  data.brandWeeks = weeks ?? [];
  // Standing closes per person-month.
  const { data: closes } = await db.from("comm_salesperson_closes").select("staff_id,period_month,reopened_at").eq("sub_department_id", s.sub).is("reopened_at", null);
  data.closes = closes ?? [];
  writeFileSync(`${out}/${s.key}.json`, JSON.stringify(data, null, 1));
  const counts = Object.fromEntries(Object.entries(data.months).map(([m, v]) => [m, `${v.people.length} people, active ${v.people.filter(p => p.sales || p.held).length}`]));
  console.log(s.key, JSON.stringify(counts), "events:", hist.events.length, "brandWeeks rows:", data.brandWeeks.length, "closes:", data.closes.length);
}
