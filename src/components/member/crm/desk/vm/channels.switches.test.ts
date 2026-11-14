// Channels › Connections: a Page's two switches (2026-11-14 — the owner: "如果我现在不想要让messanger 的客户进来crm",
// then "分成两个开关"). Messenger chats are kind 'page', Instant Form leads kind 'form' (mig 20261114120000); turning
// one off asks first and touches only its own kind; turning one on goes at once.
import { describe, expect, it, vi } from "vitest";
import type { MetaChannels } from "@/app/(member)/member/crm-channels-actions";
import { channelsVM } from "./channels";
import { initialDeskUi, type DeskCtx, type DeskUi } from "./ctx";

const PAGE = { id: "102351059576534", name: "The Conts Property Management", followers: null, about: "", phone: "", website: "", email: "", hours: null, picture: null, msgr: null };

function setup(links: MetaChannels["links"] = [], manage = true) {
  let ui: DeskUi = initialDeskUi();
  const setChannel = vi.fn(async () => true);
  const meta = { data: { pages: [PAGE], wa: [], templates: [], perms: [], lastEvent: null, links, set: { token: true, waba: true, pages: true } } as MetaChannels,
    loading: false, error: "", reload: vi.fn(), origin: "" };
  const ctx = {
    data: { can: { manage }, customers: [], templates: [] }, now: new Date("2026-11-14T10:00:00Z"), meta,
    get ui() { return ui; },
    set: (f: (u: DeskUi) => DeskUi) => { ui = f(ui); },
    patch: (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; },
    deskAct: { setChannel },
  } as unknown as DeskCtx;
  const vm = () => channelsVM(ctx);
  const row = () => vm().ch4.loose[0];
  return { vm, row, setChannel, ui: () => ui };
}

describe("a Page's two switches", () => {
  it("both on when Meta's Page has no row (linked by default)", () => {
    const { row } = setup();
    expect(row().switches.map(w => [w.label, w.on])).toEqual([["Messenger chats", true], ["Instant Form leads", true]]);
  });

  it("Messenger off asks first, then unlinks kind 'page' only", async () => {
    const { row, vm, setChannel } = setup();
    row().switches[0].toggle();
    expect(setChannel).not.toHaveBeenCalled();
    const dlg = vm().chDlg;
    expect(dlg.isUnlink).toBe(true);
    expect(dlg.title).toBe("Stop Messenger chats from The Conts Property Management?");
    expect(dlg.body).toContain("Instant Form leads keep coming in");
    dlg.confirm();
    expect(setChannel).toHaveBeenCalledWith("page", PAGE.id, PAGE.name, false, false);
  });

  it("Instant Form off unlinks kind 'form' only", () => {
    const { row, vm, setChannel } = setup();
    row().switches[1].toggle();
    const dlg = vm().chDlg;
    expect(dlg.title).toBe("Stop Instant Form leads from The Conts Property Management?");
    expect(dlg.body).toContain("Messenger chats keep coming in");
    dlg.confirm();
    expect(setChannel).toHaveBeenCalledWith("form", PAGE.id, PAGE.name, false, false);
  });

  it("each switch reads its own kind, and on goes at once", () => {
    const links = [{ kind: "page" as const, externalId: PAGE.id, name: PAGE.name, linked: false, isDefault: false, updatedAt: "" }];
    const { row, setChannel } = setup(links);
    expect(row().switches.map(w => w.on)).toEqual([false, true]);
    row().switches[0].toggle();
    expect(setChannel).toHaveBeenCalledWith("page", PAGE.id, PAGE.name, true, false);
  });

  it("without CRM · Manage the switches change nothing", () => {
    const { row, vm, setChannel } = setup([], false);
    expect(row().switches.every(w => !w.can)).toBe(true);
    row().switches[0].toggle();
    expect(vm().chDlg.isUnlink).toBe(false);
    expect(setChannel).not.toHaveBeenCalled();
  });
});
