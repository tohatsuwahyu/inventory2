// ===== Guard & brand =====
const saved = localStorage.getItem('currentUser');
if (!saved) location.href = 'index.html';

const state = {
  currentUser: JSON.parse(saved),
  items: [],
  users: [],
  history: [],
  monthly: [],
  scanner: null
};

const qs = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];

(function setBrand() {
  try {
    const url = (window.CONFIG && CONFIG.LOGO_URL) || './assets/tsh.png';
    const img = qs('#brand-logo'); if (img) img.src = url;
  } catch(_) {}
})();

function showView(id) {
  qsa('main section').forEach(sec => sec.classList.toggle('d-none', sec.id !== id));
  qsa('.sidebar nav a').forEach(a => a.classList.toggle('active', a.getAttribute('data-view') === id));
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

// ===== Data loads (defensive against non-array) =====
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
}

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

// ===== QR LIST (items) =====
function renderQrList() {
  const tbody = qs('#tbl-qr'); if (!tbody) return; tbody.innerHTML = '';
  state.items.forEach(i=>{
    const tr = document.createElement('tr');
    const tdQr = document.createElement('td'); tdQr.className='qr-cell';
    const div = document.createElement('div'); div.id = `qr-${i.code}`; tdQr.appendChild(div);
    tr.appendChild(tdQr);
    tr.innerHTML += `<td>${i.code||''}</td><td>${i.name||''}</td>`;
    tbody.appendChild(tr);
    // payload: {t:'item', code:'...'}
    new QRCode(div, { text: JSON.stringify({t:'item', code:String(i.code||'')}),
                      width:84, height:84, correctLevel: QRCode.CorrectLevel.M });
  });
}

// ===== STOCKTAKE QR SCAN =====
async function startScanner() {
  const cams = await Html5Qrcode.getCameras();
  const id = cams?.[0]?.id; if (!id) { alert('カメラが見つかりません'); return; }
  const el = 'scan-area';
  state.scanner = new Html5Qrcode(el);
  await state.scanner.start(
    { deviceId:{ exact:id } },
    { fps:10, qrbox:{ width:300, height:300 } },
    onScanStocktake
  );
}
async function stopScanner() {
  try { await state.scanner?.stop(); state.scanner?.clear(); } catch(_) {}
  state.scanner = null;
}
function onScanStocktake(text) {
  // 期待: {t:'item', code:'XXX'}
  try {
    const o = JSON.parse(text);
    if (o.t === 'item' && o.code) {
      const it = state.items.find(x => String(x.code) === String(o.code));
      if (it) {
        const tbody = qs('#tbl-stocktake');
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${it.code}</td><td>${it.name}</td>
          <td class="text-end">${fmt(it.stock||0)}</td><td class="text-end">${fmt(it.min||0)}</td>`;
        tbody.prepend(tr);
      }
    }
  } catch(_) {}
}

// ===== Events =====
window.addEventListener('DOMContentLoaded', async () => {
  updateWho();

  qsa('.sidebar nav a').forEach(a => a.addEventListener('click', () => {
    showView(a.getAttribute('data-view'));
  }));

  qs('#btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('currentUser'); location.href = 'index.html';
  });

  qs('#btn-refresh')?.addEventListener('click', loadAll);

  // IO form
  qs('#form-io')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const body = {
      userId: state.currentUser.id,
      code: qs('#io-code').value.trim(),
      qty: Number(qs('#io-qty').value||0),
      unit: qs('#io-unit').value.trim()||'pcs',
      type: qs('#io-type').value
    };
    if (!body.code || !body.qty) { alert('コード/数量は必須'); return; }
    try {
      const r = await api('log', { method:'POST', body });
      if (r && r.ok===false) throw new Error(r.error||'エラー');
      alert('登録しました'); await loadAll(); showView('view-history');
    } catch(err){ alert(err.message); }
  });

  // Stocktake scan buttons
  qs('#btn-start-scan')?.addEventListener('click', startScanner);
  qs('#btn-stop-scan')?.addEventListener('click', stopScanner);

  // initial
  showView('view-dashboard');
  await loadAll();
});
