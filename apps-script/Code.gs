/**
 * Blue Central — Google Apps Script
 * Planilha espelhada: o que a Helen edita aqui aparece no sistema e vice-versa.
 *
 * Setup (uma vez):
 * 1. Script Properties: SHEETS_API_SECRET, GEMINI_API_KEY
 * 2. Executar setupSheet() e installTriggers()
 * 3. Deploy Web App → Anyone
 */

const SHEET_NAME = 'Pacientes';
const META_SHEET = '_SyncMeta';
const API_SECRET_PROP = 'SHEETS_API_SECRET';
const GEMINI_KEY_PROP = 'GEMINI_API_KEY';

/** Colunas simples — fáceis de preencher no Sheets (como uma planilha normal) */
const HEADERS = [
  'id', 'nome', 'telefone', 'procedimento', 'data_cirurgia', 'fase',
  'observacoes', 'status_recall', 'proxima_acao', 'ultimo_contato', 'notion',
  'marco_7d', 'marco_1m', 'marco_3m', 'marco_6m', 'marco_1a',
  'exames_pendentes', 'modifiedAt', 'deleted',
];

const HEADER_LABELS = [
  'ID', 'Nome', 'Telefone', 'Procedimento', 'Data Cirurgia', 'Fase',
  'Observações', 'Status Recall', 'Próxima Ação', 'Último Contato', 'Notion',
  '7 dias', '1 mês', '3 meses', '6 meses', '1 ano',
  'Exames Pendentes', 'Atualizado em', 'Excluída',
];

function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty(API_SECRET_PROP) || '';
}

function getGeminiKey_() {
  return PropertiesService.getScriptProperties().getProperty(GEMINI_KEY_PROP) || '';
}

function validateSecret_(secret) {
  if (!getSecret_() || secret !== getSecret_()) throw new Error('Unauthorized');
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    setupSheet_();
  }
  return sheet;
}

function setupSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADER_LABELS.length).setValues([HEADER_LABELS]);
  sheet.getRange(1, 1, 1, HEADER_LABELS.length)
    .setFontWeight('bold')
    .setBackground('#EAEFF5')
    .setFontFamily('Montserrat');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(7, 220);
  SpreadsheetApp.getActiveSpreadsheet().toast('Planilha Blue Central pronta — preencha a partir da linha 2', 'blue.', 5);
}

function setupSheet() { setupSheet_(); }

function getMetaSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(META_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET);
    sheet.hideSheet();
    sheet.getRange(1, 1, 2, 2).setValues([['key', 'value'], ['lastChange', '1970-01-01T00:00:00.000Z']]);
  }
  return sheet;
}

function setLastChange_() {
  getMetaSheet_().getRange(2, 2).setValue(new Date().toISOString());
}

function rowToObject_(row) {
  const obj = {};
  HEADERS.forEach((h, i) => { obj[h] = row[i] != null ? String(row[i]) : ''; });
  return obj;
}

function findRowById_(sheet, id) {
  if (!id) return -1;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function findRowByNome_(sheet, nome) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === String(nome).toLowerCase()) return i + 1;
  }
  return -1;
}

function objectToRow_(obj) {
  return HEADERS.map(h => obj[h] != null ? obj[h] : '');
}

function newId_() {
  return 'p' + new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 5);
}

function doGet(e) {
  try {
    const action = e.parameter.action || 'health';
    validateSecret_(e.parameter.secret || '');

    if (action === 'health') {
      return jsonResponse_({ ok: true, service: 'blue-central', sheet: SHEET_NAME });
    }
    if (action === 'sync') {
      const since = e.parameter.since || '1970-01-01T00:00:00.000Z';
      return jsonResponse_({ ok: true, records: pullRecords_(since) });
    }
    if (action === 'fullSync') {
      return jsonResponse_({ ok: true, records: pullRecords_('1970-01-01T00:00:00.000Z', true) });
    }
    if (action === 'summarize') {
      const id = e.parameter.id;
      const record = getRecordById_(id);
      if (!record) throw new Error('Paciente não encontrada');
      return jsonResponse_({ ok: true, summary: geminiSummarize_(record) });
    }
    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    validateSecret_(body.secret || '');
    let result;

    switch (body.action) {
      case 'createRecord': result = createRecord(body.record); break;
      case 'updateRecord': result = updateRecord(body.record); break;
      case 'deleteRecord': result = deleteRecord(body.id); break;
      case 'syncRecord': result = syncRecord({ record: body.record }); break;
      case 'batchSync': result = batchSync_(body.records || []); break;
      case 'summarize':
        result = geminiSummarize_(body.record || getRecordById_(body.id));
        break;
      default: throw new Error('Unknown action: ' + body.action);
    }

    setLastChange_();
    return jsonResponse_({ ok: true, result: result, summary: result.text || undefined });
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

function getRecordById_(id) {
  const sheet = getSheet_();
  const row = findRowById_(sheet, id);
  if (row < 0) return null;
  return rowToObject_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
}

function pullRecords_(since, includeDeleted) {
  const sheet = getSheet_();
  const sinceTime = new Date(since).getTime();
  const data = sheet.getDataRange().getValues();
  const records = [];

  for (let i = 1; i < data.length; i++) {
    const obj = rowToObject_(data[i]);
    if (!obj.nome && !obj.id) continue;
    if (!obj.id && obj.nome) {
      obj.id = newId_();
      sheet.getRange(i + 1, 1).setValue(obj.id);
    }
    if (!includeDeleted && (obj.deleted === 'TRUE' || obj.deleted === 'true')) continue;
    const mod = new Date(obj.modifiedAt || 0).getTime();
    if (mod >= sinceTime || since === '1970-01-01T00:00:00.000Z') records.push(obj);
  }
  return records;
}

function createRecord(record) {
  if (!record) throw new Error('Record required');
  if (!record.id) record.id = newId_();
  const sheet = getSheet_();
  if (findRowById_(sheet, record.id) > 0) return updateRecord(record);

  record.modifiedAt = record.modifiedAt || new Date().toISOString();
  record.deleted = record.deleted || 'FALSE';
  sheet.appendRow(objectToRow_(record));
  return { id: record.id, created: true };
}

function updateRecord(record) {
  if (!record || !record.id) throw new Error('Record id required');
  const sheet = getSheet_();
  let row = findRowById_(sheet, record.id);
  if (row < 0 && record.nome) row = findRowByNome_(sheet, record.nome);
  if (row < 0) return createRecord(record);

  const existing = rowToObject_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  const existingTime = new Date(existing.modifiedAt || 0).getTime();
  const incomingTime = new Date(record.modifiedAt || 0).getTime();
  if (incomingTime < existingTime) {
    return { id: record.id, skipped: true, reason: 'conflict' };
  }

  record.modifiedAt = record.modifiedAt || new Date().toISOString();
  sheet.getRange(row, 1, 1, HEADERS.length).setValues([objectToRow_(record)]);
  return { id: record.id, updated: true };
}

function deleteRecord(id) {
  const sheet = getSheet_();
  const row = findRowById_(sheet, id);
  if (row < 0) return { id: id, deleted: false };
  const record = rowToObject_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  record.deleted = 'TRUE';
  record.modifiedAt = new Date().toISOString();
  sheet.getRange(row, 1, 1, HEADERS.length).setValues([objectToRow_(record)]);
  return { id: id, deleted: true };
}

function syncRecord(opts) {
  opts = opts || {};
  if (opts.pullOnly) return pullRecords_(opts.since || '1970-01-01T00:00:00.000Z');
  if (opts.record) {
    if (opts.record.deleted === 'TRUE' || opts.record.deleted === true) return deleteRecord(opts.record.id);
    const sheet = getSheet_();
    const row = findRowById_(sheet, opts.record.id);
    return row > 0 ? updateRecord(opts.record) : createRecord(opts.record);
  }
  return { ok: true };
}

function batchSync_(records) {
  return records.map(r => {
    try { return syncRecord({ record: r }); }
    catch (e) { return { id: r.id, error: e.message }; }
  });
}

/** Gemini — mesmo estilo do resumo do Google Sheets */
function geminiSummarize_(record) {
  const key = getGeminiKey_();
  const data = typeof record === 'object' ? record : getRecordById_(record);
  if (!data) throw new Error('Sem dados da paciente');

  if (!key) {
    return { text: buildLocalSummary_(data), provider: 'local' };
  }

  const prompt =
    'Você é a assistente de uma concierge de cirurgia plástica (blue.). ' +
    'Gere um resumo claro em português brasileiro, no estilo Gemini do Google Sheets, com estas seções:\n\n' +
    'Resumo da Paciente\n• Nome\n• Procedimento\n• Status\n• Pendências\n• Próximo passo\n• Observações importantes\n\n' +
    'Dados:\n' + JSON.stringify(data, null, 2);

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 1024 },
    }),
    muteHttpExceptions: true,
  });

  const json = JSON.parse(res.getContentText());
  if (json.error) throw new Error(json.error.message || 'Erro Gemini');
  const text = json.candidates && json.candidates[0] && json.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Resposta vazia');
  return { text: text.trim(), provider: 'gemini-sheets' };
}

function buildLocalSummary_(r) {
  return [
    'Resumo da Paciente', '',
    '• Nome: ' + (r.nome || '—'),
    '• Procedimento: ' + (r.procedimento || '—'),
    '• Status: ' + (r.fase || '—') + (r.status_recall ? ' · Recall: ' + r.status_recall : ''),
    '• Pendências: ' + (r.exames_pendentes || '—'),
    '• Próximo passo: ' + (r.proxima_acao || '—'),
    '• Observações importantes: ' + (r.observacoes || '—'),
  ].join('\n');
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  const row = e.range.getRow();
  if (row <= 1) return;

  const idCol = 1;
  const nomeCol = 2;
  const modCol = HEADERS.indexOf('modifiedAt') + 1;
  const id = sheet.getRange(row, idCol).getValue();
  const nome = sheet.getRange(row, nomeCol).getValue();

  if (nome && !id) {
    sheet.getRange(row, idCol).setValue(newId_());
  }
  if (e.range.getColumn() !== modCol) {
    sheet.getRange(row, modCol).setValue(new Date().toISOString());
  }
  setLastChange_();
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('blue.')
    .addItem('✨ Resumir paciente selecionada', 'menuSummarizeSelection')
    .addItem('Preparar planilha', 'setupSheet')
    .addItem('Instalar sync automático', 'installTriggers')
    .addToUi();
}

function menuSummarizeSelection() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const row = sheet.getActiveCell().getRow();
  if (row <= 1) return;
  const record = rowToObject_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  const result = geminiSummarize_(record);
  SpreadsheetApp.getUi().alert('Resumo — ' + record.nome, result.text, SpreadsheetApp.getUi().ButtonSet.OK);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function setupSecret() {
  PropertiesService.getScriptProperties().setProperty(API_SECRET_PROP, Utilities.getUuid());
}

function setupGeminiKey() {
  // Cole sua chave: PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', 'AIza...');
}
