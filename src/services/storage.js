import { STORAGE_KEY, CONFIG_KEY, QUEUE_KEY } from '../utils/constants.js';
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
  cfg.recallSheetUrl = cfg.recallSheetUrl || env.VITE_SPREADSHEET_URL_RECALL || '';
  cfg.cirurgiasSheetUrl = cfg.cirurgiasSheetUrl || env.VITE_SPREADSHEET_URL_CIRURGIAS || '';
  cfg.lastSyncAt = cfg.lastSyncAt || '';
  const ac = cfg.appConfig || {};
  cfg.appConfig = {
    templates: Array.isArray(ac.templates) && ac.templates.length ? ac.templates : templatesPadrao(),
    assignments: ac.assignments || {},
    overrides: ac.overrides || {},
    modifiedAt: ac.modifiedAt || '',
  };
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
