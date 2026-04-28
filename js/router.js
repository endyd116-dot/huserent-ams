class Router {
  constructor() {
    window.router = this;
    this.adminTab = 'main';
    this.expenseMode = 'integrated';
    this.bkMode = 'month';
    this.staffMode = 'cal';
    this.admChatsMode = 'list';
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
        ${pending?`<div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3"><i data-lucide="clock" class="w-5 h-5 text-amber-600"></i><div><p class="text-sm font-black text-amber-800">변경 요청 승인 대기 중</p></div></div>`:''}
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
        toast('변경 요청 접수!','success');
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
        <div class="flex items-center gap-2 text-xs font-bold flex-wrap">${store.platforms.map(pl=>`<span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:${pl.color}"></span>${pl.name}</span>`).join('')}</div>
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
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-2xl text-white">
          <div class="flex justify-between mb-3 text-xs"><span class="opacity-80 font-bold">원가 (1박)</span><span class="font-black">${fmt(p.cost)}</span></div>
          <div class="flex justify-between mb-3 text-xs"><span class="opacity-80 font-bold">기본가 (1박)</span><span class="font-black">${fmt(p.price)}</span></div>
          <div class="flex justify-between mb-4 text-xs" id="ni"><span class="opacity-80 font-bold">숙박 × 원가</span><span class="font-black" id="ct">₩0</span></div>
          <input type="number" name="price" value="${b.price||p.price}" placeholder="최종 가격" class="w-full p-4 bg-white/10 border-2 border-white/20 rounded-xl text-2xl font-black outline-none focus:border-white" required>
        </div>
        <textarea name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold h-20">${b.memo||''}</textarea>
        <div class="flex gap-3"><button type="submit" class="flex-1 bg-slate-900 text-white py-4 rounded-xl font-black">${isEdit?'예약 수정':'예약 등록'}</button>${isEdit?`<button type="button" onclick="router.deleteBooking(${booking.id})" class="px-8 bg-red-50 text-red-500 rounded-xl font-black">예약 취소</button>`:''}</div>
      </form>`, 'max-w-3xl');
    const f = document.getElementById('bk-form');
    const upd = () => {
      const ci=f.checkIn.value, co=f.checkOut.value;
      if (ci&&co) { const n=daysBetween(ci,co); f.querySelector('#ni span:first-child').textContent=`${n}박 × 원가`; f.querySelector('#ct').textContent=fmt(n*p.cost); }
    };
    f.checkIn.onchange = f.checkOut.onchange = upd; upd();
    f.onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (d.checkIn >= d.checkOut) { toast('체크아웃은 체크인 이후','error'); return; }
      const conflict = store.bookings.find(bk => bk.propId===propId && bk.id!==booking?.id && !(d.checkOut<=bk.checkIn || d.checkIn>=bk.checkOut));
      if (conflict) { toast(`예약 충돌: ${conflict.guest}`,'error'); return; }
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
    const mgr = store.user(p.manager);
    openModal(`ℹ️ ${p.name}`, `
      <img src="${p.image}" class="w-full h-72 object-cover rounded-2xl mb-6">
      <p class="text-sm bg-slate-50 p-6 rounded-2xl mb-6">${p.description||'-'}</p>
      <div class="grid grid-cols-2 gap-3 text-sm">${[['그룹',p.group],['주소',p.address],['1박',fmt(p.price)],['원가',fmt(p.cost)],['담당',mgr?.name||'-'],['수리',p.repair],['청소',p.cleaning],['가스',p.gas],['인터넷',p.internet],['분리수거',p.recycleDay],['비밀번호',p.password],['관리실',p.office],['이용안내',p.guide?`<a href="${p.guide}" target="_blank" class="text-blue-600">${p.guide}</a>`:'-']].map(([k,v])=>`<div class="bg-white p-4 rounded-xl border"><p class="text-[10px] font-black text-slate-400 uppercase">${k}</p><p class="font-bold mt-1">${v||'-'}</p></div>`).join('')}</div>`, 'max-w-4xl');
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
        <main class="flex-1 bg-slate-50">${UI.Header('Admin Control')}<div class="p-8" id="abody" data-admin></div></main>
      </div>`;
    this.renderAdminNav();
    await this.renderAdminTab();
  }

  renderAdminNav() {
    const items = [
      ['main','home','MAIN 대시보드'],['props','building','매물 관리'],['sales','trending-up','매출 관리'],
      ['expenses','credit-card','지출 관리'],['bookings','calendar','예약 관리'],['stats','bar-chart-3','통계 & 보고서'],
      ['ops','clipboard-list','운영 관리'],['customers','users','고객 관리'],['users','user-cog','이용자/권한'],
      ['profileReq','user-check','프로필 요청'],['chats','message-square','채팅 관리'],['logs','list-checks','로그 관리'],
      ['staff','calendar-days','직원 관리'],['etc','package','기타 관리']
    ];
    const pending = store.pendingProfileRequests().length;
    document.getElementById('anav').innerHTML = items.map(([k,i,l])=>`<a onclick="router.adminTab='${k}';router.renderAdminNav();router.renderAdminTab()" class="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition ${this.adminTab===k?'bg-blue-600 text-white font-black shadow-lg':'text-slate-400 hover:bg-white/5 font-semibold'}"><i data-lucide="${i}" class="w-4 h-4"></i><span class="text-xs flex-1">${l}</span>${k==='profileReq'&&pending?`<span class="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">${pending}</span>`:''}</a>`).join('');
    lucide.createIcons();
  }

  async renderAdminTab() {
    const c = document.getElementById('abody');
    if (!c) return;
    const fn = {main:this.admMain, props:this.admProps, sales:this.admSales, expenses:this.admExpenses, bookings:this.admBookings, stats:this.admStats, ops:this.admOps, customers:this.admCustomers, users:this.admUsers, profileReq:this.admProfileReq, chats:this.admChats, logs:this.admLogs, staff:this.admStaff, etc:this.admEtc}[this.adminTab];
    if (fn) fn.call(this, c);
    lucide.createIcons();
  }

  admMain(c) {
    const rev = store.bookings.reduce((s,b)=>s+(+b.price||0),0);
    const cost = store.expenses.reduce((s,e)=>s+(+e.amount||0),0);
    const specials = store.logs.filter(l=>l.special).slice(0,5);
    c.innerHTML = `<h2 class="text-3xl font-black mb-2">📊 운영 현황 한눈에 보기</h2><p class="text-slate-500 mb-8">최근 활동 및 특이사항 모니터링</p>
      <div class="grid grid-cols-4 gap-4 mb-8">
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl"><p class="text-[10px] font-black uppercase opacity-70">총 매출</p><p class="text-2xl font-black mt-2">${fmt(rev)}</p></div>
        <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">총 지출</p><p class="text-2xl font-black text-red-500 mt-2">${fmt(cost)}</p></div>
        <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">순이익</p><p class="text-2xl font-black text-green-600 mt-2">${fmt(rev-cost)}</p></div>
        <div class="bg-white p-6 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">가동률</p><p class="text-2xl font-black mt-2">${store.properties.length?Math.round(store.properties.filter(p=>getBookingForDate(p.id,todayStr())).length/store.properties.length*100):0}%</p></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">🚨 특이사항 (최근 5건)</h3>${specials.length?specials.map(s=>`<div class="p-3 bg-red-50 rounded-xl mb-2 border border-red-100"><p class="text-sm font-bold text-red-700">${s.message}</p><p class="text-[10px] text-slate-400 font-bold mt-1">${s.time} · ${s.user}</p></div>`).join(''):'<p class="text-slate-400 py-8 text-center">특이사항 없음</p>'}</div>
        <div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">📈 매출 추이 (숙소별)</h3><canvas id="mc" height="200"></canvas></div>
      </div>`;
    setTimeout(()=>{
      const data = store.properties.map(p=>({n:p.name.slice(0,8),v:store.bookings.filter(b=>b.propId===p.id).reduce((s,b)=>s+b.price,0)}));
      new Chart(document.getElementById('mc'),{type:'bar',data:{labels:data.map(d=>d.n),datasets:[{label:'매출',data:data.map(d=>d.v),backgroundColor:'#2563eb'}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
    },100);
  }

  admProps(c) {
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">🏠 매물 관리 (${store.properties.length})</h2><div class="flex gap-2"><button onclick="router.showGroupMgr()" class="bg-white border-2 px-5 py-3 rounded-xl font-black text-sm">📁 그룹 관리</button><button onclick="router.showPropForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규 매물</button></div></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">${store.properties.map(p=>`<div class="bg-white p-5 rounded-2xl border flex gap-4 hover:shadow-xl transition"><img src="${p.image}" class="w-20 h-20 rounded-xl object-cover"><div class="flex-1 min-w-0"><div class="flex items-center gap-2"><p class="font-black truncate">${p.name}</p>${badge(p.status)}</div><p class="text-[10px] text-slate-400 font-bold mt-1">${p.group||'-'} · ${fmt(p.price)}</p><p class="text-[9px] text-slate-400 mt-1 flex items-center gap-1">담당: ${mgrTag(p.manager)}</p></div><div class="flex flex-col gap-1"><button onclick="router.showPropForm(${p.id})" class="p-2 bg-slate-100 rounded-lg"><i data-lucide="edit-3" class="w-4 h-4"></i></button><button onclick="router.delProp(${p.id})" class="p-2 bg-red-50 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></div>`).join('')}</div>`;
  }

  showGroupMgr() {
    openModal('📁 그룹 관리', `
      <div class="space-y-2 mb-4">${store.groups.map((g,i)=>`<div class="flex items-center gap-2 bg-slate-50 p-3 rounded-xl"><span class="flex-1 font-bold">${g}</span><button onclick="router.delGroup(${i})" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`).join('')}</div>
      <form id="gf"><div class="flex gap-2"><input name="g" placeholder="새 그룹명" class="flex-1 p-3 border rounded-xl font-bold"><button class="bg-blue-600 text-white px-5 rounded-xl font-black">추가</button></div></form>`, 'max-w-md');
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
    const p = pid?store.prop(pid):{id:'',name:'',group:store.groups[0]||'서울',location:'',address:'',price:100000,cost:40000,image:'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',description:'',manager:'',repair:'완료',cleaning:'완료',gas:'도시가스',internet:'KT 기가',recycleDay:'',password:'',office:'',guide:''};
    openModal(pid?'✏️ 매물 수정':'🆕 매물 등록', `<form id="pf" class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <input name="name" value="${p.name}" placeholder="숙소명" class="p-3 border rounded-xl font-bold" required>
        <select name="group" class="p-3 border rounded-xl font-bold">${store.groups.map(g=>`<option ${p.group===g?'selected':''}>${g}</option>`).join('')}</select>
      </div>
      <input name="location" value="${p.location||''}" placeholder="위치 (간단)" class="w-full p-3 border rounded-xl font-bold" required>
      <input name="address" value="${p.address||''}" placeholder="상세주소/링크" class="w-full p-3 border rounded-xl font-bold">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] font-black text-blue-500">판매가 (1박)</label><input type="number" name="price" value="${p.price}" class="w-full p-3 border rounded-xl font-black text-blue-600 mt-1" required></div>
        <div><label class="text-[10px] font-black text-slate-400">원가</label><input type="number" name="cost" value="${p.cost}" class="w-full p-3 border rounded-xl font-black text-slate-500 mt-1" required></div>
      </div>
      <input name="image" value="${p.image||''}" placeholder="이미지 URL" class="w-full p-3 border rounded-xl font-bold">
      <textarea name="description" placeholder="세부사항 (HTML 가능)" class="w-full p-3 border rounded-xl h-24 font-bold">${p.description||''}</textarea>
      <div class="bg-slate-50 p-4 rounded-xl space-y-3">
        <p class="text-xs font-black text-slate-400 uppercase tracking-widest">운영 정보</p>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-[10px] font-black">담당매니저</label><select name="manager" class="w-full p-3 border rounded-xl font-bold mt-1"><option value="">-</option>${store.users.filter(u=>u.role==='Manager').map(u=>`<option value="${u.id}" ${p.manager===u.id?'selected':''}>${u.name}</option>`).join('')}</select></div>
          <div><label class="text-[10px] font-black">수리여부</label><input name="repair" value="${p.repair||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black">입주청소</label><input name="cleaning" value="${p.cleaning||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black">도시가스</label><input name="gas" value="${p.gas||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black">인터넷</label><input name="internet" value="${p.internet||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black">분리수거일</label><input name="recycleDay" value="${p.recycleDay||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black">비밀번호</label><input name="password" value="${p.password||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div><label class="text-[10px] font-black">관리실 번호</label><input name="office" value="${p.office||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
          <div class="col-span-2"><label class="text-[10px] font-black">이용안내 링크</label><input name="guide" value="${p.guide||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
        </div>
      </div>
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase tracking-widest">${pid?'매물 수정':'매물 등록'}</button>
    </form>`, 'max-w-3xl');
    document.getElementById('pf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (pid) d.id = pid;
      showLoading(true);
      try { await store.upsertProp(d); toast(pid?'수정됨':'등록됨','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패: '+err.message,'error'); } finally { showLoading(false); }
    };
  }

  async delProp(id) {
    if (!confirm('관련 데이터가 영향받을 수 있습니다. 삭제?')) return;
    showLoading(true);
    try { await store.delProp(id); toast('삭제됨','success'); await this.renderAdminTab(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

  admSales(c) {
    const byProp = store.properties.map(p=>({p,t:store.bookings.filter(b=>b.propId===p.id).reduce((s,b)=>s+(+b.price||0),0),n:store.bookings.filter(b=>b.propId===p.id).length}));
    const byGroup = {};
    store.groups.forEach(g=>byGroup[g]=store.properties.filter(p=>p.group===g).reduce((s,p)=>s+store.bookings.filter(b=>b.propId===p.id).reduce((ss,b)=>ss+b.price,0),0));
    const total = store.bookings.reduce((s,b)=>s+(+b.price||0),0);
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">💰 매출 관리</h2>
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 rounded-2xl"><p class="text-[10px] font-black uppercase opacity-70">총매출</p><p class="text-2xl font-black mt-2">${fmt(total)}</p></div>
        ${Object.entries(byGroup).map(([g,v])=>`<div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">${g}</p><p class="text-xl font-black text-blue-600 mt-2">${fmt(v)}</p></div>`).join('')}
      </div>
      <div class="bg-white rounded-2xl border overflow-hidden mb-6"><div class="p-5 border-b bg-slate-50"><h3 class="font-black text-sm uppercase tracking-widest">숙소별 매출 순위</h3></div>
        <table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr><th class="px-5 py-3 text-left">숙소</th><th class="px-5 py-3 text-right">예약수</th><th class="px-5 py-3 text-right">총매출</th><th class="px-5 py-3 text-right">평균단가</th></tr></thead><tbody class="text-sm divide-y">${byProp.sort((a,b)=>b.t-a.t).map(r=>`<tr class="hover:bg-blue-50/30"><td class="px-5 py-4 font-black">${r.p.name}</td><td class="px-5 py-4 text-right font-bold">${r.n}건</td><td class="px-5 py-4 text-right font-black text-blue-600">${fmt(r.t)}</td><td class="px-5 py-4 text-right font-bold text-slate-500">${fmt(r.n?Math.round(r.t/r.n):0)}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">기간별 매출 차트</h3><canvas id="sChart" height="100"></canvas></div>`;
    setTimeout(()=>{
      const months={};store.bookings.forEach(b=>{const m=b.checkIn.slice(0,7);months[m]=(months[m]||0)+b.price});
      const k=Object.keys(months).sort();
      new Chart(document.getElementById('sChart'),{type:'line',data:{labels:k,datasets:[{label:'매출',data:k.map(x=>months[x]),borderColor:'#2563eb',backgroundColor:'#2563eb30',fill:true,tension:0.4}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
    },100);
  }

  admExpenses(c) {
    const mode = this.expenseMode;
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">💳 지출 관리</h2><div class="flex gap-2"><div class="bg-slate-100 rounded-xl p-1 flex"><button onclick="router.expenseMode='integrated';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${mode==='integrated'?'bg-white shadow':'text-slate-500'}">통합</button><button onclick="router.expenseMode='individual';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${mode==='individual'?'bg-white shadow':'text-slate-500'}">개별</button></div><button onclick="router.showCatMgr()" class="bg-white border-2 px-5 py-3 rounded-xl font-black text-sm">📁 카테고리</button><button onclick="router.showExpenseForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 지출 추가</button></div></div>
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs font-bold text-blue-700 flex items-center gap-2"><i data-lucide="link" class="w-4 h-4"></i>🔗 고정지출의 '인터넷비'는 기타관리와 자동 연동됩니다.</div>
      <div id="exp-body"></div>`;
    if (mode === 'integrated') this.admExpIntegrated(); else this.admExpIndividual();
  }

  admExpIntegrated() {
    const body = document.getElementById('exp-body');
    let html = `<div class="bg-white rounded-2xl border overflow-x-auto"><table class="w-full min-w-[900px]"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr><th class="px-4 py-3 text-left">No.</th><th class="px-4 py-3 text-left">숙소</th>${store.majorCats.map(mc=>`<th class="px-4 py-3 text-right" colspan="${(store.subCats[mc]||[]).length+1}" style="background:${mc==='초기투자지출'?'#fef3c7':mc==='고정지출'?'#dbeafe':'#fee2e2'}">${mc}</th>`).join('')}<th class="px-4 py-3 text-right bg-slate-900 text-white">총합</th></tr><tr><th></th><th></th>${store.majorCats.map(mc=>(store.subCats[mc]||[]).map(sc=>`<th class="px-3 py-2 text-right text-[9px]">${sc}${sc==='인터넷비'?' 🔗':''}</th>`).join('')+`<th class="px-3 py-2 text-right text-[9px] font-black">소계</th>`).join('')}<th></th></tr></thead><tbody class="text-xs divide-y">`;
    store.properties.forEach((p,idx)=>{
      let total = 0;
      html += `<tr class="hover:bg-blue-50/30"><td class="px-4 py-3 font-black">${idx+1}</td><td class="px-4 py-3 font-black whitespace-nowrap">${p.name}</td>`;
      store.majorCats.forEach(mc=>{
        let mcSum = 0;
        (store.subCats[mc]||[]).forEach(sc=>{
          const v = store.expenses.filter(e=>e.propId===p.id&&e.majorCat===mc&&e.category===sc).reduce((s,e)=>s+e.amount,0);
          mcSum += v;
          html += `<td class="px-3 py-3 text-right font-bold ${sc==='인터넷비'&&v>0?'text-blue-600':''}">${v?fmt(v):'-'}</td>`;
        });
        html += `<td class="px-3 py-3 text-right font-black" style="background:${mc==='초기투자지출'?'#fef9e7':mc==='고정지출'?'#eff6ff':'#fef2f2'}">${mcSum?fmt(mcSum):'-'}</td>`;
        total += mcSum;
      });
      html += `<td class="px-4 py-3 text-right font-black bg-slate-900 text-white">${fmt(total)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    body.innerHTML = html;
  }

  admExpIndividual() {
    const body = document.getElementById('exp-body');
    body.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${store.properties.map(p=>{
      const list = store.expenses.filter(e=>e.propId===p.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      const total = list.reduce((s,e)=>s+e.amount,0);
      return `<div class="bg-white p-5 rounded-2xl border"><div class="flex items-center gap-3 mb-4 pb-4 border-b"><img src="${p.image}" class="w-12 h-12 rounded-xl object-cover"><div class="flex-1 min-w-0"><p class="font-black truncate">${p.name}</p><p class="text-xs text-red-500 font-black">${fmt(total)}</p></div><button onclick="router.showExpenseForm(${p.id})" class="w-8 h-8 bg-blue-600 text-white rounded-lg text-xs font-black">+</button></div><div class="space-y-2 max-h-64 overflow-y-auto scrollbar">${list.length?list.map(e=>{const linked=e.syncKey?.startsWith('net_');return `<div class="p-2 ${linked?'bg-blue-50':'bg-slate-50'} rounded-lg flex items-center gap-2 text-xs"><div class="flex-1 min-w-0"><p class="font-black truncate">${e.category} ${linked?'🔗':''}</p><p class="text-[10px] text-slate-400 font-bold">${e.date} · ${e.memo||'-'}</p></div><span class="text-red-500 font-black">${fmt(e.amount)}</span><button onclick="router.delExpense(${e.id})" class="text-slate-300 hover:text-red-500"><i data-lucide="x" class="w-3 h-3"></i></button></div>`}).join(''):'<p class="text-xs text-slate-400 text-center py-4">없음</p>'}</div></div>`;
    }).join('')}</div>`;
    lucide.createIcons();
  }
  showCatMgr() {
    openModal('📁 지출 카테고리 관리', `
      <div class="space-y-4">${store.majorCats.map((mc,i)=>`
        <div class="bg-slate-50 p-4 rounded-2xl"><div class="flex items-center gap-2 mb-3"><span class="font-black text-lg flex-1">${mc}</span><button onclick="router.delMajorCat(${i},'${mc}')" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>
          <div class="flex flex-wrap gap-2 mb-2">${(store.subCats[mc]||[]).map((sc,j)=>`<span class="inline-flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg text-xs font-bold border">${sc}<button onclick="router.delSubCat('${mc}',${j})" class="text-red-400">×</button></span>`).join('')}</div>
          <form onsubmit="router.addSubCat(event,'${mc}')"><div class="flex gap-2"><input name="s" placeholder="소분류 추가" class="flex-1 p-2 border rounded-lg text-sm"><button class="bg-blue-600 text-white px-3 rounded-lg text-xs font-black">+</button></div></form>
        </div>`).join('')}
      </div>
      <form onsubmit="router.addMajorCat(event)" class="mt-4 pt-4 border-t"><div class="flex gap-2"><input name="m" placeholder="새 대분류" class="flex-1 p-3 border rounded-xl font-bold"><button class="bg-slate-900 text-white px-5 rounded-xl font-black">대분류 추가</button></div></form>`);
    lucide.createIcons();
  }
  async addMajorCat(e){e.preventDefault();const v=e.target.m.value.trim();if(v&&!store.majorCats.includes(v)){store.majorCats.push(v);store.subCats[v]=[];await API.setAll('majorCats',store.majorCats);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}}
  async delMajorCat(i,mc){if(!confirm('삭제?'))return;store.majorCats.splice(i,1);delete store.subCats[mc];await API.setAll('majorCats',store.majorCats);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}
  async addSubCat(e,mc){e.preventDefault();const v=e.target.s.value.trim();if(v){store.subCats[mc]=store.subCats[mc]||[];store.subCats[mc].push(v);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}}
  async delSubCat(mc,j){store.subCats[mc].splice(j,1);await API.setAll('subCats',store.subCats);this.showCatMgr();await this.renderAdminTab()}

  showExpenseForm(propId=null) {
    openModal('💳 지출 등록', `<form id="ef" class="space-y-4">
      <select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}" ${propId==p.id?'selected':''}>${p.name}</option>`).join('')}</select>
      <div class="grid grid-cols-2 gap-3">
        <select name="majorCat" id="mcSel" class="p-3 border rounded-xl font-bold" required onchange="document.getElementById('scSel').innerHTML=(${JSON.stringify(store.subCats)})[this.value].map(x=>'<option>'+x+'</option>').join('')">${store.majorCats.map(m=>`<option>${m}</option>`).join('')}</select>
        <select name="category" id="scSel" class="p-3 border rounded-xl font-bold" required>${(store.subCats[store.majorCats[0]]||[]).map(s=>`<option>${s}</option>`).join('')}</select>
      </div>
      <input type="date" name="date" value="${todayStr()}" class="w-full p-3 border rounded-xl font-bold" required>
      <input type="number" name="amount" placeholder="금액" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl" required>
      <input type="text" name="memo" placeholder="상세 내역" class="w-full p-3 border rounded-xl font-bold">
      <button class="w-full bg-red-500 text-white py-4 rounded-xl font-black uppercase">지출 등록</button>
    </form>`, 'max-w-xl');
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

  admBookings(c) {
    const now = new Date();
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">📅 예약 관리</h2><div class="bg-slate-100 rounded-xl p-1 flex"><button onclick="router.bkMode='month';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.bkMode==='month'?'bg-white shadow':'text-slate-500'}">월별 전체</button><button onclick="router.bkMode='list';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.bkMode==='list'?'bg-white shadow':'text-slate-500'}">개별 보기</button></div></div>
      <div id="bk-body"></div>`;
    if (this.bkMode === 'list') {
      document.getElementById('bk-body').innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${store.properties.map(p=>`<div class="bg-white p-4 rounded-2xl border"><h4 class="font-black mb-3">${p.name}</h4>${buildCalendar(now.getFullYear(),now.getMonth(),p.id,'router.onCalendarClick')}</div>`).join('')}</div>`;
    } else {
      let html = `<div class="bg-white p-6 rounded-2xl border"><h3 class="text-xl font-black mb-4">${now.getFullYear()}년 ${now.getMonth()+1}월 전체 예약 현황</h3>`;
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const startDow = first.getDay();
      html += `<div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase mb-2">${['일','월','화','수','목','금','토'].map(d=>`<div class="text-center py-2">${d}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">`;
      for (let i=0; i<startDow; i++) html += `<div class="min-h-[120px] bg-slate-50/50 rounded-lg"></div>`;
      for (let d=1; d<=days; d++) {
        const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const bks = store.bookings.filter(b => ds>=b.checkIn && ds<b.checkOut);
        html += `<div class="min-h-[120px] border rounded-lg p-1.5 ${ds===todayStr()?'ring-2 ring-blue-500':''}"><div class="text-xs font-black">${d}</div>${bks.slice(0,4).map(b=>{const pl=store.platforms.find(x=>x.name===b.platform);return `<div class="text-[9px] font-bold truncate px-1 py-0.5 rounded mt-0.5 cursor-pointer" style="background:${pl?.color||'#2563eb'}20;color:${pl?.color||'#2563eb'}" onclick="router.showBookingForm(${b.propId},store.bookings.find(x=>x.id===${b.id}))">${store.prop(b.propId)?.name?.slice(0,6)||''}·${b.guest.slice(0,3)}</div>`}).join('')}${bks.length>4?`<div class="text-[8px] text-slate-400 font-bold mt-0.5">+${bks.length-4}건</div>`:''}</div>`;
      }
      html += `</div></div>`;
      document.getElementById('bk-body').innerHTML = html;
    }
  }
  admStats(c) {
    const rev = store.bookings.reduce((s,b)=>s+(+b.price||0),0);
    const cost = store.expenses.reduce((s,e)=>s+(+e.amount||0),0);
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">📊 통계 & 보고서</h2><button onclick="router.genReport()" class="bg-amber-500 text-white px-5 py-3 rounded-xl font-black text-sm shadow-lg">📝 AI 보고서 생성</button></div>
      <div class="grid grid-cols-3 gap-4 mb-6"><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">총매출</p><p class="text-2xl font-black text-blue-600 mt-2">${fmt(rev)}</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">총지출</p><p class="text-2xl font-black text-red-500 mt-2">${fmt(cost)}</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">순이익</p><p class="text-2xl font-black text-green-600 mt-2">${fmt(rev-cost)}</p></div></div>
      <div class="grid grid-cols-2 gap-4 mb-6"><div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">숙소별 손익</h3><canvas id="c1" height="200"></canvas></div><div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">지출 카테고리 분포</h3><canvas id="c2" height="200"></canvas></div></div>
      <div class="bg-white p-6 rounded-2xl border"><h3 class="font-black mb-4">📧 정기 보고서 수신자</h3>
        <div class="flex flex-wrap gap-2 mb-3">${store.reportRecipients.map(r=>`<span class="inline-flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg text-xs font-bold">${store.user(r)?.name||r}<button onclick="router.delRecipient('${r}')" class="text-red-400">×</button></span>`).join('')}</div>
        <select onchange="router.addRecipient(this.value)" class="p-3 border rounded-xl font-bold"><option value="">+ 수신자 추가</option>${store.users.filter(u=>!store.reportRecipients.includes(u.id)).map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}</select>
      </div>`;
    setTimeout(()=>{
      const pL=store.properties.map(p=>p.name.slice(0,8));
      const pR=store.properties.map(p=>store.bookings.filter(b=>b.propId===p.id).reduce((s,b)=>s+b.price,0));
      const pC=store.properties.map(p=>store.expenses.filter(e=>e.propId===p.id).reduce((s,e)=>s+e.amount,0));
      new Chart(document.getElementById('c1'),{type:'bar',data:{labels:pL,datasets:[{label:'매출',data:pR,backgroundColor:'#2563eb'},{label:'지출',data:pC,backgroundColor:'#ef4444'}]},options:{scales:{y:{ticks:{callback:v=>fmt(v)}}}}});
      const cat={};store.expenses.forEach(e=>cat[e.category]=(cat[e.category]||0)+e.amount);
      new Chart(document.getElementById('c2'),{type:'doughnut',data:{labels:Object.keys(cat),datasets:[{data:Object.values(cat),backgroundColor:['#2563eb','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#6366f1']}]}});
    },100);
  }
  async addRecipient(uid){if(uid&&!store.reportRecipients.includes(uid)){store.reportRecipients.push(uid);await API.setAll('reportRecipients',store.reportRecipients);await this.renderAdminTab()}}
  async delRecipient(uid){store.reportRecipients=store.reportRecipients.filter(x=>x!==uid);await API.setAll('reportRecipients',store.reportRecipients);await this.renderAdminTab()}

  genReport() {
    const rev = store.bookings.reduce((s,b)=>s+b.price,0);
    const cost = store.expenses.reduce((s,e)=>s+e.amount,0);
    const top = [...store.properties].sort((a,b)=>store.bookings.filter(x=>x.propId===b.id).reduce((s,x)=>s+x.price,0)-store.bookings.filter(x=>x.propId===a.id).reduce((s,x)=>s+x.price,0))[0];
    const critical = store.logs.filter(l=>l.special).slice(0,5);
    openModal('📝 AI 자동 생성 보고서', `
      <div class="space-y-5">
        <div class="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-2xl"><p class="text-xs font-black uppercase opacity-70 mb-2">이번 주 핵심 요약</p><p class="font-bold leading-relaxed">총 매출 <b>${fmt(rev)}</b>, 총 지출 <b>${fmt(cost)}</b>으로 <b>${fmt(rev-cost)}</b>의 순이익. 최고 매출 숙소는 <b>${top?.name||'-'}</b>이며, ${critical.length}건의 특이사항이 발생했습니다.</p></div>
        <div><h4 class="font-black mb-3">📈 매출 현황</h4><div class="bg-slate-50 p-4 rounded-xl"><p class="text-sm">총 ${store.bookings.length}건 예약 / 평균 ${fmt(store.bookings.length?Math.round(rev/store.bookings.length):0)}</p></div></div>
        <div><h4 class="font-black mb-3">💳 주요 지출</h4><div class="bg-slate-50 p-4 rounded-xl space-y-2">${Object.entries(store.expenses.reduce((a,e)=>{a[e.category]=(a[e.category]||0)+e.amount;return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`<div class="flex justify-between text-sm"><span class="font-bold">${k}</span><span class="font-black text-red-500">${fmt(v)}</span></div>`).join('')}</div></div>
        <div><h4 class="font-black mb-3">🚨 특이사항</h4><div class="bg-red-50 p-4 rounded-xl space-y-2">${critical.length?critical.map(l=>`<p class="text-sm font-bold text-red-700">• ${l.message}</p>`).join(''):'<p class="text-sm text-slate-500">없음</p>'}</div></div>
        <div class="flex gap-2 pt-4 border-t"><button onclick="window.print()" class="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black">📄 인쇄/PDF</button><button onclick="toast('수신자 '+store.reportRecipients.length+'명 발송','success')" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black">📧 발송</button></div>
      </div>`, 'max-w-3xl');
  }

  admOps(c) {
    const ops = store.opsData || {};
    const sumSedae = store.properties.reduce((s,p)=>s+(p.sedaebi||0),0);
    const sumTotalRev = store.properties.reduce((s,p)=>s+(ops[p.id]?.totalRev||0),0);
    const sumSilip = store.properties.reduce((s,p)=>s+(ops[p.id]?.silip||0),0);
    const sumFinalCost = store.properties.reduce((s,p)=>s+(ops[p.id]?.finalCost||0),0);
    const sumFinalProfit = store.properties.reduce((s,p)=>s+(ops[p.id]?.finalProfit||0),0);
    const sumOpCost = store.properties.reduce((s,p)=>s+(ops[p.id]?.opCost||0),0);
    c.innerHTML = `<div class="mb-6"><h2 class="text-3xl font-black mb-1">📋 [큐제이] 단기임대 세팅 및 관리 리스트</h2><p class="text-slate-500 text-sm font-medium">모든 매물의 운영 데이터 통합 관리</p></div>
      <div class="grid grid-cols-6 gap-3 mb-6">
        <div class="bg-amber-50 p-4 rounded-xl border border-amber-200"><p class="text-[9px] font-black text-amber-600 uppercase">세대비</p><p class="text-lg font-black text-amber-700 mt-1">${fmtNum(sumSedae)}</p></div>
        <div class="bg-blue-50 p-4 rounded-xl border border-blue-200"><p class="text-[9px] font-black text-blue-600 uppercase">총매출</p><p class="text-lg font-black text-blue-700 mt-1">${fmtNum(sumTotalRev)}</p></div>
        <div class="bg-green-50 p-4 rounded-xl border border-green-200"><p class="text-[9px] font-black text-green-600 uppercase">실입금액</p><p class="text-lg font-black text-green-700 mt-1">${fmtNum(sumSilip)}</p></div>
        <div class="bg-red-50 p-4 rounded-xl border border-red-200"><p class="text-[9px] font-black text-red-600 uppercase">최종비용</p><p class="text-lg font-black text-red-700 mt-1">${fmtNum(sumFinalCost)}</p></div>
        <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200"><p class="text-[9px] font-black text-emerald-600 uppercase">최종순수익</p><p class="text-lg font-black text-emerald-700 mt-1">${fmtNum(sumFinalProfit)}</p></div>
        <div class="bg-slate-900 p-4 rounded-xl text-white"><p class="text-[9px] font-black uppercase opacity-70">운영비</p><p class="text-lg font-black mt-1">${fmtNum(sumOpCost)}</p></div>
      </div>
      <div class="bg-white rounded-2xl border overflow-auto max-h-[70vh]">
        <table class="ops-table w-full text-xs"><thead class="sticky top-0 z-10"><tr class="bg-slate-800 text-white">${['No','매니저','매물','세대비','매막매출','관리비','청소비','총매출','실입금액','수리','청소','가스','인터넷','분리수거','시작','마감','최종비용','순수익','운영일','월평균','주단가','월예상','운영비','주소','편집'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${store.properties.map((p,i)=>{
          const o = ops[p.id]||{};
          return `<tr class="hover:bg-blue-50/30">
            <td class="text-center font-black">${i+1}</td>
            <td class="text-center">${mgrTag(p.manager)}</td>
            <td class="font-black whitespace-nowrap">${p.name}</td>
            <td class="text-right font-bold text-amber-600">${fmtNum(p.sedaebi||0)}</td>
            <td class="text-right">${fmtNum(o.maemakMae||0)}</td>
            <td class="text-right">${fmtNum(o.gwanli||0)}</td>
            <td class="text-right">${fmtNum(o.cheongso||0)}</td>
            <td class="text-right font-black text-blue-600">${fmtNum(o.totalRev||0)}</td>
            <td class="text-right font-black text-green-600 bg-green-50">${fmtNum(o.silip||0)}</td>
            <td class="text-center text-[10px]">${o.repair||'-'}</td>
            <td class="text-center text-[10px]">${o.entryClean||'-'}</td>
            <td class="text-center text-[10px]">${o.gas||'-'}</td>
            <td class="text-center text-[10px]">${o.netProvider||'-'}</td>
            <td class="text-center text-[10px]">${o.recycle||'-'}</td>
            <td class="text-center font-mono">${o.startOp||'-'}</td>
            <td class="text-center font-mono">${o.endOp||'-'}</td>
            <td class="text-right font-bold text-red-500">${fmtNum(o.finalCost||0)}</td>
            <td class="text-right font-black text-emerald-600">${fmtNum(o.finalProfit||0)}</td>
            <td class="text-center font-bold">${o.opDays||0}</td>
            <td class="text-right font-bold">${fmtNum(o.avgMonth||0)}</td>
            <td class="text-right text-[10px]">${fmtNum(o.weekly||0)}</td>
            <td class="text-right font-bold">${fmtNum(o.monthly||0)}</td>
            <td class="text-right font-bold text-slate-500">${fmtNum(o.opCost||0)}</td>
            <td class="text-[10px]"><a href="${p.guide||'#'}" target="_blank" class="text-blue-600 underline">${(p.address||p.location||'-').slice(0,20)}</a></td>
            <td class="text-center"><button onclick="router.showOpsForm(${p.id})" class="p-1.5 bg-slate-100 rounded-lg hover:bg-blue-500 hover:text-white"><i data-lucide="edit-3" class="w-3 h-3"></i></button></td>
          </tr>`;
        }).join('')}</tbody></table>
      </div>
      <p class="text-xs text-slate-400 mt-4 font-medium">💡 편집 버튼으로 운영 데이터 수정</p>`;
    lucide.createIcons();
  }

  showOpsForm(propId) {
    const p = store.prop(propId);
    const o = (store.opsData||{})[propId]||{};
    openModal(`✏️ ${p.name} 운영 데이터`, `<form id="opsF" class="space-y-4">
      <div class="grid grid-cols-3 gap-3">
        ${[['sedaebi','세대비',p.sedaebi||0],['maemakMae','매막매출',o.maemakMae||0],['gwanli','관리비',o.gwanli||0],['cheongso','청소비',o.cheongso||0],['totalRev','총매출',o.totalRev||0],['silip','실입금액',o.silip||0]].map(([k,l,v])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input type="number" name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}
        ${[['repair','수리',o.repair||''],['entryClean','입주청소',o.entryClean||''],['gas','도시가스',o.gas||'']].map(([k,l,v])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}
        <div class="col-span-3"><label class="text-[10px] font-black text-slate-400 uppercase">인터넷</label><input name="netProvider" value="${o.netProvider||''}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>
        ${[['recycle','분리수거',o.recycle||''],['startOp','운영시작',o.startOp||''],['endOp','운영마감',o.endOp||'']].map(([k,l,v])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}
        ${[['finalCost','최종비용',o.finalCost||0],['finalProfit','최종순수익',o.finalProfit||0],['opDays','운영일',o.opDays||0],['avgMonth','월평균',o.avgMonth||0],['weekly','주단가',o.weekly||0],['monthly','월예상',o.monthly||0],['opCost','운영비',o.opCost||0]].map(([k,l,v])=>`<div><label class="text-[10px] font-black text-slate-400 uppercase">${l}</label><input type="number" name="${k}" value="${v}" class="w-full p-3 border rounded-xl font-bold mt-1"></div>`).join('')}
      </div>
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">저장</button>
    </form>`, 'max-w-4xl');
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
      await store.addLog(`${p.name} 운영 데이터 수정`, true);
      toast('저장됨','success');
      closeModal();
      await this.renderAdminTab();
    };
  }

  admCustomers(c) {
    const map = {};
    store.bookings.forEach(b=>{const k=b.guest+'|'+b.contact;if(!map[k])map[k]={guest:b.guest,contact:b.contact,nat:b.nationality,n:0,t:0,plats:new Set(),last:''};map[k].n++;map[k].t+=b.price;map[k].plats.add(b.platform);if(b.checkIn>map[k].last)map[k].last=b.checkIn});
    const list = Object.values(map).sort((a,b)=>b.t-a.t);
    c.innerHTML = `<h2 class="text-3xl font-black mb-2">👥 고객 관리</h2><p class="text-slate-500 mb-6 font-medium">플랫폼별 예약 정보 기반 매출 분석</p>
      <div class="grid grid-cols-4 gap-4 mb-6"><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">총 고객수</p><p class="text-2xl font-black mt-2">${list.length}명</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">재방문</p><p class="text-2xl font-black text-blue-600 mt-2">${list.filter(x=>x.n>1).length}명</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">평균객단가</p><p class="text-2xl font-black mt-2">${fmt(list.length?Math.round(list.reduce((s,x)=>s+x.t,0)/list.length):0)}</p></div><div class="bg-white p-5 rounded-2xl border"><p class="text-[10px] font-black text-slate-400 uppercase">외국인</p><p class="text-2xl font-black mt-2">${list.filter(x=>x.nat!=='한국').length}명</p></div></div>
      <div class="bg-white rounded-2xl border overflow-x-auto"><table class="w-full min-w-[1000px]"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr>${['No.','예약자','연락처','국적','횟수','총매출','평균','플랫폼','최근'].map(h=>`<th class="px-4 py-3 text-left">${h}</th>`).join('')}</tr></thead><tbody class="text-sm divide-y">${list.map((cu,i)=>`<tr class="hover:bg-blue-50/30"><td class="px-4 py-3 font-black">${i+1}</td><td class="px-4 py-3 font-black">${cu.guest}</td><td class="px-4 py-3 font-mono text-xs">${cu.contact}</td><td class="px-4 py-3"><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black">${cu.nat||'-'}</span></td><td class="px-4 py-3 text-center font-black ${cu.n>1?'text-blue-600':''}">${cu.n}회 ${cu.n>1?'⭐':''}</td><td class="px-4 py-3 font-black text-blue-600">${fmt(cu.t)}</td><td class="px-4 py-3 font-bold">${fmt(Math.round(cu.t/cu.n))}</td><td class="px-4 py-3 text-xs font-bold">${[...cu.plats].join(', ')}</td><td class="px-4 py-3 text-xs font-bold text-slate-500">${cu.last}</td></tr>`).join('')}</tbody></table></div>`;
  }

  admUsers(c) {
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">🔐 이용자/권한 관리</h2><button onclick="router.showUserForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 신규 계정</button></div>
      <div class="bg-white rounded-2xl border overflow-hidden"><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr>${['ID','이름','역할','색상','연락처','이메일','권한','관리'].map(h=>`<th class="px-4 py-3 text-left">${h}</th>`).join('')}</tr></thead><tbody class="text-sm divide-y">${store.users.map(u=>`<tr class="hover:bg-blue-50/30"><td class="px-4 py-3 font-mono font-black">${u.id}</td><td class="px-4 py-3 font-black">${u.name}</td><td class="px-4 py-3"><span class="px-2 py-1 rounded text-[10px] font-black ${u.role==='Admin'?'bg-amber-100 text-amber-700':u.role==='Manager'?'bg-blue-100 text-blue-700':'bg-slate-100'}">${u.role}</span></td><td class="px-4 py-3"><span class="tag-mgr" style="background:${u.tagColor||'#94a3b8'}">${(u.name.match(/\((.+)\)/)||[,u.name])[1]}</span></td><td class="px-4 py-3 text-xs">${u.contact||'-'}</td><td class="px-4 py-3 text-xs">${u.email||'-'}</td><td class="px-4 py-3 text-xs font-black text-blue-600">${u.role==='Admin'?'전체':u.role==='Director'?'뷰':(u.permissions?.length||0)+'개'}</td><td class="px-4 py-3"><button onclick="router.showUserForm('${u.id}')" class="p-2 bg-slate-100 rounded-lg mr-1"><i data-lucide="edit-3" class="w-4 h-4"></i></button>${u.id!=='admin'?`<button onclick="router.delUser('${u.id}')" class="p-2 bg-red-50 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
    lucide.createIcons();
  }

  showUserForm(uid=null) {
    const u = uid?store.user(uid):{id:'',pw:'',name:'',role:'Manager',contact:'',email:'',memo:'',permissions:[],tagColor:'#60a5fa'};
    openModal(uid?'✏️ 이용자 수정':'🆕 신규 계정', `<form id="uf" class="space-y-4">
      <div class="grid grid-cols-2 gap-3"><input name="id" value="${u.id}" placeholder="아이디" class="p-3 border rounded-xl font-bold" ${uid?'readonly':'required'}><input name="pw" value="${u.pw||''}" placeholder="비밀번호" class="p-3 border rounded-xl font-bold" required></div>
      <div class="grid grid-cols-2 gap-3"><input name="name" value="${u.name}" placeholder="이름 (예: 박보람(맨투))" class="p-3 border rounded-xl font-bold" required><select name="role" class="p-3 border rounded-xl font-bold">${['Admin','Manager','Director'].map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></div>
      <div class="grid grid-cols-3 gap-3"><input name="contact" value="${u.contact||''}" placeholder="연락처" class="p-3 border rounded-xl font-bold"><input name="email" value="${u.email||''}" placeholder="이메일" class="p-3 border rounded-xl font-bold"><input type="color" name="tagColor" value="${u.tagColor||'#60a5fa'}" class="p-2 border rounded-xl h-12"></div>
      <input name="memo" value="${u.memo||''}" placeholder="비고사항" class="w-full p-3 border rounded-xl font-bold">
      <div class="bg-slate-50 p-4 rounded-xl"><p class="text-xs font-black text-slate-500 uppercase mb-3">🏠 매물 권한 (Manager만 해당)</p><div class="grid grid-cols-2 gap-2">${store.properties.map(p=>`<label class="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer"><input type="checkbox" name="perm_${p.id}" ${u.permissions?.includes(p.id)?'checked':''}><span class="text-xs font-bold">${p.name}</span></label>`).join('')}</div></div>
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">${uid?'수정':'생성'}</button>
    </form>`, 'max-w-2xl');
    document.getElementById('uf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const perms = [];
      store.properties.forEach(p => { if (d['perm_'+p.id]) perms.push(p.id); delete d['perm_'+p.id]; });
      d.permissions = perms;
      showLoading(true);
      try { await store.upsertUser(d); toast('저장','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }

  async delUser(id) {
    if (!confirm('삭제?')) return;
    await store.delUser(id); await this.renderAdminTab();
  }

  admProfileReq(c) {
    const all = [...store.profileRequests].sort((a,b)=>b.id-a.id);
    const pending = all.filter(r=>r.status==='pending');
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">👤 프로필 변경 요청 (대기 ${pending.length}건)</h2>
      ${all.length?all.map(r=>{
        const sc = {pending:'bg-amber-100 text-amber-700 border-amber-300',approved:'bg-green-100 text-green-700 border-green-300',rejected:'bg-red-100 text-red-700 border-red-300'}[r.status];
        const st = {pending:'⏳ 대기',approved:'✅ 승인',rejected:'❌ 반려'}[r.status];
        const lbl = {name:'이름',contact:'연락처',email:'이메일',pw:'비밀번호'};
        return `<div class="bg-white p-6 rounded-2xl border-2 ${sc} mb-4"><div class="flex items-center justify-between mb-4"><div><span class="px-3 py-1 rounded-full font-black text-xs">${st}</span><span class="ml-3 text-xs text-slate-400 font-bold">${r.requestedAt}</span></div><div><p class="font-black">${r.userName}</p></div></div><div class="bg-slate-50 p-4 rounded-xl mb-4">${Object.keys(r.changes).map(k=>{const ov=k==='pw'?'****':(r.original[k]||'(없음)');const nv=k==='pw'?'****':r.changes[k];return `<div class="flex items-center gap-2 text-sm py-1"><span class="font-black w-20 text-slate-600">${lbl[k]||k}</span><span class="text-slate-400 line-through">${ov}</span><i data-lucide="arrow-right" class="w-3 h-3 text-blue-500"></i><span class="text-blue-600 font-black">${nv}</span></div>`}).join('')}</div>${r.reason?`<div class="bg-red-50 border border-red-200 rounded-xl p-3 mb-3"><p class="text-xs font-black text-red-700">반려사유: ${r.reason}</p></div>`:''}${r.status==='pending'?`<div class="flex gap-2"><button onclick="router.approveReq(${r.id})" class="flex-1 bg-green-500 text-white py-3 rounded-xl font-black">✅ 승인</button><button onclick="router.rejectReq(${r.id})" class="flex-1 bg-red-500 text-white py-3 rounded-xl font-black">❌ 반려</button></div>`:`<p class="text-xs text-slate-400 font-bold">처리: ${r.processedAt}</p>`}</div>`;
      }).join(''):'<div class="bg-white p-12 rounded-2xl border text-center text-slate-400"><i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3"></i><p class="font-bold">요청 없음</p></div>'}`;
    lucide.createIcons();
  }
  async approveReq(id){if(!confirm('승인?'))return;showLoading(true);try{await store.approveProfileChange(id);toast('승인','success');await this.renderAdminTab();this.renderAdminNav()}catch(e){toast('실패','error')}finally{showLoading(false)}}
  async rejectReq(id){const reason=prompt('반려 사유 (선택)')||'';showLoading(true);try{await store.rejectProfileChange(id,reason);toast('반려','warning');await this.renderAdminTab();this.renderAdminNav()}catch(e){toast('실패','error')}finally{showLoading(false)}}

  admChats(c) {
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">💬 채팅 관리</h2><button onclick="router.admChatsMode=router.admChatsMode==='integrated'?'list':'integrated';router.renderAdminTab()" class="bg-slate-900 text-white px-5 py-3 rounded-xl font-black text-sm">${this.admChatsMode==='integrated'?'📋 리스트':'📊 통합'}</button></div>`;
    if (this.admChatsMode==='integrated') {
      c.innerHTML += `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${store.properties.map(p=>{const ch=store.chats.filter(x=>x.propId===p.id);return `<div class="bg-white p-4 rounded-2xl border"><h4 class="font-black mb-3 flex items-center gap-2">${p.name} ${ch.length?'<span class="w-2 h-2 bg-green-500 rounded-full"></span>':''}</h4><div class="h-60 overflow-y-auto scrollbar bg-slate-50 rounded-xl p-3 space-y-2 mb-2">${ch.length?ch.slice(-5).map(c=>`<div><p class="text-[9px] font-black text-slate-400">${c.sender}·${c.time.slice(5,16)}</p><p class="text-xs font-bold">${c.message}</p></div>`).join(''):'<p class="text-xs text-slate-400 text-center py-10">대화 없음</p>'}</div><button onclick="router.showChatBox(${p.id})" class="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-black">입장 & 멘트</button></div>`}).join('')}</div>`;
    } else {
      c.innerHTML += `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${store.properties.map(p=>{const ch=store.chats.filter(x=>x.propId===p.id);const last=ch[ch.length-1];return `<div onclick="router.showChatBox(${p.id})" class="bg-white p-5 rounded-2xl border hover:shadow-xl cursor-pointer flex items-center gap-4"><img src="${p.image}" class="w-16 h-16 rounded-xl object-cover"><div class="flex-1 min-w-0"><div class="flex items-center gap-2"><p class="font-black">${p.name}</p>${ch.length?'<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-black">최근대화</span>':''}</div><p class="text-xs text-slate-500 truncate mt-1">${last?last.sender+': '+last.message:'대화없음'}</p></div></div>`}).join('')}</div>`;
    }
  }

  admLogs(c) {
    const specials = store.logs.filter(l=>l.special);
    c.innerHTML = `<h2 class="text-3xl font-black mb-6">📋 로그 관리</h2>
      ${specials.length?`<div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6 mb-6"><h3 class="font-black text-red-700 mb-3 flex items-center gap-2"><i data-lucide="alert-triangle" class="w-5 h-5"></i>🚨 특이사항 (${specials.length}건)</h3><div class="space-y-2">${specials.slice(0,10).map(l=>`<div class="bg-white p-3 rounded-lg"><p class="text-sm font-black text-red-700">${l.message}</p><p class="text-[10px] text-slate-400 font-bold mt-1">${l.time} · ${l.user}</p></div>`).join('')}</div></div>`:''}
      <div class="bg-white rounded-2xl border overflow-hidden"><div class="p-5 border-b bg-slate-50"><h3 class="font-black text-sm uppercase">전체 활동 로그 (${store.logs.length})</h3></div><div class="divide-y max-h-[600px] overflow-y-auto scrollbar">${store.logs.slice(0,100).map(l=>`<div class="p-4 flex items-center gap-3 hover:bg-slate-50 ${l.special?'bg-red-50/30':''}"><div class="w-2 h-2 rounded-full ${l.special?'bg-red-500':'bg-slate-300'}"></div><div class="flex-1 min-w-0"><p class="text-sm font-bold truncate">${l.message}</p><p class="text-[10px] text-slate-400 font-bold mt-0.5">${l.time} · ${l.user}</p></div>${l.special?'<span class="px-2 py-0.5 bg-red-500 text-white rounded text-[9px] font-black">특이</span>':''}</div>`).join('')}</div></div>`;
    lucide.createIcons();
  }

  admStaff(c) {
    const now = new Date();
    c.innerHTML = `<div class="flex justify-between items-center mb-6"><h2 class="text-3xl font-black">👷 직원 관리</h2><div class="flex gap-2"><div class="bg-slate-100 rounded-xl p-1 flex"><button onclick="router.staffMode='cal';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.staffMode!=='list'?'bg-white shadow':'text-slate-500'}">캘린더</button><button onclick="router.staffMode='list';router.renderAdminTab()" class="px-4 py-2 rounded-lg font-black text-sm ${this.staffMode==='list'?'bg-white shadow':'text-slate-500'}">리스트</button></div><button onclick="router.showScheduleForm()" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-black text-sm">+ 스케줄</button></div></div>`;
    if (this.staffMode==='list') {
      c.innerHTML += `<div class="bg-white rounded-2xl border overflow-hidden mb-6"><div class="p-4 border-b bg-slate-50"><h3 class="font-black text-sm uppercase">직원 리스트</h3></div><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr>${['No.','태그','이름','역할','연락처','이메일','담당','비고'].map(h=>`<th class="px-4 py-3 text-left">${h}</th>`).join('')}</tr></thead><tbody class="text-sm divide-y">${store.users.filter(u=>u.role!=='Admin').map((u,i)=>`<tr><td class="px-4 py-3 font-black">${i+1}</td><td class="px-4 py-3">${mgrTag(u.id)}</td><td class="px-4 py-3 font-black">${u.name}</td><td class="px-4 py-3 text-xs font-black">${u.role}</td><td class="px-4 py-3 text-xs font-mono">${u.contact||'-'}</td><td class="px-4 py-3 text-xs">${u.email||'-'}</td><td class="px-4 py-3 text-xs font-bold text-blue-600">${u.permissions?.length||0}개</td><td class="px-4 py-3 text-xs text-slate-500">${u.memo||'-'}</td></tr>`).join('')}</tbody></table></div>
      <div class="bg-white rounded-2xl border overflow-hidden"><div class="p-4 border-b bg-slate-50"><h3 class="font-black text-sm uppercase">스케줄 리스트</h3></div><table class="w-full"><thead class="bg-slate-50 text-[10px] text-slate-400 font-black uppercase"><tr>${['일시','담당자','숙소','업무','알람','메모','관리'].map(h=>`<th class="px-4 py-3 text-left">${h}</th>`).join('')}</tr></thead><tbody class="text-sm divide-y">${[...store.schedule].sort((a,b)=>a.date.localeCompare(b.date)).map(s=>`<tr><td class="px-4 py-3 font-black">${s.date} ${s.time}</td><td class="px-4 py-3">${s.staff}</td><td class="px-4 py-3 text-xs">${store.prop(s.propId)?.name||'-'}</td><td class="px-4 py-3">${s.task}</td><td class="px-4 py-3 text-xs">${(s.alarm||[]).map(a=>a+'분').join(', ')||'없음'}</td><td class="px-4 py-3 text-xs text-slate-500">${s.memo||'-'}</td><td class="px-4 py-3"><button onclick="router.delSchedule(${s.id})" class="text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('')}</tbody></table></div>`;
    } else {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDow = first.getDay();
      const days = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      let html = `<div class="bg-white p-6 rounded-2xl border"><h3 class="text-xl font-black mb-4">${now.getFullYear()}년 ${now.getMonth()+1}월 직원 스케줄</h3><div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase mb-2">${['일','월','화','수','목','금','토'].map(d=>`<div class="text-center py-2">${d}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1">`;
      for (let i=0; i<startDow; i++) html += `<div class="min-h-[110px] bg-slate-50/50 rounded-lg"></div>`;
      for (let d=1; d<=days; d++) {
        const ds = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const sch = store.schedule.filter(s=>s.date===ds);
        html += `<div class="min-h-[110px] border rounded-lg p-1.5 ${ds===todayStr()?'ring-2 ring-blue-500':''}"><div class="text-xs font-black">${d}</div>${sch.map(s=>`<div class="text-[9px] font-bold truncate px-1 py-0.5 rounded mt-0.5 bg-purple-100 text-purple-700">${s.time} ${s.task}</div>`).join('')}</div>`;
      }
      html += `</div></div>`;
      c.innerHTML += html;
    }
    lucide.createIcons();
  }

  showScheduleForm() {
    openModal('📅 스케줄 등록', `<form id="sf" class="space-y-4">
      <div class="grid grid-cols-2 gap-3"><input type="date" name="date" value="${todayStr()}" class="p-3 border rounded-xl font-bold" required><input type="time" name="time" value="10:00" class="p-3 border rounded-xl font-bold" required></div>
      <select name="staff" class="w-full p-3 border rounded-xl font-bold" required>${store.users.filter(u=>u.role!=='Admin').map(u=>`<option>${u.name}</option>`).join('')}</select>
      <select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select>
      <input name="task" placeholder="업무 (예: 퇴실청소)" class="w-full p-3 border rounded-xl font-bold" required>
      <div class="bg-slate-50 p-4 rounded-xl"><p class="text-xs font-black text-slate-500 uppercase mb-2">🔔 알람 (복수)</p><div class="flex gap-2">${[5,15,30,60].map(m=>`<label class="flex items-center gap-1 px-3 py-2 bg-white rounded-lg cursor-pointer font-bold text-xs"><input type="checkbox" name="a${m}"> ${m}분</label>`).join('')}</div></div>
      <input name="memo" placeholder="메모" class="w-full p-3 border rounded-xl font-bold">
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">등록 & 알림</button>
    </form>`, 'max-w-xl');
    document.getElementById('sf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const alarm = [];
      [5,15,30,60].forEach(m => { if (d['a'+m]) alarm.push(m); delete d['a'+m]; });
      d.alarm = alarm;
      showLoading(true);
      try { await store.addSchedule(d); toast('등록 + 담당자 알림','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }

  async delSchedule(id) {
    if (!confirm('삭제?')) return;
    await store.delSchedule(id); await this.renderAdminTab();
  }

  admEtc(c) {
    c.innerHTML = `<h2 class="text-3xl font-black mb-2">📦 기타 관리</h2><p class="text-slate-500 mb-6 font-medium">인터넷 관리 & 물품추천 관리</p>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="bg-white p-6 rounded-2xl border"><div class="flex justify-between items-center mb-4"><h3 class="font-black flex items-center gap-2"><i data-lucide="wifi" class="w-5 h-5 text-blue-600"></i>인터넷 관리</h3><button onclick="router.showInternetForm()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black">+ 추가</button></div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-xs font-bold text-blue-700">🔗 월비용은 지출관리와 자동 양방향 연동</div>
          <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50 font-black text-slate-400 uppercase"><tr>${['숙소','통신사','요금제','월비용 🔗','설치일','약정','WiFi','관리'].map(h=>`<th class="px-2 py-2 text-left">${h}</th>`).join('')}</tr></thead><tbody class="divide-y">${store.internet.map(n=>`<tr><td class="px-2 py-2 font-black">${store.prop(n.propId)?.name||'-'}</td><td class="px-2 py-2 font-bold">${n.provider}</td><td class="px-2 py-2">${n.plan}</td><td class="px-2 py-2 text-right font-black text-red-500">${fmt(n.monthly)}</td><td class="px-2 py-2 text-[10px]">${n.installDate}</td><td class="px-2 py-2 text-[10px]">${n.contract}</td><td class="px-2 py-2 font-mono text-[10px]">${n.wifiId||''}<br/>${n.wifiPw||''}</td><td class="px-2 py-2 text-center"><button onclick="router.showInternetForm(${n.id})" class="p-1.5 bg-slate-100 rounded-lg mr-1"><i data-lucide="edit-3" class="w-3 h-3"></i></button><button onclick="router.delInternet(${n.id})" class="p-1.5 bg-red-50 text-red-500 rounded-lg"><i data-lucide="trash-2" class="w-3 h-3"></i></button></td></tr>`).join('')}</tbody><tfoot class="bg-slate-900 text-white font-black"><tr><td colspan="3" class="px-2 py-2 text-right">월비용 합계</td><td class="px-2 py-2 text-right">${fmt(store.internet.reduce((s,n)=>s+n.monthly,0))}</td><td colspan="4"></td></tr></tfoot></table></div>
        </div>
        <div class="bg-white p-6 rounded-2xl border"><div class="flex justify-between items-center mb-4"><h3 class="font-black flex items-center gap-2"><i data-lucide="shopping-bag" class="w-5 h-5 text-green-600"></i>물품 추천 관리</h3><button onclick="router.showProductForm()" class="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-black">+ 추가</button></div>
          <div class="space-y-2 max-h-[500px] overflow-y-auto scrollbar">${store.products.length?store.products.map(p=>`<div class="p-3 bg-slate-50 rounded-xl flex items-center gap-3 hover:shadow-md transition"><img src="${p.image||'https://via.placeholder.com/60'}" onerror="this.src='https://via.placeholder.com/60'" class="w-14 h-14 rounded-lg object-cover border"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-black text-[10px]">${p.category}</span>${p.vendor?`<span class="text-[10px] text-slate-400 font-bold">${p.vendor}</span>`:''}</div><p class="font-black text-sm truncate">${p.name}</p><p class="text-[10px] text-slate-400 font-bold truncate">${p.memo||'-'}</p></div><div class="text-right"><p class="font-black text-red-500 text-sm">${fmt(p.price)}</p><div class="flex gap-1 mt-1">${p.url?`<a href="${p.url}" target="_blank" class="p-1.5 bg-white rounded-lg text-blue-600"><i data-lucide="external-link" class="w-3 h-3"></i></a>`:''}<button onclick="router.showProductForm(${p.id})" class="p-1.5 bg-white rounded-lg"><i data-lucide="edit-3" class="w-3 h-3"></i></button><button onclick="router.delProduct(${p.id})" class="p-1.5 bg-white rounded-lg text-red-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div></div>`).join(''):'<p class="text-center text-slate-400 py-12 font-bold">+ 물품 추가 버튼을 눌러주세요</p>'}</div>
        </div>
      </div>`;
    lucide.createIcons();
  }

  showInternetForm(nid=null) {
    const n = nid?store.internet.find(x=>x.id===parseInt(nid)):{id:'',propId:store.properties[0]?.id,provider:'KT',plan:'기가 인터넷',monthly:33000,installDate:todayStr(),contract:'3년',wifiId:'',wifiPw:''};
    openModal(nid?'✏️ 인터넷 수정':'🆕 인터넷 등록', `<form id="nf" class="space-y-4">
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-bold text-blue-700">🔗 월비용 수정 시 지출관리에 자동 반영됩니다.</div>
      <select name="propId" class="w-full p-3 border rounded-xl font-bold" required>${store.properties.map(p=>`<option value="${p.id}" ${n.propId===p.id?'selected':''}>${p.name}</option>`).join('')}</select>
      <div class="grid grid-cols-2 gap-3"><input name="provider" value="${n.provider}" placeholder="통신사" class="p-3 border rounded-xl font-bold" required><input name="plan" value="${n.plan}" placeholder="요금제" class="p-3 border rounded-xl font-bold" required></div>
      <div><label class="text-[10px] font-black text-red-500 uppercase">월 비용 (🔗 자동연동)</label><input type="number" name="monthly" value="${n.monthly}" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl mt-1" required></div>
      <div class="grid grid-cols-2 gap-3"><div><label class="text-[10px] font-black text-slate-400 uppercase">설치일</label><input type="date" name="installDate" value="${n.installDate}" class="w-full p-3 border rounded-xl font-bold mt-1"></div><div><label class="text-[10px] font-black text-slate-400 uppercase">약정</label><input name="contract" value="${n.contract}" class="w-full p-3 border rounded-xl font-bold mt-1"></div></div>
      <div class="grid grid-cols-2 gap-3"><input name="wifiId" value="${n.wifiId||''}" placeholder="WiFi SSID" class="p-3 border rounded-xl font-bold font-mono"><input name="wifiPw" value="${n.wifiPw||''}" placeholder="WiFi 비밀번호" class="p-3 border rounded-xl font-bold font-mono"></div>
      <button class="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase">${nid?'수정':'등록'}</button>
    </form>`, 'max-w-2xl');
    document.getElementById('nf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (nid) d.id = parseInt(nid);
      showLoading(true);
      try { await store.upsertInternet(d); toast('완료','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }

  async delInternet(id) {
    if (!confirm('삭제 시 지출도 함께 삭제됩니다. 계속?')) return;
    showLoading(true);
    try { await store.delInternet(id); toast('삭제','success'); await this.renderAdminTab(); }
    catch(e) { toast('실패','error'); } finally { showLoading(false); }
  }

  showProductForm(pid=null) {
    const p = pid?store.products.find(x=>x.id===parseInt(pid)):{id:'',category:'침구',name:'',price:10000,url:'',image:'',memo:'',vendor:'쿠팡'};
    const cats = ['침구','욕실','주방','가전','소모품','청소용품','편의용품','인테리어','기타'];
    openModal(pid?'✏️ 물품 수정':'🆕 물품 등록', `<form id="prf" class="space-y-4">
      <div class="grid grid-cols-2 gap-3"><select name="category" class="p-3 border rounded-xl font-bold" required>${cats.map(c=>`<option ${p.category===c?'selected':''}>${c}</option>`).join('')}</select><input name="vendor" value="${p.vendor||''}" placeholder="판매처" class="p-3 border rounded-xl font-bold"></div>
      <input name="name" value="${p.name}" placeholder="상품명" class="w-full p-3 border rounded-xl font-bold" required>
      <div><label class="text-[10px] font-black text-red-500 uppercase">가격</label><input type="number" name="price" value="${p.price}" class="w-full p-4 border-2 rounded-xl font-black text-red-500 text-2xl mt-1" required></div>
      <input name="image" value="${p.image||''}" placeholder="이미지 URL" class="w-full p-3 border rounded-xl font-bold">
      <input name="url" value="${p.url||''}" placeholder="구매 링크" class="w-full p-3 border rounded-xl font-bold">
      <textarea name="memo" placeholder="메모" class="w-full p-3 border rounded-xl h-20 font-bold">${p.memo||''}</textarea>
      ${p.image?`<div class="bg-slate-50 p-3 rounded-xl"><p class="text-[10px] font-black text-slate-400 uppercase mb-2">미리보기</p><img src="${p.image}" onerror="this.style.display='none'" class="w-24 h-24 object-cover rounded-lg"></div>`:''}
      <button class="w-full bg-green-600 text-white py-4 rounded-xl font-black uppercase">${pid?'수정':'등록'}</button>
    </form>`, 'max-w-2xl');
    document.getElementById('prf').onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (pid) d.id = pid;
      showLoading(true);
      try { await store.upsertProduct(d); toast('완료','success'); closeModal(); await this.renderAdminTab(); }
      catch(err) { toast('실패','error'); } finally { showLoading(false); }
    };
  }

  async delProduct(id) {
    if (!confirm('삭제?')) return;
    await store.delProduct(id); await this.renderAdminTab();
  }
}

window.Router = Router;