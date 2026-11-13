// The PIC's link for a quick or recurring task (Workflow Builder 2a handoff › PIC link view — 2026-11-13): the simpler
// page the prototype draws (TaskFlowPic) from what mkt_pic_page already gives — the stage's PIC words, Approve /
// Request changes while it waits for them, the steps, "Expected by", the fields they may see ("Coming soon" where
// empty). The database leaves out what they may not see; nothing here adds a staff name or a price. Pure.

import { shortDay } from './board'
import type { PicPage, PicWork } from './pic'
import type { PicView } from './task-flow-view'

/** A task's link with one piece of work and no minutes of theirs: drawn the simpler way. */
export const picSimple = (page: PicPage) => page.kind !== 'product' && !page.minutes && page.work.length === 1 && !page.ads?.reports.length

/** Its stages' names (mkt_pic_page's `stageNames`), else "Step n". */
function stepNames(w: PicWork): string[] {
  const names = w.stageNames
  return Array.from({ length: Math.max(1, w.stages) }, (_, i) => names[i] || (w.stage && w.stage.idx === i ? w.stage.name : `Step ${i + 1}`))
}

export function picFlowView(page: PicPage, w: PicWork): PicView {
  const st = w.stage
  const done = w.status === 'done'
  const waiting = !!st?.waiting && !done
  const head = done
    ? { tone: 'done' as const, icon: '🎉', title: w.finish?.picText || 'It’s ready',
        text: w.finish?.feedbackUntil ? `All steps done. Send us your comments until ${shortDay(w.finish.feedbackUntil)}.` : 'All steps done.' }
    : waiting ? { tone: 'wait' as const, icon: '👀', title: 'Your approval is needed', text: `${st?.note || st?.name || 'It’s ready'}. Approve, or tell us what to change.` }
      : { tone: 'calm' as const, icon: '⏳', title: st?.note || 'The team is working on it', text: `Step ${(st?.idx ?? w.done) + 1} of ${w.stages}. We’ll message you when it needs your approval.` }
  const cur = done ? w.stages : st?.idx ?? w.done
  return {
    ...head,
    answer: waiting,
    steps: stepNames(w).map((name, i) => ({ name, state: done || i < cur ? 'done' : i === cur ? 'cur' : 'next' })),
    eta: done ? 'All steps done.' : w.dueOn ? `Expected by ${shortDay(w.dueOn)}` : 'Expected by —',
    secs: [...(w.brief ? [{ id: 'req', emoji: '📋', title: 'Requirements', text: w.brief, fields: [], table: null }] : []), ...(st && (st.fields.length || st.links.length)
      ? [{
          id: 'stage',
          emoji: '🎯',
          title: st.name,
          table: null,
          fields: [
            ...st.fields.filter(f => !f.table).map(f => ({ name: f.name, text: f.value ?? (st.files.some(x => x.field === f.name) ? st.files.filter(x => x.field === f.name).map(x => x.name).join(', ') : 'Coming soon'), filled: f.value !== null || st.files.some(x => x.field === f.name) })),
            ...st.links.map(l => ({ name: 'Link', text: l.label || l.url, filled: true })),
          ],
        },
        // Each table they may see, its 👁 columns — "Coming soon" in a cell not filled in yet.
        ...st.fields.flatMap((f, k) => {
          const t = f.table
          return t && t.cols.length ? [{
            id: `t${k}`, emoji: '▤', title: f.name, fields: [],
            table: { cols: t.cols, cells: t.rows.map(r => t.cols.map((_, j) => (r[j] ? { text: r[j] === 'true' ? '✓' : r[j], filled: true } : { text: 'Coming soon', filled: false }))) },
          }] : []
        })]
      : []).filter(x => x.fields.length > 0 || !!x.table)],
  }
}
