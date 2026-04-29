/**
 * Parser para archivos de texto plano (.txt)
 *
 * Estrategias de detección (en orden de prioridad):
 *  1. Metadatos en cabecera:  "Title: ...", "Author: ..."
 *  2. Encabezados de sección: "Verse 1:", "[Chorus]", "Coro:", etc.
 *  3. Párrafos separados por línea en blanco (si no hay encabezados)
 */

const SECTION_KEYWORDS = [
  // Español
  'verso','coro','puente','pre-coro','estribillo','refrain',
  'intro','outro','tag','final','interludio','coda',
  // Inglés
  'verse','chorus','bridge','pre-chorus','intro','outro','tag',
  'ending','interlude','instrumental',
];

/**
 * Determina si una línea es un encabezado de sección.
 * Ejemplos válidos:
 *   "Verse 1"  "Verse 1:"  "[Chorus]"  "[Coro]"  "V1:"  "C:"  "1."
 */
function isSectionHeader(line) {
  const t = line.trim().toLowerCase();
  if (!t) return false;

  // [Label] o [Label N]
  if (/^\[.+\]$/.test(t)) return true;

  // {Label} o {Label N}
  if (/^\{.+\}$/.test(t)) return true;

  // Palabra clave sola o seguida de número / ":"
  if (SECTION_KEYWORDS.some(k => new RegExp(`^${k}(\\s*\\d*\\s*:?)?$`).test(t))) return true;

  // Abreviaturas tipo "V1:", "C:", "B:", "PC:"
  if (/^(v|c|b|pc)\s*\d*\s*:$/.test(t)) return true;

  // Números "1." "2." solos en la línea (versos numerados)
  if (/^\d+\.$/.test(t)) return true;

  return false;
}

function normalizeLabel(raw) {
  let label = raw.trim()
    .replace(/^\[/, '').replace(/\]$/, '')  // quitar corchetes
    .replace(/^\{/, '').replace(/\}$/, '')  // quitar llaves
    .replace(/:$/, '')                        // quitar ":" final
    .trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Traduce etiquetas en inglés a español para consistencia interna.
 */
function translateLabel(label) {
  const map = {
    verse:       'Verso',
    chorus:      'Coro',
    bridge:      'Puente',
    'pre-chorus':'Pre-Coro',
    intro:       'Intro',
    outro:       'Outro',
    tag:         'Tag',
    ending:      'Final',
    interlude:   'Interludio',
    instrumental:'Instrumental',
    refrain:     'Estribillo',
    coda:        'Coda',
  };
  const lower = label.toLowerCase();
  for (const [en, es] of Object.entries(map)) {
    if (lower.startsWith(en)) {
      return label.replace(new RegExp(en, 'i'), es);
    }
  }
  return label;
}

/**
 * Estrategia 1: dividir por encabezados de sección explícitos.
 */
function parseWithHeaders(lines) {
  const slides = [];
  let currentLabel = null;
  let currentLines = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content) {
      slides.push({ label: translateLabel(currentLabel || `Verso ${slides.length + 1}`), content });
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (isSectionHeader(line)) {
      flush();
      currentLabel = normalizeLabel(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();
  return slides;
}

/**
 * Estrategia 2: dividir por párrafos (líneas en blanco dobles).
 */
function parseByParagraphs(lines) {
  const slides = [];
  let current = [];
  let index   = 1;
  let blankCount = 0;

  const flush = () => {
    const content = current.join('\n').trim();
    if (content) {
      slides.push({ label: `Verso ${index++}`, content });
    }
    current = [];
    blankCount = 0;
  };

  for (const line of lines) {
    if (!line.trim()) {
      blankCount++;
      // Separar secciones al encontrar al menos una línea en blanco
      if (blankCount === 1 && current.length > 0) {
        flush();
      }
    } else {
      blankCount = 0;
      current.push(line);
    }
  }
  flush();
  return slides;
}

/**
 * @param {string} content  - Contenido del archivo en texto plano
 * @param {string} filename - Nombre del archivo (para inferir título)
 * @returns {{ title: string, author: string, copyright: string, slides: Array }}
 */
function parseTxt(content, filename = '') {
  const rawLines = content.split(/\r?\n/);
  let title     = '';
  let author    = '';
  let copyright = '';
  let startLine = 0;

  // Extraer metadatos de la cabecera (primeras líneas con "Key: value")
  for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
    const line = rawLines[i];
    const m = line.match(/^(title|título|titulo|author|autor|artist|artista|copyright)\s*:\s*(.+)/i);
    if (!m) break; // salir al primer no-metadato
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (/title|título|titulo/.test(key))       title     = val;
    else if (/author|autor|artist|artista/.test(key)) author    = val;
    else if (/copyright/.test(key))             copyright = val;
    startLine = i + 1;
  }

  const bodyLines = rawLines.slice(startLine);

  // ¿Tiene encabezados de sección?
  const hasHeaders = bodyLines.some(l => isSectionHeader(l));
  const slides = hasHeaders
    ? parseWithHeaders(bodyLines)
    : parseByParagraphs(bodyLines);

  // Si todo sigue vacío, crear un único slide
  if (slides.length === 0 && content.trim()) {
    slides.push({ label: 'Verso 1', content: content.trim() });
  }

  // Título por defecto: nombre del archivo limpio
  if (!title) {
    title = filename
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]/g, ' ')
      .trim();
  }

  return { title, author, copyright, ccli: '', slides };
}

module.exports = { parseTxt };
