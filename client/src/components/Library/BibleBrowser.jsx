import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Send, BookOpen, X } from 'lucide-react';
import { usePresenter } from '../../context/usePresenter';
import api from '../../hooks/useApi';
import { openKeyRelayReceiver } from '../../hooks/useKeyboardRelay';

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

  // ── Verso activo (para navegación con teclado) ────────────────────────────
  const [activeVerseIdx,  setActiveVerseIdx]  = useState(null);
  const [pendingChapter,  setPendingChapter]  = useState(null);
  const [pendingVerse,    setPendingVerse]    = useState(null);

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  const [mode,          setMode]          = useState(MODE_BROWSE);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);

  // ── Carga ─────────────────────────────────────────────────────────────────
  const [loadingBooks,   setLoadingBooks]   = useState(false);
  const [loadingChapters,setLoadingChapters]= useState(false);
  const [loadingVerses,  setLoadingVerses]  = useState(false);
  // ── Refs para scroll al versículo activo ─────────────────────────────────
  const verseTextRefs = useRef([]);
  // ─── Cargar versiones ──────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/bible/versions').then(res => {
      setVersions(res.data);
      if (res.data.length > 0) {
        const rv = res.data.find(v =>
          /rvr?60|rv1960/i.test(v.abbreviation) || /rv1960|reina.valera.*1960/i.test(v.name || '')
        );
        setVersionId(String((rv || res.data[0]).id));
      }
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
      if (res.data.length > 0) {
        // Si hay un capítulo pendiente por referencia, usarlo; si no, ir al 1
        const target = pendingChapter && res.data.includes(pendingChapter)
          ? pendingChapter
          : res.data[0];
        setChapter(target);
        setPendingChapter(null);
      }
    }).catch(console.error).finally(() => setLoadingChapters(false));
  }, [book]);

  // ─── Cargar versículos cuando cambia capítulo ─────────────────────────────
  useEffect(() => {
    if (!book || chapter === null) return;
    setLoadingVerses(true);
    setVerses([]);
    setActiveVerseIdx(null);
    api.get(`/bible/${versionId}/books/${book.id}/chapters/${chapter}`).then(res => {
      setVerses(res.data);
      if (pendingVerse) {
        const idx = res.data.findIndex(v => v.verse === pendingVerse);
        if (idx !== -1) {
          setActiveVerseIdx(idx);
          // proyectar ese verso directamente
          const v = res.data[idx];
          sendVerse(v, res.data[idx + 1] || null);
        }
        setPendingVerse(null);
      }
    }).catch(console.error).finally(() => setLoadingVerses(false));
  }, [chapter, book]);

  // ─── Búsqueda ─────────────────────────────────────────────────────────────
  // Intenta interpretar la query como referencia: "Juan 3" / "Gn 1:5" / "Génesis 1"
  const tryNavigateRef = useCallback((q) => {
    // Extraer "nombre [cap[:vers]]"
    const match = q.trim().match(/^(.+?)\s+(\d+)(?::(\d+))?$/);
    if (!match) return false;
    const [, bookQuery, chapStr, verseStr] = match;
    const chapNum = parseInt(chapStr, 10);
    const verseNum = verseStr ? parseInt(verseStr, 10) : null;
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q2 = norm(bookQuery);
    const found = books.find(b =>
      norm(b.name).startsWith(q2) || norm(b.abbrev) === q2
    );
    if (!found) return false;
    // Navegar al libro y capítulo
    setBook(found);
    // El capítulo se carga async; lo fijamos después de que chapters llegue
    // Lo guardamos en un ref temporal a través de estado
    setPendingChapter(chapNum);
    setPendingVerse(verseNum);
    setMode(MODE_BROWSE);
    setSearchQuery('');
    return true;
  }, [books]);

  const doSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    // Primero intentar navegación por referencia
    if (tryNavigateRef(q)) return;
    setMode(MODE_SEARCH);
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
  }, [searchQuery, versionId, tryNavigateRef]);

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') doSearch();
  };

  // ─── Proyectar versículo ───────────────────────────────────────────────────
  const sendVerse = useCallback((v, nextV = null) => {
    actions.showSlide({
      type:      'bible',
      slideData: {
        type:      'bible',
        text:      v.text,
        reference: `${v.book_name} ${v.chapter}:${v.verse}`,
        version:   v.version,
      },
      nextSlideData: nextV ? {
        type:      'bible',
        text:      nextV.text,
        reference: `${nextV.book_name} ${nextV.chapter}:${nextV.verse}`,
      } : null,
    });
  }, [actions]);

  // ─── Navegación desde móvil (via socket) ─────────────────────────────────
  const { navigateRequest } = state;
  useEffect(() => {
    if (!navigateRequest) return;
    const fakeKey = navigateRequest.dir === 'next' ? 'ArrowRight' : 'ArrowLeft';
    if (verses.length === 0) return;
    setActiveVerseIdx(prev => {
      const next = fakeKey === 'ArrowLeft'
        ? (prev === null ? 0 : Math.max(0, prev - 1))
        : (prev === null ? 0 : Math.min(verses.length - 1, prev + 1));
      sendVerse(verses[next], verses[next + 1] || null);
      return next;
    });
  }, [navigateRequest]);

  // ─── Navegación por teclado (Space / ↓ / → = siguiente verso) ─────────────
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault?.(); actions.toggleBlank(true); return;
      }
      if (e.key !== ' ' && e.key !== 'ArrowDown' && e.key !== 'ArrowRight' &&
          e.key !== 'ArrowUp'  && e.key !== 'ArrowLeft') return;
      if (verses.length === 0) return;
      e.preventDefault?.();

      setActiveVerseIdx(prev => {
        let next;
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          next = prev === null ? 0 : Math.max(0, prev - 1);
        } else {
          next = prev === null ? 0 : Math.min(verses.length - 1, prev + 1);
        }
        sendVerse(verses[next], verses[next + 1] || null);
        return next;
      });
    };
    window.addEventListener('keydown', handleKey);
    const relay = openKeyRelayReceiver();
    relay.onmessage = ({ data }) => handleKey(data);
    return () => {
      window.removeEventListener('keydown', handleKey);
      relay.close();
    };
  }, [verses, sendVerse]);

  // ─── Scroll al versículo activo en el texto del capítulo ────────────────
  useEffect(() => {
    if (activeVerseIdx !== null) {
      verseTextRefs.current[activeVerseIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeVerseIdx]);

  // ─── Navegar capítulos ────────────────────────────────────────────────────
  const currentVersionName = versions.find(v => String(v.id) === versionId)?.abbreviation || '';

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Barra superior: versión + búsqueda ───────────────────────────── */}
      <div className="shrink-0 flex gap-2 p-2 border-b border-surface-700">
        <select
          value={versionId}
          onChange={e => setVersionId(e.target.value)}
          className="bg-surface-700 text-zinc-200 text-xs px-2 py-1.5 rounded border border-surface-600 focus:outline-none focus:border-accent w-20 shrink-0"
        >
          {versions.map(v => (
            <option key={v.id} value={v.id}>{v.abbreviation}</option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder='Buscar texto o "Juan 3:16"…'
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            onFocus={() => { if (searchQuery.trim().length >= 3) setMode(MODE_SEARCH); }}
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

      {/* ── Cuerpo principal ─────────────────────────────────────────────── */}
      {mode === MODE_SEARCH ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {searching && <p className="text-zinc-500 text-xs text-center py-8">Buscando…</p>}
          {!searching && searchResults.length === 0 && searchQuery.length >= 3 && (
            <p className="text-zinc-500 text-xs text-center py-8">Sin resultados para "{searchQuery}"</p>
          )}
          {!searching && searchResults.length === 0 && searchQuery.length < 3 && (
            <p className="text-zinc-500 text-xs text-center py-8">Escribe al menos 3 letras y presiona Buscar</p>
          )}
          {searchResults.map(v => (
            <VerseCard key={v.id} verse={v} onSend={sendVerse} showRef />
          ))}
        </div>
      ) : (
        /* Layout 3 paneles: izq libros+capítulos | der versículos */
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── Columna izquierda ──────────────────────────────────────────── */}
          <div className="overflow-y-auto border-r border-surface-700 p-2 space-y-3" style={{ width: '52%' }}>
            <BookGrid books={books} selectedBook={book} onSelect={setBook} />
            {chapters.length > 0 && (
              <div className="border-t border-surface-700 pt-2">
                <ChapterGrid chapters={chapters} selectedChapter={chapter} onSelect={setChapter} />
              </div>
            )}
          </div>

          {/* ── Columna derecha: grilla de versículos ─────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {!book && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                <BookOpen size={32} strokeWidth={1} />
                <p className="text-xs">Selecciona un libro</p>
              </div>
            )}
            {book && !chapter && (
              <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
                Selecciona un capítulo
              </div>
            )}
            {book && chapter && (
              <>
                <div className="shrink-0 px-3 py-1.5 border-b border-surface-700 bg-surface-800">
                  <p className="text-xs font-semibold text-zinc-300">
                    {book.name} {chapter}
                    <span className="text-zinc-500 font-normal"> · {currentVersionName}</span>
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {loadingVerses && <p className="text-zinc-500 text-xs text-center py-8">Cargando…</p>}
                  {!loadingVerses && (
                    <>
                      {/* Grilla de números */}
                      <div className="grid gap-1 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
                        {verses.map((v, idx) => (
                          <button
                            key={v.id}
                            onClick={() => { setActiveVerseIdx(idx); sendVerse(v, verses[idx + 1] || null); }}
                            className={`flex items-center justify-center rounded font-semibold text-base py-2 transition-all
                              ${activeVerseIdx === idx
                                ? 'bg-accent text-white'
                                : 'bg-surface-600 text-zinc-200 hover:bg-surface-500'}`}
                            title={v.text}
                          >
                            {v.verse}
                          </button>
                        ))}
                      </div>

                      {/* Texto completo del capítulo */}
                      <div className="space-y-1">
                        {verses.map((v, idx) => (
                          <div
                            key={`text-${v.id}`}
                            ref={el => { verseTextRefs.current[idx] = el; }}
                            onClick={() => { setActiveVerseIdx(idx); sendVerse(v, verses[idx + 1] || null); }}
                            className={`flex gap-3 text-base py-2 px-3 rounded cursor-pointer transition-colors select-text
                              ${activeVerseIdx === idx
                                ? 'bg-accent/20 text-zinc-100'
                                : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'}`}
                          >
                            <span className="shrink-0 font-bold text-zinc-500 w-6 text-right leading-relaxed">{v.verse}</span>
                            <span className="leading-relaxed font-bold">{v.text}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Color por grupo de libro ─────────────────────────────────────────────────
function bookStyle(num) {
  if (num <= 5)  return { bg: '#92400e', hover: '#78350f' }; // Pentateuco
  if (num <= 17) return { bg: '#78350f', hover: '#6b2f0c' }; // Historia AT
  if (num <= 22) return { bg: '#7c3d12', hover: '#6b3510' }; // Poesía
  if (num <= 27) return { bg: '#9a3412', hover: '#82290e' }; // Profetas mayores
  if (num <= 39) return { bg: '#b45309', hover: '#9a4508' }; // Profetas menores
  if (num <= 44) return { bg: '#1d4ed8', hover: '#1a43c0' }; // Evangelios + Hechos
  if (num <= 52) return { bg: '#6d28d9', hover: '#5b22b8' }; // Cartas de Pablo
  if (num <= 65) return { bg: '#0e7490', hover: '#0b6178' }; // Epístolas generales
  return          { bg: '#15803d', hover: '#126e34' };        // Apocalipsis
}

// ─── Grilla de libros ─────────────────────────────────────────────────────────
function BookGrid({ books, selectedBook, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const ot = books.filter(b => b.book_number <= 39);
  const nt = books.filter(b => b.book_number >= 40);

  const renderBook = (b) => {
    const { bg, hover } = bookStyle(b.book_number);
    const isSelected = selectedBook?.id === b.id;
    const isHov = hovered === b.id;
    return (
      <button
        key={b.id}
        onClick={() => onSelect(b)}
        onMouseEnter={() => setHovered(b.id)}
        onMouseLeave={() => setHovered(null)}
        style={{ backgroundColor: isHov || isSelected ? hover : bg }}
        className={`flex flex-col items-center justify-center rounded text-white transition-all py-2.5 px-1 ${isSelected ? 'ring-2 ring-white ring-inset' : ''}`}
      >
        <span className="font-bold text-base leading-tight">{b.abbrev}</span>
        <span className="text-[10px] leading-tight opacity-80 truncate w-full text-center mt-0.5">{b.name}</span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 px-0.5">Antiguo Testamento</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))' }}>
          {ot.map(renderBook)}
        </div>
      </div>
      <div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 px-0.5">Nuevo Testamento</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))' }}>
          {nt.map(renderBook)}
        </div>
      </div>
    </div>
  );
}

// ─── Grilla de capítulos ──────────────────────────────────────────────────────
function ChapterGrid({ chapters, selectedChapter, onSelect }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
      {chapters.map(c => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className={`flex items-center justify-center rounded font-semibold text-base transition-all py-2
            ${c === selectedChapter
              ? 'bg-accent text-white'
              : 'bg-surface-600 text-zinc-200 hover:bg-surface-500'}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// ─── Tarjeta de versículo ─────────────────────────────────────────────────────
function VerseCard({ verse, onSend, showRef = false, isActive = false }) {
  const { state } = usePresenter();
  const isLive = state.liveState?.type === 'bible' &&
    state.liveState?.slideData?.reference === `${verse.book_name} ${verse.chapter}:${verse.verse}` &&
    state.liveState?.slideData?.version === verse.version;

  return (
    <div
      className={`group relative flex gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-surface-700 transition-colors ${isLive ? 'bg-accent/10 ring-1 ring-accent/40' : isActive ? 'bg-surface-700' : ''}`}
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
