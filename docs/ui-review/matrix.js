// Playwright screenshot matrix for docs/ui-review (run through the Playwright MCP or any page-taking runner).
// Every screen x {Paper, Darkroom} x widths. Captures the first viewport; console errors are collected (App Check 401/403 in dev excluded).
async (page) => {
  const BASE = globalThis.TANDEM_BASE || 'http://localhost:5173';
  const OUT = globalThis.TANDEM_OUT || 'D:/tandem/docs/ui-review/';
  const widths = globalThis.TANDEM_WIDTHS || [[1440, 900], [390, 844]];
  const screens = [
    ['landing', '/'], ['overview', '/studio/#/'], ['start', '/studio/#/start'], ['device', '/studio/#/device'],
    ['probe', '/studio/#/probe'], ['frontier', '/studio/#/frontier'], ['policy', '/studio/#/policy'], ['deploy', '/studio/#/deploy'],
    ['atlas', '/studio/#/atlas'], ['receipts', '/studio/#/receipts'], ['guard', '/studio/#/guard'], ['notes', '/notes/']
  ];
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/40[13]|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of widths) {
      await page.setViewportSize({ width: w, height: h });
      for (const [name, url] of screens) {
        await page.goto(BASE + url, { waitUntil: 'load' });
        await page.evaluate(t => { try { localStorage.setItem('tandem-theme-pref', t); } catch {} document.documentElement.dataset.theme = t; }, theme);
        await page.waitForTimeout(name === 'guard' ? 2200 : 1500);
        await page.screenshot({ path: `${OUT}${name}-${w}-${theme === 'light' ? 'paper' : 'darkroom'}.jpg`, type: 'jpeg', quality: 78 });
      }
    }
  }
  await page.evaluate(() => { try { localStorage.removeItem('tandem-theme-pref'); } catch {} });
  return errs;
}
