const state = {
  running: false,
  rows: []
};

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadCsvBtn = document.getElementById('downloadCsvBtn');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const statusText = document.getElementById('statusText');
const countText = document.getElementById('countText');
const maxResultsInput = document.getElementById('maxResults');
const includePlaceIdInput = document.getElementById('includePlaceId');

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

startBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes('google.com/maps')) {
    setStatus('Abrí Google Maps para iniciar el scraping.');
    return;
  }

  state.running = true;
  state.rows = [];
  setButtons();
  setStatus('Iniciando extracción...');
  countText.textContent = '0';

  chrome.tabs.sendMessage(tab.id, {
    type: 'GEOSCOUT_START',
    payload: {
      maxResults: Number(maxResultsInput.value) || 120,
      includePlaceId: includePlaceIdInput.checked
    }
  });
});

stopBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'GEOSCOUT_STOP' });
});

downloadCsvBtn.addEventListener('click', downloadCsv);

copyJsonBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(state.rows, null, 2));
  setStatus('JSON copiado al portapapeles.');
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg?.type?.startsWith('GEOSCOUT_')) return;

  if (msg.type === 'GEOSCOUT_PROGRESS') {
    setStatus(msg.payload.status);
    countText.textContent = String(msg.payload.count || 0);
  }

  if (msg.type === 'GEOSCOUT_DONE') {
    state.running = false;
    state.rows = msg.payload.rows || [];
    countText.textContent = String(state.rows.length);
    setStatus(msg.payload.status || 'Extracción finalizada.');
    setButtons();
  }

  if (msg.type === 'GEOSCOUT_STOPPED') {
    state.running = false;
    setStatus('Extracción detenida por el usuario.');
    setButtons();
  }
});

setButtons();
