(function () {
  if (window.__hzDate) return; window.__hzDate = true;
  var pop = null, cur = null, view = null;
  var M = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var css = document.createElement('style');
  css.textContent = 'input[type=date]::-webkit-calendar-picker-indicator{opacity:.55;cursor:pointer}input[type=date]{cursor:pointer}' +
    '.hzd{position:fixed;z-index:2147483000;width:268px;background:#fff;border:1px solid rgb(218,210,200);border-radius:8px;box-shadow:0 10px 28px rgba(43,33,28,.16);padding:12px;font-family:Lora,Georgia,serif;font-size:13px;color:rgb(43,33,28);box-sizing:border-box}' +
    '.hzd-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.hzd-t{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:19px}' +
    '.hzd-n{width:28px;height:28px;border:none;background:transparent;border-radius:5px;cursor:pointer;color:rgb(88,76,68);font-size:16px;line-height:1}.hzd-n:hover{background:rgb(243,240,236)}' +
    '.hzd-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-variant-numeric:tabular-nums}.hzd-w{text-align:center;font-size:11px;letter-spacing:.06em;color:rgb(120,108,100);padding:4px 0}' +
    '.hzd-d{height:32px;display:flex;align-items:center;justify-content:center;border-radius:5px;cursor:pointer;border:1px solid transparent}.hzd-d:hover{background:rgb(243,240,236)}' +
    '.hzd-o{color:rgb(190,180,170)}.hzd-today{text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgb(199,111,70)}.hzd-on{border-color:rgb(199,111,70);color:rgb(176,92,54);font-weight:600;background:rgb(252,240,232)}' +
    '.hzd-f{display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid rgb(235,230,224)}.hzd-f button{border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:13px;color:rgb(176,92,54);padding:4px 6px;border-radius:5px}.hzd-f button:hover{background:rgb(252,240,232)}';
  document.head.appendChild(css);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(v) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; }
  function close() { if (pop) { pop.remove(); pop = null; } cur = null; }
  function set(inp, v) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function btn(cls, txt, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); fn(); }); return b; }
  function draw() {
    pop.innerHTML = '';
    var sel = parse(cur.value), today = iso(new Date());
    var h = document.createElement('div'); h.className = 'hzd-h';
    var t = document.createElement('div'); t.className = 'hzd-t'; t.textContent = M[view.getMonth()] + ' ' + view.getFullYear();
    var nav = document.createElement('div');
    nav.appendChild(btn('hzd-n', '‹', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); }));
    nav.appendChild(btn('hzd-n', '›', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); }));
    h.appendChild(t); h.appendChild(nav); pop.appendChild(h);
    var g = document.createElement('div'); g.className = 'hzd-g';
    ['MO','TU','WE','TH','FR','SA','SU'].forEach(function (w) { var d = document.createElement('div'); d.className = 'hzd-w'; d.textContent = w; g.appendChild(d); });
    var start = new Date(view.getFullYear(), view.getMonth(), 1); start.setDate(1 - ((start.getDay() + 6) % 7));
    for (var i = 0; i < 42; i++) {
      (function (d) {
        var v = iso(d), c = document.createElement('div');
        c.className = 'hzd-d' + (d.getMonth() !== view.getMonth() ? ' hzd-o' : '') + (v === today ? ' hzd-today' : '') + (sel && v === iso(sel) ? ' hzd-on' : '');
        c.textContent = d.getDate();
        c.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); var inp = cur; close(); set(inp, v); });
        g.appendChild(c);
      })(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    pop.appendChild(g);
    var f = document.createElement('div'); f.className = 'hzd-f';
    f.appendChild(btn('', 'Today', function () { var inp = cur; close(); set(inp, today); }));
    f.appendChild(btn('', 'Close', close));
    pop.appendChild(f);
  }
  function open(inp) {
    close(); cur = inp; view = parse(inp.value) || new Date(); view = new Date(view.getFullYear(), view.getMonth(), 1);
    pop = document.createElement('div'); pop.className = 'hzd'; document.body.appendChild(pop); draw();
    var r = inp.getBoundingClientRect(), ph = pop.offsetHeight, vh = innerHeight, vw = innerWidth;
    var up = vh - r.bottom < ph + 8 && r.top > ph + 8;
    pop.style.top = (up ? r.top - ph - 4 : r.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, vw - 276)) + 'px';
  }
  document.addEventListener('mousedown', function (e) {
    if (pop && pop.contains(e.target)) return;
    var inp = e.target.closest && e.target.closest('input[type=date]');
    if (pop) { var was = cur; close(); if (inp === was) { e.preventDefault(); return; } }
    if (inp && !inp.disabled) { e.preventDefault(); inp.focus({ preventScroll: true }); open(inp); }
  }, true);
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('input[type=date]')) e.preventDefault(); }, true);
  document.addEventListener('keydown', function (e) {
    if (pop && e.key === 'Escape') { e.preventDefault(); close(); return; }
    var t = e.target; if (t && t.type === 'date' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(t); }
  }, true);
  window.addEventListener('scroll', function (e) { if (pop && !pop.contains(e.target)) close(); }, true);
  window.addEventListener('resize', close);
})();
