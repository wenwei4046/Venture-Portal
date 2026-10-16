import { describe, expect, it } from 'vitest'
import { payPatchForUpdate } from './staff-form'
import { BASIC_FROM_COMMISSION, PAY_MODE_LABEL, asksPay, asksStatutory, changedFields, changedFormData, changesLabel, choosesByTick, payModeChoices, payModeFields, payModeLabel, payModeOf, tenureLabel, type PayMode } from './person-record'

// A person's full page, edited where it stands (2026-10-14). The Employment
// Type row is one select now, where the old Edit page had a tick in a
// commission or the Director department and a select elsewhere — so what it
// offers, and what it sends, must be exactly what the save already reads.

const commission = { commission_dept: true, director_dept: false }
const director = { commission_dept: false, director_dept: true }
const office = { commission_dept: false, director_dept: false }

describe('the pay basis a record reads as', () => {
  it('is fully commission based only in a commission department', () => {
    expect(payModeOf({ employment_type: 'commission_eligible', commission_dept: true })).toBe('full_commission')
    expect(payModeOf({ employment_type: 'commission_eligible', commission_dept: false })).toBe('commission_eligible')
    expect(payModeOf({ employment_type: 'variable', commission_dept: false })).toBe('variable')
    expect(payModeOf({ employment_type: 'salaried', commission_dept: true })).toBe('salaried')
  })

  it('reads as the page has always worded it', () => {
    expect(PAY_MODE_LABEL).toEqual({
      full_commission: 'Fully commission based',
      variable: 'Variable pay',
      salaried: 'Salaried',
      commission_eligible: 'Commission-eligible',
    })
  })
})

describe('a basic in a commission department (2026-10-14)', () => {
  // The user, on CHEA HUAN (Revenue): "他要给 basic，然后从他薪水扣" — the
  // payroll pays a Revenue basic out of the commission, so that is what it reads as.
  it('reads as Basic from commission there, and as itself anywhere else', () => {
    expect(payModeLabel('salaried', commission)).toBe(BASIC_FROM_COMMISSION)
    expect(payModeLabel('full_commission', commission)).toBe('Fully commission based')
    expect(payModeLabel('salaried', office)).toBe('Salaried')
    expect(payModeLabel('salaried', director)).toBe('Salaried')
  })

  it('is chosen by one tick in a commission department — any other basis keeps the select', () => {
    expect(choosesByTick(commission, 'full_commission')).toBe(true)
    expect(choosesByTick(commission, 'salaried')).toBe(true)
    expect(choosesByTick(commission, 'variable')).toBe(false)
    expect(choosesByTick(office, 'salaried')).toBe(false)
    expect(choosesByTick(director, 'variable')).toBe(false)
  })
})

describe('the choices a department offers', () => {
  it('are the old form’s: the tick in a commission or the Director department, the select elsewhere', () => {
    expect(payModeChoices(commission, 'full_commission')).toEqual(['full_commission', 'salaried'])
    expect(payModeChoices(director, 'variable')).toEqual(['variable', 'salaried'])
    expect(payModeChoices(office, 'salaried')).toEqual(['salaried', 'commission_eligible'])
  })

  it('always hold what the person has today, so a save that leaves the row leaves the pay basis', () => {
    expect(payModeChoices(director, 'commission_eligible')).toEqual(['commission_eligible', 'variable', 'salaried'])
    expect(payModeChoices(office, 'variable')).toEqual(['variable', 'salaried', 'commission_eligible'])
  })
})

describe('what a pay basis sends', () => {
  // A new basis's fields, read the way updateStaff reads them.
  const saved = (mode: PayMode, more: { basicSalary?: string; epfCategory?: string } = {}) => {
    const sent = payModeFields(mode)
    return payPatchForUpdate({
      mode: sent.full_commission === 'on' ? 'full_commission' : sent.variable_pay === 'on' ? 'variable' : sent.employment_type,
      fixedPayNow: false,
      ...more,
    })
  }

  it('is the old form’s ticks and select, which the save turns into the same columns', () => {
    expect(payModeFields('full_commission')).toEqual({ full_commission: 'on' })
    expect(payModeFields('variable')).toEqual({ variable_pay: 'on' })
    expect(payModeFields('salaried')).toEqual({ employment_type: 'salaried' })
    expect(payModeFields('commission_eligible')).toEqual({ employment_type: 'commission_eligible' })

    expect(saved('full_commission')).toEqual({ employment_type: 'commission_eligible', basic_salary: 0, allowances: 0, non_statutory_allowance: 0 })
    expect(saved('variable', { epfCategory: 'A' })).toEqual({ employment_type: 'variable', basic_salary: 0, allowances: 0, non_statutory_allowance: 0, epf_category: 'A' })
    expect(saved('salaried', { basicSalary: '2500' })).toEqual({ employment_type: 'salaried', basic_salary: 2500 })
    expect(saved('commission_eligible', { basicSalary: '2500' })).toEqual({ employment_type: 'commission_eligible', basic_salary: 2500 })
  })

  it('asks the amounts of a fixed pay only, and statutory of all but fully commission based', () => {
    expect((['full_commission', 'variable', 'salaried', 'commission_eligible'] as const).map(asksPay)).toEqual([false, false, true, true])
    expect((['full_commission', 'variable', 'salaried', 'commission_eligible'] as const).map(asksStatutory)).toEqual([false, true, true, true])
  })
})

describe('what a save sends — only what changed (2026-10-14)', () => {
  // The side note the user passed on: a save that sent the whole page put back
  // the page's old values over a change somebody made since it was opened —
  // a bank account changed at 10, a phone saved at 11, the old account back.
  const page = () => {
    const form = document.createElement('form')
    form.innerHTML = `
      <input name="contact_number" value="012-345 6789">
      <input name="email" value="a@example.com">
      <input name="bank_name" value="Maybank">
      <input name="bank_account_no" value="0012345678">
      <input name="bank_name_2" value="CIMB">
      <input name="bank_account_no_2" value="0098765432">
      <input name="is_epf_exempt" type="checkbox" checked>
      <select name="pcb_category"><option value="KA1" selected>KA1</option><option value="KA2">KA2</option></select>
    `
    return form
  }
  const named = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement

  it('sends the changed field alone', () => {
    const form = page()
    named(form, 'contact_number').value = '012-999 0000'
    const data = changedFormData(form, changedFields(form))
    expect([...data.entries()]).toEqual([['contact_number', '012-999 0000']])
  })

  it('sends a bank account whole — its bank with its number — and never the other one', () => {
    const form = page()
    named(form, 'bank_account_no_2').value = '0011223344'
    const data = changedFormData(form, changedFields(form))
    expect(Object.fromEntries(data.entries())).toEqual({ bank_name_2: 'CIMB', bank_account_no_2: '0011223344' })
  })

  it('sends a tick as on or blank, a choice as its value', () => {
    const form = page()
    named(form, 'is_epf_exempt').checked = false
    ;(form.elements.namedItem('pcb_category') as HTMLSelectElement).value = 'KA2'
    const data = changedFormData(form, changedFields(form))
    expect(Object.fromEntries(data.entries())).toEqual({ is_epf_exempt: '', pcb_category: 'KA2' })
  })

  it('adds the pay basis’s own fields when it changed', () => {
    const form = page()
    const data = changedFormData(form, changedFields(form), payModeFields('salaried'))
    expect(Object.fromEntries(data.entries())).toEqual({ employment_type: 'salaried' })
  })
})

describe('the save bar’s count', () => {
  it('says how many', () => {
    expect([0, 1, 4].map(changesLabel)).toEqual(['No changes', '1 change', '4 changes'])
  })

  it('counts a field only while its value differs from the one it was drawn with', () => {
    const form = document.createElement('form')
    form.innerHTML = `
      <input name="contact_number" value="012-345 6789">
      <input name="hidden_one" type="hidden" value="on">
      <input name="is_epf_exempt" type="checkbox">
      <textarea name="address">Jalan 1</textarea>
      <select name="pcb_category"><option value="KA1" selected>KA1</option><option value="KA2">KA2</option></select>
    `
    expect(changedFields(form)).toEqual(new Set())

    const phone = form.elements.namedItem('contact_number') as HTMLInputElement
    phone.value = '012-999 0000'
    ;(form.elements.namedItem('is_epf_exempt') as HTMLInputElement).checked = true
    ;(form.elements.namedItem('address') as HTMLTextAreaElement).value = 'Jalan 2'
    ;(form.elements.namedItem('pcb_category') as HTMLSelectElement).value = 'KA2'
    ;(form.elements.namedItem('hidden_one') as HTMLInputElement).value = 'off'
    expect([...changedFields(form)].sort()).toEqual(['address', 'contact_number', 'is_epf_exempt', 'pcb_category'])

    // Typed back to what it was: no longer a change.
    phone.value = '012-345 6789'
    expect(changedFields(form).has('contact_number')).toBe(false)
  })

  it('a value the browser cleans up on the way in is no change (an imported email with a stray space)', () => {
    const form = document.createElement('form')
    const email = document.createElement('input')
    email.type = 'email'
    email.name = 'email'
    email.defaultValue = ' test@example.com '
    form.append(email)
    // As the browser holds it: trimmed.
    email.value = 'test@example.com'
    expect(changedFields(form).has('email')).toBe(false)
  })

  it('an address stored with \\r\\n is untouched though the textarea reads it back with \\n (ANTHONY, 2026-10-14)', () => {
    const form = document.createElement('form')
    const area = document.createElement('textarea')
    area.name = 'address'
    area.defaultValue = '24, JLN JANGGUS\r\n\r\nMERTAJAM'
    form.append(area)
    area.value = '24, JLN JANGGUS\n\nMERTAJAM'
    expect(changedFields(form).has('address')).toBe(false)
    area.value = '24, JLN JANGGUS\n\nBUKIT MERTAJAM'
    expect(changedFields(form).has('address')).toBe(true)
  })
})

// A person's card reads how long they have been with the company beside their
// hire date (2026-10-16, the 360) — counted on the office's calendar days.
describe('tenure', () => {
  it('counts whole months, then years and months', () => {
    expect(tenureLabel('2026-01-05', '2026-10-16')).toBe('9 months')
    expect(tenureLabel('2026-01-17', '2026-10-16')).toBe('8 months')
    expect(tenureLabel('2025-10-16', '2026-10-16')).toBe('1 year')
    expect(tenureLabel('2023-07-01', '2026-10-16')).toBe('3 years 3 months')
    expect(tenureLabel('2025-09-16', '2026-10-16')).toBe('1 year 1 month')
  })

  it('says under a month in their first weeks, and nothing before they start or without a date', () => {
    expect(tenureLabel('2026-10-01', '2026-10-16')).toBe('Under a month')
    expect(tenureLabel('2026-10-16', '2026-10-16')).toBe('Under a month')
    expect(tenureLabel('2026-11-01', '2026-10-16')).toBeNull()
    expect(tenureLabel(null, '2026-10-16')).toBeNull()
  })
})
