/* ============================================================================
   LOOKSSCAN · bot.js · v1.0
   Движок Telegram-бота. Работает из браузера (GitHub Pages + console.html):
   long polling напрямую к api.telegram.org, без сервера и вебхуков.

   Подключение:
     <script src="bot.js"></script>
     var bot = LMXBot.create({
       token: '123:AA…',
       appUrl: 'https://<login>.github.io/Luxface-app/',
       onEvent: function(e){ console.log(e.kind, e.title, e.detail); },
       onStats: function(s){ console.log(s); },
       onUsers: function(list){ console.log(list.length); }
     });
     bot.check().then(function(){ bot.start(); });

   ВАЖНО: кнопка сканера — reply keyboard (не inline), потому что
   Telegram.WebApp.sendData() доставляется боту только из keyboard-кнопки.
   ============================================================================ */
(function (root) {
'use strict';

var VERSION = '1.0';
var LS_KEY = 'looksscan.bot.v1';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function r2(x) { return Math.round(x * 100) / 100; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function validUrl(u) { return /^https:\/\/[^\s]+$/i.test(u || ''); }
function defaultSettings() { return { sex: 'm', out: 'chat', detail: 'full' }; }

var VALID = { sex: ['m', 'f'], out: ['app', 'chat', 'both'], detail: ['brief', 'full'] };

var DEFAULT_TEMPLATES = {
  welcome:
    '📐 <b>LOOKSSCAN</b> — оценка гармонии лица по 108 метрикам.\n\n' +
    '4 пиллара: HARM · MISC · ANGU · DIMO.\n' +
    'Фото обрабатывается <b>только на твоём устройстве</b> и никуда не отправляется.\n\n' +
    'Жми кнопку ниже, чтобы открыть сканер 👇',
  help:
    '<b>Как пользоваться</b>\n\n' +
    '1. Открой сканер кнопкой «📐 Открыть оценку».\n' +
    '2. Загрузи анфас: ровный свет, без наклона, волосы убраны.\n' +
    '3. Доведи 9 точек пальцем — AI ставит их сам, но края лица врёт.\n' +
    '4. Пройди MISC / ANGU / DIMO — около 3 минут.\n' +
    '5. Получи скор 1–10 и разбор по каждой метрике.\n\n' +
    'Команды: /app · /settings · /report · /help · /privacy · /id',
  privacy:
    '<b>Приватность</b>\n\n' +
    'Фото живёт в памяти вкладки и удаляется при закрытии. На сервер не отправляется.\n' +
    'В чат уходит только числовой результат — и только по кнопке «Отправить в Telegram».\n' +
    'История сканов хранится локально в браузере телефона.',
  fallback:
    'Я понимаю команды /start, /app, /settings, /help и /privacy.\n\nЧтобы открыть сканер — жми кнопку ниже 👇',
  saved:
    '✅ Результат <b>{score}/10</b> сохранён.\nПоказать в чате: /report',
  noResult:
    'Пока нет сохранённого результата.\nОткрой сканер кнопкой ниже и пройди оценку 👇'
};

var COMMANDS = [
  { command: 'start', description: 'Запустить бота и открыть сканер' },
  { command: 'app', description: 'Открыть Mini App' },
  { command: 'settings', description: 'Пол · вывод · детализация' },
  { command: 'report', description: 'Показать последний результат' },
  { command: 'help', description: 'Как проходить оценку' },
  { command: 'privacy', description: 'Что происходит с фото' },
  { command: 'id', description: 'Мой chat ID' }
];

/* ─────────────────────────── ФОРМАТ ОТЧЁТА ─────────────────────────── */
function bar(v) {
  var n = Math.max(0, Math.min(10, Math.round(v)));
  return '█'.repeat(n) + '░'.repeat(10 - n);
}
function formatReport(p, detail) {
  detail = detail || 'full';
  var score = Number(p.score) || 0;
  var pillars = p.pillars || {};
  var names = { HARM: 'Гармония', MISC: 'Фичи', ANGU: 'Угловатость', DIMO: 'Диморфизм' };
  var icons = { HARM: '🟢', MISC: '🟣', ANGU: '🟠', DIMO: '🔴' };
  var weights = { HARM: 32, MISC: 26, ANGU: 22, DIMO: 20 };
  var L = [];
  L.push('📐 <b>LOOKSSCAN · РЕЗУЛЬТАТ</b>');
  L.push('');
  L.push('🎯 <b>SCORE: ' + score.toFixed(2) + '/10</b>');
  if (p.band) L.push('🏷 ' + esc(p.band));
  L.push('');
  L.push('━━━ <b>ПИЛЛАРЫ</b> ━━━');
  ['HARM', 'MISC', 'ANGU', 'DIMO'].forEach(function (k) {
    var v = Number(pillars[k]) || 0;
    L.push(icons[k] + ' <b>' + k + '</b> ' + v.toFixed(2) + '  ' + bar(v) + '  ' + weights[k] + '%');
  });
  var worst = Array.isArray(p.worst) ? p.worst : [];
  if (worst.length) {
    L.push('');
    L.push('⚠️ <b>ЗОНЫ РОСТА</b>');
    worst.slice(0, detail === 'full' ? 10 : 3).forEach(function (w, i) {
      L.push((i + 1) + '. ' + esc(w.ru || w.id) + ' · T' + w.tier + ' · −' + r2(Number(w.loss) || 0));
    });
  }
  L.push('');
  L.push('<i>Локальный анализ 108 метрик · развлекательная метрика, не медицинская оценка</i>');
  return L.join('\n');
}

/* ─────────────────────────── ФАБРИКА БОТА ─────────────────────────── */
function create(cfg) {
  cfg = cfg || {};
  var state = {
    token: cfg.token || '',
    appUrl: cfg.appUrl || '',
    btnLabel: cfg.btnLabel || '📐 Открыть оценку',
    pollTimeout: cfg.pollTimeout || 25,
    me: null, running: false, offset: 0, startedAt: 0,
    users: {}, templates: Object.assign({}, DEFAULT_TEMPLATES, cfg.templates || {}),
    stats: { updates: 0, starts: 0, sent: 0, errors: 0, scans: 0 },
    log: []
  };

  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved) {
      if (saved.users) state.users = saved.users;
      if (saved.templates) Object.assign(state.templates, saved.templates);
      if (saved.stats) Object.assign(state.stats, saved.stats);
      if (saved.btnLabel) state.btnLabel = saved.btnLabel;
      if (saved.appUrl && !cfg.appUrl) state.appUrl = saved.appUrl;
      if (saved.token && !cfg.token && cfg.persistToken !== false) state.token = saved.token;
    }
  } catch (e) {}

  var saveT = null, abort = null, backoff = 3000, chain = Promise.resolve();

  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          users: state.users, templates: state.templates, stats: state.stats,
          btnLabel: state.btnLabel, appUrl: state.appUrl,
          token: cfg.persistToken === false ? '' : state.token
        }));
      } catch (e) {}
    }, 250);
  }
  function emit(kind, title, detail) {
    var e = { kind: kind, title: title, detail: detail || '', ts: Date.now() };
    state.log.push(e); if (state.log.length > 500) state.log.shift();
    if (kind === 'err') state.stats.errors++;
    if (cfg.onEvent) try { cfg.onEvent(e); } catch (x) {}
    pushStats(); save();
  }
  function pushStats() { if (cfg.onStats) try { cfg.onStats(Object.assign({}, state.stats)); } catch (x) {} }
  function pushUsers() {
    if (cfg.onUsers) try {
      cfg.onUsers(Object.keys(state.users).map(function (k) { return state.users[k]; })
        .sort(function (a, b) { return b.last - a.last; }));
    } catch (x) {}
    save();
  }

  /* ── API: очередь 40мс, form-urlencoded (без CORS preflight) ── */
  function api(method, params, signal) {
    var run = function () {
      if (!state.token) return Promise.reject(new Error('Токен не задан'));
      var body = new URLSearchParams();
      Object.keys(params || {}).forEach(function (k) {
        var v = params[k]; if (v == null) return;
        body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });
      return fetch('https://api.telegram.org/bot' + state.token + '/' + method, { method: 'POST', body: body, signal: signal })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) {
            var e = new Error(j.description || 'API error');
            e.code = j.error_code; e.retry = j.parameters && j.parameters.retry_after;
            throw e;
          }
          return j.result;
        });
    };
    if (signal) return run();
    var p = chain.then(run, run);
    chain = p.then(function () { return sleep(40); }, function () { return sleep(40); });
    return p;
  }

  async function send(chatId, text, opts) {
    opts = opts || {};
    var p = { chat_id: chatId, text: text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
    if (opts.keyboard) p.reply_markup = opts.keyboard;
    if (opts.silent) p.disable_notification = true;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var m = await api('sendMessage', p);
        state.stats.sent++; pushStats(); save();
        return m;
      } catch (e) {
        if (e.retry && attempt < 2) { await sleep(e.retry * 1000); continue; }
        if (/parse|entities/i.test(e.message) && attempt < 2) { delete p.parse_mode; continue; }
        throw e;
      }
    }
  }

  /* ── Клавиатуры ── */
  function appKeyboard() {
    return { keyboard: [[{ text: state.btnLabel, web_app: { url: state.appUrl } }]], resize_keyboard: true, is_persistent: true };
  }
  function settingsText(u) {
    var s = u.settings;
    return '⚙️ <b>Настройки оценки</b>\n\n' +
      'Пол: <b>' + (s.sex === 'f' ? 'женские идеалы' : 'мужские идеалы') + '</b>\n' +
      'Вывод: <b>' + ({ app: 'только Mini App', chat: 'в чат', both: 'оба варианта' }[s.out] || s.out) + '</b>\n' +
      'Разбор: <b>' + (s.detail === 'full' ? 'полный' : 'краткий') + '</b>\n\nМеняй кнопками ниже:';
  }
  function settingsKeyboard(u) {
    var s = u.settings;
    function mk(cur, v) { return cur === v ? '✅ ' : ''; }
    return { inline_keyboard: [
      [
        { text: mk(s.sex, 'm') + '👨 Мужские', callback_data: 'cfg:sex:m' },
        { text: mk(s.sex, 'f') + '👩 Женские', callback_data: 'cfg:sex:f' }
      ],
      [
        { text: mk(s.out, 'app') + '📱 App', callback_data: 'cfg:out:app' },
        { text: mk(s.out, 'chat') + '💬 Чат', callback_data: 'cfg:out:chat' },
        { text: mk(s.out, 'both') + '🔁 Оба', callback_data: 'cfg:out:both' }
      ],
      [
        { text: mk(s.detail, 'brief') + '⚡ Кратко', callback_data: 'cfg:det:brief' },
        { text: mk(s.detail, 'full') + '📊 Полный', callback_data: 'cfg:det:full' }
      ],
      [{ text: '📐 Открыть сканер', web_app: { url: state.appUrl } }]
    ] };
  }

  /* ── Пользователи ── */
  function upsert(from) {
    if (!from || !from.id) return null;
    var u = state.users[from.id];
    var name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || ('id' + from.id);
    if (!u) {
      u = { id: from.id, name: name, username: from.username || '', status: 'new', starts: 0, scans: 0,
            first: Date.now(), last: Date.now(), note: '', settings: defaultSettings(), lastResult: null };
      state.users[from.id] = u;
    } else {
      u.name = name; u.username = from.username || u.username; u.last = Date.now();
      if (u.status === 'blocked') u.status = 'active';
      if (!u.settings) u.settings = defaultSettings();
    }
    pushUsers();
    return u;
  }
  function tpl(key) { return state.templates[key] || DEFAULT_TEMPLATES[key] || ''; }

  /* ── Отчёт ── */
  async function sendReport(chatId, p, st) {
    st = st || defaultSettings();
    var msg = await send(chatId, formatReport(p, st.detail), { keyboard: appKeyboard() });
    emit('out', 'Отчёт → ' + chatId, 'score ' + (Number(p.score) || 0).toFixed(2));
    return msg;
  }

  /* ── Обработка апдейтов ── */
  function handleUpdate(u) {
    state.stats.updates++;
    if (u.message) handleMessage(u.message);
    else if (u.callback_query) handleCallback(u.callback_query);
    else if (u.my_chat_member) handleMember(u.my_chat_member);
    pushStats(); save();
  }

  function handleMessage(m) {
    var u = upsert(m.from);
    if (m.web_app_data) { handleWebAppData(m, u); return; }
    var txt = (m.text || '').trim();
    if (!txt) { emit('in', 'Медиа/нетекст', 'chat ' + m.chat.id); return; }
    var cmd = txt.split(/\s+/)[0].split('@')[0].toLowerCase();
    emit('in', txt.slice(0, 90), (u ? u.name : '') + ' · chat ' + m.chat.id);
    if (!u) return;

    if (cmd === '/start') {
      u.starts++; u.status = u.status === 'vip' ? 'vip' : 'active'; state.stats.starts++;
      send(m.chat.id, tpl('welcome'), { keyboard: appKeyboard() })
        .then(function () { emit('out', 'Приветствие → ' + u.name, 'кнопка «' + state.btnLabel + '»'); })
        .catch(function (e) { emit('err', 'Ответ не доставлен', e.message); });
    } else if (cmd === '/app') {
      send(m.chat.id, 'Открывай сканер 👇', { keyboard: appKeyboard() })
        .then(function () { emit('out', 'Кнопка сканера → ' + u.name, ''); })
        .catch(function (e) { emit('err', 'Ответ не доставлен', e.message); });
    } else if (cmd === '/settings') {
      send(m.chat.id, settingsText(u), { keyboard: settingsKeyboard(u) })
        .then(function () { emit('out', 'Настройки → ' + u.name, ''); })
        .catch(function (e) { emit('err', 'Ответ не доставлен', e.message); });
    } else if (cmd === '/report') {
      if (u.lastResult && u.lastResult.payload) {
        sendReport(m.chat.id, u.lastResult.payload, u.settings).catch(function (e) { emit('err', 'Отчёт не доставлен', e.message); });
      } else {
        send(m.chat.id, tpl('noResult'), { keyboard: appKeyboard() }).catch(function (e) { emit('err', e.message, ''); });
      }
    } else if (cmd === '/help' || cmd === '/privacy') {
      send(m.chat.id, tpl(cmd.slice(1)))
        .then(function () { emit('out', 'Шаблон ' + cmd + ' → ' + u.name, ''); })
        .catch(function (e) { emit('err', 'Ответ не доставлен', e.message); });
    } else if (cmd === '/id') {
      send(m.chat.id, 'Твой chat ID: <code>' + m.chat.id + '</code>')
        .then(function () { emit('out', 'ID → ' + u.name, String(m.chat.id)); })
        .catch(function (e) { emit('err', 'Ответ не доставлен', e.message); });
    } else {
      send(m.chat.id, tpl('fallback'), { keyboard: appKeyboard() })
        .then(function () { emit('out', 'Fallback → ' + u.name, ''); })
        .catch(function (e) { emit('err', 'Ответ не доставлен', e.message); });
    }
  }

  function handleWebAppData(m, u) {
    var raw = (m.web_app_data && m.web_app_data.data) || '';
    var p;
    try { p = JSON.parse(raw); }
    catch (e) { emit('err', 'web_app_data: не JSON', raw.slice(0, 120)); return; }
    if (!p || p.type !== 'looksscan_result' || typeof p.score !== 'number') {
      emit('err', 'web_app_data: неизвестный формат', raw.slice(0, 120)); return;
    }
    u.scans = (u.scans || 0) + 1; state.stats.scans++;
    u.lastResult = { payload: p, ts: Date.now() };
    emit('in', 'Скан · ' + p.score.toFixed(2) + '/10', u.name + ' · chat ' + m.chat.id);
    pushUsers();
    if (u.settings.out === 'app') {
      send(m.chat.id, tpl('saved').replace('{score}', p.score.toFixed(2)), { silent: true })
        .catch(function (e) { emit('err', 'Подтверждение не доставлено', e.message); });
      return;
    }
    sendReport(m.chat.id, p, u.settings).catch(function (e) { emit('err', 'Отчёт не доставлен', e.message); });
  }

  async function handleCallback(cq) {
    var u = upsert(cq.from), data = cq.data || '';
    emit('in', 'callback · ' + data, u ? u.name : '');
    if (data.indexOf('cfg:') === 0 && u) {
      var parts = data.split(':');
      var key = { sex: 'sex', out: 'out', det: 'detail' }[parts[1]];
      var val = parts[2];
      if (key && VALID[key].indexOf(val) >= 0) {
        u.settings[key] = val; pushUsers();
        await api('answerCallbackQuery', { callback_query_id: cq.id, text: 'Сохранено' }).catch(function () {});
        if (cq.message) {
          await api('editMessageText', {
            chat_id: cq.message.chat.id, message_id: cq.message.message_id,
            text: settingsText(u), parse_mode: 'HTML', reply_markup: settingsKeyboard(u)
          }).catch(function (e) { if (!/not modified/i.test(e.message)) emit('err', 'Настройки не обновились', e.message); });
        }
        emit('sys', 'Настройки обновлены', u.name + ' · ' + key + '=' + val);
      }
    } else {
      await api('answerCallbackQuery', { callback_query_id: cq.id, text: 'Открывай сканер 📐' }).catch(function () {});
    }
  }

  function handleMember(mc) {
    var u = upsert(mc.from);
    var st = mc.new_chat_member && mc.new_chat_member.status;
    if (!u) return;
    if (st === 'kicked' || st === 'left') { u.status = 'blocked'; emit('sys', 'Пользователь заблокировал бота', u.name); }
    else { u.status = u.status === 'vip' ? 'vip' : 'active'; emit('sys', 'Пользователь активен', u.name); }
    pushUsers();
  }

  /* ── Polling ── */
  function loop() {
    if (!state.running) return;
    abort = new AbortController();
    api('getUpdates', {
      offset: state.offset, timeout: state.pollTimeout,
      allowed_updates: ['message', 'callback_query', 'my_chat_member']
    }, abort.signal).then(function (list) {
      if (!state.running) return;
      backoff = 3000;
      if (cfg.onStatus) try { cfg.onStatus('on'); } catch (x) {}
      (list || []).forEach(function (u) {
        state.offset = Math.max(state.offset, u.update_id + 1);
        try { handleUpdate(u); } catch (e) { emit('err', 'Сбой обработки апдейта', e.message); }
      });
      loop();
    }).catch(function (e) {
      if (!state.running || e.name === 'AbortError') return;
      if (e.code === 409) {
        emit('err', '409 Conflict', 'Задан вебхук или запущен второй опрос. Сними вебхук и закрой другие консоли.');
        if (cfg.onStatus) try { cfg.onStatus('conflict'); } catch (x) {}
        stop(true); return;
      }
      if (e.code === 401) {
        emit('err', '401 Unauthorized', 'Токен неверный или отозван');
        if (cfg.onStatus) try { cfg.onStatus('badtoken'); } catch (x) {}
        stop(true); return;
      }
      emit('err', 'Сбой опроса', e.message);
      if (cfg.onStatus) try { cfg.onStatus('reconnect'); } catch (x) {}
      setTimeout(function () { if (state.running) loop(); }, backoff);
      backoff = Math.min(30000, backoff * 1.6);
    });
  }

  function start() {
    if (state.running) return;
    if (!state.token) { emit('err', 'Запуск невозможен', 'Токен не задан'); return; }
    if (!validUrl(state.appUrl)) { emit('err', 'Запуск невозможен', 'Нужна HTTPS-ссылка на Mini App'); return; }
    state.running = true; state.startedAt = Date.now(); state.offset = 0;
    emit('sys', 'Опрос запущен', 'long polling · timeout ' + state.pollTimeout + 's');
    if (cfg.onStatus) try { cfg.onStatus('wait'); } catch (x) {}
    loop();
  }
  function stop(silent) {
    if (!state.running) return;
    state.running = false;
    if (abort) { try { abort.abort(); } catch (e) {} abort = null; }
    if (!silent) emit('sys', 'Опрос остановлен', 'бот больше не отвечает');
    if (cfg.onStatus) try { cfg.onStatus('off'); } catch (x) {}
  }

  /* ── Сервисные методы ── */
  async function check() {
    var me = await api('getMe');
    state.me = me; save();
    emit('sys', 'Бот подключён', '@' + me.username + ' · id ' + me.id);
    var w = await api('getWebhookInfo').catch(function () { return null; });
    if (w && w.url) emit('err', 'Задан вебхук', w.url + ' — long polling не работает. Нажми «Снять вебхук».');
    return me;
  }
  async function setupMenu() {
    if (!validUrl(state.appUrl)) throw new Error('Нужна HTTPS-ссылка на Mini App');
    await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Оценка', web_app: { url: state.appUrl } } });
    emit('sys', 'Меню-кнопка установлена', state.appUrl);
  }
  async function setCommands() {
    await api('setMyCommands', { commands: COMMANDS });
    emit('sys', 'Команды зарегистрированы', COMMANDS.map(function (c) { return '/' + c.command; }).join(' '));
  }
  async function deleteWebhook() {
    await api('deleteWebhook', { drop_pending_updates: false });
    emit('sys', 'Вебхук снят', 'long polling доступен');
  }
  async function broadcast(ids, text, onProgress) {
    var ok = 0, fail = 0;
    for (var i = 0; i < ids.length; i++) {
      try {
        await send(ids[i], text, { keyboard: appKeyboard() }); ok++;
      } catch (e) {
        fail++;
        var u = state.users[ids[i]];
        if (u && /403|blocked/i.test(e.message)) { u.status = 'blocked'; pushUsers(); }
        emit('err', 'Рассылка: ошибка', 'chat ' + ids[i] + ' · ' + e.message);
      }
      if (onProgress) try { onProgress(i + 1, ids.length, ok, fail); } catch (x) {}
      await sleep(120);
    }
    emit('sys', 'Рассылка завершена', 'доставлено ' + ok + ' · ошибок ' + fail);
    return { ok: ok, fail: fail };
  }

  /* ── Публичный API ── */
  var bot = {
    version: VERSION,
    start: start, stop: stop, isRunning: function () { return state.running; },
    api: api, send: send, check: check,
    setupMenu: setupMenu, setCommands: setCommands, deleteWebhook: deleteWebhook,
    sendReport: sendReport, broadcast: broadcast, handleUpdate: handleUpdate,
    setToken: function (t) { state.token = (t || '').trim(); save(); },
    setAppUrl: function (u) { state.appUrl = (u || '').trim(); save(); },
    setBtnLabel: function (s) { state.btnLabel = s || '📐 Открыть оценку'; save(); },
    setPollTimeout: function (n) { state.pollTimeout = Math.max(5, Math.min(50, n | 0)); },
    getMe: function () { return state.me; },
    getStats: function () { return Object.assign({}, state.stats); },
    getLog: function () { return state.log.slice(); },
    getUsers: function () { return Object.keys(state.users).map(function (k) { return state.users[k]; }); },
    getUser: function (id) { return state.users[id] || null; },
    deleteUser: function (id) { delete state.users[id]; pushUsers(); },
    setUserStatus: function (id, st) { var u = state.users[id]; if (u) { u.status = st; pushUsers(); } },
    setUserNote: function (id, n) { var u = state.users[id]; if (u) { u.note = n; save(); } },
    setUserSettings: function (id, patch) { var u = state.users[id]; if (u) { Object.assign(u.settings, patch || {}); pushUsers(); } },
    getTemplates: function () { return Object.assign({}, state.templates); },
    setTemplate: function (key, body) { state.templates[key] = String(body == null ? '' : body); save(); },
    exportData: function () {
      return { app: 'LOOKSSCAN', version: VERSION, exported: new Date().toISOString(),
               me: state.me, appUrl: state.appUrl, btnLabel: state.btnLabel,
               stats: state.stats, users: state.users, templates: state.templates, log: state.log };
    },
    importData: function (data) {
      if (!data || typeof data !== 'object') throw new Error('Некорректный импорт');
      if (data.users) state.users = data.users;
      if (data.templates) Object.assign(state.templates, data.templates);
      if (data.stats) Object.assign(state.stats, data.stats);
      if (data.btnLabel) state.btnLabel = data.btnLabel;
      if (data.appUrl) state.appUrl = data.appUrl;
      pushUsers(); pushStats(); save();
    }
  };
  return bot;
}

/* ─────────────────────────── ЭКСПОРТ + САМОПРОВЕРКА ─────────────────────────── */
function selftest() {
  var demo = {
    type: 'looksscan_result', score: 7.42, band: 'один на сотни',
    pillars: { HARM: 8.70, MISC: 7.77, ANGU: 7.01, DIMO: 7.92 },
    sex: 'm', detail: 'full',
    worst: [{ id: 'esr', ru: 'Eye Separation Ratio', tier: 6, loss: 65.88 }]
  };
  var html = formatReport(demo, 'full');
  return {
    ok: html.indexOf('7.42') >= 0 && html.indexOf('HARM') >= 0 && html.indexOf('ЗОНЫ РОСТА') >= 0,
    version: VERSION, commands: COMMANDS.length, sample: html
  };
}

var LMXBot = {
  VERSION: VERSION, create: create, formatReport: formatReport,
  defaultSettings: defaultSettings, selftest: selftest, COMMANDS: COMMANDS
};
root.LMXBot = LMXBot;
if (typeof module !== 'undefined' && module.exports) module.exports = LMXBot;

})(typeof window !== 'undefined' ? window : this);
