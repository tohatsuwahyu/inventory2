/*************************************************
 * login.js — Login biasa & via QR
 * - Tahan eksekusi sampai DOM & config siap
 * - API retry + backoff utk first-load smartphone
 **************************************************/

// ===== Utilities
const qs  = (s, el=document)=>el.querySelector(s);
const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));

function setLoading(show, text){
  const box = qs('#global-loading'); if(!box) return;
  const label = qs('#loading-text');
  if (text && label) label.textContent = text;
  box.classList.toggle('d-none', !show);
}

async function waitConfigReady(maxMs=1200){
  const started = Date.now();
  while ((!window.CONFIG || !CONFIG.BASE_URL) && (Date.now()-started) < maxMs){
    await sleep(100);
  }
  if (!window.CONFIG || !CONFIG.BASE_URL){
    throw new Error('config.js belum siap (BASE_URL kosong)');
  }
}

// API dengan retry (3x) dan backoff bertahap
async function api(action, {method='GET', body}={}){
  await waitConfigReady(); // pastikan CONFIG siap

  const apikey = encodeURIComponent(CONFIG.API_KEY||'');
  const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(action)}&apikey=${apikey}&_=${Date.now()}`;

  const optionsGet = { method:'GET', mode:'cors', cache:'no-store' };
  const optionsPost = {
    method:'POST',
    mode:'cors',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...(body||{}), apikey: CONFIG.API_KEY })
  };

  let lastErr;
  for (let attempt=1; attempt<=3; attempt++){
    try{
      const r = await fetch(url, method==='GET' ? optionsGet : optionsPost);
      if(!r.ok) throw new Error(`[${r.status}] ${r.statusText}`);
      return await r.json();
    }catch(e){
      lastErr = e;
      // jeda kecil untuk warm-up koneksi/izin di mobile in-app browser
      await sleep(200 * attempt);
    }
  }
  throw lastErr || new Error('Fetch gagal');
}

// Normalisasi respons (fleksibel dengan bentuk GAS)
function pickUserFromResponse(resp){
  if (!resp) return null;
  if (resp.ok === false) throw new Error(resp.error || 'Login gagal');
  if (resp.user) return resp.user;
  if (Array.isArray(resp.users) && resp.users[0]) return resp.users[0];
  if (resp.data && resp.data.user) return resp.data.user;
  return resp; // fallback: asumsikan objek user langsung
}

function saveAndGo(user){
  const u = {
    id:   String(user.id || user.userId || ''),
    name: String(user.name || user.displayName || ''),
    role: String(user.role || 'user')
  };
  localStorage.setItem('currentUser', JSON.stringify(u));
  location.href = 'dashboard.html';
}

// ===== QR Login
let qrModal, qrScanner;

async function startQr(){
  const mountId = 'qr-login-area';
  setLoading(false);
  try{
    // html5-qrcode sudah diindex.html
    const cfg = { fps:10, qrbox:{width:250, height:250} };
    qrScanner = new Html5Qrcode(mountId);
    await qrScanner.start({ facingMode:'environment' }, cfg, onScan);
  }catch(e){
    console.error('QR start error:', e);
    alert('Failed to start camera. Coba gunakan kamera belakang dan izinkan akses.');
  }
}
async function stopQr(){
  try{ await qrScanner?.stop(); qrScanner?.clear(); }catch(_){}
  qrScanner = null;
}
async function onScan(text){
  try{
    // format QR untuk user dari app: "USER|<ID>"
    let userId = '';
    if (text.startsWith('USER|')) userId = text.split('|')[1] || '';
    else {
      try { const o = JSON.parse(text); userId = o.userId || o.id || ''; } catch(_){}
    }
    if (!userId) return;

    setLoading(true, 'QR 認証中…');
    const resp = await api('login', { method:'POST', body:{ id:userId, pin:'' } });
    const user = pickUserFromResponse(resp);
    await stopQr();
    saveAndGo(user);
  }catch(err){
    await stopQr();
    // Tampilkan pesan yang lebih informatif, tanpa menakut-nakuti user
    alert('Failed to fetch (QR): Load failed\nBASE_URL／API_KEY／WebApp権限をご確認ください。\n\nDetail: ' + (err?.message||err));
  }finally{
    setLoading(false);
  }
}

// ===== Normal login (ID + PIN)
async function handleLoginSubmit(e){
  e.preventDefault();
  const id  = qs('#login-id').value.trim();
  const pin = qs('#login-pin').value.trim();

  if (!id){ alert('ユーザーIDを入力してください。'); return; }

  setLoading(true, 'ログイン中…');
  try{
    const resp = await api('login', { method:'POST', body:{ id, pin } });
    const user = pickUserFromResponse(resp);
    saveAndGo(user);
  }catch(err){
    alert('ログインに失敗しました: ' + (err?.message||err));
  }finally{
    setLoading(false);
  }
}

// ===== Init
window.addEventListener('DOMContentLoaded', ()=>{
  // Modal setup
  const modalEl = document.getElementById('dlg-qr');
  if (modalEl && window.bootstrap){
    qrModal = new bootstrap.Modal(modalEl);
    modalEl.addEventListener('hidden.bs.modal', stopQr);
    modalEl.addEventListener('shown.bs.modal', startQr);
  }

  // Tombol/Link QR
  qs('#btn-qr')?.addEventListener('click', (e)=>{ e.preventDefault(); qrModal?.show(); });
  qs('#link-qr')?.addEventListener('click', (e)=>{ e.preventDefault(); qrModal?.show(); });

  // Submit form normal
  qs('#form-login')?.addEventListener('submit', handleLoginSubmit);

  // Ganti logo dari config (fallback disiapkan di index.html inline)
  try{
    const url = (window.CONFIG && (CONFIG.LOGO_URL||'./assets/tsh.png')) || './assets/tsh.png';
    const img = document.getElementById('brand-logo'); if(img) img.src = url;
  }catch(_){}
});
