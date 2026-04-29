import { useState, useEffect, useCallback } from 'react';
import { Search, Send, ChevronLeft, ChevronRight, BookOpen, X } from 'lucide-react';
import { usePresenter } from '../../context/usePresenter';
import api from '../../hooks/useApi';

// ─── Modos de vista ───────────────────────────────────────────────────────────
const MODE_BROWSE  = 'browse';
const MODE_SEARCH  = 'search';

export default function BibleBrowser() {
  const { state, actions } = usePresenter();

  // ── Navegación ────────────────────────────────────────────────────────────
  const [versions,  setVersions]  = useState([]);
  const [books,     setBooks]     = useState([]);
  const [chapters,  setChapters]  = useState([]);
  const [verses,    setVerses]    = useState([]);

  const [versionId, setVersionId] = useState('');
  const [book,      setBook]      = useState(null);   // objeto { id, name, abbrev }
  const [chapter,   setChapter]   = useState(null);   // número

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  const [mode,          setMode]          = useState(MODE_BROWSE);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);

  // ── Carga ─────────────────────────────────────────────────────────────────
  const [loadingBooks,   setLoadingBooks]   = useState(false);
  const [loadingChapters,setLoadingChapters]= useState(false);
  const [loadingVerses,  setLoadingVerses]  = useState(false);

  // ─── Cargar versiones ──────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/bible/versions').then(res => {
      setVersions(res.data);
      if (res.data.length > 0) setVersionId(String(res.data[0].id));
    }).catch(console.error);
  }, []);

  // ─── Cargar libros cuando cambia versión ──────────────────────────────────
  useEffect(() => {
    if (!versionId) return;
    setLoadingBooks(true);
    setBooks([]);
    setBook(null);
    setChapters([]);
    setChapter(null);
    setVerses([]);
    api.get(`/bible/${versionId}/books`).then(res => {
      setBooks(res.data);
    }).catch(console.error).finally(() => setLoadingBooks(false));
  }, [versionId]);

  // ─── Cargar capítulos cuando cambia libro ─────────────────────────────────
  useEffect(() => {
    if (!book) return;
    setLoadingChapters(true);
    setChapters([]);
    setChapter(null);
    setVerses([]);
    api.get(`/bible/${versionId}/books/${book.id}/chapters`).then(res => {
      setChapters(res.data);
      if (res.data.length > 0) setChapter(res.data[0]);
    }).catch(console.error).finally(() => setLoadingChapters(false));
  }, [book]);

  // ─── Cargar versículos cuando cambia capítulo ─────────────────────────────
  useEffect(() => {
    if (!book || chapter === null) return;
    setLoadingVerses(true);
    setVerses([]);
    api.get(`/bible/${versionId}/books/${book.id}/chapters/${chapter}`).then(res => {
      setVerses(res.data);
    }).catch(console.error).finally(() => setLoadingVerses(false));
  }, [chapter, book]);

  // ─── Búsqueda ─────────────────────────────────────────────────────────────
  const doSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const params = new URLSearchParams({ q });
      if (versionId) params.set('versionId', versionId);
      const res = await api.get(`/bible/search?${params}`);
      setSearchResults(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, versionId]);

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') doSearch();
  };

  // ─── Proyectar versículo ───────────────────────────────────────────────────
  const sendVerse = (v) => {
    actions.showSlide({
      type:      'bible',
      text:      v.text,
      reference: `${v.book_name} ${v.chapter}:${v.verse}`,
      version:   v.version,
    });
  };

  // ─── Navegar capítulos ────────────────────────────────────────────────────
  const prevChapter = () => {
    const idx = chapters.indexOf(chapter);
    if (idx > 0) setChapter(chapters[idx - 1]);
  };
  const nextChapter = () => {
    const idx = chapters.indexOf(chapter);
    if (idx < chapters.length - 1) setChapter(chapters[idx + 1]);
  };

  const currentVersionName = versions.find(v => String(v.id) === versionId)?.abbreviation || '';

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Barra de herramientas ─────────────────────────────────────────── */}
      <div className="shrink-0 p-3 border-b border-surface-700 space-y-2">
        {/* Fila 1: version + libro + capítulo */}
        <div className="flex gap-2">
          {/* Versión */}
          <select
            value={versionId}
            onChange={e => setVersionId(e.target.value)}
            className="bg-surface-700 text-zinc-200 text-xs px-2 py-1.5 rounded border border-surface-600 focus:outline-none focus:border-accent w-24 shrink-0"
          >
            {versions.map(v => (
              <option key={v.id} value={v.id}>{v.abbreviation}</option>
            ))}
          </select>

          {/* Libro */}
          <select
            value={book?.id || ''}
            onChange={e => {
              const b = books.find(b => String(b.id) === e.target.value);
              setBook(b || null);
            }}
            disabled={loadingBooks || books.length === 0}
            className="bg-surface-700 text-zinc-200 text-xs px-2 py-1.5 rounded border border-surface-600 focus:outline-none focus:border-accent flex-1 disabled:opacity-50"
          >
            {books.length === 0
              ? <option value="">— Libro —</option>
              : books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
            }
          </select>

          {/* Capítulo */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={prevChapter}
              disabled={!chapter || chapters.indexOf(chapter) === 0}
              className="p-1 rounded bg-surface-700 hover:bg-surface-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} className="text-zinc-300" />
            </button>
            <select
              value={chapter ?? ''}
              onChange={e => setChapter(Number(e.target.value))}
              disabled={loadingChapters || chapters.length === 0}
              className="bg-surface-700 text-zinc-200 text-xs px-2 py-1.5 rounded border border-surface-600 focus:outline-none focus:border-accent w-16 disabled:opacity-50"
            >
              {chapters.length === 0
                ? <option value="">—</option>
                : chapters.map(c => <option key={c} value={c}>{c}</option>)
              }
            </select>
            <button
              onClick={nextChapter}
              disabled={!chapter || chapters.indexOf(chapter) === chapters.length - 1}
              className="p-1 rounded bg-surface-700 hover:bg-surface-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} className="text-zinc-300" />
            </button>
          </div>
        </div>

        {/* Fila 2: búsqueda */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar versículo (min 3 letras)…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              onFocus={() => setMode(MODE_SEARCH)}
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-surface-700 border border-surface-600 rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults([]); setMode(MODE_BROWSE); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={doSearch}
            disabled={searchQuery.trim().length < 3 || searching}
            className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed font-medium shrink-0"
          >
            {searching ? '…' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* ── Contenido ────────────────────────────────────────────────────────── */}
      {mode === MODE_SEARCH ? (
        // ── Vista: resultados de búsqueda ──────────────────────────────────
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {searching && (
            <p className="text-zinc-500 text-xs text-center py-8">Buscando…</p>
          )}
          {!searching && searchResults.length === 0 && searchQuery.length >= 3 && (
            <p className="text-zinc-500 text-xs text-center py-8">Sin resultados para "{searchQuery}"</p>
          )}
          {!searching && searchResults.length === 0 && searchQuery.length < 3 && (
            <p className="text-zinc-500 text-xs text-center py-8">Escribe al menos 3 letras y presiona Buscar</p>
          )}
          {searchResults.map(v => (
            <VerseCard key={`${v.id}`} verse={v} onSend={sendVerse} showRef />
          ))}
        </div>
      ) : (
        // ── Vista: navegación por libro/capítulo ───────────────────────────
        <div className="flex-1 overflow-y-auto">
          {!book && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
              <BookOpen size={40} strokeWidth={1} />
              <p className="text-sm">Selecciona un libro para comenzar</p>
            </div>
          )}
          {book && loadingVerses && (
            <p className="text-zinc-500 text-xs text-center py-8">Cargando versículos…</p>
          )}
          {book && !loadingVerses && verses.length === 0 && (
            <p className="text-zinc-500 text-xs text-center py-8">No hay versículos</p>
          )}
          {book && !loadingVerses && verses.length > 0 && (
            <>
              {/* Encabezado capítulo */}
              <div className="sticky top-0 bg-surface-800 px-4 py-2 border-b border-surface-700 z-10">
                <h3 className="text-sm font-semibold text-zinc-200">
                  {book.name} {chapter} <span className="text-zinc-500 font-normal text-xs">· {currentVersionName} · {verses.length} versículos</span>
                </h3>
              </div>
              <div className="p-2 space-y-1">
                {verses.map(v => (
                  <VerseCard key={v.id} verse={v} onSend={sendVerse} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tarjeta de versículo ─────────────────────────────────────────────────────
function VerseCard({ verse, onSend, showRef = false }) {
  const { state } = usePresenter();
  const isLive = state.liveState?.type === 'bible' &&
    state.liveState?.slideData?.reference === `${verse.book_name} ${verse.chapter}:${verse.verse}`;

  return (
    <div
      className={`group relative flex gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-surface-700 transition-colors ${isLive ? 'bg-accent/10 ring-1 ring-accent/40' : ''}`}
      onClick={() => onSend(verse)}
    >
      {/* Número de versículo */}
      <span className={`shrink-0 text-xs font-bold w-5 text-right pt-0.5 ${isLive ? 'text-accent' : 'text-zinc-600'}`}>
        {verse.verse}
      </span>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        {showRef && (
          <p className="text-xs text-zinc-500 mb-0.5">
            {verse.book_name} {verse.chapter}:{verse.verse} · {verse.version}
          </p>
        )}
        <p className={`text-sm leading-relaxed ${isLive ? 'text-white' : 'text-zinc-300'}`}>
          {verse.text}
        </p>
      </div>

      {/* Botón enviar (visible en hover o cuando está en vivo) */}
      <button
        onClick={(e) => { e.stopPropagation(); onSend(verse); }}
        className={`shrink-0 self-center p-1.5 rounded transition-all ${
          isLive
            ? 'opacity-100 bg-accent text-white'
            : 'opacity-0 group-hover:opacity-100 bg-surface-600 text-zinc-300 hover:bg-accent hover:text-white'
        }`}
        title="Enviar a pantalla"
      >
        <Send size={12} />
      </button>

      {/* Indicador en vivo */}
      {isLive && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-4 bg-accent rounded-full" />
      )}
    </div>
  );
}
