/* Фінансовий радник 2.0 — автономний застосунок без залежностей і без токенів ШІ. */
(() => {
'use strict';
const VERSION = '2.0.0';
const HOSTED = 'https://dehluloo.github.io/finadvisor/';
const BASE = location.protocol.startsWith('http') ? '' : HOSTED;   // локальна копія бере дані з GitHub
const T_TICK = 30e3, T_LIVE = 120e3, T_BRIEF = 30 * 60e3, T_FULL = 4 * 3600e3, T_CHART = 60e3;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('fa:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fa:' + k, JSON.stringify(v)); } catch {} }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- мова ----------
let LANG = store.get('lang', (navigator.language || 'uk').startsWith('uk') || (navigator.language || '').startsWith('ru') ? 'uk' : 'en');
const t = (k, v) => { let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.uk[k] ?? k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
const LOC = () => LANG === 'uk' ? 'uk-UA' : 'en-US';
function applyI18n() {
  document.documentElement.lang = LANG;
  document.title = t('app');
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

// ---------- тема ----------
function applyTheme() { const th = store.get('theme', 'auto'); document.documentElement.dataset.theme = th; $$('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === th)); }

// ---------- активи ----------
const ASSETS = [
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
const byId = Object.fromEntries(ASSETS.map(a => [a.id, a]));
const nameOf = (a) => typeof a.name === 'object' ? a.name[LANG] : a.name;
const fullName = (a) => { const n = nameOf(a); return n.includes(a.tk) ? n : n + ' (' + a.tk + ')'; };
const MOVERS = ['BTC_USD', 'ETH_USD', 'SOL_USD', 'HYPE_USD'];
const TF = {
  '5m': {cdc:'5m', bn:'5m', okx:'5m', n:150, intra:true}, '15m':{cdc:'15m', bn:'15m', okx:'15m', n:150, intra:true},
  '1h': {cdc:'1h', bn:'1h', okx:'1H', n:150, intra:true}, '4h': {cdc:'4h', bn:'4h', okx:'4H', n:150, intra:true},
  '1M': {cdc:'1D', bn:'1d', okx:'1D', n:30}, '2M': {cdc:'1D', bn:'1d', okx:'1D', n:61},
  '3M': {cdc:'1D', bn:'1d', okx:'1D', n:91}, '6M': {cdc:'1D', bn:'1d', okx:'1D', n:183}
};
const state = {
  asset: store.get('asset', 'BTC_USD'), tf: store.get('tf', '1h'), ma: store.get('ma', true),
  tickers: store.get('tickers', {}), tickAt: store.get('tickAt', 0), sparks: store.get('sparks', {}),
  fng: store.get('fng', null), btcDaily: store.get('btcDaily', null), last: store.get('last', 0),
  brief: window.BRIEF || {}, live: store.get('live', null),
  newsF: 'all', liveCat: 'all', liveSent: 'all', feedN: 12
};

// ---------- форматування ----------
const nf = (d) => new Intl.NumberFormat(LOC(), {minimumFractionDigits:d, maximumFractionDigits:d});
const dec = (n) => { n = Math.abs(n); return n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 4 : 6; };
const usd = (n, d) => n == null || isNaN(n) ? '—' : '$' + nf(d ?? dec(n)).format(n);
const usdAxis = (n) => { const a = Math.abs(n); return '$' + nf(a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 4).format(n); };
const usdBig = (n) => n >= 1e9 ? '$' + nf(2).format(n / 1e9) + (LANG === 'uk' ? ' млрд' : 'B') : '$' + nf(0).format(n / 1e6) + (LANG === 'uk' ? ' млн' : 'M');
const pct = (n, d = 2) => n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + nf(d).format(n) + '%';
const cls = (n) => n > 0 ? 'up' : n < 0 ? 'dn' : '';
const hhmm = (d) => d.toLocaleTimeString(LOC(), {hour:'2-digit', minute:'2-digit'});
const ddmm = (d) => d.toLocaleDateString(LOC(), {day:'2-digit', month:'2-digit'});
const ago = (ts) => { const m = Math.round((Date.now() - new Date(ts)) / 60000); return m < 1 ? t('justNow') : m < 60 ? t('minAgo', {n:m}) : t('hAgo', {n:Math.round(m / 60)}); };

// ---------- мережа ----------
async function getJSON(url, ms = 12000) {
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, {signal:c.signal, cache:'no-store'}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
const CDC = 'https://api.crypto.com/exchange/v1/public/';
async function fetchTickers() {
  const j = await getJSON(CDC + 'get-tickers');
  const want = new Set(ASSETS.map(a => a.id)), out = {};
  for (const d of (j.result && j.result.data) || []) if (want.has(d.i)) out[d.i] = {last:+d.a, high:+d.h, low:+d.l, chg:+d.c * 100, t:+d.t};
  if (!Object.keys(out).length) throw new Error('empty');
  return out;
}
async function fetchTickersFallback() {
  const out = {};
  try {
    const syms = [...new Set(ASSETS.filter(a => a.bn).map(a => a.bn))];
    const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(syms)));
    const m = Object.fromEntries(j.map(x => [x.symbol, x]));
    for (const a of ASSETS) if (a.bn && m[a.bn]) { const x = m[a.bn]; out[a.id] = {last:+x.lastPrice, high:+x.highPrice, low:+x.lowPrice, chg:+x.priceChangePercent, t:+x.closeTime}; }
  } catch {}
  return out;
}
const norm = (rows) => rows.filter(r => isFinite(r.o) && isFinite(r.c)).sort((a, b) => a.t - b.t);
async function candlesCDC(inst, tf, n) {
  const j = await getJSON(`${CDC}get-candlestick?instrument_name=${encodeURIComponent(inst)}&timeframe=${tf}&count=${Math.min(300, n)}`);
  const rows = ((j.result && j.result.data) || []).map(d => ({t:+d.t, o:+d.o, h:+d.h, l:+d.l, c:+d.c}));
  if (!rows.length) throw new Error('no candles'); return norm(rows);
}
async function candlesBN(sym, tf, n) { const j = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${Math.min(1000, n)}`); return norm(j.map(k => ({t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4]}))); }
async function candlesOKX(inst, tf, n) { const j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${tf}&limit=${Math.min(300, n)}`); return norm((j.data || []).map(k => ({t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4]}))); }
function candlesHist(a, n) {
  const key = a.hist || (a.id === 'SPYUSD-PERP' ? 'SPX' : a.id === 'XAUUSD-PERP' ? 'GOLD' : '');
  const h = (state.brief.hist || {})[key]; if (!h) return null;
  return h.map(r => ({t:Date.parse(r[0] + 'T00:00:00Z'), o:r[1], h:r[2], l:r[3], c:r[4]})).slice(-n);
}
async function getCandles(id, tfKey, extra = 0) {
  const a = byId[id], tf = TF[tfKey], n = tf.n + extra;
  const tries = [['Crypto.com', () => candlesCDC(id, tf.cdc, n)]];
  if (a.alt) tries.push(['Crypto.com', () => candlesCDC(a.alt, tf.cdc, n)]);
  if (a.bn) tries.push(['Binance', () => candlesBN(a.bn, tf.bn, n)]);
  if (a.okx) tries.push(['OKX', () => candlesOKX(a.okx, tf.okx, n)]);
  for (const [src, fn] of tries) { try { const rows = await fn(); if (rows.length > 2) { store.set('c:' + id + ':' + tfKey, rows.slice(-n)); return {rows, src}; } } catch {} }
  const cached = store.get('c:' + id + ':' + tfKey, null);
  if (cached) return {rows: cached, src: t('saved'), stale: true};
  if (!tf.intra) { const h = candlesHist(a, n); if (h) return {rows: h, src: t('briefData'), stale: true, hist: true}; }
  return {rows: [], src: ''};
}
async function fetchFng() { const j = await getJSON('https://api.alternative.me/fng/?limit=60'); return (j.data || []).map(d => ({v:+d.value, label:d.value_classification, t:+d.timestamp * 1000})).reverse(); }

// ---------- графік ----------
const tipEl = $('#tip');
function showTip(html, x, y) { tipEl.innerHTML = html; tipEl.hidden = false; const w = tipEl.offsetWidth; tipEl.style.left = Math.min(innerWidth - w - 8, x + 14) + 'px'; tipEl.style.top = Math.max(8, y - 10) + 'px'; }
function hideTip() { tipEl.hidden = true; }
function smaSeries(rows, n) { const out = []; let s = 0; rows.forEach((r, i) => { s += r.c; if (i >= n) s -= rows[i - n].c; out.push(i >= n - 1 ? s / n : null); }); return out; }
function drawCandles(el, all, show, intra) {
  if (!all || !all.length) { el.innerHTML = `<div class="empty">${esc(t('noChart'))}</div>`; $('#chart-legend').textContent = ''; return; }
  const m20 = smaSeries(all, 20), m50 = smaSeries(all, 50), off = Math.max(0, all.length - show);
  const rows = all.slice(off), a20 = m20.slice(off), a50 = m50.slice(off);
  const W = el.clientWidth || 600, H = el.clientHeight || 320, padL = 6, padR = 64, padT = 10, padB = 24, iw = W - padL - padR, ih = H - padT - padB;
  let lo = Infinity, hi = -Infinity;
  rows.forEach((r, i) => { lo = Math.min(lo, r.l); hi = Math.max(hi, r.h); if (state.ma) for (const v of [a20[i], a50[i]]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
  const span = hi - lo || hi * 0.01 || 1; lo -= span * 0.05; hi += span * 0.05;
  const y = (v) => padT + (hi - v) / (hi - lo) * ih, step = iw / rows.length, bw = Math.max(1, Math.min(14, step * 0.68)), x = (i) => padL + step * i + step / 2;
  const P = [];
  P.push(`<defs><linearGradient id="gfade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".10"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`);
  for (let k = 0; k <= 5; k++) { const v = lo + (hi - lo) * k / 5, yy = y(v); P.push(`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text class="ax" x="${W - padR + 6}" y="${yy + 4}">${usdAxis(v)}</text>`); }
  const nx = Math.max(2, Math.floor(iw / 90)), every = Math.max(1, Math.round(rows.length / nx));
  rows.forEach((r, i) => { if (i % every === 0) { const d = new Date(r.t); P.push(`<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${intra ? hhmm(d) : ddmm(d)}</text>`); } });
  rows.forEach((r, i) => {
    const up = r.c >= r.o, col = up ? 'var(--up)' : 'var(--dn)', top = y(Math.max(r.o, r.c)), bh = Math.max(1, Math.abs(y(r.o) - y(r.c)));
    P.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${y(r.h)}" y2="${y(r.l)}" stroke="${col}"/><rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${col}" rx="${bw > 4 ? 1.2 : 0}"/>`);
  });
  if (state.ma) for (const [ser, col] of [[a20, 'var(--ma1)'], [a50, 'var(--ma2)']]) {
    const pts = ser.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean);
    if (pts.length > 1) P.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" opacity=".95"/>`);
  }
  const lc = rows[rows.length - 1].c, ly = y(lc), lu = lc >= rows[rows.length - 1].o, lcol = lu ? 'var(--up)' : 'var(--dn)';
  P.push(`<line x1="${padL}" x2="${W - padR}" y1="${ly}" y2="${ly}" stroke="${lcol}" stroke-dasharray="2 3" opacity=".8"/><rect x="${W - padR + 2}" y="${ly - 9}" width="${padR - 4}" height="18" rx="4" fill="${lcol}"/><text x="${W - padR + 6}" y="${ly + 4}" font-size="11" fill="#fff" font-weight="600">${usdAxis(lc)}</text>`);
  P.push(`<line class="xh" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/><line class="yh" x1="${padL}" x2="${W - padR}" y1="0" y2="0" visibility="hidden"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${P.join('')}</svg>`;
  const svg = el.firstChild, xh = svg.querySelector('.xh'), yh = svg.querySelector('.yh');
  const move = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev, b = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor(((p.clientX - b.left) / b.width * W - padL) / step)));
    const r = rows[i], d = new Date(r.t), chg = (r.c - r.o) / r.o * 100, yy = (p.clientY - b.top) / b.height * H;
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    yh.setAttribute('y1', yy); yh.setAttribute('y2', yy); yh.setAttribute('visibility', 'visible');
    const ma = state.ma ? `<br><span style="color:var(--ma1)">MA20</span> ${usd(a20[i])} · <span style="color:var(--ma2)">MA50</span> ${usd(a50[i])}` : '';
    showTip(`<b>${intra ? ddmm(d) + ' ' + hhmm(d) : d.toLocaleDateString(LOC())}</b><br>${t('open')} ${usd(r.o)} · ${t('close')} ${usd(r.c)}<br>${t('high')} ${usd(r.h)} · ${t('low')} ${usd(r.l)}<br><span class="${cls(chg)}">${pct(chg)}</span>${ma}`, p.clientX, p.clientY);
  };
  const leave = () => { xh.setAttribute('visibility', 'hidden'); yh.setAttribute('visibility', 'hidden'); hideTip(); };
  svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', leave);
  svg.addEventListener('touchstart', move, {passive:true}); svg.addEventListener('touchmove', move, {passive:true}); svg.addEventListener('touchend', leave);
  $('#chart-legend').innerHTML = state.ma ? `<span class="sw" style="background:var(--ma1)"></span>MA20 ${usd(a20[a20.length - 1])} &nbsp; <span class="sw" style="background:var(--ma2)"></span>MA50 ${usd(a50[a50.length - 1])}` : '';
}
function sparkSVG(vals, color, h = 30, fill) {
  if (!vals || vals.length < 2) return `<svg viewBox="0 0 100 ${h}"></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 100).toFixed(2)},${(h - 2 - (v - lo) / r * (h - 4)).toFixed(2)}`);
  const area = fill ? `<polygon points="0,${h} ${pts.join(' ')} 100,${h}" fill="${color}" opacity=".12"/>` : '';
  return `<svg viewBox="0 0 100 ${h}" preserveAspectRatio="none">${area}<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

// ---------- секції ----------
function renderHero() {
  const b = (state.brief.brief || [])[0] || {}, el = $('#hero');
  el.classList.remove('red', 'yellow', 'green'); if (b.signal_light) el.classList.add(b.signal_light);
  $('#hero-signal').textContent = b.signal || t('noBrief');
  $('#hero-summary').textContent = b.summary || '';
  $('#hero-date').textContent = b.date ? t('briefFrom') + ' ' + new Date(b.date + 'T12:00:00').toLocaleDateString(LOC(), {day:'numeric', month:'long'}) : t('dailyBrief');
  $('#hero-chips').innerHTML = [b.regime && t('regime') + ': ' + b.regime, b.data_as_of && t('dataAsOf') + ': ' + b.data_as_of, t('briefLangNote')].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('');
}
function renderTape() {
  const items = ASSETS.filter(a => a.id !== 'PAXG_USD').map(a => { const k = state.tickers[a.id]; return k ? `<span class="ti"><b>${a.tk}</b> ${usd(k.last)} <i class="${cls(k.chg)}">${pct(k.chg)}</i></span>` : ''; }).join('');
  $('#tape-in').innerHTML = items ? items + items : '';
  $('#tape').hidden = !items;
}
function tileHTML(a) {
  const k = state.tickers[a.id], s = state.sparks[a.id], chg = k ? k.chg : null, color = chg >= 0 ? 'var(--up)' : 'var(--dn)';
  return `<button class="tile${a.id === state.asset ? ' sel' : ''}" data-id="${a.id}">
    <div class="t1"><span class="tk">${esc(a.tk)}</span><span class="chg ${cls(chg)}">${pct(chg)}</span></div>
    <div class="nm">${esc(nameOf(a))}</div>
    <div class="px" data-px="${a.id}">${k ? usd(k.last) : '<span class="muted">—</span>'}</div>
    ${sparkSVG(s, k ? color : 'var(--muted)', 30, true)}</button>`;
}
const prevPx = {};
function renderWatch() {
  $('#watch-crypto').innerHTML = ASSETS.filter(a => a.g === 'c').map(tileHTML).join('');
  $('#watch-stocks').innerHTML = ASSETS.filter(a => a.g === 's').map(tileHTML).join('');
  for (const a of ASSETS) { const k = state.tickers[a.id]; if (!k) continue; const p = prevPx[a.id]; if (p && p !== k.last) { const el = $(`[data-px="${a.id}"]`); if (el) { el.classList.add(k.last > p ? 'flash-up' : 'flash-dn'); } } prevPx[a.id] = k.last; }
  renderTape();
}
function renderChartHead() {
  const a = byId[state.asset], k = state.tickers[state.asset];
  $('#chart-name').textContent = fullName(a);
  $('#chart-price').textContent = k ? usd(k.last) : '';
  const c = $('#chart-chg'); c.className = 'pill ' + cls(k && k.chg); c.textContent = k ? pct(k.chg) + ' ' + t('for24') : ''; c.hidden = !k;
  $('#chart-hl').textContent = k ? `${t('high')} ${usd(k.high)} · ${t('low')} ${usd(k.low)}` : '';
  $$('#tf-seg button').forEach(b => b.classList.toggle('on', b.dataset.tf === state.tf));
  $('#asset-select').value = state.asset; $('#ma-tog').checked = state.ma;
}
let chartReq = 0, lastChart = null;
async function loadChart(quiet) {
  const my = ++chartReq, el = $('#chart'); renderChartHead();
  if (!quiet && (!lastChart || lastChart.id !== state.asset || lastChart.tf !== state.tf)) el.innerHTML = '<div class="skel" style="height:100%"></div>';
  const res = await getCandles(state.asset, state.tf, 50);
  if (my !== chartReq) return;
  lastChart = {id: state.asset, tf: state.tf, rows: res.rows};
  drawCandles(el, res.rows, TF[state.tf].n, TF[state.tf].intra);
  const a = byId[state.asset], notes = [];
  if (res.src) notes.push(t('source') + ': ' + res.src + (res.stale ? ' (' + t('notLive') + ')' : ''));
  if (a.g === 's' && a.id.endsWith('PERP')) notes.push(t('perpNote'));
  if (res.hist && a.id === 'SPYUSD-PERP') notes.push(t('spxNote'));
  $('#chart-note').textContent = notes.join(' · ');
}
function redrawChart() { if (lastChart) drawCandles($('#chart'), lastChart.rows, TF[lastChart.tf].n, TF[lastChart.tf].intra); }
const FNG_UA = {'Extreme Fear':'Екстремальний страх','Fear':'Страх','Neutral':'Нейтрально','Greed':'Жадібність','Extreme Greed':'Екстремальна жадібність'};
function renderFng() {
  const f = state.fng, bf = (state.brief.fng || [])[0];
  const v = f && f.length ? f[f.length - 1].v : (bf ? +bf.value : null);
  const arc = (a0, a1, col) => { const r = 80, p = (a) => [100 + r * Math.cos(Math.PI * (1 - a)), 100 - r * Math.sin(Math.PI * (1 - a))]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${col}" stroke-width="16" fill="none"/>`; };
  let s = arc(0, .25, 'var(--dn)') + arc(.25, .45, '#f97316') + arc(.45, .55, 'var(--warn)') + arc(.55, .75, '#84cc16') + arc(.75, 1, 'var(--up)');
  if (v != null) { const a = v / 100, x = 100 + 68 * Math.cos(Math.PI * (1 - a)), y = 100 - 68 * Math.sin(Math.PI * (1 - a)); s += `<line x1="100" y1="100" x2="${x}" y2="${y}" stroke="var(--fg)" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="var(--fg)"/>`; }
  $('#fng-gauge').innerHTML = s;
  if (f && f.length) {
    const cur = f[f.length - 1], prev = f[f.length - 2], wk = f[f.length - 8];
    $('#fng-val').textContent = v; $('#fng-label').textContent = LANG === 'uk' ? (FNG_UA[cur.label] || cur.label) : cur.label;
    $('#fng-prev').textContent = [prev && t('yesterday') + ': ' + prev.v, wk && t('weekAgo') + ': ' + wk.v].filter(Boolean).join(' · ');
    $('#fng-hist').innerHTML = sparkSVG(f.slice(-60).map(d => d.v), 'var(--accent)', 60, true);
  } else if (bf) { $('#fng-val').textContent = bf.value; $('#fng-label').textContent = bf.label; $('#fng-prev').textContent = t('fromBriefDate') + ', ' + bf.date; }
}
const sma = (a, n) => { if (a.length < n) return null; let s = 0; for (let i = a.length - n; i < a.length; i++) s += a[i]; return s / n; };
function renderAuto() {
  const el = $('#auto'), d = state.btcDaily, f = state.fng;
  if (!d || d.length < 35) { el.innerHTML = `<div class="muted">${esc(t('needDaily'))}</div>`; return; }
  const c = d.map(r => r.c), last = state.tickers.BTC_USD ? state.tickers.BTC_USD.last : c[c.length - 1];
  const m50 = sma(c, Math.min(50, c.length)), m20 = sma(c, 20), ch30 = (last / c[Math.max(0, c.length - 31)] - 1) * 100, dd = (last / Math.max(...c.slice(-90)) - 1) * 100;
  const fv = f && f.length ? f[f.length - 1].v : null; let score = 0; const why = [];
  if (last > m50) { score++; why.push(t('aAbove50', {v:usd(m50, 0)})); } else { score--; why.push(t('aBelow50', {v:usd(m50, 0)})); }
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
  $('#perps').innerHTML = `<table class="tbl"><thead><tr><th>${t('asset')}</th><th>${t('mark')}</th><th>${t('funding')}</th><th>${t('oi')}</th><th>${t('vol')}</th></tr></thead><tbody>` +
    keys.map(k => { const x = p[k], f8 = x.funding_h * 8 * 100; return `<tr><td><b>${k}</b></td><td>${usd(x.mark)} <span class="chg ${cls(x.mark - x.prev)}">${pct((x.mark / x.prev - 1) * 100)}</span></td><td class="${f8 > 0.03 ? 'dn' : f8 < 0 ? 'up' : ''}">${pct(f8, 4)}</td><td>${usdBig(x.oi_usd)}</td><td>${usdBig(x.vol_usd)}</td></tr>`; }).join('') + '</tbody></table>';
}
function renderBriefSections() {
  const B = state.brief;
  $('#lights').innerHTML = (B.posture || []).map(p => `<div class="light"><div class="lh"><span class="dot ${esc(p.light)}"></span>${esc(p.asset)}<span class="pos">${esc(p.posture || '')}</span></div><p>${esc(p.plain)}</p></div>`).join('') || `<div class="muted">${t('noBriefData')}</div>`;
  $('#plain').innerHTML = (B.plain || []).slice().sort((a, b) => a.order - b.order).map(p => `<div class="pl"><b>${esc(p.label)}</b><p>${esc(p.text)}</p></div>`).join('');
  renderNews();
  const today = new Date().toISOString().slice(0, 10);
  $('#calendar').innerHTML = (B.calendar || []).filter(c => c.date >= today.slice(0, c.date.length)).map(c => `<li><div class="d">${c.date.length > 7 ? new Date(c.date + 'T12:00:00').toLocaleDateString(LOC(), {day:'numeric', month:'short', weekday:'short'}) : esc(c.date)}</div><div>${esc(c.event)}</div><div class="w">${esc(c.why)}</div></li>`).join('');
  const SC = (s) => /ведм|bear|ризик/i.test(s) ? 'dn' : /бич|bull|сприят/i.test(s) ? 'up' : 'warn';
  $('#outlook').innerHTML = (B.outlook || []).map(o => `<div class="ol"><div class="oh"><span>${esc(o.area)}</span><span class="st ${SC(o.stance)}">${esc(o.stance)}</span></div><div class="muted">${esc(o.text)}</div></div>`).join('');
  const W = (B.weekly || []).slice().sort((a, b) => a.order - b.order);
  $('#week').textContent = W[0] ? W[0].week : '';
  $('#weekly').innerHTML = W.map(w => `<div><b>${esc(w.label)}</b><p>${esc(w.text)}</p></div>`).join('');
  $('#tips').innerHTML = (B.general || []).slice().sort((a, b) => a.order - b.order).map(g => `<li>${esc(g.text)}</li>`).join('');
}
const SENT = (s) => ({Bullish:t('bullish'), Bearish:t('bearish'), Neutral:t('neutral'), Mixed:t('mixed')}[s] || s);
function renderNews() {
  const N = (state.brief.news || []).filter(n => state.newsF === 'all' || n.impact === state.newsF);
  $('#news').innerHTML = N.map(n => `<div class="nw"><span class="tag ${esc(n.impact)}">${SENT(n.impact)}</span><div class="ti">${esc(n.title)}</div><div class="why">${esc(n.why)}</div><div class="meta">${esc([n.category, n.assets, n.source].filter(Boolean).join(' · '))}</div></div>`).join('') || `<div class="muted">${t('noNewsFilter')}</div>`;
}
function feedItems() {
  const items = (state.live && state.live.items) || [];
  return items.filter(i => (state.liveCat === 'all' || (state.liveCat === 'imp' ? i.imp : state.liveCat === 'telegram' ? i.kind === 'telegram' : i.cat === state.liveCat)) && (state.liveSent === 'all' || i.sent === state.liveSent));
}
function trUrl(i) { return `https://translate.google.com/?sl=auto&tl=${LANG}&text=${encodeURIComponent((i.title + '. ' + (i.body || '')).slice(0, 1200))}&op=translate`; }
function renderFeed() {
  const L = state.live, all = feedItems(), list = all.slice(0, state.feedN);
  $('#live-count').textContent = L ? (L.items || []).length : '';
  $('#live-upd').textContent = L && L.updated ? t('newsUpd', {t: ago(L.updated)}) : '';
  const seen = new Set(store.get('seenFeed', []));
  $('#feed').innerHTML = list.map(i => {
    const needTr = i.lang !== LANG && !(LANG === 'uk' && i.lang === 'ru');
    return `<article class="fi${i.imp ? ' imp' : ''}${seen.has(i.id) ? '' : ' new'}">
      <div class="fi-h"><span class="tag ${i.sent}">${SENT(i.sent)}</span><span class="src">${esc(i.src)}</span><span class="cat">${esc(t('cat_' + i.cat))}</span>${i.assets && i.assets.length ? `<span class="as">${esc(i.assets.join(' · '))}</span>` : ''}<time>${ago(i.ts)}</time></div>
      <a class="fi-t" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>
      ${i.body ? `<div class="fi-b">${esc(i.body.slice(0, 220))}${i.body.length > 220 ? '…' : ''}</div>` : ''}
      ${needTr ? `<a class="tr" href="${trUrl(i)}" target="_blank" rel="noopener">${t('translate')} ↗</a>` : ''}
    </article>`;
  }).join('') || `<div class="muted">${t('noNewsFilter')}</div>`;
  $('#feed-more').hidden = all.length <= state.feedN;
}
function renderEcal() {
  const C = ((state.live && state.live.calendar) || []).slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const now = Date.now();
  const flag = {USD:'🇺🇸', EUR:'🇪🇺', CNY:'🇨🇳', GBP:'🇬🇧', JPY:'🇯🇵'};
  $('#ecal').innerHTML = C.filter(c => c.impact === 'High' || new Date(c.ts) > now - 86400e3).slice(0, 40).map(c => {
    const d = new Date(c.ts), past = d < now;
    const vals = [c.actual && `${t('actual')} <b>${esc(c.actual)}</b>`, c.forecast && `${t('forecast')} ${esc(c.forecast)}`, c.previous && `${t('previous')} ${esc(c.previous)}`].filter(Boolean).join(' · ');
    return `<div class="ev${past ? ' past' : ''} ${c.impact}"><div class="ev-d">${d.toLocaleDateString(LOC(), {weekday:'short', day:'numeric'})}<br>${hhmm(d)}</div><div><div>${flag[c.country] || c.country} ${esc(c.title)}</div><div class="muted small">${vals}</div></div><span class="imp-dot" title="${t('impact_' + c.impact)}"></span></div>`;
  }).join('') || `<div class="muted">${t('ecalEmpty')}</div>`;
}

// ---------- сповіщення ----------
let notifs = store.get('notifs', []);
function updateBadge() { const n = notifs.filter(x => !x.read).length; const b = $('#badge'); b.textContent = n > 99 ? '99+' : n; b.hidden = !n; }
function renderNotifs() {
  $('#notif-list').innerHTML = notifs.map(n => `<a class="ni${n.read ? '' : ' unread'}" ${n.url ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : ''}><div class="ni-h"><span class="ni-k ${n.kind}">${esc(n.head)}</span><time>${ago(n.ts)}</time></div><div>${esc(n.text)}</div></a>`).join('') || `<div class="muted pad">${t('noNotif')}</div>`;
}
let audioCtx;
function beep() {
  if (!store.get('sound', false)) return;
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.15, audioCtx.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + .35); o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + .4); } catch {}
}
function notify(kind, head, text, url) {
  const n = {id: Date.now() + Math.random(), kind, head, text, url, ts: new Date().toISOString(), read: false};
  notifs.unshift(n); notifs = notifs.slice(0, 60); store.set('notifs', notifs); updateBadge();
  if (!$('#drawer').hidden) renderNotifs();
  const el = document.createElement('div'); el.className = 'toast ' + kind;
  el.innerHTML = `<div class="toast-h">${esc(head)}</div><div>${esc(text)}</div>`;
  el.addEventListener('click', () => { if (url) open(url, '_blank', 'noopener'); el.remove(); });
  $('#toasts').prepend(el); while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 9000);
  beep();
  if ('Notification' in window && Notification.permission === 'granted' && store.get('sysNotif', false)) {
    try { const sn = new Notification(head, {body: text, icon: 'icons/icon-192.png', tag: String(n.id)}); sn.onclick = () => { focus(); if (url) open(url, '_blank', 'noopener'); }; } catch {}
  }
}
function checkNewsNotifs(fresh) {
  const mode = store.get('nmode', 'imp'), seen = new Set(store.get('seenFeed', []));
  const items = (fresh && fresh.items) || [];
  if (!seen.size) { store.set('seenFeed', items.map(i => i.id)); return; }  // перший запуск — без лавини
  const novel = items.filter(i => !seen.has(i.id));
  if (mode !== 'off') {
    const pick = novel.filter(i => mode === 'all' || i.imp).slice(0, 5);
    pick.reverse().forEach(i => notify(i.sent, (i.imp ? '⚡ ' : '') + i.src, i.title, i.url));
  }
  store.set('seenFeed', [...seen, ...novel.map(i => i.id)].slice(-600));
}
function checkPriceAlerts() {
  const alerts = store.get('alerts', []); let changed = false;
  for (const a of alerts) {
    const k = state.tickers[a.id]; if (!k || a.done) continue;
    if ((a.op === '>' && k.last >= a.price) || (a.op === '<' && k.last <= a.price)) {
      a.done = true; changed = true;
      notify('alert', '🔔 ' + t('alertTitle'), `${fullName(byId[a.id])}: ${usd(k.last)} (${a.op === '>' ? t('above') : t('below')} ${usd(a.price)})`);
    }
  }
  if (changed) { store.set('alerts', alerts); renderAlerts(); }
  const day = new Date().toISOString().slice(0, 10), moved = store.get('moved', {});
  for (const id of MOVERS) {
    const k = state.tickers[id]; if (!k || Math.abs(k.chg) < 5) continue;
    const key = id + ':' + day + ':' + (k.chg > 0 ? 'u' : 'd');
    if (moved[key]) continue; moved[key] = 1;
    notify(k.chg > 0 ? 'Bullish' : 'Bearish', (k.chg > 0 ? '📈 ' : '📉 ') + t('moveTitle'), t('moveText', {a: byId[id].tk + ' ' + usd(k.last), v: pct(k.chg)}));
  }
  for (const k in moved) if (!k.includes(day)) delete moved[k];
  store.set('moved', moved);
}
function renderAlerts() {
  const alerts = store.get('alerts', []);
  $('#alert-list').innerHTML = alerts.map((a, i) => `<div class="al${a.done ? ' done' : ''}"><span>${esc(byId[a.id] ? byId[a.id].tk : a.id)} ${a.op === '>' ? '≥' : '≤'} ${usd(a.price)}</span>${a.done ? '<span class="muted small">✓</span>' : ''}<button class="x" data-i="${i}">×</button></div>`).join('') || `<div class="muted small">${t('noAlerts')}</div>`;
}
function renderSysBtn() {
  const b = $('#sys-notif');
  if (!('Notification' in window)) { b.textContent = t('unsupported'); b.disabled = true; return; }
  if (Notification.permission === 'denied') { b.textContent = t('blocked'); b.disabled = true; return; }
  const on = Notification.permission === 'granted' && store.get('sysNotif', false);
  b.textContent = on ? t('enabled') + ' ✓' : t('enable'); b.classList.toggle('primary', !on);
}

// ---------- портфель ----------
const pfGet = () => store.get('portfolio', []);
function renderPortfolio() {
  const rows = pfGet(); let total = 0, crypto = 0;
  $('#pf-rows').innerHTML = rows.map((r, i) => {
    const a = byId[r.id], k = state.tickers[r.id], val = k ? k.last * r.amount : null;
    if (val) { total += val; if (a && a.g === 'c') crypto += val; }
    return `<tr><td><b>${esc(a ? a.tk : r.id)}</b></td><td>${nf(r.amount >= 100 ? 2 : 4).format(r.amount)}</td><td>${k ? usd(k.last) : '—'}</td><td>${val != null ? usd(val, 2) : '—'}</td><td class="${cls(k && k.chg)}">${k ? pct(k.chg) : '—'}</td><td><button class="x" data-i="${i}">×</button></td></tr>`;
  }).join('') || `<tr><td colspan="6" class="muted">${t('pfEmpty')}</td></tr>`;
  $('#pf-total').textContent = usd(total, 2);
  $('#pf-crypto').textContent = total ? nf(0).format(crypto / total * 100) + '%' : '—';
}

// ---------- згортання ----------
function initCollapse() {
  const saved = store.get('collapsed', {});
  $$('[data-collapse]').forEach(sec => {
    const h = $('.head h2', sec); if (!h) return;
    const closed = sec.id in saved ? saved[sec.id] : sec.hasAttribute('data-closed');
    sec.classList.toggle('closed', closed);
    h.setAttribute('role', 'button'); h.setAttribute('tabindex', '0'); h.setAttribute('aria-expanded', String(!closed));
    const flip = () => { const c = !sec.classList.contains('closed'); sec.classList.toggle('closed', c); h.setAttribute('aria-expanded', String(!c)); const s = store.get('collapsed', {}); s[sec.id] = c; store.set('collapsed', s); if (!c && sec.id === 'sec-chart') redrawChart(); };
    h.addEventListener('click', flip);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  });
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
  try { const j = await getJSON(BASE + 'data/brief.json?t=' + Date.now(), 10000); if (j && j.brief) state.brief = j; } catch {}
  renderHero(); renderBriefSections();
}
async function loadLive(first) {
  try {
    const j = await getJSON(BASE + 'data/live.json?t=' + Date.now(), 10000);
    if (j && j.items) {
      const changed = !state.live || state.live.updated !== j.updated;
      if (changed && !first) checkNewsNotifs(j); else if (first) checkNewsNotifs(j);
      state.live = j; store.set('live', j);
    }
  } catch {}
  renderFeed(); renderPerps(); renderEcal();
}
async function tick() {
  if (document.visibilityState !== 'visible' && !store.get('bgTick', true)) return;
  let ok = false;
  try { Object.assign(state.tickers, await fetchTickers()); ok = true; }
  catch { const fb = await fetchTickersFallback(); if (Object.keys(fb).length) { Object.assign(state.tickers, fb); ok = true; } }
  if (ok) { state.tickAt = Date.now(); store.set('tickers', state.tickers); store.set('tickAt', state.tickAt); renderWatch(); renderPortfolio(); renderChartHead(); checkPriceAlerts(); }
  setStatus();
}
async function loadSparks() {
  const ids = ASSETS.map(a => a.id);
  for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(async id => { try { const r = await getCandles(id, '1h'); if (r.rows.length) state.sparks[id] = r.rows.slice(-24).map(x => x.c); } catch {} }));
  store.set('sparks', state.sparks); renderWatch();
}
let busy = false;
async function refreshAll() {
  if (busy) return; busy = true;
  const btn = $('#refresh'); btn.classList.add('spin'); btn.disabled = true; setStatus(t('loading'));
  await Promise.allSettled([loadBrief(), loadLive(), tick()]);
  const [fng, btc] = await Promise.allSettled([fetchFng(), getCandles('BTC_USD', '6M')]);
  if (fng.status === 'fulfilled') { state.fng = fng.value; store.set('fng', state.fng); }
  if (btc.status === 'fulfilled' && btc.value.rows.length && !btc.value.hist) { state.btcDaily = btc.value.rows; store.set('btcDaily', state.btcDaily); }
  else if (!state.btcDaily) { const h = candlesHist(byId.BTC_USD, 200); if (h) state.btcDaily = h; }
  renderFng(); renderAuto(); loadChart(); await loadSparks();
  state.last = Date.now(); store.set('last', state.last);
  btn.classList.remove('spin'); btn.disabled = false; busy = false; setStatus();
}

// ---------- панелі ----------
function openPanel(id) { $$('.drawer').forEach(d => d.hidden = d.id !== id); $('#scrim').hidden = false; if (id === 'drawer') { renderNotifs(); notifs.forEach(n => n.read = true); store.set('notifs', notifs); updateBadge(); } if (id === 'settings') { renderAlerts(); renderSysBtn(); } }
function closePanels() { $$('.drawer').forEach(d => d.hidden = true); $('#scrim').hidden = true; }

function fillSelects() {
  const opts = (g, label) => `<optgroup label="${esc(label)}">` + ASSETS.filter(a => a.g === g).map(a => `<option value="${a.id}">${esc(fullName(a))}</option>`).join('') + '</optgroup>';
  const html = opts('c', t('crypto')) + opts('s', t('stocks'));
  for (const s of ['#asset-select', '#pf-asset', '#al-asset']) { const el = $(s), v = el.value; el.innerHTML = html; if (v) el.value = v; }
  $('#asset-select').value = state.asset;
}
function renderAll() {
  applyI18n(); fillSelects(); renderHero(); renderBriefSections(); renderWatch(); renderPortfolio(); renderFng(); renderAuto();
  renderChartHead(); renderFeed(); renderPerps(); renderEcal(); renderNotifs(); renderAlerts(); renderSysBtn(); redrawChart(); setStatus();
  $('#ver').textContent = 'v' + VERSION;
  $$('#lang-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === LANG));
  $$('#nmode-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === store.get('nmode', 'imp')));
  $('#sound-tog').checked = store.get('sound', false);
}

function init() {
  applyTheme();
  if (!byId[state.asset]) state.asset = 'BTC_USD';
  if (!TF[state.tf]) state.tf = '1h';
  const pick = (id) => { state.asset = id; store.set('asset', id); renderWatch(); loadChart(); };
  $('#asset-select').addEventListener('change', e => pick(e.target.value));
  $$('.grid').forEach(g => g.addEventListener('click', e => { const tl = e.target.closest('.tile'); if (!tl) return; pick(tl.dataset.id); const c = $('#sec-chart'); if (c.classList.contains('closed')) $('.head h2', c).click(); c.scrollIntoView({behavior:'smooth', block:'start'}); }));
  $('#tf-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.tf = b.dataset.tf; store.set('tf', state.tf); loadChart(); });
  $('#ma-tog').addEventListener('change', e => { state.ma = e.target.checked; store.set('ma', state.ma); redrawChart(); });
  $('#news-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.newsF = b.dataset.f; $$('#news-seg button').forEach(x => x.classList.toggle('on', x === b)); renderNews(); });
  $('#live-cat').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.liveCat = b.dataset.c; state.feedN = 12; $$('#live-cat button').forEach(x => x.classList.toggle('on', x === b)); renderFeed(); });
  $('#live-sent').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.liveSent = b.dataset.s; state.feedN = 12; $$('#live-sent button').forEach(x => x.classList.toggle('on', x === b)); renderFeed(); });
  $('#feed-more').addEventListener('click', () => { state.feedN += 20; renderFeed(); });
  $('#refresh').addEventListener('click', () => refreshAll());
  $('#bell').addEventListener('click', () => openPanel('drawer'));
  $('#settings-btn').addEventListener('click', () => openPanel('settings'));
  $('#scrim').addEventListener('click', closePanels);
  $$('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });
  $('#notif-clear').addEventListener('click', () => { notifs = []; store.set('notifs', notifs); renderNotifs(); updateBadge(); });
  $('#lang-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; LANG = b.dataset.v; store.set('lang', LANG); renderAll(); });
  $('#theme-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; store.set('theme', b.dataset.v); applyTheme(); redrawChart(); });
  $('#nmode-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; store.set('nmode', b.dataset.v); $$('#nmode-seg button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#sound-tog').addEventListener('change', e => { store.set('sound', e.target.checked); if (e.target.checked) beep(); });
  $('#sys-notif').addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted' && store.get('sysNotif', false)) { store.set('sysNotif', false); renderSysBtn(); return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    store.set('sysNotif', p === 'granted'); renderSysBtn();
    if (p === 'granted') notify('alert', t('notifications'), t('enabled') + ' ✓');
  });
  $('#alert-form').addEventListener('submit', e => { e.preventDefault(); const price = parseFloat($('#al-price').value); if (!(price > 0)) return; const al = store.get('alerts', []); al.push({id: $('#al-asset').value, op: $('#al-op').value, price, done: false}); store.set('alerts', al); $('#al-price').value = ''; renderAlerts(); });
  $('#alert-list').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; const al = store.get('alerts', []); al.splice(+b.dataset.i, 1); store.set('alerts', al); renderAlerts(); });
  $('#pf-form').addEventListener('submit', e => { e.preventDefault(); const amt = parseFloat($('#pf-amount').value); if (!(amt > 0)) return; const rows = pfGet(), id = $('#pf-asset').value, ex = rows.find(r => r.id === id); if (ex) ex.amount += amt; else rows.push({id, amount: amt}); store.set('portfolio', rows); $('#pf-amount').value = ''; renderPortfolio(); });
  $('#pf-rows').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; const rows = pfGet(); rows.splice(+b.dataset.i, 1); store.set('portfolio', rows); renderPortfolio(); });
  document.addEventListener('animationend', e => e.target.classList.remove('flash-up', 'flash-dn'));
  initCollapse(); renderAll(); updateBadge();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(redrawChart, 150); });

  // розклад: ціни — кожні 30 с, графік — щохвилини, новини — кожні 2 хв, бриф — кожні 30 хв, повне оновлення — кожні 4 год
  refreshAll().then(() => loadLive(true));
  setInterval(tick, T_TICK);
  setInterval(() => { if (document.visibilityState === 'visible' && TF[state.tf].intra) loadChart(true); }, T_CHART);
  setInterval(() => loadLive(), T_LIVE);
  setInterval(loadBrief, T_BRIEF);
  setInterval(() => { if (Date.now() - state.last >= T_FULL) refreshAll(); }, 60e3);
  setInterval(() => { renderFeed(); setStatus(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); loadLive(); if (Date.now() - state.last >= T_FULL) refreshAll(); } });
  addEventListener('online', () => { setStatus(); refreshAll(); }); addEventListener('offline', () => setStatus());
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
})();
