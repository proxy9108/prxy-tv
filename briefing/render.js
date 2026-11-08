// usage: node render.js script.json audio.wav out.mp4 fps   (frames from headless Chromium piped into ffmpeg)
const { chromium } = require('playwright-core'); const fs = require('fs'); const cp = require('child_process');
(async () => {
  const [scriptFile, audio, out, fpsArg] = process.argv.slice(2), FPS = +fpsArg || 24;
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file:///opt/briefing/render.html'); await p.evaluate(() => document.fonts.ready);
  await p.evaluate(([s, c]) => window.build(s, c), [JSON.parse(fs.readFileSync(scriptFile, 'utf8')), JSON.parse(fs.readFileSync('/opt/briefing/data/countries.json', 'utf8'))]);
  await p.waitForTimeout(1500);
  const total = await p.evaluate(() => window.__total), frames = Math.floor(total * FPS);
  const ff = cp.spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', '-f', 'mp4', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await p.evaluate((t) => window.draw(t), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 85 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 240 === 0) console.log('frame', i, '/', frames, Math.round((Date.now() - t0) / 1000) + 's');
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close();
})();
