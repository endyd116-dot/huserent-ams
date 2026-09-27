// 금액 표시 (천 단위 콤마). 문자열·음수도 안전하게 처리한다
window.fmt = n => { const v = Math.round(num(n)); return (v < 0 ? '-₩' : '₩') + Math.abs(v).toLocaleString('ko-KR'); };

// 로컬(한국) 기준 'YYYY-MM-DD'. toISOString 은 UTC 라 새벽 0~9시에 하루 전 날짜가 나온다
window.ymdLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
window.todayStr = () => ymdLocal(new Date());
window.addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); return ymdLocal(new Date(y, m - 1, d + n)); };
window.dowKo = ds => '일월화수목금토'[new Date(`${ds}T00:00:00`).getDay()];

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

/* ===== [v3.5] 금액 입력칸 천 단위 콤마 =====
   type="number" 는 콤마를 표시할 수 없어 text + inputmode=numeric 으로 바꾸고, 입력하는 동안 콤마를 넣는다.
   읽을 때는 num() 이 콤마를 걷어내므로 저장 로직은 반드시 num() 을 거친다. 음수는 data-neg 칸만 허용. */
window.moneyAttrs = (allowNeg = false) => `type="text" inputmode="numeric" autocomplete="off" data-money${allowNeg ? ' data-neg' : ''}`;

// 입력칸 초기값: 0/빈 값은 비워 두고(placeholder 노출), keepZero 면 '0'
window.moneyVal = (v, keepZero = false) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = Math.round(num(v));
  if (!n && !keepZero) return '';
  return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('ko-KR');
};
window.setMoney = (el, v) => { if (el) el.value = moneyVal(v); };

window.fmtMoneyText = (raw, allowNeg = false) => {
  const s = String(raw ?? '');
  const neg = allowNeg && s.trim().startsWith('-');
  const digits = s.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return neg ? '-' : '';
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 콤마를 다시 넣은 뒤에도 커서가 같은 숫자 뒤에 오도록 복원
window.formatMoneyInput = el => {
  const old = el.value;
  const next = fmtMoneyText(old, el.hasAttribute('data-neg'));
  if (next === old) return;
  const pos = el.selectionStart ?? old.length;
  const digitsBefore = old.slice(0, pos).replace(/[^0-9]/g, '').length;
  el.value = next;
  let i = next.startsWith('-') ? 1 : 0, seen = 0;
  while (i < next.length && seen < digitsBefore) { if (/\d/.test(next[i])) seen++; i++; }
  try { el.setSelectionRange(i, i); } catch (e) { /* 포커스 없는 칸 */ }
};

// 모바일 숫자 키패드에는 '-' 가 없어 ± 버튼으로 부호를 바꾼다
window.toggleMoneySign = id => {
  const el = document.getElementById(id);
  if (!el) return;
  const v = el.value.trim();
  el.value = v.startsWith('-') ? v.slice(1) : (v ? '-' + v : '-');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
};

// 캡처 단계에서 먼저 포맷 → 각 폼의 input 리스너(합계 재계산 등)는 정리된 값을 본다
document.addEventListener('input', e => {
  const t = e.target;
  if (t && t.matches && t.matches('input[data-money]')) formatMoneyInput(t);
}, true);

// 엑셀 내보내기: 지정한 머리글 열의 숫자에 천 단위 콤마 서식(#,##0)
window.xlsxMoneyCols = (ws, headers) => {
  if (!ws || !ws['!ref'] || typeof XLSX === 'undefined') return ws;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (!h || !headers.includes(h.v)) continue;
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = '#,##0';
    }
  }
  return ws;
};

/* ===== [v3.5] 정기 지출 (매월 자동이체) =====
   규칙: { id, propId, majorCat, category, amount, payDay(1~31, 31=말일), startMonth 'YYYY-MM', endMonth, active, lastMonth }
   lastMonth 까지는 이미 처리한 달 → 등록된 지출을 지워도 다시 만들지 않는다. */
window.payDayLabel = d => (+d >= 31 ? '말일' : `${+d}일`);

// 해당 월의 자동이체 날짜 (말일보다 큰 날은 말일로)
window.recurringDate = (ym, day) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const d = Math.min(Math.max(1, Math.floor(+day) || 1), last);
  return `${ym}-${String(d).padStart(2, '0')}`;
};

// today 까지 자동이체일이 도래했는데 아직 처리하지 않은 달 목록 (오래된 달부터, 최대 cap 개월)
window.recurringDueMonths = (rule, today = todayStr(), cap = 36) => {
  if (!rule || rule.active === false || !/^\d{4}-\d{2}$/.test(rule.startMonth || '')) return [];
  const out = [];
  let [y, m] = rule.startMonth.split('-').map(Number);
  const thisYm = today.slice(0, 7);
  for (let guard = 0; guard < 600; guard++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (ym > thisYm || (rule.endMonth && ym > rule.endMonth)) break;
    const date = recurringDate(ym, rule.payDay);
    if (date <= today && !(rule.lastMonth && ym <= rule.lastMonth)) out.push({ ym, date });
    if (++m > 12) { m = 1; y++; }
  }
  return out.slice(-cap);
};
window.nextMonthStr = ym => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

// 등록 시각(ms): createdAt 이 있으면 그것, 없으면 Date.now() 로 발급된 id. 시드처럼 작은 id 는 0 (가장 오래된 것으로 취급)
window.regTime = x => {
  if (!x) return 0;
  if (x.createdAt) { const t = Date.parse(String(x.createdAt).replace(' ', 'T')); if (!isNaN(t)) return t; }
  const id = Number(x.id);
  return id > 1e12 ? Math.floor(id) : 0;
};

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
