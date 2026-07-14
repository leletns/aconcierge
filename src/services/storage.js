import {
  STORAGE_KEY,
  CONFIG_KEY,
  QUEUE_KEY,
  DEFAULT_RECALL_SHEET_URL,
  DEFAULT_CIRURGIAS_SHEET_URL,
} from '../utils/constants.js';
import { semearExemplos } from '../utils/rowModel.js';
import { templatesPadrao } from '../utils/templates.js';

export function loadFromStorage() {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (bruto) {
      const dados = JSON.parse(bruto);
      if (Array.isArray(dados.recall) && Array.isArray(dados.cirurgias)) {
        dados.extras = dados.extras || {};
        return dados;
      }
    }
  } catch (_) {}
  const seed = semearExemplos();
  return { recall: seed.recall, cirurgias: seed.cirurgias, extras: {} };
}

export function saveToStorage(dados) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Link de instalação (#cfg=…): configura o app sozinho ao abrir.
 * O admin conecta uma vez, copia o link e usa como atalho no Mac da Helen —
 * cada abertura reaplica a configuração (imune a limpeza do navegador) e
 * o segredo nunca vai para o bundle público nem para logs (fica no fragmento #).
 */
function configDoLink() {
  try {
    const m = (window.location.hash || '').match(/#cfg=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

export function buildLinkInstalacao(cfg) {
  if (!cfg.webAppUrl || !cfg.apiSecret) return null;
  const payload = { u: cfg.webAppUrl, s: cfg.apiSecret };
  if (cfg.geminiApiKey) payload.g = cfg.geminiApiKey;
  if (cfg.recallSheetUrl) payload.r = cfg.recallSheetUrl;
  if (cfg.cirurgiasSheetUrl) payload.c = cfg.cirurgiasSheetUrl;
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return window.location.origin + window.location.pathname + '#cfg=' + b64;
}

export function loadConfig() {
  let cfg = null;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) cfg = JSON.parse(raw);
  } catch (_) {}
  const env = import.meta.env || {};
  cfg = cfg || {};
  cfg.webAppUrl = cfg.webAppUrl || env.VITE_SHEETS_WEBAPP_URL || '';
  cfg.apiSecret = cfg.apiSecret || env.VITE_SHEETS_API_SECRET || '';
  cfg.geminiApiKey = cfg.geminiApiKey || env.VITE_GEMINI_API_KEY || '';
  cfg.recallSheetUrl =
    cfg.recallSheetUrl || env.VITE_SPREADSHEET_URL_RECALL || DEFAULT_RECALL_SHEET_URL;
  cfg.cirurgiasSheetUrl =
    cfg.cirurgiasSheetUrl || env.VITE_SPREADSHEET_URL_CIRURGIAS || DEFAULT_CIRURGIAS_SHEET_URL;
  cfg.lastSyncAt = cfg.lastSyncAt || '';
  const ac = cfg.appConfig || {};
  cfg.appConfig = {
    templates: Array.isArray(ac.templates) && ac.templates.length ? ac.templates : templatesPadrao(),
    assignments: ac.assignments || {},
    overrides: ac.overrides || {},
    modifiedAt: ac.modifiedAt || '',
  };

  // link de instalação tem prioridade sobre localStorage e .env
  const magico = configDoLink();
  if (magico) {
    if (magico.u) cfg.webAppUrl = magico.u;
    if (magico.s) cfg.apiSecret = magico.s;
    if (magico.g) cfg.geminiApiKey = magico.g;
    if (magico.r) cfg.recallSheetUrl = magico.r;
    if (magico.c) cfg.cirurgiasSheetUrl = magico.c;
    saveConfig(cfg);
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (_) {}
  }
  return cfg;
}

export function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (_) {}
}

export function loadSyncQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

export function saveSyncQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (_) {}
}
