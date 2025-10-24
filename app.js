// ---- Login/Logout (manual) ----
qs('#btn-login')?.addEventListener('click', ()=> qs('#dlg-login').showModal());
qs('#dlg-login-ok')?.addEventListener('click', (e)=>{
  e.preventDefault();
  const id = qs('#login-id').value.trim();
  if(!id){ alert('ユーザーIDを入力してください'); return; }
  const u = state.users.find(x=>x.id===id);
  if(!u){ alert('ユーザーが見つかりません（先にQRスキャンまたは管理者に登録依頼）'); return; }
  state.currentUser = {...u};
  qs('#dlg-login').close();
  updateWho(); applyRole();
  qs('#btn-login').style.display='none';
  qs('#btn-logout').style.display='';
});
qs('#btn-logout')?.addEventListener('click', ()=>{
  state.currentUser = null;
  updateWho(); applyRole();
  stopScanners();
  qs('#btn-login').style.display='';
  qs('#btn-logout').style.display='none';
});

// ---------- Utils ----------
const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];
const state = { items: [], users: [], currentUser: null, stocktake: [] };

function isAdmin(){ return state.currentUser?.role === 'admin'; }
function isRegistered(){ return !!state.currentUser && !!state.users.find(u=>u.id === state.currentUser.id); }

function updateWho(){
  const el = qs('#who');
  if(!el) return;
  if(!state.currentUser) el.textContent = '未ログイン';
  else el.textContent = `${state.currentUser.name || state.currentUser.id}（${state.currentUser.role || 'viewer'}）`;
}
function applyRole(){
  qsa('.admin-only').forEach(el => el.style.display = isAdmin() ? '' : 'none');
  const canCommit = isRegistered();
  ['user-id','item-code','qty','unit','type'].forEach(id=>{
    const el = qs('#'+id);
    if(el) el.disabled = !canCommit;
  });
  const btn = qs('#btn-commit');
  if(btn) btn.disabled = !canCommit;
}

// ---------- API helper (simple request: no preflight) ----------
async function api(path, { method='GET', body } = {}){
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(path)}&apikey=${apikey}`;
  if (method === 'GET'){
    const res = await fetch(url);
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
  qsa('.view').forEach(v=>v.classList.remove('active')); view.classList.add('active');
  qsa('.sb-link').forEach(b=> b.classList.toggle('active', b.dataset.view===id));
  if(id === 'inout'){ stopScanners().finally(()=> setTimeout(startUserScanner, 150)); } else { stopScanners(); }
}
qsa('.sb-link').forEach(b=> b.addEventListener('click',()=>switchView(b.dataset.view)));
qs('#btn-open-in-top').onclick  = ()=>{ switchView('inout'); qs('#type').value='IN';  };
qs('#btn-open-out-top').onclick = ()=>{ switchView('inout'); qs('#type').value='OUT'; };
qs('#btn-open-in')?.addEventListener('click', ()=>{ switchView('inout'); qs('#type').value='IN'; });
qs('#btn-open-out')?.addEventListener('click',()=>{ switchView('inout'); qs('#type').value='OUT'; });

// ---------- Bootstrap ----------
async function bootstrap(){
  try{
    const [items, users] = await Promise.all([ api('items'), api('users') ]);
    state.items = items; state.users = users;
    renderItems(); renderUsers(); renderDashboard(); renderStock(); buildQRSheets(); buildParts();
    applyRole(); updateWho();
  }catch(e){ console.error(e); alert('初期化に失敗しました: '+e.message); }
}
window.addEventListener('DOMContentLoaded', ()=>{ bootstrap(); });

// ---------- Dashboard ----------
function renderDashboard(){
  const low = state.items.filter(it => Number(it.min||0)>0 && Number(it.stock||0) <= Number(it.min));
  const ul = qs('#low-stock-list'); if(ul){ ul.innerHTML=''; low.forEach(it=>{ const li=document.createElement('li'); li.textContent=`${it.name}（${it.code}） 残:${it.stock}`; li.style.color='var(--accent)'; ul.appendChild(li); }); }
  const badge = qs('#badge-low'); if(badge){ badge.textContent = low.length; badge.style.display = low.length ? 'inline-flex' : 'none'; }
  qs('#today-summary') && (qs('#today-summary').textContent='最新の履歴は「履歴」タブで確認してください。');
}
async function refreshTodayStats(){
  // ambil history hari ini saja
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  const from = `${yyyy}-${mm}-${dd}`;
  const to   = `${yyyy}-${mm}-${dd}`;

  const rows = await api('history', { method:'POST', body:{ from, to } });
  const inCount  = rows.filter(r=>r.type==='IN').length;
  const outCount = rows.filter(r=>r.type==='OUT').length;

  const card = qs('#view-dashboard .cards .card:nth-child(2)');
  if(card){
    card.innerHTML = `
      <h3>本日の入出庫</h3>
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <div class="pane"><div>入庫</div><div style="font-size:24px;font-weight:700;">${inCount}</div></div>
        <div class="pane"><div>出庫</div><div style="font-size:24px;font-weight:700;">${outCount}</div></div>
      </div>
    `;
  }

  const recentCard = qs('#view-dashboard .cards .card:nth-child(3)');
  if(recentCard){
    const totalItems = state.items.length;
    const totalStock = state.items.reduce((a,b)=>a + Number(b.stock||0), 0);
    const low = state.items.filter(it=>Number(it.min||0)>0 && Number(it.stock||0)<=Number(it.min)).length;

    recentCard.innerHTML = `
      <h3>クイック操作</h3>
      <button id="btn-open-in" class="primary">入庫</button>
      <button id="btn-open-out" class="accent">出庫</button>
      <div class="muted" style="margin-top:12px;">
        <div>品目数：<b>${totalItems}</b></div>
        <div>総在庫：<b>${totalStock}</b></div>
        <div>在庫下限未満：<b style="color:var(--accent)">${low}</b> 件</div>
      </div>
      <h4 style="margin-top:12px;">最近の履歴</h4>
      <ul id="recent5" class="muted"></ul>
    `;
    // bind tombol lagi
    qs('#btn-open-in').onclick  = ()=>{ switchView('inout'); qs('#type').value='IN'; };
    qs('#btn-open-out').onclick = ()=>{ switchView('inout'); qs('#type').value='OUT'; };
  }

  // 5 transaksi terakhir (tidak hanya hari ini)
  const last = await api('history', { method:'POST', body:{} });
  const recent5 = last.slice(-5).reverse();
  const ul5 = qs('#recent5'); if(ul5){
    ul5.innerHTML = '';
    recent5.forEach(r=>{
      const li = document.createElement('li');
      li.textContent = `${r.timestamp}｜${r.type==='IN'?'入':'出'}｜${r.name||''}｜${r.qty}${r.unit||''}`;
      ul5.appendChild(li);
    });
  }
}

function renderDashboard(){
  const low = state.items.filter(it => Number(it.min||0) > 0 && Number(it.stock||0) <= Number(it.min));
  const ul = qs('#low-stock-list'); if(ul){ ul.innerHTML=''; low.forEach(it=>{ const li=document.createElement('li'); li.textContent=`${it.name}（${it.code}） 残:${it.stock}`; li.style.color='var(--accent)'; ul.appendChild(li); }); }
  const badge = qs('#badge-low'); if(badge){ badge.textContent = low.length; badge.style.display = low.length ? 'inline-flex' : 'none'; }
  refreshTodayStats(); // <-- tambahan
}
async function buildKPI(){
  // 月次入出庫サマリー
  const ym = new Date(); const y = ym.getFullYear(); const m = String(ym.getMonth()+1).padStart(2,'0');
  const summary = await api('statsMonthly', { method:'GET' }); // default bulan ini
  const card2 = document.querySelector('#view-dashboard .cards .card:nth-child(2)');
  if(card2){
    card2.innerHTML = `
      <h3>本日の入出庫</h3>
      <div style="display:flex; gap:12px;">
        <div class="pane"><div>今月 入庫合計</div><div style="font-size:22px;font-weight:700;">${summary.in}</div></div>
        <div class="pane"><div>今月 出庫合計</div><div style="font-size:22px;font-weight:700;">${summary.out}</div></div>
      </div>
    `;
  }

  // 高回転/低回転 TOP10（過去30日）
  const movers = await api('statsMovers', { method:'GET' }); // default 30日
  const recentCard = document.querySelector('#view-dashboard .cards .card:nth-child(3)');
  if(recentCard){
    const top = movers.top10.map(x=>`<li>${x.name||x.code}（${x.out+x.in}件）</li>`).join('');
    const low = movers.low10.map(x=>`<li>${x.name||x.code}（${x.out+x.in}件）</li>`).join('');
    recentCard.innerHTML = `
      <h3>クイック操作</h3>
      <button id="btn-open-in" class="primary">入庫</button>
      <button id="btn-open-out" class="accent">出庫</button>
      <div class="grid-2" style="margin-top:10px;">
        <div class="pane"><b>高回転 TOP10（30日）</b><ol>${top||'<li>データなし</li>'}</ol></div>
        <div class="pane"><b>低回転 TOP10（30日）</b><ol>${low||'<li>データなし</li>'}</ol></div>
      </div>
    `;
    document.getElementById('btn-open-in').onclick  = ()=>{ switchView('inout'); document.getElementById('type').value='IN'; };
    document.getElementById('btn-open-out').onclick = ()=>{ switchView('inout'); document.getElementById('type').value='OUT'; };
  }

  // 在庫回転率（Rolling 30/90日）＋ 死蔵在庫
  const turn = await api('statsTurnover', { method:'GET' });
  // (Opsional) tampilkan warning di「在庫アラート」
  const ul = document.getElementById('low-stock-list');
  if(ul){
    // tampilkan juga dead stock
    if(turn.dead && turn.dead.length){
      const deadTitle = document.createElement('li');
      deadTitle.textContent = '— 死蔵在庫（90日以上動きなし）—';
      deadTitle.style.color = 'var(--muted)';
      ul.appendChild(deadTitle);
      turn.dead.slice(0,10).forEach(d=>{
        const li = document.createElement('li');
        li.textContent = `${d.name||d.code} / 在庫:${d.stock}`;
        ul.appendChild(li);
      });
    }
  }
}

function renderDashboard(){
  const low = state.items.filter(it => Number(it.min||0) > 0 && Number(it.stock||0) <= Number(it.min));
  const ul = document.getElementById('low-stock-list'); if(ul){ ul.innerHTML=''; low.forEach(it=>{ const li=document.createElement('li'); li.textContent=`${it.name}（${it.code}） 残:${it.stock}`; li.style.color='var(--accent)'; ul.appendChild(li); }); }
  const badge = document.getElementById('badge-low'); if(badge){ badge.textContent = low.length; badge.style.display = low.length ? 'inline-flex' : 'none'; }
  refreshTodayStats();
  buildKPI(); // <— panggil KPI tambahan
}

// ---------- QR Scanners (flow: user → item) ----------
let userScanner, itemScanner;
async function startUserScanner(){
  try{
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if(!id) return;
    const conf = { fps:10, qrbox:{width:250, height:250} };
    userScanner = new Html5Qrcode('user-scanner');
    await userScanner.start({deviceId:{exact:id}}, conf, onUserScan);
  }catch(e){ console.warn('user scanner', e); }
}
async function startItemScanner(){
  if(!isRegistered()){ alert('先にユーザーをスキャンしてください'); return; }
  try{
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if(!id) return;
    const conf = { fps:10, qrbox:{width:250, height:250} };
    itemScanner = new Html5Qrcode('item-scanner');
    await itemScanner.start({deviceId:{exact:id}}, conf, onItemScan);
  }catch(e){ console.warn('item scanner', e); }
}
async function stopScanners(){
  try{ await userScanner?.stop(); userScanner?.clear(); }catch(_){}
  try{ await itemScanner?.stop(); itemScanner?.clear(); }catch(_){}
  userScanner = itemScanner = null;
}
function onUserScan(text){
  try{ const obj=JSON.parse(text); if(obj.t==='user') text=obj.id; }catch(_){}
  qs('#user-id').value = text;
  const u = state.users.find(x=>x.id===text);
  state.currentUser = u ? {...u} : { id:text, name:'', role:'viewer' };
  qs('#user-name').textContent = u ? `${u.name}（${u.role||'user'}）` : '未登録ユーザー（閲覧のみ）';
  updateWho(); applyRole();
  stopScanners().finally(()=> setTimeout(startItemScanner, 150));
}
function onItemScan(text){
  try{ const obj=JSON.parse(text); if(obj.t==='item') text=obj.code; }catch(_){}
  qs('#item-code').value = text;
  const it = state.items.find(i=>i.code===text);
  qs('#item-detail').textContent = it ? `${it.name} / 価格: ${it.price||'-'} / 在庫: ${it.stock}` : '未登録商品';
}

// ---------- Commit IN/OUT ----------
qs('#btn-commit')?.addEventListener('click', async()=>{
  if(!isRegistered()){ alert('ユーザー未登録のため記録できません'); return; }
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
    renderItems(); renderStock(); renderDashboard(); buildQRSheets(); buildParts();
  }catch(e){ alert('記録失敗: '+e.message); }
});

// ---------- Items ----------
function renderItems(){
  const tbd = qs('#items-table tbody'); if(!tbd) return; tbd.innerHTML='';
  const q = (qs('#item-search')?.value || '').toLowerCase();
  state.items.filter(it=>!q || `${it.name}${it.code}`.toLowerCase().includes(q)).forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.name}</td><td>${it.code}</td><td>${it.price||''}</td><td>${it.stock||0}</td><td>${it.min||0}</td><td><button data-code="${it.code}" class="btn-gen-qr accent">QR</button></td>`;
    tbd.appendChild(tr);
  });
  qsa('.btn-gen-qr').forEach(b=> b.onclick = ()=> addItemQR(b.dataset.code));
}
qs('#item-search')?.addEventListener('input', renderItems);

qs('#btn-add-item')?.addEventListener('click', ()=> qs('#dlg-item').showModal());
qs('#dlg-item-ok')?.addEventListener('click', async(e)=>{
  e.preventDefault();
  if(!isAdmin()){ alert('権限がありません（管理者のみ）'); return; }
  const body = {
    name: qs('#dlg-item-name').value.trim(),
    code: qs('#dlg-item-code').value.trim(),
    price: Number(qs('#dlg-item-price').value||0),
    stock: Number(qs('#dlg-item-stock').value||0),
    min: Number(qs('#dlg-item-min').value||0)
  };
  if(!body.name||!body.code){ alert('必須項目: 商品名・コード'); return; }
  try{
    await api('addItem',{method:'POST', body});
    qs('#dlg-item').close();
    state.items = await api('items'); renderItems(); renderDashboard(); renderStock(); buildQRSheets(); buildParts();
  }catch(err){ alert('作成失敗: '+err.message); }
});

// ---------- Users ----------
function renderUsers(){
  const tbd = document.querySelector('#users-table tbody'); if(!tbd) return; tbd.innerHTML='';
  state.users.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.name}</td><td>${u.id}</td><td>${u.role||'user'}</td>
                    <td><button data-id="${u.id}" class="btn-user-qr primary">QR</button></td>`;
    tbd.appendChild(tr);
  });
  document.querySelectorAll('.btn-user-qr').forEach(b=> b.onclick = ()=> addUserQR(b.dataset.id));

  // <-- Tambahkan ini agar sheet QR otomatis terbangun
  buildUserQRSheets();
}

qs('#btn-add-user')?.addEventListener('click', ()=>{
  if(!isAdmin()){ alert('権限がありません（管理者のみ）'); return; }
  qs('#dlg-user').showModal();
});
qs('#dlg-user-ok')?.addEventListener('click', async(e)=>{
  e.preventDefault();
  if(!isAdmin()){ alert('権限がありません（管理者のみ）'); return; }
  const body = { name: qs('#dlg-user-name').value.trim(), id: qs('#dlg-user-id').value.trim(), role:'user' };
  if(!body.name||!body.id){ alert('必須項目'); return; }
  try{
    await api('addUser', { method:'POST', body });
    qs('#dlg-user').close();
    state.users = await api('users'); renderUsers();
  }catch(e2){ alert('作成失敗: '+e2.message); }
});

// ---------- History ----------
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

// ---------- Stock (view) ----------
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
// Items → QR sheet
function buildQRSheets(){
  const grid = qs('#qr-grid'); if(!grid) return;
  QRPrint.buildItemGrid(grid, state.items);
}
qs('#btn-print-qr')?.addEventListener('click', QRPrint.printA4);

// Users → QR sheet
function buildUserQRSheets(){
  const grid = qs('#user-qr-grid'); if(!grid) return;
  QRPrint.buildUserGrid(grid, state.users);
}
qs('#btn-print-user-qr')?.addEventListener('click', QRPrint.printA4);

// 部品一覧（全アイテム）
function buildParts(){
  const grid = qs('#parts-qr-grid'); if(!grid) return;
  QRPrint.buildItemGrid(grid, state.items);
}
qs('#btn-build-parts-qr')?.addEventListener('click', buildParts);
qs('#btn-print-parts-qr')?.addEventListener('click', QRPrint.printA4);


function buildParts(){ const grid = qs('#parts-qr-grid'); if(!grid) return; grid.innerHTML=''; state.items.forEach(i=>{ const c=document.createElement('div'); c.className='qr-cell'; const b=document.createElement('div'); c.appendChild(b); new QRCode(b,{text:JSON.stringify({t:'item',code:i.code,name:i.name,price:i.price}),width:120,height:120}); const m=document.createElement('div'); m.innerHTML=`<div class="name">${i.name}</div><div>${i.code}</div>`; c.appendChild(m); grid.appendChild(c); }); }
qs('#btn-build-parts-qr')?.addEventListener('click', buildParts);
qs('#btn-print-parts-qr')?.addEventListener('click', ()=> window.print());

qs('#btn-print-user-qr')?.addEventListener('click', ()=> window.print());

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
