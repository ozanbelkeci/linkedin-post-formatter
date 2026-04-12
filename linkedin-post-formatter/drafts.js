/* =============================================
   LinkedIn Post Formatter — Draft Sistemi
   ============================================= */

'use strict';

const DraftManager = (() => {
  const MAX_DRAFTS    = 50;
  const FREE_LIMIT    = 3;
  const STORAGE_KEY   = 'drafts';

  /* ------------------------------------------
     Storage Yardımcıları
     ------------------------------------------ */
  function storageGet(key) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(key, data => resolve(data[key]));
      } else {
        try { resolve(JSON.parse(localStorage.getItem(key))); } catch { resolve(null); }
      }
    });
  }

  function storageSet(key, value) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ [key]: value }, resolve);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
        resolve();
      }
    });
  }

  /* ------------------------------------------
     Draft Listesini Al
     ------------------------------------------ */
  async function getDrafts() {
    const drafts = await storageGet(STORAGE_KEY);
    return Array.isArray(drafts) ? drafts : [];
  }

  /* ------------------------------------------
     Draft Kaydet
     ------------------------------------------ */
  async function saveDraft({ title, content, formattedContent = '', template = '', language = 'tr', tone = 'profesyonel' }) {
    if (!content || !content.trim()) return null;

    const drafts  = await getDrafts();
    const now     = new Date().toISOString();
    const autoIdx = drafts.findIndex(d => d.title === 'Auto-save');

    // Auto-save ise mevcut olanı güncelle
    if (title === 'Auto-save' && autoIdx !== -1) {
      drafts[autoIdx] = { ...drafts[autoIdx], content, formattedContent, template, language, tone, updatedAt: now };
      await storageSet(STORAGE_KEY, drafts);
      return drafts[autoIdx];
    }

    const newDraft = {
      id:               'draft_' + Date.now(),
      title:            title || 'İsimsiz Draft',
      content,
      formattedContent,
      template,
      language,
      tone,
      createdAt:        now,
      updatedAt:        now,
    };

    drafts.unshift(newDraft);

    // Limit: en eskiyi sil (auto-save'leri koru)
    if (drafts.length > MAX_DRAFTS) {
      const lastNonAuto = [...drafts].reverse().findIndex(d => d.title !== 'Auto-save');
      if (lastNonAuto !== -1) {
        drafts.splice(drafts.length - 1 - lastNonAuto, 1);
      } else {
        drafts.pop();
      }
    }

    await storageSet(STORAGE_KEY, drafts);
    return newDraft;
  }

  /* ------------------------------------------
     Draft Sil
     ------------------------------------------ */
  async function deleteDraft(id) {
    const drafts  = await getDrafts();
    const updated = drafts.filter(d => d.id !== id);
    await storageSet(STORAGE_KEY, updated);
    return updated;
  }

  /* ------------------------------------------
     Draft Yükle
     ------------------------------------------ */
  async function loadDraft(id) {
    const drafts = await getDrafts();
    return drafts.find(d => d.id === id) || null;
  }

  /* ------------------------------------------
     Free Limit Kontrolü
     ------------------------------------------ */
  async function isAtFreeLimit(isPremium) {
    if (isPremium) return false;
    const drafts = await getDrafts();
    const named  = drafts.filter(d => d.title !== 'Auto-save');
    return named.length >= FREE_LIMIT;
  }

  /* ------------------------------------------
     Public API
     ------------------------------------------ */
  return {
    getDrafts,
    saveDraft,
    deleteDraft,
    loadDraft,
    isAtFreeLimit,
    FREE_LIMIT,
    MAX_DRAFTS,
  };
})();
