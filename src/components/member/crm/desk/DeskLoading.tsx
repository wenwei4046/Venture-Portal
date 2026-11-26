"use client";
/**
 * The desktop CRM's frame with nothing in it yet (2026-11-27 — the owner, after #1158 took the phone out of a reload:
 * "relaod time , change to crm frame"). While a reload of the CRM loads on a computer, the screen is the CRM's own frame
 * instead of the Revenue app's sidebar. That covers /member's loading.tsx (AppLoading), the app's drawing before it has
 * measured itself (RevenueApp) and the CRM waiting for its first answer (CrmApp), and the CRM then fills in where it will
 * stand.
 *
 * It has the same geometry and colours as the frame a reload opens on — Desk4aSide's ink rail (68 px, the H tile), its
 * cream nav (237 px, "CRM") and Desk4aTop's 56 px bar with the date. The CRM nav is always open after a reload, because
 * `collapsed` is not a kept place (nav.ts). Nothing in it answers. The rail's icons, the nav's rows, the greeting and the
 * page come with the CRM, so nobody is shown a row their permissions will take away.
 */
import { topDate } from "./vm/frame4a";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";

export function DeskLoading({ line }: { line: string }) {
  return (
    <div data-crm-desk-loading="" data-revenue-app="" role="status" style={{ position: "fixed", inset: 0, zIndex: 10, background: "var(--crm-page)", color: "var(--crm-ink)",
      fontFamily: "Inter, sans-serif", lineHeight: "normal", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "68px", boxSizing: "border-box", padding: "22px 12px 18px", background: "var(--crm-ink)" }}>
        <div style={{ padding: "0 0 20px 5px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", font: `600 14px ${TIGHT}`,
            background: "var(--crm-orange)", color: "#fff" }}>H</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: "68px", top: 0, bottom: 0, width: "237px", boxSizing: "border-box", padding: "24px 12px 18px", background: "var(--crm-cream-nav)",
        borderRight: "1px solid var(--crm-nav-line)" }}>
        <div style={{ padding: "0 10px 18px", font: `500 22px ${TIGHT}`, letterSpacing: "-0.01em", color: "var(--crm-ink)" }}>CRM</div>
      </div>
      <div style={{ position: "absolute", left: "305px", right: 0, top: 0, height: "56px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "18px", padding: "0 36px",
        borderBottom: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
        <div style={{ width: "1px", height: "18px", background: "var(--crm-rule)", marginLeft: "auto" }} />
        <div style={{ font: "400 13px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{topDate(new Date())}</div>
      </div>
      <div style={{ position: "absolute", left: "305px", right: 0, top: "56px", bottom: 0, display: "grid", placeItems: "center", padding: "24px", boxSizing: "border-box",
        textAlign: "center", font: "400 14px Inter, sans-serif", color: "var(--crm-muted)" }}>{line}</div>
    </div>
  );
}
