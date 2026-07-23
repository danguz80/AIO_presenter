import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  const iso = String(dateStr).slice(0, 10);
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = d.toLocaleDateString('es-CL', { weekday: 'long' });
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${wd} - ${dd}-${mm}-${yy}`;
}

export default function SongHistoryPanel() {
  const [mode, setMode] = useState('year');
  const [report, setReport] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(monthNow());
  const [fromMonth, setFromMonth] = useState(monthNow());
  const [toMonth, setToMonth] = useState(monthNow());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('mode', mode);
    if (mode === 'year') p.set('year', String(year));
    if (mode === 'month') p.set('month', month);
    if (mode === 'range') {
      p.set('from', fromMonth);
      p.set('to', toMonth);
    }
    return p.toString();
  }, [mode, year, month, fromMonth, toMonth]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/song-history/report?${query}`, { headers: authHeaders() });
      const d = await r.json();
      if (r.ok) {
        setReport(Array.isArray(d.rows) ? d.rows : []);
        const y = Array.isArray(d.years) ? d.years : [];
        setYears(y);
        if (y.length > 0 && !y.includes(Number(year))) {
          setYear(y[0]);
        }
      }
    } catch {
      setReport([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportPdf = async () => {
    setDownloading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 12;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      let y = 16;

      const ensureSpace = (h = 8) => {
        if (y + h > pageH - margin) {
          doc.addPage();
          y = margin;
        }
      };

      const titleFilter = mode === 'year'
        ? `Año ${year}`
        : mode === 'month'
          ? `Mes ${month}`
          : `Rango ${fromMonth} a ${toMonth}`;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 50);
      doc.text('Historial de canciones tocadas', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 120);
      doc.text(titleFilter, margin, y);
      y += 8;

      if (report.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.text('No hay canciones tocadas en el período seleccionado.', margin, y);
      } else {
        report.forEach((row, idx) => {
          const dates = Array.isArray(row.played_dates) ? row.played_dates : [];
          const firstDate = row.first_played_on ? formatDate(row.first_played_on) : '—';
          const lastDate = row.last_played_on ? formatDate(row.last_played_on) : '—';
          const latest = dates.slice(0, 8).map(formatDate).join(' | ');

          ensureSpace(16);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(25, 25, 60);
          doc.text(`${idx + 1}. ${row.title || '(sin título)'}`, margin, y);
          y += 4.5;

          if (row.author) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8.5);
            doc.setTextColor(110, 110, 140);
            doc.text(row.author, margin + 4, y);
            y += 4;
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(70, 70, 100);
          doc.text(`Veces tocada: ${row.plays_count || 0}`, margin + 4, y);
          y += 3.8;
          doc.text(`Primera fecha: ${firstDate}`, margin + 4, y);
          y += 3.8;
          doc.text(`Última fecha: ${lastDate}`, margin + 4, y);
          y += 3.8;

          if (latest) {
            const wrapped = doc.splitTextToSize(`Fechas: ${latest}`, pageW - margin * 2 - 4);
            wrapped.forEach(line => {
              ensureSpace(4);
              doc.text(line, margin + 4, y);
              y += 3.8;
            });
          }

          y += 1;
          doc.setDrawColor(210, 210, 225);
          doc.setLineWidth(0.2);
          doc.line(margin, y, pageW - margin, y);
          y += 4;
        });
      }

      const safe = titleFilter.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
      doc.save(`historial-canciones-${safe || 'reporte'}.pdf`);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          value={mode}
          onChange={e => setMode(e.target.value)}
          className="bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
        >
          <option value="year">Por año</option>
          <option value="month">Por mes</option>
          <option value="range">Rango de meses</option>
        </select>

        {mode === 'year' && (
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
          >
            {(years.length ? years : [new Date().getFullYear()]).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

        {mode === 'month' && (
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
          />
        )}

        {mode === 'range' && (
          <>
            <input
              type="month"
              value={fromMonth}
              onChange={e => setFromMonth(e.target.value)}
              className="bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
            />
            <input
              type="month"
              value={toMonth}
              onChange={e => setToMonth(e.target.value)}
              className="bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
            />
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="px-2.5 py-1.5 rounded-lg text-xs bg-surface-700 hover:bg-surface-600 border border-surface-600 text-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Actualizar
        </button>
        <button
          onClick={exportPdf}
          disabled={downloading || loading}
          className="px-2.5 py-1.5 rounded-lg text-xs bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Descargar PDF
        </button>
        <span className="text-[11px] text-zinc-500">{report.length} canciones con al menos 1 toque</span>
      </div>

      <div className="max-h-56 overflow-y-auto border border-surface-700 rounded-lg">
        {loading ? (
          <div className="py-6 text-center text-zinc-400 text-xs">Cargando historial...</div>
        ) : report.length === 0 ? (
          <div className="py-6 text-center text-zinc-500 text-xs">Sin registros en el período seleccionado.</div>
        ) : (
          <div className="divide-y divide-surface-700">
            {report.map((r) => (
              <div key={r.song_id} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-white font-medium truncate">{r.title}</p>
                  <span className="text-[10px] text-zinc-400 shrink-0">{r.plays_count} vez{r.plays_count === 1 ? '' : 'es'}</span>
                </div>
                {r.author && <p className="text-[10px] text-zinc-500 truncate">{r.author}</p>}
                <p className="text-[10px] text-zinc-400 mt-1">
                  Última: {r.last_played_on ? formatDate(r.last_played_on) : '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
