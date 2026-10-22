import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG, padPicture, sign } from '@/test/signature'
import SignaturePad from './SignaturePad'

// The signature pad (2026-10-20 — the user: "签完之后再来点那个 Acknowledge button"): a stroke that leaves enough ink
// hands the picture back; a tap does not; Clear hands back null; a pad turned off draws nothing.

beforeEach(() => {
  padPicture()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Harness({ onChange, disabled = false }: { onChange: (v: string | null) => void; disabled?: boolean }) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <>
      <SignaturePad value={value} disabled={disabled} onChange={v => { setValue(v); onChange(v) }} />
      <output data-testid="value">{value ? 'signed' : 'empty'}</output>
    </>
  )
}

describe('SignaturePad', () => {
  it('a stroke with enough ink hands the picture back as a PNG data URL', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.getByText('Sign here')).toBeInTheDocument()
    sign(screen.getByLabelText('Sign here'))
    expect(onChange).toHaveBeenLastCalledWith(PNG)
    expect(screen.getByTestId('value')).toHaveTextContent('signed')
    expect(screen.queryByText('Sign here')).toBeNull()
  })

  it('a tap is not a signature', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    sign(screen.getByLabelText('Sign here'), { x: 50, y: 50 }, { x: 52, y: 51 })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('value')).toHaveTextContent('empty')
    // …but it is ink: Clear is offered, and a longer stroke after it makes one.
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    sign(screen.getByLabelText('Sign here'))
    expect(onChange).toHaveBeenLastCalledWith(PNG)
  })

  it('Clear hands back nothing and the hint comes back', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    sign(screen.getByLabelText('Sign here'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByTestId('value')).toHaveTextContent('empty')
    expect(screen.getByText('Sign here')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('a pad turned off draws nothing', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} disabled />)
    sign(screen.getByLabelText('Sign here'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a picture that is not a PNG is never handed back', () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue('data:,')
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    sign(screen.getByLabelText('Sign here'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a signature handed in shows as signed; taken back to null, the pad is clear again', () => {
    const { rerender } = render(<SignaturePad value={PNG} onChange={() => {}} />)
    expect(screen.queryByText('Sign here')).toBeNull()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    rerender(<SignaturePad value={null} onChange={() => {}} />)
    expect(screen.getByText('Sign here')).toBeInTheDocument()
  })
})
