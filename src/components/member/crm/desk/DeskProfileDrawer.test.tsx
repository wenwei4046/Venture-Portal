import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeskProfileDrawer, type ProfileDrawerV } from "./DeskExtras";

const base = (save: ProfileDrawerV["save"], pageId = "p1"): ProfileDrawerV => ({
  key: "w1", title: "+60 18-907 9042 · Dream Crafter Design", waId: "123456", waLabel: "+60 18-907 9042", waName: "Dream Crafter Design",
  pageId, pageLabel: pageId ? "Dream Crafter Design" : "", photo: null, nameStatus: "APPROVED", can: true,
  init: { name: "Dream Crafter Design", about: "Interior design", description: "", address: "Lot 12", email: "a@b.my", website: "b.my", vertical: "OTHER" },
  synced: "Last synced 18 Oct, 9:02", close: () => {}, save,
});

describe("v2 09b · Business profile drawer", () => {
  it("sends both channels by default, with the number and Page, and says each answer — Retry on the one that failed", async () => {
    const save = vi.fn<ProfileDrawerV["save"]>()
      .mockResolvedValueOnce({ wa: { ok: true, nameInReview: false, photo: false }, page: { ok: false, error: "Meta refused: x" } })
      .mockResolvedValueOnce({ page: { ok: true } });
    render(<DeskProfileDrawer v={base(save)} verticals={[["OTHER", "Other"]]} />);
    fireEvent.click(screen.getByText("Save to WhatsApp & Facebook"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const fd = save.mock.calls[0][0];
    expect([fd.get("toWa"), fd.get("toPage"), fd.get("wa"), fd.get("page"), fd.get("about")]).toEqual(["1", "1", "123456", "p1", "Interior design"]);
    await screen.findByText("WhatsApp updated");
    fireEvent.click(await screen.findByText("Retry"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect([save.mock.calls[1][0].get("toWa"), save.mock.calls[1][0].get("toPage")]).toEqual(["", "1"]);
    await screen.findByText("Facebook Page updated");
  });
  it("a number with no Page saves to WhatsApp only", () => {
    render(<DeskProfileDrawer v={base(vi.fn(), "")} verticals={[["OTHER", "Other"]]} />);
    expect(screen.getByText("Save to WhatsApp")).toBeTruthy();
    expect(screen.getByText("No Page linked to this number")).toBeTruthy();
  });
});
