/**
 * Utilidades compartidas de fuentes.
 * Usadas por OutputPage, StagePage, LivePreview y los controles de configuración.
 */

/** Fuentes del sistema (sin carga externa) */
export const FONT_PRESETS = {
  sans:      'system-ui, sans-serif',
  serif:     'Georgia, serif',
  mono:      'monospace',
  condensed: 'Arial Narrow, Arial, sans-serif',
};

/**
 * Resuelve un nombre de fuente a un string CSS válido para font-family.
 * Si es un preset del sistema lo devuelve tal cual; si no, asume Google Font.
 */
export function resolveFont(family) {
  if (!family) return FONT_PRESETS.sans;
  return FONT_PRESETS[family] ?? `'${family}', system-ui, sans-serif`;
}

/**
 * Inyecta un @import de Google Fonts al <head> para cargar la fuente indicada.
 * Idempotente: no hace nada si la fuente ya está cargada.
 */
export function injectGoogleFont(name) {
  if (!name || FONT_PRESETS[name]) return;
  const id = `gf-${name.toLowerCase().replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id   = id;
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  document.head.appendChild(link);
}

/** Lista curada de fuentes populares de Google Fonts */
export const POPULAR_GOOGLE_FONTS = [
  // Sans-Serif
  { name: 'Inter',                category: 'sans-serif' },
  { name: 'Roboto',               category: 'sans-serif' },
  { name: 'Open Sans',            category: 'sans-serif' },
  { name: 'Lato',                 category: 'sans-serif' },
  { name: 'Montserrat',           category: 'sans-serif' },
  { name: 'Poppins',              category: 'sans-serif' },
  { name: 'Nunito',               category: 'sans-serif' },
  { name: 'Raleway',              category: 'sans-serif' },
  { name: 'Ubuntu',               category: 'sans-serif' },
  { name: 'Oswald',               category: 'sans-serif' },
  { name: 'Barlow',               category: 'sans-serif' },
  { name: 'Mulish',               category: 'sans-serif' },
  { name: 'Quicksand',            category: 'sans-serif' },
  { name: 'DM Sans',              category: 'sans-serif' },
  { name: 'Outfit',               category: 'sans-serif' },
  { name: 'Figtree',              category: 'sans-serif' },
  { name: 'Plus Jakarta Sans',    category: 'sans-serif' },
  { name: 'Work Sans',            category: 'sans-serif' },
  { name: 'Josefin Sans',         category: 'sans-serif' },
  { name: 'Exo 2',                category: 'sans-serif' },
  { name: 'Titillium Web',        category: 'sans-serif' },
  { name: 'Roboto Condensed',     category: 'sans-serif' },
  { name: 'Barlow Condensed',     category: 'sans-serif' },
  { name: 'Noto Sans',            category: 'sans-serif' },
  { name: 'Source Sans 3',        category: 'sans-serif' },
  { name: 'Hind',                 category: 'sans-serif' },
  { name: 'Karla',                category: 'sans-serif' },
  { name: 'Cabin',                category: 'sans-serif' },
  { name: 'Manrope',              category: 'sans-serif' },
  { name: 'Rubik',                category: 'sans-serif' },
  // Serif
  { name: 'Playfair Display',     category: 'serif' },
  { name: 'Merriweather',         category: 'serif' },
  { name: 'Lora',                 category: 'serif' },
  { name: 'PT Serif',             category: 'serif' },
  { name: 'Noto Serif',           category: 'serif' },
  { name: 'Libre Baskerville',    category: 'serif' },
  { name: 'EB Garamond',          category: 'serif' },
  { name: 'Cormorant Garamond',   category: 'serif' },
  { name: 'Crimson Text',         category: 'serif' },
  { name: 'Source Serif 4',       category: 'serif' },
  { name: 'Bitter',               category: 'serif' },
  { name: 'Spectral',             category: 'serif' },
  { name: 'Vollkorn',             category: 'serif' },
  { name: 'Domine',               category: 'serif' },
  { name: 'Zilla Slab',           category: 'serif' },
  // Display / Impacto
  { name: 'Bebas Neue',           category: 'display' },
  { name: 'Anton',                category: 'display' },
  { name: 'Abril Fatface',        category: 'display' },
  { name: 'Righteous',            category: 'display' },
  { name: 'Bangers',              category: 'display' },
  { name: 'Sigmar One',           category: 'display' },
  { name: 'Alfa Slab One',        category: 'display' },
  { name: 'Fjalla One',           category: 'display' },
  { name: 'Passion One',          category: 'display' },
  { name: 'Lilita One',           category: 'display' },
  { name: 'Secular One',          category: 'display' },
  { name: 'Ultra',                category: 'display' },
  { name: 'Black Han Sans',       category: 'display' },
  { name: 'Kanit',                category: 'display' },
  { name: 'Boogaloo',             category: 'display' },
  { name: 'Comfortaa',            category: 'display' },
  { name: 'Lobster',              category: 'display' },
  { name: 'Pacifico',             category: 'display' },
  { name: 'Permanent Marker',     category: 'display' },
  { name: 'Fredoka One',          category: 'display' },
  { name: 'Baloo 2',              category: 'display' },
  { name: 'Nunito Sans',          category: 'display' },
  { name: 'Staatliches',          category: 'display' },
  { name: 'Big Shoulders Display',category: 'display' },
  // Caligrafía / Handwriting
  { name: 'Dancing Script',       category: 'handwriting' },
  { name: 'Caveat',               category: 'handwriting' },
  { name: 'Sacramento',           category: 'handwriting' },
  { name: 'Great Vibes',          category: 'handwriting' },
  { name: 'Satisfy',              category: 'handwriting' },
  { name: 'Parisienne',           category: 'handwriting' },
  { name: 'Kaushan Script',       category: 'handwriting' },
  { name: 'Courgette',            category: 'handwriting' },
  { name: 'Allura',               category: 'handwriting' },
  { name: 'Pinyon Script',        category: 'handwriting' },
  { name: 'Tangerine',            category: 'handwriting' },
  { name: 'Alex Brush',           category: 'handwriting' },
  { name: 'Cookie',               category: 'handwriting' },
  // Monospace
  { name: 'Roboto Mono',          category: 'monospace' },
  { name: 'Source Code Pro',      category: 'monospace' },
  { name: 'Space Mono',           category: 'monospace' },
  { name: 'Fira Code',            category: 'monospace' },
  { name: 'JetBrains Mono',       category: 'monospace' },
  { name: 'IBM Plex Mono',        category: 'monospace' },
  { name: 'Courier Prime',        category: 'monospace' },
  { name: 'Share Tech Mono',      category: 'monospace' },
];

export const FONT_CATEGORIES = [
  { value: 'all',         label: 'Todas' },
  { value: 'sans-serif',  label: 'Sans' },
  { value: 'serif',       label: 'Serif' },
  { value: 'display',     label: 'Display' },
  { value: 'handwriting', label: 'Caligrafía' },
  { value: 'monospace',   label: 'Mono' },
];
