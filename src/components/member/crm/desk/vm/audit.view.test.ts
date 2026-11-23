import { describe, expect, it } from "vitest";
import { histInView } from "./audit";
import type { CrmData } from "@/lib/member/crm-data";
import type { HistRow } from "./ctx";

// The owner, 2026-11-23: "Management 这边也不是统一的，IR 是 IR，DC 是 DC，包括 setting 等等都要分开" — the Audit log and the
// History of a view list that view's own changes.
const IR = "sub-ir", DC = "sub-dc";
const row = (table: string, r: Record<string, unknown>): HistRow => ({ at: "2026-11-24T01:00:00Z", who: "Principal", table, op: "UPDATE", what: "x", changes: [], row: r, before: null, after: r });
const view = (sub: string | null, brands: ("conts" | "dc")[]) =>
  ({ scope: IR, view: { brands, people: ["hector"], ...(sub ? { sub } : {}) }, adNames: { a1: { name: "DC ad" } }, adRules: [] }) as unknown as CrmData;

describe("a change in a view's history", () => {
  it("is its own sub-department's showroom, form, template or settings — one from before them is IR's", () => {
    const dc = view(DC, ["dc"]), ir = view(IR, ["conts"]);
    for (const t of ["crm_showrooms", "crm_forms", "crm_templates", "crm_sub_settings"]) {
      expect(histInView(dc, row(t, { sub_department_id: DC })), t).toBe(true);
      expect(histInView(ir, row(t, { sub_department_id: DC })), t).toBe(false);
      expect(histInView(dc, row(t, { id: "before" })), t).toBe(false);
      expect(histInView(ir, row(t, { id: "before" })), t).toBe(true);
    }
    expect(histInView(ir, row("crm_settings", { reply_soon_h: 3 }))).toBe(true);
    expect(histInView(dc, row("crm_settings", { reply_soon_h: 3 }))).toBe(false);
  });

  it("keeps the brand and people rules it had", () => {
    const dc = view(DC, ["dc"]);
    expect(histInView(dc, row("crm_ad_assign", { ad_source_id: "a1" }))).toBe(true);
    expect(histInView(dc, row("crm_ad_assign", { ad_source_id: "zz" }))).toBe(false);
    expect(histInView(dc, row("crm_staff", { staff_id: "hector" }))).toBe(true);
    expect(histInView(dc, row("crm_staff", { staff_id: "peter" }))).toBe(false);
    expect(histInView(dc, row("crm_channels", { external_id: "1422533724269131" }))).toBe(true);
    expect(histInView(dc, row("crm_channels", { external_id: "1438056256053876" }))).toBe(false);
  });

  it("is every change with no view, or with no sub-department named", () => {
    const none = { scope: IR, adRules: [] } as unknown as CrmData;
    expect(histInView(none, row("crm_showrooms", { sub_department_id: DC }))).toBe(true);
    expect(histInView(view(null, ["dc"]), row("crm_showrooms", { sub_department_id: IR }))).toBe(true);
  });
});
