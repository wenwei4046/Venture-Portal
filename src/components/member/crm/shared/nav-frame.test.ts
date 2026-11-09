import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialSalesUi } from "../sales/ui";
import { initialPanelUi, type RoomDraft } from "../panel/ui";
import { NOT_LAYERS, PANEL_NAV, SALES_NAV, navFrameOf } from "./nav-frame";

// notes/10 §1 (2026-11-10, the owner: "android 点返回会回到首页"): a layer missing from SALES_NAV / PANEL_NAV pushes no step,
// so Back skips it and lands far back or leaves the CRM. Every `ui` / `panelUi` field named like a sheet, a page or a
// dialog must be in a list — or in NOT_LAYERS with its reason. Read from the interfaces' source, so an optional field
// (not in the initial state) counts too.
const fieldsOf = (file: string, name: string) => {
  const src = readFileSync(join(__dirname, file), "utf8");
  const body = src.slice(src.indexOf(`export interface ${name} {`)).split(/\r?\n\}/)[0];
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map(m => m[1]);
};
const LAYERISH = /(Open|Sheet|Ed|Edit|Ask)$/;

describe("every layer is a step of the phone's Back", () => {
  it.each([["sales/ui.ts", "SalesUi", SALES_NAV], ["panel/ui.ts", "PanelUi", PANEL_NAV]] as const)("%s: every *Open / *Sheet / *Ed / *Edit / *Ask field is in the nav frame", (file, name, list) => {
    const fields = fieldsOf(`../${file}`, name);
    expect(fields.length).toBeGreaterThan(30);
    const missing = fields.filter(f => LAYERISH.test(f) && !(list as readonly string[]).includes(f) && !(f in NOT_LAYERS));
    expect(missing).toEqual([]);
  });

  it("every listed field is a real field (a renamed one fails here)", () => {
    const sales = fieldsOf("../sales/ui.ts", "SalesUi"), panel = fieldsOf("../panel/ui.ts", "PanelUi");
    expect(SALES_NAV.filter(k => !sales.includes(k))).toEqual([]);
    expect(PANEL_NAV.filter(k => !panel.includes(k))).toEqual([]);
  });

  it("notes/10's layers are there", () => {
    for (const k of ["pick", "tp", "celebrate"]) expect(SALES_NAV).toContain(k);
    for (const k of ["pPick", "bpSheet", "applyPick", "ftx", "rmDel", "rmTP", "ovAds", "ovUp", "ovAct"]) expect(PANEL_NAV).toContain(k);
  });

  it("a switch on Insight is a step; deleting showroom 0 is a step too (0 is no 'closed')", () => {
    const a = navFrameOf(initialSalesUi(), initialPanelUi(), "panel", null, null);
    const b = navFrameOf(initialSalesUi(), { ...initialPanelUi(), ovAds: true }, "panel", null, null);
    const c = navFrameOf(initialSalesUi(), { ...initialPanelUi(), rmDel: 0 }, "panel", null, null);
    expect(JSON.stringify(a.shape)).not.toBe(JSON.stringify(b.shape));
    expect(c.shape["p.rmDel"]).toBe(0);
  });

  it("a showroom edited in place is the page itself (no step while typing); the full editor is a page over it", () => {
    const d = { i: 0, id: "r1", name: "KL", quick: true } as RoomDraft;
    const page = navFrameOf(initialSalesUi(), { ...initialPanelUi(), roomsOpen: true }, "panel", null, null);
    const typing = navFrameOf(initialSalesUi(), { ...initialPanelUi(), roomsOpen: true, rmEdit: d }, "panel", null, null);
    const full = navFrameOf(initialSalesUi(), { ...initialPanelUi(), roomsOpen: true, rmEdit: { ...d, quick: false } }, "panel", null, null);
    expect(typing.shape).toEqual(page.shape);
    expect(full.shape["p.rmEdit"]).toBe(true);
    expect(typing.snap.panel.rmEdit).toBe(d);
  });

  it("the chat's Label sheet (⋮ › Label) is a screen; its ⋮ dropdown is not", () => {
    const menu = navFrameOf({ ...initialSalesUi(), chat: "c1", hm: { menu: true } }, initialPanelUi(), "crm", null, null);
    const label = navFrameOf({ ...initialSalesUi(), chat: "c1", hm: { label: "labels" } }, initialPanelUi(), "crm", null, null);
    expect(menu.shape["s.hm"]).toBeNull();
    expect(label.shape["s.hm"]).toBe("label:labels");
    const form = navFrameOf({ ...initialSalesUi(), chat: "c1", hm: { label: "labelEdit", lform: { key: null, name: "", color: "" } } }, initialPanelUi(), "crm", null, null);
    expect(form.shape["s.hm"]).toBe("label:labelEdit");
    const team = navFrameOf(initialSalesUi(), { ...initialPanelUi(), lead: "c1", pLabel: { view: "labelEdit", form: null } }, "panel", null, null);
    expect(team.shape["p.pLabel"]).toBe("labelEdit");
  });
});
