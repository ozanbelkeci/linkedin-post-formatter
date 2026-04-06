/**
 * LinkedIn Post Formatter — Cloudflare Worker Proxy
 *
 * Endpoints:
 *   POST /format   → Groq (llama-3.1-8b-instant) ile şablona özel formatlama
 *   GET  /health   → Servis durumu + günlük kullanım
 *
 * KV namespace bağlantısı:
 *   wrangler.toml'da  [[kv_namespaces]] name = "RATE_LIMIT_KV"
 *
 * Environment variables:
 *   GROQ_API_KEY  — Groq Console'dan alınan API key
 *   RATE_LIMIT_KV — Cloudflare KV namespace binding
 */

/* ─────────────────────────────────────────────
   SABİTLER
───────────────────────────────────────────── */
const DAILY_LIMIT     = 14000;
const GROQ_MODEL      = 'llama-3.1-8b-instant';
const GROQ_API_BASE   = 'https://api.groq.com/openai/v1';
const KV_KEY_PREFIX   = 'daily_count';
const KV_TTL_SECONDS  = 60 * 60 * 26; // 26 saat

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
   Her builder { system, user } döndürür.
   system: model persona + bölüm tanımları + format kuralı
   user:   sadece ham metin
   Bölümler ||| ile ayrılır — örnek metinler system'de.
───────────────────────────────────────────── */

/**
 * Sistem mesajı: persona + içerik kalitesi + format zorunluluğu.
 * sections: [{ ad, açıklama }] dizisi
 * Çıktı: system string
 */
function buildSystem(sections) {
  const bolumAciklamalari = sections.map((s, i) =>
    `${i + 1}. ${s.ad}: ${s.aciklama}`
  ).join('\n');

  return `Sen deneyimli bir LinkedIn içerik stratejistisin. Türkçe yazıyorsun.

GÖREV:
- Kullanıcının metnini daha çekici, akıcı ve LinkedIn'e uygun hale getir.
- Yazım ve noktalama hatalarını düzelt (ş ç ğ ü ö ı İ).
- Ana fikri ve gerçek deneyimi koru; kendi yorumunu ve güçlendirici ifadeler ekleyebilirsin.
- Metni abartma, doğal ve samimi tut.

YANIT FORMATI — KESİNLİKLE UY:
Yanıtın ${sections.length} bölümden oluşmalı. Bölümleri birbirinden ayırmak için aralarına ||| yaz.
Etiket, numara, açıklama veya başlık YAZMA. Sadece bölüm içeriklerini yaz.

BÖLÜM TANIMLARI:
${bolumAciklamalari}`;
}

/** Genel düzeltme modu (fallback) */
function buildPrompt(text) {
  return {
    system: `Sen deneyimli bir LinkedIn içerik stratejistisin. Türkçe yazıyorsun.
Metni daha çekici ve akıcı hale getir. Yazım hatalarını düzelt. Ana fikri koru.
ÇIKTI KURALI: Sadece düzeltilmiş ve iyileştirilmiş metni döndür, başka hiçbir şey yazma.`,
    user: text,
  };
}

/** hikaye: Kişisel dönüşüm hikayesi */
function buildHikayePrompt(text) {
  return {
    system: buildSystem([
      { ad: 'HOOK',    aciklama: 'Okuyucuyu ilk cümleden yakalayan merak uyandırıcı açılış (1-2 cümle).' },
      { ad: 'GELİŞME', aciklama: 'Hikayenin gövdesi — ne yaşandı, süreç nasıl ilerledi (2-4 cümle).' },
      { ad: 'DERS',    aciklama: 'Bu deneyimden çıkarılan öğrenim veya dönüşüm (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** liste: Adım adım liste */
function buildListePrompt(text) {
  return {
    system: buildSystem([
      { ad: 'BAŞLIK',   aciklama: 'Tek cümle açılış / hook.' },
      { ad: 'MADDELER', aciklama: 'Her adım veya eylem ayrı satırda. Madde işareti veya numara EKLEME.' },
      { ad: 'SONUÇ',    aciklama: 'Kapanış veya çıkarım cümlesi. Metinde yoksa boş bırak.' },
    ]),
    user: text,
  };
}

/** fikir: Görüş / kanaat paylaşımı */
function buildFikirPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'İDDİA',        aciklama: 'Ana görüş veya iddia — güçlü ve net (1-2 cümle).' },
      { ad: 'GEREKÇE',      aciklama: 'Destekleyici argüman veya örnekler (2-4 cümle).' },
      { ad: 'MEYDAN OKUMA', aciklama: 'Okuyucuyu düşündüren, tartışmaya kapı açan son (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** vaka: Before/after vaka çalışması */
function buildVakaPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'GENEL BAKIŞ', aciklama: 'Vakanın konusu ve bağlamı (1-2 cümle).' },
      { ad: 'ÖNCE',        aciklama: 'Başlangıç durumu — problem neydi (1-3 cümle).' },
      { ad: 'SONRA',       aciklama: 'Çözüm ve sonuç — rakamları koru (1-3 cümle).' },
      { ad: 'ÇIKARIM',     aciklama: 'Genel ders veya öneri (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** ipucu: Pratik ipucu / hızlı öneri */
function buildIpucuPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'BAŞLIK', aciklama: 'İpucunu tanıtan dikkat çekici tek cümle.' },
      { ad: 'NEDEN',  aciklama: 'Neden işe yaradığı (1-2 cümle).' },
      { ad: 'NASIL',  aciklama: 'Uygulama adımları — her adım ayrı satırda (1-4 satır).' },
    ]),
    user: text,
  };
}

/** soru: Merak uyandıran soru */
function buildSoruPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'BAĞLAM',     aciklama: 'Soruyu anlamlı kılan kısa bağlam (1-2 cümle).' },
      { ad: 'SORU',       aciklama: 'Ana soru cümlesi — ? ile bitmeli.' },
      { ad: 'İLGİNÇ YAN', aciklama: 'Okuyucuyu düşündüren ek not (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** istatistik: Veri/sayı odaklı paylaşım */
function buildIstatistikPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'VERİ',      aciklama: 'Ana istatistik veya bulgu — rakamları koru (1-2 cümle).' },
      { ad: 'ANLAM',     aciklama: 'Bu verinin önemi ve sektör için anlamı (2-3 cümle).' },
      { ad: 'ÇIKARIM',   aciklama: 'Aksiyon önerisi veya ders (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** basari: Başarı/kazanım paylaşımı */
function buildBasariPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'BAŞARI',    aciklama: 'Başarı veya kazanım — rakamları koru (1-2 cümle).' },
      { ad: 'FAKTÖRLER', aciklama: 'Bunu mümkün kılan 2-4 faktör — her faktör ayrı satırda.' },
      { ad: 'YANSIMA',   aciklama: 'Alçakgönüllü yansıma veya minnet (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** hata: Hata/ders paylaşımı */
function buildHataPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'HATA',           aciklama: 'Yapılan hata — dürüst ve açık dille (1-2 cümle).' },
      { ad: 'NE YANLIŞ GİTTİ', aciklama: 'Hatanın nedeni ve süreci (2-3 cümle).' },
      { ad: 'DERS',           aciklama: 'Öğrenilen ders (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** karsilastirma: Eski vs Yeni karşılaştırması */
function buildKarsilastirmaPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'KONU',       aciklama: 'Neyin karşılaştırıldığı (1 cümle).' },
      { ad: 'ESKİ',       aciklama: 'Eski yöntem veya durum (1-2 cümle).' },
      { ad: 'YENİ',       aciklama: 'Yeni yöntem veya durum (1-2 cümle).' },
      { ad: 'TEMEL FARK', aciklama: 'En kritik fark veya kazanım (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** manifesto: Kişisel ilkeler / inanç bildirisi */
function buildManifestoPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'GİRİŞ',   aciklama: 'Manifestonun temasını tanıtan güçlü tek cümle.' },
      { ad: 'İLKELER', aciklama: 'Her ilke ayrı satırda — kısa ve vurucu.' },
      { ad: 'KAPANIŞ', aciklama: 'İlkelerin önemi veya taahhüt (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** mektup: Geçmiş/gelecek benliğe mektup */
function buildMektupPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'AÇILIŞ', aciklama: 'Mektubun açılışı, kime yazıldığını hissettir (1-2 cümle). Sıcak ve samimi.' },
      { ad: 'ANA MESAJ', aciklama: 'Ana mesaj — öğrenilen veya tavsiye edilen (2-4 cümle).' },
      { ad: 'KAPANIŞ', aciklama: 'Umut veya temenni (1-2 cümle). Yoksa boş bırak.' },
    ]),
    user: text,
  };
}

/** karar: Zor karar verme süreci */
function buildKararPrompt(text) {
  return {
    system: buildSystem([
      { ad: 'KARAR',     aciklama: 'Verilen karar — net ve kararlı (1-2 cümle).' },
      { ad: 'GEREKÇELER', aciklama: '2-4 gerekçe — her gerekçe ayrı satırda.' },
      { ad: 'YANSIMA',   aciklama: 'Kararın sonucu veya öğrenilen ders (1-2 cümle).' },
    ]),
    user: text,
  };
}

/** tavsiye: Pratik tavsiye listesi */
function buildTavsiyePrompt(text) {
  return {
    system: buildSystem([
      { ad: 'GİRİŞ',     aciklama: 'Tavsiyelerin bağlamı ve kime hitap ettiği (1-2 cümle).' },
      { ad: 'TAVSİYELER', aciklama: 'Her tavsiye ayrı satırda — numarasız, düz cümle.' },
      { ad: 'KAPANIŞ',   aciklama: 'Özet veya son mesaj (1-2 cümle).' },
    ]),
    user: text,
  };
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
   GROQ API ÇAĞRISI (OpenAI-compatible)
───────────────────────────────────────────── */
async function callGroq(apiKey, systemMsg, userMsg, temperature = 0.3) {
  const url = `${GROQ_API_BASE}/chat/completions`;

  const body = {
    model:      GROQ_MODEL,
    temperature,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user',   content: userMsg   },
    ],
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new GroqError(res.status, errText);
  }

  const data = await res.json();

  const result = data?.choices?.[0]?.message?.content;
  if (!result) throw new Error('Groq boş yanıt döndürdü.');

  return result.trim();
}

class GroqError extends Error {
  constructor(status, body) {
    super(`Groq API hatası: HTTP ${status}`);
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

  if (!env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY environment variable tanımlanmamış.');
    return error('Sunucu yapılandırma hatası.', 500);
  }

  // Şablona göre prompt seç
  const builder      = PROMPT_BUILDERS[mode] || buildPrompt;
  const isStructured = mode && mode in PROMPT_BUILDERS && mode !== 'default' && mode !== 'list';
  const temperature  = isStructured ? 0.4 : 0.3;
  const { system, user } = builder(text.trim());

  let result;
  try {
    result = await callGroq(env.GROQ_API_KEY, system, user, temperature);
  } catch (err) {
    console.error('Groq hatası:', err.message);

    if (err instanceof GroqError) {
      if (err.status === 429) {
        return error('Groq API kota limiti aşıldı. Lütfen bir süre bekle.', 503);
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
