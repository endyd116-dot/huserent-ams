class Store {
  constructor() {
    this.currentUser = JSON.parse(sessionStorage.getItem('qj_user')) || null;
    this.properties = []; this.bookings = []; this.expenses = []; this.chats = [];
    this.users = []; this.groups = []; this.platforms = []; this.internet = [];
    this.products = []; this.schedule = []; this.opsData = {};
    this.majorCats = ["초기투자지출","고정지출","변동지출"];
    this.subCats = {}; this.logs = []; this.userNotifs = {};
    this.profileRequests = []; this.reportRecipients = [];
    this.customerMemos = {};
    this.loaded = false;
  }

  async loadAll() {
    if (!this.currentUser) return;
    try {
      showLoading(true);
      const cols = ['properties','bookings','expenses','chats','users','groups','platforms','internet','products','schedule','logs','profileRequests','majorCats','subCats','userNotifs','reportRecipients','opsData','customerMemos'];
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
      if (!this.groups.length) this.groups = ["서울","부산","제주"];
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

window.store = new Store();