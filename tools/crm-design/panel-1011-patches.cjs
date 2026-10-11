// Live-data patches on the rev 1011 Control panel markup (each must match exactly once). Kept short on purpose: the
// markup is the prototype's; a patch is only where the live app must differ, and says why.
module.exports = [
  // §2.1 chat top spacing: the list's max(16px, env(safe-area-inset-top)) is not repeated — .app already pads by the inset
  // (crm.module.css, the safe-areas MUST), so 16 px is what max() gives inside it, and an iPhone's inset is not added twice.
  [', paddingTop: "max(16px, env(safe-area-inset-top))", background: v.chromeBg,', ", background: v.chromeBg,"],
  // Live messages carry long links (a visit card's Google Maps / Waze, user 2026-10-11): they wrap inside the bubble, as
  // the RS chat's do (SalesChat › whiteSpace pre-wrap, overflowWrap anywhere); the prototype's samples had none.
  // …and a visit sent to the customer is the visit card, the salesperson chat's own markup (SalesChat › m.ev), its text
  // hidden (user 2026-10-11: the booking showed as text with the map links).
  ['<p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>',
    '{!!(m.ev) && (<>' +
    '<div onClick={m.ev.go} style={{ width: "248px", maxWidth: "100%", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden", textAlign: "left", cursor: "pointer" }}>' +
    '<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px" }}>' +
    '<span style={{ flex: "none", width: "54px", padding: "6px 0", borderRadius: "12px", background: m.ev.bg, color: m.ev.fg, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "1.1" }}>' +
    '<small style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.wk}</small>' +
    '<strong style={{ fontSize: "24px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{m.ev.dn}</strong>' +
    '<small style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.mon}</small>' +
    '</span>' +
    '<span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>' +
    '<span style={{ alignSelf: "flex-start", padding: "2px 7px", borderRadius: "5px", background: m.ev.bg, color: m.ev.fg, fontSize: "10px", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase" }}>{m.ev.kind}</span>' +
    '<strong style={{ fontSize: "15px", fontWeight: "650", color: "#3F2B22" }}>{m.ev.title}</strong>' +
    '<span style={{ fontSize: "17px", fontWeight: "700", color: "#3F2B22", textDecoration: m.ev.deco, fontVariantNumeric: "tabular-nums" }}>{m.ev.time}</span>' +
    '</span>' +
    '</div>' +
    '<div style={{ display: "flex", gap: "10px", padding: "11px 12px", borderTop: "1px solid #EBDDD2", background: "#FBF7F3" }}>' +
    '<svg style={{ flex: "none", marginTop: "1px", color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">' +
    '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path>' +
    '</svg>' +
    '<span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>' +
    '<strong style={{ fontSize: "14px", fontWeight: "650", color: "#3F2B22" }}>{m.ev.room}</strong>' +
    '{!!(m.ev.addr) && (<><span style={{ fontSize: "13px", color: "#806B60", lineHeight: "1.35" }}>{m.ev.addr}</span></>)}' +
    '</span>' +
    '</div>' +
    '</div>' +
    '</>)}' +
    '<p style={{ display: m.pDisp, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>'],
  ['border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45" }}>{m.text}',
    'border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}'],
  // Full time grid: a long title ("Revenue Specialist") is cut with … like the name above it, not run under the day boxes
  // (user 2026-10-11) — on a phone the name column is ~100 px.
  ['<small style={{ fontSize: "11px", lineHeight: "14px", color: "#806B60", whiteSpace: "nowrap" }}>{p.sub}</small>',
    '<small style={{ fontSize: "11px", lineHeight: "14px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.sub}</small>'],
];
