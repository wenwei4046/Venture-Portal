"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/contacts.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import { InfoValue } from "../shared/AdLink";
import type { ContactsVM } from "./vm/contacts";

/** Contacts: A–Z, swipe to edit or delete, customer details and info sheets. */
export default function SalesContacts({ v }: { v: ContactsVM }) {
  return (<>
            
    <div style={{ position: "relative", flex: "1 1 auto", minHeight: "0", display: "flex", flexDirection: "column" }}>
      <main data-contacts-list="1" style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 28px 24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <h1 style={{ margin: "0", display: "flex", alignItems: "baseline", gap: "10px", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(32.61px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Contacts<span style={{ fontFamily: "Inter, sans-serif", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "400", letterSpacing: "0", color: "var(--crm-faint)" }}>{v.cCount}</span></h1>
        </div>
        <label style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 14px", boxSizing: "border-box", borderRadius: "20px", background: "var(--crm-field)", color: "var(--crm-faint)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35">
            </path>
          </svg>
          <input value={v.cq} onChange={v.setCq} placeholder="Search name or phone" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", background: "transparent", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)" }} />
        </label>
        {!!(v.cfOpen) && (<>
          <div onClick={v.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{v.cfStep}</span>
              </div>{!(v.cfPaged) && (<>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
                <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Customer</strong>
                </span>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>NAME <b style={{ color: "var(--crm-oxblood)" }}>*</b></span>
                <input value={v.cfName} onChange={v.cfSetName} placeholder="e.g. Mr. Lim" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>PHONE</span>
                <input value={v.cfPhone} onChange={v.cfSetPhone} placeholder="e.g. 012-345 6789" inputMode="tel" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
              </label>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
                <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Property</strong>
                </span>
              </div>
              {!!(v.cfHas.type) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>PROPERTY TYPE</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {(v.cfType).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                  </Fragment>))}
                </div>
              </div></>)}
              {!!(v.cfHas.size) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>UNIT SIZE</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                  {(v.cfSize).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                  </Fragment>))}
                </div>
              </div></>)}
              {!!(v.cfHas.loc) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>UNIT LOCATION</span>
                <input value={v.cfLoc} onChange={v.cfSetLoc} placeholder="e.g. Mont Kiara / Cheras" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
              </label></>)}
              {!!(v.cfHas.req) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>REQUIREMENT</span>
                <textarea value={v.cfReq} onChange={v.cfSetReq} placeholder={v.cfReqPh} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", resize: "none" }}>
                </textarea>
              </label></>)}
              {!!(v.cfHas.budget) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>BUDGET</span>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
                  <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>RM</span>
                  <input value={v.cfBudget} onChange={v.cfSetBudget} inputMode="numeric" placeholder="" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
                </span>
              </label></>)}
              </>)}{(v.cfExtra).map((fs, fs_i) => (<Fragment key={fs_i}>{!!(fs.title) && (<><div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}><span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}></span><span style={{ display: "flex", flexDirection: "column", gap: "1px" }}><strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>{fs.title}</strong></span></div></>)}{(fs.fields).map((fq, fq_i) => (<Fragment key={fq_i}><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)", textTransform: "uppercase" }}>{fq.label}{!!(fq.req) && (<> <b style={{ color: "var(--crm-oxblood)" }}>*</b></>)}</span>{!!(fq.isInput) && (<input value={fq.value} onChange={fq.set} placeholder={fq.ph} type={fq.inputType} inputMode={fq.mode} style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />)}{!!(fq.isLong) && (<textarea value={fq.value} onChange={fq.set} placeholder={fq.ph} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", resize: "none" }}></textarea>)}{!!(fq.isChoice) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{(fq.chips).map((fc, fc_i) => (<Fragment key={fc_i}><span onClick={fc.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${fc.bd}`, background: fc.bg, color: fc.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{fc.label}</span></Fragment>))}</div>)}</div></Fragment>))}</Fragment>))}
{!!(v.cfBack) && (<span onClick={v.cfBack} style={{ flex: "none", alignSelf: "center", padding: "6px 18px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)", cursor: "pointer" }}>‹ Back</span>)}<span onClick={v.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cfSaveBg, color: "#fff", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", cursor: "pointer" }}>{v.cfSaveLabel}</span>
            </div>
          </div>
        </>)}
        {!!(v.ctOpen) && (<>
          <div onClick={v.ctClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
            <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ctIni}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                  <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700" }}>{v.ctName}</strong>
                </div>
                <span onClick={v.ctEdit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid var(--crm-rule)", display: "flex", alignItems: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>Edit</span>
              </div>
              <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid var(--crm-rule)" }}>
                {(v.ctRows).map((r, r_i) => (<Fragment key={r_i}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "calc(14px * var(--rv-type, 1))" }}>
                    <span style={{ flex: "none", color: "var(--crm-muted)" }}>{r.k}</span>
                    <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}><InfoValue v={r.v} href={r.href} /></strong>
                  </div>
                </Fragment>))}
              </div>
              <span onClick={v.ctChat} style={{ flex: "none", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Open chat</span>
            </div>
          </div>
        </>)}
        <section style={{ display: "flex", flexDirection: "column" }}>
          {!!(v.contactsEmpty) && (<>
            <p style={{ margin: "0", padding: "24px 0", textAlign: "center", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>No contact matches.</p>
          </>)}
          {(v.contacts).map((p, p_i) => (<Fragment key={p_i}>
            {!!(p.head) && (<>
              <div data-letter={p.head} style={{ padding: "14px 0 4px", fontSize: "calc(15.22px * var(--rv-type, 1))", fontWeight: "500", color: "var(--crm-rust)" }}>{p.head}</div>
            </>)}
            <div style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: "0", bottom: "0", right: "0", display: "flex", opacity: p.actOp, transition: "opacity 120ms" }}>
                <span onClick={p.edit} style={{ width: "72px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-muted)", color: "#fff", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>Edit</span>
                <span onClick={p.del} style={{ width: "72px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-oxblood)", color: "#fff", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                    </path>
                  </svg>Delete</span>
              </div>
              <div onPointerDown={p.sDown} onPointerMove={p.sMove} onPointerUp={p.sUp} onPointerCancel={p.sUp} style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--crm-rule-soft)", background: "#fff", transform: `translateX(${p.sx}px)`, transition: p.sTrans, touchAction: "pan-y" }}>
                <div onClick={p.open} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", userSelect: "none" }}>
                  <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "50%", display: "grid", placeItems: "center", background: p.avBg, color: p.avFg, fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "500" }}>{p.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {!!(p.view) && (<>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: "0" }}>
                        <strong style={{ minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "calc(17.39px * var(--rv-type, 1))", fontWeight: "500", color: "var(--crm-ink)" }}>{p.name}</strong>
                      </span>
                    </>)}
                    {!!(p.editing) && (<>
                      <span onClick={p.stop} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input value={p.draft} onChange={p.type} onKeyDown={p.key} autoFocus={true} aria-label="Contact name" placeholder="Name" style={{ flex: "1", minWidth: "0", height: "34px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid var(--crm-rust)", borderRadius: "10px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }} />
                        <span onClick={p.save} style={{ flex: "none", height: "34px", padding: "0 12px", borderRadius: "17px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Save</span>
                        <span onClick={p.cancel} title="Cancel" style={{ flex: "none", width: "30px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="m6 6 12 12M6 18 18 6">
                            </path>
                          </svg>
                        </span>
                      </span>
                    </>)}
                    {!!(p.view) && (<>
                      <small style={{ fontSize: "calc(15.22px * var(--rv-type, 1))", color: "var(--crm-faint)", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{p.phone}</small>
                    </>)}
                    {!!(p.editing) && (<>
                      <input onClick={p.stop} value={p.draftPh} onChange={p.typePh} onKeyDown={p.key} inputMode="tel" placeholder="Phone" aria-label="Phone" style={{ width: "100%", height: "34px", marginTop: "4px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid var(--crm-rule)", borderRadius: "10px", outline: "none", font: "inherit", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }} />
                    </>)}
                  </span>
                </div>
                <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", borderRadius: "14px", background: p.stBg, color: p.stFg, fontSize: "calc(14.13px * var(--rv-type, 1))", fontWeight: "500", whiteSpace: "nowrap" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.stDot }} />{p.st}</span><a href={p.tel} title={`Call ${p.name}`} style={{ flex: "none", width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-faint)", opacity: p.hasTel ? 1 : 0.5, pointerEvents: p.hasTel ? "auto" : "none", textDecoration: "none" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z">
                    </path>{!p.hasTel && (<path d="M3 3l18 18" />)}
                  </svg>
                </a>
              </div>
            </div>
          </Fragment>))}
        </section>
      </main>
      <div style={{ position: "absolute", top: "120px", bottom: "12px", right: "2px", width: "22px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        {(v.azIndex).map((z, z_i) => (<Fragment key={z_i}>
          <span onClick={z.go} style={{ flex: "0 1 18px", minHeight: "0", width: "22px", display: "grid", placeItems: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "650", lineHeight: "1", color: z.color, cursor: "pointer" }}>{z.l}</span>
        </Fragment>))}
      </div>
    </div>
  </>);
}
