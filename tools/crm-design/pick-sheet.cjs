// The chats' photo / video preview (shared/pick.ts, user 2026-10-13): the markup both generators patch in — salesperson
// (gen-sales.cjs) and Control panel (panel-1011-patches.cjs). V = the view model's path; the sheet shows while it is set.
const PICK_SHEET = V => `{!!(${V}) && (<div onClick={${V}?.cancel} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={${V}?.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 16px 20px", display: "flex", flexDirection: "column", gap: "12px", maxHeight: "88%", boxSizing: "border-box" }}>
          <span style={{ flex: "none", alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}></span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span onClick={${V}?.toggleHd} title="HD" style={{ flex: "none", height: "28px", padding: "0 10px", boxSizing: "border-box", borderRadius: "8px", border: \`1.5px solid \${${V}?.hdBd}\`, background: ${V}?.hdBg, color: ${V}?.hdFg, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "800", letterSpacing: ".05em", cursor: "pointer" }}>HD</span>
            <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>{${V}?.title}</strong>
            <span onClick={${V}?.cancel} style={{ flex: "none", fontSize: "14px", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>Cancel</span>
          </div>
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", scrollbarWidth: "none" }}>
            {(${V}?.items ?? []).map((it, it_i) => (<Fragment key={it_i}><div style={{ flex: "none", width: "104px", height: "104px", borderRadius: "12px", overflow: "hidden", background: "#F5EBE3" }}>{it.img ? (<img src={it.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />) : (<video src={it.vid} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />)}</div></Fragment>))}
          </div>
          <span style={{ fontSize: "12px", color: "#806B60" }}>{${V}?.note}</span>
          <span onClick={${V}?.send} style={{ flex: "none", height: "48px", borderRadius: "24px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>{${V}?.sendLabel}</span>
        </div>
      </div>)}
      `;
module.exports = { PICK_SHEET };
