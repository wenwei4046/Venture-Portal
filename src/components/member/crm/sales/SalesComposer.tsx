"use client";

// GENERATED from docs/design/chat-composer/prototypes/Chat Composer.dc.html (the chat composer handoff, 2026-10-14) by
// tools/crm-design/gen-composer.cjs — markup and styles exactly as designed. Behaviour lives in ./ChatComposer.tsx and
// ./vm/composer.ts. To change the look, change the design (or the generator's patches) and regenerate; never edit this file.
import { Fragment } from "react";
import H from "../crm.module.css";
import CP from "./composer-press.module.css";
import type { ComposerVM } from "./vm/composer";

/** The chat's composer: the One pill typing bar (or the recording row / a cold chat's template button), the Sticker
 *  panel (Emoji), the Attach panel and the strip under them; the composer's toast. */
export default function SalesComposer({ p }: { p: ComposerVM }) {
  return (<>
    <div data-composer="" style={{ position: "absolute", left: "0", right: "0", bottom: "calc(0px - var(--safe-bottom, 0px))", zIndex: "3", display: "flex", flexDirection: "column" }}>
      {!!(p.replyText) && (<>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", margin: "8px 12px 0", padding: "8px 8px 8px 12px", borderRadius: "12px", background: "var(--crm-field)" }}>
          <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
            <strong style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)" }}>{p.replyWho}</strong>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.replyText}</span>
          </div>
          <span onClick={p.cancelReply} title="Cancel reply" style={{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M6 18 18 6"></path></svg>
          </span>
        </div>
      </>)}
      {!!(p.slashOpen) && (<>
        <div style={{ flex: "none", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none", margin: "8px 12px 0", borderRadius: "16px", border: "1px solid var(--crm-rule)", background: "#fff", boxShadow: "0 6px 18px rgba(42,22,12,.10)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 4px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Quick replies</span>
            {!!(p.qrEdit) && (<span onClick={p.qrEdit} style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Edit</span>)}
          </div>
          {(p.slashList).map((q, q_i) => (<Fragment key={q_i}>
            <div onClick={q.pick} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "10px 14px", borderTop: q.rule, cursor: "pointer" }} className={H.hov3}>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>/{q.title}</span>
              <span style={{ fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.text}</span>
            </div>
          </Fragment>))}
          {!!(p.slashEmpty) && (<>
            <p style={{ margin: "0", padding: "10px 14px 14px", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>No quick reply matches “{p.slashQ}”.</p>
          </>)}
        </div>
      </>)}
      {!!(p.chatCold) && (<>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px 10px" }}>
          <span onClick={p.openTpl} style={{ flex: "1", height: "48px", borderRadius: "24px", background: "var(--crm-muted)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4V5Zm4 4h8M8 12h5"></path></svg>Send template message</span>
        </div>
      </>)}
      {!!(p.isA) && (<>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", padding: "8px 12px 10px" }}>
          {!!(p.recOn) && (<>
            <span ref={p.trashRef} onClick={p.recCancel} title="Cancel" style={{ flex: "none", width: "46px", height: "46px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid rgb(235 221 210)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-oxblood)", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", height: "46px", boxSizing: "border-box", borderRadius: "23px", background: "var(--crm-cream)", display: "flex", alignItems: "center", gap: "10px", padding: "0 16px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: "var(--crm-oxblood)", animation: "fadeIn 700ms ease-in-out infinite alternate" }}></span>{p.recTime}
              <span style={{ flex: "1", minWidth: "0", textAlign: "right", transform: p.recSlide, color: p.recHintC, fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden" }}>‹ Slide to cancel</span>
            </span>
          </>)}
          {!(p.recOn) && (<span style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "flex-end", minHeight: "46px", boxSizing: "border-box", padding: "0 4px", borderRadius: "23px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.14)" }}>
            <span onClick={p.toggleSticker} onMouseDown={p.keep} title="Sticker" style={{ flex: "none", width: "38px", height: "46px", display: "grid", placeItems: "center", cursor: "pointer", color: p.stkFg }}>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <path d={p.stkIcon}>
                </path>
              </svg>
            </span>
            <textarea ref={p.taRef} data-draft="1" value={p.draft} onChange={p.onDraft} onFocus={p.focus} onBlur={p.blur} onClick={p.focus} placeholder={p.placeholder} rows={1} style={{ flex: "1", minWidth: "0", height: p.taH, maxHeight: "154px", boxSizing: "border-box", margin: "0", padding: "12px 2px", border: "0", outline: "none", resize: "none", background: "transparent", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", lineHeight: "22px", color: "var(--crm-ink)", scrollbarWidth: "none" }}>
            </textarea>
            {(<>
              <span onClick={p.toggleAttach} onMouseDown={p.keep} title="Attach" style={{ flex: "none", width: "40px", height: "46px", display: "grid", placeItems: "center", cursor: "pointer", color: p.attFg }}>
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(-45deg)" }}>
                  <path d="M16.5 7.5v8.25a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0V8">
                  </path>
                </svg>
              </span>
              <span onClick={p.camera} onMouseDown={p.keep} title="Camera" style={{ flex: "none", width: "40px", height: "46px", display: "grid", placeItems: "center", cursor: "pointer", color: "rgb(128 107 96)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9a2 2 0 0 1 2-2h2l1.5-2.2A1.5 1.5 0 0 1 9.75 4h4.5a1.5 1.5 0 0 1 1.25.8L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z">
                  </path>
                  <circle cx="12" cy="13" r="3.5">
                  </circle>
                </svg>
              </span>
            </>)}
          </span>)}
          <span onClick={p.mainAct} onMouseDown={p.keep} onPointerDown={p.mainDown} onContextMenu={p.noMenu} title={p.mainTitle} style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", cursor: "pointer", boxShadow: "0 3px 9px rgba(189,74,25,.18)", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d={p.mainIcon}>
              </path>
            </svg>
          </span>
        </div>
      </>)}
      {!!(p.sticker) && (<>
        <div data-panel="" style={{ height: p.panelH, boxSizing: "border-box", background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -6px 20px rgba(42,22,12,.08),0 -1px 0 var(--crm-rule-soft)", display: "flex", flexDirection: "column", animation: "cmpUp 240ms cubic-bezier(.2,.8,.2,1)" }}>
          <div style={{ flex: "none", display: "grid", placeItems: "center", paddingTop: "8px" }}>
            <span style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
          </div>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px" }}>
            <span onClick={p.toggleSearch} title="Search" style={{ flex: "none", width: "36px", height: "36px", borderRadius: "18px", display: "grid", placeItems: "center", cursor: "pointer", background: p.searchBg, color: p.searchFg, transition: "background 200ms cubic-bezier(.2,.8,.2,1)" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4">
                </path>
              </svg>
            </span>
            <div style={{ flex: "1 1 0", minWidth: "0", height: "36px", display: "flex" }}>
              {!!(p.searching) && (<>
                <input value={p.q} onChange={p.onQ} placeholder={p.searchPh} style={{ flex: "1", width: "100%", minWidth: "0", height: "36px", boxSizing: "border-box", padding: "0 14px", borderRadius: "18px", border: "1px solid var(--crm-rust)", boxShadow: "0 0 0 3px rgba(189,74,25,.14)", outline: "none", background: "#fff", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)" }} />
              </>)}
              {!!(p.notSearching) && (<>
                <div style={{ flex: "1", width: "100%", minWidth: "0", display: "flex", gap: "2px", height: "36px", boxSizing: "border-box", padding: "3px", borderRadius: "18px", background: "var(--crm-rule-soft)" }}>
                  {(p.tabs).map((t, t_i) => (<Fragment key={t_i}>
                    <span onClick={t.pick} style={{ flex: "1", minWidth: "0", height: "30px", borderRadius: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 4px", cursor: "pointer", whiteSpace: "nowrap", background: t.bg, boxShadow: t.sh, color: t.fg, fontSize: "calc(12.5px * var(--rv-type, 1))", fontWeight: "650", transition: "background 200ms cubic-bezier(.2,.8,.2,1)" }}>
                      <svg width="15" height="15" style={{ flex: "none" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={t.icon}>
                        </path>
                      </svg>
                      <span>{t.label}</span>
                    </span>
                  </Fragment>))}
                </div>
              </>)}
            </div>
            <span onClick={p.delKey} title="Delete" style={{ flex: "none", width: "44px", height: "36px", boxSizing: "border-box", borderRadius: "12px", display: "grid", placeItems: "center", cursor: "pointer", background: "#fff", border: "1px solid var(--crm-rule)", boxShadow: "0 1px 2px rgba(42,22,12,.10)", color: "var(--crm-ink)", transition: "transform 120ms cubic-bezier(.2,.8,.2,1)" }} className={CP.a1}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 5.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-10L3.5 12l5-6.5Z">
                </path>
                <path d="m11.5 9.5 5 5m0-5-5 5">
                </path>
              </svg>
            </span>
          </div>
          <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "0 10px 8px" }}>
            {!!(p.isEmoji) && (<>
              <div style={{ padding: "2px 4px 4px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)" }}>{p.emoLabel}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8,minmax(0,1fr))", gap: "2px" }}>
                {(p.emojis).map((e, e_i) => (<Fragment key={e_i}>
                  <span onClick={e.pick} style={{ height: "40px", display: "grid", placeItems: "center", fontSize: "calc(27px * var(--rv-type, 1))", borderRadius: "12px", cursor: "pointer" }} className={CP.a2}>{e.e}</span>
                </Fragment>))}
              </div>
            </>)}
          </div>
          <div style={{ flex: "none", height: "46px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "6px", padding: "0 10px", borderTop: "1px solid var(--crm-rule-soft)" }}>
            {!!(p.barIcons) && (<>
              <div style={{ flex: "1", minWidth: "0", display: "flex", justifyContent: "space-around" }}>
                {(p.bar).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} title={c.label} style={{ position: "relative", width: "44px", height: "42px", display: "grid", placeItems: "center", cursor: "pointer", color: c.fg, transition: "color 200ms cubic-bezier(.2,.8,.2,1)" }}>
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={c.sw} strokeLinecap="round" strokeLinejoin="round">
                      <path d={c.icon}>
                      </path>
                    </svg>
                    <span style={{ position: "absolute", bottom: "2px", left: "50%", width: "16px", height: "3px", marginLeft: "-8px", borderRadius: "2px", background: c.line }}>
                    </span>
                  </span>
                </Fragment>))}
              </div>
            </>)}
          </div>
        </div>
      </>)}
      {!!(p.attach) && (<>
        <div data-attach="" style={{ position: "absolute", left: "10px", right: "10px", bottom: "calc(100% + 8px)", boxSizing: "border-box", padding: "18px 12px 14px", background: "var(--crm-page)", borderRadius: "20px", boxShadow: "0 10px 30px rgba(42,22,12,.18),0 0 0 1px var(--crm-rule)", animation: "fadeIn 160ms ease-out" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "18px 8px" }}>
            {(p.tiles).map((t, t_i) => (<Fragment key={t_i}>
              <span onClick={t.go} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "7px", padding: "4px 0", color: "var(--crm-ink)", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><span style={{ width: "54px", height: "54px", borderRadius: "27px", background: t.color, color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={t.icon}>
                    </path>
                  </svg>
                </span>{t.label}</span>
            </Fragment>))}
          </div>
        </div>
      </>)}
      <div style={{ height: "var(--safe-bottom, 0px)", background: p.homeBg }}></div>
    </div>
    {!!(p.toast) && (<>
      <div data-composer-toast="" style={{ position: "absolute", left: "16px", right: "16px", bottom: "74px", zIndex: "6", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{p.toast}</div>
    </>)}
  </>);
}
