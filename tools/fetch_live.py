"""Збирає живі новини, Telegram-канали, економічний календар і дані ф'ючерсів у data/live.json.
Працює в GitHub Actions кожні ~10 хвилин. Лише стандартна бібліотека Python, без ключів і без ШІ."""
import json, re, os, sys, html, hashlib, time, datetime as dt
import urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'live.json')
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
    root = ET.fromstring(get(url))
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


def main():
    prev = {}
    try:
        prev = json.load(open(OUT))
    except Exception:
        pass
    items, errors = [], []
    for name, url in RSS:
        try:
            items += rss(name, url)
        except Exception as e:
            errors.append(f'{name}: {type(e).__name__}')
    for ch in TELEGRAM:
        try:
            items += telegram(ch)
            time.sleep(1)
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
    data = {'updated': NOW.isoformat().replace('+00:00', 'Z'), 'items': uniq[:150], 'errors': errors}
    try:
        data['calendar'] = calendar()
    except Exception as e:
        data['calendar'] = prev.get('calendar', []); errors.append(f'calendar: {type(e).__name__}')
    try:
        data['perps'] = perps()
    except Exception as e:
        data['perps'] = prev.get('perps', {}); errors.append(f'perps: {type(e).__name__}')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f"items={len(data['items'])} calendar={len(data['calendar'])} perps={len(data['perps'])} errors={errors}")


if __name__ == '__main__':
    main()
