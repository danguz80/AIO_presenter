import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Send, BookOpen, X, Upload, Loader2, Trash2, Clock } from 'lucide-react';
import { usePresenter } from '../../context/usePresenter';
import api from '../../hooks/useApi';
import { openKeyRelayReceiver } from '../../hooks/useKeyboardRelay';
import { splitBibleVerseSmart } from '../../utils/bibleSplit';

// ─── Modos de vista ───────────────────────────────────────────────────────────
const MODE_BROWSE  = 'browse';
const MODE_SEARCH  = 'search';
const MODE_HISTORY = 'history';

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
  const [pendingHighlight, setPendingHighlight] = useState(null); // highlight-only (no proyectar)

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  const [mode,          setMode]          = useState(MODE_BROWSE);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [verseHistory,  setVerseHistory]  = useState([]); // historial reciente proyectado
  const [pendingHistoryVerse, setPendingHistoryVerse] = useState(null);

  // ── Importar nueva versión ────────────────────────────────────────────────
  const [showImport,    setShowImport]    = useState(false);
  const [impFile,       setImpFile]       = useState(null);
  const [impAbbrev,     setImpAbbrev]     = useState('');
  const [impName,       setImpName]       = useState('');
  const [impLang,       setImpLang]       = useState('es');
  const [impLoading,    setImpLoading]    = useState(false);
  const [impError,      setImpError]      = useState('');
  const [impResult,     setImpResult]     = useState(null);
  const fileInputRef = useRef(null);
  // ── Borrar versión ─────────────────────────────────────────────────
  const [deleting,      setDeleting]      = useState(false);
  const [delConfirm,    setDelConfirm]    = useState(false);
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
      if (pendingChapter && res.data.includes(pendingChapter)) {
        // Solo auto-seleccionar si viene de una referencia (ej: "Juan 3")
        setChapter(pendingChapter);
        setPendingChapter(null);
      }
      // Si no hay pendingChapter, dejar que el usuario elija el capítulo
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
      } else if (pendingHighlight !== null) {
        const idx = res.data.findIndex(v => v.verse === pendingHighlight);
        if (idx !== -1) setActiveVerseIdx(idx);
        setPendingHighlight(null);
      }
    }).catch(console.error).finally(() => setLoadingVerses(false));
  }, [chapter, book]);

  // ─── Borrar versión bíblica ─────────────────────────────────────
  const handleDelete = async () => {
    if (!versionId) return;
    setDeleting(true);
    try {
      const base  = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
      const token = localStorage.getItem('aio_sync_token');
      const res   = await fetch(`${base}/bible/versions/${versionId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        api.get('/bible/versions').then(r => {
          setVersions(r.data);
          if (r.data.length > 0) setVersionId(String(r.data[0].id));
        }).catch(() => {});
      }
    } catch (_) {}
    setDeleting(false);
    setDelConfirm(false);
  };

  // ─── Importar versión bíblica ─────────────────────────────────────────────
  const handleImport = async () => {
    if (!impFile || !impAbbrev.trim() || !impName.trim()) return;
    setImpLoading(true); setImpError(''); setImpResult(null);
    try {
      const fd = new FormData();
      fd.append('file', impFile);
      fd.append('abbreviation', impAbbrev.trim().toUpperCase());
      fd.append('name', impName.trim());
      fd.append('language', impLang);
      // Usar fetch nativo para multipart — axios default Content-Type interfiere con FormData
      const base  = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
      const token = localStorage.getItem('aio_sync_token');
      const res   = await fetch(`${base}/bible/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd, // browser sets correct Content-Type + boundary
      });
      const data = await res.json();
      if (!res.ok) { setImpError(data.error || 'Error al importar'); }
      else {
        setImpResult(data);
        setImpFile(null); setImpAbbrev(''); setImpName(''); setImpLang('es');
        api.get('/bible/versions').then(r => {
          setVersions(r.data);
          const newV = r.data.find(v => v.abbreviation === data.abbreviation);
          if (newV) setVersionId(String(newV.id));
        }).catch(() => {});
      }
    } catch (e) { setImpError('No se pudo conectar al servidor'); }
    setImpLoading(false);
  };

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

  // ─── Navegar desde historial al contexto del capítulo ───────────────────
  const navigateToVerseInContext = useCallback((histVerse) => {
    if (!histVerse) return;
    const targetVersion = versions.find(v =>
      String(v.abbreviation || '').toLowerCase() === String(histVerse.version || '').toLowerCase()
    );

    // Si el historial apunta a otra versión, cambiar versión y reintentar cuando carguen libros.
    if (targetVersion && String(targetVersion.id) !== String(versionId)) {
      setPendingHistoryVerse(histVerse);
      setMode(MODE_BROWSE);
      setVersionId(String(targetVersion.id));
      return;
    }

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const foundBook = books.find(b => norm(b.name) === norm(histVerse.book_name) || norm(b.abbrev) === norm(histVerse.book_name));
    if (!foundBook) {
      setPendingHistoryVerse(histVerse);
      setMode(MODE_BROWSE);
      return;
    }

    setMode(MODE_BROWSE);
    setBook(foundBook);
    setPendingHighlight(null);
    setPendingChapter(Number(histVerse.chapter));
    setPendingVerse(Number(histVerse.verse));
  }, [books, versions, versionId]);

  // Reintenta la navegación del historial cuando ya cambió versión/cargaron libros.
  useEffect(() => {
    if (!pendingHistoryVerse) return;
    const targetVersion = versions.find(v =>
      String(v.abbreviation || '').toLowerCase() === String(pendingHistoryVerse.version || '').toLowerCase()
    );
    if (targetVersion && String(targetVersion.id) !== String(versionId)) return;

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const foundBook = books.find(b => norm(b.name) === norm(pendingHistoryVerse.book_name) || norm(b.abbrev) === norm(pendingHistoryVerse.book_name));
    if (!foundBook) return;

    setMode(MODE_BROWSE);
    setBook(foundBook);
    setPendingHighlight(null);
    setPendingChapter(Number(pendingHistoryVerse.chapter));
    setPendingVerse(Number(pendingHistoryVerse.verse));
    setPendingHistoryVerse(null);
  }, [pendingHistoryVerse, versions, versionId, books]);

  // ─── Cola de páginas para versículos largos ───────────────────────────────
  const pageQueueRef  = useRef([]); // { text, reference, version, nextSlideData }[]
  const maxLinesRef   = useRef(0);  // siempre tiene el valor actual sin recrear sendVerse
  maxLinesRef.current = state.outputConfig?.bibleMaxLines ?? 0;

  // ─── Proyectar versículo con soporte de split por máx. líneas ─────────────
  const sendVerse = useCallback((v, nextV = null) => {
    const maxLines     = maxLinesRef.current;
    const charsPerLine = 46;

    const baseRef = `${v.book_name} ${v.chapter}:${v.verse}`;
    const pages = splitBibleVerseSmart(v.text, maxLines, {
      charsPerLine,
      minFirstLines: 4,
      minSecondLines: 2,
    });
    const safePages = pages.length ? pages : [v.text];
    const total   = safePages.length;
    const pageRef = (i) => total > 1 ? `${baseRef} (${i + 1}/${total})` : baseRef;
    const nextVSD = nextV ? { type: 'bible', text: nextV.text, reference: `${nextV.book_name} ${nextV.chapter}:${nextV.verse}` } : null;

    actions.showSlide({
      type:      'bible',
      slideData: {
        type:      'bible',
        text:      safePages[0],
        fullText:  v.text,
        reference: pageRef(0),
        fullReference: baseRef,
        version:   v.version,
      },
      nextSlideData: total > 1 && safePages[1]
        ? { type: 'bible', text: safePages[1], fullText: v.text, reference: pageRef(1), fullReference: baseRef, version: v.version }
        : nextVSD,
    });

    // Guardar páginas 2..N en la cola
    pageQueueRef.current = safePages.slice(1).map((text, i) => ({
      text,
      fullText: v.text,
      reference: pageRef(i + 1),
      fullReference: baseRef,
      version: v.version,
      nextSlideData: i + 2 < total
        ? { type: 'bible', text: safePages[i + 2], fullText: v.text, reference: pageRef(i + 2), fullReference: baseRef, version: v.version }
        : nextVSD,
    }));

    // Historial local: mover el versículo al tope (sin duplicar por id)
    setVerseHistory(prev => {
      const entry = { ...v, ref: `${v.book_name} ${v.chapter}:${v.verse}`, ts: Date.now() };
      return [entry, ...prev.filter(h => h.id !== v.id)].slice(0, 80);
    });
  }, [actions]); // maxLinesRef siempre fresco, no necesita dep

  // ─── Navegación desde móvil (via socket) ─────────────────────────────────
  const { navigateRequest } = state;
  useEffect(() => {
    if (!navigateRequest) return;
    const isNext = navigateRequest.dir === 'next';
    if (verses.length === 0) return;
    // Páginas pendientes (solo en avance)
    if (isNext && pageQueueRef.current.length > 0) {
      const [page, ...rest] = pageQueueRef.current;
      pageQueueRef.current = rest;
      actions.showSlide({
        type: 'bible',
        slideData: {
          type: 'bible',
          text: page.text,
          fullText: page.fullText,
          reference: page.reference,
          fullReference: page.fullReference,
          version: page.version,
        },
        nextSlideData: page.nextSlideData || null,
      });
      return;
    }
    pageQueueRef.current = [];
    setActiveVerseIdx(prev => {
      const next = !isNext
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
        const isNext = e.key !== 'ArrowUp' && e.key !== 'ArrowLeft';
        // Páginas pendientes del versículo actual (solo en avance)
        if (isNext && pageQueueRef.current.length > 0) {
          const [page, ...rest] = pageQueueRef.current;
          pageQueueRef.current = rest;
          actions.showSlide({
            type: 'bible',
            slideData: {
              type: 'bible',
              text: page.text,
              fullText: page.fullText,
              reference: page.reference,
              fullReference: page.fullReference,
              version: page.version,
            },
            nextSlideData: page.nextSlideData || null,
          });
          return prev; // no avanzar el índice
        }
        pageQueueRef.current = [];
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

  // ─── Auto-navegar cuando se proyecta un versículo desde el móvil ────────
  const liveRef = state.liveState?.slideData?.reference;
  const lastNavigatedRef = useRef(null);
  useEffect(() => {
    const sd = state.liveState?.slideData;
    if (sd?.type !== 'bible' || !sd?.reference) return;
    if (!books.length) return;
    // Ignorar referencias de páginas internas (ej: "Juan 3:16 (2/3)")
    if (/\(\d+\/\d+\)$/.test(sd.reference.trim())) return;
    if (lastNavigatedRef.current === sd.reference) return; // ya navegado

    const match = sd.reference.trim().match(/^(.+?)\s+(\d+):(\d+)$/);
    if (!match) return;
    const [, bookName, chapStr, verseStr] = match;
    const chapNum  = parseInt(chapStr,  10);
    const verseNum = parseInt(verseStr, 10);

    const norm  = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const found = books.find(b => norm(b.name) === norm(bookName) || norm(b.abbrev) === norm(bookName));
    if (!found) return;

    lastNavigatedRef.current = sd.reference;

    if (book?.id === found.id && chapter === chapNum && verses.length > 0) {
      const idx = verses.findIndex(v => v.verse === verseNum);
      if (idx !== -1) setActiveVerseIdx(idx);
    } else {
      setPendingHighlight(verseNum);
      setPendingChapter(chapNum);
      setBook(found);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRef, books.length]);

  // ─── Navegar capítulos ────────────────────────────────────────────────────
  const currentVersionName = versions.find(v => String(v.id) === versionId)?.abbreviation || '';

  return (
    <div className="flex flex-col h-full overflow-hidden relative">

      {/* ── Modal de importar versión ─────────────────────────────────────── */}
      {showImport && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowImport(false); setImpError(''); setImpResult(null); } }}
        >
          <div className="bg-surface-800 border border-surface-600 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col gap-3 p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white flex items-center gap-1.5"><BookOpen size={14} className="text-accent" /> Importar versión bíblica</span>
              <button onClick={() => { setShowImport(false); setImpError(''); setImpResult(null); }} className="text-zinc-500 hover:text-white"><X size={15} /></button>
            </div>

            {impResult ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-green-400 text-sm font-semibold">✓ Importado correctamente</p>
                <p className="text-zinc-400 text-xs">{impResult.name} ({impResult.abbreviation})</p>
                <p className="text-zinc-500 text-xs">{impResult.versesImported?.toLocaleString()} versículos en {impResult.booksImported} libros</p>
                <button onClick={() => { setShowImport(false); setImpResult(null); }} className="mt-2 px-4 py-1.5 bg-accent text-white text-xs rounded-lg">Cerrar</button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {/* Archivo — input fuera del label para evitar doble disparo del picker */}
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Archivo JSON o XML *</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-surface-700 border border-surface-600 rounded-lg hover:border-accent transition-colors text-left"
                    >
                      <Upload size={13} className="text-zinc-400 shrink-0" />
                      <span className="text-xs text-zinc-400 truncate">
                        {impFile ? impFile.name : 'Seleccionar archivo .json o .xml…'}
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,.xml"
                      className="hidden"
                      onChange={e => { setImpFile(e.target.files[0] || null); setImpError(''); setImpResult(null); }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Abreviatura *</span>
                      <input value={impAbbrev} onChange={e => setImpAbbrev(e.target.value)} placeholder="Ej: NVI"
                        className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Idioma</span>
                      <select value={impLang} onChange={e => setImpLang(e.target.value)}
                        className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent">
                        <option value="es">Español</option>
                        <option value="en">Inglés</option>
                        <option value="pt">Portugués</option>
                        <option value="fr">Francés</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1">Nombre completo *</span>
                    <input value={impName} onChange={e => setImpName(e.target.value)} placeholder="Ej: Nueva Versión Internacional"
                      className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent" />
                  </div>
                  <p className="text-[10px] text-zinc-600 leading-snug">
                    <span className="text-zinc-400 font-semibold">JSON:</span> thiagobodruk/bible o formato unificado.<br/>
                    <span className="text-zinc-400 font-semibold">XML:</span> Zefania, OSIS, o XML genérico.
                  </p>
                </div>
                {impError && <p className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1.5">{impError}</p>}
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={impLoading || !impFile || !impAbbrev.trim() || !impName.trim()}
                  className="flex items-center justify-center gap-2 py-2 bg-accent text-white text-xs font-semibold rounded-lg hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {impLoading ? <><Loader2 size={13} className="animate-spin" /> Importando…</> : <><Upload size={13} /> Importar versión</>}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Barra superior: versión + búsqueda ───────────────────────────── */}
      <div className="shrink-0 flex gap-2 p-2 border-b border-surface-700">
        <div className="flex items-center gap-1 shrink-0">
          <select
            value={versionId}
            onChange={e => {
              if (e.target.value === '__import__') {
                setShowImport(true);
                setImpError(''); setImpResult(null);
              } else {
                setVersionId(e.target.value);
              }
            }}
            className="bg-surface-700 text-zinc-200 text-xs px-2 py-1.5 rounded border border-surface-600 focus:outline-none focus:border-accent w-24"
          >
            {versions.map(v => (
              <option key={v.id} value={v.id}>{v.abbreviation}</option>
            ))}
            <option disabled>─────</option>
            <option value="__import__">+ Agregar…</option>
          </select>
          {/* Botón borrar versión actual */}
          {versions.length > 1 && (
            delConfirm ? (
              <div className="flex items-center gap-1">
                <button onClick={handleDelete} disabled={deleting}
                  className="px-2 py-1 text-[10px] bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50">
                  {deleting ? '…' : 'Confirmar'}
                </button>
                <button onClick={() => setDelConfirm(false)} className="px-2 py-1 text-[10px] bg-surface-700 text-zinc-400 hover:text-white rounded transition-colors">✕</button>
              </div>
            ) : (
              <button onClick={() => setDelConfirm(true)} title="Eliminar versión actual"
                className="p-1.5 rounded bg-surface-700 border border-surface-600 text-zinc-500 hover:text-red-400 hover:border-red-500 transition-colors">
                <Trash2 size={12} />
              </button>
            )
          )}
        </div>

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
          onClick={() => setMode(m => m === MODE_HISTORY ? MODE_BROWSE : MODE_HISTORY)}
          title="Historial de versículos"
          className={`p-1.5 rounded border transition-colors shrink-0 ${
            mode === MODE_HISTORY
              ? 'bg-accent/20 border-accent/40 text-accent'
              : 'bg-surface-700 border-surface-600 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock size={13} />
        </button>
        <button
          onClick={doSearch}
          disabled={searchQuery.trim().length < 3 || searching}
          className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed font-medium shrink-0"
        >
          {searching ? '…' : 'Buscar'}
        </button>
      </div>

      {/* ── Cuerpo principal ─────────────────────────────────────────────── */}
      {mode === MODE_HISTORY ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {(() => {
            const cutoff = Date.now() - 30 * 60 * 1000;
            const recent = verseHistory.filter(h => h.ts >= cutoff);
            if (recent.length === 0) {
              return <p className="text-zinc-500 text-xs text-center py-8">Sin versículos proyectados en los últimos 30 min</p>;
            }
            return recent.map(h => (
              <div key={`${h.id}-${h.ts}`} className="relative">
                <VerseCard verse={h} onSend={navigateToVerseInContext} showRef />
                <span className="absolute top-1.5 right-2 text-[10px] text-zinc-500 pointer-events-none">
                  {new Date(h.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ));
          })()}
        </div>
      ) : mode === MODE_SEARCH ? (
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
        <span className="font-bold text-base leading-tight">{b.abbrev || b.name.slice(0,3).toUpperCase()}</span>
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
