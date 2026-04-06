/* =============================================
   LinkedIn Post Formatter — Şablonlar
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
  return text
    .trim()                                                   // önce trim — split sonrası baştaki \n'i temizle
    .replace(/\*\*/g, '')                                     // ** kaldır
    .replace(/^[A-ZÇĞİÖŞÜ\d][A-ZÇĞİÖŞÜ\d :\t]*\n+/u, '')   // BÜYÜK HARF ETİKET satırı kaldır (HOOK\n, BÖLÜM 2: GELİŞME\n vb.)
    .replace(/^[A-ZÇĞİÖŞÜ\s\d.]+[:\-]\s*/u, '')              // BÜYÜK HARF ETİKET: kaldır (aynı satırda devam ediyorsa)
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
  const sections = text.split('|||').map(s => cleanSection(s));
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

/* =============================================
   TEMPLATE CTA MAP
   Her şablonun kendine özgü kapanış sorusu vardır.
   ============================================= */
const TEMPLATE_CTAS = {
  hikaye:        (ton) => ton === 'samimi'
    ? 'Siz de böyle bir dönüm noktası yaşadınız mı? Anlatın. 😊'
    : 'Siz de böyle bir dönüm noktası yaşadınız mı? Yorumlarda paylaşın. 👇',

  liste:         (ton) => ton === 'samimi'
    ? 'Listeye eklemek istediğiniz bir şey var mı? 😊'
    : 'Listeye eklemek istediğiniz bir şey var mı? 💬',

  fikir:         (ton) => ton === 'samimi'
    ? 'Katılıyor musunuz? Farklı düşünenler varsa görmek isterim. 😊'
    : 'Katılıyor musunuz? Farklı düşünenler varsa görmek isterim. 👇',

  vaka:          (ton) => ton === 'samimi'
    ? 'Benzer bir dönüşüm hikayeniz var mı? 😊'
    : 'Benzer bir dönüşüm hikayeniz var mı? 👇',

  ipucu:         (ton) => ton === 'samimi'
    ? 'Uyguladınız mı? Sonucu yorumlarda paylaşın. 😊'
    : 'Uyguladınız mı? Sonucu yorumlarda paylaşın. 👇',

  soru:          ()    => 'Sizin cevabınız ne? 👇',

  istatistik:    (ton) => ton === 'samimi'
    ? 'Bu veri sizi şaşırttı mı? 😊'
    : 'Bu veri sizi şaşırttı mı? 👇',

  basari:        (ton) => ton === 'samimi'
    ? 'Siz de bu yolda ne yaşadınız? 😊'
    : 'Siz de bu yolda ne yaşadınız? 👇',

  hata:          (ton) => ton === 'samimi'
    ? 'Siz de benzer bir hata yaptınız mı? 😊'
    : 'Siz de benzer bir hata yaptınız mı? 👇',

  karsilastirma: (ton) => ton === 'samimi'
    ? 'Hangi yaklaşımı tercih edersiniz? 😊'
    : 'Hangi yaklaşımı tercih edersiniz? 👇',

  manifesto:     (ton) => ton === 'samimi'
    ? 'Bu ilkelerden hangisi size en çok dokundu? 😊'
    : 'Bu ilkelerden hangisi size en çok dokundu? 👇',

  mektup:        (ton) => ton === 'samimi'
    ? 'Geçmişteki kendinize ne söylerdiniz? 😊'
    : 'Geçmişteki kendinize ne söylerdiniz? 👇',

  karar:         (ton) => ton === 'samimi'
    ? 'Siz de böyle zor bir karar verdiniz mi? 😊'
    : 'Siz de böyle zor bir karar verdiniz mi? 👇',

  tavsiye:       (ton) => ton === 'samimi'
    ? 'Eklemek istediğiniz bir tavsiye var mı? 😊'
    : 'Eklemek istediğiniz bir tavsiye var mı? 👇',
};

function templateCTA(templateId, ton) {
  const fn = TEMPLATE_CTAS[templateId];
  return fn ? fn(ton) : 'Düşüncelerinizi yorumlarda paylaşın. 👇';
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
  placeholder: 'Deneyiminizi yazın. Ne oldu, nasıl hissettiniz, ne öğrendiniz?',
  format(text, ton) {
    const [hook, gelisme, ders] = parseSections(text, 3);
    const cta = templateCTA('hikaye', ton);

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
  placeholder: 'İlk satır başlık olacak. Diğer satırlar madde madde sıralanacak.',
  format(text, ton) {
    const cta  = templateCTA('liste', ton);
    const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

    // Yeni ||| formatı mı, eski \n---\n formatı mı?
    if (text.includes('|||')) {
      const [baslik, maddeler, sonuc] = parseSections(text, 3);
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
    out += '―\n\n' + cta;
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
  placeholder: 'Görüşünüzü yazın. Tek bir konuya odaklanın.',
  format(text, ton) {
    const [iddia, gerekce, meydan] = parseSections(text, 3);
    const cta = templateCTA('fikir', ton);

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
  placeholder: 'Genel durumu, önce ve sonrasını, çıkarımınızı yazın.',
  format(text, ton) {
    const [genel, once, sonra, cikarim] = parseSections(text, 4);
    const cta = templateCTA('vaka', ton);

    let out = '';
    if (genel)   out += endWithDot(genel) + '\n\n';
    if (once)    out += `❌ Önce: ${endWithDot(once)}\n\n`;
    if (sonra)   out += `✅ Sonra: ${endWithDot(sonra)}\n\n`;
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
  placeholder: 'İpucunuzu yazın. Neden işe yaradığını ve nasıl uygulandığını ekleyin.',
  format(text, ton) {
    const [baslik, neden, nasil] = parseSections(text, 3);
    const cta = templateCTA('ipucu', ton);

    let out = '';
    if (baslik) out += `🎯 ${endWithDot(baslik)}\n\n`;
    if (neden)  out += `Neden işe yarıyor: ${endWithDot(neden)}\n\n`;
    if (nasil) {
      const steps = nasil.split('\n').map(l => stripBullet(l)).filter(Boolean);
      if (steps.length > 1) {
        out += 'Nasıl yapılır:\n\n';
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
  placeholder: 'Sormak istediğiniz soruyu ve arka planı yazın.',
  format(text, ton) {
    const [baglam, soru, ilginc] = parseSections(text, 3);
    const cta = templateCTA('soru', ton);

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
  placeholder: 'Çarpıcı veriniizi ve yorumunuzu yazın.',
  format(text, ton) {
    const [veri, anlam, cikarim] = parseSections(text, 3);
    const cta = templateCTA('istatistik', ton);

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
  placeholder: 'Başarınızı, bunu mümkün kılan faktörleri ve yansımanızı yazın.',
  format(text, ton) {
    const [basari, faktorler, yansima] = parseSections(text, 3);
    const cta   = templateCTA('basari', ton);
    const icons = ['💪','🧠','🤝','🔑','⚡'];

    let out = '';
    if (basari) out += endWithDot(basari) + '\n\n';
    if (faktorler) {
      const items = faktorler.split('\n').map(l => stripBullet(l)).filter(Boolean);
      out += 'Bunu mümkün kılanlar:\n\n';
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
  placeholder: 'Hatanızı, ne yanlış gittiğini ve öğrendiklerinizi yazın.',
  format(text, ton) {
    const [hata, ne_yanlis, ders] = parseSections(text, 3);
    const cta = templateCTA('hata', ton);

    let out = '';
    if (hata)      out += endWithDot(hata) + '\n\n';
    if (ne_yanlis) out += ne_yanlis.split('\n').filter(Boolean).map(l => endWithDot(stripBullet(l))).join('\n\n') + '\n\n';
    if (ders)      out += `💡 Ders: ${endWithDot(ders)}\n\n`;
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
  placeholder: 'Konuyu, eski/kötü yolu, yeni/iyi yolu ve temel farkı yazın.',
  format(text, ton) {
    const [konu, eski, yeni, fark] = parseSections(text, 4);
    const cta = templateCTA('karsilastirma', ton);

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
  placeholder: 'İnançlarınızı ve değerlerinizi yazın.',
  format(text, ton) {
    const [giris, ilkeler, kapanis] = parseSections(text, 3);
    const cta = templateCTA('manifesto', ton);

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
  placeholder: 'Geçmişteki veya gelecekteki kendinize ne söylemek istediğinizi yazın.',
  format(text, ton) {
    const [para1, para2, para3] = parseSections(text, 3);
    const cta  = templateCTA('mektup', ton);
    const year = new Date().getFullYear() - 5;

    let out = `Sevgili ${year} yılının beni,\n\n`;
    if (para1) out += endWithDot(para1) + '\n\n';
    if (para2) out += endWithDot(para2) + '\n\n';
    if (para3) out += endWithDot(para3) + '\n\n';
    out += 'Şimdiki sen.\n\n―\n\n' + cta;
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
  placeholder: 'Kararı, gerekçelerinizi ve sonucu yazın.',
  format(text, ton) {
    const [karar, gerekceler, yansima] = parseSections(text, 3);
    const cta = templateCTA('karar', ton);

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
  placeholder: 'Tavsiyelerinizi ve bunları kime verdiğinizi yazın.',
  format(text, ton) {
    const [giris, tavsiyeler, kapanis] = parseSections(text, 3);
    const cta = templateCTA('tavsiye', ton);

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

function suggestHashtags(text) {
  const t = text.toLowerCase();
  let cats = [];
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

  // Ana kategoriden 6, ikinci kategoriden 2, genel'den 2 al
  const primary = HASHTAG_DB[cats[0]] || HASHTAG_DB.genel;
  const secondary = cats[1] ? HASHTAG_DB[cats[1]].slice(0, 2) : [];
  const fallback = HASHTAG_DB.genel.filter(h => !primary.includes(h) && !secondary.includes(h)).slice(0, 2);

  return [...primary.slice(0, 6), ...secondary, ...fallback].slice(0, 10);
}

/* =============================================
   OKUNABİLİRLİK SKORU (Premium)
   ============================================= */
function calcReadabilityScore(text) {
  if (!text || text.trim().length < 50) return null;

  let score = 5;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgLen    = sentences.reduce((a, s) => a + s.split(' ').length, 0) / (sentences.length || 1);
  if (avgLen < 15)   score += 1.5;
  else if (avgLen > 25) score -= 1;

  if ((text.match(/\n\n/g) || []).length >= 2) score += 1;

  const emojiCount = (text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []).length;
  if (emojiCount >= 1 && emojiCount <= 8) score += 0.5;
  else if (emojiCount > 12)               score -= 0.5;

  const first = text.split('\n')[0] || '';
  if (first.includes('?') || first.match(/^(Hiç|Bir gün|Geçen|Bugün)/i)) score += 1;

  if (text.match(/^[•\-→▶️1-9]/m)) score += 0.5;
  if (text.match(/yorum|düşünüyor|paylaş/i)) score += 0.5;

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
