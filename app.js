// Guard: harus sudah login
const saved = localStorage.getItem('currentUser');
if(!saved){ location.href='index.html'; }
// state
const qs  = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];
const state = { items: [], users: [], currentUser: JSON.parse(saved), stocktake: [] };

const isAdmin = () => state.currentUser?.role === 'admin';
function updateWho(){
  const el = qs('#who');
  if(!el) return;
  el.textContent = state.currentUser ? `${state.currentUser.name||state.currentUser.id}（${state.currentUser.role||'user'}）` : '未ログイン';
}
function applyRole(){
  qsa('.admin-only').forEach(el => el.style.display = isAdmin() ? '' : 'none');
}

// API helper (tanpa preflight)
async function api(path, { method='GET', body } = {}){
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(path)}&apikey=${apikey}`;
  if(method === 'GET'){
    const res = await fetch(url);
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// Navigation
function switchView(id){
  const view = qs(`#view-${id}`);
  if(!view){ console.warn('view not found:', id); return; }
  qsa('.view').forEach(v=>v.classList.remove('active'));
  view.classList.add('active');
  qsa('.sb-link').forEach(b=> b.classList.toggle('active', b.dataset.view===id));
  if(id==='inout'){ stopItemScanner().finally(()=> setTimeout(startItemScanner,150)); }
  else { stopItemScanner(); }
}
function bindSidebar(){
  qsa('.sb-link').forEach(b=> b.addEventListener('click', ()=> switchView(b.dataset.view)));
}

// Bootstrap
async function bootstrap(){
  try{
    bindSidebar();
    // tombol top
    qs('#btn-open-in-top')?.addEventListener('click', ()=>{ switchView('inout'); qs('#type').value='IN'; });
    qs('#btn-open-out-top')?.addEventListener('click',()=>{ switchView('inout'); qs('#type').value='OUT'; });

    qs('#btn-logout')?.addEventListener('click', ()=>{
      localStorage.removeItem('currentUser');
      location.href='index.html';
    });

    const [items, users] = await Promise.all([ api('items'), api('users') ]);
    state.items = items; state.users = users;

    renderItems(); renderUsers(); renderDashboard(); renderStock();
    applyRole(); updateWho();

    // admin form tambah user
    qs('#form-add-user')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if(!isAdmin()){ alert('管理者のみ'); return; }
      const body = {
        name: qs('#f-name').value.trim(),
        id:   qs('#f-id').value.trim(),
        role: qs('#f-role').value,
        pass: qs('#f-pass').value.trim()
      };
      if(!body.name || !body.id || !body.pass){ alert('必須項目'); return; }
      try{
        const r = await api('addUser', { method:'POST', body });
        if(!r.ok) throw new Error(r.error||'failed');
        qs('#user-save-msg').textContent='保存しました';
        state.users = await api('users'); renderUsers();
        e.target.reset();
      }catch(err){ qs('#user-save-msg').textContent='失敗：'+err.message; }
    });

  }catch(e){
    console.error(e); alert('初期化に失敗しました: '+e.message);
  }
}
window.addEventListener('DOMContentLoaded', bootstrap);

// Dashboard
let monthlyChart;
async function buildMonthlyChart(){
  const series = await api('statsMonthlySeries', { method:'GET' });
  const labels  = series.map(r=>r.month);
  const inData  = series.map(r=>r.in);
  const outData = series.map(r=>r.out);

  const ctx = document.getElementById('monthlyChart');
  if(!ctx) return;
  if(monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type:'bar', label:'入庫', data: inData,  borderWidth:1, backgroundColor:'#2563eb' },
        { type:'bar', label:'出庫', data: outData, borderWidth:1, backgroundColor:'#f97316' }
      ]
    },
    options: { responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ position:'bottom' } } }
  });
}
async function refreshTodayStats(){
  const last = await api('history', { method:'POST', body:{} });
  const recent5 = last.slice(-5).reverse();
  const ul5 = qs('#recent5');
  if(ul5){
    ul5.innerHTML='';
    recent5.forEach(r=>{
      const li=document.createElement('li');
      li.textContent = `${r.timestamp}｜${r.type==='IN'?'入':'出'}｜${r.name||''}｜${r.qty}${r.unit||''}`;
      ul5.appendChild(li);
    });
  }
  qs('#kpi-today').textContent = recent5.length;
}
function renderDashboard(){
  const low = state.items.filter(it => Number(it.min||0)>0 && Number(it.stock||0)<=Number(it.min));
  const ul = qs('#low-stock-list');
  if(ul){
    ul.innerHTML='';
    low.forEach(it=>{
      const li=document.createElement('li');
      li.textContent=`${it.name}（${it.code}） 残:${it.stock}`;
      li.style.color='var(--accent)';
      ul.appendChild(li);
    });
  }
  qs('#kpi-items').textContent = state.items.length;
  qs('#kpi-stock').textContent = state.items.reduce((a,b)=>a+Number(b.stock||0),0);
  qs('#kpi-low').textContent   = low.length;

  refreshTodayStats();
  buildMonthlyChart();
}

// Item scanner only
let itemScanner;
async function startItemScanner(){
  try{
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if(!id) return;
    const conf = { fps:10, qrbox:{width:250,height:250} };
    itemScanner = new Html5Qrcode('item-scanner');
    await itemScanner.start({deviceId:{exact:id}}, conf, onItemScan);
  }catch(e){ console.warn('item scanner', e); }
}
async function stopItemScanner(){ try{ await itemScanner?.stop(); itemScanner?.clear(); }catch(_){ } itemScanner=null; }
function onItemScan(text){
  try{ const obj=JSON.parse(text); if(obj.t==='item') text=obj.code; }catch(_){}
  qs('#item-code').value = text;
  const it = state.items.find(i=>i.code===text);
  qs('#item-detail').textContent = it
    ? `${it.name} / 価格: ${it.price||'-'} / 在庫: ${it.stock}`
    : '未登録商品';
}

// Commit IN/OUT
qs('#btn-commit')?.addEventListener('click', async ()=>{
  const payload = {
    userId: state.currentUser?.id || '',
    code  : qs('#item-code').value.trim(),
    qty   : Number(qs('#qty').value||0),
    unit  : qs('#unit').value,
    type  : qs('#type').value
  };
  if(!payload.code || !payload.qty){ alert('商品QRと数量は必須です'); return; }
  if(payload.type==='OUT' && !state.currentUser){ alert('出庫はログインが必要です'); return; }

  try{
    const r = await api('log', { method:'POST', body: payload });
    if(!r.ok) throw new Error(r.error||'');
    qs('#commit-status').textContent = '記録しました';
    state.items = await api('items');
    renderDashboard(); renderStock(); renderItems();
    setTimeout(()=>switchView('dashboard'), 300);
  }catch(e){ alert('記録失敗: '+e.message); }
});

// Items
function renderItems(){
  const tbd = qs('#items-table tbody'); if(!tbd) return; tbd.innerHTML='';
  const q = (qs('#item-search')?.value || '').toLowerCase();
  state.items
    .filter(it => !q || `${it.name}${it.code}`.toLowerCase().includes(q))
    .forEach(it=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.name}</td><td>${it.code}</td><td>${it.price||''}</td>
        <td>${it.stock||0}</td><td>${it.min||0}</td>
        <td><button data-code="${it.code}" class="btn-gen-qr accent">QR</button></td>`;
      tbd.appendChild(tr);
    });
  qsa('.btn-gen-qr').forEach(b=> b.onclick = ()=> addItemQR(b.dataset.code));
}
qs('#item-search')?.addEventListener('input', renderItems);

// Users
function renderUsers(){
  const tbd = qs('#users-table tbody'); if(!tbd) return; tbd.innerHTML='';
  state.users.forEach(u=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${u.name}</td><td>${u.id}</td><td>${u.role||'user'}</td>`;
    tbd.appendChild(tr);
  });
}

// Stock
function renderStock(){
  const tbd = qs('#stock-table tbody'); if(!tbd) return; tbd.innerHTML='';
  state.items.forEach(it=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${it.name}</td><td>${it.code}</td><td>${it.stock||0}</td><td>${it.min||0}</td>`;
    tbd.appendChild(tr);
  });
}

// QR build (items/users)
function addItemQR(code){
  const it = state.items.find(i=>i.code===code); if(!it) return;
  // … (pakai qrlib.js kamu untuk render sheet print jika perlu)
}
