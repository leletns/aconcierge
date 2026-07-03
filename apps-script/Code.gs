/**
 * Google Apps Script — Blue Central Helen
 * Deploy: Extensions > Apps Script, paste this file, set SHEETS_API_SECRET in Script Properties
 * Deploy > New deployment > Web app > Execute as Me > Anyone
 * Install onEdit trigger: run installTriggers() once
 */

const SHEET_NAME = 'Pacientes';
const META_SHEET = '_SyncMeta';
const API_SECRET_PROP = 'SHEETS_API_SECRET';

const HEADERS = [
  'id', 'nome', 'telefone', 'procedimento', 'dataCirurgia', 'fase', 'notion', 'obs',
  'recall_status', 'recall_proxima', 'recall_historico', 'exames', 'marcos',
  'modifiedAt', 'deleted',
];

function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty(API_SECRET_PROP) || '';
}

function validateSecret_(secret) {
  const expected = getSecret_();
  if (!expected || secret !== expected) {
    throw new Error('Unauthorized');
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getMetaSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(META_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET);
    sheet.hideSheet();
    sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    sheet.getRange(2, 1, 2, 2).setValues([['lastChange', '1970-01-01T00:00:00.000Z']]);
  }
  return sheet;
}

function setLastChange_() {
  const meta = getMetaSheet_();
  meta.getRange(2, 2).setValue(new Date().toISOString());
}

function getLastChange_() {
  const meta = getMetaSheet_();
  return meta.getRange(2, 2).getValue() || '1970-01-01T00:00:00.000Z';
}

function rowToObject_(row) {
  const obj = {};
  HEADERS.forEach((h, i) => { obj[h] = row[i] != null ? String(row[i]) : ''; });
  return obj;
}

function findRowById_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function objectToRow_(obj) {
  return HEADERS.map(h => obj[h] != null ? obj[h] : '');
}

function doGet(e) {
  try {
    const action = (e.parameter.action || 'health');
    validateSecret_(e.parameter.secret || '');

    if (action === 'health') {
      return jsonResponse_({ ok: true, service: 'blue-central-helen', lastChange: getLastChange_() });
    }

    if (action === 'sync') {
      const since = e.parameter.since || '1970-01-01T00:00:00.000Z';
      const records = syncRecord({ since: since, pullOnly: true });
      return jsonResponse_({ ok: true, records: records });
    }

    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return jsonResponse_({ error: err.message }, 400);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    validateSecret_(body.secret || '');

    const action = body.action;
    let result;

    switch (action) {
      case 'createRecord':
        result = createRecord(body.record);
        break;
      case 'updateRecord':
        result = updateRecord(body.record);
        break;
      case 'deleteRecord':
        result = deleteRecord(body.id);
        break;
      case 'syncRecord':
        result = syncRecord({ record: body.record });
        break;
      case 'batchSync':
        result = batchSync_(body.records || []);
        break;
      default:
        throw new Error('Unknown action: ' + action);
    }

    setLastChange_();
    return jsonResponse_({ ok: true, result: result });
  } catch (err) {
    return jsonResponse_({ error: err.message }, 400);
  }
}

function createRecord(record) {
  if (!record || !record.id) throw new Error('Record id required');
  const sheet = getSheet_();
  const row = findRowById_(sheet, record.id);
  if (row > 0) return updateRecord(record);

  record.modifiedAt = record.modifiedAt || new Date().toISOString();
  sheet.appendRow(objectToRow_(record));
  SpreadsheetApp.flush();
  return { id: record.id, created: true };
}

function updateRecord(record) {
  if (!record || !record.id) throw new Error('Record id required');
  const sheet = getSheet_();
  const row = findRowById_(sheet, record.id);
  if (row < 0) return createRecord(record);

  const existing = rowToObject_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
  const existingTime = new Date(existing.modifiedAt || 0).getTime();
  const incomingTime = new Date(record.modifiedAt || 0).getTime();

  if (incomingTime < existingTime) {
    return { id: record.id, skipped: true, reason: 'conflict: remote newer' };
  }

  record.modifiedAt = record.modifiedAt || new Date().toISOString();
  sheet.getRange(row, 1, 1, HEADERS.length).setValues([objectToRow_(record)]);
  SpreadsheetApp.flush();
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
  SpreadsheetApp.flush();
  return { id: id, deleted: true };
}

function syncRecord(opts) {
  opts = opts || {};
  const sheet = getSheet_();

  if (opts.pullOnly) {
    const since = new Date(opts.since || '1970-01-01T00:00:00.000Z').getTime();
    const data = sheet.getDataRange().getValues();
    const records = [];
    for (let i = 1; i < data.length; i++) {
      const obj = rowToObject_(data[i]);
      if (!obj.id) continue;
      const mod = new Date(obj.modifiedAt || 0).getTime();
      if (mod >= since) records.push(obj);
    }
    return records;
  }

  if (opts.record) {
    if (opts.record.deleted === 'TRUE' || opts.record.deleted === true) {
      return deleteRecord(opts.record.id);
    }
    const row = findRowById_(sheet, opts.record.id);
    return row > 0 ? updateRecord(opts.record) : createRecord(opts.record);
  }

  return { ok: true };
}

function batchSync_(records) {
  const results = [];
  records.forEach(r => {
    try {
      results.push(syncRecord({ record: r }));
    } catch (e) {
      results.push({ id: r.id, error: e.message });
    }
  });
  return results;
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (e.range.getRow() === 1) return;

  const row = e.range.getRow();
  const modCol = HEADERS.indexOf('modifiedAt') + 1;

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

function jsonResponse_(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function setupSecret() {
  PropertiesService.getScriptProperties().setProperty(API_SECRET_PROP, 'change-me-to-a-strong-secret');
}
