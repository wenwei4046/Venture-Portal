import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import AmountInput from './AmountInput'

function setup(props: Partial<React.ComponentProps<typeof AmountInput>> = {}) {
  const onChange = vi.fn()
  const utils = render(
    <AmountInput value={3000} onChange={onChange} aria-label="Basic salary" {...props} />,
  )
  const input = utils.getByLabelText(props['aria-label'] ?? 'Basic salary') as HTMLInputElement
  return { ...utils, input, onChange }
}

describe('AmountInput', () => {
  it('shows the figure formatted like the computed cells beside it', () => {
    const { input } = setup()
    expect(input.value).toBe('3,000.00')
    expect(input.getAttribute('inputmode')).toBe('decimal')
  })

  it('reports what is typed as a number and keeps the raw text while focused', () => {
    const { input, onChange } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '3200' } })
    expect(onChange).toHaveBeenLastCalledWith(3200)
    expect(input.value).toBe('3200')
  })

  it('ignores letters and negatives instead of zeroing the figure', () => {
    const { input, onChange } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('formats again on blur, from the value the parent holds', () => {
    const { input, rerender, onChange } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '3200' } })
    rerender(<AmountInput value={3200} onChange={onChange} aria-label="Basic salary" />)
    fireEvent.blur(input)
    expect(input.value).toBe('3,200.00')
  })

  it('re-syncs when the other view of the same figure changes it', () => {
    const { input, rerender, onChange } = setup()
    rerender(<AmountInput value={120} onChange={onChange} aria-label="Basic salary" />)
    expect(input.value).toBe('120.00')
  })

  it('fades a zero and tints an unsaved change', () => {
    const { input, rerender, onChange } = setup({ value: 0 })
    expect(input.classList.contains('zero')).toBe(true)
    rerender(<AmountInput value={0} onChange={onChange} dirty aria-label="Basic salary" />)
    expect(input.classList.contains('zero')).toBe(false)
    expect(input.classList.contains('dirty')).toBe(true)
  })

  it('uses one decimal for days and hours', () => {
    const { input } = setup({ value: 1, decimals: 1, 'aria-label': 'Unpaid leave days' })
    expect(input.value).toBe('1.0')
  })
})
