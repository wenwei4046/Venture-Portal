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

const TYPE_KEYS = new Set<string>(FIELD_TYPES.map(t => t[0]))

/** `member_waiting_form()`'s answer, or null when it is not one. */
export function formFromRow(raw: unknown): WaitingForm | null {
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
    templateName: typeof r.templateName === 'string' && r.templateName ? r.templateName : BUILT_FORM_NAME,
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

/** Why `member_save_waiting_form` would refuse these questions, in its words — or null. */
export function waitingFormRefusal(fields: readonly WaitingField[]): string | null {
  if (fields.length < 4 || fields.length > 40) return 'A form has from 4 to 40 questions'
  const ids = new Set<string>()
  for (const f of fields) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(f.id) || ids.has(f.id)) return 'Every question needs its own id'
    ids.add(f.id)
    const label = f.label.trim()
    if (label.length < 1 || label.length > 120) return 'Every question needs a label of at most 120 characters'
    if (!TYPE_KEYS.has(f.type)) return 'A question is Text, Dropdown, Date, Yes / No or Phone'
    const builtin = BUILTIN_TYPES[f.id]
    if (builtin) {
      if (f.type !== builtin || !f.required || !f.builtin) return 'The built-in questions stay required and keep their kind'
    } else if (f.builtin) {
      return 'Only the four built-in questions are built in'
    }
    if (f.type === 'dropdown' && !builtin) {
      const options = (f.options ?? []).map(o => o.trim())
      const distinct = new Set(options.map(o => o.toLowerCase()))
      if (options.length < 1 || options.length > 30 || options.some(o => o.length < 1 || o.length > 80) || distinct.size !== options.length) {
        return `“${label}” needs from 1 to 30 different options`
      }
    }
  }
  if (!Object.keys(BUILTIN_TYPES).every(id => ids.has(id))) return 'The four built-in questions cannot be removed'
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
/** Under the 4 MB a Server Action may carry (next.config.ts), with room for the form around it. */
export const TEMPLATE_MAX_BYTES = 3_800_000

/** The file's type as the bucket wants it — from its name, since browsers leave Word's blank. */
export function templateContentType(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return TEMPLATE_TYPES[ext] ?? null
}

/** Why an upload would be refused, or null. */
export function templateRefusal(file: { name: string; size: number }): string | null {
  if (!file.name || file.size <= 0) return 'Choose a file to upload.'
  if (!templateContentType(file.name)) return 'Upload a PDF, Word, HTML, PNG or JPEG file.'
  if (file.size > TEMPLATE_MAX_BYTES) return 'The form must be smaller than 3.8 MB.'
  return null
}

/** `templates/<id>/<name>` — each upload its own folder, so an old version keeps its file. */
export function templateObjectPath(name: string, id: string): string {
  const base = name.trim().replace(/[^A-Za-z0-9._ -]+/g, '-').replace(/\s+/g, ' ').replace(/^[-. ]+/, '').slice(-120) || 'form'
  return `templates/${id}/${base}`
}

// ── The built application form (the handoff's waitform.js) ────────────────

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/**
 * The black-and-white form members print, fill in by hand and sign — every
 * question in order, a line to write on, a box per option. The built-in
 * "Preferred sub-department" offers the department's sub-departments.
 */
export function applicationFormHtml(
  form: Pick<WaitingForm, 'version' | 'fields' | 'templateName'>,
  subName: string | null,
  subOptions: readonly string[],
): string {
  const rows = form.fields
    .map(f => {
      const options = f.id === 'target' && f.builtin ? subOptions : f.options ?? []
      let box = '<div class="line"></div>'
      if (f.type === 'dropdown') box = '<div class="opts">' + options.map(o => '<span>&#9744; ' + esc(o) + '</span>').join('') + '</div>'
      if (f.type === 'yesno') box = '<div class="opts"><span>&#9744; Yes</span><span>&#9744; No</span></div>'
      if (f.type === 'date') box = '<div class="line short">&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>'
      return '<div class="row"><div class="lab">' + esc(f.label) + (f.required ? ' *' : '') + '</div>' + box + '</div>'
    })
    .join('')
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(form.templateName) + '</title><style>' +
    'body{font-family:Georgia,"Times New Roman",serif;color:#000;background:#fff;margin:48px auto;max-width:640px;padding:0 24px}' +
    'h1{font-size:22px;margin:0 0 4px}.sub{font-size:13px;margin:0 0 28px}.row{margin:0 0 22px}.lab{font-size:13px;margin-bottom:8px}' +
    '.line{border-bottom:1px solid #000;height:22px}.line.short{width:180px;font-size:12px}.opts{display:flex;gap:22px;font-size:13px;flex-wrap:wrap}' +
    '.sig{display:flex;gap:40px;margin-top:40px}.sig div{flex:1}.foot{margin-top:36px;font-size:11px;border-top:1px solid #000;padding-top:10px}' +
    '@media print{body{margin:0}}</style></head><body>' +
    '<h1>HOUZS Venture · Waiting list application</h1><p class="sub">Revenue Department' + (subName ? ' · ' + esc(subName) : '') + ' · Form v' + form.version + '</p>' +
    rows +
    '<div class="sig"><div><div class="line"></div><div class="lab">Applicant signature</div></div><div><div class="line"></div><div class="lab">Date</div></div></div>' +
    '<div class="sig"><div><div class="line"></div><div class="lab">Submitted by (member)</div></div><div><div class="line"></div><div class="lab">Upline</div></div></div>' +
    '<p class="foot">Print in black and white, fill in by hand, sign, then photograph or scan and upload it with the request. HR keeps it as the record.</p>' +
    '</body></html>'
  )
}
