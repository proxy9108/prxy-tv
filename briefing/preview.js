// usage: node preview.js script.json out_prefix t1 t2 ...   -> PNG frames at those times
const { chromium } = require('playwright-core'); const fs = require('fs');
(async () => {
  const [script, prefix, ...times] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.error('pageerror', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await p.goto('file:///opt/briefing/render.html'); await p.evaluate(() => document.fonts.ready);
  await p.evaluate(([s, c]) => window.build(s, c), [JSON.parse(fs.readFileSync(script, 'utf8')), JSON.parse(fs.readFileSync('/opt/briefing/data/countries.json', 'utf8'))]);
  await p.waitForTimeout(1500);
  for (const t of times) { await p.evaluate((t) => window.draw(t), +t); await p.waitForTimeout(200); await p.screenshot({ path: prefix + '_' + t + '.png' }); }
  await b.close();
})();
