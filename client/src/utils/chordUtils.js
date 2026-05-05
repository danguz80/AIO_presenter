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
