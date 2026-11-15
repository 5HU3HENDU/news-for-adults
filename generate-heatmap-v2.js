// Generate nifty500-heatmap-sample.html (v12: mobile popup fix — panels
// fit the viewport, scroll internally, visible close button + scroll-lock
// restore; 6 investor-lens dots on the My watchlist tab (index tabs keep
// the 5 trend dots) + popup with last-5-days % moves and per-lens check
// detail) from final-lists.json, watchlist.json and sectors.json. Lens
// verdicts come from lens.json at runtime; market-data.json carries the
// 5 daily % moves ("m") for the popup.
const fs = require('fs');
const fin = JSON.parse(fs.readFileSync(__dirname + '/final-lists.json', 'utf8'));
const I = fin.indices;
const wl = JSON.parse(fs.readFileSync(__dirname + '/watchlist.json', 'utf8'));
const wlSyms = wl.stocks.map(s => s.sym);
const wlNames = Object.fromEntries(wl.stocks.map(s => [s.sym, s.name]));
// Confirmed-unlisted names (no NSE/BSE listing): grey placeholder tiles,
// no price/data. Empty today — all 144 names are listed — but the design
// is live so a future unlisted name renders as a grey tile.
const wlUnlisted = (wl.unlisted || []).map(u => u.name).sort((a, b) => a < b ? -1 : 1);
const unlistedJson = JSON.stringify(wlUnlisted);
const IND = Object.assign({}, I, { WATCHLIST: wlSyms });
const TABS = [
  { key: 'NIFTY500', label: 'Nifty 500', cols: 25 },
  { key: 'NIFTY50', label: 'Nifty 50', cols: 10 },
  { key: 'SENSEX', label: 'Sensex', cols: 6 },
  { key: 'BANKNIFTY', label: 'Bank Nifty', cols: 7 },
  { key: 'MIDCAP150', label: 'Midcap 150', cols: 15 },
  { key: 'SMALLCAP250', label: 'Smallcap 250', cols: 25 },
  { key: 'WATCHLIST', label: 'My watchlist', cols: 25 },
];
const dataJson = JSON.stringify(Object.fromEntries(TABS.map(t => [t.key, IND[t.key]])));
const allNames = Object.assign({}, fin.names);
for (const [s, n] of Object.entries(wlNames)) if (!allNames[s]) allNames[s] = n;
const namesJson = JSON.stringify(allNames);
const secRaw = JSON.parse(fs.readFileSync(__dirname + '/sectors.json', 'utf8'));
const sectorsMap = {};
for (const s of [...I.NIFTY500, ...wlSyms]) sectorsMap[s] = (secRaw.sectors && secRaw.sectors[s]) || 'Other';
const sectorsJson = JSON.stringify(sectorsMap);
const tabsJson = JSON.stringify(TABS);
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NIFTY 500 \u2014 Heatmap</title>
<!-- nifty500-heatmap-v12 -->
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{background:#05070a;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden}
  header{display:flex;align-items:center;gap:12px;padding:8px 12px;background:#05070a;border-bottom:1px solid #1f2937;flex-wrap:wrap}
  .brand{font-size:17px;font-weight:800;letter-spacing:.03em}
  .brand .amber{color:#fbbf24}
  .gear{margin-left:auto;background:none;border:none;color:#9ca3af;cursor:pointer;padding:4px;position:relative;line-height:0}
  .gear svg{width:24px;height:24px}
  .gear .fdot{position:absolute;top:1px;right:1px;width:8px;height:8px;border-radius:50%;background:#22c55e;display:none}
  .gear.on-filter .fdot{display:block}
  nav{display:flex;gap:6px;padding:8px 12px;background:#05070a;border-bottom:1px solid #1f2937;flex-wrap:wrap}
  nav button{background:#111827;color:#d1d5db;border:1px solid #374151;border-radius:6px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer}
  nav button.on{background:#fbbf24;color:#111827;border-color:#fbbf24}
  main{flex:1;min-height:0;padding:6px}
  #grid{display:grid;grid-auto-rows:1fr;gap:3px;height:100%}
  .cell{container-type:inline-size;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:0;padding:2px 3px;line-height:1.25;cursor:pointer}
  .sym{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-size:14cqw;font-weight:700;white-space:nowrap;overflow:hidden;max-width:100%}
  .ret{font-size:10.5px;font-size:12cqw;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;opacity:.95}
  .dots{display:flex;gap:2px;gap:max(2px,1cqw);justify-content:center}
  .dot{width:5px;height:5px;width:max(5px,3cqw);height:max(5px,3cqw);border-radius:50%}
  .dot.up{background:#22c55e}.dot.dn{background:#ef4444}.dot.flat{background:#4b5563}
  .nomatch{grid-column:1/-1;color:#9ca3af;text-align:center;padding-top:40px;font-size:14px}
  .sechead{grid-column:1/-1;background:#111827;border-radius:4px;display:flex;justify-content:space-between;align-items:center;padding:7px 10px;font-size:13px;font-weight:700}
  .sechead .avg{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700}
  .sectgl{background:#1f2937;color:#d1d5db;border:1px solid #4b5563;border-radius:999px;padding:3px 14px;font-size:12px;font-weight:700;cursor:pointer;margin-left:8px}
  .sectgl.on{background:#fbbf24;color:#111827;border-color:#fbbf24}
  #sectorToggleHdr{margin-left:auto}
  header .gear{margin-left:0}
  #overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:50;padding:16px}
  #overlay.open{display:flex}
  #panel{background:#111827;border:1px solid #374151;border-radius:12px;padding:16px;width:min(560px,calc(100vw - 24px));max-height:88vh;max-height:88dvh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;color:#e5e7eb;font-size:13px;line-height:1.6}
  .pclose{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:50%;background:#1f2937;color:#fff;border:1px solid #6b7280;font-size:20px;line-height:1;cursor:pointer;z-index:5;display:flex;align-items:center;justify-content:center;flex:none}
  #panel .prow{margin-bottom:12px}
  #panel .prow:last-child{margin-bottom:0}
  #panel b{color:#fff}
  #fcircles{display:flex;gap:10px;align-items:center;margin-top:6px}
  .fc{width:30px;height:30px;border-radius:50%;border:2px solid #6b7280;background:#fff;cursor:pointer;padding:0;flex:none}
  .fc.green{background:#22c55e;border-color:#22c55e}
  .fc.red{background:#ef4444;border-color:#ef4444}
  #clearFilter{background:#1f2937;color:#d1d5db;border:1px solid #4b5563;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;margin-left:auto}
  #panel .dim{color:#9ca3af}
  #stockOverlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:60;padding:16px}
  #stockOverlay.open{display:flex}
  #stockPanel{background:#111827;border:1px solid #374151;border-radius:12px;padding:16px;width:min(560px,calc(100vw - 24px));max-height:88vh;max-height:88dvh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;color:#e5e7eb;font-size:14px;line-height:1.6}
  #stockPanel .dim{color:#9ca3af}
  #stockPanel .srow{margin-bottom:8px}
  #stockPanel .srow:last-child{margin-bottom:0}
  .bdot{width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:7px}
  .bdot.up{background:#22c55e}.bdot.dn{background:#ef4444}.bdot.flat{background:#4b5563}
  .fcol{display:flex;flex-direction:column;align-items:center;gap:2px}
  .fclab{font-size:9px;color:#9ca3af;font-weight:700}
  .moves{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
  .mv{background:#1f2937;border:1px solid #374151;border-radius:6px;padding:3px 8px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:center;line-height:1.35}
  .mv .md{display:block;font-size:10px;color:#9ca3af;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .lens{border-top:1px solid #374151;padding-top:10px;margin-top:10px}
  .lhead{font-size:13px;font-weight:700;margin-bottom:4px}
  .lcheck{display:grid;grid-template-columns:1fr auto auto 16px;gap:8px;font-size:12px;line-height:1.7;color:#d1d5db}
  .lcheck .thr,.lcheck .val{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#9ca3af;text-align:right;white-space:nowrap}
  .lcheck .mk{text-align:center;font-weight:800}
  .lcheck .mk.ok{color:#22c55e}.lcheck .mk.no{color:#ef4444}.lcheck .mk.na{color:#6b7280}
  .lnote{font-size:11px;color:#9ca3af;margin-top:2px}
  .lflag{font-size:12px;color:#fbbf24;margin-top:6px}
  .pill{display:inline-block;background:#1f2937;border:1px solid #4b5563;border-radius:999px;padding:1px 10px;font-size:12px;margin:2px 4px 2px 0}
  .cell.grey{background:#374151}
  .cell.grey .uname{font-size:11px;font-weight:700;text-align:center;line-height:1.25;overflow:hidden}
  .cell.grey .ulabel{font-size:10px;color:#9ca3af;text-align:center}
  #unlistedOverlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:60;padding:16px}
  #unlistedOverlay.open{display:flex}
  #unlistedPanel{background:#111827;border:1px solid #374151;border-radius:12px;padding:16px;width:min(560px,calc(100vw - 24px));max-height:88vh;max-height:88dvh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;color:#e5e7eb;font-size:14px;line-height:1.6}
  #unlistedPanel .dim{color:#9ca3af}
  @media(max-width:700px){
    body{overflow:auto;height:auto}
    #grid{grid-template-columns:repeat(5,1fr)!important;grid-auto-rows:auto;height:auto}
    .cell{padding:9px 4px}
    .sym{font-size:15cqw}
    .ret{font-size:13cqw}
    #overlay,#stockOverlay,#unlistedOverlay{padding:12px}
  }
  @media(max-width:480px){
    .lcheck{display:flex;flex-wrap:wrap;gap:2px 8px}
    .lcheck span{overflow-wrap:anywhere;min-width:0}
    .lcheck span:first-child{flex:1 1 100%}
    .lcheck .mk{margin-left:auto}
  }
</style>
</head>
<body>
<header>
  <div class="brand"><span class="amber" id="brandName">NIFTY 500</span> HEATMAP</div>
  <button class="sectgl hdr" id="sectorToggleHdr">Sector</button>
  <button class="sectgl hdr" id="azToggleHdr">A–Z</button>
  <button class="gear" id="gearBtn" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg><span class="fdot"></span></button>
</header>
<nav id="tabs"></nav>
<main><div id="grid"></div></main>
<div id="overlay"><button class="pclose" id="closeSettings" aria-label="Close">✕</button><div id="panel">
  <div class="prow">Top-left = <b>biggest gainer</b> \u00b7 Bottom-right = <b>biggest loser</b><br>Index tabs: dots = last 5 days, oldest \u2192 yesterday (<span style="color:#22c55e">\u25cf</span> up, <span style="color:#ef4444">\u25cf</span> down)<br>My watchlist: 6 lens dots — Buffett, Burry, Axelrod, Jhunjhunwala, Lynch, Marks (<span style="color:#22c55e">\u25cf</span> lens likes it, <span style="color:#ef4444">\u25cf</span> lens avoids it, <span style="color:#6b7280">\u25cf</span> neutral)</div>
  <div class="prow dim" id="gapLine"></div>
  <div class="prow"><span class="dim">Dot filter</span><div id="fcircles"></div></div>
  <div class="prow"><span class="dim">Last updated:</span> <span id="lastUpdated">\u2014</span><br><span class="dim">Next update:</span> <span id="nextUpdate">\u2014</span><br><span class="dim">Data:</span> <span id="dataStatus">SAMPLE DATA</span><br><span class="dim">Lens data:</span> <span id="lensUpdated">\u2014</span></div>
</div></div>
<div id="stockOverlay"><button class="pclose" id="closeStock" aria-label="Close">✕</button><div id="stockPanel">
  <div class="srow"><div style="font-size:17px;font-weight:800" id="stName"></div><div class="dim" id="stSym"></div></div>
  <div class="srow"><span style="font-size:20px;font-weight:800" id="stPrice"></span> <span id="stChange" style="font-weight:700"></span></div>
  <div class="srow"><div class="dim" style="font-size:12px">Last 5 days</div><div id="stMoves"></div></div>
  <div id="stLens"></div>
  <div class="srow" id="stRank"></div>
  <div class="srow" id="stIndices"></div>
  <div class="srow dim" style="font-size:12px">Data as of <span id="stAsof">\u2014</span></div>
  <div class="srow"><a id="stGf" href="#" target="_blank" rel="noopener" style="color:#fbbf24;font-weight:700;text-decoration:none">Google Finance \u2197</a></div>
</div></div>
<div id="unlistedOverlay"><button class="pclose" id="closeUnlisted" aria-label="Close">✕</button><div id="unlistedPanel">
  <div style="font-size:17px;font-weight:800" id="unName"></div>
  <div class="dim" style="margin-top:6px">Not listed yet \u2014 no market data</div>
</div></div>
<script>
const INDICES=${dataJson};
const NAMES=${namesJson};
const SECTORS=${sectorsJson};
const TABS=${tabsJson};
const UNLISTED=${unlistedJson};
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function samplePct(sym){return ((hash(sym+"%")%9000)/1000)-4.5;}
function dayUp(sym,k){return (hash(sym+":d"+k)%2)===0;}
function colorFor(pct){
  const t=Math.min(Math.abs(pct)/5,1);
  const neutral=[17,24,39], end=pct>=0?[22,101,52]:[153,27,27];
  const c=neutral.map(function(v,i){return Math.round(v+(end[i]-v)*t);});
  return "rgb("+c[0]+","+c[1]+","+c[2]+")";
}
let REAL=null, REAL_ASOF="", CUR_KEY="NIFTY500", LAST_FALLBACK=0, LAST_COUNT=0;
let LENS=null, LENS_META=null, LENS_ASOF="", LENS_SESSION="";
const LENS_ORDER=["Berkshire","Burry","Axelrod","Jhunjhunwala","Lynch","Marks"];
const LENS_SHORT={Berkshire:"BUF",Burry:"BRY",Axelrod:"AXL",Jhunjhunwala:"RJ",Lynch:"LYN",Marks:"MRK"};
let FILTER=[0,0,0,0,0,0];
let CUR_TYPE="index";
let SECTOR_MODE=false;
let AZ_MODE=false;
let FULL_ROWS=[];
function fmtINR(n){return n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});}
function nextUpdateStr(){
  const ist=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
  const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let d=new Date(ist.getFullYear(),ist.getMonth(),ist.getDate());
  const mins=ist.getHours()*60+ist.getMinutes();
  const wd=ist.getDay();
  if(!(wd>=1&&wd<=5&&mins<16*60+45)){ do{ d.setDate(d.getDate()+1); }while(d.getDay()===0||d.getDay()===6); }
  return days[d.getDay()]+" "+d.getDate()+" "+months[d.getMonth()]+", 4:45 pm";
}
function updateSettings(){
  const gap=document.getElementById("gapLine");
  gap.textContent=(!REAL||LAST_FALLBACK<=0)?"":LAST_FALLBACK+" of "+LAST_COUNT+" stocks showing sample values (feed gap)";
  document.getElementById("lastUpdated").textContent=REAL?REAL_ASOF:"\u2014";
  document.getElementById("nextUpdate").textContent=nextUpdateStr();
  document.getElementById("dataStatus").textContent=REAL?"REAL DATA":"SAMPLE DATA";
  document.getElementById("lensUpdated").textContent=LENS?LENS_ASOF:"\u2014";
}
async function loadReal(){
  try{
    const ctrl=new AbortController();
    const timer=setTimeout(function(){ctrl.abort();},8000);
    const r=await fetch("market-data.json",{signal:ctrl.signal});
    clearTimeout(timer);
    if(!r.ok) return;
    const j=await r.json();
    if(j&&j.stocks){ REAL=j.stocks; REAL_ASOF=j.fetchedAtIST||""; }
  }catch(e){}
}
async function loadLens(){
  try{
    const ctrl=new AbortController();
    const timer=setTimeout(function(){ctrl.abort();},8000);
    const r=await fetch("lens.json",{signal:ctrl.signal});
    clearTimeout(timer);
    if(!r.ok) return;
    const j=await r.json();
    if(j&&j.stocks){ LENS=j.stocks; LENS_META=j; LENS_ASOF=j.fetchedAtIST||""; LENS_SESSION=j.sessionDate||""; }
  }catch(e){}
}
function lensDots(sym){
  // 6 lens verdicts as dots: green=1, red=0, neutral=null (grey).
  // No lens data yet -> 6 grey dots.
  if(!LENS||!LENS[sym]) return [null,null,null,null,null,null];
  const v=LENS[sym].verdicts||{};
  return LENS_ORDER.map(function(k){ return v[k]==="green"?1:v[k]==="red"?0:null; });
}
function realRow(sym,key){
  if(REAL&&REAL[sym]){ const rec=REAL[sym]; return {pct:rec.c, dots:key==="WATCHLIST"?lensDots(sym):rec.d, real:true}; }
  const dots=[]; for(let k=5;k>=1;k--){dots.push(dayUp(sym,k)?1:0);}
  return {pct:samplePct(sym), dots:key==="WATCHLIST"?lensDots(sym):dots, real:false};
}
function cellHtml(r){
  const pctTxt=(r.pct>=0?"+":"")+r.pct.toFixed(2)+"%";
  const dots=r.dots.map(function(v){
    return '<span class="dot '+(v===1?"up":v===0?"dn":"flat")+'"></span>';
  }).join("");
  return '<div class="cell" data-sym="'+r.sym+'" style="background:'+colorFor(r.pct)+'"><span class="sym">'+r.sym+
    '</span><span class="ret">'+pctTxt+'</span><span class="dots">'+dots+'</span></div>';
}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
// Grey placeholder tile for a confirmed-unlisted name: name + "Unlisted",
// no price, no return, no dots, no sample values.
function greyCellHtml(name){
  return '<div class="cell grey" data-unlisted="1" data-name="'+esc(name)+'"><span class="uname">'+esc(name)+'</span><span class="ulabel">Unlisted</span></div>';
}
function render(key){
  CUR_KEY=key;
  // The dot filter means different things per tab type (trend days on
  // index tabs, lenses on the watchlist tab), so reset it on a type switch.
  const type=key==="WATCHLIST"?"watchlist":"index";
  if(type!==CUR_TYPE){ FILTER=[0,0,0,0,0,0]; CUR_TYPE=type; buildFilterUI(); }
  const tab=TABS.find(function(t){return t.key===key;});
  document.getElementById("brandName").textContent=tab.label.toUpperCase();
  document.querySelectorAll("#tabs button").forEach(function(b){b.classList.toggle("on",b.dataset.key===key);});
  const grid=document.getElementById("grid");
  grid.style.gridTemplateColumns="repeat("+tab.cols+",1fr)";
  let fallback=0;
  const full=INDICES[key].map(function(sym){
    const r=realRow(sym,key); if(!r.real) fallback++;
    return {sym:sym,pct:r.pct,dots:r.dots};
  }).sort(function(a,b){return b.pct-a.pct||(a.sym<b.sym?-1:1);});
  FULL_ROWS=full;
  const disp=AZ_MODE?full.slice().sort(function(a,b){return a.sym<b.sym?-1:1;}):full;
  const rows=disp.filter(function(r){
    return FILTER.every(function(f,i){
      if(f===0) return true;
      return f===1?r.dots[i]===1:r.dots[i]===0;
    });
  });
  LAST_FALLBACK=fallback; LAST_COUNT=INDICES[key].length;
  // Grey placeholder tiles (watchlist only): priced tiles first, grey
  // tiles at the end in A–Z order among themselves. Grey tiles are not
  // part of rows/FULL_ROWS, so the dot filter and the feed-gap count
  // never touch them.
  const greyRows=(key==="WATCHLIST")?UNLISTED.slice():[];
  const greyHtml=greyRows.map(greyCellHtml).join("");
  const main=document.querySelector("main");
  if(rows.length===0&&greyRows.length===0){
    grid.style.height=""; grid.style.gridAutoRows=""; main.style.overflowY="";
    grid.innerHTML='<div class="nomatch">No matches</div>';
  } else if(SECTOR_MODE){
    grid.style.height="auto"; grid.style.gridAutoRows="auto"; main.style.overflowY="auto";
    const groups={};
    rows.forEach(function(r){ const s=SECTORS[r.sym]||"Other"; (groups[s]=groups[s]||[]).push(r); });
    const avg=function(g){ return g.reduce(function(t,r){return t+r.pct;},0)/g.length; };
    const order=Object.keys(groups).sort(function(a,b){ return AZ_MODE?(a<b?-1:1):avg(groups[b])-avg(groups[a]); });
    grid.innerHTML=order.map(function(s){
      const g=groups[s]; const a=avg(g);
      const head='<div class="sechead"><span>'+s+'</span><span>'+g.length+' stocks &middot; <span class="avg" style="color:'+(a>=0?"#22c55e":"#ef4444")+'">'+(a>=0?"+":"")+a.toFixed(2)+'% avg</span></span></div>';
      return head+g.map(cellHtml).join("");
    }).join("")+(greyRows.length?'<div class="sechead"><span>Unlisted</span><span>'+greyRows.length+' stocks &middot; no market data</span></div>'+greyHtml:"");
  } else {
    grid.style.height=""; grid.style.gridAutoRows=""; main.style.overflowY="";
    grid.innerHTML=rows.map(cellHtml).join("")+greyHtml;
  }
  document.getElementById("gearBtn").classList.toggle("on-filter",FILTER.some(function(f){return f!==0;}));
  updateSettings();
}
function openStock(sym){
  const idx=FULL_ROWS.findIndex(function(r){return r.sym===sym;});
  if(idx<0) return;
  const row=FULL_ROWS[idx];
  const price=(REAL&&REAL[sym])?REAL[sym].p:null;
  document.getElementById("stName").textContent=NAMES[sym]||sym;
  document.getElementById("stSym").textContent=sym;
  document.getElementById("stPrice").textContent=price===null?"\u2014":"\u20B9"+fmtINR(price);
  const chg=document.getElementById("stChange");
  chg.textContent=(row.pct>=0?"+":"")+row.pct.toFixed(2)+"%"+(price===null?"":" ("+(row.pct>=0?"+":"")+"\u20B9"+fmtINR(Math.abs(price*row.pct/100))+")");
  chg.style.color=row.pct>=0?"#22c55e":"#ef4444";
  // Last 5 days as actual % moves with dates (market-data "m").
  const mv=(REAL&&REAL[sym]&&REAL[sym].m)||[];
  document.getElementById("stMoves").innerHTML=mv.length?mv.map(function(p){
    const pct=p[1];
    return '<span class="mv"><span class="md">'+esc(p[0])+'</span><span style="color:'+(pct>=0?"#22c55e":"#ef4444")+'">'+(pct>=0?"+":"")+pct.toFixed(2)+'%</span></span>';
  }).join(""):'<span class="dim">No recent moves</span>';
  // Lens breakdown (watchlist stocks only).
  document.getElementById("stLens").innerHTML=lensHtml(sym);
  document.getElementById("stRank").textContent="Rank today: #"+(idx+1)+" of "+FULL_ROWS.length;
  const pills=TABS.filter(function(t){return t.key!=="NIFTY500"&&t.key!=="WATCHLIST"&&INDICES[t.key].indexOf(sym)>=0;}).map(function(t){return t.label;});
  if(INDICES.WATCHLIST.indexOf(sym)>=0) pills.push("My watchlist");
  if(pills.length===0) pills.push("Nifty 500");
  document.getElementById("stIndices").innerHTML=pills.map(function(p){return '<span class="pill">'+p+'</span>';}).join("");
  document.getElementById("stAsof").textContent=REAL?REAL_ASOF:"\u2014";
  document.getElementById("stGf").href="https://www.google.com/finance/quote/"+encodeURIComponent(sym)+":NSE";
  document.getElementById("stockOverlay").classList.add("open");
  lockScroll();
}
function lensHtml(sym){
  // Per-lens breakdown for a watchlist stock: overall verdict + score,
  // then per check (name, threshold, stock value, pass/fail). Returns ""
  // for non-watchlist stocks. Lenses are labelled "Buffett lens" etc.,
  // never "Buffett's view".
  if(INDICES.WATCHLIST.indexOf(sym)<0) return "";
  if(!LENS||!LENS[sym]){
    return '<div class="lens"><div class="dim">Investor lenses — data not available yet.</div></div>';
  }
  const rec=LENS[sym];
  const lenses=(LENS_META&&LENS_META.lenses)||[];
  let h='<div style="border-top:1px solid #374151;padding-top:10px;margin-top:10px"><div style="font-weight:800;margin-bottom:2px">Investor lenses <span class="dim" style="font-weight:400">— as of '+(LENS_SESSION||"\u2014")+'</span></div>'+
    '<div class="dim" style="font-size:11px;margin-bottom:4px">A mechanical reading of each investor\u2019s framework — \u201cBuffett lens\u201d, not \u201cBuffett\u2019s view\u201d.</div>';
  lenses.forEach(function(info){
    const k=info.key;
    const v=(rec.verdicts&&rec.verdicts[k])||"neutral";
    const sc=(rec.scores&&rec.scores[k])||[0,0];
    const vcol=v==="green"?"#22c55e":v==="red"?"#ef4444":"#9ca3af";
    const vword=v==="green"?"Green":v==="red"?"Red":"Neutral";
    h+='<div class="lens"><div class="lhead"><span class="bdot '+(v==="green"?"up":v==="red"?"dn":"flat")+'"></span>'+esc(info.label||k+" lens")+' — <span style="color:'+vcol+'">'+vword+' '+sc[0]+'/'+sc[1]+'</span></div>';
    (rec.checks[k]||[]).forEach(function(c){
      const mk=c.m?"na":(c.p?"ok":"no");
      const mark=c.m?"\u2014":(c.p?"\u2713":"\u2717");
      h+='<div class="lcheck"><span>'+esc(c.n)+'</span><span class="thr">'+esc(c.t)+'</span><span class="val">'+(c.v===null||c.v===undefined?"\u2014":esc(c.v))+'</span><span class="mk '+mk+'">'+mark+'</span></div>';
    });
    if(info.note) h+='<div class="lnote">'+esc(info.note)+'.</div>';
    h+='</div>';
  });
  if(rec.flags&&rec.flags.length){
    const fl=rec.flags.map(function(f){
      return f==="thin history"?"Thin history: 5y growth not available, 3y used":f==="loss-making"?"Loss-making: no P/E":f;
    }).join(" \u00b7 ");
    h+='<div class="lflag">\u26A0 '+esc(fl)+'</div>';
  }
  h+='</div>';
  return h;
}
function openUnlisted(name){
  document.getElementById("unName").textContent=name;
  document.getElementById("unlistedOverlay").classList.add("open");
  lockScroll();
}
const nav=document.getElementById("tabs");
TABS.forEach(function(t){
  const b=document.createElement("button");
  b.textContent=t.label+" ("+INDICES[t.key].length+")";
  b.dataset.key=t.key;
  b.onclick=function(){render(t.key);};
  nav.appendChild(b);
});
document.getElementById("grid").addEventListener("click",function(e){
  const c=e.target.closest(".cell");
  if(!c) return;
  if(c.dataset.unlisted){ openUnlisted(c.dataset.name); return; }
  if(c.dataset.sym) openStock(c.dataset.sym);
});
const fcWrap=document.getElementById("fcircles");
let fcBtns=[];
function buildFilterUI(){
  // Dot-filter circles: 5 trend days on index tabs, 6 lenses (labelled)
  // on the watchlist tab. Tap cycles any -> green -> red -> any.
  fcWrap.innerHTML="";
  fcBtns=[];
  const n=CUR_TYPE==="watchlist"?6:5;
  for(let i=0;i<n;i++){
    const wrap=document.createElement("div"); wrap.className="fcol";
    const b=document.createElement("button");
    b.className="fc";
    if(CUR_TYPE==="watchlist"){
      const lk=LENS_ORDER[i];
      b.setAttribute("aria-label",lk+" lens");
      const lab=document.createElement("span"); lab.className="fclab"; lab.textContent=LENS_SHORT[lk];
      wrap.appendChild(b); wrap.appendChild(lab);
    } else {
      b.setAttribute("aria-label","Day "+(i+1));
      wrap.appendChild(b);
    }
    b.onclick=function(){
      FILTER[i]=FILTER[i]===0?1:FILTER[i]===1?-1:0;
      paintCircles(); render(CUR_KEY);
    };
    fcWrap.appendChild(wrap); fcBtns.push(b);
  }
  const clearBtn=document.createElement("button");
  clearBtn.id="clearFilter"; clearBtn.textContent="Clear";
  clearBtn.onclick=function(){ FILTER=[0,0,0,0,0,0]; paintCircles(); render(CUR_KEY); };
  fcWrap.appendChild(clearBtn);
  paintCircles();
}
function paintCircles(){
  fcBtns.forEach(function(b,i){
    b.classList.toggle("green",FILTER[i]===1);
    b.classList.toggle("red",FILTER[i]===-1);
  });
}
const overlay=document.getElementById("overlay");
const stockOverlay=document.getElementById("stockOverlay");
const unlistedOverlay=document.getElementById("unlistedOverlay");
// While any popup is open the page behind stays locked; closeAll restores
// it, so the list is visible and scrollable again. (Mobile has no Esc and
// a tall panel can cover the backdrop, so the visible ✕ button is the
// primary way back.)
function lockScroll(){ document.body.style.overflow="hidden"; document.documentElement.style.overflow="hidden"; }
function unlockScroll(){ document.body.style.overflow=""; document.documentElement.style.overflow=""; }
function closeAll(){ overlay.classList.remove("open"); stockOverlay.classList.remove("open"); unlistedOverlay.classList.remove("open"); unlockScroll(); }
document.getElementById("gearBtn").onclick=function(){ overlay.classList.add("open"); lockScroll(); };
document.getElementById("closeSettings").onclick=closeAll;
document.getElementById("closeStock").onclick=closeAll;
document.getElementById("closeUnlisted").onclick=closeAll;
document.getElementById("sectorToggleHdr").onclick=function(){
  SECTOR_MODE=!SECTOR_MODE;
  this.classList.toggle("on",SECTOR_MODE);
  render(CUR_KEY);
};
document.getElementById("azToggleHdr").onclick=function(){
  AZ_MODE=!AZ_MODE;
  this.classList.toggle("on",AZ_MODE);
  render(CUR_KEY);
};
overlay.addEventListener("click",function(e){ if(e.target===overlay) closeAll(); });
stockOverlay.addEventListener("click",function(e){ if(e.target===stockOverlay) closeAll(); });
unlistedOverlay.addEventListener("click",function(e){ if(e.target===unlistedOverlay) closeAll(); });
document.addEventListener("keydown",function(e){ if(e.key==="Escape"){ closeAll(); } });
Promise.all([loadReal(),loadLens()]).then(function(){ buildFilterUI(); render("NIFTY500"); });
</script>
</body>
</html>
`;
fs.writeFileSync(__dirname + '/nifty500-heatmap-sample.html', html);
console.log('wrote nifty500-heatmap-sample.html,', html.length, 'bytes');
for (const t of TABS) console.log(t.key, IND[t.key].length, 'cols', t.cols, 'rows', Math.ceil(IND[t.key].length / t.cols));
