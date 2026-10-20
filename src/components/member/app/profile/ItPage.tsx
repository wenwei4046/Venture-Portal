"use client";

import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE, itDay, type ItRequest, type ItStatus } from "@/lib/it-requests/model";
import { ICON, Svg } from "../icons";
import { PageHead, TONE } from "./IncomePages";
import s from "./profile.module.css";

export type ItFilter = "all" | ItStatus;
const FILTERS: { id: ItFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "new", label: "New" }, { id: "in_progress", label: "In progress" }, { id: "fixed", label: "Fixed" }, { id: "closed", label: "Closed" },
];

/**
 * IT support (2026-10-20 — the user: "i want add on a button to get submit for IT support or help" … "他也能看到自己
 * submit 的 case status"): Send a request, then everything one sent and where it stands. For the desk (IT requests ·
 * View — the Principal and Ultimate full access, "just principal or ulitmate full access"), *Mine* and *All* —
 * everybody's, each with who sent it; *All* is
 * also the desktop sidebar's IT requests. A row opens the request, its files and its thread.
 */
export default function ItPage({ mode, mine, desk, deskOn, newCount, error, filter, readOnly, onFilter, onMode, onBack, onNew, onOpen }: {
  mode: "mine" | "all";
  mine: ItRequest[] | null;
  desk: ItRequest[] | null;
  /** The account holds IT requests · View: Mine and All. */
  deskOn: boolean;
  newCount: number;
  error: string | null;
  filter: ItFilter;
  /** View as: nothing is sent. */
  readOnly: boolean;
  onFilter: (filter: ItFilter) => void;
  onMode: (mode: "mine" | "all") => void;
  onBack: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const all = mode === "all" && deskOn;
  const list = all ? desk : mine;
  const shown = (list ?? []).filter(r => filter === "all" || r.status === filter);
  return (
    <div className={s.page}>
      <PageHead back="Profile" title={all ? "IT requests" : "IT support"} onBack={onBack} />
      {deskOn && (
        <div className={s.seg} role="tablist" aria-label="IT requests">
          {([["mine", "Mine"], ["all", newCount ? `All · ${newCount} new` : "All"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={(id === "all") === all} className={`${s.segBtn} ${(id === "all") === all ? s.segOn : ""}`} onClick={() => onMode(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!all && !readOnly && (
        <section className={s.newCard}>
          <button className={s.newRow} onClick={onNew}>
            <span className={`${s.newIcon} ${s.newClaim}`}><Svg d={ICON.help} size={20} sw={1.8} /></span>
            <span className={s.sheetMinW}><span className={s.newTitle}>Send a request</span><span className={s.newSub}>A bug, a new feature or a suggestion</span></span>
            <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
          </button>
        </section>
      )}
      <section>
        <div className={s.sectHead}><h2 className={s.h2}>{all ? "Everybody’s requests" : "My requests"}</h2></div>
        <div className={s.filters}>
          {FILTERS.map(f => (
            <button key={f.id} className={`${s.filter} ${filter === f.id ? s.filterOn : ""}`} onClick={() => onFilter(f.id)} aria-pressed={filter === f.id}>{f.label}</button>
          ))}
        </div>
        {shown.map(r => (
          <button key={r.id} className={s.reqRow} onClick={() => onOpen(r.id)}>
            <span className={s.sheetMinW}>
              <span className={s.reqTitle}>{r.title}</span>
              <span className={s.reqSub}>{[r.ref, CATEGORY_LABEL[r.category], all ? r.senderName : null, itDay(r.updatedAt)].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={`${s.status} ${TONE[STATUS_TONE[r.status]]}`}>{STATUS_LABEL[r.status]}</span>
            <Svg d={ICON.chevronRight} size={14} sw={1.9} stroke="var(--rv-sub)" />
          </button>
        ))}
        {list === null && <p className={s.empty} role={error ? "alert" : "status"}>{error ?? "Loading the requests…"}</p>}
        {list !== null && !shown.length && <p className={s.empty}>{list.length ? "None with this status." : all ? "Nobody has sent one yet." : "Nothing sent yet."}</p>}
        {list !== null && error && <p className={s.empty} role="alert">{error}</p>}
      </section>
    </div>
  );
}
