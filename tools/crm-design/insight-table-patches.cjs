/**
 * Insight › Ads Performance's table sorts and sizes as Ads Performance's does (the owner, 2026-10-13: "跟 ads performance
 * 一樣，要可以順序排列數據，調整大小"): each header sorts (▼ ▲ off), a header's right edge drags its column's width
 * (double-click gives it back), and the header, the rows and the total share the widths. The header cells are Ads
 * Performance's header buttons; the light divider at each edge is item 2 of the same round.
 */
const HEAD =
  `{(v.insHead).map((h, h_i) => (<Fragment key={h_i}>` +
  `<button type="button" onClick={h.sort} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: h.justify, gap: "5px", padding: "0", border: "0", background: "none", font: "inherit", color: h.fg, letterSpacing: "inherit", textTransform: "uppercase", textAlign: h.align, cursor: "pointer" }}>` +
  `<span>{h.label}</span><span style={{ flex: "0 0 auto", fontSize: "10px", color: h.ac }}>{h.arrow}</span>` +
  `<span onPointerDown={h.resize} onDoubleClick={h.unsize} onClick={e => e.stopPropagation()} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-12px", bottom: "-12px", right: "-12px", width: "12px", cursor: "col-resize", display: "flex", justifyContent: "center" }}>` +
  `<span style={{ width: "1px", margin: "8px 0", background: "#EBDDD2" }}></span></span>` +
  `</button></Fragment>))}`;

module.exports = [
  [/<div style=\{\{ minWidth: "820px" \}\}>([\s\S]*?TOTAL · \{v\.adTot\.n\} ADS<\/span>)/,
    (_m, body) => `<div style={{ minWidth: \`\${v.insAdMinW}px\` }}>` + body
      .split('gridTemplateColumns: "minmax(220px, 1.6fr) repeat(7, minmax(72px, 1fr))"').join("gridTemplateColumns: v.insAdCols")
      .replace(/<span>AD<\/span>[\s\S]*?<span style=\{\{ textAlign: "center" \}\}>APPT<\/span>/, HEAD),
    "Insight's ad table sorts and sizes as Ads Performance's."],
];
