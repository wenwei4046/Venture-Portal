'use client'

import { useEffect, useState } from 'react'
import { loadMalaysia, type PostcodeData } from '@/lib/address/malaysia'

/**
 * Malaysia's postcode list for an address being edited (2026-10-20): fetched once, on the first address field drawn —
 * its own chunk, so no page carries it until somebody edits an address. `failed` when it could not be fetched.
 */
export function useMalaysia(): { data: PostcodeData | null; failed: boolean } {
  const [state, setState] = useState<{ data: PostcodeData | null; failed: boolean }>({ data: null, failed: false })
  useEffect(() => {
    let live = true
    loadMalaysia().then(
      data => live && setState({ data, failed: false }),
      () => live && setState({ data: null, failed: true }),
    )
    return () => {
      live = false
    }
  }, [])
  return state
}
