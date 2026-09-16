/**
 * Importa a planilha de Cirurgias (.xlsx / .xls / .csv) — ex.: exportada do OneDrive/Excel.
 * Detecta cabeçalho (DATA, PACIENTE, CIRURGIA…) nas primeiras linhas, como no Apps Script.
 */
import * as XLSX from 'xlsx';
import { novaLinhaCirurgia } from '../utils/rowModel.js';
import { fmtDataPlanilhaCirurgias, parseDataPt } from '../utils/dates.js';
import { STATUS_MARCO } from '../utils/constants.js';

const COLunas = [
  { field: 'data', match: (h) => h === 'DATA' || h.startsWith('DATA ') },
  { field: 'paciente', match: (h) => h.includes('PACIENTE') },
  { field: 'cirurgia', match: (h) => h.includes('CIRURGIA') },
  { field: 'hospital', match: (h) => h.includes('HOSPITAL') },
  { field: 'm3m', match: (h) => /03\s*MESES|^3\s*MESES/.test(h) || h === '03M' },
  { field: 'm6m', match: (h) => /06\s*MESES|^6\s*MESES/.test(h) || h === '06M' },
  { field: 'm1a', match: (h) => /01\s*ANO|^1\s*ANO/.test(h) || h === '1A' },
];

function normHeader(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapColumns(headerRow) {
  const headers = headerRow.map(normHeader);
  const cols = {};
  for (const def of COLunas) {
    for (let i = 0; i < headers.length; i++) {
      if (cols[def.field] != null) continue;
      if (def.match(headers[i])) cols[def.field] = i;
    }
  }
  // posições fixas se cabeçalho incompleto (planilha Helen clássica)
  if (cols.paciente == null && headers.length >= 2) cols.paciente = 1;
  if (cols.data == null && headers.length >= 1) cols.data = 0;
  if (cols.cirurgia == null && headers.length >= 3) cols.cirurgia = 2;
  if (cols.hospital == null && headers.length >= 4) cols.hospital = 3;
  if (cols.m3m == null && headers.length >= 5) cols.m3m = 4;
  if (cols.m6m == null && headers.length >= 6) cols.m6m = 5;
  if (cols.m1a == null && headers.length >= 7) cols.m1a = 6;
  return cols;
}

function scoreHeader(headerRow) {
  const cols = mapColumns(headerRow);
  let score = 0;
  if (cols.paciente != null) score += 5;
  if (cols.cirurgia != null) score += 4;
  if (cols.data != null) score += 3;
  if (cols.hospital != null) score += 2;
  if (cols.m3m != null) score += 1;
  return { score, cols };
}

function formatDataCell(raw) {
  let v = raw;
  if (v instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return fmtDataPlanilhaCirurgias(`${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`);
  }
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const dc = XLSX.SSF.parse_date_code(v);
    if (dc) {
      const pad = (n) => String(n).padStart(2, '0');
      return fmtDataPlanilhaCirurgias(`${dc.y}-${pad(dc.m)}-${pad(dc.d)}`);
    }
  }
  v = String(v ?? '').trim();
  if (!v) return '';
  const iso = parseDataPt(v);
  if (iso) return fmtDataPlanilhaCirurgias(iso);
  return v;
}

function normalizarStatus(s) {
  const t = String(s || '').trim();
  if (!t) return 'Pendente';
  const hit = STATUS_MARCO.find((x) => x.toLowerCase() === t.toLowerCase());
  return hit || t;
}

function linhaFromRow(cells, cols, sheetRow) {
  const get = (field) => {
    const i = cols[field];
    return i == null ? '' : cells[i];
  };
  const paciente = String(get('paciente') ?? '').trim();
  if (!paciente) return null;

  return novaLinhaCirurgia({
    row: sheetRow,
    data: formatDataCell(get('data')),
    paciente,
    cirurgia: String(get('cirurgia') ?? '').trim(),
    hospital: String(get('hospital') ?? '').trim(),
    m3m: normalizarStatus(get('m3m')),
    m6m: normalizarStatus(get('m6m')),
    m1a: normalizarStatus(get('m1a')),
    exemplo: false,
  });
}

function sheetMatrix(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function escolherAba(wb) {
  const names = wb.SheetNames || [];
  const preferida = names.find((n) => /cirurg/i.test(n)) || names[0];
  let best = { name: preferida, matrix: sheetMatrix(wb, preferida), rows: 0 };

  for (const name of names) {
    const matrix = sheetMatrix(wb, name);
    if (matrix.length > best.rows) best = { name, matrix, rows: matrix.length };
  }
  return best;
}

function detectarCabecalho(matrix) {
  const max = Math.min(20, matrix.length);
  let best = { headerIdx: 0, cols: {}, score: 0 };

  for (let r = 0; r < max; r++) {
    const row = matrix[r];
    if (!row || !row.some((c) => String(c || '').trim())) continue;
    const { score, cols } = scoreHeader(row);
    if (score > best.score && cols.paciente != null) {
      best = { headerIdx: r, cols, score };
    }
  }
  return best;
}

function anosDasLinhas(linhas) {
  const anos = new Set();
  for (const l of linhas) {
    const iso = parseDataPt(l.data);
    if (iso) anos.add(iso.slice(0, 4));
    else {
      const m = String(l.data || '').match(/\b(20\d{2})\b/);
      if (m) anos.add(m[1]);
    }
  }
  return [...anos].sort();
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {{ linhas, aba, headerRow, total, anos, amostra }}
 */
export function parseCirurgiasXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const { name: aba, matrix } = escolherAba(wb);
  if (!matrix.length) throw new Error('planilha vazia');

  const { headerIdx, cols } = detectarCabecalho(matrix);
  if (cols.paciente == null) throw new Error('não achei a coluna PACIENTE — confira se é a planilha de cirurgias');

  const linhas = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (!cells || !cells.some((c) => String(c || '').trim())) continue;
    const linha = linhaFromRow(cells, cols, i + 1);
    if (linha) linhas.push(linha);
  }

  if (!linhas.length) throw new Error('nenhuma linha com paciente encontrada');

  const anos = anosDasLinhas(linhas);
  return {
    linhas,
    aba,
    headerRow: headerIdx + 1,
    total: linhas.length,
    anos,
    amostra: linhas.slice(0, 3).map((l) => `${l.paciente} · ${l.data || 'sem data'}`),
  };
}

export function resumoImportacao(info) {
  const anosTxt = info.anos.length ? info.anos.join(', ') : '—';
  return `${info.total} cirurgias · anos ${anosTxt} · aba “${info.aba}” · cabeçalho linha ${info.headerRow}`;
}
