import { loadFromStorage, saveToStorage } from './storage.js';
import {
  novoPaciente,
  touchPatient,
  gerarMarcos,
  emPosOp,
  emPreOp,
  proximoMarco,
  MARCOS,
  estadoMarco,
} from '../utils/patientModel.js';
import { normalizePhone } from '../utils/phone.js';

export class Store {
  constructor({ syncService, onChange } = {}) {
    this.sync = syncService;
    this.onChange = onChange || (() => {});
    this.dados = loadFromStorage();
    this.filters = {
      tela: 'hoje',
      retornos: 'todos',
      recall: 'ativos',
    };
    this._searchIndex = null;
    this._rebuildIndex();
  }

  _rebuildIndex() {
    this._searchIndex = this.dados.pacientes
      .filter((p) => !p.deleted)
      .map((p) => ({
        id: p.id,
        nomeLower: p.nome.toLowerCase(),
        procLower: (p.procedimento || '').toLowerCase(),
      }));
  }

  get patients() {
    return this.dados.pacientes.filter((p) => !p.deleted);
  }

  getPatient(id) {
    return this.dados.pacientes.find((p) => p.id === id && !p.deleted);
  }

  _persist(skipRender) {
    saveToStorage(this.dados);
    this._rebuildIndex();
    if (!skipRender) this.onChange();
  }

  addPatientLocal(p, { skipSync = false } = {}) {
    this.dados.pacientes.push(p);
    this._persist(skipSync);
    if (!skipSync && this.sync) this.sync.notifyPatientChange(p, 'create');
  }

  updatePatientLocal(p, { skipSync = false } = {}) {
    const i = this.dados.pacientes.findIndex((x) => x.id === p.id);
    if (i >= 0) this.dados.pacientes[i] = p;
    this._persist(skipSync);
    if (!skipSync && this.sync) this.sync.notifyPatientChange(p, 'update');
  }

  removePatientLocal(id, { skipSync = false } = {}) {
    const p = this.dados.pacientes.find((x) => x.id === id);
    if (p) {
      p.deleted = true;
      touchPatient(p);
      this._persist(skipSync);
      if (!skipSync && this.sync) this.sync.notifyPatientChange(p, 'delete');
    }
  }

  createPatient(base) {
    const p = novoPaciente(base);
    if (base.telefone) p.telefone = normalizePhone(base.telefone);
    this.addPatientLocal(p);
    return p;
  }

  updatePatient(id, fields) {
    const p = this.getPatient(id);
    if (!p) return null;
    Object.assign(p, fields);
    if (fields.telefone !== undefined) p.telefone = normalizePhone(fields.telefone);
    if (fields.dataCirurgia) gerarMarcos(p);
    touchPatient(p);
    this.updatePatientLocal(p);
    return p;
  }

  deletePatient(id) {
    this.removePatientLocal(id);
  }

  clearExamples() {
    this.dados.pacientes = this.dados.pacientes.filter((p) => !p.exemplo);
    this._persist();
  }

  setFilter(key, value) {
    this.filters[key] = value;
    this.onChange();
  }

  setActiveScreen(tela) {
    this.filters.tela = tela;
    this.onChange();
  }

  search(termo, limit = 8) {
    const t = termo.trim().toLowerCase();
    if (!t) return this.patients.slice(0, limit);
    const out = [];
    for (const row of this._searchIndex) {
      if (row.nomeLower.includes(t) || row.procLower.includes(t)) {
        const p = this.getPatient(row.id);
        if (p) out.push(p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  exportFilteredPatients() {
    const { tela, retornos, recall } = this.filters;

    if (tela === 'retornos') {
      let lista = this.patients.filter(emPosOp);
      if (retornos === 'atrasados') {
        lista = lista.filter((p) => MARCOS.some((m) => estadoMarco(p, m) === 'atrasado'));
      } else if (retornos !== 'todos') {
        lista = lista.filter((p) => {
          const px = proximoMarco(p);
          return px && px.m.id === retornos;
        });
      }
      return lista;
    }

    if (tela === 'recall') {
      let lista = this.patients.filter(
        (p) =>
          p.recall.historico.length ||
          p.recall.proxima ||
          p.recall.status !== 'aguardando contato',
      );
      const radar = this.patients.filter((p) => emPosOp(p) && !lista.includes(p));
      lista = lista.concat(radar);
      if (recall === 'ativos') {
        lista = lista.filter((p) => !['arquivada', 'reativada'].includes(p.recall.status));
      } else if (recall !== 'todos') {
        lista = lista.filter((p) => p.recall.status === recall);
      }
      return lista;
    }

    if (tela === 'preop') {
      return this.patients.filter(emPreOp);
    }

    return this.patients;
  }
}
