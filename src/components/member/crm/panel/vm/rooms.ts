/**
 * Showrooms (Profile › Showrooms, design 1a): name, address (Waze / Google
 * Maps links), the time slots per weekday, how many groups a slot takes, the
 * weekdays it is closed and the dates blocked. Every CRM's Book visit offers
 * exactly this (crm_slot_check enforces it). Save writes the whole showroom;
 * Delete closes it for good — off every booking list, its past visits kept.
 */
import type { ChangeEvent, SyntheticEvent } from "react";
import type { CrmBlock, CrmRoom } from "@/lib/member/crm-data";
import type { RoomDraft } from "../ui";
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
const draftOf = (r: CrmRoom | null, i: number): RoomDraft => ({
  i, id: r?.id ?? null, name: r?.name ?? "", addr: r?.address ?? "", slots: r ? [...r.slots] : [], cap: r?.cap ?? 2, weekly: r ? [...r.weekly] : [], blocks: r ? r.blocks.map(b => ({ ...b })) : [],
  newT: "", newD: null, bA: "", bB: "", bWhy: "", bAll: true, bT1: "", bT2: "", bPick: null, calFor: null, calYM: null,
});

export function roomsVM(ctx: PanelCtx) {
  const { ui, set, patch, data, now, act } = ctx;
  const rooms = data.rooms.filter(r => r.active), ed = ui.rmEdit;
  const setD = (p: Partial<RoomDraft>) => set(u => (u.rmEdit ? { ...u, rmEdit: { ...u.rmEdit, ...p } } : u));
  // A showroom being added shows as one more row, in edit.
  const shown: (CrmRoom | null)[] = [...rooms, ...(ed && ed.id === null ? [null] : [])];
  const T = iso(now);
  // One showroom at a time (the owner, 2026-10-16: "如果都在下面太長了"): the one being edited, else the one ‹ › reached.
  const at = ed ? ed.i : Math.min(Math.max(0, ui.rmAt ?? 0), Math.max(0, shown.length - 1));
  const step = (d: 1 | -1) => () => { if (!ed) set(u => ({ ...u, rmAt: Math.min(Math.max(0, at + d), shown.length - 1) })); };

  const rmList = shown.map((r, i) => {
    const editing = !!ed && ed.i === i, name = r?.name ?? "", addr = r?.address ?? "", slots = r?.slots ?? [], weekly = r?.weekly ?? [], blocks = r?.blocks ?? [], cap = r?.cap ?? 2;
    const q = encodeURIComponent(addr || name);
    const view = {
      view: !editing, editing, name: name || "New showroom", addrShow: addr || "No address yet", addrFg: addr ? "#3F2B22" : "#B5A398",
      slotChips: slots.map(s => { const ds = sDays(s); return { t: t12(s), days: ["M", "T", "W", "T", "F", "S", "S"].map((n, k) => { const o = ds.includes(k); return { n, bg: o ? "#BD4A19" : "#F5EEE9", fg: o ? "#fff" : "#C9B5A8", open: o, closed: !o, cBg: o ? "#BD4A19" : "#FBF7F3", cBd: o ? "#BD4A19" : "#F0E6DE", cFg: o ? "#fff" : "#D9C7BA" }; }) }; }),
      noSlots: !slots.length, capShort: `${cap} per slot`,
      noBlock: !(blocks.length || weekly.length), blockChips: [...(weekly.length ? [`Every ${wkTxt(weekly)}`] : []), ...blocks.map(bTxt)].map(t => ({ t })),
      waze: `https://waze.com/ul?q=${q}&navigate=yes`, gmaps: `https://www.google.com/maps/search/?api=1&query=${q}`, navOp: addr ? 1 : 0.4,
      edit: () => patch({ rmEdit: draftOf(r, i) }), del: () => patch({ rmDel: i }),
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
        return { n: k + 1 as number | string, pick: off ? undefined : () => pickV(v), bg: on ? "#BD4A19" : inR ? "#FFF0E4" : "transparent", fg: on ? "#fff" : off ? "#D9C7BA" : "#3F2B22", fw: on || v === T ? 700 : 500, cur: off ? "default" : "pointer" };
      }),
    ];
    const tog = (k: "A" | "B") => () => setD({ calFor: ed.calFor === k ? null : k, calYM: null });
    const blockOk = !!ed.bA && (ed.bAll || (!!ed.bT1 && !!ed.bT2 && ed.bT2 > ed.bT1));
    const nd = ed.newD ?? ALL;
    return {
      ...view,
      dName: ed.name, dAddr: ed.addr, setName: (e: ChangeEvent<HTMLInputElement>) => setD({ name: e.target.value }), setAddr: (e: ChangeEvent<HTMLTextAreaElement>) => setD({ addr: e.target.value }),
      // Every week: tap a weekday to close it each week.
      dWeek: WI.map((d, k) => { const on = ed.weekly.includes(d); return { label: WD[k], on, pick: () => setD({ weekly: on ? ed.weekly.filter(x => x !== d) : [...ed.weekly, d] }), bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#EBDDD2" }; }),
      dBlocks: ed.blocks.map(b => ({ t: bTxt(b), rm: () => setD({ blocks: ed.blocks.filter(x => x !== b) }) })),
      dBAtxt: ed.bA ? dF(ed.bA) : "Pick date", dBBtxt: ed.bB || ed.bA ? dF(ed.bB || ed.bA) : "Pick date",
      dBAfg: ed.bA ? "#3F2B22" : "#B5A398", dBBfg: ed.bB || ed.bA ? "#3F2B22" : "#B5A398", dBWhy: ed.bWhy, setBWhy: (e: ChangeEvent<HTMLInputElement>) => setD({ bWhy: e.target.value }),
      calOpen: !!who, calTitle: gb(firstD, { month: "long", year: "numeric" }), calWk: ["M", "T", "W", "T", "F", "S", "S"], calDays,
      calPrev: () => setD({ calYM: [m ? y : y - 1, (m + 11) % 12] }), calNext: () => setD({ calYM: [m === 11 ? y + 1 : y, (m + 1) % 12] }),
      openA: tog("A"), openB: tog("B"), dBAbd: who === "A" ? "#BD4A19" : "#EBDDD2", dBBbd: who === "B" ? "#BD4A19" : "#EBDDD2",
      blockBg: blockOk ? "#3F2B22" : "#D9C7BA",
      addBlock: blockOk ? () => setD({
        blocks: [...ed.blocks, { a: ed.bA, b: ed.bB && ed.bB >= ed.bA ? ed.bB : ed.bA, why: ed.bWhy.trim(), ...(ed.bAll ? {} : { t1: ed.bT1, t2: ed.bT2 }) }].sort((x, z) => (x.a < z.a ? -1 : 1)),
        bA: "", bB: "", bWhy: "", bAll: true, bT1: "", bT2: "",
      }) : undefined,
      // Round 2 (rev 1011 §8): a closure is the whole day or set hours — All day | Set hours, then From – To, each opening a
      // grid of half hours 8 am – 10 pm; picking From jumps to To; To at or before From is greyed. The prototype's.
      dBAll: ed.bAll, dBHours: !ed.bAll,
      dBMode: ([["All day", true], ["Set hours", false]] as const).map(([label, v]) => {
        const on = ed.bAll === v;
        return { label, pick: () => setD({ bAll: v }), bg: on ? "#fff" : "transparent", fg: on ? "#3F2B22" : "#806B60", w: on ? 650 : 500, sh: on ? "0 1px 3px rgba(63,43,34,.12)" : "none" };
      }),
      dBT1txt: ed.bT1 ? t12(ed.bT1) : "From", dBT2txt: ed.bT2 ? t12(ed.bT2) : "To",
      dBT1fg: ed.bT1 ? "#3F2B22" : "#B5A398", dBT2fg: ed.bT2 ? "#3F2B22" : "#B5A398",
      dBT1bd: ed.bPick === "t1" ? "#BD4A19" : "#EBDDD2", dBT2bd: ed.bPick === "t2" ? "#BD4A19" : "#EBDDD2",
      openT1: () => setD({ bPick: ed.bPick === "t1" ? null : "t1" }), openT2: () => setD({ bPick: ed.bPick === "t2" ? null : "t2" }),
      dBTOpen: !!ed.bPick, dBTTitle: ed.bPick === "t2" ? "Blocked until" : "Blocked from",
      // The whole day, 12 am to 11 pm, every half hour (the owner, 2026-10-15; it ran 8 am – 10 pm).
      dBTimes: Array.from({ length: 47 }, (_, k) => {
        const mm = k * 30, v = String(Math.floor(mm / 60)).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0");
        const key = ed.bPick === "t2" ? "bT2" : "bT1", on = ed[key] === v, off = key === "bT2" && !!ed.bT1 && v <= ed.bT1;
        return {
          t: t12(v).replace(":00", ""), bg: on ? "#BD4A19" : off ? "#FBF6F2" : "#fff", fg: on ? "#fff" : off ? "#C9B5A8" : "#3F2B22", bd: on ? "#BD4A19" : off ? "#FBF6F2" : "#EBDDD2",
          cur: off ? "not-allowed" : "pointer", pick: off ? undefined : () => setD({ [key]: v, bPick: key === "bT1" && !ed.bT2 ? "t2" : null }),
        };
      }),
      dBTimeErr: !ed.bAll && !!ed.bT1 && !!ed.bT2 && ed.bT2 <= ed.bT1,
      // Groups per slot (1–10): a slot that reaches it shows Full in Book visit.
      dCap: ed.cap, capMinus: ed.cap > 1 ? () => setD({ cap: ed.cap - 1 }) : undefined, capPlus: ed.cap < 10 ? () => setD({ cap: ed.cap + 1 }) : undefined,
      capMinusFg: ed.cap > 1 ? "#3F2B22" : "#D9C7BA", capPlusFg: ed.cap < 10 ? "#3F2B22" : "#D9C7BA",
      // One row per time, one column per weekday: tap a cell to open / close that time that day.
      dGrid: ed.slots.map(s => {
        const ds = sDays(s), b = s.split("@")[0];
        return { t: t12(s), cnt: ds.length === 7 ? "Every day" : `${ds.length} days`, rm: () => setD({ slots: ed.slots.filter(x => x !== s) }),
          cells: WD.map((_, k) => { const on = ds.includes(k); return { on, bg: on ? "#BD4A19" : k > 4 ? "#F5EEE9" : "#FBF7F3", fg: on ? "#fff" : "#C9B5A8",
            pick: () => { const nds = on ? ds.filter(x => x !== k) : [...ds, k].sort(); setD({ slots: nds.length ? ed.slots.map(x => (x === s ? (nds.length === 7 ? b : `${b}@${nds.join("")}`) : x)) : ed.slots.filter(x => x !== s) }); } }; }) };
      }),
      dGridHead: ["M", "T", "W", "T", "F", "S", "S"],
      // The weekdays the next time added opens on (every day to start).
      dNewDays: WD.map((n, k) => { const on = nd.includes(k); return { label: n[0], on, bg: on ? "#BD4A19" : "#fff", fg: on ? "#fff" : "#806B60", bd: on ? "#BD4A19" : "#EBDDD2", pick: () => setD({ newD: on ? (nd.length > 1 ? nd.filter(x => x !== k) : nd) : [...nd, k].sort() }) }; }),
      dNewDaysTxt: dTxt(nd), dNoSlots: !ed.slots.length,
      newTLbl: ed.newT ? t12(ed.newT) : "Pick a time", newTFg: ed.newT ? "#3F2B22" : "#B5A398",
      openTP: () => { const [H, M] = (ed.newT || "11:00").split(":").map(Number); patch({ rmTP: { h: H % 12 || 12, m: M, ap: H < 12 ? "am" : "pm" } }); },
      addBg: ed.newT ? "#BD4A19" : "#D9C7BA",
      addSlot: ed.newT ? () => setD({ slots: srt([...ed.slots.filter(x => x.split("@")[0] !== ed.newT), ed.newT + (nd.length < 7 ? `@${nd.join("")}` : "")]), newT: "", newD: null }) : undefined,
      cancel: () => patch({ rmEdit: null }),
      save: () => void act.saveRoom({ id: ed.id, name: ed.name.trim() || "Showroom", address: ed.addr.trim(), active: true, slots: ed.slots, cap: ed.cap, weekly: ed.weekly, blocks: ed.blocks }).then(ok => { if (ok) patch({ rmEdit: null }); }),
      remove: () => patch({ rmDel: i }),
    };
  });

  const tp = ui.rmTP;
  const setT = (p: Partial<NonNullable<typeof tp>>) => set(u => (u.rmTP ? { ...u, rmTP: { ...u.rmTP, ...p } } : u));
  const opt = (on: boolean, pick: () => void, t: string) => ({ t, pick, bg: on ? "#BD4A19" : "transparent", fg: on ? "#fff" : "#3F2B22", w: on ? 700 : 500 });
  const H24 = tp ? (tp.h % 12) + (tp.ap === "pm" ? 12 : 0) : 0, val = tp ? `${String(H24).padStart(2, "0")}:${String(tp.m).padStart(2, "0")}` : "";
  const del = ui.rmDel != null ? shown[ui.rmDel] : undefined;
  return {
    rmOpen: ui.roomsOpen, stop, closeRooms: () => patch({ roomsOpen: false, rmEdit: null }),
    rmAdd: () => patch({ rmEdit: draftOf(null, rooms.length), rmAt: rooms.length }),
    rmList: rmList.filter((_, i) => i === at),
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
