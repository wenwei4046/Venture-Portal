/**
 * Sales Groups › Waiting list's form (2026-10-10, the HR revamp): what the
 * Revenue team fills in when they put somebody on the waiting list. Four
 * questions are built in — the ones `member_prepare_request` needs — and HR
 * adds its own after them; every save is a new VERSION in
 * `member_waiting_forms` (mig 20261010140000), written by
 * `member_save_waiting_form`, which makes the checks `waitingFormRefusal`
 * makes here so the drawer can say what is wrong before anything is sent.
 *
 * The application form members print is HR's upload when there is one, else
 * the black-and-white form built from the questions (`applicationFormHtml`,
 * the handoff's waitform.js).
 *
 * Pure, so the drawer stays thin and this is tested.
 */

import { ANY_TIME_LABEL } from '@/lib/member/waiting-start'

export type WaitingFieldType = 'text' | 'dropdown' | 'date' | 'yesno' | 'phone'

export interface WaitingField {
  id: string
  label: string
  type: WaitingFieldType
  required: boolean
  builtin?: boolean
  placeholder?: string
  options?: string[]
}

export interface WaitingForm {
  version: number
  fields: WaitingField[]
  requireUpload: boolean
  /** HR's uploaded application form in the `member-forms` bucket, or null = the built one. */
  templatePath: string | null
  templateName: string
  createdAt: string | null
}

/** The kinds a question can be, in the drawer's order. */
export const FIELD_TYPES: ReadonlyArray<readonly [WaitingFieldType, string]> = [
  ['text', 'Text'],
  ['dropdown', 'Dropdown'],
  ['date', 'Date'],
  ['yesno', 'Yes / No'],
  ['phone', 'Phone'],
]

export function typeLabel(type: string): string {
  return FIELD_TYPES.find(t => t[0] === type)?.[1] ?? type
}

/** The four `member_prepare_request` needs: always there, always required, their kind fixed. */
export const BUILTIN_TYPES: Readonly<Record<string, WaitingFieldType>> = {
  newPerson: 'text',
  contact: 'phone',
  target: 'dropdown',
  start: 'date',
}

/** The built form's file name (and the form's name until HR uploads one). */
export const BUILT_FORM_NAME = 'HOUZS Revenue - Waiting list application.html'

/** The four as version 1 seeds them (mig 20261010140000) — what the Revenue app asks until HR's form arrives. */
export const BUILTIN_FIELDS: readonly WaitingField[] = [
  { id: 'newPerson', label: 'New member name', type: 'text', required: true, builtin: true, placeholder: 'Full name as per IC' },
  { id: 'contact', label: 'Phone number', type: 'phone', required: true, builtin: true, placeholder: 'e.g. 012-345 6789' },
  { id: 'target', label: 'Preferred sub-department', type: 'dropdown', required: true, builtin: true },
  { id: 'start', label: 'Preferred start date', type: 'date', required: true, builtin: true },
]

// ── The replacement list's form (2026-10-11, round 2's README 18.5) ────────
//
// The same Form settings and Upload form, its own versions in
// `member_replacement_forms` (mig 20261011130000). Its built-in questions are
// the five `member_prepare_request` needs for a replacement — the handoff
// lists Reason among HR's own, but the database refuses a replacement
// without one, so it is built in here.

/** Which list a form belongs to. */
export type MemberFormKind = 'waiting' | 'replacement'

export const REPLACEMENT_BUILTIN_TYPES: Readonly<Record<string, WaitingFieldType>> = {
  original: 'dropdown',
  destination: 'dropdown',
  source: 'dropdown',
  effective: 'date',
  reason: 'text',
}

export const REPLACEMENT_FORM_NAME = 'HOUZS Revenue - Replacement form.html'

/** The five as version 1 seeds them — the Revenue app draws each with its own controls. */
export const REPLACEMENT_BUILTIN_FIELDS: readonly WaitingField[] = [
  { id: 'original', label: 'Member leaving', type: 'dropdown', required: true, builtin: true, options: ['From the team list'] },
  { id: 'destination', label: 'Arrangement', type: 'dropdown', required: true, builtin: true, options: ['Leave this department only', 'Leave the company', 'Transfer to another department'] },
  { id: 'source', label: 'Replaced by', type: 'dropdown', required: true, builtin: true, options: ['New member joining', 'Existing member', 'Waiting list', 'Release the position'] },
  { id: 'effective', label: 'Effective date', type: 'date', required: true, builtin: true },
  { id: 'reason', label: 'Reason', type: 'text', required: true, builtin: true },
]

interface KindSpec {
  builtinTypes: Readonly<Record<string, WaitingFieldType>>
  builtinFields: readonly WaitingField[]
  /** How the database counts them, in its own words. */
  count: string
  formName: string
  /** The built form's heading. */
  heading: string
  /** Who signs the built form first. */
  signer: string
}

export const FORM_KINDS: Readonly<Record<MemberFormKind, KindSpec>> = {
  waiting: {
    builtinTypes: BUILTIN_TYPES,
    builtinFields: BUILTIN_FIELDS,
    count: 'four',
    formName: BUILT_FORM_NAME,
    heading: 'Waiting list application',
    signer: 'Applicant signature',
  },
  replacement: {
    builtinTypes: REPLACEMENT_BUILTIN_TYPES,
    builtinFields: REPLACEMENT_BUILTIN_FIELDS,
    count: 'five',
    formName: REPLACEMENT_FORM_NAME,
    heading: 'Replacement form',
    signer: 'Member leaving — signature',
  },
}

const TYPE_KEYS = new Set<string>(FIELD_TYPES.map(t => t[0]))

/** `member_waiting_form()`'s (or `member_replacement_form()`'s) answer, or null when it is not one. */
export function formFromRow(raw: unknown, kind: MemberFormKind = 'waiting'): WaitingForm | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const version = Number(r.version)
  if (!Number.isInteger(version) || version < 1 || !Array.isArray(r.fields)) return null
  const fields: WaitingField[] = []
  for (const f of r.fields as unknown[]) {
    if (!f || typeof f !== 'object') continue
    const q = f as Record<string, unknown>
    if (typeof q.id !== 'string' || typeof q.label !== 'string' || !TYPE_KEYS.has(String(q.type))) continue
    fields.push({
      id: q.id,
      label: q.label,
      type: q.type as WaitingFieldType,
      required: q.required === true,
      ...(q.builtin === true ? { builtin: true } : {}),
      ...(typeof q.placeholder === 'string' ? { placeholder: q.placeholder } : {}),
      ...(Array.isArray(q.options) ? { options: (q.options as unknown[]).filter((o): o is string => typeof o === 'string') } : {}),
    })
  }
  return {
    version,
    fields,
    requireUpload: r.requireUpload === true,
    templatePath: typeof r.templatePath === 'string' && r.templatePath ? r.templatePath : null,
    templateName: typeof r.templateName === 'string' && r.templateName ? r.templateName : FORM_KINDS[kind].formName,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
  }
}

/** A new question's id: `q` and a stamp, never one the form already has. */
export function newQuestionId(fields: readonly WaitingField[], now: number = Date.now()): string {
  const taken = new Set(fields.map(f => f.id))
  let n = now
  let id = `q${n.toString(36)}`
  while (taken.has(id)) id = `q${(++n).toString(36)}`
  return id
}

/** + Add question: a Text question, optional, at the end. */
export function addQuestion(fields: readonly WaitingField[], now?: number): WaitingField[] {
  return [...fields, { id: newQuestionId(fields, now), label: 'New question', type: 'text', required: false }]
}

/** ▲ / ▼: one place up or down; at either end nothing moves. */
export function moveQuestion(fields: readonly WaitingField[], index: number, by: -1 | 1): WaitingField[] {
  const to = index + by
  if (index < 0 || index >= fields.length || to < 0 || to >= fields.length) return [...fields]
  const next = [...fields]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** A question's kind; a dropdown starts with one option so it is never empty. */
export function withType(field: WaitingField, type: WaitingFieldType): WaitingField {
  if (field.builtin) return field
  if (type === 'dropdown') return { ...field, type, options: field.options?.length ? field.options : ['Option 1'] }
  return { ...field, type }
}

/** Add: the option typed, trimmed — unless it is blank or the dropdown has it already. */
export function withOption(field: WaitingField, text: string): WaitingField {
  const t = text.trim()
  const options = field.options ?? []
  if (!t || options.some(o => o.toLowerCase() === t.toLowerCase())) return field
  return { ...field, options: [...options, t] }
}

export function withoutOption(field: WaitingField, index: number): WaitingField {
  return { ...field, options: (field.options ?? []).filter((_, i) => i !== index) }
}

/**
 * What a save sends: labels and options trimmed, and a question of HR's left
 * without a label dropped (the handoff's Save does the same).
 */
export function cleanedFields(fields: readonly WaitingField[]): WaitingField[] {
  return fields
    .filter(f => f.builtin || f.label.trim() !== '')
    .map(f => ({
      ...f,
      label: f.label.trim(),
      ...(f.options ? { options: f.options.map(o => o.trim()).filter(Boolean) } : {}),
    }))
}

/** Why `member_save_waiting_form` (or `member_save_replacement_form`) would refuse these questions, in its words — or null. */
export function waitingFormRefusal(fields: readonly WaitingField[], kind: MemberFormKind = 'waiting'): string | null {
  const spec = FORM_KINDS[kind]
  const least = Object.keys(spec.builtinTypes).length
  if (fields.length < least || fields.length > 40) return `A form has from ${least} to 40 questions`
  const ids = new Set<string>()
  for (const f of fields) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(f.id) || ids.has(f.id)) return 'Every question needs its own id'
    ids.add(f.id)
    const label = f.label.trim()
    if (label.length < 1 || label.length > 120) return 'Every question needs a label of at most 120 characters'
    if (!TYPE_KEYS.has(f.type)) return 'A question is Text, Dropdown, Date, Yes / No or Phone'
    const builtin = spec.builtinTypes[f.id]
    if (builtin) {
      if (f.type !== builtin || !f.required || !f.builtin) return 'The built-in questions stay required and keep their kind'
    } else if (f.builtin) {
      return `Only the ${spec.count} built-in questions are built in`
    }
    if (f.type === 'dropdown' && !builtin) {
      const options = (f.options ?? []).map(o => o.trim())
      const distinct = new Set(options.map(o => o.toLowerCase()))
      if (options.length < 1 || options.length > 30 || options.some(o => o.length < 1 || o.length > 80) || distinct.size !== options.length) {
        return `“${label}” needs from 1 to 30 different options`
      }
    }
  }
  if (!Object.keys(spec.builtinTypes).every(id => ids.has(id))) return `The ${spec.count} built-in questions cannot be removed`
  return null
}

/** True when the draft differs from what was saved (and so Save means something). */
export function formChanged(saved: WaitingForm, draft: { fields: readonly WaitingField[]; requireUpload: boolean; useBuiltForm: boolean }): boolean {
  if (saved.requireUpload !== draft.requireUpload) return true
  if (draft.useBuiltForm && saved.templatePath) return true
  return JSON.stringify(cleanedFields(saved.fields)) !== JSON.stringify(cleanedFields(draft.fields))
}

/** "7 fields · form v2 · signed form required". */
export function formMeta(form: Pick<WaitingForm, 'fields' | 'version' | 'requireUpload'>): string {
  return `${form.fields.length} fields · form v${form.version}${form.requireUpload ? ' · signed form required' : ''}`
}

// ── HR's own application form (Upload form) ───────────────────────────────

/** What the `member-forms` bucket accepts (mig 20261010140000), by extension and type. */
export const TEMPLATE_ACCEPT = '.pdf,.doc,.docx,.html,.png,.jpg,.jpeg'
const TEMPLATE_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}
/**
 * The bucket's own 100 MB (mig 20261024006700): since 2026-10-23 the file is sent ahead of its Server Action
 * (lib/storage/stage.ts) — until then it rode in the action's body, which stops at 4 MB (so 3.8 MB here).
 */
export const TEMPLATE_MAX_BYTES = 100 * 1024 * 1024

/** The file's type as the bucket wants it — from its name, since browsers leave Word's blank. */
export function templateContentType(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return TEMPLATE_TYPES[ext] ?? null
}

/** Why an upload would be refused, or null. */
export function templateRefusal(file: { name: string; size: number }): string | null {
  if (!file.name || file.size <= 0) return 'Choose a file to upload.'
  if (!templateContentType(file.name)) return 'Upload a PDF, Word, HTML, PNG or JPEG file.'
  if (file.size > TEMPLATE_MAX_BYTES) return 'The form must be 100 MB or smaller.'
  return null
}

/** `templates/<id>/<name>` — each upload its own folder, so an old version keeps its file (until Remove deletes it). */
export function templateObjectPath(name: string, id: string): string {
  const base = name.trim().replace(/[^A-Za-z0-9._ -]+/g, '-').replace(/\s+/g, ' ').replace(/^[-. ]+/, '').slice(-120) || 'form'
  return `templates/${id}/${base}`
}

// ── View, on the uploaded form's right-click menu (2026-10-14) ────────────

/**
 * How View draws HR's file: a PDF or a picture as it is, a Word .docx read in
 * the browser (mammoth), an HTML form as its page — the last two in a frame
 * where nothing runs. An old Word .doc has no reader a page can carry: Download.
 */
export type TemplateView = 'pdf' | 'image' | 'word' | 'html' | 'none'

/**
 * An applicant's signed form (2026-10-20) is named as its sender's file was, which may say nothing of its kind —
 * or the wrong thing; the bucket kept the type the server found in its bytes, so the type decides when there is
 * one: a PDF, a PNG or JPEG, a Word .docx (read here) or an old .doc (Download).
 */
const TYPE_VIEW: Readonly<Record<string, TemplateView>> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/msword': 'none',
}

export function templateView(name: string, type?: string | null): TemplateView {
  if (type && type in TYPE_VIEW) return TYPE_VIEW[type]
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image'
  if (ext === 'docx') return 'word'
  if (ext === 'html') return 'html'
  return 'none'
}

/**
 * The chip of an uploaded form is the file's icon, never its name (2026-10-15, the user: "我不要它直接显示
 * 文字，那样很难看" — an icon "比如 PDF、Word 之类的"): Word's W for a .doc or .docx, PDF, a picture,
 * HTML's </>. The name is the chip's tooltip.
 */
export type TemplateIcon = 'word' | 'pdf' | 'image' | 'html' | 'file'

const TYPE_ICON: Readonly<Record<string, TemplateIcon>> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/msword': 'word',
}

export function templateIcon(name: string, type?: string | null): TemplateIcon {
  if (type && type in TYPE_ICON) return TYPE_ICON[type]
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'doc' || ext === 'docx') return 'word'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image'
  if (ext === 'html') return 'html'
  return 'file'
}

/** A Word file as mammoth reads it (its words, tables and pictures) on a white page, for the frame's `srcDoc`. */
export function wordPage(body: string, title: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
    'body{margin:0;padding:40px 48px;background:rgb(255 255 255);color:rgb(0 0 0);font:14px/1.55 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}' +
    'h1,h2,h3{line-height:1.3;margin:0 0 12px}p{margin:0 0 10px}img{max-width:100%;height:auto}' +
    'table{border-collapse:collapse;width:100%;margin:0 0 12px}td,th{border:1px solid rgb(0 0 0);padding:6px 8px;vertical-align:top;text-align:left}' +
    '</style></head><body>' + body + '</body></html>'
  )
}

// ── The built application form (the handoff's waitform.js) ────────────────

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/**
 * The black-and-white form members print, fill in by hand and sign — every
 * question in order, a line to write on, a box per option. The built-in
 * "Preferred sub-department" offers the department's sub-departments; the
 * replacement's "Member leaving" is a name, written on its line.
 */
export function applicationFormHtml(
  form: Pick<WaitingForm, 'version' | 'fields' | 'templateName'>,
  subName: string | null,
  subOptions: readonly string[],
  kind: MemberFormKind = 'waiting',
): string {
  const spec = FORM_KINDS[kind]
  const rows = form.fields
    .map(f => {
      const options = f.id === 'target' && f.builtin ? subOptions : f.options ?? []
      let box = '<div class="line"></div>'
      if (f.type === 'dropdown' && !(kind === 'replacement' && f.builtin && f.id === 'original'))
        box = '<div class="opts">' + options.map(o => '<span>&#9744; ' + esc(o) + '</span>').join('') + '</div>'
      if (f.type === 'yesno') box = '<div class="opts"><span>&#9744; Yes</span><span>&#9744; No</span></div>'
      if (f.type === 'date') box = '<div class="line short">&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>'
      // The joining date may be any time — ready whenever HR calls them (2026-10-14).
      if (kind === 'waiting' && f.builtin && f.id === 'start') box = '<div class="when">' + box + '<span>&#9744; ' + esc(ANY_TIME_LABEL) + '</span></div>'
      return '<div class="row"><div class="lab">' + esc(f.label) + (f.required ? ' *' : '') + '</div>' + box + '</div>'
    })
    .join('')
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(form.templateName) + '</title><style>' +
    'body{font-family:Georgia,"Times New Roman",serif;color:#000;background:#fff;margin:48px auto;max-width:640px;padding:0 24px}' +
    'h1{font-size:22px;margin:0 0 4px}.sub{font-size:13px;margin:0 0 28px}.row{margin:0 0 22px}.lab{font-size:13px;margin-bottom:8px}' +
    '.line{border-bottom:1px solid #000;height:22px}.line.short{width:180px;font-size:12px}.opts{display:flex;gap:22px;font-size:13px;flex-wrap:wrap}' +
    '.when{display:flex;gap:22px;align-items:flex-end;font-size:13px;flex-wrap:wrap}' +
    '.sig{display:flex;gap:40px;margin-top:40px}.sig div{flex:1}.foot{margin-top:36px;font-size:11px;border-top:1px solid #000;padding-top:10px}' +
    '@media print{body{margin:0}}</style></head><body>' +
    '<h1>HOUZS Venture · ' + spec.heading + '</h1><p class="sub">Revenue Department' + (subName ? ' · ' + esc(subName) : '') + ' · Form v' + form.version + '</p>' +
    rows +
    '<div class="sig"><div><div class="line"></div><div class="lab">' + spec.signer + '</div></div><div><div class="line"></div><div class="lab">Date</div></div></div>' +
    '<div class="sig"><div><div class="line"></div><div class="lab">Submitted by (member)</div></div><div><div class="line"></div><div class="lab">Upline</div></div></div>' +
    '<p class="foot">Print in black and white, fill in by hand, sign, then photograph or scan and upload it with the request. HR keeps it as the record.</p>' +
    '</body></html>'
  )
}
