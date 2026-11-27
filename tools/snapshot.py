"""Знімок ринку для глибокого аналізу Claude: точні ціни, тренди, імпульс, позиціонування, календар і головні новини.
Запускається GitHub Actions (.github/workflows/snapshot.yml), результат — data/snapshot.json. Лише стандартна бібліотека Python."""
import json, math, os, time, urllib.request as U
from datetime import datetime, timezone, timedelta

OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'snapshot.json')
WORKER = 'https://finrad.paulmeizy.workers.dev'
try: WORKER = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'data', 'config.json'))).get('worker') or WORKER
except Exception: pass

ASSETS = [  # (ключ, назва, група, Crypto.com, Binance, Hyperliquid)
    ('BTC', 'Bitcoin', 'crypto', 'BTC_USD', 'BTCUSDT', 'BTC'), ('ETH', 'Ethereum', 'crypto', 'ETH_USD', 'ETHUSDT', 'ETH'),
    ('SOL', 'Solana', 'crypto', 'SOL_USD', 'SOLUSDT', 'SOL'), ('XRP', 'XRP', 'crypto', 'XRP_USD', 'XRPUSDT', 'XRP'),
    ('HYPE', 'Hyperliquid', 'crypto', 'HYPE_USD', None, 'HYPE'),
    ('SPY', 'S&P 500 ETF', 'stocks', 'SPYUSD-PERP', None, 'xyz:SPY'), ('QQQ', 'Nasdaq 100 ETF', 'stocks', 'QQQUSD-PERP', None, None),
    ('NVDA', 'Nvidia', 'stocks', 'NVDAUSD-PERP', None, 'xyz:NVDA'), ('MSTR', 'Strategy', 'stocks', 'MSTRUSD-PERP', None, None),
    ('XAU', 'Gold', 'metals', 'XAUUSD-PERP', None, 'xyz:GOLD'), ('XAG', 'Silver', 'metals', 'XAGUSD-PERP', None, 'xyz:SILVER'),
    ('XPT', 'Platinum', 'metals', 'XPTUSD-PERP', None, 'xyz:PLATINUM'), ('XPD', 'Palladium', 'metals', 'XPDUSD-PERP', None, 'xyz:PALLADIUM'),
]
errors = []

def get(url, data=None, timeout=25):
    for i in range(3):
        try:
            r = U.Request(url, data=json.dumps(data).encode() if data is not None else None, headers={'Content-Type': 'application/json', 'User-Agent': 'FinRAD-snapshot/1.0'})
            return json.load(U.urlopen(r, timeout=timeout))
        except Exception as e:
            if i == 2: raise
            time.sleep(2 + i * 3)

def daily_cdc(inst):
    j = get(f'https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name={inst}&timeframe=1D&count=300')
    rows = j['result']['data']
    return [(int(r['t']), float(r['o']), float(r['h']), float(r['l']), float(r['c'])) for r in rows]

def daily_bn(sym):
    rows = get(f'https://data-api.binance.vision/api/v3/klines?symbol={sym}&interval=1d&limit=300')
    return [(int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4])) for r in rows]

def daily_hl(coin):
    end = int(time.time() * 1000)
    rows = get('https://api.hyperliquid.xyz/info', {'type': 'candleSnapshot', 'req': {'coin': coin, 'interval': '1d', 'startTime': end - 300 * 864e5, 'endTime': end}})
    return [(int(r['t']), float(r['o']), float(r['h']), float(r['l']), float(r['c'])) for r in rows]

def sma(c, n): return sum(c[-n:]) / n if len(c) >= n else None
def rsi(c, n=14):
    if len(c) < n + 2: return None
    g = l = 0.0
    for i in range(1, n + 1):
        d = c[i] - c[i - 1]; g += max(d, 0); l += max(-d, 0)
    g /= n; l /= n
    for i in range(n + 1, len(c)):
        d = c[i] - c[i - 1]; g = (g * (n - 1) + max(d, 0)) / n; l = (l * (n - 1) + max(-d, 0)) / n
    return 100.0 if l == 0 else 100 - 100 / (1 + g / l)
def atr_pct(rows, n=14):
    if len(rows) < n + 1: return None
    tr = [max(h - l, abs(h - rows[i - 1][4]), abs(l - rows[i - 1][4])) for i, (_, o, h, l, c) in enumerate(rows) if i > 0]
    return sum(tr[-n:]) / n / rows[-1][4] * 100
def vol30(c):
    if len(c) < 31: return None
    r = [math.log(c[i] / c[i - 1]) for i in range(len(c) - 30, len(c))]
    m = sum(r) / len(r)
    return math.sqrt(sum((x - m) ** 2 for x in r) / (len(r) - 1)) * math.sqrt(365) * 100
def chg(c, k): return (c[-1] / c[-1 - k] - 1) * 100 if len(c) > k else None
def rnd(v, d=2): return None if v is None else round(v, d)

def asset_stats(key, name, grp, cdc, bn, hlc):
    rows, src = [], ''
    for s, fn, arg in (('Crypto.com', daily_cdc, cdc), ('Binance', daily_bn, bn), ('Hyperliquid', daily_hl, hlc)):
        if not arg: continue
        try:
            rows = fn(arg); src = s
            if len(rows) >= 30: break
        except Exception as e: errors.append(f'{key} {s}: {e}')
    if not rows: return None
    rows.sort(key=lambda r: r[0]); c = [r[4] for r in rows]
    s20, s50, s200 = sma(c, 20), sma(c, 50), sma(c, 200)
    last = c[-1]
    hi30, lo30 = max(r[2] for r in rows[-30:]), min(r[3] for r in rows[-30:])
    hi90, lo90 = max(r[2] for r in rows[-90:]), min(r[3] for r in rows[-90:])
    return {'key': key, 'name': name, 'group': grp, 'source': src, 'last': rnd(last, 4), 'as_of': datetime.fromtimestamp(rows[-1][0] / 1000, timezone.utc).strftime('%Y-%m-%d'),
            'chg_1d': rnd(chg(c, 1)), 'chg_7d': rnd(chg(c, 7)), 'chg_30d': rnd(chg(c, 30)), 'chg_90d': rnd(chg(c, 90)),
            'sma20': rnd(s20, 4), 'sma50': rnd(s50, 4), 'sma200': rnd(s200, 4),
            'vs_sma50_pct': rnd((last / s50 - 1) * 100 if s50 else None), 'vs_sma200_pct': rnd((last / s200 - 1) * 100 if s200 else None),
            'rsi14': rnd(rsi(c), 1), 'atr14_pct': rnd(atr_pct(rows)), 'vol30_ann_pct': rnd(vol30(c), 1),
            'high_30d': rnd(hi30, 4), 'low_30d': rnd(lo30, 4), 'high_90d': rnd(hi90, 4), 'low_90d': rnd(lo90, 4), 'days': len(rows)}

def main():
    now = datetime.now(timezone.utc)
    snap = {'generated': now.isoformat(timespec='seconds'), 'note': 'Daily candles close at 00:00 UTC; chg_1d compares the latest (possibly partial) daily close with the previous one.', 'assets': [], 'errors': errors}
    for a in ASSETS:
        st = asset_stats(*a)
        if st: snap['assets'].append(st)
    # живі ціни (Crypto.com)
    try:
        t = {x['i']: x for x in get('https://api.crypto.com/exchange/v1/public/get-tickers')['result']['data']}
        for st in snap['assets']:
            inst = next(a[3] for a in ASSETS if a[0] == st['key'])
            if inst in t: st['live'] = float(t[inst]['a']); st['live_chg_24h'] = rnd(float(t[inst].get('c') or 0) * 100)
    except Exception as e: errors.append(f'tickers: {e}')
    # позиціонування: Hyperliquid
    try:
        meta, ctx = get('https://api.hyperliquid.xyz/info', {'type': 'metaAndAssetCtxs'})
        ix = {u['name']: i for i, u in enumerate(meta['universe'])}
        snap['derivatives'] = {}
        for k in ('BTC', 'ETH', 'SOL', 'HYPE'):
            if k in ix:
                c = ctx[ix[k]]; f = float(c['funding'])
                snap['derivatives'][k] = {'mark': float(c['markPx']), 'funding_8h_pct': rnd(f * 8 * 100, 5), 'funding_ann_pct': rnd(f * 24 * 365 * 100, 1),
                                          'open_interest_usd_m': rnd(float(c['openInterest']) * float(c['markPx']) / 1e6, 1), 'premium_pct': rnd(float(c.get('premium') or 0) * 100, 4),
                                          'day_volume_usd_m': rnd(float(c.get('dayNtlVlm') or 0) / 1e6, 1)}
    except Exception as e: errors.append(f'hyperliquid: {e}')
    try:
        f = get('https://api.alternative.me/fng/?limit=30')['data']
        snap['fear_greed'] = {'now': int(f[0]['value']), 'label': f[0]['value_classification'], 'week_ago': int(f[7]['value']), 'month_ago': int(f[-1]['value'])}
    except Exception as e: errors.append(f'fng: {e}')
    try:
        g = get('https://api.coingecko.com/api/v3/global')['data']
        snap['crypto_market'] = {'total_mcap_usd_b': rnd(g['total_market_cap']['usd'] / 1e9, 1), 'mcap_chg_24h_pct': rnd(g['market_cap_change_percentage_24h_usd']),
                                 'btc_dominance_pct': rnd(g['market_cap_percentage']['btc']), 'eth_dominance_pct': rnd(g['market_cap_percentage']['eth']),
                                 'stablecoins_mcap_usd_b': None}
    except Exception as e: errors.append(f'coingecko: {e}')
    # календар і новини з Worker
    try:
        L = get(WORKER + '/live', timeout=30)
        cal = [e for e in L.get('calendar', []) if e.get('impact') == 'High' and now <= datetime.fromisoformat(e['ts'].replace('Z', '+00:00')) <= now + timedelta(days=10)]
        snap['calendar_high'] = [{k: e.get(k) for k in ('ts', 'country', 'title', 'forecast', 'previous', 'actual')} for e in cal][:25]
        day = [i for i in L.get('items', []) if now - datetime.fromisoformat(i['ts'].replace('Z', '+00:00')) < timedelta(hours=30)]
        imp = [i for i in day if i.get('imp')] or day
        snap['news_24h'] = {'count': len(day), 'bullish': sum(1 for i in day if i.get('sent') == 'Bullish'), 'bearish': sum(1 for i in day if i.get('sent') == 'Bearish'),
                            'important': [{'ts': i['ts'], 'src': i['src'], 'sent': i.get('sent'), 'cat': i.get('cat'), 'title': i['title'], 'title_uk': ((i.get('t') or {}).get('uk') or {}).get('title'), 'url': i.get('url')} for i in imp[:30]]}
    except Exception as e: errors.append(f'worker: {e}')
    try:
        ev = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'data', 'events.json')))
        rows = ev.get('events', ev) if isinstance(ev, dict) else ev
        snap['scheduled_events'] = [e for e in rows if isinstance(e, dict) and now - timedelta(days=1) <= datetime.fromisoformat(str(e.get('ts')).replace('Z', '+00:00')) <= now + timedelta(days=30)][:15]
    except Exception as e: errors.append(f'events: {e}')
    txt = json.dumps(snap, ensure_ascii=False, indent=1)
    open(OUT, 'w').write(txt)
    print('ok', len(snap['assets']), 'assets,', len(errors), 'errors', errors[:5])

if __name__ == '__main__':
    main()
