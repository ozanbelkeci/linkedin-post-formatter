# Postify — Büyük Upgrade

## Genel Bakış

Mevcut projeye büyük bir upgrade yapıyoruz. Tüm özellikler mevcut dosya yapısına entegre edilecek. Hiçbir şeyi sıfırdan yazma — mevcut kodu oku, anla, üzerine ekle.

**Teknoloji stack değişmiyor:**
- Vanilla HTML + CSS + JavaScript
- Chrome Extension (Manifest V3)
- Cloudflare Workers (proxy)
- Groq API (llama-3.1-8b-instant)
- Chrome Storage API
- Tailwind CSS

---

## Mevcut Dosya Yapısını Oku

Önce projedeki tüm dosyaları oku ve mevcut yapıyı anla. Sonra aşağıdaki özellikleri sırayla ekle.

---

## BÖLÜM 1: API Gerektirmeyen Özellikler

### 1.1 "See More" Line Preview

LinkedIn postları **210 karakterde** "see more" ile keser. Kullanıcı hook'unun nerede kesildiğini görmeli.

**Nasıl çalışır:**
- Metin alanının altında canlı karakter sayacı zaten var
- 210. karakterde görsel bir çizgi göster
- Çizginin üstü = kullanıcının göreceği kısım
- Çizginin altı = "see more" arkasında kalan kısım
- Renk kodu: 0-210 arası yeşil, 210+ sarı uyarı

**UI:**
```
[Metin alanı]

── SEE MORE LINE (210) ──────────────────

Karakter: 287 / 3000
```

**Implementasyon:**
- `popup.js` içinde karakter sayacını güncelle
- Her `input` event'inde 210. karakteri tespit et
- Metin alanını iki bölüme ayıran görsel bir gösterge ekle
- CSS ile üst kısım normal, alt kısım hafif soluk görünsün

---

### 1.2 Mobile Preview

Kullanıcı postun telefonda nasıl görüneceğini görmelidir.

**Nasıl çalışır:**
- Formatlanmış metni mobil LinkedIn arayüzünü simüle eden bir kutuda göster
- Popup içinde toggle buton: "Desktop Preview" / "Mobile Preview"
- Mobile preview: 375px genişlik, LinkedIn mavi header, profil fotoğrafı placeholder, post metni

**UI Tasarımı:**
```
[Desktop] [Mobile]  ← Toggle butonlar

┌─────────────────┐
│ 🔵 LinkedIn     │  ← Sahte header
├─────────────────┤
│ 👤 Your Name    │  ← Profil placeholder
│    Your Title   │
│                 │
│  [Post metni]   │
│                 │
│ 👍 Like 💬 Comment │
└─────────────────┘
```

**Implementasyon:**
- `popup.html` içine mobile preview bölümü ekle
- CSS ile mobil frame tasarla (border-radius, shadow, LinkedIn renkleri)
- Toggle butonla desktop/mobile arasında geç
- Metin gerçek zamanlı güncellensin

---

### 1.3 Draft Sistemi

Kullanıcının yazmamış olduğu postları kaydetmesini sağlar.

**Veri yapısı (Chrome Storage):**
```javascript
{
  drafts: [
    {
      id: "draft_" + Date.now(),
      title: "Kullanıcının verdiği isim",
      content: "Ham metin",
      formattedContent: "Formatlanmış metin",
      template: "hikaye",
      language: "tr",
      tone: "profesyonel",
      createdAt: "2026-04-08T10:00:00",
      updatedAt: "2026-04-08T10:00:00"
    }
  ]
}
```

**Özellikler:**
- **Save Draft:** Mevcut metni isimle kaydet
- **My Drafts:** Kayıtlı taslakları listele
- **Load Draft:** Taslağı düzenleme alanına yükle
- **Delete Draft:** Taslağı sil
- **Auto-save:** Kullanıcı yazarken her 30 saniyede otomatik kaydet (isimsiz "Auto-save" olarak)
- Maksimum 50 draft sakla, 51. eklenince en eskisi silinsin

**UI:**
- Popup içinde "Drafts" sekmesi ekle
- Her draft kartında: başlık, tarih, ilk 50 karakter önizleme, yükle/sil butonları
- Yeni draft kaydederken isim girme modal'ı

**Implementasyon:**
- `drafts.js` adında yeni bir dosya oluştur
- Chrome Storage'a `getDrafts()`, `saveDraft()`, `deleteDraft()`, `loadDraft()` fonksiyonları yaz
- `popup.js` ile entegre et

---

### 1.4 Hook Analizi

İlk cümlenin (hook) gücünü ölçen basit algoritma.

**Algoritma — Hook türlerini tespit et:**
```
Soru ile başlıyor mu?        → +20 puan
Rakam/istatistik var mı?     → +20 puan
"Ben" ile başlıyor mu?       → +15 puan (kişisel hikaye)
Bold statement mi?           → +15 puan
Kısa mı? (< 10 kelime)      → +10 puan
Emoji ile başlıyor mu?       → +10 puan
"Nasıl" veya "Why" var mı?  → +10 puan
```

**Puan → Değerlendirme:**
```
80-100: 🔥 Güçlü hook
50-79:  ✅ İyi hook  
20-49:  ⚠️ Zayıf hook
0-19:   ❌ Hook yok
```

**UI:**
- Metin girildiğinde hook skoru anlık hesaplanır
- Formatlanmış metnin altında küçük bir skor kartı görünsün
- Skora göre renk: yeşil / sarı / kırmızı
- Kısa bir ipucu: "Soru ile başlamayı dene" gibi

**Implementasyon:**
- `hookAnalyzer.js` adında yeni dosya oluştur
- `analyzeHook(text)` fonksiyonu yaz
- Her formatlama sonrası çalıştır

---

### 1.5 Okunabilirlik Skoru (Geliştirilmiş)

Mevcut okunabilirlik skorunu görselleştir ve genişlet.

**Metrikler:**
- Ortalama cümle uzunluğu (< 15 kelime = iyi)
- Paragraf sayısı (her paragraf 1-3 cümle = iyi)
- Emoji oranı (toplam karakterin %5-15'i = iyi)
- Büyük harf kullanımı
- Noktalama dengesi

**UI:**
```
Okunabilirlik Skoru: 78/100

📏 Cümle uzunluğu    ████████░░  İyi
📝 Paragraf yapısı   ██████████  Mükemmel  
😀 Emoji dengesi     ████░░░░░░  Az
```

---

### 1.6 A/B Test Önerisi

Aynı içerik için iki farklı versiyon üretir.

**Nasıl çalışır:**
- "Generate A/B" butonu ekle (premium özellik)
- Groq API'ye aynı metni iki farklı hook/ton ile gönder
- İki versiyon yan yana göster
- Kullanıcı birini seçer, kopyalar

**UI:**
```
[Versiyon A]          [Versiyon B]
─────────────         ─────────────
Hook: Soru           Hook: İstatistik
"3 yıl önce..."      "%90 insan..."

[Kopyala A]           [Kopyala B]
```

**Implementasyon:**
- `worker.js`'e yeni `/ab-test` endpoint'i ekle
- İki paralel Groq isteği at
- Promise.all ile bekle, ikisini birden döndür

---

## BÖLÜM 2: Groq API ile Çalışan Özellikler

### 2.1 Çok Dilli Destek

Türkçe, İngilizce, Fransızca, Almanca, İspanyolca desteği.

**UI:**
- Dil seçici dropdown ekle: 🇹🇷 TR / 🇬🇧 EN / 🇫🇷 FR / 🇩🇪 DE / 🇪🇸 ES
- Seçilen dile göre Groq prompt'u değişir
- Kullanıcının son dil seçimi Chrome Storage'a kaydedilir

**Prompt değişikliği (worker.js):**
```javascript
const LANGUAGE_PROMPTS = {
  tr: "Türkçe LinkedIn yazım kurallarına göre düzelt...",
  en: "Fix according to English LinkedIn writing standards...",
  fr: "Corrige selon les standards d'écriture LinkedIn en français...",
  de: "Korrigiere nach deutschen LinkedIn-Schreibstandards...",
  es: "Corrige según los estándares de escritura de LinkedIn en español..."
}
```

**Implementasyon:**
- `popup.html`'e dil seçici ekle
- `popup.js`'te seçilen dili Cloudflare Worker'a gönder
- `worker.js`'te dile göre prompt seç

---

### 2.2 Viral Post Analizi

Postun viral potansiyelini analiz et.

**Nasıl çalışır:**
- Groq API'ye post + analiz prompt'u gönder
- Groq şunları değerlendirir:
  - Hook gücü
  - Duygusal etki
  - Paylaşılabilirlik
  - Trend uyumu
  - CTA (call-to-action) varlığı

**Groq Prompt:**
```
Analyze this LinkedIn post for viral potential. 
Rate each factor 0-100 and give one specific improvement tip.
Return JSON: { hook: 80, emotion: 60, shareability: 70, cta: 40, overall: 65, tip: "..." }
```

**UI:**
```
Viral Potansiyel: 65/100

🎯 Hook Gücü        ████████░░  80
❤️ Duygusal Etki   ██████░░░░  60
🔄 Paylaşılabilir  ███████░░░  70
📢 CTA             ████░░░░░░  40

💡 İpucu: "Sona 'Ne düşünüyorsunuz?' ekle"
```

**Implementasyon:**
- `worker.js`'e `/analyze` endpoint'i ekle
- Response JSON parse et
- `popup.js`'te radar chart veya progress bar ile göster

---

### 2.3 Kişiselleştirilmiş Ton Özelliği

Kullanıcının yazı tonunu öğren ve ona uygun formatla.

**Nasıl çalışır:**
1. Kullanıcı "Tonu Kaydet" bölümüne 2-3 örnek post girer
2. Groq bu postları analiz eder: kelime seçimi, cümle yapısı, emoji kullanımı, kişilik
3. Ton profili Chrome Storage'a kaydedilir
4. Formatlamada bu profil kullanılır

**Ton Profili Örneği:**
```javascript
{
  toneProfile: {
    style: "casual-professional",
    emojiUsage: "moderate",
    sentenceLength: "short",
    personality: "motivational",
    exampleKeywords: ["mükemmel", "harika", "inanıyorum"]
  }
}
```

**Groq Prompt:**
```
Analyze these LinkedIn posts and create a tone profile.
Return JSON: { style, emojiUsage, sentenceLength, personality, keywords[] }
Posts: [kullanıcının postları]
```

**UI:**
- "My Tone" sekmesi ekle
- 2-3 post giriş alanı
- "Tonumu Analiz Et" butonu (premium)
- Ton profili gösterimi: "Senin tarzın: Samimi-Profesyonel, Az Emoji, Motive Edici"
- Formatlamada "My Tone" seçeneği

**Implementasyon:**
- `worker.js`'e `/tone-analyze` endpoint'i ekle
- Chrome Storage'a ton profili kaydet
- Format prompt'una ton profili ekle

---

### 2.4 Hashtag Performans Skoru

Girilen hashtag'lerin popülerliğini değerlendir.

**Nasıl çalışır:**
- Groq'a hashtag listesi gönder
- Groq her hashtag için popülerlik ve niş uyumu değerlendirir
- Önerilen hashtag'ler de ekler

**UI:**
```
#linkedin     ████████░░  Çok Popüler  ✓
#kariyer      ██████░░░░  Orta         ✓  
#xyzabc       ██░░░░░░░░  Çok Niş      ⚠️

Önerilen: #linkedintips #careeradvice #networking
```

**Implementasyon:**
- `worker.js`'e `/hashtag-score` endpoint'i ekle
- Posttan hashtag'leri otomatik çıkar (regex)
- Skor + öneri döndür

---

## BÖLÜM 3: UI/UX Geliştirmeleri

### 3.1 Sekme Yapısı

Mevcut tek sayfa yerine sekmeli yapı:

```
[✍️ Write] [📝 Drafts] [🎯 Tone] [⚙️ Settings]
```

**Write sekmesi:** Mevcut formatlama özellikleri + yeni özellikler
**Drafts sekmesi:** Taslak yönetimi
**Tone sekmesi:** Kişisel ton profili
**Settings sekmesi:** Dil, premium, API durumu

---

### 3.2 Klavye Kısayolları

- `Ctrl+S` → Draft kaydet
- `Ctrl+Enter` → Formatla
- `Ctrl+C` → Formatlanmış metni kopyala
- `Esc` → Modal kapat

---

### 3.3 Karanlık/Aydınlık Mod

Chrome'un sistem temasını algıla:
```javascript
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
```

CSS variables ile tema sistemi kur.

---

### 3.4 Onboarding

İlk kez açan kullanıcıya kısa bir tur:
- Adım 1: "Metni buraya yapıştır"
- Adım 2: "Şablonunu seç"
- Adım 3: "Formatla ve kopyala"
- Chrome Storage'da `onboardingCompleted: true` kaydet

---

## BÖLÜM 4: Cloudflare Worker Güncellemeleri

`worker.js` dosyasına şu endpoint'leri ekle:

```javascript
// Mevcut
POST /format      → Metin düzeltme ve formatlama

// Yeni eklenecekler
POST /ab-test     → A/B versiyon üretme
POST /analyze     → Viral potansiyel analizi  
POST /tone-analyze → Ton profili çıkarma
POST /hashtag-score → Hashtag değerlendirme
GET  /health      → Mevcut (değişmeyecek)
```

Her yeni endpoint için:
- Input validasyonu ekle
- Rate limit sayacını güncelle (tüm endpointler ortak limiti paylaşır)
- CORS header'larını koru
- Hata yönetimini ekle

---

## BÖLÜM 5: Premium/Ücretsiz Kısıtlama Güncellemesi

### Ücretsiz Plan
- Metin formatlama (günde 10 kez)
- 3 temel şablon
- See more line preview
- Mobile preview
- Hook analizi
- Okunabilirlik skoru
- 3 draft kaydetme
- Tüm dil desteği (5 dil)

### Premium Plan ($6/ay)
- Sınırsız formatlama
- 10+ şablon
- A/B test önerisi
- Viral potansiyel analizi
- Kişiselleştirilmiş ton özelliği
- Hashtag performans skoru
- Sınırsız draft
- Öncelikli API erişimi

**Kısıtlama mantığı:**
```javascript
// license.js içinde
async function checkFeatureAccess(feature) {
  const isPremium = await checkPremiumStatus();
  const PREMIUM_FEATURES = ['ab-test', 'analyze', 'tone', 'hashtag-score', 'unlimited-format', 'all-languages'];
  
  if (PREMIUM_FEATURES.includes(feature) && !isPremium) {
    showUpgradeModal();
    return false;
  }
  return true;
}
```

---

## BÖLÜM 6: Dosya Yapısı (Final)

```
linkedin-post-formatter/
├── manifest.json
├── popup.html          ← Sekme yapısı ile güncelle
├── popup.js            ← Ana mantık, yeni özellikler entegre
├── styles.css          ← Dark mode, yeni UI elementleri
├── background.js       ← Değişmez
├── license.js          ← Feature access kontrolü ekle
├── templates.js        ← Değişmez (10+ şablon zaten var)
├── drafts.js           ← YENİ: Draft sistemi
├── hookAnalyzer.js     ← YENİ: Hook analiz algoritması
├── i18n.js             ← YENİ: Dil yönetimi
├── onboarding.js       ← YENİ: İlk kullanım turu
├── cloudflare-worker/
│   └── worker.js       ← Yeni endpoint'ler ekle
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Uygulama Sırası

Aşağıdaki sırayla uygula — her adımı bitir ve test et, sonra diğerine geç:

1. **Cloudflare Worker** — Yeni endpoint'leri ekle, deploy et, test et
2. **Draft sistemi** — `drafts.js` oluştur, popup.js entegre et
3. **See more line preview** — popup.js güncelle
4. **Mobile preview** — popup.html ve styles.css güncelle
5. **Hook analizi** — `hookAnalyzer.js` oluştur
6. **Okunabilirlik skoru** — Mevcut skoru görselleştir
7. **Sekme yapısı** — popup.html'i sekmelere böl
8. **Çok dilli destek** — `i18n.js` oluştur, worker güncelle
9. **Viral post analizi** — /analyze endpoint entegre et
10. **A/B test** — /ab-test endpoint entegre et
11. **Kişiselleştirilmiş ton** — /tone-analyze endpoint entegre et
12. **Hashtag skoru** — /hashtag-score endpoint entegre et
13. **Dark/light mode** — CSS variables güncelle
14. **Klavye kısayolları** — popup.js güncelle
15. **Onboarding** — `onboarding.js` oluştur
16. **Premium kısıtlamaları** — license.js güncelle
17. **Genel test** — Tüm özellikleri test et, hataları düzelt

---

## Önemli Notlar

- Mevcut çalışan kodu bozma — her özelliği eklerken mevcut özelliklerin çalıştığını kontrol et
- Her yeni Cloudflare endpoint'i için `wrangler deploy` çalıştır ve curl ile test et
- Chrome Extension'ı her büyük değişiklikten sonra `chrome://extensions` sayfasından reload et
- Rate limit sayacı tüm endpoint'leri kapsamalı — her istek sayılmalı
- Premium kısıtlamalarını her yeni özellik için güncelle
- Hata mesajları kullanıcı dostu olsun, teknik detay vermesin
- Önyüzdeki geliştirmelerini yaparken 21st.dev sitesinden referans alabilirsin. Görünümün profesyonel olmasına dikkat et. "Vibe coding" imajı vermesin.
