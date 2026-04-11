import type { Metadata } from 'next'
import { Instrument_Serif, Inter, JetBrains_Mono, Noto_Serif_TC } from 'next/font/google'
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

const jetbrainsMono = JetBrains_Mono({
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
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable} ${notoSerifTc.variable}`}
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
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
