/**
 * Showrooms (CRM Desktop rev 1, G1–G2), CRM · Manage: the cards (address, open days, visit times, booking limit,
 * blocked; Waze / Google Maps) and the editor (Details · Open slots · Blocked; Save, or Save and apply to all). Saved in
 * the phone's own format (crm_save_showroom_full: "HH:MM" / "HH:MM@0123" slots, weekly closed days, blocks), so what
 * the Principal sets is what every salesperson's Book visit offers and what crm_slot_check allows — the control
 * panel's settings reach everybody (user 2026-10-13).
 */
import { blockHours, type CrmBlock, type CrmRoom } from "@/lib/member/crm-data";
import { t12 } from "../../sales/vm/chat";
import type { DeskCtx, SrBlk, SrBlock, SrDraft } from "./ctx";
import { MON } from "./insight";

const DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], DS = ["M", "T", "W", "T", "F", "S", "S"], DI = [0, 1, 2, 3, 4, 5, 6];
/** Every half hour a visit may start (the prototype's ALLT) and the hours a blocked time may run (HOURS) — the whole day,
 *  12 am to 11 pm (the owner, 2026-10-15: "Showroom 時間表，做24小時的"; the prototype ran 10 am – 9 pm). */
const ALLT = Array.from({ length: 47 }, (_, k) => t12(`${Math.floor(k / 2)}:${k % 2 ? "30" : "00"}`));
const HOURS = Array.from({ length: 24 }, (_, k) => t12(`${k}:00`));
const hm = (label: string) => { const m = label.match(/(\d+):(\d+) (am|pm)/); return m ? `${String((Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${m[2]}` : label; };
const fd = (iso: string) => { if (!iso) return ""; const [, m, d] = iso.split("-"); return `${parseInt(d, 10)} ${MON[parseInt(m, 10) - 1].slice(0, 3)}`; };
const mapU = (a: string) => ({ g: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`, w: `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes` });

/** A showroom as the editor holds it (the prototype's srData shape) — weekdays Monday = 0 throughout. */
export function draftOf(r: CrmRoom | null): SrDraft {
  const times = [...new Set((r?.slots ?? []).map(s => s.split("@")[0]))].sort().map(t12);
  const off: Record<string, 1> = {};
  for (const s of r?.slots ?? []) if (s.includes("@")) { const on = s.split("@")[1].split("").map(Number); DI.filter(d => !on.includes(d)).forEach(d => { off[`${t12(s)}|${d}`] = 1; }); }
  return {
    id: r?.id ?? null, dispName: r?.name ?? "", addr: r?.address ?? "", gmap: r?.mapGoogle ?? "", waze: r?.mapWaze ?? "", manual: !!(r?.mapGoogle || r?.mapWaze),
    photo: r?.photo ?? "", photoFile: null, limit: r?.cap ?? 2, times, off,
    weekDays: (r?.weekly ?? []).map(d => (d + 6) % 7).sort(),
    blocks: (r?.blocks ?? []).map(b => ({ kind: "date" as const, from: b.a, to: b.b || b.a, allDay: !blockHours(b).length, ranges: blockHours(b).map(x => ({ f: t12(x.f), t: t12(x.t) })), reason: b.why })),
  };
}
/** The editor's draft → the showroom the database keeps (the phone's format). */
export function roomOf(d: SrDraft): Omit<CrmRoom, "id"> & { id: string | null } {
  const slots = d.times.map(label => { const days = DI.filter(di => !d.off[`${label}|${di}`]); return days.length === 7 ? hm(label) : days.length ? `${hm(label)}@${days.join("")}` : null; })
    .filter((x): x is string => !!x);
  const blocks: CrmBlock[] = d.blocks.map(b => ({ a: b.from, b: b.to || b.from, why: b.reason.trim(), ...(b.allDay || !b.ranges.length ? {} : (() => {
    // Several windows as ranges; the first also as t1 / t2, which the phone panel's Blocked time slots reads (round 2).
    const w = b.ranges.map(x => ({ f: hm(x.f), t: hm(x.t) }));
    return { ranges: w, t1: w[0].f, t2: w[0].t };
  })()) }));
  return { id: d.id, name: d.dispName.trim() || "Showroom", address: d.addr.trim(), active: true, slots, cap: d.limit, weekly: d.weekDays.map(di => (di + 1) % 7), blocks,
    photo: d.photo || null, mapGoogle: d.manual ? d.gmap.trim() || null : null, mapWaze: d.manual ? d.waze.trim() || null : null };
}

export function showroomsVM(ctx: DeskCtx, opItem: string) {
  const { ui, set, patch, data, now } = ctx;
  const rooms = data.rooms.filter(r => r.active);
  const dr = ui.srDraft, en = ui.srEdit;
  const srOpen = ui.stage !== "menu" && opItem === "Showrooms" && !!en && !!dr;
  const upd = (x: Partial<SrDraft>) => set(u => (u.srDraft ? { ...u, srDraft: { ...u.srDraft, ...x } } : u));
  const cnt = (off: Record<string, 1>, tm: string[]) => tm.length * 7 - Object.keys(off).filter(k => tm.includes(k.split("|")[0])).length;
  const timeTxt = (b: SrBlock) => (b.allDay || !b.ranges.length ? "All day" : b.ranges.map(r => `${r.f} – ${r.t}`).join(", "));
  const rangeTxt = (arr: number[]) => { if (arr.length === 7) return "Every day"; if (!arr.length) return "Closed"; const runs: string[] = []; let st = arr[0], pv = arr[0];
    for (let i = 1; i <= arr.length; i++) { if (arr[i] === pv + 1) { pv = arr[i]; continue; } runs.push(st === pv ? DN[st] : `${DN[st]} – ${DN[pv]}`); st = arr[i]; pv = arr[i]; } return runs.join(", "); };
  const srCards = rooms.map(r => { const d = draftOf(r), n = cnt(d.off, d.times), sel = en === r.id && srOpen, wd = d.weekDays;
    const openD = DI.filter(di => !wd.includes(di) && d.times.some(t => !d.off[`${t}|${di}`])), closedD = DI.filter(di => !openD.includes(di));
    const partial = d.times.length * 7 - n - wd.length * d.times.length, ds = d.blocks;
    const links = d.manual ? { g: d.gmap || "#", w: d.waze || "#" } : d.addr ? mapU(d.addr) : { g: "#", w: "#" };
    return { name: r.name, dispName: r.name, photo: d.photo, addr: d.addr || "No address yet", limit: String(d.limit), gUrl: links.g, wUrl: links.w,
      addrFg: d.addr ? "var(--crm-ink)" : "var(--crm-faint)", daysTxt: rangeTxt(openD), daysTxtFg: openD.length ? "var(--crm-ink)" : "var(--crm-oxblood)", daysSub: closedD.length ? `Closed ${closedD.map(i => DN[i]).join(", ")}` : "",
      timesTxt: d.times.length ? d.times.join(" · ") : "No times set", timesTxtFg: d.times.length ? "var(--crm-ink)" : "var(--crm-oxblood)",
      timesSub: `${d.times.length} time${d.times.length === 1 ? "" : "s"} a day${partial > 0 ? ` · ${partial} slot${partial === 1 ? "" : "s"} closed on some days` : ""}`,
      limitTxt: `${d.limit} visit${d.limit === 1 ? "" : "s"} per time`, limitTxtFg: "var(--crm-ink)",
      blocked: !ds.length ? "No blocked dates" : ds.length === 1 ? fd(ds[0].from) + (ds[0].to && ds[0].to !== ds[0].from ? ` – ${fd(ds[0].to)}` : "") : `${ds.length} dates`,
      blockedFg: ds.length ? "var(--crm-ink)" : "var(--crm-faint)",
      blockedSub: ds.length > 1 ? ds.slice(0, 3).map(b => `${fd(b.from)}${b.to && b.to !== b.from ? ` – ${fd(b.to)}` : ""} · ${timeTxt(b)}`).join("\n") : ds.length === 1 ? timeTxt(ds[0]) + (ds[0].reason ? ` · ${ds[0].reason}` : "") : "",
      bd: sel ? "var(--crm-rust)" : "var(--crm-rule)", ring: sel ? "0 0 0 3px var(--crm-tint-attention)" : "none",
      edit: () => patch({ srEdit: r.id, srDraft: draftOf(r), srBlkOpen: false, srTab: "info", srCal: null }) }; });

  const bk: SrBlk = ui.srBlk ?? { days: [], from: "", to: "", allDay: true, ranges: [{ f: "11:00 am", t: "1:00 pm" }], reason: "", wkReason: "" };
  const updB = (x: Partial<SrBlk>) => set(u => ({ ...u, srBlk: { ...(u.srBlk ?? bk), ...x } }));
  // The block's date picker: this month and the next fourteen; past days cannot be picked.
  const which = ui.srCal, mi = ui.srCalM, m0 = now.getMonth() + mi, yy = now.getFullYear() + Math.floor(m0 / 12), mm = m0 % 12;
  const first = new Date(yy, mm, 1), lead = (first.getDay() + 6) % 7, days = new Date(yy, mm + 1, 0).getDate();
  const isoD = (dd: number) => `${yy}-${String(mm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const f = bk.from, t = bk.to || bk.from;
  const srCalCells = [
    ...Array.from({ length: lead }, () => ({ n: "", dis: true, band: "transparent", br: "0", dot: "transparent", fg: "var(--crm-ink)", ring: "0", w: 500, cur: "default", pick: () => {} })),
    ...Array.from({ length: days }, (_, k) => { const io = isoD(k + 1), past = io < todayIso, edge = io === f || io === t, inR = !!f && !!t && io > f && io < t;
      return { n: String(k + 1), dis: past, cur: past ? "not-allowed" : "pointer", band: inR || (edge && f !== t) ? "var(--crm-tint-attention)" : "transparent",
        br: f !== t && io === f ? "17px 0 0 17px" : f !== t && io === t ? "0 17px 17px 0" : "0", dot: edge ? "var(--crm-rust)" : "transparent", fg: edge ? "#fff" : past ? "var(--crm-faint-2)" : "var(--crm-ink)",
        ring: io === todayIso && !edge ? "1.5px solid var(--crm-rust)" : "0", w: edge || io === todayIso ? 700 : 500,
        pick: () => { if (past) return; if (which === "to") { if (f && io < f) updB({ from: io, to: io }); else updB({ to: io }); patch({ srCal: null }); } else { updB({ from: io, to: bk.to && bk.to >= io ? bk.to : io }); patch({ srCal: "to" }); } } }; }),
  ];
  const okD = !!bk.from, rng = bk.from ? fd(bk.from) + (bk.to && bk.to !== bk.from ? ` – ${fd(bk.to)}` : "") : "";
  const cur = dr?.times ?? [], opts = ALLT.filter(x => !cur.includes(x)), nt = ui.srNewT && opts.includes(ui.srNewT) ? ui.srNewT : opts[0] ?? "", nd = ui.srNewD ?? DI, okT = !!nt && nd.length > 0;
  const save = async (all: boolean) => {
    if (!dr || !en) return;
    const targets = all ? rooms : rooms.filter(r => r.id === en);
    const results = await Promise.all(targets.map(r => {
      const mine = r.id === en, base = draftOf(r);
      const d: SrDraft = mine ? dr : { ...base, limit: dr.limit, times: [...dr.times], off: { ...dr.off }, blocks: [...dr.blocks], weekDays: [...dr.weekDays] };
      return ctx.act.saveRoom(roomOf(d)).then(ok => ok && mine ? ctx.deskAct.saveShowroomExtras(r.id, { photo: dr.photoFile, removePhoto: !dr.photo && !!r.photo, gmap: dr.manual ? dr.gmap : "", waze: dr.manual ? dr.waze : "" }) : ok);
    }));
    if (results.every(Boolean)) patch({ srEdit: null, srDraft: null, srBlkOpen: false, toast: all ? `Applied to all ${targets.length} showrooms` : `${dr.dispName || "Showroom"} saved` });
  };
  const empty = { manual: false, showAuto: false, showNoAddr: true, linkFields: [] as { bg: string; ch: string; ph: string; v: string; set: (e: { target: { value: string } }) => void }[], gmapUrl: "", wazeUrl: "", name: "", dispName: "", gmap: "", waze: "", photo: "", noPhoto: true, photoBd: "var(--crm-st-won)", addr: "", limit: "", blocks: [] as { tag: string; tagBg: string; tagFg: string; when: string; sub: string; remove: () => void }[], openN: "", allLabel: "", totN: "", slots: [] as { time: string; remove: () => void; cells: { on: boolean; bg: string; bd: string; toggle: () => void }[] }[] };
  // 4a (frame 07): one showroom at a time (‹ 1 / 2 ›, + adds one), always open to edit — the first change makes the
  // draft, Save in the page's head keeps it — its visits per slot, its closures, and the weekly slots as a 24 × 7 grid:
  // an hour is open on a day when a visit time in it is; a tap opens the hour (a new time at :00 for that day) or closes it.
  const at = Math.min(Math.max(0, ui.srAt ?? 0), Math.max(0, rooms.length - 1));
  const curRoom = en === "new" ? null : rooms.find(r => r.id === en) ?? rooms[at] ?? null;
  const d4: SrDraft = dr && en ? dr : draftOf(curRoom);
  const edit4 = (x: Partial<SrDraft>) => set(u => ({ ...u, srEdit: u.srEdit ?? curRoom?.id ?? "new", srDraft: { ...(u.srDraft && u.srEdit ? u.srDraft : d4), ...x } }));
  const hourOf = (label: string) => { const h = Number(hm(label).slice(0, 2)); return h; };
  const sr4 = {
    has: rooms.length > 0 || en === "new", isNew: en === "new",
    pager: { at: en === "new" ? rooms.length + 1 : at + 1, n: rooms.length + (en === "new" ? 1 : 0), prev: () => patch({ srAt: Math.max(0, at - 1), srEdit: null, srDraft: null }),
      next: () => patch({ srAt: Math.min(rooms.length - 1, at + 1), srEdit: null, srDraft: null }), prevOff: at === 0 || en === "new", nextOff: at >= rooms.length - 1 || en === "new" },
    add: () => patch({ srEdit: "new", srDraft: draftOf(null), srBlkOpen: false }),
    name: d4.dispName, setName: (e: { target: { value: string } }) => edit4({ dispName: e.target.value }),
    addr: d4.addr, setAddr: (e: { target: { value: string } }) => edit4({ addr: e.target.value }),
    links: d4.manual ? { g: d4.gmap || "", w: d4.waze || "" } : d4.addr ? mapU(d4.addr) : { g: "", w: "" },
    limit: d4.limit, down: () => edit4({ limit: Math.max(1, d4.limit - 1) }), up: () => edit4({ limit: Math.min(20, d4.limit + 1) }),
    closures: [...d4.weekDays.map(di => ({ when: `Every ${DN[di]}`, sub: "All day · weekly", remove: () => edit4({ weekDays: d4.weekDays.filter(x => x !== di) }) })),
      ...d4.blocks.map((b, i) => ({ when: fd(b.from) + (b.to && b.to !== b.from ? ` – ${fd(b.to)}` : ""), sub: timeTxt(b) + (b.reason ? ` · ${b.reason}` : ""), remove: () => edit4({ blocks: d4.blocks.filter((_, j) => j !== i) }) }))],
    grid: Array.from({ length: 24 }, (_, h) => ({ label: h % 3 === 0 ? `${h % 12 || 12} ${h < 12 ? "am" : "pm"}` : "", cells: DI.map(di => {
      const ts = d4.times.filter(t => hourOf(t) === h), on = !d4.weekDays.includes(di) && ts.some(t => !d4.off[`${t}|${di}`]);
      return { on, toggle: () => {
        if (on) { const off = { ...d4.off }; ts.forEach(t => { off[`${t}|${di}`] = 1; }); edit4({ off }); return; }
        if (ts.length) { const off = { ...d4.off }; ts.forEach(t => { delete off[`${t}|${di}`]; }); edit4({ off, weekDays: d4.weekDays.filter(x => x !== di) }); return; }
        const t = t12(`${h}:00`), off = { ...d4.off }; DI.forEach(x => { if (x !== di) off[`${t}|${x}`] = 1; });
        edit4({ off, times: [...d4.times, t].sort((a, b) => ALLT.indexOf(a) - ALLT.indexOf(b)), weekDays: d4.weekDays.filter(x => x !== di) }); } }; }) })),
    // A new showroom saves on its own (the phone panel's + does the same); an existing one through the editor's save.
    save: () => { if (en === "new" && dr) { void ctx.act.saveRoom(roomOf(dr)).then(ok => { if (ok) patch({ srEdit: null, srDraft: null, srAt: rooms.length, toast: `${dr.dispName || "Showroom"} added` }); }); } else void save(false); },
    dirty: !!en,
  };
  return {
    sr4, srOpen: false && srOpen, srCards, srN: String(rooms.length), srDays: DS.map(l => ({ l })),
    srLinkModes: ([[false, "Auto"], [true, "Paste link"]] as const).map(([v, label]) => { const on = !!dr?.manual === v; return { label, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 3px rgba(42,22,12,.12)" : "none", fg: on ? "var(--crm-ink)" : "var(--crm-muted)", pick: () => upd({ manual: v }) }; }),
    srTabSlots: ui.srTab === "slots", srTabBlk: ui.srTab === "blk", srTabInfo: ui.srTab === "info",
    srTabs: ([["info", "Details", ""], ["slots", "Open slots", dr ? String(cnt(dr.off, dr.times)) : ""], ["blk", "Blocked", dr ? String(dr.blocks.length + dr.weekDays.length) : ""]] as const).map(([k, label, n]) => { const on = ui.srTab === k;
      return { label, n, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 3px rgba(42,22,12,.12)" : "none", fg: on ? "var(--crm-ink)" : "var(--crm-muted)", nBg: on ? "var(--crm-tint-attention)" : "var(--crm-rule)", nFg: on ? "var(--crm-rust)" : "var(--crm-ink-soft)", pick: () => patch({ srTab: k }) }; }),
    srBlkOpen: ui.srBlkOpen, srBlkNone: !!dr && !dr.blocks.length && !ui.srBlkOpen, srBlkBtn: ui.srBlkOpen ? "Close" : "Block time", srBlkIc: ui.srBlkOpen ? "M18 6 6 18M6 6l12 12" : "M12 5v14M5 12h14", srBlkBtnBg: ui.srBlkOpen ? "var(--crm-tint-attention)" : "#fff",
    srBlkToggle: () => set(u => ({ ...u, srBlkOpen: !u.srBlkOpen, srBlk: null })),
    srBlk: { ...bk, fromTxt: bk.from ? fd(bk.from) : "Pick date", toTxt: bk.to ? fd(bk.to) : "Pick date", fromBd: which === "from" ? "var(--crm-rust)" : "var(--crm-rule)", toBd: which === "to" ? "var(--crm-rust)" : "var(--crm-rule)", fromFg: bk.from ? "var(--crm-ink)" : "var(--crm-faint)", toFg: bk.to ? "var(--crm-ink)" : "var(--crm-faint)" },
    srBlkDays: DN.map((l, i) => { const wd = dr?.weekDays ?? [], on = wd.includes(i); return { l, bd: on ? "var(--crm-rust)" : "var(--crm-line)", bg: on ? "var(--crm-rust)" : "#fff", fg: on ? "#fff" : "var(--crm-ink)", toggle: () => upd({ weekDays: on ? wd.filter(x => x !== i) : [...wd, i].sort() }) }; }),
    srWkNote: dr?.weekDays.length ? `Closed every ${dr.weekDays.map(i => DN[i]).join(", ")}` : "", srWkFg: dr?.weekDays.length ? "var(--crm-oxblood)" : "var(--crm-muted)",
    srBlkFrom: (e: { target: { value: string } }) => updB({ from: e.target.value, to: bk.to && bk.to >= e.target.value ? bk.to : e.target.value }),
    srBlkTo: (e: { target: { value: string } }) => updB({ to: e.target.value, from: bk.from && bk.from <= e.target.value ? bk.from : e.target.value }),
    srBlkReason: (e: { target: { value: string } }) => updB({ reason: e.target.value }),
    srHours: HOURS.map(v => ({ v })),
    srCalOpen: !!which, srCalLabel: `${MON[mm]} ${yy}`, srCalHint: which === "to" ? "Pick the To date" : "Pick the From date", srCalCells, srCalDow: DS.map(l => ({ l })),
    srCalFrom: () => set(u => ({ ...u, srCal: u.srCal === "from" ? null : "from" })), srCalTo: () => set(u => ({ ...u, srCal: u.srCal === "to" ? null : "to" })),
    srCalPrev: () => patch({ srCalM: Math.max(0, mi - 1) }), srCalNext: () => patch({ srCalM: Math.min(14, mi + 1) }),
    srShowPicker: (e: { target: EventTarget & { showPicker?: () => void } }) => { try { e.target.showPicker?.(); } catch { /* not every browser */ } },
    srPickTime: !bk.allDay, srHasBlocks: !!dr?.blocks.length,
    srTimeModes: ([[true, "All day"], [false, "Pick a time"]] as const).map(([v, label]) => { const on = bk.allDay === v; return { label, bg: on ? "#fff" : "transparent", sh: on ? "0 1px 3px rgba(42,22,12,.12)" : "none", fg: on ? "var(--crm-ink)" : "var(--crm-muted)", pick: () => updB({ allDay: v }) }; }),
    srRanges: bk.ranges.map((r, i) => { const fi = HOURS.indexOf(r.f);
      return { f: r.f, t: r.t, fromHours: HOURS.slice(0, -1).map(v => ({ v })), toHours: HOURS.slice(fi + 1).map(v => ({ v })),
        setF: (e: { target: { value: string } }) => { const nfi = HOURS.indexOf(e.target.value); updB({ ranges: bk.ranges.map((x, j) => (j === i ? { f: e.target.value, t: HOURS.indexOf(x.t) > nfi ? x.t : HOURS[nfi + 1] } : x)) }); },
        setT: (e: { target: { value: string } }) => updB({ ranges: bk.ranges.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)) }),
        remove: () => { const nr = bk.ranges.filter((_, j) => j !== i); updB(nr.length ? { ranges: nr } : { ranges: [{ f: "11:00 am", t: "1:00 pm" }], allDay: true }); } }; }),
    srAddRange: () => { const last = bk.ranges[bk.ranges.length - 1], li = last ? HOURS.indexOf(last.t) : 11; updB({ ranges: [...bk.ranges, { f: HOURS[Math.min(li + 1, 22)], t: HOURS[Math.min(li + 2, 23)] }] }); },
    srDtCur: okD ? "pointer" : "not-allowed", srDtHint: okD ? `${rng} · ${bk.allDay ? "All day" : bk.ranges.map(r => `${r.f} – ${r.t}`).join(", ")}` : "", srDtHintFg: okD ? "var(--crm-ink)" : "var(--crm-faint)",
    srDtNoAdd: !okD, srDtAddBg: okD ? "var(--crm-rust)" : "var(--crm-line)",
    srDtAdd: () => { if (!okD || !dr) return; upd({ blocks: [...dr.blocks, { kind: "date", from: bk.from, to: bk.to || bk.from, allDay: bk.allDay, ranges: bk.allDay ? [] : bk.ranges, reason: bk.reason }] });
      patch({ srBlk: { ...bk, from: "", to: "", reason: "", allDay: true, ranges: [{ f: "11:00 am", t: "1:00 pm" }] } }); },
    srEditing: !!en, srApplyAll: () => void save(true), srSave: () => void save(false), srClose: () => patch({ srEdit: null, srDraft: null }),
    srE: dr ? {
      manual: dr.manual, showAuto: !dr.manual && !!dr.addr, showNoAddr: !dr.manual && !dr.addr, gmapUrl: dr.addr ? mapU(dr.addr).g : "", wazeUrl: dr.addr ? mapU(dr.addr).w : "",
      linkFields: ([["var(--crm-brand-maps)", "G", "gmap", "https://maps.app.goo.gl/…"], ["var(--crm-brand-waze)", "W", "waze", "https://waze.com/ul/…"]] as const).map(([bg, ch, k, ph]) => ({ bg, ch, ph, v: dr[k] || "", set: (e: { target: { value: string } }) => upd({ [k]: e.target.value }) })),
      name: dr.dispName || "Showroom", dispName: dr.dispName, gmap: dr.gmap, waze: dr.waze, photo: dr.photo, noPhoto: !dr.photo, photoBd: dr.photo ? "transparent" : "var(--crm-st-won)", addr: dr.addr, limit: String(dr.limit),
      blocks: dr.blocks.map((b, i) => ({ tag: "Date", tagBg: "var(--crm-tint-attention)", tagFg: "var(--crm-rust)", when: fd(b.from) + (b.to && b.to !== b.from ? ` – ${fd(b.to)}` : ""), sub: timeTxt(b) + (b.reason ? ` · ${b.reason}` : ""),
        remove: () => upd({ blocks: dr.blocks.filter((_, j) => j !== i) }) })),
      openN: String(cnt(dr.off, dr.times)), allLabel: cnt(dr.off, dr.times) === dr.times.length * 7 ? "Close all" : "Open all", totN: String(dr.times.length * 7),
      slots: dr.times.map(tm => ({ time: tm, remove: () => upd({ times: dr.times.filter(x => x !== tm) }),
        cells: DI.map(di => { const k = `${tm}|${di}`, on = !dr.off[k]; return { on, bg: on ? "var(--crm-rust)" : "#fff", bd: on ? "var(--crm-rust)" : "var(--crm-line)",
          toggle: () => set(u => { if (!u.srDraft) return u; const o = { ...u.srDraft.off }; if (o[k]) delete o[k]; else o[k] = 1; return { ...u, srDraft: { ...u.srDraft, off: o } }; }) }; }) })),
    } : empty,
    srSetAddr: (e: { target: { value: string } }) => upd({ addr: e.target.value }),
    srNewDays: DN.map((l, i) => { const on = nd.includes(i); return { l, bd: on ? "var(--crm-rust)" : "var(--crm-line)", bg: on ? "var(--crm-rust)" : "#fff", fg: on ? "#fff" : "var(--crm-ink)", toggle: () => patch({ srNewD: on ? nd.filter(x => x !== i) : [...nd, i].sort() }) }; }),
    srNewHint: !nd.length ? "Pick at least one day" : "", srNewOpts: opts.map(v => ({ v })), srNewT: nt, srNoNewT: !okT, srAddTBg: okT ? "var(--crm-rust)" : "var(--crm-line)",
    srSetNewT: (e: { target: { value: string } }) => patch({ srNewT: e.target.value }),
    srAddTime: () => { if (!okT || !dr) return; const off = { ...dr.off }; DI.forEach(di => { if (!nd.includes(di)) off[`${nt}|${di}`] = 1; else delete off[`${nt}|${di}`]; });
      upd({ off, times: [...dr.times, nt].sort((a, b) => ALLT.indexOf(a) - ALLT.indexOf(b)) }); patch({ srNewT: null, srNewD: null }); },
    srSetName: (e: { target: { value: string } }) => upd({ dispName: e.target.value }), srSetGmap: (e: { target: { value: string } }) => upd({ gmap: e.target.value }), srSetWaze: (e: { target: { value: string } }) => upd({ waze: e.target.value }),
    srSetPhoto: (e: { target: { files: FileList | null } }) => { const file = e.target.files?.[0]; if (file) upd({ photo: URL.createObjectURL(file), photoFile: file }); },
    srRemovePhoto: () => upd({ photo: "", photoFile: null }),
    srLimDown: () => upd({ limit: Math.max(1, (dr?.limit ?? 2) - 1) }), srLimUp: () => upd({ limit: Math.min(20, (dr?.limit ?? 2) + 1) }),
    srAll: () => set(u => { if (!u.srDraft) return u; const tm = u.srDraft.times, all = cnt(u.srDraft.off, tm) === tm.length * 7, o: Record<string, 1> = {}; if (all) tm.forEach(x => DI.forEach(di => { o[`${x}|${di}`] = 1; })); return { ...u, srDraft: { ...u.srDraft, off: o } }; }),
  };
}
