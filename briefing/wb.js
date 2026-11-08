// World Bank open data (no key): population, GDP and military spending for a country, most recent value.
const IND = { pop: 'SP.POP.TOTL', gdp: 'NY.GDP.MKTP.CD', mil: 'MS.MIL.XPND.CD' };
async function one(a3, ind) {
  try {
    const r = await fetch('https://api.worldbank.org/v2/country/' + a3 + '/indicator/' + ind + '?format=json&mrnev=1', { signal: AbortSignal.timeout(15000) });
    const j = await r.json(); const x = j[1] && j[1][0]; return x && x.value != null ? { v: x.value, y: x.date } : null;
  } catch (e) { return null; }
}
const money = (v) => v >= 1e12 ? '$' + (v / 1e12).toFixed(1) + 'T' : v >= 1e9 ? '$' + Math.round(v / 1e9) + 'B' : '$' + Math.round(v / 1e6) + 'M';
const people = (v) => v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1e3) + 'K';
async function compare(a3a, a3b, names) {
  const get = async (a3) => ({ pop: await one(a3, IND.pop), gdp: await one(a3, IND.gdp), mil: await one(a3, IND.mil) });
  const [A, B] = await Promise.all([get(a3a), get(a3b)]);
  const f = (o, k, fn) => (o[k] ? fn(o[k].v) : 'n/a');
  const yrs = [A.pop, B.pop, A.gdp, B.gdp, A.mil, B.mil].filter(Boolean).map((x) => +x.y); const yr = yrs.length ? Math.min.apply(null, yrs) : '';
  return { title: 'COMPARISON', names, rows: [['Population', f(A, 'pop', people), f(B, 'pop', people)], ['GDP', f(A, 'gdp', money), f(B, 'gdp', money)], ['Military spending', f(A, 'mil', money), f(B, 'mil', money)]], note: yr ? 'World Bank data, latest available (as early as ' + yr + ')' : '' };
}
module.exports = { compare };
if (require.main === module) compare(process.argv[2], process.argv[3], [process.argv[2], process.argv[3]]).then((x) => console.log(JSON.stringify(x)));
