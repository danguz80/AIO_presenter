export async function readApiError(response) {
  if (!response) return 'Error inesperado';

  const rawText = await response.text().catch(() => '');
  const trimmed = String(rawText || '').trim();

  if (!trimmed) {
    return `HTTP ${response.status || 'desconocido'}`;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    return parsed.error || parsed.message || parsed.detail || trimmed;
  } catch {
    return trimmed;
  }
}
