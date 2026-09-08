#!/usr/bin/env node
/**
 * tools/assert-open-next-wasm.mjs   --   post-build gate.
 *
 * Runs AFTER `opennextjs-cloudflare build` and inspects the BUILD OUTPUT, not the
 * source tree. Its whole job is to convert a silent production 500 into a loud CI
 * failure: without the yoga-layout WASM fix, `next build` and
 * `opennextjs-cloudflare build` both exit 0 and produce a worker whose 23 PDF
 * export routes throw
 *
 *     CompileError: WebAssembly.instantiate(): Wasm code generation disallowed by embedder
 *
 * on the first request. Nothing in the build says a word about it.
 *
 * THE HARD PART: TELLING DEAD BASE64 FROM LIVE BASE64
 * ---------------------------------------------------
 * The fix does NOT remove yoga's base64 Emscripten blob from the bundle. The blob
 * IS the Emscripten runtime; the fix only hands that runtime a pre-compiled
 * WebAssembly.Module through Emscripten's `instantiateWasm` option, so the runtime
 * returns from `Module.instantiateWasm(...)` before it ever reaches its own
 * `WebAssembly.instantiate(<decoded bytes>)` path. That path therefore survives in
 * a WORKING bundle, as dead code. A naive "grep for yoga-wasm-base64 / for
 * WebAssembly.instantiate -> fail" check fires on a perfectly good build.
 *
 * The discriminator is the CALL, not the presence of the code:
 *   working  ->  wrapAssembly(await yoga_wasm_base64_esm_default(await optsPromise))
 *   broken   ->  wrapAssembly(await yoga_wasm_base64_esm_default())
 * An argument-less call to the Emscripten factory means no instantiateWasm hook was
 * supplied, which means the decoded-bytes path is LIVE. That is CHECK 4 below.
 * (esbuild also emits zero-argument `init_yoga_wasm_base64_esm()` lazy-init thunks;
 * those are its ESM module-initialiser wrappers, never the factory, so `init_`-
 * prefixed callees are excluded explicitly.)
 *
 * If the assertion cannot FIND the factory call at all, it fails too. A check that
 * quietly passes because it no longer recognises the bundle is the same disaster as
 * no check.
 *
 * POSIX-safe: node:fs / node:path only, forward slashes.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TAG = '[assert-open-next-wasm]';
const OUT_DIR = process.argv[2] || '.open-next';

const EXPECTED_WASM_BYTES = 71736;
const SHA_EXPECTED_WASM = '7ba9c9483c8c38a468e9aef4a95ed72fad8a43594be8e5123eb3bdb6479edf5b';

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const ok = (m) => notes.push(m);

function walk(dir, filter, acc = [], depth = 0) {
  if (depth > 12) return acc;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, acc, depth + 1);
    else if (filter(e.name, p)) acc.push(p);
  }
  return acc;
}

const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/');

// ---------------------------------------------------------------------------
if (!fs.existsSync(OUT_DIR)) {
  console.error(`\n${TAG} FAILED: build output directory "${OUT_DIR}" does not exist.`);
  console.error(`${TAG} Run \`opennextjs-cloudflare build\` before this assertion.\n`);
  process.exit(1);
}

// -- CHECK 1: a real .wasm module is present in the output -------------------
const wasmFiles = walk(OUT_DIR, (n) => n.endsWith('.wasm'));
if (wasmFiles.length === 0) {
  fail(
    `CHECK 1 no .wasm file anywhere under ${OUT_DIR}/.\n` +
      `        The yoga flexbox engine was not emitted as a static WebAssembly module,\n` +
      `        so the worker can only reach it by compiling base64 bytes at runtime,\n` +
      `        which workerd forbids. Did the npm postinstall (tools/patch-yoga-wasm.mjs)\n` +
      `        run before the build?`,
  );
} else {
  const yoga = wasmFiles.find((p) => path.basename(p) === 'yoga.wasm');
  if (!yoga) {
    fail(
      `CHECK 1 found .wasm file(s) under ${OUT_DIR}/ but none named yoga.wasm:\n` +
        wasmFiles.map((p) => `          ${rel(p)}`).join('\n'),
    );
  } else {
    const buf = fs.readFileSync(yoga);
    const magic = [...buf.subarray(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (magic !== '00 61 73 6d') {
      fail(`CHECK 1 ${rel(yoga)} is not a WebAssembly module (first four bytes: ${magic}, expected 00 61 73 6d).`);
    } else if (buf.length !== EXPECTED_WASM_BYTES || sha !== SHA_EXPECTED_WASM) {
      fail(
        `CHECK 1 ${rel(yoga)} is not the expected yoga engine.\n` +
          `          expected ${EXPECTED_WASM_BYTES} bytes / sha256 ${SHA_EXPECTED_WASM}\n` +
          `          found    ${buf.length} bytes / sha256 ${sha}`,
      );
    } else {
      ok(`CHECK 1 pass  ${rel(yoga)} - ${buf.length} bytes, wasm magic ok, sha256 matches.`);
    }
  }
}

// -- Locate the bundled server handler(s) ------------------------------------
const bundles = walk(OUT_DIR, (n) => n === 'handler.mjs' || n === 'handler.js');
if (bundles.length === 0) {
  fail(
    `no handler.mjs found under ${OUT_DIR}/server-functions/. The assertion cannot\n` +
      `        inspect the built worker, so it refuses to pass.`,
  );
}

// Only the bundle(s) that actually contain yoga-layout are in scope. OpenNext also
// emits .open-next/middleware/handler.mjs, which never renders a PDF and correctly
// contains no yoga at all; asserting against it would be a false alarm.
const yogaBundles = bundles.filter((p) => {
  const s = fs.readFileSync(p, 'utf8');
  return s.includes('yoga-layout') || s.includes('yoga_wasm_base64');
});
if (bundles.length > 0 && yogaBundles.length === 0) {
  fail(
    `none of the ${bundles.length} built handler bundle(s) reference yoga-layout at all:\n` +
      bundles.map((p) => `          ${rel(p)}`).join('\n') +
      `\n        The PDF renderer is expected in the server function bundle. Either the\n` +
      `        PDF routes were dropped from the build or the output shape changed;\n` +
      `        either way this assertion cannot verify anything and refuses to pass.`,
  );
}

for (const bundlePath of yogaBundles) {
  const src = fs.readFileSync(bundlePath, 'utf8');
  const where = rel(bundlePath);

  // -- CHECK 2: the bundle statically imports a .wasm module ------------------
  const wasmImports = [...src.matchAll(/import\s+([A-Za-z0-9_$]+)\s+from\s*["']([^"']*\.wasm)["']/g)];
  if (wasmImports.length === 0) {
    fail(
      `CHECK 2 ${where} contains no static \`import X from "....wasm"\`.\n` +
        `        A statically imported .wasm is the only form workerd will compile.\n` +
        `        Without it the worker falls back to WebAssembly.instantiate() on\n` +
        `        decoded bytes and every PDF route returns HTTP 500.`,
    );
  } else {
    ok(
      `CHECK 2 pass  ${where} statically imports ${wasmImports.length} wasm module(s): ` +
        wasmImports.map((m) => `${m[1]} <- ${path.basename(m[2])}`).join(', '),
    );
  }

  // -- CHECK 3: an instantiateWasm hook builds an Instance from that binding --
  // The binding may be renamed by esbuild (yogaModule -> yogaModule2), so accept
  // the imported name with an optional numeric suffix.
  const bindingNames = wasmImports.map((m) => m[1]);
  const hookRe = /instantiateWasm\s*\(([^)]{0,120})\)\s*\{([\s\S]{0,400}?)\}/g;
  let hookOk = false;
  const hookBodies = [];
  for (const m of src.matchAll(hookRe)) {
    const body = m[2];
    hookBodies.push(body.slice(0, 160));
    const inst = body.match(/new\s+WebAssembly\.Instance\s*\(\s*([A-Za-z0-9_$]+)/);
    if (!inst) continue;
    const arg = inst[1].replace(/\d+$/, '');
    if (bindingNames.length === 0 || bindingNames.some((b) => b.replace(/\d+$/, '') === arg)) {
      hookOk = true;
      ok(`CHECK 3 pass  ${where} defines instantiateWasm(...) building \`new WebAssembly.Instance(${inst[1]}, ...)\` from the statically imported module.`);
      break;
    }
  }
  if (!hookOk) {
    fail(
      `CHECK 3 ${where} has no instantiateWasm hook that constructs a\n` +
        `        WebAssembly.Instance from the statically imported wasm binding` +
        (bindingNames.length ? ` (${bindingNames.join(', ')})` : '') +
        `.\n` +
        `        Emscripten only skips its own WebAssembly.instantiate() path when the\n` +
        `        caller supplies this hook. Note: the bundle always MENTIONS\n` +
        `        "instantiateWasm" - that is Emscripten's own \`if (h.instantiateWasm)\`\n` +
        `        branch - so the mention alone proves nothing.` +
        (hookBodies.length
          ? `\n        instantiateWasm bodies seen: ${JSON.stringify(hookBodies.slice(0, 3))}`
          : ''),
    );
  }

  // -- CHECK 4: the Emscripten factory is never called without options --------
  // See the header comment: this is what separates a dead base64 fallback from a
  // live one. `init_`-prefixed callees are esbuild's lazy module initialisers.
  // Capture the first non-whitespace character after the "(" so that a zero-argument
  // call is detected as ")" rather than as an empty match.
  const callRe = /\b([A-Za-z0-9_$]*yoga_wasm_base64[A-Za-z0-9_$]*)\s*\(\s*([\s\S])/g;
  let factoryCalls = 0;
  let badCalls = 0;
  for (const m of src.matchAll(callRe)) {
    const callee = m[1];
    if (/^init_/.test(callee)) continue; // esbuild ESM lazy-init thunk, always zero-arg
    factoryCalls += 1;
    const args = m[2];
    if (args.startsWith(')')) {
      badCalls += 1;
      fail(
        `CHECK 4 ${where} calls the yoga Emscripten factory with NO arguments:\n` +
          `          ${callee}()\n` +
          `        No options object means no instantiateWasm hook, which means the\n` +
          `        base64 -> WebAssembly.instantiate(bytes) path is LIVE, not dead code.\n` +
          `        workerd will reject it at runtime: "Wasm code generation disallowed by embedder".`,
      );
    }
  }
  if (factoryCalls === 0) {
    fail(
      `CHECK 4 could not find any call to the yoga Emscripten factory in ${where}\n` +
        `        (searched for a callee whose name contains "yoga_wasm_base64" and does\n` +
        `        not start with "init_"). The bundler's naming may have changed, so this\n` +
        `        assertion can no longer tell a working build from a broken one and\n` +
        `        refuses to pass. Update tools/assert-open-next-wasm.mjs.`,
    );
  } else if (badCalls === 0) {
    ok(
      `CHECK 4 pass  ${where} - ${factoryCalls} call(s) to the yoga Emscripten factory, all with an options argument; the base64 path is dead code.`,
    );
  }
}

// ---------------------------------------------------------------------------
for (const n of notes) console.log(`${TAG} ${n}`);

if (problems.length) {
  console.error(`\n${TAG} BUILD REJECTED - ${problems.length} problem(s) in ${OUT_DIR}/\n`);
  for (const p of problems) console.error(`${TAG} ${p}\n`);
  console.error(
    `${TAG} The build would have succeeded and shipped a worker whose PDF export\n` +
      `${TAG} routes return HTTP 500. Failing the build instead.\n`,
  );
  process.exit(1);
}

console.log(`${TAG} OK - ${OUT_DIR} carries the statically imported yoga WASM module.`);
