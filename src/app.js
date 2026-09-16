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
  FONTES_APP,
  FONTE_KEY,
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
import { estadoMarco, templateParaCirurgia } from './utils/templates.js';
import { Store } from './services/store.js';
import { SyncService } from './services/syncService.js';
import { GeminiApi, MODELOS_GEMINI } from './services/geminiApi.js';
import { PAPEL_CONCIERGE } from './services/summaryService.js';
import {
  RemindersStore,
  prioridadeDe,
  repeticaoDe,
  baixarIcs,
  interpretarLembrete,
} from './services/reminders.js';
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
let buscaRecall = '';
let buscaCirurgias = '';
let anoCirurgias = ''; // '' = todos os anos com cirurgia na planilha; ou '2026', '2027'…
let conversaSuporte = [];
let ultimaNovaRecallKey = ''; // destaque da paciente recém-registrada
let ultimaNovaCirurgiaKey = ''; // destaque da cirurgia recém-cadastrada
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

const gemini = new GeminiApi({
  apiKey: store.config.geminiApiKey,
  modelo: store.config.geminiModel,
});
const summaryService = new SummaryService({ gemini });
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
  compact: true,
  getRows: () => cirurgiasVisiveis(),
  onEdit: (key, field, value) => store.editarCelula('cirurgias', key, field, value),
  onAddRow: () => abrirNovaCirurgia(),
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
  if (!gridCirurgias.editando) renderCirurgias();
  if (!digitandoEm($('#bloco-lembretes'))) renderLembretes();
  if (detalhesAbertos.recall && !gridRecall.editando) gridRecall.render();
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
  // no badge só o que ainda precisa de ação neste mês (revisão já realizada não conta)
  badge(
    '#badge-cirurgias',
    (revisoesPorMes().get(isoHoje().slice(0, 7)) || []).filter(({ px }) => px.status !== 'Realizada').length,
  );
  badge('#badge-lembretes', reminders.vencidos().length);
  atualizarSino();
}

function ajustarBarraFixa() {
  const topo = $('.topo');
  if (topo) document.documentElement.style.setProperty('--topo-h', topo.offsetHeight + 'px');
}

/* ---------- fonte do sistema (preferência da Helen, salva no Mac) ---------- */

function aplicarFonte(id) {
  const f = FONTES_APP.find((x) => x.id === id) || FONTES_APP[0];
  document.documentElement.style.setProperty('--fonte-app', f.stack);
  try {
    localStorage.setItem(FONTE_KEY, f.id);
  } catch (_) {}
  return f;
}

function initFonte() {
  const sel = $('#sel-fonte');
  if (!sel) return;
  // cada opção renderiza no próprio tipo de letra — ela vê a prévia ao abrir
  sel.innerHTML = FONTES_APP.map(
    (f) => `<option value="${f.id}" style="font-family:${f.stack.replace(/"/g, '&quot;')}">${esc(f.label)}</option>`,
  ).join('');
  let salva = FONTES_APP[0].id;
  try {
    salva = localStorage.getItem(FONTE_KEY) || salva;
  } catch (_) {}
  sel.value = salva;
  aplicarFonte(salva);
  sel.addEventListener('change', () => {
    const f = aplicarFonte(sel.value);
    ajustarBarraFixa();
    showToast(`fonte: ${f.label} — fica salva neste Mac`);
  });
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

/**
 * Revisões por mês ('yyyy-mm'), de TODOS os anos da planilha.
 * Conta cada marco com data (não só o próximo), para que uma paciente de 2025
 * com 03m/06m/1a apareça em cada um dos meses correspondentes.
 */
function revisoesPorMes() {
  const mapa = new Map();
  for (const c of store.cirurgiasPassadas()) {
    if (!String(c.paciente || '').trim()) continue;
    for (const m of store.marcosDe(c)) {
      if (!m.dataISO) continue;
      const chave = m.dataISO.slice(0, 7);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push({ c, px: m });
    }
  }
  return mapa;
}

/** anos com cirurgia real na planilha (data da coluna Data — não revisões) */
function anosCirurgias() {
  const anos = new Set();
  for (const c of store.cirurgias) {
    if (!String(c.paciente || '').trim()) continue;
    const iso = parseDataPt(c.data);
    if (iso) anos.add(iso.slice(0, 4));
  }
  return [...anos].sort();
}

function garantirAnoCirurgias() {
  const anos = anosCirurgias();
  if (!anos.length) {
    anoCirurgias = '';
    return;
  }
  if (anoCirurgias && anos.includes(anoCirurgias)) return;
  const hoje = isoHoje().slice(0, 4);
  anoCirurgias = anos.includes(hoje) ? hoje : anos[anos.length - 1];
}

function cirurgiasVisiveis() {
  let rows = store.cirurgias.filter((c) => String(c.paciente || '').trim());
  if (anoCirurgias) rows = rows.filter((c) => parseDataPt(c.data)?.startsWith(anoCirurgias));
  rows.sort((a, b) => {
    const ra = a.row ?? Number.MAX_SAFE_INTEGER;
    const rb = b.row ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const da = parseDataPt(a.data) || '9999-99-99';
    const db = parseDataPt(b.data) || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return rows;
}

function renderFiltrosAnoCirurgias() {
  const el = $('#filtros-cirurgias');
  if (!el) return;
  garantirAnoCirurgias();
  const anos = anosCirurgias();
  if (!anos.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = anos
    .map((a) => {
      const n = store.cirurgias.filter((c) => {
        if (!String(c.paciente || '').trim()) return false;
        return parseDataPt(c.data)?.startsWith(a);
      }).length;
      return `<button type="button" class="filtro ${a === anoCirurgias ? 'ativo' : ''}" data-ano="${a}">${a} <span class="n">${n}</span></button>`;
    })
    .join('');
  el.querySelectorAll('[data-ano]').forEach((b) =>
    b.addEventListener('click', () => {
      anoCirurgias = b.dataset.ano;
      renderCirurgias();
    }),
  );
}

function renderCirurgias() {
  renderFiltrosAnoCirurgias();
  gridCirurgias.busca = buscaCirurgias;
  gridCirurgias.render();
}

/* ---------- LEMBRETES (fiel ao app Lembretes do Mac/iOS) ---------- */

/** cabeçalho de seção por data — "Hoje", "Amanhã", "seg., 24 de ago." (vermelho se vencida) */
function secaoLembrete(iso) {
  const dd = difDias(iso);
  if (dd === 0) return { texto: 'Hoje', vencida: false };
  if (dd === 1) return { texto: 'Amanhã', vencida: false };
  const d = paraData(iso);
  const texto = d
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
  return { texto, vencida: dd < 0 };
}

/** linha de meta sob o título: hora + repetição (a data é o cabeçalho da seção) */
function metaLembrete(l) {
  const partes = [];
  if (l.hora) partes.push(`<span>${esc(l.hora)}</span>`);
  if (l.repetir && l.repetir !== 'nunca') {
    partes.push(`<span>↻ ${esc(repeticaoDe(l.repetir).label)}</span>`);
  }
  return partes.join('');
}

function lembreteHtml(l) {
  const prio = prioridadeDe(l.prioridade);
  const meta = metaLembrete(l);
  return `<div class="lem ${l.feito ? 'feito' : ''}" data-lem="${l.id}">
    <button type="button" class="lem-check" data-lem-check="${l.id}" title="${l.feito ? 'reabrir' : l.repetir !== 'nunca' && l.dataISO ? 'concluir — remarca para a próxima data' : 'concluir'}"><svg viewBox="0 0 12 10" aria-hidden="true"><path d="M1 5.4 4.3 8.7 11 1.3"/></svg></button>
    <div class="lem-corpo" data-lem-edit="${l.id}" title="toque para editar prioridade, data e repetição">
      <div class="lem-titulo">${prio.sinais ? `<span class="lem-prio">${prio.sinais}</span>` : ''}<span>${esc(l.titulo)}</span></div>
      ${meta ? `<div class="lem-meta">${meta}</div>` : ''}
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

  // agrupa por data — seções "Hoje", "Amanhã", "seg., 24 de ago." como no app do Mac
  const secoes = [];
  let grupo = null;
  for (const l of abertos) {
    const chave = l.dataISO || '';
    if (!grupo || grupo.chave !== chave) {
      grupo = { chave, itens: [] };
      secoes.push(grupo);
    }
    grupo.itens.push(l);
  }

  el.innerHTML = secoes.length
    ? secoes
        .map((g) => {
          const sec = g.chave ? secaoLembrete(g.chave) : { texto: 'Sem data', vencida: false };
          return `<div class="lem-grupo">
            <div class="lem-secao ${sec.vencida ? 'vencida' : ''}">${esc(sec.texto)}</div>
            ${g.itens.map(lembreteHtml).join('')}
          </div>`;
        })
        .join('')
    : `<div class="vazio"><strong>nenhum lembrete</strong>escreva acima e tecle Enter — como no app Lembretes</div>`;

  const rodape = $('#lem-rodape');
  const toggle = $('#lem-toggle-feitos');
  const caixa = $('#linhas-lembretes-feitos');
  if (feitos.length) {
    rodape.hidden = false;
    toggle.textContent = `${feitosVisiveis ? '▾' : '▸'} concluídos (${feitos.length})`;
    caixa.hidden = !feitosVisiveis;
    caixa.innerHTML = feitosVisiveis ? `<div class="lem-grupo">${feitos.map(lembreteHtml).join('')}</div>` : '';
  } else {
    rodape.hidden = true;
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

/** atalhos de data no editor — 1 toque em vez de abrir o calendário */
function renderAtalhosLembrete() {
  const el = $('#lem-atalhos');
  if (!el) return;
  const opcoes = [
    ['hoje', isoHoje()],
    ['amanhã', somarDias(isoHoje(), 1)],
    ['em 3 dias', somarDias(isoHoje(), 3)],
    ['próxima semana', somarDias(isoHoje(), 7)],
    ['em 1 mês', somarDias(isoHoje(), 30)],
  ];
  const atual = $('#lem-data')?.value || '';
  el.innerHTML =
    opcoes
      .map(
        ([rotulo, iso]) =>
          `<button type="button" class="lem-atalho ${atual === iso ? 'ativo' : ''}" data-lem-data="${iso}">${rotulo}</button>`,
      )
      .join('') + `<button type="button" class="lem-atalho ${atual ? '' : 'ativo'}" data-lem-data="">sem data</button>`;
  el.querySelectorAll('[data-lem-data]').forEach((b) =>
    b.addEventListener('click', () => {
      $('#lem-data').value = b.dataset.lemData;
      renderAtalhosLembrete();
    }),
  );
}

/** abre a folha de detalhes — sem id = modo "novo lembrete" (cria ao salvar) */
function abrirLembrete(id, base = {}) {
  const l = id ? reminders.get(id) : null;
  lembreteAtual = l ? id : null;
  $('#lem-titulo').value = l ? l.titulo : base.titulo || '';
  $('#lem-notas').value = l?.notas ?? base.notas ?? '';
  $('#lem-prio').value = l?.prioridade || base.prioridade || 'nenhuma';
  $('#lem-repetir').value = l?.repetir || base.repetir || 'nunca';
  $('#lem-data').value = l?.dataISO ?? base.dataISO ?? '';
  $('#lem-hora').value = l?.hora ?? base.hora ?? '';
  renderAtalhosLembrete();
  const novo = !l;
  const h3 = $('#veu-lembrete h3');
  if (h3) h3.innerHTML = `${novo ? 'novo lembrete' : 'lembrete'}<span class="ponto">.</span>`;
  const btnExcluir = $('#btn-lem-excluir');
  if (btnExcluir) btnExcluir.textContent = novo ? 'cancelar' : 'excluir';
  const btnIcs = $('#btn-lem-ics');
  if (btnIcs) btnIcs.style.display = novo ? 'none' : '';
  abrir('veu-lembrete');
  setTimeout(() => $('#lem-titulo')?.focus(), 60);
}

function salvarLembrete() {
  const titulo = $('#lem-titulo').value.trim();
  if (!titulo) {
    showToast('dê um título ao lembrete');
    $('#lem-titulo')?.focus();
    return;
  }
  const dados = {
    titulo,
    notas: $('#lem-notas').value.trim(),
    prioridade: $('#lem-prio').value,
    repetir: $('#lem-repetir').value,
    dataISO: $('#lem-data').value,
    hora: $('#lem-hora').value,
  };
  const editando = lembreteAtual && reminders.get(lembreteAtual);
  if (editando) reminders.atualizar(lembreteAtual, dados);
  else reminders.adicionar(dados);
  lembreteAtual = null;
  fechar('veu-lembrete');
  showToast(editando ? 'lembrete salvo' : 'lembrete criado');
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

/* ---------- CENTRAL DE NOTIFICAÇÕES (sino) ---------- */

/** lembretes que pedem atenção: vencidos, de hoje e os próximos 2 dias */
function lembretesDoSino() {
  const limite = somarDias(isoHoje(), 2);
  return reminders.lista
    .filter((l) => !l.feito && l.dataISO && l.dataISO <= limite)
    .sort((a, b) => (a.dataISO < b.dataISO ? -1 : a.dataISO > b.dataISO ? 1 : (a.hora || '') < (b.hora || '') ? -1 : 1));
}

function atualizarSino() {
  const badge = $('#sino-badge');
  if (!badge) return;
  const n = reminders.vencidos().length;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.hidden = !n;
  $('#btn-sino')?.classList.toggle('tocando', n > 0);
  if (!$('#painel-sino')?.hidden) renderSino();
}

function renderSino() {
  const lista = $('#sino-lista');
  if (!lista) return;
  const perm = $('#sino-permissao');
  if (perm) perm.hidden = !('Notification' in window) || Notification.permission !== 'default';

  const itens = lembretesDoSino();
  lista.innerHTML = itens.length
    ? itens
        .map((l) => {
          const dd = difDias(l.dataISO);
          const quando = dd < 0 ? `atrasado ${Math.abs(dd)}d` : dd === 0 ? 'hoje' : dd === 1 ? 'amanhã' : fmt(l.dataISO);
          const prio = prioridadeDe(l.prioridade);
          return `<div class="sino-item ${dd <= 0 ? 'urgente' : ''}">
            <button type="button" class="lem-check" data-sino-check="${l.id}" title="concluir"><svg viewBox="0 0 12 10" aria-hidden="true"><path d="M1 5.4 4.3 8.7 11 1.3"/></svg></button>
            <div class="sino-corpo" data-sino-abrir="${l.id}">
              <div class="sino-titulo">${prio.sinais ? `<span class="lem-prio">${prio.sinais}</span>` : ''}${esc(l.titulo)}</div>
              <div class="sino-meta">${esc(quando)}${l.hora ? ' · ' + esc(l.hora) : ''}</div>
            </div>
            <button type="button" class="sino-adiar" data-sino-adiar="${l.id}" title="adiar para amanhã">adiar</button>
          </div>`;
        })
        .join('')
    : `<div class="sino-vazio">nada para agora — seus lembretes estão em dia ✓</div>`;

  lista.querySelectorAll('[data-sino-check]').forEach((b) =>
    b.addEventListener('click', () => {
      reminders.alternarFeito(b.dataset.sinoCheck);
      showToast('lembrete concluído ✓');
    }),
  );
  lista.querySelectorAll('[data-sino-adiar]').forEach((b) =>
    b.addEventListener('click', () => {
      const l = reminders.get(b.dataset.sinoAdiar);
      if (!l) return;
      reminders.atualizar(l.id, { dataISO: somarDias(l.dataISO || isoHoje(), 1) });
      showToast('adiado para amanhã');
    }),
  );
  lista.querySelectorAll('[data-sino-abrir]').forEach((c) =>
    c.addEventListener('click', () => {
      fecharSino();
      abrirLembrete(c.dataset.sinoAbrir);
    }),
  );
}

function abrirSino() {
  const p = $('#painel-sino');
  if (!p) return;
  p.hidden = false;
  renderSino();
}

function fecharSino() {
  const p = $('#painel-sino');
  if (p) p.hidden = true;
}

/* ---------- ASSISTENTE / SUPORTE ---------- */

const SUGESTOES_SUPORTE = [
  'como faço para cadastrar uma paciente nova?',
  'o que eu falo para quem não respondeu?',
  'como marcar a revisão de 6 meses?',
  'o que preciso fazer hoje?',
];

/** contexto curto da operação — deixa a resposta do Gemini específica, não genérica */
function contextoOperacao() {
  const g = resumoGestao();
  const hojeRecall = store.recallsVencidos().slice(0, 12).map((r) => `${r.nome} (${r.status || 'sem status'})`);
  const proximas = store
    .cirurgiasFuturas()
    .slice(0, 6)
    .map(({ c, iso }) => `${c.paciente}: ${c.cirurgia || 'cirurgia'} em ${fmt(iso)}`);
  const revMes = (revisoesPorMes().get(isoHoje().slice(0, 7)) || [])
    .filter(({ px }) => px.status !== 'Realizada')
    .slice(0, 10)
    .map(({ c, px }) => `${c.paciente}: revisão ${px.label} em ${fmt(px.dataISO)} (${px.status})`);
  const lembretes = lembretesDoSino().slice(0, 8).map((l) => `${l.titulo} (${l.dataISO})`);
  return {
    hoje: isoHoje(),
    recallTotal: g.total,
    recallPorStatus: g.porStatus,
    pacientesParaContatarHoje: hojeRecall,
    cirurgiasProximas: proximas,
    revisoesDoMes: revMes,
    lembretes,
  };
}

const AJUDA_SISTEMA = `Como o sistema funciona (use para responder dúvidas de uso):
- Barra do topo: botões recall, cirurgias & revisões e lembretes levam direto à seção.
- Recall: lista espelhada da planilha GESTÃO DE RECALL. Editar status, próximo contato e observações salva sozinho no Google Sheets. Botão "registrar" abre a janela de registrar contato. "＋ nova paciente" cadastra na planilha.
- Cirurgias & revisões: régua de anos e meses mostra quem tem revisão em cada mês; o seletor "ordem" alterna entre a ordem da planilha e a ordem por data. O status da revisão (Pendente/Marcada/Realizada/Sem resposta) salva nas colunas 03m/06m/1a.
- Lembretes: escreva algo como "ligar pra Ana amanhã 14h !!" que o sistema entende data, hora e prioridade. O sino no topo mostra o que vence hoje, permite concluir e adiar.
- Botão WhatsApp verde abre a conversa com a paciente com mensagem pronta.
- "exportar XLSX" baixa backup; "resumo para gestão" gera o relatório do Dr. Rafael.
- Suporte humano: Rafael no WhatsApp (botão nesta janela).`;

function renderConversaSuporte() {
  const box = $('#sup-conversa');
  if (!box) return;
  box.innerHTML = conversaSuporte
    .map(
      (m) =>
        `<div class="sup-msg ${m.autor}">${m.carregando ? '<span class="spinner spinner-inline"></span> pensando…' : esc(m.texto).replace(/\n/g, '<br>')}</div>`,
    )
    .join('');
  box.scrollTop = box.scrollHeight;
}

async function perguntarSuporte(pergunta) {
  const texto = String(pergunta || '').trim();
  if (!texto) return;
  conversaSuporte.push({ autor: 'helen', texto });
  const pendente = { autor: 'bot', texto: '', carregando: true };
  conversaSuporte.push(pendente);
  renderConversaSuporte();
  $('#sup-sugestoes').hidden = true;

  if (!gemini.configured) {
    pendente.carregando = false;
    pendente.texto =
      'Ainda não tenho a chave do Gemini configurada aqui.\n' +
      'Peça ao Rafael para colar a chave em “conectar planilhas” (é grátis, em aistudio.google.com/apikey).\n' +
      'Enquanto isso, é só chamar ele no WhatsApp pelo botão abaixo. 💙';
    renderConversaSuporte();
    return;
  }

  try {
    const resposta = await gemini.gerar(
      `Pergunta da Helen: ${texto}\n\n${AJUDA_SISTEMA}\n\nSituação de hoje (JSON):\n${JSON.stringify(contextoOperacao(), null, 2)}`,
      {
        sistema:
          PAPEL_CONCIERGE +
          ' Você também é o suporte do sistema blue. Central. Responda em no máximo 6 linhas, ' +
          'com passo a passo quando for dúvida de uso. Se for algo que só o Rafael resolve ' +
          '(erro técnico, planilha fora do ar, senha), diga para chamá-lo no botão do WhatsApp.',
        temperatura: 0.3,
        maxTokens: 700,
      },
    );
    pendente.carregando = false;
    pendente.texto = resposta;
  } catch (e) {
    pendente.carregando = false;
    pendente.texto = `Não consegui responder agora (${e.message}).\nChame o Rafael no WhatsApp pelo botão abaixo. 💙`;
  }
  renderConversaSuporte();
}

function abrirSuporte() {
  const sug = $('#sup-sugestoes');
  if (sug) {
    sug.hidden = conversaSuporte.length > 0;
    sug.innerHTML = SUGESTOES_SUPORTE.map((s) => `<button type="button" class="sup-chip">${esc(s)}</button>`).join('');
    sug.querySelectorAll('.sup-chip').forEach((b) =>
      b.addEventListener('click', () => perguntarSuporte(b.textContent)),
    );
  }
  renderConversaSuporte();
  abrir('veu-suporte');
  setTimeout(() => $('#sup-campo')?.focus(), 60);
}

/* ---------- ANÁLISE DO RECALL (Gemini) ---------- */

async function analisarRecall() {
  resumoAtual = null; // não é resumo de paciente — evita "inserir em observações" na linha errada
  abrir('veu-resumo');
  $('#resumo-sub').textContent = 'recall — o que fazer hoje';
  $('#resumo-conteudo').innerHTML = '<div class="loading-state"><span class="spinner"></span> a assistente está lendo o recall…</div>';
  resumoTexto = '';

  if (!gemini.configured) {
    $('#resumo-conteudo').innerHTML =
      `<div class="vazio"><strong>Gemini ainda não conectado</strong>cole a chave grátis em “conectar planilhas” (aistudio.google.com/apikey) para a assistente analisar o recall</div>`;
    return;
  }

  const recall = store.recall
    .filter((r) => String(r.nome || '').trim())
    .slice(0, 120)
    .map((r) => ({
      nome: r.nome,
      status: r.status,
      ultimaConsulta: r.ultimaConsulta,
      dataContato: r.dataContato,
      proximoContato: r.proximoContato,
      motivoRecusa: r.motivoRecusa,
      obs: (r.obs || '').slice(0, 220),
    }));

  try {
    resumoTexto = await gemini.gerar(
      'Analise a carteira de recall abaixo e responda em 4 blocos curtos:\n' +
        '1) PRIORIDADE DE HOJE — até 6 pacientes para contatar agora e o motivo de cada uma;\n' +
        '2) O QUE ESTÁ TRAVANDO — padrões nas observações (preço, viagem, indecisão, sem resposta);\n' +
        '3) MENSAGEM SUGERIDA — um texto curto de WhatsApp para o grupo mais numeroso;\n' +
        '4) ARRUMAR NA PLANILHA — linhas com dado faltando ou status estranho.\n' +
        `Hoje é ${isoHoje()}.\n\nRecall (JSON):\n${JSON.stringify(recall, null, 2)}`,
      { sistema: PAPEL_CONCIERGE, temperatura: 0.4, maxTokens: 1400 },
    );
    $('#resumo-sub').textContent = `recall · ${recall.length} pacientes · Gemini ${gemini.modeloEmUso.replace('gemini-', '')}`;
    $('#resumo-conteudo').innerHTML = `<pre class="resumo-texto">${esc(resumoTexto)}</pre>`;
  } catch (e) {
    $('#resumo-conteudo').innerHTML = `<div class="vazio"><strong>não consegui analisar</strong>${esc(e.message)}</div>`;
  }
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
  const numeros = {
    totalRecall: g.total,
    porStatus: g.porStatus,
    cirurgias: g.cirurgias,
    preop: g.preop,
    revisoes: { realizadas: g.revRealizadas, marcadas: g.revMarcadas, aAgendar: g.revVencidas },
    motivos: Object.fromEntries(g.motivos),
    gargalos: { semResposta: g.gargaloSemResposta, aguardando: g.gargaloAguardando },
  };
  const alvo = $('#gestao-gemini');
  if (!alvo) return;

  const mostrar = (texto) => {
    const el = $('#gestao-gemini');
    if (el) el.innerHTML = texto ? `✨ <b>Análise Gemini:</b> ${esc(texto)}` : '';
  };

  if (gemini.configured) {
    alvo.innerHTML = '<span class="spinner spinner-inline"></span> análise Gemini…';
    gemini
      .gerar(
        'Escreva 3 frases para o Dr. Rafael sobre a operação do recall: o que está bom, ' +
          'o principal gargalo e a recomendação da semana. Sem saudação, direto ao ponto.\n\n' +
          JSON.stringify(numeros, null, 2),
        { sistema: PAPEL_CONCIERGE, temperatura: 0.45, maxTokens: 500 },
      )
      .then(mostrar)
      .catch(() => mostrar(''));
  } else if (syncService.api.configured) {
    alvo.innerHTML = '<span class="spinner spinner-inline"></span> análise Gemini…';
    syncService.api
      .summarize({ _tipo: 'gestao', ...numeros })
      .then((r) => mostrar(r.text))
      .catch(() => mostrar(''));
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
      <button type="button" class="btn btn-claro" id="btn-ficha-lembrete">⏰ criar lembrete</button>
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
  $('#btn-ficha-lembrete')?.addEventListener('click', () => {
    fechar('veu-ficha');
    abrirLembrete(null, {
      titulo: `Falar com ${primeiroNome(p.nome)}`,
      notas: p.telefone ? formatPhoneDisplay(p.telefone) : '',
      dataISO: somarDias(isoHoje(), 1),
    });
  });
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

/* ---------- NOVA CIRURGIA (processo completo no app) ---------- */

function abrirNovaCirurgia() {
  $('#nc-nome').value = '';
  $('#nc-fone').value = '';
  $('#nc-data').value = isoHoje();
  $('#nc-cirurgia').value = '';
  $('#nc-hospital').value = '';
  $('#nc-recall').checked = true;
  const tplEl = $('#nc-template');
  if (tplEl) {
    const padrao = store.appConfig.templates.find((t) => t.padrao)?.id || '';
    tplEl.innerHTML = store.appConfig.templates
      .map((t) => `<option value="${t.id}" ${t.padrao ? 'selected' : ''}>${esc(t.nome)}${t.padrao ? ' (padrão)' : ''}</option>`)
      .join('');
    tplEl.value = padrao;
  }
  abrir('veu-nova-cirurgia');
  setTimeout(() => $('#nc-nome')?.focus(), 60);
}

function salvarNovaCirurgia() {
  const nome = $('#nc-nome').value.trim();
  if (!nome) {
    showToast('informe o nome da paciente');
    $('#nc-nome')?.focus();
    return;
  }
  const cirurgia = $('#nc-cirurgia').value.trim();
  if (!cirurgia) {
    showToast('informe o procedimento');
    $('#nc-cirurgia')?.focus();
    return;
  }
  const iso = $('#nc-data').value || isoHoje();
  const fone = $('#nc-fone').value.trim();
  const tplId = $('#nc-template')?.value || '';
  const padrao = store.appConfig.templates.find((t) => t.padrao)?.id || '';
  const criarRecall = $('#nc-recall')?.checked && fone;

  buscaCirurgias = '';
  const buscaEl = $('#busca-cirurgias');
  if (buscaEl) buscaEl.value = '';

  const linha = store.adicionarLinha('cirurgias', {
    paciente: nome,
    cirurgia,
    hospital: $('#nc-hospital').value.trim(),
    data: fmtDataPlanilhaCirurgias(iso),
  });

  const pKey = patientKey(nome);
  if (tplId && tplId !== padrao) store.atribuirTemplate(pKey, tplId);

  if (criarRecall) {
    store.adicionarLinha('recall', {
      nome,
      contato: fone,
      status: 'Pendente',
      dataContato: fmtDataPlanilhaRecall(isoHoje()),
    });
  }

  ultimaNovaCirurgiaKey = linha.key;
  anoCirurgias = iso.slice(0, 4);
  renderCirurgias();
  fechar('veu-nova-cirurgia');
  requestAnimationFrame(() => {
    document
      .querySelector(`#grid-cirurgias tr[data-row="${linha.key}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  setTimeout(() => {
    if (ultimaNovaCirurgiaKey === linha.key) ultimaNovaCirurgiaKey = '';
  }, 2600);

  const futura = difDias(iso) >= 0;
  showToast(
    syncService.configured
      ? `${nome} — ${futura ? 'pré-op' : 'pós-op'} salva · enviando para o Google Sheets…`
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
  $('#cfg-gemini').value = store.config.geminiApiKey || '';
  $('#cfg-gemini-modelo').innerHTML = MODELOS_GEMINI.map(
    (m) => `<option value="${m.id}" ${store.config.geminiModel === m.id ? 'selected' : ''}>${esc(m.label)}</option>`,
  ).join('');

  $('#btn-testar-gemini')?.addEventListener('click', async () => {
    const status = $('#cfg-gemini-status');
    const teste = new GeminiApi({
      apiKey: $('#cfg-gemini').value.trim(),
      modelo: $('#cfg-gemini-modelo').value,
    });
    status.className = 'campo-hint';
    status.textContent = 'testando…';
    try {
      const r = await teste.testar();
      status.className = 'campo-ok';
      status.textContent = `✓ chave válida — ${r.modelo || 'modelo disponível'}`;
    } catch (e) {
      status.className = 'campo-hint';
      status.textContent = '✕ ' + e.message;
    }
  });

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
      geminiApiKey: $('#cfg-gemini').value.trim(),
      geminiModel: $('#cfg-gemini-modelo').value,
    });
    store.persistConfig();
    gemini.configurar({ apiKey: store.config.geminiApiKey, modelo: store.config.geminiModel });
    try {
      await syncService.configure(store.config);
      summaryService.setSheetsApi(syncService.api);
      atualizarLinksPlanilhas();
      fechar('veu-config');
      showToast(
        gemini.configured
          ? 'planilhas conectadas · assistente Gemini ativa'
          : 'planilhas conectadas — sync automático ativo',
      );
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
  initFonte();

  // suporte: assistente responde na hora; o Rafael fica a um clique
  const waSuporte = buildWhatsAppLink(
    SUPORTE_WHATSAPP,
    'Olá! Aqui é a Helen, da blue. Preciso de ajuda com a central da concierge.',
  );
  const btnWaSup = $('#btn-sup-wa');
  if (btnWaSup) btnWaSup.href = waSuporte;
  const lnkSup = $('#lnk-suporte');
  if (lnkSup) lnkSup.href = waSuporte;
  $('#btn-suporte')?.addEventListener('click', abrirSuporte);
  $('#btn-sup-fechar')?.addEventListener('click', () => fechar('veu-suporte'));
  $('#btn-sup-enviar')?.addEventListener('click', () => {
    const campo = $('#sup-campo');
    perguntarSuporte(campo.value);
    campo.value = '';
  });
  $('#sup-campo')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      perguntarSuporte(e.target.value);
      e.target.value = '';
    }
  });

  // análise do recall com a assistente
  $('#btn-analisar-recall')?.addEventListener('click', analisarRecall);

  // sino de notificações
  $('#btn-sino')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if ($('#painel-sino').hidden) abrirSino();
    else fecharSino();
  });
  $('#btn-sino-fechar')?.addEventListener('click', fecharSino);
  $('#btn-sino-ir')?.addEventListener('click', () => {
    fecharSino();
    document.getElementById('bloco-lembretes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#btn-sino-permitir')?.addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      showToast(perm === 'granted' ? 'avisos ativados — vou te chamar na hora do lembrete' : 'avisos não autorizados pelo navegador');
    } catch (_) {}
    atualizarBotaoNotif();
    renderSino();
  });
  document.addEventListener('click', (e) => {
    if (!$('#painel-sino')?.hidden && !e.target.closest('#painel-sino') && !e.target.closest('#btn-sino')) {
      fecharSino();
    }
  });

  // lembretes — ⊕ abre a fichinha; Enter já interpreta "amanhã 14h !!" e salva
  $('#lem-add-btn')?.addEventListener('click', () => abrirLembrete());
  $('#lem-novo')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    const lido = interpretarLembrete(e.target.value);
    e.target.value = '';
    // com data/hora reconhecidas, salva direto; sem nada reconhecido, abre a ficha para completar
    if (lido.dataISO || lido.hora || lido.prioridade !== 'nenhuma' || lido.repetir !== 'nunca') {
      reminders.adicionar(lido);
      renderLembretes(); // o guard digitandoEm pula o render enquanto o input tem foco
      const quando = lido.dataISO ? `${difDias(lido.dataISO) === 0 ? 'hoje' : fmt(lido.dataISO)}${lido.hora ? ' às ' + lido.hora : ''}` : 'sem data';
      showToast(`lembrete criado — ${quando}`);
    } else {
      renderLembretes();
      abrirLembrete(null, { titulo: lido.titulo });
    }
  });
  $('#lem-novo')?.addEventListener('input', (e) => {
    const dica = $('#lem-dica-parse');
    if (!dica) return;
    const lido = interpretarLembrete(e.target.value);
    const partes = [];
    if (lido.dataISO) partes.push(difDias(lido.dataISO) === 0 ? 'hoje' : fmt(lido.dataISO));
    if (lido.hora) partes.push(lido.hora);
    if (lido.prioridade !== 'nenhuma') partes.push(prioridadeDe(lido.prioridade).sinais);
    if (lido.repetir !== 'nunca') partes.push('↻ ' + repeticaoDe(lido.repetir).label);
    dica.textContent = partes.length ? `entendi: ${lido.titulo} · ${partes.join(' · ')}` : '';
    dica.hidden = !partes.length;
  });
  $('#lem-toggle-feitos')?.addEventListener('click', () => {
    feitosVisiveis = !feitosVisiveis;
    renderLembretes();
  });
  $('#lem-limpar-feitos')?.addEventListener('click', () => {
    const n = reminders.lista.filter((l) => l.feito).length;
    if (!n) return;
    if (!confirm(`Apagar definitivamente ${n} lembrete(s) concluído(s)?`)) return;
    reminders.limparConcluidos();
    showToast('concluídos apagados');
  });
  $('#btn-lem-salvar')?.addEventListener('click', salvarLembrete);
  $('#btn-lem-excluir')?.addEventListener('click', () => {
    if (!lembreteAtual) {
      fechar('veu-lembrete'); // modo "novo" → o botão é "cancelar"
      return;
    }
    reminders.remover(lembreteAtual);
    lembreteAtual = null;
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

  // ver detalhes (planilha recall oculta por padrão)
  [['recall', gridRecall]].forEach(([tipo, grid]) => {
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
    renderCirurgias();
    $('#busca-cirurgias').focus();
  });

  // atenção do mês
  $('#btn-atencao-mes')?.addEventListener('click', () => {
    atencaoMes = !atencaoMes;
    $('#btn-atencao-mes').classList.toggle('ativo', atencaoMes);
    renderLinhasRecall();
    showToast(atencaoMes ? 'mostrando só quem precisa de atenção este mês no recall' : 'mostrando todas');
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
  $('#btn-nova-cirurgia')?.addEventListener('click', abrirNovaCirurgia);
  $('#btn-salvar-nova-cirurgia')?.addEventListener('click', salvarNovaCirurgia);

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
      const blocoCir = document.getElementById('bloco-cirurgias');
      const noCir = blocoCir && blocoCir.getBoundingClientRect().top < window.innerHeight * 0.45;
      (noCir ? $('#busca-cirurgias') : $('#busca-recall'))?.focus();
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
