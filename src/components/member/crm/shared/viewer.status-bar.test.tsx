import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A photo or video opened from a chat holds the phone's status bar in the viewer's own black, as WhatsApp's (2026-10-18 —
// the owner, an iPhone's white bar over the black viewer, WhatsApp's beside it: "when open pic and video, top bar didnt
// same colour or full screen"). The bar itself is components/pwa/status-bar.ts (tested there).
vi.mock("./media-cache", () => ({ keepImage: () => {}, keptSrc: () => null, readyPhotos: async () => false }));

import { MediaViewer, openViewer } from "./viewer";
import { paintStatusBar } from "@/components/pwa/status-bar";

const bar = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;
beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  paintStatusBar("rgb(251, 247, 243)");
});
afterEach(() => { cleanup(); paintStatusBar(null); vi.unstubAllGlobals(); });

describe("the viewer and the phone's status bar", () => {
  it("is black while a photo or a video is open, and the chat's colour again once it closes", () => {
    render(<MediaViewer />);
    expect(bar()).toBe("rgb(251, 247, 243)");
    act(() => openViewer([{ kind: "image", url: "/m/a" }, { kind: "video", url: "/m/b" }], 0));
    expect(bar()).toBe("#000000");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(bar()).toBe("#000000");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bar()).toBe("rgb(251, 247, 243)");
  });

  it("a document's dark brown, its bar's own", () => {
    render(<MediaViewer />);
    act(() => openViewer([{ kind: "file", url: "/m/c", name: "Deck.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }], 0));
    expect(bar()).toBe("#201814");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bar()).toBe("rgb(251, 247, 243)");
  });
});
