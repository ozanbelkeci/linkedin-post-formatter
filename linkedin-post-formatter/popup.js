/* ═══════════════════════════════════════════════
   Postify — App Logic v2.0
   ═══════════════════════════════════════════════ */

'use strict';

/* ── API BASE ── */
const API_BASE = 'https://linkedin-post-formatter-api.belkeci-ozan.workers.dev';
const API_URL  = API_BASE + '/format';

/* ── STATE ── */
const state = {
  activeTemplate:   'hikaye',
  activeTon:        'profesyonel',
  isPremium:        false,
  formattedText:    '',
  altText:          '',       // B versiyonu (A/B test'ten gelir)
  activeVersion:    'A',      // 'A' | 'B'
  isEditingPreview: false,
  editingVersion:   'A',      // edit moduna girildiğinde kilitlenen versiyon
  history:          [],
  lang:             'en',
  toneProfile:      null,
  colorScheme:      'auto',
  activeTab:        'write',
};

/* ── DOM ── */
const $ = id => document.getElementById(id);

const el = {
  inputText:           $('inputText'),
  charCount:           $('charCount'),
  btnFormat:           $('btnFormat'),
  btnCopy:             $('btnCopy'),
  btnCopyMobile:       $('btnCopyMobile'),
  btnCopyA:            $('btnCopyA'),
  btnCopyB:            $('btnCopyB'),
  btnClearInput:       $('btnClearInput'),
  btnUpgrade:          $('btnUpgrade'),
  btnHistory:          $('btnHistory'),
  btnSaveDraft:        $('btnSaveDraft'),
  btnNewDraft:         $('btnNewDraft'),
  btnAnalyze:          $('btnAnalyze'),
  versionToggle:       $('versionToggle'),
  btnVersionA:         $('btnVersionA'),
  btnVersionB:         $('btnVersionB'),
  btnEdit:             $('btnEdit'),
  premiumBadge:        $('premiumBadge'),
  previewSection:      $('previewSection'),
  previewText:         $('previewText'),
  desktopPreview:      $('desktopPreview'),
  mobilePreview:       $('mobilePreview'),
  mobilePostText:      $('mobilePostText'),
  btnPreviewDesktop:   $('btnPreviewDesktop'),
  btnPreviewMobile:    $('btnPreviewMobile'),
  hookCard:            $('hookCard'),
  hookEmoji:           $('hookEmoji'),
  hookLabel:           $('hookLabel'),
  hookScoreFill:       $('hookScoreFill'),
  hookTip:             $('hookTip'),
  readabilityScore:    $('readabilityScore'),
  readabilityDetail:   $('readabilityDetail'),
  readabilityRows:     $('readabilityRows'),
  scoreValue:          $('scoreValue'),
  viralSection:        $('viralSection'),
  viralOverall:        $('viralOverall'),
  viralRows:           $('viralRows'),
  viralTip:            $('viralTip'),
  abSection:           $('abSection'),
  copyToast:           $('copyToast'),
  emojiGrid:           $('emojiGrid'),
  previewEmojiGrid:    $('previewEmojiGrid'),
  previewEmojiSection: $('previewEmojiSection'),
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
  btnPurchase:         $('btnPurchase'),
  licenseKeyInput:     $('licenseKeyInput'),
  btnActivate:         $('btnActivate'),
  licenseError:        $('licenseError'),
  licenseSuccess:      $('licenseSuccess'),
  hashtagSection:      $('hashtagSection'),
  hashtagPremiumBadge: $('hashtagPremiumBadge'),
  hashtagList:         $('hashtagList'),
  // Drafts
  draftsList:          $('draftsList'),
  draftNameModal:      $('draftNameModal'),
  draftNameInput:      $('draftNameInput'),
  btnDraftCancel:      $('btnDraftCancel'),
  btnDraftSave:        $('btnDraftSave'),
  // Tone tab
  toneSample1:         $('toneSample1'),
  toneSample2:         $('toneSample2'),
  toneSample3:         $('toneSample3'),
  btnAnalyzeTone:      $('btnAnalyzeTone'),
  toneProfileCard:     $('toneProfileCard'),
  toneProfileContent:  $('toneProfileContent'),
  // Settings
  langSelect:          $('langSelect'),
  themeSelect:         $('themeSelect'),
  settingsPremiumLabel: $('settingsPremiumLabel'),
  btnSettingsUpgrade:   $('btnSettingsUpgrade'),
  btnDeactivate:        $('btnDeactivate'),
  licenseInputGroup:    $('licenseInputGroup'),
  licenseActiveGroup:   $('licenseActiveGroup'),
  settingsLicenseInput: $('settingsLicenseInput'),
  btnSettingsActivate:  $('btnSettingsActivate'),
  settingsLicenseMsg:   $('settingsLicenseMsg'),
  licenseKeyPrefix:     $('licenseKeyPrefix'),
  apiStatusText:        $('apiStatusText'),
  apiStatusDot:        $('apiStatusDot'),
  apiUsageText:        $('apiUsageText'),
};

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
async function init() {
  const licenseResult = await loadPremiumStatus();
  await loadHistory();
  await loadSettings();
  await loadToneProfile();
  renderEmojiGrid();
  bindEvents();
  applyPremiumUI();
  updateHistoryDot();
  await renderDraftsList();
  checkApiStatus();
  Onboarding.start(state.lang, t);
  if (licenseResult && licenseResult.revoked) {
    showToast('Lisansınız doğrulanamadı. Premium özellikler devre dışı bırakıldı.', true);
  }
}

/* ═══════════════════════════════════════════════
   SETTINGS (lang, theme)
   ═══════════════════════════════════════════════ */

/** Tarayıcı/sistem dilini algılar; desteklenmiyorsa 'en' döner */
function detectSystemLang() {
  const codes   = SUPPORTED_LANGS.map(l => l.code);
  const browser = (navigator.language || 'en').split('-')[0].toLowerCase();
  return codes.includes(browser) ? browser : 'en';
}

async function loadSettings() {
  const data = await storageGet(['preferredLanguage', 'colorScheme']);
  state.lang        = data.preferredLanguage || detectSystemLang();
  state.colorScheme = data.colorScheme       || 'auto';

  el.langSelect.innerHTML = '';
  SUPPORTED_LANGS.forEach(({ code, label }) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    el.langSelect.appendChild(opt);
  });
  el.langSelect.value  = state.lang;
  el.themeSelect.value = state.colorScheme;
  applyTheme(state.colorScheme);
  applyLang(state.lang);
}

function applyTheme(scheme) {
  const root = document.documentElement;
  if (scheme === 'dark')  { root.setAttribute('data-theme', 'dark'); }
  else if (scheme === 'light') { root.setAttribute('data-theme', 'light'); }
  else { root.removeAttribute('data-theme'); }
}

function applyLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  // Update elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(domEl => {
    const key = domEl.getAttribute('data-i18n');
    const txt = t(lang, key);
    if (txt) domEl.textContent = txt;
  });
  // Upgrade button (no data-i18n in HTML, set explicitly)
  if (el.btnUpgrade) el.btnUpgrade.textContent = t(lang, 'btnUpgrade');
  // Placeholder
  if (el.inputText) el.inputText.placeholder = t(lang, 'placeholder');
  if (el.draftNameInput) el.draftNameInput.placeholder = t(lang, 'draftNamePlaceholder');
  // Tone sample placeholders
  if (el.toneSample1) el.toneSample1.placeholder = t(lang, 'toneSample1Ph');
  if (el.toneSample2) el.toneSample2.placeholder = t(lang, 'toneSample2Ph');
  if (el.toneSample3) el.toneSample3.placeholder = t(lang, 'toneSample3Ph');
  // Template chip labels
  document.querySelectorAll('.tpl-chip[data-template]').forEach(chip => {
    const key = 'tpl_' + chip.dataset.template;
    const label = t(lang, key);
    if (label && label !== key) chip.textContent = label;
  });
  // Premium status label (dynamically set, not data-i18n)
  if (el.settingsPremiumLabel) {
    el.settingsPremiumLabel.textContent = state.isPremium
      ? t(lang, 'proplanActive')
      : t(lang, 'freePlan');
  }
  // API status (re-render if already checked)
  if (el.apiStatusDot) {
    if (el.apiStatusDot.classList.contains('ok'))  el.apiStatusText.textContent = t(lang, 'apiOnline');
    if (el.apiStatusDot.classList.contains('err')) el.apiStatusText.textContent = t(lang, 'apiOffline');
  }
}

/* ═══════════════════════════════════════════════
   PREMIUM
   ═══════════════════════════════════════════════ */
async function loadPremiumStatus() {
  const result    = await LicenseManager.validateOnOpen();
  state.isPremium = result.isPremium;
  return result;
}

function applyPremiumUI() {
  if (state.isPremium) {
    el.premiumBadge.classList.remove('hidden');
    el.btnUpgrade.classList.add('hidden');
    el.tonPremiumBadge.classList.add('hidden');
    if (el.hashtagPremiumBadge) el.hashtagPremiumBadge.classList.add('hidden');
    el.btnAnalyze.classList.remove('hidden');
    el.settingsPremiumLabel.textContent = t(state.lang, 'proplanActive');
    el.btnSettingsUpgrade.classList.add('hidden');
    // Settings: show active group, hide input group
    if (el.licenseInputGroup)  el.licenseInputGroup.classList.add('hidden');
    if (el.licenseActiveGroup) el.licenseActiveGroup.classList.remove('hidden');
    // Show first 8 chars of the key
    LicenseManager.getLicenseInfo().then(info => {
      if (el.licenseKeyPrefix && info.key) {
        el.licenseKeyPrefix.textContent = info.key.slice(0, 8).toUpperCase() + '••••  ✓ Premium Aktif';
      }
    });
  } else {
    el.premiumBadge.classList.add('hidden');
    el.btnUpgrade.classList.remove('hidden');
    el.btnAnalyze.classList.add('hidden');
    el.settingsPremiumLabel.textContent = t(state.lang, 'freePlan');
    el.btnSettingsUpgrade.classList.remove('hidden');
    // Settings: show input group, hide active group
    if (el.licenseInputGroup)  el.licenseInputGroup.classList.remove('hidden');
    if (el.licenseActiveGroup) el.licenseActiveGroup.classList.add('hidden');
  }

  document.querySelectorAll('.tpl-pro').forEach(chip => {
    chip.classList.toggle('unlocked', state.isPremium);
  });

  document.querySelectorAll('.seg-btn').forEach(btn => {
    if (!state.isPremium && btn.dataset.ton !== 'profesyonel') {
      btn.classList.add('locked');
    } else {
      btn.classList.remove('locked');
    }
  });
}

/* ═══════════════════════════════════════════════
   MAIN TABS
   ═══════════════════════════════════════════════ */
function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
  const panel = $('tab-' + tabId);
  if (panel) panel.classList.add('active');
  const btn = document.querySelector(`.main-tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');

  if (tabId === 'drafts') renderDraftsList();
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
  if (el.previewEmojiGrid) el.previewEmojiGrid.innerHTML = '';

  set.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.title = emoji;
    btn.addEventListener('click', () => insertEmoji(emoji, false));
    el.emojiGrid.appendChild(btn);

    if (el.previewEmojiGrid) {
      const pBtn = document.createElement('button');
      pBtn.className = 'emoji-btn';
      pBtn.textContent = emoji;
      pBtn.title = emoji;
      pBtn.addEventListener('click', () => insertEmoji(emoji, true));
      el.previewEmojiGrid.appendChild(pBtn);
    }
  });
}

function insertEmoji(emoji, isPreview = false) {
  if (isPreview && state.isEditingPreview) {
    const target = el.previewText;
    target.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    
    if (!target.contains(range.commonAncestorContainer)) {
      range.selectNodeContents(target);
      range.collapse(false);
    }
    
    const node = document.createTextNode(emoji);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(range);
    
    if (state.editingVersion === 'B') {
      state.altText = target.innerText || '';
    } else {
      state.formattedText = target.innerText || '';
    }
    return;
  }

  const ta  = el.inputText;
  const pos = ta.selectionStart ?? ta.value.length;
  ta.value  = ta.value.slice(0, pos) + emoji + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + emoji.length;
  ta.focus();
  updateCharCount();
}

/* ═══════════════════════════════════════════════
   CHAR COUNTER + SEE MORE LINE
   ═══════════════════════════════════════════════ */
function updateCharCount() {
  const len = el.inputText.value.length;
  el.charCount.textContent = `${len.toLocaleString()} / 3,000`;
  el.charCount.className = 'char-count';
  if (len > 2800)      el.charCount.classList.add('danger');
  else if (len > 2400) el.charCount.classList.add('warn');
}

/* ═══════════════════════════════════════════════
   PREVIEW TEXT RENDER (See More after N lines)
   Desktop: 3 lines, Mobile: 4 lines
   ═══════════════════════════════════════════════ */
function renderPreviewText(text, container, maxLines, maxChars) {
  const target  = container || el.previewText;
  const nLines  = maxLines || 3;
  const nChars  = maxChars || 210;
  target.innerHTML = '';

  if (!text) { target.textContent = ''; return; }

  // Find cutoff at whichever comes first: Nth newline OR Mth character
  let lineCount = 0;
  let cutAt = -1;
  for (let i = 0; i < text.length; i++) {
    if (i >= nChars) { cutAt = i; break; }
    if (text[i] === '\n') {
      lineCount++;
      if (lineCount >= nLines) { cutAt = i; break; }
    }
  }

  if (cutAt === -1) {
    // Text fits within both limits — show all
    target.textContent = text;
    return;
  }

  const visibleText = text.slice(0, cutAt);
  const hiddenText  = text.slice(cutAt);

  const before = document.createElement('span');
  before.className = 'preview-above-fold';
  before.textContent = visibleText;

  const after = document.createElement('span');
  after.className = 'preview-after-cutoff';
  after.textContent = hiddenText;
  after.hidden = true;

  const seeMoreBtn = document.createElement('button');
  seeMoreBtn.className = 'preview-see-more-btn';
  seeMoreBtn.textContent = t(state.lang, 'seeMore');

  let expanded = false;
  seeMoreBtn.addEventListener('click', () => {
    expanded = !expanded;
    after.hidden = !expanded;
    seeMoreBtn.textContent = expanded ? t(state.lang, 'seeLess') : t(state.lang, 'seeMore');
  });

  target.appendChild(before);
  target.appendChild(after);
  target.appendChild(seeMoreBtn);
}

/* ═══════════════════════════════════════════════
   MOBILE PREVIEW TOGGLE
   ═══════════════════════════════════════════════ */
function setPreviewMode(mode) {
  const isDesktop = mode === 'desktop';
  el.desktopPreview.classList.toggle('hidden', !isDesktop);
  el.mobilePreview.classList.toggle('hidden', isDesktop);
  el.btnPreviewDesktop.classList.toggle('active', isDesktop);
  el.btnPreviewMobile.classList.toggle('active', !isDesktop);
  if (!isDesktop) renderPreviewText(state.formattedText, el.mobilePostText, 4, 280);
}

/* ═══════════════════════════════════════════════
   API HELPERS
   ═══════════════════════════════════════════════ */
async function apiCall(endpoint, body) {
  try {
    const res  = await fetch(API_BASE + endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (res.status === 429) {
      showToast(t(state.lang, 'aiCapacity'), true);
      return null;
    }
    const data = await res.json();
    if (!res.ok || !data.success) return null;
    return data;
  } catch {
    return null;
  }
}

async function fixTextWithAI(text, mode = 'default', ton = 'profesyonel') {
  const data = await apiCall('/format', { text, mode, ton });
  return data ? data.result : null;
}

/* ═══════════════════════════════════════════════
   FORMAT
   ═══════════════════════════════════════════════ */
async function formatPost() {
  const text = el.inputText.value.trim();
  if (!text) { showToast(t(state.lang, 'writeSomething'), true); return; }

  const tmpl = ALL_TEMPLATES[state.activeTemplate];
  if (!tmpl) return;

  if (tmpl.premium && !state.isPremium) { openPremiumModal(); return; }

  // Free plan: check daily limit via background.js
  if (!state.isPremium) {
    const status = await getUsageStatus();
    if (status && status.count >= 10) {
      showToast(t(state.lang, 'dailyLimitReached'), true);
      return;
    }
  }

  setFormatLoading(true);

  const aiMode  = state.activeTemplate;
  const aiTon   = state.isPremium ? state.activeTon : 'profesyonel';
  const aiFixed = await fixTextWithAI(text, aiMode, aiTon);

  const inputForTemplate = aiFixed || text;
  const ton    = state.isPremium ? state.activeTon : 'profesyonel';
  const result = tmpl.format(inputForTemplate, ton, state.lang);

  setFormatLoading(false);

  state.formattedText = result;
  state.altText       = '';
  state.activeVersion = 'A';
  renderPreviewText(result);
  renderPreviewText(result, el.mobilePostText, 4, 280);
  el.previewSection.classList.remove('hidden');
  el.viralSection.classList.add('hidden');
  // Versiyon toggle: sadece premium kullanıcılara göster, B'yi sıfırla
  if (state.isPremium && el.versionToggle) {
    el.versionToggle.classList.remove('hidden');
    el.btnVersionA.classList.add('active');
    el.btnVersionB.classList.remove('active');
    el.btnVersionB.querySelector('[data-i18n="versionBLabel"]').textContent = t(state.lang, 'versionBLabel');
    el.btnVersionB.disabled = false;
  }

  // Hook analysis (all users)
  showHookAnalysis(result);

  if (state.isPremium) {
    renderHashtags(text);
    renderReadabilityScore(result);
    renderReadabilityDetails(result);
  } else {
    el.hashtagList.innerHTML = `
      <button class="hashtag-btn" disabled>#example</button>
      <button class="hashtag-btn" disabled>#hashtag</button>
      <button class="hashtag-btn" disabled>#topics</button>
      <span style="font-size:11px;color:var(--text-4);align-self:center;margin-left:2px;">${escHtml(t(state.lang, 'unlockWithPro'))}</span>
    `;
    el.readabilityScore.classList.add('hidden');
    el.readabilityDetail.classList.add('hidden');
  }

  saveToHistory(result, state.activeTemplate);
  incrementUsage();

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
      ${escHtml(t(state.lang, 'formatting'))}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 3l1.912 5.813L19.5 9l-5.588 4.087L15.824 19 12 15.75 8.176 19l1.912-5.913L4.5 9l5.588-.187z"/>
      </svg>
      ${escHtml(t(state.lang, 'formatPost'))}`;
  }
}

/* ═══════════════════════════════════════════════
   HOOK ANALYSIS
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   PREVIEW EDITING
   ═══════════════════════════════════════════════ */
function toggleEditPreview() {
  if (!state.isEditingPreview) {
    // Enter edit mode
    state.isEditingPreview = true;
    state.editingVersion = state.activeVersion;  // lock which version is being edited
    if (el.btnVersionA) el.btnVersionA.disabled = true;
    if (el.btnVersionB) el.btnVersionB.disabled = true;
    el.btnEdit.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      <span data-i18n="savePost">${escHtml(t(state.lang, 'savePost'))}</span>
    `;

    el.previewText.innerHTML = '';
    el.previewText.innerText = state.editingVersion === 'B' ? state.altText : state.formattedText;
    el.previewText.contentEditable = 'true';
    el.previewText.style.outline = '2px solid var(--brand)';
    el.previewText.style.outlineOffset = '-2px';
    el.previewText.focus();
    if (el.previewEmojiSection) el.previewEmojiSection.classList.remove('hidden');
  } else {
    // Save changes — kilitlenen versiyona yaz
    state.isEditingPreview = false;
    const edited = el.previewText.innerText || '';
    if (state.editingVersion === 'B') {
      state.altText = edited;
    } else {
      state.formattedText = edited;
    }
    state.activeVersion = state.editingVersion;  // ensure activeVersion matches what was edited
    if (el.btnVersionA) el.btnVersionA.disabled = false;
    if (el.btnVersionB) el.btnVersionB.disabled = false;
    el.previewText.contentEditable = 'false';
    el.previewText.style.outline = 'none';
    
    el.btnEdit.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      <span data-i18n="editPost">${escHtml(t(state.lang, 'editPost'))}</span>
    `;
    if (el.previewEmojiSection) el.previewEmojiSection.classList.add('hidden');

    const activeText = state.activeVersion === 'B' ? state.altText : state.formattedText;
    renderPreviewText(activeText);
    renderPreviewText(activeText, el.mobilePostText, 4, 280);
    showHookAnalysis(activeText);
    if (state.isPremium) {
      renderReadabilityScore(activeText);
      renderReadabilityDetails(activeText);
      renderHashtags(activeText);
    }
  }
}

function showHookAnalysis(text) {
  const { score, labelKey, emoji, tipKey } = analyzeHook(text);
  el.hookEmoji.textContent = emoji;
  el.hookLabel.textContent = t(state.lang, labelKey);
  el.hookTip.textContent   = t(state.lang, tipKey);
  el.hookScoreFill.style.width = score + '%';
  el.hookScoreFill.className = 'hook-score-fill';
  if (score >= 80)      { /* green, default */ }
  else if (score >= 50) el.hookScoreFill.classList.add('mid');
  else                  el.hookScoreFill.classList.add('low');
  el.hookCard.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════
   READABILITY
   ═══════════════════════════════════════════════ */
function renderReadabilityScore(text) {
  const score = calcReadabilityScore(text);
  if (score === null) { el.readabilityScore.classList.add('hidden'); return; }
  el.scoreValue.textContent = score;
  el.readabilityScore.className = 'score-tag';
  if (score >= 7.5)    { /* green */ }
  else if (score >= 5) el.readabilityScore.classList.add('mid');
  else                 el.readabilityScore.classList.add('low');
  el.readabilityScore.classList.remove('hidden');
}

function renderReadabilityDetails(text) {
  if (!text) return;
  const sentences   = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const words       = text.split(/\s+/).filter(Boolean);
  const paragraphs  = text.split(/\n\n+/).filter(p => p.trim());
  const emojiCount  = (text.match(/\p{Emoji}/gu) || []).length;
  const emojiRatio  = words.length ? emojiCount / words.length : 0;
  const avgSentLen  = sentences.length ? words.length / sentences.length : 0;

  // Sentence length: < 15 words avg = good
  const sentScore  = avgSentLen < 12 ? 100 : avgSentLen < 18 ? 65 : 30;
  const sentLabel  = sentScore >= 80 ? t(state.lang, 'readGreat') : sentScore >= 55 ? t(state.lang, 'readOk') : t(state.lang, 'readLong');
  const sentClass  = sentScore >= 80 ? 'good' : sentScore >= 55 ? 'ok' : 'bad';

  // Paragraph structure: 1-3 sentences per para = good
  const avgParaLen  = paragraphs.length ? sentences.length / paragraphs.length : 0;
  const paraScore   = avgParaLen <= 3 ? 100 : avgParaLen <= 5 ? 65 : 30;
  const paraLabel   = paraScore >= 80 ? t(state.lang, 'readGreat') : paraScore >= 55 ? t(state.lang, 'readOk') : t(state.lang, 'readLong');
  const paraClass   = paraScore >= 80 ? 'good' : paraScore >= 55 ? 'ok' : 'bad';

  // Emoji ratio: 3-15% = good
  const emojiPct    = emojiRatio * 100;
  const emojiScore  = emojiPct >= 3 && emojiPct <= 15 ? 100 : emojiPct > 0 ? 55 : 20;
  const emojiLabel  = emojiScore >= 80 ? t(state.lang, 'readGreat') : emojiScore >= 55 ? t(state.lang, 'readSome') : t(state.lang, 'readNone');
  const emojiClass  = emojiScore >= 80 ? 'good' : emojiScore >= 55 ? 'ok' : 'bad';

  el.readabilityRows.innerHTML = `
    <div class="detail-row">
      <span class="detail-icon">📏</span>
      <span class="detail-label">${escHtml(t(state.lang, 'readSentenceLen'))}</span>
      <div class="detail-bar-wrap"><div class="detail-bar-fill ${sentClass}" style="width:${sentScore}%"></div></div>
      <span class="detail-rating ${sentClass}">${escHtml(sentLabel)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-icon">📝</span>
      <span class="detail-label">${escHtml(t(state.lang, 'readParaStructure'))}</span>
      <div class="detail-bar-wrap"><div class="detail-bar-fill ${paraClass}" style="width:${paraScore}%"></div></div>
      <span class="detail-rating ${paraClass}">${escHtml(paraLabel)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-icon">😀</span>
      <span class="detail-label">${escHtml(t(state.lang, 'readEmojiBalance'))}</span>
      <div class="detail-bar-wrap"><div class="detail-bar-fill ${emojiClass}" style="width:${emojiScore}%"></div></div>
      <span class="detail-rating ${emojiClass}">${escHtml(emojiLabel)}</span>
    </div>
  `;
  el.readabilityDetail.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════
   VIRAL ANALYSIS (Pro)
   ═══════════════════════════════════════════════ */
async function runViralAnalysis() {
  if (!state.isPremium) { openPremiumModal(); return; }
  const activeText = state.activeVersion === 'B' ? state.altText : state.formattedText;
  if (!activeText) return;

  el.btnAnalyze.textContent = t(state.lang, 'analyzing') || 'Analyzing…';
  el.btnAnalyze.disabled    = true;
  el.viralSection.classList.remove('hidden');
  el.viralRows.innerHTML = `<span style="font-size:11px;color:var(--text-4)">${escHtml(t(state.lang, 'analyzing'))}</span>`;

  const data = await apiCall('/analyze', { text: activeText });

  el.btnAnalyze.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
    <span data-i18n="analyzePost">${t(state.lang, 'analyzePost')}</span>
  `;
  el.btnAnalyze.disabled = false;

  if (!data || !data.result) {
    el.viralRows.innerHTML = `<span style="font-size:11px;color:var(--red)">${escHtml(t(state.lang, 'analysisFailed'))}</span>`;
    return;
  }

  const r = data.result;
  el.viralOverall.textContent = (r.overall || 0) + '/100';

  const rows = [
    { icon: '🎯', label: t(state.lang, 'hookScore'),     val: clampPct(r.hook) },
    { icon: '❤️', label: t(state.lang, 'emotionScore'),  val: clampPct(r.emotion) },
    { icon: '🔄', label: t(state.lang, 'shareScore'),    val: clampPct(r.shareability) },
    { icon: '📢', label: t(state.lang, 'ctaScore'),      val: clampPct(r.cta) },
  ];

  el.viralRows.innerHTML = rows.map(row => `
    <div class="viral-row">
      <span class="viral-icon">${row.icon}</span>
      <span class="viral-label">${escHtml(row.label)}</span>
      <div class="viral-bar-wrap"><div class="viral-bar-fill" style="width:${row.val}%"></div></div>
      <span class="viral-val">${row.val}</span>
    </div>
  `).join('');

  if (r.tip) {
    el.viralTip.textContent = '💡 ' + r.tip;
    el.viralTip.classList.remove('hidden');
  } else {
    el.viralTip.classList.add('hidden');
  }
}

/* ═══════════════════════════════════════════════
   A/B TEST (Pro) — B toggle'dan tetiklenir
   ═══════════════════════════════════════════════ */
async function runABTest() {
  if (!state.isPremium) { openPremiumModal(); return; }
  const text = el.inputText.value.trim();
  if (!text) { showToast(t(state.lang, 'writeSomething'), true); return; }

  const bLabel = el.btnVersionB.querySelector('[data-i18n="versionBLabel"]');
  if (bLabel) bLabel.textContent = t(state.lang, 'altToneLoading');
  el.btnVersionB.disabled = true;

  const data = await apiCall('/ab-test', {
    text, mode: state.activeTemplate, ton: state.activeTon, lang: state.lang
  });

  el.btnVersionB.disabled = false;
  if (bLabel) bLabel.textContent = t(state.lang, 'versionBLabel');

  if (!data || !data.versionB) {
    showToast(t(state.lang, 'abTestFailed'), true);
    return;
  }

  let altText = (data.versionB || '').replace(/^["""]+|["""]+$/g, '').trim();

  // Şablona özgü kapanış sorusunu her zaman ekle (Formatlanmış Post ile aynı format)
  if (typeof templateCTA === 'function') {
    altText += '\n\n―\n\n' + templateCTA(state.activeTemplate, state.lang);
  }

  state.altText = altText;
  switchVersion('B');
}

/* ═══════════════════════════════════════════════
   VERSİYON TOGGLE (A ↔ B)
   ═══════════════════════════════════════════════ */
function switchVersion(ver) {
  state.activeVersion = ver;
  el.btnVersionA.classList.toggle('active', ver === 'A');
  el.btnVersionB.classList.toggle('active', ver === 'B');

  const text = ver === 'A' ? state.formattedText : state.altText;
  renderPreviewText(text);
  renderPreviewText(text, el.mobilePostText, 4, 280);

  // Hook analizi güncelle
  showHookAnalysis(text);

  // Readability güncelle (premium)
  if (state.isPremium) {
    renderReadabilityScore(text);
    renderReadabilityDetails(text);
  }
}

/* ═══════════════════════════════════════════════
   HASHTAGS (Pro)
   ═══════════════════════════════════════════════ */

/** Hashtag'i aktif versiyona ekler ve preview'ı günceller. */
function appendHashtagToAll(tag) {
  if (state.activeVersion === 'B' && state.altText) {
    state.altText += '\n' + tag;
    renderPreviewText(state.altText);
    renderPreviewText(state.altText, el.mobilePostText, 4, 280);
  } else {
    state.formattedText += '\n' + tag;
    renderPreviewText(state.formattedText);
    renderPreviewText(state.formattedText, el.mobilePostText, 4, 280);
  }
}

async function renderHashtags(text) {
  el.hashtagList.innerHTML = `<span style="font-size:11px;color:var(--text-4)">${escHtml(t(state.lang, 'generatingHashtags'))}</span>`;

  let tags = [];
  const aiResult = await fixTextWithAI(text, 'hashtags');
  if (aiResult) {
    tags = aiResult.match(/#[\w\u00C0-\u024F\u0130\u0131]+/g) || [];
  }
  if (!tags.length) tags = suggestHashtags(text);

  if (!tags.length) {
    el.hashtagList.innerHTML = '';
    return;
  }

  // Groq per-second rate limit: /format (hashtags) çağrısından sonra kısa bekleme
  await new Promise(r => setTimeout(r, 1500));

  // Direkt scored view'e geç; API başarısız olursa chip fallback
  const ok = await runHashtagScore(tags.slice(0, 8));
  if (!ok) {
    el.hashtagList.innerHTML = '';
    tags.slice(0, 10).forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'hashtag-btn';
      btn.textContent = tag;
      btn.addEventListener('click', () => {
        appendHashtagToAll(tag);
        btn.disabled = true;
      });
      el.hashtagList.appendChild(btn);
    });
  }
}

async function runHashtagScore(hashtags) {
  const data = await apiCall('/hashtag-score', { hashtags });
  if (!data || !data.result || !data.result.length) return false;

  // Replace simple buttons with scored display
  el.hashtagList.innerHTML = '';
  const scored = document.createElement('div');
  scored.className = 'hashtag-scored';

  data.result.forEach(item => {
    const pct = Math.max(clampPct(item.score), 4);
    const row = document.createElement('div');
    row.className = 'hashtag-score-row';
    row.innerHTML = `
      <span class="hashtag-score-tag">${escHtml(item.tag)}</span>
      <div class="hashtag-score-bar-wrap">
        <div class="hashtag-score-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="hashtag-score-label">${escHtml(translatePopularity(item.popularity))}</span>
    `;
    // Click to append
    row.querySelector('.hashtag-score-tag').style.cursor = 'pointer';
    row.querySelector('.hashtag-score-tag').addEventListener('click', () => {
      appendHashtagToAll(item.tag);
    });
    scored.appendChild(row);

    // Suggestion
    if (item.suggestion) {
      const sugg = document.createElement('button');
      sugg.className = 'hashtag-btn';
      sugg.textContent = item.suggestion;
      sugg.title = 'Suggested alternative';
      sugg.addEventListener('click', () => {
        appendHashtagToAll(item.suggestion);
        sugg.disabled = true;
      });
      scored.appendChild(sugg);
    }
  });

  el.hashtagList.appendChild(scored);
  return true;
}

/* ═══════════════════════════════════════════════
   COPY
   ═══════════════════════════════════════════════ */
async function copyText(textOverride) {
  const text = textOverride || (state.activeVersion === 'B' ? state.altText : state.formattedText);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast(t(state.lang, 'copied'));
  } catch {
    showToast(t(state.lang, 'copyFailed'), true);
  }
}

/* ═══════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════ */
function showToast(msg, isWarning = false) {
  const toastEl = el.copyToast;
  toastEl.textContent = msg;
  toastEl.className   = 'toast' + (isWarning ? ' warning' : '');
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.add('hidden'), 2400);
}

/* ═══════════════════════════════════════════════
   HISTORY
   ═══════════════════════════════════════════════ */
async function loadHistory() {
  const data    = await storageGet('postHistory');
  state.history = data.postHistory || [];
  updateHistoryDot();
}

async function saveToHistory(text, template) {
  const item = {
    text,
    template,
    preview: text.slice(0, 140),
    date: new Date().toLocaleString(undefined, {
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
    el.historyList.innerHTML = `<p class="history-empty">${escHtml(t(state.lang, 'noHistory'))}</p>`;
    return;
  }
  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-preview">${escHtml(item.preview)}</div>
      <div class="history-meta">
        <span>${escHtml(item.template)}</span>
        <span>${escHtml(item.date)}</span>
      </div>`;
    div.addEventListener('click', () => {
      state.formattedText        = item.text;
      renderPreviewText(item.text);
      renderPreviewText(item.text, el.mobilePostText, 4, 280);
      el.previewSection.classList.remove('hidden');
      closeHistory();
      switchTab('write');
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
   DRAFTS
   ═══════════════════════════════════════════════ */
async function renderDraftsList() {
  const drafts = await DraftManager.getDrafts();
  el.draftsList.innerHTML = '';

  if (!drafts.length) {
    el.draftsList.innerHTML = `<div class="drafts-empty">${escHtml(t(state.lang, 'noDrafts'))}</div>`;
    return;
  }

  drafts.forEach(draft => {
    const card = document.createElement('div');
    card.className = 'draft-card';
    const preview = (draft.formattedContent || draft.content || '').slice(0, 60);
    const date    = draft.updatedAt
      ? new Date(draft.updatedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';

    card.innerHTML = `
      <div class="draft-card-header">
        <span class="draft-title">${escHtml(draft.title)}</span>
        <div class="draft-actions">
          <button class="draft-btn load" data-id="${escHtml(draft.id)}">${escHtml(t(state.lang, 'loadDraft'))}</button>
          <button class="draft-btn del"  data-id="${escHtml(draft.id)}">${escHtml(t(state.lang, 'deleteDraft'))}</button>
        </div>
      </div>
      <div class="draft-preview">${escHtml(preview)}${preview.length === 60 ? '…' : ''}</div>
      <div class="draft-meta">
        <span>${escHtml(draft.template || '')}</span>
        <span>${escHtml(date)}</span>
      </div>
    `;

    card.querySelector('.draft-btn.load').addEventListener('click', async () => {
      const d = await DraftManager.loadDraft(draft.id);
      if (!d) return;
      el.inputText.value = d.content || '';
      if (d.formattedContent) {
        state.formattedText = d.formattedContent;
        renderPreviewText(d.formattedContent);
        renderPreviewText(d.formattedContent, el.mobilePostText, 4, 280);
        el.previewSection.classList.remove('hidden');
      }
      updateCharCount();
      switchTab('write');
      showToast(t(state.lang, 'draftLoaded'));
    });

    card.querySelector('.draft-btn.del').addEventListener('click', async () => {
      await DraftManager.deleteDraft(draft.id);
      renderDraftsList();
    });

    el.draftsList.appendChild(card);
  });
}

function openDraftNameModal(prefill) {
  el.draftNameInput.value = prefill || '';
  el.draftNameModal.classList.remove('hidden');
  el.draftNameInput.placeholder = t(state.lang, 'draftNamePlaceholder');
  setTimeout(() => el.draftNameInput.focus(), 50);
}

function closeDraftNameModal() {
  el.draftNameModal.classList.add('hidden');
}

async function saveDraftWithModal() {
  if (!state.formattedText) { showToast(t(state.lang, 'writeSomething'), true); return; }

  // Free limit check
  const atLimit = await DraftManager.isAtFreeLimit(state.isPremium);
  if (atLimit) {
    showToast(t(state.lang, 'freeLimitDrafts'), true);
    return;
  }

  openDraftNameModal();
}

async function confirmSaveDraft() {
  const title = el.draftNameInput.value.trim() || t(state.lang, 'autoSave');
  const formattedContent = state.activeVersion === 'B' && state.altText
    ? state.altText
    : state.formattedText;
  await DraftManager.saveDraft({
    title,
    content: formattedContent,
    formattedContent,
    template: state.activeTemplate,
    tone:     state.activeTon,
    language: state.lang,
  });
  closeDraftNameModal();
  showToast(t(state.lang, 'draftSaved'));
  renderDraftsList();
}


/* ═══════════════════════════════════════════════
   TONE PROFILE (Pro)
   ═══════════════════════════════════════════════ */
async function loadToneProfile() {
  const data = await storageGet('toneProfile');
  state.toneProfile = data.toneProfile || null;
  if (state.toneProfile) renderToneProfile(state.toneProfile);
}

async function analyzeToneProfile() {
  if (!state.isPremium) { openPremiumModal(); return; }

  const posts = [el.toneSample1.value.trim(), el.toneSample2.value.trim(), el.toneSample3.value.trim()]
    .filter(Boolean);
  if (!posts.length) { showToast(t(state.lang, 'enterSample'), true); return; }

  el.btnAnalyzeTone.textContent = t(state.lang, 'analyzingTone') || 'Analyzing…';
  el.btnAnalyzeTone.disabled    = true;

  const data = await apiCall('/tone-analyze', { posts });

  el.btnAnalyzeTone.textContent = t(state.lang, 'analyzeTone') || 'Analyze My Tone';
  el.btnAnalyzeTone.disabled    = false;

  if (!data || !data.result) {
    showToast(t(state.lang, 'toneAnalysisFailed'), true);
    return;
  }

  state.toneProfile = data.result;
  await storageSet({ toneProfile: data.result });
  renderToneProfile(data.result);
}

/**
 * Maps known AI-returned English enum strings to i18n keys,
 * then translates them. Falls back to the raw value if no mapping found.
 */
function translateToneValue(raw) {
  if (!raw) return '—';
  const normalized = String(raw).toLowerCase().replace(/[\s_]+/g, '-');
  const MAP = {
    'none':               'toneValNone',
    'low':                'toneValLow',
    'moderate':           'toneValModerate',
    'high':               'toneValHigh',
    'short':              'toneValShort',
    'medium':             'toneValMedium',
    'long':               'toneValLong',
    'motivational':       'toneValMotivational',
    'analytical':         'toneValAnalytical',
    'storyteller':        'toneValStoryteller',
    'educator':           'toneValEducator',
    'thought-leader':     'toneValThoughtLeader',
    'casual':             'toneValCasual',
    'professional':       'toneValProfessional',
    'casual-professional':'toneValCasualProfessional',
  };
  const key = MAP[normalized];
  return key ? t(state.lang, key) : raw;
}

/** AI'dan gelen İngilizce popularity etiketini aktif dile çevirir. */
function translatePopularity(raw) {
  if (!raw) return '';
  const normalized = String(raw).toLowerCase().replace(/[\s_]+/g, '-');
  const MAP = {
    'very-popular': 'popVeryPopular',
    'popular':      'popPopular',
    'moderate':     'popModerate',
    'niche':        'popNiche',
    'very-niche':   'popVeryNiche',
  };
  const key = MAP[normalized];
  return key ? t(state.lang, key) : raw;
}

function renderToneProfile(profile) {
  const traits = [
    { key: t(state.lang, 'traitStyle'),       val: translateToneValue(profile.style) },
    { key: t(state.lang, 'traitEmoji'),        val: translateToneValue(profile.emojiUsage) },
    { key: t(state.lang, 'traitSentence'),     val: translateToneValue(profile.sentenceLength) },
    { key: t(state.lang, 'traitPersonality'),  val: translateToneValue(profile.personality) },
  ];

  const keywordsHtml = Array.isArray(profile.keywords)
    ? profile.keywords.map(k => `<span class="tone-keyword">${escHtml(k)}</span>`).join('')
    : '';

  el.toneProfileContent.innerHTML = traits.map(tr => `
    <div class="tone-trait">
      <span class="tone-trait-key">${escHtml(tr.key)}</span>
      <span class="tone-trait-val">${escHtml(tr.val || '—')}</span>
    </div>
  `).join('') + (keywordsHtml ? `<div class="tone-keywords">${keywordsHtml}</div>` : '');

  el.toneProfileCard.classList.remove('hidden');
}

/* ═══════════════════════════════════════════════
   API STATUS CHECK
   ═══════════════════════════════════════════════ */
async function checkApiStatus() {
  try {
    const res  = await fetch(API_BASE + '/health');
    const data = await res.json();
    if (data.status === 'ok') {
      el.apiStatusText.textContent = t(state.lang, 'apiOnline');
      el.apiStatusDot.className    = 'api-status-dot ok';
      if (data.usage) {
        el.apiUsageText.textContent = `${data.usage.today.toLocaleString()} / ${data.usage.limit.toLocaleString()}`;
      }
    } else { throw new Error(); }
  } catch {
    el.apiStatusText.textContent = t(state.lang, 'apiOffline');
    el.apiStatusDot.className    = 'api-status-dot err';
  }
}

/* ═══════════════════════════════════════════════
   USAGE COUNTER (free plan)
   ═══════════════════════════════════════════════ */
async function getUsageStatus() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return null;
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, res => {
      resolve(res || null);
    });
  });
}

async function incrementUsage() {
  if (state.isPremium) return;
  if (typeof chrome === 'undefined' || !chrome.runtime) return;
  chrome.runtime.sendMessage({ type: 'INCREMENT_USAGE' });
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
  // Keep placeholder in current language (don't override with hardcoded English from tmpl.placeholder)
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

function closeAllModals() {
  closePremiumModal();
  closeHistory();
  closeDraftNameModal();
}

/* ═══════════════════════════════════════════════
   LICENSE
   ═══════════════════════════════════════════════ */
async function activateLicense() {
  const key = el.licenseKeyInput.value.trim();
  if (!key) { showLicenseMsg(t(state.lang, 'licenseEnterKey'), 'error'); return; }

  el.btnActivate.textContent = t(state.lang, 'licenseChecking');
  el.btnActivate.disabled    = true;
  el.licenseError.classList.add('hidden');
  el.licenseSuccess.classList.add('hidden');

  const res = await LicenseManager.verify(key);

  el.btnActivate.textContent = t(state.lang, 'licenseActivate');
  el.btnActivate.disabled    = false;

  if (res.success) {
    showLicenseMsg(t(state.lang, 'licenseUnlocked'), 'success');
    state.isPremium = true;
    applyPremiumUI();
    setTimeout(closePremiumModal, 1800);
  } else {
    showLicenseMsg(res.error || t(state.lang, 'licenseInvalid'), 'error');
  }
}

async function deactivateLicense() {
  await LicenseManager.deactivate();
  state.isPremium = false;
  if (el.settingsLicenseInput) el.settingsLicenseInput.value = '';
  if (el.settingsLicenseMsg)   el.settingsLicenseMsg.classList.add('hidden');
  applyPremiumUI();
  showToast(t(state.lang, 'licenseRemoved'));
}

async function activateLicenseFromSettings() {
  const key = el.settingsLicenseInput ? el.settingsLicenseInput.value.trim() : '';
  if (!key) {
    showSettingsLicenseMsg(t(state.lang, 'licenseEnterKey'), 'error');
    return;
  }

  if (el.btnSettingsActivate) {
    el.btnSettingsActivate.textContent = t(state.lang, 'licenseChecking');
    el.btnSettingsActivate.disabled    = true;
  }
  if (el.settingsLicenseMsg) el.settingsLicenseMsg.classList.add('hidden');

  const res = await LicenseManager.verify(key);

  if (el.btnSettingsActivate) {
    el.btnSettingsActivate.textContent = 'Aktif Et';
    el.btnSettingsActivate.disabled    = false;
  }

  if (res.success) {
    state.isPremium = true;
    applyPremiumUI();
    showToast(t(state.lang, 'licenseUnlocked'));
  } else {
    showSettingsLicenseMsg(res.error || t(state.lang, 'licenseInvalid'), 'error');
  }
}

function showSettingsLicenseMsg(msg, type) {
  if (!el.settingsLicenseMsg) return;
  el.settingsLicenseMsg.textContent = msg;
  el.settingsLicenseMsg.className   = `msg msg-${type}`;
}

function showLicenseMsg(msg, type) {
  const target = type === 'error' ? el.licenseError : el.licenseSuccess;
  const other  = type === 'error' ? el.licenseSuccess : el.licenseError;
  target.textContent = msg;
  target.classList.remove('hidden');
  other.classList.add('hidden');
}

/* ═══════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════ */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Ctrl+Enter → Format
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      formatPost();
      return;
    }
    // Ctrl+S → Save draft
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveDraftWithModal();
      return;
    }
    // Ctrl+C → Copy (only when not typing in input)
    if (e.ctrlKey && e.key === 'c' && state.formattedText) {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (!isInput) {
        e.preventDefault();
        copyText();
      }
      return;
    }
    // Esc → Close modals
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

/* ═══════════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════════ */
function bindEvents() {
  // Char count + see more
  el.inputText.addEventListener('input', updateCharCount);

  // Format
  el.btnFormat.addEventListener('click', formatPost);

  // Copy
  el.btnCopy.addEventListener('click', () => copyText());
  el.btnCopyMobile.addEventListener('click', () => copyText());

  // Clear input
  el.btnClearInput.addEventListener('click', () => {
    el.inputText.value = '';
    updateCharCount();
    el.previewSection.classList.add('hidden');
    el.hookCard.classList.add('hidden');
    el.viralSection.classList.add('hidden');
    if (el.versionToggle) el.versionToggle.classList.add('hidden');
    state.formattedText  = '';
    state.altText        = '';
    state.activeVersion  = 'A';
  });

  // Versiyon toggle
  if (el.btnVersionA) {
    el.btnVersionA.addEventListener('click', () => switchVersion('A'));
  }
  if (el.btnVersionB) {
    el.btnVersionB.addEventListener('click', () => {
      if (state.altText) {
        switchVersion('B');
      } else {
        runABTest();
      }
    });
  }

  // Analyze (viral)
  el.btnAnalyze.addEventListener('click', runViralAnalysis);

  // Edit preview
  el.btnEdit.addEventListener('click', toggleEditPreview);

  // Preview toggle (Desktop / Mobile)
  el.btnPreviewDesktop.addEventListener('click', () => setPreviewMode('desktop'));
  el.btnPreviewMobile.addEventListener('click',  () => setPreviewMode('mobile'));

  // Save draft
  el.btnSaveDraft.addEventListener('click', saveDraftWithModal);
  el.btnNewDraft.addEventListener('click',  saveDraftWithModal);

  // Draft modal
  el.btnDraftSave.addEventListener('click', confirmSaveDraft);
  el.btnDraftCancel.addEventListener('click', closeDraftNameModal);
  el.draftNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmSaveDraft(); });

  // Main tabs
  document.querySelectorAll('.main-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Templates
  el.templateTabs.querySelectorAll('.tpl-chip').forEach(btn => {
    btn.addEventListener('click', () =>
      selectTemplate(btn.dataset.template, btn.dataset.premium === 'true')
    );
  });

  // Tone buttons
  el.tonButtons.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => selectTon(btn.dataset.ton));
  });

  // Premium modal
  el.btnUpgrade.addEventListener('click', openPremiumModal);
  el.btnClosePremium.addEventListener('click', closePremiumModal);
  el.premiumModal.addEventListener('click', e => { if (e.target === el.premiumModal) closePremiumModal(); });
  el.tonPremiumBadge.addEventListener('click', openPremiumModal);
  if (el.hashtagPremiumBadge) el.hashtagPremiumBadge.addEventListener('click', openPremiumModal);
  el.btnSettingsUpgrade.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://buy.polar.sh/polar_cl_0F5MBFNqgj2aqh8e8LfYJPankoTeyXjlN0z6P3lCNPZ' });
  });
  el.btnDeactivate.addEventListener('click', () => {
    document.getElementById('deactivateModal').classList.remove('hidden');
  });
  document.getElementById('btnCloseDeactivate').addEventListener('click', () => {
    document.getElementById('deactivateModal').classList.add('hidden');
  });
  document.getElementById('btnCancelDeactivate').addEventListener('click', () => {
    document.getElementById('deactivateModal').classList.add('hidden');
  });
  document.getElementById('btnConfirmDeactivate').addEventListener('click', () => {
    document.getElementById('deactivateModal').classList.add('hidden');
    deactivateLicense();
  });
  document.getElementById('deactivateModal').addEventListener('click', e => {
    if (e.target === document.getElementById('deactivateModal')) {
      document.getElementById('deactivateModal').classList.add('hidden');
    }
  });

  // License — premium modal
  el.btnActivate.addEventListener('click', activateLicense);
  el.licenseKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') activateLicense(); });

  // License — settings tab
  if (el.btnSettingsActivate) {
    el.btnSettingsActivate.addEventListener('click', activateLicenseFromSettings);
  }
  if (el.settingsLicenseInput) {
    el.settingsLicenseInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') activateLicenseFromSettings();
    });
  }

  // History
  el.btnHistory.addEventListener('click', openHistory);
  el.btnCloseHistory.addEventListener('click', closeHistory);
  el.btnClearHistory.addEventListener('click', clearHistory);
  el.historyModal.addEventListener('click', e => { if (e.target === el.historyModal) closeHistory(); });

  // Tone profile
  el.btnAnalyzeTone.addEventListener('click', analyzeToneProfile);

  // Settings: language
  el.langSelect.addEventListener('change', async () => {
    state.lang = el.langSelect.value;
    applyLang(state.lang);
    await storageSet({ preferredLanguage: state.lang });
  });

  // Settings: theme
  el.themeSelect.addEventListener('change', async () => {
    state.colorScheme = el.themeSelect.value;
    applyTheme(state.colorScheme);
    await storageSet({ colorScheme: state.colorScheme });
  });

  // Keyboard shortcuts
  setupKeyboardShortcuts();
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clampPct(val) { return Math.max(0, Math.min(100, Number(val) || 0)); }

/* ── START ── */
document.addEventListener('DOMContentLoaded', init);
