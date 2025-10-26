// ===== Guard & Brand =====
const saved = localStorage.getItem('currentUser');
if (!saved) location.href = 'index.html';

const state = {
  currentUser: JSON.parse(saved),
  items: [], users: [], history: [], monthly: [],
  scanner: null, ioScanner: null, stocktakeRows: []
};

const qs = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>[...el.querySelectorAll(s)];

(function setBrand(){
  try{
    const url = (window.CONFIG && CONFIG.LOGO_URL) || './assets/tsh.png';
    const img = qs('#brand-logo'); if(img) img.src = url;
  }catch(_){}
})();

function setTitle(t){ const el=qs('#page-title'); if(el) el.textContent=t; }
function showView(id, title){
  qsa('main section').forEach(x=>x.classList.toggle('d-none', x.id!==id));
  qsa('.sidebar nav a').forEach(a=>a.classList.toggle('active', a.getAttribute('data-view')===id));
  if(title) setTitle(title);
}
function fmt(n){ return new Intl.NumberFormat('ja-JP').format(n??0); }
function updateWho(){ const u=state.currentUser; qs('#who').textContent=`${u.name}（${u.id}｜${u.role||'user'}）`; }

// ===== API =====
async function api(action, {method='GET', body}={}){
  const apikey = encodeURIComponent(CONFIG.API_KEY||'');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(action)}&apikey=${apikey}`;
  if(method==='GET'){
    const r=await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json();
  }
  const r=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({...(body||{}), apikey:CONFIG.API_KEY})
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

// ===== LOAD =====
async function loadAll(){
  const arr=(x)=>Array.isArray(x)?x:[];
  const [items,users,history,monthly]=await Promise.all([
    api('items').catch(()=>[]),
    api('users').catch(()=>[]),
    api('history').catch(()=>[]),
    api('statsMonthlySeries').catch(()=>[])
  ]);
  state.items=arr(items); state.users=arr(users); state.history=arr(history); state.monthly=arr(monthly);

  renderMetrics(); renderMonthlyChart();
  renderItems(); renderUsers(); renderHistory();
}

function renderMetrics(){
  const low=state.items.filter(i=>Number(i.stock||0)<=Number(i.min||0)).length;
  const last30=state.history.slice(-200).length;
  qs('#metric-total-items').textContent=fmt(state.items.length);
  qs('#metric-low-stock').textContent=fmt(low);
  qs('#metric-users').textContent=fmt(state.users.length);
  qs('#metric-txn').textContent=fmt(last30);
}

let monthlyChart;
function renderMonthlyChart(){
  const el=qs('#chart-monthly'); if(!el) return;
  monthlyChart?.destroy?.();
  monthlyChart=new Chart(el,{
    type:'bar',
    data:{
      labels:state.monthly.map(m=>m.month),
      datasets:[
        {label:'IN', data:state.monthly.map(m=>m.in||0)},
        {label:'OUT',data:state.monthly.map(m=>m.out||0)}
      ]
    },
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });
}

// ===== ITEMS (QR + image + actions) =====
function itemQrPayload(i){
  return JSON.stringify({t:'item', code:String(i.code||''), name:String(i.name||''), price:Number(i.price||0)});
}
function renderItems(){
  const tb = qs('#tbl-items'); if (!tb) return;
  tb.innerHTML = '';

  state.items.forEach(i=>{
    const codeSafe = String(i.code||'');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="qr-cell"><div id="qr-${CSS.escape(codeSafe)}"></div></td>
      <td>${i.code || ''}</td>
      <td>${i.name || ''}</td>
      <td>${i.img ? `<img class="thumb" src="${i.img}">` : ''}</td>
      <td class="text-end">¥${fmt(i.price || 0)}</td>
      <td class="text-end">${fmt(i.stock || 0)}</td>
      <td class="text-end">${fmt(i.min || 0)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary" data-act="dl" data-code="${codeSafe}">
          <i class="bi bi-download"></i>
        </button>
      </td>`;
    tb.appendChild(tr);

    // generate QR setelah <tr> terpasang
    const div = qs(`#qr-${CSS.escape(codeSafe)}`);
    if (div) new QRCode(div, { text:itemQrPayload(i), width:84, height:84, correctLevel:QRCode.CorrectLevel.M });
  });

  // download QR (PNG)
  tb.querySelectorAll('button[data-act="dl"]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const code = btn.getAttribute('data-code');
      const canvas = qs(`#qr-${CSS.escape(code)} canvas`); if(!canvas) return;
      const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download=`QR_${code}.png`; a.click();
    });
  });
}

// ===== USERS + QR =====
function renderUsers(){
  const btnAdd = qs('#btn-open-new-user');
  if (state.currentUser.role === 'admin') btnAdd?.classList.remove('d-none');
  else btnAdd?.classList.add('d-none');

  const tb = qs('#tbl-userqr'); if (!tb) return;
  tb.innerHTML = '';

  const grid = qs('#print-qr-users-grid'); if (grid) grid.innerHTML = '';

  state.users.forEach(u=>{
    const payload = JSON.stringify({ t:'user', id:String(u.id||'') });
    const idSafe  = String(u.id||'');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="qr-cell"><div id="uqr-${CSS.escape(idSafe)}"></div></td>
      <td>${u.id || ''}</td>
      <td>${u.name || ''}</td>
      <td>${u.role || 'user'}</td>`;
    tb.appendChild(tr);

    const div = qs(`#uqr-${CSS.escape(idSafe)}`);
    if (div) new QRCode(div, { text: payload, width:84, height:84, correctLevel:QRCode.CorrectLevel.M });

    const card=document.createElement('div'); card.className='qr-card';
    const v=document.createElement('div'); v.id=`puqr-${idSafe}`;
    const title=document.createElement('div'); title.className='title';
    title.textContent=`${u.name||''}（${u.id||''}｜${u.role||'user'}）`;
    card.appendChild(v); card.appendChild(title); grid?.appendChild(card);
    new QRCode(v,{ text:payload, width:110, height:110, correctLevel:QRCode.CorrectLevel.M });
  });
}

// ===== Auto code untuk item =====
function nextItemCode(){
  const nums = state.items
    .map(i => String(i.code||'').trim())
    .map(c => (/^\d+$/.test(c) ? Number(c) : NaN))
    .filter(n => !isNaN(n));
  const maxNum = nums.length ? Math.max(...nums) : 0;
  const width  = Math.max(4, ...state.items.map(i => (String(i.code||'').length||0))) || 4;
  return String(maxNum + 1).padStart(width, '0');
}

// ===== HISTORY =====
function renderHistory(){
  const tb=qs('#tbl-history'); if(!tb) return; tb.innerHTML='';
  state.history.slice(-200).reverse().forEach(h=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${h.timestamp||''}</td><td>${h.userId||''}</td><td>${h.code||''}</td>
      <td class="text-end">${fmt(h.qty||0)}</td><td>${h.unit||''}</td><td>${h.type||''}</td>`;
    tb.appendChild(tr);
  });
}

// ===== STOCKTAKE =====
async function startScanner(){
  const cams=await Html5Qrcode.getCameras(); const id=cams?.[0]?.id; if(!id){ alert('カメラが見つかりません'); return; }
  state.scanner=new Html5Qrcode('scan-area');
  await state.scanner.start({deviceId:{exact:id}}, {fps:10, qrbox:{width:300,height:300}}, onScanStocktake);
}
async function stopScanner(){ try{ await state.scanner?.stop(); state.scanner?.clear(); }catch(_){} state.scanner=null; }
function onScanStocktake(text){
  try{
    const o=JSON.parse(text);
    if(o.t==='item' && o.code){
      const it=state.items.find(x=>String(x.code)===String(o.code));
      pushStocktake(it?.code||o.code, it?.name||o.name||'', Number(it?.stock||0), Number(it?.stock||0));
    }
  }catch(_){}
}
function pushStocktake(code,name,book,real){
  const diff=Number(real)-Number(book);
  state.stocktakeRows.unshift({code,name,book,real,diff});
  const tb=qs('#tbl-stocktake'); tb.innerHTML='';
  state.stocktakeRows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.code}</td><td>${r.name}</td>
      <td class="text-end">${fmt(r.book)}</td>
      <td class="text-end">${fmt(r.real)}</td>
      <td class="text-end">${fmt(r.diff)}</td>`;
    tb.appendChild(tr);
  });
}
function handleStocktakeAdd(e){ e.preventDefault(); const code=qs('#st-code').value.trim(); const real=Number(qs('#st-qty').value||0); if(!code) return; const it=state.items.find(x=>String(x.code)===String(code)); pushStocktake(code, it?.name||'', Number(it?.stock||0), real); }
function exportStocktake(){ const head='code,name,book,real,diff\n'; const lines=state.stocktakeRows.map(r=>[r.code,r.name,r.book,r.real,r.diff].join(',')); downloadText('stocktake.csv', head+lines.join('\n')); }

// ===== IN/OUT (QR) =====
async function startIoScan(){
  const cams=await Html5Qrcode.getCameras(); const id=cams?.[0]?.id; if(!id){ alert('カメラが見つかりません'); return; }
  state.ioScanner=new Html5Qrcode('io-scan-area');
  await state.ioScanner.start({deviceId:{exact:id}}, {fps:10, qrbox:{width:300,height:300}}, onScanIo);
}
async function stopIoScan(){ try{ await state.ioScanner?.stop(); state.ioScanner?.clear(); }catch(_){} state.ioScanner=null; }
function onScanIo(text){
  try{
    const o=JSON.parse(text);
    if(o.t==='item' && o.code){
      const it=state.items.find(x=>String(x.code)===String(o.code)) || {code:o.code,name:o.name||'',price:o.price||0,stock:0};
      fillIoForm(it); qs('#io-qty').focus();
    }
  }catch(_){}
}
function fillIoForm(it){ qs('#io-code').value=it.code||''; qs('#io-name').value=it.name||''; qs('#io-price').value=it.price||''; qs('#io-stock').value=it.stock||''; }

// ===== Export helpers =====
function downloadText(filename, text){
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function exportCsv(filename, rows, headers){
  const head=headers.join(',')+'\n';
  const body=rows.map(r=>headers.map(h=>(r[h]??'')).join(',')).join('\n');
  downloadText(filename, head+body);
}

// ===== QR Preview (tanpa about:blank kosong) =====
function previewItemQr(i){
  if(!i || !i.code || !i.name){ alert('コード/名称は必須'); return; }
  const tmp=document.createElement('div');
  new QRCode(tmp,{ text:itemQrPayload(i), width:240, height:240, correctLevel:QRCode.CorrectLevel.M });
  const canvas=tmp.querySelector('canvas');
  const dataUrl=canvas?canvas.toDataURL('image/png'):'';
  const w=window.open('','qrprev','width=420,height=520');
  w.document.write(`<div style="padding:20px;text-align:center;font-family:sans-serif">
      <img src="${dataUrl}" style="width:240px;height:240px"/>
      <div style="margin-top:8px">${i.name}（${i.code}） ¥${fmt(i.price||0)}</div>
    </div>`);
  tmp.remove();
}

// ===== Auto-numbering + Form New Item =====
function nextItemCode(){
  const nums = state.items.map(i=>String(i.code||'')).map(c=>/^\d+$/.test(c)?Number(c):NaN).filter(n=>!isNaN(n));
  const max = nums.length?Math.max(...nums):0;
  const width = Math.max(4, ...state.items.map(i => (String(i.code||'').length||0))) || 4;
  return String(max+1).padStart(width,'0');
}

// ===== EVENTS =====
window.addEventListener('DOMContentLoaded', async ()=>{
  updateWho();

  // nav
  qsa('.sidebar nav a').forEach(a=>a.addEventListener('click',()=>{
    const id=a.getAttribute('data-view'); showView(id, a.textContent.trim());
  }));

  // logout
  qs('#btn-logout')?.addEventListener('click',()=>{ localStorage.removeItem('currentUser'); location.href='index.html'; });

  // IO scan & submit
  qs('#btn-io-scan')?.addEventListener('click', startIoScan);
  qs('#btn-io-stop')?.addEventListener('click', stopIoScan);
  qs('#form-io')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body={ userId:state.currentUser.id, code:qs('#io-code').value.trim(), qty:Number(qs('#io-qty').value||0), unit:qs('#io-unit').value, type:qs('#io-type').value };
    if(!body.code||!body.qty){ alert('コード/数量は必須'); return; }
    const r=await api('log',{method:'POST',body}); if(r && r.ok===false) return alert(r.error||'エラー');
    alert('登録しました'); await loadAll(); showView('view-history','履歴'); fillIoForm({code:'',name:'',price:'',stock:''}); qs('#io-qty').value='';
  });

  // Stocktake
  qs('#btn-start-scan')?.addEventListener('click', startScanner);
  qs('#btn-stop-scan')?.addEventListener('click', stopScanner);
  qs('#st-add')?.addEventListener('click', handleStocktakeAdd);
  qs('#st-export')?.addEventListener('click', exportStocktake);

  // Items
  qs('#btn-items-export')?.addEventListener('click', ()=>exportCsv('items.csv', state.items, ['code','name','price','stock','min']));
  const modalItem = new bootstrap.Modal('#dlg-new-item');
  qs('#btn-open-new-item')?.addEventListener('click', ()=>{
    qs('#i-code').value  = nextItemCode();
    qs('#i-name').value  = '';
    qs('#i-price').value = 0;
    qs('#i-stock').value = 0;
    qs('#i-min').value   = 0;
    qs('#i-img').value   = '';
    modalItem.show();
  });
  qs('#form-item')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body = {
      code:  qs('#i-code').value.trim(),
      name:  qs('#i-name').value.trim(),
      price: Number(qs('#i-price').value || 0),
      stock: Number(qs('#i-stock').value || 0),
      min:   Number(qs('#i-min').value   || 0),
      img:   qs('#i-img').value.trim(),
      overwrite: false
    };
    if(!body.code || !body.name){ alert('コード/名称は必須'); return; }
    try{
      const r = await api('addItem', { method:'POST', body });
      if(r && r.ok===false) throw new Error(r.error||'登録失敗');
      previewItemQr({ code:body.code, name:body.name, price:body.price });
      modalItem.hide();
      await loadAll();
      showView('view-items','商品一覧');
    }catch(err){ alert(err.message); }
  });
  qs('#btn-item-makeqr')?.addEventListener('click', ()=>{
    const i={ code:qs('#i-code').value.trim(), name:qs('#i-name').value.trim(), price:Number(qs('#i-price').value||0) };
    previewItemQr(i);
  });

  // Users
  const modalUser = new bootstrap.Modal('#dlg-new-user');
  qs('#btn-open-new-user')?.addEventListener('click', ()=>modalUser.show());
  qs('#form-user')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body={ name:qs('#u-name').value.trim(), id:qs('#u-id').value.trim(), role:qs('#u-role').value, pin:qs('#u-pin').value.trim() };
    const r=await api('addUser',{method:'POST',body}); if(r && r.ok===false) return alert(r.error||'エラー');
    modalUser.hide(); await loadAll(); showView('view-users','ユーザー / QR');
  });
  qs('#btn-print-qr-users')?.addEventListener('click', ()=>{
    qs('#print-qr-users').classList.remove('d-none'); window.print(); qs('#print-qr-users').classList.add('d-none');
  });

  // initial
  showView('view-dashboard','ダッシュボード');
  await loadAll();
});
