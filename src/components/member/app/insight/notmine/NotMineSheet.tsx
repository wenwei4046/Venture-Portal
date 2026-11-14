"use client";

import { useEffect, useState } from "react";
import { NOT_MINE_REASON_MAX, notMineReasonRefusal, type NotMineContext, type NotMineRequest } from "@/lib/member/not-mine-requests";
import Sheet, { SheetHandle } from "../../Sheet";
import { ICON, Svg } from "../../icons";
import { rm2 } from "../../format";
import p from "../../profile/profile.module.css";
import t from "../share/share.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Not my order (2026-11-14 — the user: a salesperson selects their sales order on the phone and writes a request "not my
 * order"; HR approves, and the bill counts for nothing — "完完全全 don't count"): say whose order it is, or why it is not
 * yours, and send it to HR. The sheet asks the database first whether it may be sent now (a bill that does not count, a
 * month in payroll, a close, a shared bill, a share request open) — or shows the request already open on it.
 */
export default function NotMineSheet({ open, orderId, readOnly, load, onSend, onOpenRequest, onClose }: {
  open: boolean;
  orderId: string | null;
  /** View as: the form shows, its button sends nothing. */
  readOnly: boolean;
  load: (orderId: string) => Promise<Outcome<NotMineContext>>;
  onSend: (orderId: string, reason: string) => Promise<Outcome<NotMineRequest>>;
  /** The bill's open request, or the one just sent: its own sheet. */
  onOpenRequest: (request: NotMineRequest) => void;
  onClose: () => void;
}) {
  const [ctx, setCtx] = useState<{ orderId: string; data: NotMineContext } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setReason(""); setFailed(null); setLoadError(null);
    let live = true;
    void load(orderId).then(res => {
      if (!live) return;
      if (res.ok) setCtx({ orderId, data: res.data });
      else { setCtx(null); setLoadError(res.error); }
    }).catch(() => { if (live) setLoadError("The bill could not be read."); });
    return () => { live = false; };
  }, [open, orderId, load]);

  const data = ctx && ctx.orderId === orderId ? ctx.data : null;
  const empty = reason.trim() === "";

  const send = async () => {
    if (!orderId || busy || readOnly) return;
    const refused = notMineReasonRefusal(reason);
    if (refused) { setFailed(refused); return; }
    setBusy(true);
    setFailed(null);
    const res = await onSend(orderId, reason.trim());
    setBusy(false);
    if (!res.ok) { setFailed(res.error); return; }
    onOpenRequest(res.data);
  };

  return (
    <Sheet open={open} onClose={onClose} z={23} maxHeight="92%" scroll className={`${p.sheetBody} ${t.body}`} label="Not my order">
      <SheetHandle />
      <div>
        <h2 className={t.title}>Not my order</h2>
        <span className={t.ctx}>
          {data ? [data.orderNo, data.customer || null, rm2(data.total)].filter(Boolean).join(" · ") : loadError ? "" : "Loading…"}
        </span>
      </div>
      {loadError && <p className={p.formError}>{loadError}</p>}
      {data?.request && (
        <button className={t.shareRow} onClick={() => onOpenRequest(data.request!)}>
          <span className={t.shareIcon}><Svg d={ICON.notMine} size={18} sw={1.9} /></span>
          <span className={t.shareText}><span className={t.shareLabel}>NOT MY ORDER</span><span className={t.shareWait}>Waiting for HR</span></span>
          <Svg d={ICON.chevronRight} size={16} sw={2} />
        </button>
      )}
      {data && !data.request && data.blocked && <p className={t.blocked}>{data.blocked}</p>}
      {data && !data.request && !data.blocked && (
        <>
          <label className={p.field}>
            <span className={p.fieldLabel}>Whose order is it?</span>
            <textarea className={`${p.input} ${p.textarea}`} rows={3} maxLength={NOT_MINE_REASON_MAX} value={reason}
              placeholder="e.g. Keyed for ANTHONY" onChange={e => { setReason(e.target.value); setFailed(null); }} />
          </label>
          {failed && <p className={p.formError}>{failed}</p>}
          <button className={p.primary} onClick={() => void send()} disabled={busy || readOnly || empty}>
            {readOnly ? "Read-only while viewing as" : busy ? "Sending…" : "Send to HR"}
          </button>
        </>
      )}
      <button className={p.done} onClick={onClose}>{data && !data.request && !data.blocked ? "Cancel" : "Done"}</button>
    </Sheet>
  );
}
