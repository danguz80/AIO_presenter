/**
 * Parser para archivos FreeShow (.show)
 *
 * FreeShow guarda sus presentaciones como JSON con la siguiente estructura:
 * {
 *   name: string,
 *   meta: { title, artist, author, copyright, CCLI, ... },
 *   settings: { activeLayout: "uuid" },
 *   slides: {
 *     [uuid]: {
 *       group: "verse" | "chorus" | "bridge" | ...,
 *       globalGroup: string,
 *       items: [{ type:"text", lines:[{ text:[{ value:string }] }] }]
 *     }
 *   },
 *   layouts: {
 *     [uuid]: {
 *       name: string,
 *       slides: [{ id: string }]   // orden de presentación
 *     }
 *   }
 * }
 */

// Mapa de grupos globales → etiquetas en español
const GROUP_LABEL = {
  verse:       'Verso',
  chorus:      'Coro',
  bridge:      'Puente',
  pre_chorus:  'Pre-Coro',
  'pre-chorus':'Pre-Coro',
  intro:       'Intro',
  outro:       'Outro',
  tag:         'Tag',
  ending:      'Final',
  interlude:   'Interludio',
  instrumental:'Instrumental',
  spoken:      'Hablado',
};

/**
 * Extrae todo el texto visible de un slide de FreeShow.
 * items → lines → text[].value
 *
 * NOTA: en FreeShow el campo `type` del Item es OPCIONAL.
 * Cuando no está definido se asume 'text' (comportamiento por defecto del editor).
 * Solo excluimos ítems con tipo explícito que no sea 'text'.
 */
function extractSlideText(slide) {
  if (!slide || !Array.isArray(slide.items)) return '';

  const NON_TEXT_TYPES = new Set(['media','camera','timer','clock','button',
    'events','weather','variable','web','mirror','icon','slide_tracker',
    'visualizer','captions','metronome','current_output','list']);

  const lines = [];
  for (const item of slide.items) {
    // Saltar ítems que son explícitamente no-texto
    if (item.type && NON_TEXT_TYPES.has(item.type)) continue;
    if (!Array.isArray(item.lines)) continue;
    for (const line of item.lines) {
      if (!Array.isArray(line.text)) continue;
      const lineText = line.text.map(t => (t.value || '')).join('');
      if (lineText.trim()) lines.push(lineText);
    }
  }
  return lines.join('\n');
}

/**
 * Determina la etiqueta de un slide basándose en su globalGroup.
 * Numera automáticamente si hay repeticiones del mismo grupo.
 */
function getSlideLabel(slide, groupCounters) {
  const raw = slide.globalGroup || slide.group || '';
  const base = GROUP_LABEL[raw.toLowerCase()] || (raw
    ? raw.charAt(0).toUpperCase() + raw.slice(1)
    : 'Diapositiva'
  );

  groupCounters[base] = (groupCounters[base] || 0) + 1;

  // Solo numerar a partir de la segunda aparición
  // (la primera aparición del coro se llama "Coro", la segunda "Coro 2")
  return groupCounters[base] === 1 ? base : `${base} ${groupCounters[base]}`;
}

/**
 * Detecta si el JSON es un contenedor Shows { [uuid]: Show }
 * o un Show directo { name, slides, layouts, ... }.
 *
 * FreeShow guarda archivos en dos formatos:
 *  1. Show directo:     { name, meta, settings, slides, layouts, ... }
 *  2. Shows container:  { "uuid": { name, meta, settings, slides, layouts } }
 *
 * Identificamos el contenedor porque sus valores son objetos con la propiedad
 * "slides" que a su vez es un objeto (no array), característica propia de Show.
 */
function unwrapShow(data) {
  // Ya es un Show directo si tiene 'slides' como objeto en la raíz
  if (data.slides && typeof data.slides === 'object' && !Array.isArray(data.slides)) {
    return data;
  }

  // Buscar el primer valor que parezca un Show (tiene slides o layouts)
  for (const key of Object.keys(data)) {
    const candidate = data[key];
    if (candidate && typeof candidate === 'object') {
      if (
        (candidate.slides && typeof candidate.slides === 'object') ||
        (candidate.layouts && typeof candidate.layouts === 'object') ||
        candidate.name !== undefined
      ) {
        return candidate;
      }
    }
  }

  // Sin éxito: devolver el objeto original (dejará que el error de diagnóstico aparezca)
  return data;
}

/**
 * @param {string} content  - Contenido JSON del archivo .show
 * @param {string} filename - Nombre del archivo (fallback para título)
 * @returns {{ title, author, copyright, ccli, slides: Array }}
 */
function parseFreeShow(content, filename = '') {
  let raw;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('El archivo .show no es un JSON válido');
  }

  // Desempaquetar formato contenedor si aplica
  const data = unwrapShow(raw);

  // ── Metadatos ──────────────────────────────────────────────────────────────
  const meta   = data.meta || {};
  const title  = meta.title  || data.name || filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
  const author = meta.artist || meta.author || '';
  const copyright = meta.copyright || '';
  const ccli   = meta.CCLI || meta.ccli || '';

  // ── Obtener layout activo ──────────────────────────────────────────────────
  const layouts = data.layouts || {};
  const activeLayoutId = data.settings?.activeLayout;

  // Intentar layout activo → primer layout disponible → sin layout (usar slides directos)
  const layout = layouts[activeLayoutId] || Object.values(layouts)[0] || null;

  const allSlides = data.slides || {};

  /**
   * Si hay layout: usar su lista ordenada.
   * Si NO hay layout: usar las claves del objeto slides en orden de inserción,
   * expandiendo hijos si los hay (estructura de grupos FreeShow antiguos).
   */
  let layoutSlides;
  if (layout) {
    layoutSlides = Array.isArray(layout.slides) ? layout.slides : [];
  } else {
    // Fallback: construir la lista a partir de las claves de slides
    // En versiones antiguas de FreeShow los slides raíz pueden tener "children"
    const rootSlideIds = Object.keys(allSlides);
    layoutSlides = rootSlideIds.map(id => ({ id }));
  }

  // ── Parsear slides ─────────────────────────────────────────────────────────
  const groupCounters = {};
  const slides      = [];

  // IDs referenciados directamente en el layout (para evitar duplicados al expandir hijos)
  const layoutIdSet = new Set(
    layoutSlides.map(e => (typeof e === 'string' ? e : e.id)).filter(Boolean)
  );
  // IDs ya añadidos al resultado (evita duplicados si un hijo está en el layout Y en un padre)
  const addedIds = new Set();

  for (const entry of layoutSlides) {
    // entry puede ser { id: "uuid" } o simplemente "uuid"
    const slideId = typeof entry === 'string' ? entry : entry.id;
    if (!slideId) continue;

    // Saltar si ya fue procesado (posible duplicado por expansión de padre)
    if (addedIds.has(slideId)) continue;

    const slideData = allSlides[slideId];
    if (!slideData) continue;

    // Un slide puede ser un GRUPO (parent) con slides hijos.
    // En FreeShow los hijos están en allSlides y sus IDs en slideData.children (string[]).
    // Solo expandimos hijos si NO están ya referenciados individualmente en el layout.
    const childrenIds = Array.isArray(slideData.children) && slideData.children.length > 0
      ? slideData.children
      : null;

    const childrenInLayout = childrenIds?.some(id => layoutIdSet.has(id));

    if (childrenIds && !childrenInLayout) {
      // Expandir hijos: la etiqueta del grupo pertenece al padre
      const parentLabel = getSlideLabel(slideData, groupCounters);
      let childIndex = 0;
      for (const childId of childrenIds) {
        if (addedIds.has(childId)) continue;
        const child = allSlides[childId];
        if (!child) continue;
        const text = extractSlideText(child);
        if (!text.trim()) continue;
        const label = childIndex === 0
          ? parentLabel
          : `${parentLabel} ${childIndex + 1}`;
        childIndex++;
        addedIds.add(childId);
        slides.push({ label, content: text.trim() });
      }
      addedIds.add(slideId);
    } else {
      // Slide directo (o hijo referenciado individualmente en el layout)
      const text = extractSlideText(slideData);
      // Si no tiene texto propio pero sí hijos en el layout, usar el texto del primer hijo
      if (!text.trim() && childrenInLayout) {
        addedIds.add(slideId);
        continue; // los hijos se procesarán cuando aparezcan en el layout
      }
      if (!text.trim()) continue;
      const label = getSlideLabel(slideData, groupCounters);
      addedIds.add(slideId);
      slides.push({ label, content: text.trim() });
    }
  }

  if (slides.length === 0) {
    // Diagnóstico: reportar qué había en el archivo
    const totalSlides  = Object.keys(allSlides).length;
    const totalLayouts = Object.keys(data.layouts || {}).length;
    throw new Error(
      `No se encontraron diapositivas con contenido en el archivo .show. ` +
      `(slides: ${totalSlides}, layouts: ${totalLayouts}, ` +
      `layout activo: ${activeLayoutId || 'ninguno'})`
    );
  }

  return { title, author, copyright, ccli, slides };
}

module.exports = { parseFreeShow };
