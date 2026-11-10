/**
 * CRM redesign v4, desktop Insight (docs/design_handoff_crm_redesign_v4 notes/20–23): the period as one segmented control
 * with its dates (and Custom's calendar that really picks), the head shared by every tab, Up next's helpers, Team
 * activity following the head's period, and Ads performance's figures kept per user.
 */
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Desk4aHead, DeskAdsStrip } from "./Desk4a";
import type { Frame4a } from "./vm/frame4a";
import { heads4a } from "./vm/frame4a";
import { activityPeriod, insightDates, lastLeadAt, leadsToday } from "./vm/insight";
import { adsFiguresPref } from "./vm/adsperf";
import { lastLeadWords } from "./DeskUpNext";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx } from "./vm/ctx";

type Per = "day" | "week" | "month" | "custom";
/** The head as app.ts builds Insight's: the four periods, Custom opening the shared picker, Apply setting the range. */
function Head() {
  const [per, setPer] = useState<Per>("month"), [range, setRange] = useState<{ a: number; b: number } | null>(null), [pick, setPick] = useState(false);
  const now = new Date(2026, 10, 10, 9);
  const tabs = (["day", "week", "month", "custom"] as const).map((k, i) => ({ label: ["Today", "This week", "This month", "Custom"][i], on: per === k,
    pick: () => { if (k === "custom") { setPer("custom"); setPick(true); setRange(r => r ?? { a: new Date(2026, 10, 1).getTime(), b: now.getTime() }); } else { setPer(k); setRange(null); setPick(false); } } }));
  const r = per === "custom" && range ? range : { a: new Date(2026, 10, 1).getTime(), b: new Date(2026, 10, 30).getTime() };
  const head = { title: "Insight", tabs, seg: true, sub: insightDates(r), subTabs: [], cta: null,
    picker: pick ? { tab: "Custom", value: range, apply: (x: { a: number; b: number }) => { setPer("custom"); setRange(x); setPick(false); }, cancel: () => setPick(false) } : null };
  const f4 = { head, ownHead: false, addCust: null, alertsN: "", openAlerts: () => {}, bookPick: { open: false } } as unknown as Frame4a;
  return <Desk4aHead f4={f4} />;
}

describe("Insight's period (notes/20)", () => {
  it("is one segmented control, the picked one white, its dates in grey after it, no vs chip", () => {
    render(<Head />);
    const seg = screen.getByRole("group", { name: "Period" });
    expect(within(seg).getAllByRole("button").map(b => b.textContent)).toEqual(["Today", "This week", "This month", "Custom"]);
    const on = within(seg).getByRole("button", { name: "This month" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(on.style.background).toBe("#fff");
    expect(screen.getByText("1–30 Nov")).toBeInTheDocument();
    expect(screen.queryByText(/^vs /)).toBeNull();
  });

  it("Custom opens a calendar whose dates can be picked, and the dates follow", async () => {
    render(<Head />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Custom" })); });
    const dlg = screen.getByRole("dialog", { name: "Pick dates" });
    // Pick 3 → 6 Nov on the grid (each day a button with its number), then Apply.
    const day = (n: string) => within(dlg).getAllByRole("button").find(b => b.textContent === n && !(b as HTMLButtonElement).disabled)!;
    await act(async () => { fireEvent.click(day("3")); });
    await act(async () => { fireEvent.click(day("6")); });
    await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: "Apply" })); });
    expect(screen.queryByRole("dialog", { name: "Pick dates" })).toBeNull();
    expect(screen.getByText("3–6 Nov")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  });

  it("names one day with its weekday", () => {
    const t = new Date(2026, 10, 10).getTime();
    expect(insightDates({ a: t, b: t })).toBe("Tue 10 Nov");
    expect(insightDates({ a: new Date(2026, 10, 9).getTime(), b: new Date(2026, 10, 15).getTime() })).toBe("9–15 Nov");
  });

  it("every Insight tab has the same head: periods, dates, Export PDF — no vs chip", () => {
    const v = { periodOpts: [{ label: "Today", on: true, pick: () => {} }], insTabs: [], insightSub: "Tue 10 Nov", insightPdf: () => {}, insVs: { on: true, label: "vs 9 Nov", toggle: () => {} },
      listCards: [], opItem: "", calViews: [], calTitle: "", ppCount: 0, showroomCount: 0, auCount: 0, srPage: "rooms", sr4: { draftable: false }, at: {}, cfSummary: "", apDl: [], apDlOpen: false, apToggleDl: () => {} };
    for (const k of [{}, { kUpNext: true }, { kInsAct: true }]) {
      const h = heads4a({ data: { can: { editOwn: true } }, ui: {}, patch: () => {} } as unknown as DeskCtx, { ...v, ...k } as never).insight!;
      expect(h.seg).toBe(true);
      expect(h.tabs).toHaveLength(1);
      expect(h.sub).toBe("Tue 10 Nov");
      expect(h.cta?.label).toBe("Export PDF");
      expect(h.vs).toBeUndefined();
      expect(h.subSlot).toBeUndefined();
    }
  });
});

describe("Team activity follows the head's period (notes/22)", () => {
  const now = new Date(2026, 10, 10, 9);
  it("maps Today / This week / This month / Custom", () => {
    expect(activityPeriod({ insPer: "day", insRange: null }, now).per).toBe("Today");
    expect(activityPeriod({ insPer: "week", insRange: null }, now).per).toBe("Week");
    expect(activityPeriod({ insPer: "month", insRange: null }, now).per).toBe("Month");
    expect(activityPeriod({ insPer: "custom", insRange: { a: new Date(2026, 9, 3).getTime(), b: new Date(2026, 9, 18, 23, 59).getTime() } }, now))
      .toEqual({ per: "Custom", from: "2026-10-03", to: "2026-10-18" });
  });
});

describe("Up next's figures (notes/23)", () => {
  const ev = (to: string, at: string) => ({ id: 1, kind: "assigned" as const, customerId: "c", actor: null, owner: null, data: { to }, at });
  const d = { events: [ev("a", "2026-11-10T01:00:00Z"), ev("a", "2026-11-10T02:00:00Z"), ev("b", "2026-11-09T02:00:00Z"), { ...ev("a", "2026-11-10T03:00:00Z"), kind: "won" as const }] } as unknown as CrmData;
  it("counts each person's leads today, the office's day", () => {
    expect(leadsToday(d, new Date("2026-11-10T04:00:00Z"))).toEqual({ a: 2 });
  });
  it("finds each person's newest lead and writes it as D3a does", () => {
    const last = lastLeadAt(d.events);
    expect(last).toEqual({ a: "2026-11-10T02:00:00Z", b: "2026-11-09T02:00:00Z" });
    const now = new Date("2026-11-10T04:00:00Z");
    expect(lastLeadWords(last.a, now)).toBe("10:00");
    expect(lastLeadWords(last.b, now)).toBe("Yesterday");
    expect(lastLeadWords("2026-11-07T02:00:00Z", now)).toBe("Sat");
    expect(lastLeadWords("2026-10-20T02:00:00Z", now)).toBe("20 Oct");
    expect(lastLeadWords(null, now)).toBe("—");
  });
});

describe("Ads performance's figures (notes/21)", () => {
  it("reads the kept choice: known metrics only, six at most, folded unless kept open; none = today's five", () => {
    expect(adsFiguresPref(undefined)).toEqual({ figures: null, open: false });
    expect(adsFiguresPref({ figures: ["leads", "nope", "leads", "spend"], open: true })).toEqual({ figures: ["leads", "spend"], open: true });
    expect(adsFiguresPref({ figures: ["spend", "leads", "cpl", "appt", "impr", "reach", "clicks"] }).figures).toHaveLength(6);
    expect(adsFiguresPref({ figures: [], open: "yes" })).toEqual({ figures: null, open: false });
  });

  it("the strip: hover a figure for ×, + adds, Show chart opens", async () => {
    const remove = vi.fn(), add = vi.fn(), toggle = vi.fn();
    render(<DeskAdsStrip S={{ items: [{ key: "spend", label: "Spent", total: "RM 2,364.56", color: "red", remove }, { key: "leads", label: "Leads", total: "54", color: "blue", remove }], canAdd: true, add, open: false, toggle }} />);
    const x = screen.getByTitle("Remove Spent");
    expect(x.style.visibility).toBe("hidden");
    await act(async () => { fireEvent.mouseEnter(x.parentElement!); });
    expect(x.style.visibility).toBe("visible");
    await act(async () => { fireEvent.click(x); });
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add a figure" })); });
    expect(add).toHaveBeenCalled();
    const show = screen.getByRole("button", { name: /Show chart/ });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await act(async () => { fireEvent.click(show); });
    expect(toggle).toHaveBeenCalled();
  });
});
