'use client'

import { useState } from 'react'

// Click-to-reveal balance. Hidden (masked) by default so the figure isn't shown
// at a glance — click to expand the actual amount, click again to hide it.
export default function RevealAmount({ text }: { text: string }) {
  const [shown, setShown] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      title={shown ? '点击隐藏 · click to hide' : '点击显示 · click to reveal'}
      aria-label={shown ? text : 'Hidden balance — click to reveal'}
      className="font-mono tabular cursor-pointer hover:text-accent transition-colors"
    >
      {shown ? text : '••••••'}
    </button>
  )
}
