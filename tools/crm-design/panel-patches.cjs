// Where the design shows a demo value or leaves out a tap, the live one (each must match exactly once).
module.exports = {
  PanelOverview: [
    ['<span title="Back to Revenue app" style=', '<span onClick={v.exitApp} title="Back to Revenue app" style='],
    ["Wed, 7 Oct · {v.meTitle} · All access", "{v.todayLabel} · {v.meTitle} · All access"],
  ],
  PanelLead: [["{v.ld.ownerName}'s customer · reply window open 20h 15m", "{v.ld.ownerName}'s customer{v.ld.windowNote}"]],
};
