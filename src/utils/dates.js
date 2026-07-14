/**
 * Datas em calendário America/Sao_Paulo (Brasil).
 * Evita o clássico "um dia a menos" quando o Mac/browser está em UTC
 * ou quando o Sheets interpreta Date em fuso errado.
 */
export const TZ_CLINICA = 'America/Sao_Paulo';

/** yyyy-mm-dd de "hoje" no fuso da clínica (não no fuso do browser) */
export const isoHoje = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ_CLINICA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch (_) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
};

/** Date local (meia-noite) da data civil ISO — NUNCA use new Date("yyyy-mm-dd") */
export const paraData = (iso) => {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const a = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  if (!a || !mes || !d) return null;
  return new Date(a, mes - 1, d);
};

/** "hoje" civil no fuso da clínica, como Date local à meia-noite */
export const hoje = () => paraData(isoHoje());

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

/** dd/MM/yyyy for export / planilha Recall */
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
  d.setDate(d.getDate() + (Number(n) || 0));
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Diferença em dias civis: 0 = hoje, negativo = passado, positivo = futuro */
export const difDias = (iso) => {
  const d = paraData(iso);
  const h = hoje();
  if (!d || !h) return null;
  return Math.round((d - h) / 86400000);
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
 * Interpreta qualquer formato de data das planilhas da Helen.
 * Retorna ISO yyyy-mm-dd ou '' quando não é data.
 */
export const parseDataPt = (v) => {
  v = String(v || '').trim();
  if (!v) return '';

  // já ISO
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // dd/mm/yyyy (aceita // e -)
  m = v.match(/(\d{1,2})[/\-.]+(\d{1,2})[/\-.]+(\d{2,4})/);
  if (m) {
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  // "05 jan. 2026" | "09 de Jan 2026" | "17 de Abril 2026" | "Sex, 09 de Jan 2026"
  m = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})\.?\s*(?:de\s+)?(\d{4})/);
  if (m) {
    const mesKey = m[2];
    const mes = MESES_PT[mesKey] || MESES_PT[mesKey.slice(0, 3)];
    if (mes) {
      return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }

  // "29/05" sem ano → ano civil da clínica
  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (m) {
    return `${isoHoje().slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
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
  // carimbo no fuso da clínica
  const iso = isoHoje();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_CLINICA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hh = parts.find((p) => p.type === 'hour')?.value || '00';
  const mm = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${iso}_${hh}-${mm}`;
};

export const nowISO = () => new Date().toISOString();

/** Rótulo longo de hoje no fuso da clínica (pt-BR) */
export const hojeLabelLonga = () => {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ_CLINICA,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  } catch (_) {
    return fmtLonga(isoHoje());
  }
};
