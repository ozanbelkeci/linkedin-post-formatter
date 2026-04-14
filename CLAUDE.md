# Postify

Chrome Extension (Manifest V3) + Cloudflare Worker proxy. LinkedIn postlarını AI ile formatlar.

---

## Tech Stack

- Vanilla JS + HTML + CSS (no framework)
- Tailwind CSS (CDN, popup.html içinde)
- Chrome Extension Manifest V3 (service worker, chrome.storage.local)
- Cloudflare Workers (proxy — GROQ_API_KEY gizler, rate limit tutar)
- Cloudflare KV (rate limit sayacı)
- Groq API (`llama-3.1-8b-instant`, OpenAI-compatible endpoint)
- Polar.sh (lisans doğrulama — Organization ID: `5c7dd4fb-9d76-46b4-8ed7-d245be8d64c2`)

---

## Dosya Yapısı

```
linkedin-post-formatter/
├── manifest.json       — MV3 config, permissions: ["storage"], host: workers.dev
├── popup.html          — Ana UI: Write / Drafts / Tone / Settings sekmeleri
├── popup.js            — Tüm uygulama mantığı, state yönetimi, API çağrıları
├── styles.css          — Özel stiller (Tailwind üstüne), dark/light mode CSS vars
├── background.js       — Service worker: usageCount, dailyUsage, GET_STATUS/INCREMENT_USAGE mesajları
├── license.js          — LicenseManager IIFE: Polar.sh verify (worker proxy), isPremium(), validateOnOpen() (24h cache), checkFeatureAccess()
├── templates.js        — 14 şablon + CTA_TEXTS (14×5 dil) + templateCTA(id, lang) + parseSections/cleanSection
├── drafts.js           — DraftManager IIFE: saveDraft/getDrafts/deleteDraft/loadDraft, MAX_DRAFTS=50
├── hookAnalyzer.js     — analyzeHook(text): ilk satırı puanlar, { score, labelKey, emoji, tipKey }
├── i18n.js             — I18N objesi: tr/en/fr/de/es UI string'leri; t(lang, key) fonksiyonu
├── onboarding.js       — Onboarding IIFE: ilk açılışta 3-adım tur, Storage key: onboardingCompleted
└── icons/              — icon16/48/128.png

cloudflare-worker/
├── worker.js           — Tüm endpoint handler'ları + Groq proxy
└── wrangler.toml       — name="linkedin-post-formatter-api", KV binding: RATE_LIMIT_KV
```

---

## Worker URL & Endpoints

**Base URL:** `https://linkedin-post-formatter-api.belkeci-ozan.workers.dev`

| Method | Endpoint         | Body                              | Açıklama                          |
|--------|------------------|-----------------------------------|-----------------------------------|
| POST   | `/format`        | `{ text, mode, ton }`             | Şablona özel Groq formatlaması    |
| POST   | `/ab-test`       | `{ text, ton, lang }`             | Alternatif ton versiyonu üret (tek Groq çağrısı, sadece versionB döner) |
| POST   | `/analyze`       | `{ text }`                        | Viral skor JSON: hook/emotion/shareability/cta/overall/tip |
| POST   | `/tone-analyze`  | `{ posts: string[] }`             | Ton profili JSON: style/emojiUsage/sentenceLength/personality/keywords |
| POST   | `/hashtag-score`     | `{ hashtags: string[] }`      | Her hashtag için score/popularity/suggestion |
| POST   | `/validate-license`  | `{ key: string }`             | Polar.sh key doğrulama proxy (POLAR_ACCESS_TOKEN gizli) |
| GET    | `/health`            | —                             | usage: { today, limit, remaining } |

`/format` response: `{ success, result, usage }`
`/ab-test` response: `{ success, versionB, usage }` — versionA zaten state.formattedText'te, yeniden üretilmez
Diğer POST: `{ success, result/data, usage }`

---

## Groq API Yapısı

```
Model:    llama-3.1-8b-instant
Base:     https://api.groq.com/openai/v1/chat/completions
Auth:     Bearer GROQ_API_KEY (worker env secret)
Tokens:   max_tokens: 2048
Temp:     hashtags=0.2, analyze/tone/hashtag-score=0.2, structured=0.4, ab-test=0.5, default=0.3
```

Structured promptlar `|||` separator ile N bölüm döndürür. `callGroq()` sonuçtan `**` temizler.

---

## Önemli Sabitler (worker.js)

```js
DAILY_LIMIT        = 14000   // Global günlük istek limiti (KV)
PER_IP_DAILY_LIMIT = 120     // IP başına günlük Groq limit
LIC_IP_DAILY_LIMIT = 20      // IP başına günlük validate-license denemesi
GROQ_MODEL         = 'llama-3.1-8b-instant'
KV_TTL_SECONDS     = 60 * 60 * 26  // 26 saat
GROQ_TIMEOUT_MS    = 25000   // AbortController timeout (callGroq)
```

KV key format:
- `daily_count:YYYY-MM-DD` — global Groq sayacı
- `ip:daily_count:YYYY-MM-DD:IP` — IP bazlı Groq limit
- `lic_ip:YYYY-MM-DD:IP` — IP bazlı validate-license limit

---

## Şablonlar (14 adet)

`hikaye` / `liste` / `fikir` / `vaka` / `ipucu` / `soru` / `istatistik` / `basari` / `hata` / `karsilastirma` / `manifesto` / `mektup` / `karar` / `tavsiye` + `hashtags` (özel, tek bölüm)

- Her şablon worker'da `buildSystem(sections, ton)` ile Groq prompt'u oluşturur
- Her şablon client-side `tmpl.format(text, ton, lang)` ile AI çıktısını formatlar
- `CTA_TEXTS` objesi: 14 şablon × 5 dil (tr/en/fr/de/es) kapanış soruları
- `templateCTA(id, lang)` fonksiyonu: doğru kapanış sorusunu döner
- Her `format()` çıktısı `―\n\n` + kapanış sorusuyla biter
- Ton: `samimi` | `motivasyonel` | `profesyonel`

---

## A/B Test UI Mimarisi

- **Toggle**: `[A] Formatlanmış Post | [B] Alternatif Ton` — tek preview alanı, tek Copy butonu
- `state.activeVersion` ('A'|'B'): aktif versiyon
- `state.formattedText`: A versiyonu (format endpoint'ten gelir)
- `state.altText`: B versiyonu (ab-test endpoint'ten gelir + `―\n\n` + templateCTA eklenir)
- `switchVersion(ver)`: versiyon değiştirir, preview + analiz günceller
- `runABTest()`: sadece B versiyonu için `/ab-test` çağırır; `lang` parametresi gönderir; her zaman `templateCTA` ekler
- İlk B tıklaması API çağrısı yapar, sonraki tıklamalar sadece `switchVersion` çağırır (cache)

---

## Version Isolation (Edit Mode)

Düzenleme modunda versiyon karışması önlenir:

- `state.editingVersion`: edit moduna girildiğinde kilitlenen versiyon ('A'|'B')
- Edit modu açılırken: `state.editingVersion = state.activeVersion` + toggle butonları devre dışı
- Edit modu kapanırken: `state.editingVersion`'a göre doğru state güncellenir (`formattedText` veya `altText`) + toggle butonları aktif
- `insertEmoji()` preview branch: `state.editingVersion`'a göre doğru state'e yazar

---

## Draft Sistemi

- Taslak kaydetme butonu **yalnızca formatlanmış metin varsa** çalışır (`state.formattedText` kontrolü)
- `confirmSaveDraft()`: aktif versiyona göre `formattedText` veya `altText` kaydeder; `content` ve `formattedContent` alanı aynı değeri taşır
- Draft listesi önizlemesi: `formattedContent` gösterir (raw input değil)
- Draft yükleme: `formattedContent` → preview'a render edilir

---

## Ücretsiz / Premium Ayrımı

**Ücretsiz:**
- `/format` günde 10 kez (client-side sayaç, background.js)
- 3 temel şablon erişimi (hikaye, liste, fikir)
- See more line preview (210 karakter)
- Mobile preview toggle
- Hook analizi
- Okunabilirlik skoru
- 3 draft kaydetme (DraftManager.FREE_LIMIT = 3)
- Onboarding turu

**Premium ($6/ay — Polar.sh):**
- Sınırsız formatlama
- Tüm 14 şablon
- A/B test (`/ab-test`)
- Viral analiz (`/analyze`)
- Kişisel ton profili (`/tone-analyze`)
- Hashtag skoru (`/hashtag-score`)
- Sınırsız draft (max 50)
- Tüm dil desteği (5 dil)

Premium check: `LicenseManager.checkFeatureAccess(feature)`
PREMIUM_FEATURES: `['ab-test', 'analyze', 'tone', 'hashtag-score', 'unlimited-format', 'unlimited-drafts']`

---

## Chrome Storage Keys

| Key                  | Tip       | Açıklama                          |
|----------------------|-----------|-----------------------------------|
| `licenseKey`         | string    | Polar.sh lisans key               |
| `licenseValid`       | boolean   | Cache'lenmiş doğrulama sonucu     |
| `validatedAt`        | timestamp | Son doğrulama zamanı (24h cache)  |
| `drafts`             | array     | DraftManager drafts               |
| `onboardingCompleted`| boolean   | Onboarding tamamlandı mı          |
| `preferredLanguage`  | string    | 'tr'/'en'/'fr'/'de'/'es'          |
| `colorScheme`        | string    | 'auto'/'light'/'dark'             |
| `dailyUsage`         | number    | Bugünkü formatlama sayısı         |
| `usageDate`          | string    | 'YYYY-MM-DD'                      |
| `postHistory`        | array     | Geçmiş formatlanmış postlar       |

---

## Komutlar

```bash
# Worker deploy
cd cloudflare-worker
wrangler deploy

# Worker local test
wrangler dev

# API key secret ekle (ilk kurulum)
wrangler secret put GROQ_API_KEY
wrangler secret put POLAR_ACCESS_TOKEN   # Polar.sh Organization Access Token (scope: license_keys:write)

# KV namespace oluştur (ilk kurulum)
wrangler kv:namespace create RATE_LIMIT_KV

# Health check
curl https://linkedin-post-formatter-api.belkeci-ozan.workers.dev/health

# Format test
curl -X POST https://linkedin-post-formatter-api.belkeci-ozan.workers.dev/format \
  -H "Content-Type: application/json" \
  -d '{"text":"test post","mode":"hikaye","ton":"profesyonel"}'

# Extension reload
# chrome://extensions → "TEST - Postify" → Reload butonu
```

---

## Lisans Yönetimi UI (Settings sekmesi)

- **`licenseInputGroup`**: Key giriş alanı + "Aktif Et" butonu — free kullanıcıya gösterilir
- **`licenseActiveGroup`**: Key prefix + "Lisansı Kaldır" butonu + portal linki — premium kullanıcıya gösterilir
- **Lisansı Kaldır** butonu → `deactivateModal` popup açar:
  - Uyarı metni (lisans yalnızca bu cihazdan kaldırılır, abonelik devam eder)
  - "Aboneliğinizi iptal edin →" → `https://polar.sh/ozan-belkeci/portal`
  - İptal adımları (4 adım — Polar portal akışı; "Overview", "Manage subscription", "Cancel Subscription" İngilizce kalır)
  - "Vazgeç" ve "Lisansı Kaldır" butonları
- Tüm modal metinleri `data-i18n` ile 5 dilde dinamik

---

## i18n Sistemi

- **Dosya:** `i18n.js` — `I18N` objesi: `{ tr, en, fr, de, es }` her dil için ~172 key
- **`t(lang, key)`** — 3 seviyeli fallback: `lang dict → EN → raw key string`
- **`applyLang(lang)`** — `[data-i18n]` attribute'lu tüm DOM elemanlarını günceller
- **Dil tespiti:** `detectSystemLang()` — `navigator.language` ile sistem dilini okur; desteklenmiyorsa `'en'` döner
- **Yeni key grupları (son eklemeler):**
  - `deactivateModalTitle/Desc1/Desc2/CancelBtn/ConfirmBtn` — Lisansı Kaldır modalı
  - `portalBtnLabel/portalCancelNote` — Portal butonu ve iptal notu
  - `cancelStepsTitle/cancelStep1/2/3/4` — İptal adımları

---

## Tamamlanmamış / Eksik Özellikler

**Yapılmamış:**
- Dark/light mode CSS variables sistemi (styles.css'te kısmen var ama toggle mekanizması eksik)
- Klavye kısayolları (Ctrl+S, Ctrl+Enter, Ctrl+C, Esc)

---

## Önemli Kararlar

1. **Cloudflare Worker proxy zorunlu** — Chrome Extension CSP, doğrudan Groq API çağrısına izin vermez. Worker hem key'i gizler hem rate limit tutar.

2. **`|||` separator** — Groq'a şablonun kaç bölüm döndürmesi gerektiği system prompt'ta söylenir. Bölümler `|||` ile ayrılır, `parseSections()` ile işlenir.

3. **`**` temizleme** — `callGroq()` tüm `**` karakterlerini sonuçtan siler (Groq bazen bold markdown ekliyor).

4. **Client-side günlük limit** — Ücretsiz kullanıcılar için 10/gün limiti background.js'deki `dailyUsage` sayacıyla tutulur. Worker'ın global limiti ayrı, tüm kullanıcıları kapsar.

5. **License cache 24h** — `validateOnOpen()` extension her açılışında çalışır. Cache geçerliyse (`validatedAt` + 24h) Polar API'ye gitmez. Süresi dolunca gerçek sorgu yapar. Ağ hatası → offline cache fallback (kullanıcı cezalandırılmaz). Key iptal → `invalidateLicense()`.

6. **Polar proxy zorunlu** — Polar `/v1/license-keys/validate` endpoint'i `license_keys:write` scope'lu Bearer token gerektirir. Token extension'da saklanamaz → worker `/validate-license` endpoint'i proxy görevini üstlenir.

7. **A/B test tek Groq çağrısı** — `/ab-test` sadece `versionB` üretir. `versionA` zaten `state.formattedText`'te mevcut; yeniden üretmek Groq rate limit riskini ikiye katlar.

8. **CTA dil izolasyonu** — Kapanış sorusu `state.lang` (UI dili) ile belirlenir, metin içeriğinden dil tespiti yapılmaz. `CTA_TEXTS[templateId][lang]` → `templateCTA(id, lang)`. Her iki versiyon (A ve B) aynı template CTA'yı kullanır.

9. **Alternatif Ton CTA** — systemB prompt kasıtlı olarak kapanış sorusu üretmez; client-side `runABTest()` her zaman `\n\n―\n\n` + `templateCTA` ekler. Bu, A ve B arasında format tutarlılığı sağlar.

10. **Draft yalnızca formatlanmış metin** — Draft kaydetme raw input'u değil, aktif versiyonun (`formattedText` veya `altText`) metnini kaydeder. Draft liste önizlemesi de bunu gösterir.

11. **DraftManager auto-save** — "Auto-save" başlıklı draft her zaman tek kopya tutar (upsert logic). 30s interval popup.js'de.

12. **Hashtag scored view + 1.5s delay** — `/format` (hashtag modu) çağrısından hemen sonra `/hashtag-score` çağrılırsa Groq per-second rate limit'e çarpılır. `renderHashtags()` içinde 1500ms gecikme ile önlenir.
