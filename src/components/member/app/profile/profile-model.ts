import type { MemberMemo, MemberMembership, MemberOrgMap, MemberRequest } from "@/lib/member/types";
import { arenaMonthFridays, arenaWeekendLabel, type ArenaPerson, type MemberArenaSnapshot } from "@/lib/member/arena";
import { claimPayoutLine, readClaimPayout } from "@/lib/member/claim-payout";
import { MONTHS_SHORT, dayRange, initials, klDate, klDayTime, klLongTime, monthShort, rm, rm2, shortDay } from "../format";
import type {
  ClaimWeek, MemoCat, MemoVM, PersonSheetVM, ProfileMainVM, RequestDetailVM, RequestEventVM, RequestKindVM, RequestRowVM,
  TeamDot, TeamKidVM, TeamLevelVM, TeamNodeVM, TeamVM, Tone, VaGroupVM,
} from "./profile-vm";

/**
 * Profile's view models from the database's own facts. Pure: the screens and
 * the tests read them the same way.
 */

// ── Profile ──

export function profileMainVM(input: {
  name: string;
  title: string;
  rank: string;
  /** The sub-department being looked at; absent for a Principal not viewing anybody. */
  subName: string | null;
  requests: readonly MemberRequest[];
  memos: readonly MemoVM[];
}): ProfileMainVM {
  const pending = input.requests.filter(r => r.status === "submitted").length;
  const fresh = input.memos.filter(m => !m.read || (m.needsAck && !m.acked)).length;
  return {
    name: input.name,
    ini: initials(input.name),
    sub: input.subName ? `HOUZS Venture · Revenue · ${input.subName}` : "HOUZS Venture · Revenue",
    title: input.title,
    rank: input.rank,
    badges: {
      ...(pending ? { requests: `${pending} pending` } : {}),
      ...(fresh ? { memos: `${fresh} new` } : {}),
    },
  };
}

// ── Requests ──

export interface RequestEvent {
  at: string;
  status: string;
  from: string | null;
  /** Who moved it: the member themselves, HR, Finance, or the system. */
  actor: "you" | "hr" | "finance" | "system" | "principal";
  actorName: string | null;
  note: string | null;
}

const STATUS: Record<string, [string, Tone]> = {
  draft: ["Draft", "none"],
  submitted: ["Pending HR", "warn"],
  needs_info: ["Needs info", "bad"],
  approved: ["Approved", "good"],
  rejected: ["Rejected", "bad"],
  waiting: ["Waiting list", "warn"],
  reserved: ["Place reserved", "warn"],
  accepted: ["Accepted", "warn"],
  allocated: ["Allocated", "good"],
  executed: ["Done", "good"],
  paid: ["Paid", "good"],
  withdrawn: ["Cancelled", "none"],
  expired: ["Expired", "bad"],
  // The HR revamp (2026-10-10): taken off the waiting list; a replacement set for a later date.
  failed: ["Not placed", "bad"],
  scheduled: ["Scheduled", "warn"],
};
export const requestStatus = (status: string): [string, Tone] => STATUS[status] ?? [status, "neutral"];

const KIND_LABEL: Record<RequestKindVM, string> = { claim: "Claim", replacement: "Replacement", waiting: "Waiting list" };
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN);

/** `Outstation claim · Mid Valley Megamall`, `Waiting list · Amelia Tan`, `Replacement · Darren Ong`. */
export function requestTitle(r: MemberRequest, nameOf: (staffId: string) => string | null): string {
  const d = r.detail ?? {};
  if (r.kind === "claim") {
    const type = str(d.claimType);
    const where = str(d.location);
    if (type === "outstation" && d.planeTicket === true) return `Plane ticket claim${where ? ` · ${where}` : ""}`;
    if (type === "outstation") return `Outstation claim${where ? ` · ${where}` : ""}`;
    if (type === "airbnb") return `Airbnb claim${where ? ` · ${where}` : ""}`;
    return r.title;
  }
  if (r.kind === "waiting") return `Waiting list · ${str(d.newPerson) || "New member"}`;
  const original = nameOf(str(d.originalStaffId));
  return `Replacement · ${original ?? (str(d.newPerson) || "Release position")}`;
}

/** What was sent, in one line — the first audit entry's note. */
export function requestSummary(r: MemberRequest, nameOf: (staffId: string) => string | null): string {
  const d = r.detail ?? {};
  const amount = num(d.amount);
  const money = Number.isFinite(amount) ? rm2(amount) : "";
  if (r.kind === "claim") {
    if (str(d.claimType) === "outstation" && d.planeTicket === true) return [str(d.regionName), "plane ticket", money].filter(Boolean).join(" · ");
    if (str(d.claimType) === "outstation") return [str(d.regionName) || str(d.region), Number.isFinite(num(d.spots)) ? `${num(d.spots)} spots` : "", money].filter(Boolean).join(" · ");
    if (str(d.claimType) === "airbnb") {
      const pax = num(d.pax), nights = num(d.nights);
      return [Number.isFinite(pax) ? `${pax} pax` : "", Number.isFinite(nights) ? `${nights} night${nights === 1 ? "" : "s"}` : "", money].filter(Boolean).join(" · ");
    }
    return [str(d.location), money].filter(Boolean).join(" · ");
  }
  if (r.kind === "waiting") return [str(d.newPerson), str(d.start) ? `preferred start ${shortDay(str(d.start))}` : ""].filter(Boolean).join(" · ");
  const original = nameOf(str(d.originalStaffId));
  const source = ({ new: "new member joining", existing: "existing member", waiting: "from the waiting list", vacancy: "no replacement" } as Record<string, string>)[str(d.replacementSource)] ?? "";
  return [original ? `Replace ${original}` : "", source].filter(Boolean).join(" · ");
}

/** `RQ-2609-004` — the number HR and the member both quote. */
export function requestCode(r: MemberRequest): string {
  const number = r.requestNo ?? (r.detail as Record<string, unknown> | undefined)?.requestNo;
  return typeof number === "string" && number ? number : `RQ-${r.id.slice(0, 8).toUpperCase()}`;
}

export function requestRowsVM(requests: readonly MemberRequest[], nameOf: (staffId: string) => string | null): RequestRowVM[] {
  return [...requests]
    .filter(r => r.status !== "draft")
    .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
    .map(r => {
      const [status, tone] = requestStatus(r.status);
      return { id: r.id, kind: r.kind, title: requestTitle(r, nameOf), sub: `${shortDay(klDate(r.submittedAt ?? r.createdAt))} · ${requestCode(r)}`, status, tone };
    });
}

const WHAT: Record<string, string> = {
  submitted: "Submitted", needs_info: "Returned · needs info", approved: "Approved", rejected: "Rejected",
  waiting: "On the waiting list", reserved: "Place reserved", accepted: "Applicant accepted", executed: "Done",
  paid: "Paid", withdrawn: "Cancelled", expired: "Reservation expired",
  failed: "Removed from the waiting list", scheduled: "Scheduled",
};

export function requestDetailVM(r: MemberRequest, events: readonly RequestEvent[] | null, options: {
  nameOf: (staffId: string) => string | null;
  readOnly: boolean;
}): RequestDetailVM {
  const [status, tone] = requestStatus(r.status);
  const d = r.detail ?? {};
  const amount = num(d.amount);
  // A resubmission is a second "Submitted"; a status that did not change is bookkeeping.
  const shown = (events ?? []).filter(e => e.status !== "draft" && e.status !== e.from);
  const log: RequestEventVM[] = shown.map((e, i) => {
    const last = i === shown.length - 1;
    const what = e.status === "allocated" ? `Allocated to ${str(d.department) || "the team"}` : (e.from === "needs_info" && e.status === "submitted" ? "Updated and sent again" : WHAT[e.status] ?? e.status);
    const who = e.actor === "you" ? "You" : e.actor === "hr" ? (e.actorName ? `${e.actorName} (HR)` : "HR") : e.actor === "finance" ? "Finance"
      : e.actor === "principal" ? (e.actorName ?? "Principal") : "Revenue system";
    const bad = ["needs_info", "rejected", "withdrawn", "expired", "failed"].includes(e.status);
    return {
      what, who, when: klDayTime(e.at),
      note: e.note ?? (i === 0 && e.status === "submitted" ? requestSummary(r, options.nameOf) : ""),
      dot: last ? (bad ? "bad" : "good") : "past",
    };
  });
  if (!log.length) {
    log.push({ what: "Submitted", who: "You", when: klDayTime(r.submittedAt ?? r.createdAt), note: requestSummary(r, options.nameOf), dot: r.status === "withdrawn" ? "bad" : "good" });
  }
  // An approved claim says where its money is coming from (2026-10-08).
  const payout = r.kind === "claim" ? claimPayoutLine(readClaimPayout(r.payout), r.status, "member") : null;
  return {
    id: r.id,
    title: requestTitle(r, options.nameOf),
    code: requestCode(r),
    status,
    tone,
    facts: [
      { l: "Type", v: KIND_LABEL[r.kind] },
      { l: "Submitted", v: shortDay(klDate(r.submittedAt ?? r.createdAt)) },
      ...(r.kind === "claim" && Number.isFinite(amount) ? [{ l: "Claim amount", v: rm2(amount) }] : []),
      { l: "Current step", v: status },
      ...(payout ? [{ l: "Payment", v: payout }] : []),
    ],
    log,
    canCancel: !options.readOnly && (r.status === "submitted" || r.status === "needs_info"),
    canUpdate: !options.readOnly && r.status === "needs_info",
  };
}

// ── Memos ──

/** The memo's kind, from who sent it — its icon and colour. */
export function memoCat(sender: string): MemoCat {
  if (/\bHR\b|human resource/i.test(sender)) return "hr";
  if (/arena|championship|revenue team/i.test(sender)) return "arena";
  if (/operation|\bops\b|logistic|venue/i.test(sender)) return "ops";
  return "mgmt";
}

export function memoVM(m: MemberMemo, local: { read: ReadonlySet<string>; acked: ReadonlyMap<string, string> }): MemoVM {
  const ackedAt = m.acknowledgedAt ?? local.acked.get(m.id) ?? null;
  const paras = m.body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return {
    id: m.id,
    cat: memoCat(m.sender),
    from: m.sender,
    when: shortDay(klDate(m.publishedAt)),
    whenFull: klLongTime(m.publishedAt),
    title: m.title,
    paras: paras.length ? paras : [m.body],
    read: !!m.readAt || !!ackedAt || local.read.has(m.id),
    needsAck: m.requiresAck,
    acked: !!ackedAt,
    ackedText: `You acknowledged this memo · ${ackedAt && local.acked.has(m.id) && !m.acknowledgedAt ? "just now" : ackedAt ? klDayTime(ackedAt) : "just now"}`,
  };
}

// ── View as ──

/** Everybody a Principal may view as, a group per sub-department, the top of each tree first. */
export function vaGroupsVM(memberships: readonly MemberMembership[], query: string, viewing: string): VaGroupVM[] {
  const q = query.trim().toLowerCase();
  return memberships.map(m => {
    const byId = new Map(m.people.map(p => [p.id, p]));
    const depth = (id: string) => {
      let d = 0, p = byId.get(id);
      const seen = new Set<string>();
      while (p?.parentId && byId.has(p.parentId) && !seen.has(p.parentId)) { seen.add(p.parentId); p = byId.get(p.parentId); d++; }
      return d;
    };
    const people = m.people
      .filter(p => !q || `${p.name} ${p.title}`.toLowerCase().includes(q))
      .map(p => ({ id: p.id, departmentId: m.id, name: p.name, ini: initials(p.name), sub: [p.title, p.rank].filter(Boolean).join(" · "), level: depth(p.id), viewing: p.id === viewing }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    return { title: `${m.name.toUpperCase()} · ${people.length}`, people };
  }).filter(g => g.people.length);
}

// ── Team & capacity ──

export interface TeamInput {
  map: MemberOrgMap;
  departmentId: string;
  subName: string;
  staffId: string;
  /** The working month's Arena people, by staff id — sales, held and costed. */
  people: readonly ArenaPerson[];
  month: string;
  kpi: { enabled: boolean; threshold: number | null };
  capacity: number | null;
  occupied: number;
  /** Ranks of the member's own tree, by staff id (the snapshot's people). */
  ranks: ReadonlyMap<string, string>;
}

const CAP_NOTE = "Waiting-list matches use eligibility, start dates and open places. Direct-report capacity is checked separately.";

/** The family chart: everybody above (to the department's directors), the member, two levels below. */
export function teamVM(input: TeamInput): TeamVM | null {
  const people = input.map.people.filter(p => p.departmentId === input.departmentId);
  const me = people.find(p => p.staffId === input.staffId);
  if (!me) return null;
  const byNode = new Map(people.map(p => [p.id, p]));
  const score = new Map(input.people.map(p => [p.id, p]));
  const department = input.map.departments.find(d => d.id === input.departmentId);
  const mon = monthShort(input.month).split(" ")[0];

  const status = (staffId: string): [string, TeamDot] => {
    const p = score.get(staffId);
    if (input.kpi.enabled) {
      const hit = input.kpi.threshold !== null && (p?.kpiQty ?? 0) >= input.kpi.threshold;
      return hit ? ["KPI hit", "good"] : ["KPI pending", "wait"];
    }
    if (!p || !(p.sales > 0)) return ["No sales yet", "wait"];
    if (p.blindOrders > 0) return ["Cost pending", "wait"];
    return ["Selling", "good"];
  };
  const childrenOf = (nodeId: string) => people.filter(p => p.parentId === nodeId).sort((a, b) => a.name.localeCompare(b.name));
  const titleOf = (p: { staffId: string; title: string }) => [p.title, input.ranks.get(p.staffId)].filter(Boolean).join(" · ");

  // Up the line, then the department's directors above the top of the tree.
  // The line is a chain, one person per level. The directors are not: each of
  // them directs the whole sub-department and none reports to another (Fair has
  // KRIS and PETER), so they share ONE level, side by side, as on the portal's
  // director rail.
  const chain: typeof people = [];
  for (let p = me.parentId ? byNode.get(me.parentId) : undefined; p && !chain.includes(p); p = p.parentId ? byNode.get(p.parentId) : undefined) chain.push(p);
  const directors = (department?.directors ?? []).filter(d => d.id !== input.staffId);
  const ups: TeamLevelVM[] = [
    ...(directors.length ? [{
      level: directors.length > 1 ? "DIRECTORS" : "DIRECTOR",
      nodes: directors.map(d => ({ id: `d:${d.id}`, name: d.name, title: "Revenue Director", ini: initials(d.name), dot: "up" as const })),
    }] : []),
    ...[...chain].reverse().map(p => ({ level: "UPLINE", nodes: [{ id: p.id, name: p.name, title: titleOf(p), ini: initials(p.name), dot: "up" as const }] })),
  ];
  const above = directors.length + chain.length;
  const kids: TeamKidVM[] = childrenOf(me.id).map(k => ({
    id: k.id, name: k.name, title: k.title, ini: initials(k.name), dot: status(k.staffId)[1],
    kids: childrenOf(k.id).map(g => ({ id: g.id, name: g.name, title: g.title, ini: initials(g.name), dot: status(g.staffId)[1] })),
  }));

  const sales = (staffId: string) => {
    const p = score.get(staffId);
    return p && Number.isFinite(p.sales) ? rm(p.sales) : "—";
  };
  const sheets: Record<string, PersonSheetVM> = {};
  const teamText = (nodeId: string) => { const n = childrenOf(nodeId).length; return n ? `${n} direct` : "None yet"; };
  for (const d of directors) {
    const tops = people.filter(p => !p.parentId || !byNode.has(p.parentId)).length;
    sheets[`d:${d.id}`] = { name: d.name, role: "Revenue Director", ini: initials(d.name), self: false,
      stats: [{ label: `Sales · ${mon}`, value: "—", tone: "ink" }, { label: "Status", value: "Director", tone: "up" }, { label: "Team", value: `${tops} team${tops === 1 ? "" : "s"}`, tone: "ink" }],
      reportsTo: `Leads ${input.subName}` };
  }
  for (const p of chain) {
    const up = p.parentId ? byNode.get(p.parentId) : undefined;
    sheets[p.id] = { name: p.name, role: titleOf(p), ini: initials(p.name), self: false,
      stats: [{ label: `Sales · ${mon}`, value: sales(p.staffId), tone: "ink" }, { label: "Status", value: "Upline", tone: "up" }, { label: "Team", value: teamText(p.id), tone: "ink" }],
      reportsTo: up ? `Reports to ${up.name}` : directors.length ? `Reports to ${directors.map(d => d.name).join(" · ")}` : "Top of the team" };
  }
  const own = (p: (typeof people)[number], reportsTo: string, self = false) => {
    const [st, dot] = status(p.staffId);
    sheets[p.id] = { name: p.name, role: self ? titleOf(p) : p.title, ini: initials(p.name), self,
      stats: [{ label: `Sales · ${mon}`, value: sales(p.staffId), tone: "ink" }, { label: "Status", value: st, tone: dot === "good" ? "good" : "wait" }, { label: "Team", value: teamText(p.id), tone: "ink" }],
      reportsTo };
  };
  const upline = me.parentId ? byNode.get(me.parentId) : undefined;
  own(me, upline ? `Reports to ${upline.name}` : directors.length ? `Reports to ${directors.map(d => d.name).join(" · ")}` : "Top of the team", true);
  for (const k of childrenOf(me.id)) {
    own(k, "Reports to you");
    for (const g of childrenOf(k.id)) own(g, `Reports to ${k.name}`);
  }

  const below = kids.length + kids.reduce((a, k) => a + k.kids.length, 0);
  const cap = input.capacity;
  const open = cap !== null ? cap - input.occupied : null;
  const meNode: TeamNodeVM = { id: me.id, name: me.name, title: ["You", input.ranks.get(input.staffId)].filter(Boolean).join(" · "), ini: initials(me.name), dot: status(input.staffId)[1] };
  return {
    lede: `${input.subName} · Revenue`,
    capacity: {
      occupied: input.occupied,
      capacity: cap,
      chip: open === null ? "No limit set" : open > 0 ? `${open} open place${open === 1 ? "" : "s"}` : "Full",
      full: open !== null && open <= 0,
      note: CAP_NOTE,
    },
    count: `${above} above · ${below} below`,
    legend: [input.kpi.enabled ? "KPI hit" : "Selling", "Pending", "Upline"],
    ups,
    me: meNode,
    kids,
    sheets,
  };
}

// ── The request form's choices ──

const WEEK_BRAND: Record<string, string> = { AKEMI: "Akemi", ERGOTEX: "Ergotex", ZANOTTI: "Zanotti", DUNLOP: "Dunlopillo" };
/** A brand's two colours as palette tokens (the prototype's BILL_BRAND). */
const WEEK_TONE: Record<string, [string, string]> = {
  AKEMI: ["var(--rv-accent)", "var(--rv-peach-bg)"], ERGOTEX: ["var(--rv-green)", "var(--rv-green-bg)"],
  ZANOTTI: ["var(--rv-amber)", "var(--rv-gold-tint)"], DUNLOP: ["var(--rv-brown)", "var(--rv-sand)"],
};

/**
 * The fair weekends a claim can be for, newest first: every weekend of the
 * months the member's Arena covers that has already begun. A claim is only for
 * the member's own brand week (user 2026-10-06), and the fair is the booth the
 * Arena scores them at that weekend — the brand they picked, else the one they
 * opened the most bills for; picked but nothing written there, that brand's
 * booth with the most bills. The database's `member_claim_brand_week` reads the
 * same boards the same way. No brand week = nothing to claim that weekend.
 */
export function claimWeeks(snapshots: readonly (MemberArenaSnapshot | null | undefined)[], today: string): ClaimWeek[] {
  const out = new Map<string, ClaimWeek>();
  const orders = (e: { people: { orders: number }[] }) => e.people.reduce((n, p) => n + (p.orders || 0), 0);
  for (const snap of snapshots) {
    if (!snap) continue;
    const me = snap.selfId;
    const events = snap.history?.events ?? [];
    const month = (MONTHS_SHORT[Number(snap.period.slice(5, 7)) - 1] ?? "").toUpperCase();
    arenaMonthFridays(snap.period).forEach((friday, i) => {
      if (friday > today || out.has(friday)) return;
      const saved = snap.brandWeeks?.picks?.[friday] ?? null;
      const scoring = me ? events.find(e => e.week === friday && e.people.some(p => p.id === me && p.scoring !== false)) : undefined;
      const booth = scoring ?? (saved
        ? events.filter(e => e.week === friday && e.brand === saved).sort((a, b) => orders(b) - orders(a) || a.id.localeCompare(b.id))[0]
        : undefined);
      const brand = booth?.brand ?? saved ?? null;
      const [color, tint] = brand ? WEEK_TONE[brand] ?? ["var(--rv-brown)", "var(--rv-sand)"] : ["var(--rv-sub)", "var(--rv-sand)"];
      out.set(friday, {
        key: friday, month, n: `W${i + 1}`, brandWeek: brand ? `${WEEK_BRAND[brand] ?? brand} week` : "No brand week", brand,
        dates: booth ? dayRange(booth.start, booth.end) : arenaWeekendLabel(friday), venue: booth?.venue ?? null, org: booth?.organizer ?? null,
        fairId: booth?.fairId ?? null, start: booth?.start ?? null, end: booth?.end ?? null, auto: !!booth && !saved, claimable: !!booth?.fairId, color, tint,
      });
    });
  }
  return [...out.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/** Who the member may propose for a replacement: their own team in this sub-department. */
export function replaceable(membership: MemberMembership | undefined): { id: string; name: string }[] {
  if (!membership) return [];
  const self = membership.people.find(p => p.self);
  if (!self) return [];
  const below = new Set<string>([self.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of membership.people) if (p.parentId && below.has(p.parentId) && !below.has(p.id)) { below.add(p.id); grew = true; }
  }
  return membership.people.filter(p => p.id !== self.id && below.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ id: p.id, name: p.name }));
}

/** The member's waiting-list requests, and which an approved one a replacement may use. */
export function waitingChoices(requests: readonly MemberRequest[]): { id: string; name: string; sub: string; status: string; ok: boolean }[] {
  return requests.filter(r => r.kind === "waiting" && !["draft", "withdrawn", "rejected", "expired", "failed"].includes(r.status)).map(r => {
    const start = typeof r.detail.start === "string" ? r.detail.start : "";
    const ok = ["waiting", "reserved", "accepted", "allocated"].includes(r.status);
    return {
      id: r.id, name: typeof r.detail.newPerson === "string" ? r.detail.newPerson : "New member",
      sub: `${requestCode(r)} · ${ok && start ? `start ${shortDay(start)}` : `submitted ${shortDay(klDate(r.submittedAt ?? r.createdAt))}`}`,
      status: ok ? "Approved" : requestStatus(r.status)[0], ok,
    };
  });
}
