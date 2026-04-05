/* ═══════════════════════════════════════════════
   LinkedIn Post Formatter — App Logic
   ═══════════════════════════════════════════════ */

'use strict';

/* ── STATE ── */
const state = {
  activeTemplate: 'hikaye',
  activeTon:      'profesyonel',
  isPremium:      false,
  formattedText:  '',
  history:        []
};

/* ── DOM ── */
const $ = id => document.getElementById(id);

const el = {
  inputText:           $('inputText'),
  charCount:           $('charCount'),
  btnFormat:           $('btnFormat'),
  btnCopy:             $('btnCopy'),
  btnClearInput:       $('btnClearInput'),
  btnUpgrade:          $('btnUpgrade'),
  btnHistory:          $('btnHistory'),
  premiumBadge:        $('premiumBadge'),
  previewSection:      $('previewSection'),
  previewText:         $('previewText'),
  copyToast:           $('copyToast'),
  emojiGrid:           $('emojiGrid'),
  templateTabs:        $('templateTabs'),
  tonButtons:          $('tonButtons'),
  tonSection:          $('tonSection'),
  tonPremiumBadge:     $('tonPremiumBadge'),
  historyModal:        $('historyModal'),
  historyList:         $('historyList'),
  historyCount:        $('historyCount'),
  btnCloseHistory:     $('btnCloseHistory'),
  btnClearHistory:     $('btnClearHistory'),
  premiumModal:        $('premiumModal'),
  btnClosePremium:     $('btnClosePremium'),
  btnGumroad:          $('btnGumroad'),
  licenseKeyInput:     $('licenseKeyInput'),
  btnActivate:         $('btnActivate'),
  licenseError:        $('licenseError'),
  licenseSuccess:      $('licenseSuccess'),
  hashtagSection:      $('hashtagSection'),
  hashtagPremiumBadge: $('hashtagPremiumBadge'),
  hashtagList:         $('hashtagList'),
  readabilityScore:    $('readabilityScore'),
  scoreValue:          $('scoreValue'),
};

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
async function init() {
  await loadPremiumStatus();
  await loadHistory();
  renderEmojiGrid();
  bindEvents();
  applyPremiumUI();
  updateHistoryDot();
}

/* ═══════════════════════════════════════════════
   PREMIUM
   ═══════════════════════════════════════════════ */
async function loadPremiumStatus() {
  state.isPremium = await LicenseManager.isPremium();
}

function applyPremiumUI() {
  if (state.isPremium) {
    el.premiumBadge.classList.remove('hidden');
    el.btnUpgrade.classList.add('hidden');
    el.tonPremiumBadge.classList.add('hidden');
    if (el.hashtagPremiumBadge) el.hashtagPremiumBadge.classList.add('hidden');
  } else {
    el.premiumBadge.classList.add('hidden');
    el.btnUpgrade.classList.remove('hidden');
  }

  // Tone lock
  document.querySelectorAll('.seg-btn').forEach(btn => {
    if (!state.isPremium && btn.dataset.ton !== 'profesyonel') {
      btn.classList.add('locked');
    } else {
      btn.classList.remove('locked');
    }
  });
}

/* ═══════════════════════════════════════════════
   EMOJI GRID
   ═══════════════════════════════════════════════ */
function renderEmojiGrid() {
  const set = [
    '🚀','💡','✅','🎯','📈','🔥','💪','🧠','⭐','🌟',
    '👇','📌','💼','📊','🤝','🏆','📋','🗂️','⚙️','📣',
    '🎓','📚','🔍','📝','✏️','📖','💰','🔑','🌐','💻',
    '🤖','⚡','📱','🛠️','🧩','🎉','👏','🙌','💯','🏅',
    '❤️','🫶','🧭','🔮','✨','🎁','🕐','📅','🌍','🦁'
  ];

  el.emojiGrid.innerHTML = '';
  set.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.title = emoji;
    btn.addEventListener('click', () => insertEmoji(emoji));
    el.emojiGrid.appendChild(btn);
  });
}

function insertEmoji(emoji) {
  const ta  = el.inputText;
  const pos = ta.selectionStart ?? ta.value.length;
  ta.value  = ta.value.slice(0, pos) + emoji + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + emoji.length;
  ta.focus();
  updateCharCount();
}

/* ═══════════════════════════════════════════════
   CHAR COUNTER
   ═══════════════════════════════════════════════ */
function updateCharCount() {
  const len = el.inputText.value.length;
  el.charCount.textContent = `${len.toLocaleString()} / 3,000`;
  el.charCount.className = 'char-count';
  if (len > 2800)      el.charCount.classList.add('danger');
  else if (len > 2400) el.charCount.classList.add('warn');
}

/* ═══════════════════════════════════════════════
   API
   ═══════════════════════════════════════════════ */
const API_URL = 'https://linkedin-post-formatter-api.belkeci-ozan.workers.dev/format';

/**
 * Metni Cloudflare Worker üzerinden Gemini'ye gönderir.
 * mode: 'list' → madde ayrıştırma prompt'u, diğerleri → genel düzeltme.
 * Başarılıysa işlenmiş metni, başarısızsa null döner.
 */
async function fixTextWithAI(text, mode = 'default') {
  try {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, mode }),
    });
    const data = await res.json();
    if (res.status === 429) {
      showToast('Günlük AI kapasite doldu. Şablon formatı kullanılıyor.', true);
      return null;
    }
    if (!res.ok || !data.success) return null;
    return data.result;
  } catch {
    // Ağ hatası — offline veya worker erişilemez
    return null;
  }
}

/* ═══════════════════════════════════════════════
   FORMAT
   ═══════════════════════════════════════════════ */
async function formatPost() {
  const text = el.inputText.value.trim();
  if (!text) { showToast('Please write something first.', true); return; }

  const tmpl = ALL_TEMPLATES[state.activeTemplate];
  if (!tmpl) return;

  if (tmpl.premium && !state.isPremium) { openPremiumModal(); return; }

  // Butonu loading durumuna al
  setFormatLoading(true);

  // 1. AI ile şablona özel yeniden yapılandır
  const aiMode  = state.activeTemplate;
  const aiFixed = await fixTextWithAI(text, aiMode);

  // 2. Düzeltilmiş (veya orijinal) metni şablona uygula
  const inputForTemplate = aiFixed || text;
  const ton    = state.isPremium ? state.activeTon : 'profesyonel';
  const result = tmpl.format(inputForTemplate, ton);

  setFormatLoading(false);

  state.formattedText = result;
  el.previewText.textContent = result;
  el.previewSection.classList.remove('hidden');

  if (state.isPremium) {
    renderHashtags(text);
    renderReadabilityScore(result);
  } else {
    el.hashtagList.innerHTML = `
      <button class="hashtag-btn" disabled>#example</button>
      <button class="hashtag-btn" disabled>#hashtag</button>
      <button class="hashtag-btn" disabled>#topics</button>
      <span style="font-size:11px;color:var(--text-4);align-self:center;margin-left:2px;">Unlock with Pro</span>
    `;
    el.readabilityScore.classList.add('hidden');
  }

  saveToHistory(result, state.activeTemplate);

  setTimeout(() => {
    el.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

function setFormatLoading(on) {
  const btn = el.btnFormat;
  if (on) {
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin .7s linear infinite">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
      Formatting…`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 3l1.912 5.813L19.5 9l-5.588 4.087L15.824 19 12 15.75 8.176 19l1.912-5.913L4.5 9l5.588-.187z"/>
      </svg>
      Format Post`;
  }
}

/* ═══════════════════════════════════════════════
   HASHTAGS (Pro)
   ═══════════════════════════════════════════════ */
function renderHashtags(text) {
  const tags = suggestHashtags(text);
  el.hashtagList.innerHTML = '';
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'hashtag-btn';
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      el.inputText.value += '\n' + tag;
      updateCharCount();
      btn.disabled = true;
    });
    el.hashtagList.appendChild(btn);
  });
}

/* ═══════════════════════════════════════════════
   READABILITY (Pro)
   ═══════════════════════════════════════════════ */
function renderReadabilityScore(text) {
  const score = calcReadabilityScore(text);
  if (score === null) { el.readabilityScore.classList.add('hidden'); return; }

  el.scoreValue.textContent = score;
  el.readabilityScore.className = 'score-tag';

  if (score >= 7.5)    { /* green – default */ }
  else if (score >= 5) el.readabilityScore.classList.add('mid');
  else                 el.readabilityScore.classList.add('low');

  el.readabilityScore.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════
   COPY
   ═══════════════════════════════════════════════ */
async function copyText() {
  if (!state.formattedText) return;
  try {
    await navigator.clipboard.writeText(state.formattedText);
    showToast('Copied to clipboard');
  } catch {
    showToast('Copy failed — select the text manually.', true);
  }
}

/* ═══════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════ */
function showToast(msg, isWarning = false) {
  const t = el.copyToast;
  t.textContent = msg;
  t.className   = 'toast' + (isWarning ? ' warning' : '');
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2400);
}

/* ═══════════════════════════════════════════════
   HISTORY
   ═══════════════════════════════════════════════ */
async function loadHistory() {
  const data      = await storageGet('postHistory');
  state.history   = data.postHistory || [];
  updateHistoryDot();
}

async function saveToHistory(text, template) {
  const item = {
    text,
    template,
    preview: text.slice(0, 140),
    date: new Date().toLocaleString('tr-TR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    })
  };
  state.history.unshift(item);
  if (state.history.length > 10) state.history.pop();
  await storageSet({ postHistory: state.history });
  updateHistoryDot();
}

function updateHistoryDot() {
  el.historyCount.classList.toggle('hidden', state.history.length === 0);
}

function renderHistory() {
  el.historyList.innerHTML = '';
  if (!state.history.length) {
    el.historyList.innerHTML = '<p class="history-empty">No posts formatted yet.</p>';
    return;
  }
  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-preview">${escHtml(item.preview)}</div>
      <div class="history-meta">
        <span>${item.template}</span>
        <span>${item.date}</span>
      </div>`;
    div.addEventListener('click', () => {
      state.formattedText  = item.text;
      el.previewText.textContent = item.text;
      el.previewSection.classList.remove('hidden');
      closeHistory();
    });
    el.historyList.appendChild(div);
  });
}

async function clearHistory() {
  state.history = [];
  await storageSet({ postHistory: [] });
  updateHistoryDot();
  renderHistory();
}

/* ═══════════════════════════════════════════════
   TEMPLATE SELECTION
   ═══════════════════════════════════════════════ */
function selectTemplate(id, isPro) {
  if (isPro && !state.isPremium) { openPremiumModal(); return; }
  state.activeTemplate = id;
  document.querySelectorAll('.tpl-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.template === id);
  });
  const tmpl = ALL_TEMPLATES[id];
  if (tmpl?.placeholder) el.inputText.placeholder = tmpl.placeholder;
  el.previewSection.classList.add('hidden');
  state.formattedText = '';
}

/* ═══════════════════════════════════════════════
   TONE SELECTION
   ═══════════════════════════════════════════════ */
function selectTon(ton) {
  if (!state.isPremium) { openPremiumModal(); return; }
  state.activeTon = ton;
  document.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ton === ton);
  });
}

/* ═══════════════════════════════════════════════
   MODALS
   ═══════════════════════════════════════════════ */
function openPremiumModal() {
  el.premiumModal.classList.remove('hidden');
  el.licenseError.classList.add('hidden');
  el.licenseSuccess.classList.add('hidden');
  el.licenseKeyInput.value = '';
}
function closePremiumModal() { el.premiumModal.classList.add('hidden'); }

function openHistory()  { renderHistory(); el.historyModal.classList.remove('hidden'); }
function closeHistory() { el.historyModal.classList.add('hidden'); }

/* ═══════════════════════════════════════════════
   LICENSE ACTIVATION
   ═══════════════════════════════════════════════ */
async function activateLicense() {
  const key = el.licenseKeyInput.value.trim();
  if (!key) { showLicenseMsg('Please enter a license key.', 'error'); return; }

  el.btnActivate.textContent = 'Checking…';
  el.btnActivate.disabled    = true;
  el.licenseError.classList.add('hidden');
  el.licenseSuccess.classList.add('hidden');

  const res = await LicenseManager.verify(key);

  el.btnActivate.textContent = 'Activate';
  el.btnActivate.disabled    = false;

  if (res.success) {
    showLicenseMsg('Pro unlocked! All features are now active.', 'success');
    state.isPremium = true;
    applyPremiumUI();
    setTimeout(closePremiumModal, 1800);
  } else {
    showLicenseMsg(res.error || 'Invalid license key. Please try again.', 'error');
  }
}

function showLicenseMsg(msg, type) {
  const target = type === 'error' ? el.licenseError : el.licenseSuccess;
  const other  = type === 'error' ? el.licenseSuccess : el.licenseError;
  target.textContent = msg;
  target.classList.remove('hidden');
  other.classList.add('hidden');
}

/* ═══════════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════════ */
function bindEvents() {
  el.inputText.addEventListener('input', updateCharCount);
  el.btnFormat.addEventListener('click', formatPost);
  el.btnCopy.addEventListener('click', copyText);
  el.btnClearInput.addEventListener('click', () => {
    el.inputText.value = '';
    updateCharCount();
    el.previewSection.classList.add('hidden');
    state.formattedText = '';
  });

  // Templates
  el.templateTabs.querySelectorAll('.tpl-chip').forEach(btn => {
    btn.addEventListener('click', () =>
      selectTemplate(btn.dataset.template, btn.dataset.premium === 'true')
    );
  });

  // Tone
  el.tonButtons.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => selectTon(btn.dataset.ton));
  });

  // Premium modal
  el.btnUpgrade.addEventListener('click', openPremiumModal);
  el.btnClosePremium.addEventListener('click', closePremiumModal);
  el.premiumModal.addEventListener('click', e => { if (e.target === el.premiumModal) closePremiumModal(); });
  el.tonPremiumBadge.addEventListener('click', openPremiumModal);
  if (el.hashtagPremiumBadge) el.hashtagPremiumBadge.addEventListener('click', openPremiumModal);

  // License
  el.btnActivate.addEventListener('click', activateLicense);
  el.licenseKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') activateLicense(); });

  // History
  el.btnHistory.addEventListener('click', openHistory);
  el.btnCloseHistory.addEventListener('click', closeHistory);
  el.btnClearHistory.addEventListener('click', clearHistory);
  el.historyModal.addEventListener('click', e => { if (e.target === el.historyModal) closeHistory(); });
}

/* ═══════════════════════════════════════════════
   STORAGE HELPERS
   ═══════════════════════════════════════════════ */
function storageGet(keys) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(keys, resolve);
    } else {
      const result = {};
      const arr = typeof keys === 'string' ? [keys] : keys;
      arr.forEach(k => {
        try { result[k] = JSON.parse(localStorage.getItem('lpf_' + k)); } catch { result[k] = null; }
      });
      resolve(result);
    }
  });
}

function storageSet(obj) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(obj, resolve);
    } else {
      Object.entries(obj).forEach(([k, v]) => localStorage.setItem('lpf_' + k, JSON.stringify(v)));
      resolve();
    }
  });
}

/* ── UTILS ── */
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── START ── */
document.addEventListener('DOMContentLoaded', init);
