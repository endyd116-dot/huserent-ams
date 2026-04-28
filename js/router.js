class Router {
  constructor() {
    window.router = this;
    this.adminTab = 'main';
    this.expenseMode = 'integrated';
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
    const fn = {home:this.renderHome, admin:this.renderAdmin, chat:this.renderChat}[r];
    if (fn) await fn.call(this, p);
    lucide.createIcons();
    window.scrollTo(0,0);
  }

  async logout() {
    await store.logout();
    location.hash = '';
    this.renderLogin();
  }

  renderLogin() {
    document.getElementById('app-root').innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
        <div class="w-full max-w-md bg-white rounded-3xl p-10 shadow-2xl fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-5"><i data-lucide="building-2" class="text-white w-10 h-10"></i></div>
            <h2 class="text-3xl font-black">QJ-PropMS</h2>
            <p class="text-slate-400 text-sm mt-2 font-medium">하이브리드 단기렌트 통합 관리</p>
          </div>
          <form id="login-form" class="space-y-4">
            <input type="text" id="uid" placeholder="ID" class="w-full px-5 py-4 rounded-2xl border focus:ring-4 focus:ring-blue-100 outline-none font-bold text-sm">
            <input type="password" id="upw" placeholder="Password" class="w-full px-5 py-4 rounded-2xl border focus:ring-4 focus:ring-blue-100 outline-none font-bold text-sm">
            <button type="submit" id="login-btn" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-blue-600 transition shadow-lg uppercase tracking-widest text-sm">Access System</button>
          </form>
          <div class="mt-6 p-4 bg-blue-50 rounded-2xl text-[11px] text-blue-700 font-bold">
            <p class="mb-2">🔑 테스트 계정 (PW: 1234)</p>
            <p>admin / manager1 / manager2 / staff1</p>
          </div>
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
        if (this.pendingChat) { const p = this.pendingChat; this.pendingChat = null; this.go('chat',{id:p}); return; }
        await this.go('home');
        toast(`환영합니다, ${store.currentUser.name}`, 'success');
      } else {
        toast('로그인 실패', 'error');
        btn.disabled = false; btn.textContent = 'Access System';
      }
    };
    lucide.createIcons();
  }

  async showNotifications() {
    const list = store.getMyNotifs();
    const ic = {info:'info',success:'check-circle',warning:'alert-triangle',error:'x-circle'};
    const cl = {info:'text-blue-500 bg-blue-50',success:'text-green-500 bg-green-50',warning:'text-amber-500 bg-amber-50',error:'text-red-500 bg-red-50'};
    openModal('🔔 알림 전체보기', `
      <div class="mb-4 flex justify-between items-center">
        <div><p class="text-sm font-black">${store.currentUser.name}님의 알림</p><p class="text-xs text-slate-400 mt-0.5">총 ${list.length}건 · 읽지않음 ${store.getMyUnreadCount()}건</p></div>
        ${list.length?`<button onclick="(async()=>{await store.markAllRead();router.showNotifications()})()" class="text-xs text-blue-600 font-black">모두 읽음</button>`:''}
      </div>
      <div class="space-y-2 max-h-[60vh] overflow-y-auto scrollbar">
        ${list.length?list.map(n=>`<div class="p-4 ${n.read?'bg-slate-50':'bg-white border-l-4 border-blue-500 shadow-sm'} rounded-xl flex items-start gap-3"><div class="w-9 h-9 rounded-lg flex items-center justify-center ${cl[n.type]||cl.info}"><i data-lucide="${ic[n.type]||'bell'}" class="w-4 h-4"></i></div><div class="flex-1"><p class="text-sm ${n.read?'font-medium text-slate-500':'font-bold'}">${n.message}</p><p class="text-[10px] text-slate-400 font-bold mt-1">${n.time}</p></div></div>`).join(''):'<div class="py-16 text-center text-slate-400"><i data-lucide="bell-off" class="w-12 h-12 mx-auto mb-3 text-slate-200"></i><p class="font-bold">알림이 없습니다</p></div>'}
      </div>`, 'max-w-2xl');
    setTimeout(async()=>{ await store.markAllRead(); }, 1500);
  }

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
        ${pending?`<div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3"><i data-lucide="clock" class="w-5 h-5 text-amber-600"></i><div><p class="text-sm font-black text-amber-800">변경 요청 승인 대기 중</p><p class="text-xs text-amber-700 mt-0.5">${pending.requestedAt}</p></div></div>`:''}
        <form id="profile-form" class="space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-bold text-blue-700">정보 변경 시 관리자 승인 후 적용됩니다.</div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">아이디 (변경불가)</label><input value="${u.id}" disabled class="w-full p-3 border rounded-xl font-bold mt-1 bg-slate-100 text-slate-400"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">이름</label><input type="text" name="name" value="${u.name}" class="w-full p-3 border rounded-xl font-bold mt-1" required></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">핸드폰번호</label><input type="text" name="contact" value="${u.contact||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">이메일</label><input type="email" name="email" value="${u.email||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">새 비밀번호</label><input type="password" name="pw" placeholder="비워두면 유지" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
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
        if (d.pw && d.pw !== u.pw) changes.pw = d.pw;
        if (!Object.keys(changes).length) { toast('변경사항 없음','error'); return; }
        await store.requestProfileChange(changes);
        toast('변경 요청 접수! 관리자 승인 대기','success');
        closeModal();
      };
    }
    lucide.createIcons();
  }

  async renderHome() {
    const u = store.currentUser;
    const props = store.properties.filter(p => store.hasPerm(p.id));
    const t = todayStr();
    const stats = {
      occupied: props.filter(p => getBookingForDate(p.id,t)).length,
      empty: props.filter(p => !getBookingForDate(p.id,t) && p.status!=='cleaning').length,
      cleaning: props.filter(p => p.status==='cleaning').length
    };
    const grouped = {};
    props.forEach(p => { const g=p.group||'기타'; if(!grouped[g])grouped[g]=[]; grouped[g].push(p); });
    document.getElementById('app-root').innerHTML = `
      <div class="flex min-h-screen">${UI.Sidebar('home')}
        <main class="flex-1 bg-slate-50 min-h-screen">${UI.Header('대시보드')}
          <div class="p-8 max-w-[1600px] mx-auto">
            <div class="flex justify-between items-end mb-8">
              <div><h2 class="text-3xl font-black">안녕하세요, ${u.name.replace(/\(.*\)/,'')} 👋</h2><p class="text-slate-500 font-medium mt-1">오늘 ${t} · ${props.length}개 숙소</p></div>
              ${u.role==='Admin'?`<button onclick="router.go('admin')" class="bg-amber-500 text-white px-6 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2"><i data-lucide="shield-check" class="w-4 h-4"></i>관리자 오피스</button>`:''}
            </div>
            <div class="grid grid-cols-3 gap-4 mb-8">
              <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">투숙중</p><p class="text-3xl font-black text-blue-600 mt-2">${stats.occupied}</p></div>
              <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">공실</p><p class="text-3xl font-black text-green-500 mt-2">${stats.empty}</p></div>
              <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">청소중</p><p class="text-3xl font-black text-amber-500 mt-2">${stats.cleaning}</p></div>
            </div>
            ${Object.entries(grouped).map(([g,list])=>`<div class="mb-10"><h3 class="text-lg font-black mb-4 flex items-center gap-2"><span class="w-1.5 h-6 bg-blue-600 rounded-full"></span>${g} <span class="text-xs text-slate-400 font-bold">(${list.length})</span></h3><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">${list.map(p=>UI.PropertyCard(p,true)).join('')}</div></div>`).join('')}
          </div>
        </main>
      </div>`;
    lucide.createIcons();
  }

  showPropActions(propId) {
    const p = store.prop(propId);
    const url = `${location.origin}${location.pathname}#chat/${propId}`;
    openModal(`🏠 ${p.name}`, `
      <div class="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div class="md:col-span-2"><img src="${p.image}" class="w-full h-64 object-cover rounded-2xl"><h3 class="text-xl font-black mt-4">${p.name}</h3><p class="text-sm text-slate-500 mt-1">${p.location||''}</p><p class="text-2xl font-black text-blue-600 mt-3">${fmt(p.price)}<span class="text-xs">/박</span></p></div>
        <div class="md:col-span-3 space-y-3">
          <button onclick="router.showBookingCalendar(${propId})" class="w-full bg-slate-900 text-white p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="calendar-check" class="w-6 h-6"></i><div class="text-left flex-1"><p>1. 예약 확인</p><p class="text-xs opacity-60">월별 캘린더</p></div></button>
          ${store.canEdit(propId)?`<button onclick="closeModal();router.showBookingForm(${propId})" class="w-full bg-blue-600 text-white p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="plus-circle" class="w-6 h-6"></i><div class="text-left flex-1"><p>2. 예약 하기</p></div></button>`:''}
          <button onclick="router.showPropDetail(${propId})" class="w-full bg-white border-2 p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="info" class="w-6 h-6"></i><div class="text-left flex-1"><p>3. 세부 정보</p></div></button>
          <button onclick="router.showChatBox(${propId})" class="w-full bg-green-500 text-white p-5 rounded-2xl font-black flex items-center gap-4"><i data-lucide="message-circle" class="w-6 h-6"></i><div class="text-left flex-1"><p>4. 특이사항</p></div></button>
          <div class="bg-blue-50 p-4 rounded-2xl"><p class="text-[10px] font-black text-blue-500 uppercase mb-2">🔗 채팅 링크</p><div class="flex gap-2"><input type="text" readonly value="${url}" class="flex-1 px-3 py-2 rounded-xl bg-white text-xs font-mono border"><button onclick="navigator.clipboard.writeText('${url}');toast('복사됨','success')" class="px-3 py-2 bg-blue-600 text-white rounded-xl"><i data-lucide="copy" class="w-4 h-4"></i></button></div></div>
        </div>
      </div>`, 'max-w-4xl');
    lucide.createIcons();
  }

  showBookingCalendar(propId, y, m) {
    const p = store.prop(propId);
    const now = new Date();
    const year = y ?? now.getFullYear();
    const month = m ?? now.getMonth();
    window._calPropId = propId;
    openModal(`📅 ${p.name}`, `
      <div class="flex justify-between items-center mb-6">
        <div class="flex items-center gap-2">
          <button onclick="router.showBookingCalendar(${propId},${month===0?year-1:year},${month===0?11:month-1})" class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
          <h3 class="text-2xl font-black px-4">${year}년 ${month+1}월</h3>
          <button onclick="router.showBookingCalendar(${propId},${month===11?year+1:year},${month===11?0:month+1})" class="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
        </div>
      </div>
      <div class="bg-slate-50 p-4 rounded-2xl">${buildCalendar(year, month, propId, 'router.onCalendarClick')}</div>`, 'max-w-5xl');
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
    openModal(`${isEdit?'✏️':'🆕'} ${p.name}`, `
      <form id="bk-form" class="space-y-5">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="text-[10px] font-black text-slate-400 uppercase">체크인</label><input type="date" name="checkIn" value="${b.checkIn||prefill||todayStr()}" class="w-full p-3 border rounded-xl font-bold mt-1" required></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase">체크아웃</label><input type="date" name="checkOut" value="${b.checkOut||''}" class="w-full p-3 border rounded-xl font-bold mt-1" required></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <input name="guest" value="${b.guest||''}" placeholder="예약자" class="w-full p-3 border rounded-xl font-bold" required>
          <input name="contact" value="${b.contact||''}" placeholder="연락처" class="w-full p-3 border rounded-xl font-bold" required>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <input name="nationality" value="${b.nationality||'한국'}" placeholder="국적" class="w-full p-3 border rounded-xl font-bold">
          <input type="number" name="people" value="${b.people||2}" min="1" placeholder="인원" class="w-full p-3 border rounded-xl font-bold">
          <select name="platform" class="w-full p-3 border rounded-xl font-bold">${store.platforms.map(pl=>`<option ${b.platform===pl.name?'selected':''}>${pl.name}</option>`).join('')}</select>
        </div>
        <input type="number" name="price" value="${b.price||p.price}" placeholder="최종 가격" class="w-full p-4 border-2 rounded-xl text-2xl font-black text-blue-600" required>
        <textarea name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold h-20">${b.memo||''}</textarea>
        <div class="flex gap-3"><button type="submit" class="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black">${isEdit?'수정':'등록'}</button>${isEdit?`<button type="button" onclick="router.deleteBooking(${booking.id})" class="px-8 bg-red-50 text-red-500 rounded-xl font-black">취소</button>`:''}</div>
      </form>`, 'max-w-3xl');
    document.getElementById('bk-form').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (d.checkIn >= d.checkOut) { toast('체크아웃은 체크인 이후','error'); return; }
      d.propId = propId;
      showLoading(true);
      try {
        if (isEdit) await store.updateBooking(booking.id, d);
        else await store.addBooking(d);
        toast(isEdit?'수정':'등록','success');
        closeModal();
        if (document.querySelector('[data-admin]')) await this.renderAdminTab();
      } catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
    lucide.createIcons();
  }

  async deleteBooking(id) {
    if (!confirm('취소?')) return;
    showLoading(true);
    try { await store.delBooking(id); toast('취소됨','success'); closeModal(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

  showPropDetail(propId) {
    const p = store.prop(propId);
    openModal(`ℹ️ ${p.name}`, `
      <img src="${p.image}" class="w-full h-72 object-cover rounded-2xl mb-6">
      <p class="text-sm bg-slate-50 p-6 rounded-2xl mb-6">${p.description||'-'}</p>
      <div class="grid grid-cols-2 gap-3 text-sm">${[['그룹',p.group],['주소',p.address],['1박',fmt(p.price)],['원가',fmt(p.cost)],['수리',p.repair],['청소',p.cleaning],['가스',p.gas],['인터넷',p.internet]].map(([k,v])=>`<div class="bg-white p-4 rounded-xl border"><p class="text-[10px] font-black text-slate-400 uppercase">${k}</p><p class="font-bold mt-1">${v||'-'}</p></div>`).join('')}</div>`, 'max-w-4xl');
  }

  showChatBox(propId) {
    const p = store.prop(propId);
    const chats = store.chats.filter(c => c.propId === propId);
    const url = `${location.origin}${location.pathname}#chat/${propId}`;
    openModal(`💬 ${p.name}`, `
      <div class="bg-blue-50 p-3 rounded-xl mb-4 flex items-center gap-2 text-xs"><i data-lucide="link" class="w-4 h-4 text-blue-600"></i><code class="flex-1 font-mono text-blue-700">${url}</code><button onclick="navigator.clipboard.writeText('${url}');toast('복사','success')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold">복사</button></div>
      <div id="cb" class="h-96 overflow-y-auto scrollbar bg-slate-50 rounded-2xl p-4 space-y-4 mb-4">${chats.length?chats.map(c=>`<div class="flex flex-col ${c.role==='Admin'?'items-end':'items-start'}"><p class="text-[9px] font-black text-slate-400 mb-1">${c.sender}·${c.time}</p><div class="max-w-[75%] p-3 rounded-2xl text-sm font-medium ${c.role==='Admin'?'bg-slate-900 text-white':c.role==='Manager'?'bg-blue-500 text-white':'bg-white border'}">${c.message}</div></div>`).join(''):'<p class="text-center text-slate-400 py-16">대화 없음</p>'}</div>
      <form id="cf" class="flex gap-2"><input id="ci" class="flex-1 px-4 py-3 bg-slate-100 rounded-xl outline-none font-bold text-sm" placeholder="메시지..."><button class="px-5 bg-blue-600 text-white rounded-xl font-black"><i data-lucide="send" class="w-4 h-4"></i></button></form>`, 'max-w-3xl');
    document.getElementById('cb').scrollTop = 999999;
    document.getElementById('cf').onsubmit = async e => {
      e.preventDefault();
      const i = document.getElementById('ci');
      if (!i.value.trim()) return;
      await store.addChat(propId, i.value.trim());
      this.showChatBox(propId);
    };
    lucide.createIcons();
  }

  async renderChat(params) {
    await this.renderHome();
    setTimeout(() => this.showChatBox(+params.id), 100);
  }

  async renderAdmin() {
    if (store.currentUser.role !== 'Admin') { this.go('home'); return; }
    document.getElementById('app-root').innerHTML = `
      <div class="flex min-h-screen">
        <aside class="w-64 bg-slate-900 text-white p-5 sticky top-0 h-screen overflow-y-auto scrollbar">
          <div class="mb-6 px-2 cursor-pointer" onclick="router.go('home')"><h1 class="text-xl font-black">QJ ADMIN</h1><p class="text-[9px] text-slate-500 font-bold uppercase">← 홈으로</p></div>
          <nav class="space-y-0.5" id="anav"></nav>
        </aside>
        <main class="flex-1 bg-slate-50">${UI.Header('Admin')}<div class="p-8" id="abody" data-admin></div></main>
      </div>`;
    this.renderAdminNav();
    await this.renderAdminTab();
  }

  renderAdminNav() {
    const items = [['main','home','MAIN'],['props','building','매물 관리'],['sales','trending-up','매출 관리'],['expenses','credit-card','지출 관리'],['bookings','calendar','예약 관리'],['users','user-cog','이용자/권한'],['profileReq','user-check','프로필 요청'],['chats','message-square','채팅'],['logs','list-checks','로그'],['etc','package','기타 관리']];
    const pending = store.pendingProfileRequests().length;
    document.getElementById('anav').innerHTML = items.map(([k,i,l])=>`<a onclick="router.adminTab='${k}';router.renderAdminNav();router.renderAdminTab()" class="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer ${this.adminTab===k?'bg-blue-600 text-white font-black':'text-slate-400 hover:bg-white/5'}"><i data-lucide="${i}" class="w-4 h-4"></i><span class="text-xs flex-1">${l}</span>${k==='profileReq'&&pending?`<span class="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">${pending}</span>`:''}</a>`).join('');
    lucide.createIcons();
  }

  async renderAdminTab() {
    const c = document.getElementById('abody');
    if (!c) return;
    const fn = {main:this.admMain, props:this.admProps, sales:this.admSales, expenses:this.admExpenses, bookings:this.admBookings, users:this.admUsers, profileReq:this.admProfileReq, chats:this.admChats, logs:this.admLogs, etc:this.admEtc}[this.adminTab];
    if (fn) fn.call(this, c);
    lucide.createIcons();
  }

  admMain(c) {
    const rev = store.bookings.reduce((s,b)=>s+(+b.price||0),0);
    const cost = store.expenses.reduce((s,e)=>s+(+e.amount||0),0);
    const specials = store.logs.filter(l=>l.special).slice(0,5);
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">📊 운영 현황</h2>
      <div class="grid grid-cols-4 gap-4 mb-8">
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl"><p class="text-[10px] font-black uppercase opacity-70">총매출</p><p class="text-2xl font-black mt-2">${fmt(rev)}</p></div>
        <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">총지출</p><p class="text-2xl font-black text-red-500 mt-2">${fmt(cost)}</p></div>
        <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">순이익</p><p class="text-2xl font-black text-green-600 mt-2">${fmt(rev-cost)}</p></div>
        <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">매물</p><p class="text-2xl font-black mt-2">${store.properties.length}개</p></div>
      </div>
      <div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">🚨 특이사항</h3>${specials.length?specials.map(s=>`<div class="p-3 bg-red-50 rounded-xl mb-2"><p class="text-sm font-bold text-red-700">${s.message}</p><p class="text-[10px] text-slate-400 mt-1">${s.time}</p></div>`).join(''):'<p class="text-slate-400 py-8 text-center">없음</p>'}</div>`;
  }

  admProps(c) {
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">🏠 매물 관리 (${store.properties.length})</h2><button onclick="router.showPropForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규</button></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">${store.properties.map(p=>`<div class="bg-white p-5 rounded-2xl border flex gap-4"><img src="${p.image}" class="w-20 h-20 rounded-xl object-cover"><div class="flex-1 min-w-0"><div class="flex gap-2"><p class="font-black truncate">${p.name}</p>${badge(p.status)}</div><p class="text-[10px] text-slate-400 mt-1">${p.group||'-'} · ${fmt(p.price)}</p></div><div class="flex flex-col gap-1"><button onclick="router.showPropForm(${p.id})" class="p-2 bg-slate-100 rounded-lg"><i data-lucide="edit-3" class="w-4 h-4"></i></button><button onclick="router.delProp(${p.id})" class="p-2 bg-red-50 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></div>`).join('')}</div>`;
  }

  showPropForm(pid=null) {
    const p = pid ? store.prop(pid) : {id:'',name:'',group:store.groups[0]||'서울',location:'',address:'',price:100000,cost:40000,image:'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',description:'',manager:'',repair:'완료',cleaning:'완료',gas:'',internet:'',recycleDay:'',password:'',office:''};
    openModal(pid?'수정':'등록', `<form id="pf" class="space-y-3">
      <div class="grid grid-cols-2 gap-3"><input name="name" value="${p.name}" placeholder="숙소명" class="p-3 border rounded-xl font-bold" required><select name="group" class="p-3 border rounded-xl font-bold">${store.groups.map(g=>`<option ${p.group===g?'selected':''}>${g}</option>`).join('')}</select></div>
      <input name="location" value="${p.location||''}" placeholder="위치" class="w-full p-3 border rounded-xl font-bold">
      <input name="address" value="${p.address||''}" placeholder="주소" class="w-full p-3 border rounded-xl font-bold">
      <div class="grid grid-cols-2 gap-3"><input type="number" name="price" value="${p.price}" placeholder="판매가" class="p-3 border rounded-xl font-black text-blue-600" required><input type="number" name="cost" value="${p.cost}" placeholder="원가" class="p-3 border rounded-xl font-black text-slate-500" required></div>
      <input name="image" value="${p.image||''}" placeholder="이미지 URL" class="w-full p-3 border rounded-xl font-bold">
      <textarea name="description" placeholder="세부사항" class="w-full p-3 border rounded-xl h-20 font-bold">${p.description||''}</textarea>
      <select name="manager" class="w-full p-3 border rounded-xl font-bold"><option value="">담당매니저</option>${store.users.filter(u=>u.role==='Manager').map(u=>`<option value="${u.id}" ${p.manager===u.id?'selected':''}>${u.name}</option>`).join('')}</select>
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black">${pid?'수정':'등록'}</button>
    </form>`, 'max-w-2xl');
    document.getElementById('pf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (pid) d.id = pid;
      showLoading(true);
      try { await store.upsertProp(d); toast('완료','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }

  async delProp(id) {
    if (!confirm('삭제?')) return;
    await store.delProp(id); toast('삭제','success'); await this.renderAdminTab();
  }

  admSales(c) {
    const total = store.bookings.reduce((s,b)=>s+(+b.price||0),0);
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">💰 매출 관리</h2>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 rounded-2xl"><p class="text-[10px] font-black uppercase opacity-70">총매출</p><p class="text-2xl font-black mt-2">${fmt(total)}</p></div>
        <div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">예약수</p><p class="text-2xl font-black mt-2">${store.bookings.length}건</p></div>
        <div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">평균</p><p class="text-2xl font-black mt-2">${fmt(store.bookings.length?Math.round(total/store.bookings.length):0)}</p></div>
      </div>
      <div class="bg-white rounded-2xl border overflow-hidden"><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr><th class="px-5 py-3 text-left">숙소</th><th class="px-5 py-3 text-right">매출</th></tr></thead><tbody class="divide-y">${store.properties.map(p=>{const t=store.bookings.filter(b=>b.propId===p.id).reduce((s,b)=>s+b.price,0);return `<tr><td class="px-5 py-4 font-black">${p.name}</td><td class="px-5 py-4 text-right font-black text-blue-600">${fmt(t)}</td></tr>`}).join('')}</tbody></table></div>`;
  }

  admExpenses(c) {
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">💳 지출 관리</h2><button onclick="router.showExpenseForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 지출</button></div>
      <div class="bg-white rounded-2xl border overflow-hidden"><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr><th class="px-4 py-3 text-left">날짜</th><th class="px-4 py-3 text-left">숙소</th><th class="px-4 py-3 text-left">분류</th><th class="px-4 py-3 text-right">금액</th><th class="px-4 py-3"></th></tr></thead><tbody class="divide-y">${store.expenses.map(e=>`<tr><td class="px-4 py-3">${e.date}</td><td class="px-4 py-3 font-black">${store.prop(e.propId)?.name||'-'}</td><td class="px-4 py-3">${e.category} ${e.syncKey?.startsWith('net_')?'🔗':''}</td><td class="px-4 py-3 text-right font-black text-red-500">${fmt(e.amount)}</td><td class="px-4 py-3"><button onclick="router.delExpense(${e.id})" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('')}</tbody></table></div>`;
    lucide.createIcons();
  }

  showExpenseForm() {
    openModal('지출 등록', `<form id="ef" class="space-y-3">
      <select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select>
      <select name="majorCat" id="mc" class="w-full p-3 border rounded-xl font-bold" onchange="document.getElementById('sc').innerHTML=(${JSON.stringify(store.subCats)})[this.value].map(x=>'<option>'+x+'</option>').join('')">${store.majorCats.map(m=>`<option>${m}</option>`).join('')}</select>
      <select name="category" id="sc" class="w-full p-3 border rounded-xl font-bold">${(store.subCats[store.majorCats[0]]||[]).map(s=>`<option>${s}</option>`).join('')}</select>
      <input type="date" name="date" value="${todayStr()}" class="w-full p-3 border rounded-xl font-bold" required>
      <input type="number" name="amount" placeholder="금액" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl" required>
      <input name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold">
      <button class="w-full bg-red-500 text-white py-4 rounded-xl font-black">등록</button>
    </form>`, 'max-w-xl');
    document.getElementById('ef').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      await store.addExpense(d); toast('등록','success'); closeModal(); await this.renderAdminTab();
    };
  }

  async delExpense(id) {
    if (!confirm('삭제?')) return;
    await store.delExpense(id); toast('삭제','success'); await this.renderAdminTab();
  }

  admBookings(c) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const startDow = first.getDay();
    let html = `<h2 class="text-3xl font-black mb-6">📅 예약 관리</h2><div class="bg-white p-6 rounded-2xl border"><h3 class="text-xl font-black mb-4">${now.getFullYear()}년 ${now.getMonth()+1}월</h3><div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase mb-2">${['일','월','화','수','목','금','토'].map(d=>`<div class="text-center py-2">${d}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">`;
    for (let i=0; i<startDow; i++) html += `<div class="min-h-[120px] bg-slate-50/50 rounded-lg"></div>`;
    for (let d=1; d<=days; d++) {
      const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const bks = store.bookings.filter(b => ds>=b.checkIn && ds<b.checkOut);
      html += `<div class="min-h-[120px] border rounded-lg p-1.5 ${ds===todayStr()?'ring-2 ring-blue-500':''}"><div class="text-xs font-black">${d}</div>${bks.slice(0,3).map(b=>`<div class="text-[9px] font-bold truncate px-1 py-0.5 rounded mt-0.5 bg-blue-100 text-blue-700">${store.prop(b.propId)?.name?.slice(0,5)||''}·${b.guest.slice(0,3)}</div>`).join('')}</div>`;
    }
    html += `</div></div>`;
    c.innerHTML = html;
  }

  admUsers(c) {
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">🔐 이용자/권한</h2><button onclick="router.showUserForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규</button></div>
      <div class="bg-white rounded-2xl border overflow-hidden"><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr><th class="px-4 py-3 text-left">ID</th><th class="px-4 py-3 text-left">이름</th><th class="px-4 py-3 text-left">역할</th><th class="px-4 py-3 text-left">권한</th><th class="px-4 py-3"></th></tr></thead><tbody class="divide-y">${store.users.map(u=>`<tr><td class="px-4 py-3 font-mono">${u.id}</td><td class="px-4 py-3 font-black">${u.name}</td><td class="px-4 py-3">${u.role}</td><td class="px-4 py-3 text-xs">${u.role==='Admin'?'전체':(u.permissions?.length||0)+'개'}</td><td class="px-4 py-3"><button onclick="router.showUserForm('${u.id}')" class="p-2 bg-slate-100 rounded-lg mr-1"><i data-lucide="edit-3" class="w-4 h-4"></i></button>${u.id!=='admin'?`<button onclick="router.delUser('${u.id}')" class="p-2 bg-red-50 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
    lucide.createIcons();
  }

  showUserForm(uid=null) {
    const u = uid ? store.user(uid) : {id:'',pw:'',name:'',role:'Manager',contact:'',email:'',permissions:[],tagColor:'#60a5fa'};
    openModal(uid?'수정':'신규', `<form id="uf" class="space-y-3">
      <div class="grid grid-cols-2 gap-3"><input name="id" value="${u.id}" placeholder="아이디" class="p-3 border rounded-xl font-bold" ${uid?'readonly':'required'}><input name="pw" value="${u.pw||''}" placeholder="비밀번호" class="p-3 border rounded-xl font-bold" required></div>
      <div class="grid grid-cols-2 gap-3"><input name="name" value="${u.name}" placeholder="이름" class="p-3 border rounded-xl font-bold" required><select name="role" class="p-3 border rounded-xl font-bold">${['Admin','Manager','Director'].map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></div>
      <div class="grid grid-cols-2 gap-3"><input name="contact" value="${u.contact||''}" placeholder="연락처" class="p-3 border rounded-xl font-bold"><input name="email" value="${u.email||''}" placeholder="이메일" class="p-3 border rounded-xl font-bold"></div>
      <input type="color" name="tagColor" value="${u.tagColor||'#60a5fa'}" class="w-full h-12 border rounded-xl">
      <div class="bg-slate-50 p-4 rounded-xl"><p class="text-xs font-black text-slate-500 mb-3">매물 권한</p><div class="grid grid-cols-2 gap-2">${store.properties.map(p=>`<label class="flex items-center gap-2 p-2 bg-white rounded-lg"><input type="checkbox" name="perm_${p.id}" ${u.permissions?.includes(p.id)?'checked':''}><span class="text-xs font-bold">${p.name}</span></label>`).join('')}</div></div>
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black">${uid?'수정':'생성'}</button>
    </form>`, 'max-w-2xl');
    document.getElementById('uf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const perms = [];
      store.properties.forEach(p => { if (d['perm_'+p.id]) perms.push(p.id); delete d['perm_'+p.id]; });
      d.permissions = perms;
      await store.upsertUser(d); toast('저장','success'); closeModal(); await this.renderAdminTab();
    };
  }

  async delUser(id) {
    if (!confirm('삭제?')) return;
    await store.delUser(id); await this.renderAdminTab();
  }

  admProfileReq(c) {
    const all = [...store.profileRequests].sort((a,b)=>b.id-a.id);
    const pending = all.filter(r=>r.status==='pending');
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">👤 프로필 변경 요청 (대기 ${pending.length})</h2>
      ${all.length?all.map(r=>{
        const sc = {pending:'bg-amber-100 text-amber-700',approved:'bg-green-100 text-green-700',rejected:'bg-red-100 text-red-700'}[r.status];
        const st = {pending:'⏳ 대기',approved:'✅ 승인',rejected:'❌ 반려'}[r.status];
        const lbl = {name:'이름',contact:'연락처',email:'이메일',pw:'비밀번호'};
        return `<div class="bg-white p-6 rounded-2xl border-2 mb-4">
          <div class="flex items-center justify-between mb-4"><span class="px-3 py-1 rounded-full font-black text-xs ${sc}">${st}</span><span class="text-xs text-slate-400">${r.requestedAt}</span></div>
          <p class="font-black mb-3">${r.userName}</p>
          <div class="bg-slate-50 p-4 rounded-xl mb-4">${Object.keys(r.changes).map(k=>{const ov=k==='pw'?'****':(r.original[k]||'(없음)');const nv=k==='pw'?'****':r.changes[k];return `<div class="flex items-center gap-2 text-sm py-1"><span class="font-black w-20">${lbl[k]||k}</span><span class="text-slate-400 line-through">${ov}</span><i data-lucide="arrow-right" class="w-3 h-3"></i><span class="text-blue-600 font-black">${nv}</span></div>`}).join('')}</div>
          ${r.status==='pending'?`<div class="flex gap-2"><button onclick="router.approveReq(${r.id})" class="flex-1 bg-green-500 text-white py-3 rounded-xl font-black">✅ 승인</button><button onclick="router.rejectReq(${r.id})" class="flex-1 bg-red-500 text-white py-3 rounded-xl font-black">❌ 반려</button></div>`:''}
        </div>`;
      }).join(''):'<p class="text-center text-slate-400 py-12">요청 없음</p>'}`;
    lucide.createIcons();
  }
  async approveReq(id) {
    if (!confirm('승인?')) return;
    await store.approveProfileChange(id); toast('승인','success'); await this.renderAdminTab(); this.renderAdminNav();
  }
  async rejectReq(id) {
    const reason = prompt('반려 사유') || '';
    await store.rejectProfileChange(id, reason); toast('반려','warning'); await this.renderAdminTab(); this.renderAdminNav();
  }

  admChats(c) {
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">💬 채팅 관리</h2><div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${store.properties.map(p=>{const ch=store.chats.filter(x=>x.propId===p.id);const last=ch[ch.length-1];return `<div onclick="router.showChatBox(${p.id})" class="bg-white p-5 rounded-2xl border hover:shadow-xl cursor-pointer flex items-center gap-4"><img src="${p.image}" class="w-16 h-16 rounded-xl object-cover"><div class="flex-1 min-w-0"><p class="font-black">${p.name}</p><p class="text-xs text-slate-500 truncate mt-1">${last?last.sender+': '+last.message:'대화없음'}</p></div></div>`}).join('')}</div>`;
  }

  admLogs(c) {
    const specials = store.logs.filter(l=>l.special);
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">📋 로그 관리</h2>${specials.length?`<div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6 mb-6"><h3 class="font-black text-red-700 mb-3">🚨 특이사항 (${specials.length}건)</h3>${specials.slice(0,10).map(l=>`<div class="bg-white p-3 rounded-lg mb-2"><p class="text-sm font-black text-red-700">${l.message}</p><p class="text-[10px] text-slate-400 mt-1">${l.time}</p></div>`).join('')}</div>`:''}<div class="bg-white rounded-2xl border overflow-hidden"><div class="divide-y max-h-[600px] overflow-y-auto scrollbar">${store.logs.slice(0,100).map(l=>`<div class="p-4 flex gap-3 ${l.special?'bg-red-50/30':''}"><div class="w-2 h-2 rounded-full ${l.special?'bg-red-500':'bg-slate-300'} mt-2"></div><div class="flex-1"><p class="text-sm font-bold">${l.message}</p><p class="text-[10px] text-slate-400 mt-0.5">${l.time} · ${l.user}</p></div></div>`).join('')}</div></div>`;
  }

  admEtc(c) {
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">📦 기타 관리</h2>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="bg-white p-6 rounded-2xl border">
          <div class="flex justify-between items-center mb-4"><h3 class="font-black">🌐 인터넷 관리 🔗</h3><button onclick="router.showInternetForm()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black">+ 추가</button></div>
          <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50 font-black text-slate-400"><tr><th class="px-2 py-2 text-left">숙소</th><th class="px-2 py-2 text-left">통신사</th><th class="px-2 py-2 text-right">월비용</th><th class="px-2 py-2"></th></tr></thead><tbody class="divide-y">${store.internet.map(n=>`<tr><td class="px-2 py-2 font-black">${store.prop(n.propId)?.name||'-'}</td><td class="px-2 py-2">${n.provider}</td><td class="px-2 py-2 text-right font-black text-red-500">${fmt(n.monthly)}</td><td class="px-2 py-2"><button onclick="router.showInternetForm(${n.id})" class="p-1 bg-slate-100 rounded mr-1"><i data-lucide="edit-3" class="w-3 h-3"></i></button><button onclick="router.delInternet(${n.id})" class="p-1 bg-red-50 text-red-500 rounded"><i data-lucide="trash-2" class="w-3 h-3"></i></button></td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="bg-white p-6 rounded-2xl border">
          <div class="flex justify-between items-center mb-4"><h3 class="font-black">🛍️ 물품 추천</h3><button onclick="router.showProductForm()" class="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-black">+ 추가</button></div>
          <div class="space-y-2 max-h-[500px] overflow-y-auto scrollbar">${store.products.length?store.products.map(p=>`<div class="p-3 bg-slate-50 rounded-xl flex items-center gap-3"><img src="${p.image||'https://via.placeholder.com/60'}" class="w-14 h-14 rounded-lg object-cover" onerror="this.src='https://via.placeholder.com/60'"><div class="flex-1 min-w-0"><span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-black text-[10px]">${p.category}</span><p class="font-black text-sm truncate mt-1">${p.name}</p></div><div class="text-right"><p class="font-black text-red-500 text-sm">${fmt(p.price)}</p><div class="flex gap-1 mt-1">${p.url?`<a href="${p.url}" target="_blank" class="p-1 bg-white rounded"><i data-lucide="external-link" class="w-3 h-3"></i></a>`:''}<button onclick="router.showProductForm(${p.id})" class="p-1 bg-white rounded"><i data-lucide="edit-3" class="w-3 h-3"></i></button><button onclick="router.delProduct(${p.id})" class="p-1 bg-white rounded text-red-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div></div>`).join(''):'<p class="text-center text-slate-400 py-12">없음</p>'}</div>
        </div>
      </div>`;
    lucide.createIcons();
  }

  showInternetForm(nid=null) {
    const n = nid ? store.internet.find(x=>x.id===parseInt(nid)) : {id:'',propId:store.properties[0]?.id,provider:'KT',plan:'기가',monthly:33000,installDate:todayStr(),contract:'3년',wifiId:'',wifiPw:''};
    openModal(nid?'수정':'등록', `<form id="nf" class="space-y-3">
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-bold text-blue-700">🔗 지출 자동연동</div>
      <select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}" ${n.propId===p.id?'selected':''}>${p.name}</option>`).join('')}</select>
      <div class="grid grid-cols-2 gap-3"><input name="provider" value="${n.provider}" placeholder="통신사" class="p-3 border rounded-xl font-bold" required><input name="plan" value="${n.plan}" placeholder="요금제" class="p-3 border rounded-xl font-bold" required></div>
      <input type="number" name="monthly" value="${n.monthly}" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl" required>
      <div class="grid grid-cols-2 gap-3"><input type="date" name="installDate" value="${n.installDate}" class="p-3 border rounded-xl font-bold"><input name="contract" value="${n.contract}" placeholder="약정" class="p-3 border rounded-xl font-bold"></div>
      <div class="grid grid-cols-2 gap-3"><input name="wifiId" value="${n.wifiId||''}" placeholder="WiFi ID" class="p-3 border rounded-xl font-bold"><input name="wifiPw" value="${n.wifiPw||''}" placeholder="WiFi PW" class="p-3 border rounded-xl font-bold"></div>
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black">${nid?'수정':'등록'}</button>
    </form>`, 'max-w-2xl');
    document.getElementById('nf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (nid) d.id = parseInt(nid);
      await store.upsertInternet(d); toast('완료','success'); closeModal(); await this.renderAdminTab();
    };
  }

  async delInternet(id) {
    if (!confirm('삭제 (지출도 함께)?')) return;
    await store.delInternet(id); toast('삭제','success'); await this.renderAdminTab();
  }

  showProductForm(pid=null) {
    const p = pid ? store.products.find(x=>x.id===parseInt(pid)) : {id:'',category:'침구',name:'',price:10000,url:'',image:'',memo:'',vendor:''};
    openModal(pid?'수정':'등록', `<form id="prf" class="space-y-3">
      <div class="grid grid-cols-2 gap-3"><select name="category" class="p-3 border rounded-xl font-bold">${['침구','욕실','주방','가전','소모품','기타'].map(c=>`<option ${p.category===c?'selected':''}>${c}</option>`).join('')}</select><input name="vendor" value="${p.vendor||''}" placeholder="판매처" class="p-3 border rounded-xl font-bold"></div>
      <input name="name" value="${p.name}" placeholder="상품명" class="w-full p-3 border rounded-xl font-bold" required>
      <input type="number" name="price" value="${p.price}" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl" required>
      <input name="image" value="${p.image||''}" placeholder="이미지 URL" class="w-full p-3 border rounded-xl font-bold">
      <input name="url" value="${p.url||''}" placeholder="구매 링크" class="w-full p-3 border rounded-xl font-bold">
      <textarea name="memo" placeholder="메모" class="w-full p-3 border rounded-xl h-20 font-bold">${p.memo||''}</textarea>
      <button class="w-full bg-green-600 text-white py-4 rounded-xl font-black">${pid?'수정':'등록'}</button>
    </form>`, 'max-w-2xl');
    document.getElementById('prf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (pid) d.id = pid;
      await store.upsertProduct(d); toast('완료','success'); closeModal(); await this.renderAdminTab();
    };
  }
  async delProduct(id) {
    if (!confirm('삭제?')) return;
    await store.delProduct(id); await this.renderAdminTab();
  }
}

window.Router = Router;