/**
 * The owner, 2026-11-04, a WhatsApp chat past its window with Attach open: "我在crm 没找到可以send cold template 的地方，帮我
 * suggest reply 改成cold" — the templates were only in the ⋮ menu. Past the window, Attach's Suggest reply is Cold template.
 */
import { describe, expect, it, vi } from "vitest";
import { composerVM, initialComposer, type ComposerDom, type ComposerIn } from "./composer";

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
  it("inside the window it is Suggest reply, as before", () => {
    const { tiles, tile } = tilesFor(false);
    expect(tiles[3].label).toBe("Suggest reply");
    tiles[3].go({} as never);
    expect(tile).toHaveBeenCalledWith("Suggest reply");
  });
});
