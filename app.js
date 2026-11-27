/* Фінансовий радник 3.0 — автономний застосунок без залежностей і без токенів ШІ. */
(() => {
'use strict';
const VERSION = '4.1.1';
const HOSTED = 'https://dehluloo.github.io/finadvisor/';
const REPO = 'https://github.com/Dehluloo/finadvisor';
const BASE = location.protocol.startsWith('http') ? '' : HOSTED;
const LIVE = 'https://raw.githubusercontent.com/Dehluloo/finadvisor/live/';
let WORKER = (JSON.parse(localStorage.getItem('fa:worker') || '""')) || '';
const T_TICK = 15e3, T_LIVE = 60e3, T_BRIEF = 30 * 60e3, T_FULL = 4 * 3600e3, T_CHART = 60e3, T_MK = 5 * 60e3, T_LIQ = 5 * 60e3;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('fa:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fa:' + k, JSON.stringify(v)); } catch {} }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- мова ----------
const SYS_LANG = (navigator.languages || [navigator.language || 'en']).map(l => l.toLowerCase());
let LANG = store.get('lang', SYS_LANG.some(l => /^(uk|ru|be)/.test(l)) ? 'uk' : 'en');
const t = (k, v) => { let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.uk[k] ?? k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
const LOC = () => LANG === 'uk' ? 'uk-UA' : 'en-US';
function applyI18n() {
  document.documentElement.lang = LANG; document.title = t('app');
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  decorateHeads();
}
// ---------- підказки ⓘ і ручки для перетягування ----------
function decorateHeads() {
  $$('[data-sec]').forEach(sec => {
    const k = sec.dataset.sec, h = $('.head h2', sec) || $('.hero-i', sec);
    if (!sec.querySelector(':scope > .drag-h')) { const d = document.createElement('span'); d.className = 'drag-h'; d.innerHTML = '<i></i>'; sec.prepend(d); }
    sec.querySelector(':scope > .drag-h').title = t('dragHint');
    if (h && !h.querySelector('.info')) { const b = document.createElement('button'); b.className = 'info'; b.type = 'button'; b.dataset.help = k; b.textContent = 'i'; h.appendChild(b); }
    if (h) { const b = h.querySelector('.info'); if (b) b.title = t('help'); }
  });
}
function showHelp(btn) {
  let pop = $('#help-pop'); if (!pop) { pop = document.createElement('div'); pop.id = 'help-pop'; pop.className = 'help-pop'; document.body.appendChild(pop); }
  if (!pop.hidden && pop.dataset.k === btn.dataset.help) { pop.hidden = true; return; }
  pop.dataset.k = btn.dataset.help; pop.innerHTML = `<b>${esc(t('sec_' + btn.dataset.help))}</b><p>${esc(t('h_' + btn.dataset.help))}</p>`; pop.hidden = false;
  const r = btn.getBoundingClientRect(), w = Math.min(340, innerWidth - 24);
  pop.style.width = w + 'px'; pop.style.left = clamp(r.left - w / 2, 12, innerWidth - w - 12) + 'px'; pop.style.top = (r.bottom + scrollY + 8) + 'px';
}
let dragJustEnded = 0;
function initDrag() {
  let drag = null, raf = 0, lastY = 0, press = null;
  const main = $('#main');
  const scrollLoop = () => { if (!drag) return; if (lastY < 90) scrollBy(0, -12); else if (lastY > innerHeight - 110) scrollBy(0, 12); raf = requestAnimationFrame(scrollLoop); };
  const start = (sec, e) => { drag = sec; sec.classList.add('dragging'); document.body.classList.add('is-dragging'); lastY = e.clientY; raf = requestAnimationFrame(scrollLoop); try { navigator.vibrate && navigator.vibrate(12); } catch {} };
  const interactive = (t) => t.closest('button:not(.drag-h),select,input,a,label,textarea,.seg,.row-g,details,.chart,.bubbles,.liq,.tbl-wrap,.feed,.m-g,.picker');
  main.addEventListener('pointerdown', e => {
    const hnd = e.target.closest('.drag-h');
    if (hnd) { e.preventDefault(); start(hnd.parentElement, e); try { hnd.setPointerCapture(e.pointerId); } catch {} return; }
    const head = e.target.closest('[data-sec] > .head, [data-sec] .hero-body'); if (!head || interactive(e.target)) return;
    const sec = head.closest('[data-sec]');
    press = {x: e.clientX, y: e.clientY, sec, id: e.pointerId, timer: setTimeout(() => { if (press) { start(press.sec, e); press = null; } }, 420)};
  });
  main.addEventListener('pointermove', e => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
    if (!drag) return; lastY = e.clientY;
    const el = document.elementFromPoint(e.clientX, e.clientY), over = el && el.closest('[data-sec]');
    if (!over || over === drag || over.parentElement !== main) return;
    const r = over.getBoundingClientRect(), half = over.classList.contains('half') && r.width < main.clientWidth * 0.7;
    const before = half ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    main.insertBefore(drag, before ? over : over.nextSibling);
  });
  document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, {passive: false});
  document.addEventListener('contextmenu', e => { if (drag || press) e.preventDefault(); });
  const end = () => {
    if (press) { clearTimeout(press.timer); press = null; }
    if (!drag) return; drag.classList.remove('dragging'); document.body.classList.remove('is-dragging'); cancelAnimationFrame(raf);
    const on = Object.fromEntries(getLayout().map(s => [s.k, s.on]));
    store.set('layout', $$('#main > [data-sec]').map(el => ({k: el.dataset.sec, on: on[el.dataset.sec] !== false}))); pairHalves();
    drag = null; dragJustEnded = Date.now(); redrawChart(); renderBubbles(); loadLiq();
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

// ---------- мобільний режим: нижнє меню, потягнути для оновлення, свайп панелей ----------
function initMobile() {
  const bar = $('#tabbar');
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b) return; const k = b.dataset.go;
    if (k === 'settings') { openPanel('settings'); return; }
    if (k === 'top') { scrollTo({top: 0, behavior: 'smooth'}); return; }
    const sec = $(`[data-sec="${k}"]`); if (!sec) return;
    if (sec.hidden) { const L = getLayout(); const x = L.find(s => s.k === k); if (x) { x.on = true; store.set('layout', L); applyLayout(); } }
    if (sec.classList.contains('closed')) $('.head h2', sec).click();
    const y = sec.getBoundingClientRect().top + scrollY - ($('.top').offsetHeight + 8); scrollTo({top: y, behavior: 'smooth'}); setTimeout(() => { if (Math.abs(scrollY - y) > 40) scrollTo(0, y); }, 700);
  });
  const marks = ['top', 'chart', 'markets', 'live', 'cal'];
  const onScroll = () => { let act = 'top'; for (const k of marks.slice(1)) { const s = $(`[data-sec="${k}"]`); if (s && !s.hidden && s.getBoundingClientRect().top < innerHeight * 0.4) act = k; } $$('#tabbar [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === act)); };
  addEventListener('scroll', () => requestAnimationFrame(onScroll), {passive: true}); onScroll();
  // потягнути вниз для оновлення
  const ptr = $('#ptr'); let y0 = null, pulled = 0;
  addEventListener('touchstart', e => { y0 = scrollY <= 0 && !document.body.classList.contains('is-dragging') && $('#scrim').hidden ? e.touches[0].clientY : null; pulled = 0; }, {passive: true});
  addEventListener('touchmove', e => { if (y0 == null) return; pulled = Math.max(0, e.touches[0].clientY - y0); if (pulled > 5) { ptr.style.transform = `translate(-50%, ${Math.min(pulled, 110) - 50}px)`; ptr.classList.toggle('ready', pulled > 80); ptr.hidden = false; } }, {passive: true});
  addEventListener('touchend', () => { if (y0 == null) return; y0 = null; if (pulled > 80) { ptr.classList.add('spin'); refreshAll().finally(() => { ptr.classList.remove('spin', 'ready'); ptr.hidden = true; ptr.style.transform = ''; }); } else { ptr.hidden = true; ptr.style.transform = ''; } }, {passive: true});
  // свайп праворуч закриває панелі
  $$('.drawer').forEach(d => { let sx = null; d.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, {passive: true}); d.addEventListener('touchmove', e => { if (sx == null) return; const dx = e.touches[0].clientX - sx; if (dx > 0) d.style.transform = `translateX(${dx}px)`; }, {passive: true}); d.addEventListener('touchend', e => { if (sx == null) return; const dx = (e.changedTouches[0].clientX - sx); sx = null; d.style.transform = ''; if (dx > 90) closePanels(); }, {passive: true}); });
}
// ---------- вигляд ----------
const ACCENTS = ['#5b8cff', '#22c55e', '#a78bfa', '#f59e0b', '#ec4899', '#06b6d4'];
function applyLook() {
  const th = store.get('theme', 'auto'); document.documentElement.dataset.theme = th;
  const ac = store.get('accent', ACCENTS[0]); document.documentElement.style.setProperty('--accent', ac); document.documentElement.style.setProperty('--accent2', ac);
  document.documentElement.dataset.density = store.get('density', 'comfy');
  document.documentElement.dataset.tips = store.get('tips', true) ? 'on' : 'off';
  const tt = $('#tips-tog'); if (tt) tt.checked = store.get('tips', true);
  $$('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === th));
  $$('#dens-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === store.get('density', 'comfy')));
  $('#accent-sw').innerHTML = ACCENTS.map(c => `<button class="sw-b${c === ac ? ' on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');
}

// ---------- валюта ----------
function sysCurrency() {
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), loc = (navigator.language || '').toUpperCase();
  if (/Kiev|Kyiv/.test(tz) || /-UA$/.test(loc)) return 'UAH';
  if (/Bucharest/.test(tz) || /-RO$/.test(loc)) return 'RON';
  if (/^Europe\//.test(tz) && !/London|Moscow|Istanbul|Minsk|Chisinau|Belgrade|Zurich|Oslo|Stockholm|Copenhagen|Warsaw|Prague|Budapest/.test(tz)) return 'EUR';
  return 'USD';
}
let CUR = store.get('cur', sysCurrency()), RATES = store.get('rates', {USD: 1});
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
  {id:'XAUUSD-PERP', tk:'XAU', name:{uk:'Золото', en:'Gold'}, g:'m', alt:'XAUT_USD', hl:'xyz:GOLD', bn:'PAXGUSDT', okx:'PAXG-USDT'},
  {id:'XAGUSD-PERP', tk:'XAG', name:{uk:'Срібло', en:'Silver'}, g:'m', hl:'xyz:SILVER'},
  {id:'XPTUSD-PERP', tk:'XPT', name:{uk:'Платина', en:'Platinum'}, g:'m', hl:'xyz:PLATINUM'},
  {id:'XPDUSD-PERP', tk:'XPD', name:{uk:'Паладій', en:'Palladium'}, g:'m', hl:'xyz:PALLADIUM'}
];
const EXTRA_ASSETS = [
  {id:'PAXG_USD', tk:'PAXG', name:{uk:'PAX Gold (токен золота)', en:'PAX Gold (gold token)'}, g:'m', bn:'PAXGUSDT', okx:'PAXG-USDT'},
  {id:'XAUT_USD', tk:'XAUT', name:{uk:'Tether Gold (токен золота)', en:'Tether Gold (gold token)'}, g:'m', okx:'XAUT-USDT'}
];
const KNOWN = Object.fromEntries([...BASE_ASSETS, ...EXTRA_ASSETS].map(a => [a.id, a]));
const METALS = new Set(['XAU','XAG','XPT','XPD','PAXG','XAUT','GOLD','SILVER','PLATINUM','PALLADIUM']);
const STOCKS = new Set(['SPY','QQQ','NVDA','AAPL','TSLA','MSTR','XAU','XAG','MSFT','AMZN','GOOGL','META','COIN','HOOD','AMD','NFLX','IWM','DIA','PLTR','GOLD','SILVER','WTI']);
const cgNames = store.get('cgNames', {});
function assetFor(id) {
  if (KNOWN[id]) return KNOWN[id];
  if (id.endsWith('-PERP')) { const tk = id.replace(/USD-PERP$/, '').replace(/-PERP$/, ''); return KNOWN[id] = {id, tk, name: cgNames[tk] || tk, g: METALS.has(tk) ? 'm' : STOCKS.has(tk) ? 's' : 'p'}; }
  const tk = id.split('_')[0];
  return KNOWN[id] = {id, tk, name: cgNames[tk] || tk, g: METALS.has(tk) ? 'm' : 'c', bn: tk + 'USDT', okx: tk + '-USDT'};
}
const nameOf = (a) => typeof a.name === 'object' ? a.name[LANG] : a.name;
const fullName = (a) => { const n = nameOf(a); return n.toUpperCase().includes(a.tk) ? n : n + ' (' + a.tk + ')'; };
let WATCH = store.get('watch', BASE_ASSETS.map(a => a.id));
if (!store.get('mig:metals', false)) { const add = ['XAUUSD-PERP', 'XAGUSD-PERP', 'XPTUSD-PERP', 'XPDUSD-PERP'].filter(id => !WATCH.includes(id)); if (add.length) { WATCH = [...WATCH, ...add]; store.set('watch', WATCH); } store.set('mig:metals', true); }
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
  newsF: 'all', liveCat: 'all', liveSent: 'all', feedN: 12, mkN: 10, mkFavOnly: false, mkSort: ['market_cap_rank', 1], mkQ: '', bbPer: store.get('bbPer', '24h'), bbSize: 'chg', bbItems: null,
  liqCoin: store.get('liqCoin', 'BTC'), liqDays: 7, calRange: [31, 92, 183].includes(store.get('calRange', 31)) ? store.get('calRange', 31) : 31, calMonth: 0, calView: store.get('calView', 'grid'), calHigh: store.get('calHigh', false), calDay: null,
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
// Не більше кількох одночасних запитів до кожної біржі (інакше вони тимчасово блокують), однакові запити — один раз.
const HOST_MAX = {'api.crypto.com': 3, 'data-api.binance.vision': 4, 'www.okx.com': 3, 'api.hyperliquid.xyz': 3, 'api.coingecko.com': 2};
const HOST_GAP = {'api.crypto.com': 110, 'data-api.binance.vision': 60, 'www.okx.com': 120, 'api.coingecko.com': 400}; // мс між стартами запитів
const hostQ = {}, inflight = new Map(), coolUntil = {}, failRun = new Proxy({}, {get: (o, k) => o[k] || 0});
async function slot(host) {
  const max = HOST_MAX[host]; if (!max) return () => {};
  const q = hostQ[host] || (hostQ[host] = {n: 0, w: [], last: 0});
  if (q.n >= max) await new Promise(r => q.w.push(r));
  q.n++;
  const gap = HOST_GAP[host] || 0, wait = q.last + gap - Date.now(); q.last = Math.max(Date.now(), q.last + gap);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  let done = false; return () => { if (done) return; done = true; q.n--; const nx = q.w.shift(); if (nx) nx(); };
}
function getJSON(url, ms = 12000, opt = {}) {
  const key = !opt.method || opt.method === 'GET' ? url : null;
  if (key && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    let host = ''; try { host = new URL(url, location.href).host; } catch {}
    if (coolUntil[host] > Date.now()) throw new Error('cooldown ' + host);
    const release = await slot(host); const c = new AbortController(); const tm = setTimeout(() => c.abort(), ms);
    try {
      let r;
      try { r = await fetch(url, Object.assign({signal: c.signal, cache: 'no-store'}, opt)); }
      catch (e) { // біржа відмовила без CORS-заголовків (ліміт) — коротка пауза для цього хоста після кількох поспіль
        if (HOST_MAX[host] && e.name !== 'AbortError' && navigator.onLine !== false && ++failRun[host] >= 3) { coolUntil[host] = Date.now() + 8e3; failRun[host] = 0; }
        throw e; }
      failRun[host] = 0;
      if (r.status === 429) coolUntil[host] = Date.now() + 30e3;
      if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(tm); release(); }
  })();
  if (key) { inflight.set(key, run); run.then(() => inflight.delete(key), () => inflight.delete(key)); }
  return run;
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
    for (const a of watchAssets()) if (a.bn && m[a.bn] && !a.hl) { const x = m[a.bn]; out[a.id] = {last:+x.lastPrice, high:+x.highPrice, low:+x.lowPrice, chg:+x.priceChangePercent, t:+x.closeTime}; }
  } catch {}
  const hls = watchAssets().filter(a => a.hl && !out[a.id]);
  if (hls.length) try {
    const [meta, ctx] = await hl({type: 'metaAndAssetCtxs', dex: 'xyz'}), ix = Object.fromEntries(meta.universe.map((u, i) => [u.name, i]));
    for (const a of hls) { const c = ctx[ix[a.hl]]; if (!c || !+c.markPx) continue; const p = +c.markPx, p0 = +c.prevDayPx || p; out[a.id] = {last: p, high: Math.max(p, p0), low: Math.min(p, p0), chg: (p / p0 - 1) * 100, t: Date.now()}; }
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
async function candlesHL(coin, iv, n) {
  const ms = {'5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1D': 864e5}[iv] || 36e5, end = Date.now();
  const j = await hl({type: 'candleSnapshot', req: {coin, interval: iv === '1D' ? '1d' : iv, startTime: end - ms * (n + 2), endTime: end}});
  return (j || []).map(r => ({t: r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.v})).slice(-n);
}
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
  if (a.hl) tries.push(['Hyperliquid', () => candlesHL(a.hl, tf.cdc, n)]);
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
  if (!all || !all.length) { el.style.height = ''; el.innerHTML = `<div class="empty" style="height:200px">${esc(t('noChart'))}</div>`; $('#chart-legend').textContent = ''; return; }
  const I = state.ind, closes = all.map(r => r.c), off = Math.max(0, all.length - show);
  const cut = (a) => a.slice(off), rows = cut(all);
  const compareMode = !!(cmpRows && cmpRows.length);
  const ser = {ma20: I.ma20 && cut(smaS(closes, 20)), ma50: I.ma50 && cut(smaS(closes, 50)), ema200: I.ema200 && cut(emaS(closes, 200)), bb: I.bb && cut(bbS(closes)), rsi: I.rsi && cut(rsiS(closes)), macd: I.macd && cut(macdS(closes))};
  const panes = compareMode ? 0 : (I.rsi ? 1 : 0) + (I.macd ? 1 : 0);
  const W = el.clientWidth || 600, baseH = innerWidth < 600 ? 280 : 340, H = baseH + panes * 92;
  el.style.height = '';
  const sampleLbl = compareMode ? '+100,0%' : moneyAxis(Math.max(...all.map(r => r.h))), padL = 6, padR = Math.max(66, Math.round(sampleLbl.length * 6.6 + 14)), padT = 10, padB = 22, iw = W - padL - padR, gap = 8, paneH = 84;
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
  $('#hero-signal').textContent = b.signal ? L10(b.signal) : t('noBrief');
  $('#hero-summary').innerHTML = tx(b.summary || '');
  $('#hero-date').textContent = b.date ? t('briefFrom') + ' ' + new Date(b.date + 'T12:00:00').toLocaleDateString(LOC(), {day:'numeric', month:'long'}) : t('dailyBrief');
  const srcChip = state.brief.source === 'auto' ? t('briefAuto') : state.brief.source === 'claude' ? t('briefClaude') : '';
  $('#hero-chips').innerHTML = [srcChip, b.regime && t('regime') + ': ' + L10(b.regime), b.data_as_of && t('dataAsOf') + ': ' + b.data_as_of].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('');
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
  sec.hidden = false; sinceShown = true; pairHalves();
}

// ---------- список активів ----------
function renderTape() {
  const items = watchAssets().map(a => { const k = state.tickers[a.id]; return k ? `<span class="ti"><b>${esc(a.tk)}</b> ${money(k.last)} <i class="${cls(k.chg)}">${pct(k.chg)}</i></span>` : ''; }).join('');
  $('#tape-in').innerHTML = items ? items + items : ''; $('#tape').hidden = !items;
}
const prevPx = {};
function renderWatch() {
  $('#watch-edit').textContent = state.editWatch ? t('done') : t('edit');
  const groups = [['c', t('crypto')], ['s', t('stocks')], ['m', t('metals')], ['p', t('perpsGrp')]];
  $('#watch-grid').innerHTML = groups.map(([g, label]) => {
    const as = watchAssets().filter(a => a.g === g); if (!as.length) return '';
    const maxC = Math.max(2, Math.floor(($('#watch-grid').clientWidth + 10) / 160)), cols = Math.min(as.length, Math.ceil(as.length / Math.ceil(as.length / maxC)));
    return `<h3 class="group">${esc(label)}</h3><div class="tiles" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">` + as.map(a => {
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
function setWatch(w) { WATCH = w; store.set('watch', WATCH); fillSelects(); renderWatch(); wsSync(); }
function renderPicker() {
  const q = $('#picker-q').value.trim().toUpperCase();
  const list = state.allInst.filter(id => !WATCH.includes(id) && (!q || id.includes(q) || (cgNames[assetFor(id).tk] || '').toUpperCase().includes(q))).slice(0, 40);
  $('#picker-list').innerHTML = list.map(id => { const a = assetFor(id), k = state.allTick && state.allTick[id]; return `<button data-add="${id}"><b>${esc(a.tk)}</b> <span class="muted">${esc(id.endsWith('PERP') ? 'PERP' : nameOf(a))}</span><span class="r ${cls(k && k.chg)}">${k ? money(k.last) + ' · ' + pct(k.chg) : ''}</span></button>`; }).join('') || '<div class="muted pad">—</div>';
}

function fillMissingPrices() {
  const M = state.mk || [];
  for (const id of WATCH) { if (state.tickers[id] && Date.now() - (state.tickers[id].t || 0) < 300e3 && !state.tickers[id].cg) continue; const sym = id.split('_')[0], c = M.find(x => x.symbol === sym);
    if (c && (!state.allTick || !state.allTick[id])) state.tickers[id] = {last: c.current_price, high: c.current_price, low: c.current_price, chg: c.price_change_percentage_24h_in_currency || 0, t: Date.now(), cg: true}; }
}
// ---------- реальний час: WebSocket Crypto.com ----------
let ws = null, wsSubs = new Set(), wsDirty = false, wsTimer = 0, wsBack = 1000;
function wsWanted() { return [...new Set([...WATCH, state.asset, state.cmp, ...pfGet().map(r => r.id), ...store.get('alerts', []).map(a => a.id)].filter(id => id && (!state.allInst.length || state.allInst.includes(id))))].slice(0, 100); }
function wsSync() {
  if (!ws || ws.readyState !== 1) return;
  const want = new Set(wsWanted()), add = [...want].filter(x => !wsSubs.has(x)), del = [...wsSubs].filter(x => !want.has(x));
  if (add.length) ws.send(JSON.stringify({id: Date.now(), method: 'subscribe', params: {channels: add.map(x => 'ticker.' + x)}, nonce: Date.now()}));
  if (del.length) ws.send(JSON.stringify({id: Date.now() + 1, method: 'unsubscribe', params: {channels: del.map(x => 'ticker.' + x)}, nonce: Date.now()}));
  wsSubs = want;
}
function wsConnect() {
  if (!('WebSocket' in window) || (ws && ws.readyState <= 1)) return;
  try { ws = new WebSocket('wss://stream.crypto.com/exchange/v1/market'); } catch { return; }
  ws.onopen = () => { wsBack = 1000; wsSubs = new Set(); setTimeout(wsSync, 1100); };
  ws.onmessage = (m) => {
    let j; try { j = JSON.parse(m.data); } catch { return; }
    if (j.method === 'public/heartbeat') { ws.send(JSON.stringify({id: j.id, method: 'public/respond-heartbeat'})); return; }
    const r = j.result; if (!r || r.channel !== 'ticker' || !r.data) return;
    for (const d of r.data) { const id = d.i || r.instrument_name; if (!id || !+d.a) continue; state.tickers[id] = {last: +d.a, high: +d.h, low: +d.l, chg: +d.c * 100, t: +d.t || Date.now()}; if (state.allTick) state.allTick[id] = state.tickers[id]; }
    state.tickAt = Date.now(); wsDirty = true;
  };
  ws.onclose = () => { ws = null; setTimeout(wsConnect, wsBack); wsBack = Math.min(wsBack * 2, 30000); };
  ws.onerror = () => { try { ws.close(); } catch {} };
}
function liveCandle() {
  if (!lastChart || lastChart.id !== state.asset || !TF[state.tf].intra || !lastChart.rows.length) return false;
  const k = state.tickers[state.asset]; if (!k) return false;
  const rows = lastChart.rows, last = rows.at(-1), per = {'5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5}[state.tf], now = Date.now();
  if (now >= last.t + per) rows.push({t: last.t + per * Math.floor((now - last.t) / per), o: last.c, h: Math.max(last.c, k.last), l: Math.min(last.c, k.last), c: k.last, v: 0});
  else { last.c = k.last; last.h = Math.max(last.h, k.last); last.l = Math.min(last.l, k.last); }
  return true;
}
function updatePrices() {
  for (const a of watchAssets()) { const k = state.tickers[a.id]; if (!k) continue; const px = $(`[data-px="${CSS.escape(a.id)}"]`); if (!px) continue;
    const txt = money(k.last); if (px.textContent !== txt) { const p = prevPx[a.id]; px.textContent = txt; px.classList.remove('flash-up', 'flash-dn'); void px.offsetWidth; if (p) px.classList.add(k.last >= p ? 'flash-up' : 'flash-dn'); prevPx[a.id] = k.last; }
    const ch = px.parentElement.querySelector('.chg'); if (ch) { ch.textContent = pct(k.chg); ch.className = 'chg ' + cls(k.chg); } }
  renderTape(); renderChartHead(); renderPortfolio(); checkPriceAlerts(); setStatus();
}
let chartDrawAt = 0;
setInterval(() => {
  if (!wsDirty || document.visibilityState !== 'visible') return; wsDirty = false;
  updatePrices();
  if (Date.now() - chartDrawAt > 1500 && liveCandle()) { chartDrawAt = Date.now(); redrawChart(); }
}, 1000);
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
  if ((a.g === 's' || a.g === 'm') && a.id.endsWith('PERP')) notes.push(t('perpNote'));
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
  fillMissingPrices(); fillSelects(); renderMarkets(); renderWatch(); loadBubbles(); renderPulse();
}
const cdcFor = (sym) => state.allInst.includes(sym + '_USD') ? sym + '_USD' : null;
function renderMarkets() {
  const G = state.global, M = state.mk || [];
  if (G && G.total_market_cap) {
    const ch = G.market_cap_change_percentage_24h_usd;
    $('#mk-stats').innerHTML = [[t('mcap'), moneyBig(G.total_market_cap.usd) + ` <span class="${cls(ch)}">${pct(ch)}</span>`], [t('volume'), moneyBig(G.total_volume.usd)],
      [t('dom') + ' BTC', nf(1).format(G.market_cap_percentage.btc) + '%'], [t('dom') + ' ETH', nf(1).format(G.market_cap_percentage.eth) + '%'], [t('coins'), nf(0).format(G.active_cryptocurrencies)]]
      .map(([k, v]) => `<div class="st"><div class="muted small">${esc(k)}</div><div class="st-v">${v}</div></div>`).join(''); balance($('#mk-stats'), 130);
  }
  const coinLine = (c) => { const ch = c.price_change_percentage_24h_in_currency ?? c.chg; return `<div class="ml" data-sym="${esc(c.symbol)}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}<b>${esc(c.symbol)}</b><span class="muted nm">${esc(c.name)}</span><span class="r ${cls(ch)}">${pct(ch, 1)}</span></div>`; };
  $('#mk-trend').innerHTML = (state.trend || []).map(coinLine).join('') || '<div class="muted">—</div>';
  const s24 = M.filter(c => c.price_change_percentage_24h_in_currency != null && c.total_volume > 5e6);
  $('#mk-gain').innerHTML = s24.slice().sort((a, b) => b.price_change_percentage_24h_in_currency - a.price_change_percentage_24h_in_currency).slice(0, 7).map(coinLine).join('') || '<div class="muted">—</div>';
  $('#mk-lose').innerHTML = s24.slice().sort((a, b) => a.price_change_percentage_24h_in_currency - b.price_change_percentage_24h_in_currency).slice(0, 7).map(coinLine).join('') || '<div class="muted">—</div>';
  const [k, dir] = state.mkSort, q = state.mkQ.toUpperCase(), fav = new Set(M.filter(c => WATCH.includes(c.symbol + '_USD')).map(c => c.id));
  const sorted = M.filter(c => (!q || c.symbol.includes(q) || c.name.toUpperCase().includes(q)) && (!state.mkFavOnly || fav.has(c.id))).sort((a, b) => { const x = a[k], y = b[k]; if (typeof x === 'string') return x.localeCompare(y) * dir; return ((x ?? -Infinity) - (y ?? -Infinity)) * dir; });
  const rows = [...sorted.filter(c => fav.has(c.id)), ...sorted.filter(c => !fav.has(c.id))];
  const shown = Math.max(state.mkN, rows.filter(c => fav.has(c.id)).length);
  $('#mk-rows').innerHTML = rows.slice(0, shown).map(c => {
    const cid = cdcFor(c.symbol), inW = cid && WATCH.includes(cid), up7 = (c.price_change_percentage_7d_in_currency || 0) >= 0, isF = fav.has(c.id);
    return `<tr data-sym="${esc(c.symbol)}"${isF ? ' class="fav"' : ''}><td class="muted"><button class="star${isF ? ' on' : ''}" data-fav="${esc(c.symbol)}" title="${t('favTip')}">${isF ? '★' : '☆'}</button>${c.market_cap_rank || ''}</td><td><div class="coin"><img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><b>${esc(c.symbol)}</b><span class="muted nm hide-s">${esc(c.name)}</span></div></td>
      <td class="r">${money(c.current_price)}</td><td class="r ${cls(c.price_change_percentage_1h_in_currency)}">${pct(c.price_change_percentage_1h_in_currency, 1)}</td><td class="r ${cls(c.price_change_percentage_24h_in_currency)}">${pct(c.price_change_percentage_24h_in_currency, 1)}</td><td class="r ${cls(c.price_change_percentage_7d_in_currency)}">${pct(c.price_change_percentage_7d_in_currency, 1)}</td>
      <td class="r hide-s">${moneyBig(c.market_cap)}</td><td class="r hide-s">${moneyBig(c.total_volume)}</td><td class="hide-s spark7">${sparkSVG(c.spark, up7 ? 'var(--up)' : 'var(--dn)', 28)}</td>
      </tr>`;
  }).join('');
  if (!rows.length && state.mkFavOnly) $('#mk-rows').innerHTML = `<tr><td colspan="10" class="muted pad">${t('favEmpty')}</td></tr>`;
  $('#mk-more').hidden = rows.length <= shown; $('#mk-less').hidden = state.mkN <= 10 || state.mkFavOnly;
  $('#mk-favonly').classList.toggle('on', state.mkFavOnly);
  $$('#mk-table th[data-k]').forEach(th => { th.classList.toggle('sorted', th.dataset.k === k); th.dataset.dir = th.dataset.k === k ? (dir > 0 ? '↑' : '↓') : ''; });
}
function openSym(sym) {
  const id = cdcFor(sym); if (!id) return;
  state.asset = id; store.set('asset', id); fillSelects(); loadChart(); renderWatch();
  const c = $('#sec-chart'); if (c.hidden) return; if (c.classList.contains('closed')) $('.head h2', c).click(); c.scrollIntoView({behavior:'smooth', block:'start'});
}

// ---------- бульбашки (наживо) ----------
const STABLE = new Set(['USDT','USDC','DAI','FDUSD','USDE','TUSD','USDS','PYUSD','BUSD','USDD','FRAX','USD1','RLUSD','BSC-USD','USDX','USDTB','SUSDE','USDF','GHO','LUSD','EURC','XAUT','PAXG','WBTC','WETH','STETH','WSTETH','WEETH','CBBTC','RETH','LBTC','SOLVBTC','BNSOL','JITOSOL','MSOL','RSETH','EZETH','METH','SUSDS','WBETH','CLBTC','BBTC']);
const BB_WIN = {'1m': ['1m', 60e3], '5m': ['5m', 300e3], '15m': ['15m', 900e3], '1h': ['1h', 3600e3], '24h': ['1d', 86400e3], '7d': ['7d', 7 * 86400e3]};
const priceBuf = [];
function pushPriceBuf() { if (!state.allTick) return; const m = {}; for (const id in state.allTick) if (id.endsWith('_USD')) m[id] = state.allTick[id].last; priceBuf.push({t: Date.now(), m}); while (priceBuf.length > 140) priceBuf.shift(); }
function bufChange(id, ms) { if (priceBuf.length < 2) return null; const now = priceBuf.at(-1), target = now.t - ms; let old = null; for (const s of priceBuf) { if (s.t <= target + 15e3) old = s; else break; } if (!old || !old.m[id] || !now.m[id]) return null; return (now.m[id] / old.m[id] - 1) * 100; }
let bnSyms = null;
async function bnSymbols() { if (bnSyms) return bnSyms; const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/price', 15000); bnSyms = new Set(j.map(x => x.symbol)); return bnSyms; }
async function bnWindow(symbols, win) {
  const out = {};
  for (let i = 0; i < symbols.length; i += 100) {
    const chunk = symbols.slice(i, i + 100);
    const j = await getJSON(`https://data-api.binance.vision/api/v3/ticker?windowSize=${win}&type=MINI&symbols=${encodeURIComponent(JSON.stringify(chunk))}`, 15000);
    for (const x of j) if (+x.openPrice > 0) out[x.symbol] = {chg: (+x.lastPrice / +x.openPrice - 1) * 100, last: +x.lastPrice};
  }
  return out;
}
let bbReq = 0;
async function loadBubbles() {
  const sec = $('#sec-bubbles'); if (sec.hidden || sec.classList.contains('closed')) return;
  const M = (state.mk || []).filter(c => !STABLE.has(c.symbol)).slice(0, 100); if (!M.length) return;
  const my = ++bbReq, per = state.bbPer, [win, ms] = BB_WIN[per];
  let bn = {};
  try { const syms = await bnSymbols(); bn = await bnWindow(M.map(c => c.symbol + 'USDT').filter(x => syms.has(x)), win); } catch {}
  if (my !== bbReq) return;
  const cgKey = {'1h':'price_change_percentage_1h_in_currency', '24h':'price_change_percentage_24h_in_currency', '7d':'price_change_percentage_7d_in_currency'}[per];
  const items = [];
  for (const c of M) {
    const b = bn[c.symbol + 'USDT'];
    let v = b ? b.chg : null;
    if (v == null && ms <= 3600e3) v = bufChange(c.symbol + '_USD', ms);
    if (v == null && cgKey) v = c[cgKey];
    if (v == null) continue;
    items.push({c, v, price: b ? b.last : (state.allTick && state.allTick[c.symbol + '_USD'] ? state.allTick[c.symbol + '_USD'].last : c.current_price)});
  }
  state.bbItems = items;
  const note = $('#bb-note');
  if (items.length < 20 && ms <= 900e3) { const left = Math.max(0, Math.round((ms - (priceBuf.length ? Date.now() - priceBuf[0].t : 0)) / 1000)); note.textContent = t('liveFill', {p: per, s: left}); } else note.textContent = '● ' + t('bbLive') + ' · ' + hhmm(new Date());
  drawBubbles();
}
const bbPos = {};
let bbW = 0;
function renderBubbles() { if (state.bbItems) drawBubbles(); else loadBubbles(); }
function drawBubbles() {
  const el = $('#bubbles'), items = state.bbItems || [];
  if (!items.length || $('#sec-bubbles').hidden || $('#sec-bubbles').classList.contains('closed')) return;
  const W = el.clientWidth || 800, H = innerWidth < 600 ? 420 : 520;
  const raw = items.map(it => state.bbSize === 'chg' ? Math.sqrt(Math.abs(it.v) + 0.08 * (BB_WIN[state.bbPer][1] < 3600e3 ? 0.2 : 1)) : Math.sqrt(Math.sqrt(it.c.market_cap || 1)));
  const sum = raw.reduce((s, r) => s + r * r * Math.PI, 0), k = Math.sqrt(W * H * 0.6 / sum);
  if (bbW !== W) { for (const key in bbPos) delete bbPos[key]; bbW = W; }
  const fresh = !el.querySelector('svg') || el.dataset.w !== String(W);
  const nodes = items.map((it, i) => { const r = clamp(raw[i] * k, 9, Math.min(W, H) / 5), p = bbPos[it.c.symbol]; return {sym: it.c.symbol, it, r, x: p ? p.x : W / 2 + (Math.random() - .5) * W * .8, y: p ? p.y : H / 2 + (Math.random() - .5) * H * .8}; });
  const iters = Object.keys(bbPos).length ? 90 : 260;
  for (let iter = 0; iter < iters; iter++) {
    for (const n of nodes) { n.x += (W / 2 - n.x) * 0.004; n.y += (H / 2 - n.y) * 0.006; }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, min = a.r + b.r + 2;
      if (d < min) { const m = (min - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * m; a.y -= uy * m; b.x += ux * m; b.y += uy * m; }
    }
    for (const n of nodes) { n.x = clamp(n.x, n.r, W - n.r); n.y = clamp(n.y, n.r, H - n.r); }
  }
  for (const n of nodes) bbPos[n.sym] = {x: n.x, y: n.y};
  if (fresh) { el.dataset.w = W; el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs></defs><g class="bb-root"></g></svg>`; }
  const svg = el.querySelector('svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H);
  const defs = svg.querySelector('defs'), root = svg.querySelector('.bb-root'), keep = new Set();
  for (const n of nodes) {
    const v = n.it.v, int = clamp(Math.abs(v) / (BB_WIN[state.bbPer][1] < 3600e3 ? 1.5 : 10), .25, 1), col = v >= 0 ? '34,197,94' : '239,68,68', id = 'bg-' + n.sym.replace(/[^A-Za-z0-9]/g, '_');
    keep.add(n.sym);
    let gr = defs.querySelector('#' + id); if (!gr) { gr = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient'); gr.id = id; gr.setAttribute('cx', '50%'); gr.setAttribute('cy', '40%'); gr.setAttribute('r', '60%'); defs.appendChild(gr); }
    gr.innerHTML = `<stop offset="0" stop-color="rgba(${col},${(int * .12).toFixed(2)})"/><stop offset=".75" stop-color="rgba(${col},${(int * .32).toFixed(2)})"/><stop offset="1" stop-color="rgba(${col},${(int * .9).toFixed(2)})"/>`;
    let g = root.querySelector(`[data-sym="${CSS.escape(n.sym)}"]`);
    if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'bub'); g.dataset.sym = n.sym; g.style.transform = `translate(${n.x}px,${n.y}px)`; root.appendChild(g); }
    const fs = clamp(n.r / 2.6, 8, 22);
    g.innerHTML = `<circle r="${n.r.toFixed(1)}" fill="url(#${id})" stroke="rgba(${col},.9)" stroke-width="1.5"/>${n.r > 14 ? `<text y="${(-fs * 0.1).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="700">${esc(n.sym)}</text><text y="${(fs * 0.95).toFixed(1)}" text-anchor="middle" font-size="${(fs * 0.72).toFixed(1)}" opacity=".85">${pct(v, v && Math.abs(v) < 1 ? 2 : 1)}</text>` : ''}`;
    requestAnimationFrame(() => { g.style.transform = `translate(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px)`; });
  }
  $$('.bub', root).forEach(g => { if (!keep.has(g.dataset.sym)) g.remove(); });
}
function bubbleTip(e) {
  const g = e.target.closest('.bub'); if (!g) { hideTip(); return; }
  const it = (state.bbItems || []).find(x => x.c.symbol === g.dataset.sym); if (!it) return; const c = it.c;
  showTip(`<b>${esc(c.name)}</b> (${esc(c.symbol)}) #${c.market_cap_rank}<br>${money(it.price)}<br>${state.bbPer}: <span class="${cls(it.v)}">${pct(it.v)}</span><br>${t('mcap')} ${moneyBig(c.market_cap)}`, e.clientX, e.clientY);
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
  const W = el.clientWidth || 600, H = 400, padL = 78, padR = 16, padT = 12, padB = 12, ih = H - padT - padB, bh = ih / NB, bwMax = W - padL - padR - 120;
  const y = (pr) => padT + (hi - pr) / (hi - lo) * ih, P = [];
  const heat = (r, up) => { const a = up ? [[127, 29, 29], [239, 68, 68], [253, 186, 116]] : [[6, 78, 59], [16, 185, 129], [167, 243, 208]]; const k = r < .5 ? 0 : 1, f = r < .5 ? r / .5 : (r - .5) / .5, c0 = a[k], c1 = a[k + 1]; return `rgb(${c0.map((v, i) => Math.round(v + (c1[i] - v) * f)).join(',')})`; };
  P.push(`<defs><linearGradient id="lqbg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1a0b12"/><stop offset=".5" stop-color="#0b1020"/><stop offset="1" stop-color="#06160f"/></linearGradient></defs><rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="url(#lqbg)"/>`);
  for (let k = 0; k <= 8; k++) { const pr = lo + (hi - lo) * k / 8, yy = y(pr); P.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="rgba(255,255,255,.07)"/><text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="rgba(255,255,255,.75)" font-variant-numeric="tabular-nums">${moneyAxis(pr)}</text>`); }
  let cumS = 0, cumL = 0; const cs = [], cl = [];
  const pb = Math.floor((price - lo) / bw);
  for (let b = pb + 1; b < NB; b++) { cumS += bins[b]; cs.push([b, cumS]); }
  for (let b = pb; b >= 0; b--) { cumL += bins[b]; cl.push([b, cumL]); }
  const cmax = Math.max(cumS, cumL) || 1;
  for (let b = 0; b < NB; b++) { if (!bins[b]) continue; const p0 = lo + b * bw, r = bins[b] / mx, w = Math.max(2, r * bwMax), up = p0 > price;
    P.push(`<rect class="lqb" data-b="${b}" x="${padL}" y="${(y(p0 + bw) + 0.6).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, bh - 1.2).toFixed(1)}" rx="2" fill="${heat(r, up)}" opacity="${(.45 + .55 * r).toFixed(2)}"/>`); }
  const cline = (arr, col) => arr.length > 1 ? `<polyline points="${arr.map(([b, v]) => `${(W - padR - v / cmax * 110).toFixed(1)},${y(lo + (b + .5) * bw).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" opacity=".9"/>` : '';
  P.push(cline(cs, '#f87171'), cline(cl, '#34d399'));
  P.push(`<text x="${W - padR - 4}" y="${padT + 12}" text-anchor="end" font-size="10.5" fill="rgba(255,255,255,.55)">${t('liqCum')} →</text>`);
  const py = y(price);
  P.push(`<line x1="${padL}" x2="${W - padR}" y1="${py}" y2="${py}" stroke="#fff" stroke-width="1.4" stroke-dasharray="6 4" opacity=".9"/><rect x="4" y="${py - 11}" width="${padL - 8}" height="22" rx="6" fill="var(--accent)"/><text x="${padL / 2}" y="${py + 4}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${moneyAxis(price)}</text>`);
  const top = bins.map((v, b) => ({v, b})).filter(x => x.v).sort((a, b) => b.v - a.v).slice(0, 6).sort((a, b) => b.b - a.b);
  el.innerHTML = `<div class="liq-w"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${P.join('')}</svg></div>
    <div class="liq-top"><div class="muted small">${t('liqTop')}</div>${top.map(x => { const p0 = lo + (x.b + .5) * bw, up = p0 > price; return `<div class="lt"><span class="dot ${up ? 'red' : 'green'}"></span>${moneyAxis(p0)} <span class="muted">(${pct((p0 / price - 1) * 100, 1)})</span><span class="r"><span class="bar" style="width:${Math.round(x.v / mx * 40)}px;background:${heat(x.v / mx, up)}"></span></span></div>`; }).join('')}
    <div class="liq-leg"><span><span class="dot red"></span>${t('liqShort')}</span><span><span class="dot green"></span>${t('liqLong')}</span></div></div>`;
  const svg = el.querySelector('svg');
  svg.addEventListener('mousemove', e => { const r = e.target.closest('.lqb'); if (!r) { hideTip(); return; } const b = +r.dataset.b, p0 = lo + b * bw; showTip(`${t('liqPrice')}: ${moneyAxis(p0)} – ${moneyAxis(p0 + bw)}<br>${pct(((p0 + bw / 2) / price - 1) * 100, 1)}<br>${t('intensity')}: ${Math.round(bins[b] / mx * 100)}/100`, e.clientX, e.clientY); });
  svg.addEventListener('mouseleave', hideTip);
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
    out.push({ts: d, kind: 'ff', imp: e.impact, title: `${flag} ${LANG === 'uk' ? (FF_UA[e.title] || L10(e.title)) : e.title}`, orig: LANG === 'uk' && !FF_UA[e.title] ? e.title : '', vals});
  }
  for (const c of (state.brief.calendar || [])) { if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue;
    if (out.some(x => ymd(x.ts) === c.date && (x.kind === 'fed' || x.kind === 'cpi' || x.kind === 'jobs' || x.kind === 'holiday') && /ФРС|Fed|CPI|інфляц|inflation|NFP|робоч|jobs|закрит|closed/i.test(c.event))) continue;
    out.push({ts: new Date(c.date + 'T12:00:00'), kind: 'brief', imp: 'Medium', title: L10(c.event), why: L10(c.why), allDay: true}); }
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) for (let m = 0; m < 12; m++) {
    const q = m % 3 === 2, opx = nthWeekday(y, m, 5, 3); opx.setUTCHours(21);
    out.push({ts: opx, kind: 'opex', imp: q ? 'High' : 'Low', title: q ? t('opexQ') : t('opexT'), why: t('opexW')});
    const cx = lastWeekday(y, m, 5); cx.setUTCHours(8);
    out.push({ts: cx, kind: 'cexp', imp: q ? 'High' : 'Medium', title: q ? t('cexpQ') : t('cexpT'), why: t('cexpW')});
  }
  return out.filter(e => e.ts >= from && e.ts <= to && (!state.calHigh || e.imp === 'High')).sort((a, b) => a.ts - b.ts);
}
let calEvents = [];
const pad2 = (n) => String(n).padStart(2, '0');
const icsDate = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
function openEvent(e) {
  let m = $('#modal'); if (!m) { m = document.createElement('div'); m.id = 'modal'; m.className = 'modal'; document.body.appendChild(m); m.addEventListener('click', ev => { if (ev.target === m || ev.target.closest('[data-mclose]')) m.hidden = true; }); }
  const diff = e.ts - Date.now(), abs = Math.abs(diff), dd = Math.floor(abs / 864e5), hh = Math.floor(abs % 864e5 / 36e5), mm = Math.floor(abs % 36e5 / 6e4);
  const left = [dd && dd + ' ' + t('d_'), hh && hh + ' ' + t('h_'), !dd && mm + ' ' + t('m_')].filter(Boolean).join(' ');
  const when = e.ts.toLocaleDateString(LOC(), {weekday:'long', day:'numeric', month:'long', year:'numeric'}) + (e.allDay ? '' : ', ' + hhmm(e.ts) + ' (' + t('evLocal') + ')');
  m.innerHTML = `<div class="m-card"><div class="m-top"><span class="m-kind" style="background:${KCOL[e.kind]}">${esc(t('ev_' + e.kind))}</span><button class="icon-btn sm" data-mclose>✕</button></div>
    <h3>${esc(e.title)}</h3>${e.orig && e.orig !== e.title.replace(/^\S+\s/, '') ? `<div class="muted small">${t('origLbl')}: ${esc(e.orig)}</div>` : ''}
    <div class="m-grid"><div class="muted small">${t('evTime')}</div><div>${esc(when)}<div class="muted small">${diff > 0 ? t('evIn', {t: left}) : t('evPassed')}</div></div>
    <div class="muted small">${t('evImp')}</div><div><span class="imp-dot ${e.imp}"></span> ${t('impact_' + e.imp)}</div>
    ${e.vals ? `<div class="muted small">${t('dataAsOf')}</div><div>${esc(e.vals)}</div>` : ''}</div>
    ${e.why ? `<p>${esc(e.why)}</p>` : ''}
    <div class="m-what"><b>${t('evWhat')}</b><p>${esc(t('k_' + e.kind))}</p></div>
    <div class="m-act">${e.allDay ? '' : `<button class="btn" id="m-ics">📅 ${t('evAddCal')}</button>`}<button class="btn primary" data-mclose>${t('close')}</button></div></div>`;
  m.hidden = false;
  const ics = $('#m-ics'); if (ics) ics.addEventListener('click', () => {
    const end = new Date(e.ts.getTime() + 30 * 6e4), body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//finadvisor//UA', 'BEGIN:VEVENT', `UID:${icsDate(e.ts)}-${e.kind}@finadvisor`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(e.ts)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${e.title.replace(/[,;]/g, ' ')}`, `DESCRIPTION:${(e.why || '').replace(/[,;\n]/g, ' ')}`, 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], {type: 'text/calendar'})); a.download = 'event.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
const KCOL = {fed:'#ef4444', cpi:'#f97316', jobs:'#eab308', ecb:'#3b82f6', holiday:'#94a3b8', opex:'#a78bfa', cexp:'#ec4899', brief:'#22c55e', ff:'#06b6d4'};
function evRow(e) {
  const time = e.allDay ? '' : hhmm(e.ts), idx = calEvents.indexOf(e);
  return `<div class="ev ${e.imp}" data-ev="${idx}" role="button" tabindex="0"><span class="ev-k" style="background:${KCOL[e.kind] || 'var(--muted)'}"></span><div class="ev-d">${e.ts.toLocaleDateString(LOC(), {weekday:'short', day:'numeric', month:'short'})}${time ? '<br>' + time : ''}</div><div><div class="ev-t">${esc(e.title)}</div>${e.why || e.vals ? `<div class="muted small">${esc([e.vals, e.why].filter(Boolean).join(' — '))}</div>` : ''}</div><span class="imp-dot" title="${t('impact_' + e.imp)}"></span></div>`;
}
function renderCal() {
  const el = $('#cal'), now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate()), to = new Date(from); to.setDate(to.getDate() + state.calRange);
  $$('#cal-range button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.calRange)); $$('#bb-per button').forEach(b => b.classList.toggle('on', b.dataset.v === state.bbPer)); $$('#cal-view button').forEach(b => b.classList.toggle('on', b.dataset.v === state.calView)); $('#cal-high').checked = state.calHigh;
  const ev = buildEvents(from, to); calEvents = ev;
  const legend = `<div class="cal-leg">${['fed', 'cpi', 'jobs', 'ecb', 'ff', 'opex', 'cexp', 'holiday', 'brief'].map(k => `<span><i style="background:${KCOL[k]}"></i>${t('ev_' + k)}</span>`).join('')}</div>`;
  if (state.calView === 'list') {
    let html = '', lastDay = '';
    for (const e of ev) { const day = ymd(e.ts); if (day !== lastDay) { html += `<div class="day-h">${e.ts.toLocaleDateString(LOC(), {weekday:'long', day:'numeric', month:'long'})}</div>`; lastDay = day; } html += evRow(e); }
    el.innerHTML = legend + `<div class="ecal">${html || `<div class="muted">${t('ecalEmpty')}</div>`}</div>`; return;
  }
  const byDay = {}; for (const e of ev) (byDay[ymd(e.ts)] = byDay[ymd(e.ts)] || []).push(e);
  const start0 = new Date(from); start0.setDate(start0.getDate() - (start0.getDay() + 6) % 7);
  const pages = Math.max(0, Math.ceil((to - start0) / (35 * 864e5)) - 1);
  state.calMonth = clamp(state.calMonth, 0, pages);
  const ws = new Date(start0); ws.setDate(ws.getDate() + state.calMonth * 35);
  const we = new Date(ws); we.setDate(we.getDate() + 34);
  const wd = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(LOC(), {weekday:'short'}));
  const rng = `${ws.toLocaleDateString(LOC(), {day:'numeric', month:'short'})} — ${we.toLocaleDateString(LOC(), {day:'numeric', month:'short', year:'numeric'})}`;
  let html = `<div class="month"><div class="m-nav"><button class="icon-btn sm" data-mnav="-1"${state.calMonth <= 0 ? ' disabled' : ''}>‹</button><div class="m-h">${rng}</div><button class="icon-btn sm" data-mnav="1"${state.calMonth >= pages ? ' disabled' : ''}>›</button></div><div class="m-g">${wd.map(w => `<div class="wd">${w}</div>`).join('')}`;
  for (let d = 0; d < 35; d++) {
    const dt = new Date(ws); dt.setDate(dt.getDate() + d);
    const key = ymd(dt), es = byDay[key] || [], out = dt < from || dt > to, newMonth = dt.getDate() === 1 || d === 0;
    const dots = `<div class="dots">${es.slice(0, 5).map(e => `<i style="background:${KCOL[e.kind]}"></i>`).join('')}</div>`;
    html += `<button class="dc${out ? ' out' : ''}${key === ymd(now) ? ' today' : ''}${key === state.calDay ? ' sel' : ''}${es.some(e => e.imp === 'High') ? ' hi' : ''}" data-day="${key}"><span class="dnum">${newMonth ? dt.toLocaleDateString(LOC(), {day:'numeric', month:'short'}) : dt.getDate()}</span>${dots}</button>`;
  }
  const m = {ws, we};
  html += '</div></div>';
  const sel = state.calDay && byDay[state.calDay];
  const monthEv = ev.filter(e => e.ts >= m.ws && e.ts < new Date(m.we.getTime() + 864e5));
  let list = '', lastDay = '';
  for (const e of (sel || monthEv)) { const day = ymd(e.ts); if (day !== lastDay) { list += `<div class="day-h">${e.ts.toLocaleDateString(LOC(), {weekday:'long', day:'numeric', month:'long'})}</div>`; lastDay = day; } list += evRow(e); }
  el.innerHTML = legend + `<div class="cal-split">${html}<div class="day-detail">${list || `<div class="muted small">${t('ecalEmpty')}</div>`}</div></div>`;
}
async function loadEvents() { try { const j = await getJSON(BASE + 'data/events.json?t=' + Math.floor(Date.now() / 36e5), 10000); if (j && j.events) { state.events = j.events; store.set('events', j.events); } } catch {} renderCal(); }

// ---------- бриф: розділи ----------
function renderBriefSections() {
  const B = state.brief;
  $('#lights').innerHTML = (B.posture || []).map(p => `<div class="light"><div class="lh"><span class="dot ${esc(p.light)}"></span>${esc(L10(p.asset))}<span class="pos">${esc(L10(p.posture || ''))}</span></div><p>${tx(p.plain)}</p></div>`).join('') || `<div class="muted">${t('noBriefData')}</div>`;
  $('#plain').innerHTML = (B.plain || []).slice().sort((a, b) => a.order - b.order).map(p => `<div class="pl"><b>${esc(L10(p.label))}</b><p>${tx(p.text)}</p></div>`).join('');
  renderNews();
  const SC = (s) => /ведм|bear|ризик|risk/i.test(s) ? 'dn' : /бич|bull|сприят|favo/i.test(s) ? 'up' : 'warn';
  $('#outlook').innerHTML = (B.outlook || []).map(o => `<div class="ol"><div class="oh"><span>${esc(L10(o.area))}</span><span class="stance ${SC(o.stance)}">${esc(L10(o.stance))}</span></div><div class="muted">${tx(o.text)}</div></div>`).join('');
  const W = (B.weekly || []).slice().sort((a, b) => a.order - b.order);
  $('#week').textContent = W[0] ? W[0].week : '';
  $('#weekly').innerHTML = W.map(w => `<div><b>${esc(L10(w.label))}</b><p>${tx(w.text)}</p></div>`).join('');
  $('#tips').innerHTML = (B.general || []).slice().sort((a, b) => a.order - b.order).map(g => `<li>${tx(g.text)}</li>`).join('');
  renderCal(); requestAnimationFrame(balanceAll);
}
// ---------- переклад на мову інтерфейсу (те, що не встиг перекласти сервер) ----------
const TR = {cache: store.get('trc', {}), queue: [], busy: 0, fails: 0, pause: 0, timer: 0};
const trHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const trKey = (text) => LANG + ':' + trHash(text);
function needsTr(text) {
  if (!text) return false; const lat = (text.match(/[A-Za-z]/g) || []).length, cyr = (text.match(/[А-Яа-яЇїІіЄєҐґЁёЫыЭэЪъ]/g) || []).length;
  if (lat + cyr < 4) return false;
  return LANG === 'uk' ? lat > cyr * 1.5 : cyr > lat;
}
function trGet(text) {
  if (!needsTr(text)) return null; const k = trKey(text), v = TR.cache[k];
  if (v) return v;
  if (!TR.queue.some(q => q.k === k) && TR.queue.length < 400) TR.queue.push({k, text}); trPump(); return null;
}
function trPump() {
  if (TR.busy >= 2 || !TR.queue.length || Date.now() < TR.pause) { if (TR.queue.length && !TR.timer) TR.timer = setTimeout(() => { TR.timer = 0; trPump(); }, Math.max(800, TR.pause - Date.now())); return; }
  const job = TR.queue.shift(); TR.busy++;
  const PFX = job.text.match(/^((?:[\W_]*\s*)?)(JUST IN|BREAKING|ТЕРМІНОВО|СРОЧНО|ЩОЙНО)\s*:\s*/i), body = PFX ? job.text.slice(PFX[0].length) : job.text;
  getJSON(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${LANG}&dt=t&q=${encodeURIComponent(body.slice(0, 1800))}`, 10000)
    .then(j => { let out = (j[0] || []).map(x => x && x[0]).filter(Boolean).join('').trim(); if (!out) return; if (PFX) out = `${PFX[1]}${LANG === 'uk' ? 'ЩОЙНО' : 'JUST IN'}: ${out}`; TR.cache[job.k] = out; TR.fails = 0; trSave(); trRender(); })
    .catch(() => { if (++TR.fails >= 3) { TR.pause = Date.now() + 60e3; TR.fails = 0; } })
    .finally(() => { TR.busy--; setTimeout(trPump, 250); });
}
let trSaveT = 0, trRenderT = 0;
function trSave() { clearTimeout(trSaveT); trSaveT = setTimeout(() => { const ks = Object.keys(TR.cache); if (ks.length > 1500) for (const k of ks.slice(0, ks.length - 1200)) delete TR.cache[k]; store.set('trc', TR.cache); }, 1500); }
function trRender() { clearTimeout(trRenderT); trRenderT = setTimeout(() => { try { renderFeed(); renderBriefSections(); renderHero(); renderCal(); renderDeep(); } catch {} }, 400); }
// текст для показу: переклад (якщо є) + маленьке посилання «Оригінал» під ним
function L10(text) { const tr = trGet(text); return tr && !state.showOrig[trKey(text)] ? tr : text; }
function tx(text, small) {
  if (!text) return ''; const tr = trGet(text); if (!tr) return esc(text);
  const k = trKey(text), orig = state.showOrig[k];
  return `${esc(orig ? text : tr)}${small ? '' : ` <button type="button" class="lnk tro" data-tro="${k}">${orig ? t('showTr') : t('showOrig')}</button>`}`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tro]'); if (!b) return; e.preventDefault(); e.stopPropagation(); state.showOrig[b.dataset.tro] = !state.showOrig[b.dataset.tro]; trRender(); });
const SENT = (s) => ({Bullish:t('bullish'), Bearish:t('bearish'), Neutral:t('neutral'), Mixed:t('mixed')}[s] || s);
function renderNews() {
  const N = (state.brief.news || []).filter(n => state.newsF === 'all' || n.impact === state.newsF);
  $('#news').innerHTML = N.map(n => `<div class="nw"><span class="tag ${esc(n.impact)}">${SENT(n.impact)}</span><div class="ti">${tx(n.title, true)}</div><div class="why">${tx(n.why)}</div><div class="meta">${esc([n.category, n.assets, n.source].filter(Boolean).join(' · '))}</div></div>`).join('') || `<div class="muted">${t('noNewsFilter')}</div>`;
}

// ---------- новини наживо ----------
function feedItems() {
  const items = (state.live && state.live.items) || [], off = new Set(srcCfg.disabled || []);
  return items.filter(i => !off.has(i.src.replace('Telegram · ', '')) && (state.liveCat === 'all' || (state.liveCat === 'imp' ? i.imp : state.liveCat === 'telegram' ? i.kind === 'telegram' : i.cat === state.liveCat)) && (state.liveSent === 'all' || i.sent === state.liveSent));
}
const sameLang = (i) => i.lang === LANG;
function itemText(i) {
  let tr = !sameLang(i) && i.t && i.t[LANG] && i.t[LANG].title ? i.t[LANG] : null;
  if (!tr && !sameLang(i)) { const ti = trGet(i.title), bo = i.body ? trGet(i.body.slice(0, 400)) : ''; if (ti) tr = {title: ti, body: bo || (i.body ? '' : '')}; if (tr && i.body && !bo) tr.body = i.body; }
  return tr && !state.showOrig[i.id] ? {title: tr.title, body: tr.body, tr: true} : {title: i.title, body: i.body, tr: false, canTr: !!tr};
}
function trUrl(i) { return `https://translate.google.com/?sl=auto&tl=${LANG}&text=${encodeURIComponent((i.title + '. ' + (i.body || '')).slice(0, 1200))}&op=translate`; }
function renderFeed() {
  const L = state.live, all = feedItems(), list = all.slice(0, state.feedN), seen = new Set(store.get('seenFeed', []));
  $('#live-count').textContent = L ? (L.items || []).length : '';
  $('#live-upd').textContent = L && L.updated ? t('newsUpd', {t: ago(L.updated)}) : '';
  $('#feed').innerHTML = list.map(i => {
    const x = itemText(i), foreign = !sameLang(i);
    const toggle = x.tr ? `<button class="lnk" data-orig="${i.id}">${t('showOrig')}</button> <span class="muted small">· ${t('translated')}</span>` : x.canTr ? `<button class="lnk" data-orig="${i.id}">${t('showTr')}</button>` : foreign ? `<a class="lnk" href="${trUrl(i)}" target="_blank" rel="noopener">${t('showTr')} ↗</a>` : '';
    return `<article class="fi${i.imp ? ' imp' : ''}${seen.has(i.id) ? '' : ' new'}" data-id="${esc(i.id)}">
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
document.addEventListener('click', e => { const a = e.target.closest('#notif-list [data-nid]'); if (!a) return; e.preventDefault(); closePanels(); openFromLink('?n=' + encodeURIComponent(a.dataset.nid)); });
function renderNotifs() { $('#notif-list').innerHTML = notifs.map(n => `<a class="ni${n.read ? '' : ' unread'}" ${n.nid ? `href="#" data-nid="${esc(n.nid)}"` : n.url ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : ''}><div class="ni-h"><span class="ni-k ${n.kind}">${esc(n.head)}</span><time>${ago(n.ts)}</time></div><div>${esc(n.text)}</div></a>`).join('') || `<div class="muted pad">${t('noNotif')}</div>`; }
let audioCtx;
function beep() { if (!store.get('sound', false)) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.15, audioCtx.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + .35); o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + .4); } catch {} }
function notify(kind, head, text, url, nid) {
  const n = {id: Date.now() + Math.random(), kind, head, text, url, nid, ts: new Date().toISOString(), read: false};
  notifs.unshift(n); notifs = notifs.slice(0, 60); store.set('notifs', notifs); updateBadge(); if (!$('#drawer').hidden) renderNotifs();
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = `<button class="toast-x" aria-label="${t('close')}">✕</button><div class="toast-h">${esc(head)}</div><div>${esc(text)}</div>`;
  const dismiss = (dir = 0) => { el.style.transition = 'transform .25s, opacity .25s'; el.style.transform = `translateX(${dir * 120}%)`; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); };
  let sx = null, dx = 0, sy = 0;
  const x = el.querySelector('.toast-x');
  x.addEventListener('pointerdown', e => { e.stopPropagation(); });
  x.addEventListener('pointerup', e => { e.stopPropagation(); });
  x.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); dismiss(1); });
  el.addEventListener('pointerdown', e => { if (e.target.closest('.toast-x')) return; sx = e.clientX; sy = e.clientY; dx = 0; el.style.transition = 'none'; try { el.setPointerCapture(e.pointerId); } catch {} });
  el.addEventListener('pointermove', e => { if (sx == null) return; dx = e.clientX - sx; const dy = e.clientY - sy; if (Math.abs(dy) > Math.abs(dx) && dy < -20) { dismiss(0); sx = null; return; } el.style.transform = `translateX(${dx}px)`; el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220)); });
  el.addEventListener('pointerup', e => { if (sx == null) return; sx = null; if (Math.abs(dx) > 70) { dismiss(Math.sign(dx)); return; } el.style.transition = 'transform .2s, opacity .2s'; el.style.transform = ''; el.style.opacity = '';
    if (Math.abs(dx) < 6) { const hit = document.elementFromPoint(e.clientX, e.clientY); if (hit && hit.closest('.toast-x')) { dismiss(1); return; } if (nid) openFromLink('?n=' + encodeURIComponent(nid)); else if (url && /^https?:/.test(url) && !url.startsWith(location.origin)) open(url, '_blank', 'noopener'); else if (url) openFromLink(url); dismiss(0); } });
  el.addEventListener('pointercancel', () => { sx = null; el.style.transform = ''; el.style.opacity = ''; });
  $('#toasts').prepend(el); while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
  setTimeout(() => { if (el.isConnected) dismiss(0); }, 10000);
  beep();
  if (!pushSub && 'Notification' in window && Notification.permission === 'granted' && store.get('sysNotif', false) && document.visibilityState !== 'visible') { try { const sn = new Notification(head, {body: text, icon: 'icons/icon-192.png', tag: String(n.id)}); sn.onclick = () => { focus(); if (url) open(url, '_blank', 'noopener'); }; } catch {} }
}
function checkNewsNotifs(fresh) {
  const mode = store.get('nmode', 'imp'), seen = new Set(store.get('seenFeed', [])), items = (fresh && fresh.items) || [];
  if (!seen.size) { store.set('seenFeed', items.map(i => i.id)); return; }
  const novel = items.filter(i => !seen.has(i.id));
  if (mode !== 'off') novel.filter(i => mode === 'all' || i.imp).slice(0, 5).reverse().forEach(i => { const x = itemText(i); notify(i.sent, (i.imp ? '⚡ ' : '') + i.src, x.title, i.url, i.id); });
  store.set('seenFeed', [...seen, ...novel.map(i => i.id)].slice(-600));
}
function checkPriceAlerts() {
  const alerts = store.get('alerts', []); let changed = false;
  for (const a of alerts) { const k = state.tickers[a.id]; if (!k || a.done) continue;
    if ((a.op === '>' && k.last >= a.price) || (a.op === '<' && k.last <= a.price)) { a.done = true; changed = true; notify('alert', '🔔 ' + t('alertTitle'), `${fullName(assetFor(a.id))}: ${money(k.last)} (${a.op === '>' ? t('above') : t('below')} ${money(a.price)})`); } }
  if (changed) { store.set('alerts', alerts); renderAlerts(); syncPush(); }
  const day = new Date().toISOString().slice(0, 10), moved = store.get('moved', {});
  for (const id of MOVERS) { const k = state.tickers[id]; if (!k || Math.abs(k.chg) < 5) continue; const key = id + ':' + day + ':' + (k.chg > 0 ? 'u' : 'd'); if (moved[key]) continue; moved[key] = 1;
    notify(k.chg > 0 ? 'Bullish' : 'Bearish', (k.chg > 0 ? '📈 ' : '📉 ') + t('moveTitle'), t('moveText', {a: assetFor(id).tk + ' ' + money(k.last), v: pct(k.chg)})); }
  for (const k in moved) if (!k.includes(day)) delete moved[k]; store.set('moved', moved);
}
function renderAlerts() { const al = store.get('alerts', []); $('#alert-list').innerHTML = al.map((a, i) => `<div class="al${a.done ? ' done' : ''}"><span>${esc(assetFor(a.id).tk)} ${a.op === '>' ? '≥' : '≤'} ${money(a.price)}</span>${a.done ? '<span class="muted small">✓</span>' : ''}<button class="x" data-i="${i}">×</button></div>`).join('') || `<div class="muted small">${t('noAlerts')}</div>`; $('#al-price').placeholder = SYM[CUR].trim(); }
// Push: сповіщення приходять від сервера (Worker), навіть коли FinRAD закритий.
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// service worker готовий — або помилка через 10 с (щоб перемикач ніколи не завис)
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('service worker')), 10000))]);
let pushSub = null, VAPID = store.get('vapid', '');
const b64uBytes = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const pushPrefs = () => ({mode: store.get('nmode', 'imp'), prices: store.get('pPrices', true), events: store.get('pEvents', true), lang: LANG, alerts: store.get('alerts', [])});
async function pushInit() {
  if (!pushOK() || !WORKER) return;
  try { const c = await getJSON(WORKER + '/config', 8000); if (c && c.vapid) { VAPID = c.vapid; store.set('vapid', VAPID); state.cfg = c; } } catch {}
  try { const reg = await swReady(); pushSub = await reg.pushManager.getSubscription(); } catch {}
  if (pushSub) {
    // ключ сервера змінився — переписатися
    const key = pushSub.options && pushSub.options.applicationServerKey; let same = true;
    if (key && VAPID) { const a = new Uint8Array(key), b = b64uBytes(VAPID); same = a.length === b.length && a.every((x, i) => x === b[i]); }
    if (!same) { try { await pushSub.unsubscribe(); } catch {} pushSub = null; if (store.get('push', false)) await pushOn(true); }
    else { await pushPost('/push/subscribe', {sub: pushSub.toJSON(), prefs: pushPrefs()}); syncDoneAlerts(); }
  }
  renderSysBtn();
}
async function pushPost(path, body) { try { const r = await fetch(WORKER + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); return await r.json(); } catch (e) { report('push', path + ': ' + e.message); return null; } }
async function pushOn(silent) {
  if (!pushOK()) return false;
  if (IOS && !STANDALONE) { if (!silent) notify('alert', t('notifications'), t('pushIosHint')); return false; }
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (p !== 'granted') { store.set('push', false); renderSysBtn(); return false; }
  try {
    if (!VAPID) { const c = await getJSON(WORKER + '/config', 8000); VAPID = c.vapid; store.set('vapid', VAPID); }
    const reg = await swReady();
    pushSub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64uBytes(VAPID)});
    const r = await pushPost('/push/subscribe', {sub: pushSub.toJSON(), prefs: pushPrefs()});
    store.set('push', !!(r && r.ok)); renderSysBtn(); return !!(r && r.ok);
  } catch (e) { report('push', 'subscribe: ' + e.message); store.set('push', false); renderSysBtn(); if (!silent) notify('alert', t('notifications'), t('pushFail') + ' ' + e.message); return false; }
}
async function pushOff() { if (pushSub) { await pushPost('/push/unsubscribe', {endpoint: pushSub.endpoint}); try { await pushSub.unsubscribe(); } catch {} } pushSub = null; store.set('push', false); renderSysBtn(); }
let prefsT = 0;
function syncPush() { if (!pushSub) return; clearTimeout(prefsT); prefsT = setTimeout(() => pushPost('/push/prefs', {endpoint: pushSub.endpoint, prefs: pushPrefs()}), 600); }
async function syncDoneAlerts() {
  if (!pushSub) return; const r = await pushPost('/push/state', {endpoint: pushSub.endpoint}); if (!r || !r.prefs) return;
  const srv = r.prefs.alerts || [], al = store.get('alerts', []); let ch = false;
  for (const a of al) { const s = srv.find(x => x.id === a.id && x.op === a.op && Math.abs(x.price - a.price) < 1e-9); if (s && s.done && !a.done) { a.done = true; ch = true; } }
  if (ch) { store.set('alerts', al); renderAlerts(); }
}
function renderSysBtn() {
  const tg = $('#sys-notif'), st = $('#sys-notif-st'), test = $('#push-test');
  if (test) test.hidden = !pushSub;
  if (!pushOK()) { tg.checked = false; tg.disabled = true; st.textContent = IOS ? t('pushIosOld') : t('unsupported'); return; }
  if (Notification.permission === 'denied') { tg.checked = false; tg.disabled = true; st.textContent = IOS ? t('pushBlockedIos') : t('blockedHelp'); return; }
  tg.disabled = false; tg.checked = !!pushSub;
  st.textContent = pushSub ? t('pushOnHelp') : IOS && !STANDALONE ? t('pushIosHint') : t('pushOffHelp');
}
async function renderTg() {
  let s = null; if (WORKER) { try { const c = await getJSON(WORKER + '/config', 8000); s = c && c.tg; state.cfg = c; } catch {} }
  const st = !s || !s.configured ? ['off', t('tgOff')] : !s.linked ? ['pause', t('tgNotLinked')] : s.enabled ? ['on', t('tgOn')] : ['pause', t('tgPaused')];
  $('#tg').innerHTML = `<div class="set-row"><span class="tg-st ${st[0]}">● ${esc(st[1])}</span>${s && s.bot ? `<a class="btn small primary" href="https://t.me/${esc(s.bot)}?start=finrad" target="_blank" rel="noopener">${t('tgOpen')} @${esc(s.bot)}</a>` : ''}</div>
    ${!s || !s.configured ? `<div class="tg-steps"><b>${t('tgSteps')}</b><ol><li>${esc(t('tg1'))}</li><li>${esc(t('tg2'))}</li><li>${esc(t('tg2b'))}</li><li>${esc(t('tg3'))}</li></ol><a class="btn small" href="${REPO}/settings/secrets/actions/new" target="_blank" rel="noopener">${t('tgSecretBtn')} ↗</a> <a class="btn small ghost" href="${REPO}/actions/workflows/worker.yml" target="_blank" rel="noopener">${t('tgDeployBtn')} ↗</a></div>`
      : !s.linked ? `<div class="muted small">${esc(t('tg3'))}</div>` : `<div class="muted small">/on · /off · /important · /all · /prices · /events · /status</div>`}`;
}

// ---------- анонімні звіти (помилки й використання) ----------
const DEVICE = store.get('device', null) || (() => { const id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); store.set('device', id); return id; })();
const repQ = []; const repSeen = new Set();
function report(kind, msg, src, extra) {
  if (!store.get('telemetry', true)) return;
  const key = kind + '|' + msg + '|' + (src || ''); if (repSeen.has(key)) return; repSeen.add(key);
  repQ.push({kind, msg: String(msg || '').slice(0, 500), src: String(src || '').slice(0, 200), extra});
}
async function flushReports(force) {
  if (!WORKER || !store.get('telemetry', true) || (!repQ.length && !force)) return;
  const events = repQ.splice(0, 20);
  try { await fetch(WORKER + '/log', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({device: DEVICE, v: VERSION, lang: LANG, ua: navigator.userAgent, events}), keepalive: true}); }
  catch { repQ.unshift(...events); }
}
function dailyPing() {
  const day = new Date().toISOString().slice(0, 10); if (store.get('pingDay', '') === day) return;
  store.set('pingDay', day);
  report('ping', 'daily', '', {lang: LANG, cur: CUR, theme: store.get('theme', 'auto'), standalone: matchMedia('(display-mode: standalone)').matches || !!navigator.standalone,
    width: innerWidth, sections: getLayout().filter(x => x.on).map(x => x.k), watch: WATCH.length, tz: Intl.DateTimeFormat().resolvedOptions().timeZone});
  flushReports(true);
}
addEventListener('error', e => report('error', e.message, (e.filename || '').split('/').pop() + ':' + e.lineno));
addEventListener('unhandledrejection', e => report('promise', (e.reason && (e.reason.message || String(e.reason))) || 'unknown'));
async function loadConfig() { try { const c = await getJSON(BASE + 'data/config.json?t=' + Math.floor(Date.now() / 6e5), 8000); if (c && typeof c.worker === 'string') { WORKER = c.worker.replace(/\/$/, ''); localStorage.setItem('fa:worker', JSON.stringify(WORKER)); } } catch {} }

// ---------- джерела новин ----------
const DEF_RSS = ['CoinDesk', 'Cointelegraph', 'Decrypt', 'The Block', 'CNBC', 'CNBC Economy', 'CNBC Finance', 'MarketWatch', 'Federal Reserve'];
const DEF_TG = ['WatcherGuru', 'cryptocurrency_media', 'Capitalizator_UA', 'tstamarkets_ua', 'trade_ultra'];
const GH_API = 'https://api.github.com/repos/Dehluloo/finadvisor/contents/data/sources.json';
let srcCfg = store.get('srcCfg', {rss: [], telegram: [], disabled: []}), srcSha = null;
async function loadSources() {
  try { const j = await getJSON('https://raw.githubusercontent.com/Dehluloo/finadvisor/main/data/sources.json?t=' + Date.now(), 8000); if (j && typeof j === 'object') { srcCfg = Object.assign({rss: [], telegram: [], disabled: []}, j); store.set('srcCfg', srcCfg); } } catch {}
  renderSources();
}
function srcStatus(name, kind) {
  const items = (state.live && state.live.items) || [], label = kind === 'tg' ? 'Telegram · ' + name : name;
  const errs = ((state.live && state.live.errors) || []).join(' ');
  if (items.some(i => i.src === label)) return 'ok';
  if (errs.includes(kind === 'tg' ? 'tg ' + name : name + ':')) return 'fail';
  return '';
}
function renderSources() {
  const off = new Set(srcCfg.disabled || []);
  const row = (name, kind, custom, extra) => { const st = srcStatus(name, kind); return `<div class="srcr"><label><input type="checkbox" data-src-on="${esc(name)}"${off.has(name) ? '' : ' checked'}> <span class="src-k">${kind === 'tg' ? '✈︎' : '🌐'}</span> ${esc(kind === 'tg' ? '@' + name : name)}</label><span class="muted small">${extra ? esc(extra) + ' · ' : ''}${custom ? t('srcCustom') : t('srcDef')}${st ? ` · <span class="${st === 'ok' ? 'up' : 'dn'}">${t(st === 'ok' ? 'srcOk' : 'srcFail')}</span>` : ''}</span>${custom ? `<button class="x" data-src-rm="${esc(name)}" data-kind="${kind}">×</button>` : '<span></span>'}</div>`; };
  $('#src-list').innerHTML = [...DEF_TG.map(n => row(n, 'tg', false)), ...(srcCfg.telegram || []).map(n => row(n.replace(/^@/, ''), 'tg', true)),
    ...DEF_RSS.map(n => row(n, 'rss', false)), ...(srcCfg.rss || []).map(r => row(r.name || r.url, 'rss', true, (() => { try { return new URL(r.url).hostname; } catch { return ''; } })()))].join('');
  $('#gh-token').value = store.get('ghToken', '') ? '••••••••••••' : '';
}
async function saveSources() {
  const tok = store.get('ghToken', '');
  store.set('srcCfg', srcCfg); renderSources();
  if (!tok) { $('#src-status').textContent = t('srcNeedToken'); $('.tok').open = true; return; }
  $('#src-status').textContent = t('loading');
  try {
    const H = {Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json'};
    let sha = null; try { const r = await fetch(GH_API + '?ref=main', {headers: H, cache: 'no-store'}); if (r.ok) sha = (await r.json()).sha; } catch {}
    const body = {message: 'Джерела новин (FinRAD)', content: btoa(unescape(encodeURIComponent(JSON.stringify(srcCfg, null, 1)))), branch: 'main'}; if (sha) body.sha = sha;
    const r = await fetch(GH_API, {method: 'PUT', headers: Object.assign({'Content-Type': 'application/json'}, H), body: JSON.stringify(body)});
    if (!r.ok) throw new Error(r.status + ' ' + ((await r.json().catch(() => ({}))).message || ''));
    $('#src-status').textContent = t('srcSaved');
  } catch (e) { $('#src-status').textContent = t('srcErr') + e.message; }
}
function parseSource(v) {
  v = v.trim(); if (!v) return null;
  const tg = v.match(/^@([A-Za-z0-9_]{4,})$/) || v.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})/i);
  if (tg) return {kind: 'tg', name: tg[1]};
  let u = v; if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); if (!x.hostname.includes('.')) return null; return {kind: 'rss', name: x.hostname.replace(/^www\./, ''), url: x.href}; } catch { return null; }
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
const SECTIONS = [['pulse', 1], ['deep', 1], ['since', 1], ['chart', 1], ['watch', 1], ['live', 1], ['markets', 1], ['bubbles', 1], ['fng', 1], ['auto', 1], ['liq', 1], ['perps', 1], ['lights', 1], ['plain', 1], ['news', 1], ['cal', 1], ['outlook', 1], ['weekly', 1], ['portfolio', 0], ['tips', 0]];
function getLayout() { let saved = store.get('layout', null);
  if (saved && !saved.some(s => s.k === 'deep')) { const i = saved.findIndex(s => s.k === 'pulse'); saved.splice(i + 1, 0, {k: 'deep', on: true}); store.set('layout', saved); } if (!saved) return SECTIONS.map(([k, on]) => ({k, on: !!on})); const known = new Set(saved.map(s => s.k)); return [...saved.filter(s => SECTIONS.some(x => x[0] === s.k)), ...SECTIONS.filter(([k]) => !known.has(k)).map(([k, on]) => ({k, on: !!on}))]; }
const isOn = (k) => { const s = getLayout().find(x => x.k === k); return !s || s.on; };
function applyLayout() {
  const main = $('#main'), foot = $('.foot', main);
  for (const s of getLayout()) { const el = $(`[data-sec="${s.k}"]`); if (!el) continue; main.insertBefore(el, foot); if (s.k === 'since') { if (!s.on || !sinceShown) el.hidden = true; } else el.hidden = !s.on; }
  pairHalves();
  $('#layout-list').innerHTML = getLayout().map((s, i) => `<div class="lay"><label><input type="checkbox" data-lk="${s.k}"${s.on ? ' checked' : ''}> ${esc(t('sec_' + s.k))}</label><span><button data-mv="${i}" data-d="-1">↑</button><button data-mv="${i}" data-d="1">↓</button></span></div>`).join('');
}

function pairHalves() {
  const vis = $$('#main > [data-sec]').filter(el => !el.hidden);
  vis.forEach(el => el.classList.remove('solo'));
  for (let i = 0; i < vis.length; i++) { const el = vis[i]; if (!el.classList.contains('half')) continue; const nx = vis[i + 1]; if (nx && nx.classList.contains('half')) { i++; continue; } el.classList.add('solo'); }
}
function balance(el, minW) {
  if (!el) return; const n = el.children.length; if (!n) return;
  const w = el.clientWidth || el.parentElement.clientWidth; if (!w) return;
  const maxC = Math.max(1, Math.floor((w + 12) / (minW + 12))), cols = Math.min(n, Math.ceil(n / Math.ceil(n / maxC)));
  el.style.display = 'grid'; el.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
}
function balanceAll() { balance($('#lights'), 200); balance($('#plain'), 200); balance($('#weekly'), 230); balance($('#mk-stats'), 130); balance($('#outlook'), 260); balance($('#since-row'), 110); }
// ---------- оновлення ----------
function setStatus(txt) {
  const fresh = Date.now() - state.tickAt < 3 * T_TICK && navigator.onLine !== false;
  $('#live-dot').classList.toggle('on', fresh);
  if (txt) { $('#status').textContent = txt; return; }
  if (!state.tickAt) { $('#status').textContent = t('noPrices'); return; }
  $('#status').textContent = (fresh ? t('live') + ' · ' : '') + t('updated') + ' ' + hhmm(new Date(state.tickAt)) + (navigator.onLine === false ? ' · ' + t('offline') : '');
}
// Бриф: автоматичний (Worker, щопівгодини, за правилами) або аналіз Claude, якщо він свіжіший за добу.
async function loadBrief() {
  try { const j = await getJSON(BASE + 'data/brief.json?t=' + Date.now(), 10000); if (j && j.brief) state.briefUk = j; } catch {}
  let auto = null;
  if (WORKER) { try { const j = await getJSON(WORKER + '/brief?lang=' + LANG, 10000); if (j && j.brief) { auto = j; store.set('autoBrief:' + LANG, j); } } catch { auto = store.get('autoBrief:' + LANG, null); } }
  const F = state.briefUk, claudeAt = F && F.source === 'claude' && F.generated ? Date.parse(F.generated) : 0;
  let pick = F;
  if (LANG === 'en' && F) { try { let j; try { j = await getJSON(LIVE + 'brief_en.json?t=' + Date.now(), 10000); } catch { j = await getJSON(BASE + 'data/brief_en.json?t=' + Date.now(), 10000); } const a = (F.brief || [])[0], b = (j.brief || [])[0]; if (j && b && (!a || a.date === b.date)) pick = j; } catch {} }
  if (auto && !(claudeAt && Date.now() - claudeAt < 24 * 3600e3)) pick = auto;
  try { const d = await getJSON(BASE + 'data/deep.json?t=' + Date.now(), 12000); if (d && d.uk && d.en) { state.deep = d; store.set('deep', d); } } catch { if (!state.deep) state.deep = store.get('deep', null); }
  const D = state.deep, dFresh = D && Date.now() - Date.parse(D.generated) < 36 * 3600e3;
  if (dFresh && D[LANG]) pick = Object.assign({}, D[LANG], {source: 'claude', generated: D.generated});
  if (!pick) pick = auto || F || {};
  state.brief = Object.assign({}, pick, {hist: (F && F.hist) || pick.hist});
  renderHero(); renderBriefSections(); renderDeep();
}
// ---------- глибокий аналіз Claude (data/deep.json, оновлює щоденне завдання Claude) ----------
const BIAS_C = {bullish: 'up', neutral: 'warn', bearish: 'dn'};
function nextDeepAt() { const n = new Date(), k = new Date(n.toLocaleString('en-US', {timeZone: 'Europe/Kyiv'})), off = k - n, d = new Date(n); d.setTime(+n + off); d.setHours(8, 47, 0, 0); if (d <= new Date(+n + off)) d.setDate(d.getDate() + 1); return new Date(+d - off); }
function renderDeep() {
  const box = $('#deep'); if (!box) return;
  const D = state.deep, X = D && D[LANG] && D[LANG].deep;
  const nxt = nextDeepAt(), nxtTxt = nxt.toLocaleString(LOC(), {weekday: 'short', hour: '2-digit', minute: '2-digit'});
  if (!X) { $('#deep-meta').textContent = ''; box.innerHTML = `<div class="deep-empty"><b>${t('deepNone')}</b><p class="muted">${t('deepNoneTxt', {t: nxtTxt})}</p></div>`; return; }
  const age = Date.now() - Date.parse(D.generated), stale = age > 36 * 3600e3;
  $('#deep-meta').innerHTML = `<span class="chip${stale ? ' warn' : ''}">${t('deepUpd', {t: ago(D.generated)})}</span><span class="chip">${t('deepNext', {t: nxtTxt})}</span>`;
  const usd = (v) => '$' + (+v).toLocaleString(LOC(), {maximumFractionDigits: v >= 1000 ? 0 : v >= 10 ? 2 : 4});
  const lvl = (arr) => (arr || []).filter(v => v != null && v !== '').map(v => typeof v === 'number' ? usd(v) : esc(v)).join(' · ') || '—';
  const rl = {low: 'green', medium: 'yellow', high: 'red'}[X.risk_level] || 'yellow';
  box.innerHTML = `${stale ? `<div class="deep-stale">${t('deepStale')}</div>` : ''}
    <div class="deep-top"><span class="dot ${rl}"></span><div><h3>${esc(X.headline)}</h3><div class="muted small">${t('deepRisk')}: <b>${esc(t('risk_' + X.risk_level))}</b> · ${t('deepHorizon')}: ${esc(X.horizon)}</div></div></div>
    <p class="deep-thesis">${esc(X.thesis)}</p>
    <div class="deep-assets">${(X.assets || []).map(a => `<div class="da"><div class="da-h"><b>${esc(a.tk)}</b><span class="muted">${esc(a.name)}</span><span class="stance ${BIAS_C[a.bias] || 'warn'}">${esc(t('bias_' + a.bias))}${a.conviction ? ' ' + '●'.repeat(a.conviction) + '○'.repeat(3 - a.conviction) : ''}</span></div>
      ${a.price ? `<div class="da-px">${typeof a.price === 'number' ? usd(a.price) : esc(a.price)}<span class="muted small"> ${t('deepAtTime')}</span></div>` : ''}
      <div class="da-lv"><span>${t('support')}: ${lvl(a.support)}</span><span>${t('resistance')}: ${lvl(a.resistance)}</span></div>
      <p>${esc(a.text)}</p>${a.invalidation ? `<div class="muted small">${t('invalid')}: ${esc(a.invalidation)}</div>` : ''}</div>`).join('')}</div>
    <div class="deep-sc">${(X.scenarios || []).map(c => `<div class="dsc"><div class="dsc-h"><b>${esc(c.name)}</b><span>${Math.round(+c.prob || 0)}%</span></div><div class="dsc-bar"><i style="width:${Math.max(3, Math.min(100, +c.prob || 0))}%"></i></div><p>${esc(c.text)}</p></div>`).join('')}</div>
    <div class="deep-secs">${(X.sections || []).map(c => `<details class="ds"${c.open ? ' open' : ''}><summary>${esc(c.h)}</summary><p>${esc(c.text)}</p></details>`).join('')}</div>
    <div class="deep-cols"><div><h4>${t('deepRisks')}</h4><ul>${(X.risks || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div><div><h4>${t('deepWatch')}</h4><ul>${(X.watch || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div></div>
    ${(D.sources || []).length ? `<div class="deep-src muted small">${t('sources')}: ${D.sources.slice(0, 8).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</div>` : ''}
    <div class="muted small deep-disc">${t('deepDisc')}</div>`;
}
function openDeep() { goSection('deep'); }
window.__finrad = {notify: (...a) => notify(...a), version: VERSION};
async function loadLive(first) {
  try { let j = null;
    if (WORKER) { try { j = await getJSON(WORKER + '/live', 12000); } catch (e) { report('net', 'worker /live: ' + e.message); } }
    if (!j || !j.items || !j.items.length) { try { j = await getJSON(LIVE + 'live.json?t=' + Date.now(), 10000); } catch { j = await getJSON(BASE + 'data/live.json?t=' + Date.now(), 10000); } }
    if (state.live && j && j.updated && state.live.updated && j.updated < state.live.updated) j = state.live;
    if (j && j.items) { if (!state.live || state.live.updated !== j.updated || first) checkNewsNotifs(j); state.live = j; store.set('live', j); } } catch {}
  renderFeed(); renderPerps(); renderCal(); renderPulse();
}
async function tick() {
  let ok = false;
  try { Object.assign(state.tickers, await fetchTickers()); ok = true; }
  catch { const fb = await fetchTickersFallback(); if (Object.keys(fb).length) { Object.assign(state.tickers, fb); ok = true; } }
  fillMissingPrices();
  if (ok) { pushPriceBuf(); state.tickAt = Date.now(); store.set('tickers', state.tickers); store.set('tickAt', state.tickAt); renderWatch(); renderPortfolio(); renderChartHead(); checkPriceAlerts(); renderSince(); }
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
  if (id === 'settings') { renderAlerts(); renderSysBtn(); renderTg(); applyLayout(); loadSources(); } }
function closePanels() { $$('.drawer').forEach(d => d.hidden = true); $('#scrim').hidden = true; }
function fillSelects() {
  const groups = [['c', t('crypto')], ['s', t('stocks')], ['m', t('metals')], ['p', t('perpsGrp')]];
  const opts = (list) => groups.map(([g, label]) => { const as = list.filter(a => a.g === g); return as.length ? `<optgroup label="${esc(label)}">` + as.map(a => `<option value="${a.id}">${esc(fullName(a))}</option>`).join('') + '</optgroup>' : ''; }).join('');
  const list = watchAssets(); if (!WATCH.includes(state.asset)) list.unshift(assetFor(state.asset));
  const html = opts(list), all = [...list, ...BASE_ASSETS.filter(a => !list.includes(a))];
  for (const s of ['#pf-asset', '#al-asset']) { const el = $(s), v = el.value; el.innerHTML = opts(all); if (v) el.value = v; }
  const grp = store.get('assetGrp', 'fav'); $$('#asset-grp button').forEach(b => b.classList.toggle('on', b.dataset.v === grp));
  const topCrypto = (state.mk || []).filter(c => !STABLE.has(c.symbol)).slice(0, 60).map(c => assetFor(c.symbol + '_USD'));
  const inG = (a) => grp === 's' ? a.g === 's' || a.g === 'p' : a.g === grp;
  let pool = grp === 'fav' ? watchAssets() : grp === 'c' ? [...new Map([...BASE_ASSETS.filter(a => a.g === 'c'), ...watchAssets().filter(a => a.g === 'c'), ...topCrypto].map(a => [a.id, a])).values()] : [...new Map([...BASE_ASSETS.filter(inG), ...EXTRA_ASSETS.filter(inG), ...watchAssets().filter(inG)].map(a => [a.id, a])).values()];
  if (!pool.length) pool = BASE_ASSETS.slice(0, 5);
  if (!pool.some(a => a.id === state.asset)) pool = [assetFor(state.asset), ...pool];
  $('#asset-select').innerHTML = grp === 'fav' ? `<optgroup label="★ ${esc(t('grpFav'))}">` + pool.map(a => `<option value="${a.id}">${esc(fullName(a))}</option>`).join('') + '</optgroup>' : opts(pool);
  $('#asset-select').value = state.asset;
  $('#cmp-select').innerHTML = `<option value="">${t('none')}</option>` + opts(all.filter(a => a.id !== state.asset)); $('#cmp-select').value = state.cmp;
  const coins = [...new Set(['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE', ...watchAssets().filter(a => a.g === 'c').map(a => a.tk)])];
  $('#liq-coin').innerHTML = coins.map(c => `<option>${c}</option>`).join(''); $('#liq-coin').value = state.liqCoin;
}
const safe = (fn) => { try { fn(); } catch (e) { console.error('[FinRAD]', fn.name, e); report('render', e.message, fn.name); } };
function renderAll() {
  [applyI18n, applyLook, fillSelects, applyLayout, renderHero, renderBriefSections, renderDeep, renderWatch, renderPortfolio, renderFng, renderAuto, renderPulse,
   renderChartHead, renderFeed, renderPerps, renderCal, renderMarkets, renderNotifs, renderAlerts, renderSysBtn, redrawChart, () => setStatus()].forEach(safe);
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
      if (!c) { balanceAll(); if (sec.id === 'sec-chart') redrawChart(); if (sec.id === 'sec-watch') renderWatch(); if (sec.id === 'sec-bubbles') loadBubbles(); if (sec.id === 'sec-liq') loadLiq(); } };
    h.parentElement.addEventListener('click', e => { if (Date.now() - dragJustEnded < 250) return; if (e.target.closest('button:not(.info),select,input,a,label,.seg,.row-g,details') && !e.target.closest('h2')) return; if (e.target.closest('.info')) return; flip(); });
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  });
}
const seg = (sel, fn) => $(sel).addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !$(sel).contains(b)) return; $$(sel + ' button').forEach(x => x.classList.toggle('on', x === b)); fn(b); });

function goSection(k) {
  const sec = $(`[data-sec="${k}"]`); if (!sec) return;
  if (sec.hidden) { const L = getLayout(); const x = L.find(s => s.k === k); if (x) { x.on = true; store.set('layout', L); applyLayout(); } }
  if (sec.classList.contains('closed')) $('.head h2', sec).click();
  const y = Math.max(0, sec.getBoundingClientRect().top + scrollY - ($('.top').offsetHeight + 8)); scrollTo({top: y, behavior: 'smooth'});
  setTimeout(() => { if (Math.abs(scrollY - y) > 40 && document.documentElement.scrollHeight - innerHeight > y - 40) scrollTo(0, y); }, 700);
  sec.classList.add('flash'); setTimeout(() => sec.classList.remove('flash'), 1600);
}
function openFromLink(u) {
  let q; try { q = new URL(u, location.href).searchParams; } catch { return; }
  const n = q.get('n'), g = q.get('go');
  if (n) { state.liveCat = 'all'; state.liveSent = 'all'; state.feedN = Math.max(state.feedN, 40); $$('#live-cat button').forEach(b => b.classList.toggle('on', b.dataset.c === 'all')); $$('#live-sent button').forEach(b => b.classList.toggle('on', b.dataset.s === 'all')); renderFeed();
    goSection('live'); setTimeout(() => { const el = $(`#feed [data-id="${n}"]`); if (el) { el.classList.add('hl'); el.scrollIntoView({behavior: 'smooth', block: 'center'}); setTimeout(() => el.classList.remove('hl'), 4000); } }, 500); }
  else if (g) goSection(g);
  if (n || g) history.replaceState(null, '', location.pathname);
}
function collapseAll(close) {
  const s = store.get('collapsed', {});
  $$('[data-collapse]').forEach(sec => { sec.classList.toggle('closed', close); const h = $('.head h2', sec); if (h) h.setAttribute('aria-expanded', String(!close)); s[sec.id] = close; });
  store.set('collapsed', s); if (!close) { balanceAll(); redrawChart(); renderBubbles(); loadLiq(); }
}
function init() {
  if (!WATCH.length) WATCH = BASE_ASSETS.map(a => a.id);
  if (!TF[state.tf]) state.tf = '1h';
  const pick = (id) => { state.asset = id; store.set('asset', id); if (state.cmp === id) state.cmp = ''; fillSelects(); renderWatch(); loadChart(); wsSync(); };
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
  seg('#asset-grp', b => { store.set('assetGrp', b.dataset.v); fillSelects(); });
  seg('#tf-seg', b => { state.tf = b.dataset.tf; store.set('tf', state.tf); loadChart(); });
  seg('#news-seg', b => { state.newsF = b.dataset.f; renderNews(); });
  seg('#live-cat', b => { state.liveCat = b.dataset.c; state.feedN = 12; renderFeed(); });
  seg('#live-sent', b => { state.liveSent = b.dataset.s; state.feedN = 12; renderFeed(); });
  $('#feed-more').addEventListener('click', () => { state.feedN += 20; renderFeed(); });
  $('#feed').addEventListener('click', e => { const b = e.target.closest('[data-orig]'); if (!b) return; const id = b.dataset.orig; state.showOrig[id] = !state.showOrig[id]; renderFeed(); });
  $('#mk-q').addEventListener('input', e => { state.mkQ = e.target.value.trim(); state.mkN = 10; renderMarkets(); });
  $('#mk-more').addEventListener('click', () => { state.mkN = state.mkN < 25 ? 25 : state.mkN < 50 ? 50 : state.mkN + 50; renderMarkets(); });
  $('#mk-less').addEventListener('click', () => { state.mkN = 10; renderMarkets(); $('#sec-markets').scrollIntoView({behavior:'smooth', block:'start'}); });
  $('#mk-favonly').addEventListener('click', () => { state.mkFavOnly = !state.mkFavOnly; renderMarkets(); });
  $('#mk-table thead').addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th) return; const k = th.dataset.k; state.mkSort = [k, state.mkSort[0] === k ? -state.mkSort[1] : (k === 'market_cap_rank' || k === 'name' ? 1 : -1)]; renderMarkets(); });
  $('#mk-rows').addEventListener('click', e => { const f = e.target.closest('[data-fav]'); if (f) { e.stopPropagation(); const id = f.dataset.fav + '_USD'; setWatch(WATCH.includes(id) ? WATCH.filter(x => x !== id) : [...WATCH, id]); renderMarkets(); fillMissingPrices(); renderWatch(); wsSync(); return; } const tr = e.target.closest('tr[data-sym]'); if (tr) openSym(tr.dataset.sym); });
  $$('#mk-trend,#mk-gain,#mk-lose').forEach(el => el.addEventListener('click', e => { const r = e.target.closest('[data-sym]'); if (r) openSym(r.dataset.sym); }));
  seg('#bb-per', b => { state.bbPer = b.dataset.v; store.set('bbPer', state.bbPer); state.bbItems = null; loadBubbles(); });
  seg('#bb-size', b => { state.bbSize = b.dataset.v; drawBubbles(); });
  $('#liq-coin').addEventListener('change', e => { state.liqCoin = e.target.value; store.set('liqCoin', state.liqCoin); loadLiq(); });
  seg('#liq-range', b => { state.liqDays = +b.dataset.v; loadLiq(); });
  seg('#cal-range', b => { state.calMonth = 0; state.calRange = +b.dataset.v; store.set('calRange', state.calRange); renderCal(); });
  seg('#cal-view', b => { state.calView = b.dataset.v; store.set('calView', state.calView); renderCal(); });
  $('#cal-high').addEventListener('change', e => { state.calHigh = e.target.checked; store.set('calHigh', state.calHigh); renderCal(); });
  $('#cal').addEventListener('click', e => { const mn = e.target.closest('[data-mnav]'); if (mn) { state.calMonth += +mn.dataset.mnav; state.calDay = null; renderCal(); return; } const ev = e.target.closest('[data-ev]'); if (ev) { e.stopPropagation(); const x = calEvents[+ev.dataset.ev]; if (x) openEvent(x); return; } const d = e.target.closest('[data-day]'); if (!d) return; state.calDay = state.calDay === d.dataset.day ? null : d.dataset.day; renderCal(); });
  $('#cal').addEventListener('keydown', e => { if (e.key === 'Enter') { const ev = e.target.closest('[data-ev]'); if (ev && calEvents[+ev.dataset.ev]) openEvent(calEvents[+ev.dataset.ev]); } });
  document.addEventListener('click', e => { const b = e.target.closest('.info'); if (b) { e.stopPropagation(); e.preventDefault(); showHelp(b); return; } const pop = $('#help-pop'); if (pop && !pop.hidden && !e.target.closest('#help-pop')) pop.hidden = true; }, true);
  $('#tips-tog').addEventListener('change', e => { store.set('tips', e.target.checked); applyLook(); });
  $('#bubbles').addEventListener('mousemove', bubbleTip); $('#bubbles').addEventListener('mouseleave', hideTip);
  $('#bubbles').addEventListener('click', e => { const g = e.target.closest('.bub'); if (g) openSym(g.dataset.sym); });
  initDrag(); initMobile();
  $('#src-form').addEventListener('submit', e => { e.preventDefault(); const p = parseSource($('#src-in').value); if (!p) { $('#src-status').textContent = t('srcBad'); return; }
    if (p.kind === 'tg') { if (!DEF_TG.includes(p.name) && !(srcCfg.telegram || []).includes(p.name)) srcCfg.telegram = [...(srcCfg.telegram || []), p.name]; }
    else if (!(srcCfg.rss || []).some(r => r.url === p.url)) srcCfg.rss = [...(srcCfg.rss || []), {name: p.name, url: p.url}];
    srcCfg.disabled = (srcCfg.disabled || []).filter(x => x !== p.name); $('#src-in').value = ''; saveSources(); });
  $('#src-list').addEventListener('change', e => { const n = e.target.dataset.srcOn; if (!n) return; const d = new Set(srcCfg.disabled || []); if (e.target.checked) d.delete(n); else d.add(n); srcCfg.disabled = [...d]; renderFeed(); saveSources(); });
  $('#src-list').addEventListener('click', e => { const b = e.target.closest('[data-src-rm]'); if (!b) return; const n = b.dataset.srcRm;
    if (b.dataset.kind === 'tg') srcCfg.telegram = (srcCfg.telegram || []).filter(x => x.replace(/^@/, '') !== n); else srcCfg.rss = (srcCfg.rss || []).filter(r => (r.name || r.url) !== n);
    srcCfg.disabled = (srcCfg.disabled || []).filter(x => x !== n); saveSources(); });
  $('#gh-save').addEventListener('click', () => { const v = $('#gh-token').value.trim(); if (!v || v.startsWith('•')) return; store.set('ghToken', v); $('#gh-token').value = '••••••••••••'; $('#src-status').textContent = t('tokenSaved'); saveSources(); });
  $('#since-x').addEventListener('click', () => { $('#sec-since').hidden = true; });
  $('#refresh').addEventListener('click', () => refreshAll());
  $('#bell').addEventListener('click', () => openPanel('drawer'));
  $('#settings-btn').addEventListener('click', () => openPanel('settings'));
  $('#scrim').addEventListener('click', closePanels); $$('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });
  $('#notif-clear').addEventListener('click', () => { notifs = []; store.set('notifs', notifs); renderNotifs(); updateBadge(); });
  seg('#lang-seg', b => { LANG = b.dataset.v; store.set('lang', LANG); renderAll(); loadBrief(); renderTg(); syncPush(); });
  seg('#cur-seg', b => { CUR = b.dataset.v; store.set('cur', CUR); loadRates().then(() => { renderAll(); loadLiq(); }); });
  seg('#theme-seg', b => { store.set('theme', b.dataset.v); applyLook(); redrawChart(); });
  seg('#dens-seg', b => { store.set('density', b.dataset.v); applyLook(); });
  $('#accent-sw').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; store.set('accent', b.dataset.c); applyLook(); redrawChart(); });
  $('#layout-list').addEventListener('change', e => { const k = e.target.dataset.lk; if (!k) return; const L = getLayout(); L.find(s => s.k === k).on = e.target.checked; store.set('layout', L); applyLayout(); if (e.target.checked) { if (k === 'bubbles') renderBubbles(); if (k === 'liq') loadLiq(); if (k === 'chart') redrawChart(); } });
  $('#layout-list').addEventListener('click', e => { const b = e.target.closest('[data-mv]'); if (!b) return; const L = getLayout(), i = +b.dataset.mv, j = i + +b.dataset.d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; store.set('layout', L); applyLayout(); });
  $('#layout-reset').addEventListener('click', () => { store.set('layout', null); applyLayout(); renderBubbles(); loadLiq(); redrawChart(); });
  seg('#nmode-seg', b => { store.set('nmode', b.dataset.v); syncPush(); });
  $('#p-prices').checked = store.get('pPrices', true); $('#p-events').checked = store.get('pEvents', true);
  $('#p-prices').addEventListener('change', e => { store.set('pPrices', e.target.checked); syncPush(); });
  $('#p-events').addEventListener('change', e => { store.set('pEvents', e.target.checked); syncPush(); });
  $('#push-test').addEventListener('click', async () => { const r = pushSub && await pushPost('/push/test', {endpoint: pushSub.endpoint}); notify('alert', t('notifications'), r && r.ok ? t('pushTestSent') : t('pushFail') + ' ' + ((r && (r.error || r.status)) || '')); });
  $('#claude-btn').addEventListener('click', openDeep);
  $('#collapse-all').addEventListener('click', () => collapseAll(true)); $('#expand-all').addEventListener('click', () => collapseAll(false));
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { const d = e.data || {}; if (d.type === 'open') openFromLink(d.url); if (d.type === 'push') loadLive(); if (d.type === 'resubscribe' && store.get('push', false)) pushOn(true); });
  $('#sound-tog').addEventListener('change', e => { store.set('sound', e.target.checked); if (e.target.checked) beep(); });
  $('#sys-notif').addEventListener('change', async (e) => {
    if (!e.target.checked) { await pushOff(); return; }
    e.target.disabled = true; const ok = await pushOn(false); e.target.disabled = false;
    if (ok) notify('alert', t('notifications'), t('pushOnToast'));
  });
  $('#alert-form').addEventListener('submit', e => { e.preventDefault(); const price = parseFloat($('#al-price').value) / rate(); if (!(price > 0)) return; const al = store.get('alerts', []); al.push({id: $('#al-asset').value, op: $('#al-op').value, price, done: false}); store.set('alerts', al); $('#al-price').value = ''; renderAlerts(); syncPush(); });
  $('#alert-list').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; const al = store.get('alerts', []); al.splice(+b.dataset.i, 1); store.set('alerts', al); renderAlerts(); syncPush(); });
  $('#pf-form').addEventListener('submit', e => { e.preventDefault(); const amt = parseFloat($('#pf-amount').value); if (!(amt > 0)) return; const rows = pfGet(), id = $('#pf-asset').value, ex = rows.find(r => r.id === id); if (ex) ex.amount += amt; else rows.push({id, amount: amt}); store.set('portfolio', rows); $('#pf-amount').value = ''; renderPortfolio(); });
  $('#pf-rows').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; const rows = pfGet(); rows.splice(+b.dataset.i, 1); store.set('portfolio', rows); renderPortfolio(); });
  document.addEventListener('animationend', e => e.target.classList && e.target.classList.remove('flash-up', 'flash-dn'));
  initCollapse(); renderAll(); updateBadge();
  let rz, lw = innerWidth; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (Math.abs(innerWidth - lw) < 20) return; lw = innerWidth; redrawChart(); renderBubbles(); loadLiq(); renderWatch(); balanceAll(); }, 200); });

  loadConfig().then(() => { pushInit(); return refreshAll(); }).then(() => { loadLive(true); wsConnect(); dailyPing(); openFromLink(location.href); });
  setInterval(() => flushReports(), 5 * 60e3); addEventListener('pagehide', () => flushReports());
  setInterval(() => { if (WORKER && document.visibilityState === 'visible') loadLive(); }, 30e3);
  const tel = $('#tel-tog'); tel.checked = store.get('telemetry', true); tel.addEventListener('change', () => store.set('telemetry', tel.checked));
  setInterval(tick, T_TICK);
  setInterval(() => { if (document.visibilityState === 'visible' && TF[state.tf].intra) loadChart(true); }, T_CHART);
  setInterval(() => loadLive(), T_LIVE);
  setInterval(loadBrief, T_BRIEF);
  setInterval(() => { if (document.visibilityState === 'visible') loadMarkets(); }, T_MK);
  setInterval(() => { if (document.visibilityState === 'visible') loadLiq(); }, T_LIQ);
  setInterval(() => { if (document.visibilityState === 'visible') loadBubbles(); }, 30e3);
  setInterval(() => { if (Date.now() - state.last >= T_FULL) refreshAll(); }, 60e3);
  setInterval(() => { renderFeed(); setStatus(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSnap(); else { tick(); loadLive(); if (Date.now() - state.last >= T_FULL) refreshAll(); } });
  addEventListener('pagehide', saveSnap);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) navigator.serviceWorker.register('sw.js?v=' + VERSION).catch(e => report('sw', e.message));
  const checkVersion = async () => { try { const j = await getJSON(BASE + 'version.json?t=' + Date.now(), 8000); if (j && j.v && j.v !== VERSION && location.protocol.startsWith('http')) { notify('alert', 'FinRAD ' + j.v, t('updating')); setTimeout(() => location.reload(), 2500); } } catch {} };
  setTimeout(checkVersion, 5000); setInterval(checkVersion, 3 * 60e3); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
}
init();
})();
