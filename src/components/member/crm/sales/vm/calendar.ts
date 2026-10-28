/**
 * Calendar (design 3b): Month (default) · Week · Day, swipeable; Today with
 * Change / No show / Show up; the outcome popup — Show up → Follow up / Won
 * (amount, then the celebration) / Lost (reason); No show → Rebook / Follow up
 * / Lost (Unreachable too). Upcoming lists the shown period with Send reminder.
 * Show-up rate = showed ÷ visits already due (crm.ts).
 */
import { createElement, type ChangeEvent, type MouseEvent, type ReactNode } from "react";
import { customPrefill } from "../../shared/custom-book";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { BORDER, gb, day0, DAY, dayLabel, firstName, ini, money, stop, timeLabel, type PEvent, type SalesCtx } from "./common";
import type { OutcomeAsk } from "../ui";
import { contactInfoVM, customerFormVM } from "./customer";
import { oneAtATime } from "../../shared/once";
import { askKeyPhoto } from "../../shared/key-photo";
import { openViewer } from "../../shared/viewer";

export const LOST_OPTIONS: [string, string, string][] = [
  ["Price", "too_expensive", "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  ["Bought elsewhere", "bought_elsewhere", "M6 6h15l-1.5 9h-12L6 6Zm0 0L5 3H2M9 20h.01M18 20h.01"],
  ["Not ready to buy", "not_ready", "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
];
const UNREACHABLE: [string, string, string] = ["Unreachable", "no_response", "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2ZM16 3l5 5m0-5-5 5"];

interface Shown { v: CrmVisit; c: CrmCustomer; at: Date; room: string; attended: boolean; noshow: boolean }

/** The design's fireworks: seven bursts of eighteen sparks, looping while the card shows. */
function fireworks(): ReactNode {
  const C = ["var(--crm-rust)", "var(--crm-brown)", "var(--crm-ink-soft)", "var(--crm-amber)", "var(--crm-ink-soft)"];
  return createElement("div", { style: { position: "absolute", inset: 0, pointerEvents: "none" } },
    [[20, 20, 0], [80, 18, .35], [50, 10, .7], [24, 60, 1.05], [76, 64, 1.4], [50, 82, 1.75], [50, 42, 2.1]].map(([x, y, dl], b) =>
      createElement("div", { key: b, style: { position: "absolute", left: x + "%", top: y + "%" } },
        Array.from({ length: 18 }, (_, k) => createElement("span", {
          key: k,
          style: {
            position: "absolute", left: -5, top: -5, width: k % 2 ? 7 : 10, height: k % 2 ? 7 : 10, borderRadius: 5, background: C[(k + b) % C.length],
            boxShadow: "0 0 10px " + C[(k + b) % C.length], "--a": k * 20 + "deg", "--d": (90 + (k % 3) * 24) + "px",
            animation: "fw 1.4s cubic-bezier(.15,.7,.3,1) " + dl + "s infinite both",
          } as React.CSSProperties,
        })))));
}

export function calendarVM(ctx: SalesCtx) {
  const { ui, set, patch, data, now, mine, act, refs } = ctx;
  const byId = new Map(mine.map(c => [c.id, c]));
  const roomName = (id: string) => data.rooms.find(r => r.id === id)?.name ?? "Showroom";
  const all: Shown[] = data.visits
    .filter(v => v.state !== "cancelled" && byId.has(v.customerId))
    .map(v => ({ v, c: byId.get(v.customerId)!, at: new Date(v.start), room: roomName(v.showroomId), attended: v.state === "attended", noshow: v.state === "no_show" }));
  const T = day0(now);
  const up = all.filter(a => a.v.state === "booked" && a.at > now).sort((x, y) => +x.at - +y.at);
  const colOf = (a: Shown) => a.attended ? "var(--crm-brown)" : a.noshow ? "var(--crm-muted)" : a.at <= now ? "var(--crm-brown)" : "var(--crm-rust)";
  const evOn = (t: number) => all.filter(a => day0(a.at) === t).sort((x, y) => +x.at - +y.at);
  const cv = ui.calView, ym = ui.calYM ?? [now.getFullYear(), now.getMonth()], sel = ui.calSel ?? T;
  const first = new Date(ym[0], ym[1], 1), lead0 = (first.getDay() + 6) % 7, dim = new Date(ym[0], ym[1] + 1, 0).getDate();
  const weeks = Math.ceil((lead0 + dim) / 7);
  // A visit opens Customer info first, then the chat (rev 1010 §3). A chip in a Month cell / Week column keeps its tap from the
  // cell's select-day; a tap that ends a swipe opens nothing.
  const openInfo = (c: CrmCustomer) => (e?: MouseEvent<HTMLElement>) => { e?.stopPropagation(); if (refs.calSwiped) return; patch({ cInfo: c.id }); };
  const setSel = (t: number) => { const d = new Date(t); patch({ calSel: day0(d), calYM: [d.getFullYear(), d.getMonth()] }); };
  const step = cv === "week" ? 7 : 1;
  const wkStart = sel - ((new Date(sel).getDay() + 6) % 7) * DAY;
  const wd = (k: number) => { const s = new Date(wkStart); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + k); };
  const fdm = (d: Date) => gb(d, { day: "numeric", month: "short" });
  const weekLabel = `${fdm(wd(0))} – ${fdm(wd(6))}`;
  const guard = (fn: () => void) => () => { if (!refs.calSwiped) fn(); };
  const shiftMonth = (dir: number) => { const n = new Date(ym[0], ym[1] + dir, 1); patch({ calYM: [n.getFullYear(), n.getMonth()], calSel: n.getTime() }); };
  const inView = (at: Date) => cv === "month" ? at.getFullYear() === ym[0] && at.getMonth() === ym[1]
    : cv === "week" ? day0(at) >= wkStart && day0(at) < wkStart + 7 * DAY : day0(at) === sel;
  const upV = up.filter(a => inView(a.at) && day0(a.at) !== T);
  // Today: this day's visits still to mark — and, so none is ever left unmarked, earlier ones too.
  const todayV = all.filter(a => a.v.state === "booked" && (day0(a.at) === T || (a.at < now && day0(a.at) >= T - 14 * DAY))).sort((x, y) => +x.at - +y.at);
  const earlier = todayV.filter(a => day0(a.at) < T).length, today = todayV.length - earlier;
  const vLabel = (a: Shown) => `${dayLabel(a.at)}, ${timeLabel(a.at)}`;
  const ask = (a: Shown, mode?: "noshow"): OutcomeAsk => ({ visitId: a.v.id, customerId: a.c.id, name: a.c.name, when: vLabel(a), room: a.room, ...(mode ? { mode } : {}) });
  // The unit’s key handed over with a photo (the owner, 2026-10-28): collected before the visit, returned after it.
  const KEY_ASK = {
    out: { title: "Photo of the key collected", sub: "Take or choose a photo of the key you collected for this visit.", saved: "Key collected · photo saved" },
    back: { title: "Photo of the key returned", sub: "Take or choose a photo of the key handed back, then mark the visit.", saved: "Key returned · photo saved" },
  } as const;
  const keyAsk = (a: Shown, kind: "out" | "back", then?: () => void) => askKeyPhoto({
    title: KEY_ASK[kind].title, sub: KEY_ASK[kind].sub,
    run: async file => { const ok = await oneAtATime(`key:${a.v.id}`, () => act.keyPhoto(a.v.id, kind, file)); if (ok) { act.toast(KEY_ASK[kind].saved); then?.(); } return !!ok; },
  }, act.toast);
  const keyView = (path: string) => () => { void act.keyPhotoUrl(path).then(url => { if (url) openViewer([{ kind: "image", url, name: "Key photo" }], 0); }); };
  const keys = (a: Shown) => ({
    keyOut: a.v.keyOut ? { time: timeLabel(new Date(a.v.keyOut.at)), view: keyView(a.v.keyOut.path) } : null,
    keyBack: a.v.keyBack ? { time: timeLabel(new Date(a.v.keyBack.at)), view: keyView(a.v.keyBack.path) } : null,
    takeKey: () => keyAsk(a, "out"),
  });
  const change = (a: Shown) => () => {
    const ri = Math.max(0, data.rooms.filter(r => r.active).findIndex(r => r.id === a.v.showroomId));
    set(u => ({ ...u, tab: "inbox", chat: a.c.id, book: { customerId: a.c.id, room: ri, day: day0(a.at), slot: timeLabel(a.at), visitId: a.v.id, ...customPrefill(a.v) }, hist: [...u.hist, u.tab].slice(-20) }));
  };

  // ── The outcome popup ──
  const oa = ui.outcomeAsk;
  const toChat = (customerId: string, status: string) => set(u => ({ ...u, outcomeAsk: null, tab: "inbox", chat: customerId, filter: { type: "status", v: status }, hist: [...u.hist, u.tab].slice(-20) }));
  let outcomeTitle = oa ? oa.name + (oa.mode === "noshow" ? " didn't show up" : " showed up") : "";
  let outcomeWhen = oa ? `${oa.when} · ${oa.room}` : "";
  let outcomeOpts: { label: string; sub: string; fg: string; bg: string; icon: string; pick: () => void }[] = [];
  let outcomeClose = () => patch({ outcomeAsk: null });
  const lost = { isLost: false, notLost: true, lostReasons: [] as { label: string; icon: string; pick: () => void; bg: string; fg: string; bd: string; ic: string; ring: string; dot: string }[], otherText: "", otherBd: "var(--crm-rule)", otherSet: (_: ChangeEvent<HTMLInputElement>) => {}, lostSave: undefined as undefined | (() => void), lostSaveBg: "var(--crm-line)" };
  const won = { isWon: false, wonAmount: "", wonSet: (_: ChangeEvent<HTMLInputElement>) => {}, wonSave: undefined as undefined | (() => void), wonSaveBg: "var(--crm-line)" };
  if (oa && !oa.wonStep && !oa.lostStep) {
    const FU: [string, string, string, string, string] = ["Follow up", "", "var(--crm-brown)", "var(--crm-tint-appt)", "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"];
    const LO: [string, string, string, string, string] = ["Lost", "", "var(--crm-oxblood)", "var(--crm-tint-attention)", "M6 6l12 12M18 6 6 18"];
    const goFollow = async () => { if (await act.outcome(oa.visitId, oa.mode !== "noshow", "follow_up")) toChat(oa.customerId, "Follow up"); };
    const rows: [[string, string, string, string, string], () => void][] = oa.mode === "noshow" ? [
      [["Rebook", "", "var(--crm-rust)", "var(--crm-tint-attention)", "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14M12 14v4m-2-2h4"], () => {
        const a = all.find(x => x.v.id === oa.visitId); if (!a) return;
        const ri = Math.max(0, data.rooms.filter(r => r.active).findIndex(r => r.id === a.v.showroomId));
        set(u => ({ ...u, outcomeAsk: null, rebookFor: oa, tab: "inbox", chat: a.c.id, book: { customerId: a.c.id, room: ri, day: T, slot: null }, hist: [...u.hist, u.tab].slice(-20) }));
      }],
      [FU, goFollow],
      [LO, () => patch({ outcomeAsk: { ...oa, lostStep: true } })],
    ] : [
      [FU, goFollow],
      [["Won", "", "var(--crm-brown)", "var(--crm-tint-follow)", "m5 12 5 5 9-10"], () => patch({ outcomeAsk: { ...oa, wonStep: true, amount: "" } })],
      [LO, () => patch({ outcomeAsk: { ...oa, lostStep: true } })],
    ];
    outcomeOpts = rows.map(([[label, sub, fg, bg, icon], pick]) => ({ label, sub, fg, bg, icon, pick }));
  }
  if (oa?.wonStep) {
    outcomeTitle = "Amount"; outcomeWhen = "";
    const amt = (oa.amount ?? "").replace(/[^\d.]/g, ""), ok = Number(amt) > 0;
    Object.assign(won, {
      isWon: true, wonAmount: oa.amount ?? "", wonSaveBg: ok ? "var(--crm-brown)" : "var(--crm-line)",
      wonSet: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/[^\d,.]/g, ""); set(u => (u.outcomeAsk ? { ...u, outcomeAsk: { ...u.outcomeAsk, amount: v } } : u)); },
      wonSave: ok ? async () => {
        if (!(await act.outcome(oa.visitId, true, "won", { amount: Number(amt) }))) return;
        patch({ outcomeAsk: null, celebrate: { name: oa.name, amount: money(Number(amt)), customerId: oa.customerId } });
        clearTimeout(refs.celT);
        refs.celT = setTimeout(() => set(u => ({ ...u, celebrate: null, tab: "inbox", chat: oa.customerId, filter: { type: "status", v: "Won" } })), 5000);
      } : undefined,
    });
  }
  if (oa?.lostStep) {
    outcomeTitle = "Mark as Lost"; outcomeWhen = `${oa.name} · ${oa.when}`;
    const selR = oa.reason ?? "", txt = oa.otherText ?? "";
    const setO = (p: Partial<OutcomeAsk>) => set(u => (u.outcomeAsk ? { ...u, outcomeAsk: { ...u.outcomeAsk, ...p } } : u));
    const opts = oa.mode === "noshow" ? [...LOST_OPTIONS, UNREACHABLE] : LOST_OPTIONS;
    const okO = !!selR && (selR !== "Other" || !!txt.trim());
    Object.assign(lost, {
      isLost: true, notLost: false, otherText: txt, otherBd: selR === "Other" ? "var(--crm-ink)" : "var(--crm-rule)",
      lostReasons: opts.map(([label, , icon]) => { const on = selR === label; return { label, icon, pick: () => setO({ reason: on ? "" : label }), bg: on ? "var(--crm-tint-attention)" : "#fff", fg: "var(--crm-ink)", bd: on ? "var(--crm-oxblood)" : "var(--crm-rule)", ic: "var(--crm-oxblood)", ring: on ? "var(--crm-oxblood)" : "var(--crm-line)", dot: on ? "var(--crm-oxblood)" : "transparent" }; }),
      otherSet: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; setO({ otherText: v, reason: v.trim() ? "Other" : selR === "Other" ? "" : selR }); },
      lostSaveBg: okO ? "var(--crm-oxblood)" : "var(--crm-line)",
      lostSave: okO ? async () => {
        const code = selR === "Other" ? "other" : opts.find(o => o[0] === selR)?.[1] ?? "other";
        if (await act.outcome(oa.visitId, oa.mode !== "noshow", "lost", { reason: code, note: selR === "Other" ? txt.trim() : undefined })) patch({ outcomeAsk: null });
      } : undefined,
    });
  }
  if (oa && (oa.wonStep || oa.lostStep)) { if (oa.wonStep) outcomeOpts = []; outcomeClose = () => patch({ outcomeAsk: { ...oa, wonStep: false, lostStep: false } }); }

  const cel = ui.celebrate;
  // 4a (M10): the month's own line (‹ October 2026 ›), a dot per day with visits (orange ahead, sand gone by), and the
  // lists' time split in two lines and their day as a kicker.
  const ap = (d: Date) => { const s = timeLabel(d); const m = /^(.*?)\s?([ap]m)$/i.exec(s); return m ? { t: m[1], ap: m[2].toLowerCase() } : { t: s, ap: "" }; };
  const soonLabel = (ms: number) => { const m = Math.max(1, Math.round(ms / 60_000)); return m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)} h`; };
  const kick = (d: Date) => gb(d, { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
  const cal4 = { month: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }), prev: () => shiftMonth(-1), next: () => shiftMonth(1), today: kick(now) };
  return {
    cal4,
    // stop comes with the customer form below
    calTitle: first.toLocaleDateString("en-GB", ym[0] === now.getFullYear() ? { month: "long" } : { month: "long", year: "numeric" }),
    calToday: (e: MouseEvent<HTMLElement>) => {
      const main = e.currentTarget.closest("main");
      patch({ calYM: [now.getFullYear(), now.getMonth()], calSel: T });
      requestAnimationFrame(() => {
        if (!main) return; main.scrollTop = 0;
        const row = main.querySelector<HTMLElement>("[data-drag-scroll]"), chip = row?.children[3] as HTMLElement | undefined;
        if (row && chip) row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2;
      });
    },
    calViews: ([["month", "Month"], ["week", "Week"], ["day", "Day"]] as const).map(([k, label]) => ({
      label, pick: () => patch({ calView: k }), bg: cv === k ? "#fff" : "transparent", fg: cv === k ? "var(--crm-ink)" : "var(--crm-muted)", weight: cv === k ? 650 : 500, shadow: cv === k ? "0 1px 3px rgba(42,22,12,.12)" : "none",
    })),
    calIsMonth: cv === "month", calIsWeek: cv === "week", calIsDay: cv === "day",
    // Three months back, eight ahead.
    calMonths: Array.from({ length: 12 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 3 + k, 1), on = d.getFullYear() === ym[0] && d.getMonth() === ym[1];
      return { label: gb(d, { month: "short" }) + (d.getFullYear() !== now.getFullYear() ? " " + String(d.getFullYear()).slice(2) : ""),
        bg: on ? "var(--crm-rust)" : "#fff", fg: on ? "#fff" : "var(--crm-ink)", border: on ? "var(--crm-rust)" : BORDER, weight: on ? 650 : 500, pick: () => patch({ calYM: [d.getFullYear(), d.getMonth()], calSel: d.getTime() }) };
    }),
    calWk: ["M", "T", "W", "T", "F", "S", "S"],
    calCells: Array.from({ length: weeks * 7 }, (_, k) => {
      const d = new Date(ym[0], ym[1], 1 - lead0 + k), t = d.getTime(), inM = d.getMonth() === ym[1], isT = t === T, isS = t === sel, ev = evOn(t);
      return { n: d.getDate(), pick: guard(() => patch({ calSel: t, calYM: [d.getFullYear(), d.getMonth()] })), edge: k % 7 ? "1px solid var(--crm-rule-soft)" : "0",
        bg: isS && !isT ? "var(--crm-sel)" : "transparent", dotBg: isT ? "var(--crm-rust)" : "transparent", fg: isT ? "#fff" : inM ? "var(--crm-ink)" : "var(--crm-faint-2)", weight: isT || isS ? 700 : 500,
        isT, isS, inM, has: ev.length > 0, evC: t >= T ? "var(--crm-orange)" : "var(--crm-st-lost)",
        ev: ev.slice(0, 2).map(a => ({ t: timeLabel(a.at).replace(":00", "").replace(" ", "") + " " + firstName(a.c.name), bg: colOf(a), open: openInfo(a.c) as ((e: MouseEvent<HTMLElement>) => void) | undefined }))
          // "+N" keeps the cell's select-day.
          .concat(ev.length > 2 ? [{ t: "+" + (ev.length - 2), bg: "var(--crm-muted)", open: undefined }] : []) };
    }),
    calPrev: () => setSel(sel - step * DAY + 3 * 3_600_000), calNext: () => setSel(sel + step * DAY + 3 * 3_600_000),
    calSwDown: (e: PEvent) => { refs.calSw = { x: e.clientX, y: e.clientY }; },
    calSwUp: (e: PEvent) => {
      const s = refs.calSw; refs.calSw = null; if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      refs.calSwiped = true; setTimeout(() => { refs.calSwiped = false; }, 50);
      const dir = dx < 0 ? 1 : -1;
      if (cv === "month") shiftMonth(dir); else setSel(sel + dir * step * DAY + 3 * 3_600_000);
    },
    weekLabel,
    weekCols: Array.from({ length: 7 }, (_, k) => {
      const d = wd(k), t = d.getTime(), isT = t === T, isS = t === sel;
      return { wk: d.toLocaleDateString("en-GB", { weekday: "short" }), n: d.getDate(), edge: k ? "1px solid var(--crm-rule-soft)" : "0", bg: isS && !isT ? "var(--crm-sel)" : "transparent",
        dotBg: isT ? "var(--crm-rust)" : "transparent", fg: isT ? "#fff" : "var(--crm-ink)", weight: isT || isS ? 700 : 500, pick: guard(() => setSel(t)),
        ev: evOn(t).map(a => ({ time: timeLabel(a.at), name: firstName(a.c.name), bg: colOf(a), open: openInfo(a.c) })) };
    }),
    selLabel: (sel === T ? "Today · " : "") + new Date(sel).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    dayHours: Array.from({ length: 12 }, (_, k) => {
      const hr = 10 + k, items = evOn(sel).filter(a => a.at.getHours() === hr);
      return { label: (hr % 12 || 12) + (hr < 12 ? " am" : " pm"), ev: items.map(a => ({ name: a.c.name, time: timeLabel(a.at), room: a.room, bg: colOf(a), open: openInfo(a.c) })) };
    }),
    hasToday: todayV.length > 0 && inView(now), todayCount: earlier ? `${today} today · ${earlier} to mark` : `${todayV.length} today`,
    todayList: todayV.map(a => ({
      name: a.c.name, room: a.room, open: openInfo(a.c), due: day0(a.at) !== T, kick: kick(a.at), ...ap(a.at),
      // v3 M10: a visit still to come today says how soon ("in 2 h", "in 40 min").
      soon: a.at > now ? soonLabel(+a.at - +now) : "",
      time: day0(a.at) === T ? timeLabel(a.at) : `${gb(a.at, { weekday: "short", day: "numeric", month: "short" })}, ${timeLabel(a.at)}`,
      change: change(a), ...keys(a),
      // Every Show up needs the key returned on a photo; a No show too once the key was collected (the owner, 2026-10-28).
      came: () => (a.v.keyBack ? patch({ outcomeAsk: ask(a) }) : keyAsk(a, "back", () => patch({ outcomeAsk: ask(a) }))),
      noShow: () => (a.v.keyOut && !a.v.keyBack ? keyAsk(a, "back", () => patch({ outcomeAsk: ask(a, "noshow") })) : patch({ outcomeAsk: ask(a, "noshow") })),
    })),
    outcomeOpen: !!oa, outcomeTitle, outcomeWhen, outcomeOpts, outcomeClose,
    ...lost, ...won,
    celebrateOpen: !!cel, celName: cel?.name ?? "", celAmount: cel?.amount ?? "", fireworks: cel ? fireworks() : null,
    noUpcoming: !upV.length,
    upTitle: "Upcoming · " + (cv === "month" ? first.toLocaleDateString("en-GB", { month: "long" }) : cv === "week" ? weekLabel : gb(new Date(sel), { weekday: "short", day: "numeric", month: "short" })),
    upCount: upV.length ? `${upV.length} booked` : "",
    upList: upV.map(a => {
      const done = !!a.v.remindedAt;
      return { kick: kick(a.at), t: ap(a.at).t, ap: ap(a.at).ap, done, name: a.c.name, ini: ini(a.c.name), time: timeLabel(a.at), room: a.room, wk: a.at.toLocaleDateString("en-GB", { weekday: "short" }), dn: a.at.getDate(),
        open: openInfo(a.c), isToday: false, later: true, came: () => patch({ outcomeAsk: ask(a) }), change: change(a),
        // Sent once, it may go again (the owner, 2026-10-14: "upcoming 的 reminder 發過之後還可以再發"): the button keeps
        // its green "sent" look and reads Send again; one at a time per visit (a double tap sent twice before).
        rLabel: done ? "Send again" : "Send reminder", rIcon: done ? "m5 12 5 5 9-10" : "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
        rBg: done ? "#fff" : "var(--crm-rust)", rFg: done ? "var(--crm-brown)" : "#fff", rBd: done ? "var(--crm-tint-follow)" : "var(--crm-rust)", rCur: "pointer",
        remind: () => { void oneAtATime(`remind:${a.v.id}`, () => act.remind(a.v.id)).then(ok => { if (ok && done) act.toast(`Reminder sent again to ${a.c.name}`); }); } };
    }),
    // Customer info (Edit · Open chat) and its form, as on Contacts (rev 1010 §3).
    ...contactInfoVM(ctx), ...customerFormVM(ctx),
  };
}
export type CalendarVM = ReturnType<typeof calendarVM>;
