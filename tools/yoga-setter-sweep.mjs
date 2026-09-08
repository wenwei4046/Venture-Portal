#!/usr/bin/env node
/**
 * tools/yoga-setter-sweep.mjs -- proves what src/lib/export/pdf.test.ts catches.
 *
 * WHY
 * ---
 * The PDF geometry tests exist to catch a Yoga engine that has lost a setter,
 * because @react-pdf/layout applies every style through an OPTIONAL call
 * (`yogaNode[method]?.(...)` in setYogaValue) and a missing setter therefore
 * DROPS the style in silence and still emits a valid PDF. A test suite written
 * against that failure mode is worthless unless somebody has checked it actually
 * fails when the failure happens -- and the first version of those tests, which
 * looked thorough, caught two of the fourteen.
 *
 * So this script deletes each setter in turn from the Yoga Node prototype, runs
 * the suite, and reports which ones the suite notices. The coverage table in the
 * header of pdf.test.ts is the output of this script; re-run it after changing
 * the fixtures rather than trusting the comment.
 *
 * HOW
 * ---
 * It patches node_modules/yoga-layout/dist/src/wrapAssembly.js to honour a
 * YOGA_DROP_SETTERS env var, runs the sweep, then restores the file. The patch is
 * test-only and never survives the run -- including on Ctrl-C. It lives in
 * node_modules rather than in the test because @react-pdf/layout holds the only
 * reference to the Yoga instance it builds, so there is no seam to reach it from
 * outside.
 *
 * Usage:  node tools/yoga-setter-sweep.mjs [--keep]
 *         --keep leaves the harness installed for manual runs:
 *                YOGA_DROP_SETTERS=setPadding npx vitest run src/lib/export/pdf.test.ts
 *         Restore afterwards with: node tools/yoga-setter-sweep.mjs --restore
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const TAG = '[yoga-setter-sweep]'
const TARGET = path.join('node_modules', 'yoga-layout', 'dist', 'src', 'wrapAssembly.js')
const BACKUP = `${TARGET}.sweep-backup`
const TEST = path.join('src', 'lib', 'export', 'pdf.test.ts')

// The complete setYogaValue family -- the only setters @react-pdf/layout calls
// optionally, and therefore the only ones that can fail silently. Everything else
// it uses is called directly and throws when missing.
const SETTERS = [
  'setWidth', 'setHeight', 'setMinWidth', 'setMinHeight', 'setMaxWidth', 'setMaxHeight',
  'setMargin', 'setPadding', 'setPosition', 'setBorder',
  'setFlexBasis', 'setFlexGrow', 'setFlexShrink', 'setGap',
]

const HARNESS = `
  // TEST-ONLY harness installed by tools/yoga-setter-sweep.mjs. Deletes named
  // setters from the Node prototype so @react-pdf/layout's optional calls
  // silently no-op, reproducing exactly what a yoga-layout version mismatch
  // does. The script removes this again when it finishes.
  if (typeof process !== 'undefined' && process.env && process.env.YOGA_DROP_SETTERS) {
    for (const name of process.env.YOGA_DROP_SETTERS.split(',')) {
      delete lib.Node.prototype[name.trim()];
    }
  }
`

const argv = process.argv.slice(2)

function restore() {
  if (fs.existsSync(BACKUP)) {
    fs.copyFileSync(BACKUP, TARGET)
    fs.unlinkSync(BACKUP)
    console.log(`${TAG} restored ${TARGET}`)
  }
}

function install() {
  const src = fs.readFileSync(TARGET, 'utf8')
  if (src.includes('YOGA_DROP_SETTERS')) {
    console.log(`${TAG} harness already installed`)
    return
  }
  // wrapAssembly ends by returning the public surface; inject just before it, so
  // the deletions happen after the prototype is fully built.
  const anchor = '  return {\n    Config: lib.Config,'
  if (!src.includes(anchor)) {
    console.error(
      `${TAG} FAIL  could not find the injection point in ${TARGET}.\n` +
        `${TAG}       yoga-layout's wrapAssembly has changed shape; update this script.`,
    )
    process.exit(1)
  }
  fs.copyFileSync(TARGET, BACKUP)
  fs.writeFileSync(TARGET, src.replace(anchor, HARNESS + anchor))
  console.log(`${TAG} installed harness into ${TARGET}`)
}

if (argv.includes('--restore')) {
  restore()
  process.exit(0)
}

process.on('SIGINT', () => { restore(); process.exit(130) })

install()

if (argv.includes('--keep')) {
  console.log(`${TAG} --keep: harness left installed. Restore with --restore.`)
  process.exit(0)
}

/** Run the suite once and report pass/fail counts. */
function runSuite(drop) {
  const env = { ...process.env }
  if (drop) env.YOGA_DROP_SETTERS = drop
  else delete env.YOGA_DROP_SETTERS
  try {
    const out = execFileSync('npx', ['vitest', 'run', TEST], {
      env,
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { failed: 0, raw: out }
  } catch (e) {
    const raw = `${e.stdout ?? ''}${e.stderr ?? ''}`
    const m = raw.match(/Tests\s+(\d+) failed/)
    return { failed: m ? Number(m[1]) : -1, raw }
  }
}

try {
  console.log(`${TAG} baseline ...`)
  const base = runSuite(null)
  if (base.failed !== 0) {
    console.error(
      `${TAG} FAIL  the suite is not green before the sweep starts. ` +
        `Fix that first -- the sweep means nothing against a red baseline.`,
    )
    process.exit(1)
  }

  const caught = []
  const missed = []
  for (const s of SETTERS) {
    const r = runSuite(s)
    const verdict = r.failed > 0 ? `CAUGHT  (${r.failed} test(s) failed)` : 'not caught'
    ;(r.failed > 0 ? caught : missed).push(s)
    console.log(`${TAG} ${s.padEnd(14)} ${verdict}`)
  }

  console.log(`\n${TAG} ${caught.length}/${SETTERS.length} caught: ${caught.join(' ')}`)
  console.log(`${TAG} not caught: ${missed.join(' ')}`)
  console.log(
    `${TAG} A setter is "not caught" either because no style in the PDF formatters\n` +
      `${TAG} sets it, or because the value it is set to never binds. Before adding a\n` +
      `${TAG} fixture for one, check which -- see the coverage table in ${TEST}.`,
  )
} finally {
  restore()
}
