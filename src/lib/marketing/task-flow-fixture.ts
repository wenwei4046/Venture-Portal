// A running task as the task page's top draws it — the Workflow Builder 2a prototype's Red Truck reel at "Edit", with
// Ali one day late — for the tests of task-flow-view, the TaskFlow components and the Preview. Not used by the app.

import { DEFAULT_OVERDUE, defaultFinish } from './flow'
import type { FlowTask } from './task-flow-view'

export const NOW = new Date('2026-11-12T15:20:00+08:00')
export const P = { rachel: 's-rachel', daniel: 's-daniel', mei: 's-mei', kit: 's-kit', ali: 's-ali', siti: 's-siti', hafiz: 's-hafiz' }

export function fixtureTask(over: Partial<FlowTask> = {}): FlowTask {
  return {
    title: 'Red Truck · Reels video',
    trackId: 'TSK-CAR-2611-018',
    tplChip: 'Reels video · Full production v2',
    category: 'Reels video',
    startOn: '2026-11-02',
    promise: 10,
    stages: [
      { name: 'Script', sla: 2, doer: P.mei, cands: [], levels: [{ ids: [P.rachel], rule: 'any' }], back: null, picText: 'Content team is writing the script',
        enteredAt: '2026-11-02T09:00:00+08:00', dueOn: '2026-11-04', doneAt: '2026-11-04T11:30:00+08:00' },
      { name: 'Shoot', sla: 1, doer: P.kit, cands: [], levels: [], back: null, picText: 'Content team is shooting',
        enteredAt: '2026-11-04T11:30:00+08:00', dueOn: '2026-11-05', doneAt: '2026-11-07T10:00:00+08:00' },
      { name: 'Edit', sla: 3, doer: P.ali, cands: [P.ali, P.hafiz], levels: [], back: null, picText: 'Content team is editing',
        enteredAt: '2026-11-07T10:00:00+08:00', dueOn: '2026-11-11', doneAt: null },
      { name: 'Thumbnail', sla: 1, doer: null, cands: [P.siti, P.hafiz], levels: [], back: null, picText: 'Design team is making the cover',
        enteredAt: null, dueOn: null, doneAt: null },
      { name: 'Final', sla: 1, doer: P.ali, cands: [], levels: [{ ids: [P.rachel, P.daniel], rule: 'all' }, { ids: ['pic'], rule: 'any' }], back: 2,
        picText: 'Ready for your approval', enteredAt: null, dueOn: null, doneAt: null },
    ],
    at: { cur: 2, level: -1, ok: {}, done: false },
    sections: [
      { id: 's0', emoji: '🎯', title: 'Script', stage: 0, req: true, pic: true, fields: [{ id: 'f-topic', label: 'Topic', type: 'Text', stage: 0, req: true, pic: true, cols: [] }] },
      { id: 'tbl', emoji: '🎬', title: 'Shot list', stage: null, req: false, pic: true, fields: [{
        id: 'f-shots', label: 'Shot list', type: 'Table', stage: null, req: false, pic: true, cols: [
          { id: 'c0', name: 'Scene', type: 'Text', stage: 0, req: true, pic: true, added: false },
          { id: 'c1', name: 'Shot', type: 'Checkbox', stage: 1, req: false, pic: false, added: false },
          { id: 'c2', name: 'Clip link', type: 'File', stage: 2, req: true, pic: false, added: false },
        ],
      }] },
      { id: 's2', emoji: '🎯', title: 'Edit', stage: 2, req: true, pic: true, fields: [
        { id: 'f-draft', label: 'Draft video', type: 'File', stage: 2, req: true, pic: true, cols: [] },
        { id: 'f-notes', label: 'Edit notes', type: 'Text', stage: 2, req: false, pic: false, cols: [] },
        { id: 'f-date', label: 'Shoot date', type: 'Date', stage: 2, req: false, pic: true, cols: [] },
      ] },
      { id: 's4', emoji: '🎯', title: 'Final', stage: 4, req: true, pic: true, fields: [{ id: 'f-final', label: 'Final video', type: 'File', stage: 4, req: true, pic: true, cols: [] }] },
    ],
    values: { 'f-topic': 'Truck arrives' },
    rows: {
      'f-shots': [
        { id: 'r0', added: false, cells: { c0: 'Truck arrives at the mall', c1: true, c2: '' } },
        { id: 'r1', added: false, cells: { c0: 'Sofa unboxing on stage', c1: true, c2: '' } },
      ],
    },
    overdue: { ...DEFAULT_OVERDUE, notify: [...DEFAULT_OVERDUE.notify] },
    finish: defaultFinish('Reels video'),
    people: [
      { id: P.rachel, name: 'Rachel', role: 'MARKETING MANAGER', load: 6 },
      { id: P.daniel, name: 'Daniel', role: 'ASSISTANT MARKETING MANAGER', load: 4 },
      { id: P.mei, name: 'Mei', role: 'DIRECTOR', load: 3 },
      { id: P.kit, name: 'Ah Kit', role: 'VIDEOGRAPHER', load: 2 },
      { id: P.ali, name: 'Ali', role: 'EDITOR', load: 3 },
      { id: P.siti, name: 'Siti', role: 'GRAPHIC', load: 4 },
      { id: P.hafiz, name: 'Hafiz', role: 'GRAPHIC', load: 5 },
    ],
    pic: 'Carmen',
    doneAt: null,
    log: [
      { icon: '🔔', text: 'Ali notified: “Your turn — Edit, due 11 Nov”', at: '2026-11-07T10:00:00+08:00' },
      { icon: '✓', text: 'Ah Kit submitted Shoot', at: '2026-11-07T10:00:00+08:00' },
      { icon: '✓', text: 'Rachel approved Script', at: '2026-11-04T11:30:00+08:00' },
      { icon: '✓', text: 'Mei submitted Script', at: '2026-11-04T10:00:00+08:00' },
    ],
    ...over,
  }
}
