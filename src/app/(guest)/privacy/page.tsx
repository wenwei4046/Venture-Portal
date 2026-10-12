import type { Metadata } from 'next'
import Link from 'next/link'
import { BRANDS, COMPANY, LegalPage, Mail, Section } from '../_legal/LegalPage'

export const metadata: Metadata = { title: `Privacy policy · ${COMPANY}` }

/** Public — Meta's app review asks for it (2026-10-12). Never requirePage: there is no account here. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains how {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), a company in Malaysia, handles the personal
        data of people who contact us through our Facebook Pages — {BRANDS} — on Messenger, and through our WhatsApp
        Business number. We follow Malaysia&rsquo;s Personal Data Protection Act 2010.
      </p>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name and profile name as Messenger or WhatsApp shares it with us, and your Messenger ID or WhatsApp phone number.</li>
          <li>The messages, photos and files you send us, and our replies.</li>
          <li>If you reached us from one of our ads, which ad it was.</li>
          <li>Details you choose to give us about your enquiry, such as your property, unit size, location, requirements and budget.</li>
          <li>Showroom visits you book with us: the date, time and showroom.</li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To reply to your enquiry and follow up on it.</li>
          <li>To book, confirm and remind you of a showroom visit.</li>
          <li>To pass your enquiry to the member of our sales team who looks after it.</li>
          <li>To understand which of our ads bring enquiries.</li>
        </ul>
        <p>
          We only message you after you have messaged us, within the time Messenger and WhatsApp allow. We do not sell your
          data, and we do not use it for anything unrelated to your enquiry.
        </p>
      </Section>

      <Section title="Who handles it">
        <p>
          Only our own staff see your conversation. Our service providers process it for us under contract: Meta
          (Messenger and WhatsApp), Supabase (our database, stored in Singapore) and Vercel (the web hosting of our
          internal system). We share data with a public authority only when the law requires it.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your conversation and enquiry details for as long as we are helping you and for up to 24 months after
          our last conversation, unless the law requires us to keep them longer. You can ask us to delete them sooner.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You may ask to see the personal data we hold about you, to correct it, or to delete it, and you may ask us to stop
          contacting you. To delete your data, follow the steps on our{' '}
          <Link className="text-accent underline" href="/data-deletion">data deletion</Link> page.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Your data is stored in access-controlled systems. Each member of our sales team sees only the enquiries given to
          them and their team, and every change is recorded.
        </p>
      </Section>

      <Section title="Changes">
        <p>If we change this policy we will update this page and its effective date.</p>
      </Section>

      <Section title="Contact us">
        <p>
          {COMPANY} — email <Mail />, or send us a message on Messenger or WhatsApp.
        </p>
      </Section>
    </LegalPage>
  )
}
