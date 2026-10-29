import { richPieces } from '@/lib/leads/rich'

/** A message's words with Messenger's *bold* and _italic_ drawn as they will read (2026-10-29). */
export default function RichText({ text }: { text: string }) {
  return (
    <>
      {richPieces(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : p.italic ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>))}
    </>
  )
}
