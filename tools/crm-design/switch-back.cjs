// The way back to the Revenue app beside the CRM's bell (2026-10-14, the owner: "the switch back revenue app, put the same
// place with switch to crm, put a icon, easy to switch"). The Revenue app's Today has the CRM's chat button left of its bell,
// so every CRM page has the Revenue app's home left of its own bell: the bell's round button (40×40, 1px #EBDDD2, white, soft
// shadow), the icon in rust as the chat button's. It calls the page's `exitCrm` — the salesperson pages' ShellExtras
// (sales/vm/header.ts) and the Control panel's app view model (panel/vm/app.ts) — as Profile's "Back to Revenue app" card does,
// which stays. Shared by gen-sales.cjs and panel-1011-patches.cjs.
//   switchBack(indent, extraStyle): the markup, its inner lines indented by `indent`.
module.exports = function switchBack(indent, extra = "") {
  return "<span onClick={v.exitCrm} title=\"Back to Revenue app\" aria-label=\"Back to Revenue app\" style={{ " + extra +
    "flex: \"none\", width: \"40px\", height: \"40px\", boxSizing: \"border-box\", borderRadius: \"50%\", border: \"1px solid #EBDDD2\", background: \"#fff\", display: \"grid\", placeItems: \"center\", color: \"#BD4A19\", boxShadow: \"0 2px 8px rgba(63,43,34,.06)\", cursor: \"pointer\" }}>\n" +
    indent + "  <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n" +
    indent + "    <path d=\"M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9\">\n" +
    indent + "    </path>\n" +
    indent + "  </svg>\n" +
    indent + "</span>";
};
