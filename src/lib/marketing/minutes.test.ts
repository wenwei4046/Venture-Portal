import { describe, expect, it } from 'vitest'
import {
  addCol, addField, addStartRow, colTypeOf, countChanges, dropFolder, duplicateField, folderCount, folderTree, insertAt, minutesFieldFromRow,
  minutesFieldsPayload, minutesFoldersFromRow, minutesPatch, minutesProblems, minutesSummary, minutesTemplatesFromRow, minutesWarnings, moveCol,
  moveField, nameCol, newMinutesFields, newMinutesName, NEW_RULES, ONCE_TYPES, railItems, railStatus, removeCol, removeStartRow, retype,
  setStartCell, startRows, tableAnswer, typeBlocked, type MinutesEdit, type MinutesField, type MinutesFolder, type MinutesTemplate,
} from './minutes'

// 2026-10-23 — the Minutes Builder (`Minutes Builder.dc.html`, ③ of the handoff); 2026-11-12 — v2
// (`docs/design_handoff_minutes_builder_v2/`): what the builder reads, sums up, warns of and refuses, held to what
// mkt_minutes_check refuses (tests/member-sql/validate-marketing-minutes.mjs, validate-marketing-minutes-v2.mjs).

const row = {
  templates: [
    { id: 't1', name: 'Kickoff', rev: 3, version: 2, changed: false, publishedBy: 'Sia Josiah', folder: 'fo1', sort: 4,
      usedBy: ['Reels', 7], open: 3, openOnLive: 2,
      fields: [
        { id: 'p', name: 'Project (from Projects)', type: 'Project link', req: true, pic: true, lock: true },
        { id: 'a', name: 'Attendees', type: 'People', req: true, pic: true, lock: true, help: '  Who came  ' },
        { id: 's', name: 'Shot list', type: 'Table', req: false, pic: false, cols: [{ name: 'Shot', type: 'Text' }, { name: 'Due', type: 'Nonsense' }],
          rows: [['Wide'], ['a', 'b', 'c']], staffCols: true },
        { name: 'Odd', type: 'Video' },
      ],
      rules: { sign: true, pic: 'yes', project: true },
      published: { name: 'Kickoff', fields: [{ id: 'p', name: 'Project (from Projects)', type: 'Project link', lock: true }], rules: {} } },
  ],
  folders: [{ id: 'fo1', name: 'Project minutes', parent: null, sort: 1 }, { id: '', name: 'bad' }],
}

const field = (over: Partial<MinutesField>): MinutesField => ({ key: 'k', name: 'Notes', type: 'Short text', req: false, pic: true, lock: false, ...over })

describe('what the builder reads', () => {
  const [t] = minutesTemplatesFromRow(row)

  it('each template with its fields, rules, version, draft, folder and what uses it', () => {
    expect([t.id, t.name, t.rev, t.version, t.changed, t.publishedBy, t.folder, t.sort]).toEqual(['t1', 'Kickoff', 3, 2, false, 'Sia Josiah', 'fo1', 4])
    expect([t.usedBy, t.open, t.openOnLive]).toEqual([['Reels'], 3, 2])
    expect(t.fields.map(f => f.name)).toEqual(['Project (from Projects)', 'Attendees', 'Shot list']) // a kind it cannot hold is left out
    expect(t.fields.map(f => f.key)).toEqual(['p', 'a', 's'])
    expect(t.fields[1].help).toBe('Who came')
    expect(t.fields[2].cols).toEqual([{ name: 'Shot', type: 'Text' }, { name: 'Due', type: 'Date' }])
    expect(t.fields[2].rows).toEqual([['Wide', ''], ['a', 'b']]) // aligned to the columns
    expect([t.fields[2].staffRows, t.fields[2].staffCols]).toEqual([true, true])
    expect(t.rules).toEqual({ sign: true, pic: false, picAll: false, project: true, file: false, lock: false })
    expect(t.published?.fields.map(f => f.key)).toEqual(['p'])
    expect([minutesTemplatesFromRow({ templates: [{ id: 'a', rules: { pic: true, picAll: true } }] })[0].rules.picAll,
      minutesTemplatesFromRow({ templates: [{ id: 'b', rules: { pic: false, picAll: true } }] })[0].rules.picAll]).toEqual([true, false])
  })

  it('a field read without an id of its own gets one for the page', () => {
    expect(minutesFieldFromRow({ name: 'X', type: 'Date' })?.key).toMatch(/^f/)
    expect(minutesFieldFromRow({ id: 'has space', name: 'X', type: 'Date' })?.key).not.toBe('has space')
  })

  it('the folders', () => {
    expect(minutesFoldersFromRow(row)).toEqual([{ id: 'fo1', name: 'Project minutes', parent: null, sort: 1 }])
    expect([minutesTemplatesFromRow(null), minutesFoldersFromRow(null)]).toEqual([[], []])
  })
})

describe('making a template', () => {
  it('starts with the project, the meeting’s date, the attendees and the signatures — the project and the attendees locked', () => {
    const f = newMinutesFields()
    expect(f.map(x => [x.name, x.type, x.lock])).toEqual([
      ['Project (from Projects)', 'Project link', true], ['Meeting date', 'Date', false], ['Attendees', 'People', true], ['Signatures', 'Signature', false],
    ])
    expect(NEW_RULES).toEqual({ sign: false, pic: false, picAll: false, project: true, file: true, lock: true })
  })

  it('is named “New minutes”, then “New minutes 2”', () => {
    expect(newMinutesName([])).toBe('New minutes')
    expect(newMinutesName(['new minutes', 'New minutes 2'])).toBe('New minutes 3')
  })

  it('a column named for a day is a date', () => {
    expect(colTypeOf(undefined, 'Due date')).toBe('Date')
    expect(colTypeOf(undefined, 'Owner')).toBe('Text')
    expect(colTypeOf('Person', 'Deadline')).toBe('Person')
  })
})

describe('adding a field', () => {
  const base = newMinutesFields()

  it('goes after the field picked, else before the signatures; signatures always last', () => {
    expect(insertAt(base, null)).toBe(3)
    expect(insertAt(base, base[0].key)).toBe(1)
    expect(insertAt(base, base[3].key)).toBe(3) // the signatures picked: before them
    const a = addField(base, 'Long text', base[1].key)
    expect(a.fields.map(f => f.type)).toEqual(['Project link', 'Date', 'Long text', 'People', 'Signature'])
    expect(a.fields[2]).toMatchObject({ key: a.key, name: '', req: false, pic: true, lock: false })
    expect(addField(base.slice(0, 3), 'Signature', base[0].key).fields.at(-1)?.type).toBe('Signature')
  })

  it('a table comes with three columns and two starting rows; staff add rows, not columns', () => {
    const t = addField(base, 'Table', null).fields[3]
    expect(t.cols?.map(c => `${c.name}:${c.type}`)).toEqual(['Item:Text', 'Details:Text', 'Owner:Person'])
    expect([t.rows, t.staffRows, t.staffCols]).toEqual([[['', '', ''], ['', '', '']], true, false])
  })
})

describe('a field changed after it was made', () => {
  const base = newMinutesFields()

  it('its kind changes; a table gets columns the first time', () => {
    const f = retype(field({ name: 'Plan' }), 'Table')
    expect([f.type, f.cols?.length, f.rows?.length]).toEqual(['Table', 3, 2])
    expect(retype(base[0], 'Short text')).toBe(base[0]) // locked: kept
    const back = retype(retype(f, 'Long text'), 'Table')
    expect(back.cols).toEqual(f.cols) // its own columns kept through a round trip
  })

  it('a once-only kind is not offered where another field holds it; a locked field takes no other kind', () => {
    const fs = [...base, field({ key: 'x' })]
    expect(typeBlocked(fs, 4, 'Project link')).toBe(true)
    expect(typeBlocked(fs, 4, 'Signature')).toBe(true)
    expect(typeBlocked(fs, 4, 'Campaign period')).toBe(false)
    expect(typeBlocked(fs, 0, 'Date')).toBe(true)
    expect(typeBlocked(fs, 3, 'Signature')).toBe(false) // its own kind
  })

  it('a hint for staff is sent on one line, none left out', () => {
    expect(minutesFieldsPayload([field({ help: '  Say   it\nshort ' })])[0].help).toBe('Say it short')
    expect('help' in minutesFieldsPayload([field({ help: '   ' })])[0]).toBe(false)
  })

  it('duplicated after itself with an id of its own — never a locked or once-only one', () => {
    const fs = [...base, field({ key: 'x', name: 'Goal' })]
    const d = duplicateField(fs, 4)
    expect(d?.fields.map(f => f.name).slice(-2)).toEqual(['Goal', 'Goal (copy)'])
    expect(d?.key).not.toBe('x')
    expect([duplicateField(fs, 0), duplicateField(fs, 3)]).toEqual([null, null])
  })

  it('moved up or down — a locked one stays', () => {
    const fs = [...base, field({ key: 'x' })]
    expect(moveField(fs, 4, 3).map(f => f.key)[3]).toBe('x')
    expect(moveField(fs, 0, 1)).toEqual(fs)
    expect(moveField(fs, 4, 5)).toEqual(fs)
  })
})

describe('a table’s starting rows stay aligned with its columns', () => {
  const t = addField(newMinutesFields(), 'Table', null).fields[3]
  const filled = setStartCell(setStartCell(t, 0, 0, 'A'), 0, 2, 'C')

  it('a column added: an empty cell on every row; at most eight', () => {
    const f = addCol(filled)
    expect(f.cols?.at(-1)).toEqual({ name: 'Column 4', type: 'Text' })
    expect(f.rows).toEqual([['A', '', 'C', ''], ['', '', '', '']])
    let g = f
    for (let i = 0; i < 9; i++) g = addCol(g)
    expect(g.cols?.length).toBe(8)
  })

  it('a column removed takes its cells; the last column stays', () => {
    const f = removeCol(filled, 0)
    expect(f.rows).toEqual([['', 'C'], ['', '']])
    expect(removeCol(removeCol(f, 0), 0).cols?.length).toBe(1)
  })

  it('a column moved carries its cells', () => {
    const f = moveCol(filled, 2, -1)
    expect(f.cols?.map(c => c.name)).toEqual(['Item', 'Owner', 'Details'])
    expect(f.rows?.[0]).toEqual(['A', 'C', ''])
    expect(moveCol(filled, 0, -1)).toBe(filled)
  })

  it('a Text column named for a day becomes a Date', () => {
    expect(nameCol(filled, 1, 'Due date').cols?.[1]).toEqual({ name: 'Due date', type: 'Date' })
    expect(nameCol(filled, 2, 'Deadline').cols?.[2].type).toBe('Person')
  })

  it('rows added and removed — at least one', () => {
    expect(addStartRow(filled).rows?.length).toBe(3)
    expect(removeStartRow(removeStartRow(filled, 1), 0).rows).toEqual([['A', '', 'C']])
    expect(startRows({ cols: [{ name: 'X', type: 'Text' }] })).toEqual([[''], ['']])
  })

  it('the minutes read the starting rows until somebody writes in; the staff’s own columns after the template’s', () => {
    expect(tableAnswer(filled, undefined)).toEqual({ cols: ['Item', 'Details', 'Owner'], types: ['Text', 'Text', 'Person'], xcols: [], rows: [['A', '', 'C'], ['', '', '']] })
    const a = tableAnswer(filled, { xcols: ['Budget'], rows: [['x', 'y', 'z', 'w']] })
    expect([a.cols, a.types.at(-1), a.rows]).toEqual([['Item', 'Details', 'Owner', 'Budget'], 'Text', [['x', 'y', 'z', 'w']]])
  })
})

describe('the foot', () => {
  const base = newMinutesFields()

  it('sums up what it asks', () => {
    expect(minutesSummary(base)).toBe('4 fields · 4 required · 4 visible to PIC')
  })

  it('warns as the handoff does — each opening its tab', () => {
    expect(minutesWarnings(base.filter(f => f.type !== 'Signature'), { ...NEW_RULES, sign: true })).toEqual([{ text: '“Every attendee signs” is on, but there is no Signatures field', tab: 'rules' }])
    expect(minutesWarnings(base, { ...NEW_RULES, pic: true })).toEqual([{ text: 'PIC signs off but can’t see any content field', tab: 'fields' }])
    expect(minutesWarnings([...base, field({ name: 'Decisions', type: 'Long text' })], { ...NEW_RULES, pic: true })).toEqual([])
  })

  it('refuses to publish what the database would — each with the field it is about', () => {
    expect(minutesProblems(base)).toEqual([])
    expect(minutesProblems([...base, field({ key: 'b', name: ' ' })])).toEqual([{ text: 'A field has no name', key: 'b' }])
    expect(minutesProblems([...base, field({ key: 'n1', name: 'Notes' }), field({ key: 'n2', name: 'notes' })])).toEqual([{ text: 'Two fields are called “notes”', key: 'n2' }])
    expect(minutesProblems([...base, field({ key: 't', name: 'Plan', type: 'Table', cols: [{ name: '', type: 'Text' }] })])).toEqual([{ text: 'A table column has no name', key: 't' }])
    expect(minutesProblems([...base, field({ key: 's2', name: 'More', type: 'Signature' })])).toEqual([{ text: 'Only one Signature field allowed', key: 's2' }])
    expect(minutesProblems(base.filter(f => f.type !== 'Project link')).map(p => p.text)).toEqual(['Minutes keep their project and attendees'])
  })
})

describe('only what changed is saved', () => {
  const now: MinutesEdit = { name: 'Kickoff', fields: newMinutesFields(), rules: NEW_RULES }

  it('each field is sent with its id; a table with its rows and what the staff may add', () => {
    const t = addField(now.fields, 'Table', null).fields[3]
    expect(minutesFieldsPayload([t])[0]).toEqual({ id: t.key, name: '', type: 'Table', req: false, pic: true, lock: false,
      cols: t.cols, rows: [['', '', ''], ['', '', '']], staffRows: true, staffCols: false })
  })

  it('each part on its own', () => {
    expect(minutesPatch(now, { ...now, name: 'Kick-off' })).toEqual({ name: 'Kick-off' })
    expect(minutesPatch(now, { ...now, rules: { ...NEW_RULES, sign: true } })).toEqual({ rules: { ...NEW_RULES, sign: true } })
    const fields = now.fields.map((f, i) => (i === 1 ? { ...f, pic: false } : f))
    expect(minutesPatch(now, { ...now, fields })).toEqual({ fields: minutesFieldsPayload(fields) })
    expect(minutesPatch(now, { ...now })).toBeNull()
  })

  it('a locked field is sent required', () => {
    expect(minutesFieldsPayload([field({ type: 'People', lock: true, req: false })])[0]).toMatchObject({ req: true, lock: true })
  })
})

describe('changes since the version published', () => {
  const pub: MinutesEdit = { name: 'Kickoff', fields: newMinutesFields(), rules: NEW_RULES }

  it('none never published; none when nothing changed', () => {
    expect(countChanges(pub, null)).toBeNull()
    expect(countChanges(pub, pub)).toBe(0)
  })

  it('the name, each field added, removed or changed, the order, each rule', () => {
    expect(countChanges({ ...pub, name: 'Kick-off' }, pub)).toBe(1)
    expect(countChanges({ ...pub, fields: [...pub.fields, field({ key: 'new' })] }, pub)).toBe(1)
    expect(countChanges({ ...pub, fields: pub.fields.filter(f => f.type !== 'Date') }, pub)).toBe(1)
    expect(countChanges({ ...pub, fields: pub.fields.map(f => (f.type === 'Date' ? { ...f, help: 'When' } : f)) }, pub)).toBe(1)
    expect(countChanges({ ...pub, fields: moveField(pub.fields, 1, 3) }, pub)).toBe(1)
    expect(countChanges({ ...pub, rules: { ...NEW_RULES, sign: true, file: false } }, pub)).toBe(2)
    expect(countChanges({ name: 'X', fields: [...pub.fields, field({ key: 'n' })], rules: { ...NEW_RULES, sign: true } }, pub)).toBe(3)
  })
})

describe('the rail', () => {
  const tpl = (id: string, name: string, folder: string | null, over: Partial<MinutesTemplate> = {}): MinutesTemplate => ({
    id, name, folder, fields: newMinutesFields(), rules: NEW_RULES, rev: 1, version: 0, changed: true, sort: 0, published: null, usedBy: [],
    open: 0, openOnLive: 0, publishedAt: null, publishedBy: null, updatedAt: null, updatedBy: null, ...over,
  })
  const folders: MinutesFolder[] = [{ id: 'a', name: 'Project minutes', parent: null, sort: 1 }, { id: 'b', name: 'Recurring', parent: 'a', sort: 1 },
    { id: 'c', name: 'Other', parent: null, sort: 2 }]
  const tpls = [tpl('1', 'Kickoff', 'a'), tpl('2', 'Monthly', 'b'), tpl('3', 'Loose', null), tpl('4', 'Lost folder', 'gone')]

  it('folders first, then templates, a level each; a collapsed folder hides what is in it; counts go all the way down', () => {
    const items = railItems(folders, tpls, {}, '')
    expect(items.map(i => (i.kind === 'folder' ? `F:${i.folder.name}:${i.depth}:${i.count}` : `T:${i.tpl.name}:${i.depth}`))).toEqual([
      'F:Project minutes:0:2', 'F:Recurring:1:1', 'T:Monthly:2', 'T:Kickoff:1', 'F:Other:0:0', 'T:Loose:0', 'T:Lost folder:0',
    ])
    expect(railItems(folders, tpls, { a: true }, '').map(i => (i.kind === 'folder' ? i.folder.id : i.tpl.id))).toEqual(['a', 'c', '3', '4'])
    expect(folderCount('a', folders, tpls)).toBe(2)
  })

  it('a search lists the matches flat', () => {
    expect(railItems(folders, tpls, { a: true }, ' mon ').map(i => (i.kind === 'tpl' ? [i.tpl.name, i.depth] : null))).toEqual([['Monthly', 0]])
  })

  it('the folder tree for Move to folder', () => {
    expect(folderTree(folders).map(x => `${x.folder.name}:${x.depth}`)).toEqual(['Project minutes:0', 'Recurring:1', 'Other:0'])
  })

  it('a folder deleted moves what was in it up a level', () => {
    const r = dropFolder('a', folders, tpls)
    expect(r.folders.find(f => f.id === 'b')?.parent).toBeNull()
    expect(r.tpls.find(t => t.id === '1')?.folder).toBeNull()
    expect(r.tpls.find(t => t.id === '2')?.folder).toBe('b')
  })

  it('a status dot and a tooltip, no meta line', () => {
    const t = tpl('1', 'Kickoff', 'a')
    expect(railStatus(t, t, null)).toEqual({ dot: 'draft', title: 'Draft · never published\n4 fields · right-click for more' })
    const live = tpl('1', 'Kickoff', 'a', { version: 3, fields: t.fields, published: { name: 'Kickoff', fields: t.fields, rules: NEW_RULES } })
    expect(railStatus(live, live, null).dot).toBe('live')
    expect(railStatus(live, { ...live, name: 'X', rules: { ...NEW_RULES, sign: true } }, 'Project minutes')).toEqual({
      dot: 'changed', title: 'In Project minutes\nv3 live · 2 unpublished changes\n4 fields · right-click for more' })
  })
})

// 2026-10-24 — ④-2b: a campaign's run period (answer 13), kept once — with the project link and, since v2, the signatures.
describe('kinds kept once', () => {
  it('the project link, a campaign period and the signatures', () => {
    expect(ONCE_TYPES).toEqual(['Project link', 'Campaign period', 'Signature'])
    const one = addField(newMinutesFields(), 'Campaign period', null).fields
    expect(minutesProblems(one).map(p => p.text)).toEqual(['A field has no name'])
    expect(minutesProblems(addField(one, 'Campaign period', null).fields).map(p => p.text)).toContain('Only one Campaign period field allowed')
    expect(minutesWarnings(one, { ...NEW_RULES, pic: true })).toEqual([{ text: 'PIC signs off but can’t see any content field', tab: 'fields' }])
  })
})
