'use client'

import { useRouter } from 'next/navigation'
import ItSupport from '@/components/it-support/ItSupport'
import type { ItSupportInitial } from '@/lib/it-requests/preload'
import AppScreen from './AppScreen'
import { canStepBack, setIntent } from './nav'
import s from './fin-app.module.css'

/** Profile's own requests, with the Finance app's pushed-screen navigation. */
export default function ItSupportApp({ initialId, readOnly = false, ...initial }: { initialId?: string; readOnly?: boolean } & Partial<ItSupportInitial>) {
  const router = useRouter()
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app/profile')
  }
  return (
    <AppScreen screenKey="/fin-app/it-support" head={{ kind: 'back', title: 'IT support', backLabel: 'Profile', onBack: leave }}>
      {/* The shared white list in the app's gutter, on the sheet's palette — light whatever the phone's theme. */}
      <div className={`sheet-theme ${s.itSupport}`}>
        <ItSupport app="finance" initialId={initialId} readOnly={readOnly} {...initial} />
      </div>
    </AppScreen>
  )
}
