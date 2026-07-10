export async function forceRefreshApp(pathname = null) {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
    }
  } catch {
    // no-op
  }

  const url = new URL(window.location.href);
  if (pathname) {
    url.pathname = pathname;
    url.search = '';
  }
  url.searchParams.set('fr', String(Date.now()));
  window.location.replace(url.toString());
}
