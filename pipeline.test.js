const fs = require('fs');
let src = fs.readFileSync('./background.js', 'utf8')
  .replace('const AI_TIMEOUT_MS = 30000;', 'const AI_TIMEOUT_MS = 300;')
  .replace('await sleep(2000);', 'await sleep(1);');
src = src.replace(/const TAB_GRACE_MS = \d+;/, 'const TAB_GRACE_MS = 1;')
         .replace(/const TAB_LOAD_TIMEOUT_MS = \d+;/, 'const TAB_LOAD_TIMEOUT_MS = 60;')
         .replace(/const KWORK_RETRY_PAUSE_MS = \d+;/, 'const KWORK_RETRY_PAUSE_MS = 1;')
         .replace(/const ORDERS_RETRY_DELAY_MS = \d+;/, 'const ORDERS_RETRY_DELAY_MS = 1;');

const harness = `
const store = {};

const tabsState = [];
const updListeners = new Set();
let tabBehavior = (tab, kind, url) => ({ url: url });
const fireComplete = (id) => updListeners.forEach((fn) => fn(id, { status: 'complete' }));
const findT = (id) => tabsState.find((x) => x.id === id);
const applyLoad = (id, kind, url) => {
  const t = findT(id);
  const r = tabBehavior(t, kind, url);
  setTimeout(() => {
    if (r.hang) { t.status = 'loading'; return; }
    t.url = r.url; t.status = 'complete'; fireComplete(id);
  }, 0);
};
const tabsApi = {
  query: async (q) => (q.url.includes('kwork') ? tabsState.filter((t) => t.url.includes('kwork.ru') && t.url.startsWith('http')) : []),
  get: async (id) => { const t = findT(id); if (!t) throw new Error('No tab with id'); return Object.assign({}, t); },
  reload: (id, o, cb) => { applyLoad(id, 'reload', findT(id).url); cb && cb(); },
  update: (id, props, cb) => { applyLoad(id, 'update', props.url); cb && cb(); },
  create: (p) => { tabsState.push({ id: 100 + tabsState.length, url: p.url, status: 'complete' }); },
  sendMessage: async (id) => {
    const t = findT(id);
    if (!t.url.startsWith('http') || t.status !== 'complete') throw new Error('Receiving end does not exist.');
    return { orders: [{ title: 'Нужен бот', description: 'Нужен бот для Telegram', price: '5000 ₽', url: 'https://kwork.ru/projects/777/view' }] };
  },
  onUpdated: { addListener: (fn) => updListeners.add(fn), removeListener: (fn) => updListeners.delete(fn) },
};

const chrome = {
  storage: { local: {
    get(keys, cb){ const out={}; (Array.isArray(keys)?keys:[keys]).forEach(k=>{ if(k in store) out[k]=JSON.parse(JSON.stringify(store[k])); }); cb(out); },
    set(obj, cb){ for (const k in obj) store[k]=JSON.parse(JSON.stringify(obj[k])); cb && cb(); } } },
  alarms: { create(){}, onAlarm:{addListener(){}} },
  runtime: { onInstalled:{addListener(){}}, onStartup:{addListener(){}}, onMessage:{addListener(){}} },
  tabs: tabsApi
};
let tgSent = [], geminiBodies = [], tgMode = 'ok', aiMode = 'ok';
globalThis.fetch = async (url, opts) => {
  if (/api\.groq\.com|openrouter\.ai|deepseek/.test(url)) {
    geminiBodies.push(Object.assign(JSON.parse(opts.body), {__auth: opts.headers.Authorization, __url: url}));
    if (aiMode === 'hang') return new Promise((_, rej) => opts.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name='AbortError'; rej(e); }));
    if (aiMode === '402') return { ok:false, status:402, text: async()=>'{"error":{"message":"Insufficient credits"}}', json: async()=>({}) };
    if (aiMode === 'full') return { ok:true, status:200, json: async()=>({choices:[{message:{content: JSON.stringify({score:95, analysis:'Нужен лендинг для СТО на WordPress. В ТЗ нет списка услуг.', risks:['Нет контента и фото','Не указаны сроки','лишний 3','лишний 4'], effort:'medium', response:'Здравствуйте! Сделаю лендинг на WordPress. Какие услуги выводить?'})}}]}) };
    if (aiMode === 'truncResp') return { ok:true, status:200, json: async()=>({choices:[{message:{content:'{"score": 80, "analysis": "Коротко", "response": "Здравствуйте! Сделаю лендинг.", "risks": ["a"'}}]}) };
    if (aiMode === 'think') { const bd = JSON.parse(opts.body); if (bd.max_tokens < 4096) return { ok:true, status:200, json: async()=>({choices:[{message:{content:''},finish_reason:'length'}]}) }; }
    if (aiMode === 'reason400') { const bd = JSON.parse(opts.body); if (bd.reasoning) return { ok:false, status:400, text: async()=>'{"error":{"message":"reasoning not supported"}}', json: async()=>({}) }; }
    if (aiMode === 'emptyAlways') return { ok:true, status:200, json: async()=>({choices:[{message:{content:null},finish_reason:'length'}]}) };
    if (aiMode === '403meta') return { ok:false, status:403, headers:{get:(h)=>({'content-type':'application/json','server':'cloudflare'}[h.toLowerCase()])}, text: async()=>'{"error":{"code":403,"message":"Provider blocked","metadata":{"reason":"moderation","provider_name":"X"}}}', json: async()=>({}) };
    if (aiMode === '403empty') return { ok:false, status:403, text: async()=>'', json: async()=>({}) };
    if (aiMode === '403leak') return { ok:false, status:403, text: async()=>'bad key sk-or-SECRET', json: async()=>({}) };
    if (aiMode === '403') return { ok:false, status:403, text: async()=>'{"error":{"message":"Access denied. Please check your network settings."}}', json: async()=>({}) };
    if (aiMode === '401') return { ok:false, status:401, json: async()=>({}) };
    if (aiMode === '429') return { ok:false, status:429, json: async()=>({}) };
    if (aiMode === 'badjson') return { ok:true, status:200, json: async()=>({choices:[{message:{content:'{"score": 80, "response": "Привет! Сделаю"}'.slice(0,40)}}]}) };
    return { ok:true, status:200, json: async()=>({choices:[{message:{content:'{"score": 91, "response": "Здравствуйте! Посмотрел задачу, сделаю."}'}}]}) };
  }
  const body = JSON.parse(opts.body);
  if (tgMode === '400') return { ok:false, status:400, json: async()=>({ok:false, description:'Bad Request'}) };
  if (tgMode === '500') return { ok:false, status:500, json: async()=>({ok:false, description:'Server error'}) };
  if (tgMode === '429') return { ok:false, status:429, json: async()=>({ok:false, description:'Too Many', parameters:{retry_after:5}}) };
  tgSent.push(body.text);
  return { ok:true, status:200, json: async()=>({ok:true}) };
};
const reset = (s = {}) => { for (const k in store) delete store[k]; store.settings = Object.assign({ telegramToken:'T', telegramId:'1', groqKey:'gsk_K', keywords:'бот', isMonitoring:true }, s); tgSent=[]; geminiBodies=[]; tgMode='ok'; aiMode='ok'; };
const mk = (id, extra={}) => Object.assign({ id: String(id), title:'Нужен бот', description:'Нужен бот для Telegram', price:'5000 ₽', url:'https://kwork.ru/projects/'+id }, extra);
let fails = 0; const check = (name, cond) => { console.log((cond?'PASS':'FAIL')+' - '+name); if(!cond) fails++; };

(async () => {
  // 1. Конкурентность: один заказ из 3 источников одновременно + flush
  reset();
  await Promise.all([ processOrdersList([mk(1)],'Kwork'), processOrdersList([mk(1)],'Freelance.ru'), processOrdersList([mk(1),mk(1)],'Kwork'), flushPendingTelegram() ]);
  check('1 заказ при 4 параллельных вызовах -> 1 сообщение', tgSent.length === 1);
  check('и 1 запрос к ИИ', geminiBodies.length === 1);

  // 1b. Тот же URL под другим id
  await processOrdersList([mk(99, {url:'https://kwork.ru/projects/1?ref=x#top'})], 'Kwork');
  check('тот же URL с другим id не дублируется', tgSent.length === 1);

  // 2. ИИ 429 -> базовое сообщение без блока ИИ
  reset(); aiMode = '429';
  await processOrdersList([mk(2)], 'Kwork');
  check('ИИ 429: сообщение отправлено', tgSent.length === 1);
  check('ИИ 429: нет блока ИИ и текста ошибки', !tgSent[0].includes('ИИ-ОТКЛИК') && !/не удалось|Ошибка/i.test(tgSent[0]));
  check('ИИ 429: aiStatus=failed', store.orderRecords['2'].aiStatus === 'failed');

  // 3. ИИ завис -> таймаут
  reset(); aiMode = 'hang';
  const t0 = Date.now(); await processOrdersList([mk(3)], 'Kwork');
  check('ИИ завис: таймаут сработал (<2с в тесте) и заказ отправлен', Date.now()-t0 < 2000 && tgSent.length === 1 && !tgSent[0].includes('ИИ-ОТКЛИК'));

  // 4. ИИ выключен
  reset({ useAiAnalysis:false });
  await processOrdersList([mk(4)], 'Kwork');
  check('useAiAnalysis=false: к Groq не обращаемся', geminiBodies.length === 0);
  check('useAiAnalysis=false: заказ отправлен без блока ИИ', tgSent.length === 1 && !tgSent[0].includes('ИИ-ОТКЛИК') && store.orderRecords['4'].aiStatus === 'skipped');

  // 5. Обрезка ТЗ и лимит Telegram
  reset();
  await processOrdersList([mk(5, { description: 'бот ' + 'я'.repeat(6000) })], 'Kwork');
  const prompt = geminiBodies[0].messages[1].content;
  const descInPrompt = prompt.match(/<order_description>([\\s\\S]*)<\\/order_description>/)[1];
  check('ТЗ в промпте <= 1500 символов', descInPrompt.length <= 1500);
  check('Сообщение Telegram <= 4096', tgSent[0].length <= 4096);

  // 5b. Формат запроса к Groq
  check('Groq: URL, Bearer-ключ в заголовке, json_object, модель', geminiBodies[0].__url === 'https://api.groq.com/openai/v1/chat/completions' && geminiBodies[0].__auth === 'Bearer gsk_K' && geminiBodies[0].response_format.type === 'json_object' && !!geminiBodies[0].model);

  // 6. Кривой JSON от ИИ
  reset(); aiMode = 'badjson';
  await processOrdersList([mk(6)], 'Kwork');
  check('обрубленный JSON не показывается пользователю как "{"', tgSent.length === 1 && !tgSent[0].includes('{"score"'));

  // 6b. Неверный ключ (401) -> заказ всё равно уходит без ИИ
  reset(); aiMode = '401';
  await processOrdersList([mk(61)], 'Kwork');
  check('Groq 401: заказ отправлен без ИИ-блока', tgSent.length === 1 && !tgSent[0].includes('ИИ-ОТКЛИК'));

  // 7. Telegram 400 -> FAILED без повторов; 500 -> очередь, затем успех ровно 1 раз
  reset(); tgMode = '400';
  await processOrdersList([mk(7)], 'Kwork');
  check('Telegram 400: FAILED, не в очереди', store.orderRecords['7'].status === 'TELEGRAM_FAILED' && !(store.pendingTelegram||[]).includes('7'));

  reset(); tgMode = '500';
  await processOrdersList([mk(8)], 'Kwork');
  check('Telegram 500: заказ в очереди, не потерян', store.orderRecords['8'].status === 'TELEGRAM_QUEUED' && store.pendingTelegram.includes('8'));
  tgMode = 'ok'; store.orderRecords['8'].nextRetryAt = 0;
  await Promise.all([flushPendingTelegram(), flushPendingTelegram()]);
  check('повтор после сбоя: доставлено ровно 1 раз', tgSent.length === 1 && store.orderRecords['8'].status === 'TELEGRAM_SENT');
  check('после доставки очередь пуста', store.pendingTelegram.length === 0);
  check('Groq вызван 1 раз (отклик переиспользован при повторе)', geminiBodies.length === 1);

  // 8. Осиротевшая запись (воркер убит) восстанавливается
  reset();
  store.orderRecords = { '9': { id:'9', source:'Kwork', title:'Бот', description:'бот', price:'1', url:'https://kwork.ru/projects/9', status:'AI_PENDING', discoveredAt: Date.now() } };
  await flushPendingTelegram();
  check('осиротевший AI_PENDING заказ доставлен', tgSent.length === 1 && store.orderRecords['9'].status === 'TELEGRAM_SENT');

  // 9. Фильтр: регистр, окончания, ё, фразы
  const M = (text, kw) => matchKeywordInText(text, kw);
  check('регистр: "Бот" ~ "НУЖЕН БОТ"', M('НУЖЕН БОТ ДЛЯ TELEGRAM', 'Бот'));
  check('окончания: бот ~ боты/ботов/ботами', M('нужны боты', 'бот') && M('разработка ботов', 'бот') && M('с ботами', 'бот'));
  check('окончания: сайт ~ сайта/сайтов', M('Доработка сайта', 'сайт') && M('много сайтов', 'сайт'));
  check('окончания: верстка ~ верстку/верстки/верстке', M('нужна верстку лендинга', 'верстка') && M('услуги верстки', 'верстка') && M('в верстке', 'верстка'));
  check('окончания: телеграм ~ телеграмм', M('бот в телеграмм', 'телеграм'));
  check('ё/е', M('всё переделать', 'все'));
  check('не ловит лишнего: бот !~ ботинки/ботаника', !M('купить ботинки', 'бот') && !M('ботаника', 'бот'));
  check('короткие: js ~ JS-разработчик, но !~ json', M('JS-разработчик', 'js') && !M('нужен json', 'js'));
  check('латиница: css ~ CSS3, react ~ ReactJS, но react !~ reactive', M('CSS3', 'css') && M('ReactJS', 'react') && !M('reactive', 'react'));
  check('дефис: чат-бот ~ чат-ботов; telegram ~ Telegram-бот', M('разработка чат-ботов', 'чат-бот') && M('Telegram-бот', 'telegram'));
  check('фраза: "сайт под ключ" ~ "сайта под ключ", но !~ "сайт для ключа"', M('сайта под ключ', 'сайт под ключ') && !M('сайт для ключа', 'сайт под ключ'));
  check('спецсимволы в ключе не ломают regex', !M('что-то', 'c++ (test') );

  // 10. Перепроверка ранее отфильтрованных после смены ключевых слов
  reset({ keywords: 'python' });
  await processOrdersList([mk(100, { title: 'Доработка сайта', description: 'правки на Bitrix' })], 'Kwork');
  check('не подошёл -> FILTERED_OUT с причиной', store.orderRecords['100'].status === 'FILTERED_OUT' && store.orderRecords['100'].filterReason === 'нет ключевых слов' && tgSent.length === 0);
  check('в логе есть сводка по отфильтрованным', store.logs.some(l => l.op === 'summary' && l.msg.includes('нет ключевых слов')));
  store.settings.keywords = 'сайт';
  await processOrdersList([mk(100, { title: 'Доработка сайта', description: 'правки на Bitrix' })], 'Kwork');
  check('после смены фильтра заказ найден и отправлен 1 раз', tgSent.length === 1 && store.orderRecords['100'].status === 'TELEGRAM_SENT');
  await processOrdersList([mk(100, { title: 'Доработка сайта', description: 'правки на Bitrix' })], 'Kwork');
  check('повторный проход не шлёт дубль', tgSent.length === 1);

  // 11. Честная диагностика 403
  reset(); aiMode = '403';
  await processOrdersList([mk(110)], 'Kwork');
  const l403 = store.logs.filter(l => l.source === 'ai').pop().msg;
  check('403: в логе настоящий ответ сервера и причина "сеть", а не "неверный ключ"', l403.includes('Access denied') && l403.includes('по сети') && !l403.includes('неверный'));
  check('403: заказ всё равно отправлен без ИИ-блока', tgSent.length === 1 && !tgSent[0].includes('ИИ-ОТКЛИК'));

  // 12. Провайдеры: OpenRouter (для РФ), старый формат Groq, свой API
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X', groqKey: undefined });
  await processOrdersList([mk(120)], 'Kwork');
  const b0 = geminiBodies[0];
  check('OpenRouter: URL /api/v1/chat/completions, Bearer-ключ, модель :free', b0.__url === 'https://openrouter.ai/api/v1/chat/completions' && b0.__auth === 'Bearer sk-or-X' && b0.model.endsWith(':free'));
  check('OpenRouter: без response_format (не все модели его поддерживают)', b0.response_format === undefined);
  check('OpenRouter: отклик ИИ дошёл в Telegram', tgSent.length === 1 && tgSent[0].includes('ИИ-ОТКЛИК'));

  reset({ aiProvider:'openrouter', aiKey:'sk-or-X', aiModel:'qwen/some-model:free' });
  await processOrdersList([mk(121)], 'Kwork');
  check('Своя модель из настроек используется', geminiBodies[0].model === 'qwen/some-model:free');

  reset({ groqKey:'gsk_OLD', aiProvider: undefined, aiKey: undefined });
  await processOrdersList([mk(122)], 'Kwork');
  check('Старый формат (только groqKey) продолжает работать на Groq', geminiBodies[0].__url.startsWith('https://api.groq.com/') && geminiBodies[0].__auth === 'Bearer gsk_OLD');

  reset({ aiProvider:'openrouter', aiKey: undefined, groqKey: 'gsk_STALE' });
  await processOrdersList([mk(123)], 'Kwork');
  check('Ключ Groq НЕ утекает на другой провайдер', geminiBodies.length === 0 && tgSent.length === 1);

  reset({ aiProvider:'custom', aiKey:'k', aiBaseUrl:'http://insecure.example/v1', aiModel:'m' });
  await processOrdersList([mk(124)], 'Kwork');
  check('custom с http:// отклонён (ключ не уходит по открытому каналу), заказ доставлен без ИИ', geminiBodies.length === 0 && tgSent.length === 1 && store.logs.some(l => l.op === 'bad_config'));

  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = '402';
  await processOrdersList([mk(125)], 'Kwork');
  check('402: понятная причина в логе, заказ доставлен', store.logs.filter(l => l.source === 'ai').pop().msg.includes('не хватает средств') && tgSent.length === 1);

  // 13. Диагностика ошибок ИИ и кнопка "Проверить ИИ"
  reset({ aiProvider:'openrouter', aiKey:'sk-or-SECRET' }); aiMode = '403meta';
  await processOrdersList([mk(130)], 'Kwork');
  let lg = store.logs.filter(l => l.source === 'ai').pop().msg;
  check('403: в логе message + metadata + server', lg.includes('Provider blocked') && lg.includes('moderation') && lg.includes('server: cloudflare'));

  reset({ aiProvider:'openrouter', aiKey:'sk-or-SECRET' }); aiMode = '403empty';
  await processOrdersList([mk(131)], 'Kwork');
  lg = store.logs.filter(l => l.source === 'ai').pop().msg;
  check('403 с пустым телом: это явно сказано в логе', lg.includes('тело ответа пустое'));

  reset({ aiProvider:'openrouter', aiKey:'sk-or-SECRET' }); aiMode = '403leak';
  await processOrdersList([mk(132)], 'Kwork');
  lg = store.logs.filter(l => l.source === 'ai').pop().msg;
  check('ключ из ответа сервера скрыт в логе', !lg.includes('sk-or-SECRET') && lg.includes('***'));

  reset({ aiProvider:'openrouter', aiKey:'sk-or-SECRET' }); aiMode = 'ok';
  let r = await testAiConnection();
  check('Проверить ИИ: успех, виден пример отклика', r.ok === true && r.text.includes('отвечает') && r.text.includes('Пример отклика'));
  aiMode = '403meta'; r = await testAiConnection();
  check('Проверить ИИ: ошибка показывает HTTP 403 и причину, без ключа', r.ok === false && r.text.includes('403') && r.text.includes('Provider blocked') && !r.text.includes('sk-or-SECRET'));
  reset({ aiProvider:'openrouter', aiKey:'' }); r = await testAiConnection();
  check('Проверить ИИ: без ключа — понятное сообщение', r.ok === false && r.text.includes('API-ключ'));

  // 14. "Думающие" модели и честная кнопка "Проверить ИИ"
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'think';
  await processOrdersList([mk(140)], 'Kwork');
  check('думающая модель: 1-й запрос пустой (length) -> 2-й с max_tokens 4096, отклик получен', geminiBodies.length === 2 && geminiBodies[1].max_tokens === 4096 && tgSent.length === 1 && tgSent[0].includes('ИИ-ОТКЛИК'));
  check('для OpenRouter запрос отключает рассуждения (reasoning.enabled=false)', geminiBodies[0].reasoning && geminiBodies[0].reasoning.enabled === false);

  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'reason400';
  await processOrdersList([mk(141)], 'Kwork');
  check('модель не знает параметр reasoning (400) -> повтор без него, отклик получен', geminiBodies.length === 2 && geminiBodies[1].reasoning === undefined && tgSent[0].includes('ИИ-ОТКЛИК'));

  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'emptyAlways';
  await processOrdersList([mk(142)], 'Kwork');
  check('всегда пусто: ровно 2 попытки, заказ доставлен без ИИ-блока', geminiBodies.length === 2 && tgSent.length === 1 && !tgSent[0].includes('ИИ-ОТКЛИК'));
  r = await testAiConnection();
  check('Проверить ИИ при пустом ответе — НЕ зелёная, с подсказкой про модель', r.ok === false && r.text.includes('пустой ответ') && r.text.includes('instruct'));

  // 15. Источники можно отключать
  reset({ sourceFreelance: false });
  await processOrdersList([mk(150)], 'Freelance.ru');
  check('Freelance.ru отключён: заказы из него не обрабатываются', tgSent.length === 0 && !store.orderRecords);
  await processOrdersList([mk(151)], 'Kwork');
  check('Kwork включён: работает как обычно', tgSent.length === 1);

  // 16. Анализ ИИ в Telegram + правила отклика в промпте
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X', aiProfile:'Делаю сайты на WordPress и Tilda', keywords:'лендинг' }); aiMode = 'full';
  await processOrdersList([mk(160, { title:'Лендинг на Wordpress для СТО', description:'Нужен лендинг для автосервиса, 5 блоков, хостинг есть' })], 'Kwork');
  const m16 = tgSent[0];
  check('в Telegram есть блок "Анализ ИИ" с текстом анализа', m16.includes('Анализ ИИ') && m16.includes('В ТЗ нет списка услуг'));
  check('в Telegram есть риски (максимум 3) и сложность', m16.includes('Прояснить') && m16.includes('Нет контента и фото') && m16.includes('Не указаны сроки') && m16.includes('лишний 3') && !m16.includes('лишний 4') && m16.includes('Сложность:</b> средняя'));
  check('оценка, отклик и ссылка на месте', m16.includes('95/100') && m16.includes('ИИ-ОТКЛИК'));
  const sys16 = geminiBodies[0].messages[0].content, usr16 = geminiBodies[0].messages[1].content;
  check('промпт: «вы», «Здравствуйте», запрет выдумывать и лести', sys16.includes('на «вы»') && sys16.includes('Здравствуйте') && sys16.includes('не придумывай') && sys16.includes('без') && sys16.includes('лести'));
  check('промпт: «О себе» из настроек передан ИИ', sys16.includes('Делаю сайты на WordPress и Tilda'));
  check('промпт: бюджет передан', usr16.includes('<order_budget>5000'));
  check('запись заказа хранит анализ и риски', store.orderRecords['160'].aiAnalysis.includes('лендинг') && store.orderRecords['160'].aiRisks.length === 3 && store.orderRecords['160'].aiEffort === 'medium');

  // описание == название -> честная пометка и подсказка ИИ, что описания нет
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'full';
  await processOrdersList([mk(161, { title:'Лендинг для СТО на бот', description:'Лендинг для СТО на бот' })], 'Kwork');
  check('описание = название: в сообщении пометка вместо дубля', tgSent[0].includes('виден только заголовок') && !tgSent[0].split('ТЗ заказа:</b>')[1].trim().startsWith('Лендинг для СТО'));
  check('ИИ предупреждён, что описания нет', geminiBodies[0].messages[1].content.includes('описание не указано'));

  // без профиля — в промпте нет строки "О фрилансере"
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'full';
  await processOrdersList([mk(162)], 'Kwork');
  check('без профиля строка "О фрилансере" не добавляется', !geminiBodies[0].messages[0].content.includes('О фрилансере'));

  // обрубленный JSON: достаём response и analysis
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'truncResp';
  await processOrdersList([mk(163)], 'Kwork');
  check('обрубленный JSON: отклик и анализ вытащены, сырой JSON не показан', tgSent.length === 1 && tgSent[0].includes('Здравствуйте! Сделаю лендинг.') && tgSent[0].includes('Коротко') && !tgSent[0].includes('"score"'));

  // старый формат ответа (только score + response) не ломается
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'ok';
  await processOrdersList([mk(164)], 'Kwork');
  check('ответ без analysis/risks: сообщение собирается, блока анализа нет', tgSent.length === 1 && tgSent[0].includes('ИИ-ОТКЛИК') && !tgSent[0].includes('Анализ ИИ') && !tgSent[0].includes('Прояснить'));

  // длинный анализ не ломает лимит 4096
  reset({ aiProvider:'openrouter', aiKey:'sk-or-X' }); aiMode = 'full';
  await processOrdersList([mk(165, { description: 'бот ' + 'я'.repeat(6000) })], 'Kwork');
  check('с анализом и рисками сообщение всё равно <= 4096', tgSent[0].length <= 4096);

  // 17. Kwork: восстановление после обрывов VPN/сети
  const ERR = 'chrome-error://chromewebdata/';
  const LIST = 'https://kwork.ru/projects?c=11';
  const resetTabs = (url, status = 'complete') => { tabsState.length = 0; tabsState.push({ id: 1, url, status }); updListeners.clear(); tabBehavior = (tab, kind, u) => ({ url: u }); };

  reset(); resetTabs(LIST);
  await checkKwork();
  check('Kwork в норме: заказ найден и отправлен, серия сбоев = 0', tgSent.length === 1 && (store.kworkHealth || {}).streak === 0 && store.lastKworkUrl === LIST);

  reset(); resetTabs(LIST); store.lastKworkUrl = LIST;
  tabBehavior = (tab, kind, u) => (kind === 'reload' ? { url: ERR } : { url: u });
  await checkKwork();
  check('обрыв при перезагрузке (страница ошибки): со 2-й попытки открыт последний рабочий адрес, заказ получен', tgSent.length === 1 && tabsState[0].url === LIST && store.logs.some(l => l.op === 'kwork_recover') && store.logs.some(l => l.op === 'kwork_recovered'));

  reset(); resetTabs(LIST); store.lastKworkUrl = LIST;
  tabBehavior = (tab, kind, u) => (kind === 'reload' ? { hang: true } : { url: u });
  await checkKwork();
  check('страница зависла в "loading": таймаут, затем переход на адрес — Kwork снова отвечает', tgSent.length === 1 && tabsState[0].status === 'complete' && tabsState[0].url === LIST);

  reset(); resetTabs(ERR); store.kworkTabId = 1; store.lastKworkUrl = LIST;
  await checkKwork();
  check('вкладка уже на странице ошибки (не совпадает с kwork.ru): находится по сохранённому id и оживает', tgSent.length === 1 && tabsState[0].url === LIST);

  reset({ autoOpenTabs: false }); resetTabs('https://example.com/'); store.kworkTabId = 1; store.lastKworkUrl = LIST;
  await checkKwork();
  check('вкладку, которую ты увёл на другой сайт, радар не трогает', tabsState[0].url === 'https://example.com/' && tgSent.length === 0);

  // долгая недоступность: предупреждение ровно один раз, затем сообщение о восстановлении
  reset(); resetTabs(LIST); store.lastKworkUrl = LIST;
  tabBehavior = () => ({ url: ERR });
  await checkKwork(); await checkKwork();
  check('2 проверки без ответа: предупреждения ещё нет', tgSent.length === 0 && store.kworkHealth.streak === 2);
  await checkKwork();
  check('3-я проверка подряд без ответа: одно предупреждение в Telegram', tgSent.length === 1 && tgSent[0].includes('Kwork не отвечает') && store.kworkHealth.alerted === true);
  await checkKwork();
  check('4-я: повторного предупреждения нет (не спамим)', tgSent.length === 1);
  check('в логе причина: ошибка загрузки + вкладка', store.logs.some(l => l.op === 'kwork_empty' && l.msg.includes('Вкладка')));
  tabBehavior = (tab, kind, u) => ({ url: u });
  await checkKwork();
  check('Kwork вернулся: сообщение "снова отвечает" + заказ доставлен, серия сброшена', tgSent.some(m => m.includes('снова отвечает')) && tgSent.some(m => m.includes('НАЙДЕН НОВЫЙ ЗАКАЗ')) && store.kworkHealth.streak === 0 && store.kworkHealth.alerted === false);

  // вкладки Kwork нет вообще и автооткрытие выключено — это не "сбой Kwork"
  reset({ autoOpenTabs: false }); tabsState.length = 0;
  await checkKwork();
  check('нет вкладки Kwork: серия сбоев не растёт, предупреждений нет', !(store.kworkHealth && store.kworkHealth.streak) && tgSent.length === 0);

  console.log(fails === 0 ? '\\nALL PASSED' : '\\nFAILURES: '+fails);
})();
`;
new Function(harness.split('(async () => {')[0] + src + '\n(async () => {' + harness.split('(async () => {').slice(1).join('(async () => {'))();
