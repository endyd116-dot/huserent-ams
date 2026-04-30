document.addEventListener('DOMContentLoaded', async () => {
  // 🆕 1단계: localStorage 캐시 즉시 적용 (깜빡임 없음)
  store.loadCachedSiteConfig();
  
  // 2단계: 로그인 상태면 전체 데이터 로드
  if (API.getToken() && store.currentUser) {
    await store.loadAll();
  }
  
  // 3단계: Router 초기화 + 화면 렌더링
  window.router = new Router();
  router.init();
  
  // 🆕 4단계: 비로그인 상태면 백그라운드로 최신 사이트 설정 갱신
  if (!store.currentUser) {
    store.fetchPublicSiteConfig().then(changed => {
      // 변경사항 있고, 여전히 로그인 화면 중이면 다시 그림
      if (changed && !store.currentUser) {
        console.log('🔄 사이트 설정 갱신됨 - 로그인 화면 재렌더링');
        router.renderLogin();
      }
    });
  }
  
  // 해시 라우팅 (기존)
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h.startsWith('chat/') && store.currentUser) {
      router.go('chat', { id: h.split('/')[1] });
    }
  });
  
  console.log('🚀 QJ-PropMS v3.1.1 Initialized');
});