export const hoje = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const isoHoje = () => {
  const d = hoje();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const paraData = (iso) => {
  if (!iso) return null;
  const [a, m, d] = String(iso).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
};

export const fmt = (iso) => {
  const d = paraData(iso);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
};

export const fmtLonga = (iso) => {
  const d = paraData(iso);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** dd/MM/yyyy for export */
export const fmtExportDate = (iso) => {
  const d = paraData(iso);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
};

export const somarDias = (iso, n) => {
  const d = paraData(iso);
  if (!d) return '';
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const difDias = (iso) => {
  const d = paraData(iso);
  if (!d) return null;
  return Math.round((d - hoje()) / 86400000);
};

const MESES_PT = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, março: 3, marco: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

/**
 * Interpreta qualquer formato de data que aparece nas planilhas da Helen:
 *   "2026-01-05" · "05/01/2026" · "29/05//2026" · "29/05" (sem ano)
 *   "seg., 05 jan. 2026" · "Sex, 09 de Jan 2026" · "Sex 17 de Abril 2026" · "Ter, 19 de maio 2026"
 * Retorna ISO yyyy-mm-dd ou '' quando não é data.
 */
export const parseDataPt = (v) => {
  v = String(v || '').trim();
  if (!v) return '';

  let m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = v.match(/(\d{1,2})[/\-.]+(\d{1,2})[/\-.]+(\d{2,4})/);
  if (m) {
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  // "05 jan. 2026" | "09 de Jan 2026" | "17 de Abril 2026"
  m = v
    .toLowerCase()
    .match(/(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\.?\s*(?:de\s+)?(\d{4})/);
  if (m && MESES_PT[m[2]]) {
    return `${m[3]}-${String(MESES_PT[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  // "29/05" sem ano → assume ano corrente
  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (m) {
    return `${hoje().getFullYear()}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  return '';
};

/** compat com código anterior */
export const normalizarData = parseDataPt;

const DIAS_ABREV = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const MESES_ABREV = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** ISO → "seg., 05 jan. 2026" (formato da coluna Data da planilha Cirurgias) */
export const fmtDataPlanilhaCirurgias = (iso) => {
  const d = paraData(iso);
  if (!d) return '';
  const dia = String(d.getDate()).padStart(2, '0');
  return `${DIAS_ABREV[d.getDay()]}, ${dia} ${MESES_ABREV[d.getMonth()]} ${d.getFullYear()}`;
};

/** ISO → dd/mm/aaaa (formato das colunas de data da planilha Recall) */
export const fmtDataPlanilhaRecall = (iso) => fmtExportDate(iso);

export const exportFilenameTimestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

export const nowISO = () => new Date().toISOString();
