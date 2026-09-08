import { describe, it, expect } from 'vitest'
import { boundaryRefusal, type BoundaryPerson } from './hierarchy-boundary'

const rev = (name: string): BoundaryPerson => ({
  name,
  commissionDept: true,
  department: 'Revenue Department',
})
const fin = (name: string): BoundaryPerson => ({
  name,
  commissionDept: false,
  department: 'Finance',
})

describe('boundaryRefusal', () => {
  it('allows a line that stays inside the commission department', () => {
    expect(boundaryRefusal(rev('Ali'), rev('Ben'))).toBeNull()
  })

  it('allows a line between two departments that are not paid by commission', () => {
    // The old freedom, untouched. There is no second graph over Finance and HR,
    // so there is nothing for a rule here to keep in step.
    expect(boundaryRefusal(fin('Farah'), { name: 'Hana', commissionDept: false, department: 'HR' }))
      .toBeNull()
  })

  it('refuses a commission-department person reporting outwards', () => {
    const note = boundaryRefusal(rev('Ali'), fin('Farah'))
    expect(note).toContain('Ali')
    expect(note).toContain('Farah')
    expect(note).toContain('Revenue Department')
    expect(note).toContain('Finance')
    // The refusal has to carry the way out, or it sends somebody hunting for a
    // rule nobody wrote down.
    expect(note).toContain('move Farah into it first')
  })

  it('refuses an outsider reporting into the commission department', () => {
    // Symmetric on purpose: this direction breaks the same equality from the
    // other side — the manager grows a report the commission chart cannot show.
    const note = boundaryRefusal(fin('Farah'), rev('Ben'))
    expect(note).toContain('Farah')
    expect(note).toContain('Ben')
    expect(note).toContain('Revenue Department')
  })

  it('allows a detach, including out of the commission department', () => {
    // The top of a commission department reporting to nobody is the shape the
    // user asked for, not a boundary crossing.
    expect(boundaryRefusal(rev('Ben'), null)).toBeNull()
    expect(boundaryRefusal(fin('Farah'), null)).toBeNull()
  })

  it('still reads as English when somebody has no department', () => {
    const note = boundaryRefusal(rev('Ali'), {
      name: 'Nobody',
      commissionDept: false,
      department: null,
    })
    expect(note).toContain('no department')
    expect(note).not.toContain('null')
  })
})
