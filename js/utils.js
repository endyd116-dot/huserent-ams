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