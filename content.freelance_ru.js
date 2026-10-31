console.log("[Радар] Скрипт-парсер Freelance.ru активен.");

function autoScrollToLoad(times = 3, delay = 400) {
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

function parseFreelanceRuProjects() {
  const projectCards = document.querySelectorAll('.project, [class*="card"], article, .box-shadow');
  const parsedOrders = [];

  projectCards.forEach((card) => {
    try {
      const titleElement = card.querySelector('a[href*="/projects/"], a[href*="/task/"], a[href*="/project/"], h2 a, h3 a, .title a');
      if (!titleElement) return;

      const title = titleElement.textContent.trim();
      const link = titleElement.href;

      if (!title || !link) return;

      const priceElement = card.querySelector('[class*="price"], [class*="cost"], [class*="budget"], [class*="honorarium"]');
      const price = priceElement ? priceElement.textContent.replace(/\s+/g, ' ').trim() : 'Обсуждается индивидуально';

      const descElement = card.querySelector('[class*="description"], [class*="text"], [class*="specs"], p');
      const description = descElement ? descElement.textContent.replace(/\s+/g, ' ').trim() : '';

      const idMatch = link.match(/(\d+)/g);
      const rawId = idMatch ? idMatch.join('_') : btoa(unescape(encodeURIComponent(title)));
      const id = `freelance_ru_${rawId}`;

      parsedOrders.push({
        id,
        source: 'freelance.ru',
        title,
        description: description || title,
        price,
        url: link,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[Freelance Radar] Ошибка парсинга карточки:', err);
    }
  });

  return Array.from(new Map(parsedOrders.map(item => [item.id, item])).values());
}

// 1. Direct request from the background script (on the 2-minute alarm cycle)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getOrders") {
    (async () => {
      await autoScrollToLoad();
      const orders = parseFreelanceRuProjects();
      sendResponse({ orders });
    })();
    return true; // keep the message channel open for the async response above
  }
  return false;
});

// 2. Push new orders as they appear while the tab is open. The page fires a
// lot of unrelated DOM mutations (ads, counters, timers), so calls are
// debounced instead of parsing on every single mutation — this used to spam
// the background script and the activity log with near-duplicate messages.
// Дедупликация на стороне страницы: в background уходят только ещё не отправленные id.
// (Опрос по таймеру через getOrders отдаёт полный список — background сам отфильтрует повторы.)
const pushedIds = new Set();

function sendOrdersToRadar() {
  const fresh = parseFreelanceRuProjects().filter((o) => !pushedIds.has(o.id));
  if (fresh.length === 0) return;
  fresh.forEach((o) => pushedIds.add(o.id));
  chrome.runtime.sendMessage({
    action: 'NEW_ORDERS_DETECTED',
    source: 'freelance.ru',
    data: fresh
  });
}

setTimeout(sendOrdersToRadar, 2000);

let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sendOrdersToRadar, 1500);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
