class Store {
  constructor() {
    this.currentUser = JSON.parse(sessionStorage.getItem('qj_user')) || null;
    this.properties = []; this.bookings = []; this.expenses = []; this.chats = [];
    this.users = []; this.groups = []; this.platforms = []; this.internet = [];
    this.products = []; this.schedule = []; this.opsData = {};
    this.majorCats = ["초기투자지출","고정지출","변동지출"];
    this.subCats = {}; this.logs = []; this.userNotifs = {};
    this.profileRequests = []; this.reportRecipients = [];
    this.customerMemos = {};    this.siteConfig = null;
    this.securitySettings = null;
    this._notifiedToday = new Set();
    
    this.loaded = false;
  }

  async loadAll() {
    if (!this.currentUser) return;
    try {
      showLoading(true);
      const cols = ['properties','bookings','expenses','chats','users','groups','platforms','internet','products','schedule','logs','profileRequests','majorCats','subCats','userNotifs','reportRecipients','opsData','customerMemos','siteConfig','securitySettings'];
      const results = await Promise.all(cols.map(c => API.list(c).catch(()=>null)));
      cols.forEach((c,i) => {
        const v = results[i];
        if (v === null) return;
        if (['subCats','userNotifs','opsData','customerMemos'].includes(c)) {
          this[c] = (typeof v==='object' && !Array.isArray(v)) ? v : (this[c]||{});
        } else {
          this[c] = Array.isArray(v) ? v : (this[c]||[]);
        }
      });
      if (!this.majorCats.length) this.majorCats = ["초기투자지출","고정지출","변동지출"];
      if (!Object.keys(this.subCats).length) this.subCats = {
        "초기투자지출":["초기세팅비","리모델링비","가구구입비","가전구입비"],
        "고정지출":["월세","관리비","인터넷비","도시가스","전기요금"],
        "변동지출":["청소비","비품비","수선비","광고비","수수료"]
      };
      if (!this.groups.length)       // 사이트 설정 기본값
      if (!this.siteConfig || Array.isArray(this.siteConfig) && !this.siteConfig.length) {
        this.siteConfig = {
          title: 'QJ-PropMS',
          subtitle: '하이브리드 단기렌트 통합 관리',
          logoText: 'QJ.PMS',
          logoEmoji: '🏢',
          loginNotice: '🔑 테스트 계정 (PW: 1234)\nadmin / manager1 / manager2 / staff1',
          footerText: '© QJ Property Management',
          primaryColor: '#2563eb',
          welcomeMessage: '안녕하세요',
          kakaoWebhook: '',
          customCss: ''
        };
      }
      // 보안 설정 기본값
      if (!this.securitySettings || Array.isArray(this.securitySettings) && !this.securitySettings.length) {
        this.securitySettings = {
          sessionTimeoutMin: 30,
          require2FA: false,
          minPasswordLength: 4,
          passwordRequireSpecial: false,
          ipTracking: true
        };
      }
      // 다크모드 적용
      if (localStorage.getItem('qj_dark') === '1') {
        document.documentElement.classList.add('dark');
      }this.groups = ["서울","부산","제주"];
      this.loaded = true;
      console.log('✅ Data loaded');
    } catch(e) { console.error('Load failed:', e); toast('데이터 로드 실패: '+e.message,'error'); }
    finally { showLoading(false); }
  }

  async login(id, pw) {
    try {
      const user = await API.login(id, pw);
      this.currentUser = user;
      sessionStorage.setItem('qj_user', JSON.stringify(user));
      await this.loadAll();
      await this.addLog(`${user.name}님 접속`);
      return true;
    } catch(e) { return false; }
  }
  async logout() {
    if (this.currentUser) await this.addLog(`${this.currentUser.name}님 종료`);
    this.currentUser = null;
    sessionStorage.removeItem('qj_user');
    API.logout();
  }

  prop(id) { return this.properties.find(p => p.id === parseInt(id)); }
  user(id) { return this.users.find(u => u.id === id); }
  userByName(name) { return this.users.find(u => u.name === name); }
  hasPerm(propId) {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'Admin' || this.currentUser.role === 'Director') return true;
    return this.currentUser.permissions?.includes(parseInt(propId));
  }
  canEdit(propId) {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'Admin') return true;
    if (this.currentUser.role === 'Director') return false;
    return this.currentUser.permissions?.includes(parseInt(propId));
  }

  // ===== 알림 시스템 (링크 포함) =====
  async notify(userId, message, type='info', link=null) {
    if (!this.userNotifs[userId]) this.userNotifs[userId] = [];
    this.userNotifs[userId].unshift({
      id: Date.now()+Math.random(),
      message, type, time: nowTime(), read: false, link
    });
    if (this.userNotifs[userId].length > 100) this.userNotifs[userId].pop();
    await API.setAll('userNotifs', this.userNotifs).catch(()=>{});
  }
  async notifyAdmins(message, type='info', link=null) {
    for (const u of this.users.filter(x=>x.role==='Admin')) await this.notify(u.id, message, type, link);
  }
  async notifyManagerAssignment(propName, managerId, isNew=true) {
    if (!managerId) return;
    const mgr = this.user(managerId);
    if (!mgr) return;
    const action = isNew ? '신규 등록' : '정보 수정';
    await this.notify(managerId, `🏠 [${propName}] 숙소가 회원님께 배정되었습니다 (${action})`, 'info', {type:'home'});
    await this.notifyAdmins(`📢 ${mgr.name}님에게 [${propName}] 매물이 배정되었습니다`, 'info');
  }
  getMyNotifs() { return this.currentUser ? (this.userNotifs[this.currentUser.id] || []) : []; }
  getMyUnreadCount() { return this.getMyNotifs().filter(n=>!n.read).length; }
  async markAllRead() {
    if (!this.currentUser) return;
    (this.userNotifs[this.currentUser.id] || []).forEach(n => n.read = true);
    await API.setAll('userNotifs', this.userNotifs).catch(()=>{});
  }

  async addLog(msg, special=false) {
    const isSpec = special || /취소|삭제|권한|오류|긴급|민원|수정|요청|승인|반려/.test(msg);
    const log = {id:Date.now()+Math.random(), user:this.currentUser?.name||'System', message:msg, time:nowTime(), special:isSpec};
    this.logs.unshift(log);
    if (this.logs.length > 500) this.logs.pop();
    try { await API.create('logs', log); } catch {}
  }

  // ===== 이미지 업로드 =====
  async uploadImage(file) {
    if (file.size > 10*1024*1024) throw new Error('10MB 초과');
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // ===== 매물 =====
  async upsertProp(d) {
    if (d.id && this.properties.find(p => p.id == d.id)) {
      const updated = await API.update('properties', d.id, {...d, price:+d.price, cost:+d.cost});
      const i = this.properties.findIndex(p => p.id == d.id);
      this.properties[i] = updated;
      await this.addLog(`숙소 [${d.name}] 수정`, true);
    } else {
      d.id = Date.now(); d.status = 'empty'; d.price = +d.price; d.cost = +d.cost;
      const created = await API.create('properties', d);
      this.properties.push(created);
      await this.addLog(`신규 숙소 [${d.name}] 등록`);
    }
  }
  async delProp(id) {
    const p = this.prop(id);
    await API.delete('properties', id);
    this.properties = this.properties.filter(x => x.id !== parseInt(id));
    await this.addLog(`숙소 [${p?.name}] 삭제`, true);
  }

  // ===== 예약 =====
  async addBooking(d) {
    const p = this.prop(d.propId);
    const c = await API.create('bookings', {...d, price:+d.price, people:+d.people, propId:+d.propId});
    this.bookings.push(c);
    await this.addLog(`${p.name}: ${d.guest}님 예약 등록`);
    // 담당 매니저 알림
    if (p?.manager) {
      await this.notify(p.manager, `📅 [${p.name}] 신규 예약: ${d.guest}님 ${d.checkIn}~${d.checkOut}`, 'info', {type:'detail',propId:p.id});
    }
  }
  async updateBooking(id, d) {
    const u = await API.update('bookings', id, {...d, price:+d.price, people:+d.people, propId:+d.propId});
    const i = this.bookings.findIndex(b => b.id === parseInt(id));
    if (i > -1) this.bookings[i] = u;
    await this.addLog(`예약 수정 (${d.guest})`, true);
  }
  async delBooking(id) {
    const b = this.bookings.find(x => x.id === parseInt(id));
    await API.delete('bookings', id);
    this.bookings = this.bookings.filter(x => x.id !== parseInt(id));
    await this.addLog(`예약 취소 (${b?.guest})`, true);
  }

  // ===== 채팅 (담당자 알림) =====
  async addChat(propId, msg) {
    const c = {propId:+propId, sender:this.currentUser.name, role:this.currentUser.role, message:msg, time:nowTime()};
    const created = await API.create('chats', c);
    this.chats.push(created);
    // 채팅 알림 - 담당 매니저 + 관리자
    const p = this.prop(propId);
    if (p) {
      if (p.manager && p.manager !== this.currentUser.id) {
        await this.notify(p.manager, `💬 [${p.name}] 새 메시지: ${this.currentUser.name}님`, 'info', {type:'chat',propId:propId});
      }
      // 관리자에게도
      if (this.currentUser.role !== 'Admin') {
        await this.notifyAdmins(`💬 [${p.name}] 채팅: ${this.currentUser.name}님`, 'info', {type:'chat',propId:propId});
      }
    }
  }

  // ===== 지출 =====
  async addExpense(d) {
    const c = await API.create('expenses', {...d, amount:+d.amount, propId:+d.propId});
    this.expenses.push(c);
    await this.addLog(`[${d.category}] 지출 ₩${(+d.amount).toLocaleString()}`, true);
  }
  async delExpense(id) {
    const exp = this.expenses.find(e => e.id == id);
    if (exp?.syncKey?.startsWith('net_')) {
      if (!confirm('인터넷 연동 항목입니다. 함께 삭제됩니다.')) return;
      const netId = parseInt(exp.syncKey.substring(4));
      await API.delete('internet', netId);
      this.internet = this.internet.filter(n => n.id !== netId);
    }
    await API.delete('expenses', id);
    this.expenses = this.expenses.filter(e => e.id != id);
    await this.addLog('지출 삭제', true);
  }

  // ===== 인터넷 =====
  async upsertInternet(d) {
    let net;
    if (d.id && this.internet.find(n => n.id == d.id)) {
      net = await API.update('internet', d.id, {...d, monthly:+d.monthly, propId:+d.propId});
      const i = this.internet.findIndex(n => n.id == d.id);
      this.internet[i] = net;
      const ex = this.expenses.find(e => e.syncKey === 'net_'+net.id);
      if (ex) {
        ex.amount = net.monthly; ex.propId = net.propId;
        ex.memo = `${net.provider} ${net.plan} (자동연동)`;
        await API.update('expenses', ex.id, ex);
      }
    } else {
      d.id = Date.now();
      net = await API.create('internet', {...d, monthly:+d.monthly, propId:+d.propId});
      this.internet.push(net);
      const ex = await API.create('expenses', {
        syncKey: 'net_'+net.id, propId: net.propId, majorCat: '고정지출',
        category: '인터넷비', amount: net.monthly,
        date: net.installDate || todayStr(),
        memo: `${net.provider} ${net.plan} (자동연동)`
      });
      this.expenses.push(ex);
    }
    await this.addLog(`인터넷 ${d.id?'수정':'등록'} (지출 자동연동)`, true);
  }
  async delInternet(id) {
    const net = this.internet.find(n => n.id === parseInt(id));
    if (!net) return;
    const ex = this.expenses.find(e => e.syncKey === 'net_'+net.id);
    if (ex) await API.delete('expenses', ex.id);
    this.expenses = this.expenses.filter(e => e.syncKey !== 'net_'+net.id);
    await API.delete('internet', id);
    this.internet = this.internet.filter(n => n.id !== parseInt(id));
    await this.addLog('인터넷 삭제', true);
  }

  // ===== 사용자 =====
  async upsertUser(d) {
    if (d.id && this.users.find(u => u.id === d.id)) {
      const u = await API.update('users', d.id, d);
      const i = this.users.findIndex(x => x.id === d.id);
      this.users[i] = u;
      await this.addLog(`사용자 [${d.name}] 수정`, true);
    } else {
      const c = await API.create('users', d);
      this.users.push(c);
      await this.addLog(`신규 계정 [${d.name}] 생성`);
    }
  }
  async delUser(id) {
    if (id === 'admin') { alert('기본 관리자 삭제 불가'); return; }
    const u = this.user(id);
    await API.delete('users', id);
    this.users = this.users.filter(x => x.id !== id);
    await this.addLog(`사용자 [${u?.name}] 삭제`, true);
  }

  // ===== 프로필 변경 요청 =====
  async requestProfileChange(changes) {
    const u = this.currentUser;
    const req = {
      id: Date.now(), userId: u.id, userName: u.name,
      original: {name:u.name, contact:u.contact, email:u.email, pw:u.pw},
      changes, status: 'pending', requestedAt: nowTime(),
      processedAt: null, processedBy: null, reason: ''
    };
    const c = await API.create('profileRequests', req);
    this.profileRequests.unshift(c);
    await this.addLog(`[프로필 요청] ${u.name}님`, true);
    await this.notify(u.id, `📝 변경 요청 접수`, 'info');
    await this.notifyAdmins(`🔔 ${u.name}님 정보 변경 요청 (승인 필요)`, 'warning', {type:'admin',tab:'profileReq'});
    return c;
  }
  async approveProfileChange(reqId) {
    const req = this.profileRequests.find(r => r.id == reqId);
    if (!req || req.status !== 'pending') return false;
    const u = this.user(req.userId);
    if (!u) return false;
    Object.keys(req.changes).forEach(k => { if (req.changes[k]) u[k] = req.changes[k]; });
    req.status = 'approved'; req.processedAt = nowTime(); req.processedBy = this.currentUser.id;
    await API.update('users', u.id, u);
    await API.update('profileRequests', req.id, req);
    if (this.currentUser?.id === u.id) {
      this.currentUser = u;
      sessionStorage.setItem('qj_user', JSON.stringify(u));
    }
    await this.addLog(`[승인] ${u.name}님 정보 변경`, true);
    await this.notify(u.id, `✅ 정보 변경 승인되었습니다`, 'success');
    return true;
  }
  async rejectProfileChange(reqId, reason='') {
    const req = this.profileRequests.find(r => r.id == reqId);
    if (!req || req.status !== 'pending') return false;
    req.status = 'rejected'; req.processedAt = nowTime(); req.processedBy = this.currentUser.id; req.reason = reason;
    await API.update('profileRequests', req.id, req);
    await this.addLog(`[반려] ${req.userName}님 - ${reason||'사유없음'}`, true);
    await this.notify(req.userId, `❌ 변경 요청 반려. ${reason?`사유: ${reason}`:''}`, 'error');
    return true;
  }
  pendingProfileRequests() { return this.profileRequests.filter(r => r.status === 'pending'); }

  // ===== 스케줄 (양방향 알림 동기화) =====
  async addSchedule(d) {
    const c = await API.create('schedule', {...d, propId:+d.propId, alarm:d.alarm||[], createdBy:this.currentUser.id});
    this.schedule.push(c);
    await this.addLog(`스케줄 등록: ${d.date} ${d.time} ${d.staff}`);
    // 담당자에게 알림
    const targetUser = this.userByName(d.staff);
    if (targetUser && targetUser.id !== this.currentUser.id) {
      await this.notify(targetUser.id, `📅 새 스케줄 배정: ${d.date} ${d.time} - ${d.task}`, 'info', {type:'schedule'});
    }
    // 관리자에게도 알림 (본인이 관리자가 아닌 경우)
    if (this.currentUser.role !== 'Admin') {
      await this.notifyAdmins(`📅 ${this.currentUser.name}님 스케줄 등록: ${d.date} ${d.time} ${d.task}`, 'info', {type:'admin',tab:'staff'});
    }
  }
  async delSchedule(id) {
    const s = this.schedule.find(x => x.id === parseInt(id));
    await API.delete('schedule', id);
    this.schedule = this.schedule.filter(x => x.id !== parseInt(id));
    if (s) {
      const targetUser = this.userByName(s.staff);
      if (targetUser && targetUser.id !== this.currentUser.id) {
        await this.notify(targetUser.id, `❌ 스케줄 취소: ${s.date} ${s.time} - ${s.task}`, 'warning');
      }
    }
  }

  // ===== 물품 =====
  async upsertProduct(d) {
    if (d.id && this.products.find(p => p.id == d.id)) {
      const u = await API.update('products', d.id, {...d, price:+d.price});
      const i = this.products.findIndex(p => p.id == d.id);
      this.products[i] = u;
    } else {
      d.id = Date.now(); d.price = +d.price;
      const c = await API.create('products', d);
      this.products.push(c);
    }
  }
  async delProduct(id) {
    await API.delete('products', id);
    this.products = this.products.filter(x => x.id != id);
  }

  // ===== 고객 메모 =====
  async saveCustomerMemo(key, data) {
    this.customerMemos[key] = data;
    await API.setAll('customerMemos', this.customerMemos).catch(()=>{});
  }

  // ===== AI 인사이트 분석 =====
  getAIInsights() {
    const insights = [];
    // 1. 가동률 낮은 매물
    const today = todayStr();
    this.properties.forEach(p => {
      const monthBookings = this.bookings.filter(b => b.propId===p.id && b.checkIn.slice(0,7)===today.slice(0,7));
      const totalDays = monthBookings.reduce((s,b)=>s+daysBetween(b.checkIn,b.checkOut),0);
      const occupancy = Math.round(totalDays/30*100);
      if (occupancy < 30) {
        insights.push({
          level: 'warning',
          icon: 'trending-down',
          title: `📉 ${p.name} 가동률 저조`,
          desc: `이번 달 가동률 ${occupancy}%. 가격 조정 또는 광고 강화를 추천합니다.`,
          action: 'pricing'
        });
      }
    });
    // 2. 청소비 높은 매물
    this.properties.forEach(p => {
      const cleaning = this.expenses.filter(e=>e.propId===p.id && e.category==='청소비').reduce((s,e)=>s+e.amount,0);
      if (cleaning > 200000) {
        insights.push({
          level: 'info',
          icon: 'broom',
          title: `🧹 ${p.name} 청소비 점검`,
          desc: `누적 청소비 ${fmt(cleaning)}. 자체 청소 도입 시 30% 절감 가능합니다.`,
          action: 'cost'
        });
      }
    });
    // 3. 인기 플랫폼 분석
    const platStats = {};
    this.bookings.forEach(b => {
      if (!platStats[b.platform]) platStats[b.platform] = 0;
      platStats[b.platform]++;
    });
    const topPlat = Object.entries(platStats).sort((a,b)=>b[1]-a[1])[0];
    if (topPlat) {
      insights.push({
        level: 'success',
        icon: 'trending-up',
        title: `🏆 최고 플랫폼: ${topPlat[0]}`,
        desc: `${topPlat[1]}건 예약. 이 플랫폼에 마케팅을 집중하세요.`,
        action: 'marketing'
      });
    }
    // 4. 미수금 점검
    const unpaid = this.bookings.filter(b => !b.paid);
    if (unpaid.length > 0) {
      insights.push({
        level: 'warning',
        icon: 'alert-circle',
        title: `💰 미확인 수금 ${unpaid.length}건`,
        desc: `예약 확정 후 미입금 ${unpaid.length}건. 확인 필요.`,
        action: 'payment'
      });
    }
    // 5. 곧 다가오는 체크인
    const upcoming = this.bookings.filter(b => {
      const diff = (new Date(b.checkIn) - new Date()) / 86400000;
      return diff >= 0 && diff <= 3;
    });
    if (upcoming.length > 0) {
      insights.push({
        level: 'info',
        icon: 'calendar-clock',
        title: `⏰ 3일내 체크인 ${upcoming.length}건`,
        desc: `사전 청소/준비를 진행하세요.`,
        action: 'schedule'
      });
    }
    // 6. 스마트 가격 추천
    this.properties.forEach(p => {
      const recent = this.bookings.filter(b => b.propId===p.id).slice(-5);
      if (recent.length >= 3) {
        const avgPrice = recent.reduce((s,b)=>s+b.price,0)/recent.length/recent.reduce((s,b)=>s+daysBetween(b.checkIn,b.checkOut),0)*recent.length;
        if (avgPrice > p.price * 1.15) {
          insights.push({
            level: 'success',
            icon: 'sparkles',
            title: `💎 ${p.name} 가격 인상 가능`,
            desc: `최근 실거래 평균이 정가보다 ${Math.round((avgPrice/p.price-1)*100)}% 높음. 정가 조정 고려.`,
            action: 'pricing'
          });
        }
      }
    });
    return insights;
  }

  // ===== AI 스마트 가격 추천 (NEW BONUS FEATURE) =====
  getSmartPricing(propId) {
    const p = this.prop(propId);
    if (!p) return null;
    const bookings = this.bookings.filter(b => b.propId === propId);
    if (bookings.length < 2) return { suggested: p.price, confidence: 0, reason: '데이터 부족' };
    
    const totalNights = bookings.reduce((s,b)=>s+daysBetween(b.checkIn,b.checkOut),0);
    const totalRev = bookings.reduce((s,b)=>s+(+b.price||0),0);
    const avgNightly = totalRev / totalNights;
    
    // 요일별 분석
    const weekendBks = bookings.filter(b=>[5,6].includes(new Date(b.checkIn).getDay()));
    const weekdayBks = bookings.filter(b=>![5,6].includes(new Date(b.checkIn).getDay()));
    
    // 계절성 분석 (최근 3개월)
    const recentBks = bookings.filter(b => {
      const diff = (new Date() - new Date(b.checkIn))/86400000;
      return diff >= 0 && diff <= 90;
    });
    const recentAvg = recentBks.length ? recentBks.reduce((s,b)=>s+(+b.price||0),0)/recentBks.reduce((s,b)=>s+daysBetween(b.checkIn,b.checkOut),0) : avgNightly;
    
    // 추천 가격 = 정가 × 0.7 + 실거래평균 × 0.3
    const suggested = Math.round((p.price * 0.7 + recentAvg * 0.3) / 1000) * 1000;
    const trend = recentAvg > p.price ? 'up' : recentAvg < p.price * 0.9 ? 'down' : 'stable';
    const confidence = Math.min(95, bookings.length * 10);
    
    return {
      currentPrice: p.price,
      suggested,
      trend,
      confidence,
      avgNightly: Math.round(avgNightly),
      recentAvg: Math.round(recentAvg),
      weekendBoost: weekendBks.length ? Math.round(weekendBks.reduce((s,b)=>s+b.price,0)/weekendBks.length - weekdayBks.reduce((s,b)=>s+b.price,0)/(weekdayBks.length||1)) : 0,
      reason: trend==='up' ? '최근 수요 증가 - 가격 인상 추천' : trend==='down' ? '수요 감소 - 가격 인하로 가동률 회복' : '안정적 - 현재 가격 유지'
    };
  }
}
  // ===== [신규] 사이트 설정 관리 =====
  async saveSiteConfig(cfg) {
    this.siteConfig = { ...this.siteConfig, ...cfg };
    await API.setAll('siteConfig', this.siteConfig);
    await this.addLog('🎨 사이트 설정 변경됨', true);
    // 로고/타이틀이 바뀌면 페이지 타이틀도 업데이트
    document.title = this.siteConfig.title || 'QJ-PropMS';
  }

  async saveSecuritySettings(s) {
    this.securitySettings = { ...this.securitySettings, ...s };
    await API.setAll('securitySettings', this.securitySettings);
    await this.addLog('🔒 보안 설정 변경됨', true);
  }

  // ===== [신규] 백업/복원 =====
  async exportBackup() {
    const data = {
      version: '3.1',
      exportedAt: nowTime(),
      exportedBy: this.currentUser?.name || 'Unknown',
      data: {
        properties: this.properties,
        bookings: this.bookings,
        expenses: this.expenses,
        users: this.users.map(u => ({...u, pw: u.id === 'admin' ? u.pw : '****'})),
        chats: this.chats,
        schedule: this.schedule,
        internet: this.internet,
        products: this.products,
        groups: this.groups,
        platforms: this.platforms,
        majorCats: this.majorCats,
        subCats: this.subCats,
        customerMemos: this.customerMemos,
        opsData: this.opsData,
        siteConfig: this.siteConfig,
        securitySettings: this.securitySettings,
        logs: this.logs.slice(0, 200)
      }
    };
    return data;
  }

  async importBackup(backupData) {
    if (!backupData?.version || !backupData?.data) {
      throw new Error('잘못된 백업 파일 형식입니다');
    }
    const d = backupData.data;
    const collections = ['properties','bookings','expenses','chats','schedule','internet','products','groups','platforms','majorCats','subCats','customerMemos','opsData','siteConfig','securitySettings'];
    let restored = 0;
    for (const key of collections) {
      if (d[key] !== undefined) {
        this[key] = d[key];
        await API.setAll(key, d[key]);
        restored++;
      }
    }
    // users는 비밀번호 보호되어 있으므로 복원 안함 (보안)
    await this.addLog(`💾 백업 복원 완료 (${restored}개 컬렉션)`, true);
    return restored;
  }

  // ===== [신규] 체크인/체크아웃 자동 알림 =====
  async checkScheduledNotifications() {
    if (!this.currentUser) return;
    const today = todayStr();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const notifKey = `qj_notif_${today}_${this.currentUser.id}`;
    if (sessionStorage.getItem(notifKey)) return;

    let count = 0;
    // 오늘 체크인
    for (const b of this.bookings.filter(b => b.checkIn === today)) {
      const p = this.prop(b.propId);
      if (!p) continue;
      if (p.manager && p.manager === this.currentUser.id) {
        await this.notify(p.manager, `🟢 오늘 체크인: ${b.guest}님 - ${p.name}`, 'success', { type:'detail', propId:p.id });
        count++;
      }
      if (this.currentUser.role === 'Admin') {
        await this.notify(this.currentUser.id, `🟢 오늘 체크인: ${b.guest}님 - ${p.name}`, 'success', { type:'detail', propId:p.id });
        count++;
      }
    }
    // 오늘 체크아웃
    for (const b of this.bookings.filter(b => b.checkOut === today)) {
      const p = this.prop(b.propId);
      if (!p) continue;
      if (p.manager && p.manager === this.currentUser.id) {
        await this.notify(p.manager, `🔴 오늘 체크아웃: ${b.guest}님 - ${p.name} (청소 필요)`, 'warning', { type:'detail', propId:p.id });
        count++;
      }
      if (this.currentUser.role === 'Admin') {
        await this.notify(this.currentUser.id, `🔴 오늘 체크아웃: ${b.guest}님 - ${p.name}`, 'warning', { type:'detail', propId:p.id });
        count++;
      }
    }
    // 내일 체크인 (사전 알림)
    for (const b of this.bookings.filter(b => b.checkIn === tomorrow)) {
      const p = this.prop(b.propId);
      if (!p) continue;
      if (p.manager && p.manager === this.currentUser.id) {
        await this.notify(p.manager, `📅 내일 체크인 예정: ${b.guest}님 - ${p.name} (사전 준비 권장)`, 'info', { type:'detail', propId:p.id });
        count++;
      }
    }
    sessionStorage.setItem(notifKey, '1');
    if (count > 0) console.log(`✅ ${count}개의 체크인/체크아웃 알림 발송`);
  }

  // ===== [신규] 카카오톡 웹훅 =====
  async sendKakaoNotification(message) {
    const url = this.siteConfig?.kakaoWebhook;
    if (!url) return false;
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `[QJ-PMS]\n${message}`, source: 'QJ-PropMS' })
      });
      const el = document.getElementById('kakao-status');
      if (el) {
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 2500);
      }
      return true;
    } catch (e) {
      console.error('Kakao webhook failed:', e);
      return false;
    }
  }

  // ===== [신규] 비밀번호 정책 검증 =====
  validatePassword(pw) {
    const s = this.securitySettings || { minPasswordLength: 4, passwordRequireSpecial: false };
    const errors = [];
    if (pw.length < s.minPasswordLength) errors.push(`최소 ${s.minPasswordLength}자 이상`);
    if (s.passwordRequireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(pw)) errors.push('특수문자 1개 이상 포함');
    let strength = 0;
    if (pw.length >= 8) strength++;
    if (/[A-Z]/.test(pw)) strength++;
    if (/[a-z]/.test(pw)) strength++;
    if (/[0-9]/.test(pw)) strength++;
    if (/[^A-Za-z0-9]/.test(pw)) strength++;
    return {
      valid: errors.length === 0,
      errors,
      strength,
      strengthLabel: ['매우 약함','약함','보통','강함','매우 강함','최강'][strength] || '매우 약함'
    };
  }

  // ===== [신규] 세션 타임아웃 =====
  startSessionTimer() {
    this.stopSessionTimer();
    const timeoutMin = this.securitySettings?.sessionTimeoutMin || 30;
    let lastActivity = Date.now();
    
    const onActivity = () => { lastActivity = Date.now(); };
    ['click','keypress','scroll','mousemove'].forEach(evt => {
      document.addEventListener(evt, onActivity, { passive: true });
    });
    this._sessionListeners = onActivity;
    
    this._sessionTimer = setInterval(() => {
      const idle = (Date.now() - lastActivity) / 60000;
      if (idle >= timeoutMin) {
        this.stopSessionTimer();
        toast(`⏰ ${timeoutMin}분 미사용으로 자동 로그아웃됩니다`, 'warning');
        setTimeout(() => { router.logout(); }, 2000);
      }
    }, 30000); // 30초마다 체크
  }
  
  stopSessionTimer() {
    if (this._sessionTimer) clearInterval(this._sessionTimer);
    if (this._sessionListeners) {
      ['click','keypress','scroll','mousemove'].forEach(evt => {
        document.removeEventListener(evt, this._sessionListeners);
      });
    }
  }

  // ===== [신규] IP 추적 =====
  async logActivity(action) {
    if (!this.securitySettings?.ipTracking) return;
    if (!this.currentUser) return;
    try {
      const res = await fetch('https://api.ipify.org?format=json').catch(() => null);
      const ip = res ? (await res.json()).ip : 'unknown';
      const ua = navigator.userAgent.slice(0, 100);
      await this.addLog(`🌐 ${action} (IP: ${ip})`, action.includes('실패') || action.includes('비정상'));
    } catch {}
  }

  // ===== [신규] 카테고리 순서 이동 =====
  async moveSubCat(majorCat, fromIdx, toIdx) {
    const arr = this.subCats[majorCat] || [];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    this.subCats[majorCat] = arr;
    await API.setAll('subCats', this.subCats);
  }
  
  async moveMajorCat(fromIdx, toIdx) {
    const [item] = this.majorCats.splice(fromIdx, 1);
    this.majorCats.splice(toIdx, 0, item);
    await API.setAll('majorCats', this.majorCats);
  }
  
  async renameSubCat(majorCat, idx, newName) {
    const oldName = this.subCats[majorCat][idx];
    this.subCats[majorCat][idx] = newName;
    // 기존 지출 카테고리도 업데이트
    let updated = 0;
    for (const exp of this.expenses) {
      if (exp.majorCat === majorCat && exp.category === oldName) {
        exp.category = newName;
        await API.update('expenses', exp.id, exp);
        updated++;
      }
    }
    await API.setAll('subCats', this.subCats);
    await this.addLog(`카테고리 이름 변경: ${oldName} → ${newName} (${updated}건 동기화)`);
  }

  // ===== [신규] AI 인사이트 (작동 보강) =====
  getAIInsights() {
    const insights = [];
    const today = todayStr();
    const props = this.properties;
    
    if (!props.length) {
      return [{ level:'info', icon:'info', title:'📊 데이터 분석 준비', desc:'매물을 등록하면 AI가 자동으로 운영 인사이트를 제공합니다.', action:'props' }];
    }

    // 1. 가동률 분석
    props.forEach(p => {
      const monthBks = this.bookings.filter(b => b.propId === p.id && b.checkIn?.slice(0,7) === today.slice(0,7));
      const totalNights = monthBks.reduce((s, b) => {
        try { return s + daysBetween(b.checkIn, b.checkOut); } catch { return s; }
      }, 0);
      const occupancy = Math.round(totalNights / 30 * 100);
      if (occupancy < 30) {
        insights.push({
          level:'warning', icon:'trending-down',
          title:`📉 ${p.name} 가동률 ${occupancy}%`,
          desc:`이번 달 가동률이 낮습니다. AI 스마트 가격 추천 또는 광고 강화를 검토하세요.`,
          action:'pricing', propId: p.id
        });
      } else if (occupancy >= 80) {
        insights.push({
          level:'success', icon:'trending-up',
          title:`🔥 ${p.name} 가동률 ${occupancy}% 우수`,
          desc:`수요가 높습니다. 가격 인상 검토 또는 유사 매물 확장 기회입니다.`,
          action:'pricing', propId: p.id
        });
      }
    });

    // 2. 청소비 누적 분석
    props.forEach(p => {
      const cleaning = this.expenses.filter(e => e.propId === p.id && e.category === '청소비').reduce((s, e) => s + (+e.amount || 0), 0);
      if (cleaning > 200000) {
        insights.push({
          level:'info', icon:'sparkles',
          title:`🧹 ${p.name} 청소비 점검`,
          desc:`누적 청소비 ${fmt(cleaning)}. 자체 청소 도입 시 약 30% 절감 가능합니다.`,
          action:'expenses', propId: p.id
        });
      }
    });

    // 3. 인기 플랫폼
    const platStats = {};
    this.bookings.forEach(b => {
      if (!platStats[b.platform]) platStats[b.platform] = { count:0, revenue:0 };
      platStats[b.platform].count++;
      platStats[b.platform].revenue += +b.price || 0;
    });
    const topPlat = Object.entries(platStats).sort((a,b) => b[1].count - a[1].count)[0];
    if (topPlat) {
      insights.push({
        level:'success', icon:'trending-up',
        title:`🏆 최고 플랫폼: ${topPlat[0]}`,
        desc:`${topPlat[1].count}건 예약, ${fmt(topPlat[1].revenue)} 매출. 마케팅 강화를 권장합니다.`,
        action:'customers'
      });
    }

    // 4. 3일 내 체크인
    const upcoming = this.bookings.filter(b => {
      try {
        const diff = (new Date(b.checkIn) - new Date()) / 86400000;
        return diff >= 0 && diff <= 3;
      } catch { return false; }
    });
    if (upcoming.length > 0) {
      insights.push({
        level:'info', icon:'calendar-clock',
        title:`⏰ 3일 내 체크인 ${upcoming.length}건`,
        desc:`사전 청소·준비를 진행하세요. 직원 스케줄 등록을 권장합니다.`,
        action:'schedule'
      });
    }

    // 5. 스마트 가격 추천
    props.forEach(p => {
      const recent = this.bookings.filter(b => b.propId === p.id);
      if (recent.length >= 3) {
        try {
          const totalNights = recent.reduce((s, b) => s + daysBetween(b.checkIn, b.checkOut), 0);
          if (totalNights > 0) {
            const avgNightly = recent.reduce((s, b) => s + (+b.price||0), 0) / totalNights;
            if (avgNightly > p.price * 1.15) {
              insights.push({
                level:'success', icon:'sparkles',
                title:`💎 ${p.name} 가격 인상 가능`,
                desc:`실거래 평균이 정가보다 ${Math.round((avgNightly/p.price-1)*100)}% 높음. 정가 조정 권장.`,
                action:'pricing', propId: p.id
              });
            } else if (avgNightly < p.price * 0.85) {
              insights.push({
                level:'warning', icon:'trending-down',
                title:`💰 ${p.name} 할인 빈번`,
                desc:`실거래 평균이 정가보다 ${Math.round((1-avgNightly/p.price)*100)}% 낮음. 정가 재검토 필요.`,
                action:'pricing', propId: p.id
              });
            }
          }
        } catch {}
      }
    });

    // 6. 매니저 미배정
    const noMgr = props.filter(p => !p.manager);
    if (noMgr.length) {
      insights.push({
        level:'warning', icon:'user-x',
        title:`👤 담당자 미배정 ${noMgr.length}건`,
        desc:`${noMgr.map(p=>p.name).join(', ')}에 매니저를 배정하세요.`,
        action:'props'
      });
    }

    // 7. 채팅 응답 대기
    const lastChats = {};
    this.chats.forEach(c => {
      if (c.role !== 'Admin' && (!lastChats[c.propId] || c.time > lastChats[c.propId].time)) {
        lastChats[c.propId] = c;
      }
    });
    Object.entries(lastChats).forEach(([pid, last]) => {
      const reply = this.chats.filter(c => c.propId == pid && c.role === 'Admin' && c.time > last.time);
      if (!reply.length) {
        const p = this.prop(pid);
        if (p) insights.push({
          level:'info', icon:'message-circle',
          title:`💬 ${p.name} 응답 대기`,
          desc:`${last.sender}님 메시지에 답변이 필요합니다.`,
          action:'chats', propId: p.id
        });
      }
    });

    // 8. 수익률 분석
    const totalRev = this.bookings.reduce((s,b) => s + (+b.price||0), 0);
    const totalCost = this.expenses.filter(e => e.majorCat !== '초기투자지출').reduce((s,e) => s + (+e.amount||0), 0);
    if (totalRev > 0) {
      const margin = Math.round((totalRev - totalCost) / totalRev * 100);
      if (margin < 30) {
        insights.push({
          level:'warning', icon:'alert-circle',
          title:`📊 운영 마진 ${margin}%`,
          desc:`수익률이 낮습니다. 변동지출 점검 또는 가격 정책 재검토를 권장합니다.`,
          action:'stats'
        });
      } else if (margin >= 60) {
        insights.push({
          level:'success', icon:'award',
          title:`🌟 운영 마진 ${margin}% 우수`,
          desc:`수익성이 매우 좋습니다. 수익을 재투자하여 매물 확장을 검토하세요.`,
          action:'stats'
        });
      }
    }

    return insights.length ? insights : [{
      level:'success', icon:'check-circle',
      title:'✅ 모든 운영이 정상입니다',
      desc:'특이사항이 발견되지 않았습니다. 좋은 운영 부탁드립니다!', action:null
    }];
  }

  // ===== [신규] AI 스마트 가격 (보강) =====
  getSmartPricing(propId) {
    const p = this.prop(propId);
    if (!p) return null;
    const bookings = this.bookings.filter(b => b.propId === propId);
    
    if (bookings.length === 0) {
      return {
        currentPrice: p.price,
        suggested: p.price,
        trend: 'stable',
        confidence: 0,
        avgNightly: p.price,
        recentAvg: p.price,
        weekendBoost: 0,
        reason: '예약 데이터가 없어 분석할 수 없습니다. 마케팅을 통해 첫 예약을 유치하세요.'
      };
    }
    
    if (bookings.length < 2) {
      return {
        currentPrice: p.price,
        suggested: p.price,
        trend: 'stable',
        confidence: 20,
        avgNightly: bookings[0].price,
        recentAvg: bookings[0].price,
        weekendBoost: 0,
        reason: '데이터 부족 (1건). 최소 3건 이상의 예약 데이터가 필요합니다.'
      };
    }
    
    try {
      const totalNights = bookings.reduce((s,b) => s + daysBetween(b.checkIn, b.checkOut), 0) || 1;
      const totalRev = bookings.reduce((s,b) => s + (+b.price||0), 0);
      const avgNightly = totalRev / totalNights;
      
      const weekendBks = bookings.filter(b => [5,6].includes(new Date(b.checkIn).getDay()));
      const weekdayBks = bookings.filter(b => ![5,6].includes(new Date(b.checkIn).getDay()));
      
      const recentBks = bookings.filter(b => {
        const diff = (new Date() - new Date(b.checkIn)) / 86400000;
        return diff >= -30 && diff <= 90;
      });
      
      const recentAvg = recentBks.length 
        ? recentBks.reduce((s,b) => s + (+b.price||0), 0) / Math.max(1, recentBks.reduce((s,b) => s + daysBetween(b.checkIn, b.checkOut), 0))
        : avgNightly;
      
      const suggested = Math.round((p.price * 0.6 + recentAvg * 0.4) / 1000) * 1000;
      const trend = recentAvg > p.price * 1.05 ? 'up' : recentAvg < p.price * 0.95 ? 'down' : 'stable';
      const confidence = Math.min(95, bookings.length * 8 + recentBks.length * 5);
      
      const weekendAvg = weekendBks.length ? weekendBks.reduce((s,b) => s + b.price, 0) / weekendBks.length : 0;
      const weekdayAvg = weekdayBks.length ? weekdayBks.reduce((s,b) => s + b.price, 0) / weekdayBks.length : 0;
      const weekendBoost = (weekendAvg && weekdayAvg) ? Math.round(weekendAvg - weekdayAvg) : 0;
      
      const reasons = {
        up: `📈 최근 ${recentBks.length}건 거래 평균이 정가보다 ${Math.round((recentAvg/p.price-1)*100)}% 높음. 가격 인상 추천`,
        down: `📉 수요 감소 - 가격 인하로 가동률 회복 권장 (현재 평균 ${Math.round((1-recentAvg/p.price)*100)}% 낮음)`,
        stable: `⚖️ 안정적 운영 중 - 현재 가격 유지 추천`
      };
      
      return {
        currentPrice: p.price,
        suggested: Math.max(p.cost * 1.5, suggested), // 원가의 150% 미만으로는 추천 X
        trend,
        confidence,
        avgNightly: Math.round(avgNightly),
        recentAvg: Math.round(recentAvg),
        weekendBoost,
        bookingCount: bookings.length,
        recentCount: recentBks.length,
        reason: reasons[trend]
      };
    } catch (e) {
      console.error('Smart pricing error:', e);
      return null;
    }
  }
window.store = new Store();