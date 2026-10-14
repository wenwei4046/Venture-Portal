'use client'

import { useRef } from 'react'
import { fileSize } from './form-words'
import f from './form.module.css'

// The files a new voucher carries (2026-10-14, the Finance revamp v2): a white
// card of the files chosen — name, size, *Remove* — then a dashed *+ Add files*.
// They go with the save, in the Server Action's body (under 4 MB in all).

export function FilesField({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      {files.length > 0 ? (
        <div className={f.files}>
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className={f.file}>
              <span className={f.fileName} title={file.name}>
                {file.name}
              </span>
              <span className={f.fileSize}>{fileSize(file.size)}</span>
              <button type="button" className={f.fileRemove} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          onChange([...files, ...picked])
          e.target.value = ''
        }}
      />
      <button type="button" className={f.addFiles} onClick={() => input.current?.click()}>
        + Add files
      </button>
    </>
  )
}
