/**
 * The owner, 2026-11-04, a WhatsApp chat past its window with Attach open: "我在crm 没找到可以send cold template 的地方，帮我
 * suggest reply 改成cold" — the templates were only in the ⋮ menu. Past the window, Attach's tile 4 is Cold template
 * (Auto replies inside it since CRM v4, notes/09).
 */
import { describe, expect, it, vi } from "vitest";
import { SHUT_GREY, composerVM, initialComposer, type ComposerDom, type ComposerIn } from "./composer";

const anyFn = () => undefined;
/** Every field the composer reads; what a test does not name is a no-op. */
const loose = <T extends object>(o: Partial<T>): T => new Proxy(o, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : anyFn) }) as T;

function tilesFor(coldTile: boolean | undefined) {
  const openTpl = vi.fn(), tile = vi.fn();
  const v = loose<ComposerIn>({ key: "c1", state: initialComposer(), set: () => {}, placeholder: "", draft: "", canSend: false, warm: true,
    reply: null, slash: null, rec: null, recents: [], openTpl, tile, coldTile, tplOn: true });
  const d = loose<ComposerDom>({ taH: 20, panelH: 280, slide: 0, shown: null });
  return { tiles: composerVM(v, d).tiles, openTpl, tile };
}

describe("Attach past the window", () => {
  it("is Cold template, and it opens the templates", () => {
    const { tiles, openTpl, tile } = tilesFor(true);
    expect(tiles.map(t => t.label)).toEqual(["Photos", "Document", "Quick replies", "Cold template"]);
    tiles[3].go({} as never);
    expect(openTpl).toHaveBeenCalledOnce();
    expect(tile).not.toHaveBeenCalled();
  });
  it("inside the window it is Auto replies again (CRM v4 notes/09 — Suggest reply is gone)", () => {
    const { tiles, tile } = tilesFor(false);
    expect(tiles.map(t => t.label)).toEqual(["Photos", "Document", "Quick replies", "Auto replies"]);
    tiles[3].go({} as never);
    expect(tile).toHaveBeenCalledWith("Auto replies");
  });
});

/** CRM v4 notes/11 (frame 6a·2): a WhatsApp chat whose window is shut — the warning row, Send and the mic grey and inactive. */
function shutVM(o: Partial<ComposerIn>) {
  const send = vi.fn(), voiceStart = vi.fn(), mainDown = vi.fn(), recTap = vi.fn(), openTpl = vi.fn();
  const v = loose<ComposerIn>({ key: "c1", state: initialComposer(), set: () => {}, placeholder: "Reply to Ahmad…", draft: "", canSend: false, warm: true,
    reply: null, slash: null, rec: null, recents: [], openTpl, send, voiceStart, tplOn: true, waShut: undefined, msShut: undefined, ...o });
  const d = loose<ComposerDom>({ taH: 20, panelH: 280, slide: 0, shown: null, mainDown, recTap });
  return { p: composerVM(v, d), send, mainDown, openTpl };
}

describe("WhatsApp past its window (notes/11)", () => {
  it("shows the warning row with the first name from the moment the chat opens, and its Template opens the templates", () => {
    const { p, openTpl } = shutVM({ waShut: "Ahmad" });
    expect(p.warnOn).toBe(true);
    expect(p.warnText).toBe("WhatsApp won’t deliver this. After 24 h only a template reaches Ahmad.");
    expect(p.warnBtn).toBe(true);
    p.openTpl({} as never);
    expect(openTpl).toHaveBeenCalledOnce();
  });
  it("Send is grey and does nothing; the draft stays (typing is allowed)", () => {
    const { p, send } = shutVM({ waShut: "Ahmad", draft: "Ok I can arrange delivery on Saturday", canSend: true });
    expect(p.mainBg).toBe(SHUT_GREY);
    expect(p.mainCursor).toBe("default");
    p.mainAct({} as never);
    expect(send).not.toHaveBeenCalled();
    expect(p.draft).toBe("Ok I can arrange delivery on Saturday");
  });
  it("the mic is grey and cannot record", () => {
    const { p, mainDown } = shutVM({ waShut: "Ahmad" });
    expect(p.mainBg).toBe(SHUT_GREY);
    p.mainDown({} as never);
    expect(mainDown).not.toHaveBeenCalled();
  });
  it("Settings › Suggest a template off: the warning without the Template button", () => {
    const { p } = shutVM({ waShut: "Ahmad", tplOn: false });
    expect(p.warnOn).toBe(true);
    expect(p.warnBtn).toBe(false);
  });
  it("an open window (or Messenger) has no row, and Send is rust and sends", () => {
    const { p, send } = shutVM({ waShut: undefined, draft: "Hi", canSend: true });
    expect(p.warnOn).toBe(false);
    expect(p.mainBg).toBe("var(--crm-rust)");
    p.mainAct({} as never);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("Messenger past 7 days (the owner, 2026-11-10: \"messenger 超过7天的要有提示语，像 WA 超过24小时的那样\")", () => {
  it("the same row in Messenger's words, no Template button; Send grey and inactive, the draft kept", () => {
    const { p, send } = shutVM({ msShut: "Kah", draft: "Hi", canSend: true });
    expect(p.warnOn).toBe(true);
    expect(p.warnText).toBe("Messenger won’t deliver this. After 7 days only a new message from Kah reopens the chat.");
    expect(p.warnBtn).toBe(false);
    expect(p.mainBg).toBe(SHUT_GREY);
    p.mainAct({} as never);
    expect(send).not.toHaveBeenCalled();
    expect(p.draft).toBe("Hi");
  });
  it("past 7 days only, and Messenger only", async () => {
    const { messengerPast7 } = await import("./composer");
    const now = new Date("2026-11-10T00:00:00Z");
    expect(messengerPast7({ channel: "messenger", lastCustomerAt: "2026-11-02T23:00:00Z" }, now)).toBe(true);
    expect(messengerPast7({ channel: "messenger", lastCustomerAt: "2026-11-03T01:00:00Z" }, now)).toBe(false);
    expect(messengerPast7({ channel: "whatsapp", lastCustomerAt: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(messengerPast7({ channel: "messenger", lastCustomerAt: null }, now)).toBe(false);
  });
});
