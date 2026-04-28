class Store {
  constructor() {
    this.currentUser = JSON.parse(sessionStorage.getItem('qj_user')) || null;
    this.properties = []; this.bookings = []; this.expenses = []; this.chats = [];
    this.users = []; this.groups = []; this.platforms = []; this.internet = [];
    this.products = []; this.schedule = []; this.opsData = {};
    this.majorCats = ["초기투자지출","고정지출","변동지출"];
    this.subCats = {}; this.logs = []; this.userNotifs = {};
    this.profileRequests = []; this.reportRecipients = [];
    this.loaded = false;
  }

  async loadAll() {
    if (!this.currentUser) return;
    try {
      showLoading(true);
      const cols = ['properties','bookings','expenses','chats','users','groups','platforms','internet','products','schedule','logs','profileRequests','majorCats','subCats','userNotifs','reportRecipients','opsData'];
      const results = await Promise.all(cols.map(c => API.list(c).catch(()=>null)));
      cols.forEach((c,i) => {
        const v = results[i];
        if (v === null) return;
        if (['subCats','userNotifs','opsData'].includes(c)) {
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
    } catch(e) {
      console.error('Load failed:', e);
      toast('데이터 로드 실패: ' + e.message, 'error');
    } finally { showLoading(false); }
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

  async notify(userId, message, type='info') {
    if (!this.userNotifs[userId]) this.userNotifs[userId] = [];
    this.userNotifs[userId].unshift({id:Date.now()+Math.random(), message, type, time:nowTime(), read:false});
    if (this.userNotifs[userId].length > 100) this.userNotifs[userId].pop();
    await API.setAll('userNotifs', this.userNotifs).catch(()=>{});
  }
  async notifyAdmins(message, type='info') {
    for (const u of this.users.filter(x=>x.role==='Admin')) await this.notify(u.id, message, type);
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

  async addBooking(d) {
    const p = this.prop(d.propId);
    const c = await API.create('bookings', {...d, price:+d.price, people:+d.people, propId:+d.propId});
    this.bookings.push(c);
    await this.addLog(`${p.name}: ${d.guest}님 예약 등록`);
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

  async addChat(propId, msg) {
    const c = {propId:+propId, sender:this.currentUser.name, role:this.currentUser.role, message:msg, time:nowTime()};
    const created = await API.create('chats', c);
    this.chats.push(created);
  }

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
    await this.addLog('인터넷 삭제 (지출 자동연동)', true);
  }

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

  async requestProfileChange(changes) {
    const u = this.currentUser;
    const req = {
      id: Date.now(), userId: u.id, userName: u.name,
      original: {name:u.name, contact:u.contact, email:u.email, pw:u.pw},
      changes, status: 'pending',
      requestedAt: nowTime(), processedAt: null, processedBy: null, reason: ''
    };
    const c = await API.create('profileRequests', req);
    this.profileRequests.unshift(c);
    await this.addLog(`[프로필 요청] ${u.name}님`, true);
    await this.notify(u.id, `📝 변경 요청 접수. 관리자 승인 대기...`, 'info');
    await this.notifyAdmins(`🔔 ${u.name}님 정보 변경 요청 (승인 필요)`, 'warning');
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

  async addSchedule(d) {
    const c = await API.create('schedule', {...d, propId:+d.propId, alarm:d.alarm||[]});
    this.schedule.push(c);
    await this.addLog(`스케줄 등록: ${d.date} ${d.time} ${d.staff}`);
  }
  async delSchedule(id) {
    await API.delete('schedule', id);
    this.schedule = this.schedule.filter(s => s.id !== parseInt(id));
  }

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
}

window.store = new Store();