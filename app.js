/* Фінансовий радник 3.0 — автономний застосунок без залежностей і без токенів ШІ. */
(() => {
'use strict';
const VERSION = '3.0.0';
const HOSTED = 'https://dehluloo.github.io/finadvisor/';
const REPO = 'https://github.com/Dehluloo/finadvisor';
const BASE = location.protocol.startsWith('http') ? '' : HOSTED;
const T_TICK = 30e3, T_LIVE = 120e3, T_BRIEF = 30 * 60e3, T_FULL = 4 * 3600e3, T_CHART = 60e3, T_MK = 5 * 60e3, T_LIQ = 5 * 60e3;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('fa:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fa:' + k, JSON.stringify(v)); } catch {} }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- мова ----------
let LANG = store.get('lang', /^(uk|ru)/.test(navigator.language || '') ? 'uk' : 'en');
const t = (k, v) => { let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.uk[k] ?? k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
const LOC = () => LANG === 'uk' ? 'uk-UA' : 'en-US';
function applyI18n() {
  document.documentElement.lang = LANG; document.title = t('app');
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

// ---------- вигляд ----------
const ACCENTS = ['#5b8cff', '#22c55e', '#a78bfa', '#f59e0b', '#ec4899', '#06b6d4'];
function applyLook() {
  const th = store.get('theme', 'auto'); document.documentElement.dataset.theme = th;
  const ac = store.get('accent', ACCENTS[0]); document.documentElement.style.setProperty('--accent', ac); document.documentElement.style.setProperty('--accent2', ac);
  document.documentElement.dataset.density = store.get('density', 'comfy');
  $$('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === th));
  $$('#dens-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === store.get('density', 'comfy')));
  $('#accent-sw').innerHTML = ACCENTS.map(c => `<button class="sw-b${c === ac ? ' on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');
}

// ---------- валюта ----------
let CUR = store.get('cur', 'USD'), RATES = store.get('rates', {USD: 1});
const SYM = {USD: '$', EUR: '€', UAH: '₴', RON: 'lei '};
const rate = () => RATES[CUR] || 1;
async function loadRates() {
  if (Date.now() - store.get('ratesAt', 0) < 6 * 3600e3 && RATES.EUR) return;
  try { const j = await getJSON('https://open.er-api.com/v6/latest/USD'); if (j && j.rates) { RATES = {USD: 1, EUR: j.rates.EUR, UAH: j.rates.UAH, RON: j.rates.RON}; store.set('rates', RATES); store.set('ratesAt', Date.now()); } } catch {}
}

// ---------- активи ----------
const BASE_ASSETS = [
  {id:'BTC_USD', tk:'BTC', name:'Bitcoin', g:'c', bn:'BTCUSDT', okx:'BTC-USDT', hist:'BTC'},
  {id:'ETH_USD', tk:'ETH', name:'Ethereum', g:'c', bn:'ETHUSDT', okx:'ETH-USDT', hist:'ETH'},
  {id:'SOL_USD', tk:'SOL', name:'Solana', g:'c', bn:'SOLUSDT', okx:'SOL-USDT', hist:'SOL'},
  {id:'HYPE_USD', tk:'HYPE', name:'Hyperliquid', g:'c', okx:'HYPE-USDT', hist:'HYPE'},
  {id:'XRP_USD', tk:'XRP', name:'XRP', g:'c', bn:'XRPUSDT', okx:'XRP-USDT'},
  {id:'DOGE_USD', tk:'DOGE', name:'Dogecoin', g:'c', bn:'DOGEUSDT', okx:'DOGE-USDT'},
  {id:'ADA_USD', tk:'ADA', name:'Cardano', g:'c', bn:'ADAUSDT', okx:'ADA-USDT'},
  {id:'LINK_USD', tk:'LINK', name:'Chainlink', g:'c', bn:'LINKUSDT', okx:'LINK-USDT'},
  {id:'SUI_USD', tk:'SUI', name:'Sui', g:'c', bn:'SUIUSDT', okx:'SUI-USDT'},
  {id:'AVAX_USD', tk:'AVAX', name:'Avalanche', g:'c', bn:'AVAXUSDT', okx:'AVAX-USDT'},
  {id:'SPYUSD-PERP', tk:'SPY', name:'S&P 500 (SPY)', g:'s'},
  {id:'QQQUSD-PERP', tk:'QQQ', name:'Nasdaq 100 (QQQ)', g:'s'},
  {id:'NVDAUSD-PERP', tk:'NVDA', name:'Nvidia', g:'s'},
  {id:'AAPLUSD-PERP', tk:'AAPL', name:'Apple', g:'s'},
  {id:'TSLAUSD-PERP', tk:'TSLA', name:'Tesla', g:'s'},
  {id:'MSTRUSD-PERP', tk:'MSTR', name:'Strategy', g:'s'},
  {id:'XAUUSD-PERP', tk:'XAU', name:{uk:'Золото', en:'Gold'}, g:'s', alt:'PAXG_USD', bn:'PAXGUSDT', okx:'PAXG-USDT'},
  {id:'PAXG_USD', tk:'PAXG', name:'PAX Gold', g:'s', bn:'PAXGUSDT', okx:'PAXG-USDT'}
];
const KNOWN = Object.fromEntries(BASE_ASSETS.map(a => [a.id, a]));
const STOCKS = new Set(['SPY','QQQ','NVDA','AAPL','TSLA','MSTR','XAU','XAG','MSFT','AMZN','GOOGL','META','COIN','HOOD','AMD','NFLX','IWM','DIA','PLTR','GOLD','SILVER','WTI']);
const cgNames = store.get('cgNames', {});
function assetFor(id) {
  if (KNOWN[id]) return KNOWN[id];
  if (id.endsWith('-PERP')) { const tk = id.replace(/USD-PERP$/, '').replace(/-PERP$/, ''); return KNOWN[id] = {id, tk, name: cgNames[tk] || tk, g: STOCKS.has(tk) ? 's' : 'p'}; }
  const tk = id.split('_')[0];
  return KNOWN[id] = {id, tk, name: cgNames[tk] || tk, g: 'c', bn: tk + 'USDT', okx: tk + '-USDT'};
}
const nameOf = (a) => typeof a.name === 'object' ? a.name[LANG] : a.name;
const fullName = (a) => { const n = nameOf(a); return n.toUpperCase().includes(a.tk) ? n : n + ' (' + a.tk + ')'; };
let WATCH = store.get('watch', BASE_ASSETS.map(a => a.id));
const watchAssets = () => WATCH.map(assetFor);
const MOVERS = ['BTC_USD', 'ETH_USD', 'SOL_USD', 'HYPE_USD'];
const TF = {
  '5m': {cdc:'5m', bn:'5m', okx:'5m', n:150, intra:true}, '15m':{cdc:'15m', bn:'15m', okx:'15m', n:150, intra:true},
  '1h': {cdc:'1h', bn:'1h', okx:'1H', n:150, intra:true}, '4h': {cdc:'4h', bn:'4h', okx:'4H', n:150, intra:true},
  '1M': {cdc:'1D', bn:'1d', okx:'1D', n:30}, '2M': {cdc:'1D', bn:'1d', okx:'1D', n:61},
  '3M': {cdc:'1D', bn:'1d', okx:'1D', n:91}, '6M': {cdc:'1D', bn:'1d', okx:'1D', n:183}
};
const IND_DEF = {ma20: true, ma50: true, ema200: false, bb: false, vol: true, rsi: false, macd: false};
const state = {
  asset: store.get('asset', 'BTC_USD'), tf: store.get('tf', '1h'), ind: Object.assign({}, IND_DEF, store.get('ind', {})), log: store.get('log', false), cmp: '',
  tickers: store.get('tickers', {}), allInst: store.get('allInst', []), allTick: null, tickAt: store.get('tickAt', 0), sparks: store.get('sparks', {}),
  fng: store.get('fng', null), btcDaily: store.get('btcDaily', null), last: store.get('last', 0),
  brief: window.BRIEF || {}, briefUk: window.BRIEF || {}, live: store.get('live', null), events: store.get('events', []), mk: store.get('mk', null), global: store.get('global', null), trend: store.get('trend', []),
  newsF: 'all', liveCat: 'all', liveSent: 'all', feedN: 12, mkN: 25, mkSort: ['market_cap_rank', 1], mkQ: '', bbPer: '24h', bbSize: 'chg',
  liqCoin: store.get('liqCoin', 'BTC'), liqDays: 7, calRange: store.get('calRange', 31), calView: store.get('calView', 'grid'), calHigh: store.get('calHigh', false), calDay: null,
  editWatch: false, showOrig: {}
};

// ---------- форматування ----------
const nf = (d) => new Intl.NumberFormat(LOC(), {minimumFractionDigits:d, maximumFractionDigits:d});
const dec = (n) => { n = Math.abs(n); return n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 4 : n >= 0.0001 ? 6 : 8; };
const money = (n, d) => n == null || isNaN(n) ? '—' : SYM[CUR] + nf(d ?? dec(n * rate())).format(n * rate());
const moneyAxis = (n) => { const v = n * rate(), a = Math.abs(v); return SYM[CUR] + nf(a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6).format(v); };
const moneyBig = (n) => { const v = n * rate(), u = LANG === 'uk' ? [' трлн', ' млрд', ' млн'] : ['T', 'B', 'M']; return SYM[CUR] + (v >= 1e12 ? nf(2).format(v / 1e12) + u[0] : v >= 1e9 ? nf(2).format(v / 1e9) + u[1] : nf(1).format(v / 1e6) + u[2]); };
const pct = (n, d = 2) => n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + nf(d).format(n) + '%';
const cls = (n) => n > 0 ? 'up' : n < 0 ? 'dn' : '';
const hhmm = (d) => d.toLocaleTimeString(LOC(), {hour:'2-digit', minute:'2-digit'});
const ddmm = (d) => d.toLocaleDateString(LOC(), {day:'2-digit', month:'2-digit'});
const ago = (ts) => { const m = Math.round((Date.now() - new Date(ts)) / 60000); return m < 1 ? t('justNow') : m < 60 ? t('minAgo', {n:m}) : t('hAgo', {n:Math.round(m / 60)}); };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- мережа ----------
async function getJSON(url, ms = 12000, opt = {}) {
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, Object.assign({signal:c.signal, cache:'no-store'}, opt)); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
const CDC = 'https://api.crypto.com/exchange/v1/public/';
async function fetchTickers() {
  const j = await getJSON(CDC + 'get-tickers'), out = {}, inst = [];
  for (const d of (j.result && j.result.data) || []) {
    if (/_USD$/.test(d.i) || /USD-PERP$/.test(d.i)) inst.push(d.i);
    out[d.i] = {last:+d.a, high:+d.h, low:+d.l, chg:+d.c * 100, t:+d.t};
  }
  if (!inst.length) throw new Error('empty');
  state.allInst = inst.sort(); store.set('allInst', state.allInst); state.allTick = out;
  const keep = {}; for (const id of new Set([...WATCH, ...BASE_ASSETS.map(a => a.id), ...pfGet().map(r => r.id), ...store.get('alerts', []).map(a => a.id), state.asset])) if (out[id]) keep[id] = out[id];
  return keep;
}
async function fetchTickersFallback() {
  const out = {};
  try {
    const syms = [...new Set(watchAssets().filter(a => a.bn).map(a => a.bn))];
    const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(syms)));
    const m = Object.fromEntries(j.map(x => [x.symbol, x]));
    for (const a of watchAssets()) if (a.bn && m[a.bn]) { const x = m[a.bn]; out[a.id] = {last:+x.lastPrice, high:+x.highPrice, low:+x.lowPrice, chg:+x.priceChangePercent, t:+x.closeTime}; }
  } catch {}
  return out;
}
const norm = (rows) => rows.filter(r => isFinite(r.o) && isFinite(r.c) && r.o > 0).sort((a, b) => a.t - b.t);
async function candlesCDC(inst, tf, n) {
  const j = await getJSON(`${CDC}get-candlestick?instrument_name=${encodeURIComponent(inst)}&timeframe=${tf}&count=${Math.min(300, n)}`);
  const rows = ((j.result && j.result.data) || []).map(d => ({t:+d.t, o:+d.o, h:+d.h, l:+d.l, c:+d.c, v:+d.v}));
  if (!rows.length) throw new Error('no candles'); return norm(rows);
}
async function candlesBN(sym, tf, n) { const j = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${Math.min(1000, n)}`); return norm(j.map(k => ({t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]}))); }
async function candlesOKX(inst, tf, n) { const j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${tf}&limit=${Math.min(300, n)}`); return norm((j.data || []).map(k => ({t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]}))); }
function candlesHist(a, n) {
  const key = a.hist || (a.id === 'SPYUSD-PERP' ? 'SPX' : a.id === 'XAUUSD-PERP' ? 'GOLD' : '');
  const h = (state.briefUk.hist || {})[key]; if (!h) return null;
  return h.map(r => ({t:Date.parse(r[0] + 'T00:00:00Z'), o:r[1], h:r[2], l:r[3], c:r[4]})).slice(-n);
}
async function getCandles(id, tfKey, extra = 0) {
  const a = assetFor(id), tf = TF[tfKey], n = tf.n + extra;
  const tries = [['Crypto.com', () => candlesCDC(id, tf.cdc, n)]];
  if (a.alt) tries.push(['Crypto.com', () => candlesCDC(a.alt, tf.cdc, n)]);
  if (a.bn) tries.push(['Binance', () => candlesBN(a.bn, tf.bn, n)]);
  if (a.okx) tries.push(['OKX', () => candlesOKX(a.okx, tf.okx, n)]);
  for (const [src, fn] of tries) { try { const rows = await fn(); if (rows.length > 2) { store.set('c:' + id + ':' + tfKey, rows.slice(-(tf.n + 50))); return {rows, src}; } } catch {} }
  const cached = store.get('c:' + id + ':' + tfKey, null);
  if (cached) return {rows: cached, src: t('saved'), stale: true};
  if (!tf.intra) { const h = candlesHist(a, n); if (h) return {rows: h, src: t('briefData'), stale: true, hist: true}; }
  return {rows: [], src: ''};
}
async function fetchFng() { const j = await getJSON('https://api.alternative.me/fng/?limit=60'); return (j.data || []).map(d => ({v:+d.value, label:d.value_classification, t:+d.timestamp * 1000})).reverse(); }
const hl = (body) => getJSON('https://api.hyperliquid.xyz/info', 15000, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});

// ---------- індикатори ----------
const smaS = (v, n) => { const o = []; let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : null); }); return o; };
const emaS = (v, n) => { const o = [], k = 2 / (n + 1); let e = null; v.forEach((x, i) => { if (x == null) { o.push(null); return; } e = e == null ? x : x * k + e * (1 - k); o.push(i >= n - 1 ? e : null); }); return o; };
function bbS(v, n = 20, m = 2) { const mid = smaS(v, n); return mid.map((md, i) => { if (md == null) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - md) ** 2; const sd = Math.sqrt(s / n); return [md + m * sd, md, md - m * sd]; }); }
function rsiS(v, n = 14) { const o = [null]; let g = 0, l = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o.push(100 - 100 / (1 + g / (l || 1e-9))); } else o.push(null); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o.push(100 - 100 / (1 + g / (l || 1e-9))); } } return o; }
function macdS(v) { const a = emaS(v, 12), b = emaS(v, 26), m = a.map((x, i) => x != null && b[i] != null ? x - b[i] : null); const first = m.findIndex(x => x != null); const sig = first < 0 ? m.map(() => null) : [...m.slice(0, first).map(() => null), ...emaS(m.slice(first), 9)]; return m.map((x, i) => x == null || sig[i] == null ? [x, null, null] : [x, sig[i], x - sig[i]]); }

// ---------- графік ----------
const tipEl = $('#tip');
function showTip(html, x, y) { tipEl.innerHTML = html; tipEl.hidden = false; const w = tipEl.offsetWidth, h = tipEl.offsetHeight; tipEl.style.left = (x + 14 + w > innerWidth ? x - w - 14 : x + 14) + 'px'; tipEl.style.top = clamp(y - 10, 8, innerHeight - h - 8) + 'px'; }
function hideTip() { tipEl.hidden = true; }
function drawChart(el, all, show, intra, cmpRows) {
  if (!all || !all.length) { el.style.height = ''; el.innerHTML = `<div class="empty">${esc(t('noChart'))}</div>`; $('#chart-legend').textContent = ''; return; }
  const I = state.ind, closes = all.map(r => r.c), off = Math.max(0, all.length - show);
  const cut = (a) => a.slice(off), rows = cut(all);
  const compareMode = !!(cmpRows && cmpRows.length);
  const ser = {ma20: I.ma20 && cut(smaS(closes, 20)), ma50: I.ma50 && cut(smaS(closes, 50)), ema200: I.ema200 && cut(emaS(closes, 200)), bb: I.bb && cut(bbS(closes)), rsi: I.rsi && cut(rsiS(closes)), macd: I.macd && cut(macdS(closes))};
  const panes = compareMode ? 0 : (I.rsi ? 1 : 0) + (I.macd ? 1 : 0);
  const W = el.clientWidth || 600, baseH = innerWidth < 600 ? 280 : 340, H = baseH + panes * 92;
  el.style.height = H + 'px';
  const padL = 6, padR = 66, padT = 10, padB = 22, iw = W - padL - padR, gap = 8, paneH = 84;
  const mainH = H - padT - padB - panes * (paneH + gap);
  const step = iw / rows.length, bw = Math.max(1, Math.min(14, step * 0.68)), x = (i) => padL + step * i + step / 2;
  const P = [];
  let lo = Infinity, hi = -Infinity, cmpPct = null, basePct = null;
  if (compareMode) {
    const m = new Map(cmpRows.map(r => [r.t, r.c])), b0 = rows.find(r => m.has(r.t)), c0 = b0 ? m.get(b0.t) : null;
    basePct = rows.map(r => (r.c / rows[0].c - 1) * 100);
    cmpPct = rows.map(r => m.has(r.t) && c0 ? (m.get(r.t) / c0 - 1) * 100 : null);
    for (const v of [...basePct, ...cmpPct]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  } else {
    rows.forEach((r, i) => { lo = Math.min(lo, r.l); hi = Math.max(hi, r.h); for (const k of ['ma20', 'ma50', 'ema200']) if (ser[k] && ser[k][i] != null) { lo = Math.min(lo, ser[k][i]); hi = Math.max(hi, ser[k][i]); } if (ser.bb && ser.bb[i]) { lo = Math.min(lo, ser.bb[i][2]); hi = Math.max(hi, ser.bb[i][0]); } });
  }
  const useLog = state.log && !compareMode && lo > 0;
  const f = useLog ? Math.log : (v) => v, span = (f(hi) - f(lo)) || Math.abs(f(hi)) * 0.01 || 1, flo = f(lo) - span * 0.05, fhi = f(hi) + span * 0.05;
  const yv = (v) => padT + (fhi - f(v)) / (fhi - flo) * mainH;
  const fmtY = compareMode ? (v) => pct(v, 1) : moneyAxis;
  for (let k = 0; k <= 5; k++) { const fv = flo + (fhi - flo) * k / 5, v = useLog ? Math.exp(fv) : fv, yy = yv(v); P.push(`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text class="ax" x="${W - padR + 6}" y="${yy + 4}">${fmtY(v)}</text>`); }
  const nx = Math.max(2, Math.floor(iw / 90)), every = Math.max(1, Math.round(rows.length / nx));
  rows.forEach((r, i) => { if (i % every === 0) { const d = new Date(r.t); P.push(`<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${intra ? hhmm(d) : ddmm(d)}</text>`); } });
  const line = (arr, col, w = 1.6, dash = '', yf = yv) => { const pts = arr.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${yf(v).toFixed(1)}`).filter(Boolean); return pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>` : ''; };
  if (compareMode) {
    P.push(`<line x1="${padL}" x2="${W - padR}" y1="${yv(0)}" y2="${yv(0)}" stroke="var(--muted)" stroke-dasharray="3 3" opacity=".6"/>`);
    P.push(line(basePct, 'var(--accent)', 2.2)); P.push(line(cmpPct, 'var(--ma1)', 2.2));
  } else {
    if (I.vol && rows.some(r => r.v)) { const vmax = Math.max(...rows.map(r => r.v || 0)) || 1; rows.forEach((r, i) => { const h = (r.v || 0) / vmax * mainH * 0.18; P.push(`<rect x="${x(i) - bw / 2}" y="${padT + mainH - h}" width="${bw}" height="${h}" fill="${r.c >= r.o ? 'var(--up)' : 'var(--dn)'}" opacity=".22"/>`); }); }
    if (ser.bb) { const up = ser.bb.map(b => b && b[0]), md = ser.bb.map(b => b && b[1]), dn = ser.bb.map(b => b && b[2]);
      const ptsU = up.map((v, i) => v == null ? null : `${x(i)},${yv(v)}`).filter(Boolean), ptsD = dn.map((v, i) => v == null ? null : `${x(i)},${yv(v)}`).filter(Boolean).reverse();
      if (ptsU.length) P.push(`<polygon points="${ptsU.join(' ')} ${ptsD.join(' ')}" fill="var(--accent)" opacity=".07"/>`);
      P.push(line(up, 'var(--accent)', 1, '4 3')); P.push(line(dn, 'var(--accent)', 1, '4 3')); P.push(line(md, 'var(--accent)', 1)); }
    rows.forEach((r, i) => { const col = r.c >= r.o ? 'var(--up)' : 'var(--dn)', top = yv(Math.max(r.o, r.c)), bh = Math.max(1, Math.abs(yv(r.o) - yv(r.c))); P.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${yv(r.h)}" y2="${yv(r.l)}" stroke="${col}"/><rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${col}" rx="${bw > 4 ? 1.2 : 0}"/>`); });
    if (ser.ma20) P.push(line(ser.ma20, 'var(--ma1)')); if (ser.ma50) P.push(line(ser.ma50, 'var(--ma2)')); if (ser.ema200) P.push(line(ser.ema200, 'var(--ma3)', 1.8));
    const lc = rows.at(-1).c, ly = yv(lc), lcol = lc >= rows.at(-1).o ? 'var(--up)' : 'var(--dn)';
    P.push(`<line x1="${padL}" x2="${W - padR}" y1="${ly}" y2="${ly}" stroke="${lcol}" stroke-dasharray="2 3" opacity=".8"/><rect x="${W - padR + 2}" y="${ly - 9}" width="${padR - 4}" height="18" rx="4" fill="${lcol}"/><text x="${W - padR + 6}" y="${ly + 4}" font-size="11" fill="#fff" font-weight="600">${moneyAxis(lc)}</text>`);
  }
  let py = padT + mainH + gap;
  if (panes && I.rsi) { const y0 = py, yr = (v) => y0 + (100 - v) / 100 * paneH;
    P.push(`<rect x="${padL}" y="${y0}" width="${iw}" height="${paneH}" fill="var(--card2)" rx="6"/><rect x="${padL}" y="${yr(70)}" width="${iw}" height="${yr(30) - yr(70)}" fill="var(--accent)" opacity=".06"/>`);
    for (const lv of [30, 70]) P.push(`<line x1="${padL}" x2="${W - padR}" y1="${yr(lv)}" y2="${yr(lv)}" stroke="var(--muted)" stroke-dasharray="2 3" opacity=".6"/><text class="ax" x="${W - padR + 6}" y="${yr(lv) + 4}">${lv}</text>`);
    P.push(line(ser.rsi, 'var(--ma2)', 1.5, '', yr)); P.push(`<text class="ax" x="${padL + 6}" y="${y0 + 13}">RSI 14</text>`); py += paneH + gap; }
  if (panes && I.macd) { const y0 = py, vals = ser.macd.flat().filter(v => v != null), mx = Math.max(...vals.map(Math.abs), 1e-9), ym = (v) => y0 + paneH / 2 - v / mx * (paneH / 2 - 4);
    P.push(`<rect x="${padL}" y="${y0}" width="${iw}" height="${paneH}" fill="var(--card2)" rx="6"/><line x1="${padL}" x2="${W - padR}" y1="${ym(0)}" y2="${ym(0)}" stroke="var(--muted)" opacity=".4"/>`);
    ser.macd.forEach((m, i) => { if (m[2] == null) return; P.push(`<rect x="${x(i) - bw / 2}" y="${Math.min(ym(0), ym(m[2]))}" width="${bw}" height="${Math.abs(ym(m[2]) - ym(0))}" fill="${m[2] >= 0 ? 'var(--up)' : 'var(--dn)'}" opacity=".55"/>`); });
    P.push(line(ser.macd.map(m => m[0]), 'var(--accent)', 1.4, '', ym)); P.push(line(ser.macd.map(m => m[1]), 'var(--ma1)', 1.4, '', ym)); P.push(`<text class="ax" x="${padL + 6}" y="${y0 + 13}">MACD 12/26/9</text>`); }
  P.push(`<line class="xh" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/><line class="yh" x1="${padL}" x2="${W - padR}" y1="0" y2="0" visibility="hidden"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${P.join('')}</svg>`;
  const svg = el.firstChild, xh = svg.querySelector('.xh'), yh = svg.querySelector('.yh');
  const move = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev, b = svg.getBoundingClientRect();
    const i = clamp(Math.floor(((p.clientX - b.left) / b.width * W - padL) / step), 0, rows.length - 1), r = rows[i], d = new Date(r.t);
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    const yy = (p.clientY - b.top) / b.height * H; yh.setAttribute('y1', yy); yh.setAttribute('y2', yy); yh.setAttribute('visibility', yy < padT + mainH ? 'visible' : 'hidden');
    const dt = `<b>${intra ? ddmm(d) + ' ' + hhmm(d) : d.toLocaleDateString(LOC())}</b><br>`;
    if (compareMode) { showTip(dt + `<span style="color:var(--accent)">${esc(assetFor(state.asset).tk)}</span> ${pct(basePct[i])}<br><span style="color:var(--ma1)">${esc(assetFor(state.cmp).tk)}</span> ${pct(cmpPct[i])}`, p.clientX, p.clientY); return; }
    const chg = (r.c - r.o) / r.o * 100, ex = [];
    if (ser.ma20) ex.push(`<span style="color:var(--ma1)">MA20</span> ${money(ser.ma20[i])}`); if (ser.ma50) ex.push(`<span style="color:var(--ma2)">MA50</span> ${money(ser.ma50[i])}`); if (ser.ema200) ex.push(`<span style="color:var(--ma3)">EMA200</span> ${money(ser.ema200[i])}`);
    if (ser.rsi && ser.rsi[i] != null) ex.push(`RSI ${nf(1).format(ser.rsi[i])}`); if (r.v) ex.push(`${t('vol')} ${nf(0).format(r.v)}`);
    showTip(dt + `${t('open')} ${money(r.o)} · ${t('close')} ${money(r.c)}<br>${t('high')} ${money(r.h)} · ${t('low')} ${money(r.l)}<br><span class="${cls(chg)}">${pct(chg)}</span>${ex.length ? '<br>' + ex.join(' · ') : ''}`, p.clientX, p.clientY);
  };
  const leave = () => { xh.setAttribute('visibility', 'hidden'); yh.setAttribute('visibility', 'hidden'); hideTip(); };
  svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', leave);
  svg.addEventListener('touchstart', move, {passive:true}); svg.addEventListener('touchmove', move, {passive:true}); svg.addEventListener('touchend', leave);
  const L = [];
  if (compareMode) L.push(`<span class="sw" style="background:var(--accent)"></span>${esc(assetFor(state.asset).tk)} ${pct(basePct.at(-1))}`, `<span class="sw" style="background:var(--ma1)"></span>${esc(assetFor(state.cmp).tk)} ${pct(cmpPct.filter(v => v != null).pop())}`, `<span class="muted">${t('compareNote')}</span>`);
  else { if (ser.ma20) L.push(`<span class="sw" style="background:var(--ma1)"></span>MA20 ${money(ser.ma20.at(-1))}`); if (ser.ma50) L.push(`<span class="sw" style="background:var(--ma2)"></span>MA50 ${money(ser.ma50.at(-1))}`); if (ser.ema200 && ser.ema200.at(-1)) L.push(`<span class="sw" style="background:var(--ma3)"></span>EMA200 ${money(ser.ema200.at(-1))}`);
    if (ser.rsi && ser.rsi.at(-1) != null) { const r = ser.rsi.at(-1); L.push(`RSI ${nf(0).format(r)}${r >= 70 ? ' · ' + t('rsiHi') : r <= 30 ? ' · ' + t('rsiLo') : ''}`); } }
  $('#chart-legend').innerHTML = L.join(' &nbsp; ');
}
function sparkSVG(vals, color, h = 30, fill) {
  if (!vals || vals.length < 2) return `<svg viewBox="0 0 100 ${h}"></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 100).toFixed(2)},${(h - 2 - (v - lo) / r * (h - 4)).toFixed(2)}`);
  return `<svg viewBox="0 0 100 ${h}" preserveAspectRatio="none">${fill ? `<polygon points="0,${h} ${pts.join(' ')} 100,${h}" fill="${color}" opacity=".12"/>` : ''}<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

// ---------- бриф і пульс ----------
function renderHero() {
  const b = (state.brief.brief || [])[0] || {}, el = $('#sec-pulse');
  el.classList.remove('red', 'yellow', 'green'); if (b.signal_light) el.classList.add(b.signal_light);
  $('#hero-signal').textContent = b.signal || t('noBrief');
  $('#hero-summary').textContent = b.summary || '';
  $('#hero-date').textContent = b.date ? t('briefFrom') + ' ' + new Date(b.date + 'T12:00:00').toLocaleDateString(LOC(), {day:'numeric', month:'long'}) : t('dailyBrief');
  $('#hero-chips').innerHTML = [b.regime && t('regime') + ': ' + b.regime, b.data_as_of && t('dataAsOf') + ': ' + b.data_as_of].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('');
}
function pulseParts() {
  const parts = [];
  const f = state.fng && state.fng.length ? state.fng.at(-1).v : null; if (f != null) parts.push(['pFng', f, .3]);
  const d = state.btcDaily, last = state.tickers.BTC_USD ? state.tickers.BTC_USD.last : d && d.length && d.at(-1).c;
  if (d && d.length > 50) { const m = d.slice(-50).reduce((s, r) => s + r.c, 0) / 50; parts.push(['pTrend', clamp(50 + (last / m - 1) * 500, 0, 100), .25]); }
  const src = state.mk && state.mk.length ? state.mk.slice(0, 100).map(c => c.price_change_percentage_24h_in_currency) : watchAssets().map(a => state.tickers[a.id] && state.tickers[a.id].chg);
  const vals = src.filter(v => v != null); if (vals.length > 5) parts.push(['pBreadth', vals.filter(v => v > 0).length / vals.length * 100, .2]);
  const items = ((state.live && state.live.items) || []).filter(i => Date.now() - new Date(i.ts) < 86400e3), bu = items.filter(i => i.sent === 'Bullish').length, be = items.filter(i => i.sent === 'Bearish').length;
  if (bu + be >= 5) parts.push(['pNews', bu / (bu + be) * 100, .15]);
  const p = (state.live && state.live.perps) || {}; const fr = ['BTC', 'ETH'].filter(k => p[k]).map(k => p[k].funding_h * 8 * 100);
  if (fr.length) parts.push(['pFund', clamp(50 + (fr.reduce((a, b) => a + b, 0) / fr.length) * 1500, 0, 100), .1]);
  return parts;
}
function renderPulse() {
  const parts = pulseParts(), el = $('#pulse');
  if (!parts.length) { el.innerHTML = ''; return; }
  const w = parts.reduce((s, p) => s + p[2], 0), score = Math.round(parts.reduce((s, p) => s + p[1] * p[2], 0) / w);
  const lbl = t('pulse' + clamp(Math.floor(score / 20), 0, 4)), col = score < 25 ? 'var(--dn)' : score < 45 ? '#f97316' : score < 55 ? 'var(--warn)' : score < 75 ? '#84cc16' : 'var(--up)';
  const R = 44, C = 2 * Math.PI * R, dash = C * score / 100;
  el.innerHTML = `<div class="pulse-ring"><svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="55" cy="55" r="${R}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dash} ${C}" transform="rotate(-90 55 55)"/></svg><div class="pulse-n"><b>${score}</b><span>${esc(lbl)}</span></div></div>
    <div class="pulse-l"><div class="pulse-t">${t('pulse')}</div>${parts.map(p => `<div class="pb"><span>${t(p[0])}</span><i><u style="width:${Math.max(3, Math.round(p[1]))}%;background:${p[1] < 30 ? 'var(--dn)' : p[1] < 45 ? '#f97316' : p[1] < 55 ? 'var(--warn)' : p[1] < 70 ? '#84cc16' : 'var(--up)'}"></u></i></div>`).join('')}</div>`;
  el.title = t('pulseNote');
}

// ---------- поки вас не було ----------
let sinceShown = false;
const snapAtStart = store.get('snap', null);
function saveSnap() { const prices = {}; for (const a of watchAssets()) if (state.tickers[a.id]) prices[a.id] = state.tickers[a.id].last; store.set('snap', {ts: Date.now(), prices, fng: state.fng && state.fng.length ? state.fng.at(-1).v : null}); }
function renderSince() {
  const sec = $('#sec-since'), snap = snapAtStart;
  if (sinceShown || !snap || Date.now() - snap.ts < 45 * 60e3 || !isOn('since') || !state.tickAt || state.tickAt < snap.ts) return;
  const ch = watchAssets().filter(a => snap.prices[a.id] && state.tickers[a.id]).map(a => [a, (state.tickers[a.id].last / snap.prices[a.id] - 1) * 100]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 6);
  if (!ch.length) return;
  const imp = ((state.live && state.live.items) || []).filter(i => i.imp && new Date(i.ts) > snap.ts).length;
  const fv = state.fng && state.fng.length ? state.fng.at(-1).v : null;
  $('#since-t').textContent = t('sinceText', {t: new Date(snap.ts).toLocaleString(LOC(), {weekday:'short', hour:'2-digit', minute:'2-digit'})});
  $('#since-row').innerHTML = ch.map(([a, c]) => `<div class="sc"><b>${esc(a.tk)}</b><span class="${cls(c)}">${pct(c)}</span></div>`).join('') +
    (fv != null && snap.fng != null ? `<div class="sc"><b>F&amp;G</b><span>${snap.fng} → ${fv}</span></div>` : '') + (imp ? `<div class="sc"><b>⚡</b><span>${t('sinceNews', {n: imp})}</span></div>` : '');
  sec.hidden = false; sinceShown = true;
}

// ---------- список активів ----------
function renderTape() {
  const items = watchAssets().map(a => { const k = state.tickers[a.id]; return k ? `<span class="ti"><b>${esc(a.tk)}</b> ${money(k.last)} <i class="${cls(k.chg)}">${pct(k.chg)}</i></span>` : ''; }).join('');
  $('#tape-in').innerHTML = items ? items + items : ''; $('#tape').hidden = !items;
}
const prevPx = {};
function renderWatch() {
  $('#watch-edit').textContent = state.editWatch ? t('done') : t('edit');
  const groups = [['c', t('crypto')], ['s', t('stocks')], ['p', t('perpsGrp')]];
  $('#watch-grid').innerHTML = groups.map(([g, label]) => {
    const as = watchAssets().filter(a => a.g === g); if (!as.length) return '';
    return `<h3 class="group">${esc(label)}</h3><div class="tiles">` + as.map(a => {
      const k = state.tickers[a.id], chg = k ? k.chg : null, color = chg >= 0 ? 'var(--up)' : 'var(--dn)';
      return `<div class="tile${a.id === state.asset ? ' sel' : ''}${state.editWatch ? ' edit' : ''}" data-id="${a.id}" role="button" tabindex="0">
        ${state.editWatch ? `<div class="tile-ed"><button data-mv="-1">‹</button><button data-mv="1">›</button><button data-rm>×</button></div>` : ''}
        <div class="t1"><span class="tk">${esc(a.tk)}</span><span class="chg ${cls(chg)}">${pct(chg)}</span></div>
        <div class="nm">${esc(nameOf(a))}</div><div class="px" data-px="${a.id}">${k ? money(k.last) : '<span class="muted">—</span>'}</div>
        ${sparkSVG(state.sparks[a.id], k ? color : 'var(--muted)', 30, true)}</div>`;
    }).join('') + '</div>';
  }).join('');
  for (const a of watchAssets()) { const k = state.tickers[a.id]; if (!k) continue; const p = prevPx[a.id]; if (p && p !== k.last) { const el = $(`[data-px="${a.id}"]`); if (el) el.classList.add(k.last > p ? 'flash-up' : 'flash-dn'); } prevPx[a.id] = k.last; }
  renderTape();
}
function setWatch(w) { WATCH = w; store.set('watch', WATCH); fillSelects(); renderWatch(); }
function renderPicker() {
  const q = $('#picker-q').value.trim().toUpperCase();
  const list = state.allInst.filter(id => !WATCH.includes(id) && (!q || id.includes(q) || (cgNames[assetFor(id).tk] || '').toUpperCase().includes(q))).slice(0, 40);
  $('#picker-list').innerHTML = list.map(id => { const a = assetFor(id), k = state.allTick && state.allTick[id]; return `<button data-add="${id}"><b>${esc(a.tk)}</b> <span class="muted">${esc(id.endsWith('PERP') ? 'PERP' : nameOf(a))}</span><span class="r ${cls(k && k.chg)}">${k ? money(k.last) + ' · ' + pct(k.chg) : ''}</span></button>`; }).join('') || '<div class="muted pad">—</div>';
}

// ---------- графік: дані ----------
function renderChartHead() {
  const a = assetFor(state.asset), k = state.tickers[state.asset] || (state.allTick && state.allTick[state.asset]);
  $('#chart-name').textContent = fullName(a);
  $('#chart-price').textContent = k ? money(k.last) : '';
  const c = $('#chart-chg'); c.className = 'pill ' + cls(k && k.chg); c.textContent = k ? pct(k.chg) + ' ' + t('for24') : ''; c.hidden = !k;
  $('#chart-hl').textContent = k ? `${t('high')} ${money(k.high)} · ${t('low')} ${money(k.low)}` : '';
  $$('#tf-seg button').forEach(b => b.classList.toggle('on', b.dataset.tf === state.tf));
  $('#asset-select').value = state.asset; $('#cmp-select').value = state.cmp; $('#log-tog').checked = state.log;
  if (!$('#ind-box').children.length || $('#ind-box').dataset.lang !== LANG) { $('#ind-box').dataset.lang = LANG; $('#ind-box').innerHTML = Object.keys(IND_DEF).map(k => `<label class="tog"><input type="checkbox" data-ind="${k}"${state.ind[k] ? ' checked' : ''}> ${t('ind_' + k)}</label>`).join(''); }
}
let chartReq = 0, lastChart = null;
async function loadChart(quiet) {
  const my = ++chartReq, el = $('#chart'); renderChartHead();
  if (!quiet && (!lastChart || lastChart.id !== state.asset || lastChart.tf !== state.tf)) el.innerHTML = '<div class="skel" style="height:300px"></div>';
  const extra = state.ind.ema200 ? 200 : 50;
  const [res, cmp] = await Promise.all([getCandles(state.asset, state.tf, extra), state.cmp ? getCandles(state.cmp, state.tf, 0) : Promise.resolve(null)]);
  if (my !== chartReq) return;
  lastChart = {id: state.asset, tf: state.tf, rows: res.rows, cmp: cmp && cmp.rows};
  redrawChart();
  const a = assetFor(state.asset), notes = [];
  if (res.src) notes.push(t('source') + ': ' + res.src + (res.stale ? ' (' + t('notLive') + ')' : ''));
  if (a.g === 's' && a.id.endsWith('PERP')) notes.push(t('perpNote'));
  if (res.hist && a.id === 'SPYUSD-PERP') notes.push(t('spxNote'));
  $('#chart-note').textContent = notes.join(' · ');
}
function redrawChart() { if (lastChart && !$('#sec-chart').classList.contains('closed') && !$('#sec-chart').hidden) drawChart($('#chart'), lastChart.rows, TF[lastChart.tf].n, TF[lastChart.tf].intra, state.cmp ? lastChart.cmp : null); }

// ---------- індекс страху, авто-сигнал, ф'ючерси ----------
const FNG_UA = {'Extreme Fear':'Екстремальний страх','Fear':'Страх','Neutral':'Нейтрально','Greed':'Жадібність','Extreme Greed':'Екстремальна жадібність'};
function renderFng() {
  const f = state.fng, bf = (state.briefUk.fng || [])[0];
  const v = f && f.length ? f.at(-1).v : (bf ? +bf.value : null);
  const arc = (a0, a1, col) => { const r = 80, p = (a) => [100 + r * Math.cos(Math.PI * (1 - a)), 100 - r * Math.sin(Math.PI * (1 - a))]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${col}" stroke-width="16" fill="none"/>`; };
  let s = arc(0, .25, 'var(--dn)') + arc(.25, .45, '#f97316') + arc(.45, .55, 'var(--warn)') + arc(.55, .75, '#84cc16') + arc(.75, 1, 'var(--up)');
  if (v != null) { const a = v / 100, x = 100 + 68 * Math.cos(Math.PI * (1 - a)), y = 100 - 68 * Math.sin(Math.PI * (1 - a)); s += `<line x1="100" y1="100" x2="${x}" y2="${y}" stroke="var(--fg)" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="var(--fg)"/>`; }
  $('#fng-gauge').innerHTML = s;
  if (f && f.length) { const cur = f.at(-1), prev = f.at(-2), wk = f.at(-8);
    $('#fng-val').textContent = v; $('#fng-label').textContent = LANG === 'uk' ? (FNG_UA[cur.label] || cur.label) : cur.label;
    $('#fng-prev').textContent = [prev && t('yesterday') + ': ' + prev.v, wk && t('weekAgo') + ': ' + wk.v].filter(Boolean).join(' · ');
    $('#fng-hist').innerHTML = sparkSVG(f.slice(-60).map(d => d.v), 'var(--accent)', 60, true);
  } else if (bf) { $('#fng-val').textContent = bf.value; $('#fng-label').textContent = bf.label; $('#fng-prev').textContent = t('fromBriefDate') + ', ' + bf.date; }
}
const sma = (a, n) => { if (a.length < n) return null; let s = 0; for (let i = a.length - n; i < a.length; i++) s += a[i]; return s / n; };
function renderAuto() {
  const el = $('#auto'), d = state.btcDaily, f = state.fng;
  if (!d || d.length < 35) { el.innerHTML = `<div class="muted">${esc(t('needDaily'))}</div>`; return; }
  const c = d.map(r => r.c), last = state.tickers.BTC_USD ? state.tickers.BTC_USD.last : c.at(-1);
  const m50 = sma(c, Math.min(50, c.length)), m20 = sma(c, 20), ch30 = (last / c[Math.max(0, c.length - 31)] - 1) * 100, dd = (last / Math.max(...c.slice(-90)) - 1) * 100;
  const fv = f && f.length ? f.at(-1).v : null; let score = 0; const why = [];
  if (last > m50) { score++; why.push(t('aAbove50', {v:money(m50, 0)})); } else { score--; why.push(t('aBelow50', {v:money(m50, 0)})); }
  why.push(t(last > m20 ? 'aAbove20' : 'aBelow20'));
  if (ch30 > 5) { score++; why.push(t('a30up', {v:pct(ch30)})); } else if (ch30 < -10) { score--; why.push(t('a30dn', {v:pct(ch30)})); } else why.push(t('a30flat', {v:pct(ch30)}));
  why.push(t('aDD', {v:pct(dd)}));
  if (fv != null) { if (fv >= 75) { score--; why.push(t('aGreed', {v:fv})); } else if (fv <= 25) why.push(t('aFear', {v:fv})); else why.push(t('aMid', {v:fv})); }
  const L = score >= 1 ? ['green', t('vGreen')] : score <= -1 ? ['red', t('vRed')] : ['yellow', t('vYellow')];
  el.innerHTML = `<div class="verdict"><span class="dot ${L[0]}"></span>${esc(L[1])}</div><ul>${why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`;
}
function renderPerps() {
  const p = (state.live && state.live.perps) || {}, keys = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE'].filter(k => p[k]);
  if (!keys.length) { $('#perps').innerHTML = '<div class="muted">—</div>'; return; }
  $('#perps').innerHTML = `<table class="tbl"><thead><tr><th>${t('asset')}</th><th class="r">${t('mark')}</th><th class="r">${t('funding')}</th><th class="r">${t('oi')}</th><th class="r hide-s">${t('vol24')}</th></tr></thead><tbody>` +
    keys.map(k => { const x = p[k], f8 = x.funding_h * 8 * 100; return `<tr><td><b>${k}</b></td><td class="r">${money(x.mark)} <span class="chg ${cls(x.mark - x.prev)}">${pct((x.mark / x.prev - 1) * 100)}</span></td><td class="r ${f8 > 0.03 ? 'dn' : f8 < 0 ? 'up' : ''}">${pct(f8, 4)}</td><td class="r">${moneyBig(x.oi_usd)}</td><td class="r hide-s">${moneyBig(x.vol_usd)}</td></tr>`; }).join('') + '</tbody></table>';
}

// ---------- ринок (CoinGecko) ----------
const CG = 'https://api.coingecko.com/api/v3/';
async function loadMarkets() {
  try {
    const [mk, gl, tr] = await Promise.allSettled([
      getJSON(CG + 'coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=1h,24h,7d', 20000),
      getJSON(CG + 'global', 12000), getJSON(CG + 'search/trending', 12000)]);
    if (mk.status === 'fulfilled' && Array.isArray(mk.value)) {
      state.mk = mk.value.map(c => ({id:c.id, symbol:c.symbol.toUpperCase(), name:c.name, image:c.image, current_price:c.current_price, market_cap:c.market_cap, market_cap_rank:c.market_cap_rank, total_volume:c.total_volume,
        price_change_percentage_1h_in_currency:c.price_change_percentage_1h_in_currency, price_change_percentage_24h_in_currency:c.price_change_percentage_24h_in_currency, price_change_percentage_7d_in_currency:c.price_change_percentage_7d_in_currency,
        spark: ((c.sparkline_in_7d && c.sparkline_in_7d.price) || []).filter((_, i) => i % 4 === 0)}));
      store.set('mk', state.mk);
      for (const c of state.mk) if (!cgNames[c.symbol]) cgNames[c.symbol] = c.name; store.set('cgNames', cgNames);
    }
    if (gl.status === 'fulfilled' && gl.value.data) { state.global = gl.value.data; store.set('global', state.global); }
    if (tr.status === 'fulfilled' && tr.value.coins) { state.trend = tr.value.coins.slice(0, 7).map(c => ({symbol:c.item.symbol.toUpperCase(), name:c.item.name, image:c.item.small || c.item.thumb, chg: c.item.data && c.item.data.price_change_percentage_24h && c.item.data.price_change_percentage_24h.usd})); store.set('trend', state.trend); }
  } catch {}
  renderMarkets(); renderBubbles(); renderPulse();
}
const cdcFor = (sym) => state.allInst.includes(sym + '_USD') ? sym + '_USD' : null;
function renderMarkets() {
  const G = state.global, M = state.mk || [];
  if (G && G.total_market_cap) {
    const ch = G.market_cap_change_percentage_24h_usd;
    $('#mk-stats').innerHTML = [[t('mcap'), moneyBig(G.total_market_cap.usd) + ` <span class="${cls(ch)}">${pct(ch)}</span>`], [t('volume'), moneyBig(G.total_volume.usd)],
      [t('dom') + ' BTC', nf(1).format(G.market_cap_percentage.btc) + '%'], [t('dom') + ' ETH', nf(1).format(G.market_cap_percentage.eth) + '%'], [t('coins'), nf(0).format(G.active_cryptocurrencies)]]
      .map(([k, v]) => `<div class="st"><div class="muted small">${esc(k)}</div><div class="st-v">${v}</div></div>`).join('');
  }
  const coinLine = (c) => { const ch = c.price_change_percentage_24h_in_currency ?? c.chg; return `<div class="ml" data-sym="${esc(c.symbol)}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}<b>${esc(c.symbol)}</b><span class="muted nm">${esc(c.name)}</span><span class="r ${cls(ch)}">${pct(ch, 1)}</span></div>`; };
  $('#mk-trend').innerHTML = (state.trend || []).map(coinLine).join('') || '<div class="muted">—</div>';
  const s24 = M.filter(c => c.price_change_percentage_24h_in_currency != null && c.total_volume > 5e6);
  $('#mk-gain').innerHTML = s24.slice().sort((a, b) => b.price_change_percentage_24h_in_currency - a.price_change_percentage_24h_in_currency).slice(0, 7).map(coinLine).join('') || '<div class="muted">—</div>';
  $('#mk-lose').innerHTML = s24.slice().sort((a, b) => a.price_change_percentage_24h_in_currency - b.price_change_percentage_24h_in_currency).slice(0, 7).map(coinLine).join('') || '<div class="muted">—</div>';
  const [k, dir] = state.mkSort, q = state.mkQ.toUpperCase();
  const rows = M.filter(c => !q || c.symbol.includes(q) || c.name.toUpperCase().includes(q)).sort((a, b) => { const x = a[k], y = b[k]; if (typeof x === 'string') return x.localeCompare(y) * dir; return ((x ?? -Infinity) - (y ?? -Infinity)) * dir; });
  $('#mk-rows').innerHTML = rows.slice(0, state.mkN).map(c => {
    const cid = cdcFor(c.symbol), inW = cid && WATCH.includes(cid), up7 = (c.price_change_percentage_7d_in_currency || 0) >= 0;
    return `<tr data-sym="${esc(c.symbol)}"><td class="muted">${c.market_cap_rank || ''}</td><td><div class="coin"><img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><b>${esc(c.symbol)}</b><span class="muted nm hide-s">${esc(c.name)}</span></div></td>
      <td class="r">${money(c.current_price)}</td><td class="r ${cls(c.price_change_percentage_1h_in_currency)}">${pct(c.price_change_percentage_1h_in_currency, 1)}</td><td class="r ${cls(c.price_change_percentage_24h_in_currency)}">${pct(c.price_change_percentage_24h_in_currency, 1)}</td><td class="r ${cls(c.price_change_percentage_7d_in_currency)}">${pct(c.price_change_percentage_7d_in_currency, 1)}</td>
      <td class="r hide-s">${moneyBig(c.market_cap)}</td><td class="r hide-s">${moneyBig(c.total_volume)}</td><td class="hide-s spark7">${sparkSVG(c.spark, up7 ? 'var(--up)' : 'var(--dn)', 28)}</td>
      <td>${cid ? `<button class="star${inW ? ' on' : ''}" data-star="${cid}" title="${inW ? t('inWatch') : t('addWatch')}">${inW ? '★' : '☆'}</button>` : ''}</td></tr>`;
  }).join('');
  $('#mk-more').hidden = rows.length <= state.mkN;
  $$('#mk-table th[data-k]').forEach(th => { th.classList.toggle('sorted', th.dataset.k === k); th.dataset.dir = th.dataset.k === k ? (dir > 0 ? '↑' : '↓') : ''; });
}
function openSym(sym) {
  const id = cdcFor(sym); if (!id) return;
  state.asset = id; store.set('asset', id); fillSelects(); loadChart(); renderWatch();
  const c = $('#sec-chart'); if (c.hidden) return; if (c.classList.contains('closed')) $('.head h2', c).click(); c.scrollIntoView({behavior:'smooth', block:'start'});
}

// ---------- бульбашки ----------
let bbCache = null;
function renderBubbles() {
  const el = $('#bubbles'), M = (state.mk || []).slice(0, 100);
  if (!M.length || $('#sec-bubbles').hidden || $('#sec-bubbles').classList.contains('closed')) return;
  const key = {'1h':'price_change_percentage_1h_in_currency', '24h':'price_change_percentage_24h_in_currency', '7d':'price_change_percentage_7d_in_currency'}[state.bbPer];
  const W = el.clientWidth || 800, H = innerWidth < 600 ? 420 : 520;
  const items = M.filter(c => c[key] != null).map(c => ({c, v: c[key]}));
  const raw = items.map(it => state.bbSize === 'chg' ? Math.sqrt(Math.abs(it.v) + 0.3) : Math.sqrt(Math.sqrt(it.c.market_cap || 1)));
  const sum = raw.reduce((s, r) => s + r * r * Math.PI, 0), k = Math.sqrt(W * H * 0.6 / sum);
  const prev = bbCache && bbCache.W === W ? Object.fromEntries(bbCache.nodes.map(n => [n.id, n])) : {};
  const nodes = items.map((it, i) => { const r = clamp(raw[i] * k, 9, Math.min(W, H) / 5), p = prev[it.c.id]; return {id: it.c.id, it, r, x: p ? p.x : W / 2 + (Math.random() - .5) * W * .8, y: p ? p.y : H / 2 + (Math.random() - .5) * H * .8}; });
  for (let iter = 0; iter < 240; iter++) {
    for (const n of nodes) { n.x += (W / 2 - n.x) * 0.004; n.y += (H / 2 - n.y) * 0.006; }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, min = a.r + b.r + 2;
      if (d < min) { const m = (min - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * m; a.y -= uy * m; b.x += ux * m; b.y += uy * m; }
    }
    for (const n of nodes) { n.x = clamp(n.x, n.r, W - n.r); n.y = clamp(n.y, n.r, H - n.r); }
  }
  bbCache = {W, nodes};
  const defs = [], P = [];
  nodes.forEach((n, i) => {
    const v = n.it.v, int = clamp(Math.abs(v) / 10, .25, 1), col = v >= 0 ? '34,197,94' : '239,68,68';
    defs.push(`<radialGradient id="bg${i}" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="rgba(${col},${(int * .12).toFixed(2)})"/><stop offset=".75" stop-color="rgba(${col},${(int * .32).toFixed(2)})"/><stop offset="1" stop-color="rgba(${col},${(int * .9).toFixed(2)})"/></radialGradient>`);
    const fs = clamp(n.r / 2.6, 8, 22), sym = n.it.c.symbol;
    P.push(`<g class="bub" data-sym="${esc(sym)}" transform="translate(${n.x.toFixed(1)},${n.y.toFixed(1)})"><circle r="${n.r.toFixed(1)}" fill="url(#bg${i})" stroke="rgba(${col},.9)" stroke-width="1.5"/>${n.r > 14 ? `<text y="${(-fs * 0.1).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="var(--fg)">${esc(sym)}</text><text y="${(fs * 0.95).toFixed(1)}" text-anchor="middle" font-size="${(fs * 0.72).toFixed(1)}" fill="var(--fg)" opacity=".85">${pct(v, 1)}</text>` : ''}</g>`);
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs.join('')}</defs>${P.join('')}</svg>`;
  $$('.bub', el).forEach(g => { const c = M.find(x => x.symbol === g.dataset.sym); if (!c) return;
    g.addEventListener('mousemove', e => showTip(`<b>${esc(c.name)}</b> (${esc(c.symbol)}) #${c.market_cap_rank}<br>${money(c.current_price)}<br>1h ${pct(c.price_change_percentage_1h_in_currency, 1)} · 24h ${pct(c.price_change_percentage_24h_in_currency, 1)} · 7d ${pct(c.price_change_percentage_7d_in_currency, 1)}<br>${t('mcap')} ${moneyBig(c.market_cap)}`, e.clientX, e.clientY));
    g.addEventListener('mouseleave', hideTip); g.addEventListener('click', () => openSym(c.symbol)); });
}

// ---------- карта ліквідацій ----------
let liqReq = 0;
async function loadLiq() {
  if ($('#sec-liq').hidden || $('#sec-liq').classList.contains('closed')) return;
  const my = ++liqReq, el = $('#liq'), coin = state.liqCoin, days = state.liqDays;
  if (el.dataset.k !== coin + days) el.innerHTML = '<div class="skel" style="height:300px"></div>';
  let rows = [];
  try { const end = Date.now(), j = await hl({type:'candleSnapshot', req:{coin, interval:'1h', startTime: end - days * 86400e3, endTime: end}}); rows = (j || []).map(c => ({t:+c.t, o:+c.o, h:+c.h, l:+c.l, c:+c.c, v:+c.v})); } catch {}
  if (!rows.length) { try { rows = await candlesCDC(coin + '_USD', '1h', Math.min(300, days * 24)); } catch {} }
  if (my !== liqReq) return;
  el.dataset.k = coin + days;
  if (rows.length < 10) { el.innerHTML = `<div class="empty" style="height:120px">${t('noChart')}</div>`; return; }
  const price = rows.at(-1).c, lo = price * 0.85, hi = price * 1.15, NB = 64, bw = (hi - lo) / NB;
  const bins = new Array(NB).fill(0), n = rows.length, sufMin = new Array(n + 1).fill(Infinity), sufMax = new Array(n + 1).fill(-Infinity);
  for (let i = n - 1; i >= 0; i--) { sufMin[i] = Math.min(sufMin[i + 1], rows[i].l); sufMax[i] = Math.max(sufMax[i + 1], rows[i].h); }
  const LEV = [[10, .3], [25, .3], [50, .25], [100, .15]];
  rows.forEach((r, i) => {
    const p = (r.h + r.l + r.c) / 3, notional = (r.v || 0) * p;
    for (const [L, w] of LEV) {
      const ll = p * (1 - 1 / L + 0.005), sl = p * (1 + 1 / L - 0.005);
      if (sufMin[i + 1] > ll && ll >= lo) { const b = Math.floor((ll - lo) / bw); if (b >= 0 && b < NB) bins[b] += notional * w; }
      if (sufMax[i + 1] < sl && sl <= hi) { const b = Math.floor((sl - lo) / bw); if (b >= 0 && b < NB) bins[b] += notional * w; }
    }
  });
  const mx = Math.max(...bins) || 1;
  const W = el.clientWidth || 600, H = 380, padL = 74, padR = 10, padT = 8, padB = 8, ih = H - padT - padB, bh = ih / NB;
  const y = (pr) => padT + (hi - pr) / (hi - lo) * ih, P = [];
  for (let k = 0; k <= 6; k++) { const pr = lo + (hi - lo) * k / 6; P.push(`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(pr)}" y2="${y(pr)}"/><text class="ax" x="${padL - 6}" y="${y(pr) + 4}" text-anchor="end">${moneyAxis(pr)}</text>`); }
  for (let b = 0; b < NB; b++) { if (!bins[b]) continue; const p0 = lo + b * bw, w = bins[b] / mx * (W - padL - padR - 100);
    P.push(`<rect x="${padL}" y="${(y(p0 + bw) + 0.5).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, bh - 1).toFixed(1)}" rx="2" fill="${p0 > price ? 'var(--dn)' : 'var(--up)'}" opacity="${(.35 + .65 * bins[b] / mx).toFixed(2)}"/>`); }
  P.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(price)}" y2="${y(price)}" stroke="var(--fg)" stroke-width="1.5" stroke-dasharray="5 3"/><rect x="${W - padR - 104}" y="${y(price) - 10}" width="104" height="20" rx="5" fill="var(--fg)"/><text x="${W - padR - 52}" y="${y(price) + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--bg)">${t('current')} ${moneyAxis(price)}</text>`);
  const top = bins.map((v, b) => ({v, b})).filter(x => x.v).sort((a, b) => b.v - a.v).slice(0, 6).sort((a, b) => b.b - a.b);
  el.innerHTML = `<div class="liq-w"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${P.join('')}</svg></div>
    <div class="liq-top"><div class="muted small">${t('liqTop')}</div>${top.map(x => { const p0 = lo + (x.b + .5) * bw; return `<div class="lt"><span class="dot ${p0 > price ? 'red' : 'green'}"></span>${moneyAxis(p0)} <span class="muted">(${pct((p0 / price - 1) * 100, 1)})</span><span class="r">${Math.round(x.v / mx * 100)} <span class="muted">${t('intensity')}</span></span></div>`; }).join('')}
    <div class="liq-leg"><span><span class="dot red"></span>${t('liqShort')}</span><span><span class="dot green"></span>${t('liqLong')}</span></div></div>`;
}

// ---------- календар ----------
const FF_UA = {'CPI m/m':'Інфляція CPI м/м','CPI y/y':'Інфляція CPI р/р','Core CPI m/m':'Базова інфляція CPI м/м','Non-Farm Employment Change':'Нові робочі місця (NFP)','Unemployment Rate':'Рівень безробіття',
  'Federal Funds Rate':'Ставка ФРС','FOMC Statement':'Заява ФРС','FOMC Press Conference':'Пресконференція ФРС','FOMC Meeting Minutes':'Протокол ФРС','Advance GDP q/q':'ВВП (попередній)','Prelim GDP q/q':'ВВП (уточнений)','Final GDP q/q':'ВВП (фінальний)',
  'Core PCE Price Index m/m':'Базовий PCE м/м','PPI m/m':'Ціни виробників PPI м/м','Core PPI m/m':'Базовий PPI м/м','Retail Sales m/m':'Роздрібні продажі','Core Retail Sales m/m':'Базові роздрібні продажі',
  'Unemployment Claims':'Заявки на допомогу з безробіття','ISM Manufacturing PMI':'ISM промисловість','ISM Services PMI':'ISM послуги','JOLTS Job Openings':'Вакансії JOLTS','CB Consumer Confidence':'Довіра споживачів',
  'Prelim UoM Consumer Sentiment':'Настрої споживачів (Мічиган)','Main Refinancing Rate':'Ставка ЄЦБ','Monetary Policy Statement':'Заява ЄЦБ','ECB Press Conference':'Пресконференція ЄЦБ','Fed Chair Powell Speaks':'Виступ голови ФРС','ADP Non-Farm Employment Change':'Зайнятість ADP',
  'Bank Holiday':'Вихідний','Flash Manufacturing PMI':'PMI промисловість (попер.)','Flash Services PMI':'PMI послуги (попер.)','German Flash Manufacturing PMI':'PMI промисловість Німеччини','French Flash Manufacturing PMI':'PMI промисловість Франції','French Flash Services PMI':'PMI послуги Франції'};
const FF_KIND = (title) => /CPI/.test(title) && !/Core/.test(title) ? 'cpi' : /Non-Farm Employment/.test(title) && !/ADP/.test(title) ? 'jobs' : /Federal Funds|FOMC Statement/.test(title) ? 'fed' : /Main Refinancing/.test(title) ? 'ecb' : 'ff';
function nthWeekday(y, m, wd, n) { const d = new Date(Date.UTC(y, m, 1)); let c = 0; for (;;) { if (d.getUTCDay() === wd && ++c === n) return new Date(d); d.setUTCDate(d.getUTCDate() + 1); } }
function lastWeekday(y, m, wd) { const d = new Date(Date.UTC(y, m + 1, 0)); while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() - 1); return d; }
function buildEvents(from, to) {
  const out = [];
  for (const e of state.events || []) out.push({ts: new Date(e.ts), kind: e.kind, imp: e.imp, title: e.title[LANG] || e.title.uk, why: e.why[LANG] || e.why.uk, allDay: e.kind === 'holiday'});
  for (const e of ((state.live && state.live.calendar) || [])) {
    const d = new Date(e.ts), kind = e.country === 'USD' || (e.country === 'EUR' && /Refinancing/.test(e.title)) ? FF_KIND(e.title) : 'ff';
    const vals = [e.actual && `${t('actual')} ${e.actual}`, e.forecast && `${t('forecast')} ${e.forecast}`, e.previous && `${t('previous')} ${e.previous}`].filter(Boolean).join(' · ');
    const dup = kind !== 'ff' && out.find(x => x.kind === kind && ymd(x.ts) === ymd(d));
    if (dup) { if (vals) dup.vals = vals; continue; }
    const flag = {USD:'🇺🇸', EUR:'🇪🇺', CNY:'🇨🇳', GBP:'🇬🇧', JPY:'🇯🇵'}[e.country] || e.country;
    out.push({ts: d, kind: 'ff', imp: e.impact, title: `${flag} ${LANG === 'uk' ? (FF_UA[e.title] || e.title) : e.title}`, vals});
  }
  for (const c of (state.brief.calendar || [])) { if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue;
    if (out.some(x => ymd(x.ts) === c.date && (x.kind === 'fed' || x.kind === 'cpi' || x.kind === 'jobs' || x.kind === 'holiday') && /ФРС|Fed|CPI|інфляц|inflation|NFP|робоч|jobs|закрит|closed/i.test(c.event))) continue;
    out.push({ts: new Date(c.date + 'T12:00:00'), kind: 'brief', imp: 'Medium', title: c.event, why: c.why, allDay: true}); }
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) for (let m = 0; m < 12; m++) {
    const q = m % 3 === 2, opx = nthWeekday(y, m, 5, 3); opx.setUTCHours(21);
    out.push({ts: opx, kind: 'opex', imp: q ? 'High' : 'Low', title: q ? t('opexQ') : t('opexT'), why: t('opexW')});
    const cx = lastWeekday(y, m, 5); cx.setUTCHours(8);
    out.push({ts: cx, kind: 'cexp', imp: q ? 'High' : 'Medium', title: q ? t('cexpQ') : t('cexpT'), why: t('cexpW')});
  }
  return out.filter(e => e.ts >= from && e.ts <= to && (!state.calHigh || e.imp === 'High')).sort((a, b) => a.ts - b.ts);
}
const KCOL = {fed:'#ef4444', cpi:'#f97316', jobs:'#eab308', ecb:'#3b82f6', holiday:'#94a3b8', opex:'#a78bfa', cexp:'#ec4899', brief:'#22c55e', ff:'#06b6d4'};
function evRow(e) {
  const time = e.allDay ? '' : hhmm(e.ts);
  return `<div class="ev ${e.imp}"><span class="ev-k" style="background:${KCOL[e.kind] || 'var(--muted)'}"></span><div class="ev-d">${e.ts.toLocaleDateString(LOC(), {weekday:'short', day:'numeric', month:'short'})}${time ? '<br>' + time : ''}</div><div><div class="ev-t">${esc(e.title)}</div>${e.why || e.vals ? `<div class="muted small">${esc([e.vals, e.why].filter(Boolean).join(' — '))}</div>` : ''}</div><span class="imp-dot" title="${t('impact_' + e.imp)}"></span></div>`;
}
function renderCal() {
  const el = $('#cal'), now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate()), to = new Date(from); to.setDate(to.getDate() + state.calRange);
  $$('#cal-range button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.calRange)); $$('#cal-view button').forEach(b => b.classList.toggle('on', b.dataset.v === state.calView)); $('#cal-high').checked = state.calHigh;
  const ev = buildEvents(from, to);
  const legend = `<div class="cal-leg">${['fed', 'cpi', 'jobs', 'ecb', 'ff', 'opex', 'cexp', 'holiday', 'brief'].map(k => `<span><i style="background:${KCOL[k]}"></i>${t('ev_' + k)}</span>`).join('')}</div>`;
  if (state.calView === 'list') {
    let html = '', lastDay = '';
    for (const e of ev) { const day = ymd(e.ts); if (day !== lastDay) { html += `<div class="day-h">${e.ts.toLocaleDateString(LOC(), {weekday:'long', day:'numeric', month:'long'})}</div>`; lastDay = day; } html += evRow(e); }
    el.innerHTML = legend + `<div class="ecal">${html || `<div class="muted">${t('ecalEmpty')}</div>`}</div>`; return;
  }
  const byDay = {}; for (const e of ev) (byDay[ymd(e.ts)] = byDay[ymd(e.ts)] || []).push(e);
  const months = [], c = new Date(from.getFullYear(), from.getMonth(), 1); while (c <= to) { months.push(new Date(c)); c.setMonth(c.getMonth() + 1); }
  const wd = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(LOC(), {weekday:'short'}));
  const compact = state.calRange > 40;
  let html = `<div class="months${compact ? ' compact' : ''}">`;
  for (const m of months) {
    html += `<div class="month"><div class="m-h">${m.toLocaleDateString(LOC(), {month:'long', year:'numeric'})}</div><div class="m-g">${wd.map(w => `<div class="wd">${w}</div>`).join('')}`;
    const first = (m.getDay() + 6) % 7, dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    for (let i = 0; i < first; i++) html += '<div class="dc empty"></div>';
    for (let d = 1; d <= dim; d++) {
      const dt = new Date(m.getFullYear(), m.getMonth(), d), key = ymd(dt), es = byDay[key] || [], out = dt < from || dt > to;
      const chips = compact ? `<div class="dots">${es.slice(0, 6).map(e => `<i style="background:${KCOL[e.kind]}"></i>`).join('')}</div>` : es.slice(0, 3).map(e => `<span class="cc" style="--c:${KCOL[e.kind]}">${esc(e.title.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '').slice(0, 22))}</span>`).join('') + (es.length > 3 ? `<span class="more-n">+${es.length - 3}</span>` : '');
      html += `<button class="dc${out ? ' out' : ''}${key === ymd(now) ? ' today' : ''}${key === state.calDay ? ' sel' : ''}${es.some(e => e.imp === 'High') ? ' hi' : ''}" data-day="${key}"><span class="dnum">${d}</span>${chips}</button>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  const sel = state.calDay && byDay[state.calDay];
  el.innerHTML = legend + html + `<div class="day-detail">${sel ? `<div class="day-h">${new Date(state.calDay + 'T12:00:00').toLocaleDateString(LOC(), {weekday:'long', day:'numeric', month:'long'})}</div>` + sel.map(evRow).join('') : `<div class="muted small">${t('pickDay')}</div>`}</div>`;
}
async function loadEvents() { try { const j = await getJSON(BASE + 'data/events.json?t=' + Math.floor(Date.now() / 36e5), 10000); if (j && j.events) { state.events = j.events; store.set('events', j.events); } } catch {} renderCal(); }

// ---------- бриф: розділи ----------
function renderBriefSections() {
  const B = state.brief;
  $('#lights').innerHTML = (B.posture || []).map(p => `<div class="light"><div class="lh"><span class="dot ${esc(p.light)}"></span>${esc(p.asset)}<span class="pos">${esc(p.posture || '')}</span></div><p>${esc(p.plain)}</p></div>`).join('') || `<div class="muted">${t('noBriefData')}</div>`;
  $('#plain').innerHTML = (B.plain || []).slice().sort((a, b) => a.order - b.order).map(p => `<div class="pl"><b>${esc(p.label)}</b><p>${esc(p.text)}</p></div>`).join('');
  renderNews();
  const SC = (s) => /ведм|bear|ризик|risk/i.test(s) ? 'dn' : /бич|bull|сприят|favo/i.test(s) ? 'up' : 'warn';
  $('#outlook').innerHTML = (B.outlook || []).map(o => `<div class="ol"><div class="oh"><span>${esc(o.area)}</span><span class="st ${SC(o.stance)}">${esc(o.stance)}</span></div><div class="muted">${esc(o.text)}</div></div>`).join('');
  const W = (B.weekly || []).slice().sort((a, b) => a.order - b.order);
  $('#week').textContent = W[0] ? W[0].week : '';
  $('#weekly').innerHTML = W.map(w => `<div><b>${esc(w.label)}</b><p>${esc(w.text)}</p></div>`).join('');
  $('#tips').innerHTML = (B.general || []).slice().sort((a, b) => a.order - b.order).map(g => `<li>${esc(g.text)}</li>`).join('');
  renderCal();
}
const SENT = (s) => ({Bullish:t('bullish'), Bearish:t('bearish'), Neutral:t('neutral'), Mixed:t('mixed')}[s] || s);
function renderNews() {
  const N = (state.brief.news || []).filter(n => state.newsF === 'all' || n.impact === state.newsF);
  $('#news').innerHTML = N.map(n => `<div class="nw"><span class="tag ${esc(n.impact)}">${SENT(n.impact)}</span><div class="ti">${esc(n.title)}</div><div class="why">${esc(n.why)}</div><div class="meta">${esc([n.category, n.assets, n.source].filter(Boolean).join(' · '))}</div></div>`).join('') || `<div class="muted">${t('noNewsFilter')}</div>`;
}

// ---------- новини наживо ----------
function feedItems() {
  const items = (state.live && state.live.items) || [];
  return items.filter(i => (state.liveCat === 'all' || (state.liveCat === 'imp' ? i.imp : state.liveCat === 'telegram' ? i.kind === 'telegram' : i.cat === state.liveCat)) && (state.liveSent === 'all' || i.sent === state.liveSent));
}
const sameLang = (i) => i.lang === LANG;
function itemText(i) { const tr = !sameLang(i) && i.t && i.t[LANG]; return tr && !state.showOrig[i.id] ? {title: tr.title, body: tr.body, tr: true} : {title: i.title, body: i.body, tr: false, canTr: !!tr}; }
function trUrl(i) { return `https://translate.google.com/?sl=auto&tl=${LANG}&text=${encodeURIComponent((i.title + '. ' + (i.body || '')).slice(0, 1200))}&op=translate`; }
function renderFeed() {
  const L = state.live, all = feedItems(), list = all.slice(0, state.feedN), seen = new Set(store.get('seenFeed', []));
  $('#live-count').textContent = L ? (L.items || []).length : '';
  $('#live-upd').textContent = L && L.updated ? t('newsUpd', {t: ago(L.updated)}) : '';
  $('#feed').innerHTML = list.map(i => {
    const x = itemText(i), foreign = !sameLang(i);
    const toggle = x.tr ? `<button class="lnk" data-orig="${i.id}">${t('showOrig')}</button> <span class="muted small">· ${t('translated')}</span>` : x.canTr ? `<button class="lnk" data-orig="${i.id}">${t('showTr')}</button>` : foreign ? `<a class="lnk" href="${trUrl(i)}" target="_blank" rel="noopener">${t('showTr')} ↗</a>` : '';
    return `<article class="fi${i.imp ? ' imp' : ''}${seen.has(i.id) ? '' : ' new'}">
      <div class="fi-h"><span class="tag ${i.sent}">${SENT(i.sent)}</span><span class="src">${esc(i.src)}</span><span class="cat">${esc(t('cat_' + i.cat))}</span>${i.assets && i.assets.length ? `<span class="as">${esc(i.assets.join(' · '))}</span>` : ''}<time>${ago(i.ts)}</time></div>
      <a class="fi-t" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      ${x.body ? `<div class="fi-b">${esc(x.body.slice(0, 240))}${x.body.length > 240 ? '…' : ''}</div>` : ''}
      ${toggle ? `<div class="fi-f">${toggle}</div>` : ''}</article>`;
  }).join('') || `<div class="muted">${t('noNewsFilter')}</div>`;
  $('#feed-more').hidden = all.length <= state.feedN;
}

// ---------- сповіщення ----------
let notifs = store.get('notifs', []);
function updateBadge() { const n = notifs.filter(x => !x.read).length; const b = $('#badge'); b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }
function renderNotifs() { $('#notif-list').innerHTML = notifs.map(n => `<a class="ni${n.read ? '' : ' unread'}" ${n.url ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : ''}><div class="ni-h"><span class="ni-k ${n.kind}">${esc(n.head)}</span><time>${ago(n.ts)}</time></div><div>${esc(n.text)}</div></a>`).join('') || `<div class="muted pad">${t('noNotif')}</div>`; }
let audioCtx;
function beep() { if (!store.get('sound', false)) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.15, audioCtx.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + .35); o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + .4); } catch {} }
function notify(kind, head, text, url) {
  const n = {id: Date.now() + Math.random(), kind, head, text, url, ts: new Date().toISOString(), read: false};
  notifs.unshift(n); notifs = notifs.slice(0, 60); store.set('notifs', notifs); updateBadge(); if (!$('#drawer').hidden) renderNotifs();
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = `<div class="toast-h">${esc(head)}</div><div>${esc(text)}</div>`;
  el.addEventListener('click', () => { if (url) open(url, '_blank', 'noopener'); el.remove(); });
  $('#toasts').prepend(el); while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 9000);
  beep();
  if ('Notification' in window && Notification.permission === 'granted' && store.get('sysNotif', false)) { try { const sn = new Notification(head, {body: text, icon: 'icons/icon-192.png', tag: String(n.id)}); sn.onclick = () => { focus(); if (url) open(url, '_blank', 'noopener'); }; } catch {} }
}
function checkNewsNotifs(fresh) {
  const mode = store.get('nmode', 'imp'), seen = new Set(store.get('seenFeed', [])), items = (fresh && fresh.items) || [];
  if (!seen.size) { store.set('seenFeed', items.map(i => i.id)); return; }
  const novel = items.filter(i => !seen.has(i.id));
  if (mode !== 'off') novel.filter(i => mode === 'all' || i.imp).slice(0, 5).reverse().forEach(i => { const x = itemText(i); notify(i.sent, (i.imp ? '⚡ ' : '') + i.src, x.title, i.url); });
  store.set('seenFeed', [...seen, ...novel.map(i => i.id)].slice(-600));
}
function checkPriceAlerts() {
  const alerts = store.get('alerts', []); let changed = false;
  for (const a of alerts) { const k = state.tickers[a.id]; if (!k || a.done) continue;
    if ((a.op === '>' && k.last >= a.price) || (a.op === '<' && k.last <= a.price)) { a.done = true; changed = true; notify('alert', '🔔 ' + t('alertTitle'), `${fullName(assetFor(a.id))}: ${money(k.last)} (${a.op === '>' ? t('above') : t('below')} ${money(a.price)})`); } }
  if (changed) { store.set('alerts', alerts); renderAlerts(); }
  const day = new Date().toISOString().slice(0, 10), moved = store.get('moved', {});
  for (const id of MOVERS) { const k = state.tickers[id]; if (!k || Math.abs(k.chg) < 5) continue; const key = id + ':' + day + ':' + (k.chg > 0 ? 'u' : 'd'); if (moved[key]) continue; moved[key] = 1;
    notify(k.chg > 0 ? 'Bullish' : 'Bearish', (k.chg > 0 ? '📈 ' : '📉 ') + t('moveTitle'), t('moveText', {a: assetFor(id).tk + ' ' + money(k.last), v: pct(k.chg)})); }
  for (const k in moved) if (!k.includes(day)) delete moved[k]; store.set('moved', moved);
}
function renderAlerts() { const al = store.get('alerts', []); $('#alert-list').innerHTML = al.map((a, i) => `<div class="al${a.done ? ' done' : ''}"><span>${esc(assetFor(a.id).tk)} ${a.op === '>' ? '≥' : '≤'} ${money(a.price)}</span>${a.done ? '<span class="muted small">✓</span>' : ''}<button class="x" data-i="${i}">×</button></div>`).join('') || `<div class="muted small">${t('noAlerts')}</div>`; $('#al-price').placeholder = SYM[CUR].trim(); }
function renderSysBtn() {
  const b = $('#sys-notif');
  if (!('Notification' in window)) { b.textContent = t('unsupported'); b.disabled = true; return; }
  if (Notification.permission === 'denied') { b.textContent = t('blocked'); b.disabled = true; return; }
  const on = Notification.permission === 'granted' && store.get('sysNotif', false); b.textContent = on ? t('enabled') + ' ✓' : t('enable'); b.classList.toggle('primary', !on);
}
async function renderTg() {
  let s = null; try { s = await getJSON(BASE + 'data/tg.json?t=' + Date.now(), 8000); } catch {}
  const st = !s || !s.configured ? ['off', t('tgOff')] : s.enabled ? ['on', t('tgOn')] : ['pause', t('tgPaused')];
  $('#tg').innerHTML = `<div class="set-row"><span class="tg-st ${st[0]}">● ${esc(st[1])}</span>${s && s.bot ? `<a class="btn small primary" href="https://t.me/${esc(s.bot)}" target="_blank" rel="noopener">${t('tgOpen')} @${esc(s.bot)}</a>` : ''}</div>
    ${s && s.last ? `<div class="muted small">${t('tgLast')}: ${ago(s.last)}</div>` : ''}
    ${!s || !s.configured || !s.chat ? `<div class="tg-steps"><b>${t('tgSteps')}</b><ol><li>${esc(t('tg1'))}</li><li>${esc(t('tg2'))}</li><li>${esc(t('tg3'))}</li></ol><a class="btn small" href="${REPO}/settings/secrets/actions/new" target="_blank" rel="noopener">${t('tgSecretBtn')} ↗</a></div>` : `<div class="muted small">/on · /off · /important · /all · /prices · /events · /status</div>`}`;
}

// ---------- портфель ----------
function pfGet() { return store.get('portfolio', []); }
function renderPortfolio() {
  const rows = pfGet(); let total = 0, crypto = 0;
  $('#pf-rows').innerHTML = rows.map((r, i) => { const a = assetFor(r.id), k = state.tickers[r.id] || (state.allTick && state.allTick[r.id]), val = k ? k.last * r.amount : null; if (val) { total += val; if (a.g === 'c') crypto += val; }
    return `<tr><td><b>${esc(a.tk)}</b></td><td>${nf(r.amount >= 100 ? 2 : 4).format(r.amount)}</td><td>${k ? money(k.last) : '—'}</td><td>${val != null ? money(val, 2) : '—'}</td><td class="${cls(k && k.chg)}">${k ? pct(k.chg) : '—'}</td><td><button class="x" data-i="${i}">×</button></td></tr>`; }).join('') || `<tr><td colspan="6" class="muted">${t('pfEmpty')}</td></tr>`;
  $('#pf-total').textContent = money(total, 2); $('#pf-crypto').textContent = total ? nf(0).format(crypto / total * 100) + '%' : '—';
}

// ---------- розділи: показ і порядок ----------
const SECTIONS = [['pulse', 1], ['since', 1], ['chart', 1], ['watch', 1], ['live', 1], ['markets', 1], ['bubbles', 1], ['fng', 1], ['auto', 1], ['liq', 1], ['perps', 1], ['lights', 1], ['plain', 1], ['news', 1], ['cal', 1], ['outlook', 1], ['weekly', 1], ['portfolio', 0], ['tips', 0]];
function getLayout() { const saved = store.get('layout', null); if (!saved) return SECTIONS.map(([k, on]) => ({k, on: !!on})); const known = new Set(saved.map(s => s.k)); return [...saved.filter(s => SECTIONS.some(x => x[0] === s.k)), ...SECTIONS.filter(([k]) => !known.has(k)).map(([k, on]) => ({k, on: !!on}))]; }
const isOn = (k) => { const s = getLayout().find(x => x.k === k); return !s || s.on; };
function applyLayout() {
  const main = $('#main'), foot = $('.foot', main);
  for (const s of getLayout()) { const el = $(`[data-sec="${s.k}"]`); if (!el) continue; main.insertBefore(el, foot); if (s.k === 'since') { if (!s.on || !sinceShown) el.hidden = true; } else el.hidden = !s.on; }
  $('#layout-list').innerHTML = getLayout().map((s, i) => `<div class="lay"><label><input type="checkbox" data-lk="${s.k}"${s.on ? ' checked' : ''}> ${esc(t('sec_' + s.k))}</label><span><button data-mv="${i}" data-d="-1">↑</button><button data-mv="${i}" data-d="1">↓</button></span></div>`).join('');
}

// ---------- оновлення ----------
function setStatus(txt) {
  const fresh = Date.now() - state.tickAt < 3 * T_TICK && navigator.onLine !== false;
  $('#live-dot').classList.toggle('on', fresh);
  if (txt) { $('#status').textContent = txt; return; }
  if (!state.tickAt) { $('#status').textContent = t('noPrices'); return; }
  $('#status').textContent = (fresh ? t('live') + ' · ' : '') + t('updated') + ' ' + hhmm(new Date(state.tickAt)) + (navigator.onLine === false ? ' · ' + t('offline') : '');
}
async function loadBrief() {
  try { const j = await getJSON(BASE + 'data/brief.json?t=' + Date.now(), 10000); if (j && j.brief) state.briefUk = j; } catch {}
  state.brief = state.briefUk;
  if (LANG === 'en') { try { const j = await getJSON(BASE + 'data/brief_en.json?t=' + Date.now(), 10000); const a = (state.briefUk.brief || [])[0], b = (j.brief || [])[0]; if (j && b && (!a || a.date === b.date)) state.brief = j; } catch {} }
  renderHero(); renderBriefSections();
}
async function loadLive(first) {
  try { const j = await getJSON(BASE + 'data/live.json?t=' + Date.now(), 10000);
    if (j && j.items) { if (!state.live || state.live.updated !== j.updated || first) checkNewsNotifs(j); state.live = j; store.set('live', j); } } catch {}
  renderFeed(); renderPerps(); renderCal(); renderPulse();
}
async function tick() {
  let ok = false;
  try { Object.assign(state.tickers, await fetchTickers()); ok = true; }
  catch { const fb = await fetchTickersFallback(); if (Object.keys(fb).length) { Object.assign(state.tickers, fb); ok = true; } }
  if (ok) { state.tickAt = Date.now(); store.set('tickers', state.tickers); store.set('tickAt', state.tickAt); renderWatch(); renderPortfolio(); renderChartHead(); checkPriceAlerts(); renderSince(); }
  setStatus();
}
async function loadSparks() {
  const ids = WATCH.slice();
  for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(async id => { try { const r = await getCandles(id, '1h'); if (r.rows.length) state.sparks[id] = r.rows.slice(-24).map(x => x.c); } catch {} }));
  store.set('sparks', state.sparks); renderWatch();
}
let busy = false;
async function refreshAll() {
  if (busy) return; busy = true;
  const btn = $('#refresh'); btn.classList.add('spin'); btn.disabled = true; setStatus(t('loading'));
  await Promise.allSettled([loadRates(), loadBrief(), loadLive(), tick(), loadEvents()]);
  const [fng, btc] = await Promise.allSettled([fetchFng(), getCandles('BTC_USD', '6M')]);
  if (fng.status === 'fulfilled') { state.fng = fng.value; store.set('fng', state.fng); }
  if (btc.status === 'fulfilled' && btc.value.rows.length && !btc.value.hist) { state.btcDaily = btc.value.rows; store.set('btcDaily', state.btcDaily); }
  else if (!state.btcDaily) { const h = candlesHist(assetFor('BTC_USD'), 200); if (h) state.btcDaily = h; }
  renderFng(); renderAuto(); renderPulse(); loadChart(); loadMarkets(); loadLiq(); await loadSparks();
  state.last = Date.now(); store.set('last', state.last);
  btn.classList.remove('spin'); btn.disabled = false; busy = false; setStatus(); renderSince();
}

// ---------- панелі ----------
function openPanel(id) { $$('.drawer').forEach(d => d.hidden = d.id !== id); $('#scrim').hidden = false;
  if (id === 'drawer') { renderNotifs(); notifs.forEach(n => n.read = true); store.set('notifs', notifs); updateBadge(); }
  if (id === 'settings') { renderAlerts(); renderSysBtn(); renderTg(); applyLayout(); } }
function closePanels() { $$('.drawer').forEach(d => d.hidden = true); $('#scrim').hidden = true; }
function fillSelects() {
  const groups = [['c', t('crypto')], ['s', t('stocks')], ['p', t('perpsGrp')]];
  const opts = (list) => groups.map(([g, label]) => { const as = list.filter(a => a.g === g); return as.length ? `<optgroup label="${esc(label)}">` + as.map(a => `<option value="${a.id}">${esc(fullName(a))}</option>`).join('') + '</optgroup>' : ''; }).join('');
  const list = watchAssets(); if (!WATCH.includes(state.asset)) list.unshift(assetFor(state.asset));
  const html = opts(list);
  for (const s of ['#asset-select', '#pf-asset', '#al-asset']) { const el = $(s), v = el.value; el.innerHTML = html; if (v) el.value = v; }
  $('#asset-select').value = state.asset;
  $('#cmp-select').innerHTML = `<option value="">${t('none')}</option>` + opts(list.filter(a => a.id !== state.asset)); $('#cmp-select').value = state.cmp;
  const coins = [...new Set(['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE', ...watchAssets().filter(a => a.g === 'c').map(a => a.tk)])];
  $('#liq-coin').innerHTML = coins.map(c => `<option>${c}</option>`).join(''); $('#liq-coin').value = state.liqCoin;
}
function renderAll() {
  applyI18n(); applyLook(); fillSelects(); applyLayout(); renderHero(); renderBriefSections(); renderWatch(); renderPortfolio(); renderFng(); renderAuto(); renderPulse();
  renderChartHead(); renderFeed(); renderPerps(); renderCal(); renderMarkets(); renderNotifs(); renderAlerts(); renderSysBtn(); redrawChart(); setStatus();
  $('#ver').textContent = 'v' + VERSION;
  $$('#lang-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === LANG)); $$('#cur-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === CUR));
  $$('#nmode-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === store.get('nmode', 'imp'))); $('#sound-tog').checked = store.get('sound', false);
  requestAnimationFrame(renderBubbles);
}
function initCollapse() {
  const saved = store.get('collapsed', {});
  $$('[data-collapse]').forEach(sec => {
    const h = $('.head h2', sec); if (!h) return;
    const closed = !!saved[sec.id]; sec.classList.toggle('closed', closed);
    h.setAttribute('role', 'button'); h.setAttribute('tabindex', '0'); h.setAttribute('aria-expanded', String(!closed));
    const flip = () => { const c = !sec.classList.contains('closed'); sec.classList.toggle('closed', c); h.setAttribute('aria-expanded', String(!c)); const s = store.get('collapsed', {}); s[sec.id] = c; store.set('collapsed', s);
      if (!c) { if (sec.id === 'sec-chart') redrawChart(); if (sec.id === 'sec-bubbles') renderBubbles(); if (sec.id === 'sec-liq') loadLiq(); } };
    h.addEventListener('click', flip); h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  });
}
const seg = (sel, fn) => $(sel).addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !$(sel).contains(b)) return; $$(sel + ' button').forEach(x => x.classList.toggle('on', x === b)); fn(b); });

function init() {
  if (!WATCH.length) WATCH = BASE_ASSETS.map(a => a.id);
  if (!TF[state.tf]) state.tf = '1h';
  const pick = (id) => { state.asset = id; store.set('asset', id); if (state.cmp === id) state.cmp = ''; fillSelects(); renderWatch(); loadChart(); };
  $('#asset-select').addEventListener('change', e => pick(e.target.value));
  $('#cmp-select').addEventListener('change', e => { state.cmp = e.target.value; loadChart(); });
  $('#log-tog').addEventListener('change', e => { state.log = e.target.checked; store.set('log', state.log); redrawChart(); });
  $('#ind-box').addEventListener('change', e => { const k = e.target.dataset.ind; if (!k) return; state.ind[k] = e.target.checked; store.set('ind', state.ind); if (k === 'ema200') loadChart(true); else redrawChart(); });
  $('#watch-grid').addEventListener('click', e => {
    const tile = e.target.closest('.tile'); if (!tile) return; const id = tile.dataset.id;
    if (e.target.closest('[data-rm]')) { setWatch(WATCH.filter(x => x !== id)); return; }
    const mv = e.target.closest('[data-mv]'); if (mv) { const i = WATCH.indexOf(id), j = i + +mv.dataset.mv; if (j < 0 || j >= WATCH.length) return; const w = WATCH.slice(); [w[i], w[j]] = [w[j], w[i]]; setWatch(w); return; }
    if (state.editWatch) return;
    pick(id); const c = $('#sec-chart'); if (c.hidden) return; if (c.classList.contains('closed')) $('.head h2', c).click(); c.scrollIntoView({behavior:'smooth', block:'start'});
  });
  $('#watch-edit').addEventListener('click', () => { state.editWatch = !state.editWatch; renderWatch(); });
  $('#watch-add').addEventListener('click', () => { const p = $('#picker'); p.hidden = !p.hidden; if (!p.hidden) { renderPicker(); $('#picker-q').focus(); } });
  $('#picker-q').addEventListener('input', renderPicker);
  $('#picker-list').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (!b) return; setWatch([...WATCH, b.dataset.add]); renderPicker(); tick(); loadSparks(); });
  seg('#tf-seg', b => { state.tf = b.dataset.tf; store.set('tf', state.tf); loadChart(); });
  seg('#news-seg', b => { state.newsF = b.dataset.f; renderNews(); });
  seg('#live-cat', b => { state.liveCat = b.dataset.c; state.feedN = 12; renderFeed(); });
  seg('#live-sent', b => { state.liveSent = b.dataset.s; state.feedN = 12; renderFeed(); });
  $('#feed-more').addEventListener('click', () => { state.feedN += 20; renderFeed(); });
  $('#feed').addEventListener('click', e => { const b = e.target.closest('[data-orig]'); if (!b) return; const id = b.dataset.orig; state.showOrig[id] = !state.showOrig[id]; renderFeed(); });
  $('#mk-q').addEventListener('input', e => { state.mkQ = e.target.value.trim(); state.mkN = 25; renderMarkets(); });
  $('#mk-more').addEventListener('click', () => { state.mkN += 50; renderMarkets(); });
  $('#mk-table thead').addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th) return; const k = th.dataset.k; state.mkSort = [k, state.mkSort[0] === k ? -state.mkSort[1] : (k === 'market_cap_rank' || k === 'name' ? 1 : -1)]; renderMarkets(); });
  $('#mk-rows').addEventListener('click', e => { const s = e.target.closest('[data-star]'); if (s) { e.stopPropagation(); const id = s.dataset.star; setWatch(WATCH.includes(id) ? WATCH.filter(x => x !== id) : [...WATCH, id]); renderMarkets(); tick(); return; } const tr = e.target.closest('tr[data-sym]'); if (tr) openSym(tr.dataset.sym); });
  $$('#mk-trend,#mk-gain,#mk-lose').forEach(el => el.addEventListener('click', e => { const r = e.target.closest('[data-sym]'); if (r) openSym(r.dataset.sym); }));
  seg('#bb-per', b => { state.bbPer = b.dataset.v; renderBubbles(); });
  seg('#bb-size', b => { state.bbSize = b.dataset.v; bbCache = null; renderBubbles(); });
  $('#liq-coin').addEventListener('change', e => { state.liqCoin = e.target.value; store.set('liqCoin', state.liqCoin); loadLiq(); });
  seg('#liq-range', b => { state.liqDays = +b.dataset.v; loadLiq(); });
  seg('#cal-range', b => { state.calRange = +b.dataset.v; store.set('calRange', state.calRange); renderCal(); });
  seg('#cal-view', b => { state.calView = b.dataset.v; store.set('calView', state.calView); renderCal(); });
  $('#cal-high').addEventListener('change', e => { state.calHigh = e.target.checked; store.set('calHigh', state.calHigh); renderCal(); });
  $('#cal').addEventListener('click', e => { const d = e.target.closest('[data-day]'); if (!d) return; state.calDay = state.calDay === d.dataset.day ? null : d.dataset.day; renderCal(); });
  $('#since-x').addEventListener('click', () => { $('#sec-since').hidden = true; });
  $('#refresh').addEventListener('click', () => refreshAll());
  $('#bell').addEventListener('click', () => openPanel('drawer'));
  $('#settings-btn').addEventListener('click', () => openPanel('settings'));
  $('#scrim').addEventListener('click', closePanels); $$('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });
  $('#notif-clear').addEventListener('click', () => { notifs = []; store.set('notifs', notifs); renderNotifs(); updateBadge(); });
  seg('#lang-seg', b => { LANG = b.dataset.v; store.set('lang', LANG); renderAll(); loadBrief(); renderTg(); });
  seg('#cur-seg', b => { CUR = b.dataset.v; store.set('cur', CUR); loadRates().then(() => { renderAll(); loadLiq(); }); });
  seg('#theme-seg', b => { store.set('theme', b.dataset.v); applyLook(); redrawChart(); });
  seg('#dens-seg', b => { store.set('density', b.dataset.v); applyLook(); });
  $('#accent-sw').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; store.set('accent', b.dataset.c); applyLook(); redrawChart(); });
  $('#layout-list').addEventListener('change', e => { const k = e.target.dataset.lk; if (!k) return; const L = getLayout(); L.find(s => s.k === k).on = e.target.checked; store.set('layout', L); applyLayout(); if (e.target.checked) { if (k === 'bubbles') renderBubbles(); if (k === 'liq') loadLiq(); if (k === 'chart') redrawChart(); } });
  $('#layout-list').addEventListener('click', e => { const b = e.target.closest('[data-mv]'); if (!b) return; const L = getLayout(), i = +b.dataset.mv, j = i + +b.dataset.d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; store.set('layout', L); applyLayout(); });
  $('#layout-reset').addEventListener('click', () => { store.set('layout', null); applyLayout(); renderBubbles(); loadLiq(); redrawChart(); });
  seg('#nmode-seg', b => store.set('nmode', b.dataset.v));
  $('#sound-tog').addEventListener('change', e => { store.set('sound', e.target.checked); if (e.target.checked) beep(); });
  $('#sys-notif').addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted' && store.get('sysNotif', false)) { store.set('sysNotif', false); renderSysBtn(); return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); store.set('sysNotif', p === 'granted'); renderSysBtn();
    if (p === 'granted') notify('alert', t('notifications'), t('enabled') + ' ✓');
  });
  $('#alert-form').addEventListener('submit', e => { e.preventDefault(); const price = parseFloat($('#al-price').value) / rate(); if (!(price > 0)) return; const al = store.get('alerts', []); al.push({id: $('#al-asset').value, op: $('#al-op').value, price, done: false}); store.set('alerts', al); $('#al-price').value = ''; renderAlerts(); });
  $('#alert-list').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; const al = store.get('alerts', []); al.splice(+b.dataset.i, 1); store.set('alerts', al); renderAlerts(); });
  $('#pf-form').addEventListener('submit', e => { e.preventDefault(); const amt = parseFloat($('#pf-amount').value); if (!(amt > 0)) return; const rows = pfGet(), id = $('#pf-asset').value, ex = rows.find(r => r.id === id); if (ex) ex.amount += amt; else rows.push({id, amount: amt}); store.set('portfolio', rows); $('#pf-amount').value = ''; renderPortfolio(); });
  $('#pf-rows').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; const rows = pfGet(); rows.splice(+b.dataset.i, 1); store.set('portfolio', rows); renderPortfolio(); });
  document.addEventListener('animationend', e => e.target.classList && e.target.classList.remove('flash-up', 'flash-dn'));
  initCollapse(); renderAll(); updateBadge();
  let rz, lw = innerWidth; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(innerWidth - lw) < 20) return; lw = innerWidth; redrawChart(); renderBubbles(); loadLiq(); }, 200); });

  refreshAll().then(() => loadLive(true));
  setInterval(tick, T_TICK);
  setInterval(() => { if (document.visibilityState === 'visible' && TF[state.tf].intra) loadChart(true); }, T_CHART);
  setInterval(() => loadLive(), T_LIVE);
  setInterval(loadBrief, T_BRIEF);
  setInterval(() => { if (document.visibilityState === 'visible') loadMarkets(); }, T_MK);
  setInterval(() => { if (document.visibilityState === 'visible') loadLiq(); }, T_LIQ);
  setInterval(() => { if (Date.now() - state.last >= T_FULL) refreshAll(); }, 60e3);
  setInterval(() => { renderFeed(); setStatus(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSnap(); else { tick(); loadLive(); if (Date.now() - state.last >= T_FULL) refreshAll(); } });
  addEventListener('pagehide', saveSnap);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
})();
