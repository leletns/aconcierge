/**
 * blue. Central — orquestrador UI (visualização Linha Única / single-page)
 *
 * Uma página só, rolável: Smart Alert no topo → bloco Recall → bloco
 * Cirurgias & Revisões → rodapé técnico. As planilhas completas ficam
 * ocultas atrás de "ver detalhes". Card de gestão executivo em modal.
 */
import {
  RECALL_COLS,
  CIRURGIAS_COLS,
  STATUS_RECALL,
  STATUS_MARCO,
  SUPORTE_WHATSAPP,
  PRIORIDADES_LEMBRETE,
  REPETICAO_LEMBRETE,
} from './utils/constants.js';
import { esc, iniciais, debounce } from './utils/helpers.js';
import {
  fmt,
  fmtLonga,
  isoHoje,
  somarDias,
  difDias,
  parseDataPt,
  fmtDataPlanilhaRecall,
  fmtDataPlanilhaCirurgias,
  hoje,
  paraData,
} from './utils/dates.js';
import { formatPhoneDisplay, buildWhatsAppLink } from './utils/phone.js';
import { patientKey } from './utils/matching.js';
import { estadoMarco, proximoMarco, templateParaCirurgia } from './utils/templates.js';
import { Store } from './services/store.js';
import { SyncService } from './services/syncService.js';
import { RemindersStore, prioridadeDe, repeticaoDe, baixarIcs } from './services/reminders.js';
import { SummaryService, pacienteSnapshot } from './services/summaryService.js';
import { exportToXlsx } from './services/exportService.js';
import { buildLinkInstalacao } from './services/storage.js';
import { showToast, showLoadingToast } from './components/Toast.js';
import { renderSyncIndicator } from './components/SummaryModal.js';
import { SpreadsheetGrid } from './components/SpreadsheetGrid.js';
import { AcompanhamentosScreen, marcosEditorHtml, bindMarcosEditor } from './screens/acompanhamentos.js';

const $ = (s) => document.querySelector(s);

/* ---------- estado da UI ---------- */
let contatoAtual = null;
let resumoAtual = null;
let resumoTexto = '';
let buscaIndice = 0;
let atencaoMes = false;
let alertaColapsado = false;
let filtroRecall = 'todos';
let filtroCirurgias = 'todas';
let buscaRecall = '';
let buscaCirurgias = '';
let mesRevisao = ''; // 'yyyy-mm' selecionado na régua "revisões por mês"
let ultimaNovaRecallKey = ''; // destaque da paciente recém-registrada
let lembreteAtual = null;
let feitosVisiveis = false;
const detalhesAbertos = { recall: false, cirurgias: false };

/* ---------- estado central ---------- */
const store = new Store({ onChange: () => renderizarTudo() });
const syncService = new SyncService(store);
store.sync = syncService;

const reminders = new RemindersStore({
  onChange: () => {
    if (!digitandoEm($('#bloco-lembretes'))) renderLembretes();
    atualizarNavBadges();
  },
});

const summaryService = new SummaryService({ geminiApiKey: store.config.geminiApiKey });
summaryService.setSheetsApi(syncService.api);
syncService.onStatus((s) => renderSyncIndicator(s));

/* ---------- grades (ver detalhes) ---------- */

const gridRecall = new SpreadsheetGrid({
  el: null,
  colunas: RECALL_COLS,
  nomeField: 'nome',
  statusField: 'status',
  getRows: () => store.recall,
  onEdit: (key, field, value) => store.editarCelula('recall', key, field, value),
  onAddRow: () => abrirNovaRecall(),
  onOpenFicha: (linha) => abrirFichaDaLinha(linha, 'recall'),
});

const gridCirurgias = new SpreadsheetGrid({
  el: null,
  colunas: CIRURGIAS_COLS,
  nomeField: 'paciente',
  statusField: 'm3m',
  getRows: () => store.cirurgias,
  onEdit: (key, field, value) => store.editarCelula('cirurgias', key, field, value),
  onAddRow: () => store.adicionarLinha('cirurgias'),
  onOpenFicha: (linha) => abrirFichaDaLinha(linha, 'cirurgias'),
  headerLabel: headerLabelCirurgias,
});

let acompanhamentosScreen = null;

function headerLabelCirurgias(field) {
  if (!['m3m', 'm6m', 'm1a'].includes(field)) return null;
  for (const t of store.appConfig.templates) {
    if (!t.padrao) continue;
    const m = t.marcos.find((x) => x.col === field);
    if (m) return m.label;
  }
  return null;
}

/* ---------- WhatsApp ---------- */

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

function waMsgRevisao(nome, marcoLabel) {
  return `Olá, ${primeiroNome(nome)}! Aqui é a Helen, da blue. Estou entrando em contato para agendarmos a sua revisão${marcoLabel ? ' de ' + marcoLabel : ''} com o Dr. Rafael. Qual o melhor dia para você?`;
}

function waMsgRecall(nome) {
  return `Olá, ${primeiroNome(nome)}! Aqui é a Helen, da blue. Como você está? Estou entrando em contato para saber como tem sido a sua evolução e ver se podemos agendar uma avaliação com o Dr. Rafael.`;
}

function waBtnMini(telefone, msg) {
  const url = buildWhatsAppLink(telefone, msg);
  if (!url) return '<span class="wa-vazio" title="sem telefone">—</span>';
  return `<button type="button" class="wa-mini" data-wa="${esc(url)}" title="abrir WhatsApp"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .611.611l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.372l-.357-.212-3.028 1.015 1.015-3.028-.212-.357A9.818 9.818 0 1 1 12 21.818z"/></svg></button>`;
}

function bindWa(root) {
  root.querySelectorAll('[data-wa]').forEach((b) => {
    if (b._wa) return;
    b._wa = true;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(b.dataset.wa, '_blank', 'noopener');
    });
  });
}

/* ---------- utilidades da página ---------- */

/* mesma linguagem de cor das planilhas (beautify do Apps Script):
   Agendado verde · Pendente âmbar · Sem Resposta coral ·
   Em Acompanhamento azul · Não agendou / Sem interesse neutro */
const SELO_RECALL = {
  Agendado: 'st-verde',
  Pendente: 'st-ambar',
  'Não agendou': 'st-neutro',
  'Sem Resposta': 'st-coral',
  'Em Acompanhamento': 'st-azul',
  'Sem interesse': 'st-neutro',
};
const SELO_RECALL_FICHA = {
  Agendado: 'selo-verde',
  Pendente: 'selo-ambar',
  'Não agendou': 'selo-neutro',
  'Sem Resposta': 'selo-coral',
  'Em Acompanhamento': 'selo-azul',
  'Sem interesse': 'selo-neutro',
};
const SELO_MARCO = {
  Realizada: 'st-verde',
  Marcada: 'st-azul',
  Pendente: 'st-ambar',
  'Sem resposta': 'st-coral',
};

function digitandoEm(el) {
  return (
    el &&
    el.contains(document.activeElement) &&
    /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)
  );
}

function fimDoMes() {
  const d = hoje();
  const pad = (n) => String(n).padStart(2, '0');
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${pad(ultimo.getMonth() + 1)}-${pad(ultimo.getDate())}`;
}

function dataAcaoRecall(r) {
  return parseDataPt(r.proximoContato) || parseDataPt(r.dataAgendada) || parseDataPt(r.dataContato) || '';
}

function contemBusca(linha, campos, termo) {
  if (!termo.trim()) return true;
  const t = termo.toLowerCase();
  return campos.some((f) => String(linha[f] || '').toLowerCase().includes(t));
}

/* ============================================================
   RENDER PRINCIPAL
   ============================================================ */

function renderizarTudo() {
  renderAlerta();
  atualizarNavBadges();
  if (!digitandoEm($('#linhas-recall'))) renderLinhasRecall();
  if (!digitandoEm($('#linhas-cirurgias'))) renderLinhasCirurgias();
  if (!digitandoEm($('#bloco-lembretes'))) renderLembretes();
  if (detalhesAbertos.recall && !gridRecall.editando) gridRecall.render();
  if (detalhesAbertos.cirurgias && !gridCirurgias.editando) gridCirurgias.render();
  const acomp = $('#acompanhamentos-lista');
  if ($('#veu-acomp')?.classList.contains('aberto') && !digitandoEm(acomp)) {
    acompanhamentosScreen.render();
  }
}

/* ---------- BARRA FIXA: acesso rápido ---------- */

function atualizarNavBadges() {
  const badge = (sel, n) => {
    const el = $(sel);
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !n;
  };
  badge('#badge-recall', store.recallsVencidos().length);
  badge('#badge-cirurgias', (revisoesPorMes().get(isoHoje().slice(0, 7)) || []).length);
  badge('#badge-lembretes', reminders.vencidos().length);
}

function ajustarBarraFixa() {
  const topo = $('.topo');
  if (topo) document.documentElement.style.setProperty('--topo-h', topo.offsetHeight + 'px');
}

/* ---------- SMART ALERT (só o que é crítico: recall do dia + cirurgias próximas) ---------- */

function urgencias() {
  const recalls = store.recallsVencidos();
  const cirurgiasProximas = store.cirurgiasFuturas().filter(({ iso }) => difDias(iso) <= 7);
  return { recalls, cirurgiasProximas };
}

function renderAlerta() {
  const el = $('#smart-alert');
  const { recalls, cirurgiasProximas } = urgencias();
  const total = recalls.length + cirurgiasProximas.length;

  if (!total) {
    el.innerHTML = `<div class="alerta alerta-ok">✓ nenhuma urgência para hoje — operação sob controle</div>`;
    return;
  }

  const grupo = (titulo, itens) =>
    itens.length
      ? `<div class="alerta-grupo"><h4>${titulo} <span class="contagem">${itens.length}</span></h4>${itens.slice(0, 6).join('')}</div>`
      : '';

  const itensRecall = recalls.map((r) => {
    const dd = difDias(dataAcaoRecall(r));
    return `<div class="alerta-item" data-al-recall="${r.key}">
      <span class="alerta-nome">${esc(r.nome)}</span>
      <span class="selo ${dd < 0 ? 'selo-coral' : 'selo-ambar'}">${dd < 0 ? 'venceu há ' + Math.abs(dd) + 'd' : 'é hoje'}</span>
      <button class="btn btn-claro btn-mini" data-al-contato="${r.key}">registrar</button>
    </div>`;
  });

  const itensCir = cirurgiasProximas.map(({ c, iso }) => {
    const dd = difDias(iso);
    return `<div class="alerta-item" data-al-cir="${c.key}">
      <span class="alerta-nome">${esc(c.paciente)}</span>
      <span class="alerta-det">${esc(c.cirurgia || 'cirurgia')}</span>
      <span class="selo ${dd <= 2 ? 'selo-coral' : 'selo-azul'}">${dd === 0 ? 'é hoje' : 'em ' + dd + 'd'}</span>
    </div>`;
  });

  el.innerHTML = `
    <div class="alerta ${alertaColapsado ? 'colapsado' : ''}">
      <button type="button" class="alerta-topo" id="alerta-toggle">
        <span class="alerta-badge">${total}</span>
        <strong>tarefas críticas &amp; pacientes do dia</strong>
        <span class="alerta-resumo">${recalls.length ? recalls.length + ' recall' : ''}${cirurgiasProximas.length ? ' · ' + cirurgiasProximas.length + ' cirurgia(s) próxima(s)' : ''}</span>
        <span class="alerta-seta">${alertaColapsado ? '▾' : '▴'}</span>
      </button>
      <div class="alerta-corpo">
        ${grupo('📞 pacientes do dia — recall', itensRecall)}
        ${grupo('🏥 cirurgias próximas', itensCir)}
      </div>
    </div>`;

  $('#alerta-toggle')?.addEventListener('click', () => {
    alertaColapsado = !alertaColapsado;
    renderAlerta();
  });
  el.querySelectorAll('[data-al-recall]').forEach((i) =>
    i.addEventListener('click', (e) => {
      if (e.target.closest('[data-al-contato]')) return;
      const linha = store.getRecallRow(i.dataset.alRecall);
      if (linha) abrirFichaDaLinha(linha, 'recall');
    }),
  );
  el.querySelectorAll('[data-al-contato]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirContato(b.dataset.alContato);
    }),
  );
  el.querySelectorAll('[data-al-cir]').forEach((i) =>
    i.addEventListener('click', () => {
      const linha = store.getCirurgiaRow(i.dataset.alCir);
      if (linha) abrirFichaDaLinha(linha, 'cirurgias');
    }),
  );
}

/* ---------- BLOCO RECALL (linhas) ---------- */

function renderLinhasRecall() {
  const el = $('#linhas-recall');

  const chips = ['todos', ...STATUS_RECALL];
  $('#filtros-recall').innerHTML = chips
    .map((s) => `<button class="filtro ${filtroRecall === s ? 'ativo' : ''}" data-fr="${esc(s)}">${s === 'todos' ? 'todas' : esc(s)}</button>`)
    .join('');
  $('#filtros-recall').querySelectorAll('[data-fr]').forEach((b) =>
    b.addEventListener('click', () => {
      filtroRecall = b.dataset.fr;
      renderLinhasRecall();
    }),
  );

  let rows = store.recall.filter((r) => String(r.nome || '').trim());
  if (filtroRecall !== 'todos') rows = rows.filter((r) => (r.status || '') === filtroRecall);
  if (atencaoMes) {
    const fim = fimDoMes();
    rows = rows.filter((r) => {
      if (r.status === 'Sem interesse') return false;
      const d = dataAcaoRecall(r);
      return d && d <= fim;
    });
  }
  rows = rows.filter((r) => contemBusca(r, ['nome', 'obs', 'ultimaConsulta', 'status'], buscaRecall));

  rows.sort((a, b) => {
    const da = dataAcaoRecall(a) || '9999';
    const db = dataAcaoRecall(b) || '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  el.innerHTML = rows.length
    ? rows
        .map((r) => {
          const prox = dataAcaoRecall(r);
          const dd = prox ? difDias(prox) : null;
          const vencida = dd !== null && dd <= 0 && !['Agendado', 'Sem interesse'].includes(r.status || '');
          return `<div class="linha ${r.key === ultimaNovaRecallKey ? 'linha-nova' : ''}" data-key="${r.key}">
        <div class="linha-nome" data-ficha="${r.key}" title="abrir ficha">
          ${esc(r.nome)}
          <span class="linha-sub">${esc(r.ultimaConsulta || '')}</span>
        </div>
        <select class="linha-status ${SELO_RECALL[r.status] || 'st-neutro'}" data-status="${r.key}" title="status — salva na planilha">
          ${['', ...STATUS_RECALL].map((s) => `<option value="${esc(s)}" ${(r.status || '') === s ? 'selected' : ''}>${s || '—'}</option>`).join('')}
        </select>
        <input class="linha-data ${vencida ? 'vencida' : ''}" data-prox="${r.key}" value="${esc(r.proximoContato || '')}" placeholder="próx. contato" title="próximo contato — salva na planilha">
        <input class="linha-obs" data-obs="${r.key}" value="${esc(r.obs || '')}" placeholder="observações da jornada… (salva sozinho)">
        <div class="linha-acoes">
          ${waBtnMini(r.contato, waMsgRecall(r.nome))}
          <button type="button" class="btn btn-claro btn-mini" data-reg="${r.key}">registrar</button>
        </div>
      </div>`;
        })
        .join('')
    : `<div class="vazio"><strong>nenhuma paciente aqui</strong>ajuste a busca ou os filtros</div>`;

  bindLinhasRecall(el);
}

function bindLinhasRecall(el) {
  el.querySelectorAll('[data-ficha]').forEach((n) =>
    n.addEventListener('click', () => {
      const linha = store.getRecallRow(n.dataset.ficha);
      if (linha) abrirFichaDaLinha(linha, 'recall');
    }),
  );
  el.querySelectorAll('[data-status]').forEach((s) =>
    s.addEventListener('change', () => {
      s.blur();
      store.editarCelula('recall', s.dataset.status, 'status', s.value);
      showToast('status salvo na planilha');
    }),
  );
  el.querySelectorAll('[data-prox]').forEach((i) => {
    const salvar = () => {
      const linha = store.getRecallRow(i.dataset.prox);
      if (linha && i.value !== (linha.proximoContato || '')) {
        store.editarCelula('recall', i.dataset.prox, 'proximoContato', i.value.trim());
        showToast('próximo contato salvo');
      }
    };
    i.addEventListener('change', salvar);
    i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur());
  });
  el.querySelectorAll('[data-obs]').forEach((i) => {
    const salvar = debounce(() => {
      const linha = store.getRecallRow(i.dataset.obs);
      if (linha && i.value !== (linha.obs || '')) {
        store.editarCelula('recall', i.dataset.obs, 'obs', i.value);
      }
    }, 800);
    i.addEventListener('input', salvar);
    i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur());
  });
  el.querySelectorAll('[data-reg]').forEach((b) =>
    b.addEventListener('click', () => abrirContato(b.dataset.reg)),
  );
  bindWa(el);
}

/* ---------- BLOCO CIRURGIAS & REVISÕES (linhas) ---------- */

/** revisões (próximo marco com data) agrupadas por mês 'yyyy-mm' */
function revisoesPorMes() {
  const mapa = new Map();
  for (const c of store.cirurgiasPassadas()) {
    if (!String(c.paciente || '').trim()) continue;
    const px = proximoMarco(store.marcosDe(c));
    if (!px || !px.dataISO) continue;
    const chave = px.dataISO.slice(0, 7);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push({ c, px });
  }
  return mapa;
}

function renderMesesCirurgias() {
  const el = $('#meses-cirurgias');
  if (!el) return;
  const mapa = revisoesPorMes();
  const base = paraData(isoHoje().slice(0, 7) + '-01');
  const pilulas = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const n = (mapa.get(chave) || []).length;
    const rotulo =
      d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') +
      ' ' +
      String(d.getFullYear()).slice(2);
    pilulas.push(
      `<button type="button" class="mes-pilula ${mesRevisao === chave ? 'ativo' : ''} ${n ? '' : 'vazio'}" data-mes="${chave}">${rotulo} <span class="n">${n}</span></button>`,
    );
  }
  el.innerHTML = `<div class="meses-rotulo">revisões por mês — toque para filtrar</div><div class="meses">${pilulas.join('')}</div>`;
  el.querySelectorAll('[data-mes]').forEach((b) =>
    b.addEventListener('click', () => {
      mesRevisao = mesRevisao === b.dataset.mes ? '' : b.dataset.mes;
      renderLinhasCirurgias();
    }),
  );
}

function renderLinhasCirurgias() {
  const el = $('#linhas-cirurgias');

  const chips = [
    ['todas', 'todas'],
    ['vencidas', 'revisões vencidas'],
    ['mes', 'este mês'],
    ['preop', 'pré-op'],
    ['concluidas', 'concluídas'],
  ];
  $('#filtros-cirurgias').innerHTML = chips
    .map(([id, rotulo]) => `<button class="filtro ${!mesRevisao && filtroCirurgias === id ? 'ativo' : ''}" data-fc="${id}">${rotulo}</button>`)
    .join('');
  $('#filtros-cirurgias').querySelectorAll('[data-fc]').forEach((b) =>
    b.addEventListener('click', () => {
      filtroCirurgias = b.dataset.fc;
      mesRevisao = '';
      renderLinhasCirurgias();
    }),
  );

  renderMesesCirurgias();

  const fim = fimDoMes();
  let itens = store.cirurgias
    .filter((c) => String(c.paciente || '').trim())
    .map((c) => {
      const iso = parseDataPt(c.data);
      const futura = iso && difDias(iso) >= 0;
      const marcos = futura ? [] : store.marcosDe(c);
      const px = futura ? null : proximoMarco(marcos);
      return { c, iso, futura, marcos, px };
    });

  if (mesRevisao) {
    itens = itens.filter(({ px }) => px && px.dataISO && px.dataISO.startsWith(mesRevisao));
  } else if (filtroCirurgias === 'vencidas') itens = itens.filter(({ px }) => px && px.dataISO && difDias(px.dataISO) <= 0);
  else if (filtroCirurgias === 'mes') itens = itens.filter(({ px, futura, iso }) => (px && px.dataISO && px.dataISO <= fim) || (futura && iso <= fim));
  else if (filtroCirurgias === 'preop') itens = itens.filter(({ futura }) => futura);
  else if (filtroCirurgias === 'concluidas') itens = itens.filter(({ futura, px }) => !futura && !px);

  if (atencaoMes) {
    itens = itens.filter(({ px, futura, iso }) => (px && px.dataISO && px.dataISO <= fim) || (futura && iso && iso <= fim));
  }
  itens = itens.filter(({ c }) => contemBusca(c, ['paciente', 'cirurgia', 'hospital'], buscaCirurgias));

  itens.sort((a, b) => {
    const da = a.futura ? a.iso : a.px?.dataISO || '9999';
    const db = b.futura ? b.iso : b.px?.dataISO || '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  el.innerHTML = itens.length
    ? itens
        .map(({ c, iso, futura, px }) => {
          const p = store.pacienteDaLinha(c, 'cirurgias');
          const pKey = p ? p.key : patientKey(c.paciente);
          const recallRow = p?.recallRows[p.recallRows.length - 1];
          const obsValor = recallRow ? recallRow.obs || '' : store.extrasDe(pKey).nota || '';

          let statusHtml;
          let dataHtml;
          if (futura) {
            const dd = difDias(iso);
            statusHtml = `<span class="linha-status st-azul linha-status-fixo">pré-op · ${dd === 0 ? 'é hoje' : 'faltam ' + dd + 'd'}</span>`;
            dataHtml = `<span class="linha-data">${esc(c.data)}</span>`;
          } else if (px) {
            const dd = px.dataISO ? difDias(px.dataISO) : null;
            statusHtml = `<select class="linha-status ${SELO_MARCO[px.status] || 'st-neutro'}" data-marco="${c.key}:${px.id}" title="revisão ${esc(px.label)} — salva na planilha">
              ${STATUS_MARCO.map((s) => `<option ${px.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>`;
            dataHtml = `<span class="linha-data ${dd !== null && dd < 0 ? 'vencida' : ''}" title="revisão ${esc(px.label)}">${px.dataISO ? fmt(px.dataISO) : '—'} · ${esc(px.label)}</span>`;
          } else {
            statusHtml = `<span class="linha-status st-verde linha-status-fixo">revisões concluídas ✓</span>`;
            dataHtml = `<span class="linha-data">—</span>`;
          }

          return `<div class="linha" data-key="${c.key}">
        <div class="linha-nome" data-ficha-cir="${c.key}" title="abrir ficha">
          ${esc(c.paciente)}
          <span class="linha-sub" title="${esc(c.cirurgia || '')}">${esc((c.cirurgia || '').slice(0, 60))}${(c.cirurgia || '').length > 60 ? '…' : ''}</span>
        </div>
        ${statusHtml}
        ${dataHtml}
        <input class="linha-obs" data-obs-cir="${c.key}" value="${esc(obsValor)}" placeholder="${recallRow ? 'observações (planilha Recall)…' : 'observações (nota do app)…'}">
        <div class="linha-acoes">
          ${waBtnMini(p?.telefone, waMsgRevisao(c.paciente, px?.label))}
        </div>
      </div>`;
        })
        .join('')
    : `<div class="vazio"><strong>${mesRevisao ? 'nenhuma revisão em ' + esc(rotuloMes(mesRevisao)) : 'nenhuma cirurgia aqui'}</strong>${mesRevisao ? 'toque no mês de novo para limpar o filtro' : 'ajuste a busca ou os filtros'}</div>`;

  bindLinhasCirurgias(el);
}

function rotuloMes(chave) {
  const d = paraData(chave + '-01');
  return d ? d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : chave;
}

function bindLinhasCirurgias(el) {
  el.querySelectorAll('[data-ficha-cir]').forEach((n) =>
    n.addEventListener('click', () => {
      const linha = store.getCirurgiaRow(n.dataset.fichaCir);
      if (linha) abrirFichaDaLinha(linha, 'cirurgias');
    }),
  );
  el.querySelectorAll('[data-marco]').forEach((s) =>
    s.addEventListener('change', () => {
      s.blur();
      const [cirKey, marcoId] = s.dataset.marco.split(':');
      const c = store.getCirurgiaRow(cirKey);
      const marco = c && store.marcosDe(c).find((m) => m.id === marcoId);
      if (marco) {
        store.setMarcoStatus(c, marco, s.value);
        showToast(s.value === 'Realizada' ? 'revisão concluída ✓' : 'status da revisão salvo');
      }
    }),
  );
  el.querySelectorAll('[data-obs-cir]').forEach((i) => {
    const salvar = debounce(() => {
      const c = store.getCirurgiaRow(i.dataset.obsCir);
      if (!c) return;
      const p = store.pacienteDaLinha(c, 'cirurgias');
      const recallRow = p?.recallRows[p.recallRows.length - 1];
      if (recallRow) {
        if (i.value !== (recallRow.obs || '')) store.editarCelula('recall', recallRow.key, 'obs', i.value);
      } else {
        const pKey = p ? p.key : patientKey(c.paciente);
        store.extrasDe(pKey).nota = i.value;
        store.salvarExtras();
      }
    }, 800);
    i.addEventListener('input', salvar);
    i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur());
  });
  bindWa(el);
}

/* ---------- LEMBRETES (estilo app Lembretes do Mac) ---------- */

function metaLembrete(l) {
  const partes = [];
  if (l.dataISO) {
    const dd = difDias(l.dataISO);
    let texto;
    let classe = '';
    if (dd < 0) {
      texto = dd === -1 ? 'ontem' : `venceu há ${Math.abs(dd)}d`;
      classe = 'lem-vencido';
    } else if (dd === 0) {
      texto = 'hoje';
      classe = 'lem-hoje';
    } else if (dd === 1) {
      texto = 'amanhã';
    } else {
      texto = fmt(l.dataISO);
    }
    if (l.hora) texto += ` · ${l.hora}`;
    partes.push(`<span class="${classe}">${esc(texto)}</span>`);
  } else {
    partes.push('<span>sem data</span>');
  }
  if (l.repetir && l.repetir !== 'nunca') {
    partes.push(`<span>↻ ${esc(repeticaoDe(l.repetir).label)}</span>`);
  }
  return partes.join('');
}

function lembreteHtml(l) {
  const prio = prioridadeDe(l.prioridade);
  return `<div class="lem ${l.feito ? 'feito' : ''}" data-lem="${l.id}">
    <button type="button" class="lem-check" data-lem-check="${l.id}" title="${l.feito ? 'reabrir' : l.repetir !== 'nunca' && l.dataISO ? 'concluir — remarca para a próxima data' : 'concluir'}"></button>
    <div class="lem-corpo" data-lem-edit="${l.id}" title="toque para editar prioridade, data e repetição">
      <div class="lem-titulo">${prio.sinais ? `<span class="lem-prio prio-${prio.id}">${prio.sinais}</span>` : ''}${esc(l.titulo)}</div>
      <div class="lem-meta">${metaLembrete(l)}</div>
      ${l.notas ? `<div class="lem-notas">${esc(l.notas)}</div>` : ''}
    </div>
    <button type="button" class="lem-ics" data-lem-ics="${l.id}" title="enviar para o app Lembretes do Mac">⤓</button>
  </div>`;
}

function renderLembretes() {
  const el = $('#linhas-lembretes');
  if (!el) return;
  const peso = (l) => prioridadeDe(l.prioridade).peso || 10;
  const abertos = reminders.lista
    .filter((l) => !l.feito)
    .sort((a, b) => {
      const da = a.dataISO || '9999';
      const db = b.dataISO || '9999';
      if (da !== db) return da < db ? -1 : 1;
      if (peso(a) !== peso(b)) return peso(a) - peso(b);
      return a.criadoEm < b.criadoEm ? -1 : 1;
    });
  const feitos = reminders.lista.filter((l) => l.feito).sort((a, b) => (a.concluidoEm > b.concluidoEm ? -1 : 1));

  el.innerHTML = abertos.length
    ? abertos.map(lembreteHtml).join('')
    : `<div class="vazio"><strong>nenhum lembrete</strong>escreva acima e tecle Enter — como no app Lembretes</div>`;

  const toggle = $('#lem-toggle-feitos');
  const caixa = $('#linhas-lembretes-feitos');
  if (feitos.length) {
    toggle.hidden = false;
    toggle.textContent = `${feitosVisiveis ? '▾' : '▸'} concluídos (${feitos.length})`;
    caixa.hidden = !feitosVisiveis;
    caixa.innerHTML = feitosVisiveis ? feitos.map(lembreteHtml).join('') : '';
  } else {
    toggle.hidden = true;
    caixa.hidden = true;
    caixa.innerHTML = '';
  }

  bindLembretes($('#bloco-lembretes'));
}

function bindLembretes(root) {
  root.querySelectorAll('[data-lem-check]').forEach((b) =>
    b.addEventListener('click', () => {
      const l = reminders.get(b.dataset.lemCheck);
      reminders.alternarFeito(b.dataset.lemCheck);
      if (l && l.repetir !== 'nunca' && l.dataISO && !l.feito) {
        showToast(`remarcado para ${fmt(reminders.get(b.dataset.lemCheck)?.dataISO || l.dataISO)}`);
      }
    }),
  );
  root.querySelectorAll('[data-lem-edit]').forEach((c) =>
    c.addEventListener('click', () => abrirLembrete(c.dataset.lemEdit)),
  );
  root.querySelectorAll('[data-lem-ics]').forEach((b) =>
    b.addEventListener('click', () => {
      const l = reminders.get(b.dataset.lemIcs);
      if (!l) return;
      baixarIcs(`lembrete-${(l.titulo || 'blue').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.ics`, [l]);
      showToast('arquivo baixado — abra no Mac para entrar no app Lembretes');
    }),
  );
}

function abrirLembrete(id) {
  const l = reminders.get(id);
  if (!l) return;
  lembreteAtual = id;
  $('#lem-titulo').value = l.titulo;
  $('#lem-notas').value = l.notas || '';
  $('#lem-prio').value = l.prioridade || 'nenhuma';
  $('#lem-repetir').value = l.repetir || 'nunca';
  $('#lem-data').value = l.dataISO || '';
  $('#lem-hora').value = l.hora || '';
  abrir('veu-lembrete');
}

function salvarLembrete() {
  const l = reminders.get(lembreteAtual);
  if (!l) return;
  const titulo = $('#lem-titulo').value.trim();
  if (!titulo) {
    showToast('dê um título ao lembrete');
    $('#lem-titulo')?.focus();
    return;
  }
  reminders.atualizar(lembreteAtual, {
    titulo,
    notas: $('#lem-notas').value.trim(),
    prioridade: $('#lem-prio').value,
    repetir: $('#lem-repetir').value,
    dataISO: $('#lem-data').value,
    hora: $('#lem-hora').value,
  });
  fechar('veu-lembrete');
  showToast('lembrete salvo');
}

function verificarNotificacoes() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  for (const l of reminders.paraNotificar()) {
    try {
      const n = new Notification(l.titulo || 'lembrete', {
        body: `${l.dataISO === isoHoje() ? 'hoje' : 'vencido'}${l.hora ? ' · ' + l.hora : ''}${l.notas ? '\n' + l.notas : ''}`,
        tag: l.id,
      });
      n.onclick = () => window.focus();
    } catch (_) {}
    reminders.marcarNotificado(l.id);
  }
}

function atualizarBotaoNotif() {
  const btn = $('#btn-lem-notif');
  if (!btn) return;
  btn.hidden = !('Notification' in window) || Notification.permission !== 'default';
}

/* ---------- CARD DE GESTÃO blue. ---------- */

function resumoGestao() {
  const recall = store.recall.filter((r) => String(r.nome || '').trim());
  const total = recall.length;
  const porStatus = {};
  STATUS_RECALL.forEach((s) => (porStatus[s] = 0));
  let semStatus = 0;
  recall.forEach((r) => {
    if (porStatus[r.status] !== undefined) porStatus[r.status]++;
    else semStatus++;
  });

  const cirurgias = store.cirurgias.filter((c) => String(c.paciente || '').trim());
  let revVencidas = 0;
  let revMarcadas = 0;
  let revRealizadas = 0;
  let preop = 0;
  for (const c of cirurgias) {
    const iso = parseDataPt(c.data);
    if (iso && difDias(iso) >= 0) {
      preop++;
      continue;
    }
    for (const m of store.marcosDe(c)) {
      if (!m.dataISO || difDias(m.dataISO) > 0) continue;
      if (m.status === 'Realizada') revRealizadas++;
      else if (m.status === 'Marcada') revMarcadas++;
      else revVencidas++;
    }
  }

  const motivos = {};
  let gargaloSemResposta = 0;
  let gargaloAguardando = 0;
  const kw = [
    [/dra\.?\s*aline/i, 'preferência Dra. Aline'],
    [/financeir|valor|investimento|pagamento|plano\b/i, 'financeiro'],
    [/viag|viaj|distân|distanc|país|exterior/i, 'viagem / distância'],
    [/outro m[ée]dico|outra cl[ií]nica|outro profissional/i, 'outro profissional'],
  ];
  recall.forEach((r) => {
    if (r.motivoRecusa) motivos[r.motivoRecusa] = (motivos[r.motivoRecusa] || 0) + 1;
    const obs = String(r.obs || '');
    kw.forEach(([re, label]) => {
      if (re.test(obs)) motivos[label] = (motivos[label] || 0) + 1;
    });
    if (r.status === 'Sem Resposta') gargaloSemResposta++;
    if (/aguardando resposta/i.test(obs)) gargaloAguardando++;
  });

  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total,
    porStatus,
    semStatus,
    pct,
    cirurgias: cirurgias.length,
    preop,
    revVencidas,
    revMarcadas,
    revRealizadas,
    motivos: Object.entries(motivos).sort((a, b) => b[1] - a[1]).slice(0, 5),
    gargaloSemResposta,
    gargaloAguardando,
  };
}

function abrirGestao() {
  const g = resumoGestao();
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tileCor = {
    Agendado: 'g-verde',
    Pendente: 'g-ambar',
    'Não agendou': 'g-coral',
    'Sem Resposta': 'g-coral',
    'Em Acompanhamento': 'g-azul',
    'Sem interesse': 'g-neutro',
  };

  const tiles = STATUS_RECALL.filter((s) => g.porStatus[s] > 0)
    .map(
      (s) => `<div class="g-tile ${tileCor[s]}">
        <div class="g-pct">${g.pct(g.porStatus[s])}%</div>
        <div class="g-label">${esc(s)}</div>
        <div class="g-n">${g.porStatus[s]} paciente${g.porStatus[s] !== 1 ? 's' : ''}</div>
      </div>`,
    )
    .join('');

  const totalRev = g.revRealizadas + g.revMarcadas + g.revVencidas;
  const tilesRev = totalRev
    ? `<div class="g-tile g-verde"><div class="g-pct">${Math.round((g.revRealizadas / totalRev) * 100)}%</div><div class="g-label">Revisões realizadas</div><div class="g-n">${g.revRealizadas} de ${totalRev} vencidas</div></div>
       <div class="g-tile g-azul"><div class="g-pct">${Math.round((g.revMarcadas / totalRev) * 100)}%</div><div class="g-label">Revisões marcadas</div><div class="g-n">${g.revMarcadas}</div></div>
       <div class="g-tile g-ambar"><div class="g-pct">${Math.round((g.revVencidas / totalRev) * 100)}%</div><div class="g-label">Revisões a agendar</div><div class="g-n">${g.revVencidas}</div></div>`
    : '';

  const motivosHtml = g.motivos.length
    ? g.motivos.map(([m, n]) => `${esc(m)} <b>(${n})</b>`).join(' · ')
    : 'sem recusas registradas';

  $('#cartao-gestao').innerHTML = `
    <div class="gestao-topo">
      <div class="gestao-logo">blue<span class="gestao-ponto">.</span></div>
      <div class="gestao-cab">
        <div class="gestao-titulo">Relatório de Gestão</div>
        <div class="gestao-data">${dataLonga} · Central da Concierge — Helen</div>
      </div>
    </div>

    <div class="gestao-visao">
      <b>${g.total}</b> pacientes em recall ativo · <b>${g.cirurgias}</b> cirurgias acompanhadas
      (${g.preop} em pré-operatório) · <b>${g.porStatus['Agendado']}</b> com consulta agendada ·
      <b>${g.revRealizadas + g.revMarcadas}</b> revisões realizadas ou marcadas.
    </div>

    <div class="gestao-secao">Status do recall</div>
    <div class="gestao-tiles">${tiles}</div>

    ${totalRev ? `<div class="gestao-secao">Revisões pós-operatórias</div><div class="gestao-tiles">${tilesRev}</div>` : ''}

    <div class="gestao-secao">Insights ✨</div>
    <div class="gestao-insights">
      <div class="g-insight">💬 <b>Motivos de recusa:</b> ${motivosHtml}</div>
      <div class="g-insight">📵 <b>Gargalos de comunicação:</b> ${g.gargaloSemResposta} paciente${g.gargaloSemResposta !== 1 ? 's' : ''} sem resposta no WhatsApp · ${g.gargaloAguardando} aguardando retorno</div>
      <div class="g-insight g-gemini" id="gestao-gemini"></div>
    </div>

    <div class="gestao-rodape">operação sob controle · gerado em tempo real pela blue<span class="gestao-ponto">.</span> Central</div>`;

  abrir('veu-gestao');

  // refinamento assíncrono via Gemini (quando conectado) — o card já está completo sem ele
  if (syncService.api.configured) {
    const alvo = $('#gestao-gemini');
    alvo.innerHTML = '<span class="spinner spinner-inline"></span> análise Gemini…';
    syncService.api
      .summarize({
        _tipo: 'gestao',
        totalRecall: g.total,
        porStatus: g.porStatus,
        cirurgias: g.cirurgias,
        preop: g.preop,
        revisoes: { realizadas: g.revRealizadas, marcadas: g.revMarcadas, aAgendar: g.revVencidas },
        motivos: Object.fromEntries(g.motivos),
        gargalos: { semResposta: g.gargaloSemResposta, aguardando: g.gargaloAguardando },
      })
      .then((r) => {
        const el = $('#gestao-gemini');
        if (el) el.innerHTML = `✨ <b>Análise Gemini:</b> ${esc(r.text)}`;
      })
      .catch(() => {
        const el = $('#gestao-gemini');
        if (el) el.innerHTML = '';
      });
  }
}

function textoGestao() {
  const g = resumoGestao();
  const linhas = [
    `blue. — Relatório de Gestão · ${new Date().toLocaleDateString('pt-BR')}`,
    '',
    `${g.total} pacientes em recall · ${g.cirurgias} cirurgias (${g.preop} pré-op)`,
    ...STATUS_RECALL.filter((s) => g.porStatus[s] > 0).map((s) => `• ${s}: ${g.porStatus[s]} (${g.pct(g.porStatus[s])}%)`),
    `• Revisões: ${g.revRealizadas} realizadas · ${g.revMarcadas} marcadas · ${g.revVencidas} a agendar`,
    `• Motivos de recusa: ${g.motivos.map(([m, n]) => `${m} (${n})`).join(', ') || '—'}`,
    `• Gargalos: ${g.gargaloSemResposta} sem resposta no WhatsApp · ${g.gargaloAguardando} aguardando retorno`,
  ];
  return linhas.join('\n');
}

/* ---------- FICHA UNIFICADA ---------- */

function abrirFichaDaLinha(linha, tipo) {
  const p = store.pacienteDaLinha(linha, tipo);
  if (p) abrirFicha(p.key);
}

function abrirFicha(pKey) {
  const p = store.getPaciente(pKey);
  if (!p) return;
  resumoAtual = pKey;
  const extras = store.extrasDe(pKey);
  const appCfg = store.appConfig;

  const recallHtml = p.recallRows
    .map(
      (r) => `
    <div class="ficha-recall-linha">
      <div><span class="selo ${SELO_RECALL_FICHA[r.status] || 'selo-neutro'}">${esc(r.status || '—')}</span>
        ${r.motivoRecusa ? `<span class="celula-sub"> · motivo: ${esc(r.motivoRecusa)}</span>` : ''}</div>
      <div class="celula-sub">última consulta: ${esc(r.ultimaConsulta || '—')} · contato: ${esc(r.dataContato || '—')} · próximo: ${esc(r.proximoContato || '—')}</div>
      ${r.obs ? `<div class="celula-sub">obs: ${esc(r.obs)}</div>` : ''}
      <button class="btn btn-claro btn-mini" data-contato="${r.key}">registrar contato</button>
    </div>`,
    )
    .join('');

  const cirurgiasHtml = p.cirurgiaRows
    .map((c) => {
      const iso = parseDataPt(c.data);
      const futura = iso && difDias(iso) >= 0;
      if (futura) {
        const dd = difDias(iso);
        store.extrasDe(pKey, c.cirurgia); // aplica o Protocolo Interno de Exames se ainda não customizado
        const feitos = extras.exames.filter((e) => e.feito).length;
        return `<div class="ficha-cirurgia">
          <div class="ficha-cirurgia-topo">
            <strong>${esc(c.cirurgia || 'cirurgia')}</strong>
            <span class="celula-sub">${esc(c.data)}${c.hospital ? ' · ' + esc(c.hospital) : ''} · <b style="color:var(--azul-escuro)">${dd === 0 ? 'é hoje' : 'faltam ' + dd + ' dias'}</b></span>
          </div>
          <div class="celula-sub" style="margin-bottom:8px">
            exames: ${feitos} de ${extras.exames.length} · protocolo: ${esc(extras.protocoloNome || 'genérico')}
            <button type="button" class="btn btn-fantasma btn-mini" data-protocolo="${c.key}" title="reaplicar o checklist do Protocolo Interno de Exames (descarta alterações manuais)">↺ protocolo</button>
          </div>
          <div class="lista-exames">${extras.exames
            .map(
              (e, i) => `<div class="exame ${e.feito ? 'feito' : ''}" data-exame="${i}">
                <div class="caixa"></div><span>${esc(e.nome)}</span>
                <button class="remover" data-rem-exame="${i}">×</button>
              </div>`,
            )
            .join('')}
          </div>
          <div class="add-exame"><input class="campo" id="ficha-add-exame" placeholder="adicionar exame (Enter)"></div>
        </div>`;
      }
      const marcos = store.marcosDe(c);
      const trilho = marcos
        .map(
          (m) => `
        <div class="ficha-marco">
          <div class="no ${estadoMarco(m)}"><div class="bola"></div></div>
          <div class="ficha-marco-info">
            <div class="ficha-marco-label">${esc(m.label)} <span class="celula-sub">(${m.dias}d${m.col ? ' · planilha' : ' · só no app'})</span></div>
            <div class="celula-sub">${m.dataISO ? fmtLonga(m.dataISO) : 'sem data'}</div>
          </div>
          <select class="campo mini sel-marco-ficha" data-cir="${c.key}" data-marco="${m.id}">
            ${STATUS_MARCO.map((s) => `<option ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>`,
        )
        .join('');
      const tpl = templateParaCirurgia(c, appCfg, pKey);
      return `
      <div class="ficha-cirurgia">
        <div class="ficha-cirurgia-topo">
          <strong>${esc(c.cirurgia || 'cirurgia')}</strong>
          <span class="celula-sub">${esc(c.data || 'sem data')}${c.hospital ? ' · ' + esc(c.hospital) : ''} · template: ${esc(tpl.nome)}</span>
        </div>
        ${trilho}
      </div>`;
    })
    .join('');

  const temOverride = Boolean(appCfg.overrides[pKey]?.length);
  const primeiraPosOp = p.cirurgiaRows.find((c) => {
    const iso = parseDataPt(c.data);
    return !iso || difDias(iso) < 0;
  });
  const marcosBase = temOverride
    ? appCfg.overrides[pKey]
    : primeiraPosOp
      ? store.marcosDe(primeiraPosOp).map(({ id, label, dias, col }) => ({ id, label, dias, col }))
      : [];

  const tplOptions = appCfg.templates
    .map(
      (t) =>
        `<option value="${t.id}" ${appCfg.assignments[pKey] === t.id ? 'selected' : ''}>${esc(t.nome)}${t.padrao ? ' (padrão)' : ''}</option>`,
    )
    .join('');

  $('#conteudo-ficha').innerHTML = `
    <div class="ficha-topo">
      <div class="avatar">${iniciais(p.nome)}</div>
      <div><div class="nome">${esc(p.nome)}</div>
      <div class="meta">${p.telefone ? esc(formatPhoneDisplay(p.telefone)) : 'sem telefone'} ·
        ${p.recallRows.length ? 'recall' : ''}${p.recallRows.length && p.cirurgiaRows.length ? ' + ' : ''}${p.cirurgiaRows.length ? p.cirurgiaRows.length + ' cirurgia(s)' : ''}</div></div>
    </div>
    <div class="ficha-acoes">
      ${p.telefone ? `<button type="button" class="btn btn-wa" data-wa="${esc(buildWhatsAppLink(p.telefone, waMsgRecall(p.nome)))}">WhatsApp</button>` : ''}
      <button type="button" class="btn btn-gemini" id="btn-ficha-resumir">✨ Resumir com Gemini</button>
    </div>
    ${p.recallRows.length ? `<div class="ficha-secao"><h4>recall</h4>${recallHtml}</div>` : ''}
    ${p.cirurgiaRows.length ? `<div class="ficha-secao"><h4>cirurgias e revisões</h4>${cirurgiasHtml}</div>` : ''}
    ${marcosBase.length
      ? `<div class="ficha-secao"><h4>prazos de revisão</h4>
        <div class="linha-campos" style="align-items:center">
          <div class="campo-grupo" style="flex:1"><label>template do procedimento</label>
            <select class="campo" id="ficha-tpl">${tplOptions}</select></div>
          <button class="btn btn-claro" id="btn-ficha-override" style="margin-top:14px">${temOverride ? 'editar prazos desta paciente' : 'personalizar prazos desta paciente'}</button>
        </div>
        ${temOverride ? '<div class="celula-sub">⚠ esta paciente usa prazos personalizados (override)</div>' : ''}
        <div id="ficha-override-editor" style="display:none"></div>
      </div>`
      : ''}
    <div class="ficha-secao"><h4>histórico de contato (app)</h4>
      ${extras.historico.length
        ? extras.historico
            .slice()
            .reverse()
            .map(
              (hh) =>
                `<div class="hist-item"><div class="data">${fmt(hh.data)}</div><div><strong style="font-weight:600">${esc(hh.canal)}</strong> · ${esc(hh.resultado)}${hh.nota ? `<div class="celula-sub">${esc(hh.nota)}</div>` : ''}</div></div>`,
            )
            .join('')
        : '<div class="celula-sub">nenhum contato registrado pelo app ainda</div>'}
    </div>
    <div class="modal-rodape">
      <button class="btn btn-azul" id="btn-ficha-fechar">fechar</button>
    </div>`;

  $('#btn-ficha-fechar')?.addEventListener('click', () => fechar('veu-ficha'));
  $('#btn-ficha-resumir')?.addEventListener('click', () => gerarResumo(pKey));
  $('#conteudo-ficha').querySelectorAll('[data-contato]').forEach((b) =>
    b.addEventListener('click', () => {
      fechar('veu-ficha');
      abrirContato(b.dataset.contato);
    }),
  );
  $('#conteudo-ficha').querySelectorAll('.sel-marco-ficha').forEach((el) =>
    el.addEventListener('change', () => {
      const c = store.getCirurgiaRow(el.dataset.cir);
      const marco = c && store.marcosDe(c).find((m) => m.id === el.dataset.marco);
      if (marco) {
        store.setMarcoStatus(c, marco, el.value);
        showToast('status da revisão atualizado');
        abrirFicha(pKey);
      }
    }),
  );
  $('#conteudo-ficha').querySelectorAll('[data-exame]').forEach((el) =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-rem-exame]')) return;
      const i = +el.dataset.exame;
      extras.exames[i].feito = !extras.exames[i].feito;
      store.salvarExtras();
      abrirFicha(pKey);
    }),
  );
  $('#conteudo-ficha').querySelectorAll('[data-rem-exame]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      extras.exames.splice(+el.dataset.remExame, 1);
      store.marcarExameCustom(pKey);
      abrirFicha(pKey);
    }),
  );
  $('#ficha-add-exame')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      extras.exames.push({ nome: e.target.value.trim(), feito: false });
      store.marcarExameCustom(pKey);
      abrirFicha(pKey);
    }
  });
  $('#conteudo-ficha').querySelectorAll('[data-protocolo]').forEach((el) =>
    el.addEventListener('click', () => {
      const c = store.getCirurgiaRow(el.dataset.protocolo);
      if (!c) return;
      const p = store.aplicarProtocoloPreop(pKey, c.cirurgia);
      showToast(`protocolo aplicado: ${p.protocoloNome}`);
      abrirFicha(pKey);
    }),
  );
  $('#ficha-tpl')?.addEventListener('change', (e) => {
    const tplId = e.target.value;
    const padrao = store.appConfig.templates.find((t) => t.padrao)?.id;
    store.atribuirTemplate(pKey, tplId === padrao ? '' : tplId);
    showToast('template atribuído');
    abrirFicha(pKey);
  });
  $('#btn-ficha-override')?.addEventListener('click', () => {
    const box = $('#ficha-override-editor');
    if (box.style.display !== 'none') {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.innerHTML =
      marcosEditorHtml(marcosBase, 'ov') +
      `<button class="btn btn-fantasma" id="btn-ficha-override-reset" style="color:var(--coral)">restaurar prazos do template</button>`;
    bindMarcosEditor(box.querySelector('.marcos-editor'), marcosBase, (novos) => {
      store.salvarOverride(pKey, novos);
      showToast('prazos personalizados salvos');
      abrirFicha(pKey);
      $('#ficha-override-editor').style.display = 'block';
    });
    $('#btn-ficha-override-reset')?.addEventListener('click', () => {
      store.salvarOverride(pKey, null);
      showToast('prazos restaurados para o template');
      abrirFicha(pKey);
    });
  });
  bindWa($('#conteudo-ficha'));
  abrir('veu-ficha');
}

/* ---------- NOVA PACIENTE RECALL (poucos cliques) ---------- */

function abrirNovaRecall() {
  $('#nr-nome').value = '';
  $('#nr-fone').value = '';
  $('#nr-status').value = 'Pendente';
  $('#nr-ultima').value = '';
  $('#nr-proxima').value = isoHoje();
  $('#nr-obs').value = '';
  abrir('veu-nova-recall');
  setTimeout(() => $('#nr-nome')?.focus(), 60);
}

function salvarNovaRecall() {
  const nome = $('#nr-nome').value.trim();
  if (!nome) {
    showToast('informe o nome da paciente');
    $('#nr-nome')?.focus();
    return;
  }
  // limpa filtros para a paciente nova aparecer na hora, no espelho da planilha
  filtroRecall = 'todos';
  buscaRecall = '';
  const buscaEl = $('#busca-recall');
  if (buscaEl) buscaEl.value = '';
  const linha = store.adicionarLinha('recall', {
    nome,
    contato: $('#nr-fone').value.trim(),
    status: $('#nr-status').value,
    ultimaConsulta: $('#nr-ultima').value.trim(),
    proximoContato: $('#nr-proxima').value ? fmtDataPlanilhaRecall($('#nr-proxima').value) : '',
    dataContato: fmtDataPlanilhaRecall(isoHoje()),
    obs: $('#nr-obs').value.trim(),
  });
  ultimaNovaRecallKey = linha.key;
  renderLinhasRecall();
  fechar('veu-nova-recall');
  requestAnimationFrame(() => {
    document
      .querySelector(`#linhas-recall .linha[data-key="${linha.key}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  setTimeout(() => {
    if (ultimaNovaRecallKey === linha.key) ultimaNovaRecallKey = '';
  }, 2600);
  showToast(
    syncService.configured
      ? `${nome} salva — enviando para o Google Sheets…`
      : `${nome} salva localmente — conecte as planilhas para sincronizar`,
  );
}

/* ---------- REGISTRAR CONTATO ---------- */

function abrirContato(recallKey) {
  const r = store.getRecallRow(recallKey);
  if (!r) return;
  contatoAtual = recallKey;
  $('#contato-sub').textContent = `${r.nome} — grava direto na planilha Recall`;
  $('#c-nota').value = '';
  $('#c-agendada').value = '';
  $('#c-proxima').value = somarDias(isoHoje(), 7);
  abrir('veu-contato');
}

function salvarContato() {
  const r = store.getRecallRow(contatoAtual);
  if (!r) return;
  const status = $('#c-resultado').value;
  const canal = $('#c-canal').value;
  const nota = $('#c-nota').value.trim();
  const agendada = $('#c-agendada').value;
  const proxima = $('#c-proxima').value;

  store.editarCelula('recall', r.key, 'status', status);
  store.editarCelula('recall', r.key, 'dataContato', fmtDataPlanilhaRecall(isoHoje()));
  if (proxima) store.editarCelula('recall', r.key, 'proximoContato', fmtDataPlanilhaRecall(proxima));
  if (agendada) store.editarCelula('recall', r.key, 'dataAgendada', fmtDataPlanilhaRecall(agendada));
  if (nota) store.editarCelula('recall', r.key, 'obs', nota);

  const p = store.pacienteDaLinha(r, 'recall');
  if (p) {
    store.extrasDe(p.key).historico.push({ data: isoHoje(), canal, resultado: status, nota });
    store.salvarExtras();
  }
  fechar('veu-contato');
  showToast('contato salvo na planilha');
}

/* ---------- RESUMO ✨ (paciente) ---------- */

async function gerarResumo(pKey) {
  const p = store.getPaciente(pKey || resumoAtual || '');
  if (!p) {
    showToast('abra uma paciente primeiro (⌘K)');
    return;
  }
  resumoAtual = p.key;
  abrir('veu-resumo');
  $('#resumo-sub').textContent = p.nome;
  $('#resumo-conteudo').innerHTML =
    '<div class="loading-state"><span class="spinner"></span> Gerando resumo com Gemini…</div>';
  try {
    const snapshot = pacienteSnapshot(p, store);
    const result = await summaryService.summarize(snapshot);
    resumoTexto = result.text;
    const via = { gemini: 'Gemini', local: 'resumo local (sem API)' }[result.provider] || result.provider;
    $('#resumo-sub').textContent = `${p.nome} · ${via}`;
    $('#resumo-conteudo').innerHTML = `<pre class="resumo-texto">${esc(resumoTexto)}</pre>`;
  } catch (e) {
    $('#resumo-conteudo').innerHTML = `<div class="vazio"><strong>Erro</strong>${esc(e.message)}</div>`;
  }
}

function bindResumoModal() {
  $('#btn-resumo-copiar')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(resumoTexto);
    showToast('copiado');
  });
  $('#btn-resumo-regenerar')?.addEventListener('click', () => gerarResumo(resumoAtual));
  $('#btn-resumo-notas')?.addEventListener('click', () => {
    const p = store.getPaciente(resumoAtual);
    const r = p?.recallRows[p.recallRows.length - 1];
    if (r) {
      const novo = (r.obs ? r.obs + ' · ' : '') + resumoTexto.replace(/\n+/g, ' ').slice(0, 400);
      store.editarCelula('recall', r.key, 'obs', novo);
      showToast('inserido em OBSERVAÇÕES da planilha');
    } else {
      showToast('paciente sem linha na planilha Recall');
    }
    fechar('veu-resumo');
  });
  $('#btn-resumo-fechar')?.addEventListener('click', () => fechar('veu-resumo'));
}

/* ---------- EXPORT / CONFIG / BUSCA ---------- */

function exportarDados() {
  showLoadingToast('gerando XLSX…');
  try {
    const filename = exportToXlsx({
      recallRows: store.recall,
      cirurgiaRows: store.cirurgias,
      headerLabel: headerLabelCirurgias,
    });
    showToast(`✓ ${filename}`);
  } catch (e) {
    showToast('erro: ' + (e.message || 'exportação falhou'));
  }
}

function bindConfigModal() {
  $('#cfg-webapp').value = store.config.webAppUrl || '';
  $('#cfg-secret').value = store.config.apiSecret || '';
  $('#cfg-url-recall').value = store.config.recallSheetUrl || '';
  $('#cfg-url-cirurgias').value = store.config.cirurgiasSheetUrl || '';

  $('#btn-link-magico')?.addEventListener('click', async () => {
    const cfg = {
      ...store.config,
      webAppUrl: $('#cfg-webapp').value.trim() || store.config.webAppUrl,
      apiSecret: $('#cfg-secret').value.trim() || store.config.apiSecret,
      recallSheetUrl: $('#cfg-url-recall').value.trim() || store.config.recallSheetUrl,
      cirurgiasSheetUrl: $('#cfg-url-cirurgias').value.trim() || store.config.cirurgiasSheetUrl,
    };
    const link = buildLinkInstalacao(cfg);
    if (!link) {
      showToast('preencha a URL do Web App e a senha primeiro');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast('link de instalação copiado — use como atalho no Mac da Helen');
    } catch (_) {
      prompt('Copie o link de instalação:', link);
    }
  });

  $('#btn-salvar-config')?.addEventListener('click', async () => {
    const btn = $('#btn-salvar-config');
    btn.classList.add('loading');
    btn.textContent = 'sincronizando…';
    Object.assign(store.config, {
      webAppUrl: $('#cfg-webapp').value.trim(),
      apiSecret: $('#cfg-secret').value.trim(),
      recallSheetUrl: $('#cfg-url-recall').value.trim(),
      cirurgiasSheetUrl: $('#cfg-url-cirurgias').value.trim(),
    });
    store.persistConfig();
    try {
      await syncService.configure(store.config);
      summaryService.setSheetsApi(syncService.api);
      atualizarLinksPlanilhas();
      fechar('veu-config');
      showToast('planilhas conectadas — sync automático ativo');
    } catch (e) {
      showToast('erro: ' + e.message);
    } finally {
      btn.classList.remove('loading');
      btn.textContent = 'conectar e sincronizar';
    }
  });
}

function atualizarLinksPlanilhas() {
  const br = $('#btn-abrir-recall');
  const bc = $('#btn-abrir-cirurgias');
  if (store.config.recallSheetUrl && br) {
    br.style.display = 'inline-flex';
    br.onclick = () => window.open(store.config.recallSheetUrl, '_blank');
  }
  if (store.config.cirurgiasSheetUrl && bc) {
    bc.style.display = 'inline-flex';
    bc.onclick = () => window.open(store.config.cirurgiasSheetUrl, '_blank');
  }
}

function abrirBusca() {
  abrir('veu-busca');
  $('#campo-busca').value = '';
  renderizarBusca('');
  setTimeout(() => $('#campo-busca').focus(), 60);
}

function renderizarBusca(termo) {
  const res = store.search(termo);
  buscaIndice = 0;
  $('#busca-resultados').innerHTML = res.length
    ? res
        .map((p, i) => {
          const cir = p.cirurgiaRows[0];
          const rec = p.recallRows[p.recallRows.length - 1];
          const meta = [cir ? `cirurgia ${cir.data}` : '', rec ? `recall: ${rec.status || '—'}` : '']
            .filter(Boolean)
            .join(' · ');
          return `
      <div class="busca-item ${i === 0 ? 'marcado' : ''}" data-pk="${p.key}">
        <div class="avatar">${iniciais(p.nome)}</div>
        <div><div class="nome">${esc(p.nome)}</div>
        <div class="meta">${esc(meta || 'sem registros')}</div></div>
      </div>`;
        })
        .join('')
    : '<div class="vazio">nenhuma paciente encontrada</div>';

  $('#busca-resultados').querySelectorAll('.busca-item').forEach((el) =>
    el.addEventListener('click', () => {
      fechar('veu-busca');
      abrirFicha(el.dataset.pk);
    }),
  );
}

/* ---------- modais ---------- */

function abrir(id) {
  $('#' + id).classList.add('aberto');
}

function fechar(id) {
  $('#' + id).classList.remove('aberto');
}

/* ---------- init ---------- */

function initApp() {
  gridRecall.o.el = $('#grid-recall');
  gridCirurgias.o.el = $('#grid-cirurgias');
  acompanhamentosScreen = new AcompanhamentosScreen({
    el: $('#acompanhamentos-lista'),
    store,
    toast: showToast,
  });

  // acesso rápido: recall / cirurgias & revisões / lembretes lado a lado
  document.querySelectorAll('[data-ir]').forEach((b) =>
    b.addEventListener('click', () => {
      const alvo = document.getElementById(b.dataset.ir);
      if (!alvo) return;
      alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      alvo.classList.remove('flash');
      void alvo.offsetWidth;
      alvo.classList.add('flash');
      setTimeout(() => alvo.classList.remove('flash'), 1700);
    }),
  );
  ajustarBarraFixa();
  window.addEventListener('resize', ajustarBarraFixa);
  window.addEventListener('load', ajustarBarraFixa);

  // suporte → WhatsApp direto
  const waSuporte = buildWhatsAppLink(
    SUPORTE_WHATSAPP,
    'Olá! Aqui é a Helen, da blue. Preciso de ajuda com a central da concierge.',
  );
  ['#btn-suporte', '#lnk-suporte'].forEach((sel) => {
    const a = $(sel);
    if (a) a.href = waSuporte;
  });

  // lembretes
  $('#lem-novo')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      reminders.adicionar({ titulo: e.target.value.trim() });
      e.target.value = '';
      renderLembretes(); // o guard digitandoEm pula o render enquanto o input tem foco
      showToast('lembrete criado — toque nele para data, prioridade e repetição');
    }
  });
  $('#lem-toggle-feitos')?.addEventListener('click', () => {
    feitosVisiveis = !feitosVisiveis;
    renderLembretes();
  });
  $('#btn-lem-salvar')?.addEventListener('click', salvarLembrete);
  $('#btn-lem-excluir')?.addEventListener('click', () => {
    reminders.remover(lembreteAtual);
    fechar('veu-lembrete');
    showToast('lembrete excluído');
  });
  $('#btn-lem-ics')?.addEventListener('click', () => {
    const l = reminders.get(lembreteAtual);
    if (!l) return;
    baixarIcs('lembrete-blue.ics', [l]);
    showToast('arquivo baixado — abra no Mac para entrar no app Lembretes');
  });
  $('#btn-lem-exportar')?.addEventListener('click', () => {
    if (!reminders.lista.length) {
      showToast('nenhum lembrete para exportar');
      return;
    }
    baixarIcs('lembretes-blue.ics', reminders.lista);
    showToast('arquivo baixado — abra no Mac para importar tudo no app Lembretes');
  });
  $('#btn-lem-notif')?.addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      showToast(perm === 'granted' ? 'notificações ativadas — os lembretes avisam na tela do Mac' : 'notificações não autorizadas pelo navegador');
    } catch (_) {}
    atualizarBotaoNotif();
  });
  atualizarBotaoNotif();
  verificarNotificacoes();
  setInterval(verificarNotificacoes, 30000);

  // ver detalhes (planilhas ocultas)
  [['recall', gridRecall], ['cirurgias', gridCirurgias]].forEach(([tipo, grid]) => {
    const btn = $('#btn-det-' + tipo);
    const det = $('#det-' + tipo);
    btn?.addEventListener('click', () => {
      detalhesAbertos[tipo] = !detalhesAbertos[tipo];
      det.hidden = !detalhesAbertos[tipo];
      btn.textContent = (detalhesAbertos[tipo] ? '▾ ocultar' : '▸ ver') + ` detalhes — planilha ${tipo === 'recall' ? 'Recall' : 'Cirurgias'} completa`;
      if (detalhesAbertos[tipo]) grid.render();
    });
  });

  // buscas dos blocos
  $('#busca-recall')?.addEventListener('input', (e) => {
    buscaRecall = e.target.value;
    renderLinhasRecall();
    $('#busca-recall').focus();
  });
  $('#busca-cirurgias')?.addEventListener('input', (e) => {
    buscaCirurgias = e.target.value;
    renderLinhasCirurgias();
    $('#busca-cirurgias').focus();
  });

  // atenção do mês
  $('#btn-atencao-mes')?.addEventListener('click', () => {
    atencaoMes = !atencaoMes;
    $('#btn-atencao-mes').classList.toggle('ativo', atencaoMes);
    renderLinhasRecall();
    renderLinhasCirurgias();
    showToast(atencaoMes ? 'mostrando só quem precisa de atenção este mês' : 'mostrando todas');
  });

  // rodapé técnico
  $('#btn-acompanhamentos')?.addEventListener('click', () => {
    acompanhamentosScreen.render();
    abrir('veu-acomp');
  });
  $('#btn-acomp-fechar')?.addEventListener('click', () => fechar('veu-acomp'));
  $('#btn-config')?.addEventListener('click', () => abrir('veu-config'));

  // topo
  $('#btn-exportar')?.addEventListener('click', exportarDados);
  $('#btn-gestao')?.addEventListener('click', abrirGestao);
  $('#btn-gestao-fechar')?.addEventListener('click', () => fechar('veu-gestao'));
  $('#btn-gestao-imprimir')?.addEventListener('click', () => window.print());
  $('#btn-gestao-copiar')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(textoGestao());
    showToast('relatório copiado — cole no WhatsApp da gestão');
  });

  $('#btn-salvar-contato')?.addEventListener('click', salvarContato);
  $('#btn-nova-recall')?.addEventListener('click', abrirNovaRecall);
  $('#btn-salvar-nova-recall')?.addEventListener('click', salvarNovaRecall);

  document.querySelectorAll('.veu').forEach((v) =>
    v.addEventListener('mousedown', (e) => {
      if (e.target === v) v.classList.remove('aberto');
    }),
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.veu.aberto').forEach((v) => v.classList.remove('aberto'));
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      abrirBusca();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      $('#busca-recall')?.focus();
    }
  });

  const debouncedSearch = debounce((v) => renderizarBusca(v), 50);
  $('#campo-busca')?.addEventListener('input', (e) => debouncedSearch(e.target.value));
  $('#campo-busca')?.addEventListener('keydown', (e) => {
    const itens = [...document.querySelectorAll('.busca-item')];
    if (!itens.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buscaIndice = Math.min(buscaIndice + 1, itens.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buscaIndice = Math.max(buscaIndice - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      itens[buscaIndice].click();
      return;
    }
    itens.forEach((el, i) => el.classList.toggle('marcado', i === buscaIndice));
  });

  bindResumoModal();
  bindConfigModal();
  atualizarLinksPlanilhas();
  renderizarTudo();

  if (store.config.webAppUrl && store.config.apiSecret) {
    syncService
      .configure(store.config)
      .then(() => summaryService.setSheetsApi(syncService.api))
      .catch((e) => renderSyncIndicator({ status: 'error', detail: e.message }));
  } else {
    renderSyncIndicator({ status: 'offline', detail: 'Conecte as planilhas Google' });
    setTimeout(() => abrir('veu-config'), 1200);
  }
}

initApp();

export { store, syncService, exportarDados, gerarResumo };
