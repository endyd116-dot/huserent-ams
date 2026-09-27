/* =========================================================
   달력 (v3.5)
   - 숙소별 달력: 에어비앤비처럼 예약을 '연결 바'로 표시
     · 바는 입실일 오후(칸 가운데)에서 시작해 퇴실일 오전(칸 가운데)에서 끝난다
     · 같은 날 퇴실/입실이 겹치면 두 바가 칸 가운데에서 맞닿는다
     · 주가 바뀌면 다음 줄에서 이어진다 (이어지는 쪽 모서리는 각지게)
   - 청소 등 직원 스케줄은 날짜 칸 아래쪽 칩으로 함께 표시
   - 전체 달력(예약 관리 월별)은 날짜별 배지 목록, 넘치면 '+N건' → 하루 전체 보기
   ========================================================= */

window.CAL_DEFAULT_COLOR = '#2563eb';

window.bookingColor = b => {
  const pl = b ? store.platforms.find(p => p.name === b.platform) : null;
  return (pl && pl.color) || CAL_DEFAULT_COLOR;
};

// 예약에 연결된 청소 스케줄 (예약 등록 시 청소 담당자를 배정하면 생성)
window.isCleaningSched = s => !!s && s.kind === 'cleaning';
window.cleaningFor = bookingId => (store.schedule || []).find(s => isCleaningSched(s) && String(s.bookingId) === String(bookingId)) || null;

// 스케줄 담당자 표시명 ('박보람(맨투)' → '맨투')
window.staffNick = name => { const m = String(name || '').match(/\((.+)\)/); return m ? m[1] : String(name || ''); };

window.calendarLegend = (kind = 'bar') => kind === 'bar'
  ? `<div class="flex items-center gap-3 text-[10px] font-black text-slate-400 flex-wrap">
      <span class="flex items-center gap-1"><span class="cal-legend-bar"></span>예약 (입실일 오후 → 퇴실일 오전)</span>
      <span class="flex items-center gap-1"><span class="cal-legend-chip"></span>🧹 청소·직원 스케줄</span>
    </div>`
  : `<div class="flex items-center gap-3 text-[10px] font-black text-slate-400 flex-wrap">
      <span>↖ 퇴실</span><span>▶ 입실</span><span>· 숙박중</span><span class="text-purple-500">🧹 청소·스케줄</span>
      <span class="text-slate-300">날짜 칸 클릭 → 그날 전체 보기</span>
    </div>`;

/* 숙소 1곳의 월 달력.
   onClickHandler(ds, bookingId|null, propId) : 예약 바 → 수정, 빈 날짜 → 그날 입실로 신규 예약
   opts.onSched(scheduleId) : 스케줄 칩 클릭 (기본 router.onScheduleClick) */
window.buildCalendar = function (year, month, propId, onClickHandler, opts = {}) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const today = todayStr();
  const bookings = (store.bookings || []).filter(b =>
    b.propId === propId && isDateStr(b.checkIn) && isDateStr(b.checkOut) && b.checkIn < b.checkOut);
  const scheds = opts.schedules === false ? [] : (store.schedule || []).filter(s => +s.propId === propId && isDateStr(s.date));
  const onSched = opts.onSched || 'router.onScheduleClick';
  const call = (ds, id) => onClickHandler ? `${onClickHandler}('${ds}',${id == null ? 'null' : id},${propId})` : '';

  const first = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + lastDate) / 7);

  let html = `<div class="cal"><div class="cal-head">${['일', '월', '화', '수', '목', '금', '토'].map((d, i) =>
    `<div class="${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}">${d}</div>`).join('')}</div>`;

  for (let w = 0; w < weeks; w++) {
    const days = Array.from({ length: 7 }, (_, i) => ymdLocal(new Date(year, month, 1 - first.getDay() + w * 7 + i)));
    const wStart = days[0], wEnd = days[6];

    // 이 주에 걸치는 구간: 시작/끝을 '칸 단위' 좌표로 (0.5 = 칸 가운데)
    const segs = bookings.filter(b => b.checkIn <= wEnd && b.checkOut >= wStart).map(b => ({
      b,
      s: b.checkIn < wStart ? 0 : days.indexOf(b.checkIn) + 0.5,
      e: b.checkOut > wEnd ? 7 : days.indexOf(b.checkOut) + 0.5,
      contL: b.checkIn < wStart,
      contR: b.checkOut > wEnd
    })).filter(x => x.e > x.s).sort((a, x) => a.s - x.s || x.e - a.e);

    // 한 숙소는 겹치는 예약이 없어 보통 한 줄. 데이터가 겹칠 때만 줄을 나눈다
    const laneEnd = [];
    segs.forEach(sg => {
      let l = laneEnd.findIndex(end => end <= sg.s);
      if (l < 0) { l = laneEnd.length; laneEnd.push(0); }
      laneEnd[l] = sg.e;
      sg.lane = l;
    });

    html += `<div class="cal-week" style="--lanes:${laneEnd.length}">`;
    days.forEach(ds => {
      const inMonth = ds.startsWith(monthKey);
      const daySch = scheds.filter(s => s.date === ds).sort((a, x) => (a.time || '').localeCompare(x.time || ''));
      const chips = daySch.slice(0, 2).map(s =>
        `<div class="cal-chip" onclick="event.stopPropagation();${onSched}(${s.id})" title="${esc(`${s.time || ''} ${s.task || ''} · ${s.staff || ''}`)}">${isCleaningSched(s) ? '🧹' : '📌'} ${esc(s.time || '')} ${esc(staffNick(s.staff).slice(0, 4))}</div>`).join('')
        + (daySch.length > 2 ? `<div class="cal-more">+${daySch.length - 2}</div>` : '');
      const click = inMonth ? call(ds, null) : '';
      html += `<div class="cal-day${inMonth ? '' : ' cal-out-month'}${ds === today ? ' cal-today' : ''}"${click ? ` onclick="${click}" title="${ds} · 빈 곳 클릭 → 이 날짜 입실로 예약"` : ''}>
        <span class="cal-dnum">${+ds.slice(8)}</span><div class="cal-chips">${chips}</div></div>`;
    });

    html += `<div class="cal-bars">`;
    segs.forEach(({ b, s, e, contL, contR, lane }) => {
      const c = bookingColor(b);
      const cl = cleaningFor(b.id);
      const tip = `${b.guest || ''} · ${b.platform || ''}\n${b.checkIn} ~ ${b.checkOut} (${daysBetween(b.checkIn, b.checkOut)}박)`
        + (cl ? `\n🧹 청소: ${cl.staff} ${cl.date} ${cl.time || ''}` : '');
      const padL = contL ? 0 : 2, padR = contR ? 0 : 2;
      html += `<div class="cal-bar${contL ? ' cont-l' : ''}${contR ? ' cont-r' : ''}" style="left:calc(${s} * 100% / 7 + ${padL}px);width:calc(${e - s} * 100% / 7 - ${padL + padR}px);top:calc(${lane} * var(--cal-lane));background-color:${c}2e;border-color:${c}" onclick="event.stopPropagation();${call(b.checkIn, b.id)}" title="${esc(tip)}"><span class="cal-bar-dot" style="background:${c}"></span><b>${esc(b.guest || '')}</b><span class="cal-bar-sub">${esc(b.platform || '')}</span></div>`;
    });
    html += `</div></div>`;
  }
  return html + `</div>`;
};

/* 여러 매물을 한 칸에 모아 보는 달력(관리자 예약 관리 월별)용 목록.
   퇴실 → 입실 → 청소·스케줄 → 숙박중 순서 */
window.calendarDayItems = (ds, bookings, schedules = []) => {
  const items = [];
  (bookings || []).forEach(b => {
    if (ds === b.checkOut) items.push({ kind: 'out', b });
    else if (ds === b.checkIn) items.push({ kind: 'in', b });
    else if (ds > b.checkIn && ds < b.checkOut) items.push({ kind: 'stay', b });
  });
  (schedules || []).forEach(s => { if (s.date === ds) items.push({ kind: 'sched', s }); });
  const order = { out: 0, in: 1, sched: 2, stay: 3 };
  return items.sort((a, x) => order[a.kind] - order[x.kind] || (a.kind === 'sched' ? (a.s.time || '').localeCompare(x.s.time || '') : 0));
};

window.calendarDayBadges = function (ds, bookings, onClickHandler, maxItems = 4, opts = {}) {
  const items = calendarDayItems(ds, bookings, opts.schedules);
  const mark = { out: '↖퇴실', in: '▶입실', stay: '·' };
  const html = items.slice(0, maxItems).map(it => {
    if (it.kind === 'sched') {
      const s = it.s;
      const pname = (store.prop(s.propId)?.name || '').slice(0, 6);
      return `<div class="cal-badge cal-badge-sched" onclick="event.stopPropagation();${opts.onSched || 'router.onScheduleClick'}(${s.id})" title="${esc(`${s.time || ''} ${s.task || ''} · ${s.staff || ''} · ${store.prop(s.propId)?.name || ''}`)}">${isCleaningSched(s) ? '🧹' : '📌'} ${esc(s.time || '')} ${esc(staffNick(s.staff).slice(0, 3))}·${esc(pname)}</div>`;
    }
    const { b, kind } = it;
    const color = bookingColor(b);
    const name = (store.prop(b.propId)?.name || '').slice(0, 6);
    const style = kind === 'out'
      ? `background:transparent;color:${color};border:1px dashed ${color}`
      : `background:${color}20;color:${color};border:1px solid ${color}40`;
    return `<div class="cal-badge" style="${style}" onclick="event.stopPropagation();${onClickHandler}('${ds}',${b.id})" title="${esc(`${b.guest || ''} · ${store.prop(b.propId)?.name || ''} (${b.checkIn}~${b.checkOut})`)}">${mark[kind]} ${esc(name)}·${esc((b.guest || '').slice(0, 3))}</div>`;
  }).join('');
  const more = items.length > maxItems
    ? (opts.onMore
      ? `<button type="button" class="cal-more-btn" onclick="event.stopPropagation();${opts.onMore}('${ds}')">+${items.length - maxItems}건 더보기</button>`
      : `<div class="text-[8px] text-slate-400 mt-0.5">+${items.length - maxItems}건</div>`)
    : '';
  return html + more;
};
