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

function chooseCutLine(lines, maxLines, minFirstLines, minSecondLines) {
  if (lines.length <= maxLines) return null;

  const maxFirst = Math.min(maxLines, lines.length - 1);
  const minFirst = Math.min(Math.max(2, minFirstLines), maxFirst);
  const strongPunctRe = /[.!?;:]["')\]]*$/;
  const softPunctRe = /,["')\]]*$/;
  const weakEndRe = /\b(?:de|del|la|el|y|o|en|que|a|por|para|con|su|sus|un|una|los|las|lo)\b$/i;
  const weakStartRe = /^\s*(?:de|del|la|el|y|o|en|que|a|por|para|con|su|sus|un|una|los|las|lo)\b/i;

  let bestCut = null;
  let bestScore = -Infinity;

  for (let i = maxFirst; i >= minFirst; i -= 1) {
    const current = lines[i - 1].text.trim();
    const next = lines[i]?.text.trim() || '';
    const remaining = lines.length - i;
    if (remaining < minSecondLines) continue;

    let score = 0;

    if (strongPunctRe.test(current)) score += 120;
    else if (softPunctRe.test(current)) score += 85;
    else score += 20;

    if (weakEndRe.test(current)) score -= 35;
    if (weakStartRe.test(next)) score -= 18;

    // Preferir cortes cercanos al máximo permitido, sin volverlo una regla dura.
    score += i * 4;

    // Evitar que la segunda página quede demasiado corta.
    score -= Math.max(0, 4 - remaining) * 25;

    if (score > bestScore) {
      bestScore = score;
      bestCut = i;
    }
  }

  return bestCut;
}

// Divide un verso largo en paginas mas legibles:
// - Respeta maxLines por pagina.
// - Prioriza cortar al final de frase.
// - Evita segunda pagina demasiado vacia.
export function splitBibleVerseSmart(text, maxLines, options = {}) {
  const {
    charsPerLine = 46,
    minFirstLines = 4,
    minSecondLines = 2,
  } = options;

  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (!maxLines || maxLines < 2) return [clean];

  const words = clean.split(' ');
  const pages = [];
  let offset = 0;

  while (offset < words.length) {
    const remainingWords = words.slice(offset);
    const lines = wrapWords(remainingWords, charsPerLine);

    if (lines.length <= maxLines) {
      pages.push(remainingWords.join(' ').trim());
      break;
    }

    const cutLine = chooseCutLine(lines, maxLines, minFirstLines, minSecondLines);
    if (!cutLine) {
      pages.push(remainingWords.join(' ').trim());
      break;
    }

    const cutWord = lines[cutLine - 1].endWord;
    const pageWords = remainingWords.slice(0, cutWord + 1);
    pages.push(pageWords.join(' ').trim());
    offset += cutWord + 1;
  }

  return pages.filter(Boolean);
}
