import { debounce } from '../utils/helpers.js';
import { mergePatient, touchPatient } from '../utils/patientModel.js';
import { nowISO } from '../utils/dates.js';
import { GoogleSheetsApi } from './googleSheetsApi.js';
import { loadConfig, saveConfig, loadSyncQueue, saveSyncQueue } from './storage.js';

const POLL_INTERVAL_MS = 8000;

export class SyncService {
  constructor(store) {
    this.store = store;
    this.config = loadConfig();
    this.api = new GoogleSheetsApi(this.config);
    this.queue = loadSyncQueue();
    this.syncing = false;
    this.pollTimer = null;
    this.listeners = new Set();
    this.debouncedFlush = debounce(() => this.flushQueue(), 800);
  }

  onStatus(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  _emit(status, detail = '') {
    this.listeners.forEach((cb) => cb({ status, detail, syncing: this.syncing }));
  }

  configure({ webAppUrl, apiSecret, geminiApiKey }) {
    this.config = { ...this.config, webAppUrl, apiSecret, geminiApiKey };
    saveConfig(this.config);
    this.api = new GoogleSheetsApi(this.config);
    if (this.api.configured) this.startPolling();
  }

  get configured() {
    return this.api.configured;
  }

  enqueue(patient, action = 'upsert') {
    const existing = this.queue.findIndex((q) => q.id === patient.id);
    const item = { id: patient.id, action, modifiedAt: patient.modifiedAt, enqueuedAt: nowISO() };
    if (existing >= 0) this.queue[existing] = item;
    else this.queue.push(item);
    saveSyncQueue(this.queue);
    this.debouncedFlush();
    this._emit('queued', `${this.queue.length} na fila`);
  }

  async flushQueue() {
    if (!this.api.configured || this.syncing || !this.queue.length) return;

    this.syncing = true;
    this._emit('syncing', 'enviando alterações…');

    const batch = [...this.queue];
    try {
      const records = batch
        .map((q) => this.store.getPatient(q.id))
        .filter(Boolean);

      if (records.length) {
        await this.api.pushBatch(records);
      }

      this.queue = this.queue.filter((q) => !batch.find((b) => b.id === q.id));
      saveSyncQueue(this.queue);
      this.config.lastSyncAt = nowISO();
      saveConfig(this.config);
      this._emit('synced', 'alterações enviadas');
    } catch (e) {
      this._emit('error', e.message);
    } finally {
      this.syncing = false;
    }
  }

  async pull() {
    if (!this.api.configured) return;

    this.syncing = true;
    this._emit('syncing', 'buscando atualizações…');

    try {
      const since = this.config.lastSyncAt || '1970-01-01T00:00:00.000Z';
      const remote = await this.api.pullChanges(since);

      for (const rp of remote) {
        if (rp.deleted) {
          this.store.removePatientLocal(rp.id);
          continue;
        }
        const local = this.store.getPatient(rp.id);
        if (!local) {
          this.store.addPatientLocal(rp, { skipSync: true });
        } else {
          const lTime = new Date(local.modifiedAt || 0).getTime();
          const rTime = new Date(rp.modifiedAt || 0).getTime();
          const pending = this.queue.some((q) => q.id === rp.id);
          if (rTime > lTime && !pending) {
            this.store.updatePatientLocal(mergePatient(local, rp), { skipSync: true });
          } else if (lTime > rTime && !pending) {
            this.enqueue(local);
          }
        }
      }

      this.config.lastSyncAt = nowISO();
      saveConfig(this.config);
      this._emit('synced', `${remote.length} registro(s)`);
    } catch (e) {
      this._emit('error', e.message);
    } finally {
      this.syncing = false;
    }
  }

  startPolling() {
    this.stopPolling();
    if (!this.api.configured) return;
    this.pull();
    this.pollTimer = setInterval(() => {
      this.pull();
      if (this.queue.length) this.flushQueue();
    }, POLL_INTERVAL_MS);
    this._emit('online', 'sincronização ativa');
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  notifyPatientChange(patient, action = 'upsert') {
    touchPatient(patient);
    if (this.api.configured) this.enqueue(patient, action);
  }
}
