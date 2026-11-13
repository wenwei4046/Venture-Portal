import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { canvasFromRow } from '@/lib/marketing/canvas'
import { DEFAULT_OVERDUE, defaultFinish, PIC_ID, ASSIGN_ID } from '@/lib/marketing/flow'
import { fixtureTask, NOW } from '@/lib/marketing/task-flow-fixture'
import { picView, stripView } from '@/lib/marketing/task-flow-view'
import type { WfCategory, WfPerson, WfStage, WfTemplate } from '@/lib/marketing/workflows'

// 2026-11-13 — the user's decision on the Workflow Builder 2a's screens: every line that explains an option shows only
// while that option is pointed at or reached by the keyboard ("改成鼠标指向选项才出现") — a tooltip, never a line on the
// page. Validation and status words stay.

const actions = vi.hoisted(() => ({ addMktOption: vi.fn(), removeMktOption: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

import ApprovalLevel from './ApprovalLevel'
import CanvasEditor from './CanvasEditor'
import EndSettings from './EndSettings'
import OverdueSettings from './OverdueSettings'
import TemplatePicker from './TemplatePicker'
import TaskFlowCelebration from '../task/TaskFlowCelebration'
import TaskFlowPic from '../task/TaskFlowPic'
import TaskFlowStrip from '../task/TaskFlowStrip'

const tipOn = (el: HTMLElement) => {
  fireEvent.mouseEnter(el)
  const text = screen.getByRole('tooltip').textContent
  fireEvent.mouseLeave(el)
  return text
}
const gone = (...lines: string[]) => lines.forEach(l => expect(screen.queryByText(l)).toBeNull())

describe('helper lines are tooltips', () => {
  it('⏰ When a stage is late: the Then cards and Repeat daily', () => {
    render(<OverdueSettings cfg={DEFAULT_OVERDUE} onChange={vi.fn()} />)
    gone('The people above get a reminder. Nothing else changes.', 'MM sees “reassign it?” at the top of the task.', 'Remind again every day until the stage moves on')
    expect(tipOn(screen.getByRole('radio', { name: 'Just remind' }))).toBe('The people above get a reminder. Nothing else changes.')
    expect(tipOn(screen.getByRole('radio', { name: 'Ask MM to reassign' }))).toBe('MM sees “reassign it?” at the top of the task.')
    expect(tipOn(screen.getByRole('switch', { name: 'Repeat daily' }))).toBe('Remind again every day until the stage moves on')
  })
  it('🏁 Task done: Done when and After it’s done', () => {
    render(<EndSettings finish={defaultFinish('Reels video')} category="Reels video" doneWhen="Stage 2 · Final is approved by Rachel" onChange={vi.fn()} onUpload={vi.fn()} onPreview={vi.fn()} />)
    gone('Change it on the last stage’s Approval.', 'Moves to Done right away. XP is given out.')
    expect(tipOn(screen.getByText('Stage 2 · Final is approved by Rachel'))).toBe('Change it on the last stage’s Approval.')
    expect(tipOn(screen.getByRole('radio', { name: 'Close the task' }))).toBe('Moves to Done right away. XP is given out.')
    expect(tipOn(screen.getByRole('radio', { name: 'Keep open 3 days for PIC feedback' }))).toBe('PIC can still comment on the link. Closes by itself after 3 working days.')
  })
  it('an approval level: the role words and "Already approves" stay; 🔗 PIC, 👤 Picked at assignment and ⏭ Next stage’s person explain on hover', () => {
    const approvers: WfPerson[] = [{ id: 'r', first: 'Rachel', title: 'MARKETING MANAGER', load: 0 }, { id: 'd', first: 'Dan', title: 'DIRECTOR', load: 0 }]
    render(<ApprovalLevel n={1} level={{ ids: [], rule: 'any' }} open approvers={approvers} hasNext usedElsewhere={new Set(['d'])}
      nameOf={id => approvers.find(p => p.id === id)?.first ?? id} onToggle={vi.fn()} onChange={vi.fn()} onRemove={null} />)
    expect(screen.getByText('MM')).toBeTruthy()
    expect(screen.getByText('Already approves at another level')).toBeTruthy()
    gone('Client approves through the tracking link', 'MM picks the approver per project')
    const opts = screen.getAllByRole('option')
    expect(tipOn(opts[2])).toBe('Client approves through the tracking link')
    expect(tipOn(opts[3])).toBe('MM picks the approver per project')
    expect(tipOn(opts[4])).toBe('Whoever does the next stage approves')
    expect(PIC_ID).not.toBe(ASSIGN_ID)
  })
  it('the template picker: no line under the list; the names say it on hover', () => {
    const cat: WfCategory & { templates: WfTemplate[] } = { id: 'c', name: 'Reels video', emoji: '🎬', sort: 0,
      templates: [{ id: 't', categoryId: 'c', category: 'Reels video', tname: 'Full production', version: 0 } as WfTemplate] }
    render(<TemplatePicker categories={[cat]} current={null} open busy={false} renaming={null} onToggle={vi.fn()} onOpen={vi.fn()} onClone={vi.fn()}
      onDelete={vi.fn()} onAddTemplate={vi.fn()} onNewCategory={vi.fn()} onRename={vi.fn()} onRenaming={vi.fn()} onMenu={vi.fn()} />)
    gone('Double-click a name to rename · right-click for more')
    expect(tipOn(screen.getByText('Full production'))).toBe('Double-click a name to rename · right-click for more')
  })
  it('the canvas: the legend’s words, the head hint, Requirements, a Note and Free space on hover', () => {
    const stages: WfStage[] = [{ sid: 'sa', name: 'Script', dept: 'content', who: { mode: 'assign', cands: [] }, sla: 1, appr: [], split: false, back: null, picText: '' }]
    const canvas = canvasFromRow({ req: { pic: true }, sections: [{ id: 'x', emoji: '🎯', title: 'Script', stage: 'sa', fields: [{ id: 'n', label: 'Keep it short', type: 'Note', stage: 'sa' }] }] })
    render(<CanvasEditor title="Reels video · Full production" version={1} stages={stages} canvas={canvas} people={[]} onCanvas={vi.fn()} />)
    gone('Click any section, table or column to set it up', '🔒 Locked — colleagues can\'t delete', 'Read-only note shown to whoever works on this stage.',
      'Pulled in automatically from the meeting minutes intake. Read-only for everyone.', 'Always at the bottom 🔒 — the only place colleagues can add their own blocks and tables.')
    expect(tipOn(screen.getByText('Reels video · Full production'))).toBe('Click any section, table or column to set it up')
    expect(tipOn(screen.getByLabelText('Show on calendar'))).toBe('Show on calendar')
    expect(tipOn(screen.getByLabelText("Locked — colleagues can't delete"))).toBe("Locked — colleagues can't delete")
    expect(tipOn(screen.getAllByText('Requirements')[0])).toBe('Pulled in automatically from the meeting minutes intake. Read-only for everyone.')
    expect(tipOn(screen.getByRole('button', { name: /Keep it short/ }))).toBe('Read-only note shown to whoever works on this stage.')
    expect(tipOn(screen.getByText('Free space'))).toBe('Always at the bottom 🔒 — the only place colleagues can add their own blocks and tables.')
  })
  it('the task page: the strip’s cards, the celebration, the PIC link’s footer', () => {
    const task = fixtureTask()
    const { unmount } = render(<TaskFlowStrip cards={stripView(task, null, 0, NOW)} doneCount={2} meta="" onFocus={vi.fn()} />)
    gone('· click a stage to see it')
    expect(tipOn(screen.getAllByRole('button')[0])).toBe('Click a stage to see it')
    unmount()
    const c = render(<TaskFlowCelebration kind="confetti" gif={null} category="Reels video" finished={null} team="" onClose={vi.fn()} />)
    gone('Click anywhere to close')
    expect(tipOn(screen.getByTestId('tf-celebration'))).toBe('Click anywhere to close')
    c.unmount()
    render(<TaskFlowPic view={picView(task, NOW)} title="Reels video" sub="Houzs Marketing · tracking link for 2990 Home" />)
    gone('You see team names only. Questions? Reply to the WhatsApp message with this link.')
    expect(tipOn(screen.getByText('Houzs Marketing · tracking link for 2990 Home'))).toBe('You see team names only. Questions? Reply to the WhatsApp message with this link.')
  })
})
