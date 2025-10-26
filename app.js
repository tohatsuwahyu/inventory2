// ===== Guard =====
const saved = localStorage.getItem('currentUser');
if (!saved) location.href = 'index.html';

const state = {
  currentUser: JSON.parse(saved),
  items: [],
  users: [],
  history: [],
  monthly: []
};

const qs = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];

// ===== UI helpers =====
function showView(id) {
  qsa('main section').forEach(sec => sec.classList.toggle('d-none', sec.id !== id));
  qsa('.sidebar .nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-view') === id);
  });
}

function fmt(n) {
  return new Intl.NumberFormat('ja-JP').format(n ?? 0);
}

function updateWho() {
  qs('#who').textContent =
    `${state.currentUser.name}（${state.currentUser.id}｜${state.currentUser.role || 'user'}）`;
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

// ===== Data loads =====
async function loadAll() {
  const [items, users, history, monthly] = await Promise.all([
    api('items'),
    api('users'),
    api('history'),
    api('statsMonthlySeries')
  ]);
  state.items = items || [];
  state.users = users || [];
  state.history = history || [];
  state.monthly = monthly || [];

  renderMetrics();
  renderLowStock();
  renderItems();
  renderUsers();
  renderHistory();
  renderMonthlyChart();
}

function renderMetrics() {
  const low = state.items.filter(i => Number(i.stock || 0) <= Number(i.min || 0)).length;
  const last30 = state.history.slice(-200).length; // perkiraan cepat
  qs('#metric-total-items').textContent = fmt(state.items.length);
  qs('#metric-low-stock').textContent = fmt(low);
  qs('#metric-users').textContent = fmt(state.users.length);
  qs('#metric-txn').textContent = fmt(last30);
}

function renderLowStock() {
  const lowRows = state.items
    .filter(i => Number(i.stock || 0) <= Number(i.min || 0))
    .sort((a, b) => (a.stock - a.min) - (b.stock - b.min));

  const tbody = qs('#tbl-low');
  tbody.innerHTML = '';
  lowRows.forEach(i => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i.code || ''}</td>
      <td>${i.name || ''}</td>
      <td class="text-end">${fmt(i.stock || 0)}</td>
      <td class="text-end">${fmt(i.min || 0)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderItems() {
  const tbody = qs('#tbl-items'); if (!tbody) return;
  tbody.innerHTML = '';
  state.items.forEach(i => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i.code || ''}</td>
      <td>${i.name || ''}</td>
      <td class="text-end">¥${fmt(i.price || 0)}</td>
      <td class="text-end">${fmt(i.stock || 0)}</td>
      <td class="text-end">${fmt(i.min || 0)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderUsers() {
  const tbody = qs('#tbl-users'); if (!tbody) return;
  tbody.innerHTML = '';
  state.users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.id || ''}</td><td>${u.name || ''}</td><td>${u.role || 'user'}</td>`;
    tbody.appendChild(tr);
  });
}

function renderHistory() {
  const tbody = qs('#tbl-history'); if (!tbody) return;
  tbody.innerHTML = '';
  state.history.slice(-200).reverse().forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.timestamp || ''}</td>
      <td>${h.userId || ''}</td>
      <td>${h.code || ''}</td>
      <td class="text-end">${fmt(h.qty || 0)}</td>
      <td>${h.unit || ''}</td>
      <td>${h.type || ''}</td>`;
    tbody.appendChild(tr);
  });
}

let monthlyChart;
function renderMonthlyChart() {
  const el = qs('#chart-monthly'); if (!el) return;
  const labels = state.monthly.map(m => m.month);
  const inData = state.monthly.map(m => m.in || 0);
  const outData = state.monthly.map(m => m.out || 0);

  monthlyChart?.destroy?.();
  monthlyChart = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'IN', data: inData },
        { label: 'OUT', data: outData }
      ]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } }
    }
  });
}

// ===== Events =====
window.addEventListener('DOMContentLoaded', async () => {
  updateWho();

  // nav
  qsa('.sidebar .nav-link').forEach(a => {
    a.addEventListener('click', () => showView(a.getAttribute('data-view')));
  });

  qs('#btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('currentUser');
    location.href = 'index.html';
  });

  qs('#btn-refresh')?.addEventListener('click', loadAll);

  // IO form
  qs('#form-io')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      userId: state.currentUser.id,
      code: qs('#io-code').value.trim(),
      qty: Number(qs('#io-qty').value || 0),
      unit: qs('#io-unit').value.trim() || 'pcs',
      type: qs('#io-type').value
    };
    if (!body.code || !body.qty) { alert('Code/Qty required'); return; }
    try {
      const r = await api('log', { method: 'POST', body });
      if (!r.ok) throw new Error(r.error || '失敗');
      alert('Saved');
      await loadAll();
      showView('view-history');
    } catch (err) { alert(err.message); }
  });

  // Add user (uses PIN —> sesuai backend)
  qs('#form-user')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: qs('#u-name').value.trim(),
      id: qs('#u-id').value.trim(),
      role: qs('#u-role').value,
      pin: qs('#u-pin').value.trim()
    };
    try {
      const r = await api('addUser', { method: 'POST', body });
      if (!r.ok) throw new Error(r.error || '失敗');
      bootstrap.Modal.getInstance(qs('#dlg-new-user')).hide();
      await loadAll();
      showView('view-users');
    } catch (err) { alert(err.message); }
  });

  // dummy item (sheet-driven sebenarnya)
  qs('#btn-dummy-save')?.addEventListener('click', () => {
    alert('Tambah item baru sebaiknya lewat sheet. Tombol ini dummy.');
  });

  // initial
  showView('view-dashboard');
  await loadAll();
});
