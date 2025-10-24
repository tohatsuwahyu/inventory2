// Data layer: LocalStorage default + pluggable Google Sheets API

const LS_KEYS = {
  items: "inv_items",
  stocks: "inv_stocks", // current qty per itemId
  users: "inv_users",
  logs: "inv_logs" // transactions history
};

const getLS = (k, fallback) => JSON.parse(localStorage.getItem(k) || JSON.stringify(fallback));
const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Seed demo if empty
export function seedIfEmpty() {
  if (!localStorage.getItem(LS_KEYS.items)) {
    setLS(LS_KEYS.items, [
      { id: "ITM-001", name: "アルミ板 A", desc: "厚さ2mm", gramPerPcs: 250, minStock: 10 },
      { id: "ITM-002", name: "銅線 B", desc: "φ1.0mm", gramPerPcs: 50, minStock: 100 },
      { id: "ITM-003", name: "ネジ C", desc: "M4x10", gramPerPcs: 5, minStock: 500 }
    ]);
  }
  if (!localStorage.getItem(LS_KEYS.stocks)) {
    setLS(LS_KEYS.stocks, { "ITM-001": 30, "ITM-002": 200, "ITM-003": 1200 });
  }
  if (!localStorage.getItem(LS_KEYS.users)) {
    setLS(LS_KEYS.users, [ { id: "u001", name: "山田" }, { id: "u002", name: "佐藤" } ]);
  }
  if (!localStorage.getItem(LS_KEYS.logs)) {
    setLS(LS_KEYS.logs, []);
  }
}

export function listItems() { return getLS(LS_KEYS.items, []); }
export function saveItems(items) { setLS(LS_KEYS.items, items); }

export function getStock(itemId) {
  const map = getLS(LS_KEYS.stocks, {});
  return Number(map[itemId] || 0);
}
export function setStock(itemId, qty) {
  const map = getLS(LS_KEYS.stocks, {});
  map[itemId] = Number(qty || 0);
  setLS(LS_KEYS.stocks, map);
}

export function listUsers() { return getLS(LS_KEYS.users, []); }
export function saveUsers(users) { setLS(LS_KEYS.users, users); }

export function addLog(entry) {
  const logs = getLS(LS_KEYS.logs, []);
  logs.unshift(entry); // newest first
  setLS(LS_KEYS.logs, logs);
}
export function listLogs() { return getLS(LS_KEYS.logs, []); }

// Transaction helpers
export function transact({ type, itemId, qty, userId, note }) {
  const current = getStock(itemId);
  const next = type === "IN" ? current + qty : current - qty;
  setStock(itemId, Math.max(0, next));
  addLog({ id: crypto.randomUUID?.() || Date.now(), ts: new Date().toISOString(), type, itemId, qty, userId, note });
}

// Google Sheets integration (optional)
// Replace endpoints via sheets.example.json and implement fetchers below if needed.
export const sheets = {
  enabled: false,
  endpoints: {
    items: "", stocks: "", users: "", logs: "", transact: "", so: ""
  }
};

export async function syncFromSheets() {
  if (!sheets.enabled) return;
  const [items, stocks, users, logs] = await Promise.all([
    fetch(sheets.endpoints.items).then(r=>r.json()),
    fetch(sheets.endpoints.stocks).then(r=>r.json()),
    fetch(sheets.endpoints.users).then(r=>r.json()),
    fetch(sheets.endpoints.logs).then(r=>r.json())
  ]);
  saveItems(items); setLS(LS_KEYS.stocks, stocks); saveUsers(users); setLS(LS_KEYS.logs, logs);
}

export async function pushTransactionToSheets(payload) {
  if (!sheets.enabled || !sheets.endpoints.transact) return;
  await fetch(sheets.endpoints.transact, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export async function pushSOToSheets(payload) {
  if (!sheets.enabled || !sheets.endpoints.so) return;
  await fetch(sheets.endpoints.so, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}
