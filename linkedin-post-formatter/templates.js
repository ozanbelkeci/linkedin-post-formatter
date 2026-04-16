/* =============================================
   Postevo — Şablonlar
   ============================================= */

/**
 * Metni satırlara böler (boş satırlar temizlenir).
 */
function parseLines(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

/**
 * Satır başındaki madde işaretlerini temizler.
 * Modelin eklediği •, -, *, →, ▸, rakam+nokta vb. karakterleri siler.
 */
function stripBullet(line) {
  return line
    .replace(/\*\*/g, '')                        // ** karakterlerini tamamen sil
    .replace(/^\d+\.\d+\.?\s*/, '')              // "1.1." veya "1.2" alt numaralar
    .replace(/^(\d+[.)]\s*|[•·\-\*→▸▶️✓✗–—]\s*)/, '')
    .trim();
}

/**
 * Metni noktalama işaretine göre cümlelere böler.
 */
function parseSentences(text) {
  const raw = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  return raw.length > 1 ? raw : parseLines(text);
}

/**
 * Bölüm başındaki model etiketlerini temizler.
 * **HOOK**, GELİŞME:, 1. BÖLÜM: gibi kalıpları kaldırır.
 */
function cleanSection(text) {
  // Known mixed-case section label words to strip (Turkish + English)
  const knownLabels = [
    'Giriş', 'Kapanış', 'Açılış', 'Gelişme', 'Sonuç', 'Özet', 'Ders', 'Hook',
    'Opening', 'Closing', 'Context', 'Intro', 'Introduction', 'Conclusion',
    'Background', 'Summary', 'Lesson',
  ].join('|');
  const knownLabelRe = new RegExp(`^(${knownLabels})[:\\s]*\\n*`, 'u');

  return text
    .trim()                                                   // önce trim — split sonrası baştaki \n'i temizle
    .replace(/\*\*/g, '')                                     // ** kaldır
    .replace(/^[A-ZÇĞİÖŞÜ\d][A-ZÇĞİÖŞÜ\d :\t]*\n+/u, '')   // BÜYÜK HARF ETİKET satırı kaldır (HOOK\n, BÖLÜM 2\n vb.)
    .replace(/^[A-ZÇĞİÖŞÜ\s\d.]+[:\-]\s*/u, '')              // BÜYÜK HARF ETİKET: kaldır (aynı satırda devam ediyorsa)
    .replace(knownLabelRe, '')                                // Giriş\n, Kapanış: vb. mixed-case etiketler
    .replace(/^\d+\.\s+/, '')                                 // "1. " başındaki numaraları kaldır
    .trim();
}

/**
 * AI çıktısındaki ||| ile ayrılmış bölümleri parse eder.
 * Her zaman `expected` sayıda eleman döner; eksik bölümler '' olur.
 * Her bölüm model tarafından eklenen etiketlerden arındırılır.
 */
function parseSections(text, expected = 3) {
  if (!text || !text.trim()) return Array(expected).fill('');
  // Strip leading/trailing separators and normalize 2+ pipes to |||
  const normalized = text.replace(/\|{2,}/g, '|||').replace(/^\|+\s*/, '').replace(/\s*\|+$/, '');
  const sections = normalized.split('|||').map(s => cleanSection(s));
  // ||| yoksa: tüm metin birinci bölüm, geri kalanlar boş
  if (sections.length === 1 && expected > 1) {
    const result = [sections[0]];
    for (let i = 1; i < expected; i++) result.push('');
    return result;
  }
  while (sections.length < expected) sections.push('');
  return sections;
}

/**
 * Cümle nokta ile bitmiyorsa nokta ekler.
 */
function endWithDot(s) {
  return /[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + '.';
}

/**
 * AI'dan gelen CTA metnine uygun emoji ekler.
 * CTA boşsa boş string döner (format fonksiyonları fallback uygular).
 */
function formatCTA(aiCta, ton) {
  if (!aiCta || !aiCta.trim()) return '';
  const emoji = ton === 'samimi' ? ' 😊' : ' 👇';
  return aiCta.trim() + emoji;
}

/**
 * Metindeki dili tespit eder.
 * Türkçe, Almanca, Fransızca, İspanyolca veya İngilizce döner.
 */
function detectLanguage(text) {
  const len = text.replace(/\s/g, '').length || 1;

  const trChars = (text.match(/[ğşıçöüĞŞİÇÖÜ]/g) || []).length;
  const trWords = (text.match(/\b(ve|bir|bu|için|ile|ben|sen|biz|ama|da|de|ki|değil|olan|gibi|daha|çok)\b/gi) || []).length;
  if (trChars / len > 0.015 || trWords >= 3) return 'tr';

  const deChars = (text.match(/[äöüßÄÖÜ]/g) || []).length;
  const deWords = (text.match(/\b(und|der|die|das|ist|ich|sie|wir|mit|von|für|auf|nicht|auch|ein|eine|zu|haben|werden|ist|sind)\b/gi) || []).length;
  if (deChars / len > 0.008 || deWords >= 4) return 'de';

  const frChars = (text.match(/[éèêëàâîïôûùœæÉÈÊËÀÂÎÏÔÛÙŒÆ]/g) || []).length;
  const frWords = (text.match(/\b(et|le|la|les|un|une|des|du|au|avec|dans|est|il|elle|nous|vous|ils|que|qui|ce|se|pas)\b/gi) || []).length;
  if (frChars / len > 0.008 || frWords >= 4) return 'fr';

  const esChars = (text.match(/[ñÑ¿¡]/g) || []).length;
  const esWords = (text.match(/\b(y|el|la|los|las|un|una|en|de|que|por|con|para|su|es|son|del|lo|se|al)\b/gi) || []).length;
  if (esChars >= 1 || esWords >= 5) return 'es';

  return 'en';
}

/**
 * Şablona ve dile özgü kapanış soruları.
 */
const CTA_TEXTS = {
  hikaye:        { en: 'Have you had a similar turning point?',           tr: 'Benzer bir dönüm noktanız oldu mu?',              fr: 'Avez-vous vécu un tournant similaire ?',                   de: 'Haben Sie einen ähnlichen Wendepunkt erlebt?',              es: '¿Has vivido un punto de inflexión similar?' },
  liste:         { en: 'Anything you would add to this list?',            tr: 'Bu listeye ekleyeceğiniz bir şey var mı?',         fr: 'Qu\'ajouteriez-vous à cette liste ?',                      de: 'Was würden Sie dieser Liste hinzufügen?',                   es: '¿Añadirías algo a esta lista?' },
  fikir:         { en: 'Do you agree? Different perspectives welcome.',   tr: 'Katılıyor musunuz? Farklı görüşler bekliyorum.',   fr: 'Êtes-vous d\'accord ? Les avis contraires sont bienvenus.', de: 'Stimmen Sie zu? Andere Perspektiven sind willkommen.',      es: '¿Estás de acuerdo? Diferentes perspectivas son bienvenidas.' },
  vaka:          { en: 'Have you seen a similar transformation?',         tr: 'Siz de benzer bir dönüşüm yaşadınız mı?',          fr: 'Avez-vous vécu une transformation similaire ?',            de: 'Haben Sie eine ähnliche Transformation erlebt?',            es: '¿Has visto una transformación similar?' },
  ipucu:         { en: 'Have you tried this? Share your results.',        tr: 'Bunu denediniz mi? Sonuçlarınızı paylaşın.',       fr: 'L\'avez-vous essayé ? Partagez vos résultats.',            de: 'Haben Sie das ausprobiert? Teilen Sie Ihre Ergebnisse.',   es: '¿Lo has probado? Comparte tus resultados.' },
  soru:          { en: 'What\'s your answer?',                            tr: 'Sizin cevabınız nedir?',                           fr: 'Quelle est votre réponse ?',                               de: 'Was ist Ihre Antwort?',                                     es: '¿Cuál es tu respuesta?' },
  istatistik:    { en: 'Did this data surprise you?',                     tr: 'Bu veri sizi şaşırttı mı?',                        fr: 'Ces données vous ont-elles surpris ?',                     de: 'Hat Sie diese Zahl überrascht?',                            es: '¿Te sorprendieron estos datos?' },
  basari:        { en: 'What has made the difference on your journey?',   tr: 'Yolculuğunuzda farkı yaratan ne oldu?',            fr: 'Qu\'est-ce qui a fait la différence dans votre parcours ?', de: 'Was hat auf Ihrem Weg den Unterschied gemacht?',           es: '¿Qué ha marcado la diferencia en tu trayectoria?' },
  hata:          { en: 'Have you made a similar mistake?',                tr: 'Siz de benzer bir hata yaptınız mı?',              fr: 'Avez-vous fait une erreur similaire ?',                    de: 'Haben Sie einen ähnlichen Fehler gemacht?',                 es: '¿Has cometido un error similar?' },
  karsilastirma: { en: 'Which approach do you prefer and why?',           tr: 'Hangi yaklaşımı tercih edersiniz ve neden?',       fr: 'Quelle approche préférez-vous et pourquoi ?',             de: 'Welchen Ansatz bevorzugen Sie und warum?',                  es: '¿Qué enfoque prefieres y por qué?' },
  manifesto:     { en: 'Which of these principles resonates most with you?', tr: 'Bu ilkelerden hangisi size en çok hitap ediyor?', fr: 'Lequel de ces principes vous parle le plus ?',          de: 'Welches dieser Prinzipien spricht Sie am meisten an?',      es: '¿Cuál de estos principios te resuena más?' },
  mektup:        { en: 'What would you tell your past self?',             tr: 'Geçmişteki kendinize ne söylerdiniz?',             fr: 'Que diriez-vous à votre ancien moi ?',                    de: 'Was würden Sie Ihrem früheren Ich sagen?',                  es: '¿Qué le dirías a tu yo del pasado?' },
  karar:         { en: 'Have you ever faced a similarly tough decision?', tr: 'Siz de benzer zor bir kararla karşılaştınız mı?', fr: 'Avez-vous déjà pris une décision aussi difficile ?',      de: 'Haben Sie jemals eine ähnlich schwere Entscheidung getroffen?', es: '¿Has tomado alguna vez una decisión igual de difícil?' },
  tavsiye:       { en: 'What advice would you add?',                      tr: 'Siz hangi tavsiyeyi eklerdiniz?',                  fr: 'Quel conseil ajouteriez-vous ?',                          de: 'Welchen Ratschlag würden Sie hinzufügen?',                  es: '¿Qué consejo añadirías?' },
};

/**
 * Şablon ID ve UI diline göre kapanış sorusu döner.
 */
function templateCTA(id, lang) {
  const texts = CTA_TEXTS[id] || CTA_TEXTS.hikaye;
  return (texts[lang] || texts.en) + ' 👇';
}

/**
 * Şablon içindeki yapısal etiketleri dile göre döndürür.
 */
const LABELS = {
  why_it_works:       { en: 'Why it works:',           tr: 'Neden işe yarar:',         de: 'Warum es funktioniert:',      fr: 'Pourquoi ça marche :',       es: '¿Por qué funciona?' },
  how_to_apply:       { en: 'How to apply it:',         tr: 'Nasıl uygulanır:',          de: 'So setzen Sie es um:',        fr: 'Comment l\'appliquer :',     es: 'Cómo aplicarlo:' },
  what_made_possible: { en: 'What made it possible:',   tr: 'Bunu mümkün kılan:',        de: 'Was es möglich gemacht hat:', fr: 'Ce qui l\'a rendu possible :', es: 'Lo que lo hizo posible:' },
  lesson:             { en: '💡 Lesson:',               tr: '💡 Ders:',                  de: '💡 Lektion:',                 fr: '💡 Leçon :',                 es: '💡 Lección:' },
  before:             { en: '❌ Before:',                tr: '❌ Önce:',                  de: '❌ Vorher:',                  fr: '❌ Avant :',                 es: '❌ Antes:' },
  after:              { en: '✅ After:',                 tr: '✅ Sonra:',                 de: '✅ Nachher:',                 fr: '✅ Après :',                 es: '✅ Después:' },
};
function lbl(text, key) {
  const lang = detectLanguage(text);
  return (LABELS[key] || {})[lang] || LABELS[key].en;
}

/* =============================================
   ÜCRETSİZ ŞABLONLAR
   ============================================= */

/**
 * STORY — Kişisel dönüşüm hikayesi.
 * Gemini bölümleri: HOOK ||| GELİŞME ||| DERS
 */
const TEMPLATE_HIKAYE = {
  id: 'hikaye',
  name: '📖 Story',
  premium: false,
  description: 'Kişisel deneyim anlatısı',
  placeholder: 'Write about your experience. What happened, how you felt, what you learned.',
  format(text, ton, lang = 'en') {
    const [hook, gelisme, ders, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (hook)    out += endWithDot(hook) + '\n\n';
    if (gelisme) out += gelisme.split('\n').filter(Boolean).map(l => endWithDot(stripBullet(l))).join(' ') + '\n\n';
    if (ders)    out += `💡 ${endWithDot(ders)}\n\n`;
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * LIST — Adım adım madde listesi.
 * Gemini bölümleri: BAŞLIK ||| MADDELER (satır satır) ||| SONUÇ
 */
const TEMPLATE_LISTE = {
  id: 'liste',
  name: '📋 Liste',
  premium: false,
  description: 'Madde madde ipucu / özet listesi',
  placeholder: 'First line will be the title. Other lines will become numbered list items.',
  format(text, ton, lang = 'en') {
    const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

    // Yeni ||| formatı mı, eski \n---\n formatı mı?
    if (text.includes('|||')) {
      const [baslik, maddeler, sonuc, aiCta] = parseSections(text, 4);
      const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);
      let out = '';
      if (baslik) out += endWithDot(baslik) + '\n\n';

      const items = maddeler
        ? maddeler.split('\n').map(l => stripBullet(l)).filter(Boolean)
        : [];
      items.slice(0, 10).forEach((item, i) => {
        out += `${nums[i] || '▶️'} ${endWithDot(item)}\n\n`;
      });

      if (sonuc) out += endWithDot(sonuc) + '\n\n';
      out += '―\n\n' + cta;
      return out.trim();
    }

    // Eski format (geriye dönük uyumluluk)
    const parts     = text.split(/\n---\n?/);
    const mainBlock = parts[0];
    const conclusion = parts[1] ? parts[1].trim() : null;
    const lines = parseLines(mainBlock);
    if (!lines.length) return '';

    const title = endWithDot(cleanSection(lines[0]));
    const items  = lines.slice(1);
    let out = title + '\n\n';
    items.slice(0, 10).forEach((item, i) => {
      out += `${nums[i] || '▶️'} ${endWithDot(stripBullet(item))}\n\n`;
    });
    if (conclusion) out += endWithDot(conclusion) + '\n\n';
    out += '―\n\n' + templateCTA(this.id, lang);
    return out.trim();
  }
};

/**
 * OPINION — Güçlü fikir / görüş paylaşımı.
 * Gemini bölümleri: İDDİA ||| GEREKÇE ||| MEYDAN OKUMA
 */
const TEMPLATE_FIKIR = {
  id: 'fikir',
  name: '💡 Opinion',
  premium: false,
  description: 'Kısa ve güçlü görüş paylaşımı',
  placeholder: 'Write your opinion. Focus on a single strong point.',
  format(text, ton, lang = 'en') {
    const [iddia, gerekce, meydan, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (iddia)   out += endWithDot(iddia) + '\n\n';
    if (gerekce) out += gerekce.split('\n').filter(Boolean).map(l => endWithDot(stripBullet(l))).join('\n\n') + '\n\n';
    if (meydan)  out += `→ ${endWithDot(meydan)}\n\n`;
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/* =============================================
   PREMİUM ŞABLONLAR
   ============================================= */

/**
 * CASE STUDY — Before/after vaka çalışması.
 * Gemini bölümleri: GENEL BAKIŞ ||| ÖNCE ||| SONRA ||| ÇIKARIM
 */
const TEMPLATE_VAKA = {
  id: 'vaka',
  name: '🔬 Case Study',
  premium: true,
  description: 'Vaka çalışması / before-after analizi',
  placeholder: 'Write the context, the before/after situation, and your key takeaway.',
  format(text, ton, lang = 'en') {
    const [genel, once, sonra, cikarim, aiCta] = parseSections(text, 5);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (genel)   out += endWithDot(genel) + '\n\n';
    if (once)    out += `${lbl(text, 'before')} ${endWithDot(once)}\n\n`;
    if (sonra)   out += `${lbl(text, 'after')} ${endWithDot(sonra)}\n\n`;
    if (cikarim) out += `💡 ${endWithDot(cikarim)}\n\n`;
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * QUICK TIP — Pratik ipucu.
 * Gemini bölümleri: BAŞLIK ||| NEDEN ||| NASIL
 */
const TEMPLATE_IPUCU = {
  id: 'ipucu',
  name: '🎯 Quick Tip',
  premium: true,
  description: 'Tek bir güçlü ipucu odaklı post',
  placeholder: 'Write your tip. Include why it works and how to apply it.',
  format(text, ton, lang = 'en') {
    const [baslik, neden, nasil, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (baslik) out += `🎯 ${endWithDot(baslik)}\n\n`;
    if (neden)  out += `${lbl(text, 'why_it_works')} ${endWithDot(neden)}\n\n`;
    if (nasil) {
      const steps = nasil.split('\n').map(l => stripBullet(l)).filter(Boolean);
      if (steps.length > 1) {
        out += lbl(text, 'how_to_apply') + '\n\n';
        steps.forEach(s => { out += `→ ${endWithDot(s)}\n`; });
        out += '\n';
      } else {
        out += endWithDot(nasil) + '\n\n';
      }
    }
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * QUESTION — Merak uyandıran soru.
 * Gemini bölümleri: BAĞLAM ||| SORU ||| İLGİNÇ YAN
 */
const TEMPLATE_SORU = {
  id: 'soru',
  name: '❓ Question',
  premium: true,
  description: 'Etkileşim yaratan soru formatı',
  placeholder: 'Write the question you want to ask and its background context.',
  format(text, ton, lang = 'en') {
    const [baglam, soru, ilginc, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (baglam) out += endWithDot(baglam) + '\n\n';
    if (soru)   out += `❓ ${soru.endsWith('?') ? soru : soru + '?'}\n\n`;
    if (ilginc) out += endWithDot(ilginc) + '\n\n';
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * DATA — Veri/istatistik odaklı.
 * Gemini bölümleri: VERİ ||| NE ANLAM TAŞIR ||| ÇIKARIMLAR
 */
const TEMPLATE_ISTATISTIK = {
  id: 'istatistik',
  name: '📊 Data',
  premium: true,
  description: 'Veri ve istatistik odaklı post',
  placeholder: 'Write your striking statistic or data point and your interpretation.',
  format(text, ton, lang = 'en') {
    const [veri, anlam, cikarim, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (veri)    out += `📊 "${endWithDot(veri)}"\n\n`;
    if (anlam)   out += anlam.split('\n').filter(Boolean).map(l => endWithDot(stripBullet(l))).join('\n\n') + '\n\n';
    if (cikarim) out += `→ ${endWithDot(cikarim)}\n\n`;
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * WIN — Alçakgönüllü başarı paylaşımı.
 * Gemini bölümleri: BAŞARI ||| FAKTÖR1\nFAKTÖR2 ||| YANSIMA
 */
const TEMPLATE_BASARI = {
  id: 'basari',
  name: '🏆 Win',
  premium: true,
  description: 'Alçakgönüllü başarı paylaşımı',
  placeholder: 'Write your achievement, the factors that made it possible, and your reflection.',
  format(text, ton, lang = 'en') {
    const [basari, faktorler, yansima, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);
    const icons = ['💪','🧠','🤝','🔑','⚡'];

    let out = '';
    if (basari) out += endWithDot(basari) + '\n\n';
    if (faktorler) {
      const items = faktorler.split('\n').map(l => stripBullet(l)).filter(Boolean);
      out += lbl(text, 'what_made_possible') + '\n\n';
      items.slice(0, 5).forEach((item, i) => {
        out += `${icons[i] || '▶️'} ${endWithDot(item)}\n\n`;
      });
    }
    if (yansima) out += endWithDot(yansima) + '\n\n';
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * LESSON — Hatadan öğrenme.
 * Gemini bölümleri: HATA ||| NE YANLIŞ GİTTİ ||| DERS
 */
const TEMPLATE_HATA = {
  id: 'hata',
  name: '❌ Lesson',
  premium: true,
  description: 'Yapılan hatayı ve öğrenilen dersi anlat',
  placeholder: 'Write your mistake, what went wrong, and what you learned from it.',
  format(text, ton, lang = 'en') {
    const [hata, ne_yanlis, ders, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (hata)      out += endWithDot(hata) + '\n\n';
    if (ne_yanlis) out += ne_yanlis.split('\n').filter(Boolean).map(l => endWithDot(stripBullet(l))).join('\n\n') + '\n\n';
    if (ders)      out += `${lbl(text, 'lesson')} ${endWithDot(ders)}\n\n`;
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * VERSUS — Eski vs Yeni karşılaştırması.
 * Gemini bölümleri: KONU ||| ESKİ ||| YENİ ||| TEMEL FARK
 */
const TEMPLATE_KARSILASTIRMA = {
  id: 'karsilastirma',
  name: '⚖️ Versus',
  premium: true,
  description: 'İki yaklaşımı karşılaştırma',
  placeholder: 'Write the topic, the old/bad way, the new/better way, and the key difference.',
  format(text, ton, lang = 'en') {
    const [konu, eski, yeni, fark, aiCta] = parseSections(text, 5);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (konu) out += endWithDot(konu) + '\n\n';
    if (eski) out += `❌ ${endWithDot(eski)}\n`;
    if (yeni) out += `✅ ${endWithDot(yeni)}\n\n`;
    if (fark) out += `→ ${endWithDot(fark)}\n\n`;
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * MANIFESTO — Kişisel ilkeler bildirisi.
 * Gemini bölümleri: GİRİŞ ||| İLKELER (satır satır) ||| KAPANIŞ
 */
const TEMPLATE_MANIFESTO = {
  id: 'manifesto',
  name: '📣 Manifesto',
  premium: true,
  description: 'Güçlü inanç ve değer bildirisi',
  placeholder: 'Write your core beliefs and values.',
  format(text, ton, lang = 'en') {
    const [giris, ilkeler, kapanis, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (giris) out += endWithDot(giris) + '\n\n';
    if (ilkeler) {
      const items = ilkeler.split('\n').map(l => stripBullet(l)).filter(Boolean);
      items.forEach(item => { out += `▸ ${endWithDot(item)}\n\n`; });
    }
    if (kapanis) out += endWithDot(kapanis) + '\n\n';
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * LETTER — Geçmiş/gelecek benliğe mektup.
 * Gemini bölümleri: PARAGRAF1 ||| PARAGRAF2 ||| PARAGRAF3
 */
const TEMPLATE_MEKTUP = {
  id: 'mektup',
  name: '✉️ Letter',
  premium: true,
  description: 'Geçmişteki kendinize mektup formatı',
  placeholder: 'Write what you want to say to your past or future self.',
  format(text, ton, lang = 'en') {
    const [para1, para2, para3, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (para1) out += endWithDot(para1) + '\n\n';
    if (para2) out += endWithDot(para2) + '\n\n';
    if (para3) out += endWithDot(para3) + '\n\n';
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * DECISION — Zor karar süreci.
 * Gemini bölümleri: KARAR ||| GEREKÇE1\nGEREKÇE2 ||| SONUÇ YANSIMA
 */
const TEMPLATE_KARAR = {
  id: 'karar',
  name: '🧭 Decision',
  premium: true,
  description: 'Zor bir kararı ve sürecini anlat',
  placeholder: 'Write the decision, your reasons, and the outcome.',
  format(text, ton, lang = 'en') {
    const [karar, gerekceler, yansima, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (karar) out += endWithDot(karar) + '\n\n';
    if (gerekceler) {
      const items = gerekceler.split('\n').map(l => stripBullet(l)).filter(Boolean);
      items.forEach(item => { out += `• ${endWithDot(item)}\n`; });
      out += '\n';
    }
    if (yansima) out += endWithDot(yansima) + '\n\n';
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/**
 * ADVICE — Pratik tavsiye listesi.
 * Gemini bölümleri: GİRİŞ ||| TAV1\nTAV2 ||| KAPANIŞ
 */
const TEMPLATE_TAVSIYE = {
  id: 'tavsiye',
  name: '🤝 Advice',
  premium: true,
  description: 'Sektöre yeni girenlere tavsiye',
  placeholder: 'Write your advice and who it is meant for.',
  format(text, ton, lang = 'en') {
    const [giris, tavsiyeler, kapanis, aiCta] = parseSections(text, 4);
    const cta = formatCTA(aiCta, ton) || templateCTA(this.id, lang);

    let out = '';
    if (giris) out += endWithDot(giris) + '\n\n';
    if (tavsiyeler) {
      const items = tavsiyeler.split('\n').map(l => stripBullet(l)).filter(Boolean);
      items.forEach((item, i) => { out += `${i + 1}. ${endWithDot(item)}\n\n`; });
    }
    if (kapanis) out += endWithDot(kapanis) + '\n\n';
    out += '―\n\n' + cta;
    return out.trim();
  }
};

/* =============================================
   TÜM ŞABLONLAR
   ============================================= */
const ALL_TEMPLATES = {
  hikaye:        TEMPLATE_HIKAYE,
  liste:         TEMPLATE_LISTE,
  fikir:         TEMPLATE_FIKIR,
  vaka:          TEMPLATE_VAKA,
  ipucu:         TEMPLATE_IPUCU,
  soru:          TEMPLATE_SORU,
  istatistik:    TEMPLATE_ISTATISTIK,
  basari:        TEMPLATE_BASARI,
  hata:          TEMPLATE_HATA,
  karsilastirma: TEMPLATE_KARSILASTIRMA,
  manifesto:     TEMPLATE_MANIFESTO,
  mektup:        TEMPLATE_MEKTUP,
  karar:         TEMPLATE_KARAR,
  tavsiye:       TEMPLATE_TAVSIYE,
};

/* =============================================
   HASHTAG ÖNERİLERİ (Premium)
   ============================================= */
const HASHTAG_DB = {
  kariyer:   ['#kariyer', '#kariyergelişimi', '#işhayatı', '#profesyonelgelişim', '#işarama', '#networkingipuçları', '#kişiselgelişim', '#başarı', '#çalışmahayatı', '#linkedin'],
  teknoloji: ['#teknoloji', '#yazılım', '#yazılımgeliştirme', '#yapayZeka', '#ai', '#dijitaldönüşüm', '#inovasyon', '#teknolojitrendleri', '#sibergüvenlik', '#bulut'],
  girişim:   ['#girişim', '#girişimcilik', '#startup', '#entrepreneur', '#inovasyon', '#kurucu', '#büyüme', '#yatırım', '#melek yatırım', '#scaleup'],
  pazarlama: ['#pazarlama', '#dijitalpazarlama', '#içerikpazarlama', '#sosyalmedya', '#marka', '#büyümepazarlama', '#seo', '#reklamcılık', '#pazarlamastratejisi', '#b2b'],
  finans:    ['#finans', '#finansalözgürlük', '#yatırım', '#ekonomi', '#borsa', '#bütçeyönetimi', '#kripto', '#kişiselfinans', '#servetyönetimi', '#emeklilik'],
  eğitim:    ['#eğitim', '#öğrenme', '#sürekliöğrenme', '#kişiselgelişim', '#kitapönerisi', '#online eğitim', '#beceri', '#sertifika', '#mentorluk', '#kariyer'],
  sağlık:    ['#sağlık', '#wellness', '#spor', '#zihinselSağlık', '#verimlilik', '#iş-yaşamdengesi', '#meditasyon', '#uyku', '#stresyönetimi', '#sağlıklıyaşam'],
  liderlik:  ['#liderlik', '#yönetim', '#takımyönetimi', '#ekip', '#organizasyonkültürü', '#strateji', '#yönetimbiçimi', '#çalışanmutluluğu', '#performans', '#verimliliği'],
  uzakçalışma: ['#uzakçalışma', '#remotework', '#hibridçalışma', '#dijitalgöçebe', '#evdençalışma', '#esnekçalışma', '#verimlilik', '#işhayatı', '#çalışmakültürü', '#homeoffice'],
  genel:     ['#linkedin', '#kişiselgelişim', '#başarı', '#motivasyon', '#ilham', '#paylaşım', '#deneyim', '#türkiye', '#profesyonel'],
};

const HASHTAG_DB_EN = {
  career:     ['#career', '#careerdevelopment', '#jobsearch', '#hiring', '#networking', '#professionaldevelopment', '#leadership', '#success', '#careeradvice', '#linkedin'],
  technology: ['#technology', '#software', '#ai', '#artificialintelligence', '#innovation', '#tech', '#programming', '#digitaltransformation', '#cybersecurity', '#cloud'],
  startup:    ['#startup', '#entrepreneurship', '#founder', '#innovation', '#business', '#smallbusiness', '#growth', '#fundraising', '#entrepreneur', '#scaleup'],
  marketing:  ['#marketing', '#digitalmarketing', '#contentmarketing', '#socialmedia', '#branding', '#growthhacking', '#seo', '#b2b', '#marketingstrategy', '#advertising'],
  finance:    ['#finance', '#investing', '#personalfinance', '#money', '#economy', '#fintech', '#wealth', '#stocks', '#budgeting', '#financialfreedom'],
  education:  ['#education', '#learning', '#onlinelearning', '#personaldevelopment', '#books', '#skills', '#certification', '#mentorship', '#selfimprovement', '#growth'],
  health:     ['#health', '#wellness', '#fitness', '#mentalhealth', '#productivity', '#worklifebalance', '#mindfulness', '#exercise', '#wellbeing', '#selfcare'],
  leadership: ['#leadership', '#management', '#teambuilding', '#culture', '#strategy', '#teamwork', '#execution', '#ceo', '#organizationalculture', '#performance'],
  remote:     ['#remotework', '#remotejobs', '#workfromhome', '#digitalnomad', '#hybrid', '#flexibility', '#futureofwork', '#wfh', '#homeoffice', '#productivity'],
  general:    ['#linkedin', '#personaldevelopment', '#success', '#motivation', '#inspiration', '#mindset', '#growth', '#professional', '#career', '#goals'],
};

function suggestHashtags(text) {
  const lang = detectLanguage(text);
  const t = text.toLowerCase();
  let cats = [];

  if (lang === 'tr') {
    if (t.match(/yazılım|kod|developer|javascript|python|ai|yapay zeka|teknoloji/)) cats.push('teknoloji');
    if (t.match(/girişim|startup|şirket|kurucu|founder/))                           cats.push('girişim');
    if (t.match(/pazarlama|marka|kampanya|reklam|içerik|sosyal medya/))             cats.push('pazarlama');
    if (t.match(/para|yatırım|finans|borsa|ekonomi|bütçe/))                         cats.push('finans');
    if (t.match(/öğren|eğitim|kurs|sertifika|kitap|beceri/))                        cats.push('eğitim');
    if (t.match(/spor|sağlık|fitness|koşu|meditasyon|wellness/))                    cats.push('sağlık');
    if (t.match(/lider|yönet|takım|ekip|strateji|organizasyon/))                    cats.push('liderlik');
    if (t.match(/kariyer|iş|çalış|mesleki|profesyonel|pozisyon|işe alım/))          cats.push('kariyer');
    if (t.match(/remote|uzak|evden|hibrit|home office/))                             cats.push('uzakçalışma');
    if (!cats.length) cats = ['genel'];
    const db        = HASHTAG_DB;
    const primary   = db[cats[0]] || db.genel;
    const secondary = cats[1] ? db[cats[1]].slice(0, 2) : [];
    const fallback  = db.genel.filter(h => !primary.includes(h) && !secondary.includes(h)).slice(0, 2);
    return [...primary.slice(0, 6), ...secondary, ...fallback].slice(0, 10);
  } else {
    if (t.match(/software|code|developer|javascript|python|ai|artificial intelligence|tech/)) cats.push('technology');
    if (t.match(/startup|company|founder|entrepreneur|venture|scaleup/))                      cats.push('startup');
    if (t.match(/marketing|brand|campaign|advertising|content|social media|seo/))             cats.push('marketing');
    if (t.match(/money|invest|finance|stock|economy|budget|fintech|wealth/))                  cats.push('finance');
    if (t.match(/learn|education|course|certification|book|skill|mentor/))                    cats.push('education');
    if (t.match(/fitness|health|wellness|workout|meditation|exercise|mindfulness/))           cats.push('health');
    if (t.match(/leader|manage|team|strategy|organization|culture|execute/))                  cats.push('leadership');
    if (t.match(/career|job|work|professional|position|hiring|recrui/))                       cats.push('career');
    if (t.match(/remote|work from home|hybrid|digital nomad|wfh|homeoffice/))                cats.push('remote');
    if (!cats.length) cats = ['general'];
    const db        = HASHTAG_DB_EN;
    const primary   = db[cats[0]] || db.general;
    const secondary = cats[1] ? db[cats[1]].slice(0, 2) : [];
    const fallback  = db.general.filter(h => !primary.includes(h) && !secondary.includes(h)).slice(0, 2);
    return [...primary.slice(0, 6), ...secondary, ...fallback].slice(0, 10);
  }
}

/* =============================================
   OKUNABİLİRLİK SKORU (Premium)
   ============================================= */
function calcReadabilityScore(text) {
  if (!text || text.trim().length < 50) return null;

  let score = 6;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgLen    = sentences.reduce((a, s) => a + s.split(' ').length, 0) / (sentences.length || 1);
  if (avgLen < 15)   score += 1.5;
  else if (avgLen > 25) score -= 1;

  if ((text.match(/\n\n/g) || []).length >= 2) score += 1;

  const emojiCount = (text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []).length;
  if (emojiCount >= 1 && emojiCount <= 8) score += 0.5;
  else if (emojiCount > 12)               score -= 0.5;

  // Hook detection — language-agnostic
  const first = text.split('\n')[0] || '';
  if (first.includes('?')) score += 1;
  else if (first.match(/^(I |My |Did |Have |What |How |Why |One |Never |Stop |Start |Most |Hiç |Bir gün|Geçen|Bugün|Ben |Benim)/i)) score += 0.5;

  if (text.match(/^[•\-→▶️1-9]/m)) score += 0.5;

  // Engagement — language-agnostic: CTA separator + any question mark
  if (text.includes('―')) score += 0.5;
  if ((text.match(/\?/g) || []).length >= 1) score += 0.5;

  const len = text.length;
  if (len >= 500 && len <= 2000) score += 0.5;
  else if (len < 200)  score -= 1;
  else if (len > 2800) score -= 0.5;

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

/* =============================================
   EMOJİ SETİ
   ============================================= */
const EMOJI_SETS = {
  genel:      ['🚀','💡','✅','🎯','📈','🔥','💪','🧠','⭐','🌟','👇','📌'],
  iş:         ['💼','📊','🤝','🏆','📋','🗂️','⚙️','📣','💰','🔑'],
  motivasyon: ['💪','🌟','🎯','🔥','✨','🙌','👏','🚀','🏅','💯'],
  teknoloji:  ['💻','🤖','⚡','🔧','📱','🌐','🔐','📡','🛠️','🧩'],
  eğitim:     ['📚','🎓','✏️','📝','🔍','💡','🧪','📖','🏫','🎒'],
};
