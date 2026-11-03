// Writes src/components/layout/lead-lucide.ts from lucide-static 0.460.0 (args: iconsDir namesFile outFile)
import fs from 'node:fs'
const [dir, namesFile, out] = process.argv.slice(2)
const names = [...new Set(fs.readFileSync(namesFile, 'utf8').split(/\s+/).filter(Boolean))].sort()
const lines = names.map(n => {
  const svg = fs.readFileSync(`${dir}/${n}.svg`, 'utf8')
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
    .split('\n').map(l => l.trim()).filter(Boolean).join('')
  return `  '${n}': '${inner.replace(/'/g, "\'")}',`
})
fs.writeFileSync(out, `// Generated from lucide-static 0.460.0 (ISC) — the version the Lead View v2 handoff draws. Do not edit by hand:
// add a name to the list and run the generator again (see lead-icons.tsx).
export const LUCIDE = {
${lines.join('\n')}
} as const

export type LucideName = keyof typeof LUCIDE
`)
console.log(names.length, 'icons')
