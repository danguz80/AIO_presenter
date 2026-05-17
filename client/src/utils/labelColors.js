/**
 * Colores de etiquetas de sección que responden al tema de la app.
 * Usa variables CSS definidas por tema en index.css.
 *
 * Roles:
 *   --label-a  → coro, intro       (color principal del tema)
 *   --label-b  → verso             (variante fría)
 *   --label-c  → pre-coro, puente  (variante media/cálida)
 *   --label-d  → outro, final, tag (variante complementaria)
 *   --label-n  → titulo            (neutro)
 */

const LABEL_MAP = {
  intro:      'a',
  verso:      'b',
  'pre-coro': 'c',
  precoro:    'c',
  coro:       'a',
  puente:     'c',
  bridge:     'c',
  outro:      'd',
  final:      'd',
  tag:        'd',
  titulo:     'n',
  title:      'n',
  título:     'n',
};

function normalizeKey(label) {
  if (!label) return null;
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\d+$/, '')
    .trim();
}

/**
 * Devuelve el color hex de la etiqueta leyendo las CSS vars del tema activo.
 * Funciona con inline styles.
 */
export function getLabelColor(label) {
  const key  = normalizeKey(label);
  const role = key ? (LABEL_MAP[key] ?? 'd') : 'n';
  const varName = `--label-${role}`;
  if (typeof window !== 'undefined') {
    const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (val) return val;
  }
  // Fallback hardcoded (tema oscuro)
  const fallback = { a: '#9333ea', b: '#2563eb', c: '#c026d3', d: '#e11d48', n: '#52525b' };
  return fallback[role] ?? '#52525b';
}
