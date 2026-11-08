/**
 * The preview's Up next (/member/preview, no database): the prototype's own sample people and simulated seq(), so the
 * preview can be laid over the design frame by frame. NEVER used on live — live is crm_up_next, the real dealer.
 */
import { DIRECTOR_KEY, type LeaveReason, type UpNextAd, type UpNextBook, type UpNextLeave, type UpNextRead, type UpNextWhy } from "./up-next";

const TEAMS = [
  { id: DIRECTOR_KEY, name: "Revenue Director", share: 10, dot: "var(--crm-ink)", members: ["peter"] },
  { id: "stanley", name: "Team Stanley", share: 40, dot: "var(--crm-orange)", members: ["chea", "stanley", "tjy"] },
  { id: "alvin", name: "Team Alvin", share: 30, dot: "var(--crm-amber)", members: ["alvin", "mei", "jason", "hector"] },
  { id: "anthony", name: "Team Anthony", share: 20, dot: "var(--crm-oxblood)", members: ["kumar", "anthony"] },
];
const P: Record<string, { name: string; ft: boolean; last?: string; locked?: boolean }> = {
  peter: { name: "PETER", ft: true, last: "5 h ago" }, stanley: { name: "STANLEY", ft: true, last: "3 h ago" }, chea: { name: "CHEA HUAN", ft: true, last: "1 d ago" },
  tjy: { name: "TAN JIN YANG", ft: false, last: "2 d ago" }, alvin: { name: "ALVIN", ft: true, last: "2 d ago" }, mei: { name: "MEI LING", ft: true, last: "6 h ago" },
  hector: { name: "HECTOR", ft: true, locked: true }, jason: { name: "JASON", ft: true, last: "3 d ago" }, anthony: { name: "ANTHONY", ft: false, last: "4 h ago" }, kumar: { name: "KUMAR", ft: true, last: "1 d ago" },
};
export const DEMO_ADS: (UpNextAd & { shares?: Record<string, number> })[] = [
  { id: "all", name: "All ads", sub: "" },
  { id: "raya", name: "Raya Promo", sub: "Facebook", shares: { stanley: 50, alvin: 50 } },
  { id: "ev", name: "EV Test Drive", sub: "Instagram", shares: { [DIRECTOR_KEY]: 20, stanley: 40, anthony: 40 } },
  { id: "trade", name: "Trade-in Week", sub: "Facebook", shares: { alvin: 60, anthony: 40 } },
  { id: "lead", name: "Lead form · Website", sub: "Form", shares: { [DIRECTOR_KEY]: 100 } },
];
const LAST: Record<string, [string, string, string?]> = { all: ["stanley", "3 h ago", "raya"], raya: ["stanley", "3 h ago"], ev: ["peter", "5 h ago"], trade: ["anthony", "4 h ago"], lead: ["peter", "1 d ago"] };
const NOW = "2026-11-06T18:00";
const ROT: Record<string, string[]> = { [DIRECTOR_KEY]: ["peter"], stanley: ["chea", "stanley"], alvin: ["alvin", "mei", "jason"], anthony: ["kumar"] };
const teamOf = (id: string) => TEAMS.find(t => t.members.includes(id))!;
// "3 h ago" back into an instant, so agoWords says what the prototype says.
const agoIso = (s: string | undefined) => { if (!s) return ""; const [n, u] = s.split(" "); return new Date(new Date(`${NOW}:00+08:00`).getTime() - Number(n) * (u === "h" ? 3_600_000 : 86_400_000)).toISOString(); };

export const demoBook: UpNextBook = {
  nameOf: id => P[id]?.name ?? "—",
  teamOf: key => { const t = TEAMS.find(x => x.id === key); return { name: t?.name ?? "", dot: t?.dot ?? "var(--crm-faint)" }; },
  adName: id => DEMO_ADS.find(a => a.id === id)?.name ?? "",
};

export class UpNextDemo {
  skipped: string[] = [];
  paused: string[] = [];
  pinned: string | null = null;
  leave: Record<string, Omit<UpNextLeave, "id">> = { jason: { from: "2026-11-05T09:00", to: "2026-11-08T18:00", reason: "Sick", note: "" }, chea: { from: "2026-11-09T09:00", to: "2026-11-10T13:00", reason: "Annual", note: "" } };
  private onLeave(id: string) { const l = this.leave[id]; return !!(l && l.from <= NOW && NOW <= l.to); }
  read(ad: string): UpNextRead {
    const def = DEMO_ADS.find(a => a.id === ad)!;
    const sh = (t: (typeof TEAMS)[number]) => (def.shares ? def.shares[t.id] ?? 0 : t.share);
    const act: Record<string, string[]> = {};
    TEAMS.forEach(t => { act[t.id] = ROT[t.id].filter(id => !this.paused.includes(id) && !this.onLeave(id)); });
    const live = TEAMS.filter(t => act[t.id].length && sh(t) > 0);
    const S = live.reduce((n, t) => n + sh(t), 0) || 1;
    const given: Record<string, number> = {}, ptr: Record<string, number> = {};
    live.forEach(t => { given[t.id] = 0; ptr[t.id] = 0; });
    const out: UpNextRead["queue"] = [];
    if (this.pinned) out.push({ staff: this.pinned, team: teamOf(this.pinned).id, how: "pinned", pinBy: null, ad });
    let c = 0;
    while (out.length < 10 + this.skipped.length && live.length) {
      c++;
      let best = live[0], bv = -1e9;
      live.forEach(t => { const v = (sh(t) / S) * c - given[t.id]; if (v > bv + 1e-9) { bv = v; best = t; } });
      given[best.id]++;
      const arr = act[best.id];
      out.push({ staff: arr[ptr[best.id] % arr.length], team: best.id, how: "share", pinBy: null, ad });
      ptr[best.id]++;
    }
    this.skipped.forEach(sid => { const i = out.findIndex(o => o.staff === sid && o.how !== "pinned"); if (i >= 0) out.splice(i, 1); });
    out.length = Math.min(out.length, 10);
    const whyOf = (id: string): UpNextWhy => {
      if (this.onLeave(id)) return "leave";
      if (this.paused.includes(id)) return "paused";
      const eligible = P[id].ft && !P[id].locked;
      if (!sh(teamOf(id)) && eligible) return "not_on_ad";
      if (P[id].locked) return "locked";
      if (!P[id].ft) return "not_full_time";
      return sh(teamOf(id)) ? null : "not_on_ad";
    };
    // In turn in the teams' order, the rest in the people's, as the prototype lists them.
    const allIds = Object.keys(P), inOrder = TEAMS.flatMap(t => (sh(t) ? act[t.id] : []));
    const ids = [...inOrder, ...allIds.filter(id => !inOrder.includes(id))];
    const lastRow = LAST[ad];
    return {
      me: null, now: NOW, manage: true, fullTimeDay: true,
      queue: out,
      people: ids.map(id => ({ staff: id, team: teamOf(id).id, why: whyOf(id), pickable: P[id].ft && !P[id].locked && !this.paused.includes(id) && !this.onLeave(id),
        leave: this.onLeave(id) ? { id, ...this.leave[id] } : null })),
      shares: Object.fromEntries(live.map(t => [t.id, (sh(t) / S) * 100])),
      last: { staff: lastRow[0], at: agoIso(lastRow[1]), ad: lastRow[2] ?? ad },
      lastBy: Object.fromEntries(ids.filter(id => P[id].last).map(id => [id, agoIso(P[id].last)])),
      upcoming: Object.entries(this.leave).filter(([, l]) => l.from > NOW).sort(([, a], [, b]) => (a.from < b.from ? -1 : 1)).map(([id, l]) => ({ id, staff: id, ...l })),
    };
  }
  skip(id: string) { this.skipped.push(id); if (this.pinned === id) this.pinned = null; }
  pause(id: string) { this.paused.push(id); if (this.pinned === id) this.pinned = null; }
  resume(id: string) { this.paused = this.paused.filter(x => x !== id); }
  give(id: string) { this.pinned = id; }
  undo() { this.pinned = null; }
  saveLeave(id: string, from: string, to: string, reason: LeaveReason, note: string) { this.leave[id] = { from, to, reason, note }; if (this.pinned === id) this.pinned = null; }
  endLeave(id: string) { delete this.leave[id]; }
}
