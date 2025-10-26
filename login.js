// ---------- Guard ----------
if (!window.CONFIG || !CONFIG.BASE_URL) {
  alert('CONFIG missing: pastikan config.js dimuat sebelum login.js');
  throw new Error('CONFIG missing');
}

// ---------- API helper (tanpa preflight) ----------
async function api(path, { method='GET', body } = {}){
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(path)}&apikey=${apikey}`;

  if (method === 'GET'){
    const res = await fetch(url);
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------- State ----------
const state = { users: [] };

// ---------- QR ----------
let qr;
async function openQR(){
  try{
    const cams = await Html5Qrcode.getCameras();
    const id = cams?.[0]?.id; if(!id) return;
    qr = new Html5Qrcode('login-scanner');
    await qr.start({deviceId:{exact:id}}, { fps:10, qrbox:{width:250,height:250} }, onScan);
  }catch(e){ console.warn('qr', e); }
}
async function stopQR(){
  try{ await qr?.stop(); qr?.clear(); }catch(_){}
  qr = null;
}
function onScan(text){
  try{
    const o = JSON.parse(text);
    if(o.t==='user' && o.id){
      doLogin(o.id, o.pin || '');
    }else{
      // kalau QR hanya plain ID
      doLogin(text, '');
    }
  }catch{
    doLogin(text, '');
  }
  document.getElementById('dlg-qr').close();
  stopQR();
}

// ---------- Manual login ----------
async function doLogin(id, pass){
  const u = state.users.find(x=>String(x.id) === String(id));
  if(!u){ alert('ユーザーが見つかりません'); return; }

  // validasi pin/password sederhana (opsional)
  if (u.pin && String(u.pin) !== String(pass || document.getElementById('pl-pass').value || '')){
    alert('パスコードが違います'); return;
  }

  // simpan session ringan
  sessionStorage.setItem('currentUser', JSON.stringify(u));

  // redirect ke dashboard (index utama Anda)
  location.href = './index.html';
}

// ---------- Init ----------
window.addEventListener('DOMContentLoaded', async()=>{
  // burger
  const topnav = document.getElementById('topnav');
  document.getElementById('btn-burger')?.addEventListener('click', ()=>{
    topnav.classList.toggle('open');
  });

  // data users
  try{
    state.users = await api('users');
  }catch(e){
    console.error(e);
    alert('ユーザーデータの取得に失敗しました: ' + e.message);
  }

  // manual submit
  document.getElementById('login-form')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const id = document.getElementById('pl-id').value.trim();
    const pw = document.getElementById('pl-pass').value.trim();
    doLogin(id, pw);
  });

  // open QR
  document.getElementById('btn-open-qr')?.addEventListener('click', ()=>{
    document.getElementById('dlg-qr').showModal();
    setTimeout(openQR, 120);
  });
  // link QR di top bar
  document.getElementById('link-qr')?.addEventListener('click', (e)=>{
    e.preventDefault();
    document.getElementById('dlg-qr').showModal();
    setTimeout(openQR, 120);
  });

  // stop QR saat dialog ditutup via ESC
  document.getElementById('dlg-qr')?.addEventListener('close', stopQR);
});
