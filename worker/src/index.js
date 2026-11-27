// FinRAD Worker 4: збирає новини щохвилини (cron), зберігає їх у D1, надсилає push-сповіщення і Telegram,
// складає автоматичний бриф, віддає дані програмі. Cloudflare Workers + D1, безкоштовний план.
import { L } from './lists.js';
import { sendPush, makeVapid } from './webpush.js';
import { buildBrief } from './brief.js';

const VERSION = '4.1.0';
const APP = 'https://dehluloo.github.io/finadvisor/';
const GH_LIVE = 'https://raw.githubusercontent.com/Dehluloo/finadvisor/live/live.json';
const GH_SOURCES = 'https://raw.githubusercontent.com/Dehluloo/finadvisor/main/data/sources.json';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 finrad-worker';
const CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'};
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {status, headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, CORS, extra)});
const KEEP_MS = 48 * 3600e3, MAX_ITEMS = 150;
const COINS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE'];

// ---------- допоміжне ----------
const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
const unesc = (s) => (s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
const clean = (s) => unesc((s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t\r\f\v]+/g, ' ').trim();
const hash = (s) => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); } return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(12, '0').slice(0, 12); };
const normT = (s) => (s || '').toLowerCase().replace(/[\W_]+/gu, '').slice(0, 80);
async function get(url, ms = 9000, opt = {}) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, Object.assign({headers: {'User-Agent': UA, Accept: '*/*'}, signal: c.signal}, opt)); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } finally { clearTimeout(t); } }
const getJ = async (url, ms, opt) => JSON.parse(await get(url, ms, opt));

const AD_LINK = /t\.me\/\+|t\.me\/joinchat|bit\.ly|linktr\.ee|utm_|\/ref\/|ref=|referral|invite/i;
function isAd(title, body = '') { const t = (' ' + title + ' ' + body + ' ').toLowerCase(); if (L.AD_WORDS.some(w => t.includes(w))) return true; if (AD_LINK.test(title + ' ' + body)) return true; return (title || '').replace(/[\W\d_]+/gu, '').length < 12; }
function classify(text) {
  const t = ' ' + text.toLowerCase() + ' ', cnt = (arr) => arr.reduce((n, k) => n + t.split(k).length - 1, 0);
  const b = cnt(L.BULL), s = cnt(L.BEAR);
  return {sent: b > s ? 'Bullish' : s > b ? 'Bearish' : 'Neutral', cat: (L.CATS.find(([, keys]) => keys.some(k => t.includes(k))) || ['markets'])[0],
    assets: L.ASSETS.filter(([, keys]) => keys.some(k => t.includes(k))).map(([a]) => a), imp: L.IMPORTANT.some(k => t.includes(k))};
}
function item(src, kind, title, url, ts, body = '') {
  const c = classify(title + ' ' + body), low = (title + ' ' + body).toLowerCase();
  const lang = /[іїєґ]/.test(low) ? 'uk' : /[а-яё]/.test(low) ? 'ru' : 'en';
  return {id: hash(url || title), src, kind, title: title.slice(0, 300), body: body.slice(0, 400), url, ts: new Date(ts).toISOString().replace('.000Z', 'Z'), sent: c.sent, cat: c.cat, assets: c.assets, imp: c.imp, lang};
}

// ---------- джерела ----------
async function rss(name, url) {
  let x = await get(url);
  if (!/<rss|<feed|<\?xml/i.test(x.slice(0, 600))) { const m = x.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i), h = m && m[0].match(/href=["']([^"']+)/i); if (!h) throw new Error('no feed'); x = await get(new URL(unesc(h[1]), url).href); }
  const out = [], blocks = x.split(/<item[\s>]|<entry[\s>]/i).slice(1, 16);
  for (const b of blocks) {
    const tag = (n) => { const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1] : ''; };
    const title = clean(tag('title')); let link = clean(tag('link')); if (!link) { const m = b.match(/<link[^>]+href=["']([^"']+)/i); link = m ? m[1] : ''; }
    const d = Date.parse(clean(tag('pubDate')) || clean(tag('updated')) || clean(tag('published')) || clean(tag('dc:date')));
    const desc = clean(tag('description') || tag('summary')).slice(0, 300);
    if (title && d && !isAd(title, desc)) out.push(item(name, 'news', title, link.trim(), d, desc));
  }
  return out;
}
async function telegram(ch) {
  const page = await get('https://t.me/s/' + ch), out = [];
  for (const block of page.split('tgme_widget_message_wrap').slice(1)) {
    const post = block.match(/data-post="([^"]+)"/), time = block.match(/<time[^>]+datetime="([^"]+)"/), text = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!post || !time || !text) continue;
    const t = clean(text[1]); if (t.length < 12 || AD_LINK.test(text[1])) continue;
    const lines = t.split('\n').map(s => s.trim()).filter(Boolean), title = lines[0].slice(0, 220), body = lines.slice(1).join(' ').slice(0, 400);
    if (isAd(title, body)) continue;
    out.push(item('Telegram · ' + ch, 'telegram', title, 'https://t.me/' + post[1], Date.parse(time[1]), body));
  }
  return out.slice(-12);
}
const PREFIX = /^((?:[\W_]*\s*)?)(JUST IN|BREAKING|ТЕРМІНОВО|СРОЧНО)\s*:\s*/i;
// заголовок і текст перекладаються одним запитом (економія лімітів), розділювач — порожній рядок
async function translate(title, body, tl) {
  const m = (title || '').match(PREFIX), t0 = m ? title.slice(m[0].length) : title;
  const q = body ? t0 + '\n\n' + body.slice(0, 400) : t0;
  const j = await getJ(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(q.slice(0, 1800))}`, 6000);
  const out = j[0].map(s => s && s[0]).filter(Boolean).join('');
  let parts = body ? out.split(/\n\s*\n/) : [out];
  if (body && parts.length < 2) parts = [out, ''];
  const tt = parts[0].trim(), bb = parts.slice(1).join(' ').trim();
  return {title: m ? `${m[1]}${tl === 'uk' ? 'ЩОЙНО' : 'JUST IN'}: ${tt}` : tt, body: bb};
}
async function calendar() {
  const rows = [];
  for (const w of ['thisweek', 'nextweek']) { try { rows.push(...await getJ(`https://nfs.faireconomy.media/ff_calendar_${w}.json`, 9000)); } catch (e) { if (w === 'thisweek') throw e; } }
  return rows.filter(r => ['High', 'Medium'].includes(r.impact) && ['USD', 'EUR', 'CNY', 'GBP', 'JPY'].includes(r.country))
    .map(r => ({ts: r.date, title: r.title, country: r.country, impact: r.impact, forecast: r.forecast || '', previous: r.previous || '', actual: r.actual || ''}));
}
async function perps() {
  const [meta, ctxs] = await getJ('https://api.hyperliquid.xyz/info', 9000, {method: 'POST', headers: {'Content-Type': 'application/json', 'User-Agent': UA}, body: JSON.stringify({type: 'metaAndAssetCtxs'})});
  const out = {};
  meta.universe.forEach((u, i) => { if (COINS.includes(u.name)) { const c = ctxs[i], mark = +c.markPx || 0; out[u.name] = {funding_h: +c.funding || 0, oi_usd: (+c.openInterest || 0) * mark, mark, prev: +c.prevDayPx || 0, vol_usd: +c.dayNtlVlm || 0}; } });
  return out;
}
async function cdcTicker(inst) { const j = await getJ('https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=' + encodeURIComponent(inst), 7000); const d = j.result && j.result.data && j.result.data[0]; return d ? {last: +d.a, chg: +d.c * 100} : null; }

// ---------- база ----------
let dbReady = false;
async function initDb(db) {
  if (dbReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, device TEXT, v TEXT, kind TEXT, msg TEXT, src TEXT, ua TEXT, lang TEXT, extra TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS logs_ts ON logs(ts)'),
    db.prepare('CREATE TABLE IF NOT EXISTS news (id TEXT PRIMARY KEY, norm TEXT, ts TEXT, ins INTEGER, imp INTEGER, tr INTEGER DEFAULT 0, notified INTEGER DEFAULT 0, j TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS news_ts ON news(ts)'),
    db.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, prefs TEXT, created TEXT, last_ok TEXT, fails INTEGER DEFAULT 0)')
  ]);
  dbReady = true;
}
async function metaGet(db, keys) {
  const r = await db.prepare(`SELECT k, v FROM meta WHERE k IN (${keys.map(() => '?').join(',')})`).bind(...keys).all();
  const o = {}; for (const row of r.results) { try { o[row.k] = JSON.parse(row.v); } catch {} } return o;
}
const metaSet = (db, k, v) => db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v));
// кілька ключів — один SQL-запит (ліміт запитів до D1 на безкоштовному плані)
const metaMany = (db, obj) => db.prepare("INSERT INTO meta (k, v) SELECT json_extract(value, '$.k'), json_extract(value, '$.v') FROM json_each(?) WHERE true ON CONFLICT(k) DO UPDATE SET v = excluded.v")
  .bind(JSON.stringify(Object.entries(obj).map(([k, v]) => ({k, v: JSON.stringify(v)}))));
const idsIn = (ids) => JSON.stringify(ids);
let vapidMem = null;
async function vapidOf(env) {
  if (vapidMem) return vapidMem;
  let m = await metaGet(env.DB, ['vapid']);
  if (!m.vapid) { await env.DB.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').bind('vapid', JSON.stringify(await makeVapid())).run(); m = await metaGet(env.DB, ['vapid']); }
  return (vapidMem = m.vapid);
}

// ---------- збір щохвилини ----------
async function collect(env, now) {
  const db = env.DB, minute = Math.floor(now / 60e3);
  const M = await metaGet(db, ['sources', 'cal', 'perps', 'fng', 'daily', 'tick', 'brief_at']);
  const writes = [], errors = [], meta = {}, rows = [];
  // власні джерела з репозиторію — раз на 10 хв
  let cfg = M.sources && M.sources.cfg || {};
  if (!M.sources || (now - M.sources.at > 10 * 60e3 && minute % 10 === 5)) { try { cfg = JSON.parse(await get(GH_SOURCES + '?t=' + minute, 6000)); } catch {} meta.sources = {at: now, cfg}; }
  const off = new Set(cfg.disabled || []);
  const rssList = [...L.RSS.filter(([n]) => !off.has(n)), ...(cfg.rss || []).filter(r => r.url && !off.has(r.name || r.url)).map(r => [r.name || r.url, r.url])];
  const tgList = [...new Set([...L.TELEGRAM, ...(cfg.telegram || []).map(c => c.replace(/^@/, ''))])].filter(c => !off.has(c));
  // Telegram-канали — щохвилини (там найшвидші новини), RSS — по третині щохвилини (кожне джерело раз на 3 хв)
  const rot = minute % 3, rssNow = rssList.filter((_, i) => i % 3 === rot);
  const jobs = [...rssNow.map(([n, u]) => rss(n, u).catch(e => { errors.push(n + ': ' + e.message); return []; })), ...tgList.map(c => telegram(c).catch(e => { errors.push('tg ' + c + ': ' + e.message); return []; }))];
  const pPerps = perps().catch(e => { errors.push('perps: ' + e.message); return null; });
  const pCal = !M.cal || (now - M.cal.at > 14 * 60e3 && minute % 15 === 1) ? calendar().catch(e => { errors.push('calendar: ' + e.message); return null; }) : null;
  const hourly = !M.fng || (now - M.fng.at > 55 * 60e3 && minute % 60 === 3);
  const pFng = hourly ? getJ('https://api.alternative.me/fng/?limit=60', 8000).then(j => (j.data || []).map(d => ({v: +d.value, t: +d.timestamp * 1000})).reverse()).catch(() => null) : null;
  const pDaily = hourly ? getJ('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=60', 8000).then(k => k.map(x => +x[4])).catch(() => null) : null;
  const pTick = !M.tick || (now - M.tick.at > 14 * 60e3 && minute % 15 === 7) ? Promise.all(['SPYUSD-PERP', 'QQQUSD-PERP', 'XAUUSD-PERP', 'XAGUSD-PERP'].map(i => cdcTicker(i).catch(() => null))) : null;
  const fresh = (await Promise.all(jobs)).flat();
  const [pp, cal, fng, daily, tick] = await Promise.all([pPerps, pCal, pFng, pDaily, pTick]);
  if (pp) meta.perps = {at: now, d: pp};
  if (cal) meta.cal = {at: now, d: cal};
  if (fng) meta.fng = {at: now, d: fng};
  if (daily) meta.daily = {at: now, d: {BTC: daily}};
  if (tick) meta.tick = {at: now, d: {SPY: tick[0], QQQ: tick[1], XAU: tick[2], XAG: tick[3]}};
  // нові новини
  const cutoff = new Date(now - KEEP_MS).toISOString();
  const known = await db.prepare('SELECT id, norm FROM news WHERE ts >= ?').bind(cutoff).all();
  const seen = new Set(); for (const r of known.results) { seen.add(r.id); seen.add(r.norm); }
  const first = known.results.length === 0;
  let added = 0;
  for (const it of fresh) {
    const n = normT(it.title), ts = Date.parse(it.ts);
    if (seen.has(it.id) || seen.has(n) || ts < now - KEEP_MS || ts > now + 6e5) continue;
    seen.add(it.id); seen.add(n); added++;
    // старі (понад 3 год) або перший запуск — без сповіщень
    rows.push({id: it.id, norm: n, ts: it.ts, ins: now, imp: it.imp ? 1 : 0, tr: 0, notified: first || ts < now - 3 * 3600e3 ? 1 : 0, j: JSON.stringify(it)});
  }
  if (first) await seedFromGitHub(rows, seen, now);
  if (rows.length) writes.push(insertNews(db, rows));
  if (minute % 10 === 0) writes.push(db.prepare('DELETE FROM news WHERE ts < ?').bind(cutoff));
  meta.errors = {at: now, d: errors, added};
  writes.push(metaMany(db, meta));
  await db.batch(writes);
  return {pp: pp || (M.perps && M.perps.d) || {}, cal: cal || (M.cal && M.cal.d) || [], fng: fng || (M.fng && M.fng.d) || [], daily: daily ? {BTC: daily} : (M.daily && M.daily.d) || {}, tick: tick ? {SPY: tick[0], QQQ: tick[1], XAU: tick[2], XAG: tick[3]} : (M.tick && M.tick.d) || {}, briefAt: M.brief_at || 0, added, errors};
}
// усі нові новини — одним SQL-запитом
const insertNews = (db, rows) => db.prepare("INSERT OR IGNORE INTO news (id, norm, ts, ins, imp, tr, notified, j) SELECT json_extract(value, '$.id'), json_extract(value, '$.norm'), json_extract(value, '$.ts'), json_extract(value, '$.ins'), json_extract(value, '$.imp'), json_extract(value, '$.tr'), json_extract(value, '$.notified'), json_extract(value, '$.j') FROM json_each(?)").bind(JSON.stringify(rows));
// перший запуск: підхопити новини, які вже зібрав старий збирач (без сповіщень)
async function seedFromGitHub(rows, seen, now) {
  try {
    const base = await getJ(GH_LIVE, 9000);
    for (const it of base.items || []) { const n = normT(it.title); if (seen.has(it.id) || seen.has(n) || Date.parse(it.ts) < now - KEEP_MS) continue; seen.add(it.id); seen.add(n);
      rows.push({id: it.id, norm: n, ts: it.ts, ins: now, imp: it.imp ? 1 : 0, tr: it.t && Object.keys(it.t).length ? 1 : 0, notified: 1, j: JSON.stringify(it)}); }
  } catch {}
}
// переклад найсвіжіших неперекладених (ліміт запитів на хвилину)
async function translateSome(db) {
  const rows = (await db.prepare('SELECT id, j FROM news WHERE tr = 0 ORDER BY imp DESC, ts DESC LIMIT 6').all()).results;
  const ups = [];
  await Promise.all(rows.map(async r => {
    const it = JSON.parse(r.j); it.t = it.t || {};
    const targets = {en: ['uk'], uk: ['en'], ru: ['uk', 'en']}[it.lang] || ['uk', 'en'];
    let ok = true;
    for (const tl of targets) { if (it.t[tl]) continue; try { it.t[tl] = await translate(it.title, it.body, tl); } catch { ok = false; } }
    ups.push({id: r.id, tr: ok ? 1 : 0, j: JSON.stringify(it)});
  }));
  if (ups.length) await db.prepare("UPDATE news SET tr = json_extract(u.value, '$.tr'), j = json_extract(u.value, '$.j') FROM (SELECT value FROM json_each(?)) AS u WHERE news.id = json_extract(u.value, '$.id')").bind(JSON.stringify(ups)).run();
  return ups.length;
}

// ---------- сповіщення: push і Telegram ----------
const ICON = {Bullish: '🟢', Bearish: '🔴'};
const txtOf = (it, lang) => it.lang === lang || !(it.t && it.t[lang]) ? it : Object.assign({}, it, it.t[lang]);
function money(v) { const d = v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 3 : 5; return '$' + v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}).replace(/,/g, ' '); }
const TXT = {
  uk: {move: (k, ch, p) => `${k} ${ch > 0 ? '+' : ''}${ch.toFixed(1)}% за добу — ${money(p)}`, moveT: (up) => up ? '📈 Сильний рух угору' : '📉 Сильний рух униз', ev: (m) => `🗓 Через ~${m} хв`, alertT: '🔔 Цінове сповіщення', above: 'вище', below: 'нижче', more: (n) => `і ще ${n} важливих новин`},
  en: {move: (k, ch, p) => `${k} ${ch > 0 ? '+' : ''}${ch.toFixed(1)}% in 24h — ${money(p)}`, moveT: (up) => up ? '📈 Strong move up' : '📉 Strong move down', ev: (m) => `🗓 In ~${m} min`, alertT: '🔔 Price alert', above: 'above', below: 'below', more: (n) => `and ${n} more important stories`}
};
async function notifyAll(env, ctx, now) {
  const db = env.DB;
  const pending = (await db.prepare('SELECT id, j FROM news WHERE notified = 0 AND (tr = 1 OR ins < ?) ORDER BY ts LIMIT 30').bind(now - 120e3).all()).results.map(r => JSON.parse(r.j));
  const subs = (await db.prepare('SELECT * FROM subs WHERE fails < 5').all()).results.map(s => Object.assign(s, {prefs: JSON.parse(s.prefs || '{}')}));
  const M = await metaGet(db, ['tg', 'moves', 'evs']);
  const tg = M.tg || {}, moves = M.moves || {}, evs = M.evs || [];
  const P = ctx.pp, day = new Date(now).toISOString().slice(0, 10);
  // події: сильні рухи ±5% за добу, нагадування за 45 хв до важливих подій США
  const moveEv = [];
  for (const k of ['BTC', 'ETH', 'SOL', 'HYPE']) { const x = P[k]; if (!x || !x.prev) continue; const ch = (x.mark / x.prev - 1) * 100, key = `${k}:${day}:${ch > 0 ? 'u' : 'd'}`; if (Math.abs(ch) >= 5 && !moves[key]) { moves[key] = 1; moveEv.push({k, ch, p: x.mark}); } }
  for (const k in moves) if (!k.includes(day)) delete moves[k];
  const evEv = [];
  for (const e of ctx.cal) { if (e.impact !== 'High' || e.country !== 'USD') continue; const mins = (Date.parse(e.ts) - now) / 60e3, key = e.ts + e.title; if (mins > 0 && mins <= 45 && !evs.includes(key)) { evs.push(key); evEv.push({e, mins: Math.round(mins)}); } }
  // ціни для персональних цінових сповіщень
  const want = new Set(); for (const s of subs) for (const a of (s.prefs.alerts || [])) if (!a.done) want.add(a.id);
  const prices = {};
  for (const id of want) { const tk = id.replace(/_USD$/, ''); if (P[tk] && /_USD$/.test(id)) prices[id] = P[tk].mark; }
  const rest = [...want].filter(id => prices[id] == null).slice(0, 4);
  await Promise.all(rest.map(async id => { try { const t = await cdcTicker(id); if (t) prices[id] = t.last; } catch {} }));

  const vapid = subs.length ? await vapidOf(env) : null, writes = [], dead = new Set(), okS = new Set(), badS = new Set(), prefsUp = [];
  let budget = 15; // push-запитів за хвилину
  const sendTo = async (s, data) => { if (budget-- <= 0) return; try { const st = await sendPush({endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth}, data, vapid, APP); if (st === 404 || st === 410) dead.add(s.id); else if (st >= 400) badS.add(s.id); else okS.add(s.id); } catch { badS.add(s.id); } };
  const jobs = [];
  for (const s of subs) {
    const pr = s.prefs, lang = pr.lang === 'en' ? 'en' : 'uk', X = TXT[lang], msgs = [];
    if (pr.mode !== 'off') {
      const mine = pending.filter(i => pr.mode === 'all' || i.imp), show = mine.slice(-3);
      show.forEach((i, n) => { const x = txtOf(i, lang); msgs.push({title: (i.imp ? '⚡ ' : '') + (ICON[i.sent] || '⚪️') + ' ' + i.src, body: x.title + (n === show.length - 1 && mine.length > 3 ? '\n' + X.more(mine.length - 3) : ''), url: APP + '?n=' + i.id, tag: 'n' + i.id, urgent: i.imp}); });
    }
    if (pr.prices !== false) for (const m of moveEv) msgs.push({title: X.moveT(m.ch > 0), body: X.move(m.k, m.ch, m.p), url: APP, tag: 'm' + m.k, urgent: true});
    if (pr.events !== false) for (const {e, mins} of evEv) msgs.push({title: X.ev(mins), body: `${e.title} 🇺🇸 · ${e.forecast || '—'} / ${e.previous || '—'}`, url: APP + '?go=cal', tag: 'e' + hash(e.ts + e.title)});
    let changed = false;
    for (const a of (pr.alerts || [])) { const p = prices[a.id]; if (a.done || p == null) continue; if ((a.op === '>' && p >= a.price) || (a.op === '<' && p <= a.price)) { a.done = true; a.at = now; changed = true; msgs.push({title: X.alertT, body: `${a.id.replace(/_USD$|USD-PERP$/, '')}: ${money(p)} (${a.op === '>' ? X.above : X.below} ${money(a.price)})`, url: APP, tag: 'a' + hash(a.id + a.op + a.price), urgent: true}); } }
    if (changed) prefsUp.push({id: s.id, prefs: JSON.stringify(pr)});
    for (const m of msgs.slice(0, 6)) jobs.push(sendTo(s, m));
  }
  // Telegram (власник бота)
  if (env.TELEGRAM_BOT_TOKEN && tg.chat && tg.enabled !== false) {
    const tmsg = [];
    if (tg.mode !== 'off') { const mine = pending.filter(i => tg.mode === 'all' || i.imp); for (const i of mine.slice(-6)) { const x = txtOf(i, 'uk'); tmsg.push(`${ICON[i.sent] || '⚪️'} <b>${escH(i.src)}</b>\n${escH(x.title)}\n${i.url}`); } }
    if (tg.prices !== false) for (const m of moveEv) tmsg.push(`${m.ch > 0 ? '📈' : '📉'} <b>${m.k}</b> ${TXT.uk.move(m.k, m.ch, m.p).slice(m.k.length + 1)}`);
    if (tg.events !== false) for (const {e, mins} of evEv) tmsg.push(`🗓 Через ~${mins} хв: <b>${escH(e.title)}</b> (🇺🇸)\nПрогноз: ${escH(e.forecast || '—')}, було: ${escH(e.previous || '—')}`);
    for (const m of tmsg.slice(0, 6)) jobs.push(tgApi(env, 'sendMessage', {chat_id: tg.chat, text: m, parse_mode: 'HTML', disable_web_page_preview: true}).catch(() => {}));
  }
  await Promise.all(jobs);
  if (pending.length) writes.push(db.prepare('UPDATE news SET notified = 1 WHERE id IN (SELECT value FROM json_each(?))').bind(idsIn(pending.map(i => i.id))));
  if (dead.size) writes.push(db.prepare('DELETE FROM subs WHERE id IN (SELECT value FROM json_each(?))').bind(idsIn([...dead])));
  if (badS.size) writes.push(db.prepare('UPDATE subs SET fails = fails + 1 WHERE id IN (SELECT value FROM json_each(?))').bind(idsIn([...badS].filter(x => !okS.has(x)))));
  if (okS.size) writes.push(db.prepare('UPDATE subs SET last_ok = ?, fails = 0 WHERE id IN (SELECT value FROM json_each(?))').bind(new Date(now).toISOString(), idsIn([...okS])));
  if (prefsUp.length) writes.push(db.prepare("UPDATE subs SET prefs = json_extract(u.value, '$.prefs') FROM (SELECT value FROM json_each(?)) AS u WHERE subs.id = json_extract(u.value, '$.id')").bind(JSON.stringify(prefsUp)));
  writes.push(metaMany(db, {moves, evs: evs.slice(-100)}));
  await db.batch(writes);
  return pending.length;
}

// ---------- Telegram-бот (webhook) ----------
const escH = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function tgApi(env, method, payload) { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}); return r.json(); }
const tgSecret = (env) => hash('finrad-tg:' + env.TELEGRAM_BOT_TOKEN) + hash(env.TELEGRAM_BOT_TOKEN + ':hook');
const HELP = '🤖 <b>FinRAD</b> — сповіщення про ринок.\n/on — увімкнути · /off — вимкнути\n/important — лише важливі новини · /all — усі\n/prices — рухи цін ±5% (увімк./вимк.)\n/events — нагадування про події (увімк./вимк.)\n/status — ціни зараз\n\n' + APP;
const KB = {keyboard: [[{text: '/status'}, {text: '/important'}, {text: '/all'}], [{text: '/on'}, {text: '/off'}, {text: '/prices'}, {text: '/events'}]], resize_keyboard: true};
async function tgEnsureHook(env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.WORKER_URL) return;
  const m = (await metaGet(env.DB, ['tg'])).tg || {}, sec = tgSecret(env);
  if (m.hook === sec && m.bot) return;
  const me = await tgApi(env, 'getMe', {}).catch(() => null);
  const r = await tgApi(env, 'setWebhook', {url: `${env.WORKER_URL}/tg/${sec}`, secret_token: sec, allowed_updates: ['message'], drop_pending_updates: false}).catch(() => null);
  if (r && r.ok) await metaSet(env.DB, 'tg', Object.assign(m, {hook: sec, bot: me && me.result && me.result.username, enabled: m.enabled !== false, mode: m.mode || 'imp'})).run();
}
async function tgHook(req, env, sec) {
  if (!env.TELEGRAM_BOT_TOKEN || sec !== tgSecret(env) || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== sec) return json({ok: false}, 403);
  const u = await req.json().catch(() => ({})), msg = u.message || {}, cid = msg.chat && msg.chat.id, txt = String(msg.text || '').trim().toLowerCase().split('@')[0];
  if (!cid) return json({ok: true});
  const st = (await metaGet(env.DB, ['tg'])).tg || {};
  if (st.chat == null && txt.startsWith('/start')) st.chat = cid;
  if (cid !== st.chat) { await tgApi(env, 'sendMessage', {chat_id: cid, text: 'Цей бот приватний.'}); return json({ok: true}); }
  let reply = null;
  if (txt.startsWith('/start') || txt === '/help') reply = HELP;
  else if (txt === '/on') { st.enabled = true; reply = '✅ Сповіщення увімкнено.'; }
  else if (txt === '/off') { st.enabled = false; reply = '⏸ Сповіщення вимкнено. Увімкнути: /on'; }
  else if (txt === '/important') { st.mode = 'imp'; reply = '⚡ Надсилатиму лише важливі новини.'; }
  else if (txt === '/all') { st.mode = 'all'; reply = '📰 Надсилатиму всі новини (може бути багато).'; }
  else if (txt === '/prices') { st.prices = st.prices === false; reply = '📈 Рухи цін: ' + (st.prices ? 'увімкнено' : 'вимкнено'); }
  else if (txt === '/events') { st.events = st.events === false; reply = '🗓 Нагадування про події: ' + (st.events ? 'увімкнено' : 'вимкнено'); }
  else if (txt === '/status') { const p = ((await metaGet(env.DB, ['perps'])).perps || {}).d || {}; reply = '📊 <b>Ціни зараз</b>\n' + COINS.filter(k => p[k] && p[k].prev).map(k => { const ch = (p[k].mark / p[k].prev - 1) * 100; return `${ch >= 0 ? '🟢' : '🔴'} ${k}: ${money(p[k].mark)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)`; }).join('\n') + '\n\n' + APP; }
  await metaSet(env.DB, 'tg', st).run();
  if (reply) await tgApi(env, 'sendMessage', {chat_id: cid, text: reply, parse_mode: 'HTML', reply_markup: KB, disable_web_page_preview: true});
  return json({ok: true});
}

// ---------- бриф ----------
async function maybeBrief(env, ctx, now) {
  if (now - ctx.briefAt < 30 * 60e3) return;
  const items = (await env.DB.prepare('SELECT j FROM news ORDER BY ts DESC LIMIT 150').all()).results.map(r => JSON.parse(r.j));
  const inp = {perps: ctx.pp, fng: ctx.fng, items, cal: ctx.cal, daily: ctx.daily, tick: ctx.tick};
  await metaMany(env.DB, {brief_uk: buildBrief(inp, 'uk'), brief_en: buildBrief(inp, 'en'), brief_at: now}).run();
}

// ---------- відповіді програмі ----------
// знімок для програми будує cron раз на хвилину; запит програми читає один рядок
async function buildLiveSnap(db) {
  const [rows, M] = await Promise.all([db.prepare('SELECT j FROM news ORDER BY ts DESC LIMIT ?').bind(MAX_ITEMS).all(), metaGet(db, ['cal', 'perps', 'errors', 'sources'])]);
  const cfg = (M.sources && M.sources.cfg) || {}, off = new Set(cfg.disabled || []);
  const body = '{"updated":' + JSON.stringify(new Date((M.errors && M.errors.at) || Date.now()).toISOString()) + ',"items":[' + rows.results.map(r => r.j).join(',') + '],' +
    JSON.stringify({errors: (M.errors && M.errors.d) || [],
      sources: {rss: [...L.RSS.map(([n]) => n), ...(cfg.rss || []).map(r => r.name || r.url)].filter(n => !off.has(n)), telegram: [...new Set([...L.TELEGRAM, ...(cfg.telegram || []).map(c => c.replace(/^@/, ''))])].filter(n => !off.has(n))},
      calendar: (M.cal && M.cal.d) || [], cal_at: M.cal ? new Date(M.cal.at).toISOString() : null, perps: (M.perps && M.perps.d) || {}, edge: true, v: VERSION}).slice(1);
  await db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('live', body).run();
}
let liveMem = null;
async function liveGet(env) {
  if (liveMem && Date.now() - liveMem.at < 15e3) return liveMem.body;
  let r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'live'").first();
  if (!r) { await buildLiveSnap(env.DB); r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'live'").first(); }
  if (!r || r.v.includes('"items":[],')) { try { return await get(GH_LIVE, 9000); } catch { return r ? r.v : '{"items":[]}'; } }
  liveMem = {at: Date.now(), body: r.v}; return r.v;
}
async function subUpsert(req, env) {
  const b = await req.json().catch(() => null), s = b && b.sub;
  if (!s || !/^https:\/\//.test(s.endpoint || '') || !s.keys || !s.keys.p256dh || !s.keys.auth) return json({ok: false, error: 'bad subscription'}, 400);
  const prefs = sanitizePrefs(b.prefs), id = hash(s.endpoint) + hash(s.keys.auth);
  await env.DB.prepare('INSERT INTO subs (id, endpoint, p256dh, auth, prefs, created, fails) VALUES (?, ?, ?, ?, ?, ?, 0) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs, fails = 0')
    .bind(id, s.endpoint, s.keys.p256dh, s.keys.auth, JSON.stringify(prefs), new Date().toISOString()).run();
  return json({ok: true, id});
}
function sanitizePrefs(p) {
  p = p || {};
  return {mode: ['imp', 'all', 'off'].includes(p.mode) ? p.mode : 'imp', prices: p.prices !== false, events: p.events !== false, lang: p.lang === 'en' ? 'en' : 'uk',
    alerts: (Array.isArray(p.alerts) ? p.alerts : []).slice(0, 30).map(a => ({id: String(a.id || '').slice(0, 30), op: a.op === '<' ? '<' : '>', price: +a.price || 0, done: !!a.done, at: a.at || null})).filter(a => a.id && a.price > 0)};
}
async function subByEndpoint(env, ep) { return env.DB.prepare('SELECT * FROM subs WHERE endpoint = ?').bind(ep || '').first(); }

async function runCycle(env, ctx) {
  const now = Date.now();
    const c = await collect(env, now);
    await translateSome(env.DB).catch(e => console.error('translate', e.message));
    await notifyAll(env, c, now).catch(e => console.error('notify', e.message));
    await buildLiveSnap(env.DB).catch(e => console.error('snap', e.message));
    await maybeBrief(env, c, now).catch(e => console.error('brief', e.message));
    ctx.waitUntil(tgEnsureHook(env).catch(() => {}));
}
// Самозапуск: якщо cron ще не працював (після першого розгортання розклад вмикається до 15 хв) — зібрати з запиту програми.
let bootAt = 0;
async function bootIfIdle(env, ctx) {
  if (Date.now() - bootAt < 50e3) return; bootAt = Date.now();
  const m = await metaGet(env.DB, ['errors', 'boot']);
  if ((m.errors && Date.now() - m.errors.at < 3 * 60e3) || (m.boot && Date.now() - m.boot < 50e3)) return;
  await metaSet(env.DB, 'boot', Date.now()).run();
  ctx.waitUntil(runCycle(env, ctx).catch(e => console.error('boot', e.message)));
}

export default {
  async scheduled(ev, env, ctx) {
    await initDb(env.DB);
    await runCycle(env, ctx);
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
    try {
      await initDb(env.DB);
      if (p === '/live' || p === '/health' || p === '/config') await bootIfIdle(env, ctx);
      if (p === '/live') return new Response(await liveGet(env), {headers: Object.assign({'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=15'}, CORS)});
      if (p === '/brief') { const k = url.searchParams.get('lang') === 'en' ? 'brief_en' : 'brief_uk'; const m = await metaGet(env.DB, [k]); return m[k] ? json(m[k], 200, {'Cache-Control': 'max-age=60'}) : json({error: 'not ready'}, 404); }
      if (p === '/config') { const [v, m] = await Promise.all([vapidOf(env), metaGet(env.DB, ['tg', 'errors'])]); const tg = m.tg || {};
        return json({v: VERSION, vapid: v.pub, collector: m.errors ? {at: m.errors.at, errors: m.errors.d.length} : null,
          tg: {configured: !!env.TELEGRAM_BOT_TOKEN, bot: tg.bot || null, linked: tg.chat != null, enabled: tg.enabled !== false, mode: tg.mode || 'imp', prices: tg.prices !== false, events: tg.events !== false}}); }
      if (p === '/push/subscribe' && req.method === 'POST') return await subUpsert(req, env);
      if (p === '/push/prefs' && req.method === 'POST') { const b = await req.json().catch(() => ({})); const s = await subByEndpoint(env, b.endpoint); if (!s) return json({ok: false, error: 'unknown'}, 404);
        await env.DB.prepare('UPDATE subs SET prefs = ? WHERE id = ?').bind(JSON.stringify(sanitizePrefs(b.prefs)), s.id).run(); return json({ok: true}); }
      if (p === '/push/state' && req.method === 'POST') { const b = await req.json().catch(() => ({})); const s = await subByEndpoint(env, b.endpoint); return s ? json({ok: true, prefs: JSON.parse(s.prefs || '{}'), last_ok: s.last_ok}) : json({ok: false}, 404); }
      if (p === '/push/unsubscribe' && req.method === 'POST') { const b = await req.json().catch(() => ({})); await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(b.endpoint || '').run(); return json({ok: true}); }
      if (p === '/push/test' && req.method === 'POST') { const b = await req.json().catch(() => ({})); const s = await subByEndpoint(env, b.endpoint); if (!s) return json({ok: false, error: 'unknown'}, 404);
        const lang = JSON.parse(s.prefs || '{}').lang === 'en' ? 'en' : 'uk';
        const st = await sendPush({endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth}, {title: 'FinRAD ✓', body: lang === 'en' ? 'Notifications work. You will get them even when FinRAD is closed.' : 'Сповіщення працюють. Вони приходитимуть, навіть коли FinRAD закритий.', url: APP, tag: 'test', urgent: true}, await vapidOf(env), APP);
        return json({ok: st < 300, status: st}); }
      if (p.startsWith('/tg/') && req.method === 'POST') return await tgHook(req, env, p.slice(4));
      if (p === '/log' && req.method === 'POST') return await logPost(req, env);
      if (p === '/logs') return await logsGet(url, env);
      if (p === '/health') { const m = await metaGet(env.DB, ['errors']); const n = await env.DB.prepare('SELECT COUNT(*) n FROM news').first(); const s = await env.DB.prepare('SELECT COUNT(*) n FROM subs').first();
        return json({ok: true, v: VERSION, time: new Date().toISOString(), db: true, collector: m.errors ? {at: new Date(m.errors.at).toISOString(), ageSec: Math.round((Date.now() - m.errors.at) / 1000), errors: m.errors.d, added: m.errors.added} : null, news: n.n, subs: s.n, telegram: !!env.TELEGRAM_BOT_TOKEN}); }
      return json({name: 'FinRAD worker', v: VERSION, routes: ['/live', '/brief', '/config', '/push/*', '/log', '/logs', '/health']});
    } catch (e) { return json({error: e.message}, 500); }
  }
};

// ---------- журнал і статистика ----------
async function logPost(req, env) {
  const txt = await req.text(); if (txt.length > 20000) return json({ok: false}, 413);
  let b; try { b = JSON.parse(txt); } catch { return json({ok: false}, 400); }
  const dev = String(b.device || '').slice(0, 40), v = String(b.v || '').slice(0, 12), ua = String(b.ua || '').slice(0, 160), lang = String(b.lang || '').slice(0, 8);
  const ev = (Array.isArray(b.events) ? b.events : []).slice(0, 20); if (!ev.length) return json({ok: true, n: 0});
  const stmt = env.DB.prepare('INSERT INTO logs (ts, device, v, kind, msg, src, ua, lang, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  await env.DB.batch([...ev.map(e => stmt.bind(new Date().toISOString(), dev, v, String(e.kind || 'error').slice(0, 20), String(e.msg || '').slice(0, 500), String(e.src || '').slice(0, 200), ua, lang, JSON.stringify(e.extra || {}).slice(0, 1000))),
    env.DB.prepare('DELETE FROM logs WHERE ts < ?').bind(new Date(Date.now() - 120 * 864e5).toISOString())]);
  return json({ok: true, n: ev.length});
}
async function logsGet(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return json({error: 'forbidden'}, 403);
  const since = new Date(Date.now() - (+url.searchParams.get('days') || 30) * 864e5).toISOString();
  const q = (s) => env.DB.prepare(s).bind(since).all();
  const [errors, usage, versions, features] = await Promise.all([
    q("SELECT kind, msg, src, v, COUNT(*) n, COUNT(DISTINCT device) devices, MAX(ts) last FROM logs WHERE ts >= ? AND kind != 'ping' GROUP BY kind, msg, src, v ORDER BY n DESC LIMIT 200"),
    q('SELECT substr(ts,1,10) day, COUNT(DISTINCT device) devices FROM logs WHERE ts >= ? GROUP BY day ORDER BY day'),
    q('SELECT v, COUNT(DISTINCT device) devices FROM logs WHERE ts >= ? GROUP BY v ORDER BY devices DESC'),
    q("SELECT extra FROM logs WHERE ts >= ? AND kind = 'ping' ORDER BY ts DESC LIMIT 500")]);
  return json({since, errors: errors.results, usage: usage.results, versions: versions.results, pings: features.results.map(r => { try { return JSON.parse(r.extra); } catch { return {}; } })});
}
