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
   system: model persona + format kuralları
   user:   sadece işlenecek metin
   Bölümler ||| ile ayrılır.
───────────────────────────────────────────── */

const SYS_BASE = `Sen profesyonel bir Türkçe LinkedIn içerik yazarısın.
ÇIKTI KURALI: Yalnızca istenen metin bölümlerini yaz. Açıklama, başlık, etiket, numara veya talimat metni EKLEME.
Yazım ve noktalama hatalarını düzelt. Türk alfabesini doğru kullan (ş ç ğ ü ö ı İ).`;

/** Genel düzeltme modu (fallback) */
function buildPrompt(text) {
  return {
    system: `${SYS_BASE}
Görevin: Metni düzelt ve iyileştir. Sadece düzeltilmiş metni döndür, başka hiçbir şey yazma.`,
    user: text,
  };
}

/** Şablon prompt'larında kullanılan user mesaj şablonu */
function userMsg(text, bolumler, ornek) {
  return `Aşağıdaki metni ${bolumler} bölüme ayır. Bölümler arasına tam olarak ||| karakterini koy. Başka hiçbir şey yazma.

Beklenen format: ${ornek}

METİN:
${text}`;
}

/** hikaye: Kişisel dönüşüm hikayesi */
function buildHikayePrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Merak uyandıran kısa açılış cümlesi (hook).
Bölüm 2: Hikayenin gelişimi — ne yaşandı (2-4 cümle).
Bölüm 3: Öğrenilen ders veya dönüşüm (1-2 cümle).`,
    user: userMsg(text, '3', 'Hook cümlesi.|||Gelişme paragrafı.|||Ders cümlesi.'),
  };
}

/** liste: Adım adım liste */
function buildListePrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Tek cümle başlık.
Bölüm 2: Her adım veya eylem ayrı satırda, madde işareti EKLEME.
Bölüm 3: Kapanış / çıkarım cümlesi (yoksa boş bırak).`,
    user: userMsg(text, '3', 'Başlık.|||Madde 1\nMadde 2\nMadde 3|||Sonuç cümlesi.'),
  };
}

/** fikir: Görüş / kanaat paylaşımı */
function buildFikirPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Ana görüş veya iddia (1-2 güçlü cümle).
Bölüm 2: Destekleyici argüman veya örnekler (2-4 cümle).
Bölüm 3: Okuyucuyu düşündüren meydan okuma (1-2 cümle).`,
    user: userMsg(text, '3', 'İddia cümlesi.|||Gerekçe paragrafı.|||Meydan okuma.'),
  };
}

/** vaka: Before/after vaka çalışması */
function buildVakaPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Vakanın genel bağlamı (1-2 cümle).
Bölüm 2: Başlangıç / önceki durum (1-3 cümle).
Bölüm 3: Uygulanan çözüm ve sonuç — rakamları koru (1-3 cümle).
Bölüm 4: Genel ders veya öneri (1-2 cümle).`,
    user: userMsg(text, '4', 'Genel bakış.|||Önce.|||Sonra.|||Çıkarım.'),
  };
}

/** ipucu: Pratik ipucu / hızlı öneri */
function buildIpucuPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: İpucunu tanıtan dikkat çekici tek cümle.
Bölüm 2: Neden işe yaradığı (1-2 cümle).
Bölüm 3: Nasıl uygulanır, her adım ayrı satırda (1-4 satır).`,
    user: userMsg(text, '3', 'İpucu başlığı.|||Neden açıklaması.|||Adım 1\nAdım 2'),
  };
}

/** soru: Merak uyandıran soru */
function buildSoruPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Soruyu anlamlı kılan kısa bağlam (1-2 cümle).
Bölüm 2: Tek net soru cümlesi, ? ile bitmeli.
Bölüm 3: Okuyucuyu düşündüren not (1-2 cümle).`,
    user: userMsg(text, '3', 'Bağlam cümlesi.|||Ana soru?|||Düşündürücü not.'),
  };
}

/** istatistik: Veri/sayı odaklı paylaşım */
function buildIstatistikPrompt(text) {
  return {
    system: `${SYS_BASE}
Tüm rakamları ve istatistikleri koru.
Bölüm 1: Ana istatistik veya bulgu (1-2 cümle).
Bölüm 2: Bu verinin önemi ve anlamı (2-3 cümle).
Bölüm 3: Çıkarım veya aksiyon önerisi (1-2 cümle).`,
    user: userMsg(text, '3', 'Veri cümlesi.|||Anlam açıklaması.|||Çıkarım.'),
  };
}

/** basari: Başarı/kazanım paylaşımı */
function buildBasariPrompt(text) {
  return {
    system: `${SYS_BASE}
Rakamları koru.
Bölüm 1: Başarı veya kazanım (1-2 cümle).
Bölüm 2: Bunu mümkün kılan 2-4 faktör — her faktör ayrı satırda.
Bölüm 3: Alçakgönüllü yansıma veya minnet (1-2 cümle).`,
    user: userMsg(text, '3', 'Başarı cümlesi.|||Faktör 1\nFaktör 2\nFaktör 3|||Yansıma.'),
  };
}

/** hata: Hata/ders paylaşımı */
function buildHataPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Yapılan hata veya yanlış karar, dürüst ve açık bir dille (1-2 cümle).
Bölüm 2: Ne yanlış gitti, neden (2-3 cümle).
Bölüm 3: Öğrenilen ders (1-2 cümle).`,
    user: userMsg(text, '3', 'Hata cümlesi.|||Ne yanlış gitti.|||Ders.'),
  };
}

/** karsilastirma: Eski vs Yeni karşılaştırması */
function buildKarsilastirmaPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Neyin karşılaştırıldığı (1 cümle).
Bölüm 2: Eski yöntem veya durum (1-2 cümle).
Bölüm 3: Yeni yöntem veya durum (1-2 cümle).
Bölüm 4: En kritik fark veya kazanım (1-2 cümle).`,
    user: userMsg(text, '4', 'Konu.|||Eski durum.|||Yeni durum.|||Temel fark.'),
  };
}

/** manifesto: Kişisel ilkeler / inanç bildirisi */
function buildManifestoPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Manifestonun temasını tanıtan güçlü tek cümle.
Bölüm 2: Her ilkeyi ayrı satıra yaz — kısa ve vurucu.
Bölüm 3: İlkelerin neden önemli olduğu (1-2 cümle).`,
    user: userMsg(text, '3', 'Tema.|||İlke 1\nİlke 2\nİlke 3|||Kapanış.'),
  };
}

/** mektup: Geçmiş/gelecek benliğe mektup */
function buildMektupPrompt(text) {
  return {
    system: `${SYS_BASE}
Sıcak ve samimi bir dil kullan.
Bölüm 1: Mektubun açılışı, kime yazıldığını hissettir (1-2 cümle).
Bölüm 2: Ana mesaj, öğrenilen veya tavsiye edilen (2-4 cümle).
Bölüm 3: Umut veya temenni ile kapanış (1-2 cümle, yoksa boş bırak).`,
    user: userMsg(text, '3', 'Açılış cümlesi.|||Ana mesaj.|||Kapanış.'),
  };
}

/** karar: Zor karar verme süreci */
function buildKararPrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Verilen karar, net ve kararlı bir dille (1-2 cümle).
Bölüm 2: 2-4 gerekçe — her gerekçe ayrı satırda.
Bölüm 3: Kararın sonucu veya öğrenilen ders (1-2 cümle).`,
    user: userMsg(text, '3', 'Karar cümlesi.|||Gerekçe 1\nGerekçe 2\nGerekçe 3|||Yansıma.'),
  };
}

/** tavsiye: Pratik tavsiye listesi */
function buildTavsiyePrompt(text) {
  return {
    system: `${SYS_BASE}
Bölüm 1: Tavsiyelerin bağlamı ve kime hitap ettiği (1-2 cümle).
Bölüm 2: Her tavsiyeyi ayrı satıra yaz, numarasız düz cümle.
Bölüm 3: Özet veya son mesaj (1-2 cümle).`,
    user: userMsg(text, '3', 'Bağlam.|||Tavsiye 1\nTavsiye 2\nTavsiye 3|||Kapanış.'),
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
