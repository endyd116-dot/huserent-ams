window.fmt = n => '₩' + (n || 0).toLocaleString();
window.todayStr = () => new Date().toISOString().split('T')[0];

window.showLoading = (show=true) => {
  const el = document.getElementById('loading');
  if (show) { el.classList.remove('hidden'); el.classList.add('flex'); }
  else { el.classList.add('hidden'); el.classList.remove('flex'); }
};

window.toast = (msg, type='info') => {
  const t = document.createElement('div');
  const col = type==='error'?'bg-red-500':type==='success'?'bg-green-500':type==='warning'?'bg-amber-500':'bg-slate-900';
  t.className = `${col} text-white px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm fade-in max-w-sm`;
  t.textContent = msg;
  document.getElementById('toast-root').appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300)}, 3500);
};

window.openModal = (title, content, size='max-w-5xl') => {
  const m = document.getElementById('modal-root');
  const c = document.getElementById('modal-content');
  c.className = `bg-white rounded-3xl shadow-2xl w-full ${size} max-h-[92vh] overflow-y-auto scrollbar fade-in`;
  c.innerHTML = `<div class="p-6 border-b flex justify-between items-center bg-slate-50/80 sticky top-0 z-10 backdrop-blur"><h3 class="text-xl font-black tracking-tight">${title}</h3><button onclick="closeModal()" class="w-9 h-9 hover:bg-slate-200 rounded-xl flex items-center justify-center"><i data-lucide="x" class="w-5 h-5"></i></button></div><div class="p-8">${content}</div>`;
  m.classList.remove('hidden'); m.classList.add('flex');
  lucide.createIcons();
};

window.closeModal = () => {
  const m = document.getElementById('modal-root');
  m.classList.add('hidden'); m.classList.remove('flex');
};

window.daysBetween = (a,b) => {
  const d1=new Date(a), d2=new Date(b);
  return Math.max(1, Math.round((d2-d1)/86400000));
};

window.getBookingForDate = (propId, date) =>
  store.bookings.find(b => b.propId===propId && date>=b.checkIn && date<b.checkOut);

window.badge = s => {
  const c = {occupied:['bg-blue-600','투숙중'], empty:['bg-green-500','공실'], cleaning:['bg-amber-500','청소중']}[s] || ['bg-slate-400','N/A'];
  return `<span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${c[0]} text-white">${c[1]}</span>`;
};

window.mgrTag = mgrId => {
  const m = store.user(mgrId);
  if (!m) return '-';
  const nick = (m.name.match(/\((.+)\)/) || [,m.name])[1];
  return `<span class="tag-mgr" style="background:${m.tagColor||'#60a5fa'}">${nick}</span>`;
};

window.nowTime = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
};

/* =========================================================
   [v3.4] 매출 집계 기준 · 예약 금액 구성 · 숫자 유틸
   ========================================================= */

window.num = v => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : +String(v).replace(/[^0-9.-]/g, '');
  return isFinite(n) ? n : 0;
};

// 1,000원 단위 반올림 (판매가 주당 → 1박 자동계산 등)
window.round1000 = n => Math.round(num(n) / 1000) * 1000;

// ── 매출 집계 기준 (총 매출액 / 플랫폼 매출액) ──
window.REVENUE_BASIS_KEY = 'qj_revenue_basis';
window.getRevenueBasis = () => (localStorage.getItem(REVENUE_BASIS_KEY) === 'platform' ? 'platform' : 'total');
window.setRevenueBasis = v => { localStorage.setItem(REVENUE_BASIS_KEY, v === 'platform' ? 'platform' : 'total'); };
window.revenueBasisLabel = () => (getRevenueBasis() === 'platform' ? '플랫폼 매출액' : '총 매출액');

// 예약 1건의 금액 구성. 신규 필드가 없는 구버전 예약은 price로 폴백한다.
window.BOOKING_AMOUNT_KEYS = ['rentFee', 'mgmtFeeTotal', 'cleanFee', 'netDeposit', 'bedding', 'parking', 'extraStay'];
window.bookingAmounts = b => {
  b = b || {};
  const legacy = num(b.price);
  const hasNew = BOOKING_AMOUNT_KEYS.some(k => b[k] !== undefined && b[k] !== null && b[k] !== '');
  const rent = num(b.rentFee), mgmt = num(b.mgmtFeeTotal), clean = num(b.cleanFee);
  const bedding = num(b.bedding), parking = num(b.parking), extra = num(b.extraStay);
  const platform = hasNew ? rent + mgmt + clean : legacy;
  const net = hasNew ? num(b.netDeposit) : legacy;
  const total = hasNew ? net + bedding + parking + extra : legacy;
  return { rent, mgmt, clean, platform, net, bedding, parking, extra, total, legacy, hasNew };
};

// 통계·정산·보고서에서 사용하는 매출값 (선택된 기준 적용)
window.bkRev = b => {
  const a = bookingAmounts(b);
  return getRevenueBasis() === 'platform' ? a.platform : a.total;
};

// 기준 전환 토글 UI (통계/매출 화면 공용)
window.revenueBasisToggle = (onChange = 'router.renderAdminTab()') => {
  const basis = getRevenueBasis();
  const btn = (v, label, tip) => `<button title="${tip}" onclick="setRevenueBasis('${v}');${onChange}" class="px-3 py-2 rounded-lg font-black text-xs ${basis === v ? 'bg-white shadow text-slate-900' : 'text-slate-500'}">${label}</button>`;
  return `<div class="bg-slate-100 rounded-xl p-1 flex items-center" title="매출 집계 기준">
    <span class="px-2 text-[10px] font-black text-slate-400 uppercase">매출기준</span>
    ${btn('total', '총매출', '실 입금 금액 + 이불 + 주차 + 추가숙박/기타')}
    ${btn('platform', '플랫폼매출', '임대료 + 관리비(전체) + 청소비')}
  </div>`;
};

// 매물 기준가 헬퍼 (판매가 주당/1박, 관리비 주당, 청소비 1회)
window.propRates = p => {
  p = p || {};
  const nightly = num(p.price);
  const weekly = p.priceWeek !== undefined && p.priceWeek !== '' ? num(p.priceWeek) : 0;
  return { nightly, weekly, mgmtWeek: num(p.mgmtFeeWeek), cleanOnce: num(p.cleanFee) };
};

// HTML 이스케이프 (게스트명 등 사용자 입력을 템플릿에 넣을 때)
window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));


/* ===== [v3.4] 관리자 등급: Director → Staff 로 명칭 변경 =====
   기존 데이터에 남아 있는 'Director'도 Staff로 동일 취급한다. */
window.ROLES = ['Admin', 'Manager', 'Staff'];
window.isStaffRole = role => role === 'Staff' || role === 'Director';
window.roleLabel = role => (isStaffRole(role) ? 'Staff' : (role || '-'));

// 표 안에서 쓰는 통화기호 없는 숫자 포맷 (운영 관리 표 등)
window.fmtNum = n => num(n).toLocaleString();

/* ===== [v3.4] 날짜 정규화 =====
   구버전 엑셀 업로드가 날짜를 '엑셀 시리얼 숫자'로 저장해 둔 데이터가 있다.
   숫자/Date 객체에는 .startsWith 가 없어 화면 전체가 죽으므로 전 구간에서 문자열로 통일한다. */
window.isDateStr = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

window.toDateStr = v => {
  if (v === undefined || v === null || v === '') return '';
  if (isDateStr(v)) return v;
  const ymd = d => (isNaN(d) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]);
  // Date 객체 (realm 이 달라도 인식되도록 덕타이핑)
  if (typeof v === 'object' && typeof v.getTime === 'function') return ymd(new Date(v.getTime()));
  // 엑셀 시리얼 날짜 (1900 기준)
  if (typeof v === 'number' && isFinite(v)) {
    if (v < 1 || v > 2958465) return '';           // 1900-01-01 ~ 9999-12-31 범위 밖
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isNaN(d) ? '' : d.toISOString().split('T')[0];
  }
  const t = String(v).trim().replace(/[.\/]/g, '-').replace(/\s.*$/, '').replace(/-+$/, '');
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return ''; // 월/일 순서를 추측해야 하는 형식은 잘못 넣지 않는다
};
