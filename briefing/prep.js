// Builds data/countries.json: per country a path in plate-carree map pixels (7680x3840), its bounding box, and names for matching.
const fs = require('fs');
const W = 7680, H = 3840;
const gj = JSON.parse(fs.readFileSync('/opt/briefing/data/ne_50m_admin_0_countries.geojson', 'utf8'));
const X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H;
const out = {};
for (const f of gj.features) {
  const p = f.properties, a3 = p.ADM0_A3 || p.ISO_A3; if (!a3 || a3 === '-99') continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = '', minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  const area = (poly) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; poly[0].forEach((q) => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }); return (x1 - x0) * (y1 - y0); };
  const biggest = Math.max.apply(null, polys.map(area));
  for (const poly of polys) for (const ring of poly) {
    const main = area(poly) >= biggest * 0.12;
    let last = '';
    ring.forEach((pt, i) => {
      const x = Math.round(X(pt[0]) * 10) / 10, y = Math.round(Y(pt[1]) * 10) / 10, s = x + ' ' + y;
      if (s === last) return; last = s;
      d += (i === 0 ? 'M' : 'L') + x + ' ' + y;
      if (main) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    });
    d += 'Z';
  }
  out[a3] = { n: p.NAME, long: p.NAME_LONG, adm: p.ADMIN, iso2: p.ISO_A2, b: [minx, miny, maxx, maxy], d };
}
fs.writeFileSync('/opt/briefing/data/countries.json', JSON.stringify(out));
console.log(Object.keys(out).length, 'countries,', (fs.statSync('/opt/briefing/data/countries.json').size / 1e6).toFixed(1) + ' MB');
