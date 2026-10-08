"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/contacts.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import type { ContactsVM } from "./vm/contacts";

/** Contacts: A–Z, swipe to edit or delete, customer details and info sheets. */
export default function SalesContacts({ v }: { v: ContactsVM }) {
  return (<>
            
    <div style={{ position: "relative", flex: "1 1 auto", minHeight: "0", display: "flex", flexDirection: "column" }}>
      <main data-contacts-list="1" style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 28px 24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Contacts</h1>
        </div>
        <label style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "14px", background: "#F5EEE9", color: "#806B60" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35">
            </path>
          </svg>
          <input value={v.cq} onChange={v.setCq} placeholder="Search name or phone" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22" }} />
        </label>
        {!!(v.cfOpen) && (<>
          <div onClick={v.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "#806B60" }}>{v.cfStep}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
                <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "700" }}>Customer</strong>
                </span>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>NAME <b style={{ color: "#A3371A" }}>*</b></span>
                <input value={v.cfName} onChange={v.cfSetName} placeholder="e.g. Mr. Lim" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PHONE</span>
                <input value={v.cfPhone} onChange={v.cfSetPhone} placeholder="e.g. 012-345 6789" inputMode="tel" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
              </label>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
                <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "700" }}>Property</strong>
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PROPERTY TYPE</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {(v.cfType).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                  </Fragment>))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT SIZE</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                  {(v.cfSize).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                  </Fragment>))}
                </div>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT LOCATION</span>
                <input value={v.cfLoc} onChange={v.cfSetLoc} placeholder="e.g. Mont Kiara / Cheras" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>REQUIREMENT</span>
                <textarea value={v.cfReq} onChange={v.cfSetReq} placeholder={v.cfReqPh} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none", resize: "none" }}>
                </textarea>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>BUDGET</span>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3" }}>
                  <span style={{ fontSize: "15px", fontWeight: "600", color: "#806B60" }}>RM</span>
                  <input value={v.cfBudget} onChange={v.cfSetBudget} inputMode="numeric" placeholder="" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
                </span>
              </label>
              <span onClick={v.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cfSaveBg, color: "#fff", fontSize: "17px", fontWeight: "700", cursor: "pointer" }}>{v.cfSaveLabel}</span>
            </div>
          </div>
        </>)}
        {!!(v.ctOpen) && (<>
          <div onClick={v.ctClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
            <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: "650" }}>{v.ctIni}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                  <strong style={{ fontSize: "19px", fontWeight: "700" }}>{v.ctName}</strong>
                </div>
                <span onClick={v.ctEdit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>Edit</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" }}>
                {(v.ctRows).map((r, r_i) => (<Fragment key={r_i}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "14px" }}>
                    <span style={{ flex: "none", color: "#806B60" }}>{r.k}</span>
                    <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}>{r.v}</strong>
                  </div>
                </Fragment>))}
              </div>
              <span onClick={v.ctChat} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Open chat</span>
            </div>
          </div>
        </>)}
        <section style={{ display: "flex", flexDirection: "column" }}>
          {!!(v.contactsEmpty) && (<>
            <p style={{ margin: "0", padding: "24px 0", textAlign: "center", fontSize: "14px", color: "#806B60" }}>No contact matches.</p>
          </>)}
          {(v.contacts).map((p, p_i) => (<Fragment key={p_i}>
            {!!(p.head) && (<>
              <div data-letter={p.head} style={{ padding: "14px 0 4px", fontSize: "13px", fontWeight: "700", color: "#BD4A19" }}>{p.head}</div>
            </>)}
            <div style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: "0", bottom: "0", right: "0", display: "flex", opacity: p.actOp, transition: "opacity 120ms" }}>
                <span onClick={p.edit} style={{ width: "72px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "#806B60", color: "#fff", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>Edit</span>
                <span onClick={p.del} style={{ width: "72px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "#A3371A", color: "#fff", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                    </path>
                  </svg>Delete</span>
              </div>
              <div onPointerDown={p.sDown} onPointerMove={p.sMove} onPointerUp={p.sUp} onPointerCancel={p.sUp} style={{ position: "relative", display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", background: "#fff", transform: `translateX(${p.sx}px)`, transition: p.sTrans, touchAction: "pan-y" }}>
                <div onClick={p.open} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", userSelect: "none" }}>
                  <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#FCE6D6", color: "#3F2B22", fontSize: "14px", fontWeight: "700" }}>{p.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                    {!!(p.view) && (<>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: "0" }}>
                        <strong style={{ minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "15px", fontWeight: "650", color: "#3F2B22" }}>{p.name}</strong>
                      </span>
                    </>)}
                    {!!(p.editing) && (<>
                      <span onClick={p.stop} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input value={p.draft} onChange={p.type} onKeyDown={p.key} autoFocus={true} aria-label="Contact name" placeholder="Name" style={{ flex: "1", minWidth: "0", height: "34px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid #BD4A19", borderRadius: "10px", outline: "none", font: "inherit", fontSize: "15px", fontWeight: "600", color: "#3F2B22" }} />
                        <span onClick={p.save} style={{ flex: "none", height: "34px", padding: "0 12px", borderRadius: "17px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}>Save</span>
                        <span onClick={p.cancel} title="Cancel" style={{ flex: "none", width: "30px", height: "34px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="m6 6 12 12M6 18 18 6">
                            </path>
                          </svg>
                        </span>
                      </span>
                    </>)}
                    {!!(p.view) && (<>
                      <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{p.status} · {p.phone}</small>
                    </>)}
                    {!!(p.editing) && (<>
                      <input onClick={p.stop} value={p.draftPh} onChange={p.typePh} onKeyDown={p.key} inputMode="tel" placeholder="Phone" aria-label="Phone" style={{ width: "100%", height: "34px", marginTop: "4px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid #EBDDD2", borderRadius: "10px", outline: "none", font: "inherit", fontSize: "14px", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }} />
                    </>)}
                  </span>
                </div>
                <a href={p.tel} title={`Call ${p.name}`} style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#387557", textDecoration: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z">
                    </path>
                  </svg>
                </a>
              </div>
            </div>
          </Fragment>))}
        </section>
      </main>
      <div style={{ position: "absolute", top: "120px", bottom: "12px", right: "2px", width: "22px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        {(v.azIndex).map((z, z_i) => (<Fragment key={z_i}>
          <span onClick={z.go} style={{ flex: "0 1 18px", minHeight: "0", width: "22px", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "650", lineHeight: "1", color: z.color, cursor: "pointer" }}>{z.l}</span>
        </Fragment>))}
      </div>
    </div>
  </>);
}
