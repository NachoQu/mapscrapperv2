const state = {
  running: false,
  rows: [],
  maxResults: 120,
  currentCount: 0
};

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadCsvBtn = document.getElementById('downloadCsvBtn');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const statusText = document.getElementById('statusText');
const countText = document.getElementById('countText');
const maxResultsInput = document.getElementById('maxResults');
const includePlaceIdInput = document.getElementById('includePlaceId');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const progressBar = document.querySelector('.progressBar');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(text) {
  statusText.textContent = text;
}

function setButtons() {
  startBtn.disabled = state.running;
  stopBtn.disabled = !state.running;
  downloadCsvBtn.disabled = state.rows.length === 0 || state.running;
  copyJsonBtn.disabled = state.rows.length === 0;
}

function setProgress(current = 0, total = state.maxResults || 1) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.max(0, Number(current) || 0);
  const percent = Math.max(0, Math.min(100, Math.round((safeCurrent / safeTotal) * 100)));
  progressText.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  progressBar.setAttribute('aria-valuenow', String(percent));
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escapeValue = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((key) => escapeValue(row[key])).join(','));
  });
  return lines.join('\n');
}

function downloadCsv() {
  const csv = toCsv(state.rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  chrome.downloads.download({
    url,
    filename: `geoscouting-${stamp}.csv`,
    saveAs: true
  });
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    throw new Error(error?.message || 'No se pudo enviar el mensaje a la pestaña.');
  }
}

async function ensureContentScript(tabId) {
  try {
    await sendToTab(tabId, { type: 'GEOSCOUT_PING' });
    return;
  } catch (_error) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await sendToTab(tabId, { type: 'GEOSCOUT_PING' });
  }
}

startBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes('google.com/maps')) {
    setStatus('Abrí Google Maps para iniciar el scraping.');
    return;
  }

  state.running = true;
  state.rows = [];
  state.currentCount = 0;
  state.maxResults = Number(maxResultsInput.value) || 120;
  setButtons();
  countText.textContent = '0';
  setStatus('Conectando con Google Maps...');
  setProgress(0, state.maxResults);

  try {
    await ensureContentScript(tab.id);
    await sendToTab(tab.id, {
      type: 'GEOSCOUT_START',
      payload: {
        maxResults: state.maxResults,
        includePlaceId: includePlaceIdInput.checked
      }
    });
    setStatus('Scraping iniciado.');
  } catch (error) {
    state.running = false;
    setButtons();
    setStatus(`Error de conexión: ${error.message}`);
  }
});

stopBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    await sendToTab(tab.id, { type: 'GEOSCOUT_STOP' });
  } catch (_error) {
    state.running = false;
    setButtons();
    setStatus('No se encontró proceso activo para detener.');
  }
});

downloadCsvBtn.addEventListener('click', downloadCsv);

copyJsonBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(state.rows, null, 2));
  setStatus('JSON copiado al portapapeles.');
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg?.type?.startsWith('GEOSCOUT_')) return;

  if (msg.type === 'GEOSCOUT_PROGRESS') {
    const count = Number(msg.payload?.count || 0);
    state.currentCount = count;
    setStatus(msg.payload?.status || 'Procesando...');
    countText.textContent = String(count);
    setProgress(count, state.maxResults);
  }

  if (msg.type === 'GEOSCOUT_DONE') {
    state.running = false;
    state.rows = msg.payload?.rows || [];
    countText.textContent = String(state.rows.length);
    setStatus(msg.payload?.status || 'Extracción finalizada.');
    setProgress(state.rows.length, state.maxResults);
    setButtons();
  }

  if (msg.type === 'GEOSCOUT_STOPPED') {
    state.running = false;
    setStatus('Extracción detenida por el usuario.');
    setButtons();
  }

  if (msg.type === 'GEOSCOUT_ERROR') {
    state.running = false;
    setStatus(msg.payload?.status || 'Error durante el scraping.');
    setButtons();
  }
});

setButtons();
setProgress(0, Number(maxResultsInput.value) || 120);
