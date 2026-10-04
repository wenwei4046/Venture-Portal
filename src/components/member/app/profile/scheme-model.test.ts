import { describe, expect, it } from "vitest";
import type { MemberBand, MemberMembership } from "@/lib/member/types";
import { schemeVM } from "./scheme-model";

const membership: MemberMembership = {
  id: "fair", schemeId: "s", name: "Fair", code: "FAIR", title: "Revenue Specialist", rank: "Rank F", rate: 0.05, calculator: true,
  effective: "2026-01-01", capacity: null, occupied: 3, people: [],
};
const band = (brand: string, key: string, kind: MemberBand["kind"], threshold: number, amount = 0, multiplier: number | null = null): MemberBand =>
  ({ brand, key, kind, threshold, multiplier, amount });
const bands = [
  band("AKEMI", "Incentive Tier 2", "incentive", 43, 1500), band("AKEMI", "Incentive Tier 1", "incentive", 36, 1000),
  band("AKEMI", "Standard margin", "reference", 33), band("AKEMI", "Below margin Tier 1", "penalty", 27, 0, 0.5),
  band("ZANOTTI", "Incentive Tier 1", "incentive", 33, 800),
];

describe("schemeVM", () => {
  it("names the member's place in the scheme", () => {
    const vm = schemeVM({ name: "ETHAN LIM", ini: "EL", membership, salary: 0, bands, hidden: false });
    expect(vm.role).toBe("Revenue Specialist · Rank F");
    expect(vm.stats).toEqual([{ label: "Rate", value: "5.0%" }, { label: "Fixed salary", value: "Commission only" }, { label: "Since", value: "1 Jan 2026" }]);
  });

  it("lists each brand's ladder as the scheme has it, money with the tiers that pay it", () => {
    const vm = schemeVM({ name: "ETHAN LIM", ini: "EL", membership, salary: 0, bands, hidden: false });
    expect(vm.brands.map(b => b.brand)).toEqual(["Akemi", "Zanotti"]);
    expect(vm.brands[0].rows.map(r => [r.label, r.value])).toEqual([
      ["Incentive Tier 2", "43% +"], ["Incentive Tier 1", "36 – 43%"], ["Standard margin", "27 – 36%"], ["Below margin Tier 1", "27% or lower"],
    ]);
    expect(vm.brands[0].rows[0].sub).toBe("Highest margin incentive · RM 1,500");
  });

  it("keeps the salary out of a view that may not see it, and hides it on request", () => {
    expect(schemeVM({ name: "X", ini: "X", membership, salary: undefined, bands: [], hidden: false }).stats[1].value).toBe("—");
    expect(schemeVM({ name: "X", ini: "X", membership, salary: 3000, bands: [], hidden: true }).stats[1].value).toBe("RM ••••");
    expect(schemeVM({ name: "X", ini: "X", membership: undefined, salary: null, bands: [], hidden: false }).role).toBe("Not on the scheme yet");
  });
});
