(() => {
  if (window.__GEOSCOUTING_INSTALLED__) {
    return;
  }
  window.__GEOSCOUTING_INSTALLED__ = true;

  let running = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();

  const sendRuntimeMessage = (message) => {
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup cerrado o sin listener activo.
    });
  };

  const normalizePhoneForWhatsApp = (value) => {
    const digits = (value || '').replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  };

  const firstMatch = (text, regex) => {
    const match = (text || '').match(regex);
    return match ? normalizeText(match[0]) : '';
  };

  const findPanelInfo = () => {
    const panel = document.querySelector('div[role="main"]') || document.body;
    const allLinks = Array.from(panel.querySelectorAll('a[href]'));

    const socialLink =
      allLinks.find((link) =>
        /(facebook|instagram|linkedin|tiktok|youtube|x\.com|twitter|wa\.me)/i.test(link.href)
      )?.href || '';

    const mailto = allLinks.find((link) => link.href.startsWith('mailto:'))?.href || '';
    const bodyText = panel.innerText || '';
    const email =
      mailto.replace(/^mailto:/i, '') ||
      firstMatch(bodyText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

    const phoneText =
      normalizeText(
        panel.querySelector('button[data-item-id^="phone:"]')?.innerText ||
          panel.querySelector('button[aria-label*="Phone"]')?.innerText ||
          panel.querySelector('button[aria-label*="Teléfono"]')?.innerText ||
          ''
      ) || firstMatch(bodyText, /\+?\d[\d\s().-]{7,}\d/g);

    const address =
      normalizeText(
        panel.querySelector('button[data-item-id="address"]')?.innerText ||
          panel.querySelector('button[aria-label*="Address"]')?.innerText ||
          panel.querySelector('button[aria-label*="Dirección"]')?.innerText ||
          ''
      ) || '';

    return {
      email,
      phone: phoneText,
      whatsapp: normalizePhoneForWhatsApp(phoneText),
      social_link: socialLink,
      address
    };
  };

  const waitForSelector = async (selector, timeoutMs = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(250);
    }
    return null;
  };

  const extractCardData = (card) => {
    const name = normalizeText(
      card.querySelector('a .fontHeadlineSmall')?.textContent ||
        card.querySelector('.qBF1Pd')?.textContent ||
        card.querySelector('h3')?.textContent ||
        ''
    );
    const rating = normalizeText(card.querySelector('span[aria-label*="stars"]')?.getAttribute('aria-label') || '');
    const category = normalizeText(card.querySelector('.W4Efsd:nth-child(1) .W4Efsd:last-child')?.textContent || '');
    const mapsLink = card.querySelector('a[href*="/maps/place/"]')?.href || '';

    return { name, rating, category, maps_link: mapsLink };
  };

  const getPlaceIdFromUrl = (url) => {
    const match = (url || '').match(/!1s([^!]+)!/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  const sendProgress = (status, count) => {
    sendRuntimeMessage({
      type: 'GEOSCOUT_PROGRESS',
      payload: { status, count }
    });
  };

  const sendDone = (rows, status) => {
    sendRuntimeMessage({
      type: 'GEOSCOUT_DONE',
      payload: { rows, status }
    });
  };

  const sendError = (status) => {
    sendRuntimeMessage({
      type: 'GEOSCOUT_ERROR',
      payload: { status }
    });
  };

  const scrape = async ({ maxResults, includePlaceId }) => {
    running = true;
    try {
      sendProgress('Buscando panel de resultados...', 0);
      const feed = await waitForSelector('div[role="feed"]', 12000);

      if (!feed) {
        sendDone([], 'No se encontró el listado de resultados de Maps.');
        running = false;
        return;
      }

      const rows = [];
      const seen = new Set();
      let stableScrolls = 0;
      let previousHeight = 0;

      sendProgress('Detectando resultados y haciendo auto-scroll...', 0);

      while (running && rows.length < maxResults) {
        const cards = Array.from(feed.querySelectorAll('div.Nv2PK'));

        if (!cards.length) {
          sendProgress('Esperando resultados visibles...', rows.length);
          await sleep(800);
        }

        for (const card of cards) {
          if (!running || rows.length >= maxResults) break;

          const base = extractCardData(card);
          const uniqueKey = base.maps_link || base.name;
          if (!uniqueKey || seen.has(uniqueKey)) continue;

          seen.add(uniqueKey);
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sendProgress(`Abriendo ficha: ${base.name || 'resultado'}...`, rows.length);
          await sleep(450);

          const clickable = card.querySelector('a[href*="/maps/place/"]') || card;
          clickable.dispatchEvent(new MouseEvent('click', { bubbles: true }));

          await sleep(1300);

          const details = findPanelInfo();
          const mapsLink = window.location.href;
          rows.push({
            name: base.name,
            category: base.category,
            rating: base.rating,
            phone: details.phone,
            whatsapp: details.whatsapp,
            email: details.email,
            social_link: details.social_link,
            address: details.address,
            maps_link: mapsLink,
            place_id: includePlaceId ? getPlaceIdFromUrl(mapsLink) : ''
          });

          sendProgress(`Extrayendo (${rows.length}/${maxResults})...`, rows.length);

          const backButton =
            document.querySelector('button[aria-label="Back"]') ||
            document.querySelector('button[aria-label="Atrás"]') ||
            document.querySelector('button[jsaction*="pane.place.backToList"]');

          if (backButton) {
            backButton.click();
            await sleep(800);
          }
        }

        feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
        sendProgress('Auto-scroll para cargar más resultados...', rows.length);
        await sleep(1100);

        const currentHeight = feed.scrollHeight;
        if (currentHeight === previousHeight) {
          stableScrolls += 1;
        } else {
          stableScrolls = 0;
          previousHeight = currentHeight;
        }

        if (stableScrolls >= 5) {
          sendProgress('No se detectan más resultados nuevos.', rows.length);
          break;
        }
      }

      running = false;
      sendDone(rows, `Extracción finalizada: ${rows.length} leads capturados.`);
    } catch (error) {
      running = false;
      sendError(`Error en scraping: ${error?.message || 'desconocido'}`);
    }
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg?.type) return;

    if (msg.type === 'GEOSCOUT_PING') {
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'GEOSCOUT_START' && !running) {
      scrape(msg.payload || { maxResults: 120, includePlaceId: true });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'GEOSCOUT_STOP') {
      running = false;
      sendRuntimeMessage({ type: 'GEOSCOUT_STOPPED' });
      sendResponse({ ok: true });
    }
  });
})();
