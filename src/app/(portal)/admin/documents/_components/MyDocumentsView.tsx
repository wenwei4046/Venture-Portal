'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs } from '@/components/hrv/tabs'
import { flash } from '@/components/hrv/toast'
import { docShortDay } from '@/lib/documentation/model'
import { openMyDoc } from '@/lib/documentation/my-docs-actions'
import { letterState, personalIn, personalPath, personalUnseen, type MyDocuments } from '@/lib/documentation/personal'
import { FileTile, FolderTile } from '@/app/(portal)/team/documentation/_components/drive/Cards'
import { ChevronGlyph, DownGlyph, EyeGlyph } from '@/app/(portal)/team/documentation/_components/drive/icons'
import s from '@/app/(portal)/team/documentation/_components/drive/drive.module.css'

type Kind = 'document' | 'drive' | 'letter'

/**
 * My documents (2026-10-14): Company · Personal, drawn as the Data center draws a place — a file a card with its kind,
 * a folder a compact card a press opens, the path back up. A press views a file (a link made at the press, in a tab
 * readied in the click); its ⋮ downloads it. *New* until opened; a letter *To acknowledge* until it is (in Memos).
 */
export default function MyDocumentsView({ docs }: { docs: MyDocuments }) {
  const router = useRouter()
  const [tab, setTab] = useState<'company' | 'personal'>('company')
  const [folder, setFolder] = useState<string | null>(null)
  const here = folder && docs.personal.folders.some(f => f.id === folder) ? folder : null
  const held = personalIn(docs.personal, here)
  const path = personalPath(docs.personal, here)
  const companyNew = docs.company.filter(x => !x.seen).length
  const personalNew = personalUnseen(docs.personal)

  function open(kind: Kind, id: string, mode: 'view' | 'download' = 'view') {
    // Readied in the click: a tab opened after the server answers is a pop-up.
    const win = mode === 'view' ? window.open('', '_blank') : null
    if (win) win.opener = null
    void openMyDoc(kind, id, mode).then(res => {
      if (!res.ok) {
        win?.close()
        return flash(res.reason)
      }
      if (win) win.location.href = res.url
      else window.location.assign(res.url)
      router.refresh()
    })
  }

  const items = (kind: Kind, id: string) => [
    { key: 'view', label: 'View', icon: <EyeGlyph />, onSelect: () => open(kind, id) },
    { key: 'download', label: 'Download', icon: <DownGlyph />, onSelect: () => open(kind, id, 'download') },
  ]
  const fresh = <span className={s.status} data-tone="alert">New</span>

  return (
    <div className={s.drive}>
      <Tabs
        items={[
          { key: 'company', label: 'Company', count: companyNew || null },
          { key: 'personal', label: 'Personal', count: personalNew || null },
        ]}
        active={tab}
        onSelect={k => setTab(k as 'company' | 'personal')}
        size="compact"
        label="My documents"
        style={{ margin: '-4px 0 4px' }}
      />

      {tab === 'company' ? (
        docs.company.length ? (
          <div className={s.grid}>
            {docs.company.map(doc => (
              <FileTile
                key={doc.id}
                title={doc.name}
                sub={doc.fileName}
                fileName={doc.fileName}
                contentType={doc.contentType}
                onView={() => open('document', doc.id)}
                items={items('document', doc.id)}
                meta={
                  <>
                    <span>Added {docShortDay(doc.uploadedAt)}</span>
                    <span className={s.fileMetaGap} />
                    {doc.seen ? null : fresh}
                  </>
                }
              />
            ))}
          </div>
        ) : (
          <div className={s.empty}>Nothing shared with your department yet.</div>
        )
      ) : (
        <>
          {here ? (
            <nav className={s.crumbs} aria-label="Folder path">
              {path.map((c, i) =>
                i === path.length - 1 ? (
                  <span key={c.id ?? 'top'} className={s.crumbHere} aria-current="page">{c.name}</span>
                ) : (
                  <span key={c.id ?? 'top'} style={{ display: 'contents' }}>
                    <button type="button" className={s.crumb} onClick={() => setFolder(c.id)}>{c.name}</button>
                    <span className={s.crumbSep} aria-hidden="true"><ChevronGlyph size={14} /></span>
                  </span>
                ),
              )}
            </nav>
          ) : null}
          {held.letters.length ? (
            <div className={s.sect}>
              <div className={s.sectHead}>Letters <span className={s.sectCount}>{held.letters.length}</span></div>
              <div className={s.grid}>
                {held.letters.map(l => (
                  <FileTile
                    key={l.id}
                    title={l.typeName}
                    sub={l.name}
                    fileName={l.name}
                    contentType={l.contentType}
                    onView={() => open('letter', l.id)}
                    items={items('letter', l.id)}
                    meta={
                      <>
                        <span>Filed {docShortDay(l.at)}</span>
                        <span className={s.fileMetaGap} />
                        {letterState(l) === 'new' ? fresh : letterState(l) === 'read' ? <span className={s.status} data-tone="info">To acknowledge</span> : null}
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
          {held.folders.length ? (
            <div className={s.sect}>
              <div className={s.sectHead}>Folders <span className={s.sectCount}>{held.folders.length}</span></div>
              <div className={s.grid}>
                {held.folders.map(f => (
                  <FolderTile
                    key={f.id}
                    card={{
                      at: f.id,
                      kind: 'folder',
                      name: f.name,
                      line: `${f.files === 1 ? '1 file' : `${f.files} files`}${f.unseen ? ` · ${f.unseen} new` : ''}`,
                      missing: 0,
                      missingWhy: '',
                      own: false,
                    }}
                    canEdit={false}
                    onOpen={setFolder}
                    onRename={() => undefined}
                    onDelete={() => undefined}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {held.files.length ? (
            <div className={s.sect}>
              <div className={s.sectHead}>Files <span className={s.sectCount}>{held.files.length}</span></div>
              <div className={s.grid}>
                {held.files.map(f => (
                  <FileTile
                    key={f.id}
                    title={f.name}
                    fileName={f.name}
                    contentType={f.contentType}
                    onView={() => open('drive', f.id)}
                    items={items('drive', f.id)}
                    meta={
                      <>
                        <span>Added {docShortDay(f.at)}</span>
                        <span className={s.fileMetaGap} />
                        {f.seen ? null : fresh}
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
          {!held.letters.length && !held.folders.length && !held.files.length ? (
            <div className={s.empty}>{here ? 'This folder is empty.' : 'Nothing of yours is shared with you yet.'}</div>
          ) : null}
        </>
      )}
    </div>
  )
}
