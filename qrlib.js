// QRPrint: util sederhana untuk bikin grid QR & mencetak A4
window.QRPrint = (function(){
  function makeCell({ text, title, sub1, sub2 }){
    const cell = document.createElement('div'); cell.className='qr-cell';
    const box = document.createElement('div'); cell.appendChild(box);
    new QRCode(box, { text, width: 120, height: 120 });
    const meta = document.createElement('div');
    meta.innerHTML = `<div class="name">${title || ''}</div>` +
                     (sub1 ? `<div>${sub1}</div>` : '') +
                     (sub2 ? `<div>${sub2}</div>` : '');
    cell.appendChild(meta);
    return cell;
  }
  function buildItemGrid(container, items){
    container.innerHTML = '';
    items.forEach(it=>{
      const payload = JSON.stringify({ t:'item', code: it.code, name: it.name, price: it.price });
      container.appendChild(makeCell({ text: payload, title: it.name, sub1: it.code, sub2: it.price ? `¥${it.price}` : '' }));
    });
  }
  function buildUserGrid(container, users){
    container.innerHTML = '';
    users.forEach(u=>{
      const payload = JSON.stringify({ t:'user', id: u.id, name: u.name });
      container.appendChild(makeCell({ text: payload, title: u.name, sub1: u.id }));
    });
  }
  function printA4(){ window.print(); }
  return { buildItemGrid, buildUserGrid, printA4 };
})();
