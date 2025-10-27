/*************************************************
 * app.js  —  Inventory Dashboard (FULL)
 **************************************************/

const saved = localStorage.getItem('currentUser');
if (!saved) location.href = 'index.html';

const state = {
  currentUser: JSON.parse(saved),
  items: [], users: [], history: [], monthly: [],
  monthlyChart: null, pieChart: null,
  scanner: null, ioScanner: null,
  stocktakeRows: [],
  _mov: []
};

const qs  = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>[...el.querySelectorAll(s)];
function fmt(n){ return new Intl.NumberFormat('ja-JP').format(n ?? 0); }
function showView(id, title){
  qsa('main section').forEach(x=>x.classList.toggle('d-none', x.id!==id));
  qsa('.sidebar a.nav-link').forEach(a=>a.classList.toggle('active', a.getAttribute('data-view')===id));
  if (title) qs('#page-title').textContent = title;
}
function showLoading(on, text){
  const el=qs('#global-loading'); if(!el) return;
  const t=qs('#loading-text'); if(text) t.textContent=text;
  el.classList.toggle('d-none', !on);
}

/* ===== Sidebar control (mobile) ===== */
function openSidebar(){ qs('#sb')?.classList.add('show'); qs('#sb-backdrop')?.classList.add('show'); document.body.classList.add('overflow-hidden'); }
function closeSidebar(){ qs('#sb')?.classList.remove('show'); qs('#sb-backdrop')?.classList.remove('show'); document.body.classList.remove('overflow-hidden'); }
function toggleSidebar(){ const sb=qs('#sb'); sb?.classList.contains('show') ? closeSidebar() : openSidebar(); }

(function setBrand(){
  try{
    const url = (window.CONFIG && (CONFIG.LOGO_URL||'./assets/tsh.png')) || './assets/tsh.png';
    const img = qs('#brand-logo'); if(img) img.src = url;
  }catch(_){}
})();
(function updateWho(){
  const u = state.currentUser;
  const el = qs('#who');
  if (el) el.innerHTML = `${u.name} <small class="ms-1">（${u.id}｜${u.role||'user'}）</small>`;
})();

async function api(action, { method='GET', body } = {}){
  if (!window.CONFIG || !CONFIG.BASE_URL) {
    alert('config.js tidak terbaca (BASE_URL kosong).'); 
    throw new Error('CONFIG.BASE_URL missing');
  }
  const base   = CONFIG.BASE_URL.replace(/\?$/, '');
  const apikey = encodeURIComponent(CONFIG.API_KEY||'');
  const url    = `${base}?action=${encodeURIComponent(action)}&apikey=${apikey}&_=${Date.now()}`;

  try{
    if (method === 'GET'){
      const r = await fetch(url, { method:'GET', mode:'cors', cache:'no-cache', redirect:'follow' });
      if(!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.json();
    }
    const r = await fetch(url, {
      method:'POST', mode:'cors', cache:'no-cache', redirect:'follow',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
    });
    if(!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.json();
  }catch(err){
    console.error('[API ERROR]', action, err);
    alert(`Gagal menghubungi backend untuk action "${action}".\n\n${err.message}\n\nCek: config.js (BASE_URL), deployment GAS, & izin Web App.`);
    throw err;
  }
}

async function ensureQRCode(){
  if (window.QRCode) return;
  await new Promise((resolve)=>{
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}

async function loadAll(){
  showLoading(true, '読み込み中…');

  const safe = async (fn)=>{ try{ return await fn(); }catch{ return []; } };

  const [items, users, history, monthly] = await Promise.all([
    safe(()=>api('items')),
    safe(()=>api('users')),
    safe(()=>api('history')),
    safe(()=>api('statsMonthlySeries'))
  ]);

  state.items   = Array.isArray(items)   ? items   : [];
  state.users   = Array.isArray(users)   ? users   : [];
  state.history = Array.isArray(history) ? history : [];
  state.monthly = Array.isArray(monthly) ? monthly : [];

  renderMetrics();
  renderMonthlyChart();
  renderPieChart();
  renderItems();
  renderUsers();
  renderHistory();
  renderMovements();

  showLoading(false);
}

function renderMetrics(){
  const low   = state.items.filter(i=>Number(i.stock||0)<=Number(i.min||0)).length;
  const lastN = state.history.slice(-200).length;
  qs('#metric-total-items').textContent = fmt(state.items.length);
  qs('#metric-low-stock').textContent  = fmt(low);
  qs('#metric-users').textContent      = fmt(state.users.length);
  qs('#metric-txn').textContent        = fmt(lastN);
}

function renderMonthlyChart(){
  const el = qs('#chart-monthly'); if(!el) return;
  state.monthlyChart?.destroy?.();
  const labels = state.monthly.map(m=>m.month);
  const dataIn = state.monthly.map(m=>m.in||0);
  const dataOut= state.monthly.map(m=>m.out||0);
  state.monthlyChart = new Chart(el,{
    type:'bar',
    data:{ labels,
      datasets:[
        {label:'IN',  data:dataIn,  backgroundColor:'rgba(79,140,255,.75)'},
        {label:'OUT', data:dataOut, backgroundColor:'rgba(249,115,22,.75)'}
      ]
    },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

function renderPieChart(){
  const el = qs('#chart-pie'); if(!el) return;
  state.pieChart?.destroy?.();
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1);
  let sIn=0, sOut=0;
  state.history.forEach(h=>{
    const ts = h.timestamp ? new Date(h.timestamp.replace(' ','T')) : null;
    if(!ts || ts<start) return;
    const q = Number(h.qty||0);
    if(String(h.type)==='IN') sIn+=q; else sOut+=q;
  });
  state.pieChart = new Chart(el,{
    type:'pie',
    data:{ labels:['IN','OUT'], datasets:[{ data:[sIn,sOut], backgroundColor:['#4f8cff','#f97316'] }] },
    options:{ responsive:true }
  });
}

/* ===== ITEMS (with QR) ===== */
function itemQrPayloadShort(i){
  return JSON.stringify({ t:'item', code:String(i.code||'') });
}
function renderItems(){
  const tb = qs('#tbl-items'); if(!tb) return;
  tb.innerHTML = '';

  state.items.forEach(i=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="qr-cell"><div id="qr-${CSS.escape(String(i.code||''))}"></div></td>
      <td>${i.code||''}</td>
      <td>${i.name||''}</td>
      <td>${i.img?`<img class="thumb" src="${i.img}" style="width:48px;height:48px;object-fit:cover;border-radius:6px">`:''}</td>
      <td class="text-end">¥${fmt(i.price||0)}</td>
      <td class="text-end">${fmt(i.stock||0)}</td>
      <td class="text-end">${fmt(i.min||0)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary" data-act="dl" data-code="${i.code}"><i class="bi bi-download"></i></button>
      </td>`;
    tb.appendChild(tr);

    const div = qs(`#qr-${CSS.escape(String(i.code||''))}`);
    if (div){
      div.innerHTML = '';
      if (window.QRCode) new QRCode(div,{ text:itemQrPayloadShort(i), width:84, height:84, correctLevel:QRCode.CorrectLevel.M });
    }
  });

  tb.querySelectorAll('button[data-act="dl"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const code = btn.getAttribute('data-code');
      const canvas = qs(`#qr-${CSS.escape(code)} canvas`);
      if (!canvas) return;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png'); a.download = `QR_${code}.png`; a.click();
    });
  });
}

function renderUsers(){
  const btnAdd = qs('#btn-open-new-user');
  if (state.currentUser.role === 'admin') btnAdd?.classList.remove('d-none');
  else btnAdd?.classList.add('d-none');

  const tb = qs('#tbl-userqr'); if(!tb) return;
  tb.innerHTML='';

  const grid = qs('#print-qr-users-grid'); if(grid) grid.innerHTML = '';

  state.users.forEach(u=>{
    const payload = JSON.stringify({ t:'user', id:String(u.id||'') });
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="qr-cell"><div id="uqr-${CSS.escape(String(u.id||''))}"></div></td>
      <td>${u.id||''}</td>
      <td>${u.name||''}</td>
      <td>${u.role||'user'}</td>`;
    tb.appendChild(tr);

    const div = qs(`#uqr-${CSS.escape(String(u.id||''))}`);
    if (div){
      div.innerHTML='';
      if (window.QRCode) new QRCode(div,{ text:payload, width:84, height:84, correctLevel:QRCode.CorrectLevel.M });
    }

    const card = document.createElement('div'); card.className='qr-card';
    card.style.cssText = 'border:1px solid #e5e7eb;border-radius:12px;padding:12px;text-align:center';
    const v = document.createElement('div'); v.id=`puqr-${u.id}`;
    const title = document.createElement('div'); title.className='title';
    title.textContent = `${u.name||''}（${u.id||''}｜${u.role||'user'}）`;
    card.appendChild(v); card.appendChild(title); grid?.appendChild(card);
    if (window.QRCode) new QRCode(v,{ text:payload, width:110, height:110, correctLevel:QRCode.CorrectLevel.M });
  });
}

function renderHistory(){
  const tb = qs('#tbl-history'); if(!tb) return; tb.innerHTML='';
  state.history.slice(-500).reverse().forEach(h=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.timestamp||''}</td>
      <td>${h.userId||''}</td>
      <td>${h.code||''}</td>
      <td class="text-end">${fmt(h.qty||0)}</td>
      <td>${h.unit||''}</td>
      <td>${h.type||''}</td>`;
    tb.appendChild(tr);
  });
}

function computeMovementsThisMonth(){
  const now=new Date(); const start=new Date(now.getFullYear(),now.getMonth(),1);
  const byCode={};
  state.history.forEach(h=>{
    const ts=h.timestamp?new Date(h.timestamp.replace(' ','T')):null;
    if(!ts||ts<start) return;
    const code=String(h.code||''); if(!code) return;
    const item = state.items.find(i=>String(i.code)===code);
    if(!byCode[code]) byCode[code]={ code, name:item?.name||'', in:0, out:0 };
    const q=Number(h.qty||0);
    if(String(h.type)==='IN') byCode[code].in+=q; else byCode[code].out+=q;
  });
  const rows=Object.values(byCode).map(r=>({...r, net:r.in-r.out}));
  rows.sort((a,b)=>(b.in+b.out)-(a.in+a.out));
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

/* ===== STOCKTAKE ===== */
async function getBackCameraId(){
  try{
    const cams = await Html5Qrcode.getCameras();
    if(!cams || !cams.length) return null;
    const back = cams.find(c => /back|rear|environment/i.test(c.label));
    return (back || cams[0]).id;
  }catch{ return null; }
}
async function startScanner(){
  const id = await getBackCameraId(); if(!id){ alert('カメラが見つかりません'); return; }
  state.scanner = new Html5Qrcode('scan-area');
  await state.scanner.start({deviceId:{exact:id}}, {fps:10, qrbox:{width:300,height:300}}, onScanStocktake);
}
async function stopScanner(){
  try{ await state.scanner?.stop(); state.scanner?.clear(); }catch(_){}
  state.scanner = null;
}
function onScanStocktake(text){
  try{
    showLoading(true,'読み取り中…');
    const o = JSON.parse(text);
    if(o.t==='item' && o.code){
      const it = state.items.find(x=>String(x.code)===String(o.code));
      pushStocktake(it?.code||o.code, it?.name||'', Number(it?.stock||0), Number(it?.stock||0));
    }
  }catch(_){}
  finally{ showLoading(false); }
}
function pushStocktake(code,name,book,real){
  const diff = Number(real)-Number(book);
  state.stocktakeRows.unshift({code,name,book,real,diff});
  const tb = qs('#tbl-stocktake'); if(!tb) return; tb.innerHTML='';
  state.stocktakeRows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${r.code}</td><td>${r.name}</td>
      <td class="text-end">${fmt(r.book)}</td>
      <td class="text-end">${fmt(r.real)}</td>
      <td class="text-end">${fmt(r.diff)}</td>`;
    tb.appendChild(tr);
  });
}
function handleStocktakeAdd(e){
  e.preventDefault();
  const code = qs('#st-code').value.trim();
  const real = Number(qs('#st-qty').value||0);
  if(!code) return;
  const it = state.items.find(x=>String(x.code)===String(code));
  pushStocktake(code, it?.name||'', Number(it?.stock||0), real);
}
function exportStocktake(){
  const head='code,name,book,real,diff\n';
  const lines = state.stocktakeRows.map(r=>[r.code,r.name,r.book,r.real,r.diff].join(','));
  downloadText('stocktake.csv', head+lines.join('\n'));
}

/* ===== IN/OUT (QR) ===== */
async function startIoScan(){
  const id = await getBackCameraId(); if(!id){ alert('カメラが見つかりません'); return; }
  state.ioScanner = new Html5Qrcode('io-scan-area');
  await state.ioScanner.start({deviceId:{exact:id}}, {fps:10, qrbox:{width:300,height:300}}, onScanIo);
}
async function stopIoScan(){
  try{ await state.ioScanner?.stop(); state.ioScanner?.clear(); }catch(_){}
  state.ioScanner=null;
}
function onScanIo(text){
  try{
    showLoading(true,'読み取り中…');
    const o = JSON.parse(text);
    if(o.t==='item' && o.code){
      const it = state.items.find(x=>String(x.code)===String(o.code)) || {code:o.code,name:o.name||'',price:o.price||0,stock:0};
      fillIoForm(it); qs('#io-qty').focus();
    }
  }catch(_){}
  finally{ showLoading(false); }
}
function fillIoForm(it){
  qs('#io-code').value  = it.code||'';
  qs('#io-name').value  = it.name||'';
  qs('#io-price').value = it.price||'';
  qs('#io-stock').value = it.stock||'';
}

/* ===== New Item helper ===== */
function nextItemCode(){
  const nums = state.items
    .map(i=>String(i.code||'').trim())
    .map(c=>(/^\d+$/.test(c)?Number(c):NaN))
    .filter(n=>!isNaN(n));
  const maxNum = nums.length?Math.max(...nums):0;
  const width  = Math.max(4, ...state.items.map(i=>String(i.code||'').length||0));
  return String(maxNum+1).padStart(width,'0');
}
function previewItemQr(i){
  if(!i || !i.code || !i.name){ alert('コード/名称は必須'); return; }
  const tmp = document.createElement('div');
  if (window.QRCode) {
    new QRCode(tmp,{ text: JSON.stringify({t:'item',code:String(i.code),name:String(i.name),price:Number(i.price||0)}), width:240, height:240, correctLevel:QRCode.CorrectLevel.M });
  }
  const canvas = tmp.querySelector('canvas');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
  const w = window.open('', 'qrprev', 'width=420,height=520');
  w.document.write(`
    <div style="padding:20px;text-align:center;font-family:sans-serif">
      <img src="${dataUrl}" style="width:240px;height:240px"/>
      <div style="margin-top:8px">${i.name}（${i.code}） ¥${fmt(i.price||0)}</div>
    </div>`);
  tmp.remove();
}

/* ===== EVENTS ===== */
window.addEventListener('DOMContentLoaded', async ()=>{
  await ensureQRCode();

  // Sidebar controls (mobile)
  const burger = qs('#burger');
  const backdrop = qs('#sb-backdrop');
  ['click','touchstart'].forEach(ev=>burger?.addEventListener(ev, (e)=>{ e.preventDefault(); toggleSidebar(); }, {passive:false}));
  ['click','touchstart'].forEach(ev=>backdrop?.addEventListener(ev, (e)=>{ e.preventDefault(); closeSidebar(); }, {passive:false}));
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeSidebar(); });

  // sidebar nav
  qsa('.sidebar a.nav-link').forEach(a=>a.addEventListener('click',()=>{
    const id=a.getAttribute('data-view'); showView(id, a.textContent.trim());
    closeSidebar();
  }));

  // logout
  qs('#btn-logout')?.addEventListener('click',()=>{ localStorage.removeItem('currentUser'); location.href='index.html'; });

  // IO scan & submit
  qs('#btn-io-scan')?.addEventListener('click', startIoScan);
  qs('#btn-io-stop')?.addEventListener('click', stopIoScan);
  qs('#form-io')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body = {
      userId: state.currentUser.id,
      code:   qs('#io-code').value.trim(),
      qty:    Number(qs('#io-qty').value||0),
      unit:   qs('#io-unit').value,
      type:   qs('#io-type').value
    };
    if(!body.code || !body.qty){ alert('コード/数量は必須'); return; }
    const r = await api('log',{method:'POST',body});
    if(r && r.ok===false) return alert(r.error||'エラー');
    alert('登録しました');
    await loadAll();
    showView('view-history','履歴');
    fillIoForm({code:'',name:'',price:'',stock:''});
    qs('#io-qty').value='';
  });

  // Stocktake
  qs('#btn-start-scan')?.addEventListener('click', startScanner);
  qs('#btn-stop-scan')?.addEventListener('click', stopScanner);
  qs('#st-add')?.addEventListener('click', handleStocktakeAdd);
  qs('#st-export')?.addEventListener('click', exportStocktake);

  // Items
  qs('#btn-items-export')?.addEventListener('click', ()=>exportCsv('items.csv', state.items, ['code','name','price','stock','min']));

  // ⬇️ FIX: pakai element, bukan selector string (hindari error modal.js: reading 'backdrop')
  const modalItemEl = document.getElementById('dlg-new-item');
  const modalItem   = modalItemEl ? new bootstrap.Modal(modalItemEl) : null;
  qs('#btn-open-new-item')?.addEventListener('click', ()=>{
    qs('#i-code').value  = nextItemCode();
    qs('#i-name').value  = '';
    qs('#i-price').value = 0;
    qs('#i-stock').value = 0;
    qs('#i-min').value   = 0;
    qs('#i-img').value   = '';
    modalItem?.show();
  });

  qs('#form-item')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body = {
      code:  qs('#i-code').value.trim(),
      name:  qs('#i-name').value.trim(),
      price: Number(qs('#i-price').value||0),
      stock: Number(qs('#i-stock').value||0),
      min:   Number(qs('#i-min').value||0),
      img:   qs('#i-img').value.trim(),
      overwrite: false
    };
    if(!body.code || !body.name){ alert('コード/名称は必須'); return; }
    try{
      const r = await api('addItem',{method:'POST',body});
      if(r && r.ok===false) throw new Error(r.error||'登録失敗');
      previewItemQr({ code:body.code, name:body.name, price:body.price });
      modalItem?.hide();
      await loadAll();
      showView('view-items','商品一覧');
    }catch(err){ alert(err.message); }
  });

  qs('#btn-item-makeqr')?.addEventListener('click', ()=>{
    const i = { code:qs('#i-code').value.trim(), name:qs('#i-name').value.trim(), price:Number(qs('#i-price').value||0) };
    previewItemQr(i);
  });

  // Users (pakai element juga)
  const modalUserEl = document.getElementById('dlg-new-user');
  const modalUser   = modalUserEl ? new bootstrap.Modal(modalUserEl) : null;
  qs('#btn-open-new-user')?.addEventListener('click', ()=>modalUser?.show());
  qs('#form-user')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body={ name:qs('#u-name').value.trim(), id:qs('#u-id').value.trim(), role:qs('#u-role').value, pin:qs('#u-pin').value.trim() };
    const r=await api('addUser',{method:'POST',body});
    if(r && r.ok===false) return alert(r.error||'エラー');
    modalUser?.hide(); await loadAll(); showView('view-users','ユーザー / QR');
  });
  qs('#btn-print-qr-users')?.addEventListener('click', ()=>{
    qs('#print-qr-users')?.classList.remove('d-none'); window.print(); qs('#print-qr-users')?.classList.add('d-none');
  });

  // Movements CSV
  qs('#btn-export-mov')?.addEventListener('click', ()=>{
    const rows = state._mov || computeMovementsThisMonth();
    exportCsv('movements_this_month.csv', rows, ['code','name','in','out','net']);
  });

  // initial
  showView('view-dashboard','ダッシュボード');
  await loadAll();
});
