import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";
import { HOLD_HINT, ICON } from "../sales/vm/composer";

// The Team side's chat (the Control panel — the Principal and the Director answer someone's customer here) has Mine's
// composer and header (the owner, 2026-10-15: "all need same, as new version"; docs/design/chat-composer). On the demo's
// data as /member/preview draws it, the Principal ("boss") opening a salesperson's customer from a notice.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
const voice = vi.hoisted(() => ({ start: vi.fn(async () => null as string | null), stop: vi.fn(async () => new File(["x"], "Voice note.m4a", { type: "audio/mp4" })), cancel: vi.fn() }));
vi.mock("../shared/voice", async importOriginal => ({
  ...(await importOriginal<typeof import("../shared/voice")>()),
  startVoice: voice.start, stopVoice: voice.stop, cancelVoice: voice.cancel,
}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); voice.start.mockClear(); voice.stop.mockClear(); voice.cancel.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

/** The Principal in the Team chat of a demo salesperson's customer, opened from Team's Inbox as a person would: Lim Wei
 *  Jie (WhatsApp, wrote 20 min ago), or Rajesh Kumar (WhatsApp, last wrote three days ago — cold). (A notice's `open`
 *  would not do: the demo's eyes become the Principal's only after the first paint.) */
async function openTeamChat(name = "Lim Wei Jie") {
  window.history.replaceState({}, "", "/member/preview?crmAs=boss");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
  await tap(screen.getAllByText("Inbox", { exact: true }).find(e => e.closest("nav")) ?? null);
  // The board shows one status at a time (2026-10-24): step through the status tabs to the customer.
  const tabs = [...document.querySelectorAll<HTMLElement>("span")].filter(e => e.style.borderBottom && /^(New|Attention|Follow up|Appointment|Won|Lost|Cold leads)/.test(e.textContent ?? ""));
  for (const t of tabs) { if (screen.queryAllByText(name, { exact: true }).length) break; await tap(t); }
  await tap(screen.getAllByText(name, { exact: true })[0]);
  expect(document.querySelector('main[data-chat-screen] [title="Back to Inbox"]')).not.toBeNull();
}
const head = () => document.querySelector<HTMLElement>("main[data-chat-screen] [data-chat-head]")!;
const composer = () => document.querySelector<HTMLElement>("main[data-chat-screen] [data-composer]")!;
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

/** The board shows one status at a time (2026-10-24): step through the status tabs until `name` shows. */
async function toCustomer(name: string) {
  const tabs = [...document.querySelectorAll<HTMLElement>("span")].filter(e => e.style.borderBottom && /^(New|Attention|Follow up|Appointment|Won|Lost|Cold leads)/.test(e.textContent ?? ""));
  for (const t of tabs) { if (screen.queryAllByText(name, { exact: true }).length) break; fireEvent.click(t); await act(async () => {}); }
}

describe("the Team chat is Mine's", () => {
  it("the header (4a, M04): back and ⋮ with no ring, no dot on the avatar, whose customer it is under the row, the status strip", async () => {
    await openTeamChat();
    expect(head()).not.toBeNull();
    expect(head().textContent).toContain("Lim Wei Jie");
    expect(head().textContent).toContain("'s customer");
    const back = head().querySelector<HTMLElement>('[title="Back to Inbox"]')!;
    expect(back.style.border).toBe("");
    expect(back.querySelector("svg")).toHaveAttribute("width", "24");
    expect(head().querySelector<HTMLElement>('[title="More"]')!.style.border).toBe("");
    // 4a: the avatar has no channel dot (the channel is in the line under the name), and the status strip closes the header.
    expect(head().querySelector('[title="WhatsApp"]')!.children.length).toBe(1);
    expect(head().querySelector("[data-chat-strip]")).not.toBeNull();
    // The list runs under the header and the composer.
    expect(document.querySelector<HTMLElement>("main[data-chat-screen] [data-chat-list]")).toHaveStyle({ position: "absolute" });
  });

  it("one pill: Sticker, the reply box, Attach and Camera, the mic; the old +, emoji button and sheet are gone", async () => {
    await openTeamChat();
    expect(box()).toHaveAttribute("placeholder", "Reply to Lim…");
    for (const t of ["Sticker", "Attach", "Camera", "Voice note"]) expect(byTitle(t)).not.toBeNull();
    expect(iconOf(byTitle("Voice note"))).toBe(ICON.mic);
    expect(document.querySelector('[title="Send a file"]')).toBeNull();
    expect(document.querySelector('[title="Emoji"]')).toBeNull();
    expect(screen.queryByText("EMOJI")).toBeNull();
  });

  it("typing keeps Attach and Camera and the mic becomes Send; Send sends and empties the box", async () => {
    await openTeamChat();
    await type("Sunday 11am is fine");
    expect(byTitle("Attach")).not.toBeNull();
    expect(iconOf(byTitle("Send"))).toBe(ICON.send);
    await tap(byTitle("Send"));
    expect(screen.getByText("Sunday 11am is fine")).toBeInTheDocument();
    expect(box().value).toBe("");
  });

  it("the Sticker panel: an emoji into the reply and first into Recents; Delete takes it off whole", async () => {
    await openTeamChat();
    await tap(byTitle("Sticker"));
    expect(composer().querySelector("[data-panel]")).not.toBeNull();
    expect(iconOf(byTitle("Sticker"))).toBe(ICON.kb);
    expect(composer().textContent).not.toContain("GIF");
    await tap(byTitle("Home"));
    await tap(emojiCells()[0]); // 🛏️
    expect(box().value).toBe("🛏️");
    await tap(byTitle("Delete"));
    expect(box().value).toBe("");
    await tap(byTitle("Recents"));
    expect(emojiCells()[0].textContent).toBe("🛏️");
  });

  it("Attach: Photos opens the photo picker; Suggest reply (Auto replies' place since 2026-10-29) opens the suggested replies", async () => {
    await openTeamChat();
    await tap(byTitle("Attach"));
    const panel = composer().querySelector<HTMLElement>("[data-attach]")!;
    expect([...panel.querySelectorAll(":scope > div > span")].map(t => t.textContent)).toEqual(["Photos", "Document", "Quick replies", "Suggest reply"]);
    const photo = document.getElementById("crm-panel-photo")!, click = vi.spyOn(photo, "click");
    await tap(screen.getByText("Photos"));
    expect(click).toHaveBeenCalledTimes(1);
    expect(composer().querySelector("[data-attach]")).toBeNull();
    await tap(byTitle("Attach"));
    await tap(screen.getByText("Suggest reply"));
    const sheet = screen.getByRole("dialog", { name: "Suggested replies" });
    expect(sheet.textContent).toContain("Suggested replies");
    const cam = document.getElementById("crm-panel-camera")!, camClick = vi.spyOn(cam, "click");
    await tap(screen.getByRole("button", { name: "Close" }));
    await tap(byTitle("Camera"));
    expect(camClick).toHaveBeenCalledTimes(1);
  });

  it('"/" lists the quick replies — no Edit here (that page is Mine\'s)', async () => {
    await openTeamChat();
    await type("/");
    expect(composer().textContent).toContain("Quick replies");
    expect([...composer().querySelectorAll("span")].some(s => s.textContent === "Edit")).toBe(false);
  });

  it("the mic is held to record: a tap says so; held and let go, the voice note goes", async () => {
    await openTeamChat();
    fireEvent.pointerDown(byTitle("Voice note")!);
    fireEvent.pointerUp(window);
    await act(async () => {});
    expect(screen.getByText(HOLD_HINT)).toBeInTheDocument();
    // The microphone starts at the press (2026-10-15); a tap's take is dropped, never sent.
    expect(voice.start).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
    const mic = byTitle("Voice note")!;
    fireEvent.pointerDown(mic);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(voice.start).toHaveBeenCalledTimes(2);
    expect(composer().textContent).toContain("Slide to cancel");
    expect(byTitle("Send voice note")).toBe(mic);
    await act(async () => { await new Promise(r => setTimeout(r, 750)); });
    fireEvent.pointerUp(window, { clientX: 300 });
    await act(async () => {});
    expect(voice.stop).toHaveBeenCalledTimes(1);
  });

  it("leaving the chat while recording turns the microphone off", async () => {
    await openTeamChat();
    fireEvent.pointerDown(byTitle("Voice note")!);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await tap(head().querySelector('[title="Back to Inbox"]'));
    expect(document.querySelector("[data-composer]")).toBeNull();
    expect(voice.cancel).toHaveBeenCalledTimes(1);
  });

  it("words typed in one chat stay in it: another chat opens with an empty box (as Mine's)", async () => {
    await openTeamChat();
    await type("For Lim only");
    await tap(head().querySelector('[title="Back to Inbox"]'));
    await toCustomer("Tan Mei Ling");
    await tap(screen.getAllByText("Tan Mei Ling", { exact: true })[0]);
    expect(box().value).toBe("");
    await tap(head().querySelector('[title="Back to Inbox"]'));
    await toCustomer("Lim Wei Jie");
    await tap(screen.getAllByText("Lim Wei Jie", { exact: true })[0]);
    expect(box().value).toBe("For Lim only");
  });

  it("a cold chat's templates are read each time: switched on in Profile, offered at once with the words each sends", async () => {
    await openTeamChat("Rajesh Kumar");
    const sendTemplate = () => tap([...composer().querySelectorAll("span")].find(s => s.textContent === "Send template message") ?? null);
    await sendTemplate();
    fireEvent.click(screen.getByRole("dialog", { name: "No templates switched on" }));
    await act(async () => {});
    await tap(head().querySelector('[title="Back to Inbox"]'));
    await tap(screen.getAllByText("Profile", { exact: true }).find(e => e.closest("nav")) ?? null);
    await tap(screen.getAllByText("Cold lead templates", { exact: true })[0]);
    await tap(document.querySelector('[title="Turn on"]'));
    await tap(screen.getAllByText("Inbox", { exact: true }).find(e => e.closest("nav")) ?? null);
    await tap(screen.getAllByText("Rajesh Kumar", { exact: true })[0]);
    await sendTemplate();
    const sheet = screen.getByRole("dialog", { name: "Send template message" });
    expect(sheet.textContent).toContain("Follow up visit");
    expect(sheet.textContent).toContain("Hi Rajesh, this is HOUZS.");
  });

  it("a cold chat: frame M08's card in the bar's place — This chat is cold, who last wrote, Send template message — as Mine's", async () => {
    await openTeamChat("Rajesh Kumar");
    expect(head().textContent).not.toContain("Cold lead ·");
    const card = composer().querySelector("[data-cold-card]");
    expect(card?.textContent).toContain("This chat is cold");
    expect(card?.textContent).toMatch(/^.*Rajesh last wrote .* ago. WhatsApp only lets an approved template open the chat again./);
    expect(composer().querySelector("textarea")).toBeNull();
    await tap([...composer().querySelectorAll("span")].find(s => s.textContent === "Send template message") ?? null);
    // The demo's templates are all off: the sheet says where they are switched on.
    expect(screen.getByRole("dialog", { name: "No templates switched on" })).toBeInTheDocument();
  });
});
