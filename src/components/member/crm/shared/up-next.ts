/**
 * Insight › Up next (docs/design_handoff_crm_up_next): the prototype's frame(), port for port, over what the database
 * answers. The queue is never worked out here — crm_up_next runs the real dealer and rolls it back
 * (mig 20261108120000); this file only says it in the design's words. One view model for the desktop and the phone.
 */
export const DIRECTOR_KEY = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export type UpNextWhy = "leave" | "paused" | "not_on_ad" | "locked" | "not_full_time" | "no_share" | "at_limit" | null;
export type LeaveReason = "Annual" | "Sick" | "Training" | "Other";
/** Times are the office's, "2026-11-06T18:00". */
export interface UpNextLeave { id: string; from: string; to: string; reason: LeaveReason; note: string }
export interface UpNextRead {
  me: string | null;
  now: string;
  manage: boolean;
  /** CRM · Manage, or ticked for People › Permissions › CRM · Up next (a leader, their own line). */
  canAct?: boolean;
  fullTimeDay: boolean;
  /** Every ad counted together with one split (Assignment › Save and apply to all › Count together). */
  together?: boolean;
  queue: { staff: string; team: string; how: string | null; pinBy: string | null; ad: string }[];
  people: { staff: string; team: string; why: UpNextWhy; pickable: boolean; leave: UpNextLeave | null }[];
  /** Team key → % of this ad (All ads: each ad's added together). */
  shares: Record<string, number>;
  last: { staff: string; at: string; ad: string } | null;
  lastBy: Record<string, string>;
  upcoming: (UpNextLeave & { staff: string })[];
}
export interface UpNextAd { id: string; name: string; sub: string }
export interface UpNextTeam { name: string; dot: string }
export interface UpNextBook {
  nameOf(id: string): string; teamOf(key: string): UpNextTeam; adName(id: string): string;
  /** v4 9g: the person's leads today, as Team activity counts them (a customer given to them today). */
  todayOf?(id: string): number;
}

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const ini = (n: string) => n.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
export const fmtD = (s: string) => { const [dt, tm] = s.split("T"); const [, m, d] = dt.split("-").map(Number); return { d, m: MON[m - 1], t: tm || "", day: dt }; };
export const fmtRange = (a: string, b: string) => { const x = fmtD(a), y = fmtD(b); return x.day === y.day ? `${x.d} ${x.m} ${x.t}–${y.t}` : `${x.d} ${x.m} ${x.t} – ${y.d} ${y.m} ${y.t}`; };
export const leaveLabel = (l: { reason: string; note?: string }) => (l.reason === "Other" ? l.note || "Other" : `${l.reason} leave`);
const leaveShort = (l: { reason: string; note?: string }) => (l.reason === "Other" ? l.note || "Leave" : l.reason);

/** "6 h ago", "1 d ago" — both are office times or instants; the clock is the read's. */
export function agoWords(iso: string | null | undefined, nowOffice: string): string {
  if (!iso) return "no lead yet";
  const then = new Date(iso).getTime(), now = new Date(`${nowOffice}:00+08:00`).getTime();
  const min = Math.max(0, Math.round((now - then) / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

/** v4 9g: when the last lead went, as the README's time format — "8:40" today, "8 Nov, 8:40" before. */
export function lastWhen(iso: string, nowOffice: string): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => p.find(x => x.type === t)?.value ?? "";
  const day = `${g("year")}-${g("month")}-${g("day")}`, hm = `${Number(g("hour")) % 24}:${g("minute")}`;
  return day === nowOffice.slice(0, 10) ? hm : `${Number(g("day"))} ${MON[Number(g("month")) - 1]}, ${hm}`;
}

export const OFF_WORDS: Record<Exclude<UpNextWhy, "leave" | null>, string> = {
  paused: "paused", not_on_ad: "team not on this ad", locked: "locked", not_full_time: "not Full time today", no_share: "no share in this ad", at_limit: "at their limit",
};
/** Not in turn's order (the owner, 2026-11-08: "按原因，再按团队"): by reason in this order, then team, then name. */
const OFF_ORDER = ["paused", "at_limit", "not_full_time", "no_share", "not_on_ad"];
const OFF_MINI: Record<string, string> = { "not Full time today": "not Full time", "team not on this ad": "not on this ad" };

/** How many of the line after #1 the phone shows before Show N more (the owner, 2026-11-10: "默认展开5个"). */
export const QUEUE_TOP = 5;

export interface UpNextUi {
  ad: string; adOpen: boolean; tip: boolean; pick: boolean; more: boolean; why: boolean; hov: string | null;
  /** The phone's line (9g) shows five, the rest behind Show N more (the owner, 2026-11-10). */
  qAll?: boolean;
  sheet: { id: string; k: number } | null; ltab: "in" | "off" | "up";
}
export interface UpNextActs {
  set(p: Partial<UpNextUi>): void;
  pickAd(id: string): void;
  skip(id: string): void; pause(id: string): void; resume(id: string): void; give(id: string): void; unpin(): void;
  openLeave(id: string): void; endLeave(id: string, leaveId: string): void; cancelLeave(id: string, leaveId: string): void;
}

/** What each screen draws: the prototype's frame(where), with the same names. */
export function upNextFrame(r: UpNextRead, book: UpNextBook, ads: UpNextAd[], ui: UpNextUi, a: UpNextActs, canAct: boolean) {
  // A leader acts on the people under them, never on themselves (the database asks the same).
  const may = (id: string) => canAct && (r.manage || id !== r.me);
  const ad = ads.find(x => x.id === ui.ad) ?? { id: ui.ad, name: book.adName(ui.ad), sub: "" };
  const single = ui.ad !== "all", adWord = single ? "this ad's leads" : "ad leads";
  const nameOf = (id: string) => book.nameOf(id);
  const teamKeyOf = (id: string) => r.people.find(p => p.staff === id)?.team ?? r.queue.find(q => q.staff === id)?.team ?? "";
  const pctOf = (n: number) => `${Math.round(n * 100) / 100}%`;
  const pct = (key: string) => pctOf(r.shares[key] ?? 0);
  const turn = r.people.filter(p => !p.why);
  const seen: Record<string, number> = {};
  const out = r.queue.map(q => { const pinned = q.how === "pinned"; const p = pinned ? 0 : (seen[q.team] = (seen[q.team] ?? -1) + 1); return { ...q, pinned, p }; });
  const arrLen = (key: string) => Math.max(1, turn.filter(p => p.team === key).length);
  const lastOf = (id: string) => agoWords(r.lastBy[id], r.now);
  const setBy = (o: { pinBy: string | null }) => (!o.pinBy || o.pinBy === r.me ? "you" : nameOf(o.pinBy));
  const whyOf = (o: (typeof out)[number]) => {
    const t = book.teamOf(o.team);
    if (o.pinned) return `${t.name} · set by ${setBy(o)}`;
    const pr = o.p === 0 ? `last lead ${lastOf(o.staff)}` : o.p < arrLen(o.team) ? `${ORD[o.p] ?? `${o.p + 1}th`} in team` : "next round";
    return r.shares[o.team] != null ? `${t.name} · ${pct(o.team)} · ${pr}` : `${t.name} · ${pr}`;
  };
  const dayLine = () => (r.fullTimeDay ? ` ${DAYS[new Date(`${r.now.slice(0, 10)}T12:00:00+08:00`).getUTCDay()]} is a Full time day, so only ticked people count.` : "");
  const whyLong = (o: { staff: string; team: string; pinned?: boolean; pinBy?: string | null; p?: number }) => {
    const t = book.teamOf(o.team);
    if (o.pinned) return `${setBy({ pinBy: o.pinBy ?? null }) === "you" ? "You" : setBy({ pinBy: o.pinBy ?? null })} set ${nameOf(o.staff)} to get the next ad lead. After that the split carries on as set in Assignment.`;
    const p = o.p ?? 0, share = r.shares[o.team] != null ? `${t.name} is due its ${pct(o.team)} share of ${adWord}.` : `${t.name} is due ${adWord}.`;
    return `${share} Inside the team ${nameOf(o.staff)} is ${p === 0 ? `first, longest without a lead (${lastOf(o.staff)})` : `${ORD[p % arrLen(o.team)] ?? `${p + 1}th`} in turn`}.${dayLine()}`;
  };
  const slots = out.map((o, i) => {
    const t = book.teamOf(o.team), key = `c${i}`;
    const today = book.todayOf?.(o.staff) ?? 0;
    return { teamShort: t.name.replace(/^Team /, ""), k: i + 1, today, todayLine: today ? `${t.name} · ${today} lead${today === 1 ? "" : "s"} today` : t.name, id: o.staff, name: nameOf(o.staff), ini: ini(nameOf(o.staff)), team: t.name, dot: t.dot, why: whyOf(o), whyLong: whyLong(o),
      pinned: o.pinned, notPinned: !o.pinned, act: may(o.staff),
      skip: () => a.skip(o.staff), pause: () => a.pause(o.staff), give: () => a.give(o.staff), open: () => a.set({ sheet: { id: o.staff, k: i + 1 } }),
      actOp: ui.hov === key && may(o.staff) ? 1 : 0, hovOn: () => a.set({ hov: key }), hovOff: () => a.set({ hov: null }) };
  });
  // On leave is listed under Leave; locked people are not listed (Assignment › Active members says so) — the owner, 2026-11-08.
  const off = r.people.filter(p => p.why && p.why !== "leave" && p.why !== "locked").map(p => {
    const id = p.staff, t = book.teamOf(p.team), key = `g${id}`, onLeave = p.why === "leave" && !!p.leave, canResume = p.why === "paused";
    const l = p.leave;
    const short = onLeave && l ? `${leaveLabel(l)} · ${fmtRange(l.from, l.to)}`
      : p.why === "not_on_ad" && !single ? "not on any ad" : OFF_WORDS[p.why as keyof typeof OFF_WORDS];
    return { id, name: nameOf(id), team: t.name, rank: OFF_ORDER.indexOf(p.why ?? "") >>> 0, dot: t.dot, whyShort: short, canResume: canResume && may(id), canEnd: onLeave && may(id), first: canResume || onLeave,
      whyMini: onLeave && l ? `${leaveShort(l)} · to ${fmtD(l.to).d} ${fmtD(l.to).m}` : OFF_MINI[short] ?? short,
      resume: () => a.resume(id), endLeave: () => { if (l) a.endLeave(id, l.id); }, editLeave: () => a.openLeave(id),
      actDisp: ui.hov === key && onLeave && may(id) ? "flex" : "none", txtDisp: ui.hov === key && onLeave && may(id) ? "none" : "block", hovOn: () => a.set({ hov: key }), hovOff: () => a.set({ hov: null }) };
  }).sort((x, y) => Number(y.first) - Number(x.first) || x.rank - y.rank || x.team.localeCompare(y.team) || x.name.localeCompare(y.name));
  const inTurn = turn.map(p => {
    const id = p.staff, t = book.teamOf(p.team), i = slots.findIndex(s => s.id === id), key = `m${id}`, hov = ui.hov === key && may(id);
    return { i: i < 0 ? 99 : i, id, name: nameOf(id), team: t.name, dot: t.dot, last: lastOf(id), nextTxt: i < 0 ? "10+" : `#${i + 1}`,
      actDisp: hov ? "flex" : "none", txtDisp: hov ? "none" : "block", hovOn: () => a.set({ hov: key }), hovOff: () => a.set({ hov: null }),
      skip: () => a.skip(id), pause: () => a.pause(id), leave: () => a.openLeave(id), open: () => a.set({ sheet: { id, k: i + 1 } }) };
  }).sort((x, y) => x.i - y.i);
  const others = r.people.filter(p => p.why && p.pickable && p.why !== "leave" && p.why !== "paused" && p.why !== "locked" && p.why !== "not_full_time");
  const turnMay = turn.filter(p => may(p.staff)), othersMay = others.filter(p => may(p.staff));
  const pickList = [...turnMay.map((p, j) => ({ id: p.staff, team: p.team, head: j === 0 ? "In today's turn" : "" })), ...othersMay.map((p, j) => ({ id: p.staff, team: p.team, head: j === 0 ? "Outside this ad" : "" }))]
    .map(({ id, team, head }) => ({ id, head, name: nameOf(id), team: book.teamOf(team).name, dot: book.teamOf(team).dot, give: () => a.give(id) }));
  const shares = Object.entries(r.shares).filter(([, n]) => n > 0).sort(([x], [y]) => (x === DIRECTOR_KEY ? -1 : y === DIRECTOR_KEY ? 1 : 0) || book.teamOf(x).name.localeCompare(book.teamOf(y).name));
  const splitText = shares.map(([k, n]) => `${book.teamOf(k).name} ${pctOf(n)}`).join(" · ");
  // All ads counted together (the boss's Save and apply to all) are one pool with one split; say that, not the prototype's "adds them together".
  const splitLine = !single ? (r.together && shares.length ? `All ads counted together: ${splitText} · set in Assignment` : "Each ad keeps its own split from Assignment. This view adds them together.")
    : shares.length ? `Split for this ad: ${splitText} · set in Assignment`
    : "No split for this ad · set in Assignment";
  const last = r.last ? { at: lastWhen(r.last.at, r.now), name: nameOf(r.last.staff), meta: [book.teamOf(teamKeyOf(r.last.staff)).name, agoWords(r.last.at, r.now), single ? "" : book.adName(r.last.ad)].filter(Boolean).join(" · "), when: agoWords(r.last.at, r.now) } : { at: "", name: "—", meta: "", when: "" };
  // Leave: who is on leave now, then what is coming.
  const nowLeave = r.people.filter(p => p.why === "leave" && p.leave).map(p => ({ ...p.leave!, staff: p.staff, now: true }));
  const upcoming = [...nowLeave, ...r.upcoming.map(l => ({ ...l, now: false }))].map(l => {
    const key = `u${l.id}`, hov = ui.hov === key && may(l.staff), x = fmtD(l.from), y = fmtD(l.to), t = book.teamOf(teamKeyOf(l.staff));
    return { id: l.id, now: l.now, name: nameOf(l.staff), dot: t.dot, label: leaveLabel(l), range: fmtRange(l.from, l.to), day: l.now ? "Now" : `${x.d} ${x.m}`, dayNum: l.now ? "Now" : `${x.d} ${x.m}`,
      short: x.day === y.day ? `${leaveShort(l)} · ${x.t}–${y.t}` : `${leaveShort(l)} · to ${y.d} ${y.m}`,
      actDisp: hov ? "flex" : "none", txtDisp: hov ? "none" : "block", hovOn: () => a.set({ hov: key }), hovOff: () => a.set({ hov: null }),
      edit: () => a.openLeave(l.staff), cancel: () => (l.now ? a.endLeave(l.staff, l.id) : a.cancelLeave(l.staff, l.id)), cancelWord: l.now ? "End leave" : "Cancel leave" };
  });
  const sh = ui.sheet;
  const shO = sh ? out.find(o => o.staff === sh.id) ?? { staff: sh.id, team: teamKeyOf(sh.id), p: 0, pinned: false, pinBy: null } : null;
  const ltabs = (([["in", "In turn", inTurn.length], ["off", "Not in turn", off.length], ["up", "Leave", upcoming.length]] as const)).map(([k, label, n]) => {
    const on = ui.ltab === k;
    return { key: k, label, n, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 2px rgba(42,22,12,.12)" : "none", fg: on ? "var(--crm-ink)" : "var(--crm-muted)", go: () => a.set({ ltab: k }) };
  });
  return {
    canAct,
    ads: ads.map(x => ({ id: x.id, name: x.name, sub: x.sub, w: x.id === ui.ad ? 600 : 400, rowBg: x.id === ui.ad ? "var(--crm-field)" : "transparent", pick: () => a.pickAd(x.id) })),
    adName: ad.name, adOpen: ui.adOpen, tipShow: ui.tip && !ui.adOpen, tipOn: () => a.set({ tip: true }), tipOff: () => a.set({ tip: false }), toggleAd: () => a.set({ adOpen: !ui.adOpen }),
    splitLine, anyOpen: ui.pick || ui.adOpen, cardZ: (ui.pick ? 5 : "auto") as number | "auto", closeAll: () => a.set({ pick: false, adOpen: false }),
    last, ltabs, tabIn: ui.ltab === "in", tabOff: ui.ltab === "off", tabUp: ui.ltab === "up",
    upCount: upcoming.length, upNone: !upcoming.length, upcoming,
    firstLine: slots[0] ? (ui.why ? slots[0].why : slots[0].team) : "",
    inTurn, inCount: inTurn.length,
    // v4 9g: everyone in turn after #1, in the dealer's order — the circle's number, the name, "{team} · {n} today".
    // Numbered by place in the line, 2, 3, 4 … in the dealer's order (the owner, 2026-11-10: "数字没有顺序" — it was the
    // first of the next ten leads each would get, so a person dealt #1 and #5 left gaps, and past ten read "10+").
    // Five on screen, the rest behind "Show N more" ("默认展开5个，剩下的收起").
    queue: inTurn.filter(m => m.id !== slots[0]?.id).map((m, k) => {
      const n = book.todayOf?.(m.id) ?? 0, team = m.team.replace(/^Team /, "");
      return { id: m.id, num: String(k + 2), name: m.name, right: n ? `${team} · ${n} today` : team, open: m.open };
    }).filter((_, k) => ui.qAll || k < QUEUE_TOP),
    queueMore: Math.max(0, inTurn.filter(m => m.id !== slots[0]?.id).length - QUEUE_TOP), queueAll: !!ui.qAll,
    toggleQueue: () => a.set({ qAll: !ui.qAll }), offCount: off.length, first: slots[0] ?? null, chain: ui.more ? slots.slice(1) : slots.slice(1, 4), greyed: off,
    moreLabel: ui.more ? "Show less" : `${Math.max(slots.length - 4, 0)} more`, moreOpen: ui.more,
    whyOn: () => a.set({ why: true }), whyOff: () => a.set({ why: false }), toggleMore: () => a.set({ more: !ui.more }),
    pickList, unpin: a.unpin, pickOpen: ui.pick, togglePick: () => a.set({ pick: !ui.pick }),
    sheetOn: !!sh, close: () => a.set({ sheet: null }),
    sh: sh && shO ? { act: may(sh.id), name: nameOf(sh.id), ini: ini(nameOf(sh.id)), team: book.teamOf(shO.team).name, pos: sh.k > 0 ? `#${sh.k} in line` : "after #10", why: whyLong(shO),
      give: () => a.give(sh.id), skip: () => a.skip(sh.id), pause: () => a.pause(sh.id), leave: () => a.openLeave(sh.id) } : null,
  };
}
export type UpNextFrame = ReturnType<typeof upNextFrame>;

/** The leave form (one for the desktop's window and the phone's sheet): From change pushes To. */
export interface LeaveEdit { id: string; leaveId: string | null; from: string; to: string; reason: LeaveReason; note: string }
export function leaveFormVM(e: LeaveEdit, name: string, set: (p: Partial<LeaveEdit>) => void, save: () => void, cancel: () => void) {
  const [fd, ft] = e.from.split("T"), [td, tt] = e.to.split("T");
  return {
    name, note: e.note, isOther: e.reason === "Other", fromDate: fd, fromTime: ft, toDate: td, toTime: tt, save, cancel,
    setNote: (v: string) => set({ note: v }),
    setFD: (v: string) => { const f = `${v}T${ft}`; set({ from: f, to: e.to < f ? `${v}T${tt}` : e.to }); },
    setFT: (v: string) => { const f = `${fd}T${v}`; set({ from: f, to: e.to < f ? f : e.to }); },
    setTD: (v: string) => set({ to: `${v}T${tt}` }),
    setTT: (v: string) => set({ to: `${td}T${v}` }),
    times: Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`),
    reasons: (["Annual", "Sick", "Training", "Other"] as const).map(r => ({ label: r, bg: e.reason === r ? "var(--crm-ink)" : "#fff", fg: e.reason === r ? "#fff" : "var(--crm-ink)", bd: e.reason === r ? "var(--crm-ink)" : "var(--crm-line)", pick: () => set({ reason: r }) })),
  };
}
export type LeaveForm = ReturnType<typeof leaveFormVM>;
