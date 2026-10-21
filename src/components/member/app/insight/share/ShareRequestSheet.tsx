"use client";

import { useEffect, useState } from "react";
import type { ShareRequest } from "@/lib/member/share-requests";
import Sheet, { SheetHandle } from "../../Sheet";
import { TONE } from "../../profile/IncomePages";
import { shareRequestVM } from "./share-model";
import p from "../../profile/profile.module.css";
import t from "./share.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One share request (2026-10-21): the bill, the split it asks for, each colleague's answer and the whole trail — who sent
 * it, who accepted, HR's decision. A colleague still to answer accepts or declines it here (a note optional); its
 * salesperson may withdraw it until HR decides. View as reads it and sends nothing.
 */
export default function ShareRequestSheet({ open, request, error, staffId, readOnly, onAnswer, onWithdraw, onClose }: {
  open: boolean;
  request: ShareRequest | null;
  /** The list could not be read: said instead of an empty sheet. */
  error?: string | null;
  /** Whose answer is asked: the member's own staff id. */
  staffId: string;
  readOnly: boolean;
  onAnswer: (id: string, accept: boolean, note: string | null) => Promise<Outcome<ShareRequest>>;
  onWithdraw: (id: string) => Promise<Outcome<ShareRequest>>;
  onClose: () => void;
}) {
  const vm = request ? shareRequestVM(request, staffId, readOnly) : null;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | "withdraw" | null>(null);
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const id = request?.id ?? null;
  useEffect(() => { setNote(""); setBusy(null); setArmed(false); setFailed(null); }, [id]);

  const answer = async (accept: boolean) => {
    if (!id || busy) return;
    setBusy(accept ? "accept" : "decline");
    setFailed(null);
    const res = await onAnswer(id, accept, note.trim() || null);
    setBusy(null);
    if (!res.ok) setFailed(res.error);
    else setNote("");
  };
  const withdraw = async () => {
    if (!id || busy) return;
    if (!armed) { setArmed(true); return; }
    setBusy("withdraw");
    setFailed(null);
    const res = await onWithdraw(id);
    setBusy(null);
    setArmed(false);
    if (!res.ok) setFailed(res.error);
  };

  return (
    <Sheet open={open} onClose={onClose} z={24} maxHeight="88%" scroll className={p.sheetBody} label={vm ? `Share request ${vm.orderNo}` : "Share request"}>
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
            <p className={t.section}>SHARED WITH</p>
            <div className={t.split}>
              {vm.parts.map(x => (
                <div key={x.id} className={t.part}>
                  <span className={t.partName}>{x.name}</span>
                  <span className={t.partAmt}>{x.pct} · {x.amount}</span>
                  <span className={t.partPct}><span className={`${t.answer} ${TONE[x.tone]}`}>{x.answer}</span></span>
                </div>
              ))}
            </div>
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
          {vm.canAnswer && (
            <label className={p.field}>
              <span className={p.fieldLabel}>Note <span className={t.partYou}>(optional)</span></span>
              <textarea className={`${p.input} ${p.textarea}`} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
            </label>
          )}
          {failed && <p className={p.formError}>{failed}</p>}
          {vm.canAnswer && (
            <div className={t.pair}>
              <button className={p.cancel} onClick={() => void answer(false)} disabled={!!busy}>{busy === "decline" ? "Declining…" : "Decline"}</button>
              <button className={p.primary} onClick={() => void answer(true)} disabled={!!busy}>{busy === "accept" ? "Accepting…" : "Accept"}</button>
            </div>
          )}
          {vm.canWithdraw && (
            <button className={p.cancel} onClick={() => void withdraw()} disabled={!!busy}>
              {busy === "withdraw" ? "Withdrawing…" : armed ? "Tap again to withdraw" : "Withdraw request"}
            </button>
          )}
          <button className={p.done} onClick={onClose}>Done</button>
        </>
      )}
      {!vm && <button className={p.done} onClick={onClose}>Done</button>}
    </Sheet>
  );
}
