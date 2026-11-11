// Showrooms › Key log (2026-11-11, the owner: "照片点了没反应" — a returned key's 📷 Photo did nothing): the photo opens in the
// viewer the chats use, and a failure on the way says so instead of nothing.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeskKeyLog } from "./DeskKeyLog";
import { keyLogVM } from "./vm/key-log";
import { MediaViewer } from "../shared/viewer";
import { initialDeskUi, type DeskCtx } from "./vm/ctx";

vi.mock("../shared/media-cache", () => ({ keepImage: () => {}, keptSrc: () => null, readyPhotos: async () => false }));

function setup(keyPhotoUrl: (p: string) => Promise<string | null>) {
  const toast = vi.fn();
  const data = { rooms: [{ id: "r1", name: "Astrum Ampang- S5315", keys: true }], customers: [{ id: "c1", name: "Wah Leong", assignedTo: "p1" }],
    visits: [{ id: "v1", customerId: "c1", showroomId: "r1", start: "2026-10-28T12:00:00Z", state: "attended", keyBack: { path: "c1/1793282374817-9tkrth.jpg", at: "2026-10-29T13:59:35Z", by: "p1" } }] };
  const ctx = { data, ui: initialDeskUi(), patch: vi.fn(), nameOf: () => "Chin Ying", act: { keyPhotoUrl: vi.fn(keyPhotoUrl), toast } } as unknown as DeskCtx;
  render(<><DeskKeyLog v={keyLogVM(ctx)} /><MediaViewer /></>);
  return { toast, act: ctx.act };
}

describe("Key log's Photo", () => {
  it("opens the returned key's photo in the viewer", async () => {
    const { act: a } = setup(async p => `/files/crm-media/${p}`);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Photo" })); });
    expect(a.keyPhotoUrl).toHaveBeenCalledWith("c1/1793282374817-9tkrth.jpg");
    await waitFor(() => expect(document.querySelector("img[alt='Photo']")?.getAttribute("src")).toBe("/files/crm-media/c1/1793282374817-9tkrth.jpg"));
  });

  it("a link that cannot be made says so", async () => {
    const { toast } = setup(async () => { throw new Error("offline"); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Photo" })); });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("The photo could not be opened."));
  });

  it("imports the viewer as every other photo does, never through its own chunk", () => {
    const src = readFileSync("src/components/member/crm/desk/vm/key-log.ts", "utf8");
    expect(src).toContain('import { openViewer } from "../../shared/viewer";');
    expect(src).not.toMatch(/import\(\s*["'][./]*shared\/viewer["']\s*\)/);
  });
});
