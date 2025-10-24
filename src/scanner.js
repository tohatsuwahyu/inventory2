// html5-qrcode integration
let qrcodeScanner = null;

export function openScanner(onScan) {
  const el = document.getElementById('reader');
  if (!el) return;
  const { Html5Qrcode } = window;
  if (!Html5Qrcode) { alert('Scanner lib not loaded'); return; }
  qrcodeScanner = new Html5Qrcode('reader');
  qrcodeScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      // Use decodedText as Item ID (supports QR/Barcode depending on device)
      onScan(decodedText);
      closeScanner();
    },
    (errorMsg) => { /* ignore frame errors */ }
  );
}

export function closeScanner() {
  if (qrcodeScanner) {
    qrcodeScanner.stop().then(() => qrcodeScanner.clear());
    qrcodeScanner = null;
  }
}
