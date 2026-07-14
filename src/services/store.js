/**
 * Store — espelho local das duas planilhas + dados app-only.
 *
 * dados.recall[]     linhas da planilha GESTÃO DE RECALL (1:1)
 * dados.cirurgias[]  linhas da planilha Cirurgias BLUE (1:1)
 * dados.extras{}     por paciente (key): exames, histórico de contato, status
 *                    de marcos que não têm coluna na planilha
 * config.appConfig   templates de acompanhamento, atribuições e overrides
 *                    (persistidos na aba _Config via sync)
 */
import { loadFromStorage, saveToStorage, loadConfig, saveConfig } from './storage.js';
import { novaLinhaRecall, novaLinhaCirurgia, novoExtras } from '../utils/rowModel.js';
import { unificarPacientes, patientKey, normalizeNome } from '../utils/matching.js';
import { marcosEfetivos, proximoMarco, algumMarcoAtrasado, estadoMarco } from '../utils/templates.js';
import { parseDataPt, difDias, nowISO } from '../utils/dates.js';
import { examesDoProtocolo, podeAplicarProtocolo } from '../utils/preopProtocol.js';

export class Store {
  constructor({ onChange } = {}) {
    this.sync = null;
    this.onChange = onChange || (() => {});
    this.dados = loadFromStorage();
    this.config = loadConfig();
    this.filters = {
      tela: 'hoje',
      gridRecallStatus: 'todos',
      gridRecallBusca: '',
      gridCirurgiasStatus: 'todos',
      gridCirurgiasBusca: '',
      retornos: 'todos',
    };
    this._pacientes = null;
  }

  /* ---------- leitura ---------- */

  get recall() {
    return this.dados.recall;
  }

  get cirurgias() {
    return this.dados.cirurgias;
  }

  get appConfig() {
    return this.config.appConfig;
  }

  /** pacientes unificados (Recall ∪ Cirurgias) — cache invalidado a cada persist */
  get pacientes() {
    if (!this._pacientes) {
      this._pacientes = unificarPacientes(this.dados.recall, this.dados.cirurgias);
    }
    return this._pacientes;
  }

  getPaciente(key) {
    return this.pacientes.find((p) => p.key === key) || null;
  }

  pacienteDaLinha(linha, tipo) {
    const nome = tipo === 'recall' ? linha.nome : linha.paciente;
    return this.pacientes.find((p) =>
      tipo === 'recall' ? p.recallRows.includes(linha) : p.cirurgiaRows.includes(linha),
    ) || this.pacientes.find((p) => normalizeNome(p.nome) === normalizeNome(nome)) || null;
  }

  getRecallRow(key) {
    return this.dados.recall.find((r) => r.key === key) || null;
  }

  getCirurgiaRow(key) {
    return this.dados.cirurgias.find((c) => c.key === key) || null;
  }

  /**
   * extras da paciente. Se `cirurgiaTexto` for passado e ainda não houver checklist
   * customizado, aplica automaticamente o protocolo de exames do PDF.
   */
  extrasDe(pKey, cirurgiaTexto = '') {
    if (!this.dados.extras[pKey]) this.dados.extras[pKey] = novoExtras(cirurgiaTexto);
    const e = this.dados.extras[pKey];
    if (!e.exames) e.exames = novoExtras(cirurgiaTexto).exames;
    if (!e.historico) e.historico = [];
    if (!e.marcoStatus) e.marcoStatus = {};

    if (cirurgiaTexto && podeAplicarProtocolo(e, cirurgiaTexto)) {
      const p = examesDoProtocolo(cirurgiaTexto);
      e.exames = p.exames;
      e.protocoloId = p.protocoloId;
      e.protocoloNome = p.protocoloNome;
      e.examesCustom = false;
    }
    return e;
  }

  /** Reaplica o protocolo PDF (descarta checks) — Helen confirma na UI */
  aplicarProtocoloPreop(pKey, cirurgiaTexto) {
    const p = examesDoProtocolo(cirurgiaTexto);
    const e = this.extrasDe(pKey);
    e.exames = p.exames;
    e.protocoloId = p.protocoloId;
    e.protocoloNome = p.protocoloNome;
    e.examesCustom = false;
    this.salvarExtras();
    return p;
  }

  marcarExameCustom(pKey) {
    const e = this.extrasDe(pKey);
    e.examesCustom = true;
    this.salvarExtras();
  }

  /** marcos efetivos de uma linha de cirurgia */
  marcosDe(cir) {
    const p = this.pacienteDaLinha(cir, 'cirurgias');
    const pKey = p ? p.key : patientKey(cir.paciente);
    return marcosEfetivos(cir, this.appConfig, pKey, this.dados.extras[pKey]);
  }

  /* ---------- persistência ---------- */

  _persist(silencioso = false) {
    this._pacientes = null;
    saveToStorage(this.dados);
    if (!silencioso) this.onChange();
  }

  persistConfig() {
    saveConfig(this.config);
  }

  /* ---------- edição de células (grades) ---------- */

  editarCelula(tipo, rowKey, field, value, { skipSync = false } = {}) {
    const linha = tipo === 'recall' ? this.getRecallRow(rowKey) : this.getCirurgiaRow(rowKey);
    if (!linha || linha[field] === value) return null;
    linha[field] = value;
    linha.modifiedAt = nowISO();
    linha.exemplo = linha.exemplo && !linha.row ? linha.exemplo : false;
    this._persist();
    if (!skipSync && this.sync) this.sync.enqueueEdit(tipo, linha, field, value);
    return linha;
  }

  adicionarLinha(tipo, base = {}) {
    const linha = tipo === 'recall' ? novaLinhaRecall(base) : novaLinhaCirurgia(base);
    this.dados[tipo].push(linha);
    this._persist();
    if (this.sync) this.sync.enqueueAppend(tipo, linha);
    return linha;
  }

  /* ---------- espelho remoto ---------- */

  /**
   * Substitui o espelho local pelas linhas vindas da planilha,
   * preservando linhas com alterações locais ainda não enviadas.
   */
  aplicarEspelho(tipo, remoteRows, pendentes = new Set()) {
    const locais = this.dados[tipo];
    const porRow = new Map(locais.filter((l) => l.row != null).map((l) => [l.row, l]));
    const novas = [];

    for (const remota of remoteRows) {
      const local = porRow.get(remota.row);
      if (local && pendentes.has(local.key)) {
        novas.push(local); // edição local pendente vence até o flush
      } else if (local) {
        novas.push(Object.assign(local, remota, { key: local.key }));
      } else {
        novas.push(tipo === 'recall' ? novaLinhaRecall(remota) : novaLinhaCirurgia(remota));
      }
    }

    // linhas criadas no app e ainda não enviadas (row === null)
    for (const l of locais) {
      if (l.row == null && !l.exemplo && (l.nome || l.paciente)) novas.push(l);
    }

    this.dados[tipo] = novas;
    this._persist();
  }

  confirmarAppend(tipo, rowKey, rowNumber) {
    const linha = tipo === 'recall' ? this.getRecallRow(rowKey) : this.getCirurgiaRow(rowKey);
    if (linha) {
      linha.row = rowNumber;
      this._persist(true);
    }
  }

  /* ---------- templates / overrides ---------- */

  salvarTemplates(templates, { skipSync = false } = {}) {
    this.appConfig.templates = templates;
    this.appConfig.modifiedAt = nowISO();
    this.persistConfig();
    this.onChange();
    if (!skipSync && this.sync) this.sync.enqueueConfig();
  }

  salvarOverride(pKey, marcos, { skipSync = false } = {}) {
    if (marcos && marcos.length) this.appConfig.overrides[pKey] = marcos;
    else delete this.appConfig.overrides[pKey];
    this.appConfig.modifiedAt = nowISO();
    this.persistConfig();
    this.onChange();
    if (!skipSync && this.sync) this.sync.enqueueConfig();
  }

  atribuirTemplate(pKey, templateId, { skipSync = false } = {}) {
    if (templateId) this.appConfig.assignments[pKey] = templateId;
    else delete this.appConfig.assignments[pKey];
    this.appConfig.modifiedAt = nowISO();
    this.persistConfig();
    this.onChange();
    if (!skipSync && this.sync) this.sync.enqueueConfig();
  }

  aplicarConfigRemota(appConfig) {
    if (!appConfig) return;
    const remoto = new Date(appConfig.modifiedAt || 0).getTime();
    const local = new Date(this.appConfig.modifiedAt || 0).getTime();
    if (remoto > local && Array.isArray(appConfig.templates) && appConfig.templates.length) {
      this.config.appConfig = {
        templates: appConfig.templates,
        assignments: appConfig.assignments || {},
        overrides: appConfig.overrides || {},
        modifiedAt: appConfig.modifiedAt,
      };
      this.persistConfig();
      this.onChange();
    }
  }

  /* ---------- marcos sem coluna na planilha ---------- */

  setMarcoStatus(cir, marco, status) {
    if (marco.col) {
      this.editarCelula('cirurgias', cir.key, marco.col, status);
      return;
    }
    const p = this.pacienteDaLinha(cir, 'cirurgias');
    const pKey = p ? p.key : patientKey(cir.paciente);
    const e = this.extrasDe(pKey);
    e.marcoStatus[cir.key] = e.marcoStatus[cir.key] || {};
    e.marcoStatus[cir.key][marco.id] = status;
    this._persist();
  }

  /* ---------- exames / histórico (app-only) ---------- */

  salvarExtras() {
    this._persist();
  }

  /* ---------- exemplos ---------- */

  get temExemplos() {
    return this.dados.recall.some((r) => r.exemplo) || this.dados.cirurgias.some((c) => c.exemplo);
  }

  limparExemplos() {
    this.dados.recall = this.dados.recall.filter((r) => !r.exemplo);
    this.dados.cirurgias = this.dados.cirurgias.filter((c) => !c.exemplo);
    this._persist();
  }

  /* ---------- filtros / navegação ---------- */

  setFilter(key, value) {
    this.filters[key] = value;
    this.onChange();
  }

  setActiveScreen(tela) {
    this.filters.tela = tela;
  }

  /* ---------- consultas derivadas ---------- */

  /** cirurgias com data futura (pré-op) */
  cirurgiasFuturas() {
    return this.dados.cirurgias
      .map((c) => ({ c, iso: parseDataPt(c.data) }))
      .filter(({ iso }) => iso && difDias(iso) >= 0)
      .sort((a, b) => difDias(a.iso) - difDias(b.iso));
  }

  /** cirurgias já realizadas (pós-op, alimenta Retornos) */
  cirurgiasPassadas() {
    return this.dados.cirurgias
      .map((c) => ({ c, iso: parseDataPt(c.data) }))
      .filter(({ iso }) => !iso || difDias(iso) < 0)
      .map(({ c }) => c);
  }

  /** recalls com próximo contato vencido/hoje */
  recallsVencidos() {
    return this.dados.recall
      .filter((r) => {
        if (['Agendado', 'Sem interesse'].includes(r.status)) return false;
        const prox = parseDataPt(r.proximoContato) || parseDataPt(r.dataContato);
        return prox && difDias(prox) <= 0;
      })
      .sort((a, b) => {
        const da = difDias(parseDataPt(a.proximoContato) || parseDataPt(a.dataContato)) ?? 999;
        const db = difDias(parseDataPt(b.proximoContato) || parseDataPt(b.dataContato)) ?? 999;
        return da - db;
      });
  }

  search(termo, limit = 8) {
    const t = normalizeNome(termo);
    const lista = this.pacientes;
    if (!t) return lista.slice(0, limit);
    const out = [];
    for (const p of lista) {
      const alvo = normalizeNome(p.nome) + ' ' + normalizeNome(p.cirurgiaRows.map((c) => c.cirurgia).join(' '));
      if (alvo.includes(t)) {
        out.push(p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}

export { proximoMarco, algumMarcoAtrasado, estadoMarco };
