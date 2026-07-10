import * as XLSX from 'xlsx';
import { exportFilenameTimestamp } from '../utils/dates.js';
import { RECALL_COLS, CIRURGIAS_COLS } from '../utils/constants.js';

function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);
}

function sheetFrom(rows, colunas, headerLabel) {
  const headers = colunas.map((c) => (headerLabel && headerLabel(c.field)) || c.label);
  const data = [headers, ...rows.map((r) => colunas.map((c) => String(r[c.field] ?? '')))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = colunas.map((c) => ({ wch: Math.min(40, Math.max(14, Math.round(c.width / 8))) }));
  return ws;
}

/**
 * Exporta as duas planilhas num único XLSX (aba Recall + aba Cirurgias),
 * espelhando exatamente o que está nas grades. Download via Blob.
 */
export function exportToXlsx({ recallRows, cirurgiaRows, headerLabel }) {
  if (!recallRows?.length && !cirurgiaRows?.length) {
    throw new Error('Nenhum registro para exportar');
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(recallRows || [], RECALL_COLS, null), 'Recall');
  XLSX.utils.book_append_sheet(wb, sheetFrom(cirurgiaRows || [], CIRURGIAS_COLS, headerLabel), 'Cirurgias');

  const filename = `Blue_Central_${exportFilenameTimestamp()}.xlsx`;
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(buffer, filename);
  return filename;
}
