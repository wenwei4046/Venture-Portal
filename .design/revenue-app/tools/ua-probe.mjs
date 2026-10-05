// Print Chrome's computed defaults for bare elements, as the prototype sees them.
import { pathToFileURL } from 'node:url';
const pwPath = 'C:/Users/wenwe/AppData/Local/npm-cache/_npx/86170c4cd1c5da32/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(pwPath).href);
const browser = await chromium.launch({ executablePath: 'C:/Users/wenwe/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setContent(`<html><body style="margin:0;font-family:Arial"><div id="w" style="display:flex"><button id="b">x</button><input id="i"><p id="p">p</p><h1 id="h1">h</h1><h2 id="h2">h</h2></div></body></html>`);
const props = ['box-sizing','align-items','padding','border','background-color','color','font-size','font-weight','line-height','letter-spacing','text-align','display','margin','border-radius'];
const out = await page.evaluate(props => Object.fromEntries(['b','i','p','h1','h2'].map(id => {
  const cs = getComputedStyle(document.getElementById(id));
  return [id, Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)]))];
})), props);
console.log(JSON.stringify(out, null, 1));
await browser.close();
