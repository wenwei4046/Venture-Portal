import { describe, expect, it } from 'vitest'
import { accountEdit, accountRowUpdates, parentChoices, type CoaAccount } from './coa-edit'

// An account's edit sends and writes ONLY what changed (2026-10-15, the user's
// rule: a whole-record save put back what somebody else changed meanwhile —
// the logins are shared, two open copies of one record are normal).

const acc = (code: string, name: string, type: CoaAccount['type'], parent: string | null = null, active = true): CoaAccount => ({
  code, name, type, cash_flow_category: 'financing', parent_code: parent, is_active: active, sort_order: 0,
})
const A = acc('4100', 'Amount Due to - Company', 'liability', '4000')
const draft = (over: Partial<Parameters<typeof accountEdit>[1]> = {}) => ({
  type: A.type, code: A.code, name: A.name, cashFlow: A.cash_flow_category, parent: A.parent_code ?? '', active: A.is_active, ...over,
})
const sent = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))

describe('an account edit', () => {
  it('sends the code and only what changed', () => {
    expect(sent(accountEdit(A, draft({ name: 'Amount Due to - Companies ' })).form)).toEqual({ code: '4100', name: 'Amount Due to - Companies' })
    expect(sent(accountEdit(A, draft({ active: false, parent: '' })).form)).toEqual({ code: '4100', is_active: 'false', parent_code: '' })
    const none = accountEdit(A, draft())
    expect(none.nothing).toBe(true)
    expect(sent(none.form)).toEqual({ code: '4100' })
  })

  it('a new code re-points history (asked first); a new type owns the code and leaves the parent', () => {
    const code = accountEdit(A, draft({ code: '4101' }))
    expect(code).toMatchObject({ codeChange: true, typeChange: false, nothing: false })
    expect(sent(code.form)).toEqual({ code: '4100', new_code: '4101' })
    const type = accountEdit(A, draft({ type: 'asset', code: '4100', cashFlow: 'operating', parent: '' }))
    expect(type).toMatchObject({ typeChange: true, codeChange: false })
    expect(sent(type.form)).toEqual({ code: '4100', new_type: 'asset', cash_flow_category: 'operating' })
  })
})

describe('the parents an account may sit under', () => {
  const chart = [
    acc('4000', 'Fund Sources Payable', 'liability'),
    A,
    acc('4053', 'Amount Due to - Carres', 'liability', '4100'),
    acc('4200', 'Amount Due to - Director', 'liability', '4000'),
    acc('4300', 'Old payable', 'liability', null, false),
    acc('3000', 'Cash', 'asset'),
  ]
  it('its own type, active, never itself or one of its own', () => {
    expect(parentChoices(chart, 'liability', '4100').map((a) => a.code)).toEqual(['4000', '4200'])
    expect(parentChoices(chart, 'liability', null).map((a) => a.code)).toEqual(['4000', '4053', '4100', '4200'])
    expect(parentChoices(chart, 'asset', null).map((a) => a.code)).toEqual(['3000'])
  })
})

describe('what an edit writes on the row', () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(o)) f.set(k, v)
    return f
  }
  it('only the fields sent — the rest stay as they are', () => {
    expect(accountRowUpdates(fd({ code: '4100', name: 'X' }), false)).toEqual({ ok: true, updates: { name: 'X' } })
    expect(accountRowUpdates(fd({ code: '4100' }), false)).toEqual({ ok: true, updates: {} })
    expect(accountRowUpdates(fd({ code: '4100', is_active: 'false', parent_code: '' }), false)).toEqual({ ok: true, updates: { is_active: false, parent_code: null } })
  })
  it('refuses an empty name or an unknown cash flow before anything is written; a type change keeps its detach', () => {
    expect(accountRowUpdates(fd({ code: '4100', name: '  ' }), false)).toEqual({ ok: false, error: 'Account name is required' })
    expect(accountRowUpdates(fd({ code: '4100', cash_flow_category: 'sideways' }), false)).toEqual({ ok: false, error: 'Invalid cash flow category' })
    expect(accountRowUpdates(fd({ code: '4100', parent_code: '4000', cash_flow_category: 'operating' }), true)).toEqual({ ok: true, updates: { cash_flow_category: 'operating' } })
  })
})
