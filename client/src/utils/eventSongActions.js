const API_BASE = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  const token = localStorage.getItem('aio_sync_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function shiftDateStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

function datePart(value) {
  return String(value || '').slice(0, 10);
}

function toSaveItem(item, index) {
  return {
    song_id: item.song_id || null,
    item_type: item.item_type || 'song',
    separator_label: item.separator_label || null,
    separator_color: item.separator_color || null,
    media_name: item.media_name || null,
    media_type: item.media_type || null,
    notes: item.notes || null,
    position: index,
  };
}

export async function fetchEventsAround({ pastDays = 180, futureDays = 180, apiBase = API_BASE } = {}) {
  const start = shiftDateStr(-Math.abs(pastDays));
  const end = shiftDateStr(Math.abs(futureDays));
  const res = await fetch(`${apiBase}/api/events?start=${start}&end=${end}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`No se pudieron cargar eventos (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function addSongToEvent({ event, song, apiBase = API_BASE }) {
  if (!event?.id) throw new Error('Evento inválido');
  if (!song?.id) throw new Error('Canción inválida');

  const currentItems = Array.isArray(event.songs) ? event.songs : [];
  const alreadyInEvent = currentItems.some(
    (item) => (item.item_type || 'song') === 'song' && Number(item.song_id) === Number(song.id)
  );
  if (alreadyInEvent) return { duplicate: true };

  const nextItems = [
    ...currentItems,
    {
      song_id: song.id,
      item_type: 'song',
      title: song.title || null,
      author: song.author || null,
    },
  ];

  const body = {
    title: event.title || '',
    date: event.is_recurring ? datePart(event.base_date || event.date) : datePart(event.date),
    time: event.time || null,
    description: event.description || null,
    is_recurring: Boolean(event.is_recurring),
    recurrence: event.is_recurring ? (event.recurrence || null) : null,
    recur_end: event.is_recurring ? (event.recur_end || null) : null,
    songs: nextItems.map(toSaveItem),
  };

  const occDate = event.is_recurring ? datePart(event.occurrence_date || event.date) : null;
  if (occDate) body.occurrence_date = occDate;

  const res = await fetch(`${apiBase}/api/events/${event.id}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `No se pudo guardar en evento (${res.status})`);
  }

  return { duplicate: false };
}
