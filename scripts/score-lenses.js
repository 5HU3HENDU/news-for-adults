// Score the 6 investor lenses for the 151 My-watchlist stocks.
// Rules: investor-lens-rulebook-v01.md (APPROVED v0.1, Shiva 2026-11-15).
// Inputs: fundamentals.json (Screener, weekly) + market-data.json
// (Yahoo, daily session). Output: lens.json (loaded by the heatmap page).
// Verdicts: 5-check lens Green >=4, Red <=1; 4-check lens Green >=3,
// Red <=1; else Neutral. A missing value FAILS its check and is flagged.
// NO Berkshire P/E veto (pure scoring, per Shiva). Burry ships 4 checks;
// the Debt/Equity + cash checks are v2 and flagged in the popup.
// Usage: node scripts/score-lenses.js
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
const fund = JSON.parse(fs.readFileSync(path.join(DIR, 'fundamentals.json'), 'utf8'));
const md = JSON.parse(fs.readFileSync(path.join(DIR, 'market-data.json'), 'utf8'));
const wl = JSON.parse(fs.readFileSync(path.join(DIR, 'watchlist.json'), 'utf8'));

const LENSES = [
  { key: 'Berkshire', label: 'Buffett lens', note: null },
  { key: 'Burry', label: 'Burry lens', note: 'Debt/equity + cash checks not yet in v1' },
  { key: 'Axelrod', label: 'Axelrod lens', note: null },
  { key: 'Jhunjhunwala', label: 'Jhunjhunwala lens', note: null },
  { key: 'Lynch', label: 'Lynch lens', note: null },
  { key: 'Marks', label: 'Marks lens', note: 'Green = safe to lean in, red = be careful here' },
];

function fmtPct(v, dec) {
  if (v === null || v === undefined) return null;
  const d = dec !== undefined ? dec : (Number.isInteger(v) ? 0 : 1);
  return v.toFixed(d) + '%';
}
function fmtNum(v, dec) {
  if (v === null || v === undefined) return null;
  const d = dec !== undefined ? dec : (Number.isInteger(v) ? 0 : 1);
  return v.toFixed(d);
}
function fmtINR(v) {
  if (v === null || v === undefined) return null;
  return '\u20B9' + Math.round(v).toLocaleString('en-IN') + ' cr';
}
function fmtSignedPct(v) {
  if (v === null || v === undefined) return null;
  return (v >= 0 ? '+' : '') + fmtPct(v);
}
// One check: {n: name, t: threshold text, v: display value (or null), p: pass, m: missing}
function chk(n, t, v, pass) {
  return { n, t, v: v === undefined ? null : v, p: !!pass, m: v === null || v === undefined };
}
function eff5(f, base) {
  // 5y value, falling back to 3y for recent listings ("thin history").
  if (f[base + '5'] !== null && f[base + '5'] !== undefined) return { v: f[base + '5'], period: '5y', fallback: false };
  if (f[base + '3'] !== null && f[base + '3'] !== undefined) return { v: f[base + '3'], period: '3y', fallback: true };
  return { v: null, period: '5y', fallback: false };
}

function score(f, m) {
  const price = (m && m.p !== undefined) ? m.p : f.price;
  const chg = (m && m.c !== undefined) ? m.c : null;
  const dots = (m && Array.isArray(m.d)) ? m.d : [null, null, null, null, null];
  const greenDots = dots.filter(d => d === 1).length;
  const pb = (f.bookValue && price) ? price / f.bookValue : null;
  const peg = (f.pe !== null && f.pe !== undefined && f.profit3 !== null && f.profit3 !== undefined && f.profit3 > 0)
    ? f.pe / f.profit3 : null;
  const belowHigh = (f.high52 !== null && f.high52 !== undefined && price)
    ? ((f.high52 - price) / f.high52) * 100 : null;
  const sales5 = eff5(f, 'sales');
  const profit5 = eff5(f, 'profit');

  const out = {};
  // 1. Berkshire — quality compounder at a fair price (5 checks)
  out.Berkshire = [
    chk('ROCE', '\u2265 20%', fmtPct(f.roce), f.roce !== null && f.roce >= 20),
    chk('ROE', '\u2265 15%', fmtPct(f.roe), f.roe !== null && f.roe >= 15),
    chk('Sales growth ' + sales5.period, '\u2265 10%', fmtPct(sales5.v), sales5.v !== null && sales5.v >= 10),
    chk('Profit growth ' + profit5.period, '\u2265 10%', fmtPct(profit5.v), profit5.v !== null && profit5.v >= 10),
    chk('P/E', '\u2264 30', fmtNum(f.pe), f.pe !== null && f.pe <= 30),
  ];
  // 2. Burry — cheap, hated, real assets (4 checks; debt/cash are v2)
  out.Burry = [
    chk('P/E', '\u2264 15', fmtNum(f.pe), f.pe !== null && f.pe <= 15),
    chk('P/B', '\u2264 2', fmtNum(pb), pb !== null && pb <= 2),
    chk('ROCE', '\u2265 12%', fmtPct(f.roce), f.roce !== null && f.roce >= 12),
    chk('Price CAGR 3y', '< 0%', fmtPct(f.priceCagr3), f.priceCagr3 !== null && f.priceCagr3 < 0),
  ];
  // 3. Axelrod — catalyst / momentum (4 checks)
  out.Axelrod = [
    chk('Friday move', '\u2265 +1%', fmtSignedPct(chg), chg !== null && chg >= 1),
    chk('Trend dots green', '\u2265 3 of 5', greenDots + '/5 green', greenDots >= 3),
    chk('Sales growth 3y', '\u2265 20%', fmtPct(f.sales3), f.sales3 !== null && f.sales3 >= 20),
    chk('Price CAGR 3y', '\u2265 15%', fmtPct(f.priceCagr3), f.priceCagr3 !== null && f.priceCagr3 >= 15),
  ];
  // 4. Lynch — growth at a reasonable price (4 checks)
  out.Lynch = [
    chk('PEG', '\u2264 1.5', peg !== null ? peg.toFixed(2) : null, peg !== null && peg <= 1.5),
    chk('Sales growth 3y', '\u2265 15%', fmtPct(f.sales3), f.sales3 !== null && f.sales3 >= 15),
    chk('ROCE', '\u2265 15%', fmtPct(f.roce), f.roce !== null && f.roce >= 15),
    chk('P/E', '\u2264 40', fmtNum(f.pe), f.pe !== null && f.pe <= 40),
  ];
  // 5. Jhunjhunwala — India long-term (4 checks)
  out.Jhunjhunwala = [
    chk('Promoter holding', '\u2265 50%', fmtPct(f.promoter), f.promoter !== null && f.promoter >= 50),
    chk('Sales growth ' + sales5.period, '\u2265 15%', fmtPct(sales5.v), sales5.v !== null && sales5.v >= 15),
    chk('ROCE', '\u2265 15%', fmtPct(f.roce), f.roce !== null && f.roce >= 15),
    chk('Market cap', '\u2265 \u20B910,000 cr', fmtINR(f.mcap), f.mcap !== null && f.mcap >= 10000),
  ];
  // 6. Marks — risk (4 checks). Green = safe to lean in, red = be careful.
  out.Marks = [
    chk('Below 52w high', '\u2265 20%', fmtPct(belowHigh), belowHigh !== null && belowHigh >= 20),
    chk('P/E', '\u2264 25', fmtNum(f.pe), f.pe !== null && f.pe <= 25),
    chk('Price CAGR 3y', '\u2264 0%', fmtPct(f.priceCagr3), f.priceCagr3 !== null && f.priceCagr3 <= 0),
    chk('ROCE', '\u2265 15%', fmtPct(f.roce), f.roce !== null && f.roce >= 15),
  ];
  return out;
}

function verdict(checks) {
  const n = checks.length;
  const pass = checks.filter(c => c.p).length;
  const greenAt = n === 5 ? 4 : 3;
  if (pass >= greenAt) return 'green';
  if (pass <= 1) return 'red';
  return 'neutral';
}

function main() {
  const stocks = {};
  const missing = [];
  for (const w of wl.stocks) {
    const f = fund.stocks[w.sym];
    if (!f) { missing.push(w.sym); continue; }
    const m = md.stocks[w.sym] || null;
    const checks = score(f, m);
    const verdicts = {};
    const scores = {};
    for (const L of LENSES) {
      verdicts[L.key] = verdict(checks[L.key]);
      scores[L.key] = [checks[L.key].filter(c => c.p).length, checks[L.key].length];
    }
    const flags = [];
    if (f.sales5 === null || f.sales5 === undefined || f.profit5 === null || f.profit5 === undefined) flags.push('thin history');
    if (f.pe === null || f.pe === undefined) flags.push('loss-making');
    stocks[w.sym] = { verdicts, scores, checks, flags };
  }
  const out = {
    version: 1,
    fetchedAtIST: fund.fetchedAtIST,
    sessionDate: md.sessionDate,
    source: 'screener.in fundamentals + Yahoo Finance (NSE feed) session prices',
    note: 'Lens verdicts are a mechanical reading of the approved rulebook (v0.1) — "Buffett lens", never "Buffett\'s view". Axelrod\'s daily checks use the session in sessionDate.',
    lenses: LENSES,
    stocks,
    missing,
  };
  fs.writeFileSync(path.join(DIR, 'lens.json'), JSON.stringify(out));
  console.log(`scored ${Object.keys(stocks).length} stocks, ${missing.length} missing fundamentals`);
  if (missing.length) console.log('missing:', missing.join(','));
  // Worked-example spot check (rulebook table) — must match.
  const expect = {
    TCS: { Berkshire: 'green', Burry: 'neutral', Axelrod: 'red', Jhunjhunwala: 'green', Lynch: 'neutral', Marks: 'green' },
    CPPLUS: { Berkshire: 'green', Burry: 'red', Axelrod: 'red', Jhunjhunwala: 'green', Lynch: 'neutral', Marks: 'red' },
    SYRMA: { Berkshire: 'neutral', Burry: 'red', Axelrod: 'green', Jhunjhunwala: 'green', Lynch: 'green', Marks: 'red' },
    TONBO: { Berkshire: 'neutral', Burry: 'red', Axelrod: 'green', Jhunjhunwala: 'red', Lynch: 'neutral', Marks: 'red' },
  };
  let bad = 0;
  for (const [sym, exp] of Object.entries(expect)) {
    for (const [lens, want] of Object.entries(exp)) {
      const got = stocks[sym] && stocks[sym].verdicts[lens];
      const mark = got === want ? 'ok ' : 'MISMATCH';
      if (got !== want) bad++;
      console.log(`${mark} ${sym} ${lens}: got ${got}, want ${want} (${stocks[sym].scores[lens].join('/')})`);
    }
  }
  console.log(bad ? `WORKED EXAMPLE: ${bad} MISMATCHES — investigate before shipping` : 'WORKED EXAMPLE: all 24 verdicts match the rulebook');
  if (bad) process.exit(2);
}
main();
