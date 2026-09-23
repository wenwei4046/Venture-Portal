'use client'

import { useId, useState } from 'react'
import s from '@/components/member/MemberLogin.module.css'
import InstallSteps from './InstallSteps'
import { useInstallApp } from './install-store'

/**
 * "Get the app" on the sign-in screen — the first page a phone user sees.
 * Renders nothing on a desktop browser, or when already opened as the app.
 */
export default function LoginInstallCard() {
  const { path, install } = useInstallApp()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (path !== 'prompt' && path !== 'ios' && path !== 'in-app') return null

  const guided = path !== 'prompt'
  return (
    <div className={s.installCard}>
      <button
        type="button"
        className={s.installButton}
        aria-expanded={guided ? open : undefined}
        aria-controls={guided ? panelId : undefined}
        onClick={() => (guided ? setOpen((v) => !v) : void install())}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm4 5v7m-3-3 3 3 3-3m-4 7h2" />
        </svg>
        Install the Venture app
      </button>
      {guided && open && (
        <div id={panelId} className={s.helpPanel}>
          <InstallSteps path={path} className={s.installSteps} />
        </div>
      )}
    </div>
  )
}
