/**
 * Parser para archivos ChordPro (.cho, .chopro, .chordpro, .chord)
 *
 * Especificación: https://www.chordpro.org/chordpro/chordpro-directives/
 *
 * Soporta:
 *  - Metadatos:  {title:}, {artist:}, {author:}, {copyright:}, {ccli:}, {key:}
 *  - Secciones:  {start_of_verse}, {start_of_chorus}, {start_of_bridge},
 *                {sov:}, {soc}, {sob}, y formas abreviadas
 *  - Fin de sec: {end_of_verse}, {end_of_chorus}, {end_of_bridge}, {eov}, {eoc}, {eob}
 *  - Etiquetas:  {start_of_verse: Verse 1}  con nombre inline
 *  - Acordes:    [G], [Am7], [C/E] → eliminados del texto mostrado
 *  - Comentarios:{comment: texto}  → ignorados
 */

// ─── Mapas de directivas ────────────────────────────────────────────────────
const META_DIRECTIVES = {
  t:         'title',
  title:     'title',
  st:        'author',
  subtitle:  'author',
  artist:    'author',
  author:    'author',
  a:         'author',
  copyright: 'copyright',
  c:         'copyright',   // deprecated shorthand
  ccli:      'ccli',
  key:       'key',
};

const SECTION_START = {
  start_of_verse:   'Verso',
  sov:              'Verso',
  start_of_chorus:  'Coro',
  soc:              'Coro',
  start_of_bridge:  'Puente',
  sob:              'Puente',
  start_of_pre_chorus:  'Pre-Coro',
  sopc:             'Pre-Coro',
  start_of_intro:   'Intro',
  start_of_outro:   'Outro',
  start_of_tag:     'Tag',
  start_of_ending:  'Final',
  // Genérico
  verse:    'Verso',
  chorus:   'Coro',
  bridge:   'Puente',
};

const SECTION_END = new Set([
  'end_of_verse','eov','end_of_chorus','eoc',
  'end_of_bridge','eob','end_of_pre_chorus','eopc',
  'end_of_intro','end_of_outro','end_of_tag','end_of_ending',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Elimina acordes tipo [G], [Am7], [C/E] de una línea de texto. */
function stripChords(line) {
  return line.replace(/\[([A-Ga-g][#b]?[^[\]]*)\]/g, '').trim();
}

/**
 * Parsea una directiva ChordPro.
 * Retorna { name, value } o null si la línea no es directiva.
 *
 * Formas válidas:
 *   {title: Amazing Grace}
 *   {chorus}
 *   {start_of_verse: Verse 1}
 *   {t: Amazing Grace}
 */
function parseDirective(line) {
  const trimmed = line.trim();
  const m = trimmed.match(/^\{([^:{}]+?)(?:\s*:\s*([^{}]*))?\s*\}$/);
  if (!m) return null;
  return {
    name:  m[1].trim().toLowerCase().replace(/-/g, '_'),
    value: (m[2] || '').trim(),
  };
}

/** Genera una etiqueta numerada. Ej: "Verso", contando cuántos ya existen → "Verso 2" */
function buildLabel(base, slides) {
  const existing = slides.filter(s => s.label.startsWith(base)).length;
  if (existing === 0) return base;
  return `${base} ${existing + 1}`;
}

// ─── Parser principal ────────────────────────────────────────────────────────

/**
 * @param {string} content  - Contenido del archivo ChordPro
 * @param {string} filename - Nombre del archivo
 * @returns {{ title, author, copyright, ccli, slides: Array }}
 */
function parseChordPro(content, filename = '') {
  const lines   = content.split(/\r?\n/);
  const slides  = [];
  const meta    = { title: '', author: '', copyright: '', ccli: '' };

  let inSection      = false;
  let currentLabel   = null;
  let currentLines   = [];

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
    const dir = parseDirective(line);

    if (dir) {
      // ── Metadatos ──────────────────────────────────────────────────────
      if (META_DIRECTIVES[dir.name] && dir.value) {
        const key = META_DIRECTIVES[dir.name];
        if (key !== 'key') meta[key] = meta[key] || dir.value; // primer valor gana
        continue;
      }

      // ── Inicio de sección ─────────────────────────────────────────────
      if (SECTION_START[dir.name]) {
        if (inSection) flush(); // cerrar sección anterior si no tuvo end_of_*
        inSection    = true;
        const base   = SECTION_START[dir.name];
        // Usar etiqueta inline si existe: {start_of_verse: Verse 2}
        currentLabel = dir.value
          ? dir.value.charAt(0).toUpperCase() + dir.value.slice(1)
          : buildLabel(base, slides);
        continue;
      }

      // ── Fin de sección ────────────────────────────────────────────────
      if (SECTION_END.has(dir.name)) {
        flush();
        continue;
      }

      // ── Comentarios → ignorar ─────────────────────────────────────────
      if (dir.name === 'comment' || dir.name === 'c') continue;

      // Otras directivas desconocidas → ignorar
      continue;
    }

    // ── Línea de texto normal ──────────────────────────────────────────
    const textLine = stripChords(line);

    if (!inSection) {
      // Texto fuera de sección: iniciar una sección implícita
      if (textLine) {
        inSection    = true;
        currentLabel = buildLabel('Verso', slides);
        currentLines.push(textLine);
      }
    } else {
      currentLines.push(textLine);
    }
  }

  // Flush de sección sin cerrar
  if (inSection) flush();

  // Si no se encontraron secciones, crear una sola
  if (slides.length === 0 && content.trim()) {
    const allText = lines.map(l => {
      const d = parseDirective(l);
      return d ? '' : stripChords(l);
    }).join('\n').trim();
    if (allText) slides.push({ label: 'Verso 1', content: allText });
  }

  // Título por defecto desde nombre del archivo
  if (!meta.title) {
    meta.title = filename
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]/g, ' ')
      .trim();
  }

  return { ...meta, slides };
}

module.exports = { parseChordPro };
