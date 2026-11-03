/**
 * Showrooms › Key log (the owner, 2026-10-29: "desktop 在 showroom 要有一个表单，去记录 member 借还钥匙的情况，时间，日期，照片都要记录"):
 * every visit whose key was collected or returned on a photo (the phone's Calendar, 2026-10-28), and every visit still to
 * mark at a showroom that hands its key over — when, where, whose customer, who took the key and when, who brought it
 * back and when, each photo a tap away. Newest first; a showroom and a state to narrow it; Excel of what is shown.
 */
import type { CrmVisit } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";

export type KeyState = "out" | "back" | "none";
export const KEY_STATES: [KeyState | "all", string][] = [["all", "All"], ["out", "Key out"], ["back", "Returned"], ["none", "Not collected"]];

export interface KeyLogRow {
  id: string; when: string; at: number; room: string; customer: string; owner: string; state: KeyState; stateLabel: string;
  out: { time: string; by: string; path: string } | null; back: { time: string; by: string; path: string } | null;
}

const dt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).replace("Sept", "Sep")}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
};
export const keyStateOf = (v: Pick<CrmVisit, "keyOut" | "keyBack">): KeyState => (v.keyBack ? "back" : v.keyOut ? "out" : "none");
const STATE_LABEL: Record<KeyState, string> = { out: "Key out", back: "Returned", none: "Not collected" };

/** The log's rows: a visit with a key photo, or a visit not yet marked at a showroom that hands its key over. */
export function keyLogRows(ctx: Pick<DeskCtx, "data" | "nameOf">): KeyLogRow[] {
  const { data, nameOf } = ctx;
  const rooms = new Map(data.rooms.map(r => [r.id, r]));
  return data.visits
    .filter(v => v.state !== "cancelled" && (v.keyOut || v.keyBack || (v.state === "booked" && !!rooms.get(v.showroomId)?.keys)))
    .map(v => {
      const c = data.customers.find(x => x.id === v.customerId), s = keyStateOf(v);
      return {
        id: v.id, when: dt(v.start), at: new Date(v.start).getTime(), room: rooms.get(v.showroomId)?.name ?? "Showroom", customer: c?.name ?? "—",
        owner: c?.assignedTo ? nameOf(c.assignedTo) : "—", state: s, stateLabel: STATE_LABEL[s],
        out: v.keyOut ? { time: v.keyOut.at ? dt(v.keyOut.at) : "", by: v.keyOut.by ? nameOf(v.keyOut.by) : "—", path: v.keyOut.path } : null,
        back: v.keyBack ? { time: v.keyBack.at ? dt(v.keyBack.at) : "", by: v.keyBack.by ? nameOf(v.keyBack.by) : "—", path: v.keyBack.path } : null,
      };
    })
    .sort((a, b) => b.at - a.at);
}

export function keyLogVM(ctx: DeskCtx) {
  const { ui, patch } = ctx;
  const all = keyLogRows(ctx);
  const room = ui.klRoom ?? "all", st = (ui.klState ?? "all") as KeyState | "all";
  const rows = all.filter(r => (room === "all" || r.room === room) && (st === "all" || r.state === st));
  const roomNames = [...new Set(all.map(r => r.room))].sort();
  return {
    rows, total: all.length,
    out: all.filter(r => r.state === "out").length,
    rooms: [{ v: "all", label: "All showrooms" }, ...roomNames.map(n => ({ v: n, label: n }))], room, setRoom: (e: { target: { value: string } }) => patch({ klRoom: e.target.value }),
    states: KEY_STATES.map(([k, label]) => ({ label, on: st === k, n: k === "all" ? all.length : all.filter(r => r.state === k).length, pick: () => patch({ klState: k }) })),
    photo: (path: string) => () => { void ctx.act.keyPhotoUrl(path).then(url => { if (url) void import("../../shared/viewer").then(m => m.openViewer([{ kind: "image", url, name: "Key photo" }], 0)); }); },
    excel: async () => {
      const XLSX = await import("xlsx"), wb = XLSX.utils.book_new();
      const head = ["Visit", "Showroom", "Customer", "Salesperson", "Key", "Collected", "Collected by", "Returned", "Returned by"];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows.map(r => [r.when, r.room, r.customer, r.owner, r.stateLabel, r.out?.time ?? "", r.out?.by ?? "", r.back?.time ?? "", r.back?.by ?? ""])]), "Key log");
      const blob = new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Key log.xlsx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
  };
}
export type KeyLogVM = ReturnType<typeof keyLogVM>;
