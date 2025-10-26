// ---- Brand & optional BG dari config (aman bila tak ada) ----
// ---- Brand & optional BG dari config (aman bila tak ada) ----
(function initBrand(){
  try{
    const url = (window.CONFIG && (CONFIG.LOGO_URL||'./assets/tsh.png')) || './assets/tsh.png';
    const img = document.getElementById('brand-logo'); if(img) img.src = url;
    if (CONFIG && CONFIG.LOGIN_BG_URL){
      document.body.classList.add('login-page');
      document.body.style.background =
        `linear-gradient(180deg,#0b12241a,#0b122413), url('${CONFIG.LOGIN_BG_URL}') center/cover fixed no-repeat`;
    }
  }catch(_){}
})();

// ---- API helper persis seperti yang diharapkan Code.gs ----
async function api(action, {method='GET', body} = {}){
  if (!CONFIG || !CONFIG.BASE_URL) throw new Error('BASE_URL not set in config.js');
  const apikey = encodeURIComponent(CONFIG.API_KEY || '');
  const url    = `${CONFIG.BASE_URL}?action=${encodeURIComponent(action)}&apikey=${apikey}`;

  if (method === 'GET'){
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  // Penting: text/plain + JSON.stringify + apikey di body juga (sesuai Code.gs)
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const $ = (s, el=document)=>el.querySelector(s);

// ---- Login form (ID + PIN) ----
async function handleLogin(e){
  e?.preventDefault?.();
  const id   = $('#login-id').value.trim();
  const pass = $('#login-pin').value.trim();
  if (!id){ alert('ユーザーIDを入力してください'); return; }

  try{
    const res = await api('login', { method:'POST', body:{ id, pass } });
    if (!res || res.ok === false){
      alert(res?.error || 'ログインに失敗しました');
      return;
    }
    localStorage.setItem('currentUser', JSON.stringify(res.user));
    location.href = 'dashboard.html';
  }catch(err){
    alert(String(err.message || err));
  }
}
$('#form-login')?.addEventListener('submit', handleLogin);

// ---- QR Login (format QR: "USER|<ID>")
// gunakan GET utk menghindari preflight/CORS; plus debounce
let qrScanner = null;
let qrBusy = false;

function openQr(){
  const modal = new bootstrap.Modal('#dlg-qr');
  modal.show();

  const start = async ()=>{
    if (!window.Html5Qrcode){
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = begin;
      document.body.appendChild(s);
    }else begin();
  };
  const begin = async ()=>{
    try{
      const cams = await Html5Qrcode.getCameras();
      const id = cams?.[0]?.id;
      if (!id){ alert('カメラが見つかりません'); return; }
      qrScanner = new Html5Qrcode('qr-login-area');
      await qrScanner.start(
        { deviceId:{ exact:id } },
        { fps:10, qrbox:{ width:260, height:260 } },
        onScanQr
      );
    }catch(e){
      alert('カメラ起動に失敗しました: ' + (e?.message||e));
    }
  };
  setTimeout(start, 150);
}

async function onScanQr(text){
  if (qrBusy) return; // debounce
  let userId = '';
  if (text.startsWith('USER|')) userId = text.split('|')[1] || '';
  else {
    try{ const o = JSON.parse(text); if (o.t === 'user') userId = o.id || ''; }catch(_){}
  }
  if (!userId) return;

  qrBusy = true;
  try{
    await qrScanner?.stop(); qrScanner?.clear(); qrScanner = null;
  }catch(_){}

  try{
    // ==== PAKAI GET (tidak ada preflight) ====
    const base = CONFIG.BASE_URL;
    const qs = new URLSearchParams({
      action: 'loginById',
      id: userId,
      apikey: CONFIG.API_KEY || ''
    });
    const r = await fetch(`${base}?${qs.toString()}`);
    if (!r.ok){
      const txt = await r.text().catch(()=>r.statusText);
      throw new Error(`GAS error: ${r.status} ${txt}`);
    }
    const res = await r.json();
    if (!res || res.ok === false){
      alert(res?.error || 'QRログインに失敗しました'); qrBusy = false; return;
    }
    localStorage.setItem('currentUser', JSON.stringify(res.user));
    location.href = 'dashboard.html';
  }catch(err){
    // Pesan lebih jelas
    alert(`Failed to fetch (QR): ${err?.message || err}\n\nCek: config.js BASE_URL (/exec), API_KEY, dan Deploy Web App = Anyone`);
    qrBusy = false;
  }
}

document.getElementById('link-qr')?.addEventListener('click', (e)=>{ e.preventDefault(); openQr(); });
document.getElementById('btn-qr')?.addEventListener('click', openQr);
