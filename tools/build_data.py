# Builds web/data/brief.json and web/data/brief.js from the dashboard datasets.
import json, sys, os
src = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/brief'
out = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/app/web/data'
def load(n):
    p = os.path.join(src, n + '.json')
    return json.load(open(p)) if os.path.exists(p) else []
b = {k: load(k) for k in ['brief','posture','plain','news','calendar','outlook','weekly','general','markets','coins','liq','fng']}
hist = load('hist')
b['hist'] = {}
for r in hist:
    b['hist'].setdefault(r['ticker'], []).append([r['date'], r['open'], r['high'], r['low'], r['close']])
txt = json.dumps(b, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(out, 'brief.json'), 'w').write(txt)
open(os.path.join(out, 'brief.js'), 'w').write('window.BRIEF=' + txt + ';\n')
print('ok', len(txt))
