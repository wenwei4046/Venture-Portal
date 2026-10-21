"use client";

import { useEffect, useState } from "react";
import { SHARE_PART, draftPayload, pctLabel, type ShareContext, type ShareRequest, type ShareSendInput } from "@/lib/member/share-requests";
import Sheet, { SheetHandle } from "../../Sheet";
import { ICON, Svg } from "../../icons";
import { rm2 } from "../../format";
import p from "../../profile/profile.module.css";
import t from "./share.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Share order (2026-10-21 — the user, on My sales orders: "我可以把这个 order allocation 分在不同的 sales 之间"; then "only
 * can share one pax, then percentage for them request is fix with 50% 50%"): pick the ONE colleague who sold the bill with
 * you and send it — half each. They accept it in their own app, then HR approves it on Comm Cal; the bill's sales, KPI items
 * and commission are split from then on. The sheet asks the database first: whom the bill may go to, and why it cannot be
 * shared now (a paid month, a bill HR shares already, a request already open).
 */
export default function ShareOrderSheet({ open, orderId, ownerName, readOnly, load, onSend, onOpenRequest, onClose }: {
  open: boolean;
  orderId: string | null;
  /** The salesperson on the bill — the reader. */
  ownerName: string;
  /** View as: the form shows, its button sends nothing. */
  readOnly: boolean;
  load: (orderId: string) => Promise<Outcome<ShareContext>>;
  onSend: (input: ShareSendInput) => Promise<Outcome<ShareRequest>>;
  /** The bill's open request, or the one just sent: its own sheet. */
  onOpenRequest: (request: ShareRequest) => void;
  onClose: () => void;
}) {
  const [ctx, setCtx] = useState<{ orderId: string; data: ShareContext } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setPick(null); setNote(""); setQuery(""); setFailed(null); setLoadError(null);
    let live = true;
    void load(orderId).then(res => {
      if (!live) return;
      if (res.ok) setCtx({ orderId, data: res.data });
      else { setCtx(null); setLoadError(res.error); }
    }).catch(() => { if (live) setLoadError("Who it may be shared with could not be read."); });
    return () => { live = false; };
  }, [open, orderId, load]);

  const data = ctx && ctx.orderId === orderId ? ctx.data : null;
  const half = data ? rm2(Math.round(data.total * SHARE_PART * 100) / 100) : "";

  const send = async () => {
    if (!orderId || busy || readOnly || !pick) return;
    setBusy(true);
    setFailed(null);
    const res = await onSend({ orderId, parts: draftPayload(pick), note: note.trim() });
    setBusy(false);
    if (!res.ok) { setFailed(res.error); return; }
    onOpenRequest(res.data);
  };

  const team = data?.team ?? [];
  const shown = query.trim() ? team.filter(m => m.name.toLowerCase().includes(query.trim().toLowerCase())) : team;

  return (
    <Sheet open={open} onClose={onClose} z={23} maxHeight="92%" scroll className={p.sheetBody} label="Share order">
      <SheetHandle />
      <div>
        <h2 className={t.title}>Share order</h2>
        <span className={t.ctx}>{data ? `${data.orderNo} · ${rm2(data.total)}` : loadError ? "" : "Loading…"}</span>
      </div>
      {loadError && <p className={p.formError}>{loadError}</p>}
      {data?.request && (
        <button className={t.shareRow} onClick={() => onOpenRequest(data.request!)}>
          <span className={t.shareIcon}><Svg d={ICON.share} size={18} sw={1.9} /></span>
          <span className={t.shareText}><span className={t.shareLabel}>SHARE REQUEST</span><span className={t.shareLine}>A request for this bill is open — open it</span></span>
          <Svg d={ICON.chevronRight} size={16} sw={2} />
        </button>
      )}
      {data && !data.request && data.blocked && <p className={t.blocked}>{data.blocked}</p>}
      {data && !data.request && !data.blocked && (
        <>
          <div>
            <p className={t.section}>SPLIT · HALF EACH</p>
            <div className={t.split}>
              <div className={t.part}>
                <span className={t.partName}>{ownerName} <span className={t.partYou}>(you)</span></span>
                <span className={t.partAmt}>{half}</span>
                <span className={t.partPct}><span className={t.pct}>{pctLabel(1 - SHARE_PART)}</span></span>
              </div>
              <div className={t.part}>
                <span className={`${t.partName} ${pick ? "" : t.partYou}`}>{pick?.name ?? "Your colleague"}</span>
                <span className={t.partAmt}>{half}</span>
                <span className={t.partPct}><span className={t.pct}>{pctLabel(SHARE_PART)}</span></span>
              </div>
            </div>
          </div>
          <div>
            <p className={t.section}>WHO SOLD IT WITH YOU</p>
            {team.length > 8 && (
              <input className={t.search} type="search" placeholder="Search a name" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search a name" />
            )}
            <div className={t.team} role="radiogroup" aria-label="Who sold it with you">
              {shown.map(m => {
                const on = pick?.id === m.id;
                return (
                  <button key={m.id} className={`${t.member} ${on ? t.memberOn : ""}`} role="radio" aria-checked={on}
                    onClick={() => { setFailed(null); setPick(on ? null : { id: m.id, name: m.name }); }} disabled={!!m.unavailable}>
                    <span className={`${t.tick} ${on ? t.tickOn : ""}`}>{on && <Svg d={ICON.check} size={14} sw={2.6} />}</span>
                    <span className={t.memberText}>
                      <span className={t.memberName}>{m.name}</span>
                      <span className={t.memberSub}>{m.unavailable ?? m.title ?? ""}</span>
                    </span>
                  </button>
                );
              })}
              {!shown.length && <p className={t.none}>{team.length ? "Nobody by that name." : "Nobody else is on this team."}</p>}
            </div>
          </div>
          <label className={p.field}>
            <span className={p.fieldLabel}>Note <span className={t.partYou}>(optional)</span></span>
            <textarea className={`${p.input} ${p.textarea}`} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
          </label>
          {failed && <p className={p.formError}>{failed}</p>}
          <button className={p.primary} onClick={() => void send()} disabled={busy || readOnly || !pick}>
            {readOnly ? "Read-only while viewing as" : busy ? "Sending…" : pick ? `Send to ${pick.name}` : "Pick who sold it with you"}
          </button>
        </>
      )}
      <button className={p.done} onClick={onClose}>{data && !data.request && !data.blocked ? "Cancel" : "Done"}</button>
    </Sheet>
  );
}
