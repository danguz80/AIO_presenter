/**
 * Parser para archivos ChordPro (.cho, .chopro, .chordpro, .chord)
 *
 * Soporta dos formatos de directivas:
 *
 * Formato {} (ChordPro estándar):
 *  - Metadatos:  {title:}, {artist:}, {author:}, {copyright:}, {ccli:}, {key:}
 *  - Secciones:  {start_of_verse}, {start_of_chorus}, {start_of_bridge}, etc.
 *  - Fin:        {end_of_verse}, {end_of_chorus}, etc.
 *
 * Formato [] (español/latino, línea completa):
 *  - [Título] + [#1] autor / [#2] título → bloque de metadatos
 *  - [Verso], [Coro], [Puente], [Coro 2], etc. → inicio de sección
 *  - [C], [Am7], [G/B] inline dentro de una línea de letra → acorde
 *
 * IMPORTANTE: los marcadores de acorde inline se CONSERVAN en el content.
 * Las vistas son responsables de:
 *  - stripChords(content)     → eliminar [X] para pantalla principal/virtual
 *  - parseChordLines(content) → posicionar acordes en pantalla de escenario
 */

// ─── Mapas de directivas {} ──────────────────────────────────────────────────
const META_DIRECTIVES = {
  t:         'title',
  title:     'title',
  st:        'author',
  subtitle:  'author',
  artist:    'author',
  author:    'author',
  a:         'author',
  copyright: 'copyright',
  c:         'copyright',
  ccli:      'ccli',
  key:       'key',
};

const SECTION_START = {
  start_of_verse:       'Verso',
  sov:                  'Verso',
  start_of_chorus:      'Coro',
  soc:                  'Coro',
  start_of_bridge:      'Puente',
  sob:                  'Puente',
  start_of_pre_chorus:  'Pre-Coro',
  sopc:                 'Pre-Coro',
  start_of_intro:       'Intro',
  start_of_outro:       'Outro',
  start_of_tag:         'Tag',
  start_of_ending:      'Final',
  verse:    'Verso',
  chorus:   'Coro',
  bridge:   'Puente',
};

const SECTION_END = new Set([
  'end_of_verse','eov','end_of_chorus','eoc',
  'end_of_bridge','eob','end_of_pre_chorus','eopc',
  'end_of_intro','end_of_outro','end_of_tag','end_of_ending',
]);

// Normalización de etiquetas [] al español
const BRACKET_SECTION_MAP = {
  'verso':    'Verso',
  'coro':     'Coro',
  'puente':   'Puente',
  'pre-coro': 'Pre-Coro',
  'precoro':  'Pre-Coro',
  'bridge':   'Puente',
  'chorus':   'Coro',
  'verse':    'Verso',
  'intro':    'Intro',
  'outro':    'Outro',
  'final':    'Final',
  'tag':      'Tag',
  'ending':   'Final',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detecta si una cadena es un símbolo de acorde musical.
 * C, Am, G7, Fmaj7, C/E, D#m, Bb → true
 * Verso, Coro, Título, #1          → false
 */
const CHORD_SYMBOL_RE = /^[A-G][#b]?(?:m|M|maj|min|dim|aug|sus[24]?|add\d*|dom|alt)?[0-9]*(?:b\d+|#\d+)*(?:\/[A-G][#b]?)?$/;
function isChordSymbol(str) {
  return CHORD_SYMBOL_RE.test(str.trim());
}

/**
 * Parsea una directiva {} de ChordPro.
 * Retorna { name, value } o null.
 */
function parseDirective(line) {
  const m = line.trim().match(/^\{([^:{}]+?)(?:\s*:\s*([^{}]*))?\s*\}$/);
  if (!m) return null;
  return {
    name:  m[1].trim().toLowerCase().replace(/-/g, '_'),
    value: (m[2] || '').trim(),
  };
}

/**
 * Si la línea completa es una etiqueta en corchetes ([Algo]),
 * devuelve el contenido. Si no, devuelve null.
 */
function parseBracketLabel(line) {
  const m = line.trim().match(/^\[([^\]]+)\]$/);
  return m ? m[1].trim() : null;
}

/** Genera etiqueta numerada (solo para directivas {}, no para []). */
function buildLabel(base, slides) {
  const count = slides.filter(s => s.label === base || s.label.startsWith(base + ' ')).length;
  return count === 0 ? base : `${base} ${count + 1}`;
}

// ─── Parser principal ────────────────────────────────────────────────────────

/**
 * @param {string} content  - Contenido del archivo ChordPro
 * @param {string} filename - Nombre del archivo (para título por defecto)
 * @returns {{ title, author, copyright, ccli, slides: Array<{label, content}> }}
 *
 * Nota: slide.content conserva los marcadores de acorde [X] inline.
 */
function parseChordPro(content, filename = '') {
  const lines  = content.split(/\r?\n/);
  const slides = [];
  const meta   = { title: '', author: '', copyright: '', ccli: '' };

  let inSection    = false;
  let currentLabel = null;
  let currentLines = [];

  // Estado para el bloque [Título] / [#1] / [#2]
  let inTitleBlock = false;
  let pendingMeta  = null; // 'author' | 'title' | null

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (text) {
      slides.push({ label: currentLabel || buildLabel('Verso', slides), content: text });
    }
    currentLines = [];
    inSection    = false;
    currentLabel = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // ── Directiva {} ────────────────────────────────────────────────────────
    const dir = parseDirective(line);
    if (dir) {
      if (META_DIRECTIVES[dir.name] && dir.value) {
        const key = META_DIRECTIVES[dir.name];
        if (key !== 'key') meta[key] = meta[key] || dir.value;
        continue;
      }
      if (SECTION_START[dir.name]) {
        if (inSection) flush();
        inTitleBlock = false;
        pendingMeta  = null;
        inSection    = true;
        const base   = SECTION_START[dir.name];
        currentLabel = dir.value
          ? dir.value.charAt(0).toUpperCase() + dir.value.slice(1)
          : buildLabel(base, slides);
        continue;
      }
      if (SECTION_END.has(dir.name)) { flush(); continue; }
      if (dir.name === 'comment') continue;
      continue;
    }

    // ── Etiqueta en corchetes [] que ocupa toda la línea ────────────────────
    const bracketContent = parseBracketLabel(line);
    if (bracketContent !== null) {
      const lower = bracketContent.toLowerCase();

      // [Título] → inicia bloque de metadatos
      if (lower === 'título' || lower === 'titulo' || lower === 'title') {
        inTitleBlock = true;
        pendingMeta  = null;
        continue;
      }

      // [#1] → siguiente línea es el autor; [#2] → título
      if (bracketContent === '#1') {
        pendingMeta = 'author';
        continue;
      }
      if (bracketContent === '#2') {
        pendingMeta = 'title';
        continue;
      }

      // Acorde solo en su línea (e.g. [C] sin letra) → añadir si hay sección activa
      if (isChordSymbol(bracketContent)) {
        if (inSection) currentLines.push(`[${bracketContent}]`);
        continue;
      }

      // Etiqueta de sección: [Verso], [Coro], [Coro 2], [Puente], etc.
      inTitleBlock = false;
      pendingMeta  = null;
      if (inSection) flush();

      const mapped = BRACKET_SECTION_MAP[lower];
      // Para etiquetas [], usar el texto tal cual (sin auto-numeración).
      // El usuario ya escribe el número si lo necesita: [Coro 2].
      currentLabel = mapped
        ? mapped  // normaliza inglés→español: Chorus→Coro
        : bracketContent.charAt(0).toUpperCase() + bracketContent.slice(1);
      inSection = true;
      continue;
    }

    // ── Línea de texto normal ────────────────────────────────────────────────

    // Consumir valor pendiente de metadatos ([#1] o [#2])
    if (pendingMeta && trimmed) {
      meta[pendingMeta] = meta[pendingMeta] || trimmed;
      pendingMeta = null;
      continue;
    }

    // Líneas vacías fuera de sección: ignorar
    if (!trimmed && !inSection) continue;

    if (!inSection) {
      if (trimmed) {
        inTitleBlock = false;
        pendingMeta  = null;
        inSection    = true;
        currentLabel = buildLabel('Verso', slides);
        currentLines.push(line.trimEnd()); // conservar acordes inline
      }
    } else {
      currentLines.push(line.trimEnd()); // conservar acordes inline
    }
  }

  if (inSection) flush();

  // Fallback: si no se encontraron secciones, crear una sola con todo el contenido
  if (slides.length === 0 && content.trim()) {
    const allText = lines
      .filter(l => !parseDirective(l) && !parseBracketLabel(l))
      .join('\n')
      .trim();
    if (allText) slides.push({ label: 'Verso 1', content: allText });
  }

  // Título por defecto desde nombre del archivo
  if (!meta.title) {
    meta.title = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
  }

  return { ...meta, slides };
}

module.exports = { parseChordPro };
