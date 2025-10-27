// ===== Guard =====
const saved = localStorage.getItem('currentUser');
if (!saved) location.href = 'index.html';

// ===== State =====
const state = {
  currentUser: JSON.parse(saved),
  items: [], users: [], history: [], monthly: [],
  _mov: [], _recap: [],
  monthlyChart: null, pieChart: null
};

// ===== Shortcuts =====
const qs = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>[...el.querySelectorAll(s)];
function fmt(n){ return new Intl.NumberFormat('ja-JP').format(n ?? 0); }
function showView(id, title){
  qsa('main section').forEach(x=>x.classList.toggle('d-none', x.id!==id));
  qsa('.sidebar a.nav-link').forEach(a=>a.classList.toggle('active', a.getAttribute('data-view')===id));
  if (title) qs('#page-title').textContent = title;
}
function showLoading(on, text){
  const el=qs('#global-loading'); const t=qs('#loading-text');
  if(!el) return; if(text) t.textContent=text; el.classList.toggle('d-none', !on);
}

// ===== Brand =====
(function setBrand(){
  try{
    const url = (window.CONFIG && (CONFIG.LOGO_URL||'./assets/tsh.png')) || './assets/tsh.png';
    const img = qs('#brand-logo'); if(img) img.src = url;
  }catch(_){}
})();
(function updateWho(){
  const u=state.currentUser;
  qs('#who').innerHTML = `${u.name} <small class="ms-1">（${u.id}｜${u.role||'user'}）</small>`;
})();

// ===== API =====
async function api(action, {method='GET', body}={}){
  const apikey = encodeURIComponent(CONFIG.API_KEY||'');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(action)}&apikey=${apikey}`;
  if(method==='GET'){
    const r=await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json();
  }
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...(body||{}),apikey:CONFIG.API_KEY})});
  if(!r.ok) throw new Error(await r.text()); return r.json();
}

// ===== LOAD =====
async function loadAll(){
  showLoading(true,'読み込み中…');
  const arr=(x)=>Array.isArray(x)?x:[];
  const [items,users,history,monthly]=await Promise.all([
    api('items').catch(()=>[]),
    api('users').catch(()=>[]),
    api('history').catch(()=>[]),
    api('statsMonthlySeries').catch(()=>[])
  ]);
  state.items=arr(items); state.users=arr(users); state.history=arr(history); state.monthly=arr(monthly);

  renderMetrics();
  renderMonthlyChart();
  renderPieChart();      // baru
  renderMovements();     // baru
  showLoading(false);
}

// ===== METRICS =====
function renderMetrics(){
  const low=state.items.filter(i=>Number(i.stock||0)<=Number(i.min||0)).length;
  const last30=state.history.slice(-200).length;
  qs('#metric-total-items').textContent=fmt(state.items.length);
  qs('#metric-low-stock').textContent=fmt(low);
  qs('#metric-users').textContent=fmt(state.users.length);
  qs('#metric-txn').textContent=fmt(last30);
}

// ===== CHARTS =====
function renderMonthlyChart(){
  const el=qs('#chart-monthly'); if(!el) return;
  state.monthlyChart?.destroy?.();
  const labels = state.monthly.map(m=>m.month);
  const dataIn  = state.monthly.map(m=>m.in||0);
  const dataOut = state.monthly.map(m=>m.out||0);
  state.monthlyChart = new Chart(el,{
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'IN', data:dataIn, backgroundColor:'rgba(79,140,255,.75)'},
        {label:'OUT', data:dataOut, backgroundColor:'rgba(249,115,22,.7)'}
      ]
    },
    options:{ responsive:true, scales:{y:{beginAtZero:true}} }
  });
}

// Pie IN vs OUT this month
function renderPieChart(){
  const el=qs('#chart-pie'); if(!el) return;
  state.pieChart?.destroy?.();

  // ambil transaksi bulan berjalan
  const now=new Date(); const start=new Date(now.getFullYear(), now.getMonth(), 1);
  let sumIn=0, sumOut=0;
  state.history.forEach(h=>{
    const ts = h.timestamp ? new Date(h.timestamp.replace(' ','T')) : null;
    if (!ts || ts<start) return;
    const qty=Number(h.qty||0);
    if(String(h.type)==='IN') sumIn+=qty; else sumOut+=qty;
  });

  state.pieChart = new Chart(el,{
    type:'pie',
    data:{
      labels:['IN','OUT'],
      datasets:[{
        data:[sumIn, sumOut],
        backgroundColor: ['#4f8cff','#f97316']
      }]
    },
    options:{ responsive:true }
  });
}

// ===== Per-item movement this month =====
function computeMovementsThisMonth(){
  const now=new Date(); const start=new Date(now.getFullYear(), now.getMonth(), 1);
  const byCode={}; // code->{name, in, out}
  state.history.forEach(h=>{
    const ts = h.timestamp ? new Date(h.timestamp.replace(' ','T')) : null;
    if(!ts || ts<start) return;
    const code=String(h.code||''); if(!code) return;
    const item = state.items.find(i=>String(i.code)===code);
    if(!byCode[code]) byCode[code]={ code, name:item?.name||'', in:0, out:0 };
    const qty=Number(h.qty||0);
    if(String(h.type)==='IN') byCode[code].in += qty; else byCode[code].out += qty;
  });
  const rows = Object.values(byCode).map(r=>({...r, net:(r.in - r.out)}));
  rows.sort((a,b)=> (b.in+b.out) - (a.in+a.out));
  return rows;
}
function renderMovements(){
  const tb=qs('#tbl-mov'); if(!tb) return; tb.innerHTML='';
  const rows = computeMovementsThisMonth(); state._mov = rows;
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${r.code}</td><td>${r.name}</td>
      <td class="text-end">${fmt(r.in)}</td>
      <td class="text-end">${fmt(r.out)}</td>
      <td class="text-end">${fmt(r.net)}</td>`;
    tb.appendChild(tr);
  });
}

// ===== Export helpers =====
function downloadText(filename, text){
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function exportCsv(filename, rows, headers){
  const head=headers.join(',')+'\n';
  const body=rows.map(r=>headers.map(h=>String(r[h]??'')).join(',')).join('\n');
  downloadText(filename, head+body);
}

// ===== Events =====
window.addEventListener('DOMContentLoaded', async ()=>{
  // nav
  qsa('.sidebar a.nav-link').forEach(a=>a.addEventListener('click',()=>{
    const id=a.getAttribute('data-view'); showView(id, a.textContent.trim());
    document.getElementById('sb').classList.remove('show');
  }));
  // logout
  qs('#btn-logout')?.addEventListener('click',()=>{ localStorage.removeItem('currentUser'); location.href='index.html'; });

  // export movement (this month)
  qs('#btn-export-mov')?.addEventListener('click',()=>{
    const rows = state._mov || computeMovementsThisMonth();
    exportCsv('movements_this_month.csv', rows, ['code','name','in','out','net']);
  });

  showView('view-dashboard','ダッシュボード');
  await loadAll();
});
