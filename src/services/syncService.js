/**
 * Sync bidirecional automático com as DUAS planilhas.
 *
 * - poll a cada 3s (GET sync&since=lastChange — resposta mínima quando nada mudou)
 * - push debounced (400ms) de edições de célula, novas linhas e config
 * - conflito por modifiedAt: o Apps Script ignora escrita mais antiga que a
 *   última edição feita direto na planilha; aqui, linhas com edição pendente
 *   não são sobrescritas pelo pull até o flush
 * - fullSync ao conectar substitui os exemplos locais pelo espelho real
 */
import { debounce } from '../utils/helpers.js';
import { nowISO } from '../utils/dates.js';
import { GoogleSheetsApi } from './googleSheetsApi.js';
import { loadSyncQueue, saveSyncQueue } from './storage.js';

const POLL_INTERVAL_MS = 3000;

export class SyncService {
  constructor(store) {
    this.store = store;
    this.api = new GoogleSheetsApi(store ? store.config : {});
    this.queue = loadSyncQueue();
    this.syncing = false;
    this.pollTimer = null;
    this.lastChange = '';
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

  get configured() {
    return this.api.configured;
  }

  async configure({ webAppUrl, apiSecret }) {
    this.api = new GoogleSheetsApi({ webAppUrl, apiSecret });
    if (this.api.configured) {
      await this.fullSync();
      this.startPolling();
    }
  }

  /* ---------- fila de operações ---------- */

  _saveQueue() {
    saveSyncQueue(this.queue);
  }

  /** células com alteração local ainda não enviada, por tipo */
  pendentes(tipo) {
    return new Set(this.queue.filter((op) => op.sheet === tipo).map((op) => op.key));
  }

  enqueueEdit(tipo, linha, field, value) {
    if (linha.row == null) {
      // linha ainda não existe na planilha — o append levará o valor atual
      const ap = this.queue.find((op) => op.type === 'append' && op.key === linha.key);
      if (ap) ap.cells = this._cells(tipo, linha);
      this._afterEnqueue();
      return;
    }
    const igual = (op) =>
      op.type === 'edit' && op.sheet === tipo && op.key === linha.key && op.field === field;
    const existente = this.queue.find(igual);
    const op = { type: 'edit', sheet: tipo, key: linha.key, row: linha.row, field, value, ts: nowISO() };
    if (existente) Object.assign(existente, op);
    else this.queue.push(op);
    this._afterEnqueue();
  }

  enqueueAppend(tipo, linha) {
    this.queue.push({ type: 'append', sheet: tipo, key: linha.key, cells: this._cells(tipo, linha), ts: nowISO() });
    this._afterEnqueue();
  }

  enqueueConfig() {
    this.queue = this.queue.filter((op) => op.type !== 'config');
    this.queue.push({ type: 'config', ts: nowISO() });
    this._afterEnqueue();
  }

  _afterEnqueue() {
    this._saveQueue();
    if (this.api.configured) {
      this.debouncedFlush();
      this._emit('queued', `${this.queue.length} alteração(ões) pendente(s)`);
    }
  }

  _cells(tipo, linha) {
    const { key, row, modifiedAt, exemplo, ...cells } = linha;
    return cells;
  }

  /* ---------- push ---------- */

  async flushQueue() {
    if (!this.api.configured || this.syncing || !this.queue.length) return;
    this.syncing = true;
    this._emit('syncing', 'enviando para as planilhas…');
    const batch = [...this.queue];
    try {
      const ops = batch.map((op) =>
        op.type === 'config' ? { ...op, appConfig: this.store.appConfig } : op,
      );
      const data = await this.api.push(ops);

      for (const r of data.results || []) {
        if (r.appendedRow != null && r.key) {
          const op = batch.find((b) => b.key === r.key && b.type === 'append');
          if (op) this.store.confirmarAppend(op.sheet, r.key, r.appendedRow);
        }
      }

      this.queue = this.queue.filter((q) => !batch.includes(q));
      this._saveQueue();
      this.lastChange = data.lastChange || this.lastChange;
      this.store.config.lastSyncAt = nowISO();
      this.store.persistConfig();
      this._emit('synced', 'planilhas atualizadas');
    } catch (e) {
      this._emit('error', e.message);
    } finally {
      this.syncing = false;
    }
  }

  /* ---------- pull ---------- */

  async pull() {
    if (!this.api.configured || this.syncing) return;
    this.syncing = true;
    try {
      const data = await this.api.syncSince(this.lastChange);
      if (data.changed) {
        this._aplicar(data);
        this._emit('synced', 'atualizado da planilha');
      } else {
        this._emit('online', 'sincronizado');
      }
    } catch (e) {
      this._emit('error', e.message);
    } finally {
      this.syncing = false;
    }
  }

  async fullSync() {
    this.syncing = true;
    this._emit('syncing', 'carregando planilhas…');
    try {
      const data = await this.api.fullSync();
      this.store.limparExemplos();
      this._aplicar(data);
      this.store.config.lastSyncAt = nowISO();
      this.store.persistConfig();
      const n = (data.recall?.rows?.length || 0) + (data.cirurgias?.rows?.length || 0);
      this._emit('online', `${n} linha(s) das planilhas`);
    } finally {
      this.syncing = false;
      await this.flushQueue();
    }
  }

  _aplicar(data) {
    this.lastChange = data.lastChange || this.lastChange;
    if (data.recall?.rows) this.store.aplicarEspelho('recall', data.recall.rows, this.pendentes('recall'));
    if (data.cirurgias?.rows) this.store.aplicarEspelho('cirurgias', data.cirurgias.rows, this.pendentes('cirurgias'));
    if (data.appConfig) this.store.aplicarConfigRemota(data.appConfig);
  }

  /* ---------- polling ---------- */

  startPolling() {
    this.stopPolling();
    if (!this.api.configured) return;
    this.pollTimer = setInterval(() => {
      if (this.queue.length) this.flushQueue();
      else this.pull();
    }, POLL_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
