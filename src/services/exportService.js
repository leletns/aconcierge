import * as XLSX from 'xlsx';
import { fmtExportDate, exportFilenameTimestamp } from '../utils/dates.js';
import { formatPhoneDisplay } from '../utils/phone.js';
import { emPreOp, proximoMarco } from '../utils/patientModel.js';

const EXPORT_COLUMNS = [
  { key: 'nome', header: 'Nome' },
  { key: 'telefone', header: 'Telefone' },
  { key: 'procedimento', header: 'Procedimento' },
  { key: 'dataCirurgia', header: 'Data da Cirurgia' },
  { key: 'fase', header: 'Fase' },
  { key: 'recallStatus', header: 'Status Recall' },
  { key: 'recallProxima', header: 'Próxima Ação' },
  { key: 'tentativas', header: 'Tentativas de Contato' },
  { key: 'examesFeitos', header: 'Exames Feitos' },
  { key: 'examesPendentes', header: 'Exames Pendentes' },
  { key: 'proximoMarco', header: 'Próximo Marco' },
  { key: 'statusMarco', header: 'Status Marco' },
  { key: 'obs', header: 'Observações' },
];

function rowFromPatient(p) {
  const px = proximoMarco(p);
  return {
    nome: p.nome,
    telefone: formatPhoneDisplay(p.telefone) || p.telefone,
    procedimento: p.procedimento || '',
    dataCirurgia: fmtExportDate(p.dataCirurgia),
    fase: emPreOp(p) ? 'pré-op' : 'pós-op',
    recallStatus: p.recall?.status || '',
    recallProxima: fmtExportDate(p.recall?.proxima),
    tentativas: p.recall?.historico?.length || 0,
    examesFeitos: (p.exames || []).filter((e) => e.feito).map((e) => e.nome).join(' | '),
    examesPendentes: (p.exames || []).filter((e) => !e.feito).map((e) => e.nome).join(' | '),
    proximoMarco: px ? px.m.rotulo : '',
    statusMarco: px ? px.mc.status : '',
    obs: p.obs || '',
  };
}

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

/**
 * Export filtered patients to XLSX — reliable Blob download (all browsers)
 */
export function exportToXlsx(patients, opts = {}) {
  const { onProgress } = opts;
  if (!patients?.length) throw new Error('Nenhum registro para exportar');

  const headers = EXPORT_COLUMNS.map((c) => c.header);
  const rows = [headers];

  for (let i = 0; i < patients.length; i++) {
    const r = rowFromPatient(patients[i]);
    rows.push(EXPORT_COLUMNS.map((c) => r[c.key] ?? ''));
    if (onProgress && i % 200 === 0) onProgress(Math.round((i / patients.length) * 90));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = EXPORT_COLUMNS.map(() => ({ wch: 24 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');

  const filename = `Blue_Central_${exportFilenameTimestamp()}.xlsx`;
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(buffer, filename);

  if (onProgress) onProgress(100);
  return filename;
}

export { EXPORT_COLUMNS };
