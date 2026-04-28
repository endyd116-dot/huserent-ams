document.addEventListener('DOMContentLoaded', async () => {
  if (API.getToken() && store.currentUser) {
    await store.loadAll();
  }
  window.router = new Router();
  router.init();
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h.startsWith('chat/') && store.currentUser) {
      router.go('chat', { id: h.split('/')[1] });
    }
  });
  console.log('🚀 QJ-PropMS v2.0 Initialized');
});