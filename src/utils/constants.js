/**
 * Vocabulário real das duas planilhas da Helen.
 * Recall  — "GESTÃO DE RECALL — PACIENTES" (cabeçalho linha 5, dados linha 6+)
 * Cirurgias — "Cirurgias BLUE (controle Helen)" (cabeçalho linha 1, dados linha 2+)
 */

export const STATUS_RECALL = [
  'Pendente',
  'Agendado',
  'Não agendou',
  'Sem Resposta',
  'Em Acompanhamento',
  'Sem interesse',
];

export const MOTIVOS_RECUSA = ['', 'Outros', 'Distância', 'Agenda incompatível', 'Sem interesse'];

export const STATUS_MARCO = ['Pendente', 'Marcada', 'Realizada', 'Sem resposta'];

/** Colunas da grade Recall — espelho fiel da planilha */
export const RECALL_COLS = [
  { field: 'nome', label: 'Paciente', type: 'text', width: 220 },
  { field: 'contato', label: 'Contato (WhatsApp)', type: 'phone', width: 190 },
  { field: 'ultimaConsulta', label: 'Última Consulta / Procedimento', type: 'text', width: 150 },
  { field: 'dataAgendada', label: 'Data Agendada', type: 'datelivre', width: 130 },
  { field: 'status', label: 'Status', type: 'select', options: STATUS_RECALL, width: 165 },
  { field: 'motivoRecusa', label: 'Motivo da Recusa', type: 'select', options: MOTIVOS_RECUSA, width: 150 },
  { field: 'dataContato', label: 'Data do Contato', type: 'datelivre', width: 130 },
  { field: 'proximoContato', label: 'Próximo Contato', type: 'datelivre', width: 130 },
  { field: 'obs', label: 'Observações', type: 'longtext', width: 300 },
];

/** Colunas da grade Cirurgias — os rótulos dos marcos vêm da config (renomeáveis) */
export const CIRURGIAS_COLS = [
  { field: 'data', label: 'Data', type: 'dataPt', width: 165 },
  { field: 'paciente', label: 'Paciente', type: 'text', width: 220 },
  { field: 'cirurgia', label: 'Cirurgia', type: 'longtext', width: 300 },
  { field: 'hospital', label: 'Hospital', type: 'text', width: 130 },
  { field: 'm3m', label: '03 meses', type: 'select', options: STATUS_MARCO, width: 130 },
  { field: 'm6m', label: '06 meses', type: 'select', options: STATUS_MARCO, width: 130 },
  { field: 'm1a', label: '01 ano', type: 'select', options: STATUS_MARCO, width: 130 },
];

/** Colunas da planilha Cirurgias que espelham marcos do template */
export const MARCO_SHEET_COLS = ['m3m', 'm6m', 'm1a'];

/** @deprecated use examesDoProtocolo() — mantido como fallback genérico */
export { EXAMES_GENERICOS as EXAMES_PADRAO } from './preopProtocol.js';

/** URLs padrão das planilhas (sempre disponíveis no botão "abrir no Google") */
export const DEFAULT_RECALL_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU/edit';
export const DEFAULT_CIRURGIAS_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI/edit';
export const DEFAULT_RECALL_SHEET_ID = '1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU';
export const DEFAULT_CIRURGIAS_SHEET_ID = '1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI';

/**
 * Templates padrão de acompanhamento — Helen edita tudo em ⚙ Acompanhamentos.
 * `col` liga o marco a uma coluna real da planilha Cirurgias (m3m/m6m/m1a) — ou null (só no app).
 */
export const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-cirurgia',
    nome: 'Cirurgia (padrão)',
    padrao: true,
    marcos: [
      { id: 'm3m', label: '03 meses', dias: 90, col: 'm3m' },
      { id: 'm6m', label: '06 meses', dias: 180, col: 'm6m' },
      { id: 'm1a', label: '01 ano', dias: 365, col: 'm1a' },
    ],
  },
  {
    id: 'tpl-botox',
    nome: 'Botox',
    padrao: false,
    marcos: [
      { id: 'b15', label: '15 dias', dias: 15, col: null },
      { id: 'b90', label: '90 dias', dias: 90, col: 'm3m' },
      { id: 'b180', label: '180 dias', dias: 180, col: 'm6m' },
    ],
  },
  {
    id: 'tpl-lipedema',
    nome: 'Lipedema',
    padrao: false,
    marcos: [
      { id: 'l90', label: '90 dias', dias: 90, col: 'm3m' },
      { id: 'l180', label: '180 dias', dias: 180, col: 'm6m' },
      { id: 'l365', label: '365 dias', dias: 365, col: 'm1a' },
    ],
  },
];

export const STORAGE_KEY = 'blue_central_helen_v3';
export const CONFIG_KEY = 'blue_central_config';
export const QUEUE_KEY = 'blue_sync_queue_v3';
export const LEMBRETES_KEY = 'blue_lembretes_v1';

/** WhatsApp do suporte (Rafael) — botão "suporte" abre conversa direta */
export const SUPORTE_WHATSAPP = '5521996533803';

/**
 * Lembretes — mesmo vocabulário do app Lembretes do Mac.
 * `peso` segue o PRIORITY do iCalendar (RFC 5545): 1 alta · 5 média · 9 baixa.
 */
export const PRIORIDADES_LEMBRETE = [
  { id: 'nenhuma', label: 'nenhuma', sinais: '', peso: 0 },
  { id: 'baixa', label: 'baixa', sinais: '!', peso: 9 },
  { id: 'media', label: 'média', sinais: '!!', peso: 5 },
  { id: 'alta', label: 'alta', sinais: '!!!', peso: 1 },
];

/** Frequências de repetição — `rrule` é o equivalente iCalendar (app Lembretes) */
export const REPETICAO_LEMBRETE = [
  { id: 'nunca', label: 'nunca', rrule: '' },
  { id: 'diario', label: 'todos os dias', rrule: 'FREQ=DAILY' },
  { id: 'semanal', label: 'toda semana', rrule: 'FREQ=WEEKLY' },
  { id: 'quinzenal', label: 'a cada 2 semanas', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  { id: 'mensal', label: 'todo mês', rrule: 'FREQ=MONTHLY' },
  { id: 'anual', label: 'todo ano', rrule: 'FREQ=YEARLY' },
];
