/**
 * blue. Central — Google Apps Script (dual-sheet)
 *
 * Sincroniza o app da Helen com as DUAS planilhas reais:
 *   Recall    — "GESTÃO DE RECALL — PACIENTES"  (cabeçalho linha 5, dados linha 6+)
 *   Cirurgias — "Cirurgias BLUE (controle Helen)" (cabeçalho linha 1, dados linha 2+)
 *
 * Setup (uma vez):
 * 1. Extensões → Apps Script em QUALQUER uma das planilhas (ou script standalone)
 * 2. Configurações do projeto → Propriedades do script:
 *      SHEETS_API_SECRET  = senha longa (mesma usada no app)
 *      GEMINI_API_KEY     = chave do Google AI Studio (para ✨ Resumir)
 *      RECALL_SHEET_ID    = 1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU
 *      CIRURGIAS_SHEET_ID = 1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI
 * 3. Executar installTriggers() e beautifySheets() no editor (autorizar)
 * 4. Implantar → Nova implantação → App da Web → Executar como: Eu · Acesso: Qualquer pessoa
 *
 * beautifySheets() aplica SÓ formatação (cores, freeze, filtros) — nunca altera valores.
 * Recall: título com células mescladas — congela só linhas, não colunas.
 */

var PROPS = PropertiesService.getScriptProperties();
var CACHE = CacheService.getScriptCache();

var META_SHEET = '_SyncMeta';
var CONFIG_SHEET = '_Config';

/** colunas canônicas ↔ cabeçalhos reais (tolerante a acentos/quebras de linha)
 *  Ordem importa: matches específicos ANTES dos genéricos
 *  (ex.: "DATA DO CONTATO" antes de "CONTATO")
 */
var RECALL_FIELDS = [
  { field: 'nome', match: 'PACIENTE' },
  { field: 'dataContato', match: 'DATA DO CONTATO' },
  { field: 'proximoContato', match: 'PROXIMO' },
  { field: 'dataAgendada', match: 'AGENDADA' },
  { field: 'ultimaConsulta', match: 'ULTIMA' },
  { field: 'motivoRecusa', match: 'MOTIVO' },
  { field: 'status', match: 'STATUS' },
  { field: 'obs', match: 'OBSERVA' },
  // CONTATO por último — evita pegar "DATA DO CONTATO"
  { field: 'contato', match: 'CONTATO', exclude: 'DATA DO CONTATO' },
];

/** Fallback posicional da planilha Recall (A–I) se o cabeçalho falhar */
var RECALL_POS = [
  ['nome', 1],
  ['contato', 2],
  ['ultimaConsulta', 3],
  ['dataAgendada', 4],
  ['status', 5],
  ['motivoRecusa', 6],
  ['dataContato', 7],
  ['proximoContato', 8],
  ['obs', 9],
];

var CIRURGIAS_FIELDS = [
  { field: 'data', match: 'DATA' },
  { field: 'paciente', match: 'PACIENTE' },
  { field: 'cirurgia', match: 'CIRURGIA' },
  { field: 'hospital', match: 'HOSPITAL' },
  { field: 'm3m', match: '03 MESES' },
  { field: 'm6m', match: '06 MESES' },
  { field: 'm1a', match: '01 ANO' },
];

/* ================= util ================= */

function norm_(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[\n\r]/g, ' ')
    .replace(/[ÁÀÂÃ]/g, 'A')
    .replace(/[ÉÊ]/g, 'E')
    .replace(/[Í]/g, 'I')
    .replace(/[ÓÔÕ]/g, 'O')
    .replace(/[Ú]/g, 'U')
    .replace(/[Ç]/g, 'C')
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function validateSecret_(secret) {
  var real = PROPS.getProperty('SHEETS_API_SECRET') || '';
  if (!real || secret !== real) throw new Error('Unauthorized');
}

function nowISO_() {
  return new Date().toISOString();
}

/* ================= acesso às planilhas ================= */

var DEFAULT_RECALL_ID = '1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU';
var DEFAULT_CIRURGIAS_ID = '1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI';

function getSpreadsheet_(kind) {
  var prop = kind === 'recall' ? 'RECALL_SHEET_ID' : 'CIRURGIAS_SHEET_ID';
  var fallback = kind === 'recall' ? DEFAULT_RECALL_ID : DEFAULT_CIRURGIAS_ID;
  var id = PROPS.getProperty(prop) || fallback;
  return SpreadsheetApp.openById(id);
}

/** localiza a aba de dados e a linha de cabeçalho
 *  Recall (planilha real da Helen): cabeçalho CONGELADO na linha 5, dados a partir da 6.
 *  Cirurgias: cabeçalho na linha 1.
 */
function findDataSheet_(ss, kind) {
  var sheets = ss.getSheets();

  // Atalho garantido para Recall oficial: linha 5 com PACIENTE + STATUS
  if (kind === 'recall') {
    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      var nome = sheet.getName();
      if (nome === META_SHEET || nome === CONFIG_SHEET) continue;
      if (sheet.getLastRow() < 5) continue;
      var lastCol = Math.min(14, Math.max(1, sheet.getLastColumn()));
      var header5 = sheet.getRange(5, 1, 1, lastCol).getDisplayValues()[0].map(norm_);
      var temPaciente = header5.some(function (h) { return h.indexOf('PACIENTE') >= 0; });
      var temStatus = header5.some(function (h) { return h.indexOf('STATUS') >= 0; });
      var temContato = header5.some(function (h) { return h.indexOf('CONTATO') >= 0; });
      if (temPaciente && (temStatus || temContato)) {
        return { sheet: sheet, headerRow: 5 };
      }
    }
  }

  var candidatos = [];
  for (var s2 = 0; s2 < sheets.length; s2++) {
    var sheet2 = sheets[s2];
    var nome2 = sheet2.getName();
    if (nome2 === META_SHEET || nome2 === CONFIG_SHEET) continue;
    var max = Math.min(12, sheet2.getLastRow());
    if (max < 1) continue;
    var lastCol2 = Math.min(14, Math.max(1, sheet2.getLastColumn()));
    var valores = sheet2.getRange(1, 1, max, lastCol2).getDisplayValues();
    for (var r = 0; r < valores.length; r++) {
      var rowNorm = valores[r].map(norm_);
      var temPaciente2 = rowNorm.some(function (h) { return h.indexOf('PACIENTE') >= 0; });
      if (!temPaciente2) continue;

      var score = 0;
      if (kind === 'recall') {
        if (rowNorm.some(function (h) { return h.indexOf('STATUS') >= 0; })) score += 3;
        if (rowNorm.some(function (h) { return h.indexOf('CONTATO') >= 0; })) score += 2;
        if (rowNorm.some(function (h) { return h.indexOf('PROXIMO') >= 0; })) score += 2;
        if (rowNorm.some(function (h) { return h.indexOf('AGENDADA') >= 0; })) score += 1;
        if (r + 1 === 5) score += 10; // peso alto — estrutura oficial
      } else {
        if (rowNorm.some(function (h) { return h.indexOf('CIRURGIA') >= 0; })) score += 4;
        if (rowNorm.some(function (h) { return h.indexOf('HOSPITAL') >= 0; })) score += 2;
        if (rowNorm.some(function (h) { return h.indexOf('MESES') >= 0 || h.indexOf('ANO') >= 0; })) score += 2;
        if (r === 0) score += 3;
      }
      candidatos.push({ sheet: sheet2, headerRow: r + 1, score: score });
    }
  }

  if (candidatos.length) {
    candidatos.sort(function (a, b) { return b.score - a.score; });
    return { sheet: candidatos[0].sheet, headerRow: candidatos[0].headerRow };
  }
  return { sheet: ss.getSheets()[0], headerRow: kind === 'recall' ? 5 : 1 };
}

/** mapa field → coluna (1-based) a partir do cabeçalho real */
function mapColumns_(sheet, headerRow, fields) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0].map(norm_);
  var mapa = {};
  fields.forEach(function (f) {
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (!h) continue;
      var usado = Object.keys(mapa).some(function (k) { return mapa[k] === c + 1; });
      if (usado) continue;
      if (f.exclude && h.indexOf(f.exclude) >= 0) continue;
      if (h.indexOf(f.match) >= 0) {
        mapa[f.field] = c + 1;
        break;
      }
    }
  });
  return mapa;
}

function getSheetContext_(kind) {
  var ss = getSpreadsheet_(kind);
  var found = findDataSheet_(ss, kind);
  var fields = kind === 'recall' ? RECALL_FIELDS : CIRURGIAS_FIELDS;
  var cols = mapColumns_(found.sheet, found.headerRow, fields);
  var lastCol = found.sheet.getLastColumn();

  if (kind === 'cirurgias') {
    [['m3m', 5], ['m6m', 6], ['m1a', 7]].forEach(function (par) {
      if (!cols[par[0]] && lastCol >= par[1]) cols[par[0]] = par[1];
    });
  }
  if (kind === 'recall') {
    RECALL_POS.forEach(function (par) {
      if (!cols[par[0]] && lastCol >= par[1]) cols[par[0]] = par[1];
    });
  }

  return {
    kind: kind,
    ss: ss,
    sheet: found.sheet,
    headerRow: found.headerRow,
    cols: cols,
    fields: fields,
    mappedCount: Object.keys(cols).length,
  };
}

/* ================= meta / lastChange ================= */

function getMetaSheet_(ss) {
  var sheet = ss.getSheetByName(META_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET);
    sheet.hideSheet();
    sheet.getRange(1, 1, 2, 2).setValues([
      ['lastChange', '1970-01-01T00:00:00.000Z'],
      ['rowMeta', '{}'],
    ]);
  }
  return sheet;
}

function bumpLastChange_(ss, rows) {
  var meta = getMetaSheet_(ss);
  var agora = nowISO_();
  meta.getRange(1, 2).setValue(agora);
  if (rows && rows.length) {
    var rowMeta = {};
    try { rowMeta = JSON.parse(meta.getRange(2, 2).getValue() || '{}'); } catch (e) {}
    rows.forEach(function (r) { rowMeta[r] = agora; });
    meta.getRange(2, 2).setValue(JSON.stringify(rowMeta));
  }
  CACHE.put('lastChange', agora, 21600);
  return agora;
}

function getRowMeta_(ss) {
  try {
    return JSON.parse(getMetaSheet_(ss).getRange(2, 2).getValue() || '{}');
  } catch (e) {
    return {};
  }
}

/** lastChange global (as duas planilhas + config) — via cache para polls baratos */
function getLastChange_() {
  var cached = CACHE.get('lastChange');
  if (cached) return cached;
  var valores = ['recall', 'cirurgias'].map(function (kind) {
    return String(getMetaSheet_(getSpreadsheet_(kind)).getRange(1, 2).getValue() || '');
  });
  var lc = valores.sort().pop() || '1970-01-01T00:00:00.000Z';
  CACHE.put('lastChange', lc, 21600);
  return lc;
}

/* ================= leitura ================= */

function pullRows_(ctx) {
  var sheet = ctx.sheet;
  var inicio = ctx.headerRow + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < inicio) return [];

  var lastCol = Math.max(1, sheet.getLastColumn());
  var valores = sheet.getRange(inicio, 1, lastRow - inicio + 1, lastCol).getDisplayValues();
  var rowMeta = getRowMeta_(ctx.ss);
  var rows = [];

  for (var i = 0; i < valores.length; i++) {
    var numero = inicio + i;
    var obj = { row: numero, modifiedAt: rowMeta[numero] || '' };
    var vazia = true;
    ctx.fields.forEach(function (f) {
      var col = ctx.cols[f.field];
      var v = col ? String(valores[i][col - 1] || '') : '';
      obj[f.field] = v;
      if (v) vazia = false;
    });
    if (!vazia) rows.push(obj);
  }
  return rows;
}

function buildPayload_() {
  var recall = getSheetContext_('recall');
  var cirurgias = getSheetContext_('cirurgias');
  return {
    ok: true,
    changed: true,
    lastChange: getLastChange_(),
    recall: {
      titulo: recall.ss.getName(),
      sheetName: recall.sheet.getName(),
      headerRow: recall.headerRow,
      cols: recall.cols,
      mappedCount: recall.mappedCount,
      rows: pullRows_(recall),
    },
    cirurgias: {
      titulo: cirurgias.ss.getName(),
      sheetName: cirurgias.sheet.getName(),
      headerRow: cirurgias.headerRow,
      cols: cirurgias.cols,
      mappedCount: cirurgias.mappedCount,
      rows: pullRows_(cirurgias),
    },
    appConfig: getAppConfig_(),
  };
}

/* ================= _Config (templates de acompanhamento) ================= */

function getConfigSheet_() {
  var ss = getSpreadsheet_('cirurgias');
  var sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET);
    sheet.hideSheet();
    sheet.getRange(1, 1, 2, 2).setValues([
      ['appConfig', '{}'],
      ['modifiedAt', ''],
    ]);
  }
  return sheet;
}

function getAppConfig_() {
  try {
    var sheet = getConfigSheet_();
    var json = JSON.parse(sheet.getRange(1, 2).getValue() || '{}');
    json.modifiedAt = json.modifiedAt || String(sheet.getRange(2, 2).getValue() || '');
    return json;
  } catch (e) {
    return {};
  }
}

function setAppConfig_(appConfig) {
  var sheet = getConfigSheet_();
  appConfig = appConfig || {};
  appConfig.modifiedAt = appConfig.modifiedAt || nowISO_();
  sheet.getRange(1, 2).setValue(JSON.stringify(appConfig));
  sheet.getRange(2, 2).setValue(appConfig.modifiedAt);
  bumpLastChange_(getSpreadsheet_('cirurgias'), null);
  return { saved: true };
}

/* ================= escrita ================= */

/**
 * Escreve valor sem deslocar datas por fuso UTC.
 * Datas (dd/mm/aaaa ou texto tipo "seg., 05 jan. 2026") vão como TEXTO puro.
 */
function setCellSafe_(range, value) {
  var v = value == null ? '' : value;
  var s = String(v);
  var pareceData =
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s) ||
    /^\d{4}-\d{2}-\d{2}/.test(s) ||
    /\d{1,2}\s+(?:de\s+)?[a-zç.]{3,}/i.test(s);
  if (pareceData) {
    range.setNumberFormat('@');
    range.setValue(s);
  } else {
    range.setValue(v);
  }
}

function applyEdit_(op) {
  var ctx = getSheetContext_(op.sheet);
  var col = ctx.cols[op.field];
  if (!col) return { key: op.key, error: 'coluna desconhecida: ' + op.field };
  var row = Number(op.row);
  if (!row || row <= ctx.headerRow) return { key: op.key, error: 'linha inválida' };

  // conflito por modifiedAt: se a planilha foi editada DEPOIS da edição do app, planilha vence
  var rowMeta = getRowMeta_(ctx.ss);
  if (op.ts && rowMeta[row] && rowMeta[row] > op.ts) {
    return { key: op.key, skipped: true, reason: 'conflict' };
  }

  setCellSafe_(ctx.sheet.getRange(row, col), op.value);
  bumpLastChange_(ctx.ss, [row]);
  return { key: op.key, updated: true };
}

function applyAppend_(op) {
  var ctx = getSheetContext_(op.sheet);
  var row = Math.max(ctx.sheet.getLastRow() + 1, ctx.headerRow + 1);
  var lastCol = Math.max(1, ctx.sheet.getLastColumn());
  var linha = new Array(lastCol).fill('');
  ctx.fields.forEach(function (f) {
    var col = ctx.cols[f.field];
    if (col && op.cells && op.cells[f.field] != null) linha[col - 1] = op.cells[f.field];
  });
  // força texto nas colunas que parecem data, célula a célula (evita -1 dia UTC)
  for (var c = 0; c < linha.length; c++) {
    if (linha[c] !== '') setCellSafe_(ctx.sheet.getRange(row, c + 1), linha[c]);
  }
  bumpLastChange_(ctx.ss, [row]);
  return { key: op.key, appendedRow: row };
}

/* ================= web app ================= */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'health';
    validateSecret_((e && e.parameter && e.parameter.secret) || '');

    if (action === 'health') {
      return jsonResponse_({
        ok: true,
        service: 'blue-central-dual',
        recall: getSpreadsheet_('recall').getName(),
        cirurgias: getSpreadsheet_('cirurgias').getName(),
      });
    }
    if (action === 'fullSync') {
      return jsonResponse_(buildPayload_());
    }
    if (action === 'sync') {
      var since = e.parameter.since || '';
      var lc = getLastChange_();
      if (since && lc <= since) {
        return jsonResponse_({ ok: true, changed: false, lastChange: lc });
      }
      return jsonResponse_(buildPayload_());
    }
    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return jsonResponse_({ error: err.message });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    validateSecret_(body.secret || '');

    if (body.action === 'push') {
      var results = (body.ops || []).map(function (op) {
        try {
          if (op.type === 'edit') return applyEdit_(op);
          if (op.type === 'append') return applyAppend_(op);
          if (op.type === 'config') return setAppConfig_(op.appConfig);
          return { error: 'op desconhecida: ' + op.type };
        } catch (err) {
          return { key: op.key, error: err.message };
        }
      });
      return jsonResponse_({ ok: true, results: results, lastChange: getLastChange_() });
    }
    if (body.action === 'setConfig') {
      return jsonResponse_({ ok: true, result: setAppConfig_(body.appConfig) });
    }
    if (body.action === 'summarize') {
      return jsonResponse_({ ok: true, summary: geminiSummarize_(body.record) });
    }
    throw new Error('Unknown action: ' + body.action);
  } catch (err) {
    return jsonResponse_({ error: err.message });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/* ================= triggers (edições manuais no Sheets) ================= */

function onSheetEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var nome = sheet.getName();
  if (nome === META_SHEET || nome === CONFIG_SHEET) return;
  var linhas = [];
  for (var r = e.range.getRow(); r <= e.range.getLastRow(); r++) linhas.push(r);
  bumpLastChange_(e.source, linhas);
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onSheetEdit' || t.getHandlerFunction() === 'onEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ['recall', 'cirurgias'].forEach(function (kind) {
    ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(getSpreadsheet_(kind)).onEdit().create();
  });
}

/* ================= beautify — SÓ formatação, nunca valores ================= */

/** Planilhas com células mescladas quebram freeze/filtro — cada passo é opcional. */
function beautifyTry_(label, fn) {
  try {
    fn();
    return true;
  } catch (e) {
    Logger.log('beautify [' + label + ']: ' + e.message);
    return false;
  }
}

function beautifyRecallOnly() {
  beautifyOne_(getSheetContext_('recall'), beautifyOptsRecall_());
}

function beautifyCirurgiasOnly() {
  beautifyOne_(getSheetContext_('cirurgias'), beautifyOptsCirurgias_());
}

function beautifyOptsRecall_() {
  return {
    header: '#4A6484',
    headerFont: '#FFFFFF',
    banda: '#F4F1EB',
    statusCol: 'status',
    statusCores: {
      'Agendado': '#EDF3EF',
      'Pendente': '#F8F0E4',
      'Sem Resposta': '#F6E9E6',
      'Em Acompanhamento': '#EAEFF5',
      'Não agendou': '#F1F0EC',
      'Sem interesse': '#F1F0EC',
    },
  };
}

function beautifyOptsCirurgias_() {
  return {
    header: '#4A6484',
    headerFont: '#FFFFFF',
    banda: '#F4F1EB',
    statusCol: null,
    marcoCols: ['m3m', 'm6m', 'm1a'],
    statusCores: {
      'Realizada': '#EDF3EF',
      'Marcada': '#EAEFF5',
      'Pendente': '#F8F0E4',
      'Sem resposta': '#F6E9E6',
    },
  };
}

function beautifySheets() {
  var ok = 0;
  var avisos = [];
  [['recall', beautifyOptsRecall_()], ['cirurgias', beautifyOptsCirurgias_()]].forEach(function (par) {
    try {
      var aviso = beautifyOne_(getSheetContext_(par[0]), par[1]);
      ok++;
      if (aviso) avisos.push(par[0] + ': ' + aviso);
    } catch (e) {
      avisos.push(par[0] + ': ' + e.message);
      Logger.log('beautify ' + par[0] + ': ' + e.message);
    }
  });
  var msg = ok + '/2 planilhas formatadas';
  if (avisos.length) msg += ' · ' + avisos.join(' · ');
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'blue.', 10);
  } catch (e) {
    Logger.log(msg);
  }
}

/**
 * Formata uma aba. Nunca altera valores. Nunca lança erro por freeze/filtro/mesclagem.
 * @returns {string} aviso curto ou '' se tudo ok
 */
function beautifyOne_(ctx, opts) {
  var sheet = ctx.sheet;
  var lastRow = Math.max(sheet.getLastRow(), ctx.headerRow + 1);
  var lastCol = Math.max(1, sheet.getLastColumn());
  var numDataRows = Math.max(1, lastRow - ctx.headerRow);
  var avisos = [];

  // título (Recall linhas 1–4) — ignora se mesclagem impedir
  if (ctx.headerRow > 1) {
    beautifyTry_('titulo', function () {
      sheet.getRange(1, 1, ctx.headerRow - 1, lastCol)
        .setFontFamily('Montserrat')
        .setBackground('#FDFCFA');
    });
  }

  beautifyTry_('cabecalho', function () {
    sheet.getRange(ctx.headerRow, 1, 1, lastCol)
      .setFontWeight('bold')
      .setFontFamily('Montserrat')
      .setBackground(opts.header)
      .setFontColor(opts.headerFont)
      .setVerticalAlignment('middle');
  });

  // NÃO congela linhas/colunas — Recall tem mesclagens que quebram freeze
  beautifyTry_('descongelar', function () {
    sheet.setFrozenRows(0);
    sheet.setFrozenColumns(0);
  });

  beautifyTry_('dados', function () {
    sheet.getRange(ctx.headerRow + 1, 1, numDataRows, lastCol)
      .setFontFamily('Montserrat')
      .setVerticalAlignment('middle')
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  });

  beautifyTry_('banda', function () {
    sheet.getBandings().forEach(function (b) { b.remove(); });
    if (numDataRows < 1) return;
    var banda = sheet.getRange(ctx.headerRow + 1, 1, numDataRows, lastCol)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
    banda.setFirstRowColor('#FDFCFA');
    banda.setSecondRowColor(opts.banda);
  });

  beautifyTry_('filtro', function () {
    var filtro = sheet.getFilter();
    if (filtro) filtro.remove();
    sheet.getRange(ctx.headerRow, 1, numDataRows + 1, lastCol).createFilter();
  });

  beautifyTry_('status', function () {
    var regras = [];
    var alvoCols = opts.marcoCols
      ? opts.marcoCols.map(function (f) { return ctx.cols[f]; }).filter(Boolean)
      : (ctx.cols[opts.statusCol] ? [ctx.cols[opts.statusCol]] : []);
    alvoCols.forEach(function (col) {
      var range = sheet.getRange(ctx.headerRow + 1, col, numDataRows, 1);
      Object.keys(opts.statusCores).forEach(function (valor) {
        regras.push(
          SpreadsheetApp.newConditionalFormatRule()
            .whenTextEqualTo(valor)
            .setBackground(opts.statusCores[valor])
            .setRanges([range])
            .build(),
        );
      });
    });
    if (regras.length) sheet.setConditionalFormatRules(regras);
  });

  beautifyTry_('larguras', function () {
    if (ctx.cols.nome) sheet.setColumnWidth(ctx.cols.nome, 230);
    if (ctx.cols.paciente) sheet.setColumnWidth(ctx.cols.paciente, 230);
    if (ctx.cols.cirurgia) sheet.setColumnWidth(ctx.cols.cirurgia, 300);
    if (ctx.cols.obs) sheet.setColumnWidth(ctx.cols.obs, 320);
  });

  try {
    ctx.ss.toast('Formatação OK — ' + ctx.ss.getName(), 'blue.', 4);
  } catch (e) {}

  return avisos.join('; ');
}

/* ================= Gemini ✨ ================= */

function geminiSummarize_(record) {
  var key = PROPS.getProperty('GEMINI_API_KEY') || '';
  if (!record) throw new Error('Sem dados da paciente');

  if (!key) return { text: buildLocalSummary_(record), provider: 'local' };

  var prompt;
  if (record._tipo === 'gestao') {
    // card de gestão: análise executiva curta a partir dos agregados calculados no app
    prompt =
      'Você é analista da clínica blue. (cirurgia plástica). A partir dos números agregados abaixo, ' +
      'escreva UM parágrafo executivo (máx. 3 frases, português brasileiro, sem markdown) para a gestão: ' +
      'destaque o principal ponto positivo, o principal gargalo e uma ação recomendada para a concierge.\n\n' +
      JSON.stringify(record, null, 2);
  } else {
    prompt =
      'Você é a assistente da Helen, concierge médica da clínica blue. (cirurgia plástica, Dr. Rafael). ' +
      'Gere um resumo claro em português brasileiro com estas seções:\n\n' +
      'Resumo da Paciente\n• Nome\n• Procedimento / Cirurgia\n• Situação do recall\n• Revisões (marcos)\n• Próximo passo sugerido\n• Observações importantes\n\n' +
      'Dados (JSON):\n' + JSON.stringify(record, null, 2);
  }

  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1024 },
      }),
      muteHttpExceptions: true,
    },
  );

  var json = JSON.parse(res.getContentText());
  if (json.error) throw new Error(json.error.message || 'Erro Gemini');
  var text = json.candidates && json.candidates[0] && json.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Resposta vazia do Gemini');
  return { text: text.trim(), provider: 'gemini' };
}

function buildLocalSummary_(r) {
  return [
    'Resumo da Paciente', '',
    '• Nome: ' + (r.nome || '—'),
    '• Procedimento / Cirurgia: ' + (r.cirurgia || r.ultimaConsulta || '—'),
    '• Situação do recall: ' + (r.statusRecall || '—'),
    '• Retornos: ' + (r.marcos || '—'),
    '• Próximo passo: ' + (r.proximoContato || '—'),
    '• Observações importantes: ' + (r.obs || '—'),
  ].join('\n');
}

/* ================= menu ================= */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('blue.')
      .addItem('🎨 Embelezar as 2 planilhas', 'beautifySheets')
      .addItem('🎨 Só Recall', 'beautifyRecallOnly')
      .addItem('🎨 Só Cirurgias', 'beautifyCirurgiasOnly')
      .addItem('🔁 Instalar sync automático', 'installTriggers')
      .addToUi();
  } catch (e) {}
}

function setupSecret() {
  PROPS.setProperty('SHEETS_API_SECRET', Utilities.getUuid());
}
