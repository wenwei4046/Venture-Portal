import type { VoicePalette } from '@/components/member/crm/shared/voice-note'

/** Lead View's voice-note colours (handoff v3 § 1 — the prototype's values, through the --lv tokens). */
const VOICE_BASE = {
  ink: 'rgb(var(--lv-fg-2))', dim: 'rgb(var(--lv-fg-2) / 0.3)', ring: 'rgb(var(--lv-fg-2) / 0.18)',
  tipBg: 'rgb(var(--lv-fg))', font: 'var(--lv-font)', speedBg: 'rgb(var(--lv-fg-3))', avatarInk: 'rgb(var(--lv-fg-3))',
}
export const VOICE_THEIRS: VoicePalette = { ...VOICE_BASE, avatarBg: 'rgb(var(--lv-page))', badgeStroke: 'rgb(var(--lv-surface))' }
export const VOICE_OURS: VoicePalette = { ...VOICE_BASE, avatarBg: 'rgb(var(--lv-sel-edge))', badgeStroke: 'rgb(var(--lv-sel))' }
