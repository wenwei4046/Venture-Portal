/* eslint-disable */
// @ts-nocheck — ported from the prototype; kept as it is so the documents and prices come out the same.
// Catalogue import: website scraper (also used as the bookmarklet), clipboard/CSV/Excel parsing, and diffing.

// Self-contained: runs in our page (on fetched HTML) and on the b2b site as a bookmarklet.
export function scrape(doc, base) {
  var P = /(?:RM|MYR)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/i;
  var abs = function (u) { try { return new URL(u, base).href; } catch (e) { return u || ""; } };
  var BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|TR|TD|TH|TABLE|SECTION|ARTICLE|HEADER|FOOTER|BR|DT|DD|DL|FIGURE|FIGCAPTION|FORM|LABEL)$/;
  var walk = function (n, acc) {
    for (var c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) acc.push(c.nodeValue);
      else if (c.nodeType === 1 && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(c.tagName)) {
        var b = BLOCK.test(c.tagName);
        acc.push(b ? "\n" : " "); walk(c, acc); acc.push(b ? "\n" : " ");
      }
    }
    return acc;
  };
  var txt = function (e) {
    if (!e) return "";
    var s = e.innerText && doc.defaultView ? e.innerText : walk(e, []).join("");
    return String(s).replace(/[ \t\u00a0]+/g, " ").replace(/ *\n[ \n]*/g, "\n").trim();
  };
  var codeOf = function (s) {
    var m = (s || "").match(/\b(?:SKU|Code|Item\s*No\.?|Model)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{3,}?)(?=\s|$|RM|[,;|])/i) || (s || "").match(/(?:^|[\s(])([A-Z]{1,4}\d{3,}(?:-\d{1,3})?|\d{5,}(?:-\d{1,3})?|K\d{5})(?=\s|$|[),;|]|RM)/);
    return m ? m[1] : "";
  };
  var specOf = function (s, n) {
    return (s || "").split(/\n+|\s{3,}/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length < 160 && /(\d\s*(mm|cm)\b|\bW\s*\d|\bD\s*\d|\bH\s*\d|dimension|size|material|colou?r|finish)/i.test(x); })
      .slice(0, n || 4).join(" · ");
  };
  var imgSrc = function (img) { return abs(img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("src") || img.currentSrc || ""); };
  var out = [], seen = [], keys = {};
  var imgs = doc.querySelectorAll("img");
  for (var k = 0; k < imgs.length; k++) {
    var img = imgs[k], el = img;
    for (var i = 0; i < 7 && el; i++) {
      el = el.parentElement; if (!el) break;
      var t = txt(el); if (t.length > 900) break;
      var ms = t.match(new RegExp(P.source, "gi"));
      if (el.querySelectorAll("img").length > 3) break;
      var hasName = el.querySelector("h1,h2,h3,h4,h5,[class*=name],[class*=title]") || (el.querySelectorAll("a[href]").length && t.replace(/\s/g, "").length > 6);
      if (!ms && !(hasName && t.length > 6 && t.length < 400 && /[A-Za-z]{3}/.test(t))) continue;
      if (ms && ms.length > 3) break;
      if (!ms) {
        for (var up = el.parentElement, j = 0; up && j < 5; up = up.parentElement, j++) {
          if (up.querySelectorAll("img").length > 3) break;
          var tt = txt(up); if (tt.length > 900) break;
          var m2 = tt.match(new RegExp(P.source, "gi"));
          if (m2) { if (m2.length <= 3) { el = up; t = tt; ms = m2; } break; }
        }
      }
      if (seen.indexOf(el) >= 0) break;
      seen.push(el);
      var a = el.querySelector("a[href]");
      var nameEl = el.querySelector("h1,h2,h3,h4,h5,[class*=name],[class*=title]");
      var lines = t.split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x && /[A-Za-z]{2}/.test(x) && !P.test(x) && !/^(quick view|add to cart|buy now|qty\b|sold out|ready stock|new)/i.test(x); });
      var cands = [a && a.getAttribute("title"), nameEl && nameEl.getAttribute("title"), img.getAttribute("alt"), img.getAttribute("title"), txt(nameEl), lines[0]].filter(function (x) { return x && /[A-Za-z]{2}/.test(x); });
      var full = cands.filter(function (x) { return !/(\.\.\.|…)$/.test(x.trim()); });
      var name = String((full.length ? full.sort(function (p, q) { return q.length - p.length; })[0] : cands[0]) || "").replace(/\s*(\.\.\.|…)$/, "").trim();
      var src = imgSrc(img);
      var code = "", lead = name.match(/^((?:[A-Z]{0,3}\d{5,}\/)*[A-Z]{0,3}\d{5,})\s+(.+)$/);
      if (lead) { code = lead[1]; name = lead[2]; }
      var pm = src.match(/\/product\/([A-Z0-9\-]+)\//i);
      if (!code && pm) code = pm[1];
      if (!code) code = codeOf(t);
      var sq = t.match(/\b(?:Qty|Stock|Today's Stock|Available)\s*[:.]?\s*(\d+)/i);
      var prices = ms ? ms.map(function (x) { return parseFloat(x.replace(/[^\d.]/g, "")); }) : [];
      var it = { name: name.slice(0, 140), code: code, price: prices.length ? Math.min.apply(null, prices) : null, img: src, url: a ? abs(a.getAttribute("href")) : base, specs: specOf(t), stock: sq ? +sq[1] : null, truncated: !full.length && /(\.\.\.|…)/.test(cands[0] || "") };
      var key = (it.code || it.name).toLowerCase();
      if (it.name && !keys[key]) { keys[key] = 1; out.push(it); }
      break;
    }
  }
  var JUNK = /^(login|log in|sign in|sign up|register|my account|account|your personal details|personal details|cart|my cart|wishlist|checkout|my orders|order history|logout|home|contact us|about us)$/i;
  out = out.filter(function (it) {
    var host = ""; try { host = new URL(base).hostname.replace(/^www\./, ""); } catch (e) {}
    return !JUNK.test(it.name.trim()) && !(host && it.name.toLowerCase().indexOf(host) >= 0) && !/logo|icon|sprite|\.svg(\?|$)|placeholder|banner/i.test(it.img);
  });
  var prod = out.filter(function (it) { return /\/product\//i.test(it.img) || it.price != null; });
  if (prod.length >= 2) out = prod;
  var h1 = doc.querySelector("h1");
  if (out.length <= 1 && h1) {
    var main = doc.querySelector("main") || doc.body, mt = txt(main), pm = mt.match(P);
    var best = null, bw = 0;
    var mi = main.querySelectorAll("img");
    for (var j = 0; j < mi.length; j++) { var w = (mi[j].naturalWidth || +mi[j].getAttribute("width") || 0); if (w > bw || !best) { bw = w; best = mi[j]; } }
    out = [{ name: txt(h1).slice(0, 120), code: codeOf(mt), price: pm ? parseFloat(pm[1].replace(/,/g, "")) : null, img: best ? imgSrc(best) : "", url: base, specs: specOf(mt, 8) }];
  }
  return out;
}

function grab() {
  var ui = document.createElement("div");
  ui.style.cssText = "position:fixed;z-index:2147483647;top:16px;right:16px;width:340px;padding:16px;border-radius:12px;background:#fff;color:#222;font:14px/1.5 sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.3)";
  document.body.appendChild(ui);
  var say = function (h) { ui.innerHTML = h; };
  var btn = function (label, fn, main) { var b = document.createElement("button"); b.textContent = label; b.style.cssText = "margin:10px 8px 0 0;padding:8px 14px;border-radius:8px;border:1px solid #2B2420;font:600 14px sans-serif;cursor:pointer;background:" + (main ? "#2B2420;color:#fff" : "#fff;color:#2B2420"); b.onclick = fn; ui.appendChild(b); return b; };
  var close = function () { ui.remove(); };
  var host = location.host, skip = /cart|checkout|account|login|logout|register|wishlist|contact|about|faq|policy|terms|blog|news|javascript:|mailto:|tel:/i, isCol = /collection|brand|series/i;
  var cats = [], cols = [], seenU = {};
  var brandOf = function (a) {
    for (var el = a.parentElement, i = 0; el && i < 5; el = el.parentElement, i++) {
      var hd = [].slice.call(el.querySelectorAll("h1,h2,h3,h4,h5,h6,strong,b,[class*=title],[class*=head]")).filter(function (x) { return !x.closest("a") && x.textContent.trim().length < 40; });
      if (hd.length && hd[0].compareDocumentPosition(a) & 4) return hd[0].textContent.replace(/\s+/g, " ").trim().toUpperCase();
    }
    return "";
  };
  [].slice.call(document.querySelectorAll("header a[href], nav a[href], [class*=menu] a[href], [class*=nav] a[href]")).forEach(function (a) {
    var t = (a.textContent || "").replace(/\s+/g, " ").trim(), u = a.href.split("#")[0];
    if (!t || t.length > 40 || a.host !== host || skip.test(u) || skip.test(t) || u === location.origin + "/" || seenU[u]) return;
    if (/^(our )?collections?$|^categor/i.test(t)) return;
    seenU[u] = 1;
    if (isCol.test(u)) { var br = brandOf(a); cols.push({ name: (br && br !== t.toUpperCase() ? br + " · " : "") + t.toUpperCase(), url: u }); } else cats.push({ name: t.toUpperCase(), url: u, room: brandOf(a) });
  });
  var finish = function (items, pages) {
    var data = "IRQ1:" + JSON.stringify({ v: V, page: location.href, at: Date.now(), items: items });
    var np = items.filter(function (x) { return x.price != null; }).length;
    say("<b>IR price grabber</b><br>" + items.length + " items, " + np + " with a price" + (pages ? ", from " + pages + " pages" : "") + "." + (np ? "" : "<br><span style=color:#A3371A>No prices found. Are you logged in?</span>"));
    var copy = function () {
      var ok = function () { say("<b>Copied " + items.length + " items.</b><br>Go back to Quote Settings &gt; Catalogue and click \"Paste from website\"."); btn("Close", close); };
      var fb = function () { var ta = document.createElement("textarea"); ta.value = data; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); ok(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data).then(ok, fb); else fb();
    };
    var send = function () {
      try { var ta = document.createElement("textarea"); ta.value = data; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } catch (e) {}
      var w = window.open(B, "irq_settings");
      if (!w) { say("<b>Your browser blocked the new tab.</b><br>Copy instead, then paste in Quote Settings."); btn("Copy", copy, true); return; }
      say("<b>Sending " + items.length + " items to Quote Settings…</b><br>Also copied. If the new tab shows an error, close it, open Quote Settings yourself and click \"Paste from website\".");
      var ack = false, n = 0;
      window.addEventListener("message", function (e) { if (e.data === "irq-ack" && !ack) { ack = true; say("<b>Sent " + items.length + " items.</b><br>Review the changes in the Quote Settings tab, then Save and publish."); btn("Close", close); } });
      var t = setInterval(function () {
        if (ack) { clearInterval(t); return; }
        if (n++ > 100) { clearInterval(t); say("<b>Quote Settings didn't answer.</b><br>Copy instead, then paste there."); btn("Copy", copy, true); return; }
        try { w.postMessage(data, "*"); } catch (e) {}
      }, 600);
    };
    if (np) btn("Send to Quote Settings", send, true);
    btn(np ? "Copy instead" : "Copy", copy, !np);
    btn("Cancel", close);
  };
  var thisPage = function () { var it = SCRAPE(document, location.href); if (!it.length) { say("<b>IR price grabber</b><br>No products found on this page."); btn("Close", close); return; } finish(it, 0); };
  var all = function () {
    var items = [], keys = {}, clrSeen = {}, done = 0, pages = 0, stop = false, queue = cats.map(function (c) { c.t = "cat"; return c; }).concat(cols.map(function (c) { c.t = "col"; return c; }));
    var add = function (list, c) { list.forEach(function (x) { var k = x.url || x.code || x.name, ex = keys[k];
      if (c.t === "col") { if (ex) { ex.col = c.name; } else { x.col = c.name; keys[k] = x; items.push(x); } return; }
      if (c.t === "clr") { var tgt = ex || x; var cs = (tgt.color ? tgt.color.split(", ") : []); if (cs.indexOf(c.name) < 0) cs.push(c.name); tgt.color = cs.join(", "); if (!ex) { keys[k] = x; items.push(x); } return; }
      if (ex) return; x.cat = c.name; if (c.room && c.room !== c.name) x.room = c.room; keys[k] = x; items.push(x); }); };
    say("<b>Reading all categories…</b>"); var st = document.createElement("div"); ui.appendChild(st); btn("Stop", function () { stop = true; });
    var next = function () {
      if (stop || !queue.length) { finish(items, pages); return; }
      var c = queue.shift(), visited = {}, pq = [c.url];
      var page = function () {
        if (stop || !pq.length || pages > 400) { done++; next(); return; }
        var u = pq.shift(); if (visited[u]) { page(); return; } visited[u] = 1; pages++;
        st.textContent = (c.t === "col" ? "Collection " : c.t === "clr" ? "Colour " : "") + c.name + " (" + (done + 1) + "/" + (cats.length + cols.length) + ") · " + items.length + " items";
        fetch(u, { credentials: "include" }).then(function (r) { return r.text(); }).then(function (h) {
          var d = new DOMParser().parseFromString(h, "text/html"), before = items.length;
          add(SCRAPE(d, u), c);
          if (items.length > before || c.t === "cat") [].slice.call(d.querySelectorAll("a[href]")).forEach(function (a) {
            var href = a.getAttribute("href"); if (!href) return; var full; try { full = new URL(href, u).href.split("#")[0]; } catch (e) { return; }
            var same = full.split("?")[0] === c.url.split("?")[0];
            if (same && /[?&](p|page|pg|paged)=\d+/i.test(full) && !visited[full] && pq.indexOf(full) < 0) pq.push(full);
            if (c.t === "cat" && !clrSeen[full] && (/[?&](filter_)?(pa_)?colou?r[^=]*=/i.test(full) || (a.closest("[class*=colo],[id*=colo],[class*=swatch]") && (a.textContent || a.title || "").trim().length < 30))) {
              var nm = ((a.getAttribute("title") || a.textContent || "").replace(/\s+/g, " ").replace(/\(\d+\)/, "").trim() || (full.match(/colou?r[^=]*=([^&]+)/i) || [])[1] || "").toUpperCase();
              if (nm && nm.length < 30) { clrSeen[full] = 1; queue.push({ t: "clr", name: decodeURIComponent(nm).replace(/[+_-]/g, " "), url: full }); }
            }
          });
          page();
        }).catch(function () { page(); });
      };
      page();
    };
    next();
  };
  say("<b>IR price grabber</b><br>Found " + cats.length + " categories" + (cols.length ? " and " + cols.length + " collections" : "") + " in the menu.");
  if (cats.length + cols.length > 1) all(); else thisPage();
}

// Short, ASCII-only, minimally escaped so Chrome accepts it as a bookmark URL.
const BM_BODY = ("var SCRAPE=" + scrape.toString() + ";(" + grab.toString() + ")();").replace(/\s*\n\s*/g, " ").replace(/ {2,}/g, " ");
let hv = 5381; for (let k = 0; k < BM_BODY.length; k++) hv = ((hv << 5) + hv + BM_BODY.charCodeAt(k)) >>> 0;
export const GRABBER_VERSION = hv.toString(36);
const BACK = typeof location !== "undefined" ? location.href : "";
const BM_SRC = "(function(){var V='" + GRABBER_VERSION + "';var B=" + JSON.stringify(BACK) + ";" + BM_BODY + "})()";
const enc = s => s.replace(/%/g, "%25").replace(/#/g, "%23").replace(/[^\x20-\x7e]/g, c => encodeURIComponent(c));
export const BOOKMARKLET = "javascript:" + enc(BM_SRC);
export const BOOKMARKLET_BODY = enc(BM_SRC);

export function parseClip(text) {
  const s = String(text || "").trim();
  const i = s.indexOf("IRQ1:");
  if (i < 0) return null;
  try { const d = JSON.parse(s.slice(i + 5)); return { v: d.v || "", page: d.page || "", items: d.items || [] }; } catch (e) { return null; }
}

export async function readLink(url) {
  const res = await fetch("https://r.jina.ai/" + url, { headers: { "X-Return-Format": "html" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return scrape(doc, url).map(it => ({ ...it, price: null }));
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === "\t" || c === ";") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}

export async function readFile(file) {
  let rows;
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
    const wb = XLSX.read(await file.arrayBuffer());
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  } else rows = parseCsv(await file.text());
  let hi = rows.findIndex(r => r.some(x => /code|sku|price|cost/i.test(String(x))));
  if (hi < 0) hi = 0;
  const head = rows[hi].map(x => String(x || "").trim());
  const find = re => head.findIndex(x => re.test(x));
  const ci = find(/code|sku|item\s*no|model|ref/i);
  const pi = find(/trade|nett?|cost|price|rm/i);
  const ii = find(/image|photo|img|picture/i);
  const si = find(/spec|dimension|size/i);
  const ni = head.findIndex((x, i) => i !== ci && /name|description|item|product/i.test(x));
  return rows.slice(hi + 1).map(r => {
    const g = i => i < 0 ? "" : String(r[i] ?? "").trim();
    const p = parseFloat(g(pi).replace(/[^\d.]/g, ""));
    return { code: g(ci), name: g(ni), price: isNaN(p) ? null : p, img: g(ii), specs: g(si), url: "" };
  }).filter(it => it.code || it.name);
}

const norm = s => String(s || "").toUpperCase().replace(/\s+/g, "");
export function diff(items, incoming) {
  return incoming.map((inc, i) => {
    const parts = String(inc.code || "").split("/").map(norm).filter(Boolean);
    const cur = items.find(x => inc.code && norm(x.code) === norm(inc.code)) || items.find(x => parts.length > 1 && parts.includes(norm(x.code)))
      || items.find(x => inc.name && String(x.name).toLowerCase() === String(inc.name).toLowerCase())
      || (inc.truncated ? items.find(x => inc.name && String(x.name).toLowerCase().startsWith(String(inc.name).toLowerCase())) : null);
    let status = "new", what = [];
    if (cur) {
      if (inc.price != null && +inc.price !== +cur.cost) what.push("price");
      if (inc.name && !inc.truncated && inc.name !== cur.name) what.push("name");
      if (inc.img && inc.img !== cur.img) what.push("picture");
      if (inc.specs && inc.specs !== (cur.specs || "")) what.push("specs");
      status = what.length ? "changed" : "same";
    }
    return { key: "r" + i, inc, cur: cur || null, status, what };
  });
}
