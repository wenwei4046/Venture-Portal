(function () {
  if (window.__hzSelect) return; window.__hzSelect = true;
  var pop = null, cur = null, openedAt = 0;
  var css = document.createElement('style');
  css.textContent = '.hz-pop{position:fixed;z-index:2147483000;background:#fff;border:1px solid rgb(218,210,200);border-radius:8px;box-shadow:0 10px 28px rgba(43,33,28,.16);padding:4px;overflow-y:auto;font-family:Lora,Georgia,serif;font-size:14px;color:rgb(43,33,28);box-sizing:border-box}' +
    '.hz-opt{padding:8px 10px;border-radius:5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:8px}' +
    '.hz-opt:hover,.hz-opt.hz-k{background:rgb(243,240,236)}.hz-opt.hz-on{font-weight:600;color:rgb(176,92,54)}.hz-opt.hz-on:before{content:"✓";font-size:12px}.hz-opt:not(.hz-on){padding-left:28px}.hz-opt.hz-dis{opacity:.4;pointer-events:none}';
  document.head.appendChild(css);
  function close() { if (pop) { pop.remove(); pop = null; } if (cur) { try { cur.focus({ preventScroll: true }); } catch (e) {} } cur = null; }
  function pick(sel, v) {
    var setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, v);
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    sel.dataset.v && (sel.dataset.v = v);
  }
  function open(sel) {
    close(); cur = sel; openedAt = Date.now();
    var r = sel.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    pop = document.createElement('div'); pop.className = 'hz-pop';
    Array.prototype.forEach.call(sel.options, function (o, i) {
      var d = document.createElement('div'); d.className = 'hz-opt' + (o.value === sel.value ? ' hz-on' : '') + (o.disabled ? ' hz-dis' : '');
      d.textContent = o.textContent; d.dataset.i = i;
      d.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); var s = cur; close(); pick(s, o.value); });
      pop.appendChild(d);
    });
    document.body.appendChild(pop);
    var w = Math.max(r.width, Math.min(pop.scrollWidth + 8, 360));
    var below = vh - r.bottom - 8, above = r.top - 8, h = Math.min(pop.scrollHeight, 300);
    var up = below < Math.min(h, 200) && above > below;
    var maxH = Math.min(300, up ? above : below);
    pop.style.maxHeight = maxH + 'px'; pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    var ph = Math.min(pop.scrollHeight, maxH);
    pop.style.top = (up ? r.top - ph - 4 : r.bottom + 4) + 'px';
    var on = pop.querySelector('.hz-on'); if (on) pop.scrollTop = on.offsetTop - maxH / 2;
  }
  document.addEventListener('mousedown', function (e) {
    var sel = e.target.closest && e.target.closest('select');
    if (pop && !pop.contains(e.target)) { var was = cur; close(); if (sel === was) { e.preventDefault(); return; } }
    if (sel && !sel.disabled && !sel.multiple) { e.preventDefault(); try { sel.focus({ preventScroll: true }); } catch (er) {} open(sel); }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (pop) {
      var opts = Array.prototype.slice.call(pop.querySelectorAll('.hz-opt:not(.hz-dis)')), k = pop.querySelector('.hz-k') || pop.querySelector('.hz-on'), i = opts.indexOf(k);
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); var n = opts[Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; opts.forEach(function (x) { x.classList.remove('hz-k'); }); if (n) { n.classList.add('hz-k'); n.scrollIntoView && pop.scrollTo(0, n.offsetTop - 100); } }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (k) { var s = cur, v = cur.options[+k.dataset.i].value; close(); pick(s, v); } }
      return;
    }
    var t = e.target;
    if (t && t.tagName === 'SELECT' && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open(t); }
  }, true);
  window.addEventListener('scroll', function (e) { if (pop && !pop.contains(e.target) && Date.now() - openedAt > 200) close(); }, true);
  window.addEventListener('resize', close);
})();
