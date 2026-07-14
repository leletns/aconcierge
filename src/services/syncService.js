/**
 * Sync bidirecional automático com as DUAS planilhas.
 *
 * - poll a cada 3s (GET sync&since=lastChange — resposta mínima quando nada mudou)
 * - push debounced (400ms) de edições de célula, novas linhas e config
 * - conflito por modifiedAt: o Apps Script ignora escrita mais antiga que a
 *   última edição feita direto na planilha; aqui, linhas com edição pendente
 *   não são sobrescritas pelo pull até o flush
 * - fullSync ao conectar substitui os exemplos locais pelo espelho real
 * - ops com erro NÃO são removidas da fila (retry no próximo flush)
 */
import { debounce } from '../utils/helpers.js';
import { nowISO } from '../utils/dates.js';
import { GoogleSheetsApi } from './googleSheetsApi.js';
import { loadSyncQueue, saveSyncQueue } from './storage.js';

const POLL_INTERVAL_MS = 3000;
const RECALL_CAMPOS_MIN = ['nome', 'contato', 'status', 'proximoContato'];

export class SyncService {
  constructor(store) {
    this.store = store;
    this.api = new GoogleSheetsApi(store ? store.config : {});
    this.queue = loadSyncQueue();
    this.syncing = false;
    this.pollTimer = null;
    this.lastChange = '';
    this.lastHealth = null; // { recall, cirurgias }
    this.listeners = new Set();
    this.debouncedFlush = debounce(() => this.flushQueue(), 400);
  }

  onStatus(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  _emit(status, detail = '') {
    this.listeners.forEach((cb) => cb({ status, detail, syncing: this.syncing, health: this.lastHealth }));
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
      const results = data.results || [];
      const resultByKey = new Map();
      results.forEach((r, i) => {
        const op = batch[i];
        if (op) resultByKey.set(op, r);
        if (r.appendedRow != null && r.key) {
          this.store.confirmarAppend(op?.sheet || 'recall', r.key, r.appendedRow);
        }
      });

      // remove da fila só o que foi aceito (updated/appended/skipped conflict ou config)
      const erros = [];
      this.queue = this.queue.filter((q) => {
        if (!batch.includes(q)) return true;
        const r = resultByKey.get(q);
        if (!r) return false; // sem resultado correspondente → assume ok
        if (r.error) {
          erros.push(r.error);
          return true; // mantém para retry
        }
        return false;
      });
      this._saveQueue();
      this.lastChange = data.lastChange || this.lastChange;
      this.store.config.lastSyncAt = nowISO();
      this.store.persistConfig();

      if (erros.length) {
        this._emit('error', erros[0]);
      } else {
        this._emit('synced', 'planilhas atualizadas');
      }
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
        this._emit('synced', this._resumoHealth());
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
      this._emit('online', this._resumoHealth());
    } finally {
      this.syncing = false;
      await this.flushQueue();
    }
  }

  _resumoHealth() {
    const h = this.lastHealth;
    if (!h) return 'planilhas carregadas';
    const r = h.recall || {};
    const c = h.cirurgias || {};
    return `Recall ${r.rows || 0} · Cirurgias ${c.rows || 0}`;
  }

  _validarEspelho(meta, esperado) {
    if (!meta) return { ok: false, motivo: 'sem dados' };
    const cols = meta.cols || {};
    const faltando = esperado.filter((f) => !cols[f]);
    // mappedCount do server ou conta cols
    const mapped = meta.mappedCount ?? Object.keys(cols).length;
    if (mapped < 3 && (meta.rows?.length || 0) === 0) {
      return { ok: false, motivo: `cabeçalho não mapeado (${mapped} colunas)` };
    }
    if (faltando.includes('nome') && faltando.includes('paciente')) {
      return { ok: false, motivo: 'coluna Paciente não encontrada' };
    }
    return { ok: true, faltando, mapped };
  }

  _aplicar(data) {
    this.lastChange = data.lastChange || this.lastChange;

    const recallCheck = this._validarEspelho(data.recall, RECALL_CAMPOS_MIN);
    if (data.recall?.rows) {
      if (!recallCheck.ok && (this.store.recall.filter((r) => !r.exemplo).length > 0)) {
        // evita apagar espelho local com pull quebrado
        this._emit('error', 'Recall: ' + recallCheck.motivo + ' — mantendo dados locais');
      } else {
        this.store.aplicarEspelho('recall', data.recall.rows, this.pendentes('recall'));
      }
    }
    if (data.cirurgias?.rows) {
      this.store.aplicarEspelho('cirurgias', data.cirurgias.rows, this.pendentes('cirurgias'));
    }
    if (data.appConfig) this.store.aplicarConfigRemota(data.appConfig);

    this.lastHealth = {
      recall: {
        titulo: data.recall?.titulo || '',
        sheetName: data.recall?.sheetName || '',
        headerRow: data.recall?.headerRow,
        mapped: recallCheck.mapped ?? data.recall?.mappedCount,
        rows: data.recall?.rows?.length || 0,
        ok: recallCheck.ok,
        faltando: recallCheck.faltando || [],
      },
      cirurgias: {
        titulo: data.cirurgias?.titulo || '',
        sheetName: data.cirurgias?.sheetName || '',
        headerRow: data.cirurgias?.headerRow,
        mapped: data.cirurgias?.mappedCount,
        rows: data.cirurgias?.rows?.length || 0,
        ok: true,
      },
    };
    this.store.config.lastHealth = this.lastHealth;
    this.store.persistConfig();
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
