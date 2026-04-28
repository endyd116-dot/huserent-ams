window.buildCalendar = function(year, month, propId, onClickHandler) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month+1, 0);
  const startDow = first.getDay();
  const days = last.getDate();
  const bookings = store.bookings.filter(b => b.propId === propId);
  let html = `<div class="grid grid-cols-7 gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">`;
  ['일','월','화','수','목','금','토'].forEach(d => html += `<div class="text-center py-2">${d}</div>`);
  html += `</div><div class="grid grid-cols-7 gap-1">`;
  for (let i=0; i<startDow; i++) html += `<div class="cal-cell bg-slate-50/50 rounded-lg"></div>`;
  for (let d=1; d<=days; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const booking = bookings.find(b => ds>=b.checkIn && ds<b.checkOut);
    const plat = booking ? store.platforms.find(p => p.name===booking.platform) : null;
    const isToday = ds === todayStr();
    html += `<div onclick="${onClickHandler?`(${onClickHandler})('${ds}',${booking?booking.id:'null'})`:''}" class="cal-cell rounded-lg border ${isToday?'ring-2 ring-blue-500':'border-slate-100'} cursor-pointer hover:bg-blue-50 p-1.5 overflow-hidden" style="${booking?`background:${plat?.color||'#2563eb'}20;border-color:${plat?.color||'#2563eb'}`:''}">
      <div class="text-xs font-black ${isToday?'text-blue-600':'text-slate-700'}">${d}</div>
      ${booking?`<div class="text-[9px] font-bold mt-1 truncate" style="color:${plat?.color||'#2563eb'}">${booking.guest}</div><div class="text-[8px] truncate opacity-70">${booking.platform}</div>`:''}
    </div>`;
  }
  html += `</div>`;
  return html;
};