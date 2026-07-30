const STORAGE_KEY = 'aio_presentation_schedules_v1';

function getActiveOrgId() {
  try {
    return localStorage.getItem('aio_org_id') || 'default';
  } catch {
    return 'default';
  }
}

function getOrgStorageKey(orgId = getActiveOrgId()) {
  return `${STORAGE_KEY}:${String(orgId || 'default')}`;
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function addByPattern(date, pattern, interval) {
  const next = new Date(date);
  const step = Math.max(1, Number(interval) || 1);
  if (pattern === 'daily') {
    next.setDate(next.getDate() + step);
    return next;
  }
  if (pattern === 'weekly') {
    next.setDate(next.getDate() + (7 * step));
    return next;
  }
  next.setMonth(next.getMonth() + step);
  return next;
}

export function loadPresentationSchedules(orgId = getActiveOrgId()) {
  try {
    const scopedKey = getOrgStorageKey(orgId);
    const raw = localStorage.getItem(scopedKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }

    // Migración suave desde el storage legado global a la org activa.
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (!legacyRaw) return [];
    const parsed = JSON.parse(legacyRaw);
    const legacy = Array.isArray(parsed) ? parsed : [];
    const migrated = legacy.map(schedule => ({
      ...schedule,
      orgId: schedule?.orgId || orgId || 'default',
    }));
    localStorage.setItem(scopedKey, JSON.stringify(migrated));
    localStorage.removeItem(STORAGE_KEY);
    return migrated;
  } catch {
    return [];
  }
}

export function savePresentationSchedules(list, orgId = getActiveOrgId()) {
  const scopedKey = getOrgStorageKey(orgId);
  const normalized = (Array.isArray(list) ? list : []).map(schedule => ({
    ...schedule,
    orgId: schedule?.orgId || orgId || 'default',
  }));
  localStorage.setItem(scopedKey, JSON.stringify(normalized));
}

export function buildPresentationSchedule({ song, startAtLocal, recurring, pattern, interval, untilLocal, orgId = getActiveOrgId() }) {
  const nowIso = new Date().toISOString();
  return {
    id: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    kind: 'presentation',
    orgId: orgId || 'default',
    songId: song.id,
    songTitle: song.title || 'Presentacion',
    active: true,
    startAt: toIso(startAtLocal),
    recurring: {
      enabled: !!recurring,
      pattern: pattern || 'weekly',
      interval: Math.max(1, Number(interval) || 1),
      until: recurring ? toIso(untilLocal) : null,
    },
    lastTriggeredAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function buildOutputsActivationSchedule({ startAtLocal, recurring, pattern, interval, untilLocal, orgId = getActiveOrgId() }) {
  const nowIso = new Date().toISOString();
  return {
    id: (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    kind: 'outputs',
    orgId: orgId || 'default',
    title: 'Activar salidas',
    active: true,
    startAt: toIso(startAtLocal),
    recurring: {
      enabled: !!recurring,
      pattern: pattern || 'weekly',
      interval: Math.max(1, Number(interval) || 1),
      until: recurring ? toIso(untilLocal) : null,
    },
    lastTriggeredAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function getPresentationScheduleBadgeMap(schedules) {
  const map = new Map();
  for (const s of schedules || []) {
    const kind = s?.kind || 'presentation';
    if (kind !== 'presentation') continue;
    if (!s?.active || !s?.songId) continue;
    const key = String(s.songId);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export function getNextOccurrence(schedule, fromDate = new Date()) {
  if (!schedule?.active || !schedule?.startAt) return null;
  const start = new Date(schedule.startAt);
  if (Number.isNaN(start.getTime())) return null;

  const recurring = !!schedule?.recurring?.enabled;
  if (!recurring) return start;

  const pattern = schedule.recurring.pattern || 'weekly';
  const interval = Math.max(1, Number(schedule.recurring.interval) || 1);
  const until = schedule.recurring.until ? new Date(schedule.recurring.until) : null;
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);

  let candidate = new Date(start);
  let guard = 0;
  while (candidate < from && guard < 5000) {
    candidate = addByPattern(candidate, pattern, interval);
    guard += 1;
  }
  if (until && candidate > until) return null;
  return candidate;
}

export function getDueOccurrence(schedule, now = new Date()) {
  if (!schedule?.active || !schedule?.startAt) return null;
  const start = new Date(schedule.startAt);
  if (Number.isNaN(start.getTime())) return null;

  const recurring = !!schedule?.recurring?.enabled;
  const lastTriggered = schedule.lastTriggeredAt ? new Date(schedule.lastTriggeredAt) : null;

  if (!recurring) {
    if (now < start) return null;
    if (lastTriggered) return null;
    return start;
  }

  const pattern = schedule.recurring.pattern || 'weekly';
  const interval = Math.max(1, Number(schedule.recurring.interval) || 1);
  const until = schedule.recurring.until ? new Date(schedule.recurring.until) : null;

  let candidate = new Date(start);
  let last = null;
  let guard = 0;
  while (candidate <= now && guard < 5000) {
    if (!until || candidate <= until) last = new Date(candidate);
    candidate = addByPattern(candidate, pattern, interval);
    guard += 1;
  }
  if (!last) return null;
  if (lastTriggered && lastTriggered >= last) return null;
  return last;
}

export function describeRecurrence(schedule) {
  if (!schedule?.recurring?.enabled) return 'Una vez';
  const pattern = schedule.recurring.pattern || 'weekly';
  const interval = Math.max(1, Number(schedule.recurring.interval) || 1);
  if (pattern === 'daily') return interval === 1 ? 'Cada dia' : `Cada ${interval} dias`;
  if (pattern === 'monthly') return interval === 1 ? 'Cada mes' : `Cada ${interval} meses`;
  return interval === 1 ? 'Cada semana' : `Cada ${interval} semanas`;
}

export function formatScheduleDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
