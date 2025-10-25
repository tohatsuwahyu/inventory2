// ---------- Guard ----------
if (!window.CONFIG || !CONFIG.BASE_URL) {
  alert('CONFIG missing: pastikan config.js dimuat sebelum app.js');
  throw new Error('CONFIG missing');
}

// ---------- Utils ----------
const qs  = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];
const state = { items: [], users: [], currentUser: null, stocktake: [] };

const isAdmin = () => state.currentUser?.role === 'admin';

// Fallback aman kalau qrlib belum ada (mencegah ReferenceError)
window.QRPrint = window.QRPrint || {
  buildUserGrid: (el, rows=[]) => { el && (el.innerHTML = rows.map(r=>`<div>${r.name} (${r.id})</div>`).join('')); },
  buildItemGrid: (el, rows=[]) => { el && (el.innerHTML = rows.map(r=>`<div>${r.name} (${r.code})</div>`).join('')); }
};

function updateWho(){
  const el = qs('#who');
  if(!el) return;
  el.textContent = state.currentUser
    ? `${state.currentUser.name || state.currentUser.id}（${state.currentUser.role || 'viewer'}）`
    : '未ログイン';

  // Toggle tombol login/logout agar konsisten
  const loginQR  = qs('#btn-login-qr');
  const loginPwd = qs('#btn-login-pass');
  const logout   = qs('#btn-logout');
  if (state.currentUser) {
    if (loginQR)  loginQR.style.display  = 'none';
    if (loginPwd) loginPwd.style.display = 'none';
    if (logout)   logout.style.display   = '';
  } else {
    if (loginQR)  loginQR.style.display  = '';
    if (loginPwd) loginPwd.style.display = '';
    if (logout)   logout.style.display   = 'none';
  }
}

function applyRole(){
  // admin-only toggle
  qsa('.admin-only').forEach(el => el.style.display = isAdmin() ? '' : 'none');
  // 入出庫 tidak dikunci
  ['qty','unit','type','btn-commit'].forEach(id=>{
    const el = qs('#'+id);
    if(el) el.disabled = false;
  });
}

// ---------- API helper (tanpa preflight) ----------
async function api(path, { method='GET', body } = {}){
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(path)}&apikey=${apikey}`;

  if (method === 'GET'){
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------- Navigation ----------
function switchView(id){
  const view = qs(`#view-${id}`);
  if(!view){ console.warn('view not found:', id); return; }
  qsa('.view').forEach(v=>v.classList.remove('active'));
  view.classList.add('active');
  qsa('.sb-link').forEach(b=> b.classList.toggle('active', b.dataset.view===id));

  if (id === 'inout') startItemScanner();
  else stopItemScanner();
}
function bindSidebar(){
  qsa('.sb-link').forEach(b=>{
    b.addEventListener('click', ()=> switchView(b.dataset.view));
  });
}

// ---------- Bootstrap ----------
async function bootstrap(){
  try{
    bindSidebar();
    const [items, users] = await Promise.all([ api('items'), api('users') ]);
    state.items = items; state.users = users;

    renderItems(); renderUsers(); renderDashboard(); renderStock();
    buildQRSheets(); buildParts(); buildUserQRSheets();

    applyRole(); updateWho();

    // Top buttons
    qs('#btn-open-in-top')?.addEventListener('click', ()=>{ switchView('inout'); qs('#type').value='IN'; });
    qs('#btn-open-out-top')?.addEventListener('click',()=>{ switchView('inout'); qs('#type').value='OUT'; });
    qs('#btn-open-in')?.addEventListener('click', ()=>{ switchView('inout'); qs('#type').value='IN'; });
    qs('#btn-open-out')?.addEventListener('click',()=>{ switchView('inout'); qs('#type').value='OUT'; });

    // Login QR
    qs('#btn-login-qr')?.addEventListener('click', ()=>{
      qs('#dlg-login-qr')?.showModal();
      setTimeout(startLoginScanner,120);
    });
    // Login password (opsional)
    qs('#btn-login-pass')?.addEventListener('click', ()=> qs('#dlg-pass-login')?.showModal());
    qs('#pl-ok')?.addEventListener('click', (e)=>{
      e.preventDefault();
      const id = qs('#pl-id')?.value.trim();
      const pw = qs('#pl-pass')?.value.trim();
      const u = state.users.find(x=>x.id===id);
      if(!u){ alert('ユーザーが見つかりません'); return; }
      if(u.pin && String(u.pin) !== pw){ alert('パスコードが違います'); return; }
      state.currentUser = {...u};
      updateWho(); applyRole();
      qs('#dlg-pass-login')?.close();
    });

    // Logout
    qs('#btn-logout')?.addEventListener('click', ()=>{
      state.currentUser = null; updateWho(); applyRole();
      stopLoginScanner(); stopItemScanner();
    });

    // Cleanup scanner saat tab ditutup
    window.addEventListener('beforeunload', ()=>{ stopLoginScanner(); stopItemScanner(); });

  }catch(e){
    console.error(e); alert('初期化に失敗しました: '+e.message);
  }
}
window.addEventListener('DOMContentLoaded', bootstrap);

// ---------- Dashboard ----------
let monthlyChart;
async function buildMonthlyChart(){
  try{
    const series = await api('statsMonthlySeries', { method:'GET' });
    const labels  = series.map(r=>r.month);
    const inData  = series.map(r=>r.in);
    const outData = series.map(r=>r.out);

    const ctx = document.getElementById('monthlyChart');
    if(!ctx) return;
    monthlyChart?.destroy();
    monthlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type:'bar', label:'入庫', data: inData,  borderWidth:1, backgroundColor:'#2563eb' },
          { type:'bar', label:'出庫', data: outData, borderWidth:1, backgroundColor:'#f97316' },
          { type:'line',label:'差分(入-出)', data: inData.map((v,i)=>v-outData[i]), borderColor:'#10b981', fill:false, tension:.3 }
        ]
      },
      options: { responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ position:'bottom' } } }
    });
  }catch(e){ console.warn('monthly chart:', e.message); }
}
async function refreshTodayStats(){
  try{
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
  }catch(e){ console.warn('today stats:', e.message); }
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
  const badge = qs('#badge-low');
  if(badge){ badge.textContent = low.length; badge.style.display = low.length?'inline-flex':'none'; }
  qs('#kpi-items') && (qs('#kpi-items').textContent = state.items.length);
  qs('#kpi-stock') && (qs('#kpi-stock').textContent = state.items.reduce((a,b)=>a+Number(b.stock||0),0));
  qs('#kpi-low')   && (qs('#kpi-low').textContent   = low.length);

  refreshTodayStats();
  buildMonthlyChart();
}

// ===== QR Login =====
let loginScanner;
let loginScannerState = 'stopped'; // 'running' | 'stopped'
async function startLoginScanner(){
  if (loginScannerState === 'running') return;
  try{
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if(!id) return;
    const conf = { fps:10, qrbox:{width:250,height:250} };
    loginScanner = new Html5Qrcode('login-scanner');
    await loginScanner.start({deviceId:{exact:id}}, conf, onLoginScan);
    loginScannerState = 'running';
  }catch(e){ console.warn('login scanner', e); loginScannerState = 'stopped'; }
}
async function stopLoginScanner(){
  try{
    if (loginScannerState === 'running') {
      await loginScanner?.stop();
      loginScanner?.clear();
    }
  }catch(_){}  finally { loginScannerState = 'stopped'; loginScanner = null; }
}
function onLoginScan(text){
  try{ const o=JSON.parse(text); if(o.t==='user') text=o.id; }catch(_){}
  const u = state.users.find(x=>x.id===text);
  if(!u){ alert('ユーザーが見つかりません'); return; }
  state.currentUser = {...u};
  updateWho(); applyRole();
  qs('#dlg-login-qr')?.close();
  stopLoginScanner();
}

// ---------- Item Scanner (hanya satu instance) ----------
let itemScanner;
let itemScannerState = 'stopped'; // 'running' | 'stopped'
async function startItemScanner(){
  if (itemScannerState === 'running') return;
  try{
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if(!id) return;
    const conf = { fps:10, qrbox:{width:250,height:250} };
    itemScanner = new Html5Qrcode('item-scanner');
    await itemScanner.start({deviceId:{exact:id}}, conf, onItemScan);
    itemScannerState = 'running';
  }catch(e){ console.warn('item scanner', e); itemScannerState = 'stopped'; }
}
async function stopItemScanner(){
  try{
    if (itemScannerState === 'running') {
      await itemScanner?.stop();
      itemScanner?.clear();
    }
  }catch(_){} finally { itemScannerState = 'stopped'; itemScanner = null; }
}
function onItemScan(text){
  try{ const obj=JSON.parse(text); if(obj.t==='item') text=obj.code; }catch(_){}
  const codeEl = qs('#item-code');
  if (codeEl) codeEl.value = text;
  const it = state.items.find(i=>i.code===text);
  const d  = qs('#item-detail');
  if (d) d.textContent = it ? `${it.name} / 価格: ${it.price||'-'} / 在庫: ${it.stock}` : '未登録商品';
}

// ---------- Commit IN/OUT ----------
qs('#btn-commit')?.addEventListener('click', async ()=>{
  const payload = {
    userId: state.currentUser?.id || '',
    code  : qs('#item-code')?.value.trim(),
    qty   : Number(qs('#qty')?.value||0),
    unit  : qs('#unit')?.value,
    type  : qs('#type')?.value
  };
  if(!payload.code || !payload.qty){
    alert('商品QRと数量は必須です');
    return;
  }
  // OUT wajib login
  if(payload.type==='OUT' && !state.currentUser){
    alert('出庫はログインが必要です');
    return;
  }

  try{
    await api('log', { method:'POST', body: payload });
    const st = qs('#commit-status');
    if(st) st.textContent = '記録しました';
    state.items = await api('items');
    renderDashboard(); renderStock(); renderItems();

    const ac = new URLSearchParams(location.search).get('autoclose');
    if(ac==='1'){ setTimeout(()=>window.close(),400); }
    else { setTimeout(()=>switchView('dashboard'),300); }
  }catch(e){ alert('記録失敗: '+e.message); }
});

// ---------- Items ----------
function renderItems(){
  const tbd = qs('#items-table tbody'); if(!tbd) return; tbd.innerHTML='';
  const q = (qs('#item-search')?.value || '').toLowerCase();

  state.items
    .filter(it => !q || `${it.name}${it.code}`.toLowerCase().includes(q))
    .forEach(it=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.name}</td>
        <td>${it.code}</td>
        <td>${it.price||''}</td>
        <td>${it.stock||0}</td>
        <td>${it.min||0}</td>
        <td class="actions">
          <button class="ghost" data-detail="${it.code}">詳細</button>
          <button data-code="${it.code}" class="btn-gen-qr accent">QR</button>
        </td>`;
      tbd.appendChild(tr);
    });

  // Detail
  qsa('button[data-detail]').forEach(b=> b.onclick = ()=> openItemDetail(b.dataset.detail));
  // QR
  qsa('.btn-gen-qr').forEach(b=> b.onclick = ()=> addItemQR(b.dataset.code));
}

// ---------- Users ----------
function renderUsers(){
  const tbd = qs('#users-table tbody'); if(!tbd) return; tbd.innerHTML='';
  state.users.forEach(u=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${u.name}</td><td>${u.id}</td><td>${u.role||'user'}</td><td><button data-id="${u.id}" class="btn-user-qr primary">QR</button></td>`;
    tbd.appendChild(tr);
  });
  qsa('.btn-user-qr').forEach(b=> b.onclick = ()=> addUserQR(b.dataset.id));
  buildUserQRSheets();
}
qs('#btn-add-user')?.addEventListener('click', ()=>{
  if(!isAdmin()){ alert('権限がありません（管理者のみ）'); return; }
  qs('#dlg-user')?.showModal();
});
qs('#dlg-user-ok')?.addEventListener('click', async(e)=>{
  e.preventDefault();
  if(!isAdmin()){ alert('権限がありません（管理者のみ）'); return; }
  const body = { name: qs('#dlg-user-name')?.value.trim(), id: qs('#dlg-user-id')?.value.trim(), role:'user' };
  if(!body.name||!body.id){ alert('必須項目'); return; }
  try{
    await api('addUser', { method:'POST', body });
    qs('#dlg-user')?.close();
    state.users = await api('users'); renderUsers();
  }catch(e2){ alert('作成失敗: '+e2.message); }
});

// ---------- History ----------
qs('#btn-filter-history')?.addEventListener('click', loadHistory);
async function loadHistory(){
  const params = { q: qs('#history-search')?.value.trim(), from: qs('#date-from')?.value, to: qs('#date-to')?.value };
  const rows = await api('history', { method:'POST', body: params });
  const tbd = qs('#history-table tbody'); if(!tbd) return;
  tbd.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${r.timestamp}</td><td>${r.userName||r.userId}</td><td>${r.name||''}</td><td>${r.code||''}</td><td>${r.qty}</td><td>${r.unit}</td><td>${r.type}</td>`;
    tbd.appendChild(tr);
  });
}

// ---------- Stock ----------
function renderStock(){
  const tbd = qs('#stock-table tbody'); if(!tbd) return; tbd.innerHTML='';
  state.items.forEach(it=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${it.name}</td><td>${it.code}</td><td>${it.stock||0}</td><td>${it.min||0}</td>`;
    tbd.appendChild(tr);
  });
}
qs('#btn-export-items-2')?.addEventListener('click', async()=>{
  const rows = await api('exportItems');
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '商品一覧');
  const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  saveAs(new Blob([out],{type:'application/octet-stream'}), 'items.xlsx');
});
qs('#import-items-2')?.addEventListener('change', async(e)=>{
  const file = e.target.files[0]; if(!file) return;
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data); const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet);
  await api('importItems', { method:'POST', body: { rows: json } });
  state.items = await api('items'); renderItems(); renderStock(); buildQRSheets(); buildParts();
  alert('インポート完了');
});

// ---------- QR build (Items / Users / Parts) ----------
function addItemQR(code){
  const it = state.items.find(i=>i.code===code); if(!it) return;
  const cell = document.createElement('div'); cell.className='qr-cell';
  const box = document.createElement('div'); box.className='box'; cell.appendChild(box);
  new QRCode(box, { text: JSON.stringify({ t:'item', code: it.code, name: it.name, price: it.price}), width:120, height:120 });
  const meta = document.createElement('div'); meta.innerHTML = `<div class="name">${it.name}</div><div>${it.code}</div><div>¥${it.price||'-'}</div>`;
  cell.appendChild(meta);
  qs('#qr-grid')?.appendChild(cell);
}
function addUserQR(id){
  const u = state.users.find(x=>x.id===id); if(!u) return;
  const cell = document.createElement('div'); cell.className='qr-cell';
  const box = document.createElement('div'); cell.appendChild(box);
  new QRCode(box, { text: JSON.stringify({ t:'user', id: u.id, name: u.name }), width:120, height:120 });
  const meta = document.createElement('div'); meta.innerHTML = `<div class="name">${u.name}</div><div>${u.id}</div>`;
  cell.appendChild(meta);
  qs('#user-qr-grid')?.appendChild(cell);
}
function buildQRSheets(){ const g = qs('#qr-grid'); if(!g) return; g.innerHTML=''; state.items.forEach(i=> addItemQR(i.code)); }
qs('#btn-print-qr')?.addEventListener('click', ()=> window.print());

function buildUserQRSheets(){ const grid = qs('#user-qr-grid'); if(!grid) return; QRPrint.buildUserGrid(grid, state.users); }
qs('#btn-print-user-qr')?.addEventListener('click', ()=> window.print());

function buildParts(){ const grid = qs('#parts-qr-grid'); if(!grid) return; QRPrint.buildItemGrid(grid, state.items); }
qs('#btn-build-parts-qr')?.addEventListener('click', buildParts);
qs('#btn-print-parts-qr')?.addEventListener('click', ()=> window.print());

// ---------- Export/Import from Items screen ----------
qs('#btn-export-items')?.addEventListener('click', async()=>{
  const rows = await api('exportItems');
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '商品一覧');
  const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  saveAs(new Blob([out],{type:'application/octet-stream'}), 'items.xlsx');
});
qs('#import-items')?.addEventListener('change', async(e)=>{
  const file = e.target.files[0]; if(!file) return;
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data); const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet);
  await api('importItems', { method:'POST', body: { rows: json } });
  state.items = await api('items'); renderItems(); renderStock(); buildQRSheets(); buildParts(); renderDashboard();
  alert('インポート完了');
});

// ---------- Detail Barang ----------
let detailChart;
async function openItemDetail(code){
  const it = state.items.find(i=>i.code===code);
  if(!it){ alert('商品が見つかりません'); return; }

  // panel kiri
  qs('#d-name')  && (qs('#d-name').textContent  = it.name);
  qs('#d-code')  && (qs('#d-code').textContent  = it.code);
  qs('#d-price') && (qs('#d-price').textContent = it.price ? `¥${it.price}` : '-');
  qs('#d-stock') && (qs('#d-stock').textContent = it.stock||0);
  qs('#d-min')   && (qs('#d-min').textContent   = it.min||0);
  qs('#d-init')  && (qs('#d-init').textContent  = it.initStock||0);

  // QR satuan
  const dqr = qs('#d-qr'); if (dqr){ dqr.innerHTML=''; new QRCode(dqr, { text: JSON.stringify({t:'item',code:it.code,name:it.name,price:it.price}), width:140, height:140 }); }

  // chart per-item
  const rows = await api('history', { method:'POST', body:{ q: it.code } });
  const buckets = {}; // {'YYYY-MM':{in:0,out:0}}
  rows.forEach(r=>{
    const m = (r.timestamp||'').slice(0,7);
    buckets[m] ||= {in:0,out:0};
    if(r.type==='IN') buckets[m].in += Number(r.qty||0);
    else              buckets[m].out+= Number(r.qty||0);
  });
  const labels = Object.keys(buckets).sort();
  const inData  = labels.map(k=> buckets[k].in);
  const outData = labels.map(k=> buckets[k].out);

  const ctx = qs('#detailChart');
  if (ctx){
    detailChart?.destroy();
    detailChart = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[
        { type:'bar', label:'入庫', data:inData, backgroundColor:'#2563eb' },
        { type:'bar', label:'出庫', data:outData, backgroundColor:'#f97316' }
      ]},
      options:{ responsive:true, plugins:{legend:{position:'bottom'}}, scales:{y:{beginAtZero:true}} }
    });
  }

  // history kecil
  const tbd = qs('#detail-history tbody');
  if (tbd){
    tbd.innerHTML='';
    rows.slice(-15).reverse().forEach(r=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.timestamp}</td><td>${r.userName||r.userId||'-'}</td><td>${r.qty}</td><td>${r.unit}</td><td>${r.type}</td>`;
      tbd.appendChild(tr);
    });
  }

  // tombol IN/OUT cepat
  qs('#btn-detail-in')  && (qs('#btn-detail-in').onclick  = ()=>{ switchView('inout'); qs('#type').value='IN';  qs('#item-code').value = it.code; onItemScan(it.code); });
  qs('#btn-detail-out') && (qs('#btn-detail-out').onclick = ()=>{ switchView('inout'); qs('#type').value='OUT'; qs('#item-code').value = it.code; onItemScan(it.code); });

  qs('#btn-print-dqr')?.addEventListener('click', ()=> window.print(), { once:true });

  switchView('item-detail');
}
qs('#btn-back-items')?.addEventListener('click', ()=> switchView('items'));
