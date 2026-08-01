import { describe, it, expect } from 'vitest'
import { parseInfotechStaffGrid } from './infotech-staff'

// Column layout shared by both report variants:
// No | Code | Name | Department | Designation | (blank) | Basic | Join Date |
// Term/Birth | Nric | Bank | Branch | A/C No
const emp = (
  no: number,
  code: string,
  name: string,
  dept: string | null,
  designation = 'EXEC',
  basic = '3000.00',
) => [no, code, name, dept, designation, null, basic, '01/02/2026', null, '900101-01-1234', '7798', null, '1234567890']

describe('parseInfotechStaffGrid — By Department layout', () => {
  const grid = [
    ['Active, Newly Joined & Resigned Employees List (By Department) - [7- 2026]'],
    [],
    ['No', 'Code', 'Employee Name', 'Department', 'Designation', null, 'Basic', 'Join Date'],
    ['Date : 02/07/2026'],
    ['ACTIVE EMPLOYEES'],
    ['Department Code: H-HR', 'Name: H - HUMAN RESOURCES'],
    emp(1, 'HV020', 'RACHAEL', 'H-HR'),
    [],
    ['Department Code: H-MK', 'Name: H - MARKETING'],
    emp(1, 'HV012', 'JOSIAH', 'H-MK'),
    ['NEWLY JOINED EMPLOYEES'],
    ['Department Code: H-MK', 'Name: H - MARKETING'],
    emp(1, 'HV027', 'YEE MUN', 'H-MK'),
    ['RESIGNED EMPLOYEES'],
    ['Department Code: H-HR', 'Name: H - HUMAN RESOURCES'],
    emp(1, 'HV019', 'GONE', 'H-HR'),
  ]

  it('reads dept from section headers (row col 3 agrees) and keeps the dept name', () => {
    const res = parseInfotechStaffGrid(grid)
    expect(res.rows.map((r) => [r.employeeCode, r.deptCode, r.deptName])).toEqual([
      ['HV020', 'H-HR', 'H - HUMAN RESOURCES'],
      ['HV012', 'H-MK', 'H - MARKETING'],
      ['HV027', 'H-MK', 'H - MARKETING'],
    ])
    expect(res.resignedCount).toBe(1)
  })

  it('older files with a blank Department column still fall back to the section header', () => {
    const legacy = grid.map((row) => (typeof row[0] === 'number' ? [...row.slice(0, 3), null, ...row.slice(4)] : row))
    const res = parseInfotechStaffGrid(legacy)
    expect(res.rows.map((r) => r.deptCode)).toEqual(['H-HR', 'H-MK', 'H-MK'])
  })
})

describe('parseInfotechStaffGrid — By Individual layout (no dept section headers)', () => {
  const grid = [
    ['Active, Newly Joined & Resigned Employees List (By Individual) - [8- 2026]'],
    [],
    ['No', 'Code', 'Employee Name', 'Department', 'Designation', null, 'Basic', 'Join Date'],
    ['Date : 01/08/2026'],
    ['Company Name : HOUZS VENTURE HOLDING SDN BHD'],
    ['ACTIVE EMPLOYEES'],
    emp(1, 'HV001', 'LOO WEN WEI', 'H-DRT', 'DIRECTOR', '14400.00'),
    emp(2, 'HV007', 'CHOW WAI MAN', 'H-DO', 'PERSONAL ASSISTANT', '5500.00'),
    emp(3, 'HV008', 'CHEW WEE HO', 'H-FIN', 'ASSISTANT FINANCE MANAGER', '7000.00'),
    ['NEWLY JOINED EMPLOYEES'],
    emp(1, 'HV030', 'NEW GUY', 'H-IT', 'IT EXECUTIVE', '4000.00'),
    ['RESIGNED EMPLOYEES'],
    emp(1, 'HV022', 'TAMMY', 'H-HR', 'HR MANAGER', '6000.00'),
  ]

  it('reads dept code from each row and counts resigned separately', () => {
    const res = parseInfotechStaffGrid(grid)
    expect(res.rows.map((r) => [r.employeeCode, r.deptCode])).toEqual([
      ['HV001', 'H-DRT'],
      ['HV007', 'H-DO'],
      ['HV008', 'H-FIN'],
      ['HV030', 'H-IT'],
    ])
    // No section header → no dept display name, but the code must never be ''.
    expect(res.rows.every((r) => r.deptCode !== '')).toBe(true)
    expect(res.resignedCount).toBe(1)
  })
})
