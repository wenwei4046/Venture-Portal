import { describe, expect, it } from 'vitest'
import { payFieldsForUpdate } from './staff-form'
import { PAY_MODE_LABEL, asksPay, asksStatutory, changedFields, changesLabel, payModeChoices, payModeFields, payModeOf, type PayMode } from './person-record'

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
  const statutory = { epfCategory: 'A', socsoCategory: 'first', pcbCategory: 'KA1', childrenCount: '0' }
  // The form's fields, read the way updateStaff reads them.
  const saved = (mode: PayMode, amounts = { basicSalary: '2500', allowances: '0', nonStatutoryAllowance: '0' }) => {
    const sent = payModeFields(mode)
    return payFieldsForUpdate({
      fullCommission: sent.full_commission === 'on',
      variablePay: sent.variable_pay === 'on',
      employmentType: sent.employment_type ?? null,
      ...amounts,
      ...statutory,
    })
  }

  it('is the old form’s ticks and select, which the save turns into the same columns', () => {
    expect(payModeFields('full_commission')).toEqual({ full_commission: 'on' })
    expect(payModeFields('variable')).toEqual({ variable_pay: 'on' })
    expect(payModeFields('salaried')).toEqual({ employment_type: 'salaried' })
    expect(payModeFields('commission_eligible')).toEqual({ employment_type: 'commission_eligible' })

    expect(saved('full_commission')).toEqual({ employment_type: 'commission_eligible', basic_salary: 0, allowances: 0, non_statutory_allowance: 0 })
    expect(saved('variable')).toMatchObject({ employment_type: 'variable', basic_salary: 0, allowances: 0, epf_category: 'A' })
    expect(saved('salaried')).toMatchObject({ employment_type: 'salaried', basic_salary: 2500 })
    expect(saved('commission_eligible')).toMatchObject({ employment_type: 'commission_eligible', basic_salary: 2500 })
  })

  it('asks the amounts of a fixed pay only, and statutory of all but fully commission based', () => {
    expect((['full_commission', 'variable', 'salaried', 'commission_eligible'] as const).map(asksPay)).toEqual([false, false, true, true])
    expect((['full_commission', 'variable', 'salaried', 'commission_eligible'] as const).map(asksStatutory)).toEqual([false, true, true, true])
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
})
