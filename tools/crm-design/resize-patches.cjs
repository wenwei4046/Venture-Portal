/**
 * Ads Performance: drag a column header's right edge to size it, double-click the edge to give it back (the owner,
 * 2026-10-13: "要有可以縮小拉大的功能"). The handle sits in the header's 12 px gap, drawn as a light divider ("做個淺色的豎杠");
 * it never sorts.
 */
const HANDLE = (down, reset) =>
  `<span onPointerDown={${down}} onDoubleClick={${reset}} onClick={e => e.stopPropagation()} title="Drag to resize · double-click to reset" ` +
  `style={{ position: "absolute", top: "-12px", bottom: "-12px", right: "-12px", width: "12px", cursor: "col-resize", display: "flex", justifyContent: "center" }}>` +
  `<span style={{ width: "1px", margin: "8px 0", background: "#EBDDD2" }}></span></span>`;

module.exports = [
  [/(<button type="button" onClick=\{h\.sort\} style=\{\{ )(display: "flex"[\s\S]*?<span style=\{\{ flex: "0 0 auto", fontSize: "10px", color: h\.ac \}\}>\{h\.arrow\}<\/span>)(\s*<\/button>)/,
    (_m, a, b, c) => `${a}position: "relative", ${b}${HANDLE("h.resize", "h.unsize")}${c}`,
    "Ads Performance's metric columns can be sized."],
  [/(<button type="button" onClick=\{v\.apSortName\} style=\{\{ )(display: "inline-flex"[\s\S]*?)(<\/button>)/,
    (_m, a, b, c) => `${a}position: "relative", ${b}${HANDLE("v.apNameResize", "v.apNameUnsize")}${c}`,
    "…and so can the Ad column."],
];
