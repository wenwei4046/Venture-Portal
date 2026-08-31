import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_SC, Chivo_Mono } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'

// Typography — loaded via next/font for zero-CLS self-hosting.
// 2026-06-24: Instrument Serif retired; Inter is the single UI typeface
// (display + body), Chivo Mono for figures, Noto Sans SC for CJK.

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

// Chivo Mono (2026-06-11): the user wants a completely PLAIN digit 0 — no dot,
// no slash. Verified at the GLYPH level (fontkit contour count: plain zero =
// 2 contours, marked = 3): JetBrains / IBM Plex / Roboto / Overpass / PT etc.
// all bake a mark into the zero; Chivo Mono / Azeret Mono / Courier Prime /
// B612 Mono / Cutive Mono are truly plain. Don't swap without re-running the
// contour check — canvas screenshots can silently test a fallback font.
const chivoMono = Chivo_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

// Noto Sans SC (2026-06-15): the UI is written in Simplified Chinese, so CJK
// runs render in a clean simplified sans that pairs with Inter for body/tables.
// This is wired into every font-family chain in globals.css via --font-cjk, as
// the CJK fallback after the Latin face — Latin glyphs stay on Inter/Instrument/
// Chivo, CJK codepoints fall through to here. (Replaces the unused Noto Serif TC.)
const notoSansSc = Noto_Sans_SC({
  weight: ['400', '500', '700'],
  variable: '--font-cjk',
  display: 'swap',
  preload: false, // CJK fonts are large — defer preload
})

export const metadata: Metadata = {
  title: 'HOUZS Venture Portal',
  description: 'Internal ledger for HOUZS Venture Sdn Bhd',
  // Added to home screen, the portal should open chromeless so the bottom tab
  // bar is the only bar on screen.
  appleWebApp: { capable: true, title: 'Venture', statusBarStyle: 'default' },
}

// `viewportFit: 'cover'` is what makes env(safe-area-inset-bottom) resolve to
// a real number on notched iPhones — without it the bottom tab bar sits under
// the home indicator. `maximumScale` is deliberately left alone: pinch-zoom is
// the only way to read a wide ledger matrix on a phone, and disabling it fails
// WCAG 1.4.4.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'rgb(222 215 202)' },
    { media: '(prefers-color-scheme: dark)', color: 'rgb(48 42 35)' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en-MY"
      className={`${inter.variable} ${chivoMono.variable} ${notoSansSc.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Theme script — runs before paint to prevent FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}else if(window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <NextTopLoader
          color="rgb(204, 90, 46)"
          height={2}
          showSpinner={false}
          shadow="0 0 8px rgb(204 90 46 / 0.35)"
        />
        {children}
      </body>
    </html>
  )
}
