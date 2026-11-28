'use client'

import { Sheet, TITLE, lv } from './parts'

/** Profile › Sign out asks first (the prototype: "Sign out asks first"); this device's session only. */
export default function SignOutSheet({ open, busy, onCancel, onSignOut }: { open: boolean; busy: boolean; onCancel: () => void; onSignOut: () => void }) {
  return (
    <Sheet open={open} label="Sign out" radius={26}>
      <span aria-hidden="true" style={{ alignSelf: 'center', flex: 'none', width: 40, height: 5, borderRadius: 3, background: lv('line') }} />
      <h2 style={{ ...TITLE, margin: 0, fontSize: 22, color: lv('fg') }}>Sign out?</h2>
      <span style={{ fontSize: 14, lineHeight: 1.45, color: lv('fg-3') }}>You will need to sign in again to open Lead View.</span>
      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={busy}
          style={{ flex: 1, height: 50, borderRadius: 25, border: `1px solid ${lv('line')}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Cancel</button>
        <button type="button" onClick={onSignOut} disabled={busy}
          style={{ flex: 1.6, height: 50, borderRadius: 25, background: lv('accent'), color: lv('surface'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </Sheet>
  )
}
