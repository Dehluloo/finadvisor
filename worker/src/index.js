// FinRAD Worker: новини наживо (кожні ~30 с), журнал помилок, статистика. Cloudflare Workers + D1 (безкоштовний план).
import { L } from './lists.js';

const GH_LIVE = 'https://raw.githubusercontent.com/Dehluloo/finadvisor/live/live.json';
const GH_SOURCES = 'https://raw.githubusercontent.com/Dehluloo/finadvisor/main/data/sources.json';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 finrad-worker';
const CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'};
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), {status, headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, CORS, extra)});

// ---------- допоміжне ----------
const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
const unesc = (s) => (s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
const clean = (s) => unesc((s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t\r\f\v]+/g, ' ').trim();
async function sha1(s) { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); } return ('w' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).slice(0, 12); }
async function get(url, ms = 9000) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, {headers: {'User-Agent': UA, Accept: '*/*'}, signal: c.signal, cf: {cacheTtl: 20}}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); } finally { clearTimeout(t); } }

const AD_LINK = /t\.me\/\+|t\.me\/joinchat|bit\.ly|linktr\.ee|utm_|\/ref\/|ref=|referral|invite/i;
function isAd(title, body = '') { const t = (' ' + title + ' ' + body + ' ').toLowerCase(); if (L.AD_WORDS.some(w => t.includes(w))) return true; if (AD_LINK.test(title + ' ' + body)) return true; return (title || '').replace(/[\W\d_]+/gu, '').length < 12; }
function classify(text) {
  const t = ' ' + text.toLowerCase() + ' ', cnt = (arr) => arr.reduce((n, k) => n + t.split(k).length - 1, 0);
  const b = cnt(L.BULL), s = cnt(L.BEAR);
  return {sent: b > s ? 'Bullish' : s > b ? 'Bearish' : 'Neutral', cat: (L.CATS.find(([, keys]) => keys.some(k => t.includes(k))) || ['markets'])[0],
    assets: L.ASSETS.filter(([, keys]) => keys.some(k => t.includes(k))).map(([a]) => a), imp: L.IMPORTANT.some(k => t.includes(k))};
}
async function item(src, kind, title, url, ts, body = '') {
  const c = classify(title + ' ' + body), low = (title + ' ' + body).toLowerCase();
  const lang = /[іїєґ]/.test(low) ? 'uk' : /[а-яё]/.test(low) ? 'ru' : 'en';
  return {id: await sha1(url || title), src, kind, title: title.slice(0, 300), body: body.slice(0, 400), url, ts: new Date(ts).toISOString().replace('.000Z', 'Z'), sent: c.sent, cat: c.cat, assets: c.assets, imp: c.imp, lang};
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
    if (title && d && !isAd(title, desc)) out.push(await item(name, 'news', title, link.trim(), d, desc));
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
    out.push(await item('Telegram · ' + ch, 'telegram', title, 'https://t.me/' + post[1], Date.parse(time[1]), body));
  }
  return out.slice(-12);
}
async function translate(text, tl, cache) {
  if (!text) return '';
  const key = new Request('https://tr.cache/' + tl + '/' + await sha1(text));
  const hit = await cache.match(key); if (hit) return hit.text();
  const j = JSON.parse(await get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text.slice(0, 1500))}`, 6000));
  const out = j[0].map(s => s && s[0]).filter(Boolean).join('');
  await cache.put(key, new Response(out, {headers: {'Cache-Control': 'max-age=604800'}}));
  return out;
}

// ---------- /live ----------
async function buildLive(cache) {
  const [baseTxt, srcTxt] = await Promise.allSettled([get(GH_LIVE), get(GH_SOURCES)]);
  const base = baseTxt.status === 'fulfilled' ? JSON.parse(baseTxt.value) : {items: []};
  let cfg = {}; try { cfg = srcTxt.status === 'fulfilled' ? JSON.parse(srcTxt.value) : {}; } catch {}
  const off = new Set(cfg.disabled || []);
  const rssList = [...L.RSS.filter(([n]) => !off.has(n)), ...(cfg.rss || []).filter(r => r.url && !off.has(r.name || r.url)).map(r => [r.name || r.url, r.url])];
  const tgList = [...new Set([...L.TELEGRAM, ...(cfg.telegram || []).map(c => c.replace(/^@/, ''))])].filter(c => !off.has(c));
  const errors = [], jobs = [...rssList.map(([n, u]) => rss(n, u).catch(e => { errors.push(n + ': ' + e.message); return []; })), ...tgList.map(c => telegram(c).catch(e => { errors.push('tg ' + c + ': ' + e.message); return []; }))];
  const fresh = (await Promise.all(jobs)).flat();
  const normT = (s) => s.toLowerCase().replace(/\W+/g, '').slice(0, 80);
  const oldT = Object.fromEntries((base.items || []).filter(i => i.t).map(i => [normT(i.title), i.t]));
  const seen = new Set(), items = [], cutoff = Date.now() - 48 * 3600e3;
  for (const it of [...fresh, ...(base.items || [])]) {
    const norm = it.title.toLowerCase().replace(/\W+/g, '').slice(0, 80);
    if (seen.has(it.id) || seen.has(norm) || Date.parse(it.ts) < cutoff || Date.parse(it.ts) > Date.now() + 6e5 || isAd(it.title, it.body)) continue;
    seen.add(it.id); seen.add(norm); if (!it.t && oldT[norm]) it.t = oldT[norm]; items.push(it);
  }
  items.sort((a, b) => b.ts < a.ts ? -1 : 1);
  const top = items.slice(0, 150);
  let budget = 14;
  for (const it of top.slice(0, 40)) {
    it.t = it.t || {}; const targets = {en: ['uk'], uk: ['en'], ru: ['uk', 'en']}[it.lang] || ['uk', 'en'];
    for (const tl of targets) { if (it.t[tl] || budget <= 0) continue; budget--; try { it.t[tl] = {title: await translate(it.title, tl, cache), body: it.body ? await translate(it.body.slice(0, 400), tl, cache) : ''}; } catch {} }
  }
  return Object.assign({}, base, {updated: new Date().toISOString(), items: top, errors, edge: true});
}

// ---------- журнал і статистика ----------
async function initDb(db) {
  await db.exec("CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, device TEXT, v TEXT, kind TEXT, msg TEXT, src TEXT, ua TEXT, lang TEXT, extra TEXT)");
  await db.exec("CREATE INDEX IF NOT EXISTS logs_ts ON logs(ts)");
}
async function logPost(req, env) {
  if (!env.DB) return json({ok: false, reason: 'no db'}, 503);
  const txt = await req.text(); if (txt.length > 20000) return json({ok: false}, 413);
  let b; try { b = JSON.parse(txt); } catch { return json({ok: false}, 400); }
  const dev = String(b.device || '').slice(0, 40), v = String(b.v || '').slice(0, 12), ua = String(b.ua || '').slice(0, 160), lang = String(b.lang || '').slice(0, 8);
  const ev = (Array.isArray(b.events) ? b.events : []).slice(0, 20);
  await initDb(env.DB);
  const stmt = env.DB.prepare('INSERT INTO logs (ts, device, v, kind, msg, src, ua, lang, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  await env.DB.batch(ev.map(e => stmt.bind(new Date().toISOString(), dev, v, String(e.kind || 'error').slice(0, 20), String(e.msg || '').slice(0, 500), String(e.src || '').slice(0, 200), ua, lang, JSON.stringify(e.extra || {}).slice(0, 1000))));
  await env.DB.prepare("DELETE FROM logs WHERE ts < ?").bind(new Date(Date.now() - 120 * 864e5).toISOString()).run();
  return json({ok: true, n: ev.length});
}
async function logsGet(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return json({error: 'forbidden'}, 403);
  await initDb(env.DB);
  const since = new Date(Date.now() - (+url.searchParams.get('days') || 30) * 864e5).toISOString();
  const errors = await env.DB.prepare("SELECT kind, msg, src, v, COUNT(*) n, COUNT(DISTINCT device) devices, MAX(ts) last FROM logs WHERE ts >= ? AND kind != 'ping' GROUP BY kind, msg, src, v ORDER BY n DESC LIMIT 200").bind(since).all();
  const usage = await env.DB.prepare("SELECT substr(ts,1,10) day, COUNT(DISTINCT device) devices FROM logs WHERE ts >= ? GROUP BY day ORDER BY day").bind(since).all();
  const versions = await env.DB.prepare("SELECT v, COUNT(DISTINCT device) devices FROM logs WHERE ts >= ? GROUP BY v ORDER BY devices DESC").bind(since).all();
  const features = await env.DB.prepare("SELECT extra FROM logs WHERE ts >= ? AND kind = 'ping' ORDER BY ts DESC LIMIT 500").bind(since).all();
  return json({since, errors: errors.results, usage: usage.results, versions: versions.results, pings: features.results.map(r => { try { return JSON.parse(r.extra); } catch { return {}; } })});
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
    try {
      if (url.pathname === '/live') {
        const cache = caches.default, key = new Request(url.origin + '/live-cache');
        const hit = await cache.match(key);
        if (hit) return new Response(hit.body, {headers: Object.assign({'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT'}, CORS)});
        const data = await buildLive(cache), body = JSON.stringify(data);
        ctx.waitUntil(cache.put(key, new Response(body, {headers: {'Cache-Control': 'max-age=30', 'Content-Type': 'application/json'}})));
        return new Response(body, {headers: Object.assign({'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'MISS'}, CORS)});
      }
      if (url.pathname === '/log' && req.method === 'POST') return await logPost(req, env);
      if (url.pathname === '/logs') return await logsGet(url, env);
      if (url.pathname === '/health') return json({ok: true, time: new Date().toISOString(), db: !!env.DB});
      return json({name: 'FinRAD worker', routes: ['/live', '/log', '/logs', '/health']});
    } catch (e) { return json({error: e.message}, 500); }
  }
};
