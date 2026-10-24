import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NEW_LETTER_TYPE, pendingLetter, type LetterChoice, type PendingLetter } from '@/lib/documentation/attach'
import AttachLetters from './AttachLetters'

// Letters beside the employment status (2026-10-24 — the user: "我们 select 那个 state 的时候，我要他能够 attach 一个 form
// … 当然包括 letter 的 type"): a row a letter, its type and its file, and "+ Attach a letter" for another.

afterEach(cleanup)

const TYPES: LetterChoice[] = [
  { id: 'offer', name: 'Offer letter', compulsory: true },
  { id: 'cfs', name: 'Contract for Service', compulsory: false },
]
let latest: PendingLetter[] = []

function Host({ start, single = false }: { start: PendingLetter[]; single?: boolean }) {
  const [rows, setRows] = useState(start)
  latest = rows
  return <AttachLetters types={TYPES} rows={rows} onChange={setRows} idPrefix="t" single={single} />
}

describe('AttachLetters', () => {
  it('offers the types, and a new one named there', () => {
    render(<Host start={[pendingLetter('offer')]} />)
    const type = screen.getByLabelText('Letter type')
    expect(type).toHaveValue('offer')
    expect([...(type as HTMLSelectElement).options].map(o => o.text)).toEqual(['Letter type…', 'Offer letter', 'Contract for Service', '+ Add a new letter type…'])
    expect(screen.queryByLabelText('New letter type')).toBeNull()
    fireEvent.change(type, { target: { value: NEW_LETTER_TYPE } })
    fireEvent.change(screen.getByLabelText('New letter type'), { target: { value: 'Agreement letter' } })
    expect(latest[0]).toMatchObject({ typeId: NEW_LETTER_TYPE, newType: 'Agreement letter' })
  })

  it('takes a file, names it in the row, and keeps no form field of its own', () => {
    const { container } = render(<Host start={[pendingLetter('offer')]} />)
    expect(screen.getByText('Choose a file')).toBeInTheDocument()
    const offer = new File(['%PDF'], 'offer-ana.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Letter file'), { target: { files: [offer] } })
    expect(screen.getByText('offer-ana.pdf')).toBeInTheDocument()
    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(latest[0].file).toBe(offer)
    // Nothing of it rides in the form's own data: the file goes straight to the bucket, never through a Server Action.
    expect(container.querySelectorAll('input[name], select[name]')).toHaveLength(0)
  })

  it('adds a letter and takes one away', () => {
    render(<Host start={[pendingLetter('offer')]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Attach a letter' }))
    expect(screen.getByLabelText('Letter type 2')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Remove letter 1' }))
    expect(latest).toHaveLength(1)
    expect(latest[0].typeId).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Remove letter' }))
    expect(latest).toHaveLength(0)
    expect(screen.getByRole('button', { name: '+ Attach a letter' })).toBeInTheDocument()
  })

  it('single: one letter, always there — Renew’s new contract', () => {
    render(<Host start={[pendingLetter('cfs')]} single />)
    expect(screen.getByLabelText('Letter type')).toHaveValue('cfs')
    expect(screen.queryByRole('button', { name: '+ Attach a letter' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
  })
})
