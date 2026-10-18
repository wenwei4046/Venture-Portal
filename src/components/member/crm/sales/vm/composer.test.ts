import { describe, expect, it } from "vitest";
import {
  CATS, ICON, NAMES, PANEL_H, RECENT_MAX, TABS, TILES, afterSend, composerOf, dismiss, dropLast, emojiView, flash, focusBox, graphemes, homeBg, initialComposer,
  pickCat, pushRecent, recentList, toggleSearch, togglePanel, type ComposerState,
} from "./composer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// The chat composer handoff (docs/design/chat-composer, 2026-10-14): the prototype's logic class, as the app keeps it.
const PROTO = readFileSync(resolve(process.cwd(), "docs/design/chat-composer/prototypes/Chat Composer.dc.html"), "utf8");
const s0 = (p: Partial<ComposerState> = {}): ComposerState => ({ ...initialComposer(), ...p });

describe("the composer's content is the prototype's", () => {
  it("five emoji categories of 24, with the prototype's labels, icons and emoji", () => {
    expect(CATS.map(c => c[1])).toEqual(["Recents", "Smileys", "Gestures", "Home", "Symbols"]);
    for (const [id, label, icon, list] of CATS) {
      expect(graphemes(list)).toHaveLength(24);
      expect(PROTO).toContain(`['${id}', '${label}', '${icon === "hand" ? "hand" : icon}', '${list}']`);
    }
  });
  it("the search keywords, the icons and the Attach tiles, word for word", () => {
    for (const [k, e] of Object.entries(NAMES)) expect(PROTO).toMatch(new RegExp(`${k}: '${e}'`));
    for (const [k, d] of Object.entries(ICON)) if (k !== "send" && k !== "mic") expect(PROTO).toContain(`${k}: '${d}'`);
    expect(PROTO).toContain(`'${ICON.send}'`);
    expect(PROTO).toContain(`'${ICON.mic}'`);
    // 4a (2026-10-18): the tiles keep the prototype's colours as their --crm-* tokens (tools/crm-design/palette-4a.cjs)
    const palette = createRequire(import.meta.url)("../../../../../../tools/crm-design/palette-4a.cjs") as (s: string) => string;
    for (const [label, icon, color] of TILES) {
      const at = PROTO.indexOf(`['${label}', '${icon}', '#`);
      expect(at, label).toBeGreaterThan(-1);
      expect(palette(PROTO.slice(at, PROTO.indexOf("]", at) + 1))).toBe(`['${label}', '${icon}', '${color}']`);
    }
  });
  it("Emoji is the panel's one tab while GIF and Sticker wait (the owner, 2026-10-14)", () => {
    expect(TABS.map(t => t[1])).toEqual(["Emoji"]);
  });
  it("the keyboard area is 280 until a keyboard has been measured", () => {
    expect(PANEL_H).toBe(280);
  });
});

describe("Delete removes one character as a person sees it", () => {
  it("a plain letter, an emoji, a flag, a family, a skin tone — each whole", () => {
    expect(dropLast("Hi")).toBe("H");
    expect(dropLast("ok 👍")).toBe("ok ");
    expect(dropLast("Selamat 🇲🇾")).toBe("Selamat ");
    expect(dropLast("Home 👨‍👩‍👧‍👦")).toBe("Home ");
    expect(dropLast("👍🏽")).toBe("");
    expect(dropLast("")).toBe("");
  });
});

describe("Recents", () => {
  it("one's own first, then the design's set, 24 in all, each once", () => {
    const shown = recentList(["🛋️", "👍"]);
    expect(shown.slice(0, 2)).toEqual(["🛋️", "👍"]);
    expect(shown).toHaveLength(RECENT_MAX);
    expect(new Set(shown).size).toBe(shown.length);
    expect(recentList([])).toEqual(graphemes(CATS[0][3]));
  });
  it("a picked emoji goes first, once, and the list keeps 24", () => {
    expect(pushRecent(["😀", "👍"], "👍")).toEqual(["👍", "😀"]);
    const full = graphemes(CATS[1][3]);
    expect(pushRecent(full, "🛏️")).toHaveLength(24);
    expect(pushRecent(full, "🛏️")[0]).toBe("🛏️");
  });
});

describe("the emoji grid", () => {
  it("shows the category, Recents with one's own first", () => {
    expect(emojiView(s0({ ecat: "home" }), []).label).toBe("Home");
    expect(emojiView(s0({ ecat: "home" }), []).list[0]).toBe("🛏️");
    expect(emojiView(s0(), ["🚚"]).list[0]).toBe("🚚");
  });
  it("searches the English keywords, each emoji once; says so when none match", () => {
    expect(emojiView(s0({ searching: true, q: "bed" }), [])).toEqual({ label: "Results", list: ["🛏️"] });
    // "ha" is in chair, thank(s) and happy — in the keywords' order, thanks / thank one emoji.
    expect(emojiView(s0({ searching: true, q: "ha" }), []).list).toEqual(["🪑", "🙏", "😊"]);
    expect(emojiView(s0({ searching: true, q: " zzz " }), [])).toEqual({ label: "No emoji match “zzz”", list: [] });
    // An empty query is the category's grid.
    expect(emojiView(s0({ searching: true, q: "" }), []).label).toBe("Recents");
  });
});

describe("the prototype's state changes", () => {
  it("Sticker over the keyboard takes its place; tapped again, the keyboard comes back", () => {
    const up = s0({ kb: true });
    const open = togglePanel(up, "sticker");
    expect(open).toMatchObject({ panel: "sticker", kb: false, prevKb: true });
    expect(togglePanel(open, "sticker")).toMatchObject({ panel: null, kb: true });
  });
  it("Sticker with no keyboard brings the keyboard when closed (the prototype's)", () => {
    expect(togglePanel(togglePanel(s0(), "sticker"), "sticker")).toMatchObject({ panel: null, kb: true });
  });
  it("Attach brings the keyboard back only if it was up before", () => {
    expect(togglePanel(togglePanel(s0({ kb: true }), "attach"), "attach")).toMatchObject({ panel: null, kb: true });
    expect(togglePanel(togglePanel(s0(), "attach"), "attach")).toMatchObject({ panel: null, kb: false });
  });
  it("Sticker → Attach keeps what the keyboard was before the first", () => {
    const a = togglePanel(togglePanel(s0({ kb: true }), "sticker"), "attach");
    expect(a).toMatchObject({ panel: "attach", prevKb: true });
    expect(togglePanel(a, "attach")).toMatchObject({ panel: null, kb: true });
  });
  it("the reply box focused: keyboard up, panel gone; the list tapped: everything closes", () => {
    expect(focusBox(s0({ panel: "sticker" }))).toMatchObject({ kb: true, panel: null });
    expect(dismiss(s0({ panel: "attach", kb: true, prevKb: true }))).toMatchObject({ kb: false, panel: null, prevKb: false });
  });
  it("sent: the Sticker panel stays, Attach closes; a toast closes everything", () => {
    expect(afterSend(s0({ panel: "sticker" })).panel).toBe("sticker");
    expect(afterSend(s0({ panel: "attach" })).panel).toBeNull();
    expect(flash(s0({ panel: "sticker", kb: true }), "Hold to record a voice note")).toMatchObject({ toast: "Hold to record a voice note", panel: null, kb: false });
  });
  it("search toggles with an empty query; picking a category ends it", () => {
    expect(toggleSearch(s0({ q: "x" }))).toMatchObject({ searching: true, q: "" });
    expect(pickCat(s0({ searching: true, q: "bed" }), "home")).toMatchObject({ ecat: "home", searching: false, q: "" });
  });
  it("the strip takes the colour of what is above it", () => {
    expect([homeBg("sticker"), homeBg("attach"), homeBg(null)]).toEqual(["#fff", "var(--crm-page)", "transparent"]);
  });
  it("a chat's composer state is its own: another chat (reached any way) opens with nothing open", () => {
    const a = { ...s0({ panel: "sticker", searching: true, q: "bed" }), chat: "lead-a" };
    expect(composerOf(a, "lead-a")).toBe(a);
    expect(composerOf(a, "lead-b")).toBeNull();
    expect(composerOf(null, "lead-a")).toBeNull();
    expect(composerOf(undefined, "lead-a")).toBeNull();
  });
});

describe("Attach floats over the chat (2026-10-15)", () => {
  it("opened while typing, it leaves the keyboard up — the bar and the chat do not move", async () => {
    const { togglePanel: t } = await import("./composer");
    const typing = { panel: null, kb: true, prevKb: false, searching: false, q: "", ecat: "recent", toast: "" } as Parameters<typeof t>[0];
    const open = t(typing, "attach");
    expect(open).toMatchObject({ panel: "attach", kb: true });
    expect(t(open, "attach")).toMatchObject({ panel: null, kb: true });
  });
});
