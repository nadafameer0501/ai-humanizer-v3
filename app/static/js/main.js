(function () {
  'use strict';

  var SAMPLE_AI = "In today's fast-paced world, we must leverage the synergy of our team to elevate our digital landscape. Moreover, it is imperative that we delve into innovative strategies and seamless solutions to foster sustainable growth across all sectors.";
  var SAMPLE_HUMAN = "The world moves quickly, so we work together and make things happen. To keep growing, we should look at fresh ideas and simple solutions that hold up over time.";
  var form = document.getElementById('humanizerForm');
  var textEl = document.getElementById('text');
  var humanizeBtn = document.getElementById('humanizeBtn');
  var sampleBtn = document.getElementById('sampleBtn');
  var clearBtn = document.getElementById('clearBtn');
  var copyBtn = document.getElementById('copyBtn');
  var audienceEl = document.getElementById('audience');
  var wordCountEl = document.getElementById('wordCount');
  var result = document.getElementById('result');
  var resultBox = document.getElementById('resultBox');
  var resultCount = document.getElementById('resultCount');
  var resultMeta = document.getElementById('resultMeta');
  var statusEl = document.getElementById('status');
  var mobileMenuButton = document.getElementById('mobileMenuButton');
  var mobileMenu = document.getElementById('mobileMenu');
  var toneButtons = Array.prototype.slice.call(document.querySelectorAll('[data-tone]'));
  var activeTone = 'normal';
  var loading = false;

  if (!form || !textEl || !humanizeBtn) return;

  function countWords(value) {
    var matches = value.trim().match(/[\w'-]+/g);
    return matches ? matches.length : 0;
  }

  function updateCounts() {
    var count = countWords(textEl.value);
    wordCountEl.textContent = count + ' / 2,000 words';
    humanizeBtn.disabled = loading || count === 0 || count > 2000;
    clearBtn.disabled = loading || count === 0;
  }

  function showToast(message, isError) {
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = message;
    container.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, 4000);
  }

  function setLoading(isLoading) {
    loading = isLoading;
    humanizeBtn.setAttribute('aria-busy', String(isLoading));
    humanizeBtn.innerHTML = isLoading ? 'Finding your rhythm…' : 'Make it sound like me <span aria-hidden="true">→</span>';
    updateCounts();
  }

  function setResult(output, meta) {
    result.hidden = false;
    resultBox.classList.remove('is-loading');
    resultBox.textContent = output;
    resultCount.textContent = countWords(output) + ' words';
    resultMeta.textContent = meta || 'Meaning preserved';
    copyBtn.disabled = !output;
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (_error) {
      var fallback = document.createElement('textarea');
      fallback.value = value;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand('copy');
      fallback.remove();
    }
    copyBtn.querySelector('span').textContent = 'Copied';
    showToast('Copied to clipboard', false);
    window.setTimeout(function () { copyBtn.querySelector('span').textContent = 'Copy text'; }, 1800);
  }

  toneButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      toneButtons.forEach(function (item) {
        var isActive = item === button;
        item.classList.toggle('is-active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
      });
      activeTone = button.getAttribute('data-tone') || 'normal';
    });
  });

  textEl.addEventListener('input', updateCounts);

  sampleBtn.addEventListener('click', function () {
    textEl.value = SAMPLE_AI;
    activeTone = 'normal';
    toneButtons.forEach(function (button) {
      var isActive = button.getAttribute('data-tone') === 'normal';
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    updateCounts();
    setResult(SAMPLE_HUMAN, 'Sample preview');
    showToast('Sample loaded — try your own draft next', false);
    textEl.focus();
  });

  clearBtn.addEventListener('click', function () {
    textEl.value = '';
    result.hidden = true;
    resultBox.textContent = '';
    resultCount.textContent = '0 words';
    copyBtn.disabled = true;
    updateCounts();
    textEl.focus();
  });

  copyBtn.addEventListener('click', function () {
    if (resultBox.textContent.trim()) copyText(resultBox.textContent);
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var text = textEl.value.trim();
    var count = countWords(text);
    if (!text) { showToast('Please paste some text first', true); textEl.focus(); return; }
    if (count > 2000) { showToast('Your draft is over the 2,000-word limit', true); return; }

    setLoading(true);
    result.hidden = false;
    resultBox.classList.add('is-loading');
    resultBox.textContent = 'Finding your rhythm…';
    resultCount.textContent = '… words';
    resultMeta.textContent = 'Working';
    copyBtn.disabled = true;

    try {
      var response = await fetch('/api/humanize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, audience: audienceEl.value, style: activeTone })
      });
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to humanize this draft.');
      setResult(data.output, 'Meaning preserved');
      showToast('Your draft is ready', false);
    } catch (error) {
      result.hidden = true;
      showToast(error.message || 'Something went wrong. Please try again.', true);
    } finally {
      setLoading(false);
    }
  });

  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener('click', function () {
      var expanded = mobileMenuButton.getAttribute('aria-expanded') === 'true';
      mobileMenuButton.setAttribute('aria-expanded', String(!expanded));
      mobileMenu.hidden = expanded;
    });
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenuButton.setAttribute('aria-expanded', 'false');
        mobileMenu.hidden = true;
      });
    });
  }

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && document.activeElement === textEl && !humanizeBtn.disabled) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  updateCounts();
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
})();
