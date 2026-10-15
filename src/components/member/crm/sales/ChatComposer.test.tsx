import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";
import { HOLD_HINT, ICON } from "./vm/composer";

// The chat composer (the owner's Claude Design handoff "Typing bar UI mobile chat design", 2026-10-14 —
// docs/design/chat-composer) in the salesperson's chat, on the demo's data as /member/preview draws it: the One pill
// typing bar, the Sticker panel (Emoji — GIF and Sticker are not live), the Attach panel, the mic held to record.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
const voice = vi.hoisted(() => ({ start: vi.fn(async () => null as string | null), stop: vi.fn(async () => new File(["x"], "Voice note.m4a", { type: "audio/mp4" })), cancel: vi.fn() }));
vi.mock("../shared/voice", async importOriginal => ({
  ...(await importOriginal<typeof import("../shared/voice")>()),
  startVoice: voice.start, stopVoice: voice.stop, cancelVoice: voice.cancel,
}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); voice.start.mockClear(); voice.stop.mockClear(); voice.cancel.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.history.replaceState({}, "", "/"); });

/** The demo salesperson's chat with Lim Wei Jie (l3), opened as a tapped notice opens it. */
async function openChat() {
  window.history.replaceState({}, "", "/member/preview");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} open={{ chat: "l3" }} />);
  await act(async () => {});
}
const composer = () => document.querySelector<HTMLElement>("[data-composer]")!;
const box = () => composer().querySelector("textarea")!;
const byTitle = (t: string) => composer().querySelector<HTMLElement>(`[title="${t}"]`);
const iconOf = (el: Element | null) => el?.querySelector("path")?.getAttribute("d");
async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}
async function type(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  await act(async () => {});
}
const emojiCells = () => [...composer().querySelectorAll<HTMLElement>('div[style*="repeat(8"] > span')];

describe("the typing bar", () => {
  it("is one pill: Sticker, the reply box, Attach and Camera; the main button is the mic", async () => {
    await openChat();
    expect(screen.getByText("Lim Wei Jie")).toBeInTheDocument();
    expect(box()).toHaveAttribute("placeholder", "Reply to Lim…");
    expect(box()).toHaveAttribute("data-draft", "1");
    for (const t of ["Sticker", "Attach", "Camera", "Voice note"]) expect(byTitle(t)).not.toBeNull();
    expect(iconOf(byTitle("Voice note"))).toBe(ICON.mic);
    expect(iconOf(byTitle("Sticker"))).toBe(ICON.stk);
    // No + button, no emoji sheet, no attach sheet of the old composer.
    expect(screen.queryByText("EMOJI")).toBeNull();
    expect(byTitle("Emoji")).toBeNull();
  });

  it("typing keeps Attach and Camera and the mic becomes Send; Send sends and empties the box", async () => {
    await openChat();
    await type("See you Sunday 11am");
    expect(byTitle("Attach")).not.toBeNull();
    expect(byTitle("Camera")).not.toBeNull();
    expect(iconOf(byTitle("Send"))).toBe(ICON.send);
    await tap(byTitle("Send"));
    expect(screen.getByText("See you Sunday 11am")).toBeInTheDocument();
    expect(box().value).toBe("");
    expect(byTitle("Voice note")).not.toBeNull();
    // Words of spaces only are no message.
    await type("   ");
    expect(byTitle("Send")).toBeNull();
  });

  it("the chat's own rows come with it: \"/\" shows the quick replies above the bar, with Edit (the chat's page for them)", async () => {
    await openChat();
    await type("/");
    expect(composer().textContent).toContain("Quick replies");
    expect([...composer().querySelectorAll("span")].some(s => s.textContent === "Edit")).toBe(true);
  });
});

describe("the Sticker panel", () => {
  it("opens in the keyboard's place on Emoji's Recents, its toggle the keyboard icon; tapped again it closes", async () => {
    await openChat();
    await tap(byTitle("Sticker"));
    expect(iconOf(byTitle("Sticker"))).toBe(ICON.kb);
    expect(composer().textContent).toContain("Emoji");
    expect(composer().textContent).not.toContain("GIF");
    expect(composer().textContent).toContain("Recents");
    expect(emojiCells()).toHaveLength(24);
    expect(composer().querySelector('[data-panel]')).toHaveStyle({ height: "280px" });
    await tap(byTitle("Sticker"));
    expect(composer().querySelector("[data-panel]")).toBeNull();
    expect(iconOf(byTitle("Sticker"))).toBe(ICON.stk);
  });

  it("a tapped emoji goes into the reply and first into Recents; Delete takes one emoji off whole", async () => {
    await openChat();
    await type("Ok");
    await tap(byTitle("Sticker"));
    await tap(byTitle("Home"));
    expect(composer().textContent).toContain("Home");
    await tap(emojiCells()[1]); // 🛋️
    expect(box().value).toBe("Ok🛋️");
    await tap(byTitle("Delete"));
    expect(box().value).toBe("Ok");
    await tap(byTitle("Recents"));
    expect(emojiCells()[0].textContent).toBe("🛋️");
  });

  it("searches emoji by English words; a category ends the search", async () => {
    await openChat();
    await tap(byTitle("Sticker"));
    await tap(byTitle("Search"));
    const search = composer().querySelector("input")!;
    expect(search).toHaveAttribute("placeholder", "Search emoji");
    fireEvent.change(search, { target: { value: "bed" } });
    await act(async () => {});
    expect(composer().textContent).toContain("Results");
    expect(emojiCells().map(c => c.textContent)).toEqual(["🛏️"]);
    fireEvent.change(search, { target: { value: "zzz" } });
    await act(async () => {});
    expect(composer().textContent).toContain("No emoji match “zzz”");
    await tap(byTitle("Symbols"));
    expect(composer().querySelector("input")).toBeNull();
    expect(composer().textContent).toContain("Symbols");
  });

  it("stays open after a send; a tap on the messages closes it", async () => {
    await openChat();
    await type("Thanks");
    await tap(byTitle("Sticker"));
    await tap(byTitle("Send"));
    expect(composer().querySelector("[data-panel]")).not.toBeNull();
    await tap(document.querySelector("[data-chat-list]"));
    expect(composer().querySelector("[data-panel]")).toBeNull();
  });
});

describe("the Attach panel", () => {
  it("holds Photos, Document, Quick replies and Auto replies — the CRM's own", async () => {
    await openChat();
    await tap(byTitle("Attach"));
    const panel = composer().querySelector<HTMLElement>("[data-attach]")!;
    expect([...panel.querySelectorAll(":scope > div > span")].map(t => t.textContent)).toEqual(["Photos", "Document", "Quick replies", "Auto replies"]);
    // A card floating over the chat, as tall as its tiles (2026-10-15): not the keyboard's height, not in the stack's flow.
    expect(panel.style.position).toBe("absolute");
    expect(panel.style.height).toBe("");
    expect(composer().querySelector("[data-panel]")).toBeNull();
    expect(iconOf(byTitle("Attach"))).not.toBeUndefined();
    const photo = document.getElementById("crm-pick-photo")!, click = vi.spyOn(photo, "click");
    await tap(screen.getByText("Photos"));
    expect(click).toHaveBeenCalledTimes(1);
    expect(composer().querySelector("[data-panel]")).toBeNull();
    await tap(byTitle("Attach"));
    await tap(screen.getByText("Quick replies"));
    expect(screen.getByRole("heading", { name: "Quick replies" })).toBeInTheDocument();
  });

  it("Camera opens the camera picker", async () => {
    await openChat();
    const cam = document.getElementById("crm-pick-camera")!, click = vi.spyOn(cam, "click");
    await tap(byTitle("Camera"));
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("the mic is held to record", () => {
  it("a tap says so (the prototype's toast) and sends nothing — the microphone starts at the press and its take is dropped", async () => {
    await openChat();
    fireEvent.pointerDown(byTitle("Voice note")!);
    fireEvent.pointerUp(window);
    await act(async () => {});
    expect(screen.getByText(HOLD_HINT)).toBeInTheDocument();
    expect(voice.start).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
  });

  it("slid left past the line while held, it is thrown away there and then (2026-10-15)", async () => {
    await openChat();
    fireEvent.pointerDown(byTitle("Voice note")!, { clientX: 300 });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(composer().textContent).toContain("Slide to cancel");
    fireEvent.pointerMove(window, { clientX: 250 });
    expect(voice.cancel).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 150 });
    await act(async () => {});
    expect(voice.cancel).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(window, { clientX: 150 });
    await act(async () => {});
    expect(voice.stop).not.toHaveBeenCalled();
  });

  it("held, it records; let go and the voice note goes", async () => {
    await openChat();
    const mic = byTitle("Voice note")!;
    fireEvent.pointerDown(mic);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(voice.start).toHaveBeenCalledTimes(1);
    expect(composer().textContent).toContain("Slide to cancel");
    // The main button is the same element under the finger, now Send.
    expect(byTitle("Send voice note")).toBe(mic);
    await act(async () => { await new Promise(r => setTimeout(r, 750)); });
    fireEvent.pointerUp(window, { clientX: 300 });
    await act(async () => {});
    expect(voice.stop).toHaveBeenCalledTimes(1);
    expect(voice.cancel).not.toHaveBeenCalled();
  });

  it("let go on the bin, it is thrown away", async () => {
    await openChat();
    fireEvent.pointerDown(byTitle("Voice note")!);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(byTitle("Cancel")).not.toBeNull();
    fireEvent.pointerUp(window, { clientX: 0 });
    await act(async () => {});
    expect(voice.cancel).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
  });

  it("the click a browser sends right after the release is not a second send", async () => {
    await openChat();
    const mic = byTitle("Voice note")!;
    fireEvent.pointerDown(mic);
    await act(async () => { await new Promise(r => setTimeout(r, 1050)); });
    // In one go, before React draws again: the click still finds the recording's Send.
    act(() => {
      fireEvent.pointerUp(window, { clientX: 300 });
      fireEvent.click(mic);
    });
    await act(async () => {});
    expect(voice.stop).toHaveBeenCalledTimes(1);
  });

  it("the bin tapped (the release lost) throws it away and ends the press: the next press records again", async () => {
    await openChat();
    fireEvent.pointerDown(byTitle("Voice note")!);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await tap(byTitle("Cancel"));
    expect(voice.cancel).toHaveBeenCalledTimes(1);
    // The lost release, arriving late, belongs to a press that is over.
    fireEvent.pointerUp(window, { clientX: 300 });
    await act(async () => {});
    expect(voice.stop).not.toHaveBeenCalled();
    expect(screen.queryByText(HOLD_HINT)).toBeNull();
    fireEvent.pointerDown(byTitle("Voice note")!);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(voice.start).toHaveBeenCalledTimes(2);
    expect(composer().textContent).toContain("Slide to cancel");
  });

  it("leaving the chat while recording turns the microphone off", async () => {
    await openChat();
    fireEvent.pointerDown(byTitle("Voice note")!);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await tap(document.querySelector('[data-chat-head] span[style*="width: 40px"]'));
    expect(document.querySelector("[data-composer]")).toBeNull();
    expect(voice.cancel).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
  });
});

describe("the keyboard", () => {
  it("stays the reply box's when the window itself loses focus (another app, another window)", async () => {
    await openChat();
    await act(async () => { box().focus(); });
    expect(document.activeElement).toBe(box());
    // The box's blur while it is still the focused element: the window lost focus, not the box.
    fireEvent.blur(box());
    await act(async () => {});
    expect(document.activeElement).toBe(box());
  });
});

describe("the iPhone's keyboard (the owner's kbdebug, 2026-10-15: inner 390, vv 390 at top 403, client 793)", () => {
  function phone(kbUp: boolean) {
    const vv = Object.assign(new EventTarget(), { height: kbUp ? 390 : 793, offsetTop: kbUp ? 403 : 0, scale: 1, width: 393 });
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: kbUp ? 390 : 793 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 393 });
    Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 793 });
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)" });
    return vv;
  }
  const app = () => composer().closest<HTMLElement>("[data-revenue-app]")!;
  afterEach(() => {
    for (const k of ["innerHeight", "innerWidth"] as const) delete (window as unknown as Record<string, unknown>)[k];
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    delete (navigator as unknown as Record<string, unknown>).userAgent;
  });

  it("fits the screen to the keyboard from the page's full height, its top following the page's pan", async () => {
    const vv = phone(false);
    await openChat();
    box().focus();
    Object.assign(vv, { height: 390, offsetTop: 403 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 390 });
    await act(async () => { vv.dispatchEvent(new Event("resize")); });
    expect(app().style.top).toBe("403px");
    expect(app().style.bottom).toBe("0px");
  });

  it("still sees the keyboard when the chat is drawn with it already up", async () => {
    phone(true);
    await openChat();
    box().focus();
    await act(async () => { window.visualViewport!.dispatchEvent(new Event("resize")); });
    expect(app().style.bottom).toBe("0px");
    expect(app().style.top).toBe("403px");
  });
});

describe("the iPhone's screen drawn away from what is visible", () => {
  it("is moved back to the top of what is visible", async () => {
    const vv = Object.assign(new EventTarget(), { height: 793, offsetTop: 0, scale: 1, width: 393 });
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 793 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 393 });
    Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 793 });
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)" });
    await openChat();
    const app = composer().closest<HTMLElement>("[data-revenue-app]")!;
    // The phone draws the screen 403px above what is visible whatever its top says (the second kbdebug).
    app.getBoundingClientRect = () => ({ top: app.style.top === "403px" ? -403 : 0 } as DOMRect);
    box().focus();
    Object.assign(vv, { height: 390, offsetTop: 403 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 390 });
    await act(async () => { vv.dispatchEvent(new Event("resize")); });
    expect(app.style.top).toBe("806px");
    expect(app.style.bottom).toBe("-403px");
    for (const k of ["innerHeight", "innerWidth"] as const) delete (window as unknown as Record<string, unknown>)[k];
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    delete (navigator as unknown as Record<string, unknown>).userAgent;
  });
});
