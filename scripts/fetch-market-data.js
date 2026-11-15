// Fetch real market data for the Nifty 500 (Nov 2026 list) + My watchlist
// (watchlist.json) from Yahoo Finance
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
// My watchlist (watchlist.json): symbols outside the 500 are fetched too
// and merged into the same stocks map, so the "My watchlist" tab has live
// data. BSE-only names (exch "BO") use the .BO Yahoo suffix.
const wl = JSON.parse(fs.readFileSync(path.join(DIR, 'watchlist.json'), 'utf8'));
const in500 = new Set(SYMBOLS);
const FETCH = SYMBOLS.map(s => ({ key: s, ysym: s + '.NS' }));
for (const w of wl.stocks) {
  if (!in500.has(w.sym)) FETCH.push({ key: w.sym, ysym: w.sym + (w.exch === 'BO' ? '.BO' : '.NS') });
}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
function istNow() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}
function istDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}
function istDateShort(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}
function istToday() {
  return new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}
async function fetchChart(ysym, range = '15d') {
  const q = encodeURIComponent(ysym);
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
  if (!vals) return { pts: [], closes: [] };
  const pts = [];
  const closes = [];
  for (let i = 0; i < ts.length; i++) {
    const v = vals[i];
    if (v === null || v === undefined) continue;
    pts.push({ t: ts[i], v });
    if (quo && quo[i] != null) closes.push({ t: ts[i], v: quo[i] });
  }
  pts.sort((a, b) => a.t - b.t);
  closes.sort((a, b) => a.t - b.t);
  // If the raw-close series is too short to compute a change from, fall
  // back to the adjclose series (same values when no adjustment applies).
  return { pts, closes: closes.length >= 2 ? closes : pts };
}
async function main() {
  const stocks = {};
  const missing = [];
  const hostCount = { query1: 0, query2: 0 };
  const sessionVotes = {};
  const today = istToday();
  const CHUNK = 20;
  for (let i = 0; i < FETCH.length; i += CHUNK) {
    const chunk = FETCH.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(async ({ key: sym, ysym }) => {
      let got = await fetchChart(ysym);
      if (!got) return { sym, ok: false };
      let { res, host } = got;
      let { pts, closes } = parseSeries(res);
      // Some symbols return an empty series for the 15d window; retry wider.
      if (pts.length < 8) {
        const got2 = await fetchChart(ysym, '1mo');
        if (got2) {
          const s2 = parseSeries(got2.res);
          if (s2.pts.length > pts.length) { got = got2; res = got2.res; host = got2.host; pts = s2.pts; closes = s2.closes; }
        }
      }
      if (pts.length < 2) {
        // Meta-only: Yahoo has today's price/change but no daily series
        // (e.g. JBCHEPHARM). Keep the real return, grey dots, no sample fallback.
        const m = res.meta || {};
        if (typeof m.regularMarketPrice === 'number' && typeof m.regularMarketChangePercent === 'number') {
          const ms = (typeof m.regularMarketTime === 'number') ? istDate(m.regularMarketTime) : null;
          return { sym, ok: true, host, price: m.regularMarketPrice, chg: m.regularMarketChangePercent, dots: [null, null, null, null, null], moves: [], session: ms };
        }
        return { sym, ok: false };
      }
      const meta = res.meta || {};
      const n = pts.length;
      // Today's change is computed from the UNADJUSTED closes, not adjclose:
      // adjclose is dividend-adjusted, so for a stock that went ex-dividend
      // it gives a wrong (even wrong-sign) day change. The last close is the
      // official close either way.
      const nc = closes.length;
      const lastC = closes[nc - 1].v, prevC = closes[nc - 2].v;
      const computed = ((lastC - prevC) / prevC) * 100;
      // Display session is meta's session (regularMarketTime). When the
      // chart's last candle IS that session (post-close), the candle close
      // is the official close and is stable — meta.regularMarketPrice
      // drifts after close (PVRINOX: meta 1633 vs close 1641.20 on 13 Nov;
      // 275/499 symbols moved between the Fri 16:42 and Sun 00:57 fetches).
      // Intraday (chart lags meta) keep meta as the live price.
      const metaSession = (typeof meta.regularMarketTime === 'number') ? istDate(meta.regularMarketTime) : istDate(pts[n - 1].t);
      const lastIsDisplay = istDate(pts[n - 1].t) === metaSession;
      const chg = lastIsDisplay ? computed : ((typeof meta.regularMarketChangePercent === 'number') ? meta.regularMarketChangePercent : computed);
      const price = lastIsDisplay ? lastC : ((typeof meta.regularMarketPrice === 'number') ? meta.regularMarketPrice : lastC);
      // Dots: 5 day-changes ending the day before the display session.
      // If the chart's last candle is that session, dots end one session
      // earlier; if the chart lags meta by one session, dots end at the
      // last candle.
      const base = lastIsDisplay ? n - 6 : n - 5;
      const dots = [];
      // Moves: the same 5 day-changes as the dots, but as actual % values
      // with their IST dates, so the popup can show "12 Nov +1.23%" etc.
      // Same series (pts) and indices as the dots, so each move's sign
      // always matches its dot. Only available entries are stored.
      const moves = [];
      for (let j = 0; j < 5; j++) {
        const idx = base + j;
        if (idx <= 0) { dots.push(null); continue; }
        dots.push(pts[idx].v >= pts[idx - 1].v ? 1 : 0);
        const pct = ((pts[idx].v - pts[idx - 1].v) / pts[idx - 1].v) * 100;
        moves.push([istDateShort(pts[idx].t), Math.round(pct * 100) / 100]);
      }
      return { sym, ok: true, host, price, chg, dots, moves, session: metaSession };
    }));
    for (const r of results) {
      if (!r.ok) { missing.push(r.sym); continue; }
      hostCount[r.host.includes('query1') ? 'query1' : 'query2']++;
      if (r.session) sessionVotes[r.session] = (sessionVotes[r.session] || 0) + 1;
      stocks[r.sym] = { p: Math.round(r.price * 100) / 100, c: Math.round(r.chg * 100) / 100, d: r.dots, m: r.moves || [] };
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
