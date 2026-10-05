// Real data, real session: node live.mjs <states.json> [onlyName...]
// Logs in once as the Principal (read-only View as), keeps the session, then shoots each state.
// states: [{ "name": "today-ethan", "path": "/member?staff=…&department=…", "w": 390, "h": 844, "actions": [...] }]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '../shots/live-prod');
fs.mkdirSync(outDir, { recursive: true });
const base = process.env.APP_BASE || 'http://localhost:3100';
const pwPath = 'C:/Users/wenwe/AppData/Local/npm-cache/_npx/86170c4cd1c5da32/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(pwPath).href);
const exe = 'C:/Users/wenwe/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const stateFile = path.join(here, '../.auth-principal-prod.json');
const states = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const only = new Set(process.argv.slice(3));

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  if (!fs.existsSync(stateFile) || Date.now() - fs.statSync(stateFile).mtimeMs > 50 * 60_000) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 120000 });
    await page.fill('input[name=email]', process.env.LOGIN_EMAIL || 'principal@venture.my');
    await page.fill('input[name=password]', process.env.LOGIN_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 120000 });
    await ctx.storageState({ path: stateFile });
    await ctx.close();
    console.log('logged in');
  }
  for (const st of states) {
    if (only.size && !only.has(st.name)) continue;
    const ctx = await browser.newContext({ storageState: stateFile, viewport: { width: st.w || 390, height: st.h || 844 }, deviceScaleFactor: st.dpr || 1, userAgent: st.ua });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + st.path, { waitUntil: 'networkidle', timeout: 180000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(st.settle || 2500);
    for (const a of st.actions || []) {
      if (a.click) await page.locator(a.click).first().click();
      if (a.eval) await page.evaluate(a.eval);
      await page.waitForTimeout(a.wait || 800);
    }
    if (st.dump) console.log(st.name, await page.evaluate(st.dump));
    await page.screenshot({ path: path.join(outDir, `${st.name}.png`), fullPage: false });
    console.log('shot', st.name, errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'no errors');
    await ctx.close();
  }
} finally {
  await browser.close();
}
