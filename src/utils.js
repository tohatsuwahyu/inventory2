// 単位変換とユーティリティ
export const weightToQty = (totalGram, gramPerPcs) => {
  if (!gramPerPcs || gramPerPcs <= 0) return 0;
  return Math.floor((Number(totalGram) || 0) / gramPerPcs);
};

export const qtyToWeight = (qty, gramPerPcs) => {
  return (Number(qty) || 0) * (Number(gramPerPcs) || 0);
};

export const formatDateTime = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const downloadCSV = (rows, filename = "export.csv") => {
  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = rows.map(r => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export const printPage = () => window.print();

export const uid = () => Math.random().toString(36).slice(2, 10);
