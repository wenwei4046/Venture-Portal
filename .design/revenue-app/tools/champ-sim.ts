// Championship simulation on real data (champ-fetch.mjs output).
// Bundle: npx esbuild .design/revenue-app/tools/champ-sim.ts --bundle --platform=node --format=esm --outfile=<dir>/champ-sim.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { championshipMonth, championshipStandings, CHAMP_ITEMS, type ChampMonth } from "../../../src/lib/member/championship";
import type { ArenaPerson } from "../../../src/lib/member/arena";

const dir = process.argv[2];
const data = JSON.parse(readFileSync(`${dir}/fair.json`, "utf8"));
const MONTHS = ["2026-08", "2026-09"];

function costedOnly(people: ArenaPerson[]): ArenaPerson[] {
  // What-if: margins read from the costed bills alone (every bill costed).
  return people.map(p => ({ ...p, blindOrders: 0, brands: Object.fromEntries(Object.entries(p.brands).map(([b, s]) => [b, { ...s, blindOrders: 0 }])) }));
}

const out: Record<string, unknown> = {};
for (const variant of ["strict", "costed"] as const) {
  const months: ChampMonth[][] = [];
  for (const month of MONTHS) {
    const snap = data.months[month];
    const people = variant === "costed" ? costedOnly(snap.people) : snap.people;
    months.push(championshipMonth({ month, people, brands: snap.brands.map((b: { code: string }) => b.code), tiers: snap.tiers, history: data.history, kpi: { enabled: false, threshold: null } }));
  }
  out[variant] = { months, standings: championshipStandings(months), perMonth: months.map(m => championshipStandings([m])) };
}
writeFileSync(`${dir}/sim.json`, JSON.stringify(out, null, 1));

const strict = out.strict as { months: ChampMonth[][]; perMonth: ReturnType<typeof championshipStandings>[]; standings: ReturnType<typeof championshipStandings> };
const short: Record<string, string> = { salesByBrand: "ByBr", fairResults: "Fair", totalSales: "Sales", marginByBrand: "MgBr", totalMargin: "Mg", kpi: "KPI", record: "Rec" };
for (const [i, month] of MONTHS.entries()) {
  console.log(`\n=== ${month} (strict) ===`);
  console.log(["#", "name".padEnd(13), ...CHAMP_ITEMS.map(k => short[k].padStart(6)), "total".padStart(7)].join(" "));
  for (const s of strict.perMonth[i]) {
    const row = strict.months[i].find(r => r.id === s.id)!;
    console.log([String(s.position ?? "-").padStart(2), s.name.slice(0, 13).padEnd(13), ...CHAMP_ITEMS.map(k => String(row.parts[k].points).padStart(6)), String(s.total).padStart(7)].join(" "));
  }
}
