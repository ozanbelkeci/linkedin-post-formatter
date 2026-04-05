/* =============================================
   LinkedIn Post Formatter — Lisans Yönetimi
   Aşama 4: Gumroad License Key API Entegrasyonu
   ============================================= */

'use strict';

const LicenseManager = (() => {

  // Gumroad ürün ID'si — Gumroad'dan ürün oluşturduktan sonra buraya ekle
  const GUMROAD_PRODUCT_ID = 'YOUR_GUMROAD_PRODUCT_ID';

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
        // Geliştirme fallback
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
    const data = await storageGet(['licenseKey', 'licenseVerifiedAt', 'licenseValid']);

    const { licenseKey, licenseVerifiedAt, licenseValid } = data;

    if (!licenseKey || !licenseValid) return false;

    // Cache hâlâ geçerliyse doğrulamadan dön
    if (licenseVerifiedAt) {
      const elapsed = Date.now() - licenseVerifiedAt;
      if (elapsed < CACHE_DURATION_MS) {
        return licenseValid === true;
      }
    }

    // Cache süresi dolmuşsa yeniden doğrula (arka planda)
    verifyAndCache(licenseKey).catch(() => {});

    // Şimdilik mevcut cache'i döndür
    return licenseValid === true;
  }

  /* ------------------------------------------
     Lisans Doğrula (Gumroad API)
     ------------------------------------------ */
  async function verify(licenseKey) {
    if (!licenseKey || licenseKey.trim().length < 8) {
      return { success: false, error: 'Geçersiz lisans anahtarı formatı.' };
    }

    // Ürün ID henüz tanımlanmamışsa test moduna geç
    if (GUMROAD_PRODUCT_ID === 'YOUR_GUMROAD_PRODUCT_ID') {
      return verifyTestMode(licenseKey);
    }

    return verifyWithGumroad(licenseKey);
  }

  /* ------------------------------------------
     Gumroad API ile Gerçek Doğrulama
     ------------------------------------------ */
  async function verifyWithGumroad(licenseKey) {
    try {
      const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id:  GUMROAD_PRODUCT_ID,
          license_key: licenseKey.trim()
        })
      });

      if (!response.ok) {
        return { success: false, error: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.' };
      }

      const data = await response.json();

      if (data.success && !data.purchase.refunded && !data.purchase.chargebacked) {
        await cacheValidLicense(licenseKey);
        return {
          success:     true,
          email:       data.purchase.email,
          createdAt:   data.purchase.created_at
        };
      } else {
        await invalidateLicense();
        const reason = data.purchase?.refunded
          ? 'Bu lisans iade edilmiş.'
          : (data.message || 'Geçersiz lisans anahtarı.');
        return { success: false, error: reason };
      }

    } catch (err) {
      console.error('[LicenseManager] Gumroad API hatası:', err);
      return { success: false, error: 'Bağlantı hatası. Lütfen tekrar deneyin.' };
    }
  }

  /* ------------------------------------------
     Test Modu (Gumroad ID ayarlanmamışsa)
     Demo anahtarı: LINKEDIN-PRO-TEST-2024
     ------------------------------------------ */
  async function verifyTestMode(licenseKey) {
    const DEMO_KEYS = [
      'LINKEDIN-PRO-TEST-2024',
      'TEST-PREMIUM-KEY',
      'DEMO-1234-5678-9012'
    ];

    await new Promise(r => setTimeout(r, 800)); // API gecikmesi simülasyonu

    if (DEMO_KEYS.includes(licenseKey.toUpperCase())) {
      await cacheValidLicense(licenseKey);
      return {
        success:  true,
        testMode: true,
        email:    'test@example.com'
      };
    }

    return {
      success: false,
      error:   'Geçersiz lisans. Test için: LINKEDIN-PRO-TEST-2024'
    };
  }

  /* ------------------------------------------
     Arka Planda Cache Yenileme
     ------------------------------------------ */
  async function verifyAndCache(licenseKey) {
    const result = await verifyWithGumroad(licenseKey);
    if (!result.success) {
      await invalidateLicense();
    }
  }

  /* ------------------------------------------
     Cache İşlemleri
     ------------------------------------------ */
  async function cacheValidLicense(licenseKey) {
    await storageSet({
      licenseKey,
      licenseValid:      true,
      licenseVerifiedAt: Date.now()
    });
  }

  async function invalidateLicense() {
    await storageSet({
      licenseValid:      false,
      licenseVerifiedAt: Date.now()
    });
  }

  /* ------------------------------------------
     Lisansı Kaldır (çıkış yap)
     ------------------------------------------ */
  async function deactivate() {
    await storageRemove(['licenseKey', 'licenseValid', 'licenseVerifiedAt']);
  }

  /* ------------------------------------------
     Lisans Bilgisi Al
     ------------------------------------------ */
  async function getLicenseInfo() {
    const data = await storageGet(['licenseKey', 'licenseVerifiedAt', 'licenseValid']);
    return {
      key:        data.licenseKey || null,
      isValid:    data.licenseValid || false,
      lastCheck:  data.licenseVerifiedAt
        ? new Date(data.licenseVerifiedAt).toLocaleDateString('tr-TR')
        : null
    };
  }

  /* ------------------------------------------
     Public API
     ------------------------------------------ */
  return {
    isPremium,
    verify,
    deactivate,
    getLicenseInfo
  };

})();
