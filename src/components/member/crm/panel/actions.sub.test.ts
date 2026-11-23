import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import { DEFAULT_CRM_SETTINGS, type CrmData } from "@/lib/member/crm-data";
import type { SalesActions } from "../sales/actions";

// The owner, 2026-11-23: "Management 这边也不是统一的，IR 是 IR，DC 是 DC，包括 setting 等等都要分开" — what the Control panel
// saves in a Revenue app view is that view's sub-department's (mig 20261124210000, the "…_in" writes).
const calls: { name: string; args: Record<string, unknown> }[] = [];
vi.mock("@/app/(member)/member/crm-actions", () => ({
  crmWrite: vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    const data = name.startsWith("crm_save_showroom_full") ? { id: "room-new", ...(args.p_sub ? { sub_department_id: args.p_sub } : {}) }
      : name.startsWith("crm_save_template") ? { id: "t-new", name: "Hello", channel: "whatsapp", body: "Hi {name}", status: "draft", is_on: false, meta_name: null, language: "en", reject_reason: null, category: "MARKETING", ...(args.p_sub ? { sub_department_id: args.p_sub } : {}) }
      : null;
    return { ok: true, data };
  }),
  importCrmTemplates: vi.fn(async (sub?: string | null) => { calls.push({ name: "importCrmTemplates", args: { sub } }); return { ok: true, added: 0, skipped: [] }; }),
  fetchMetaAds: vi.fn(), refreshCrmTemplates: vi.fn(), submitCrmTemplate: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { makePanelActions } from "./actions";

const IR = "11111111-1111-4111-8111-111111111111", DC = "22222222-2222-4222-8222-222222222222";
let d: CrmData;
const setData = (f: SetStateAction<CrmData>) => { d = typeof f === "function" ? f(d) : f; };
const base = { toast: vi.fn() } as unknown as SalesActions;
const actions = (sub: string | null) => makePanelActions(base, { live: true, data: () => d, setData, sub: () => sub });

beforeEach(() => {
  calls.length = 0;
  d = { scope: IR, viewerId: "me", rooms: [], templates: [], roomDrafts: {}, settings: { ...DEFAULT_CRM_SETTINGS },
    settingsBySub: { [IR]: { ...DEFAULT_CRM_SETTINGS }, [DC]: { ...DEFAULT_CRM_SETTINGS } }, apptTypes: [], apptTypesBySub: {} } as unknown as CrmData;
});

describe("the Control panel's Management writes in a view", () => {
  it("save DC's Settings › General as DC's, leaving the CRM's own as they were", async () => {
    const st = { ...DEFAULT_CRM_SETTINGS, replySoonH: 2, autoAssign: false };
    expect(await actions(DC).saveSettings(st)).toBe(true);
    expect(calls[0].name).toBe("crm_save_settings_in");
    expect(calls[0].args).toMatchObject({ p_sub: DC, p_soon: 2, p_auto: false });
    expect(d.settingsBySub?.[DC]).toEqual(st);
    expect(d.settings).toEqual(DEFAULT_CRM_SETTINGS);
  });

  it("save IR's as IR's — the CRM's own too", async () => {
    const st = { ...DEFAULT_CRM_SETTINGS, replySoonH: 4, replyUrgentH: 8, replyOverdueH: 12 };
    await actions(IR).saveSettings(st);
    expect(calls[0]).toMatchObject({ name: "crm_save_settings_in", args: { p_sub: IR } });
    expect(d.settings).toEqual(st);
  });

  it("save as before while the database names no sub-department (before the migration), or with no view", async () => {
    d = { ...d, scope: undefined };
    await actions(DC).saveSettings(DEFAULT_CRM_SETTINGS);
    await actions(DC).saveApptTypes([]);
    expect(calls.map(c => c.name)).toEqual(["crm_save_settings", "crm_save_appt_types"]);
    expect(calls[0].args).not.toHaveProperty("p_sub");
  });

  it("save DC's appointment types, a new showroom on DC's list and its draft as DC's own", async () => {
    const act = actions(DC);
    await act.saveApptTypes([{ id: "phone", label: "Phone", on: true, base: "place", fields: [] }]);
    expect(calls[0]).toMatchObject({ name: "crm_save_appt_types_in", args: { p_sub: DC } });
    expect(d.apptTypesBySub?.[DC]?.map(t => t.id)).toEqual(["phone"]);
    const id = await act.saveRoom({ id: null, name: "Skyline Embassy", active: true, address: "", slots: [], cap: 2, weekly: [], blocks: [] });
    expect(id).toBe("room-new");
    expect(calls[1]).toMatchObject({ name: "crm_save_showroom_full_in", args: { p_sub: DC, p_id: null } });
    expect(d.rooms.find(r => r.id === "room-new")?.sub).toBe(DC);
    await act.saveRoomDraft?.("new", { name: "Half typed" });
    expect(calls[2]).toMatchObject({ name: "crm_save_showroom_draft", args: { p_room: `new:${DC}` } });
    expect(d.roomDrafts?.[`new:${DC}`]?.draft).toEqual({ name: "Half typed" });
    // IR's new showroom keeps its 'new'.
    await actions(IR).saveRoomDraft?.("new", { name: "IR's" });
    expect(calls[3].args.p_room).toBe("new");
  });

  it("save a new template on DC's list, and import Meta's onto it", async () => {
    const act = actions(DC);
    const t = await act.saveTemplate({ id: null, name: "Hello", ch: "whatsapp", body: "Hi {name}" }, false);
    expect(calls[0]).toMatchObject({ name: "crm_save_template_in", args: { p_sub: DC, p_id: null } });
    expect(t && t.sub).toBe(DC);
    await act.importTemplates();
    expect(calls[1]).toEqual({ name: "importCrmTemplates", args: { sub: DC } });
  });
});
