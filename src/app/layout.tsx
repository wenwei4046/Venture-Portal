import type { Metadata, Viewport } from 'next'
import { Inter, Newsreader, Noto_Sans_SC, Chivo_Mono } from 'next/font/google'
import NavProgress from '@/components/layout/NavProgress'
import PwaRegister from '@/components/pwa/PwaRegister'
import SafeAreaMemory from '@/components/pwa/SafeAreaMemory'
import UpdatePrompt from '@/components/pwa/UpdatePrompt'
import { SAFE_BOTTOM_BOOT } from '@/lib/safe-area'
import './globals.css'

// Typography — loaded via next/font for zero-CLS self-hosting.
// Inter for body and headline amounts; Chivo Mono for dense table figures.
// Page titles are Newsreader (Georgia behind it), with Noto Sans SC for CJK.
// The Revenue app's display face, Inter Tight, loads with the app's own layout
// (components/member/app/fonts.ts) — the portal never downloads it.

// Newsreader (2026-10-14, the HOUZS Venture Design System): the one serif in
// the product — every portal page title, the HR kit's PageHead, the Product
// List's headings, the sign-in page's lines. Variable on opsz, so the 36px
// title gets the display cut by itself. Print documents keep Georgia.
const newsreader = Newsreader({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-newsreader',
  display: 'swap',
})

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
  // It installs as an app too — public/manifest.webmanifest (linked in <head>
  // below), public/sw.js, PwaRegister.
  applicationName: 'HOUZS Venture',
  appleWebApp: { capable: true, title: 'Venture', statusBarStyle: 'default' },
  // iOS turns long digit runs into phone links — an IC, an account number or
  // an amount in a ledger is not a phone number.
  formatDetection: { telephone: false },
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
      className={`${inter.variable} ${newsreader.variable} ${chivoMono.variable} ${notoSansSc.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* The installable app (public/manifest.webmanifest — ONE app for
            everybody: start_url `/` already sends a Revenue member to /member
            and everyone else to /dashboard). Written here by hand, not as
            app/manifest.ts: Next streams metadata links into <body> for
            browsers, and Chrome only reads a manifest link from <head> — the
            portal was not installable that way. Icons: tools/generate-pwa-icons.mjs. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Theme script — runs before paint to prevent FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}else if(window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}})()`,
          }}
        />
        {/* The bottom bars' floor before the first paint — a reload can lose
            the phone's navigation-bar inset (lib/safe-area.ts). */}
        <script dangerouslySetInnerHTML={{ __html: SAFE_BOTTOM_BOOT }} />
      </head>
      <body suppressHydrationWarning>
        <PwaRegister />
        <SafeAreaMemory />
        {children}
        {/* The progress line along the top edge, for every surface. It
            replaced nextjs-toploader (2026-09-26), which watched link clicks
            and the address bar: it finished the moment a loading skeleton
            committed the new URL, so it stopped while the page was still
            coming, never saw a router.push, and still wore the rust accent
            the palette dropped in August. After {children} so a skeleton's
            count is in before the line decides a navigation is over. */}
        <NavProgress />
        {/* "A new version is ready" — an app left open across a release
            (installed apps are resumed, not reloaded) hears about it here. */}
        <UpdatePrompt />
      </body>
    </html>
  )
}
