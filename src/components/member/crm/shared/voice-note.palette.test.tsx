import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { VoiceNote, type VoicePalette } from './voice-note'

// Lead View draws the CRM's voice note in its own colours (docs/design_handoff_lead_view_v3 › 1. Voice notes).
const P: VoicePalette = {
  ink: 'rgb(1, 2, 3)', dim: 'rgba(1, 2, 3, 0.3)', ring: 'rgba(1, 2, 3, 0.18)', tipBg: 'rgb(9, 9, 9)', font: 'Figtree',
  speedBg: 'rgb(4, 5, 6)', avatarBg: 'rgb(7, 8, 9)', avatarInk: 'rgb(4, 5, 6)', badgeStroke: 'rgb(255, 255, 255)',
}

describe('VoiceNote with a palette', () => {
  it('draws its controls, bars, picture and badge in the palette', () => {
    const { container, getByLabelText } = render(<VoiceNote src="https://example.test/a.mp4" palette={P} />)
    expect(getByLabelText('Play').style.color).toBe('rgb(1, 2, 3)')
    const bars = container.querySelectorAll('[data-voice-track] > span')
    expect((bars[0] as HTMLElement).style.background).toBe('rgba(1, 2, 3, 0.3)')
    const pic = getByLabelText('Play').parentElement!.lastElementChild as HTMLElement
    expect(pic.style.background).toBe('rgb(7, 8, 9)')
    expect(pic.style.color).toBe('rgb(4, 5, 6)')
    expect(container.querySelector('svg[stroke-width="1.2"]')!.getAttribute('stroke')).toBe('rgb(255, 255, 255)')
  })

  it('hands a load failure to the caller', () => {
    const onError = vi.fn()
    const { container } = render(<VoiceNote src="https://example.test/b.mp4" palette={P} onError={onError} />)
    fireEvent.error(container.querySelector('audio')!)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('keeps the CRM look with no palette', () => {
    const { getByLabelText } = render(<VoiceNote src="https://example.test/c.mp4" />)
    expect(getByLabelText('Play').style.color).toBe('var(--crm-muted)')
  })
})
