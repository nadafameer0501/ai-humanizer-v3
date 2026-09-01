(function() {
  'use strict';

  const SELECTORS = {
    text: '#text',
    wordCount: '#wcount',
    wordCountEl: '#wordCount',
    audience: '#audience',
    style: '#style',
    humanizeBtn: '#humanizeBtn',
    sampleBtn: '#sampleBtn',
    copyBtn: '#copyBtn',
    clearBtn: '#clearBtn',
    controlsToggle: '#controlsToggle',
    controlsBody: '#controlsBody',
    result: '#result',
    resultBox: '#resultBox',
    resultMeta: '#resultMeta',
    status: '#status'
  };

  const SAMPLE_AI = "In today's fast-paced world, we must leverage the synergy of our team to elevate our digital landscape. Moreover, it is imperative that we delve into innovative strategies and seamless solutions to foster sustainable growth across all sectors.";
  const SAMPLE_HUMAN = "The world moves quickly, so we work together and make things happen. To keep growing, we should look at fresh ideas and simple solutions that hold up over time.";

  const AI_PATTERNS = [
    "in today's fast-paced world", "furthermore", "moreover", "it is worth noting", "additionally",
    "leverage", "leverage the synergy", "delve", "seamless", "innovative strategies", "elevate", "synergy",
    "foster sustainable growth", "across all sectors", "it is imperative", "cutting-edge", "robust",
    "comprehensive", "holistic", "paradigm", "streamline", "optimize", "empower", "facilitate",
    "paramount", "pivotal", "game-changer", "unlock", "navigate", "landscape",
    "at the end of the day", "in conclusion", "to sum up", "it goes without saying",
    "needless to say", "it is important to note", "as a matter of fact", "in this day and age",
    "for all intents and purposes", "the fact of the matter is"
  ];

  const STATE = {
    isLoading: false,
    abortController: null,
    toastId: 0
  };

  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

  function createToastContainer() {
    if (!$('#toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(container);
    }
    return $('#toast-container');
  }

  function showToast(message, type = 'success') {
    const container = createToastContainer();
    const id = ++STATE.toastId;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.toastId = id;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        ${type === 'success'
          ? '<polyline points="20 6 9 17 4 12"/>'
          : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => removeToast(id), 4000);
    return id;
  }

  function removeToast(id) {
    const toast = $(`[data-toast-id="${id}"]`);
    if (toast) {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightDiff(output) {
    const lines = output.split('\n');
    return lines.map(line => {
      let highlighted = line;
      AI_PATTERNS.forEach(p => {
        const re = new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        highlighted = highlighted.replace(re, m => '<span class="diff-del">' + escapeHtml(m) + '</span>');
      });
      return highlighted;
    }).join('\n');
  }

  function countWords(s) {
    const m = s.trim().match(/[\w'-]+/g);
    return m ? m.length : 0;
  }

  function updateWordCount(textEl, wordCountEl, wcount, btn) {
    const n = countWords(textEl.value);
    wcount.textContent = n;
    btn.disabled = n === 0 || n > 2000;
    wordCountEl.classList.remove('warn', 'over');
    if (n > 2000) wordCountEl.classList.add('over');
    else if (n > 1800) wordCountEl.classList.add('warn');
    return n;
  }

  function setButtonLoading(btn, loading, originalHtml) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Humanizing…';
      btn.setAttribute('aria-busy', 'true');
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalHtml || 'Humanize my text';
      btn.removeAttribute('aria-busy');
    }
  }

  function setResultMeta(meta, text) {
    meta.textContent = text;
  }

  function scrollToResult(resultBox) {
    requestAnimationFrame(() => {
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function copyToClipboard(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const original = button.textContent;
      button.textContent = '✓ Copied';
      button.classList.add('success');
      showToast('Copied to clipboard!', 'success');
      setTimeout(() => {
        button.textContent = original;
        button.classList.remove('success');
      }, 2000);
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Copied to clipboard!', 'success');
      } catch (e2) {
        showToast('Copy failed - please select and copy manually', 'error');
      }
    }
  }

  function resetForm(textEl, result, resultBox, resultMeta, btn, status, wordCountEl, wcount) {
    textEl.value = '';
    result.classList.remove('show');
    resultBox.innerHTML = '';
    resultMeta.textContent = '';
    btn.innerHTML = btn.dataset.defaultHtml || '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg> Humanize my text';
    status.textContent = '';
    status.className = 'status';
    updateWordCount(textEl, wordCountEl, wcount, btn);
    textEl.focus();
  }

  async function humanizeText(text, audience, style) {
    const ctrl = new AbortController();
    STATE.abortController = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 90000);

    try {
      const resp = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, audience: audience.trim(), style }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      const contentType = resp.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned an unexpected response. Please try again.');
      }

      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Request failed.');
      return data.output;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('The request timed out. Please try again in a moment.');
      }
      throw err;
    }
  }

  function initControlsToggle(toggle, body) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !expanded);
      body.classList.toggle('collapsed', expanded);
    });

    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle.click();
      }
    });
  }

  function initKeyboardShortcuts(textEl, btn) {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!STATE.isLoading && !btn.disabled && document.activeElement === textEl) {
          e.preventDefault();
          btn.click();
        }
      }
      if (e.key === 'Escape') {
        if (STATE.isLoading && STATE.abortController) {
          STATE.abortController.abort();
        }
      }
    });
  }

  function initSampleButton(sampleBtn, textEl, result, resultBox, resultMeta, btn, status, wordCountEl, wcount, humanizeBtn) {
    sampleBtn.addEventListener('click', () => {
      textEl.value = SAMPLE_AI;
      resultBox.innerHTML = highlightDiff(SAMPLE_HUMAN);
      result.classList.add('show');
      setResultMeta(resultMeta, 'Sample');
      btn.innerHTML = '✓ Done — try another';
      btn.disabled = false;
      status.textContent = '';
      updateWordCount(textEl, wordCountEl, wcount, btn);
      scrollToResult(resultBox);
      showToast('Sample loaded - try humanizing your own text', 'success');
    });
  }

  function initCopyButton(copyBtn, resultBox) {
    copyBtn.addEventListener('click', () => {
      const text = resultBox.textContent || resultBox.innerText;
      if (text.trim()) {
        copyToClipboard(text, copyBtn);
      }
    });
  }

  function initClearButton(clearBtn, textEl, result, resultBox, resultMeta, btn, status, wordCountEl, wcount) {
    clearBtn.addEventListener('click', () => {
      resetForm(textEl, result, resultBox, resultMeta, btn, status, wordCountEl, wcount);
      showToast('Cleared', 'success');
    });
  }

  function initHumanizeButton(humanizeBtn, textEl, audienceEl, styleEl, result, resultBox, resultMeta, btn, status, wordCountEl, wcount) {
    humanizeBtn.addEventListener('click', async () => {
      if (STATE.isLoading) return;

      const text = textEl.value.trim();
      const n = countWords(text);

      if (!text) {
        showToast('Please paste some text first', 'error');
        textEl.focus();
        textEl.setAttribute('aria-invalid', 'true');
        return;
      }
      if (n > 2000) {
        showToast(`Text is ${n} words. Limit is 2000.`, 'error');
        textEl.setAttribute('aria-invalid', 'true');
        return;
      }
      textEl.removeAttribute('aria-invalid');

      STATE.isLoading = true;
      setButtonLoading(btn, true);
      status.textContent = '';
      status.className = 'status';
      result.classList.remove('show');

      try {
        const output = await humanizeText(text, audienceEl.value, styleEl.value);
        resultBox.innerHTML = highlightDiff(output);
        result.classList.add('show');
        setResultMeta(resultMeta, 'Done');
        btn.innerHTML = '✓ Done — try another';
        btn.disabled = false;
        scrollToResult(resultBox);
        showToast('Text humanized successfully!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
        btn.innerHTML = btn.dataset.defaultHtml || '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg> Humanize my text';
        btn.disabled = countWords(textEl.value.trim()) === 0;
      } finally {
        STATE.isLoading = false;
        setButtonLoading(btn, false);
      }
    });
  }

  function init() {
    const textEl = $(SELECTORS.text);
    const wcount = $(SELECTORS.wordCount);
    const wordCountEl = $(SELECTORS.wordCountEl);
    const audienceEl = $(SELECTORS.audience);
    const styleEl = $(SELECTORS.style);
    const humanizeBtn = $(SELECTORS.humanizeBtn);
    const sampleBtn = $(SELECTORS.sampleBtn);
    const copyBtn = $(SELECTORS.copyBtn);
    const clearBtn = $(SELECTORS.clearBtn);
    const controlsToggle = $(SELECTORS.controlsToggle);
    const controlsBody = $(SELECTORS.controlsBody);
    const result = $(SELECTORS.result);
    const resultBox = $(SELECTORS.resultBox);
    const resultMeta = $(SELECTORS.resultMeta);
    const status = $(SELECTORS.status);

    if (!textEl || !humanizeBtn) return;

    humanizeBtn.dataset.defaultHtml = humanizeBtn.innerHTML;

    initControlsToggle(controlsToggle, controlsBody);
    initKeyboardShortcuts(textEl, humanizeBtn);
    initSampleButton(sampleBtn, textEl, result, resultBox, resultMeta, humanizeBtn, status, wordCountEl, wcount, humanizeBtn);
    initCopyButton(copyBtn, resultBox);
    initClearButton(clearBtn, textEl, result, resultBox, resultMeta, humanizeBtn, status, wordCountEl, wcount);
    initHumanizeButton(humanizeBtn, textEl, audienceEl, styleEl, result, resultBox, resultMeta, humanizeBtn, status, wordCountEl, wcount);

    textEl.addEventListener('input', () => {
      updateWordCount(textEl, wordCountEl, wcount, humanizeBtn);
      textEl.removeAttribute('aria-invalid');
    });

    updateWordCount(textEl, wordCountEl, wcount, humanizeBtn);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js').catch(() => {});
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();