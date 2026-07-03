export const hoje = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const isoHoje = () => hoje().toISOString().slice(0, 10);

export const paraData = (iso) => {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
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
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const difDias = (iso) => {
  const d = paraData(iso);
  if (!d) return null;
  return Math.round((d - hoje()) / 86400000);
};

export const normalizarData = (v) => {
  v = String(v || '').trim();
  if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
};

export const exportFilenameTimestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

export const nowISO = () => new Date().toISOString();
