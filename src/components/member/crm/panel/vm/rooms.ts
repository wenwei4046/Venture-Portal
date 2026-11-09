/**
 * Showrooms (Profile › Showrooms, design 1a): name, address (Waze / Google
 * Maps links), the time slots per weekday, how many groups a slot takes, the
 * weekdays it is closed and the dates blocked. Every CRM's Book visit offers
 * exactly this (crm_slot_check enforces it). Save writes the whole showroom;
 * Delete closes it for good — off every booking list, its past visits kept.
 */
import type { ChangeEvent, SyntheticEvent } from "react";
import type { CrmBlock, CrmData, CrmRoom } from "@/lib/member/crm-data";
import type { PanelUi, RoomDraft } from "../ui";
import { draftOf as deskDraftOf, draftFromStore, draftToStore, roomOf } from "../../desk/vm/showrooms";
import { t12 } from "../../sales/vm/chat";
import { gb, stop, type PanelCtx } from "./common";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], WI = [1, 2, 3, 4, 5, 6, 0], ALL = [0, 1, 2, 3, 4, 5, 6];
const wkTxt = (w: number[]) => WI.filter(d => w.includes(d)).map(d => WD[WI.indexOf(d)]).join(", ");
const dF = (s: string) => gb(new Date(`${s}T00:00`), { weekday: "short", day: "numeric", month: "short" });
// A timed block reads "12 Oct – 14 Oct · 2:00 pm – 5:00 pm · Training" (round 2); one without t1 / t2 is the whole day.
const bTxt = (b: CrmBlock) => (b.a === (b.b || b.a) ? dF(b.a) : `${dF(b.a)} – ${dF(b.b)}`) + (b.t1 && b.t2 ? ` · ${t12(b.t1)} – ${t12(b.t2)}` : "") + (b.why ? ` · ${b.why}` : "");
/** A slot's weekdays: "HH:MM" every day, "HH:MM@0123" on those (0 = Monday). */
const sDays = (s: string) => (s.includes("@") ? s.split("@")[1].split("").map(Number) : ALL);
const dTxt = (d: number[]) => (d.length === 7 ? "Every day" : d.join("") === "01234" ? "Mon – Fri" : d.join("") === "56" ? "Sat, Sun" : d.map(x => WD[x]).join(", "));
const srt = (a: string[]) => [...new Set(a)].sort();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad2 = (h: number) => `${String(h).padStart(2, "0")}:00`;
/** v3 T07 · opening hours from (and into) the weekly slots. Only whole-hour slots are rewritten; one off the hour stays. */
function hoursOf(d: RoomDraft, on: (h: number, k: number) => boolean, begin: (p: Partial<RoomDraft>) => void) {
  const rangeOf = (k: number) => { const hs = Array.from({ length: 24 }, (_, h) => h).filter(h => on(h, k)); return hs.length ? { f: hs[0], t: hs[hs.length - 1] + 1 } : null; };
  const setDays = (ks: number[], f: number, t: number | null) => {
    const M = Array.from({ length: 24 }, (_, h) => Array.from({ length: 7 }, (_, k) => on(h, k)));
    ks.forEach(k => { for (let h = 0; h < 24; h++) M[h][k] = t != null && h >= f && h < t; });
    const kept = d.slots.filter(s => !s.split("@")[0].endsWith(":00"));
    const whole = M.flatMap((row, h) => { const ds = row.map((x, k) => (x ? k : -1)).filter(k => k >= 0); return ds.length ? [ds.length === 7 ? pad2(h) : `${pad2(h)}@${ds.join("")}`] : []; });
    // A day opened here is no longer closed every week.
    begin({ slots: [...whole, ...kept].sort(), weekly: t != null ? d.weekly.filter(w => !ks.some(k => WI[k] === w)) : d.weekly });
  };
  const rs = DN.map((_, k) => rangeOf(k)), first = rs.find(Boolean) ?? { f: 10, t: 21 };
  const txt = (r: { f: number; t: number } | null) => (r ? `${pad2(r.f)} – ${pad2(r.t)}` : "Closed");
  const groups: { label: string; hours: string; open: boolean; days: number[] }[] = [];
  rs.forEach((r, k) => { const g = groups[groups.length - 1], h = txt(r);
    if (g && g.hours === h) { g.days.push(k); g.label = `${DN[g.days[0]]} – ${DN[k]}`; } else groups.push({ label: DN[k], hours: h, open: !!r, days: [k] }); });
  const hourOf = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(0, Math.min(24, n)) : null; };
  return {
    // v4 3a: Copy Mon to all — every other day takes Monday's hours, or closes with it.
    copyMon: () => (rs[0] ? setDays([1, 2, 3, 4, 5, 6], rs[0].f, rs[0].t) : setDays([1, 2, 3, 4, 5, 6], 0, null)),
    all: { f: pad2(first.f), t: pad2(first.t), apply: (fv: string, tv: string) => { const f = hourOf(fv), t = hourOf(tv); if (f == null || t == null || t <= f) return; const open = rs.map((r, k) => (r ? k : -1)).filter(k => k >= 0); setDays(open.length ? open : [0, 1, 2, 3, 4, 5, 6], f, t); } },
    groups: groups.map(g => ({ label: g.label, hours: g.hours, open: g.open, days: g.days.map(k => { const r = rs[k];
      return { l: DN[k], open: !!r, f: r ? pad2(r.f) : pad2(first.f), t: r ? pad2(r.t) : pad2(first.t),
        set: (fv: string, tv: string) => { const f = hourOf(fv), t = hourOf(tv); if (f != null && t != null && t > f) setDays([k], f, t); },
        toggle: () => (r ? setDays([k], 0, null) : setDays([k], first.f, first.t)) }; }) })),
  };
}

const draftOf = (r: CrmRoom | null, i: number): RoomDraft => ({
  i, id: r?.id ?? null, name: r?.name ?? "", addr: r?.address ?? "", remarks: r?.remarks ?? "", slots: r ? [...r.slots] : [], cap: r?.cap ?? 2, weekly: r ? [...r.weekly] : [], blocks: r ? r.blocks.map(b => ({ ...b })) : [],
  newT: "", newD: null, bA: "", bB: "", bWhy: "", bAll: true, bT1: "", bT2: "", bPick: null, calFor: null, calYM: null,
});

export function roomsVM(ctx: PanelCtx) {
  const { ui, set, patch, data, now, act } = ctx;
  const rooms = data.rooms.filter(r => r.active), ed = ui.rmEdit;
  const setD = (p: Partial<RoomDraft>) => set(u => (u.rmEdit ? { ...u, rmEdit: { ...u.rmEdit, ...p } } : u));
  // A showroom being added shows as one more row, in edit.
  const shown: (CrmRoom | null)[] = [...rooms, ...(ed && ed.id === null ? [null] : [])];
  const quickNew = !!ed && ed.id === null && !!ed.quick;
  void quickNew;
  const T = iso(now);
  // One showroom at a time (the owner, 2026-10-16: "如果都在下面太長了"): the one being edited, else the one ‹ › reached.
  const at = ed ? ed.i : Math.min(Math.max(0, ui.rmAt ?? 0), Math.max(0, shown.length - 1));
  const step = (d: 1 | -1) => () => { if (!ed) set(u => ({ ...u, rmAt: Math.min(Math.max(0, at + d), shown.length - 1) })); };

  // ── 4a (T07): the showroom as one page you edit in place — its name and address typed where they stand, the map
  // links, visits per slot, the weekly slots as a 24 × 7 grid (a cell is that hour that weekday: tapping it opens or
  // closes the slot on the hour), and the closures. Any change starts a draft; a Save bar comes up; Save writes the
  // whole showroom as the editor does (act.saveRoom → crm_save_showroom). Add closure opens the full editor.
  const quick4 = (r: CrmRoom | null, i: number) => {
    const mine = !!ed && ed.i === i && !!ed.quick, d: RoomDraft = mine ? ed! : draftOf(r, i);
    const begin = (p: Partial<RoomDraft>) => set(u => ({ ...u, rmEdit: { ...(u.rmEdit && u.rmEdit.i === i && u.rmEdit.quick ? u.rmEdit : { ...draftOf(r, i), quick: true }), ...p } }));
    const saved = draftOf(r, i);
    const dirty = mine && ((d.remarks ?? "") !== (saved.remarks ?? "") || d.name !== saved.name || d.addr !== saved.addr || d.cap !== saved.cap || JSON.stringify(srt(d.slots)) !== JSON.stringify(srt(saved.slots)) || JSON.stringify([...d.weekly].sort()) !== JSON.stringify([...saved.weekly].sort()));
    const q = encodeURIComponent(d.addr || d.name);
    const hourOf = (s: string) => Number(s.split("@")[0].split(":")[0]);
    const on = (h: number, k: number) => d.slots.some(s => hourOf(s) === h && sDays(s).includes(k)) && !d.weekly.includes(WI[k]);
    const toggle = (h: number, k: number) => {
      const isOn = d.slots.some(s => hourOf(s) === h && sDays(s).includes(k));
      let next = d.slots;
      if (isOn) next = d.slots.flatMap(s => { if (hourOf(s) !== h) return [s]; const ds = sDays(s).filter(x => x !== k), b = s.split("@")[0]; return ds.length ? [ds.length === 7 ? b : `${b}@${ds.join("")}`] : []; });
      else { const b = `${String(h).padStart(2, "0")}:00`, ex = d.slots.find(s => s.split("@")[0] === b), ds = ex ? [...sDays(ex), k].sort() : [k];
        next = [...d.slots.filter(s => s !== ex), ds.length === 7 ? b : `${b}@${ds.join("")}`]; }
      begin({ slots: srt(next), ...(isOn ? {} : { weekly: d.weekly.filter(x => x !== WI[k]) }) });
    };
    return {
      name: d.name, addr: d.addr, setName: (e: ChangeEvent<HTMLInputElement>) => begin({ name: e.target.value }), setAddr: (e: ChangeEvent<HTMLInputElement>) => begin({ addr: e.target.value }),
      gmaps: `https://www.google.com/maps/search/?api=1&query=${q}`, waze: `https://waze.com/ul?q=${q}&navigate=yes`, hasAddr: !!d.addr,
      cap: d.cap, capMinus: d.cap > 1 ? () => begin({ cap: d.cap - 1 }) : undefined, capPlus: d.cap < 10 ? () => begin({ cap: d.cap + 1 }) : undefined,
      days: ["M", "T", "W", "T", "F", "S", "S"],
      // Every hour named, as the desktop (2026-10-18).
      grid: Array.from({ length: 24 }, (_, h) => ({ label: `${h % 12 || 12}${h < 12 ? "am" : "pm"}`, cells: WD.map((_, k) => ({ on: on(h, k), pick: () => toggle(h, k) })) })),
      // Off the hour (e.g. 11:30) a slot still counts for its hour on the grid; the editor keeps the exact times.
      odd: d.slots.filter(s => !s.split("@")[0].endsWith(":00")).map(s => t12(s)),
      closures: [...WI.filter(w => d.weekly.includes(w)).map(w => ({ day: `Every ${WD[WI.indexOf(w)]}`, what: "All day", rm: () => begin({ weekly: d.weekly.filter(x => x !== w) }) })),
        ...d.blocks.map(b => ({ day: b.a === (b.b || b.a) ? dF(b.a) : `${dF(b.a)} – ${dF(b.b)}`, what: [(b as CrmBlock).t1 && (b as CrmBlock).t2 ? `${t12((b as CrmBlock).t1!)} – ${t12((b as CrmBlock).t2!)}` : "All day", b.why].filter(Boolean).join(" · "),
          rm: () => begin({ blocks: d.blocks.filter(x => x !== b) }) }))],
      addClosure: () => patch({ rmEdit: { ...(mine ? d : draftOf(r, i)), quick: false } }),
      dirty, cancel: () => patch({ rmEdit: null }),
      save: () => void act.saveRoom({ id: d.id, name: d.name.trim() || "Showroom", address: d.addr.trim(), active: true, slots: d.slots, cap: d.cap, weekly: d.weekly, blocks: d.blocks })
        .then(async id => { if (!id) return; if ((d.remarks ?? "") !== (saved.remarks ?? "") && !(await act.saveRoomRemarks(id, d.remarks ?? ""))) return; patch({ rmEdit: null }); }),
      // v3 T07: opening hours typed in — All days + Apply to all days, then the days grouped by the same hours; a group opens
      // to its single days. They ARE the weekly slots: a day's hours = its first open hour to the hour after its last.
      hours: hoursOf(d, on, begin),
      remarks: d.remarks ?? "", setRemarks: (e: ChangeEvent<HTMLTextAreaElement>) => begin({ remarks: e.target.value.slice(0, 1000) }),
      del: () => patch({ rmDel: i }), canDel: !!r,
    };
  };
  const rmList = shown.map((r, i) => {
    const editing = !!ed && ed.i === i && !ed.quick, name = r?.name ?? "", addr = r?.address ?? "", slots = r?.slots ?? [], weekly = r?.weekly ?? [], blocks = r?.blocks ?? [], cap = r?.cap ?? 2;
    const q = encodeURIComponent(addr || name);
    const view = {
      view: !editing, editing, name: name || "New showroom", addrShow: addr || "No address yet", addrFg: addr ? "var(--crm-ink)" : "var(--crm-faint)",
      slotChips: slots.map(s => { const ds = sDays(s); return { t: t12(s), days: ["M", "T", "W", "T", "F", "S", "S"].map((n, k) => { const o = ds.includes(k); return { n, bg: o ? "var(--crm-rust)" : "var(--crm-field)", fg: o ? "#fff" : "var(--crm-faint-2)", open: o, closed: !o, cBg: o ? "var(--crm-rust)" : "var(--crm-page)", cBd: o ? "var(--crm-rust)" : "var(--crm-rule-soft)", cFg: o ? "#fff" : "var(--crm-line)" }; }) }; }),
      noSlots: !slots.length, capShort: `${cap} per slot`,
      noBlock: !(blocks.length || weekly.length), blockChips: [...(weekly.length ? [`Every ${wkTxt(weekly)}`] : []), ...blocks.map(bTxt)].map(t => ({ t })),
      waze: `https://waze.com/ul?q=${q}&navigate=yes`, gmaps: `https://www.google.com/maps/search/?api=1&query=${q}`, navOp: addr ? 1 : 0.4,
      edit: () => patch({ rmEdit: draftOf(r, i) }), del: () => patch({ rmDel: i }),
      q4: quick4(r, i),
    };
    if (!editing || !ed) return { ...view, ...closedEditor };
    // The From / To month calendar for a blocked date (a phone's own date picker cannot open in here).
    const who = ed.calFor, cur = who === "B" ? ed.bB || ed.bA : ed.bA;
    const base0 = cur ? cur.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
    const [y, m] = ed.calYM ?? [base0[0], base0[1] - 1];
    const firstD = new Date(y, m, 1), lead = (firstD.getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), min = who === "B" && ed.bA ? ed.bA : T;
    const pickV = (v: string) => (who === "B" ? setD({ bB: v, calFor: null, calYM: null }) : setD({ bA: v, bB: ed.bB && ed.bB >= v ? ed.bB : v, calFor: null, calYM: null }));
    const calDays = [
      ...Array.from({ length: lead }, () => ({ n: "" as number | string, bg: "transparent", fg: "#fff", fw: 500, cur: "default", pick: undefined as (() => void) | undefined })),
      ...Array.from({ length: dim }, (_, k) => {
        const v = iso(new Date(y, m, k + 1)), off = v < min, on = v === cur, inR = !!ed.bA && v >= ed.bA && v <= (ed.bB || ed.bA);
        return { n: k + 1 as number | string, pick: off ? undefined : () => pickV(v), bg: on ? "var(--crm-rust)" : inR ? "var(--crm-tint-attention)" : "transparent", fg: on ? "#fff" : off ? "var(--crm-line)" : "var(--crm-ink)", fw: on || v === T ? 700 : 500, cur: off ? "default" : "pointer" };
      }),
    ];
    const tog = (k: "A" | "B") => () => setD({ calFor: ed.calFor === k ? null : k, calYM: null });
    const blockOk = !!ed.bA && (ed.bAll || (!!ed.bT1 && !!ed.bT2 && ed.bT2 > ed.bT1));
    const nd = ed.newD ?? ALL;
    return {
      ...view,
      dName: ed.name, dAddr: ed.addr, setName: (e: ChangeEvent<HTMLInputElement>) => setD({ name: e.target.value }), setAddr: (e: ChangeEvent<HTMLTextAreaElement>) => setD({ addr: e.target.value }),
      // Every week: tap a weekday to close it each week.
      dWeek: WI.map((d, k) => { const on = ed.weekly.includes(d); return { label: WD[k], on, pick: () => setD({ weekly: on ? ed.weekly.filter(x => x !== d) : [...ed.weekly, d] }), bg: on ? "var(--crm-ink)" : "#fff", fg: on ? "#fff" : "var(--crm-ink)", bd: on ? "var(--crm-ink)" : "var(--crm-rule)" }; }),
      dBlocks: ed.blocks.map(b => ({ t: bTxt(b), rm: () => setD({ blocks: ed.blocks.filter(x => x !== b) }) })),
      dBAtxt: ed.bA ? dF(ed.bA) : "Pick date", dBBtxt: ed.bB || ed.bA ? dF(ed.bB || ed.bA) : "Pick date",
      dBAfg: ed.bA ? "var(--crm-ink)" : "var(--crm-faint)", dBBfg: ed.bB || ed.bA ? "var(--crm-ink)" : "var(--crm-faint)", dBWhy: ed.bWhy, setBWhy: (e: ChangeEvent<HTMLInputElement>) => setD({ bWhy: e.target.value }),
      calOpen: !!who, calTitle: gb(firstD, { month: "long", year: "numeric" }), calWk: ["M", "T", "W", "T", "F", "S", "S"], calDays,
      calPrev: () => setD({ calYM: [m ? y : y - 1, (m + 11) % 12] }), calNext: () => setD({ calYM: [m === 11 ? y + 1 : y, (m + 1) % 12] }),
      openA: tog("A"), openB: tog("B"), dBAbd: who === "A" ? "var(--crm-rust)" : "var(--crm-rule)", dBBbd: who === "B" ? "var(--crm-rust)" : "var(--crm-rule)",
      blockBg: blockOk ? "var(--crm-ink)" : "var(--crm-line)",
      addBlock: blockOk ? () => setD({
        blocks: [...ed.blocks, { a: ed.bA, b: ed.bB && ed.bB >= ed.bA ? ed.bB : ed.bA, why: ed.bWhy.trim(), ...(ed.bAll ? {} : { t1: ed.bT1, t2: ed.bT2 }) }].sort((x, z) => (x.a < z.a ? -1 : 1)),
        bA: "", bB: "", bWhy: "", bAll: true, bT1: "", bT2: "",
      }) : undefined,
      // Round 2 (rev 1011 §8): a closure is the whole day or set hours — All day | Set hours, then From – To, each opening a
      // grid of half hours 8 am – 10 pm; picking From jumps to To; To at or before From is greyed. The prototype's.
      dBAll: ed.bAll, dBHours: !ed.bAll,
      dBMode: ([["All day", true], ["Set hours", false]] as const).map(([label, v]) => {
        const on = ed.bAll === v;
        return { label, pick: () => setD({ bAll: v }), bg: on ? "#fff" : "transparent", fg: on ? "var(--crm-ink)" : "var(--crm-muted)", w: on ? 650 : 500, sh: on ? "0 1px 3px rgba(42,22,12,.12)" : "none" };
      }),
      dBT1txt: ed.bT1 ? t12(ed.bT1) : "From", dBT2txt: ed.bT2 ? t12(ed.bT2) : "To",
      dBT1fg: ed.bT1 ? "var(--crm-ink)" : "var(--crm-faint)", dBT2fg: ed.bT2 ? "var(--crm-ink)" : "var(--crm-faint)",
      dBT1bd: ed.bPick === "t1" ? "var(--crm-rust)" : "var(--crm-rule)", dBT2bd: ed.bPick === "t2" ? "var(--crm-rust)" : "var(--crm-rule)",
      openT1: () => setD({ bPick: ed.bPick === "t1" ? null : "t1" }), openT2: () => setD({ bPick: ed.bPick === "t2" ? null : "t2" }),
      dBTOpen: !!ed.bPick, dBTTitle: ed.bPick === "t2" ? "Blocked until" : "Blocked from",
      // The whole day, 12 am to 11 pm, every half hour (the owner, 2026-10-15; it ran 8 am – 10 pm).
      dBTimes: Array.from({ length: 47 }, (_, k) => {
        const mm = k * 30, v = String(Math.floor(mm / 60)).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0");
        const key = ed.bPick === "t2" ? "bT2" : "bT1", on = ed[key] === v, off = key === "bT2" && !!ed.bT1 && v <= ed.bT1;
        return {
          t: t12(v).replace(":00", ""), bg: on ? "var(--crm-rust)" : off ? "var(--crm-cream-nav)" : "#fff", fg: on ? "#fff" : off ? "var(--crm-faint-2)" : "var(--crm-ink)", bd: on ? "var(--crm-rust)" : off ? "var(--crm-cream-nav)" : "var(--crm-rule)",
          cur: off ? "not-allowed" : "pointer", pick: off ? undefined : () => setD({ [key]: v, bPick: key === "bT1" && !ed.bT2 ? "t2" : null }),
        };
      }),
      dBTimeErr: !ed.bAll && !!ed.bT1 && !!ed.bT2 && ed.bT2 <= ed.bT1,
      // Groups per slot (1–10): a slot that reaches it shows Full in Book visit.
      dCap: ed.cap, capMinus: ed.cap > 1 ? () => setD({ cap: ed.cap - 1 }) : undefined, capPlus: ed.cap < 10 ? () => setD({ cap: ed.cap + 1 }) : undefined,
      capMinusFg: ed.cap > 1 ? "var(--crm-ink)" : "var(--crm-line)", capPlusFg: ed.cap < 10 ? "var(--crm-ink)" : "var(--crm-line)",
      // One row per time, one column per weekday: tap a cell to open / close that time that day.
      dGrid: ed.slots.map(s => {
        const ds = sDays(s), b = s.split("@")[0];
        return { t: t12(s), cnt: ds.length === 7 ? "Every day" : `${ds.length} days`, rm: () => setD({ slots: ed.slots.filter(x => x !== s) }),
          cells: WD.map((_, k) => { const on = ds.includes(k); return { on, bg: on ? "var(--crm-rust)" : k > 4 ? "var(--crm-field)" : "var(--crm-page)", fg: on ? "#fff" : "var(--crm-faint-2)",
            pick: () => { const nds = on ? ds.filter(x => x !== k) : [...ds, k].sort(); setD({ slots: nds.length ? ed.slots.map(x => (x === s ? (nds.length === 7 ? b : `${b}@${nds.join("")}`) : x)) : ed.slots.filter(x => x !== s) }); } }; }) };
      }),
      dGridHead: ["M", "T", "W", "T", "F", "S", "S"],
      // The weekdays the next time added opens on (every day to start).
      dNewDays: WD.map((n, k) => { const on = nd.includes(k); return { label: n[0], on, bg: on ? "var(--crm-rust)" : "#fff", fg: on ? "#fff" : "var(--crm-muted)", bd: on ? "var(--crm-rust)" : "var(--crm-rule)", pick: () => setD({ newD: on ? (nd.length > 1 ? nd.filter(x => x !== k) : nd) : [...nd, k].sort() }) }; }),
      dNewDaysTxt: dTxt(nd), dNoSlots: !ed.slots.length,
      newTLbl: ed.newT ? t12(ed.newT) : "Pick a time", newTFg: ed.newT ? "var(--crm-ink)" : "var(--crm-faint)",
      openTP: () => { const [H, M] = (ed.newT || "11:00").split(":").map(Number); patch({ rmTP: { h: H % 12 || 12, m: M, ap: H < 12 ? "am" : "pm" } }); },
      addBg: ed.newT ? "var(--crm-rust)" : "var(--crm-line)",
      addSlot: ed.newT ? () => setD({ slots: srt([...ed.slots.filter(x => x.split("@")[0] !== ed.newT), ed.newT + (nd.length < 7 ? `@${nd.join("")}` : "")]), newT: "", newD: null }) : undefined,
      cancel: () => patch({ rmEdit: null }),
      save: () => void act.saveRoom({ id: ed.id, name: ed.name.trim() || "Showroom", address: ed.addr.trim(), active: true, slots: ed.slots, cap: ed.cap, weekly: ed.weekly, blocks: ed.blocks }).then(ok => { if (ok) patch({ rmEdit: null }); }),
      remove: () => patch({ rmDel: i }),
    };
  });

  const tp = ui.rmTP;
  const setT = (p: Partial<NonNullable<typeof tp>>) => set(u => (u.rmTP ? { ...u, rmTP: { ...u.rmTP, ...p } } : u));
  const opt = (on: boolean, pick: () => void, t: string) => ({ t, pick, bg: on ? "var(--crm-rust)" : "transparent", fg: on ? "#fff" : "var(--crm-ink)", w: on ? 700 : 500 });
  const H24 = tp ? (tp.h % 12) + (tp.ap === "pm" ? 12 : 0) : 0, val = tp ? `${String(H24).padStart(2, "0")}:${String(tp.m).padStart(2, "0")}` : "";
  const del = ui.rmDel != null ? shown[ui.rmDel] : undefined;
  return {
    // v4 (3a / 4a): the in-place page is PanelShowrooms4; the old page stays only for the full editor (Add closure).
    fullEd: !!ed && !ed.quick, page4: ui.roomsOpen && !(ed && !ed.quick) ? showroomsPageVM(ctx) : null,
    rmOpen: ui.roomsOpen, stop, closeRooms: () => patch({ roomsOpen: false, rmEdit: null }),
    rmAdd: () => patch({ rmEdit: { ...draftOf(null, rooms.length), quick: true }, rmAt: rooms.length }),
    rmList: rmList.filter((_, i) => i === at),
    // v3 T07: Delete is a trash icon in the header, for the showroom on screen.
    rmCanDel: !!shown[at] && !ed, rmDelCur: () => patch({ rmDel: at }),
    rmPager: shown.length > 1, rmPos: `${at + 1} / ${shown.length}`, rmPrev: step(-1), rmNext: step(1),
    rmPrevOp: !ed && at > 0 ? 1 : 0.3, rmNextOp: !ed && at < shown.length - 1 ? 1 : 0.3,
    tpOpen: !!tp, tpClose: () => patch({ rmTP: null }), tpStop: (e: SyntheticEvent) => e.stopPropagation(),
    tpH: tp ? Array.from({ length: 12 }, (_, k) => k + 1).map(v => opt(tp.h === v, () => setT({ h: v }), String(v))) : [],
    tpM: tp ? [0, 15, 30, 45].map(v => opt(tp.m === v, () => setT({ m: v }), String(v).padStart(2, "0"))) : [],
    tpA: tp ? (["am", "pm"] as const).map(v => opt(tp.ap === v, () => setT({ ap: v }), v)) : [],
    tpLabel: val ? t12(val) : "", tpDone: () => set(u => ({ ...u, rmTP: null, rmEdit: u.rmEdit ? { ...u.rmEdit, newT: val } : u.rmEdit })),
    rmDelOpen: ui.rmDel != null && del !== undefined, rmDelName: del ? del.name || "this showroom" : "",
    rmDelNo: () => patch({ rmDel: null }),
    rmDelYes: () => {
      const r = del; patch({ rmDel: null, rmEdit: null });
      if (r) void act.removeRoom(r.id);
    },
  };
}
export type RoomsVM = ReturnType<typeof roomsVM>;

// ── v4 turn 3 / 4 (frames 3a, 4a, 4a·2, 4a·3 — docs/design_handoff_crm_redesign_v4): Showrooms as ONE page with a tab a
// showroom. Back and + in the header; the details, Opening hours (a row a weekday, Copy Mon to all, the slot grid as a
// fine-tune link), Visits per slot, Closures, Remarks, Delete at the foot. Changes are a DRAFT until Publish: the bar says
// how many, Save draft keeps them under the saver's name (crm_save_showroom_draft — the desktop's own store and shape, so
// a draft saved on either side opens on the other), Publish writes the showroom as before (crm_save_showroom_full).
// A showroom with a saved draft opens on it: its tab carries the saver's initials, a banner names who and when and what
// changed. Back (the header's ‹ or the phone's) with unsaved changes asks Save draft / Discard changes / Keep editing.

const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** A showroom as the desktop keeps it, from the phone's draft (the room's photo and map links kept as they are). */
function roomLike(d: RoomDraft, r: CrmRoom | null): CrmRoom {
  return { id: r?.id ?? "", name: d.name, active: true, address: d.addr, slots: [...d.slots], cap: d.cap, weekly: [...d.weekly], blocks: d.blocks.map(b => ({ ...b })) as CrmBlock[],
    photo: r?.photo ?? null, mapGoogle: r?.mapGoogle ?? null, mapWaze: r?.mapWaze ?? null, remarks: d.remarks ?? "" };
}
/** The phone's draft as crm_showroom_drafts keeps it — the desktop's SrDraft (desk/vm/showrooms.ts). */
export function roomDraftToStore(d: RoomDraft, r: CrmRoom | null): Record<string, unknown> { return draftToStore(deskDraftOf(roomLike(d, r))); }
/** A kept draft (either side's) back into the phone's, laid over the showroom as it stands. */
export function roomDraftFromStore(stored: unknown, r: CrmRoom | null, i: number): RoomDraft {
  const sr = draftFromStore(stored, r), x = roomOf(sr);
  return draftOf({ id: r?.id ?? "", name: sr.dispName, active: true, address: x.address, slots: x.slots, cap: x.cap, weekly: x.weekly, blocks: x.blocks, remarks: sr.remarks ?? "" }, i);
}
/** Each weekday's opening hours as Opening hours shows them ("10:00 – 21:00" / "Closed"), Monday first. */
function dayHours(d: RoomDraft): string[] {
  const hourOf = (s: string) => Number(s.split("@")[0].split(":")[0]);
  return DN.map((_, k) => {
    if (d.weekly.includes(WI[k])) return "Closed";
    const hs = d.slots.filter(s => sDays(s).includes(k)).map(hourOf).sort((a, b) => a - b);
    return hs.length ? `${pad2(hs[0])} – ${pad2(hs[hs.length - 1] + 1)}` : "Closed";
  });
}
/** What changed from `a` to `b`, in the banner's words ("Visits per slot 3 → 4", "Sunday closed"). */
export function roomChanges(a: RoomDraft, b: RoomDraft): string[] {
  const out: string[] = [];
  if (a.name.trim() !== b.name.trim()) out.push("Name");
  if (a.addr.trim() !== b.addr.trim()) out.push("Address");
  const ha = dayHours(a), hb = dayHours(b);
  let hours = false;
  ha.forEach((h, k) => {
    if (h === hb[k]) return;
    hours = true;
    out.push(hb[k] === "Closed" ? `${DAY_FULL[k]} closed` : h === "Closed" ? `${DAY_FULL[k]} open` : `${DAY_FULL[k]} hours`);
  });
  if (!hours && JSON.stringify(srt(a.slots)) !== JSON.stringify(srt(b.slots))) out.push("Slot grid");
  if (a.cap !== b.cap) out.push(`Visits per slot ${a.cap} → ${b.cap}`);
  const bk = (d: RoomDraft) => JSON.stringify(d.blocks.map(x => [x.a, x.b || x.a, x.why ?? "", (x as CrmBlock).t1 ?? "", (x as CrmBlock).t2 ?? ""]).sort());
  if (bk(a) !== bk(b)) out.push("Closures");
  if ((a.remarks ?? "").trim() !== (b.remarks ?? "").trim()) out.push("Remarks");
  return out;
}
const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
/** When a draft was saved, on the office's clock: "14:02" today, "8 Nov, 14:02" before. */
function savedAt(iso: string, now: Date): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const o = new Date(t.getTime() + 8 * 3_600_000), n = new Date(now.getTime() + 8 * 3_600_000);
  const hm = `${String(o.getUTCHours()).padStart(2, "0")}:${String(o.getUTCMinutes()).padStart(2, "0")}`;
  const same = o.getUTCFullYear() === n.getUTCFullYear() && o.getUTCMonth() === n.getUTCMonth() && o.getUTCDate() === n.getUTCDate();
  return same ? hm : `${o.getUTCDate()} ${MONS[o.getUTCMonth()]}, ${hm}`;
}
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A tab's name: a word every showroom's name starts with ("HOUZS") is left off — "Puchong", "Setia Alam". */
function tabNames(names: string[]): string[] {
  const words = names.map(n => n.trim().split(/\s+/));
  const w = words[0]?.[0];
  const shared = names.length > 1 && !!w && words.every(p => p.length > 1 && p[0].toLowerCase() === w.toLowerCase());
  return names.map((n, i) => (shared ? words[i].slice(1).join(" ") : n.trim()) || "New showroom");
}

/** The kept draft's key for a showroom: its id, or "new" for one not added yet (the desktop's). */
const draftKeyOf = (r: CrmRoom | null) => r?.id ?? "new";

/** How many changes the showroom edited in place holds that are saved nowhere — Back asks before they are lost (4a·3). */
export function roomUnsaved(ui: Pick<PanelUi, "rmEdit">, data: Pick<CrmData, "rooms" | "roomDrafts">): number {
  const ed = ui.rmEdit;
  if (!ed || !ed.quick) return 0;
  const rooms = data.rooms.filter(r => r.active), r = ed.id ? rooms.find(x => x.id === ed.id) ?? null : null;
  const kept = data.roomDrafts?.[draftKeyOf(r)];
  const base = kept ? roomDraftFromStore(kept.draft, r, ed.i) : draftOf(r, ed.i);
  return roomChanges(base, ed).length;
}

export function showroomsPageVM(ctx: PanelCtx) {
  const { ui, set, patch, data, act, now } = ctx;
  const rooms = data.rooms.filter(r => r.active), ed = ui.rmEdit;
  const keptNew = data.roomDrafts?.new;
  // A showroom being added — or one whose draft is kept — is one more tab.
  const shown: (CrmRoom | null)[] = [...rooms, ...((ed && ed.id === null) || keptNew ? [null] : [])];
  const at = Math.min(Math.max(0, ed ? ed.i : ui.rmAt ?? 0), Math.max(0, shown.length - 1));
  const r = shown[at] ?? null;
  const key = draftKeyOf(r), kept = data.roomDrafts?.[key];
  const published = draftOf(r, at);
  const base = kept ? roomDraftFromStore(kept.draft, r, at) : published;
  const mine = !!ed && !!ed.quick && ed.i === at;
  const d: RoomDraft = mine ? ed! : base;
  const local = mine ? roomChanges(base, d) : [];
  const notLive = kept ? roomChanges(published, base) : [];
  const begin = (p: Partial<RoomDraft>) => set(u => ({ ...u, rmEdit: { ...(u.rmEdit && u.rmEdit.i === at && u.rmEdit.quick ? u.rmEdit : { ...base, quick: true }), ...p } }));
  const hourOf = (s: string) => Number(s.split("@")[0].split(":")[0]);
  const on = (h: number, k: number) => d.slots.some(s => hourOf(s) === h && sDays(s).includes(k)) && !d.weekly.includes(WI[k]);
  const hours = hoursOf(d, on, begin), dh = dayHours(d);
  const q4 = rmQuick(ctx, r, at, d, begin);
  const who = kept ? data.people.find(p => p.id === kept.by)?.name ?? "" : "";
  const newDraft = () => ({ ...(keptNew ? roomDraftFromStore(keptNew.draft, null, rooms.length) : draftOf(null, rooms.length)), quick: true });
  // Where the page goes once the leave sheet is answered: out (Back), another tab, or + (−1).
  const leave = (to?: number) => patch(to === undefined ? { roomsOpen: false, rmEdit: null, rmLeave: false }
    : to < 0 ? { rmLeave: false, rmEdit: newDraft(), rmAt: rooms.length } : { rmLeave: false, rmEdit: null, rmAt: to });
  const pending = (): number | undefined => (typeof ui.rmLeave === "object" && ui.rmLeave ? ui.rmLeave.to : undefined);
  const saveDraft = async () => !!act.saveRoomDraft && (await act.saveRoomDraft(key, roomDraftToStore(d, r)));
  const nameOfTab = (x: CrmRoom | null) => x?.name ?? (ed && ed.id === null ? ed.name : keptNew ? roomDraftFromStore(keptNew.draft, null, rooms.length).name : "");
  const names = tabNames(shown.map(nameOfTab));
  const tagOf = (by: string | null | undefined) => { const n = by ? data.people.find(p => p.id === by)?.name ?? "" : ""; return `${n ? initialsOf(n) + " " : ""}draft`; };
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return {
    back: () => (local.length ? patch({ rmLeave: true }) : patch({ roomsOpen: false, rmEdit: null })),
    add: () => (local.length ? patch({ rmLeave: { to: -1 } }) : leave(-1)),
    tabs: shown.map((x, i) => {
      const k = data.roomDrafts?.[draftKeyOf(x)];
      return { label: names[i], on: i === at, tag: k ? tagOf(k.by) : "",
        pick: () => { if (i !== at) { if (local.length) patch({ rmLeave: { to: i } }); else leave(i); } } };
    }),
    banner: kept ? { ini: who ? initialsOf(who) : "", title: `${who ? `${who}’s draft` : "Draft"} · saved ${savedAt(kept.at, now)}`,
      sub: `${notLive.length ? notLive.join(", ") + ". " : ""}Sales still see the published version.` } : null,
    name: d.name, setName: q4.setName, addr: d.addr, setAddr: (e: ChangeEvent<HTMLTextAreaElement>) => begin({ addr: e.target.value }),
    gmaps: q4.gmaps, waze: q4.waze, hasAddr: q4.hasAddr,
    days: hours.groups.flatMap(g => g.days).map((x, k) => ({ l: x.l, hours: dh[k], open: dh[k] !== "Closed", f: x.f, t: x.t, set: x.set, toggle: x.toggle })),
    copyMon: hours.copyMon,
    gridDays: q4.days, grid: q4.grid, odd: q4.odd,
    cap: d.cap, capMinus: q4.capMinus, capPlus: q4.capPlus,
    closures: d.blocks.map(b => ({ date: b.a === (b.b || b.a) ? dF(b.a) : `${dF(b.a)} – ${dF(b.b)}`,
      sub: [(b as CrmBlock).t1 && (b as CrmBlock).t2 ? `${t12((b as CrmBlock).t1!)} – ${t12((b as CrmBlock).t2!)}` : "All day", b.why].filter(Boolean).join(" · "),
      rm: () => begin({ blocks: d.blocks.filter(x => x !== b) }) })),
    addClosure: q4.addClosure,
    remarks: d.remarks ?? "", setRemarks: q4.setRemarks,
    canDel: !!r, del: () => patch({ rmDel: at }),
    // The bar: unsaved changes (Save draft · Publish), else a kept draft (Discard · Publish), else none.
    bar: local.length ? { kind: "dirty" as const, title: `${plural(local.length, "unsaved change")}`, sub: "Sales see the published version" }
      : kept ? { kind: "draft" as const, title: "Draft saved", sub: `${plural(Math.max(1, notLive.length), "change")} not live` } : null,
    canDraft: !!act.saveRoomDraft,
    saveDraft: () => void saveDraft().then(ok => { if (ok) patch({ rmEdit: null }); }),
    discardDraft: () => void (act.saveRoomDraft ? act.saveRoomDraft(key, null) : Promise.resolve(false)).then(ok => { if (ok) patch({ rmEdit: null }); }),
    publish: () => void act.saveRoom({ id: r?.id ?? null, name: d.name.trim() || "Showroom", address: d.addr.trim(), active: true, slots: d.slots, cap: d.cap, weekly: d.weekly, blocks: d.blocks })
      .then(async id => {
        if (!id) return;
        if ((d.remarks ?? "") !== (r?.remarks ?? "") && !(await act.saveRoomRemarks(id, d.remarks ?? ""))) return;
        if (kept && act.saveRoomDraft) await act.saveRoomDraft(key, null);
        patch({ rmEdit: null, rmAt: at });
      }),
    // 4a·3: Back with unsaved changes.
    leaveOpen: !!ui.rmLeave && local.length > 0,
    leaveSub: `${plural(local.length, "change")} to ${d.name.trim() || "this showroom"}. A draft keeps them under your name; sales won’t see them.`,
    leaveSave: () => void saveDraft().then(ok => { if (ok) leave(pending()); }),
    leaveDiscard: () => leave(pending()),
    leaveKeep: () => patch({ rmLeave: false }),
  };
}
export type ShowroomsPageVM = ReturnType<typeof showroomsPageVM>;

/** The in-place page's fields the 4a page (T07) already worked out: map links, visits per slot, the slot grid. */
function rmQuick(ctx: PanelCtx, r: CrmRoom | null, i: number, d: RoomDraft, begin: (p: Partial<RoomDraft>) => void) {
  const { patch } = ctx;
  const q = encodeURIComponent(d.addr || d.name);
  const hourOf = (s: string) => Number(s.split("@")[0].split(":")[0]);
  const on = (h: number, k: number) => d.slots.some(s => hourOf(s) === h && sDays(s).includes(k)) && !d.weekly.includes(WI[k]);
  const toggle = (h: number, k: number) => {
    const isOn = d.slots.some(s => hourOf(s) === h && sDays(s).includes(k));
    let next = d.slots;
    if (isOn) next = d.slots.flatMap(s => { if (hourOf(s) !== h) return [s]; const ds = sDays(s).filter(x => x !== k), b = s.split("@")[0]; return ds.length ? [ds.length === 7 ? b : `${b}@${ds.join("")}`] : []; });
    else { const b = `${String(h).padStart(2, "0")}:00`, ex = d.slots.find(s => s.split("@")[0] === b), ds = ex ? [...sDays(ex), k].sort() : [k];
      next = [...d.slots.filter(s => s !== ex), ds.length === 7 ? b : `${b}@${ds.join("")}`]; }
    begin({ slots: srt(next), ...(isOn ? {} : { weekly: d.weekly.filter(x => x !== WI[k]) }) });
  };
  return {
    setName: (e: ChangeEvent<HTMLInputElement>) => begin({ name: e.target.value }),
    gmaps: `https://www.google.com/maps/search/?api=1&query=${q}`, waze: `https://waze.com/ul?q=${q}&navigate=yes`, hasAddr: !!d.addr,
    capMinus: d.cap > 1 ? () => begin({ cap: d.cap - 1 }) : undefined, capPlus: d.cap < 10 ? () => begin({ cap: d.cap + 1 }) : undefined,
    days: ["M", "T", "W", "T", "F", "S", "S"],
    grid: Array.from({ length: 24 }, (_, h) => ({ label: `${h % 12 || 12}${h < 12 ? "am" : "pm"}`, cells: WD.map((_, k) => ({ on: on(h, k), pick: () => toggle(h, k) })) })),
    odd: d.slots.filter(s => !s.split("@")[0].endsWith(":00")).map(s => t12(s)),
    // Add closure opens the full editor (its closures box) on what is on screen.
    addClosure: () => patch({ rmEdit: { ...d, i, id: r?.id ?? null, quick: false } }),
    setRemarks: (e: ChangeEvent<HTMLTextAreaElement>) => begin({ remarks: e.target.value.slice(0, 1000) }),
  };
}


/** The editor's fields while a row is only being viewed (the design reads them either way). */
const NOOP = () => {};
const closedEditor = {
  dName: "", dAddr: "", setName: NOOP as (e: ChangeEvent<HTMLInputElement>) => void, setAddr: NOOP as (e: ChangeEvent<HTMLTextAreaElement>) => void,
  dWeek: [] as { label: string; on: boolean; pick: () => void; bg: string; fg: string; bd: string }[], dBlocks: [] as { t: string; rm: () => void }[],
  dBAtxt: "", dBBtxt: "", dBAfg: "", dBBfg: "", dBWhy: "", setBWhy: NOOP as (e: ChangeEvent<HTMLInputElement>) => void,
  calOpen: false, calTitle: "", calWk: [] as string[], calDays: [] as { n: number | string; bg: string; fg: string; fw: number; cur: string; pick?: () => void }[],
  calPrev: NOOP, calNext: NOOP, openA: NOOP, openB: NOOP, dBAbd: "", dBBbd: "", blockBg: "", addBlock: undefined as (() => void) | undefined,
  dBAll: true, dBHours: false, dBMode: [] as { label: string; pick: () => void; bg: string; fg: string; w: number; sh: string }[],
  dBT1txt: "", dBT2txt: "", dBT1fg: "", dBT2fg: "", dBT1bd: "", dBT2bd: "", openT1: NOOP, openT2: NOOP, dBTOpen: false, dBTTitle: "",
  dBTimes: [] as { t: string; bg: string; fg: string; bd: string; cur: string; pick: (() => void) | undefined }[], dBTimeErr: false,
  dCap: 0, capMinus: undefined as (() => void) | undefined, capPlus: undefined as (() => void) | undefined, capMinusFg: "", capPlusFg: "",
  dGrid: [] as { t: string; cnt: string; rm: () => void; cells: { on: boolean; bg: string; fg: string; pick: () => void }[] }[], dGridHead: [] as string[],
  dNewDays: [] as { label: string; on: boolean; bg: string; fg: string; bd: string; pick: () => void }[], dNewDaysTxt: "", dNoSlots: false,
  newTLbl: "", newTFg: "", openTP: NOOP, addBg: "", addSlot: undefined as (() => void) | undefined, cancel: NOOP, save: NOOP, remove: NOOP,
};
