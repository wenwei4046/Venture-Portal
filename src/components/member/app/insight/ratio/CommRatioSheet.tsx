"use client";

import { useEffect, useState } from "react";
import { COMM_RATIO_STEPS, parseRatioPercent, ratioLabel } from "@/lib/commission/bill-comm-ratio";
import { COMM_RATIO_NOTE_MAX, commRatioNoteRefusal, sameRatio, type CommRatioContext, type CommRatioSaved } from "@/lib/member/comm-ratio";
import Sheet, { SheetHandle } from "../../Sheet";
import { ICON, Svg } from "../../icons";
import { klDate, monthShort, shortDay } from "../../format";
import p from "../../profile/profile.module.css";
import t from "../share/share.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** What is picked: its margin decides (no ratio), one of the ladder's steps, or a percentage typed. */
export type CommRatioPick = { kind: "margin" } | { kind: "step"; ratio: number } | { kind: "other"; text: string };

/** The pick a sheet opens on: the ratio set now, else its margin. */
export function openingPick(ctx: CommRatioContext): CommRatioPick {
  const set = ctx.ratio?.pct;
  if (set === undefined) return { kind: "margin" };
  const step = COMM_RATIO_STEPS.find(s => sameRatio(s, set));
  return step !== undefined ? { kind: "step", ratio: step } : { kind: "other", text: String(Math.round(set * 10_000) / 100) };
}

/** The ratio a pick asks for: null = its margin decides; undefined = a typed percentage that is none. */
export function pickedRatio(pick: CommRatioPick): number | null | undefined {
  if (pick.kind === "margin") return null;
  if (pick.kind === "step") return pick.ratio;
  return parseRatioPercent(pick.text) ?? undefined;
}

/**
 * Adjust commission (2026-11-27 — the user, on a bill's sheet: a Revenue Director "点三个点后可以调动 commission：1. 他可以选
 * ratio 自己填（25%、50%、75% 都可以调）2. … below margin 的 … 改成 [standard] margin，不用扣 50% … 同理 … 他可以调成 50%"):
 * the bill's margin and what its ladder alone pays it, the ratio set now, then 100% · 75% · 50% · 25% · 0% · Other — or
 * *Follow margin*, which takes the ratio off. Its sales count the same as its commission. The sheet asks the database first
 * whether it may change now (somebody's own bill, a director's own, a paid month, a close) and says why when not.
 */
export default function CommRatioSheet({ open, orderId, readOnly, load, onSave, onSaved, onClose }: {
  open: boolean;
  orderId: string | null;
  /** View as: the sheet shows, its button changes nothing. */
  readOnly: boolean;
  load: (orderId: string) => Promise<Outcome<CommRatioContext>>;
  onSave: (orderId: string, ratio: number | null, note: string | null) => Promise<Outcome<CommRatioSaved>>;
  /** Saved: the app reads the bill again. */
  onSaved: (saved: CommRatioSaved) => void;
  onClose: () => void;
}) {
  const [ctx, setCtx] = useState<{ orderId: string; data: CommRatioContext } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState<CommRatioPick>({ kind: "margin" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setFailed(null); setLoadError(null);
    let live = true;
    void load(orderId).then(res => {
      if (!live) return;
      if (res.ok) {
        setCtx({ orderId, data: res.data });
        setPick(openingPick(res.data));
        setNote(res.data.ratio?.note ?? "");
      } else { setCtx(null); setLoadError(res.error); }
    }).catch(() => { if (live) setLoadError("The bill could not be read."); });
    return () => { live = false; };
  }, [open, orderId, load]);

  const data = ctx && ctx.orderId === orderId ? ctx.data : null;
  const current = data?.ratio?.pct ?? null;
  const chosen = pickedRatio(pick);
  const changed = data !== null && chosen !== undefined
    && (!sameRatio(chosen, current) || (chosen !== null && note.trim() !== (data.ratio?.note ?? "")));
  const ladderPays = data ? ratioLabel(data.ladder.multiplier) : "";

  const save = async () => {
    if (!orderId || busy || readOnly || !changed || chosen === undefined) return;
    const refused = commRatioNoteRefusal(note);
    if (refused) { setFailed(refused); return; }
    setBusy(true);
    setFailed(null);
    const res = await onSave(orderId, chosen, chosen === null ? null : note.trim() || null);
    setBusy(false);
    if (!res.ok) { setFailed(res.error); return; }
    onSaved(res.data);
  };

  const pill = (key: string, on: boolean, label: string, next: CommRatioPick) => (
    <button key={key} type="button" className={`${p.pill} ${on ? p.pillOn : ""}`} aria-pressed={on} disabled={busy}
      onClick={() => { setPick(next); setFailed(null); }}>{label}</button>
  );

  const form = data && !data.refusal;
  return (
    <Sheet open={open} onClose={onClose} z={23} maxHeight="92%" scroll className={`${p.sheetBody} ${t.body}`} label="Adjust commission">
      <SheetHandle />
      <div>
        <h2 className={t.title}>Adjust commission</h2>
        <span className={t.ctx}>{data ? `${data.orderNo} · ${monthShort(data.month)}` : loadError ? "" : "Loading…"}</span>
      </div>
      {loadError && <p className={p.formError}>{loadError}</p>}
      {data && (
        <div className={t.shareRow}>
          <span className={t.shareIcon}><Svg d={ICON.chart} size={18} sw={1.9} /></span>
          <span className={t.shareText}>
            <span className={t.shareLabel}>MARGIN</span>
            <span className={t.shareLine}>{data.margin === null ? "Cost pending" : [`${data.margin.toFixed(1)}%`, data.ladder.label].filter(Boolean).join(" · ")}</span>
            <span className={t.shareSub}>{`Its margin pays ${ladderPays}`}</span>
          </span>
        </div>
      )}
      {data?.ratio && (
        <div className={t.shareRow}>
          <span className={t.shareIcon}><Svg d={ICON.percent} size={18} sw={1.9} /></span>
          <span className={t.shareText}>
            <span className={t.shareLabel}>SET NOW</span>
            <span className={t.shareLine}>{[ratioLabel(data.ratio.pct), data.ratio.by].filter(Boolean).join(" · ")}</span>
            <span className={t.shareSub}>{[data.ratio.at ? `Set ${shortDay(klDate(data.ratio.at))}` : null, data.ratio.note].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
      )}
      {data?.refusal && <p className={t.blocked}>{data.refusal}</p>}
      {form && (
        <>
          <div>
            <p className={t.section}>COMMISSION</p>
            <div className={p.pills}>
              {pill("margin", pick.kind === "margin", `Follow margin · ${ladderPays}`, { kind: "margin" })}
              {COMM_RATIO_STEPS.map(step => pill(String(step), pick.kind === "step" && sameRatio(pick.ratio, step), ratioLabel(step), { kind: "step", ratio: step }))}
              {pill("other", pick.kind === "other", "Other", { kind: "other", text: pick.kind === "other" ? pick.text : "" })}
            </div>
          </div>
          {pick.kind === "other" && (
            <label className={p.field}>
              <span className={p.fieldLabel}>Commission %</span>
              <input className={p.input} inputMode="decimal" autoFocus value={pick.text} placeholder="e.g. 60" disabled={busy}
                onChange={e => { setPick({ kind: "other", text: e.target.value }); setFailed(null); }} />
            </label>
          )}
          {chosen !== null && (
            <label className={p.field}>
              <span className={p.fieldLabel}>Why (optional)</span>
              <textarea className={`${p.input} ${p.textarea}`} rows={2} maxLength={COMM_RATIO_NOTE_MAX} value={note} disabled={busy}
                onChange={e => { setNote(e.target.value); setFailed(null); }} />
            </label>
          )}
          {failed && <p className={p.formError}>{failed}</p>}
          <button className={p.primary} onClick={() => void save()} disabled={busy || readOnly || !changed}>
            {readOnly ? "Read-only while viewing as" : busy ? "Saving…"
              : chosen === undefined ? "Set to …" : chosen === null ? "Follow its margin" : `Set to ${ratioLabel(chosen)}`}
          </button>
        </>
      )}
      <button className={p.done} onClick={onClose}>{form ? "Cancel" : "Done"}</button>
    </Sheet>
  );
}
