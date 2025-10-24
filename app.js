const qs = (s, el=document) => el.querySelector(s);
tr.innerHTML = `<td>${r.timestamp}</td><td>${r.userName||r.userId}</td><td>${r.name||''}</td><td>${r.code||''}</td><td>${r.qty}</td><td>${r.unit}</td><td>${r.type}</td>`;
tbd.appendChild(tr);
});
}


// ---- QR 生成（商品 / ユーザー） ----
function addItemQR(code){
const it = state.items.find(i=>i.code===code); if(!it) return;
const cell = document.createElement('div'); cell.className='qr-cell';
const box = document.createElement('div'); box.className='box';
cell.appendChild(box);
new QRCode(box, { text: JSON.stringify({ t:'item', code: it.code, name: it.name, price: it.price}), width:120, height:120 });
const meta = document.createElement('div'); meta.innerHTML = `<div class="name">${it.name}</div><div>${it.code}</div><div>¥${it.price||'-'}</div>`; cell.appendChild(meta);
qs('#qr-grid').appendChild(cell);
}
function addUserQR(id){
const u = state.users.find(x=>x.id===id); if(!u) return;
const cell = document.createElement('div'); cell.className='qr-cell';
const box = document.createElement('div'); box.className='box';
cell.appendChild(box);
new QRCode(box, { text: JSON.stringify({ t:'user', id: u.id, name: u.name }), width:120, height:120 });
const meta = document.createElement('div'); meta.innerHTML = `<div class="name">${u.name}</div><div>${u.id}</div>`; cell.appendChild(meta);
qs('#user-qr-grid').appendChild(cell);
}
function buildQRSheets(){ qs('#qr-grid').innerHTML=''; state.items.forEach(i=> addItemQR(i.code)); }
function buildUserQRSheets(){ qs('#user-qr-grid').innerHTML=''; state.users.forEach(u=> addUserQR(u.id)); }
qs('#btn-print-qr').onclick = ()=> window.print();
qs('#btn-print-user-qr').onclick = ()=> window.print();


// ---- インポート/エクスポート（商品 / 履歴） ----
qs('#btn-export-items').onclick = async()=>{
const rows = await api('exportItems');
const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '商品一覧');
const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
saveAs(new Blob([out],{type:'application/octet-stream'}), 'items.xlsx');
};
qs('#import-items').addEventListener('change', async(e)=>{
const file = e.target.files[0]; if(!file) return;
const data = await file.arrayBuffer();
const wb = XLSX.read(data); const sheet = wb.Sheets[wb.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(sheet);
await api('importItems', { method:'POST', body: { rows: json } });
state.items = await api('items'); renderItems(); buildQRSheets();
alert('インポート完了');
});


qs('#btn-export-history').onclick = async()=>{
const rows = await api('history', { method:'POST', body: {} });
const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '履歴');
const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
saveAs(new Blob([out],{type:'application/octet-stream'}), 'history.xlsx');
};


// ---- 棚卸 ----
qs('#btn-start-stocktake').onclick = ()=>{
state.stocktake = state.items.map(it=> ({ name: it.name, code: it.code, actual: it.stock||0, diff: 0 }));
const tbd = qs('#stocktake-table tbody'); tbd.innerHTML='';
state.stocktake.forEach(row=>{
const tr = document.createElement('tr');
tr.innerHTML = `<td>${row.name}</td><td>${row.code}</td><td><input type=\"number\" step=\"0.01\" value=\"${row.actual}\" data-code=\"${row.code}\" class=\"stk\"/></td><td class=\"diff\">0</td>`;
tbd.appendChild(tr);
});
qsa('input.stk').forEach(inp=> inp.oninput = (e)=>{
const code = e.target.dataset.code; const val = Number(e.target.value||0);
const it = state.items.find(i=>i.code===code); const d = val - Number(it.stock||0);
e.target.closest('tr').querySelector('.diff').textContent = d.toFixed(2);
});
};
qs('#btn-finish-stocktake').onclick = async()=>{
const updates = qsa('input.stk').map(inp=> ({ code: inp.dataset.code, stock: Number(inp.value||0) }));
await api('stocktake', { method:'POST', body: { updates } });
state.items = await api('items'); renderItems(); alert('棚卸を反映しました');
};


// ---- 初期起動 ----
window.addEventListener('DOMContentLoaded', ()=>{ startScanners(); bootstrap(); });
