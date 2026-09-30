// Headless smoke test: node tests/smoke.mjs [baseUrl]
// Requires Playwright (npm i -g playwright) and a local server serving index.html.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium, devices } = pw;

const BASE = process.argv[2] || 'http://localhost:8765/index.html';
const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
const failures = [];
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures.push(msg); };

async function run(name, contextOpts) {
  console.log(`\n== ${name} ==`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  // Font CDN may be unreachable in a sandbox; that is not an app error.
  page.on('requestfailed', r => errors.push(`requestfailed ${r.url()} ${r.failure()?.errorText}`));
  page.on('dialog', d => d.accept());
  if (process.env.HTTPS_PROXY) {
    // Sandboxed runs: Chromium can't reach Google Fonts through the egress proxy directly,
    // so fetch the font files from Node (which honours HTTPS_PROXY + the proxy CA) and hand them over.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
      const req = route.request();
      const res = await fetch(req.url(), { headers: { 'user-agent': req.headers()['user-agent'] || '' } });
      await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || '', 'access-control-allow-origin': '*' }, body: Buffer.from(await res.arrayBuffer()) });
    });
  }

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#rows tr');
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => document.fonts.check('16px "IBM Plex Sans Arabic"', 'مرحبا'));
  console.log(`info  IBM Plex Sans Arabic loaded: ${fontOk}`);

  const dir = await page.getAttribute('html', 'dir');
  check(dir === 'rtl', 'document is RTL');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('itdash.tickets.v1')).tickets.length);
  check(stored >= 190 && stored <= 200, `~200 tickets generated and stored (${stored})`);
  const dateOk = await page.evaluate(() => /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(document.querySelector('#rows tr .t-date .ltr').textContent));
  check(dateOk, 'dates rendered as yyyy/m/d');
  check(await page.locator('#barChart svg .bar-row').count() === 5, 'bar chart has 5 teams');
  check(await page.locator('#lineChart svg polyline').count() === 2, 'line chart has 2 series');
  const kpis = await page.$$eval('.k-value', els => els.map(e => e.textContent.trim()));
  check(kpis.every(k => k && k !== '–'), `KPIs populated: ${kpis.join(' | ')}`);
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  check(noHScroll, 'no horizontal page scroll');
  await page.screenshot({ path: `${SHOTS}${name}-light.png`, fullPage: true });

  // Filters
  const total = await page.evaluate(() => JSON.parse(localStorage.getItem('itdash.tickets.v1')).tickets.length);
  await page.selectOption('#fTeam', 'HW');
  const hwRows = await page.$$eval('#rows tr', trs => trs.length);
  const count1 = await page.textContent('#count');
  const allHW = await page.$$eval('#rows tr .t-team', tds => tds.every(td => td.textContent.trim() === 'الأجهزة'));
  check(hwRows > 0 && allHW, `team filter → only Hardware rows (${count1})`);
  await page.selectOption('#fStatus', 'closed');
  const allClosed = await page.$$eval('#rows tr .t-status', tds => tds.every(td => td.textContent.trim() === 'مغلقة'));
  check(allClosed, 'status filter → only closed');
  await page.selectOption('#fPriority', 'high');
  const allHigh = await page.$$eval('#rows tr .t-pri', tds => tds.every(td => td.textContent.trim() === 'عالية'));
  check(allHigh, `priority filter → only high (${await page.textContent('#count')})`);
  await page.click('#clearBtn');
  await page.fill('#q', 'INC-10480');
  await page.waitForTimeout(250);
  check(await page.$$eval('#rows tr', t => t.length) === 1, 'search by id → 1 row');
  await page.click('#clearBtn');
  // Bar click filters by team
  await page.locator('#barChart .bar-row[data-team="L1B"]').click();
  check(await page.inputValue('#fTeam') === 'L1B', 'clicking a bar sets the team filter');
  await page.click('#clearBtn');

  // Detail panel
  await page.locator('#rows tr').first().click();
  await page.waitForSelector('#panel.show');
  await page.waitForTimeout(350);
  check((await page.textContent('#pId')).startsWith('INC-'), 'detail panel opens');
  await page.screenshot({ path: `${SHOTS}${name}-panel.png` });
  await page.click('#pClose');
  await page.waitForTimeout(300);

  // Add ticket (validation first)
  await page.click('#addBtn');
  await page.click('#submitBtn');
  check(await page.evaluate(() => document.querySelector('#dlg').open), 'empty form is not submitted');
  await page.fill('input[name=title]', 'تعذر الدخول إلى نظام الحضور والانصراف');
  await page.selectOption('#nCategory', 'software');
  await page.selectOption('#nPriority', 'critical');
  await page.fill('input[name=requester]', 'نورة الشمري');
  await page.fill('textarea[name=description]', 'تظهر رسالة خطأ 500 عند تسجيل الدخول.');
  await page.screenshot({ path: `${SHOTS}${name}-form.png` });
  await page.click('#submitBtn');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('itdash.tickets.v1')).tickets);
  const added = after[after.length - 1];
  check(after.length === total + 1 && added.title.includes('الحضور') && added.team === 'L1A' && added.priority === 'critical',
    `new ticket saved (${added.id}, team ${added.team})`);
  const firstRow = await page.textContent('#rows tr:first-child .t-title .ttl');
  check(firstRow.includes('الحضور'), 'new ticket appears at top of table');

  // Persistence across reload
  await page.reload(); await page.waitForSelector('#rows tr');
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('itdash.tickets.v1')).tickets.length);
  check(persisted === total + 1, 'data persists after reload');

  // Status change from the panel
  await page.locator('#rows tr').first().click();
  await page.waitForSelector('#panel.show');
  await page.selectOption('#pStatus', 'closed');
  await page.click('#pSave');
  const st = await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('itdash.tickets.v1')).tickets; return t[t.length - 1].status; });
  check(st === 'closed', 'status update from panel persists');
  await page.click('#pClose');
  await page.waitForTimeout(300);

  // Dark mode
  await page.click('#themeBtn');
  check(await page.getAttribute('html', 'data-theme') === 'dark', 'dark mode toggles');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(2800); // let the toast fade
  await page.screenshot({ path: `${SHOTS}${name}-dark.png`, fullPage: true });
  await page.reload(); await page.waitForSelector('#rows tr');
  check(await page.getAttribute('html', 'data-theme') === 'dark', 'theme persists after reload');
  await page.click('#themeBtn');

  // Line chart hover tooltip
  await page.locator('#lineChart').scrollIntoViewIfNeeded();
  const box = await page.locator('#hitArea').boundingBox();
  if (contextOpts.hasTouch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  check(await page.locator('#tip.show').count() === 1, 'line chart tooltip on hover/tap');
  await page.screenshot({ path: `${SHOTS}${name}-tooltip.png` });

  // Reset
  await page.click('#resetBtn');
  await page.waitForTimeout(200);
  const reset = await page.evaluate(() => JSON.parse(localStorage.getItem('itdash.tickets.v1')).tickets);
  check(!reset.some(t => t.title.includes('الحضور والانصراف') && t.requester === 'نورة الشمري'), 'reset regenerates sample data');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' ; ') : ''}`);
  await browser.close();
}

await run('desktop', { viewport: { width: 1366, height: 900 }, locale: 'ar' });
await run('mobile', { ...devices['iPhone 13'], defaultBrowserType: undefined, locale: 'ar' });
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
process.exit(failures.length ? 1 : 0);
