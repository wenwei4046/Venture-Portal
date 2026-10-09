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
  PanelLead: [
    ["{v.ld.ownerName}'s customer · reply window open 20h 15m", "{v.ld.ownerName}'s customer{v.ld.windowNote}"],
    // The Principal / Director do reply — from Inbox, in the owner's CRM (crm_can_reply). This page only reads.
    ["View only · {v.ld.ownerFirst}'s customer. The Principal reads chats but doesn't reply.", "View only · {v.ld.ownerFirst}'s customer. To reply, open this chat from Inbox."],
    // + and the camera (user 2026-10-09): a document, a photo — sent with the typed text as its caption.
    ['<span style={{ flex: "none", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#806B60" }}>',
     '<span onClick={v.lx.attach} title="Send a file" style={{ flex: "none", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#806B60" }}>'],
    ['<span style={{ flex: "none", width: "38px", height: "44px", display: "grid", placeItems: "center", color: "#806B60" }}>',
     '<span onClick={v.lx.photo} title="Send a photo" style={{ flex: "none", width: "38px", height: "44px", display: "grid", placeItems: "center", color: "#806B60" }}>'],
  ],
};
