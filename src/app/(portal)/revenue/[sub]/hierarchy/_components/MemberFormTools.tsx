'use client'

import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { TEMPLATE_ACCEPT, templateRefusal, type MemberFormKind, type WaitingForm } from '@/lib/commission/waiting-form'
import { stageInto } from '@/lib/storage/stage'
import {
  removeFormTemplate,
  replacementFormTemplateLink,
  uploadReplacementFormTemplate,
  uploadWaitingFormTemplate,
  viewFormTemplate,
  waitingFormTemplateLink,
} from '../../../waiting-actions'
import type { MenuAnchor } from './ContextMenuPanel'
import FormFileIcon from './FormFileIcon'
import FormFileMenu from './FormFileMenu'
import FormFileViewer from './FormFileViewer'
import WaitingFormSettings from './WaitingFormSettings'
import w from './waiting.module.css'

// Above the Waiting list (2026-10-10) and, since round 2 (2026-10-11, README
// 18.5), the Replacement list: Upload form — HR's own form, the one Revenue
// members download — and Form settings, the questions they answer. Each list
// has its own versions; the tools are the same. Once a form is uploaded its
// chip has a right-click menu (2026-10-14): View and Remove — and since
// 2026-10-15 the chip is the file's icon, its name in the tooltip.

const WORDS: Readonly<Record<MemberFormKind, { title: string; uploaded: (name: string) => string; list: string }>> = {
  waiting: {
    title: 'Upload the application form Revenue members download',
    uploaded: name => `Form uploaded — the waiting-list application is now ${name}`,
    list: 'Waiting list',
  },
  replacement: {
    title: 'Upload the replacement form Revenue members download',
    uploaded: name => `Replacement form uploaded — Revenue members now download ${name}`,
    list: 'Replacement list',
  },
}

export default function MemberFormTools({
  kind,
  form: initialForm,
  subName,
  subOptions,
  lead,
}: {
  kind: MemberFormKind
  /** The form as saved, or why it could not be read. */
  form: { ok: true; form: WaitingForm } | { ok: false; reason: string }
  subName: string
  /** The department's sub-departments, for the waiting list's built-in "Preferred sub-department". */
  subOptions: string[]
  /** What stands first in the row — the waiting list's "+" (2026-10-11). */
  lead?: ReactNode
}) {
  // The page's answer is the truth; a save here shows at once, until the
  // page's next answer catches up.
  const [seen, setSeen] = useState(initialForm)
  const [form, setForm] = useState(initialForm.ok ? initialForm.form : null)
  if (seen !== initialForm) {
    setSeen(initialForm)
    setForm(initialForm.ok ? initialForm.form : null)
  }
  const formMissing = initialForm.ok ? null : initialForm.reason

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; path: string; name: string } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const closeMenu = useCallback(() => {
    setMenu(null)
    setRemoveError(null)
  }, [])

  async function upload(file: File | undefined) {
    if (!file || uploading) return
    const refused = templateRefusal(file)
    if (refused) {
      flash(refused)
      return
    }
    setUploading(true)
    const data = new FormData()
    // Sent ahead of the action (2026-10-23, lib/storage/stage.ts) — up to 100 MB, not a body's 4 MB.
    const done = await stageInto(data, 'file', file).then(
      () => (kind === 'replacement' ? uploadReplacementFormTemplate(data) : uploadWaitingFormTemplate(data)),
      (err: unknown) => ({ ok: false as const, reason: err instanceof Error ? err.message : 'The form could not be sent.' }),
    )
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!done.ok) {
      flash(done.reason)
      return
    }
    setForm(done.form)
    flash(WORDS[kind].uploaded(done.form.templateName))
  }

  const uploaded = form?.templatePath ? form.templateName : null

  // A right-click on an uploaded form's chip opens its menu where the pointer is (from the keys —
  // Shift + F10, the menu key — under the chip). Shift + right-click keeps the browser's own.
  function openMenu(event: MouseEvent<HTMLLabelElement>) {
    if (event.shiftKey || !form?.templatePath || uploading) return
    event.preventDefault()
    const chip = event.currentTarget.getBoundingClientRect()
    const atPointer = event.clientX !== 0 || event.clientY !== 0
    setRemoveError(null)
    setMenu({
      anchor: atPointer ? { left: event.clientX, top: event.clientY, bottom: event.clientY } : { left: chip.left, top: chip.bottom, bottom: chip.bottom },
      path: form.templatePath,
      name: form.templateName,
    })
  }

  // The chip takes focus back when its menu goes — never a menu that is gone (the drawer, too, gives focus back to
  // what had it).
  const focusChip = useCallback(() => fileRef.current?.focus({ preventScroll: true }), [])

  function view() {
    if (!menu) return
    const name = menu.name
    closeMenu()
    focusChip()
    setViewing(name)
  }

  async function remove() {
    if (!menu || removing) return
    setRemoving(true)
    setRemoveError(null)
    const done = await removeFormTemplate(kind, menu.path)
    setRemoving(false)
    if (!done.ok) {
      setRemoveError(done.reason)
      return
    }
    setForm(done.form)
    closeMenu()
    focusChip()
    flash(
      done.fileDeleted
        ? `${menu.name} removed — members download the built form`
        : `${menu.name} is off the form — members download the built form, but the file could not be deleted`,
    )
  }

  return (
    <>
      <div className={w.toolbar}>
        {lead}
        <label
          className={w.upload}
          data-uploaded={uploaded ? 'true' : undefined}
          data-icon={uploaded && !uploading ? 'true' : undefined}
          data-busy={uploading ? 'true' : undefined}
          title={formMissing ?? uploaded ?? WORDS[kind].title}
          onContextMenu={openMenu}
        >
          {/* An uploaded form is its file's icon, its name in the tooltip (2026-10-15) — never the name itself. */}
          {uploading ? 'Uploading…' : uploaded ? <FormFileIcon name={uploaded} /> : 'Upload form'}
          <input
            ref={fileRef}
            type="file"
            accept={TEMPLATE_ACCEPT}
            aria-label={uploaded && !uploading ? `Form: ${uploaded}` : undefined}
            disabled={uploading || form === null}
            onChange={e => void upload(e.target.files?.[0])}
          />
        </label>
        <button type="button" className={w.settings} onClick={() => setSettingsOpen(true)} disabled={form === null} title={formMissing ?? undefined}>
          Form settings
        </button>
      </div>

      {settingsOpen && form ? (
        <WaitingFormSettings
          kind={kind}
          form={form}
          subName={subName}
          subOptions={subOptions}
          onClose={() => setSettingsOpen(false)}
          onSaved={setForm}
        />
      ) : null}

      {menu ? (
        <FormFileMenu
          key={`${menu.anchor.left}:${menu.anchor.top}`}
          name={menu.name}
          anchor={menu.anchor}
          removing={removing}
          error={removeError}
          onView={view}
          onRemove={() => void remove()}
          onClose={closeMenu}
          onKeyClose={focusChip}
        />
      ) : null}
      {viewing ? (
        <FormFileViewer
          kicker={`${WORDS[kind].list} · Uploaded form`}
          name={viewing}
          open={() => viewFormTemplate(kind)}
          download={() => (kind === 'replacement' ? replacementFormTemplateLink() : waitingFormTemplateLink())}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  )
}
