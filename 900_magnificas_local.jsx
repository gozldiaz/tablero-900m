import { useState, useEffect, useRef, useMemo } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const UPLOAD_PIN = "900mag";

const callClaude = async (system, messages, maxTokens, useSearch) => {
  const body = { model: MODEL, max_tokens: maxTokens || 1000, system, messages };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const timedFetch = (url, opts, ms) => Promise.race([
    fetch(url, opts),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Sin respuesta del servidor (" + Math.round(ms/1000) + "s). Verifica la conexion con PING e intenta de nuevo.")), ms))
  ]);

  try {
    const res = await timedFetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 90000);
    if (!res.ok) throw new Error("Error del servidor: HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (data.stop_reason === "tool_use") {
      const toolResults = data.content.filter(b => b.type === "tool_use").map(b => ({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(b.input) }));
      const body2 = { model: MODEL, max_tokens: maxTokens || 1000, system, messages: [...messages, { role: "assistant", content: data.content }, { role: "user", content: toolResults }] };
      if (useSearch) body2.tools = [{ type: "web_search_20250305", name: "web_search" }];
      const res2 = await timedFetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body2) }, 90000);
      if (!res2.ok) throw new Error("Error del servidor (tool_use): HTTP " + res2.status);
      const data2 = await res2.json();
      if (data2.error) throw new Error(data2.error.message);
      return data2.content.filter(b => b.type === "text").map(b => b.text).join("");
    }
    return data.content.filter(b => b.type === "text").map(b => b.text).join("");
  } catch(e) {
    throw e;
  }
};


const fmt = (n, d) => { d = d == null ? 2 : d; return n == null ? "\u2014" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const fmtPct = (n) => n == null ? "\u2014" : (Number(n) > 0 ? "+" : "") + Number(n).toFixed(2) + "%";
const fmtCap = (n) => { if (n == null) return "\u2014"; if (Math.abs(n) >= 1e12) return (n/1e12).toFixed(2)+"T"; if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(2)+"B"; if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2)+"M"; return fmt(n,0); };
const fmtVol = (n) => { if (n == null) return "\u2014"; if (n >= 1e9) return (n/1e9).toFixed(1)+"B"; if (n >= 1e6) return (n/1e6).toFixed(1)+"M"; if (n >= 1e3) return Math.round(n/1e3)+"K"; return String(n); };
const pc = (v) => v == null ? "#5a6478" : v > 0 ? "#00d964" : v < 0 ? "#ff3b5c" : "#5a6478";
const ac = (v) => v == null ? "#5a6478" : v > 0 ? "#00d964" : v < 0 ? "#ff3b5c" : "#5a6478";
const hc = (v) => { if (v == null) return "#1a1f2e"; const c = Math.min(Math.abs(v)/5,1); return v > 0 ? "rgba(0,217,100,"+(0.15+c*0.6)+")" : "rgba(255,59,92,"+(0.15+c*0.6)+")"; };
const cc = (v) => { if (v == null) return { bg:"#1a1f2e", text:"#5a6478" }; if (v>=0.7) return {bg:"rgba(0,217,100,0.35)",text:"#00d964"}; if (v>=0.4) return {bg:"rgba(0,217,100,0.15)",text:"#00b854"}; if (v>=0.1) return {bg:"rgba(0,217,100,0.06)",text:"#5a7a6a"}; if (v>=-0.1) return {bg:"#1a1f2e",text:"#5a6478"}; if (v>=-0.4) return {bg:"rgba(255,59,92,0.06)",text:"#7a5a5a"}; if (v>=-0.7) return {bg:"rgba(255,59,92,0.15)",text:"#cc3060"}; return {bg:"rgba(255,59,92,0.35)",text:"#ff3b5c"}; };
const vsc = (v) => v == null ? "#5a6478" : v >= 8 ? "#00d964" : v >= 5 ? "#f59e0b" : "#ff3b5c";

const SECTOR_MAP = {
  // -- Sectores con universo de referencia SPDR automatizable --------------------
  "Tech/MegaCap":          ["AAPL","MSFT","GOOGL","META","AMZN","ADBE","CRM","ACN","SAP","ORCL","IBM","CSCO","GRMN","MSI","EA","HPQ",
                             "BIDU","BABA","PDD","SATL","ANET"],
  "Semiconductores":       ["NVDA","AMD","TSM","AVGO","ASML","MU","INTC","AMAT","TXN","MRVL","ARM","QCOM","LRCX","ADI","SMH","SMSN.IL","SNDK"],
  "Software/High-Beta":    ["PLTR","SNOW","CRWD","PANW","SHOP","ZM","DOCU","PATH","SPOT","NFLX","SNAP","PINS","SE","NOW","TEM","GLOB","NBIS"],
  "Telecom":               ["VZ","T","AMX","TMUS"],
  "Consumo Basico":        ["PG","KO","PEP","MO","WMT","TGT","MDLZ","HSY","UL","CL","COST","KMB","PM","ABEV"],
  "Consumo Discrec":       ["MCD","SBUX","NKE","ANF","EBAY","URBN","ORLY","ETSY","TM","HMC","NSANY","GM","ARCO","HD","RACE","TSLA","UBER","RBLX","TRIP","ABNB",
                             "NIO","MELI","TCOM","DIS","ADS.DE","JMIA","HAVA.BA","MORI.BA","BHIP.BA","COME.BA"],
  "Salud":                 ["JNJ","LLY","NVO","AMGN","UNH","PFE","ABT","CVS","ABBV","TMO","AZN","CAH","ISRG","MRNA","NVS","PHG","MRK","GILD","BMY","BAYN.DE","HIMS"],
  "Defensa/Aeroespacial":  ["LMT","RTX","BA","HON","ITA","RKLB","ONDS"],
  "Industriales/Materiales":["CAT","GE","UAL","F","AAL","UNP","FDX","PCAR","MMM","PAC","GT","DOW","PBI"],
  // -- Sectores con manual curation (<70% US o multiplos estructuralmente distintos) --
  "Energia":               ["OXY","XOM","CVX","PSX","CL=F","YPF","VIST","VST","PBR","AXIA","OKLO","BP","E","SHEL","HAL","SLB","COP","GPRK","CEG","FSLR",
                             "YPFD.BA","CEPU.BA","PAMP.BA","TRAN.BA","NEE"],
  "Metales/Mineria":       ["PAAS","GLD","SLV","HMY","COPX","URA","B","VALE","LAC","RIO","GFI","GGB","FCX","HL","NEM","NXE","GOLD","MUX","CCJ","BHP","MP"],
  "Finanzas":              ["JPM","AXP","MA","V","PYPL","AIG","BRK-B","AEG","WFC","BK","BCS","HSBC","LYG","ING","GS","BX","BAC","MUFG","SAN",
                             "GGAL","ITUB","BBD","BBAR","BMA.BA","IBN","NU","XP","PAGS","C","SCHW","MRSH"],
  "Agro/Alimentos":        ["MOS","BG","AGRO","LND","ZC=F","ZS=F","ADM"],
  "ADRs Argentinos":       ["CEPU","TGS","TEO","IRS","LOMA","SUPV","EDN"],
  // -- Excluidos del Z-score (sin fundamentales equity comparables) ---------------
  "ETFs/Indices":          ["SPY","QQQ","XLP","XLU","PSQ","EWZ","FXI","TLT","^N225","^MERV","DIA","ARKK","XLY","XLV","XLRE","XLK","XLI","XLF","XLE","XLC","XLB","IWM","^TNX","^VIX","EEM"],
  "Macro/Divisas":         ["DX-Y.NYB","HYG","LQD","^IRX","HG","GC=F","SHY"],
  "Crypto":                ["BTC-USD","ETH-USD","RIOT","MSTR","COIN","MARA","IBIT"],
  // Emergentes/ADR: disuelto 2026-04-17 (Opus 4.7) - 26 tickers redistribuidos a sectores funcionales
};

const getSector = (sym) => { for (const [s,ts] of Object.entries(SECTOR_MAP)) { if (ts.includes(sym)) return s; } return "Otros"; };

// -- Histeresis tri-estado sobre masterPctRaw ---------------------------------
// Validado empiricamente (T=77, sweep secuencial, 0.6% friccion BYMA):
//   BLEND [0.6/1.2sigma] w=0.7 -> turnover 44%, alpha neto +1.51% vs RS 20D puro
//   vs Retention Buffer / Cooldown -> descartados (destruyen alpha)
const HYST_LOW   = 0.6;
const HYST_HIGH  = 1.2;
const HYST_BLEND = 0.7;

const applyHysteresis = (rawScores, prevScores) => {
  const values = rawScores.map(t => t.masterPctRaw ?? 0);
  const n      = values.length;
  if (n === 0) return { smoothed: {}, nextPrev: {}, branches: {} };
  const mean   = values.reduce((a, b) => a + b, 0) / n;
  const sigma  = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1e-9;
  const smoothed = {};
  const nextPrev = {};
  const branches = {};
  for (const t of rawScores) {
    const sym   = t.symbol;
    const curr  = t.masterPctRaw ?? 0;
    const prev  = prevScores[sym] ?? curr;
    const delta = Math.abs(curr - prev);
    let s;
    if (delta < HYST_LOW * sigma) {
      s = prev;
      branches[sym] = "LOWER_BOUND";
    } else if (delta < HYST_HIGH * sigma) {
      s = HYST_BLEND * curr + (1 - HYST_BLEND) * prev;
      branches[sym] = "BLEND";
    } else {
      s = curr;
      branches[sym] = "UPPER_BOUND";
    }
    smoothed[sym] = parseFloat(s.toFixed(2));
    nextPrev[sym] = smoothed[sym];
  }
  return { smoothed, nextPrev, branches };
};

const calcValScore = (t) => {
  let score = 0, n = 0;
  if (t.forward_pe != null && t.forward_pe > 0 && t.forward_pe < 100) { score += Math.max(1, Math.min(10, 10-(t.forward_pe-5)*0.257)); n++; }
  if (t.price_book != null && t.price_book > 0) { score += Math.max(1, Math.min(10, 10-(t.price_book-0.5)*0.947)); n++; }
  if (t.target_1yr != null && t.last_price != null && t.last_price > 0) { const up = (t.target_1yr-t.last_price)/t.last_price*100; score += Math.max(1, Math.min(10, 5+up/10)); n++; }
  return n > 0 ? Math.round(score/n) : null;
};

const calcCorrelation = (s1, s2, snaps) => {
  // Alineacion estricta (pairwise deletion): solo dias con datos en ambos
  const dates = Object.keys(snaps).sort();
  const a = [], b = [];
  for (const d of dates) {
    const v1 = snaps[d].tickers?.find(t=>t.symbol===s1)?.change_pct;
    const v2 = snaps[d].tickers?.find(t=>t.symbol===s2)?.change_pct;
    if (v1 != null && v2 != null) { a.push(v1); b.push(v2); }
  }
  const n = a.length;
  if (n < 20) return null;

  // Funcion auxiliar: convierte valores en rangos (1-based), con empates promediados
  const toRanks = (arr) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < n) {
      let j = i;
      // Agrupar todos los empates
      while (j < n - 1 && sorted[j + 1].v === sorted[j].v) j++;
      // Rango promedio para el grupo de empates (1-based)
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[sorted[k].i] = avgRank;
      i = j + 1;
    }
    return ranks;
  };

  const ra = toRanks(a);
  const rb = toRanks(b);

  // Correlacion de Pearson aplicada sobre los rangos = Correlacion de Spearman
  const mra = ra.reduce((x, y) => x + y, 0) / n;
  const mrb = rb.reduce((x, y) => x + y, 0) / n;
  const num = ra.reduce((s, v, i) => s + (v - mra) * (rb[i] - mrb), 0);
  const da  = Math.sqrt(ra.reduce((s, v) => s + (v - mra) ** 2, 0));
  const db  = Math.sqrt(rb.reduce((s, v) => s + (v - mrb) ** 2, 0));
  return da && db ? (num / (da * db)).toFixed(2) : null;
};

const SECTOR_BENCHMARKS = {
  "Tech/MegaCap": "QQQ", "Semiconductores": "NVDA", "Software/High-Beta": "PLTR", "Telecom": "VZ",
  "Energia": "XOM", "Metales/Mineria": "GLD",
  "Finanzas": "JPM", "Consumo Basico": "XLP", "Consumo Discrec": "XLY", "Salud": "JNJ",
  "Defensa/Aeroespacial": "LMT", "Industriales/Materiales": "GE",
  "ETFs/Indices": "SPY", "Emergentes/ADR": "EEM",
  "Crypto": "BTC-USD", "Macro/Divisas": "TLT",
};

const MACRO_ANCHORS = ["SPY","QQQ","CL=F","GLD","DX-Y.NYB","TLT","HYG"];

const buildClusters = (symbols, snaps, threshold) => {
  threshold = threshold || 0.55;
  const dates = Object.keys(snaps).sort();
  if (dates.length < 20) return { clusters: [], ready: false, daysNeeded: 20, daysAvailable: dates.length };
  const pairs = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i+1; j < symbols.length; j++) {
      const c = calcCorrelation(symbols[i], symbols[j], snaps);
      if (c != null) pairs.push({ s1: symbols[i], s2: symbols[j], corr: Number(c) });
    }
  }
  const groups = symbols.map(s => new Set([s]));
  const merged = new Set();
  for (const { s1, s2, corr } of pairs.sort((a,b) => Math.abs(b.corr)-Math.abs(a.corr))) {
    if (Math.abs(corr) < threshold) continue;
    const g1idx = groups.findIndex(g => g.has(s1) && !merged.has(g));
    const g2idx = groups.findIndex(g => g.has(s2) && !merged.has(g));
    if (g1idx === -1 || g2idx === -1 || g1idx === g2idx) continue;
    for (const s of groups[g2idx]) groups[g1idx].add(s);
    merged.add(groups[g2idx]);
  }
  const activeClusters = groups
    .filter(g => !merged.has(g) && g.size > 1)
    .map(g => {
      const members = [...g];
      let sum = 0, n = 0;
      for (let i = 0; i < members.length; i++) {
        for (let j = i+1; j < members.length; j++) {
          const c = calcCorrelation(members[i], members[j], snaps);
          if (c != null) { sum += Math.abs(Number(c)); n++; }
        }
      }
      const avgCorr = n > 0 ? sum / n : 0;
      const sectorCounts = {};
      for (const s of members) {
        const sec = getSector(s);
        sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
      }
      const dominantSector = Object.entries(sectorCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
      return { members, avgCorr, dominantSector };
    })
    .filter(cl => cl.avgCorr >= threshold)
    .sort((a,b) => b.avgCorr - a.avgCorr);
  return { clusters: activeClusters, ready: true, daysAvailable: dates.length };
};

const calcLeaderLag = (s1, s2, snaps, maxLag) => {
  maxLag = maxLag || 3;
  const dates = Object.keys(snaps).sort();
  if (dates.length < 20) return null;
  const r1 = dates.map(d => snaps[d].tickers?.find(t=>t.symbol===s1)?.change_pct).filter(v=>v!=null);
  const r2 = dates.map(d => snaps[d].tickers?.find(t=>t.symbol===s2)?.change_pct).filter(v=>v!=null);
  const n = Math.min(r1.length, r2.length);
  if (n < maxLag + 4) return null;
  const lagCorrs = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    if (lag === 0) continue;
    const a = lag > 0 ? r1.slice(0, n-lag) : r1.slice(-lag);
    const b = lag > 0 ? r2.slice(lag) : r2.slice(0, n+lag);
    const mn = Math.min(a.length, b.length);
    if (mn < 4) continue;
    const ma = a.slice(-mn).reduce((x,y)=>x+y,0)/mn;
    const mb = b.slice(-mn).reduce((x,y)=>x+y,0)/mn;
    const num = a.slice(-mn).reduce((s,v,i)=>s+(v-ma)*(b.slice(-mn)[i]-mb),0);
    const da = Math.sqrt(a.slice(-mn).reduce((s,v)=>s+(v-ma)**2,0));
    const db = Math.sqrt(b.slice(-mn).reduce((s,v)=>s+(v-mb)**2,0));
    if (da && db) lagCorrs.push({ lag, corr: num/(da*db) });
  }
  if (!lagCorrs.length) return null;
  const best = lagCorrs.sort((a,b)=>Math.abs(b.corr)-Math.abs(a.corr))[0];
  // Solo exigimos significancia economica real del mejor lag (> 0.25).
  // En retornos EOD, zeroLag siempre domina - comparar contra el garantiza tasa nula.
  if (Math.abs(best.corr) <= 0.25) return null;
  return { leader: best.lag > 0 ? s1 : s2, follower: best.lag > 0 ? s2 : s1, lag: Math.abs(best.lag), corr: best.corr };
};

const calcMacroSensitivity = (symbol, snaps) => {
  const dates = Object.keys(snaps).sort();
  if (dates.length < 20) return null;
  const result = {};
  for (const anchor of MACRO_ANCHORS) {
    const c = calcCorrelation(symbol, anchor, snaps);
    if (c != null) result[anchor] = Number(c);
  }
  return Object.keys(result).length > 0 ? result : null;
};

const detectClusterDecoupling = (cluster, snaps) => {
  const dates = Object.keys(snaps).sort();
  if (dates.length < 20) return [];
  const alerts = [];
  const hSnaps = {}, rSnaps = {};
  dates.slice(0, -4).forEach(d => hSnaps[d] = snaps[d]);
  dates.slice(-4).forEach(d => rSnaps[d] = snaps[d]);
  const { members } = cluster;
  for (let i = 0; i < members.length; i++) {
    for (let j = i+1; j < members.length; j++) {
      const hCorr = Number(calcCorrelation(members[i], members[j], hSnaps) || 0);
      const rCorr = Number(calcCorrelation(members[i], members[j], rSnaps) || 0);
      const delta = Math.abs(hCorr - rCorr);
      if (delta >= 0.45 && Math.abs(hCorr) >= 0.5) {
        alerts.push({ s1: members[i], s2: members[j], histCorr: hCorr, recentCorr: rCorr, delta, diverging: hCorr > 0.4 && rCorr < 0.1 });
      }
    }
  }
  return alerts.sort((a,b) => b.delta - a.delta);
};

const discoverCorrelations = (snaps, threshold) => {
  threshold = threshold || 0.65;
  const dates = Object.keys(snaps).sort();
  if (dates.length < 20) return { strong:[], decoupling:[], filtered:true };
  const symbols = [...new Set(dates.flatMap(d=>(snaps[d].tickers||[]).map(t=>t.symbol)))];
  const pairs = [], checked = new Set();
  for (const s1 of symbols) {
    const sector1 = getSector(s1);
    for (const s2 of symbols.filter(s=>s!==s1&&getSector(s)===sector1)) {
      const key=[s1,s2].sort().join('|');
      if (checked.has(key)) continue; checked.add(key);
      const cv=Number(calcCorrelation(s1,s2,snaps)||0);
      if(Math.abs(cv)>=threshold) pairs.push({s1,s2,corr:cv,type:'intra-sector'});
    }
  }
  pairs.sort((a,b)=>Math.abs(b.corr)-Math.abs(a.corr));
  const decoupling=[];
  if(dates.length>=6){
    const hSnaps={},rSnaps={};
    dates.slice(0,-3).forEach(d=>hSnaps[d]=snaps[d]);
    dates.slice(-3).forEach(d=>rSnaps[d]=snaps[d]);
    for(const{s1,s2,corr:hCorr}of pairs.slice(0,30)){
      const rc=calcCorrelation(s1,s2,rSnaps);
      if(rc==null)continue;
      const rcv=Number(rc),delta=Math.abs(hCorr-rcv);
      if(delta>=0.5)decoupling.push({s1,s2,histCorr:hCorr,recentCorr:rcv,delta,diverging:hCorr>0.4&&rcv<0.1});
    }
    decoupling.sort((a,b)=>b.delta-a.delta);
  }
  return{strong:pairs.slice(0,50),decoupling:decoupling.slice(0,10),filtered:true,stats:{totalChecked:checked.size,found:pairs.length}};
};

const checkHypotheses = (hyps, snaps) => {
  const dates = Object.keys(snaps).sort();
  if (dates.length<3) return hyps.map(h=>({...h,corr:null,status:"sin_datos"}));
  return hyps.map(h => {
    const c = calcCorrelation(h.s1,h.s2,snaps);
    if (c==null) return {...h,corr:null,status:"sin_datos"};
    const cv=Number(c);
    let status;
    if (Math.abs(cv)>=0.65) status=cv>0?"confirmada_pos":"confirmada_neg";
    else if (Math.abs(cv)>=0.35) status="debil";
    else status="no_confirmada";
    if (dates.length>=6&&Math.abs(cv)>=0.5) {
      const rSnaps={}; dates.slice(-3).forEach(d=>rSnaps[d]=snaps[d]);
      const rc=calcCorrelation(h.s1,h.s2,rSnaps);
      if (rc!=null&&Math.abs(cv-Number(rc))>=0.5) status="desacoplando";
    }
    return {...h,corr:cv,status};
  });
};

const calcAlerts = (snaps, selDate) => {
  const dates = Object.keys(snaps).sort();
  const current = snaps[selDate];
  if (!current) return {alerts:[],days:dates.length};
  const spChange = current.market?.sp500?.change_pct;
  const alerts = [];
  for (const ticker of (current.tickers||[])) {
    if (ticker.change_pct==null) continue;
    const history = dates.filter(d=>d!==selDate).map(d=>snaps[d].tickers?.find(t=>t.symbol===ticker.symbol)?.change_pct).filter(v=>v!=null);
    if (history.length>=2) {
      const mean=history.reduce((a,b)=>a+b,0)/history.length;
      const std=Math.sqrt(history.reduce((a,b)=>a+(b-mean)**2,0)/history.length);
      if (std>0) {
        const z=(ticker.change_pct-mean)/std;
        if (Math.abs(z)>=2) {
          const div=spChange!=null?(ticker.change_pct-spChange).toFixed(2):null;
          alerts.push({symbol:ticker.symbol,type:"movement",severity:Math.abs(z)>=3?"high":"medium",z:z.toFixed(1),change:ticker.change_pct,mean:mean.toFixed(2),divergence:div,last_price:ticker.last_price});
        }
      }
    }
    const prevDate=dates.filter(d=>d<selDate).pop();
    if (prevDate) {
      const prev=snaps[prevDate].tickers?.find(t=>t.symbol===ticker.symbol);
      if (prev?.forward_pe&&ticker.forward_pe) {
        const peDelta=prev.forward_pe!==0?(ticker.forward_pe-prev.forward_pe)/Math.abs(prev.forward_pe)*100:null;
        if (Math.abs(peDelta)>=15) alerts.push({symbol:ticker.symbol,type:"fundamental",severity:"medium",message:"Forward P/E cambio "+peDelta.toFixed(1)+"% ("+fmt(prev.forward_pe)+" a "+fmt(ticker.forward_pe)+")",change:ticker.change_pct,last_price:ticker.last_price});
      }
    }
  }
  alerts.sort((a,b)=>Math.abs(Number(b.z||0))-Math.abs(Number(a.z||0)));
  return {alerts,days:dates.length};
};

const calcMedian = (arr) => {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const calcMAD = (arr, median) => {
  if (!arr || arr.length === 0 || median == null) return null;
  return calcMedian(arr.map(v => Math.abs(v - median)));
};

const calcSectorArbitrage = (tickers, sectorUniverseRef = null) => {
  // -- Fuente de estadisticas sectoriales -----------------------------------
  // Si hay universo de referencia fijo (sectorUniverseRef), usalo como
  // denominador del Z-score - independiente del universo de la sesion.
  // Fallback: calcular sobre la sesion actual (comportamiento original).
  // Esto resuelve el showstopper de reproducibilidad identificado por Opus 4.7.
  const getRefStats = (sector) => {
    if (!sectorUniverseRef?.sectores?.[sector]) return null;
    const ref = sectorUniverseRef.sectores[sector];
    const stats = {};
    if (ref.fpe_median != null && ref.fpe_mad != null && ref.fpe_mad > 0)
      stats.forward_pe = { mean: ref.fpe_median, std: ref.fpe_mad * 1.4826, n: ref.fpe_n };
    if (ref.pb_median != null && ref.pb_mad != null && ref.pb_mad > 0)
      stats.price_book = { mean: ref.pb_median, std: ref.pb_mad * 1.4826, n: ref.pb_n };
    return Object.keys(stats).length > 0 ? stats : null;
  };

  const groups = {};
  for (const t of tickers) {
    const s = getSector(t.symbol);
    if (!groups[s]) groups[s] = [];
    groups[s].push(t);
  }
  const results = {};
  for (const [sector, members] of Object.entries(groups)) {
    const metrics = [
      { key: 'pe_ttm',      filter: v => v > 0 && v < 500  },
      { key: 'forward_pe',  filter: v => v > 0 && v < 500  },
      { key: 'price_book',  filter: v => v > 0 && v < 100  },
    ];

    // Intentar usar universo de referencia fijo
    const refStats = getRefStats(sector);
    let sectorStats;
    let usingRef = false;

    if (refStats) {
      // Universo de referencia disponible - Z-score reproducible
      sectorStats = refStats;
      usingRef = true;
    } else {
      // Fallback: calcular sobre sesion actual (requiere >=3 miembros)
      if (members.length < 3) continue;
      sectorStats = {};
      for (const { key, filter } of metrics) {
        const vals = members.map(t => t[key]).filter(v => v != null && filter(v));
        if (vals.length < 3) continue;
        const median = calcMedian(vals);
        const mad    = calcMAD(vals, median);
        sectorStats[key] = { mean: median, std: mad * 1.4826, n: vals.length };
      }
    }

    const tickerResults = members.map(t => {
      // Bypassear componente C para tickers sin fundamentales equity comparables
      // (futuros, ETFs, ADRs domesticos argentinos iliquidos)
      if (TICKERS_SIN_FUNDAMENTALES.has(t.symbol)) {
        return {
          symbol: t.symbol, zScores: [], avgZ: null,
          pe_ttm: t.pe_ttm, forward_pe: t.forward_pe, price_book: t.price_book,
          last_price: t.last_price, change_pct: t.change_pct,
          ref_source: 'bypass_sin_fundamentales'
        };
      }
      const zScores = [];
      for (const { key } of metrics) {
        const stat = sectorStats[key];
        if (!stat || t[key] == null) continue;
        if (stat.std === 0) continue;
        const z = (t[key] - stat.mean) / stat.std;
        zScores.push(Math.max(-4, Math.min(4, z)));
      }
      const avgZ = zScores.length > 0 ? zScores.reduce((a, b) => a + b, 0) / zScores.length : null;
      return {
        symbol: t.symbol,
        zScores,
        avgZ,
        pe_ttm:     t.pe_ttm,
        forward_pe: t.forward_pe,
        price_book: t.price_book,
        last_price: t.last_price,
        change_pct: t.change_pct,
        ref_source: usingRef ? 'universo_fijo' : 'sesion_actual'
      };
    }).filter(t => t.avgZ != null);
    results[sector] = { tickers: tickerResults, stats: sectorStats, usingRef };
  }
  return results;
};

const calcCreditStress = (tickers, market, snapshots) => {
  // -- Motor de Credito Institucional ---------------------------------------
  // Benchmark primario: OAS real de HY (FRED BAMLH0A0HYM2) si esta disponible.
  // Fallback: diferencial de retornos diarios HYG − TLT (duracion-neutral).
  //   HYG−TLT aisla el spread crediticio eliminando el movimiento de tasas puras.
  //   HYG−IEF como alternativa si TLT no esta disponible.
  //
  // Filtro de ruido: Z-score rodante de 20 dias sobre la serie del diferencial.
  // Umbrales:
  //   Z < −2.0  -> ALTO      (ampliacion severa de spreads, evento de 2sigma)
  //   −2.0 <= Z < −1.0 -> MODERADO
  //   Z >= −1.0  -> NORMAL
  //
  // DXY: completamente excluido. Solo se evalua en el contexto macro general.

  const hyg = tickers.find(t => t.symbol === "HYG");
  const tlt = tickers.find(t => t.symbol === "TLT");
  const ief = tickers.find(t => t.symbol === "IEF");

  // -- Diferencial intradiario actual (HYG − benchmark de tasas) ------------
  const refBond     = tlt ?? ief;  // preferir TLT (duracion larga), IEF como fallback
  const refSymbol   = tlt ? "TLT" : ief ? "IEF" : null;
  const currentDiff = (hyg?.change_pct != null && refBond?.change_pct != null)
    ? hyg.change_pct - refBond.change_pct
    : null;

  // -- Serie historica del diferencial (ultimos 20 snapshots) ---------------
  const dates = Object.keys(snapshots ?? {}).sort();
  const diffHistory = [];
  for (const d of dates.slice(-20)) {
    const snap = snapshots[d]?.tickers;
    if (!snap) continue;
    const h = snap.find(t => t.symbol === "HYG")?.change_pct;
    const r = snap.find(t => t.symbol === (refSymbol ?? "TLT"))?.change_pct;
    if (h != null && r != null) diffHistory.push(h - r);
  }

  // -- Z-score sobre la serie historica -------------------------------------
  let zScore = null;
  if (diffHistory.length >= 5 && currentDiff != null) {
    const mean = diffHistory.reduce((a, b) => a + b, 0) / diffHistory.length;
    const std  = Math.sqrt(diffHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / diffHistory.length);
    zScore = std > 0 ? (currentDiff - mean) / std : 0;
  }

  // -- Clasificacion por Z-score ---------------------------------------------
  let stressLevel = "NORMAL";
  let signal      = "spreads_estables";
  if (zScore != null) {
    if (zScore < -2.0)      { stressLevel = "ALTO";     signal = "spreads_ampliandose"; }
    else if (zScore < -1.0) { stressLevel = "MODERADO"; signal = "spreads_ampliandose"; }
  } else if (currentDiff != null) {
    // Sin historial suficiente: fallback conservador a umbral fijo suavizado
    if (currentDiff < -1.0)      { stressLevel = "ALTO";     signal = "spreads_ampliandose"; }
    else if (currentDiff < -0.3) { stressLevel = "MODERADO"; signal = "spreads_ampliandose"; }
  }

  const signals = [];
  if (signal === "spreads_ampliandose") {
    const zStr = zScore != null ? ` (Z=${zScore.toFixed(2)}sigma)` : "";
    signals.push(`HYG−${refSymbol ?? "TLT"}: ${currentDiff?.toFixed(2) ?? "-"}%${zStr} - spreads ampliandose`);
  } else if (currentDiff != null) {
    signals.push(`HYG−${refSymbol ?? "TLT"}: ${currentDiff.toFixed(2)}% - credito estable`);
  } else {
    signals.push("Sin datos de credito disponibles (HYG o benchmark de tasas no cargado)");
  }

  return {
    stressLevel,
    zScore,
    currentOAS_or_Differential: currentDiff,
    signal,
    signals,
    benchmark: refSymbol,
    historyN:  diffHistory.length,
    hyg:  hyg  ? { price: hyg.last_price,    change: hyg.change_pct }     : null,
    tlt:  tlt  ? { price: tlt.last_price,    change: tlt.change_pct }     : null,
    dxy:  null,  // DXY excluido de calcCreditStress - evaluado solo en contexto macro LLM
  };
};

const calcExponentialZScore = (values, period = 20) => {
  if (!values || values.length < 2) return null;
  const alpha = 2 / (period + 1);
  let ema = values[0];
  let emv = 0;
  for (let i = 1; i < values.length; i++) {
    const x = values[i];
    const delta = x - ema;
    ema = ema + alpha * delta;
    emv = (1 - alpha) * (emv + alpha * Math.pow(delta, 2));
  }
  const stdDev = Math.sqrt(emv);
  const current = values[values.length - 1];
  return stdDev === 0 ? 0 : (current - ema) / stdDev;
};



const evalHysteresis = (z, triggerFn, clearFn, prevActive) => {
  if (z == null) return prevActive ?? false;
  if (triggerFn(z)) return true;
  if (clearFn(z))   return false;
  return prevActive ?? false;
};

// -- Interpolacion continua por percentil (P15/P85 via aproximacion normal) --
// calcLevelWeight(value, mu, sigma) -> [0, 1]
// P15 ≈ μ − 1.04sigma  (piso estructural)
// P85 ≈ μ + 1.04sigma  (techo estructural)
// value <= P15 -> 0 (nivel normal, no vota estres)
// value >= P85 -> 1 (nivel estructuralmente elevado, vota estres maximo)
// valores intermedios -> rampa lineal continua
const calcLevelWeight = (value, mu, sigma) => {
  if (value == null || mu == null || sigma == null || sigma === 0) return null;
  const p15 = mu - 1.04 * sigma;
  const p85 = mu + 1.04 * sigma;
  if (value <= p15) return 0;
  if (value >= p85) return 1;
  return (value - p15) / (p85 - p15);
};

// -- calcPositionSize ---------------------------------------------------------
// Modulo de Position Sizing por Paridad de Riesgo + Volatility Targeting.
//
// PASO 1 - Volatilidad individual (sigma_i):
//   Desviacion estandar de los retornos diarios en los ultimos 20 snapshots.
//   Si hay menos de 3 sesiones disponibles, devuelve null (activo sin sizing).
//
// PASO 2 - Peso base por volatilidad inversa (Risk Parity):
//   w_i = (1/sigma_i) / Σ(1/sigma_j)  para todos los activos del grupo
//   Efecto: activos con sigma=40% reciben fraccion menor que activos con sigma=10%.
//
// PASO 3 - Multiplicador de exposicion macroeconomica (L_t):
//   L_t = max(0.2, 1 / (1 + max(0, Z_vix)))
//   Z_vix = 0   -> L_t = 1.0  (exposicion completa)
//   Z_vix = 1   -> L_t = 0.5  (reduccion a la mitad)
//   Z_vix = 4   -> L_t = 0.2  (piso minimo, cisne negro)
//
// PASO 4 - Peso final ajustado: w_final = w_i x L_t
//   Representa la fraccion del CAPITAL DESTINADO A NUEVAS COMPRAS (no del total).

const calcVolatilidad = (symbol, snapshots) => {
  const dates = Object.keys(snapshots).sort();
  const changes = dates
    .map(d => snapshots[d]?.tickers?.find(t => t.symbol === symbol)?.change_pct)
    .filter(v => v != null)
    .slice(-20);
  if (changes.length < 3) return null;
  const mean = changes.reduce((a,b) => a+b, 0) / changes.length;
  const variance = changes.reduce((a,b) => a + (b-mean)**2, 0) / changes.length;
  return Math.sqrt(variance); // en % (ej. 2.1 = 2.1% de std diaria)
};

const calcPositionSize = (symbols, snapshots, vixZ, capitalOperativo) => {
  // Calcular sigma para cada simbolo
  const sigmas = {};
  for (const sym of symbols) {
    const s = calcVolatilidad(sym, snapshots);
    if (s != null && s > 0) sigmas[sym] = s;
  }
  if (Object.keys(sigmas).length === 0) return {};

  // Pesos base: volatilidad inversa normalizada
  const invSigmas = Object.fromEntries(Object.entries(sigmas).map(([s, v]) => [s, 1 / v]));
  const totalInv  = Object.values(invSigmas).reduce((a,b) => a+b, 0);
  const weights   = Object.fromEntries(Object.entries(invSigmas).map(([s, v]) => [s, v / totalInv]));

  // Multiplicador macroeconomico L_t por Z-score del VIX
  const safeZ = vixZ != null ? vixZ : 0;
  const Lt    = Math.max(0.2, 1 / (1 + Math.max(0, safeZ)));

  // Capital operativo disponible: cuanto USD se destinara a nuevas compras
  const cap = capitalOperativo != null ? capitalOperativo : null;

  // -- Umbral de viabilidad minima ----------------------------------------
  // MIN_ORDER_USD = 15 USD - por debajo de este umbral, una orden es destruida
  // por spread y comisiones antes de generar retorno real.
  // CAPITAL TOTAL PERMITIDO por L_t:
  const MIN_ORDER_USD = 15;
  const capPermitido  = cap != null ? cap * Lt : null;

  // HOLD FORZADO: si ni siquiera el capital total x L_t supera el minimo
  if (capPermitido != null && capPermitido < MIN_ORDER_USD) {
    const result = {};
    for (const sym of symbols) {
      result[sym] = {
        sigma:       Number(sigmas[sym]?.toFixed(2) ?? null),
        wBase:       Number((weights[sym] * 100).toFixed(1)),
        lt:          Number(Lt.toFixed(2)),
        wFinal:      0,
        holdForzado: true,
        motivo:      "HOLD FORZADO POR FRICCION MACRO: capital permitido por L_t = USD " + capPermitido.toFixed(2) + " < minimo USD " + MIN_ORDER_USD,
      };
    }
    return result;
  }

  // Calcular ordenes individuales y detectar las que caen bajo el umbral
  const result = {};
  let haySubUmbral = false;
  let winnerSym    = null;
  let winnerScore  = -Infinity;

  for (const sym of symbols) {
    if (weights[sym] == null) { result[sym] = null; continue; }
    const wFinal = weights[sym] * Lt;
    const usdEstimado = cap != null ? wFinal * cap : null;
    if (usdEstimado != null && usdEstimado < MIN_ORDER_USD) haySubUmbral = true;
    result[sym] = {
      sigma:       Number(sigmas[sym]?.toFixed(2) ?? null),
      wBase:       Number((weights[sym] * 100).toFixed(1)),
      lt:          Number(Lt.toFixed(2)),
      wFinal:      Number((wFinal * 100).toFixed(1)),
      usdEstimado: usdEstimado != null ? Number(usdEstimado.toFixed(2)) : null,
      subUmbral:   usdEstimado != null && usdEstimado < MIN_ORDER_USD,
    };
  }

  // WINNER-TAKES-ALL: si alguna orden individual cae bajo el umbral,
  // consolidar TODO el capital permitido en el activo de mayor score.
  // Los simbolos deben pasarse ordenados por score descendente (el primero es el winner).
  if (haySubUmbral && symbols.length > 0) {
    const winner = symbols[0]; // caller debe pasar symbols ordenados por score
    for (const sym of symbols) {
      if (result[sym] == null) continue;
      if (sym === winner) {
        result[sym] = {
          ...result[sym],
          wFinal:       Number((Lt * 100).toFixed(1)), // 100% del capital permitido
          usdEstimado:  capPermitido,
          winnerTakesAll: true,
          motivo:       "Winner-Takes-All: paridad de riesgo produciria ordenes < USD " + MIN_ORDER_USD + ". Capital consolidado en activo #1 por score.",
        };
      } else {
        result[sym] = {
          ...result[sym],
          wFinal: 0,
          usdEstimado: 0,
          descartado: true,
          motivo: "Descartado por Winner-Takes-All: orden individual < USD " + MIN_ORDER_USD,
        };
      }
    }
  }

  return result;
};

// -- calcDecaySignal -----------------------------------------------------------
// Protocolo de invalidacion de tesis y decaimiento dinamico (EXIT/TRIM).
// Inputs:
//   score            - Total Score actual del activo (0-100)
//   buyThreshold     - umbral de entrada BUY (ej. 80)
//   currentPosUSD    - valor USD actual de la posicion en cartera (puede ser null)
//   minTrimUSD       - minimo nocional para emitir una orden de TRIM (ej. 15)
// Returns:
//   { action, dT, trimPct, trimUSD, suppressed, motivo }
//   action: 'SELL' | 'TRIM' | 'HOLD'
const calcDecaySignal = (score, buyThreshold, currentPosUSD, minTrimUSD) => {
  const MIN_TRIM = minTrimUSD ?? 15;

  // SELL inmediato: score perfora cero - tesis invalidada estadisticamente
  // No hay filtro anti-friccion que pueda retener esto.
  if (score < 0) {
    return {
      action: 'SELL',
      dT: 0,
      trimPct: 100,
      trimUSD: currentPosUSD ?? null,
      suppressed: false,
      motivo: 'LIQUIDACION: Score < 0. Tesis invalidada estadisticamente. Exposicion -> 0%.',
    };
  }

  // Zona de tolerancia [0, buyThreshold): decaimiento lineal
  // d_t = score / buyThreshold -> [0, 1)
  // trim% = (1 - d_t) x 100
  if (score < buyThreshold) {
    const dT      = score / buyThreshold;
    const trimPct = (1 - dT) * 100;

    // Calcular monto nocional del recorte
    const trimUSD = currentPosUSD != null ? (currentPosUSD * (trimPct / 100)) : null;

    // FILTRO ANTI-FRICCION: si el monto a liquidar < MIN_TRIM -> suprimir y forzar HOLD
    // Excepcion: SELL nunca es suprimido (ver bloque anterior)
    const suppressed = trimUSD != null && trimUSD < MIN_TRIM;
    if (suppressed) {
      return {
        action: 'HOLD',
        dT: Number(dT.toFixed(3)),
        trimPct: Number(trimPct.toFixed(1)),
        trimUSD,
        suppressed: true,
        motivo: 'TRIM SUPRIMIDO: recorte nocional USD ' + trimUSD.toFixed(2) + ' < umbral minimo USD ' + MIN_TRIM + '. Deterioro insuficiente para superar friccion operativa.',
      };
    }

    return {
      action: 'TRIM',
      dT: Number(dT.toFixed(3)),
      trimPct: Number(trimPct.toFixed(1)),
      trimUSD: trimUSD != null ? Number(trimUSD.toFixed(2)) : null,
      suppressed: false,
      motivo: 'TRIM: Score = ' + score + ' (d_t = ' + dT.toFixed(2) + '). Recortar ' + trimPct.toFixed(1) + '% de la posicion actual.',
    };
  }

  // Score >= buyThreshold: posicion en fuerza plena, sin accion
  return {
    action: 'HOLD',
    dT: 1.0,
    trimPct: 0,
    trimUSD: 0,
    suppressed: false,
    motivo: null,
  };
};

// Modo NORMAL para todas las tesis (respetando guillotinas).
// -- calcTailDependence --------------------------------------------------------
// Monitor de Riesgo de Cola: detecta activos con Dependencia de Cola Oculta.
//
// METODOLOGIA:
//   1. Filtra los dias del historial donde Z_VIX > +1.5sigma (dias de estres real).
//      Usa zsParams.mu_vix y zsParams.sigma_vix para el Z-score absoluto.
//   2. Calcula correlacion de Spearman de retornos NEGATIVOS en esos dias.
//      (Solo retornos negativos - captura el colapso asimetrico de crisis.)
//   3. Compara contra la correlacion normal (todos los dias).
//   4. Marca el par como "Dependencia de Cola Oculta" si:
//      - Correlacion normal <= 0.50  (parecian independientes)
//      - Correlacion de estres > 0.75 (colapsan juntos en crisis)
//      - deltarho_stress >= 0.25 (salto estadisticamente significativo)
//
// SALVAGUARDA: requiere minimo 10 dias de estres para activarse.
// Con menos observaciones, el error estandar del Spearman hace inutil la senal.
//
// Returns: { pairs: [{s1, s2, normalCorr, stressCorr, delta, stressN}],
//            tailSymbols: Set<symbol>, stressN: number, valid: boolean }

const calcTailDependence = (symbols, snapshots, zsParams, minStressDays = 10) => {
  if (!zsParams?.mu_vix || !zsParams?.sigma_vix || symbols.length < 2) {
    return { pairs: [], tailSymbols: new Set(), stressN: 0, valid: false };
  }

  const dates = Object.keys(snapshots).sort();
  if (dates.length < minStressDays + 5) {
    return { pairs: [], tailSymbols: new Set(), stressN: 0, valid: false };
  }

  // Clasificar cada dia como "estres" si Z_VIX > +1.5sigma
  const stressDates = dates.filter(d => {
    const vix = snapshots[d]?.cycleVars?.vix ?? snapshots[d]?.market?.vix?.price ?? null;
    if (vix == null) return false;
    const z = (vix - zsParams.mu_vix) / zsParams.sigma_vix;
    return z > 1.5;
  });

  if (stressDates.length < minStressDays) {
    return { pairs: [], tailSymbols: new Set(), stressN: stressDates.length, valid: false };
  }

  // Helper: extraer retornos de un simbolo en un set de fechas dado
  const getReturns = (sym, ds) =>
    ds.map(d => snapshots[d]?.tickers?.find(t => t.symbol === sym)?.change_pct ?? null);

  // Correlacion Spearman solo sobre retornos negativos (dependencia asimetrica de cola)
  const stressSpearman = (s1, s2) => {
    const r1all = getReturns(s1, stressDates);
    const r2all = getReturns(s2, stressDates);
    // Pairwise: solo dias donde AMBOS tienen retorno negativo
    const pairs = [];
    for (let i = 0; i < r1all.length; i++) {
      if (r1all[i] != null && r2all[i] != null && r1all[i] < 0 && r2all[i] < 0) {
        pairs.push([r1all[i], r2all[i]]);
      }
    }
    if (pairs.length < 3) return null;
    // Construir snapshots sinteticos para reutilizar calcCorrelation
    // -> mas eficiente: calcular Spearman directamente
    const n = pairs.length;
    const toRanks = arr => {
      const sorted = arr.map((v,i) => ({v,i})).sort((a,b) => a.v-b.v);
      const ranks  = new Array(n);
      let i = 0;
      while (i < n) {
        let j = i;
        while (j < n-1 && sorted[j+1].v === sorted[j].v) j++;
        const avgR = (i+j)/2+1;
        for (let k=i; k<=j; k++) ranks[sorted[k].i] = avgR;
        i = j+1;
      }
      return ranks;
    };
    const ra = toRanks(pairs.map(p => p[0]));
    const rb = toRanks(pairs.map(p => p[1]));
    const mra = ra.reduce((a,b)=>a+b,0)/n;
    const mrb = rb.reduce((a,b)=>a+b,0)/n;
    const num  = ra.reduce((s,v,i)=>s+(v-mra)*(rb[i]-mrb),0);
    const da   = Math.sqrt(ra.reduce((s,v)=>s+(v-mra)**2,0));
    const db   = Math.sqrt(rb.reduce((s,v)=>s+(v-mrb)**2,0));
    return da && db ? num/(da*db) : null;
  };

  const pairs       = [];
  const tailSymbols = new Set();
  const NORMAL_MAX  = 0.50;
  const STRESS_MIN  = 0.75;
  const DELTA_MIN   = 0.25;

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i+1; j < symbols.length; j++) {
      const s1 = symbols[i], s2 = symbols[j];
      const normalCorr = Number(calcCorrelation(s1, s2, snapshots) ?? 1); // si no hay datos, asumir alta corr
      if (Math.abs(normalCorr) > NORMAL_MAX) continue; // ya son correlacionados - no es oculto

      const stressCorr = stressSpearman(s1, s2);
      if (stressCorr == null) continue;

      const delta = stressCorr - normalCorr;
      if (stressCorr >= STRESS_MIN && delta >= DELTA_MIN) {
        pairs.push({
          s1, s2,
          normalCorr: Number(normalCorr.toFixed(2)),
          stressCorr: Number(stressCorr.toFixed(2)),
          delta:      Number(delta.toFixed(2)),
          stressN:    stressDates.length,
        });
        tailSymbols.add(s1);
        tailSymbols.add(s2);
      }
    }
  }

  return { pairs, tailSymbols, stressN: stressDates.length, valid: true };
};

const calcCycleStats = (snapshots, prevAlertState, zsParams, zMoveInvCsv = null) => {
  const dates = Object.keys(snapshots).sort();
  const getVars = (date) => snapshots[date]?.cycleVars ?? null;
  const history = dates.map(getVars).filter(Boolean);

  const last   = (key) => history.slice(-1)[0]?.[key] ?? null;
  const series = (key) => history.map(h=>h[key]).filter(v=>v!=null);

  const hasData = Boolean(zsParams?.mu_vix && zsParams?.sigma_vix && zsParams?.mu_move && zsParams?.sigma_move);
  let daysSince = 0;
  if (zsParams?.calibrado) {
    const isoStr = zsParams.calibrado.length === 10 ? zsParams.calibrado + "T12:00:00" : zsParams.calibrado;
    const parsedDate = new Date(isoStr);
    if (!isNaN(parsedDate)) {
      const computed = Math.floor((new Date() - parsedDate) / 86400000);
      daysSince = computed >= 0 ? computed : 0;
    }
  }

  const isObsolete        = hasData && daysSince > 30;
  const levelWeightActive = hasData && !isObsolete;
  const calibrationWarning = !levelWeightActive;

  // VIX: Z-Score dual (historico interno vs calibracion externa)
  const vixSeries  = series('vix');
  const vixCurrent = last('vix');
  const vixZseries = calcExponentialZScore(vixSeries, 60);
  const vixZparams = (vixCurrent != null && zsParams?.mu_vix != null && zsParams?.sigma_vix > 0)
    ? (vixCurrent - zsParams.mu_vix) / zsParams.sigma_vix
    : null;
  const vixZ = (vixZseries != null && vixZparams != null)
    ? (Math.abs(vixZseries) >= Math.abs(vixZparams) ? vixZseries : vixZparams)
    : (vixZseries ?? vixZparams);
  const vixLW = levelWeightActive ? calcLevelWeight(vixCurrent, zsParams.mu_vix, zsParams.sigma_vix) : null;

  // MOVE: Z-Score dual (historico interno vs calibracion externa)
  const moveSeries  = series('move_price');
  const moveCurrent = last('move_price') ?? null;
  const moveZseries = calcExponentialZScore(moveSeries, 60);
  const moveZparams = (moveCurrent != null && zsParams?.mu_move != null && zsParams?.sigma_move > 0)
    ? (moveCurrent - zsParams.mu_move) / zsParams.sigma_move
    : null;
  // Jerarquia MOVE Z-score - igual a la del SPX_ROC_63d:
  // 1. zMoveInvCsv del CSV (Python, 6 meses historia) - ya viene invertido
  // 2. moveZseries/moveZparams internos (activo con >=60 snapshots en cycleVars)
  // El CSV viene con signo invertido (positivo=calma) pero calcCyclePhaseIndicators
  // espera el Z crudo (positivo=estres). Re-invertimos para mantener consistencia interna.
  const _moveZinternal = (moveZseries != null && moveZparams != null)
    ? (Math.abs(moveZseries) >= Math.abs(moveZparams) ? moveZseries : moveZparams)
    : (moveZseries ?? moveZparams);
  const moveZ = (zMoveInvCsv != null)
    ? -zMoveInvCsv   // re-invertir: CSV tiene positivo=calma, interno usa positivo=estres
    : _moveZinternal;
  const moveActiveCalib = levelWeightActive && zsParams?.mu_move != null && zsParams?.sigma_move != null;
  const moveLW = (moveActiveCalib && moveCurrent != null) ? calcLevelWeight(moveCurrent, zsParams.mu_move, zsParams.sigma_move) : null;

  // Sensores Locales: Requieren 20 dias de historial. Si no lo hay, asumen null sin bloquear el motor.
  const hasLocalHist = history.length >= 20;

  const spreadSeries = history.map(h => (h.tnx!=null&&h.irx!=null) ? h.tnx-h.irx : null).filter(v=>v!=null);
  const spreadNow    = (last('tnx')!=null&&last('irx')!=null) ? last('tnx')-last('irx') : null;
  const spreadZ      = hasLocalHist ? calcExponentialZScore(spreadSeries, 20) : null;

  const cgSeries     = history.map(h => (h.hgf_price&&h.gcf_price) ? (h.hgf_price/h.gcf_price)*1000 : null).filter(v=>v!=null);
  const cgNow        = (last('hgf_price')&&last('gcf_price')) ? (last('hgf_price')/last('gcf_price'))*1000 : null;
  const cgZ          = hasLocalHist ? calcExponentialZScore(cgSeries, 20) : null;

  const iwmRelSeries = history.map(h => (h.iwm_chg!=null&&h.sp500_chg!=null) ? h.iwm_chg-h.sp500_chg : null).filter(v=>v!=null);
  const iwmRelNow    = (last('iwm_chg')!=null&&last('sp500_chg')!=null) ? last('iwm_chg')-last('sp500_chg') : null;
  const iwmRelZ      = hasLocalHist ? calcExponentialZScore(iwmRelSeries, 20) : null;

  const vixValues = series('vix');
  const alpha20   = 2 / 21;
  let vixEMA = vixValues[0] || 20;
  for (let i = 1; i < vixValues.length; i++) vixEMA = vixEMA + alpha20*(vixValues[i]-vixEMA);

  const prev        = prevAlertState || {};
  const alertVix    = evalHysteresis(vixZ, z => z >= 2.0, z => z <= 0.5, prev.alertVix);
  const alertSpread = evalHysteresis(spreadZ, z => z <= -1.8, z => z >= -0.4, prev.alertSpread);
  const alertCG     = evalHysteresis(cgZ, z => z <= -1.5, z => z >= 0.0, prev.alertCG);

  return {
    nSnapshots: history.length,
    calibrationWarning,
    levelWeightActive,
    vix:    { ema: vixEMA,   current: vixCurrent, z: vixZ,   levelWeight: vixLW },
    move:   { current: moveCurrent, z: moveZ, levelWeight: moveLW },
    spread: { current: spreadNow,                 z: spreadZ },
    cg:     { current: cgNow,                     z: cgZ },
    iwmRel: { current: iwmRelNow,                 z: iwmRelZ },
    alerts: { vix: alertVix, spread: alertSpread, cg: alertCG },
  };
};
const calcCyclePhaseIndicators = (tickers, snapshots, zsParams, spROC = null, fredCuad = null, spxQDiv = 0.08, spxRoc63d = null, zMoveInv = null) => {
  const dates = Object.keys(snapshots).sort();
  const current = tickers;
  const tnx  = current.find(t => t.symbol === '^TNX');
  const irx  = current.find(t => t.symbol === '^IRX');
  const hgf  = current.find(t => t.symbol === 'HG=F');
  const gcf  = current.find(t => t.symbol === 'GC=F');
  const vix  = current.find(t => t.symbol === '^VIX');
  const sp500 = current.find(t => t.symbol === '^GSPC') || current.find(t => t.symbol === 'SPY');
  const wti  = current.find(t => t.symbol === 'CL=F');
  const dxy  = current.find(t => t.symbol === 'DX-Y.NYB');

  const yieldSpread = (tnx?.last_price != null && irx?.last_price != null) ? tnx.last_price - irx.last_price : null;
  const copperGold  = (hgf?.last_price && gcf?.last_price) ? (hgf.last_price / gcf.last_price) * 1000 : null;

  const prevAlertState = dates.length > 1 ? snapshots[dates[dates.length - 2]]?.cycleVars?.alertState ?? null : null;
  const cycleStats = calcCycleStats(snapshots, prevAlertState, zsParams, zMoveInv);

  // -- Utilidades de escalado continuo --------------------------------------
  // Rampa lineal simetrica: mapea un Z en [-maxZ, +maxZ] a [0, 1]
  const linearScale  = (z, maxZ) => z == null ? null : Math.max(0, Math.min(1, (z + maxZ) / (2 * maxZ)));
  // Rampa cuadratica asimetrica para VIX:
  //   Z > 0 (estres): escala cuadratica - satura rapido hacia contraccion
  //   Z < 0 (calma):  escala lineal - satura lentamente hacia expansion
  const vixAsymScale = (z) => {
    if (z == null) return null;
    if (z >= 0) return Math.min(1, (z * z) / 9);        // cuadratico: Z=3 satura en 1.0
    return Math.max(0, 1 - Math.abs(z) / 3);            // lineal: Z=-3 llega a 0.0
  };

  // -- Coeficiente de confianza por tamano de muestra ------------------------
  const N = dates.length;
  const confidenceCoef = Math.min(1.0, Math.max(0.25, (N - 5) / 15));

  // -- Scores de cada fase: acumuladores en [0, 100] ------------------------
  // Cada Tier distribuye sus puntos MAX entre las 4 fases.
  const scores = { expansion: 0, desaceleracion: 0, contraccion: 0, recuperacion: 0 };
  const signals = [];

  // ════════════════════════════════════════════════════════════════════════
  // TIER 1 - CREDITO (60 puntos maximos)
  // Fuentes: Spread 2s10s + MOVE (Z-score + LevelWeight)
  // ════════════════════════════════════════════════════════════════════════
  const T1_MAX = 60;

  if (cycleStats) {
    const { spread: spreadS, move: moveS } = cycleStats;

    // - Spread 2s10s (30 puntos del T1) -
    // Escalado continuo sobre el Z-score del spread.
    // Spread positivo y creciente -> Expansion; plano -> Desaceleracion; invertido -> Contraccion.
    if (spreadS.z != null) {
      const sz = spreadS.z;
      // Contraccion: spread muy negativo (Z muy bajo) - escala cuadratica hacia contraccion
      if (sz < 0) {
        const cScore = Math.min(1, (sz * sz) / 4) * 30; // Z=-2 satura los 30 pts
        scores.contraccion    += Math.round(cScore * confidenceCoef);
        scores.desaceleracion += Math.round((1 - cScore / 30) * 15 * confidenceCoef);
        if (Math.abs(sz) >= 1.5) {
          if (spreadS.current != null && spreadS.current < 0 && sz > 0.5)
            signals.push('BULL STEEPENING: Curva des-invirtiendose desde negativo - senal de recesion activa (Z=' + sz.toFixed(2) + ')');
          else
            signals.push('Curva en zona de inversion estadistica (Z=' + sz.toFixed(2) + ')');
        }
      } else {
        // Expansion: spread positivo y elevado
        const eScore = Math.min(1, sz / 2) * 30;
        scores.expansion += Math.round(eScore * confidenceCoef);
        if (sz >= 1.0) signals.push('Curva empinada - regimen de expansion (Z=' + sz.toFixed(2) + ')');
      }
    } else if (yieldSpread != null && !isNaN(yieldSpread)) {
      // Fallback continuo spread - linearizado
      const _sNorm1 = Math.min(Math.max((yieldSpread + 0.55) / 1.45, 0), 1);
      if (isNaN(_sNorm1)) {
        console.error("[cycleIndicators] Inputs Macro Vacios: yieldSpread NaN en fallback 1", { yieldSpread });
      } else {
        scores.expansion   += Math.round(_sNorm1 * 35 * confidenceCoef);
        scores.contraccion += Math.round((1 - _sNorm1) * 22 * confidenceCoef);
        if (yieldSpread < 0) signals.push("Curva de tasas invertida");
      }
    }

    // - MOVE (30 puntos del T1) - doble motor Z + LevelWeight
    const mZ  = moveS?.z;
    const mLW = moveS?.levelWeight;
    if (mZ != null || mLW != null) {
      // Z-score: contraccion si estres de liquidez en bonos
      const mZvote  = mZ  != null ? Math.min(1, Math.max(0, mZ  / 3)) : 0;   // lineal: Z=3 -> 1.0
      const mLWvote = mLW != null ? Math.min(1, Math.max(0, mLW))      : 0;
      const mScore  = Math.max(mZvote, mLWvote) * 30;
      // Alto MOVE -> contraccion/desaceleracion; bajo MOVE -> expansion
      if (mScore >= 15) {
        scores.contraccion    += Math.round(mScore * confidenceCoef);
        if (mScore >= 20) signals.push('MOVE ' + (mZ != null ? 'Z=' + mZ.toFixed(2) : 'LW=' + mLW.toFixed(2)) + ' - estres de liquidez en bonos severo');
        else signals.push('MOVE elevado - estres de liquidez en bonos moderado');
      } else if (mScore < 8) {
        scores.expansion += Math.round((1 - mLWvote) * 10 * confidenceCoef);
      }
    }
  } else if (yieldSpread != null && !isNaN(yieldSpread)) {
    // Fallback continuo spread (sin cycleStats)
    const _sNorm2 = Math.min(Math.max((yieldSpread + 0.55) / 1.45, 0), 1);
    if (isNaN(_sNorm2)) {
      console.error("[cycleIndicators] Inputs Macro Vacios: yieldSpread NaN en fallback 2", { yieldSpread });
    } else {
      scores.expansion   += Math.round(_sNorm2 * 35 * confidenceCoef);
      scores.contraccion += Math.round((1 - _sNorm2) * 22 * confidenceCoef);
      if (yieldSpread < 0) signals.push("Curva de tasas invertida");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIER 2 - RIESGO / VIX (20 puntos maximos, asimetria cuadratica)
  // Z > 0: escalado cuadratico -> satura rapido en Contraccion
  // Z < 0: escalado lineal    -> satura lentamente en Expansion
  // ════════════════════════════════════════════════════════════════════════
  const T2_MAX = 20;

  if (cycleStats) {
    const { vix: vixS } = cycleStats;
    const vZ = vixS.z;
    if (vZ != null) {
      const asymScore = vixAsymScale(vZ);
      if (vZ > 0) {
        // Estres: cuadratico -> contraccion/desaceleracion
        const stressPoints = Math.round(asymScore * T2_MAX * confidenceCoef);
        scores.contraccion    += Math.round(stressPoints * 0.7);
        scores.desaceleracion += Math.round(stressPoints * 0.3);
        if (asymScore >= 0.4) signals.push('VIX Z=' + vZ.toFixed(2) + ' - estres cuadratico (' + Math.round(asymScore * 100) + '% saturacion T2)');
      } else {
        // Calma: lineal -> expansion
        const calmPoints = Math.round((1 - asymScore) * T2_MAX * 0.5 * confidenceCoef); // max 10 pts por calma
        scores.expansion += calmPoints;
        if (vZ <= -1.0) signals.push('VIX Z=' + vZ.toFixed(2) + ' - volatilidad comprimida, viento de cola expansivo');
      }
    } else if (vix?.last_price != null && !isNaN(vix.last_price)) {
      // Fallback continuo VIX - linearizado
      const _vNorm = Math.min(Math.max((31 - vix.last_price) / 18, 0), 1);
      if (isNaN(_vNorm)) {
        console.error("[cycleIndicators] Inputs Macro Vacios: VIX NaN en fallback", { vix: vix.last_price });
      } else {
        scores.expansion   += Math.round(_vNorm * 28 * confidenceCoef);
        scores.contraccion += Math.round((1 - _vNorm) * 20 * confidenceCoef);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIER 3 - ECONOMIA REAL (15 puntos maximos)
  // Fuentes: Cu/Au Z-score + IWM relativo Z-score
  // ════════════════════════════════════════════════════════════════════════
  const T3_MAX = 15;

  if (cycleStats) {
    const { cg: cgS, iwmRel: iwmRelS } = cycleStats;

    // Cu/Au Z (7.5 pts del T3)
    if (cgS.z != null) {
      const cgz = cgS.z;
      if (cgz >= 0) {
        const eScore = Math.min(1, cgz / 2) * 7.5;
        scores.expansion += Math.round(eScore * confidenceCoef);
        if (cgz >= 1.0) signals.push('Cu/Au Z=' + cgz.toFixed(2) + ' - demanda industrial real (expansion)');
      } else {
        const dScore = Math.min(1, Math.abs(cgz) / 2) * 7.5;
        scores.desaceleracion += Math.round(dScore * confidenceCoef);
        if (cgz <= -1.5) signals.push('Cu/Au Z=' + cgz.toFixed(2) + ' - deterioro industrial (flight to safety)');
      }
    }

    // IWM relativo Z (7.5 pts del T3)
    if (iwmRelS.z != null) {
      const iz = iwmRelS.z;
      if (iz >= 0) {
        const rScore = Math.min(1, iz / 2) * 7.5;
        scores.recuperacion += Math.round(rScore * confidenceCoef);
        if (iz >= 1.0) signals.push('Small Caps liderando Z=' + iz.toFixed(2) + ' - amplitud de mercado en expansion');
      } else {
        const cScore = Math.min(1, Math.abs(iz) / 2) * 7.5;
        scores.contraccion += Math.round(cScore * confidenceCoef);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // TIER 4 - SHOCKS DIARIOS (5 puntos maximos, cap estricto)
  // WTI y TNX: shocks alcistas inyectan puntos EXCLUSIVAMENTE a
  // Desaceleracion y Contraccion. Sin arrastre historico.
  // ════════════════════════════════════════════════════════════════════════
  const T4_MAX = 5;
  let t4Used = 0;

  // WTI shock: +4.5% o mas es un shock inflacionario
  if (wti?.change_pct != null && wti.change_pct >= 2.0 && t4Used < T4_MAX) {
    const wtiScore = Math.min(T4_MAX - t4Used, Math.round((wti.change_pct - 2.0) / 3.0 * 3));
    if (wtiScore > 0) {
      scores.desaceleracion += wtiScore;
      t4Used += wtiScore;
      if (wti.change_pct >= 4.5) signals.push('SHOCK WTI +' + wti.change_pct.toFixed(1) + '% - presion inflacionaria');
    }
  }

  // TNX shock: +1.5% diario es presion sobre renta variable
  if (tnx?.change_pct != null && tnx.change_pct > 1.5 && sp500?.change_pct != null && sp500.change_pct < -0.8 && t4Used < T4_MAX) {
    const tnxScore = Math.min(T4_MAX - t4Used, Math.round((tnx.change_pct - 1.5) * 2));
    if (tnxScore > 0) {
      scores.desaceleracion += tnxScore;
      t4Used += tnxScore;
      signals.push('PRESION POR TASAS: TNX +' + tnx.change_pct.toFixed(1) + '% con S&P ' + sp500.change_pct.toFixed(1) + '%');
    }
  }

  // Shock critico simultaneo: WTI + VIX + S&P (cap al T4 restante)
  if (wti?.change_pct >= 4.5 && sp500?.change_pct <= -1.5 && vix?.change_pct >= 15 && vix?.last_price >= 25 && t4Used < T4_MAX) {
    const remainingT4 = T4_MAX - t4Used;
    scores.contraccion += remainingT4;
    t4Used = T4_MAX;
    signals.push('SHOCK CRITICO: WTI +' + wti.change_pct.toFixed(1) + '% + VIX +' + vix.change_pct.toFixed(1) + '% + S&P ' + sp500.change_pct.toFixed(1) + '%');
  }

  // -- Normalizacion con inyeccion suave de z_roc252 y fred_z -----------------
  // Validado por Grok: w_momentum=0.25 y w_stall=0.20 absorben el whipsaw
  // en fase de desaceleracion sin destruir los pesos empiricos de los Tiers.
  //
  // Keys internas del sistema: minusculas sin tildes
  // (expansion, desaceleracion, contraccion, recuperacion)
  //
  // z_roc252: spROC / DEADBAND (misma normalizacion que calcMacroDivergenceMultiplier)
  // fred_z: mapeo categorico del FRED -> +1.0 crecimiento/valor | -1.0 defensivo
  // z_roc252: usa SPX_ROC_63d del CSV si disponible, fallback a spROC de rocHistory
  const _cEffectiveROC = (typeof spxRoc63d === "number") ? spxRoc63d : (typeof spROC === "number" ? spROC : null);
  const _divPct  = ((typeof spxQDiv === "number" && spxQDiv > 0) ? spxQDiv : 0.08) * 100;
  const _zRoc252 = (_cEffectiveROC != null) ? (_cEffectiveROC / _divPct) : 0;
  const _fredCuad = (typeof fredCuad === "string") ? fredCuad.toLowerCase() : "";
  const _fredZ = (_fredCuad.includes("crecimiento") || _fredCuad.includes("valor")) ? 1.0
               : (_fredCuad.includes("defensivo") || _fredCuad.includes("estanflacion")) ? -1.0 : 0.0;

  const _sigmoid = 1 / (1 + Math.exp(-3.0 * _fredZ));
  const _gaussStall = Math.exp(-Math.pow(_zRoc252, 2));
  const _momentumDir = _zRoc252 * (2 * _sigmoid - 1);
  const W_MOM = 0.25;
  const W_STALL = 0.20;

  const injected = { ...scores };
  injected.expansion      += Math.max(_momentumDir, 0)  * W_MOM;
  injected.contraccion    += Math.max(-_momentumDir, 0) * W_MOM;
  injected.desaceleracion += _gaussStall * (1 - _sigmoid) * W_STALL;
  injected.recuperacion   += _gaussStall * _sigmoid * W_STALL * 1.2;

  const totalWeight = Object.values(injected).reduce((a, b) => a + Math.max(0, b), 0);
  const probabilities = {};
  if (totalWeight === 0) {
    Object.keys(scores).forEach(k => { probabilities[k] = 25; });
  } else {
    Object.keys(injected).forEach(k => {
      probabilities[k] = Math.round(Math.max(0, injected[k]) / totalWeight * 100);
    });
  }
  const sorted     = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const phase      = totalWeight > 0 ? sorted[0][0] : null;
  const dominance  = sorted[0][1];
  const confidence = dominance > (totalWeight * 0.5) ? 'alta' : dominance > (totalWeight * 0.25) ? 'moderada' : 'baja (conflicto de senales)';

  const recs = {
    expansion:     'REGIMEN ESTRUCTURAL: Expansion. La macro de fondo apoya la toma de riesgo (credito sano). Historicamente, este entorno beneficia a Tecnologia, Consumo y Finanzas. Las caidas bruscas de estos sectores en este regimen suelen ser tomas de ganancia u oportunidades de compra, no recesion.',
    desaceleracion:'REGIMEN ESTRUCTURAL: Desaceleracion. La economia frena. Historicamente el capital rota a Energia, Materiales y Valor. Las subidas fuertes de tecnologia en esta fase suelen ser rebotes trampa. Reducir exposicion a multiples caros.',
    contraccion:   'REGIMEN ESTRUCTURAL: Contraccion/Panico. Riesgo sistemico elevado. La preservacion de capital manda. Buscar refugio en Bonos del Tesoro (TLT), Dolar (DXY) y liquidez. Evitar comprar renta variable hasta que el credito se estabilice.',
    recuperacion:  'REGIMEN ESTRUCTURAL: Recuperacion. Lo peor ya paso en la economia real. Acumular activos castigados tempranamente: Small Caps (IWM), Financieras y sectores sensibles a la inminente baja de tasas.'
  };

  // calibrationWarning calculado directamente desde zsParams (independiente de cycleStats)
  const _cwHasData = Boolean(zsParams?.mu_vix && zsParams?.sigma_vix && zsParams?.mu_move && zsParams?.sigma_move);
  let _cwDaysSince = 0;
  if (_cwHasData && zsParams?.calibrado) {
    const _isoStr    = zsParams.calibrado.length === 10 ? zsParams.calibrado + 'T12:00:00' : zsParams.calibrado;
    const _parsed    = new Date(_isoStr);
    if (!isNaN(_parsed)) { const _d = Math.floor((new Date() - _parsed) / 86400000); _cwDaysSince = _d >= 0 ? _d : 0; }
  }
  const calibrationWarning = !(_cwHasData && _cwDaysSince <= 30);

  const macroSensors = cycleStats ? {
    vix:     { value: cycleStats.vix.current,    z_score: cycleStats.vix.z,    level_weight: cycleStats.vix.levelWeight,  signal: cycleStats.vix.z != null ? (cycleStats.vix.z > 0 ? 'ESTRES Z2=' + (cycleStats.vix.z * cycleStats.vix.z).toFixed(2) : 'CALMA Z=' + cycleStats.vix.z.toFixed(2)) : null },
    move:    { value: cycleStats.move.current,   z_score: cycleStats.move.z,    level_weight: cycleStats.move.levelWeight, signal: cycleStats.move.levelWeight != null ? (cycleStats.move.levelWeight >= 0.85 ? 'ESTRES SEVERO' : cycleStats.move.levelWeight >= 0.5 ? 'ESTRES MODERADO' : 'NORMAL') : null },
    curva:   { value: cycleStats.spread.current, z_score: cycleStats.spread.z,  signal: cycleStats.spread.z != null ? (Math.abs(cycleStats.spread.z) < 0.5 ? 'RUIDO' : cycleStats.spread.z <= -1.0 ? 'CAMBIO ESTRUCTURAL' : 'SEÑAL DEBIL') : null },
    cu_au:   { value: cycleStats.cg.current,     z_score: cycleStats.cg.z,      signal: cycleStats.cg.z != null ? (Math.abs(cycleStats.cg.z) < 0.5 ? 'RUIDO' : Math.abs(cycleStats.cg.z) >= 1.0 ? 'CAMBIO ESTRUCTURAL' : 'SEÑAL DEBIL') : null },
    iwm_rel: { value: cycleStats.iwmRel.current, z_score: cycleStats.iwmRel.z,  signal: cycleStats.iwmRel.z != null ? (Math.abs(cycleStats.iwmRel.z) < 0.5 ? 'RUIDO' : Math.abs(cycleStats.iwmRel.z) >= 1.0 ? 'CAMBIO ESTRUCTURAL' : 'SEÑAL DEBIL') : null },
    n_snapshots:         cycleStats.nSnapshots,
    confidence_coef:     Number(confidenceCoef.toFixed(2)),
    calibration_warning: calibrationWarning,
    level_weight_active: cycleStats.levelWeightActive,
    tier_weights:        { t1_credito: T1_MAX, t2_riesgo: T2_MAX, t3_economia: T3_MAX, t4_shocks: T4_MAX, t4_used: t4Used },
  } : null;

  return { phase, probabilities, signals, confidence, recommendation: phase ? recs[phase] : null, yieldSpread, copperGold, hasData: yieldSpread !== null || copperGold !== null, missingTickers: [...(!tnx ? ['^TNX'] : []), ...(!irx ? ['^IRX'] : []), ...(!hgf ? ['HG=F'] : []), ...(!gcf ? ['GC=F'] : [])], macroSensors, calibrationWarning };
};
const calcRefinancingRisk = (ticker) => {
  if (!ticker) return null;
  const fcfYield = ticker._fcf_yield;
  const debtEq = ticker._debt_eq;
  const currentRatio = ticker._curr_ratio;
  if (fcfYield == null && debtEq == null) return null;
  let riskScore = 0;
  if (debtEq != null) { if (debtEq > 3) riskScore += 3; else if (debtEq > 1.5) riskScore += 2; else if (debtEq > 0.5) riskScore += 1; }
  if (fcfYield != null) { if (fcfYield < 0) riskScore += 3; else if (fcfYield < 2) riskScore += 2; else if (fcfYield < 4) riskScore += 1; else riskScore -= 1; }
  if (currentRatio != null) { if (currentRatio < 1) riskScore += 2; else if (currentRatio < 1.5) riskScore += 1; }
  riskScore = Math.max(0, Math.min(9, riskScore));
  const label = riskScore >= 6 ? "ALTO" : riskScore >= 3 ? "MOD" : "BAJO";
  const color = riskScore >= 6 ? "#ff3b5c" : riskScore >= 3 ? "#f59e0b" : "#00d964";
  return { score: riskScore, label, color };
};

const THESIS_CONFIG = {
  // Pesos calibrados empiricamente via walk-forward backtest out-of-sample (Opus 4.7, 2026-04-18)
  // Metodologia: SimFin PiT, IC Spearman 21d, ablation study, OOS 2023-2026
  // Hallazgo validado: Piotroski (calidad) > Valuacion > Momentum individual
  // Config D ganadora: 40/10/10/40 (mom/PE/PB/pio) -> IC OOS +0.0167 t=2.86 n=607
  "stagflacion": {
    label: "Estanflacion / Reflacion",
    desc: "Commodities, energia y metales. Castigo severo a empresas endeudadas con tasas altas.",
    weights: {
      val_score: 1.0,    // A: sin cambio - valuacion ya era baja en stagflacion
      piotroski: 2.5,    // B: 1.5->2.5 - alineado con hallazgo empirico (calidad > valuacion)
      sector_z:  1.0,    // C: sin cambio
      cycle:     1.5,    // D: 2.0->1.5 - cedido a B sin tocar refi
      refi_risk: 3.0,    // E: sin cambio - tasas altas = deuda letal
      sector_bonus: { "Energia": 3, "Metales/Mineria": 3, "Defensa/Aeroespacial": 2, "Industriales/Materiales": 1, "Consumo Basico": 0, "Finanzas": 0, "Consumo Discrec": -3, "Tech/MegaCap": -1, "Semiconductores": -2, "Software/High-Beta": -2, "Emergentes/ADR": -1 }
    }
  },
  "defensivo": {
    label: "Defensivo / Crisis",
    desc: "Preservacion de capital. Foco extremo en balances sanos y precio razonable vs pares.",
    weights: {
      val_score: 1.5,
      piotroski: 3.0,  // B=27% - calidad es el rey en panico. Mejor IC historico, no se toca.
      // NOTA: refi_risk (32%) y piotroski (27%) se solapan parcialmente como proxies de
      // calidad de balance, pero miden cosas distintas: Piotroski = calidad contable 9D,
      // refi_risk = riesgo de refinanciacion especifico. Equivalencia asumida, no probada. (Opus 4.7)
      sector_z:  1.0,
      cycle:     0.5,  // momentum de ayer no importa en colapso
      refi_risk: 3.5,  // deuda alta = muerte
      sector_bonus: { "Salud": 2, "Consumo Basico": 3, "Telecom": 3, "Defensa/Aeroespacial": 2, "ETFs/Indices": 1, "Tech/MegaCap": -1, "Crypto": -3, "Consumo Discrec": -3, "Industriales/Materiales": -3, "Semiconductores": -3, "Software/High-Beta": -3, "Emergentes/ADR": -3 }
    }
  },
  "crecimiento": {
    label: "Crecimiento / Riesgo",
    desc: "Momentum puro y flujo institucional. Ignora valuaciones tradicionales.",
    weights: {
      val_score: 0.5,  // A: P/E alto no penaliza aca
      piotroski: 2.0,  // B: 1.0->2.0 - calidad duplicada vs original, backtest confirma senal
      sector_z:  1.5,  // C: sin cambio
      cycle:     3.5,  // D: fuerza relativa manda - sin cambio
      refi_risk: 1.0,  // E: sin cambio
      sector_bonus: { "Semiconductores": 3, "Software/High-Beta": 3, "Tech/MegaCap": 2, "Consumo Discrec": 2, "Finanzas": 1, "Emergentes/ADR": 1, "Consumo Basico": -2, "Telecom": -2, "Metales/Mineria": 0, "Energia": 0 }
    }
  },
  "valor": {
    label: "Valor Profundo",
    desc: "Activos castigados pero viables. Precio barato vs historia y vs pares.",
    weights: {
      val_score: 2.5,  // A: 4.0->2.5 - valuacion sigue importante pero calidad la supera (backtest)
      piotroski: 3.5,  // B: 2.5->3.5 - calidad sobre valuacion pura, alineado con IC OOS +0.0167
      sector_z:  2.0,  // C: 2.5->2.0 - ajuste proporcional para mantener sum coherente
      cycle:     0.5,  // D: sin cambio - asumimos que viene cayendo, no pedimos momentum
      refi_risk: 1.5,  // E: sin cambio
      sector_bonus: { "Finanzas": 1, "Defensa/Aeroespacial": 1, "Industriales/Materiales": 1, "Energia": 1, "Tech/MegaCap": 0, "Semiconductores": 0, "Software/High-Beta": -2, "Crypto": -2 }
    }
  }
};

// -- SECTOR_CYCLE_MAP ---------------------------------------------------------
// Afinidad de cada sector a las 4 fases del ciclo macroeconomico.
// Escala: +1.0 = maximo beneficio estructural | -1.0 = maximo dano estructural
// Usado en el Componente F dinamico de calcRadarScore para calcular Cm
// usando las probabilidades reales de cycleIndicators.probabilities.
const SECTOR_CYCLE_MAP = {
  "Tech/MegaCap":           { expansion: +0.8, desaceleracion: -0.3, contraccion: -0.7, recuperacion: +0.5 },
  "Semiconductores":        { expansion: +0.9, desaceleracion: -0.4, contraccion: -0.8, recuperacion: +0.6 },
  "Software/High-Beta":     { expansion: +0.9, desaceleracion: -0.5, contraccion: -0.9, recuperacion: +0.4 },
  "Telecom":                { expansion: +0.2, desaceleracion: +0.2, contraccion: +0.6, recuperacion: +0.2 },
  "Energia":                { expansion: +0.3, desaceleracion: +0.9, contraccion: -0.2, recuperacion: +0.1 },
  "Metales/Mineria":        { expansion: +0.4, desaceleracion: +0.8, contraccion: -0.3, recuperacion: +0.3 },
  "Finanzas":               { expansion: +0.7, desaceleracion: -0.2, contraccion: -0.6, recuperacion: +0.8 },
  "Consumo Basico":         { expansion: +0.1, desaceleracion: +0.3, contraccion: +0.8, recuperacion: +0.1 },
  "Consumo Discrec":        { expansion: +0.8, desaceleracion: -0.4, contraccion: -0.8, recuperacion: +0.7 },
  "Salud":                  { expansion: +0.2, desaceleracion: +0.4, contraccion: +0.7, recuperacion: +0.2 },
  "Defensa/Aeroespacial":   { expansion: +0.3, desaceleracion: +0.5, contraccion: +0.4, recuperacion: +0.2 },
  "Industriales/Materiales":{ expansion: +0.6, desaceleracion: +0.3, contraccion: -0.5, recuperacion: +0.7 },
  "ETFs/Indices":           { expansion: +0.5, desaceleracion:  0.0, contraccion: -0.3, recuperacion: +0.4 },
  "Macro/Divisas":          { expansion: -0.2, desaceleracion: +0.2, contraccion: +0.7, recuperacion: -0.1 },
  "Emergentes/ADR":         { expansion: +0.6, desaceleracion: -0.1, contraccion: -0.8, recuperacion: +0.5 },
  "Crypto":                 { expansion: +0.9, desaceleracion: -0.6, contraccion: -1.0, recuperacion: +0.7 },
  "Otros":                  { expansion:  0.0, desaceleracion:  0.0, contraccion:  0.0, recuperacion:  0.0 },
};

// calcMacroAlignScore: Componente F dinamico
// Recibe las probabilidades reales del ciclo y el sector del activo.
// Devuelve un score 0-100 donde 50 = neutral, >50 = viento de cola, <50 = viento de frente.
// Cm = Σ (prob[fase] * afinidad[fase]) -> rango teorico [-1, +1] -> mapeado a [0, 100]
const calcMacroAlignScore = (sector, cycleProbabilities) => {
  if (!cycleProbabilities) return null; // sin probabilidades -> fallback al caller
  const affinities = SECTOR_CYCLE_MAP[sector];
  if (!affinities) return 50; // sector desconocido -> neutral
  const totalProb = Object.values(cycleProbabilities).reduce((a,b) => a+b, 0);
  if (totalProb === 0) return 50;
  let cm = 0;
  for (const [phase, prob] of Object.entries(cycleProbabilities)) {
    const pct = prob / totalProb; // normalizar a 0-1
    const affinity = affinities[phase] ?? 0;
    cm += pct * affinity;
  }
  // cm en [-1, +1] -> score en [0, 100]
  return Math.max(0, Math.min(100, 50 + cm * 50));
};

// -- DEADBAND global - umbral operativo del sistema ROC 252d ------------------
// Compartido por detectMarketContext y calcMacroDivergenceMultiplier.
// ROC entre -0.75% y +0.75% = zona de ruido -> no confirma cuadrante.
const DEADBAND = 0.75;   // %

// -- Tickers sin fundamentales equity comparables ------------------------------
// Bypassean componente C del Radar (Z-score sectorial).
// Siguen operables por momentum/RS/cycle - solo se omite comparacion de valuacion.
const TICKERS_SIN_FUNDAMENTALES = new Set([
  "CL=F","ZC=F","ZS=F",             // futuros
  "GLD","SLV","COPX","URA","ITA","SMH","EEM",   // ETFs dentro de sectores equity
  "COME.BA","HAVA.BA","MORI.BA","BHIP.BA","SATL","JMIA","TEM","NG","OKLO","AXIA","LAR","NBIS","MP","SNDK","RKLB","ONDS", // sin fundamentales comparables
]);



const detectMarketContext = (market, tickers, creditStress, snapshots, rocHistory) => {
  // -- Motor ROC 252d - Cuatro Cuadrantes de Dalio -------------------------
  // REQUERIMIENTO: >= 252 sesiones en rocHistory.spy y rocHistory.dbc.
  // Si no hay suficiente historia, retorna en Estado de Cuarentena.
  //
  // Deadband +/-0.75%: ROC entre -0.75% y +0.75% = RUIDO -> mantener regimen anterior.
  // Persistencia 15 dias: el regimen solo se confirma tras 15 sesiones consecutivas
  //   en el mismo cuadrante dentro del historial de snapshots (anti-whipsaw).
  //
  // Los 4 cuadrantes:
  //   CRECIMIENTO:          S&P ROC > +0.75% && Commodities ROC < -0.75%
  //   BOOM INFLACIONARIO:   S&P ROC > +0.75% && Commodities ROC > +0.75%
  //   RECESION DEFLACIONARIA: S&P ROC < -0.75% && Commodities ROC < -0.75%
  //   ESTANFLACION:         S&P ROC < -0.75% && Commodities ROC > +0.75%

  // DEADBAND = 0.75% - definida globalmente (scope compartido con calcMacroDivergenceMultiplier)
  const PERSIST_DAYS = 15;     // sesiones consecutivas para confirmar cambio de regimen

  // Mapeo cuadrante -> tesis del sistema (THESIS_CONFIG keys)
  const QUADRANT_TO_THESIS = {
    crecimiento:    "crecimiento",
    boom:           "stagflacion",   // Boom inflacionario -> tesis commodities/stagflacion
    recesion:       "defensivo",     // Recesion deflacionaria -> defensivo
    estanflacion:   "stagflacion",
  };

  const spyData  = rocHistory?.spy  ?? [];
  const dbcData  = rocHistory?.dbc  ?? [];
  const hasSpy   = spyData.length  >= 252;
  const hasDbc   = dbcData.length  >= 252;
  const isReady  = hasSpy && hasDbc;

  // Estado de Cuarentena: datos insuficientes
  if (!isReady) {
    const daysNeeded = Math.max(0, 252 - Math.min(spyData.length, dbcData.length));
    return {
      recommended:    null,
      quarantine:     true,
      daysNeeded,
      spyDays:        spyData.length,
      dbcDays:        dbcData.length,
      scores:         { stagflacion: 0, defensivo: 0, crecimiento: 0, valor: 0 },
      regimeSignals:  [`INSUFFICIENT DATA: Faltan ~${daysNeeded} dias para calibracion macroeconomica ROC 252d`],
      dailySignals:   [],
      signals:        [`INSUFFICIENT DATA: Faltan ~${daysNeeded} dias para calibracion macroeconomica ROC 252d`],
      days:           Object.keys(snapshots).length,
    };
  }

  // -- Calcular ROC 252d para cada fecha disponible -------------------------
  const calcROC252 = (series) => {
    // series: [{date, close}] ordenado ASC
    // Para cada indice i >= 252, ROC = (close[i] - close[i-252]) / close[i-252] * 100
    if (series.length < 253) return null;
    const last  = series[series.length - 1].close;
    const base  = series[series.length - 253].close;
    return base > 0 ? (last - base) / base * 100 : null;
  };

  const classifyQuadrant = (spROC, commROC) => {
    if (spROC === null || commROC === null) return null;
    const spUp   = spROC   >  DEADBAND;
    const spDown = spROC   < -DEADBAND;
    const cUp    = commROC >  DEADBAND;
    const cDown  = commROC < -DEADBAND;
    if (!spUp && !spDown) return null;  // S&P en deadband -> ruido
    if (!cUp  && !cDown)  return null;  // Commodities en deadband -> ruido
    if (spUp   && cDown)  return "crecimiento";
    if (spUp   && cUp)    return "boom";
    if (spDown && cDown)  return "recesion";
    if (spDown && cUp)    return "estanflacion";
    return null;
  };

  // ROC actual
  const currentSpROC   = calcROC252(spyData);
  const currentCommROC = calcROC252(dbcData);
  const currentQuadrant = classifyQuadrant(currentSpROC, currentCommROC);

  // -- Persistencia: verificar 15 sesiones consecutivas --------------------
  // Construimos una serie de cuadrantes diarios usando la historia combinada de SPY y DBC.
  // Alineamos por fecha: para cada fecha donde tengamos ambas series, calculamos el cuadrante.
  const spByDate  = Object.fromEntries(spyData.map(r  => [r.date, r.close]));
  const dbcByDate = Object.fromEntries(dbcData.map(r => [r.date, r.close]));

  // Fechas comunes con >= 253 sesiones anteriores
  const allDates = [...new Set([...Object.keys(spByDate), ...Object.keys(dbcByDate)])].sort();
  const quadrantSeries = [];

  for (let i = 0; i < allDates.length; i++) {
    const d = allDates[i];
    if (!spByDate[d] || !dbcByDate[d]) continue;
    // Buscar cierre de 252 dias atras en cada serie
    const spIdx  = spyData.findIndex(r  => r.date  === d);
    const dbcIdx = dbcData.findIndex(r => r.date === d);
    if (spIdx  < 252 || dbcIdx < 252) continue;
    const spROC   = spyData[spIdx].close  > 0 ? (spyData[spIdx].close  - spyData[spIdx - 252].close)  / spyData[spIdx - 252].close  * 100 : null;
    const commROC = dbcData[dbcIdx].close > 0 ? (dbcData[dbcIdx].close - dbcData[dbcIdx - 252].close) / dbcData[dbcIdx - 252].close * 100 : null;
    quadrantSeries.push({ date: d, quadrant: classifyQuadrant(spROC, commROC) });
  }

  // Persistencia: contar sesiones consecutivas del cuadrante actual al final de la serie
  let persistCount = 0;
  if (currentQuadrant && quadrantSeries.length > 0) {
    for (let i = quadrantSeries.length - 1; i >= 0; i--) {
      if (quadrantSeries[i].quadrant === currentQuadrant) persistCount++;
      else break;
    }
  }

  const isConfirmed = persistCount >= PERSIST_DAYS;
  const confirmedQuadrant = isConfirmed ? currentQuadrant : null;

  // Regimen anterior (ultima sesion confirmada antes del streak actual, si aplica)
  let prevQuadrant = null;
  if (!isConfirmed && quadrantSeries.length > 0) {
    for (let i = quadrantSeries.length - 1 - persistCount; i >= 0; i--) {
      if (quadrantSeries[i].quadrant) { prevQuadrant = quadrantSeries[i].quadrant; break; }
    }
  }

  const activeQuadrant = confirmedQuadrant ?? prevQuadrant ?? currentQuadrant;
  const recommended    = activeQuadrant ? QUADRANT_TO_THESIS[activeQuadrant] : "defensivo";

  // -- Scores para el modo hibrido del Radar -------------------------------
  const scores = { stagflacion: 0, defensivo: 0, crecimiento: 0, valor: 0 };
  if (activeQuadrant === "crecimiento")  { scores.crecimiento = 10; scores.valor = 5; }
  if (activeQuadrant === "boom")         { scores.stagflacion = 10; scores.crecimiento = 3; }
  if (activeQuadrant === "recesion")     { scores.defensivo = 10; scores.valor = 4; }
  if (activeQuadrant === "estanflacion") { scores.stagflacion = 8; scores.defensivo = 4; }

  // -- Senales para la UI ---------------------------------------------------
  const spROCStr   = currentSpROC   != null ? (currentSpROC   >= 0 ? "+" : "") + currentSpROC.toFixed(1)   + "%" : "-";
  const commROCStr = currentCommROC != null ? (currentCommROC >= 0 ? "+" : "") + currentCommROC.toFixed(1) + "%" : "-";

  const regimeSignals = [
    `S&P 500 ROC 252d: ${spROCStr} | Commodities ROC 252d: ${commROCStr}`,
    currentQuadrant
      ? `Cuadrante actual: ${currentQuadrant.toUpperCase()} (${persistCount} sesiones de ${PERSIST_DAYS} requeridas)`
      : `ROC en zona de deadband (+/-${DEADBAND}%) - sin senal de regimen`,
    isConfirmed
      ? `REGIMEN CONFIRMADO: ${currentQuadrant?.toUpperCase()} (persistencia >= ${PERSIST_DAYS} dias)`
      : prevQuadrant
        ? `En transicion (${persistCount}/${PERSIST_DAYS}d) - manteniendo regimen anterior: ${prevQuadrant.toUpperCase()}`
        : `Sin regimen confirmado - deadband activa`,
  ].filter(Boolean);

  const dailySignals = [];

  // -- Agflation suffix - anade descripcion al label sin pisar el cuadrante ----
  // grainIs llega desde market.grainIs (extraido en processUpload).
  // El cuadrante base (activeQuadrant) es INMUTABLE - refleja senal sistemica ROC+FRED.
  const grainIs     = market?.grainIs ?? null;
  const grainSuffix = (grainIs != null && !isNaN(grainIs))
    ? grainIs > 1.5
      ? ` ⚡ Agflation Critico (${grainIs.toFixed(2)}sigma)`
      : grainIs > 0.8
        ? ` + Agflation Risk (${grainIs.toFixed(2)}sigma)`
        : null
    : null;

  return {
    recommended,
    quarantine:      false,
    quadrant:        activeQuadrant,          // INMUTABLE - cuadrante sistemico
    quadrantLabel:   activeQuadrant + (grainSuffix ?? ""),  // label enriquecido para UI
    grainIs,
    grainSuffix,
    currentQuadrant,
    isConfirmed,
    persistCount,
    spROC:           currentSpROC,
    commROC:         currentCommROC,
    scores,
    regimeSignals,
    dailySignals,
    signals:         regimeSignals,
    days:            Object.keys(snapshots).length,
    spyDays:         spyData.length,
    dbcDays:         dbcData.length,
  };
};

// -- PROXY_MAP - Diccionario de sustitutos operables en broker local ----------
// Editar aqui para agregar o modificar proxies sin tocar la logica de scoring.
const PROXY_MAP = {
  "BTC-USD":  "IBIT, MSTR",
  "ETH-USD":  "ETHA, COIN",
  "GLD":      "GOLD (Barrick), NEM",
  "GC=F":     "GLD, IAU, GOLD",
  "SLV":      "PAAS, HL",
  "CL=F":     "USO, XOM, CVX",
  "DBC":      "XLE, XLB",
  "DBA":      "DE, MOO",
  "TLT":      "IEF, BND",
  "DX-Y.NYB": "UUP",
  "^GSPC":    "SPY, VOO",
  "HG=F":     "COPX, SCCO",
};

// -- calcMacroDivergenceMultiplier --------------------------------------------
// Fusiona el motor de mercado (ROC 252d - Leading) con el motor FRED (Lagging).
// NO toca calcRadarScore ni calcMacroAlignScore sectorial.
//
// Definiciones de tono:
//   Alcista (ROC 252d): cuadrante = "crecimiento" o "boom"
//   Bajista  (ROC 252d): cuadrante = "recesion" o "estanflacion"
//   Alcista (FRED): cuadrante contiene "crecimiento" o "valor"
//   Bajista  (FRED): cuadrante contiene "defensivo" o "estanflacion"
//
// Escenarios:
//   ALIGNMENT (1.2)  - ambos motores coinciden en tono
//   LEADING   (1.0)  - mercado alcista, FRED aun bajista (mercado se adelanta)
//   TOXIC     (0.5)  - mercado bajista, FRED aun alcista (alarma de crash)
//   NEUTRAL   (1.0)  - cualquier otro caso (cuarentena ROC, FRED no disponible)
// -- AGRI_BENEFICIARIES - Set explicito de beneficiados por shock de granos ----
// No depende de getSector() - lookup O(1) por ticker.
// Incluye tickers presentes en el universo + candidatos futuros.
const AGRI_BENEFICIARIES = new Set([
  // Fertilizantes y nutrientes
  "MOS", "BG", "CF", "NTR", "CTVA",
  // Maquinaria agricola
  "DE", "AGCO",
  // Agro LatAm (en universo)
  "AGRO", "LND",
  // Procesadores de granos
  "ADM", "BIOX",
]);

// -- Sectores penalizados por encarecimiento de insumos alimentarios -----------
// Consumo masivo con alto costo de commodities agricolas como input.
const AGRI_PENALIZED = new Set([
  "MCD", "SBUX", "YUM", "CMG",                          // Restaurantes
  "PG", "KO", "PEP", "MDLZ", "HSY", "KMB", "CL",       // Consumo basico
  "WMT", "TGT", "COST", "HD",                            // Retail masivo
  "ABEV", "UL", "ARCO",                                  // Alimentos/bebidas LatAm
]);

// -- calcMacroDivergenceMultiplier - Fusion Grok-Claude v2 --------------------
// M continuo que elimina el whipsaw del step-function anterior.
// Formula: M = 1.0 + (0.20 x z_ROC252) - (0.12 x FRED_z) + grain_adj
// Clamp final: [0.60, 1.40]
//
// z_ROC252 = currentSpROC / DEADBAND  (normalizacion por umbral operativo)
// FRED_z   = mapeo categorico del cuadrante FRED a escala [-1, +1]
//            "crecimiento"/"valor" -> +1.0 | "defensivo"/"estanflacion" -> -1.0
// grain_adj = proporcional a grainIntensity = clamp(grain_is, 0, 2.0)
//            beneficiados +0.25/u | penalizados -0.30/u | resto -0.12/u
const calcMacroDivergenceMultiplier = (rocQuadrant, fredRegime, grainIs, tickerSymbol, spROC, spxQDiv = 0.08, spxRoc63d = null) => {
  // -- 1. z_ROC252: inercia del mercado normalizada por sigma historica ----------
  // SIGMA_ROC_PCT = 8.0% declarada globalmente (compartida con cycleIndicators y telemetria)
  // z_roc252: usa SPX_ROC_63d del CSV (Python) si disponible - dato limpio y exacto.
  // Fallback a spROC de rocHistory si el CSV es anterior al parche.
  // _mDivPct convierte el divisor decimal del CSV a % para alinear escalas.
  const _mEffectiveROC = (spxRoc63d != null) ? spxRoc63d : spROC;
  const _mDivPct = ((typeof spxQDiv === "number" && spxQDiv > 0) ? spxQDiv : 0.08) * 100;
  const zROC252  = (_mEffectiveROC != null) ? (_mEffectiveROC / _mDivPct) : 0;

  // -- 2. FRED_z: mapeo categorico a escala numerica continua --------------
  // Vocabulario real del sistema: "crecimiento", "valor", "defensivo", "estanflacion"
  // Bug corregido vs propuesta Grok: "ofensivo" no existe -> se usaba fallback 0 siempre
  const fredCuad = (fredRegime?.cuadrante || "").toLowerCase();
  const FRED_z   =
    (fredCuad.includes("crecimiento") || fredCuad.includes("valor"))       ? +1.0 :
    (fredCuad.includes("defensivo")   || fredCuad.includes("estanflacion")) ? -1.0 : 0.0;

  // -- 3. Grain adjustment proporcional (clamp input en 2.0sigma) --------------
  // Bug corregido vs propuesta Grok: .includes() no funciona en Set -> usar .has()
  const grainIntensity = Math.min(Math.max(grainIs || 0, 0), 2.0);
  let grain_adj;
  if (AGRI_BENEFICIARIES.has(tickerSymbol)) {
    grain_adj = +0.25 * grainIntensity;
  } else if (AGRI_PENALIZED.has(tickerSymbol)) {
    grain_adj = -0.30 * grainIntensity;
  } else {
    grain_adj = -0.12 * grainIntensity;
  }

  // -- 4. M continuo + clamp [0.60, 1.40] ----------------------------------
  const rawM   = 1.0 + (0.20 * zROC252) - (0.12 * FRED_z) + grain_adj;
  const finalM = Math.min(Math.max(rawM, 0.60), 1.40);

  // Construir detail para auditoria/UI
  const flag   = zROC252 > 0.5 ? "EXPANSION" : zROC252 < -0.5 ? "CONTRACCION" : "TRANSICION";
  const detail = `z_ROC252=${zROC252.toFixed(2)} | FRED_z=${FRED_z.toFixed(1)} | grain_adj=${grain_adj.toFixed(3)} -> M=${finalM.toFixed(3)}`;

  return { multiplier: finalM, flag, detail,
           grainAdj: parseFloat(grain_adj.toFixed(4)) };
};

// -- applyGrainAdjustment - Sensibilidad proporcional al Agflation IS ---------
// Modelo lineal con cap de seguridad en 1.5x para eventos extremos (ej: 3sigma).
// grainIs: float en sigma (del CSV Grain_IS) | null/undefined/NaN -> sin ajuste.
// tickerSymbol: string | undefined -> ajuste general si no se especifica.
//
// Coeficientes:
//   Beneficiados: +0.10 por sigma (ingresos suben con precio del grano)
//   Penalizados:  -0.12 por sigma (margen se comprime con costo del insumo)
//   General:      -0.04 por sigma (impacto sistemico del costo de alimentos)
//
// final_M = clamp(base_M x (1 + adj x shock_intensity), 0, 1.5)
const applyGrainAdjustment = (base, grainIs, tickerSymbol) => {
  const M_CAP = 1.5;
  const shock = (grainIs != null && !isNaN(grainIs)) ? Math.min(Math.max(0, grainIs), 3.0) : null;
  if (shock === null || shock === 0) return base;  // sin ajuste si null/NaN/negativo

  let adj;
  if (AGRI_BENEFICIARIES.has(tickerSymbol)) {
    adj = +0.10;   // beneficiado: ingresos correlacionados positivamente con granos
  } else if (AGRI_PENALIZED.has(tickerSymbol)) {
    adj = -0.12;   // penalizado: margen comprimido por costo de insumos
  } else {
    adj = -0.04;   // impacto sistemico general
  }

  const rawM     = base.multiplier * (1 + adj * shock);
  const finalM   = Math.min(Math.max(rawM, 0), M_CAP);
  const grainTag = shock > 1.0
    ? ` | ⚡ Agflation ${shock.toFixed(2)}sigma (${adj > 0 ? "+" : ""}${(adj*100).toFixed(0)}%/sigma)`
    : ` | Grain IS: ${shock.toFixed(2)}sigma`;

  return {
    ...base,
    multiplier: parseFloat(finalM.toFixed(4)),
    grainAdj:   parseFloat((adj * shock).toFixed(4)),
    detail:     base.detail + grainTag,
  };
};

// -- calcEWMAVolatility - RiskMetrics EWMA (λ=0.94) con semilla institucional -
// lambda=0.94: parametro J.P. Morgan para datos diarios EOD.
// initPeriods=21: varianza inicial calculada como promedio simple (media ~0 en EOD).
// annualize=false: retorna volatilidad diaria (misma escala que ROC_21d para el Master Score).
// annualize=true: retorna volatilidad anualizada en % (para reportes y UI).
const calcEWMAVolatility = (prices, lambda = 0.94, initPeriods = 21, annualize = false) => {
  if (!prices || prices.length <= initPeriods) return null;

  // Retornos simples diarios (media asumida ~0 en EOD)
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i-1] > 0) returns.push((prices[i] / prices[i-1]) - 1);
  }
  if (returns.length <= initPeriods) return null;

  // Semilla: varianza simple sobre los primeros initPeriods retornos
  let sumSq = 0;
  for (let i = 0; i < initPeriods; i++) sumSq += returns[i] * returns[i];
  let ewmaVar = sumSq / initPeriods;

  // Recursion EWMA sobre el historial restante
  for (let i = initPeriods; i < returns.length; i++) {
    ewmaVar = lambda * ewmaVar + (1 - lambda) * returns[i] * returns[i];
  }

  const dailyVol = Math.sqrt(ewmaVar);
  return annualize ? dailyVol * Math.sqrt(252) * 100 : dailyVol * 100;
};

// -- calcROC21d - Ventana Adaptativa (21->63 sesiones) ------------------------
// Tiende a ROC_63d cuando hay suficientes snapshots acumulados.
// Con pocos snapshots opera normalmente sin devolver null.
// windowSize = min(snapshots disponibles, 63) - nunca menor que 1.
const calcROC21d = (symbol, snaps, selDate) => {
  const dates  = Object.keys(snaps).sort();
  const selIdx = selDate ? dates.indexOf(selDate) : dates.length - 1;
  if (selIdx < 1) return null;

  // Ventana adaptativa: tiende a 63 dias, opera con lo disponible
  const windowSize = Math.min(selIdx, 63);
  const startIdx   = Math.max(0, selIdx - windowSize);

  const endSnap = snaps[dates[selIdx]];
  const pEnd = endSnap?.tickers?.find(t => t.symbol === symbol)?.last_price ?? null;
  if (pEnd == null) return null;

  for (let i = startIdx; i < selIdx; i++) {
    const pStart = snaps[dates[i]]?.tickers?.find(t => t.symbol === symbol)?.last_price ?? null;
    if (pStart != null && pStart > 0) return (pEnd - pStart) / pStart * 100;
  }
  return null;
};

// -- CUCHILLO (pestana OPERAR) - overlay informativo, no interviene en el
// motor ni en el Radar. Lee columnas ya calculadas por el generador de
// snapshots (drawdown_252d, vol_60d, roc_63d) - no recalcula desde historial.
// Umbral de percentil por metodo de rango mas cercano, sobre un array ya
// ordenado ascendente (mismo espiritu que el percentil de primaPorTicker).
const percentilUmbralCuchillo = (valoresOrdenados, pct) => {
  if (!valoresOrdenados.length) return null;
  const idx = Math.min(valoresOrdenados.length - 1, Math.max(0, Math.floor(pct / 100 * (valoresOrdenados.length - 1))));
  return valoresOrdenados[idx];
};

const calcRelativeStrength = (symbol, snaps, selDate) => {
  const dates = Object.keys(snaps).sort();
  const selIdx = dates.indexOf(selDate);
  if (selIdx < 1) return null;
  const startIdx = Math.max(0, selIdx - 20);

  const endSnap = snaps[selDate];
  const tEnd = endSnap.tickers?.find(t => t.symbol === symbol)?.last_price;
  if (!tEnd) return null;

  // Detectar benchmark disponible en el snapshot actual (prioridad: ^GSPC > SPY)
  const SP_BENCHMARKS = ["^GSPC", "SPY"];
  const getBenchmark = (snap) => {
    for (const bm of SP_BENCHMARKS) {
      const p = snap.tickers?.find(t => t.symbol === bm)?.last_price ?? snap.market?.sp500?.price ?? null;
      if (p != null) return { price: p, source: bm };
    }
    return null;
  };

  const endBm = getBenchmark(endSnap);
  if (!endBm) return null;

  // Escaneo progresivo: busca el primer snapshot historico donde
  // el ticker Y el MISMO benchmark que se usa en el extremo final tengan precio
  let tStart = null;
  let spStart = null;
  for (let i = startIdx; i < selIdx; i++) {
    const snap = snaps[dates[i]];
    const tk = snap.tickers?.find(t => t.symbol === symbol)?.last_price;
    // Buscar el mismo benchmark que usamos en endSnap para garantizar escala consistente
    const sp = snap.tickers?.find(t => t.symbol === endBm.source)?.last_price
             ?? (endBm.source === "SPY" ? snap.market?.sp500?.price : null);
    if (tk != null && sp != null) {
      tStart = tk;
      spStart = sp;
      break;
    }
  }

  if (!tStart || !spStart) return null;
  return (((tEnd - tStart) / tStart) * 100) - (((endBm.price - spStart) / spStart) * 100);
};


// ═══════════════════════════════════════════════════════════════════════════════
// FUSION RADAR + AQR - Rank-Normalization + Inverse Variance Weighting (IVW)
// Implementado por Opus 4.7 (2026-04-17). Reemplaza fusion 50/50 heuristica.
// ═══════════════════════════════════════════════════════════════════════════════

const N_MIN_FOR_IVW = 10;  // minimo tickers con ambos scores para IVW valido
const VAR_FLOOR = 1e-6;    // proteccion contra division por cero

// Convierte array de valores a percentiles [0,100]. Nulls preservados como null.
const rankToPercentile = (values) => {
  const indexed = values.map((v, i) => ({ v, i }));
  const valid = indexed.filter(x => x.v !== null && !isNaN(x.v));
  valid.sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length).fill(null);
  let i = 0;
  while (i < valid.length) {
    let j = i;
    while (j < valid.length && valid[j].v === valid[i].v) j++;
    const avgRank = (i + j - 1) / 2;
    for (let k = i; k < j; k++) {
      ranks[valid[k].i] = valid.length > 1 ? (avgRank / (valid.length - 1)) * 100 : 50;
    }
    i = j;
  }
  return ranks;
};

// Calcula varianza de un array ignorando nulls.
const calcVariance = (arr) => {
  const valid = arr.filter(x => x !== null && !isNaN(x));
  if (valid.length < 2) return VAR_FLOOR;
  const mean = valid.reduce((s, x) => s + x, 0) / valid.length;
  const sumSq = valid.reduce((s, x) => s + (x - mean) ** 2, 0);
  return Math.max(sumSq / (valid.length - 1), VAR_FLOOR);
};

// Fallback 50/50 cuando IVW no es aplicable.
const fuseSimple50_50 = (radarMap, aqrMap, extraInfo = {}) => {
  const fused = {};
  const allSyms = new Set([...Object.keys(radarMap), ...Object.keys(aqrMap)]);
  for (const sym of allSyms) {
    const r = radarMap[sym]; const a = aqrMap[sym];
    if (r != null && a != null) fused[sym] = Math.round(r * 0.5 + a * 0.5);
    else if (r != null) fused[sym] = Math.round(r);
    else if (a != null) fused[sym] = Math.round(a);
  }
  return { fusedBySymbol: fused, diagnostics: { method: extraInfo.method || 'equal_50_50', w_R: 0.5, w_A: 0.5, ...extraInfo } };
};

// Fusiona Radar y AQR usando rank-normalization + IVW para todo el universo.
const fuseRadarAQR = (radarMap, aqrMap) => {
  const allSyms = Array.from(new Set([...Object.keys(radarMap), ...Object.keys(aqrMap)]));
  const radarArr = allSyms.map(s => radarMap[s] ?? null);
  const aqrArr   = allSyms.map(s => aqrMap[s]   ?? null);
  const n_overlap = allSyms.filter((s, i) => radarArr[i] !== null && aqrArr[i] !== null).length;

  if (n_overlap < N_MIN_FOR_IVW) {
    return fuseSimple50_50(radarMap, aqrMap, { method: 'equal_fallback', reason: `n_overlap=${n_overlap}<${N_MIN_FOR_IVW}` });
  }

  const radarRanks = rankToPercentile(radarArr);
  const aqrRanks   = rankToPercentile(aqrArr);

  // Varianzas sobre el overlap
  const rRanksOvlp = radarRanks.filter((_, i) => radarArr[i] !== null && aqrArr[i] !== null);
  const aRanksOvlp = aqrRanks.filter((_, i)   => radarArr[i] !== null && aqrArr[i] !== null);
  const var_R = calcVariance(rRanksOvlp);
  const var_A = calcVariance(aRanksOvlp);

  const inv_R = 1 / var_R; const inv_A = 1 / var_A;
  const w_R = inv_R / (inv_R + inv_A);
  const w_A = inv_A / (inv_R + inv_A);

  const fused = {};
  for (let i = 0; i < allSyms.length; i++) {
    const sym = allSyms[i];
    const rR = radarRanks[i]; const aR = aqrRanks[i];
    if (rR !== null && aR !== null) {
      fused[sym] = Math.round(w_R * rR + w_A * aR);
    } else if (rR !== null) {
      fused[sym] = Math.round(rR);
    } else if (aR !== null) {
      fused[sym] = Math.round(aR);
    }
  }

  return {
    fusedBySymbol: fused,
    diagnostics: {
      method: 'ivw_rank_normalized',
      w_R: parseFloat(w_R.toFixed(4)), w_A: parseFloat(w_A.toFixed(4)),
      var_R: parseFloat(var_R.toFixed(2)), var_A: parseFloat(var_A.toFixed(2)),
      n_overlap,
      n_radar_only: radarArr.filter((r, i) => r !== null && aqrArr[i] === null).length,
      n_aqr_only:   aqrArr.filter((a, i)   => a !== null && radarArr[i] === null).length,
    }
  };
};

const calcRadarScore = (ticker, fmpEntry, sectorArbitrageData, cyclePhase, creditStress, thesis, cycleProbabilities, dynamicScores, _opts = {}) => {
  // _opts.raw=true -> omitir guillotinas (para scores_por_tesis_raw en telemetria)
  // _opts.guillotineLog=[] -> captura el motivo del corte si aplica
  const _skipGuillotines = _opts.raw === true;
  const cfg = THESIS_CONFIG[thesis];
  if (!cfg) return null;
  const w = cfg.weights;
  const sym = ticker.symbol || "";
  if (sym.startsWith('^') || sym === 'DX-Y.NYB') return null;
  const sector = getSector(sym);
  const isMacroAsset = ["ETFs/Indices","Macro/Divisas","Crypto"].includes(sector) || ["GLD","SLV","COPX","URA","PAAS"].includes(sym) || sym.includes("=F");
  let factors = [];

  // -- 1. VETOS ABSOLUTOS ------------------------------------------------------
  // Guillotina cripto universal: MSTR/RIOT/COIN/MARA vetados en todas las tesis.
  // Alta correlacion con BTC, beta extremo y sin fundamentales analizables.
  // BTC-USD y ETH-USD son HISTORY_ONLY por diseno - nunca llegan aca.
  const CRYPTO_EQUITY_VETO = new Set(["MSTR","RIOT","COIN","MARA"]);
  if (!_skipGuillotines && CRYPTO_EQUITY_VETO.has(sym)) { if (_opts.guillotineLog) _opts.guillotineLog.push("CRYPTO_EQUITY_VETO"); return null; }

  if (!_skipGuillotines && thesis === "crecimiento" && ["PSQ","SH","TLT","GLD","GC=F","HG=F"].includes(sym)) { if (_opts.guillotineLog) _opts.guillotineLog.push("CRECIMIENTO_HEDGE"); return null; }
  if (!_skipGuillotines && thesis === "defensivo"   && ["PSQ","BTC-USD","ETH-USD"].includes(sym)) { if (_opts.guillotineLog) _opts.guillotineLog.push("DEFENSIVO_VETO"); return null; }

  if (!isMacroAsset) {
    // DEFENSIVO: guillotina taxonomica sectorial
    if (!_skipGuillotines && thesis === "defensivo") {
      if (["Energia","Metales/Mineria","Emergentes/ADR","Crypto","Consumo Discrec",
           "Industriales/Materiales","Semiconductores","Software/High-Beta","Otros"].includes(sector)) { if (_opts.guillotineLog) _opts.guillotineLog.push("DEFENSIVO_SECTOR"); return null; }
      if (ticker._debt_eq != null && ticker._debt_eq > 1.2 && sector !== "Finanzas") { if (_opts.guillotineLog) _opts.guillotineLog.push("DEFENSIVO_DEBT"); return null; }
      // Guillotina por Z-Score sectorial: veta activos caros vs sus pares defensivos directos
      // No usa P/E fijo - respeta la prima estructural del sector pero aniquila los outliers caros
      const sectorDataDef = sectorArbitrageData?.[sector];
      if (sectorDataDef) {
        const tkDef = sectorDataDef.tickers?.find(t => t.symbol === sym);
        if (!_skipGuillotines && tkDef?.avgZ != null && tkDef.avgZ > 1.5) { if (_opts.guillotineLog) _opts.guillotineLog.push("DEFENSIVO_Z_SECTOR"); return null; }
      }
    }
    // STAGFLACION: FCF negativo = vulnerabilidad con tasas altas
    if (!_skipGuillotines && thesis === "stagflacion" && ticker._fcf_yield != null && ticker._fcf_yield < 0 && sector !== "Finanzas") return null;
    // CRECIMIENTO: dinero institucional huyendo = trampa, sin importar el P/E
    if (!_skipGuillotines && thesis === "crecimiento" && ticker._rs != null && ticker._rs < -5) { if (_opts.guillotineLog) _opts.guillotineLog.push("CRECIMIENTO_RS_NEGATIVO"); return null; }
    // VALOR: guillotinas duras - barata o no entra
    if (!_skipGuillotines && thesis === "valor") {
      if (ticker.forward_pe != null && ticker.forward_pe > 15) { if (_opts.guillotineLog) _opts.guillotineLog.push("VALOR_PE_ALTO"); return null; }
      if (ticker._piotroski != null && ticker._piotroski < 5)  { if (_opts.guillotineLog) _opts.guillotineLog.push("VALOR_PIO_BAJO"); return null; }
    }
  }

  // -- 2. MOTOR NORMALIZADO 0-100 (Promedio Ponderado) ------------------------
  let totalScore  = 0;
  let totalWeight = 0;

  const _compLog = {};  // tracking de componentes para telemetria
  let _sectorZData = null;  // Z-score sectorial - declarado en scope de funcion (block-scope fix)
  const addComponent = (score0to100, weight, factorMsg, compKey) => {
    if (score0to100 == null || weight == null || weight === 0) return;
    const bounded = Math.max(0, Math.min(100, score0to100));
    totalScore  += bounded * weight;
    totalWeight += weight;
    if (factorMsg) factors.push(factorMsg);
    if (compKey) _compLog[compKey] = Math.round(bounded);
  };

  if (!isMacroAsset) {
    const isArgentine = sym.endsWith(".BA") || sym === "YPF" || sym === "GGAL";

    // A. Valuacion absoluta (val_score 1-10 -> 10-100)
    if (ticker._val_score != null && !isArgentine) {
      const valScore = ticker._val_score * 10;
      addComponent(valScore, w.val_score,
        valScore >= 70 ? "valuacion atractiva (" + ticker._val_score + "/10)"
      : valScore <= 30 ? "valuacion cara (" + ticker._val_score + "/10)"
      : null, "A_val");
    }

    // B. Calidad Piotroski (0/9 -> 0/100)
    if (ticker._piotroski != null) {
      const pioScore = (ticker._piotroski / 9) * 100;
      addComponent(pioScore, w.piotroski,
        pioScore >= 78 ? "Piotroski solido (" + ticker._piotroski + "/9)"
      : pioScore <= 33 ? "Piotroski debil (" + ticker._piotroski + "/9)"
      : null, "B_piotroski");
    }

    // C. Arbitraje sectorial por Z-Score (Z=0 -> 50 | Z=-2 -> 90 | Z=+2 -> 10)
    const sectorData = sectorArbitrageData?.[sector];
    if (sectorData && !isArgentine) {
      const tk = sectorData.tickers?.find(t => t.symbol === sym);
      if (tk?.avgZ != null) {
        const zScore = 50 - (tk.avgZ * 20);
        _sectorZData = {
          avg_z:    parseFloat(tk.avgZ.toFixed(3)),
          z_fpe:    tk.zScores?.[0] != null ? parseFloat(tk.zScores[0].toFixed(3)) : null,
          z_pb:     tk.zScores?.[1] != null ? parseFloat(tk.zScores[1].toFixed(3)) : null,
          ref_src:  tk.ref_source ?? "sesion_actual",
          median_fpe_usado: sectorData.stats?.forward_pe?.mean != null
                              ? parseFloat(sectorData.stats.forward_pe.mean.toFixed(2)) : null,
          mad_fpe_usado:    sectorData.stats?.forward_pe?.std != null
                              ? parseFloat((sectorData.stats.forward_pe.std / 1.4826).toFixed(2)) : null,
        };
        addComponent(zScore, w.sector_z,
          zScore >= 75 ? "barato vs sector (Z=" + tk.avgZ.toFixed(1) + ")"
        : zScore <= 25 ? "caro vs sector (Z=+" + tk.avgZ.toFixed(1) + ")"
        : null, "C_sector_z");
      }
    }

    // D. Momentum / Ciclo + RS combinados
    // Fase del precio del activo: ALZA=100, ACUM=75, DIST=25, BAJA=0, sin dato=50
    let cycleScore = 50;
    if (cyclePhase) {
      if (cyclePhase.label === "ALZA") cycleScore = 100;
      if (cyclePhase.label === "ACUM") cycleScore = 75;
      if (cyclePhase.label === "DIST") cycleScore = 25;
      if (cyclePhase.label === "BAJA") cycleScore = 0;
    }
    // RS 20D: 50 + rs*3.33 - satura en +/-15% preservando resolucion de outliers como OXY +11%
    if (ticker._rs != null) {
      const rsScore = Math.max(0, Math.min(100, 50 + ticker._rs * 3.33));
      cycleScore = (cycleScore + rsScore) / 2;
    }
    addComponent(cycleScore, w.cycle,
      cycleScore >= 75 ? "momentum +"
    : cycleScore <= 25 ? "momentum -"
    : null, "D_cycle_rs");

    // E. Riesgo de refinanciacion (BAJO=100, MOD=50, ALTO=0)
    const refi = ticker._refi_risk;
    let refiScore = 50; // sin dato = neutro
    if (refi?.label === "BAJO") refiScore = 100;
    if (refi?.label === "MOD")  refiScore = 50;
    if (refi?.label === "ALTO") refiScore = 0;
    addComponent(refiScore, w.refi_risk,
      refiScore === 0   ? "riesgo refinanciacion ALTO"
    : refiScore === 100 ? "balance sano (REFI BAJO)"
    : null, "E_refi");

    // F. Alineacion Macro - Componente dinamico basado en ciclo real
    // Si hay probabilidades del ciclo disponibles, usa SECTOR_CYCLE_MAP para calcular Cm.
    // Fallback: sector_bonus estatico de THESIS_CONFIG cuando no hay cycleIndicators.
    const dynamicMacroScore = calcMacroAlignScore(sector, cycleProbabilities);
    const macroAlignScore = dynamicMacroScore != null
      ? dynamicMacroScore
      : Math.max(0, Math.min(100, 50 + (w.sector_bonus?.[sector] || 0) * 16.66));
    addComponent(macroAlignScore, 1.5,
      macroAlignScore >= 80 ? "sector alineado a ciclo real (" + macroAlignScore.toFixed(0) + "/100)"
    : macroAlignScore <= 20 ? "sector en contra del ciclo real (" + macroAlignScore.toFixed(0) + "/100)"
    : null, "F_macro_align");

  } else {
    // -- Activos Macro (ETFs / Commodities / Divisas) -------------------------
    // Escala especifica: base 50 + ajustes por tesis y ciclo
    let macroScore = 50;
    const sectorBonus = w.sector_bonus?.[sector] || 0;
    macroScore += sectorBonus * 15;

    if (thesis === "defensivo") {
      if (["TLT","GLD","GC=F"].includes(sym)) { macroScore = 100; factors.push("refugio estructural"); }
      else if (sym === "HYG")                  { macroScore = 10;  factors.push("riesgo crediticio"); }
      else if (sym === "SLV")                  { macroScore = 75;  factors.push("refugio secundario"); }
      else if (sector === "Crypto")            { macroScore = 0; }
    } else if (thesis === "stagflacion" && ["CL=F","GLD","GC=F","COPX","PAAS","SLV"].includes(sym)) {
      macroScore = 100; factors.push("cobertura inflacionaria");
    }

    if (cyclePhase) {
      if (cyclePhase.label === "ALZA") macroScore += 20;
      if (cyclePhase.label === "ACUM") macroScore += 10;
      if (cyclePhase.label === "DIST") macroScore -= 10;
      if (cyclePhase.label === "BAJA") macroScore -= 20;
    }
    if (["HYG","LQD"].includes(sym) && creditStress.stressLevel === "ALTO") {
      macroScore -= 15; factors.push("spreads amplios");
    }
    addComponent(macroScore, 2, null);
  }

  // -- 3. SCORE FINAL NORMALIZADO -------------------------------------------
  if (totalWeight === 0) return null;
  let finalScore = totalScore / totalWeight;

  // -- Componente E: refi_risk como multiplicador (reemplaza penalidad aditiva -25) --
  // Multiplicador: ALTO -> 0.75 | MOD -> 0.90 | BAJO -> 1.0
  // Ventaja vs -25 aditivo: proporcional al score, nunca lleva a negativo,
  // y permite distinguir entre un 90 que cae a 67 vs un 40 que cae a 30.
  if (!isMacroAsset) {
    const refi = ticker._refi_risk;
    if (refi?.label === "ALTO") {
      finalScore *= 0.75;
      factors.push("riesgo refinanciacion ALTO (x0.75)");
    } else if (refi?.label === "MOD") {
      finalScore *= 0.90;
      factors.push("riesgo refinanciacion MOD (x0.90)");
    }
  }

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  // -- Retorna score crudo sin fusion AQR -----------------------------------
  // La fusion IVW se hace en el caller (radarScores useMemo) sobre el universo completo.
  // regimeScore se asigna post-fusion - ver fuseRadarAQR().
  const dsKey = sym.toUpperCase();
  const extScore = dynamicScores?.[dsKey] ?? null;  // guardado para auditoria en telemetria
  const _totalPreRefi = totalWeight > 0 ? parseFloat((totalScore / totalWeight).toFixed(1)) : null;
  return {
    score: finalScore,
    factors: [...new Set(factors)],
    sector,
    regimeScore: extScore,
    _components: Object.keys(_compLog).length > 0 ? {
      ..._compLog,
      // E_refi: score bruto (0=ALTO, 50=MOD, 100=BAJO) ya esta en _compLog["E_refi"]
      // Convertimos al multiplicador equivalente para auditoria
      E_refi_mult: _compLog["E_refi"] != null
        ? parseFloat((_compLog["E_refi"] === 0 ? 0.75 : _compLog["E_refi"] <= 50 ? 0.90 : 1.00).toFixed(2))
        : null,
      total_pre_refi:  _totalPreRefi,
      final_post_refi: finalScore,
    } : null,
    _sectorZ: _sectorZData,
  };
};

const getCyclePhase = (symbol, snaps) => {


  const dates = Object.keys(snaps).sort();
  if (dates.length < 3) return null;

  // Extraer variaciones diarias del historial de snapshots
  const changes = dates
    .map(d => snaps[d].tickers?.find(t => t.symbol === symbol)?.change_pct)
    .filter(v => v != null);
  if (changes.length < 3) return null;

  // Calcular μ y sigma del activo a partir de sus propias variaciones historicas
  const mu    = changes.reduce((a,b) => a+b, 0) / changes.length;
  const sigma = Math.sqrt(changes.reduce((a,b) => a+(b-mu)**2, 0) / changes.length);

  // Ventana reciente: ultimas 3 sesiones disponibles
  const recent = changes.slice(-3);
  const recentMu = recent.reduce((a,b) => a+b, 0) / recent.length;

  // Clasificacion estadistica por desviacion estandar
  // ALZA:  promedio reciente > +0.5sigma  (momentum positivo estadisticamente significativo)
  // DIST:  promedio reciente < -0.5sigma  (momentum negativo estadisticamente significativo)
  // ACUM:  entre -0.5sigma y 0            (consolidacion con sesgo neutral-positivo)
  // BAJA:  promedio reciente < -1.0sigma  (deterioro severo)
  // Circuit breaker: ultima sesion < -2sigma (ruptura estructural)

  const lastChange = changes[changes.length - 1];
  const circuitBreaker = sigma > 0 && lastChange < -(2 * sigma);

  let label, color;
  if (sigma === 0) {
    label = "ACUM"; color = "#3b9eff";
  } else if (recentMu > 0.5 * sigma) {
    label = "ALZA"; color = "#00d964";
  } else if (recentMu < -sigma) {
    label = "BAJA"; color = "#ff3b5c";
  } else if (recentMu < -0.5 * sigma) {
    label = "DIST"; color = "#f59e0b";
  } else {
    label = "ACUM"; color = "#3b9eff";
  }

  return {
    label, color,
    mu: Number(mu.toFixed(3)),
    sigma: Number(sigma.toFixed(3)),
    recentMu: Number(recentMu.toFixed(3)),
    circuitBreaker,
    sigmaEvent: sigma > 0 ? Number((lastChange / sigma).toFixed(2)) : 0,
    n: changes.length,
  };
};

// Nunca usa raw ni entry.score como base de decision.
const resolveTrackedScore = (sym, liveEntry, isSinDatos,
  twScore, sectorUniverse, snapshots, creditStress, radarThesis,
  cycleIndicators, dynamicScores) => {
  // Paso 1: score vivo de radarScores (normal, con guillotinas)
  const s1 = liveEntry?._radar?.score ?? null;
  if (s1 != null || isSinDatos) return { score: s1, tesis: radarThesis, guillotinas: [] };
  // Paso 2: buscar score en OTRAS tesis modo NORMAL (respetando guillotinas)
  const tkObj = twScore ? twScore.find(t => t.symbol === sym) : null;
  if (!tkObj) return { score: null, tesis: radarThesis, guillotinas: [] };
  const twFilt = twScore.filter(t => t.last_price != null).map(t => ({...t, _val_score: calcValScore(t)}));
  const saLoc  = calcSectorArbitrage(twFilt, sectorUniverse);
  const cycle  = getCyclePhase(sym, snapshots);
  const THESES = ["stagflacion","defensivo","crecimiento","valor"];
  let bestScore = null, bestTesis = null;
  const gMap = {};
  THESES.forEach(function(th) {
    const gLog = [];
    const sc = calcRadarScore(tkObj, null, saLoc, cycle, creditStress,
      th, cycleIndicators ? cycleIndicators.probabilities : null, dynamicScores,
      { guillotineLog: gLog });
    if (sc && sc.score != null && (bestScore == null || sc.score > bestScore)) {
      bestScore = sc.score; bestTesis = th;
    }
    if (gLog.length > 0) gMap[th] = gLog[0];
  });
  if (bestScore != null) {
    const guillotinas = Object.entries(gMap)
      .filter(([t]) => t !== bestTesis)
      .map(([t,g]) => t+":"+g);
    return { score: bestScore, tesis: bestTesis, guillotinas };
  }
  // Paso 3: guillotinado en TODAS las tesis en modo normal - EXIT real
  return { score: 0, tesis: radarThesis, guillotinas: Object.entries(gMap).map(([t,g])=>t+":"+g) };
};


const ANALYST_SYS = `Sos un analista de mercados financieros experto, directo y sin vueltas. Tenes acceso a snapshots diarios del portfolio Las 900 Magnificas de Yahoo Finance. Respondes en espanol rioplatense con ortografia correcta, tildes y enes incluidas siempre, en TODO el texto sin excepcion. NUNCA escribas palabras sin tilde si la necesitan: senales, rotacion, ultimos, analisis, dias, periodo.

INSTRUMENTOS ESPECIALES:
ETFs de bonos (TLT, IEF, SHY, AGG): NO uses P/E ni forward P/E. Los bonos no tienen earnings corporativos. Analiza por yield, duracion y sensibilidad a tasas.
Crypto proxies (MSTR, COIN): NO uses P/Book ni P/E convencional. MSTR cotiza en funcion de su tenencia de Bitcoin y la prima sobre su NAV cripto.
TRAMPAS DE VALOR CRIPTO - REGLA INNEGOCIABLE: Si en el radar aparecen MSTR, COIN o MARA, estas OBLIGADO a ignorar sus metricas de valuacion corporativa (P/E, FWD P/E, ROE, FCF) para fundamentar cualquier recomendacion. No son empresas tradicionales: son proxies macroeconomicos de Bitcoin con distorsion contable estructural por reglas FASB de reconocimiento de criptoactivos. Sus P/E y ROE son artefactos contables, no indicadores de salud empresarial. Si los recomendas, tu tesis debe advertir explicitamente sobre esta distorsion y basarse UNICAMENTE en Momentum (RS 20D), Fuerza Relativa, liquidez del ecosistema cripto y correlacion con BTC. Nunca digas que MSTR es 'barata por valuacion' ni que COIN tiene 'margenes solidos' sin advertir que esos numeros son una ilusion contable.
ETFs de commodities y metales (GLD, SLV, COPX, URA): NO tienen earnings. Analiza por precio del activo subyacente, momentum y contexto macro.
ETFs de indices y benchmarks (SPY, QQQ, XLP, XLU, PSQ, EWZ, FXI): Tratalos como benchmarks sectoriales, no como empresas individuales.
DESACOPLE COMMODITY-ACCION: Al analizar una empresa ligada a un commodity (ej. OXY y WTI, HMY y Oro fisico), esta ESTRICTAMENTE PROHIBIDO justificar un TRIM o ACCUMULATE basandote unicamente en la magnitud de la vela diaria del commodity. El commodity da el contexto macro, pero el timing y la justificacion de la orden deben basarse explicitamente en la variacion_hoy y el RS 20D de la ACCION especifica. Una vela de +7% en el crudo no justifica vender OXY si la accion no reflejo esa misma euforia intradiaria.

ORO Y COMMODITIES - ETIQUETADO OBLIGATORIO: GLD es un ETF que cotiza alrededor de 400-450 USD por accion. El precio spot del oro fisico cotiza alrededor de 4500-5500 USD por onza en 2026. Son instrumentos DISTINTOS con precios DISTINTOS. NUNCA escribas \\"el oro cayo a USD 426\\" porque ese es el precio del ETF GLD, no del oro fisico. La forma correcta: \\"GLD (ETF del oro) cayo X% a USD 426\\"

EMPRESAS QUIMICAS Y MATERIALES: Empresas como DOW Chemical usan derivados del petroleo como MATERIAS PRIMAS, no como producto de venta. Si el petroleo sube, sus costos aumentan y sus margenes se comprimen. NUNCA digas que una empresa quimica se beneficia del alza del crudo.

CALIBRACION DEL VIX: VIX 15-20 = mercado normal. VIX 20-25 = nerviosismo elevado. VIX 25-35 = estres real. VIX 35+ = panico o capitulacion sistemica.

RENDIMIENTO RELATIVO - REGLA MATEMATICA ABSOLUTA: Antes de escribir cualquier seccion sectorial, anota la variacion exacta del S&P500 ese dia y comparas cada sector contra ese numero. Si el S&P cayo -0.25% y XLU cayo -0.41%: XLU cayo MAS que el mercado = UNDERPERFORMANCE. Si el S&P cayo -1.36% y XLU cayo -0.85%: recien ahi XLU tuvo outperformance. Para que un sector muestre outperformance, su variacion DEBE ser MENOR en valor absoluto que la del S&P. Esta regla es innegociable.

ROTACION SECTORIAL: Reserva la palabra rotacion para cuando hay evidencia de flujo neto positivo hacia un sector en multiples sesiones, no solo menor caida relativa en un dia.

BANCOS Y FINANCIERAS: Usa P/BV combinado con ROE como metricas primarias. El P/E es volatil e impreciso para bancos.

DATOS DE ACCIONES ARGENTINAS: Yahoo Finance reporta Book Value incorrecto para acciones argentinas por falta de ajuste inflacionario. Un P/BV mayor a 3x en cualquier banco argentino es casi con certeza un dato invalido. Aplica el mismo escepticismo a GGAL, BMA, BBAR y todas las .BA. No apliques escepticismo selectivo.

TICKERS ARGENTINOS - NUNCA CONFUNDIR: TRAN.BA = Transener (transmision electrica). TGS = Transportadora de Gas del Sur (gas midstream). Son empresas distintas con marcos regulatorios diferentes. XP Inc. (ticker XP) es una empresa BRASILEÑA de servicios financieros, nunca la agrupes con YPF, Galicia o Pampa. B = Barrick Gold, minera de oro, sector Metales/Mineria, nunca agruparla con consumo.

CLASIFICACION GEOGRAFICA - XP NO ES ARGENTINA: XP Inc. es uno de los mayores brokers de Brasil. Nunca la incluyas en analisis del panel argentino.

ASINCRONIA TEMPORAL - REGLA ESTRICTA: Esta regla SOLO aplica entre mercados de distintos husos horarios. Si el Nikkei sube el mismo dia que Wall Street cayo, es inercia del dia anterior de NY. Redaccion correcta: \\"El Nikkei cayendo X% hoy es la reaccion retrasada al desplome de Wall Street de ayer.\\" EXCEPCION CRITICA: Los futuros del WTI y las acciones energeticas de Wall Street (XLE, CVX, OXY, PSX, SLB) cotizan en SIMULTANEO durante la sesion americana. Si el WTI cae hoy y PSX sube hoy, es un desacople contemporaneo real. Explicalo por factores fundamentales: expansion de crack spreads, rotacion institucional hacia Value, o catalizador especifico por empresa. No inventes inercia retrasada entre activos del mismo mercado.

SINCRONIA DEL DXY: El DXY tiene UNA sola direccion en cada sesion. Si el DXY cayo, esa debilidad aplica de forma UNIFORME en el mismo reporte. No podes usar DXY debil para explicar la suba de emergentes y al mismo tiempo usar dolar fuerte para explicar la caida del oro en el mismo documento. Si el oro cayo a pesar de un DXY debil, la explicacion correcta es que otros factores (tasas reales, liquidez, risk-off) dominaron, no que el dolar estaba fuerte.

DXY - INDICE DEL DOLAR: DXY subiendo presiona commodities, LatAm y activos de riesgo. DXY cayendo es viento de cola para commodities y LatAm. La combinacion dolar fuerte + tasas altas es el escenario mas duro para activos de riesgo. Cuando analices PAAS, GLD, OXY, YPF o cualquier LatAm, considera la direccion del DXY.

CREDIT SPREADS: HYG es el ETF de bonos corporativos high yield. LQD es investment grade. Si HYG cae MAS que el S&P500 en un dia de baja, los spreads de credito se estan ampliando - senal de estres real. Si HYG cae menos que el S&P, el mercado de credito esta resistente.

DATOS FALTANTES - MERCADOS DE CREDITO: Si HYG, LQD o TLT no tienen datos de variacion diaria en el snapshot, el estado del credito es DESCONOCIDO. La ausencia de datos NO es evidencia de normalidad. Si no hay datos, escribi exactamente: \\"Estado del credito: DESCONOCIDO por falta de datos en el snapshot.\\" Si tenes web search, busca la variacion del dia de HYG y LQD antes de emitir cualquier conclusion sobre credito.

FCF YIELD VS RIESGO DE REFINANCIACION: En un entorno con tasa a 10 anos en 4.25%+, las empresas con deuda alta y FCF yield bajo son las mas vulnerables. Una empresa con Debt/Equity mayor a 2 y FCF yield menor al 2% que deba refinanciar deuda el proximo ano vera sus ganancias erosionadas. No la incluyas en listas de compra por rebote sin advertir este riesgo.

DATOS FALTANTES DE INDICES - PROTOCOLO OBLIGATORIO: Si el S&P500 o el VIX muestran el mismo valor que el snapshot anterior: (1) Verificar si acciones individuales tienen variaciones nuevas ese dia - si las tienen, Wall Street estuvo abierto y el dato del indice es un artefacto del parser. (2) Si tenes acceso a web search, busca el cierre real del S&P500 y el VIX para esa fecha antes de redactar - es obligatorio, no opcional. (3) Nunca arrastrar datos de indices del dia anterior ni inventar una narrativa de feriado.

TEMPORALIDAD DE COMMODITIES: Cuando analices acciones que dependen de commodities, no mezcles el cierre del commodity de ayer con las variaciones de acciones de hoy como si fueran movimientos simultaneos. Si OXY sube hoy en respuesta al WTI de ayer, decilo explicitamente asi: \\"OXY sube hoy en respuesta al alza del WTI de la sesion anterior.\\"

CONSISTENCIA INTERNA - VIX: El VIX sube cuando aumenta la volatilidad. Si dijiste que el VIX subio, no podes decir en la conclusion que cayo para referirte al mismo dato.

CONSISTENCIA INTERNA - SECTORES: Antes de calificar el movimiento de un activo como atipico, revisa lo que ya escribiste sobre su sector. Si ya dijiste que energia estaba en verde por el WTI, YPF subiendo no es una anomalia sino correlacion directa y previsible.

PROHIBICION DE ANALISIS TECNICO: No tenes acceso a graficos, RSI, MACD, estocastico, Bandas de Bollinger ni ningun indicador tecnico. NUNCA uses estos terminos: sobreventa, sobrecompra, resistencia, soporte, ruptura tecnica, rebote tecnico, recuperacion por sobreventa, rebote estadistico, rebote tecnico estadistico. Si una accion subio tras jornadas de caidas sin catalizador visible, usa exactamente: \\"reversion a la media sin catalizador fundamental visible\\" o \\"variacion positiva sin noticias corporativas identificables.\\" El analisis tecnico lo hace el usuario con TradingView.

REVISION ANTES DE CONCLUIR: Verifica que cada afirmacion de la conclusion sea consistente con los datos citados en el cuerpo del analisis.

TONO PROFESIONAL: Usa lenguaje tecnico-financiero preciso y sobrio. Cuando un dato es invalido, senalalo con frases como \\"dato no confiable\\" o \\"metrica inaplicable para este instrumento.\\"

COMPLETITUD: Siempre terminas las oraciones y los parrafos. Nunca dejes una oracion cortada.

INDICE MOVE - INTERRUPTOR ESTADISTICO DE RIESGO GLOBAL: El Indice MOVE mide la volatilidad implicita de los bonos del Tesoro de EE.UU. Es el VIX del mercado de renta fija. Se declara Estado de Excepcion por shock de liquidez si se cumple CUALQUIERA de estas condiciones: (1) el nivel del MOVE supera 120 puntos nominales, O (2) el Z-Score del MOVE supera +2.5 desviaciones estandar (evento estadistico severo en el mercado de bonos), O (3) el VIX supera 35. El gatillo estadistico (Z > 2.5sigma) reemplaza completamente el umbral de variacion diaria del 8% - ese porcentaje nominal era una heuristica sin base estadistica. En Estado de Excepcion queda ESTRICTAMENTE PROHIBIDO recomendar compras de renta variable basandote en valuaciones baratas o RS 20D positivo. Solo podes sugerir posiciones defensivas extremas (Dolar/DXY, Oro/GLD) o rotacion a liquidez. Cuando reportes el disparador, indica si fue por nivel nominal (MOVE>120), por evento estadistico (MOVE Z>2.5sigma), o por VIX. MOVE Z entre 1.5 y 2.5sigma: estres de credito activo, reducir apetito por riesgo. MOVE Z por debajo de 1.5sigma y nivel por debajo de 100: condiciones normales.

DETECCION DE FASE DEL CICLO MACRO - ARBOL DE DECISION OBLIGATORIO:
El sistema tiene acceso a: spread de curva de rendimientos (^TNX - ^IRX), ratio Cobre/Oro (HG / GC=F), spreads de credito (HYG vs LQD), VIX y DXY.
FASE 1 EXPANSION: Curva positiva y estable + ratio Cu/Au alcista + HYG outperforma LQD + VIX < 18. Sobreponderar XLK, XLY, XLF.
FASE 2 DESACELERACION: Curva aplanandose o invertida + WTI subiendo + ratio Cu/Au lateralizando + VIX saliendo de base. Sobreponderar XLE, materiales, Valor. Reducir growth.
FASE 3 CONTRACCION: Desinversion violenta (bull steepening) + ratio Cu/Au desplomandose + HYG con underperformance severo + VIX > 25 sostenido. Refugio en TLT, DXY, XLP.
FASE 4 RECUPERACION: Curva positiva con pendiente pronunciada + ratio Cu/Au haciendo piso + HYG frenando la sangria + VIX comprimiendo < 20. Comprar rezagados ciclicos, IWM, XLF.
RATIO COBRE/ORO: Si el cobre sube mas rapido que el oro, hay demanda industrial real (expansion). Si el oro vuela y el cobre colapsa, no hay tesis de crecimiento ciclico independientemente de lo que haga el S&P.
CURVA INVERTIDA vs DESINVERSION: La recesion NO ocurre durante la inversion de la curva. Ocurre cuando la curva se DESINVIERTE violentamente porque la Fed recorta en panico (bull steepening). Ese es el momento critico a detectar.

PROTOCOLO DE RIGOR ANALITICO - RESTRICCIONES ESTRUCTURALES:

1. PROYECCION DE ESCENARIOS: Ante cualquier riesgo geopolitico o macro, presentas SIEMPRE ESCENARIO BASE y ESCENARIO DE ESCALADA CRITICA con activos que se benefician y se destruyen en cada caso. No podes analizar un activo sensible a geopolitica o tasas sin hacer esta distincion.

2. TAXONOMIA OBLIGATORIA: Cada recomendacion concreta incluye: HORIZONTE (TRADE CORTO-MOMENTUM o POSICION LARGO-VALOR), TESIS CENTRAL (por que ahora, en una oracion), EVENTO DE INVALIDEZ (dato concreto que te haria salir, ej: salir de PSX si WTI rompe 90 a la baja). Si no podes definir el evento de invalidez, no recomiendes el activo.

3. ADVERTENCIA DE FRAGILIDAD: Prohibido reportar estados de mercado como permanentes. Si el credito resiste mientras el equity cae, marcalo como DIVERGENCIA FRAGIL y define que activo confirmaria el cambio de regimen. Si dos datos se contradicen (Oro cae mientras VIX sube), marcalo como ZONA DE PELIGRO: liquidez forzada.

4. HONESTIDAD BRUTAL: Si no hay piso claro, escribis textualmente: NO HAY ENTRADA SEGURA. Si fundamentos son ok pero el contexto macro invalida, escribis: FUNDAMENTOS OK, CONTEXTO INVALIDA. No suavizas conclusiones negativas.

DETECCION DE FLUJO Y DIVERGENCIAS: Recibes la metrica RS (Fuerza Relativa = Alpha vs S&P 500 en 20 dias). Usala con frialdad. Si un activo lidera por fundamentales pero su RS es fuertemente negativo, denuncialo como DIVERGENCIA DE FLUJO o TRAMPA DE VALOR: el dinero institucional huye a pesar de los numeros. Si la tesis macro y el RS positivo estan alineados, confirma la rotacion de capital hacia ese sector. Evalua el flujo, no hagas analisis tecnico.

DXY Y CONTEXTO ESTRUCTURAL: Para evaluar el impacto del dolar sobre la liquidez global, basate EXCLUSIVAMENTE en el Delta 20D del DXY cruzado con el VIX y el TNX. Si el DXY Delta 20D es fuertemente positivo, el TNX esta subiendo y el VIX muestra estres asimetrico (Z > 1.0 en el motor de ciclo), es drenaje estructural de liquidez global. En ese escenario, los activos de alto beta, emergentes (LatAm) y commodities pierden el beneficio de la duda y deben ser recortados (TRIM/SELL) salvo RS 20D excepcional que demuestre flujo institucional sostenido en contra del viento macro. Una variacion diaria aislada del DXY, sin confluencia con VIX y TNX, no tiene poder de veto sobre ninguna tesis de mediano o largo plazo.\\n\\nPROTOCOLO DE ASIGNACION DE CAPITAL (POSITION SIZING BASADO EN RIESGO):

Cuando sugeris porcentajes de cartera, aplicas estas reglas sin excepcion:

1. LIQUIDEZ COMO POSICION TACTICA PRIMARIA: La liquidez (efectivo/dolares) y los refugios puros (GLD, TLT) no son el residuo que sobra. En entornos de estres son la posicion mayoritaria. Escala obligatoria: VIX 25-30 = 20-30% en liquidez/refugio. VIX 30-35 = 30-40%. VIX 35+ o MOVE > 120 = 50%+ en liquidez y GLD exclusivamente. Si el MOVE esta entre 100-120, alerta sobre la degradacion de liquidez aunque no llegues al maximo de refugio.

2. CASTIGO POR VOLATILIDAD Y ALERTAS: Si en el analisis detectaste que un activo tiene una Advertencia de Fragilidad, una Divergencia de Flujo negativa, o su tesis choca contra el contexto macro (ej. SLV con VIX > 30), su asignacion maxima es PILOT (2-5%). Jamas asignes peso estructural (>10%) a un activo que vos mismo definiste como peligroso o contradictorio en el cuerpo del analisis.

3. CONCENTRACION SECTORIAL: Si recomendes dos activos del mismo sector, adverti explicitamente si su suma supera el 25% del capital total - eso es una apuesta direccional concentrada, no diversificacion. Justifica por que el riesgo sectorial esta controlado o reduci uno de los dos a PILOT.

4. JUSTIFICACION DEL TAMAÑO OBLIGATORIA: Junto a cada porcentaje, incluis una linea de justificacion del tamano. Formato: TICKER: X% (tipo de posicion). Justificacion del tamano: [razon concreta ligada al riesgo o momentum del activo]. Ejemplo: SLV: 3% (PILOT). Justificacion del tamano: alta beta penalizada por VIX en zona de estres. Asignacion minima para contener drawdown.

VETO ESTRUCTURAL - TOLERANCIA CERO: Al redactar la recomendacion operativa final, esta ESTRICTAMENTE PROHIBIDO asignar capital a cualquier activo que en el cuerpo del analisis haya disparado una advertencia critica, una divergencia de flujo negativa, o cuyo riesgo este expuesto al contexto macro actual (ejemplo: recomendar SLV cuando el VIX supera 30 y el MOVE esta en zona de estres). Si un activo fue evaluado como fragil o invalidado por el contexto, su asignacion final es 0%. El porcentaje liberado va a liquidez, a GLD como refugio validado, o se concentra en los activos que si pasaron el filtro. La coherencia entre la advertencia del analisis y la recomendacion final debe ser matematicamente absoluta. No incluyas activos en la cartera final para rellenar.

INTERPRETACION DEL SCORE DEL RADAR (0-100) - REGLAS INNEGOCIABLES:

1. NATURALEZA DEL SCORE: El campo score que recibis por cada activo es un promedio ponderado normalizado de 0 a 100, calculado sobre seis componentes (Valuacion, Piotroski, Z-Score sectorial, Momentum+RS, Riesgo de refinanciacion, Alineacion macro). No es una senal de compra ciega. Un score alto en modo Defensivo frecuentemente significa que la calidad del balance compenso un precio contablemente caro. Un score alto en modo Crecimiento frecuentemente significa momentum fuerte con fundamentals secondarios. Nunca interpretes el numero sin leer los factores.

2. LECTURA OBLIGATORIA DE FACTORES: Estas OBLIGADO a leer el array factores de cada activo antes de emitir cualquier recomendacion. Si un activo tiene score 85 pero incluye el factor "caro vs sector" o "valuacion cara", tu analisis DEBE advertir explicitamente: "El algoritmo lo prioriza por calidad y refugio, pero el precio de entrada esta por encima del rango historico de sus pares directos." Nunca omitas ni minimizes los factores negativos presentes en el payload.

3. CONVERGENCIA Y ASIMETRIA PURA: Si un activo rankea en el Top 5 y sus factores muestran convergencia completa de senales positivas (ej. "valuacion atractiva" + "momentum +" + "Piotroski solido" + "sector alineado"), marcalo como ASIMETRIA PURA y dale prioridad operativa explicita en la recomendacion final.

4. FRAGILIDAD HIBRIDA - MODO MACRO PONDERADO: Cuando el analisis se ejecuta en modo hibrido (Probabilidad Cruzada), un score de 72 puede ser el resultado de 95 en la tesis dominante x 0.70 y 32 en la tesis secundaria x 0.30. Ese activo es FRAGIL ANTE CAMBIO DE REGIMEN: si el entorno macroeconomico gira hacia la tesis secundaria, el score colapsa. Para cualquier activo del modo hibrido, estas OBLIGADO a advertir explicitamente si su score alto depende de la tesis dominante actual o si tiene solidez transversal en multiples escenarios. Un activo que saca 80+ en dos o mas tesis es genuinamente robusto. Un activo que saca 90 en una tesis y es vetado (score 0) en otra debe marcarse como POSICION TACTICA CONDICIONAL, no como posicion estructural.

5. POSITION SIZING - OBLIGATORIO EN TODA RECOMENDACION DE COMPRA: Cuando emitis una orden de compra (BUY, ACCUMULATE, PILOT), el porcentaje de capital es NON-NEGOCIABLE y debe calcularse explicitamente usando los datos del payload. El sistema ya calculo w_final = w_base x L_t para cada activo en seguimiento. Si recibis el campo sizing con wFinal y sigma, usa exactamente ese numero. Si no lo recibis, estima segun estas reglas: activos defensivos (sigma < 1.5% diaria) -> hasta 8-12% del capital a invertir. Activos normales (sigma 1.5-3%) -> 4-7%. Activos de alta volatilidad (sigma > 3%) -> maximo 2-4%. El multiplicador L_t (VIX Z-Score) se aplica multiplicando el peso base: L_t = max(0.2, 1/(1 + max(0, Z_vix))). FORMATO OBLIGATORIO de cada orden: "BUY [TICKER]: Asignar [X]% del capital operativo destinado a nuevas compras. sigma=[Y]% diaria. L_t=[Z] (VIX Z=[W]sigma)." Si L_t < 0.5, advertis explicitamente que el entorno macro fuerza una reduccion estructural de la exposicion.

6. UMBRAL DE VIABILIDAD MINIMA + CADENA DE PENSAMIENTO FORZADA (REGLA FISICA - TOLERANCIA CERO): Ninguna orden de compra puede ejecutarse si su monto estimado en dolares es inferior a USD 15. Por debajo de ese umbral, el spread y las comisiones destruyen el retorno antes de que comience. PASO OBLIGATORIO ANTES DE EMITIR CUALQUIER ORDEN DE COMPRA - sin excepcion: calcula explicitamente "Calculo de friccion: [pct_sugerido]% x [capital_total] USD = [monto_usd] USD". Si [monto_usd] < 15, la orden DEBE ser abortada y reemplazada por "HOLD FORZADO POR FRICCION OPERATIVA: [pct_sugerido]% x [capital_total] USD = [monto_usd] USD < umbral minimo USD 15. Orden anulada." Este calculo debe aparecer en el texto de salida para cada activo donde emitas una orden de compra. Si el payload incluye holdForzado: true o sizing ya calculado, usa esos valores directamente. Si el payload incluye winnerTakesAll: true en un activo y descartado: true en los demas, reportas: "WINNER-TAKES-ALL activado: la paridad de riesgo producia ordenes individuales por debajo de USD 15. Capital consolidado en [TICKER WINNER] con [X]% del capital operativo." Los activos descartados no reciben recomendacion de compra en esa sesion.

7. PROTOCOLO DE SALIDA Y REDUCCION - INVALIDACION MATEMATICA (TOLERANCIA CERO A ANALISIS TECNICO): Las salidas y recortes se rigen EXCLUSIVAMENTE por el Total Score del sistema y el decaimiento de senal (d_t). ESTA ESTRICTAMENTE PROHIBIDO sugerir vender o recortar un activo porque "rompio un soporte", "cruzo una media movil" o por cualquier senal de analisis tecnico grafico. Las unicas causas validas de salida son: (A) Score < 0: tesis invalidada estadisticamente. Orden: LIQUIDAR inmediatamente. Formato obligatorio: "SELL/LIQUIDAR [TICKER]: Tesis invalidada. Score Total = [N] (por debajo de cero). Exposicion recomendada -> 0%." (B) Score en zona HOLD ([0, BUY_THRESHOLD]): decaimiento lineal d_t = score/BUY_THRESHOLD. Recortar (1 - d_t)% de la posicion actual. Si el monto a liquidar < USD 15, suprimir la orden y mantener HOLD. Formato obligatorio: "HOLD/TRIM [TICKER]: Senal estructural deteriorada. Score Total = [N]. d_t = [X] (decaimiento [Y]%). Reducir exposicion actual en [Z]% (nocional USD [M]). Deterioro acumulado bajo erosion controlada." (C) Si el payload reporta decay.suppressed: true, escribis exactamente: "TRIM SUPRIMIDO por friccion operativa: el recorte dictaminado es de USD [M], inferior al umbral minimo de USD 15. Posicion en HOLD hasta que el deterioro acumulado supere el umbral nocional."  

8. REGIMEN MACRO - DATO DURO DEL MOTOR (PROHIBIDO DEDUCIR O ALTERAR): Al inicio del payload encontraras una linea con este formato exacto: [REGIMEN MACRO ESTRICTO APLICADO POR EL MOTOR: ...]. Este dato fue calculado matematicamente por el motor React y es INALTERABLE. Tenes estrictamente PROHIBIDO deducir, cuestionar, reinterpretar o ignorar este regimen. Tu primera linea de respuesta DEBE ser copiar ese regimen exacto, sin modificaciones. Ademas, tenes PROHIBIDO alterar, inventar o modificar la fase (ALZA, ACUM, DIST, BAJA) de los activos provistos en el payload para forzar justificaciones. Las fases son datos del sistema - no los deducis, los lees.

9. REGLA INNEGOCIABLE DE PROTECCION ENERGETICA EN SHOCKS: Si el Regimen Macro Declarado es SHOCK INFLACIONARIO/ENERGETICO, esta estrictamente PROHIBIDO sugerir TRIM o SELL sobre activos del sector Energia (OXY, CVX, XLE, XOM, COP, SLB, HAL, y equivalentes). En shocks energeticos, la energia es HOLD FORZADO como minimo - el RS debil o el ciclo base no pueden anular esta proteccion. Solo podes recortar energia en un shock energetico si hay un circuit_breaker: true explicito en el payload de ese activo especifico, y debes documentarlo.

REGLA DE CAPITAL INNEGOCIABLE: Tenes estrictamente PROHIBIDO asumir, inventar o utilizar capitales teoricos. Debes utilizar unica y exclusivamente el numero exacto que figura en [CAPITAL TOTAL OPERATIVO] al inicio del payload. Si ese numero es USD 1.000, trabajas con USD 1.000. Si es USD 0, no hay capital disponible. Si intentas usar un capital imaginario, el analisis es invalido.

FORMATO: Respondes en texto plano sin ningun tipo de markdown. Sin asteriscos, sin numerales de header, sin guiones como vinetas, sin negritas. Usas MAYUSCULAS para enfasis. Separas secciones con una linea en blanco.
`;

const COLS = [
  {key:"symbol",label:"SYMBOL",align:"left",fmt:v=>v},
  {key:"last_price",label:"PRECIO",fmt:v=>fmt(v)},
  {key:"change_pct",label:"CHG%",fmt:fmtPct,color:pc},
  {key:"_rs",label:"RS 20D",fmt:v=>v==null?"-":Number(v).toFixed(1)+"%",color:pc},
  {key:"change",label:"CHG$",fmt:v=>v==null?"\u2014":(v>0?"+":"")+fmt(v),color:ac},
  {key:"volume",label:"VOL",fmt:fmtVol},
  {key:"market_cap",label:"MKT CAP",fmt:fmtCap},
  {key:"pe_ttm",label:"P/E",fmt:v=>fmt(v)},
  {key:"forward_pe",label:"FWD P/E",fmt:v=>fmt(v)},
  {key:"eps_ttm",label:"EPS TTM",fmt:v=>fmt(v),color:ac},
  {key:"eps_next_yr",label:"EPS NXT",fmt:v=>fmt(v)},
  {key:"target_1yr",label:"1YR TGT",fmt:v=>fmt(v)},
  {key:"price_book",label:"P/BOOK",fmt:v=>fmt(v)},
  {key:"fwd_div_yield_pct",label:"DIV YLD",fmt:v=>v==null?"\u2014":fmt(v)+"%"},
  {key:"_val_score",label:"VAL",fmt:v=>v??"\u2014"},
  {key:"_piotroski",label:"PIOTR",fmt:v=>v!=null?v+"/9":"!",color:v=>v==null?"var(--amber)":v>=7?"var(--green)":v>=4?"var(--amber)":"var(--red)"},
  {key:"_roe",label:"ROE%",fmt:v=>v==null?"\u2014":Number(v).toFixed(1)+"%",color:ac},
  {key:"_op_margin",label:"OP MAR",fmt:v=>v==null?"\u2014":Number(v).toFixed(1)+"%",color:ac},
  {key:"_debt_eq",label:"D/E",fmt:v=>fmt(v)},
  {key:"_refi_risk",label:"REFI",fmt:v=>v?v.label:"-"},
];

const CSS=":root{--green:#00d964;--red:#ff3b5c;--amber:#f59e0b;--blue:#3b9eff;--muted:#5a6478;--text:#c8cfe0;--bg:#0a0b0f;--bg2:#0d0f18;--bg3:#111520;--border:#1e2535;--border2:#252d3d} *{box-sizing:border-box} ::-webkit-scrollbar{width:4px;height:4px;background:#0a0b0f} ::-webkit-scrollbar-thumb{background:#252d3d;border-radius:2px} input::placeholder{color:#3a4259} input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);cursor:pointer} .TR:hover{background:#13182a!important} .TAB:hover{color:var(--text)!important} .STH:hover{color:var(--amber)!important;cursor:pointer} .CB{line-height:1.7;white-space:pre-wrap;word-break:break-word} .SB:hover{background:#1e2535!important;color:var(--text)!important} .DB:hover{color:var(--red)!important} .NB:hover{opacity:0.7!important} .CHIP{display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.04em} .MOV{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center}";

// ─── SNAP STORAGE COMPRESSION ────────────────────────────────────────────────
// Solo afecta la representacion en storage. Los nombres internos NO cambian.
// serializeSnap / deserializeSnap son la unica frontera de compresion.
const TICKER_KEY_MAP = {
  symbol:"s", last_price:"lp", change_pct:"cp", volume:"vo", market_cap:"mc",
  pe_ttm:"pe", forward_pe:"fp", price_book:"pb", div_yield:"dy", eps_ttm:"ep",
  high_52w:"h5", low_52w:"l5", _roe:"ro", _roa:"ra", _op_margin:"om",
  _net_margin:"nm", _fcf_yield:"fy", _ev_ebitda:"ev", _debt_eq:"de",
  _curr_ratio:"cr", _piotroski:"pi"
};
const TICKER_KEY_RMAP = Object.fromEntries(Object.entries(TICKER_KEY_MAP).map(([k,v])=>[v,k]));

const CV_KEY_MAP = {
  vix:"vi", vix_chg:"vc", tnx:"tn", tnx_chg:"tc", irx:"ix", irx_chg:"ic",
  sp500:"sp", sp500_chg:"sc", hyg_chg:"hc", lqd_chg:"lc", gold:"go", gold_chg:"gc",
  wti:"wt", wti_chg:"wc", dxy_chg:"dc", iwm_chg:"iw", xlf_chg:"xf",
  hgf_price:"hp", gcf_price:"gp", move_price:"mp"
};
const CV_KEY_RMAP = Object.fromEntries(Object.entries(CV_KEY_MAP).map(([k,v])=>[v,k]));

const SNAP_KEY_MAP = {
  date:"d", market:"mk", tickers:"t", cycleVars:"cv",
  note:"no", source:"sr", uploaded:"up", risk_calibration:"rc"
};
const SNAP_KEY_RMAP = Object.fromEntries(Object.entries(SNAP_KEY_MAP).map(([k,v])=>[v,k]));

const serializeSnap = (snap) => {
  const out = { _z: 1 };
  for (const [k, v] of Object.entries(snap)) {
    const sk = SNAP_KEY_MAP[k] || k;
    if (k === "tickers" && Array.isArray(v)) {
      out[sk] = v.map(t => {
        const c = {};
        for (const [tk, tv] of Object.entries(t)) c[TICKER_KEY_MAP[tk] || tk] = tv;
        return c;
      });
    } else if (k === "cycleVars" && v && typeof v === "object") {
      const c = {};
      for (const [ck, cv] of Object.entries(v)) c[CV_KEY_MAP[ck] || ck] = cv;
      out[sk] = c;
    } else {
      out[sk] = v;
    }
  }
  return JSON.stringify(out);
};

const deserializeSnap = (jsonStr) => {
  const raw = JSON.parse(jsonStr);
  if (!raw._z) return raw; // formato anterior sin comprimir — backward compat
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "_z") continue;
    const dk = SNAP_KEY_RMAP[k] || k;
    if (dk === "tickers" && Array.isArray(v)) {
      out[dk] = v.map(t => {
        const c = {};
        for (const [tk, tv] of Object.entries(t)) c[TICKER_KEY_RMAP[tk] || tk] = tv;
        return c;
      });
    } else if (dk === "cycleVars" && v && typeof v === "object") {
      const c = {};
      for (const [ck, cv2] of Object.entries(v)) c[CV_KEY_RMAP[ck] || ck] = cv2;
      out[dk] = c;
    } else {
      out[dk] = v;
    }
  }
  return out;
};
// ─────────────────────────────────────────────────────────────────────────────

// -- Tabla reutilizable de bonos (pestana Mercado Argentino) ---------------
// Componente puramente de lectura: no calcula nada del Radar, solo formatea
// lo que ya viene armado en foto_ultima.json.
// ISO yyyy-mm-dd -> DD/MM/AAAA. Los pagos vienen en formato ISO; el resto
// de la app ya muestra vencimientos como DD/MM/AAAA.
const fmtFechaDMY = (iso) => {
  if (!iso) return "\u2014";
  const partes = String(iso).split("-");
  if (partes.length !== 3) return iso;
  const [y, m, d] = partes;
  return d + "/" + m + "/" + y;
};

const riesgoColor = (etiqueta) => etiqueta === "bajo" ? "var(--green)" : etiqueta === "medio" ? "var(--amber)" : etiqueta === "alto" ? "var(--red)" : "var(--muted)";

// -- SITUACION (pestana OPERAR) - traduce el "estado" crudo del motor
// (jerga: "Top 12 Fuerte" / "Hold (Pos N)" / "Vulnerable (Pos N)" / "HOLD")
// a un chip + frase en espanol llano. Por prefijo/patron, textos exactos.
// Fuente de los patrones: motor.py, seccion "ESTADO Y ROTACION".
const situacionInfo = (estado, razon) => {
  if (estado === "HOLD" || razon === "N/A") {
    return { chip: "SIN DATOS HOY", color: "var(--muted)", bg: "var(--bg)", border: "var(--border2)",
      frase: "No aparece en el ranking de hoy por falta de datos. Si persiste varios días, avisar." };
  }
  if (/^Top \d+ Fuerte$/.test(estado || "")) {
    return { chip: "FIRME", color: "var(--green)", bg: "rgba(0,217,100,0.12)", border: "rgba(0,217,100,0.4)",
      frase: "Está entre los 12 mejores del ranking hoy. No hay nada que hacer." };
  }
  let m = /^Hold \(Pos (\d+)\)$/.exec(estado || "");
  if (m) {
    return { chip: "SOSTENIDA (puesto " + m[1] + ")", color: "var(--amber)", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)",
      frase: "Cayó fuera de los 12 mejores, pero la regla de aguante la sostiene mientras no caiga más allá del puesto 20, para no pagar rotaciones por ruido pasajero." };
  }
  m = /^Vulnerable \(Pos (\d+)\)$/.exec(estado || "");
  if (m) {
    return { chip: "EN RIESGO (puesto " + m[1] + ")", color: "var(--red)", bg: "rgba(255,59,92,0.12)", border: "rgba(255,59,92,0.4)",
      frase: "Quedó fuera de la zona de aguante. Si sigue así, el próximo rebalanceo mensual va a proponer venderla." };
  }
  // Patron no reconocido (no deberia pasar segun motor.py) - se muestra tal
  // cual viene, sin inventar una frase.
  return { chip: estado || "—", color: "var(--muted)", bg: "var(--bg)", border: "var(--border2)", frase: null };
};

// -- RAZON (pestana OPERAR) - traduce el texto crudo de motor.py
// ("Score combinado fuerte: X.XX. Calidad: +X.XXZ. LowVol: +X.XXZ.")
// a una frase en espanol llano, a partir de los Z que ya vienen en el texto.
// Devuelve { texto, cruda }: el texto crudo se conserva siempre para el tooltip.
const razonTraducida = (razonCruda) => {
  if (!razonCruda || razonCruda === "N/A") {
    return { texto: "Sin datos de ranking hoy.", cruda: razonCruda || "N/A" };
  }
  const mCal = /Calidad:\s*([+-]?[\d.]+)Z/.exec(razonCruda);
  const mVol = /LowVol:\s*([+-]?[\d.]+)Z/.exec(razonCruda);
  if (!mCal || !mVol) return { texto: razonCruda, cruda: razonCruda };
  const zCal = parseFloat(mCal[1]);
  const zVol = parseFloat(mVol[1]);
  const mScore = /Score combinado fuerte:\s*([+-]?[\d.]+)/.exec(razonCruda);
  const calTxt = zCal >= 1 ? "Calidad contable muy alta" : zCal >= 0 ? "Calidad sana" : "Calidad floja";
  const volTxt = zVol >= 1 ? "volatilidad bien baja" : zVol >= 0 ? "volatilidad moderada" : "volatilidad alta";
  let texto = calTxt + "; " + volTxt;
  if (mScore) texto += " (score " + mScore[1] + ")";
  return { texto, cruda: razonCruda };
};

// Fila de detalle de pagos: se abre al clickear una fila de TablaBonos.
// Puramente de lectura sobre lo que ya viene armado en foto_ultima.json.
function DetallePagos({ it }) {
  const totalC = it.total_a_cobrar;
  const intC = it.cobro_intereses;
  const capC = it.cobro_capital;
  const hayTotal = totalC != null && intC != null && capC != null && totalC > 0;
  const pctInt = hayTotal ? (intC / totalC) * 100 : 0;
  const pctCap = hayTotal ? (capC / totalC) * 100 : 0;
  const cobraDeMenos = totalC != null && it.precio != null && totalC < it.precio;
  return (
    <div style={{fontSize:"11px",color:"var(--text)"}}>
      {cobraDeMenos && (
        <div style={{background:"rgba(255,59,92,0.12)",border:"1px solid rgba(255,59,92,0.4)",borderRadius:"4px",padding:"8px 10px",marginBottom:"10px",color:"var(--red)",fontSize:"10px",fontWeight:700}}>
          OJO: a este precio cobrarias menos de lo que pagas - verificar antes de operar.
        </div>
      )}
      {it.proximo_pago && (
        <div style={{marginBottom:"10px"}}>
          <span style={{color:"var(--amber)",fontWeight:600}}>Proximo pago:</span> {fmtFechaDMY(it.proximo_pago.fecha)}{it.dias_al_proximo_pago!=null?" (en "+it.dias_al_proximo_pago+" dias)":""}: {fmt(it.proximo_pago.interes,2)} de intereses + {fmt(it.proximo_pago.capital,2)} de capital
        </div>
      )}
      {(it.intereses_corridos != null || it.cupon_actual_pct != null) && (
        <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"10px"}}>
          Intereses corridos: {fmt(it.intereses_corridos,2)} - Cupon actual: {fmt(it.cupon_actual_pct,3)}%
        </div>
      )}
      {hayTotal && (
        <div style={{marginBottom:"12px"}}>
          <div style={{fontSize:"10px",marginBottom:"5px"}}>
            Hasta el vencimiento cobrarias un total de {fmt(totalC,2)}: {fmt(intC,2)} de intereses + {fmt(capC,2)} de devolucion de capital.
          </div>
          <div style={{display:"flex",height:"10px",borderRadius:"3px",overflow:"hidden",border:"1px solid var(--border2)"}}>
            <div style={{width:pctInt+"%",background:"var(--blue)"}} title={"Intereses: "+fmt(intC,2)}></div>
            <div style={{width:pctCap+"%",background:"var(--amber)"}} title={"Capital: "+fmt(capC,2)}></div>
          </div>
          <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"5px"}}>
            {it.precio!=null?"Pagas "+fmt(it.precio,2)+" hoy, cobras "+fmt(totalC,2)+" en total.":""}
          </div>
        </div>
      )}
      {it.cronograma && it.cronograma.length > 0 && (
        <div style={{marginBottom:"10px"}}>
          <div style={{fontSize:"9px",color:"var(--muted)",fontWeight:600,letterSpacing:"0.06em",marginBottom:"5px"}}>CRONOGRAMA DE PAGOS</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"10px"}}>
              <thead>
                <tr style={{borderBottom:"1px solid var(--border2)"}}>
                  <th style={{padding:"3px 6px",textAlign:"left",color:"var(--muted)",fontWeight:600}}>FECHA</th>
                  <th style={{padding:"3px 6px",textAlign:"right",color:"var(--muted)",fontWeight:600}}>INTERES</th>
                  <th style={{padding:"3px 6px",textAlign:"right",color:"var(--muted)",fontWeight:600}}>CAPITAL</th>
                  <th style={{padding:"3px 6px",textAlign:"right",color:"var(--muted)",fontWeight:600}}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {it.cronograma.map((p,j) => (
                  <tr key={j} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"3px 6px",color:"var(--text)"}}>{fmtFechaDMY(p.fecha)}</td>
                    <td style={{padding:"3px 6px",textAlign:"right",color:"var(--text)"}}>{fmt(p.interes,2)}</td>
                    <td style={{padding:"3px 6px",textAlign:"right",color:"var(--text)"}}>{fmt(p.capital,2)}</td>
                    <td style={{padding:"3px 6px",textAlign:"right",color:"var(--text)",fontWeight:600}}>{fmt(p.total,2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {(it.detalle_intereses || it.detalle_amortizacion || it.costos_usados) && (
        <div style={{fontSize:"9px",color:"var(--muted)",lineHeight:1.6,borderTop:"1px solid var(--border)",paddingTop:"8px"}}>
          {it.detalle_intereses && <div><span style={{color:"var(--text)",fontWeight:600}}>Intereses:</span> {it.detalle_intereses}</div>}
          {it.detalle_amortizacion && <div style={{marginTop:"4px"}}><span style={{color:"var(--text)",fontWeight:600}}>Amortizacion:</span> {it.detalle_amortizacion}</div>}
          {it.costos_usados && <div style={{marginTop:"4px"}}><span style={{color:"var(--text)",fontWeight:600}}>Costos aplicados:</span> {it.costos_usados}</div>}
        </div>
      )}
    </div>
  );
}

function TablaBonos({ titulo, subtitulo, items, tirLeyenda, tirEsGanaInflacion, mostrarEmisor, emptyText }) {
  const [expandido, setExpandido] = useState(null);
  if (!items || !items.length) {
    if (!emptyText) return null;
    return (
      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px",marginBottom:"16px"}}>
        <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:subtitulo?"4px":"12px"}}>{titulo}</div>
        {subtitulo && <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"12px"}}>{subtitulo}</div>}
        <div style={{color:"var(--muted)",fontSize:"11px"}}>{emptyText}</div>
      </div>
    );
  }
  const itemsOrdenados = [...items].sort((a,b) => (a.riesgo_puntos ?? Infinity) - (b.riesgo_puntos ?? Infinity));
  const nCols = 7 + (mostrarEmisor ? 1 : 0);
  return (
    <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px",marginBottom:"16px"}}>
      <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:subtitulo?"4px":"12px"}}>{titulo}</div>
      {subtitulo && <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"12px"}}>{subtitulo}</div>}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
          <thead>
            <tr style={{background:"var(--bg3)",borderBottom:"1px solid var(--border2)"}}>
              <th style={{padding:"7px 8px",textAlign:"left",color:"var(--muted)",fontSize:"10px"}}>TICKER</th>
              {mostrarEmisor && <th style={{padding:"7px 8px",textAlign:"left",color:"var(--muted)",fontSize:"10px"}}>EMISOR</th>}
              <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>PRECIO</th>
              <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>RENDIMIENTO<br/><span style={{fontWeight:400,fontSize:"8px"}}>{tirLeyenda}</span></th>
              <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>EN EL PERIODO (NETO)<br/><span style={{fontWeight:400,fontSize:"8px"}}>neto de costos, al vencimiento</span></th>
              <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>DURACION<br/><span style={{fontWeight:400,fontSize:"8px"}}>plazo promedio en anios</span></th>
              <th style={{padding:"7px 8px",textAlign:"left",color:"var(--muted)",fontSize:"10px"}}>VENCIMIENTO</th>
              <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>RIESGO<br/><span style={{fontWeight:400,fontSize:"8px"}}>menos = mas tranquilo</span></th>
            </tr>
          </thead>
          <tbody>
            {itemsOrdenados.map((it,i) => {
              const costosComen = it.estado && it.estado.startsWith("OJO: los costos se comen el rendimiento");
              const noOk = it.estado && it.estado !== "ok" && !costosComen;
              const abierta = expandido === it.ticker;
              const filaKey = (it.ticker||"")+i;
              return [
                costosComen && (
                  <tr key={filaKey+"_alerta"} style={{background:"rgba(255,59,92,0.18)"}}>
                    <td colSpan={nCols} style={{padding:"6px 8px",color:"var(--red)",fontWeight:700,fontSize:"10px",borderBottom:"1px solid rgba(255,59,92,0.4)"}}>
                      {it.estado}
                    </td>
                  </tr>
                ),
                <tr key={filaKey} onClick={()=>setExpandido(abierta?null:it.ticker)} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg)":"var(--bg2)",opacity:noOk?0.5:1,cursor:"pointer"}}>
                  <td style={{padding:"5px 8px",color:"var(--amber)",fontWeight:600}}>
                    <span style={{color:"var(--muted)",marginRight:"4px",display:"inline-block",width:"10px"}}>{abierta?"\u25be":"\u25b8"}</span>
                    {it.ticker}
                    {noOk && <div style={{fontSize:"8px",color:"var(--red)",fontWeight:400,marginTop:"2px",marginLeft:"14px"}}>{it.estado}</div>}
                  </td>
                  {mostrarEmisor && <td style={{padding:"5px 8px",color:"var(--muted)"}}>{it.descripcion}</td>}
                  <td style={{padding:"5px 8px",textAlign:"right",color:"var(--text)"}}>{fmt(it.precio,2)}</td>
                  <td style={{padding:"5px 8px",textAlign:"right",color:pc(it.tir_pct)}}>
                    {fmtPct(it.tir_pct)}
                    {tirEsGanaInflacion && it.tir_pct!=null && <div style={{fontSize:"8px",color:"var(--muted)",fontWeight:400}}>le gana a la inflacion por {fmt(it.tir_pct,1)}% anual</div>}
                    {it.tir_neta_aprox_pct!=null && <div style={{fontSize:"8px",color:"var(--muted)",fontWeight:400}}>neta: {fmtPct(it.tir_neta_aprox_pct)}</div>}
                  </td>
                  <td style={{padding:"5px 8px",textAlign:"right",color:pc(it.rendimiento_periodo_neto_pct)}}>
                    {it.rendimiento_periodo_neto_pct!=null ? (
                      <>
                        {fmtPct(it.rendimiento_periodo_neto_pct)}
                        {it.dias_al_vencimiento!=null && <div style={{fontSize:"8px",color:"var(--muted)",fontWeight:400}}>en {it.dias_al_vencimiento} dias</div>}
                      </>
                    ) : "—"}
                  </td>
                  <td style={{padding:"5px 8px",textAlign:"right",color:"var(--text)"}}>{it.duracion_mod!=null?fmt(it.duracion_mod,2):"—"}</td>
                  <td style={{padding:"5px 8px",color:"var(--muted)"}}>{it.vencimiento}</td>
                  <td style={{padding:"5px 8px",textAlign:"right"}}>
                    <span style={{color:riesgoColor(it.riesgo_etiqueta),fontWeight:600,fontSize:"10px",textTransform:"uppercase"}}>{it.riesgo_etiqueta || "sin datos"}</span>
                    <span style={{color:"var(--muted)",fontSize:"9px"}}> ({it.riesgo_puntos!=null?fmt(it.riesgo_puntos,1):"—"})</span>
                    {it.riesgo_estres && <div style={{fontSize:"8px",color:"var(--red)",fontWeight:700,marginTop:"2px"}}>el mercado duda del pago</div>}
                  </td>
                </tr>,
                abierta && (
                  <tr key={filaKey+"_detalle"} style={{background:"var(--bg)"}}>
                    <td colSpan={nCols} style={{padding:"14px 16px",borderBottom:"1px solid var(--border)"}}>
                      <DetallePagos it={it} />
                    </td>
                  </tr>
                )
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, _setTabPub] = useState("dashboard"); const _VETADAS = ["upload","cartera","chat"]; const setTab = (v) => _setTabPub(_VETADAS.includes(v) ? "dashboard" : v);
  const [snapshots, setSnapshots] = useState({});
  const [selDate, setSelDate] = useState(null);
  const [cmpDate, setCmpDate] = useState(null);
  const [upDate, setUpDate] = useState(new Date().toISOString().split("T")[0]);

  // -- ROC 252d History - historial externo para el motor de Dalio ----------
  // Estructura: { spy: [{date, close}], dbc: [{date, close}] }
  // Persistido en storage como "roc:history"
  // -- Dynamic Regime Scores - inyectados desde pipeline Python externo ----
  // Estructura: { "XLE": 95.2, "GLD": 12.5, ... }  (0-100, por simbolo)
  // Si un activo tiene score en este objeto, dicta el 50% del score total del Radar.
  const [dynamicScores, setDynamicScores] = useState({});
  const [dynScoreStatus, setDynScoreStatus] = useState("");

  useEffect(() => {
    window.storage.get("dynamic:scores", true)
      .then(r => { if (r?.value) { try { setDynamicScores(JSON.parse(r.value)); } catch {} } })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });

    window.storage.get("fed_score_fecha", true)
      .then(r => { if (r?.value) { setFedScoreFecha(r.value); } })
      .catch(() => {});

    window.storage.get("cartera_decisor", true)
      .then(r => { if (r?.value) { try { setCarteraDecisorData(JSON.parse(r.value)); } catch {} } })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
  }, []);

  const importDynamicScores = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        setDynScoreStatus("ERROR: el JSON debe ser un objeto llave-valor { \"XLE\": 95.2, ... }");
        return;
      }
      const validated = {};
      let count = 0;
      for (const [k, v] of Object.entries(parsed)) {
        const n = parseFloat(v);
        if (!isNaN(n) && n >= 0 && n <= 100) { validated[k.toUpperCase()] = n; count++; }
      }
      if (count === 0) { setDynScoreStatus("ERROR: ningun par valido encontrado (valores deben ser 0-100)"); return; }
      setDynamicScores(validated);
      await window.storage.set("dynamic:scores", JSON.stringify(validated), true).catch(() => {});
      const dateMatch = file.name.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        setFedScoreFecha(dateMatch[0]);
        window.storage.set("fed_score_fecha", dateMatch[0], true).catch(()=>{});
      } else {
        setFedScoreFecha("");
        window.storage.set("fed_score_fecha", "", true).catch(()=>{});
      }
      setDynScoreStatus(`OK ${count} scores cargados: ${Object.keys(validated).slice(0,8).join(", ")}${count > 8 ? "..." : ""}`);
    } catch (e) {
      setDynScoreStatus("ERROR al parsear JSON: " + e.message);
    }
  };

  // -- Importar cartera_decisor.json (solo presentación, no alimenta cómputos del Radar) --
  const importCarteraDecisora = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.metadata?.fecha_generacion || !Array.isArray(parsed.posiciones_activas)) {
        alert("ERROR: el JSON debe tener metadata.fecha_generacion y posiciones_activas[]");
        return;
      }
      if (parsed.posiciones_activas.length > 0) {
        const p0 = parsed.posiciones_activas[0];
        if (!p0.ticker || p0.cantidad == null) {
          alert("ERROR: cada posición debe tener al menos ticker y cantidad");
          return;
        }
      }
      const envelope = { version: 1, payload: parsed };
      setCarteraDecisorData(envelope);
      await window.storage.set("cartera_decisor", JSON.stringify(envelope), true)
        .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
    } catch (e) {
      alert("ERROR parseando cartera_decisor.json: " + e.message);
    }
  };

  const [rocHistory, setRocHistory] = useState({ spy: [], dbc: [] });

  // -- FRED Macro Regime - Lagging Indicator del pipeline Python ------------
  // Columnas CSV: cuadrante, prob_crecimiento, prob_estanflacion,
  //               prob_defensivo, prob_valor, ewma_gs, ewma_is,
  //               scale_gs, scale_is, timestamp
  const [fredRegime, setFredRegime] = useState(null);
  const [sectorUniverse, setSectorUniverse] = useState(null); // Universo de referencia sectorial fijo (JSON externo)
  const [ivwDiagnostics, setIvwDiagnostics] = useState(null); // Diagnosticos IVW de la ultima sesion
  const [fedScoreFecha, setFedScoreFecha] = useState(''); // Fecha de descarga del feed AQR externo
  const [capitalBase, setCapitalBase] = useState(10000); // Capital total en USD para volatility targeting
  const [universeStatus, setUniverseStatus] = useState(""); // estado visible de carga del universo
  const [showAllTickers, setShowAllTickers] = useState(false);
  const earningsStorageRef = React.useRef({}); // earnings persistidos entre sesiones
  const [fredImportStatus, setFredImportStatus] = useState("");

  useEffect(() => {
    window.storage.get("fred:regime", true)
      .then(r => { if (r?.value) { try { setFredRegime(JSON.parse(r.value)); } catch {} } })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
  }, []);

  const importFredCSV = async (file) => {
    if (!file) return;
    try {
      const text  = await file.text();
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setFredImportStatus("ERROR: archivo vacio o sin datos"); return; }
      const header = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/"/g,""));
      const idx = (col) => header.findIndex(h => h.includes(col));
      const iCuad  = idx("cuadrante"), iCrec = idx("crecimiento"), iEst = idx("estanflacion");
      const iDef   = idx("defensivo"),  iVal  = idx("valor");
      const iTs    = idx("timestamp"),  iEGS  = idx("ewma_gs"),    iEIS = idx("ewma_is");
      const iSGS   = idx("scale_gs"),   iSIS  = idx("scale_is");
      if (iCuad < 0 || iCrec < 0) { setFredImportStatus("ERROR: columnas requeridas no encontradas (cuadrante, prob_crecimiento)"); return; }
      // Leer ultima fila con datos (la mas reciente)
      const lastLine = lines[lines.length - 1].split(",").map(v => v.trim().replace(/"/g,""));
      const parsed = {
        cuadrante:        lastLine[iCuad]  || "desconocido",
        prob_crecimiento: parseFloat(lastLine[iCrec])  || 0,
        prob_estanflacion:parseFloat(lastLine[iEst])   || 0,
        prob_defensivo:   parseFloat(lastLine[iDef])   || 0,
        prob_valor:       parseFloat(lastLine[iVal])   || 0,
        ewma_gs:          iEGS >= 0 ? parseFloat(lastLine[iEGS])  : null,
        ewma_is:          iEIS >= 0 ? parseFloat(lastLine[iEIS])  : null,
        scale_gs:         iSGS >= 0 ? parseFloat(lastLine[iSGS]) : null,
        scale_is:         iSIS >= 0 ? parseFloat(lastLine[iSIS]) : null,
        timestamp:        iTs  >= 0 ? lastLine[iTs] : new Date().toISOString().slice(0,10),
        rows:             lines.length - 1,
      };
      setFredRegime(parsed);
      await window.storage.set("fred:regime", JSON.stringify(parsed), true).catch(() => {});
      setFredImportStatus(`OK FRED cargado: ${parsed.cuadrante.toUpperCase()} | ${parsed.rows} observaciones | ${parsed.timestamp}`);
    } catch (e) {
      setFredImportStatus("ERROR al procesar CSV: " + e.message);
    }
  };
  const [rocImportStatus, setRocImportStatus] = useState("");

  useEffect(() => {
    window.storage.get("roc:history", true)
      .then(r => { if (r?.value) { try { setRocHistory(JSON.parse(r.value)); } catch {} } })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
  }, []);

  const importRocCSV = async (file, symbol) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      const header = lines[0].toLowerCase();
      const dateIdx  = header.split(",").findIndex(h => h.includes("date") || h.includes("fecha"));
      const closeIdx = header.split(",").findIndex(h => h.includes("close") || h.includes("cierre") || h.includes("adj"));
      if (dateIdx < 0 || closeIdx < 0) { setRocImportStatus("ERROR: el CSV debe tener columnas Date y Close (o Fecha/Cierre)"); return; }
      const rows = lines.slice(1).map(l => {
        const cols = l.split(",");
        const raw = cols[dateIdx]?.trim().replace(/"/g, "");
        const close = parseFloat(cols[closeIdx]?.trim().replace(/"/g, "").replace(",", "."));
        if (!raw || isNaN(close)) return null;
        // Normalizar fecha a YYYY-MM-DD
        let date = raw;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) { // MM/DD/YYYY
          const [m,d,y] = raw.split("/"); date = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) { // YYYY/MM/DD
          date = raw.replace(/\//g, "-");
        }
        return { date, close };
      }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

      if (rows.length < 100) { setRocImportStatus(`ERROR: solo ${rows.length} filas - minimo 100 para ser util`); return; }

      const key = symbol.toLowerCase() === "spy" ? "spy" : "dbc";
      const updated = { ...rocHistory, [key]: rows };
      setRocHistory(updated);
      await window.storage.set("roc:history", JSON.stringify(updated), true).catch(() => {});
      const spyDays = updated.spy.length, dbcDays = updated.dbc.length;
      const ready = spyDays >= 252 && dbcDays >= 252;
      setRocImportStatus(`OK ${key.toUpperCase()}: ${rows.length} registros cargados (${rows[0].date} -> ${rows[rows.length-1].date}). ${ready ? "Motor ROC 252d ACTIVO." : `Faltan datos: SPY=${spyDays} DBC=${dbcDays} (necesitas >=252 de cada uno).`}`);
    } catch (e) {
      setRocImportStatus("ERROR al procesar CSV: " + e.message);
    }
  };
  const [upNote, setUpNote] = useState("");
  const [files, setFiles] = useState({csv:null});
  const csvRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [upStatus, setUpStatus] = useState("");
  const [sortKey, setSortKey] = useState("change_pct");
  const [sortDir, setSortDir] = useState("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatIn, setChatIn] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [pinOk, setPinOk] = useState(false);
  const [pinIn, setPinIn] = useState("");
  const [pinErr, setPinErr] = useState(false);
  const [fmpData, setFmpData] = useState({});
  const [hyps, setHyps] = useState([]);
  const [hypIn, setHypIn] = useState({s1:"",s2:"",label:""});
  const [dcplAnalysis, setDcplAnalysis] = useState({});
  const [dcplLoading, setDcplLoading] = useState({});
  const [newsModal, setNewsModal] = useState(null);
  const [exportJson, setExportJson] = useState("");
  const [exportTitle, setExportTitle] = useState("EXPORTAR");

  // Estado de histeresis: persiste entre renders del mismo snapshot
  const prevHystScores = useRef({});  // useRef: actualizacion sincrona sin re-render

  const exportarScoresCSV = () => {
    const scoredList = masterScores?.scored ?? [];
    if (!scoredList.length) {
      alert("Sin datos de score - carga el CSV del dia primero.");
      return;
    }
    const fecha  = selDate || "sin-fecha";
    // Construir lookup de Radar scores (post-fusion IVW) para el join
    const radarScoreMap = {};
    radarScores.forEach(t => {
      if (t._radar?.score != null) radarScoreMap[t.symbol] = t._radar.score;
    });
    const header = "Fecha,Ticker,masterPct,masterPctRaw,masterPctSmoothed,penaltyApplied,rs21,roc21,vol21,radarScore,radarSector";
    const rows   = scoredList.map(t =>
      [
        fecha,
        t.symbol,
        t.masterPct           != null ? t.masterPct.toFixed(1)         : "",
        t.masterPctRaw        != null ? t.masterPctRaw.toFixed(1)      : "",
        t.masterPctSmoothed   != null ? t.masterPctSmoothed.toFixed(2) : "",
        t.penaltyApplied      != null ? t.penaltyApplied.toFixed(2)    : "",
        t.rs21                != null ? t.rs21.toFixed(4)               : "",
        t.roc21               != null ? t.roc21.toFixed(4)              : "",
        t.vol21               != null ? t.vol21.toFixed(6)              : "",
        radarScoreMap[t.symbol] != null ? radarScoreMap[t.symbol].toFixed(1) : "",
        radarScores.find(r => r.symbol === t.symbol)?._radar?.sector ?? "",
      ].join(",")
    );
    const csv  = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Magnificas_Scores_${fecha.replace(/-/g, "")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const [heatmapMode, setHeatmapMode] = useState("1d");
  const [arbOpen, setArbOpen] = useState(false);
  const [arbMEP, setArbMEP] = useState("");
  const [arbARS, setArbARS] = useState("");
  const [arbUSD, setArbUSD] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [radarThesis, setRadarThesis] = useState("stagflacion");
  const [moveIndex, setMoveIndex] = useState(null);
  const [moveChange, setMoveChange] = useState(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  // -- Actualizacion en segundo plano (snapshots / mercado argentino) --------
  // Estado crudo de GET /api/estado_actualizacion, mensajes de resultado y
  // salida de consola para el detalle plegable en caso de error.
  const [jobEstado, setJobEstado] = useState({});
  const [jobMsg, setJobMsg] = useState({ snapshots: "", mercado_argentino: "" });
  const [jobErrSalida, setJobErrSalida] = useState({ snapshots: null, mercado_argentino: null });

  // -- Pestanas de lectura: Mercado Argentino y Prima CEDEAR -----------------
  // Leen archivos propios via fetch. No tocan snapshots, telemetria ni Radar.
  const [mercadoFoto, setMercadoFoto] = useState(null);
  const [mercadoFotoErr, setMercadoFotoErr] = useState(null);
  const [mercadoFotoLoading, setMercadoFotoLoading] = useState(false);
  const [mepHist, setMepHist] = useState([]);
  const [mepHistErr, setMepHistErr] = useState(null);
  const [mostrarReglaRiesgo, setMostrarReglaRiesgo] = useState(false);

  const [primaRows, setPrimaRows] = useState([]);
  const [primaErr, setPrimaErr] = useState(null);
  const [primaLoading, setPrimaLoading] = useState(false);
  const [primaEmpty, setPrimaEmpty] = useState(false);
  const [primaFiltro, setPrimaFiltro] = useState("todos"); // todos | operables | pocoliquidos
  const [primaOrden, setPrimaOrden] = useState({ campo: "nombre", direccion: "asc" }); // nombre | prima | spread

  // -- OPERAR: pantalla de operaciones del motor defensivo -------------------
  const [operarResultado, setOperarResultado] = useState(null);
  const [operarResultadoErr, setOperarResultadoErr] = useState(null);
  const [operarEstadoCartera, setOperarEstadoCartera] = useState(null);
  const [operarEstadoCarteraErr, setOperarEstadoCarteraErr] = useState(null);
  const [operarLoading, setOperarLoading] = useState(false);
  const [operarRazonAbierta, setOperarRazonAbierta] = useState({});
  const [capitalInput, setCapitalInput] = useState("");
  const [capitalMsg, setCapitalMsg] = useState("");
  const [capitalSaving, setCapitalSaving] = useState(false);
  const [capitalEditando, setCapitalEditando] = useState(false);
  const [correccionMsg, setCorreccionMsg] = useState(null);
  const [correccionEnviando, setCorreccionEnviando] = useState(false);
  const [motorResaltado, setMotorResaltado] = useState(false);
  const [corregirAbierto, setCorregirAbierto] = useState({});
  const [declararInput, setDeclararInput] = useState("");
  const [compreOtraAbierto, setCompreOtraAbierto] = useState({});
  const [rankingHoyAbierta, setRankingHoyAbierta] = useState(false);
  const [rearmarConfirmando, setRearmarConfirmando] = useState(false);
  const [explicacionOperarAbierta, setExplicacionOperarAbierta] = useState(false);
  const [comoLeerAbierta, setComoLeerAbierta] = useState(false);
  const [cuchilloFilas, setCuchilloFilas] = useState([]);
  const [cuchilloSnapshotDate, setCuchilloSnapshotDate] = useState(null);
  const [cuchilloCargando, setCuchilloCargando] = useState(false);
  const [cuchilloErr, setCuchilloErr] = useState(null);

  // -- Consulta puntual de CEDEAR (candidatos pre-compra) --------------------
  // Independiente del CSV diario: no toca primaRows ni se persiste.
  const [consultaTickers, setConsultaTickers] = useState("");
  const [consultaEstado, setConsultaEstado] = useState(null);
  const [consultaMsg, setConsultaMsg] = useState("");
  const [consultaResultado, setConsultaResultado] = useState(null);
  const [consultaResultadoErr, setConsultaResultadoErr] = useState(null);
  // Lista de codigos BYMA validos (claves de ratios_cedears.json) para
  // autocompletar mientras el usuario escribe. Ya no hace falta que sepa
  // el codigo exacto de memoria - elige de la lista o sigue escribiendo.
  const [tickersConocidos, setTickersConocidos] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  // -- Histeresis Dual del Radar ----------------------------------------------
  // radarTracked: Set de simbolos en seguimiento activo.
  // BUY:  score > RADAR_BUY_THRESHOLD  -> nuevo ingreso al radar
  // HOLD: score entre RADAR_HOLD_MIN y RADAR_BUY_THRESHOLD -> permanece sin nueva senal
  // EXIT: score < RADAR_HOLD_MIN -> sale del seguimiento (TRIM/SELL implicito)
  const RADAR_BUY_THRESHOLD = 80;  // umbral de alta conviccion para entrada
  const RADAR_HOLD_MIN      = 55;  // umbral de salida - debe deteriorarse significativamente
  const [radarTracked, setRadarTracked] = useState(new Map()); // symbol -> { score, entryDate, thesis }

  // Cargar radarTracked desde storage al arranque
  useEffect(() => {
      // Restaurar universo sectorial desde storage
      window.storage.get('sector_universe_ref:data', false)
        .then(stored => {
          if (stored?.value) {
            try {
              const data = JSON.parse(stored.value);
              if (data?.sectores) {
                setSectorUniverse(data);
                console.log('[STORAGE] Universo sectorial restaurado:', Object.keys(data.sectores).length, 'sectores');
              }
            } catch(e) { console.warn('[UNIVERSO] Error parseando storage:', e.message); }
          }
        })
        .catch(e => { if (!e?.message?.includes('404')) console.warn('[UNIVERSO] restore:', e.message); });

      // Restaurar earnings desde storage separado (sin await - useEffect no async)
      window.storage.get("earnings:data", false)
        .then(ed => { const n = ed?.value ? Object.keys(JSON.parse(ed.value)||{}).length : 0; console.log("[STORAGE LOAD] earnings:data:", n ? n+" tickers" : "VACIO"); if (ed?.value) { try { earningsStorageRef.current = JSON.parse(ed.value); } catch {} } })
        .catch(e => { if (!e?.message?.includes("404")) console.warn("[EARNINGS] restore:", e.message); });

    window.storage.get("radar:tracked", true)
      .then(r => { if (r?.value) { try { setRadarTracked(new Map(JSON.parse(r.value))); } catch {} } })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
  }, []);

  const saveRadarTracked = async (newMap) => {
    setRadarTracked(newMap);
    try { await window.storage.set("radar:tracked", JSON.stringify([...newMap]), true); } catch {}
  };

  // Actualizar radarTracked segun scores actuales del radar
  // Se llama automaticamente cuando radarScores cambia
  const updateRadarTracked = (scores) => {
    if (!scores || scores.length === 0) return;
    setRadarTracked(prev => {
      const next = new Map(prev);
      const today = new Date().toISOString().slice(0, 10);
      // Entradas nuevas: supera el umbral BUY y no esta tracked
      for (const t of scores) {
        if (t._radar.score >= RADAR_BUY_THRESHOLD && !next.has(t.symbol)) {
          next.set(t.symbol, { score: t._radar.score, entryDate: today, thesis: radarThesis });
        }
        // Actualizar score del tracked si ya estaba
        if (next.has(t.symbol)) {
          const entry = next.get(t.symbol);
          next.set(t.symbol, { ...entry, score: t._radar.score });
        }
      }
      // Salidas del tracking:
      // - score < 0: SELL inmediato - tesis invalidada, salida de emergencia
      // - score < RADAR_HOLD_MIN: deterioro suficiente, salir del seguimiento
      for (const [sym, entry] of next) {
        const current = scores.find(t => t.symbol === sym);
        const currentScore = current?._radar?.score ?? 0;
        if (currentScore < 0) {
          // Marcar como sellImmediate antes de eliminar para que la UI lo muestre brevemente
          next.set(sym, { ...entry, score: currentScore, sellImmediate: true });
        } else if (currentScore < RADAR_HOLD_MIN) {
          // No eliminar inmediatamente - marcar como exitPending para que la UI
          // muestre el badge EXIT y el operador pueda ver la senal antes de confirmar
          next.set(sym, { ...entry, score: currentScore, exitPending: true });
        }
      }
      // Persistir si hubo cambios
      if (next.size !== prev.size || [...next.keys()].some(k => !prev.has(k))) {
        window.storage.set("radar:tracked", JSON.stringify([...next]), true).catch(() => {});
      }
      return next;
    });
  };

  // -- CARTERA --
  const [portfolio, setPortfolio] = useState([]);
  const [liquidezUSD, setLiquidezUSD] = useState(0);
  // -- Cartera Decisor (JSON externo, solo presentación) ---------------------
  // null = no cargado; cuando cargado: { version: 1, payload: {metadata, posiciones_activas} }
  const [carteraDecisorData, setCarteraDecisorData] = useState(null);
  // -- Capital Base para el position sizing del Master Score Top 5 ----------
  const [masterCapital, setMasterCapital] = useState(10000);

  // -- Retention Buffer - activos actualmente en cartera del usuario ---------
  // currentHoldings: Set<symbol> - los activos marcados reciben inmunidad Top 10
  const [currentHoldings, setCurrentHoldings] = useState(new Set());
  useEffect(() => {
    window.storage.get("master:holdings", true)
      .then(r => { if (r?.value) { try { setCurrentHoldings(new Set(JSON.parse(r.value))); } catch {} } })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
  }, []);
  const toggleHolding = (symbol) => {
    setCurrentHoldings(prev => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      window.storage.set("master:holdings", JSON.stringify([...next]), true).catch(() => {});
      return next;
    });
  };
  // -- Modulo de Rebalanceo --------------------------------------------------
  // tenenciaActual: { [symbol]: usd } - ingresado por el usuario
  // rebalanceDismissed: { [symbol]: targetUSD } - descartado mientras el target no cambie
  const [tenenciaActual, setTenenciaActual] = useState({});
  const [rebalanceDismissed, setRebalanceDismissed] = useState({});
  useEffect(() => {
    window.storage.get("master:capital", true)
      .then(r => { if (r?.value) { const n = parseFloat(r.value); if (!isNaN(n) && n > 0) setMasterCapital(n); } })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
  }, []);
  const [portForm, setPortForm] = useState({ticker:"",tipo:"ORIGINAL",ratio:1,cantidad:"",precioEntrada:""});
  const [editingId, setEditingId] = useState(null); // null = agregar nuevo, id = editar existente
  const [portAudit, setPortAudit] = useState("");
  const [portAuditing, setPortAuditing] = useState(false);

  const RISK_MANAGER_SYS = "Actuas como Gestor de Riesgos institucional de una cartera real. Recibis posiciones normalizadas cruzadas con metricas de mercado actuales y las probabilidades del ciclo macroeconomico detectadas por el sistema. Tu objetivo es emitir veredictos operativos graduales que reflejen como los ciclos reales se insinuan paulatinamente, nunca de golpe. Respondes en espanol rioplatense, texto plano sin markdown, sin asteriscos. MAYUSCULAS para enfasis. Separas posiciones con linea en blanco.\n\nMATRIZ DE 5 MARCHAS (reemplaza el modelo binario HOLD/SELL):\n\nACCUMULATE - Tesis dominante confirmada + RS 20D positivo y creciente (>+3%) + fase ALZA o ACUM + pct_capital_total por debajo del techo de concentracion. Sumar entre 3% y 5% adicional a una posicion existente o a un PILOT exitoso. Nunca mas de 7% en una sola sesion.\n\nHOLD - Tesis vigente, RS positivo moderado (0% a +3%), posicion en peso apropiado. No tocar.\n\nTRIM - RS 20D virando (positivo pero decreciente, o entre -3% y 0%) O posicion sobreponderada (>30% del capital) O tesis empezando a perder momentum. Recorta entre 5% y 10% de la posicion. Nunca mas de 10% en una sola sesion - toda liquidacion se hace en tramos.\n\nSELL - Tesis completamente invalidada: RS 20D < -5% sostenido, fase BAJA o DIST, P&L negativo con deterioro acelerado, o evento de invalidez macroeconomica (VIX > 35 sostenido, MOVE > 120). Liquidacion total justificada, pero si la posicion supera el 15% del capital, ejecutala en 2 tramos de TRIM antes del SELL final.\n\nPILOT - Insinuacion temprana de una nueva tesis. Posicion inicial estricta del 2% al 3% para testear liquidez o momentum. Si el pilot se confirma, pasas a ACCUMULATE (+3% a +5%). Defini obligatoriamente el evento de invalidez.\n\nREGLAS DE ESCALONAMIENTO ANTI-WHIPSAW (INNEGOCIABLES):\n1. LIMITE DE VELOCIDAD: Queda PROHIBIDO ordenar transiciones que muevan mas del 7% del capital total hacia o desde un solo activo en una misma sesion. Si un activo tiene 0% y requiere asignacion estructural, la orden maxima inicial es 5% a 7% (Fase 1). Si tiene 35% y debe liquidarse, el TRIM no puede recortar mas de 10% por sesion.\n2. CONSTRUCCION ESCALONADA DE REFUGIOS: En regimenes de estres (VIX > 35 o MOVE > 120), las compras de refugio (GLD, efectivo) que superen la primera escala (ej. pasar de 15% a 30% en GLD) deben construirse en bloques del 5% diario MIENTRAS el indicador se mantenga en zona de estres. Adverti explicitamente esto en cada recomendacion de refugio masivo.\n3. Los ciclos no cambian de un dia para otro. Si el regimen cambio hace menos de 3 sesiones, tratalo como senal provisional y usa PILOT o TRIM parcial, no SELL total.\n\nCRITERIOS DE ESCALAMIENTO OBLIGATORIOS:\n- RS 20D > +5%: candidato a ACCUMULATE\n- RS 20D entre 0% y +5%: HOLD o TRIM segun peso y fase\n- RS 20D entre -3% y 0%: TRIM obligatorio si fase es DIST\n- RS 20D < -5%: SELL salvo contexto macro excepcional documentado\n- pct_capital_total > 30%: TRIM para reducir concentracion aunque RS sea positivo\n- pct_capital_total > 50%: TRIM urgente, concentracion critica\n\nPONDERACION PROBABILISTICA DEL CICLO:\nSi recibis las probabilidades del ciclo (ej: Expansion 60%, Desaceleracion 30%, Contraccion 10%), evalua si la composicion de la cartera refleja esa distribucion. Las rotaciones deben ser siempre graduales usando TRIM y PILOT, salvo que se dispare el interruptor de panico (MOVE > 120 o VIX > 35 sostenido).\n\nREGLA DE CAPITAL INNEGOCIABLE: Tenes estrictamente PROHIBIDO asumir, inventar o utilizar capitales teoricos. Debes utilizar unica y exclusivamente el numero exacto que figura en [CAPITAL TOTAL OPERATIVO] al inicio del payload. Si ese numero es USD 1.000, trabajas con USD 1.000. Si es USD 0, no hay capital para operar. Si intentas usar un capital imaginario, el analisis es invalido.\n\nDATO DURO DE REGIMEN - PRIMERA LINEA DE RESPUESTA OBLIGATORIA:\nAl inicio del payload encontraras: [REGIMEN MACRO ESTRICTO APLICADO POR EL MOTOR: ...]. Copia esa linea exacta como primera linea de tu respuesta. PROHIBIDO deducir, alterar o ignorar ese dato. PROHIBIDO modificar la fase (ALZA, ACUM, DIST, BAJA) de los activos del payload.\n\nREGLA INNEGOCIABLE: Si el Regimen del Motor es SHOCK ENERGETICO/INFLACIONARIO, esta PROHIBIDO emitir TRIM o SELL sobre activos del sector Energia. Veredicto minimo: HOLD FORZADO ENERGIA. Solo excepcion: circuit_breaker: true explicito en el payload del activo.\n\nFORMATO OBLIGATORIO POR POSICION:\nTICKER - [MARCHA]\nFundamento: [dato especifico del payload que justifica la marcha]\nCalculo de friccion: [pct_sugerido]% x [capital_total] USD = [monto_usd] USD -> si monto_usd < 15 USD: HOLD FORZADO POR FRICCION OPERATIVA, orden anulada.\nAccion: [que hacer exactamente, con porcentaje concreto y tramo si aplica]\nInvalidez: [dato concreto que cambiaria la marcha]\n\nAL FINAL: parrafo de sintesis con (1) alineacion de la cartera al ciclo detectado, (2) riesgo de concentracion, (3) direccion de rotacion recomendada en los margenes.\n\nRESTRICCIONES INNEGOCIABLES:\n- Ignora cualquier factor local argentino (tipo de cambio, brecha, cepo). El analisis es en dolares sobre el subyacente.\n- No uses analisis tecnico de graficos. Solo los datos que te pasaron.\n- Si una posicion no tiene RS ni Fase, decilo: DATO INSUFICIENTE - usar precio y P&L como proxy.\n- No suavices veredictos negativos. Si hay que vender, decilo sin rodeos.\n- Nunca recomendes ACCUMULATE en una posicion con pct_capital_total > 40%.\n- INDICE MOVE - OVERRIDE GLOBAL ESTADISTICO: El Estado de Excepcion se activa si MOVE > 120 (nivel nominal) O MOVE Z-Score > 2.5sigma (evento estadistico severo - equivale a un shock de mas de 2.5 desviaciones estandar en el mercado de bonos). La variacion diaria del 8% como umbral quedo eliminada - era heuristica sin base estadistica. En Estado de Excepcion todas las marchas se colapsan a SELL para activos de beta alto y HOLD/TRIM para refugios. Indica el disparador activo: nivel nominal o evento Z-Score.\n- EVALUACION DE SENSORES MACRO CON Z-SCORES: En tu payload recibiras un objeto 'macroSensors' con el Z-score estadistico de los pilares macroeconomicos (VIX, curva de tasas, Cu/Au, IWM relativo). Ignora el valor nominal. Si el Z-score de un sensor esta entre -0.5 y +0.5, clasificalo como RUIDO y omitilo en tu justificacion. Si el Z-score supera +/-1.0 con senal CAMBIO ESTRUCTURAL, usalo como fundamento innegociable para justificar operaciones de TRIM o ACCUMULATE. El campo 'confidence_coef' indica la confianza estadistica segun el historial disponible (0.25 = muestra minima, 1.0 = muestra completa) - penaliza la firmeza de tus veredictos si confidence_coef < 0.6- CIRCUIT BREAKER ESTADISTICO POR POSICION: Si una posicion llega con 'circuit_breaker: true', significa que su caida diaria supero -2 desviaciones estandar de su propia volatilidad historica - un evento de ruptura estructural para ESE activo especifico. En ese caso anulas cualquier inercia de fase, cooldown o gradualismo. La marcha maxima permitida es TRIM (nunca HOLD ni ACCUMULATE). Reporta el nivel sigma del evento: 'sigma_event' indica cuantas desviaciones estandar fue la caida (ej: -2.4sigma). Diferencia explicitamente este override de una caida dentro del ruido normal del activo.\n"
;
  const [radarAnalysis, setRadarAnalysis] = useState("");
  const [radarAnalyzing, setRadarAnalyzing] = useState(false);
  const [radarSelected, setRadarSelected] = useState(new Set());
  const [radarSectorFilter, setRadarSectorFilter] = useState("TODOS");
  const [newsLoading, setNewsLoading] = useState(false);
  const chatEnd = useRef(null);

  useEffect(() => {
    load().then(() => {
      // Si despues de cargar no hay snapshots ni cartera, mostrar modal de restauracion
      setSnapshots(prev => {
        if (Object.keys(prev).length === 0) {
          /* modal de restauración desactivado en el tablero público */;
        }
        return prev;
      });
    });
  }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({behavior:"smooth"}); }, [chatMsgs]);

  // Carga inicial de la cartera desde storage
  useEffect(() => {
    window.storage.get("portfolio:v1", true)
      .then(r => { if (r) setPortfolio(JSON.parse(r.value)); })
      .catch(() => {});
    window.storage.get("portfolio:cash", true)
      .then(r => { if (r) setLiquidezUSD(Number(r.value) || 0); })
      .catch(e => { if (!e?.message?.includes("404")) console.warn("[STORAGE]", e.message); });
  }, []);

  const savePortfolio = async (newPort) => {
    setPortfolio(newPort);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Storage timeout")), 3000));
      await Promise.race([window.storage.set("portfolio:v1", JSON.stringify(newPort), true), timeout]);
    } catch(e) {
      // Storage fallo - la cartera vive solo en RAM esta sesion
      console.warn("Portfolio storage error:", e.message);
    }
  };

  const saveLiquidez = async (val) => {
    const n = Math.max(0, Number(val) || 0);
    setLiquidezUSD(n);
    try { await window.storage.set("portfolio:cash", String(n), true); } catch {}
  };

  const addPosition = () => {
    const t = portForm.ticker.trim().toUpperCase();
    if (!t || !portForm.cantidad || !portForm.precioEntrada) return;
    const ratio = portForm.tipo === "ORIGINAL" ? 1 : Number(portForm.ratio) || 1;
    const precioLocal = Number(portForm.precioEntrada);
    const precioSubyacente = precioLocal * ratio;
    const cantNueva = Number(portForm.cantidad);

    if (editingId !== null) {
      // Modo edicion: sobrescribir la posicion existente manteniendo el id
      const updated = portfolio.map(p => p.id === editingId
        ? { ...p, cantidad: cantNueva, precioEntrada: precioLocal, precioSubyacente, ratio, tipo: portForm.tipo }
        : p
      );
      savePortfolio(updated);
      setEditingId(null);
    } else {
      // Modo agregar: consolidar si el ticker ya existe (promedio ponderado)
      const existing = portfolio.find(p => p.ticker === t);
      if (existing) {
        const cantTotal = existing.cantidad + cantNueva;
        const precioPromedio = ((existing.cantidad * existing.precioEntrada) + (cantNueva * precioLocal)) / cantTotal;
        const precioSubyacentePromedio = precioPromedio * ratio;
        const updated = portfolio.map(p => p.ticker === t
          ? { ...p, cantidad: cantTotal, precioEntrada: precioPromedio, precioSubyacente: precioSubyacentePromedio }
          : p
        );
        savePortfolio(updated);
      } else {
        const pos = { id: Date.now(), ticker: t, tipo: portForm.tipo, ratio, cantidad: cantNueva, precioEntrada: precioLocal, precioSubyacente };
        savePortfolio([...portfolio, pos]);
      }
    }
    setPortForm({ticker:"",tipo:"ORIGINAL",ratio:1,cantidad:"",precioEntrada:""});
  };

  const editPosition = (pos) => {
    setEditingId(pos.id);
    setPortForm({ ticker: pos.ticker, tipo: pos.tipo, ratio: pos.ratio, cantidad: pos.cantidad, precioEntrada: pos.precioEntrada });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPortForm({ticker:"",tipo:"ORIGINAL",ratio:1,cantidad:"",precioEntrada:""});
  };

  const removePosition = (id) => { if (editingId === id) cancelEdit(); savePortfolio(portfolio.filter(p => p.id !== id)); };

  // Motor Z-Score dinamico - μ y sigma se cargan desde storage en load() al arranque
  // y se actualizan en RAM via setZsParams cada vez que se procesa un CSV nuevo.
  const [zsParams, setZsParams] = useState(null); // {mu_vix, sigma_vix, mu_move, sigma_move, calibrado}

  const calcularTrimSistemico = () => {
    const moveTk = tickers.find(t => t.symbol === "^MOVE");
    const vixTk  = tickers.find(t => t.symbol === "^VIX");
    const actualMOVE = moveTk?.last_price ?? null;
    const actualVIX  = vixTk?.last_price  ?? null;

    // Si hay parametros calibrados, usar Z-score dinamico
    if (zsParams?.mu_vix && zsParams?.sigma_vix && zsParams?.mu_move && zsParams?.sigma_move) {
      const FACTOR = 5.0; // % de TRIM por punto de Z-score sobre el umbral
      let total = 0;
      if (actualVIX != null) {
        const zVIX = (actualVIX - zsParams.mu_vix) / zsParams.sigma_vix;
        if (zVIX > 2.0) total += (zVIX - 2.0) * FACTOR;
      }
      if (actualMOVE != null) {
        const zMOVE = (actualMOVE - zsParams.mu_move) / zsParams.sigma_move;
        if (zMOVE > 2.0) total += (zMOVE - 2.0) * FACTOR;
      }
      return Math.min(10, Math.max(0, Number(total.toFixed(2))));
    }

    // Fallback: umbrales fijos si no hay calibracion
    const chgMOVE = moveTk?.change_pct ?? null;
    const chgVIX  = vixTk?.change_pct  ?? null;
    let componente = 0;
    if (actualMOVE != null && actualMOVE > 120) {
      componente += (actualMOVE - 120) * 0.2;
      if (chgMOVE != null) componente += chgMOVE * 0.5;
    }
    if (actualVIX != null && actualVIX > 35) {
      componente += (actualVIX - 35) * 0.15;
      if (chgVIX != null) componente += chgVIX * 0.3;
    }
    return Math.min(10, Math.max(0, Number(componente.toFixed(2))));
  };

  const getMandatoSistemico = () => {
    const trim = calcularTrimSistemico();
    if (trim <= 0) return null;
    return "MANDATO DE SISTEMA CRITICO: El gradiente de riesgo algoritmico exige un TRIM obligatorio y continuo del " + trim.toFixed(2) + "% en todas las posiciones de renta variable.";
  };

  const buildMacroCtxText = () => {
    const dates = Object.keys(snapshots).sort();
    const selIdx = dates.indexOf(selDate);
    const getAnchorPrice = (date, sym) => {
      const snap = snapshots[date]; if (!snap) return null;
      const t = snap.tickers?.find(x => x.symbol === sym);
      if (t?.last_price != null) return t.last_price;
      const mMap = {"^TNX":"rate_10yr","^IRX":"rate_3mo","DX-Y.NYB":"dxy","^VIX":"vix","GC=F":"gold","CL=F":"wti"};
      const mk = mMap[sym]; return mk ? snap.market?.[mk]?.price ?? null : null;
    };
    const fmtD = (sym, n) => {
      if (selIdx < 0) return null;
      const ti = Math.max(0, selIdx - n); const aN = selIdx - ti; if (aN === 0) return null;
      const pN = getAnchorPrice(dates[selIdx], sym); const pT = getAnchorPrice(dates[ti], sym);
      if (pN == null || pT == null || pT === 0) return null;
      const d = ((pN-pT)/Math.abs(pT)*100); return "Delta "+aN+"D: "+(d>=0?"+":"")+d.toFixed(2)+"%";
    };
    const tnx = curData?.market?.rate_10yr?.price ?? null;
    const irx = curData?.market?.rate_3mo?.price ?? null;
    const dxy = curData?.market?.dxy?.price ?? null;
    const dxyChg = curData?.market?.dxy?.change_pct ?? null;
    const spread = (tnx != null && irx != null) ? (tnx - irx).toFixed(2) : null;
    const hgf = tickers.find(t=>t.symbol==="HG=F"); const gcf = tickers.find(t=>t.symbol==="GC=F");
    const cuAu = (hgf?.last_price && gcf?.last_price) ? (hgf.last_price/gcf.last_price*1000).toFixed(3) : null;
    const moveTk = tickers.find(t=>t.symbol==="^MOVE");
    return [
      "Fecha: " + selDate + " | Historial: " + dates.length + " snapshots",
      "S&P hoy: " + fmtPct(curData?.market?.sp500?.change_pct) + " | " + (fmtD("SPY",5)||"") + " | " + (fmtD("SPY",20)||""),
      "VIX: " + fmt(curData?.market?.vix?.price, 2) + (fmtD("^VIX",5) ? " | "+fmtD("^VIX",5) : "") + (fmtD("^VIX",20) ? " | "+fmtD("^VIX",20) : ""),
      "Tasa 10Y: " + (tnx!=null?fmt(tnx,3)+"%":"SIN DATO") + " | " + (fmtD("^TNX",5)||"sin historial") + " | " + (fmtD("^TNX",20)||""),
      "Spread curva (10Y-3M): " + (spread!=null?spread+"% (positivo=normal, negativo=invertida)":"SIN DATO"),
      "DXY: " + (dxy!=null?fmt(dxy,2)+" ("+fmtPct(dxyChg)+")":"SIN DATO") + (fmtD("DX-Y.NYB",5)?" | "+fmtD("DX-Y.NYB",5):"") + (fmtD("DX-Y.NYB",20)?" | "+fmtD("DX-Y.NYB",20):""),
      "Ratio Cu/Au: " + (cuAu!=null?cuAu+" (mayor=expansion, menor=flight to safety)":"SIN DATO"),
      "HYG: " + (creditStress.hyg!=null?fmtPct(creditStress.hyg.change):"SIN DATO") + " | LQD: " + (creditStress.lqd!=null?fmtPct(creditStress.lqd.change):"SIN DATO") + " | TLT: " + (creditStress.tlt!=null?fmtPct(creditStress.tlt.change):"SIN DATO"),
      "MOVE: " + (moveTk?.last_price!=null?moveTk.last_price.toFixed(0)+(moveTk.change_pct!=null?" ("+fmtPct(moveTk.change_pct)+")":""):"SIN DATO") + (fmtD("^MOVE",5)?" | "+fmtD("^MOVE",5):"") + (fmtD("^MOVE",20)?" | "+fmtD("^MOVE",20):""),
      "Estres crediticio: " + creditStress.stressLevel + (creditStress.signals.length>0?" -- "+creditStress.signals.slice(0,2).join("; "):""),
      "Ciclo: " + (cycleIndicators?.phase?.toUpperCase()||"SIN DATOS") + (cycleIndicators?.confidence?" ("+cycleIndicators.confidence+")":""),
      (() => {
        if (!zsParams?.mu_vix) return "Motor Z-Score: SIN CALIBRACION";
        const vixTk = tickers.find(t=>t.symbol==="^VIX");
        const movTk = tickers.find(t=>t.symbol==="^MOVE");
        const aVIX  = typeof vixTk?.last_price==="number" ? vixTk.last_price : curData?.market?.vix?.price ?? null;
        const aMOVE = typeof movTk?.last_price==="number" ? movTk.last_price : null;
        const zV = aVIX  != null ? ((aVIX  - zsParams.mu_vix)  / zsParams.sigma_vix).toFixed(2)  : null;
        const zM = aMOVE != null ? ((aMOVE - zsParams.mu_move) / zsParams.sigma_move).toFixed(2) : null;
        const umbV = (zsParams.mu_vix  + 2*zsParams.sigma_vix).toFixed(2);
        const umbM = (zsParams.mu_move + 2*zsParams.sigma_move).toFixed(2);
        const trim = calcularTrimSistemico();
        return "Motor Z-Score: VIX Z=" + (zV||"-") + " (umbral TRIM: "+umbV+")" +
               " | MOVE Z=" + (zM||"-") + " (umbral TRIM: "+umbM+")" +
               (trim > 0 ? " | TRIM SISTEMICO ACTIVO: "+trim.toFixed(2)+"%" : " | Sin TRIM sistemico activo");
      })(),
    ].join("\n");
  };

  // -- calcRegimenMotor -------------------------------------------------------
  // Calcula el regimen macro en forma deterministica desde los datos del motor.
  // El LLM recibe este string como dato duro - no puede deducir ni alterar el regimen.
  const calcRegimenMotor = () => {
    try {
    const lastSnap   = Object.values(snapshots).slice(-1)[0];
    const tickers_   = lastSnap?.tickers ?? [];
    const wtiTk      = tickers_.find(t => t.symbol === 'CL=F');
    const wtiChg     = wtiTk?.change_pct ?? null;
    const sp500Tk    = tickers_.find(t => t.symbol === '^GSPC') || tickers_.find(t => t.symbol === 'SPY');
    const sp500Chg   = sp500Tk?.change_pct ?? null;
    const tnxTk      = tickers_.find(t => t.symbol === '^TNX');
    const tnxChg     = tnxTk?.change_pct ?? null;
    const vixZ       = cycleIndicators?.macroSensors?.vix?.z_score ?? null;
    const moveVal    = cycleIndicators?.macroSensors?.move?.value  ?? null;
    const moveZ      = cycleIndicators?.macroSensors?.move?.z_score ?? null;
    const cicloBase  = cycleIndicators?.phase?.toUpperCase() ?? 'SIN DATOS';
    const probs      = cycleIndicators?.probabilities ?? {};
    const probStr    = Object.entries(probs).map(([k,v]) => k.toUpperCase() + ' ' + v + '%').join(' | ');

    // TIER 4 - SHOCKS (mismo criterio que el motor)
    const shockEnergetico = wtiChg != null && wtiChg >= 2.0;
    const shockDeflacion  = wtiChg != null && wtiChg <= -3.0;
    const shockTasas      = tnxChg != null && tnxChg >= 1.5 && sp500Chg != null && sp500Chg <= -0.8;
    const estrSistemico   = (vixZ != null && vixZ > 1.5) || (moveVal != null && moveVal > 120) || (moveZ != null && moveZ > 1.5);

    let regimen, detalle;
    if (shockEnergetico && estrSistemico) {
      regimen = 'SHOCK ENERGETICO/INFLACIONARIO + ESTRES SISTEMICO';
      detalle = 'WTI ' + (wtiChg > 0 ? '+' : '') + wtiChg.toFixed(1) + '% | VIX Z=' + (vixZ?.toFixed(2) ?? '-') + 'sigma | Ciclo base ignorado';
    } else if (shockEnergetico) {
      regimen = 'SHOCK ENERGETICO/INFLACIONARIO';
      detalle = 'WTI ' + (wtiChg > 0 ? '+' : '') + wtiChg.toFixed(1) + '% override sobre ciclo base ' + cicloBase;
    } else if (shockDeflacion) {
      regimen = 'SHOCK DEFLACIONARIO (COLAPSO ENERGETICO)';
      detalle = 'WTI ' + wtiChg.toFixed(1) + '% | Presion desinflacionaria aguda';
    } else if (shockTasas) {
      regimen = 'SHOCK DE TASAS / PRESION SOBRE RENTA VARIABLE';
      detalle = 'TNX +' + tnxChg.toFixed(1) + '% | S&P ' + sp500Chg.toFixed(1) + '%';
    } else if (estrSistemico) {
      regimen = 'ESTRES SISTEMICO - ESTADO DE EXCEPCION';
      detalle = (vixZ != null ? 'VIX Z=' + vixZ.toFixed(2) + 'sigma' : '') + (moveVal != null && moveVal > 120 ? ' | MOVE=' + moveVal.toFixed(0) : '');
    } else {
      regimen = cicloBase;
      detalle = 'Sin shocks activos. Probabilidades: ' + (probStr || 'sin datos');
    }

    return '[REGIMEN MACRO ESTRICTO APLICADO POR EL MOTOR: ' + regimen + ' - ' + detalle + ']';
    } catch(e) {
      console.warn('calcRegimenMotor error:', e);
      return '[REGIMEN MACRO: ERROR AL CALCULAR - ' + (e.message || 'desconocido') + ']';
    }
  };

  const exportarContextoRadar = () => {
    // Guard: sin tickers cargados no hay nada que exportar
    if (!twScore || twScore.length === 0) {
      alert("No hay activos en el Radar para exportar. Carga un snapshot primero.");
      return;
    }
    try {
    // Fallback de thesis: "hibrido" no existe en THESIS_CONFIG - usar tesis dominante
    const effectiveThesis = (THESIS_CONFIG[radarThesis] ? radarThesis : null)
      || (Object.keys(THESIS_CONFIG)[0] ?? "stagflacion");
    const thesis = THESIS_CONFIG[effectiveThesis] ?? THESIS_CONFIG["stagflacion"];
    const thesisScores = marketContext?.scores ?? {};
    const totalScore = Object.values(thesisScores).reduce((a,b)=>a+b, 0);
    const thesisSorted = Object.entries(thesisScores).sort((a,b)=>b[1]-a[1]);
    const spectrum = totalScore > 0
      ? thesisSorted.map(([k,v])=>(THESIS_CONFIG[k]?.label||k)+": "+Math.round(v/totalScore*100)+"%").join(" | ")
      : "sin datos";
    const selectedShare = totalScore > 0 && thesisScores[radarThesis] ? Math.round(thesisScores[radarThesis]/totalScore*100) : null;

    // Compilador local puro - sin API, sin async
    const sa = calcSectorArbitrage(twScore.map(t=>({...t, _val_score:calcValScore(t)})), sectorUniverse);
    const buildCtx = (th, exclude) => {
      if (!THESIS_CONFIG[th]) return []; // fallback: tesis invalida -> lista vacia
      return twScore
        .filter(t => t.last_price != null && (!exclude || !exclude.has(t.symbol)))
        .map(t => { const cyc = getCyclePhase(t.symbol, snapshots); const sc = calcRadarScore(t, null, sa, cyc, creditStress, th, cycleIndicators?.probabilities, dynamicScores); return sc ? {...t, _radar: sc} : null; })
        .filter(Boolean).sort((a,b)=>b._radar.score-a._radar.score);
    };
    const fmtTicker = t => ({
      symbol:t.symbol, score:t._radar.score, sector:t._radar.sector, factores:t._radar.factors,
      precio:t.last_price, variacion_hoy:t.change_pct, val:t._val_score,
      piotroski:t._piotroski, fpe:t.forward_pe, roe:t._roe,
      refi:t._refi_risk?.label, rs_20d:t._rs!=null?Number(t._rs).toFixed(1)+"%":"N/A"
    });
    const primaryRaw = buildCtx(effectiveThesis, null).slice(0,15);
    const ctxPrimary = primaryRaw.map(fmtTicker);

    // Freno absoluto: lista vacia despues del filtrado
    if (ctxPrimary.length === 0) {
      alert("La lista esta vacia. No hay activos con precio y score valido para exportar en esta tesis.");
      return;
    }

    const primarySymbols = new Set(ctxPrimary.map(t=>t.symbol));
    const secondaryKey = thesisSorted.find(([k])=>k!==effectiveThesis)?.[0]??null;
    const ctxSecondary = secondaryKey
      ? buildCtx(secondaryKey, primarySymbols).slice(0,10).map(t=>({...fmtTicker(t), tesis:THESIS_CONFIG[secondaryKey]?.label}))
      : [];

    // Replicar correlationWarning (mismo calculo que analyzeRadar)
    const symbols = ctxPrimary.map(t=>t.symbol);
    const highCorrPairs = [];
    for (let i=0; i<symbols.length; i++) {
      for (let j=i+1; j<symbols.length; j++) {
        const c = calcCorrelation(symbols[i], symbols[j], snapshots);
        if (c!=null && Number(c)>=0.75) highCorrPairs.push({s1:symbols[i], s2:symbols[j], corr:Number(c)});
      }
    }
    const correlationWarning = highCorrPairs.length > 0
      ? "\nREDUNDANCIAS DETECTADAS EN EL RADAR:\n"
        + highCorrPairs.map(p=>`- ${p.s1} y ${p.s2} tienen una correlacion temporal de +${p.corr.toFixed(2)}`).join("\n")
        + "\nALERTA DE RIESGO DE CONCENTRACION: Los pares listados arriba se mueven en bloque. Si tu recomendacion final incluye a uno de ellos, estas OBLIGADO a descartar a su par para no duplicar la exposicion del portfolio al mismo vector macroeconomico. Elegi al mas eficiente y descarta al redundante."
      : "";

    // Replicar override de Tail Lock (mismo texto que analyzeRadar)
    const tailOverride = (tailRiskData?.active && tailRiskData?.pairs?.length > 0)
      ? "\n\nALERTA DE RIESGO DE COLA (TAIL LOCK ACTIVO - N=" + (tailRiskData?.stressN ?? 0) + " dias de estres):\n"
        + "VIX Z-Score actual = " + (tailRiskData?.currentVixZ?.toFixed(2) ?? "-") + "sigma (> +1.5sigma -> regimen de estres confirmado).\n"
        + "Dependencia de cola oculta detectada en los siguientes pares:\n"
        + (tailRiskData?.pairs ?? []).map(p=>p.s1+"/"+p.s2+": corr normal="+p.normalCorr+" -> corr estres="+p.stressCorr+" (deltarho="+p.delta+")").join("\n") + "\n"
        + "OVERRIDE INNEGOCIABLE: Exposicion maxima combinada permitida para activos con TAIL RISK: 40% del capital total. "
        + "El capital asignado a cada uno ya fue penalizado x 0.5 sobre L_t. "
        + "Veredicto maximo permitido: TRIM o HOLD. PROHIBIDO ACCUMULATE. Si el payload muestra hasTailRisk=true para un activo, no podes asignarle capital adicional bajo ninguna circunstancia."
      : "";

    const portActual = getPortfolioWithMarket();
    const portResumen = portActual.map(p=>({ticker:p.ticker, pct_capital:p.pctCartera?.toFixed(1), variacion_hoy:p.precioActual!=null?p.change_pct??null:null, rs_20d:p.rs!=null?Number(Number(p.rs).toFixed(2)):null, pnl_pct:p.pnlPct?.toFixed(2), fase:p.fase}));

    const mandato = getMandatoSistemico();
    const sysExportRadar = mandato ? ANALYST_SYS + "\n\nDIRECTIVA ACTIVA DEL MOTOR Z-SCORE: " + mandato : ANALYST_SYS;
    const regimenStr = calcRegimenMotor();
    const portForRadar = getPortfolioWithMarket();
    const rvRadar  = portForRadar.reduce((s,p) => s + (p.valorPosicion ?? 0), 0);
    const capRadar = rvRadar + liquidezUSD;
    const texto = regimenStr + "\n\n[CAPITAL TOTAL OPERATIVO: USD " + capRadar.toFixed(2) + " - RV: USD " + rvRadar.toFixed(2) + " | Efectivo: USD " + liquidezUSD.toFixed(2) + "]" + "\n\n=== SYSTEM PROMPT ===\n" + sysExportRadar +
      "\n\n=== CONTEXTO RADAR ===\n" +
      "TESIS SELECCIONADA: " + thesis.label + (selectedShare?" ("+selectedShare+"%)":"") + "\n" +
      "ESPECTRO: " + spectrum + "\n\n" +
      "CONTEXTO MACRO:\n" + buildMacroCtxText() + "\n\n" +
      "CARTERA ACTUAL:\n" + (portActual.length>0?JSON.stringify(portResumen,null,2):"(vacia)") + "\n\n" +
      "TOP 15 TESIS PRINCIPAL (" + thesis.label + "):\n" + JSON.stringify(ctxPrimary,null,2) +
      (ctxSecondary.length>0 ? "\n\nTOP 10 TESIS SECUNDARIA (" + (THESIS_CONFIG[secondaryKey]?.label||secondaryKey) + "):\n" + JSON.stringify(ctxSecondary,null,2) : "") +
      correlationWarning + tailOverride +
      "\n\nINSTRUCCION: Actua como Piloto de Transicion. Analiza los activos del Radar en funcion del espectro de tesis y la cartera real. Emite ordenes de transicion (ACCUMULATE, TRIM, SELL, PILOT) sobre las posiciones existentes.";
    setExportTitle("CONTEXTO RADAR - para pegar en Claude");
    setExportJson(texto);
    setShowExport(true);
    } catch(err) {
      console.error("Error en exportarContextoRadar:", err);
      alert("Error al exportar Radar: " + err.message + "\n\nVer consola para detalle.");
    }
  };

  const exportarContextoCartera = () => {
    const posiciones = getPortfolioWithMarket();
    const conPrecio = posiciones.filter(p => p.precioActual != null).length;
    if (conPrecio === 0 && posiciones.length > 0) {
      alert("Sin precios actuales - carga el CSV del dia antes de exportar el contexto de cartera.");
      return;
    }
    const totalRV = posiciones.reduce((s,p)=>s+(p.valorPosicion??0),0);
    const totalCartera = totalRV + liquidezUSD;
    const portSymbols = posiciones.map(p=>p.ticker);
    const corrInternas = [];
    for (let i=0;i<portSymbols.length;i++) for (let j=i+1;j<portSymbols.length;j++) {
      const c = calcCorrelation(portSymbols[i],portSymbols[j],snapshots);
      if (c!=null) corrInternas.push({par:portSymbols[i]+"/"+portSymbols[j], corr:Number(Number(c).toFixed(2))});
    }
    corrInternas.sort((a,b)=>Math.abs(b.corr)-Math.abs(a.corr));
    const calcVol = (sym) => {
      const ds = Object.keys(snapshots).sort();
      const ch = ds.map(d=>snapshots[d]?.tickers?.find(t=>t.symbol===sym)?.change_pct).filter(v=>v!=null);
      if (ch.length<3) return null;
      const m = ch.reduce((a,b)=>a+b,0)/ch.length;
      return Number(Math.sqrt(ch.reduce((a,b)=>a+(b-m)**2,0)/ch.length).toFixed(2));
    };
    const payload = posiciones.map(p=>({
      ticker:p.ticker, tipo:p.tipo,
      cant_acciones:Number(p.exposicion.toFixed(4)),
      precio_entrada_usd:Number(p.precioBase.toFixed(2)),
      precio_actual_usd:p.precioActual,
      variacion_hoy:p.change_pct??null,
      valor_usd:p.valorPosicion!=null?Number(p.valorPosicion.toFixed(2)):null,
      pct_capital:totalCartera>0&&p.valorPosicion!=null?Number((p.valorPosicion/totalCartera*100).toFixed(2)):null,
      pnl_pct:p.pnlPct!=null?Number(p.pnlPct.toFixed(2)):null,
      rs_20d:p.rs!=null?Number(Number(p.rs).toFixed(2)):null,
      fase:p.fase??"SIN DATO",
      volatilidad_std:calcVol(p.ticker),
    }));
    // Replicar sectoresResumen exactamente como en auditarCartera
    const tksExport = snapshots[selDate]?.tickers || [];
    const saExport  = calcSectorArbitrage(tksExport.map(t => ({...t, _val_score: calcValScore(t)})));
    const sectoresResumen = Object.entries(saExport)
      .map(([s,d]) => ({ sector: s, baratos: d.tickers.filter(t=>t.avgZ<=-1.5).map(t=>t.symbol), caros: d.tickers.filter(t=>t.avgZ>=1.5).map(t=>t.symbol) }))
      .filter(s => s.baratos.length > 0 || s.caros.length > 0);

    const mandato = getMandatoSistemico();
    const sysExport = mandato
      ? RISK_MANAGER_SYS + "\n\nDIRECTIVA ACTIVA DEL MOTOR Z-SCORE: " + mandato
      : RISK_MANAGER_SYS;
    const regimenStr = calcRegimenMotor();
    // Capital total operativo: siempre incluye liquidez aunque no haya posiciones
    const capitalTotalOperativo = totalRV + liquidezUSD;
    const texto = regimenStr + "\n\n[CAPITAL TOTAL OPERATIVO: USD " + capitalTotalOperativo.toFixed(2) + " - RV: USD " + totalRV.toFixed(2) + " | Efectivo: USD " + liquidezUSD.toFixed(2) + (capitalTotalOperativo > 0 ? " (" + (liquidezUSD/capitalTotalOperativo*100).toFixed(1) + "% liquidez)" : "") + "]" + "\n\n=== SYSTEM PROMPT ===\n" + sysExport +
      "\n\n=== CONTEXTO CARTERA ===\n" +
      "CONTEXTO MACRO:\n" + buildMacroCtxText() + "\n\n" +
      "POSICIONES:\n" + JSON.stringify(payload,null,2) +
      (corrInternas.length>0 ? "\n\nCORRELACIONES INTERNAS:\n" + JSON.stringify(corrInternas) : "") +
      (sectoresResumen.length>0 ? "\n\nSECTORES DISLOCADOS (mercado):\n" + JSON.stringify(sectoresResumen) : "") +
      "\n\nINSTRUCCION: Audita esta cartera y emitis veredictos por posicion (ACCUMULATE / HOLD / TRIM / SELL / PILOT).";
    setExportTitle("CONTEXTO CARTERA");
    setExportJson(texto);
    setShowExport(true);
  };

  // -- exportarTelemetria - Feature Store institucional v1.0 -----------------
  // Corre el motor en modo hibrido (todas las tesis) independientemente de la UI.
  // Exporta el estado completo del universo como JSON para calibracion futura.
  // Nulls son informacion valida (dato no disponible) - no se fabrican valores.
  const exportarTelemetria = () => {
    const fecha = selDate || new Date().toISOString().slice(0, 10);
    const THESES_TELEM = ["stagflacion", "defensivo", "crecimiento", "valor"];

    // -- Z-scores macro crudos desde macroSensors -----------------------------
    const ms   = cycleIndicators?.macroSensors ?? null;
    const probs = cycleIndicators?.probabilities ?? {};
    const fredCuad = (fredRegime?.cuadrante || "").toLowerCase();
    const fredZ    = (fredCuad.includes("crecimiento") || fredCuad.includes("valor")) ? 1.0
                   : (fredCuad.includes("defensivo") || fredCuad.includes("estanflacion")) ? -1.0 : 0.0;
    const spROC   = marketContext?.spROC ?? null;
    // z_roc252 dinamico - mismo calculo que calcMacroDivergenceMultiplier
    const _tDivPct = ((curData?.market?.spxQDiv > 0) ? curData.market.spxQDiv : 0.08) * 100;
    // Usar SPX_ROC_63d del CSV como fuente primaria del ROC
    const _spxRoc63d = curData?.market?.spxRoc63d ?? null;
    const _effectiveROC = _spxRoc63d ?? spROC;
    const zRoc252  = _effectiveROC != null ? parseFloat((_effectiveROC / _tDivPct).toFixed(4)) : null;

    // -- Amplitud de mercado por tesis (Regime Breadth) ---------------------
    // Cuenta cuantos activos pasan la guillotina en cada tesis.
    // Es un dato objetivo de mercado, no una derivacion teorica del motor.
    const amplitudTesis = {};
    let _totalAmplitud = 0;
    for (const th of THESES_TELEM) {
      const approved = twScore
        .filter(t => t.last_price != null)
        .filter(t => {
          const cyc = getCyclePhase(t.symbol, snapshots);
          const sc  = calcRadarScore(t, null, sa, cyc, creditStress, th,
                        cycleIndicators?.probabilities, dynamicScores);
          return sc != null;
        }).length;
      amplitudTesis[th] = approved;
      _totalAmplitud   += approved;
    }
    for (const th of THESES_TELEM) {
      amplitudTesis[th] = _totalAmplitud > 0
        ? Math.round(amplitudTesis[th] / _totalAmplitud * 100) : 0;
    }

    // -- Metadata --------------------------------------------------------------
    const metadata = {
      version_motor: "v1.0",
      fecha,
      inputs_macro: {
        z_roc252:  zRoc252,
        fred_z:    fredZ,
        fred_cuadrante: fredRegime?.cuadrante ?? null,
        spROC_pct:     spROC != null ? parseFloat(spROC.toFixed(3)) : null,
        spx_roc_63d:   _spxRoc63d != null ? parseFloat(_spxRoc63d.toFixed(4)) : null,
        spROC_fuente:  _spxRoc63d != null ? "CSV_Python_63d" : (spROC != null ? "rocHistory_adaptativo" : null),
        z_scores_clasicos: ms ? {
          vix_inv:     ms.vix?.z_score     != null ? parseFloat((-ms.vix.z_score).toFixed(3))    : null,
          // move_inv: Z-score del MOVE invertido (positivo=calma, negativo=estres)
          // Fuente: calcCycleStats -> calcExponentialZScore sobre move_price acumulado en cycleVars
          // Con 57 sesiones ya disponibles, el Z-score es calculable aunque ^MOVE no descargue de Python
          move_inv:    ms.move?.z_score    != null ? parseFloat((-ms.move.z_score).toFixed(3))   : null,
          curva_2s10s: ms.curva?.z_score   != null ? parseFloat(ms.curva.z_score.toFixed(3))     : null,
          cu_au:       ms.cu_au?.z_score   != null ? parseFloat(ms.cu_au.z_score.toFixed(3))     : null,
          iwm_spy:     ms.iwm_rel?.z_score != null ? parseFloat(ms.iwm_rel.z_score.toFixed(3))   : null,
        } : null,
        confidence_coef: ms?.confidence_coef ?? null,
        n_snapshots_hist: ms?.n_snapshots ?? null,
        cuadrante_roc_dbc: marketContext?.quadrant ?? null,  // senal pura ROC+DBC del motor
      },
      probabilidades_macro: {
        expansion:      probs.expansion      ?? null,
        desaceleracion: probs.desaceleracion ?? null,
        contraccion:    probs.contraccion    ?? null,
        recuperacion:   probs.recuperacion   ?? null,
      },
      amplitud_mercado_tesis: {
        crecimiento:  amplitudTesis.crecimiento  ?? 0,
        stagflacion:  amplitudTesis.stagflacion  ?? 0,
        defensivo:    amplitudTesis.defensivo    ?? 0,
        valor:        amplitudTesis.valor        ?? 0,
      },
      regimen_roc:  marketContext?.quadrant     ?? null,
      regimen_dominante: (Object.entries(cycleIndicators?.probabilities ?? {}).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? null),
      vix_nivel:         cycleIndicators?.macroSensors?.vix?.value != null
                           ? parseFloat(cycleIndicators.macroSensors.vix.value.toFixed(2)) : null,
      breadth_rs_positivo: twScore.length > 0
                           ? Math.round(twScore.filter(t=>t._rs!=null&&Number(t._rs)>0).length/twScore.length*100)
                           : null,
      grain_is:     marketContext?.grainIs      ?? null,
      grain_suffix: marketContext?.grainSuffix  ?? null,
      macro_raw_levels: (() => {
        const ms = cycleIndicators?.macroSensors ?? {};
        const findTicker = sym => tickers.find(t => t.symbol === sym)?.last_price ?? null;
        return {
          tnx_level:       ms.tnx?.value       != null ? parseFloat(ms.tnx.value.toFixed(4))       : findTicker("^TNX"),
          dxy_level:       ms.dxy?.value       != null ? parseFloat(ms.dxy.value.toFixed(4))       : findTicker("DX-Y.NYB"),
          spread_2s10s_bps:ms.curva?.value     != null ? parseFloat((ms.curva.value*100).toFixed(1))  : null,
          cu_au_ratio:     ms?.cuAu?.value != null ? parseFloat(ms.cuAu.value.toFixed(4)) : (tickers.find(t=>t.symbol==="HG=F")?.last_price && tickers.find(t=>t.symbol==="GC=F")?.last_price ? parseFloat((tickers.find(t=>t.symbol==="HG=F").last_price / tickers.find(t=>t.symbol==="GC=F").last_price).toFixed(4)) : null),
          iwm_spy_ratio:   ms?.iwmSpy?.value != null ? parseFloat(ms.iwmSpy.value.toFixed(4)) : (tickers.find(t=>t.symbol==="IWM")?.last_price && tickers.find(t=>t.symbol==="SPY")?.last_price ? parseFloat((tickers.find(t=>t.symbol==="IWM").last_price / tickers.find(t=>t.symbol==="SPY").last_price).toFixed(4)) : null),
          move_level:      ms.move?.value      != null ? parseFloat(ms.move.value.toFixed(2))      : findTicker("^MOVE"),
          vix_level:       ms.vix?.value       != null ? parseFloat(ms.vix.value.toFixed(2))       : null,
        };
      })(),
      credit_stress: creditStress?.stressLevel  ?? null,
      credit_stress_detail: creditStress ? {
        z_credit:        creditStress.zScore        != null ? parseFloat(creditStress.zScore.toFixed(4))        : null,
        spread_hyg_tlt:  creditStress.spreadHygTlt  != null ? parseFloat(creditStress.spreadHygTlt.toFixed(6))  : null,
        spread_mean_20d: creditStress.spreadMean20d != null ? parseFloat(creditStress.spreadMean20d.toFixed(6)) : null,
        classification:  creditStress.stressLevel   ?? null,
      } : null,
      // Fecha real de descarga del feed AQR externo (puede diferir de fecha del snapshot).
      // Permite detectar degradacion de IC cuando el score usado es "viejo".
      fed_score_descarga_fecha: fedScoreFecha || null,
      // Exposicion objetivo - Volatility Targeting (persiste para analisis de sizing historico)
      exposicion_objetivo: (() => {
        try {
          const _vixRaw = cycleIndicators?.macroSensors?.vix?.value;
          const _vix  = (_vixRaw != null && !isNaN(_vixRaw)) ? parseFloat(_vixRaw) : 20;
          const _prb  = cycleIndicators?.probabilities ?? {};
          const _vf   = Math.min(Math.max(0.15 / (_vix / 100), 0.25), 1.0);
          const _mod  = ((_prb.expansion??0) + (_prb.recuperacion??0) - (_prb.contraccion??0)) / 100;
          const _cuad = marketContext?.quadrant ?? null;
          const _piso = _cuad === "RECESION_DEFLACIONARIA" ? 0.00 : 0.25;
          const _exp  = Math.min(Math.max(_vf * (1.0 + _mod), _piso), 1.0);
          const _pct  = Math.round(_exp * 100);
          const _cap  = typeof capitalBase === "number" && capitalBase > 0 ? capitalBase : 10000;
          return {
            porcentaje:           _pct,
            capital_base_usd:     _cap,
            capital_equities_usd: Math.round(_cap * _exp),
            capital_cash_usd:     _cap - Math.round(_cap * _exp),
            vix_factor:           parseFloat(_vf.toFixed(4)),
            modulator:            parseFloat(_mod.toFixed(4)),
            piso_dinamico:        _piso,
            cuadrante:            _cuad,
            vix_nivel:            parseFloat(_vix.toFixed(2)),
          };
        } catch(e) {
          return { error: e.message };
        }
      })(),
      // Diagnosticos IVW - capturados automaticamente en cada sesion del Radar
      // Permite auditar evolucion de pesos sin anotar manualmente la consola
      ivw_fusion: ivwDiagnostics ? {
        method:    ivwDiagnostics.method,
        w_R:       ivwDiagnostics.w_R,
        w_A:       ivwDiagnostics.w_A,
        var_R:     ivwDiagnostics.var_R,
        var_A:     ivwDiagnostics.var_A,
        n_overlap: ivwDiagnostics.n_overlap,
        modo:      ivwDiagnostics.modo,
        fecha:     ivwDiagnostics.fecha,
      } : null,
    };

    // -- Array universo completo (modo hibrido) --------------------------------
    // Corre en todas las tesis, deduplica por ticker, toma el mejor score.
    // Persiste scores_por_tesis para analisis counterfactual (Opus 4.7, 2026-04-18):
    // permite comparar "tesis dinamica" vs "tesis fija" al cabo de 12 meses.
    // saFull: sa propio para la exportacion, usa TODOS los tickers de la sesion
    // (no solo twScore) para mejor cobertura sectorial. Pasa sectorUniverse si esta cargado.
    // Fix: el sa del componente usa twScore que puede ser pequeno; aqui necesitamos todos.
    // tksForSa: usar twScore (tickers ya procesados con forward_pe/price_book correctos)
    // NO usar snapshots[selDate]?.tickers - esos tienen nombres de columna CSV crudos
    // ("Forward P/E", "P/Book") que no matchean lo que calcSectorArbitrage busca
    // (forward_pe, price_book). twScore ya tiene los nombres correctos post-procesamiento.
    const tksForSa = twScore
      .filter(t => t.last_price != null)
      .map(t => ({ ...t, _val_score: calcValScore(t) }));
    const saFull = calcSectorArbitrage(tksForSa, sectorUniverse);
    // Diagnostico: verificar que algun sector tiene Z scores con avgZ no-null
    const _sampEntry = Object.entries(saFull).find(([,v]) => v.usingRef && v.tickers?.length > 0);
    console.log("[TELEMETRIA] saFull sample:", _sampEntry
      ? `${_sampEntry[0]}: usingRef=${_sampEntry[1].usingRef}, tickers_con_z=${_sampEntry[1].tickers?.length}`
      : "NINGUNO con tickers - property name mismatch persiste");

    const byTicker = {};
    const _divRCache = {};  // cache del multiplicador macro por sym (igual para todas las tesis)

    for (const th of THESES_TELEM) {
      twScore
        .filter(t => t.last_price != null)
        .forEach(t => {
          const sym  = t.symbol;
          const cyc  = getCyclePhase(t.symbol, snapshots);
          const sc   = calcRadarScore(t, null, saFull, cyc, creditStress, th,
                         cycleIndicators?.probabilities, dynamicScores);

          // Diagnostico z_sectorial v2 - apunta a un sector equity especifico
          if (sym === twScore.filter(t=>t.last_price!=null)[0]?.symbol && th === THESES_TELEM[0]) {
            // Mostrar sectores equity con usingRef
            const _equitySectors = ["Tech/MegaCap","Finanzas","Salud","Energia","Semiconductores"];
            const _equitySample  = _equitySectors.map(s => {
              const d = saFull[s];
              if (!d) return {sector:s, status:"AUSENTE_EN_SAFULL"};
              return {
                sector:    s,
                usingRef:  d.usingRef,
                n_members: d.tickers?.length ?? 0,
                sample_tk: d.tickers?.[0] ? {sym:d.tickers[0].symbol, avgZ:d.tickers[0].avgZ} : "VACIO",
              };
            });
            console.log("[TELEMETRIA-v2] equity sectors:", JSON.stringify(_equitySample));
            // Mostrar forward_pe y price_book de un ticker equity en tksForSa
            const _sampleTk = tksForSa.find(t => ["AAPL","MSFT","GOOGL","JPM","XOM"].includes(t.symbol));
            if (_sampleTk) console.log("[TELEMETRIA-v2] ticker sample:", {sym:_sampleTk.symbol, fpe:_sampleTk.forward_pe, pb:_sampleTk.price_book, sector:getSector(_sampleTk.symbol)});
            else console.log("[TELEMETRIA-v2] no equity ticker found in tksForSa, total:", tksForSa.length);
          }

          // Calcular multiplicador macro una sola vez por sym (independiente de la tesis)
          if (!_divRCache[sym]) {
            const _dr = calcMacroDivergenceMultiplier(
              marketContext?.quadrant, fredRegime,
              marketContext?.grainIs ?? null, sym, spROC,
              curData?.market?.spxQDiv ?? 0.08, curData?.market?.spxRoc63d ?? null
            );
            const _qDiv = (curData?.market?.spxQDiv > 0 ? curData.market.spxQDiv : 0.08) * 100;
            const _roc  = curData?.market?.spxRoc63d ?? spROC;
            const _zR   = _roc != null ? parseFloat((_roc / _qDiv).toFixed(4)) : null;
            const _fCuad = (fredRegime?.cuadrante || "").toLowerCase();
            const _fZ   = (_fCuad.includes("crecimiento")||_fCuad.includes("valor")) ? 1.0
                        : (_fCuad.includes("defensivo")||_fCuad.includes("estanflacion")) ? -1.0 : 0.0;
            const _multM = _dr?.multiplier ?? 1.0;
            _divRCache[sym] = {
              multM:   _multM,
              macroFlag: _dr?.flag ?? "NEUTRAL",
              _breakdown: {
                z_roc252:         _zR,
                fred_z:           _fZ,
                cuadrante:        marketContext?.quadrant ?? null,
                raw_m_aprox:      _zR != null ? parseFloat((1.0 + 0.20*_zR - 0.12*_fZ).toFixed(4)) : null,
                final_m_clamped:  parseFloat(_multM.toFixed(4)),
              },
            };
          }
          if (!sc) return;

          const { multM, macroFlag } = _divRCache[sym];
          const scoreFinal = Math.min(100, Math.round(sc.score * multM));

          const _aqrRaw = sc.regimeScore;
          const regimeScoreAqr = _aqrRaw != null
            ? parseFloat(_aqrRaw.toFixed(2))
            : parseFloat(sc.score.toFixed(2));

          // Acumular scores_por_tesis (counterfactual analysis)
          if (!byTicker[sym]) {
            byTicker[sym] = {
              ticker:              sym,
              sector:              sc.sector ?? getSector(sym),
              tesis_optima:        th,
              piotroski:           t._piotroski     ?? null,
              val_score:           t._val_score     ?? null,
              refi_risk:           t._refi_risk?.label ?? null,
              forward_pe:          t.forward_pe     ?? null,
              price_book:          t.price_book     ?? null,
              roe_pct:             t._roe           ?? null,
              debt_eq:             t._debt_eq       ?? null,
              fcf_yield:           t._fcf_yield     ?? null,
              rs_20d:              t._rs != null ? parseFloat(Number(t._rs).toFixed(2)) : null,
              change_pct_hoy:      t.change_pct     ?? null,
              last_price:          t.last_price     ?? null,
              market_cap:          t.market_cap     ?? null,
              score_base:          sc.score,
              regime_score_aqr:    regimeScoreAqr,
              multiplicador_macro: multM,
              macro_multiplier_breakdown: _divRCache[sym]?._breakdown ?? null,
              score_final:         scoreFinal,
              factores:            sc.factors       ?? [],
              grain_adj:           marketContext?.grainIs ?? null,
              macro_flag:          macroFlag,
              scores_por_tesis:    { [th]: scoreFinal },
              scores_por_tesis_raw: {},     // se rellena en el mismo loop con raw=true
              guillotinas_por_tesis: {},    // motivo de guillotina por tesis si aplica
              // Earnings info - copiado desde tickers en memoria (no persiste en storage)
              earnings_info:       t.earnings_info ?? null,
              // Descomposicion de componentes A/B/C/D/E/F (Opus 4.7, critico #2)
              componentes_radar:   sc._components   ?? null,
              // Z-score sectorial de referencia (Opus 4.7, critico #1)
              z_sectorial:         sc._sectorZ      ?? null,
              // -- Fase de ciclo (componente D del Radar) ----------------------
              cycle_phase_label:   cyc?.label          ?? null, // ALZA|ACUM|DIST|BAJA
              mu_changes_hist:     cyc?.mu             != null ? parseFloat(cyc.mu.toFixed(4))    : null,
              sigma_changes_hist:  cyc?.sigma          != null ? parseFloat(cyc.sigma.toFixed(4)) : null,
              // -- Shadow / correlacion ------------------------------------
              // Se actualizan post-construccion cuando shadowRoster este disponible
              shadow_role:            null,
              shadow_pair_ticker:     null,
              shadow_correlation_rho: null,
              // -- Waterfall sizing ----------------------------------------
              waterfall_tier:             null,
              waterfall_size_pct_suggested: null,
              // -- Señal operativa (HOLD/TRIM/EXIT/BUY) --------------------
              signal_state:       null,
              signal_action_pct:  null,
              signal_decay_score: null,
              hysteresis_branch:  masterScores?.scored?.find(x => x.symbol === sym)?._hysteresis_branch ?? null,
              master_pct_pre_penalty: masterScores?.scored?.find(x => x.symbol === sym)?.masterPctRaw ?? null,
              penalty_aplicada:   masterScores?.scored?.find(x => x.symbol === sym)?.penaltyApplied ?? null,
            };
          } else {
            // Ticker ya existe - actualizar tesis optima si score es mayor
            byTicker[sym].scores_por_tesis[th] = scoreFinal;
            if (scoreFinal > byTicker[sym].score_final) {
              byTicker[sym].tesis_optima     = th;
              byTicker[sym].score_base       = sc.score;
              byTicker[sym].score_final      = scoreFinal;
              byTicker[sym].regime_score_aqr = regimeScoreAqr;
              byTicker[sym].factores         = sc.factors ?? [];
              byTicker[sym].componentes_radar = sc._components ?? null;
              byTicker[sym].z_sectorial       = sc._sectorZ ?? null;
            }
          }
        });
    }




    // -- Segundo loop: raw scores sin guillotinas (Opus 4.7) -----------------
    // Corre INCONDICIONALMENTE para todos los tickers x todas las tesis.
    // Fix: el loop principal tiene if(!sc)return, asi que los guillotinados
    // nunca llegaban al bloque raw. Este loop separado garantiza cobertura completa.
    twScore.filter(t => t.last_price != null).forEach(t => {
      const sym = t.symbol;
      if (!byTicker[sym]) return; // solo tickers que pasaron al menos una tesis
      const cyc = getCyclePhase(t.symbol, snapshots);
      const multM = _divRCache[sym]?.multM ?? 1.0;
      for (const th of THESES_TELEM) {
        if (byTicker[sym].scores_por_tesis_raw[th] != null) continue; // ya calculado

        // Raw score sin guillotinas - para scores_por_tesis_raw
        const scRaw = calcRadarScore(t, null, saFull, cyc, creditStress, th,
                        cycleIndicators?.probabilities, dynamicScores,
                        { raw: true });
        const rawFinal = scRaw
          ? Math.min(100, Math.round(scRaw.score * multM))
          : null;
        byTicker[sym].scores_por_tesis_raw[th] = rawFinal;

        // Motivo de guillotina - solo cuando la tesis normal fue nula pero raw no
        // Correccion vs version anterior: { raw: true } desactiva guillotinas -> _gLog vacio.
        // Necesitamos una llamada en modo NORMAL con guillotineLog para capturar el motivo.
        const normalScore = byTicker[sym].scores_por_tesis[th];
        if (normalScore == null && rawFinal != null) {
          const _gLog = [];
          calcRadarScore(t, null, saFull, cyc, creditStress, th,
            cycleIndicators?.probabilities, dynamicScores,
            { guillotineLog: _gLog }); // modo normal -> guillotinas activas -> captura motivo
          if (_gLog.length > 0) {
            byTicker[sym].guillotinas_por_tesis[th] = _gLog[0];
          }
        }
      }
    });

    const universoRaw = Object.values(byTicker)
      .sort((a, b) => b.score_final - a.score_final);
    const n = universoRaw.length;

    // ── macro_ponderado: leer directamente del useMemo radarScores (UI) ─────────
    // radarScores ya tiene el fused score IVW calculado sobre el universo filtrado
    // (~165-180 tickers). Usar esa misma fuente evita la divergencia que producía
    // una segunda llamada a fuseRadarAQR sobre universoRaw completo (~219 tickers).
    const _uiFused = Object.fromEntries(radarScores.map(t => [t.symbol, t._radar?.score ?? null]));

    // Tickers con AQR real (no fallback) — para rank_aqr_pct limpio
    const _aqrRealSet = new Set(
      universoRaw
        .filter(row => (dynamicScores ?? {})[row.ticker] != null)
        .map(row => row.ticker)
    );
    const _scoresAQRReal = universoRaw
      .filter(row => _aqrRealSet.has(row.ticker))
      .map(row => row.regime_score_aqr ?? 0);
    const _nAQR = _scoresAQRReal.length;
    const _rankAQRPct = (val) => {
      const below = _scoresAQRReal.filter(v => v < val).length;
      return _nAQR > 1 ? parseFloat((below / (_nAQR - 1) * 100).toFixed(2)) : 100;
    };

    // Rellenar shadow_role / waterfall_tier / signal_state post-construccion
    // shadowRoster puede no estar disponible en todas las sesiones (null-safe)
    try {
      // Shadow roster
      if (shadowRoster?.titulares?.length > 0) {
        const titSet   = new Set(shadowRoster.titulares.map(t => t.symbol));
        const shadowMap = {}; // sym -> { pairTicker, rho }
        shadowRoster.suplentes.forEach((data, sym) => {
          shadowMap[sym] = { pair: data.titular, rho: data.clusterCorr };
        });
        universoRaw.forEach(r => {
          if (titSet.has(r.ticker)) {
            r.shadow_role = "titular";
          } else if (shadowMap[r.ticker]) {
            r.shadow_role            = "shadow";
            r.shadow_pair_ticker     = shadowMap[r.ticker].pair;
            r.shadow_correlation_rho = shadowMap[r.ticker].rho;
          }
        });
      }

      // trkSyms = elegibles del top operativo del Radar (fused score >= 80),
      // ordenados por score descendente para que Winner-Takes-All use el ticker #1 correcto.
      // Fuente: _uiFused (línea 3662) — el mapa symbol→score ya calculado en este scope.
      // No usar r.macro_ponderado: ese campo se escribe en universoRaw más adelante (~línea 3784)
      // y aún no está disponible en este punto del flujo.
      const SIZING_THRESHOLD = 80;
      const trkSyms = universoRaw
        .filter(r => (_uiFused[r.ticker] ?? 0) >= SIZING_THRESHOLD)
        .sort((a, b) => (_uiFused[b.ticker] ?? 0) - (_uiFused[a.ticker] ?? 0))
        .map(r => r.ticker);
      const capPxy = liquidezUSD > 0 ? liquidezUSD : null;
      const vz = cycleIndicators?.macroSensors?.vix?.z_score ?? null;
      const localSizing = calcPositionSize(trkSyms, snapshots, vz, capPxy);

      universoRaw.forEach(r => {
        const sz = localSizing?.[r.ticker];
        if (sz != null && typeof sz === 'object') {
          const weightDecimal = sz.wFinal / 100;
          r.waterfall_tier = weightDecimal >= 0.08 ? 1 : weightDecimal >= 0.05 ? 2 : 3;
          r.waterfall_size_pct_suggested = sz.wFinal;
        }
      });

      // Signal state: calculado para TODOS los activos del universo para calibrar los umbrales (H26)
      universoRaw.forEach(row => {
        const sym = row.ticker;
        const liveScore = _uiFused[sym];
        if (liveScore == null) return;
        const HOLD_MIN = 0, BUY_THRESH = 80;
        if (liveScore >= BUY_THRESH)       { row.signal_state = "HOLD"; }
        else if (liveScore > HOLD_MIN)    {
          const decay = calcDecaySignal(liveScore, BUY_THRESH, null, null);
          row.signal_state        = "TRIM";
          row.signal_action_pct   = decay.trimPct != null ? parseFloat(decay.trimPct.toFixed(1)) : null;
          row.signal_decay_score  = decay.dT      != null ? parseFloat(decay.dT.toFixed(4))      : null;
        }
        else { row.signal_state = "EXIT"; }
      });
    } catch(e) { console.warn("[TELEMETRIA] shadow/sizing/signal:", e.message); }

    // ── Rank percentiles y métricas por ticker ────────────────────────────────
    // rank_radar_pct: percentil del score_final (Radar fused) dentro del universo
    // rank_aqr_pct: percentil del aqr_score dentro del universo
    const scoresRadar = universoRaw.map(t => t.score_final ?? 0);
    const rankPct = (arr, val) => {
      const below = arr.filter(v => v < val).length;
      return n > 1 ? parseFloat((below / (n - 1) * 100).toFixed(2)) : 100;
    };

    // RS 20D por sector — para rs_20d_sector_promedio y rs_20d_diff_vs_sector
    const sectorRS = {};
    universoRaw.forEach(t => {
      const sec = t.sector || "Otros";
      if (!sectorRS[sec]) sectorRS[sec] = [];
      if (t.rs_20d != null) sectorRS[sec].push(t.rs_20d);
    });
    const sectorRSAvg = {};
    Object.entries(sectorRS).forEach(([sec, vals]) => {
      sectorRSAvg[sec] = vals.length > 0
        ? parseFloat((vals.reduce((a,b)=>a+b,0) / vals.length).toFixed(2))
        : null;
    });

    // rank_dentro_sector — posición ordinal del ticker dentro de su sector (por score_final)
    const sectorScores = {};
    universoRaw.forEach(t => {
      const sec = t.sector || "Otros";
      if (!sectorScores[sec]) sectorScores[sec] = [];
      sectorScores[sec].push({ sym: t.symbol, score: t.score_final ?? 0 });
    });
    const sectorRankMap = {};
    Object.entries(sectorScores).forEach(([sec, arr]) => {
      arr.sort((a,b) => b.score - a.score)
         .forEach((entry, idx) => { sectorRankMap[entry.sym] = idx + 1; });
    });

    // Enriquecer cada ticker del universo con los campos nuevos
    const universo = universoRaw.map(t => {
      const rRP  = rankPct(scoresRadar, t.score_final ?? 0);
      const hasRealAQR = _aqrRealSet.has(t.ticker);
      const rAQR = hasRealAQR ? _rankAQRPct(t.regime_score_aqr ?? 0) : null;
      const secAvgRS = sectorRSAvg[t.sector || "Otros"] ?? null;
      return {
        ...t,
        macro_ponderado:              _uiFused[t.ticker] ?? null,
        rank_radar_pct:               rRP,
        rank_aqr_pct:                 rAQR,
        divergencia_rank_radar_aqr:   rAQR != null ? parseFloat(Math.abs(rRP - rAQR).toFixed(2)) : null,
        rs_20d_sector_promedio:       secAvgRS,
        rs_20d_diff_vs_sector:        (t.rs_20d != null && secAvgRS != null)
                                        ? parseFloat((t.rs_20d - secAvgRS).toFixed(2))
                                        : null,
        rank_dentro_sector:           sectorRankMap[t.symbol] ?? null,
        tail_lock_active:             tailRiskData?.active
                                        ? (tailRiskData?.tailSymbols?.has(t.ticker) ?? false)
                                        : null,
      };
    });

    // ── Breadth y dispersión — van a metadata ────────────────────────────────
    const scores60plus = universo.filter(t => (t.score_final ?? 0) >= 60).length;
    const pioCount     = universo.filter(t => t.piotroski != null).length;
    const pio5plus     = universo.filter(t => (t.piotroski ?? 0) >= 5).length;
    const sortedScores = [...scoresRadar].sort((a,b) => a-b);
    const q1 = sortedScores[Math.floor(n * 0.25)] ?? null;
    const q3 = sortedScores[Math.floor(n * 0.75)] ?? null;
    const iqr = (q1 != null && q3 != null) ? parseFloat((q3 - q1).toFixed(2)) : null;

    metadata.breadth_score_60_plus_pct     = n > 0 ? parseFloat((scores60plus / n * 100).toFixed(1)) : null;
    metadata.breadth_piotroski_5_plus_pct  = pioCount > 0 ? parseFloat((pio5plus / pioCount * 100).toFixed(1)) : null;
    metadata.dispersion_score_iqr          = iqr;
    metadata.mandato_sistemico_trim_pct    = calcularTrimSistemico() ?? 0;
    // SOLO dump contextual — no entra al cómputo de ningún campo del universo[]
    metadata.cartera_decisor_snapshot      = carteraDecisorData?.payload ?? null;

    // -- Descarga --------------------------------------------------------------
    // Sanity check de tamaño antes de serializar
    const payloadStr = JSON.stringify({ metadata, universo }, null, 2);
    if (payloadStr.length > 5_000_000) {
      console.warn("[TELEMETRIA] Payload > 5MB (" + (payloadStr.length/1e6).toFixed(1) + "MB). Considerar comprimir.");
    }
    const payload = { metadata, universo };
    const blob = new Blob([JSON.stringify(payload, null, 2)],
                          { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `telemetria_${fecha.replace(/-/g, "")}_v1.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };;


  const exportarContextoChat = () => {
    const withRS = twScore.filter(t=>t._rs!=null).sort((a,b)=>Number(b._rs)-Number(a._rs));
    const top10 = withRS.slice(0,10).map(t=>({symbol:t.symbol, sector:getSector(t.symbol), rs_20d:Number(Number(t._rs).toFixed(2)), change_pct:t.change_pct}));
    const bot10 = withRS.slice(-10).map(t=>({symbol:t.symbol, sector:getSector(t.symbol), rs_20d:Number(Number(t._rs).toFixed(2)), change_pct:t.change_pct}));
    const {alerts} = calcAlerts(snapshots, selDate);
    const alertasCrit = alerts.filter(a=>Math.abs(a.z)>=2).slice(0,10).map(a=>({symbol:a.symbol, tipo:a.type, z:a.z, cambio:a.change}));
    const portActual = getPortfolioWithMarket();
    const portResumen = portActual.map(p=>({ticker:p.ticker, pct_capital:p.pctCartera?.toFixed(1), variacion_hoy:p.precioActual!=null?p.change_pct??null:null, rs_20d:p.rs!=null?Number(Number(p.rs).toFixed(2)):null, pnl_pct:p.pnlPct?.toFixed(2), fase:p.fase}));
    const mandato = getMandatoSistemico();
    const sysExportChat = mandato ? ANALYST_SYS + "\n\nDIRECTIVA ACTIVA DEL MOTOR Z-SCORE: " + mandato : ANALYST_SYS;
    const texto = "=== SYSTEM PROMPT ===\n" + sysExportChat +
      "\n\n=== CONTEXTO DE MERCADO ===\n" +
      "CONTEXTO MACRO:\n" + buildMacroCtxText() + "\n\n" +
      "TOP 10 RS POSITIVO:\n" + JSON.stringify(top10,null,2) + "\n\n" +
      "BOTTOM 10 RS NEGATIVO:\n" + JSON.stringify(bot10,null,2) +
      (alertasCrit.length>0 ? "\n\nALERTAS CRITICAS (Z>=2):\n"+JSON.stringify(alertasCrit) : "") + "\n\n" +
      "CARTERA:\n" + (portActual.length>0?JSON.stringify(portResumen,null,2):"(vacia)") +
      "\nEfectivo: USD " + liquidezUSD.toFixed(2) +
      "\n\nINSTRUCCION: Responde preguntas sobre el mercado y la cartera usando este contexto.";
    setExportTitle("CONTEXTO CHAT");
    setExportJson(texto);
    setShowExport(true);
  };

  const exportarCartera = () => {
    if (portfolio.length === 0 && liquidezUSD === 0) return;
    const backup = { posiciones: portfolio, liquidezUSD };
    setExportJson(JSON.stringify(backup, null, 2));
    setShowExport(true);
  };

  const importarCartera = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // Formato nuevo: { posiciones, liquidezUSD }
        if (data.posiciones && Array.isArray(data.posiciones)) {
          savePortfolio(data.posiciones);
          if (data.liquidezUSD != null) saveLiquidez(data.liquidezUSD);
        } else if (Array.isArray(data)) {
          // Compatibilidad con backups viejos (solo array de posiciones)
          savePortfolio(data);
        } else {
          throw new Error("Formato de archivo no reconocido.");
        }
      } catch(err) {
        alert("Error al importar cartera: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const getPortfolioWithMarket = () => {
    const rows = portfolio.map(pos => {
      const exposicion = pos.cantidad / pos.ratio;
      const ticker = pos.ticker;
      const t = tickers.find(x => x.symbol === ticker);
      const rs = twScore.find(x => x.symbol === ticker)?._rs;
      const cyc = getCyclePhase(ticker, snapshots);
      const precioActual = t?.last_price ?? null;
      const change_pct = t?.change_pct ?? null;
      const precioBase = pos.precioSubyacente ?? pos.precioEntrada;
      const pnlPct = precioActual != null ? ((precioActual - precioBase) / precioBase * 100) : null;
      const valorPosicion = precioActual != null ? exposicion * precioActual : null;
      return { ...pos, exposicion, precioActual, change_pct, pnlPct, precioBase, valorPosicion, rs, fase: cyc?.label ?? null, faseCodigo: cyc };
    });
    // Calcular total cartera para pesos reales
    const totalCartera = rows.reduce((sum, r) => sum + (r.valorPosicion ?? 0), 0);
    return rows.map(r => ({
      ...r,
      pctCartera: totalCartera > 0 && r.valorPosicion != null ? (r.valorPosicion / totalCartera * 100) : null,
    }));
  };

  const auditarCartera = async () => {
    setPortAuditing(true); setPortAudit("");
    const posiciones = getPortfolioWithMarket();
    const conPrecio = posiciones.filter(p => p.precioActual != null).length;
    if (conPrecio === 0 && posiciones.length > 0) {
      setPortAudit("Sin precios actuales - carga el CSV del dia antes de auditar la cartera. El snapshot proporciona los precios que el analista necesita para calcular P&L, RS y valor de posicion.");
      setPortAuditing(false);
      return;
    }
    const totalRV = posiciones.reduce((s, p) => s + (p.valorPosicion ?? 0), 0);
    const totalCartera = totalRV + liquidezUSD;
    const payload = posiciones.map(p => ({
      ticker: p.ticker,
      tipo: p.tipo,
      cant_acciones: Number(p.exposicion.toFixed(4)),
      precio_entrada_subyacente_usd: Number(p.precioBase.toFixed(2)),
      precio_actual_usd: p.precioActual,
      valor_posicion_usd: p.valorPosicion != null ? Number(p.valorPosicion.toFixed(2)) : null,
      pct_capital_total: totalCartera > 0 && p.valorPosicion != null ? Number((p.valorPosicion / totalCartera * 100).toFixed(2)) : null,
      pnl_pct: p.pnlPct != null ? Number(p.pnlPct.toFixed(2)) : null,
      rs_20d: p.rs != null ? Number(Number(p.rs).toFixed(2)) : null,
      fase: p.fase ?? "SIN DATO",
      sigma: p.faseCodigo?.sigma ?? null,
      sigma_event: p.faseCodigo?.sigmaEvent ?? null,
      circuit_breaker: p.faseCodigo?.circuitBreaker ?? false,
    }));
    // totalStr siempre incluye el capital operativo aunque no haya posiciones
    const totalStr = "\n[CAPITAL TOTAL OPERATIVO: USD " + totalCartera.toFixed(2) + " - RV: USD " + totalRV.toFixed(2) + " | Efectivo libre: USD " + liquidezUSD.toFixed(2) + (totalCartera > 0 ? " (" + (liquidezUSD/totalCartera*100).toFixed(1) + "% liquidez)" : "") + "]";

    // ENRUTADOR Case 1: sectores filtrados + volatilidad historica + correlacion interna
    const portTickers = new Set(posiciones.map(p => p.ticker));
    const tks = snapshots[selDate]?.tickers || [];
    const sa = calcSectorArbitrage(tks.map(t => ({...t, _val_score: calcValScore(t)})), sectorUniverse);
    const sectoresResumen = Object.entries(sa).map(([s,d]) => ({ sector: s, baratos: d.tickers.filter(t=>t.avgZ<=-1.5).map(t=>t.symbol), caros: d.tickers.filter(t=>t.avgZ>=1.5).map(t=>t.symbol) })).filter(s => s.baratos.length > 0 || s.caros.length > 0);

    // Volatilidad historica: desviacion estandar de variaciones diarias en el historial disponible
    const calcVolatilidad = (sym) => {
      const dates = Object.keys(snapshots).sort();
      const changes = dates.map(d => snapshots[d]?.tickers?.find(t => t.symbol === sym)?.change_pct).filter(v => v != null);
      if (changes.length < 3) return null;
      const mean = changes.reduce((a,b) => a+b, 0) / changes.length;
      const std = Math.sqrt(changes.reduce((a,b) => a + (b-mean)**2, 0) / changes.length);
      return Number(std.toFixed(2));
    };

    // Correlaciones internas entre tickers del portfolio
    const portSymbols = [...portTickers];
    const corrInternas = [];
    for (let i = 0; i < portSymbols.length; i++) {
      for (let j = i+1; j < portSymbols.length; j++) {
        const c = calcCorrelation(portSymbols[i], portSymbols[j], snapshots);
        if (c != null) corrInternas.push({ par: portSymbols[i] + "/" + portSymbols[j], corr: Number(Number(c).toFixed(2)) });
      }
    }
    corrInternas.sort((a,b) => Math.abs(b.corr) - Math.abs(a.corr));

    // Payload enriquecido con volatilidad
    const payloadEnriquecido = payload.map(p => ({
      ...p,
      volatilidad_diaria_std: calcVolatilidad(p.ticker),
    }));
    const cicloCtx = cycleIndicators?.phase
      ? "\nCiclo macroeconomico detectado: " + cycleIndicators.phase.toUpperCase() +
        " (confianza: " + cycleIndicators.confidence + ")" +
        "\nProbabilidades: " + Object.entries(cycleIndicators.probabilities || {}).map(([k,v]) => k + " " + v + "%").join(" | ") +
        (cycleIndicators.signals?.length > 0 ? "\nSenales activas: " + cycleIndicators.signals.slice(0,3).join("; ") : "") +
        (cycleIndicators.macroSensors ? "\nSensores macro (Z-scores estadisticos):\n" + JSON.stringify(cycleIndicators.macroSensors) : "")
      : "\nCiclo macroeconomico: INSUFICIENTE HISTORIAL";
    const moveCtx = (() => {
      const mt = tickers.find(t => t.symbol === "^MOVE");
      if (!mt?.last_price) return "";
      return "\nMOVE: " + mt.last_price.toFixed(0) + (mt.change_pct != null ? " (hoy " + fmtPct(mt.change_pct) + ")" : "");
    })();
    try {
      const mandatoSis = getMandatoSistemico();
      const sysConMandato = mandatoSis
        ? RISK_MANAGER_SYS + "\n\nDIRECTIVA ACTIVA DEL MOTOR Z-SCORE: " + mandatoSis
        : RISK_MANAGER_SYS;
      const content = "Audita esta cartera:" + totalStr + cicloCtx + moveCtx +
        "\n\nPOSICIONES:\n" + JSON.stringify(payloadEnriquecido, null, 2) +
        (corrInternas.length > 0 ? "\n\nCORRELACIONES INTERNAS DEL PORTFOLIO:\n" + JSON.stringify(corrInternas) + "\nNota: correlaciones > 0.7 indican riesgo de concentracion real - estos activos se mueven en bloque." : "") +
        (sectoresResumen.length > 0 ? "\n\nSECTORES DISLOCADOS (mercado):\n" + JSON.stringify(sectoresResumen) : "");
      const reply = await callClaude(sysConMandato, [{ role: "user", content }], 3000, false);
      setPortAudit(reply);
    } catch(e) { setPortAudit("Error: " + e.message); }
    finally { setPortAuditing(false); }
  };

  const load = async () => {
    try {
      try { const fd=await window.storage.get("fmp:data",true); if(fd) setFmpData(JSON.parse(fd.value)); } catch {}
      try { const zp=await window.storage.get("zscore:params",true); if(zp) setZsParams(JSON.parse(zp.value)); } catch {}
      const {keys}=await window.storage.list("snap:",true);
      const loaded={};
      for (const k of keys) { try { const r=await window.storage.get(k,true); if(r) loaded[k.replace("snap:","")] = deserializeSnap(r.value); } catch {} }

      // ── Migración rank_aqr_pct (one-time) ──────────────────────────────────
      // Bug histórico: rank_aqr_pct se calculaba con t.aqr_score (campo inexistente)
      // en lugar de t.regime_score_aqr. Resultado: siempre 0. Fix: recalcular sobre
      // cada snapshot usando los datos ya almacenados. Se ejecuta una sola vez.
      try {
        const migFlag = await window.storage.get("migration:rank_aqr_pct_v1", true).catch(() => null);
        if (!migFlag) {
          const rankPctMig = (arr, val) => {
            const below = arr.filter(v => v < val).length;
            return arr.length > 1 ? parseFloat((below / (arr.length - 1) * 100).toFixed(2)) : 100;
          };
          let migratedCount = 0;
          for (const [date, snap] of Object.entries(loaded)) {
            if (!snap?.tickers?.length) continue;
            const scoresRadar = snap.tickers.map(t => t.score_final ?? 0);
            const scoresAQR   = snap.tickers.map(t => t.regime_score_aqr ?? 0);
            // Solo migrar si hay al menos un regime_score_aqr no-nulo (AQR cargado ese día)
            if (scoresAQR.every(v => v === 0)) continue;
            let changed = false;
            const newTickers = snap.tickers.map(t => {
              const rRP  = rankPctMig(scoresRadar, t.score_final      ?? 0);
              const rAQR = rankPctMig(scoresAQR,   t.regime_score_aqr ?? 0);
              const div  = parseFloat(Math.abs(rRP - rAQR).toFixed(2));
              if (t.rank_aqr_pct === rAQR && t.divergencia_rank_radar_aqr === div) return t;
              changed = true;
              return { ...t, rank_radar_pct: rRP, rank_aqr_pct: rAQR, divergencia_rank_radar_aqr: div };
            });
            if (changed) {
              loaded[date] = { ...snap, tickers: newTickers };
              await window.storage.set("snap:" + date, serializeSnap(loaded[date]), true).catch(() => {});
              migratedCount++;
            }
          }
          await window.storage.set("migration:rank_aqr_pct_v1", "1", true).catch(() => {});
          if (migratedCount > 0) console.log("[MIGRACIÓN] rank_aqr_pct corregido en", migratedCount, "snapshots.");
        }
      } catch(e) { console.warn("[MIGRACIÓN] rank_aqr_pct falló:", e.message); }
      // ────────────────────────────────────────────────────────────────────────
      setSnapshots(loaded);
      const dates=Object.keys(loaded).sort();
      if (dates.length) {
        setSelDate(dates[dates.length-1]);
        if(dates.length>1) setCmpDate(dates[dates.length-2]);
        const latestSnap = loaded[dates[dates.length-1]];
        const latestMove = latestSnap?.market?.move?.price;
        if (latestMove != null) setMoveIndex(latestMove);
        const latestMoveChg = latestSnap?.market?.move?.change_pct;
        if (latestMoveChg != null) setMoveChange(latestMoveChg);
      }
      // Portfolio: limpiar storage viejo, arrancar desde default hardcodeado
      try {
        const flag = await window.storage.get("portfolio:reset_v2", true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); return null; });
        if (!flag) {
          // Primera vez con esta version - limpiar storage viejo
          await window.storage.delete("portfolio:v1", true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
          await window.storage.delete("portfolio:cash", true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
          await window.storage.set("portfolio:reset_v2", "1", true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
        } else {
          // Version limpia - leer storage normalmente
          const pv = await window.storage.get("portfolio:v1", true);
          if (pv?.value) {
            const parsed = JSON.parse(pv.value);
            if (Array.isArray(parsed) && parsed.length > 0) setPortfolio(parsed);
          }
          const pc = await window.storage.get("portfolio:cash", true);
          if (pc?.value) setLiquidezUSD(parseFloat(pc.value)||0);
        }
      } catch {}
    } catch {}
  };

  const processUpload = async () => {
    if (!files.csv) { setUpStatus("Selecciona un archivo CSV primero."); return; }
    setUploading(true);
    try {
      setUpStatus("Leyendo CSV...");
      const csvText = await files.csv.text();
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map(h => { let t=h.trim(); if(t.startsWith('"')) t=t.slice(1); if(t.endsWith('"')) t=t.slice(0,-1); return t; });
      const getCol = (row, name) => {
        const idx = headers.indexOf(name);
        if (idx < 0) return null;
        const val = row[idx]?.trim().replace(/^[\x22]+|[\x22]+$/g,"");
        if (!val || val === "N/A" || val === "nan" || val === "None") return null;
        const n = parseFloat(val);
        return isNaN(n) ? val : n;
      };
      const rowsRaw = lines.slice(1).map(l => {
        const cols = [];
        let cur = "", inQ = false;
        for (const ch of l) {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
          else cur += ch;
        }
        cols.push(cur);
        return cols;
      }).filter(r => r.length >= 3);
      const marketMap = {"^GSPC":"sp500","^DJI":"dow30","^IXIC":"nasdaq","^RUT":"russell2000","^VIX":"vix","^TNX":"rate_10yr","^IRX":"rate_3mo","DX-Y.NYB":"dxy","GC=F":"gold","CL=F":"wti"};
      const market = {sp500:null,dow30:null,nasdaq:null,russell2000:null,vix:null,rate_10yr:null,rate_3mo:null,dxy:null,gold_spot:null,wti:null};

      // ETFs y activos macro que no tienen earnings corporativos reales.
      // Yahoo Finance les asigna P/E y Forward P/E absurdos (ej. -4301 para TLT).
      // Se nullifican en el origen para no contaminar el Radar ni la tabla.
      const MACRO_ETFS = new Set([
        "SPY","QQQ","DIA","IWM","TLT","HYG","LQD","GLD","SLV","COPX","URA","PSQ",
        "XLE","XLF","XLK","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
        "EWZ","FXI","EEM","ARKK","USO","SHY","IEF","AGG",
        "^VIX","^TNX","^IRX","^GSPC","^DJI","^IXIC","^RUT","^N225","^MERV",
        "DX-Y.NYB","BTC-USD","ETH-USD","GC=F","CL=F","HG=F","HG","SI=F",
      ]);

      const tickers = [];
      for (const row of rowsRaw) {
        const sym = row[headers.indexOf("Ticker")]?.trim().replace(/^[\x22]+|[\x22]+$/g,"");
        if (!sym) continue;
        const price = getCol(row, "Precio");
        const chgPct = getCol(row, "Change (%)");
        const pe = getCol(row, "P/E");
        const fpe = getCol(row, "Forward P/E");
        const pb = getCol(row, "P/Book");
        const divY = getCol(row, "Div Yield %");
        const mc = getCol(row, "Market Cap");
        const eps = getCol(row, "EPS TTM");
        const vol = getCol(row, "Volume");
        const hi52 = getCol(row, "52W High");
        const lo52 = getCol(row, "52W Low");
        if (marketMap[sym]) { market[marketMap[sym]] = {price, change_pct: chgPct}; }
        const etfMap = {"SPY":"sp500","QQQ":"nasdaq","DIA":"dow30","IWM":"russell2000","GLD":"gold","SLV":"silver","TLT":"bonds_lt","HYG":"hyg","LQD":"lqd","BTC-USD":"bitcoin","ETH-USD":"ethereum"};
        if (etfMap[sym] && price != null && chgPct != null) { if (!market[etfMap[sym]]?.price) { market[etfMap[sym]] = {price, change_pct: chgPct}; } }
        // MSTR, COIN y MARA son proxies de Bitcoin - sus metricas contables son intencionalmente visibles
        const CRYPTO_PROXIES = new Set(["MSTR","COIN","MARA"]);
        const isMacroEtf = !CRYPTO_PROXIES.has(sym) && (MACRO_ETFS.has(sym) || getSector(sym) === "ETFs/Indices" || getSector(sym) === "Macro/Divisas" || getSector(sym) === "Crypto" || sym.includes("=F") || sym.startsWith("^") || sym.endsWith("-USD"));
        tickers.push({
          symbol: sym, last_price: price, change_pct: chgPct, volume: vol, market_cap: mc,
          pe_ttm:     isMacroEtf ? null : pe,
          forward_pe: isMacroEtf ? null : fpe,
          price_book: pb, div_yield: divY, eps_ttm: eps, high_52w: hi52, low_52w: lo52,
          // CUCHILLO (pestana OPERAR) - columnas ya calculadas por el generador de
          // snapshots. Lectura directa, no se recalculan en el artefacto.
          drawdown_252d: getCol(row, "drawdown_252d"),
          vol_60d:       getCol(row, "vol_60d"),
          roc_63d:       getCol(row, "roc_63d"),
          _rs_yahoo:  getCol(row, "RS 20D"),  // RS 20D directo de Yahoo - retorno bruto 20 dias
          _roe:       isMacroEtf ? null : getCol(row, "ROE"),
          _roa:       isMacroEtf ? null : getCol(row, "ROA"),
          _roic:      isMacroEtf ? null : getCol(row, "ROIC"),
          _op_margin: isMacroEtf ? null : getCol(row, "Operating Margin"),
          _net_margin:isMacroEtf ? null : getCol(row, "Net Margin"),
          _fcf_yield: isMacroEtf ? null : getCol(row, "FCF Yield"),
          _ev_ebitda: isMacroEtf ? null : getCol(row, "EV/EBITDA"),
          _piotroski:    isMacroEtf ? null : getCol(row, "Piotroski"),
          _debt_eq:      isMacroEtf ? null : getCol(row, "Debt/Equity"),
          _curr_ratio:   isMacroEtf ? null : getCol(row, "Current Ratio"),
          // Grain Surprise Signals - mismo valor en todas las filas del snapshot
          _grain_is:     getCol(row, "Grain_IS"),
          _zc_surprise:  getCol(row, "ZC_Surprise"),
          _zs_surprise:  getCol(row, "ZS_Surprise"),
          // SPX Quarterly Divisor - escalar por sesion (volatilidad realizada S&P500)
          _spx_q_div:    getCol(row, "SPX_Quarterly_Divisor"),
          // SPX ROC 63d - retorno exacto de las ultimas 63 sesiones, calculado en Python
          _spx_roc_63d:  getCol(row, "SPX_ROC_63d"),
          // z_MOVE_inv - Z-score del MOVE Index calculado en Python (6 meses historia)
          // Fuente primaria; fallback a calcExponentialZScore interno si null
          _z_move_inv:   getCol(row, "z_MOVE_inv"),
          // Earnings Info (PEAD) - fecha de proximos/ultimos resultados
          earnings_info: (() => {
            // getCol devuelve numero si puede parsearlo (parseFloat)
            // Las fechas "2026-04-29" -> parseFloat -> 2026. Forzar string raw.
            const hdrs = headers;
            const rawStr = (col) => {
              const idx = hdrs.indexOf(col);
              if (idx < 0) return null;
              const v = row[idx]?.trim().replace(/^["]+|["]+$/g,"");
              return (!v || v==="N/A"||v==="nan"||v==="None") ? null : v;
            };
            const nextDate  = rawStr("Earnings_Next_Date");
            const lastDate  = rawStr("Earnings_Last_Date");
            const daysToRaw = getCol(row, "Earnings_Days_To_Next");
            const sinceRaw  = getCol(row, "Earnings_Days_Since");
            if (nextDate == null && lastDate == null) return null;

            // Calcular días dinámicamente desde la fecha actual para que no queden
            // hardcodeados al día que se generó el CSV.
            // Usar componentes locales (new Date(y,m-1,d)) para evitar timezone drift.
            const _hoy = new Date();
            const _hoyMn = new Date(_hoy.getFullYear(), _hoy.getMonth(), _hoy.getDate());
            const _parseDateLocal = (dateStr) => {
              if (!dateStr) return null;
              const parts = String(dateStr).split("-");
              if (parts.length !== 3) return null;
              const [y, m, d] = parts.map(Number);
              if (!y || !m || !d) return null;
              return new Date(y, m - 1, d);
            };

            const _nextD  = _parseDateLocal(nextDate);
            const _lastD  = _parseDateLocal(lastDate);
            const daysTo  = _nextD != null
              ? Math.round((_nextD - _hoyMn) / 86400000)
              : (daysToRaw != null ? Math.round(daysToRaw) : 999);
            const daysSince = _lastD != null
              ? Math.round((_hoyMn - _lastD) / 86400000)
              : (sinceRaw != null ? Math.round(sinceRaw) : null);

            return {
              next_expected_date:    nextDate,
              days_to_next_earnings: daysTo,
              last_report_date:      lastDate,
              days_since_earnings:   daysSince,
              earnings_source:       rawStr("Earnings_Source") ?? "none",
            };
          })(),
        });
      }
      if (tickers.length <= 5 || ["ETSY","META","MSFT","KO","VZ"].includes(tickers[tickers.length-1]?.symbol)) console.log("[PARSE]", tickers[tickers.length-1]?.symbol, "ei:", tickers[tickers.length-1]?.earnings_info);
      if (!market.sp500?.price) { const spy = tickers.find(t=>t.symbol==="SPY"); if (spy) market.sp500 = {price: spy.last_price, change_pct: spy.change_pct}; }
      const vixTicker = tickers.find(t=>t.symbol==="^VIX");
      if (!market.vix?.price && vixTicker) market.vix = {price: vixTicker.last_price, change_pct: vixTicker.change_pct};
      const hygT = tickers.find(t=>t.symbol==="HYG");
      const lqdT = tickers.find(t=>t.symbol==="LQD");
      const tltT = tickers.find(t=>t.symbol==="TLT");
      const dxyT = tickers.find(t=>t.symbol==="DX-Y.NYB");
      if (hygT) market.hyg = {price: hygT.last_price, change_pct: hygT.change_pct};
      if (lqdT) market.lqd = {price: lqdT.last_price, change_pct: lqdT.change_pct};
      if (tltT) market.tlt = {price: tltT.last_price, change_pct: tltT.change_pct};
      if (dxyT) market.dxy = {price: dxyT.last_price, change_pct: dxyT.change_pct};
      const moveT = tickers.find(t=>t.symbol==="^MOVE");
      if (moveT?.last_price != null) {
        market.move = {price: moveT.last_price, change_pct: moveT.change_pct ?? null};
        setMoveIndex(moveT.last_price);
        setMoveChange(moveT.change_pct ?? null);
      }
      // -- Grain IS (Agflation Surprise) - escalar por sesion ----------------
      const grainIsRow = tickers.find(t => t._grain_is != null);
      market.grainIs    = grainIsRow?._grain_is    ?? null;
      market.zcSurprise = grainIsRow?._zc_surprise ?? null;
      market.zsSurprise = grainIsRow?._zs_surprise ?? null;
      // -- SPX Quarterly Divisor - escalar por sesion ------------------------
      // Viene del CSV en decimal (ej: 0.082). Fallback: 0.08 historico.
      // El artefacto lo usa para normalizar z_roc252 en calcMacroDivergenceMultiplier.
      const spxQDivRow  = tickers.find(t => t._spx_q_div != null);
      market.spxQDiv    = spxQDivRow?._spx_q_div   ?? 0.08;
      // SPX_ROC_63d: fuente de verdad del spROC para el multiplicador M
      const spxRocRow   = tickers.find(t => t._spx_roc_63d != null);
      market.spxRoc63d  = spxRocRow?._spx_roc_63d  ?? null;
      // z_MOVE_inv: fuente primaria del Z-score del MOVE (Python, 6 meses historia)
      // Fallback: calcExponentialZScore interno via cycleVars (activo con >=60 snapshots)
      const zMoveRow    = tickers.find(t => t._z_move_inv != null);
      market.zMoveInv   = zMoveRow?._z_move_inv ?? null;
      setUpStatus("Guardando snapshot...");
      const KEEP = ["symbol","last_price","change_pct","volume","market_cap","pe_ttm","forward_pe","price_book","div_yield","eps_ttm","high_52w","low_52w","_roe","_roa","_op_margin","_net_margin","_fcf_yield","_ev_ebitda","_debt_eq","_curr_ratio","_piotroski"];
      const tickersLean = tickers.map(t => {
        const lean = {};
        for (const k of KEEP) if (t[k] != null) lean[k] = t[k];
        // earnings_info: NO se persiste en storage (siempre se reparsea del CSV en vivo)
        // El snapshot es solo para precios/fundamentales del heatmap historico y RS calculo
        return lean;
      });
      const cycleVars = { vix: market.vix?.price ?? null, vix_chg: market.vix?.change_pct ?? null, tnx: market.rate_10yr?.price ?? null, tnx_chg: market.rate_10yr?.change_pct ?? null, irx: market.rate_3mo?.price ?? null, irx_chg: market.rate_3mo?.change_pct ?? null, sp500: market.sp500?.price ?? null, sp500_chg: market.sp500?.change_pct ?? null, hyg_chg: market.hyg?.change_pct ?? null, lqd_chg: market.lqd?.change_pct ?? null, gold: market.gold?.price ?? null, gold_chg: market.gold?.change_pct ?? null, wti: market.wti?.price ?? null, wti_chg: market.wti?.change_pct ?? null, dxy_chg: market.dxy?.change_pct ?? null, iwm_chg: tickersLean.find(t=>t.symbol==="IWM")?.change_pct ?? null, xlf_chg: tickersLean.find(t=>t.symbol==="XLF")?.change_pct ?? null, hgf_price: tickersLean.find(t=>t.symbol==="HG=F")?.last_price ?? null, gcf_price: tickersLean.find(t=>t.symbol==="GC=F")?.last_price ?? null,
        move_price: market.move?.price ?? tickersLean.find(t=>t.symbol==="^MOVE")?.last_price ?? null };

      // mu/sigma calibrados via carga directa de VIXCLS.csv / MOVE.csv
      // Las series historicas no se persisten en storage — solo zscore:params
      const freshZsParams = zsParams ? {...zsParams} : null;

      const snap = {date: upDate, market, tickers: tickersLean, cycleVars, note: upNote, source: "csv", uploaded: new Date().toISOString(),
        risk_calibration: freshZsParams ? { vix_mu: freshZsParams.mu_vix, vix_sigma: freshZsParams.sigma_vix, move_mu: freshZsParams.mu_move, move_sigma: freshZsParams.sigma_move, calibrado: freshZsParams.calibrado } : null,
      };
      let existing = {};
      try { const st2 = await window.storage.get("snap:"+upDate, true); existing = st2 ? deserializeSnap(st2.value) : {}; } catch {}
      const merged = {...existing, ...snap, tickers: snap.tickers};
      // ROLLING WINDOW: si hay >=365 snaps en storage, borrar el mas antiguo antes de guardar
      try {
        const {keys: snapKeys} = await window.storage.list("snap:", true).catch(() => ({keys:[]}));
        if (snapKeys.length >= 365) {
          const sorted = snapKeys.map(k=>k).sort();
          const toDelete = sorted.slice(0, snapKeys.length - 364);
          for (const dk of toDelete) { await window.storage.delete(dk, true).catch(() => {}); }
        }
      } catch {}
      await window.storage.set("snap:"+upDate, serializeSnap(merged), true);
      // Persistir earnings_info en storage separado - sobrevive restore/reload
      // Siempre sobreescribir el storage para invalidar versiones con fechas malformadas
      try {
        const earningsMap = {};
        tickers.forEach(t => {
          const ei = t.earnings_info;
          // Validar fecha como string YYYY-MM-DD (contiene "-") - descarta parseFloat artifacts
          if (ei != null) {
            earningsMap[t.symbol] = ei;
          }
        });
        earningsStorageRef.current = earningsMap;
        // Siempre hacer set (aunque earningsMap este vacio) para limpiar datos viejos
        await window.storage.set("earnings:data", JSON.stringify(earningsMap), false);
        console.log("[EARNINGS] storage actualizado:", Object.keys(earningsMap).length, "tickers con fecha valida");
      } catch(e) { console.warn("[EARNINGS] storage save:", e.message); }
      setSnapshots(prev => ({...prev, [upDate]: merged}));
      setSelDate(upDate);
      setUpStatus("OK: "+tickers.length+" tickers cargados desde CSV.");
    } catch(e) { setUpStatus("ERROR: "+e.message); } finally { setUploading(false); }
  };

  const delSnap = async (date) => {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout de Storage")), 2000)
      );
      await Promise.race([
        window.storage.delete("snap:" + date, true),
        timeout
      ]);
    } catch (e) {}
    setSnapshots(prev => {
      const n = { ...prev };
      delete n[date];
      const rem = Object.keys(n).sort();
      setTimeout(() => setSelDate(rem.length ? rem[rem.length - 1] : null), 0);
      return n;
    });
  };

  // jobPollRef: id del setInterval de sondeo (null si no hay ninguno activo).
  // jobPrevRef: ultimo estado "corriendo" conocido de cada trabajo, para detectar
  // la transicion true->false (recien terminado) sin depender de closures viejas.
  const jobPollRef = useRef(null);
  const jobPrevRef = useRef({ snapshots: null, mercado_argentino: null });

  const pollEstadoActualizacion = async () => {
    try {
      const res = await fetch("/api/estado_actualizacion");
      const data = await res.json();
      setJobEstado(data);
      ["snapshots", "mercado_argentino"].forEach(k => {
        const prev = jobPrevRef.current[k];
        const cur = data[k];
        if (prev && prev.corriendo && cur && !cur.corriendo) {
          if (cur.ok) {
            setJobMsg(m => ({ ...m, [k]: "OK - actualizacion completada." }));
            setJobErrSalida(s => ({ ...s, [k]: null }));
            if (k === "snapshots") load();
          } else {
            setJobMsg(m => ({ ...m, [k]: "ERROR - la actualizacion no se pudo completar." }));
            setJobErrSalida(s => ({ ...s, [k]: cur.salida || "" }));
          }
        }
        jobPrevRef.current[k] = cur || null;
      });
      const algunoCorriendo = !!(data.snapshots?.corriendo || data.mercado_argentino?.corriendo);
      if (algunoCorriendo && !jobPollRef.current) {
        jobPollRef.current = setInterval(pollEstadoActualizacion, 4000);
      } else if (!algunoCorriendo && jobPollRef.current) {
        clearInterval(jobPollRef.current);
        jobPollRef.current = null;
      }
    } catch (e) { console.warn("[ACTUALIZACION] error consultando estado:", e.message); }
  };

  // Chequeo inicial al montar: si quedo un trabajo corriendo de antes (ej. la
  // pagina se recargo a mitad de camino), retoma el sondeo solo.
  useEffect(() => {
    pollEstadoActualizacion();
    return () => { if (jobPollRef.current) clearInterval(jobPollRef.current); };
  }, []);

  const lanzarActualizacion = async (tipo) => {
    setJobErrSalida(s => ({ ...s, [tipo]: null }));
    setJobMsg(m => ({ ...m, [tipo]: "" }));
    const url = tipo === "snapshots" ? "/api/actualizar_snapshots" : "/api/actualizar_mercado";
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!data.success) setJobMsg(m => ({ ...m, [tipo]: data.error || "Ya hay una actualizacion en curso." }));
      await pollEstadoActualizacion();
    } catch (e) {
      setJobMsg(m => ({ ...m, [tipo]: "ERROR - no se pudo contactar al servidor local." }));
    }
  };

  const cargarMercadoArgentino = async () => {
    setMercadoFotoLoading(true);
    setMercadoFotoErr(null);
    setMepHistErr(null);
    try {
      const res = await fetch("/Mercado%20argentino/foto_ultima.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      setMercadoFoto(await res.json());
    } catch (e) {
      setMercadoFotoErr("No se pudo leer la foto del mercado argentino.");
    }
    try {
      const res2 = await fetch("/Mercado%20argentino/datos/mep_diario.csv");
      if (!res2.ok) throw new Error("HTTP " + res2.status);
      const text = await res2.text();
      const rows = text.trim().split("\n").slice(1).map(l => {
        const [date, mep] = l.split(",");
        return { date, mep: parseFloat(mep) };
      }).filter(r => r.date && !isNaN(r.mep));
      setMepHist(rows);
    } catch (e) {
      setMepHistErr("No se pudo leer el historial del dolar MEP.");
    }
    setMercadoFotoLoading(false);
  };

  useEffect(() => {
    if (tab === "mercadoarg" && !mercadoFoto && !mercadoFotoLoading && !mercadoFotoErr) {
      cargarMercadoArgentino();
    }
  }, [tab]);

  const fotoEsVieja = useMemo(() => {
    if (!mercadoFoto?.fecha) return false;
    const f = new Date(mercadoFoto.fecha.replace(" ", "T"));
    if (isNaN(f.getTime())) return false;
    return (Date.now() - f.getTime()) / 86400000 > 3;
  }, [mercadoFoto]);

  const mepUltimoAnio = useMemo(() => {
    if (!mepHist.length) return [];
    const corte = new Date(); corte.setFullYear(corte.getFullYear() - 1);
    const recorte = mepHist.filter(r => new Date(r.date) >= corte);
    return recorte.length ? recorte : mepHist.slice(-252);
  }, [mepHist]);

  const cargarPrimaCedear = async () => {
    setPrimaLoading(true);
    setPrimaErr(null);
    setPrimaEmpty(false);
    try {
      const res = await fetch("/PPI/spreads_cedears.csv");
      if (res.status === 404) { setPrimaEmpty(true); setPrimaRows([]); setPrimaLoading(false); return; }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (!text.trim()) { setPrimaEmpty(true); setPrimaRows([]); setPrimaLoading(false); return; }
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim());
      const rows = lines.slice(1).filter(l => l.trim()).map(l => {
        const cols = l.split(",");
        const o = {};
        headers.forEach((h, i) => { o[h] = cols[i] !== undefined ? cols[i].trim() : ""; });
        return o;
      }).filter(r => r.cedear || r.ticker_us);
      if (!rows.length) { setPrimaEmpty(true); setPrimaRows([]); setPrimaLoading(false); return; }
      setPrimaRows(rows);
    } catch (e) {
      setPrimaErr("No se pudieron leer las capturas de PPI.");
    }
    setPrimaLoading(false);
  };

  useEffect(() => {
    if ((tab === "primacedear" || tab === "operar") && !primaRows.length && !primaLoading && !primaErr && !primaEmpty) {
      cargarPrimaCedear();
    }
  }, [tab]);

  // Ultima captura por ticker SUBYACENTE (ticker_us) del CSV de PPI - se
  // reutiliza para la pestana OPERAR (costos de ejecucion CEDEAR de la
  // cartera objetivo y de las ordenes propuestas). No toca primaPorTicker,
  // que agrupa por CEDEAR para la pestana PRIMA CEDEAR.
  const spreadsPorTickerUS = useMemo(() => {
    if (!primaRows.length) return {};
    const grupos = {};
    for (const r of primaRows) {
      const key = (r.ticker_us || "").toUpperCase();
      if (!key) continue;
      (grupos[key] = grupos[key] || []).push(r);
    }
    const out = {};
    for (const [key, rows] of Object.entries(grupos)) {
      const ordenadas = [...rows].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      out[key] = ordenadas[ordenadas.length - 1];
    }
    return out;
  }, [primaRows]);

  // -- SUPLENTES: los 5 primeros del universo que no estan en la cartera hoy,
  // en orden de posicion, con su costo CEDEAR mas reciente. "operable" si el
  // spread de la ultima captura es <= 1.5%, si no "verificar liquidez".
  const suplentes = useMemo(() => {
    const universo = operarResultado?.universo || [];
    if (!universo.length) return [];
    const carteraSet = new Set((operarResultado?.cartera || []).map(c => (c.ticker || "").toUpperCase()));
    const candidatos = [...universo]
      .filter(u => u.ticker && !carteraSet.has(u.ticker.toUpperCase()))
      .sort((a, b) => (a.posicion ?? 1e9) - (b.posicion ?? 1e9))
      .slice(0, 5);
    return candidatos.map(u => {
      const cap = spreadsPorTickerUS[(u.ticker || "").toUpperCase()];
      const spread = cap ? parseFloat(cap.spread_ars_pct) : null;
      const operable = spread != null && !isNaN(spread) && spread <= 1.5;
      return { posicion: u.posicion, ticker: u.ticker, score: u.score, cap, spread, operable };
    });
  }, [operarResultado, spreadsPorTickerUS]);

  // Primeros 2 suplentes operables - se ofrecen como alternativa debajo de
  // cada compra propuesta en Ordenes propuestas.
  const suplentesOperables = useMemo(() => suplentes.filter(s => s.operable).slice(0, 2), [suplentes]);

  const textoAlternativas = suplentesOperables.length
    ? "Si no la conseguís, alternativas en orden: " + suplentesOperables.map(s => `${s.ticker} (puesto ${s.posicion}, spread ${fmt(s.spread,2)}%)`).join(", ")
    : null;

  // Top-12 del universo tal cual, sin filtrar por cartera actual - "lo que
  // el sistema armaria hoy si empezara de cero". Puramente informativo.
  const carteraTeorica = useMemo(() => {
    const universo = operarResultado?.universo || [];
    return [...universo].sort((a, b) => (a.posicion ?? 1e9) - (b.posicion ?? 1e9)).slice(0, 12);
  }, [operarResultado]);

  // Puestos 13 a 17 del ranking - "los 5 siguientes", continuacion directa
  // del top-12 teorico. Se muestran juntos en el panel "EL RANKING DEL
  // SISTEMA HOY" (fusion de los ex-bloques Suplentes y Cartera teorica).
  const rankingSiguientes5 = useMemo(() => {
    const universo = operarResultado?.universo || [];
    return [...universo].sort((a, b) => (a.posicion ?? 1e9) - (b.posicion ?? 1e9)).slice(12, 17);
  }, [operarResultado]);

  // -- Cartera real declarada: lo que quedo guardado en estado_cartera.json
  // (se actualiza al instante con cada correccion, cargarOperar() lo trae de
  // nuevo apenas se aplica). Distinta de operarResultado.cartera, que es la
  // ultima corrida del motor y puede haber quedado desactualizada.
  const carteraRealTickers = useMemo(() => {
    return Object.keys(operarEstadoCartera?.cartera || {}).sort();
  }, [operarEstadoCartera]);

  // Desfase: la cartera real ya no coincide con la que muestra la tabla
  // (porque el motor todavia no corrio despues de una correccion). Los dos
  // estados no deben convivir en silencio.
  const carteraDesfasada = useMemo(() => {
    if (!operarEstadoCartera || !operarResultado) return false;
    const motorTickers = (operarResultado.cartera || []).map(t => t.ticker).filter(Boolean).sort();
    if (carteraRealTickers.length !== motorTickers.length) return true;
    for (let i = 0; i < carteraRealTickers.length; i++) {
      if (carteraRealTickers[i] !== motorTickers[i]) return true;
    }
    return false;
  }, [carteraRealTickers, operarResultado, operarEstadoCartera]);

  // -- CUCHILLO: overlay informativo. Los registros de "snapshots" (estado de
  // la app) se parsearon ANTES de que el parser conociera estas columnas, asi
  // que quedan en null aunque el CSV en disco las tenga. Solucion: para el
  // cuchillo (solo para el cuchillo, no toca la ingesta general de snapshots)
  // se lee el CSV mas reciente directo de disco, fresco, con su propio parseo
  // simple (mismo estilo que cargarPrimaCedear). Se cachea en cuchilloFilas -
  // se carga una vez al entrar a OPERAR y se recarga tras Actualizar motor.
  const cargarCuchilloCSV = async () => {
    setCuchilloCargando(true);
    setCuchilloErr(null);
    try {
      const resLista = await fetch("/api/listar_snapshots");
      if (!resLista.ok) throw new Error("HTTP " + resLista.status);
      const dataLista = await resLista.json();
      const nombres = dataLista.snapshots || [];
      if (!nombres.length) { setCuchilloErr("No hay snapshots disponibles en disco."); setCuchilloFilas([]); setCuchilloSnapshotDate(null); setCuchilloCargando(false); return; }
      const nombreReciente = nombres[nombres.length - 1];
      const matchFecha = nombreReciente.match(/(\d{4}-\d{2}-\d{2})/);
      const res = await fetch("/Snapshots%20diarios/" + nombreReciente + "?t=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim());
      const rows = lines.slice(1).filter(l => l.trim()).map(l => {
        const cols = l.split(",");
        const o = {};
        headers.forEach((h, i) => { o[h] = cols[i] !== undefined ? cols[i].trim() : ""; });
        return o;
      }).filter(r => r.Ticker);
      const filas = rows.map(r => ({
        ticker: r.Ticker,
        drawdown_252d: r.drawdown_252d !== undefined && r.drawdown_252d !== "" ? parseFloat(r.drawdown_252d) : null,
        vol_60d: r.vol_60d !== undefined && r.vol_60d !== "" ? parseFloat(r.vol_60d) : null,
        roc_63d: r.roc_63d !== undefined && r.roc_63d !== "" ? parseFloat(r.roc_63d) : null,
      })).map(f => ({
        ...f,
        drawdown_252d: isNaN(f.drawdown_252d) ? null : f.drawdown_252d,
        vol_60d: isNaN(f.vol_60d) ? null : f.vol_60d,
        roc_63d: isNaN(f.roc_63d) ? null : f.roc_63d,
      }));
      setCuchilloFilas(filas);
      setCuchilloSnapshotDate(matchFecha ? matchFecha[1] : nombreReciente);
    } catch (e) {
      setCuchilloErr("No se pudieron leer los datos del cuchillo.");
      setCuchilloFilas([]);
      setCuchilloSnapshotDate(null);
    }
    setCuchilloCargando(false);
  };

  useEffect(() => {
    if (tab === "operar" && !cuchilloFilas.length && !cuchilloCargando && !cuchilloErr) {
      cargarCuchilloCSV();
    }
  }, [tab]);

  const cuchilloPorTicker = useMemo(() => {
    if (!cuchilloFilas.length) return {};
    const filasValidas = cuchilloFilas.filter(t => t.drawdown_252d != null && t.vol_60d != null && t.roc_63d != null);
    const ddP30  = percentilUmbralCuchillo(filasValidas.map(t => t.drawdown_252d).sort((a,b)=>a-b), 30);
    const volP70 = percentilUmbralCuchillo(filasValidas.map(t => t.vol_60d).sort((a,b)=>a-b), 70);
    const rocP30 = percentilUmbralCuchillo(filasValidas.map(t => t.roc_63d).sort((a,b)=>a-b), 30);

    const out = {};
    for (const t of cuchilloFilas) {
      if (!t.ticker) continue;
      if (t.drawdown_252d == null || t.vol_60d == null || t.roc_63d == null) {
        out[t.ticker] = { sinDatos: true, n: null };
        continue;
      }
      let n = 0;
      if (ddP30 != null && t.drawdown_252d <= ddP30) n++;
      if (volP70 != null && t.vol_60d >= volP70) n++;
      if (rocP30 != null && t.roc_63d <= rocP30) n++;
      out[t.ticker] = { sinDatos: false, n, drawdown_252d: t.drawdown_252d, vol_60d: t.vol_60d, roc_63d: t.roc_63d };
    }
    return out;
  }, [cuchilloFilas]);

  const CUCHILLO_TOOLTIP = "Zona cuchillo: papel líquido lejos de su máximo anual, con volatilidad alta y momentum negativo. En el estudio del 18-19/07 (datos 2009-2020 fuera de muestra), estos papeles rindieron ~4% mensual PEOR que sus pares. Es información, no una orden: el motor no lo usa para decidir. Nota: el momentum del estudio era de 252 ruedas; acá se usa roc_63d como aproximación.";
  const CUCHILLO_SD_TOOLTIP = "Sin datos suficientes en el snapshot mas reciente para evaluar drawdown_252d / vol_60d / roc_63d.";

  // -- Capa de explicacion (directiva de Gonzalo): el sistema es una guia y
  // tiene que decir que hace, por que, y que esperar de cada operacion.
  // Textos exactos - no parafrasear.
  const EXPLICACION_SISTEMA_TEXTO = "Este sistema no intenta adivinar qué acción va a subir. Hace cuatro cosas: (1) Cobrar el retorno del mercado (beta) manteniéndose siempre invertido en 12 empresas de calidad y baja volatilidad, a partes iguales. (2) Evitar las zonas donde históricamente se pierde: calidad contable mala y papeles en caída violenta (etiqueta CUCHILLO: en el estudio 2009-2020, esos papeles rindieron ~4% mensual peor que sus pares). (3) Defenderse: el % de EXPOSICIÓN recorta la inversión en pánicos — en las crisis históricas (2008, 2018, 2020) eso redujo la caída máxima a la mitad. (4) Rotar poco: una posición dura trimestres y cada cambio cuesta 0,6-1,2% más la prima CEDEAR del día. Qué esperar de cada posición individual: ~52% de probabilidad de superar a la acción mediana a 12 meses — apenas mejor que una moneda. El sistema no sabe cuál de las 12 va a ganar; su ventaja medida está en evitar el grupo malo (44% de acierto) y en la defensa. Regla de honestidad: si esta cartera pierde contra comprar-y-mantener SPY incluso en las caídas, el plan ordena apagarla e indexar. Se evalúa formalmente en el mes 12 de validación.";

  const VENTA_EXPLICACION_TEXTO = "Por qué: la señal que trajo este papel se degradó de forma sostenida (la histéresis exige persistencia — no es ruido de un día). Qué esperar: evitar el arrastre de un papel en deterioro; si estas expulsiones aciertan o no se está midiendo con la telemetría (respuesta ~mes 6 de validación). Costo de ejecutar: el spread y la prima de la tabla.";

  const COMPRA_EXPLICACION_TEXTO = "Por qué: entra al Top-12 por calidad contable y baja volatilidad. Qué esperar: ~52% de superar a la mediana a 12 meses. Su rol es mantener la cartera en la zona buena del ranking, no acertarle al ganador.";

  const ROL_CARTERA_TEXTO = "Rol en la cartera: 1/12 del capital en la zona alta del ranking de calidad+estabilidad. Expectativa individual honesta: ~52% de superar a la mediana a 12m; el valor está en el conjunto.";

  const renderCuchillo = (sym) => {
    const c = cuchilloPorTicker[sym];
    if (!c || c.sinDatos) {
      return <span title={CUCHILLO_SD_TOOLTIP} style={{fontSize:"9px",fontWeight:600,color:"var(--muted)",cursor:"help"}}>s/d</span>;
    }
    if (!c.n) return null;
    if (c.n >= 3) {
      return <span title={CUCHILLO_TOOLTIP} style={{fontSize:"9px",fontWeight:700,color:"var(--red)",background:"rgba(255,59,92,0.12)",border:"1px solid rgba(255,59,92,0.4)",padding:"1px 6px",borderRadius:"2px",letterSpacing:"0.04em",cursor:"help"}}>⚠ CUCHILLO</span>;
    }
    return <span title={CUCHILLO_TOOLTIP} style={{fontSize:"9px",fontWeight:600,color:"var(--muted)",background:"var(--bg)",border:"1px solid var(--border2)",padding:"1px 6px",borderRadius:"2px",letterSpacing:"0.04em",cursor:"help"}}>cuchillo {c.n}/3</span>;
  };

  // -- OPERAR: carga de resultado_del_dia.json y estado_cartera.json --------
  const cargarOperar = async () => {
    setOperarLoading(true);
    try {
      const res = await fetch("/Nuevo%20Motor%20Local/resultado_del_dia.json?t=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      setOperarResultado(await res.json());
      setOperarResultadoErr(null);
    } catch (e) {
      setOperarResultado(null);
      setOperarResultadoErr("No se pudo leer el resultado del motor.");
    }
    try {
      const res2 = await fetch("/Nuevo%20Motor%20Local/estado_cartera.json?t=" + Date.now());
      if (!res2.ok) throw new Error("HTTP " + res2.status);
      setOperarEstadoCartera(await res2.json());
      setOperarEstadoCarteraErr(null);
    } catch (e) {
      setOperarEstadoCartera(null);
      setOperarEstadoCarteraErr("No se pudo leer el estado de la cartera.");
    }
    setOperarLoading(false);
  };

  useEffect(() => {
    if (tab === "operar" && !operarResultado && !operarLoading && !operarResultadoErr) {
      cargarOperar();
    }
  }, [tab]);

  // jobMotorPollRef: sondeo propio (1.5s) del job "motor", igual de patron
  // que consultaPollRef - no toca pollEstadoActualizacion ni lanzarActualizacion
  // (esos siguen sirviendo solo a snapshots/mercado_argentino, sin cambios).
  const jobMotorPollRef = useRef(null);
  const jobMotorPrevCorriendoRef = useRef(null);

  const pollJobMotor = async () => {
    try {
      const res = await fetch("/api/estado_actualizacion");
      const data = await res.json();
      const cur = data.motor || null;
      setJobEstado(j => ({ ...j, motor: cur }));
      const prevCorriendo = jobMotorPrevCorriendoRef.current;
      if (prevCorriendo && cur && !cur.corriendo) {
        if (cur.ok) {
          setJobMsg(m => ({ ...m, motor: "OK - motor actualizado." }));
          setJobErrSalida(s => ({ ...s, motor: null }));
          cargarOperar();
          cargarCuchilloCSV();
        } else {
          setJobMsg(m => ({ ...m, motor: "ERROR - el motor no pudo completar la corrida." }));
          setJobErrSalida(s => ({ ...s, motor: cur.salida || "" }));
        }
      }
      jobMotorPrevCorriendoRef.current = !!(cur && cur.corriendo);
      if (cur && cur.corriendo) {
        if (!jobMotorPollRef.current) jobMotorPollRef.current = setInterval(pollJobMotor, 1500);
      } else if (jobMotorPollRef.current) {
        clearInterval(jobMotorPollRef.current);
        jobMotorPollRef.current = null;
      }
    } catch (e) { console.warn("[MOTOR] error consultando estado:", e.message); }
  };

  useEffect(() => {
    pollJobMotor();
    return () => { if (jobMotorPollRef.current) clearInterval(jobMotorPollRef.current); };
  }, []);

  // -- Correccion de cartera (el usuario declara la realidad, el sistema no
  // adivina). Endpoint ya implementado y probado en el servidor - no se toca.
  const corregirCartera = async ({ quitar = [], agregar = [], motivo = "", mensajeExito = null }) => {
    setCorreccionEnviando(true);
    setCorreccionMsg(null);
    try {
      const res = await fetch("/api/corregir_cartera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quitar, agregar, motivo }),
      });
      const data = await res.json();
      if (!data.success) {
        setCorreccionMsg({ tipo: "error", texto: data.error || "No se pudo aplicar la correccion." });
        setCorreccionEnviando(false);
        return false;
      }
      let texto = mensajeExito || data.recordatorio || "Correccion aplicada.";
      if (data.aviso_no_estaban && data.aviso_no_estaban.length) {
        texto += " (" + data.aviso_no_estaban.join(", ") + " no estaba" + (data.aviso_no_estaban.length > 1 ? "n" : "") + " en la cartera registrada.)";
      }
      setCorreccionMsg({ tipo: "ok", texto, nPosiciones: data.n_posiciones });
      setMotorResaltado(true);
      await cargarOperar();
      setCorreccionEnviando(false);
      return true;
    } catch (e) {
      setCorreccionMsg({ tipo: "error", texto: "No se pudo contactar al servidor local." });
      setCorreccionEnviando(false);
      return false;
    }
  };

  // El resultado de corregirCartera se muestra en varios puntos de la
  // pantalla (cerca de cada control, no solo arriba en ACTUALIZAR MOTOR) -
  // si no, la confirmacion queda invisible fuera de pantalla y parece que
  // "no paso nada" aunque el pedido si se aplico.
  const renderCorreccionMsg = () => {
    if (!correccionMsg) return null;
    return (
      <div style={{fontSize:"10px",marginTop:"10px",padding:"7px 10px",borderRadius:"4px",background:"var(--bg)",color:correccionMsg.tipo==="ok"?"var(--green)":"var(--red)",borderLeft:"2px solid "+(correccionMsg.tipo==="ok"?"var(--green)":"var(--red)")}}>
        {correccionMsg.texto}
        {correccionMsg.tipo==="ok" && correccionMsg.nPosiciones!=null && correccionMsg.nPosiciones!==12 && (
          <div style={{marginTop:"6px",color:"var(--amber)"}}>Cartera con {correccionMsg.nPosiciones} posiciones (el objetivo es 12) — el motor lo va a tener en cuenta en el próximo rebalanceo.</div>
        )}
      </div>
    );
  };

  const lanzarActualizacionMotor = async () => {
    setMotorResaltado(false);
    setJobErrSalida(s => ({ ...s, motor: null }));
    setJobMsg(m => ({ ...m, motor: "" }));
    try {
      const res = await fetch("/api/actualizar_motor", { method: "POST" });
      const data = await res.json();
      if (!data.success) setJobMsg(m => ({ ...m, motor: data.error || "Ya hay una actualizacion en curso." }));
      await pollJobMotor();
    } catch (e) {
      setJobMsg(m => ({ ...m, motor: "ERROR - no se pudo contactar al servidor local." }));
    }
  };

  const guardarCapital = async () => {
    const val = parseFloat(capitalInput);
    if (!val || val <= 0) { setCapitalMsg("Ingresa un numero positivo."); return; }
    setCapitalSaving(true);
    setCapitalMsg("");
    try {
      const res = await fetch("/api/set_capital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital: val }),
      });
      const data = await res.json();
      if (!data.success) {
        setCapitalMsg(data.error || "No se pudo guardar.");
        setCapitalSaving(false);
        return;
      }
      setCapitalMsg("OK - capital guardado. Conviene actualizar el motor para recalcular con este valor.");
      setCapitalInput("");
      setCapitalEditando(false);
      await cargarOperar();
    } catch (e) {
      setCapitalMsg("ERROR - no se pudo contactar al servidor local.");
    }
    setCapitalSaving(false);
  };

  // Ultima captura por ticker + percentil de la prima contra su propia
  // historia (mismo patron de rank percentil que ya usa el archivo en la
  // migracion rank_aqr_pct: proporcion de capturas historicas por debajo).
  const diasHabilesTranscurridos = (fechaStr) => {
    const f = new Date(fechaStr + "T00:00:00");
    if (isNaN(f.getTime())) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let d = new Date(f), count = 0;
    while (d < hoy) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  };

  const primaPorTicker = useMemo(() => {
    if (!primaRows.length) return [];
    const grupos = {};
    for (const r of primaRows) {
      const key = r.cedear || r.ticker_us;
      if (!key) continue;
      (grupos[key] = grupos[key] || []).push(r);
    }
    return Object.entries(grupos).map(([key, rows]) => {
      const ordenadas = [...rows].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      const ultima = ordenadas[ordenadas.length - 1];
      const histPrima = ordenadas.map(r => parseFloat(r.prima_mep_pct)).filter(v => !isNaN(v));
      const n = histPrima.length;
      let percentil = null;
      const hoyVal = parseFloat(ultima.prima_mep_pct);
      if (n >= 10 && !isNaN(hoyVal) && n > 1) {
        const menores = histPrima.filter(v => v < hoyVal).length;
        percentil = (menores / (n - 1)) * 100;
      }
      return { key, ultima, n, percentil };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }, [primaRows]);

  const primaPromedioCartera = useMemo(() => {
    if (!primaPorTicker.length) return null;
    const vals = primaPorTicker.map(r => parseFloat(r.ultima?.prima_mep_pct)).filter(v => !isNaN(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [primaPorTicker]);

  // -- Filtros de liquidez (pestana PRIMA CEDEAR) -----------------------------
  // "Poco liquido" = sin puntas (spread no calculable), spread > 1%, o la
  // ultima captura del ticker no es de la fecha mas reciente presente en el
  // CSV (quedo desactualizado). "Operable" es el complemento exacto, para que
  // los tres botones (Todos/Operables/Poco liquidos) sean mutuamente
  // excluyentes y sumen el total. No toca primaRows ni primaPorTicker.
  const primaFechaMasReciente = useMemo(() => {
    let max = "";
    for (const r of primaRows) { if (r.fecha && r.fecha > max) max = r.fecha; }
    return max;
  }, [primaRows]);

  const primaEsPocoLiquido = (row) => {
    const spread = parseFloat(row.ultima?.spread_ars_pct);
    return isNaN(spread) || spread > 1 || row.ultima?.fecha !== primaFechaMasReciente;
  };

  const primaCounts = useMemo(() => {
    let operables = 0, pocoLiquidos = 0;
    for (const r of primaPorTicker) {
      if (primaEsPocoLiquido(r)) pocoLiquidos++; else operables++;
    }
    return { todos: primaPorTicker.length, operables, pocoLiquidos };
  }, [primaPorTicker, primaFechaMasReciente]);

  const handlePrimaOrden = (campo) => {
    setPrimaOrden(prev => prev.campo === campo ? { campo, direccion: prev.direccion === "asc" ? "desc" : "asc" } : { campo, direccion: "asc" });
  };

  const primaPorTickerFiltrado = useMemo(() => {
    let lista = primaPorTicker;
    if (primaFiltro === "operables") lista = lista.filter(r => !primaEsPocoLiquido(r));
    else if (primaFiltro === "pocoliquidos") lista = lista.filter(r => primaEsPocoLiquido(r));
    const dir = primaOrden.direccion === "asc" ? 1 : -1;
    const arr = [...lista];
    arr.sort((a, b) => {
      if (primaOrden.campo === "nombre") return a.key.localeCompare(b.key) * dir;
      const va = primaOrden.campo === "spread" ? parseFloat(a.ultima?.spread_ars_pct) : parseFloat(a.ultima?.prima_mep_pct);
      const vb = primaOrden.campo === "spread" ? parseFloat(b.ultima?.spread_ars_pct) : parseFloat(b.ultima?.prima_mep_pct);
      const aNan = isNaN(va), bNan = isNaN(vb);
      if (aNan && bNan) return 0;
      if (aNan) return 1;
      if (bNan) return -1;
      return (va - vb) * dir;
    });
    return arr;
  }, [primaPorTicker, primaFiltro, primaOrden, primaFechaMasReciente]);

  // consultaPollRef: sondeo propio de la consulta puntual, mas rapido (1.5s)
  // que el de snapshots/mercado (4s) porque el usuario espera el resultado
  // en pantalla en vez de dejarlo correr de fondo por minutos.
  const consultaPollRef = useRef(null);
  const consultaPrevCorriendoRef = useRef(null);

  const pollConsultaPrima = async () => {
    try {
      const res = await fetch("/api/estado_actualizacion");
      const data = await res.json();
      const cur = data.consulta_prima || null;
      setConsultaEstado(cur);
      const prevCorriendo = consultaPrevCorriendoRef.current;
      if (prevCorriendo && cur && !cur.corriendo) {
        if (cur.ok) {
          try {
            const r2 = await fetch("/PPI/consulta_ultima.json?t=" + Date.now());
            if (!r2.ok) throw new Error("HTTP " + r2.status);
            setConsultaResultado(await r2.json());
            setConsultaResultadoErr(null);
          } catch (e) {
            setConsultaResultadoErr("No se pudo leer el resultado de la consulta.");
          }
        }
      }
      consultaPrevCorriendoRef.current = !!(cur && cur.corriendo);
      if (cur && cur.corriendo) {
        if (!consultaPollRef.current) consultaPollRef.current = setInterval(pollConsultaPrima, 1500);
      } else if (consultaPollRef.current) {
        clearInterval(consultaPollRef.current);
        consultaPollRef.current = null;
      }
    } catch (e) { console.warn("[CONSULTA_PRIMA] error consultando estado:", e.message); }
  };

  // Chequeo inicial: si quedo una consulta corriendo de antes, retoma el sondeo.
  useEffect(() => {
    pollConsultaPrima();
    return () => { if (consultaPollRef.current) clearInterval(consultaPollRef.current); };
  }, []);

  const lanzarConsultaPrima = async () => {
    const tickers = consultaTickers.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 10);
    if (!tickers.length) { setConsultaMsg("Ingresa al menos un ticker."); return; }
    setConsultaMsg("");
    setConsultaResultado(null);
    setConsultaResultadoErr(null);
    try {
      const res = await fetch("/api/consultar_prima", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!data.success) { setConsultaMsg(data.error || "No se pudo lanzar la consulta."); return; }
      await pollConsultaPrima();
    } catch (e) {
      setConsultaMsg("No se pudo contactar al servidor local.");
    }
  };

  const consultaFilasPorPedido = useMemo(() => {
    if (!consultaResultado) return [];
    const pedidos = consultaResultado.pedidos || [];
    const filas = consultaResultado.filas || [];
    return pedidos.map(p => {
      const fila = filas.find(f => (f.cedear || "").toUpperCase() === String(p).toUpperCase() || (f.ticker_us || "").toUpperCase() === String(p).toUpperCase());
      return { pedido: p, fila };
    });
  }, [consultaResultado]);

  useEffect(() => {
    fetch("/PPI/ratios_cedears.json")
      .then(r => r.ok ? r.json() : {})
      .then(data => setTickersConocidos(Object.keys(data).filter(k => !k.startsWith("_")).sort()))
      .catch(() => {});
  }, []);

  // Token que el usuario esta tipeando ahora mismo (el input admite varios
  // tickers separados por espacio o coma; solo autocompletamos el ultimo).
  const consultaTokenActual = useMemo(() => {
    const partes = consultaTickers.split(/[\s,]+/);
    return partes[partes.length - 1] || "";
  }, [consultaTickers]);

  const consultaSugerencias = useMemo(() => {
    const t = consultaTokenActual.trim().toUpperCase();
    if (!t || !tickersConocidos.length) return [];
    const empiezaCon = tickersConocidos.filter(k => k.startsWith(t));
    const contiene = tickersConocidos.filter(k => !k.startsWith(t) && k.includes(t));
    return [...empiezaCon, ...contiene].slice(0, 8);
  }, [consultaTokenActual, tickersConocidos]);

  const elegirSugerenciaConsulta = (ticker) => {
    const partes = consultaTickers.split(/[\s,]+/);
    partes[partes.length - 1] = ticker;
    setConsultaTickers(partes.filter(Boolean).join(" ") + " ");
    setMostrarSugerencias(false);
  };

  const openNews = async (symbol) => {
    setNewsModal({symbol,content:null}); setNewsLoading(true);
    try {
      const t=snapshots[selDate]?.tickers?.find(x=>x.symbol===symbol);
      const ctx=t?"Precio: "+fmt(t.last_price)+", variacion: "+fmtPct(t.change_pct)+", Forward P/E: "+fmt(t.forward_pe):"";
      const reply=await callClaude("Sos un analista financiero. Busca noticias recientes sobre el ticker indicado y resume los puntos mas relevantes en texto plano sin markdown, sin asteriscos. Maximo 5 puntos concisos.",[{role:"user",content:"Noticias recientes sobre "+symbol+". "+ctx}],800,true);
      setNewsModal({symbol,content:reply});
    } catch(e) { setNewsModal({symbol,content:"Error: "+e.message}); } finally { setNewsLoading(false); }
  };

  const exportSnapshots = async () => {
    try {
      const data = {};
      for (const [date, snap] of Object.entries(snapshots)) {
        data["snap:" + date] = JSON.stringify(snap);
      }
      if (Object.keys(data).length === 0) { alert("Sin datos cargados para exportar."); return; }
      if (zsParams?.mu_vix) data["zscore:params"] = JSON.stringify(zsParams);
      // Portfolio como clave independiente en el backup
      if (portfolio.length > 0) data["portfolio:v1"] = JSON.stringify(portfolio);
      if (liquidezUSD > 0) data["portfolio:cash"] = String(liquidezUSD);
      // Incluir historial ROC 252d y Regime Scores dinamicos
      try {
        const rh = await window.storage.get("roc:history",    true);
        const ds = await window.storage.get("dynamic:scores", true);
        if (rh?.value) data["roc:history"]    = rh.value;
        if (ds?.value) data["dynamic:scores"] = ds.value;
      } catch {}
      // Incluir radarTracked
      try {
        const rt = await window.storage.get("radar:tracked", true);
        if (rt?.value) data["radar:tracked"] = rt.value;
      } catch {}
      // Incluir universo sectorial fijo - necesario para z_sectorial reproducible
      // Sin esto, se pierde al restaurar el backup y los z_sectorial vuelven a "sesion_actual"
      if (sectorUniverse) data["sector:universe"] = JSON.stringify(sectorUniverse);
      const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = "900magnificas_backup_" + new Date().toISOString().slice(0,10) + ".json";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch(e) { alert("Error al exportar: " + e.message); }
  };

  const importSnapshots = async () => {
    if (!importJson.trim()) return;
    setImportStatus("Importando en memoria...");
    try {
      const data = JSON.parse(importJson.trim());
      let count = 0;

      // Restaurar universo sectorial si viene en el backup
      if (data["sector:universe"]) {
        try {
          const su = JSON.parse(data["sector:universe"]);
          if (su?.sectores) {
            setSectorUniverse(su);
            console.log("[BACKUP] Universo sectorial restaurado:", Object.keys(su.sectores).length, "sectores");
          }
        } catch (e) { console.warn("[BACKUP] Error restaurando sector:universe:", e); }
      }
      // Separar entradas: snapshots vs matrices de calibracion
      const snapEntries   = Object.entries(data).filter(([k]) => k.startsWith("snap:"));
      const zscoreEntries = Object.entries(data).filter(([k]) => k.startsWith("zscore:"));

      // 1. INYECCION EN RAM: snapshots
      const loaded = {};
      for (const [k, v] of snapEntries) {
        try { loaded[k.replace("snap:", "")] = JSON.parse(v); } catch {}
      }
      setSnapshots(prev => {
        const merged = { ...prev, ...loaded };
        const dates = Object.keys(merged).sort();
        if (dates.length > 0) {
          setSelDate(dates[dates.length - 1]);
          if (dates.length > 1) setCmpDate(dates[dates.length - 2]);
        }
        return merged;
      });

      // 2. RESTAURACION DE MATRICES Z-SCORE:
      // Solo sobrescribir si el storage esta vacio o si el backup es mas reciente
      if (zscoreEntries.length > 0) {
        const paramsEntry = zscoreEntries.find(([k]) => k === "zscore:params");
        if (paramsEntry) {
          const incomingParams = JSON.parse(paramsEntry[1]);
          const currentParams = zsParams;
          const incomingDate = incomingParams?.calibrado || "0000-00-00";
          const currentDate  = currentParams?.calibrado  || "0000-00-00";
          if (!currentParams || incomingDate >= currentDate) {
            for (const [k, v] of zscoreEntries) {
              if (k !== "zscore:params") continue; // series historicas ya no se persisten
              try { await window.storage.set(k, v, true); } catch {}
            }
            setZsParams(incomingParams);
          }
        }
      }

      // RESTAURAR PORTFOLIO desde backup
      if (data["portfolio:v1"]) {
        try {
          const portData = JSON.parse(data["portfolio:v1"]);
          if (Array.isArray(portData) && portData.length > 0) {
            setPortfolio(portData);
            window.storage.set("portfolio:v1", data["portfolio:v1"], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
          }
        } catch {}
      }
      if (data["portfolio:cash"]) {
        const liq = parseFloat(data["portfolio:cash"]);
        if (!isNaN(liq)) {
          setLiquidezUSD(liq);
          window.storage.set("portfolio:cash", data["portfolio:cash"], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
        }
      }

      // RESTAURAR ROC History, Dynamic Scores y Radar Tracked
      if (data["roc:history"]) {
        try {
          const rh = JSON.parse(data["roc:history"]);
          setRocHistory(rh);
          window.storage.set("roc:history", data["roc:history"], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
        } catch {}
      }
      if (data["dynamic:scores"]) {
        try {
          const ds = JSON.parse(data["dynamic:scores"]);
          setDynamicScores(ds);
          window.storage.set("dynamic:scores", data["dynamic:scores"], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
        } catch {}
      }
      if (data["radar:tracked"]) {
        try {
          const rt = new Map(JSON.parse(data["radar:tracked"]));
          setRadarTracked(rt);
          window.storage.set("radar:tracked", data["radar:tracked"], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
        } catch {}
      }

      // 3. PERSISTENCIA DE SNAPSHOTS
      for (const [k, v] of snapEntries) {
        try { const snap = JSON.parse(v); await window.storage.set(k, serializeSnap(snap), true); count++; } catch {}
      }

      setImportStatus(count > 0 ? `OK - ${count} snapshots persistidos.` : "OK - Modo RAM Movil activado.");
      setTimeout(() => { setImportJson(""); setImportStatus(""); if (count > 0) load(); }, 2000);
    } catch(e) { setImportStatus("ERROR DE LECTURA: JSON Invalido"); }
  };

  const handleBackupFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setImportStatus("Leyendo archivo...");
      try {
        const data = JSON.parse(ev.target.result);
        let count = 0;

        // 1. INYECCION DIRECTA EN RAM - funciona siempre, incluso en movil
        const loaded = {};
        for (const [k, v] of Object.entries(data)) {
          if (!k.startsWith("snap:")) continue;
          try { const snap = JSON.parse(v); if (snap.date) loaded[snap.date] = snap; } catch {}
        }
        if (Object.keys(loaded).length > 0) {
          setSnapshots(prev => {
            const merged = {...prev, ...loaded};
            const dates = Object.keys(merged).sort();
            if (dates.length > 0) {
              setSelDate(dates[dates.length - 1]);
              if (dates.length > 1) setCmpDate(dates[dates.length - 2]);
            }
            return merged;
          });
        }

        // 2. Restaurar calibracion Z-score en RAM
        const paramsRaw = data["zscore:params"];
        if (paramsRaw) {
          const incomingParams = JSON.parse(paramsRaw);
          const incomingDate = incomingParams?.calibrado || "0000-00-00";
          const currentDate  = zsParams?.calibrado      || "0000-00-00";
          if (!zsParams || incomingDate >= currentDate) {
            setZsParams(incomingParams);
            for (const key of ["zscore:params"]) {
              if (data[key]) window.storage.set(key, data[key], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
            }
          }
        }

        // 3. Restaurar portfolio
        if (data["portfolio:v1"]) {
          try {
            const portData = JSON.parse(data["portfolio:v1"]);
            if (Array.isArray(portData) && portData.length > 0) {
              setPortfolio(portData);
              window.storage.set("portfolio:v1", data["portfolio:v1"], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
            }
          } catch {}
        }
        if (data["portfolio:cash"]) {
          const liq = parseFloat(data["portfolio:cash"]);
          if (!isNaN(liq)) {
            setLiquidezUSD(liq);
            window.storage.set("portfolio:cash", data["portfolio:cash"], true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
          }
        }

        // 3. INTENTO DE PERSISTENCIA en storage - falla silencioso en movil
        for (const [k, v] of Object.entries(data)) {
          if (!k.startsWith("snap:")) continue;
          try { const snap = JSON.parse(v); if(snap.date) { await window.storage.set(k, serializeSnap(snap), true); count++; } } catch {}
        }

        setImportStatus(count > 0
          ? "OK: " + Object.keys(loaded).length + " snapshots cargados (" + count + " persistidos)."
          : "OK: " + Object.keys(loaded).length + " snapshots en RAM (Modo Movil).");
      } catch(err) { setImportStatus("ERROR: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const analyzeRadar = async (topTickers) => {
    setRadarAnalyzing(true); setRadarAnalysis("");
    const thesis = THESIS_CONFIG[radarThesis];

    // INMUNIDAD DEL LLM - Ortogonalizacion de payload:
    // Los suplentes del Shadow Roster NO se envian al analista si son ideas nuevas.
    // EXCEPCION: suplentes que ya estan en radarTracked se envian con flag TRACKED_LOSER_IN_CLUSTER.
    const suplentesMap = shadowRoster.suplentes;
    const ctxPrimaryRaw = topTickers.slice(0,15).map(t => {
      const supData = suplentesMap.get(t.symbol);
      if (supData) {
        // Es suplente: solo pasa si esta trackeado
        if (!supData.isTracked) return null;
        return { symbol: t.symbol, score: t._radar.score, sector: t._radar.sector, factores: t._radar.factors, precio: t.last_price, variacion_hoy: t.change_pct, val: t._val_score, piotroski: t._piotroski, fpe: t.forward_pe, roe: t._roe, refi: t._refi_risk?.label, rs_20d: t._rs!=null?Number(t._rs).toFixed(1)+"%":"N/A", flag: "TRACKED_LOSER_IN_CLUSTER", titular: supData.titular, cluster_corr: supData.clusterCorr.toFixed(2) };
      }
      return { symbol: t.symbol, score: t._radar.score, sector: t._radar.sector, factores: t._radar.factors, precio: t.last_price, variacion_hoy: t.change_pct, val: t._val_score, piotroski: t._piotroski, fpe: t.forward_pe, roe: t._roe, refi: t._refi_risk?.label, rs_20d: t._rs!=null?Number(t._rs).toFixed(1)+"%":"N/A" };
    }).filter(Boolean);
    const ctxPrimary = ctxPrimaryRaw;
    const primarySymbols = new Set(ctxPrimary.map(t => t.symbol));

    // Espectro de tesis: normalizar scores de detectMarketContext a porcentajes
    const thesisScores = marketContext?.scores ?? {};
    const totalScore = Object.values(thesisScores).reduce((a,b) => a + b, 0);
    const thesisSorted = Object.entries(thesisScores).sort((a,b) => b[1]-a[1]);
    const thesisSpectrum = totalScore > 0
      ? thesisSorted.map(([k,v]) => (THESIS_CONFIG[k]?.label || k) + ": " + Math.round(v/totalScore*100) + "%").join(" | ")
      : "espectro no disponible (historial insuficiente)";
    const selectedShare = totalScore > 0 && thesisScores[radarThesis]
      ? Math.round(thesisScores[radarThesis]/totalScore*100) : null;

    // Identificar tesis secundaria y calcular su top 5 (excluyendo duplicados)
    const secondaryKey = thesisSorted.find(([k]) => k !== radarThesis)?.[0] ?? null;
    let ctxSecondary = [];
    if (secondaryKey) {
      const secondaryScores = twScore
        .filter(t => t.last_price != null && !primarySymbols.has(t.symbol))
        .map(t => {
          const cycle = getCyclePhase(t.symbol, snapshots);
          const score = calcRadarScore(t, null, sa, cycle, creditStress, secondaryKey, cycleIndicators?.probabilities, dynamicScores);
          return score ? { ...t, _radar: score } : null;
        })
        .filter(Boolean)
        .sort((a,b) => b._radar.score - a._radar.score)
        .slice(0,10);
      ctxSecondary = secondaryScores.map(t => ({ symbol: t.symbol, score: t._radar.score, sector: t._radar.sector, factores: t._radar.factors, precio: t.last_price, variacion_hoy: t.change_pct, val: t._val_score, piotroski: t._piotroski, fpe: t.forward_pe, roe: t._roe, refi: t._refi_risk?.label, rs_20d: t._rs != null ? Number(t._rs).toFixed(1) + "%" : "N/A" }));
    }

    const baseSys = ANALYST_SYS + "\n\nTu tarea: actuar como PILOTO DE TRANSICION de la cartera del usuario. Si el usuario tiene posiciones cargadas, tu recomendacion final NO es una cartera nueva desde cero - es una lista de ordenes de transicion (ACCUMULATE, TRIM, SELL, PILOT) aplicadas sobre lo que ya tiene, para adaptar la cartera al espectro macroeconomico actual de forma gradual. Si el usuario no tiene cartera cargada, podes proponer una cartera inicial. En ambos casos aplica la mentalidad de transicion gradual: los ciclos no cambian de un dia para otro.\n\nMENTALIDAD DE TRANSICION GRADUAL: Si la tesis seleccionada tiene menos del 40% de probabilidad en el espectro y la diferencia con la segunda es menor a 15 puntos porcentuales, NO recomendes rotaciones violentas. Usa PILOT (3-5% del capital) para activos de la tesis emergente mientras mantenes el nucleo de la tesis anterior.";
    const mandatoRadar = getMandatoSistemico();
    const sys = mandatoRadar ? baseSys + "\n\nDIRECTIVA ACTIVA DEL MOTOR Z-SCORE: " + mandatoRadar : baseSys;

    // Filtro de concentracion: detectar pares altamente correlacionados en el top 10 primario
    const symbols = ctxPrimary.map(t => t.symbol);
    const highCorrPairs = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const c = calcCorrelation(symbols[i], symbols[j], snapshots);
        if (c != null && Number(c) >= 0.75) {
          highCorrPairs.push({ s1: symbols[i], s2: symbols[j], corr: Number(c) });
        }
      }
    }
    let correlationWarning = "";
    if (highCorrPairs.length > 0) {
      correlationWarning = "\nREDUNDANCIAS DETECTADAS EN EL RADAR:\n"
        + highCorrPairs.map(p => `- ${p.s1} y ${p.s2} tienen una correlacion temporal de +${p.corr.toFixed(2)}`).join("\n")
        + "\nALERTA DE RIESGO DE CONCENTRACION: Los pares listados arriba se mueven en bloque. Si tu recomendacion final incluye a uno de ellos, estas OBLIGADO a descartar a su par para no duplicar la exposicion del portfolio al mismo vector macroeconomico. Elegi al mas eficiente y descarta al redundante.";
    }

    try {
      // Motor de lookback: calcula delta acumulado en N snapshots hacia atras
      // Si no hay N snapshots, usa el mas antiguo disponible y rotula dinamicamente
      const dates = Object.keys(snapshots).sort();
      const selIdx = dates.indexOf(selDate);

      const getAnchorPrice = (date, sym) => {
        const snap = snapshots[date];
        if (!snap) return null;
        const t = snap.tickers?.find(x => x.symbol === sym);
        if (t?.last_price != null) return t.last_price;
        // Fallback para anclas de mercado guardadas en market
        const mMap = { "^TNX": "rate_10yr", "^IRX": "rate_3mo", "DX-Y.NYB": "dxy", "^VIX": "vix", "GC=F": "gold", "CL=F": "wti" };
        const mKey = mMap[sym];
        return mKey ? snap.market?.[mKey]?.price ?? null : null;
      };

      const calcDelta = (sym, nBack) => {
        if (selIdx < 0) return null;
        const targetIdx = Math.max(0, selIdx - nBack);
        const actualN = selIdx - targetIdx;
        if (actualN === 0) return null;
        const pNow = getAnchorPrice(dates[selIdx], sym);
        const pThen = getAnchorPrice(dates[targetIdx], sym);
        if (pNow == null || pThen == null || pThen === 0) return null;
        return { delta: ((pNow - pThen) / Math.abs(pThen)) * 100, days: actualN };
      };

      const fmtDelta = (sym, nBack) => {
        const r = calcDelta(sym, nBack);
        if (!r) return null;
        return `Delta ${r.days}D: ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}%`;
      };

      const anchorLine = (label, sym, extraCtx) => {
        const d1  = fmtDelta(sym, 1);
        const d5  = fmtDelta(sym, 5);
        const d20 = fmtDelta(sym, 20);
        const parts = [d1, d5, d20].filter(Boolean);
        const trend = parts.length > 0 ? parts.join(" | ") : "historial insuficiente";
        return `${label}: ${trend}${extraCtx ? ". " + extraCtx : ""}`;
      };

      const tnx  = curData?.market?.rate_10yr?.price ?? null;
      const irx  = curData?.market?.rate_3mo?.price  ?? null;
      const dxy  = curData?.market?.dxy?.price       ?? null;
      const dxyChg = curData?.market?.dxy?.change_pct ?? null;
      const yieldSpread = (tnx != null && irx != null) ? (tnx - irx).toFixed(2) : null;
      const hgf  = tickers.find(t => t.symbol === "HG=F");
      const gcf  = tickers.find(t => t.symbol === "GC=F");
      const cuAu = (hgf?.last_price && gcf?.last_price) ? (hgf.last_price / gcf.last_price * 1000).toFixed(3) : null;
      const moveTicker = tickers.find(t => t.symbol === "^MOVE");

      const macroCtx = [
        "S&P hoy: " + fmtPct(curData?.market?.sp500?.change_pct) + " | " + (fmtDelta("SPY", 5) || "") + " | " + (fmtDelta("SPY", 20) || ""),
        "VIX: " + fmt(curData?.market?.vix?.price, 2) + (fmtDelta("^VIX", 5) ? " | " + fmtDelta("^VIX", 5) : "") + (fmtDelta("^VIX", 20) ? " | " + fmtDelta("^VIX", 20) : ""),
        "Tasa 10Y (TNX): " + (tnx != null ? fmt(tnx, 3) + "%" : "SIN DATO") + " | " + (fmtDelta("^TNX", 5) || "sin historial") + " | " + (fmtDelta("^TNX", 20) || ""),
        "Spread curva (10Y-3M): " + (yieldSpread != null ? yieldSpread + "% (positivo=normal, negativo=invertida)" : "SIN DATO"),
        anchorLine("DXY (Indice Dolar)", "DX-Y.NYB", "Evaluar impacto en liquidez global y activos emergentes"),
        "Ratio Cu/Au: " + (cuAu != null ? cuAu + " (mayor = demanda industrial/expansion, menor = flight to safety)" : "SIN DATO - agregar HG=F y GC=F al watchlist"),
        "HYG hoy: " + (creditStress.hyg != null ? fmtPct(creditStress.hyg.change) : "SIN DATO") + " | LQD hoy: " + (creditStress.lqd != null ? fmtPct(creditStress.lqd.change) : "SIN DATO") + " | TLT hoy: " + (creditStress.tlt != null ? fmtPct(creditStress.tlt.change) : "SIN DATO"),
        "MOVE: " + (moveTicker?.last_price != null ? moveTicker.last_price.toFixed(0) + (moveTicker.change_pct != null ? " (hoy " + fmtPct(moveTicker.change_pct) + ")" : "") : "SIN DATO") + (fmtDelta("^MOVE", 5) ? " | " + fmtDelta("^MOVE", 5) : "") + (fmtDelta("^MOVE", 20) ? " | " + fmtDelta("^MOVE", 20) : ""),
        "Estres crediticio: " + creditStress.stressLevel + (creditStress.signals.length > 0 ? " - " + creditStress.signals.slice(0, 2).join("; ") : ""),
      ].join("\n");
      // Cartera real: single source of truth
      const portActual = getPortfolioWithMarket();
      const totalCarteraRadar = portActual.reduce((s, p) => s + (p.valorPosicion ?? 0), 0);
      const portPayload = portActual.length > 0
        ? portActual.map(p => ({
            ticker: p.ticker,
            tipo: p.tipo,
            cant_acciones: Number(p.exposicion.toFixed(4)),
            precio_entrada_usd: Number(p.precioBase.toFixed(2)),
            precio_actual_usd: p.precioActual,
            valor_posicion_usd: p.valorPosicion != null ? Number(p.valorPosicion.toFixed(2)) : null,
            pct_capital: p.pctCartera != null ? Number(p.pctCartera.toFixed(1)) : null,
            pnl_pct: p.pnlPct != null ? Number(p.pnlPct.toFixed(2)) : null,
            rs_20d: p.rs != null ? Number(Number(p.rs).toFixed(2)) : null,
            fase: p.fase ?? "SIN DATO",
          }))
        : null;

      const reply = await callClaude(sys, [{ role:"user", content:
        "Tesis seleccionada por el usuario: " + thesis.label + " - " + thesis.desc +
        (selectedShare != null ? " (probabilidad del sistema: " + selectedShare + "%)" : "") +
        "\nEspectro de tesis actual: " + thesisSpectrum +
        "\n\nCARTERA REAL ACTUAL DEL USUARIO" +
        (portPayload
          ? " (total valorizado: USD " + totalCarteraRadar.toFixed(2) + "):\n" + JSON.stringify(portPayload, null, 2) +
            "\n\nROL DEL ANALISTA: No armes una cartera desde cero. Usa la cartera real como punto de partida. Tu recomendacion final es una lista de ORDENES DE TRANSICION (ACCUMULATE, TRIM, SELL, PILOT) aplicadas sobre las posiciones existentes para adaptar la cartera al nuevo espectro macroeconomico. Si incorporas un activo nuevo del Radar, especifica de donde salen los fondos (TRIM de que posicion o liquidez disponible)." +
            (getMandatoSistemico() ? "" : "") 
          : " (vacia - sin posiciones cargadas). En este caso podes proponer una cartera inicial desde cero basada en el Radar y el espectro de tesis.") +
        "\n\nBLOQUE PRINCIPAL - Top activos de la tesis " + thesis.label + ":\n" + JSON.stringify(ctxPrimary) +
        (ctxSecondary.length > 0
          ? "\n\nBLOQUE SECUNDARIO - Top 5 activos de la tesis emergente " + (THESIS_CONFIG[secondaryKey]?.label || secondaryKey) +
            " (" + (totalScore > 0 ? Math.round(thesisScores[secondaryKey]/totalScore*100) : "?") + "% de probabilidad):\n" + JSON.stringify(ctxSecondary) +
            "\nCandidatos a PILOT si la tesis secundaria se confirma."
          : "") +
        "\n\nContexto macro:\n" + macroCtx + correlationWarning +
        (tailRiskData.active && tailRiskData.pairs.length > 0
          ? "\n\nALERTA DE RIESGO DE COLA (TAIL LOCK ACTIVO - N=" + tailRiskData.stressN + " dias de estres):\n" +
            "VIX Z-Score actual = " + (tailRiskData.currentVixZ?.toFixed(2) ?? "-") + "sigma (> +1.5sigma -> regimen de estres confirmado).\n" +
            "Dependencia de cola oculta detectada en los siguientes pares:\n" +
            tailRiskData.pairs.map(p => p.s1 + "/" + p.s2 + ": corr normal=" + p.normalCorr + " -> corr estres=" + p.stressCorr + " (deltarho=" + p.delta + ")").join("\n") + "\n" +
            "OVERRIDE INNEGOCIABLE: Exposicion maxima combinada permitida para activos con TAIL RISK: 40% del capital total. " +
            "El capital asignado a cada uno ya fue penalizado x 0.5 sobre L_t. " +
            "Veredicto maximo permitido: TRIM o HOLD. PROHIBIDO ACCUMULATE. Si el payload muestra hasTailRisk=true para un activo, no podes asignarle capital adicional bajo ninguna circunstancia."
          : "")
      }], 6000, webSearch);
      setRadarAnalysis(reply);
    } catch(e) { setRadarAnalysis("Error: " + e.message); } finally { setRadarAnalyzing(false); }
  };

  const [pingStatus, setPingStatus] = useState(null);
  const [calMv, setCalMv] = useState("19.16");
  const [cartPaste, setCartPaste] = useState("");
  const [calSv, setCalSv] = useState("5.20");
  const [calMm, setCalMm] = useState("82.17");
  const [calSm, setCalSm] = useState("17.28");

  const pingAnalista = async () => {
    setPingStatus("loading");
    try {
      const reply = await callClaude("Responde solo con la palabra OK.", [{ role:"user", content:"ping" }], 10, false);
      setPingStatus(reply?.trim().startsWith("OK") || reply?.length > 0 ? "ok" : "error");
    } catch(e) {
      setPingStatus("error");
    }
    setTimeout(() => setPingStatus(null), 5000);
  };

  const sendChat = async () => {
    if (!chatIn.trim()||chatLoading) return;
    const msg=chatIn.trim(); setChatIn("");
    const newMsgs=[...chatMsgs,{role:"user",content:msg}];
    setChatMsgs(newMsgs); setChatLoading(true);
    const dates=Object.keys(snapshots).sort();

    // Contexto macro: snapshot actual completo + historicos solo macro
    const macroHistory = dates.slice(-5).map(d => {
      const snap = snapshots[d];
      if (d === selDate) return { date: d, note: snap.note, market: snap.market };
      return { date: d, market: { sp500: snap.market?.sp500, vix: snap.market?.vix, rate_10yr: snap.market?.rate_10yr, rate_3mo: snap.market?.rate_3mo, dxy: snap.market?.dxy, hyg: snap.market?.hyg, wti: snap.market?.wti, gold: snap.market?.gold, move: snap.market?.move } };
    });

    // ENRUTADOR: Chat General
    // Top 10 RS positivo + Bottom 10 RS negativo como mapa de calor del mercado
    const tks = snapshots[selDate]?.tickers || [];
    const withRS = twScore.filter(t => t._rs != null).sort((a,b) => Number(b._rs) - Number(a._rs));
    const top10RS    = withRS.slice(0, 10).map(t => ({ symbol: t.symbol, sector: getSector(t.symbol), rs_20d: Number(Number(t._rs).toFixed(2)), change_pct: t.change_pct }));
    const bottom10RS = withRS.slice(-10).map(t => ({ symbol: t.symbol, sector: getSector(t.symbol), rs_20d: Number(Number(t._rs).toFixed(2)), change_pct: t.change_pct }));

    // Alertas criticas: solo Z-score >= 2
    const {alerts} = calcAlerts(snapshots, selDate);
    const alertasCriticas = alerts.filter(a => Math.abs(a.z) >= 2).slice(0, 10).map(a => ({ symbol: a.symbol, tipo: a.type, z: a.z, cambio: a.change }));

    // Sectores baratos/caros
    const sa = calcSectorArbitrage(tks.map(t => ({...t, _val_score: calcValScore(t)})), sectorUniverse);
    const sectores = Object.entries(sa).map(([s,d]) => ({ sector: s, baratos: d.tickers.filter(t=>t.avgZ<=-1.5).map(t=>t.symbol), caros: d.tickers.filter(t=>t.avgZ>=1.5).map(t=>t.symbol) })).filter(s => s.baratos.length > 0 || s.caros.length > 0);

    // Cartera del usuario
    const portActual = getPortfolioWithMarket();
    const portResumen = portActual.map(p => ({ ticker: p.ticker, pct_capital: p.pctCartera?.toFixed(1), variacion_hoy: p.change_pct ?? null, rs_20d: p.rs != null ? Number(Number(p.rs).toFixed(2)) : null, pnl_pct: p.pnlPct?.toFixed(2), fase: p.fase }));

    // ENRUTADOR Case 5: Modo Alerta/Panico
    // Gatillo estadistico: MOVE Z-Score > 2.5sigma (evento de 2.5 desviaciones estandar en bonos)
    // O nivel nominal MOVE > 120 O VIX > 35 (umbrales absolutos como red de seguridad)
    const moveTk = tickers.find(t => t.symbol === "^MOVE");
    const vixTk  = tickers.find(t => t.symbol === "^VIX");
    const moveZScore = cycleIndicators?.macroSensors?.move?.z_score ?? null;
    const esModoPanico = (moveTk?.last_price > 120)
      || (moveZScore != null && moveZScore > 2.5)
      || (vixTk?.last_price > 35);
    const REFUGIOS = ["TLT","GLD","GC=F","SHY","IEF","DX-Y.NYB","HYG","LQD","^MOVE","^VIX","^TNX"];
    const refugioData = esModoPanico
      ? tks.filter(t => REFUGIOS.includes(t.symbol)).map(t => ({
          symbol: t.symbol, last_price: t.last_price, change_pct: t.change_pct,
          rs_20d: twScore.find(x => x.symbol === t.symbol)?._rs ?? null
        }))
      : null;

    const computed = {
      fecha: selDate,
      dias: dates.length,
      ciclo: cycleIndicators?.phase ?? "sin datos",
      credit_stress: { nivel: creditStress.stressLevel, senales: creditStress.signals },
      ...(esModoPanico
        ? {
            MODO_PANICO: true,
            disparador: (moveTk?.last_price > 120 ? "MOVE>" + moveTk.last_price.toFixed(0) : "") +
                        (moveZScore != null && moveZScore > 2.5 ? " MOVE_Z=" + moveZScore.toFixed(2) + "sigma (>2.5sigma - shock estadistico en bonos)" : "") +
                        (vixTk?.last_price > 35 ? " VIX>" + vixTk.last_price.toFixed(0) : ""),
            activos_refugio: refugioData,
            cartera_usuario: portResumen,
            liquidez_usd: liquidezUSD,
          }
        : {
            top10_rs_positivo: top10RS,
            bottom10_rs_negativo: bottom10RS,
            alertas_criticas: alertasCriticas,
            sectores_dislocados: sectores,
            cartera_usuario: portResumen,
            liquidez_usd: liquidezUSD,
          }
      ),
    };

    const hMsgs = newMsgs.slice(-10).map(m => ({
      role: m.role,
      content: m.role === "user" && m === newMsgs[newMsgs.length-1]
        ? "Contexto macro (" + dates.length + " dias de historial):\n" + JSON.stringify(macroHistory) +
          "\n\nContexto de mercado (hoy):\n" + JSON.stringify(computed) +
          "\n\nPregunta: " + m.content
        : m.content
    }));
    try { const reply=await callClaude(ANALYST_SYS,hMsgs,2500,webSearch); setChatMsgs(prev=>[...prev,{role:"assistant",content:reply}]); }
    catch(e) { setChatMsgs(prev=>[...prev,{role:"assistant",content:"Error: "+e.message}]); } finally { setChatLoading(false); }
  };

  const curData=selDate?snapshots[selDate]:null;
  const tickers = useMemo(() => curData?.tickers||[], [curData]);
  const dates=Object.keys(snapshots).sort();

  const twScore = useMemo(() =>
    tickers.map(t => {
      const refi = calcRefinancingRisk(t);
      const rsCalc = calcRelativeStrength(t.symbol, snapshots, selDate);
      // Fallback a RS 20D de Yahoo cuando no hay suficientes snapshots para calcular alpha
      const rs = rsCalc != null ? rsCalc : (t._rs_yahoo != null ? Number(t._rs_yahoo) : null);
      // Merge earnings desde storage persistido si el ticker no tiene earnings_info en memoria
      const earnings = t.earnings_info ?? earningsStorageRef.current?.[t.symbol] ?? null;
      if (["ETSY","META","MSFT","KO","VZ"].includes(t.symbol)) console.log("[MERGE]", t.symbol, "t.ei:", t.earnings_info, "ref:", earningsStorageRef.current?.[t.symbol]);
      return {...t, earnings_info: earnings, _val_score: calcValScore(t), _refi_risk: refi, _rs: rs, _rs_source: rsCalc != null ? "calc" : (t._rs_yahoo != null ? "yahoo" : null)};
    }),
    [tickers, snapshots, selDate]
  );
  const creditStress = useMemo(() =>
    calcCreditStress(tickers, curData?.market, snapshots),
    [tickers, curData]
  );
  const cycleIndicators = useMemo(() => {
    // Calcular spROC aqui directamente - no puede leer marketContext (aun no inicializado)
    // Misma logica que detectMarketContext: calcROC252 sobre rocHistory.spy
    const _spyData = rocHistory?.spy ?? [];
    const _calcROC252 = (series) => {
      if (!series || series.length < 2) return null;
      // Ventana adaptativa: tiende a 252, opera con lo disponible
      // No se anualiza - la gaussiana solo necesita escala centrada en 0
      const window = Math.min(series.length - 1, 252);
      const last = series[series.length - 1]?.price;
      const old  = series[series.length - 1 - window]?.price;
      return (last != null && old != null && old > 0) ? ((last - old) / old) * 100 : null;
    };
    const _spROC  = _calcROC252(_spyData);
    const _fredCuad = fredRegime?.cuadrante ?? null;
    return calcCyclePhaseIndicators(tickers, snapshots, zsParams, _spROC, _fredCuad, curData?.market?.spxQDiv ?? 0.08, curData?.market?.spxRoc63d ?? null, curData?.market?.zMoveInv ?? null);
  },
    [tickers, snapshots, zsParams]
  );
  const {alerts, days: alertDays} = useMemo(() =>
    calcAlerts(snapshots, selDate),
    [snapshots, selDate]
  );
  const clusterData = useMemo(() =>
    buildClusters((snapshots[selDate]?.tickers||[]).map(t=>t.symbol).filter(s=>s&&!s.includes('.BA')&&!s.startsWith('^')), snapshots),
    [tickers, snapshots, selDate]
  );
  const hypRes = useMemo(() =>
    checkHypotheses(hyps, snapshots),
    [hyps, snapshots]
  );
  const sa = useMemo(() =>
    calcSectorArbitrage(twScore, sectorUniverse),
    [twScore, sectorUniverse]
  );
  const marketContext = useMemo(() =>
    detectMarketContext(curData?.market, tickers, creditStress, snapshots, rocHistory),
    [curData, tickers, creditStress, snapshots, rocHistory]
  );
  const radarScores = useMemo(() => {
    const THESES = ["stagflacion","defensivo","crecimiento","valor"];

    if (radarThesis !== "hibrido") {
      // Modo normal: una sola tesis - dos pasadas (Opus 4.7 IVW)
      // PASADA 1: calcular Radar Score crudo para todos los tickers
      const radarRawMap = {};
      const radarMeta   = {};  // guarda factors, sector, regimeScore por sym
      twScore.filter(t => t.last_price != null).forEach(t => {
        const cycle = getCyclePhase(t.symbol, snapshots);
        const sc = calcRadarScore(t, null, sa, cycle, creditStress, radarThesis, cycleIndicators?.probabilities, dynamicScores);
        if (sc) { radarRawMap[t.symbol] = sc.score; radarMeta[t.symbol] = sc; }
      });

      // PASADA 2: fusion IVW con AQR
      const aqrMap = dynamicScores ?? {};
      const { fusedBySymbol, diagnostics } = fuseRadarAQR(radarRawMap, aqrMap);
      console.info('[IVW Fusion]', diagnostics);
      // Persistir diagnostics en estado para telemetria - no se pierde al limpiar consola
      setIvwDiagnostics({ ...diagnostics, fecha: new Date().toISOString().slice(0,10), modo: radarThesis });

      return twScore
        .filter(t => t.last_price != null && fusedBySymbol[t.symbol] != null)
        .map(t => {
          const sym  = t.symbol;
          const meta = radarMeta[sym];
          const fusedScore = fusedBySymbol[sym];
          const aqrVal = aqrMap[sym] ?? null;
          const factorsWithFusion = [
            ...(meta?.factors || []),
            aqrVal != null
              ? `Fusion IVW: Radarx${diagnostics.w_R.toFixed(2)} + AQRx${diagnostics.w_A.toFixed(2)} (AQR=${aqrVal.toFixed(1)})`
              : null
          ].filter(Boolean);
          return {
            ...t,
            _radar: {
              score:       fusedScore,
              factors:     [...new Set(factorsWithFusion)],
              sector:      meta?.sector ?? getSector(sym),
              regimeScore: aqrVal,
              radarRaw:    radarRawMap[sym] ?? null,
            }
          };
        })
        .filter(Boolean)
        .sort((a,b) => (b._radar.score - a._radar.score) || a.symbol.localeCompare(b.symbol));
    }

    // Modo Hibrido: Probabilidad Cruzada ponderada por marketContext.scores
    const rawScores = marketContext?.scores ?? {};
    const totalCtx  = Object.values(rawScores).reduce((a,b) => a+b, 0);
    if (totalCtx === 0) return []; // sin historial suficiente para ponderar

    // Pesos normalizados por tesis (0.0 - 1.0)
    const weights = {};
    for (const th of THESES) {
      weights[th] = (rawScores[th] || 0) / totalCtx;
    }

    // PASADA 1 hibrida: calcular score crudo ponderado por tesis
    const hybridRaw = twScore
      .filter(t => t.last_price != null)
      .map(t => {
        const cycle = getCyclePhase(t.symbol, snapshots);
        let hybridScore = 0;
        const allFactors = [];

        for (const th of THESES) {
          const w = weights[th];
          if (w === 0) continue;
          const result = calcRadarScore(t, null, sa, cycle, creditStress, th, cycleIndicators?.probabilities, dynamicScores);
          const thScore = result ? result.score : 0;
          hybridScore += thScore * w;
          if (result?.factors) allFactors.push(...result.factors);
        }

        const rawHybrid = Math.round(Math.max(0, Math.min(100, hybridScore)));
        if (rawHybrid < 20) return null;
        return { sym: t.symbol, ticker: t, rawScore: rawHybrid, factors: allFactors };
      })
      .filter(Boolean);

    // PASADA 2 hibrida: fusion IVW con AQR
    const hybridRawMap = Object.fromEntries(hybridRaw.map(x => [x.sym, x.rawScore]));
    const aqrMapH = dynamicScores ?? {};
    const { fusedBySymbol: fusedH, diagnostics: diagH } = fuseRadarAQR(hybridRawMap, aqrMapH);
    console.info('[IVW Fusion Hibrida]', diagH);

    return hybridRaw
      .map(x => {
        const fused = fusedH[x.sym];
        if (fused == null || fused < 20) return null;
        const aqrVal = aqrMapH[x.sym] ?? null;
        const factorsF = [
          ...x.factors,
          aqrVal != null ? `Fusion IVW: Radarx${diagH.w_R.toFixed(2)} + AQRx${diagH.w_A.toFixed(2)} (AQR=${aqrVal.toFixed(1)})` : null
        ].filter(Boolean);
        return {
          ...x.ticker,
          _radar: {
            score:       fused,
            factors:     [...new Set(factorsF)],
            sector:      getSector(x.sym),
            regimeScore: aqrVal,
            radarRaw:    x.rawScore ?? null,
          }
        };
      })
      .filter(Boolean)
      .sort((a,b) => (b._radar.score - a._radar.score) || a.symbol.localeCompare(b.symbol));
  }, [twScore, snapshots, sa, creditStress, radarThesis, marketContext]);
  // Actualizar histeresis DESPUES de que radarScores este inicializado - evita Temporal Dead Zone
  useEffect(() => { if (radarScores.length > 0) updateRadarTracked(radarScores); }, [radarScores]);

  // -- Shadow Roster: Ortogonalizacion por correlacion de Spearman ------------
  // Solo aplica a sobrevivientes (score >= RADAR_HOLD_MIN).
  // Si rho > 0.75 entre dos activos, el de mayor score es Titular,
  // el otro pasa al Shadow Roster (Suplente).
  const shadowRoster = useMemo(() => {
    const CORR_THRESHOLD = 0.75;
    const survivors = radarScores.filter(t => t._radar.score >= RADAR_HOLD_MIN);
    if (survivors.length < 2 || Object.keys(snapshots).length < 10) {
      return { titulares: survivors, suplentes: new Map(), clusters: [] };
    }
    const symbols = survivors.map(t => t.symbol);
    // Calcular correlaciones Spearman entre todos los pares de sobrevivientes
    const pairs = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const c = calcCorrelation(symbols[i], symbols[j], snapshots);
        if (c != null && Math.abs(Number(c)) >= CORR_THRESHOLD) {
          pairs.push({ s1: symbols[i], s2: symbols[j], corr: Number(c) });
        }
      }
    }
    if (pairs.length === 0) {
      return { titulares: survivors, suplentes: new Map(), clusters: [] };
    }
    // Greedy agglomeration: agrupar en clusters por rho > 0.75
    // Cada activo se asigna al primer cluster donde aparece
    const clusterOf = new Map(); // symbol -> cluster index
    const clusters  = [];        // array de Sets
    for (const { s1, s2, corr } of pairs.sort((a,b) => Math.abs(b.corr) - Math.abs(a.corr))) {
      const c1 = clusterOf.get(s1);
      const c2 = clusterOf.get(s2);
      if (c1 == null && c2 == null) {
        // Nuevo cluster
        const idx = clusters.length;
        const cl  = new Set([s1, s2]);
        clusters.push({ members: cl, corr });
        clusterOf.set(s1, idx);
        clusterOf.set(s2, idx);
      } else if (c1 != null && c2 == null) {
        clusters[c1].members.add(s2);
        clusterOf.set(s2, c1);
      } else if (c1 == null && c2 != null) {
        clusters[c2].members.add(s1);
        clusterOf.set(s1, c2);
      }
      // Si c1 === c2: ya estan en el mismo cluster, no hacer nada
    }
    // Dentro de cada cluster: titular = mayor score, suplentes = el resto
    const suplentes = new Map(); // symbol -> { titular, clusterCorr, score }
    const vetados   = new Set(); // simbolos que son suplentes
    for (const cl of clusters) {
      const members  = [...cl.members];
      const ranked   = members
        .map(sym => survivors.find(t => t.symbol === sym))
        .filter(Boolean)
        .sort((a,b) => b._radar.score - a._radar.score);
      if (ranked.length < 2) continue;
      const titular = ranked[0].symbol;
      for (const suplente of ranked.slice(1)) {
        suplentes.set(suplente.symbol, {
          titular,
          clusterCorr: cl.corr,
          score:       suplente._radar.score,
          isTracked:   radarTracked.has(suplente.symbol),
        });
        vetados.add(suplente.symbol);
      }
    }
    const titulares = survivors.filter(t => !vetados.has(t.symbol));
    return { titulares, suplentes, clusters };
  }, [radarScores, snapshots, radarTracked, RADAR_HOLD_MIN]);

  // -- Tail Risk Monitor -----------------------------------------------------
  // Detecta dependencia de cola oculta entre activos del radar.
  // Solo se activa si el mercado actual esta en regimen de estres (Z_VIX > 1.5).
  const tailRiskData = useMemo(() => {
    const survivors = radarScores.filter(t => t._radar.score >= RADAR_HOLD_MIN);
    if (survivors.length < 2) return { active: false, tailSymbols: new Set(), pairs: [], stressN: 0 };

    const symbols    = survivors.map(t => t.symbol);
    const tailResult = calcTailDependence(symbols, snapshots, zsParams);

    // Tail Lock Mode: solo se activa si el mercado ACTUAL esta en estres
    const currentVixZ = cycleIndicators?.macroSensors?.vix?.z_score ?? null;
    const isStressNow = currentVixZ != null && currentVixZ > 1.5;
    const active      = isStressNow && tailResult.valid && tailResult.tailSymbols.size > 0;

    return {
      active,
      isStressNow,
      tailSymbols: tailResult.tailSymbols,
      pairs:       tailResult.pairs,
      stressN:     tailResult.stressN,
      valid:       tailResult.valid,
      currentVixZ,
    };
  }, [radarScores, snapshots, zsParams, cycleIndicators, RADAR_HOLD_MIN]);

  // -- Master Score Top 5 - Modelo "Agilidad y Concentracion" ---------------
  // Formula: Master_Score = (ROC_21d + RS_21d) / 2
  // Donde RS_21d = ROC_21d_activo − ROC_21d_SPY (Fuerza Relativa 21 dias)
  //
  // Filtro de Supervivencia: solo activos con ROC_21d > 0 (momentum positivo absoluto)
  // Limite sectorial: maximo 2 activos del mismo sector en el Top 5
  // Cupos vacios -> Cash (si hay < 5 sobrevivientes)
  // Sin HMM, sin hard stop del SPY. El riesgo se gestiona por el filtro individual.
  const masterScores = useMemo(() => {
    if (Object.keys(snapshots).length < 2) return { top5: [], cashSlots: 5, spyROC21: null, survivorCount: 0, weightsCapped: {}, riskCapped: {} };

    const SPY_BENCHMARKS = ["^GSPC", "SPY"];
    const spyROC21 = (() => {
      for (const bm of SPY_BENCHMARKS) {
        const r = calcROC21d(bm, snapshots, selDate);
        if (r != null) return r;
      }
      return null;
    })();

    // Guillotina Fundamental: universo aprobado por el Radar
    const radarApproved = new Map(
      radarScores.map(t => [t.symbol, { factors: t._radar.factors, radarScore: t._radar.score }])
    );

    const scored = twScore
      .filter(t => t.last_price != null && !["^GSPC","SPY","^VIX","^MOVE","^TNX","^IRX","DX-Y.NYB"].includes(t.symbol))
      .filter(t => radarApproved.has(t.symbol))
      .map(t => {
        const roc21 = calcROC21d(t.symbol, snapshots, selDate);
        if (roc21 == null) return null;  // no price data - cannot score at all
        const rs21      = spyROC21 != null ? roc21 - spyROC21 : roc21;
        const baseScore = (roc21 + rs21) / 2;
        const dates_    = Object.keys(snapshots).sort();
        const selIdx    = selDate ? dates_.indexOf(selDate) : dates_.length - 1;
        const windowSize = Math.min(selIdx, 63);   // sincronizado con calcROC21d
        const startIdx  = Math.max(0, selIdx - windowSize);
        const prices    = [];
        for (let i = startIdx; i <= selIdx; i++) {
          const p = snapshots[dates_[i]]?.tickers?.find(tk => tk.symbol === t.symbol)?.last_price;
          if (p != null) prices.push(p);
        }
        // Volatilidad EWMA (λ=0.94, semilla 21 dias) - RiskMetrics
        // Retorna en % diario (misma escala que roc21 para el divisor del Master Score)
        const returns21 = [];
        for (let i = 1; i < prices.length; i++) {
          if (prices[i-1] > 0) returns21.push((prices[i] - prices[i-1]) / prices[i-1] * 100);
        }
        const vol21 = (() => {
          // Intentar EWMA con semilla de 21 periodos
          const ewma = calcEWMAVolatility(prices, 0.94, 21, false);
          if (ewma != null && ewma > 0.01) return ewma;
          // Fallback: desviacion estandar simple si no hay historial suficiente
          if (returns21.length >= 2) {
            const mean = returns21.reduce((a,b) => a+b, 0) / returns21.length;
            const variance = returns21.reduce((a,b) => a + (b-mean)**2, 0) / returns21.length;
            const fallbackVol = Math.sqrt(variance);
            if (fallbackVol > 0.01) return fallbackVol;
          }
          return 1.0;  // castigo estandar 1% diario si historial insuficiente
        })();
        // Multiplicador de Divergencia Macro: fusiona ROC 252d (Leading) con FRED (Lagging)
        const divResult = calcMacroDivergenceMultiplier(marketContext?.quadrant, fredRegime, marketContext?.grainIs ?? null, t.symbol, marketContext?.spROC ?? null, curData?.market?.spxQDiv ?? 0.08, curData?.market?.spxRoc63d ?? null);
        const master    = (baseScore / vol21) * divResult.multiplier;
        const radarData = radarApproved.get(t.symbol);
        return {
          symbol: t.symbol, sector: getSector(t.symbol),
          roc21, rs21, baseScore, vol21, master, returns21,
          last_price: t.last_price, change_pct: t.change_pct,
          factors:    radarData?.factors    ?? [],
          radarScore: radarData?.radarScore ?? null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.master - a.master);

    // -- Cross-Sectional Percentile Normalization (full-universe denominator) ------
    // Denominator = ALL scored assets (no pre-filter on ROC_21d).
    // Removing the pre-filter prevents the Denominator Trap: in bear markets,
    // filtering ROC_21d > 0 before ranking would shrink the denominator, making
    // weak assets look relatively stronger than they are.
    //
    // Formula: masterPct_i = (n − 1 − rank_i) / (n − 1) x 100
    //   rank 0 (highest raw score) -> masterPct = 100
    //   rank n−1 (lowest raw score) -> masterPct = 0
    //
    // Post-ranking penalty (Step 3): applied AFTER percentiles are locked.
    //   ROC_21d <= 0 -> masterPct − 50  (floor 0)
    //   Guarantees dead-momentum assets trigger the < 80 exit without
    //   contaminating the denominator used for the rest of the cohort.
    const nScored = scored.length;
    // -- Continuous volatility-scaled momentum penalty (ventana adaptativa) -----
    // penalty = beta x max(0, −z_window)
    //   sigma_window = vol_diario x √windowSize   (proyeccion al horizonte adaptativo)
    //   z_window = ROC_window / sigma_window       (Z-score en horizonte real usado)
    //   beta = 10.0  (recalibrado para minimizar turnover - denominador √63 ya reduce z)
    //
    // Justificacion beta=10: con √63 ≈ 1.73x√21, z_window es ~42% menor que z_21
    // para el mismo ROC. beta=10 produce sensibilidad equivalente a beta≈17 anterior
    // pero con mayor estabilidad ante ruido tactico de corto plazo.
    const BETA       = 10.0;
    const sqrtWindow = Math.sqrt(Math.min(Object.keys(snapshots).length, 63));
    // -- Paso 1: rawPct + penalty (logica original intacta) -------------------
    scored.forEach((t, rank) => {
      const rawPct = nScored > 1
        ? parseFloat(((nScored - 1 - rank) / (nScored - 1) * 100).toFixed(1))
        : 100;
      let penalty = 0;
      if (t.vol21 > 0 && t.roc21 != null) {
        const sigmaW  = t.vol21 * sqrtWindow;      // sigma proyectada al horizonte adaptativo
        const zWindow = t.roc21 / sigmaW;          // Z-score en horizonte real
        penalty       = BETA * Math.max(0, -zWindow);
      }
      t.masterPct      = parseFloat(Math.max(0, rawPct - penalty).toFixed(1));
      t.masterPctRaw   = rawPct;
      t.penaltyApplied = parseFloat(penalty.toFixed(2));
    });

    // -- Paso 2: histeresis tri-estado sobre masterPctRaw ---------------------
    if (scored.length > 0) {
      const { smoothed, nextPrev, branches } = applyHysteresis(scored, prevHystScores.current);
      prevHystScores.current = { ...prevHystScores.current, ...nextPrev };  // sincrono, sin re-render
      scored.forEach(t => {
        t.masterPctSmoothed = smoothed[t.symbol] ?? t.masterPctRaw;
        t._hysteresis_branch = branches[t.symbol] ?? null;
      });
      scored.sort((a, b) =>
        (b.masterPctSmoothed ?? b.masterPctRaw) - (a.masterPctSmoothed ?? a.masterPctRaw)
      );
    }
    // -- Tolerance Band + Retention Buffer ------------------------------------
    // Resuelve el problema de turnover por variaciones marginales de score.
    //
    // Top 10 como universo de candidatos:
    //   - Activos incumbentes (en currentHoldings) dentro del Top 10 reciben
    //     "Inmunidad por Retencion" - se fuerza su inclusion en el Top 5 definitivo.
    //   - Retadores (no en currentHoldings) solo ocupan slots vacios que dejen
    //     los incumbentes que cayeron por debajo del Top 10.
    //
    // Limite sectorial: aplica solo a retadores (inmunidad override sector limit).

    const top10 = scored.slice(0, 10);
    const top5  = [];
    const sectorCount = {};

    // Paso 1: incluir incumbentes con inmunidad (estan en currentHoldings y en Top 10)
    for (const t of top10) {
      if (top5.length >= 5) break;
      if (currentHoldings.has(t.symbol)) {
        top5.push({ ...t, retained: true });
        // Los incumbentes no computan en el limite sectorial para no bloquear a otros incumbentes
      }
    }

    // Paso 2: llenar slots vacios con retadores (no incumbentes), respetando limite sectorial
    for (const t of top10) {
      if (top5.length >= 5) break;
      if (currentHoldings.has(t.symbol)) continue; // ya procesado en paso 1
      const sec = t.sector || "Otros";
      // Contar sectorialmente solo entre los retadores ya incluidos
      const retadoresEnSector = top5.filter(x => !x.retained && (x.sector || "Otros") === sec).length;
      if (retadoresEnSector >= 2) continue;
      top5.push({ ...t, retained: false });
      sectorCount[sec] = (sectorCount[sec] ?? 0) + 1;
    }

    // -- Waterfall Sizing - Algoritmo Iterativo de Cascada --------------------
    // Resuelve la falla matematica del cap de un solo paso: cuando un activo
    // es capeado, su excedente se redistribuye iterativamente entre los demas.
    // Si todos los activos estan bloqueados, el excedente va a CASH (Risk Off).
    //
    // Caps duales:
    //   HARD CAP:  peso maximo absoluto = 30% (concentracion maxima por activo)
    //   RISK CAP:  MRC_cap_i = 0.28 / PCR_i  (cap por contribucion marginal al riesgo)
    //   effectiveCap_i = min(RISK_CAP_i, HARD_CAP)

    let cashWeight = 0;
    const HARD_CAP = 0.30;
    const RC_MAX   = 0.28;
    const n        = top5.length;
    const weightsCapped = {};   // { symbol: pesoFinal }  - resultado del waterfall
    const riskCapped    = {};   // { symbol: 'HARD CAP 30%' | 'RISK CAP' | null }

    if (n > 0) {
      // Covarianza y MRC (igual que antes)
      const series  = top5.map(t => t.returns21 ?? []);
      const minLen  = Math.min(...series.map(s => s.length));
      const aligned = series.map(s => s.slice(s.length - minLen));
      const cov = (a, b) => {
        if (a.length < 2) return 0;
        const ma = a.reduce((s,v)=>s+v,0)/a.length;
        const mb = b.reduce((s,v)=>s+v,0)/b.length;
        return a.reduce((s,v,k) => s + (v-ma)*(b[k]-mb), 0) / (a.length - 1);
      };
      const covMat  = Array.from({length:n}, (_,i) => Array.from({length:n}, (_,j) => cov(aligned[i], aligned[j])));

      // Pesos crudos: volatilidad inversa normalizada
      const sumInv  = top5.reduce((s, t) => s + 1/t.vol21, 0);
      const weights = top5.map(t => (1/t.vol21) / sumInv);  // mutable durante el waterfall

      // Sigma del portafolio y PCR para el cap MRC (calculados sobre pesos crudos iniciales)
      let varP = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) varP += weights[i] * weights[j] * covMat[i][j];
      const sigmaP = Math.sqrt(Math.max(varP, 1e-10));
      const mrc    = Array.from({length:n}, (_,i) => {
        let dot = 0; for (let j = 0; j < n; j++) dot += covMat[i][j] * weights[j];
        return dot / sigmaP;
      });
      const pcr    = mrc.map(m => m / sigmaP);             // contribucion porcentual al riesgo
      const mrcCap = pcr.map(p => p > 0 ? RC_MAX / p : HARD_CAP);  // cap individual por MRC

      // -- Bucle iterativo de cascada -----------------------------------------
      const blocked    = new Array(n).fill(false);
      const capReason  = new Array(n).fill(null);  // 'HARD CAP 30%' | 'RISK CAP'
      let   requiresRecalculation = true;

      while (requiresRecalculation) {
        requiresRecalculation = false;
        let excess = 0;

        for (let i = 0; i < n; i++) {
          if (blocked[i]) continue;
          const effectiveCap = Math.min(mrcCap[i], HARD_CAP);
          if (weights[i] > effectiveCap + 1e-9) {
            excess          += weights[i] - effectiveCap;
            weights[i]       = effectiveCap;
            blocked[i]       = true;
            capReason[i]     = weights[i] === HARD_CAP || mrcCap[i] >= HARD_CAP ? 'HARD CAP 30%' : 'RISK CAP';
            // Determinar motivo preciso: HARD CAP si el limite activo fue 0.30
            capReason[i]     = effectiveCap >= HARD_CAP - 1e-9 ? 'HARD CAP 30%' : 'RISK CAP';
            requiresRecalculation = true;
          }
        }

        if (excess > 1e-9) {
          const unblockedSum = weights.reduce((s, w, i) => s + (!blocked[i] ? w : 0), 0);
          if (unblockedSum > 1e-9) {
            // Redistribuir proporcionalmente entre no bloqueados
            for (let i = 0; i < n; i++) {
              if (!blocked[i]) weights[i] += excess * (weights[i] / unblockedSum);
            }
          } else {
            // Todos bloqueados: excedente va a CASH (Risk Off)
            cashWeight += excess;
            requiresRecalculation = false;
          }
        }
      }

      // Asignar resultados
      top5.forEach((t, i) => {
        weightsCapped[t.symbol] = weights[i];
        riskCapped[t.symbol]    = blocked[i] ? capReason[i] : null;  // null = sin cap
      });
    }
    const top5Symbols = new Set(top5.map(t => t.symbol));
    const cashSlots = 5 - n;
    return { top5, cashSlots, spyROC21, survivorCount: scored.length, radarUniverseSize: radarApproved.size, weightsCapped, riskCapped, cashWeight, top6to10: scored.filter(t => !top5Symbols.has(t.symbol)).slice(0, 5), scored };
  }, [twScore, snapshots, selDate, radarScores, currentHoldings, fredRegime, marketContext]);
  // -- exportMasterScoresCSV - Exporta masterPctRaw historico para IC test ------
  // Itera sobre todas las fechas del store y recomputa ROC + RS + vol + percentil
  // para cada ticker en cada sesion. Genera un CSV con:
  //   Fecha, Ticker, masterPctRaw, masterPct, penaltyApplied, roc21, rs21, vol21
  // Este CSV es el input correcto para 01_ic_test.py (score = masterPctRaw).
  const exportMasterScoresCSV = () => {
    const dates = Object.keys(snapshots).sort();
    if (dates.length < 2) { alert("Necesitas al menos 2 snapshots para exportar."); return; }

    const rows = ["Fecha,Ticker,masterPctRaw,masterPct,penaltyApplied,roc21,rs21,vol21"];
    const BETA_EXP = 10.0;

    for (const selD of dates.slice(1)) {
      // SPY benchmark para esta fecha
      let spyR = null;
      for (const bm of ["^GSPC","SPY"]) {
        const r = calcROC21d(bm, snapshots, selD);
        if (r != null) { spyR = r; break; }
      }

      // Calcular scores crudos para todos los tickers con precio
      const datesAll = Object.keys(snapshots).sort();
      const selIdx   = datesAll.indexOf(selD);
      const raw = [];

      for (const t of twScore) {
        const roc = calcROC21d(t.symbol, snapshots, selD);
        if (roc == null) continue;
        const rs   = spyR != null ? roc - spyR : roc;
        const base = (roc + rs) / 2;

        // Precios para EWMA
        const wSize = Math.min(selIdx, 63);
        const startI = Math.max(0, selIdx - wSize);
        const prices = [];
        for (let i = startI; i <= selIdx; i++) {
          const p = snapshots[datesAll[i]]?.tickers?.find(tk => tk.symbol === t.symbol)?.last_price ?? null;
          if (p != null) prices.push(p);
        }

        let vol = null;
        if (prices.length > 1) {
          const ewma = calcEWMAVolatility(prices, 0.94, Math.min(21, prices.length - 1), false);
          vol = (ewma != null && ewma > 0.01) ? ewma : null;
          if (vol == null && prices.length >= 2) {
            const rets = prices.slice(1).map((p,i) => (p - prices[i]) / prices[i] * 100);
            const mu   = rets.reduce((a,b)=>a+b,0)/rets.length;
            const fallback = Math.sqrt(rets.reduce((a,b)=>a+(b-mu)**2,0)/rets.length);
            if (fallback > 0.01) vol = fallback;
          }
          if (vol == null) vol = 1.0;
        }
        if (vol == null || vol <= 0) continue;

        const master = (base / vol);
        raw.push({ symbol: t.symbol, master, roc, rs, vol });
      }

      if (raw.length < 2) continue;
      raw.sort((a,b) => b.master - a.master);
      const n = raw.length;
      const sqrtW = Math.sqrt(Math.min(selIdx, 63));

      raw.forEach((t, rank) => {
        const rawPct = parseFloat(((n - 1 - rank) / (n - 1) * 100).toFixed(1));
        let penalty  = 0;
        if (t.vol > 0 && t.roc != null) {
          const sigmaW = t.vol * sqrtW;
          const zW     = t.roc / sigmaW;
          penalty = BETA_EXP * Math.max(0, -zW);
        }
        const mPct = parseFloat(Math.max(0, rawPct - penalty).toFixed(1));
        rows.push([
          selD,
          t.symbol,
          rawPct,
          mPct,
          parseFloat(penalty.toFixed(2)),
          parseFloat(t.roc.toFixed(3)),
          parseFloat(t.rs.toFixed(3)),
          parseFloat(t.vol.toFixed(4)),
        ].join(","));
      });
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "master_scores_historico_" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    alert(`Exportado: ${dates.length - 1} sesiones x ~${twScore.length} tickers.\nUsa este CSV como input para 01_ic_test.py (columna masterPctRaw).`);
  };

  const filtered = useMemo(() =>
    twScore.filter(t=>!filter||t.symbol?.toLowerCase().includes(filter.toLowerCase())),
    [twScore, filter]
  );
  const sorted = useMemo(() =>
    [...filtered].sort((a,b)=>{ const av=a[sortKey]??(sortDir==="asc"?Infinity:-Infinity); const bv=b[sortKey]??(sortDir==="asc"?Infinity:-Infinity); return sortDir==="asc"?av-bv:bv-av; }),
    [filtered, sortKey, sortDir]
  );

  // Reseteo de paginacion: cualquier mutacion en sorted vuelve al indice 0

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginatedRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const topG=[...tickers].filter(t=>t.change_pct!=null).sort((a,b)=>b.change_pct-a.change_pct).slice(0,5);
  const topL=[...tickers].filter(t=>t.change_pct!=null).sort((a,b)=>a.change_pct-b.change_pct).slice(0,5);
  const hmSectors={};
  for (const t of tickers) { const s=getSector(t.symbol); if(!hmSectors[s]) hmSectors[s]=[]; hmSectors[s].push(t); }

  const TABS=[["dashboard","DASHBOARD"],["radar","RADAR"],["alertas","ALERTAS"+(alerts.length>0?" ("+alerts.length+")":"")],["heatmap","HEATMAP"],["estructura","ESTRUCTURA"],["valuacion","BARATO/CARO"],["comparar","COMPARAR"],["mercadoarg","MERCADO ARGENTINO"],["primacedear","PRIMA CEDEAR"],["operar","OPERAR"]];
  const SUGS=["Dame un resumen ejecutivo del mercado hoy","Que sector domina el movimiento de hoy?","Cuales tienen el forward P/E mas barato con EPS positivo?","Analiza OXY, PAAS, GLD y PG con los datos actuales","Hay senales de rotacion sectorial en los ultimos dias?","Detecta posibles ciclos de acumulacion o distribucion"];

  return (
    <div style={{fontFamily:"monospace",fontSize:"12px",background:"var(--bg)",color:"var(--text)",minHeight:"100vh",lineHeight:1.4}}>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>

      {/* Header */}
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"8px 16px",display:"flex",alignItems:"center",gap:"0"}}>
        <div style={{fontFamily:"system-ui,sans-serif",fontWeight:600,fontSize:"13px",color:"var(--amber)",marginRight:"20px",whiteSpace:"nowrap",letterSpacing:"0.05em"}}>- 900 MAGNIFICAS</div>
        <div style={{display:"flex",gap:"14px",flex:1,flexWrap:"wrap",overflow:"hidden"}}>
          {curData?.market && [["S&P",curData.market.sp500],["DOW",curData.market.dow30],["NQ",curData.market.nasdaq],["RUT",curData.market.russell2000],["VIX",curData.market.vix],["XAU",curData.market.gold],["BTC",curData.market.bitcoin],["10Y",curData.market.rate_10yr]].map(([l,d])=>d?.price!=null&&(
            <div key={l} style={{display:"flex",alignItems:"baseline",gap:"4px"}}>
              <span style={{color:"var(--muted)",fontSize:"10px",letterSpacing:"0.06em"}}>{l}</span>
              <span style={{fontWeight:500}}>{fmt(d.price,l==="10Y"?4:2)}</span>
              <span style={{fontSize:"10px",color:pc(d.change_pct),fontWeight:500}}>{fmtPct(d.change_pct)}</span>
            </div>
          ))}
        </div>
        {dates.length>0 && (
          <select value={selDate||""} onChange={e=>{ setSelDate(e.target.value); setPage(0); }} style={{background:"var(--bg3)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"4px 8px",fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>
            {dates.map(d=><option key={d} value={d}>{d} - {snapshots[d]?.tickers?.length}T{snapshots[d]?.note?" - "+snapshots[d].note.slice(0,20):""}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"0 16px",display:"flex",overflowX:"auto"}}>
        {TABS.map(([id,label])=>(
          <button key={id} className="TAB" onClick={()=>setTab(id)} style={{background:"none",border:"none",borderBottom:tab===id?"2px solid var(--amber)":"2px solid transparent",color:tab===id?"var(--amber)":"var(--muted)",padding:"10px 12px",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",fontWeight:tab===id?600:400,letterSpacing:"0.07em",whiteSpace:"nowrap"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{padding:"12px 16px"}}>

        {/* DASHBOARD */}
        {tab==="dashboard" && (
          <div>
            {dates.length===0 ? (
              <div style={{textAlign:"center",padding:"80px 20px",color:"var(--muted)"}}>
                <div style={{fontSize:"32px",marginBottom:"12px",opacity:0.4}}>◎</div>
                <div style={{fontSize:"14px",marginBottom:"8px"}}>Sin datos</div>
                <div style={{fontSize:"11px",opacity:0.6}}>Carga el primer snapshot desde <span style={{color:"var(--amber)",cursor:"pointer"}} onClick={()=>setTab("dashboard")}>CARGAR</span></div>
              </div>
            ) : (
              <div>
                {/* RadarEstresSistemico - HUD de riesgo en tiempo real */}
                {(()=>{
                  try {
                    const rc = curData?.risk_calibration;
                    const fromRc = rc && typeof rc.vix_mu === "number" && typeof rc.vix_sigma === "number" &&
                                   typeof rc.move_mu === "number" && typeof rc.move_sigma === "number";
                    const fromZs = zsParams && typeof zsParams.mu_vix === "number" && typeof zsParams.sigma_vix === "number" &&
                                   typeof zsParams.mu_move === "number" && typeof zsParams.sigma_move === "number";

                    // PRIORIDAD: zsParams del storage (calibracion explicita del usuario) siempre
                    // tiene prioridad sobre rc (calibracion embebida en el snapshot, solo fallback).
                    // esHistorico = true SOLO cuando zsParams esta ausente y usamos el fallback rc.
                    const params = fromZs
                      ? { mu_vix: zsParams.mu_vix, sigma_vix: zsParams.sigma_vix, mu_move: zsParams.mu_move, sigma_move: zsParams.sigma_move, esHistorico: false }
                      : fromRc
                        ? { mu_vix: rc.vix_mu, sigma_vix: rc.vix_sigma, mu_move: rc.move_mu, sigma_move: rc.move_sigma, esHistorico: true, calibrado: rc.calibrado }
                        : null;
                    if (!params) return (
                      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"10px 14px",marginBottom:"10px",fontSize:"10px",color:"var(--muted)"}}>
                        RADAR APAGADO: Faltan datos de calibracion estadistica. Carga los CSV historicos en la pestana CARGAR.
                      </div>
                    );

                    // Buscar VIX y MOVE en tickers primero, luego en curData.market como fallback
                    const vixTk  = tickers.find(t => t.symbol === "^VIX");
                    const moveTk = tickers.find(t => t.symbol === "^MOVE");
                    const actualVIX  = typeof vixTk?.last_price  === "number" ? vixTk.last_price
                                     : typeof curData?.market?.vix?.price === "number" ? curData.market.vix.price : null;
                    const actualMOVE = typeof moveTk?.last_price === "number" ? moveTk.last_price : null;

                    const safeZ = (actual, mu, sigma) => (actual != null && sigma > 0) ? (actual - mu) / sigma : null;
                    const zVIX  = safeZ(actualVIX,  params.mu_vix,  params.sigma_vix);
                    const zMOVE = safeZ(actualMOVE, params.mu_move, params.sigma_move);
                    const umbralVIX  = params.mu_vix  + 2.0 * params.sigma_vix;
                    const umbralMOVE = params.mu_move + 2.0 * params.sigma_move;
                    const trimTotal  = calcularTrimSistemico();

                    const n = (v, d=2) => typeof v === "number" ? v.toFixed(d) : "-";
                    const zColor = z => z == null ? "var(--muted)" : z >= 2.0 ? "var(--red)" : z >= 1.5 ? "var(--amber)" : "var(--green)";
                    const zBg    = z => z == null ? "transparent" : z >= 2.0 ? "rgba(255,59,92,0.1)" : z >= 1.5 ? "rgba(245,158,11,0.08)" : "rgba(0,217,100,0.06)";
                    const zBdr   = z => z == null ? "var(--border)" : z >= 2.0 ? "rgba(255,59,92,0.4)" : z >= 1.5 ? "rgba(245,158,11,0.4)" : "rgba(0,217,100,0.3)";
                    const barPct = z => typeof z === "number" ? Math.min(100, Math.max(0, (z / 3.0) * 100)) : 0;
                    const maxZ   = Math.max(zVIX ?? 0, zMOVE ?? 0);

                    const GaugeBar = ({label, actual, z, umbral, sigma, mu, descripcion}) => {
                      const muN  = typeof mu    === "number" ? mu    : null;
                      const sigN = typeof sigma === "number" ? sigma : null;
                      const umbN = typeof umbral=== "number" ? umbral: null;
                      const alerta = umbN != null && sigN != null ? umbN - sigN*0.5 : null;
                      const zLabel = z == null ? "SIN DATO" : z >= 2.0 ? "TRIM ACTIVO" : z >= 1.5 ? "ALERTA" : "NORMAL";
                      return (
                        <div style={{flex:1,minWidth:"220px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"3px"}}>
                            <div>
                              <span style={{fontSize:"11px",fontWeight:700,color:"var(--text)",letterSpacing:"0.07em"}}>{label}</span>
                              <span style={{fontSize:"9px",color:"var(--muted)",marginLeft:"6px"}}>{descripcion}</span>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <span style={{fontSize:"13px",fontWeight:700,color:zColor(z)}}>{n(actual)}</span>
                              <span style={{fontSize:"9px",color:"var(--muted)",marginLeft:"4px"}} title="Z-Score: cuantas desviaciones estandar esta el valor actual por encima de la media historica de 252 dias. Z=2.0 significa que el indice esta en un nivel estadisticamente anormal.">Z={n(z)} ⓘ</span>
                            </div>
                          </div>
                          <div style={{height:"10px",background:"var(--bg3)",borderRadius:"5px",overflow:"hidden",marginBottom:"6px",position:"relative"}}>
                            <div style={{position:"absolute",left:(1.5/3*100)+"%",top:0,bottom:0,width:"1px",background:"rgba(245,158,11,0.7)",zIndex:1}}/>
                            <div style={{position:"absolute",left:(2/3*100)+"%",top:0,bottom:0,width:"2px",background:"rgba(255,59,92,0.8)",zIndex:1}}/>
                            <div style={{height:"100%",width:barPct(z)+"%",background:zColor(z),borderRadius:"5px",transition:"width 0.4s ease"}}/>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px",fontSize:"9px"}}>
                            <div style={{color:"var(--muted)"}} title="Zona segura: el indice esta dentro de su rango historico normal. No se requiere accion defensiva.">
                              <div style={{color:"var(--green)",fontWeight:700}}>NORMAL ⓘ</div>
                              <div>Z &lt; 1.5</div>
                              <div>Bajo {alerta!=null?n(alerta):"-"}</div>
                            </div>
                            <div style={{color:"var(--muted)"}} title="Zona de alerta: el indice esta elevado pero sin superar el umbral critico. Reducir apetito por riesgo, evitar nuevas compras agresivas.">
                              <div style={{color:"var(--amber)",fontWeight:700}}>ALERTA ⓘ</div>
                              <div>Z 1.5 - 2.0</div>
                              <div>{alerta!=null?n(alerta):"-"} - {umbN!=null?n(umbN):"-"}</div>
                            </div>
                            <div style={{color:"var(--muted)"}} title="TRIM ACTIVO: el indice supero 2 desviaciones estandar sobre su media historica. El motor calcula automaticamente que porcentaje de renta variable reducir para proteger el capital. El porcentaje se inyecta como mandato al analista IA.">
                              <div style={{color:"var(--red)",fontWeight:700}}>TRIM ACTIVO ⓘ</div>
                              <div>Z >= 2.0</div>
                              <div>Sobre {umbN!=null?n(umbN):"-"}</div>
                            </div>
                          </div>
                          <div style={{marginTop:"5px",fontSize:"9px",color:zColor(z),fontWeight:700}} title={z>=2.0?"El motor de riesgo calculo un TRIM sistemico basado en el exceso del Z-score. Este porcentaje se envia automaticamente al analista IA como mandato de reduccion de exposicion.":z>=1.5?"El indice esta en zona de alerta. Monitorear. Si supera el umbral marcado, se activara el TRIM automatico.":"El indice esta dentro de parametros normales."}>
                            ESTADO ACTUAL: {zLabel}{z>=2.0&&trimTotal>0?" - TRIM "+n(trimTotal)+"% ⓘ":""}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div style={{background:zBg(maxZ),border:"1px solid "+zBdr(maxZ),borderRadius:"6px",padding:"14px",marginBottom:"10px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                            <span style={{fontSize:"10px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em"}} title="Monitorea el nivel de estres estadistico del mercado usando Z-scores calibrados con 252 dias de historial. Cuando el VIX o el MOVE superan 2 desviaciones estandar sobre su media, el motor calcula automaticamente un porcentaje de reduccion de renta variable (TRIM) y lo inyecta como mandato al analista IA.">RADAR DE ESTRES SISTEMICO ⓘ</span>
                            {params.esHistorico && <span style={{fontSize:"9px",background:"rgba(59,158,255,0.15)",color:"var(--blue)",padding:"2px 6px",borderRadius:"3px"}}>HISTORICO {params.calibrado||""}</span>}
                          </div>
                          {trimTotal > 0
                            ? <span style={{fontSize:"12px",fontWeight:700,color:"var(--red)",background:"rgba(255,59,92,0.12)",padding:"4px 12px",borderRadius:"4px",letterSpacing:"0.04em"}} title={"El motor calculo que el nivel de estres estadistico justifica reducir la exposicion a renta variable en un "+n(trimTotal)+"% del capital total. Este mandato se envia automaticamente al analista IA en cada consulta."}>! TRIM SISTEMICO {n(trimTotal)}% ⓘ</span>
                            : <span style={{fontSize:"10px",color:"var(--green)",fontWeight:600}} title="Ningun indice supera las 2 desviaciones estandar sobre su media historica. No se requiere reduccion sistemica de riesgo.">OK Zona segura</span>}
                        </div>
                        <div style={{display:"flex",gap:"20px",flexWrap:"wrap"}}>
                          <GaugeBar label="VIX"  actual={actualVIX}  z={zVIX}  umbral={umbralVIX}  sigma={params.sigma_vix}  mu={params.mu_vix}  descripcion="volatilidad implicita S&P"/>
                          <GaugeBar label="MOVE" actual={actualMOVE} z={zMOVE} umbral={umbralMOVE} sigma={params.sigma_move} mu={params.mu_move} descripcion="volatilidad implicita bonos del Tesoro"/>
                        </div>
                      </div>
                    );
                  } catch(e) {
                    return (
                      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"10px 14px",marginBottom:"10px",fontSize:"10px",color:"var(--muted)"}}>
                        RADAR APAGADO: Error de calibracion - {e.message}
                      </div>
                    );
                  }
                })()}
                {/* Banner de sistema degradado - se activa cuando calibracion es obsoleta */}
                {cycleIndicators?.calibrationWarning && (
                  <div style={{background:"rgba(255,59,92,0.12)",border:"2px solid rgba(255,59,92,0.6)",borderRadius:"6px",padding:"12px 16px",marginBottom:"10px",display:"flex",alignItems:"flex-start",gap:"12px"}}>
                    <span style={{fontSize:"18px",flexShrink:0}}>!️</span>
                    <div>
                      <div style={{fontSize:"11px",fontWeight:700,color:"var(--red)",letterSpacing:"0.06em",marginBottom:"3px"}}>SISTEMA DEGRADADO - MOTOR DE NIVEL INACTIVO</div>
                      <div style={{fontSize:"10px",color:"#ff8e9e",lineHeight:1.6}}>
                        Calibracion estatica obsoleta (sin rolling window activo). La trampa de habituacion esta desactivada: el sistema NO puede distinguir entre un VIX estructuralmente elevado y un shock transitorio. Los votos del ciclo macroeconomico solo usan Z-scores de ventana corta - pueden normalizar regimenes de estres persistente como "expansion".
                      </div>
                      <div style={{fontSize:"10px",fontWeight:700,color:"var(--red)",marginTop:"6px"}}>ACCION REQUERIDA: Carga los archivos VIXCLS.csv e Investing MOVE en CARGAR -> Calibracion Z-Score para restaurar el motor de nivel.</div>
                    </div>
                  </div>
                )}

                {cycleIndicators.hasData && (
                  <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                      <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
                        <span style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.07em",color:"var(--muted)"}}>REGIMEN MACRO</span>
                        <span style={{fontSize:"11px",fontWeight:700,color:cycleIndicators.phase==="contraccion"?"var(--red)":cycleIndicators.phase==="expansion"?"var(--green)":cycleIndicators.phase==="recuperacion"?"var(--blue)":"var(--amber)"}}>
                          {cycleIndicators.phase?.toUpperCase()} <span style={{fontSize:"9px",fontWeight:400,color:"var(--muted)"}}>({cycleIndicators.confidence})</span>
                        </span>
                      </div>
                      <div style={{display:"flex",gap:"14px",fontSize:"10px",color:"var(--muted)"}}>
                        {cycleIndicators.yieldSpread != null && <span>10Y-3M <span style={{color:cycleIndicators.yieldSpread>=0?"var(--green)":"var(--red)",fontWeight:600}}>{cycleIndicators.yieldSpread.toFixed(2)}%</span></span>}
                        {cycleIndicators.copperGold != null && <span>Cu/Au <span style={{fontWeight:600}}>{cycleIndicators.copperGold.toFixed(3)}</span></span>}
                      </div>
                    </div>

                    {/* Barra con porcentajes encima de cada segmento */}
                    {(()=>{
                      const probs = cycleIndicators.probabilities || {};
                      const segs = [
                        {key:"expansion",    label:"Expansion",    color:"var(--green)"},
                        {key:"desaceleracion",label:"Desaceleracion",color:"var(--amber)"},
                        {key:"contraccion",  label:"Contraccion",  color:"var(--red)"},
                        {key:"recuperacion", label:"Recuperacion", color:"var(--blue)"},
                      ];
                      return (
                        <div style={{marginBottom:"12px"}}>
                          {/* Etiquetas encima */}
                          <div style={{display:"flex",marginBottom:"3px"}}>
                            {segs.map(({key,label,color})=>{
                              const pct = probs[key]||0;
                              if (pct === 0) return null;
                              return (
                                <div key={key} style={{width:pct+"%",overflow:"hidden",textAlign:"center"}}>
                                  <span style={{fontSize:"9px",fontWeight:700,color,whiteSpace:"nowrap"}}>{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                          {/* Barra */}
                          <div style={{display:"flex",height:"8px",borderRadius:"4px",overflow:"hidden",background:"var(--bg3)"}}>
                            {segs.map(({key,color})=>(
                              <div key={key} style={{width:`${probs[key]||0}%`,background:color,transition:"width 0.3s"}}/>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {cycleIndicators.recommendation && <div style={{fontSize:"11px",color:"var(--text)",lineHeight:1.5,marginBottom:"8px",borderTop:"1px solid var(--border)",paddingTop:"8px"}}>{cycleIndicators.recommendation}</div>}
                    {cycleIndicators.signals?.length>0 && <div style={{borderTop:"1px solid var(--border)",paddingTop:"8px"}}>{cycleIndicators.signals.map((s,i)=><div key={i} style={{fontSize:"10px",color:"#ff8e9e",display:"flex",gap:"6px",marginBottom:"2px"}}><span>-</span>{s}</div>)}</div>}

                    {/* Guia de referencia con porcentajes integrados */}
                    <div style={{marginTop:"12px",padding:"10px",background:"var(--bg3)",borderRadius:"4px",border:"1px solid var(--border2)"}}>
                      <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",marginBottom:"6px",letterSpacing:"0.05em"}}>GUIA DE REFERENCIA:</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                        {[
                          {label:"VERANO (Expansion)",     key:"expansion",     color:"var(--green)", desc:"Tasas estables, credito sano. El dinero vuela a Tech y Crecimiento."},
                          {label:"OTOÑO (Desaceleracion)", key:"desaceleracion", color:"var(--amber)", desc:"Inflacion y tasas subiendo. El capital busca Energia y Valor."},
                          {label:"INVIERNO (Contraccion)", key:"contraccion",   color:"var(--red)",   desc:"Panico o recesion. Refugio en Oro, Dolar y Bonos."},
                          {label:"PRIMAVERA (Recuperacion)",key:"recuperacion", color:"var(--blue)",  desc:"Piso tocado. Anticipacion de baja de tasas. Compra de Small Caps."},
                        ].map(({label,key,color,desc})=>{
                          const pct = cycleIndicators.probabilities?.[key]||0;
                          return (
                            <div key={key} style={{fontSize:"9px",color:"var(--muted)"}}>
                              <b style={{color}}>{label}: <span style={{fontWeight:700}}>{pct}%</span></b> {desc}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {(() => {
                  const moveTicker = tickers.find(t => t.symbol === "^MOVE");
                  const localMoveIndex = moveTicker?.last_price ?? null;
                  const localMoveChange = moveTicker?.change_pct ?? null;
                  if (localMoveIndex == null) return (
                    <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"10px"}}>
                      <span style={{fontSize:"10px",fontWeight:700,color:"var(--muted)"}}>INDICE MOVE: N/A - agrega ^MOVE al watchlist</span>
                    </div>
                  );
                  const shockVelocidad = localMoveChange != null && localMoveChange >= 8;
                  const shockNivel = localMoveIndex > 120;
                  const esPanico = shockNivel || shockVelocidad;
                  const esEstres = !esPanico && localMoveIndex >= 100;
                  const motivo = shockNivel && shockVelocidad ? "NIVEL + SHOCK" : shockNivel ? "NIVEL > 120" : shockVelocidad ? "SHOCK +" + localMoveChange.toFixed(1) + "% HOY" : null;
                  const bg  = esPanico ? "rgba(255,59,92,0.15)"  : esEstres ? "rgba(245,158,11,0.15)"  : "rgba(0,217,100,0.15)";
                  const col = esPanico ? "var(--red)"             : esEstres ? "var(--amber)"           : "var(--green)";
                  const bdr = esPanico ? "rgba(255,59,92,0.4)"   : esEstres ? "rgba(245,158,11,0.4)"   : "rgba(0,217,100,0.4)";
                  const label = esPanico ? "VOLATILIDAD BONOS - ESTADO DE EXCEPCION" : esEstres ? "VOLATILIDAD BONOS ELEVADA" : "VOLATILIDAD BONOS NORMAL";
                  return (
                    <div style={{background:"var(--bg2)",border:"1px solid "+bdr,borderRadius:"6px",padding:"14px",marginBottom:"10px",display:"flex",alignItems:"center",gap:"12px"}}>
                      <span style={{fontSize:"10px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.07em"}}>INDICE MOVE</span>
                      <span style={{display:"inline-flex",alignItems:"center",gap:"4px",padding:"3px 8px",borderRadius:"3px",fontSize:"11px",fontWeight:700,background:bg,color:col}}>
                        {localMoveIndex.toFixed(0)}
                        {localMoveChange!=null&&<span style={{fontWeight:400,opacity:0.8}}> {localMoveChange>=0?"+":""}{localMoveChange.toFixed(1)}%</span>}
                        {" - "}{label}
                        {motivo&&esPanico&&<span style={{fontSize:"9px",marginLeft:"4px",opacity:0.8}}>({motivo})</span>}
                      </span>
                    </div>
                  );
                })()}

                {/* Credit Stress */}
                {/* Badge calibracion historica - solo informacional, no sobrescribe zsParams */}
                {(() => {
                  const rc = curData?.risk_calibration;
                  if (!rc) return null;
                  const rcValid = typeof rc.vix_mu === "number" && typeof rc.vix_sigma === "number" &&
                                  typeof rc.move_mu === "number" && typeof rc.move_sigma === "number";
                  if (!rcValid) return null;
                  const esMisma = zsParams && typeof zsParams.mu_vix === "number";
                  if (esMisma) return null; // zsParams del storage tiene prioridad - suprimir fallback embebido
                  const moveTk = tickers.find(t => t.symbol === "^MOVE");
                  const vixTk  = tickers.find(t => t.symbol === "^VIX");
                  const zVIX  = typeof vixTk?.last_price  === "number" && rc.vix_sigma  > 0 ? ((vixTk.last_price  - rc.vix_mu)  / rc.vix_sigma).toFixed(2)  : null;
                  const zMOVE = typeof moveTk?.last_price === "number" && rc.move_sigma > 0 ? ((moveTk.last_price - rc.move_mu) / rc.move_sigma).toFixed(2) : null;
                  return (
                    <div style={{background:"rgba(59,158,255,0.06)",border:"1px solid rgba(59,158,255,0.25)",borderRadius:"6px",padding:"8px 12px",marginBottom:"10px",fontSize:"10px",color:"var(--muted)"}}>
                      <span style={{color:"var(--blue)",fontWeight:700,marginRight:"8px"}}>CALIBRACION EMBEBIDA ({rc.calibrado||"?"})</span>
                      VIX μ={rc.vix_mu.toFixed(2)} sigma={rc.vix_sigma.toFixed(2)}{zVIX ? " -> Z="+zVIX : ""} &nbsp;|&nbsp;
                      MOVE μ={rc.move_mu.toFixed(2)} sigma={rc.move_sigma.toFixed(2)}{zMOVE ? " -> Z="+zMOVE : ""}
                      <span style={{marginLeft:"10px",fontSize:"9px",opacity:0.7}}>(solo referencia historica - no afecta calculos en vivo)</span>
                    </div>
                  );
                })()}

                <div style={{background:"var(--bg2)",border:"1px solid "+(creditStress.stressLevel==="ALTO"?"rgba(255,59,92,0.4)":creditStress.stressLevel==="MODERADO"?"rgba(245,158,11,0.3)":"var(--border)"),borderRadius:"6px",padding:"10px 14px",marginBottom:"10px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:creditStress.signals.length>0?"8px":"0"}}>
                    <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
                      <span style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.07em",color:"var(--muted)"}}>ESTRES CREDITICIO</span>
                      <span style={{fontSize:"10px",fontWeight:700,color:creditStress.stressLevel==="ALTO"?"var(--red)":creditStress.stressLevel==="MODERADO"?"var(--amber)":"var(--green)"}}>{creditStress.stressLevel}</span>
                    </div>
                    <div style={{display:"flex",gap:"14px",fontSize:"10px",color:"var(--muted)"}}>
                      {creditStress.hyg&&<span>HYG <span style={{color:pc(creditStress.hyg.change)}}>{fmtPct(creditStress.hyg.change)}</span></span>}
                      {creditStress.lqd&&<span>LQD <span style={{color:pc(creditStress.lqd.change)}}>{fmtPct(creditStress.lqd.change)}</span></span>}
                      {creditStress.tlt&&<span>TLT <span style={{color:pc(creditStress.tlt.change)}}>{fmtPct(creditStress.tlt.change)}</span></span>}
                      {creditStress.dxy&&<span>DXY <span style={{color:pc(creditStress.dxy.change)}}>{fmtPct(creditStress.dxy.change)}</span></span>}
                    </div>
                  </div>
                  {creditStress.signals.length>0&&<div style={{display:"flex",flexDirection:"column",gap:"2px"}}>{creditStress.signals.map((s,i)=><div key={i} style={{fontSize:"10px",color:"var(--muted)"}}>{s}</div>)}</div>}
                </div>

                {/* Top movers */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                  {[["ARRIBA",topG,"var(--green)"],["ABAJO",topL,"var(--red)"]].map(([title,list,color])=>(
                    <div key={title} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"10px 12px"}}>
                      <div style={{color,fontSize:"10px",fontWeight:600,letterSpacing:"0.08em",marginBottom:"8px"}}>{title}</div>
                      {list.map(t=>(
                        <div key={t.symbol} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}>
                          <span style={{fontWeight:500,color:"var(--amber)",cursor:"pointer"}} onClick={()=>openNews(t.symbol)}>{t.symbol}</span>
                          <div style={{display:"flex",gap:"10px"}}>
                            <span style={{color:"var(--muted)"}}>{fmt(t.last_price)}</span>
                            <span style={{color,fontWeight:600,minWidth:"60px",textAlign:"right"}}>{fmtPct(t.change_pct)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {alerts.length>0 && (
                  <div onClick={()=>setTab("alertas")} style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:"4px",padding:"8px 12px",marginBottom:"10px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:"var(--amber)",fontSize:"11px",fontWeight:600}}>ANOMALIAS: {alerts.length} detectada{alerts.length!==1?"s":""} hoy</span>
                    <span style={{color:"var(--muted)",fontSize:"10px"}}>Ver detalle -></span>
                  </div>
                )}

                {/* Table */}
                <div style={{display:"flex",gap:"10px",marginBottom:"8px",alignItems:"center"}}>
                  <input value={filter} onChange={e=>{ setFilter(e.target.value); setPage(0); }} placeholder="Filtrar simbolo..." style={{background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 10px",fontSize:"11px",width:"160px",fontFamily:"inherit"}}/>
                  <span style={{color:"var(--muted)",fontSize:"10px"}}>{sorted.length}/{tickers.length} tickers - {selDate}</span>
                  <span style={{color:"var(--muted)",fontSize:"10px",marginLeft:"auto"}}>click simbolo = noticias IA</span>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
                    <thead>
                      <tr style={{background:"var(--bg3)",borderBottom:"1px solid var(--border2)"}}>
                        {COLS.map(col=>(
                          <th key={col.key} className="STH" onClick={()=>{ if(sortKey===col.key) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(col.key);setSortDir("asc");} setPage(0); }} style={{padding:"7px 8px",textAlign:col.align==="left"?"left":"right",color:sortKey===col.key?"var(--amber)":"var(--muted)",fontWeight:600,letterSpacing:"0.06em",whiteSpace:"nowrap",userSelect:"none",fontSize:"10px"}}>
                            {col.label}{sortKey===col.key?(sortDir==="asc"?" ↑":" ↓"):""}
                          </th>
                        ))}
                        <th style={{padding:"7px 8px",color:"var(--muted)",fontSize:"10px"}}>CICLO</th>
                        <th style={{padding:"7px 8px",color:"var(--muted)",fontSize:"10px"}}>NEWS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((t,i)=>{
                        const cyc=getCyclePhase(t.symbol,snapshots);
                        return (
                          <tr key={t.symbol} className="TR" style={{borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg)":"var(--bg2)"}}>
                            {COLS.map(col=>{
                              const v=t[col.key];
                              const display=col.fmt?col.fmt(v):v??"-";
                              const color=col.color?col.color(v):col.key==="_val_score"?vsc(v):col.key==="_refi_risk"?(v?v.color:"var(--muted)"):"var(--text)";
                              return <td key={col.key} title={col.key==="_piotroski"&&v==null?"! Piotroski sin datos (ADR/Yahoo sin cobertura) - score calculado sobre metricas restantes":undefined} style={{padding:"5px 8px",textAlign:col.align==="left"?"left":"right",color:col.key==="symbol"?"var(--amber)":color,fontWeight:col.key==="symbol"?600:col.key==="change_pct"||col.key==="_val_score"?600:400,whiteSpace:"nowrap",cursor:col.key==="symbol"?"pointer":"default"}} onClick={col.key==="symbol"?()=>openNews(t.symbol):undefined}>{col.key==="symbol"&&["MSTR","COIN","MARA"].includes(t.symbol)?<span title="Distorsion Contable FASB: Proxy de Criptoactivos">{display} <span style={{fontSize:"10px",cursor:"help"}}>!️</span></span>:display}</td>;
                            })}
                            <td style={{padding:"5px 8px",textAlign:"center"}}>
                              {cyc ? <span className="CHIP" style={{background:cyc.color+"22",color:cyc.color,border:"1px solid "+cyc.color+"44"}}>{cyc.label}</span> : <span style={{color:"var(--muted)"}}>-</span>}
                            </td>
                            <td style={{padding:"5px 8px",textAlign:"center"}}>
                              <button className="NB" onClick={()=>openNews(t.symbol)} style={{background:"none",border:"1px solid var(--border2)",color:"var(--muted)",cursor:"pointer",borderRadius:"3px",padding:"2px 6px",fontSize:"10px",fontFamily:"inherit"}}>buscar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:"10px",marginTop:"10px",padding:"8px"}}>
                    <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{background:"var(--bg2)",border:"1px solid var(--border2)",color:page===0?"var(--muted)":"var(--text)",borderRadius:"4px",padding:"5px 12px",cursor:page===0?"not-allowed":"pointer",fontFamily:"inherit",fontSize:"11px"}}>&lt;- Ant</button>
                    <span style={{color:"var(--muted)",fontSize:"10px"}}>Pag {page+1} / {totalPages} - {sorted.length} tickers</span>
                    <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1} style={{background:"var(--bg2)",border:"1px solid var(--border2)",color:page===totalPages-1?"var(--muted)":"var(--text)",borderRadius:"4px",padding:"5px 12px",cursor:page===totalPages-1?"not-allowed":"pointer",fontFamily:"inherit",fontSize:"11px"}}>Sig -></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* RADAR */}
        {tab==="radar" && (
          <div>
            <div style={{marginBottom:"14px"}}>
              <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>RADAR DE OPORTUNIDADES</div>
              <div style={{color:"var(--muted)",fontSize:"10px",marginBottom:"12px"}}>Puntuacion compuesta por tesis: valuacion, Piotroski, posicion vs sector, ciclo, riesgo de refinanciacion y alineacion macro.</div>
            </div>

            {/* == Consola de Ejecucion - Signal Engine == */}
            {(()=>{
              // -- Logica de senales (lee outputs de Radar Gate + masterScores) ------
              // No altera ningun calculo - solo lee y consolida para el operador.
              //
              // COMPRA TACTICA: todos los filtros en simultaneo
              //   1. Paso Radar Gate (esta en masterScores.top5 o scored)
              //   2. Piotroski >= 5 (filtro contable duro)
              //   3. refi_risk != "ALTO" (supervivencia de deuda)
              //   4. masterPct >= 90 (top 10% del cross-section)
              //
              // ALERTA DE VENTA: solo sobre activos en radarTracked (accionable)
              //   Piotroski <= 3 OR refi_risk == "ALTO"
              //   (ignora precio - reacciona solo a fractura fundamental)
              //
              // HOLD: paso Radar Gate pero no cumple extremos

              const allScored = masterScores?.top5 ?? [];
              // Extender con top6to10 para cubrir todo el top decil
              const top10Candidates = [
                ...allScored,
                ...(masterScores?.top6to10 ?? [])
              ];

              // Senales de COMPRA TACTICA
              // mcOk: excluye micro-caps < USD 2B (market_cap null = ETF -> pasa)
              // pctOk: usa masterPctSmoothed (post-histeresis) si esta disponible
              const MC_MIN_BUY = 2e9;
              const buySignals = top10Candidates.filter(t => {
                const pioOk  = t._piotroski != null && t._piotroski >= 5;
                const refiOk = t._refi_risk?.label !== "ALTO";
                const pctOk  = (t.masterPctSmoothed ?? t.masterPctRaw ?? t.masterPct ?? 0) >= 90;
                const mcOk   = t.market_cap == null || t.market_cap >= MC_MIN_BUY;
                return pioOk && refiOk && pctOk && mcOk;
              });

              // Senales de ALERTA DE VENTA - solo radarTracked
              const sellAlerts = radarScores.filter(t => {
                if (!radarTracked.has(t.symbol)) return false;
                const pioRoto  = t._piotroski != null && t._piotroski <= 3;
                const refiRoto = t._refi_risk?.label === "ALTO";
                return pioRoto || refiRoto;
              });

              const hasSignals = buySignals.length > 0 || sellAlerts.length > 0;

              // Contexto macro para el header de la consola
              const grainIs   = marketContext?.grainIs ?? null;
              const quadLabel = marketContext?.quadrantLabel ?? marketContext?.quadrant ?? "-";
              const grainBadge = grainIs != null
                ? grainIs >= 1.5
                  ? { label: `Agflation Critico ${grainIs.toFixed(2)}sigma`, color: "var(--red)" }
                  : grainIs >= 0.8
                    ? { label: `Agflation Risk ${grainIs.toFixed(2)}sigma`, color: "var(--amber)" }
                    : { label: `Grain IS ${grainIs.toFixed(2)}sigma`, color: "var(--muted)" }
                : null;

              return (
                <div style={{background:"var(--bg2)",border:"1px solid rgba(59,158,255,0.3)",borderRadius:"6px",padding:"12px 14px",marginBottom:"12px"}}>
                  {/* Header consola */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                    <span style={{fontSize:"10px",fontWeight:700,color:"var(--blue)",letterSpacing:"0.08em"}}>
                      CONSOLA DE EJECUCION
                    </span>
                    <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                      <span style={{fontSize:"9px",color:"var(--muted)"}}>{quadLabel}</span>
                      {grainBadge && (
                        <span style={{fontSize:"8px",color:grainBadge.color,fontWeight:600}}>
                          {grainBadge.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {!hasSignals ? (
                    <div style={{fontSize:"10px",color:"var(--muted)",fontStyle:"italic"}}>
                      Sin disparadores activos. Monitorear sin accion.
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                      {/* COMPRAS TACTICAS */}
                      {buySignals.map(t => (
                        <div key={"buy-"+t.symbol} style={{display:"flex",alignItems:"center",gap:"8px",background:"rgba(0,217,100,0.07)",border:"1px solid rgba(0,217,100,0.3)",borderRadius:"4px",padding:"5px 9px"}}>
                          <span style={{fontSize:"9px",fontWeight:700,color:"var(--green)",letterSpacing:"0.06em",minWidth:"100px"}}>
                            ▲ COMPRA TACTICA
                          </span>
                          <span style={{fontSize:"11px",fontWeight:700,color:"var(--amber)",minWidth:"44px"}}>{t.symbol}</span>
                          <span style={{fontSize:"9px",color:"var(--muted)"}}>
                            Piotroski {t._piotroski}/9
                            {" · "}MasterPct {(t.masterPct ?? 0).toFixed(1)}%ile
                            {" · "}REFI {t._refi_risk?.label ?? "-"}
                            {grainIs != null && grainIs >= 0.8 && ` · Grain IS ${grainIs.toFixed(2)}sigma`}
                          </span>
                        </div>
                      ))}

                      {/* ALERTAS DE VENTA */}
                      {sellAlerts.map(t => {
                        const pioRoto  = t._piotroski != null && t._piotroski <= 3;
                        const refiRoto = t._refi_risk?.label === "ALTO";
                        const motivo   = [
                          pioRoto  && `Piotroski ${t._piotroski}/9 (deterioro contable)`,
                          refiRoto && "Riesgo refinanciacion ALTO",
                        ].filter(Boolean).join(" · ");
                        return (
                          <div key={"sell-"+t.symbol} style={{display:"flex",alignItems:"center",gap:"8px",background:"rgba(255,59,92,0.07)",border:"1px solid rgba(255,59,92,0.3)",borderRadius:"4px",padding:"5px 9px"}}>
                            <span style={{fontSize:"9px",fontWeight:700,color:"var(--red)",letterSpacing:"0.06em",minWidth:"100px"}}>
                              ▼ ALERTA VENTA
                            </span>
                            <span style={{fontSize:"11px",fontWeight:700,color:"var(--amber)",minWidth:"44px"}}>{t.symbol}</span>
                            <span style={{fontSize:"9px",color:"var(--muted)"}}>
                              {motivo} - en seguimiento activo
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* == Panel Master Score Top 5 == */}
            {(()=>{
              // -- Position Sizing Dinamico ---------------------------------
              // Ajuste Macro (Regime-Conditional Sizing)
              const quadrant = marketContext?.quadrant;
              const killSwitch = (() => {
                const moveTkPS = tickers.find(t => t.symbol === "^MOVE");
                const vixTkPS  = tickers.find(t => t.symbol === "^VIX");
                const moveZ    = cycleIndicators?.macroSensors?.move?.z_score ?? null;
                return (moveTkPS?.last_price > 120) || (moveZ != null && moveZ > 2.5) || (vixTkPS?.last_price > 35);
              })();
              const macroMult = killSwitch ? 0.0
                : (quadrant === "recesion" || quadrant === "estanflacion") ? 0.7
                : 1.0;
              const capitalAjustado = masterCapital * macroMult;


              const weights      = masterScores.weightsCapped ?? {};  // Waterfall inverse-vol weights (post MRC cap)
              const riskCappedMap = masterScores.riskCapped ?? {};

              return (
                <div style={{background:"var(--bg2)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"6px",padding:"12px 14px",marginBottom:"14px"}}>
                  {/* Header con input de capital */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px",gap:"12px",flexWrap:"wrap"}}>
                    <div>
                      <span style={{fontSize:"10px",fontWeight:700,color:"var(--amber)",letterSpacing:"0.07em"}}>MASTER SCORE TOP 5</span>
                      <span style={{fontSize:"9px",color:"var(--muted)",marginLeft:"8px"}}>Score = (ROC₂₁d + RS₂₁d) / 2 ÷ sigma₂₁d · max 2 por sector · ROC₂₁d &gt; 0</span>
                    </div>
                    <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                      {masterScores.spyROC21 != null && (
                        <span style={{fontSize:"9px",color:"var(--muted)"}}>SPY ROC₂₁d: {masterScores.spyROC21 >= 0 ? "+" : ""}{masterScores.spyROC21.toFixed(1)}%</span>
                      )}
                      <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                        <span style={{fontSize:"9px",color:"var(--muted)"}}>Capital base USD</span>
                        <input
                          type="number" min="0" step="1000"
                          value={masterCapital || ""}
                          onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n) && n >= 0) setMasterCapital(n); }}
                          onBlur={e => window.storage.set("master:capital", e.target.value, true).catch(()=>{})}
                          style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"3px 7px",fontSize:"10px",width:"80px",fontFamily:"inherit"}}
                        />
                      </div>

                    </div>
                  </div>

                  {/* == Retention Buffer - Cartera actual del usuario == */}
                  {(()=>{
                    // Solo mostrar activos del Top 10 del Master Score como candidatos
                    // El usuario marca cuales tiene comprados -> reciben inmunidad Top 10
                    const candidates = masterScores.top5.length > 0 || currentHoldings.size > 0;
                    if (!candidates && masterScores.survivorCount === 0) return null;
                    // Lista Top 10 del scored - necesitamos acceder via masterScores
                    // Mostramos los activos del Top 5 actual + los marcados como holdings
                    const allRelevant = [
                      ...masterScores.top5.map(t => t.symbol),
                      ...[...currentHoldings].filter(s => !masterScores.top5.find(t => t.symbol === s))
                    ];
                    if (allRelevant.length === 0) return null;
                    return (
                      <div style={{marginBottom:"10px",padding:"8px 10px",background:"var(--bg3)",borderRadius:"4px",border:"1px solid var(--border)"}}>
                        <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.07em",marginBottom:"6px"}}>
                          RETENTION BUFFER - Marca los activos que tenes comprados (reciben inmunidad Top 10)
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                          {allRelevant.map(sym => {
                            const held    = currentHoldings.has(sym);
                            const inTop5  = masterScores.top5.find(t => t.symbol === sym);
                            const retained = inTop5?.retained;
                            return (
                              <button
                                key={sym}
                                onClick={() => toggleHolding(sym)}
                                style={{
                                  background: held ? "rgba(0,217,100,0.15)" : "var(--bg2)",
                                  border: `1px solid ${held ? "rgba(0,217,100,0.5)" : "var(--border2)"}`,
                                  color: held ? "var(--green)" : "var(--muted)",
                                  borderRadius:"4px", padding:"3px 8px", fontSize:"9px",
                                  fontWeight: held ? 700 : 400, fontFamily:"inherit",
                                  cursor:"pointer", display:"flex", alignItems:"center", gap:"4px"
                                }}
                              >
                                {held ? "OK" : "○"} {sym}
                                {retained && <span style={{fontSize:"8px",color:"var(--amber)",fontWeight:700}}>INMUNE</span>}
                              </button>
                            );
                          })}
                        </div>
                        {currentHoldings.size > 0 && (
                          <div style={{fontSize:"8px",color:"var(--muted)",marginTop:"5px"}}>
                            {currentHoldings.size} activo{currentHoldings.size > 1 ? "s" : ""} en cartera.
                            Incumbentes dentro del Top 10 mantienen su posicion aunque caigan fuera del Top 5.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Banner Kill-Switch */}
                  {killSwitch && (
                    <div style={{background:"rgba(255,59,92,0.15)",border:"1px solid rgba(255,59,92,0.5)",borderRadius:"4px",padding:"7px 12px",marginBottom:"8px",fontSize:"10px",fontWeight:700,color:"var(--red)",letterSpacing:"0.06em"}}>
                      ! KILL-SWITCH ACTIVO - MOVE/VIX en zona de panico. Multiplicador macro = 0%. Capital asignado -> CASH.
                    </div>
                  )}
                  {/* Indicador de regimen macro */}
                  {!killSwitch && (
                    <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"8px",fontSize:"9px",color:"var(--muted)"}}>
                      <span>Regimen: <span style={{color: macroMult < 1 ? "var(--amber)" : "var(--green)",fontWeight:700}}>{quadrant ? quadrant.toUpperCase() : "sin datos"}</span></span>
                      <span>Multiplicador macro: <span style={{fontWeight:700,color: macroMult < 1 ? "var(--amber)" : "var(--green)"}}>{(macroMult*100).toFixed(0)}%</span></span>
                      <span>Capital ajustado: <span style={{fontWeight:700,color:"var(--text)"}}>USD {capitalAjustado.toFixed(0)}</span></span>
                    </div>
                  )}

                  {/* Lista Top 5 */}
                  <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                    {masterScores.top5.length === 0 && (
                      <div style={{fontSize:"10px",color:"var(--muted)",padding:"8px 0"}}>Sin activos con ROC₂₁d &gt; 0. Todos los cupos -> CASH.</div>
                    )}
                    {masterScores.top5.map((t, i) => {
                      const w    = weights[t.symbol] ?? 0;
                      const usd  = capitalAjustado * w;
                      // Modulo de Rebalanceo
                      const tenencia    = parseFloat(tenenciaActual[t.symbol]) || 0;
                      const desvio      = usd > 0 && tenencia > 0 ? Math.abs(tenencia / usd - 1) : null;
                      const diff        = usd > 0 ? usd - tenencia : 0;
                      const needsAction = desvio != null && desvio > 0.20;
                      const dismissed   = rebalanceDismissed[t.symbol] === usd.toFixed(2);
                      const showAlert   = needsAction && !dismissed;
                      return (
                        <div key={t.symbol} style={{display:"flex",flexDirection:"column",background:showAlert ? "rgba(255,59,92,0.06)" : "var(--bg3)",border:showAlert ? "1px solid rgba(255,59,92,0.4)" : "1px solid transparent",borderRadius:"4px",padding:"6px 10px",transition:"border 0.2s"}}>
                          <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                            <span style={{fontSize:"10px",color:"var(--muted)",fontWeight:600,minWidth:"16px"}}>#{i+1}</span>
                            <span style={{color:"var(--amber)",fontWeight:700,fontSize:"11px",minWidth:"52px",cursor:"pointer"}} onClick={()=>openNews(t.symbol)}>{t.symbol}</span>
                            {/* Alerta PEAD: earnings proximos en <=5 dias */}
                            {t.earnings_info?.days_to_next_earnings != null
                              && t.earnings_info.days_to_next_earnings <= 5
                              && t.earnings_info.days_to_next_earnings >= 0
                              && (
                              <span title={`! Balance en ${t.earnings_info.days_to_next_earnings} dias (${t.earnings_info.next_expected_date}). Riesgo binario.`}
                                style={{fontSize:"11px",cursor:"help",lineHeight:1}}>📅</span>
                            )}
                            <span style={{fontSize:"9px",color:"var(--muted)",minWidth:"80px"}}>{t.sector}</span>
                            {/* Chips de tesis del Radar - propagados desde el escudo fundamental */}
                            {t.factors && t.factors.slice(0,3).map((f,fi) => (
                              <span key={fi} style={{fontSize:"8px",color:"var(--muted)",background:"var(--bg2)",padding:"1px 5px",borderRadius:"2px",border:"1px solid var(--border)"}}>{f}</span>
                            ))}
                            {t.radarScore != null && (
                              <span style={{fontSize:"9px",color:"var(--muted)"}} title="Score fundamental del Radar">R:{t.radarScore}</span>
                            )}
                            <span style={{fontSize:"10px",color:t.roc21 >= 0 ? "var(--green)" : "var(--red)",minWidth:"55px"}}>ROC {t.roc21 >= 0 ? "+" : ""}{t.roc21.toFixed(1)}%</span>
                            <span style={{fontSize:"10px",color:t.rs21 >= 0 ? "var(--green)" : "var(--amber)",minWidth:"52px"}}>RS {t.rs21 >= 0 ? "+" : ""}{t.rs21.toFixed(1)}%</span>
                            <span style={{fontSize:"9px",color:"var(--muted)",minWidth:"48px"}} title={"Volatilidad 21d: " + t.vol21.toFixed(2) + "% sigma diaria"}>sigma {t.vol21.toFixed(2)}%</span>
                            <span title={"Raw ratio: " + t.master.toFixed(4) + " | Pre-penalty pct: " + (t.masterPctRaw ?? "-") + " | Penalty: " + (t.penaltyApplied ?? "-")} style={{fontSize:"11px",fontWeight:700,color:(t.masterPct ?? 0) >= 70 ? "var(--green)" : (t.masterPct ?? 0) >= 40 ? "var(--amber)" : "var(--red)",cursor:"help"}}>* {(t.masterPct != null ? t.masterPct.toFixed(1) : t.master.toFixed(2))}<span style={{fontSize:"8px",color:"var(--muted)",marginLeft:"2px",fontWeight:400}}>%ile</span></span>
                            {riskCappedMap[t.symbol] && (
                              <span style={{fontSize:"8px",fontWeight:700,color:"var(--muted)",background:riskCappedMap[t.symbol] === 'HARD CAP 30%' ? "rgba(245,158,11,0.15)" : "rgba(255,59,92,0.1)",border:`1px solid ${riskCappedMap[t.symbol] === 'HARD CAP 30%' ? "rgba(245,158,11,0.4)" : "rgba(255,59,92,0.3)"}`,padding:"1px 5px",borderRadius:"2px",letterSpacing:"0.04em",color:riskCappedMap[t.symbol] === 'HARD CAP 30%' ? "var(--amber)" : "var(--red)"}} title={riskCappedMap[t.symbol] === 'HARD CAP 30%' ? "Peso reducido por Hard Cap de concentracion (30%)" : "Peso reducido por Marginal Risk Contribution Cap (28%)"}>{riskCappedMap[t.symbol]}</span>
                            )}

                            <div style={{marginLeft:"auto",display:"flex",gap:"6px",alignItems:"center"}}>
                              <span style={{fontSize:"10px",fontWeight:700,color:killSwitch?"var(--red)":"var(--blue)"}}>{killSwitch ? "0%" : (w*100).toFixed(1)+"%"}</span>
                              <span style={{fontSize:"10px",fontWeight:700,color:killSwitch?"var(--red)":"var(--text)"}}>USD {killSwitch ? "-" : usd.toFixed(0)}</span>
                            </div>
                          </div>

                          {/* Input tenencia + semaforo */}
                          <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"5px",paddingLeft:"26px",flexWrap:"wrap"}}>
                            <span style={{fontSize:"9px",color:"var(--muted)"}}>Tenencia actual USD</span>
                            <input
                              type="number" min="0" step="100"
                              value={tenenciaActual[t.symbol] ?? ""}
                              placeholder="0"
                              onChange={e => setTenenciaActual(prev => ({...prev, [t.symbol]: e.target.value}))}
                              style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"2px 6px",fontSize:"10px",width:"70px",fontFamily:"inherit"}}
                            />
                            {/* Semaforo */}
                            {tenencia > 0 && desvio != null && (
                              !needsAction || dismissed ? (
                                <span style={{fontSize:"9px",color:"var(--green)",display:"flex",alignItems:"center",gap:"3px"}}>
                                  <span style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--green)",display:"inline-block"}}/>
                                  En Rango {dismissed && <span style={{color:"var(--muted)"}}>(ejecutado)</span>}
                                </span>
                              ) : (
                                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                                  <span style={{fontSize:"9px",fontWeight:700,color:diff > 0 ? "var(--green)" : "var(--red)",background:diff > 0 ? "rgba(0,217,100,0.15)" : "rgba(255,59,92,0.15)",padding:"2px 7px",borderRadius:"3px",letterSpacing:"0.04em"}}>
                                    REBALANCEO: {diff > 0 ? "COMPRAR" : "VENDER"} USD {Math.abs(diff).toFixed(0)}
                                  </span>
                                  <span style={{fontSize:"9px",color:"var(--muted)"}}>({(desvio*100).toFixed(0)}% desvio)</span>
                                  <button
                                    onClick={() => setRebalanceDismissed(prev => ({...prev, [t.symbol]: usd.toFixed(2)}))}
                                    title="Marcar como ejecutado - se reactiva si el target cambia"
                                    style={{background:"rgba(0,217,100,0.15)",border:"1px solid rgba(0,217,100,0.4)",color:"var(--green)",borderRadius:"3px",padding:"1px 7px",fontSize:"10px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}
                                  >OK</button>
                                </div>
                              )
                            )}
                          </div>

                          {PROXY_MAP[t.symbol] && (
                            <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"3px",paddingLeft:"26px"}}>
                              ↳ Proxies operables: <span style={{color:"var(--blue)"}}>{PROXY_MAP[t.symbol]}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {[...Array(masterScores.cashSlots)].map((_,i) => (
                      <div key={"cash-"+i} style={{display:"flex",alignItems:"center",gap:"10px",background:"rgba(59,158,255,0.06)",border:"1px dashed rgba(59,158,255,0.2)",borderRadius:"4px",padding:"6px 10px"}}>
                        <span style={{fontSize:"10px",color:"var(--muted)",minWidth:"16px"}}>#{masterScores.top5.length+i+1}</span>
                        <span style={{color:"var(--blue)",fontWeight:700,fontSize:"11px"}}>CASH</span>
                        <span style={{fontSize:"9px",color:"var(--muted)"}}>Sin activos sobrevivientes</span>
                        <span style={{marginLeft:"auto",fontSize:"10px",fontWeight:700,color:"var(--blue)"}}>20% · USD {(capitalAjustado * 0.2).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  {/* Bloque CASH/RISK OFF generado por el Waterfall cuando todos los activos estan bloqueados */}
                  {masterScores.cashWeight > 0.001 && (
                    <div style={{display:"flex",alignItems:"center",gap:"10px",background:"rgba(59,158,255,0.08)",border:"1px solid rgba(59,158,255,0.35)",borderRadius:"4px",padding:"8px 10px",marginTop:"4px"}}>
                      <span style={{fontSize:"10px",fontWeight:700,color:"var(--blue)",letterSpacing:"0.05em"}}>LIQUIDEZ (CASH) / RISK OFF</span>
                      <span style={{fontSize:"9px",color:"var(--muted)",flex:1}}>El mercado no ofrece espacio de riesgo sano para el capital restante. Todos los activos alcanzaron sus limites de riesgo marginal.</span>
                      <div style={{display:"flex",gap:"6px",alignItems:"center",flexShrink:0}}>
                        <span style={{fontSize:"10px",fontWeight:700,color:"var(--blue)"}}>{(masterScores.cashWeight*100).toFixed(1)}%</span>
                        <span style={{fontSize:"10px",fontWeight:700,color:"var(--text)"}}>USD {(capitalAjustado * masterScores.cashWeight).toFixed(0)}</span>
                      </div>
                    </div>
                  )}
                  {/* == TOP 6-10: Retadores & Zona de Descenso == */}
                  {masterScores.top6to10?.length > 0 && (
                    <div style={{marginTop:"10px",borderTop:"1px solid var(--border)",paddingTop:"8px"}}>
                      <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.07em",marginBottom:"6px"}}>
                        RADAR TOP 6-10 - Retadores &amp; Zona de Descenso
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                        {masterScores.top6to10.map((t, i) => {
                          const isIncumbent = currentHoldings.has(t.symbol);
                          return (
                            <div key={t.symbol} style={{display:"flex",alignItems:"center",gap:"8px",padding:"4px 8px",background:isIncumbent ? "rgba(245,158,11,0.08)" : "var(--bg3)",borderRadius:"3px",border:isIncumbent ? "1px solid rgba(245,158,11,0.25)" : "1px solid transparent"}}>
                              <span style={{fontSize:"9px",color:"var(--muted)",minWidth:"20px"}}>#{i+6}</span>
                              <span style={{fontSize:"10px",fontWeight:700,color:isIncumbent ? "var(--amber)" : "var(--muted)",minWidth:"52px",cursor:"pointer"}} onClick={()=>openNews(t.symbol)}>{t.symbol}</span>
                              {t.earnings_info?.days_to_next_earnings != null
                                && t.earnings_info.days_to_next_earnings <= 5
                                && t.earnings_info.days_to_next_earnings >= 0
                                && <span title={`! Balance en ${t.earnings_info.days_to_next_earnings} dias`} style={{fontSize:"10px",cursor:"help"}}>📅</span>}
                              <span style={{fontSize:"9px",color:"var(--muted)",flex:1}}>{t.sector}</span>
                              {isIncumbent && <span style={{fontSize:"8px",color:"var(--amber)",fontWeight:700,letterSpacing:"0.04em"}}>EN DESCENSO</span>}
                              <span title={"Raw: " + t.master.toFixed(4) + " | Pre-penalty: " + (t.masterPctRaw ?? "-")} style={{fontSize:"10px",fontWeight:600,color:"var(--muted)",cursor:"help"}}>* {(t.masterPct != null ? t.masterPct.toFixed(1) : t.master.toFixed(2))}%ile</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{fontSize:"8px",color:"var(--muted)",marginTop:"5px"}}>
                        Los incumbentes en esta zona pierden su inmunidad en la proxima actualizacion si caen por debajo del #10.
                      </div>
                    </div>
                  )}
                    <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"8px",borderTop:"1px solid var(--border)",paddingTop:"6px"}}>
                      {masterScores.survivorCount} activos pasaron la Guillotina Fundamental (Radar OK + ROC₂₁d &gt; 0) de {masterScores.radarUniverseSize ?? "?"} aprobados por el Radar.{masterScores.cashSlots > 0 ? ` ${masterScores.cashSlots} cupo${masterScores.cashSlots > 1 ? "s" : ""} a Cash.` : " Portfolio completo."}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* == EXPOSICION OBJETIVO - Volatility Targeting == */}
            {(()=>{
              const TARGET_VOL_ANUAL = 0.15;
              // VIX: buscar en tickers cargados
              const vixTk  = tickers.find(t => t.symbol === "^VIX");
              const vixVal = vixTk?.last_price ?? vixTk?.change_pct != null ? null : null;
              const vixNum = parseFloat(
                vixTk?.last_price ?? cycleIndicators?.macroSensors?.vix?.value ?? 20
              );
              // Probabilidades del termometro
              const probs = cycleIndicators?.probabilities ?? {};
              const pExp  = (probs.expansion      ?? 0) / 100;
              const pRec  = (probs.recuperacion   ?? 0) / 100;
              const pDes  = (probs.desaceleracion ?? 0) / 100;
              const pCon  = (probs.contraccion    ?? 0) / 100;
              // Calculo de exposicion
              const vixFactor = Math.min(Math.max(TARGET_VOL_ANUAL / (vixNum / 100), 0.25), 1.0);
              const modulator = pExp * 1.0 + pRec * 1.0 + pDes * 0.0 - pCon * 1.0;
              const cuadrante = marketContext?.quadrant ?? "";
              const pisoDinamico = cuadrante === "RECESION_DEFLACIONARIA" ? 0.00 : 0.25;
              const expObj = Math.min(Math.max(vixFactor * (1.0 + modulator), pisoDinamico), 1.0);
              const pct    = Math.round(expObj * 100);
              const capEq  = Math.round(capitalBase * expObj);
              const capCash = capitalBase - capEq;
              // Color de la barra
              const barColor = pct >= 75 ? "rgba(52,211,153,0.85)"
                             : pct >= 50 ? "rgba(99,102,241,0.85)"
                             : pct >= 30 ? "rgba(245,158,11,0.85)"
                             : "rgba(239,68,68,0.80)";
              const alerta = vixNum > 30 || pCon > 0.60;
              return (
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px",marginBottom:"8px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                    <div style={{fontSize:"10px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.07em"}}>EXPOSICION OBJETIVO</div>
                    <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                      <span style={{fontSize:"9px",color:"var(--muted)"}}>Capital USD</span>
                      <input type="number" value={capitalBase}
                        onChange={e => setCapitalBase(Math.max(0, parseInt(e.target.value)||0))}
                        style={{width:"80px",fontSize:"10px",padding:"2px 5px",background:"var(--bg)",
                          border:"1px solid var(--border)",color:"var(--text)",borderRadius:"3px",
                          fontFamily:"inherit",textAlign:"right"}} />
                    </div>
                  </div>

                  {/* Barra visual */}
                  <div style={{position:"relative",height:"20px",background:"rgba(255,255,255,0.06)",borderRadius:"4px",overflow:"hidden",marginBottom:"10px"}}>
                    <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${pct}%`,
                      background:barColor,borderRadius:"4px",transition:"width 0.4s ease"}} />
                    <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",
                      fontSize:"10px",fontWeight:700,color:"#fff",pointerEvents:"none",
                      textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>
                      {pct}% en equities
                    </div>
                  </div>

                  {/* Distribucion de capital */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"10px"}}>
                    {[
                      ["A equities", `USD ${capEq.toLocaleString()}`, barColor],
                      ["En cash/cobertura", `USD ${capCash.toLocaleString()}`, "rgba(148,163,184,0.8)"],
                    ].map(([label, val, col]) => (
                      <div key={label} style={{background:"var(--bg)",borderRadius:"4px",padding:"6px 8px",borderLeft:`3px solid ${col}`}}>
                        <div style={{fontSize:"9px",color:"var(--muted)"}}>{label}</div>
                        <div style={{fontSize:"11px",fontWeight:700,color:"var(--text)"}}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Factores */}
                  <div style={{display:"flex",flexDirection:"column",gap:"3px",fontSize:"9px",color:"var(--muted)"}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span>Factor vol VIX ({vixNum.toFixed(1)})</span>
                      <span style={{color:"var(--text)",fontWeight:600}}>{vixFactor.toFixed(2)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span>Modulador macro (Exp {Math.round(pExp*100)}% / Con {Math.round(pCon*100)}%)</span>
                      <span style={{color: modulator >= 0 ? "rgba(52,211,153,0.9)" : "rgba(239,68,68,0.9)",fontWeight:600}}>
                        {modulator >= 0 ? "+" : ""}{modulator.toFixed(2)}
                      </span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span>Piso dinamico</span>
                      <span style={{color:"var(--text)",fontWeight:600}}>
                        {Math.round(pisoDinamico*100)}% ({cuadrante || "sin cuadrante"})
                      </span>
                    </div>
                  </div>

                  {/* Alerta */}
                  {alerta && (
                    <div style={{marginTop:"8px",padding:"6px 8px",background:"rgba(239,68,68,0.08)",
                      border:"1px solid rgba(239,68,68,0.3)",borderRadius:"4px",
                      fontSize:"9px",color:"rgba(239,68,68,0.9)",lineHeight:1.5}}>
                      ! {vixNum > 30 ? `VIX > 30 (${vixNum.toFixed(1)}) - reducir exposicion` : ""}
                      {vixNum > 30 && pCon > 0.60 ? " · " : ""}
                      {pCon > 0.60 ? `Contraccion ${Math.round(pCon*100)}% - considerar cobertura` : ""}
                    </div>
                  )}
                  <div style={{marginTop:"6px",fontSize:"8px",color:"rgba(100,116,139,0.6)",lineHeight:1.4}}>
                    ⓘ Sugerencia operativa para el rebalance mensual. No ejecucion automatica.
                  </div>
                </div>
              );
            })()}

            {/* Context detection */}
            {dates.length > 0 && curData && (
              <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--muted)",letterSpacing:"0.07em"}}>CONTEXTO ACTUAL DEL MERCADO</div>
                  {/* Banner de Cuarentena ROC 252d */}
                  {marketContext?.quarantine && (
                    <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:"6px",padding:"10px 14px",marginBottom:"12px"}}>
                      <div style={{fontSize:"10px",fontWeight:700,color:"var(--amber)",letterSpacing:"0.07em",marginBottom:"4px"}}>MOTOR ROC 252d - INSUFFICIENT DATA</div>
                      <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:1.6}}>
                        Faltan ~{marketContext.daysNeeded} dias para calibracion macroeconomica (SPY: {marketContext.spyDays} dias, DBC: {marketContext.dbcDays} dias, necesario: >=252 de cada uno).
                      </div>
                      <div style={{fontSize:"9px",color:"var(--amber)",marginTop:"4px"}}>Importa el historial en CARGAR -> Motor ROC 252d para activar los Cuatro Cuadrantes de Dalio.</div>
                    </div>
                  )}
                  {marketContext && !marketContext.quarantine && marketContext.quadrant && (
                    <div style={{background:"rgba(59,158,255,0.06)",border:"1px solid rgba(59,158,255,0.25)",borderRadius:"4px",padding:"6px 10px",marginBottom:"8px",fontSize:"9px",color:"var(--muted)"}}>
                      <span style={{color:"var(--blue)",fontWeight:700}}>ROC 252d - {(marketContext.quadrant||"").toUpperCase()}</span>
                      {" "}{marketContext.isConfirmed ? <span style={{color:"var(--green)"}}>OK CONFIRMADO ({marketContext.persistCount}d)</span> : <span style={{color:"var(--amber)"}}>en transicion ({marketContext.persistCount}/{15}d)</span>}
                      {" · "}SPY {marketContext.spROC != null ? (marketContext.spROC >= 0 ? "+" : "") + marketContext.spROC.toFixed(1) + "%" : "-"}
                      {" · "}DBC {marketContext.commROC != null ? (marketContext.commROC >= 0 ? "+" : "") + marketContext.commROC.toFixed(1) + "%" : "-"}
                    </div>
                  )}
                    <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                      <span style={{fontSize:"10px",color:"var(--muted)"}}>Sugerida (conf. {marketContext.confidence}):</span>
                      <button onClick={()=>setRadarThesis(marketContext.recommended)} style={{background:"rgba(245,158,11,0.15)",color:"var(--amber)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"3px",padding:"3px 10px",fontWeight:700,fontFamily:"inherit",fontSize:"10px",cursor:"pointer"}}>
                        {THESIS_CONFIG[marketContext.recommended]?.label} ->
                      </button>
                    </div>
                  )}
                </div>
                {marketContext.regimeSignals.length > 0 && (
                  <div style={{marginBottom:"8px"}}>
                    <div style={{fontSize:"9px",fontWeight:700,color:"var(--amber)",letterSpacing:"0.07em",marginBottom:"4px"}}>REGIMEN ESTRUCTURAL (252 dias)</div>
                    {marketContext.regimeSignals.map((s,i)=><div key={i} style={{fontSize:"10px",color:"var(--text)",display:"flex",gap:"8px",marginBottom:"2px"}}><span style={{color:"var(--amber)",flexShrink:0}}>-</span><span>{s}</span></div>)}
                  </div>
                )}
                {marketContext.dailySignals.length > 0 && (
                  <div>
                    <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.07em",marginBottom:"4px"}}>SEÑAL DEL DIA</div>
                    {marketContext.dailySignals.map((s,i)=><div key={i} style={{fontSize:"10px",color:"var(--muted)",display:"flex",gap:"8px",marginBottom:"2px"}}><span style={{flexShrink:0}}>-</span><span>{s}</span></div>)}
                  </div>
                )}
                {/* == Auditoria Macro Fundamental (FRED) - Telemetria Dual == */}
                {fredRegime && (()=>{
                  const div = calcMacroDivergenceMultiplier(marketContext?.quadrant, fredRegime, marketContext?.grainIs ?? null, null, marketContext?.spROC ?? null, curData?.market?.spxQDiv ?? 0.08, curData?.market?.spxRoc63d ?? null);
                  const flagColor = div.flag === "ALINEACION" ? "var(--green)"
                    : div.flag === "DIVERGENCIA TOXICA" ? "var(--red)" : "var(--amber)";
                  const flagBg = div.flag === "ALINEACION" ? "rgba(0,217,100,0.1)"
                    : div.flag === "DIVERGENCIA TOXICA" ? "rgba(255,59,92,0.1)" : "rgba(245,158,11,0.1)";
                  const probs = [
                    { label: "Crecimiento",   val: fredRegime.prob_crecimiento   ?? 0 },
                    { label: "Estanflacion",  val: fredRegime.prob_estanflacion  ?? 0 },
                    { label: "Defensivo",     val: fredRegime.prob_defensivo     ?? 0 },
                    { label: "Valor",         val: fredRegime.prob_valor         ?? 0 },
                  ].sort((a,b) => b.val - a.val);
                  return (
                    <div style={{marginTop:"10px",borderTop:"1px solid var(--border)",paddingTop:"8px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",flexWrap:"wrap",gap:"6px"}}>
                        <div style={{fontSize:"9px",fontWeight:700,color:"var(--blue)",letterSpacing:"0.07em"}}>AUDITORIA MACRO FUNDAMENTAL (FRED)</div>
                        <div style={{fontSize:"9px",color:"var(--muted)"}}>{fredRegime.timestamp}</div>
                      </div>
                      <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"8px",flexWrap:"wrap"}}>
                        <span style={{fontSize:"10px",color:"var(--muted)"}}>Cuadrante FRED:</span>
                        <span style={{fontSize:"10px",fontWeight:700,color:"var(--blue)"}}>{(fredRegime.cuadrante||"").toUpperCase()}</span>
                        <span style={{fontSize:"9px",color:"var(--muted)",marginLeft:"4px"}}>vs ROC 252d: {(marketContext?.quadrant||"-").toUpperCase()}</span>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:"4px",marginBottom:"8px"}}>
                        {probs.map(p => (
                          <div key={p.label} style={{display:"flex",alignItems:"center",gap:"8px"}}>
                            <span style={{fontSize:"9px",color:"var(--muted)",minWidth:"72px"}}>{p.label}</span>
                            <div style={{flex:1,height:"5px",background:"var(--bg3)",borderRadius:"2px",overflow:"hidden"}}>
                              <div style={{width:Math.min(100,(p.val*100)).toFixed(1)+"%",height:"100%",background:"var(--blue)",borderRadius:"2px"}}/>
                            </div>
                            <span style={{fontSize:"9px",color:"var(--muted)",minWidth:"32px",textAlign:"right"}}>{(p.val*100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                      <div style={{background:flagBg,border:`1px solid ${flagColor}`,borderRadius:"4px",padding:"6px 10px"}}>
                        <div style={{fontSize:"9px",fontWeight:700,color:flagColor,letterSpacing:"0.06em",marginBottom:"2px"}}>
                          {div.flag === "ALINEACION" ? "OK " : div.flag === "DIVERGENCIA TOXICA" ? "! " : "~ "}{div.flag} - x{div.multiplier.toFixed(1)} sobre Master Score
                        </div>
                        <div style={{fontSize:"9px",color:flagColor,opacity:0.85,lineHeight:1.5}}>{div.detail}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Thesis selector */}
            <div style={{display:"flex",gap:"8px",marginBottom:"16px",flexWrap:"wrap"}}>
              {/* Boton hibrido primero */}
              {(() => {
                const isHybrid = radarThesis === "hibrido";
                const scores = marketContext?.scores ?? {};
                const total  = Object.values(scores).reduce((a,b) => a+b, 0);
                const spectrum = total > 0
                  ? Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (THESIS_CONFIG[k]?.label.split(' ')[0] || k) + " " + Math.round(v/total*100) + "%").join(" · ")
                  : "sin historial";
                return (
                  <button onClick={() => { setRadarThesis("hibrido"); setRadarAnalysis(""); }}
                    style={{background:isHybrid?"var(--blue)":"var(--bg2)",color:isHybrid?"#0a0b0f":"var(--muted)",border:"1px solid "+(isHybrid?"var(--blue)":"var(--border2)"),borderRadius:"4px",padding:"7px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:700,letterSpacing:"0.05em"}}
                    title={"Sesgo de tesis según el cuadrante macro activo (ROC 252d): " + spectrum}>
                    ◎ MACRO PONDERADO (AUTO)
                  </button>
                );
              })()}
              {Object.entries(THESIS_CONFIG).map(([key,cfg]) => (
                <button key={key} onClick={() => { setRadarThesis(key); setRadarAnalysis(""); }} style={{background:radarThesis===key?"var(--amber)":"var(--bg2)",color:radarThesis===key?"#0a0b0f":"var(--muted)",border:"1px solid "+(radarThesis===key?"var(--amber)":"var(--border2)"),borderRadius:"4px",padding:"7px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:700,letterSpacing:"0.05em"}}>
                  {cfg.label}
                </button>
              ))}
            </div>
            <div style={{color:"var(--muted)",fontSize:"10px",marginBottom:"14px",padding:"8px 12px",background:"var(--bg2)",borderRadius:"4px",border:"1px solid var(--border)"}}>
              {radarThesis === "hibrido" ? (() => {
                const scores = marketContext?.scores ?? {};
                const total  = Object.values(scores).reduce((a,b) => a+b, 0);
                if (total === 0) return "Sin historial suficiente para ponderar. Carga mas snapshots.";
                const sorted = Object.entries(scores).sort((a,b) => b[1]-a[1]);
                return "Sesgo de tesis por cuadrante macro (ROC 252d): " + (marketContext?.quadrantLabel || marketContext?.quadrant || "—").toUpperCase() + " — " + sorted.map(([k,v]) => (THESIS_CONFIG[k]?.label || k) + ": " + Math.round(v/total*100) + "%").join(" · ") + ". Es un sesgo determinístico por cuadrante, no una distribución de probabilidad; las tesis sin peso en el cuadrante activo no aparecen.";
              })() : THESIS_CONFIG[radarThesis]?.desc}
            </div>

            {dates.length===0 ? <div style={{color:"var(--muted)",fontSize:"11px",textAlign:"center",padding:"40px"}}>Carga datos primero.</div> : (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
                <div>
                  {/* Filtro por sector */}
                  {(() => {
                    const sectors = ["TODOS", ...new Set(radarScores.map(t => t._radar.sector))].sort((a,b) => a==="TODOS"?-1:b==="TODOS"?1:a.localeCompare(b));
                    return (
                      <div style={{marginBottom:"10px"}}>
                        <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.07em",marginBottom:"5px"}}>FILTRAR POR SECTOR</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                          {sectors.map(s=>(
                            <button key={s} onClick={()=>{ setRadarSectorFilter(s); setRadarSelected(new Set()); }} style={{background:radarSectorFilter===s?"var(--amber)":"var(--bg2)",color:radarSectorFilter===s?"#0a0b0f":"var(--muted)",border:"1px solid "+(radarSectorFilter===s?"var(--amber)":"var(--border2)"),borderRadius:"3px",padding:"3px 8px",fontSize:"9px",fontWeight:radarSectorFilter===s?700:400,fontFamily:"inherit",cursor:"pointer"}}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Instruccion de seleccion */}
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"6px"}}>
                    Selecciona los activos que queres enviar al analisis IA. <span style={{color:"var(--amber)"}}>{radarSelected.size} seleccionado{radarSelected.size!==1?"s":""}</span>
                    {radarSelected.size > 0 && <button onClick={()=>setRadarSelected(new Set())} style={{marginLeft:"8px",background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"9px",fontFamily:"inherit",textDecoration:"underline"}}>limpiar</button>}
                  </div>

                  {/* == Panel de Seguimiento Activo (Histeresis) == */}
                  {radarTracked.size > 0 && (()=>{
                    // Calcular position sizing para todos los activos en seguimiento
                    // Ordenar por score descendente (winner-takes-all usa el primero)
                    const trackedSymbols = [...radarTracked.entries()]
                      .sort((a,b) => {
                        const sa = radarScores.find(t=>t.symbol===a[0])?._radar?.score ?? a[1].score;
                        const sb = radarScores.find(t=>t.symbol===b[0])?._radar?.score ?? b[1].score;
                        return sb - sa;
                      })
                      .map(([sym]) => sym);
                    const vixZscore = cycleIndicators?.macroSensors?.vix?.z_score ?? null;
                    // Capital operativo: total cartera como proxy si no hay input explicito
                    const capProxy = (() => {
                      const posiciones = getPortfolioWithMarket();
                      const totalRV = posiciones.reduce((s,p)=>s+(p.valorPosicion??0),0);
                      return liquidezUSD > 0 ? liquidezUSD : (totalRV > 0 ? totalRV * 0.05 : null);
                    })();
                    const sizing = calcPositionSize(trackedSymbols, snapshots, vixZscore, capProxy);
                    const lt = vixZscore != null ? Math.max(0.2, 1 / (1 + Math.max(0, vixZscore))) : 1.0;
                    // Tail Lock: multiplicador 0.5 acumulado sobre L_t para activos con dependencia de cola
                    const tailLockActive = tailRiskData.active;                    return (
                    <div style={{background:"var(--bg2)",border:"1px solid rgba(59,158,255,0.35)",borderRadius:"6px",padding:"10px 14px",marginBottom:"14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                        <span style={{fontSize:"10px",fontWeight:700,color:"var(--blue)",letterSpacing:"0.07em"}}>SEGUIMIENTO ACTIVO ({radarTracked.size})</span>
                        <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                          <span style={{fontSize:"9px",color:lt < 0.5 ? "var(--red)" : lt < 0.8 ? "var(--amber)" : "var(--muted)"}}>
                            L_t = {lt.toFixed(2)} {vixZscore != null ? "(VIX Z=" + vixZscore.toFixed(1) + ")" : "(sin Z)"}
                          </span>
                          <button onClick={()=>saveRadarTracked(new Map())} style={{background:"none",border:"none",color:"var(--muted)",fontSize:"10px",cursor:"pointer",fontFamily:"inherit"}}>limpiar</button>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                      {[...radarTracked.entries()].map(([sym, entry]) => {
                          // -- Jerarquia de clasificacion (Opus 4.7) ----------------------------
                          const liveEntry = radarScores.find(t => t.symbol === sym);

                          // Tickers sin fundamentales evaluables -> SIN DATOS siempre
                          const isCryptoVeto = ["MSTR","RIOT","COIN","MARA"].includes(sym);
                          const isSinFund    = ["CL=F","ZC=F","ZS=F","GLD","SLV","COPX","URA","ITA",
                                                 "COME.BA","HAVA.BA","MORI.BA","BHIP.BA","SATL",
                                                 "OKLO","LAR","SMSN.IL"].includes(sym);
                          const isSinDatos   = isCryptoVeto || isSinFund;
                          const sinDatosMotivo = isCryptoVeto ? "CRYPTO VETO" : isSinFund ? "SIN FUNDAMENTALES" : null;

                          // Pasos 1-3: jerarquia de Opus 4.7 - funcion auxiliar definida fuera del componente
                          const _resolved = resolveTrackedScore(sym, liveEntry, isSinDatos,
                            twScore, sectorUniverse, snapshots, creditStress, radarThesis, cycleIndicators, dynamicScores);
                          const currentScore = _resolved.score;
                          const scoreTesis   = _resolved.tesis;
                          const guillotinaLog = _resolved.guillotinas;

                          const effectiveScore = currentScore ?? 0;
                          const tesisCnt       = guillotinaLog.length;
                          const isExit = !isSinDatos && effectiveScore < RADAR_HOLD_MIN;

                          const sz          = sizing[sym];
                          const posEntry    = getPortfolioWithMarket().find(p => p.ticker === sym);
                          const posValueUSD = posEntry?.valorPosicion ?? null;

                          const guillotinaStr = guillotinaLog.length > 0
                            ? " Guillotinado en " + guillotinaLog.length + "/4 tesis (" + guillotinaLog.slice(0,2).join(", ") + ")"
                            : "";

                          const decay = isSinDatos
                            ? { action:"HOLD", dT:1, trimPct:0, trimUSD:null, suppressed:false,
                                motivo:"SIN DATOS (" + sinDatosMotivo + "): No se puede evaluar. Decisi\u00f3n manual." }
                            : isExit
                            ? { action:"SELL", dT:0, trimPct:100, trimUSD:posValueUSD, suppressed:false,
                                motivo:"EXIT: Score " + effectiveScore + " < " + RADAR_HOLD_MIN + "." + guillotinaStr + " Vender posici\u00f3n completa." }
                            : calcDecaySignal(effectiveScore, RADAR_BUY_THRESHOLD, posValueUSD, null);

                          const isSell  = !isSinDatos && (decay.action === "SELL" || entry.sellImmediate);
                          const isTrim  = !isSinDatos && decay.action === "TRIM";
                          const isHold  = !isSell && !isTrim;
                          const hasTailRisk = tailLockActive && tailRiskData.tailSymbols.has(sym);
                          const tailMult    = hasTailRisk ? 0.5 : 1.0;
                          const statusColor = isSinDatos ? "var(--muted)" : isSell ? "var(--red)" : isTrim ? "var(--amber)" : "var(--green)";
                          const statusBg    = isSinDatos ? "rgba(100,116,139,0.08)" : isSell ? "rgba(255,59,92,0.1)" : isTrim ? "rgba(245,158,11,0.08)" : "rgba(0,217,100,0.05)";
                          const statusBdr   = isSinDatos ? "rgba(100,116,139,0.3)" : isSell ? "rgba(255,59,92,0.4)" : isTrim ? "rgba(245,158,11,0.3)" : "rgba(0,217,100,0.2)";
                          const statusLabel = isSinDatos ? "SIN DATOS" : isSell ? (isExit ? "EXIT" : "SELL") : isTrim ? "TRIM" : "HOLD";
                          return (
                              <div key={sym} style={{background:statusBg,border:"1px solid "+statusBdr,borderRadius:"5px",padding:"7px 10px",display:"flex",flexDirection:"column",gap:"4px"}}>
                                <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                                  <span style={{color:"var(--amber)",fontWeight:700,fontSize:"11px",cursor:"pointer"}} onClick={()=>openNews(sym)}>{sym}</span>
                                  <span style={{color:statusColor,fontSize:"9px",fontWeight:700,background:statusColor+"22",padding:"1px 6px",borderRadius:"2px",letterSpacing:"0.05em"}}>{statusLabel}</span>
                                  <span style={{color:"var(--muted)",fontSize:"9px"}}>score {currentScore}</span>
                                  {isTrim && !decay.suppressed && <span style={{fontSize:"9px",color:"var(--amber)"}}>d_t={decay.dT.toFixed(2)} -> -{decay.trimPct.toFixed(0)}%</span>}
                                  {isTrim && decay.suppressed && <span style={{fontSize:"9px",color:"var(--muted)"}}>trim suprimido &lt;$15</span>}
                                </div>
                                <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                                  {sz && !sz.holdForzado && !sz.descartado && sz.wFinal > 0 && (
                                    <div style={{textAlign:"right"}}>
                                      <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                                        {sz.winnerTakesAll && <span style={{fontSize:"8px",color:"var(--blue)",fontWeight:700}}>WTA</span>}
                                        {hasTailRisk && <span style={{fontSize:"8px",color:"var(--red)",fontWeight:700}}>TAILx0.5</span>}
                                        <div style={{fontSize:"10px",fontWeight:700,color:hasTailRisk?"var(--red)":statusColor}}>{(sz.wFinal * tailMult).toFixed(1)}%</div>
                                      </div>
                                      {sz.usdEstimado != null && sz.usdEstimado > 0 && <div style={{fontSize:"8px",color:"var(--muted)"}}>≈ USD {(sz.usdEstimado * tailMult).toFixed(0)}</div>}
                                    </div>
                                  )}
                                  {sz?.holdForzado && <span style={{fontSize:"9px",color:"var(--red)",fontWeight:700}}>HOLD FORZADO</span>}
                              {/* Boton EXIT: opera solo dentro del return JSX */}
                              {isExit && (
                                <button onClick={() => { const n=new Map(radarTracked); n.delete(sym); saveRadarTracked(n); }}
                                  style={{fontSize:"9px",padding:"2px 8px",marginTop:"4px",background:"rgba(255,59,92,0.15)",
                                    border:"1px solid rgba(255,59,92,0.4)",color:"var(--red)",borderRadius:"3px",
                                    cursor:"pointer",fontFamily:"inherit",fontWeight:700,display:"block"}}>
                                  Vendido - eliminar del tracking
                                </button>
                              )}
                              {/* Motivo del SELL o TRIM - solo si hay senal activa */}
                              {decay.motivo && (isSell || (isTrim && !decay.suppressed)) && (
                                <div style={{fontSize:"9px",color:statusColor,marginTop:"4px",lineHeight:1.5}}>{decay.motivo}</div>
                              )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {vixZscore != null && lt < 1.0 && (
                        <div style={{fontSize:"9px",color:"var(--amber)",marginTop:"8px",paddingTop:"6px",borderTop:"1px solid var(--border)"}}>
                          Reduccion macro activa: todos los pesos x {lt.toFixed(2)} por VIX Z-Score ({vixZscore.toFixed(2)}sigma).{lt <= 0.2 ? " PISO MINIMO ACTIVADO (20%)." : ""}
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                    <div style={{fontSize:"10px",fontWeight:600,color:"var(--muted)",letterSpacing:"0.07em"}}>CLASIFICACION</div>
                    <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                      {shadowRoster.suplentes.size > 0 && (
                        <span style={{fontSize:"9px",color:"var(--blue)"}}>◎ {shadowRoster.suplentes.size} en Shadow</span>
                      )}
                      <button onClick={() => setShowAllTickers(v => !v)}
                        style={{background:showAllTickers?"#f59e0b":"#2a3045",color:showAllTickers?"#000":"#8892a4",
                          border:"none",borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        {showAllTickers ? "Ver todos ✓" : "Ver todos"}
                      </button>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"12px"}}>
                    {(showAllTickers
                      // Modo "Ver todos": universo completo de twScore, incluyendo guillotinados
                      ? twScore
                          .filter(t => radarSectorFilter==="TODOS" || getSector(t.symbol)===radarSectorFilter)
                          .sort((a,b) => (radarScores.find(r=>r.symbol===b.symbol)?._radar?.score??0) - (radarScores.find(r=>r.symbol===a.symbol)?._radar?.score??0))
                          .map(t => {
                            const liveScore = radarScores.find(r=>r.symbol===t.symbol)?._radar?.score??null;
                            const isGuillotinado = liveScore == null;
                            return {...t, _radar: isGuillotinado
                              ? { score: null, sector: getSector(t.symbol), factors: [], _isGuillotinado: true }
                              : radarScores.find(r => r.symbol === t.symbol)?._radar ?? { score: liveScore, sector: getSector(t.symbol), factors: [] }
                            };
                          })
                      // Modo normal: solo titulares del shadowRoster
                      : shadowRoster.titulares
                          .filter(t => radarSectorFilter==="TODOS" || t._radar.sector===radarSectorFilter)
                          .slice(0,15)
                      ).map((t,i) => {
                        const isSelected   = radarSelected.has(t.symbol);
                        const trackedEntry = radarTracked.get(t.symbol);
                        const isGuillotinado = t._radar?._isGuillotinado === true;
                        const isBuy  = !isGuillotinado && t._radar.score >= RADAR_BUY_THRESHOLD;
                        const isHold = !isBuy && trackedEntry != null;
                        // Suplentes de este titular (para mostrar debajo)
                        const misSuplentes = [...shadowRoster.suplentes.entries()]
                          .filter(([,v]) => v.titular === t.symbol);
                        return (
                          <div key={t.symbol}>
                            <div
                              onClick={()=>{ const s=new Set(radarSelected); if(s.has(t.symbol)) s.delete(t.symbol); else s.add(t.symbol); setRadarSelected(s); }}
                              style={{background:isSelected?"rgba(245,158,11,0.08)":"var(--bg2)",border:"1px solid "+(isSelected?"rgba(245,158,11,0.5)":"var(--border)"),borderRadius:misSuplentes.length>0?"4px 4px 0 0":"4px",padding:"8px 12px",display:"flex",gap:"10px",alignItems:"flex-start",cursor:"pointer"}}>
                              <div style={{paddingTop:"1px",flexShrink:0}}>
                                <div style={{width:"14px",height:"14px",borderRadius:"2px",border:"1.5px solid "+(isSelected?"var(--amber)":"var(--muted)"),background:isSelected?"var(--amber)":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  {isSelected&&<span style={{color:"#0a0b0f",fontSize:"10px",fontWeight:900,lineHeight:1}}>OK</span>}
                                </div>
                              </div>
                              <div style={{minWidth:"22px",fontSize:"11px",color:"var(--muted)",fontWeight:600,paddingTop:"1px"}}>#{i+1}</div>
                              <div style={{flex:1}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}>
                                  <span style={{color:isGuillotinado?"rgba(148,163,184,0.5)":"var(--amber)",fontWeight:700,fontSize:"12px",cursor:"pointer",opacity:isGuillotinado?0.6:1}} onClick={e=>{e.stopPropagation();openNews(t.symbol);}}>{t.symbol}{t.earnings_info?.days_to_next_earnings != null && t.earnings_info.days_to_next_earnings <= 5 && t.earnings_info.days_to_next_earnings >= 0 && <span title={`! Balance en ${t.earnings_info.days_to_next_earnings}d (${t.earnings_info.next_expected_date})`} style={{fontSize:"10px",marginLeft:"3px"}}>📅</span>}</span>
                                  {isGuillotinado && <span title="No paso guillotinas en ninguna tesis" style={{fontSize:"9px",color:"rgba(148,163,184,0.5)",fontStyle:"italic",marginLeft:"4px"}}>guillotinado</span>}
                                  <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                                    <span style={{color:"var(--muted)",fontSize:"10px"}}>{t._radar.sector}</span>
                                    <span style={{color:pc(t.change_pct),fontSize:"10px"}}>{fmtPct(t.change_pct)}</span>
                                    {isBuy && <span style={{background:"rgba(0,217,100,0.2)",color:"var(--green)",border:"1px solid rgba(0,217,100,0.5)",borderRadius:"3px",padding:"1px 6px",fontSize:"9px",fontWeight:700,letterSpacing:"0.05em"}}>BUY</span>}
                                    {isHold && <span style={{background:"rgba(245,158,11,0.15)",color:"var(--amber)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"3px",padding:"1px 6px",fontSize:"9px",fontWeight:700,letterSpacing:"0.05em"}}>HOLD</span>}
                                    {misSuplentes.length > 0 && <span style={{background:"rgba(59,158,255,0.15)",color:"var(--blue)",border:"1px solid rgba(59,158,255,0.3)",borderRadius:"3px",padding:"1px 5px",fontSize:"9px",fontWeight:700}}>TITULAR</span>}
                                    {/* Badge TAIL RISK - solo si el monitor esta activo y el activo tiene dependencia de cola */}
                                    {tailRiskData.active && tailRiskData.tailSymbols.has(t.symbol) && (
                                      <span style={{background:"rgba(255,59,92,0.2)",color:"var(--red)",border:"1px solid rgba(255,59,92,0.5)",borderRadius:"3px",padding:"1px 5px",fontSize:"8px",fontWeight:700,letterSpacing:"0.04em"}} title={"Dependencia de cola detectada en " + tailRiskData.stressN + " dias de estres. Exposicion penalizada x 0.5"}>TAIL RISK (N={tailRiskData.stressN})</span>
                                    )}
                                    {/* Scores: barras AQR + Radar | número Final destacado */}
                                    {t._radar.regimeScore != null && (
                                      <div style={{display:"flex",flexDirection:"column",gap:"2px",justifyContent:"center"}}>
                                        <div title={"AQR Score (Python/externo): " + t._radar.regimeScore.toFixed(1) + "/100"} style={{display:"flex",alignItems:"center",gap:"3px",cursor:"help"}}>
                                          <span style={{fontSize:"8px",color:"var(--blue)",fontWeight:600,width:"22px",textAlign:"right",flexShrink:0}}>AQR</span>
                                          <div style={{width:"36px",height:"5px",background:"var(--bg3)",borderRadius:"2px",overflow:"hidden"}}>
                                            <div style={{width:t._radar.regimeScore+"%",height:"100%",background:t._radar.regimeScore>=70?"var(--green)":t._radar.regimeScore>=40?"var(--amber)":"var(--red)",borderRadius:"2px"}}/>
                                          </div>
                                          <span style={{fontSize:"8px",fontWeight:700,color:"var(--blue)",minWidth:"14px"}}>{t._radar.regimeScore.toFixed(0)}</span>
                                        </div>
                                        {t._radar.radarRaw != null && (
                                          <div title={"Radar Score (pre-fusion): " + t._radar.radarRaw} style={{display:"flex",alignItems:"center",gap:"3px"}}>
                                            <span style={{fontSize:"8px",color:"var(--muted)",fontWeight:600,width:"22px",textAlign:"right",flexShrink:0}}>Rad</span>
                                            <div style={{width:"36px",height:"5px",background:"var(--bg3)",borderRadius:"2px",overflow:"hidden"}}>
                                              <div style={{width:t._radar.radarRaw+"%",height:"100%",background:t._radar.radarRaw>=70?"var(--green)":t._radar.radarRaw>=40?"var(--amber)":"var(--red)",borderRadius:"2px"}}/>
                                            </div>
                                            <span style={{fontSize:"8px",fontWeight:700,color:"var(--muted)",minWidth:"14px"}}>{t._radar.radarRaw}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div title="Score Final (IVW fusionado) — determina el ranking" style={{background:"var(--bg3)",borderRadius:"3px",padding:"2px 7px",fontSize:"11px",fontWeight:700,color:t._radar.score>=70?"var(--green)":t._radar.score>=50?"var(--amber)":"var(--red)"}}>{t._radar.score}</div>
                                    </div>
                                  </div>
                                <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                                  {t._radar.factors.map((f,j)=><span key={j} style={{fontSize:"9px",color:"var(--muted)",background:"var(--bg3)",padding:"1px 5px",borderRadius:"2px"}}>{f}</span>)}
                                </div>
                              </div>
                            </div>
                            {/* Shadow Roster: suplentes colapsados bajo el titular */}
                            {misSuplentes.map(([supSym, supData]) => (
                              <div key={supSym} style={{background:"rgba(59,158,255,0.04)",border:"1px solid rgba(59,158,255,0.2)",borderTop:"none",borderRadius:"0 0 4px 4px",padding:"5px 12px 5px 46px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                                  <span style={{color:"var(--blue)",fontSize:"9px",fontWeight:700}}>◎ SHADOW</span>
                                  <span style={{color:"var(--muted)",fontSize:"10px",cursor:"pointer"}} onClick={()=>openNews(supSym)}>{supSym}</span>
                                  <span style={{color:"var(--muted)",fontSize:"9px"}}>score {supData.score}</span>
                                  {supData.isTracked && (
                                    <span style={{background:"rgba(245,158,11,0.15)",color:"var(--amber)",fontSize:"8px",fontWeight:700,padding:"1px 5px",borderRadius:"2px"}}>TRACKED</span>
                                  )}
                                </div>
                                <span style={{fontSize:"8px",color:"var(--muted)"}}>rho={supData.clusterCorr.toFixed(2)} con {t.symbol} - ejecucion mutuamente excluyente</span>
                              </div>
                            ))}
                          </div>
                        );
                    })}
                  </div>
                  <>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--red)",letterSpacing:"0.07em",marginBottom:"8px"}}>PEOR POSICIONADOS</div>
                  <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                    {radarScores.slice(-5).reverse().map(t=>(
                      <div key={t.symbol} style={{background:"rgba(255,59,92,0.05)",border:"1px solid rgba(255,59,92,0.2)",borderRadius:"4px",padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:"var(--text)",fontSize:"11px"}}>{t.symbol} <span style={{color:"var(--muted)",fontSize:"10px"}}>{t._radar.sector}</span></span>
                        <span style={{color:"var(--red)",fontWeight:700,fontSize:"11px"}}><span style={{fontWeight:400,color:"var(--muted)",fontSize:"10px"}}>Final </span>{t._radar.score}</span>
                      </div>
                    ))}
                  </div>
                  </>
                </div>
                <div>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--muted)",letterSpacing:"0.07em",marginBottom:"8px"}}>ANALISIS IA DEL RADAR</div>
                  <button
                    onClick={()=>{
                      const toAnalyze = radarSelected.size > 0
                        ? radarScores.filter(t => radarSelected.has(t.symbol))
                        : radarScores.filter(t => radarSectorFilter==="TODOS" || t._radar.sector===radarSectorFilter);
                      analyzeRadar(toAnalyze);
                    }}
                    disabled={radarAnalyzing||radarScores.length===0}
                    style={{width:"100%",background:radarAnalyzing?"var(--bg3)":"var(--amber)",color:radarAnalyzing?"var(--muted)":"#0a0b0f",border:"none",borderRadius:"4px",padding:"10px",fontSize:"11px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:radarAnalyzing?"not-allowed":"pointer",marginBottom:"4px"}}>
                    {radarAnalyzing?"ANALIZANDO...":radarSelected.size>0?"ANALIZAR "+radarSelected.size+" SELECCIONADOS":"ANALIZAR TOP (SECTOR ACTIVO)"}
                  </button>
                  <button onClick={pingAnalista} disabled={pingStatus==="loading"} title="Verificar conexion con la API antes de analizar" style={{width:"100%",background:pingStatus==="ok"?"rgba(0,217,100,0.1)":pingStatus==="error"?"rgba(255,59,92,0.1)":"var(--bg2)",color:pingStatus==="ok"?"var(--green)":pingStatus==="error"?"var(--red)":"var(--muted)",border:"1px solid "+(pingStatus==="ok"?"rgba(0,217,100,0.3)":pingStatus==="error"?"rgba(255,59,92,0.3)":"var(--border2)"),borderRadius:"4px",padding:"6px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:pingStatus==="loading"?"not-allowed":"pointer",marginBottom:"4px"}}>
                    {pingStatus==="loading"?"VERIFICANDO...":pingStatus==="ok"?"OK CONEXION OK":pingStatus==="error"?"✗ SIN CONEXION - recarga el artefacto":"VERIFICAR CONEXION"}
                  </button>
                  <button onClick={exportarContextoRadar} title="Exporta el contexto para analizarlo en una conversacion de Claude cuando el analista no responde" style={{width:"100%",background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--muted)",borderRadius:"4px",padding:"6px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:"pointer",marginBottom:"4px"}}>
                    ↗ EXPORTAR CONTEXTO (plan B)
                  </button>
                  <button onClick={exportarScoresCSV} title="Descarga Magnificas_Scores_YYYYMMDD.csv con masterPct + histeresis - input del IC test y sweep secuencial" style={{width:"100%",background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--amber)",borderRadius:"4px",padding:"6px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:"pointer",marginBottom:"8px"}}>
                    ↓ EXPORT SCORES CSV (IC test / sweep)
                  </button>
                  <div style={{marginBottom:"4px"}}>
                    <input type="date" value={fedScoreFecha}
                      onChange={e => {
                        setFedScoreFecha(e.target.value);
                        window.storage.set("fed_score_fecha", e.target.value, true).catch(()=>{});
                      }}
                      style={{width:"100%",boxSizing:"border-box",fontSize:"9px",padding:"3px 6px",
                        background:"var(--bg2)",border:"1px solid rgba(147,51,234,0.3)",
                        color:"var(--muted)",borderRadius:"3px",fontFamily:"inherit"}}
                      title="Fecha de descarga del feed AQR externo (scores_dinamicos.json). Registra si el score es 'viejo'." />
                    <div style={{fontSize:"8px",color:"var(--muted)",marginTop:"1px"}}>
                      Fecha descarga feed AQR (dejar vacio = hoy)
                    </div>
                  </div>
                  <button onClick={exportarTelemetria} title="Data Lake: exporta estado completo del universo para calibracion futura (metadata macro + scores de todos los activos)" style={{width:"100%",background:"var(--bg2)",border:"1px solid rgba(147,51,234,0.4)",color:"rgba(167,139,250,0.9)",borderRadius:"4px",padding:"6px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:"pointer",marginBottom:"8px"}}>
                    📡 TELEMETRIA DIARIA (data lake)
                  </button>
                  {radarSelected.size===0 && <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"12px",textAlign:"center"}}>Tick activos arriba para seleccion manual, o analiza el top del sector activo</div>}
                  {radarSelected.size>0 && <div style={{fontSize:"9px",color:"var(--amber)",marginBottom:"12px",textAlign:"center"}}>{radarSelected.size} activo{radarSelected.size!==1?"s":""} seleccionado{radarSelected.size!==1?"s":""} manualmente</div>}
                  {radarAnalysis ? (
                    <div style={{position: "relative"}}>
                      <button onClick={() => { 
                        try {
                          const ta = document.createElement("textarea");
                          ta.value = radarAnalysis;
                          ta.style.position = "absolute";
                          ta.style.left = "-9999px";
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                          alert("Analisis copiado al portapapeles");
                        } catch(e) {
                          navigator.clipboard?.writeText(radarAnalysis)
                            .then(() => alert("Analisis copiado al portapapeles"))
                            .catch(() => alert("Error al copiar. El navegador bloquea el acceso."));
                        }
                      }} style={{position: "absolute", top: "10px", right: "10px", background: "var(--amber)", color: "#0a0b0f", border: "none", borderRadius: "3px", padding: "5px 10px", fontSize: "10px", fontWeight: 700, fontFamily: "inherit", cursor: "pointer", zIndex: 10}}>
                        COPIAR
                      </button>
                      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",paddingTop:"34px",fontSize:"11px",color:"var(--text)",lineHeight:1.8,whiteSpace:"pre-wrap",maxHeight:"600px",overflowY:"auto"}}>
                        {radarAnalysis}
                      </div>
                    </div>
                  ) : (
                    <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px",fontSize:"11px",color:"var(--muted)",lineHeight:1.8,textAlign:"center"}}>
                      <div style={{marginBottom:"8px",fontSize:"24px",opacity:0.3}}>◎</div>
                      Selecciona una tesis y presiona ANALIZAR para recibir un analisis operativo del radar con el contexto macro actual.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ALERTAS */}
        {tab==="alertas" && (
          <div>
            <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>ANOMALIAS ESTADISTICAS</div>
            <div style={{color:"var(--muted)",fontSize:"10px",marginBottom:"12px"}}>{alertDays<3?"Se necesitan minimo 3 dias de datos. Actuales: "+alertDays+".":"Basado en "+alertDays+" snapshots. Anomalias = movimientos mayores a 2 desvios estandar historicos."}</div>
            {alertDays>=3&&alerts.length===0&&<div style={{color:"var(--muted)",fontSize:"11px",padding:"20px",textAlign:"center",background:"var(--bg2)",borderRadius:"6px",border:"1px solid var(--border)"}}>Sin anomalias hoy. Todos los movimientos dentro del rango normal.</div>}
            {alerts.map((a,i)=>(
              <div key={i} style={{background:"var(--bg2)",border:"1px solid "+(a.severity==="high"?"rgba(255,59,92,0.4)":"rgba(245,158,11,0.3)"),borderRadius:"6px",padding:"12px 14px",marginBottom:"8px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                  <span style={{color:"var(--amber)",fontWeight:600,cursor:"pointer"}} onClick={()=>openNews(a.symbol)}>{a.symbol}</span>
                  <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                    {a.type==="movement"&&<span style={{color:pc(a.change),fontWeight:600}}>{fmtPct(a.change)}</span>}
                    <span className="CHIP" style={{background:a.severity==="high"?"rgba(255,59,92,0.15)":"rgba(245,158,11,0.15)",color:a.severity==="high"?"var(--red)":"var(--amber)"}}>{a.severity==="high"?"ALTA":"MEDIA"}</span>
                  </div>
                </div>
                {a.type==="movement"&&<div style={{fontSize:"11px",color:"var(--muted)",lineHeight:1.7}}><div>Z-SCORE: {a.z} | Media historica: {fmtPct(Number(a.mean))} | Hoy: {fmtPct(a.change)}</div>{a.divergence!=null&&<div>Divergencia vs S&P: {Number(a.divergence)>0?"+":""}{a.divergence}%</div>}</div>}
                {a.type==="fundamental"&&<div style={{fontSize:"11px",color:"var(--muted)"}}>{a.message}</div>}
              </div>
            ))}
          </div>
        )}

        {/* HEATMAP */}
        {tab==="heatmap" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <div>
                <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"2px"}}>HEATMAP SECTORIAL</div>
                <div style={{color:"var(--muted)",fontSize:"10px"}}>
                  {heatmapMode==="1d"    && "Variacion absoluta de la ultima sesion. Click = noticias."}
                  {heatmapMode==="rs1d"  && "Alpha vs S&P 500 hoy (variacion ticker − variacion S&P). Click = noticias."}
                  {heatmapMode==="rs5d"  && "Alpha vs S&P 500 acumulado en 5 dias. Click = noticias."}
                  {heatmapMode==="rs20d" && "Alpha vs S&P 500 acumulado en 20 dias. Click = noticias."}
                  {heatmapMode==="rs60d" && "Alpha vs S&P 500 acumulado en 60 dias. Click = noticias."}
                  {heatmapMode==="rs252d"&& "Alpha vs S&P 500 acumulado en 252 dias (1 ano). Click = noticias."}
                </div>
              </div>
              <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
                {[["1d","1D"],["rs1d","RS 1D"],["rs5d","RS 5D"],["rs20d","RS 20D"],["rs60d","RS 60D"],["rs252d","RS 252D"]].map(([mode,label])=>(
                  <button key={mode} onClick={()=>setHeatmapMode(mode)}
                    style={{background:heatmapMode===mode?"var(--amber)":"var(--bg2)",color:heatmapMode===mode?"#0a0b0f":"var(--muted)",border:"1px solid "+(heatmapMode===mode?"var(--amber)":"var(--border2)"),borderRadius:"4px",padding:"5px 11px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.06em"}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tickers.length===0 ? <div style={{color:"var(--muted)",fontSize:"11px",textAlign:"center",padding:"40px"}}>Sin datos.</div> : (()=>{
              // Saturacion de color calibrada por lapso
              const satMap = {"1d":3,"rs1d":2,"rs5d":5,"rs20d":10,"rs60d":20,"rs252d":35};
              const sat = satMap[heatmapMode] || 3;
              const hcDyn = (v) => {
                if (v == null) return "rgba(128,128,128,0.15)";
                const intensity = Math.min(1, Math.abs(v) / sat);
                return v >= 0
                  ? `rgba(0,${Math.round(180*intensity+40)},${Math.round(80*intensity)},${0.15+intensity*0.55})`
                  : `rgba(${Math.round(200*intensity+55)},${Math.round(40*intensity)},${Math.round(60*intensity)},${0.15+intensity*0.55})`;
              };

              // Calcular delta por ticker segun el lapso
              const sortedDates = Object.keys(snapshots).sort();
              // Funcion RS: retorno ticker en N dias − retorno S&P en N dias
              const calcRS = (symbol, nBack) => {
                const selIdx = sortedDates.indexOf(selDate);
                if (selIdx < 0 || selIdx < nBack) return null;
                const targetIdx = selIdx - nBack;
                const nowSnap  = snapshots[sortedDates[selIdx]];
                const thenSnap = snapshots[sortedDates[targetIdx]];
                if (!nowSnap || !thenSnap) return null;

                // Helper: extraer precio numerico valido de un snapshot
                const getPrice = (snap, sym) => {
                  const t = snap.tickers?.find(t => t.symbol === sym);
                  if (!t) return null;
                  const p = t.last_price;
                  // Validar: debe ser numero positivo razonable (> 0.01)
                  // Evita usar change_pct o valores erroneos guardados como last_price
                  return (typeof p === 'number' && p > 0.01) ? p : null;
                };

                const pNow  = getPrice(nowSnap,  symbol);
                const pThen = getPrice(thenSnap, symbol);
                if (pNow == null || pThen == null) return null;
                const tickerRet = (pNow - pThen) / pThen * 100;

                // SPY como benchmark — buscar en tickers del snapshot
                const spNow  = getPrice(nowSnap,  'SPY') ?? getPrice(nowSnap,  '^GSPC') ?? nowSnap.market?.spyPrice ?? null;
                const spThen = getPrice(thenSnap, 'SPY') ?? getPrice(thenSnap, '^GSPC') ?? thenSnap.market?.spyPrice ?? null;
                if (spNow == null || spThen == null) return null;
                const spRet = (spNow - spThen) / spThen * 100;

                return tickerRet - spRet;
              };

              const calcDeltaForMode = (symbol, mode) => {
                if (mode === "1d") return tickers.find(t=>t.symbol===symbol)?.change_pct ?? null;
                if (mode === "rs1d") {
                  const chg = tickers.find(t=>t.symbol===symbol)?.change_pct ?? null;
                  const spChg = tickers.find(t=>["SPY","^GSPC"].includes(t.symbol))?.change_pct ?? curData?.market?.sp500?.change_pct ?? null;
                  if (chg==null) return null;
                  return spChg!=null ? chg - spChg : chg;
                }
                if (mode === "rs5d")   return calcRS(symbol, 5);
                if (mode === "rs20d")  {
                  // Usar RS 20D precalculado si disponible, sino calcular
                  const rs = twScore.find(t=>t.symbol===symbol)?._rs;
                  return rs != null ? Number(rs) : calcRS(symbol, 20);
                }
                if (mode === "rs60d")  {
                  // calcRS ya tiene guard interno: si selIdx < 60 retorna null
                  // No agregar guard externo adicional — causaba bloqueo con 69 snapshots
                  return calcRS(symbol, 60);
                }
                if (mode === "rs252d") return calcRS(symbol, 252);
                return null;
              };

              const fmtVal = (v) => v != null ? (v>=0?"+":"")+v.toFixed(1)+"%" : "N/A";
              const colVal = (v) => v == null ? "var(--muted)" : v>=0 ? "var(--green)" : "var(--red)";

              return Object.entries(hmSectors).map(([sector, sts]) => {
                const withVals = sts.map(t => ({...t, _hval: calcDeltaForMode(t.symbol, heatmapMode)}));
                const validVals = withVals.map(t=>t._hval).filter(v=>v!=null);
                const sAvg = validVals.length > 0 ? validVals.reduce((a,b)=>a+b,0)/validVals.length : null;
                const sorted = [...withVals].sort((a,b) => (b._hval??-Infinity) - (a._hval??-Infinity));
                return (
                  <div key={sector} style={{marginBottom:"14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px"}}>
                      <span style={{color:"var(--text)",fontSize:"10px",fontWeight:700,letterSpacing:"0.07em"}}>{sector.toUpperCase()}</span>
                      {sAvg != null
                        ? <span style={{fontSize:"10px",color:colVal(sAvg),fontWeight:600}}>{fmtVal(sAvg)}</span>
                        : <span style={{fontSize:"10px",color:"var(--muted)"}}>N/A</span>}
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                      {sorted.map(t => (
                        <div key={t.symbol} onClick={()=>openNews(t.symbol)}
                          style={{background:hcDyn(t._hval),border:"1px solid rgba(255,255,255,0.06)",borderRadius:"4px",padding:"6px 8px",minWidth:"72px",cursor:"pointer"}}>
                          <div style={{fontSize:"11px",fontWeight:600,color:"var(--text)",marginBottom:"2px"}}>{t.symbol}</div>
                          <div style={{fontSize:"10px",fontWeight:600,color:colVal(t._hval)}}>{fmtVal(t._hval)}</div>
                          {t.last_price && <div style={{fontSize:"9px",color:"var(--muted)"}}>{fmt(t.last_price)}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* ESTRUCTURA */}
        {tab==="estructura" && (
          <div>
            <div style={{marginBottom:"14px"}}>
              <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>ESTRUCTURA DE MERCADO</div>
              {!clusterData.ready && <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:"4px",padding:"10px 14px",fontSize:"10px",color:"var(--amber)"}}>Se necesitan minimo {clusterData.daysNeeded} snapshots. Disponibles: {clusterData.daysAvailable}.</div>}
            </div>

            <div style={{marginBottom:"20px"}}>
              <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"8px"}}>GRUPOS DE COMPORTAMIENTO</div>
              {clusterData.ready && clusterData.clusters.length === 0 && <div style={{color:"var(--muted)",fontSize:"11px",padding:"14px",textAlign:"center",background:"var(--bg2)",borderRadius:"6px",border:"1px solid var(--border)"}}>Sin clusters detectados con el umbral actual.</div>}
              {clusterData.ready && clusterData.clusters.map((cl, ci) => {
                const decouplings = detectClusterDecoupling(cl, snapshots);
                return (
                  <div key={ci} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px 14px",marginBottom:"10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                      <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                        <span style={{fontSize:"10px",fontWeight:700,color:"var(--text)"}}>GRUPO {ci+1}</span>
                        <span style={{fontSize:"10px",color:"var(--muted)"}}>{cl.dominantSector}</span>
                        <span style={{fontSize:"10px",color:"var(--muted)"}}>{cl.members.length} activos</span>
                      </div>
                      <span style={{fontSize:"10px",fontWeight:700,color:cc(cl.avgCorr).text}}>corr {cl.avgCorr.toFixed(2)}</span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginBottom:decouplings.length>0?"10px":"0"}}>
                      {cl.members.map(s=>{const t=tickers.find(x=>x.symbol===s);return(<div key={s} onClick={()=>openNews(s)} style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"3px",padding:"4px 8px",cursor:"pointer",display:"inline-flex",gap:"6px",alignItems:"center"}}><span style={{color:"var(--amber)",fontSize:"11px",fontWeight:600}}>{s}</span>{t?.change_pct!=null&&<span style={{fontSize:"10px",color:pc(t.change_pct)}}>{fmtPct(t.change_pct)}</span>}</div>);})}
                    </div>
                    {decouplings.length > 0 && (
                      <div style={{borderTop:"1px solid var(--border)",paddingTop:"8px"}}>
                        <div style={{fontSize:"9px",fontWeight:700,color:"var(--red)",letterSpacing:"0.07em",marginBottom:"5px"}}>RUPTURAS DETECTADAS</div>
                        {decouplings.slice(0,3).map((d,di)=>(
                          <div key={di} style={{fontSize:"10px",color:"var(--muted)",marginBottom:"3px",display:"flex",gap:"8px",alignItems:"center"}}>
                            <span style={{color:"var(--red)"}}>!</span>
                            <span><span style={{color:"var(--text)",fontWeight:600}}>{d.s1}/{d.s2}</span>: hist {d.histCorr.toFixed(2)} -> reciente {d.recentCorr.toFixed(2)} ({d.diverging?" MOVIMIENTO OPUESTO":"delta "+d.delta.toFixed(2)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{marginBottom:"20px"}}>
              <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"8px"}}>LIDERAZGO Y REZAGO {dates.length<15&&<span style={{color:"var(--muted)",fontWeight:400}}> - activa con 20+ dias ({dates.length} disponibles)</span>}</div>
              <div style={{color:"var(--muted)",fontSize:"10px",marginBottom:"10px"}}>Detecta si dentro de un grupo hay un activo que se mueve primero y otros que lo siguen dias despues.</div>
              {dates.length < 15 ? (
                <div style={{padding:"14px",background:"var(--bg2)",borderRadius:"6px",border:"1px solid var(--border)",fontSize:"10px",color:"var(--muted)",textAlign:"center"}}>Disponible con 20+ snapshots. En construccion mientras se acumulan datos.</div>
              ) : (
                <div>
                  {clusterData.clusters.map((cl,ci) => {
                    const leaderLags = [];
                    for (let ii=0;ii<cl.members.length;ii++) for (let jj=ii+1;jj<cl.members.length;jj++) {
                      const ll = calcLeaderLag(cl.members[ii],cl.members[jj],snapshots);
                      if (ll) leaderLags.push(ll);
                    }
                    if (!leaderLags.length) return null;
                    return (
                      <div key={ci} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px 14px",marginBottom:"8px"}}>
                        <div style={{fontSize:"10px",fontWeight:600,color:"var(--text)",marginBottom:"6px"}}>Grupo {ci+1}</div>
                        {leaderLags.map((ll,li) => (
                          <div key={li} style={{fontSize:"11px",color:"var(--muted)",marginBottom:"3px"}}>
                            <span style={{color:"var(--green)",fontWeight:600}}>{ll.leader}</span> lidera a <span style={{color:"var(--amber)",fontWeight:600}}>{ll.follower}</span> por {ll.lag} dia{ll.lag!==1?"s":""} (corr {ll.corr.toFixed(2)})
                          </div>
                        ))}
                      </div>
                    );
                  }).filter(Boolean)}
                  {clusterData.clusters.length === 0 && <div style={{color:"var(--muted)",fontSize:"11px",padding:"14px",textAlign:"center",background:"var(--bg2)",borderRadius:"6px",border:"1px solid var(--border)"}}>Sin clusters activos para analizar liderazgo.</div>}
                </div>
              )}
            </div>

            <div style={{marginBottom:"20px"}}>
              <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"8px"}}>SENSIBILIDAD MACRO {dates.length<10&&<span style={{color:"var(--muted)",fontWeight:400}}> - activa con 20+ dias</span>}</div>
              {dates.length >= 10 ? (
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",fontSize:"10px",width:"100%"}}>
                    <thead>
                      <tr style={{background:"var(--bg3)",borderBottom:"1px solid var(--border2)"}}>
                        <th style={{padding:"6px 8px",textAlign:"left",color:"var(--muted)",fontWeight:600}}>ACTIVO</th>
                        {MACRO_ANCHORS.map(a=><th key={a} style={{padding:"6px 8px",textAlign:"center",color:"var(--amber)",fontWeight:600,minWidth:"50px"}}>{a==="DX-Y.NYB"?"DXY":a}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {tickers.filter(t=>t.last_price!=null).slice(0,30).map((t,i)=>{
                        const sens = calcMacroSensitivity(t.symbol, snapshots);
                        if (!sens) return null;
                        return (
                          <tr key={t.symbol} className="TR" style={{borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg)":"var(--bg2)"}}>
                            <td style={{padding:"5px 8px",color:"var(--amber)",fontWeight:600,cursor:"pointer"}} onClick={()=>openNews(t.symbol)}>{t.symbol}</td>
                            {MACRO_ANCHORS.map(a=>{const v=sens[a];const ccc=cc(v);return <td key={a} style={{padding:"5px 8px",textAlign:"center",background:v!=null?ccc.bg:"transparent",color:v!=null?ccc.text:"var(--muted)",fontWeight:600}}>{v!=null?v.toFixed(2):"-"}</td>;})}
                          </tr>
                        );
                      }).filter(Boolean)}
                    </tbody>
                  </table>
                </div>
              ) : <div style={{padding:"14px",background:"var(--bg2)",borderRadius:"6px",border:"1px solid var(--border)",fontSize:"10px",color:"var(--muted)",textAlign:"center"}}>Disponible con 20+ snapshots.</div>}
            </div>

            <div>
              <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"8px"}}>MIS HIPOTESIS</div>
              <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"16px"}}>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
                  <datalist id="hyp-ticker-list">
                    {tickers.map(t=><option key={t.symbol} value={t.symbol}/>)}
                    {MACRO_ANCHORS.map(a=><option key={a} value={a}/>)}
                  </datalist>
                  <input list="hyp-ticker-list" value={hypIn.s1} onChange={e=>setHypIn(p=>({...p,s1:e.target.value.toUpperCase()}))} placeholder="Ticker 1" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",width:"90px",fontFamily:"inherit"}}/>
                  <span style={{color:"var(--muted)"}}>-</span>
                  <input list="hyp-ticker-list" value={hypIn.s2} onChange={e=>setHypIn(p=>({...p,s2:e.target.value.toUpperCase()}))} placeholder="Ticker 2" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",width:"90px",fontFamily:"inherit"}}/>
                  <input value={hypIn.label} onChange={e=>setHypIn(p=>({...p,label:e.target.value}))} placeholder="Descripcion (opcional)" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",flex:1,minWidth:"160px",fontFamily:"inherit"}}/>
                  <button onClick={()=>{if(!hypIn.s1.trim()||!hypIn.s2.trim())return;const h={s1:hypIn.s1.trim(),s2:hypIn.s2.trim(),label:hypIn.label.trim()||hypIn.s1+"/"+hypIn.s2};if(hyps.find(x=>x.s1===h.s1&&x.s2===h.s2))return;setHyps(prev=>[...prev,h]);setHypIn({s1:"",s2:"",label:""}); }} style={{background:"var(--amber)",color:"#0a0b0f",border:"none",borderRadius:"4px",padding:"6px 14px",fontWeight:700,fontFamily:"inherit",fontSize:"11px",cursor:"pointer"}}>AGREGAR</button>
                </div>
              </div>
              {hyps.length===0?<div style={{color:"var(--muted)",fontSize:"11px",padding:"20px",textAlign:"center",background:"var(--bg2)",borderRadius:"6px",border:"1px solid var(--border)"}}>Sin hipotesis. Ejemplo: PAAS - GLD, OXY - CL=F</div>:(
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {hypRes.map((h,i)=>{
                    const smap={confirmada_pos:{label:"CONFIRMADA +",color:"var(--green)"},confirmada_neg:{label:"CONFIRMADA -",color:"var(--blue)"},debil:{label:"DEBIL",color:"var(--amber)"},no_confirmada:{label:"NO CONFIRMADA",color:"var(--muted)"},desacoplando:{label:"DESACOPLANDO",color:"var(--red)"},sin_datos:{label:"SIN DATOS",color:"var(--muted)"}};
                    const sc=smap[h.status]||smap.sin_datos;
                    const ccc=cc(h.corr);
                    return (
                      <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px 14px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                          <span style={{color:"var(--text)",fontWeight:600,fontSize:"12px"}}>{h.label}</span>
                          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                            {h.corr!=null&&<span style={{color:ccc.text,fontWeight:700,fontSize:"13px"}}>{Number(h.corr).toFixed(2)}</span>}
                            <span className="CHIP" style={{background:sc.color+"22",color:sc.color}}>{sc.label}</span>
                            <button onClick={()=>setHyps(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",padding:"0 4px"}}>x</button>
                          </div>
                        </div>
                        <div style={{fontSize:"10px",color:"var(--muted)"}}>
                          {h.status==="sin_datos"&&"Insuficientes datos."}
                          {h.status==="confirmada_pos"&&"Correlacion positiva fuerte confirmada."}
                          {h.status==="confirmada_neg"&&"Correlacion inversa fuerte confirmada."}
                          {h.status==="debil"&&"Correlacion moderada. Necesitas mas datos."}
                          {h.status==="no_confirmada"&&"Los datos no muestran relacion sistematica."}
                          {h.status==="desacoplando"&&"ATENCION: Esta correlacion estaba siendo fuerte pero se esta rompiendo."}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VALUACION */}
        {tab==="valuacion" && (
          <div>
            <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>ARBITRAJE RELATIVO SECTORIAL</div>
            <div style={{color:"var(--muted)",fontSize:"10px",lineHeight:1.7,marginBottom:"14px"}}>Z negativo = barato vs pares. Z positivo = caro. Umbral alerta: 1.5 sigmas.</div>
            {tickers.length===0?<div style={{color:"var(--muted)",fontSize:"11px",textAlign:"center",padding:"40px"}}>Sin datos.</div>:(
              Object.entries(sa).map(([sector,data])=>{
                const cheap=data.tickers.filter(t=>t.avgZ<=-1.5).sort((a,b)=>a.avgZ-b.avgZ);
                const expensive=data.tickers.filter(t=>t.avgZ>=1.5).sort((a,b)=>b.avgZ-a.avgZ);
                const normal=data.tickers.filter(t=>t.avgZ>-1.5&&t.avgZ<1.5);
                if (data.tickers.length<2) return null;
                return (
                  <div key={sector} style={{marginBottom:"16px",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px 14px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                      <span style={{fontWeight:600,fontSize:"11px",color:"var(--text)"}}>{sector.toUpperCase()}</span>
                      <div style={{display:"flex",gap:"16px",fontSize:"10px",color:"var(--muted)"}}>
                        {Object.entries(data.stats).map(([m,s])=><span key={m}>{m==="pe_ttm"?"P/E":m==="forward_pe"?"FWD P/E":"P/BOOK"}: {s.mean.toFixed(1)} +/-{s.std.toFixed(1)}</span>)}
                      </div>
                    </div>
                    {cheap.length>0&&(
                      <div style={{marginBottom:"8px"}}>
                        <div style={{fontSize:"10px",color:"var(--green)",fontWeight:600,letterSpacing:"0.06em",marginBottom:"5px"}}>BARATOS VS SECTOR</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                          {cheap.map(t=>(
                            <div key={t.symbol} onClick={()=>openNews(t.symbol)} style={{background:"rgba(0,217,100,0.08)",border:"1px solid rgba(0,217,100,0.25)",borderRadius:"4px",padding:"6px 10px",cursor:"pointer"}}>
                              <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"2px"}}><span style={{color:"var(--amber)",fontWeight:600,fontSize:"11px"}}>{t.symbol}</span><span style={{color:"var(--green)",fontWeight:700,fontSize:"10px"}}>Z={t.avgZ.toFixed(2)}</span></div>
                              <div style={{fontSize:"10px",color:"var(--muted)",display:"flex",gap:"8px"}}>{t.pe_ttm!=null&&<span>P/E {fmt(t.pe_ttm)}</span>}{t.forward_pe!=null&&<span>FWD {fmt(t.forward_pe)}</span>}{t.price_book!=null&&<span>P/B {fmt(t.price_book)}</span>}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {expensive.length>0&&(
                      <div style={{marginBottom:"8px"}}>
                        <div style={{fontSize:"10px",color:"var(--red)",fontWeight:600,letterSpacing:"0.06em",marginBottom:"5px"}}>CAROS VS SECTOR</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                          {expensive.map(t=>(
                            <div key={t.symbol} onClick={()=>openNews(t.symbol)} style={{background:"rgba(255,59,92,0.08)",border:"1px solid rgba(255,59,92,0.25)",borderRadius:"4px",padding:"6px 10px",cursor:"pointer"}}>
                              <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"2px"}}><span style={{color:"var(--amber)",fontWeight:600,fontSize:"11px"}}>{t.symbol}</span><span style={{color:"var(--red)",fontWeight:700,fontSize:"10px"}}>Z=+{t.avgZ.toFixed(2)}</span></div>
                              <div style={{fontSize:"10px",color:"var(--muted)",display:"flex",gap:"8px"}}>{t.pe_ttm!=null&&<span>P/E {fmt(t.pe_ttm)}</span>}{t.forward_pe!=null&&<span>FWD {fmt(t.forward_pe)}</span>}{t.price_book!=null&&<span>P/B {fmt(t.price_book)}</span>}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {normal.length>0&&(
                      <div>
                        <div style={{fontSize:"10px",color:"var(--muted)",letterSpacing:"0.06em",marginBottom:"5px"}}>EN RANGO NORMAL</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                          {normal.sort((a,b)=>a.avgZ-b.avgZ).map(t=><span key={t.symbol} onClick={()=>openNews(t.symbol)} style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"3px",padding:"3px 8px",fontSize:"10px",color:"var(--text)",cursor:"pointer",display:"inline-flex",gap:"6px",alignItems:"center"}}>{t.symbol}<span style={{color:"var(--muted)",fontSize:"9px"}}>{t.avgZ.toFixed(1)}</span></span>)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* COMPARAR */}
        {tab==="comparar" && (
          <div>
            <div style={{display:"flex",gap:"12px",marginBottom:"14px",alignItems:"center"}}>
              {[["FECHA BASE",cmpDate,setCmpDate],["FECHA COMPARACION",selDate,setSelDate]].map(([label,val,setter])=>(
                <div key={label}>
                  <div style={{color:"var(--muted)",fontSize:"10px",letterSpacing:"0.06em",marginBottom:"4px"}}>{label}</div>
                  <select value={val||""} onChange={e=>setter(e.target.value)} style={{background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",fontFamily:"inherit",cursor:"pointer"}}>
                    {dates.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {(!cmpDate||!selDate||cmpDate===selDate)?<div style={{color:"var(--muted)",fontSize:"11px",padding:"20px",textAlign:"center",background:"var(--bg2)",borderRadius:"6px",border:"1px solid var(--border)"}}>{dates.length<2?"Necesitas al menos 2 snapshots.":"Selecciona dos fechas distintas."}</div>:(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
                  <thead>
                    <tr style={{background:"var(--bg3)",borderBottom:"1px solid var(--border2)"}}>
                      {["SYMBOL","PRECIO "+cmpDate.slice(5),"PRECIO "+selDate.slice(5),"DELTA%","P/E "+cmpDate.slice(5),"P/E "+selDate.slice(5),"DELTA P/E"].map(h=><th key={h} style={{padding:"7px 8px",textAlign:h==="SYMBOL"?"left":"right",color:"var(--muted)",fontWeight:600,fontSize:"10px"}}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshots[selDate]?.tickers||[]).map((t,i)=>{
                      const prev=snapshots[cmpDate]?.tickers?.find(p=>p.symbol===t.symbol);
                      const pd=prev?.last_price&&t.last_price?((t.last_price-prev.last_price)/prev.last_price*100):null;
                      const ped=prev?.pe_ttm&&t.pe_ttm?(t.pe_ttm-prev.pe_ttm):null;
                      return (
                        <tr key={t.symbol} className="TR" style={{borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg)":"var(--bg2)"}}>
                          <td style={{padding:"5px 8px",color:"var(--amber)",fontWeight:600,cursor:"pointer"}} onClick={()=>openNews(t.symbol)}>{t.symbol}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:"var(--muted)"}}>{fmt(prev?.last_price)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right"}}>{fmt(t.last_price)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:pc(pd),fontWeight:600}}>{fmtPct(pd)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:"var(--muted)"}}>{fmt(prev?.pe_ttm)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right"}}>{fmt(t.pe_ttm)}</td>
                          <td style={{padding:"5px 8px",textAlign:"right",color:ped==null?"var(--muted)":ped>0?"var(--red)":"var(--green)"}}>{ped==null?"-":(ped>0?"+":"")+fmt(ped)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CHAT */}
        {tab==="chat" && (
          <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 140px)"}}>
            {dates.length===0?<div style={{textAlign:"center",padding:"60px",color:"var(--muted)"}}>Carga datos desde <span style={{color:"var(--amber)",cursor:"pointer"}} onClick={()=>setTab("dashboard")}>CARGAR</span></div>:(
              <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
                <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:"10px",marginBottom:"10px"}}>
                  {chatMsgs.length===0&&(
                    <div style={{padding:"4px 0"}}>
                      <div style={{color:"var(--muted)",fontSize:"10px",letterSpacing:"0.06em",marginBottom:"10px"}}>SNAPSHOTS: {dates.join(" - ")} | {tickers.length} tickers</div>
                      <div style={{color:"var(--muted)",fontSize:"10px",letterSpacing:"0.06em",marginBottom:"8px"}}>SUGERENCIAS</div>
                      <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                        {SUGS.map(s=><button key={s} className="SB" onClick={()=>setChatIn(s)} style={{background:"var(--bg2)",border:"1px solid var(--border)",color:"var(--muted)",padding:"7px 12px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",textAlign:"left",fontFamily:"inherit"}}>- {s}</button>)}
                      </div>
                    </div>
                  )}
                  {chatMsgs.map((m,i)=>(
                    <div key={i} className="CB" style={{background:m.role==="user"?"var(--bg3)":"var(--bg2)",borderLeft:m.role==="user"?"2px solid var(--amber)":"2px solid var(--blue)",padding:"10px 14px",borderRadius:"0 4px 4px 0",fontSize:"12px",color:m.role==="user"?"var(--amber)":"var(--text)"}}>{m.content}</div>
                  ))}
                  {chatLoading&&<div style={{background:"var(--bg2)",borderLeft:"2px solid var(--blue)",padding:"10px 14px",borderRadius:"0 4px 4px 0",color:"var(--muted)",fontSize:"11px"}}>Analizando...</div>}
                  <div ref={chatEnd}/>
                </div>
                <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                  <button onClick={()=>setWebSearch(v=>!v)} style={{background:webSearch?"var(--blue)":"var(--bg3)",color:webSearch?"#0a0b0f":"var(--muted)",border:"1px solid "+(webSearch?"var(--blue)":"var(--border2)"),borderRadius:"4px",padding:"9px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:700,letterSpacing:"0.06em",whiteSpace:"nowrap"}}>WEB {webSearch?"ON":"OFF"}</button>
                  <button onClick={pingAnalista} disabled={pingStatus==="loading"} title="Verificar que el analista puede conectarse a la API" style={{background:pingStatus==="ok"?"rgba(0,217,100,0.15)":pingStatus==="error"?"rgba(255,59,92,0.15)":pingStatus==="loading"?"var(--bg3)":"var(--bg2)",color:pingStatus==="ok"?"var(--green)":pingStatus==="error"?"var(--red)":pingStatus==="loading"?"var(--muted)":"var(--muted)",border:"1px solid "+(pingStatus==="ok"?"rgba(0,217,100,0.4)":pingStatus==="error"?"rgba(255,59,92,0.4)":"var(--border2)"),borderRadius:"4px",padding:"9px 10px",cursor:pingStatus==="loading"?"not-allowed":"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:700,letterSpacing:"0.06em",whiteSpace:"nowrap"}}>
                    {pingStatus==="loading"?"...":pingStatus==="ok"?"OK OK":pingStatus==="error"?"✗ SIN CONEXION":"PING"}
                  </button>
                  <button onClick={exportarContextoChat} title="Exporta el contexto para analizarlo en otra conversacion de Claude" style={{background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--muted)",borderRadius:"4px",padding:"9px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:700,letterSpacing:"0.06em",whiteSpace:"nowrap"}}>↗ PLAN B</button>
                  <input value={chatIn} onChange={e=>setChatIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()} placeholder={webSearch?"Pregunta - buscara en la web...":"Pregunta sobre los datos..."} style={{flex:1,background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"9px 12px",fontSize:"12px",fontFamily:"inherit"}}/>
                  <button onClick={sendChat} disabled={chatLoading||!chatIn.trim()} style={{background:chatLoading?"var(--bg3)":"var(--amber)",color:chatLoading?"var(--muted)":"#0a0b0f",border:"none",borderRadius:"4px",padding:"9px 18px",cursor:chatLoading?"not-allowed":"pointer",fontWeight:700,fontFamily:"inherit",fontSize:"11px",letterSpacing:"0.06em"}}>ENVIAR</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CARGAR */}
        {tab==="upload" && (
          <div style={{display:"flex",flexDirection:"column",gap:"16px",maxWidth:"960px"}}>
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px"}}>
              {!pinOk ? (
                <div>
                  <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"16px"}}>ACCESO DE CARGA</div>
                  <div style={{color:"var(--muted)",fontSize:"11px",marginBottom:"14px"}}>Esta funcion requiere PIN.</div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <input type="password" value={pinIn} onChange={e=>{setPinIn(e.target.value);setPinErr(false);}} onKeyDown={e=>{if(e.key==="Enter"){if(pinIn===UPLOAD_PIN){setPinOk(true);setPinIn("");}else{setPinErr(true);setPinIn("");}}}} placeholder="PIN..." style={{flex:1,background:"var(--bg)",border:"1px solid "+(pinErr?"var(--red)":"var(--border2)"),color:"var(--text)",borderRadius:"4px",padding:"8px 10px",fontSize:"12px",fontFamily:"inherit"}}/>
                    <button onClick={()=>{if(pinIn===UPLOAD_PIN){setPinOk(true);setPinIn("");}else{setPinErr(true);setPinIn("");}}} style={{background:"var(--amber)",color:"#0a0b0f",border:"none",borderRadius:"4px",padding:"8px 16px",fontWeight:700,fontFamily:"inherit",fontSize:"11px",cursor:"pointer"}}>ENTRAR</button>
                  </div>
                  {pinErr&&<div style={{color:"var(--red)",fontSize:"10px",marginTop:"8px"}}>PIN incorrecto</div>}
                </div>
              ) : (
                <div>
                  <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"18px"}}>NUEVO SNAPSHOT</div>
                  <div style={{marginBottom:"12px"}}>
                    <label style={{display:"block",color:"var(--muted)",fontSize:"10px",letterSpacing:"0.06em",marginBottom:"6px"}}>FECHA</label>
                    <input type="date" value={upDate} onChange={e=>setUpDate(e.target.value)} style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"7px 10px",width:"100%",fontSize:"12px",fontFamily:"inherit"}}/>
                  </div>
                  <div style={{marginBottom:"12px"}}>
                    <label style={{display:"block",color:"var(--muted)",fontSize:"10px",letterSpacing:"0.06em",marginBottom:"6px"}}>ARCHIVO CSV</label>
                    <input type="file" accept=".csv" ref={csvRef} onChange={e=>setFiles({csv:e.target.files[0]})} style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"7px 10px",width:"100%",fontSize:"12px",fontFamily:"inherit"}}/>
                  </div>
                  <div style={{marginBottom:"12px"}}>
                    <label style={{display:"block",color:"var(--muted)",fontSize:"10px",letterSpacing:"0.06em",marginBottom:"6px"}}>NOTA DEL DIA (opcional)</label>
                    <input value={upNote} onChange={e=>setUpNote(e.target.value)} placeholder="Ej: Fed subio tasas, Iran escalo..." style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"7px 10px",width:"100%",fontSize:"11px",fontFamily:"inherit"}}/>
                  </div>
                  <button onClick={processUpload} disabled={uploading||!files.csv} style={{width:"100%",background:uploading||!files.csv?"var(--bg3)":"var(--amber)",color:uploading||!files.csv?"var(--muted)":"#0a0b0f",border:"none",borderRadius:"4px",padding:"11px",fontSize:"11px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.08em",cursor:uploading?"not-allowed":"pointer"}}>{uploading?"PROCESANDO...":"PROCESAR Y GUARDAR"}</button>
                  {upStatus&&<div style={{marginTop:"10px",padding:"8px 12px",borderRadius:"4px",background:"var(--bg)",fontSize:"11px",color:upStatus.startsWith("OK")?"var(--green)":upStatus.startsWith("ERROR")?"var(--red)":"var(--muted)",borderLeft:"2px solid "+(upStatus.startsWith("OK")?"var(--green)":upStatus.startsWith("ERROR")?"var(--red)":"var(--muted)")}}>{upStatus}</div>}
                  <button onClick={()=>setPinOk(false)} style={{marginTop:"12px",background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"10px",fontFamily:"inherit",padding:0}}>Cerrar sesion</button>
                </div>
              )}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
              {/* == Dynamic Regime Scores - Pipeline Python == */}
              <div style={{background:"var(--bg2)",border:"1px solid rgba(59,158,255,0.3)",borderRadius:"6px",padding:"14px 16px"}}>
                <div style={{fontFamily:"sans-serif",fontWeight:700,fontSize:"12px",color:"var(--blue)",letterSpacing:"0.07em",marginBottom:"6px"}}>REGIME SCORES DINAMICOS (PYTHON PIPELINE)</div>
                <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:1.6,marginBottom:"10px"}}>
                  Importa un archivo <code style={{background:"var(--bg3)",padding:"1px 4px",borderRadius:"2px"}}>scores_dinamicos.json</code> generado externamente.<br/>
                  Formato: objeto llave-valor con simbolo en mayusculas y score 0-100.<br/>
                  Ejemplo: <code style={{background:"var(--bg3)",padding:"1px 4px",borderRadius:"2px"}}>{"{"}"XLE": 95.2, "GLD": 12.5, "OXY": 88.0{"}"}</code>
                </div>
                <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap",marginBottom:"8px"}}>
                  <input type="file" accept=".json,application/json"
                    onChange={e => importDynamicScores(e.target.files?.[0])}
                    style={{flex:1,minWidth:"200px",background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"10px",fontFamily:"inherit",cursor:"pointer"}}
                  />
                  {Object.keys(dynamicScores).length > 0 && (
                    <button
                      onClick={async () => { setDynamicScores({}); await window.storage.delete("dynamic:scores", true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); }); setDynScoreStatus("Scores eliminados."); }}
                      style={{background:"none",border:"1px solid rgba(255,59,92,0.3)",color:"var(--red)",borderRadius:"4px",padding:"5px 10px",fontSize:"9px",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}
                    >
                      Limpiar ({Object.keys(dynamicScores).length})
                    </button>
                  )}
                </div>
                {dynScoreStatus && (
                  <div style={{fontSize:"10px",padding:"6px 10px",borderRadius:"4px",background:dynScoreStatus.startsWith("ERROR") ? "rgba(255,59,92,0.1)" : "rgba(0,217,100,0.1)",color:dynScoreStatus.startsWith("ERROR") ? "var(--red)" : "var(--green)",lineHeight:1.5}}>
                    {dynScoreStatus}
                  </div>
                )}
              </div>

              {/* == FRED Macro Regime - Lagging Indicator == */}
              <div style={{background:"var(--bg2)",border:"1px solid rgba(59,158,255,0.3)",borderRadius:"6px",padding:"14px 16px"}}>
                <div style={{fontFamily:"sans-serif",fontWeight:700,fontSize:"12px",color:"var(--blue)",letterSpacing:"0.07em",marginBottom:"6px"}}>MOTOR MACRO FRED (LAGGING INDICATOR)</div>
                <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:1.6,marginBottom:"10px"}}>
                  Importa el archivo <code style={{background:"var(--bg3)",padding:"1px 4px",borderRadius:"2px"}}>macro_regime_output.csv</code> generado por el pipeline Python.<br/>
                  Columnas requeridas: <code style={{background:"var(--bg3)",padding:"1px 4px",borderRadius:"2px"}}>cuadrante, prob_crecimiento, prob_estanflacion, prob_defensivo, prob_valor</code>
                </div>
                <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap",marginBottom:"8px"}}>
                  <input type="file" accept=".csv"
                    onChange={e => importFredCSV(e.target.files?.[0])}
                    style={{flex:1,minWidth:"200px",background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"10px",fontFamily:"inherit",cursor:"pointer"}}
                  />
                  {fredRegime && (
                    <button
                      onClick={async () => { setFredRegime(null); await window.storage.delete("fred:regime", true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); }); setFredImportStatus("FRED eliminado."); }}
                      style={{background:"none",border:"1px solid rgba(255,59,92,0.3)",color:"var(--red)",borderRadius:"4px",padding:"5px 10px",fontSize:"9px",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}
                    >Limpiar</button>
                  )}
                </div>
                {fredImportStatus && (
                  <div style={{fontSize:"10px",padding:"6px 10px",borderRadius:"4px",background:fredImportStatus.startsWith("ERROR") ? "rgba(255,59,92,0.1)" : "rgba(0,217,100,0.1)",color:fredImportStatus.startsWith("ERROR") ? "var(--red)" : "var(--green)",lineHeight:1.5}}>
                    {fredImportStatus}
                  </div>
                )}
              </div>

              {/* == Motor ROC 252d - Importacion de Historial == */}
              <div style={{background:"var(--bg2)",border:"1px solid rgba(59,158,255,0.3)",borderRadius:"6px",padding:"14px 16px"}}>
                <div style={{fontFamily:"sans-serif",fontWeight:700,fontSize:"12px",color:"var(--blue)",letterSpacing:"0.07em",marginBottom:"6px"}}>MOTOR ROC 252d - HISTORIAL SPY / DBC</div>
                <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:1.6,marginBottom:"12px"}}>
                  Requiere >=252 sesiones de SPY y DBC para activar los Cuatro Cuadrantes de Dalio (ROC 252 dias puro).<br/>
                  Descarga los CSV historicos desde Yahoo Finance: <span style={{color:"var(--amber)"}}>SPY</span> (S&P 500 proxy) y <span style={{color:"var(--amber)"}}>DBC</span> (Invesco DB Commodity Index).<br/>
                  Columnas requeridas: <code style={{background:"var(--bg3)",padding:"1px 4px",borderRadius:"2px"}}>Date, Close</code> (o Fecha, Cierre). Yahoo Finance exporta este formato directamente.
                </div>
                <div style={{display:"flex",gap:"10px",flexWrap:"wrap",marginBottom:"10px"}}>
                  <div style={{flex:1,minWidth:"180px"}}>
                    <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em",marginBottom:"4px"}}>SPY - S&P 500 PROXY ({rocHistory.spy.length} registros{rocHistory.spy.length >= 252 ? " OK" : ` - faltan ${252 - rocHistory.spy.length}`})</div>
                    <input type="file" accept=".csv"
                      onChange={e => importRocCSV(e.target.files?.[0], "spy")}
                      style={{width:"100%",background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"10px",fontFamily:"inherit",cursor:"pointer"}}
                    />
                  </div>
                  <div style={{flex:1,minWidth:"180px"}}>
                    <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em",marginBottom:"4px"}}>DBC - COMMODITIES PROXY ({rocHistory.dbc.length} registros{rocHistory.dbc.length >= 252 ? " OK" : ` - faltan ${252 - rocHistory.dbc.length}`})</div>
                    <input type="file" accept=".csv"
                      onChange={e => importRocCSV(e.target.files?.[0], "dbc")}
                      style={{width:"100%",background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"10px",fontFamily:"inherit",cursor:"pointer"}}
                    />
                  </div>
                </div>
                {rocImportStatus && (
                  <div style={{fontSize:"10px",padding:"6px 10px",borderRadius:"4px",background:rocImportStatus.startsWith("ERROR") ? "rgba(255,59,92,0.1)" : "rgba(0,217,100,0.1)",color:rocImportStatus.startsWith("ERROR") ? "var(--red)" : "var(--green)",lineHeight:1.5}}>
                    {rocImportStatus}
                  </div>
                )}
                {rocHistory.spy.length >= 252 && rocHistory.dbc.length >= 252 && (
                  <button
                    onClick={async () => { await window.storage.delete("roc:history", true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); }); setRocHistory({spy:[],dbc:[]}); setRocImportStatus("Historial ROC eliminado."); }}
                    style={{marginTop:"8px",background:"none",border:"1px solid rgba(255,59,92,0.3)",color:"var(--red)",borderRadius:"4px",padding:"4px 10px",fontSize:"9px",fontFamily:"inherit",cursor:"pointer"}}
                  >
                    Limpiar historial ROC
                  </button>
                )}
              </div>

              {/* Calibracion Z-Score */}
              <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"16px",marginBottom:"12px"}}>
                <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"8px"}}>CALIBRACION Z-SCORE (TRIM SISTEMICO)</div>
                <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"10px",lineHeight:1.6}}>
                  Carga los archivos historicos o ingresa los parametros manualmente.
                  {zsParams?.calibrado && <span style={{color:"var(--green)",marginLeft:"8px"}}>OK Calibrado ({zsParams.calibrado}) - VIX μ={zsParams.mu_vix?.toFixed(2)} sigma={zsParams.sigma_vix?.toFixed(2)} | MOVE μ={zsParams.mu_move?.toFixed(2)} sigma={zsParams.sigma_move?.toFixed(2)}</span>}
                </div>

                {/* Ingreso manual - no depende de storage ni de file upload */}
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"flex-end",marginBottom:"10px"}}>
                  {[["μ VIX",calMv,setCalMv],["sigma VIX",calSv,setCalSv],["μ MOVE",calMm,setCalMm],["sigma MOVE",calSm,setCalSm]].map(([label,val,setter])=>(
                    <div key={label}>
                      <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>{label}</div>
                      <input type="number" step="0.01" value={val} onChange={e=>setter(e.target.value)}
                        style={{width:"72px",background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"11px",fontFamily:"inherit"}}/>
                    </div>
                  ))}
                  <button onClick={async () => {
                    const params = { mu_vix: parseFloat(calMv), sigma_vix: parseFloat(calSv), mu_move: parseFloat(calMm), sigma_move: parseFloat(calSm), calibrado: new Date().toISOString().slice(0,10) };
                    if ([params.mu_vix, params.sigma_vix, params.mu_move, params.sigma_move].some(isNaN)) { alert("Todos los campos deben ser numeros validos."); return; }
                    setZsParams(params);
                    window.storage.set("zscore:params", JSON.stringify(params), true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
                  }} style={{background:"var(--amber)",color:"#0a0b0f",border:"none",borderRadius:"4px",padding:"7px 14px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>
                    APLICAR
                  </button>
                </div>

                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  {/* == Handler VIX (FRED VIXCLS.csv) == */}
                  <div style={{position:"relative",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"4px",padding:"7px 12px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",color:"var(--muted)"}}>
                    📂 VIX (VIXCLS.csv)
                    <input type="file" accept=".csv" style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",opacity:0,cursor:"pointer"}} onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      console.log("VIX 1. Evento onChange disparado, archivo:", file.name, "tamano:", file.size, "bytes");
                      try {
                        const text = await file.text();
                        console.log("VIX 2. FileReader termino. Primeros 150 caracteres:", text.substring(0, 150));

                        const rawLines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l);
                        console.log("VIX 2b. Lineas totales despues de split:", rawLines.length, "| Linea 0:", rawLines[0], "| Linea 1:", rawLines[1]);
                        if (rawLines.length < 2) throw new Error("Archivo vacio o sin datos. Lineas detectadas: " + rawLines.length);

                        const headerRaw = rawLines[0].split(',').map(h => h.replace(/"/g,'').trim().toUpperCase());
                        console.log("VIX 3. Headers detectados:", headerRaw);

                        const idxDate  = headerRaw.findIndex(h => h === 'DATE' || h === 'OBSERVATION_DATE' || h === 'FECHA');
                        const idxValue = headerRaw.findIndex(h => h === 'VIXCLS' || h === 'VIX'  || h === 'CLOSE' || h === 'ULTIMO' || h === 'PRICE');
                        console.log("VIX 3b. Indice columna fecha:", idxDate, "| Indice columna valor:", idxValue);
                        if (idxDate  === -1) throw new Error("Columna de fecha no encontrada. Aceptados: DATE, OBSERVATION_DATE, FECHA. Headers detectados: " + headerRaw.join(', '));
                        if (idxValue === -1) throw new Error("Columna de valor no encontrada. Aceptados: VIXCLS, VIX, CLOSE, PRICE. Headers detectados: " + headerRaw.join(', '));

                        const parsed = [];
                        // Log de la primera fila de datos para diagnostico
                        if (rawLines.length > 1) {
                          const debugParts = rawLines[1].split(',');
                          const debugD = debugParts[idxDate]?.replace(/"/g,'').trim();
                          const debugV = debugParts[idxValue]?.replace(/"/g,'').trim();
                          const debugN = parseFloat(debugV);
                          console.log("VIX 4. Fila 1 Raw:", rawLines[1], "| Fecha extraida:", debugD, "| Valor extraido:", debugV, "| parseFloat:", debugN);
                        }

                        for (let i = 1; i < rawLines.length; i++) {
                          const parts = rawLines[i].split(',');
                          const d = parts[idxDate]?.replace(/"/g,'').trim();
                          const v = parts[idxValue]?.replace(/"/g,'').trim();
                          if (!d || !v || v === '.' || v === '') continue;
                          const n = parseFloat(v);
                          if (isNaN(n) || n <= 0 || n > 200) continue;
                          parsed.push({ date: d, value: n });
                        }
                        console.log("VIX 5. Registros validos despues de filtrado:", parsed.length, "| Primero:", parsed[0], "| Ultimo:", parsed[parsed.length-1]);
                        if (parsed.length === 0) throw new Error("El filtrado dejo el array en 0. Revisar regex de headers o formato de celdas. Header detectado en idx " + idxValue + ": '" + headerRaw[idxValue] + "'");
                        if (parsed.length < 10) throw new Error("Solo se parsearon " + parsed.length + " registros validos. Minimo requerido: 10. Verifica el formato del archivo.");

                        // Recorte explicito a 252 registros justo antes de persistir - evita 409 Conflict en storage
                        const sample = parsed.slice(-252);
                        const vals   = sample.map(x => x.value);
                        const mu     = vals.reduce((a,b) => a+b, 0) / vals.length;
                        const sigma  = Math.sqrt(vals.reduce((a,b) => a+(b-mu)**2, 0) / vals.length);
                        const updated = { ...(zsParams||{}), mu_vix: mu, sigma_vix: sigma, calibrado: new Date().toISOString().slice(0,10) };
                        console.log("VIX 6. Stats calculados: μ=", mu.toFixed(3), "sigma=", sigma.toFixed(3), "| Sample size:", sample.length, "| JSON size:", JSON.stringify(sample).length, "bytes");

                        // Objeto final inmutable - calibrado garantizado como propiedad propia, nunca heredada del spread
                        const paramsToSave = {
                          mu_vix:     mu,
                          sigma_vix:  sigma,
                          mu_move:    zsParams?.mu_move    ?? null,
                          sigma_move: zsParams?.sigma_move ?? null,
                          calibrado:  new Date().toISOString().slice(0, 10),
                        };
                        const paramsJson = JSON.stringify(paramsToSave);
                        console.log("VIX 7. paramsToSave:", paramsJson);
                        console.log("VIX 7. Bytes a escribir:", paramsJson.length, "| Clave: zscore:params");
                        try { await window.storage.delete("zscore:params", true); } catch(e) { /* 404 ignorado */ }
                        let r1 = null;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                          try {
                            r1 = await window.storage.set("zscore:params", paramsJson, true);
                            console.log("VIX 7b. Intento", attempt, "resultado:", r1);
                            if (r1) break;
                          } catch(e) {
                            console.warn("VIX 7b. Intento", attempt, "fallo:", e?.message);
                            if (attempt < 3) await new Promise(res => setTimeout(res, 600 * attempt));
                          }
                        }
                        if (!r1) throw new Error("Storage rechazo zscore:params tras 3 intentos");

                        setZsParams(paramsToSave);
                        console.log("VIX 8. setZsParams ejecutado. Proceso completo.");
                        alert("OK VIX: " + sample.length + " registros cargados.\nμ=" + mu.toFixed(2) + " sigma=" + sigma.toFixed(2) + "\nCalibracion: " + paramsToSave.calibrado);
                      } catch(err) {
                        console.error("VIX Falla fatal:", err);
                        alert("ERROR VIX: " + err.message);
                      }
                      e.target.value = "";
                    }}/>
                  </div>

                  {/* == Handler MOVE (Investing.com .csv) == */}
                  <div style={{position:"relative",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"4px",padding:"7px 12px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",color:"var(--text)"}}>
                    📂 MOVE (Investing.com .csv)
                    <input type="file" accept=".csv" style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",opacity:0,cursor:"pointer"}} onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      console.log("MOVE 1. Evento onChange disparado, archivo:", file.name, "tamano:", file.size, "bytes");
                      try {
                        const text = await file.text();
                        console.log("MOVE 2. FileReader termino. Primeros 150 caracteres:", text.substring(0, 150));

                        const rawLines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l);
                        console.log("MOVE 2b. Lineas totales:", rawLines.length, "| Linea 0:", rawLines[0], "| Linea 1:", rawLines[1]);
                        if (rawLines.length < 2) throw new Error("Archivo vacio o sin datos. Lineas detectadas: " + rawLines.length);

                        const headerRaw = rawLines[0].split(',').map(h => h.replace(/"/g,'').trim().toUpperCase());
                        console.log("MOVE 3. Headers detectados:", headerRaw);

                        const idxDate  = headerRaw.findIndex(h => h === 'DATE' || h === 'FECHA' || h === 'OBSERVATION_DATE');
                        const idxPrice = headerRaw.findIndex(h =>
                          h === 'PRICE' || h === 'ULTIMO' || h === 'ÚLTIMO' || h === 'ÚLTIMO' ||
                          h === 'CLOSE' || h === 'CIERRE' || h === 'LAST'
                        );
                        console.log("MOVE 3b. Indice columna fecha:", idxDate, "| Indice columna precio:", idxPrice);
                        if (idxDate  === -1) throw new Error("Columna de fecha no encontrada. Esperado: 'Date' o 'Fecha'. Headers detectados: " + headerRaw.join(', '));
                        if (idxPrice === -1) throw new Error("Columna de precio no encontrada. Esperado: 'Price' o 'Ultimo'. Headers detectados: " + headerRaw.join(', '));

                        const normalizeDate = (raw) => {
                          const s = raw.replace(/"/g,'').trim();
                          const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                          if (dmyMatch) {
                            const [, a, b, y] = dmyMatch;
                            return y + '-' + b.padStart(2,'0') + '-' + a.padStart(2,'0');
                          }
                          const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                          if (mdyMatch) {
                            const [, m, d, y] = mdyMatch;
                            return y + '-' + m.padStart(2,'0') + '-' + d.padStart(2,'0');
                          }
                          return s;
                        };

                        // Log fila 1 cruda antes de procesar
                        if (rawLines.length > 1) {
                          const debugParts = rawLines[1].split(',');
                          const debugD = debugParts[idxDate]?.replace(/"/g,'').trim();
                          const debugP = debugParts[idxPrice]?.replace(/"/g,'').trim();
                          console.log("MOVE 4. Fila 1 Raw:", rawLines[1], "| Fecha extraida:", debugD, "-> normalizada:", normalizeDate(debugD||''), "| Precio extraido:", debugP);
                        }

                        const parsed = [];
                        for (let i = 1; i < rawLines.length; i++) {
                          const parts    = rawLines[i].split(',');
                          const rawDate  = parts[idxDate]?.replace(/"/g,'').trim();
                          const rawPrice = parts[idxPrice]?.replace(/"/g,'').trim();
                          if (!rawDate || !rawPrice || rawPrice === '' || rawPrice === '-') continue;
                          let cleanPrice = rawPrice;
                          const hasDot   = cleanPrice.includes('.');
                          const hasComma = cleanPrice.includes(',');
                          if (hasDot && hasComma) {
                            if (cleanPrice.lastIndexOf(',') > cleanPrice.lastIndexOf('.')) {
                              cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
                            } else {
                              cleanPrice = cleanPrice.replace(/,/g, '');
                            }
                          } else if (hasComma) {
                            cleanPrice = cleanPrice.replace(',', '.');
                          }
                          const n = parseFloat(cleanPrice);
                          if (isNaN(n) || n < 10 || n > 1000) continue;
                          parsed.push({ date: normalizeDate(rawDate), value: n });
                        }
                        console.log("MOVE 5. Registros validos despues de filtrado:", parsed.length, "| Primero:", parsed[0], "| Ultimo:", parsed[parsed.length-1]);
                        if (parsed.length === 0) throw new Error("El filtrado dejo el array en 0. Revisar regex de headers o formato de celdas. Header en idx " + idxPrice + ": '" + headerRaw[idxPrice] + "'");
                        if (parsed.length < 10) throw new Error("Solo se parsearon " + parsed.length + " registros validos. Minimo requerido: 10. Headers: " + headerRaw.join(', '));

                        parsed.sort((a,b) => a.date.localeCompare(b.date));
                        // Recorte explicito a 252 registros justo antes de persistir - evita 409 Conflict en storage
                        const sample = parsed.slice(-252);
                        const vals   = sample.map(x => x.value);
                        const mu     = vals.reduce((a,b) => a+b, 0) / vals.length;
                        const sigma  = Math.sqrt(vals.reduce((a,b) => a+(b-mu)**2, 0) / vals.length);
                        const updated = { ...(zsParams||{}), mu_move: mu, sigma_move: sigma, calibrado: new Date().toISOString().slice(0,10) };
                        console.log("MOVE 6. Stats calculados: μ=", mu.toFixed(3), "sigma=", sigma.toFixed(3), "| Sample size:", sample.length, "| JSON size:", JSON.stringify(sample).length, "bytes");

                        // Objeto final inmutable - calibrado garantizado como propiedad propia, nunca heredada del spread
                        const paramsToSave = {
                          mu_vix:     zsParams?.mu_vix    ?? null,
                          sigma_vix:  zsParams?.sigma_vix ?? null,
                          mu_move:    mu,
                          sigma_move: sigma,
                          calibrado:  new Date().toISOString().slice(0, 10),
                        };
                        const paramsJson = JSON.stringify(paramsToSave);
                        console.log("MOVE 7. paramsToSave:", paramsJson);
                        console.log("MOVE 7. Bytes a escribir:", paramsJson.length, "| Clave: zscore:params");
                        // delete + set con reintento: el 409 ocurre cuando el backend
                        // aun no confirmo una escritura previa en la misma clave (e.g. VIX)
                        try { await window.storage.delete("zscore:params", true); } catch(e) { /* 404 ignorado */ }
                        let r1 = null;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                          try {
                            r1 = await window.storage.set("zscore:params", paramsJson, true);
                            console.log("MOVE 7b. Intento", attempt, "resultado:", r1);
                            if (r1) break;
                          } catch(e) {
                            console.warn("MOVE 7b. Intento", attempt, "fallo:", e?.message);
                            if (attempt < 3) await new Promise(res => setTimeout(res, 600 * attempt));
                          }
                        }
                        if (!r1) throw new Error("Storage rechazo zscore:params tras 3 intentos");

                        setZsParams(paramsToSave);
                        console.log("MOVE 8. setZsParams ejecutado. Proceso completo.");
                        alert("OK MOVE: " + sample.length + " registros cargados.\nμ=" + mu.toFixed(2) + " sigma=" + sigma.toFixed(2) + "\nCalibracion: " + paramsToSave.calibrado);
                      } catch(err) {
                        console.error("MOVE Falla fatal:", err);
                        alert("ERROR MOVE: " + err.message);
                      }
                      e.target.value = "";
                    }}/>
                  </div>

                  {zsParams?.calibrado && (
                    <button onClick={async () => {
                      await window.storage.delete("zscore:params",    true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
                      setZsParams(null);
                    }} style={{background:"none",border:"1px solid var(--border2)",color:"var(--muted)",borderRadius:"4px",padding:"7px 12px",fontSize:"10px",fontFamily:"inherit",cursor:"pointer"}}>
                      Resetear
                    </button>
                  )}
                </div>
              </div>

              {/* Historial */}
              <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px"}}>
                <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"16px"}}>HISTORIAL</div>

                {/* Actualizacion en segundo plano */}
                <div style={{marginBottom:"16px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px"}}>
                  <style>{`@keyframes pulseCalmo{0%,100%{opacity:.35}50%{opacity:1}}`}</style>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"10px"}}>ACTUALIZAR DATOS</div>

                  <button onClick={()=>lanzarActualizacion("snapshots")} disabled={!!jobEstado.snapshots?.corriendo} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",background:jobEstado.snapshots?.corriendo?"var(--bg3)":"rgba(245,158,11,0.15)",color:jobEstado.snapshots?.corriendo?"var(--muted)":"var(--amber)",border:"1px solid "+(jobEstado.snapshots?.corriendo?"var(--border2)":"rgba(245,158,11,0.4)"),borderRadius:"4px",padding:"9px",fontWeight:700,fontFamily:"inherit",fontSize:"10px",cursor:jobEstado.snapshots?.corriendo?"not-allowed":"pointer",letterSpacing:"0.06em"}}>
                    {jobEstado.snapshots?.corriendo && <span style={{display:"inline-block",width:"6px",height:"6px",borderRadius:"50%",background:"var(--amber)",animation:"pulseCalmo 2.5s ease-in-out infinite"}}/>}
                    {jobEstado.snapshots?.corriendo ? "ACTUALIZANDO DESDE "+(jobEstado.snapshots.inicio||"").slice(0,5) : "ACTUALIZAR SNAPSHOTS"}
                  </button>
                  {jobEstado.snapshots?.corriendo && jobEstado.snapshots?.salida && (
                    <pre style={{fontSize:"9px",color:"var(--muted)",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"4px",padding:"6px 8px",marginTop:"6px",fontFamily:"monospace",whiteSpace:"pre-wrap",lineHeight:1.5}}>{jobEstado.snapshots.salida.trim().split("\n").slice(-4).join("\n")}</pre>
                  )}
                  <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"5px",marginBottom:"10px"}}>Conviene despues del cierre de Wall Street.</div>
                  {jobMsg.snapshots && (
                    <div style={{fontSize:"10px",marginBottom:"10px",padding:"7px 10px",borderRadius:"4px",background:"var(--bg2)",color:jobMsg.snapshots.startsWith("OK")?"var(--green)":jobMsg.snapshots.startsWith("ERROR")?"var(--red)":"var(--muted)",borderLeft:"2px solid "+(jobMsg.snapshots.startsWith("OK")?"var(--green)":jobMsg.snapshots.startsWith("ERROR")?"var(--red)":"var(--muted)")}}>
                      {jobMsg.snapshots}
                      {jobErrSalida.snapshots && (
                        <details style={{marginTop:"6px"}}>
                          <summary style={{cursor:"pointer",color:"var(--muted)",fontSize:"9px"}}>Ver detalle</summary>
                          <pre style={{whiteSpace:"pre-wrap",fontSize:"9px",color:"var(--muted)",marginTop:"6px",fontFamily:"inherit"}}>{jobErrSalida.snapshots}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  <button onClick={()=>lanzarActualizacion("mercado_argentino")} disabled={!!jobEstado.mercado_argentino?.corriendo} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",background:jobEstado.mercado_argentino?.corriendo?"var(--bg3)":"rgba(59,158,255,0.15)",color:jobEstado.mercado_argentino?.corriendo?"var(--muted)":"var(--blue)",border:"1px solid "+(jobEstado.mercado_argentino?.corriendo?"var(--border2)":"rgba(59,158,255,0.3)"),borderRadius:"4px",padding:"9px",fontWeight:700,fontFamily:"inherit",fontSize:"10px",cursor:jobEstado.mercado_argentino?.corriendo?"not-allowed":"pointer",letterSpacing:"0.06em"}}>
                    {jobEstado.mercado_argentino?.corriendo && <span style={{display:"inline-block",width:"6px",height:"6px",borderRadius:"50%",background:"var(--blue)",animation:"pulseCalmo 2.5s ease-in-out infinite"}}/>}
                    {jobEstado.mercado_argentino?.corriendo ? "ACTUALIZANDO DESDE "+(jobEstado.mercado_argentino.inicio||"").slice(0,5) : "ACTUALIZAR MERCADO ARGENTINO"}
                  </button>
                  {jobEstado.mercado_argentino?.corriendo && jobEstado.mercado_argentino?.salida && (
                    <pre style={{fontSize:"9px",color:"var(--muted)",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"4px",padding:"6px 8px",marginTop:"6px",fontFamily:"monospace",whiteSpace:"pre-wrap",lineHeight:1.5}}>{jobEstado.mercado_argentino.salida.trim().split("\n").slice(-4).join("\n")}</pre>
                  )}
                  {jobMsg.mercado_argentino && (
                    <div style={{fontSize:"10px",marginTop:"10px",padding:"7px 10px",borderRadius:"4px",background:"var(--bg2)",color:jobMsg.mercado_argentino.startsWith("OK")?"var(--green)":jobMsg.mercado_argentino.startsWith("ERROR")?"var(--red)":"var(--muted)",borderLeft:"2px solid "+(jobMsg.mercado_argentino.startsWith("OK")?"var(--green)":jobMsg.mercado_argentino.startsWith("ERROR")?"var(--red)":"var(--muted)")}}>
                      {jobMsg.mercado_argentino}
                      {jobErrSalida.mercado_argentino && (
                        <details style={{marginTop:"6px"}}>
                          <summary style={{cursor:"pointer",color:"var(--muted)",fontSize:"9px"}}>Ver detalle</summary>
                          <pre style={{whiteSpace:"pre-wrap",fontSize:"9px",color:"var(--muted)",marginTop:"6px",fontFamily:"inherit"}}>{jobErrSalida.mercado_argentino}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>

                {dates.length===0?<div style={{color:"var(--muted)",fontSize:"11px"}}>Sin snapshots.</div>:(
                  <div style={{display:"flex",flexDirection:"column"}}>
                    {[...dates].reverse().map(d=>(
                      <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 10px",borderBottom:"1px solid var(--border)",background:d===selDate?"var(--bg3)":"transparent"}}>
                        <div style={{display:"flex",gap:"10px",alignItems:"center",flex:1,minWidth:0}}>
                          <span style={{color:d===selDate?"var(--amber)":"var(--text)",cursor:"pointer",fontWeight:d===selDate?600:400,whiteSpace:"nowrap"}} onClick={()=>{setSelDate(d);setTab("dashboard");setPage(0);}}>{d}</span>
                          <span style={{color:"var(--muted)",fontSize:"10px",whiteSpace:"nowrap"}}>{snapshots[d]?.tickers?.length}T</span>
                          {snapshots[d]?.market?.sp500&&<span style={{fontSize:"10px",color:pc(snapshots[d].market.sp500.change_pct),whiteSpace:"nowrap"}}>S&P {fmtPct(snapshots[d].market.sp500.change_pct)}</span>}
                          {snapshots[d]?.note&&<span style={{color:"var(--muted)",fontSize:"10px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>- {snapshots[d].note}</span>}
                        </div>
                        <button className="DB" onClick={()=>delSnap(d)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"11px",fontFamily:"inherit",padding:"2px 6px",flexShrink:0}}>x</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Transferir datos */}
                <div style={{marginTop:"14px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px"}}>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>EXPORTAR BACKUP</div>
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"8px",lineHeight:1.6}}>Genera el JSON con todos los snapshots cargados. Copialo y guardalo en un archivo de texto para no perder los datos.</div>
                  <button onClick={exportSnapshots} style={{width:"100%",background:"rgba(59,158,255,0.15)",color:"var(--blue)",border:"1px solid rgba(59,158,255,0.3)",borderRadius:"4px",padding:"9px",fontWeight:700,fontFamily:"inherit",fontSize:"10px",cursor:"pointer",letterSpacing:"0.06em",marginBottom:"8px"}}>
                    💾 GENERAR BACKUP ({Object.keys(snapshots).length} snapshot{Object.keys(snapshots).length!==1?"s":""})
                  </button>
                  <button onClick={exportMasterScoresCSV} style={{width:"100%",background:"rgba(0,217,100,0.1)",color:"var(--green)",border:"1px solid rgba(0,217,100,0.3)",borderRadius:"4px",padding:"9px",fontWeight:700,fontFamily:"inherit",fontSize:"10px",cursor:"pointer",letterSpacing:"0.06em",marginBottom:"8px"}} title="Exporta masterPctRaw historico para IC test / Fama-MacBeth">
                    📊 EXPORTAR MASTER SCORES (IC TEST)
                  </button>
                  {showExport && exportJson && (
                    <div style={{marginBottom:"12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                        <span style={{fontSize:"9px",color:"var(--muted)"}}>Selecciona todo y copia (Ctrl+A, Ctrl+C):</span>
                        <button onClick={()=>{
                          const ta = document.getElementById("export-textarea");
                          if (ta) { ta.select(); try { document.execCommand("copy"); } catch(e) { navigator.clipboard?.writeText(exportJson); } }
                        }} style={{background:"var(--amber)",color:"#0a0b0f",border:"none",borderRadius:"3px",padding:"3px 10px",fontWeight:700,fontFamily:"inherit",fontSize:"9px",cursor:"pointer"}}>COPIAR TODO</button>
                      </div>
                      <textarea id="export-textarea" readOnly value={exportJson} onClick={e=>e.target.select()} style={{width:"100%",height:"120px",background:"var(--bg2)",border:"1px solid var(--blue)",color:"var(--text)",borderRadius:"4px",padding:"6px",fontSize:"9px",fontFamily:"monospace",resize:"vertical",cursor:"text"}}/>
                      <div style={{fontSize:"9px",color:"var(--green)",marginTop:"4px"}}>OK {Object.keys(snapshots).length} snapshots listos para copiar</div>
                    </div>
                  )}

                  <div style={{borderTop:"1px solid var(--border)",paddingTop:"10px",marginTop:"6px"}}>
                    <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>IMPORTAR DATOS</div>
                    <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"10px",lineHeight:1.6}}>
                      Selecciona el archivo .json generado por GENERAR BACKUP. Usa Chrome o Brave en movil - la app nativa de Claude bloquea el acceso a archivos.
                    </div>
                    <div style={{position:"relative",background:"rgba(0,217,100,0.1)",border:"1px solid rgba(0,217,100,0.3)",borderRadius:"4px",padding:"13px",textAlign:"center"}}>
                      <span style={{color:"var(--green)",fontSize:"11px",fontWeight:700,letterSpacing:"0.05em",fontFamily:"inherit",pointerEvents:"none"}}>📂 SELECCIONAR BACKUP .JSON</span>
                      <input type="file" accept=".json,.txt,text/plain" onChange={handleBackupFileImport} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",opacity:0,cursor:"pointer"}}/>
                    </div>
                    {importStatus&&<div style={{marginTop:"8px",fontSize:"10px",fontWeight:600,padding:"6px 10px",borderRadius:"4px",background:"var(--bg3)",color:importStatus.startsWith("OK")?"var(--green)":importStatus.startsWith("ERROR")?"var(--red)":"var(--amber)"}}>{importStatus}</div>}
                  </div>
                </div>

                {/* Universo Sectorial Fijo */}
                <div style={{marginTop:"10px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px"}}>
                  <div style={{fontSize:"10px",fontWeight:600,color:"rgba(165,180,252,0.9)",letterSpacing:"0.08em",marginBottom:"4px"}}>UNIVERSO SECTORIAL FIJO</div>
                  <div style={{fontSize:"9px",color: sectorUniverse ? "rgba(52,211,153,0.9)" : "var(--muted)",marginBottom:"8px",lineHeight:1.6}}>
                    {universeStatus || (sectorUniverse
                      ? `OK Cargado: ${Object.keys(sectorUniverse.sectores||{}).length} sectores - ref: ${sectorUniverse.fecha_ref_data||sectorUniverse.generado||'?'}`
                      : "Sin cargar - Z-score sectorial usa universo de sesion.")}
                  </div>
                  <label htmlFor="universe-input" style={{display:"block",position:"relative",background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.35)",borderRadius:"4px",padding:"8px",textAlign:"center",cursor:"pointer"}}>
                    <span style={{color:"rgba(165,180,252,0.9)",fontSize:"11px",fontWeight:700,letterSpacing:"0.05em",fontFamily:"inherit",pointerEvents:"none"}}>
                      📦 {sectorUniverse ? "REEMPLAZAR UNIVERSO" : "CARGAR UNIVERSO .JSON"}
                    </span>
                    <input type="file" accept=".json" id="universe-input" style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",opacity:0,cursor:"pointer"}}
                      onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => {
                          try {
                            const data = JSON.parse(ev.target.result);
                            if (!data?.sectores) { alert('JSON invalido: falta campo "sectores"'); return; }
                            setSectorUniverse(data);
                            const n = Object.keys(data.sectores).length;
                            const f = data.fecha_ref_data || data.generado || '?';
                            setUniverseStatus(`OK ${n} sectores cargados (ref: ${f})`);
                            console.log("[UNIVERSO] Cargado OK:", n, "sectores, ref:", f);
                            // Persistir en storage para restaurar automaticamente en proximas sesiones
                            window.storage.set('sector_universe_ref:data', JSON.stringify(data), false)
                              .then(() => console.log('[UNIVERSO] Guardado en storage OK'))
                              .catch(e => console.warn('[UNIVERSO] Error guardando en storage:', e.message));
                          } catch(err) {
                            setUniverseStatus("✗ Error: " + err.message);
                            console.error("[UNIVERSO] Error:", err);
                          }
                        };
                        reader.readAsText(file); e.target.value = '';
                      }} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="mercadoarg" && (
          <div>
            <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>MERCADO ARGENTINO</div>
            <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"16px"}}>Bonos, dolar MEP y dolar futuro. Datos propios - no tocan el Radar.</div>

            {mercadoFotoErr && (
              <div style={{background:"var(--bg2)",border:"1px solid rgba(255,59,92,0.3)",borderRadius:"6px",padding:"16px",marginBottom:"16px"}}>
                <div style={{color:"var(--red)",fontSize:"11px",marginBottom:"8px"}}>{mercadoFotoErr}</div>
                <button onClick={cargarMercadoArgentino} style={{background:"var(--bg3)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 14px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.06em"}}>REINTENTAR</button>
              </div>
            )}

            {mercadoFotoLoading && !mercadoFoto && (
              <div style={{color:"var(--muted)",fontSize:"11px",padding:"20px"}}>Cargando...</div>
            )}

            {mercadoFoto && (
              <div>
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px",marginBottom:"16px"}}>
                  <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"4px"}}>DOLAR MEP (AL30)</div>
                  <div style={{fontSize:"32px",fontWeight:700,color:"var(--text)",fontFamily:"sans-serif"}}>${fmt(mercadoFoto.mep_al30,2)}</div>
                  <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"4px"}}>Foto del {mercadoFoto.fecha}</div>
                  {fotoEsVieja && (
                    <div style={{marginTop:"10px",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:"4px",padding:"8px 12px",color:"var(--amber)",fontSize:"10px"}}>
                      Datos viejos - apreta "Actualizar mercado argentino" (pestana CARGAR) y corre la foto de nuevo.
                    </div>
                  )}
                </div>

                {(mercadoFoto.regla_riesgo || mercadoFoto.costos_texto) && (
                  <div style={{marginBottom:"12px"}}>
                    {mercadoFoto.costos_texto && (
                      <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:1.6,marginBottom:mercadoFoto.regla_riesgo?"6px":0}}>
                        {mercadoFoto.broker && <span style={{color:"var(--text)",fontWeight:600}}>{mercadoFoto.broker}: </span>}
                        {mercadoFoto.costos_texto}
                      </div>
                    )}
                    {mercadoFoto.regla_riesgo && (
                      <span onClick={()=>setMostrarReglaRiesgo(v=>!v)} style={{color:"var(--muted)",fontSize:"10px",textDecoration:"underline",cursor:"pointer"}}>¿como se calcula el riesgo?</span>
                    )}
                    {mercadoFoto.regla_riesgo && mostrarReglaRiesgo && (
                      <div style={{marginTop:"8px",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"4px",padding:"10px 12px",fontSize:"10px",color:"var(--text)",lineHeight:1.6}}>{mercadoFoto.regla_riesgo}</div>
                    )}
                  </div>
                )}

                <TablaBonos titulo="BONOS EN DOLARES" subtitulo={mercadoFoto.naturaleza?.soberanos_usd} items={mercadoFoto.soberanos_usd} tirLeyenda="rendimiento anual en dolares" />
                <TablaBonos titulo="BONOS QUE AJUSTAN POR INFLACION" subtitulo={mercadoFoto.naturaleza?.cer_pesos} items={mercadoFoto.cer_pesos} tirLeyenda="rendimiento anual por encima de la inflacion" tirEsGanaInflacion />

                <TablaBonos titulo="ONS EN DOLARES (DEUDA DE EMPRESAS)" subtitulo={mercadoFoto.naturaleza?.ons_usd} items={mercadoFoto.ons_usd} tirLeyenda="rendimiento anual en dolares" mostrarEmisor emptyText="Lista de ONs sin curar todavia." />

                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px",marginBottom:"16px"}}>
                  <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"12px"}}>DOLAR FUTURO</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
                      <thead>
                        <tr style={{background:"var(--bg3)",borderBottom:"1px solid var(--border2)"}}>
                          <th style={{padding:"7px 8px",textAlign:"left",color:"var(--muted)",fontSize:"10px"}}>CONTRATO</th>
                          <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>PRECIO</th>
                          <th style={{padding:"7px 8px",textAlign:"left",color:"var(--muted)",fontSize:"10px"}}>VENCIMIENTO</th>
                          <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>DEVALUACION ANUAL<br/><span style={{fontWeight:400,fontSize:"8px"}}>que descuenta el mercado</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(mercadoFoto.futuros_dlr||[]).map((f,i)=>{
                          const corto = f.dias!=null && f.dias<30;
                          return (
                            <tr key={(f.contrato||"")+i} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg)":"var(--bg2)",opacity:corto?0.5:1}}>
                              <td style={{padding:"5px 8px",color:"var(--text)"}}>{f.contrato}</td>
                              <td style={{padding:"5px 8px",textAlign:"right",color:"var(--text)"}}>{fmt(f.precio,2)}</td>
                              <td style={{padding:"5px 8px",color:"var(--muted)"}}>
                                {f.vencimiento_aprox}
                                {corto && <div style={{fontSize:"8px",color:"var(--amber)"}}>muy corto para anualizar</div>}
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"right",color:pc(f.deval_anual_implicita_pct)}}>{fmtPct(f.deval_anual_implicita_pct)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px"}}>
                  <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"12px"}}>DOLAR MEP - ULTIMO ANIO</div>
                  {mepHistErr && <div style={{color:"var(--red)",fontSize:"11px"}}>{mepHistErr}</div>}
                  {!mepHistErr && mepUltimoAnio.length>0 && (
                    <svg viewBox="0 0 600 120" style={{width:"100%",height:"120px"}} preserveAspectRatio="none">
                      <polyline points={mepUltimoAnio.map((d,i)=>{
                        const vals=mepUltimoAnio.map(x=>x.mep);
                        const min=Math.min(...vals), max=Math.max(...vals), range=(max-min)||1;
                        const x=8+(i/((mepUltimoAnio.length-1)||1))*584;
                        const y=112-((d.mep-min)/range)*104;
                        return x+","+y;
                      }).join(" ")} fill="none" stroke="var(--amber)" strokeWidth="1.5"/>
                    </svg>
                  )}
                  {!mepHistErr && !mepUltimoAnio.length && <div style={{color:"var(--muted)",fontSize:"11px"}}>Sin historial disponible.</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {tab==="primacedear" && (
          <div>
            <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>PRIMA CEDEAR</div>
            <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"16px"}}>Chequeo antes de rotar: ¿conviene operar hoy o el sobreprecio esta alto?</div>

            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"16px",marginBottom:"16px"}}>
              <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"11px",color:"var(--amber)",letterSpacing:"0.06em",marginBottom:"10px"}}>CONSULTAR UN CEDEAR ANTES DE COMPRAR</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                <div style={{position:"relative",flex:1,minWidth:"200px"}}>
                  <input
                    value={consultaTickers}
                    onChange={e=>{ setConsultaTickers(e.target.value); setMostrarSugerencias(true); }}
                    onFocus={()=>setMostrarSugerencias(true)}
                    onBlur={()=>setMostrarSugerencias(false)}
                    onKeyDown={e=>{ if(e.key==="Enter" && !consultaEstado?.corriendo) { setMostrarSugerencias(false); lanzarConsultaPrima(); } }}
                    placeholder="ej: PATH SE (separados por espacio o coma)"
                    disabled={!!consultaEstado?.corriendo}
                    style={{width:"100%",background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"8px 10px",fontSize:"11px",fontFamily:"inherit",boxSizing:"border-box"}}
                  />
                  {mostrarSugerencias && consultaSugerencias.length > 0 && (
                    <div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:"3px",background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:"4px",zIndex:10,maxHeight:"170px",overflowY:"auto",boxShadow:"0 4px 10px rgba(0,0,0,0.3)"}}>
                      {consultaSugerencias.map(s => (
                        <div key={s} onMouseDown={()=>elegirSugerenciaConsulta(s)} style={{padding:"6px 10px",fontSize:"11px",color:"var(--text)",cursor:"pointer"}}>{s}</div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={lanzarConsultaPrima} disabled={!!consultaEstado?.corriendo} style={{background:consultaEstado?.corriendo?"var(--bg3)":"rgba(245,158,11,0.15)",color:consultaEstado?.corriendo?"var(--muted)":"var(--amber)",border:"1px solid "+(consultaEstado?.corriendo?"var(--border2)":"rgba(245,158,11,0.4)"),borderRadius:"4px",padding:"8px 16px",fontWeight:700,fontFamily:"inherit",fontSize:"10px",cursor:consultaEstado?.corriendo?"not-allowed":"pointer",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>
                  {consultaEstado?.corriendo ? "CONSULTANDO..." : "CONSULTAR"}
                </button>
              </div>
              <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"5px"}}>Empeza a escribir y elegi de la lista, o escribi el codigo BYMA completo.</div>

              {consultaMsg && <div style={{marginTop:"10px",fontSize:"10px",color:"var(--red)"}}>{consultaMsg}</div>}

              {consultaEstado?.corriendo && (
                <div style={{marginTop:"10px"}}>
                  <div style={{fontSize:"10px",color:"var(--muted)"}}>Consultando desde {(consultaEstado.inicio||"").slice(0,5)}...</div>
                  {consultaEstado.salida && (
                    <pre style={{fontSize:"9px",color:"var(--muted)",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"4px",padding:"6px 8px",marginTop:"6px",fontFamily:"monospace",whiteSpace:"pre-wrap",lineHeight:1.5}}>{consultaEstado.salida.trim().split("\n").slice(-4).join("\n")}</pre>
                  )}
                </div>
              )}

              {consultaEstado && !consultaEstado.corriendo && consultaEstado.ok === false && (
                <div style={{marginTop:"10px",background:"rgba(255,59,92,0.1)",border:"1px solid rgba(255,59,92,0.3)",borderRadius:"4px",padding:"8px 10px"}}>
                  <div style={{color:"var(--red)",fontSize:"10px",marginBottom:"4px"}}>La consulta no se pudo completar.</div>
                  {consultaEstado.salida && (
                    <pre style={{fontSize:"9px",color:"var(--muted)",whiteSpace:"pre-wrap",fontFamily:"monospace",margin:0}}>{consultaEstado.salida.trim().split("\n").slice(-6).join("\n")}</pre>
                  )}
                </div>
              )}

              {consultaResultadoErr && <div style={{marginTop:"10px",color:"var(--red)",fontSize:"10px"}}>{consultaResultadoErr}</div>}

              {consultaResultado && (
                <div style={{marginTop:"14px"}}>
                  {primaPromedioCartera!=null && (
                    <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"10px"}}>Prima de mercado hoy (cartera): <span style={{color:"var(--text)",fontWeight:600}}>{fmtPct(primaPromedioCartera)}</span></div>
                  )}
                  {consultaFilasPorPedido.map(({pedido, fila}) => {
                    if (!fila) {
                      return (
                        <div key={pedido} style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px 14px",marginBottom:"8px"}}>
                          <div style={{color:"var(--amber)",fontWeight:600,fontSize:"11px",marginBottom:"4px"}}>{pedido}</div>
                          <div style={{color:"var(--muted)",fontSize:"10px"}}>sin puntas (¿mercado cerrado o especie iliquida?)</div>
                        </div>
                      );
                    }
                    const primaMep = fila.prima_mep_pct;
                    const primaD = fila.prima_d_pct;
                    const sinRatio = fila.ratio == null;
                    return (
                      <div key={pedido} style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px 16px",marginBottom:"8px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:"8px"}}>
                          <div style={{color:"var(--amber)",fontWeight:700,fontSize:"13px"}}>{fila.cedear || pedido}</div>
                          <div style={{fontSize:"10px",color:"var(--muted)"}}>{consultaResultado.fecha} {consultaResultado.hora}</div>
                        </div>
                        {sinRatio ? (
                          <div style={{color:"var(--red)",fontSize:"10px",marginTop:"6px"}}>sin ratio de conversion - verificar codigo BYMA en PPI/ratios_cedears.json</div>
                        ) : (
                          <React.Fragment>
                            <div style={{fontSize:"24px",fontWeight:700,color:pc(primaMep),marginTop:"6px"}}>{primaMep!=null?fmtPct(primaMep):"—"}</div>
                            {primaMep!=null && <div style={{fontSize:"9px",color:"var(--muted)"}}>estas pagando {fmt(Math.abs(primaMep),2)}% {primaMep>=0?"por encima":"por debajo"} de la accion en Nueva York (via MEP)</div>}
                            <div style={{display:"flex",gap:"18px",marginTop:"10px",flexWrap:"wrap"}}>
                              <div>
                                <div style={{fontSize:"9px",color:"var(--muted)"}}>COSTO DE OPERAR</div>
                                <div style={{fontSize:"12px",color:"var(--text)",fontWeight:600}}>{fila.spread_ars_pct!=null?fmt(fila.spread_ars_pct,2)+"%":"—"}</div>
                              </div>
                              {primaD!=null && (
                                <div>
                                  <div style={{fontSize:"9px",color:"var(--muted)"}}>PRIMA VIA ESPECIE D</div>
                                  <div style={{fontSize:"12px",color:pc(primaD),fontWeight:600}}>{fmtPct(primaD)}</div>
                                </div>
                              )}
                            </div>
                          </React.Fragment>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"12px",fontStyle:"italic"}}>La consulta no se guarda en la historia diaria.</div>
            </div>

            {primaErr && (
              <div style={{background:"var(--bg2)",border:"1px solid rgba(255,59,92,0.3)",borderRadius:"6px",padding:"16px",marginBottom:"16px"}}>
                <div style={{color:"var(--red)",fontSize:"11px",marginBottom:"8px"}}>{primaErr}</div>
                <button onClick={cargarPrimaCedear} style={{background:"var(--bg3)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 14px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.06em"}}>REINTENTAR</button>
              </div>
            )}

            {primaLoading && !primaRows.length && !primaEmpty && (
              <div style={{color:"var(--muted)",fontSize:"11px",padding:"20px"}}>Cargando...</div>
            )}

            {primaEmpty && !primaErr && (
              <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"24px",color:"var(--muted)",fontSize:"11px",textAlign:"center"}}>
                Todavia no hay capturas. Se toman solas a las 16:30 de los dias habiles (con la tarea programada o la app abierta).
              </div>
            )}

            {primaPorTicker.length>0 && (
              <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"20px"}}>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"14px"}}>
                  {[["todos","TODOS",primaCounts.todos],["operables","OPERABLES",primaCounts.operables],["pocoliquidos","POCO LÍQUIDOS",primaCounts.pocoLiquidos]].map(([id,label,count])=>(
                    <button key={id} onClick={()=>setPrimaFiltro(id)} style={{background:primaFiltro===id?"rgba(245,158,11,0.15)":"var(--bg3)",color:primaFiltro===id?"var(--amber)":"var(--muted)",border:"1px solid "+(primaFiltro===id?"rgba(245,158,11,0.4)":"var(--border2)"),borderRadius:"4px",padding:"6px 12px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.05em"}}>{label} ({count})</button>
                  ))}
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
                    <thead>
                      <tr style={{background:"var(--bg3)",borderBottom:"1px solid var(--border2)"}}>
                        <th onClick={()=>handlePrimaOrden("nombre")} style={{padding:"7px 8px",textAlign:"left",color:"var(--muted)",fontSize:"10px",cursor:"pointer",userSelect:"none"}}>CEDEAR{primaOrden.campo==="nombre"?(primaOrden.direccion==="asc"?" ▲":" ▼"):""}</th>
                        <th onClick={()=>handlePrimaOrden("prima")} style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px",cursor:"pointer",userSelect:"none"}}>PRIMA VS. NY{primaOrden.campo==="prima"?(primaOrden.direccion==="asc"?" ▲":" ▼"):""}<br/><span style={{fontWeight:400,fontSize:"8px"}}>sobreprecio vs. la accion en Nueva York</span></th>
                        <th onClick={()=>handlePrimaOrden("spread")} style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px",cursor:"pointer",userSelect:"none"}}>COSTO DE OPERAR{primaOrden.campo==="spread"?(primaOrden.direccion==="asc"?" ▲":" ▼"):""}<br/><span style={{fontWeight:400,fontSize:"8px"}}>entrar y salir</span></th>
                        <th style={{padding:"7px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>VS. SU PROPIA HISTORIA</th>
                        <th style={{padding:"7px 8px",textAlign:"left",color:"var(--muted)",fontSize:"10px"}}>CAPTURA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {primaPorTickerFiltrado.map((row,i)=>{
                        const prima = parseFloat(row.ultima.prima_mep_pct);
                        const spread = parseFloat(row.ultima.spread_ars_pct);
                        const diasHab = diasHabilesTranscurridos(row.ultima.fecha);
                        const capturaVieja = diasHab!=null && diasHab>1;
                        let semaforoColor="var(--muted)", semaforoTexto=null;
                        if (row.percentil!=null) {
                          if (row.percentil<25) { semaforoColor="var(--green)"; semaforoTexto="barato respecto de lo habitual"; }
                          else if (row.percentil>75) { semaforoColor="var(--red)"; semaforoTexto="caro respecto de lo habitual"; }
                          else { semaforoTexto="dentro de lo habitual"; }
                        }
                        return (
                          <tr key={row.key} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"var(--bg)":"var(--bg2)"}}>
                            <td style={{padding:"5px 8px",color:"var(--amber)",fontWeight:600}}>{row.key}</td>
                            <td style={{padding:"5px 8px",textAlign:"right",color:pc(prima)}}>
                              {isNaN(prima)?"—":fmtPct(prima)}
                              {!isNaN(prima) && <div style={{fontSize:"8px",color:"var(--muted)",fontWeight:400}}>estas pagando el CEDEAR un {fmt(Math.abs(prima),1)}% {prima>=0?"por encima":"por debajo"} de la accion en Nueva York</div>}
                            </td>
                            <td style={{padding:"5px 8px",textAlign:"right",color:"var(--text)"}}>{isNaN(spread)?"—":fmt(spread,2)+"%"}</td>
                            <td style={{padding:"5px 8px",textAlign:"right"}}>
                              {row.n<10 ? (
                                <span style={{color:"var(--muted)",fontSize:"10px"}}>juntando historia ({row.n} captura{row.n!==1?"s":""})</span>
                              ) : (
                                <div>
                                  <span style={{color:semaforoColor,fontWeight:600}}>{fmt(row.percentil,0)}º pctl</span>
                                  <div style={{fontSize:"8px",color:semaforoColor,fontWeight:400}}>{semaforoTexto}</div>
                                </div>
                              )}
                            </td>
                            <td style={{padding:"5px 8px",color:capturaVieja?"var(--amber)":"var(--muted)",fontSize:"10px"}}>
                              {row.ultima.fecha} {row.ultima.hora}
                              {capturaVieja && <div style={{fontSize:"8px"}}>captura de hace {diasHab} dias habiles</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {primaPorTickerFiltrado.length===0 && (
                    <div style={{color:"var(--muted)",fontSize:"11px",padding:"16px",textAlign:"center"}}>Sin CEDEARs en este filtro.</div>
                  )}
                </div>
                {primaPorTickerFiltrado.some(r=>r.n>=10) && (
                  <div style={{marginTop:"12px",fontSize:"9px",color:"var(--muted)",fontStyle:"italic"}}>
                    Caro o barato respecto de su propia historia, no en terminos absolutos.
                  </div>
                )}
                {primaFiltro==="pocoliquidos" && (
                  <div style={{marginTop:"12px",fontSize:"9px",color:"var(--muted)",fontStyle:"italic",borderTop:"1px solid var(--border)",paddingTop:"10px"}}>
                    Papel sin puntas o con spread alto: entrar y salir cuesta caro o directamente no se puede. El motor ya los evita como candidatos; esta vista sirve para chequear antes de operar por tu cuenta.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab==="operar" && (
          <div>
            <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"12px"}}>OPERAR - MOTOR DEFENSIVO</div>

            {/* 1. Fila compacta de estado: fecha, avisos, actualizar motor, capital, exposicion */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"12px"}}>
              <style>{`@keyframes pulseCalmoOperar{0%,100%{opacity:.35}50%{opacity:1}}`}</style>

              {operarResultado && diasHabilesTranscurridos(operarResultado.fecha_snapshot) > 0 && (
                <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:"4px",padding:"8px 10px",marginBottom:"10px",fontSize:"11px",color:"var(--amber)"}}>
                  El motor no corre desde {operarResultado.fecha_snapshot} - apreta Actualizar.
                </div>
              )}

              {operarResultado && (
                <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"8px"}}>Corrida del motor: <span style={{color:"var(--text)",fontWeight:600}}>{operarResultado.fecha_snapshot}</span></div>
              )}

              {operarResultado && carteraDesfasada && (
                <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:"4px",padding:"8px 10px",marginBottom:"10px",fontSize:"11px",color:"var(--amber)"}}>
                  Declaraste cambios que el motor aún no recalculó — apretá ACTUALIZAR MOTOR.
                </div>
              )}

              <button onClick={lanzarActualizacionMotor} disabled={!!jobEstado.motor?.corriendo} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",background:jobEstado.motor?.corriendo?"var(--bg3)":"rgba(245,158,11,0.15)",color:jobEstado.motor?.corriendo?"var(--muted)":"var(--amber)",border:"1px solid "+(jobEstado.motor?.corriendo?"var(--border2)":(motorResaltado?"var(--amber)":"rgba(245,158,11,0.4)")),borderRadius:"4px",padding:"11px",fontWeight:700,fontFamily:"inherit",fontSize:"11px",cursor:jobEstado.motor?.corriendo?"not-allowed":"pointer",letterSpacing:"0.06em",boxShadow:(motorResaltado && !jobEstado.motor?.corriendo)?"0 0 0 2px rgba(245,158,11,0.35)":"none"}}>
                {jobEstado.motor?.corriendo && <span style={{display:"inline-block",width:"6px",height:"6px",borderRadius:"50%",background:"var(--amber)",animation:"pulseCalmoOperar 2.5s ease-in-out infinite"}}/>}
                {jobEstado.motor?.corriendo ? "ACTUALIZANDO DESDE "+(jobEstado.motor.inicio||"").slice(0,5) : "ACTUALIZAR MOTOR"}
              </button>
              <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"5px"}}>Puede tardar varios minutos (descarga snapshots y corre el motor).</div>

              {jobEstado.motor?.corriendo && jobEstado.motor?.salida && (
                <pre style={{fontSize:"9px",color:"var(--muted)",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"4px",padding:"6px 8px",marginTop:"8px",fontFamily:"monospace",whiteSpace:"pre-wrap",lineHeight:1.5}}>{jobEstado.motor.salida.trim().split("\n").slice(-6).join("\n")}</pre>
              )}
              {jobMsg.motor && (
                <div style={{fontSize:"10px",marginTop:"10px",padding:"7px 10px",borderRadius:"4px",background:"var(--bg)",color:jobMsg.motor.startsWith("OK")?"var(--green)":jobMsg.motor.startsWith("ERROR")?"var(--red)":"var(--muted)",borderLeft:"2px solid "+(jobMsg.motor.startsWith("OK")?"var(--green)":jobMsg.motor.startsWith("ERROR")?"var(--red)":"var(--muted)")}}>
                  {jobMsg.motor}
                  {jobErrSalida.motor && (
                    <details style={{marginTop:"6px"}}>
                      <summary style={{cursor:"pointer",color:"var(--muted)",fontSize:"9px"}}>Ver detalle</summary>
                      <pre style={{whiteSpace:"pre-wrap",fontSize:"9px",color:"var(--muted)",marginTop:"6px",fontFamily:"inherit"}}>{jobErrSalida.motor}</pre>
                    </details>
                  )}
                </div>
              )}

              {operarResultado && (
                <div style={{display:"flex",gap:"20px",flexWrap:"wrap",alignItems:"center",marginTop:"12px",paddingTop:"10px",borderTop:"1px solid var(--border)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}>
                    <span style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em"}}>CAPITAL</span>
                    {operarEstadoCarteraErr ? (
                      <span style={{fontSize:"10px",color:"var(--red)"}}>{operarEstadoCarteraErr}</span>
                    ) : operarResultado.capital_configurado===false ? (
                      <React.Fragment>
                        <input type="number" min="0" step="100" value={capitalInput} onChange={e=>setCapitalInput(e.target.value)} placeholder="Capital USD" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"10px",width:"110px",fontFamily:"inherit"}}/>
                        <button onClick={guardarCapital} disabled={capitalSaving} style={{background:"rgba(0,217,100,0.15)",color:"var(--green)",border:"1px solid rgba(0,217,100,0.3)",borderRadius:"4px",padding:"5px 12px",fontWeight:700,fontFamily:"inherit",fontSize:"9px",cursor:capitalSaving?"not-allowed":"pointer",letterSpacing:"0.06em"}}>{capitalSaving?"...":"GUARDAR"}</button>
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <span style={{fontSize:"11px",fontWeight:700,color:"var(--text)"}}>USD {fmt(operarEstadoCartera?.capital_referencia,0)}</span>
                        {!capitalEditando && (
                          <button onClick={()=>setCapitalEditando(true)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"9px",fontFamily:"inherit",textDecoration:"underline"}}>editar</button>
                        )}
                        {capitalEditando && (
                          <React.Fragment>
                            <input type="number" min="0" step="100" value={capitalInput} onChange={e=>setCapitalInput(e.target.value)} placeholder="Nuevo capital USD" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"9px",width:"110px",fontFamily:"inherit"}}/>
                            <button onClick={guardarCapital} disabled={capitalSaving} style={{background:"rgba(0,217,100,0.15)",color:"var(--green)",border:"1px solid rgba(0,217,100,0.3)",borderRadius:"4px",padding:"5px 10px",fontWeight:700,fontFamily:"inherit",fontSize:"9px",cursor:capitalSaving?"not-allowed":"pointer",letterSpacing:"0.06em"}}>{capitalSaving?"...":"GUARDAR"}</button>
                            <button onClick={()=>{setCapitalEditando(false);setCapitalMsg("");}} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"9px",fontFamily:"inherit"}}>cancelar</button>
                          </React.Fragment>
                        )}
                      </React.Fragment>
                    )}
                  </div>

                  <div style={{display:"flex",alignItems:"baseline",gap:"6px"}}>
                    <span style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em"}}>EXPOSICIÓN</span>
                    <span style={{fontSize:"16px",fontWeight:700,color:operarResultado.exposicion_sugerida>=0.8?"var(--green)":operarResultado.exposicion_sugerida>=0.4?"var(--amber)":"var(--red)"}}>{(operarResultado.exposicion_sugerida*100).toFixed(0)}%</span>
                    <span style={{fontSize:"9px",color:"var(--muted)"}}>{operarResultado.estado_exposicion}</span>
                  </div>
                </div>
              )}
              {operarResultado && operarResultado.capital_configurado===false && !operarEstadoCarteraErr && (
                <div style={{fontSize:"9px",color:"var(--amber)",marginTop:"6px"}}>Sin esto no se calculan montos ni costos de fricción.</div>
              )}
              {capitalMsg && (
                <div style={{fontSize:"10px",marginTop:"8px",color:capitalMsg.startsWith("OK")?"var(--green)":capitalMsg.startsWith("ERROR")?"var(--red)":"var(--amber)"}}>{capitalMsg}</div>
              )}
              {renderCorreccionMsg()}
            </div>

            {operarResultadoErr && (
              <div style={{background:"rgba(255,59,92,0.08)",border:"1px solid rgba(255,59,92,0.3)",borderRadius:"6px",padding:"14px",marginBottom:"12px",fontSize:"11px",color:"var(--red)"}}>
                {operarResultadoErr} Todavia no corrio el motor, o el archivo no existe. Apreta ACTUALIZAR MOTOR arriba.
              </div>
            )}

            {operarResultado && (
              <React.Fragment>

                {/* 2. Lectura del dia */}
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"12px"}}>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"8px"}}>LECTURA DEL DIA</div>
                  {(operarResultado.lectura_dia||[]).length===0 ? (
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>Sin lectura del dia.</div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                      {operarResultado.lectura_dia.map((linea,i)=>(
                        <div key={i} style={{fontSize:"11px",color:"var(--text)",lineHeight:1.5}}>{linea}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Que hacer hoy (ex Ordenes propuestas) */}
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"12px"}}>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"8px"}}>QUÉ HACER HOY</div>
                  {operarResultado.costo_friccion_estimado!=null && (
                    <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"10px"}}>Costo de friccion estimado: USD {fmt(operarResultado.costo_friccion_estimado,2)}</div>
                  )}
                  {(operarResultado.avisos_recambio||[]).length===0 ? (
                    <div style={{fontSize:"12px",color:"var(--text)",fontWeight:600,padding:"8px 0"}}>Hoy no hay rotaciones propuestas. No hay nada que operar.</div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                      {operarResultado.avisos_recambio.map((av,i)=>{
                        const capSale = spreadsPorTickerUS[(av.sale||"").toUpperCase()];
                        const capEntra = spreadsPorTickerUS[(av.entra||"").toUpperCase()];
                        return (
                          <div key={i} style={{background:"var(--bg3)",borderRadius:"4px",padding:"8px 10px",fontSize:"11px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                              <span style={{color:"var(--red)",fontWeight:700}}>VENDER {av.sale}</span>
                              {renderCuchillo(av.sale)}
                              <span style={{color:"var(--muted)"}}>-&gt;</span>
                              <span style={{color:"var(--green)",fontWeight:700}}>COMPRAR {av.entra}</span>
                              {renderCuchillo(av.entra)}
                              {av.estado && <span style={{fontSize:"9px",color:"var(--muted)",background:"var(--bg)",padding:"1px 6px",borderRadius:"2px",border:"1px solid var(--border)"}}>{av.estado}</span>}
                            </div>
                            <div style={{display:"flex",gap:"16px",marginTop:"5px",fontSize:"9px",color:"var(--muted)"}}>
                              <span>{av.sale} CEDEAR: {capSale?`spread ${fmt(parseFloat(capSale.spread_ars_pct),2)}% / prima ${fmt(parseFloat(capSale.prima_mep_pct),2)}% (${capSale.hora})`:"sin captura hoy"}</span>
                              <span>{av.entra} CEDEAR: {capEntra?`spread ${fmt(parseFloat(capEntra.spread_ars_pct),2)}% / prima ${fmt(parseFloat(capEntra.prima_mep_pct),2)}% (${capEntra.hora})`:"sin captura hoy"}</span>
                            </div>
                            <div style={{marginTop:"8px",paddingTop:"8px",borderTop:"1px solid var(--border)",fontSize:"9px",color:"var(--muted)",lineHeight:1.6}}>
                              <div><strong style={{color:"var(--red)"}}>VENDER {av.sale}:</strong> {VENTA_EXPLICACION_TEXTO}</div>
                              <div style={{marginTop:"6px"}}><strong style={{color:"var(--green)"}}>COMPRAR {av.entra}:</strong> {COMPRA_EXPLICACION_TEXTO}</div>
                              {textoAlternativas && <div style={{marginTop:"6px"}}>{textoAlternativas}</div>}
                            </div>
                            <div style={{marginTop:"8px",paddingTop:"8px",borderTop:"1px solid var(--border)",display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
                              <button onClick={()=>{
                                if (window.confirm(`¿Confirmás que no pudiste comprar ${av.entra}? Se repone ${av.sale} en la cartera y se quita ${av.entra}.`)) {
                                  corregirCartera({ quitar: [av.entra], agregar: [av.sale], motivo: "no ejecutada, se repone la saliente" });
                                }
                              }} disabled={correccionEnviando} style={{background:"rgba(245,158,11,0.12)",color:"var(--amber)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"3px",padding:"5px 10px",fontSize:"9px",fontWeight:700,fontFamily:"inherit",cursor:correccionEnviando?"not-allowed":"pointer",letterSpacing:"0.03em"}}>No pude ejecutarla</button>
                              <button onClick={()=>setCompreOtraAbierto(p=>({...p,[av.entra]:!p[av.entra]}))} style={{background:"rgba(59,158,255,0.12)",color:"var(--blue)",border:"1px solid rgba(59,158,255,0.4)",borderRadius:"3px",padding:"5px 10px",fontSize:"9px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.03em"}}>Compré otra</button>
                            </div>
                            {compreOtraAbierto[av.entra] && (
                              <div style={{marginTop:"6px",display:"flex",gap:"6px",flexWrap:"wrap",alignItems:"center"}}>
                                {suplentesOperables.length===0 ? (
                                  <span style={{fontSize:"9px",color:"var(--muted)"}}>No hay suplentes operables ahora mismo.</span>
                                ) : suplentesOperables.map(s=>(
                                  <button key={s.ticker} onClick={()=>{
                                    if (window.confirm(`¿Confirmás que compraste ${s.ticker} en vez de ${av.entra}?`)) {
                                      corregirCartera({ quitar: [av.entra], agregar: [s.ticker], motivo: "ejecutada alternativa " + s.ticker }).then(ok => { if (ok) setCompreOtraAbierto(p => ({ ...p, [av.entra]: false })); });
                                    }
                                  }} disabled={correccionEnviando} style={{background:"rgba(0,217,100,0.12)",color:"var(--green)",border:"1px solid rgba(0,217,100,0.4)",borderRadius:"3px",padding:"5px 10px",fontSize:"9px",fontWeight:700,fontFamily:"inherit",cursor:correccionEnviando?"not-allowed":"pointer",letterSpacing:"0.03em"}}>{s.ticker}</button>
                                ))}
                              </div>
                            )}
                            {renderCorreccionMsg()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 4. Tu cartera, vista por el sistema (ex Cartera objetivo) */}
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"12px"}}>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>TU CARTERA, VISTA POR EL SISTEMA</div>
                  <div style={{fontSize:"10px",color:"var(--muted)",marginBottom:"10px"}}>Tu cartera real declarada (los chips de abajo), con su situación de hoy según el ranking y el peso objetivo de cada posición (1/12 c/u). Se actualiza al instante con cada corrección; se recalcula del todo con ACTUALIZAR MOTOR.</div>

                  {operarEstadoCarteraErr ? (
                    <div style={{fontSize:"11px",color:"var(--red)",marginBottom:"10px"}}>{operarEstadoCarteraErr}</div>
                  ) : carteraRealTickers.length===0 ? (
                    <div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"10px"}}>Sin tickers declarados.</div>
                  ) : (
                    <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"10px"}}>
                      {carteraRealTickers.map(tk=>(
                        <span key={tk} style={{fontSize:"10px",fontWeight:700,color:"var(--text)",background:"var(--bg3)",border:"1px solid var(--border2)",padding:"3px 8px",borderRadius:"3px"}}>{tk}</span>
                      ))}
                    </div>
                  )}
                  {carteraDesfasada && (
                    <div style={{marginBottom:"10px",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:"4px",padding:"8px 10px",fontSize:"11px",color:"var(--amber)"}}>
                      Declaraste cambios que el motor aún no recalculó — apretá ACTUALIZAR MOTOR.
                    </div>
                  )}

                  {(operarResultado.cartera||[]).length===0 ? (
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>Sin posiciones.</div>
                  ) : (
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"10px"}}>
                        <thead>
                          <tr style={{borderBottom:"1px solid var(--border)"}}>
                            <th style={{textAlign:"left",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>TICKER</th>
                            <th style={{textAlign:"left",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>CUCHILLO</th>
                            <th style={{textAlign:"right",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>PESO</th>
                            <th style={{textAlign:"right",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>MONTO</th>
                            <th style={{textAlign:"right",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>DIAS</th>
                            <th style={{textAlign:"left",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>SITUACIÓN</th>
                            <th style={{textAlign:"left",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>RAZON</th>
                            <th style={{textAlign:"right",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>SPREAD CEDEAR</th>
                            <th style={{textAlign:"right",padding:"5px 6px",color:"var(--muted)",fontWeight:600}}>PRIMA CEDEAR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operarResultado.cartera.map((t,i)=>{
                            const capitalNum = typeof operarEstadoCartera?.capital_referencia==="number" ? operarEstadoCartera.capital_referencia : null;
                            const monto = (operarResultado.capital_configurado && capitalNum!=null) ? capitalNum * t.peso * operarResultado.exposicion_sugerida : null;
                            const cap = spreadsPorTickerUS[(t.ticker||"").toUpperCase()];
                            const razonAbierta = !!operarRazonAbierta[t.ticker];
                            const razonInfo = razonTraducida(t.razon);
                            return (
                              <React.Fragment key={t.ticker+i}>
                              <tr style={{borderBottom:"1px solid var(--border)"}}>
                                <td style={{padding:"6px",fontWeight:700,color:"var(--text)"}}>
                                  {t.ticker}
                                  <div>
                                    <span onClick={()=>setCorregirAbierto(p=>({...p,[t.ticker]:!p[t.ticker]}))} style={{fontSize:"8px",color:"var(--muted)",cursor:"pointer",textDecoration:"underline",fontWeight:400}}>corregir</span>
                                  </div>
                                </td>
                                <td style={{padding:"6px"}}>{renderCuchillo(t.ticker)}</td>
                                <td style={{padding:"6px",textAlign:"right",color:"var(--text)"}}>{(t.peso*100).toFixed(1)}%</td>
                                <td style={{padding:"6px",textAlign:"right",color:"var(--text)"}}>{monto!=null?"USD "+fmt(monto,0):"—"}</td>
                                <td style={{padding:"6px",textAlign:"right",color:"var(--muted)"}}>{t.dias_hold}</td>
                                <td style={{padding:"6px"}}>
                                  {(() => {
                                    const sit = situacionInfo(t.estado, t.razon);
                                    return (
                                      <React.Fragment>
                                        <span style={{fontSize:"9px",fontWeight:700,color:sit.color,background:sit.bg,border:"1px solid "+sit.border,padding:"1px 6px",borderRadius:"2px",letterSpacing:"0.03em"}}>{sit.chip}</span>
                                        {razonAbierta && sit.frase && (
                                          <div style={{marginTop:"4px",fontSize:"9px",color:"var(--muted)",lineHeight:1.5,maxWidth:"220px"}}>{sit.frase}</div>
                                        )}
                                      </React.Fragment>
                                    );
                                  })()}
                                </td>
                                <td onClick={()=>setOperarRazonAbierta(p=>({...p,[t.ticker]:!p[t.ticker]}))} style={{padding:"6px",color:"var(--muted)",cursor:"pointer",maxWidth:"260px"}} title={razonInfo.cruda}>
                                  {razonAbierta ? (
                                    <React.Fragment>
                                      <div style={{color:"var(--text)"}}>{razonInfo.texto}</div>
                                      <div style={{marginTop:"4px",fontStyle:"italic"}}>{ROL_CARTERA_TEXTO}</div>
                                    </React.Fragment>
                                  ) : razonInfo.texto}
                                </td>
                                <td style={{padding:"6px",textAlign:"right",color:"var(--muted)"}}>{cap?fmt(parseFloat(cap.spread_ars_pct),2)+"%":"sin captura hoy"}</td>
                                <td style={{padding:"6px",textAlign:"right",color:"var(--muted)"}}>{cap?fmt(parseFloat(cap.prima_mep_pct),2)+"%":"sin captura hoy"}</td>
                              </tr>
                              {corregirAbierto[t.ticker] && (
                                <tr style={{borderBottom:"1px solid var(--border)",background:"var(--bg)"}}>
                                  <td colSpan={9} style={{padding:"8px 10px"}}>
                                    <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap",fontSize:"10px"}}>
                                      <span style={{color:"var(--muted)"}}>Corregir {t.ticker}:</span>
                                      <button onClick={()=>{
                                        if (window.confirm(`¿Confirmás que no tenés ${t.ticker} en tu cuenta? Se va a quitar de la cartera registrada.`)) {
                                          corregirCartera({ quitar: [t.ticker], motivo: "no lo tengo" }).then(ok => { if (ok) setCorregirAbierto(p => ({ ...p, [t.ticker]: false })); });
                                        }
                                      }} disabled={correccionEnviando} style={{background:"rgba(255,59,92,0.12)",color:"var(--red)",border:"1px solid rgba(255,59,92,0.4)",borderRadius:"3px",padding:"5px 10px",fontSize:"9px",fontWeight:700,fontFamily:"inherit",cursor:correccionEnviando?"not-allowed":"pointer",letterSpacing:"0.03em"}}>No tengo este papel</button>
                                      <button onClick={()=>{
                                        if (window.confirm(`¿Confirmás que vendiste ${t.ticker} por decisión propia? Se va a quitar de la cartera registrada.`)) {
                                          corregirCartera({ quitar: [t.ticker], motivo: "vendido por decisión propia" }).then(ok => { if (ok) setCorregirAbierto(p => ({ ...p, [t.ticker]: false })); });
                                        }
                                      }} disabled={correccionEnviando} style={{background:"rgba(245,158,11,0.12)",color:"var(--amber)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"3px",padding:"5px 10px",fontSize:"9px",fontWeight:700,fontFamily:"inherit",cursor:correccionEnviando?"not-allowed":"pointer",letterSpacing:"0.03em"}}>Lo vendí</button>
                                      <button onClick={()=>setCorregirAbierto(p=>({...p,[t.ticker]:false}))} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"9px",fontFamily:"inherit"}}>cancelar</button>
                                    </div>
                                    {renderCorreccionMsg()}
                                  </td>
                                </tr>
                              )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 5a. Colapsable: El ranking del sistema hoy (fusion Suplentes + Cartera teorica) */}
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",marginBottom:"12px",overflow:"hidden"}}>
                  <button onClick={()=>setRankingHoyAbierta(v=>!v)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                    <span style={{fontSize:"10px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em"}}>[ EL RANKING DEL SISTEMA HOY ]</span>
                    <span style={{color:"var(--muted)",fontSize:"11px"}}>{rankingHoyAbierta?"−":"+"}</span>
                  </button>
                  {rankingHoyAbierta && (
                    <div style={{padding:"0 14px 14px 14px"}}>
                      <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.35)",borderRadius:"4px",padding:"8px 10px",marginBottom:"10px",fontSize:"11px",color:"var(--amber)",lineHeight:1.6}}>
                        Esto es lo que el sistema armaría hoy si empezara de cero. CAMBIA UN POCO TODOS LOS DÍAS POR RUIDO — la diferencia con tu cartera NO es una señal de operar. Las señales son las rotaciones propuestas en su fecha. Este bloque es contexto, no lista de tareas.
                      </div>
                      {carteraTeorica.length===0 ? (
                        <div style={{fontSize:"11px",color:"var(--muted)"}}>Sin datos de universo todavía.</div>
                      ) : (
                        <React.Fragment>
                          <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em",marginBottom:"6px"}}>TOP 12</div>
                          <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"14px"}}>
                            {carteraTeorica.map((u,i)=>{
                              const cap = spreadsPorTickerUS[(u.ticker||"").toUpperCase()];
                              const yaLaTenes = carteraRealTickers.includes((u.ticker||"").toUpperCase());
                              return (
                                <div key={u.ticker+i} style={{display:"flex",alignItems:"center",gap:"10px",fontSize:"11px",background:"var(--bg3)",borderRadius:"4px",padding:"6px 10px",flexWrap:"wrap"}}>
                                  <span style={{color:"var(--muted)",minWidth:"24px"}}>#{u.posicion}</span>
                                  <span style={{fontWeight:700,color:"var(--text)",minWidth:"60px"}}>{u.ticker}</span>
                                  <span style={{color:"var(--muted)",fontSize:"10px"}}>score {fmt(u.score,2)}</span>
                                  <span style={{color:"var(--muted)",fontSize:"10px"}}>{cap?`spread ${fmt(parseFloat(cap.spread_ars_pct),2)}% / prima ${fmt(parseFloat(cap.prima_mep_pct),2)}%`:"sin captura hoy"}</span>
                                  {yaLaTenes && <span style={{marginLeft:"auto",fontSize:"9px",fontWeight:700,padding:"1px 6px",borderRadius:"2px",color:"var(--green)",background:"rgba(0,217,100,0.12)",border:"1px solid rgba(0,217,100,0.4)"}}>ya la tenés</span>}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em",marginBottom:"6px"}}>SIGUIENTES 5</div>
                          {rankingSiguientes5.length===0 ? (
                            <div style={{fontSize:"11px",color:"var(--muted)"}}>Sin datos.</div>
                          ) : (
                            <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                              {rankingSiguientes5.map((u,i)=>{
                                const cap = spreadsPorTickerUS[(u.ticker||"").toUpperCase()];
                                const yaLaTenes = carteraRealTickers.includes((u.ticker||"").toUpperCase());
                                return (
                                  <div key={u.ticker+i} style={{display:"flex",alignItems:"center",gap:"10px",fontSize:"11px",background:"var(--bg3)",borderRadius:"4px",padding:"6px 10px",flexWrap:"wrap"}}>
                                    <span style={{color:"var(--muted)",minWidth:"24px"}}>#{u.posicion}</span>
                                    <span style={{fontWeight:700,color:"var(--text)",minWidth:"60px"}}>{u.ticker}</span>
                                    <span style={{color:"var(--muted)",fontSize:"10px"}}>score {fmt(u.score,2)}</span>
                                    <span style={{color:"var(--muted)",fontSize:"10px"}}>{cap?`spread ${fmt(parseFloat(cap.spread_ars_pct),2)}% / prima ${fmt(parseFloat(cap.prima_mep_pct),2)}%`:"sin captura hoy"}</span>
                                    {yaLaTenes && <span style={{marginLeft:"auto",fontSize:"9px",fontWeight:700,padding:"1px 6px",borderRadius:"2px",color:"var(--green)",background:"rgba(0,217,100,0.12)",border:"1px solid rgba(0,217,100,0.4)"}}>ya la tenés</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </React.Fragment>
                      )}
                    </div>
                  )}
                </div>

                {/* 5b. Colapsable: Que hace este sistema y que podes esperar */}
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",marginBottom:"12px",overflow:"hidden"}}>
                  <button onClick={()=>setExplicacionOperarAbierta(v=>!v)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                    <span style={{fontSize:"10px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em"}}>[ QUÉ HACE ESTE SISTEMA Y QUÉ PODÉS ESPERAR ]</span>
                    <span style={{color:"var(--muted)",fontSize:"11px"}}>{explicacionOperarAbierta?"−":"+"}</span>
                  </button>
                  {explicacionOperarAbierta && (
                    <div style={{padding:"0 14px 14px 14px",fontSize:"11px",color:"var(--text)",lineHeight:1.7}}>
                      {EXPLICACION_SISTEMA_TEXTO}
                    </div>
                  )}
                </div>

                {/* 5c. Colapsable: Como leer esta pantalla (unifica las leyendas del pie) */}
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",marginBottom:"12px",overflow:"hidden"}}>
                  <button onClick={()=>setComoLeerAbierta(v=>!v)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                    <span style={{fontSize:"10px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em"}}>[ CÓMO LEER ESTA PANTALLA ]</span>
                    <span style={{color:"var(--muted)",fontSize:"11px"}}>{comoLeerAbierta?"−":"+"}</span>
                  </button>
                  {comoLeerAbierta && (
                    <div style={{padding:"0 14px 14px 14px",fontSize:"10px",color:"var(--muted)",fontStyle:"italic",lineHeight:1.7}}>
                      {CUCHILLO_TOOLTIP}{cuchilloSnapshotDate?" (datos del snapshot "+cuchilloSnapshotDate+").":cuchilloErr?" ("+cuchilloErr+")":""} El motor propone; la decision y la ejecucion son tuyas. Costos CEDEAR de la ultima captura diaria (~11:30).
                    </div>
                  )}
                </div>

                {/* 6. Zona de correccion: declarar + rearmar desde cero (corregir por fila queda en la tabla de arriba) */}
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"12px"}}>
                  <div style={{fontSize:"10px",fontWeight:600,color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"10px"}}>ZONA DE CORRECCIÓN</div>

                  <div style={{display:"flex",gap:"8px",alignItems:"center",fontSize:"10px",flexWrap:"wrap"}}>
                    <span style={{color:"var(--muted)"}}>¿Tenés algo que no figura en la tabla de arriba?</span>
                    <datalist id="operar-ticker-list">
                      {(operarResultado?.universo||[]).map(u=><option key={u.ticker} value={u.ticker}/>)}
                    </datalist>
                    <input type="text" list="operar-ticker-list" value={declararInput} onChange={e=>setDeclararInput(e.target.value)} placeholder="TICKER" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"5px 8px",fontSize:"10px",width:"100px",fontFamily:"inherit",textTransform:"uppercase"}}/>
                    <button onClick={()=>{
                      const tk = declararInput.trim().toUpperCase();
                      if (!tk) return;
                      corregirCartera({ agregar: [tk], motivo: "declarado por el usuario" }).then(ok => { if (ok) setDeclararInput(""); });
                    }} disabled={correccionEnviando || !declararInput.trim()} style={{background:"rgba(0,217,100,0.12)",color:"var(--green)",border:"1px solid rgba(0,217,100,0.4)",borderRadius:"4px",padding:"5px 12px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:(correccionEnviando||!declararInput.trim())?"not-allowed":"pointer",letterSpacing:"0.03em"}}>Declarar</button>
                  </div>

                  {carteraRealTickers.length>0 && (
                    <div style={{marginTop:"14px",paddingTop:"12px",borderTop:"1px solid var(--border)"}}>
                      {!rearmarConfirmando ? (
                        <button onClick={()=>setRearmarConfirmando(true)} style={{background:"none",border:"1px solid rgba(255,59,92,0.3)",color:"var(--red)",borderRadius:"3px",padding:"4px 10px",fontSize:"9px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.03em"}}>REARMAR DESDE CERO</button>
                      ) : (
                        <div style={{background:"rgba(255,59,92,0.08)",border:"1px solid rgba(255,59,92,0.3)",borderRadius:"4px",padding:"10px",fontSize:"10px",color:"var(--text)",lineHeight:1.6}}>
                          <div style={{marginBottom:"8px"}}>Esto borra tu cartera declarada y deja que el motor la rearme con su top-12 operable en la próxima corrida. Se usa cuando decidiste converger al sistema de una sola vez. El costo estimado de fricción está en la Lectura del día. ¿Confirmás?</div>
                          <div style={{display:"flex",gap:"8px"}}>
                            <button onClick={()=>{
                              corregirCartera({
                                quitar: carteraRealTickers,
                                agregar: [],
                                motivo: "rearme desde cero solicitado por el usuario",
                                mensajeExito: "Apretalo ahora: el motor va a armar la cartera y la tabla resultante es tu lista de compras.",
                              }).then(()=>setRearmarConfirmando(false));
                            }} disabled={correccionEnviando} style={{background:"rgba(255,59,92,0.15)",color:"var(--red)",border:"1px solid rgba(255,59,92,0.4)",borderRadius:"3px",padding:"5px 12px",fontSize:"9px",fontWeight:700,fontFamily:"inherit",cursor:correccionEnviando?"not-allowed":"pointer",letterSpacing:"0.03em"}}>Sí, confirmar</button>
                            <button onClick={()=>setRearmarConfirmando(false)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"9px",fontFamily:"inherit"}}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {renderCorreccionMsg()}
                </div>

              </React.Fragment>
            )}
          </div>
        )}

        {tab==="cartera" && (
          <div>
            <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"12px",color:"var(--amber)",letterSpacing:"0.08em",marginBottom:"4px"}}>GESTION DE CARTERA</div>

            {/* Calculadora de Arbitraje CEDEAR */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",marginBottom:"12px",overflow:"hidden"}}>
              <button onClick={()=>setArbOpen(v=>!v)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:"10px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em"}}>[ CALCULADORA DE ARBITRAJE CEDEAR ]</span>
                <span style={{fontSize:"10px",color:"var(--muted)"}}>{arbOpen?"▲":"▼"}</span>
              </button>
              {arbOpen && (()=>{
                const mep = parseFloat(arbMEP);
                const ars = parseFloat(arbARS);
                const usd = parseFloat(arbUSD);
                const valid = !isNaN(mep) && !isNaN(ars) && !isNaN(usd) && usd > 0 && mep > 0;
                const tci  = valid ? ars / usd : null;
                const spread = valid ? ((tci / mep) - 1) * 100 : null;
                const inputStyle = {width:"100%",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",color:"#00d964",padding:"12px 14px",borderRadius:"4px",fontFamily:"monospace",fontSize:"16px",fontWeight:"bold",outline:"none",boxShadow:"inset 0 1px 3px rgba(0,0,0,0.3)"};
                return (
                  <div style={{padding:"0 14px 14px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"4px"}}>
                      {[["DOLAR MEP / CCL",arbMEP,setArbMEP],["PRECIO ASK (ARS)",arbARS,setArbARS],["PRECIO ASK USD (D)",arbUSD,setArbUSD]].map(([label,val,setter])=>(
                        <div key={label}>
                          <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",marginBottom:"5px",textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
                          <input type="number" step="any" value={val} onChange={e=>setter(e.target.value)} placeholder="0.00"
                            style={inputStyle}
                            onFocus={e=>e.target.style.border="1px solid var(--blue)"}
                            onBlur={e=>e.target.style.border="1px solid var(--border2)"}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Panel de veredicto */}
                    <div style={{background:"var(--bg3)",borderRadius:"4px",padding:"14px",marginTop:"16px"}}>
                      {!valid ? (
                        <div style={{fontFamily:"monospace",fontSize:"11px",color:"var(--muted)",textAlign:"center",letterSpacing:"0.05em"}}>[ ESPERANDO DATOS DE PUNTAS... ]</div>
                      ) : (
                        <div>
                          {/* Metricas */}
                          <div style={{display:"flex",gap:"24px",marginBottom:"14px",flexWrap:"wrap"}}>
                            <div>
                              <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"3px"}}>TCI IMPLICITO</div>
                              <div style={{fontSize:"18px",fontWeight:700,color:"#ffffff",fontFamily:"monospace"}}>$ {tci.toFixed(2)}</div>
                            </div>
                            <div>
                              <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"3px"}}>SPREAD VS MEP</div>
                              <div style={{fontSize:"18px",fontWeight:700,color:spread>=0?"var(--red)":"var(--green)",fontFamily:"monospace"}}>{spread>=0?"+":""}{spread.toFixed(2)}%</div>
                            </div>
                            <div>
                              <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"3px"}}>MEP REFERENCIA</div>
                              <div style={{fontSize:"18px",fontWeight:700,color:"var(--muted)",fontFamily:"monospace"}}>$ {mep.toFixed(2)}</div>
                            </div>
                          </div>
                          {/* Veredicto */}
                          <div style={{background:spread>=0?"rgba(255,59,92,0.08)":"rgba(0,217,100,0.08)",border:"1px solid "+(spread>=0?"rgba(255,59,92,0.25)":"rgba(0,217,100,0.25)"),borderRadius:"4px",padding:"10px 12px"}}>
                            {spread >= 0 ? (
                              <div>
                                <div style={{fontSize:"12px",fontWeight:700,color:"var(--green)",marginBottom:"4px",fontFamily:"monospace"}}>▶ COMPRAR EN DOLARES (Especie D)</div>
                                <div style={{fontSize:"10px",color:"var(--muted)"}}>El CEDEAR en ARS cotiza {spread.toFixed(2)}% por encima del MEP implicito. Comprando en USD ahorras ese diferencial.</div>
                              </div>
                            ) : (
                              <div>
                                <div style={{fontSize:"12px",fontWeight:700,color:"var(--green)",marginBottom:"4px",fontFamily:"monospace"}}>▶ COMPRAR EN PESOS (ARS)</div>
                                <div style={{fontSize:"10px",color:"var(--muted)"}}>El CEDEAR en ARS cotiza {Math.abs(spread).toFixed(2)}% por debajo del MEP implicito. Comprando en ARS obtenes ese diferencial a favor.</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{color:"var(--muted)",fontSize:"10px",marginBottom:"14px"}}>Las posiciones se normalizan al subyacente en dolares. Los CEDEARs se dividen por el ratio de conversion de BYMA.</div>

            {/* Formulario de carga */}
            <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",marginBottom:"16px"}}>
              <div style={{fontSize:"10px",fontWeight:600,color:"var(--muted)",letterSpacing:"0.07em",marginBottom:"10px"}}>AGREGAR POSICION</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"flex-end"}}>
                <datalist id="port-ticker-list">
                  {tickers.map(t=><option key={t.symbol} value={t.symbol}/>)}
                </datalist>
                <div>
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>TICKER</div>
                  <input list="port-ticker-list" value={portForm.ticker} onChange={e=>setPortForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} placeholder="AAPL" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",width:"90px",fontFamily:"inherit"}}/>
                </div>
                <div>
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>TIPO</div>
                  <select value={portForm.tipo} onChange={e=>setPortForm(p=>({...p,tipo:e.target.value,ratio:e.target.value==="ORIGINAL"?1:p.ratio}))} style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 8px",fontSize:"11px",fontFamily:"inherit",cursor:"pointer"}}>
                    <option value="ORIGINAL">ORIGINAL</option>
                    <option value="CEDEAR">CEDEAR</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}} title="Ingrese solo el primer numero del ratio de BYMA (Ej: para 20:1, ingrese 20)">RATIO BYMA ⓘ</div>
                  <input type="number" min="1" value={portForm.ratio} disabled={portForm.tipo==="ORIGINAL"} onChange={e=>setPortForm(p=>({...p,ratio:e.target.value}))} title="Ingrese solo el primer numero del ratio de BYMA (Ej: para 20:1, ingrese 20)" style={{background:portForm.tipo==="ORIGINAL"?"var(--bg3)":"var(--bg)",border:"1px solid var(--border2)",color:portForm.tipo==="ORIGINAL"?"var(--muted)":"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",width:"80px",fontFamily:"inherit"}}/>
                </div>
                <div>
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>CANTIDAD NOMINAL</div>
                  <input type="number" min="0" value={portForm.cantidad} onChange={e=>setPortForm(p=>({...p,cantidad:e.target.value}))} placeholder="100" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",width:"100px",fontFamily:"inherit"}}/>
                </div>
                <div>
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"3px"}}>PRECIO ENTRADA USD</div>
                  <input type="number" min="0" step="0.01" value={portForm.precioEntrada} onChange={e=>setPortForm(p=>({...p,precioEntrada:e.target.value}))} placeholder="150.00" style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"6px 10px",fontSize:"11px",width:"110px",fontFamily:"inherit"}}/>
                </div>
                <button onClick={addPosition} disabled={!portForm.ticker.trim()||!portForm.cantidad||!portForm.precioEntrada} style={{background:(!portForm.ticker.trim()||!portForm.cantidad||!portForm.precioEntrada)?"var(--bg3)":editingId!==null?"var(--blue)":"var(--amber)",color:(!portForm.ticker.trim()||!portForm.cantidad||!portForm.precioEntrada)?"var(--muted)":"#0a0b0f",border:"none",borderRadius:"4px",padding:"6px 16px",fontWeight:700,fontFamily:"inherit",fontSize:"11px",cursor:"pointer",whiteSpace:"nowrap"}}>
                  {editingId !== null ? "OK GUARDAR" : "+ AGREGAR"}
                </button>
                {editingId !== null && (
                  <button onClick={cancelEdit} style={{background:"none",border:"1px solid var(--border2)",color:"var(--muted)",borderRadius:"4px",padding:"6px 12px",fontWeight:700,fontFamily:"inherit",fontSize:"11px",cursor:"pointer",whiteSpace:"nowrap"}}>
                    CANCELAR
                  </button>
                )}
              </div>
              <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"8px"}}>CEDEAR: la exposicion real = Cantidad Nominal ÷ Ratio. Ejemplo: 100 papeles ÷ ratio 10 = 10 acciones de AAPL.</div>
            </div>

            {/* == Cartera Decisor — fuente JSON externa (solo presentación) == */}
            <div style={{marginBottom:"14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"}}>
                <div style={{fontSize:"9px",fontWeight:700,color:"var(--muted)",letterSpacing:"0.08em"}}>CARTERA DECISOR · JSON EXTERNO</div>
                <label style={{background:"var(--bg2)",border:"1px solid rgba(0,217,100,0.4)",color:"var(--green)",borderRadius:"4px",padding:"5px 12px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:"pointer",whiteSpace:"nowrap"}}>
                  ↑ CARGAR CARTERA DECISOR (JSON)
                  <input type="file" accept=".json" style={{display:"none"}} onChange={e => importCarteraDecisora(e.target.files?.[0])} />
                </label>
              </div>
              {carteraDecisorData ? (
                <div>
                  <div style={{fontSize:"9px",color:"var(--muted)",marginBottom:"6px"}}>
                    {carteraDecisorData.payload.metadata.fecha_generacion}
                    {" · "}{carteraDecisorData.payload.metadata.total_posiciones_activas ?? carteraDecisorData.payload.posiciones_activas.length} posiciones
                    {carteraDecisorData.payload.metadata.fuente ? " · " + carteraDecisorData.payload.metadata.fuente : ""}
                  </div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:"10px"}}>
                      <thead>
                        <tr>
                          {["Ticker","Tipo","Ratio","Cantidad","Entrada CEDEAR","Entrada subya.","Apertura","Tesis ingreso"].map(h => (
                            <th key={h} style={{textAlign:"left",padding:"4px 6px",borderBottom:"1px solid var(--border2)",color:"var(--muted)",fontWeight:600,letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {carteraDecisorData.payload.posiciones_activas.map((p, i) => (
                          <tr key={i} style={{borderBottom:"1px solid var(--border2)"}}>
                            <td style={{padding:"4px 6px",fontWeight:700}}>{p.ticker}</td>
                            <td style={{padding:"4px 6px"}}>{p.tipo ?? "—"}</td>
                            <td style={{padding:"4px 6px"}}>{p.ratio_cedear ?? "—"}</td>
                            <td style={{padding:"4px 6px"}}>{p.cantidad}</td>
                            <td style={{padding:"4px 6px"}}>{p.precio_entrada_cedear_usd != null ? "USD " + p.precio_entrada_cedear_usd : "—"}</td>
                            <td style={{padding:"4px 6px"}}>{p.precio_entrada_subyacente_usd != null ? "USD " + p.precio_entrada_subyacente_usd : "—"}</td>
                            <td style={{padding:"4px 6px",whiteSpace:"nowrap"}}>{p.fecha_apertura ?? "—"}</td>
                            <td style={{padding:"4px 6px"}}>{p.tesis_dominante_al_ingreso ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{background:"var(--bg2)",border:"1px dashed var(--border2)",borderRadius:"6px",padding:"18px 20px",textAlign:"center"}}>
                  <div style={{fontSize:"10px",color:"var(--muted)"}}>Cargá <code>cartera_decisor.json</code> desde el botón de arriba — fuente operativa en <code>Decisiones/registro_posiciones.md</code></div>
                </div>
              )}
            </div>

            {/* Importar siempre visible - independiente del estado de la cartera */}
            <div style={{display:"flex",gap:"8px",marginBottom:"6px"}}>
              <button onClick={exportarCartera} disabled={portfolio.length===0 && liquidezUSD===0} style={{flex:1,background:"var(--bg2)",border:"1px solid var(--border2)",color:portfolio.length===0&&liquidezUSD===0?"var(--muted)":"var(--text)",borderRadius:"4px",padding:"8px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:portfolio.length===0&&liquidezUSD===0?"not-allowed":"pointer"}}>
                ↓ EXPORTAR JSON
              </button>
              <div style={{flex:1,position:"relative",background:"var(--bg2)",border:"1px solid rgba(0,217,100,0.4)",borderRadius:"4px",padding:"8px",textAlign:"center"}}>
                <span style={{color:"var(--green)",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em"}}>↑ IMPORTAR ARCHIVO</span>
                <input type="file" accept=".json,.txt,text/plain" onChange={importarCartera} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",opacity:0,cursor:"pointer"}}/>
              </div>
            </div>
            {/* Pegar JSON directamente - funciona en movil/WebView */}
            <div style={{marginBottom:"10px"}}>
              <textarea id="cart-paste-area"
                placeholder='Pega el JSON de la cartera aqui...'
                style={{width:"100%",height:"60px",background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"8px",fontSize:"10px",fontFamily:"monospace",resize:"vertical",display:"block",marginBottom:"4px"}}/>
              <div id="cart-paste-status" style={{fontSize:"10px",minHeight:"14px",marginBottom:"6px"}}/>
              <button onClick={()=>{
                const ta = document.getElementById("cart-paste-area");
                const st = document.getElementById("cart-paste-status");
                const txt = (ta?.value||"").trim().replace(/^\uFEFF/,"");
                const ok  = (msg) => { if(st){st.textContent=msg;st.style.color="var(--green)";} };
                const err = (msg) => { if(st){st.textContent=msg;st.style.color="var(--red)";} };
                if (!txt) { err("Campo vacio - pega el JSON primero"); return; }
                let data;
                try { data = JSON.parse(txt); } catch(e) { err("JSON invalido: " + e.message.slice(0,80)); return; }
                let posiciones = null, liq = 0;
                if (data.posiciones && Array.isArray(data.posiciones)) { posiciones = data.posiciones; liq = data.liquidezUSD ?? 0; }
                else if (Array.isArray(data)) { posiciones = data; }
                if (!posiciones?.length) { err("No se encontraron posiciones"); return; }
                setPortfolio(posiciones);
                setLiquidezUSD(liq);
                window.storage.set("portfolio:v1", JSON.stringify(posiciones), true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
                window.storage.set("portfolio:cash", String(liq), true).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
                if (ta) ta.value = "";
                ok("OK " + posiciones.length + " posiciones cargadas");
              }} style={{width:"100%",background:"rgba(0,217,100,0.15)",border:"1px solid rgba(0,217,100,0.4)",color:"var(--green)",borderRadius:"4px",padding:"9px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.06em"}}>
                CARGAR JSON DE CARTERA
              </button>
            </div>


            {/* == Monitor de Liquidez - SIEMPRE visible (incluso con cartera vacia) == */}
            {(()=>{
              const posiciones = getPortfolioWithMarket();
              const capitalRV   = posiciones.reduce((s,p) => s + (p.valorPosicion ?? 0), 0);
              const capitalTotal = capitalRV + liquidezUSD;
              const topeBase    = capitalTotal < 10000 ? 0.25 : capitalTotal < 30000 ? 0.15 : capitalTotal < 100000 ? 0.10 : 0.07;
              const liquidezPct = capitalTotal > 0 ? (liquidezUSD / capitalTotal * 100).toFixed(1) : "0.0";
              const moveTicker  = tickers.find(t => t.symbol === "^MOVE");
              const vixTicker   = tickers.find(t => t.symbol === "^VIX");
              const liqReq      = (vixTicker?.last_price > 35 || moveTicker?.last_price > 120) ? "50%+"
                                : (vixTicker?.last_price > 25 || moveTicker?.last_price > 100) ? "30-40%"
                                : "10-20%";
              return (
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"12px 14px",marginBottom:"14px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"16px",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em"}}>CAPITAL TOTAL</div>
                      <div style={{fontSize:"13px",fontWeight:700,color:"var(--text)"}}>USD {fmt(capitalTotal)}</div>
                      <div style={{fontSize:"9px",color:"var(--muted)"}}>RV: {fmt(capitalRV)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em"}}>TOPE POR POSICION</div>
                      <div style={{fontSize:"13px",fontWeight:700,color:"var(--amber)"}}>{(topeBase*100).toFixed(0)}%</div>
                      <div style={{fontSize:"9px",color:"var(--muted)"}}>concentracion max.</div>
                    </div>
                    <div>
                      <div style={{fontSize:"9px",color:"var(--muted)",letterSpacing:"0.06em"}}>EFECTIVO LIBRE (USD)</div>
                      <div style={{display:"flex",gap:"6px",alignItems:"center",marginTop:"2px"}}>
                        <input
                          type="number" min="0" step="100"
                          value={liquidezUSD || ""}
                          onChange={e => setLiquidezUSD(Math.max(0, Number(e.target.value) || 0))}
                          onBlur={e => saveLiquidez(e.target.value)}
                          placeholder="0"
                          style={{background:"var(--bg)",border:"1px solid var(--border2)",color:"var(--text)",borderRadius:"4px",padding:"4px 8px",fontSize:"12px",width:"90px",fontFamily:"inherit"}}
                        />
                        <span style={{fontSize:"11px",fontWeight:600,color:parseFloat(liquidezPct) < parseFloat(liqReq) ? "var(--red)" : "var(--green)"}}>{liquidezPct}%</span>
                      </div>
                      <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"2px"}}>Requerida (VIX/MOVE): {liqReq}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* == Tabla de posiciones o Empty State == */}
            {portfolio.length === 0 ? (
              <div style={{background:"var(--bg2)",border:"1px dashed var(--border2)",borderRadius:"6px",padding:"32px 20px",textAlign:"center",marginBottom:"14px"}}>
                <div style={{fontSize:"11px",fontWeight:700,color:"var(--amber)",letterSpacing:"0.07em",marginBottom:"10px"}}>CARGA MANUAL · fuente operativa en Decisiones/registro_posiciones.md</div>
                <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:1.7,marginBottom:"16px"}}>
                  Para posiciones históricas con precios de mercado y P&L, usá el formulario de arriba o importá JSON de backup.
                </div>
                <button
                  onClick={()=>{ setPortForm({ticker:"",tipo:"ORIGINAL",ratio:1,cantidad:"",precioEntrada:""}); setEditingId(null); }}
                  style={{background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.4)",color:"var(--amber)",borderRadius:"4px",padding:"8px 20px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.06em"}}
                >
                  + AGREGAR PRIMER ACTIVO
                </button>
              </div>
            ) : (
              <div>
                <div style={{overflowX:"auto",marginBottom:"14px"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
                    <thead>
                      <tr style={{background:"var(--bg3)",borderBottom:"1px solid var(--border2)"}}>
                        {["TICKER","TIPO","NOMINAL","CANT. ACCIONES","P. ENTRADA","P. ACTUAL","VALOR USD","% CARTERA","RS 20D","P&L %","FASE",""].map(h => (
                          <th key={h} style={{padding:"7px 8px",textAlign:h===""||h==="TICKER"?"left":"right",color:"var(--muted)",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(()=>{
                        const posiciones = getPortfolioWithMarket();
                        const capitalTotal = posiciones.reduce((s,p) => s + (p.valorPosicion ?? 0), 0) + liquidezUSD;
                        const topeBase = capitalTotal < 10000 ? 0.25 : capitalTotal < 30000 ? 0.15 : capitalTotal < 100000 ? 0.10 : 0.07;
                        return posiciones.map((pos,i) => {
                          const rs = pos.rs != null ? Number(pos.rs) : null;
                          const betaProxy = rs != null ? Math.max(0.5, Math.min(2.5, 1 + Math.abs(rs) / 20)) : 1.0;
                          const pctDecimal = pos.pctCartera != null ? pos.pctCartera / 100 : null;
                          const expAjustada = pctDecimal != null ? pctDecimal * betaProxy : null;
                          const semaforo = expAjustada == null ? null
                            : expAjustada > topeBase ? "rojo"
                            : expAjustada > topeBase * 0.75 ? "amarillo"
                            : "verde";
                          const semaforoColor = semaforo === "rojo" ? "rgba(255,59,92,0.1)" : semaforo === "amarillo" ? "rgba(245,158,11,0.1)" : "transparent";
                          const semaforoText  = semaforo === "rojo" ? "🚨 SOBRE" : semaforo === "amarillo" ? "🟡 ALERTA" : semaforo === "verde" ? "OK" : "-";
                          const semaforoLabel = semaforo === "rojo" ? "SOBREPONDERADO: Riesgo direccional excesivo." : semaforo === "amarillo" ? "CERCA DEL TOPE: Vigilar concentracion." : "";
                          return (
                            <tr key={pos.id} className="TR" style={{borderBottom:"1px solid var(--border)",background:semaforoColor}}>
                              <td style={{padding:"5px 8px",color:"var(--amber)",fontWeight:600}}>
                                {pos.ticker}
                                {pos.tipo==="CEDEAR"&&<span style={{fontSize:"9px",color:"var(--blue)",marginLeft:"4px"}}>CEDEAR</span>}
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"right",color:"var(--muted)",fontSize:"10px"}}>{pos.tipo}</td>
                              <td style={{padding:"5px 8px",textAlign:"right",color:"var(--blue)",fontWeight:600}}>
                                {pos.tipo==="CEDEAR" ? (pos.exposicion * pos.ratio).toFixed(0) : <span style={{color:"var(--muted)"}}>-</span>}
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"right"}}>{pos.exposicion.toFixed(4)}</td>
                              <td style={{padding:"5px 8px",textAlign:"right",color:"var(--muted)"}}>{fmt(pos.precioBase)}</td>
                              <td style={{padding:"5px 8px",textAlign:"right"}}>{pos.precioActual!=null?fmt(pos.precioActual):<span style={{color:"var(--muted)"}}>-</span>}</td>
                              <td style={{padding:"5px 8px",textAlign:"right",fontWeight:500}}>{pos.valorPosicion!=null?fmt(pos.valorPosicion):"-"}</td>
                              <td style={{padding:"5px 8px",textAlign:"right",color:pos.pctCartera==null?"var(--muted)":pos.pctCartera>30?"var(--red)":pos.pctCartera>20?"var(--amber)":"var(--text)"}}>{pos.pctCartera!=null?pos.pctCartera.toFixed(1)+"%":"-"}</td>
                              <td style={{padding:"5px 8px",textAlign:"right"}} title={semaforoLabel}>
                                <span style={{fontSize:"10px",cursor:"help"}}>{semaforoText}</span>
                                {expAjustada != null && <span style={{fontSize:"9px",color:"var(--muted)",marginLeft:"4px"}}>({(expAjustada*100).toFixed(1)}%beta)</span>}
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"right",fontWeight:600,color:pos.pnlPct==null?"var(--muted)":pos.pnlPct>=0?"var(--green)":"var(--red)"}}>
                                {pos.pnlPct!=null?(pos.pnlPct>=0?"+":"")+pos.pnlPct.toFixed(2)+"%":"-"}
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"right",color:pos.rs==null?"var(--muted)":pos.rs>=0?"var(--green)":"var(--red)"}}>
                                {pos.rs!=null?(pos.rs>=0?"+":"")+Number(pos.rs).toFixed(1)+"%":"-"}
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"right"}}>
                                {pos.faseCodigo?<span className="CHIP" style={{background:pos.faseCodigo.color+"22",color:pos.faseCodigo.color,border:"1px solid "+pos.faseCodigo.color+"44",borderRadius:"3px",padding:"1px 5px",fontSize:"9px",fontWeight:700}}>{pos.faseCodigo.label}</span>:<span style={{color:"var(--muted)"}}>-</span>}
                              </td>
                              <td style={{padding:"5px 8px",textAlign:"center",whiteSpace:"nowrap"}}>
                                <button onClick={()=>editPosition(pos)} style={{background:"none",border:"none",color:"var(--blue)",cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"0 4px"}}>✎</button>
                                <button onClick={()=>removePosition(pos.id)} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontFamily:"inherit",fontSize:"11px",padding:"0 4px"}}>✕</button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                <button onClick={auditarCartera} disabled={portAuditing} style={{width:"100%",background:portAuditing?"var(--bg2)":"rgba(255,59,92,0.15)",border:"1px solid rgba(255,59,92,0.4)",color:portAuditing?"var(--muted)":"var(--red)",borderRadius:"4px",padding:"9px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:portAuditing?"not-allowed":"pointer",marginBottom:"6px"}}>
                  {portAuditing?"AUDITANDO...":"!️  AUDITAR RIESGO DE CARTERA"}
                </button>
                <button onClick={pingAnalista} disabled={pingStatus==="loading"} title="Verificar conexion con la API antes de auditar" style={{width:"100%",background:pingStatus==="ok"?"rgba(0,217,100,0.1)":pingStatus==="error"?"rgba(255,59,92,0.1)":"var(--bg2)",color:pingStatus==="ok"?"var(--green)":pingStatus==="error"?"var(--red)":"var(--muted)",border:"1px solid "+(pingStatus==="ok"?"rgba(0,217,100,0.3)":pingStatus==="error"?"rgba(255,59,92,0.3)":"var(--border2)"),borderRadius:"4px",padding:"7px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:pingStatus==="loading"?"not-allowed":"pointer",marginBottom:"6px"}}>
                  {pingStatus==="loading"?"VERIFICANDO...":pingStatus==="ok"?"OK CONEXION OK":pingStatus==="error"?"✗ SIN CONEXION - recarga el artefacto":"VERIFICAR CONEXION"}
                </button>
                <button onClick={exportarContextoCartera} title="Exporta el contexto para analizarlo en una conversacion de Claude cuando el analista no responde" style={{width:"100%",background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--muted)",borderRadius:"4px",padding:"7px",fontSize:"10px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:"pointer",marginBottom:"12px"}}>
                  ↗ EXPORTAR CONTEXTO (plan B)
                </button>

                {portAudit && (
                  <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"6px",padding:"14px",fontSize:"11px",color:"var(--text)",lineHeight:1.8,whiteSpace:"pre-wrap"}}>
                    {portAudit}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modal exportacion cartera */}
      {showExport && (
        <div className="MOV" onClick={e=>{if(e.target===e.currentTarget){setShowExport(false);setExportJson("");}}}>
          <div style={{background:"var(--bg2)",border:"1px solid rgba(59,158,255,0.4)",borderRadius:"8px",padding:"20px",width:"520px",maxWidth:"92vw"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"13px",color:"var(--blue)"}}>{exportTitle || "EXPORTAR"}</div>
              <button onClick={()=>{setShowExport(false);setExportJson("");}} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"16px",fontFamily:"inherit"}}>x</button>
            </div>
            <div style={{fontSize:"11px",color:"var(--muted)",marginBottom:"8px"}}>Selecciona todo el texto (Ctrl+A / Cmd+A) y copialo. Guardalo en un archivo <code>.json</code> para restaurar la cartera.</div>
            <textarea
              id="cartera-export-ta"
              readOnly
              value={exportJson}
              onClick={e=>e.target.select()}
              style={{width:"100%",height:"180px",background:"var(--bg)",border:"1px solid var(--blue)",color:"var(--text)",borderRadius:"4px",padding:"8px",fontSize:"9px",fontFamily:"monospace",resize:"vertical",cursor:"text",boxSizing:"border-box",display:"block"}}
            />
            <button onClick={()=>{
              const ta = document.getElementById("cartera-export-ta");
              if (ta) {
                ta.select();
                ta.setSelectionRange(0, 99999);
                try {
                  const ok = document.execCommand("copy");
                  if (!ok) throw new Error("execCommand fallo");
                } catch {
                  navigator.clipboard?.writeText(exportJson).catch(e=>{ if(!e?.message?.includes('404')) console.warn('[STORAGE]',e.message); });
                }
              }
            }} style={{marginTop:"10px",width:"100%",background:"var(--amber)",color:"#0a0b0f",border:"none",borderRadius:"4px",padding:"9px",fontSize:"11px",fontWeight:700,fontFamily:"inherit",letterSpacing:"0.06em",cursor:"pointer"}}>
              COPIAR AL PORTAPAPELES
            </button>
            <div style={{fontSize:"9px",color:"var(--muted)",marginTop:"6px",textAlign:"center"}}>{portfolio.length} posicion{portfolio.length!==1?"es":""} · Efectivo: USD {fmt(liquidezUSD)}</div>
          </div>
        </div>
      )}

      {/* Modal restauracion automatica */}
      {showRestoreModal && (
        <div className="MOV" onClick={e=>{if(e.target===e.currentTarget)setShowRestoreModal(false);}}>
          <div style={{background:"var(--bg2)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"8px",padding:"24px",width:"480px",maxWidth:"90vw"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
              <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"14px",color:"var(--amber)"}}>STORAGE VACIO DETECTADO</div>
              <button onClick={()=>setShowRestoreModal(false)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"16px",fontFamily:"inherit"}}>x</button>
            </div>
            <div style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginBottom:"16px"}}>
              No hay snapshots ni datos en memoria. Si tenes un backup guardado, importalo ahora para restaurar el sistema.
            </div>
            <div style={{display:"flex",gap:"10px",flexDirection:"column"}}>
              <button onClick={()=>{setShowRestoreModal(false);setTab("dashboard");}} style={{background:"var(--amber)",color:"#0a0b0f",border:"none",borderRadius:"4px",padding:"10px",fontSize:"11px",fontWeight:700,fontFamily:"inherit",cursor:"pointer",letterSpacing:"0.06em"}}>
                IR A CARGAR -> IMPORTAR BACKUP
              </button>
              <button onClick={()=>setShowRestoreModal(false)} style={{background:"none",border:"1px solid var(--border2)",color:"var(--muted)",borderRadius:"4px",padding:"8px",fontSize:"11px",fontFamily:"inherit",cursor:"pointer"}}>
                Empezar desde cero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* News modal */}
      {newsModal && (
        <div className="MOV" onClick={e=>{if(e.target===e.currentTarget)setNewsModal(null);}}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"8px",padding:"24px",width:"520px",maxWidth:"90vw",maxHeight:"80vh",overflow:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
              <div style={{fontFamily:"sans-serif",fontWeight:600,fontSize:"14px",color:"var(--amber)"}}>
                {newsModal.symbol}
                {(()=>{const t=snapshots[selDate]?.tickers?.find(x=>x.symbol===newsModal.symbol);return t?<span style={{color:"var(--muted)",fontSize:"12px",fontWeight:400,marginLeft:"12px"}}>{fmt(t.last_price)} {fmtPct(t.change_pct)}</span>:null;})()}
              </div>
              <button onClick={()=>setNewsModal(null)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:"16px",fontFamily:"inherit"}}>x</button>
            </div>
            {newsLoading?<div style={{color:"var(--muted)",fontSize:"11px",padding:"20px 0",textAlign:"center"}}>Buscando noticias recientes...</div>:<div style={{color:"var(--text)",fontSize:"12px",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{newsModal.content}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
