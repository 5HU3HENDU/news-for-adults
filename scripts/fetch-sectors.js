// One-time fetch: sector per symbol from Yahoo search endpoint.
// Writes sectors.json {fetchedAtIST, sectors:{SYM:"Sector"|null}, missing:[]}
// Covers the Nifty 500 + the My watchlist symbols (watchlist.json).
// Sectors barely change, so this is NOT part of the daily refresh — re-run only
// if a symbol's sector looks wrong or a new listing appears. Re-running merges
// into the existing file: symbols already mapped are not re-fetched.
const fs = require("fs");
const path = require("path");
const DIR = __dirname + "/..";
const lists = JSON.parse(fs.readFileSync(path.join(DIR, "final-lists.json"), "utf8"));
const wl = JSON.parse(fs.readFileSync(path.join(DIR, "watchlist.json"), "utf8"));
const SYMS = [...new Set([...lists.indices.NIFTY500, ...wl.stocks.map(s => s.sym)])];
const YSYM = {};
for (const s of lists.indices.NIFTY500) YSYM[s] = s + ".NS";
for (const w of wl.stocks) YSYM[w.sym] = w.sym + (w.exch === "BO" ? ".BO" : ".NS");
const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const OUT = path.join(DIR, "sectors.json");

function istNow() {
  return new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}
async function fetchSector(sym) {
  // quoteSummary/assetProfile needs a Yahoo login crumb (401 "Invalid Crumb"
  // from this server), but the search endpoint returns sector with no auth.
  for (const host of HOSTS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(`https://${host}/v1/finance/search?q=${encodeURIComponent(YSYM[sym])}&quotesCount=1&newsCount=0`, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      const q = j && j.quotes && j.quotes[0];
      if (q && q.sector && q.symbol === YSYM[sym]) return q.sector;
      return null;
    } catch (e) { /* try next host */ }
  }
  return null;
}
(async () => {
  let prev = { sectors: {}, missing: [] };
  try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) {}
  const sectors = { ...prev.sectors };
  const todo = SYMS.filter(s => !sectors[s]);
  console.log(`total symbols: ${SYMS.length} | already mapped: ${SYMS.length - todo.length} | to fetch: ${todo.length}`);
  const CHUNK = 10;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(s => fetchSector(s)));
    chunk.forEach((s, k) => { if (results[k]) sectors[s] = results[k]; });
    console.log(`fetched ${Math.min(i + CHUNK, todo.length)}/${todo.length}`);
    if (i + CHUNK < todo.length) await new Promise(r => setTimeout(r, 150));
  }
  const missing = SYMS.filter(s => !sectors[s]);
  const counts = {};
  Object.values(sectors).forEach(s => counts[s] = (counts[s] || 0) + 1);
  fs.writeFileSync(OUT, JSON.stringify({ fetchedAtIST: istNow(), sectors, missing }, null, 1));
  console.log(`done: ${Object.keys(sectors).length}/${SYMS.length} with sector, ${missing.length} missing`);
  console.log("distribution:", JSON.stringify(counts));
  if (missing.length) console.log("missing:", missing.join(","));
})();
