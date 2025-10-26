// small qs helpers
const qs = (s, el=document)=>el.querySelector(s);

// burger
window.addEventListener('DOMContentLoaded', ()=>{
  qs('#btn-burger')?.addEventListener('click', ()=> qs('#topnav')?.classList.toggle('open'));
});

// API helper sama pola app.js (tanpa preflight)
async function api(path, { method='GET', body } = {}){
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(path)}&apikey=${apikey}`;
  if(method === 'GET'){
    const res = await fetch(url);
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// Login manual
qs('#login-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = qs('#pl-id').value.trim();
  const pass = qs('#pl-pass').value.trim();
  if(!id || !pass){ alert('ID/パスコードが必要です'); return; }
  try{
    const r = await api('login', { method:'POST', body:{ id, pass }});
    if(!r.ok) throw new Error(r.error||'ログイン失敗');
    localStorage.setItem('currentUser', JSON.stringify(r.user));
    location.href = 'app.html'; // halaman dashboard
  }catch(err){ alert(err.message); }
});

// QR Login
let loginScanner;
qs('#btn-open-qr')?.addEventListener('click', ()=>{
  qs('#dlg-qr').showModal();
  setTimeout(startLoginScanner, 120);
});
qs('#link-qr')?.addEventListener('click', (e)=>{
  e.preventDefault();
  qs('#dlg-qr').showModal();
  setTimeout(startLoginScanner, 120);
});
async function startLoginScanner(){
  try{
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if(!id) return;
    loginScanner = new Html5Qrcode('login-scanner');
    await loginScanner.start({deviceId:{exact:id}}, {fps:10, qrbox:{width:250,height:250}}, onLoginScan);
  }catch(e){ console.warn('login scanner', e); }
}
async function stopLoginScanner(){ try{ await loginScanner?.stop(); loginScanner?.clear(); }catch(_){ } loginScanner=null; }
function onLoginScan(text){
  try{
    const o = JSON.parse(text);
    if(o.t==='user' && o.id){
      // login lewat id dari QR
      api('loginById', { method:'POST', body:{ id:o.id } })
      .then(r=>{
        if(!r.ok) throw new Error(r.error||'QRログイン失敗');
        localStorage.setItem('currentUser', JSON.stringify(r.user));
        location.href='app.html';
      })
      .catch(err=> alert(err.message));
    }
  }catch(_){}
  qs('#dlg-qr').close();
  stopLoginScanner();
}
