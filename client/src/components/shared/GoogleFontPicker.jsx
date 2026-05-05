import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Search, X, Plus } from 'lucide-react';
import { resolveFont, injectGoogleFont, POPULAR_GOOGLE_FONTS, FONT_CATEGORIES, FONT_PRESETS } from '../../utils/fontUtils';

/** Presets del sistema que no requieren carga externa */
const SYSTEM_PRESETS = [
  { value: 'sans',      label: 'Sans-serif',  css: 'system-ui, sans-serif' },
  { value: 'serif',     label: 'Serif',       css: 'Georgia, serif' },
  { value: 'mono',      label: 'Monospace',   css: 'monospace' },
  { value: 'condensed', label: 'Condensada',  css: 'Arial Narrow, Arial, sans-serif' },
];

function displayName(value) {
  const preset = SYSTEM_PRESETS.find(p => p.value === value);
  return preset ? preset.label : (value || 'Seleccionar fuente…');
}

/**
 * Selector de fuente con soporte Google Fonts.
 * Renderiza de forma inline (sin floating) para evitar problemas de overflow en sidebars.
 *
 * Props:
 *  - label: string — etiqueta a la izquierda
 *  - value: string — valor actual ('sans' | 'serif' | 'mono' | 'condensed' | 'Nombre Fuente Google')
 *  - onChange: (value: string) => void
 */
export default function GoogleFontPicker({ label, value, onChange }) {
  const [open, setOpen]         = useState(false);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('all');
  const searchRef = useRef(null);

  // Focus en el buscador al abrir
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Fuentes filtradas
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return POPULAR_GOOGLE_FONTS.filter(f => {
      const matchCat  = category === 'all' || f.category === category;
      const matchText = f.name.toLowerCase().includes(q);
      return matchCat && matchText;
    });
  }, [search, category]);

  // Precargar previews de las primeras 25 fuentes visibles
  useEffect(() => {
    if (!open) return;
    filtered.slice(0, 25).forEach(f => injectGoogleFont(f.name));
  }, [open, filtered]);

  // Cargar la fuente actual si es Google Font
  useEffect(() => {
    injectGoogleFont(value);
  }, [value]);

  const select = (v) => {
    if (!FONT_PRESETS[v]) injectGoogleFont(v);
    onChange(v);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="space-y-1">
      {/* Trigger */}
      <div className="flex items-center justify-between gap-2">
        {label && <span className="text-xs text-zinc-300 shrink-0">{label}</span>}
        <button
          onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center justify-between gap-1 bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-2 py-1.5 hover:border-accent transition-colors min-w-0"
        >
          <span
            className="truncate"
            style={{ fontFamily: resolveFont(value) }}
          >
            {displayName(value)}
          </span>
          {open ? <ChevronUp size={10} className="shrink-0 text-zinc-400" /> : <ChevronDown size={10} className="shrink-0 text-zinc-400" />}
        </button>
      </div>

      {/* Panel inline */}
      {open && (
        <div className="bg-surface-700 border border-surface-600 rounded overflow-hidden">

          {/* Buscador */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-surface-600">
            <Search size={10} className="text-zinc-500 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar fuente…"
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-zinc-500 hover:text-zinc-300">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Categorías */}
          <div className="flex gap-0.5 px-1.5 py-1 border-b border-surface-600 overflow-x-auto scrollbar-none">
            {FONT_CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`px-1.5 py-0.5 text-[9px] rounded whitespace-nowrap transition-colors ${
                  category === c.value
                    ? 'bg-accent text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Presets del sistema (solo en "Todas" sin búsqueda) */}
          {category === 'all' && !search && (
            <>
              {SYSTEM_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => select(p.value)}
                  className={`w-full flex items-center justify-between px-2.5 py-1 text-xs hover:bg-surface-600 transition-colors ${
                    value === p.value ? 'text-accent' : 'text-zinc-300'
                  }`}
                >
                  <span>{p.label}</span>
                  <span style={{ fontFamily: p.css }} className="text-[11px] text-zinc-400">Aa Bb Cc</span>
                </button>
              ))}
              <div className="border-t border-surface-600 my-0.5" />
            </>
          )}

          {/* Lista de Google Fonts */}
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 && !search.trim() ? (
              <p className="text-center text-[11px] text-zinc-500 py-3">Sin resultados</p>
            ) : (
              filtered.map(f => (
                <button
                  key={f.name}
                  onClick={() => select(f.name)}
                  className={`w-full flex items-center justify-between px-2.5 py-1 text-xs hover:bg-surface-600 transition-colors ${
                    value === f.name ? 'text-accent bg-surface-600' : 'text-zinc-300'
                  }`}
                >
                  <span className="truncate">{f.name}</span>
                  <span
                    style={{ fontFamily: `'${f.name}', sans-serif` }}
                    className="text-[11px] text-zinc-400 shrink-0 ml-2"
                  >
                    Aa
                  </span>
                </button>
              ))
            )}
            {/* Opción para usar cualquier nombre como fuente personalizada */}
            {search.trim() && !FONT_PRESETS[search.trim()] && !POPULAR_GOOGLE_FONTS.some(f => f.name.toLowerCase() === search.trim().toLowerCase()) && (
              <button
                onClick={() => select(search.trim())}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-accent hover:bg-surface-600 transition-colors border-t border-surface-600"
              >
                <Plus size={10} className="shrink-0" />
                <span>Usar &ldquo;<span style={{ fontFamily: `'${search.trim()}', sans-serif` }}>{search.trim()}</span>&rdquo;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
