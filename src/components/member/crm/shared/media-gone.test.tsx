/** A customer's file gone at Meta and never kept (2026-11-10): a quiet tile, no black box, no endless retries. */
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatImg, ChatVideo, RETRY_MS } from "./chat-media-parts";
import { VoiceNote } from "./voice-note";
import { askGone, forgetGone, goneWords, markGone } from "./media-gone";
import { mediaOf } from "./chat-media";

vi.mock("./media-cache", () => ({ useKeptSrc: (src: string, poster?: boolean) => ({ src: poster ? null : src, kept: false }), keepImage: () => {}, keepPoster: () => {} }));

afterEach(() => { forgetGone(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("the words", () => {
  it("names the file and why, by channel", () => {
    expect(goneWords("image", "whatsapp")).toEqual({ title: "Customer's photo no longer available", why: "WhatsApp keeps a customer's files 7 days" });
    expect(goneWords("video", "whatsapp").title).toBe("Customer's video no longer available");
    expect(goneWords("audio", "messenger")).toEqual({ title: "Customer's voice message no longer available", why: "Messenger's link to it has expired" });
    expect(goneWords("file", "whatsapp").title).toBe("Customer's file no longer available");
  });
});

describe("the tile", () => {
  it("a photo the chat's data says is gone is the tile at once, never fetched", () => {
    markGone("/member/crm-media/1", "whatsapp");
    const { container } = render(<ChatImg src="/member/crm-media/1" style={{ width: "100%", height: "200px" }} />);
    expect(container.querySelector("img")).toBeNull();
    const tile = container.querySelector("[data-media-gone='image']")!;
    expect(tile.textContent).toContain("Customer's photo no longer available");
    expect(tile.textContent).toContain("WhatsApp keeps a customer's files 7 days");
    // Colours only through the CRM's tokens.
    expect((tile as HTMLElement).style.background).toBe("var(--crm-field)");
  });

  it("a photo that fails to load asks HEAD once; a 410 turns it into the tile and the retries stop", async () => {
    const head = vi.fn(async () => new Response(null, { status: 410, headers: { "X-Media-Gone": "messenger" } }));
    vi.stubGlobal("fetch", head);
    const { container } = render(<ChatImg src="/member/crm-media/2" />);
    fireEvent.error(container.querySelector("img")!);
    await waitFor(() => expect(container.querySelector("[data-media-gone='image']")).not.toBeNull());
    expect(container.textContent).toContain("Messenger's link to it has expired");
    expect(head).toHaveBeenCalledWith("/member/crm-media/2", expect.objectContaining({ method: "HEAD", cache: "no-store" }));
  });

  it("a failure that is not 410 keeps retrying as before", async () => {
    vi.useFakeTimers();
    const head = vi.fn(async () => new Response(null, { status: 502 }));
    vi.stubGlobal("fetch", head);
    const { container } = render(<ChatImg src="/member/crm-media/3" />);
    fireEvent.error(container.querySelector("img")!);
    await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(RETRY_MS[0]); });
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/member/crm-media/3?r=1");
    expect(container.querySelector("[data-media-gone]")).toBeNull();
  });

  it("a video and a voice note gone are the tile too", () => {
    markGone("/member/crm-media/4", "whatsapp");
    markGone("/member/crm-media/5", "whatsapp");
    const v = render(<ChatVideo src="/member/crm-media/4#t=0.1" base="/member/crm-media/4" />);
    expect(v.container.querySelector("video")).toBeNull();
    expect(v.container.textContent).toContain("Customer's video no longer available");
    const a = render(<VoiceNote src="/member/crm-media/5" />);
    expect(a.container.querySelector("audio")).toBeNull();
    expect(a.container.textContent).toContain("Customer's voice message no longer available");
  });

  it("asks only our own route, once per file", async () => {
    const head = vi.fn(async () => new Response(null, { status: 410 }));
    vi.stubGlobal("fetch", head);
    expect(await askGone("blob:http://x/1")).toBeNull();
    await Promise.all([askGone("/member/crm-media/6?r=2"), askGone("/member/crm-media/6#t=0.1")]);
    expect(head).toHaveBeenCalledTimes(1);
  });
});

describe("mediaOf", () => {
  it("a plain document gone says so in its tile and opens nothing", () => {
    const m = mediaOf({ id: "7", from: "lead", media: { kind: "file", url: "/member/crm-media/7", name: "Floor plan.docx", gone: "whatsapp" } }, []);
    expect(m.docName).toBe("Customer's file no longer available · WhatsApp keeps a customer's files 7 days");
    expect(m.view).toBeUndefined();
  });

  it("our own voice note is never drawn gone, even if a gone verdict reaches it (2026-11-11)", () => {
    const m = mediaOf({ id: "9", from: "me", media: { kind: "audio", url: "/member/crm-media/9", gone: "whatsapp" } }, []);
    expect(m.aud).toBe("/member/crm-media/9");
    const { container } = render(<VoiceNote src="/member/crm-media/9" />);
    expect(container.querySelector("[data-media-gone]")).toBeNull();
    expect(container.querySelector("audio")).not.toBeNull();
  });

  it("a photo gone is marked for ChatImg", () => {
    mediaOf({ id: "8", from: "lead", media: { kind: "image", url: "/member/crm-media/8", gone: "messenger" } }, []);
    const { container } = render(<ChatImg src="/member/crm-media/8" />);
    expect(container.textContent).toContain("Customer's photo no longer available");
  });
});
