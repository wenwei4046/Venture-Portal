import { describe, expect, it } from "vitest";
import { adsReportFromParam, adsReportParam } from "./crm-ads-report";

describe("Ads Performance's PDF parameter", () => {
  it("carries the table there and back, words and all", () => {
    const r = { title: "1 Oct – 13 Oct 2026", head: ["Ad", "Leads", "Won"], rows: [["Raya sofa · 早鸟", "12", "3"], ["No ad", "4", "—"]] };
    expect(adsReportFromParam(adsReportParam(r))).toEqual(r);
  });
  it("refuses what is not such a table", () => {
    expect(adsReportFromParam(null)).toBeNull();
    expect(adsReportFromParam("not base64!")).toBeNull();
    expect(adsReportFromParam(btoa(JSON.stringify({ title: "x", head: ["a"], rows: [[1]] })).replace(/=+$/, ""))).toBeNull();
    expect(adsReportFromParam(btoa(JSON.stringify({ title: "x", head: ["a", "b"], rows: [["only one"]] })).replace(/=+$/, ""))).toBeNull();
  });
});
