// Prxy TV launcher v0.4. Talks to the device only through the `Tv` bridge (MainActivity). Nothing leaves the TV.
(function () {
  'use strict';
  var main = document.getElementById('main'), menuEl = document.getElementById('menu'), rail = document.getElementById('rail'), chipsEl = document.getElementById('chips');
  var apps = [], inputs = [], view = 'home';
  var st = { pins: [], hidden: [], recents: [], rows: [], theme: 'dynamic', idle: 5, lab: true, usage: {} };
  var feed = null, feedAt = 0, feedSig = '';
  var menuRestore = null, hold = null;
  var STARTERS = ['com.netflix.ninja', 'com.google.android.youtube.tv', 'com.amazon.amazonvideo.webapp', 'com.disney.disneyplus', 'com.plexapp.android'];
  var PRESETS = ['Streaming', 'Games', 'Music', 'Lab', 'Utilities', 'Kids'];

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svg(paths, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); if (cls) s.setAttribute('class', cls);
    paths.forEach(function (d) { var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); });
    return s;
  }
  var ICONS = {
    home: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
    apps: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
    hdmi: ['M4 7h16v7a3 3 0 01-3 3H7a3 3 0 01-3-3z', 'M8 7V4h8v3', 'M9 17v3h6v-3'],
    inputs: ['M4 7h16v7a3 3 0 01-3 3H7a3 3 0 01-3-3z', 'M8 7V4h8v3', 'M9 17v3h6v-3'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    settings: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z'],
    network: ['M5 12.5a10 10 0 0114 0', 'M8.5 16a5 5 0 017 0', 'M12 19.5h.01', 'M2 9a15 15 0 0120 0'],
    display: ['M3 5h18v11H3z', 'M8 20h8', 'M12 16v4'],
    gtv: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
    hidden: ['M3 3l18 18', 'M10.6 6.1A9.5 9.5 0 0112 6c5 0 9 6 9 6a15 15 0 01-3 3.4', 'M6.5 7.5A15 15 0 003 12s4 6 9 6a9 9 0 003.5-.7'],
    access: ['M12 4a2 2 0 100 4 2 2 0 000-4z', 'M5 10h14', 'M12 10v5', 'M9 21l3-6 3 6'],
    info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v5', 'M12 8h.01'],
    mic: ['M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z', 'M19 11a7 7 0 01-14 0', 'M12 18v3'],
    theme: ['M12 3a9 9 0 100 18c1.7 0 2-1 1.4-2-.7-1.2.1-2.5 1.5-2.5H17a4 4 0 004-4A9 9 0 0012 3z', 'M7.5 11h.01', 'M10 7.5h.01', 'M14.5 7.5h.01'],
    saver: ['M12 3a6 6 0 006 6 7 7 0 11-6-6z'],
    lab: ['M9 3h6', 'M10 3v6L5 19a1.5 1.5 0 001.3 2h11.4A1.5 1.5 0 0019 19l-5-10V3'],
    news: ['M4 5h13v14H6a2 2 0 01-2-2z', 'M17 9h3v8a2 2 0 01-2 2', 'M7 9h7M7 12h7M7 15h4'],
    cube: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12l8-4.5M12 12v9M12 12L4 7.5']
  };

  // ---------- state ----------
  function save() { try { window.Tv.setState(JSON.stringify(st)); } catch (e) { /* ignore */ } }
  function loadState() {
    var raw = ''; try { raw = window.Tv.state(); } catch (e) { raw = ''; }
    if (raw) { try { var o = JSON.parse(raw); st = { pins: o.pins || [], hidden: o.hidden || [], recents: o.recents || [], rows: o.rows || [], theme: o.theme || 'dynamic', idle: o.idle == null ? 5 : o.idle, lab: o.lab !== false, usage: o.usage || {} }; return; } catch (e) { /* fall through */ } }
    var old = ''; try { old = window.Tv.pins(); } catch (e) { old = ''; }
    if (old) { try { st.pins = JSON.parse(old); } catch (e) { st.pins = []; } }
    else { var have = {}; apps.forEach(function (a) { have[a.p] = 1; }); st.pins = STARTERS.filter(function (p) { return have[p]; }); }
    save();
  }
  function loadApps() {
    try { apps = JSON.parse(window.Tv.apps()); } catch (e) { apps = []; }
    apps.sort(function (a, b) { return a.l.toLowerCase() < b.l.toLowerCase() ? -1 : 1; });
    try { inputs = JSON.parse(window.Tv.inputs()); } catch (e) { inputs = []; }
  }
  function byPkg(p) { for (var i = 0; i < apps.length; i++) if (apps[i].p === p) return apps[i]; return null; }
  function has(list, p) { return list.indexOf(p) >= 0; }
  function drop(list, p) { var i = list.indexOf(p); if (i >= 0) list.splice(i, 1); }

  // ---------- keep the selection on screen ----------
  // The TV's WebView does not reliably honour scrollIntoView on nested scrollers, so scroll by hand.
  var anim = new WeakMap();
  function slide(node, prop, to, instant) {
    var from = node[prop]; if (Math.abs(to - from) < 2) return;
    var prev = anim.get(node); if (prev) cancelAnimationFrame(prev.id);
    if (instant) { node[prop] = to; return; }
    var t0 = null, dur = 260;
    function step(ts) {
      if (t0 === null) t0 = ts; var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node[prop] = from + (to - from) * e;
      if (k < 1) anim.set(node, { id: requestAnimationFrame(step) }); else anim.delete(node);
    }
    anim.set(node, { id: requestAnimationFrame(step) });
  }
  function reveal(n, instant) {
    if (!main.contains(n)) return;
    var mr = main.getBoundingClientRect(), r = n.getBoundingClientRect(), mh = main.clientHeight;
    var top = main.scrollTop + (r.top - mr.top) + r.height / 2 - mh * 0.46;
    slide(main, 'scrollTop', Math.max(0, Math.min(top, main.scrollHeight - mh)), instant);
    var row = n.parentNode && n.parentNode.classList && n.parentNode.classList.contains('row') ? n.parentNode : null;
    if (row) {
      var rr = row.getBoundingClientRect(), left = row.scrollLeft + (r.left - rr.left) + r.width / 2 - row.clientWidth * 0.4;
      slide(row, 'scrollLeft', Math.max(0, Math.min(left, row.scrollWidth - row.clientWidth)), instant);
    }
  }

  // ---------- themes ----------
  var THEMES = { dynamic: null, midnight: [58, 86, 214], aurora: [28, 168, 138], ember: [226, 96, 44], violet: [134, 84, 232], slate: [96, 108, 128] };
  var THEME_ORDER = ['dynamic', 'midnight', 'aurora', 'ember', 'violet', 'slate'];
  var THEME_LABEL = { dynamic: 'Dynamic - follows what you select', midnight: 'Midnight blue', aurora: 'Aurora green', ember: 'Ember orange', violet: 'Violet', slate: 'Slate grey' };
  function applyTheme() { var f = THEMES[st.theme]; if (f) { setGlow(f); wash(null); } }

  // ---------- ambient colour (taken from the focused tile) ----------
  var tints = {};
  function vivid(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 0.001) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
    }
    s = Math.max(s, 0.7); l = Math.min(0.56, Math.max(0.44, l));       // rich, never muddy or washed out
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  }
  // A 32x18 copy of the focused artwork, stretched to the whole screen, is a free soft colour wash (no blur filter needed).
  var bd = [document.getElementById('bd0'), document.getElementById('bd1')], bdOn = 0;
  function wash(img) {
    var next = bd[1 - bdOn], cur = bd[bdOn];
    if (!img) { cur.classList.remove('on'); return; }
    try {
      var c = document.createElement('canvas'); c.width = 32; c.height = 18; c.getContext('2d').drawImage(img, 0, 0, 32, 18);
      next.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
      next.classList.add('on'); cur.classList.remove('on'); bdOn = 1 - bdOn;
    } catch (e) { cur.classList.remove('on'); }
  }
  function dominant(img) {
    try {
      var c = document.createElement('canvas'); c.width = 32; c.height = 18; var x = c.getContext('2d');
      x.drawImage(img, 0, 0, 32, 18); var d = x.getImageData(0, 0, 32, 18).data, r = 0, g = 0, b = 0, w = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        var mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        if (mx < 40 || mn > 215) continue;                // skip near-black and near-white
        var wt = 1 + (mx - mn) / 32;                       // favour saturated pixels
        r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
      }
      return w ? vivid([r / w, g / w, b / w]) : null;
    } catch (e) { return null; }
  }
  function setGlow(rgb) {
    var s = document.body.style;
    s.setProperty('--gr', rgb[0]); s.setProperty('--gg', rgb[1]); s.setProperty('--gb', rgb[2]);
  }
  document.addEventListener('focusin', function (e) {
    var n = e.target; if (!n || !n.dataset) return;
    var key = n.dataset.pkg || n.dataset.key, rgb = tints[key];
    if (!rgb) {
      var img = n.querySelector && n.querySelector('img');
      rgb = img && img.complete ? dominant(img) : null; if (rgb) tints[key] = rgb;
    }
    var fixed = THEMES[st.theme];
    setGlow(fixed || rgb || [62, 98, 224]);                // a chosen theme wins; otherwise the tile's colour, else deep blue
    var pic = n.querySelector && n.querySelector('img.ban'); wash(!fixed && pic && pic.complete ? pic : null);
    reveal(n);
  });


  // ---------- building blocks ----------
  function artFor(a) {
    var art = el('div', 'art'); var img = el('img', a.b ? 'ban' : 'ico'); img.alt = '';
    img.src = a.b ? 'data:image/jpeg;base64,' + a.b : 'data:image/png;base64,' + a.i; art.appendChild(img); return art;
  }
  function tile(a, size, key, ctx) {
    var t = el('div', 'tile ' + size + (has(st.pins, a.p) ? ' pinned' : ''));
    t.tabIndex = 0; t.setAttribute('role', 'button'); t.setAttribute('aria-label', a.l);
    t.dataset.key = key; t.dataset.pkg = a.p; t.dataset.nav = '1'; t.dataset.ctx = ctx || '';
    t.appendChild(artFor(a)); t.appendChild(el('div', 'name', a.l)); return t;
  }
  function section(label, count) {
    var s = el('section', 'sec'); var h = el('div', 'sec-head');
    h.appendChild(el('div', 'sec-label', label)); if (count != null) h.appendChild(el('div', 'sec-count', String(count)));
    s.appendChild(h); return s;
  }
  function rowOf(pkgs, size, prefix, ctx) {
    var row = el('div', 'row'); pkgs.forEach(function (p) { var a = byPkg(p); if (a) row.appendChild(tile(a, size, prefix + p, ctx)); }); return row;
  }
  function card(kind, title, sub, icon) {
    var c = el('div', 'card glass'); c.tabIndex = 0; c.setAttribute('role', 'button'); c.dataset.nav = '1'; c.dataset.key = 'sys:' + kind; c.dataset.sys = kind;
    c.appendChild(svg(ICONS[icon || kind])); var d = el('div'); d.appendChild(el('div', 't', title)); d.appendChild(el('div', 's', sub)); c.appendChild(d); return c;
  }
  function ago(t) {
    var m = Math.max(1, Math.round((Date.now() - t) / 60000));
    if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago');
  }

  // ---------- chrome: rail and top chips ----------
  var VIEWS = [['home', 'Home'], ['news', 'News'], ['apps', 'Apps'], ['inputs', 'Inputs'], ['more', 'More']];
  function buildChrome() {
    var mk = el('div', 'mark'); mk.appendChild(svg(ICONS.cube)); rail.appendChild(mk);
    VIEWS.forEach(function (v) {
      var b = el('div', 'ri' + (v[0] === view ? ' active' : '')); b.tabIndex = 0; b.setAttribute('role', 'button'); b.setAttribute('aria-label', v[1]);
      b.dataset.nav = '1'; b.dataset.view = v[0]; b.dataset.key = 'rail:' + v[0]; b.appendChild(svg(ICONS[v[0]])); rail.appendChild(b);
    });
    [['voice', 'Search', 'mic'], ['settings', 'Settings', 'settings'], ['network', 'Network', 'network'], ['gtv', 'Google TV', 'gtv']].forEach(function (c) {
      var ch = el('div', 'chip'); ch.tabIndex = 0; ch.setAttribute('role', 'button'); ch.dataset.nav = '1'; ch.dataset.sys = c[0]; ch.dataset.key = 'chip:' + c[0];
      ch.appendChild(svg(ICONS[c[2]])); ch.appendChild(document.createTextNode(c[1])); chipsEl.appendChild(ch);
    });
  }
  function setView(v) {
    if (v === view && main.firstChild) return;
    view = v; main.scrollTop = 0;
    Array.prototype.forEach.call(rail.querySelectorAll('.ri'), function (b) { b.classList.toggle('active', b.dataset.view === v); });
    renderMain();
  }

  // ---------- views ----------
  function clockWidget() {
    var w = el('div', 'w w-clock glass');
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 100 100');
    function sh(tag, attrs) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) n.setAttribute(k, attrs[k]); s.appendChild(n); return n; }
    sh('circle', { cx: 50, cy: 50, r: 46, class: 'face' });
    for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6, r1 = i % 3 === 0 ? 36 : 40; sh('line', { x1: 50 + Math.sin(a) * r1, y1: 50 - Math.cos(a) * r1, x2: 50 + Math.sin(a) * 43, y2: 50 - Math.cos(a) * 43, class: 'tick' }); }
    sh('line', { id: 'hand-h', x1: 50, y1: 50, x2: 50, y2: 27, class: 'hand-h' }); sh('line', { id: 'hand-m', x1: 50, y1: 50, x2: 50, y2: 15, class: 'hand-m' }); sh('circle', { cx: 50, cy: 50, r: 3, class: 'pin' });
    w.appendChild(s);
    var d = el('div'); d.appendChild(el('div', 'w-day', '')); d.firstChild.id = 'w-day'; var n = el('div', 'w-num', ''); n.id = 'w-num'; d.appendChild(n); var m = el('div', 'w-mon', ''); m.id = 'w-mon'; d.appendChild(m);
    w.appendChild(d); return w;
  }
  function fmt(n) { return n == null ? '-' : Number(n).toLocaleString(); }
  function labWidget(l) {
    var w = el('div', 'w w-lab glass'); var attention = l.red > 0, review = l.amber > 0;
    w.appendChild(el('div', 'kicker', 'Lab'));
    var s = el('div', 'lab-status'); s.appendChild(el('span', 'dot ' + (attention ? 'red' : review ? 'amber' : 'green')));
    s.appendChild(document.createTextNode(attention ? l.red + ' need' + (l.red === 1 ? 's' : '') + ' attention' : review ? l.amber + ' to review' : 'All clear')); w.appendChild(s);
    [['Blocked (24 h)', l.blocked], ['New devices', l.newDevices], ['Active devices', l.active]].forEach(function (r) {
      var row = el('div', 'lab-row'); row.appendChild(el('span', null, r[0])); row.appendChild(el('b', null, fmt(r[1]))); w.appendChild(row);
    });
    return w;
  }
  var WX = function (c) { return c === 0 ? 'Clear' : c <= 2 ? 'Partly cloudy' : c === 3 ? 'Overcast' : c <= 48 ? 'Fog' : c <= 57 ? 'Drizzle' : c <= 67 ? 'Rain' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : 'Thunderstorm'; };
  var WXI = function (c) { return c === 0 ? ['M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'] : c <= 3 || c <= 48 ? ['M7 18a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.3 3.3 0 0117 18z'] : c <= 82 ? ['M7 14a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.3 3.3 0 0117 14z', 'M8 17l-1 3M12 17l-1 3M16 17l-1 3'] : ['M7 14a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.3 3.3 0 0117 14z', 'M12 14l-2 4h4l-2 4']; };
  function weatherWidget(x) {
    var w = el('div', 'w w-wx glass'); w.appendChild(el('div', 'kicker', x.label || 'Weather'));
    var top = el('div', 'wx-top'); top.appendChild(svg(WXI(x.code), 'wx-ico')); var t = el('div', 'wx-temp', x.temp + '\u00b0'); top.appendChild(t); w.appendChild(top);
    w.appendChild(el('div', 'wx-desc', WX(x.code) + ' - feels ' + x.feels + '\u00b0'));
    var days = el('div', 'wx-days'); (x.days || []).slice(1, 4).forEach(function (d) {
      var c = el('div', 'wx-day'); c.appendChild(el('span', null, new Date(d.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short' }))); c.appendChild(el('b', null, d.hi + '\u00b0 / ' + d.lo + '\u00b0')); days.appendChild(c);
    }); w.appendChild(days); return w;
  }
  function renderHome(frag) {
    var wid = el('div', 'widgets'); wid.appendChild(clockWidget());
    var last = null, lastT = 0;
    for (var i = 0; i < st.recents.length && !last; i++) { var ra = byPkg(st.recents[i].p); if (ra) { last = ra; lastT = st.recents[i].t; } }
    var cont = el('div', 'w w-continue glass');
    if (last) {
      cont.tabIndex = 0; cont.setAttribute('role', 'button'); cont.dataset.nav = '1'; cont.dataset.key = 'hero'; cont.dataset.pkg = last.p; cont.dataset.ctx = 'hero';
      cont.appendChild(artFor(last)); var tx = el('div', 'txt'); tx.appendChild(el('div', 'kicker', 'Continue')); tx.appendChild(el('div', 'title', last.l)); tx.appendChild(el('div', 'sub', 'Opened ' + ago(lastT))); cont.appendChild(tx);
    } else {
      var tx2 = el('div', 'txt'); tx2.appendChild(el('div', 'kicker', 'Welcome')); tx2.appendChild(el('div', 'title', 'Pick something to watch')); tx2.appendChild(el('div', 'sub', 'Apps you open show up here')); cont.appendChild(tx2);
    }
    wid.appendChild(cont);
    var wx = feed && feed.weather;
    if (wx) wid.appendChild(weatherWidget(wx));
    if (st.lab && feed && feed.lab && feed.lab.ok) wid.appendChild(labWidget(feed.lab));
    if (inputs.length && !(wx && st.lab && feed && feed.lab && feed.lab.ok)) {
      var wi = el('div', 'w w-inputs glass'); wi.appendChild(el('div', 'kicker', 'Inputs'));
      inputs.slice(0, 4).forEach(function (n) {
        var r = el('div', 'irow'); r.tabIndex = 0; r.setAttribute('role', 'button'); r.dataset.nav = '1'; r.dataset.key = 'win:' + n.id; r.dataset.input = n.id;
        r.appendChild(svg(ICONS.hdmi)); r.appendChild(document.createTextNode(n.l)); wi.appendChild(r);
      });
      wid.appendChild(wi);
    }
    var s0 = el('section', 'sec'); s0.appendChild(wid); frag.appendChild(s0);

    var pinned = st.pins.filter(byPkg); var s1 = section('Pinned', pinned.length);
    if (pinned.length) s1.appendChild(rowOf(pinned, 'big', 'pin:', 'pin'));
    else { var e = el('div', 'empty'); e.appendChild(document.createTextNode('Nothing pinned yet. Open the ')); e.appendChild(el('b', null, 'Apps')); e.appendChild(document.createTextNode(' page and hold ')); e.appendChild(el('b', null, 'OK')); e.appendChild(document.createTextNode(' on an app to pin it here.')); s1.appendChild(e); }
    frag.appendChild(s1);
    st.rows.forEach(function (r) {
      var list = r.apps.filter(byPkg); if (!list.length) return;
      var s = section(r.name, list.length); s.appendChild(rowOf(list, 'mid', 'row:' + r.name + ':', 'row:' + r.name)); frag.appendChild(s);
    });
    var ar = around(); if (ar.length) { var sa = section('Around this time', ar.length); sa.appendChild(rowOf(ar, 'mid', 'sug:', 'sug')); frag.appendChild(sa); }
    var mu = mostUsed().filter(function (p) { return ar.indexOf(p) < 0; }); if (mu.length) { var sm = section('Most used', mu.length); sm.appendChild(rowOf(mu, 'mid', 'top:', 'top')); frag.appendChild(sm); }
    var rec = st.recents.map(function (x) { return x.p; }).filter(byPkg).slice(1, 8);
    if (rec.length) { var sr = section('Recent', rec.length); sr.appendChild(rowOf(rec, 'mid', 'rec:', 'rec')); frag.appendChild(sr); }
  }
  function renderApps(frag) {
    var shown = apps.filter(function (a) { return !has(st.hidden, a.p); });
    var s = section('All apps', shown.length); var g = el('div', 'grid');
    shown.forEach(function (a) { g.appendChild(tile(a, 'sm', 'all:' + a.p, 'all')); }); s.appendChild(g); frag.appendChild(s);
  }
  function renderInputs(frag) {
    var s = section('Inputs', inputs.length);
    if (!inputs.length) s.appendChild(el('div', 'empty', 'This TV did not report any inputs.'));
    else {
      var g = el('div', 'grid');
      inputs.forEach(function (n) {
        var t = el('div', 'tile sm input'); t.tabIndex = 0; t.setAttribute('role', 'button'); t.dataset.nav = '1'; t.dataset.key = 'in:' + n.id; t.dataset.input = n.id;
        var art = el('div', 'art'); art.appendChild(svg(ICONS.hdmi)); t.appendChild(art); t.appendChild(el('div', 'name', n.l)); g.appendChild(t);
      });
      s.appendChild(g);
    }
    frag.appendChild(s);
  }
  var TAGCLS = { 'ESCALATION': 'red', 'DIPLOMACY': 'blue' };
  function mmss(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function renderNews(frag) {
    var n = feed && feed.news, s = section('News');
    if (!n) {
      s.appendChild(el('div', 'empty', feed ? 'No briefing yet. A new one is built every morning at 6:00.' : 'The lab is not reachable right now, so there is no briefing to show.'));
      frag.appendChild(s); return;
    }
    var hero = el('div', 'w news-hero glass'); hero.tabIndex = 0; hero.setAttribute('role', 'button'); hero.dataset.nav = '1'; hero.dataset.key = 'news:play'; hero.dataset.play = '0';
    var txt = el('div', 'txt'); txt.appendChild(el('div', 'kicker', 'Prxy Briefing'));
    txt.appendChild(el('div', 'title', n.date)); txt.appendChild(el('div', 'sub', n.stories.length + ' stories - ' + mmss(n.seconds) + ' - OK to play'));
    txt.appendChild(el('div', 'srcs', 'Summarised from ' + n.sources.join(', '))); hero.appendChild(txt);
    var play = el('div', 'playbtn'); play.appendChild(svg(['M8 5v14l11-7z'])); hero.appendChild(play); s.appendChild(hero);
    var list = el('div', 'nlist');
    n.stories.forEach(function (st, i) {
      var r = el('div', 'nrow glass'); r.tabIndex = 0; r.setAttribute('role', 'button'); r.dataset.nav = '1'; r.dataset.key = 'news:' + i; r.dataset.play = String(st.t * 1000);
      r.appendChild(el('span', 'nt', mmss(st.t))); r.appendChild(el('span', 'ntag ' + (TAGCLS[st.tag] || ''), st.tag)); r.appendChild(el('span', 'nh', st.h)); list.appendChild(r);
    });
    s.appendChild(list); s.appendChild(el('div', 'ndisc', 'Automated summary of the reporting above. It can contain mistakes: check the original articles before relying on it.'));
    frag.appendChild(s);
  }
  function renderMore(frag) {
    var s = section('More'); var c = el('div', 'cards');
    c.appendChild(card('theme', 'Theme', THEME_LABEL[st.theme] + ' - press OK to change'));
    c.appendChild(card('saver', 'Screen saver', (st.idle ? 'Starts after ' + st.idle + ' min idle' : 'Off') + ' - press OK to change'));
    c.appendChild(card('lab', 'Lab link', !st.lab ? 'Off' : feed && feed.lab && feed.lab.ok ? 'Connected - shows on Home' : 'Not reachable right now - press OK to turn off'));
    c.appendChild(card('display', 'Display', 'Picture and screen'));
    var hb = false; try { hb = window.Tv.homeButton(); } catch (e) { hb = false; }
    c.appendChild(card('access', 'Home button', hb ? 'Active - Home opens Prxy TV' : 'Off - press OK to turn it on'));
    if (st.hidden.some(byPkg)) c.appendChild(card('hidden', 'Hidden apps', st.hidden.filter(byPkg).length + ' hidden - choose one to restore'));
    c.appendChild(card('about', 'About Prxy TV', 'Version 0.6', 'info'));
    s.appendChild(c); frag.appendChild(s);
  }
  function renderMain() {
    var keep = document.activeElement && document.activeElement.dataset && main.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    main.textContent = '';
    if (!window.Tv) { main.appendChild(el('div', 'err', 'This page only works inside the Prxy TV app.')); return; }
    var frag = document.createDocumentFragment();
    ({ home: renderHome, news: renderNews, apps: renderApps, inputs: renderInputs, more: renderMore })[view](frag);
    main.appendChild(frag); tick();
    if (keep) focusKey(keep);
  }
  function render() { renderMain(); if (!main.contains(document.activeElement)) focusFirst(); }
  function focusKey(k) { if (!k) return false; var n = document.querySelector('[data-key="' + k.replace(/"/g, '') + '"]'); if (n) { n.focus(); return true; } return false; }
  function focusFirst() { var n = main.querySelector('[data-nav]'); if (n) n.focus(); else { var r = rail.querySelector('.ri.active'); if (r) r.focus(); } }

  // ---------- menus ----------
  function closeMenu() { menuEl.hidden = true; menuEl.textContent = ''; }
  function openMenu(title, sub, options, restoreKey) {
    menuRestore = restoreKey || (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null);
    menuEl.textContent = '';
    var m = el('div', 'menu'); m.appendChild(el('h2', null, title)); if (sub) m.appendChild(el('div', 'pk', sub));
    options.forEach(function (o) { var b = el('div', 'opt', o[0]); b.tabIndex = 0; b.dataset.nav = '1'; b._do = o[1]; m.appendChild(b); });
    menuEl.appendChild(m); menuEl.hidden = false; m.querySelector('.opt').focus();
  }
  function done(restoreKey) { closeMenu(); save(); renderMain(); if (!focusKey(restoreKey || menuRestore)) focusFirst(); }
  function rowFor(name) { for (var i = 0; i < st.rows.length; i++) if (st.rows[i].name === name) return st.rows[i]; return null; }
  function appMenu(n) {
    var a = byPkg(n.dataset.pkg); if (!a) return; var ctx = n.dataset.ctx, key = n.dataset.key, p = a.p, opts = [];
    var pinned = has(st.pins, p);
    opts.push([pinned ? 'Remove from Pinned' : 'Pin to Home', function () { if (pinned) drop(st.pins, p); else st.pins.push(p); done(); }]);
    if (ctx === 'pin' && st.pins.indexOf(p) > 0) opts.push(['Move earlier', function () { var i = st.pins.indexOf(p); st.pins.splice(i, 1); st.pins.splice(i - 1, 0, p); done(key); }]);
    opts.push(['Add to a row...', function () {
      openMenu('Add ' + a.l + ' to', 'Rows appear on Home once they have an app', PRESETS.map(function (name) {
        var r = rowFor(name), inRow = r && has(r.apps, p);
        return [(inRow ? 'Remove from ' : 'Add to ') + name, function () {
          if (!r) { r = { name: name, apps: [] }; st.rows.push(r); }
          if (inRow) drop(r.apps, p); else r.apps.push(p);
          st.rows = st.rows.filter(function (x) { return x.apps.length; }); done();
        }];
      }).concat([['Back', function () { appMenu(n); }]]), menuRestore);
    }]);
    if (ctx.indexOf('row:') === 0) { var rn = ctx.slice(4); opts.push(['Remove from ' + rn, function () { var r = rowFor(rn); if (r) drop(r.apps, p); st.rows = st.rows.filter(function (x) { return x.apps.length; }); done(); }]); }
    if (ctx === 'all') opts.push(['Hide from Apps', function () { if (!has(st.hidden, p)) st.hidden.push(p); done(); }]);
    opts.push(['App info and uninstall', function () { closeMenu(); window.Tv.appInfo(p); }]);
    opts.push(['Cancel', function () { closeMenu(); focusKey(menuRestore); }]);
    openMenu(a.l, p, opts, key);
  }
  function hiddenMenu() {
    var list = st.hidden.map(byPkg).filter(Boolean);
    openMenu('Hidden apps', 'Choose one to bring it back', list.map(function (a) { return ['Show ' + a.l, function () { drop(st.hidden, a.p); done('sys:hidden'); }]; }).concat([['Close', function () { closeMenu(); focusKey('sys:hidden'); }]]), 'sys:hidden');
  }
  function homeHelp() {
    openMenu('Home button', 'Optional: make the Home button open Prxy TV', [
      ['Open Accessibility settings', function () { closeMenu(); window.Tv.accessibility(); }],
      ['How it works', function () { openMenu('How it works', 'In Accessibility, switch on "Prxy TV Home button". Switch it off there to go back.', [['Open Accessibility settings', function () { closeMenu(); window.Tv.accessibility(); }], ['Back', function () { homeHelp(); }]], 'sys:access'); }],
      ['Close', function () { closeMenu(); focusKey('sys:access'); }]
    ], 'sys:access');
  }
  function aboutMenu() {
    openMenu('About Prxy TV', 'Version 0.6', [['Your apps, pins and history stay on this TV. The app only contacts your lab feed (one address), and only for counts and weather.', function () { closeMenu(); focusKey('sys:about'); }], ['Close', function () { closeMenu(); focusKey('sys:about'); }]], 'sys:about');
  }

  // ---------- actions ----------
  function touch(p) {
    st.recents = st.recents.filter(function (x) { return x.p !== p; }); st.recents.unshift({ p: p, t: Date.now() }); st.recents = st.recents.slice(0, 12);
    var u = st.usage[p] || (st.usage[p] = { n: 0, h: [] }); u.n++; var hr = new Date().getHours(); for (var i = 0; i < 24; i++) u.h[i] = u.h[i] || 0; u.h[hr]++;
    save();
  }
  function around() {                       // apps you usually open near this hour (from your own history, kept on the TV)
    var hr = new Date().getHours(), out = [];
    Object.keys(st.usage).forEach(function (p) { var h = st.usage[p].h, c = (h[(hr + 23) % 24] || 0) + (h[hr] || 0) + (h[(hr + 1) % 24] || 0); if (c >= 2 && byPkg(p)) out.push([p, c]); });
    out.sort(function (a, b) { return b[1] - a[1]; }); return out.slice(0, 7).map(function (x) { return x[0]; });
  }
  function mostUsed() {
    var out = Object.keys(st.usage).filter(function (p) { return st.usage[p].n >= 3 && byPkg(p); });
    out.sort(function (a, b) { return st.usage[b].n - st.usage[a].n; }); return out.slice(0, 7);
  }
  function activate(n) {
    if (n._do) { n._do(); return; }
    if (n.dataset.pkg) { touch(n.dataset.pkg); window.Tv.launch(n.dataset.pkg); }
    else if (n.dataset.input) window.Tv.input(n.dataset.input);
    else if (n.dataset.play != null) { window.Tv.playNews(parseInt(n.dataset.play, 10) || 0); }
    else if (n.dataset.view) { setView(n.dataset.view); focusFirst(); }
    else if (n.dataset.sys === 'gtv') window.Tv.googleHome();
    else if (n.dataset.sys === 'voice') window.Tv.voice();
    else if (n.dataset.sys === 'theme') { st.theme = THEME_ORDER[(THEME_ORDER.indexOf(st.theme) + 1) % THEME_ORDER.length]; save(); applyTheme(); if (!THEMES[st.theme]) setGlow([62, 98, 224]); renderMain(); focusKey('sys:theme'); }
    else if (n.dataset.sys === 'saver') { var IDLE = [0, 2, 5, 10, 20]; st.idle = IDLE[(IDLE.indexOf(st.idle) + 1) % IDLE.length]; if (IDLE.indexOf(st.idle) < 0) st.idle = 5; save(); resetIdle(); renderMain(); focusKey('sys:saver'); }
    else if (n.dataset.sys === 'lab') { st.lab = !st.lab; save(); if (st.lab) pollFeed(); renderMain(); focusKey('sys:lab'); }
    else if (n.dataset.sys === 'hidden') hiddenMenu();
    else if (n.dataset.sys === 'access') homeHelp();
    else if (n.dataset.sys === 'about') aboutMenu();
    else if (n.dataset.sys) window.Tv.system(n.dataset.sys);
  }

  // ---------- D-pad navigation ----------
  function move(dir) {
    var inMenu = !menuEl.hidden, cur = document.activeElement;
    var scope = inMenu ? menuEl : document.body;
    if (!cur || !scope.contains(cur) || !cur.dataset || !cur.dataset.nav) { var f = inMenu ? menuEl.querySelector('[data-nav]') : document.querySelector('.ri.active'); if (f) f.focus(); return; }
    var inRail = rail.contains(cur), inMain = main.contains(cur);
    if (inRail && dir === 'right') { focusFirst(); return; }
    if (inRail && dir === 'left') return;
    var list = Array.prototype.slice.call(scope.querySelectorAll('[data-nav]')).filter(function (n) { return inMenu || (inRail ? rail.contains(n) : !rail.contains(n)); });
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bs = 1e12, sameRow = false;
    list.forEach(function (n) {
      if (n === cur) return;
      var q = n.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy, p, s;
      if (dir === 'right') { if (dx <= 4) return; p = dx; s = Math.abs(dy); }
      else if (dir === 'left') { if (dx >= -4 || Math.abs(dy) > r.height * 0.7) return; p = -dx; s = Math.abs(dy); }   // left stays in the row
      else if (dir === 'down') { if (dy <= 4) return; p = dy; s = Math.abs(dx); }
      else { if (dy >= -4) return; p = -dy; s = Math.abs(dx); }
      var score = p + s * 3; if (score < bs) { bs = score; best = n; }
    });
    if (best) best.focus();
    else if (inMain && dir === 'left') { var ar = rail.querySelector('.ri.active'); if (ar) ar.focus(); }  // left edge of the page: back to the rail
  }
  var KEYS = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' };
  document.addEventListener('keydown', function (e) {
    if (KEYS[e.key]) { e.preventDefault(); move(KEYS[e.key]); return; }
    var n = document.activeElement;
    if (e.key === 'ContextMenu' || e.key === 'F1') { e.preventDefault(); if (n && n.dataset && n.dataset.pkg && menuEl.hidden) appMenu(n); return; }
    if (e.key === 'Enter') {
      e.preventDefault(); if (e.repeat || hold) return;
      // Long press on an app opens its menu; a short press opens the app.
      if (n && n.dataset && n.dataset.pkg && menuEl.hidden) hold = setTimeout(function () { hold = 'long'; appMenu(n); }, 650);
      else { hold = null; if (n && n.dataset && (n.dataset.nav)) activate(n); }
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (hold && hold !== 'long') { clearTimeout(hold); hold = null; var n = document.activeElement; if (n && n.dataset && n.dataset.pkg) activate(n); }
    else hold = null;
  });
  window.onShow = function () { tick(); render(); };


  document.addEventListener('focusin', function (e) { var n = e.target; if (n && n.dataset && n.dataset.view && n.dataset.view !== view) setView(n.dataset.view); });

  window.onBack = function () {
    if (!menuEl.hidden) { closeMenu(); focusKey(menuRestore); return true; }
    if (view !== 'home') { setView('home'); focusKey('rail:home'); return true; }
    return false;
  };
  window.onVideoEnd = function () { renderMain(); focusKey('news:play'); };
  window.refreshApps = function () { loadApps(); renderMain(); };
  window.onShow = function () { tick(); renderMain(); pollFeed(); resetIdle(); };

  // ---------- clock ----------
  var tEl = document.getElementById('time'), dEl = document.getElementById('date');
  function tick() {
    var d = new Date();
    tEl.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    dEl.textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    var wd = document.getElementById('w-day'); if (wd) {
      wd.textContent = d.toLocaleDateString([], { weekday: 'long' }); document.getElementById('w-num').textContent = String(d.getDate()); document.getElementById('w-mon').textContent = d.toLocaleDateString([], { month: 'long', year: 'numeric' });
      var hm = document.getElementById('hand-h'), mm = document.getElementById('hand-m'), h = d.getHours() % 12 + d.getMinutes() / 60;
      hm.setAttribute('transform', 'rotate(' + (h * 30) + ' 50 50)'); mm.setAttribute('transform', 'rotate(' + (d.getMinutes() * 6) + ' 50 50)');
    }
  }
  setInterval(tick, 10000);

  // ---------- lab feed ----------
  function pollFeed() { if (window.Tv && st.lab) { try { window.Tv.refreshFeed(); } catch (e) { /* ignore */ } } }
  window.onFeed = function (txt) {
    var next = null; try { next = txt ? JSON.parse(txt) : null; } catch (e) { next = null; }
    var sig = JSON.stringify(next && next.lab) + JSON.stringify(next && next.weather) + JSON.stringify(next && next.news);
    feed = next; feedAt = Date.now();
    updateSaverText();
    if (sig !== feedSig) { feedSig = sig; if (view === 'home' || view === 'more' || view === 'news') renderMain(); }
  };
  setInterval(pollFeed, 60000);

  // ---------- idle screen saver (inside the launcher) ----------
  var saver = document.getElementById('saver'), saverBox = document.getElementById('saver-box'), saverOn = false, idleT = null, driftT = null;
  function updateSaverText() {
    var d = new Date();
    document.getElementById('s-time').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    document.getElementById('s-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    var l = feed && feed.lab && feed.lab.ok && st.lab ? feed.lab : null, x = feed && feed.weather, parts = [];
    if (x) parts.push(x.temp + '\u00b0 ' + WX(x.code));
    if (l) parts.push(l.red > 0 ? l.red + ' lab alert' + (l.red === 1 ? '' : 's') : l.amber > 0 ? l.amber + ' lab items to review' : 'Lab all clear');
    document.getElementById('s-extra').textContent = parts.join('   \u00b7   ');
  }
  function drift() {
    var w = window.innerWidth - saverBox.offsetWidth, h = window.innerHeight - saverBox.offsetHeight;
    saverBox.style.transform = 'translate(' + Math.round(Math.random() * Math.max(0, w)) + 'px,' + Math.round(Math.random() * Math.max(0, h)) + 'px)';
  }
  function showSaver() {
    if (!menuEl.hidden || saverOn || !st.idle) { resetIdle(); return; }
    saverOn = true; saver.hidden = false; updateSaverText(); drift(); driftT = setInterval(function () { drift(); updateSaverText(); }, 40000);
    window.requestAnimationFrame(function () { saver.classList.add('on'); }); pollFeed();
  }
  function hideSaver() { saverOn = false; saver.classList.remove('on'); saver.hidden = true; clearInterval(driftT); resetIdle(); }
  function resetIdle() { clearTimeout(idleT); if (window.Tv && st.idle > 0 && !saverOn) idleT = setTimeout(showSaver, st.idle * 60000); }
  window.__showSaver = showSaver;           // used by the test page
  document.addEventListener('keydown', function (e) {
    if (saverOn) { e.preventDefault(); e.stopImmediatePropagation(); hideSaver(); return; }   // the first press only wakes the screen
    resetIdle();
  }, true);

  buildChrome();
  if (window.Tv) { loadApps(); loadState(); applyTheme(); }
  render(); pollFeed(); resetIdle();
})();
