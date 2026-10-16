'use client'

import { useState } from 'react'
import s from './people.module.css'

const EYE = 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
const EYE_OFF = 'm3 3 18 18M10 5c7-1 12 7 12 7s-2 4-5 5M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3-.3 4-1'

/** The sign-in page's eye (MemberLoginForm), as a button that shows or hides a password. */
export function EyeButton({ shown, onToggle, className }: { shown: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={className ?? s.eye}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      onClick={onToggle}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d={shown ? EYE_OFF : EYE} />
      </svg>
    </button>
  )
}

/**
 * A password handed back to pass on (2026-10-16, the user: "password 本身是
 * hidden 的，旁边有一个眼睛图标，按开才会显示"): dots until the eye is pressed,
 * and Copy, which copies it either way.
 */
export default function SecretText({ value }: { value: string }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <span className={s.secret}>
      <span className={s.secretValue} aria-label={shown ? undefined : 'Password hidden'}>
        {shown ? value : '•'.repeat(Math.max(8, value.length))}
      </span>
      <EyeButton shown={shown} onToggle={() => setShown(v => !v)} />
      <button
        type="button"
        className={s.secretCopy}
        // No clipboard (an http address, a refusal): the password shows, to be copied by hand.
        onClick={() => void copyText(value).then(ok => (ok ? setCopied(true) : setShown(true)))}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}

/** Copies, and says whether it could. */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
