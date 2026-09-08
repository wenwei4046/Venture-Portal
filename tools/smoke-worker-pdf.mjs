#!/usr/bin/env node
/**
 * tools/smoke-worker-pdf.mjs   --   end-to-end gate. Runs AFTER the build.
 *
 * WHY THIS EXISTS, GIVEN tools/assert-open-next-wasm.mjs ALREADY RUNS
 * ------------------------------------------------------------------
 * That script reads the built bundle and proves the yoga WASM fix is PRESENT in
 * the right shape. It cannot prove the fix WORKS, because it inspects code rather
 * than executing it. A fix that is present and fails to load at runtime passes all
 * four of its checks and then returns HTTP 500 on every PDF route -- that exact
 * false pass was demonstrated, not hypothesised.
 *
 * So this script starts the built worker in workerd, asks it for a real PDF, and
 * checks the geometry of what comes back. Bytes beginning with %PDF prove nothing:
 * @react-pdf/layout calls Yoga setters as `node[method]?.(...)`, so a broken engine
 * silently drops every style and still emits a perfectly valid PDF in which the
 * layout has collapsed. The assertions below are therefore about POSITIONS.
 *
 * WHAT THE ASSERTIONS ARE MADE OF
 * -------------------------------
 * Two kinds, and no golden coordinate dumps:
 *   (a) DERIVED -- column x deltas must equal the column widths declared in the
 *       probe route. Change the route's widths and the expectation follows.
 *   (b) PAGE-FRAME ANCHORS -- the leftmost and topmost text measured against the
 *       page EDGE. Deltas alone survive a dropped page padding or margin, because
 *       every column shifts by the same amount; only an absolute anchor catches
 *       that class. These are the only pinned numbers, and each one traces to a
 *       style constant in src/lib/export/pdf.tsx.
 *
 * Usage:  node tools/smoke-worker-pdf.mjs [--port 8899] [--report]
 *         --report prints the measured geometry and skips the pass/fail assertions.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import PDFParser from 'pdf2json'

const TAG = '[smoke-worker-pdf]'
const argv = process.argv.slice(2)
const REPORT_ONLY = argv.includes('--report')
const PORT = Number((argv.find((a) => a.startsWith('--port')) ?? '').split(/[= ]/)[1] ?? 8899)
const ROUTE = '/api/wasm-health'
const BOOT_TIMEOUT_MS = 120_000

/** A4 landscape, in PDF points. The probe route renders orientation="landscape". */
const PAGE_WIDTH_PT = 841.89

/**
 * MUST MIRROR src/app/api/wasm-health/route.ts. The column-delta assertions are
 * derived from these, so if the route columns change and this list does not, the
 * gate fails loudly rather than silently measuring the wrong thing.
 */
const COLUMNS = [
  { label: 'Date', width: 90 },
  { label: 'Description', width: 250 },
  { label: 'Debit', width: 100, align: 'right' },
  { label: 'Credit', width: 100, align: 'right' },
  { label: 'Balance', width: 100, align: 'right' },
]

const die = (msg, extra) => {
  console.error(`\n${TAG} FAIL  ${msg}`)
  if (extra) console.error(String(extra).split('\n').map((l) => `${TAG}   ${l}`).join('\n'))
  process.exitCode = 1
}

// --- 1. the build must exist ------------------------------------------------
if (!fs.existsSync('.open-next')) {
  console.error(`${TAG} FAIL  .open-next does not exist -- run the worker build first.`)
  process.exit(1)
}

// --- 2. start the worker ----------------------------------------------------
// PDF_WASM_SMOKE is passed as a worker var, not a shell variable: the route reads
// it through process.env, which OpenNext populates from the Cloudflare env. Nothing
// sets it on a real deploy, so the probe route stays 404 in production.
// Forwarded only so this gate can be tested against itself: with the sweep
// harness from tools/yoga-setter-sweep.mjs installed, running
//   YOGA_DROP_SETTERS=setPadding node tools/smoke-worker-pdf.mjs
// reproduces a silent layout collapse INSIDE workerd and the geometry assertions
// below must fail. Unset in every normal run, and nothing sets it on a deploy.
const dropSetters = process.env.YOGA_DROP_SETTERS
const log = []
const child = spawn(
  'npx',
  [
    'wrangler', 'dev', '--port', String(PORT), '--local',
    '--var', 'PDF_WASM_SMOKE:1',
    ...(dropSetters ? ['--var', `YOGA_DROP_SETTERS:${dropSetters}`] : []),
  ],
  {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group off Windows, so kill() below can take down the workerd
    // grandchild too. Without it the group kill fails with ESRCH, wrangler's shell
    // dies, workerd survives holding the port, and the job hangs on CI.
    detached: process.platform !== 'win32',
  },
)
child.stdout.on('data', (d) => log.push(d.toString()))
child.stderr.on('data', (d) => log.push(d.toString()))

function kill() {
  if (child.pid == null || child.exitCode !== null) return
  if (process.platform === 'win32') {
    // child.kill() leaves the workerd grandchild holding the port on Windows.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
}
process.on('exit', kill)
process.on('SIGINT', () => { kill(); process.exit(130) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler exited early (code ${child.exitCode})`)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}${ROUTE}`)
      return res
    } catch {
      await sleep(1000)
    }
  }
  throw new Error(`wrangler did not answer on port ${PORT} within ${BOOT_TIMEOUT_MS / 1000}s`)
}

// --- 3. geometry ------------------------------------------------------------
function parse(buf) {
  return new Promise((resolve, reject) => {
    const p = new PDFParser()
    p.on('pdfParser_dataError', (e) => reject(e.parserError ?? e))
    p.on('pdfParser_dataReady', resolve)
    p.parseBuffer(buf)
  })
}

/**
 * Flatten to {page, x, y, text} with x/y in PDF POINTS. pdf2json reports its own
 * unit; the scale comes from the page itself, so nothing here depends on that unit
 * and the numbers compare directly against the pt-valued styles in
 * src/lib/export/pdf.tsx.
 */
function geometry(doc) {
  const items = []
  ;(doc.Pages ?? []).forEach((pg, pi) => {
    const scale = PAGE_WIDTH_PT / pg.Width
    ;(pg.Texts ?? []).forEach((t) => {
      items.push({
        page: pi,
        x: +(t.x * scale).toFixed(2),
        y: +(t.y * scale).toFixed(2),
        text: (t.R ?? []).map((r) => decodeURIComponent(r.T)).join(''),
      })
    })
  })
  return { pages: (doc.Pages ?? []).length, items }
}

const onPage = (items, p) => items.filter((i) => i.page === p)
const distinct = (nums, dp = 1) => [...new Set(nums.map((n) => +n.toFixed(dp)))].sort((a, b) => a - b)

/** The header cell for a column, on a given page. Headers render uppercase. */
function headerCell(items, page, label) {
  return onPage(items, page).find((i) => i.text.trim().toUpperCase() === label.toUpperCase())
}

/** Measured facts the assertions consume. Computed once, printed by --report. */
function measure(g) {
  const p0 = onPage(g.items, 0)
  const xs = distinct(p0.map((i) => i.x), 2)
  const ys = distinct(p0.map((i) => i.y), 2)
  const dateHdr = headerCell(g.items, 0, 'Date')
  const descHdr = headerCell(g.items, 0, 'Description')
  // Debit runs 123,456.78 .. 124,253.28 and Balance runs 900,000.00 .. 854,502.40:
  // Courier, right-aligned, and TEN CHARACTERS IN BOTH (the route keeps them equal
  // on purpose). So each column lands on exactly ONE x, and because pdf2json reports
  // a run by its left edge, their separation is exactly Debit.width + Credit.width.
  const debitXs = distinct(
    g.items.filter((i) => /^12[34],\d\d\d\.\d\d$/.test(i.text.trim())).map((i) => i.x), 2)
  const balanceXs = distinct(
    g.items.filter((i) => /^(?:8[5-9]\d|900),\d\d\d\.\d\d$/.test(i.text.trim())).map((i) => i.x), 2)
  return {
    pages: g.pages,
    items: g.items.length,
    page0MinX: xs[0],
    page0MinY: ys[0],
    page0DistinctX: xs.length,
    page0DistinctY: ys.length,
    dateHdrX: dateHdr ? dateHdr.x : null,
    descHdrX: descHdr ? descHdr.x : null,
    hdrDelta: dateHdr && descHdr ? +(descHdr.x - dateHdr.x).toFixed(2) : null,
    debitXs,
    balanceXs,
    moneyDelta:
      debitXs.length === 1 && balanceXs.length === 1
        ? +(balanceXs[0] - debitXs[0]).toFixed(2)
        : null,
    headerOnEveryPage: Array.from({ length: g.pages }, (_, p) =>
      onPage(g.items, p).filter((i) => i.text.trim().toUpperCase() === 'DATE').length),
    footers: Array.from({ length: g.pages }, (_, p) =>
      onPage(g.items, p)
        .map((i) => i.text)
        .join('')
        .replace(/\s+/g, ' ')
        .includes(`Page ${p + 1} of ${g.pages}`)),
  }
}

// --- 4. expectations --------------------------------------------------------
// Pinned from an observed-good build. Update deliberately, never to make a red
// build go green: every bound here corresponds to a failure mode named above.
//
// The two frame anchors trace to `page: { padding: 36 }` in src/lib/export/pdf.tsx,
// less a CONSTANT -4pt reporting offset in pdf2json. The offset is not a guess: the
// running head (a direct child of Page, so its true x IS the 36pt page padding)
// reports at x=32, and the DATE header cell (36pt page padding + 4pt cell padding =
// 40pt) reports at x=36. Both are 4pt low. Dropping the padding entirely reports
// x=-4, which is the same offset seen from zero.
//
// A dropped page padding moves BOTH anchors, which is exactly what column deltas
// miss -- every column shifts by the same amount, so every delta still checks out.
const EXPECTED = {
  pages: 3,
  minItems: 300,
  // page 1 carried 14 distinct x and 29 distinct y in the observed-good run; these
  // bounds sit below that with headroom for a font-metric change, and far above the
  // collapse signature (every cell on one x, every row on one y).
  minDistinctX: 12,
  minDistinctY: 24,
  // leftmost text: 36pt page padding, reported as 32
  leftEdge: [30.5, 33.5],
  // topmost text: the same 36pt padding plus the first line box, reported as 33.01
  topEdge: [31.5, 34.5],
}

// --- 5. run -----------------------------------------------------------------
const main = async () => {
  console.log(`${TAG} starting wrangler dev on port ${PORT} ...`)
  const res = await waitForServer()
  const ctype = res.headers.get('content-type') ?? ''
  const raw = Buffer.from(await res.arrayBuffer())

  if (res.status === 404) {
    die(
      `${ROUTE} returned 404 -- the probe route did not see PDF_WASM_SMOKE=1.`,
      'This is a wiring problem in this script, not a WASM failure. The worker var\n' +
        'did not reach process.env. Nothing has been proved either way.',
    )
    return
  }
  if (res.status !== 200) {
    die(`${ROUTE} returned HTTP ${res.status}`, raw.toString('utf8').slice(0, 3000))
    return
  }
  if (!ctype.includes('application/pdf') || raw.subarray(0, 4).toString('ascii') !== '%PDF') {
    die(`${ROUTE} did not return a PDF (content-type: ${ctype})`, raw.toString('utf8').slice(0, 1500))
    return
  }

  const g = geometry(await parse(raw))
  const m = measure(g)

  console.log(`${TAG} bytes            ${raw.length}`)
  console.log(`${TAG} pages            ${m.pages}`)
  console.log(`${TAG} text items       ${m.items}`)
  console.log(`${TAG} page0 min x/y    ${m.page0MinX} / ${m.page0MinY}   (pt, page edge = 0)`)
  console.log(`${TAG} page0 distinct   x=${m.page0DistinctX}  y=${m.page0DistinctY}`)
  console.log(`${TAG} header DATE x    ${m.dateHdrX}`)
  console.log(`${TAG} header DESC x    ${m.descHdrX}   delta=${m.hdrDelta}  (declared ${COLUMNS[0].width})`)
  console.log(`${TAG} debit col x      ${m.debitXs.join(', ')}`)
  console.log(
    `${TAG} balance col x    ${m.balanceXs.join(', ')}   delta=${m.moneyDelta}  ` +
      `(declared ${COLUMNS[2].width + COLUMNS[3].width})`,
  )
  console.log(`${TAG} DATE per page    ${m.headerOnEveryPage.join(', ')}`)
  console.log(`${TAG} footer per page  ${m.footers.join(', ')}`)

  if (REPORT_ONLY) {
    fs.writeFileSync(path.join('.open-next', 'smoke.pdf'), raw)
    console.log(`${TAG} --report: wrote .open-next/smoke.pdf, assertions skipped`)
    return
  }

  // -- assertions ------------------------------------------------------------
  const problems = []
  const E = EXPECTED

  if (m.pages !== E.pages) {
    problems.push(`page count ${m.pages}, expected ${E.pages} -- pagination changed or box heights collapsed`)
  }
  if (m.items < E.minItems) problems.push(`only ${m.items} text items, expected at least ${E.minItems}`)
  if (m.page0DistinctX < E.minDistinctX) {
    problems.push(`page 1 has only ${m.page0DistinctX} distinct x positions, expected >= ${E.minDistinctX} -- columns collapsed`)
  }
  if (m.page0DistinctY < E.minDistinctY) {
    problems.push(`page 1 has only ${m.page0DistinctY} distinct y positions, expected >= ${E.minDistinctY} -- rows stacked`)
  }

  // Page-frame anchors. Column deltas survive a dropped padding or margin -- every
  // column shifts by the same amount -- so measure against the page edge itself.
  if (m.page0MinX < E.leftEdge[0] || m.page0MinX > E.leftEdge[1]) {
    problems.push(
      `leftmost text sits at x=${m.page0MinX}pt, outside [${E.leftEdge.join(', ')}] -- ` +
        `the page padding (36pt) was dropped or changed`,
    )
  }
  if (m.page0MinY < E.topEdge[0] || m.page0MinY > E.topEdge[1]) {
    problems.push(
      `topmost text sits at y=${m.page0MinY}pt, outside [${E.topEdge.join(', ')}] -- ` +
        `the page padding (36pt) was dropped or changed`,
    )
  }

  // Derived: column separations equal the declared widths.
  if (m.hdrDelta == null) {
    problems.push('the DATE / DESCRIPTION header cells are missing -- the table header did not render')
  } else if (Math.abs(m.hdrDelta - COLUMNS[0].width) > 1) {
    problems.push(`DATE -> DESCRIPTION header gap is ${m.hdrDelta}pt, declared ${COLUMNS[0].width}pt`)
  }
  if (m.debitXs.length !== 1) {
    problems.push(`the Debit column is not right-aligned onto one x: ${m.debitXs.join(', ')}`)
  }
  if (m.balanceXs.length !== 1) {
    problems.push(`the Balance column is not right-aligned onto one x: ${m.balanceXs.join(', ')}`)
  }
  if (m.moneyDelta != null && Math.abs(m.moneyDelta - (COLUMNS[2].width + COLUMNS[3].width)) > 1) {
    problems.push(
      `Debit -> Balance gap is ${m.moneyDelta}pt, declared ${COLUMNS[2].width + COLUMNS[3].width}pt ` +
        `(Debit ${COLUMNS[2].width} + Credit ${COLUMNS[3].width})`,
    )
  }

  // react-pdf `fixed` -- the repeating header and the page-number render callback
  // in the footer. Both are layout features a flat single-page table never reaches.
  m.headerOnEveryPage.forEach((n, p) => {
    if (n !== 1) problems.push(`page ${p + 1} carries ${n} DATE headers, expected exactly 1 (repeatHeader)`)
  })
  m.footers.forEach((ok, p) => {
    if (!ok) problems.push(`page ${p + 1} is missing its "Page ${p + 1} of ${m.pages}" footer`)
  })

  if (problems.length) {
    die(`the worker served a PDF, but its layout is wrong:`, problems.join('\n'))
    return
  }
  console.log(`\n${TAG} OK -- the worker rendered a PDF and its geometry is intact.`)
}

main()
  .catch((e) => die(e?.message ?? String(e), log.join('').slice(-4000)))
  .finally(() => kill())
