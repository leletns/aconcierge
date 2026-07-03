import { STORAGE_KEY } from '../utils/constants.js';
import { semearExemplos } from '../utils/patientModel.js';

export function loadFromStorage() {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (bruto) return JSON.parse(bruto);
  } catch (_) {}
  return { pacientes: semearExemplos() };
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
  try {
    const raw = localStorage.getItem('blue_central_config');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {
    webAppUrl: import.meta.env.VITE_SHEETS_WEBAPP_URL || '',
    apiSecret: import.meta.env.VITE_SHEETS_API_SECRET || '',
    geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
    spreadsheetUrl: import.meta.env.VITE_SPREADSHEET_URL || '',
    lastSyncAt: '',
  };
}

export function saveConfig(config) {
  localStorage.setItem('blue_central_config', JSON.stringify(config));
}

export function loadSyncQueue() {
  try {
    const raw = localStorage.getItem('blue_sync_queue');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

export function saveSyncQueue(queue) {
  localStorage.setItem('blue_sync_queue', JSON.stringify(queue));
}

export function loadOfflineFlag() {
  return localStorage.getItem('blue_offline') === '1';
}

export function setOfflineFlag(v) {
  if (v) localStorage.setItem('blue_offline', '1');
  else localStorage.removeItem('blue_offline');
}
