import { seedIfEmpty, listItems } from './data.js';
import { downloadCSV, printPage } from './utils.js';
import { renderDashboard, renderTransactions, renderSO, renderLogs, renderItems } from './ui.js';

seedIfEmpty();

document.getElementById('y').textContent = new Date().getFullYear();

type Router = () => void; // for editors

const routes = {
  '#/': () => renderDashboard(document.getElementById('app')),
  '#/in': () => renderTransactions(document.getElementById('app'), 'IN'),
  '#/out': () => renderTransactions(document.getElementById('app'), 'OUT'),
  '#/so': () => renderSO(document.getElementById('app')),
  '#/logs': () => renderLogs(document.getElementById('app')),
  '#/items': () => renderItems(document.getElementById('app')),
};

function navigate() {
  const hash = location.hash || '#/';
  (routes[hash] || routes['#/'])();
}

window.addEventListener('hashchange', navigate);
window.addEventListener('load', navigate);

document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', (e) => {
  const link = e.currentTarget.getAttribute('data-link');
  if (link) location.hash = link;
}));

// Export & Print

document.getElementById('btn-export').addEventListener('click', () => {
  // Export all items + current stock to CSV
  const items = listItems();
  const rows = [["ItemID","Name","Desc","GramPerPcs","MinStock","CurrentStock"]];
  items.forEach(it => {
    const current = JSON.parse(localStorage.getItem('inv_stocks')||'{}')[it.id]||0;
    rows.push([it.id, it.name, it.desc||'', it.gramPerPcs, it.minStock, current]);
  });
  downloadCSV(rows, 'inventory.csv');
});

document.getElementById('btn-print').addEventListener('click', printPage);
