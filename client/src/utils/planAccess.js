const API_BASE = import.meta.env.VITE_API_URL || '';

function parseTokenOrgId(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.orgId != null ? String(payload.orgId) : null;
  } catch {
    return null;
  }
}

export function getCurrentOrgId() {
  try {
    return parseTokenOrgId(localStorage.getItem('aio_sync_token'))
      || localStorage.getItem('aio_org_id')
      || 'default';
  } catch {
    return 'default';
  }
}

export function getPlanBlockedKey(orgId = getCurrentOrgId()) {
  return `aio_plan_blocked:${String(orgId || 'default')}`;
}

export function readPlanBlocked(orgId = getCurrentOrgId()) {
  try {
    return localStorage.getItem(getPlanBlockedKey(orgId)) === '1';
  } catch {
    return false;
  }
}

export function setPlanBlocked(blocked, orgId = getCurrentOrgId()) {
  try {
    localStorage.setItem(getPlanBlockedKey(orgId), blocked ? '1' : '0');
  } catch { /* ignore */ }
}

export function isOrgPlanBlocked(org) {
  if (!org) return false;
  const plan = org.effective_plan || org.plan || 'trial';
  if (plan === 'pro') return false;
  if (plan === 'trial') {
    const trialEnds = org.trial_ends ? new Date(org.trial_ends) : null;
    return !(trialEnds && trialEnds >= new Date());
  }
  return true;
}

export async function fetchCurrentOrgPlan() {
  const token = localStorage.getItem('aio_sync_token');
  if (!token) return null;
  const res = await fetch(`${API_BASE}/auth/org`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}