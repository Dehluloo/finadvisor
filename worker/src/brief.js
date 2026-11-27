// Автоматичний бриф за правилами (без ШІ). Формат той самий, що й data/brief.json, тож програма малює його без змін.
// Вхід: perps (Hyperliquid), fng [{v,t}], items (новини за 24 год), cal (події), daily {BTC:[closes]}, tick {SPY:{chg}, XAU:{chg}}.

const T = {
  uk: {
    crypto: 'Криптовалюти', stocks: 'Акції США', gold: 'Золото', cash: 'Кеш і облігації',
    red: 'Високий ризик', yellow: 'Обережно', green: 'Спокійніше',
    sigRed: 'Ризик підвищений: обережність понад усе', sigYellow: 'Ринок у невизначеності: без різких рішень', sigGreen: 'Спокійний фон: ринок тримається',
    regimeOn: 'Апетит до ризику', regimeOff: 'Втеча від ризику', regimeMixed: 'Змішаний',
    fear: 'страх', xfear: 'екстремальний страх', neutral: 'нейтрально', greed: 'жадібність', xgreed: 'екстремальна жадібність',
    up: 'зріс', dn: 'знизився', day: 'за добу', week: 'за тиждень',
    trendUp: 'вище за середню ціну 50 днів — тренд угору', trendDn: 'нижче за середню ціну 50 днів — тренд униз',
    fundHot: 'Трейдери масово ставлять на ріст у борг (високий фандинг) — це часто передує різким відкатам.',
    fundCold: 'Трейдери ставлять на падіння (від’ємний фандинг) — можливий різкий відскок угору.',
    fundOk: 'Ставки в борг збалансовані, перекосу немає.',
    newsBull: 'У новинах переважає позитив', newsBear: 'У новинах переважає негатив', newsMix: 'Новини змішані',
    evNone: 'Найближчими днями великих подій у календарі США немає.', evNext: 'Головна подія попереду',
    lblMood: 'Настрій ринку', lblBtc: 'Біткоїн', lblNews: 'Новини', lblRisk: 'Що це означає', lblNext: 'На що чекати',
    riskRed: 'Зараз краще не поспішати з великими покупками і не торгувати в борг. Якщо купуєте — малими частинами.',
    riskYellow: 'Ринок вагається. Розумно тримати план, купувати частинами (DCA) і не реагувати на кожен стрибок.',
    riskGreen: 'Фон спокійний, але це не гарантія. Тримайтеся свого плану і не збільшуйте ризик через ейфорію.',
    stanceBull: 'Сприятливо', stanceBear: 'Ризиковано', stanceNeutral: 'Нейтрально',
    wkBtc: 'Біткоїн за тиждень', wkNews: 'Головне за тиждень', wkAhead: 'Наступний тиждень',
    wkNewsTxt: (n, b, s) => `${n} важливих новин: ${b} позитивних, ${s} негативних.`,
    noData: 'Немає свіжих даних.', cnt: (b, s) => `позитивних ${b}, негативних ${s}`,
    tips: ['Не вкладайте гроші, які можуть знадобитися найближчим часом.', 'Купуйте частинами через рівні проміжки (DCA) замість однієї великої покупки.',
      'Не торгуйте в борг (з кредитним плечем) у нервовому ринку.', 'Тримайте частину грошей у кеші — це подушка і можливість купити дешевше.',
      'Розподіляйте гроші між різними активами, а не тримайте все в одному.', 'Вирішуйте за планом, а не під впливом новин чи страху.'],
    summary: (p) => `${p.btc} ${p.fng} ${p.news}`
  },
  en: {
    crypto: 'Crypto', stocks: 'US stocks', gold: 'Gold', cash: 'Cash & bonds',
    red: 'High risk', yellow: 'Caution', green: 'Calmer',
    sigRed: 'Elevated risk: caution first', sigYellow: 'Market undecided: no sudden moves', sigGreen: 'Calm backdrop: market holding up',
    regimeOn: 'Risk-on', regimeOff: 'Risk-off', regimeMixed: 'Mixed',
    fear: 'fear', xfear: 'extreme fear', neutral: 'neutral', greed: 'greed', xgreed: 'extreme greed',
    up: 'rose', dn: 'fell', day: 'in 24h', week: 'this week',
    trendUp: 'above its 50-day average — uptrend', trendDn: 'below its 50-day average — downtrend',
    fundHot: 'Traders are heavily betting on a rise with borrowed money (high funding) — this often precedes sharp pullbacks.',
    fundCold: 'Traders are betting on a fall (negative funding) — a sharp bounce is possible.',
    fundOk: 'Leveraged bets are balanced, no skew.',
    newsBull: 'News flow is mostly positive', newsBear: 'News flow is mostly negative', newsMix: 'News flow is mixed',
    evNone: 'No major US calendar events in the next few days.', evNext: 'Key event ahead',
    lblMood: 'Market mood', lblBtc: 'Bitcoin', lblNews: 'News', lblRisk: 'What it means', lblNext: 'What to watch',
    riskRed: 'Better not to rush into large purchases or trade with leverage. If buying — in small parts.',
    riskYellow: 'The market is hesitating. Stick to your plan, buy in parts (DCA) and ignore every swing.',
    riskGreen: 'The backdrop is calm, but it is no guarantee. Stick to your plan and do not add risk out of euphoria.',
    stanceBull: 'Favourable', stanceBear: 'Risky', stanceNeutral: 'Neutral',
    wkBtc: 'Bitcoin this week', wkNews: 'Week in news', wkAhead: 'Next week',
    wkNewsTxt: (n, b, s) => `${n} important stories: ${b} positive, ${s} negative.`,
    noData: 'No fresh data.', cnt: (b, s) => `${b} positive, ${s} negative`,
    tips: ['Do not invest money you may need soon.', 'Buy in equal parts at regular intervals (DCA) instead of one big purchase.',
      'Avoid leverage in a nervous market.', 'Keep part of your money in cash — a cushion and a chance to buy cheaper.',
      'Spread money across different assets instead of holding everything in one.', 'Decide by plan, not by headlines or fear.'],
    summary: (p) => `${p.btc} ${p.fng} ${p.news}`
  }
};
const pc = (v) => (v > 0 ? '+' : '') + v.toFixed(1) + '%';
const usd = (v) => '$' + Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');

export function buildBrief(inp, lang) {
  const L = T[lang] || T.uk, now = new Date();
  const p = inp.perps || {}, btc = p.BTC, fngNow = inp.fng && inp.fng.length ? inp.fng[inp.fng.length - 1].v : null;
  const ch = (k) => p[k] && p[k].prev ? (p[k].mark / p[k].prev - 1) * 100 : null;
  const btc24 = ch('BTC'), eth24 = ch('ETH');
  const closes = (inp.daily && inp.daily.BTC) || [];
  const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((s, x) => s + x, 0) / 50 : null;
  const btc7 = closes.length >= 8 ? (closes[closes.length - 1] / closes[closes.length - 8] - 1) * 100 : null;
  const trendUp = sma50 && btc ? btc.mark > sma50 : null;
  const fund = ['BTC', 'ETH'].filter(k => p[k]).map(k => p[k].funding_h * 8 * 100);
  const fundAvg = fund.length ? fund.reduce((a, b) => a + b, 0) / fund.length : 0;
  const day = (inp.items || []).filter(i => now - new Date(i.ts) < 86400e3);
  const sentOf = (arr) => { const b = arr.filter(i => i.sent === 'Bullish').length, s = arr.filter(i => i.sent === 'Bearish').length; return {b, s, score: b + s ? (b - s) / (b + s) : 0}; };
  const nAll = sentOf(day), nCrypto = sentOf(day.filter(i => i.cat === 'crypto')), nEco = sentOf(day.filter(i => ['economy', 'markets', 'politics'].includes(i.cat)));
  const fngLbl = fngNow == null ? '' : fngNow < 25 ? L.xfear : fngNow < 45 ? L.fear : fngNow <= 55 ? L.neutral : fngNow <= 75 ? L.greed : L.xgreed;

  // ---- світлофор ----
  let cr = 0; // >0 добре, <0 ризик
  if (btc24 != null) cr += btc24 > 3 ? 1 : btc24 < -3 ? -1 : 0;
  if (trendUp != null) cr += trendUp ? 1 : -1;
  if (fngNow != null) cr += fngNow < 25 || fngNow > 78 ? -1 : fngNow >= 45 && fngNow <= 70 ? 1 : 0;
  if (Math.abs(fundAvg) > 0.03) cr -= 1;
  cr += nCrypto.score > 0.25 ? 0.5 : nCrypto.score < -0.25 ? -0.5 : 0;
  const lightOf = (s, vol) => vol || s <= -1.5 ? 'red' : s >= 1.5 ? 'green' : 'yellow';
  const crLight = lightOf(cr, btc24 != null && Math.abs(btc24) > 7);
  const spy = inp.tick && inp.tick.SPY, xau = inp.tick && inp.tick.XAU;
  const stScore = (spy ? (spy.chg > 0.7 ? 1 : spy.chg < -0.7 ? -1 : 0) : 0) + (nEco.score > 0.2 ? 0.5 : nEco.score < -0.2 ? -0.5 : 0);
  const stLight = lightOf(stScore * 1.5, spy && Math.abs(spy.chg) > 2.5);
  const auLight = xau && Math.abs(xau.chg) > 2.5 ? 'yellow' : 'green';
  const overall = crLight === 'red' || stLight === 'red' ? 'red' : crLight === 'green' && stLight !== 'red' ? 'green' : 'yellow';
  const word = (v) => v == null ? '' : `${v >= 0 ? L.up : L.dn} ${pc(Math.abs(v)).replace('+', '')}`;

  const btcTxt = btc ? `${L.lblBtc} ${usd(btc.mark)}, ${word(btc24)} ${L.day}${trendUp != null ? '; ' + (trendUp ? L.trendUp : L.trendDn) : ''}.` : L.noData;
  const fngTxt = fngNow != null ? `${L.lblMood}: ${fngNow}/100 (${fngLbl}).` : '';
  const newsTxt = nAll.b + nAll.s >= 4 ? (nAll.score > 0.2 ? L.newsBull : nAll.score < -0.2 ? L.newsBear : L.newsMix) + ` (${L.cnt(nAll.b, nAll.s)}).` : '';
  const regime = cr >= 1 && stScore >= 0 ? L.regimeOn : cr <= -1 && stScore <= 0 ? L.regimeOff : L.regimeMixed;

  const posture = [
    {asset: L.crypto, light: crLight, posture: L[crLight], plain: [btcTxt, fngTxt].filter(Boolean).join(' ')},
    {asset: L.stocks, light: stLight, posture: L[stLight], plain: spy ? `S&P 500 (SPY) ${word(spy.chg)} ${L.day}. ${nEco.b + nEco.s ? (nEco.score > 0.2 ? L.newsBull : nEco.score < -0.2 ? L.newsBear : L.newsMix) + '.' : ''}` : L.noData},
    {asset: L.gold, light: auLight, posture: L[auLight], plain: xau ? `${L.gold} ${usd(xau.last)} ${word(xau.chg)} ${L.day}.` : L.noData},
    {asset: L.cash, light: 'green', posture: L.green, plain: lang === 'uk' ? 'Кеш і короткі облігації захищають від стрибків цін і дають змогу купити дешевше.' : 'Cash and short bonds protect against swings and let you buy cheaper later.'}
  ];
  const upcoming = (inp.cal || []).filter(e => e.impact === 'High' && new Date(e.ts) > now).sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const nextEv = upcoming[0];
  const evTxt = nextEv ? `${L.evNext}: ${nextEv.title} (${nextEv.country}), ${new Date(nextEv.ts).toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv'})}.` : L.evNone;
  const fundTxt = fundAvg > 0.03 ? L.fundHot : fundAvg < -0.01 ? L.fundCold : L.fundOk;
  const plain = [
    {order: 1, label: L.lblMood, text: [fngTxt, fundTxt].filter(Boolean).join(' ')},
    {order: 2, label: L.lblBtc, text: btcTxt + (eth24 != null ? ` ETH ${word(eth24)} ${L.day}.` : '')},
    {order: 3, label: L.lblNews, text: newsTxt || L.noData},
    {order: 4, label: L.lblRisk, text: L['risk' + overall[0].toUpperCase() + overall.slice(1)]},
    {order: 5, label: L.lblNext, text: evTxt}
  ];
  const stance = (s) => s >= 1 ? L.stanceBull : s <= -1 ? L.stanceBear : L.stanceNeutral;
  const outlook = [
    {area: L.crypto, stance: stance(cr), text: [btcTxt, fundTxt].join(' ')},
    {area: L.stocks, stance: stance(stScore * 1.5), text: posture[1].plain},
    {area: L.gold, stance: L.stanceNeutral, text: posture[2].plain}
  ];
  // ---- головне від аналітика: найважливіші новини доби ----
  const top = day.filter(i => i.imp).concat(day.filter(i => !i.imp && i.sent !== 'Neutral')).slice(0, 6);
  const news = top.map(i => { const tt = i.lang === lang ? i : (i.t && i.t[lang]) ? Object.assign({}, i, i.t[lang]) : i;
    return {title: tt.title, why: (tt.body || '').slice(0, 220), impact: i.sent === 'Neutral' ? 'Mixed' : i.sent, category: i.cat, assets: (i.assets || []).join(', '), source: i.src}; });
  // ---- тиждень ----
  const wk = (inp.items || []).filter(i => i.imp), wb = wk.filter(i => i.sent === 'Bullish').length, ws = wk.filter(i => i.sent === 'Bearish').length;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const weekLbl = monday.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', {day: 'numeric', month: 'short'}) + ' – ' + now.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', {day: 'numeric', month: 'short'});
  const weekly = [
    {order: 1, week: weekLbl, label: L.wkBtc, text: btc7 != null ? `${L.lblBtc} ${word(btc7)} ${L.week}${closes.length ? ', ' + usd(closes[closes.length - 1]) : ''}.` : L.noData},
    {order: 2, week: weekLbl, label: L.wkNews, text: L.wkNewsTxt(wk.length, wb, ws)},
    {order: 3, week: weekLbl, label: L.wkAhead, text: upcoming.length ? upcoming.slice(0, 4).map(e => e.title).join(' · ') : L.evNone}
  ];
  const sig = overall === 'red' ? L.sigRed : overall === 'green' ? L.sigGreen : L.sigYellow;
  const ymd = now.toISOString().slice(0, 10);
  return {
    source: 'auto', generated: now.toISOString(),
    brief: [{date: ymd, signal: sig, signal_light: overall, summary: L.summary({btc: btcTxt, fng: fngTxt, news: newsTxt}).trim(), regime, data_as_of: now.toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv'})}],
    posture, plain, news, outlook, weekly, general: L.tips.map((text, i) => ({order: i + 1, text}))
  };
}
