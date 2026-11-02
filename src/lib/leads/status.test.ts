import { describe, expect, it } from 'vitest'
import { toneOf } from './status'

describe('toneOf — README §4.1 status colours', () => {
  it('greens what works', () => {
    for (const w of ['In use', 'Receiving', 'Saved', 'Came', 'Closed']) expect(toneOf(w), w).toBe('pos')
  })
  it('ambers what needs a look soon', () => {
    for (const w of ['Ending soon', 'Ends in 3 days', 'Ends in 1 day', 'To review', 'Appointment']) expect(toneOf(w), w).toBe('warn')
  })
  it('greys what is waiting or off', () => {
    for (const w of ['Scheduled', 'Starts 1 Nov', 'Not used', 'Dismissed']) expect(toneOf(w), w).toBe('idle')
  })
  it('rusts what needs attention', () => {
    for (const w of ['Expired', 'Reconnect', 'Not handed yet', 'Needs follow-up']) expect(toneOf(w), w).toBe('rust')
  })
  it('mutes words it does not know', () => {
    expect(toneOf('Something else')).toBe('muted')
  })
})
