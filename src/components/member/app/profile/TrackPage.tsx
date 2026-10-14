"use client";

import { useEffect, useState } from "react";
import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import { PageHead, TONE } from "./IncomePages";
import type { RequestDetailVM, TrackVM } from "./profile-vm";
import { ANY_TIME, ANY_TIME_LABEL, isAnyTime } from "@/lib/member/waiting-start";
import p from "./profile.module.css";
import s from "./track.module.css";

const PENCIL = "M4 20h4L19 9l-4-4L4 16Z";

export type TrackSegment = "waiting" | "replacement";

/**
 * Waiting list & replacements (the HR revamp's handoff, 2026-10-10): the
 * member's sub-department's waiting list — theirs by name, everybody else's by
 * an initial — then what they sent and where it stands. A row opens its sheet.
 */
export default function TrackPage({ vm, segment, onSegment, onBack, onOpen, onNew }: {
  vm: TrackVM;
  segment: TrackSegment;
  onSegment: (segment: TrackSegment) => void;
  onBack: () => void;
  onOpen: (id: string) => void;
  /** Submit a new request → the Requests page, or its form; absent when they may send neither kind (2026-10-11). */
  onNew?: () => void;
}) {
  const rows = segment === "waiting" ? vm.waiting : vm.replacements;
  return (
    <div className={p.page}>
      <PageHead back="Profile" title="Waiting list & replacements" lede="Where your requests stand." onBack={onBack} />
      <div className={s.seg} role="tablist" aria-label="Show">
        {([["waiting", "Waiting list"], ["replacement", "Replacement list"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={segment === id} className={`${s.segBtn} ${segment === id ? s.segOn : ""}`} onClick={() => onSegment(id)}>{label}</button>
        ))}
      </div>
      {segment === "waiting" && vm.queue && (
        <section className={s.queue} aria-label={vm.queue.title}>
          <div className={s.queueHead}><span className={s.queueTitle}>{vm.queue.title}</span><span className={s.queueTotal}>{vm.queue.total}</span></div>
          <div className={s.queueRows}>
            {vm.queue.rows.map(q => (
              <div key={q.pos} className={`${s.queueRow} ${q.mine ? s.queueMine : ""}`}>
                <span className={s.queuePos}>{q.pos}</span>
                <span className={s.queueName}>{q.name}</span>
                {q.mine && <span className={s.queueYours}>Yours</span>}
              </div>
            ))}
            {!vm.queue.rows.length && <p className={s.queueEmpty}>Nobody is waiting right now.</p>}
          </div>
        </section>
      )}
      <section>
        <h2 className={s.histHead}>Request history &amp; status</h2>
        {rows.map(r => (
          <button key={r.id} className={p.reqRow} onClick={() => onOpen(r.id)}>
            <span className={p.sheetMinW}><span className={p.reqTitle}>{r.title}</span><span className={p.reqSub}>{r.sub}</span></span>
            <span className={`${p.status} ${TONE[r.tone]}`}>{r.status}</span>
            <Svg d={ICON.chevronRight} size={14} sw={1.9} stroke="var(--rv-sub)" />
          </button>
        ))}
        {!rows.length && <p className={p.empty}>{segment === "waiting" ? "You haven't submitted a waiting list." : "No replacements submitted."}</p>}
      </section>
      {onNew && <button className={s.newLink} onClick={onNew}>Submit a new request →</button>}
    </div>
  );
}

/**
 * A waiting list or replacement, opened (the handoff's sheet): its facts,
 * Edit request → Update while HR has not acted on it — else a note saying it
 * is decided — its audit history, and Cancel request while it is still with HR.
 */
export function RequestInfoSheet({ open, vm, busy, error, onSave, onCancel, onClose }: {
  open: boolean;
  vm: RequestDetailVM | null;
  busy: boolean;
  error: string | null;
  /** Update: true once it went (the fields close), false to stay open with the error. */
  onSave: (values: Record<string, string>) => Promise<boolean>;
  onCancel: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  // Another request, or the sheet closed: the fields start again from what was sent.
  useEffect(() => { setEditing(null); }, [vm?.id, open]);
  const save = async () => {
    if (!editing || busy) return;
    if (await onSave(editing)) setEditing(null);
  };
  return (
    <Sheet open={open} onClose={onClose} z={22} maxHeight="78%" peek className={s.panel} label={vm?.title ?? "Request"}>
      {vm && (
        <>
          <div className={s.head}>
            <SheetHandle />
            <div className={s.headRow}>
              <div className={p.sheetMinW}><span className={s.title}>{vm.title}</span><span className={s.code}>{vm.code}</span></div>
              <span className={`${s.chip} ${TONE[vm.tone]}`}>{vm.status}</span>
            </div>
          </div>
          <div className={s.body}>
            {editing && vm.edit ? (
              <>
                {vm.edit.fields.map(f => {
                  // The start date may be "Any time ready" instead of a day (2026-10-14).
                  if (f.anyTime) {
                    const on = isAnyTime(editing[f.key]);
                    return (
                      <div key={f.key} className={s.field} role="group" aria-label={f.label}>
                        <span className={s.fieldLabel}>{f.label}</span>
                        <div className={s.dayOrAny}>
                          <input className={s.input} type="date" aria-label={f.label} value={on ? "" : editing[f.key] ?? ""} disabled={on}
                            onChange={e => setEditing({ ...editing, [f.key]: e.target.value })} />
                          <button type="button" className={`${p.pill} ${on ? p.pillOn : ""}`} aria-pressed={on}
                            onClick={() => setEditing({ ...editing, [f.key]: on ? "" : ANY_TIME })}>{ANY_TIME_LABEL}</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <label key={f.key} className={s.field}>
                      <span className={s.fieldLabel}>{f.label}</span>
                      <input className={s.input} type={f.type} inputMode={f.type === "tel" ? "tel" : undefined} value={editing[f.key] ?? ""}
                        maxLength={f.key === "reason" ? 3000 : f.key === "contact" ? 32 : 150}
                        onChange={e => setEditing({ ...editing, [f.key]: e.target.value })} />
                    </label>
                  );
                })}
                {error && <p className={p.formError} role="alert">{error}</p>}
                <div className={s.editBtns}>
                  <button className={s.ghost} onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                  <button className={s.update} onClick={() => void save()} disabled={busy}>{busy ? "Sending…" : "Update"}</button>
                </div>
              </>
            ) : (
              <>
                <div className={s.facts}>
                  {vm.facts.map(f => (
                    <div key={f.l} className={s.fact}><span className={s.factLabel}>{f.l}</span><span className={s.factValue}>{f.v}</span></div>
                  ))}
                </div>
                {vm.edit && (
                  <button className={s.edit} onClick={() => setEditing(vm.edit!.values)}><Svg d={PENCIL} size={15} sw={1.8} />Edit request</button>
                )}
                {vm.lockedNote && <p className={s.locked}>{vm.lockedNote}</p>}
                {error && <p className={p.formError} role="alert">{error}</p>}
              </>
            )}
            <div>
              <p className={s.audit}>AUDIT HISTORY</p>
              {vm.log.map((e, i) => {
                const last = i === vm.log.length - 1;
                return (
                  <div key={i} className={s.event}>
                    <div className={s.rail}><span className={`${s.dot} ${last ? s.dotLast : ""}`} /><span className={`${s.line} ${last ? s.lineLast : ""}`} /></div>
                    <div className={s.eventBody}>
                      <div className={s.eventTop}><span className={s.eventWhat}>{e.what}</span><span className={s.eventWhen}>{e.when}</span></div>
                      <div className={s.eventWho}>{e.who}</div>
                      {e.note && <div className={s.eventNote}>{e.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Kept from the app before the handoff (user 2026-10-10): a request still with HR can be withdrawn. */}
            {vm.canCancel && !editing && <button className={p.cancel} onClick={onCancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel request"}</button>}
            <button className={s.ghost} onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
