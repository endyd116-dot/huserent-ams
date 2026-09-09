/* =========================================================
   달력 (v3.4)
   - 체크아웃 게스트 / 체크인 게스트가 같은 날 겹칠 때 대각선 분할 표시
     · 좌상단 삼각형 = 그날 퇴실하는 예약
     · 우하단 삼각형 = 그날부터 숙박하는 예약
   - 삼각형 영역별로 클릭 대상이 분리된다
   ========================================================= */

window.CAL_DEFAULT_COLOR = '#2563eb';

window.bookingColor = b => {
  const pl = b ? store.platforms.find(p => p.name === b.platform) : null;
  return (pl && pl.color) || CAL_DEFAULT_COLOR;
};

// 특정 날짜의 예약 상태 (숙박중 / 당일 퇴실)
window.dayBookings = (bookings, ds) => ({
  stay: bookings.find(b => ds >= b.checkIn && ds < b.checkOut) || null,
  out:  bookings.find(b => ds === b.checkOut) || null
});

// 체크인/체크아웃 구분 범례 (모든 달력 상단 공용)
window.calendarLegend = () => `<div class="flex items-center gap-3 text-[10px] font-black text-slate-400 flex-wrap">
  <span class="flex items-center gap-1"><span class="cal-legend cal-legend-out"></span>퇴실 (오전)</span>
  <span class="flex items-center gap-1"><span class="cal-legend cal-legend-in"></span>입실 (오후)</span>
  <span class="flex items-center gap-1"><span class="cal-legend cal-legend-full"></span>숙박중</span>
</div>`;

window.buildCalendar = function(year, month, propId, onClickHandler) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const days = last.getDate();
  const bookings = store.bookings.filter(b => b.propId === propId);
  const call = (ds, id) => onClickHandler ? `(${onClickHandler})('${ds}',${id == null ? 'null' : id},${propId})` : '';
  const zone = (cls, ds, id, color, tip) =>
    `<div class="cal-layer ${cls}" style="${color ? `background:${color}33;` : ''}" ${onClickHandler ? `onclick="event.stopPropagation();${call(ds, id)}"` : ''} title="${esc(tip)}"></div>`;

  let html = `<div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">`;
  ['일', '월', '화', '수', '목', '금', '토'].forEach(d => html += `<div class="text-center py-2">${d}</div>`);
  html += `</div><div class="grid grid-cols-7 gap-1">`;
  for (let i = 0; i < startDow; i++) html += `<div class="cal-cell bg-slate-50/50 rounded-lg"></div>`;

  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { stay, out } = dayBookings(bookings, ds);
    const isToday = ds === todayStr();
    const inC = stay ? bookingColor(stay) : '';
    const outC = out ? bookingColor(out) : '';
    const isArrival = !!stay && stay.checkIn === ds;

    let layers = '', body = '', cellStyle = '', cellClick = '';

    if (out && stay) {
      // 같은 날 퇴실 + 입실 → 대각선 분할
      layers = zone('cal-out', ds, out.id, outC, `퇴실: ${out.guest}`)
             + zone('cal-in', ds, stay.id, inC, `입실: ${stay.guest}`)
             + `<div class="cal-split"></div>`;
      body = `<div class="cal-tag cal-tag-out" style="color:${outC}">↖ ${esc(out.guest)} 퇴실</div>
              <div class="cal-tag cal-tag-in" style="color:${inC}">${esc(stay.guest)} 입실 ↘</div>`;
    } else if (out) {
      // 퇴실만 있는 날 → 좌상단만 채우고, 우하단은 신규 예약 영역
      layers = zone('cal-out', ds, out.id, outC, `퇴실: ${out.guest}`)
             + zone('cal-in', ds, null, '', '이 날짜로 신규 예약')
             + `<div class="cal-split"></div>`;
      body = `<div class="cal-tag cal-tag-out" style="color:${outC}">↖ ${esc(out.guest)} 퇴실</div>
              <div class="cal-tag cal-tag-in text-slate-300">예약 가능 ↘</div>`;
    } else if (stay) {
      cellStyle = `background:${inC}20;border-color:${inC}`;
      cellClick = call(ds, stay.id);
      body = `<div class="text-[9px] font-bold mt-1 truncate" style="color:${inC}">${isArrival ? '▶ ' : ''}${esc(stay.guest)}</div>
              <div class="text-[8px] truncate opacity-70">${esc(stay.platform || '')}</div>`;
    } else {
      cellClick = call(ds, null);
    }

    html += `<div ${cellClick ? `onclick="${cellClick}"` : ''} class="cal-cell rounded-lg border ${isToday ? 'ring-2 ring-blue-500' : 'border-slate-100'} cursor-pointer hover:bg-blue-50 p-1.5 overflow-hidden" style="${cellStyle}">
      ${layers}
      <div class="cal-content">
        <div class="text-xs font-black ${isToday ? 'text-blue-600' : 'text-slate-700'}">${d}</div>
        ${body}
      </div>
    </div>`;
  }
  html += `</div>`;
  return html;
};

/* 여러 매물을 한 칸에 모아 보는 달력(관리자 예약 관리 월별 뷰)용 배지 */
window.calendarDayBadges = function(ds, bookings, onClickHandler, maxItems = 4) {
  const items = [];
  bookings.forEach(b => {
    if (ds === b.checkOut) items.push({ b, kind: 'out' });
    else if (ds === b.checkIn) items.push({ b, kind: 'in' });
    else if (ds > b.checkIn && ds < b.checkOut) items.push({ b, kind: 'stay' });
  });
  // 퇴실 → 입실 → 숙박중 순서
  const order = { out: 0, in: 1, stay: 2 };
  items.sort((a, x) => order[a.kind] - order[x.kind]);

  const mark = { out: '↖퇴실', in: '▶입실', stay: '·' };
  const html = items.slice(0, maxItems).map(({ b, kind }) => {
    const color = bookingColor(b);
    const name = (store.prop(b.propId)?.name || '').slice(0, 6);
    const style = kind === 'out'
      ? `background:transparent;color:${color};border:1px dashed ${color}`
      : `background:${color}20;color:${color};border:1px solid ${color}40`;
    return `<div class="text-[9px] font-bold truncate px-1 py-0.5 rounded mt-0.5 cursor-pointer" style="${style}" onclick="event.stopPropagation();${onClickHandler}('${ds}',${b.id})">${mark[kind]} ${esc(name)}·${esc((b.guest || '').slice(0, 3))}</div>`;
  }).join('');
  return html + (items.length > maxItems ? `<div class="text-[8px] text-slate-400 mt-0.5">+${items.length - maxItems}건</div>` : '');
};
