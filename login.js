// Simple API helper
async function api(path, { method='GET', body } = {}){
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(path)}&apikey=${apikey}`;
  if(method === 'GET'){
    const r = await fetch(url);
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }
  const r = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

// Burger (mobile)
document.getElementById('btn-burger')?.addEventListener('click', e=>{
  e.currentTarget.classList.toggle('open');
});

// Manual login
document.getElementById('login-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = document.getElementById('login-id').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const msg = document.getElementById('login-msg');

  try{
    const res = await api('login', { method:'POST', body:{ id, pass }});
    if(!res.ok){ msg.textContent = '認証失敗：' + (res.error||''); return; }
    localStorage.setItem('currentUser', JSON.stringify(res.user));
    location.href = 'dashboard.html';
  }catch(err){
    msg.textContent = '通信エラー：' + err.message;
  }
});

// QR login (optional; only start when dialog opened)
const dlg = document.getElementById('dlg-qr');
let qrScanner;
dlg?.addEventListener('close', async ()=>{
  try{ await qrScanner?.stop(); qrScanner?.clear(); }catch(_){}
});
dlg?.addEventListener('cancel', ()=>{}); // default close

dlg?.addEventListener('show', ()=>{});   // not used

document.getElementById('dlg-qr')?.addEventListener('click', async (ev)=>{
  // no-op; dialog handled by buttons
});

document.getElementById('dlg-qr')?.addEventListener('close', ()=>{});

document.getElementById('dlg-qr')?.addEventListener('cancel', ()=>{});

document.getElementById('dlg-qr')?.addEventListener('submit', ()=>{});

// When dialog open (button in HTML calls showModal()), start camera shortly after
document.getElementById('dlg-qr')?.addEventListener('close', ()=>{});
document.getElementById('dlg-qr')?.addEventListener('cancel', ()=>{});

document.getElementById('dlg-qr')?.addEventListener('click', ()=>{});

document.getElementById('dlg-qr')?.addEventListener('close', ()=>{});

const openQR = () => {
  setTimeout(async ()=>{
    try{
      const cams = await Html5Qrcode.getCameras();
      const id = cams?.[0]?.id; if(!id) return;
      qrScanner = new Html5Qrcode('qr-login');
      await qrScanner.start({deviceId:{exact:id}}, {fps:10, qrbox:{width:240, height:240}}, async (text)=>{
        try{
          let payload = {};
          try{ const o = JSON.parse(text); if(o.t==='user'){ payload.id=o.id; payload.pass=o.pass||''; } else { payload.id=text; } }
          catch(_){ payload.id=text; }

          const res = await api('login', { method:'POST', body: payload });
          if(res.ok){
            localStorage.setItem('currentUser', JSON.stringify(res.user));
            location.href='dashboard.html';
          }else{
            document.getElementById('login-msg').textContent = 'QR認証失敗';
          }
        }catch(_){}
      });
    }catch(e){ console.warn('qr login', e); }
  }, 120);
};

document.querySelector('.ghost')?.addEventListener('click', openQR);
