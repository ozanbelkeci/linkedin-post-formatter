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

// Kullanım sayacını güncelle (popup her açıldığında)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INCREMENT_USAGE') {
    chrome.storage.local.get('usageCount', (data) => {
      const newCount = (data.usageCount || 0) + 1;
      chrome.storage.local.set({ usageCount: newCount });
      sendResponse({ usageCount: newCount });
    });
    return true; // async response için
  }

  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(['usageCount', 'licenseValid', 'licenseKey'], (data) => {
      sendResponse({
        usageCount:   data.usageCount || 0,
        isPremium:    data.licenseValid === true,
        hasLicense:   !!data.licenseKey
      });
    });
    return true;
  }
});
