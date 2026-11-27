// Автоматичний бриф за правилами (без ШІ) — запасний, коли свіжого аналізу Claude немає.
// Формат той самий, що й data/brief.json, тож програма малює його без змін.
// Вхід: perps (Hyperliquid), fng [{v,t}], items (новини), cal (події Forex Factory), daily {BTC:[closes]}, tick {SPY,QQQ,XAU,XAG:{last,chg}}.

// Назви подій Forex Factory українською (решта лишається як є — програма перекладе сама)
export const FF_UA = {'CPI m/m':'Інфляція CPI м/м','CPI y/y':'Інфляція CPI р/р','Core CPI m/m':'Базова інфляція CPI м/м','Non-Farm Employment Change':'Нові робочі місця (NFP)','Unemployment Rate':'Рівень безробіття',
  'Federal Funds Rate':'Ставка ФРС','FOMC Statement':'Заява ФРС','FOMC Press Conference':'Пресконференція ФРС','FOMC Meeting Minutes':'Протокол засідання ФРС','Advance GDP q/q':'ВВП США (попередній)','Prelim GDP q/q':'ВВП США (уточнений)','Final GDP q/q':'ВВП США (фінальний)',
  'Core PCE Price Index m/m':'Базовий PCE м/м','PPI m/m':'Ціни виробників PPI м/м','Core PPI m/m':'Базовий PPI м/м','Retail Sales m/m':'Роздрібні продажі','Core Retail Sales m/m':'Базові роздрібні продажі',
  'Unemployment Claims':'Заявки на допомогу з безробіття','ISM Manufacturing PMI':'ISM: промисловість','ISM Services PMI':'ISM: послуги','JOLTS Job Openings':'Вакансії JOLTS','CB Consumer Confidence':'Довіра споживачів (CB)',
  'Prelim UoM Consumer Sentiment':'Настрої споживачів (Мічиган)','Main Refinancing Rate':'Ставка ЄЦБ','Monetary Policy Statement':'Заява ЄЦБ','ECB Press Conference':'Пресконференція ЄЦБ','Fed Chair Powell Speaks':'Виступ голови ФРС','ADP Non-Farm Employment Change':'Зайнятість ADP',
  'Bank Holiday':'Вихідний день','Flash Manufacturing PMI':'PMI промисловість (попер.)','Flash Services PMI':'PMI послуги (попер.)','German Flash Manufacturing PMI':'PMI промисловість Німеччини','French Flash Manufacturing PMI':'PMI промисловість Франції','French Flash Services PMI':'PMI послуги Франції',
  'Empire State Manufacturing Index':'Індекс Empire State','Philly Fed Manufacturing Index':'Індекс ФРБ Філадельфії','Pending Home Sales m/m':'Незавершені продажі житла','Existing Home Sales':'Продажі вторинного житла','New Home Sales':'Продажі нового житла',
  'Building Permits':'Дозволи на будівництво','Durable Goods Orders m/m':'Замовлення товарів тривалого користування','Core Durable Goods Orders m/m':'Базові замовлення товарів тривалого користування','Trade Balance':'Торговий баланс',
  'Average Hourly Earnings m/m':'Середня погодинна зарплата','Personal Spending m/m':'Особисті витрати','Personal Income m/m':'Особисті доходи','Crude Oil Inventories':'Запаси нафти','Natural Gas Storage':'Запаси газу',
  'Revised UoM Consumer Sentiment':'Настрої споживачів (Мічиган, фінал)','Chicago PMI':'PMI Чикаго','Final Manufacturing PMI':'PMI промисловість (фінал)','Final Services PMI':'PMI послуги (фінал)',
  'Employment Cost Index q/q':'Індекс витрат на оплату праці','Prelim Unit Labor Costs q/q':'Витрати на одиницю праці','Prelim Nonfarm Productivity q/q':'Продуктивність праці','FOMC Member Speaks':'Виступ члена ФРС','ECB President Lagarde Speaks':'Виступ голови ЄЦБ Лагард',
  'CPI Flash Estimate y/y':'Інфляція єврозони (попер.)','Core CPI Flash Estimate y/y':'Базова інфляція єврозони (попер.)','GDP q/q':'ВВП к/к','Retail Sales y/y':'Роздрібні продажі р/р','Industrial Production m/m':'Промислове виробництво','Industrial Production y/y':'Промислове виробництво р/р',
  'Manufacturing PMI':'PMI промисловість','Non-Manufacturing PMI':'PMI невиробничий сектор','Caixin Manufacturing PMI':'PMI Caixin промисловість','Caixin Services PMI':'PMI Caixin послуги','Claimant Count Change':'Зміна кількості безробітних','Official Bank Rate':'Ставка Банку Англії',
  'BOJ Policy Rate':'Ставка Банку Японії','Tankan Manufacturing Index':'Індекс Танкан','Treasury Currency Report':'Валютний звіт Мінфіну США','Federal Budget Balance':'Бюджет США','Final GDP Price Index q/q':'Дефлятор ВВП','Prelim GDP Price Index q/q':'Дефлятор ВВП (уточн.)'};
const evTitle = (e, lang) => lang === 'uk' ? (FF_UA[e.title] || e.title) : e.title;
const FLAG = {USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CNY: '🇨🇳', CAD: '🇨🇦', AUD: '🇦🇺', CHF: '🇨🇭', NZD: '🇳🇿'};

const T = {
  uk: {
    crypto: 'Криптовалюти', stocks: 'Акції США', metals: 'Дорогоцінні метали', cash: 'Кеш і короткі облігації',
    red: 'Високий ризик', yellow: 'Обережно', green: 'Сприятливо',
    sigRed: 'Ризик підвищений: пріоритет — збереження капіталу', sigYellow: 'Невизначеність: без різких рішень, позиції частинами', sigGreen: 'Сприятливий фон: тренд і настрій підтримують ринок',
    regimeOn: 'Апетит до ризику (risk-on)', regimeOff: 'Втеча від ризику (risk-off)', regimeMixed: 'Змішаний режим',
    fear: 'страх', xfear: 'екстремальний страх', neutral: 'нейтрально', greed: 'жадібність', xgreed: 'екстремальна жадібність',
    h24: 'за 24 год', d7: 'за 7 днів',
    vsMa: (d) => `${Math.abs(d).toFixed(1).replace('.', ',')}% ${d >= 0 ? 'вище' : 'нижче'} 50-денної середньої`,
    rsi: (v) => `RSI(14) ${Math.round(v)} — ${v >= 70 ? 'перекупленість' : v <= 30 ? 'перепроданість' : v >= 55 ? 'імпульс угору' : v <= 45 ? 'слабкий імпульс' : 'нейтрально'}`,
    fund: (f, ann) => `Фандинг BTC/ETH ${f >= 0 ? '+' : '−'}${Math.abs(f).toFixed(4).replace('.', ',')}% за 8 год (≈${ann >= 0 ? '' : '−'}${Math.abs(ann).toFixed(0)}% річних)`,
    fundHot: 'надмірні лонги в борг — ризик різкого відкату (лонг-сквізу)', fundCold: 'переважають шорти — можливий різкий відскок (шорт-сквіз)', fundOk: 'перекосу позицій немає',
    oi: (v) => `відкритий інтерес BTC ≈ $${v} млрд`,
    fng: (v, l) => `Індекс страху й жадібності ${v}/100 (${l})`,
    fngX: 'історично такі рівні часто бували зоною накопичення, але не гарантують розвороту', fngG: 'ейфорія підвищує ризик корекції',
    newsBull: 'У стрічці переважає позитив', newsBear: 'У стрічці переважає негатив', newsMix: 'Новинний фон змішаний',
    cnt: (b, s) => `позитивних ${b}, негативних ${s} за 24 год`,
    evNone: 'Найближчими днями великих макроподій у календарі немає.', evNext: 'Ключова подія попереду', evAlso: 'Також',
    lblMood: 'Настрій і позиціонування', lblBtc: 'Біткоїн: тренд і імпульс', lblNews: 'Новинний фон', lblRisk: 'Що це означає', lblNext: 'На що чекати',
    riskRed: 'Пріоритет — захист капіталу: не збільшувати ризик, уникати плеча; нові покупки — лише малими частинами за планом.',
    riskYellow: 'Ринок без чіткого напрямку. Розумно діяти за планом, входити частинами (DCA) і не реагувати на кожен рух.',
    riskGreen: 'Фон сприятливий, але це не гарантія. Тримайтеся плану й не нарощуйте ризик на ейфорії.',
    stanceBull: 'Бичаче', stanceBear: 'Ведмеже', stanceNeutral: 'Нейтрально',
    wkBtc: 'Біткоїн за тиждень', wkNews: 'Головне за тиждень', wkAhead: 'Наступні події',
    wkNewsTxt: (n, b, s) => `${n} важливих новин: ${b} позитивних, ${s} негативних.`,
    noData: 'Немає свіжих даних.',
    gold: 'Золото', silver: 'Срібло', gsr: (r) => `співвідношення золото/срібло ${r.toFixed(0)}`,
    cashTxt: 'Кеш і короткі облігації знижують волатильність портфеля й дають ресурс купити дешевше на корекціях.',
    tips: ['Не інвестуйте гроші, які можуть знадобитися найближчим часом.', 'Входьте частинами через рівні проміжки (DCA) замість однієї великої покупки.',
      'Не використовуйте кредитне плече в нервовому ринку.', 'Тримайте частину портфеля в кеші — це подушка й ресурс для покупок на корекціях.',
      'Диверсифікуйте між класами активів, а не концентруйтеся в одному.', 'Рішення — за заздалегідь складеним планом, а не під впливом заголовків.']
  },
  en: {
    crypto: 'Crypto', stocks: 'US stocks', metals: 'Precious metals', cash: 'Cash & short bonds',
    red: 'High risk', yellow: 'Caution', green: 'Favourable',
    sigRed: 'Elevated risk: capital preservation first', sigYellow: 'Uncertainty: no sudden moves, scale in gradually', sigGreen: 'Supportive backdrop: trend and sentiment favour the market',
    regimeOn: 'Risk-on', regimeOff: 'Risk-off', regimeMixed: 'Mixed regime',
    fear: 'fear', xfear: 'extreme fear', neutral: 'neutral', greed: 'greed', xgreed: 'extreme greed',
    h24: 'in 24h', d7: 'over 7 days',
    vsMa: (d) => `${Math.abs(d).toFixed(1)}% ${d >= 0 ? 'above' : 'below'} the 50-day average`,
    rsi: (v) => `RSI(14) ${Math.round(v)} — ${v >= 70 ? 'overbought' : v <= 30 ? 'oversold' : v >= 55 ? 'upward momentum' : v <= 45 ? 'weak momentum' : 'neutral'}`,
    fund: (f, ann) => `BTC/ETH funding ${f >= 0 ? '+' : '−'}${Math.abs(f).toFixed(4)}% per 8h (≈${ann >= 0 ? '' : '−'}${Math.abs(ann).toFixed(0)}% annualised)`,
    fundHot: 'crowded leveraged longs — risk of a sharp pullback (long squeeze)', fundCold: 'shorts dominate — a sharp bounce is possible (short squeeze)', fundOk: 'no positioning skew',
    oi: (v) => `BTC open interest ≈ $${v}B`,
    fng: (v, l) => `Fear & Greed ${v}/100 (${l})`,
    fngX: 'historically such levels were often accumulation zones, but they do not guarantee a reversal', fngG: 'euphoria raises correction risk',
    newsBull: 'News flow is mostly positive', newsBear: 'News flow is mostly negative', newsMix: 'News flow is mixed',
    cnt: (b, s) => `${b} positive, ${s} negative in 24h`,
    evNone: 'No major macro events in the calendar for the next few days.', evNext: 'Key event ahead', evAlso: 'Also',
    lblMood: 'Sentiment & positioning', lblBtc: 'Bitcoin: trend & momentum', lblNews: 'News flow', lblRisk: 'What it means', lblNext: 'What to watch',
    riskRed: 'Capital preservation first: do not add risk, avoid leverage; new buys only in small planned parts.',
    riskYellow: 'No clear direction. Stick to the plan, scale in (DCA) and do not react to every move.',
    riskGreen: 'The backdrop is supportive, but no guarantee. Stick to the plan and do not add risk out of euphoria.',
    stanceBull: 'Bullish', stanceBear: 'Bearish', stanceNeutral: 'Neutral',
    wkBtc: 'Bitcoin this week', wkNews: 'Week in news', wkAhead: 'Coming up',
    wkNewsTxt: (n, b, s) => `${n} important stories: ${b} positive, ${s} negative.`,
    noData: 'No fresh data.',
    gold: 'Gold', silver: 'Silver', gsr: (r) => `gold/silver ratio ${r.toFixed(0)}`,
    cashTxt: 'Cash and short bonds dampen portfolio volatility and give dry powder for buying dips.',
    tips: ['Do not invest money you may need soon.', 'Scale in at regular intervals (DCA) instead of one large purchase.',
      'Avoid leverage in a nervous market.', 'Keep part of the portfolio in cash — a cushion and dry powder for dips.',
      'Diversify across asset classes instead of concentrating in one.', 'Decide by a pre-set plan, not by headlines.']
  }
};
const num = (v, lang, d = 1) => { const s = Math.abs(v).toFixed(d); return lang === 'uk' ? s.replace('.', ',') : s; };
const pc = (v, lang) => (v >= 0 ? '+' : '−') + num(v, lang) + '%';
let LNG = 'uk';
const usd = (v, d) => { d = d != null ? d : v >= 1000 ? 0 : 2; const s = '$' + v.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d}).replace(/,/g, ' '); return LNG === 'uk' ? s.replace('.', ',') : s; };
function rsi14(c) {
  if (c.length < 16) return null; let g = 0, l = 0;
  for (let i = 1; i <= 14; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= 14; l /= 14;
  for (let i = 15; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; l = (l * 13 + Math.max(-d, 0)) / 14; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export function buildBrief(inp, lang) {
  LNG = lang; const L = T[lang] || T.uk, now = new Date(), loc = lang === 'uk' ? 'uk-UA' : 'en-US';
  const p = inp.perps || {}, btc = p.BTC, fngNow = inp.fng && inp.fng.length ? inp.fng[inp.fng.length - 1].v : null;
  const ch = (k) => p[k] && p[k].prev ? (p[k].mark / p[k].prev - 1) * 100 : null;
  const btc24 = ch('BTC'), eth24 = ch('ETH'), sol24 = ch('SOL');
  const closes = (inp.daily && inp.daily.BTC) || [];
  const last = btc ? btc.mark : closes[closes.length - 1];
  const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((s, x) => s + x, 0) / 50 : null;
  const vsMa = sma50 && last ? (last / sma50 - 1) * 100 : null;
  const btc7 = closes.length >= 8 && last ? (last / closes[closes.length - 8] - 1) * 100 : null;
  const rsi = closes.length >= 16 ? rsi14(btc && closes.length ? [...closes.slice(0, -1), btc.mark] : closes) : null;
  const fund = ['BTC', 'ETH'].filter(k => p[k] && p[k].funding_h != null).map(k => p[k].funding_h * 8 * 100);
  const fundAvg = fund.length ? fund.reduce((a, b) => a + b, 0) / fund.length : null;
  const oiB = btc && btc.oi_usd ? (btc.oi_usd / 1e9) : null;
  const day = (inp.items || []).filter(i => now - new Date(i.ts) < 86400e3);
  const sentOf = (arr) => { const b = arr.filter(i => i.sent === 'Bullish').length, s = arr.filter(i => i.sent === 'Bearish').length; return {b, s, score: b + s ? (b - s) / (b + s) : 0}; };
  const nAll = sentOf(day), nCrypto = sentOf(day.filter(i => i.cat === 'crypto')), nEco = sentOf(day.filter(i => ['economy', 'markets', 'politics'].includes(i.cat)));
  const fngLbl = fngNow == null ? '' : fngNow < 25 ? L.xfear : fngNow < 45 ? L.fear : fngNow <= 55 ? L.neutral : fngNow <= 75 ? L.greed : L.xgreed;

  // ---- оцінка крипторинку: тренд, імпульс, настрій, позиціонування, новини ----
  let cr = 0;
  if (vsMa != null) cr += vsMa > 2 ? 1 : vsMa < -2 ? -1 : 0;
  if (btc7 != null) cr += btc7 > 4 ? 0.5 : btc7 < -4 ? -0.5 : 0;
  if (rsi != null) cr += rsi >= 55 && rsi < 72 ? 0.5 : rsi < 40 ? -0.5 : 0;
  if (fngNow != null) cr += fngNow > 80 ? -1 : fngNow >= 45 && fngNow <= 72 ? 0.5 : fngNow < 20 ? -0.5 : 0;
  if (fundAvg != null && Math.abs(fundAvg) > 0.03) cr -= 1;
  cr += nCrypto.score > 0.25 ? 0.5 : nCrypto.score < -0.25 ? -0.5 : 0;
  const lightOf = (s, vol) => vol || s <= -1.5 ? 'red' : s >= 1.5 ? 'green' : 'yellow';
  const crLight = lightOf(cr, btc24 != null && Math.abs(btc24) > 7);
  const tk = inp.tick || {}, spy = tk.SPY, qqq = tk.QQQ, xau = tk.XAU, xag = tk.XAG;
  const stScore = (spy ? (spy.chg > 0.7 ? 1 : spy.chg < -0.7 ? -1 : 0) : 0) + (qqq ? (qqq.chg > 1 ? 0.5 : qqq.chg < -1 ? -0.5 : 0) : 0) + (nEco.score > 0.2 ? 0.5 : nEco.score < -0.2 ? -0.5 : 0);
  const stLight = lightOf(stScore * 1.4, spy && Math.abs(spy.chg) > 2.5);
  const mtVol = (xau && Math.abs(xau.chg) > 2.5) || (xag && Math.abs(xag.chg) > 4);
  const mtLight = mtVol ? 'yellow' : xau && xau.chg < -1.5 ? 'yellow' : 'green';
  const overall = crLight === 'red' || stLight === 'red' ? 'red' : crLight === 'green' && stLight !== 'red' ? 'green' : 'yellow';

  const btcTxt = last ? [`BTC ${usd(last)}` + (btc24 != null ? ` (${pc(btc24, lang)} ${L.h24}` + (btc7 != null ? `, ${pc(btc7, lang)} ${L.d7})` : ')') : ''),
    vsMa != null ? L.vsMa(vsMa) : '', rsi != null ? L.rsi(rsi) : ''].filter(Boolean).join('; ') + '.' : L.noData;
  const fundTxt = fundAvg != null ? `${L.fund(fundAvg, fundAvg * 3 * 365)} — ${fundAvg > 0.03 ? L.fundHot : fundAvg < -0.01 ? L.fundCold : L.fundOk}${oiB ? '; ' + L.oi(num(oiB, lang)) : ''}.` : '';
  const fngTxt = fngNow != null ? `${L.fng(fngNow, fngLbl)}${fngNow < 20 ? ' — ' + L.fngX : fngNow > 78 ? ' — ' + L.fngG : ''}.` : '';
  const newsTxt = nAll.b + nAll.s >= 4 ? `${nAll.score > 0.2 ? L.newsBull : nAll.score < -0.2 ? L.newsBear : L.newsMix} (${L.cnt(nAll.b, nAll.s)}).` : '';
  const regime = cr >= 1 && stScore >= 0 ? L.regimeOn : cr <= -1 && stScore <= 0 ? L.regimeOff : L.regimeMixed;
  const stTxt = spy ? `S&P 500 (SPY) ${usd(spy.last, 2)} ${pc(spy.chg, lang)}` + (qqq ? `, Nasdaq 100 (QQQ) ${pc(qqq.chg, lang)}` : '') + ` ${L.h24}. ` + (nEco.b + nEco.s ? (nEco.score > 0.2 ? L.newsBull : nEco.score < -0.2 ? L.newsBear : L.newsMix) + '.' : '') : L.noData;
  const mtTxt = xau ? `${L.gold} ${usd(xau.last)} (${pc(xau.chg, lang)})` + (xag ? `, ${L.silver.toLowerCase()} ${usd(xag.last, 2)} (${pc(xag.chg, lang)})` : '') + ` ${L.h24}` + (xau && xag && xag.last ? `; ${L.gsr(xau.last / xag.last)}` : '') + '.' : L.noData;

  const posture = [
    {asset: L.crypto, light: crLight, posture: L[crLight], plain: [btcTxt, fngTxt].filter(Boolean).join(' ')},
    {asset: L.stocks, light: stLight, posture: L[stLight], plain: stTxt.trim()},
    {asset: L.metals, light: mtLight, posture: L[mtLight], plain: mtTxt},
    {asset: L.cash, light: 'green', posture: L.green, plain: L.cashTxt}
  ];
  const upcoming = (inp.cal || []).filter(e => e.impact === 'High' && new Date(e.ts) > now).sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const when = (e) => new Date(e.ts).toLocaleString(loc, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv'});
  const nextEv = upcoming[0];
  const evTxt = nextEv ? `${L.evNext}: ${FLAG[nextEv.country] || nextEv.country} ${evTitle(nextEv, lang)} — ${when(nextEv)}` + (nextEv.forecast ? ` (${lang === 'uk' ? 'прогноз' : 'forecast'} ${nextEv.forecast}${nextEv.previous ? ', ' + (lang === 'uk' ? 'попереднє' : 'previous') + ' ' + nextEv.previous : ''})` : '') + '.' +
    (upcoming.length > 1 ? ` ${L.evAlso}: ${upcoming.slice(1, 3).map(e => `${evTitle(e, lang)} (${when(e)})`).join('; ')}.` : '') : L.evNone;
  const plain = [
    {order: 1, label: L.lblMood, text: [fngTxt, fundTxt].filter(Boolean).join(' ') || L.noData},
    {order: 2, label: L.lblBtc, text: btcTxt + (eth24 != null ? ` ETH ${pc(eth24, lang)}` + (sol24 != null ? `, SOL ${pc(sol24, lang)}` : '') + ` ${L.h24}.` : '')},
    {order: 3, label: L.lblNews, text: newsTxt || L.noData},
    {order: 4, label: L.lblRisk, text: L['risk' + overall[0].toUpperCase() + overall.slice(1)]},
    {order: 5, label: L.lblNext, text: evTxt}
  ];
  const stance = (s) => s >= 1 ? L.stanceBull : s <= -1 ? L.stanceBear : L.stanceNeutral;
  const outlook = [
    {area: L.crypto, stance: stance(cr), text: [btcTxt, fundTxt].filter(Boolean).join(' ')},
    {area: L.stocks, stance: stance(stScore * 1.4), text: stTxt.trim()},
    {area: L.metals, stance: xau ? stance(xau.chg > 1 ? 1 : xau.chg < -1 ? -1 : 0) : L.stanceNeutral, text: mtTxt}
  ];
  // ---- найважливіші новини доби — лише ті, що є мовою користувача ----
  const inLang = (i) => i.lang === lang ? i : (i.t && i.t[lang] && i.t[lang].title) ? Object.assign({}, i, i.t[lang]) : null;
  const pool = day.filter(i => i.imp).concat(day.filter(i => !i.imp && i.sent !== 'Neutral'));
  const news = pool.map(i => [i, inLang(i)]).filter(([, tt]) => tt).slice(0, 6).map(([i, tt]) =>
    ({title: tt.title, why: (tt.body || '').slice(0, 220), impact: i.sent === 'Neutral' ? 'Mixed' : i.sent, category: i.cat, assets: (i.assets || []).join(', '), source: i.src}));
  // ---- тиждень ----
  const wk = (inp.items || []).filter(i => i.imp), wb = wk.filter(i => i.sent === 'Bullish').length, ws = wk.filter(i => i.sent === 'Bearish').length;
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const weekLbl = monday.toLocaleDateString(loc, {day: 'numeric', month: 'short'}) + ' – ' + now.toLocaleDateString(loc, {day: 'numeric', month: 'short'});
  const weekly = [
    {order: 1, week: weekLbl, label: L.wkBtc, text: btc7 != null ? `BTC ${pc(btc7, lang)} ${L.d7}, ${usd(last)}${vsMa != null ? '; ' + L.vsMa(vsMa) : ''}.` : L.noData},
    {order: 2, week: weekLbl, label: L.wkNews, text: L.wkNewsTxt(wk.length, wb, ws)},
    {order: 3, week: weekLbl, label: L.wkAhead, text: upcoming.length ? upcoming.slice(0, 4).map(e => `${evTitle(e, lang)} (${when(e)})`).join(' · ') : L.evNone}
  ];
  const sig = overall === 'red' ? L.sigRed : overall === 'green' ? L.sigGreen : L.sigYellow;
  const summary = [btcTxt, fngTxt, newsTxt].filter(Boolean).join(' ');
  return {
    source: 'auto', generated: now.toISOString(),
    brief: [{date: now.toISOString().slice(0, 10), signal: sig, signal_light: overall, summary, regime, data_as_of: now.toLocaleString(loc, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv'})}],
    posture, plain, news, outlook, weekly, general: L.tips.map((text, i) => ({order: i + 1, text}))
  };
}
