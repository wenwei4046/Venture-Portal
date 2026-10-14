import type { FileTone } from '@/lib/documentation/drive'

/** The Data center's glyphs (2026-10-12): a folder, a company, a person, a file's kind — stroke icons in currentColor. */

const svg = (size: number, children: React.ReactNode, sw = 1.8) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

/** A filled folder, as Drive draws its folders. */
export function FolderGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2 2 0 0 1 1.5.7l1.3 1.5h6.6A2.5 2.5 0 0 1 21 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" fill="currentColor" />
    </svg>
  )
}

export const CompanyGlyph = ({ size = 22 }: { size?: number }) =>
  svg(size, <><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" /><path d="M14 9h4.5A1.5 1.5 0 0 1 20 10.5V21" /><path d="M2.5 21h19M7.5 8h3M7.5 12h3M7.5 16h3M16.5 13h.5M16.5 17h.5" /></>)

export const PersonGlyph = ({ size = 22 }: { size?: number }) =>
  svg(size, <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>)

export const PlusGlyph = ({ size = 16 }: { size?: number }) => svg(size, <path d="M12 5v14M5 12h14" />, 2)
export const NewFolderGlyph = ({ size = 16 }: { size?: number }) =>
  svg(size, <><path d="M3 7.5A2 2 0 0 1 5 5.5h3.8l2 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 11v5M9.5 13.5h5" /></>)
export const UploadGlyph = ({ size = 16 }: { size?: number }) => svg(size, <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />, 2)
export const EyeGlyph = ({ size = 16 }: { size?: number }) => svg(size, <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>)
export const DownGlyph = ({ size = 16 }: { size?: number }) => svg(size, <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />)
export const PenGlyph = ({ size = 16 }: { size?: number }) => svg(size, <path d="M4 20h4L19 9l-4-4L4 16Z M13.5 6.5l4 4" />)
export const BinGlyph = ({ size = 16 }: { size?: number }) =>
  svg(size, <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />)
/** An arrow turning back — the Talent Bank's Bin › Restore. */
export const RestoreGlyph = ({ size = 16 }: { size?: number }) => svg(size, <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>)
export const BackGlyph = ({ size = 16 }: { size?: number }) => svg(size, <path d="M15 6l-6 6 6 6" />, 2)
export const ChevronGlyph = ({ size = 16 }: { size?: number }) => svg(size, <path d="M9 6l6 6-6 6" />, 2)
export const SearchGlyph = ({ size = 16 }: { size?: number }) => svg(size, <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>, 2)
/** A menu item's tick (2026-10-14: a setting that is on). */
export const CheckGlyph = ({ size = 14 }: { size?: number }) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />, 2.2)
/** View only me (2026-10-14). */
export const LockGlyph = ({ size = 16 }: { size?: number }) =>
  svg(size, <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></>)
/** Shared with the person whose folder it is in (2026-10-14). */
export const SharedGlyph = ({ size = 16 }: { size?: number }) =>
  svg(size, <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 11.5l2 2 4-4" /></>)
/** Copy to… / Duplicate (2026-10-14): two sheets. */
export const CopyGlyph = ({ size = 16 }: { size?: number }) =>
  svg(size, <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>)
export const DuplicateGlyph = ({ size = 16 }: { size?: number }) =>
  svg(size, <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /><path d="M14 11.5v5M11.5 14h5" /></>)
/** Move to… (2026-10-14, a file's too): a folder with an arrow in. */
export const MoveGlyph = ({ size = 16 }: { size?: number }) =>
  svg(size, <><path d="M3 7.5A2 2 0 0 1 5 5.5h3.8l2 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M9 13.5h6M12.5 11l2.5 2.5-2.5 2.5" /></>)

export const DotsGlyph = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="5.5" r="1.7" fill="currentColor" />
    <circle cx="12" cy="12" r="1.7" fill="currentColor" />
    <circle cx="12" cy="18.5" r="1.7" fill="currentColor" />
  </svg>
)

/** A file kind's small badge glyph: lines for a document, a grid for a sheet, a mountain for a picture. */
export function ToneGlyph({ tone, size = 12 }: { tone: FileTone; size?: number }) {
  if (tone === 'sheet') return svg(size, <path d="M4 5h16v14H4ZM4 10h16M4 15h16M10 5v14" />, 2.2)
  if (tone === 'image') return svg(size, <><path d="M4 5h16v14H4Z" /><path d="M4 16l5-5 4 4 2-2 5 5" /></>, 2.2)
  return svg(size, <path d="M6 4h8l4 4v12H6ZM9 12h6M9 16h6" />, 2.2)
}
