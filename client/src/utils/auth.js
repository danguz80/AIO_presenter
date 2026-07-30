const ADMIN_FLAG_KEY = 'aio_user_is_admin';

export function getCurrentUserIsAdmin() {
  const stored = localStorage.getItem(ADMIN_FLAG_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;

  const token = localStorage.getItem('aio_sync_token');
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.isAdmin === true || payload?.is_admin === true;
  } catch {
    return false;
  }
}

export function setCurrentUserAdminFlag(isAdmin) {
  if (typeof isAdmin !== 'boolean') return;
  localStorage.setItem(ADMIN_FLAG_KEY, String(isAdmin));
}

export function clearCurrentUserAdminFlag() {
  localStorage.removeItem(ADMIN_FLAG_KEY);
}

export function syncCurrentUserAdmin(userData) {
  if (userData && typeof userData.is_admin === 'boolean') {
    setCurrentUserAdminFlag(userData.is_admin);
    return;
  }
  if (userData && typeof userData.isAdmin === 'boolean') {
    setCurrentUserAdminFlag(userData.isAdmin);
  }
}
