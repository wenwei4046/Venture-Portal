'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'
import { getRoleLabel } from '@/lib/roles'

export default function TopBar({ user }: { user: User }) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
      <div className="text-sm text-gray-500">HOUZS Venture Sdn Bhd</div>

      <div className="flex items-center gap-4">
        <div className="text-sm text-right">
          <span className="font-medium text-gray-800">{user.name}</span>
          <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
            {getRoleLabel(user.role)}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
