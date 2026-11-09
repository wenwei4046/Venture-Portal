"use client";

/**
 * The chat's Label sheet (CRM redesign v4, notes/15 — frame 11b of docs/design_handoff_crm_redesign_v4/CRM Optimized
 * Phone.dc.html): over the chat, white, its grab handle, "Label" with Done, the labels as the Inbox's More › Label draws
 * them (dot · name · tick · pencil), New label, and the label form (Name · Colour · Save · Delete label). Its view model is
 * shared/label-sheet.ts — the Inbox's and the chat's one code path. On the desktop (the chat's ⋮ › Label, Customer info's
 * "+ Add") the same sheet stands as a dialog at the desktop's own sizes (`desk`).
 */
import { Fragment, type CSSProperties } from "react";
import type { ChatLabelSheet } from "./label-sheet";
import { PHONE_TYPE, typePx } from "./type";

/** A frame's on-screen px (the v4 handoff's sizes are final px on the phone) — phone4a's `fs`. */
const fs = (px: number) => typePx(Math.round((px / PHONE_TYPE) * 100) / 100);
const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

export function LabelSheetView({ s, desk }: { s: ChatLabelSheet | null; desk?: boolean }) {
  if (!s) return null;
  const px = (n: number) => (desk ? `${n}px` : fs(n));
  const card: CSSProperties = { borderRadius: "18px", border: "1px solid var(--crm-rule)", padding: "0 16px" };
  const back = (
    <span onClick={s.labelFormBack} style={{ display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "36px", fontSize: px(15), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>Back
    </span>
  );
  const panel: CSSProperties = desk
    ? { width: "400px", maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 64px)", overflowY: "auto", boxSizing: "border-box", background: "#fff", borderRadius: "20px", padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 16px 36px rgba(42,22,12,.16)", animation: "fadeIn 140ms ease-out" }
    : { animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px calc(34px + var(--sheet-safe, 0px))", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "86%", overflowY: "auto", boxSizing: "border-box" };
  return (
    <div data-label-sheet="" onClick={s.done} style={desk
      ? { position: "fixed", inset: 0, zIndex: 40, background: "rgba(42,22,12,.18)", display: "grid", placeItems: "center" }
      : { position: "absolute", inset: 0, zIndex: 8, background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={stop} role="dialog" aria-label="Label" style={panel}>
        {!desk && <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-line)" }} />}
        {s.list && (<>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ margin: 0, flex: 1, fontSize: px(20), fontWeight: 700, letterSpacing: "-.02em", color: "var(--crm-ink)" }}>Label</h2>
            <span onClick={s.done} role="button" style={{ fontSize: px(15), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>Done</span>
          </div>
          <div style={card}>
            {s.labelItems.map((lb, i) => (<Fragment key={i}>
              <div onClick={() => void lb.go()} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", borderTop: i ? "1px solid var(--crm-rule)" : "0", fontSize: px(16), color: "var(--crm-ink)", cursor: "pointer" }}>
                <span style={{ flex: "none", width: "12px", height: "12px", borderRadius: "50%", background: lb.dot }} />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{lb.label}</span>
                <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${lb.ring}`, background: lb.fill, display: "grid", placeItems: "center", color: "#fff" }}>
                  {lb.on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>}
                </span>
                <span onClick={lb.edit} title="Edit label" style={{ flex: "none", width: "36px", height: "36px", marginRight: "-8px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4" /></svg>
                </span>
              </div>
            </Fragment>))}
          </div>
          <div style={card}>
            <div onClick={s.labelNew} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", fontSize: px(16), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>New label
            </div>
          </div>
        </>)}
        {s.editing && (<>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {back}
            <strong style={{ fontSize: px(15), fontWeight: 650, color: "var(--crm-ink)" }}>{s.labelFormTitle}</strong>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: px(13), fontWeight: 600, color: "var(--crm-muted)" }}>Name</span>
            <input value={s.labelFormName} onChange={s.labelSetName} placeholder="e.g. Hot lead" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", borderRadius: "24px", border: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: px(16), color: "var(--crm-ink)", outline: "none" }} />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: px(13), fontWeight: 600, color: "var(--crm-muted)" }}>Colour</span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {s.labelSwatches.map((sw, i) => (
                <span key={i} onClick={sw.pick} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", background: sw.c, border: `3px solid ${sw.ring}`, boxShadow: `0 0 0 1px ${sw.c}`, cursor: "pointer" }} />
              ))}
            </div>
          </div>
          <span onClick={s.labelSave ? () => void s.labelSave?.() : undefined} style={{ minHeight: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: s.labelSaveBg, color: "#fff", fontSize: px(16), fontWeight: 650, cursor: s.labelSaveCur }}>Save</span>
          {s.labelCanDelete && (
            <span onClick={() => void s.labelDelete()} style={{ minHeight: "44px", display: "grid", placeItems: "center", color: "var(--crm-oxblood)", fontSize: px(15), fontWeight: 600, cursor: "pointer" }}>Delete label</span>
          )}
        </>)}
      </div>
    </div>
  );
}

/** The phone screens' name for it (tools/crm-design/phone-4a.cjs imports every `Phone4a…` from shared/phone4a). */
export const Phone4aLabelSheet = LabelSheetView;
