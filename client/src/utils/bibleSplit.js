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
  const punctRe = /[.!?;:]["')\]]*$/;

  let chosen = maxFirst;

  // Preferir corte al cierre de frase dentro de la ventana visible.
  for (let i = maxFirst; i >= minFirst; i -= 1) {
    if (punctRe.test(lines[i - 1].text.trim())) {
      chosen = i;
      break;
    }
  }

  const remaining = lines.length - chosen;
  if (remaining < minSecondLines) {
    const balanced = Math.max(minFirst, lines.length - minSecondLines);
    chosen = Math.min(maxFirst, balanced);
  }

  return chosen;
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
