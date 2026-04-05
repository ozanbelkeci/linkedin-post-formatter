/**
 * LinkedIn Post Formatter — Cloudflare Worker Proxy
 *
 * Endpoints:
 *   POST /format   → Gemini 2.5 Flash ile şablona özel formatlama
 *   GET  /health   → Servis durumu + günlük kullanım
 *
 * KV namespace bağlantısı:
 *   wrangler.toml'da  [[kv_namespaces]] name = "RATE_LIMIT_KV"
 *
 * Environment variables:
 *   GEMINI_API_KEY  — Google AI Studio'dan alınan API key
 *   RATE_LIMIT_KV   — Cloudflare KV namespace binding
 */

/* ─────────────────────────────────────────────
   SABİTLER
───────────────────────────────────────────── */
const DAILY_LIMIT        = 450;
const GEMINI_MODEL       = 'gemini-2.5-flash';
const GEMINI_API_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models';
const KV_KEY_PREFIX      = 'daily_count';
const KV_TTL_SECONDS     = 60 * 60 * 26; // 26 saat

/* ─────────────────────────────────────────────
   CORS HEADERS
───────────────────────────────────────────── */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age':       '86400',
};

/* ─────────────────────────────────────────────
   PROMPT BUILDER FONKSİYONLARI
   Her şablon Gemini'ye "ne döndüreceğini" söyler.
   Bölümler ||| ile ayrılır.
───────────────────────────────────────────── */

/** Genel düzeltme modu (fallback) */
function buildPrompt(text) {
  return `Sen profesyonel bir Türkçe içerik editörüsün. Aşağıdaki metni LinkedIn paylaşımı için düzelt ve iyileştir.

GÖREVLER:
1. Yazım hatalarını düzelt (Türk alfabesi kurallarına göre)
2. Eksik noktalama işaretlerini ekle
3. Cümle yapısını düzelt ve akıcı hale getir
4. LinkedIn'e uygun profesyonel bir dil kullan
5. Orijinal fikir ve içeriği koru, sadece dili iyileştir

ÖNEMLİ KURALLAR:
- Metne yeni içerik ekleme, sadece var olanı düzelt
- Başlık veya açıklama yazma, sadece düzeltilmiş metni döndür
- Emojileri koru
- Hashtag'leri koru

DÜZELTILECEK METİN:
${text}

ÇIKTI: Sadece düzeltilmiş metni döndür, başka hiçbir şey yazma.`;
}

/** hikaye: Kişisel dönüşüm hikayesi */
function buildHikayePrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Hikaye" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. HOOK: Okuyucuyu ilk cümleden yakalayan merak uyandırıcı bir açılış cümlesi (1-2 cümle). Metnin özünden ilham al.
2. GELİŞME: Hikayenin ana gövdesi — ne yaşandı, süreç nasıl ilerledi (2-4 cümle). Yazım hatalarını düzelt.
3. DERS: Bu deneyimden çıkarılan öğrenim veya dönüşüm (1-2 cümle). "Öğrendim ki" veya "Artık biliyorum ki" ile açabilirsin.

KURALLAR:
- Bölümler arasına sadece ||| yaz, başka hiçbir şey ekleme
- Metne olmayan içerik ekleme — sadece var olanı yeniden yapılandır
- Yazım ve noktalama hatalarını düzelt
- Emojileri koru

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** liste: Adım adım liste */
function buildListePrompt(text) {
  return `Sen profesyonel bir Türkçe içerik editörüsün. Aşağıdaki metni LinkedIn "liste" formatına dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. BAŞLIK: Metnin ana fikrini veya hook cümlesini yaz (1 cümle)
2. MADDELER: Metindeki her adımı veya eylemi AYRI SATIRA yaz. Her satır = 1 madde. Madde başına numara, tire veya emoji EKLEME.
3. SONUÇ: Eğer metinde "böylece / bu sayede / fark ettim ki / sonunda" gibi bir kapanış varsa buraya yaz. Yoksa bu bölümü boş bırak.

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Maddeleri tek satırda tut, birden fazla eylemi birleştirme
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** fikir: Görüş / kanaat paylaşımı */
function buildFikirPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Görüş" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. İDDİA: Metnin ana görüşünü veya iddiasını net biçimde ifade eden 1-2 güçlü cümle. Doğrudan ve kararlı bir dil kullan.
2. GEREKÇE: Bu görüşü destekleyen argümanlar veya örnekler (2-4 cümle). Yazım hatalarını düzelt.
3. MEYDAN OKUMA: Okuyucuyu düşündürecek, tartışmaya açık kapı bırakan 1-2 cümle. "Peki siz ne düşünüyorsunuz?" veya "Ya sizin deneyiminiz?" gibi bir yön ver.

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım ve noktalama hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** vaka: Before/after vaka çalışması */
function buildVakaPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Vaka Çalışması" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 4 bölüm, ||| ile ayrılmış:
1. GENEL BAKIŞ: Vakanın konusunu ve bağlamını özetleyen 1-2 cümle.
2. ÖNCE: Başlangıç durumu — problem neydi, durum nasıldı (1-3 cümle).
3. SONRA: Uygulanan çözüm ve elde edilen sonuç (1-3 cümle). Rakam/ölçüm varsa koru.
4. ÇIKARIM: Bu vakadan çıkan genel ders veya öneri (1-2 cümle).

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metindeki rakam ve verileri koru
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece dört bölüm, ||| ile ayrılmış):`;
}

/** ipucu: Pratik ipucu / hızlı öneri */
function buildIpucuPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "İpucu" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. BAŞLIK: İpucunu tek cümleyle tanıtan dikkat çekici bir açılış (1 cümle).
2. NEDEN: Bu ipucunun neden işe yaradığını veya neden önemli olduğunu açıkla (1-2 cümle).
3. NASIL: Pratik uygulama adımları veya açıklama (1-4 cümle veya kısa adımlar, her adım ayrı satırda).

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** soru: Merak uyandıran soru */
function buildSoruPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Soru" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. BAĞLAM: Soruyu anlamlı kılan kısa bir bağlam veya gözlem (1-2 cümle).
2. SORU: Konunun özünü yakalayan, merak uyandıran ana soru (1 net soru cümlesi, sona ? koy).
3. İLGİNÇ YAN: Bu soruyu özel kılan, okuyanı düşündüren bir not veya kendi bakış açısı (1-2 cümle).

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** istatistik: Veri/sayı odaklı paylaşım */
function buildIstatistikPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Veri/İstatistik" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. VERİ: Ana istatistik veya bulguyu öne çıkaran 1-2 cümle. Rakamları koru.
2. NE ANLAM TAŞIR: Bu verinin neden önemli olduğunu, sektör veya insanlar için ne anlama geldiğini açıkla (2-3 cümle).
3. ÇIKARIMLAR: Bu veriden çıkarılabilecek aksiyon veya ders (1-2 cümle).

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Tüm rakam ve istatistikleri koru
- Metne olmayan veri ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** basari: Başarı/kazanım paylaşımı */
function buildBasariPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Başarı" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. BAŞARI: Elde edilen başarıyı veya kazanımı net biçimde ifade eden 1-2 cümle. Rakam/metrik varsa koru.
2. FAKTÖRLER: Bu başarıyı mümkün kılan 2-4 faktörü AYRI SATIRA yaz. Her satır = 1 faktör.
3. YANSIMA: Bu başarının anlamı, minnet veya öğrenilen ders (1-2 cümle). Alçakgönüllü ve samimi bir dil kullan.

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metindeki rakamları koru
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** hata: Hata/ders paylaşımı */
function buildHataPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Ders/Hata" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. HATA: Yapılan hatayı veya yanlış kararı dürüstçe ifade eden 1-2 cümle. Savunmacı değil, açık bir dil kullan.
2. NE YANLIŞ GİTTİ: Hatanın nedeni, süreci veya sonuçları (2-3 cümle).
3. DERS: Bu hatadan çıkarılan öğrenim — şimdi ne yapılmalı veya ne farklı yapılır (1-2 cümle).

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** karsilastirma: Eski vs Yeni karşılaştırması */
function buildKarsilastirmaPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Karşılaştırma" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 4 bölüm, ||| ile ayrılmış:
1. KONU: Neyin karşılaştırıldığını açıklayan 1 cümle.
2. ESKİ: Eski yöntem, düşünce veya durum (1-2 cümle). "Eskiden..." veya "Önce..." ile açabilirsin.
3. YENİ: Yeni yöntem, düşünce veya durum (1-2 cümle). "Şimdi..." veya "Artık..." ile açabilirsin.
4. TEMEL FARK: Bu iki yaklaşım arasındaki en kritik fark veya kazanım (1-2 cümle).

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece dört bölüm, ||| ile ayrılmış):`;
}

/** manifesto: Kişisel ilkeler / inanç bildirisi */
function buildManifestoPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Manifesto" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. GİRİŞ: Manifestonun temasını veya bakış açısını tanıtan güçlü 1 cümle.
2. İLKELER: Metnin ilkelerini AYRI SATIRA yaz. Her satır = 1 ilke. Kararlı, kısa ve güçlü cümleler kullan.
3. KAPANIŞ: Bu ilkelerin neden önemli olduğunu veya ne vaat ettiğini ifade eden 1-2 cümle.

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt
- İlkeleri kısa ve vurucu tut

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** mektup: Geçmiş/gelecek benliğe mektup */
function buildMektupPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Mektup" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. PARAGRAF1: Mektubun açılışı — bağlamı kur, kime yazıldığını hissettir (1-2 cümle).
2. PARAGRAF2: Mektubun ana mesajı — ne söylenmek isteniyor, ne öğrenildi veya ne tavsiye ediliyor (2-4 cümle).
3. PARAGRAF3: Kapanış — umut, özlüyen bir not veya gelecek temenni (1-2 cümle). Bu bölüm metnde yoksa boş bırak.

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Sıcak ve samimi bir dil kullan
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** karar: Zor karar verme süreci */
function buildKararPrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Karar" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. KARAR: Verilen kararı net biçimde ifade eden 1-2 cümle. Çekingen değil, net bir dil kullan.
2. GEREKÇELER: Bu kararı veren 2-4 gerekçeyi AYRI SATIRA yaz. Her satır = 1 gerekçe.
3. SONUÇ YANSIMA: Kararın sonucu veya süreçten çıkarılan ders (1-2 cümle).

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/** tavsiye: Pratik tavsiye listesi */
function buildTavsiyePrompt(text) {
  return `Sen profesyonel bir LinkedIn içerik yazarısın. Aşağıdaki metni "Tavsiye" şablonuna dönüştür.

ÇIKTI YAPISI — tam olarak 3 bölüm, ||| ile ayrılmış:
1. GİRİŞ: Tavsiyelerin bağlamını ve kime hitap ettiğini açıklayan 1-2 cümle.
2. TAVSİYELER: Her tavsiyeyi AYRI SATIRA yaz. Her satır = 1 tavsiye. Numarasız, düz cümle.
3. KAPANIŞ: Tavsiyelerin özünü veya kullanıcıya son bir mesajı içeren 1-2 cümle.

KURALLAR:
- Bölümler arasına sadece ||| yaz
- Metne olmayan içerik ekleme
- Yazım hatalarını düzelt
- Tavsiyeleri kısa ve uygulanabilir tut

METİN:
${text}

ÇIKTI (sadece üç bölüm, ||| ile ayrılmış):`;
}

/* ─────────────────────────────────────────────
   PROMPT BUILDERS MAP
───────────────────────────────────────────── */
const PROMPT_BUILDERS = {
  hikaye:        buildHikayePrompt,
  liste:         buildListePrompt,
  fikir:         buildFikirPrompt,
  vaka:          buildVakaPrompt,
  ipucu:         buildIpucuPrompt,
  soru:          buildSoruPrompt,
  istatistik:    buildIstatistikPrompt,
  basari:        buildBasariPrompt,
  hata:          buildHataPrompt,
  karsilastirma: buildKarsilastirmaPrompt,
  manifesto:     buildManifestoPrompt,
  mektup:        buildMektupPrompt,
  karar:         buildKararPrompt,
  tavsiye:       buildTavsiyePrompt,
  // Geriye dönük uyumluluk
  list:    buildListePrompt,
  default: buildPrompt,
};

/* ─────────────────────────────────────────────
   GÜNLÜK SAYAÇ (KV)
───────────────────────────────────────────── */
function getTodayKey() {
  const now  = new Date();
  const yyyy = now.getUTCFullYear();
  const mm   = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(now.getUTCDate()).padStart(2, '0');
  return `${KV_KEY_PREFIX}:${yyyy}-${mm}-${dd}`;
}

async function incrementAndCheck(kv) {
  const key = getTodayKey();
  const raw   = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= DAILY_LIMIT) {
    return { count, exceeded: true };
  }

  await kv.put(key, String(count + 1), { expirationTtl: KV_TTL_SECONDS });
  return { count: count + 1, exceeded: false };
}

async function getUsage(kv) {
  const raw = await kv.get(getTodayKey());
  return raw ? parseInt(raw, 10) : 0;
}

/* ─────────────────────────────────────────────
   GEMİNİ API ÇAĞRISI
───────────────────────────────────────────── */
async function callGemini(apiKey, prompt, temperature = 0.3) {
  const url  = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature,
      topK:            40,
      topP:            0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new GeminiError(res.status, errText);
  }

  const data = await res.json();

  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error('Gemini yanıt vermedi.');

  if (candidate.finishReason === 'SAFETY') {
    throw new Error('İçerik güvenlik filtresi tarafından engellendi.');
  }

  const result = candidate?.content?.parts?.[0]?.text;
  if (!result) throw new Error('Gemini boş yanıt döndürdü.');

  return result.trim();
}

class GeminiError extends Error {
  constructor(status, body) {
    super(`Gemini API hatası: HTTP ${status}`);
    this.status = status;
    this.body   = body;
  }
}

/* ─────────────────────────────────────────────
   RESPONSE HELPERS
───────────────────────────────────────────── */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function error(message, status = 400, extra = {}) {
  return json({ success: false, error: message, ...extra }, status);
}

/* ─────────────────────────────────────────────
   ROUTE HANDLERS
───────────────────────────────────────────── */

/** POST /format */
async function handleFormat(request, env) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    return error('Content-Type application/json olmalı.', 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Geçersiz JSON formatı.', 400);
  }

  const { text, mode } = body;

  if (typeof text !== 'string' || text.trim().length === 0) {
    return error('"text" alanı boş olamaz.', 400);
  }
  if (text.length > 5_000) {
    return error('Metin çok uzun. Maksimum 5.000 karakter.', 400);
  }

  // Rate limit kontrolü
  const { count, exceeded } = await incrementAndCheck(env.RATE_LIMIT_KV);
  if (exceeded) {
    return error(
      'Günlük kapasite doldu, yarın tekrar dene.',
      429,
      { dailyLimit: DAILY_LIMIT, resetAt: 'UTC 00:00' }
    );
  }

  if (!env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY environment variable tanımlanmamış.');
    return error('Sunucu yapılandırma hatası.', 500);
  }

  // Şablona göre prompt seç
  const builder     = PROMPT_BUILDERS[mode] || buildPrompt;
  const isStructured = mode && mode in PROMPT_BUILDERS && mode !== 'default' && mode !== 'list';
  const temperature  = isStructured ? 0.4 : 0.3;
  const prompt       = builder(text.trim());

  let result;
  try {
    result = await callGemini(env.GEMINI_API_KEY, prompt, temperature);
  } catch (err) {
    console.error('Gemini hatası:', err.message);

    if (err instanceof GeminiError) {
      if (err.status === 429) {
        return error('Gemini API kota limiti aşıldı. Lütfen bir süre bekle.', 503);
      }
      if (err.status === 400) {
        return error('Geçersiz istek: ' + err.message, 400);
      }
    }

    return error('Metin işlenirken hata oluştu: ' + err.message, 502);
  }

  return json({
    success:    true,
    result,
    usage: {
      today: count,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - count),
    }
  });
}

/** GET /health */
async function handleHealth(env) {
  let usage = 0;
  try {
    usage = await getUsage(env.RATE_LIMIT_KV);
  } catch {
    // KV bağlantı hatası — sağlık kontrolü için kritik değil
  }

  return json({
    status:  'ok',
    model:   GEMINI_MODEL,
    usage: {
      today:     usage,
      limit:     DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - usage),
    },
    timestamp: new Date().toISOString(),
  });
}

/* ─────────────────────────────────────────────
   ANA HANDLER
───────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const path = url.pathname.replace(/\/+$/, '');

    try {
      if (path === '/format' && method === 'POST') {
        return await handleFormat(request, env);
      }

      if (path === '/health' && method === 'GET') {
        return await handleHealth(env);
      }

      return error(`Endpoint bulunamadı: ${method} ${path}`, 404);

    } catch (err) {
      console.error('Worker genel hata:', err);
      return error('Sunucu hatası: ' + err.message, 500);
    }
  }
};
