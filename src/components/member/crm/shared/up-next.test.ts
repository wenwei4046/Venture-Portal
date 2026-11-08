import { describe, expect, it } from "vitest";
import { UpNextDemo, demoBook, DEMO_ADS } from "./up-next-demo";
import { agoWords, fmtRange, leaveFormVM, leaveLabel, upNextFrame, type UpNextActs, type UpNextUi } from "./up-next";

const ui = (p: Partial<UpNextUi> = {}): UpNextUi => ({ ad: "all", adOpen: false, tip: false, pick: false, more: false, why: false, hov: null, sheet: null, ltab: "in", ...p });
const acts: UpNextActs = { set() {}, pickAd() {}, skip() {}, pause() {}, resume() {}, give() {}, unpin() {}, openLeave() {}, endLeave() {}, cancelLeave() {} };
const frame = (d: UpNextDemo, p: Partial<UpNextUi> = {}, canAct = true) => upNextFrame(d.read(p.ad ?? "all"), demoBook, DEMO_ADS, ui(p), acts, canAct);

describe("Up next's words (README › Screens)", () => {
  it("says the design's date ranges and leave labels", () => {
    expect(fmtRange("2026-11-05T09:00", "2026-11-08T18:00")).toBe("5 Nov 09:00 – 8 Nov 18:00");
    expect(fmtRange("2026-11-09T09:00", "2026-11-09T13:00")).toBe("9 Nov 09:00–13:00");
    expect(leaveLabel({ reason: "Sick" })).toBe("Sick leave");
    expect(leaveLabel({ reason: "Other", note: "Course" })).toBe("Course");
  });
  it("counts ago in minutes, hours and days", () => {
    expect(agoWords("2026-11-06T04:00:00Z", "2026-11-06T18:00")).toBe("6 h ago");
    expect(agoWords("2026-11-05T10:00:00Z", "2026-11-06T18:00")).toBe("1 d ago");
    expect(agoWords(null, "2026-11-06T18:00")).toBe("no lead yet");
  });
  it("draws the prototype's first screen", () => {
    const d = frame(new UpNextDemo());
    expect(d.adName).toBe("All ads");
    expect(d.first?.name).toBe("CHEA HUAN");
    expect(d.firstLine).toBe("Team Stanley");
    expect(d.chain.map(s => `#${s.k}`)).toEqual(["#2", "#3", "#4"]);
    expect(d.moreLabel).toBe("6 more");
    expect(d.last).toMatchObject({ name: "STANLEY", meta: "Team Stanley · 3 h ago · Raya Promo" });
    expect(d.splitLine).toBe("Each ad keeps its own split from Assignment. This view adds them together.");
    // Paused and on-leave first; Sick leave's range; the other reasons.
    expect(d.greyed[0]).toMatchObject({ name: "JASON", whyShort: "Sick leave · 5 Nov 09:00 – 8 Nov 18:00", whyMini: "Sick · to 8 Nov", canEnd: true });
    expect(d.greyed.map(g => g.whyShort)).toContain("not Full time today");
    expect(d.upcoming[0]).toMatchObject({ name: "CHEA HUAN", day: "9 Nov", label: "Annual leave", range: "9 Nov 09:00 – 10 Nov 13:00", short: "Annual · to 10 Nov" });
    expect(d.pickList[0].head).toBe("In today's turn");
  });
  it("says All ads are one pool when every ad is counted together, to the half percent", () => {
    const x = new UpNextDemo(), r = { ...x.read("all"), together: true, shares: { stanley: 40, alvin: 22.5, anthony: 37.5 } };
    const d = upNextFrame(r, demoBook, DEMO_ADS, ui(), acts, true);
    expect(d.splitLine).toBe("All ads counted together: Team Alvin 22.5% · Team Anthony 37.5% · Team Stanley 40% · set in Assignment");
  });
  it("swaps the team line for the reason on hover", () => {
    expect(frame(new UpNextDemo(), { why: true }).firstLine).toBe("Team Stanley · 40% · last lead 1 d ago");
  });
  it("names the split for one ad, and a team not on it", () => {
    const d = frame(new UpNextDemo(), { ad: "raya" });
    expect(d.splitLine).toBe("Split for this ad: Team Alvin 50% · Team Stanley 50% · set in Assignment");
    expect(d.greyed.map(g => g.whyShort)).toContain("team not on this ad");
    expect(d.pickList.some(p => p.head === "Outside this ad")).toBe(true);
    expect(d.last.meta).toBe("Team Stanley · 3 h ago");
  });
  it("a ticked leader acts on the people under them, never on themselves", () => {
    const r = { ...new UpNextDemo().read("all"), manage: false, canAct: true, me: "chea" };
    const d = upNextFrame(r, demoBook, DEMO_ADS, ui({ hov: "mchea" }), acts, true);
    expect(d.first).toMatchObject({ name: "CHEA HUAN", act: false });
    expect(d.inTurn.find(m => m.id === "chea")?.actDisp).toBe("none");
    expect(d.pickList.some(p => p.id === "chea")).toBe(false);
    expect(d.chain[0].act).toBe(true);
  });
  it("offers no action to somebody viewing", () => {
    const d = upNextFrame(new UpNextDemo().read("all"), demoBook, DEMO_ADS, ui({ hov: "mpeter" }), acts, false);
    expect(d.canAct).toBe(false);
    expect(d.inTurn.find(m => m.id === "peter")?.actDisp).toBe("none");
    expect(d.greyed.every(g => !g.canResume && !g.canEnd)).toBe(true);
  });
});

describe("Up next's behaviour on the demo (the same shapes as crm_up_next)", () => {
  it("Skip gives this one lead to the next person, who keeps their place", () => {
    const x = new UpNextDemo();
    const before = x.read("all").queue.map(q => q.staff);
    x.skip(before[0]);
    const after = x.read("all").queue.map(q => q.staff);
    expect(after[0]).toBe(before[1]);
    expect(after).toContain(before[0]);
  });
  it("Pause leaves the turn until Resume; Give to… pins one lead; Undo clears it", () => {
    const x = new UpNextDemo();
    x.pause("mei");
    expect(x.read("all").people.find(p => p.staff === "mei")?.why).toBe("paused");
    x.resume("mei");
    expect(x.read("all").people.find(p => p.staff === "mei")?.why).toBeNull();
    x.give("kumar");
    const d = upNextFrame(x.read("all"), demoBook, DEMO_ADS, ui(), acts, true);
    expect(d.first).toMatchObject({ name: "KUMAR", pinned: true, why: "Team Anthony · set by you" });
    x.undo();
    expect(x.read("all").queue[0].how).not.toBe("pinned");
  });
});

describe("the leave form", () => {
  const e = { id: "a", leaveId: null, from: "2026-11-06T09:00", to: "2026-11-06T18:00", reason: "Annual" as const, note: "" };
  it("From pushes To; half-hour times", () => {
    let got = {};
    const f = leaveFormVM(e, "A", p => { got = p; }, () => {}, () => {});
    f.setFD("2026-11-09");
    expect(got).toEqual({ from: "2026-11-09T09:00", to: "2026-11-09T18:00" });
    expect(f.times).toHaveLength(48);
    expect(f.times[1]).toBe("00:30");
    expect(f.reasons.map(r => r.label)).toEqual(["Annual", "Sick", "Training", "Other"]);
    expect(f.isOther).toBe(false);
  });
});
