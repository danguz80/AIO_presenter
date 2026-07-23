function wrapWords(words, charsPerLine) {
  const lines = [];
  let start = 0;
  let len = 0;

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i] || '';
    const nextLen = len === 0 ? w.length : len + 1 + w.length;

    if (len > 0 && nextLen > charsPerLine) {
      lines.push({
        startWord: start,
        endWord: i - 1,
        text: words.slice(start, i).join(' '),
      });
      start = i;
      len = w.length;
    } else {
      len = nextLen;
    }
  }

  if (start <= words.length - 1) {
    lines.push({
      startWord: start,
      endWord: words.length - 1,
      text: words.slice(start).join(' '),
    });
  }

  return lines;
}

function estimateLines(text, charsPerLine) {
  const clean = String(text || '').trim();
  if (!clean) return 0;
  const words = clean.split(/\s+/);
  return wrapWords(words, charsPerLine).length;
}

function scoreBoundary(prefixText, suffixText, prefixLines, suffixLines, maxLines, minFirstLines, minSecondLines) {
  const strongPunctRe = /[.!?;:]["')\]]*$/;
  const softPunctRe = /,["')\]]*$/;
  const weakEndRe = /\b(?:de|del|la|el|y|o|en|que|a|por|para|con|su|sus|un|una|los|las|lo)\b$/i;
  const weakStartRe = /^\s*(?:de|del|la|el|y|o|en|que|a|por|para|con|su|sus|un|una|los|las|lo)\b/i;

  if (prefixLines < minFirstLines || suffixLines < minSecondLines) return -Infinity;
  if (prefixLines > maxLines) return -Infinity;

  let score = 0;

  if (strongPunctRe.test(prefixText)) score += 140;
  else if (softPunctRe.test(prefixText)) score += 105;
  else score += 25;

  if (weakEndRe.test(prefixText)) score -= 45;
  if (weakStartRe.test(suffixText)) score -= 30;

  // Preferir páginas de apertura completas, pero sin sobrecargar la primera.
  const target = Math.max(minFirstLines, maxLines - 1);
  score -= Math.abs(prefixLines - target) * 12;

  // Evitar una segunda página demasiado vacía o demasiado cargada.
  score -= Math.max(0, minSecondLines - suffixLines) * 40;
  score -= Math.max(0, 2 - Math.min(prefixLines, suffixLines)) * 10;

  return score;
}

// Divide un verso largo en paginas mas legibles:
// - Respeta maxLines por pagina.
// - Prioriza cortar al final de frase.
// - Evita segunda pagina demasiado vacia.
export function splitBibleVerseSmart(text, maxLines, options = {}) {
  const {
    charsPerLine = 40,
    minFirstLines = 4,
    minSecondLines = 2,
  } = options;

  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (!maxLines || maxLines < 2) return [clean];

  const words = clean.split(/\s+/);
  const pages = [];
  let offset = 0;

  while (offset < words.length) {
    const remainingWords = words.slice(offset);
    const lines = wrapWords(remainingWords, charsPerLine);

    if (lines.length <= maxLines) {
      pages.push(remainingWords.join(' ').trim());
      break;
    }

    let bestCut = null;
    let bestScore = -Infinity;

    for (let cutWord = 1; cutWord < remainingWords.length; cutWord += 1) {
      const prefixText = remainingWords.slice(0, cutWord).join(' ');
      const suffixWords = remainingWords.slice(cutWord);
      const suffixText = suffixWords.join(' ');
      const prefixLines = estimateLines(prefixText, charsPerLine);
      const suffixLines = estimateLines(suffixText, charsPerLine);
      const score = scoreBoundary(prefixText, suffixText, prefixLines, suffixLines, maxLines, minFirstLines, minSecondLines);
      if (score > bestScore) {
        bestScore = score;
        bestCut = cutWord;
      }
    }

    if (bestCut === null) {
      pages.push(remainingWords.join(' ').trim());
      break;
    }

    pages.push(remainingWords.slice(0, bestCut).join(' ').trim());
    offset += bestCut;
  }

  return pages.filter(Boolean);
}
