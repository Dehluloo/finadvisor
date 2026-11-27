"""Перевіряє й публікує глибокий аналіз Claude у data/deep.json (українською та англійською).
Використання: python3 tools/build_deep.py /tmp/deep.json
Вхід: {"uk": {...}, "en": {...}} — однакова структура обома мовами (див. SCHEMA нижче).
Програма FinRAD показує цей аналіз у розділі «Глибокий аналіз Claude» і в усіх аналітичних розділах, поки він свіжий (до 36 год)."""
import json, os, sys
from datetime import datetime, timezone

SCHEMA = {
    'brief': ('list', ['date', 'signal', 'signal_light', 'summary', 'regime', 'data_as_of']),
    'posture': ('list', ['asset', 'light', 'posture', 'plain']),
    'plain': ('list', ['order', 'label', 'text']),
    'outlook': ('list', ['area', 'stance', 'text']),
    'weekly': ('list', ['order', 'week', 'label', 'text']),
    'general': ('list', ['order', 'text']),
    'news': ('list', ['title', 'why', 'impact', 'category', 'assets', 'source']),
    'calendar': ('list', ['date', 'event', 'why']),
}
DEEP = {'headline': str, 'thesis': str, 'risk_level': str, 'horizon': str, 'sections': list, 'assets': list, 'scenarios': list, 'risks': list, 'watch': list}
LIGHTS, RISK, BIAS, IMPACT = {'red', 'yellow', 'green'}, {'low', 'medium', 'high'}, {'bullish', 'neutral', 'bearish'}, {'Bullish', 'Bearish', 'Mixed', 'Neutral'}

def fail(msg): sys.exit('ПОМИЛКА: ' + msg)

def check(lang, d):
    for k, (_, keys) in SCHEMA.items():
        v = d.get(k)
        if not isinstance(v, list) or not v: fail(f'{lang}.{k}: має бути непорожній список')
        for i, row in enumerate(v):
            miss = [x for x in keys if x not in row or row[x] in (None, '')]
            if miss: fail(f'{lang}.{k}[{i}]: бракує {miss}')
    if d['brief'][0]['signal_light'] not in LIGHTS: fail(f'{lang}.brief[0].signal_light ∈ {LIGHTS}')
    for p in d['posture']:
        if p['light'] not in LIGHTS: fail(f'{lang}.posture.light ∈ {LIGHTS}')
    for n in d['news']:
        if n['impact'] not in IMPACT: fail(f'{lang}.news.impact ∈ {IMPACT}')
    D = d.get('deep')
    if not isinstance(D, dict): fail(f'{lang}.deep відсутній')
    for k, t in DEEP.items():
        if not isinstance(D.get(k), t) or not D.get(k): fail(f'{lang}.deep.{k}: має бути {t.__name__}, непорожнє')
    if D['risk_level'] not in RISK: fail(f'{lang}.deep.risk_level ∈ {RISK}')
    for s in D['sections']:
        if not s.get('h') or not s.get('text'): fail(f'{lang}.deep.sections: потрібні h і text')
    for a in D['assets']:
        for x in ('tk', 'name', 'bias', 'text'):
            if not a.get(x): fail(f'{lang}.deep.assets: бракує {x} у {a.get("tk")}')
        if a['bias'] not in BIAS: fail(f'{lang}.deep.assets.bias ∈ {BIAS}')
        if a.get('conviction') not in (1, 2, 3): fail(f'{lang}.deep.assets.conviction ∈ 1..3 у {a["tk"]}')
        for x in ('support', 'resistance'):
            if not isinstance(a.get(x, []), list): fail(f'{lang}.deep.assets.{x}: список чисел')
    tot = sum(float(s.get('prob', 0)) for s in D['scenarios'])
    if not 95 <= tot <= 105: fail(f'{lang}.deep.scenarios: сума ймовірностей {tot}, має бути ≈100')

def main():
    src = json.load(open(sys.argv[1]))
    for lang in ('uk', 'en'):
        if lang not in src: fail(f'немає мови {lang}')
        check(lang, src[lang])
    if [a['tk'] for a in src['uk']['deep']['assets']] != [a['tk'] for a in src['en']['deep']['assets']]: fail('uk і en: різні списки активів у deep.assets')
    if len(src['uk']['deep']['scenarios']) != len(src['en']['deep']['scenarios']): fail('uk і en: різна кількість сценаріїв')
    root = os.path.join(os.path.dirname(__file__), '..', 'data')
    snap_at = None
    try: snap_at = json.load(open(os.path.join(root, 'snapshot.json'))).get('generated')
    except Exception: pass
    out = {'source': 'claude', 'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'snapshot': snap_at,
           'sources': src.get('sources', []), 'uk': src['uk'], 'en': src['en']}
    txt = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(root, 'deep.json'), 'w').write(txt)
    print('ok', len(txt), 'байт; активів', len(src['uk']['deep']['assets']))

if __name__ == '__main__':
    main()
