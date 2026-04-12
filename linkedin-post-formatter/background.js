/* =============================================
   LinkedIn Post Formatter — Service Worker
   Manifest V3 Background Script
   ============================================= */

'use strict';

// Extension yüklendiğinde çalışır
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[LinkedIn Post Formatter] Extension yüklendi. Hoş geldiniz!');

    // Varsayılan ayarları kaydet
    chrome.storage.local.set({
      installedAt:   Date.now(),
      usageCount:    0,
      licenseValid:  false,
      postHistory:   []
    });

  } else if (reason === 'update') {
    console.log('[LinkedIn Post Formatter] Extension güncellendi.');
  }
});

function todayStr() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// Kullanım sayacını güncelle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INCREMENT_USAGE') {
    chrome.storage.local.get(['usageCount', 'dailyUsage', 'usageDate'], (data) => {
      const today    = todayStr();
      const newTotal = (data.usageCount || 0) + 1;
      const daily    = data.usageDate === today ? (data.dailyUsage || 0) + 1 : 1;
      chrome.storage.local.set({ usageCount: newTotal, dailyUsage: daily, usageDate: today });
      sendResponse({ usageCount: newTotal, dailyUsage: daily });
    });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(['usageCount', 'dailyUsage', 'usageDate', 'licenseValid', 'licenseKey'], (data) => {
      const today = todayStr();
      const daily = data.usageDate === today ? (data.dailyUsage || 0) : 0;
      sendResponse({
        usageCount: data.usageCount || 0,
        count:      daily,
        isPremium:  data.licenseValid === true,
        hasLicense: !!data.licenseKey
      });
    });
    return true;
  }
});
