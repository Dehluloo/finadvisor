/* Фінансовий радник — автономний застосунок. Без залежностей. */
(() => {
'use strict';
const VERSION = '1.0.0';
const REFRESH_MS = 4 * 3600 * 1000;       // автооновлення кожні 4 години
const LIVE_MS = 60 * 1000;                 // живий графік — щохвилини
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('fa:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fa:' + k, JSON.stringify(v)); } catch {} }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
  {id:'SPYUSD-PERP', tk:'SPY', name:'S&P 500 (фонд SPY)', g:'s'},
  {id:'QQQUSD-PERP', tk:'QQQ', name:'Nasdaq 100 (фонд QQQ)', g:'s'},
  {id:'NVDAUSD-PERP', tk:'NVDA', name:'Nvidia', g:'s'},
  {id:'AAPLUSD-PERP', tk:'AAPL', name:'Apple', g:'s'},
  {id:'TSLAUSD-PERP', tk:'TSLA', name:'Tesla', g:'s'},
  {id:'MSTRUSD-PERP', tk:'MSTR', name:'Strategy (MSTR)', g:'s'},
  {id:'XAUUSD-PERP', tk:'XAU', name:'Золото', g:'s', alt:'PAXG_USD', bn:'PAXGUSDT', okx:'PAXG-USDT'},
  {id:'PAXG_USD', tk:'PAXG', name:'PAX Gold (токен золота)', g:'s', bn:'PAXGUSDT', okx:'PAXG-USDT'}
];
const byId = Object.fromEntries(ASSETS.map(a => [a.id, a]));
const TF = {
  '5m': {cdc:'5m', bn:'5m', okx:'5m', n:150, intra:true},
  '15m':{cdc:'15m', bn:'15m', okx:'15m', n:150, intra:true},
  '1h': {cdc:'1h', bn:'1h', okx:'1H', n:150, intra:true},
  '4h': {cdc:'4h', bn:'4h', okx:'4H', n:150, intra:true},
  '1M': {cdc:'1D', bn:'1d', okx:'1D', n:30},
  '2M': {cdc:'1D', bn:'1d', okx:'1D', n:61},
  '3M': {cdc:'1D', bn:'1d', okx:'1D', n:91},
  '6M': {cdc:'1D', bn:'1d', okx:'1D', n:183}
};
const BRIEF = window.BRIEF || {};
const state = {
  asset: store.get('asset', 'BTC_USD'),
  tf: store.get('tf', '1h'),
  tickers: store.get('tickers', {}),
  sparks: store.get('sparks', {}),
  fng: store.get('fng', null),
  btcDaily: store.get('btcDaily', null),
  last: store.get('last', 0),
  brief: BRIEF,
  newsF: 'all'
};

// ---------- форматування ----------
const nf = (d) => new Intl.NumberFormat('uk-UA', {minimumFractionDigits:d, maximumFractionDigits:d});
const dec = (n) => { n = Math.abs(n); return n >= 1000 ? 2 : n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 4 : 6; };
const usd = (n, d) => n == null || isNaN(n) ? '—' : '$' + nf(d ?? dec(n)).format(n);
const usdAxis = (n) => { const a = Math.abs(n); return '$' + nf(a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 4).format(n); };
const pct = (n) => n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + nf(2).format(n) + '%';
const cls = (n) => n > 0 ? 'up' : n < 0 ? 'dn' : '';
const hhmm = (d) => d.toLocaleTimeString('uk-UA', {hour:'2-digit', minute:'2-digit'});
const ddmm = (d) => d.toLocaleDateString('uk-UA', {day:'2-digit', month:'2-digit'});

// ---------- мережа ----------
async function getJSON(url, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, {signal:c.signal, cache:'no-store'}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const CDC = 'https://api.crypto.com/exchange/v1/public/';
async function fetchTickers() {
  const j = await getJSON(CDC + 'get-tickers');
  const want = new Set(ASSETS.map(a => a.id));
  const out = {};
  for (const d of (j.result && j.result.data) || []) {
    if (!want.has(d.i)) continue;
    out[d.i] = {last:+d.a, high:+d.h, low:+d.l, chg:+d.c * 100, t:+d.t};
  }
  if (!Object.keys(out).length) throw new Error('empty tickers');
  return out;
}
async function fetchTickersFallback() {
  const out = {};
  try {
    const syms = ASSETS.filter(a => a.bn).map(a => a.bn);
    const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify([...new Set(syms)])));
    const m = Object.fromEntries(j.map(x => [x.symbol, x]));
    for (const a of ASSETS) if (a.bn && m[a.bn]) { const x = m[a.bn]; out[a.id] = {last:+x.lastPrice, high:+x.highPrice, low:+x.lowPrice, chg:+x.priceChangePercent, t:+x.closeTime, src:'Binance'}; }
  } catch {}
  return out;
}
function normCandles(rows) { return rows.filter(r => isFinite(r.o) && isFinite(r.c)).sort((a, b) => a.t - b.t); }
async function candlesCDC(inst, tf, n) {
  const j = await getJSON(`${CDC}get-candlestick?instrument_name=${encodeURIComponent(inst)}&timeframe=${tf}&count=${Math.min(300, n)}`);
  const rows = ((j.result && j.result.data) || []).map(d => ({t:+d.t, o:+d.o, h:+d.h, l:+d.l, c:+d.c, v:+d.v}));
  if (!rows.length) throw new Error('no candles');
  return normCandles(rows);
}
async function candlesBN(sym, tf, n) {
  const j = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${Math.min(1000, n)}`);
  return normCandles(j.map(k => ({t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]})));
}
async function candlesOKX(inst, tf, n) {
  const j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${tf}&limit=${Math.min(300, n)}`);
  return normCandles((j.data || []).map(k => ({t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]})));
}
function candlesHist(a, n) {
  const h = (BRIEF.hist || {})[a.hist || (a.id === 'SPYUSD-PERP' ? 'SPX' : a.id === 'XAUUSD-PERP' ? 'GOLD' : '')];
  if (!h) return null;
  return h.map(r => ({t:Date.parse(r[0] + 'T00:00:00Z'), o:r[1], h:r[2], l:r[3], c:r[4]})).slice(-n);
}
async function getCandles(id, tfKey) {
  const a = byId[id], tf = TF[tfKey];
  const tries = [];
  tries.push(['Crypto.com', () => candlesCDC(id, tf.cdc, tf.n)]);
  if (a.alt) tries.push(['Crypto.com', () => candlesCDC(a.alt, tf.cdc, tf.n)]);
  if (a.bn) tries.push(['Binance', () => candlesBN(a.bn, tf.bn, tf.n)]);
  if (a.okx) tries.push(['OKX', () => candlesOKX(a.okx, tf.okx, tf.n)]);
  for (const [src, fn] of tries) {
    try { const rows = await fn(); if (rows.length > 2) { store.set('c:' + id + ':' + tfKey, rows); return {rows: rows.slice(-tf.n), src}; } } catch (e) { /* наступне джерело */ }
  }
  const cached = store.get('c:' + id + ':' + tfKey, null);
  if (cached) return {rows: cached, src: 'збережені дані', stale: true};
  if (!tf.intra) { const h = candlesHist(a, tf.n); if (h) return {rows: h, src: 'дані брифу', stale: true}; }
  return {rows: [], src: ''};
}
async function fetchFng() {
  const j = await getJSON('https://api.alternative.me/fng/?limit=60');
  return (j.data || []).map(d => ({v:+d.value, label:d.value_classification, t:+d.timestamp * 1000})).reverse();
}

// ---------- графік свічок ----------
const tipEl = $('#tip');
function showTip(html, x, y) { tipEl.innerHTML = html; tipEl.hidden = false; const w = tipEl.offsetWidth; tipEl.style.left = Math.min(innerWidth - w - 8, x + 14) + 'px'; tipEl.style.top = (y - 10) + 'px'; }
function hideTip() { tipEl.hidden = true; }
function drawCandles(el, rows, intra) {
  if (!rows || !rows.length) { el.innerHTML = '<div class="empty">Немає даних для графіка. Перевірте інтернет і натисніть «Оновити».</div>'; return; }
  const W = el.clientWidth || 600, H = el.clientHeight || 320, padL = 8, padR = 62, padT = 10, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  let lo = Infinity, hi = -Infinity; for (const r of rows) { lo = Math.min(lo, r.l); hi = Math.max(hi, r.h); }
  const span = hi - lo || hi * 0.01 || 1; lo -= span * 0.04; hi += span * 0.04;
  const y = (v) => padT + (hi - v) / (hi - lo) * ih;
  const step = iw / rows.length, bw = Math.max(1, Math.min(14, step * 0.68));
  const x = (i) => padL + step * i + step / 2;
  const ticks = 5, parts = [];
  for (let k = 0; k <= ticks; k++) { const v = lo + (hi - lo) * k / ticks, yy = y(v); parts.push(`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text class="ax" x="${W - padR + 6}" y="${yy + 4}">${usdAxis(v)}</text>`); }
  const nx = Math.max(2, Math.floor(iw / 90)), every = Math.max(1, Math.round(rows.length / nx));
  rows.forEach((r, i) => { if (i % every === 0) { const d = new Date(r.t); parts.push(`<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${intra ? hhmm(d) : ddmm(d)}</text>`); } });
  rows.forEach((r, i) => {
    const up = r.c >= r.o, col = up ? 'var(--up)' : 'var(--dn)', top = y(Math.max(r.o, r.c)), bh = Math.max(1, Math.abs(y(r.o) - y(r.c)));
    parts.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${y(r.h)}" y2="${y(r.l)}" stroke="${col}" stroke-width="1"/><rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${col}" rx="${bw > 4 ? 1 : 0}"/>`);
  });
  const lastC = rows[rows.length - 1].c, ly = y(lastC), lastUp = lastC >= rows[rows.length - 1].o;
  parts.push(`<line x1="${padL}" x2="${W - padR}" y1="${ly}" y2="${ly}" stroke="${lastUp ? 'var(--up)' : 'var(--dn)'}" stroke-dasharray="2 3" opacity=".8"/><rect x="${W - padR + 2}" y="${ly - 9}" width="${padR - 4}" height="18" rx="4" fill="${lastUp ? 'var(--up)' : 'var(--dn)'}"/><text x="${W - padR + 6}" y="${ly + 4}" font-size="11" fill="#fff" font-weight="600">${usdAxis(lastC)}</text>`);
  parts.push(`<line class="xh" id="xh" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Свічковий графік">${parts.join('')}</svg>`;
  const svg = el.firstChild, xh = svg.querySelector('#xh');
  const move = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev, b = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor((p.clientX - b.left) / b.width * W / step - padL / step)));
    const r = rows[i], d = new Date(r.t), chg = (r.c - r.o) / r.o * 100;
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    showTip(`<b>${intra ? ddmm(d) + ' ' + hhmm(d) : d.toLocaleDateString('uk-UA')}</b><br>Відкр. ${usd(r.o)} · Закр. ${usd(r.c)}<br>Макс. ${usd(r.h)} · Мін. ${usd(r.l)}<br><span class="${cls(chg)}">${pct(chg)}</span>`, p.clientX, p.clientY);
  };
  const leave = () => { xh.setAttribute('visibility', 'hidden'); hideTip(); };
  svg.addEventListener('mousemove', move); svg.addEventListener('mouseleave', leave);
  svg.addEventListener('touchstart', move, {passive:true}); svg.addEventListener('touchmove', move, {passive:true}); svg.addEventListener('touchend', leave);
}
function sparkSVG(vals, color, h = 30) {
  if (!vals || vals.length < 2) return `<svg viewBox="0 0 100 ${h}"></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * 100).toFixed(2)},${(h - 2 - (v - lo) / r * (h - 4)).toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 100 ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

// ---------- секції ----------
function renderHero() {
  const b = (state.brief.brief || [])[0] || {};
  const el = $('#hero'); el.classList.remove('red', 'yellow', 'green'); if (b.signal_light) el.classList.add(b.signal_light);
  $('#hero-signal').textContent = b.signal || 'Бриф ще не завантажено';
  $('#hero-summary').textContent = b.summary || '';
  $('#hero-date').textContent = b.date ? 'Бриф від ' + new Date(b.date + 'T12:00:00').toLocaleDateString('uk-UA', {day:'numeric', month:'long'}) : 'Щоденний бриф';
  $('#hero-chips').innerHTML = [b.regime && 'Режим: ' + b.regime, b.data_as_of && 'Дані: ' + b.data_as_of].filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('');
}
function tileHTML(a) {
  const t = state.tickers[a.id], s = state.sparks[a.id];
  const chg = t ? t.chg : null, color = chg >= 0 ? 'var(--up)' : 'var(--dn)';
  return `<button class="tile${a.id === state.asset ? ' sel' : ''}" data-id="${a.id}">
    <div class="t1"><span class="tk">${esc(a.tk)}</span><span class="chg ${cls(chg)}">${pct(chg)}</span></div>
    <div class="nm">${esc(a.name)}</div>
    <div class="px">${t ? usd(t.last) : '<span class="muted">—</span>'}</div>
    ${sparkSVG(s, t ? color : 'var(--muted)')}</button>`;
}
function renderWatch() {
  $('#watch-crypto').innerHTML = ASSETS.filter(a => a.g === 'c').map(tileHTML).join('');
  $('#watch-stocks').innerHTML = ASSETS.filter(a => a.g === 's').map(tileHTML).join('');
}
function renderChartHead() {
  const a = byId[state.asset], t = state.tickers[state.asset];
  $('#chart-name').textContent = a.name.includes(a.tk) ? a.name : a.name + ' (' + a.tk + ')';
  $('#chart-price').textContent = t ? usd(t.last) : '—';
  const c = $('#chart-chg'); c.className = 'pill ' + cls(t && t.chg); c.textContent = t ? pct(t.chg) + ' за 24г' : ''; c.hidden = !t; $('#chart-price').hidden = !t;
  $('#chart-hl').textContent = t ? `Макс. ${usd(t.high)} · Мін. ${usd(t.low)}` : '';
  $$('#tf-seg button').forEach(b => b.classList.toggle('on', b.dataset.tf === state.tf));
  $('#asset-select').value = state.asset;
}
let chartReq = 0, lastChart = null;
async function loadChart() {
  const my = ++chartReq, el = $('#chart');
  renderChartHead();
  if (!lastChart || lastChart.id !== state.asset || lastChart.tf !== state.tf) el.innerHTML = '<div class="skel" style="height:100%"></div>';
  const res = await getCandles(state.asset, state.tf);
  if (my !== chartReq) return;
  lastChart = {id: state.asset, tf: state.tf, rows: res.rows};
  drawCandles(el, res.rows, TF[state.tf].intra);
  const a = byId[state.asset];
  const notes = [];
  if (res.src) notes.push('Джерело: ' + res.src + (res.stale ? ' (не наживо)' : ''));
  if (a.g === 's' && a.id.endsWith('PERP')) notes.push('Контракт PERP на Crypto.com: коли біржа США закрита, свічки можуть стояти майже рівно.');
  if (res.src === 'дані брифу' && a.id === 'SPYUSD-PERP') notes.push('Показано індекс S&P 500 (а не ціну фонду SPY).');
  $('#chart-note').textContent = notes.join(' · ');
}
function renderFng() {
  const f = state.fng;
  const g = $('#fng-gauge');
  const bf = (state.brief.fng || [])[0];
  const v = f && f.length ? f[f.length - 1].v : (bf ? +bf.value : null);
  const arc = (a0, a1, col) => { const r = 80, cx = 100, cy = 100, p = (a) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${col}" stroke-width="16" fill="none"/>`; };
  let s = arc(0, .25, 'var(--dn)') + arc(.25, .45, '#f97316') + arc(.45, .55, 'var(--warn)') + arc(.55, .75, '#84cc16') + arc(.75, 1, 'var(--up)');
  if (v != null) { const a = v / 100, x = 100 + 70 * Math.cos(Math.PI * (1 - a)), y = 100 - 70 * Math.sin(Math.PI * (1 - a)); s += `<line x1="100" y1="100" x2="${x}" y2="${y}" stroke="var(--fg)" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="var(--fg)"/>`; }
  g.innerHTML = s;
  const UA = {'Extreme Fear':'Екстремальний страх','Fear':'Страх','Neutral':'Нейтрально','Greed':'Жадібність','Extreme Greed':'Екстремальна жадібність'};
  if (f && f.length) {
    const cur = f[f.length - 1], prev = f[f.length - 2], wk = f[f.length - 8];
    $('#fng-val').textContent = v;
    $('#fng-label').textContent = UA[cur.label] || cur.label;
    $('#fng-prev').textContent = [prev && 'Вчора: ' + prev.v, wk && 'Тиждень тому: ' + wk.v].filter(Boolean).join(' · ');
    $('#fng-hist').innerHTML = sparkSVG(f.slice(-60).map(d => d.v), 'var(--accent)', 60);
  } else {
    const b = (state.brief.fng || [])[0];
    if (b) { $('#fng-val').textContent = b.value; $('#fng-label').textContent = b.label; $('#fng-prev').textContent = 'з брифу, ' + b.date; }
  }
}
function sma(a, n) { if (a.length < n) return null; let s = 0; for (let i = a.length - n; i < a.length; i++) s += a[i]; return s / n; }
function renderAuto() {
  const el = $('#auto'), d = state.btcDaily, f = state.fng;
  if (!d || d.length < 35) { el.innerHTML = '<div class="muted">Потрібні денні дані Bitcoin — натисніть «Оновити».</div>'; return; }
  const closes = d.map(r => r.c), last = closes[closes.length - 1];
  const m50 = sma(closes, Math.min(50, closes.length)), m20 = sma(closes, 20);
  const ch30 = (last / closes[Math.max(0, closes.length - 31)] - 1) * 100;
  const hi90 = Math.max(...closes.slice(-90)), dd = (last / hi90 - 1) * 100;
  const fv = f && f.length ? f[f.length - 1].v : null;
  let score = 0; const why = [];
  if (last > m50) { score++; why.push(`Ціна BTC вище середньої за 50 днів (${usd(m50, 0)}) — тренд скоріше вгору.`); } else { score--; why.push(`Ціна BTC нижче середньої за 50 днів (${usd(m50, 0)}) — тренд униз.`); }
  if (last > m20) why.push('Короткостроково ціна вище середньої за 20 днів — є спроба відскоку.'); else why.push('Короткостроково ціна нижче середньої за 20 днів.');
  if (ch30 > 5) { score++; why.push(`За 30 днів ${pct(ch30)} — ринок росте.`); } else if (ch30 < -10) { score--; why.push(`За 30 днів ${pct(ch30)} — сильне падіння.`); } else why.push(`За 30 днів ${pct(ch30)} — без чіткого напрямку.`);
  why.push(`Від максимуму за 90 днів: ${pct(dd)}.`);
  if (fv != null) { if (fv >= 75) { score--; why.push(`Індекс жадібності ${fv}: ринок перегрітий, ризик корекції.`); } else if (fv <= 25) why.push(`Індекс страху ${fv}: паніка. Історично це зона, де обережні купують лише малими частинами, але дно не гарантоване.`); else why.push(`Індекс настрою ${fv}: без крайнощів.`); }
  const L = score >= 1 ? ['green', 'Сприятливо: тренд підтримує'] : score <= -1 ? ['red', 'Обережно: тренд проти'] : ['yellow', 'Нейтрально: чекати підтвердження'];
  el.innerHTML = `<div class="verdict"><span class="dot ${L[0]}"></span>${L[1]}</div><ul>${why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`;
}
function renderBriefSections() {
  const B = state.brief;
  const LBL = {red:'Високий ризик', yellow:'Обережно', green:'Сприятливо'};
  $('#lights').innerHTML = (B.posture || []).map(p => `<div class="light"><div class="lh"><span class="dot ${esc(p.light)}"></span>${esc(p.asset)}<span class="pos">${esc(p.posture || LBL[p.light] || '')}</span></div><p>${esc(p.plain)}</p></div>`).join('') || '<div class="muted">Немає даних брифу.</div>';
  $('#plain').innerHTML = (B.plain || []).slice().sort((a, b) => a.order - b.order).map(p => `<div class="pl"><b>${esc(p.label)}</b><p>${esc(p.text)}</p></div>`).join('');
  renderNews();
  const today = new Date().toISOString().slice(0, 10);
  $('#calendar').innerHTML = (B.calendar || []).map(c => `<li class="${c.date < today ? 'past' : ''}"><div class="d">${new Date(c.date + 'T12:00:00').toLocaleDateString('uk-UA', {day:'numeric', month:'short', weekday:'short'})}</div><div>${esc(c.event)}</div><div class="w">${esc(c.why)}</div></li>`).join('');
  const SC = (s) => /ведм|bear|ризик/i.test(s) ? 'dn' : /бич|bull|сприят/i.test(s) ? 'up' : '';
  $('#outlook').innerHTML = (B.outlook || []).map(o => `<div class="ol"><div class="oh"><span>${esc(o.area)}</span><span class="${SC(o.stance)}">${esc(o.stance)}</span></div><div class="muted">${esc(o.text)}</div></div>`).join('');
  const W = (B.weekly || []).slice().sort((a, b) => a.order - b.order);
  $('#week').textContent = W[0] ? W[0].week : '';
  $('#weekly').innerHTML = W.map(w => `<div><b>${esc(w.label)}</b><p>${esc(w.text)}</p></div>`).join('');
  $('#tips').innerHTML = (B.general || []).slice().sort((a, b) => a.order - b.order).map(g => `<li>${esc(g.text)}</li>`).join('');
}
function renderNews() {
  const UA = {Bullish:'Бичача', Bearish:'Ведмежа', Neutral:'Нейтральна', Mixed:'Змішана'};
  const N = (state.brief.news || []).filter(n => state.newsF === 'all' || n.impact === state.newsF);
  $('#news').innerHTML = N.map(n => `<div class="nw"><span class="tag ${esc(n.impact)}">${UA[n.impact] || esc(n.impact)}</span><div class="ti">${esc(n.title)}</div><div class="why">${esc(n.why)}</div><div class="meta">${esc([n.category, n.assets, n.source].filter(Boolean).join(' · '))}</div></div>`).join('') || '<div class="muted">Немає новин у цьому фільтрі.</div>';
}

// ---------- портфель ----------
function pfGet() { return store.get('portfolio', []); }
function renderPortfolio() {
  const rows = pfGet(); let total = 0, crypto = 0;
  $('#pf-rows').innerHTML = rows.map((r, i) => {
    const a = byId[r.id], t = state.tickers[r.id], val = t ? t.last * r.amount : null;
    if (val) { total += val; if (a && a.g === 'c') crypto += val; }
    return `<tr><td><b>${esc(a ? a.tk : r.id)}</b></td><td>${nf(r.amount >= 100 ? 2 : 4).format(r.amount)}</td><td>${t ? usd(t.last) : '—'}</td><td>${val != null ? usd(val, 2) : '—'}</td><td class="${cls(t && t.chg)}">${t ? pct(t.chg) : '—'}</td><td><button class="x" data-i="${i}" title="Видалити">×</button></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="muted">Додайте актив і кількість — вартість рахуватиметься за поточною ціною.</td></tr>';
  $('#pf-total').textContent = usd(total, 2);
  $('#pf-crypto').textContent = total ? nf(0).format(crypto / total * 100) + '%' : '—';
}

// ---------- згортання розділів ----------
function initCollapse() {
  const saved = store.get('collapsed', {});
  $$('[data-collapse]').forEach(sec => {
    const h = $('.head h2', sec); if (!h) return;
    const closed = sec.id in saved ? saved[sec.id] : sec.hasAttribute('data-closed');
    sec.classList.toggle('closed', closed);
    h.setAttribute('role', 'button'); h.setAttribute('tabindex', '0'); h.setAttribute('aria-expanded', String(!closed));
    const flip = () => { const c = !sec.classList.contains('closed'); sec.classList.toggle('closed', c); h.setAttribute('aria-expanded', String(!c)); const s = store.get('collapsed', {}); s[sec.id] = c; store.set('collapsed', s); if (!c && sec.id === 'sec-chart' && lastChart) drawCandles($('#chart'), lastChart.rows, TF[lastChart.tf].intra); };
    h.addEventListener('click', flip);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  });
}

// ---------- оновлення ----------
function setStatus() {
  const s = $('#status');
  if (!state.last) { s.textContent = 'Ще не оновлено'; return; }
  const d = new Date(state.last), n = new Date(state.last + REFRESH_MS);
  s.textContent = `Оновлено ${hhmm(d)} · наступне о ${hhmm(n)}` + (navigator.onLine === false ? ' · офлайн' : '');
}
async function loadBrief() {
  if (location.protocol.startsWith('http')) {
    try { const j = await getJSON('data/brief.json?t=' + Date.now(), 8000); if (j && j.brief) { state.brief = j; Object.assign(BRIEF, j); } } catch {}
  }
  renderHero(); renderBriefSections();
}
let busy = false;
async function refreshAll(manual) {
  if (busy) return; busy = true;
  const btn = $('#refresh'); btn.classList.add('spin'); btn.disabled = true;
  $('#status').textContent = 'Оновлюю…';
  await loadBrief();
  try { state.tickers = await fetchTickers(); }
  catch { const fb = await fetchTickersFallback(); if (Object.keys(fb).length) state.tickers = Object.assign({}, state.tickers, fb); }
  store.set('tickers', state.tickers);
  renderWatch(); renderPortfolio(); renderChartHead();
  const [fng, btc] = await Promise.allSettled([fetchFng(), getCandles('BTC_USD', '6M')]);
  if (fng.status === 'fulfilled') { state.fng = fng.value; store.set('fng', state.fng); }
  if (btc.status === 'fulfilled' && btc.value.rows.length) { state.btcDaily = btc.value.rows; store.set('btcDaily', state.btcDaily); }
  renderFng(); renderAuto();
  loadChart();
  // мініграфіки за добу — послідовно невеликими групами
  const ids = ASSETS.map(a => a.id);
  for (let i = 0; i < ids.length; i += 4) {
    await Promise.all(ids.slice(i, i + 4).map(async id => {
      try { const r = await getCandles(id, '1h'); if (r.rows.length) state.sparks[id] = r.rows.slice(-24).map(x => x.c); } catch {}
    }));
  }
  store.set('sparks', state.sparks); renderWatch();
  const ok = Object.values(state.tickers).some(t => t && Date.now() - (t.t || 0) < 3600e3);
  if (ok) { state.last = Date.now(); store.set('last', state.last); setStatus(); }
  else $('#status').textContent = 'Не вдалося отримати ціни — перевірте інтернет' + (state.last ? ' · дані від ' + hhmm(new Date(state.last)) : '');
  btn.classList.remove('spin'); btn.disabled = false; busy = false;
}
async function liveTick() {
  if (document.visibilityState !== 'visible' || busy) return;
  try { const t = await fetchTickers(); state.tickers = Object.assign(state.tickers, t); store.set('tickers', state.tickers); renderWatch(); renderPortfolio(); renderChartHead(); } catch {}
  if (TF[state.tf].intra) loadChart();
}

// ---------- старт ----------
function init() {
  $('#ver').textContent = 'Версія ' + VERSION + '.';
  const sel = $('#asset-select'), pfSel = $('#pf-asset');
  const opts = (g, label) => `<optgroup label="${label}">` + ASSETS.filter(a => a.g === g).map(a => `<option value="${a.id}">${esc(a.name.includes(a.tk) ? a.name : a.name + ' (' + a.tk + ')')}</option>`).join('') + '</optgroup>';
  sel.innerHTML = pfSel.innerHTML = opts('c', 'Криптовалюти') + opts('s', 'Фондовий ринок і золото');
  if (!byId[state.asset]) state.asset = 'BTC_USD';
  if (!TF[state.tf]) state.tf = '1h';
  const pick = (id) => { state.asset = id; store.set('asset', id); renderWatch(); loadChart(); };
  sel.addEventListener('change', () => pick(sel.value));
  $$('.grid').forEach(g => g.addEventListener('click', e => { const t = e.target.closest('.tile'); if (!t) return; pick(t.dataset.id); const c = $('#sec-chart'); if (c.classList.contains('closed')) $('.head h2', c).click(); c.scrollIntoView({behavior:'smooth', block:'start'}); }));
  $('#tf-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.tf = b.dataset.tf; store.set('tf', state.tf); loadChart(); });
  $('#news-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.newsF = b.dataset.f; $$('#news-seg button').forEach(x => x.classList.toggle('on', x === b)); renderNews(); });
  $('#refresh').addEventListener('click', () => refreshAll(true));
  $('#pf-form').addEventListener('submit', e => { e.preventDefault(); const amt = parseFloat($('#pf-amount').value); if (!(amt > 0)) return; const rows = pfGet(); const ex = rows.find(r => r.id === pfSel.value); if (ex) ex.amount += amt; else rows.push({id: pfSel.value, amount: amt}); store.set('portfolio', rows); $('#pf-amount').value = ''; renderPortfolio(); });
  $('#pf-rows').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; const rows = pfGet(); rows.splice(+b.dataset.i, 1); store.set('portfolio', rows); renderPortfolio(); });
  initCollapse();
  renderHero(); renderBriefSections(); renderWatch(); renderPortfolio(); renderFng(); renderAuto(); renderChartHead(); setStatus();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => lastChart && drawCandles($('#chart'), lastChart.rows, TF[lastChart.tf].intra), 150); });
  // перше оновлення: одразу, якщо дані старші за 4 години, інакше лише графік
  if (Date.now() - state.last > REFRESH_MS) refreshAll(); else { loadChart(); liveTick(); }
  setInterval(() => { if (Date.now() - state.last >= REFRESH_MS) refreshAll(); }, 60 * 1000);
  setInterval(liveTick, LIVE_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (Date.now() - state.last >= REFRESH_MS) refreshAll(); else liveTick(); } });
  addEventListener('online', setStatus); addEventListener('offline', setStatus);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
})();
