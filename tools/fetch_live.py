"""Збирає живі новини, Telegram-канали, економічний календар і дані ф'ючерсів у data/live.json.
Працює в GitHub Actions кожні ~10 хвилин. Лише стандартна бібліотека Python, без ключів і без ШІ."""
import json, re, os, sys, html, hashlib, time, datetime as dt
import urllib.request, urllib.parse, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LIVE_DIR = os.environ.get('LIVE_DIR') or os.path.join(ROOT, 'data')
OUT = os.path.join(LIVE_DIR, 'live.json')
MAIN_DATA = os.path.join(ROOT, 'data')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 finadvisor'
NOW = dt.datetime.now(dt.timezone.utc)
KEEP_H = 48

RSS = [
    ('CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'),
    ('Cointelegraph', 'https://cointelegraph.com/rss'),
    ('Decrypt', 'https://decrypt.co/feed'),
    ('The Block', 'https://www.theblock.co/rss.xml'),
    ('CNBC', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114'),
    ('CNBC Economy', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258'),
    ('CNBC Finance', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664'),
    ('MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse'),
    ('Federal Reserve', 'https://www.federalreserve.gov/feeds/press_all.xml'),
]
TELEGRAM = ['WatcherGuru', 'cryptocurrency_media', 'Capitalizator_UA', 'tstamarkets_ua', 'trade_ultra']


def load_sources():
    rss, tg = list(RSS), list(TELEGRAM)
    try:
        cfg = json.load(open(os.path.join(MAIN_DATA, 'sources.json')))
    except Exception:
        cfg = {}
    off = set(cfg.get('disabled', []))
    rss = [(n, u) for n, u in rss if n not in off] + [(x.get('name') or x['url'], x['url']) for x in cfg.get('rss', []) if x.get('url') and (x.get('name') or x['url']) not in off]
    tg = [c for c in tg if c not in off] + [c.lstrip('@') for c in cfg.get('telegram', []) if c and c.lstrip('@') not in off]
    return rss, list(dict.fromkeys(tg))

BULL = ['surge', 'soar', 'rally', 'jump', ' gains', ' gain ', 'rises', 'rose', 'climb', 'record high', 'all-time high', 'ath', 'approve', 'approval',
        'inflow', 'adopt', 'bullish', 'rate cut', 'cuts rates', 'breakout', 'rebound', 'recover', 'beats', 'upgrade', 'buys',
        'зрост', 'ріст', 'рост', 'злет', 'взлет', 'ралі', 'ралли', 'приплив', 'приток', 'схвал', 'одобр', 'максимум', 'бичач', 'бычь',
        'відскок', 'отскок', 'купує', 'покупа', 'зниження ставки', 'снижение ставки', '🚀', '📈']
BEAR = ['plunge', 'crash', 'drop', 'fall', 'slump', 'tumble', 'sink', 'decline', 'outflow', 'hack', 'exploit', 'stolen', 'ban ',
        'lawsuit', 'sues', 'sell-off', 'selloff', 'liquidat', 'bearish', 'rate hike', 'hikes rates', 'tariff', 'sanction', 'war ',
        'attack', 'strike', 'recession', 'misses', 'downgrade', 'fraud', 'bankrupt', 'default', 'hotter',
        'пад', 'обвал', 'знижен', 'сниж', 'відтік', 'отток', 'злам', 'взлом', 'хак', 'заборон', 'запрет', 'позов', 'иск ',
        'ліквідац', 'ликвидац', 'ведмеж', 'медвеж', 'тариф', 'санкц', 'війн', 'войн', 'атак', 'удар', 'рецес', 'банкрут', '📉', '🔻']
IMPORTANT = ['breaking', 'just in', 'hack', 'exploit', 'stolen', 'etf approv', 'approves', 'rate decision', 'cuts rates', 'hikes rates',
             'rate cut', 'rate hike', 'emergency', 'sec sues', 'ban ', 'missile', 'invasion', 'war ', 'tariff', 'crash', 'plunge',
             'all-time high', 'record high', 'bankrupt', 'halts', 'fomc', 'cpi', 'pce', 'payrolls', 'терміново', 'срочно', 'молния',
             'взлом', 'злам', 'обвал', 'ракет', 'вторгн', '⚡', '🚨']
CATS = [
    ('crypto', ['bitcoin', 'btc', 'ether', 'eth ', 'crypto', 'solana', 'stablecoin', 'hyperliquid', 'xrp', 'blockchain', 'defi', 'token',
                'крипт', 'біткоїн', 'биткоин', 'біткоін', 'эфир', 'ефір', 'альткоїн', 'альткоин']),
    ('geo', ['war', 'iran', 'israel', 'russia', 'ukraine', 'china', 'missile', 'strike', 'military', 'gaza', 'taiwan', 'nato',
             'війн', 'войн', 'ізраїл', 'израил', 'іран', 'иран', 'китай', 'росі', 'росс', 'україн', 'украин', 'ракет']),
    ('politics', ['trump', 'congress', 'senate', 'white house', 'election', 'president', 'sec ', 'regulat', 'bill', 'law', 'tariff',
                  'трамп', 'конгрес', 'сенат', 'вибор', 'выбор', 'закон', 'регулю', 'регули']),
    ('economy', ['fed', 'inflation', 'cpi', 'pce', 'gdp', 'jobs', 'payroll', 'yield', 'treasury', ' rates', 'interest rate', 'ecb', 'powell', 'unemployment',
                 'ставк', 'інфляц', 'инфляц', 'фрс', 'ввп', 'облігац', 'облигац', 'безробіт', 'безработ']),
]
ASSETS = [('BTC', ['bitcoin', 'btc', 'біткоїн', 'биткоин', 'біткоін']), ('ETH', ['ethereum', 'ether', ' eth', 'ефір', 'эфир']),
          ('SOL', ['solana', ' sol ']), ('HYPE', ['hyperliquid', 'hype']), ('XRP', ['xrp', 'ripple']),
          ('Gold', ['gold', 'золот']), ('Oil', ['oil', 'crude', 'нафт', 'нефт', 'brent', 'wti']),
          ('Stocks', ['s&p', 'nasdaq', 'dow', 'stocks', 'wall street', 'акці', 'акци', 'nvidia', 'apple', 'tesla'])]


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def clean(s):
    s = re.sub(r'<br\s*/?>', '\n', s or '')
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    return re.sub(r'[ \t\r\f\v]+', ' ', s).strip()


def classify(text):
    t = ' ' + text.lower() + ' '
    b = sum(t.count(k) for k in BULL)
    s = sum(t.count(k) for k in BEAR)
    sent = 'Bullish' if b > s else 'Bearish' if s > b else 'Neutral'
    cat = next((c for c, keys in CATS if any(k in t for k in keys)), 'markets')
    assets = [a for a, keys in ASSETS if any(k in t for k in keys)]
    important = any(k in t for k in IMPORTANT)
    return sent, cat, assets, important


def item(source, kind, title, url, ts, body=''):
    text = (title + ' ' + body)
    sent, cat, assets, imp = classify(text)
    lang = 'uk' if re.search('[іїєґ]', text.lower()) else ('ru' if re.search('[а-яё]', text.lower()) else 'en')
    return {'id': hashlib.sha1((url or title).encode()).hexdigest()[:12], 'src': source, 'kind': kind, 'title': title[:300],
            'body': body[:400], 'url': url, 'ts': ts.isoformat().replace('+00:00', 'Z'), 'sent': sent, 'cat': cat,
            'assets': assets, 'imp': imp, 'lang': lang}


def parse_date(s):
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except Exception:
        try:
            d = dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
        except Exception:
            return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def rss(name, url):
    out = []
    raw = get(url)
    head = raw[:600].lower()
    if b'<rss' not in head and b'<feed' not in head and b'<?xml' not in head:
        page = raw.decode('utf-8', 'ignore')
        m = re.search(r'<link[^>]+type=["\']application/(?:rss|atom)\+xml["\'][^>]*>', page, re.I)
        h = m and re.search(r'href=["\']([^"\']+)', m.group(0))
        if not h:
            raise ValueError('no feed')
        url = urllib.parse.urljoin(url, html.unescape(h.group(1)))
        raw = get(url)
    root = ET.fromstring(raw)
    ns = {'a': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('.//item') or root.findall('.//a:entry', ns)
    for e in entries[:40]:
        title = clean((e.findtext('title') or e.findtext('a:title', namespaces=ns) or ''))
        link = e.findtext('link') or ''
        if not link:
            l = e.find('a:link', ns)
            link = l.get('href') if l is not None else ''
        d = parse_date(e.findtext('pubDate') or e.findtext('a:updated', namespaces=ns) or e.findtext('a:published', namespaces=ns)
                       or e.findtext('{http://purl.org/dc/elements/1.1/}date'))
        desc = clean(e.findtext('description') or e.findtext('a:summary', namespaces=ns) or '')
        if title and d:
            out.append(item(name, 'news', title, link.strip(), d, desc[:300]))
    return out


def telegram(ch):
    out = []
    page = get('https://t.me/s/' + ch).decode('utf-8', 'ignore')
    for block in page.split('tgme_widget_message_wrap')[1:]:
        m_post = re.search(r'data-post="([^"]+)"', block)
        m_time = re.search(r'<time[^>]+datetime="([^"]+)"', block)
        m_text = re.search(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', block, re.S)
        if not (m_post and m_time and m_text):
            continue
        text = clean(m_text.group(1))
        if len(text) < 12:
            continue
        lines = [x.strip() for x in text.split('\n') if x.strip()]
        title = lines[0][:220]
        body = ' '.join(lines[1:])[:400]
        d = parse_date(m_time.group(1))
        if d:
            out.append(item('Telegram · ' + ch, 'telegram', title, 'https://t.me/' + m_post.group(1), d, body))
    return out[-20:]


def calendar():
    rows = json.loads(get('https://nfs.faireconomy.media/ff_calendar_thisweek.json'))
    try:
        rows += json.loads(get('https://nfs.faireconomy.media/ff_calendar_nextweek.json'))
    except Exception:
        pass
    out = []
    for r in rows:
        if r.get('impact') not in ('High', 'Medium'):
            continue
        if r.get('country') not in ('USD', 'EUR', 'CNY', 'GBP', 'JPY'):
            continue
        out.append({'ts': r.get('date'), 'title': r.get('title'), 'country': r.get('country'), 'impact': r.get('impact'),
                    'forecast': r.get('forecast') or '', 'previous': r.get('previous') or '', 'actual': r.get('actual') or ''})
    return out


def perps():
    req = urllib.request.Request('https://api.hyperliquid.xyz/info', data=json.dumps({'type': 'metaAndAssetCtxs'}).encode(),
                                 headers={'Content-Type': 'application/json', 'User-Agent': UA})
    meta, ctxs = json.loads(urllib.request.urlopen(req, timeout=20).read())
    out = {}
    for u, c in zip(meta['universe'], ctxs):
        if u['name'] in ('BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE'):
            mark = float(c.get('markPx') or 0)
            out[u['name']] = {'funding_h': float(c.get('funding') or 0), 'oi_usd': float(c.get('openInterest') or 0) * mark,
                              'mark': mark, 'prev': float(c.get('prevDayPx') or 0), 'vol_usd': float(c.get('dayNtlVlm') or 0)}
    return out


# ---------------- переклад (безкоштовний сервіс, з кешем) ----------------
TR_CACHE = os.path.join(LIVE_DIR, 'tr_cache.json')
_tr = {}
_tr_calls = [0]
TR_LIMIT = 220


def tr(text, tl):
    text = (text or '').strip()
    if not text:
        return ''
    key = tl + ':' + hashlib.sha1(text.encode()).hexdigest()[:16]
    if key in _tr:
        return _tr[key]
    if _tr_calls[0] >= TR_LIMIT:
        return None
    _tr_calls[0] += 1
    try:
        q = urllib.parse.quote(text[:1500])
        raw = get(f'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={tl}&dt=t&q={q}', 15)
        j = json.loads(raw)
        out = ''.join(seg[0] for seg in j[0] if seg and seg[0])
        _tr[key] = out
        time.sleep(0.12)
        return out
    except Exception:
        return None


PREFIX = re.compile(r'^((?:[\W_]*\s*)?)(JUST IN|BREAKING|ТЕРМІНОВО|СРОЧНО)\s*:\s*', re.I)
PREFIX_TR = {'uk': 'ЩОЙНО', 'en': 'JUST IN'}


def tr_title(text, tl):
    m = PREFIX.match(text or '')
    if not m:
        return tr(text, tl)
    rest = tr(text[m.end():], tl)
    return None if rest is None else f"{m.group(1)}{PREFIX_TR.get(tl, m.group(2))}: {rest}"


def translate_items(items):
    for it in items:
        it.setdefault('t', {})
        targets = {'en': ['uk'], 'uk': ['en'], 'ru': ['uk', 'en']}.get(it.get('lang'), ['uk', 'en'])
        for tl in targets:
            if tl in it['t']:
                continue
            ti = tr_title(it['title'], tl)
            if ti is None:
                continue
            bo = tr(it['body'][:400], tl) if it.get('body') else ''
            it['t'][tl] = {'title': ti, 'body': bo or ''}


BRIEF_TXT = {'brief': ['summary', 'signal', 'regime', 'data_as_of'], 'posture': ['asset', 'posture', 'plain'], 'plain': ['label', 'text'],
             'news': ['title', 'why', 'assets', 'category'], 'calendar': ['event', 'why'], 'outlook': ['area', 'stance', 'text'],
             'weekly': ['label', 'text', 'week'], 'general': ['text'], 'coins': ['note'], 'fng': ['label']}


def translate_brief():
    src = os.path.join(MAIN_DATA, 'brief.json')
    dst = os.path.join(LIVE_DIR, 'brief_en.json')
    try:
        b = json.load(open(src))
    except Exception:
        return 'brief: none'
    try:
        old = json.load(open(dst))
        if old.get('_src') == hashlib.sha1(open(src, 'rb').read()).hexdigest():
            return 'brief_en: up to date'
    except Exception:
        pass
    out = {k: v for k, v in b.items() if k not in BRIEF_TXT}
    ok = True
    for k, fields in BRIEF_TXT.items():
        rows = []
        for r in b.get(k, []):
            r2 = dict(r)
            for f in fields:
                if isinstance(r.get(f), str) and r[f]:
                    v = tr(r[f], 'en')
                    if v is None:
                        ok = False
                    else:
                        r2[f] = v
            rows.append(r2)
        out[k] = rows
    if ok:
        out['_src'] = hashlib.sha1(open(src, 'rb').read()).hexdigest()
    json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
    return 'brief_en: ' + ('ok' if ok else 'partial')


def main():
    prev = {}
    try:
        prev = json.load(open(OUT))
    except Exception:
        pass
    try:
        _tr.update(json.load(open(TR_CACHE)))
    except Exception:
        pass
    items, errors = [], []
    rss_list, tg_list = load_sources()
    for name, url in rss_list:
        try:
            items += rss(name, url)
        except Exception as e:
            errors.append(f'{name}: {type(e).__name__}')
    for ch in tg_list:
        try:
            items += telegram(ch)
            time.sleep(0.5)
        except Exception as e:
            errors.append(f'tg {ch}: {type(e).__name__}')
    cutoff = NOW - dt.timedelta(hours=KEEP_H)
    seen, uniq = set(), []
    # старі пункти, яких уже немає у стрічках, лишаються до 48 год
    for it in items + prev.get('items', []):
        key = it['id']
        norm = re.sub(r'\W+', '', it['title'].lower())[:80]
        if key in seen or norm in seen:
            continue
        if parse_date(it['ts']) and parse_date(it['ts']) < cutoff:
            continue
        if parse_date(it['ts']) and parse_date(it['ts']) > NOW + dt.timedelta(minutes=10):
            continue
        seen.add(key); seen.add(norm); uniq.append(it)
    uniq.sort(key=lambda x: x['ts'], reverse=True)
    uniq = uniq[:150]
    old_t = {i['id']: i.get('t') for i in prev.get('items', []) if i.get('t')}
    for it in uniq:
        if it['id'] in old_t and not it.get('t'):
            it['t'] = old_t[it['id']]
    translate_items(uniq)
    errors.append(translate_brief())
    keep = dict(list(_tr.items())[-3000:])
    json.dump(keep, open(TR_CACHE, 'w'), ensure_ascii=False, separators=(',', ':'))
    data = {'updated': NOW.isoformat().replace('+00:00', 'Z'), 'items': uniq[:150], 'errors': errors, 'sources': {'rss': [n for n, _ in rss_list], 'telegram': tg_list}}
    try:
        ca = parse_date(prev.get('cal_at'))
        if ca and NOW - ca < dt.timedelta(minutes=15) and prev.get('calendar'):
            data['calendar'], data['cal_at'] = prev['calendar'], prev['cal_at']
        else:
            data['calendar'] = calendar(); data['cal_at'] = NOW.isoformat().replace('+00:00', 'Z')
    except Exception as e:
        data['calendar'] = prev.get('calendar', []); errors.append(f'calendar: {type(e).__name__}')
    try:
        data['perps'] = perps()
    except Exception as e:
        data['perps'] = prev.get('perps', {}); errors.append(f'perps: {type(e).__name__}')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f"items={len(data['items'])} calendar={len(data['calendar'])} perps={len(data['perps'])} errors={errors}")


# ---------------- Telegram (необов'язково) ----------------
TG_STATE = os.path.join(LIVE_DIR, 'tg.json')
HELP = ("🤖 Бот «Фінансовий радник».\n"
        "/on — увімкнути сповіщення\n/off — вимкнути\n/important — лише важливі новини\n/all — усі новини\n"
        "/prices — рухи цін ±5% (увімк./вимк.)\n/events — нагадування про події (увімк./вимк.)\n/status — ціни зараз\n"
        "Перевірка нових повідомлень — кожні ~10–20 хв.")
KB = {'keyboard': [[{'text': '/status'}, {'text': '/important'}, {'text': '/all'}], [{'text': '/on'}, {'text': '/off'}, {'text': '/prices'}, {'text': '/events'}]],
      'resize_keyboard': True}


def tg_api(token, method, payload):
    req = urllib.request.Request(f'https://api.telegram.org/bot{token}/{method}', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())


def esc_html(s):
    return html.escape(s or '', quote=False)


def tg_status_text(data):
    p = data.get('perps', {})
    lines = ['📊 <b>Ціни зараз</b> (Hyperliquid)']
    for k in ('BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE'):
        if k in p and p[k]['prev']:
            ch = (p[k]['mark'] / p[k]['prev'] - 1) * 100
            lines.append(f"{'🟢' if ch >= 0 else '🔴'} {k}: ${p[k]['mark']:,.2f} ({ch:+.2f}%)".replace(',', ' '))
    lines.append('\nhttps://dehluloo.github.io/finadvisor/')
    return '\n'.join(lines)


def telegram_bot(data):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
    st = {}
    try:
        st = json.load(open(TG_STATE))
    except Exception:
        pass
    st.setdefault('enabled', True); st.setdefault('mode', 'imp'); st.setdefault('prices', True); st.setdefault('events', True)
    st.setdefault('sent', []); st.setdefault('moves', {}); st.setdefault('evs', []); st.setdefault('offset', 0)
    if not token:
        st['configured'] = False
        json.dump(st, open(TG_STATE, 'w'), ensure_ascii=False)
        return 'tg: no token'
    st['configured'] = True
    if not st.get('bot'):
        try:
            st['bot'] = tg_api(token, 'getMe', {})['result']['username']
        except Exception:
            pass
    chat = st.get('chat')
    # команди
    try:
        ups = tg_api(token, 'getUpdates', {'offset': st['offset'] + 1, 'timeout': 0}).get('result', [])
    except Exception:
        ups = []
    for u in ups:
        st['offset'] = max(st['offset'], u['update_id'])
        m = u.get('message') or {}
        cid = (m.get('chat') or {}).get('id')
        txt = (m.get('text') or '').strip().lower().split('@')[0]
        if not cid:
            continue
        if chat is None and txt.startswith('/start'):
            chat = st['chat'] = cid
        if cid != chat:
            continue  # бот відповідає лише власнику
        reply = None
        if txt.startswith('/start') or txt == '/help':
            reply = HELP
        elif txt == '/on':
            st['enabled'] = True; reply = '✅ Сповіщення увімкнено.'
        elif txt == '/off':
            st['enabled'] = False; reply = '⏸ Сповіщення вимкнено. Увімкнути: /on'
        elif txt == '/important':
            st['mode'] = 'imp'; reply = '⚡ Надсилатиму лише важливі новини.'
        elif txt == '/all':
            st['mode'] = 'all'; reply = '📰 Надсилатиму всі новини (може бути багато).'
        elif txt == '/prices':
            st['prices'] = not st['prices']; reply = '📈 Рухи цін: ' + ('увімкнено' if st['prices'] else 'вимкнено')
        elif txt == '/events':
            st['events'] = not st['events']; reply = '🗓 Нагадування про події: ' + ('увімкнено' if st['events'] else 'вимкнено')
        elif txt == '/status':
            reply = tg_status_text(data)
        if reply:
            try:
                tg_api(token, 'sendMessage', {'chat_id': chat, 'text': reply, 'parse_mode': 'HTML', 'reply_markup': KB, 'disable_web_page_preview': True})
            except Exception:
                pass
    sent_now = 0
    if chat and st['enabled']:
        msgs = []
        sent = set(st['sent'])
        first_run = not st['sent']
        fresh = [i for i in data['items'] if i['id'] not in sent and (st['mode'] == 'all' or i['imp'])]
        fresh = [i for i in fresh if dt.datetime.fromisoformat(i['ts'].replace('Z', '+00:00')) > NOW - dt.timedelta(hours=3)]
        if not first_run:
            for i in sorted(fresh, key=lambda x: x['ts'])[-6:]:
                icon = {'Bullish': '🟢', 'Bearish': '🔴'}.get(i['sent'], '⚪️')
                msgs.append(f"{icon} <b>{esc_html(i['src'])}</b>\n{esc_html(i['title'])}\n{i['url']}")
        st['sent'] = (st['sent'] + [i['id'] for i in data['items']])[-800:]
        if st['prices']:
            day = NOW.strftime('%Y-%m-%d')
            for k, x in data.get('perps', {}).items():
                if k not in ('BTC', 'ETH', 'SOL', 'HYPE') or not x['prev']:
                    continue
                ch = (x['mark'] / x['prev'] - 1) * 100
                key = f"{k}:{day}:{'u' if ch > 0 else 'd'}"
                if abs(ch) >= 5 and key not in st['moves']:
                    st['moves'][key] = 1
                    msgs.append(f"{'📈' if ch > 0 else '📉'} <b>{k}</b> {ch:+.1f}% за добу — ${x['mark']:,.2f}".replace(',', ' '))
            st['moves'] = {k: v for k, v in st['moves'].items() if day in k}
        if st['events']:
            for e in data.get('calendar', []):
                if e.get('impact') != 'High' or e.get('country') != 'USD':
                    continue
                try:
                    t = dt.datetime.fromisoformat(e['ts'])
                except Exception:
                    continue
                key = e['ts'] + e['title']
                mins = (t - NOW).total_seconds() / 60
                if 0 < mins <= 45 and key not in st['evs']:
                    st['evs'].append(key)
                    msgs.append(f"🗓 Через ~{int(mins)} хв: <b>{esc_html(e['title'])}</b> (🇺🇸)\nПрогноз: {esc_html(e.get('forecast') or '—')}, було: {esc_html(e.get('previous') or '—')}")
            st['evs'] = st['evs'][-100:]
        for m in msgs:
            try:
                tg_api(token, 'sendMessage', {'chat_id': chat, 'text': m, 'parse_mode': 'HTML', 'disable_web_page_preview': True})
                sent_now += 1
                time.sleep(0.4)
            except Exception:
                pass
    st['last'] = NOW.isoformat().replace('+00:00', 'Z')
    public = {k: st[k] for k in st}
    json.dump(public, open(TG_STATE, 'w'), ensure_ascii=False)
    return f'tg: sent {sent_now}'


if __name__ == '__main__':
    main()
    try:
        print(telegram_bot(json.load(open(OUT))))
    except Exception as e:
        print('tg error', type(e).__name__, e)
