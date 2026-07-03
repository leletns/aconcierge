/** @typedef {'7d'|'1m'|'3m'|'6m'|'1a'} MarcoId */

export const MARCOS = [
  { id: '7d', rotulo: '7 dias', dias: 7 },
  { id: '1m', rotulo: '1 mês', dias: 30 },
  { id: '3m', rotulo: '3 meses', dias: 90 },
  { id: '6m', rotulo: '6 meses', dias: 180 },
  { id: '1a', rotulo: '1 ano', dias: 365 },
];

export const EXAMES_PADRAO = [
  'hemograma completo',
  'coagulograma',
  'glicemia de jejum',
  'ureia e creatinina',
  'TGO / TGP',
  'TSH',
  'eletrocardiograma (ECG)',
  'risco cirúrgico',
  'sorologias',
  'beta hCG',
];

export const STATUS_RECALL = [
  'aguardando contato',
  'em contato',
  'reativada',
  'sem resposta',
  'arquivada',
];

export const STATUS_MARCO = ['a agendar', 'agendado', 'realizado', 'faltou'];

export const STORAGE_KEY = 'blue_central_helen';
export const CONFIG_KEY = 'blue_central_config';
