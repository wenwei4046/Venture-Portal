// v4 D5a (notes/24): the Inbox's list head — Search + Brand, People / Status each opening its own picker (several at once,
// "Show N chats"), the picked ones as tags, "N chats of M"; each row the same three lines.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DeskInboxList4a } from "./Desk4a";
import type { InboxFilterBits } from "./DeskMenuChip";

const filter = (over: Partial<InboxFilterBits> = {}): InboxFilterBits => ({
  peopleN: 0, statusN: 0, who: [], st: [],
  teams: [{ key: "t1", val: "team:t1", label: "Team Cyrus", dot: "red", n: 5, people: [{ id: "p1", label: "Cyrus Lim", n: 3 }, { id: "p2", label: "Amanda Koh", n: 2 }] }],
  statuses: [{ label: "Attention", dot: "orange", n: 2, hot: true }, { label: "Follow up", dot: "brown", n: 4, hot: false }],
  chips: [], shownN: 9, totalN: 9, count: (w, s) => 9 - w.length - s.length, apply: vi.fn(), clear: vi.fn(), ...over,
});
const row = { id: "c1", name: "Rajesh Kumar", ini: "RK", avBg: "x", avFg: "y", ch: "whatsapp" as const, ad: "Sofa Raya Sale", msg: "Photo", time: "Thu", unread: "3", dot: false, hot: true,
  owner: "Cyrus Lim", ownerDot: "brown", pinned: false, muted: false, sel: false, open: vi.fn(), tags: [{ t: "VIP", c: "brown" }],
  wait: { text: "9 h", icon: "triangle-alert" as const, color: "red" }, visit: "", cold: false, blocked: false };
const brandOpts = [{ label: "All", title: "All brands", n: 0, on: true, pick: vi.fn() }, { label: "The Conts", title: "The Conts", n: 2, on: false, pick: vi.fn() }];

describe("the Inbox's list (D5a)", () => {
  // 2026-11-11 (the owner: People and Status filtered separately): each button opens its own picker, and applying one
  // keeps what the other has applied.
  it("People opens the people picker alone and keeps the statuses applied", () => {
    const f = filter({ st: ["Attention"], statusN: 1 });
    render(<DeskInboxList4a v={{ brandOpts, list4: { q: "", setQ: () => {}, filter: f, rows: [row] } }} />);
    fireEvent.click(screen.getByRole("button", { name: /^People/ }));
    const dlg = screen.getByRole("dialog", { name: "Filter by people" });
    expect(within(dlg).queryByRole("button", { name: /Follow up/ })).toBeNull();
    fireEvent.click(within(dlg).getByRole("button", { name: /Team Cyrus/ }));
    // The team's people show under it once it is picked; a person narrows it to them.
    fireEvent.click(within(dlg).getByRole("button", { name: /Amanda Koh/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Show 7 chats" }));
    expect(f.apply).toHaveBeenCalledWith(["p2"], ["Attention"]);
  });
  it("Status opens the status picker alone; its Clear clears the statuses only", () => {
    const f = filter({ who: ["p1"], st: ["Attention"], peopleN: 1, statusN: 1 });
    render(<DeskInboxList4a v={{ brandOpts, list4: { q: "", setQ: () => {}, filter: f, rows: [row] } }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Status/ }));
    const dlg = screen.getByRole("dialog", { name: "Filter by status" });
    expect(within(dlg).queryByRole("button", { name: /Team Cyrus/ })).toBeNull();
    fireEvent.click(within(dlg).getByRole("button", { name: "Clear" }));
    fireEvent.click(within(dlg).getByRole("button", { name: /Follow up/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "Show 7 chats" }));
    expect(f.apply).toHaveBeenCalledWith(["p1"], ["Follow up"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("Brand is a menu beside Search; the row has the wait, owner · ad, the message and unread", () => {
    render(<DeskInboxList4a v={{ brandOpts, list4: { q: "", setQ: () => {}, filter: filter({ chips: [{ key: "st:Follow up", label: "Follow up", dot: "x", round: false, remove: vi.fn() }], statusN: 1, shownN: 3 }), rows: [row] } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Brand: All brands" }));
    fireEvent.click(screen.getByRole("option", { name: /The Conts/ }));
    expect(brandOpts[1].pick).toHaveBeenCalled();
    expect(screen.getByText("9 h")).toBeTruthy();
    expect(screen.getByText("Cyrus Lim")).toBeTruthy();
    expect(screen.getByText("Sofa Raya Sale")).toBeTruthy();
    expect(screen.getByText("VIP")).toBeTruthy();
    expect(screen.getByText("3 chats")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Follow up" })).toBeTruthy();
  });
});
