// Team | Mine as ONE round button (2026-10-14, the owner, with the design "Team · Mine toggle — 1a Single swap circle":
// "change the 原本的那个 team 跟 mine 换来这里 … one tap"). It replaces the text segment that had a top row of its own: the
// bell's and the house's round button (40×40, 1px #EBDDD2, white, soft shadow), left of the house, in the bell's ink; its
// icon is the side one is on — Team's two people, Mine's one — and a tap goes to the other side on the same page (CrmApp's
// TEAM_TAB / MINE_TAB), as Today's chat button goes to the CRM and the house comes back. Shown only to whoever has both
// sides (the Director, the Principal, a leader with a downline); never in a chat or on a page with a back link, where the
// house is not either. Shared by gen-sales.cjs and panel-1011-patches.cjs.
//   teamMineSwap(vm, indent, extraStyle): the markup bound to `vm` ({ icon, title, swap }), its inner lines indented by `indent`.
module.exports = function teamMineSwap(vm, indent, extra = "") {
  return "<span onClick={" + vm + ".swap} title={" + vm + ".title} aria-label={" + vm + ".title} style={{ " + extra +
    "flex: \"none\", width: \"40px\", height: \"40px\", boxSizing: \"border-box\", borderRadius: \"50%\", border: \"1px solid #EBDDD2\", background: \"#fff\", display: \"grid\", placeItems: \"center\", color: \"#3F2B22\", boxShadow: \"0 2px 8px rgba(63,43,34,.06)\", cursor: \"pointer\" }}>\n" +
    indent + "  <svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n" +
    indent + "    <path d={" + vm + ".icon}>\n" +
    indent + "    </path>\n" +
    indent + "  </svg>\n" +
    indent + "</span>";
};
