/**
 * Utilidades para procesar texto con marcadores de acorde ChordPro [X].
 *
 * Los acordes se almacenan en el content con la notación inline [X]texto.
 * - stripChords   → elimina los marcadores para pantalla principal/virtual
 * - parseChordLines → extrae posiciones para pantalla de escenario
 *
 * Comentarios: líneas que empiezan con "//" son comentarios de director.
 * - isCommentLine → true si la línea es un comentario
 * - stripComments → elimina líneas de comentario del texto
 */

/**
 * Devuelve true si la línea es un comentario de director completo
 * (comienza por "//" con espacios opcionales al inicio).
 */
export function isCommentLine(line) {
  return /^\s*\/\//.test(line);
}

/**
 * Extrae el comentario inline de una línea.
 * Reglas:
 *   - `texto //comentario`     → visible: "texto",  comment: "comentario"
 *   - `texto //comment// más`  → visible: "texto más", comment: "comment"
 *   - Sin "//"                 → visible: línea completa, comment: null
 */
export function extractInlineComment(line) {
  const idx = line.indexOf('//');
  if (idx === -1) return { visible: line, comment: null };

  const before = line.slice(0, idx);
  const after  = line.slice(idx + 2);
  const closeIdx = after.indexOf('//');

  if (closeIdx === -1) {
    // Sin cierre: desde // hasta el final es comentario
    return { visible: before.trimEnd(), comment: after.trim() || null };
  } else {
    // Con cierre: //comentario// — la parte antes y después queda visible
    const commentText = after.slice(0, closeIdx);
    const rest = after.slice(closeIdx + 2);
    const visible = (before.trimEnd() + (rest.trim() ? ' ' + rest.trimStart() : '')).trimEnd();
    return { visible, comment: commentText.trim() || null };
  }
}

/**
 * Elimina todos los comentarios (//) del texto:
 * - Líneas completas que empiezan con // → eliminadas
 * - Comentarios inline → se elimina la parte de comentario
 */
export function stripComments(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => {
      if (isCommentLine(line)) return null;
      const { visible } = extractInlineComment(line);
      return visible;
    })
    .filter(line => line !== null)
    .join('\n');
}

/**
 * Elimina todos los marcadores de acorde [X] del texto.
 * Idempotente: si no hay acordes, devuelve el texto sin cambios.
 */
export function stripChords(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => line.replace(/\[[^\]]*\]/g, '').replace(/  +/g, ' ').trimEnd())
    .join('\n');
}

/**
 * Parsea una línea con marcadores de acorde en segmentos { chord, text }.
 *
 * "[C]No existen[G]ivos" →
 *   [{ chord: 'C', text: 'No existen' }, { chord: 'G', text: 'ivos' }]
 *
 * "Línea sin acordes" →
 *   [{ chord: null, text: 'Línea sin acordes' }]
 */
export function parseChordLine(line) {
  const segments = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const textBefore = line.slice(lastIndex, match.index);

    if (segments.length === 0) {
      // Texto antes del primer acorde
      if (textBefore) segments.push({ chord: null, text: textBefore });
    } else {
      // El texto entre este y el acorde anterior va al último segmento
      segments[segments.length - 1].text = textBefore;
    }

    segments.push({ chord: match[1], text: '' });
    lastIndex = match.index + match[0].length;
  }

  // Texto restante tras el último acorde
  const remaining = line.slice(lastIndex);
  if (segments.length > 0) {
    segments[segments.length - 1].text += remaining;
  } else {
    segments.push({ chord: null, text: line });
  }

  return segments;
}

/**
 * Parsea un bloque de contenido ChordPro completo.
 * Retorna un array de líneas; cada línea es un array de segmentos { chord, text }.
 */
export function parseChordLines(content) {
  if (!content) return [];
  return content.split('\n').map(parseChordLine);
}

// ─── Generador de acordes por tonalidad ──────────────────────────────────────
const _SEMI = {
  'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,
  'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11,
};
const _SH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const _FL = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const _USE_FLAT = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);

function _cn(base, steps, flat) {
  return (flat ? _FL : _SH)[((base + steps) % 12 + 12) % 12];
}

/**
 * Genera los grupos de acordes diatónicos y especiales para una tonalidad.
 * @param {string} keyStr - Ej: "G", "Am", "F#m", "Bb"
 * @returns {Array<{label: string, chords: string[]}>|null}
 */
export function buildScaleChords(keyStr) {
  if (!keyStr?.trim()) return null;
  const k = keyStr.trim();
  const minor   = k.length >= 2 && k[k.length - 1] === 'm';
  const rootStr = minor ? k.slice(0, -1) : k;
  const r = _SEMI[rootStr];
  if (r === undefined) return null;
  const uf = _USE_FLAT.has(k) || rootStr.includes('b');
  const n  = (s) => _cn(r, s, uf);

  if (!minor) {
    const [I,II,III,IV,V,VI,VII] = [0,2,4,5,7,9,11].map(s => n(s));
    return [
      { label: 'Tónica',             chords: [I, I+'maj7', I+'7', I+'sus2'] },
      { label: '4° y 5° grado',      chords: [IV, V, V+'7', V+'sus4', IV+'maj7', IV+'sus2'] },
      { label: 'Grados diatónicos',  chords: [II+'m', III+'m', VI+'m', VII+'dim', II+'m7', III+'m7', VI+'m7'] },
      { label: 'Dom. secundarios',   chords: [VI+'7', VII+'7', II+'7', III+'7'] },
      { label: 'Inversiones',        chords: [I+'/'+III, IV+'/'+VI, V+'/'+VII, VI+'m/'+I] },
      { label: 'Sus / Add',          chords: [I+'sus4', I+'add9', IV+'add9', II+'sus2', III+'sus4'] },
    ];
  } else {
    const [i,ii,bIII,iv,V5,bVI,bVII,lead] = [0,2,3,5,7,8,10,11].map(s => n(s));
    return [
      { label: 'Tónica',             chords: [i+'m', i+'m7', i+'sus4', i+'add9'] },
      { label: '4° y 5° grado',      chords: [iv+'m', V5, V5+'7', V5+'sus4', iv+'m7'] },
      { label: 'Grados diatónicos',  chords: [bIII, bVI, bVII, ii+'dim', ii+'m7b5'] },
      { label: 'Dom. secundarios',   chords: [bVII+'7', bIII+'7', iv+'7', i+'7'] },
      { label: 'Inversiones',        chords: [i+'m/'+bIII, V5+'/'+lead, bIII+'/'+n(7), bVI+'/'+i] },
      { label: 'Sus / Add',          chords: [i+'sus2', V5+'sus4', bIII+'sus2', bVII+'sus2'] },
    ];
  }
}
