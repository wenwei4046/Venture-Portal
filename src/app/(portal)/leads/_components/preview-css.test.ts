import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-11-12 — the user: "在预览不会呈现图片？" A template's preview is a scrolling flex column; once the chat was longer
// than the phone, its children shrank and a step's picture (a box with no content of its own) was squeezed to a line.
describe('the previews keep their pictures', () => {
  for (const file of ['templates.module.css', 'rules.module.css']) {
    it(file, () => {
      const css = fs.readFileSync(path.resolve(__dirname, file), 'utf8')
      expect(css).toContain('.msgs > :not(.spacer) { flex-shrink: 0; }')
    })
  }
})
