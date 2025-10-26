// ===== Guard & brand =====
const saved = localStorage.getItem('currentUser');
if (!saved) location.href = 'index.html';

const state = {
  currentUser: JSON.parse(saved),
  items: [],
  users: [],
  history: [],
  monthly: [],
  scanner: null,   // stocktake
  ioScanner: null, // in/out
  stocktakeRows: [] // {code, name, book, real, diff}
};

const qs = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];

(function setBrand() {
  try {
    const url = (window.CONFIG && CONFIG.LOGO_URL) || './assets/tsh.png';
    const img = qs('#brand-logo'); if (img) img.src = url;
  } catch(_) {}
})();

function setTitle(txt){ const el=qs('#page-title'); if(el) el.textContent=txt; }
function showView(id, titleText) {
  qsa('main section').forEach(sec => sec.classList.toggle('d-none', sec.id !== id));
  qsa('.sidebar nav a').forEach(a => a.classList.toggle('active', a.getAttribute('data-view') === id));
  if(titleText) setTitle(titleText);
}
function fmt(n) { return new Intl.NumberFormat('ja-JP').format(n ?? 0); }

function updateWho() {
  const u = state.currentUser;
  qs('#who').textContent = `${u.name}（${u.id}｜${u.role || 'user'}）`;
}

// ===== API helper =====
async function api(action, { method = 'GET', body } = {}) {
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(action)}&apikey=${apikey}`;
  if (method === 'GET') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body || {}), apikey: CONFIG.API_KEY })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ===== Data loads (defensive) =====
async function loadAll() {
  const arrOr = (x) => Array.isArray(x) ? x : [];
  const [items, users, history, monthly] = await Promise.all([
    api('items').catch(()=>[]),
    api('users').catch(()=>[]),
    api('history').catch(()=>[]),
    api('statsMonthlySeries').catch(()=>[])
  ]);
  state.items   = arrOr(items);
  state.users   = arrOr(users);
  state.history = arrOr(history);
  state.monthly = arrOr(monthly);

  renderMetrics();
  renderLowStock();
  renderItems();
  renderUsers();
  renderHistory();
  renderMonthlyChart();
  renderQrList();
  renderUserQr();
  renderRecap();
}

// ===== Metrics & tables =====
function renderMetrics() {
  const low = state.items.filter(i => Number(i.stock||0) <= Number(i.min||0)).length;
  const last30 = Array.isArray(state.history) ? state.history.slice(-200).length : 0;
  qs('#metric-total-items').textContent = fmt(state.items.length);
  qs('#metric-low-stock').textContent = fmt(low);
  qs('#metric-users').textContent = fmt(state.users.length);
  qs('#metric-txn').textContent = fmt(last30);
}

function renderLowStock() {
  const lowRows = state.items
    .filter(i => Number(i.stock||0) <= Number(i.min||0))
    .sort((a,b)=> (a.stock-a.min)-(b.stock-b.min));
  const tbody = qs('#tbl-low'); tbody.innerHTML = '';
  lowRows.forEach(i=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i.code||''}</td><td>${i.name||''}</td>
      <td class="text-end">${fmt(i.stock||0)}</td><td class="text-end">${fmt(i.min||0)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderItems() {
  const tbody = qs('#tbl-items'); if (!tbody) return; tbody.innerHTML = '';
  state.items.forEach(i=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i.code||''}</td><td>${i.name||''}</td>
      <td class="text-end">¥${fmt(i.price||0)}</td>
      <td class="text-end">${fmt(i.stock||0)}</td>
      <td class="text-end">${fmt(i.min||0)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderUsers() {
  const tbody = qs('#tbl-users'); if (!tbody) return; tbody.innerHTML = '';
  state.users.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.id||''}</td><td>${u.name||''}</td><td>${u.role||'user'}</td>`;
    tbody.appendChild(tr);
  });
}

function renderHistory() {
  const tbody = qs('#tbl-history'); if (!tbody) return; tbody.innerHTML = '';
  const rows = Array.isArray(state.history) ? state.history.slice(-200).reverse() : [];
  rows.forEach(h=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${h.timestamp||''}</td><td>${h.userId||''}</td><td>${h.code||''}</td>
      <td class="text-end">${fmt(h.qty||0)}</td><td>${h.unit||''}</td><td>${h.type||''}</td>`;
    tbody.appendChild(tr);
  });
}

let monthlyChart;
function renderMonthlyChart() {
  const el = qs('#chart-monthly'); if (!el) return;
  const labels = state.monthly.map(m=>m.month);
  const inData = state.monthly.map(m=>m.in||0);
  const outData= state.monthly.map(m=>m.out||0);
  monthlyChart?.destroy?.();
  monthlyChart = new Chart(el, {
    type:'bar',
    data:{ labels, datasets:[ {label:'IN', data:inData}, {label:'OUT', data:outData} ] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

// ===== QR LIST (items) + Print =====
function itemQrPayload(i){
  return JSON.stringify({
    t:'item', code:String(i.code||''), name:String(i.name||''),
    price: Number(i.price||0)
  });
}
function renderQrList() {
  const tbody = qs('#tbl-qr'); if (!tbody) return; tbody.innerHTML = '';
  const grid = qs('#print-qr-items-grid'); if (grid) grid.innerHTML = '';
  state.items.forEach(i=>{
    // table
    const tr = document.createElement('tr');
    const tdQr = document.createElement('td'); tdQr.className='qr-cell';
    const div = document.createElement('div'); div.id = `qr-${i.code}`; tdQr.appendChild(div);
    tr.appendChild(tdQr);
    tr.innerHTML += `<td>${i.code||''}</td><td>${i.name||''}</td><td class="text-end">¥${fmt(i.price||0)}</td>`;
    tbody.appendChild(tr);
    new QRCode(div, { text: itemQrPayload(i), width:84, height:84, correctLevel: QRCode.CorrectLevel.M });

    // print card
    const card = document.createElement('div'); card.className='qr-card';
    const v = document.createElement('div'); v.id = `pqr-${i.code}`;
    const title = document.createElement('div'); title.className='title';
    title.textContent = `${i.name||''}（${i.code||''}） ¥${fmt(i.price||0)}`;
    card.appendChild(v); card.appendChild(title); grid?.appendChild(card);
    new QRCode(v, { text: itemQrPayload(i), width:110, height:110, correctLevel: QRCode.CorrectLevel.M });
  });
}

// ===== USER QR + Print =====
function renderUserQr(){
  const tbody = qs('#tbl-userqr'); if (!tbody) return; tbody.innerHTML='';
  const grid = qs('#print-qr-users-grid'); if (grid) grid.innerHTML='';
  state.users.forEach(u=>{
    const payload = JSON.stringify({t:'user', id:String(u.id||'')});
    // table
    const tr = document.createElement('tr');
    const tdQr = document.createElement('td'); tdQr.className='qr-cell';
    const div = document.createElement('div'); div.id = `uqr-${u.id}`; tdQr.appendChild(div);
    tr.appendChild(tdQr);
    tr.innerHTML += `<td>${u.id||''}</td><td>${u.name||''}</td><td>${u.role||'user'}</td>`;
    tbody.appendChild(tr);
    new QRCode(div, { text: payload, width:84, height:84, correctLevel: QRCode.CorrectLevel.M });

    // print
    const card = document.createElement('div'); card.className='qr-card';
    const v = document.createElement('div'); v.id = `puqr-${u.id}`;
    const title = document.createElement('div'); title.className='title';
    title.textContent = `${u.name||''}（${u.id||''}｜${u.role||'user'}）`;
    card.appendChild(v); card.appendChild(title); grid?.appendChild(card);
    new QRCode(v, { text: payload, width:110, height:110, correctLevel: QRCode.CorrectLevel.M });
  });
}

// ===== 在庫レポート =====
function renderRecap(){
  const map = {}; // code -> {in:0,out:0}
  (Array.isArray(state.history)?state.history:[]).forEach(h=>{
    const code = String(h.code||''); if(!code) return;
    if(!map[code]) map[code] = {in:0,out:0};
    const q = Number(h.qty||0);
    if(String(h.type)==='IN') map[code].in += q; else map[code].out += q;
  });
  const tbody = qs('#tbl-recap'); if(!tbody) return; tbody.innerHTML='';
  state.items.forEach(i=>{
    const m = map[i.code] || {in:0,out:0};
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i.code||''}</td><td>${i.name||''}</td>
      <td class="text-end">${fmt(m.in)}</td>
      <td class="text-end">${fmt(m.out)}</td>
      <td class="text-end">${fmt(i.stock||0)}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== STOCKTAKE QR SCAN =====
async function startScanner() {
  const cams = await Html5Qrcode.getCameras();
  const id = cams?.[0]?.id; if (!id) { alert('カメラが見つかりません'); return; }
  state.scanner = new Html5Qrcode('scan-area');
  await state.scanner.start({ deviceId:{ exact:id } }, { fps:10, qrbox:{ width:300, height:300 } }, onScanStocktake);
}
async function stopScanner() {
  try { await state.scanner?.stop(); state.scanner?.clear(); } catch(_) {}
  state.scanner = null;
}
function onScanStocktake(text) {
  try {
    const o = JSON.parse(text);
    if (o.t === 'item' && o.code) {
      const it = state.items.find(x => String(x.code) === String(o.code));
      if (it) pushStocktake(it.code, it.name, Number(it.stock||0), Number(it.stock||0));
    }
  } catch(_) {}
}
function pushStocktake(code, name, book, real){
  const diff = Number(real)-Number(book);
  state.stocktakeRows.unshift({code,name,book,real,diff});
  const tbody = qs('#tbl-stocktake'); tbody.innerHTML='';
  state.stocktakeRows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.code}</td><td>${r.name}</td>
      <td class="text-end">${fmt(r.book)}</td>
      <td class="text-end">${fmt(r.real)}</td>
      <td class="text-end">${fmt(r.diff)}</td>`;
    tbody.appendChild(tr);
  });
}

// 手動追加
function handleStocktakeAdd(e){
  e.preventDefault();
  const code = qs('#st-code').value.trim();
  const real = Number(qs('#st-qty').value||0);
  if(!code) return;
  const it = state.items.find(x=>String(x.code)===String(code));
  pushStocktake(code, it?.name||'', Number(it?.stock||0), real);
}

// CSV出力（棚卸）
function exportStocktake(){
  const header = 'code,name,book,real,diff\n';
  const lines = state.stocktakeRows.map(r=>[r.code,r.name,r.book,r.real,r.diff].join(','));
  downloadText('stocktake.csv', header+lines.join('\n'));
}

// ===== IN/OUT QR SCAN =====
async function startIoScan(){
  const cams = await Html5Qrcode.getCameras();
  const id = cams?.[0]?.id; if (!id) { alert('カメラが見つかりません'); return; }
  state.ioScanner = new Html5Qrcode('io-scan-area');
  await state.ioScanner.start({ deviceId:{ exact:id } }, { fps:10, qrbox:{ width:300, height:300 } }, onScanIo);
}
async function stopIoScan(){
  try { await state.ioScanner?.stop(); state.ioScanner?.clear(); } catch(_) {}
  state.ioScanner = null;
}
function onScanIo(text){
  try{
    const o = JSON.parse(text);
    if(o.t==='item' && o.code){
      const it = state.items.find(x=>String(x.code)===String(o.code));
      fillIoForm(it || {code:o.code, name:o.name||'', price:o.price||0, stock:0});
      qs('#io-qty').focus();
    }
  }catch(_){}
}
function fillIoForm(it){
  qs('#io-code').value  = it.code||'';
  qs('#io-name').value  = it.name||'';
  qs('#io-price').value = it.price||'';
  qs('#io-stock').value = it.stock||'';
}

// ===== Export helpers =====
function downloadText(filename, text){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 500);
}

function exportCsv(filename, rows, headers){
  const header = headers.join(',')+'\n';
  const body = rows.map(r => headers.map(h => (r[h]??'')).join(',')).join('\n');
  downloadText(filename, header+body);
}

// ===== Import Users from CSV =====
async function importUsersFromCsv(file){
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length<=1) throw new Error('CSV内容が空です');
  const heads = lines[0].split(',').map(h=>h.trim());
  const idx = (k)=> heads.indexOf(k);
  const nameI=idx('name'), idI=idx('id'), roleI=idx('role'), pinI=idx('pin');
  if(nameI<0||idI<0) throw new Error('ヘッダーに name,id が必要です');
  let ok=0, ng=0;
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    const body = {
      name: cols[nameI]?.trim()||'',
      id  : cols[idI]?.trim()||'',
      role: (roleI>=0? cols[roleI]: 'user')?.trim()||'user',
      pin : (pinI>=0? cols[pinI]: '')?.trim()||''
    };
    if(!body.name||!body.id){ ng++; continue; }
    const r = await api('addUser', { method:'POST', body }).catch(()=>({ok:false}));
    if(r && r.ok!==false) ok++; else ng++;
  }
  return {ok,ng};
}

// ===== Events =====
window.addEventListener('DOMContentLoaded', async () => {
  updateWho();

  // nav
  qsa('.sidebar nav a').forEach(a => a.addEventListener('click', () => {
    const id = a.getAttribute('data-view');
    const title = a.textContent.trim();
    showView(id, title);
  }));

  qs('#btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('currentUser'); location.href = 'index.html';
  });
  qs('#btn-refresh')?.addEventListener('click', loadAll);

  // Stocktake
  qs('#btn-start-scan')?.addEventListener('click', startScanner);
  qs('#btn-stop-scan')?.addEventListener('click', stopScanner);
  qs('#st-add')?.addEventListener('click', handleStocktakeAdd);
  qs('#st-export')?.addEventListener('click', exportStocktake);

  // IO scan
  qs('#btn-io-scan')?.addEventListener('click', startIoScan);
  qs('#btn-io-stop')?.addEventListener('click', stopIoScan);

  // IO submit
  qs('#form-io')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body = {
      userId: state.currentUser.id,
      code: qs('#io-code').value.trim(),
      qty: Number(qs('#io-qty').value||0),
      unit: qs('#io-unit').value,
      type: qs('#io-type').value
    };
    if (!body.code || !body.qty) { alert('コード/数量は必須'); return; }
    try {
      const r = await api('log', { method:'POST', body });
      if (r && r.ok===false) throw new Error(r.error||'エラー');
      alert('登録しました'); await loadAll(); showView('view-history','履歴');
      fillIoForm({code:'',name:'',price:'',stock:''}); qs('#io-qty').value='';
    } catch(err){ alert(err.message); }
  });

  // Export buttons
  qs('#btn-items-export')?.addEventListener('click', ()=>{
    exportCsv('items.csv', state.items, ['code','name','price','stock','min']);
  });
  qs('#btn-exp-items')?.addEventListener('click', ()=>{
    exportCsv('items.csv', state.items, ['code','name','price','stock','min']);
  });
  qs('#btn-exp-users')?.addEventListener('click', ()=>{
    exportCsv('users.csv', state.users, ['id','name','role']);
  });
  qs('#btn-exp-history')?.addEventListener('click', ()=>{
    exportCsv('history.csv', state.history, ['timestamp','userId','code','qty','unit','type']);
  });

  // Import users
  let usersFile = null;
  qs('#imp-users-file')?.addEventListener('change', (e)=> usersFile = e.target.files?.[0]||null );
  qs('#btn-imp-users')?.addEventListener('click', async ()=>{
    const box = qs('#imp-users-status');
    if(!usersFile){ box.textContent='CSVファイルを選択してください'; return; }
    box.textContent='インポート中…';
    try{
      const res = await importUsersFromCsv(usersFile);
      box.textContent = `完了: 成功 ${res.ok} / 失敗 ${res.ng}`;
      await loadAll();
    }catch(err){
      box.textContent = `エラー: ${err.message}`;
    }
  });

  // Print QR
  qs('#btn-print-qr-items')?.addEventListener('click', ()=>{
    qs('#print-qr-items').classList.remove('d-none'); window.print();
    qs('#print-qr-items').classList.add('d-none');
  });
  qs('#btn-print-qr-users')?.addEventListener('click', ()=>{
    qs('#print-qr-users').classList.remove('d-none'); window.print();
    qs('#print-qr-users').classList.add('d-none');
  });

  // initial
  showView('view-dashboard','ダッシュボード');
  await loadAll();
});
