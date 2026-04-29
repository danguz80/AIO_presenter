/**
 * Utilidades para procesar texto con marcadores de acorde ChordPro [X].
 *
 * Los acordes se almacenan en el content con la notación inline [X]texto.
 * - stripChords   → elimina los marcadores para pantalla principal/virtual
 * - parseChordLines → extrae posiciones para pantalla de escenario
 */

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
