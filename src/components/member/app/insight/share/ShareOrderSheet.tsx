"use client";

import { useEffect, useMemo, useState } from "react";
import {
  draftPayload, draftProblem, evenPercents, listNames, ownerKeepsPercent, pctLabel,
  type DraftPart, type ShareContext, type ShareRequest, type ShareSendInput,
} from "@/lib/member/share-requests";
import Sheet, { SheetHandle } from "../../Sheet";
import { ICON, Svg } from "../../icons";
import { rm2 } from "../../format";
import p from "../../profile/profile.module.css";
import t from "./share.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** A part's step on the − / + buttons, in percent. */
const STEP = 5;

/**
 * Share order (2026-10-21 — the user, on My sales orders: "我可以把这个 order allocation 分在不同的 sales 之间"): pick who
 * sold the bill with you and each one's part — evenly split until a part is changed — and send it. Each colleague named
 * accepts it in their own app, then HR approves it on Comm Cal; the bill's sales, KPI items and commission are split from
 * then on. The sheet asks the database first: whom the bill may go to, and why it cannot be shared now (a paid month, a
 * request already open).
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
  const [picks, setPicks] = useState<DraftPart[]>([]);
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setPicks([]); setTouched(false); setNote(""); setQuery(""); setFailed(null); setLoadError(null);
    let live = true;
    void load(orderId).then(res => {
      if (!live) return;
      if (res.ok) setCtx({ orderId, data: res.data });
      else { setCtx(null); setLoadError(res.error); }
    }).catch(() => { if (live) setLoadError("Who it may be shared with could not be read."); });
    return () => { live = false; };
  }, [open, orderId, load]);

  const data = ctx && ctx.orderId === orderId ? ctx.data : null;
  // Somebody holding a part now whom the form does not name keeps it: the owner gives from their own part only.
  const holds = useMemo(() => new Map((data?.holders ?? []).filter(h => !h.owner).map(h => [h.id, Math.round(h.pct * 10_000) / 100])), [data]);
  const othersPercent = useMemo(() => [...holds.entries()].filter(([id]) => !picks.some(x => x.id === id)).reduce((a, [, v]) => a + v, 0), [holds, picks]);
  const keeps = ownerKeepsPercent(picks, othersPercent);
  const problem = picks.length ? draftProblem(picks, othersPercent) : null;
  const total = data?.total ?? 0;
  const amount = (percent: number) => rm2(Math.round(total * percent) / 100);

  const toggle = (id: string, name: string) => {
    setFailed(null);
    setPicks(current => {
      if (current.some(x => x.id === id)) {
        const rest = current.filter(x => x.id !== id);
        if (touched) return rest;
        const others = [...holds.entries()].filter(([h]) => !rest.some(x => x.id === h)).reduce((a, [, v]) => a + v, 0);
        const even = evenPercents(rest.length, others);
        return rest.map((x, i) => (holds.has(x.id) ? x : { ...x, percent: even[i] }));
      }
      if (current.length >= 5) return current;
      const next = [...current, { id, name, percent: holds.get(id) ?? 0 }];
      const others = [...holds.entries()].filter(([h]) => !next.some(x => x.id === h)).reduce((a, [, v]) => a + v, 0);
      if (!touched) {
        const even = evenPercents(next.length, others);
        return next.map((x, i) => (holds.has(x.id) ? x : { ...x, percent: even[i] }));
      }
      const room = ownerKeepsPercent(current, others) - 1;
      return next.map(x => (x.id === id && !holds.has(id) ? { ...x, percent: Math.max(1, Math.min(evenPercents(next.length, others)[0], room)) } : x));
    });
  };
  /** − / +: to the next multiple of 5 that way (33 → 35 or 30), never under 1% nor past what leaves the owner 1%. */
  const step = (id: string, up: boolean) => {
    setTouched(true);
    setFailed(null);
    setPicks(current => current.map(x => {
      if (x.id !== id) return x;
      const most = x.percent + ownerKeepsPercent(current, othersPercent) - 1;
      const next = up ? Math.floor(x.percent / STEP) * STEP + STEP : Math.ceil(x.percent / STEP) * STEP - STEP;
      return { ...x, percent: Math.max(1, Math.min(most, next)) };
    }));
  };

  const send = async () => {
    if (!orderId || busy || readOnly || problem || !picks.length) return;
    setBusy(true);
    setFailed(null);
    const res = await onSend({ orderId, parts: draftPayload(picks), note: note.trim() });
    setBusy(false);
    if (!res.ok) { setFailed(res.error); return; }
    onOpenRequest(res.data);
  };

  const team = data?.team ?? [];
  const shown = query.trim() ? team.filter(m => m.name.toLowerCase().includes(query.trim().toLowerCase())) : team;
  const names = listNames(picks.map(x => x.name));

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
            <p className={t.section}>SPLIT</p>
            <div className={t.split}>
              <div className={t.part}>
                <span className={t.partName}>{ownerName} <span className={t.partYou}>(you)</span></span>
                <span className={t.partAmt}>{amount(keeps)}</span>
                <span className={t.partPct}><span className={t.pct}>{pctLabel(keeps / 100)}</span></span>
              </div>
              {[...holds.entries()].filter(([id]) => !picks.some(x => x.id === id)).map(([id, v]) => (
                <div key={id} className={t.part}>
                  <span className={t.partName}>{team.find(m => m.id === id)?.name ?? data.holders.find(h => h.id === id)?.name ?? "—"}</span>
                  <span className={t.partAmt}>{amount(v)} · holds it now</span>
                  <span className={t.partPct}><span className={t.pct}>{pctLabel(v / 100)}</span></span>
                </div>
              ))}
              {picks.map(x => (
                <div key={x.id} className={t.part}>
                  <span className={t.partName}>{x.name}</span>
                  <span className={t.partAmt}>{amount(x.percent)}</span>
                  <span className={t.partPct}>
                    <button className={t.step} aria-label={`Less for ${x.name}`} onClick={() => step(x.id, false)} disabled={x.percent <= 1}>−</button>
                    <span className={t.pct}>{pctLabel(x.percent / 100)}</span>
                    <button className={t.step} aria-label={`More for ${x.name}`} onClick={() => step(x.id, true)} disabled={keeps <= 1}>+</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className={t.section}>WHO SOLD IT WITH YOU</p>
            {team.length > 8 && (
              <input className={t.search} type="search" placeholder="Search a name" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search a name" />
            )}
            <div className={t.team}>
              {shown.map(m => {
                const on = picks.some(x => x.id === m.id);
                const held = holds.get(m.id);
                return (
                  <button key={m.id} className={`${t.member} ${on ? t.memberOn : ""}`} onClick={() => toggle(m.id, m.name)}
                    disabled={!!m.unavailable || (!on && picks.length >= 5)} aria-pressed={on}>
                    <span className={`${t.tick} ${on ? t.tickOn : ""}`}>{on && <Svg d={ICON.check} size={14} sw={2.6} />}</span>
                    <span className={t.memberText}>
                      <span className={t.memberName}>{m.name}</span>
                      <span className={t.memberSub}>{m.unavailable ?? m.title ?? ""}</span>
                    </span>
                    {held !== undefined && <span className={t.memberHolds}>Holds {pctLabel(held / 100)}</span>}
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
          {(failed ?? problem) && <p className={p.formError}>{failed ?? problem}</p>}
          <button className={p.primary} onClick={() => void send()} disabled={busy || readOnly || !picks.length || !!problem}>
            {readOnly ? "Read-only while viewing as" : busy ? "Sending…" : picks.length ? `Send to ${names}` : "Pick who sold it with you"}
          </button>
        </>
      )}
      <button className={p.done} onClick={onClose}>{data && !data.request && !data.blocked ? "Cancel" : "Done"}</button>
    </Sheet>
  );
}
