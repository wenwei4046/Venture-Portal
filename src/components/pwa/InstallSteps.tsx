import type { InstallPath } from '@/lib/pwa/install'

/** iOS's Share glyph — the box with the arrow out of it. */
export function ShareGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Share"
      role="img"
      style={{ display: 'inline-block', verticalAlign: '-3px' }}
    >
      <path d="M12 3v12M8 7l4-4 4 4M7 11H5v10h14V11h-2" />
    </svg>
  )
}

// Tailwind's preflight strips list markers, and the numbers ARE the steps.
const list = { listStyle: 'decimal', margin: 0, paddingLeft: 20, display: 'grid', gap: 6 } as const

/**
 * The words for the two install paths a page cannot drive itself. Shared by
 * the login card and the member Profile, which style it their own way.
 */
export default function InstallSteps({
  path,
  className,
}: {
  path: Extract<InstallPath, 'ios' | 'in-app'>
  className?: string
}) {
  if (path === 'in-app') {
    return (
      <ol className={className} style={list}>
        <li>
          This page is open inside another app (WhatsApp, Facebook…), which cannot install it.
        </li>
        <li>
          Tap the <strong>⋯</strong> menu and choose <strong>Open in browser</strong> (Chrome or
          Safari).
        </li>
        <li>Then install it from there.</li>
      </ol>
    )
  }
  return (
    <ol className={className} style={list}>
      <li>
        Tap <ShareGlyph /> <strong>Share</strong> in the browser toolbar.
      </li>
      <li>
        Scroll down and choose <strong>Add to Home Screen</strong>.
      </li>
      <li>
        Tap <strong>Add</strong>. Venture opens from your home screen, full screen, like any app.
      </li>
    </ol>
  )
}
