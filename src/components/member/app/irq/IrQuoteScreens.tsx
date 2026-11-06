"use client";
// IR Quote (2026-11-05 — `.design/ir-quote/design_handoff_ir_quote`): the screens. Each is a prototype template
// (tpl/, generated) run by its ported logic (logic/) through `DcHost`, inside `[data-irq]`, which carries the
// prototype's colours, keyframes and faces (ir-quote.css, irq-fonts.ts).
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IRQ_CSS_QUOTE, IRQ_CSS_SETTINGS, IRQ_CSS_SETTINGS_MOBILE } from "./irq-css";
import { DcHost, type DcComponents, type DcVals } from "./dc";
import { manrope, spaceGrotesk } from "./irq-fonts";
import { useIrqBoot } from "./useIrqBoot";
import { QuoteLogic } from "./logic/QuoteLogic";
import { SettingsLogic } from "./logic/SettingsLogic";
import { SettingsMobileLogic } from "./logic/SettingsMobileLogic";
import { WorkspaceLogic } from "./logic/WorkspaceLogic";
import { renderQuote } from "./tpl/QuoteTpl";
import { renderSettings } from "./tpl/SettingsTpl";
import { renderSettingsMobile } from "./tpl/SettingsMobileTpl";
import { renderWorkspace } from "./tpl/WorkspaceTpl";
import { CRM_CUSTOMERS } from "./lib/quote-doc";
import { searchIrQuoteCustomers, type IrqCrmCustomer } from "@/app/(member)/member/ir-quote-actions";

/** The Drive, as the quote's `<dc-import name="Workspace">` mounts it. */
function Workspace(p: DcVals) {
  const { hostStyle, ...props } = p;
  return <DcHost logic={WorkspaceLogic} render={renderWorkspace} props={props} hostStyle={hostStyle as CSSProperties | undefined} />;
}
const COMPONENTS: DcComponents = { Workspace };

/** A CRM customer as the prototype's step 1 reads one (its own names beside the CRM form's). */
function asCustomer(c: IrqCrmCustomer) {
  const v = c.values;
  return { ...v, id: c.id, name: v.name ?? "", phone: v.phone ?? "", ptype: v.type ?? "", usize: v.size ?? "", uloc: v.loc ?? "" };
}

/**
 * Each screen draws in a shadow root, as the prototype drew on a page of its own: none of the app's CSS (Tailwind's
 * preflight, the Revenue app's globals) reaches it, only its prototype's own page CSS (`css`) and the browser's
 * defaults. The two faces' variables are set on the host and inherit through.
 */
/** The face's own name alone — next/font adds a made-up "… Fallback" face after it, which the prototype never had. */
const faceOnly = (family: string | undefined) => (family ? family.split(",")[0].trim() : undefined);
const FACES = { "--font-manrope": faceOnly(manrope.style?.fontFamily), "--font-space-grotesk": faceOnly(spaceGrotesk.style?.fontFamily) } as CSSProperties;

function Frame({ children, css }: { children: ReactNode; css: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    const style = document.createElement("style");
    style.textContent = css;
    const inner = document.createElement("div");
    inner.className = "irq-root";
    shadow.append(style, inner);
    setRoot(inner);
  }, [css]);
  return (
    <div ref={host} data-irq="" className={`${manrope.variable} ${spaceGrotesk.variable}`} style={{ height: "100%", ...FACES }}>
      {root ? createPortal(children, root) : null}
    </div>
  );
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div role="alert" onClick={onClose}
      style={{ position: "fixed", zIndex: 400, left: "50%", bottom: 24, transform: "translateX(-50%)", padding: "10px 16px", borderRadius: 10,
        background: "var(--irq-c-1f1f1c)", color: "var(--irq-c-ffffff)", fontFamily: "var(--font-manrope), sans-serif", fontSize: 13.5, fontWeight: 600,
        boxShadow: "0 6px 20px rgba(20,20,18,.18)", animation: "rvFade .2s ease" }}>
      {text}
    </div>
  );
}

function Waiting({ error, rootH }: { error?: string; rootH: string }) {
  return (
    <div style={{ height: rootH, display: "grid", placeItems: "center", background: "var(--irq-c-f7f7f5)", color: "var(--irq-c-6b6b66)",
      fontFamily: "var(--font-manrope), sans-serif", fontSize: 14 }} role="status">
      {error ?? "Loading…"}
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState("");
  const show = useCallback((m: string) => setToast(m), []);
  return { toast, show, clear: () => setToast("") };
}

export type IrQuoteNav = "Today" | "Insight" | "Arena" | "Profile";

/** The quote: home (phone), the five steps, the quotation, the Drive. */
export function IrQuoteScreen(p: {
  inApp: boolean; rootH: string; readOnly: boolean; preview?: boolean;
  onNav: (to: IrQuoteNav) => void; onSettings?: () => void; onClosePreview?: () => void;
  /** The design preview and the demo: the handoff's price list, nothing read or sent. */
  offline?: { name: string };
  /** The Principal viewing a member: that member's name, drafts and Drive, read only. */
  view?: { staffId: string; subDepartmentId: string };
}) {
  const { toast, show, clear } = useToast();
  const boot = useIrqBoot(p.readOnly, show, p.offline, p.view);
  const props = useMemo(() => {
    if (boot.status !== "ready") return null;
    return {
      user: boot.boot.user, crmFields: boot.boot.crmFields, canSettings: boot.boot.edit && !!p.onSettings, readOnly: p.readOnly,
      inApp: p.inApp, rootH: p.rootH, preview: !!p.preview && boot.boot.edit,
      onNav: p.onNav, onSettings: p.onSettings, onClosePreview: p.onClosePreview,
      searchCrm: p.offline
        ? async (q: string) => CRM_CUSTOMERS.filter(c => (c.name + " " + c.phone).toLowerCase().includes(q.toLowerCase())).map(c => ({ ...c, type: c.ptype, size: c.usize, loc: c.uloc }))
        : async (q: string) => { const r = await searchIrQuoteCustomers(q); return r.ok ? r.data.map(asCustomer) : []; },
      showItemPrices: false, markup: 1.3, viewport: "auto",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.status]);
  return (
    <Frame css={IRQ_CSS_QUOTE}>
      {props ? <DcHost logic={QuoteLogic} render={renderQuote} props={props} components={COMPONENTS} hostStyle={{ height: "100%" }} />
        : <Waiting rootH={p.rootH} error={boot.status === "error" ? boot.error : undefined} />}
      {toast && <Toast text={toast} onClose={clear} />}
    </Frame>
  );
}

/** Quotation settings — the computer's six tabs, or the phone's three. */
export function IrQuoteSettingsScreen(p: {
  phone: boolean; inApp: boolean; rootH: string; readOnly: boolean;
  onNav: (to: IrQuoteNav | "Quote") => void; onBack?: () => void; onPreview: () => boolean | void;
  offline?: { name: string };
}) {
  const { toast, show, clear } = useToast();
  const boot = useIrqBoot(p.readOnly, show, p.offline);
  const props = useMemo(() => {
    if (boot.status !== "ready") return null;
    return { user: boot.boot.user, crmFields: boot.boot.crmFields, readOnly: p.readOnly || !boot.boot.edit, inApp: p.inApp, rootH: p.rootH,
      onNav: p.onNav, onBack: p.onBack, onPreview: p.onPreview };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.status]);
  return (
    <Frame css={p.phone ? IRQ_CSS_SETTINGS_MOBILE : IRQ_CSS_SETTINGS}>
      {props
        ? p.phone
          ? <DcHost logic={SettingsMobileLogic} render={renderSettingsMobile} props={props} hostStyle={{ height: "100%" }} />
          : <DcHost logic={SettingsLogic} render={renderSettings} props={props} hostStyle={{ height: "100%" }} />
        : <Waiting rootH={p.rootH} error={boot.status === "error" ? boot.error : undefined} />}
      {toast && <Toast text={toast} onClose={clear} />}
    </Frame>
  );
}
