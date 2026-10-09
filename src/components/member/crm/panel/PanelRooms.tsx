"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/rooms.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { RoomsVM } from "./vm/rooms";

/** Profile › Showrooms: address, slots by weekday, booking limit, closures — editing, the time picker, delete. */
export default function PanelRooms({ v }: { v: RoomsVM }) {
  return (<>
            
    {!!(v.rmDelOpen) && (<>
      <div onClick={v.rmDelNo} style={{ position: "absolute", inset: "0", zIndex: "12", background: "rgba(63,43,34,.40)", display: "grid", placeItems: "center", padding: "28px", boxSizing: "border-box", animation: "fadeIn 160ms ease-out" }}>
        <div onClick={v.stop} style={{ width: "100%", maxWidth: "300px", padding: "22px 20px 16px", boxSizing: "border-box", borderRadius: "22px", background: "#fff", boxShadow: "0 16px 40px rgba(63,43,34,.25)", display: "flex", flexDirection: "column", gap: "8px", textAlign: "center" }}>
          <span style={{ alignSelf: "center", width: "48px", height: "48px", borderRadius: "50%", background: "#FBE4DE", color: "#A3371A", display: "grid", placeItems: "center", marginBottom: "4px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "18px", fontWeight: "700" }}>Delete {v.rmDelName}?</strong>
          <p style={{ margin: "0 0 8px", fontSize: "14px", lineHeight: "1.45", color: "#806B60", textWrap: "pretty" }}>It will no longer appear in Book visit. This can't be undone.</p>
          <span onClick={v.rmDelYes} style={{ height: "46px", borderRadius: "23px", background: "#A3371A", color: "#fff", display: "grid", placeItems: "center", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Delete</span>
          <span onClick={v.rmDelNo} style={{ height: "44px", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "600", color: "#3F2B22", cursor: "pointer" }}>Cancel</span>
        </div>
      </div>
    </>)}
    {!!(v.rmOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#FBF7F3", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.closeRooms} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "#BD4A19", fontSize: "17px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>Profile</span>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 style={{ margin: "0", fontSize: "30px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Showrooms</h1>
        </div>
        {(v.rmList).map((r, r_i) => (<Fragment key={r_i}>
          <section style={{ flex: "none", borderRadius: "18px", border: "1px solid #EBDDD2", background: "#fff", overflow: "hidden", boxShadow: "0 2px 8px rgba(63,43,34,.04)" }}>
            {!!(r.view) && (<>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 12px 12px 16px", borderBottom: "1px solid #F0E6DE" }}>
                <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "10px", background: "#FFF3D6", color: "#A46312", display: "grid", placeItems: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6">
                    </path>
                  </svg>
                </span>
                <strong style={{ flex: "1", minWidth: "0", fontSize: "17px", fontWeight: "700" }}>{r.name}</strong>
                <span onClick={r.edit} title="Edit" style={{ flex: "none", height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>Edit</span>
                <span onClick={r.del} title="Delete" style={{ flex: "none", width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#A3371A", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ padding: "4px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "14px 0", borderBottom: "1px solid #F5EEE9" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z">
                      </path>
                    </svg>Address</span>
                  <span style={{ fontSize: "14px", lineHeight: "1.45", color: r.addrFg }}>{r.addrShow}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 0", borderBottom: "1px solid #F5EEE9" }}>
                  <span style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", alignItems: "center", gap: "10px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2">
                        </path>
                      </svg>Slots</span>
                    <span style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px", textAlign: "center", fontSize: "10px", fontWeight: "700", color: "#A8968B" }}>
                      <span>M</span>
                      <span>T</span>
                      <span>W</span>
                      <span>T</span>
                      <span>F</span>
                      <span>S</span>
                      <span>S</span>
                    </span>
                  </span>
                  {(r.slotChips).map((c, c_i) => (<Fragment key={c_i}>
                    <span style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "14px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.t}</strong>
                      <span style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                        {(c.days).map((d, d_i) => (<Fragment key={d_i}>
                          <span style={{ height: "24px", boxSizing: "border-box", borderRadius: "7px", background: d.cBg, border: `1px solid ${d.cBd}`, color: d.cFg, display: "grid", placeItems: "center" }}>
                            {!!(d.open) && (<>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5 9-10">
                                </path>
                              </svg>
                            </>)}
                            {!!(d.closed) && (<>
                              <span style={{ width: "6px", height: "2px", borderRadius: "1px", background: "currentColor" }}>
                              </span>
                            </>)}
                          </span>
                        </Fragment>))}
                      </span>
                    </span>
                  </Fragment>))}
                  {!!(r.noSlots) && (<>
                    <span style={{ fontSize: "13px", color: "#B5A398" }}>No time slots yet</span>
                  </>)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "14px 0" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#FBF7F3" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8">
                        </path>
                      </svg>Booking limit</span>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>{r.capShort}</strong>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#FBF7F3" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM5 5l14 14">
                        </path>
                      </svg>Blocked</span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {(r.blockChips).map((c, c_i) => (<Fragment key={c_i}>
                        <span style={{ padding: "2px 8px", borderRadius: "7px", background: "#fff", border: "1px solid #EBDDD2", color: "#4E2F20", fontSize: "12px", fontWeight: "600" }}>{c.t}</span>
                      </Fragment>))}
                      {!!(r.noBlock) && (<>
                        <strong style={{ fontSize: "15px", fontWeight: "700", color: "#B5A398" }}>None</strong>
                      </>)}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #F0E6DE" }}>
                <a href={r.waze} target="_blank" rel="noopener" style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "14px", fontWeight: "650", color: "#3F2B22", textDecoration: "none", opacity: r.navOp }}><span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "#33CCFF", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "800" }}>W</span>Waze</a>
                <a href={r.gmaps} target="_blank" rel="noopener" style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderLeft: "1px solid #F0E6DE", fontSize: "14px", fontWeight: "650", color: "#3F2B22", textDecoration: "none", opacity: r.navOp }}><span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "#34A853", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "800" }}>G</span>Google Maps</a>
              </div>
            </>)}
            {!!(r.editing) && (<>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "#fff" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Showroom name</span>
                  <input value={r.dName} onChange={r.setName} placeholder="e.g. Puchong showroom" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", color: "#3F2B22", background: "#FBF7F3", fontWeight: "650" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Full address</span>
                  <textarea rows={3} value={r.dAddr} onChange={r.setAddr} placeholder="Street, postcode, city, state" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", lineHeight: "1.45", color: "#3F2B22", resize: "none", background: "#FBF7F3" }}>
                  </textarea>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px", borderTop: "1px solid #EBDDD2" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>Time slots</strong>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "76px repeat(7, minmax(0, 1fr)) 24px", alignItems: "center", gap: "4px" }}>
                      <span>
                      </span>
                      {(r.dGridHead).map((w, w_i) => (<Fragment key={w_i}>
                        <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", color: "#A8968B" }}>{w}</span>
                      </Fragment>))}
                      <span>
                      </span>
                    </div>
                    {(r.dGrid).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "76px repeat(7, minmax(0, 1fr)) 24px", alignItems: "center", gap: "4px" }}>
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{g.t}</strong>
                          <small style={{ fontSize: "11px", color: "#806B60" }}>{g.cnt}</small>
                        </span>
                        {(g.cells).map((c, c_i) => (<Fragment key={c_i}>
                          <span onClick={c.pick} style={{ height: "34px", borderRadius: "9px", background: c.bg, color: c.fg, display: "grid", placeItems: "center", cursor: "pointer" }}>
                            {!!(c.on) && (<>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5 9-10">
                                </path>
                              </svg>
                            </>)}
                          </span>
                        </Fragment>))}
                        <span onClick={g.rm} title="Delete this time" style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#A8968B", cursor: "pointer" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                            <path d="m6 6 12 12M6 18 18 6">
                            </path>
                          </svg>
                        </span>
                      </div>
                    </Fragment>))}
                    <span style={{ fontSize: "12px", color: "#A8968B" }}>Tap a box to open or close that time on that day.</span>
                  </div>
                  {!!(r.dNoSlots) && (<>
                    <span style={{ fontSize: "13px", color: "#B5A398" }}>No time slots yet</span>
                  </>)}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px", borderRadius: "14px", background: "#FBF7F3" }}>
                    <span style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "600", color: "#806B60" }}>
                      <span>Days</span>
                      <span style={{ color: "#3F2B22" }}>{r.dNewDaysTxt}</span>
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                      {(r.dNewDays).map((d, d_i) => (<Fragment key={d_i}>
                        <span onClick={d.pick} style={{ height: "36px", boxSizing: "border-box", borderRadius: "10px", border: `1px solid ${d.bd}`, background: d.bg, color: d.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}>{d.label}</span>
                      </Fragment>))}
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span onClick={r.openTP} style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <svg style={{ flex: "none", color: "#BD4A19" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                          </path>
                        </svg>
                        <span style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "600", color: r.newTFg }}>{r.newTLbl}</span>
                        <svg style={{ flex: "none", color: "#806B60" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg>
                      </span>
                      <span onClick={r.addSlot} title="Add time slot" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "12px", background: r.addBg, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14">
                          </path>
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "14px", borderTop: "1px solid #EBDDD2" }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>Booking limit</strong>
                  </span>
                  <span style={{ flex: "none", display: "flex", alignItems: "center", height: "40px", border: "1px solid #EBDDD2", borderRadius: "12px", background: "#fff" }}>
                    <span onClick={r.capMinus} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: r.capMinusFg, cursor: "pointer" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M5 12h14">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ minWidth: "28px", textAlign: "center", fontSize: "16px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{r.dCap}</strong>
                    <span onClick={r.capPlus} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: r.capPlusFg, cursor: "pointer" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14">
                        </path>
                      </svg>
                    </span>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px", borderTop: "1px solid #EBDDD2" }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>Blocked time slots</strong>
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}>Every week</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                    {(r.dWeek).map((w, w_i) => (<Fragment key={w_i}>
                      <span onClick={w.pick} style={{ height: "36px", borderRadius: "10px", border: `1px solid ${w.bd}`, background: w.bg, color: w.fg, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", cursor: "pointer" }}>{w.label}</span>
                    </Fragment>))}
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}>Dates</span>
                  {(r.dBlocks).map((b, b_i) => (<Fragment key={b_i}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "40px", padding: "0 4px 0 12px", borderRadius: "12px", background: "#F5EEE9" }}>
                      <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.t}</span>
                      <span onClick={b.rm} title="Remove" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <path d="m6 6 12 12M6 18 18 6">
                          </path>
                        </svg>
                      </span>
                    </div>
                  </Fragment>))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <span onClick={r.openA} style={{ minWidth: "0", height: "52px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBAbd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                      <svg style={{ flex: "none", color: "#BD4A19" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                        <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>From</small>
                        <strong style={{ fontSize: "14px", fontWeight: "650", color: r.dBAfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dBAtxt}</strong>
                      </span>
                    </span>
                    <span onClick={r.openB} style={{ minWidth: "0", height: "52px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBBbd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                      <svg style={{ flex: "none", color: "#BD4A19" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                        <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>To</small>
                        <strong style={{ fontSize: "14px", fontWeight: "650", color: r.dBBfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dBBtxt}</strong>
                      </span>
                    </span>
                  </div>
                  {!!(r.calOpen) && (<>
                    <div style={{ padding: "12px", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", boxShadow: "0 8px 20px rgba(63,43,34,.10)", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span onClick={r.calPrev} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov5}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 6-6 6 6 6">
                            </path>
                          </svg>
                        </span>
                        <strong style={{ flex: "1", textAlign: "center", fontSize: "15px", fontWeight: "700" }}>{r.calTitle}</strong>
                        <span onClick={r.calNext} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov5}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px", textAlign: "center" }}>
                        {(r.calWk).map((w, w_i) => (<Fragment key={w_i}>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#A8968B", padding: "4px 0" }}>{w}</span>
                        </Fragment>))}
                        {(r.calDays).map((d, d_i) => (<Fragment key={d_i}>
                          <span onClick={d.pick} style={{ height: "38px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: d.fw, background: d.bg, color: d.fg, cursor: d.cur }}>{d.n}</span>
                        </Fragment>))}
                      </div>
                    </div>
                  </>)}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input value={r.dBWhy} onChange={r.setBWhy} placeholder="Reason, e.g. Training" style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "12px", outline: "none", font: "inherit", fontSize: "14px", color: "#3F2B22", background: "#fff" }} />
                    <span onClick={r.addBlock} title="Add closed dates" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "12px", background: r.blockBg, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14">
                        </path>
                      </svg>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "4px" }}>
                  <span onClick={r.remove} style={{ fontSize: "14px", fontWeight: "600", color: "#A3371A", cursor: "pointer" }}>Remove</span>
                  <span style={{ display: "flex", gap: "8px" }}>
                    <span onClick={r.cancel} style={{ height: "40px", padding: "0 16px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>Cancel</span>
                    <span onClick={r.save} style={{ height: "40px", padding: "0 18px", borderRadius: "20px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}>Save</span>
                  </span>
                </div>
              </div>
            </>)}
          </section>
        </Fragment>))}
        <span onClick={v.rmAdd} style={{ flex: "none", height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px dashed #D9C7BA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "15px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14">
            </path>
          </svg>Add showroom</span>
      </div>
      {!!(v.tpOpen) && (<>
        <div onClick={v.tpClose} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.tpStop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
            </span>
            <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Add time slot</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.tpH).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.tpM).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.tpA).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
            </div>
            <span onClick={v.tpDone} style={{ height: "48px", borderRadius: "24px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Done · {v.tpLabel}</span>
          </div>
        </div>
      </>)}
    </>)}
  </>);
}
