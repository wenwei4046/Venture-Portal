"use client";

import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import { PageHead, TONE } from "./IncomePages";
import type { RequestDetailVM, RequestKindVM, RequestRowVM } from "./profile-vm";
import s from "./profile.module.css";

export type RequestFilter = "all" | RequestKindVM;

const NEW: { kind: RequestKindVM; title: string; sub: string; d: string; tone: string }[] = [
  { kind: "claim", title: "Submit transport claim", sub: "Outstation and Airbnb stays", d: ICON.receipt, tone: s.newClaim },
  { kind: "food", title: "Submit food claim", sub: "Meals on the days you worked a fair", d: ICON.food, tone: s.newFood },
  { kind: "replacement", title: "Submit replacement", sub: "Replacements, transfers and exits", d: ICON.team, tone: s.newRepl },
  { kind: "waiting", title: "Submit waiting list", sub: "Joining requests and allocation", d: ICON.calendar, tone: s.newWait },
];
const FILTERS: { id: RequestFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "claim", label: "Claim" }, { id: "food", label: "Food claim" }, { id: "replacement", label: "Replacement" },
  { id: "waiting", label: "Waiting list" },
];

/** The transport claim's row for a title HR ticked for the air ticket alone (2026-10-31). */
const PLANE_ONLY = "Plane tickets to a fair you fly to";

/** The prototype's three; a food claim is offered only to whom HR opened it (Fair, a title HR picked — 2026-10-13). */
const ALL_KINDS: readonly RequestKindVM[] = ["claim", "replacement", "waiting"];

/**
 * Requests (lines 1081–1108): the ways to start one, then everything sent and where it is.
 * Each opens its form, in View as too — the form is where read-only shows (it sends nothing).
 * `kinds`: the ones they may send (2026-10-11) — a claim (and a food claim) is this page's
 * Create, a waiting list or replacement Waiting list & replacements'. The Food claim filter
 * shows only while a food claim is offered or one was sent.
 * `planeOnly` (2026-10-31): their title is ticked for the air ticket alone — the transport claim's row says so.
 */
export default function RequestsPage({ rows, filter, kinds = ALL_KINDS, planeOnly = false, onFilter, onBack, onNew, onOpen }: {
  rows: RequestRowVM[];
  filter: RequestFilter;
  kinds?: readonly RequestKindVM[];
  planeOnly?: boolean;
  onFilter: (filter: RequestFilter) => void;
  onBack: () => void;
  onNew: (kind: RequestKindVM) => void;
  onOpen: (id: string) => void;
}) {
  const shown = rows.filter(r => filter === "all" || r.kind === filter);
  const starts = NEW.filter(n => kinds.includes(n.kind)).map(n => (n.kind === "claim" && planeOnly ? { ...n, sub: PLANE_ONLY } : n));
  const filters = FILTERS.filter(f => f.id !== "food" || kinds.includes("food") || rows.some(r => r.kind === "food"));
  return (
    <div className={s.page}>
      <PageHead back="Profile" title="Requests" onBack={onBack} />
      {starts.length > 0 && (
        <section className={s.newCard}>
          {starts.map(n => (
            <button key={n.kind} className={s.newRow} onClick={() => onNew(n.kind)}>
              <span className={`${s.newIcon} ${n.tone}`}><Svg d={n.d} size={20} sw={1.8} /></span>
              <span className={s.sheetMinW}><span className={s.newTitle}>{n.title}</span><span className={s.newSub}>{n.sub}</span></span>
              <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          ))}
        </section>
      )}
      <section>
        <div className={s.sectHead}><h2 className={s.h2}>My requests</h2></div>
        <div className={s.filters}>
          {filters.map(f => (
            <button key={f.id} className={`${s.filter} ${filter === f.id ? s.filterOn : ""}`} onClick={() => onFilter(f.id)} aria-pressed={filter === f.id}>{f.label}</button>
          ))}
        </div>
        {shown.map(r => (
          <button key={r.id} className={s.reqRow} onClick={() => onOpen(r.id)}>
            <span className={s.sheetMinW}><span className={s.reqTitle}>{r.title}</span><span className={s.reqSub}>{r.sub}</span></span>
            <span className={`${s.status} ${TONE[r.tone]}`}>{r.status}</span>
            <Svg d={ICON.chevronRight} size={14} sw={1.9} stroke="var(--rv-sub)" />
          </button>
        ))}
        {!shown.length && <p className={s.empty}>{rows.length ? "No requests of this type." : ALL_KINDS.every(k => kinds.includes(k)) ? "Nothing sent yet. Start a claim, a replacement or a waiting-list request above." : starts.length ? "Nothing sent yet. Start one above." : "Nothing sent yet."}</p>}
      </section>
      <p className={s.note}>Each submission gets a request ID. HR approval, execution and payment are tracked separately.</p>
    </div>
  );
}

/** One request: its facts and its audit history (lines 1530–1552). */
export function RequestSheet({ open, vm, busy, error, onCancel, onUpdate, onClose }: {
  open: boolean;
  vm: RequestDetailVM | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onUpdate: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} z={22} maxHeight="86%" scroll peek className={s.sheetBody} label={vm?.title ?? "Request"}>
      <SheetHandle />
      {vm && (
        <>
          <div className={s.sheetTop}>
            <div className={s.sheetMinW}><span className={s.rdTitle}>{vm.title}</span><span className={s.rdId}>{vm.code}</span></div>
            <span className={`${s.tag} ${TONE[vm.tone]}`}>{vm.status}</span>
          </div>
          <div className={s.rdFacts}>
            {vm.facts.map(f => (
              <div key={f.l} className={s.rdFact}><span className={s.rdFactLabel}>{f.l}</span><span className={s.rdFactValue}>{f.v}</span></div>
            ))}
          </div>
          <div>
            <p className={s.audit}>AUDIT HISTORY</p>
            {vm.log.map((e, i) => {
              const last = i === vm.log.length - 1;
              return (
                <div key={i} className={s.event}>
                  <div className={s.eventRail}>
                    <span className={`${s.eventDot} ${e.dot === "good" ? s.eventDotGood : e.dot === "bad" ? s.eventDotBad : ""}`} />
                    <span className={`${s.eventLine} ${last ? s.eventLineLast : ""}`} />
                  </div>
                  <div className={s.eventBody}>
                    <span className={s.eventTop}><span className={s.eventWhat}>{e.what}</span><span className={s.eventWhen}>{e.when}</span></span>
                    <span className={s.eventWho}>{e.who}</span>
                    {e.note && <span className={s.eventNote}>{e.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {error && <p className={s.formError}>{error}</p>}
          {vm.canUpdate && <button className={s.primary} onClick={onUpdate} disabled={busy}>Update and send again</button>}
          {vm.canCancel && <button className={s.cancel} onClick={onCancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel request"}</button>}
          <button className={s.done} onClick={onClose}>Done</button>
        </>
      )}
    </Sheet>
  );
}
