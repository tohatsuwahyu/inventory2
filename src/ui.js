import { listItems, getStock, listLogs, listUsers, saveItems, setStock, transact, pushTransactionToSheets } from "./data.js";
import { weightToQty, qtyToWeight, formatDateTime, uid } from "./utils.js";

const h = (t) => { const d = document.createElement("div"); d.innerHTML = t; return d.firstElementChild; };

export function renderDashboard(root) {
  const items = listItems();
  const cards = items.map(it => {
    const qty = getStock(it.id);
    const warning = qty < Number(it.minStock || 0);
    return h(`
      <div class="p-4 rounded-2xl bg-white shadow-soft border ${warning ? 'border-red-300' : 'border-gray-200'}">
        <div class="flex items-start justify-between">
          <div>
            <div class="text-sm text-gray-500">${it.id}</div>
            <div class="font-semibold text-base">${it.name}</div>
            <div class="text-sm text-gray-500">${it.desc || ''}</div>
          </div>
          ${warning ? '<span class="text-red-600 text-sm">在庫警告</span>' : ''}
        </div>
        <div class="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div class="p-2 rounded-xl bg-gray-50">現在庫<br><span class="text-xl font-bold">${qty}</span> 個</div>
          <div class="p-2 rounded-xl bg-gray-50">最小在庫<br><span class="font-semibold">${it.minStock}</span></div>
          <div class="p-2 rounded-xl bg-gray-50">1個重量<br><span class="font-semibold">${it.gramPerPcs} g</span></div>
        </div>
      </div>`);
  });
  root.innerHTML = "";
  const grid = h(`<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>`);
  cards.forEach(c => grid.appendChild(c));
  root.appendChild(grid);
}

export function renderTransactions(root, mode = "IN") {
  const items = listItems();
  const users = listUsers();
  root.innerHTML = `
  <div class="grid md:grid-cols-2 gap-4">
    <div class="p-4 rounded-2xl bg-white shadow-soft border">
      <h2 class="font-semibold mb-3">${mode === 'IN' ? '入庫' : '出庫'}</h2>
      <div class="space-y-3">
        <div>
          <label class="text-sm text-gray-600">アイテムID / スキャン</label>
          <div class="flex gap-2">
            <input id="tx-item-id" class="w-full border rounded-xl px-3 py-2" placeholder="例: ITM-001" />
            <button id="btn-scan" class="px-3 py-2 rounded-xl border">スキャン</button>
          </div>
          <div id="scan-area" class="mt-2 hidden">
            <div id="reader" class="rounded-xl overflow-hidden border"></div>
            <button id="btn-scan-close" class="mt-2 px-3 py-1.5 rounded-xl border">閉じる</button>
          </div>
        </div>
        <div>
          <label class="text-sm text-gray-600">ユーザー</label>
          <select id="tx-user" class="w-full border rounded-xl px-3 py-2">
            ${users.map(u=>`<option value="${u.id}">${u.name}（${u.id}）</option>`).join('')}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm text-gray-600">数量（個）</label>
            <input id="tx-qty" type="number" class="w-full border rounded-xl px-3 py-2" placeholder="0" />
          </div>
          <div>
            <label class="text-sm text-gray-600">総重量（g）</label>
            <input id="tx-weight" type="number" class="w-full border rounded-xl px-3 py-2" placeholder="0" />
          </div>
        </div>
        <p class="text-xs text-gray-500">※ 数量または総重量どちらか入力。重量入力時は自動換算。</p>
        <button id="btn-submit" class="w-full py-2 rounded-xl bg-black text-white">確定</button>
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-white shadow-soft border">
      <h3 class="font-semibold mb-3">アイテム情報</h3>
      <div id="item-info" class="text-sm text-gray-600">未選択</div>
    </div>
  </div>`;

  // handlers
  const itemIdEl = root.querySelector('#tx-item-id');
  const qtyEl = root.querySelector('#tx-qty');
  const weightEl = root.querySelector('#tx-weight');
  const infoEl = root.querySelector('#item-info');

  function showItemInfo(id) {
    const it = items.find(x=>x.id===id);
    if (!it) { infoEl.textContent = '未選択'; return; }
    const current = getStock(id);
    infoEl.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div class="p-2 rounded-xl bg-gray-50">${it.id}<br><span class="font-semibold">${it.name}</span></div>
        <div class="p-2 rounded-xl bg-gray-50">説明<br>${it.desc||'-'}</div>
        <div class="p-2 rounded-xl bg-gray-50">1個重量<br>${it.gramPerPcs} g</div>
        <div class="p-2 rounded-xl bg-gray-50">現在庫<br>${current} 個</div>
      </div>`;
  }

  function recalcFromWeight() {
    const it = items.find(x=>x.id===itemIdEl.value);
    if (!it) return;
    const qty = weightToQty(Number(weightEl.value||0), Number(it.gramPerPcs||0));
    qtyEl.value = qty;
  }

  weightEl.addEventListener('input', recalcFromWeight);
  itemIdEl.addEventListener('change', ()=> showItemInfo(itemIdEl.value));

  root.querySelector('#btn-submit').addEventListener('click', async () => {
    const id = itemIdEl.value.trim();
    const it = items.find(x=>x.id===id);
    if (!it) { alert('アイテムが見つかりません'); return; }
    let qty = Number(qtyEl.value||0);
    if (!qty) qty = weightToQty(Number(weightEl.value||0), it.gramPerPcs);
    if (!qty) { alert('数量/重量を入力してください'); return; }
    const userId = root.querySelector('#tx-user').value;

    transact({ type: mode, itemId: id, qty, userId, note: '' });
    await pushTransactionToSheets({ type: mode, itemId: id, qty, userId, at: formatDateTime(new Date()) });
    showItemInfo(id);
    alert('保存しました');
    qtyEl.value = weightEl.value = '';
  });

  // Scanner
  root.querySelector('#btn-scan').addEventListener('click', () => {
    root.querySelector('#scan-area').classList.remove('hidden');
    import('./scanner.js').then(m => m.openScanner((code) => {
      itemIdEl.value = code;
      showItemInfo(code);
      root.querySelector('#scan-area').classList.add('hidden');
    }));
  });
  root.querySelector('#btn-scan-close').addEventListener('click', () => {
    import('./scanner.js').then(m => m.closeScanner());
    root.querySelector('#scan-area').classList.add('hidden');
  });
}

export function renderSO(root) {
  const items = listItems();
  root.innerHTML = `
  <div class="p-4 rounded-2xl bg-white shadow-soft border">
    <h2 class="font-semibold mb-3">棚卸（SO）</h2>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="space-y-3">
        <label class="text-sm text-gray-600">アイテムID / スキャン</label>
        <div class="flex gap-2">
          <input id="so-item-id" class="w-full border rounded-xl px-3 py-2" placeholder="例: ITM-001" />
          <button id="btn-scan" class="px-3 py-2 rounded-xl border">スキャン</button>
        </div>
        <div id="scan-area" class="mt-2 hidden">
          <div id="reader" class="rounded-xl overflow-hidden border"></div>
          <button id="btn-scan-close" class="mt-2 px-3 py-1.5 rounded-xl border">閉じる</button>
        </div>

        <div>
          <label class="text-sm text-gray-600">先月在庫（表示のみ）</label>
          <input id="so-last" class="w-full border rounded-xl px-3 py-2 bg-gray-50" disabled />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm text-gray-600">総重量（g）</label>
            <input id="so-weight" type="number" class="w-full border rounded-xl px-3 py-2" placeholder="0" />
          </div>
          <div>
            <label class="text-sm text-gray-600">換算数量（自動）</label>
            <input id="so-qty" type="number" class="w-full border rounded-xl px-3 py-2 bg-gray-50" disabled />
          </div>
        </div>
        <button id="btn-so-save" class="w-full py-2 rounded-xl bg-black text-white">保存</button>
      </div>

      <div id="so-info" class="text-sm text-gray-600">未選択</div>
    </div>
  </div>`;

  const idEl = root.querySelector('#so-item-id');
  const lastEl = root.querySelector('#so-last');
  const wEl = root.querySelector('#so-weight');
  const qEl = root.querySelector('#so-qty');
  const infoEl = root.querySelector('#so-info');

  function loadInfo(id) {
    const it = items.find(x=>x.id===id);
    if (!it) { infoEl.textContent = '未選択'; return; }
    const current = getStock(id);
    // *Perhitungan stok baru (dari total berat): gunakan weightToQty*
    const calcQty = () => qEl.value = weightToQty(Number(wEl.value||0), it.gramPerPcs);

    infoEl.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div class="p-2 rounded-xl bg-gray-50">${it.id}<br><span class="font-semibold">${it.name}</span></div>
        <div class="p-2 rounded-xl bg-gray-50">説明<br>${it.desc||'-'}</div>
        <div class="p-2 rounded-xl bg-gray-50">1個重量<br>${it.gramPerPcs} g</div>
        <div class="p-2 rounded-xl bg-gray-50">現在庫（参考）<br>${current} 個</div>
      </div>`;

    // contoh: tampilkan stok bulan lalu = current (demo). Aslinya ambil dari Sheets/log
    lastEl.value = current;
    wEl.oninput = calcQty; calcQty();
  }

  idEl.addEventListener('change', ()=> loadInfo(idEl.value));

  root.querySelector('#btn-so-save').addEventListener('click', async () => {
    const id = idEl.value.trim();
    const it = items.find(x=>x.id===id);
    if (!it) { alert('アイテムが見つかりません'); return; }
    const newQty = Number(qEl.value||0);
    if (!newQty) { alert('重量を入力してください'); return; }
    setStock(id, newQty);
    // Optional push to Sheets
    // await pushSOToSheets({ itemId: id, qty: newQty, at: formatDateTime(new Date()) });
    alert('保存しました');
  });

  // scanner hook
  root.querySelector('#btn-scan').addEventListener('click', () => {
    root.querySelector('#scan-area').classList.remove('hidden');
    import('./scanner.js').then(m => m.openScanner((code) => {
      idEl.value = code; loadInfo(code);
      root.querySelector('#scan-area').classList.add('hidden');
    }));
  });
  root.querySelector('#btn-scan-close').addEventListener('click', () => {
    import('./scanner.js').then(m => m.closeScanner());
    root.querySelector('#scan-area').classList.add('hidden');
  });
}

export function renderLogs(root) {
  const logs = listLogs();
  root.innerHTML = `<div class="p-4 rounded-2xl bg-white shadow-soft border">
    <h2 class="font-semibold mb-3">取引履歴</h2>
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="text-gray-500">
          <tr>
            <th class="text-left p-2">日時</th>
            <th class="text-left p-2">種別</th>
            <th class="text-left p-2">アイテムID</th>
            <th class="text-left p-2">数量</th>
            <th class="text-left p-2">ユーザー</th>
          </tr>
        </thead>
        <tbody id="log-body"></tbody>
      </table>
    </div>
  </div>`;
  const tbody = root.querySelector('#log-body');
  tbody.innerHTML = logs.map(l => `
    <tr class="border-t">
      <td class="p-2">${l.ts?.replace('T',' ').slice(0,16)}</td>
      <td class="p-2">${l.type==='IN'?'入庫':'出庫'}</td>
      <td class="p-2">${l.itemId}</td>
      <td class="p-2">${l.qty}</td>
      <td class="p-2">${l.userId}</td>
    </tr>`).join('');
}

export function renderItems(root) {
  const items = listItems();
  root.innerHTML = `<div class="p-4 rounded-2xl bg-white shadow-soft border">
    <h2 class="font-semibold mb-3">マスター（アイテム）</h2>
    <div class="grid sm:grid-cols-2 gap-3" id="cards"></div>
    <button id="btn-add" class="mt-3 px-3 py-2 rounded-xl border">新規追加</button>
  </div>`;
  const cards = root.querySelector('#cards');

  function draw() {
    const items2 = listItems();
    cards.innerHTML = items2.map(it => `
      <div class="p-3 rounded-xl border bg-white">
        <div class="text-xs text-gray-500">${it.id}</div>
        <div class="font-semibold">${it.name}</div>
        <div class="text-sm text-gray-500">${it.desc||''}</div>
        <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div class="p-2 rounded bg-gray-50">最小在庫<br><b>${it.minStock}</b></div>
          <div class="p-2 rounded bg-gray-50">1個重量<br><b>${it.gramPerPcs}g</b></div>
          <div class="p-2 rounded bg-gray-50">現在庫<br><b>${getStock(it.id)}</b></div>
        </div>
        <div class="mt-2 flex gap-2">
          <button class="px-3 py-1.5 rounded-xl border" data-edit="${it.id}">編集</button>
          <button class="px-3 py-1.5 rounded-xl border" data-code="${it.id}">QR</button>
        </div>
      </div>`).join('');

    cards.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.edit)));
    cards.querySelectorAll('[data-code]').forEach(btn => btn.addEventListener('click', () => openQR(btn.dataset.code)));
  }

  function openEdit(id) {
    const items2 = listItems();
    const it = items2.find(x=>x.id===id);
    const overlay = h(`<div class="fixed inset-0 bg-black/30 grid place-items-center p-4">
      <div class="w-full max-w-lg p-4 bg-white rounded-2xl">
        <h3 class="font-semibold mb-3">編集: ${id}</h3>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <label>名前<input id="name" class="w-full border rounded-xl px-3 py-2" value="${it.name}"></label>
          <label>最小在庫<input id="min" type="number" class="w-full border rounded-xl px-3 py-2" value="${it.minStock}"></label>
          <label class="col-span-2">説明<textarea id="desc" class="w-full border rounded-xl px-3 py-2">${it.desc||''}</textarea></label>
          <label>1個重量 (g)<input id="gp" type="number" class="w-full border rounded-xl px-3 py-2" value="${it.gramPerPcs}"></label>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button id="save" class="px-3 py-1.5 rounded-xl bg-black text-white">保存</button>
          <button id="close" class="px-3 py-1.5 rounded-xl border">閉じる</button>
        </div>
      </div>
    </div>`);
    document.body.appendChild(overlay);
    overlay.querySelector('#close').onclick = () => overlay.remove();
    overlay.querySelector('#save').onclick = () => {
      it.name = overlay.querySelector('#name').value.trim();
      it.minStock = Number(overlay.querySelector('#min').value||0);
      it.desc = overlay.querySelector('#desc').value.trim();
      it.gramPerPcs = Number(overlay.querySelector('#gp').value||0);
      saveItems(items2);
      overlay.remove();
      draw();
    };
  }

  function openQR(id) {
    const overlay = h(`<div class="fixed inset-0 bg-black/30 grid place-items-center p-4">
      <div class="w-full max-w-sm p-4 bg-white rounded-2xl text-center space-y-3">
        <div class="font-semibold">QRコード: ${id}</div>
        <canvas id="qr"></canvas>
        <button id="close" class="px-3 py-1.5 rounded-xl border">閉じる</button>
      </div>
    </div>`);
    document.body.appendChild(overlay);
    overlay.querySelector('#close').onclick = () => overlay.remove();
    // simple QR via third-party quick API (no net). we draw text fallback
    const ctx = overlay.querySelector('#qr').getContext('2d');
    ctx.canvas.width = 220; ctx.canvas.height = 220;
    ctx.fillStyle = '#f3f4f6'; ctx.fillRect(0,0,220,220);
    ctx.fillStyle = '#111'; ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(id, 110, 110);
  }

  root.querySelector('#btn-add').addEventListener('click', () => {
    const items2 = listItems();
    const newIt = { id: `ITM-${uid().toUpperCase()}`, name: '新規アイテム', desc: '', gramPerPcs: 1, minStock: 0 };
    items2.push(newIt); saveItems(items2); draw();
  });

  draw();
}
