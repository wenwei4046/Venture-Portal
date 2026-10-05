// Aug / Sep commission per person, BEFORE and AFTER the bed-frame option rule
// (2026-10-05): the run as main computes it, and as this branch computes it, on
// the same input read from prod (service role from .env.local, never pasted).
//
// Bundle (aliases keep Next's server-only modules out of a plain node run):
//   npx esbuild .design/revenue-app/tools/comm-before-after.ts --bundle --platform=node --format=esm \
//     --alias:server-only=./.design/revenue-app/tools/empty.mjs \
//     --alias:@/lib/supabase/server=./.design/revenue-app/tools/no-session.mjs \
//     --outfile=<dir>/comm-before-after.mjs
//   node --env-file=.env.local <dir>/comm-before-after.mjs <dir>
//
// The input is read with MAIN's loader: this branch's asks for
// sales_order_lines.option_charge_amount, which does not exist until the
// migration is applied — and after it every line's charge is 0, which is
// exactly what main's input (no charge at all) is.
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadCommissionInput } from "C:/Users/wenwe/Venture Portal/src/app/(portal)/revenue/_lib/commission-input";
import { computeCommissionRun as runMain } from "C:/Users/wenwe/Venture Portal/src/lib/commission/engine";
import { computeCommissionRun as runBranch } from "../../../src/lib/commission/engine";
import type { EngineInput, EngineResult } from "../../../src/lib/commission/types";

const out = process.argv[2] ?? ".";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as unknown as SupabaseClient;
const SUBS = [
  { key: "Fair", sub: "71709f7e-9f7c-4e28-80cf-ce21be336995" },
  { key: "IR", sub: "ff85d03e-59f6-4738-a4f2-09643c54f622" },
];
const MONTHS = ["2026-08-01", "2026-09-01"];

const { data: staff } = await db.from("hr_staff_costs").select("id, employee_name");
const names = new Map((staff ?? []).map(s => [s.id as string, s.employee_name as string]));

type Row = { who: string; staffId: string; before: number; after: number; diff: number; marginBefore: number | null; marginAfter: number | null };
const report: Record<string, { rows: Row[]; totalBefore: number; totalAfter: number; warningsSame: boolean; bedframeLines: number; chargedLines: number }> = {};

for (const s of SUBS) {
  for (const period of MONTHS) {
    const label = `${s.key} ${period.slice(0, 7)}`;
    let input: EngineInput;
    try {
      input = (await loadCommissionInput(period, s.sub, db)).input;
    } catch (e) {
      console.log(label, "— no input:", e instanceof Error ? e.message : e);
      continue;
    }
    const before: EngineResult = runMain(input as never) as EngineResult;
    const after: EngineResult = runBranch(input);
    const byStaff = new Map(after.statements.map(st => [st.staffId, st]));
    const rows: Row[] = before.statements.map(b => {
      const a = byStaff.get(b.staffId);
      return {
        who: names.get(b.staffId) ?? b.staffId,
        staffId: b.staffId,
        before: b.totalCommission,
        after: a?.totalCommission ?? NaN,
        diff: Math.round(((a?.totalCommission ?? NaN) - b.totalCommission) * 100) / 100,
        marginBefore: b.marginPct,
        marginAfter: a?.marginPct ?? null,
      };
    }).sort((x, y) => y.before - x.before);
    const lines = input.orders.flatMap(o => o.lines);
    report[label] = {
      rows,
      totalBefore: before.totalCommission,
      totalAfter: after.totalCommission,
      warningsSame: JSON.stringify(before.warnings) === JSON.stringify(after.warnings),
      bedframeLines: lines.filter(l => l.itemGroup.toUpperCase() === "BEDFRAME").length,
      chargedLines: lines.filter(l => (l as { optionCharge?: number }).optionCharge).length,
    };
    const changed = rows.filter(r => r.diff !== 0 || r.marginBefore !== r.marginAfter);
    console.log(`${label}: ${rows.length} people · before RM ${before.totalCommission.toFixed(2)} · after RM ${after.totalCommission.toFixed(2)} · changed ${changed.length} · warnings same ${report[label].warningsSame} · bed frame lines ${report[label].bedframeLines}`);
  }
}
writeFileSync(`${out}/comm-before-after.json`, JSON.stringify(report, null, 1));
