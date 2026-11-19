"use client";
/**
 * Won's quotation and bank slip (the owner, 2026-11-19: "close sell 的 won 除了输入金额之外，要可以附上 quotation & bank
 * slip" — both required). Two rows under the amount, each a tap to pick a photo or a PDF; a picked one shows its name and
 * may be picked again. The database refuses Won without both (crm_visit_outcome, mig 20261119230000).
 */
import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { typePx } from "./type";
import { Ic } from "./icons4a";

export interface WonFilePick { label: string; name: string | null; pick: (f: File) => void }
export interface WonFilesVM { quote: WonFilePick; slip: WonFilePick }

const ACCEPT = "image/*,application/pdf";

function Row({ f }: { f: WonFilePick }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = !!f.name;
  const row: CSSProperties = {
    display: "flex", alignItems: "center", gap: "10px", minHeight: "48px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px",
    border: `1px ${done ? "solid" : "dashed"} ${done ? "var(--crm-brown)" : "var(--crm-rust)"}`, background: done ? "var(--crm-tint-follow)" : "#fff",
    color: done ? "var(--crm-brown)" : "var(--crm-rust)", cursor: "pointer", font: "inherit", textAlign: "left", width: "100%",
  };
  return (
    <>
      <button type="button" data-won-file={f.label} onClick={() => ref.current?.click()} style={row}>
        <Ic name={done ? "check" : "paperclip"} size={16} />
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
          <span style={{ fontSize: typePx(14), fontWeight: 650 }}>{f.label} <b style={{ color: "var(--crm-oxblood)" }}>*</b></span>
          <span style={{ fontSize: typePx(12), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name ?? "Photo or PDF"}</span>
        </span>
        {done && <span style={{ fontSize: typePx(12), fontWeight: 600 }}>Change</span>}
      </button>
      <input ref={ref} type="file" accept={ACCEPT} style={{ display: "none" }}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) f.pick(file); }} />
    </>
  );
}

export function WonFiles({ v }: { v: WonFilesVM | null }) {
  if (!v) return null;
  return (
    <div data-won-files="" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Row f={v.quote} />
      <Row f={v.slip} />
    </div>
  );
}

/**
 * Book visit asks, once Book is pressed, whether the customer is sent the invitation (the owner, 2026-11-19: "确认后跳出是否
 * 发送邀请给客户" — a sale closed on the phone needs none). `askInvite` answers true (send), false (book only) or null (the
 * question closed: nothing is booked). Mounted once by CrmApp; with no host on screen (a test, a page without the CRM) it
 * answers true, as booking always did.
 */
type InviteAsk = { name: string; done: (v: boolean | null) => void };
let ask: InviteAsk | null = null, hosts = 0;
const askSubs = new Set<() => void>();
const askEmit = () => askSubs.forEach(f => f());
export function askInvite(name: string): Promise<boolean | null> {
  if (!hosts) return Promise.resolve(true);
  return new Promise(res => { ask?.done(null); ask = { name, done: v => { ask = null; askEmit(); res(v); } }; askEmit(); });
}

export function InviteAskHost() {
  const a = useSyncExternalStore(f => { askSubs.add(f); return () => { askSubs.delete(f); }; }, () => ask, () => null);
  useEffect(() => { hosts++; return () => { hosts--; }; }, []);
  useEffect(() => {
    if (!a) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") a.done(null); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [a]);
  if (!a || typeof document === "undefined") return null;
  const btn: CSSProperties = { font: "inherit", height: "48px", borderRadius: "24px", fontSize: typePx(15), fontWeight: 650, cursor: "pointer" };
  return createPortal(
    <div onClick={() => a.done(null)} role="dialog" aria-modal="true" aria-label="Send invitation to customer?" data-invite-ask=""
      style={{ position: "fixed", inset: 0, zIndex: 2147480001, boxSizing: "border-box", padding: "24px", background: "rgba(42,22,12,.40)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", animation: "fadeIn 180ms ease-out" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "340px", boxSizing: "border-box", background: "#fff", borderRadius: "24px", padding: "22px 18px 18px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 24px 48px rgba(42,22,12,.24)", animation: "popIn 220ms cubic-bezier(.2,.8,.2,1)" }}>
        <strong style={{ fontSize: typePx(19), color: "var(--crm-ink)", letterSpacing: "-.01em" }}>Send invitation to customer?</strong>
        <span style={{ fontSize: typePx(14), color: "var(--crm-muted)", lineHeight: 1.45 }}>{a.name ? `${a.name} gets` : "The customer gets"} the appointment card in their chat. Closed the sale on the phone? Book it without sending.</span>
        <button type="button" onClick={() => a.done(true)} style={{ ...btn, marginTop: "6px", border: 0, background: "var(--crm-rust)", color: "#fff" }}>Send invitation</button>
        <button type="button" onClick={() => a.done(false)} style={{ ...btn, border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }}>Book without sending</button>
      </div>
    </div>,
    document.body,
  );
}
