// Where the design shows a demo value or leaves out a tap, the live one (each must match exactly once).
module.exports = {
  PanelOverview: [
    ['<span title="Back to Revenue app" style=', '<span onClick={v.exitApp} title="Back to Revenue app" style='],
    ["Wed, 7 Oct · {v.meTitle} · All access", "{v.todayLabel} · {v.meTitle} · All access"],
  ],
  // Organic Leads: tapping the name opens the chat (read it, answer it) before Send to (user 2026-10-09).
  PanelAssign: [
    ['<span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>\n                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{w.name}</strong>',
     '<span onClick={w.open} style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>\n                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{w.name}</strong>'],
  ],
};
