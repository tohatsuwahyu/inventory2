// QR grid builders (Items / Users)
const QRPrint = {
  buildItemGrid(grid, items){
    grid.innerHTML = '';
    (items||[]).forEach(it=>{
      const cell = document.createElement('div'); cell.className='qr-cell';
      const box = document.createElement('div'); box.className='box'; cell.appendChild(box);
      new QRCode(box, { text: JSON.stringify({t:'item',code:it.code,name:it.name,price:it.price}), width:120, height:120 });
      const meta = document.createElement('div');
      meta.innerHTML = `<div class="name">${it.name}</div><div>${it.code}</div><div>¥${it.price||'-'}</div>`;
      cell.appendChild(meta);
      grid.appendChild(cell);
    });
  },
  buildUserGrid(grid, users){
    grid.innerHTML = '';
    (users||[]).forEach(u=>{
      const cell = document.createElement('div'); cell.className='qr-cell';
      const box = document.createElement('div'); cell.appendChild(box);
      new QRCode(box, { text: JSON.stringify({t:'user',id:u.id,name:u.name,role:u.role||'user'}), width:120, height:120 });
      const meta = document.createElement('div');
      meta.innerHTML = `<div class="name">${u.name}</div><div>${u.id}</div>`;
      cell.appendChild(meta);
      grid.appendChild(cell);
    });
  }
};
