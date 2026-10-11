// Live-data patches on the rev 1011 Control panel markup (each must match exactly once). Kept short on purpose: the
// markup is the prototype's; a patch is only where the live app must differ, and says why.
module.exports = [
  // §2.1 chat top spacing: the list's max(16px, env(safe-area-inset-top)) is not repeated — .app already pads by the inset
  // (crm.module.css, the safe-areas MUST), so 16 px is what max() gives inside it, and an iPhone's inset is not added twice.
  [', paddingTop: "max(16px, env(safe-area-inset-top))", background: v.chromeBg,', ", background: v.chromeBg,"],
  // Live messages carry long links (a visit card's Google Maps / Waze, user 2026-10-11): they wrap inside the bubble, as
  // the RS chat's do (SalesChat › whiteSpace pre-wrap, overflowWrap anywhere); the prototype's samples had none.
  ['<p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>',
    '<p style={{ margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>'],
  ['border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45" }}>{m.text}',
    'border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}'],
  // Full time grid: a long title ("Revenue Specialist") is cut with … like the name above it, not run under the day boxes
  // (user 2026-10-11) — on a phone the name column is ~100 px.
  ['<small style={{ fontSize: "11px", lineHeight: "14px", color: "#806B60", whiteSpace: "nowrap" }}>{p.sub}</small>',
    '<small style={{ fontSize: "11px", lineHeight: "14px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.sub}</small>'],
];
