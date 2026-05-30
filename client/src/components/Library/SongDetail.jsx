import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { Music, ZoomIn, ZoomOut, LayoutList, LayoutGrid } from 'lucide-react';
import { openKeyRelayReceiver } from '../../hooks/useKeyboardRelay';
import { stripChords, stripComments, isCommentLine, extractInlineComment } from '../../utils/chordUtils';
import { resolveFont, injectGoogleFont } from '../../utils/fontUtils';
import { getLabelColor } from '../../utils/labelColors';

export default function SongDetail() {
  const { state, actions } = usePresenter();
  const { selectedSong, selectedSlide, liveState, navigateRequest, schedule, eventPlays, eventPlaysContext } = state;

  // Config del proyector para reflejar en thumbnails
  const outputCfg      = state.outputConfig ?? {};
  const thumbColor     = outputCfg.lyricsColor  ?? '#ffffff';
  const thumbFontFamily = resolveFont(outputCfg.fontFamily ?? 'sans');
  const thumbBold      = outputCfg.fontBold  ?? false;
  const thumbItalic    = outputCfg.fontItalic ?? false;

  // Inyectar Google Fonts para thumbnails
  useEffect(() => {
    injectGoogleFont(outputCfg.fontFamily);
    injectGoogleFont(outputCfg.titleFontFamily);
    injectGoogleFont(outputCfg.artistFontFamily);
  }, [outputCfg.fontFamily, outputCfg.titleFontFamily, outputCfg.artistFontFamily]);

  // ── Estructura activa (misma lógica que cancionero) ───────────────────────
  const [activeStructIdx, setActiveStructIdx] = useState(0);
  // Reiniciar índice al cambiar de canción y cargar el guardado en localStorage
  useEffect(() => {
    if (!selectedSong?.id) return;
    const saved = localStorage.getItem(`aio_active_struct_${selectedSong.id}`);
    setActiveStructIdx(saved !== null ? Math.max(0, parseInt(saved, 10)) : 0);
  }, [selectedSong?.id]);
  useEffect(() => {
    if (!selectedSong?.id) return;
    localStorage.setItem(`aio_active_struct_${selectedSong.id}`, String(activeStructIdx));
  }, [activeStructIdx, selectedSong?.id]);

  const allStructures = useMemo(() => {
    if (!selectedSong) return [];
    if (Array.isArray(selectedSong.structures) && selectedSong.structures.length > 0)
      return selectedSong.structures;
    if (Array.isArray(selectedSong.structure) && selectedSong.structure.length > 0)
      return [{ name: 'Estructura 1', items: selectedSong.structure }];
    return [];
  }, [selectedSong?.id, selectedSong?.structures, selectedSong?.structure]);

  const orderedSlides = useMemo(() => {
    const rawSlides = selectedSong?.slides ?? [];
    const items = allStructures[Math.min(activeStructIdx, Math.max(0, allStructures.length - 1))]?.items ?? [];
    if (!items.length || !rawSlides.length) return rawSlides;
    const byLabel = {};
    for (const s of rawSlides) {
      const lbl = s.label?.trim() ?? '';
      if (!byLabel[lbl]) byLabel[lbl] = [];
      byLabel[lbl].push(s);
    }
    const result = [];
    for (const lbl of items) result.push(...(byLabel[lbl] ?? []));
    return result.length > 0 ? result : rawSlides;
  }, [selectedSong?.id, selectedSong?.slides, allStructures, activeStructIdx]);

  // ── Tracking slides vistos para auto-marcar ──────────────────────────────
  const seenSlideIds = useRef(new Set());

  // Resetear cuando cambia la canción (nueva canción = ningún slide seleccionado)
  useEffect(() => {
    setLocalSelectedId(null);
    seenSlideIds.current = new Set();
  }, [selectedSong?.id]);

  // ── Estado local de selección (para el toggle deseleccionar) ────────────
  const [localSelectedId, setLocalSelectedId] = useState(null);

  // ── Historial deshacer ────────────────────────────────────────────────────
  const undoStack = useRef([]);
  const [undoCount, setUndoCount] = useState(0);

  const saveSong = useCallback(async (newSlides, pushUndo = true) => {
    if (pushUndo) {
      undoStack.current.push(
        selectedSong.slides.map(s => ({ label: s.label, content: s.content, slideBackground: s.slide_background ?? null }))
      );
      setUndoCount(undoStack.current.length);
    }
    await actions.updateSong(selectedSong.id, {
      title:    selectedSong.title,
      author:   selectedSong.author,
      song_key: selectedSong.song_key ?? null,
      bpm:      selectedSong.bpm ?? null,
      time_sig: selectedSong.time_sig ?? null,
      link:     selectedSong.link ?? null,
      tags:     selectedSong.tags ?? [],
      slides:   newSlides,
    });
    await actions.loadSongDetail(selectedSong.id);
  }, [selectedSong, actions]);

  const handleUndo = useCallback(async () => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    await saveSong(prev, false);
  }, [saveSong]);

  // ── Menú contextual ───────────────────────────────────────────────────────
  const [ctxMenu,  setCtxMenu]  = useState(null);
  const [renaming, setRenaming] = useState(null);

  const openCtx  = (e, slide, index) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, slide, index }); };
  const closeCtx = () => { setCtxMenu(null); setRenaming(null); };

  const deleteSlide = async (index) => {
    closeCtx();
    const newSlides = selectedSong.slides
      .filter((_, i) => i !== index)
      .map(s => ({ label: s.label, content: s.content, slideBackground: s.slide_background ?? null }));
    await saveSong(newSlides);
  };

  const deleteLabelGroup = async (label) => {
    closeCtx();
    const newSlides = selectedSong.slides
      .filter(s => s.label?.trim() !== label)
      .map(s => ({ label: s.label, content: s.content, slideBackground: s.slide_background ?? null }));
    await saveSong(newSlides);
  };

  const renameLabel = async (oldLabel, newLabel) => {
    if (!newLabel.trim() || newLabel.trim() === oldLabel) return;
    const newSlides = selectedSong.slides.map(s => ({
      label:           s.label?.trim() === oldLabel ? newLabel.trim() : s.label,
      content:         s.content,
      slideBackground: s.slide_background ?? null,
    }));
    await saveSong(newSlides);
  };

  // ── Drag & drop de grupos ─────────────────────────────────────────────────
  const [dragLabel,      setDragLabel]      = useState(null);
  const [dropBefore,     setDropBefore]     = useState(null);
  const [dropping,       setDropping]       = useState(false);
  const [mediaDropIdx,   setMediaDropIdx]   = useState(null); // index del slide con drag-over de media
  // ── Zoom de thumbnails (número de columnas: 3-8) ──────────────────────
  const [thumbCols, setThumbCols] = useState(5);
  // ── Modo de vista: 'grid' | 'list' ── 'list' por defecto en < 1024px ──
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'list' : 'grid'
  );
  const handleGroupDrop = async (label, insertIdx) => {
    if (!label) return;
    setDropping(true);
    const slides = selectedSong.slides;

    // Tomar solo la PRIMERA ocurrencia consecutiva del label (el bloque canónico)
    const groupSlides = [];
    let found = false;
    for (const s of slides) {
      if (s.label?.trim() === label) {
        found = true;
        groupSlides.push({ label: s.label, content: s.content, slideBackground: s.slide_background ?? null });
      } else if (found) {
        break;
      }
    }

    const rest = slides.map(s => ({ label: s.label, content: s.content, slideBackground: s.slide_background ?? null }));
    const newSlides = [
      ...rest.slice(0, insertIdx),
      ...groupSlides,
      ...rest.slice(insertIdx),
    ];
    try {
      await saveSong(newSlides);
    } finally {
      setDragLabel(null);
      setDropBefore(null);
      setDropping(false);
    }
  };

  // Asignar (o quitar) fondo de media a un slide
  const handleSlideMediaDrop = async (slideIndex, mediaObj) => {
    const newSlides = selectedSong.slides.map((s, i) => ({
      label:           s.label,
      content:         s.content,
      slideBackground: i === slideIndex ? mediaObj : (s.slide_background ?? null),
    }));
    await saveSong(newSlides);
  };

  // Función central de navegación (reutilizada por teclado, relay y móvil)
  const navigate = async (dir) => {
    const slides = orderedSlides;
    if (!slides || slides.length === 0) return;
    const currentIndex = selectedSlide
      ? slides.findIndex(s => s.id === selectedSlide.id)
      : -1;
    let nextIndex = null;
    if (dir === 'next') nextIndex = currentIndex < slides.length - 1 ? currentIndex + 1 : null;
    else if (dir === 'prev') nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;

    // Si hay siguiente slide en la misma canción, navegar normalmente
    if (nextIndex !== null && nextIndex !== currentIndex) {
      const slide = slides[nextIndex];
      const nextSlide = slides[nextIndex + 1] || null;
      setLocalSelectedId(slide.id);
      actions.selectSlide(slide);
      actions.showSlide({
        type:       'song',
        slides,
        slideIndex: nextIndex,
        slideData: {
          type:            'song',
          songId:          selectedSong.id,
          slideId:         slide.id,
          songTitle:       selectedSong.title,
          songAuthor:      selectedSong.author || '',
          songKey:         selectedSong.song_key || null,
          label:           slide.label,
          content:         slide.content,
          slideBackground: slide.slide_background ?? null,
        },
        nextSlideData: nextSlide ? {
          type:    'song',
          label:   nextSlide.label,
          content: nextSlide.content,
        } : null,
      });
      trackSlide(slide.id);
      return;
    }

    // Estamos en el último slide y se pide 'next' → saltar a la primera diapo de la siguiente canción del setlist
    if (dir === 'next' && nextIndex === null && schedule?.length > 0) {
      const currentSongId = selectedSong.id;
      const currentScheduleIdx = schedule.findIndex(s => s.song_id === currentSongId);
      if (currentScheduleIdx === -1) return;
      // Buscar la siguiente entrada con song_id (saltando separadores)
      let nextSongItem = null;
      for (let i = currentScheduleIdx + 1; i < schedule.length; i++) {
        if (schedule[i].song_id) { nextSongItem = schedule[i]; break; }
      }
      if (!nextSongItem) return;
      // Cargar la siguiente canción completa (con sus slides)
      try {
        const nextSong = await actions.loadSongDetail(nextSongItem.song_id);
        if (!nextSong?.slides?.length) return;
        const firstSlide = nextSong.slides[0];
        const secondSlide = nextSong.slides[1] || null;
        setLocalSelectedId(firstSlide.id);
        actions.selectSlide(firstSlide);
        actions.showSlide({
          type:       'song',
          slides:     nextSong.slides,
          slideIndex: 0,
          slideData: {
            type:            'song',
            songId:          nextSong.id,
            slideId:         firstSlide.id,
            songTitle:       nextSong.title,
            songAuthor:      nextSong.author || '',
            songKey:         nextSong.song_key || null,
            label:           firstSlide.label,
            content:         firstSlide.content,
            slideBackground: firstSlide.slide_background ?? null,
          },
          nextSlideData: secondSlide ? {
            type:    'song',
            label:   secondSlide.label,
            content: secondSlide.content,
          } : null,
        });
        trackSlide(firstSlide.id);
      } catch (err) {
        console.error('Error al cargar la siguiente canción:', err);
      }
    }
  };

  // Navegación por teclado
  useEffect(() => {
    const handleKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        e.preventDefault?.(); actions.toggleBlank(true);
      } else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault?.(); navigate('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault?.(); navigate('prev');
      }
    };
    window.addEventListener('keydown', handleKey);
    const relay = openKeyRelayReceiver();
    relay.onmessage = ({ data }) => handleKey(data);
    return () => {
      window.removeEventListener('keydown', handleKey);
      relay.close();
    };
  }, [selectedSong, selectedSlide, schedule, actions]);

  if (!selectedSong) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
        <Music size={48} strokeWidth={1} />
        <p className="text-sm">Selecciona una canción de la biblioteca</p>
      </div>
    );
  }

  const handleSlideClick = (slide, index) => {
    const isAlreadySelected = localSelectedId === slide.id;
    const isAlreadyLive     = isLive(slide);

    if (isAlreadySelected || isAlreadyLive) {
      // Deseleccionar y apagar live si estaba proyectando
      setLocalSelectedId(null);
      actions.selectSlide(null);
      if (isAlreadyLive) actions.toggleBlank(true);
      return;
    }
    setLocalSelectedId(slide.id);
    const slides    = orderedSlides;
    const nextSlide = slides[index + 1] || null;
    actions.selectSlide(slide);
    actions.showSlide({
      type:       'song',
      slides,
      slideIndex: index,
      slideData: {
        type:            'song',
        songId:          selectedSong.id,
        slideId:         slide.id,
        songTitle:       selectedSong.title,
        songAuthor:      selectedSong.author || '',
        songKey:         selectedSong.song_key || null,
        label:           slide.label,
        content:         slide.content,
        slideBackground: slide.slide_background ?? null,
      },
      nextSlideData: nextSlide ? {
        type:    'song',
        label:   nextSlide.label,
        content: nextSlide.content,
      } : null,
    });
    trackSlide(slide.id);
  };

  const handleTitleClick = () => {
    const titleActive = liveState.slideData?.type === 'title'
      && liveState.slideData?.songId === selectedSong?.id
      && !liveState.isBlank;
    if (titleActive) {
      actions.toggleBlank(true);
      return;
    }
    actions.showSlide({
      type: 'title-direct',
      slides: orderedSlides,
      slideIndex: -1,
      slideData: {
        type:            'title',
        songId:          selectedSong?.id,
        songTitle:       selectedSong?.title,
        songAuthor:      selectedSong?.author || '',
        songKey:         selectedSong?.song_key || null,
        slideBackground: outputCfg?.titleBackground || null,
      },
      nextSlideData: orderedSlides[0]
        ? { type: 'song', label: orderedSlides[0].label, content: orderedSlides[0].content }
        : null,
    });
  };

  // Trackea el slide visto y auto-marca cuando ≥80% de slides han sido vistos
  const trackSlide = (slideId) => {
    if (!selectedSong || !eventPlaysContext) return;
    seenSlideIds.current.add(slideId);
    const total = orderedSlides?.length || 0;
    const seen  = seenSlideIds.current.size;
    if (total === 0) return;
    const alreadyPlayed = eventPlays?.has(selectedSong.id);
    if (alreadyPlayed) return;
    // Verificar condición de tiempo: estamos en o después del evento
    const evItem = schedule?.find(s => s.song_id === selectedSong.id);
    if (!evItem) return; // la canción no está en el schedule activo
    const { eventId, occurrenceDate } = eventPlaysContext;
    // Necesitamos la fecha/hora del evento: está en eventPlaysContext o en el schedule
    // La chequeamos contra el tiempo actual usando el campo del contexto
    const pct = seen / total;
    if (pct >= 0.8) {
      actions.markPlayed(eventId, occurrenceDate, selectedSong.id, seen, total, false);
    }
  };

  const isLive = (slide) =>
    liveState.slideData?.slideId === slide.id &&
    liveState.slideData?.type    === 'song' &&
    !liveState.isBlank;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cabecera de la canción */}
      <div className="px-5 py-3 border-b border-surface-700 shrink-0 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white truncate">{selectedSong.title}</h2>
          {selectedSong.author && (
            <p className="text-xs text-zinc-400">{selectedSong.author}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {undoCount > 0 && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 text-xs font-medium text-white bg-surface-600 hover:bg-surface-500 border border-surface-500 px-2.5 py-1 rounded transition-colors"
              title="Deshacer último cambio"
            >
              ↩ Deshacer ({undoCount})
            </button>
          )}
          {/* Toggle vista: lista / cuadrícula */}
          <div className="flex items-center rounded overflow-hidden border border-surface-600">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-surface-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Vista de lista"
            ><LayoutList size={13} /></button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-surface-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Vista de cuadrícula"
            ><LayoutGrid size={13} /></button>
          </div>
          {/* Zoom de thumbnails (solo en modo grid) */}
          {viewMode === 'grid' && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setThumbCols(c => Math.min(8, c + 1))}
                disabled={thumbCols >= 8}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-surface-600 disabled:opacity-30 transition-colors"
                title="Más columnas (más pequeño)"
              ><ZoomOut size={13} /></button>
              <button
                onClick={() => setThumbCols(c => Math.max(2, c - 1))}
                disabled={thumbCols <= 2}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-surface-600 disabled:opacity-30 transition-colors"
                title="Menos columnas (más grande)"
              ><ZoomIn size={13} /></button>
            </div>
          )}
          {allStructures.length > 1 && (
            <div className="flex items-center gap-1 border border-surface-600 rounded overflow-hidden">
              {allStructures.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStructIdx(i)}
                  className={`px-2 py-1 text-[10px] font-semibold transition-colors ${
                    i === activeStructIdx
                      ? 'bg-accent text-white'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-600'
                  }`}
                  title={`Estructura: ${s.name}`}
                >{s.name}</button>
              ))}
            </div>
          )}
          <span className="text-xs text-zinc-600">
            {orderedSlides.length} diapositivas
          </span>
        </div>
      </div>

      {/* Panel de grupos / etiquetas */}
      {(() => {
        const seen = new Set();
        const labels = (orderedSlides).reduce((acc, s) => {
          const lbl = s.label?.trim();
          if (lbl && !seen.has(lbl)) { seen.add(lbl); acc.push(lbl); }
          return acc;
        }, []);
        if (labels.length === 0) return null;
        return (
          <div className="px-3 pt-2 pb-1 border-b border-surface-700 flex flex-wrap gap-1 shrink-0">
            {labels.map(lbl => {
              const color = getLabelColor(lbl);
              const count = orderedSlides.filter(s => s.label?.trim() === lbl).length;
              const firstSlide = orderedSlides.find(s => s.label?.trim() === lbl);
              return (
                <button
                  key={lbl}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', lbl);
                    e.dataTransfer.effectAllowed = 'copy';
                    setDragLabel(lbl);
                  }}
                  onDragEnd={() => { setDragLabel(null); setDropBefore(null); }}
                  onClick={() => {
                    // Insertar después del slide seleccionado, o al final
                    const rawSlides = selectedSong.slides ?? [];
                    const insertIdx = selectedSlide
                      ? rawSlides.findIndex(s => s.id === selectedSlide.id) + 1
                      : rawSlides.length;
                    handleGroupDrop(lbl, insertIdx);
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing text-white"
                  style={{ backgroundColor: color }}
                  title="Clic para insertar · Arrastra al grid para insertar en posición"
                >
                  {lbl}
                  <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Grid / Lista de slides */}
      <div className={`flex-1 overflow-y-auto ${viewMode === 'grid' ? 'p-3' : ''}`}>
        {orderedSlides.length === 0 ? (
          <p className="text-zinc-600 text-sm p-4">Esta canción no tiene secciones.</p>
        ) : viewMode === 'grid' ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${thumbCols}, minmax(0, 1fr))` }}
            onDragOver={e => { if (dragLabel) e.preventDefault(); }}
            onDrop={e => {
              e.preventDefault();
              const lbl = e.dataTransfer.getData('text/plain');
              // Si soltó en el contenedor (no en un slide específico), agrega al final
              if (dropBefore === null) handleGroupDrop(lbl, (selectedSong.slides ?? []).length);
            }}
          >
            {/* ── Thumbnail de título (si está habilitado) ─────────── */}
            {outputCfg.titleSlideEnabled && (() => {
              const titleActive = liveState.slideData?.type === 'title'
                && liveState.slideData?.songId === selectedSong.id
                && !liveState.isBlank;
              const titleFF     = resolveFont(outputCfg.titleFontFamily  ?? 'sans');
              const titleColor  = outputCfg.titleColor      ?? '#ffffff';
              const artistColor = outputCfg.artistColor     ?? '#aaaaaa';
              const showArtist  = outputCfg.titleShowArtist ?? false;
              const colScale      = 5 / thumbCols;
              const titleCfgSize  = outputCfg.titleFontSize;
              const titleScale    = titleCfgSize ? Number(titleCfgSize) / 72 : 1;
              const titleSize     = `${Math.max(0.22, Math.min(2.0, 0.62 * colScale * titleScale)).toFixed(3)}rem`;
              const artistCfgSize = outputCfg.artistFontSize;
              const artistScale   = artistCfgSize ? Number(artistCfgSize) / 36 : 1;
              const artistSize    = `${Math.max(0.16, Math.min(1.4, 0.44 * colScale * artistScale)).toFixed(3)}rem`;

              return (
                <div
                  key="__title__"
                  onClick={handleTitleClick}
                  className={[
                    'relative flex flex-col cursor-pointer rounded-md overflow-hidden transition-all select-none',
                    'border-2',
                    titleActive ? 'border-green-400 shadow-lg shadow-green-900/40'
                                : 'border-dashed border-zinc-600 hover:border-zinc-400',
                  ].join(' ')}
                  style={{ aspectRatio: '16/10' }}
                >
                  {/* Fondo: imagen/video del titleBackground o color sólido */}
                  {outputCfg.titleBackground ? (
                    outputCfg.titleBackground.mediaType === 'video'
                      ? <video src={outputCfg.titleBackground.url} muted playsInline preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0 }} />
                      : <img src={outputCfg.titleBackground.url} alt=""
                          className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0 }} />
                  ) : (
                    <div className="absolute inset-0 bg-zinc-900" style={{ zIndex: 0 }} />
                  )}
                  {outputCfg.titleBackground && <div className="absolute inset-0 bg-black/40" style={{ zIndex: 1 }} />}
                  {/* Ícono T */}
                  <span className="absolute top-1 left-1.5 text-[9px] font-bold text-zinc-500 z-10 leading-none">T</span>
                  {titleActive && (
                    <span className="absolute top-1 right-1 z-10 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-2 z-10 gap-0.5">
                    <div style={{ fontSize: titleSize, color: titleColor, fontFamily: titleFF, fontWeight: 'bold', lineHeight: 1.2, textAlign: 'center' }}>
                      {selectedSong.title}
                    </div>
                    {showArtist && selectedSong.author && (
                      <div style={{ fontSize: artistSize, color: artistColor, fontFamily: resolveFont(outputCfg.artistFontFamily ?? 'sans'), lineHeight: 1.3, textAlign: 'center' }}>
                        {selectedSong.author}
                      </div>
                    )}
                  </div>
                  {/* Banner inferior */}
                  <div className="absolute bottom-0 inset-x-0 z-10 px-1 py-0.5 bg-zinc-700">
                    <p className="text-[8px] font-semibold text-center truncate text-zinc-300">Título</p>
                  </div>
                </div>
              );
            })()}

            {orderedSlides.map((slide, index) => {
              const active   = isLive(slide);
              const selected = localSelectedId === slide.id;
              const labelColor = getLabelColor(slide.label);
              // Preprocesar líneas igual que el proyector: respetar saltos, filtrar comentarios
              const rawLines = (slide.content || '').split('\n');
              const visibleLines = rawLines
                .map(line => {
                  if (isCommentLine(line)) return null;
                  const { visible } = extractInlineComment(line);
                  return stripChords(visible);
                })
                .filter(l => l !== null);
              // Calcular fontSize escalado al tamaño del thumbnail + zoom de columnas + fontSize output
              const lineCount = visibleLines.filter(l => l.trim()).length;
              const baseSize  = lineCount <= 3 ? 0.58
                              : lineCount <= 5 ? 0.50
                              : lineCount <= 7 ? 0.42
                              :                  0.36;
              // 5 columnas = escala 1x; menos columnas → más grande, más columnas → más pequeño
              const colScale      = 5 / thumbCols;
              // Escala proporcional al fontSize de la salida (ref: 72px)
              const cfgFontSize   = outputCfg.fontSize;
              const fontScale     = (!cfgFontSize || cfgFontSize === 'auto') ? 1 : Number(cfgFontSize) / 72;
              const thumbFontSize = `${Math.max(0.18, Math.min(2.4, baseSize * colScale * fontScale)).toFixed(3)}rem`;
              const isDroppingHere = dropBefore === index;
              const isMediaDropHere = mediaDropIdx === index;
              const slideBg = slide.slide_background ?? null;

              return (
                <div key={slide.id} style={{ display: 'contents' }}>
                  <div
                    onClick={() => handleSlideClick(slide, index)}
                    onContextMenu={e => openCtx(e, slide, index)}
                    onDragOver={e => {
                      // Media drag tiene prioridad
                      if (e.dataTransfer.types.includes('application/aio-media')) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        setMediaDropIdx(index);
                        return;
                      }
                      if (dragLabel) { e.preventDefault(); setDropBefore(index); }
                    }}
                    onDragLeave={() => setMediaDropIdx(null)}
                    onDrop={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMediaDropIdx(null);
                      // Media drop
                      const raw = e.dataTransfer.getData('application/aio-media');
                      if (raw) {
                        try {
                          const media = JSON.parse(raw);
                          handleSlideMediaDrop(index, { mediaType: media.type, filePath: media.path, fileName: media.name, url: media.url });
                        } catch {}
                        return;
                      }
                      // Group label drop
                      const lbl = e.dataTransfer.getData('text/plain');
                      if (lbl) handleGroupDrop(lbl, index);
                    }}
                    className={[
                      'relative flex flex-col cursor-pointer rounded-md overflow-hidden transition-all select-none',
                      'border-2',
                      isMediaDropHere ? 'border-blue-400 shadow-lg shadow-blue-900/40' :
                      active   ? 'border-green-400 shadow-lg shadow-green-900/40' :
                      selected ? 'border-accent shadow-md shadow-accent/20' :
                                 'border-transparent hover:border-zinc-500',
                    ].join(' ')}
                    style={{ aspectRatio: '16/10' }}
                  >
                  {/* Fondo del slide (color base o media guardada) */}
                  {slideBg ? (
                    slideBg.mediaType === 'video'
                      ? <video key={slideBg.url} src={slideBg.url} muted playsInline preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0 }} />
                      : <img src={slideBg.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0 }} />
                  ) : (
                    <div className="absolute inset-0 bg-zinc-900" />
                  )}

                  {/* Overlay semitransparente cuando hay fondo para legibilidad del texto */}
                  {slideBg && <div className="absolute inset-0 bg-black/40" style={{ zIndex: 1 }} />}

                  {/* Número */}
                  <span className="absolute top-1 left-1.5 text-[9px] font-bold text-zinc-300 z-10 leading-none drop-shadow">
                    {index + 1}
                  </span>

                  {/* Indicador EN VIVO */}
                  {active && (
                    <span className="absolute top-1 right-1 z-10 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  )}

                  {/* Indicador de fondo asignado */}
                  {slideBg && !active && (
                    <span className="absolute top-1 right-1 z-10 text-[8px] text-blue-300 leading-none drop-shadow" title={slideBg.fileName}>▶</span>
                  )}

                  {/* Texto del slide centrado — línea por línea como el proyector */}
                  <div className="absolute inset-0 flex items-center justify-center px-2 pb-4 z-10">
                    <div className="text-center overflow-hidden w-full"
                         style={{
                           fontFamily: thumbFontFamily,
                           fontWeight: thumbBold   ? 'bold'   : '600',
                           fontStyle:  thumbItalic ? 'italic' : 'normal',
                           lineHeight: 1.4,
                         }}>
                      {visibleLines.map((line, li) => {
                        if (!line.trim()) return <div key={li} style={{ height: '0.25em' }} />;
                        return (
                          <div key={li} style={{ fontSize: thumbFontSize, color: thumbColor }}>
                            {line.trim()}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Banner de etiqueta */}
                  {slide.label && (
                    <div className="absolute bottom-0 inset-x-0 z-10 px-1 py-0.5" style={{ backgroundColor: labelColor }}>
                      <p className="text-[8px] font-semibold text-center truncate text-white">
                        {slide.label}
                      </p>
                    </div>
                  )}

                  {/* Overlay de media-drop */}
                  {isMediaDropHere && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-500/30 rounded-md">
                      <span className="text-[9px] font-bold text-blue-200 drop-shadow">Soltar como fondo</span>
                    </div>
                  )}

                  {/* Indicador vertical de drop — borde izquierdo */}
                  {dragLabel && isDroppingHere && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-accent z-20 rounded-l" />
                  )}
                </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Vista de lista ── */
          <div className="divide-y divide-surface-700/40">
            {outputCfg.titleSlideEnabled && (() => {
              const titleActive = liveState.slideData?.type === 'title' && liveState.slideData?.songId === selectedSong.id && !liveState.isBlank;
              return (
                <div
                  key="__title__"
                  onClick={handleTitleClick}
                  className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-surface-700/40 ${titleActive ? 'bg-green-950/30' : ''}`}
                >
                  <span className="text-[10px] text-zinc-600 w-5 text-right shrink-0 pt-0.5 select-none font-mono">T</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-0.5">Título</p>
                    <p className="text-zinc-200 text-sm leading-snug">{selectedSong.title}</p>
                    {selectedSong.author && <p className="text-zinc-500 text-xs mt-0.5">{selectedSong.author}</p>}
                  </div>
                  {titleActive && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0 mt-1" />}
                </div>
              );
            })()}
            {orderedSlides.map((slide, index) => {
              const active     = isLive(slide);
              const selected   = localSelectedId === slide.id;
              const labelColor = getLabelColor(slide.label);
              const visibleLines = (slide.content || '').split('\n')
                .map(line => {
                  if (isCommentLine(line)) return null;
                  const { visible } = extractInlineComment(line);
                  return stripChords(visible);
                })
                .filter(l => l !== null);
              return (
                <div
                  key={slide.id}
                  onClick={() => handleSlideClick(slide, index)}
                  onContextMenu={(e) => openCtx(e, slide, index)}
                  className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-surface-700/40 select-none ${
                    active   ? 'bg-green-950/30 border-l-2 border-l-green-500'
                    : selected ? 'bg-accent/10 border-l-2 border-l-accent'
                    : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <span className="text-[10px] text-zinc-600 w-5 text-right shrink-0 pt-0.5 font-mono select-none">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    {slide.label && (
                      <span
                        className="inline-block text-[9px] font-bold px-1.5 py-px rounded mb-1 uppercase tracking-wider text-white leading-none"
                        style={{ backgroundColor: labelColor + 'dd' }}
                      >
                        {slide.label}
                      </span>
                    )}
                    <p
                      className="text-zinc-200 leading-snug whitespace-pre-line"
                      style={{ fontSize: 'clamp(0.7rem, 1.2vw, 0.875rem)' }}
                    >
                      {visibleLines.join('\n') || '(vacío)'}
                    </p>
                    {slide.slide_background && (
                      <p className="text-[9px] text-blue-400 mt-0.5">▶ fondo asignado</p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    {active   && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                    {selected && !active && <span className="w-2 h-2 rounded-full bg-accent/60" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Menú contextual */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCtx} onContextMenu={e => { e.preventDefault(); closeCtx(); }} />
          <div
            className="fixed z-50 bg-surface-800 border border-surface-600 rounded-lg shadow-xl py-1 min-w-[210px] text-sm"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            {/* Renombrar etiqueta */}
            {ctxMenu.slide.label && !renaming && (
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-surface-700 transition-colors text-zinc-200"
                onClick={() => setRenaming({ oldLabel: ctxMenu.slide.label.trim(), value: ctxMenu.slide.label.trim() })}
              >
                ✏️ Renombrar "{ctxMenu.slide.label}"
              </button>
            )}
            {renaming && (
              <div className="px-3 py-1.5 flex gap-1">
                <input
                  autoFocus
                  className="flex-1 bg-surface-700 border border-surface-600 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-accent"
                  value={renaming.value}
                  onChange={e => setRenaming(r => ({ ...r, value: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { renameLabel(renaming.oldLabel, renaming.value); closeCtx(); }
                    if (e.key === 'Escape') { closeCtx(); }
                  }}
                />
                <button
                  className="text-xs bg-accent hover:bg-accent-hover text-white px-2 rounded"
                  onClick={() => { renameLabel(renaming.oldLabel, renaming.value); closeCtx(); }}
                >OK</button>
              </div>
            )}
            <div className="h-px bg-surface-700 my-1" />
            {/* Quitar fondo si tiene uno asignado */}
            {ctxMenu.slide.slide_background && (
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-surface-700 text-zinc-300 transition-colors"
                onClick={() => { handleSlideMediaDrop(ctxMenu.index, null); closeCtx(); }}
              >
                🖼 Quitar fondo de media
              </button>
            )}
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-red-900/40 text-red-400 transition-colors"
              onClick={() => deleteSlide(ctxMenu.index)}
            >
              🗑 Eliminar esta diapositiva
            </button>
            {ctxMenu.slide.label && (
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-red-900/40 text-red-400 transition-colors"
                onClick={() => deleteLabelGroup(ctxMenu.slide.label.trim())}
              >
                🗑 Eliminar todo "{ctxMenu.slide.label}"
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
