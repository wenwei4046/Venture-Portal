// The chats' emoji panel (shared/emoji.ts, user 2026-10-13): under the reply box like a keyboard — not a sheet over it,
// which hid how many emoji were typed. V = the view model's path (emojiOpen / closeEmoji / emojis); `when` = when it
// shows. Patched in by gen-sales.cjs and panel-1011-patches.cjs.
const EMOJI_PANEL = (V, when, pad) => `{!!(${when}) && (<div style={{ flex: "none", ${pad}padding: "8px 12px 6px", borderTop: "1px solid #EBDDD2", background: "#FBF7F3", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>EMOJI</span>
          <span onClick={${V}.closeEmoji} style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Done</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: "2px", maxHeight: "196px", overflowY: "auto", scrollbarWidth: "none" }}>
          {(${V}.emojis).map((e, e_i) => (<Fragment key={e_i}><span onClick={e.pick} style={{ height: "40px", display: "grid", placeItems: "center", fontSize: "26px", borderRadius: "10px", cursor: "pointer" }}>{e.e}</span></Fragment>))}
        </div>
      </div>)}
      `;
module.exports = { EMOJI_PANEL };
