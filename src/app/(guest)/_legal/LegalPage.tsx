import Link from 'next/link'

/**
 * The public legal pages Meta's app review needs (2026-10-12): the privacy policy and the data deletion
 * instructions for the CRM's Messenger / WhatsApp channels. Public, no sign-in, no data read — plain text only.
 */
export const COMPANY = 'Houzs Century Sdn Bhd'
export const BRANDS = 'The Conts Property Management and Dream Crafter Design'
export const CONTACT_EMAIL = 'kaiyeeloke@gmail.com'
export const EFFECTIVE = '12 October 2026'

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <article className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="text-xs uppercase tracking-[0.12em] text-graphite">{COMPANY}</p>
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-graphite">Effective {EFFECTIVE}</p>
        <div className="mt-8 space-y-6">{children}</div>
        <nav className="mt-12 flex gap-5 border-t border-hairline pt-5 text-sm">
          <Link className="text-accent underline" href="/privacy">Privacy policy</Link>
          <Link className="text-accent underline" href="/data-deletion">Data deletion</Link>
        </nav>
      </article>
    </main>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export const Mail = () => <a className="text-accent underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
