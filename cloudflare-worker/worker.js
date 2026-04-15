/**
 * Postify — Cloudflare Worker Proxy
 *
 * Endpoints:
 *   POST /format        → Groq (llama-3.1-8b-instant) ile şablona özel formatlama
 *   POST /ab-test       → Aynı metin için iki farklı hook versiyonu üret
 *   POST /analyze       → Viral potansiyel analizi (JSON skor)
 *   POST /tone-analyze  → Yazı tonu profili çıkar (JSON)
 *   POST /hashtag-score     → Hashtag popülerlik değerlendirmesi
 *   POST /validate-license  → Polar.sh lisans key doğrulama (token gizli kalır)
 *   GET  /health            → Servis durumu + günlük kullanım
 *
 * KV namespace bağlantısı:
 *   wrangler.toml'da  [[kv_namespaces]] name = "RATE_LIMIT_KV"
 *
 * Environment variables (wrangler secret put):
 *   GROQ_API_KEY         — Groq Console'dan alınan API key
 *   POLAR_ACCESS_TOKEN   — Polar.sh Organization Access Token
 *   RATE_LIMIT_KV        — Cloudflare KV namespace binding
 */

/* ─────────────────────────────────────────────
   SABİTLER
───────────────────────────────────────────── */
const DAILY_LIMIT        = 14000;
const PER_IP_DAILY_LIMIT = 120;       // Tek IP başına günlük istek limiti
const GROQ_MODEL         = 'llama-3.1-8b-instant';
const GROQ_API_BASE      = 'https://api.groq.com/openai/v1';
const KV_KEY_PREFIX      = 'daily_count';
const KV_TTL_SECONDS     = 60 * 60 * 26; // 26 saat

/* ─────────────────────────────────────────────
   CORS HEADERS
───────────────────────────────────────────── */
function getCorsHeaders(request) {
  const origin  = (request && request.headers.get('Origin')) || '';
  const allowed = origin.startsWith('chrome-extension://') ? origin : 'null';
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  };
}

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
function buildSystem(sections, ton) {
  const sectionDefs = sections.map((s, i) =>
    `${i + 1}. ${s.ad}: ${s.aciklama}`
  ).join('\n');

  const toneMap = {
    samimi:       'TONE: Conversational and warm. Write like talking to a trusted friend. Use "I" freely, contractions welcome, keep it human and relatable. Avoid corporate-speak.',
    motivasyonel: 'TONE: High-energy and inspiring. Punchy, short sentences. Powerful action verbs. Create urgency and momentum. Every line should make the reader feel unstoppable.',
    profesyonel:  'TONE: Professional and credible. Structured, clear, authoritative. Data-driven where possible. Confident but not cold. No slang.',
  };
  const toneInstruction = ton && toneMap[ton] ? `\n\n${toneMap[ton]}` : '';

  return `You are an expert LinkedIn content strategist. Detect the user's language and respond ONLY in that exact language throughout the entire response. Never mix languages or switch to a different language.${toneInstruction}

TASK:
- Transform the user's raw text into an engaging, polished LinkedIn post.
- Fix spelling and punctuation errors.
- Preserve the core idea and authentic voice; add compelling phrases where helpful.
- Keep it natural — no fluff or exaggeration.

OUTPUT RULES — STRICTLY FOLLOW:
Respond with exactly ${sections.length} parts separated by |||.
Do NOT add any labels, section headers, numbers, or explanations. Write only the content itself.

CONTENT PARTS:
${sectionDefs}`;
}

/** Genel düzeltme modu (fallback) */
function buildPrompt(text) {
  return {
    system: `You are an expert LinkedIn content strategist. Detect the user's language and respond ONLY in that exact language. Never mix languages.
Improve the text to be more engaging and natural. Fix spelling and punctuation errors. Preserve the core idea.
OUTPUT RULE: Return only the improved text, nothing else.`,
    user: text,
  };
}

/** hikaye: Kişisel dönüşüm hikayesi */
function buildHikayePrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'opening',     aciklama: 'Hook sentence that grabs the reader immediately (1-2 sentences).' },
      { ad: 'development', aciklama: 'The story body — what happened, how it unfolded (2-4 sentences).' },
      { ad: 'lesson',      aciklama: 'The key insight or transformation from this experience (1-2 sentences).' },
      { ad: 'cta',         aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** liste: Adım adım liste */
function buildListePrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'title',      aciklama: 'Single hook sentence to open the list.' },
      { ad: 'items',      aciklama: 'Each step or action on its own line. Do NOT add bullet symbols or numbers.' },
      { ad: 'conclusion', aciklama: 'One closing or takeaway sentence. Leave empty if not in the original.' },
      { ad: 'cta',        aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** fikir: Görüş / kanaat paylaşımı */
function buildFikirPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'claim',     aciklama: 'The main opinion or claim — strong and clear (1-2 sentences).' },
      { ad: 'reasoning', aciklama: 'Supporting arguments or examples (2-4 sentences).' },
      { ad: 'challenge', aciklama: 'A thought-provoking closing that invites debate (1-2 sentences).' },
      { ad: 'cta',       aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** vaka: Before/after vaka çalışması */
function buildVakaPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'overview',  aciklama: 'The case topic and context (1-2 sentences).' },
      { ad: 'before',    aciklama: 'The starting situation — what the problem was (1-3 sentences).' },
      { ad: 'after',     aciklama: 'The solution and result — preserve any numbers (1-3 sentences).' },
      { ad: 'takeaway',  aciklama: 'The general lesson or recommendation (1-2 sentences).' },
      { ad: 'cta',       aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** ipucu: Pratik ipucu / hızlı öneri */
function buildIpucuPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'title', aciklama: 'Attention-grabbing single sentence that introduces the tip.' },
      { ad: 'why',   aciklama: 'Why it works (1-2 sentences).' },
      { ad: 'how',   aciklama: 'How to apply it — each step on its own line (1-4 lines).' },
      { ad: 'cta',   aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** soru: Merak uyandıran soru */
function buildSoruPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'context',  aciklama: 'Short context that makes the question meaningful (1-2 sentences).' },
      { ad: 'question', aciklama: 'The main question — MUST end with a question mark (?).' },
      { ad: 'hook',     aciklama: 'An additional thought-provoking note to deepen engagement (1-2 sentences).' },
      { ad: 'cta',      aciklama: 'A single short sentence inviting readers to share their answer. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** istatistik: Veri/sayı odaklı paylaşım */
function buildIstatistikPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'data',     aciklama: 'The main statistic or finding — preserve all numbers (1-2 sentences).' },
      { ad: 'meaning',  aciklama: 'What this data means and why it matters for the industry (2-3 sentences).' },
      { ad: 'takeaway', aciklama: 'Action recommendation or lesson (1-2 sentences).' },
      { ad: 'cta',      aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** basari: Başarı/kazanım paylaşımı */
function buildBasariPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'achievement', aciklama: 'The achievement or win — preserve any numbers (1-2 sentences).' },
      { ad: 'factors',     aciklama: '2-4 factors that made it possible — each on its own line.' },
      { ad: 'reflection',  aciklama: 'A humble reflection or expression of gratitude (1-2 sentences).' },
      { ad: 'cta',         aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** hata: Hata/ders paylaşımı */
function buildHataPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'mistake',       aciklama: 'The mistake — honest and direct (1-2 sentences).' },
      { ad: 'what went wrong', aciklama: 'Why it happened and how it played out (2-3 sentences).' },
      { ad: 'lesson',        aciklama: 'The lesson learned (1-2 sentences).' },
      { ad: 'cta',           aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** karsilastirma: Eski vs Yeni karşılaştırması */
function buildKarsilastirmaPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'topic',          aciklama: 'What is being compared (1 sentence).' },
      { ad: 'old way',        aciklama: 'The old method or situation (1-2 sentences).' },
      { ad: 'new way',        aciklama: 'The new method or situation (1-2 sentences).' },
      { ad: 'key difference', aciklama: 'The most critical difference or gain (1-2 sentences).' },
      { ad: 'cta',            aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** manifesto: Kişisel ilkeler / inanç bildirisi */
function buildManifestoPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'opening',    aciklama: 'One powerful sentence that sets the theme of the manifesto. No label or heading.' },
      { ad: 'principles', aciklama: 'Each principle on its own line — short, impactful statements.' },
      { ad: 'closing',    aciklama: 'A closing statement that starts with a transitional word like "Finally," or its equivalent in the post\'s language (1-2 sentences). No label or heading.' },
      { ad: 'cta',        aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** mektup: Geçmiş/gelecek benliğe mektup */
function buildMektupPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'opening',      aciklama: 'Start with a salutation like "Dear 2019 me," or its equivalent in the post\'s language (e.g. "Sevgili 2019\'daki ben,"). Then 1-2 warm opening sentences.' },
      { ad: 'main message', aciklama: 'The main message — what was learned or advised (2-4 sentences).' },
      { ad: 'closing',      aciklama: 'A closing line ending with a signature like "Your future self." or its equivalent in the post\'s language (e.g. "Şimdiki sen.").' },
      { ad: 'cta',          aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** karar: Zor karar verme süreci */
function buildKararPrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'decision',   aciklama: 'The decision made — clear and decisive (1-2 sentences).' },
      { ad: 'reasons',    aciklama: '2-4 reasons — each on its own line.' },
      { ad: 'reflection', aciklama: 'The outcome or lesson learned from the decision (1-2 sentences).' },
      { ad: 'cta',        aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
    user: text,
  };
}

/** hashtags: Dile uygun LinkedIn hashtag üretimi */
function buildHashtagPrompt(text) {
  return {
    system: `You are a LinkedIn hashtag specialist. Detect the language of the input text. Generate exactly 8 highly relevant LinkedIn hashtags in that SAME language. Return ONLY the hashtags separated by a single space on one line. Each hashtag must start with #. No explanations, no numbers, no other text.`,
    user: text,
  };
}

/** tavsiye: Pratik tavsiye listesi */
function buildTavsiyePrompt(text, ton) {
  return {
    system: buildSystem([
      { ad: 'context', aciklama: 'The context of the advice and who it is aimed at (1-2 sentences). No label or heading.' },
      { ad: 'advice',  aciklama: 'Each piece of advice on its own line — no numbers, plain sentence.' },
      { ad: 'closing', aciklama: 'A closing that starts with a transitional word like "Finally," or its equivalent in the post\'s language (1-2 sentences). No label or heading.' },
      { ad: 'cta',     aciklama: 'A single short question to invite reader comments. Match the language of the post. No emoji.' },
    ], ton),
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
  hashtags: buildHashtagPrompt,
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

/** IPv4/IPv6 formatını doğrular; geçersizse null döner */
function sanitizeIp(ip) {
  if (!ip) return null;
  if (!/^[\d.:a-fA-F]{1,45}$/.test(ip)) return null;
  return ip;
}

/** IP başına günlük limit kontrolü — aşıldıysa true döner */
async function checkIpLimit(kv, ip) {
  const cleanIp = sanitizeIp(ip);
  if (!cleanIp) return false; // Geçersiz/eksik IP → rate limit atla
  const key = `ip:${getTodayKey()}:${cleanIp}`;
  const raw  = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= PER_IP_DAILY_LIMIT) return true;
  await kv.put(key, String(count + 1), { expirationTtl: KV_TTL_SECONDS });
  return false;
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

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 25000);

  let res;
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr.name === 'AbortError') {
      throw new Error('İstek zaman aşımına uğradı. Lütfen tekrar deneyin.');
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text();
    throw new GroqError(res.status, errText);
  }

  const data = await res.json();

  const result = data?.choices?.[0]?.message?.content;
  if (!result) throw new Error('Groq boş yanıt döndürdü.');

  return result.trim().replace(/\*\*/g, '');
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
function json(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type':           'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options':        'DENY',
      'Referrer-Policy':        'no-referrer',
      'Cache-Control':          'no-store',
    },
  });
}

function error(message, status = 400, extra = {}, request = null) {
  return json({ success: false, error: message, ...extra }, status, request);
}

/* ─────────────────────────────────────────────
   ROUTE HANDLERS
───────────────────────────────────────────── */

/* Allowed values for whitelist validation */
const ALLOWED_MODES = [
  'hikaye','liste','fikir','vaka','ipucu','soru','istatistik','basari',
  'hata','karsilastirma','manifesto','mektup','karar','tavsiye',
  'hashtags','default','list',
];
const ALLOWED_TONES = ['samimi','motivasyonel','profesyonel'];

/** POST /format */
async function handleFormat(request, env) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    return error('Content-Type application/json olmalı.', 415, {}, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error('Geçersiz JSON formatı.', 400, {}, request);
  }

  const { text, mode, ton } = body;

  if (typeof text !== 'string' || text.trim().length === 0) {
    return error('"text" alanı boş olamaz.', 400, {}, request);
  }
  if (text.length > 5_000) {
    return error('Metin çok uzun. Maksimum 5.000 karakter.', 400, {}, request);
  }
  if (mode && !ALLOWED_MODES.includes(mode)) {
    return error('Geçersiz şablon modu.', 400, {}, request);
  }
  if (ton && !ALLOWED_TONES.includes(ton)) {
    return error('Geçersiz ton değeri.', 400, {}, request);
  }

  // Per-IP rate limit kontrolü
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const ipExceeded = await checkIpLimit(env.RATE_LIMIT_KV, clientIp);
  if (ipExceeded) {
    return error('Çok fazla istek gönderdiniz. Lütfen yarın tekrar deneyin.', 429, {}, request);
  }

  // Global günlük rate limit kontrolü
  const { count, exceeded } = await incrementAndCheck(env.RATE_LIMIT_KV);
  if (exceeded) {
    return error(
      'Günlük kapasite doldu, yarın tekrar dene.',
      429,
      { dailyLimit: DAILY_LIMIT, resetAt: 'UTC 00:00' },
      request
    );
  }

  if (!env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY environment variable tanımlanmamış.');
    return error('Sunucu yapılandırma hatası.', 500, {}, request);
  }

  // Şablona göre prompt seç
  const builder      = PROMPT_BUILDERS[mode] || buildPrompt;
  const isStructured = mode && mode in PROMPT_BUILDERS && mode !== 'default' && mode !== 'list';
  const temperature  = mode === 'hashtags' ? 0.2 : isStructured ? 0.4 : 0.3;
  const { system, user } = builder(text.trim(), ton);

  let result;
  try {
    result = await callGroq(env.GROQ_API_KEY, system, user, temperature);
  } catch (err) {
    console.error('Groq hatası:', err.message);

    if (err instanceof GroqError) {
      if (err.status === 429) {
        return error('Groq API kota limiti aşıldı. Lütfen bir süre bekle.', 503, {}, request);
      }
      if (err.status === 400) {
        return error('Geçersiz istek gönderildi.', 400, {}, request);
      }
    }

    return error('Metin işlenirken bir hata oluştu. Lütfen tekrar deneyin.', 502, {}, request);
  }

  return json({
    success:    true,
    result,
    usage: {
      today: count,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - count),
    }
  }, 200, request);
}

/** POST /validate-license — Polar.sh lisans key doğrulama proxy */
async function handleValidateLicense(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== 'string') {
    return error('Geçersiz istek formatı.', 400, {}, request);
  }

  const key = body.key.trim().toUpperCase();
  if (!key || !/^[A-Z0-9-]{8,100}$/.test(key)) {
    return json({ success: false, error: 'Geçersiz lisans anahtarı formatı.' }, 200, request);
  }

  // IP başına günlük 20 deneme limiti (brute-force koruması)
  const licIp = sanitizeIp(request.headers.get('CF-Connecting-IP') || '');
  if (licIp) {
    const licIpKey = `lic_ip:${getTodayKey()}:${licIp}`;
    const hits = parseInt(await env.RATE_LIMIT_KV.get(licIpKey) || '0', 10);
    if (hits >= 20) {
      return json({ success: false, error: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.', networkError: true }, 200, request);
    }
    await env.RATE_LIMIT_KV.put(licIpKey, String(hits + 1), { expirationTtl: KV_TTL_SECONDS });
  }

  if (!env.POLAR_ACCESS_TOKEN) {
    console.error('[validate-license] POLAR_ACCESS_TOKEN tanımlı değil');
    return json({ success: false, error: 'Sunucu yapılandırma hatası.', networkError: true }, 200, request);
  }

  try {
    const resp = await fetch('https://api.polar.sh/v1/license-keys/validate', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        key,
        organization_id: '5c7dd4fb-9d76-46b4-8ed7-d245be8d64c2',
      }),
    });

    const polarBody = await resp.json().catch(() => ({}));

    // 401/403 → token geçersiz veya yetersiz yetki (sunucu tarafı sorun)
    if (resp.status === 401 || resp.status === 403) {
      return json({ success: false, error: 'Sunucu yapılandırma hatası.', networkError: true }, 200, request);
    }

    // 404 veya 422 → key bulunamadı / doğrulama hatası
    if (resp.status === 404 || resp.status === 422) {
      return json({ success: false, error: 'Geçersiz lisans anahtarı.' }, 200, request);
    }

    // Diğer 4xx
    if (resp.status >= 400 && resp.status < 500) {
      return json({ success: false, error: 'Geçersiz lisans anahtarı.' }, 200, request);
    }

    // 5xx → geçici sunucu sorunu (networkError → offline cache'e düş)
    if (!resp.ok) {
      return json({ success: false, error: 'Lisans doğrulanamadı. Lütfen tekrar deneyin.', networkError: true }, 200, request);
    }

    const data  = polarBody;
    const valid = data.status === 'granted';

    return json({
      success: valid,
      status:  data.status,
      ...(valid ? {} : { error: 'Lisansınız aktif değil veya iptal edilmiş.' }),
    }, 200, request);

  } catch (err) {
    console.error('[validate-license] Polar bağlantı hatası:', err);
    return json({ success: false, error: 'Bağlantı hatası. Lütfen tekrar deneyin.', networkError: true }, 200, request);
  }
}

/** GET /health */
async function handleHealth(request, env) {
  let usage = 0;
  try {
    usage = await getUsage(env.RATE_LIMIT_KV);
  } catch {
    // KV bağlantı hatası — sağlık kontrolü için kritik değil
  }

  return json({
    status:  'ok',
    model:   GROQ_MODEL,
    usage: {
      today:     usage,
      limit:     DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - usage),
    },
    timestamp: new Date().toISOString(),
  }, 200, request);
}

/** POST /ab-test */
async function handleAbTest(request, env) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return error('Content-Type application/json olmalı.', 415, {}, request);

  let body;
  try { body = await request.json(); } catch { return error('Geçersiz JSON formatı.', 400, {}, request); }

  const { text, ton, lang } = body;
  if (typeof text !== 'string' || text.trim().length === 0) return error('"text" alanı boş olamaz.', 400, {}, request);
  if (text.length > 5_000) return error('Metin çok uzun. Maksimum 5.000 karakter.', 400, {}, request);

  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  if (await checkIpLimit(env.RATE_LIMIT_KV, clientIp)) return error('Çok fazla istek gönderdiniz. Lütfen yarın tekrar deneyin.', 429, {}, request);
  const { count, exceeded } = await incrementAndCheck(env.RATE_LIMIT_KV);
  if (exceeded) return error('Günlük kapasite doldu, yarın tekrar dene.', 429, { dailyLimit: DAILY_LIMIT, resetAt: 'UTC 00:00' }, request);
  if (!env.GROQ_API_KEY) return error('Sunucu yapılandırma hatası.', 500, {}, request);

  const langNames = { tr: 'Turkish', en: 'English', fr: 'French', de: 'German', es: 'Spanish' };
  const langInstruction = lang && langNames[lang]
    ? `LANGUAGE: Write the ENTIRE response in ${langNames[lang]}. Do not use any other language.`
    : 'Detect the user\'s language from the text and respond ONLY in that exact language. Never mix languages.';

  const systemB = `You are an expert LinkedIn content strategist. ${langInstruction}
${ton === 'samimi' ? 'TONE: Conversational and warm. Write like talking to a trusted friend. Use "I" freely, keep it human.' : ton === 'motivasyonel' ? 'TONE: High-energy and inspiring. Punchy, short sentences. Create urgency and momentum.' : 'TONE: Professional and credible. Structured, clear, authoritative.'}

STRUCTURE (follow in order):
1. Opening: A statistic or data-driven hook — use a number or percentage even if approximate (1-2 sentences).
2. Body: Develop the insight — what it means and why it matters (3-5 sentences). End the body with a full stop — do NOT end with a question.

OUTPUT RULES:
- Return only the post text. No labels, no section headers, no numbers.
- Do NOT wrap the text in quotes.
- Do NOT include any hashtags.
- Do NOT end with a question — the closing question is added separately.`;

  try {
    const versionB = await callGroq(env.GROQ_API_KEY, systemB, text.trim(), 0.5);
    return json({ success: true, versionB, usage: { today: count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count) } }, 200, request);
  } catch (err) {
    console.error('AB test Groq hatası:', err.message);
    if (err instanceof GroqError && err.status === 429) return error('Groq API kota limiti aşıldı. Lütfen bir süre bekle.', 503, {}, request);
    return error('Metin işlenirken bir hata oluştu. Lütfen tekrar deneyin.', 502, {}, request);
  }
}

/** POST /analyze */
async function handleAnalyze(request, env) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return error('Content-Type application/json olmalı.', 415, {}, request);

  let body;
  try { body = await request.json(); } catch { return error('Geçersiz JSON formatı.', 400, {}, request); }

  const { text } = body;
  if (typeof text !== 'string' || text.trim().length === 0) return error('"text" alanı boş olamaz.', 400, {}, request);
  if (text.length > 5_000) return error('Metin çok uzun. Maksimum 5.000 karakter.', 400, {}, request);

  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  if (await checkIpLimit(env.RATE_LIMIT_KV, clientIp)) return error('Çok fazla istek gönderdiniz. Lütfen yarın tekrar deneyin.', 429, {}, request);
  const { count, exceeded } = await incrementAndCheck(env.RATE_LIMIT_KV);
  if (exceeded) return error('Günlük kapasite doldu, yarın tekrar dene.', 429, { dailyLimit: DAILY_LIMIT, resetAt: 'UTC 00:00' }, request);
  if (!env.GROQ_API_KEY) return error('Sunucu yapılandırma hatası.', 500, {}, request);

  const system = `You are a LinkedIn content analyst. Analyze the given post and return ONLY a valid JSON object (no markdown, no code blocks, no extra text).
Rate each factor from 0 to 100. The "tip" field must be in the SAME language as the post.
Required format: {"hook":0,"emotion":0,"shareability":0,"cta":0,"overall":0,"tip":""}`;

  let raw;
  try {
    raw = await callGroq(env.GROQ_API_KEY, system, text.trim(), 0.2);
  } catch (err) {
    console.error('Analyze Groq hatası:', err.message);
    if (err instanceof GroqError && err.status === 429) return error('Groq API kota limiti aşıldı. Lütfen bir süre bekle.', 503, {}, request);
    return error('Analiz yapılırken bir hata oluştu. Lütfen tekrar deneyin.', 502, {}, request);
  }

  let result;
  try {
    const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch {
    return error('Analiz sonucu işlenemedi. Lütfen tekrar deneyin.', 502, {}, request);
  }

  return json({ success: true, result, usage: { today: count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count) } }, 200, request);
}

/** POST /tone-analyze */
async function handleToneAnalyze(request, env) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return error('Content-Type application/json olmalı.', 415, {}, request);

  let body;
  try { body = await request.json(); } catch { return error('Geçersiz JSON formatı.', 400, {}, request); }

  const { posts } = body;
  if (!Array.isArray(posts) || posts.length === 0) return error('"posts" alanı en az 1 metin içermelidir.', 400, {}, request);
  if (posts.length > 5) return error('En fazla 5 post gönderilebilir.', 400, {}, request);
  if (!posts.every(p => typeof p === 'string' && p.trim().length > 0))
    return error('Her post metin (string) olmalıdır.', 400, {}, request);
  const combined = posts.map((p, i) => `Post ${i + 1}:\n${p}`).join('\n\n');
  if (combined.length > 8_000) return error('Toplam metin çok uzun.', 400, {}, request);

  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  if (await checkIpLimit(env.RATE_LIMIT_KV, clientIp)) return error('Çok fazla istek gönderdiniz. Lütfen yarın tekrar deneyin.', 429, {}, request);
  const { count, exceeded } = await incrementAndCheck(env.RATE_LIMIT_KV);
  if (exceeded) return error('Günlük kapasite doldu, yarın tekrar dene.', 429, { dailyLimit: DAILY_LIMIT, resetAt: 'UTC 00:00' }, request);
  if (!env.GROQ_API_KEY) return error('Sunucu yapılandırma hatası.', 500, {}, request);

  const system = `You are a writing style analyst. Analyze the provided LinkedIn posts and return ONLY a valid JSON object (no markdown, no code blocks).
Required format: {"style":"casual-professional","emojiUsage":"none|low|moderate|high","sentenceLength":"short|medium|long","personality":"motivational|analytical|storyteller|educator|thought-leader","keywords":["word1","word2","word3"]}
The "keywords" array should contain 3-5 characteristic words or phrases from the posts.`;

  let raw;
  try {
    raw = await callGroq(env.GROQ_API_KEY, system, combined, 0.2);
  } catch (err) {
    console.error('Tone analyze Groq hatası:', err.message);
    if (err instanceof GroqError && err.status === 429) return error('Groq API kota limiti aşıldı. Lütfen bir süre bekle.', 503, {}, request);
    return error('Ton analizi yapılırken bir hata oluştu. Lütfen tekrar deneyin.', 502, {}, request);
  }

  let result;
  try {
    const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch {
    return error('Ton profili işlenemedi. Lütfen tekrar deneyin.', 502, {}, request);
  }

  return json({ success: true, result, usage: { today: count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count) } }, 200, request);
}

/** POST /hashtag-score */
async function handleHashtagScore(request, env) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return error('Content-Type application/json olmalı.', 415, {}, request);

  let body;
  try { body = await request.json(); } catch { return error('Geçersiz JSON formatı.', 400, {}, request); }

  const { hashtags } = body;
  if (!Array.isArray(hashtags) || hashtags.length === 0) return error('"hashtags" alanı boş olamaz.', 400, {}, request);
  if (hashtags.length > 20) return error('En fazla 20 hashtag gönderilebilir.', 400, {}, request);
  const validHashtags = hashtags.filter(h => typeof h === 'string' && h.startsWith('#') && h.length > 1 && h.length <= 30 && /^#[a-zA-Z0-9_]{1,29}$/.test(h));
  if (validHashtags.length === 0) return error('Geçerli hashtag bulunamadı. # ile başlamalı.', 400, {}, request);

  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  if (await checkIpLimit(env.RATE_LIMIT_KV, clientIp)) return error('Çok fazla istek gönderdiniz. Lütfen yarın tekrar deneyin.', 429, {}, request);
  const { count, exceeded } = await incrementAndCheck(env.RATE_LIMIT_KV);
  if (exceeded) return error('Günlük kapasite doldu, yarın tekrar dene.', 429, { dailyLimit: DAILY_LIMIT, resetAt: 'UTC 00:00' }, request);
  if (!env.GROQ_API_KEY) return error('Sunucu yapılandırma hatası.', 500, {}, request);

  const system = `You are a LinkedIn hashtag strategist. Score each hashtag based on LinkedIn popularity and niche relevance.
Return ONLY a valid JSON array (no markdown, no code blocks).
Each item: {"tag":"#example","score":75,"popularity":"very-popular|popular|moderate|niche|very-niche","suggestion":"#bettertag"}
The "suggestion" should be an alternative hashtag if score < 50, otherwise null.
Hashtags to analyze:`;

  let raw;
  try {
    raw = await callGroq(env.GROQ_API_KEY, system, validHashtags.join(' '), 0.2);
  } catch (err) {
    console.error('Hashtag score Groq hatası:', err.message);
    if (err instanceof GroqError && err.status === 429) return error('Groq API kota limiti aşıldı. Lütfen bir süre bekle.', 503, {}, request);
    return error('Hashtag değerlendirmesi yapılırken bir hata oluştu. Lütfen tekrar deneyin.', 502, {}, request);
  }

  let result;
  try {
    const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    result = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch {
    return error('Hashtag sonuçları işlenemedi. Lütfen tekrar deneyin.', 502, {}, request);
  }

  return json({ success: true, result, usage: { today: count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count) } }, 200, request);
}

/* ─────────────────────────────────────────────
   ANA HANDLER
───────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    const path = url.pathname.replace(/\/+$/, '');

    try {
      if (path === '/format' && method === 'POST') {
        return await handleFormat(request, env);
      }

      if (path === '/ab-test' && method === 'POST') {
        return await handleAbTest(request, env);
      }

      if (path === '/analyze' && method === 'POST') {
        return await handleAnalyze(request, env);
      }

      if (path === '/tone-analyze' && method === 'POST') {
        return await handleToneAnalyze(request, env);
      }

      if (path === '/hashtag-score' && method === 'POST') {
        return await handleHashtagScore(request, env);
      }

      if (path === '/validate-license' && method === 'POST') {
        return await handleValidateLicense(request, env);
      }

      if (path === '/health' && method === 'GET') {
        return await handleHealth(request, env);
      }

      return error(`Endpoint bulunamadı: ${method} ${path}`, 404, {}, request);

    } catch (err) {
      console.error('Worker genel hata:', err);
      return error('Sunucu hatası. Lütfen tekrar deneyin.', 500, {}, request);
    }
  }
};
