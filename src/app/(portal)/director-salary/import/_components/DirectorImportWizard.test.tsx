import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import DirectorImportWizard from './DirectorImportWizard'

/**
 * The import page shares the ?period= picker with Director Salary. The rows
 * and preview the wizard holds were parsed and previewed FOR a month; if the
 * picker moves while a preview is up, Apply used to write those rows under
 * the new month. The wizard now remounts per period, dropping the preview.
 */
const { parseInfotechPayroll, previewDirectorPayrollImport, applyDirectorPayrollImport, refresh } =
  vi.hoisted(() => ({
    parseInfotechPayroll: vi.fn(),
    previewDirectorPayrollImport: vi.fn(),
    applyDirectorPayrollImport: vi
      .fn()
      .mockResolvedValue({ created: 0, updated: 0, skipped: 0, failed: 0 }),
    refresh: vi.fn(),
  }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/import/infotech-payroll', () => ({ parseInfotechPayroll }))
vi.mock('../../payroll-actions', () => ({
  previewDirectorPayrollImport,
  applyDirectorPayrollImport,
}))

function upload() {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input on the upload stage')
  const file = new File([new Uint8Array([1, 2, 3])], 'directors-sep.xlsx')
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  parseInfotechPayroll.mockReturnValue({
    rows: [{ name: 'Alice' }],
    grossSum: 14400,
    sheetName: 'Sep 2026',
    sheetPeriodLabel: 'September 2026',
    periodMismatch: false,
  })
  previewDirectorPayrollImport.mockResolvedValue({
    toCreate: [{ rowIndex: 1, name: 'Alice', directorCode: 'D1', gross: 14400, net: 14400 }],
    toUpdate: [],
    skipped: [],
  })
})

describe('DirectorImportWizard across periods', () => {
  it('forgets a file previewed for one month when the period changes', async () => {
    const { rerender } = render(<DirectorImportWizard period="2026-09-01" />)
    upload()
    expect(await screen.findByRole('button', { name: 'Import 1 row from file' })).toBeVisible()
    expect(previewDirectorPayrollImport).toHaveBeenCalledWith(expect.any(Array), '2026-09-01')

    rerender(<DirectorImportWizard period="2026-08-01" />)
    expect(screen.getByText('Upload InfoTech export')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Import/ })).toBeNull()
  })
})
