document.addEventListener('DOMContentLoaded', function () {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentTab = tabs[0];
    const actionButton = document.getElementById('actionButton');
    const downloadCsvButton = document.getElementById('downloadCsvButton');
    const downloadJsonButton = document.getElementById('downloadJsonButton');
    const resultsTable = document.getElementById('resultsTable');
    const filenameInput = document.getElementById('filenameInput');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const statsContainer = document.getElementById('statsContainer');
    const messageElement = document.getElementById('message');

    let currentResults = [];

    if (currentTab && currentTab.url.includes('://www.google.com/maps/search')) {
      messageElement.textContent = "Let's scrape Google Maps!";
      actionButton.disabled = false;
    } else {
      messageElement.innerHTML = '';
      const linkElement = document.createElement('a');
      linkElement.href = 'https://www.google.com/maps/search/';
      linkElement.textContent = 'Go to Google Maps Search.';
      linkElement.target = '_blank';
      messageElement.appendChild(linkElement);

      actionButton.style.display = 'none';
      downloadCsvButton.style.display = 'none';
      downloadJsonButton.style.display = 'none';
      filenameInput.style.display = 'none';
    }

    actionButton.addEventListener('click', function () {
      progressContainer.style.display = 'block';
      statsContainer.style.display = 'block';
      actionButton.disabled = true;
      actionButton.textContent = 'Scraping...';

      let progress = 0;
      const progressInterval = setInterval(function () {
        progress += Math.random() * 10;
        if (progress > 90) progress = 90;
        progressFill.style.width = progress + '%';
        progressText.textContent = 'Extrayendo leads... ' + Math.round(progress) + '%';
      }, 200);

      chrome.scripting.executeScript(
        {
          target: { tabId: currentTab.id },
          func: scrapeData
        },
        function (results) {
          clearInterval(progressInterval);
          progressFill.style.width = '100%';
          progressText.textContent = '¡Completado!';

          actionButton.disabled = false;
          actionButton.textContent = 'Scrape Google Maps';

          while (resultsTable.firstChild) {
            resultsTable.removeChild(resultsTable.firstChild);
          }

          const headers = ['Title', 'Rating', 'Reviews', 'Phone', 'Email', 'Industry', 'Address', 'Website', 'Hours', 'Social Media', 'Lead Score', 'Google Maps Link'];
          const headerRow = document.createElement('tr');
          headers.forEach(function (headerText) {
            const header = document.createElement('th');
            header.textContent = headerText;
            headerRow.appendChild(header);
          });
          resultsTable.appendChild(headerRow);

          if (!results || !results[0] || !results[0].result) return;
          currentResults = results[0].result;

          const totalLeads = currentResults.length;
          const withPhone = currentResults.filter((item) => item.phone).length;
          const withEmail = currentResults.filter((item) => item.email).length;
          const withWeb = currentResults.filter((item) => item.companyUrl).length;
          const withSocial = currentResults.filter((item) => item.socialMedia).length;
          const highValueLeads = currentResults.filter((item) => Number(item.leadScore) >= 8).length;

          const ratings = currentResults
            .filter((item) => item.rating && item.rating !== '0')
            .map((item) => parseFloat(String(item.rating).replace(',', '.')))
            .filter((n) => !Number.isNaN(n));

          const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '0';

          document.getElementById('totalLeads').textContent = String(totalLeads);
          document.getElementById('withPhone').textContent = String(withPhone);
          document.getElementById('withEmail').textContent = String(withEmail);
          document.getElementById('withWeb').textContent = String(withWeb);
          document.getElementById('withSocial').textContent = String(withSocial);
          document.getElementById('highValueLeads').textContent = String(highValueLeads);
          document.getElementById('avgRating').textContent = String(avgRating);

          currentResults.forEach(function (item) {
            const row = document.createElement('tr');
            ['title', 'rating', 'reviewCount', 'phone', 'email', 'industry', 'address', 'companyUrl', 'hours', 'socialMedia', 'leadScore', 'href'].forEach(function (key) {
              const cell = document.createElement('td');
              let value = item[key] || '';

              if (key === 'reviewCount' && value) {
                value = String(value).replace(/\(|\)/g, '');
              }

              if (key === 'leadScore') {
                const score = Number(value);
                if (score >= 8) cell.className = 'lead-high';
                else if (score >= 6) cell.className = 'lead-medium';
                else if (score < 4) cell.className = 'lead-low';
              }

              if (key === 'title' && item.phone && item.email && item.companyUrl) {
                row.style.borderLeft = '4px solid #28a745';
              }

              cell.textContent = String(value);
              row.appendChild(cell);
            });
            resultsTable.appendChild(row);
          });

          if (currentResults.length > 0) {
            downloadCsvButton.disabled = false;
            downloadJsonButton.disabled = false;
          }
        }
      );
    });

    downloadCsvButton.addEventListener('click', function () {
      const csv = tableToCsv(resultsTable);
      let filename = filenameInput.value.trim();
      if (!filename) {
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
        filename = 'google-maps-leads_' + dateStr + '_' + timeStr + '.csv';
      } else {
        filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.csv';
      }
      downloadToFolder(csv, filename, 'text/csv', 'GoogleMapsLeads');
    });

    downloadJsonButton.addEventListener('click', function () {
      const json = JSON.stringify(currentResults, null, 2);
      let filename = filenameInput.value.trim();
      if (!filename) {
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
        const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
        filename = 'google-maps-leads_' + dateStr + '_' + timeStr + '.json';
      } else {
        filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
      }
      downloadToFolder(json, filename, 'application/json', 'GoogleMapsLeads');
    });
  });
});

function scrapeData() {
  const cards = Array.from(document.querySelectorAll('div.Nv2PK, div[role="article"], a[href*="/maps/place/"]')).slice(0, 500);
  const results = [];
  const seen = new Set();

  cards.forEach((cardLike) => {
    const card = cardLike.closest('div.Nv2PK') || cardLike.closest('div[role="article"]') || cardLike;
    const link = card.querySelector('a[href*="/maps/place/"]') || (card.matches('a[href*="/maps/place/"]') ? card : null);
    if (!link) return;

    const href = link.href || '';
    const key = href || (card.textContent || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);

    const text = (card.innerText || card.textContent || '').replace(/\s+/g, ' ').trim();
    const title = (card.querySelector('.fontHeadlineSmall, .qBF1Pd, h3')?.textContent || link.textContent || '').trim();

    const ratingMatch = text.match(/(\d[\.,]\d)\s*(?:stars|estrellas)?/i);
    const reviewMatch = text.match(/\((\d[\d\.,]*)\)/);

    const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

    const websiteLink = Array.from(card.querySelectorAll('a[href]')).find((a) => {
      const u = a.href || '';
      return !u.includes('google.com/maps') && !u.includes('/maps/place/');
    });

    const socialLink = Array.from(card.querySelectorAll('a[href]')).find((a) => /(facebook|instagram|linkedin|tiktok|youtube|x\.com|twitter)/i.test(a.href || ''));

    const segments = text.split('·').map((s) => s.trim()).filter(Boolean);
    const industry = segments.find((s) => s.length > 2 && s.length < 50 && !/\d/.test(s)) || '';

    const addressMatch = text.match(/\d+\s+[\wÀ-ÿ\s.,-]{5,}/);

    const leadScore =
      (phoneMatch ? 3 : 0) +
      (emailMatch ? 3 : 0) +
      (websiteLink ? 2 : 0) +
      (socialLink ? 1 : 0) +
      (ratingMatch && parseFloat(ratingMatch[1].replace(',', '.')) >= 4 ? 1 : 0);

    results.push({
      title,
      rating: ratingMatch ? ratingMatch[1] : '0',
      reviewCount: reviewMatch ? reviewMatch[1] : '0',
      phone: phoneMatch ? phoneMatch[1].trim() : '',
      email: emailMatch ? emailMatch[0].toLowerCase() : '',
      industry,
      address: addressMatch ? addressMatch[0].trim() : '',
      companyUrl: websiteLink ? websiteLink.href : '',
      hours: '',
      socialMedia: socialLink ? socialLink.href : '',
      leadScore,
      href
    });
  });

  return results;
}

function tableToCsv(table) {
  const csv = [];
  const rows = table.querySelectorAll('tr');

  for (let i = 0; i < rows.length; i += 1) {
    const row = [];
    const cols = rows[i].querySelectorAll('td, th');
    for (let j = 0; j < cols.length; j += 1) {
      const value = cols[j].innerText.replace(/"/g, '""');
      row.push('"' + value + '"');
    }
    csv.push(row.join(','));
  }
  return csv.join('\n');
}

function downloadToFolder(content, filename, mimeType, folderName) {
  const dateFolder = new Date().toISOString().split('T')[0];
  const folderPath = folderName + '/' + dateFolder + '/' + filename;
  const blob = new Blob([content], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  chrome.downloads.download(
    {
      url: blobUrl,
      filename: folderPath,
      saveAs: false
    },
    function () {
      setTimeout(function () {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    }
  );
}
