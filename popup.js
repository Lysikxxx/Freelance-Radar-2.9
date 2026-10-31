document.addEventListener('DOMContentLoaded', () => {
  const el = (id) => document.getElementById(id);

  const telegramIdInput = el('telegramId');
  const telegramTokenInput = el('telegramToken');
  const aiProviderSelect = el('aiProvider');
  const aiKeyInput = el('aiKey');
  const aiModelInput = el('aiModel');
  const aiBaseUrlInput = el('aiBaseUrl');
  const aiBaseUrlField = el('aiBaseUrlField');

  // Должно совпадать с AI_PROVIDERS в background.js
  const AI_PRESETS = {
    openrouter: { model: 'meta-llama/llama-3.3-70b-instruct:free', keyHint: 'sk-or-...' },
    deepseek:   { model: 'deepseek-chat', keyHint: 'sk-...' },
    groq:       { model: 'llama-3.3-70b-versatile', keyHint: 'gsk_...' },
    custom:     { model: '', keyHint: 'API key' },
  };
  function applyProviderUi(changed) {
    const p = AI_PRESETS[aiProviderSelect.value] || AI_PRESETS.openrouter;
    aiKeyInput.placeholder = p.keyHint;
    aiModelInput.placeholder = p.model || 'название модели';
    aiBaseUrlField.style.display = aiProviderSelect.value === 'custom' ? 'block' : 'none';
    if (changed) {
      const isDefault = !aiModelInput.value || Object.values(AI_PRESETS).some((x) => x.model === aiModelInput.value);
      if (isDefault) aiModelInput.value = p.model; // свою вручную введённую модель не затираем
    }
  }
  aiProviderSelect.addEventListener('change', () => applyProviderUi(true));
  const minPriceInput = el('minPrice');
  const maxPriceInput = el('maxPrice');
  const keywordsInput = el('keywords');
  const aiProfileInput = el('aiProfile');
  const monitorToggle = el('monitorToggle');
  const autoOpenToggle = el('autoOpenToggle');
  const aiToggle = el('aiToggle');
  const sourceKworkToggle = el('sourceKworkToggle');
  const sourceFreelanceToggle = el('sourceFreelanceToggle');
  const saveBtn = el('saveBtn');
  const runNowBtn = el('runNowBtn');
  const resetBtn = el('resetBtn');
  const clearLogsBtn = el('clearLogsBtn');
  const saveStatus = el('saveStatus');

  const defaultKeywords = "javascript, html, css, сайт под ключ, telegram, бот, верстка, js, wordpress";

  // ---- tabs ----
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      el(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // ---- load settings (supports both the new `settings` object and legacy flat keys) ----
  chrome.storage.local.get(['settings', 'telegramId', 'minPrice', 'maxPrice', 'keywords', 'isMonitoring'], (data) => {
    const s = data.settings || {};
    telegramIdInput.value = s.telegramId ?? data.telegramId ?? '';
    telegramTokenInput.value = s.telegramToken ?? '';
    // Совместимость со старым форматом (settings.groqKey)
    aiProviderSelect.value = s.aiProvider || (s.groqKey ? 'groq' : 'openrouter');
    aiKeyInput.value = s.aiKey ?? s.groqKey ?? '';
    aiModelInput.value = s.aiModel || (AI_PRESETS[aiProviderSelect.value] || {}).model || '';
    aiBaseUrlInput.value = s.aiBaseUrl ?? '';
    applyProviderUi(false);
    minPriceInput.value = s.minPrice ?? data.minPrice ?? '';
    maxPriceInput.value = s.maxPrice ?? data.maxPrice ?? '';
    aiProfileInput.value = s.aiProfile ?? '';
    keywordsInput.value = s.keywords ?? data.keywords ?? defaultKeywords;
    monitorToggle.checked = (s.isMonitoring ?? data.isMonitoring) !== false;
    autoOpenToggle.checked = s.autoOpenTabs !== false;
    aiToggle.checked = s.useAiAnalysis !== false; // по умолчанию включено
    sourceKworkToggle.checked = s.sourceKwork !== false;
    sourceFreelanceToggle.checked = s.sourceFreelance !== false;
  });

  function collectSettings() {
    return {
      telegramId: telegramIdInput.value.trim(),
      telegramToken: telegramTokenInput.value.trim(),
      aiProvider: aiProviderSelect.value,
      aiKey: aiKeyInput.value.trim(),
      aiModel: aiModelInput.value.trim(),
      aiBaseUrl: aiBaseUrlInput.value.trim(),
      minPrice: minPriceInput.value ? parseInt(minPriceInput.value, 10) : 0,
      maxPrice: maxPriceInput.value ? parseInt(maxPriceInput.value, 10) : 0,
      aiProfile: aiProfileInput.value.trim(),
      keywords: keywordsInput.value.trim(),
      isMonitoring: monitorToggle.checked,
      autoOpenTabs: autoOpenToggle.checked,
      useAiAnalysis: aiToggle.checked,
      sourceKwork: sourceKworkToggle.checked,
      sourceFreelance: sourceFreelanceToggle.checked,
    };
  }

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({ settings: collectSettings() }, () => {
      saveStatus.innerText = "Настройки сохранены ✓";
      setTimeout(() => { saveStatus.innerText = ""; }, 2000);
    });
  });

  // Проверка ИИ: сохраняет текущие настройки и делает один тестовый запрос,
  // показывая настоящий ответ сервера (ключ скрыт).
  const testAiBtn = el('testAiBtn');
  const aiTestResult = el('aiTestResult');
  testAiBtn.addEventListener('click', () => {
    aiTestResult.style.display = 'block';
    aiTestResult.className = '';
    aiTestResult.innerText = 'Проверяю…';
    chrome.storage.local.set({ settings: collectSettings() }, () => {
      chrome.runtime.sendMessage({ action: 'TEST_AI' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          aiTestResult.className = 'bad';
          aiTestResult.innerText = '✗ Нет ответа от расширения: ' + (chrome.runtime.lastError?.message || 'пусто');
          return;
        }
        aiTestResult.className = res.ok ? 'ok' : 'bad';
        aiTestResult.innerText = res.text;
      });
    });
  });

  runNowBtn.addEventListener('click', () => {
    saveStatus.innerText = "Проверяю биржи…";
    chrome.runtime.sendMessage({ action: 'RUN_CHECK_NOW' }, () => {
      saveStatus.innerText = "Проверка запущена ✓";
      setTimeout(() => { saveStatus.innerText = ""; refreshAll(); }, 1500);
    });
  });

  resetBtn.addEventListener('click', () => {
    // Сброс делает background (через мьютекс), чтобы не конфликтовать с идущей обработкой
    chrome.runtime.sendMessage({ action: "CLEAR_HISTORY" }, () => {
      saveStatus.innerText = "История очищена ✓";
      setTimeout(() => { saveStatus.innerText = ""; }, 2000);
    });
  });

  // Диагностика Kwork: берёт срез страницы с вкладки Kwork и копирует в буфер обмена
  const dumpBtn = el('dumpBtn');
  const dumpResult = el('dumpResult');
  function showDump(ok, msg) {
    dumpResult.style.display = 'block';
    dumpResult.className = ok ? 'ok' : 'bad';
    dumpResult.innerText = msg;
  }
  dumpBtn.addEventListener('click', () => {
    chrome.tabs.query({ url: '*://*.kwork.ru/*' }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        showDump(false, 'Открой Kwork в браузере (список заказов или страницу нужного заказа) и нажми ещё раз.');
        return;
      }
      const tab = tabs.find((t) => t.active) || tabs[0];
      chrome.tabs.sendMessage(tab.id, { action: 'getDebugDump' }, async (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          showDump(false, 'Страница не ответила. Обнови вкладку Kwork (F5) и нажми кнопку ещё раз.');
          return;
        }
        try {
          await navigator.clipboard.writeText(res.text);
          showDump(true, `Скопировано (${res.text.length} символов). Вставь в чат с Claude (Ctrl+V).`);
        } catch (e) {
          showDump(false, 'Не удалось скопировать автоматически. Выдели текст ниже и скопируй вручную:\n\n' + res.text.slice(0, 3000));
        }
      });
    });
  });

  clearLogsBtn.addEventListener('click', () => {
    chrome.storage.local.set({ logs: [] }, refreshLogs);
  });

  // ---- live panels ----
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function refreshStats() {
    chrome.storage.local.get(['stats', 'settings'], (data) => {
      const s = data.stats || {};
      el('statScanned').innerText = s.scanned || 0;
      el('statMatched').innerText = s.matched || 0;
      el('statSent').innerText = s.sent || 0;
      el('statFailed').innerText = s.failed || 0;

      const monitoring = (data.settings || {}).isMonitoring !== false;
      const dot = el('monitorDot');
      dot.className = 'dot ' + (monitoring ? 'on' : 'off');
      el('statusText').innerText = monitoring ? 'мониторинг активен' : 'мониторинг выключен';
    });
  }

  function refreshLogs() {
    chrome.storage.local.get(['logs'], (data) => {
      const logs = (data.logs || []).slice(-40).reverse();
      const list = el('logList');
      if (logs.length === 0) {
        list.innerHTML = '<div class="empty-hint">Пока нет событий</div>';
        return;
      }
      list.innerHTML = logs.map((entry) => `
        <div class="log-row ${entry.level}">
          <span class="log-time">${formatTime(entry.ts)}</span>
          <span class="log-msg">[${entry.source}] ${escapeHtml(entry.msg)}</span>
        </div>
      `).join('');
    });
  }

  function badge(component) {
    if (!component) return '<span class="health-badge unknown">—</span>';
    return component.ok
      ? '<span class="health-badge ok">ONLINE</span>'
      : '<span class="health-badge bad">ERROR</span>';
  }

  function refreshSystem() {
    chrome.storage.local.get(['systemStatus', 'pendingTelegram'], (data) => {
      const st = data.systemStatus || {};
      document.getElementById('healthParser').className = 'health-badge ' + (st.parser ? (st.parser.ok ? 'ok' : 'bad') : 'unknown');
      document.getElementById('healthParser').innerText = st.parser ? (st.parser.ok ? 'ONLINE' : 'ERROR') : '—';
      document.getElementById('healthAi').className = 'health-badge ' + (st.ai ? (st.ai.ok ? 'ok' : 'bad') : 'unknown');
      document.getElementById('healthAi').innerText = st.ai ? (st.ai.ok ? 'ONLINE' : 'ERROR') : '—';
      document.getElementById('healthTelegram').className = 'health-badge ' + (st.telegram ? (st.telegram.ok ? 'ok' : 'bad') : 'unknown');
      document.getElementById('healthTelegram').innerText = st.telegram ? (st.telegram.ok ? 'ONLINE' : 'ERROR') : '—';
      el('pendingCount').innerText = (data.pendingTelegram || []).length;
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function refreshAll() {
    refreshStats();
    refreshLogs();
    refreshSystem();
  }

  refreshAll();
  const intervalId = setInterval(refreshAll, 3000);
  window.addEventListener('unload', () => clearInterval(intervalId));
});
