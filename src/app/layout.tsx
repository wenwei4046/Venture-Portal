import type { Metadata } from 'next'
import { IBM_Plex_Mono, Instrument_Serif, Inter, Noto_Serif_TC } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'

// DESIGN.md v2.0 typography — loaded via next/font for zero-CLS self-hosting

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

// IBM Plex Mono replaced JetBrains Mono 2026-06-11: JetBrains Mono's digit 0
// has a baked-in centre dot (a glyph, not a togglable font feature) and the
// user wants plain zeros across every number in the system.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

const notoSerifTc = Noto_Serif_TC({
  weight: ['400', '600', '700'],
  variable: '--font-cjk',
  display: 'swap',
  preload: false, // CJK fonts are large — defer preload
})

export const metadata: Metadata = {
  title: 'HOUZS Venture Portal',
  description: 'Internal ledger for HOUZS Venture Sdn Bhd',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en-MY"
      className={`${instrumentSerif.variable} ${inter.variable} ${plexMono.variable} ${notoSerifTc.variable}`}
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
