// A Library share link's page (⑥-3): what mkt_lib_shared answers the stranger holding a link's code — the brand, the
// file or folder, its files' names, sizes and types (never a path, never who sent them), whether they may download,
// when the link ends. Pure.

import { isShareCode, profileFromRow, type LibSub } from './library'

/** A file of the link: never its path — its ending ("PDF") only. */
export interface SharedFile { id: string; name: string; ext: string; size: number; mime: string; at: string }
export interface SharedPage {
  kind: 'file' | 'folder'
  /** The file's name, or the folder's type. */
  name: string
  folder: string
  /** Enough of the subsidiary for its brand's look (brandLook). */
  sub: LibSub
  download: boolean
  expires: string | null
  files: SharedFile[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

export { isShareCode }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isFileId = (id: string) => UUID.test(id)

/** mkt_lib_shared(code): the page, or null — the link is closed. */
export function sharedFromRow(v: unknown): SharedPage | null {
  if (!isObj(v) || !isObj(v.sub)) return null
  const s = v.sub
  return {
    kind: v.kind === 'folder' ? 'folder' : 'file',
    name: str(v.name),
    folder: str(v.folder),
    sub: {
      id: '', code: str(s.code), name: str(s.name), emoji: str(s.emoji) || '🏢', dot: str(s.dot), client: s.client === true,
      profile: profileFromRow(s.profile),
    },
    download: v.download === true,
    expires: str(v.expires) || null,
    files: (Array.isArray(v.files) ? v.files : []).filter(isObj).filter(f => isFileId(str(f.id))).map(f => ({
      id: str(f.id), name: str(f.name), ext: /^[A-Z0-9]{1,8}$/.test(str(f.ext)) ? str(f.ext) : 'FILE', size: num(f.size), mime: str(f.mime), at: str(f.at),
    })),
  }
}

/** A file's address on the link — shown in place, or saved under its name. */
export const sharedFileHref = (code: string, id: string, download = false) => `/l/${code}/f/${id}${download ? '?download=1' : ''}`
/** The brand's own picture on the link: its logo, its cover. */
export const sharedBrandHref = (code: string, which: 'avatar' | 'banner') => `/l/${code}/b/${which}`
