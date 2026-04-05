# LinkedIn Post Formatter — Chrome Extension Proje Planı

## Proje Özeti

**Ürün:** LinkedIn Post Formatter  
**Tür:** Chrome Extension  
**Gelir Modeli:** Freemium ($6/ay Premium)  
**Hedef Kitle:** LinkedIn'de içerik üreten herkes  
**Tahmini Geliştirme Süresi:** 2–3 hafta  
**Aylık Maliyet:** $0 (sadece Chrome Store için $5 tek seferlik)

---

## Ürün Açıklaması

Kullanıcı LinkedIn postu yazmak istediğinde extension'ı açar, metnini girer ve istediği şablonu seçer. Extension metni LinkedIn'e uygun formata dönüştürür: satır aralıklarını düzenler, emoji ekler, hook'u güçlendirir ve kopyalamaya hazır hale getirir.

---

## Özellikler

### Ücretsiz Plan
- Metin giriş alanı
- 3 temel şablon:
  - Hikaye formatı (kişisel deneyim)
  - Liste formatı (5 maddelik ipucu)
  - Fikir formatı (kısa ve güçlü görüş)
- Otomatik satır aralığı düzenleme
- Emoji önerileri
- Karakter sayacı (LinkedIn 3.000 karakter limiti)
- Tek tıkla kopyalama

### Premium Plan — $6/ay
- 10+ format şablonu
- Hashtag önerici (konuya göre otomatik)
- Okunabilirlik skoru
- Post geçmişi (son 10 post)
- Ton seçici: profesyonel / samimi / motivasyonel

---

## Teknik Stack

| Katman | Teknoloji | Maliyet |
|---|---|---|
| Arayüz | HTML + CSS + Vanilla JavaScript | Ücretsiz |
| Stil | Tailwind CSS (CDN) | Ücretsiz |
| Veri Saklama | Chrome Storage API | Ücretsiz |
| Ödeme | Gumroad | Satıştan %10 |
| Lisans Sistemi | Gumroad License Key API | Ücretsiz |
| Sunucu | Yok | $0/ay |
| Yayın | Chrome Web Store | $5 tek seferlik |

---

## Dosya Yapısı

```
linkedin-post-formatter/
├── manifest.json          # Chrome Extension tanım dosyası
├── popup.html             # Extension arayüzü
├── popup.js               # Ana JavaScript dosyası
├── styles.css             # Stil dosyası
├── background.js          # Arka plan işlemleri
├── license.js             # Gumroad lisans doğrulama
├── templates.js           # Post şablonları
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Geliştirme Aşamaları

### Aşama 1: Temel Kurulum
- [ ] Proje klasörünü oluştur
- [ ] `manifest.json` dosyasını yaz (Manifest V3)
- [ ] Temel `popup.html` iskeletini oluştur
- [ ] Extension'ı Chrome'a yükle ve test et

### Aşama 2: Ücretsiz Özellikler
- [ ] Metin giriş alanını tasarla
- [ ] 3 temel şablonu kodla (hikaye, liste, fikir)
- [ ] Formatlama algoritmasını yaz
- [ ] Emoji öneri sistemini ekle
- [ ] Karakter sayacını ekle
- [ ] Kopyala butonunu ekle
- [ ] Chrome Storage API ile ayarları kaydet

### Aşama 3: Premium Özellikler
- [ ] 10+ şablon ekle
- [ ] Hashtag önerici yaz
- [ ] Okunabilirlik skoru hesaplama algoritması
- [ ] Post geçmişi sistemi (Chrome Storage)
- [ ] Ton seçici (profesyonel / samimi / motivasyonel)
- [ ] Premium / ücretsiz kısıtlama mantığı

### Aşama 4: Ödeme ve Lisans Sistemi
- [ ] Gumroad'da hesap aç
- [ ] $6/ay abonelik ürünü oluştur
- [ ] `license.js` ile Gumroad License Key API entegrasyonu
- [ ] Lisans key giriş ekranı tasarla
- [ ] "Premium'a Geç" butonu ekle
- [ ] Lisans doğrulama ve premium açma/kapama mantığı

### Aşama 5: Yayın
- [ ] Extension ikonlarını hazırla (Canva ile)
- [ ] Chrome Web Store açıklamasını yaz (İngilizce)
- [ ] Ekran görüntülerini hazırla (en az 3 adet)
- [ ] Chrome Developer hesabı aç ($5)
- [ ] Extension'ı zip olarak paketle
- [ ] Store'a yükle ve incelemeye gönder

### Aşama 6: Pazarlama
- [ ] ProductHunt'ta launch sayfası hazırla
- [ ] LinkedIn'de tanıtım postu yaz
- [ ] Reddit paylaşımları: r/linkedin, r/productivity, r/SideProject
- [ ] AI ile düzenli sosyal medya içeriği üret

---

## manifest.json İçeriği

```json
{
  "manifest_version": 3,
  "name": "LinkedIn Post Formatter",
  "version": "1.0",
  "description": "Format your LinkedIn posts instantly. Get more engagement with professional templates.",
  "permissions": ["storage"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## Gumroad Lisans Entegrasyonu

```javascript
// Lisans doğrulama örneği
async function verifyLicense(licenseKey) {
  const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: 'GUMROAD_PRODUCT_ID',
      license_key: licenseKey
    })
  });
  const data = await response.json();
  return data.success;
}
```

---

## Claude Code Kullanım Talimatları

Bu projeyi VS Code üzerinde Claude Code ile geliştireceğiz. Claude Code'a aşağıdaki sırayla görevler ver:

1. **İlk komut:** "Bu MD dosyasını oku ve LinkedIn Post Formatter Chrome Extension projesini oluştur. Önce dosya yapısını ve manifest.json'u hazırla."

2. **İkinci komut:** "popup.html ve styles.css dosyalarını oluştur. Tailwind CSS kullan. Modern, temiz bir arayüz tasarla."

3. **Üçüncü komut:** "popup.js dosyasını oluştur. 3 temel şablon, formatlama algoritması, karakter sayacı ve kopyalama özelliğini ekle."

4. **Dördüncü komut:** "Premium özellikleri ekle: 10+ şablon, hashtag önerici, okunabilirlik skoru, post geçmişi, ton seçici."

5. **Beşinci komut:** "license.js dosyasını oluştur. Gumroad License Key API entegrasyonunu yaz ve premium/ücretsiz kısıtlama mantığını ekle."

---

## Takvim

| Aşama | Süre |
|---|---|
| Temel kurulum | 1-2 gün |
| Ücretsiz özellikler | 3-5 gün |
| Premium özellikler | 3-4 gün |
| Ödeme entegrasyonu | 1-2 gün |
| Yayın hazırlığı | 1-2 gün |
| **Toplam** | **~2-3 hafta** |

---

## Gelir Tahmini

| Ay | Ücretsiz Kullanıcı | Premium (%4) | Gelir |
|---|---|---|---|
| 1. ay | 200 | 8 | ~$48 |
| 3. ay | 800 | 32 | ~$192 |
| 6. ay | 2.500 | 100 | ~$600 |
| 12. ay | 6.000 | 240 | ~$1.440 |

---

## Notlar

- Chrome Extension geliştirmek için ek bir framework veya kurulum gerekmez
- Extension'ı test etmek için Chrome'da `chrome://extensions` sayfasına git, "Developer mode"u aç ve "Load unpacked" ile proje klasörünü seç
- Gumroad'da ürün oluştururken "License keys" özelliğini aktif etmeyi unutma
- Chrome Store incelemesi 1-3 iş günü sürebilir, buna göre plan yap
