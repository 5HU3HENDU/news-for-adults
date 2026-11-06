// One-time fetch: sector per Nifty 500 symbol from Yahoo assetProfile.
// Writes sectors.json {fetchedAtIST, sectors:{SYM:"Sector"|null}, missing:[]}
// Sectors barely change, so this is NOT part of the daily refresh — re-run only
// if a symbol's sector looks wrong or a new listing appears.
const fs = require("fs");
const path = require("path");
const DIR = __dirname + "/..";
const lists = JSON.parse(fs.readFileSync(path.join(DIR, "final-lists.json"), "utf8"));
const SYMS = lists.indices.NIFTY500;
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
      const r = await fetch(`https://${host}/v1/finance/search?q=${encodeURIComponent(sym)}.NS&quotesCount=1&newsCount=0`, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      const q = j && j.quotes && j.quotes[0];
      if (q && q.sector) return q.sector;
      return null;
    } catch (e) { /* try next host */ }
  }
  return null;
}
(async () => {
  const sectors = {};
  const missing = [];
  const CHUNK = 10;
  for (let i = 0; i < SYMS.length; i += CHUNK) {
    const chunk = SYMS.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(s => fetchSector(s)));
    chunk.forEach((s, k) => {
      if (results[k]) sectors[s] = results[k];
      else missing.push(s);
    });
    if (i % 100 === 0) console.log(`... ${Math.min(i + CHUNK, SYMS.length)}/${SYMS.length}`);
    await new Promise(r => setTimeout(r, 150));
  }
  const counts = {};
  Object.values(sectors).forEach(s => counts[s] = (counts[s] || 0) + 1);
  fs.writeFileSync(OUT, JSON.stringify({ fetchedAtIST: istNow(), sectors, missing }, null, 1));
  console.log(`done: ${Object.keys(sectors).length}/${SYMS.length} with sector, ${missing.length} missing`);
  console.log("distribution:", JSON.stringify(counts));
  if (missing.length) console.log("missing:", missing.join(","));
})();
