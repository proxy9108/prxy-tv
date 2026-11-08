#!/usr/bin/env node
// Prxy Briefing: news feeds -> grounded summaries (local phi4) -> narration (Piper) -> map video (headless Chromium + ffmpeg).
// Nothing is published unless enough sourced stories came out of it; yesterday's video stays otherwise.
const fs = require('fs'), cp = require('child_process'), path = require('path');
const wb = require('./wb.js');
const ROOT = '/opt/briefing', OUT = ROOT + '/out', WORK = ROOT + '/work';
const TZ = process.env.BRIEFING_TZ || 'America/Los_Angeles';
const FPS = +(process.env.FPS || 24), MAX_STORIES = +(process.env.STORIES || 5);
const OLLAMA = process.env.OLLAMA || 'http://10.20.40.131:11434', MODEL = process.env.MODEL || 'phi4:latest';
const FEEDS = [['BBC News', 'http://feeds.bbci.co.uk/news/world/rss.xml'], ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml'], ['DW', 'https://rss.dw.com/xml/rss-en-world'],
  ['NPR', 'https://feeds.npr.org/1004/rss.xml'], ['The Guardian', 'https://www.theguardian.com/world/rss'],
  ['France 24', 'https://www.france24.com/en/rss'], ['Sky News', 'https://feeds.skynews.com/feeds/rss/world.xml'], ['New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
  ['ABC News (AU)', 'https://www.abc.net.au/news/feed/2942460/rss.xml'], ['CBS News', 'https://www.cbsnews.com/latest/rss/world']];
const log = (...a) => { const l = new Date().toISOString() + ' ' + a.join(' '); console.log(l); try { fs.appendFileSync(WORK + '/log.txt', l + '\n'); } catch (e) { /* ignore */ } };
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });

// ---------- 1. gather ----------
const dec = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
async function gather() {
  const items = [];
  await Promise.all(FEEDS.map(async ([src, url]) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 PrxyBriefing' }, signal: AbortSignal.timeout(20000) }); const x = await r.text();
      (x.match(/<item[\s>][\s\S]*?<\/item>/g) || []).forEach((it) => {
        const g = (t) => { const m = it.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>', 'i')); return m ? dec(m[1]) : ''; };
        const title = g('title'), desc = g('description'), when = Date.parse(g('pubDate') || g('dc:date') || '');
        if (title && (!when || Date.now() - when < 36 * 3600e3)) items.push({ src, title, desc: desc.slice(0, 600), when });
      });
    } catch (e) { log('feed failed', src, e.message); }
  }));
  log('items', items.length); return items;
}

// ---------- 2. pick stories ----------
const countries = JSON.parse(fs.readFileSync(ROOT + '/data/countries.json', 'utf8'));
const ALIAS = { USA: ['U.S.', 'US', 'United States', 'America', 'Washington'], GBR: ['UK', 'Britain', 'United Kingdom', 'British'], PSX: ['Gaza', 'West Bank', 'Palestinian', 'Palestine'], RUS: ['Russia', 'Kremlin', 'Moscow', 'Russian'], UKR: ['Ukraine', 'Ukrainian', 'Kyiv', 'Kiev'], ISR: ['Israel', 'Israeli', 'Tel Aviv'], IRN: ['Iran', 'Iranian', 'Tehran'], CHN: ['China', 'Chinese', 'Beijing'], PRK: ['North Korea'], KOR: ['South Korea'], TWN: ['Taiwan'], SYR: ['Syria', 'Syrian'], LBN: ['Lebanon', 'Lebanese', 'Hezbollah'], YEM: ['Yemen', 'Houthi'], SDN: ['Sudan', 'Sudanese'], VEN: ['Venezuela', 'Venezuelan'], IND: ['India', 'Indian'], PAK: ['Pakistan'], AFG: ['Afghanistan', 'Taliban'], FRA: ['France', 'French', 'Paris'], DEU: ['Germany', 'German', 'Berlin'], TUR: ['Turkey', 'Turkish', 'Türkiye'], SAU: ['Saudi'], EGY: ['Egypt', 'Egyptian'], IRQ: ['Iraq', 'Iraqi'], JPN: ['Japan', 'Japanese'], MEX: ['Mexico', 'Mexican'], CAN: ['Canada', 'Canadian'], COD: ['DR Congo', 'Democratic Republic of Congo'], MMR: ['Myanmar'], CUB: ['Cuba', 'Cuban'], BLR: ['Belarus'], POL: ['Poland', 'Polish'], ARM: ['Armenia'], AZE: ['Azerbaijan'] };
const matchers = {};
Object.keys(countries).forEach((a3) => {
  const c = countries[a3], names = new Set([c.n, c.long, c.adm].filter(Boolean)); (ALIAS[a3] || []).forEach((n) => names.add(n));
  const cs = [...names].filter((n) => n.length <= 3 || /^U\.S\.$/.test(n)), ci = [...names].filter((n) => !(n.length <= 3 || /^U\.S\.$/.test(n)));
  const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  matchers[a3] = [ci.length ? new RegExp('\\b(?:' + ci.map(esc).join('|') + ')\\b', 'i') : null, cs.length ? new RegExp('(?<![A-Za-z])(?:' + cs.map(esc).join('|') + ')(?![A-Za-z])') : null];
});
const mentions = (text) => Object.keys(matchers).filter((a3) => (matchers[a3][0] && matchers[a3][0].test(text)) || (matchers[a3][1] && matchers[a3][1].test(text)));
// Strong, event-type signals. Domestic politics and rhetoric are left out on purpose.
const GEO = /\b(war|military|strike|strikes|missile|troops|army|ceasefire|truce|talks|summit|treaty|sanctions?|tariffs?|nuclear|nato|security council|border|invasion|drone|navy|hostages?|peace|blockade|coup|alliance|airstrike|offensive|embassy|diplomats?|trade deal|rebels?|militia|shelling|attack on|aid|refugees?|un |g7|g20|opec|brics|eu )\b/i;
const SKIP = /\b(football|soccer|cricket|tennis|rugby|olympic|film|movie|music|celebrity|recipe|fashion|royal|oscar|grammy|box office|golf|nba|nfl|horoscope|obituary|podcast|newsletter|opinion|in pictures|quiz|live|what we know|morning briefing|explainer|slams|blasts|rants|mocks|lashes out)\b/i;
const GENERIC = new Set('says said after will could would over amid into from with that this their about more than have has been news world latest report reports reported video watch new year years people government president minister official officials'.split(' '));
const CN = new Set(); Object.values(ALIAS).flat().concat(Object.values(countries).flatMap((c) => [c.n, c.long, c.adm])).filter(Boolean).forEach((n) => n.toLowerCase().split(/[^a-z]+/).forEach((w) => w.length > 2 && CN.add(w.replace(/s$/, ''))));
const keyTokens = (t) => new Set((t.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).map((w) => w.replace(/'s$/, '').replace(/s$/, '')).filter((w) => !GENERIC.has(w) && !STOP_C.has(w)));
const STOP_C = new Set('what when where which while their there these those also after before between during against under again'.split(' '));
function pickStories(items) {
  const pool = items.filter((i) => !SKIP.test(i.title) && (i.title.match(/,/g) || []).length < 2 && GEO.test(i.title + ' ' + i.desc)).map((i) => ({ ...i, cs: mentions(i.title + ' ' + i.desc), tk: keyTokens(i.title) })).filter((i) => i.cs.length);
  // group items that report the same event: they share at least two distinctive words in the headline
  const clusters = [];
  pool.forEach((i) => {
    let best = null, bs = 0;
    clusters.forEach((c) => { const both = [...i.tk].filter((w) => c.tk.has(w)), sh = both.length; if (sh >= 2 && both.some((w) => !CN.has(w)) && sh > bs && !c.items.some((x) => x.src === i.src && x.title === i.title)) { best = c; bs = sh; } });
    if (best) { best.items.push(i); i.tk.forEach((w) => best.tk.add(w)); } else clusters.push({ items: [i], tk: new Set(i.tk) });
  });
  clusters.forEach((c) => { c.srcs = new Set(c.items.map((i) => i.src)); });
  const ok = clusters.filter((c) => c.srcs.size >= 2).sort((a, b) => b.srcs.size - a.srcs.size || b.items.length - a.items.length);
  const chosen = [];
  ok.forEach((c) => { if (chosen.length < MAX_STORIES && !chosen.some((d) => [...c.tk].filter((w) => d.tk.has(w)).length >= 3)) chosen.push(c); });
  // fill the remaining slots with single-outlet stories (marked as such on screen), newest and best-covered first
  clusters.filter((c) => c.srcs.size === 1 && c.items.length >= 1).sort((x, y) => (y.items[0].when || 0) - (x.items[0].when || 0)).forEach((c) => {
    if (chosen.length < MAX_STORIES && !chosen.includes(c) && !chosen.some((d) => [...c.tk].filter((w) => d.tk.has(w)).length >= 2)) { c.single = true; chosen.push(c); }
  });
  return chosen.map((c) => {
    const items = c.items.sort((a, b) => b.cs.length - a.cs.length).slice(0, 4);
    const lead = mentions(items[0].title), freq = {}; items.forEach((i) => i.cs.forEach((x) => (freq[x] = (freq[x] || 0) + 1)));
    const focus = Object.keys(freq).filter((x) => lead.includes(x) || freq[x] >= Math.max(2, Math.ceil(items.length / 2))).sort((a, b) => freq[b] - freq[a]).slice(0, 3);
    return { items, focus: focus.length ? focus : lead.slice(0, 2), sources: [...new Set(items.map((i) => i.src))], single: !!c.single };
  });
}

// ---------- 3. write (grounded) ----------
const words = (s) => (s.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []);
const STOP = new Set('the a an and or of to in on for with at by from as is are was were be been it its this that after over into amid says said'.split(' '));
async function llm(story) {
  const src = story.items.map((i) => '[' + i.src + '] ' + i.title + (i.desc ? ' - ' + i.desc : '')).join('\n');
  const prompt = 'You write a neutral, factual news briefing for a TV screen. Use ONLY facts in the SOURCE TEXT. Never add background, causes, numbers, names or dates that are not in it. Attribute claims to who made them ("officials said"). No speculation and no dramatic adjectives. Reply with JSON only: {"headline": at most 11 words, plain, present tense, wrap the two most important words like **this**; "what": at most 50 words, two or three sentences; "narration": at most 65 words in a spoken style, same facts as "what"}.\n\nSOURCE TEXT:\n' + src;
  try {
    const r = await fetch(OLLAMA + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ model: MODEL, prompt, stream: false, format: 'json', options: { temperature: 0.2, num_predict: 420 } }) });
    const j = JSON.parse((await r.json()).response); return j;
  } catch (e) { log('llm failed', e.message); return null; }
}
function grounded(out, story) {   // reject anything the sources do not support
  if (!out || !out.headline || !out.what || !out.narration) return false;
  const text = story.items.map((i) => i.title + ' ' + i.desc).join(' '), have = new Set(words(text));
  const nums = (s) => (s.match(/\d[\d,.]*/g) || []).map((x) => x.replace(/[,.]$/, ''));
  const srcNums = new Set(nums(text));
  if (![...nums(out.what), ...nums(out.narration), ...nums(out.headline)].every((n) => srcNums.has(n) || n.length < 2)) return false;
  const cap = (out.headline.match(/\b[A-Z][a-z]+/g) || []).map((w) => w.toLowerCase()).filter((w) => !STOP.has(w));
  const bad = cap.filter((w) => !have.has(w)); if (bad.length > 1) return false;
  const body = words(out.what).filter((w) => !STOP.has(w) && w.length > 4); const miss = body.filter((w) => !have.has(w) && !have.has(w.replace(/s$/, '')) && !have.has(w + 's'));
  return body.length === 0 || miss.length / body.length < 0.45;
}
const clip = (s, n) => { const w = s.split(/\s+/); return w.length > n ? w.slice(0, n).join(' ').replace(/[,;:]$/, '') + '...' : s; };
function fallback(story) {
  const i = story.items[0]; const head = clip(i.title.replace(/\*+/g, ''), 12).split(' '); const what = clip(i.desc || i.title, 50);
  return { headline: head.map((w, k) => (k === 0 || k === 1 ? '**' + w + '**' : w)).join(' '), what, narration: what };
}
const tagFor = (s) => { const t = s.items[0].title; if (/\b(fire|crash|accident|earthquake|flood|storm|collapse)\b/i.test(t)) return ['KEY DEVELOPMENT', '']; return /\b(airstrikes?|strikes? on|missiles?|shelling|invasion|offensive|troops|drones?|bombing|killed in|clashes|war)\b/i.test(t) ? ['ESCALATION', 'red'] : /\b(talks|summit|agreement|ceasefire|truce|treaty|deal|negotiat\w*|peace|sanctions?|tariffs?|meets?)\b/i.test(t) ? ['DIPLOMACY', 'blue'] : ['KEY DEVELOPMENT', '']; };

// ---------- 4. narrate ----------
function tts(text, file) {
  cp.execFileSync('/opt/piper/piper/piper', ['--model', '/opt/piper/voices/en_US-ryan-high.onnx', '--output_file', file], { input: text, env: { ...process.env, LD_LIBRARY_PATH: '/opt/piper/piper' }, stdio: ['pipe', 'ignore', 'ignore'] });
  return parseFloat(cp.execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

// ---------- main ----------
(async () => {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: TZ }), pretty = new Date().toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const items = await gather(); let stories = pickStories(items); log('stories picked', stories.length);
  if (stories.length < 3) { log('not enough stories - keeping yesterday'); process.exit(2); }
  for (const s of stories) {
    let o = await llm(s); if (!grounded(o, s)) { log('LLM output rejected or failed, using the source summary'); o = fallback(s); s.note = 'source'; }
    s.headline = o.headline.replace(/\*\*\s+\*\*/g, ' ').replace(/\*\*\*\*/g, ''); s.what = o.what.trim(); s.narration = o.narration.trim(); [s.tag, s.tagColor] = tagFor(s);
    if (s.focus.length >= 2 && s.tag !== 'KEY DEVELOPMENT') { const c = await wb.compare(s.focus[0], s.focus[1], [countries[s.focus[0]].n.toUpperCase(), countries[s.focus[1]].n.toUpperCase()]); if (c.rows.every((r) => r[1] !== 'n/a' && r[2] !== 'n/a')) s.compare = { codes: [s.focus[0], s.focus[1]], ...c }; }
    log('story:', s.headline.replace(/\*\*/g, ''), '|', s.focus.join(','), '|', s.sources.join('/'), s.note || '');
  }
  // timeline: intro + stories + outro
  const allSrc = [...new Set(stories.flatMap((s) => s.sources))];
  const segs = [{ type: 'intro', tag: 'BRIEFING', tagColor: '', headline: "Today's **briefing**", what: stories.length + ' stories, summarised from reporting by ' + allSrc.join(', ') + '.', focus: [], narration: 'Prxy Briefing. ' + pretty.replace(/, \d{4}$/, '') + '. ' + stories.length + ' stories.' },
    ...stories.map((s) => ({ type: 'story', tag: s.tag, tagColor: s.tagColor, headline: s.headline, what: s.what, focus: s.focus, compare: s.compare, sources: s.sources, single: s.single, narration: s.narration })),
    { type: 'outro', tag: 'SOURCES', tagColor: '', headline: 'Read the **original** reporting', what: 'Automated summary of reporting by ' + allSrc.join(', ') + '. It can contain mistakes: check the original articles before relying on it.', focus: [], sources: allSrc, narration: 'That is the briefing. It is an automated summary, so check the original reporting from the sources shown.' }];
  const pads = []; let t = 0;
  segs.forEach((s, i) => { const wav = WORK + '/seg' + i + '.wav', d = tts(s.narration, wav); s.dur = Math.max(s.type === 'story' ? 10 : 6, d + 2.2); s.t0 = t; t += s.dur;
    const pad = WORK + '/pad' + i + '.wav'; cp.execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-af', 'adelay=700|700,apad=whole_dur=' + s.dur, '-ar', '22050', '-ac', '1', pad]); pads.push(pad); });
  fs.writeFileSync(WORK + '/concat.txt', pads.map((p) => "file '" + p + "'").join('\n'));
  cp.execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', WORK + '/concat.txt', '-c', 'copy', WORK + '/audio.wav']);
  const script = { date: pretty, watermark: 'AUTOMATED SUMMARY - VERIFY WITH SOURCES', stories: segs }; fs.writeFileSync(WORK + '/script.json', JSON.stringify(script));
  log('timeline', Math.round(t) + 's, rendering at', FPS, 'fps');
  const file = OUT + '/briefing-' + day + '.mp4';
  const r = cp.spawnSync('/opt/node22/bin/node', [ROOT + '/render.js', WORK + '/script.json', WORK + '/audio.wav', file + '.part', String(FPS)], { stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(file + '.part')) { log('render failed'); process.exit(3); }
  fs.renameSync(file + '.part', file);
  fs.writeFileSync(OUT + '/news.json', JSON.stringify({ date: pretty, day, generated: Date.now(), seconds: Math.round(t), file: path.basename(file), stories: segs.filter((s) => s.type === 'story').map((s) => ({ h: s.headline.replace(/\*\*/g, ''), tag: s.tag, t: Math.round(s.t0), src: s.sources })), sources: allSrc }));
  try { fs.unlinkSync(OUT + '/latest.mp4'); } catch (e) { /* none yet */ } fs.symlinkSync(path.basename(file), OUT + '/latest.mp4');
  fs.readdirSync(OUT).filter((f) => /^briefing-.*\.mp4$/.test(f) && f !== path.basename(file)).sort().slice(0, -6).forEach((f) => fs.unlinkSync(OUT + '/' + f));   // keep a week
  log('done', file);
})().catch((e) => { log('FAILED', e.stack || e.message); process.exit(1); });
