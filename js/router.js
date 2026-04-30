class Router {
  constructor() {
    window.router = this;
    this.adminTab = 'main';
    this.expenseMode = 'integrated';
    this.bkMode = 'month';
    this.staffMode = 'cal';
    this.admChatsMode = 'list';
    this._statsShowAll = false;
    this._bkDate = new Date();
    this._staffDate = new Date();
    this._mySchedDate = new Date();
    this._setupGlobalShortcuts();
  }
  
  _setupGlobalShortcuts() {
    document.addEventListener('keydown', e => {
      // Cmd/Ctrl + K → 검색
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (store.currentUser) this.openSearch();
      }
      // ESC → 검색/모달 닫기
      if (e.key === 'Escape') {
        const search = document.getElementById('search-root');
        if (!search.classList.contains('hidden')) { this.closeSearch(); return; }
        const modal = document.getElementById('modal-root');
        if (!modal.classList.contains('hidden')) closeModal();
      }
    });
  }
  
  init() {
    const hash = location.hash.replace('#','');
    if (hash.startsWith('chat/')) {
      const pid = hash.split('/')[1];
      if (!store.currentUser) { this.pendingChat = pid; this.renderLogin(); return; }
      this.go('chat', {id:pid}); return;
    }
    if (!store.currentUser) this.renderLogin();
    else this.go('home');
  }
  
  async go(r, p={}) {
    const fn = {home:this.renderHome, admin:this.renderAdmin, chat:this.renderChat, mySchedule:this.renderMySchedule}[r];
    if (fn) await fn.call(this, p);
    lucide.createIcons();
    window.scrollTo(0,0);
  }
  
  async logout() { 
    store.stopSessionTimer();
    await store.logActivity('로그아웃');
    await store.logout(); 
    location.hash=''; 
    this.renderLogin(); 
  }

  // ===== [신규] 다크모드 토글 =====
  toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('qj_dark', isDark ? '1' : '0');
    toast(isDark ? '🌙 다크 모드 활성화' : '☀️ 라이트 모드 활성화', 'success');
    // 현재 화면 다시 그리기
    if (store.currentUser) {
      const path = location.hash.replace('#','') || 'home';
      if (path.startsWith('chat/')) this.go('chat', {id: path.split('/')[1]});
      else if (path === 'admin') this.go('admin');
      else this.go('home');
    } else this.renderLogin();
  }

  // ===== [신규] 모바일 햄버거 메뉴 =====
  toggleMobileMenu() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mobile-overlay');
    if (!sb || !ov) return;
    sb.classList.toggle('open');
    ov.classList.toggle('open');
  }
  
  // 모바일에서 메뉴 클릭 시 사이드바 자동 닫힘
  closeMobileMenu() {
    if (window.innerWidth >= 1024) return; // 데스크탑은 무시
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mobile-overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('open');
  }

  // ===== [신규] 통합 검색 (Cmd+K) =====
  openSearch() {
    const root = document.getElementById('search-root');
    root.classList.remove('hidden');
    root.classList.add('flex');
    setTimeout(() => {
      const input = document.getElementById('search-input');
      input.focus();
      input.value = '';
      input.oninput = (e) => this.runSearch(e.target.value);
      this.runSearch('');
    }, 50);
    lucide.createIcons();
  }
  
  closeSearch() {
    const root = document.getElementById('search-root');
    root.classList.add('hidden');
    root.classList.remove('flex');
  }
  
  runSearch(q) {
    const results = document.getElementById('search-results');
    if (!q || q.length < 1) {
      results.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm font-bold">
        <p>🔍 통합 검색</p>
        <p class="text-xs font-medium mt-2">매물명, 고객 이름, 예약번호, 지출 내역 등을 검색하세요</p>
        <div class="flex gap-2 justify-center mt-4 text-xs">
          <span class="px-3 py-1 bg-slate-100 rounded-full">🏠 매물</span>
          <span class="px-3 py-1 bg-slate-100 rounded-full">👤 고객</span>
          <span class="px-3 py-1 bg-slate-100 rounded-full">📅 예약</span>
          <span class="px-3 py-1 bg-slate-100 rounded-full">💳 지출</span>
        </div>
      </div>`;
      return;
    }
    const ql = q.toLowerCase();
    const items = [];
    
    // 매물
    store.properties.forEach(p => {
      if (p.name.toLowerCase().includes(ql) || (p.location||'').toLowerCase().includes(ql) || (p.address||'').toLowerCase().includes(ql)) {
        if (store.hasPerm(p.id)) {
          items.push({ type:'prop', label:p.name, sub:p.location, badge:'🏠 매물', color:'bg-blue-100 text-blue-700', action:() => { this.closeSearch(); this.showPropActions(p.id); } });
        }
      }
    });
    
    // 고객 (예약자)
    const customerSet = new Set();
    store.bookings.forEach(b => {
      if (b.guest.toLowerCase().includes(ql) || (b.contact||'').includes(q)) {
        const key = b.guest + '|' + b.contact;
        if (customerSet.has(key)) return;
        customerSet.add(key);
        items.push({ type:'cust', label:b.guest, sub:`${b.contact} · ${b.platform}`, badge:'👤 고객', color:'bg-amber-100 text-amber-700', action:() => { this.closeSearch(); if(store.currentUser.role==='Admin'){this.adminTab='customers';this.go('admin');setTimeout(()=>this.showCustomerDetail(key),300)} } });
      }
    });
    
    // 예약
    store.bookings.forEach(b => {
      if (String(b.id).includes(q) || (b.memo||'').toLowerCase().includes(ql)) {
        const p = store.prop(b.propId);
        if (p && store.hasPerm(p.id)) {
          items.push({ type:'book', label:`${b.guest} - ${p.name}`, sub:`${b.checkIn} ~ ${b.checkOut} · ${fmt(b.price)}`, badge:'📅 예약', color:'bg-green-100 text-green-700', action:() => { this.closeSearch(); this.showPropActions(p.id); } });
        }
      }
    });
    
    // 지출
    if (store.currentUser.role === 'Admin') {
      store.expenses.forEach(e => {
        if ((e.category||'').toLowerCase().includes(ql) || (e.memo||'').toLowerCase().includes(ql)) {
          const p = store.prop(e.propId);
          if (!p) return;
          items.push({ type:'exp', label:`${e.category} - ${fmt(e.amount)}`, sub:`${p.name} · ${e.date}`, badge:'💳 지출', color:'bg-red-100 text-red-700', action:() => { this.closeSearch(); this.adminTab='expenses'; this.go('admin'); } });
        }
      });
    }
    
    if (!items.length) {
      results.innerHTML = `<div class="p-8 text-center text-slate-400 text-sm font-bold">
        <i data-lucide="search-x" class="w-12 h-12 mx-auto mb-3 text-slate-200"></i>
        <p>"${q}"에 대한 검색 결과가 없습니다</p>
      </div>`;
    } else {
      results.innerHTML = items.slice(0, 30).map((r,i) => `
        <div class="search-result-item" onclick="router._searchClick(${i})">
          <span class="badge ${r.color}">${r.badge}</span>
          <div class="flex-1 min-w-0">
            <p class="font-black text-sm truncate">${r.label}</p>
            <p class="text-xs text-slate-500 truncate">${r.sub}</p>
          </div>
          <i data-lucide="arrow-right" class="w-4 h-4 text-slate-300"></i>
        </div>
      `).join('');
      this._searchActions = items.slice(0, 30).map(r => r.action);
    }
    lucide.createIcons();
  }
  
  _searchClick(i) {
    if (this._searchActions && this._searchActions[i]) this._searchActions[i]();
  }

  // ===== 로그인 (사이트 설정 반영 + 보안) =====
  renderLogin() {
    const cfg = store.siteConfig || { title:'QJ-PropMS', subtitle:'하이브리드 단기렌트 통합 관리', logoEmoji:'🏢', loginNotice:'🔑 테스트 계정 (PW: 1234)\nadmin / manager1 / manager2 / staff1', primaryColor:'#2563eb' };
    document.getElementById('app-root').innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
        <div class="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5 overflow-hidden" style="background:${cfg.primaryColor||'#2563eb'}">${cfg.logoImage ? `<img src="${cfg.logoImage}" class="w-full h-full object-cover">` : `<span class="text-5xl">${cfg.logoEmoji||'🏢'}</span>`}</div>
            <h2 class="text-3xl font-black">${cfg.title||'QJ-PropMS'}</h2>
            <p class="text-slate-400 text-sm mt-2 font-medium">${cfg.subtitle||'하이브리드 단기렌트 통합 관리'}</p>
          </div>
          <form id="login-form" class="space-y-4">
            <input type="text" id="uid" placeholder="ID" class="w-full px-5 py-4 rounded-2xl border focus:ring-4 focus:ring-blue-100 outline-none font-bold text-sm" autocomplete="username">
            <input type="password" id="upw" placeholder="Password" class="w-full px-5 py-4 rounded-2xl border focus:ring-4 focus:ring-blue-100 outline-none font-bold text-sm" autocomplete="current-password">
            <div id="otp-block" class="hidden"><input type="text" id="otp" placeholder="2단계 인증 코드 (6자리)" maxlength="6" class="w-full px-5 py-4 rounded-2xl border-2 border-amber-300 focus:ring-4 focus:ring-amber-100 outline-none font-bold text-center text-2xl tracking-widest"></div>
            <button type="submit" id="login-btn" class="w-full text-white py-4 rounded-2xl font-black hover:opacity-90 transition shadow-lg uppercase tracking-widest text-sm" style="background:${cfg.primaryColor||'#0f172a'}">Access System</button>
          </form>
          ${cfg.loginNotice?`<div class="mt-6 p-4 bg-blue-50 rounded-2xl text-[11px] text-blue-700 font-bold whitespace-pre-line">${cfg.loginNotice}</div>`:''}
          ${cfg.footerText?`<p class="text-center text-[10px] text-slate-400 font-bold mt-6">${cfg.footerText}</p>`:''}
        </div>
      </div>`;
    document.getElementById('login-form').onsubmit = async e => {
      e.preventDefault();
      const id = document.getElementById('uid').value.trim();
      const pw = document.getElementById('upw').value;
      const btn = document.getElementById('login-btn');
      btn.disabled = true; btn.textContent = 'Loading...';
      const ok = await store.login(id, pw);
      if (ok) {
        // 2FA 체크
        const u = store.currentUser;
        if (u.use2FA && u.otpSecret) {
          document.getElementById('otp-block').classList.remove('hidden');
          const otp = document.getElementById('otp').value;
          if (!otp || otp !== u.otpSecret) {
            toast('2단계 인증 코드를 입력하세요', 'warning');
            await store.logout();
            btn.disabled = false; btn.textContent = 'Access System';
            return;
          }
        }
        await store.logActivity('로그인 성공');
        store.startSessionTimer();
        if (this.pendingChat) { const p = this.pendingChat; this.pendingChat = null; this.go('chat',{id:p}); return; }
        await this.go('home');
        // 체크인 알림 자동 발송
        setTimeout(() => store.checkScheduledNotifications(), 1000);
        toast(`환영합니다, ${store.currentUser.name}`, 'success');
      } else { 
        await store.logActivity('로그인 실패');
        toast('로그인 실패', 'error'); 
        btn.disabled = false; btn.textContent = 'Access System'; 
      }
    };
    lucide.createIcons();
  }

  // ===== 알림 (클릭 시 화면 이동) =====
  async showNotifications() {
    const list = store.getMyNotifs();
    const ic = {info:'info',success:'check-circle',warning:'alert-triangle',error:'x-circle'};
    const cl = {info:'text-blue-500 bg-blue-50',success:'text-green-500 bg-green-50',warning:'text-amber-500 bg-amber-50',error:'text-red-500 bg-red-50'};
    openModal('🔔 내 알람 통합 보기', `
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs font-bold text-blue-700">💡 알림 클릭 시 해당 화면으로 자동 이동</div>
      <div class="mb-4 flex justify-between items-center">
        <div><p class="text-sm font-black">${store.currentUser.name}님의 알림</p><p class="text-xs text-slate-400 mt-0.5">총 ${list.length}건 · 읽지않음 ${store.getMyUnreadCount()}건</p></div>
        ${list.length?`<button onclick="(async()=>{await store.markAllRead();router.showNotifications()})()" class="text-xs text-blue-600 font-black">모두 읽음</button>`:''}
      </div>
      <div class="space-y-2 max-h-[60vh] overflow-y-auto scrollbar">
        ${list.length?list.map((n,i)=>`<div onclick='router.handleNotifClick(${i})' class="p-4 ${n.read?'bg-slate-50':'bg-white border-l-4 border-blue-500 shadow-sm'} rounded-xl flex items-start gap-3 cursor-pointer hover:bg-blue-50 transition"><div class="w-9 h-9 rounded-lg flex items-center justify-center ${cl[n.type]||cl.info}"><i data-lucide="${ic[n.type]||'bell'}" class="w-4 h-4"></i></div><div class="flex-1"><p class="text-sm ${n.read?'font-medium text-slate-500':'font-bold'}">${n.message}</p><p class="text-[10px] text-slate-400 font-bold mt-1">${n.time}${n.link?' · 클릭하여 이동 →':''}</p></div></div>`).join(''):'<div class="py-16 text-center text-slate-400"><i data-lucide="bell-off" class="w-12 h-12 mx-auto mb-3 text-slate-200"></i><p class="font-bold">알림 없음</p></div>'}
      </div>`, 'max-w-2xl');
    setTimeout(async()=>{ await store.markAllRead(); }, 1500);
  }
  
  async handleNotifClick(idx) {
    const list = store.getMyNotifs();
    const n = list[idx];
    if (!n || !n.link) return;
    closeModal();
    const link = n.link;
    if (link.type === 'home') await this.go('home');
    else if (link.type === 'detail') { await this.go('home'); setTimeout(()=>this.showPropActions(link.propId),200); }
    else if (link.type === 'chat') { await this.go('home'); setTimeout(()=>this.showChatBox(link.propId),200); }
    else if (link.type === 'schedule') await this.go('mySchedule');
    else if (link.type === 'admin' && store.currentUser.role==='Admin') {
      this.adminTab = link.tab || 'main';
      await this.go('admin');
    }
  }

  // ===== 프로필 (비밀번호 정책 적용) =====
  showMyProfile() {
    const u = store.currentUser;
    const myReqs = store.profileRequests.filter(r => r.userId === u.id).slice(0,5);
    const pending = myReqs.find(r => r.status === 'pending');
    openModal(`👤 내 정보 - ${u.name}`, `
      <div class="space-y-6">
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl flex items-center gap-4">
          <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black bg-white/20">${u.name.charAt(0)}</div>
          <div class="flex-1"><p class="text-[10px] font-black uppercase opacity-70">현재 정보</p><p class="text-xl font-black mt-1">${u.name}</p><p class="text-xs font-bold opacity-80 mt-1">${u.role} · ${u.id}</p></div>
        </div>
        ${pending?`<div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3"><i data-lucide="clock" class="w-5 h-5 text-amber-600"></i><div><p class="text-sm font-black text-amber-800">변경 요청 승인 대기 중</p></div></div>`:''}
        <form id="profile-form" class="space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-bold text-blue-700">정보 변경 시 관리자 승인 후 적용됩니다.</div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">아이디 (변경불가)</label><input value="${u.id}" disabled class="w-full p-3 border rounded-xl font-bold mt-1 bg-slate-100 text-slate-400"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">이름</label><input type="text" name="name" value="${u.name}" class="w-full p-3 border rounded-xl font-bold mt-1" required></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">핸드폰번호</label><input type="text" name="contact" value="${u.contact||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">이메일</label><input type="email" name="email" value="${u.email||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">새 비밀번호 (변경시만)</label><input type="password" name="pw" id="pw-new" placeholder="비워두면 유지" class="w-full p-3 border rounded-xl font-bold mt-1" oninput="router._checkPwStrength(this.value)"><div id="pw-strength" class="text-[10px] font-bold mt-1"></div></div>
          <button type="submit" ${pending?'disabled':''} class="w-full ${pending?'bg-slate-300':'bg-slate-900 hover:bg-blue-600'} text-white py-4 rounded-xl font-black uppercase">${pending?'⏳ 처리 대기 중':'📝 변경 요청'}</button>
        </form>
      </div>`, 'max-w-2xl');
    if (!pending) {
      document.getElementById('profile-form').onsubmit = async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const changes = {};
        if (d.name && d.name !== u.name) changes.name = d.name;
        if (d.contact !== u.contact) changes.contact = d.contact;
        if (d.email !== u.email) changes.email = d.email;
        if (d.pw && d.pw !== u.pw) {
          const v = store.validatePassword(d.pw);
          if (!v.valid) { toast('비밀번호: ' + v.errors.join(', '), 'error'); return; }
          changes.pw = d.pw;
        }
        if (!Object.keys(changes).length) { toast('변경사항 없음','error'); return; }
        await store.requestProfileChange(changes);
        toast('변경 요청 접수!','success');
        closeModal();
      };
    }
    lucide.createIcons();
  }
  
  _checkPwStrength(pw) {
    const el = document.getElementById('pw-strength');
    if (!el || !pw) { if(el) el.innerHTML=''; return; }
    const v = store.validatePassword(pw);
    const colors = ['text-red-500','text-red-400','text-amber-500','text-blue-500','text-green-500','text-emerald-600'];
    const bars = '█'.repeat(v.strength) + '░'.repeat(5 - v.strength);
    el.innerHTML = `<span class="${colors[v.strength]}">${bars} ${v.strengthLabel}</span> ${v.errors.length?`<span class="text-red-500 ml-2">⚠ ${v.errors.join(', ')}</span>`:''}`;
  }

  // ===== 홈 =====
    async renderHome() {
    const u = store.currentUser;
    const props = store.properties.filter(p => store.hasPerm(p.id) && !p.hidden);
    const t = todayStr();
    const stats = {
      occupied: props.filter(p => getBookingForDate(p.id,t)).length,
      empty: props.filter(p => !getBookingForDate(p.id,t) && p.status!=='cleaning').length,
      cleaning: props.filter(p => p.status==='cleaning').length
    };
    const grouped = {};
    props.forEach(p => { const g=p.group||'기타'; if(!grouped[g])grouped[g]=[]; grouped[g].push(p); });
    const upcomingSched = store.schedule.filter(s => s.staff===u.name && s.date>=t).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
    const todayCheckIn = store.bookings.filter(b => b.checkIn === t && store.hasPerm(b.propId) && !store.prop(b.propId)?.hidden);
    const todayCheckOut = store.bookings.filter(b => b.checkOut === t && store.hasPerm(b.propId) && !store.prop(b.propId)?.hidden);
    const cfg = store.siteConfig || {};
    const welcome = cfg.welcomeMessage || '안녕하세요';
    
    document.getElementById('app-root').innerHTML = `<div class="flex min-h-screen">${UI.Sidebar('home')}<main class="flex-1 bg-slate-50 min-h-screen">${UI.Header('대시보드')}<div class="p-8 max-w-[1600px] mx-auto"><div class="flex justify-between items-end mb-8 flex-wrap gap-3"><div><h2 class="text-3xl font-black">${welcome}, ${u.name.replace(/\(.*\)/,'')} 👋</h2><p class="text-slate-500 font-medium mt-1">오늘 ${t} · ${props.length}개 숙소</p></div><div class="flex gap-2 flex-wrap"><button onclick="router.go('mySchedule')" class="bg-purple-600 text-white px-5 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2"><i data-lucide="calendar" class="w-4 h-4"></i>내 스케줄</button>${u.role==='Admin'?`<button onclick="router.go('admin')" class="bg-amber-500 text-white px-6 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2"><i data-lucide="shield-check" class="w-4 h-4"></i>관리자</button>`:''}</div></div>
    ${(todayCheckIn.length || todayCheckOut.length)?`<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">${todayCheckIn.length?`<div class="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-5 rounded-2xl"><h3 class="font-black mb-3 flex items-center gap-2"><i data-lucide="log-in" class="w-5 h-5"></i>🟢 오늘 체크인 (${todayCheckIn.length}건)</h3><div class="space-y-2">${todayCheckIn.map(b=>`<div class="bg-white/10 rounded-xl p-2.5 flex justify-between items-center cursor-pointer hover:bg-white/20" onclick="router.showPropActions(${b.propId})"><span class="text-sm font-bold">${b.guest} - ${store.prop(b.propId)?.name||'-'}</span><span class="text-xs opacity-80">${b.platform}</span></div>`).join('')}</div></div>`:''}${todayCheckOut.length?`<div class="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-5 rounded-2xl"><h3 class="font-black mb-3 flex items-center gap-2"><i data-lucide="log-out" class="w-5 h-5"></i>🔴 오늘 체크아웃 (${todayCheckOut.length}건)</h3><div class="space-y-2">${todayCheckOut.map(b=>`<div class="bg-white/10 rounded-xl p-2.5 flex justify-between items-center cursor-pointer hover:bg-white/20" onclick="router.showPropActions(${b.propId})"><span class="text-sm font-bold">${b.guest} - ${store.prop(b.propId)?.name||'-'}</span><span class="text-xs opacity-80">청소 필요</span></div>`).join('')}</div></div>`:''}</div>`:''}
    ${upcomingSched.length?`<div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-5 rounded-2xl mb-6 cursor-pointer hover:shadow-xl transition" onclick="router.go('mySchedule')"><div class="flex items-center justify-between mb-3"><h3 class="font-black flex items-center gap-2"><i data-lucide="calendar-clock" class="w-5 h-5"></i>다가오는 내 스케줄 (${upcomingSched.length}건)</h3><span class="text-xs opacity-80 font-bold">전체보기 →</span></div><div class="space-y-2">${upcomingSched.map(s=>`<div class="bg-white/10 rounded-xl p-3 flex justify-between"><div><p class="text-sm font-black">${s.task}</p><p class="text-[10px] opacity-70">${store.prop(s.propId)?.name||'-'}</p></div><div class="text-right"><p class="text-sm font-black">${s.date}</p><p class="text-[10px] opacity-80">${s.time}</p></div></div>`).join('')}</div></div>`:''}
    <div class="grid grid-cols-3 gap-4 mb-8 mobile-stack"><div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">투숙중</p><p class="text-3xl font-black text-blue-600 mt-2">${stats.occupied}</p></div><div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">공실</p><p class="text-3xl font-black text-green-500 mt-2">${stats.empty}</p></div><div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">청소중</p><p class="text-3xl font-black text-amber-500 mt-2">${stats.cleaning}</p></div></div>
    ${props.length?Object.entries(grouped).map(([g,list])=>`<div class="mb-10"><h3 class="text-lg font-black mb-4 flex items-center gap-2"><span class="w-1.5 h-6 bg-blue-600 rounded-full"></span>${g} <span class="text-xs text-slate-400 font-bold">(${list.length})</span></h3><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mobile-stack">${list.map(p=>UI.PropertyCard(p,true)).join('')}</div></div>`).join(''):UI.Empty('home','등록된 숙소가 없습니다',u.role==='Admin'?'관리자 오피스에서 매물을 등록하세요':'관리자에게 권한 요청을 해주세요',u.role==='Admin'?'+ 매물 등록':'',u.role==='Admin'?'router.adminTab="props";router.go("admin")':'')}
    </div></main></div>`;
    lucide.createIcons();
  }

  // ===== 매물 액션 (다음 PART에서 이어짐) =====
  // showPropActions, showBookingCalendar, showBookingForm, showPropDetail, showChatBox, renderChat, renderMySchedule
  // 등은 PART 5에서 이어집니다
  // ===== 매물 액션 =====
  showPropActions(propId) {
    const p = store.prop(propId);
    if (!p) { toast('매물을 찾을 수 없습니다','error'); return; }
    const url = `${location.origin}${location.pathname}#chat/${propId}`;
    const img = p.image || (p.images && p.images[p.mainImage||0]) || 'https://via.placeholder.com/400x256';
    openModal(`🏠 ${p.name}`, `<div class="grid grid-cols-1 md:grid-cols-5 gap-6"><div class="md:col-span-2"><img src="${img}" class="w-full h-64 object-cover rounded-2xl" onerror="this.src='https://via.placeholder.com/400x256'"><h3 class="text-xl font-black mt-4">${p.name}</h3><p class="text-sm text-slate-500 mt-1">${p.location||''}</p><p class="text-2xl font-black text-blue-600 mt-3">${fmt(p.price)}<span class="text-xs">/박</span></p></div><div class="md:col-span-3 space-y-3"><button onclick="router.showBookingCalendar(${propId})" class="w-full bg-slate-900 text-white p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="calendar-check" class="w-6 h-6"></i><div class="text-left flex-1"><p>1. 예약 확인</p></div></button>${store.canEdit(propId)?`<button onclick="closeModal();router.showBookingForm(${propId})" class="w-full bg-blue-600 text-white p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="plus-circle" class="w-6 h-6"></i><div class="text-left flex-1"><p>2. 예약 하기</p></div></button>`:''}<button onclick="router.showPropDetail(${propId})" class="w-full bg-white border-2 p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="info" class="w-6 h-6"></i><div class="text-left flex-1"><p>3. 세부 정보</p></div></button><button onclick="router.showChatBox(${propId})" class="w-full bg-green-500 text-white p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="message-circle" class="w-6 h-6"></i><div class="text-left flex-1"><p>4. 특이사항</p></div></button><div class="bg-blue-50 p-4 rounded-2xl"><p class="text-[10px] font-black text-blue-500 uppercase mb-2">🔗 채팅 링크</p><div class="flex gap-2"><input type="text" readonly value="${url}" class="flex-1 px-3 py-2 rounded-xl bg-white text-xs font-mono border"><button onclick="navigator.clipboard.writeText('${url}');toast('복사됨','success')" class="px-3 py-2 bg-blue-600 text-white rounded-xl"><i data-lucide="copy" class="w-4 h-4"></i></button></div></div></div></div>`, 'max-w-4xl');
    lucide.createIcons();
  }

  showBookingCalendar(propId, y, m) {
    const p = store.prop(propId);
    const now = new Date();
    const year = y ?? now.getFullYear();
    const month = m ?? now.getMonth();
    window._calPropId = propId;
    openModal(`📅 ${p.name}`, `<div class="flex justify-between items-center mb-6 flex-wrap gap-2"><div class="flex items-center gap-2"><button onclick="router.showBookingCalendar(${propId},${month===0?year-1:year},${month===0?11:month-1})" class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center"><i data-lucide="chevron-left" class="w-5 h-5"></i></button><h3 class="text-2xl font-black px-4">${year}년 ${month+1}월</h3><button onclick="router.showBookingCalendar(${propId},${month===11?year+1:year},${month===11?0:month+1})" class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center"><i data-lucide="chevron-right" class="w-5 h-5"></i></button><button onclick="router.showBookingCalendar(${propId})" class="bg-blue-600 text-white px-3 py-2 rounded-xl font-black text-xs">오늘</button></div><div class="flex items-center gap-2 text-xs font-bold flex-wrap">${store.platforms.map(pl=>`<span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:${pl.color}"></span>${pl.name}</span>`).join('')}</div></div><div class="bg-slate-50 p-4 rounded-2xl">${buildCalendar(year, month, propId, 'router.onCalendarClick')}</div>`, 'max-w-5xl');
    lucide.createIcons();
  }
  
  onCalendarClick(date, bookingId) {
    if (bookingId) {
      const b = store.bookings.find(x => x.id === bookingId);
      if (!store.canEdit(b.propId)) { toast('수정 권한 없음','error'); return; }
      this.showBookingForm(b.propId, b);
    } else {
      if (!store.canEdit(window._calPropId)) { toast('예약 권한 없음','error'); return; }
      this.showBookingForm(window._calPropId, null, date);
    }
  }

  showBookingForm(propId, booking=null, prefill=null) {
    const p = store.prop(propId);
    const b = booking || {};
    const isEdit = !!booking;
    openModal(`${isEdit?'✏️':'🆕'} ${p.name}`, `<form id="bk-form" class="space-y-5"><div class="grid grid-cols-2 gap-4"><div><label class="text-[10px] font-black text-slate-400 uppercase">체크인</label><input type="date" name="checkIn" value="${b.checkIn||prefill||todayStr()}" class="w-full p-3 border rounded-xl font-bold mt-1" required></div><div><label class="text-[10px] font-black text-slate-400 uppercase">체크아웃</label><input type="date" name="checkOut" value="${b.checkOut||''}" class="w-full p-3 border rounded-xl font-bold mt-1" required></div></div><div class="grid grid-cols-2 gap-4"><input name="guest" value="${b.guest||''}" placeholder="예약자" class="w-full p-3 border rounded-xl font-bold" required><input name="contact" value="${b.contact||''}" placeholder="연락처" class="w-full p-3 border rounded-xl font-bold" required></div><div class="grid grid-cols-3 gap-4"><input name="nationality" value="${b.nationality||'한국'}" placeholder="국적" class="w-full p-3 border rounded-xl font-bold"><input type="number" name="people" value="${b.people||2}" min="1" placeholder="인원" class="w-full p-3 border rounded-xl font-bold"><select name="platform" class="w-full p-3 border rounded-xl font-bold">${store.platforms.map(pl=>`<option ${b.platform===pl.name?'selected':''}>${pl.name}</option>`).join('')}</select></div><div class="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl text-white"><div class="flex justify-between mb-3 text-xs"><span class="opacity-80 font-bold">원가 (1박)</span><span class="font-black">${fmt(p.cost)}</span></div><div class="flex justify-between mb-3 text-xs"><span class="opacity-80 font-bold">기본가 (1박)</span><span class="font-black">${fmt(p.price)}</span></div><div class="flex justify-between mb-2 text-xs" id="ni"><span class="opacity-80 font-bold">숙박일 × 원가</span><span class="font-black" id="ct">₩0</span></div><div class="flex justify-between mb-4 text-xs"><span class="opacity-80 font-bold">기본가 × 숙박일</span><span class="font-black" id="sp">₩0</span></div><input type="number" name="price" value="${b.price||p.price}" placeholder="최종 가격" class="w-full p-4 bg-white/10 border-2 border-white/20 rounded-xl text-2xl font-black outline-none focus:border-white" required></div><textarea name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold h-20">${b.memo||''}</textarea><div class="flex gap-3"><button type="submit" class="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black">${isEdit?'예약 수정':'예약 등록'}</button>${isEdit?`<button type="button" onclick="router.deleteBooking(${booking.id})" class="px-8 bg-red-50 text-red-500 rounded-xl font-black">예약 취소</button>`:''}</div></form>`, 'max-w-3xl');
    const f = document.getElementById('bk-form');
    const upd = () => {
      const ci=f.checkIn.value, co=f.checkOut.value;
      if (ci&&co) { const n=daysBetween(ci,co); f.querySelector('#ni span:first-child').textContent=`${n}박 × 원가`; f.querySelector('#ct').textContent=fmt(n*p.cost); f.querySelector('#sp').textContent=fmt(n*p.price); }
    };
    f.checkIn.onchange = f.checkOut.onchange = upd; upd();
    f.onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (d.checkIn >= d.checkOut) { toast('체크아웃은 체크인 이후','error'); return; }
      const conflict = store.bookings.find(bk => bk.propId===propId && bk.id!==booking?.id && !(d.checkOut<=bk.checkIn || d.checkIn>=bk.checkOut));
      if (conflict) {
        toast(`⚠️ 예약 충돌: ${conflict.guest} (${conflict.checkIn}~${conflict.checkOut})`,'error');
        await store.notifyAdmins(`⚠️ 예약 충돌 시도: ${p.name} (${d.guest}님이 ${conflict.guest}님 기간과 겹침)`, 'warning', { type:'detail', propId });
        return;
      }
      d.propId = propId;
      showLoading(true);
      try {
        if (isEdit) await store.updateBooking(booking.id, d);
        else { await store.addBooking(d); store.sendKakaoNotification(`${p.name} 신규 예약: ${d.guest}님 ${d.checkIn}~${d.checkOut}`); }
        toast(isEdit?'수정됨':'등록됨','success');
        closeModal();
        if (document.querySelector('[data-admin]')) await this.renderAdminTab();
      } catch(err) { toast('실패: '+err.message,'error'); } finally { showLoading(false); }
    };
    lucide.createIcons();
  }
  
  async deleteBooking(id) {
    if (!confirm('예약을 취소하시겠습니까?')) return;
    showLoading(true);
    try { await store.delBooking(id); toast('취소됨','success'); closeModal(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

  showPropDetail(propId) {
    const p = store.prop(propId);
    const mgr = store.user(p.manager);
    const images = p.images && p.images.length ? p.images : (p.image ? [p.image] : []);
    const mainIdx = p.mainImage || 0;
    const main = images[mainIdx] || images[0] || '';
    openModal(`ℹ️ ${p.name}`, `${main?`<img src="${main}" id="mainPropImg" class="w-full h-72 object-cover rounded-2xl mb-4">`:''}${images.length>1?`<div class="flex gap-2 mb-6 overflow-x-auto pb-2">${images.map((img,i)=>`<img src="${img}" class="w-24 h-20 object-cover rounded-lg cursor-pointer flex-shrink-0 ${i===mainIdx?'ring-2 ring-blue-500':''}" onclick="document.getElementById('mainPropImg').src='${img}'">`).join('')}</div>`:'<div class="mb-6"></div>'}<p class="text-sm bg-slate-50 p-6 rounded-2xl mb-6">${p.description||'-'}</p><div class="grid grid-cols-2 gap-3 text-sm mb-4">${[['그룹',p.group],['주소',p.address],['1박',fmt(p.price)],['원가',fmt(p.cost)],['담당',mgr?.name||'-'],['수리',p.repair],['청소',p.cleaning],['가스',p.gas],['인터넷',p.internet],['분리수거',p.recycleDay],['비밀번호',p.password],['관리실',p.office]].map(([k,v])=>`<div class="bg-white p-4 rounded-xl border"><p class="text-[10px] font-black text-slate-400 uppercase">${k}</p><p class="font-bold mt-1">${v||'-'}</p></div>`).join('')}</div>${p.customFields&&p.customFields.length?`<div class="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4"><p class="text-xs font-black text-amber-700 uppercase mb-3">📌 추가 운영 정보</p><div class="grid grid-cols-2 gap-2 text-sm">${p.customFields.map(cf=>`<div class="bg-white p-3 rounded-lg"><p class="text-[10px] font-black text-amber-600 uppercase">${cf.label}</p><p class="font-bold mt-1">${cf.value||'-'}</p></div>`).join('')}</div></div>`:''}`, 'max-w-4xl');
  }

    showChatBox(propId) {
    const p = store.prop(propId);
    const chats = store.chats.filter(c => c.propId === propId);
    const url = `${location.origin}${location.pathname}#chat/${propId}`;
    
    openModal(`💬 ${p.name}`, `
      <div class="bg-blue-50 p-3 rounded-xl mb-4 flex items-center gap-2 text-xs">
        <i data-lucide="link" class="w-4 h-4 text-blue-600"></i>
        <code class="flex-1 font-mono text-blue-700 truncate">${url}</code>
        <button onclick="navigator.clipboard.writeText('${url}');toast('복사','success')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold flex-shrink-0">복사</button>
      </div>
      <div id="cb" class="h-96 overflow-y-auto scrollbar bg-slate-50 rounded-2xl p-4 space-y-4 mb-4">
        ${chats.length ? chats.map((c, i) => {
          const isAdmin = c.role === 'Admin';
          const isMgr = c.role === 'Manager';
          const align = isAdmin ? 'items-end' : 'items-start';
          const bg = isAdmin ? 'bg-slate-900 text-white' : isMgr ? 'bg-blue-500 text-white' : 'bg-white border';
          const hasImage = c.image;
          const hasText = c.message && c.message.trim();
          return `<div class="flex flex-col ${align}">
            <p class="text-[9px] font-black text-slate-400 mb-1">${c.sender} · ${c.time}</p>
            ${hasImage ? `
              <div class="max-w-[75%] mb-1 group relative">
                <img src="${c.image}" class="rounded-2xl max-h-64 object-cover cursor-pointer hover:opacity-90 transition" onclick="router.viewChatImage('${c.image}', '${c.sender}_${c.time}')">
                <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onclick="router.downloadChatImage('${c.image}', '${c.sender}_${c.time}')" class="w-8 h-8 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow" title="다운로드">
                    <i data-lucide="download" class="w-4 h-4 text-slate-700"></i>
                  </button>
                  <button onclick="router.shareChatImage('${c.image}', '${c.sender}_${c.time}')" class="w-8 h-8 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center shadow" title="공유">
                    <i data-lucide="share-2" class="w-4 h-4 text-slate-700"></i>
                  </button>
                </div>
              </div>
            ` : ''}
            ${hasText ? `<div class="max-w-[75%] p-3 rounded-2xl text-sm font-medium ${bg}">${c.message}</div>` : ''}
          </div>`;
        }).join('') : '<p class="text-center text-slate-400 py-16">대화 없음</p>'}
      </div>
      
      <div id="imgPreviewArea" class="hidden mb-3 p-3 bg-blue-50 rounded-xl">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-black text-blue-700">📷 첨부할 이미지</p>
          <button onclick="router.cancelChatImage()" class="text-red-500 text-xs font-black">✕ 취소</button>
        </div>
        <img id="chatImgPreview" class="max-h-32 rounded-lg">
      </div>
      
      <form id="cf" class="flex gap-2">
        <label class="px-3 py-3 bg-slate-100 hover:bg-blue-100 rounded-xl cursor-pointer flex items-center justify-center" title="사진 첨부">
          <i data-lucide="image" class="w-5 h-5 text-slate-600"></i>
          <input type="file" id="chatImgInput" accept="image/*" class="hidden">
        </label>
        <input id="ci" class="flex-1 px-4 py-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" placeholder="메시지 또는 사진...">
        <button class="px-5 bg-blue-600 text-white rounded-xl font-black"><i data-lucide="send" class="w-4 h-4"></i></button>
      </form>
    `, 'max-w-3xl');
    
    document.getElementById('cb').scrollTop = 999999;
    this._chatPendingImage = null;
    
    // 이미지 선택 핸들러
    document.getElementById('chatImgInput').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      showLoading(true);
      try {
        const dataUrl = await store.uploadChatImage(file);
        this._chatPendingImage = dataUrl;
        document.getElementById('chatImgPreview').src = dataUrl;
        document.getElementById('imgPreviewArea').classList.remove('hidden');
        toast('이미지 첨부됨','success');
      } catch(err) {
        toast('실패: ' + err.message, 'error');
      } finally {
        showLoading(false);
        e.target.value = '';
      }
    };
    
    // 메시지 전송
    document.getElementById('cf').onsubmit = async e => {
      e.preventDefault();
      const i = document.getElementById('ci');
      const msg = i.value.trim();
      const img = this._chatPendingImage;
      if (!msg && !img) return;
      
      showLoading(true);
      try {
        await store.addChat(propId, msg, img);
        this._chatPendingImage = null;
        this.showChatBox(propId);
      } catch(err) {
        toast('전송 실패: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
    
    lucide.createIcons();
  }
  
  // ===== [v3.2] 채팅 이미지 액션 =====
  cancelChatImage() {
    this._chatPendingImage = null;
    document.getElementById('imgPreviewArea').classList.add('hidden');
    document.getElementById('chatImgPreview').src = '';
    toast('취소됨', 'info');
  }
  
  viewChatImage(imageData, filename) {
    openModal('🖼️ 이미지 보기', `
      <div class="text-center">
        <img src="${imageData}" class="max-w-full max-h-[70vh] mx-auto rounded-xl">
        <div class="flex gap-3 justify-center mt-4">
          <button onclick="router.downloadChatImage('${imageData}', '${filename}')" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black flex items-center gap-2">
            <i data-lucide="download" class="w-4 h-4"></i>다운로드
          </button>
          <button onclick="router.shareChatImage('${imageData}', '${filename}')" class="bg-green-600 text-white px-5 py-3 rounded-xl font-black flex items-center gap-2">
            <i data-lucide="share-2" class="w-4 h-4"></i>공유
          </button>
        </div>
      </div>
    `, 'max-w-4xl');
    lucide.createIcons();
  }
  
  downloadChatImage(imageData, filename) {
    try {
      const a = document.createElement('a');
      a.href = imageData;
      a.download = `chat_${filename.replace(/[^a-zA-Z0-9가-힣_-]/g,'_')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('📥 다운로드 시작', 'success');
    } catch(e) {
      toast('다운로드 실패: ' + e.message, 'error');
    }
  }
  
  async shareChatImage(imageData, filename) {
    try {
      const res = await fetch(imageData);
      const blob = await res.blob();
      const file = new File([blob], `chat_${filename}.jpg`, { type: 'image/jpeg' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'QJ-PMS 채팅 이미지',
          text: '채팅에서 공유된 이미지'
        });
        toast('✅ 공유 완료', 'success');
      } else {
        // Web Share API 미지원 시 클립보드 복사
        if (navigator.clipboard && navigator.clipboard.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/jpeg': blob })]);
          toast('📋 클립보드에 복사됨', 'success');
        } else {
          this.downloadChatImage(imageData, filename);
          toast('💡 공유 미지원 → 다운로드로 대체', 'info');
        }
      }
    } catch(e) {
      console.error('Share failed:', e);
      toast('공유 실패: ' + e.message, 'error');
    }
  }
  
  async renderChat(params) { await this.renderHome(); setTimeout(() => this.showChatBox(+params.id), 100); }

  // ===== 내 스케줄 =====
  async renderMySchedule() {
    const u = store.currentUser;
    const cur = this._mySchedDate;
    const year = cur.getFullYear(), month = cur.getMonth();
    const myList = store.schedule.filter(s => s.staff === u.name).sort((a,b)=>a.date.localeCompare(b.date));
    const monthList = myList.filter(s => s.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`));
    document.getElementById('app-root').innerHTML = `<div class="flex min-h-screen">${UI.Sidebar('mySchedule')}<main class="flex-1 bg-slate-50 min-h-screen">${UI.Header('내 스케줄')}<div class="p-8 max-w-[1600px] mx-auto"><div class="flex justify-between items-center mb-6 flex-wrap gap-3"><div><h2 class="text-3xl font-black">📅 내 스케줄</h2><p class="text-slate-500 mt-1">관리자 배정 + 본인 등록 통합 (양방향 알림 연동)</p></div><div class="flex gap-2 items-center flex-wrap"><button onclick="router._mySchedDate.setMonth(router._mySchedDate.getMonth()-1);router.go('mySchedule')" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-left" class="w-4 h-4"></i></button><h3 class="text-xl font-black px-4">${year}년 ${month+1}월</h3><button onclick="router._mySchedDate.setMonth(router._mySchedDate.getMonth()+1);router.go('mySchedule')" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-right" class="w-4 h-4"></i></button><button onclick="router._mySchedDate=new Date();router.go('mySchedule')" class="bg-blue-600 text-white px-4 py-3 rounded-xl font-black text-sm">오늘</button><button onclick="router.showMyScheduleForm()" class="bg-purple-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 스케줄 등록</button></div></div><div class="grid grid-cols-3 gap-4 mb-6 mobile-stack"><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">이번달</p><p class="text-2xl font-black text-purple-600 mt-2">${monthList.length}건</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">전체 예정</p><p class="text-2xl font-black text-blue-600 mt-2">${myList.filter(s=>s.date>=todayStr()).length}건</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">오늘</p><p class="text-2xl font-black text-amber-500 mt-2">${myList.filter(s=>s.date===todayStr()).length}건</p></div></div><div class="bg-white p-6 rounded-2xl border mb-6"><h3 class="text-xl font-black mb-4">📆 캘린더</h3>${this._buildScheduleCalendar(year,month,myList)}</div><div class="bg-white rounded-2xl border overflow-hidden"><div class="p-4 border-b bg-slate-50"><h3 class="font-black text-sm uppercase">📋 ${year}년 ${month+1}월 스케줄</h3></div><div class="overflow-x-auto"><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr><th class="px-4 py-3 text-left">일시</th><th class="px-4 py-3 text-left">숙소</th><th class="px-4 py-3 text-left">업무</th><th class="px-4 py-3 text-left">알람</th><th class="px-4 py-3 text-left">메모</th><th class="px-4 py-3 text-left">등록자</th><th class="px-4 py-3"></th></tr></thead><tbody class="text-sm divide-y">${monthList.length?monthList.map(s=>{const isMine=s.createdBy===u.id;return `<tr class="hover:bg-blue-50/30"><td class="px-4 py-3 font-black">${s.date} ${s.time}</td><td class="px-4 py-3 text-xs">${store.prop(s.propId)?.name||'-'}</td><td class="px-4 py-3">${s.task}</td><td class="px-4 py-3 text-xs">${(s.alarm||[]).map(a=>a+'분').join(', ')||'없음'}</td><td class="px-4 py-3 text-xs text-slate-500">${s.memo||'-'}</td><td class="px-4 py-3 text-xs"><span class="px-2 py-0.5 ${isMine?'bg-purple-100 text-purple-700':'bg-amber-100 text-amber-700'} rounded font-black">${isMine?'본인':'관리자배정'}</span></td><td class="px-4 py-3">${(isMine||u.role==='Admin')?`<button onclick="router.delMySched(${s.id})" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`:''}</td></tr>`}).join(''):'<tr><td colspan="7" class="text-center py-8 text-slate-400 font-bold">이번 달 스케줄 없음</td></tr>'}</tbody></table></div></div></div></main></div>`;
    lucide.createIcons();
  }
  
  _buildScheduleCalendar(year, month, schedList) {
    const first = new Date(year, month, 1);
    const days = new Date(year, month+1, 0).getDate();
    const startDow = first.getDay();
    let html = `<div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase mb-2">${['일','월','화','수','목','금','토'].map(d=>`<div class="text-center py-2">${d}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">`;
    for (let i=0; i<startDow; i++) html += `<div class="min-h-[100px] bg-slate-50/50 rounded-lg"></div>`;
    for (let d=1; d<=days; d++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const sch = schedList.filter(s => s.date === ds);
      html += `<div class="min-h-[100px] border rounded-lg p-1.5 ${ds===todayStr()?'ring-2 ring-blue-500':''}"><div class="text-xs font-black">${d}</div>${sch.slice(0,3).map(s=>`<div class="text-[9px] font-bold truncate px-1 py-0.5 rounded mt-0.5 bg-purple-100 text-purple-700">${s.time} ${s.task}</div>`).join('')}${sch.length>3?`<div class="text-[8px] text-slate-400 mt-0.5">+${sch.length-3}건</div>`:''}</div>`;
    }
    html += `</div>`;
    return html;
  }

  showMyScheduleForm() {
    const u = store.currentUser;
    const props = store.properties.filter(p => store.hasPerm(p.id));
    openModal('📅 내 스케줄 등록', `<form id="msf" class="space-y-4"><div class="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs font-bold text-purple-700">💡 본인 스케줄 등록 시 관리자에게도 자동 알림 발송</div><div class="grid grid-cols-2 gap-3"><input type="date" name="date" value="${todayStr()}" class="p-3 border rounded-xl font-bold" required><input type="time" name="time" value="10:00" class="p-3 border rounded-xl font-bold" required></div><input type="hidden" name="staff" value="${u.name}"><select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${props.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select><input name="task" placeholder="업무 (예: 청소, 점검)" class="w-full p-3 border rounded-xl font-bold" required><div class="bg-slate-50 p-4 rounded-xl"><p class="text-xs font-black text-slate-500 uppercase mb-2">🔔 알람 (복수)</p><div class="flex gap-2">${[5,15,30,60].map(m=>`<label class="flex items-center gap-1 px-3 py-2 bg-white rounded-lg cursor-pointer font-bold text-xs"><input type="checkbox" name="a${m}"> ${m}분 전</label>`).join('')}</div></div><input name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold"><button class="w-full bg-purple-600 text-white py-4 rounded-xl font-black uppercase">등록 (관리자 알림)</button></form>`, 'max-w-xl');
    document.getElementById('msf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const alarm = []; [5,15,30,60].forEach(m => { if (d['a'+m]) alarm.push(m); delete d['a'+m]; });
      d.alarm = alarm;
      showLoading(true);
      try { await store.addSchedule(d); toast('등록 + 관리자 알림','success'); closeModal(); await this.go('mySchedule'); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }
  
  async delMySched(id) {
    if (!confirm('삭제?')) return;
    await store.delSchedule(id);
    toast('삭제됨','success');
    await this.go('mySchedule');
  }

  // ============ ADMIN ============
  async renderAdmin() {
    if (store.currentUser.role !== 'Admin') { this.go('home'); return; }
    document.getElementById('app-root').innerHTML = `<div class="flex min-h-screen"><aside id="sidebar" class="w-64 mobile-sidebar bg-slate-900 text-white p-5 sticky top-0 h-screen overflow-y-auto scrollbar"><div class="mb-6 px-2 cursor-pointer" onclick="router.go('home')"><h1 class="text-xl font-black">${(store.siteConfig?.logoText||'QJ')} ADMIN</h1><p class="text-[9px] text-slate-500 font-bold uppercase">← 홈으로</p></div><nav class="space-y-0.5" id="anav"></nav></aside><div id="mobile-overlay" class="mobile-overlay" onclick="router.toggleMobileMenu()"></div><main class="flex-1 bg-slate-50">${UI.Header('Admin Control')}<div class="p-8" id="abody" data-admin></div></main></div>`;
    this.renderAdminNav();
    await this.renderAdminTab();
  }
  
       renderAdminNav() {
    const items = [
      ['main','home','MAIN 대시보드'],
      ['siteConfig','palette','🎨 메인화면 관리'],
      ['aiInsights','sparkles','✨ AI 인사이트'],
      ['smartPricing','dollar-sign','💎 AI 스마트 가격'],
      ['props','building','매물 관리'],
      ['sales','trending-up','매출 관리'],
      ['expenses','credit-card','지출 관리'],
      ['bookings','calendar','예약 관리'],
      ['stats','bar-chart-3','통계/보고서'],
      ['analytics','line-chart','📈 고급 분석'],
      ['customers','users','고객 관리'],
      ['users','user-cog','이용자/권한'],
      ['profileReq','user-check','프로필 요청'],
      ['security','shield','🔒 보안 설정'],
      ['backup','database','💾 백업/복원/연동'],
      ['chats','message-square','채팅 관리'],
      ['logs','list-checks','로그 관리'],
      ['staff','calendar-days','직원 관리'],
      ['etc','package','기타 관리'],
      ['version','git-branch','📦 플랫폼 버전 관리']
    ];
    const pending = store.pendingProfileRequests().length;
    document.getElementById('anav').innerHTML = items.map(([k,i,l])=>`<a onclick="router.adminTab='${k}';router.renderAdminNav();router.renderAdminTab();router.closeMobileMenu()" class="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition ${this.adminTab===k?'bg-blue-600 text-white font-black shadow-lg':'text-slate-400 hover:bg-white/5 font-semibold'}"><i data-lucide="${i}" class="w-4 h-4"></i><span class="text-xs flex-1">${l}</span>${k==='profileReq'&&pending?`<span class="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">${pending}</span>`:''}</a>`).join('');
    lucide.createIcons();
  }
  
  async renderAdminTab() {
    const c = document.getElementById('abody');
    if (!c) return;
        const fn = {
      main: this.admMain,
      siteConfig: this.admSiteConfig,
      aiInsights: this.admAIInsights,
      smartPricing: this.admSmartPricing,
      props: this.admProps,
      sales: this.admSales,
      expenses: this.admExpenses,
      bookings: this.admBookings,
      stats: this.admStats,
      analytics: this.admAnalytics,
      customers: this.admCustomers,
      users: this.admUsers,
      profileReq: this.admProfileReq,
      security: this.admSecurity,
      backup: this.admBackup,
      chats: this.admChats,
      logs: this.admLogs,
      staff: this.admStaff,
      etc: this.admEtc,
      version: this.admVersion
    }[this.adminTab];
    if (fn) {
      try {
        fn.call(this, c);
      } catch(e) {
        console.error('Admin tab error:', e);
        c.innerHTML = `<div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6"><h3 class="font-black text-red-700 mb-2">⚠️ 오류 발생</h3><p class="text-sm">${e.message}</p><button onclick="router.adminTab='main';router.renderAdminNav();router.renderAdminTab()" class="mt-4 bg-red-500 text-white px-5 py-2 rounded-xl font-black text-sm">메인으로 이동</button></div>`;
      }
    } else {
      c.innerHTML = `<div class="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center"><h3 class="font-black text-amber-700">⚠️ 메뉴를 찾을 수 없습니다</h3><button onclick="router.adminTab='main';router.renderAdminNav();router.renderAdminTab()" class="mt-4 bg-amber-500 text-white px-5 py-2 rounded-xl font-black text-sm">메인으로</button></div>`;
    }
    lucide.createIcons();
  }

  // ===== MAIN 대시보드 (위젯 + 전월대비) =====
  admMain(c) {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth()+1).padStart(2,'0')}`;
    const thisRev = store.bookings.filter(b => (b.checkIn||'').startsWith(thisMonth)).reduce((s,b)=>s+(+b.price||0),0);
    const lastRev = store.bookings.filter(b => (b.checkIn||'').startsWith(lastMonth)).reduce((s,b)=>s+(+b.price||0),0);
    const revChange = lastRev ? ((thisRev-lastRev)/lastRev*100) : 0;
    const thisCost = store.expenses.filter(e => (e.date||'').startsWith(thisMonth) && e.majorCat!=='초기투자지출').reduce((s,e)=>s+(+e.amount||0),0);
    const lastCost = store.expenses.filter(e => (e.date||'').startsWith(lastMonth) && e.majorCat!=='초기투자지출').reduce((s,e)=>s+(+e.amount||0),0);
    const costChange = lastCost ? ((thisCost-lastCost)/lastCost*100) : 0;
    const thisProfit = thisRev - thisCost;
    const lastProfit = lastRev - lastCost;
    const profitChange = lastProfit ? ((thisProfit-lastProfit)/Math.abs(lastProfit)*100) : 0;
    const thisBks = store.bookings.filter(b => (b.checkIn||'').startsWith(thisMonth)).length;
    const lastBks = store.bookings.filter(b => (b.checkIn||'').startsWith(lastMonth)).length;
    const bkChange = lastBks ? ((thisBks-lastBks)/lastBks*100) : 0;
    const specials = store.logs.filter(l=>l.special).slice(0,5);
    const insights = store.getAIInsights().slice(0,3);
    
    c.innerHTML = `<h2 class="text-3xl font-black mb-2">📊 ${now.getMonth()+1}월 운영 현황</h2><p class="text-slate-500 mb-6">전월 대비 성과 분석</p>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div class="bg-white p-4 lg:p-6 rounded-2xl border">
        <div class="flex items-start justify-between mb-2">
          <p class="text-[10px] font-black text-slate-400 uppercase">매출</p>
          <i data-lucide="trending-up" class="w-4 h-4 text-slate-300"></i>
        </div>
        <p class="text-lg lg:text-2xl font-black truncate">${fmt(thisRev)}</p>
        ${revChange!==undefined?`<p class="text-xs font-bold mt-1 ${revChange>=0?'text-green-500':'text-red-500'}">${revChange>=0?'▲':'▼'} ${Math.abs(revChange).toFixed(1)}%</p>`:''}
      </div>
      <div class="bg-white p-4 lg:p-6 rounded-2xl border">
        <div class="flex items-start justify-between mb-2">
          <p class="text-[10px] font-black text-slate-400 uppercase">지출</p>
          <i data-lucide="trending-down" class="w-4 h-4 text-slate-300"></i>
        </div>
        <p class="text-lg lg:text-2xl font-black truncate">${fmt(thisCost)}</p>
        ${costChange!==undefined?`<p class="text-xs font-bold mt-1 ${costChange<=0?'text-green-500':'text-red-500'}">${costChange>=0?'▲':'▼'} ${Math.abs(costChange).toFixed(1)}%</p>`:''}
      </div>
      <div class="bg-white p-4 lg:p-6 rounded-2xl border">
        <div class="flex items-start justify-between mb-2">
          <p class="text-[10px] font-black text-slate-400 uppercase">순이익</p>
          <i data-lucide="dollar-sign" class="w-4 h-4 text-slate-300"></i>
        </div>
        <p class="text-lg lg:text-2xl font-black truncate ${thisProfit>=0?'text-green-600':'text-red-500'}">${fmt(thisProfit)}</p>
        ${profitChange!==undefined?`<p class="text-xs font-bold mt-1 ${profitChange>=0?'text-green-500':'text-red-500'}">${profitChange>=0?'▲':'▼'} ${Math.abs(profitChange).toFixed(1)}%</p>`:''}
      </div>
      <div class="bg-white p-4 lg:p-6 rounded-2xl border">
        <div class="flex items-start justify-between mb-2">
          <p class="text-[10px] font-black text-slate-400 uppercase">예약</p>
          <i data-lucide="calendar" class="w-4 h-4 text-slate-300"></i>
        </div>
        <p class="text-lg lg:text-2xl font-black">${thisBks}건</p>
        ${bkChange!==undefined?`<p class="text-xs font-bold mt-1 ${bkChange>=0?'text-green-500':'text-red-500'}">${bkChange>=0?'▲':'▼'} ${Math.abs(bkChange).toFixed(1)}%</p>`:''}
      </div>
    </div>
    ${insights.length?`<div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-5 rounded-2xl mb-6 cursor-pointer" onclick="router.adminTab='aiInsights';router.renderAdminNav();router.renderAdminTab()"><div class="flex items-center justify-between mb-3"><h3 class="font-black flex items-center gap-2"><i data-lucide="sparkles" class="w-5 h-5"></i>AI 인사이트 (${insights.length}건)</h3><span class="text-xs opacity-80">전체보기 →</span></div><div class="space-y-2">${insights.map(i=>`<div class="bg-white/10 rounded-xl p-3"><p class="text-sm font-black">${i.title}</p><p class="text-[10px] opacity-80 mt-1">${i.desc}</p></div>`).join('')}</div></div>`:''}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">🚨 특이사항 (최근 5건)</h3>${specials.length?specials.map(s=>`<div class="p-3 bg-red-50 rounded-xl mb-2 border border-red-100"><p class="text-sm font-bold text-red-700">${s.message}</p><p class="text-[10px] text-slate-400 font-bold mt-1">${s.time}</p></div>`).join(''):UI.Empty('check-circle','특이사항 없음','정상 운영 중')}</div>
      <div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">📈 숙소별 매출 (이번달)</h3>${store.properties.length?'<canvas id="mc" height="200"></canvas>':UI.Empty('home','매물 등록 필요')}</div>
    </div>`;
    setTimeout(()=>{
      if (!store.properties.length) return;
      const data = store.properties.map(p=>({n:p.name.slice(0,8),v:store.bookings.filter(b=>b.propId===p.id&&(b.checkIn||'').startsWith(thisMonth)).reduce((s,b)=>s+(+b.price||0),0)}));
      const el = document.getElementById('mc');
      if(el) new Chart(el,{type:'bar',data:{labels:data.map(d=>d.n),datasets:[{data:data.map(d=>d.v),backgroundColor:'#2563eb'}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
    },100);
  }
  // ===== 매물 관리 =====
    admProps(c) {
    if (!store.properties.length) {
      c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">🏠 매물 관리 (0)</h2><button onclick="router.showPropForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규</button></div>` + UI.Empty('home','등록된 매물이 없습니다','+ 신규 버튼으로 첫 매물을 등록하세요');
      return;
    }
    const visible = store.properties.filter(p => !p.hidden);
    const hidden = store.properties.filter(p => p.hidden);
    const showHidden = this._showHiddenProps || false;
    const list = showHidden ? store.properties : visible;
    
    c.innerHTML = `<div class="flex justify-between items-center mb-6 flex-wrap gap-2">
      <h2 class="text-3xl font-black">🏠 매물 관리 (${visible.length}${hidden.length?` <span class="text-sm text-slate-400">+ 숨김 ${hidden.length}</span>`:''})</h2>
      <div class="flex gap-2 flex-wrap">
        ${hidden.length?`<button onclick="router._showHiddenProps=!router._showHiddenProps;router.renderAdminTab()" class="bg-slate-${showHidden?'900':'100'} ${showHidden?'text-white':'text-slate-700'} px-4 py-3 rounded-xl font-black text-xs">${showHidden?'🙈 숨김 매물 가리기':'👁️ 숨김 매물 보기'}</button>`:''}
        <button onclick="router.showGroupMgr()" class="bg-white border-2 px-5 py-3 rounded-xl font-black text-sm">📁 그룹</button>
        <button onclick="router.showPropForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규</button>
      </div>
    </div>
    <div id="propGrid" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">${list.map(p=>{
      const img=p.image||(p.images&&p.images[p.mainImage||0])||'https://via.placeholder.com/80';
      const opacity = p.hidden ? 'opacity-60' : '';
      return `<div class="bg-white p-5 rounded-2xl border flex gap-4 hover:shadow-xl transition ${opacity}" data-pid="${p.id}">
        <i data-lucide="grip-vertical" class="drag-handle w-4 h-4 mt-2"></i>
        <img src="${img}" class="w-20 h-20 rounded-xl object-cover" onerror="this.src='https://via.placeholder.com/80'">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-black truncate">${p.name}</p>
            ${badge(p.status)}
            ${p.hidden?`<span class="text-[9px] bg-slate-500 text-white px-1.5 py-0.5 rounded font-black">🚫 숨김</span>`:''}
            ${p.excludeFromStats?`<span class="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-black">📊 통계제외</span>`:''}
          </div>
          <p class="text-[10px] text-slate-400 font-bold mt-1">${p.group||'-'} · ${fmt(p.price)}</p>
          <p class="text-[9px] text-slate-400 mt-1 flex items-center gap-1">담당: ${mgrTag(p.manager)}</p>
        </div>
        <div class="flex flex-col gap-1">
          <button onclick="router.showPropForm(${p.id})" class="p-2 bg-slate-100 rounded-lg"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
          <button onclick="router.delProp(${p.id})" class="p-2 bg-red-50 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </div>`;
    }).join('')}</div>`;
    
    setTimeout(() => {
      const grid = document.getElementById('propGrid');
      if (grid && typeof Sortable !== 'undefined') {
        Sortable.create(grid, {
          handle: '.drag-handle',
          animation: 150,
          onEnd: async (evt) => {
            const newOrder = [...grid.querySelectorAll('[data-pid]')].map(el => +el.dataset.pid);
            store.properties.sort((a,b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
            await API.setAll('properties', store.properties);
            toast('순서 변경됨','success');
          }
        });
      }
    }, 100);
    lucide.createIcons();
  }

  showGroupMgr() {
    openModal('📁 그룹 관리', `<div class="space-y-2 mb-4">${store.groups.map((g,i)=>`<div class="flex items-center gap-2 bg-slate-50 p-3 rounded-xl"><span class="flex-1 font-bold">${g}</span><button onclick="router.delGroup(${i})" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`).join('')}</div><form id="gf"><div class="flex gap-2"><input name="g" placeholder="새 그룹명" class="flex-1 p-3 border rounded-xl font-bold"><button class="bg-blue-600 text-white px-5 rounded-xl font-black">추가</button></div></form>`, 'max-w-md');
    document.getElementById('gf').onsubmit = async e => {
      e.preventDefault();
      const v = e.target.g.value.trim();
      if (v && !store.groups.includes(v)) {
        store.groups.push(v);
        await API.setAll('groups', store.groups);
        this.showGroupMgr();
        await this.renderAdminTab();
      }
    };
    lucide.createIcons();
  }
  async delGroup(i) {
    if (!confirm('삭제?')) return;
    store.groups.splice(i,1);
    await API.setAll('groups', store.groups);
    this.showGroupMgr();
    await this.renderAdminTab();
  }

  showPropForm(pid=null) {
    const p = pid?store.prop(pid):{id:'',name:'',group:store.groups[0]||'서울',location:'',address:'',price:100000,cost:40000,images:[],mainImage:0,description:'',manager:'',customFields:[],repair:'완료',cleaning:'완료',gas:'도시가스',internet:'',recycleDay:'',password:'',office:'',guide:'',hidden:false,excludeFromStats:false};
    if (!p.images && p.image) p.images = [p.image];
    if (!p.images) p.images = [];
    if (!p.customFields) p.customFields = [];
    this._tempImages = [...p.images];
    this._tempMainImage = p.mainImage || 0;
    openModal(pid?'✏️ 매물 수정':'🆕 매물 등록', `<form id="pf" class="space-y-4">
    <div class="grid grid-cols-2 gap-3">
      <input name="name" value="${p.name}" placeholder="숙소명" class="p-3 border rounded-xl font-bold" required>
      <select name="group" class="p-3 border rounded-xl font-bold">${store.groups.map(g=>`<option ${p.group===g?'selected':''}>${g}</option>`).join('')}</select>
    </div>
    <input name="location" value="${p.location||''}" placeholder="위치" class="w-full p-3 border rounded-xl font-bold" required>
    <input name="address" value="${p.address||''}" placeholder="상세주소" class="w-full p-3 border rounded-xl font-bold">
    <div class="grid grid-cols-2 gap-3">
      <div><label class="text-[10px] font-black text-blue-500">판매가 (1박)</label><input type="number" name="price" value="${p.price}" class="w-full p-3 border rounded-xl font-black text-blue-600 mt-1" required></div>
      <div><label class="text-[10px] font-black text-slate-400">원가</label><input type="number" name="cost" value="${p.cost}" class="w-full p-3 border rounded-xl font-black text-slate-500 mt-1" required></div>
    </div>
    <div class="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
      <p class="text-xs font-black text-blue-700 uppercase mb-3">📷 이미지 업로드 (다중, 각 10MB 이하)</p>
      <input type="file" id="imgUpload" accept="image/*" multiple class="w-full p-3 border-2 border-dashed border-blue-300 rounded-xl bg-white font-bold text-sm cursor-pointer">
      <p class="text-[10px] text-slate-500 font-bold mt-2">💡 ⭐ 클릭으로 대표 이미지 설정</p>
      <div id="imgPreview" class="grid grid-cols-4 gap-2 mt-3"></div>
    </div>
    <textarea name="description" placeholder="세부사항" class="w-full p-3 border rounded-xl h-24 font-bold">${p.description||''}</textarea>
    <div class="bg-slate-50 p-4 rounded-xl space-y-3">
      <p class="text-xs font-black text-slate-400 uppercase">기본 운영 정보</p>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] font-black">담당매니저 🔔</label><select name="manager" class="w-full p-3 border rounded-xl font-bold mt-1"><option value="">-</option>${store.users.filter(u=>u.role==='Manager').map(u=>`<option value="${u.id}" ${p.manager===u.id?'selected':''}>${u.name}</option>`).join('')}</select></div>
        ${[['repair','수리여부',p.repair],['cleaning','입주청소',p.cleaning],['gas','도시가스',p.gas],['internet','인터넷',p.internet],['recycleDay','분리수거일',p.recycleDay],['password','비밀번호',p.password],['office','관리실',p.office]].map(([k,l,v])=>`<div><label class="text-[10px] font-black">${l}</label><input name="${k}" value="${v||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}
        <div class="col-span-2"><label class="text-[10px] font-black">이용안내 링크</label><input name="guide" value="${p.guide||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
      </div>
    </div>
    <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
      <div class="flex justify-between items-center mb-3">
        <p class="text-xs font-black text-amber-700 uppercase">📌 추가 운영 정보 (사용자 정의)</p>
        <button type="button" onclick="router._addCustomField()" class="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-black">+ 항목 추가</button>
      </div>
      <div id="customFields" class="space-y-2">${p.customFields.map((cf,i)=>`<div class="flex gap-2 items-center bg-white p-2 rounded-lg" data-cf-idx="${i}"><input value="${cf.label}" placeholder="항목명" class="cf-label flex-1 p-2 border rounded-lg text-sm font-bold"><input value="${cf.value}" placeholder="내용" class="cf-value flex-1 p-2 border rounded-lg text-sm"><button type="button" onclick="this.parentElement.remove()" class="text-red-500 px-2"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`).join('')||'<p class="text-xs text-slate-400 text-center py-3">+ 버튼으로 추가 (예: CCTV 비번, 와이파이 등)</p>'}</div>
    </div>
    <div class="bg-red-50 border-2 border-red-200 rounded-xl p-4">
      <p class="text-xs font-black text-red-700 uppercase mb-3">🙈 매물 숨김 옵션 (삭제 X · 숨김만)</p>
      <label class="flex items-center gap-2 p-3 bg-white rounded-lg cursor-pointer mb-2">
        <input type="checkbox" name="hidden" id="hiddenChk" ${p.hidden?'checked':''} class="w-4 h-4">
        <span class="text-sm font-bold">🚫 이 매물을 목록에서 숨기기 (데이터는 유지)</span>
      </label>
      <div class="ml-7 space-y-2 mt-3" id="hideOptions" style="${p.hidden?'':'display:none'}">
        <p class="text-xs font-black text-red-600 uppercase">📊 통계 처리 방식 선택:</p>
        <label class="flex items-start gap-2 p-3 bg-white rounded-lg cursor-pointer">
          <input type="radio" name="excludeFromStats" value="false" ${!p.excludeFromStats?'checked':''} class="mt-1">
          <div>
            <p class="text-sm font-black text-slate-700">✅ 데이터는 통계에 포함</p>
            <p class="text-[10px] text-slate-500 font-bold">매출/지출/통계 등 모든 데이터를 그대로 반영 (목록에서만 숨김)</p>
          </div>
        </label>
        <label class="flex items-start gap-2 p-3 bg-white rounded-lg cursor-pointer">
          <input type="radio" name="excludeFromStats" value="true" ${p.excludeFromStats?'checked':''} class="mt-1">
          <div>
            <p class="text-sm font-black text-slate-700">❌ 모든 통계에서 제외</p>
            <p class="text-[10px] text-slate-500 font-bold">매출/지출/통계/AI 분석 등 모든 기능에서 이 매물 데이터 제외</p>
          </div>
        </label>
      </div>
    </div>
    <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">${pid?'수정':'등록'}</button></form>`, 'max-w-3xl');
    
    this._refreshImagePreview();
    
    document.getElementById('imgUpload').onchange = async e => {
      const files = [...e.target.files];
      showLoading(true);
      try {
        for (const file of files) {
          if (file.size > 10*1024*1024) { toast(`${file.name} 10MB 초과`,'error'); continue; }
          const url = await store.uploadImage(file);
          this._tempImages.push(url);
        }
        this._refreshImagePreview();
        toast(`${files.length}개 추가`,'success');
      } catch(err) { toast('실패: '+err.message,'error'); }
      finally { showLoading(false); e.target.value=''; }
    };
    
    document.getElementById('pf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      d.images = this._tempImages;
      d.mainImage = this._tempMainImage;
      d.image = this._tempImages[this._tempMainImage] || this._tempImages[0] || '';
      d.customFields = [...document.querySelectorAll('[data-cf-idx]')].map(el => ({label: el.querySelector('.cf-label').value.trim(), value: el.querySelector('.cf-value').value.trim()})).filter(cf => cf.label);
      d.hidden = !!d.hidden;
      d.excludeFromStats = d.excludeFromStats === 'true';
      if (pid) d.id = pid;
      const oldManager = pid ? store.prop(pid)?.manager : null;
      showLoading(true);
      try {
        await store.upsertProp(d);
        if (d.manager && d.manager !== oldManager) await store.notifyManagerAssignment(d.name, d.manager, !pid);
        toast(pid?'수정됨':'등록됨','success');
        closeModal();
        await this.renderAdminTab();
      } catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
    
    setTimeout(() => {
      const chk = document.getElementById('hiddenChk');
      const opts = document.getElementById('hideOptions');
      if (chk && opts) {
        chk.onchange = () => { opts.style.display = chk.checked ? 'block' : 'none'; };
      }
    }, 100);
    
    lucide.createIcons();
  }

  _refreshImagePreview() {
    const c = document.getElementById('imgPreview');
    if (!c) return;
    c.innerHTML = this._tempImages.length ? this._tempImages.map((img,i)=>`<div class="relative"><img src="${img}" class="w-full h-24 object-cover rounded-lg border-2 ${this._tempMainImage===i?'border-amber-500 ring-2 ring-amber-200':'border-slate-200'}"><button type="button" onclick="router._setMainImage(${i})" class="absolute top-1 left-1 w-6 h-6 ${this._tempMainImage===i?'bg-amber-500':'bg-white/80'} rounded-full text-xs">⭐</button><button type="button" onclick="router._removeImage(${i})" class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs">×</button>${this._tempMainImage===i?'<span class="absolute bottom-1 left-1 right-1 text-[9px] font-black bg-amber-500 text-white px-1 rounded text-center">대표</span>':''}</div>`).join('') : '<p class="col-span-4 text-center text-xs text-slate-400 py-6">이미지 없음</p>';
  }
  _setMainImage(i) { this._tempMainImage = i; this._refreshImagePreview(); }
  _removeImage(i) { this._tempImages.splice(i,1); if(this._tempMainImage>=this._tempImages.length)this._tempMainImage=0; this._refreshImagePreview(); }
  _addCustomField() {
    const c = document.getElementById('customFields');
    const idx = c.querySelectorAll('[data-cf-idx]').length;
    const div = document.createElement('div');
    div.className = 'flex gap-2 items-center bg-white p-2 rounded-lg';
    div.setAttribute('data-cf-idx', idx);
    div.innerHTML = `<input placeholder="항목명" class="cf-label flex-1 p-2 border rounded-lg text-sm font-bold"><input placeholder="내용" class="cf-value flex-1 p-2 border rounded-lg text-sm"><button type="button" onclick="this.parentElement.remove()" class="text-red-500 px-2"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
    if (c.querySelector('p')) c.innerHTML='';
    c.appendChild(div);
    lucide.createIcons();
  }
  async delProp(id) {
    if (!confirm('삭제?')) return;
    showLoading(true);
    try { await store.delProp(id); toast('삭제됨','success'); await this.renderAdminTab(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

  // ===== 지출 관리 (셀 클릭 수정 + 카테고리 드래그) =====
  admExpenses(c) {
    if (!this._expFilter) {
      const now = new Date();
      this._expFilter = { period:'month', from:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, to:todayStr() };
    }
    const f = this._expFilter;
    const titleLabel = f.period==='month'?`${f.from.slice(0,7).replace('-','년 ')}월 지출`:`${f.from} ~ ${f.to}`;
    c.innerHTML = `<div class="flex justify-between items-center mb-4 flex-wrap gap-3"><h2 class="text-3xl font-black">💳 지출 관리</h2><div class="flex gap-2 flex-wrap"><div class="bg-slate-100 rounded-xl p-1 flex"><button onclick="router.expenseMode='integrated';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.expenseMode==='integrated'?'bg-white shadow':'text-slate-500'}">통합</button><button onclick="router.expenseMode='individual';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.expenseMode==='individual'?'bg-white shadow':'text-slate-500'}">개별</button></div><button onclick="router.showCatMgr()" class="bg-white border-2 px-5 py-3 rounded-xl font-black text-sm">📁 카테고리</button><button onclick="router.exportExpensesExcel()" class="bg-green-600 text-white px-5 py-3 rounded-xl font-black text-sm">📥 엑셀↓</button><label class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm cursor-pointer">📤 엑셀↑<input type="file" id="expImport" accept=".xlsx,.xls" class="hidden"></label><button onclick="router.showExpenseForm()" class="bg-red-500 text-white px-5 py-3 rounded-xl font-black text-sm">+ 지출</button></div></div>
    <div class="bg-white p-4 rounded-2xl border mb-4"><p class="text-[10px] font-black text-slate-400 uppercase mb-3">📅 기간 필터</p><div class="flex gap-2 flex-wrap items-center"><select id="expPeriod" class="p-3 border rounded-xl font-bold text-sm"><option value="day" ${f.period==='day'?'selected':''}>일</option><option value="week" ${f.period==='week'?'selected':''}>주</option><option value="month" ${f.period==='month'?'selected':''}>월</option><option value="custom" ${f.period==='custom'?'selected':''}>특정 기간</option></select><input type="date" id="expFrom" value="${f.from}" class="p-3 border rounded-xl font-bold text-sm"><span>~</span><input type="date" id="expTo" value="${f.to}" class="p-3 border rounded-xl font-bold text-sm"><button onclick="router.applyExpFilter()" class="bg-slate-900 text-white px-5 py-3 rounded-xl font-black text-sm">적용</button><button onclick="router.expPrevMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-left" class="w-4 h-4"></i></button><button onclick="router.expNextMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-right" class="w-4 h-4"></i></button></div></div>
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs font-bold text-blue-700"><i data-lucide="link" class="w-4 h-4 inline"></i> 🔗 인터넷비 자동연동 · 💡 표 안의 숫자/항목 클릭 시 인라인 편집</div>
    <div class="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-2xl mb-4 flex justify-between items-center"><h3 class="text-2xl font-black">📊 ${titleLabel}</h3><p class="text-3xl font-black text-amber-400">${fmt(this._getFilteredExpenses().reduce((s,e)=>s+e.amount,0))}</p></div>
    <div id="exp-body"></div>`;
    if (this.expenseMode === 'integrated') this.admExpIntegrated(); else this.admExpIndividual();
    document.getElementById('expImport').onchange = e => this.importExpensesExcel(e.target.files[0]);
    lucide.createIcons();
  }
  
  _getFilteredExpenses() { const f = this._expFilter || {}; return store.expenses.filter(e => e.date && e.date >= f.from && e.date <= f.to); }
  
  applyExpFilter() {
    const period = document.getElementById('expPeriod').value;
    let from = document.getElementById('expFrom').value;
    let to = document.getElementById('expTo').value;
    if (period === 'day') from = to = todayStr();
    else if (period === 'week') {
      const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day;
      from = new Date(d.setDate(diff)).toISOString().split('T')[0];
      to = new Date(d.setDate(diff+6)).toISOString().split('T')[0];
    } else if (period === 'month') {
      const fd = new Date(from || todayStr());
      from = `${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-01`;
      const last = new Date(fd.getFullYear(), fd.getMonth()+1, 0);
      to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    }
    this._expFilter = { period, from, to };
    this.renderAdminTab();
  }
  
  expPrevMonth() { const f=this._expFilter; const d=new Date(f.from); d.setMonth(d.getMonth()-1); f.from=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; const last=new Date(d.getFullYear(),d.getMonth()+1,0); f.to=`${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`; f.period='month'; this.renderAdminTab(); }
  expNextMonth() { const f=this._expFilter; const d=new Date(f.from); d.setMonth(d.getMonth()+1); f.from=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; const last=new Date(d.getFullYear(),d.getMonth()+1,0); f.to=`${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`; f.period='month'; this.renderAdminTab(); }

  // ⭐ 통합 모드 (셀 클릭 추가/수정)
  admExpIntegrated() {
    const body = document.getElementById('exp-body');
    const expenses = this._getFilteredExpenses();
    let html = `<div class="bg-white rounded-2xl border overflow-x-auto"><table class="w-full min-w-[900px]"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr><th class="px-4 py-3 text-left">No.</th><th class="px-4 py-3 text-left">숙소</th>${store.majorCats.map(mc=>`<th class="px-4 py-3 text-right" colspan="${(store.subCats[mc]||[]).length+1}" style="background:${mc==='초기투자지출'?'#fef3c7':mc==='고정지출'?'#dbeafe':'#fee2e2'}">${mc}</th>`).join('')}<th class="px-4 py-3 text-right bg-slate-900 text-white">총합</th></tr><tr><th></th><th></th>${store.majorCats.map(mc=>(store.subCats[mc]||[]).map(sc=>`<th class="px-3 py-2 text-right text-[9px]">${sc}${sc==='인터넷비'?' 🔗':''}</th>`).join('')+`<th class="px-3 py-2 text-right text-[9px] font-black">소계</th>`).join('')}<th></th></tr></thead><tbody class="text-xs divide-y">`;
    store.properties.forEach((p,idx)=>{
      let total = 0;
      html += `<tr class="hover:bg-blue-50/30"><td class="px-4 py-3 font-black">${idx+1}</td><td class="px-4 py-3 font-black whitespace-nowrap">${p.name}</td>`;
      store.majorCats.forEach(mc=>{
        let mcSum = 0;
        (store.subCats[mc]||[]).forEach(sc=>{
          const v = expenses.filter(e=>e.propId===p.id&&e.majorCat===mc&&e.category===sc).reduce((s,e)=>s+e.amount,0);
          mcSum += v;
          const isLinked = sc==='인터넷비' && v>0;
          html += `<td class="editable-cell px-3 py-3 text-right font-bold ${isLinked?'text-blue-600':''}" onclick="router.cellClickAddExpense(${p.id},'${mc}','${sc}',${v})" title="클릭하여 ${v?'수정':'추가'}">${v?fmt(v):'-'}</td>`;
        });
        html += `<td class="px-3 py-3 text-right font-black" style="background:${mc==='초기투자지출'?'#fef9e7':mc==='고정지출'?'#eff6ff':'#fef2f2'}">${mcSum?fmt(mcSum):'-'}</td>`;
        total += mcSum;
      });
      html += `<td class="px-4 py-3 text-right font-black bg-slate-900 text-white">${fmt(total)}</td></tr>`;
    });
    html += `</tbody></table></div><p class="text-xs text-slate-400 mt-2 font-bold">💡 셀(숫자)을 클릭하면 해당 항목을 바로 추가/수정할 수 있습니다</p>`;
    body.innerHTML = html;
  }
  
  // ⭐ 셀 클릭 → 인라인 입력 모달
  cellClickAddExpense(propId, majorCat, category, currentValue) {
    const p = store.prop(propId);
    const f = this._expFilter;
    const existing = this._getFilteredExpenses().filter(e => e.propId===propId && e.majorCat===majorCat && e.category===category);
    openModal(`${currentValue?'✏️':'➕'} ${p.name} - ${category}`, `
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs font-bold text-blue-700">
        💡 매물: <b>${p.name}</b> · 분류: <b>${majorCat} > ${category}</b><br />
        기간: <b>${f.from} ~ ${f.to}</b> · 현재 합계: <b class="text-red-500">${fmt(currentValue)}</b>
      </div>
      ${existing.length?`<div class="bg-slate-50 p-3 rounded-xl mb-4"><p class="text-xs font-black text-slate-500 uppercase mb-2">📋 기간내 등록된 ${existing.length}건</p><div class="space-y-1 max-h-32 overflow-y-auto">${existing.map(e=>`<div class="flex items-center justify-between bg-white p-2 rounded text-xs"><span>${e.date} · ${e.memo||'-'}</span><div class="flex items-center gap-2"><span class="font-black text-red-500">${fmt(e.amount)}</span><button onclick="router.delExpense(${e.id});closeModal()" class="text-red-400">×</button></div></div>`).join('')}</div></div>`:''}
      <form id="cellExp" class="space-y-3">
        <p class="text-xs font-black text-slate-700 uppercase">➕ 신규 등록</p>
        <input type="date" name="date" value="${todayStr()}" class="w-full p-3 border rounded-xl font-bold" required>
        <input type="number" name="amount" placeholder="금액" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl" required autofocus>
        <input name="memo" placeholder="메모 (선택)" class="w-full p-3 border rounded-xl font-bold">
        <button class="w-full bg-red-500 text-white py-4 rounded-xl font-black uppercase">등록</button>
      </form>`, 'max-w-xl');
    document.getElementById('cellExp').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      d.propId = propId; d.majorCat = majorCat; d.category = category;
      showLoading(true);
      try { await store.addExpense(d); toast('등록','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
    setTimeout(() => document.querySelector('input[name="amount"]')?.focus(), 100);
  }

  admExpIndividual() {
    const body = document.getElementById('exp-body');
    const expenses = this._getFilteredExpenses();
    body.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${store.properties.map(p=>{
      const list = expenses.filter(e=>e.propId===p.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      const total = list.reduce((s,e)=>s+e.amount,0);
      return `<div class="bg-white p-5 rounded-2xl border"><div class="flex items-center gap-3 mb-4 pb-4 border-b"><img src="${p.image||(p.images?.[p.mainImage||0])||'https://via.placeholder.com/60'}" class="w-12 h-12 rounded-xl object-cover"><div class="flex-1 min-w-0"><p class="font-black truncate">${p.name}</p><p class="text-xs text-red-500 font-black">${fmt(total)}</p></div><button onclick="router.showExpenseForm(${p.id})" class="w-8 h-8 bg-blue-600 text-white rounded-lg text-xs font-black">+</button></div><div class="space-y-2 max-h-64 overflow-y-auto scrollbar">${list.length?list.map(e=>{const linked=e.syncKey?.startsWith('net_');return `<div class="editable-cell p-2 ${linked?'bg-blue-50':'bg-slate-50'} rounded-lg flex items-center gap-2 text-xs" onclick="router.editExpenseDirect(${e.id})"><div class="flex-1 min-w-0"><p class="font-black truncate">${e.category} ${linked?'🔗':''}</p><p class="text-[10px] text-slate-400 font-bold">${e.date} · ${e.memo||'-'}</p></div><span class="text-red-500 font-black">${fmt(e.amount)}</span><button onclick="event.stopPropagation();router.delExpense(${e.id})" class="text-slate-300 hover:text-red-500"><i data-lucide="x" class="w-3 h-3"></i></button></div>`}).join(''):'<p class="text-xs text-slate-400 text-center py-4">기간 내 내역 없음</p>'}</div></div>`;
    }).join('')}</div>`;
    lucide.createIcons();
  }
  
  // ⭐ 개별 모드 항목 클릭 직접 수정
  editExpenseDirect(id) {
    const e = store.expenses.find(x => x.id == id);
    if (!e) return;
    if (e.syncKey?.startsWith('net_')) { toast('🔗 자동연동 항목은 기타관리에서 수정','warning'); return; }
    const p = store.prop(e.propId);
    openModal(`✏️ 지출 수정 - ${p?.name||'-'}`, `<form id="ee" class="space-y-3"><div class="grid grid-cols-2 gap-3"><select name="majorCat" id="meCat" class="p-3 border rounded-xl font-bold" onchange="document.getElementById('eeSc').innerHTML=(${JSON.stringify(store.subCats)})[this.value].map(x=>'<option '+(x==='${e.category}'?'selected':'')+'>'+x+'</option>').join('')">${store.majorCats.map(m=>`<option ${e.majorCat===m?'selected':''}>${m}</option>`).join('')}</select><select name="category" id="eeSc" class="p-3 border rounded-xl font-bold">${(store.subCats[e.majorCat]||[]).map(s=>`<option ${e.category===s?'selected':''}>${s}</option>`).join('')}</select></div><input type="date" name="date" value="${e.date}" class="w-full p-3 border rounded-xl font-bold" required><input type="number" name="amount" value="${e.amount}" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl" required><input name="memo" value="${e.memo||''}" placeholder="메모" class="w-full p-3 border rounded-xl font-bold"><button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">수정</button></form>`, 'max-w-xl');
    document.getElementById('ee').onsubmit = async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      Object.assign(e, { ...d, amount: +d.amount });
      await API.update('expenses', e.id, e);
      toast('수정됨','success'); closeModal(); await this.renderAdminTab();
    };
  }
  
  exportExpensesExcel() {
    const expenses = this._getFilteredExpenses();
    const f = this._expFilter;
    const data = expenses.map(e => ({ '날짜':e.date, '숙소':store.prop(e.propId)?.name||'-', '대분류':e.majorCat, '소분류':e.category, '금액':e.amount, '메모':e.memo||'' }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '지출내역');
    XLSX.writeFile(wb, `지출_${f.from}_${f.to}.xlsx`);
    toast('📥 다운로드 완료','success');
  }
  
  async importExpensesExcel(file) {
    if (!file) return;
    if (!confirm('엑셀 데이터를 추가합니다. 계속?')) return;
    showLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let added = 0;
      for (const row of rows) {
        const prop = store.properties.find(p => p.name === row['숙소']);
        if (!prop) continue;
        await store.addExpense({ propId:prop.id, majorCat:row['대분류']||'변동지출', category:row['소분류']||'기타', amount:+row['금액']||0, date:row['날짜']||todayStr(), memo:row['메모']||'' });
        added++;
      }
      toast(`✅ ${added}건 추가`,'success');
      await this.renderAdminTab();
    } catch(e) { toast('실패: '+e.message,'error'); }
    finally { showLoading(false); }
  }

  // ⭐ 카테고리 관리 (드래그앤드롭 + 인라인 수정)
  showCatMgr() {
    openModal('📁 지출 카테고리 관리 (드래그로 순서 변경)', `<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs font-bold text-blue-700">💡 ⋮⋮ 아이콘으로 드래그하여 순서 변경 · 항목명 클릭하여 인라인 수정</div>
    <div id="majorList" class="space-y-3">${store.majorCats.map((mc,i)=>`<div class="bg-slate-50 p-4 rounded-2xl" data-mc="${mc}"><div class="flex items-center gap-2 mb-3"><i data-lucide="grip-vertical" class="drag-handle w-5 h-5"></i><input value="${mc}" class="mc-rename flex-1 font-black text-lg bg-transparent outline-none border-b-2 border-transparent focus:border-blue-500" data-orig="${mc}"><button onclick="router.delMajorCat(${i},'${mc}')" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>
    <div class="sub-list flex flex-wrap gap-2 mb-3" data-mc="${mc}">${(store.subCats[mc]||[]).map((sc,j)=>`<div class="inline-flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg text-xs font-bold border" data-sc-idx="${j}"><i data-lucide="grip-vertical" class="drag-handle w-3 h-3"></i><input value="${sc}" class="sc-rename bg-transparent outline-none border-b border-transparent focus:border-blue-500" data-orig="${sc}" style="width:${sc.length*8+20}px"><button onclick="router.delSubCat('${mc}',${j})" class="text-red-400">×</button></div>`).join('')}</div>
    <form onsubmit="router.addSubCat(event,'${mc}')"><div class="flex gap-2"><input name="s" placeholder="소분류 추가" class="flex-1 p-2 border rounded-lg text-sm"><button class="bg-blue-600 text-white px-3 rounded-lg text-xs font-black">+</button></div></form></div>`).join('')}</div>
    <form onsubmit="router.addMajorCat(event)" class="mt-4 pt-4 border-t"><div class="flex gap-2"><input name="m" placeholder="새 대분류" class="flex-1 p-3 border rounded-xl font-bold"><button class="bg-slate-900 text-white px-5 rounded-xl font-black">대분류 추가</button></div></form>`);
    
    setTimeout(() => {
      // 대분류 드래그
      const ml = document.getElementById('majorList');
      if (ml && typeof Sortable !== 'undefined') {
        Sortable.create(ml, {
          handle: '.drag-handle:not(.sub-handle)',
          animation: 150,
          onEnd: async (evt) => {
            await store.moveMajorCat(evt.oldIndex, evt.newIndex);
            toast('순서 변경됨','success');
          }
        });
      }
      // 소분류 드래그
      document.querySelectorAll('.sub-list').forEach(list => {
        if (typeof Sortable !== 'undefined') {
          Sortable.create(list, {
            animation: 150,
            onEnd: async (evt) => {
              await store.moveSubCat(list.dataset.mc, evt.oldIndex, evt.newIndex);
              toast('소분류 순서 변경','success');
            }
          });
        }
      });
      // 인라인 수정 (대분류)
      document.querySelectorAll('.mc-rename').forEach(input => {
        input.addEventListener('blur', async () => {
          const oldName = input.dataset.orig;
          const newName = input.value.trim();
          if (newName && newName !== oldName && !store.majorCats.includes(newName)) {
            const idx = store.majorCats.indexOf(oldName);
            store.majorCats[idx] = newName;
            store.subCats[newName] = store.subCats[oldName];
            delete store.subCats[oldName];
            await API.setAll('majorCats', store.majorCats);
            await API.setAll('subCats', store.subCats);
            toast('대분류 이름 변경','success');
            this.showCatMgr();
            await this.renderAdminTab();
          }
        });
      });
      // 인라인 수정 (소분류)
      document.querySelectorAll('.sc-rename').forEach(input => {
        input.addEventListener('blur', async () => {
          const oldName = input.dataset.orig;
          const newName = input.value.trim();
          const mc = input.closest('.sub-list').dataset.mc;
          const j = +input.closest('[data-sc-idx]').dataset.scIdx;
          if (newName && newName !== oldName) {
            await store.renameSubCat(mc, j, newName);
            toast(`"${oldName}" → "${newName}" 변경 (관련 지출 자동 동기화)`,'success');
            this.showCatMgr();
            await this.renderAdminTab();
          }
        });
      });
    }, 100);
    lucide.createIcons();
  }
  async addMajorCat(e){e.preventDefault();const v=e.target.m.value.trim();if(v&&!store.majorCats.includes(v)){store.majorCats.push(v);store.subCats[v]=[];await API.setAll('majorCats',store.majorCats);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}}
  async delMajorCat(i,mc){if(!confirm('삭제? 관련 지출도 영향받습니다.'))return;store.majorCats.splice(i,1);delete store.subCats[mc];await API.setAll('majorCats',store.majorCats);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}
  async addSubCat(e,mc){e.preventDefault();const v=e.target.s.value.trim();if(v){store.subCats[mc]=store.subCats[mc]||[];store.subCats[mc].push(v);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}}
  async delSubCat(mc,j){if(!confirm('삭제?'))return;store.subCats[mc].splice(j,1);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}

  showExpenseForm(propId=null) {
    openModal('💳 지출 등록', `<form id="ef" class="space-y-4"><select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}" ${propId==p.id?'selected':''}>${p.name}</option>`).join('')}</select><div class="grid grid-cols-2 gap-3"><select name="majorCat" id="mcSel" class="p-3 border rounded-xl font-bold" required onchange="document.getElementById('scSel').innerHTML=(${JSON.stringify(store.subCats)})[this.value].map(x=>'<option>'+x+'</option>').join('')">${store.majorCats.map(m=>`<option>${m}</option>`).join('')}</select><select name="category" id="scSel" class="p-3 border rounded-xl font-bold" required>${(store.subCats[store.majorCats[0]]||[]).map(s=>`<option>${s}</option>`).join('')}</select></div><input type="date" name="date" value="${todayStr()}" class="w-full p-3 border rounded-xl font-bold" required><input type="number" name="amount" placeholder="금액" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl" required><input name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold"><button class="w-full bg-red-500 text-white py-4 rounded-xl font-black uppercase">지출 등록</button></form>`, 'max-w-xl');
    document.getElementById('ef').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      showLoading(true);
      try { await store.addExpense(d); toast('등록','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }
  
  async delExpense(id) {
    if (!confirm('삭제?')) return;
    showLoading(true);
    try { await store.delExpense(id); toast('삭제','success'); await this.renderAdminTab(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

  // ===== 예약 관리 (월 자유 이동) =====
  admBookings(c) {
    const cur = this._bkDate;
    const year = cur.getFullYear(), month = cur.getMonth();
    c.innerHTML = `<div class="flex justify-between items-center mb-6 flex-wrap gap-3"><h2 class="text-3xl font-black">📅 예약 관리</h2><div class="flex gap-2 items-center flex-wrap"><button onclick="router.bkPrevMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-left" class="w-4 h-4"></i></button><h3 class="text-xl font-black px-4">${year}년 ${month+1}월</h3><button onclick="router.bkNextMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-right" class="w-4 h-4"></i></button><button onclick="router.bkToday()" class="bg-blue-600 text-white px-4 py-3 rounded-xl font-black text-sm">오늘</button><div class="bg-slate-100 rounded-xl p-1 flex"><button onclick="router.bkMode='month';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.bkMode==='month'?'bg-white shadow':'text-slate-500'}">월별</button><button onclick="router.bkMode='list';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.bkMode==='list'?'bg-white shadow':'text-slate-500'}">개별</button></div></div></div><div id="bk-body"></div>`;
    if (this.bkMode === 'list') {
      document.getElementById('bk-body').innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${store.properties.map(p=>`<div class="bg-white p-4 rounded-2xl border"><h4 class="font-black mb-3">${p.name}</h4>${buildCalendar(year, month, p.id, 'router.onCalendarClick')}</div>`).join('')}</div>`;
    } else {
      let html = `<div class="bg-white p-6 rounded-2xl border"><h3 class="text-xl font-black mb-4">${year}년 ${month+1}월 전체 예약</h3>`;
      const first = new Date(year, month, 1);
      const days = new Date(year, month+1, 0).getDate();
      const startDow = first.getDay();
      html += `<div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase mb-2">${['일','월','화','수','목','금','토'].map(d=>`<div class="text-center py-2">${d}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">`;
      for (let i=0; i<startDow; i++) html += `<div class="min-h-[120px] bg-slate-50/50 rounded-lg"></div>`;
      for (let d=1; d<=days; d++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const bks = store.bookings.filter(b => ds>=b.checkIn && ds<b.checkOut);
        html += `<div class="min-h-[120px] border rounded-lg p-1.5 ${ds===todayStr()?'ring-2 ring-blue-500':''}"><div class="text-xs font-black">${d}</div>${bks.slice(0,4).map(b=>{const pl=store.platforms.find(x=>x.name===b.platform);return `<div class="text-[9px] font-bold truncate px-1 py-0.5 rounded mt-0.5 cursor-pointer" style="background:${pl?.color||'#2563eb'}20;color:${pl?.color||'#2563eb'}" onclick="router.showBookingForm(${b.propId},store.bookings.find(x=>x.id===${b.id}))">${store.prop(b.propId)?.name?.slice(0,6)||''}·${b.guest.slice(0,3)}</div>`}).join('')}${bks.length>4?`<div class="text-[8px] text-slate-400 mt-0.5">+${bks.length-4}건</div>`:''}</div>`;
      }
      html += `</div></div>`;
      document.getElementById('bk-body').innerHTML = html;
    }
    lucide.createIcons();
  }
  bkPrevMonth() { this._bkDate.setMonth(this._bkDate.getMonth()-1); this.renderAdminTab(); }
  bkNextMonth() { this._bkDate.setMonth(this._bkDate.getMonth()+1); this.renderAdminTab(); }
  bkToday() { this._bkDate = new Date(); this.renderAdminTab(); }
  // ===== 🎨 메인화면 관리 (사이트 설정) =====
  admSiteConfig(c) {
    const cfg = store.siteConfig || {};
    c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black">🎨 메인화면 관리</h2><p class="text-slate-500 mt-1">로고, 타이틀, 환영문구, 안내문 등을 변경할 수 있습니다 (전체 적용)</p></div>
    <form id="cfgForm" class="space-y-5">
      <div class="bg-white border-2 rounded-2xl p-6">
        <h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="image" class="w-5 h-5"></i>로고 & 브랜드</h3>
        
        <div class="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
          <p class="text-xs font-black text-blue-700 uppercase mb-3">🖼️ 로고 이미지 직접 업로드 (자동 정사각형 조정 · 5MB 이하)</p>
          <div class="flex items-center gap-4 flex-wrap">
            <div id="logoPreview" class="w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-blue-300 flex items-center justify-center overflow-hidden flex-shrink-0">
              ${cfg.logoImage ? `<img src="${cfg.logoImage}" class="w-full h-full object-cover">` : `<span class="text-4xl">${cfg.logoEmoji||'🏢'}</span>`}
            </div>
            <div class="flex-1 min-w-[200px]">
              <input type="file" id="logoUpload" accept="image/*" class="w-full p-3 border-2 border-dashed border-blue-300 rounded-xl bg-white font-bold text-sm cursor-pointer">
              <p class="text-[10px] text-slate-500 font-bold mt-2">💡 어떤 크기든 자동으로 200x200 정사각형으로 조정 · PNG/JPG 모두 지원</p>
              ${cfg.logoImage ? `<button type="button" onclick="router.removeLogoImage()" class="mt-2 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-black">🗑️ 이미지 제거 (이모지로 변경)</button>` : ''}
            </div>
          </div>
          <input type="hidden" name="logoImage" id="logoImageData" value="${cfg.logoImage || ''}">
        </div>
        
        <details class="mb-4 bg-slate-50 rounded-xl p-3">
          <summary class="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-700">🎭 이미지 없을 때 사용할 이모지 (선택)</summary>
          <div class="mt-3"><input name="logoEmoji" value="${cfg.logoEmoji||'🏢'}" maxlength="2" class="w-32 p-3 border-2 rounded-xl text-2xl text-center font-bold"><p class="text-[10px] text-slate-400 mt-2">예: 🏢 🏠 🏨 ✨</p></div>
        </details>
        
        <div class="grid grid-cols-2 gap-4 mobile-stack">
          <div><label class="text-[10px] font-black text-slate-400 uppercase">로고 텍스트</label><input name="logoText" value="${cfg.logoText||'QJ.PMS'}" class="w-full p-4 border-2 rounded-xl font-black mt-1"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">사이트 타이틀</label><input name="title" value="${cfg.title||'QJ-PropMS'}" class="w-full p-4 border-2 rounded-xl font-black mt-1"></div>
          <div class="col-span-2"><label class="text-[10px] font-black text-slate-400 uppercase">서브타이틀</label><input name="subtitle" value="${cfg.subtitle||'하이브리드 단기렌트 통합 관리'}" class="w-full p-4 border-2 rounded-xl font-bold mt-1"></div>
        </div>
      </div>
      
      <div class="bg-white border-2 rounded-2xl p-6"><h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="palette" class="w-5 h-5"></i>색상 & 환영 메시지</h3><div class="grid grid-cols-2 gap-4 mobile-stack"><div><label class="text-[10px] font-black text-slate-400 uppercase">메인 색상</label><div class="flex gap-2 mt-1"><input type="color" name="primaryColor" value="${cfg.primaryColor||'#2563eb'}" class="w-20 h-12 border-2 rounded-xl"><input type="text" id="colorHex" value="${cfg.primaryColor||'#2563eb'}" oninput="document.querySelector('[name=primaryColor]').value=this.value" class="flex-1 p-3 border-2 rounded-xl font-mono"></div></div><div><label class="text-[10px] font-black text-slate-400 uppercase">홈 환영 메시지</label><input name="welcomeMessage" value="${cfg.welcomeMessage||'안녕하세요'}" class="w-full p-4 border-2 rounded-xl font-bold mt-1"></div></div></div>
      
      <div class="bg-white border-2 rounded-2xl p-6"><h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="file-text" class="w-5 h-5"></i>안내 문구</h3><div><label class="text-[10px] font-black text-slate-400 uppercase">로그인 화면 안내문</label><textarea name="loginNotice" class="w-full p-4 border-2 rounded-xl font-bold mt-1 h-32" placeholder="여러 줄 입력 가능">${cfg.loginNotice||''}</textarea></div><div class="mt-4"><label class="text-[10px] font-black text-slate-400 uppercase">푸터 텍스트</label><input name="footerText" value="${cfg.footerText||'© QJ Property Management'}" class="w-full p-4 border-2 rounded-xl font-bold mt-1"></div></div>
      
      <div class="bg-white border-2 rounded-2xl p-6"><h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="message-circle" class="w-5 h-5"></i>카카오톡 연동</h3><div><label class="text-[10px] font-black text-slate-400 uppercase">카카오톡 웹훅 URL</label><input name="kakaoWebhook" value="${cfg.kakaoWebhook||''}" placeholder="https://hook.make.com/..." class="w-full p-4 border-2 rounded-xl font-mono text-sm mt-1"></div></div>
      
      <div class="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 text-xs font-bold text-blue-700">💡 변경사항은 즉시 모든 화면에 반영됩니다</div>
      <div class="flex gap-3 flex-wrap"><button type="submit" class="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black uppercase">💾 변경사항 저장</button><button type="button" onclick="router.previewSiteConfig()" class="px-6 bg-blue-600 text-white py-4 rounded-xl font-black">👁️ 미리보기</button></div>
    </form>`;
    
    // 🖼️ 로고 이미지 업로드 핸들러
    setTimeout(() => {
      const uploadInput = document.getElementById('logoUpload');
      if (uploadInput) {
        uploadInput.onchange = async e => {
          const file = e.target.files[0];
          if (!file) return;
          showLoading(true);
          try {
            const dataUrl = await store.uploadLogo(file);
            document.getElementById('logoImageData').value = dataUrl;
            document.getElementById('logoPreview').innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover">`;
            toast('✅ 로고 업로드 완료! 저장 버튼을 눌러주세요', 'success');
          } catch(err) {
            toast('실패: ' + err.message, 'error');
          } finally {
            showLoading(false);
            e.target.value = '';
          }
        };
      }
    }, 100);
    
    document.getElementById('cfgForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = {};
      fd.forEach((v, k) => { d[k] = v; });
      showLoading(true);
      try {
        await store.saveSiteConfig(d);
        toast('✅ 설정 저장 완료', 'success');
        await this.renderAdmin();
      } catch(err) {
        toast('실패: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
    lucide.createIcons();
  }

  async removeLogoImage() {
    if (!confirm('로고 이미지를 제거하시겠습니까?')) return;
    showLoading(true);
    try {
      await store.saveSiteConfig({ ...store.siteConfig, logoImage: '' });
      toast('이미지 제거됨', 'success');
      await this.renderAdminTab();
    } catch(e) { toast('실패', 'error'); }
    finally { showLoading(false); }
  }

  previewSiteConfig() {
    const form = document.getElementById('cfgForm');
    const fd = new FormData(form);
    const d = {};
    fd.forEach((v, k) => { d[k] = v; });
    const logoDisplay = d.logoImage 
      ? `<img src="${d.logoImage}" class="w-full h-full object-cover rounded-3xl">`
      : `<span class="text-5xl">${d.logoEmoji}</span>`;
    openModal('👁️ 로그인 화면 미리보기', `<div class="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-10 rounded-2xl"><div class="bg-white rounded-3xl p-10 max-w-md mx-auto"><div class="text-center mb-8"><div class="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5 overflow-hidden" style="background:${d.primaryColor||'#2563eb'}">${logoDisplay}</div><h2 class="text-3xl font-black">${d.title}</h2><p class="text-slate-400 text-sm mt-2 font-medium">${d.subtitle}</p></div>${d.loginNotice?`<div class="p-4 bg-blue-50 rounded-2xl text-[11px] text-blue-700 font-bold whitespace-pre-line">${d.loginNotice}</div>`:''}${d.footerText?`<p class="text-center text-[10px] text-slate-400 font-bold mt-6">${d.footerText}</p>`:''}</div></div>`, 'max-w-2xl');
  }
  
  async removeLogoImage() {
    if (!confirm('로고 이미지를 제거하시겠습니까? (이모지로 돌아갑니다)')) return;
    showLoading(true);
    try {
      await store.saveSiteConfig({ ...store.siteConfig, logoImage: '' });
      toast('이미지 제거됨', 'success');
      await this.renderAdminTab();
    } catch(e) {
      toast('실패', 'error');
    } finally {
      showLoading(false);
    }
  }

  


  // ===== ✨ AI 인사이트 (작동 보강) =====
  admAIInsights(c) {
    let insights;
    try { insights = store.getAIInsights() || []; }
    catch(e) { 
      console.error('AI Insights error:', e);
      c.innerHTML = `<div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6"><h3 class="font-black text-red-700">⚠️ AI 분석 오류</h3><p class="text-sm mt-2">${e.message}</p><button onclick="router.renderAdminTab()" class="mt-4 bg-red-500 text-white px-5 py-2 rounded-xl font-black text-sm">다시 시도</button></div>`;
      return;
    }
    const grouped = { warning: [], info: [], success: [] };
    insights.forEach(i => grouped[i.level]?.push(i));
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><div><h2 class="text-3xl font-black">✨ AI 인사이트</h2><p class="text-slate-500 mt-1">데이터 분석 기반 자동 운영 개선 추천 (${insights.length}건)</p></div><button onclick="router.renderAdminTab()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm"><i data-lucide="refresh-cw" class="w-4 h-4 inline"></i> 다시 분석</button></div>
    <div class="grid grid-cols-3 gap-4 mb-6 mobile-stack"><div class="bg-red-50 border-2 border-red-200 p-5 rounded-2xl"><p class="text-[10px] font-black text-red-600 uppercase">⚠️ 경고</p><p class="text-3xl font-black text-red-700 mt-2">${grouped.warning.length}건</p></div><div class="bg-blue-50 border-2 border-blue-200 p-5 rounded-2xl"><p class="text-[10px] font-black text-blue-600 uppercase">ℹ️ 알림</p><p class="text-3xl font-black text-blue-700 mt-2">${grouped.info.length}건</p></div><div class="bg-green-50 border-2 border-green-200 p-5 rounded-2xl"><p class="text-[10px] font-black text-green-600 uppercase">✅ 추천</p><p class="text-3xl font-black text-green-700 mt-2">${grouped.success.length}건</p></div></div>
    <div class="space-y-3">${insights.map((i,idx)=>{const colors={warning:'bg-red-50 border-red-200',info:'bg-blue-50 border-blue-200',success:'bg-green-50 border-green-200'};return `<div class="${colors[i.level]} border-2 rounded-2xl p-5 flex items-start gap-4"><div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0"><i data-lucide="${i.icon||'info'}" class="w-6 h-6"></i></div><div class="flex-1 min-w-0"><h3 class="font-black text-lg">${i.title}</h3><p class="text-sm text-slate-700 mt-1 font-medium">${i.desc}</p></div>${i.action?`<button onclick="router.actOnInsight('${i.action}',${i.propId||'null'})" class="bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-xs flex-shrink-0">조치 →</button>`:''}</div>`}).join('')}</div>
    <div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-6 rounded-2xl mt-6"><h3 class="font-black text-lg mb-3">💡 AI 운영 팁</h3><div class="grid grid-cols-2 gap-3 text-sm mobile-stack"><div class="bg-white/10 p-3 rounded-xl"><p class="font-black mb-1">📈 평균 가동률</p><p class="text-2xl font-black">${store.properties.length?Math.round(store.properties.filter(p=>getBookingForDate(p.id,todayStr())).length/store.properties.length*100):0}%</p></div><div class="bg-white/10 p-3 rounded-xl"><p class="font-black mb-1">💰 평균 객단가</p><p class="text-2xl font-black">${fmt(store.bookings.length?Math.round(store.bookings.reduce((s,b)=>s+(+b.price||0),0)/store.bookings.length):0)}</p></div></div></div>`;
    lucide.createIcons();
  }
  
  actOnInsight(action, propId) {
    const map = {pricing:'smartPricing', cost:'expenses', marketing:'sales', payment:'bookings', schedule:'staff', stats:'stats', props:'props', chats:'chats', customers:'customers'};
    if (map[action]) { 
      this.adminTab = map[action]; 
      this.renderAdminNav(); 
      this.renderAdminTab(); 
      if (propId && action === 'pricing') {
        setTimeout(() => {
          const el = document.querySelector(`[data-prop="${propId}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }

  // ===== 💎 AI 스마트 가격 (작동 보강) =====
  admSmartPricing(c) {
    if (!store.properties.length) {
      c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black">💎 AI 스마트 가격 추천</h2></div>` + UI.Empty('home','매물이 없습니다','매물 등록 후 사용 가능');
      return;
    }
    c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black">💎 AI 스마트 가격 추천</h2><p class="text-slate-500 mt-1">실거래 데이터 분석으로 최적 가격 자동 제안</p></div>
    <div class="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white p-6 rounded-2xl mb-6"><h3 class="font-black text-lg mb-3">🤖 AI 분석 알고리즘</h3><div class="grid grid-cols-3 gap-3 text-sm mobile-stack"><div class="bg-white/10 p-3 rounded-xl"><p class="font-black">📊 최근 거래</p><p class="text-xs opacity-80 mt-1">최근 90일 분석</p></div><div class="bg-white/10 p-3 rounded-xl"><p class="font-black">📅 요일별 가격</p><p class="text-xs opacity-80 mt-1">평일/주말 차이</p></div><div class="bg-white/10 p-3 rounded-xl"><p class="font-black">📈 수요 추세</p><p class="text-xs opacity-80 mt-1">상승/하락 감지</p></div></div></div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mobile-stack">${store.properties.map(p=>{
      let sp;
      try { sp = store.getSmartPricing(p.id); } catch(e) { return ''; }
      if (!sp) return '';
      const diff = sp.suggested - sp.currentPrice;
      const pct = sp.currentPrice ? Math.round(diff/sp.currentPrice*100) : 0;
      const trendCol = {up:'text-green-600 bg-green-50',down:'text-red-600 bg-red-50',stable:'text-blue-600 bg-blue-50'}[sp.trend];
      const trendIcon = {up:'trending-up',down:'trending-down',stable:'minus'}[sp.trend];
      return `<div class="bg-white rounded-2xl border-2 p-5" data-prop="${p.id}"><div class="flex items-center justify-between mb-4"><div><h4 class="font-black text-lg">${p.name}</h4><p class="text-xs text-slate-400 font-bold">${p.location||''}</p></div><span class="px-3 py-1 ${trendCol} rounded-full text-xs font-black flex items-center gap-1"><i data-lucide="${trendIcon}" class="w-3 h-3"></i>${sp.trend.toUpperCase()}</span></div>
      <div class="grid grid-cols-2 gap-3 mb-4"><div class="bg-slate-50 p-3 rounded-xl"><p class="text-[10px] font-black text-slate-400 uppercase">현재 가격</p><p class="text-xl font-black text-slate-700">${fmt(sp.currentPrice)}</p></div><div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-3 rounded-xl"><p class="text-[10px] font-black opacity-70 uppercase">AI 추천 가격</p><p class="text-xl font-black">${fmt(sp.suggested)}</p></div></div>
      <div class="space-y-1 text-xs mb-4"><div class="flex justify-between"><span class="text-slate-500 font-bold">예약 수:</span><span class="font-black">${sp.bookingCount||0}건 (최근90일 ${sp.recentCount||0}건)</span></div><div class="flex justify-between"><span class="text-slate-500 font-bold">실거래 평균:</span><span class="font-black">${fmt(sp.avgNightly)}</span></div><div class="flex justify-between"><span class="text-slate-500 font-bold">최근 90일 평균:</span><span class="font-black">${fmt(sp.recentAvg)}</span></div>${sp.weekendBoost>0?`<div class="flex justify-between"><span class="text-slate-500 font-bold">주말 가산:</span><span class="font-black text-amber-600">+${fmt(sp.weekendBoost)}</span></div>`:''}<div class="flex justify-between pt-2 border-t"><span class="text-slate-500 font-bold">신뢰도:</span><span class="font-black text-blue-600">${sp.confidence}%</span></div></div>
      <div class="bg-amber-50 p-3 rounded-xl mb-3"><p class="text-xs font-bold text-amber-700">💡 ${sp.reason}</p></div>
      ${diff!==0&&sp.confidence>=30?`<button onclick="router.applySmartPrice(${p.id},${sp.suggested})" class="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm">${pct>0?'⬆️ 가격 인상':'⬇️ 가격 인하'} 적용 (${pct>0?'+':''}${pct}%)</button>`:'<div class="text-center text-xs text-slate-400 font-bold py-2">현재 가격이 최적입니다 ✓</div>'}</div>`;
    }).join('')}</div>`;
    lucide.createIcons();
  }
  
  async applySmartPrice(propId, newPrice) {
    if (!confirm(`가격을 ${fmt(newPrice)}로 변경?`)) return;
    const p = store.prop(propId);
    showLoading(true);
    try { await store.upsertProp({...p, price: newPrice}); toast('AI 추천 가격 적용','success'); await this.renderAdminTab(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

  // ===== 매출 관리 =====
    // ===== 매출 관리 (v3.2 강화: 기간/대상 필터 + 숙소 상세) =====
  admSales(c) {
    if (!this._salesFilter) {
      const now = new Date();
      this._salesFilter = {
        period: 'month',
        from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`,
        to: todayStr(),
        scope: 'all',      // all / group / props
        groupName: '',
        propIds: []
      };
    }
    const f = this._salesFilter;
    
    // 통계 대상 매물만
    const allProps = store.statsProperties();
    
    // 대상 필터링
    let targetProps = allProps;
    if (f.scope === 'group' && f.groupName) {
      targetProps = allProps.filter(p => p.group === f.groupName);
    } else if (f.scope === 'props' && f.propIds.length) {
      targetProps = allProps.filter(p => f.propIds.includes(p.id));
    }
    const targetIds = new Set(targetProps.map(p => p.id));
    
    // 자동 선택 매물 처리 (시트표 클릭으로 진입한 경우)
    if (this._salesFilterPropId) {
      f.scope = 'props';
      f.propIds = [this._salesFilterPropId];
      targetProps = allProps.filter(p => p.id === this._salesFilterPropId);
      targetIds.clear();
      targetIds.add(this._salesFilterPropId);
      this._salesFilterPropId = null;
    }
    
    // 기간 필터
    const filteredBookings = store.bookings.filter(b =>
      b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to && targetIds.has(b.propId)
    );
    
    const total = filteredBookings.reduce((s,b) => s + (+b.price||0), 0);
    const byProp = targetProps.map(p => ({
      p,
      t: filteredBookings.filter(b => b.propId === p.id).reduce((s,b) => s + (+b.price||0), 0),
      n: filteredBookings.filter(b => b.propId === p.id).length
    })).sort((a,b) => b.t - a.t);
    
    const byGroup = {};
    store.groups.forEach(g => {
      const gProps = targetProps.filter(p => p.group === g);
      byGroup[g] = filteredBookings.filter(b => gProps.some(p => p.id === b.propId)).reduce((s,b) => s + (+b.price||0), 0);
    });
    
    const periodLabel = { day:'일', week:'주', month:'월', custom:'특정 기간' }[f.period] || '월';
    const scopeLabel = f.scope === 'all' ? '전체' : f.scope === 'group' ? `${f.groupName} 그룹` : `선택 ${f.propIds.length}개`;
    
    c.innerHTML = `<div class="flex justify-between items-center mb-6 flex-wrap gap-3">
      <h2 class="text-3xl font-black">💰 매출 관리</h2>
      <p class="text-sm font-bold text-slate-500">${periodLabel} · ${scopeLabel} · ${filteredBookings.length}건</p>
    </div>
    
    <div class="bg-white p-4 rounded-2xl border mb-4">
      <p class="text-[10px] font-black text-slate-400 uppercase mb-3">📅 기간 필터</p>
      <div class="flex gap-2 flex-wrap items-center mb-4">
        <select id="salesPeriod" class="p-3 border rounded-xl font-bold text-sm">
          <option value="day" ${f.period==='day'?'selected':''}>일</option>
          <option value="week" ${f.period==='week'?'selected':''}>주</option>
          <option value="month" ${f.period==='month'?'selected':''}>월</option>
          <option value="custom" ${f.period==='custom'?'selected':''}>특정 기간</option>
        </select>
        <input type="date" id="salesFrom" value="${f.from}" class="p-3 border rounded-xl font-bold text-sm">
        <span>~</span>
        <input type="date" id="salesTo" value="${f.to}" class="p-3 border rounded-xl font-bold text-sm">
        <button onclick="router.applySalesFilter()" class="bg-slate-900 text-white px-5 py-3 rounded-xl font-black text-sm">적용</button>
        <button onclick="router.salesPrevMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
        <button onclick="router.salesNextMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
      </div>
      
      <p class="text-[10px] font-black text-slate-400 uppercase mb-3">🎯 대상 필터</p>
      <div class="flex gap-2 flex-wrap items-center">
        <select id="salesScope" onchange="router.changeSalesScope(this.value)" class="p-3 border rounded-xl font-bold text-sm">
          <option value="all" ${f.scope==='all'?'selected':''}>🌐 전체</option>
          <option value="group" ${f.scope==='group'?'selected':''}>📁 특정 그룹</option>
          <option value="props" ${f.scope==='props'?'selected':''}>🏠 특정 매물</option>
        </select>
        ${f.scope === 'group' ? `<select id="salesGroup" onchange="router._salesFilter.groupName=this.value;router.renderAdminTab()" class="p-3 border rounded-xl font-bold text-sm">
          <option value="">— 그룹 선택 —</option>
          ${store.groups.map(g => `<option value="${g}" ${f.groupName===g?'selected':''}>${g}</option>`).join('')}
        </select>` : ''}
        ${f.scope === 'props' ? `<button onclick="router.showSalesPropsPicker()" class="bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm">🏠 매물 선택 (${f.propIds.length}개)</button>` : ''}
        <button onclick="router._salesFilter.scope='all';router._salesFilter.propIds=[];router._salesFilter.groupName='';router.renderAdminTab()" class="bg-slate-100 px-4 py-3 rounded-xl font-bold text-sm">🔄 초기화</button>
      </div>
    </div>
    
    <div class="grid grid-cols-4 gap-4 mb-6 mobile-stack">
      <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 rounded-2xl">
        <p class="text-[10px] font-black uppercase opacity-70">총매출</p>
        <p class="text-2xl font-black mt-2">${fmt(total)}</p>
      </div>
      ${Object.entries(byGroup).filter(([g,v])=>v>0).slice(0,3).map(([g,v])=>`<div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">${g}</p><p class="text-xl font-black text-blue-600 mt-2">${fmt(v)}</p></div>`).join('')}
    </div>
    
    <div class="bg-white rounded-2xl border overflow-hidden mb-6">
      <div class="p-5 border-b bg-slate-50 flex justify-between items-center flex-wrap gap-2">
        <h3 class="font-black text-sm uppercase">🏠 숙소별 매출 순위</h3>
        <p class="text-xs text-slate-400 font-bold">💡 숙소명 클릭 시 상세 매출 이력</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase">
            <tr>
              <th class="px-5 py-3 text-left">No.</th>
              <th class="px-5 py-3 text-left">숙소</th>
              <th class="px-5 py-3 text-left">그룹</th>
              <th class="px-5 py-3 text-right">예약수</th>
              <th class="px-5 py-3 text-right">총매출</th>
              <th class="px-5 py-3 text-right">평균</th>
            </tr>
          </thead>
          <tbody class="text-sm divide-y">
            ${byProp.length ? byProp.map((r,i) => `<tr class="hover:bg-blue-50/30 cursor-pointer" onclick="router.showSalesPropDetail(${r.p.id})">
              <td class="px-5 py-4 font-black">${i+1}</td>
              <td class="px-5 py-4 font-black text-blue-600 hover:underline">${r.p.name}${r.p.hidden?' <span class="text-[9px] bg-slate-400 text-white px-1.5 py-0.5 rounded">숨김</span>':''}</td>
              <td class="px-5 py-4 text-xs">${r.p.group||'-'}</td>
              <td class="px-5 py-4 text-right font-bold">${r.n}건</td>
              <td class="px-5 py-4 text-right font-black text-blue-600">${fmt(r.t)}</td>
              <td class="px-5 py-4 text-right font-bold text-slate-500">${fmt(r.n?Math.round(r.t/r.n):0)}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="text-center py-8 text-slate-400 font-bold">데이터가 없습니다</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="bg-white p-6 rounded-2xl border">
      <h3 class="font-black mb-4">📈 기간별 매출 추이 (필터 적용)</h3>
      <canvas id="sChart" height="100"></canvas>
    </div>`;
    
    setTimeout(() => {
      // 일별/월별 매출 추이
      const dayMap = {};
      filteredBookings.forEach(b => {
        if (!b.checkIn) return;
        const k = f.period === 'day' ? b.checkIn : b.checkIn.slice(0,7);
        dayMap[k] = (dayMap[k]||0) + (+b.price||0);
      });
      const keys = Object.keys(dayMap).sort();
      const el = document.getElementById('sChart');
      if (el && keys.length) {
        new Chart(el, {
          type: 'line',
          data: {
            labels: keys,
            datasets: [{
              label: '매출',
              data: keys.map(k => dayMap[k]),
              borderColor: '#2563eb',
              backgroundColor: '#2563eb30',
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            plugins: { legend: { display: false } },
            scales: { y: { ticks: { callback: v => fmt(v) } } }
          }
        });
      } else if (el) {
        el.parentElement.innerHTML += '<p class="text-center text-slate-400 font-bold py-8">데이터가 없습니다</p>';
      }
    }, 100);
    lucide.createIcons();
  }
    // ===== [v3.2] 매출 기간 필터 핸들러 =====
  applySalesFilter() {
    const period = document.getElementById('salesPeriod').value;
    let from = document.getElementById('salesFrom').value;
    let to = document.getElementById('salesTo').value;
    if (period === 'day') from = to = todayStr();
    else if (period === 'week') {
      const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day;
      from = new Date(d.setDate(diff)).toISOString().split('T')[0];
      to = new Date(d.setDate(diff+6)).toISOString().split('T')[0];
    } else if (period === 'month') {
      const fd = new Date(from || todayStr());
      from = `${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-01`;
      const last = new Date(fd.getFullYear(), fd.getMonth()+1, 0);
      to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    }
    this._salesFilter = { ...this._salesFilter, period, from, to };
    this.renderAdminTab();
  }
  
  salesPrevMonth() {
    const f = this._salesFilter;
    const d = new Date(f.from);
    d.setMonth(d.getMonth() - 1);
    f.from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
    f.to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    f.period = 'month';
    this.renderAdminTab();
  }
  
  salesNextMonth() {
    const f = this._salesFilter;
    const d = new Date(f.from);
    d.setMonth(d.getMonth() + 1);
    f.from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
    f.to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    f.period = 'month';
    this.renderAdminTab();
  }
  
  changeSalesScope(scope) {
    this._salesFilter.scope = scope;
    if (scope === 'all') {
      this._salesFilter.propIds = [];
      this._salesFilter.groupName = '';
    }
    this.renderAdminTab();
  }
  
  // ===== [v3.2] 매물 다중 선택 모달 =====
  showSalesPropsPicker() {
    const selected = new Set(this._salesFilter.propIds);
    openModal('🏠 매물 다중 선택', `
      <div class="bg-blue-50 p-3 rounded-xl mb-4 text-xs font-bold text-blue-700">💡 분석할 매물을 여러 개 선택하세요</div>
      <div class="flex gap-2 mb-4">
        <button onclick="document.querySelectorAll('[data-spp]').forEach(c=>c.checked=true)" class="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-black">✅ 전체 선택</button>
        <button onclick="document.querySelectorAll('[data-spp]').forEach(c=>c.checked=false)" class="bg-slate-200 px-3 py-2 rounded-lg text-xs font-black">❌ 전체 해제</button>
      </div>
      <div class="space-y-2 max-h-96 overflow-y-auto scrollbar">
        ${store.statsProperties().map(p => `<label class="flex items-center gap-3 p-3 bg-slate-50 hover:bg-blue-50 rounded-xl cursor-pointer">
          <input type="checkbox" data-spp value="${p.id}" ${selected.has(p.id)?'checked':''} class="w-4 h-4">
          <div class="flex-1">
            <p class="font-black text-sm">${p.name}</p>
            <p class="text-[10px] text-slate-400 font-bold">${p.group||'-'} · ${fmt(p.price)}</p>
          </div>
        </label>`).join('')}
      </div>
      <button onclick="router.applySalesPropsPicker()" class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase mt-4">✅ 적용</button>
    `, 'max-w-2xl');
  }
  
  applySalesPropsPicker() {
    const checked = [...document.querySelectorAll('[data-spp]:checked')].map(c => +c.value);
    this._salesFilter.propIds = checked;
    closeModal();
    this.renderAdminTab();
    toast(`${checked.length}개 매물 선택됨`, 'success');
  }
  
  // ===== [v3.2] 숙소별 상세 매출 이력 =====
  showSalesPropDetail(propId) {
    const p = store.prop(propId);
    if (!p) return;
    const f = this._salesFilter;
    const bookings = store.bookings.filter(b =>
      b.propId === propId && b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to
    ).sort((a,b) => (b.checkIn||'').localeCompare(a.checkIn||''));
    
    const total = bookings.reduce((s,b) => s + (+b.price||0), 0);
    const byPlat = {};
    bookings.forEach(b => {
      byPlat[b.platform] = (byPlat[b.platform]||0) + (+b.price||0);
    });
    
    openModal(`💰 ${p.name} - 매출 상세`, `
      <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl mb-6">
        <p class="text-xs opacity-70 uppercase font-black mb-2">${f.from} ~ ${f.to}</p>
        <p class="text-4xl font-black">${fmt(total)}</p>
        <p class="text-sm opacity-80 mt-2">${bookings.length}건 예약 · 평균 ${fmt(bookings.length?Math.round(total/bookings.length):0)}</p>
      </div>
      
      ${Object.keys(byPlat).length ? `<div class="bg-white border rounded-2xl p-5 mb-4">
        <p class="text-[10px] font-black text-slate-400 uppercase mb-3">🎯 플랫폼별 매출</p>
        <div class="space-y-2">
          ${Object.entries(byPlat).sort((a,b)=>b[1]-a[1]).map(([k,v]) => {
            const pl = store.platforms.find(x=>x.name===k);
            const pct = total > 0 ? Math.round(v/total*100) : 0;
            return `<div>
              <div class="flex justify-between text-sm mb-1">
                <span class="font-bold" style="color:${pl?.color||'#666'}">${k}</span>
                <span class="font-black">${fmt(v)} <span class="text-xs text-slate-400">(${pct}%)</span></span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-2">
                <div class="h-2 rounded-full" style="width:${pct}%;background:${pl?.color||'#2563eb'}"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
      
      <div class="bg-white border rounded-2xl overflow-hidden">
        <div class="p-4 bg-slate-50 border-b">
          <p class="text-[10px] font-black text-slate-500 uppercase">📅 예약 이력 (${bookings.length}건)</p>
        </div>
        <div class="overflow-x-auto max-h-96 overflow-y-auto scrollbar">
          ${bookings.length ? `<table class="w-full text-xs">
            <thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left">기간</th>
                <th class="px-3 py-2 text-left">예약자</th>
                <th class="px-3 py-2 text-left">플랫폼</th>
                <th class="px-3 py-2 text-center">인원</th>
                <th class="px-3 py-2 text-right">금액</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              ${bookings.map(b => {
                const pl = store.platforms.find(x=>x.name===b.platform);
                return `<tr class="hover:bg-blue-50/30">
                  <td class="px-3 py-2 font-mono">${b.checkIn} ~ ${b.checkOut}</td>
                  <td class="px-3 py-2 font-black">${b.guest}</td>
                  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-[9px] font-black text-white" style="background:${pl?.color||'#666'}">${b.platform}</span></td>
                  <td class="px-3 py-2 text-center">${b.people}명</td>
                  <td class="px-3 py-2 text-right font-black text-blue-600">${fmt(b.price)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<p class="p-8 text-center text-slate-400 font-bold">예약 이력이 없습니다</p>'}
        </div>
      </div>
    `, 'max-w-3xl');
  }

  // ===== 통계/보고서 =====

  async addRecipient(uid){if(uid&&!store.reportRecipients.includes(uid)){store.reportRecipients.push(uid);await API.setAll('reportRecipients',store.reportRecipients);await this.renderAdminTab()}}
  async delRecipient(uid){store.reportRecipients=store.reportRecipients.filter(x=>x!==uid);await API.setAll('reportRecipients',store.reportRecipients);await this.renderAdminTab()}
  
  genReport() {
    const rev = store.bookings.reduce((s,b)=>s+(+b.price||0),0);
    const cost = store.expenses.filter(e=>e.majorCat!=='초기투자지출').reduce((s,e)=>s+(+e.amount||0),0);
    const top = [...store.properties].sort((a,b)=>store.bookings.filter(x=>x.propId===b.id).reduce((s,x)=>s+(+x.price||0),0)-store.bookings.filter(x=>x.propId===a.id).reduce((s,x)=>s+(+x.price||0),0))[0];
    const critical = store.logs.filter(l=>l.special).slice(0,5);
    openModal('📝 AI 자동 보고서', `<div id="reportContent" class="space-y-5"><div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl"><p class="text-xs font-black uppercase opacity-70 mb-2">📊 핵심 요약 (초기투자 제외)</p><p class="font-bold leading-relaxed">총 매출 <b>${fmt(rev)}</b>, 운영지출 <b>${fmt(cost)}</b> → 운영 순이익 <b>${fmt(rev-cost)}</b>. 최고 매출 숙소는 <b>${top?.name||'-'}</b>이며, 특이사항 ${critical.length}건 발생.</p></div><div><h4 class="font-black mb-3">📈 매출 현황</h4><div class="bg-slate-50 p-4 rounded-xl"><p class="text-sm">${store.bookings.length}건 예약 / 평균 ${fmt(store.bookings.length?Math.round(rev/store.bookings.length):0)}</p></div></div><div><h4 class="font-black mb-3">💳 주요 지출 TOP 3</h4><div class="bg-slate-50 p-4 rounded-xl space-y-2">${Object.entries(store.expenses.filter(e=>e.majorCat!=='초기투자지출').reduce((a,e)=>{a[e.category]=(a[e.category]||0)+(+e.amount||0);return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`<div class="flex justify-between text-sm"><span class="font-bold">${k}</span><span class="font-black text-red-500">${fmt(v)}</span></div>`).join('')}</div></div><div><h4 class="font-black mb-3">🚨 특이사항</h4><div class="bg-red-50 p-4 rounded-xl space-y-2">${critical.length?critical.map(l=>`<p class="text-sm font-bold text-red-700">• ${l.message}</p>`).join(''):'<p class="text-sm text-slate-500">없음</p>'}</div></div><div class="flex gap-2 pt-4 border-t"><button onclick="window.print()" class="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black">🖨️ 인쇄</button><button onclick="router.genReportPDF()" class="flex-1 bg-red-500 text-white py-3 rounded-xl font-black">📄 PDF</button><button onclick="(async()=>{await store.sendKakaoNotification('월간 보고서가 생성되었습니다');toast('수신자 '+store.reportRecipients.length+'명 발송 + 카톡 알림','success')})()" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black">📧 발송</button></div></div>`, 'max-w-3xl');
  }
  
    // ===== [v3.2] PDF 발급 = AI 보고서 디자인 동일 =====
  async genReportPDFFromAI() {
    // AI 보고서 모달 먼저 열기
    this.genReport();
    
    // 잠시 대기 후 캡처
    await new Promise(r => setTimeout(r, 500));
    
    const reportEl = document.getElementById('reportContent');
    if (!reportEl) {
      toast('AI 보고서를 먼저 생성하세요', 'error');
      return;
    }
    
    showLoading(true);
    try {
      // html2canvas 동적 로드
      if (typeof html2canvas === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      
      // 보고서 영역 캡처
      const canvas = await html2canvas(reportEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      
      const { jsPDF } = window.jspdf;
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      // A4 사이즈 (210mm x 297mm)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 10;
      const contentWidth = pdfWidth - (margin * 2);
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // 페이지 분할 처리
      let heightLeft = imgHeight;
      let position = margin;
      
      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - margin * 2);
      
      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);
      }
      
      pdf.save(`QJ-Report-${todayStr()}.pdf`);
      toast('📄 PDF 다운로드 완료 (AI 보고서 디자인 동일)', 'success');
      
      // 모달 닫기
      closeModal();
    } catch (e) {
      console.error('PDF generation failed:', e);
      toast('PDF 생성 실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
  
  // 기존 PDF 발급 (간단 버전 유지)
  genReportPDF() {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const f = this._statsFilter || { from: todayStr(), to: todayStr() };
      const showAll = this._statsShowAll || false;
      const propsForStats = store.statsProperties();
      const propIds = new Set(propsForStats.map(p => p.id));
      const filteredBookings = store.bookings.filter(b => b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to && propIds.has(b.propId));
      const filteredExpenses = store.expenses.filter(e => e.date && e.date >= f.from && e.date <= f.to && propIds.has(e.propId));
      const rev = filteredBookings.reduce((s,b)=>s+(+b.price||0),0);
      const cAll = filteredExpenses.reduce((s,e)=>s+(+e.amount||0),0);
      const cInit = filteredExpenses.filter(e=>e.majorCat==='초기투자지출').reduce((s,e)=>s+(+e.amount||0),0);
      const cost = showAll ? cAll : (cAll - cInit);
      
      doc.setFontSize(20);
      doc.text('QJ-PropMS Report', 20, 20);
      doc.setFontSize(11);
      doc.text(`Period: ${f.from} ~ ${f.to}`, 20, 30);
      doc.text(`Total Revenue: KRW ${rev.toLocaleString()}`, 20, 45);
      doc.text(`Operating Cost: KRW ${cost.toLocaleString()}`, 20, 55);
      doc.text(`Net Profit: KRW ${(rev-cost).toLocaleString()}`, 20, 65);
      doc.text(`Bookings: ${filteredBookings.length}`, 20, 75);
      doc.text(`Properties: ${propsForStats.length}`, 20, 85);
      doc.save(`QJ-Report-Simple-${todayStr()}.pdf`);
      toast('📄 PDF 다운로드 완료', 'success');
    } catch(e) { 
      toast('PDF 생성 실패: '+e.message, 'error'); 
    }
  }
  // ===== 운영 관리 (AI) =====
  admOps(c) {
    if (!store.properties.length) {
      c.innerHTML = `<h2 class="text-3xl font-black mb-6">📋 운영 관리</h2>` + UI.Empty('clipboard-list','매물이 없습니다');
      return;
    }
    const ops = store.opsData || {};
    const sumSedae = store.properties.reduce((s,p)=>s+(+p.sedaebi||0),0);
    const sumTotalRev = store.properties.reduce((s,p)=>s+(+ops[p.id]?.totalRev||0),0);
    const sumSilip = store.properties.reduce((s,p)=>s+(+ops[p.id]?.silip||0),0);
    const sumFinalCost = store.properties.reduce((s,p)=>s+(+ops[p.id]?.finalCost||0),0);
    const sumFinalProfit = store.properties.reduce((s,p)=>s+(+ops[p.id]?.finalProfit||0),0);
    const sumOpCost = store.properties.reduce((s,p)=>s+(+ops[p.id]?.opCost||0),0);
    const aiRecs = [];
    store.properties.forEach(p => {
      const o = ops[p.id]||{};
      const myBks = store.bookings.filter(b=>b.propId===p.id);
      const myExp = store.expenses.filter(e=>e.propId===p.id&&e.majorCat!=='초기투자지출').reduce((s,e)=>s+(+e.amount||0),0);
      const r = myBks.reduce((s,b)=>s+(+b.price||0),0);
      const profitRate = r?(r-myExp)/r*100:0;
      if (profitRate < 30 && r > 0) aiRecs.push({prop:p,msg:`수익률 ${Math.round(profitRate)}% - 가격 인상 또는 비용 절감 필요`});
      if (myBks.length === 0) aiRecs.push({prop:p,msg:'예약 0건 - 마케팅 강화 필요'});
      if (o.opDays > 100 && (+o.avgMonth||0) < 1000000) aiRecs.push({prop:p,msg:`운영 ${o.opDays}일이지만 평균 매출 부족`});
    });
    c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black">📋 운영 관리 (AI 통합)</h2><p class="text-slate-500 text-sm">AI 추천 + 실시간 운영 데이터</p></div>${aiRecs.length?`<div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-5 rounded-2xl mb-6"><h3 class="font-black mb-3 flex items-center gap-2"><i data-lucide="sparkles" class="w-5 h-5"></i>🤖 AI 운영 추천 (${aiRecs.length}건)</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${aiRecs.slice(0,4).map(r=>`<div class="bg-white/10 rounded-xl p-3"><p class="text-sm font-black">${r.prop.name}</p><p class="text-[11px] opacity-80 mt-1">${r.msg}</p></div>`).join('')}</div></div>`:''}
    <div class="grid grid-cols-6 gap-3 mb-6 mobile-stack"><div class="bg-amber-50 p-4 rounded-xl border border-amber-200"><p class="text-[9px] font-black text-amber-600 uppercase">세대비</p><p class="text-lg font-black text-amber-700 mt-1">${fmtNum(sumSedae)}</p></div><div class="bg-blue-50 p-4 rounded-xl border border-blue-200"><p class="text-[9px] font-black text-blue-600 uppercase">총매출</p><p class="text-lg font-black text-blue-700 mt-1">${fmtNum(sumTotalRev)}</p></div><div class="bg-green-50 p-4 rounded-xl border border-green-200"><p class="text-[9px] font-black text-green-600 uppercase">실입금액</p><p class="text-lg font-black text-green-700 mt-1">${fmtNum(sumSilip)}</p></div><div class="bg-red-50 p-4 rounded-xl border border-red-200"><p class="text-[9px] font-black text-red-600 uppercase">최종비용</p><p class="text-lg font-black text-red-700 mt-1">${fmtNum(sumFinalCost)}</p></div><div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200"><p class="text-[9px] font-black text-emerald-600 uppercase">최종순수익</p><p class="text-lg font-black text-emerald-700 mt-1">${fmtNum(sumFinalProfit)}</p></div><div class="bg-slate-900 p-4 rounded-xl text-white"><p class="text-[9px] font-black uppercase opacity-70">운영비</p><p class="text-lg font-black mt-1">${fmtNum(sumOpCost)}</p></div></div>
    <div class="bg-white rounded-2xl border overflow-auto max-h-[70vh]"><table class="ops-table w-full text-xs"><thead class="sticky top-0 z-10"><tr class="bg-slate-800 text-white">${['No','매니저','매물','세대비','매막매출','관리비','청소비','총매출','실입금액','수리','청소','가스','인터넷','분리수거','시작','마감','최종비용','순수익','운영일','월평균','주단가','월예상','운영비','주소','편집'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${store.properties.map((p,i)=>{const o=ops[p.id]||{};const aiAlert=aiRecs.find(r=>r.prop.id===p.id);return `<tr class="hover:bg-blue-50/30 ${aiAlert?'bg-purple-50':''}"><td class="text-center font-black">${i+1}${aiAlert?' ⚠️':''}</td><td class="text-center">${mgrTag(p.manager)}</td><td class="font-black whitespace-nowrap">${p.name}</td><td class="text-right font-bold text-amber-600">${fmtNum(p.sedaebi||0)}</td><td class="text-right">${fmtNum(o.maemakMae||0)}</td><td class="text-right">${fmtNum(o.gwanli||0)}</td><td class="text-right">${fmtNum(o.cheongso||0)}</td><td class="text-right font-black text-blue-600">${fmtNum(o.totalRev||0)}</td><td class="text-right font-black text-green-600 bg-green-50">${fmtNum(o.silip||0)}</td><td class="text-center text-[10px]">${o.repair||'-'}</td><td class="text-center text-[10px]">${o.entryClean||'-'}</td><td class="text-center text-[10px]">${o.gas||'-'}</td><td class="text-center text-[10px]">${o.netProvider||'-'}</td><td class="text-center text-[10px]">${o.recycle||'-'}</td><td class="text-center font-mono">${o.startOp||'-'}</td><td class="text-center font-mono">${o.endOp||'-'}</td><td class="text-right font-bold text-red-500">${fmtNum(o.finalCost||0)}</td><td class="text-right font-black text-emerald-600">${fmtNum(o.finalProfit||0)}</td><td class="text-center font-bold">${o.opDays||0}</td><td class="text-right font-bold">${fmtNum(o.avgMonth||0)}</td><td class="text-right text-[10px]">${fmtNum(o.weekly||0)}</td><td class="text-right font-bold">${fmtNum(o.monthly||0)}</td><td class="text-right font-bold text-slate-500">${fmtNum(o.opCost||0)}</td><td class="text-[10px]"><a href="${p.guide||'#'}" target="_blank" class="text-blue-600 underline">${(p.address||p.location||'-').slice(0,20)}</a></td><td class="text-center"><button onclick="router.showOpsForm(${p.id})" class="p-1.5 bg-slate-100 rounded-lg hover:bg-blue-500 hover:text-white"><i data-lucide="edit-3" class="w-3 h-3"></i></button></td></tr>`}).join('')}</tbody></table></div>`;
    lucide.createIcons();
  }
  
  showOpsForm(propId) {
    const p = store.prop(propId);
    const o = (store.opsData||{})[propId]||{};
    openModal(`✏️ ${p.name} 운영 데이터`, `<form id="opsF" class="space-y-4"><div class="grid grid-cols-3 gap-3 mobile-stack">${[['sedaebi','세대비',p.sedaebi||0,'number'],['maemakMae','매막매출',o.maemakMae||0,'number'],['gwanli','관리비',o.gwanli||0,'number'],['cheongso','청소비',o.cheongso||0,'number'],['totalRev','총매출',o.totalRev||0,'number'],['silip','실입금액',o.silip||0,'number'],['repair','수리',o.repair||'',''],['entryClean','입주청소',o.entryClean||'',''],['gas','도시가스',o.gas||'','']].map(([k,l,v,t])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input ${t==='number'?'type="number"':''} name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}<div class="col-span-3"><label class="text-[10px] font-black text-slate-400 uppercase">인터넷</label><input name="netProvider" value="${o.netProvider||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>${[['recycle','분리수거',o.recycle||'',''],['startOp','운영시작',o.startOp||'',''],['endOp','운영마감',o.endOp||'',''],['finalCost','최종비용',o.finalCost||0,'number'],['finalProfit','최종순수익',o.finalProfit||0,'number'],['opDays','운영일',o.opDays||0,'number'],['avgMonth','월평균',o.avgMonth||0,'number'],['weekly','주단가',o.weekly||0,'number'],['monthly','월예상',o.monthly||0,'number'],['opCost','운영비',o.opCost||0,'number']].map(([k,l,v,t])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input ${t==='number'?'type="number"':''} name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}</div><button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">저장</button></form>`, 'max-w-4xl');
    document.getElementById('opsF').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      ['sedaebi','maemakMae','gwanli','cheongso','totalRev','silip','finalCost','finalProfit','opDays','avgMonth','weekly','monthly','opCost'].forEach(f=>d[f]=+d[f]);
      p.sedaebi = d.sedaebi; delete d.sedaebi;
      await API.update('properties', p.id, p);
      const opsData = store.opsData || {};
      opsData[propId] = d;
      store.opsData = opsData;
      await API.setAll('opsData', opsData);
      toast('저장됨','success');
      closeModal();
      await this.renderAdminTab();
    };
  }

  // ===== 고객 관리 =====
  admCustomers(c) {
    const map = {};
    store.bookings.forEach(b=>{const k=(b.guest||'')+'|'+(b.contact||'');if(!map[k])map[k]={key:k,guest:b.guest,contact:b.contact,nat:b.nationality,n:0,t:0,plats:new Set(),last:'',bookings:[]};map[k].n++;map[k].t+=(+b.price||0);map[k].plats.add(b.platform);if(b.checkIn>map[k].last)map[k].last=b.checkIn;map[k].bookings.push(b)});
    const list = Object.values(map).sort((a,b)=>(b.last||'').localeCompare(a.last||''));
    const platStats = {};
    store.platforms.forEach(p=>platStats[p.name]={count:0,revenue:0,color:p.color});
    store.bookings.forEach(b=>{if(platStats[b.platform]){platStats[b.platform].count++;platStats[b.platform].revenue+=(+b.price||0)}});
    const totalRev = Object.values(platStats).reduce((s,p)=>s+p.revenue,0);
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><div><h2 class="text-3xl font-black">👥 고객 관리</h2><p class="text-slate-500 mt-1">최근순 정렬 · 클릭하여 메모 작성</p></div><button onclick="router.showPlatformMgr()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">🎯 플랫폼 관리</button></div>
    <div class="grid grid-cols-4 gap-4 mb-6 mobile-stack"><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">고객수</p><p class="text-2xl font-black mt-2">${list.length}명</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">재방문</p><p class="text-2xl font-black text-blue-600 mt-2">${list.filter(x=>x.n>1).length}명</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">평균객단가</p><p class="text-2xl font-black mt-2">${fmt(list.length?Math.round(list.reduce((s,x)=>s+x.t,0)/list.length):0)}</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">외국인</p><p class="text-2xl font-black mt-2">${list.filter(x=>x.nat&&x.nat!=='한국').length}명</p></div></div>
    <div class="bg-white rounded-2xl border overflow-hidden mb-6"><div class="p-4 border-b bg-slate-50"><h3 class="font-black text-sm uppercase">📋 고객 리스트 (최신순)</h3></div><div class="overflow-x-auto"><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr>${['No.','예약자','연락처','국적','횟수','총매출','평균','플랫폼','최근','메모'].map(h=>`<th class="px-4 py-3 text-left">${h}</th>`).join('')}</tr></thead><tbody class="text-sm divide-y">${list.map((cu,i)=>{const memo=store.customerMemos[cu.key]?.memo||'';return `<tr class="hover:bg-blue-50/30 cursor-pointer" onclick="router.showCustomerDetail('${cu.key}')"><td class="px-4 py-3 font-black">${i+1}</td><td class="px-4 py-3 font-black">${cu.guest}</td><td class="px-4 py-3 font-mono text-xs">${cu.contact}</td><td class="px-4 py-3"><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black">${cu.nat||'-'}</span></td><td class="px-4 py-3 text-center font-black ${cu.n>1?'text-blue-600':''}">${cu.n}회 ${cu.n>1?'⭐':''}</td><td class="px-4 py-3 font-black text-blue-600">${fmt(cu.t)}</td><td class="px-4 py-3 font-bold">${fmt(Math.round(cu.t/cu.n))}</td><td class="px-4 py-3 text-xs font-bold">${[...cu.plats].join(', ')}</td><td class="px-4 py-3 text-xs font-bold text-slate-500">${cu.last}</td><td class="px-4 py-3 text-xs ${memo?'text-amber-600 font-bold':'text-slate-300'}">${memo?'📝 '+memo.slice(0,15)+(memo.length>15?'...':''):'-'}</td></tr>`}).join('')}</tbody></table></div></div>
    <div class="bg-white rounded-2xl border p-6"><h3 class="font-black text-lg mb-4">🎯 플랫폼별 매출 통계</h3><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 mobile-stack">${Object.entries(platStats).map(([name,s])=>{const pct=totalRev?Math.round(s.revenue/totalRev*100):0;return `<div class="bg-slate-50 p-4 rounded-2xl border-l-4" style="border-color:${s.color}"><div class="flex justify-between items-start mb-2"><span class="font-black text-sm" style="color:${s.color}">${name}</span><span class="text-[10px] font-black bg-white px-2 py-0.5 rounded-full">${pct}%</span></div><p class="text-2xl font-black mt-1">${fmt(s.revenue)}</p><p class="text-xs text-slate-500 font-bold mt-1">${s.count}건 · ${fmt(s.count?Math.round(s.revenue/s.count):0)}</p><div class="w-full bg-slate-200 rounded-full h-2 mt-3"><div class="h-2 rounded-full" style="width:${pct}%;background:${s.color}"></div></div></div>`}).join('')}</div><canvas id="platChart" height="80"></canvas></div>`;
    setTimeout(()=>{
      const labels = Object.keys(platStats);
      const data = labels.map(l=>platStats[l].revenue);
      const colors = labels.map(l=>platStats[l].color);
      const el = document.getElementById('platChart');
      if(el && labels.length) new Chart(el,{type:'bar',data:{labels,datasets:[{data,backgroundColor:colors}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
    },100);
    lucide.createIcons();
  }

  showCustomerDetail(key) {
    const map = {};
    store.bookings.forEach(b=>{const k=(b.guest||'')+'|'+(b.contact||'');if(!map[k])map[k]={key:k,guest:b.guest,contact:b.contact,nat:b.nationality,n:0,t:0,plats:new Set(),bookings:[]};map[k].n++;map[k].t+=(+b.price||0);map[k].plats.add(b.platform);map[k].bookings.push(b)});
    const cu = map[key];
    if (!cu) return;
    const cmemo = store.customerMemos[key] || { name:cu.guest, contact:cu.contact, nat:cu.nat, memo:'' };
    openModal(`👤 ${cu.guest}님 정보`, `<form id="custForm" class="space-y-4"><div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl"><p class="text-3xl font-black">${cu.guest}</p><div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/20"><div><p class="text-[10px] opacity-70 uppercase">예약</p><p class="text-2xl font-black">${cu.n}회</p></div><div><p class="text-[10px] opacity-70 uppercase">총매출</p><p class="text-xl font-black">${fmt(cu.t)}</p></div><div><p class="text-[10px] opacity-70 uppercase">평균</p><p class="text-xl font-black">${fmt(Math.round(cu.t/cu.n))}</p></div></div></div><div class="grid grid-cols-2 gap-3"><input name="name" value="${cmemo.name||cu.guest}" placeholder="이름" class="p-3 border rounded-xl font-bold"><input name="contact" value="${cmemo.contact||cu.contact}" placeholder="연락처" class="p-3 border rounded-xl font-bold"></div><input name="nat" value="${cmemo.nat||cu.nat||''}" placeholder="국적" class="w-full p-3 border rounded-xl font-bold"><textarea name="memo" placeholder="📝 고객 메모 (VIP/알러지/선호 등)" class="w-full p-3 border-2 border-amber-200 rounded-xl font-bold h-32 bg-amber-50">${cmemo.memo||''}</textarea><div class="bg-slate-50 p-4 rounded-xl"><p class="text-[10px] font-black text-slate-500 uppercase mb-3">📅 예약 이력 (${cu.bookings.length}건)</p><div class="space-y-2 max-h-40 overflow-y-auto scrollbar">${cu.bookings.sort((a,b)=>(b.checkIn||'').localeCompare(a.checkIn||'')).map(b=>{const p=store.prop(b.propId);const pl=store.platforms.find(x=>x.name===b.platform);return `<div class="bg-white p-2 rounded-lg flex justify-between text-xs"><div><b>${p?.name||'-'}</b> · <span style="color:${pl?.color||'#666'}">${b.platform}</span></div><div><span class="text-slate-500">${b.checkIn}~${b.checkOut}</span> <b class="text-blue-600">${fmt(b.price)}</b></div></div>`}).join('')}</div></div><button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">💾 저장</button></form>`, 'max-w-3xl');
    document.getElementById('custForm').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      await store.saveCustomerMemo(key, d);
      toast('저장됨','success'); closeModal(); await this.renderAdminTab();
    };
  }
  
  showPlatformMgr() {
    openModal('🎯 플랫폼 관리', `<div class="space-y-2 mb-4">${store.platforms.map((p,i)=>`<div class="flex items-center gap-2 bg-slate-50 p-3 rounded-xl"><span class="w-8 h-8 rounded-lg" style="background:${p.color}"></span><input value="${p.name}" data-pn="${i}" class="flex-1 p-2 border rounded-lg font-bold"><input type="color" value="${p.color}" data-pc="${i}" class="w-12 h-10 border rounded-lg cursor-pointer"><button onclick="router.savePlatform(${i})" class="text-blue-500"><i data-lucide="check" class="w-4 h-4"></i></button><button onclick="router.delPlatform(${i})" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`).join('')}</div><form id="platForm" class="bg-blue-50 p-4 rounded-xl"><p class="text-xs font-black text-blue-600 uppercase mb-3">+ 신규 플랫폼</p><div class="flex gap-2"><input name="name" placeholder="플랫폼명" class="flex-1 p-3 border rounded-xl font-bold" required><input type="color" name="color" value="#2563eb" class="w-16 h-12 border rounded-xl cursor-pointer"><button class="bg-blue-600 text-white px-5 rounded-xl font-black">추가</button></div></form>`);
    document.getElementById('platForm').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (store.platforms.find(p=>p.name===d.name)) { toast('이미 존재','error'); return; }
      store.platforms.push({ name:d.name, color:d.color });
      await API.setAll('platforms', store.platforms);
      this.showPlatformMgr();
      await this.renderAdminTab();
      toast('추가됨','success');
    };
    lucide.createIcons();
  }
  async savePlatform(i) {
    const name = document.querySelector(`[data-pn="${i}"]`).value.trim();
    const color = document.querySelector(`[data-pc="${i}"]`).value;
    if (!name) return;
    store.platforms[i] = { name, color };
    await API.setAll('platforms', store.platforms);
    toast('수정됨','success');
    await this.renderAdminTab();
  }
  async delPlatform(i) {
    if (!confirm('삭제?')) return;
    store.platforms.splice(i,1);
    await API.setAll('platforms', store.platforms);
    this.showPlatformMgr();
    await this.renderAdminTab();
  }
  // ===== 🎨 메인화면 관리 (사이트 설정) =====


  // ===== ✨ AI 인사이트 (작동 보강) =====
  admAIInsights(c) {
    let insights;
    try { insights = store.getAIInsights() || []; }
    catch(e) { 
      console.error('AI Insights error:', e);
      c.innerHTML = `<div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6"><h3 class="font-black text-red-700">⚠️ AI 분석 오류</h3><p class="text-sm mt-2">${e.message}</p><button onclick="router.renderAdminTab()" class="mt-4 bg-red-500 text-white px-5 py-2 rounded-xl font-black text-sm">다시 시도</button></div>`;
      return;
    }
    const grouped = { warning: [], info: [], success: [] };
    insights.forEach(i => grouped[i.level]?.push(i));
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><div><h2 class="text-3xl font-black">✨ AI 인사이트</h2><p class="text-slate-500 mt-1">데이터 분석 기반 자동 운영 개선 추천 (${insights.length}건)</p></div><button onclick="router.renderAdminTab()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm"><i data-lucide="refresh-cw" class="w-4 h-4 inline"></i> 다시 분석</button></div>
    <div class="grid grid-cols-3 gap-4 mb-6 mobile-stack"><div class="bg-red-50 border-2 border-red-200 p-5 rounded-2xl"><p class="text-[10px] font-black text-red-600 uppercase">⚠️ 경고</p><p class="text-3xl font-black text-red-700 mt-2">${grouped.warning.length}건</p></div><div class="bg-blue-50 border-2 border-blue-200 p-5 rounded-2xl"><p class="text-[10px] font-black text-blue-600 uppercase">ℹ️ 알림</p><p class="text-3xl font-black text-blue-700 mt-2">${grouped.info.length}건</p></div><div class="bg-green-50 border-2 border-green-200 p-5 rounded-2xl"><p class="text-[10px] font-black text-green-600 uppercase">✅ 추천</p><p class="text-3xl font-black text-green-700 mt-2">${grouped.success.length}건</p></div></div>
    <div class="space-y-3">${insights.map((i,idx)=>{const colors={warning:'bg-red-50 border-red-200',info:'bg-blue-50 border-blue-200',success:'bg-green-50 border-green-200'};return `<div class="${colors[i.level]} border-2 rounded-2xl p-5 flex items-start gap-4"><div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0"><i data-lucide="${i.icon||'info'}" class="w-6 h-6"></i></div><div class="flex-1 min-w-0"><h3 class="font-black text-lg">${i.title}</h3><p class="text-sm text-slate-700 mt-1 font-medium">${i.desc}</p></div>${i.action?`<button onclick="router.actOnInsight('${i.action}',${i.propId||'null'})" class="bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-xs flex-shrink-0">조치 →</button>`:''}</div>`}).join('')}</div>
    <div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-6 rounded-2xl mt-6"><h3 class="font-black text-lg mb-3">💡 AI 운영 팁</h3><div class="grid grid-cols-2 gap-3 text-sm mobile-stack"><div class="bg-white/10 p-3 rounded-xl"><p class="font-black mb-1">📈 평균 가동률</p><p class="text-2xl font-black">${store.properties.length?Math.round(store.properties.filter(p=>getBookingForDate(p.id,todayStr())).length/store.properties.length*100):0}%</p></div><div class="bg-white/10 p-3 rounded-xl"><p class="font-black mb-1">💰 평균 객단가</p><p class="text-2xl font-black">${fmt(store.bookings.length?Math.round(store.bookings.reduce((s,b)=>s+(+b.price||0),0)/store.bookings.length):0)}</p></div></div></div>`;
    lucide.createIcons();
  }
  
  actOnInsight(action, propId) {
    const map = {pricing:'smartPricing', cost:'expenses', marketing:'sales', payment:'bookings', schedule:'staff', stats:'stats', props:'props', chats:'chats', customers:'customers'};
    if (map[action]) { 
      this.adminTab = map[action]; 
      this.renderAdminNav(); 
      this.renderAdminTab(); 
      if (propId && action === 'pricing') {
        setTimeout(() => {
          const el = document.querySelector(`[data-prop="${propId}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }

  // ===== 💎 AI 스마트 가격 (작동 보강) =====
  admSmartPricing(c) {
    if (!store.properties.length) {
      c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black">💎 AI 스마트 가격 추천</h2></div>` + UI.Empty('home','매물이 없습니다','매물 등록 후 사용 가능');
      return;
    }
    c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black">💎 AI 스마트 가격 추천</h2><p class="text-slate-500 mt-1">실거래 데이터 분석으로 최적 가격 자동 제안</p></div>
    <div class="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white p-6 rounded-2xl mb-6"><h3 class="font-black text-lg mb-3">🤖 AI 분석 알고리즘</h3><div class="grid grid-cols-3 gap-3 text-sm mobile-stack"><div class="bg-white/10 p-3 rounded-xl"><p class="font-black">📊 최근 거래</p><p class="text-xs opacity-80 mt-1">최근 90일 분석</p></div><div class="bg-white/10 p-3 rounded-xl"><p class="font-black">📅 요일별 가격</p><p class="text-xs opacity-80 mt-1">평일/주말 차이</p></div><div class="bg-white/10 p-3 rounded-xl"><p class="font-black">📈 수요 추세</p><p class="text-xs opacity-80 mt-1">상승/하락 감지</p></div></div></div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mobile-stack">${store.properties.map(p=>{
      let sp;
      try { sp = store.getSmartPricing(p.id); } catch(e) { return ''; }
      if (!sp) return '';
      const diff = sp.suggested - sp.currentPrice;
      const pct = sp.currentPrice ? Math.round(diff/sp.currentPrice*100) : 0;
      const trendCol = {up:'text-green-600 bg-green-50',down:'text-red-600 bg-red-50',stable:'text-blue-600 bg-blue-50'}[sp.trend];
      const trendIcon = {up:'trending-up',down:'trending-down',stable:'minus'}[sp.trend];
      return `<div class="bg-white rounded-2xl border-2 p-5" data-prop="${p.id}"><div class="flex items-center justify-between mb-4"><div><h4 class="font-black text-lg">${p.name}</h4><p class="text-xs text-slate-400 font-bold">${p.location||''}</p></div><span class="px-3 py-1 ${trendCol} rounded-full text-xs font-black flex items-center gap-1"><i data-lucide="${trendIcon}" class="w-3 h-3"></i>${sp.trend.toUpperCase()}</span></div>
      <div class="grid grid-cols-2 gap-3 mb-4"><div class="bg-slate-50 p-3 rounded-xl"><p class="text-[10px] font-black text-slate-400 uppercase">현재 가격</p><p class="text-xl font-black text-slate-700">${fmt(sp.currentPrice)}</p></div><div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-3 rounded-xl"><p class="text-[10px] font-black opacity-70 uppercase">AI 추천 가격</p><p class="text-xl font-black">${fmt(sp.suggested)}</p></div></div>
      <div class="space-y-1 text-xs mb-4"><div class="flex justify-between"><span class="text-slate-500 font-bold">예약 수:</span><span class="font-black">${sp.bookingCount||0}건 (최근90일 ${sp.recentCount||0}건)</span></div><div class="flex justify-between"><span class="text-slate-500 font-bold">실거래 평균:</span><span class="font-black">${fmt(sp.avgNightly)}</span></div><div class="flex justify-between"><span class="text-slate-500 font-bold">최근 90일 평균:</span><span class="font-black">${fmt(sp.recentAvg)}</span></div>${sp.weekendBoost>0?`<div class="flex justify-between"><span class="text-slate-500 font-bold">주말 가산:</span><span class="font-black text-amber-600">+${fmt(sp.weekendBoost)}</span></div>`:''}<div class="flex justify-between pt-2 border-t"><span class="text-slate-500 font-bold">신뢰도:</span><span class="font-black text-blue-600">${sp.confidence}%</span></div></div>
      <div class="bg-amber-50 p-3 rounded-xl mb-3"><p class="text-xs font-bold text-amber-700">💡 ${sp.reason}</p></div>
      ${diff!==0&&sp.confidence>=30?`<button onclick="router.applySmartPrice(${p.id},${sp.suggested})" class="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm">${pct>0?'⬆️ 가격 인상':'⬇️ 가격 인하'} 적용 (${pct>0?'+':''}${pct}%)</button>`:'<div class="text-center text-xs text-slate-400 font-bold py-2">현재 가격이 최적입니다 ✓</div>'}</div>`;
    }).join('')}</div>`;
    lucide.createIcons();
  }
  
  async applySmartPrice(propId, newPrice) {
    if (!confirm(`가격을 ${fmt(newPrice)}로 변경?`)) return;
    const p = store.prop(propId);
    showLoading(true);
    try { await store.upsertProp({...p, price: newPrice}); toast('AI 추천 가격 적용','success'); await this.renderAdminTab(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

 

  // ===== 통계/보고서 =====
    // ===== 통계/보고서 (v3.2 강화) =====
  admStats(c) {
    if (!this._statsFilter) {
      const now = new Date();
      this._statsFilter = {
        period: 'month',
        from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`,
        to: todayStr()
      };
    }
    const f = this._statsFilter;
    const showAll = this._statsShowAll || false;
    const periodLabel = { day:'일', week:'주', month:'월', custom:'특정 기간' }[f.period] || '월';
    
    // 통계 대상 매물만 (excludeFromStats=false)
    const propsForStats = store.statsProperties();
    const propIds = new Set(propsForStats.map(p => p.id));
    
    // 기간 필터링
    const filteredBookings = store.bookings.filter(b =>
      b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to && propIds.has(b.propId)
    );
    const filteredExpenses = store.expenses.filter(e =>
      e.date && e.date >= f.from && e.date <= f.to && propIds.has(e.propId)
    );
    
    // 매물별 손익 계산
    const propStats = propsForStats.map(p => {
      const bks = filteredBookings.filter(b => b.propId === p.id);
      const exps = filteredExpenses.filter(e => e.propId === p.id);
      const r = bks.reduce((s,b) => s + (+b.price||0), 0);
      const cAll = exps.reduce((s,e) => s + (+e.amount||0), 0);
      const cInit = exps.filter(e => e.majorCat === '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
      const cv = showAll ? cAll : (cAll - cInit);
      return { p, rev: r, cost: cv, profit: r - cv, bookings: bks.length };
    });
    const totalRev = propStats.reduce((s,r) => s + r.rev, 0);
    const totalCost = propStats.reduce((s,r) => s + r.cost, 0);
    const totalProfit = totalRev - totalCost;
    const costInit = filteredExpenses.filter(e => e.majorCat === '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
    
    c.innerHTML = `<div class="flex justify-between items-center mb-6 flex-wrap gap-3">
      <h2 class="text-3xl font-black">📊 통계 & 보고서</h2>
      <div class="flex gap-2 flex-wrap">
        <button onclick="router.exportStatsExcel()" class="bg-green-600 text-white px-4 py-3 rounded-xl font-black text-sm">📥 엑셀↓</button>
        <label class="bg-blue-600 text-white px-4 py-3 rounded-xl font-black text-sm cursor-pointer">📤 엑셀↑<input type="file" id="statsImportInput" accept=".xlsx,.xls" class="hidden"></label>
        <button onclick="router.genReport()" class="bg-amber-500 text-white px-4 py-3 rounded-xl font-black text-sm">📝 AI 보고서</button>
        <button onclick="router.genReportPDFFromAI()" class="bg-red-500 text-white px-4 py-3 rounded-xl font-black text-sm">📄 PDF 발급</button>
      </div>
    </div>
    
    <div class="bg-white p-4 rounded-2xl border mb-4">
      <p class="text-[10px] font-black text-slate-400 uppercase mb-3">📅 기간 필터 (현재: ${periodLabel})</p>
      <div class="flex gap-2 flex-wrap items-center">
        <select id="statsPeriod" class="p-3 border rounded-xl font-bold text-sm">
          <option value="day" ${f.period==='day'?'selected':''}>일</option>
          <option value="week" ${f.period==='week'?'selected':''}>주</option>
          <option value="month" ${f.period==='month'?'selected':''}>월</option>
          <option value="custom" ${f.period==='custom'?'selected':''}>특정 기간</option>
        </select>
        <input type="date" id="statsFrom" value="${f.from}" class="p-3 border rounded-xl font-bold text-sm">
        <span>~</span>
        <input type="date" id="statsTo" value="${f.to}" class="p-3 border rounded-xl font-bold text-sm">
        <button onclick="router.applyStatsFilter()" class="bg-slate-900 text-white px-5 py-3 rounded-xl font-black text-sm">적용</button>
        <button onclick="router.statsPrevMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
        <button onclick="router.statsNextMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
      </div>
    </div>
    
    <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
      <div>
        <p class="text-sm font-black text-amber-700">💡 통계 기준: <b>${showAll?'초기투자 포함':'초기투자 제외 (운영 통계)'}</b></p>
        <p class="text-xs text-amber-600 font-bold mt-1">기간: <b>${f.from} ~ ${f.to}</b> · 통계대상: <b>${propsForStats.length}개</b></p>
      </div>
      <button onclick="router._statsShowAll=!router._statsShowAll;router.renderAdminTab()" class="bg-amber-500 text-white px-4 py-2 rounded-lg font-black text-xs">${showAll?'🔻 초기투자 제외':'🔺 초기투자 포함'}</button>
    </div>
    
    <div class="grid grid-cols-4 gap-4 mb-6 mobile-stack">
      <div class="bg-white p-5 rounded-2xl border cursor-pointer hover:shadow-xl hover:border-blue-400 transition" onclick="router.adminTab='sales';router.renderAdminNav();router.renderAdminTab()">
        <p class="text-[10px] font-black text-slate-400 uppercase">총매출 →</p>
        <p class="text-2xl font-black text-blue-600 mt-2">${fmt(totalRev)}</p>
      </div>
      <div class="bg-white p-5 rounded-2xl border cursor-pointer hover:shadow-xl hover:border-red-400 transition" onclick="router.adminTab='expenses';router.renderAdminNav();router.renderAdminTab()">
        <p class="text-[10px] font-black text-slate-400 uppercase">${showAll?'총지출':'운영지출'} →</p>
        <p class="text-2xl font-black text-red-500 mt-2">${fmt(totalCost)}</p>
      </div>
      <div class="bg-white p-5 rounded-2xl border">
        <p class="text-[10px] font-black text-slate-400 uppercase">초기투자</p>
        <p class="text-2xl font-black text-amber-600 mt-2">${fmt(costInit)}</p>
      </div>
      <div class="bg-white p-5 rounded-2xl border">
        <p class="text-[10px] font-black text-slate-400 uppercase">${showAll?'순이익':'운영순이익'}</p>
        <p class="text-2xl font-black ${totalProfit>=0?'text-green-600':'text-red-500'} mt-2">${fmt(totalProfit)}</p>
      </div>
    </div>
    
    <div class="bg-white rounded-2xl border overflow-hidden mb-6">
      <div class="p-4 border-b bg-slate-50 flex items-center justify-between flex-wrap gap-2">
        <h3 class="font-black text-sm uppercase">📋 숙소별 손익 시트</h3>
        <p class="text-xs text-slate-400 font-bold">💡 값을 클릭하면 매출/지출/예약 관리로 자동 이동</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase">
            <tr>
              <th class="px-4 py-3 text-left">No.</th>
              <th class="px-4 py-3 text-left">숙소명</th>
              <th class="px-4 py-3 text-center">예약수</th>
              <th class="px-4 py-3 text-right">매출</th>
              <th class="px-4 py-3 text-right">${showAll?'총지출':'운영지출'}</th>
              <th class="px-4 py-3 text-right">순이익</th>
              <th class="px-4 py-3 text-right">수익률</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${propStats.map((r, i) => {
              const margin = r.rev > 0 ? Math.round(r.profit/r.rev*100) : 0;
              return `<tr class="hover:bg-blue-50/30">
                <td class="px-4 py-3 font-black">${i+1}</td>
                <td class="px-4 py-3 font-black">${r.p.name}${r.p.hidden?' <span class="text-[9px] bg-slate-400 text-white px-1.5 py-0.5 rounded">숨김</span>':''}</td>
                <td class="px-4 py-3 text-center font-bold cursor-pointer hover:bg-blue-100 hover:text-blue-700 rounded" onclick="router.gotoPropBookings(${r.p.id})" title="예약 관리로 이동">${r.bookings}건</td>
                <td class="px-4 py-3 text-right font-black text-blue-600 cursor-pointer hover:bg-blue-100 rounded" onclick="router.gotoPropSales(${r.p.id})" title="매출 관리로 이동">${fmt(r.rev)}</td>
                <td class="px-4 py-3 text-right font-black text-red-500 cursor-pointer hover:bg-red-100 rounded" onclick="router.gotoPropExpenses(${r.p.id})" title="지출 관리로 이동">${fmt(r.cost)}</td>
                <td class="px-4 py-3 text-right font-black ${r.profit>=0?'text-green-600':'text-red-500'}">${fmt(r.profit)}</td>
                <td class="px-4 py-3 text-right font-black ${margin>=30?'text-green-600':margin>=0?'text-amber-600':'text-red-500'}">${margin}%</td>
              </tr>`;
            }).join('')}
            <tr class="bg-slate-900 text-white font-black">
              <td class="px-4 py-3"></td>
              <td class="px-4 py-3">📊 합계</td>
              <td class="px-4 py-3 text-center">${propStats.reduce((s,r)=>s+r.bookings,0)}건</td>
              <td class="px-4 py-3 text-right">${fmt(totalRev)}</td>
              <td class="px-4 py-3 text-right">${fmt(totalCost)}</td>
              <td class="px-4 py-3 text-right">${fmt(totalProfit)}</td>
              <td class="px-4 py-3 text-right">${totalRev>0?Math.round(totalProfit/totalRev*100):0}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="grid grid-cols-2 gap-4 mb-6 mobile-stack">
      <div class="bg-white p-6 rounded-2xl border">
        <h3 class="font-black mb-4">숙소별 손익 (매출/지출/순이익)</h3>
        <canvas id="c1" height="200"></canvas>
      </div>
      <div class="bg-white p-6 rounded-2xl border">
        <h3 class="font-black mb-4">지출 카테고리</h3>
        <canvas id="c2" height="200"></canvas>
      </div>
    </div>
    
    <div class="bg-white p-6 rounded-2xl border">
      <h3 class="font-black mb-4">📧 정기 보고서 수신자</h3>
      <div class="flex flex-wrap gap-2 mb-3">${store.reportRecipients.map(r=>`<span class="inline-flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg text-xs font-bold">${store.user(r)?.name||r}<button onclick="router.delRecipient('${r}')" class="text-red-400">×</button></span>`).join('')}</div>
      <select onchange="router.addRecipient(this.value)" class="p-3 border rounded-xl font-bold">
        <option value="">+ 수신자 추가</option>
        ${store.users.filter(u=>!store.reportRecipients.includes(u.id)).map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}
      </select>
    </div>`;
    
    setTimeout(() => {
      const labels = propStats.map(r => r.p.name.slice(0,8));
      const c1 = document.getElementById('c1');
      if (c1 && propStats.length) {
        new Chart(c1, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: '매출', data: propStats.map(r => r.rev), backgroundColor: '#2563eb' },
              { label: showAll?'총지출':'운영지출', data: propStats.map(r => r.cost), backgroundColor: '#ef4444' },
              { label: '순이익', data: propStats.map(r => r.profit), backgroundColor: '#10b981' }
            ]
          },
          options: { scales: { y: { ticks: { callback: v => fmt(v) } } } }
        });
      }
      const cat = {};
      const targetExp = showAll ? filteredExpenses : filteredExpenses.filter(e => e.majorCat !== '초기투자지출');
      targetExp.forEach(e => cat[e.category] = (cat[e.category]||0) + (+e.amount||0));
      const c2 = document.getElementById('c2');
      if (c2 && Object.keys(cat).length) {
        new Chart(c2, {
          type: 'doughnut',
          data: {
            labels: Object.keys(cat),
            datasets: [{ data: Object.values(cat), backgroundColor: ['#2563eb','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#14b8a6'] }]
          }
        });
      }
      
      // 엑셀 업로드
      const importInput = document.getElementById('statsImportInput');
      if (importInput) {
        importInput.onchange = e => this.importStatsExcel(e.target.files[0]);
      }
    }, 100);
    lucide.createIcons();
  }
  // ===== [v3.2] 통계 기간 필터 핸들러 =====
  applyStatsFilter() {
    const period = document.getElementById('statsPeriod').value;
    let from = document.getElementById('statsFrom').value;
    let to = document.getElementById('statsTo').value;
    if (period === 'day') from = to = todayStr();
    else if (period === 'week') {
      const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day;
      from = new Date(d.setDate(diff)).toISOString().split('T')[0];
      to = new Date(d.setDate(diff+6)).toISOString().split('T')[0];
    } else if (period === 'month') {
      const fd = new Date(from || todayStr());
      from = `${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-01`;
      const last = new Date(fd.getFullYear(), fd.getMonth()+1, 0);
      to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    }
    this._statsFilter = { period, from, to };
    this.renderAdminTab();
  }
  
  statsPrevMonth() {
    const f = this._statsFilter;
    const d = new Date(f.from);
    d.setMonth(d.getMonth() - 1);
    f.from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
    f.to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    f.period = 'month';
    this.renderAdminTab();
  }
  
  statsNextMonth() {
    const f = this._statsFilter;
    const d = new Date(f.from);
    d.setMonth(d.getMonth() + 1);
    f.from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
    f.to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    f.period = 'month';
    this.renderAdminTab();
  }
  
  // ===== [v3.2] 시트표 셀 클릭 → 자동 이동 =====
  gotoPropSales(propId) {
    this._salesFilterPropId = propId;
    this.adminTab = 'sales';
    this.renderAdminNav();
    this.renderAdminTab();
  }
  
  gotoPropExpenses(propId) {
    this._expFilter = this._expFilter || {};
    this._expFilterPropId = propId;
    this.adminTab = 'expenses';
    this.renderAdminNav();
    this.renderAdminTab();
  }
  
  gotoPropBookings(propId) {
    this.adminTab = 'bookings';
    this.bkMode = 'list';
    this.renderAdminNav();
    this.renderAdminTab();
    setTimeout(() => {
      const p = store.prop(propId);
      if (p) toast(`📅 ${p.name} 예약 캘린더`, 'info');
    }, 300);
  }
  
  // ===== [v3.2] 통계 Excel 내보내기/불러오기 =====
  exportStatsExcel() {
    const f = this._statsFilter || { from: todayStr(), to: todayStr() };
    const showAll = this._statsShowAll || false;
    const propsForStats = store.statsProperties();
    const propIds = new Set(propsForStats.map(p => p.id));
    const filteredBookings = store.bookings.filter(b => b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to && propIds.has(b.propId));
    const filteredExpenses = store.expenses.filter(e => e.date && e.date >= f.from && e.date <= f.to && propIds.has(e.propId));
    
    // 시트 1: 숙소별 손익
    const profitSheet = propsForStats.map((p, i) => {
      const bks = filteredBookings.filter(b => b.propId === p.id);
      const exps = filteredExpenses.filter(e => e.propId === p.id);
      const rev = bks.reduce((s,b) => s + (+b.price||0), 0);
      const cAll = exps.reduce((s,e) => s + (+e.amount||0), 0);
      const cInit = exps.filter(e => e.majorCat === '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
      const cost = showAll ? cAll : (cAll - cInit);
      return {
        'No.': i+1,
        '숙소명': p.name,
        '그룹': p.group || '-',
        '예약수': bks.length,
        '매출': rev,
        '지출': cost,
        '순이익': rev - cost,
        '수익률(%)': rev > 0 ? Math.round((rev - cost)/rev*100) : 0
      };
    });
    
    // 시트 2: 예약 상세
    const bookingSheet = filteredBookings.map(b => ({
      '체크인': b.checkIn,
      '체크아웃': b.checkOut,
      '숙소': store.prop(b.propId)?.name || '-',
      '예약자': b.guest,
      '연락처': b.contact,
      '플랫폼': b.platform,
      '인원': b.people,
      '가격': b.price,
      '메모': b.memo || ''
    }));
    
    // 시트 3: 지출 상세
    const expenseSheet = filteredExpenses.map(e => ({
      '날짜': e.date,
      '숙소': store.prop(e.propId)?.name || '-',
      '대분류': e.majorCat,
      '소분류': e.category,
      '금액': e.amount,
      '메모': e.memo || ''
    }));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profitSheet), '숙소별손익');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookingSheet), '예약상세');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseSheet), '지출상세');
    XLSX.writeFile(wb, `통계보고서_${f.from}_${f.to}.xlsx`);
    toast('📥 다운로드 완료','success');
  }
  
  async importStatsExcel(file) {
    if (!file) return;
    if (!confirm('엑셀 파일에서 예약/지출 데이터를 추가합니다. 계속?')) return;
    showLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      let added = 0;
      
      // 예약 시트
      if (wb.Sheets['예약상세']) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['예약상세']);
        for (const row of rows) {
          const prop = store.properties.find(p => p.name === row['숙소']);
          if (!prop) continue;
          await store.addBooking({
            propId: prop.id,
            checkIn: row['체크인'],
            checkOut: row['체크아웃'],
            guest: row['예약자'] || '미지정',
            contact: row['연락처'] || '',
            platform: row['플랫폼'] || '직접예약',
            people: +row['인원'] || 2,
            price: +row['가격'] || 0,
            memo: row['메모'] || '',
            nationality: '한국'
          });
          added++;
        }
      }
      
      // 지출 시트
      if (wb.Sheets['지출상세']) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['지출상세']);
        for (const row of rows) {
          const prop = store.properties.find(p => p.name === row['숙소']);
          if (!prop) continue;
          await store.addExpense({
            propId: prop.id,
            date: row['날짜'] || todayStr(),
            majorCat: row['대분류'] || '변동지출',
            category: row['소분류'] || '기타',
            amount: +row['금액'] || 0,
            memo: row['메모'] || ''
          });
          added++;
        }
      }
      
      toast(`✅ ${added}건 추가됨`, 'success');
      await this.renderAdminTab();
    } catch(e) {
      toast('실패: '+e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async addRecipient(uid){if(uid&&!store.reportRecipients.includes(uid)){store.reportRecipients.push(uid);await API.setAll('reportRecipients',store.reportRecipients);await this.renderAdminTab()}}
  async delRecipient(uid){store.reportRecipients=store.reportRecipients.filter(x=>x!==uid);await API.setAll('reportRecipients',store.reportRecipients);await this.renderAdminTab()}
  
 

  // ===== 운영 관리 (AI) =====
  admOps(c) {
    if (!store.properties.length) {
      c.innerHTML = `<h2 class="text-3xl font-black mb-6">📋 운영 관리</h2>` + UI.Empty('clipboard-list','매물이 없습니다');
      return;
    }
    const ops = store.opsData || {};
    const sumSedae = store.properties.reduce((s,p)=>s+(+p.sedaebi||0),0);
    const sumTotalRev = store.properties.reduce((s,p)=>s+(+ops[p.id]?.totalRev||0),0);
    const sumSilip = store.properties.reduce((s,p)=>s+(+ops[p.id]?.silip||0),0);
    const sumFinalCost = store.properties.reduce((s,p)=>s+(+ops[p.id]?.finalCost||0),0);
    const sumFinalProfit = store.properties.reduce((s,p)=>s+(+ops[p.id]?.finalProfit||0),0);
    const sumOpCost = store.properties.reduce((s,p)=>s+(+ops[p.id]?.opCost||0),0);
    const aiRecs = [];
    store.properties.forEach(p => {
      const o = ops[p.id]||{};
      const myBks = store.bookings.filter(b=>b.propId===p.id);
      const myExp = store.expenses.filter(e=>e.propId===p.id&&e.majorCat!=='초기투자지출').reduce((s,e)=>s+(+e.amount||0),0);
      const r = myBks.reduce((s,b)=>s+(+b.price||0),0);
      const profitRate = r?(r-myExp)/r*100:0;
      if (profitRate < 30 && r > 0) aiRecs.push({prop:p,msg:`수익률 ${Math.round(profitRate)}% - 가격 인상 또는 비용 절감 필요`});
      if (myBks.length === 0) aiRecs.push({prop:p,msg:'예약 0건 - 마케팅 강화 필요'});
      if (o.opDays > 100 && (+o.avgMonth||0) < 1000000) aiRecs.push({prop:p,msg:`운영 ${o.opDays}일이지만 평균 매출 부족`});
    });
    c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black">📋 운영 관리 (AI 통합)</h2><p class="text-slate-500 text-sm">AI 추천 + 실시간 운영 데이터</p></div>${aiRecs.length?`<div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-5 rounded-2xl mb-6"><h3 class="font-black mb-3 flex items-center gap-2"><i data-lucide="sparkles" class="w-5 h-5"></i>🤖 AI 운영 추천 (${aiRecs.length}건)</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${aiRecs.slice(0,4).map(r=>`<div class="bg-white/10 rounded-xl p-3"><p class="text-sm font-black">${r.prop.name}</p><p class="text-[11px] opacity-80 mt-1">${r.msg}</p></div>`).join('')}</div></div>`:''}
    <div class="grid grid-cols-6 gap-3 mb-6 mobile-stack"><div class="bg-amber-50 p-4 rounded-xl border border-amber-200"><p class="text-[9px] font-black text-amber-600 uppercase">세대비</p><p class="text-lg font-black text-amber-700 mt-1">${fmtNum(sumSedae)}</p></div><div class="bg-blue-50 p-4 rounded-xl border border-blue-200"><p class="text-[9px] font-black text-blue-600 uppercase">총매출</p><p class="text-lg font-black text-blue-700 mt-1">${fmtNum(sumTotalRev)}</p></div><div class="bg-green-50 p-4 rounded-xl border border-green-200"><p class="text-[9px] font-black text-green-600 uppercase">실입금액</p><p class="text-lg font-black text-green-700 mt-1">${fmtNum(sumSilip)}</p></div><div class="bg-red-50 p-4 rounded-xl border border-red-200"><p class="text-[9px] font-black text-red-600 uppercase">최종비용</p><p class="text-lg font-black text-red-700 mt-1">${fmtNum(sumFinalCost)}</p></div><div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200"><p class="text-[9px] font-black text-emerald-600 uppercase">최종순수익</p><p class="text-lg font-black text-emerald-700 mt-1">${fmtNum(sumFinalProfit)}</p></div><div class="bg-slate-900 p-4 rounded-xl text-white"><p class="text-[9px] font-black uppercase opacity-70">운영비</p><p class="text-lg font-black mt-1">${fmtNum(sumOpCost)}</p></div></div>
    <div class="bg-white rounded-2xl border overflow-auto max-h-[70vh]"><table class="ops-table w-full text-xs"><thead class="sticky top-0 z-10"><tr class="bg-slate-800 text-white">${['No','매니저','매물','세대비','매막매출','관리비','청소비','총매출','실입금액','수리','청소','가스','인터넷','분리수거','시작','마감','최종비용','순수익','운영일','월평균','주단가','월예상','운영비','주소','편집'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${store.properties.map((p,i)=>{const o=ops[p.id]||{};const aiAlert=aiRecs.find(r=>r.prop.id===p.id);return `<tr class="hover:bg-blue-50/30 ${aiAlert?'bg-purple-50':''}"><td class="text-center font-black">${i+1}${aiAlert?' ⚠️':''}</td><td class="text-center">${mgrTag(p.manager)}</td><td class="font-black whitespace-nowrap">${p.name}</td><td class="text-right font-bold text-amber-600">${fmtNum(p.sedaebi||0)}</td><td class="text-right">${fmtNum(o.maemakMae||0)}</td><td class="text-right">${fmtNum(o.gwanli||0)}</td><td class="text-right">${fmtNum(o.cheongso||0)}</td><td class="text-right font-black text-blue-600">${fmtNum(o.totalRev||0)}</td><td class="text-right font-black text-green-600 bg-green-50">${fmtNum(o.silip||0)}</td><td class="text-center text-[10px]">${o.repair||'-'}</td><td class="text-center text-[10px]">${o.entryClean||'-'}</td><td class="text-center text-[10px]">${o.gas||'-'}</td><td class="text-center text-[10px]">${o.netProvider||'-'}</td><td class="text-center text-[10px]">${o.recycle||'-'}</td><td class="text-center font-mono">${o.startOp||'-'}</td><td class="text-center font-mono">${o.endOp||'-'}</td><td class="text-right font-bold text-red-500">${fmtNum(o.finalCost||0)}</td><td class="text-right font-black text-emerald-600">${fmtNum(o.finalProfit||0)}</td><td class="text-center font-bold">${o.opDays||0}</td><td class="text-right font-bold">${fmtNum(o.avgMonth||0)}</td><td class="text-right text-[10px]">${fmtNum(o.weekly||0)}</td><td class="text-right font-bold">${fmtNum(o.monthly||0)}</td><td class="text-right font-bold text-slate-500">${fmtNum(o.opCost||0)}</td><td class="text-[10px]"><a href="${p.guide||'#'}" target="_blank" class="text-blue-600 underline">${(p.address||p.location||'-').slice(0,20)}</a></td><td class="text-center"><button onclick="router.showOpsForm(${p.id})" class="p-1.5 bg-slate-100 rounded-lg hover:bg-blue-500 hover:text-white"><i data-lucide="edit-3" class="w-3 h-3"></i></button></td></tr>`}).join('')}</tbody></table></div>`;
    lucide.createIcons();
  }
  
  showOpsForm(propId) {
    const p = store.prop(propId);
    const o = (store.opsData||{})[propId]||{};
    openModal(`✏️ ${p.name} 운영 데이터`, `<form id="opsF" class="space-y-4"><div class="grid grid-cols-3 gap-3 mobile-stack">${[['sedaebi','세대비',p.sedaebi||0,'number'],['maemakMae','매막매출',o.maemakMae||0,'number'],['gwanli','관리비',o.gwanli||0,'number'],['cheongso','청소비',o.cheongso||0,'number'],['totalRev','총매출',o.totalRev||0,'number'],['silip','실입금액',o.silip||0,'number'],['repair','수리',o.repair||'',''],['entryClean','입주청소',o.entryClean||'',''],['gas','도시가스',o.gas||'','']].map(([k,l,v,t])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input ${t==='number'?'type="number"':''} name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}<div class="col-span-3"><label class="text-[10px] font-black text-slate-400 uppercase">인터넷</label><input name="netProvider" value="${o.netProvider||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>${[['recycle','분리수거',o.recycle||'',''],['startOp','운영시작',o.startOp||'',''],['endOp','운영마감',o.endOp||'',''],['finalCost','최종비용',o.finalCost||0,'number'],['finalProfit','최종순수익',o.finalProfit||0,'number'],['opDays','운영일',o.opDays||0,'number'],['avgMonth','월평균',o.avgMonth||0,'number'],['weekly','주단가',o.weekly||0,'number'],['monthly','월예상',o.monthly||0,'number'],['opCost','운영비',o.opCost||0,'number']].map(([k,l,v,t])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input ${t==='number'?'type="number"':''} name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}</div><button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">저장</button></form>`, 'max-w-4xl');
    document.getElementById('opsF').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      ['sedaebi','maemakMae','gwanli','cheongso','totalRev','silip','finalCost','finalProfit','opDays','avgMonth','weekly','monthly','opCost'].forEach(f=>d[f]=+d[f]);
      p.sedaebi = d.sedaebi; delete d.sedaebi;
      await API.update('properties', p.id, p);
      const opsData = store.opsData || {};
      opsData[propId] = d;
      store.opsData = opsData;
      await API.setAll('opsData', opsData);
      toast('저장됨','success');
      closeModal();
      await this.renderAdminTab();
    };
  }

  // ===== 고객 관리 =====
  admCustomers(c) {
    const map = {};
    store.bookings.forEach(b=>{const k=(b.guest||'')+'|'+(b.contact||'');if(!map[k])map[k]={key:k,guest:b.guest,contact:b.contact,nat:b.nationality,n:0,t:0,plats:new Set(),last:'',bookings:[]};map[k].n++;map[k].t+=(+b.price||0);map[k].plats.add(b.platform);if(b.checkIn>map[k].last)map[k].last=b.checkIn;map[k].bookings.push(b)});
    const list = Object.values(map).sort((a,b)=>(b.last||'').localeCompare(a.last||''));
    const platStats = {};
    store.platforms.forEach(p=>platStats[p.name]={count:0,revenue:0,color:p.color});
    store.bookings.forEach(b=>{if(platStats[b.platform]){platStats[b.platform].count++;platStats[b.platform].revenue+=(+b.price||0)}});
    const totalRev = Object.values(platStats).reduce((s,p)=>s+p.revenue,0);
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><div><h2 class="text-3xl font-black">👥 고객 관리</h2><p class="text-slate-500 mt-1">최근순 정렬 · 클릭하여 메모 작성</p></div><button onclick="router.showPlatformMgr()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">🎯 플랫폼 관리</button></div>
    <div class="grid grid-cols-4 gap-4 mb-6 mobile-stack"><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">고객수</p><p class="text-2xl font-black mt-2">${list.length}명</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">재방문</p><p class="text-2xl font-black text-blue-600 mt-2">${list.filter(x=>x.n>1).length}명</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">평균객단가</p><p class="text-2xl font-black mt-2">${fmt(list.length?Math.round(list.reduce((s,x)=>s+x.t,0)/list.length):0)}</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">외국인</p><p class="text-2xl font-black mt-2">${list.filter(x=>x.nat&&x.nat!=='한국').length}명</p></div></div>
    <div class="bg-white rounded-2xl border overflow-hidden mb-6"><div class="p-4 border-b bg-slate-50"><h3 class="font-black text-sm uppercase">📋 고객 리스트 (최신순)</h3></div><div class="overflow-x-auto"><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr>${['No.','예약자','연락처','국적','횟수','총매출','평균','플랫폼','최근','메모'].map(h=>`<th class="px-4 py-3 text-left">${h}</th>`).join('')}</tr></thead><tbody class="text-sm divide-y">${list.map((cu,i)=>{const memo=store.customerMemos[cu.key]?.memo||'';return `<tr class="hover:bg-blue-50/30 cursor-pointer" onclick="router.showCustomerDetail('${cu.key}')"><td class="px-4 py-3 font-black">${i+1}</td><td class="px-4 py-3 font-black">${cu.guest}</td><td class="px-4 py-3 font-mono text-xs">${cu.contact}</td><td class="px-4 py-3"><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black">${cu.nat||'-'}</span></td><td class="px-4 py-3 text-center font-black ${cu.n>1?'text-blue-600':''}">${cu.n}회 ${cu.n>1?'⭐':''}</td><td class="px-4 py-3 font-black text-blue-600">${fmt(cu.t)}</td><td class="px-4 py-3 font-bold">${fmt(Math.round(cu.t/cu.n))}</td><td class="px-4 py-3 text-xs font-bold">${[...cu.plats].join(', ')}</td><td class="px-4 py-3 text-xs font-bold text-slate-500">${cu.last}</td><td class="px-4 py-3 text-xs ${memo?'text-amber-600 font-bold':'text-slate-300'}">${memo?'📝 '+memo.slice(0,15)+(memo.length>15?'...':''):'-'}</td></tr>`}).join('')}</tbody></table></div></div>
    <div class="bg-white rounded-2xl border p-6"><h3 class="font-black text-lg mb-4">🎯 플랫폼별 매출 통계</h3><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 mobile-stack">${Object.entries(platStats).map(([name,s])=>{const pct=totalRev?Math.round(s.revenue/totalRev*100):0;return `<div class="bg-slate-50 p-4 rounded-2xl border-l-4" style="border-color:${s.color}"><div class="flex justify-between items-start mb-2"><span class="font-black text-sm" style="color:${s.color}">${name}</span><span class="text-[10px] font-black bg-white px-2 py-0.5 rounded-full">${pct}%</span></div><p class="text-2xl font-black mt-1">${fmt(s.revenue)}</p><p class="text-xs text-slate-500 font-bold mt-1">${s.count}건 · ${fmt(s.count?Math.round(s.revenue/s.count):0)}</p><div class="w-full bg-slate-200 rounded-full h-2 mt-3"><div class="h-2 rounded-full" style="width:${pct}%;background:${s.color}"></div></div></div>`}).join('')}</div><canvas id="platChart" height="80"></canvas></div>`;
    setTimeout(()=>{
      const labels = Object.keys(platStats);
      const data = labels.map(l=>platStats[l].revenue);
      const colors = labels.map(l=>platStats[l].color);
      const el = document.getElementById('platChart');
      if(el && labels.length) new Chart(el,{type:'bar',data:{labels,datasets:[{data,backgroundColor:colors}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
    },100);
    lucide.createIcons();
  }

  showCustomerDetail(key) {
    const map = {};
    store.bookings.forEach(b=>{const k=(b.guest||'')+'|'+(b.contact||'');if(!map[k])map[k]={key:k,guest:b.guest,contact:b.contact,nat:b.nationality,n:0,t:0,plats:new Set(),bookings:[]};map[k].n++;map[k].t+=(+b.price||0);map[k].plats.add(b.platform);map[k].bookings.push(b)});
    const cu = map[key];
    if (!cu) return;
    const cmemo = store.customerMemos[key] || { name:cu.guest, contact:cu.contact, nat:cu.nat, memo:'' };
    openModal(`👤 ${cu.guest}님 정보`, `<form id="custForm" class="space-y-4"><div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl"><p class="text-3xl font-black">${cu.guest}</p><div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/20"><div><p class="text-[10px] opacity-70 uppercase">예약</p><p class="text-2xl font-black">${cu.n}회</p></div><div><p class="text-[10px] opacity-70 uppercase">총매출</p><p class="text-xl font-black">${fmt(cu.t)}</p></div><div><p class="text-[10px] opacity-70 uppercase">평균</p><p class="text-xl font-black">${fmt(Math.round(cu.t/cu.n))}</p></div></div></div><div class="grid grid-cols-2 gap-3"><input name="name" value="${cmemo.name||cu.guest}" placeholder="이름" class="p-3 border rounded-xl font-bold"><input name="contact" value="${cmemo.contact||cu.contact}" placeholder="연락처" class="p-3 border rounded-xl font-bold"></div><input name="nat" value="${cmemo.nat||cu.nat||''}" placeholder="국적" class="w-full p-3 border rounded-xl font-bold"><textarea name="memo" placeholder="📝 고객 메모 (VIP/알러지/선호 등)" class="w-full p-3 border-2 border-amber-200 rounded-xl font-bold h-32 bg-amber-50">${cmemo.memo||''}</textarea><div class="bg-slate-50 p-4 rounded-xl"><p class="text-[10px] font-black text-slate-500 uppercase mb-3">📅 예약 이력 (${cu.bookings.length}건)</p><div class="space-y-2 max-h-40 overflow-y-auto scrollbar">${cu.bookings.sort((a,b)=>(b.checkIn||'').localeCompare(a.checkIn||'')).map(b=>{const p=store.prop(b.propId);const pl=store.platforms.find(x=>x.name===b.platform);return `<div class="bg-white p-2 rounded-lg flex justify-between text-xs"><div><b>${p?.name||'-'}</b> · <span style="color:${pl?.color||'#666'}">${b.platform}</span></div><div><span class="text-slate-500">${b.checkIn}~${b.checkOut}</span> <b class="text-blue-600">${fmt(b.price)}</b></div></div>`}).join('')}</div></div><button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">💾 저장</button></form>`, 'max-w-3xl');
    document.getElementById('custForm').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      await store.saveCustomerMemo(key, d);
      toast('저장됨','success'); closeModal(); await this.renderAdminTab();
    };
  }
  
  showPlatformMgr() {
    openModal('🎯 플랫폼 관리', `<div class="space-y-2 mb-4">${store.platforms.map((p,i)=>`<div class="flex items-center gap-2 bg-slate-50 p-3 rounded-xl"><span class="w-8 h-8 rounded-lg" style="background:${p.color}"></span><input value="${p.name}" data-pn="${i}" class="flex-1 p-2 border rounded-lg font-bold"><input type="color" value="${p.color}" data-pc="${i}" class="w-12 h-10 border rounded-lg cursor-pointer"><button onclick="router.savePlatform(${i})" class="text-blue-500"><i data-lucide="check" class="w-4 h-4"></i></button><button onclick="router.delPlatform(${i})" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`).join('')}</div><form id="platForm" class="bg-blue-50 p-4 rounded-xl"><p class="text-xs font-black text-blue-600 uppercase mb-3">+ 신규 플랫폼</p><div class="flex gap-2"><input name="name" placeholder="플랫폼명" class="flex-1 p-3 border rounded-xl font-bold" required><input type="color" name="color" value="#2563eb" class="w-16 h-12 border rounded-xl cursor-pointer"><button class="bg-blue-600 text-white px-5 rounded-xl font-black">추가</button></div></form>`);
    document.getElementById('platForm').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (store.platforms.find(p=>p.name===d.name)) { toast('이미 존재','error'); return; }
      store.platforms.push({ name:d.name, color:d.color });
      await API.setAll('platforms', store.platforms);
      this.showPlatformMgr();
      await this.renderAdminTab();
      toast('추가됨','success');
    };
    lucide.createIcons();
  }
  async savePlatform(i) {
    const name = document.querySelector(`[data-pn="${i}"]`).value.trim();
    const color = document.querySelector(`[data-pc="${i}"]`).value;
    if (!name) return;
    store.platforms[i] = { name, color };
    await API.setAll('platforms', store.platforms);
    toast('수정됨','success');
    await this.renderAdminTab();
  }
  async delPlatform(i) {
    if (!confirm('삭제?')) return;
    store.platforms.splice(i,1);
    await API.setAll('platforms', store.platforms);
    this.showPlatformMgr();
    await this.renderAdminTab();
  }
  // ===== 직원 관리 =====
    admStaff(c) {
    const cur = this._staffDate || new Date();
    this._staffDate = cur;
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const allSched = (store.schedule || []).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const monthSched = allSched.filter(s => (s.date || '').startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
    const staffMode = this.staffMode || 'cal';
    const nonAdminUsers = (store.users || []).filter(u => u.role !== 'Admin');
    
    c.innerHTML = `
      <div class="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h2 class="text-3xl font-black">👷 직원 관리</h2>
          <p class="text-slate-500 mt-1">${year}년 ${month + 1}월 · ${monthSched.length}건 스케줄</p>
        </div>
        <div class="flex gap-2 items-center flex-wrap">
          <button onclick="router._staffDate.setMonth(router._staffDate.getMonth()-1);router.renderAdminTab()" class="bg-slate-100 px-3 py-3 rounded-xl">
            <i data-lucide="chevron-left" class="w-4 h-4"></i>
          </button>
          <span class="font-black text-sm px-2">${year}.${month + 1}</span>
          <button onclick="router._staffDate.setMonth(router._staffDate.getMonth()+1);router.renderAdminTab()" class="bg-slate-100 px-3 py-3 rounded-xl">
            <i data-lucide="chevron-right" class="w-4 h-4"></i>
          </button>
          <button onclick="router._staffDate=new Date();router.renderAdminTab()" class="bg-blue-600 text-white px-4 py-3 rounded-xl font-black text-sm">오늘</button>
          <div class="bg-slate-100 rounded-xl p-1 flex">
            <button onclick="router.staffMode='cal';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${staffMode !== 'list' ? 'bg-white shadow' : 'text-slate-500'}">캘린더</button>
            <button onclick="router.staffMode='list';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${staffMode === 'list' ? 'bg-white shadow' : 'text-slate-500'}">리스트</button>
          </div>
          <button onclick="router.showScheduleForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 스케줄</button>
        </div>
      </div>
    `;
    
    if (staffMode === 'list') {
      c.innerHTML += `
        <div class="bg-white rounded-2xl border overflow-hidden mb-6">
          <div class="p-4 border-b bg-slate-50">
            <h3 class="font-black text-sm uppercase">👥 직원 리스트 (${nonAdminUsers.length}명)</h3>
          </div>
          ${nonAdminUsers.length === 0 ? UI.Empty('users','직원이 없습니다','이용자/권한 메뉴에서 직원을 추가하세요') : `
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase">
                  <tr>
                    <th class="px-4 py-3 text-left">No.</th>
                    <th class="px-4 py-3 text-left">태그</th>
                    <th class="px-4 py-3 text-left">이름</th>
                    <th class="px-4 py-3 text-left">역할</th>
                    <th class="px-4 py-3 text-left">연락처</th>
                    <th class="px-4 py-3 text-left">이메일</th>
                    <th class="px-4 py-3 text-left">담당 매물</th>
                    <th class="px-4 py-3 text-left">비고</th>
                  </tr>
                </thead>
                <tbody class="text-sm divide-y">
                  ${nonAdminUsers.map((u, i) => `
                    <tr class="hover:bg-blue-50/30">
                      <td class="px-4 py-3 font-black">${i + 1}</td>
                      <td class="px-4 py-3">${mgrTag(u.id)}</td>
                      <td class="px-4 py-3 font-black">${u.name}</td>
                      <td class="px-4 py-3 text-xs font-black">${u.role}</td>
                      <td class="px-4 py-3 text-xs font-mono">${u.contact || '-'}</td>
                      <td class="px-4 py-3 text-xs">${u.email || '-'}</td>
                      <td class="px-4 py-3 text-xs font-bold text-blue-600">${(u.permissions || []).length}개</td>
                      <td class="px-4 py-3 text-xs text-slate-500">${u.memo || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
        
        <div class="bg-white rounded-2xl border overflow-hidden">
          <div class="p-4 border-b bg-slate-50">
            <h3 class="font-black text-sm uppercase">📋 ${year}년 ${month + 1}월 스케줄 (${monthSched.length}건)</h3>
          </div>
          ${monthSched.length === 0 ? UI.Empty('calendar-x','이번 달 스케줄이 없습니다','+ 스케줄 버튼으로 등록하세요') : `
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase">
                  <tr>
                    <th class="px-4 py-3 text-left">일시</th>
                    <th class="px-4 py-3 text-left">담당자</th>
                    <th class="px-4 py-3 text-left">숙소</th>
                    <th class="px-4 py-3 text-left">업무</th>
                    <th class="px-4 py-3 text-left">알람</th>
                    <th class="px-4 py-3 text-left">메모</th>
                    <th class="px-4 py-3 text-center">관리</th>
                  </tr>
                </thead>
                <tbody class="text-sm divide-y">
                  ${monthSched.map(s => `
                    <tr class="hover:bg-blue-50/30">
                      <td class="px-4 py-3 font-black">${s.date} ${s.time}</td>
                      <td class="px-4 py-3">${s.staff}</td>
                      <td class="px-4 py-3 text-xs">${store.prop(s.propId)?.name || '-'}</td>
                      <td class="px-4 py-3">${s.task}</td>
                      <td class="px-4 py-3 text-xs">${(s.alarm || []).map(a => a + '분').join(', ') || '없음'}</td>
                      <td class="px-4 py-3 text-xs text-slate-500">${s.memo || '-'}</td>
                      <td class="px-4 py-3 text-center">
                        <button onclick="router.delScheduleAdm(${s.id})" class="text-red-500 hover:bg-red-50 rounded p-1">
                          <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } else {
      // 캘린더 모드
      const first = new Date(year, month, 1);
      const startDow = first.getDay();
      const days = new Date(year, month + 1, 0).getDate();
      let html = `
        <div class="bg-white p-6 rounded-2xl border">
          <h3 class="text-xl font-black mb-4">${year}년 ${month + 1}월 직원 스케줄 캘린더</h3>
          <div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase mb-2">
            ${['일', '월', '화', '수', '목', '금', '토'].map(d => `<div class="text-center py-2">${d}</div>`).join('')}
          </div>
          <div class="grid grid-cols-7 gap-1">
      `;
      for (let i = 0; i < startDow; i++) {
        html += `<div class="min-h-[110px] bg-slate-50/50 rounded-lg"></div>`;
      }
      for (let d = 1; d <= days; d++) {
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const sch = monthSched.filter(s => s.date === ds);
        html += `
          <div class="min-h-[110px] border rounded-lg p-1.5 ${ds === todayStr() ? 'ring-2 ring-blue-500' : ''}">
            <div class="text-xs font-black">${d}</div>
            ${sch.slice(0, 3).map(s => `
              <div class="text-[9px] font-bold truncate px-1 py-0.5 rounded mt-0.5 bg-purple-100 text-purple-700">
                ${s.time} ${(s.staff || '').slice(0, 3)}
              </div>
            `).join('')}
            ${sch.length > 3 ? `<div class="text-[8px] text-slate-400 mt-0.5">+${sch.length - 3}건</div>` : ''}
          </div>
        `;
      }
      html += `</div></div>`;
      c.innerHTML += html;
    }
    
    lucide.createIcons();
  }

  showScheduleForm() {
    if (!store.users || !store.users.filter(u => u.role !== 'Admin').length) {
      toast('등록된 직원이 없습니다. 이용자/권한 메뉴에서 직원을 먼저 추가하세요.', 'error');
      return;
    }
    if (!store.properties || !store.properties.length) {
      toast('등록된 매물이 없습니다.', 'error');
      return;
    }
    
    openModal('📅 스케줄 등록', `
      <form id="sf" class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <input type="date" name="date" value="${todayStr()}" class="p-3 border rounded-xl font-bold" required>
          <input type="time" name="time" value="10:00" class="p-3 border rounded-xl font-bold" required>
        </div>
        <select name="staff" class="w-full p-3 border rounded-xl font-bold" required>
          <option value="">담당자 선택</option>
          ${store.users.filter(u => u.role !== 'Admin').map(u => `<option>${u.name}</option>`).join('')}
        </select>
        <select name="propId" class="w-full p-3 border rounded-xl font-bold" required>
          <option value="">숙소 선택</option>
          ${store.properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
        <input name="task" placeholder="업무 내용 (예: 퇴실 청소)" class="w-full p-3 border rounded-xl font-bold" required>
        <div class="bg-slate-50 p-4 rounded-xl">
          <p class="text-xs font-black text-slate-500 uppercase mb-2">🔔 알람 (복수 선택)</p>
          <div class="flex gap-2 flex-wrap">
            ${[5, 15, 30, 60].map(m => `
              <label class="flex items-center gap-1 px-3 py-2 bg-white rounded-lg cursor-pointer font-bold text-xs">
                <input type="checkbox" name="a${m}"> ${m}분 전
              </label>
            `).join('')}
          </div>
        </div>
        <input name="memo" placeholder="메모 (선택)" class="w-full p-3 border rounded-xl font-bold">
        <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">등록 + 담당자 알림 발송</button>
      </form>
    `, 'max-w-xl');
    
    document.getElementById('sf').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = {};
      fd.forEach((v, k) => { d[k] = v; });
      const alarm = [];
      [5, 15, 30, 60].forEach(m => {
        if (d['a' + m]) alarm.push(m);
        delete d['a' + m];
      });
      d.alarm = alarm;
      
      showLoading(true);
      try {
        await store.addSchedule(d);
        toast('등록 + 담당자 알림 발송 완료', 'success');
        closeModal();
        await this.renderAdminTab();
      } catch(err) {
        toast('실패: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
    lucide.createIcons();
  }

  async delScheduleAdm(id) {
    if (!confirm('이 스케줄을 삭제하시겠습니까?')) return;
    showLoading(true);
    try {
      await store.delSchedule(id);
      toast('삭제됨', 'success');
      await this.renderAdminTab();
    } catch(e) {
      toast('실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
  
  showScheduleForm() {
    openModal('📅 스케줄 등록', `<form id="sf" class="space-y-4"><div class="grid grid-cols-2 gap-3"><input type="date" name="date" value="${todayStr()}" class="p-3 border rounded-xl font-bold" required><input type="time" name="time" value="10:00" class="p-3 border rounded-xl font-bold" required></div><select name="staff" class="w-full p-3 border rounded-xl font-bold" required>${store.users.filter(u=>u.role!=='Admin').map(u=>`<option>${u.name}</option>`).join('')}</select><select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select><input name="task" placeholder="업무 (예: 퇴실청소)" class="w-full p-3 border rounded-xl font-bold" required><div class="bg-slate-50 p-4 rounded-xl"><p class="text-xs font-black text-slate-500 uppercase mb-2">🔔 알람</p><div class="flex gap-2">${[5,15,30,60].map(m=>`<label class="flex items-center gap-1 px-3 py-2 bg-white rounded-lg cursor-pointer font-bold text-xs"><input type="checkbox" name="a${m}"> ${m}분</label>`).join('')}</div></div><input name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold"><button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">등록 & 알림 발송</button></form>`, 'max-w-xl');
    document.getElementById('sf').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = {}; fd.forEach((v,k)=>{ d[k]=v; });
      const alarm = []; [5,15,30,60].forEach(m => { if (d['a'+m]) alarm.push(m); delete d['a'+m]; });
      d.alarm = alarm;
      showLoading(true);
      try { await store.addSchedule(d); toast('등록 + 알림','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }
  async delScheduleAdm(id) { if (!confirm('삭제?')) return; await store.delSchedule(id); await this.renderAdminTab(); }

  // ===== 기타 관리 =====
  admEtc(c) {
    c.innerHTML = `<h2 class="text-3xl font-black mb-2">📦 기타 관리</h2><p class="text-slate-500 mb-6 font-medium">인터넷 + 물품 추천 (매물 다중 연결)</p>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 mobile-stack">
      <div class="bg-white p-6 rounded-2xl border"><div class="flex justify-between items-center mb-4"><h3 class="font-black flex items-center gap-2"><i data-lucide="wifi" class="w-5 h-5 text-blue-600"></i>인터넷</h3><button onclick="router.showInternetForm()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black">+ 추가</button></div><div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-xs font-bold text-blue-700">🔗 월비용 자동 연동</div><div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50 font-black text-slate-400 uppercase"><tr>${['숙소','통신사','요금제','월비용 🔗','설치일','약정','WiFi','관리'].map(h=>`<th class="px-2 py-2 text-left">${h}</th>`).join('')}</tr></thead><tbody class="divide-y">${store.internet.map(n=>`<tr><td class="px-2 py-2 font-black">${store.prop(n.propId)?.name||'-'}</td><td class="px-2 py-2 font-bold">${n.provider}</td><td class="px-2 py-2">${n.plan}</td><td class="px-2 py-2 text-right font-black text-red-500">${fmt(n.monthly)}</td><td class="px-2 py-2 text-[10px]">${n.installDate}</td><td class="px-2 py-2 text-[10px]">${n.contract}</td><td class="px-2 py-2 font-mono text-[10px]">${n.wifiId||''}<br/>${n.wifiPw||''}</td><td class="px-2 py-2 text-center"><button onclick="router.showInternetForm(${n.id})" class="p-1.5 bg-slate-100 rounded-lg mr-1"><i data-lucide="edit-3" class="w-3 h-3"></i></button><button onclick="router.delInternet(${n.id})" class="p-1.5 bg-red-50 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-3 h-3"></i></button></td></tr>`).join('')}</tbody><tfoot class="bg-slate-900 text-white font-black"><tr><td colspan="3" class="px-2 py-2 text-right">합계</td><td class="px-2 py-2 text-right">${fmt(store.internet.reduce((s,n)=>s+(+n.monthly||0),0))}</td><td colspan="4"></td></tr></tfoot></table></div></div>
      <div class="bg-white p-6 rounded-2xl border"><div class="flex justify-between items-center mb-4"><h3 class="font-black flex items-center gap-2"><i data-lucide="shopping-bag" class="w-5 h-5 text-green-600"></i>물품 추천 (매물 다중 연결)</h3><button onclick="router.showProductForm()" class="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-black">+ 추가</button></div><div class="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 text-xs font-bold text-green-700">💡 적합한 매물에 다중 연결 가능</div><div class="space-y-2 max-h-[500px] overflow-y-auto scrollbar">${store.products.length?store.products.map(p=>{const linked=(p.propIds||[]).map(id=>store.prop(id)).filter(Boolean);return `<div class="p-3 bg-slate-50 rounded-xl flex items-center gap-3 hover:shadow-md transition"><img src="${p.image||'https://via.placeholder.com/60'}" onerror="this.src='https://via.placeholder.com/60'" class="w-14 h-14 rounded-lg object-cover border"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-black text-[10px]">${p.category}</span>${p.vendor?`<span class="text-[10px] text-slate-400 font-bold">${p.vendor}</span>`:''}</div><p class="font-black text-sm truncate">${p.name}</p><div class="flex flex-wrap gap-1 mt-1">${linked.length?linked.map(lp=>`<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black">${lp.name}</span>`).join(''):'<span class="text-[10px] text-slate-400">매물 미연결</span>'}</div><p class="text-[10px] text-slate-400 truncate mt-1">${p.memo||'-'}</p></div><div class="text-right"><p class="font-black text-red-500 text-sm">${fmt(p.price)}</p><div class="flex gap-1 mt-1">${p.url?`<a href="${p.url}" target="_blank" class="p-1.5 bg-white rounded-lg text-blue-600"><i data-lucide="external-link" class="w-3 h-3"></i></a>`:''}<button onclick="router.showProductForm(${p.id})" class="p-1.5 bg-white rounded-lg"><i data-lucide="edit-3" class="w-3 h-3"></i></button><button onclick="router.delProduct(${p.id})" class="p-1.5 bg-white rounded-lg text-red-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div></div>`}).join(''):UI.Empty('shopping-bag','등록된 물품 없음')}</div></div>
    </div>`;
    lucide.createIcons();
  }
  
  showInternetForm(nid=null) {
    const n = nid?store.internet.find(x=>x.id===parseInt(nid)):{id:'',propId:store.properties[0]?.id,provider:'KT',plan:'기가 인터넷',monthly:33000,installDate:todayStr(),contract:'3년',wifiId:'',wifiPw:''};
    openModal(nid?'✏️ 인터넷 수정':'🆕 인터넷 등록', `<form id="nf" class="space-y-4"><div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-bold text-blue-700">🔗 월비용 수정 시 지출 자동 연동</div><select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}" ${n.propId===p.id?'selected':''}>${p.name}</option>`).join('')}</select><div class="grid grid-cols-2 gap-3"><input name="provider" value="${n.provider}" placeholder="통신사" class="p-3 border rounded-xl font-bold" required><input name="plan" value="${n.plan}" placeholder="요금제" class="p-3 border rounded-xl font-bold" required></div><div><label class="text-[10px] font-black text-red-500 uppercase">월 비용</label><input type="number" name="monthly" value="${n.monthly}" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl mt-1" required></div><div class="grid grid-cols-2 gap-3"><input type="date" name="installDate" value="${n.installDate}" class="p-3 border rounded-xl font-bold"><input name="contract" value="${n.contract}" placeholder="약정" class="p-3 border rounded-xl font-bold"></div><div class="grid grid-cols-2 gap-3"><input name="wifiId" value="${n.wifiId||''}" placeholder="WiFi SSID" class="p-3 border rounded-xl font-mono"><input name="wifiPw" value="${n.wifiPw||''}" placeholder="WiFi 비밀번호" class="p-3 border rounded-xl font-mono"></div><button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">${nid?'수정':'등록'}</button></form>`, 'max-w-2xl');
    document.getElementById('nf').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = {}; fd.forEach((v,k)=>{ d[k]=v; });
      if (nid) d.id = parseInt(nid);
      showLoading(true);
      try { await store.upsertInternet(d); toast('완료','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }
  async delInternet(id) { if (!confirm('삭제?')) return; showLoading(true); try { await store.delInternet(id); toast('삭제','success'); await this.renderAdminTab(); } catch(e) { toast('실패','error'); } finally { showLoading(false); } }

  showProductForm(pid=null) {
    const p = pid?store.products.find(x=>x.id===parseInt(pid)):{id:'',category:'침구',name:'',price:10000,url:'',image:'',memo:'',vendor:'쿠팡',propIds:[]};
    if (!p.propIds) p.propIds = [];
    const cats = ['침구','욕실','주방','가전','소모품','청소용품','편의용품','인테리어','기타'];
    openModal(pid?'✏️ 물품 수정':'🆕 물품 등록', `<form id="prf" class="space-y-4"><div class="grid grid-cols-2 gap-3"><select name="category" class="p-3 border rounded-xl font-bold" required>${cats.map(c=>`<option ${p.category===c?'selected':''}>${c}</option>`).join('')}</select><input name="vendor" value="${p.vendor||''}" placeholder="판매처" class="p-3 border rounded-xl font-bold"></div><input name="name" value="${p.name}" placeholder="상품명" class="w-full p-3 border rounded-xl font-bold" required><div><label class="text-[10px] font-black text-red-500 uppercase">가격</label><input type="number" name="price" value="${p.price}" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl mt-1" required></div><input name="image" value="${p.image||''}" placeholder="이미지 URL" class="w-full p-3 border rounded-xl font-bold"><input name="url" value="${p.url||''}" placeholder="구매 링크" class="w-full p-3 border rounded-xl font-bold"><textarea name="memo" placeholder="메모" class="w-full p-3 border rounded-xl h-20 font-bold">${p.memo||''}</textarea>
    <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4"><p class="text-xs font-black text-amber-700 uppercase mb-3">🏠 적합한 매물 (다중 선택)</p><div class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto scrollbar">${store.properties.map(prop=>`<label class="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-amber-100"><input type="checkbox" name="prop_${prop.id}" ${p.propIds.includes(prop.id)?'checked':''}><span class="text-xs font-bold">${prop.name}</span></label>`).join('')}</div></div>
    <button class="w-full bg-green-600 text-white py-4 rounded-xl font-black uppercase">${pid?'수정':'등록'}</button></form>`, 'max-w-2xl');
    document.getElementById('prf').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = {}; fd.forEach((v,k)=>{ d[k]=v; });
      const propIds = [];
      store.properties.forEach(prop => { if (d['prop_'+prop.id]) propIds.push(prop.id); delete d['prop_'+prop.id]; });
      d.propIds = propIds;
      if (pid) d.id = pid;
      showLoading(true);
      try { await store.upsertProduct(d); toast('완료','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }
  async delProduct(id) { if (!confirm('삭제?')) return; await store.delProduct(id); await this.renderAdminTab(); }

  // ===== 📈 고급 분석 (히트맵/LTV/ROI/연도비교) =====
    // ===== 고급 분석 (v3.2 강화: 기간/대상 필터 + Excel) =====
  admAnalytics(c) {
    if (!this._anaFilter) {
      const now = new Date();
      this._anaFilter = {
        period: 'month',
        from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`,
        to: todayStr(),
        scope: 'all',
        groupName: '',
        propIds: []
      };
    }
    const f = this._anaFilter;

    // 통계 대상 매물만
    const allProps = store.statsProperties();
    let targetProps = allProps;
    if (f.scope === 'group' && f.groupName) {
      targetProps = allProps.filter(p => p.group === f.groupName);
    } else if (f.scope === 'props' && f.propIds.length) {
      targetProps = allProps.filter(p => f.propIds.includes(p.id));
    }
    const targetIds = new Set(targetProps.map(p => p.id));

    // 기간 필터링
    const filteredBookings = store.bookings.filter(b =>
      b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to && targetIds.has(b.propId)
    );
    const filteredExpenses = store.expenses.filter(e =>
      e.date && e.date >= f.from && e.date <= f.to && targetIds.has(e.propId)
    );

    // 요일별 가동률 히트맵
    const dayHeat = [0,0,0,0,0,0,0];
    filteredBookings.forEach(b => {
      try { const d = new Date(b.checkIn); if (!isNaN(d)) dayHeat[d.getDay()]++; } catch {}
    });
    const maxDay = Math.max(...dayHeat) || 1;

    // LTV (전체 기간 사용 - 고객은 누적이 의미있음)
    const ltvMap = {};
    filteredBookings.forEach(b => {
      const k = (b.guest||'') + '|' + (b.contact||'');
      if (!ltvMap[k]) ltvMap[k] = { name: b.guest, total: 0, count: 0 };
      ltvMap[k].total += +b.price || 0;
      ltvMap[k].count++;
    });
    const topLTV = Object.values(ltvMap).sort((a,b) => b.total - a.total).slice(0, 10);

    // ROI (필터 적용)
    const roiList = targetProps.map(p => {
      const rev = filteredBookings.filter(b => b.propId === p.id).reduce((s,b) => s + (+b.price||0), 0);
      const init = filteredExpenses.filter(e => e.propId === p.id && e.majorCat === '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
      const op = filteredExpenses.filter(e => e.propId === p.id && e.majorCat !== '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
      const profit = rev - op;
      const roi = init > 0 ? Math.round(profit / init * 100) : 0;
      const recoveryDays = init > 0 && profit > 0 ? Math.round(init / (profit / 365)) : 0;
      return { p, rev, init, op, profit, roi, recoveryDays };
    }).sort((a,b) => b.roi - a.roi);

    // 연도별 비교
    const yearStats = {};
    filteredBookings.forEach(b => {
      if (!b.checkIn) return;
      const y = b.checkIn.slice(0,4);
      if (!yearStats[y]) yearStats[y] = { rev:0, count:0 };
      yearStats[y].rev += +b.price || 0;
      yearStats[y].count++;
    });

    const periodLabel = { day:'일', week:'주', month:'월', custom:'특정 기간' }[f.period] || '월';
    const scopeLabel = f.scope === 'all' ? '전체' : f.scope === 'group' ? `${f.groupName} 그룹` : `선택 ${f.propIds.length}개`;

    c.innerHTML = `<div class="flex justify-between items-center mb-6 flex-wrap gap-3">
      <div>
        <h2 class="text-3xl font-black">📈 고급 분석</h2>
        <p class="text-slate-500 mt-1">${periodLabel} · ${scopeLabel} · 매물 ${targetProps.length}개</p>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button onclick="router.exportAnalyticsExcel()" class="bg-green-600 text-white px-4 py-3 rounded-xl font-black text-sm">📥 엑셀↓</button>
        <label class="bg-blue-600 text-white px-4 py-3 rounded-xl font-black text-sm cursor-pointer">📤 엑셀↑<input type="file" id="anaImportInput" accept=".xlsx,.xls" class="hidden"></label>
      </div>
    </div>

    <div class="bg-white p-4 rounded-2xl border mb-4">
      <p class="text-[10px] font-black text-slate-400 uppercase mb-3">📅 기간 필터</p>
      <div class="flex gap-2 flex-wrap items-center mb-4">
        <select id="anaPeriod" class="p-3 border rounded-xl font-bold text-sm">
          <option value="day" ${f.period==='day'?'selected':''}>일</option>
          <option value="week" ${f.period==='week'?'selected':''}>주</option>
          <option value="month" ${f.period==='month'?'selected':''}>월</option>
          <option value="custom" ${f.period==='custom'?'selected':''}>특정 기간</option>
        </select>
        <input type="date" id="anaFrom" value="${f.from}" class="p-3 border rounded-xl font-bold text-sm">
        <span>~</span>
        <input type="date" id="anaTo" value="${f.to}" class="p-3 border rounded-xl font-bold text-sm">
        <button onclick="router.applyAnaFilter()" class="bg-slate-900 text-white px-5 py-3 rounded-xl font-black text-sm">적용</button>
        <button onclick="router.anaPrevMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
        <button onclick="router.anaNextMonth()" class="bg-slate-100 px-3 py-3 rounded-xl"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
      </div>

      <p class="text-[10px] font-black text-slate-400 uppercase mb-3">🎯 대상 필터</p>
      <div class="flex gap-2 flex-wrap items-center">
        <select id="anaScope" onchange="router.changeAnaScope(this.value)" class="p-3 border rounded-xl font-bold text-sm">
          <option value="all" ${f.scope==='all'?'selected':''}>🌐 전체</option>
          <option value="group" ${f.scope==='group'?'selected':''}>📁 특정 그룹</option>
          <option value="props" ${f.scope==='props'?'selected':''}>🏠 특정 매물</option>
        </select>
        ${f.scope === 'group' ? `<select id="anaGroup" onchange="router._anaFilter.groupName=this.value;router.renderAdminTab()" class="p-3 border rounded-xl font-bold text-sm">
          <option value="">— 그룹 선택 —</option>
          ${store.groups.map(g => `<option value="${g}" ${f.groupName===g?'selected':''}>${g}</option>`).join('')}
        </select>` : ''}
        ${f.scope === 'props' ? `<button onclick="router.showAnaPropsPicker()" class="bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm">🏠 매물 선택 (${f.propIds.length}개)</button>` : ''}
        <button onclick="router._anaFilter.scope='all';router._anaFilter.propIds=[];router._anaFilter.groupName='';router.renderAdminTab()" class="bg-slate-100 px-4 py-3 rounded-xl font-bold text-sm">🔄 초기화</button>
      </div>
    </div>

    <div class="bg-white p-6 rounded-2xl border mb-6">
      <h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="calendar" class="w-5 h-5"></i>📅 요일별 예약 히트맵</h3>
      <div class="flex gap-2 justify-center flex-wrap">${['일','월','화','수','목','금','토'].map((d,i)=>{const lvl=Math.min(5,Math.round(dayHeat[i]/maxDay*5));return `<div class="flex flex-col items-center"><div class="heatmap-cell heat-${lvl}" title="${dayHeat[i]}건">${dayHeat[i]}</div><span class="text-xs font-bold mt-2">${d}</span></div>`}).join('')}</div>
      <p class="text-xs text-slate-400 text-center mt-4">💡 수요가 많은 요일에 가격을 동적으로 조정하세요</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mobile-stack">
      <div class="bg-white p-6 rounded-2xl border">
        <h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="award" class="w-5 h-5"></i>👑 고객 LTV TOP 10</h3>
        ${topLTV.length?`<table class="w-full text-sm"><thead class="text-[10px] text-slate-400 font-black uppercase"><tr><th class="text-left py-2">순위</th><th class="text-left py-2">이름</th><th class="text-right py-2">총매출</th><th class="text-right py-2">방문</th></tr></thead><tbody class="divide-y">${topLTV.map((c,i)=>`<tr><td class="py-3 font-black">${i+1}${i<3?['🥇','🥈','🥉'][i]:''}</td><td class="py-3 font-bold">${c.name}</td><td class="py-3 text-right font-black text-blue-600">${fmt(c.total)}</td><td class="py-3 text-right">${c.count}회</td></tr>`).join('')}</tbody></table>`:UI.Empty('users','고객 데이터 없음')}
      </div>
      <div class="bg-white p-6 rounded-2xl border">
        <h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="trending-up" class="w-5 h-5"></i>💰 매물별 ROI</h3>
        ${roiList.length?`<div class="space-y-3 max-h-96 overflow-y-auto scrollbar">${roiList.map(r=>{const col=r.roi>=100?'text-green-600':r.roi>=50?'text-blue-600':r.roi>=0?'text-amber-600':'text-red-600';return `<div class="bg-slate-50 p-3 rounded-xl cursor-pointer hover:bg-blue-50" onclick="router.showAnaPropDetail(${r.p.id})">
          <div class="flex justify-between items-center mb-2"><p class="font-black text-sm">${r.p.name}</p><span class="text-2xl font-black ${col}">${r.roi}%</span></div>
          <div class="text-xs space-y-1">
            <div class="flex justify-between"><span class="text-slate-500">매출:</span><span class="font-bold">${fmt(r.rev)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">초기투자:</span><span class="font-bold text-amber-600">${fmt(r.init)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">운영지출:</span><span class="font-bold text-red-500">${fmt(r.op)}</span></div>
            <div class="flex justify-between border-t pt-1"><span class="font-black">순이익:</span><span class="font-black text-green-600">${fmt(r.profit)}</span></div>
            ${r.recoveryDays?`<p class="text-[10px] text-slate-400 mt-1">💡 회수 예상: 약 ${r.recoveryDays}일</p>`:''}
          </div>
        </div>`}).join('')}</div>`:UI.Empty('home','매물 데이터 없음')}
      </div>
    </div>

    <div class="bg-white p-6 rounded-2xl border mt-6">
      <h3 class="font-black mb-4 flex items-center gap-2"><i data-lucide="bar-chart-2" class="w-5 h-5"></i>📊 연도별 매출 비교</h3>
      ${Object.keys(yearStats).length?`<div class="grid grid-cols-1 md:grid-cols-${Math.min(4,Object.keys(yearStats).length)} gap-4 mobile-stack">${Object.entries(yearStats).sort((a,b)=>a[0].localeCompare(b[0])).map(([y,s])=>`<div class="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-4 rounded-xl"><p class="text-xs opacity-80 font-bold">${y}년</p><p class="text-2xl font-black mt-1">${fmt(s.rev)}</p><p class="text-xs opacity-80 mt-1">${s.count}건 예약</p></div>`).join('')}</div>`:UI.Empty('calendar','연도 데이터 없음')}
    </div>`;

    setTimeout(() => {
      const importInput = document.getElementById('anaImportInput');
      if (importInput) importInput.onchange = e => this.importAnalyticsExcel(e.target.files[0]);
    }, 100);
    lucide.createIcons();
  }
    // ===== [v3.2] 고급 분석 기간 필터 핸들러 =====
  applyAnaFilter() {
    const period = document.getElementById('anaPeriod').value;
    let from = document.getElementById('anaFrom').value;
    let to = document.getElementById('anaTo').value;
    if (period === 'day') from = to = todayStr();
    else if (period === 'week') {
      const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day;
      from = new Date(d.setDate(diff)).toISOString().split('T')[0];
      to = new Date(d.setDate(diff+6)).toISOString().split('T')[0];
    } else if (period === 'month') {
      const fd = new Date(from || todayStr());
      from = `${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-01`;
      const last = new Date(fd.getFullYear(), fd.getMonth()+1, 0);
      to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    }
    this._anaFilter = { ...this._anaFilter, period, from, to };
    this.renderAdminTab();
  }

  anaPrevMonth() {
    const f = this._anaFilter;
    const d = new Date(f.from);
    d.setMonth(d.getMonth() - 1);
    f.from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
    f.to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    f.period = 'month';
    this.renderAdminTab();
  }

  anaNextMonth() {
    const f = this._anaFilter;
    const d = new Date(f.from);
    d.setMonth(d.getMonth() + 1);
    f.from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const last = new Date(d.getFullYear(), d.getMonth()+1, 0);
    f.to = `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    f.period = 'month';
    this.renderAdminTab();
  }

  changeAnaScope(scope) {
    this._anaFilter.scope = scope;
    if (scope === 'all') {
      this._anaFilter.propIds = [];
      this._anaFilter.groupName = '';
    }
    this.renderAdminTab();
  }

  // ===== [v3.2] 고급분석 매물 다중 선택 모달 =====
  showAnaPropsPicker() {
    const selected = new Set(this._anaFilter.propIds);
    openModal('🏠 분석 대상 매물 선택', `
      <div class="bg-blue-50 p-3 rounded-xl mb-4 text-xs font-bold text-blue-700">💡 분석할 매물을 여러 개 선택하세요</div>
      <div class="flex gap-2 mb-4">
        <button onclick="document.querySelectorAll('[data-app]').forEach(c=>c.checked=true)" class="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-black">✅ 전체 선택</button>
        <button onclick="document.querySelectorAll('[data-app]').forEach(c=>c.checked=false)" class="bg-slate-200 px-3 py-2 rounded-lg text-xs font-black">❌ 전체 해제</button>
      </div>
      <div class="space-y-2 max-h-96 overflow-y-auto scrollbar">
        ${store.statsProperties().map(p => `<label class="flex items-center gap-3 p-3 bg-slate-50 hover:bg-blue-50 rounded-xl cursor-pointer">
          <input type="checkbox" data-app value="${p.id}" ${selected.has(p.id)?'checked':''} class="w-4 h-4">
          <div class="flex-1">
            <p class="font-black text-sm">${p.name}</p>
            <p class="text-[10px] text-slate-400 font-bold">${p.group||'-'} · ${fmt(p.price)}</p>
          </div>
        </label>`).join('')}
      </div>
      <button onclick="router.applyAnaPropsPicker()" class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase mt-4">✅ 적용</button>
    `, 'max-w-2xl');
  }

  applyAnaPropsPicker() {
    const checked = [...document.querySelectorAll('[data-app]:checked')].map(c => +c.value);
    this._anaFilter.propIds = checked;
    closeModal();
    this.renderAdminTab();
    toast(`${checked.length}개 매물 선택됨`, 'success');
  }

  // ===== [v3.2] 고급분석 숙소 상세 정보 =====
  showAnaPropDetail(propId) {
    const p = store.prop(propId);
    if (!p) return;
    const f = this._anaFilter;
    const bookings = store.bookings.filter(b =>
      b.propId === propId && b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to
    ).sort((a,b) => (b.checkIn||'').localeCompare(a.checkIn||''));
    const expenses = store.expenses.filter(e =>
      e.propId === propId && e.date && e.date >= f.from && e.date <= f.to
    ).sort((a,b) => (b.date||'').localeCompare(a.date||''));

    const rev = bookings.reduce((s,b) => s + (+b.price||0), 0);
    const init = expenses.filter(e => e.majorCat === '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
    const op = expenses.filter(e => e.majorCat !== '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
    const profit = rev - op;
    const roi = init > 0 ? Math.round(profit / init * 100) : 0;
    const margin = rev > 0 ? Math.round(profit / rev * 100) : 0;

    openModal(`📊 ${p.name} - 상세 분석`, `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-blue-50 p-4 rounded-xl border-2 border-blue-200"><p class="text-[10px] font-black text-blue-600 uppercase">매출</p><p class="text-xl font-black text-blue-700 mt-1">${fmt(rev)}</p></div>
        <div class="bg-amber-50 p-4 rounded-xl border-2 border-amber-200"><p class="text-[10px] font-black text-amber-600 uppercase">초기투자</p><p class="text-xl font-black text-amber-700 mt-1">${fmt(init)}</p></div>
        <div class="bg-red-50 p-4 rounded-xl border-2 border-red-200"><p class="text-[10px] font-black text-red-600 uppercase">운영지출</p><p class="text-xl font-black text-red-700 mt-1">${fmt(op)}</p></div>
        <div class="bg-green-50 p-4 rounded-xl border-2 border-green-200"><p class="text-[10px] font-black text-green-600 uppercase">순이익</p><p class="text-xl font-black text-green-700 mt-1">${fmt(profit)}</p></div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-5 rounded-2xl">
          <p class="text-xs opacity-80 font-bold">ROI (투자수익률)</p>
          <p class="text-4xl font-black mt-2">${roi}%</p>
        </div>
        <div class="bg-gradient-to-br from-indigo-600 to-blue-600 text-white p-5 rounded-2xl">
          <p class="text-xs opacity-80 font-bold">수익률</p>
          <p class="text-4xl font-black mt-2">${margin}%</p>
        </div>
      </div>

      <div class="bg-white border rounded-2xl overflow-hidden mb-4">
        <div class="p-4 bg-blue-50 border-b"><p class="text-[10px] font-black text-blue-700 uppercase">📅 예약 이력 (${bookings.length}건)</p></div>
        <div class="overflow-x-auto max-h-64 overflow-y-auto scrollbar">
          ${bookings.length ? `<table class="w-full text-xs"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase sticky top-0"><tr><th class="px-3 py-2 text-left">기간</th><th class="px-3 py-2 text-left">예약자</th><th class="px-3 py-2 text-left">플랫폼</th><th class="px-3 py-2 text-right">금액</th></tr></thead><tbody class="divide-y">${bookings.map(b => `<tr class="hover:bg-blue-50/30"><td class="px-3 py-2 font-mono">${b.checkIn} ~ ${b.checkOut}</td><td class="px-3 py-2 font-black">${b.guest}</td><td class="px-3 py-2">${b.platform}</td><td class="px-3 py-2 text-right font-black text-blue-600">${fmt(b.price)}</td></tr>`).join('')}</tbody></table>` : '<p class="p-6 text-center text-slate-400 font-bold">예약 없음</p>'}
        </div>
      </div>

      <div class="bg-white border rounded-2xl overflow-hidden">
        <div class="p-4 bg-red-50 border-b"><p class="text-[10px] font-black text-red-700 uppercase">💳 지출 이력 (${expenses.length}건)</p></div>
        <div class="overflow-x-auto max-h-64 overflow-y-auto scrollbar">
          ${expenses.length ? `<table class="w-full text-xs"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase sticky top-0"><tr><th class="px-3 py-2 text-left">날짜</th><th class="px-3 py-2 text-left">분류</th><th class="px-3 py-2 text-left">메모</th><th class="px-3 py-2 text-right">금액</th></tr></thead><tbody class="divide-y">${expenses.map(e => `<tr class="hover:bg-red-50/30"><td class="px-3 py-2 font-mono">${e.date}</td><td class="px-3 py-2 font-black">${e.majorCat} · ${e.category}</td><td class="px-3 py-2 text-slate-500">${e.memo||'-'}</td><td class="px-3 py-2 text-right font-black text-red-600">${fmt(e.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="p-6 text-center text-slate-400 font-bold">지출 없음</p>'}
        </div>
      </div>
    `, 'max-w-4xl');
  }

  // ===== [v3.2] 고급분석 Excel 내보내기/불러오기 =====
  exportAnalyticsExcel() {
    const f = this._anaFilter;
    const allProps = store.statsProperties();
    let targetProps = allProps;
    if (f.scope === 'group' && f.groupName) targetProps = allProps.filter(p => p.group === f.groupName);
    else if (f.scope === 'props' && f.propIds.length) targetProps = allProps.filter(p => f.propIds.includes(p.id));
    const targetIds = new Set(targetProps.map(p => p.id));
    const filteredBookings = store.bookings.filter(b => b.checkIn && b.checkIn >= f.from && b.checkIn <= f.to && targetIds.has(b.propId));
    const filteredExpenses = store.expenses.filter(e => e.date && e.date >= f.from && e.date <= f.to && targetIds.has(e.propId));

    // 시트 1: 매물별 ROI
    const roiSheet = targetProps.map((p, i) => {
      const rev = filteredBookings.filter(b => b.propId === p.id).reduce((s,b) => s + (+b.price||0), 0);
      const init = filteredExpenses.filter(e => e.propId === p.id && e.majorCat === '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
      const op = filteredExpenses.filter(e => e.propId === p.id && e.majorCat !== '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
      const profit = rev - op;
      return {
        'No.': i+1,
        '숙소명': p.name,
        '그룹': p.group || '-',
        '매출': rev,
        '초기투자': init,
        '운영지출': op,
        '순이익': profit,
        'ROI(%)': init > 0 ? Math.round(profit/init*100) : 0,
        '수익률(%)': rev > 0 ? Math.round(profit/rev*100) : 0,
        '회수예상(일)': init > 0 && profit > 0 ? Math.round(init/(profit/365)) : 0
      };
    });

    // 시트 2: 고객 LTV
    const ltvMap = {};
    filteredBookings.forEach(b => {
      const k = (b.guest||'') + '|' + (b.contact||'');
      if (!ltvMap[k]) ltvMap[k] = { name: b.guest, contact: b.contact, total: 0, count: 0 };
      ltvMap[k].total += +b.price || 0;
      ltvMap[k].count++;
    });
    const ltvSheet = Object.values(ltvMap).sort((a,b) => b.total - a.total).map((c, i) => ({
      '순위': i+1,
      '이름': c.name,
      '연락처': c.contact,
      '총매출': c.total,
      '방문횟수': c.count,
      '평균단가': Math.round(c.total / c.count)
    }));

    // 시트 3: 요일별 가동률
    const dayHeat = [0,0,0,0,0,0,0];
    filteredBookings.forEach(b => {
      try { const d = new Date(b.checkIn); if (!isNaN(d)) dayHeat[d.getDay()]++; } catch {}
    });
    const dayLabels = ['일','월','화','수','목','금','토'];
    const heatmapSheet = dayLabels.map((d, i) => ({ '요일': d, '예약수': dayHeat[i] }));

    // 시트 4: 연도별 매출
    const yearStats = {};
    filteredBookings.forEach(b => {
      if (!b.checkIn) return;
      const y = b.checkIn.slice(0,4);
      if (!yearStats[y]) yearStats[y] = { rev:0, count:0 };
      yearStats[y].rev += +b.price || 0;
      yearStats[y].count++;
    });
    const yearSheet = Object.entries(yearStats).sort((a,b) => a[0].localeCompare(b[0])).map(([y,s]) => ({
      '연도': y,
      '매출': s.rev,
      '예약수': s.count
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roiSheet), '매물ROI');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ltvSheet), '고객LTV');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(heatmapSheet), '요일별가동');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(yearSheet), '연도별매출');
    XLSX.writeFile(wb, `고급분석_${f.from}_${f.to}.xlsx`);
    toast('📥 다운로드 완료', 'success');
  }

  async importAnalyticsExcel(file) {
    if (!file) return;
    if (!confirm('엑셀 데이터를 가져옵니다. 통계/보고서와 동일한 시트 형식이 필요합니다. 계속?')) return;
    showLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      let added = 0;

      // 예약/지출 시트가 있으면 처리 (통계 보고서 형식과 호환)
      if (wb.Sheets['예약상세']) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['예약상세']);
        for (const row of rows) {
          const prop = store.properties.find(p => p.name === row['숙소']);
          if (!prop) continue;
          await store.addBooking({
            propId: prop.id,
            checkIn: row['체크인'],
            checkOut: row['체크아웃'],
            guest: row['예약자'] || '미지정',
            contact: row['연락처'] || '',
            platform: row['플랫폼'] || '직접예약',
            people: +row['인원'] || 2,
            price: +row['가격'] || 0,
            memo: row['메모'] || '',
            nationality: '한국'
          });
          added++;
        }
      }

      if (wb.Sheets['지출상세']) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets['지출상세']);
        for (const row of rows) {
          const prop = store.properties.find(p => p.name === row['숙소']);
          if (!prop) continue;
          await store.addExpense({
            propId: prop.id,
            date: row['날짜'] || todayStr(),
            majorCat: row['대분류'] || '변동지출',
            category: row['소분류'] || '기타',
            amount: +row['금액'] || 0,
            memo: row['메모'] || ''
          });
          added++;
        }
      }

      if (added === 0) {
        toast('가져올 수 있는 시트가 없습니다 (예약상세/지출상세 시트 필요)', 'warning');
      } else {
        toast(`✅ ${added}건 추가됨`, 'success');
      }
      await this.renderAdminTab();
    } catch(e) {
      toast('실패: '+e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
  
  // ===== 📦 플랫폼 버전 관리 =====
  admVersion(c) {
    // 버전 히스토리 (전체 개발 기록)
    const versions = [
      {
        v: '3.1.0',
        date: '2026-04-28',
        type: 'major',
        title: '🎯 종합 업그레이드 + AI & 보안 강화',
        author: 'QJ-PMS Team',
        features: [
          '✨ AI 인사이트 (8가지 자동 운영 분석)',
          '💎 AI 스마트 가격 추천 (수요 예측 기반)',
          '🎨 메인화면 관리 (로고/타이틀/안내문 커스터마이징)',
          '🌙 다크 모드 토글 (전체 적용)',
          '🔍 통합 검색 시스템 (Cmd+K)',
          '🔔 체크인/체크아웃 자동 알림 (당일/내일)',
          '💬 카카오톡 웹훅 연동 (Make/Zapier)',
          '🔒 보안 설정 (세션 타임아웃/2FA/비번정책/IP추적)',
          '💾 백업/복원 시스템 (JSON 다운/업로드)',
          '📊 고급 분석 (히트맵/LTV/ROI/연도비교)',
          '📄 PDF 보고서 발급',
          '📱 모바일 햄버거 메뉴 + 반응형',
          '🔃 카테고리 드래그앤드롭 + 인라인 수정',
          '💳 지출 셀 클릭 인라인 편집',
          '🏠 매물 드래그앤드롭 순서 변경',
          '📦 플랫폼 버전 관리 (NEW)'
        ]
      },
      {
        v: '3.0.0',
        date: '2026-04-20',
        type: 'major',
        title: '🚀 AI 시스템 + 모든 사용자 스케줄링',
        author: 'QJ-PMS Team',
        features: [
          '✨ AI 인사이트 기능 도입 (자동 운영 추천)',
          '💎 AI 스마트 가격 추천 (실거래 분석)',
          '📅 모든 사용자 스케줄 직접 등록 가능',
          '🔄 양방향 알림 동기화 (관리자↔직원)',
          '🔔 사이드바 알림 메뉴 통합',
          '🖼️ 매물 다중 이미지 업로드 (10MB/장)',
          '⭐ 대표 이미지 선택 기능',
          '📌 매물 커스텀 운영정보 (사용자 정의 항목)',
          '👤 매니저 배정 시 자동 알림',
          '📊 지출 엑셀 내보내기/불러오기',
          '🗓️ 예약 과거/미래 월 자유 이동',
          '📈 통계에서 초기투자지출 제외 옵션',
          '🎯 고객별 메모 작성 + 최근순 정렬',
          '📦 플랫폼 CRUD (색상 포함)',
          '🛍️ 물품-매물 다중 연결',
          '📊 플랫폼별 매출 통계 + 점유율 차트'
        ]
      },
      {
        v: '2.0.0',
        date: '2026-04-15',
        type: 'major',
        title: '☁️ Netlify Fullstack 클라우드 전환',
        author: 'QJ-PMS Team',
        features: [
          '🌐 Netlify Functions 백엔드 구축',
          '💾 Netlify Blobs 데이터 저장소 연동',
          '🔐 JWT 토큰 기반 인증 시스템',
          '👥 다중 사용자 실시간 데이터 공유',
          '🔄 LocalStorage → 클라우드 DB 전환',
          '📡 RESTful API 설계 (data.js, auth.js)',
          '🌱 시딩 시스템 (seed.js)',
          '📁 모듈화 (HTML/CSS/JS 분리)',
          '🚀 GitHub 연동 자동 배포 파이프라인',
          '🔒 환경변수 보안 관리'
        ]
      },
      {
        v: '1.2.0',
        date: '2026-04-10',
        type: 'minor',
        title: '👤 프로필 관리 + 알림 시스템 강화',
        author: 'QJ-PMS Team',
        features: [
          '📝 본인 정보 수정 신청 → 관리자 승인 워크플로우',
          '🔔 사용자별 알림 분리 (개인 알림함)',
          '🎨 매니저 색상 태그 시스템',
          '👤 헤더/사이드바 본인 이름 클릭 → 프로필 수정',
          '🔄 정보 변경 요청/승인/반려 모든 단계 알림',
          '📋 알람 전체보기 모달 (개인별)',
          '✅ 관리자 프로필 요청 처리 화면 (승인/반려)',
          '📊 변경 이력 시각화 (이전→이후)'
        ]
      },
      {
        v: '1.1.0',
        date: '2026-04-05',
        type: 'minor',
        title: '🔗 자동 연동 + 운영관리 강화',
        author: 'QJ-PMS Team',
        features: [
          '🌐 인터넷↔지출 양방향 자동 연동',
          '📋 운영관리 25컬럼 엑셀 시트 (사진 기반)',
          '🛍️ 물품 추천 CRUD 완전 구현',
          '🎨 매니저 색상 태그',
          '📦 운영 데이터 편집 폼 (전체 필드)',
          '💰 매출 필터 강화 (그룹/매물/기간)',
          '📈 AI 보고서 (대화내역 포함)',
          '💳 예약 폼 디테일 (제안가 표시)'
        ]
      },
      {
        v: '1.0.0',
        date: '2026-04-01',
        type: 'major',
        title: '🎉 초기 PMS 시스템 출시',
        author: 'QJ-PMS Team',
        features: [
          '🔐 로그인 시스템 (Admin/Manager/Director)',
          '🏠 매물 관리 (CRUD + 그룹화)',
          '📅 예약 관리 + 캘린더',
          '💬 매물별 채팅 시스템',
          '💳 지출 관리 (대분류/소분류)',
          '👥 이용자 권한 관리',
          '👷 직원 스케줄링 + 알람',
          '📊 통계 & 보고서',
          '👨‍👩‍👧 고객 관리',
          '📋 활동 로그',
          '📦 인터넷/물품 추천 관리',
          '📡 13개 관리자 메뉴 구성'
        ]
      }
    ];

    // 통계 계산
    const totalFeatures = versions.reduce((s, v) => s + v.features.length, 0);
    const majorCount = versions.filter(v => v.type === 'major').length;
    const minorCount = versions.filter(v => v.type === 'minor').length;
    const currentVersion = versions[0];
    const firstVersion = versions[versions.length - 1];

    c.innerHTML = `
      <div class="mb-6">
        <h2 class="text-3xl font-black flex items-center gap-3"><i data-lucide="git-branch" class="w-8 h-8 text-blue-600"></i>플랫폼 버전 관리</h2>
        <p class="text-slate-500 mt-1">현재 버전 정보 및 전체 개발 히스토리</p>
      </div>

      <!-- 현재 버전 카드 -->
      <div class="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white p-8 rounded-3xl mb-6 shadow-2xl">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div class="flex items-center gap-3 mb-3">
              <span class="px-3 py-1 bg-white/20 rounded-full text-xs font-black uppercase tracking-widest">현재 버전</span>
              <span class="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-black">🟢 LIVE</span>
            </div>
            <h3 class="text-5xl font-black tracking-tight mb-2">v${currentVersion.v}</h3>
            <p class="text-xl font-bold opacity-90">${currentVersion.title}</p>
            <p class="text-sm opacity-70 mt-3 font-mono">📅 배포일: ${currentVersion.date} · 👤 ${currentVersion.author}</p>
          </div>
          <div class="bg-white/10 backdrop-blur p-5 rounded-2xl min-w-[200px]">
            <p class="text-[10px] font-black uppercase opacity-70 mb-2">버전 통계</p>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between"><span class="opacity-80">총 기능:</span><b>${totalFeatures}개</b></div>
              <div class="flex justify-between"><span class="opacity-80">메이저:</span><b>${majorCount}회</b></div>
              <div class="flex justify-between"><span class="opacity-80">마이너:</span><b>${minorCount}회</b></div>
              <div class="flex justify-between"><span class="opacity-80">전체 릴리즈:</span><b>${versions.length}회</b></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 빠른 정보 -->
      <div class="grid grid-cols-4 gap-4 mb-6 mobile-stack">
        <div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">최초 출시</p><p class="text-lg font-black mt-2">${firstVersion.date}</p><p class="text-xs text-slate-500 font-bold">v${firstVersion.v}</p></div>
        <div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">최근 업데이트</p><p class="text-lg font-black mt-2">${currentVersion.date}</p><p class="text-xs text-slate-500 font-bold">v${currentVersion.v}</p></div>
        <div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">개발 기간</p><p class="text-lg font-black mt-2">${this._calcDays(firstVersion.date, currentVersion.date)}일</p><p class="text-xs text-slate-500 font-bold">진행중 ✅</p></div>
        <div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">GitHub 저장소</p><p class="text-lg font-black mt-2 truncate">qj-propms</p><a href="https://github.com" target="_blank" class="text-xs text-blue-600 font-bold hover:underline">저장소 보기 →</a></div>
      </div>

      <!-- 액션 버튼 -->
      <div class="flex gap-3 mb-6 flex-wrap">
        <button onclick="router.exportVersionHistory()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm flex items-center gap-2"><i data-lucide="download" class="w-4 h-4"></i>히스토리 내보내기</button>
        <button onclick="router.showAddVersionModal()" class="bg-green-600 text-white px-5 py-3 rounded-xl font-black text-sm flex items-center gap-2"><i data-lucide="plus-circle" class="w-4 h-4"></i>새 버전 기록 추가</button>
        <button onclick="router.showRoadmap()" class="bg-amber-500 text-white px-5 py-3 rounded-xl font-black text-sm flex items-center gap-2"><i data-lucide="map" class="w-4 h-4"></i>향후 로드맵</button>
      </div>

      <!-- 버전 히스토리 타임라인 -->
      <div class="bg-white rounded-2xl border p-6">
        <h3 class="text-xl font-black mb-6 flex items-center gap-2"><i data-lucide="history" class="w-5 h-5"></i>📜 전체 버전 히스토리 (${versions.length}개)</h3>
        <div class="relative">
          <div class="absolute left-6 top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500"></div>
          <div class="space-y-6">
            ${versions.map((v, i) => {
              const typeColor = { major: 'bg-purple-600', minor: 'bg-blue-600', patch: 'bg-green-600' }[v.type] || 'bg-slate-600';
              const typeLabel = { major: 'MAJOR', minor: 'MINOR', patch: 'PATCH' }[v.type] || 'RELEASE';
              const isLatest = i === 0;
              return `
                <div class="relative pl-16">
                  <div class="absolute left-3 top-3 w-7 h-7 rounded-full ${typeColor} flex items-center justify-center text-white text-xs font-black shadow-lg ring-4 ring-white">${versions.length - i}</div>
                  <div class="bg-slate-50 rounded-2xl p-5 border-2 ${isLatest ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'}">
                    <div class="flex items-start justify-between flex-wrap gap-2 mb-3">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-2xl font-black">v${v.v}</span>
                        <span class="px-2 py-1 ${typeColor} text-white rounded-lg text-[9px] font-black">${typeLabel}</span>
                        ${isLatest ? '<span class="px-2 py-1 bg-green-500 text-white rounded-lg text-[9px] font-black animate-pulse">CURRENT</span>' : ''}
                      </div>
                      <span class="text-xs text-slate-400 font-mono font-bold">📅 ${v.date}</span>
                    </div>
                    <h4 class="text-lg font-black mb-3">${v.title}</h4>
                    <div class="bg-white p-4 rounded-xl">
                      <p class="text-[10px] font-black text-slate-400 uppercase mb-2">변경사항 (${v.features.length}개)</p>
                      <ul class="space-y-1.5">
                        ${v.features.map(f => `<li class="text-xs font-medium text-slate-700 flex items-start gap-2"><span class="text-green-500 mt-0.5">▸</span><span>${f}</span></li>`).join('')}
                      </ul>
                    </div>
                    <p class="text-[10px] text-slate-400 font-bold mt-3">👤 ${v.author}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 푸터 안내 -->
      <div class="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 mt-6">
        <p class="text-sm font-black text-blue-700 mb-2 flex items-center gap-2"><i data-lucide="info" class="w-4 h-4"></i>💡 버전 관리 안내</p>
        <ul class="text-xs text-blue-700 font-bold space-y-1 ml-4">
          <li>• <b>MAJOR</b>: 큰 기능 변경 또는 아키텍처 변경 (예: v1.0 → v2.0)</li>
          <li>• <b>MINOR</b>: 새 기능 추가 (예: v1.0 → v1.1)</li>
          <li>• <b>PATCH</b>: 버그 수정 및 작은 개선 (예: v1.1.0 → v1.1.1)</li>
          <li>• 새 기능 개발 시 <b>"새 버전 기록 추가"</b> 버튼으로 히스토리 등록</li>
          <li>• Git 커밋과 별개로 <b>사용자 친화적 변경 이력</b> 관리</li>
        </ul>
      </div>
    `;
    lucide.createIcons();
  }

  _calcDays(start, end) {
    return Math.round((new Date(end) - new Date(start)) / 86400000);
  }

  // 새 버전 추가 모달
  showAddVersionModal() {
    openModal('🆕 새 버전 기록 추가', `
      <form id="addVerForm" class="space-y-4">
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-bold text-blue-700">💡 새로운 기능이 추가되거나 큰 변경이 있을 때 버전을 기록하세요</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black text-slate-400 uppercase">버전 번호</label><input name="v" placeholder="3.2.0" class="w-full p-3 border rounded-xl font-bold mt-1 font-mono" required></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">유형</label><select name="type" class="w-full p-3 border rounded-xl font-bold mt-1"><option value="patch">PATCH (버그 수정)</option><option value="minor" selected>MINOR (기능 추가)</option><option value="major">MAJOR (큰 변경)</option></select></div>
        </div>
        <input name="title" placeholder="제목 (예: 🎯 결제 시스템 추가)" class="w-full p-3 border rounded-xl font-bold" required>
        <div><label class="text-[10px] font-black text-slate-400 uppercase">변경사항 (한 줄에 하나씩)</label><textarea name="features" placeholder="✨ 새 기능 1&#10;🔧 개선사항 2&#10;🐛 버그 수정 3" class="w-full p-3 border rounded-xl h-40 font-bold mt-1"></textarea></div>
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-bold text-amber-700">⚠️ 이 기능은 현재 메모리상에만 추가됩니다. 영구 저장하려면 추후 백엔드 연동이 필요합니다.</div>
        <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">버전 기록 추가</button>
      </form>
    `, 'max-w-2xl');
    document.getElementById('addVerForm').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const features = fd.get('features').split('\n').map(s => s.trim()).filter(Boolean);
      toast(`v${fd.get('v')} 버전 기록 등록 (${features.length}개 변경사항)`, 'success');
      closeModal();
      // 향후 store에 저장하려면 여기에 store.saveVersion() 호출
    };
  }

  // 히스토리 내보내기
  exportVersionHistory() {
    const versions = [
      { v: '3.1.0', date: '2026-04-28', title: '종합 업그레이드 + AI & 보안 강화' },
      { v: '3.0.0', date: '2026-04-20', title: 'AI 시스템 + 모든 사용자 스케줄링' },
      { v: '2.0.0', date: '2026-04-15', title: 'Netlify Fullstack 클라우드 전환' },
      { v: '1.2.0', date: '2026-04-10', title: '프로필 관리 + 알림 시스템 강화' },
      { v: '1.1.0', date: '2026-04-05', title: '자동 연동 + 운영관리 강화' },
      { v: '1.0.0', date: '2026-04-01', title: '초기 PMS 시스템 출시' }
    ];
    const md = `# QJ-PropMS 버전 히스토리\n\n${versions.map(v => `## v${v.v} (${v.date})\n${v.title}\n`).join('\n')}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QJ-PMS-Versions-${todayStr()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📥 버전 히스토리 다운로드 완료', 'success');
  }

  // 향후 로드맵
  showRoadmap() {
    openModal('🗺️ 향후 개발 로드맵', `
      <div class="space-y-4">
        <div class="bg-gradient-to-br from-blue-600 to-purple-600 text-white p-5 rounded-2xl">
          <h3 class="font-black text-lg mb-2">🎯 v3.2 - 결제 & 정산 (예정)</h3>
          <ul class="text-sm space-y-1 opacity-90">
            <li>▸ 카드 결제 연동 (토스페이먼츠/PortOne)</li>
            <li>▸ 자동 세금계산서 발행</li>
            <li>▸ 정산 리포트 자동 생성</li>
          </ul>
        </div>
        <div class="bg-gradient-to-br from-green-600 to-emerald-600 text-white p-5 rounded-2xl">
          <h3 class="font-black text-lg mb-2">🌐 v3.3 - 외부 플랫폼 연동 (예정)</h3>
          <ul class="text-sm space-y-1 opacity-90">
            <li>▸ Airbnb iCal 동기화</li>
            <li>▸ Booking.com 자동 가져오기</li>
            <li>▸ 멀티 채널 매니저</li>
          </ul>
        </div>
        <div class="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-5 rounded-2xl">
          <h3 class="font-black text-lg mb-2">📱 v4.0 - 모바일 앱 (장기)</h3>
          <ul class="text-sm space-y-1 opacity-90">
            <li>▸ React Native 모바일 앱</li>
            <li>▸ 푸시 알림 (FCM)</li>
            <li>▸ 오프라인 모드</li>
          </ul>
        </div>
        <div class="bg-slate-100 p-4 rounded-xl text-xs text-slate-600 font-bold">💡 로드맵은 우선순위에 따라 변경될 수 있습니다</div>
      </div>
    `, 'max-w-2xl');
  }
    admUsers(c) {
    if (!store.users || !store.users.length) {
      c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">🔐 이용자/권한 관리</h2><button onclick="router.showUserForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규 계정</button></div>${UI.Empty('users','이용자가 없습니다','+ 신규 계정 버튼으로 등록하세요')}`;
      return;
    }
    c.innerHTML = `
      <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h2 class="text-3xl font-black">🔐 이용자/권한 관리 (${store.users.length}명)</h2>
        <button onclick="router.showUserForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규 계정</button>
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs font-bold text-blue-700">
        💡 Admin: 모든 권한 · Manager: 배정 매물만 · Director: 모든 매물 조회 (수정 불가)
      </div>
      <div class="bg-white rounded-2xl border overflow-x-auto">
        <table class="w-full">
          <thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase">
            <tr>
              <th class="px-4 py-3 text-left">ID</th>
              <th class="px-4 py-3 text-left">이름</th>
              <th class="px-4 py-3 text-left">역할</th>
              <th class="px-4 py-3 text-left">색상</th>
              <th class="px-4 py-3 text-left">연락처</th>
              <th class="px-4 py-3 text-left">이메일</th>
              <th class="px-4 py-3 text-left">권한</th>
              <th class="px-4 py-3 text-left">2FA</th>
              <th class="px-4 py-3 text-center">관리</th>
            </tr>
          </thead>
          <tbody class="text-sm divide-y">
            ${store.users.map(u => {
              const roleColor = u.role === 'Admin' ? 'bg-amber-100 text-amber-700' : u.role === 'Manager' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600';
              const nick = (u.name.match(/\((.+)\)/) || [, u.name])[1];
              const permText = u.role === 'Admin' ? '전체' : u.role === 'Director' ? '뷰(전체)' : `${(u.permissions || []).length}개`;
              return `<tr class="hover:bg-blue-50/30">
                <td class="px-4 py-3 font-mono font-black">${u.id}</td>
                <td class="px-4 py-3 font-black">${u.name}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded text-[10px] font-black ${roleColor}">${u.role}</span></td>
                <td class="px-4 py-3"><span class="tag-mgr" style="background:${u.tagColor || '#94a3b8'}">${nick}</span></td>
                <td class="px-4 py-3 text-xs">${u.contact || '-'}</td>
                <td class="px-4 py-3 text-xs">${u.email || '-'}</td>
                <td class="px-4 py-3 text-xs font-black text-blue-600">${permText}</td>
                <td class="px-4 py-3 text-xs">${u.use2FA ? '<span class="text-green-600 font-black">✅ ON</span>' : '<span class="text-slate-300">OFF</span>'}</td>
                <td class="px-4 py-3 text-center">
                  <button onclick="router.showUserForm('${u.id}')" class="p-2 bg-slate-100 rounded-lg mr-1" title="수정"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                  ${u.id !== 'admin' ? `<button onclick="router.delUser('${u.id}')" class="p-2 bg-red-50 text-red-500 rounded-lg" title="삭제"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    lucide.createIcons();
  }

  showUserForm(uid = null) {
    const u = uid ? store.user(uid) : { id: '', pw: '', name: '', role: 'Manager', contact: '', email: '', memo: '', permissions: [], tagColor: '#60a5fa', use2FA: false, otpSecret: '' };
    if (!u) { toast('사용자를 찾을 수 없습니다', 'error'); return; }
    
    openModal(uid ? '✏️ 이용자 수정' : '🆕 신규 계정', `
      <form id="uf" class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[10px] font-black text-slate-400 uppercase">아이디</label>
            <input name="id" value="${u.id}" placeholder="아이디" class="w-full p-3 border rounded-xl font-bold mt-1" ${uid ? 'readonly' : 'required'}>
          </div>
          <div>
            <label class="text-[10px] font-black text-slate-400 uppercase">비밀번호</label>
            <input name="pw" value="${u.pw || ''}" placeholder="비밀번호" class="w-full p-3 border rounded-xl font-bold mt-1" required>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[10px] font-black text-slate-400 uppercase">이름 (예: 박보람(맨투))</label>
            <input name="name" value="${u.name}" placeholder="이름" class="w-full p-3 border rounded-xl font-bold mt-1" required>
          </div>
          <div>
            <label class="text-[10px] font-black text-slate-400 uppercase">역할</label>
            <select name="role" class="w-full p-3 border rounded-xl font-bold mt-1">
              <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
              <option value="Manager" ${u.role === 'Manager' ? 'selected' : ''}>Manager</option>
              <option value="Director" ${u.role === 'Director' ? 'selected' : ''}>Director</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <input name="contact" value="${u.contact || ''}" placeholder="연락처" class="p-3 border rounded-xl font-bold">
          <input name="email" value="${u.email || ''}" placeholder="이메일" class="p-3 border rounded-xl font-bold">
          <input type="color" name="tagColor" value="${u.tagColor || '#60a5fa'}" class="p-2 border rounded-xl h-12">
        </div>
        <input name="memo" value="${u.memo || ''}" placeholder="비고" class="w-full p-3 border rounded-xl font-bold">
        
        <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
          <label class="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" name="use2FA" ${u.use2FA ? 'checked' : ''} class="w-4 h-4">
            <span class="text-sm font-black text-amber-700">🛡️ 2단계 인증 사용</span>
          </label>
          <input name="otpSecret" value="${u.otpSecret || ''}" placeholder="6자리 OTP 코드 (예: 123456)" maxlength="6" class="w-full p-2 border rounded-lg font-mono text-sm">
        </div>
        
        <div class="bg-slate-50 p-4 rounded-xl">
          <p class="text-xs font-black text-slate-500 uppercase mb-3">🏠 매물 권한 (Manager만 적용)</p>
          ${store.properties.length === 0 ? '<p class="text-xs text-slate-400 text-center py-3">등록된 매물이 없습니다</p>' : `
            <div class="grid grid-cols-2 gap-2">
              ${store.properties.map(p => `
                <label class="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-blue-50">
                  <input type="checkbox" name="perm_${p.id}" ${(u.permissions || []).includes(p.id) ? 'checked' : ''}>
                  <span class="text-xs font-bold">${p.name}</span>
                </label>
              `).join('')}
            </div>
          `}
        </div>
        
        <button type="submit" class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">${uid ? '수정 저장' : '계정 생성'}</button>
      </form>
    `, 'max-w-2xl');
    
    document.getElementById('uf').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = {};
      fd.forEach((v, k) => { d[k] = v; });
      d.use2FA = !!d.use2FA;
      
      // 권한 수집
      const perms = [];
      store.properties.forEach(p => {
        if (d['perm_' + p.id]) perms.push(p.id);
        delete d['perm_' + p.id];
      });
      d.permissions = perms;
      
      // 비밀번호 정책 검증
      if (d.pw && store.validatePassword) {
        const v = store.validatePassword(d.pw);
        if (!v.valid) { 
          toast('비밀번호: ' + v.errors.join(', '), 'error'); 
          return; 
        }
      }
      
      showLoading(true);
      try {
        await store.upsertUser(d);
        toast(uid ? '수정 완료' : '계정 생성 완료', 'success');
        closeModal();
        await this.renderAdminTab();
      } catch(err) {
        toast('실패: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
    lucide.createIcons();
  }

  async delUser(id) {
    if (id === 'admin') { toast('기본 관리자는 삭제할 수 없습니다', 'error'); return; }
    if (!confirm('정말 삭제하시겠습니까?')) return;
    showLoading(true);
    try {
      await store.delUser(id);
      toast('삭제됨', 'success');
      await this.renderAdminTab();
    } catch(e) {
      toast('실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
    admProfileReq(c) {
    const all = [...(store.profileRequests || [])].sort((a, b) => b.id - a.id);
    const pending = all.filter(r => r.status === 'pending');
    
    c.innerHTML = `
      <h2 class="text-3xl font-black mb-2">👤 프로필 변경 요청</h2>
      <p class="text-slate-500 mb-6">매니저/실장의 정보 변경 요청을 승인 또는 반려합니다</p>
      
      <div class="grid grid-cols-3 gap-4 mb-6 mobile-stack">
        <div class="bg-amber-50 border-2 border-amber-200 p-5 rounded-2xl">
          <p class="text-[10px] font-black text-amber-600 uppercase">⏳ 대기</p>
          <p class="text-3xl font-black text-amber-700 mt-2">${pending.length}건</p>
        </div>
        <div class="bg-green-50 border-2 border-green-200 p-5 rounded-2xl">
          <p class="text-[10px] font-black text-green-600 uppercase">✅ 승인</p>
          <p class="text-3xl font-black text-green-700 mt-2">${all.filter(r=>r.status==='approved').length}건</p>
        </div>
        <div class="bg-red-50 border-2 border-red-200 p-5 rounded-2xl">
          <p class="text-[10px] font-black text-red-600 uppercase">❌ 반려</p>
          <p class="text-3xl font-black text-red-700 mt-2">${all.filter(r=>r.status==='rejected').length}건</p>
        </div>
      </div>
      
      ${all.length === 0 ? UI.Empty('inbox', '요청이 없습니다', '매니저/실장이 정보 변경을 요청하면 여기에 표시됩니다') : `
        <div class="space-y-4">
          ${all.map(r => {
            const sc = {
              pending: 'bg-amber-50 border-amber-300',
              approved: 'bg-green-50 border-green-300',
              rejected: 'bg-red-50 border-red-300'
            }[r.status] || 'bg-slate-50 border-slate-200';
            const st = {
              pending: '⏳ 대기',
              approved: '✅ 승인',
              rejected: '❌ 반려'
            }[r.status];
            const stBadge = {
              pending: 'bg-amber-500 text-white',
              approved: 'bg-green-500 text-white',
              rejected: 'bg-red-500 text-white'
            }[r.status];
            const lbl = { name: '이름', contact: '연락처', email: '이메일', pw: '비밀번호' };
            return `
              <div class="${sc} border-2 rounded-2xl p-5">
                <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div class="flex items-center gap-3">
                    <span class="px-3 py-1 ${stBadge} rounded-full font-black text-xs">${st}</span>
                    <p class="font-black text-lg">${r.userName}</p>
                  </div>
                  <span class="text-xs text-slate-500 font-bold">${r.requestedAt}</span>
                </div>
                <div class="bg-white p-4 rounded-xl mb-4">
                  <p class="text-[10px] font-black text-slate-400 uppercase mb-2">변경 내용</p>
                  ${Object.keys(r.changes || {}).map(k => {
                    const ov = k === 'pw' ? '****' : (r.original?.[k] || '(없음)');
                    const nv = k === 'pw' ? '****' : r.changes[k];
                    return `
                      <div class="flex items-center gap-2 text-sm py-1.5">
                        <span class="font-black w-20 text-slate-600">${lbl[k] || k}:</span>
                        <span class="text-slate-400 line-through">${ov}</span>
                        <i data-lucide="arrow-right" class="w-3 h-3 text-blue-500"></i>
                        <span class="text-blue-600 font-black">${nv}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
                ${r.reason ? `<div class="bg-red-50 border border-red-200 rounded-xl p-3 mb-3"><p class="text-xs font-black text-red-700">📝 반려 사유: ${r.reason}</p></div>` : ''}
                ${r.status === 'pending' ? `
                  <div class="flex gap-2">
                    <button onclick="router.approveReq(${r.id})" class="flex-1 bg-green-500 text-white py-3 rounded-xl font-black hover:bg-green-600 transition">✅ 승인</button>
                    <button onclick="router.rejectReq(${r.id})" class="flex-1 bg-red-500 text-white py-3 rounded-xl font-black hover:bg-red-600 transition">❌ 반려</button>
                  </div>
                ` : `<p class="text-xs text-slate-400 font-bold">처리: ${r.processedAt || '-'} · 처리자: ${r.processedBy || '-'}</p>`}
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;
    lucide.createIcons();
  }

  async approveReq(id) {
    if (!confirm('이 요청을 승인하시겠습니까?')) return;
    showLoading(true);
    try {
      await store.approveProfileChange(id);
      toast('승인 완료', 'success');
      await this.renderAdminTab();
      this.renderAdminNav();
    } catch(e) {
      toast('실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  async rejectReq(id) {
    const reason = prompt('반려 사유를 입력하세요 (선택)') || '';
    showLoading(true);
    try {
      await store.rejectProfileChange(id, reason);
      toast('반려 처리됨', 'warning');
      await this.renderAdminTab();
      this.renderAdminNav();
    } catch(e) {
      toast('실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
    admSecurity(c) {
    const s = store.securitySettings || {
      sessionTimeoutMin: 30,
      require2FA: false,
      minPasswordLength: 4,
      passwordRequireSpecial: false,
      ipTracking: true
    };
    
    c.innerHTML = `
      <div class="mb-6">
        <h2 class="text-3xl font-black">🔒 보안 설정</h2>
        <p class="text-slate-500 mt-1">세션 관리 · 비밀번호 정책 · IP 추적 · 2단계 인증</p>
      </div>
      
      <form id="secForm" class="space-y-5">
        <div class="bg-white border-2 rounded-2xl p-6">
          <h3 class="font-black mb-4 flex items-center gap-2">
            <i data-lucide="clock" class="w-5 h-5"></i>세션 자동 로그아웃
          </h3>
          <div>
            <label class="text-xs font-black text-slate-500 uppercase">미사용 시간 (분)</label>
            <input type="number" name="sessionTimeoutMin" value="${s.sessionTimeoutMin || 30}" min="5" max="240" class="w-full p-4 border-2 rounded-xl text-2xl font-black mt-1">
            <p class="text-[10px] text-slate-400 mt-2">💡 설정 시간 동안 마우스/키보드 입력이 없으면 자동 로그아웃</p>
          </div>
        </div>
        
        <div class="bg-white border-2 rounded-2xl p-6">
          <h3 class="font-black mb-4 flex items-center gap-2">
            <i data-lucide="key" class="w-5 h-5"></i>비밀번호 정책
          </h3>
          <div class="grid grid-cols-2 gap-4 mobile-stack">
            <div>
              <label class="text-xs font-black text-slate-500 uppercase">최소 길이</label>
              <input type="number" name="minPasswordLength" value="${s.minPasswordLength || 4}" min="4" max="20" class="w-full p-4 border-2 rounded-xl font-bold mt-1">
            </div>
            <div class="flex items-center">
              <label class="flex items-center gap-3 cursor-pointer p-3 hover:bg-slate-50 rounded-lg w-full">
                <input type="checkbox" name="passwordRequireSpecial" ${s.passwordRequireSpecial ? 'checked' : ''} class="w-5 h-5">
                <span class="font-bold text-sm">특수문자 1개 이상 포함</span>
              </label>
            </div>
          </div>
        </div>
        
        <div class="bg-white border-2 rounded-2xl p-6">
          <h3 class="font-black mb-4 flex items-center gap-2">
            <i data-lucide="globe" class="w-5 h-5"></i>활동 추적
          </h3>
          <label class="flex items-center gap-3 cursor-pointer p-3 hover:bg-slate-50 rounded-lg">
            <input type="checkbox" name="ipTracking" ${s.ipTracking ? 'checked' : ''} class="w-5 h-5">
            <span class="font-bold text-sm">IP 주소 자동 기록 (로그인/로그아웃 시)</span>
          </label>
          <p class="text-[10px] text-slate-400 mt-2">💡 비정상 접속 감지에 도움 · 로그 관리에서 확인 가능</p>
        </div>
        
        <div class="bg-white border-2 rounded-2xl p-6">
          <h3 class="font-black mb-4 flex items-center gap-2">
            <i data-lucide="shield-check" class="w-5 h-5"></i>2단계 인증 (전체 적용)
          </h3>
          <label class="flex items-center gap-3 cursor-pointer p-3 hover:bg-slate-50 rounded-lg">
            <input type="checkbox" name="require2FA" ${s.require2FA ? 'checked' : ''} class="w-5 h-5">
            <span class="font-bold text-sm">로그인 시 2단계 인증 코드 요구</span>
          </label>
          <p class="text-[10px] text-slate-400 mt-2">💡 활성화 후 이용자 관리에서 각 사용자의 OTP 시크릿 설정 필요</p>
        </div>
        
        <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 text-xs font-bold text-amber-700">
          ⚠️ 보안 설정은 즉시 적용됩니다 · 모든 사용자에게 영향
        </div>
        
        <button type="submit" class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">💾 보안 설정 저장</button>
      </form>
    `;
    
    document.getElementById('secForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = {
        sessionTimeoutMin: +fd.get('sessionTimeoutMin') || 30,
        minPasswordLength: +fd.get('minPasswordLength') || 4,
        passwordRequireSpecial: !!fd.get('passwordRequireSpecial'),
        ipTracking: !!fd.get('ipTracking'),
        require2FA: !!fd.get('require2FA')
      };
      showLoading(true);
      try {
        await store.saveSecuritySettings(d);
        if (store.startSessionTimer) store.startSessionTimer();
        toast('✅ 보안 설정 저장됨', 'success');
        await this.renderAdminTab();
      } catch(err) {
        toast('실패: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
    lucide.createIcons();
  }
        admBackup(c) {
    const savedUrl = localStorage.getItem('qj_gsheet_lastUrl') || '';
    c.innerHTML = `
      <div class="mb-6">
        <h2 class="text-3xl font-black">💾 백업 / 복원 / AI 동기화</h2>
        <p class="text-slate-500 mt-1">데이터 백업 + Google Sheets AI 자동 동기화</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mobile-stack mb-6">
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl">
          <h3 class="font-black text-lg mb-3 flex items-center gap-2"><i data-lucide="download" class="w-5 h-5"></i>📥 백업 다운로드</h3>
          <div class="bg-white/10 p-3 rounded-xl mb-4 text-xs space-y-1">
            <div class="flex justify-between"><span>매물:</span><b>${(store.properties||[]).length}개</b></div>
            <div class="flex justify-between"><span>예약:</span><b>${(store.bookings||[]).length}건</b></div>
            <div class="flex justify-between"><span>지출:</span><b>${(store.expenses||[]).length}건</b></div>
          </div>
          <button onclick="router.exportBackup()" class="w-full bg-white text-blue-600 py-3 rounded-xl font-black uppercase">💾 JSON 다운로드</button>
        </div>

        <div class="bg-gradient-to-br from-amber-500 to-orange-600 text-white p-6 rounded-2xl">
          <h3 class="font-black text-lg mb-3 flex items-center gap-2"><i data-lucide="upload" class="w-5 h-5"></i>📤 백업 복원</h3>
          <p class="text-xs opacity-90 mb-4">⚠️ 기존 데이터가 덮어쓰기됩니다.</p>
          <label class="block">
            <input type="file" id="backupFile" accept=".json" class="hidden">
            <div class="bg-white text-amber-700 py-3 rounded-xl font-black uppercase text-center cursor-pointer">📂 JSON 파일 선택</div>
          </label>
        </div>
      </div>

      <div class="bg-gradient-to-br from-purple-600 via-pink-600 to-rose-600 text-white p-6 rounded-2xl mb-6 shadow-2xl">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 class="font-black text-2xl flex items-center gap-2"><i data-lucide="sparkles" class="w-7 h-7"></i>🤖 AI 스마트 동기화</h3>
            <p class="text-sm opacity-90 mt-1">URL 한 번 입력으로 AI가 자동 분석·매핑·비교까지 처리</p>
          </div>
          <span class="bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-black">Gemini 2.0 Flash</span>
        </div>

        <div class="bg-white/10 backdrop-blur rounded-xl p-4 mb-4">
          <p class="text-xs font-black uppercase opacity-80 mb-2">🔄 처리 단계</p>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div class="bg-white/10 rounded-lg p-2 text-center"><p class="font-black">1️⃣</p><p class="opacity-90">플랫폼 분석</p></div>
            <div class="bg-white/10 rounded-lg p-2 text-center"><p class="font-black">2️⃣</p><p class="opacity-90">시트 접근</p></div>
            <div class="bg-white/10 rounded-lg p-2 text-center"><p class="font-black">3️⃣</p><p class="opacity-90">AI 매핑</p></div>
            <div class="bg-white/10 rounded-lg p-2 text-center"><p class="font-black">4️⃣</p><p class="opacity-90">변환</p></div>
            <div class="bg-white/10 rounded-lg p-2 text-center"><p class="font-black">5️⃣</p><p class="opacity-90">비교/적용</p></div>
          </div>
        </div>

        <div class="space-y-3">
          <input type="text" id="gsUrl" value="${savedUrl}" placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..." class="w-full p-4 rounded-xl font-mono text-sm text-slate-900">
          <button onclick="router.runSmartSync()" class="w-full bg-white text-purple-700 py-4 rounded-xl font-black uppercase text-base hover:shadow-2xl transition flex items-center justify-center gap-2">
            <i data-lucide="zap" class="w-5 h-5"></i>🚀 AI 자동 동기화 시작
          </button>
        </div>

        <div class="bg-white/10 rounded-xl p-3 mt-3 text-xs opacity-90">
          💡 <b>사전 준비</b>: Google Sheet → "공유" → "링크가 있는 모든 사용자: 뷰어"로 설정
        </div>
      </div>

      <div id="syncResult"></div>
    `;

    document.getElementById('backupFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('⚠️ 현재 데이터가 덮어쓰기됩니다. 계속?')) return;
      showLoading(true);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const restored = await store.importBackup(data);
        toast(`✅ ${restored}개 컬렉션 복원`, 'success');
        await store.loadAll();
        await this.renderAdmin();
      } catch(err) { toast('실패: ' + err.message, 'error'); }
      finally { showLoading(false); }
    };
    lucide.createIcons();
  }
    // ===== [v3.3] AI 스마트 동기화 실행 =====
  async runSmartSync() {
    const url = document.getElementById('gsUrl').value.trim();
    if (!url) { toast('Google Sheet URL을 입력하세요', 'error'); return; }

    localStorage.setItem('qj_gsheet_lastUrl', url);
    const resultEl = document.getElementById('syncResult');

    // 진행 상태 표시
    resultEl.innerHTML = `
      <div class="bg-white border-2 rounded-2xl p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p class="font-black text-lg">🤖 AI 분석 중...</p>
            <p class="text-xs text-slate-500 font-bold mt-1">최대 30초 소요됩니다</p>
          </div>
        </div>
        <div id="syncLog" class="space-y-1 text-xs font-mono bg-slate-50 p-3 rounded-xl max-h-48 overflow-y-auto"></div>
      </div>
    `;

    const logEl = document.getElementById('syncLog');
    const addLog = (msg) => {
      logEl.innerHTML += `<div class="text-slate-700">${msg}</div>`;
      logEl.scrollTop = logEl.scrollHeight;
    };

    addLog('▶ 요청 전송 중...');

    try {
      const result = await API.gsheetSmart(
        url,
        store.properties || [],
        store.bookings || [],
        store.expenses || []
      );

      if (!result.success) throw new Error(result.error || 'AI 분석 실패');

      // 서버 로그 표시
      logEl.innerHTML = '';
      (result.log || []).forEach(l => {
        const stepIcon = ['🔍', '🌐', '🤖', '🔄', '🔍'][l.step - 1] || '▶';
        addLog(`<span class="text-purple-600 font-black">[${l.step}] ${stepIcon}</span> ${l.msg} <span class="text-slate-400">(${l.time}ms)</span>`);
      });

      this._smartSyncResult = result;
      this._renderSmartSyncResult(result);
    } catch (e) {
      resultEl.innerHTML = `
        <div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6">
          <h3 class="font-black text-red-700 mb-2 flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i>❌ 동기화 실패</h3>
          <p class="text-sm text-red-700 font-bold mb-3">${e.message}</p>
          <details class="bg-white p-3 rounded-xl">
            <summary class="cursor-pointer text-xs font-black text-slate-600">🔍 일반 해결 방법</summary>
            <ul class="text-xs text-slate-600 font-bold mt-2 space-y-1 ml-4 list-disc">
              <li>Google Sheet가 "링크가 있는 모든 사용자: 뷰어"로 공유되었는지 확인</li>
              <li>URL이 정확한지 확인 (gid 포함)</li>
              <li>Netlify 환경변수 GEMINI_API_KEY 등록 여부 확인</li>
              <li>시트에 최소 1행 이상 데이터 존재 여부 확인</li>
            </ul>
          </details>
        </div>
      `;
      lucide.createIcons();
    }
  }

  // ===== [v3.3] AI 분석 결과 렌더링 =====
    _renderSmartSyncResult(r) {
    const resultEl = document.getElementById('syncResult');
    const confColor = { high: 'green', medium: 'amber', low: 'red' }[r.confidence] || 'slate';
    const confLabel = { high: '높음 ✅', medium: '중간 ⚠️', low: '낮음 ❓' }[r.confidence] || r.confidence;

    let html = `
      <div class="bg-white border-2 rounded-2xl p-6 mb-4">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div class="flex items-center gap-3">
            <i data-lucide="check-circle" class="w-8 h-8 text-green-500"></i>
            <div>
              <h3 class="font-black text-xl">✅ AI 분석 완료</h3>
              <p class="text-xs text-slate-500 font-bold">${r.duration}ms · ${r.provider}</p>
            </div>
          </div>
          <span class="px-3 py-1 bg-${confColor}-100 text-${confColor}-700 rounded-full text-xs font-black">신뢰도: ${confLabel}</span>
        </div>

        <div class="bg-blue-50 p-4 rounded-xl mb-4">
          <p class="text-xs font-black text-blue-700 uppercase mb-1">🎯 감지된 데이터 타입</p>
          <p class="font-black text-lg">${r.typeLabel}</p>
          <p class="text-xs text-blue-700 font-bold mt-1">💡 ${r.reason}</p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="bg-slate-50 p-3 rounded-xl text-center"><p class="text-[10px] font-black text-slate-500 uppercase">총 행수</p><p class="text-2xl font-black mt-1">${r.stats.totalRows}</p></div>
          <div class="bg-green-50 p-3 rounded-xl text-center border-2 border-green-200"><p class="text-[10px] font-black text-green-600 uppercase">➕ 추가</p><p class="text-2xl font-black text-green-700 mt-1">${r.stats.addCount}</p></div>
          <div class="bg-amber-50 p-3 rounded-xl text-center border-2 border-amber-200"><p class="text-[10px] font-black text-amber-600 uppercase">✏️ 수정</p><p class="text-2xl font-black text-amber-700 mt-1">${r.stats.updateCount}</p></div>
          <div class="bg-slate-100 p-3 rounded-xl text-center"><p class="text-[10px] font-black text-slate-500 uppercase">동일</p><p class="text-2xl font-black text-slate-600 mt-1">${r.stats.unchangedCount}</p></div>
        </div>

        ${r.stats.errorRows ? `<div class="bg-red-50 border-2 border-red-200 rounded-xl p-3 mb-4">
          <p class="font-black text-red-700 text-sm flex items-center gap-2"><i data-lucide="alert-triangle" class="w-4 h-4"></i>⚠️ 오류 ${r.stats.errorRows}건</p>
          <details class="mt-2"><summary class="cursor-pointer text-xs font-bold text-red-600">🔻 오류 상세 보기</summary>
            <div class="bg-white p-2 rounded mt-2 max-h-32 overflow-y-auto text-xs space-y-0.5">${(r.errors||[]).map(e => `<p class="text-red-700">• ${e}</p>`).join('')}</div>
          </details>
        </div>` : ''}

        <details class="bg-slate-50 rounded-xl p-3 mb-4">
          <summary class="cursor-pointer text-sm font-black text-slate-700 flex items-center gap-2"><i data-lucide="columns" class="w-4 h-4"></i>🗺️ AI 컬럼 매핑 결과 (${Object.keys(r.mapping||{}).length}개)</summary>
          <div class="mt-3 space-y-1 text-xs">
            ${Object.entries(r.mapping||{}).map(([k,v]) => `<div class="flex items-center gap-2 bg-white p-2 rounded">
              <span class="font-black text-slate-700 w-24">${k}</span>
              <i data-lucide="arrow-right" class="w-3 h-3 text-slate-400"></i>
              <span class="font-bold text-blue-600">"${v}"</span>
            </div>`).join('')}
          </div>
        </details>
      </div>
    `;

    // 추가될 항목 (편집/삭제 가능)
    if (r.adds && r.adds.length) {
      html += `
        <div class="bg-white border-2 border-green-200 rounded-2xl mb-4 overflow-hidden">
          <div class="bg-green-50 p-4 border-b border-green-200 flex items-center justify-between flex-wrap gap-2">
            <h4 class="font-black text-green-700 flex items-center gap-2"><i data-lucide="plus-circle" class="w-5 h-5"></i>➕ 신규 추가될 항목 (<span id="addCount">${r.adds.length}</span>건)</h4>
            <p class="text-xs text-green-600 font-bold">💡 항목 클릭 → 편집 / 🗑️ → 제외</p>
          </div>
          <div class="max-h-96 overflow-y-auto scrollbar">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 sticky top-0">
                <tr>${this._getDisplayFields(r.type).map(f => `<th class="px-3 py-2 text-left font-black text-slate-500 uppercase text-[10px]">${f.label}</th>`).join('')}<th class="px-3 py-2 w-20"></th></tr>
              </thead>
              <tbody id="addsTable" class="divide-y">
                ${r.adds.map((item, i) => `<tr data-add-idx="${i}" class="hover:bg-green-50/50">
                  ${this._getDisplayFields(r.type).map(f => `<td class="px-3 py-2 truncate max-w-[200px] cursor-pointer" onclick="router.editAddItem(${i})">${this._formatValue(item[f.key])}</td>`).join('')}
                  <td class="px-3 py-2 text-right">
                    <button onclick="router.editAddItem(${i})" class="text-blue-500 hover:bg-blue-100 p-1 rounded" title="편집"><i data-lucide="edit-3" class="w-3 h-3"></i></button>
                    <button onclick="router.removeAddItem(${i})" class="text-red-500 hover:bg-red-100 p-1 rounded" title="제외"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 수정될 항목 (편집/삭제 가능)
    if (r.updates && r.updates.length) {
      html += `
        <div class="bg-white border-2 border-amber-200 rounded-2xl mb-4 overflow-hidden">
          <div class="bg-amber-50 p-4 border-b border-amber-200 flex items-center justify-between flex-wrap gap-2">
            <h4 class="font-black text-amber-700 flex items-center gap-2"><i data-lucide="edit-3" class="w-5 h-5"></i>✏️ 수정될 항목 (<span id="updateCount">${r.updates.length}</span>건)</h4>
            <p class="text-xs text-amber-600 font-bold">💡 항목 클릭 → 편집 / 🗑️ → 제외</p>
          </div>
          <div class="max-h-96 overflow-y-auto scrollbar p-3 space-y-2" id="updatesTable">
            ${r.updates.map((item, i) => `<div data-update-idx="${i}" class="bg-amber-50 rounded-xl p-3 border border-amber-200 hover:border-amber-400 transition">
              <div class="flex items-center justify-between mb-2 gap-2">
                <p class="font-black text-sm flex-1 cursor-pointer hover:text-blue-600" onclick="router.editUpdateItem(${i})">${this._getItemTitle(item, r.type)}</p>
                <div class="flex gap-1 flex-shrink-0">
                  <button onclick="router.editUpdateItem(${i})" class="text-blue-500 hover:bg-blue-100 p-1.5 rounded" title="편집"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                  <button onclick="router.removeUpdateItem(${i})" class="text-red-500 hover:bg-red-100 p-1.5 rounded" title="제외"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
              </div>
              <div class="space-y-1 text-xs">
                ${(item._changes||[]).map(c => `<div class="flex items-center gap-2 bg-white p-2 rounded">
                  <span class="font-black text-slate-700 w-20">${c.field}:</span>
                  <span class="text-red-500 line-through truncate max-w-[150px]">${this._formatValue(c.from)}</span>
                  <i data-lucide="arrow-right" class="w-3 h-3 text-amber-500 flex-shrink-0"></i>
                  <span class="text-green-600 font-bold truncate max-w-[150px]">${this._formatValue(c.to)}</span>
                </div>`).join('')}
              </div>
            </div>`).join('')}
          </div>
        </div>
      `;
    }

    // 적용/취소 버튼
    if ((r.adds && r.adds.length) || (r.updates && r.updates.length)) {
      html += `
        <div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white p-5 rounded-2xl">
          <p class="font-black text-lg mb-2">🚀 변경사항 적용 준비 완료</p>
          <p class="text-sm opacity-90 mb-4">총 <b id="finalAddCount">${r.stats.addCount}</b>건 추가 + <b id="finalUpdateCount">${r.stats.updateCount}</b>건 수정이 적용됩니다</p>
          <div class="flex gap-2">
            <button onclick="router.applySmartSync()" class="flex-1 bg-white text-purple-700 py-3 rounded-xl font-black uppercase hover:shadow-xl transition">✅ 적용하기</button>
            <button onclick="router.cancelSmartSync()" class="px-6 bg-white/20 backdrop-blur text-white py-3 rounded-xl font-black uppercase">취소</button>
          </div>
        </div>
      `;
    } else {
      html += `<div class="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 text-center">
        <i data-lucide="check-circle" class="w-10 h-10 text-blue-500 mx-auto mb-2"></i>
        <p class="font-black text-blue-700">✨ 모든 데이터가 이미 최신 상태입니다</p>
      </div>`;
    }

    resultEl.innerHTML = html;
    lucide.createIcons();
  }

  // 표시 필드 정의
  _getDisplayFields(type) {
    return {
      properties: [{key:'name',label:'숙소명'},{key:'group',label:'그룹'},{key:'location',label:'위치'},{key:'price',label:'가격'},{key:'cost',label:'원가'}],
      bookings: [{key:'propName',label:'숙소'},{key:'guest',label:'예약자'},{key:'checkIn',label:'체크인'},{key:'checkOut',label:'체크아웃'},{key:'price',label:'가격'},{key:'platform',label:'플랫폼'}],
      expenses: [{key:'propName',label:'숙소'},{key:'date',label:'날짜'},{key:'category',label:'분류'},{key:'amount',label:'금액'},{key:'memo',label:'메모'}]
    }[type] || [];
  }

  _getItemTitle(item, type) {
    if (type === 'properties') return item.name;
    if (type === 'bookings') {
      const p = store.prop(item.propId);
      return `${p?.name || '?'} - ${item.guest} (${item.checkIn})`;
    }
    if (type === 'expenses') {
      const p = store.prop(item.propId);
      return `${p?.name || '?'} - ${item.category} (${item.date})`;
    }
    return '항목';
  }

  _formatValue(v) {
    if (v === null || v === undefined || v === '') return '<span class="text-slate-300">(비어있음)</span>';
    if (typeof v === 'number') return v.toLocaleString();
    return String(v).slice(0, 50);
  }

  // ===== [v3.3] 변경사항 적용 =====
  async applySmartSync() {
    const r = this._smartSyncResult;
    if (!r) { toast('적용할 데이터가 없습니다', 'error'); return; }

    if (!confirm(`✅ ${r.stats.addCount}건 추가 + ${r.stats.updateCount}건 수정을 적용하시겠습니까?`)) return;

    showLoading(true);
    let added = 0, updated = 0, failed = 0;

    try {
      // 추가
      for (const item of (r.adds || [])) {
        try {
          const cleaned = { ...item };
          delete cleaned._sourceRow;
          delete cleaned.propName;
          
          if (r.type === 'properties') {
            await store.upsertProp(cleaned);
          } else if (r.type === 'bookings') {
            await store.addBooking(cleaned);
          } else if (r.type === 'expenses') {
            await store.addExpense(cleaned);
          }
          added++;
        } catch (e) {
          console.error('Add failed:', e);
          failed++;
        }
      }

      // 수정
      for (const item of (r.updates || [])) {
        try {
          const cleaned = { ...item };
          delete cleaned._sourceRow;
          delete cleaned._changes;
          delete cleaned.propName;

          if (r.type === 'properties') {
            await store.upsertProp(cleaned);
          } else if (r.type === 'bookings') {
            await store.updateBooking(item.id, cleaned);
          } else if (r.type === 'expenses') {
            // expenses는 업데이트 메소드가 없으므로 삭제 후 추가
            await store.delExpense(item.id);
            await store.addExpense(cleaned);
          }
          updated++;
        } catch (e) {
          console.error('Update failed:', e);
          failed++;
        }
      }

      await store.addLog(`🤖 AI 동기화: ${r.typeLabel} ${added}건 추가, ${updated}건 수정${failed?`, ${failed}건 실패`:''}`, true);
      
      toast(`✅ 적용 완료! 추가 ${added}건, 수정 ${updated}건${failed?`, 실패 ${failed}건`:''}`, 'success');
      this._smartSyncResult = null;
      
      document.getElementById('syncResult').innerHTML = `
        <div class="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-8 rounded-2xl text-center">
          <i data-lucide="check-circle" class="w-16 h-16 mx-auto mb-4"></i>
          <h3 class="text-3xl font-black mb-2">✅ 동기화 완료!</h3>
          <div class="grid grid-cols-3 gap-4 mt-6 max-w-md mx-auto">
            <div class="bg-white/10 p-4 rounded-xl"><p class="text-xs opacity-80">추가</p><p class="text-3xl font-black">${added}</p></div>
            <div class="bg-white/10 p-4 rounded-xl"><p class="text-xs opacity-80">수정</p><p class="text-3xl font-black">${updated}</p></div>
            <div class="bg-white/10 p-4 rounded-xl"><p class="text-xs opacity-80">실패</p><p class="text-3xl font-black">${failed}</p></div>
          </div>
          <button onclick="router.adminTab='${r.type === 'properties' ? 'props' : r.type}';router.renderAdminNav();router.renderAdminTab()" class="mt-6 bg-white text-green-600 px-6 py-3 rounded-xl font-black">${r.typeLabel} 보러가기 →</button>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      toast('적용 실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  cancelSmartSync() {
    this._smartSyncResult = null;
    document.getElementById('syncResult').innerHTML = '';
    toast('취소됨', 'info');
  }
    // ===== [v3.2] Google Sheets URL 파서 =====
  _parseGSheetUrl(url) {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    if (!idMatch) return null;
    return {
      sheetId: idMatch[1],
      gid: gidMatch ? gidMatch[1] : '0',
      csvUrl: `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gidMatch ? gidMatch[1] : '0'}`
    };
  }

  // ===== [v3.2] Google Sheets 데이터 가져오기 =====
  async fetchGSheet() {
    const url = document.getElementById('gsUrl').value.trim();
    const type = document.getElementById('gsType').value;
    if (!url) { toast('URL을 입력하세요', 'error'); return; }

    const parsed = this._parseGSheetUrl(url);
    if (!parsed) { toast('올바른 Google Sheet URL이 아닙니다', 'error'); return; }

    localStorage.setItem('qj_gsheet_lastUrl', url);
    showLoading(true);

    try {
      const res = await fetch(parsed.csvUrl);
      if (!res.ok) {
        throw new Error(res.status === 404 || res.status === 403
          ? '시트에 접근할 수 없습니다. "링크가 있는 모든 사용자: 뷰어"로 공유 설정을 확인하세요.'
          : `HTTP ${res.status}`);
      }
      const csvText = await res.text();

      const wb = XLSX.read(csvText, { type: 'string' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

      if (!rows.length) { toast('데이터가 없습니다', 'error'); return; }

      this._gsRows = rows;
      this._gsType = type;
      this._gsColumns = Object.keys(rows[0]);
      this._gsMapping = this._suggestMapping(this._gsColumns, type);

      this._renderGSheetMapping();
      toast(`✅ ${rows.length}행 로드 완료`, 'success');
    } catch(e) {
      toast('실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // ===== [v3.2] 컬럼 자동 매핑 추천 =====
  _suggestMapping(columns, type) {
    const fieldDictionaries = {
      properties: {
        name: ['숙소명','숙소이름','매물명','이름','name','property','title'],
        group: ['그룹','지역구분','region','group'],
        location: ['위치','지역','동','location'],
        address: ['주소','상세주소','address'],
        price: ['1박가격','가격','판매가','price','1박','요금'],
        cost: ['원가','매입가','cost'],
        manager: ['담당자','매니저','manager']
      },
      bookings: {
        propName: ['숙소','매물','숙소명','property','매물명'],
        guest: ['예약자','이름','고객','guest','name'],
        contact: ['연락처','전화번호','phone','contact','tel'],
        checkIn: ['체크인','입실','checkin','start'],
        checkOut: ['체크아웃','퇴실','checkout','end'],
        price: ['가격','금액','price','amount'],
        platform: ['플랫폼','채널','platform','source'],
        people: ['인원','명수','people','guests'],
        nationality: ['국적','nationality']
      },
      expenses: {
        date: ['날짜','일자','date'],
        propName: ['숙소','매물','property'],
        majorCat: ['대분류','구분','category'],
        category: ['소분류','항목','subcategory','item'],
        amount: ['금액','비용','amount','price'],
        memo: ['메모','내용','note','memo']
      }
    };

    const dict = fieldDictionaries[type] || {};
    const mapping = {};
    Object.keys(dict).forEach(field => {
      const keywords = dict[field];
      const matched = columns.find(col =>
        keywords.some(kw => col.toLowerCase().replace(/\s/g,'').includes(kw.toLowerCase()))
      );
      if (matched) mapping[field] = matched;
    });
    return mapping;
  }

  // ===== [v3.2] 컬럼 매핑 UI 렌더링 =====
      _renderGSheetMapping() {
    const fieldLabels = {
      properties: { name:'숙소명*', group:'그룹', location:'위치', address:'주소', price:'1박가격*', cost:'원가', manager:'담당자' },
      bookings: { propName:'숙소명*', guest:'예약자*', contact:'연락처', checkIn:'체크인*', checkOut:'체크아웃*', price:'가격*', platform:'플랫폼', people:'인원', nationality:'국적' },
      expenses: { date:'날짜*', propName:'숙소*', majorCat:'대분류', category:'소분류*', amount:'금액*', memo:'메모' }
    };
    const labels = fieldLabels[this._gsType] || {};
    const fields = Object.keys(labels);
    const cols = this._gsColumns;
    const rowCount = this._gsRows.length;

    let html = `
      <div class="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-4 mb-4">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div class="flex items-center gap-2">
            <i data-lucide="sparkles" class="w-5 h-5 text-purple-600"></i>
            <span class="font-black text-purple-700">🤖 Gemini AI 자동 매핑</span>
          </div>
          <button onclick="router.aiAutoMap()" class="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-xl font-black text-xs hover:shadow-lg transition flex items-center gap-1">
            <i data-lucide="zap" class="w-3 h-3"></i>AI로 자동 매핑
          </button>
        </div>
        <p class="text-xs text-purple-700 font-bold">컬럼명과 데이터 내용을 분석해 자동으로 매칭합니다 (1-2초 소요)</p>
      </div>
      
      <div class="bg-white border rounded-2xl p-4 mb-3">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h4 class="font-black text-sm flex items-center gap-2"><i data-lucide="columns" class="w-4 h-4"></i>컬럼 매핑 (총 ${rowCount}행)</h4>
          <span class="text-[10px] text-slate-400 font-bold">*표시 필수</span>
        </div>
        <div id="mappingGrid" class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${fields.map(f => `
            <div class="flex items-center gap-2 bg-slate-50 p-2 rounded-lg">
              <span class="font-black text-xs w-20 flex-shrink-0">${labels[f]}</span>
              <select data-mapfield="${f}" class="flex-1 p-2 border rounded text-xs font-bold min-w-0">
                <option value="">— 사용안함 —</option>
                ${cols.map(c => `<option value="${c}" ${this._gsMapping[f]===c?'selected':''}>${c}</option>`).join('')}
              </select>
            </div>
          `).join('')}
        </div>
      </div>
      
      <details class="bg-white border rounded-2xl mb-3">
        <summary class="p-4 cursor-pointer font-black text-sm flex items-center gap-2"><i data-lucide="eye" class="w-4 h-4"></i>📋 미리보기 (처음 3행) <span class="text-[10px] text-slate-400 font-bold ml-auto">▼ 클릭</span></summary>
        <div class="px-4 pb-4 overflow-x-auto">
          <table class="w-full text-[10px] border-collapse">
            <thead class="bg-slate-100"><tr>${cols.map(c => `<th class="px-2 py-1.5 text-left font-black border whitespace-nowrap">${c}</th>`).join('')}</tr></thead>
            <tbody>${this._gsRows.slice(0,3).map(r => `<tr>${cols.map(c => `<td class="px-2 py-1.5 border truncate max-w-[120px]">${r[c]||'-'}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </details>
      
      <div class="bg-white border rounded-2xl p-4 mb-3">
        <p class="text-xs font-black text-slate-500 uppercase mb-2">⚙️ 옵션</p>
        <div class="flex gap-2 flex-wrap">
          <label class="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer text-xs font-bold flex-1">
            <input type="radio" name="gsMode" value="add" checked>
            <span>➕ 추가만 (중복제외)</span>
          </label>
          <label class="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-blue-50 rounded-lg cursor-pointer text-xs font-bold flex-1">
            <input type="radio" name="gsMode" value="all">
            <span>📥 전체 등록</span>
          </label>
        </div>
      </div>
      
      <div class="grid grid-cols-2 gap-2">
        <button onclick="router.previewGSheetImport()" class="bg-amber-500 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1"><i data-lucide="search" class="w-4 h-4"></i>미리보기</button>
        <button onclick="router.executeGSheetImport()" class="bg-green-600 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1"><i data-lucide="check" class="w-4 h-4"></i>실행</button>
      </div>
    `;

    document.getElementById('gsResult').innerHTML = html;

    document.querySelectorAll('[data-mapfield]').forEach(sel => {
      sel.onchange = (e) => {
        this._gsMapping[e.target.dataset.mapfield] = e.target.value;
      };
    });

    lucide.createIcons();
  }

  // ===== [v3.3] Gemini AI 자동 매핑 =====
  async aiAutoMap() {
    if (!this._gsRows || !this._gsColumns) {
      toast('먼저 시트 데이터를 가져오세요', 'error');
      return;
    }

    showLoading(true);
    try {
      const sampleRows = this._gsRows.slice(0, 3);
      const result = await API.aiMap(this._gsType, this._gsColumns, sampleRows);
      
      if (result.success && result.mapping) {
        this._gsMapping = result.mapping;
        
        // UI 업데이트
        Object.keys(result.mapping).forEach(field => {
          const sel = document.querySelector(`[data-mapfield="${field}"]`);
          if (sel) sel.value = result.mapping[field];
        });
        
        const matched = Object.keys(result.mapping).length;
        toast(`🤖 AI가 ${matched}개 필드를 자동 매핑했습니다 (${result.provider})`, 'success');
      } else {
        toast('AI 매핑 결과를 받지 못했습니다', 'error');
      }
    } catch (e) {
      toast('AI 매핑 실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
    // ===== [v3.2] GSheets 데이터 변환 =====
  _transformGSheetRows() {
    const type = this._gsType;
    const mapping = this._gsMapping;
    const rows = this._gsRows;
    const transformed = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const item = {};
      Object.keys(mapping).forEach(field => {
        const col = mapping[field];
        if (col && row[col] !== undefined) item[field] = String(row[col]).trim();
      });

      try {
        if (type === 'properties') {
          if (!item.name || !item.price) { errors.push(`${idx+2}행: 숙소명/가격 누락`); return; }
          item.price = +item.price.replace(/[^0-9.]/g,'') || 0;
          item.cost = +String(item.cost||0).replace(/[^0-9.]/g,'') || 0;
          item.id = Date.now() + idx;
          item.status = 'empty';
          item.images = [];
          if (item.manager) {
            const mgr = store.users.find(u => u.name === item.manager || u.id === item.manager);
            item.manager = mgr ? mgr.id : '';
          }
        } else if (type === 'bookings') {
          if (!item.guest || !item.checkIn || !item.checkOut || !item.price) { errors.push(`${idx+2}행: 필수 항목 누락`); return; }
          const prop = store.properties.find(p => p.name === item.propName);
          if (!prop) { errors.push(`${idx+2}행: 매물 "${item.propName}" 없음`); return; }
          item.propId = prop.id;
          delete item.propName;
          item.price = +String(item.price).replace(/[^0-9.]/g,'') || 0;
          item.people = +(item.people||2);
          item.platform = item.platform || '직접예약';
          item.nationality = item.nationality || '한국';
          item.checkIn = this._normalizeDate(item.checkIn);
          item.checkOut = this._normalizeDate(item.checkOut);
          item.id = Date.now() + idx;
        } else if (type === 'expenses') {
          if (!item.amount || !item.category) { errors.push(`${idx+2}행: 금액/분류 누락`); return; }
          const prop = store.properties.find(p => p.name === item.propName);
          if (!prop) { errors.push(`${idx+2}행: 매물 "${item.propName}" 없음`); return; }
          item.propId = prop.id;
          delete item.propName;
          item.amount = +String(item.amount).replace(/[^0-9.-]/g,'') || 0;
          item.date = this._normalizeDate(item.date) || todayStr();
          item.majorCat = item.majorCat || '변동지출';
          item.id = Date.now() + idx;
        }
        transformed.push(item);
      } catch(e) {
        errors.push(`${idx+2}행: ${e.message}`);
      }
    });

    return { transformed, errors };
  }

  // ===== [v3.2] 날짜 정규화 =====
  _normalizeDate(s) {
    if (!s) return '';
    s = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    const m2 = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
    if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
    if (/^\d+$/.test(s) && +s > 30000 && +s < 80000) {
      const d = new Date((+s - 25569) * 86400 * 1000);
      return d.toISOString().split('T')[0];
    }
    return s;
  }

  // ===== [v3.2] GSheets 변환 미리보기 =====
  previewGSheetImport() {
    const { transformed, errors } = this._transformGSheetRows();
    openModal('🔍 변환 미리보기', `
      <div class="bg-blue-50 p-4 rounded-xl mb-4">
        <p class="font-black text-blue-700">✅ 정상 변환: <b>${transformed.length}건</b></p>
        ${errors.length ? `<p class="font-black text-red-600 mt-1">⚠️ 오류: <b>${errors.length}건</b></p>` : ''}
      </div>
      ${errors.length ? `<details class="mb-4"><summary class="cursor-pointer text-sm font-black text-red-600">🔻 오류 목록 (${errors.length}건)</summary><div class="bg-red-50 p-3 rounded-xl mt-2 max-h-48 overflow-y-auto text-xs">${errors.map(e=>`<p>• ${e}</p>`).join('')}</div></details>` : ''}
      <div class="bg-slate-50 rounded-xl p-4">
        <p class="text-xs font-black text-slate-500 uppercase mb-2">변환된 데이터 (처음 3건)</p>
        <pre class="text-[10px] overflow-x-auto bg-white p-3 rounded-lg max-h-64 overflow-y-auto">${JSON.stringify(transformed.slice(0,3), null, 2)}</pre>
      </div>
    `, 'max-w-3xl');
  }

  // ===== [v3.2] GSheets 실행 (DB 저장) =====
  async executeGSheetImport() {
    const { transformed, errors } = this._transformGSheetRows();
    if (!transformed.length) { toast('가져올 데이터가 없습니다', 'error'); return; }

    const mode = document.querySelector('input[name="gsMode"]:checked').value;
    const type = this._gsType;

    if (!confirm(`${transformed.length}건을 ${type === 'properties' ? '매물' : type === 'bookings' ? '예약' : '지출'}로 등록하시겠습니까?\n${errors.length ? `(오류 ${errors.length}건은 건너뜀)` : ''}`)) return;

    showLoading(true);
    let added = 0, skipped = 0;

    try {
      for (const item of transformed) {
        if (mode === 'add') {
          if (type === 'properties' && store.properties.find(p => p.name === item.name)) { skipped++; continue; }
          if (type === 'bookings' && store.bookings.find(b => b.propId === item.propId && b.checkIn === item.checkIn && b.guest === item.guest)) { skipped++; continue; }
          if (type === 'expenses' && store.expenses.find(e => e.propId === item.propId && e.date === item.date && e.amount === item.amount && e.category === item.category)) { skipped++; continue; }
        }

        if (type === 'properties') await store.upsertProp(item);
        else if (type === 'bookings') await store.addBooking(item);
        else if (type === 'expenses') await store.addExpense(item);
        added++;
      }

      await store.addLog(`📊 Google Sheets 가져오기: ${type} ${added}건 추가${skipped ? `, ${skipped}건 건너뜀` : ''}`, true);
      toast(`✅ ${added}건 추가${skipped ? ` · ${skipped}건 건너뜀` : ''}`, 'success');

      document.getElementById('gsResult').innerHTML = `
        <div class="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-8 rounded-2xl text-center">
          <i data-lucide="check-circle" class="w-16 h-16 mx-auto mb-4"></i>
          <h3 class="text-3xl font-black mb-2">✅ 가져오기 완료</h3>
          <div class="grid grid-cols-3 gap-4 mt-6 max-w-md mx-auto">
            <div class="bg-white/10 p-4 rounded-xl"><p class="text-xs opacity-80">추가됨</p><p class="text-3xl font-black">${added}</p></div>
            <div class="bg-white/10 p-4 rounded-xl"><p class="text-xs opacity-80">건너뜀</p><p class="text-3xl font-black">${skipped}</p></div>
            <div class="bg-white/10 p-4 rounded-xl"><p class="text-xs opacity-80">오류</p><p class="text-3xl font-black">${errors.length}</p></div>
          </div>
          <button onclick="router.adminTab='${type === 'properties' ? 'props' : type}';router.renderAdminNav();router.renderAdminTab()" class="mt-6 bg-white text-green-600 px-6 py-3 rounded-xl font-black">${type === 'properties' ? '매물' : type === 'bookings' ? '예약' : '지출'} 보러가기 →</button>
        </div>
      `;
      lucide.createIcons();
    } catch(e) {
      toast('실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
  async exportBackup() {
    showLoading(true);
    try {
      const backup = await store.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QJ-PMS-Backup-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('💾 백업 다운로드 완료', 'success');
    } catch(e) {
      toast('실패: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
    admChats(c) {
    if (!store.properties || !store.properties.length) {
      c.innerHTML = `<h2 class="text-3xl font-black mb-6">💬 채팅 관리</h2>${UI.Empty('message-square','매물이 없습니다','매물 등록 후 사용 가능합니다')}`;
      return;
    }
    
    const mode = this.admChatsMode || 'list';
    const totalChats = (store.chats || []).length;
    const recentProps = store.properties.filter(p => (store.chats || []).some(c => c.propId === p.id));
    
    c.innerHTML = `
      <div class="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h2 class="text-3xl font-black">💬 채팅 관리</h2>
          <p class="text-slate-500 mt-1">매물별 특이사항 채팅 통합 관리 (총 ${totalChats}개 메시지)</p>
        </div>
        <div class="bg-slate-100 rounded-xl p-1 flex">
          <button onclick="router.admChatsMode='list';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${mode==='list'?'bg-white shadow':'text-slate-500'}">📋 리스트</button>
          <button onclick="router.admChatsMode='integrated';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${mode==='integrated'?'bg-white shadow':'text-slate-500'}">📊 통합</button>
        </div>
      </div>
      
      <div class="grid grid-cols-3 gap-4 mb-6 mobile-stack">
        <div class="bg-white p-5 rounded-2xl border">
          <p class="text-[10px] font-black text-slate-400 uppercase">총 매물</p>
          <p class="text-2xl font-black mt-2">${store.properties.length}개</p>
        </div>
        <div class="bg-white p-5 rounded-2xl border">
          <p class="text-[10px] font-black text-slate-400 uppercase">대화 진행 중</p>
          <p class="text-2xl font-black text-green-600 mt-2">${recentProps.length}개</p>
        </div>
        <div class="bg-white p-5 rounded-2xl border">
          <p class="text-[10px] font-black text-slate-400 uppercase">총 메시지</p>
          <p class="text-2xl font-black text-blue-600 mt-2">${totalChats}건</p>
        </div>
      </div>
    `;
    
    if (mode === 'integrated') {
      c.innerHTML += `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mobile-stack">${store.properties.map(p => {
        const ch = (store.chats || []).filter(x => x.propId === p.id);
        return `
          <div class="bg-white p-4 rounded-2xl border">
            <h4 class="font-black mb-3 flex items-center gap-2 truncate">
              ${p.name}
              ${ch.length ? '<span class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>' : ''}
            </h4>
            <div class="h-60 overflow-y-auto scrollbar bg-slate-50 rounded-xl p-3 space-y-2 mb-2">
              ${ch.length ? ch.slice(-5).map(c => `
                <div>
                  <p class="text-[9px] font-black text-slate-400">${c.sender} · ${c.time?.slice(5,16) || ''}</p>
                  <p class="text-xs font-bold mt-0.5">${c.message}</p>
                </div>
              `).join('') : '<p class="text-xs text-slate-400 text-center py-10">대화 없음</p>'}
            </div>
            <button onclick="router.showChatBox(${p.id})" class="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-black hover:bg-blue-700 transition">
              💬 입장 & 멘트 작성
            </button>
          </div>
        `;
      }).join('')}</div>`;
    } else {
      // 리스트 모드
      c.innerHTML += `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mobile-stack">${store.properties.map(p => {
        const ch = (store.chats || []).filter(x => x.propId === p.id);
        const last = ch[ch.length - 1];
        const img = p.image || (p.images && p.images[p.mainImage || 0]) || 'https://via.placeholder.com/64';
        return `
          <div onclick="router.showChatBox(${p.id})" class="bg-white p-5 rounded-2xl border hover:shadow-xl cursor-pointer flex items-center gap-4 transition">
            <img src="${img}" class="w-16 h-16 rounded-xl object-cover flex-shrink-0" onerror="this.src='https://via.placeholder.com/64'">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-black truncate">${p.name}</p>
                ${ch.length ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-black flex-shrink-0">최근 대화</span>' : ''}
              </div>
              <p class="text-xs text-slate-500 truncate mt-1">
                ${last ? `<b>${last.sender}:</b> ${last.message}` : '대화 없음'}
              </p>
              <p class="text-[10px] text-slate-400 font-bold mt-1">
                ${last ? last.time : ''} · ${ch.length}개 메시지
              </p>
            </div>
            <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300 flex-shrink-0"></i>
          </div>
        `;
      }).join('')}</div>`;
    }
    
    lucide.createIcons();
  }
  admLogs(c) {
    const allLogs = store.logs || [];
    const specials = allLogs.filter(l => l.special);
    const today = todayStr();
    const todayLogs = allLogs.filter(l => l.time && l.time.startsWith(today));
    
    c.innerHTML = `
      <div class="mb-6">
        <h2 class="text-3xl font-black">📋 로그 관리</h2>
        <p class="text-slate-500 mt-1">시스템 활동 이력 및 특이사항 모니터링 (최대 500건)</p>
      </div>
      
      <div class="grid grid-cols-3 gap-4 mb-6 mobile-stack">
        <div class="bg-white p-5 rounded-2xl border">
          <p class="text-[10px] font-black text-slate-400 uppercase">전체 로그</p>
          <p class="text-2xl font-black mt-2">${allLogs.length}건</p>
        </div>
        <div class="bg-red-50 border-2 border-red-200 p-5 rounded-2xl">
          <p class="text-[10px] font-black text-red-600 uppercase">특이사항</p>
          <p class="text-2xl font-black text-red-700 mt-2">${specials.length}건</p>
        </div>
        <div class="bg-blue-50 border-2 border-blue-200 p-5 rounded-2xl">
          <p class="text-[10px] font-black text-blue-600 uppercase">오늘 활동</p>
          <p class="text-2xl font-black text-blue-700 mt-2">${todayLogs.length}건</p>
        </div>
      </div>
      
      ${specials.length ? `
        <div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6 mb-6">
          <h3 class="font-black text-red-700 mb-3 flex items-center gap-2">
            <i data-lucide="alert-triangle" class="w-5 h-5"></i>
            🚨 특이사항 (최근 10건)
          </h3>
          <div class="space-y-2">
            ${specials.slice(0, 10).map(l => `
              <div class="bg-white p-3 rounded-lg flex items-start gap-3">
                <span class="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0"></span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-black text-red-700">${l.message}</p>
                  <p class="text-[10px] text-slate-400 font-bold mt-1">${l.time} · ${l.user || 'System'}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <div class="bg-white rounded-2xl border overflow-hidden">
        <div class="p-5 border-b bg-slate-50 flex justify-between items-center flex-wrap gap-2">
          <h3 class="font-black text-sm uppercase">📜 전체 활동 로그</h3>
          <span class="text-xs text-slate-400 font-bold">최신순 표시 (최대 100건)</span>
        </div>
        <div class="divide-y max-h-[600px] overflow-y-auto scrollbar">
          ${allLogs.length === 0 ? UI.Empty('list-checks', '로그가 없습니다') : allLogs.slice(0, 100).map(l => `
            <div class="p-4 flex items-center gap-3 hover:bg-slate-50 ${l.special ? 'bg-red-50/30' : ''}">
              <div class="w-2 h-2 rounded-full ${l.special ? 'bg-red-500' : 'bg-slate-300'} flex-shrink-0"></div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold">${l.message}</p>
                <p class="text-[10px] text-slate-400 font-bold mt-0.5">${l.time} · ${l.user || 'System'}</p>
              </div>
              ${l.special ? '<span class="px-2 py-0.5 bg-red-500 text-white rounded text-[9px] font-black flex-shrink-0">특이</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    lucide.createIcons();
  }

}

window.Router = Router;