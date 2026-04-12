/* =============================================
   LinkedIn Post Formatter — Hook Analizi
   ============================================= */

'use strict';

/**
 * LinkedIn postunun ilk cümlesini (hook) analiz eder.
 * @param {string} text - Formatlanmış post metni
 * @returns {{ score: number, label: string, emoji: string, tip: string }}
 */
function analyzeHook(text) {
  if (!text || !text.trim()) {
    return analyzeHookEmpty();
  }

  const firstLine          = text.split('\n').find(l => l.trim()) || '';
  const words              = firstLine.trim().split(/\s+/);
  const hasQuestionAnywhere = /\?/.test(text);
  let score                = 0;
  const missing            = [];

  // +25: Hook soru ile başlıyor/bitiyor
  if (/\?/.test(firstLine)) {
    score += 25;
  } else if (hasQuestionAnywhere) {
    score += 10; // CTA sorusu var — kısmi puan, ipucu gösterme
  } else {
    missing.push('question'); // Hiç soru yok — ipucu göster
  }

  // +20: Rakam / istatistik içeriyor
  if (/\d/.test(text)) {
    score += 20;
  } else {
    missing.push('number');
  }

  // +20: Kişisel açılış ("I ", "Ben ")
  if (/\b(I|Ben|Benim|Bana|_I_|_Ben_)\b/i.test(firstLine)) {
    score += 20;
  } else {
    missing.push('personal');
  }

  // +15: Bold statement (uzun + ünlem veya soru/nokta)
  if (firstLine.length > 30 && /[.!?]$/.test(firstLine.trim())) {
    score += 15;
  }

  // +10: Kısa (< 15 kelime)
  if (words.length <= 15) {
    score += 10;
  } else if (words.length > 15) {
    missing.push('short');
  }

  // +10: Emoji içeriyor
  if (/\p{Emoji_Presentation}/u.test(firstLine)) {
    score += 10;
  } else {
    missing.push('emoji');
  }

  // +10: "Nasıl" / "Why" / "How" içeriyor
  if (/\b(nasıl|why|how|warum|pourquoi|cómo)\b/i.test(firstLine)) {
    score += 10;
  }

  score = Math.min(score, 100);

  let labelKey, emoji, tipKey;
  if (score >= 80) {
    score = 100; // Görsel olarak barın tam dolması için
    labelKey = 'hookStrong';
    emoji    = '🔥';
    tipKey   = 'hookTipStrong';
  } else if (score >= 50) {
    labelKey = 'hookGood';
    emoji    = '✅';
    tipKey   = _buildTipKey(missing);
  } else if (score >= 20) {
    labelKey = 'hookWeak';
    emoji    = '⚠️';
    tipKey   = _buildTipKey(missing);
  } else {
    labelKey = 'hookNone';
    emoji    = '❌';
    tipKey   = 'hookTipNoHook';
  }

  return { score, labelKey, emoji, tipKey };
}

function analyzeHookEmpty() {
  return { score: 0, labelKey: 'hookNone', emoji: '❌', tipKey: 'hookTipStart' };
}

function _buildTipKey(missing) {
  if (!missing.length) return 'hookTipGood';
  const map = {
    question: 'hookTipQuestion',
    number:   'hookTipNumber',
    personal: 'hookTipPersonal',
    emoji:    'hookTipEmoji',
    short:    'hookTipShort',
  };
  return map[missing[0]] || 'hookTipShort';
}
