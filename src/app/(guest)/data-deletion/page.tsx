import type { Metadata } from 'next'
import Link from 'next/link'
import { BRANDS, COMPANY, LegalPage, Mail, Section } from '../_legal/LegalPage'

export const metadata: Metadata = { title: `Data deletion · ${COMPANY}` }

/** Public — Meta's app review asks for user data deletion instructions (2026-10-12). Never requirePage. */
export default function DataDeletionPage() {
  return (
    <LegalPage title="Delete your data">
      <p>
        If you have contacted {BRANDS} on Messenger, or our WhatsApp Business number, you can ask {COMPANY} to delete
        the personal data we hold about you.
      </p>

      <Section title="How to ask">
        <ul className="list-disc space-y-1 pl-5">
          <li>Send &ldquo;Delete my data&rdquo; to us in the same Messenger or WhatsApp conversation, or</li>
          <li>Email <Mail /> with the name you use on Messenger or your WhatsApp phone number, and the Page you contacted.</li>
        </ul>
      </Section>

      <Section title="What we delete">
        <p>
          Your conversation with us, the messages and files you sent, your enquiry details and any showroom visits you
          booked. We may keep a record that a deletion was made, without its content, and anything the law requires us to
          keep.
        </p>
      </Section>

      <Section title="When">
        <p>
          We confirm your request and delete your data within 30 days. If you message us again later, a new conversation
          starts.
        </p>
      </Section>

      <p>
        Read our <Link className="text-accent underline" href="/privacy">privacy policy</Link> for how we handle your data.
      </p>
    </LegalPage>
  )
}
