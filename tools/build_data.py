"""Збирає data/brief.json і data/brief.js для застосунку.
Використання: python3 tools/build_data.py <папка з json брифу> [папка data]
Ключі, для яких немає файлу, беруться з поточного data/brief.json (нічого не зникає)."""
import json, sys, os
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data')
prev = {}
try: prev = json.load(open(os.path.join(out, 'brief.json')))
except Exception: pass
b = {}
for k in ['brief','posture','plain','news','calendar','outlook','weekly','general','markets','coins','liq','fng']:
    p = os.path.join(src, k + '.json')
    b[k] = json.load(open(p)) if os.path.exists(p) else prev.get(k, [])
p = os.path.join(src, 'hist.json')
if os.path.exists(p):
    b['hist'] = {}
    for r in json.load(open(p)):
        b['hist'].setdefault(r['ticker'], []).append([r['date'], r['open'], r['high'], r['low'], r['close']])
else:
    b['hist'] = prev.get('hist', {})
txt = json.dumps(b, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(out, 'brief.json'), 'w').write(txt)
open(os.path.join(out, 'brief.js'), 'w').write('window.BRIEF=' + txt + ';\n')
print('ok', len(txt))
