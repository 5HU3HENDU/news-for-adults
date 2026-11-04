// Fetch real market data for the Nifty 500 (Nov 2026 list) from Yahoo Finance
// (NSE feed, ~15 min delayed) via query1 with query2 fallback per symbol.
// Source availability, tested 2026-11-04 from this server:
//   Yahoo query1 + query2: WORK. NSE home/API, BSE API, BSE bhavcopy,
//   Stooq, TradingView scanner: all blocked or failing from datacenter IPs.
// So Yahoo's two hosts are the working free sources; the merge below is
// structured so a second independent source (e.g. Zerodha Kite) can be added
// later as another per-symbol fetcher.
// Output: market-data.json in the news-for-adults dir.
// Prints CHANGED or UNCHANGED (vs existing file) for the refresh cron:
// the cron pushes only on CHANGED, so holidays and stale sessions cost no commit.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
const fin = JSON.parse(fs.readFileSync(path.join(DIR, 'final-lists.json'), 'utf8'));
const SYMBOLS = fin.indices.NIFTY500;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
function istNow() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}
function istDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}
function istToday() {
  return new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}
async function fetchChart(sym, range = '15d') {
  const q = encodeURIComponent(sym + '.NS');
  for (const host of HOSTS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(`https://${host}/v8/finance/chart/${q}?range=${range}&interval=1d`, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) continue;
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res) continue;
      return { res, host };
    } catch (e) { /* try next host */ }
  }
  return null;
}
function parseSeries(res) {
  const ts = res.timestamp || [];
  const adj = (res.indicators && res.indicators.adjclose && res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose) || null;
  const quo = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || null;
  const vals = adj || quo;
  if (!vals) return [];
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    const v = vals[i];
    if (v === null || v === undefined) continue;
    pts.push({ t: ts[i], v });
  }
  pts.sort((a, b) => a.t - b.t);
  return pts;
}
async function main() {
  const stocks = {};
  const missing = [];
  const hostCount = { query1: 0, query2: 0 };
  const sessionVotes = {};
  const today = istToday();
  const CHUNK = 20;
  for (let i = 0; i < SYMBOLS.length; i += CHUNK) {
    const chunk = SYMBOLS.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(async (sym) => {
      let got = await fetchChart(sym);
      if (!got) return { sym, ok: false };
      let { res, host } = got;
      let pts = parseSeries(res);
      // Some symbols return an empty series for the 15d window; retry wider.
      if (pts.length < 8) {
        const got2 = await fetchChart(sym, '1mo');
        if (got2) {
          const pts2 = parseSeries(got2.res);
          if (pts2.length > pts.length) { got = got2; res = got2.res; host = got2.host; pts = pts2; }
        }
      }
      if (pts.length < 2) {
        // Meta-only: Yahoo has today's price/change but no daily series
        // (e.g. JBCHEPHARM). Keep the real return, grey dots, no sample fallback.
        const m = res.meta || {};
        if (typeof m.regularMarketPrice === 'number' && typeof m.regularMarketChangePercent === 'number') {
          const ms = (typeof m.regularMarketTime === 'number') ? istDate(m.regularMarketTime) : null;
          return { sym, ok: true, host, price: m.regularMarketPrice, chg: m.regularMarketChangePercent, dots: [null, null, null, null, null], session: ms };
        }
        return { sym, ok: false };
      }
      const meta = res.meta || {};
      const n = pts.length;
      const last = pts[n - 1].v, prev = pts[n - 2].v;
      const computed = ((last - prev) / prev) * 100;
      const chg = (typeof meta.regularMarketChangePercent === 'number') ? meta.regularMarketChangePercent : computed;
      const price = (typeof meta.regularMarketPrice === 'number') ? meta.regularMarketPrice : last;
      // Dots: 5 day-changes ending the day before the display session.
      // The display session is meta's session (regularMarketTime). If the
      // chart's last candle is that session, dots end one session earlier;
      // if the chart lags meta by one session, dots end at the last candle.
      const metaSession = (typeof meta.regularMarketTime === 'number') ? istDate(meta.regularMarketTime) : istDate(pts[n - 1].t);
      const lastIsDisplay = istDate(pts[n - 1].t) === metaSession;
      const base = lastIsDisplay ? n - 6 : n - 5;
      const dots = [];
      for (let j = 0; j < 5; j++) {
        const idx = base + j;
        if (idx <= 0) { dots.push(null); continue; }
        dots.push(pts[idx].v >= pts[idx - 1].v ? 1 : 0);
      }
      return { sym, ok: true, host, price, chg, dots, session: metaSession };
    }));
    for (const r of results) {
      if (!r.ok) { missing.push(r.sym); continue; }
      hostCount[r.host.includes('query1') ? 'query1' : 'query2']++;
      if (r.session) sessionVotes[r.session] = (sessionVotes[r.session] || 0) + 1;
      stocks[r.sym] = { p: Math.round(r.price * 100) / 100, c: Math.round(r.chg * 100) / 100, d: r.dots };
    }
    await new Promise(res => setTimeout(res, 150));
  }
  const sessionDate = Object.entries(sessionVotes).sort((a, b) => b[1] - a[1])[0][0];
  const out = {
    version: 1,
    fetchedAtIST: istNow(),
    sessionDate,
    source: 'Yahoo Finance (NSE feed, ~15 min delayed) via query1/query2',
    hosts: hostCount,
    stocks,
    missing,
  };
  const outPath = path.join(DIR, 'market-data.json');
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (e) {}
  // A run counts as changed when prices/dots move OR the display session
  // advances (e.g. first run after a close); fetchedAt alone never counts,
  // so holidays and stale sessions cost no commit.
  const changed = !prev || prev.sessionDate !== sessionDate || JSON.stringify(prev.stocks) !== JSON.stringify(out.stocks);
  if (changed) fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(changed ? 'CHANGED' : 'UNCHANGED', '| stocks:', Object.keys(stocks).length, '| missing:', missing.length, missing.slice(0, 30).join(','));
  console.log('session:', sessionDate, '| fetched:', out.fetchedAtIST, '| hosts:', JSON.stringify(hostCount));
  if (stocks.RELIANCE) console.log('check RELIANCE:', JSON.stringify(stocks.RELIANCE));
}
main().catch(e => { console.error('FETCH FAILED:', e); process.exit(1); });
