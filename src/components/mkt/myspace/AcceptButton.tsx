'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { acceptMktStage } from '@/lib/marketing/actions'
import s from './myspace.module.css'

/** My Space's Accept (the handoff: accept on the tile, then the task opens) — the stage is the viewer's from now on. */
export default function AcceptButton({ project, href }: { project: string; href: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <button
      type="button"
      className={s.act}
      disabled={pending}
      title={error ?? undefined}
      onClick={() =>
        start(async () => {
          setError(null)
          const r = await acceptMktStage(project)
          if (!r.ok) {
            setError(r.reason)
            return
          }
          router.push(href)
        })
      }
    >
      {pending ? 'Accepting…' : error ? 'Try again' : 'Accept'}
    </button>
  )
}
