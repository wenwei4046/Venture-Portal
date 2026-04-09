import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HOUZS Venture Portal',
  description: 'Internal banking portal for HOUZS Venture Sdn Bhd',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
