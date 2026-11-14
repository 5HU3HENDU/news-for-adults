// Generate nifty500-heatmap-sample.html (v10: settings popup + tap-a-stock
// detail popup with Google Finance link + sector switch and A-Z sort in
// the header + "My watchlist" tab) from final-lists.json, watchlist.json
// and sectors.json.
const fs = require('fs');
const fin = JSON.parse(fs.readFileSync(__dirname + '/final-lists.json', 'utf8'));
const I = fin.indices;
const wl = JSON.parse(fs.readFileSync(__dirname + '/watchlist.json', 'utf8'));
const wlSyms = wl.stocks.map(s => s.sym);
const wlNames = Object.fromEntries(wl.stocks.map(s => [s.sym, s.name]));
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
<!-- nifty500-heatmap-v10 -->
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
  #panel{background:#111827;border:1px solid #374151;border-radius:12px;padding:16px;width:100%;max-width:430px;color:#e5e7eb;font-size:13px;line-height:1.6}
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
  #stockPanel{background:#111827;border:1px solid #374151;border-radius:12px;padding:16px;width:100%;max-width:430px;color:#e5e7eb;font-size:14px;line-height:1.6}
  #stockPanel .dim{color:#9ca3af}
  #stockPanel .srow{margin-bottom:8px}
  #stockPanel .srow:last-child{margin-bottom:0}
  .bdot{width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:7px}
  .bdot.up{background:#22c55e}.bdot.dn{background:#ef4444}.bdot.flat{background:#4b5563}
  .pill{display:inline-block;background:#1f2937;border:1px solid #4b5563;border-radius:999px;padding:1px 10px;font-size:12px;margin:2px 4px 2px 0}
  @media(max-width:700px){
    body{overflow:auto;height:auto}
    #grid{grid-template-columns:repeat(5,1fr)!important;grid-auto-rows:auto;height:auto}
    .cell{padding:9px 4px}
    .sym{font-size:15cqw}
    .ret{font-size:13cqw}
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
<div id="overlay"><div id="panel">
  <div class="prow">Top-left = <b>biggest gainer</b> \u00b7 Bottom-right = <b>biggest loser</b> \u00b7 Dots = last 5 days, oldest \u2192 yesterday (<span style="color:#22c55e">\u25cf</span> up, <span style="color:#ef4444">\u25cf</span> down)</div>
  <div class="prow dim" id="gapLine"></div>
  <div class="prow"><span class="dim">Dot filter</span><div id="fcircles"></div></div>
  <div class="prow"><span class="dim">Last updated:</span> <span id="lastUpdated">\u2014</span><br><span class="dim">Next update:</span> <span id="nextUpdate">\u2014</span><br><span class="dim">Data:</span> <span id="dataStatus">SAMPLE DATA</span></div>
</div></div>
<div id="stockOverlay"><div id="stockPanel">
  <div class="srow"><div style="font-size:17px;font-weight:800" id="stName"></div><div class="dim" id="stSym"></div></div>
  <div class="srow"><span style="font-size:20px;font-weight:800" id="stPrice"></span> <span id="stChange" style="font-weight:700"></span></div>
  <div class="srow"><div id="stDots"></div><div class="dim" id="stPattern"></div></div>
  <div class="srow" id="stRank"></div>
  <div class="srow" id="stIndices"></div>
  <div class="srow dim" style="font-size:12px">Data as of <span id="stAsof">\u2014</span></div>
  <div class="srow"><a id="stGf" href="#" target="_blank" rel="noopener" style="color:#fbbf24;font-weight:700;text-decoration:none">Google Finance \u2197</a></div>
</div></div>
<script>
const INDICES=${dataJson};
const NAMES=${namesJson};
const SECTORS=${sectorsJson};
const TABS=${tabsJson};
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
let FILTER=[0,0,0,0,0];
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
function realRow(sym){
  if(REAL&&REAL[sym]){ const rec=REAL[sym]; return {pct:rec.c, dots:rec.d, real:true}; }
  const dots=[]; for(let k=5;k>=1;k--){dots.push(dayUp(sym,k)?1:0);}
  return {pct:samplePct(sym), dots:dots, real:false};
}
function cellHtml(r){
  const pctTxt=(r.pct>=0?"+":"")+r.pct.toFixed(2)+"%";
  const dots=r.dots.map(function(v){
    return '<span class="dot '+(v===1?"up":v===0?"dn":"flat")+'"></span>';
  }).join("");
  return '<div class="cell" data-sym="'+r.sym+'" style="background:'+colorFor(r.pct)+'"><span class="sym">'+r.sym+
    '</span><span class="ret">'+pctTxt+'</span><span class="dots">'+dots+'</span></div>';
}
function render(key){
  CUR_KEY=key;
  const tab=TABS.find(function(t){return t.key===key;});
  document.getElementById("brandName").textContent=tab.label.toUpperCase();
  document.querySelectorAll("#tabs button").forEach(function(b){b.classList.toggle("on",b.dataset.key===key);});
  const grid=document.getElementById("grid");
  grid.style.gridTemplateColumns="repeat("+tab.cols+",1fr)";
  let fallback=0;
  const full=INDICES[key].map(function(sym){
    const r=realRow(sym); if(!r.real) fallback++;
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
  const main=document.querySelector("main");
  if(rows.length===0){
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
    }).join("");
  } else {
    grid.style.height=""; grid.style.gridAutoRows=""; main.style.overflowY="";
    grid.innerHTML=rows.map(cellHtml).join("");
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
  document.getElementById("stDots").innerHTML=row.dots.map(function(v){
    return '<span class="bdot '+(v===1?"up":v===0?"dn":"flat")+'"></span>';
  }).join("");
  const ups=row.dots.filter(function(v){return v===1;}).length;
  const dns=row.dots.filter(function(v){return v===0;}).length;
  let streak=0; const last=row.dots[4];
  if(last!==null){ for(let i=4;i>=0&&row.dots[i]===last;i--){ streak++; } }
  let pat="";
  if(ups===0&&dns===0){ pat="No trend data"; }
  else{
    pat=(ups>=dns?"Up ":"Down ")+Math.max(ups,dns)+" of 5";
    if(streak>=2){ pat+=" \u00b7 "+(last===1?"Up ":"Down ")+streak+" in a row"; }
  }
  document.getElementById("stPattern").textContent=pat;
  document.getElementById("stRank").textContent="Rank today: #"+(idx+1)+" of "+FULL_ROWS.length;
  const pills=TABS.filter(function(t){return t.key!=="NIFTY500"&&t.key!=="WATCHLIST"&&INDICES[t.key].indexOf(sym)>=0;}).map(function(t){return t.label;});
  if(INDICES.WATCHLIST.indexOf(sym)>=0) pills.push("My watchlist");
  if(pills.length===0) pills.push("Nifty 500");
  document.getElementById("stIndices").innerHTML=pills.map(function(p){return '<span class="pill">'+p+'</span>';}).join("");
  document.getElementById("stAsof").textContent=REAL?REAL_ASOF:"\u2014";
  document.getElementById("stGf").href="https://www.google.com/finance/quote/"+encodeURIComponent(sym)+":NSE";
  document.getElementById("stockOverlay").classList.add("open");
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
  if(c&&c.dataset.sym) openStock(c.dataset.sym);
});
const fcWrap=document.getElementById("fcircles");
const fcBtns=[];
for(let i=0;i<5;i++){
  const b=document.createElement("button");
  b.className="fc"; b.setAttribute("aria-label","Day "+(i+1));
  b.onclick=function(){
    FILTER[i]=FILTER[i]===0?1:FILTER[i]===1?-1:0;
    paintCircles(); render(CUR_KEY);
  };
  fcWrap.appendChild(b); fcBtns.push(b);
}
function paintCircles(){
  fcBtns.forEach(function(b,i){
    b.classList.toggle("green",FILTER[i]===1);
    b.classList.toggle("red",FILTER[i]===-1);
  });
}
const clearBtn=document.createElement("button");
clearBtn.id="clearFilter"; clearBtn.textContent="Clear";
clearBtn.onclick=function(){ FILTER=[0,0,0,0,0]; paintCircles(); render(CUR_KEY); };
fcWrap.appendChild(clearBtn);
const overlay=document.getElementById("overlay");
const stockOverlay=document.getElementById("stockOverlay");
document.getElementById("gearBtn").onclick=function(){ overlay.classList.add("open"); };
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
overlay.addEventListener("click",function(e){ if(e.target===overlay) overlay.classList.remove("open"); });
stockOverlay.addEventListener("click",function(e){ if(e.target===stockOverlay) stockOverlay.classList.remove("open"); });
document.addEventListener("keydown",function(e){ if(e.key==="Escape"){ overlay.classList.remove("open"); stockOverlay.classList.remove("open"); } });
loadReal().then(function(){render("NIFTY500");});
</script>
</body>
</html>
`;
fs.writeFileSync(__dirname + '/nifty500-heatmap-sample.html', html);
console.log('wrote nifty500-heatmap-sample.html,', html.length, 'bytes');
for (const t of TABS) console.log(t.key, IND[t.key].length, 'cols', t.cols, 'rows', Math.ceil(IND[t.key].length / t.cols));
