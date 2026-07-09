'use strict';
(() => {
  // src/popup.js
  var statusEl = document.getElementById('status');
  var tagEl = document.getElementById('siteTag');
  var scanBtn = document.getElementById('scan');
  var reportEl = document.getElementById('report');
  async function activeTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  }
  function send(tabId, msg, timeoutMs = 1500) {
    return new Promise((resolve) => {
      let done = false;
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        if (done) return;
        done = true;
        resolve(res);
      });
      setTimeout(() => {
        if (done) return;
        done = true;
        resolve(null);
      }, timeoutMs);
    });
  }
  function renderStats(s) {
    reportEl.innerHTML = '';
    if (!s) return;
    const rows = [
      ['Host', s.host],
      ['Images on page', s.images],
      ['Large candidates', s.bigCandidates],
      ['Smoosh buttons', s.buttonsAttached],
    ];
    for (const [k, v] of rows) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = k;
      const b = document.createElement('b');
      b.textContent = v ?? '\u2014';
      li.appendChild(span);
      li.appendChild(b);
      reportEl.appendChild(li);
    }
  }
  async function refresh() {
    const tab = await activeTab();
    const url = tab?.url || '';
    const onGemini = url.startsWith('https://gemini.google.com/');
    const onChatgpt = url.startsWith('https://chatgpt.com/');
    if (!onGemini && !onChatgpt) {
      tagEl.textContent = 'unsupported';
      statusEl.textContent = 'Open a Gemini or ChatGPT chat to use Smoosh.';
      scanBtn.disabled = true;
      return;
    }
    tagEl.textContent = onGemini ? 'Gemini' : 'ChatGPT';
    const res = await send(tab.id, { type: 'smoosh-ping' });
    if (!res || !res.ok) {
      statusEl.textContent =
        'Smoosh isn\u2019t injected on this tab yet. Try reloading the page.';
      return;
    }
    statusEl.textContent = res.site
      ? 'Hover any generated image to see the buttons.'
      : 'Content script idle.';
    const sc = await send(tab.id, { type: 'smoosh-scan' }, 3e3);
    renderStats(sc?.stats);
  }
  scanBtn.addEventListener('click', async () => {
    const tab = await activeTab();
    scanBtn.textContent = 'Scanning\u2026';
    const res = await send(tab.id, { type: 'smoosh-scan' }, 4e3);
    scanBtn.textContent = 'Scan for images now';
    if (res?.stats) {
      statusEl.textContent = `Attached ${res.attached} new button(s).`;
      renderStats(res.stats);
    } else {
      statusEl.textContent = 'Reload the page, then try again.';
    }
  });
  refresh();
})();
