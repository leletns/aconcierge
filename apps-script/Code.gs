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
 */

var PROPS = PropertiesService.getScriptProperties();
var CACHE = CacheService.getScriptCache();

var META_SHEET = '_SyncMeta';
var CONFIG_SHEET = '_Config';

/** colunas canônicas ↔ cabeçalhos reais (tolerante a acentos/quebras de linha) */
var RECALL_FIELDS = [
  { field: 'nome', match: 'PACIENTE' },
  { field: 'contato', match: 'CONTATO' },
  { field: 'ultimaConsulta', match: 'ULTIMA' },
  { field: 'dataAgendada', match: 'AGENDADA' },
  { field: 'status', match: 'STATUS' },
  { field: 'motivoRecusa', match: 'MOTIVO' },
  { field: 'dataContato', match: 'DATA DO CONTATO' },
  { field: 'proximoContato', match: 'PROXIMO' },
  { field: 'obs', match: 'OBSERVA' },
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

function getSpreadsheet_(kind) {
  var prop = kind === 'recall' ? 'RECALL_SHEET_ID' : 'CIRURGIAS_SHEET_ID';
  var id = PROPS.getProperty(prop);
  if (!id) throw new Error('Script Property ' + prop + ' não configurada');
  return SpreadsheetApp.openById(id);
}

/** localiza a aba de dados e a linha de cabeçalho (Recall: linha 5 · Cirurgias: linha 1) */
function findDataSheet_(ss, kind) {
  var alvo = kind === 'recall' ? 'PACIENTE' : 'PACIENTE';
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var nome = sheet.getName();
    if (nome === META_SHEET || nome === CONFIG_SHEET) continue;
    var max = Math.min(10, sheet.getLastRow());
    if (max < 1) continue;
    var valores = sheet.getRange(1, 1, max, Math.min(12, Math.max(1, sheet.getLastColumn()))).getDisplayValues();
    for (var r = 0; r < valores.length; r++) {
      for (var c = 0; c < valores[r].length; c++) {
        if (norm_(valores[r][c]).indexOf(alvo) >= 0) {
          return { sheet: sheet, headerRow: r + 1 };
        }
      }
    }
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
      if (!usado && h.indexOf(f.match) >= 0) {
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
  if (kind === 'cirurgias') {
    // Helen pode renomear os cabeçalhos dos marcos — fallback posicional (colunas 5/6/7)
    var lastCol = found.sheet.getLastColumn();
    [['m3m', 5], ['m6m', 6], ['m1a', 7]].forEach(function (par) {
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
    recall: { titulo: recall.ss.getName(), headerRow: recall.headerRow, rows: pullRows_(recall) },
    cirurgias: { titulo: cirurgias.ss.getName(), headerRow: cirurgias.headerRow, rows: pullRows_(cirurgias) },
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

  ctx.sheet.getRange(row, col).setValue(op.value);
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
  ctx.sheet.getRange(row, 1, 1, lastCol).setValues([linha]);
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

function beautifySheets() {
  beautifyOne_(getSheetContext_('recall'), {
    header: '#4A6484',
    headerFont: '#FFFFFF',
    banda: '#F4F1EB',
    freezeCols: 1,
    statusCol: 'status',
    statusCores: {
      'Agendado': '#EDF3EF',
      'Pendente': '#F8F0E4',
      'Sem Resposta': '#F6E9E6',
      'Em Acompanhamento': '#EAEFF5',
      'Não agendou': '#F1F0EC',
      'Sem interesse': '#F1F0EC',
    },
  });
  beautifyOne_(getSheetContext_('cirurgias'), {
    header: '#4A6484',
    headerFont: '#FFFFFF',
    banda: '#F4F1EB',
    freezeCols: 2,
    statusCol: null,
    marcoCols: ['m3m', 'm6m', 'm1a'],
    statusCores: {
      'Realizada': '#EDF3EF',
      'Marcada': '#EAEFF5',
      'Pendente': '#F8F0E4',
      'Sem resposta': '#F6E9E6',
    },
  });
}

function beautifyOne_(ctx, opts) {
  var sheet = ctx.sheet;
  var lastRow = Math.max(sheet.getLastRow(), ctx.headerRow + 1);
  var lastCol = Math.max(1, sheet.getLastColumn());

  // bloco de título acima do cabeçalho (Recall: "GESTÃO DE RECALL — PACIENTES")
  if (ctx.headerRow > 1) {
    sheet.getRange(1, 1, ctx.headerRow - 1, lastCol).setFontFamily('Montserrat').setBackground('#FDFCFA');
    if (ctx.headerRow >= 4) {
      sheet.getRange(2, 1, 1, lastCol).setFontSize(14).setFontWeight('bold').setFontColor('#4A6484');
      sheet.getRange(3, 1, 1, lastCol).setFontSize(9).setFontStyle('italic').setFontColor('#6E7681');
    }
  }

  var header = sheet.getRange(ctx.headerRow, 1, 1, lastCol);
  header
    .setFontWeight('bold')
    .setFontFamily('Montserrat')
    .setBackground(opts.header)
    .setFontColor(opts.headerFont)
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(ctx.headerRow);
  if (opts.freezeCols) sheet.setFrozenColumns(opts.freezeCols);

  var dados = sheet.getRange(ctx.headerRow + 1, 1, lastRow - ctx.headerRow, lastCol);
  dados
    .setFontFamily('Montserrat')
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  // zebra creme/papel (formatação condicional de status tem prioridade sobre a banda)
  sheet.getBandings().forEach(function (b) { b.remove(); });
  var banda = dados.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  banda.setFirstRowColor('#FDFCFA');
  banda.setSecondRowColor(opts.banda);

  // filtro nativo no cabeçalho
  var filtro = sheet.getFilter();
  if (filtro) filtro.remove();
  sheet.getRange(ctx.headerRow, 1, lastRow - ctx.headerRow + 1, lastCol).createFilter();

  // cores por status (formatação condicional — não altera valores)
  var regras = [];
  var alvoCols = opts.marcoCols
    ? opts.marcoCols.map(function (f) { return ctx.cols[f]; }).filter(Boolean)
    : (ctx.cols[opts.statusCol] ? [ctx.cols[opts.statusCol]] : []);
  alvoCols.forEach(function (col) {
    var range = sheet.getRange(ctx.headerRow + 1, col, lastRow - ctx.headerRow, 1);
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

  if (ctx.cols.nome) sheet.setColumnWidth(ctx.cols.nome, 230);
  if (ctx.cols.paciente) sheet.setColumnWidth(ctx.cols.paciente, 230);
  if (ctx.cols.cirurgia) sheet.setColumnWidth(ctx.cols.cirurgia, 300);
  if (ctx.cols.obs) sheet.setColumnWidth(ctx.cols.obs, 320);

  ctx.ss.toast('Formatação aplicada — valores intocados', 'blue.', 4);
}

/* ================= Gemini ✨ ================= */

function geminiSummarize_(record) {
  var key = PROPS.getProperty('GEMINI_API_KEY') || '';
  if (!record) throw new Error('Sem dados da paciente');

  if (!key) return { text: buildLocalSummary_(record), provider: 'local' };

  var prompt =
    'Você é a assistente da Helen, concierge médica da clínica blue. (cirurgia plástica, Dr. Rafael). ' +
    'Gere um resumo claro em português brasileiro com estas seções:\n\n' +
    'Resumo da Paciente\n• Nome\n• Procedimento / Cirurgia\n• Situação do recall\n• Retornos (marcos)\n• Próximo passo sugerido\n• Observações importantes\n\n' +
    'Dados (JSON):\n' + JSON.stringify(record, null, 2);

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
      .addItem('🎨 Embelezar planilhas (só formatação)', 'beautifySheets')
      .addItem('🔁 Instalar sync automático', 'installTriggers')
      .addToUi();
  } catch (e) {}
}

function setupSecret() {
  PROPS.setProperty('SHEETS_API_SECRET', Utilities.getUuid());
}
