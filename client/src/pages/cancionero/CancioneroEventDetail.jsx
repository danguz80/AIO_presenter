import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Clock, Music2, Pencil, Trash2,
  ChevronUp, ChevronDown, X, RefreshCw, Loader2, Music, Plus, Send, Check, Users, LayoutTemplate,
  FileText, ListMusic,
} from 'lucide-react';
import CancioneroNavbar from './CancioneroNavbar';
import useVolumeKeys from '../../hooks/useVolumeKeys';

// ─── Abreviaciones de sección ─────────────────────────────────────────────────
const SECTION_ABBR = {
  'intro':    'I',  'intro 1': 'I1', 'intro 2': 'I2',
  'verso':    'V',  'verso 1': 'V1', 'verso 2': 'V2', 'verso 3': 'V3',
  'estrofa':  'E',  'estrofa 1': 'E1', 'estrofa 2': 'E2',
  'pre-coro': 'PC', 'pre coro': 'PC',
  'coro':     'C',  'coro 2': 'C2',
  'puente':   'Pb', 'bridge': 'Pb',
  'outro':    'O',  'final': 'F', 'tag': 'T', 'ending': 'F',
};
function abbr(label) {
  if (!label) return '';
  const key = label.toLowerCase().trim();
  return SECTION_ABBR[key] ?? label;
}

// ─── Generación de PDF ────────────────────────────────────────────────────────
async function generateSetlistPDF(event, allItems, occurrenceDate, spotifyPlaylistUrl, bandConfig) {
  const { jsPDF } = await import('jspdf');
  const QRCode = spotifyPlaylistUrl ? (await import('qrcode')).default : null;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210;
  const marginL = 15;
  const marginR = 15;
  const contentW = pageW - marginL - marginR;
  let y = 20;

  const checkPage = (needed = 8) => {
    if (y + needed > 280) { doc.addPage(); y = 20; }
  };

  // ─── Encabezado ───────────────────────────────────────────────────────────
  const qrSize = 22; // mm — cabe junto al título
  const textMaxW = spotifyPlaylistUrl ? contentW - qrSize - 4 : contentW;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 60);
  doc.text(event.title || 'Setlist', marginL, y);
  y += 7;

  const dateStr = (() => {
    const raw = occurrenceDate || event.date;
    const d = new Date(String(raw).slice(0, 10) + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  })();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 120);
  doc.text(dateStr, marginL, y);

  // QR Spotify — siempre arriba a la derecha si hay URL
  if (spotifyPlaylistUrl && QRCode) {
    const qrDataUrl = await QRCode.toDataURL(spotifyPlaylistUrl, { margin: 1, width: 150, color: { dark: '#000000', light: '#ffffff' } });
    const qrX = pageW - marginR - qrSize;
    const qrY = 16; // alineado con la primera línea del header
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(30, 185, 84);
    doc.text('Spotify', qrX + qrSize / 2, qrY + qrSize + 3, { align: 'center' });
  }

  y += 2;
  doc.setDrawColor(200, 200, 220);
  doc.setLineWidth(0.4);
  // Si hay QR de Spotify, la línea se detiene antes para no atravesarlo
  const lineEndX = spotifyPlaylistUrl ? pageW - marginR - qrSize - 4 : pageW - marginR;
  doc.line(marginL, y + 3, lineEndX, y + 3);
  y += 9;

  // ─── Configuración de banda ───────────────────────────────────────────────
  if (bandConfig && (bandConfig.slots || []).length > 0) {
    const slots = bandConfig.slots;
    const colW  = contentW / 2;
    const rowH  = 6;
    const neededH = 10 + Math.ceil(slots.length / 2) * rowH + 6;
    checkPage(neededH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 80, 160);
    const bandLabel = bandConfig.subtitle
      ? `CONFIGURACIÓN DE BANDA · ${bandConfig.subtitle.toUpperCase()}`
      : 'CONFIGURACIÓN DE BANDA';
    doc.text(bandLabel, marginL, y);
    y += 5;

    const leftSlots  = slots.filter((_, i) => i % 2 === 0);
    const rightSlots = slots.filter((_, i) => i % 2 === 1);
    const rows = Math.max(leftSlots.length, rightSlots.length);

    for (let r = 0; r < rows; r++) {
      const left  = leftSlots[r];
      const right = rightSlots[r];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      if (left) {
        doc.setTextColor(20, 20, 60);
        doc.text(left.userName || '', marginL, y);
        if (left.instrument) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 100, 140);
          doc.text(left.instrument, marginL + colW * 0.55, y);
        }
      }
      if (right) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(20, 20, 60);
        doc.text(right.userName || '', marginL + colW, y);
        if (right.instrument) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 100, 140);
          doc.text(right.instrument, marginL + colW + colW * 0.55, y);
        }
      }
      y += rowH;
    }

    doc.setDrawColor(200, 200, 220);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 7;
  }
  let songNumber = 0;
  for (const item of allItems) {
    checkPage(22);

    if (item.item_type === 'separator') {
      // Separador
      doc.setDrawColor(180, 180, 200);
      doc.setLineWidth(0.3);
      doc.line(marginL, y, pageW - marginR, y);
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(130, 100, 160);
      doc.text((item.separator_label || 'Separador').toUpperCase(), marginL, y);
      y += 6;
      doc.setDrawColor(180, 180, 200);
      doc.line(marginL, y, pageW - marginR, y);
      y += 6;
    } else {
      // Canción
      songNumber++;
      const songKey = item.song_key || '—';
      const bpm = item.bpm ? `${item.bpm} BPM` : '';
      const timeSig = item.time_sig || '';
      const metaParts = [songKey, bpm, timeSig].filter(Boolean);

      // Número + Título
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 60);
      doc.text(`${songNumber}.`, marginL, y);
      doc.text(item.title || '(sin título)', marginL + 8, y);

      // Metadatos a la derecha
      if (metaParts.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 140);
        doc.text(metaParts.join(' · '), pageW - marginR, y, { align: 'right' });
      }
      y += 5;

      // Autor
      if (item.author) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(120, 120, 150);
        doc.text(item.author, marginL + 8, y);
        y += 4.5;
      }

      // Estructura: buscar slides de la canción (ya cargados en pdfSongData)
      if (item._structure?.length) {
        const structureStr = item._structure.map(abbr).join(' - ');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 140, 100);
        doc.text(structureStr, marginL + 8, y);
        y += 5;
      }

      y += 2;
    }
  }

  // Footer
  checkPage(10);
  y += 4;
  doc.setDrawColor(200, 200, 220);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, pageW - marginR, y);
  y += 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(170, 170, 190);
  doc.text('Generado con AIO Presenter', marginL, y);

  // Nombre de archivo: fecha-titulo
  const fileDateStr = (() => {
    const raw = occurrenceDate || event.date;
    const d = new Date(String(raw).slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return 'setlist';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  })();
  doc.save(`setlist_${fileDateStr}.pdf`);
}

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}
function toDateStr(d) { return String(d).slice(0, 10); }
function formatDate(dateStr) {
  const d = new Date(toDateStr(dateStr) + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function norm(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── Modal de edición de evento ──────────────────────────────────────────────
function EventEditModal({ event, occurrenceDate, onClose, onSaved }) {
  const [title,       setTitle]       = useState(event?.title || '');
  // Para recurrentes mostramos la fecha de la ocurrencia (solo lectura en el campo)
  const [date,        setDate]        = useState(
    occurrenceDate || (event?.date ? String(event.date).slice(0, 10) : '')
  );
  const [time,        setTime]        = useState(event?.time ? String(event.time).slice(0, 5) : '');
  const [description, setDescription] = useState(event?.description || '');
  const [isRecurring, setIsRecurring] = useState(event?.is_recurring || false);
  const [recurrence,  setRecurrence]  = useState(event?.recurrence || 'weekly');
  const [recurEnd,    setRecurEnd]    = useState(event?.recur_end ? String(event.recur_end).slice(0, 10) : '');
  const [playlist,    setPlaylist]    = useState(
    (event?.songs ?? [])
      .sort((a, b) => a.position - b.position)
      .map(s => ({
        song_id:         s.song_id         || null,
        item_type:       s.item_type       || 'song',
        title:           s.title           || null,
        author:          s.author          || null,
        separator_label: s.separator_label || null,
        separator_color: s.separator_color || null,
      }))
  );
  const [allSongs,         setAllSongs]         = useState([]);
  const [songSearch,       setSongSearch]       = useState('');
  const [saving,           setSaving]           = useState(false);
  const [templates,        setTemplates]        = useState([]);
  const [templatePicker,   setTemplatePicker]   = useState(false);
  const [loadedTplMsg,     setLoadedTplMsg]     = useState('');
  const [dragOver,         setDragOver]         = useState(null); // índice sobre el que se hace hover
  const dragIndexRef = useRef(null);
  const searchRef    = useRef(null);
  const scrollRef    = useRef(null);
  useVolumeKeys(
    () => scrollRef.current?.scrollBy({ top: -150, behavior: 'smooth' }),
    () => scrollRef.current?.scrollBy({ top:  150, behavior: 'smooth' }),
  );

  const openTemplatePicker = async () => {
    try {
      const res = await fetch(`${API}/api/event-templates`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch { /* noop */ }
    setTemplatePicker(true);
  };

  useEffect(() => {
    fetch(`${API}/api/songs?limit=9999`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setAllSongs(Array.isArray(data.songs) ? data.songs : Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const filteredSongs = songSearch
    ? allSongs.filter(s => {
        const q = norm(songSearch);
        return norm(s.title).includes(q) || norm(s.author ?? '').includes(q);
      }).slice(0, 8)
    : [];

  const addSong = (song) => {
    if (playlist.find(p => p.song_id === song.id)) return;
    setPlaylist(prev => [...prev, { song_id: song.id, item_type: 'song', title: song.title, author: song.author, separator_label: null, separator_color: null }]);
    setSongSearch('');
    searchRef.current?.focus();
  };
  const removeItem = (idx) => setPlaylist(prev => prev.filter((_, i) => i !== idx));
  const moveItem = (idx, dir) => {
    const arr = [...playlist];
    const ni = idx + dir;
    if (ni < 0 || ni >= arr.length) return;
    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    setPlaylist(arr);
  };

  const handleDragStart = (i) => { dragIndexRef.current = i; };
  const handleDragEnter = (i) => { setDragOver(i); };
  const handleDragEnd   = ()  => {
    const from = dragIndexRef.current;
    const to   = dragOver;
    if (from !== null && to !== null && from !== to) {
      const arr = [...playlist];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      setPlaylist(arr);
    }
    dragIndexRef.current = null;
    setDragOver(null);
  };

  const save = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    const body = {
      title: title.trim(),
      date,
      time: time || null,
      description: description.trim() || null,
      is_recurring: isRecurring,
      recurrence:   isRecurring ? recurrence : null,
      recur_end:    isRecurring && recurEnd ? recurEnd : null,
      songs: playlist.map((p, i) => ({
        song_id:         p.song_id         || null,
        item_type:       p.item_type       || 'song',
        separator_label: p.separator_label || null,
        separator_color: p.separator_color || null,
        position: i,
      })),
      ...(occurrenceDate ? { occurrence_date: occurrenceDate } : {}),
    };
    try {
      const res = await fetch(`${API}/api/events/${event.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      console.error('[EventEditModal] save:', e);
      alert('Error al guardar el evento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-surface-800 border border-surface-600 rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 shrink-0">
          <h2 className="font-semibold text-base">Editar evento</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Título */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Título *</label>
            <input
              autoFocus
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Servicio dominical"
            />
          </div>

          {/* Fecha + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Fecha *</label>
              <input
                type="date"
                className={`w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent ${occurrenceDate ? 'opacity-60 cursor-not-allowed' : ''}`}
                value={date}
                onChange={e => { if (!occurrenceDate) setDate(e.target.value); }}
                readOnly={!!occurrenceDate}
                title={occurrenceDate ? 'Fecha fija para esta ocurrencia' : undefined}
              />
              {occurrenceDate && (
                <p className="text-[10px] text-zinc-500 mt-0.5">Ocurrencia específica — fecha no editable</p>
              )}
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Hora</label>
              <input
                type="time"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Descripción</label>
            <textarea
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Notas opcionales..."
            />
          </div>

          {/* Recurrencia */}
          <div className="bg-surface-700/50 rounded-xl p-3 border border-surface-600">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-500"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
              />
              <RefreshCw size={14} className={isRecurring ? 'text-accent' : 'text-zinc-500'} />
              <span className="text-sm font-medium">Evento recurrente</span>
            </label>
            {isRecurring && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Frecuencia</label>
                  <select
                    className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                    value={recurrence}
                    onChange={e => setRecurrence(e.target.value)}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Cada 2 semanas</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Hasta (opcional)</label>
                  <input
                    type="date"
                    className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                    value={recurEnd}
                    onChange={e => setRecurEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Playlist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Music size={12} />
                <span>Lista de canciones ({playlist.length})</span>
              </div>
              <button
                onClick={openTemplatePicker}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-accent transition-colors px-2 py-1 rounded-lg hover:bg-surface-700"
              >
                <LayoutTemplate size={12} /> Cargar plantilla
              </button>
            </div>
            {/* Toast de confirmación */}
            {loadedTplMsg && (
              <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/40 border border-green-600/40 text-green-300 text-xs font-medium">
                <Check size={13} /> {loadedTplMsg}
              </div>
            )}
            {/* Template picker */}
            {templatePicker && (
              <div className="mb-3 bg-surface-700/60 border border-surface-600 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-surface-600">
                  <p className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <LayoutTemplate size={12} /> Plantillas
                  </p>
                  <button onClick={() => setTemplatePicker(false)} className="text-zinc-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                {templates.length === 0 ? (
                  <p className="text-center text-zinc-500 text-xs py-4">No hay plantillas guardadas</p>
                ) : (
                  <div className="divide-y divide-surface-600/50">
                    {templates.map(tpl => {
                      const tplItems = (tpl.items || []).map(it => ({
                        song_id:         it.song_id         || null,
                        item_type:       it.item_type       || 'song',
                        title:           it.title           || null,
                        author:          it.author          || null,
                        separator_label: it.separator_label || null,
                        separator_color: it.separator_color || null,
                      }));
                      const songCount = tplItems.filter(it => it.song_id).length;
                      return (
                        <div key={tpl.id} className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">{tpl.name}</p>
                            <p className="text-xs text-zinc-500">{tplItems.length} ít.{songCount ? ` · ${songCount} canciones` : ''}</p>
                          </div>
                          <button
                            onClick={() => {
                              setPlaylist(prev => [
                                ...prev,
                                ...tplItems.filter(it => !it.song_id || !prev.find(p => p.song_id === it.song_id))
                              ]);
                              setTemplatePicker(false);
                              setLoadedTplMsg(`Plantilla “${tpl.name}” agregada (${tplItems.length} ít.)`);
                              setTimeout(() => setLoadedTplMsg(''), 3000);
                            }}
                            className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-lg hover:bg-surface-600 transition-colors shrink-0"
                          >+ Agregar</button>
                          <button
                            onClick={() => {
                              setPlaylist(tplItems);
                              setTemplatePicker(false);
                              setLoadedTplMsg(`Plantilla “${tpl.name}” cargada (${tplItems.length} ít.)`);
                              setTimeout(() => setLoadedTplMsg(''), 3000);
                            }}
                            className="text-xs text-accent font-semibold px-2 py-1 rounded-lg hover:bg-accent/10 transition-colors shrink-0"
                          >Reemplazar</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="relative mb-2">
              <input
                ref={searchRef}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                placeholder="Buscar canción para agregar..."
                value={songSearch}
                onChange={e => setSongSearch(e.target.value)}
              />
              {filteredSongs.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-600 rounded-lg overflow-hidden shadow-xl max-h-44 overflow-y-auto">
                  {filteredSongs.map(s => (
                    <button
                      key={s.id}
                      onMouseDown={e => { e.preventDefault(); addSong(s); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-600 flex items-center gap-2"
                    >
                      <Music size={12} className="text-accent shrink-0" />
                      <span className="truncate flex-1">{s.title}</span>
                      {s.author && <span className="text-zinc-500 text-xs shrink-0">{s.author}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {playlist.length > 0 && (
              <div className="flex flex-col gap-1">
                {playlist.map((item, i) => (
                  item.item_type === 'separator' ? (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => e.preventDefault()}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 group border-l-2 transition-all ${
                        dragOver === i && dragIndexRef.current !== i
                          ? 'bg-accent/20 border-accent scale-[1.01]'
                          : 'bg-surface-700/60'
                      }`}
                      style={{ borderColor: dragOver === i && dragIndexRef.current !== i ? undefined : (item.separator_color || '#6366f1') }}
                    >
                      <span className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 transition-colors px-0.5 shrink-0" title="Arrastrar">
                        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>
                      </span>
                      <span className="text-zinc-500 text-xs w-5 text-center shrink-0">—</span>
                      <span className="text-xs italic flex-1 truncate" style={{ color: item.separator_color || '#a5b4fc' }}>{item.separator_label || 'Separador'}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => moveItem(i, -1)} disabled={i === 0} className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs">▲</button>
                        <button onClick={() => moveItem(i, 1)} disabled={i === playlist.length - 1} className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs">▼</button>
                        <button onClick={() => removeItem(i)} className="text-zinc-500 hover:text-red-400 p-0.5 ml-0.5"><X size={13} /></button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => e.preventDefault()}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 group transition-all ${
                        dragOver === i && dragIndexRef.current !== i
                          ? 'bg-accent/20 scale-[1.01]'
                          : 'bg-surface-700'
                      }`}
                    >
                      <span className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 transition-colors px-0.5 shrink-0" title="Arrastrar">
                        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>
                      </span>
                      <span className="text-zinc-500 text-xs w-5 text-center shrink-0">{i + 1}</span>
                      <Music size={12} className="text-accent shrink-0" />
                      <span className="text-sm flex-1 truncate">{item.title}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => moveItem(i, -1)} disabled={i === 0} className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs">▲</button>
                        <button onClick={() => moveItem(i, 1)} disabled={i === playlist.length - 1} className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs">▼</button>
                        <button onClick={() => removeItem(i)} className="text-zinc-500 hover:text-red-400 p-0.5 ml-0.5"><X size={13} /></button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-700 shrink-0">
          <button onClick={onClose} className="text-sm text-zinc-400 hover:text-white px-4 py-2 rounded-lg hover:bg-surface-700">Cancelar</button>
          <button
            onClick={save}
            disabled={!title.trim() || !date || saving}
            className="text-sm bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-lg disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal del evento ─────────────────────────────────────────────
export default function CancioneroEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const occurrenceDate = location.state?.occurrence_date ?? null;

  const [event,        setEvent]       = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [editOpen,     setEditOpen]    = useState(false);
  const [confirmDel,   setConfirmDel]  = useState(false);
  const [deleting,     setDeleting]    = useState(false);
  const [publishing,   setPublishing]  = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [orgSpotifyClientId, setOrgSpotifyClientId] = useState(null);
  const [spotifyPlaylistUrl, setSpotifyPlaylistUrl] = useState(
    () => localStorage.getItem(`aio-spotify-playlist:${id}`) || null
  );
  const [bandConfigs,  setBandConfigs] = useState([]);
  const [savingBand,   setSavingBand]  = useState(false);

  const scrollRef = useRef(null);
  useVolumeKeys(
    () => scrollRef.current?.scrollBy({ top: -150, behavior: 'smooth' }),
    () => scrollRef.current?.scrollBy({ top:  150, behavior: 'smooth' }),
  );

  const isAdmin = (() => {
    try {
      const token = localStorage.getItem('aio_sync_token');
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Boolean(payload.isAdmin);
    } catch { return false; }
  })();

  const loadEvent = () => {
    setLoading(true);
    // Cargamos en un rango amplio y buscamos por ID
    const today = new Date();
    const pastDate = new Date(today); pastDate.setFullYear(today.getFullYear() - 2);
    const futureDate = new Date(today); futureDate.setFullYear(today.getFullYear() + 2);
    const fmt = d => d.toISOString().split('T')[0];
    fetch(`${API}/api/events?start=${fmt(pastDate)}&end=${fmt(futureDate)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        // Para recurrentes buscar por id + occurrence_date; si no hay, el primero que coincida
        let ev;
        if (occurrenceDate) {
          ev = list.find(e =>
            String(e.id) === String(id) &&
            toDateStr(e.occurrence_date ?? e.date) === toDateStr(occurrenceDate)
          );
        }
        if (!ev) ev = list.find(e => String(e.id) === String(id));
        setEvent(ev ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadEvent(); }, [id, occurrenceDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar spotify_client_id de la org
  useEffect(() => {
    fetch(`${API}/auth/org`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.spotify_client_id) setOrgSpotifyClientId(data.spotify_client_id); })
      .catch(() => {});
  }, []);

  // Cargar configuraciones de banda
  useEffect(() => {
    fetch(`${API}/api/band-configs`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setBandConfigs(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const saveBandConfig = async (configId) => {
    setSavingBand(true);
    try {
      const body = { band_config_id: configId || null };
      // Para eventos recurrentes enviar la occurrence_date para guardar por ocurrencia
      if (event?.is_recurring && occurrenceDate) {
        body.occurrence_date = occurrenceDate;
      }
      const res = await fetch(`${API}/api/events/${id}/band-config`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) setEvent(prev => ({ ...prev, band_config_id: configId || null }));
    } finally { setSavingBand(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      await fetch(`${API}/api/events/${id}`, { method: 'DELETE', headers: authHeaders() });
      navigate('/cancionero/eventos', { replace: true });
    } catch {
      setDeleting(false);
      setConfirmDel(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1a2e] flex items-center justify-center">
        <Loader2 size={32} className="text-yellow-400 animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#0f1a2e] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-white/40">Evento no encontrado.</p>
        <button onClick={() => navigate('/cancionero/eventos')} className="text-sm text-blue-400 underline">
          Volver a eventos
        </button>
      </div>
    );
  }

  const songs = (event.songs ?? [])
    .filter(s => s.item_type !== 'separator' && s.song_id)
    .sort((a, b) => a.position - b.position);

  const allItems = (event.songs ?? []).sort((a, b) => a.position - b.position);

  const handleGeneratePDF = async () => {
    setGeneratingPdf(true);
    try {
      // Enriquecer canciones con bpm, time_sig y structure desde la API
      const enriched = await Promise.all(
        allItems.map(async (item) => {
          if (item.item_type === 'separator' || !item.song_id) return item;
          try {
            const res = await fetch(`${API}/api/songs/${item.song_id}`, { headers: authHeaders() });
            if (!res.ok) return item;
            const data = await res.json();
            // Usar structure guardada; si no existe, derivar desde slides (labels únicos en orden)
            const structure = Array.isArray(data.structure) && data.structure.length > 0
              ? data.structure
              : (data.slides ?? []).map(sl => sl.label).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
            return { ...item, bpm: data.bpm, time_sig: data.time_sig, _structure: structure };
          } catch { return item; }
        })
      );
      const activeBandConfig = bandConfigs.find(c => c.id === event.band_config_id) ?? null;
      await generateSetlistPDF(event, enriched, occurrenceDate, spotifyPlaylistUrl, activeBandConfig);
    } finally { setGeneratingPdf(false); }
  };

  // ─── Spotify PKCE ────────────────────────────────────────────────────────────
  const handleCreateSpotifyPlaylist = async () => {
    // Prioridad: Client ID de la org (BD) > variable de entorno (fallback dev)
    const clientId = orgSpotifyClientId || import.meta.env.VITE_SPOTIFY_CLIENT_ID;
    if (!clientId) {
      alert('Configura el Spotify Client ID en Ajustes → Organización para usar la integración con Spotify.');
      return;
    }

    // Advertir si alguna canción no tiene link de Spotify
    const songItems = allItems.filter(i => i.item_type !== 'separator' && i.song_id);
    const withoutLink = songItems.filter(i => !i.link);
    if (withoutLink.length > 0) {
      const names = withoutLink.map(i => i.title).join(', ');
      const ok = window.confirm(
        `${withoutLink.length} canción${withoutLink.length > 1 ? 'es' : ''} no ${withoutLink.length > 1 ? 'tienen' : 'tiene'} link de Spotify y no se agregarán a la playlist:\n\n${names}\n\n¿Continuar de todas formas?`
      );
      if (!ok) return;
    }

    // Nombre de la playlist: DD-MM-AAAA - Título
    const rawDate = occurrenceDate || event.date;
    const d = new Date(String(rawDate).slice(0, 10) + 'T12:00:00');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const playlistName = `${dd}-${mm}-${yyyy} - ${event.title}`;

    // PKCE helpers
    const generateCodeVerifier = (len = 64) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
      const arr = new Uint8Array(len);
      crypto.getRandomValues(arr);
      return Array.from(arr, b => chars[b % chars.length]).join('');
    };
    const generateCodeChallenge = async (verifier) => {
      const enc = new TextEncoder().encode(verifier);
      const hash = await crypto.subtle.digest('SHA-256', enc);
      return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    // Local: Spotify solo acepta 127.0.0.1 (no localhost) → reemplazar
    // Producción: usar el origen real
    const origin = window.location.hostname === 'localhost'
      ? window.location.origin.replace('localhost', '127.0.0.1')
      : window.location.origin;
    const redirectUri = `${origin}/spotify-callback`;
    const scope = 'playlist-modify-public playlist-modify-private user-read-private';

    // Codificar todo lo necesario en el state para no depender de localStorage
    // (localhost y 127.0.0.1 tienen localStorage separado — esto lo evita)
    const songs = allItems
      .filter(i => i.item_type !== 'separator' && i.song_id)
      .map(i => ({ title: i.title, author: i.author, link: i.link || null }));
    // Base64 URL-safe: btoa produce '+' y '/' que se corrompen en URLs
    const statePayload = btoa(unescape(encodeURIComponent(JSON.stringify({
      eventId: id, playlistName, verifier, clientId, redirectUri, songs,
    }))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope,
      redirect_uri: redirectUri,
      state: statePayload,
      code_challenge_method: 'S256',
      code_challenge: challenge,
    });
    setSpotifyLoading(true);
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  };

  const songList = songs.map(s => ({ id: s.song_id, title: s.title ?? '' }));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const evDate = new Date(toDateStr(event.date) + 'T12:00:00');
  const diffDays = Math.round((evDate - today) / 86400000);
  const isPast = diffDays < 0;

  return (
    <div className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/cancionero/eventos')}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} className="text-white/70" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{event.title}</h1>
            <p className="text-xs text-white/40 capitalize">{formatDate(event.date)}</p>
          </div>
          {isAdmin && (
            <button
              onClick={async () => {
                setPublishing(true);
                try {
                  const endpoint = event?.is_published ? 'unpublish' : 'publish';
                  const res = await fetch(`${API}/api/events/${id}/${endpoint}`, {
                    method: 'POST',
                    headers: authHeaders(),
                  });
                  if (res.ok) {
                    const updated = await res.json();
                    setEvent(prev => ({ ...prev, ...updated }));
                  }
                } finally { setPublishing(false); }
              }}
              disabled={publishing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
                event?.is_published
                  ? 'bg-green-500/20 hover:bg-red-500/20 border-green-400/30 hover:border-red-400/30 text-green-300 hover:text-red-300'
                  : 'bg-green-500/15 hover:bg-green-500/30 border-green-400/20 text-green-300'
              }`}
              title={event?.is_published ? 'Despublicar evento' : 'Publicar evento'}
            >
              {publishing
                ? <Loader2 size={13} className="animate-spin" />
                : event?.is_published
                  ? <Check size={13} />
                  : <Send size={13} />
              }
              {event?.is_published ? 'Publicado' : 'Publicar'}
            </button>
          )}
          <button
            onClick={() => { setEditOpen(true); setConfirmDel(false); }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Editar evento"
          >
            <Pencil size={17} className="text-white/60" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`p-1.5 rounded-lg transition-colors ${
              confirmDel
                ? 'bg-red-600/80 hover:bg-red-600'
                : 'hover:bg-white/10'
            }`}
            title={confirmDel ? 'Confirmar eliminación' : 'Eliminar evento'}
          >
            <Trash2 size={17} className={confirmDel ? 'text-white' : 'text-white/40 hover:text-red-400'} />
          </button>
        </div>
        {confirmDel && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-300 bg-red-900/30 rounded-lg px-3 py-2">
            <span>¿Eliminar este evento? Esta acción no se puede deshacer.</span>
            <button onClick={() => setConfirmDel(false)} className="ml-auto text-white/50 hover:text-white">
              <X size={13} />
            </button>
          </div>
        )}
      </header>

      {/* Cuerpo */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 max-w-2xl mx-auto w-full space-y-5">

        {/* Info del evento */}
        {isAdmin && !event?.is_published && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/25">
            <span className="text-amber-300 text-xs font-semibold">Borrador</span>
            <span className="text-xs text-amber-300/60">— Este evento no es visible para los demás miembros aún.</span>
          </div>
        )}

        <div className={`rounded-2xl border-2 p-4 space-y-2 ${
          isPast ? 'border-white/5 bg-white/[0.03]' : 'border-white/10 bg-white/5'
        }`}>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays size={15} className="text-blue-300/70" />
            <span className="text-white/70 capitalize">{formatDate(event.date)}</span>
            {!isPast && diffDays === 0 && <span className="text-yellow-400 font-semibold text-xs ml-1">— Hoy</span>}
            {!isPast && diffDays === 1 && <span className="text-green-400 font-semibold text-xs ml-1">— Mañana</span>}
            {!isPast && diffDays > 1 && <span className="text-blue-300 text-xs ml-1">— En {diffDays} días</span>}
            {isPast && <span className="text-white/30 text-xs ml-1">— Pasado</span>}
          </div>
          {event.time && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-white/30" />
              <span className="text-white/50">{String(event.time).slice(0, 5)}</span>
            </div>
          )}
          {event.is_recurring && (
            <div className="flex items-center gap-2 text-xs text-indigo-300/70">
              <RefreshCw size={13} />
              <span>Recurrente · {event.recurrence === 'weekly' ? 'Semanal' : event.recurrence === 'biweekly' ? 'Cada 2 semanas' : 'Mensual'}</span>
            </div>
          )}
          {event.description && (
            <p className="text-sm text-white/50 mt-1 italic">{event.description}</p>
          )}
        </div>

        {/* Configuración de banda */}
        {isAdmin ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-3 flex items-center gap-1.5">
              <Users size={12} /> Configuración de banda
            </p>
            <div className="flex gap-2">
              <select
                value={event.band_config_id ?? ''}
                onChange={e => saveBandConfig(e.target.value ? Number(e.target.value) : null)}
                disabled={savingBand}
                className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400/50 disabled:opacity-50"
              >
                <option value="">— Sin configuración asignada —</option>
                {bandConfigs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {savingBand && <Loader2 size={16} className="animate-spin text-yellow-400 self-center" />}
            </div>
            {/* Preview de la config seleccionada */}
            {(() => {
              const cfg = bandConfigs.find(c => c.id === Number(event.band_config_id));
              if (!cfg || !cfg.slots?.length) return null;
              return (
                <div className="mt-3 space-y-1">
                  {cfg.slots.filter(s => s.instrument).map((s, i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-white/5">
                      {s.avatarUrl
                        ? <img src={s.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                        : <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/50">{s.userName?.[0]?.toUpperCase() ?? '?'}</div>
                      }
                      <span className="text-xs font-semibold text-white flex-1 truncate">{s.userName}</span>
                      <span className="text-xs text-yellow-300/80">{s.instrument}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : (
          // Vista no-admin: mostrar la config asignada
          (() => {
            const cfg = bandConfigs.find(c => c.id === Number(event.band_config_id));
            if (!cfg || !cfg.slots?.filter(s => s.instrument).length) return null;
            return (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-3 flex items-center gap-1.5">
                  <Users size={12} /> Banda · {cfg.name}
                </p>
                <div className="space-y-1">
                  {cfg.slots.filter(s => s.instrument).map((s, i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-white/5">
                      {s.avatarUrl
                        ? <img src={s.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                        : <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/50">{s.userName?.[0]?.toUpperCase() ?? '?'}</div>
                      }
                      <span className="text-sm font-semibold text-white flex-1 truncate">{s.userName}</span>
                      <span className="text-xs font-medium text-yellow-300/80">{s.instrument}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
        )}

        {/* Lista de canciones / setlist completo */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-white/30 uppercase tracking-wider flex items-center gap-1.5 flex-1">
              <Music2 size={12} /> {songs.length} {songs.length === 1 ? 'canción' : 'canciones'}
            </p>
            {allItems.length > 0 && (
              <>
                <button
                  onClick={handleGeneratePDF}
                  disabled={generatingPdf}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/50 hover:text-white/80 transition-colors disabled:opacity-50"
                  title="Exportar setlist como PDF"
                >
                  {generatingPdf ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  PDF
                </button>
                {isAdmin && (
                <button
                  onClick={handleCreateSpotifyPlaylist}
                  disabled={spotifyLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1DB954]/10 hover:bg-[#1DB954]/20 border border-[#1DB954]/30 text-xs text-[#1DB954] hover:text-[#1ed760] transition-colors disabled:opacity-50"
                  title="Crear playlist en Spotify"
                >
                  {spotifyLoading ? <Loader2 size={12} className="animate-spin" /> : <ListMusic size={12} />}
                  Spotify
                </button>
                )}
              </>
            )}
          </div>
          {allItems.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-8">Sin canciones asignadas</p>
          ) : (
            <div className="space-y-2">
              {allItems.map((s, idx) => {
                if (s.item_type === 'separator') {
                  return (
                    <div
                      key={s.id ?? `sep-${idx}`}
                      className="px-3 py-1.5 rounded-lg border-l-2"
                      style={{ borderColor: s.separator_color || '#6366f1', background: `${s.separator_color || '#6366f1'}15` }}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.separator_color || '#a5b4fc' }}>
                        {s.separator_label || 'Separador'}
                      </span>
                    </div>
                  );
                }
                const songIdx = songs.findIndex(sq => sq.song_id === s.song_id);
                return (
                  <button
                    key={s.song_id}
                    onClick={() => navigate(`/cancionero/canciones/${s.song_id}`, {
                      state: { songList, eventTitle: event.title, eventId: event.id },
                    })}
                    className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 transition-colors text-left"
                  >
                    <span className="text-white/20 text-xs w-5 text-right shrink-0">{songIdx + 1}</span>
                    <Music2 size={14} className="text-yellow-400/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{s.title ?? '—'}</p>
                      {s.author && <p className="text-xs text-white/30 truncate">{s.author}</p>}
                    </div>
                    {s.song_key && (
                      <span className="text-xs font-mono text-yellow-400/60 shrink-0">{s.song_key}</span>
                    )}
                    {(s.bpm || s.time_sig) && (
                      <span className="text-xs font-mono text-white/40 shrink-0">
                        {[s.bpm && `${s.bpm}`, s.time_sig].filter(Boolean).join(' • ')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CancioneroNavbar />

      {/* Modal de edición */}
      {editOpen && (
        <EventEditModal
          event={event}
          occurrenceDate={event.is_recurring ? toDateStr(event.occurrence_date ?? event.date) : null}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); loadEvent(); }}
        />
      )}
    </div>
  );
}
