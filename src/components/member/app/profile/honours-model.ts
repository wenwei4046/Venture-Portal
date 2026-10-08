import type { MemberHonours } from "@/lib/member/server";
import { ordinal } from "../format";
import type { HonourBoard, HonourKind, HonoursVM } from "./profile-vm";

/**
 * My honours from the member's finishes in the final months of the period
 * (`loadMemberHonours`) — the prototype's `honStyle a` page: the period's
 * podium, every place, a highlight.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const PRIORITY: HonourBoard[] = ["Championship", "Fair", "Sales", "Margin", "KPI"];

/** The months a period covers, and the period before it (for the "+3 vs Aug" chip). */
export function honourWindow(kind: HonourKind, from: string): { months: string[]; prev: string[]; label: string; eyebrow: string; prevLabel: string | null } {
  const year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7));
  const mm = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  if (kind === "monthly") {
    const py = month === 1 ? year - 1 : year, pm = month === 1 ? 12 : month - 1;
    return { months: [mm(year, month)], prev: [mm(py, pm)], label: `${MONTHS[month - 1]} ${year}`, eyebrow: `${MONTHS[month - 1].toUpperCase()} ${year}`, prevLabel: MONTHS[pm - 1] };
  }
  if (kind === "quarterly") {
    const q = Math.floor((month - 1) / 3) + 1;
    const pq = q === 1 ? 4 : q - 1, py = q === 1 ? year - 1 : year;
    const span = (y: number, qq: number) => [1, 2, 3].map(i => mm(y, (qq - 1) * 3 + i));
    return { months: span(year, q), prev: span(py, pq), label: `Q${q} ${year}`, eyebrow: `Q${q} ${year}`, prevLabel: `Q${pq}` };
  }
  return { months: Array.from({ length: 12 }, (_, i) => mm(year, i + 1)), prev: [], label: String(year), eyebrow: String(year), prevLabel: null };
}

export function honoursVM(data: MemberHonours, kind: HonourKind, from: string, current: string, subName: string): HonoursVM {
  const w = honourWindow(kind, from);
  const thisYear = kind === "annual" && from.slice(0, 4) === current.slice(0, 4);
  const list = data.finishes.filter(f => w.months.includes(f.period));
  const places = [...new Set(list.map(f => f.place))].sort((a, b) => a - b);
  const count = (p: number, xs = list) => xs.filter(f => f.place === p).length;
  const pods = count(1) + count(2) + count(3);
  const isFinal = (m: string) => data.final.includes(m);
  const open = w.months.filter(m => m <= current && !isFinal(m));
  // "+3 vs Aug" only once this period is settled, against one that is over and that somebody sold in.
  const prevDone = w.prevLabel !== null && w.prev.length > 0 && w.prev.every(isFinal) && w.prev.some(m => !data.empty.includes(m));
  const prevList = data.finishes.filter(f => w.prev.includes(f.period));
  const d = prevDone && !open.length ? pods - (count(1, prevList) + count(2, prevList) + count(3, prevList)) : null;
  const best = [...list].sort((a, b) => a.place - b.place || PRIORITY.indexOf(a.board) - PRIORITY.indexOf(b.board) || b.period.localeCompare(a.period))[0];
  const label = thisYear ? `${w.label} to date` : w.label;
  return {
    periodLabel: label,
    eyebrow: `${thisYear ? `${w.eyebrow} SO FAR` : w.eyebrow} · YOUR PODIUM`,
    podiums: pods,
    finishes: list.length,
    delta: d === null || d === 0 ? null : `${d > 0 ? "+" : ""}${d} vs ${w.prevLabel}`,
    podium: { gold: count(1), silver: count(2), bronze: count(3) },
    highlight: best && best.place <= 3 ? `${ordinal(best.place)} · ${best.title} · ${best.sub}` : null,
    places: places.map(p => { const n = count(p); return { place: p, label: `${ordinal(p)} place`, short: ordinal(p), count: n, unit: n === 1 ? "time" : "times" }; }),
    sheets: Object.fromEntries(places.map(p => [p, {
      title: `${ordinal(p)} place · ${count(p)} ${count(p) === 1 ? "time" : "times"}`,
      items: list.filter(f => f.place === p).sort((a, b) => b.period.localeCompare(a.period) || PRIORITY.indexOf(a.board) - PRIORITY.indexOf(b.board))
        .map(f => ({ title: f.title, sub: f.sub, board: f.board })),
    }])),
    notice: list.length ? null
      : open.length
        ? `${kind === "monthly" ? label : open.length === 1 ? `${MONTHS[Number(open[0].slice(5, 7)) - 1]} ${open[0].slice(0, 4)}` : `${open.length} months of ${label}`} ${open.length === 1 ? "is" : "are"} still open. Honours are awarded once everyone in ${subName} is closed for the month.`
        : `No finishes in ${label}.`,
  };
}
