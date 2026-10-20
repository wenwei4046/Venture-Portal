import { templateIcon } from '@/lib/commission/waiting-form'
import w from './waiting.module.css'

/**
 * An uploaded form as its file's icon (2026-10-15, the user: "我不要它直接显示文字，那样很难看" — "比如
 * PDF、Word 之类的"): a small square in the Data center's colour for the kind — Word's W in blue, PDF in
 * red, a picture in orange, HTML's </> in walnut. Decoration only: the chip names the file. An applicant's
 * signed form (2026-10-20) brings its type too, for a name that says nothing of its kind.
 */
export default function FormFileIcon({ name, type }: { name: string; type?: string | null }) {
  const kind = templateIcon(name, type)
  return (
    <span className={w.fileIcon} data-kind={kind} aria-hidden="true">
      {kind === 'word' ? 'W' : kind === 'pdf' ? 'PDF' : kind === 'html' ? '</>' : kind === 'image' ? <PictureGlyph /> : <PageGlyph />}
    </span>
  )
}

function PictureGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16v14H4Z" />
      <path d="M4 16l5-5 4 4 2-2 5 5" />
    </svg>
  )
}

function PageGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8l4 4v12H6Z" />
    </svg>
  )
}
