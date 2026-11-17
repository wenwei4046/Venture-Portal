import { describe, expect, it } from 'vitest'
import { amountOf, blankVisit, phoneText, suggestions, visitPayload, visitProblem, visitsCsv, type LeadVisit } from './visits'

const v = (o: Partial<LeadVisit>): LeadVisit => ({
  id: '1', outletId: 'kj', visitOn: '2026-11-03', name: 'Lucy', phone: '0122800377', salesPerson: 'Mayson', brand: 'The Couch Factory',
  source: 'facebook', products: '', remarks: '', priceOffered: null, status: 'follow_up', purchaseOn: null, orderNo: '', items: '', sales: null,
  repeat: false, purchaseReason: '', purchaseRemarks: '', contactId: null, createdBy: '', updatedBy: '', updatedAt: '', ...o,
})

describe('visits', () => {
  it('reads an amount as typed on the sheet', () => {
    expect([amountOf('RM2,490.00'), amountOf(' 2490 '), amountOf(''), amountOf('abc'), amountOf('1.234')]).toEqual(['2490.00', '2490', '', null, null])
  })
  it('asks a closed sale for its day and amount', () => {
    const d = { ...blankVisit('kj', '2026-11-03'), name: 'Lucy' }
    expect(visitProblem(d)).toBe(null)
    expect(visitProblem({ ...d, name: '' })).toMatch(/name or a phone/)
    expect(visitProblem({ ...d, status: 'close_sales' })).toMatch(/purchase day/)
    expect(visitProblem({ ...d, status: 'close_sales', purchaseOn: '2026-11-04', sales: '0' })).toMatch(/amount/)
    expect(visitProblem({ ...d, status: 'close_sales', purchaseOn: '2026-11-04', sales: 'RM2,490' })).toBe(null)
    expect(visitProblem({ ...d, priceOffered: 'soon' })).toMatch(/Price offered/)
  })
  it('sends a purchase only on a closed sale', () => {
    const d = { ...blankVisit('kj', '2026-11-03'), name: 'x', purchaseOn: '2026-11-04', sales: '99' }
    expect([visitPayload(d).purchaseOn, visitPayload(d).sales]).toEqual(['', ''])
    expect(visitPayload({ ...d, status: 'close_sales', sales: 'RM1,499.00' }).sales).toBe('1499.00')
  })
  it('shows a phone as Lead View does', () => {
    expect([phoneText('0122800377'), phoneText('01128533393'), phoneText('6512')]).toEqual(['012-280 0377', '011-2853 3393', '6512'])
  })
  it('suggests an outlet’s own names, most used first', () => {
    const list = [v({ salesPerson: 'Edwin' }), v({ salesPerson: 'Mayson' }), v({ salesPerson: 'Mayson' }), v({ outletId: 'pj', salesPerson: 'Juno' })]
    expect(suggestions(list, 'salesPerson', 'kj')).toEqual(['Mayson', 'Edwin'])
  })
  it('writes the sheet’s columns', () => {
    const csv = visitsCsv([v({ remarks: 'Sunday, will come back', status: 'close_sales', sales: 2490 })], () => 'KJ')
    expect(csv.split('\n')[0].startsWith('Date,Outlet,Name,Phone No.')).toBe(true)
    expect(csv.split('\n')[1]).toContain('"Sunday, will come back"')
    expect(csv.split('\n')[1]).toContain('Close sales')
  })
})
