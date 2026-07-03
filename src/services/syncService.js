import { debounce } from '../utils/helpers.js';
import { mergePatient, touchPatient } from '../utils/patientModel.js';
import { nowISO } from '../utils/dates.js';
import { GoogleSheetsApi } from './googleSheetsApi.js';
import { loadConfig, saveConfig, loadSyncQueue, saveSyncQueue } from './storage.js';

const POLL_INTERVAL_MS = 3000;

export class SyncService {
  constructor(store) {
    this.store = store;
    this.config = loadConfig();
    this.api = new GoogleSheetsApi(this.config);
    this.queue = loadSyncQueue();
    this.syncing = false;
    this.pollTimer = null;
    this.listeners = new Set();
    this.debouncedFlush = debounce(() => this.flushQueue(), 400);
  }

  onStatus(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  _emit(status, detail = '') {
    this.listeners.forEach((cb) => cb({ status, detail, syncing: this.syncing }));
  }

  async configure({ webAppUrl, apiSecret, geminiApiKey, spreadsheetUrl }) {
    this.config = {
      ...this.config,
      webAppUrl,
      apiSecret,
      geminiApiKey,
      spreadsheetUrl: spreadsheetUrl || this.config.spreadsheetUrl,
    };
    saveConfig(this.config);
    this.api = new GoogleSheetsApi(this.config);
    if (this.api.configured) {
      await this.fullSync();
      this.startPolling();
    }
  }

  get configured() {
    return this.api.configured;
  }

  enqueue(patient) {
    const i = this.queue.findIndex((q) => q.id === patient.id);
    const item = { id: patient.id, enqueuedAt: nowISO() };
    if (i >= 0) this.queue[i] = item;
    else this.queue.push(item);
    saveSyncQueue(this.queue);
    this.debouncedFlush();
    this._emit('queued', `${this.queue.length} pendente(s)`);
  }

  async flushQueue() {
    if (!this.api.configured || this.syncing || !this.queue.length) return;
    this.syncing = true;
    this._emit('syncing', 'espelhando na planilha…');
    const batch = [...this.queue];
    try {
      const records = batch.map((q) => this.store.getPatient(q.id)).filter(Boolean);
      if (records.length) await this.api.pushBatch(records);
      this.queue = this.queue.filter((q) => !batch.find((b) => b.id === q.id));
      saveSyncQueue(this.queue);
      this.config.lastSyncAt = nowISO();
      saveConfig(this.config);
      this._emit('synced', 'planilha atualizada');
    } catch (e) {
      this._emit('error', e.message);
    } finally {
      this.syncing = false;
    }
  }

  async pull() {
    if (!this.api.configured || this.syncing) return;
    this.syncing = true;
    try {
      const since = this.config.lastSyncAt || '1970-01-01T00:00:00.000Z';
      const remote = await this.api.pullChanges(since);
      this._applyRemote(remote);
      this.config.lastSyncAt = nowISO();
      saveConfig(this.config);
      if (remote.length) this._emit('synced', `${remote.length} atualização(ões) da planilha`);
      else this._emit('online', 'sincronizado');
    } catch (e) {
      this._emit('error', e.message);
    } finally {
      this.syncing = false;
    }
  }

  async fullSync() {
    if (!this.api.configured) return;
    this.syncing = true;
    this._emit('syncing', 'carregando planilha…');
    try {
      const remote = await this.api.fullPull();
      this.store.applySheetMirror(remote);
      this.config.lastSyncAt = nowISO();
      saveConfig(this.config);
      this._emit('online', `${remote.length} paciente(s) da planilha`);
      await this.flushQueue();
    } catch (e) {
      this._emit('error', e.message);
    } finally {
      this.syncing = false;
    }
  }

  _applyRemote(remote) {
    for (const rp of remote) {
      if (rp.deleted) {
        this.store.removePatientLocal(rp.id, { skipSync: true });
        continue;
      }
      const local = this.store.getPatient(rp.id);
      const pending = this.queue.some((q) => q.id === rp.id);
      if (!local) {
        this.store.addPatientLocal(rp, { skipSync: true });
      } else if (!pending) {
        const lTime = new Date(local.modifiedAt || 0).getTime();
        const rTime = new Date(rp.modifiedAt || 0).getTime();
        if (rTime >= lTime) {
          this.store.updatePatientLocal(mergePatient(local, rp), { skipSync: true });
        } else {
          this.enqueue(local);
        }
      }
    }
    this.store.onChange();
  }

  startPolling() {
    this.stopPolling();
    if (!this.api.configured) return;
    this.pollTimer = setInterval(() => {
      this.pull();
      if (this.queue.length) this.flushQueue();
    }, POLL_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  notifyPatientChange(patient) {
    touchPatient(patient);
    if (this.api.configured) this.enqueue(patient);
  }
}
