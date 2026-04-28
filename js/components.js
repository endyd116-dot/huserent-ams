window.UI = {
  Sidebar(active='home') {
    const u = store.currentUser;
    const isAdmin = u.role === 'Admin';
    const pending = isAdmin ? store.pendingProfileRequests().length : 0;
    const item = (k,icon,label,onclick,b) => `<a onclick="${onclick}" class="flex items-center gap-3 px-5 py-3.5 rounded-2xl cursor-pointer transition ${active===k?'bg-blue-600 text-white font-bold shadow-xl':'text-slate-400 hover:bg-white/5 font-semibold'}"><i data-lucide="${icon}" class="w-5 h-5"></i><span class="text-sm flex-1">${label}</span>${b?`<span class="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">${b}</span>`:''}</a>`;
    return `<aside class="hidden lg:flex w-72 flex-col bg-slate-900 text-white p-6 sticky top-0 h-screen">
      <div class="mb-8 px-2 cursor-pointer" onclick="router.go('home')"><h1 class="text-2xl font-black">QJ<span class="text-blue-500">.</span>PMS</h1><p class="text-[9px] text-slate-500 font-bold uppercase mt-1">v2.0 Cloud</p></div>
      <nav class="space-y-1 flex-1 overflow-y-auto scrollbar">
        ${item('home','layout-grid','내 숙소 목록',"router.go('home')")}
        ${isAdmin?item('admin','shield-check','관리자 오피스',"router.go('admin')",pending):''}
      </nav>
      <div class="mt-4 pt-4 border-t border-white/10">
        <button onclick="router.showMyProfile()" class="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 rounded-xl text-left">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white" style="background:${u.tagColor||'#2563eb'}">${u.name.charAt(0)}</div>
          <div class="flex-1 min-w-0"><p class="text-sm font-black truncate">${u.name}</p><p class="text-[9px] text-blue-400 font-bold uppercase">${u.role} · 정보수정</p></div>
          <i data-lucide="settings" class="w-4 h-4 text-slate-500"></i>
        </button>
      </div>
    </aside>`;
  },
  Header(title) {
    const u = store.currentUser;
    const unread = store.getMyUnreadCount();
    return `<header class="h-16 sticky top-0 z-40 px-8 flex items-center justify-between border-b bg-white/90 backdrop-blur-xl">
      <div><h1 class="text-base font-black">${title}</h1><span class="text-[9px] font-bold text-slate-400 uppercase">${new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</span></div>
      <div class="flex items-center gap-3">
        <button onclick="router.showNotifications()" class="relative w-10 h-10 bg-slate-50 hover:bg-blue-50 rounded-xl flex items-center justify-center"><i data-lucide="bell" class="w-5 h-5 text-slate-500"></i>${unread?`<span class="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-pulse">${unread}</span>`:''}</button>
        <button onclick="router.showMyProfile()" class="text-right hidden sm:block hover:bg-slate-50 px-3 py-1.5 rounded-xl">
          <p class="text-xs font-black flex items-center gap-1">${u.name}<i data-lucide="settings" class="w-3 h-3 text-slate-400"></i></p>
          <p class="text-[9px] text-blue-600 font-bold uppercase">${u.role}</p>
        </button>
        <button onclick="router.logout()" class="w-10 h-10 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-xl flex items-center justify-center"><i data-lucide="log-out" class="w-5 h-5"></i></button>
      </div>
    </header>`;
  },
  PropertyCard(p, access) {
    const hasB = getBookingForDate(p.id, todayStr());
    const statusText = hasB?'투숙중':p.status==='cleaning'?'청소중':'공실';
    const statusCol = hasB?'bg-blue-600':p.status==='cleaning'?'bg-amber-500':'bg-green-500';
    return `<div class="bg-white rounded-3xl shadow-sm overflow-hidden border transition-all group ${access?'hover:shadow-2xl hover:-translate-y-1 cursor-pointer':'grayscale opacity-60'}" ${access?`onclick="router.showPropActions(${p.id})"`:`onclick="toast('권한이 없습니다','error')"`}>
      <div class="relative h-48"><img src="${p.image}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
        <div class="absolute top-4 left-4 flex gap-2"><span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${statusCol} text-white">${statusText}</span><span class="px-2.5 py-1 rounded-lg text-[10px] font-black bg-white/90">${p.group||'-'}</span></div>
        ${!access?`<div class="absolute inset-0 bg-slate-900/70 flex items-center justify-center"><i data-lucide="lock" class="w-8 h-8 text-white"></i></div>`:''}
      </div>
      <div class="p-6"><h3 class="font-black text-lg truncate">${p.name}</h3><p class="text-xs text-slate-400 font-medium flex items-center gap-1 mt-1.5 mb-4"><i data-lucide="map-pin" class="w-3 h-3"></i>${p.location||'-'}</p>
      <div class="flex justify-between items-end pt-3 border-t"><div><span class="text-[9px] text-slate-400 font-black uppercase">1박</span><p class="font-black text-xl text-blue-600">${fmt(p.price)}</p></div><div class="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center"><i data-lucide="arrow-up-right" class="w-4 h-4"></i></div></div></div>
    </div>`;
  }
};