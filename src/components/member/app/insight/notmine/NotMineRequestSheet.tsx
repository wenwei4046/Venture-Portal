"use client";

import { useEffect, useState } from "react";
import type { NotMineRequest } from "@/lib/member/not-mine-requests";
import Sheet, { SheetHandle } from "../../Sheet";
import { TONE } from "../../profile/IncomePages";
import { notMineRequestVM } from "./not-mine-model";
import p from "../../profile/profile.module.css";
import t from "../share/share.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One Not my order request (2026-11-14): the bill, the reason sent, HR's answer and the trail. Its salesperson may withdraw
 * it while it is with HR (a second tap). View as reads it and sends nothing.
 */
export default function NotMineRequestSheet({ open, request, error, readOnly, onWithdraw, onClose }: {
  open: boolean;
  request: NotMineRequest | null;
  /** The list could not be read: said instead of an empty sheet. */
  error?: string | null;
  readOnly: boolean;
  onWithdraw: (id: string) => Promise<Outcome<NotMineRequest>>;
  onClose: () => void;
}) {
  const vm = request ? notMineRequestVM(request, readOnly) : null;
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const id = request?.id ?? null;
  useEffect(() => { setBusy(false); setArmed(false); setFailed(null); }, [id]);

  const withdraw = async () => {
    if (!id || busy) return;
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    setFailed(null);
    const res = await onWithdraw(id);
    setBusy(false);
    setArmed(false);
    if (!res.ok) setFailed(res.error);
  };

  return (
    <Sheet open={open} onClose={onClose} z={24} maxHeight="88%" scroll className={`${p.sheetBody} ${t.body}`} label={vm ? `Not my order ${vm.orderNo}` : "Not my order"}>
      <SheetHandle />
      {!vm && <p className={p.rdError}>{error ?? "Loading…"}</p>}
      {vm && (
        <>
          <div className={p.sheetTop}>
            <div className={p.sheetMinW}><span className={p.rdTitle}>{vm.orderNo}</span><span className={p.rdId}>{vm.sub}</span></div>
            <span className={`${p.tag} ${TONE[vm.tone]}`}>{vm.status}</span>
          </div>
          <div className={p.rdFacts}>
            {vm.facts.map(f => (
              <div key={f.l} className={p.rdFact}><span className={p.rdFactLabel}>{f.l}</span><span className={p.rdFactValue}>{f.v}</span></div>
            ))}
          </div>
          <div>
            <p className={p.audit}>AUDIT HISTORY</p>
            {vm.log.map((e, i) => {
              const last = i === vm.log.length - 1;
              return (
                <div key={i} className={p.event}>
                  <div className={p.eventRail}>
                    <span className={`${p.eventDot} ${e.dot === "good" ? p.eventDotGood : e.dot === "bad" ? p.eventDotBad : ""}`} />
                    <span className={`${p.eventLine} ${last ? p.eventLineLast : ""}`} />
                  </div>
                  <div className={p.eventBody}>
                    <span className={p.eventTop}><span className={p.eventWhat}>{e.what}</span><span className={p.eventWhen}>{e.when}</span></span>
                    <span className={p.eventWho}>{e.who}</span>
                    {e.note && <span className={p.eventNote}>{e.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {failed && <p className={p.formError}>{failed}</p>}
          {vm.canWithdraw && (
            <button className={p.cancel} onClick={() => void withdraw()} disabled={busy}>
              {busy ? "Withdrawing…" : armed ? "Tap again to withdraw" : "Withdraw request"}
            </button>
          )}
        </>
      )}
      <button className={p.done} onClick={onClose}>Done</button>
    </Sheet>
  );
}
