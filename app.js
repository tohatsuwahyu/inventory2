const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];
const state = { items: [], users: [], currentUser: null, stocktake: [] };

// ---- API helper ----
async function api(path, { method='GET', body } = {}) {
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(path)}&apikey=${apikey}`;

  if (method === 'GET') {                 // GET tanpa header → no preflight
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  const res = await fetch(url, {          // POST text/plain → no preflight
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

  

function switchView(id){
  qsa('.view').forEach(v=>v.classList.remove('active'));
  qs(`#view-${id}`).classList.add('active');
  qsa('.sb-link').forEach(b=> b.classList.toggle('active', b.dataset.view===id));
}
qsa('.sb-link').forEach(b=> b.addEventListener('click',()=>switchView(b.dataset.view)));

qs('#btn-open-in-top').onclick = ()=>{ switchView('inout'); qs('#type').value='IN'; };
qs('#btn-open-out-top').onclick = ()=>{ switchView('inout'); qs('#type').value='OUT'; };

// ---- Role gating ----
function applyRole(){
  const isAdmin = state.currentUser?.role === 'admin';
  qsa('.admin-only').forEach(el=> el.style.display = isAdmin ? '' : 'none');
}

// ---- Load initial data ----
async function bootstrap(){
  try{
    const [items, users] = await Promise.all([ api('items'), api('users') ]);
    state.items = items; state.users = users;
    renderItems(); renderUsers(); renderDashboard(); buildQRSheets(); buildParts(); renderStock();
    applyRole();
  }catch(e){ console.error(e); alert('初期化に失敗しました: '+e.message); }
}

// ---- Dashboard ----
function renderDashboard(){
  const low = state.items.filter(it => Number(it.min||0) > 0 && Number(it.stock||0) <= Number(it.min));
  const ul = qs('#low-stock-list'); if(ul){ ul.innerHTML='';
    low.forEach(it=>{ const li=document.createElement('li'); li.textContent=`${it.name}（${it.code}） 残:${it.stock}`; li.style.color='var(--accent)'; ul.appendChild(li); });
  }
  const badge = qs('#badge-low'); if(badge){ badge.textContent = low.length; badge.style.display = low.length ? 'inline-flex' : 'none'; }
  const qsIn = qs('#btn-open-in'); const qsOut = qs('#btn-open-out');
  if(qsIn) qsIn.onclick = ()=>{ switchView('inout'); qs('#type').value='IN'; };
  if(qsOut) qsOut.onclick = ()=>{ switchView('inout'); qs('#type').value='OUT'; };
}

// ---- QR Scanner ----
let userScanner, itemScanner;

async function startScanners() {
  try {
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if (!id) return;
    const conf = { fps: 10, qrbox: { width: 250, height: 250 } };
    userScanner = new Html5Qrcode("user-scanner");
    itemScanner = new Html5Qrcode("item-scanner");
    await userScanner.start({ deviceId:{ exact:id }}, conf, onUserScan);
    await itemScanner.start({ deviceId:{ exact:id }}, conf, onItemScan);
  } catch(e){ console.warn('scanner', e); }
}

async function stopScanners(){
  try{ await userScanner?.stop(); userScanner?.clear(); }catch(_){}
  try{ await itemScanner?.stop(); itemScanner?.clear(); }catch(_){}
  userScanner = itemScanner = null;
}


async function stopScanners() {
  try { await userScanner?.stop(); userScanner?.clear(); } catch(_){}
  try { await itemScanner?.stop(); itemScanner?.clear(); } catch(_){}
  userScanner = itemScanner = null;
}

function switchView(id){
  const viewEl = document.querySelector(`#view-${id}`);
  if (!viewEl) { console.warn('view not found:', id); return; }

  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  viewEl.classList.add('active');

  document.querySelectorAll('.sb-link')
    .forEach(b=> b.classList.toggle('active', b.dataset.view===id));

  // scanner lifecycle
  if (id === 'inout') setTimeout(startScanners, 50);
  else stopScanners();
}


function onUserScan(text){
  qs('#user-id').value = text;
  const u = state.users.find(u=>u.id===text);
  state.currentUser = u || { id:text, name:'', role:'user' };
  qs('#user-name').textContent = u? `${u.name} (${u.role||'user'})` : '未登録ユーザー';
  applyRole();
}
function onItemScan(text){
  qs('#item-code').value = text; const it = state.items.find(i=>i.code===text);
  qs('#item-detail').textContent = it? `${it.name} / 価格: ${it.price||'-'} / 在庫: ${it.stock}`: '未登録商品';
}

// ---- 入出庫 ----
qs('#btn-commit')?.addEventListener('click', async()=>{
  const payload = {
    userId: qs('#user-id').value.trim(),
    code: qs('#item-code').value.trim(),
    qty: Number(qs('#qty').value||0),
    unit: qs('#unit').value,
    type: qs('#type').value
  };
  if(!payload.userId || !payload.code || !payload.qty){ alert('必須項目が未入力です'); return; }
  try{
    await api('log', { method:'POST', body: payload });
    qs('#commit-status').textContent = '記録しました';
    state.items = await api('items');
    renderItems(); renderDashboard(); renderStock(); buildQRSheets(); buildParts();
  }catch(e){ alert('記録失敗: '+e.message); }
});

// ---- 商品一覧 / 検索 ----
function renderItems(){
  const tbd = qs('#items-table tbody'); if(!tbd) return; tbd.innerHTML='';
  const q = qs('#item-search')?.value?.toLowerCase() || '';
  state.items.filter(it=> !q || `${it.name}${it.code}`.toLowerCase().includes(q)).forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.name}</td><td>${it.code}</td><td>${it.price||''}</td><td>${it.stock||0}</td><td>${it.min||0}</td><td><button data-code="${it.code}" class="btn-gen-qr accent">QR</button></td>`;
    tbd.appendChild(tr);
  });
  qsa('.btn-gen-qr').forEach(b=> b.onclick = ()=> addItemQR(b.dataset.code));
}
qs('#item-search')?.addEventListener('input', renderItems);

// ---- 新規商品 ----
qs('#btn-add-item')?.addEventListener('click', ()=> qs('#dlg-item').showModal());
qs('#dlg-item-ok')?.addEventListener('click', async(e)=>{
  e.preventDefault();
  const body = {
    name: qs('#dlg-item-name').value.trim(),
    code: qs('#dlg-item-code').value.trim(),
    price: Number(qs('#dlg-item-price').value||0),
    stock: Number(qs('#dlg-item-stock').value||0),
    min: Number(qs('#dlg-item-min').value||0)
  };
  if(!body.name||!body.code){ alert('必須項目: 商品名・コード'); return; }
  try{ await api('addItem', { method:'POST', body }); qs('#dlg-item').close(); state.items = await api('items'); renderItems(); buildQRSheets(); buildParts(); renderDashboard(); renderStock(); }
  catch(e){ alert('作成失敗: '+e.message); }
});

// ---- 新規ユーザー（Adminのみ） ----
qs('#btn-add-user')?.addEventListener('click', ()=>{
  if(state.currentUser?.role!=='admin'){ alert('権限がありません（管理者のみ）'); return; }
  qs('#dlg-user').showModal();
});
qs('#dlg-user-ok')?.addEventListener('click', async(e)=>{
  e.preventDefault();
  if(state.currentUser?.role!=='admin'){ alert('権限がありません（管理者のみ）'); return; }
  const body = { name: qs('#dlg-user-name').value.trim(), id: qs('#dlg-user-id').value.trim(), role:'user' };
  if(!body.name||!body.id){ alert('必須項目'); return; }
  try{ await api('addUser', { method:'POST', body }); qs('#dlg-user').close(); state.users = await api('users'); renderUsers(); }
  catch(e){ alert('作成失敗: '+e.message); }
});

function renderUsers(){
  const tbd = qs('#users-table tbody'); if(!tbd) return; tbd.innerHTML='';
  state.users.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.name}</td><td>${u.id}</td><td>${u.role||'user'}</td><td><button data-id="${u.id}" class="btn-user-qr primary">QR</button></td>`;
    tbd.appendChild(tr);
  });
  qsa('.btn-user-qr').forEach(b=> b.onclick = ()=> addUserQR(b.dataset.id));
}

// ---- 履歴 ----
qs('#btn-filter-history')?.addEventListener('click', loadHistory);
async function loadHistory(){
  const params = { q: qs('#history-search').value.trim(), from: qs('#date-from').value, to: qs('#date-to').value };
  const rows = await api('history', { method:'POST', body: params });
  const tbd = qs('#history-table tbody'); tbd.innerHTML='';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.timestamp}</td><td>${r.userName||r.userId}</td><td>${r.name||''}</td><td>${r.code||''}</td><td>${r.qty}</td><td>${r.unit}</td><td>${r.type}</td>`;
    tbd.appendChild(tr);
  });
}

// ---- 在庫画面 ----
function renderStock(){
  const tbd = qs('#stock-table tbody'); if(!tbd) return; tbd.innerHTML='';
  state.items.forEach(it=>{
    const tr = document.createElement('tr');
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

// ---- 部品一覧（QR） ----
function buildParts(){
  const grid = qs('#parts-qr-grid'); if(!grid) return; grid.innerHTML='';
  state.items.forEach(it=>{
    const cell = document.createElement('div'); cell.className='qr-cell';
    const box = document.createElement('div'); cell.appendChild(box);
    new QRCode(box, { text: JSON.stringify({ t:'item', code: it.code, name: it.name, price: it.price}), width:120, height:120 });
    const meta = document.createElement('div'); meta.innerHTML = `<div class="name">${it.name}</div><div>${it.code}</div>`; cell.appendChild(meta);
    grid.appendChild(cell);
  });
}
qs('#btn-build-parts-qr')?.addEventListener('click', buildParts);
qs('#btn-print-parts-qr')?.addEventListener('click', ()=> window.print());

// ---- 共通 QR builders for Items/Users ----
function addItemQR(code){
  const it = state.items.find(i=>i.code===code); if(!it) return;
  const cell = document.createElement('div'); cell.className='qr-cell';
  const box = document.createElement('div'); box.className='box';
  cell.appendChild(box);
  new QRCode(box, { text: JSON.stringify({ t:'item', code: it.code, name: it.name, price: it.price}), width:120, height:120 });
  const meta = document.createElement('div'); meta.innerHTML = `<div class="name">${it.name}</div><div>${it.code}</div><div>¥${it.price||'-'}</div>`; cell.appendChild(meta);
  qs('#qr-grid')?.appendChild(cell);
}
function addUserQR(id){
  const u = state.users.find(x=>x.id===id); if(!u) return;
  const cell = document.createElement('div'); cell.className='qr-cell';
  const box = document.createElement('div'); box.className='box';
  cell.appendChild(box);
  new QRCode(box, { text: JSON.stringify({ t:'user', id: u.id, name: u.name }), width:120, height:120 });
  const meta = document.createElement('div'); meta.innerHTML = `<div class="name">${u.name}</div><div>${u.id}</div>`; cell.appendChild(meta);
  qs('#user-qr-grid')?.appendChild(cell);
}
function buildQRSheets(){ qs('#qr-grid') && (qs('#qr-grid').innerHTML=''); state.items.forEach(i=> addItemQR(i.code)); }
qs('#btn-print-qr')?.addEventListener('click', ()=> window.print());
qs('#btn-print-user-qr')?.addEventListener('click', ()=> window.print());

// ---- 初期起動 ----
window.addEventListener('DOMContentLoaded', ()=>{ bootstrap(); });  // scanner nanti saat ke 'inout'
