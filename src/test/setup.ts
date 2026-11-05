// Vitest setup — loaded before every test file.
// Extends expect() with jest-dom matchers (toBeInTheDocument, etc.)
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Lead View's face comes from next/font, which only the Next build provides (every test that draws PortalFrame
// reaches LeadShell).
vi.mock('@/components/layout/lead-fonts', () => ({ figtree: { variable: '' } }))
// IR Quote's faces, the same way (components/member/app/irq/irq-fonts.ts).
vi.mock('@/components/member/app/irq/irq-fonts', () => ({ manrope: { variable: '' }, spaceGrotesk: { variable: '' } }))
