/* =============================================
   Postevo — Onboarding Turu
   ============================================= */

'use strict';

const Onboarding = (() => {
  const STORAGE_KEY = 'onboardingCompleted';

  function storageGet(key) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(key, data => resolve(data[key]));
      } else {
        try { resolve(JSON.parse(localStorage.getItem('lpf_' + key))); } catch { resolve(null); }
      }
    });
  }

  function storageSet(key, value) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ [key]: value }, resolve);
      } else {
        localStorage.setItem('lpf_' + key, JSON.stringify(value));
        resolve();
      }
    });
  }

  async function shouldShow() {
    const done = await storageGet(STORAGE_KEY);
    return !done;
  }

  async function markComplete() {
    await storageSet(STORAGE_KEY, true);
  }

  /**
   * Onboarding turunu başlatır.
   * @param {string} lang - Aktif dil kodu ('en' | 'tr')
   * @param {Function} tFn - t(lang, key) çeviri fonksiyonu
   */
  async function start(lang, tFn) {
    if (!(await shouldShow())) return;

    const steps = [
      {
        title: tFn(lang, 'onboarding1Title'),
        desc:  tFn(lang, 'onboarding1Desc'),
        target: 'inputText',
      },
      {
        title: tFn(lang, 'onboarding2Title'),
        desc:  tFn(lang, 'onboarding2Desc'),
        target: 'templateTabs',
      },
      {
        title: tFn(lang, 'onboarding3Title'),
        desc:  tFn(lang, 'onboarding3Desc'),
        target: 'btnFormat',
      },
    ];

    let currentStep = 0;

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';

    // Tooltip card
    const card = document.createElement('div');
    card.className = 'onboarding-card';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function render() {
      const step      = steps[currentStep];
      const isLast    = currentStep === steps.length - 1;
      const btnLabel  = isLast ? tFn(lang, 'done') : tFn(lang, 'next');

      card.innerHTML = `
        <div class="ob-header">
          <span class="ob-step">${currentStep + 1} / ${steps.length}</span>
          <button class="ob-skip icon-close" aria-label="Skip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <h3 class="ob-title">${escHtml(step.title)}</h3>
        <p class="ob-desc">${escHtml(step.desc)}</p>
        <div class="ob-dots">
          ${steps.map((_, i) => `<span class="ob-dot${i === currentStep ? ' active' : ''}"></span>`).join('')}
        </div>
        <button class="ob-next btn-format">${escHtml(btnLabel)}</button>
      `;

      // No individual element highlight — centered modal is clear enough

      card.querySelector('.ob-next').addEventListener('click', advance);
      card.querySelector('.ob-skip').addEventListener('click', finish);
    }

    function advance() {
      currentStep++;
      if (currentStep >= steps.length) { finish(); return; }
      render();
    }

    function finish() {
      overlay.remove();
      markComplete();
    }

    render();
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { start, shouldShow, markComplete };
})();
