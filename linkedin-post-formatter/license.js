/* =============================================
   Postify — Lisans Yönetimi
   Polar.sh License Key API Entegrasyonu
   ============================================= */

'use strict';

const LicenseManager = (() => {

  // Lisans doğrulama worker üzerinden yapılır — token client'ta görünmez
  const VALIDATE_URL = 'https://linkedin-post-formatter-api.belkeci-ozan.workers.dev/validate-license';

  // Cache süresi: 24 saat (ms)
  const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

  /* ------------------------------------------
     Chrome Storage Yardımcıları
     ------------------------------------------ */
  function storageGet(keys) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(keys, resolve);
      } else {
        const result = {};
        const keyArr = typeof keys === 'string' ? [keys] : keys;
        keyArr.forEach(k => {
          try { result[k] = JSON.parse(localStorage.getItem('lic_' + k)); } catch { result[k] = null; }
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
        Object.entries(obj).forEach(([k, v]) => {
          localStorage.setItem('lic_' + k, JSON.stringify(v));
        });
        resolve();
      }
    });
  }

  function storageRemove(keys) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.remove(keys, resolve);
      } else {
        const keyArr = typeof keys === 'string' ? [keys] : keys;
        keyArr.forEach(k => localStorage.removeItem('lic_' + k));
        resolve();
      }
    });
  }

  /* ------------------------------------------
     Premium Durumu Kontrol Et
     ------------------------------------------ */
  async function isPremium() {
    const data = await storageGet(['licenseKey', 'validatedAt', 'licenseValid']);
    const { licenseKey, validatedAt, licenseValid } = data;

    if (!licenseKey || !licenseValid) return false;

    // Cache hâlâ geçerliyse doğrulamadan dön
    if (validatedAt) {
      const elapsed = Date.now() - validatedAt;
      if (elapsed < CACHE_DURATION_MS) {
        return licenseValid === true;
      }
    }

    // Cache süresi dolmuşsa arka planda yeniden doğrula
    verifyAndCache(licenseKey).catch(() => {});

    // Şimdilik mevcut cache'i döndür
    return licenseValid === true;
  }

  /* ------------------------------------------
     Lisans Doğrula (public entry point)
     ------------------------------------------ */
  async function verify(licenseKey) {
    const clean = (licenseKey || '').trim().toUpperCase();
    if (!clean || !/^[A-Z0-9-]{8,100}$/.test(clean)) {
      return { success: false, error: 'Geçersiz lisans anahtarı formatı.' };
    }
    return verifyWithPolar(clean);
  }

  /* ------------------------------------------
     Worker üzerinden Polar.sh Doğrulama
     Token client'ta görünmez; worker gizli tutar.
     ------------------------------------------ */
  async function verifyWithPolar(key) {
    try {
      const response = await fetch(VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        return { success: false, networkError: true, error: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.' };
      }

      const data = await response.json();

      if (data.success) {
        await cacheValidLicense(key);
        return { success: true };
      }

      // networkError flag'i worker'dan gelebilir (Polar'a ulaşılamadı)
      if (data.networkError) {
        return { success: false, networkError: true, error: data.error || 'Bağlantı hatası.' };
      }

      await invalidateLicense();
      return { success: false, error: data.error || 'Geçersiz lisans anahtarı.' };

    } catch (err) {
      console.error('[LicenseManager] Worker bağlantı hatası:', err);
      return { success: false, networkError: true, error: 'Bağlantı hatası. Lütfen tekrar deneyin.' };
    }
  }

  /* ------------------------------------------
     Extension Açılışında Doğrulama
     Her açılışta Polar API'ye sorar; ağ hatası olursa
     önbelleğe düşer (offline kullanıcıyı cezalandırmaz).
     ------------------------------------------ */
  async function validateOnOpen() {
    const data = await storageGet(['licenseKey', 'licenseValid', 'validatedAt']);

    // Kayıtlı key yok → kesinlikle free
    if (!data.licenseKey) return { isPremium: false };

    // Cache hâlâ geçerliyse Polar API'ye gitme
    if (data.licenseValid === true && data.validatedAt) {
      const elapsed = Date.now() - data.validatedAt;
      if (elapsed < CACHE_DURATION_MS) {
        return { isPremium: true };
      }
    }

    const result = await verifyWithPolar(data.licenseKey);

    if (result.success) {
      return { isPremium: true };
    } else if (result.networkError) {
      // Ağ hatası → önbelleğe dön, kullanıcıyı cezalandırma
      return { isPremium: data.licenseValid === true, offlineMode: true };
    } else {
      // Anahtar iptal edilmiş veya geçersiz → premium'u kapat
      await invalidateLicense();
      return { isPremium: false, revoked: true };
    }
  }

  /* ------------------------------------------
     Arka Planda Cache Yenileme
     ------------------------------------------ */
  async function verifyAndCache(key) {
    const result = await verifyWithPolar(key);
    if (!result.success) {
      await invalidateLicense();
    }
  }

  /* ------------------------------------------
     Cache İşlemleri
     ------------------------------------------ */
  async function cacheValidLicense(key) {
    await storageSet({
      licenseKey:   key,
      licenseValid: true,
      validatedAt:  Date.now(),
    });
  }

  async function invalidateLicense() {
    await storageSet({
      licenseValid: false,
      validatedAt:  Date.now(),
    });
  }

  /* ------------------------------------------
     Lisansı Kaldır (bu cihazdan)
     ------------------------------------------ */
  async function deactivate() {
    await storageRemove(['licenseKey', 'licenseValid', 'validatedAt']);
  }

  /* ------------------------------------------
     Lisans Bilgisi Al
     ------------------------------------------ */
  async function getLicenseInfo() {
    const data = await storageGet(['licenseKey', 'validatedAt', 'licenseValid']);
    return {
      key:       data.licenseKey || null,
      isValid:   data.licenseValid || false,
      lastCheck: data.validatedAt
        ? new Date(data.validatedAt).toLocaleDateString('tr-TR')
        : null,
    };
  }

  /* ------------------------------------------
     Feature Access Kontrolü
     ------------------------------------------ */
  const PREMIUM_FEATURES = ['ab-test', 'analyze', 'tone', 'hashtag-score', 'unlimited-format', 'unlimited-drafts'];

  async function checkFeatureAccess(feature) {
    const premium = await isPremium();
    if (PREMIUM_FEATURES.includes(feature) && !premium) return false;
    return true;
  }

  /* ------------------------------------------
     Public API
     ------------------------------------------ */
  return {
    isPremium,
    validateOnOpen,
    verify,
    deactivate,
    getLicenseInfo,
    checkFeatureAccess,
  };

})();
