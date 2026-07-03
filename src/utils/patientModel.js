import { MARCOS, EXAMES_PADRAO } from './constants.js';
import { uid } from './helpers.js';
import { somarDias, difDias, hoje, isoHoje, nowISO, normalizarData } from './dates.js';
import { normalizePhone } from './phone.js';

export function gerarMarcos(p) {
  MARCOS.forEach((m) => {
    if (!p.marcos[m.id]) {
      p.marcos[m.id] = { status: 'a agendar', data: somarDias(p.dataCirurgia, m.dias) };
    } else {
      p.marcos[m.id].data = somarDias(p.dataCirurgia, m.dias);
    }
  });
}

export function novoPaciente(base) {
  const p = Object.assign(
    {
      id: uid(),
      nome: '',
      telefone: '',
      procedimento: '',
      dataCirurgia: '',
      fase: 'preop',
      notion: '',
      obs: '',
      exames: EXAMES_PADRAO.map((n) => ({ nome: n, feito: false })),
      marcos: {},
      recall: { status: 'aguardando contato', proxima: '', historico: [] },
      exemplo: false,
      modifiedAt: nowISO(),
      deleted: false,
    },
    base || {},
  );
  if (p.telefone) p.telefone = normalizePhone(p.telefone);
  if (p.dataCirurgia) gerarMarcos(p);
  return p;
}

export function touchPatient(p) {
  p.modifiedAt = nowISO();
  return p;
}

export function estadoMarco(p, m) {
  const mc = p.marcos[m.id];
  if (!mc) return 'pendente';
  if (mc.status === 'realizado') return 'feito';
  if (mc.status === 'agendado') return 'agendado';
  if (difDias(mc.data) < 0) return 'atrasado';
  return 'pendente';
}

export function proximoMarco(p) {
  for (const m of MARCOS) {
    const mc = p.marcos[m.id];
    if (mc && mc.status !== 'realizado' && mc.status !== 'faltou') return { m, mc };
  }
  return null;
}

export function emPosOp(p) {
  return p.fase === 'posop' || (p.dataCirurgia && difDias(p.dataCirurgia) < 0);
}

export function emPreOp(p) {
  return p.dataCirurgia && difDias(p.dataCirurgia) >= 0;
}

export function ultimoContato(p) {
  const h = p.recall?.historico || [];
  return h.length ? h[h.length - 1] : null;
}

export function semearExemplos() {
  const d = isoHoje();
  const a = novoPaciente({
    nome: 'Mariana Duarte (exemplo)',
    telefone: '21999990001',
    procedimento: 'LipeDefinition',
    dataCirurgia: somarDias(d, -40),
    fase: 'posop',
    exemplo: true,
  });
  a.marcos['7d'].status = 'realizado';
  a.marcos['1m'].status = 'agendado';

  const b = novoPaciente({
    nome: 'Carla Menezes (exemplo)',
    telefone: '21999990002',
    procedimento: 'Sublift',
    dataCirurgia: somarDias(d, 9),
    fase: 'preop',
    exemplo: true,
  });
  b.exames = b.exames.map((e, i) => ({ ...e, feito: i < 6 }));

  const c = novoPaciente({
    nome: 'Fernanda Alves (exemplo)',
    telefone: '21999990003',
    procedimento: 'LipeDefinition',
    dataCirurgia: somarDias(d, -400),
    fase: 'posop',
    exemplo: true,
  });
  c.marcos['7d'].status = 'realizado';
  c.marcos['1m'].status = 'realizado';
  c.marcos['3m'].status = 'realizado';
  c.marcos['6m'].status = 'realizado';
  c.recall = {
    status: 'aguardando contato',
    proxima: d,
    historico: [{ data: somarDias(d, -15), canal: 'whatsapp', resultado: 'não respondeu', nota: '' }],
  };

  return [a, b, c];
}

export function mergePatient(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const lTime = new Date(local.modifiedAt || 0).getTime();
  const rTime = new Date(remote.modifiedAt || 0).getTime();
  if (rTime > lTime) return { ...local, ...remote, marcos: { ...local.marcos, ...remote.marcos }, recall: { ...local.recall, ...remote.recall } };
  if (lTime > rTime) return local;
  return { ...remote, ...local };
}

function normalizeFase(f) {
  const s = String(f || '').toLowerCase();
  if (s.includes('pós') || s.includes('pos')) return 'posop';
  return 'preop';
}

function examesPendentesText(p) {
  return (p.exames || []).filter((e) => !e.feito).map((e) => e.nome).join(', ');
}

function applyExamesPendentes(p, text) {
  if (!text) return;
  const pendentes = String(text).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  p.exames.forEach((e) => {
    e.feito = !pendentes.some((pend) => pend.toLowerCase() === e.nome.toLowerCase());
  });
  pendentes.forEach((nome) => {
    if (!p.exames.find((e) => e.nome.toLowerCase() === nome.toLowerCase())) {
      p.exames.push({ nome, feito: false });
    }
  });
}

/** Planilha simples — colunas que a Helen preenche manualmente no Google Sheets */
export function patientToSheetRow(p) {
  const row = {
    id: p.id,
    nome: p.nome,
    telefone: p.telefone,
    procedimento: p.procedimento,
    data_cirurgia: p.dataCirurgia,
    fase: p.fase === 'posop' ? 'pós-op' : 'pré-op',
    observacoes: p.obs || '',
    status_recall: p.recall?.status || '',
    proxima_acao: p.recall?.proxima || '',
    ultimo_contato: ultimoContato(p) ? `${ultimoContato(p).data} · ${ultimoContato(p).resultado}` : '',
    notion: p.notion || '',
    exames_pendentes: examesPendentesText(p),
    modifiedAt: p.modifiedAt || nowISO(),
    deleted: p.deleted ? 'TRUE' : 'FALSE',
  };
  MARCOS.forEach((m) => {
    row['marco_' + m.id] = p.marcos?.[m.id]?.status || 'a agendar';
  });
  return row;
}

export function sheetRowToPatient(row) {
  if (!row) return null;
  const id = row.id || row.ID;
  if (!id && !row.nome) return null;

  const dataRaw = row.data_cirurgia || row.dataCirurgia || '';
  const dataCirurgia = normalizarData(dataRaw) || dataRaw;

  const p = novoPaciente({
    id: id || uid(),
    nome: row.nome || '',
    telefone: row.telefone || '',
    procedimento: row.procedimento || '',
    dataCirurgia: dataCirurgia,
    fase: normalizeFase(row.fase),
    notion: row.notion || '',
    obs: row.observacoes || row.obs || '',
    modifiedAt: row.modifiedAt || nowISO(),
    deleted: row.deleted === true || row.deleted === 'TRUE',
    exemplo: false,
  });

  p.recall.status = row.status_recall || row.recall_status || p.recall.status;
  p.recall.proxima = normalizarData(row.proxima_acao || row.recall_proxima || '') || row.proxima_acao || row.recall_proxima || '';

  MARCOS.forEach((m) => {
    const st = row['marco_' + m.id];
    if (st) {
      if (!p.marcos[m.id]) p.marcos[m.id] = { status: st, data: somarDias(p.dataCirurgia || isoHoje(), m.dias) };
      else p.marcos[m.id].status = st;
    }
  });

  if (row.exames_pendentes) applyExamesPendentes(p, row.exames_pendentes);

  // compatibilidade JSON legado
  try {
    if (row.exames && String(row.exames).startsWith('[')) p.exames = JSON.parse(row.exames);
  } catch (_) {}
  try {
    if (row.marcos && String(row.marcos).startsWith('{')) Object.assign(p.marcos, JSON.parse(row.marcos));
  } catch (_) {}
  try {
    if (row.recall_historico) p.recall.historico = JSON.parse(row.recall_historico);
  } catch (_) {}

  if (p.dataCirurgia) gerarMarcos(p);
  return p;
}

export { MARCOS, difDias, hoje };
