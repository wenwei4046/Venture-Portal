// Shared prototype store: tasks created in the Assignment Plan travel across personas.
(function () {
  if (window.__hmStore && window.__hmStore.v === 3) return;
  const old = window.__hmStore || {};
  let clock = 9 * 60;
  const S = {
    v: 3,
    tasks: old.tasks || [],
    notices: old.notices || [],
    subs: old.subs || new Set(),
    emit() { this.subs.forEach(f => { try { f(); } catch (e) {} }); },
    push(t, n) { this.tasks = [...t, ...this.tasks]; this.notices = [...(n || []), ...this.notices]; this.emit(); },
    get(id) { return this.tasks.find(t => t.topLeft === id); },
    upd(id, fn) { this.tasks = this.tasks.map(t => (t.topLeft === id ? { ...t, ...fn(t) } : t)); this.emit(); },
    stamp() { clock += 17; const h = Math.floor(clock / 60) % 24, m = clock % 60; return `10 Nov ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; },
    owner(t, i) { i = i == null ? t.cur : i; const s = t.stages[i]; if (!s) return null; return s.picked ? (t.picks && t.picks[i]) || null : s.who; },
    apprAt(t, idx) { const a = (t.stages[t.cur].apprRaw || [])[idx]; return a ? (a[1] === 'PIC' ? `${t.pic} (PIC)` : a[1]) : null; },
    approver(t) { return t.phase === 'review' ? this.apprAt(t, t.apprIdx || 0) : null; },
    isPicTurn(t) { const a = (t.stages[t.cur].apprRaw || [])[t.apprIdx || 0]; return t.phase === 'review' && !!a && a[1] === 'PIC'; },
    log(t, text) { return [...(t.history || []), { t: this.stamp(), text }]; },
    accept(id) { this.upd(id, t => ({ phase: 'accepted', history: this.log(t, `${this.owner(t)} accepted Stage ${t.cur + 1} · ${t.stages[t.cur].name}`) })); },
    save(id, patch) { this.upd(id, () => patch); },
    advanceObj(t, text) {
      const h = this.log(t, text), next = t.cur + 1;
      if (next >= t.stages.length) return { phase: 'done', history: [...h, { t: this.stamp(), text: 'All stages done · task closed' }] };
      const nt = { ...t, cur: next };
      return { cur: next, phase: 'todo', apprIdx: 0, ver: 0, changes: null, history: [...h, { t: this.stamp(), text: `Stage ${next + 1} · ${t.stages[next].name} opened for ${this.owner(nt)}` }] };
    },
    submit(id, extra) {
      this.upd(id, t0 => {
        const t = { ...t0, ...(extra || {}) }, s = t.stages[t.cur], ver = (t.ver || 0) + 1;
        if ((s.apprRaw || []).length) return { ...(extra || {}), ver, changes: null, phase: 'review', apprIdx: 0, history: this.log(t, `${this.owner(t)} submitted ${s.name} v${ver} → ${this.apprAt(t, 0)}`) };
        return { ...(extra || {}), ...this.advanceObj(t, `${this.owner(t)} completed ${s.name}`) };
      });
    },
    approve(id, by) {
      this.upd(id, t => {
        const s = t.stages[t.cur], idx = (t.apprIdx || 0) + 1, txt = `${by} approved ${s.name} v${t.ver}`;
        if (idx < (s.apprRaw || []).length) return { apprIdx: idx, history: this.log(t, `${txt} → ${this.apprAt(t, idx)}`) };
        return this.advanceObj(t, txt);
      });
    },
    reject(id, by, reason) { this.upd(id, t => ({ phase: 'changes', changes: { by, reason }, history: this.log(t, `${by} requested changes on ${t.stages[t.cur].name} v${t.ver}: "${reason}"`) })); },
    kind(s) { const n = (s && s.name) || ''; return /plan/i.test(n) ? 'plan' : /design/i.test(n) ? 'design' : /caption|schedul|post/i.test(n) ? 'schedule' : /ads|boost/i.test(n) ? 'boost' : 'other'; },
    stageIdx(t, k) { return t.stages.findIndex(s => this.kind(s) === k); },
    // calendar status of each post row: draft → waiting → done (scheduled / posted)
    postStatus(t, r) {
      if (r.posted) return { st: 'done', label: 'Posted' };
      if (r.scheduled) return { st: 'done', label: 'Scheduled' };
      const planI = this.stageIdx(t, 'plan');
      const planApproved = t.cur > planI || t.phase === 'done';
      return planApproved ? { st: 'waiting', label: 'In production' } : { st: 'draft', label: 'Draft' };
    },
  };
  window.__hmStore = S;
})();
