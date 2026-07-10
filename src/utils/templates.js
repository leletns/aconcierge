/**
 * Templates de acompanhamento pós-operatório — totalmente editáveis pela Helen.
 *
 * - Template global por procedimento: lista de marcos { id, label, dias, col }.
 *   `col` (m3m/m6m/m1a) espelha o marco numa coluna real da planilha Cirurgias;
 *   marcos sem `col` vivem só no app (status guardado em extras).
 * - Override por paciente: substitui a lista de marcos apenas daquela paciente.
 */
import { DEFAULT_TEMPLATES, MARCO_SHEET_COLS } from './constants.js';
import { somarDias, difDias, parseDataPt } from './dates.js';
import { normalizeNome } from './matching.js';

export function templatesPadrao() {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
}

export function novoMarcoId() {
  return 'mk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function novoTemplateId() {
  return 'tpl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function templatePadrao(templates) {
  return templates.find((t) => t.padrao) || templates[0];
}

/**
 * Template efetivo de uma cirurgia:
 * 1. atribuição explícita (assignments[patientKey])
 * 2. nome do template contido no texto da cirurgia (ex.: "Botox", "Lipedema MMII…")
 * 3. template padrão
 */
export function templateParaCirurgia(cir, appConfig, patientKeyStr) {
  const templates = appConfig.templates || [];
  const assign = (appConfig.assignments || {})[patientKeyStr];
  if (assign) {
    const t = templates.find((x) => x.id === assign);
    if (t) return t;
  }
  const texto = normalizeNome(cir.cirurgia || '');
  for (const t of templates) {
    if (t.padrao) continue;
    const nomeTpl = normalizeNome(t.nome);
    if (nomeTpl && texto.includes(nomeTpl)) return t;
  }
  return templatePadrao(templates);
}

/**
 * Marcos efetivos de uma cirurgia (override por paciente > template),
 * com data calculada e status lido da planilha (colunas 03m/06m/1a) ou dos extras.
 * cir: linha espelhada da planilha Cirurgias; extras: dados app-only da paciente.
 */
export function marcosEfetivos(cir, appConfig, patientKeyStr, extras) {
  const override = (appConfig.overrides || {})[patientKeyStr];
  const tpl = templateParaCirurgia(cir, appConfig, patientKeyStr);
  const lista = override?.length ? override : tpl.marcos;
  const dataISO = parseDataPt(cir.data);
  const statusExtras = extras?.marcoStatus?.[cir.key] || {};

  return lista.map((m) => {
    const status = m.col && MARCO_SHEET_COLS.includes(m.col)
      ? cir[m.col] || 'Pendente'
      : statusExtras[m.id] || 'Pendente';
    return {
      ...m,
      dataISO: dataISO ? somarDias(dataISO, Number(m.dias) || 0) : '',
      status,
      templateId: override?.length ? null : tpl.id,
    };
  });
}

/** estado visual do marco no trilho */
export function estadoMarco(marco) {
  if (marco.status === 'Realizada') return 'feito';
  if (marco.status === 'Marcada') return 'agendado';
  if (marco.status === 'Sem resposta') return 'semresposta';
  if (marco.dataISO && difDias(marco.dataISO) < 0) return 'atrasado';
  return 'pendente';
}

/** primeiro marco ainda não realizado */
export function proximoMarco(marcos) {
  for (const m of marcos) {
    if (m.status !== 'Realizada') return m;
  }
  return null;
}

export function algumMarcoAtrasado(marcos) {
  return marcos.some((m) => estadoMarco(m) === 'atrasado');
}
