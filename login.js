/* =========================================================
 * login.js — Login USER+PIN & QR (Fixed & Unified Version)
 * =======================================================*/
(function() {
  "use strict";

  const qs = (s, el = document) => el.querySelector(s);

  /* =========================================================
   * 1b. Helper: Toast + Loader html5-qrcode (Compat Fix)
   *    - FIX: sebelumnya startQR() memanggil ensureHtml5() tapi fungsinya belum ada
   *    - FIX: sebelumnya toast() dipanggil tapi belum didefinisikan di login page
   * =======================================================*/
  function toast(message, variant = "danger") {
    const msg = String(message ?? "");
    try {
      // Jika bootstrap Toast tersedia, pakai toast yang rapi
      const hasBsToast = !!(window.bootstrap && window.bootstrap.Toast);
      const id = "login-toast-container";
      let container = document.getElementById(id);
      if (!container) {
        container = document.createElement("div");
        container.id = id;
        container.className = "toast-container position-fixed bottom-0 end-0 p-3";
        container.style.zIndex = 3000;
        document.body.appendChild(container);
      }

      const v = (variant || "danger").toLowerCase();
      const bsVar = ["primary","secondary","success","danger","warning","info","light","dark"].includes(v) ? v : "danger";
      const el = document.createElement("div");
      el.className = `toast align-items-center text-bg-${bsVar} border-0`;
      el.setAttribute("role", "alert");
      el.setAttribute("aria-live", "assertive");
      el.setAttribute("aria-atomic", "true");
      el.innerHTML = `
        <div class="d-flex">
          <div class="toast-body">${msg.replace(/[&<>"']/g, (m)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>`;
      container.appendChild(el);

      if (hasBsToast) {
        const t = new bootstrap.Toast(el, { delay: 3500 });
        el.addEventListener("hidden.bs.toast", () => el.remove(), { once: true });
        t.show();
      } else {
        // Fallback tanpa bootstrap
        el.classList.add("show");
        setTimeout(() => { try { el.remove(); } catch(e) {} }, 3800);
      }
    } catch (e) {
      // Fallback paling aman
      alert(msg);
    }
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      try {
        if ([...document.scripts].some(s => s.src === src || s.src.endsWith(src))) return resolve();
        const s = document.createElement("script");
        s.src = src; s.async = true; s.crossOrigin = "anonymous";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Gagal memuat script: " + src));
        document.head.appendChild(s);
      } catch (e) { reject(e); }
    });
  }

  async function ensureHtml5() {
    // Jika sudah ada, tidak perlu load lagi
    if (window.Html5Qrcode) return;
    const cdns = [
      "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/minified/html5-qrcode.min.js",
      "https://unpkg.com/html5-qrcode@2.3.8/minified/html5-qrcode.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js"
    ];
    for (const url of cdns) {
      try {
        await loadScriptOnce(url);
        if (window.Html5Qrcode) return;
      } catch (e) {
        // lanjut coba CDN lain
      }
    }
    throw new Error("html5-qrcode library tidak tersedia (script gagal dimuat)");
  }

  async function pickBackCameraId() {
    // Fallback untuk device yang tidak cocok dengan facingMode: 'environment'
    try {
      if (!window.Html5Qrcode || !window.Html5Qrcode.getCameras) return null;
      const cams = await Html5Qrcode.getCameras();
      if (!Array.isArray(cams) || !cams.length) return null;

      // Prefer label 'back/rear' kalau label tersedia
      const back = cams.find(c => /back|rear|environment|背面|背|kamera belakang/i.test(String(c.label || "")));
      return (back || cams[cams.length - 1]).id;
    } catch (e) {
      return null;
    }
  }

  function prettyCameraError(err) {
    const name = String(err?.name || "");
    const msg  = String(err?.message || err || "");
    // Pesan yang lebih ramah untuk pemula
    if (/NotAllowedError|PermissionDeniedError/i.test(name + msg)) {
      return "Izin kamera ditolak. Buka pengaturan browser → Site settings → Camera → Allow untuk tshinventory.pages.dev.";
    }
    if (/NotFoundError|DevicesNotFoundError/i.test(name + msg)) {
      return "Kamera tidak ditemukan. Pastikan device punya kamera dan tidak sedang dipakai aplikasi lain.";
    }
    if (/NotReadableError|TrackStartError/i.test(name + msg)) {
      return "Kamera tidak bisa dibuka (mungkin sedang dipakai aplikasi lain). Tutup aplikasi kamera/WhatsApp/Line, lalu coba lagi.";
    }
    if (/OverconstrainedError|ConstraintNotSatisfiedError/i.test(name + msg)) {
      return "Resolusi/constraint kamera tidak cocok di device ini. Sistem akan mencoba kamera lain. Jika masih gagal, gunakan browser Chrome/Safari terbaru.";
    }
    return "Gagal membuka kamera. Refresh halaman atau cek izin browser.";
  }


  // --- 1. UI HELPERS & CSS INJECTION ---
  (function injectTapCss() {
    if (document.getElementById('login-css-patch')) return;
    const css = `
      #qr-area { position: relative; z-index: 1; border: 2px solid #2563eb; background: #000; }
      #qr-area::before {
        content: "QRを枠内に収めてください";
        position: absolute; top: 10px; left: 0; right: 0;
        text-align: center; color: #fff; font-size: 12px; z-index: 10;
        background: rgba(0,0,0,0.5);
      }
      #global-loading { pointer-events: none !important; position: fixed; inset: 0; background: rgba(255,255,255,.7); display: flex; align-items: center; justifyContent: center; z-index: 2000; }
      @keyframes spin{to{transform:rotate(360deg)}}
      .html5-qrcode-element { display: none !important; }
      video { object-fit: cover !important; }
    `.trim();
    const style = document.createElement('style');
    style.id = 'login-css-patch';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  function setLoading(show, text) {
    let el = document.getElementById('global-loading');
    if (!el && show) {
      el = document.createElement('div');
      el.id = 'global-loading';
      el.innerHTML = `<div style="background:#fff;padding:20px;border-radius:12px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.1)">
        <div style="width:30px;height:30px;border:3px solid #ddd;border-top-color:#2563eb;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px"></div>
        <div id="loading-text">${text || '読み込み中…'}</div></div>`;
      document.body.appendChild(el);
    }
    if (el) el.classList.toggle('d-none', !show);
    if (el && show) document.getElementById('loading-text').textContent = text;
  }

  // --- 2. API & LOGIN LOGIC ---
  async function api(action, { method = 'GET', body } = {}) {
    const apikey = encodeURIComponent(window.CONFIG?.API_KEY || '');
    const url = `${CONFIG.BASE_URL}?action=${encodeURIComponent(action)}&apikey=${apikey}&_=${Date.now()}`;
    const opts = {
      method: method,
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: method === 'POST' ? JSON.stringify({ ...body, apikey: CONFIG.API_KEY }) : undefined
    };
    const r = await fetch(url, opts);
    return r.json();
  }

  async function handleLoginSuccess(user) {
    api('log', { method: 'POST', body: { userId: user.id, type: 'LOGIN', note: 'QR/Manual Success' } }).catch(()=>{});
    localStorage.setItem('currentUser', JSON.stringify(user));
    setLoading(true, 'ダッシュボードへ移動中…');
    window.location.replace('dashboard.html');
  }

  // --- 3. SCANNER LOGIC ---
  // Catatan:
  // - Beberapa device lebih stabil pakai BarcodeDetector (Chrome) → kita pakai dulu jika ada.
  // - Jika tidak ada, fallback ke html5-qrcode (dengan useBarCodeDetectorIfSupported).
  let scanner = null; // bisa Html5Qrcode instance ATAU handle {stop, clear}
  const $area = qs('#qr-area');

  let _lastWarnAt = 0;

  function setQrDebug(message) {
    try {
      const id = 'qr-debug';
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.fontSize = '12px';
        el.style.marginTop = '8px';
        el.style.color = '#475569';
        el.style.wordBreak = 'break-word';
        ($area.parentNode || document.body).insertBefore(el, $area.nextSibling);
      }
      el.textContent = message ? String(message) : '';
    } catch (e) {}
  }

  function parseQR(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    // Format standar login (yang juga dipakai di app.js untuk QR user)
    // USER|USER001
    if (/^USER\|/i.test(raw)) {
      const id = (raw.split('|')[1] || '').trim();
      return id ? { kind: 'byId', id } : null;
    }

    // LOGIN|USER001|1234
    if (/^LOGIN\|/i.test(raw)) {
      const parts = raw.split('|');
      const id  = (parts[1] || '').trim();
      const pin = (parts[2] || '').trim();
      return (id && pin) ? { kind: 'withPin', id, pin } : null;
    }

    // Jika QR hanya berisi USER001 saja
    if (/^[A-Z0-9_-]{3,}$/i.test(raw) && !raw.includes('://')) {
      return { kind: 'byId', id: raw };
    }

    // URL berisi ?id=USER001 atau ?user=USER001
    try {
      const u = new URL(raw);
      const id = (u.searchParams.get('id') || u.searchParams.get('user') || u.searchParams.get('uid') || '').trim();
      const pin = (u.searchParams.get('pin') || u.searchParams.get('pass') || '').trim();
      if (id && pin) return { kind: 'withPin', id, pin };
      if (id) return { kind: 'byId', id };
    } catch (e) {}

    // JSON {"id":"USER001","pin":"1234"}
    try {
      const o = JSON.parse(raw);
      const id  = String(o.id || o.userId || o.user || '').trim();
      const pin = String(o.pin || o.pass || '').trim();
      if (id && pin) return { kind: 'withPin', id, pin };
      if (id) return { kind: 'byId', id };
    } catch (e) {}

    return null;
  }

  async function stopQR() {
    try {
      if (scanner) {
        if (typeof scanner.stop === 'function') await scanner.stop();
        if (typeof scanner.clear === 'function') await scanner.clear();
      }
    } catch (e) {}
    scanner = null;
    $area.style.display = 'none';
    setQrDebug('');
  }

  async function tryLoginByIdOrFill(id) {
    // 1) coba loginById (jika backend mendukung)
    try {
      const r = await api('loginById', { method: 'POST', body: { id } });
      if (r?.ok) return await handleLoginSuccess(r.user);
      // 2) fallback: isi saja field ID supaya user bisa login manual
      const inp = qs('#login-user');
      if (inp) inp.value = id;
      setLoading(false);
      toast(r?.error || 'QR terbaca. ID sudah terisi, silakan tekan tombol Login.', 'warning');
    } catch (e) {
      const inp = qs('#login-user');
      if (inp) inp.value = id;
      setLoading(false);
      toast('QR terbaca. ID sudah terisi, silakan tekan tombol Login.', 'warning');
    }
  }

  async function onScan(decodedText) {
    const raw = String(decodedText || '').trim();
    setQrDebug(raw ? `Terbaca: ${raw}` : '');

    const p = parseQR(raw);
    if (!p) {
      const now = Date.now();
      if (now - _lastWarnAt > 1500) {
        _lastWarnAt = now;
        toast('QR terbaca, tapi format belum dikenali. Contoh: USER|USER001 atau LOGIN|USER001|1234', 'warning');
      }
      return;
    }

    if (navigator.vibrate) navigator.vibrate(40);

    // Stop kamera dulu supaya tidak scan berkali-kali
    await stopQR();

    try {
      setLoading(true, 'QRログイン中…');
      if (p.kind === 'withPin') {
        const r = await api('login', { method: 'POST', body: { id: p.id, pass: p.pin } });
        if (!r?.ok) { setLoading(false); return toast(r?.error || 'Login gagal.', 'danger'); }
        return await handleLoginSuccess(r.user);
      }
      return await tryLoginByIdOrFill(p.id);
    } catch (e) {
      setLoading(false);
      toast('Error: ' + (e?.message || e), 'danger');
    }
  }

  function cameraErrorMessage(err) {
    const name = String(err?.name || '');
    const msg  = String(err?.message || err || '');
    if (/NotAllowedError|PermissionDeniedError/i.test(name + msg)) {
      return 'Izin kamera ditolak. Buka Site settings → Camera → Allow untuk domain ini.';
    }
    if (/NotFoundError|DevicesNotFoundError/i.test(name + msg)) {
      return 'Kamera tidak ditemukan.';
    }
    if (/NotReadableError|TrackStartError/i.test(name + msg)) {
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera/WhatsApp lalu coba lagi.';
    }
    if (/OverconstrainedError|ConstraintNotSatisfiedError/i.test(name + msg)) {
      return 'Constraint kamera tidak cocok. Sistem akan coba mode lain.';
    }
    return 'Gagal membuka kamera. Cek izin kamera & refresh.';
  }

  async function startQR() {
    try {
      $area.style.display = 'block';
      setQrDebug('Menunggu QR...');

      // ===============================
      // A) Native BarcodeDetector (Chrome) — paling jago baca QR “styling”
      // ===============================
      if ('BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia) {
        try {
          const video = Object.assign(document.createElement('video'), { playsInline: true, autoplay: true, muted: true });
          Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'cover' });
          $area.innerHTML = '';
          $area.appendChild(video);

          const constraints = {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          video.srcObject = stream;

          // tunggu kamera stabil
          await new Promise(r => setTimeout(r, 500));

          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          let raf = 0, stopped = false;

          const stop = () => {
            stopped = true;
            cancelAnimationFrame(raf);
            try { stream.getTracks().forEach(t => t.stop()); } catch(e) {}
            try { $area.innerHTML = ''; } catch(e) {}
          };

          const loop = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes?.length) {
                const txt = codes[0].rawValue || '';
                if (txt) { stop(); onScan(txt); return; }
              }
            } catch(e) {}
            raf = requestAnimationFrame(loop);
          };

          loop();
          scanner = { stop: async () => stop(), clear: () => { try { $area.innerHTML = ''; } catch(e) {} } };
          return scanner;
        } catch (e) {
          console.warn('BarcodeDetector gagal → fallback html5-qrcode', e);
        }
      }

      // ===============================
      // B) html5-qrcode fallback
      // ===============================
      await ensureHtml5();

      const formatsOpt = (window.Html5QrcodeSupportedFormats && Html5QrcodeSupportedFormats.QR_CODE)
        ? { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] }
        : {};

      const cfg = {
        fps: 30,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.33,
        rememberLastUsedCamera: true,
        disableFlip: true,
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        ...formatsOpt
      };

      const h5 = new Html5Qrcode('qr-area', { useBarCodeDetectorIfSupported: true });

      async function startWith(source) {
        await h5.start(source, cfg, (txt) => onScan(txt), () => {});
        // coba autofocus setelah start (jika didukung)
        try {
          await new Promise(r => setTimeout(r, 600));
          await h5.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }] }).catch(()=>{});
        } catch(e) {}
        return h5;
      }

      try {
        scanner = await startWith({ facingMode: 'environment' });
        return scanner;
      } catch (e1) {
        const camId = await pickBackCameraId();
        if (camId) {
          scanner = await startWith({ deviceId: { exact: camId } });
          return scanner;
        }
        throw e1;
      }

    } catch (err) {
      console.error(err);
      toast(cameraErrorMessage(err), 'danger');
      await stopQR();
    }
  }


  // --- 4. BINDING & EVENTS ---
  document.addEventListener('DOMContentLoaded', () => {
    const btnLogin = qs('#btn-login');
    const btnQR = qs('#btn-qr');
    const btnQR2 = qs('#btn-qr-alt');

    if (btnLogin) {
      btnLogin.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = qs('#login-user').value.trim();
        const pin = qs('#login-pin').value.trim();
        if (!id) return alert('IDを入力してください');
        
        setLoading(true, 'ログイン中…');
        try {
          const r = await api('login', { method: 'POST', body: { id, pass: pin } });
          if (r.ok) handleLoginSuccess(r.user);
          else { setLoading(false); alert(r.error); }
        } catch(e) { setLoading(false); alert("Error"); }
      });
    }

    if (btnQR) btnQR.addEventListener('click', (e) => { e.preventDefault(); startQR(); });
    if (btnQR2) btnQR2.addEventListener('click', (e) => { e.preventDefault(); startQR(); });
  });

})();
