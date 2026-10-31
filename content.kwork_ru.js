console.log("[Радар] Скрипт-парсер Kwork активен.");

// Kwork's listing lazily renders cards as you scroll. A single querySelectorAll
// right after page load only sees whatever is already in the viewport, so a
// few auto-scroll passes are done first to force the rest of the cards to
// mount before we parse.
function autoScrollToLoad(times = 4, delay = 450) {
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      window.scrollTo(0, document.body.scrollHeight);
      i++;
      if (i >= times) {
        window.scrollTo(0, 0);
        setTimeout(resolve, 200);
      } else {
        setTimeout(step, delay);
      }
    };
    step();
  });
}

// ---------------------------------------------------------------------------
// Помощники для поиска карточки и описания.
// Раньше карточкой считался любой элемент с "wants-card" в классе — а так называется и
// заголовок, и отступ, и цена внутри карточки. Из-за этого описание часто не находилось
// (или подставлялся сам заголовок, у которого тоже класс breakwords).
// Теперь карточка определяется по ссылке на заказ: поднимаемся от заголовка вверх, пока
// выше не появится ссылка на ДРУГОЙ заказ, — это и есть границы карточки.
// ---------------------------------------------------------------------------
function projectIdFromHref(href) {
  const m = String(href || '').match(/\/projects\/(\d+)(?:[\/?#]|$)/);
  return m ? m[1] : null;
}

function cleanText(s) {
  return String(s || '').replace(/Показать полностью|Скрыть/gi, ' ').replace(/\s+/g, ' ').trim();
}
// textContent склеивает абзацы без пробелов ("…WordPress.Пять блоков") — ставим пробел после блочных элементов
function spacedText(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('p,div,li,br,h1,h2,h3,h4,h5,h6,tr').forEach((n) => n.after(' '));
  return c.textContent || '';
}
function normText(s) {
  return cleanText(s).toLowerCase();
}

function hasOtherProjectLink(el, id) {
  const links = el.querySelectorAll('a[href*="/projects/"]');
  for (const l of links) {
    const lid = projectIdFromHref(l.getAttribute('href'));
    if (lid && lid !== id) return true;
  }
  return false;
}

function findCardRoot(anchor, id) {
  let el = anchor;
  while (el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) {
    const p = el.parentElement;
    if (p.tagName === 'MAIN' || hasOtherProjectLink(p, id)) break;
    if ((p.textContent || '').length > 8000) break;
    el = p;
  }
  return el;
}

const DESCRIPTION_NOISE = /^(предложени|осталось|опубликован|откликнуться|желаемый бюджет|допустимый бюджет|покупатель|размещен|нанято|покупатель)/i;

function findDescription(root, id, titleText) {
  const projectLinks = Array.from(root.querySelectorAll('a[href*="/projects/"]'))
    .filter((a) => projectIdFromHref(a.getAttribute('href')) === id);
  const priceEls = Array.from(root.querySelectorAll('[class*="price"]'));
  const isForeign = (el) => projectLinks.some((a) => el.contains(a)) || priceEls.some((p) => el.contains(p));
  const title = normText(titleText);

  // 1) Блоки, которые по названию класса похожи на текст описания
  let best = '';
  root.querySelectorAll('[class*="description"], [class*="breakwords"], [class*="text"]').forEach((el) => {
    if (isForeign(el)) return;
    const t = cleanText(spacedText(el));
    if (t.length > best.length && t.toLowerCase() !== title) best = t;
  });
  if (best) return best;

  // 2) Классы незнакомые: берём элемент с самым длинным собственным текстом (не заголовок, не цена, не интерфейс)
  let bestEl = null;
  root.querySelectorAll('*').forEach((el) => {
    if (['SCRIPT', 'STYLE', 'BUTTON', 'A', 'SVG'].includes(el.tagName) || el.closest('a, button')) return;
    if (isForeign(el)) return;
    const own = cleanText(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
    if (own.length < 20 || DESCRIPTION_NOISE.test(own) || own.toLowerCase() === title) return;
    if (own.length > best.length) { best = own; bestEl = el; }
  });

  // Описание могло быть разбито на абзацы внутри одного блока — тогда берём весь блок,
  // но только если в нём нет служебных строк ("Предложений: 3", цена, ссылки)
  if (bestEl && bestEl.parentElement && bestEl.parentElement !== root && !isForeign(bestEl.parentElement)) {
    const parent = bestEl.parentElement;
    const clean = !parent.querySelector('a, button') && Array.from(parent.children).every((c) => !DESCRIPTION_NOISE.test(cleanText(c.textContent)));
    const full = cleanText(spacedText(parent));
    if (clean && full.length > best.length && full.length < 3000) best = full;
  }
  return best;
}

function parseKworkOrders() {
  const orderElements = document.querySelectorAll('.wants-card, .want-card, [class*="wants-card"]');
  const ordersMap = new Map();

  orderElements.forEach(element => {
    const titleElement = element.querySelector('.want-card__header-title a, [class*="header-title"] a, [class*="title"] a, h1 a, h2 a, h3 a');
    const descriptionElement = element.querySelector('.want-card__description-text, .breakwords, [class*="description"]');
    const priceElement = element.querySelector('.want-card__price, [class*="price"]');

    if (titleElement && titleElement.innerText.trim()) {
      const titleText = titleElement.innerText.trim();
      const orderUrl = titleElement.href || window.location.href;

      const uniqueKey = projectIdFromHref(orderUrl) || titleText;

      if (!ordersMap.has(uniqueKey)) {
        let descriptionText = "";
        if (descriptionElement) {
          descriptionText = cleanText(spacedText(descriptionElement) || descriptionElement.innerText);
        }

        const rawPrice = priceElement ? priceElement.innerText.replace(/Желаемый бюджет:\s*до/i, '').trim() : "Бюджет не указан";

        ordersMap.set(uniqueKey, {
          title: titleText,
          description: descriptionText || titleText,
          price: rawPrice,
          url: orderUrl,
          _anchor: titleElement,
          _id: projectIdFromHref(orderUrl),
        });
      }
    }
  });

  // Если описание не прочиталось (пусто или совпало с заголовком) — ищем его в настоящей карточке заказа
  const result = [];
  ordersMap.forEach((o) => {
    if (o._id && normText(o.description) === normText(o.title)) {
      try {
        const root = findCardRoot(o._anchor, o._id);
        const better = findDescription(root, o._id, o.title);
        if (better) o.description = better;
      } catch (e) { /* оставляем как есть */ }
    }
    result.push({ title: o.title, description: o.description, price: o.price, url: o.url });
  });
  return result;
}

// ---- Диагностика: компактный срез страницы (без скриптов/картинок/лишних атрибутов) ----
function compactHtml(el, limit) {
  const c = el.cloneNode(true);
  c.querySelectorAll('script,style,svg,img,picture,noscript,iframe,input,textarea,video,audio').forEach((n) => n.remove());
  c.querySelectorAll('*').forEach((n) => {
    Array.from(n.attributes).forEach((a) => {
      if (!['class', 'href', 'id'].includes(a.name)) n.removeAttribute(a.name);
    });
  });
  return c.outerHTML.replace(/\s+/g, ' ').slice(0, limit);
}

function buildDebugDump() {
  const isDetailPage = /^\/projects\/\d+/.test(location.pathname);
  const report = { page: location.origin + location.pathname };

  if (isDetailPage) {
    // Страница отдельного заказа: основной блок
    const main = document.querySelector('main') || document.body;
    report.kind = 'order-page';
    report.pageHtml = compactHtml(main, 14000);
    return JSON.stringify(report, null, 1);
  }

  report.kind = 'listing';
  const parsed = parseKworkOrders();
  report.ordersParsed = parsed.length;
  report.ordersWithOnlyTitleAsDescription = parsed.filter((o) => normText(o.description) === normText(o.title)).length;
  report.parsedSample = parsed.slice(0, 3).map((o) => ({
    title: o.title,
    descriptionPreview: o.description.slice(0, 120),
    descriptionIsJustTitle: normText(o.description) === normText(o.title),
    price: o.price,
    url: String(o.url).split('?')[0],
  }));

  // HTML настоящих карточек (по ссылке на заказ), в первую очередь тех, где описание не нашлось
  const seen = new Set();
  const roots = [];
  document.querySelectorAll('a[href*="/projects/"]').forEach((a) => {
    const id = projectIdFromHref(a.getAttribute('href'));
    if (!id || seen.has(id) || !a.textContent.trim()) return;
    seen.add(id);
    const root = findCardRoot(a, id);
    const desc = findDescription(root, id, a.textContent);
    roots.push({ root, noDesc: !desc });
  });
  const picked = roots.filter((r) => r.noDesc).concat(roots.filter((r) => !r.noDesc)).slice(0, 2);
  report.cardHtml = picked.map((r) => compactHtml(r.root, 6000));
  return JSON.stringify(report, null, 1);
}

function extractProjectId(url) {
  return projectIdFromHref(url);
}

// Подставляем отклик только если открыта страница ИМЕННО того заказа, для которого он создан
if (window.location.href.includes('/projects/') || window.location.href.includes('/view/')) {
  chrome.storage.local.get(['lastAiResponse', 'lastAiResponseUrl'], (data) => {
    const currentId = extractProjectId(window.location.href);
    const responseId = extractProjectId(data.lastAiResponseUrl);
    if (data.lastAiResponse && currentId && currentId === responseId) {
      setTimeout(() => {
        const responseInput = document.querySelector('textarea.js-project-response-text, textarea[name="comment"], textarea');
        if (responseInput && !responseInput.value) {
          responseInput.value = data.lastAiResponse;
          responseInput.dispatchEvent(new Event('input', { bubbles: true }));
          console.log("[Радар] ИИ-отклик автоматически подставлен в поле ввода!");
        }
      }, 1500);
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getDebugDump") {
    try { sendResponse({ ok: true, text: buildDebugDump() }); }
    catch (e) { sendResponse({ ok: false, text: String(e && e.message || e) }); }
    return false;
  }
  if (request.action === "getOrders") {
    (async () => {
      await autoScrollToLoad();
      const orders = parseKworkOrders();
      sendResponse({ orders });
    })();
    return true; // keep the message channel open for the async response above
  }
  return false;
});
